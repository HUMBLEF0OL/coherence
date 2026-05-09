/**
 * Stop orchestrator state machine — TS-2 §2.5 steps 1–15.
 * FR-STOP-1..12, -15..21
 */
import type {
  CoherencePlan,
  StopProgressGroup,
  SectionIndexEntry,
} from '../types/index.js';
import type { StateStore } from '../state/stateStore.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import { groupEntries } from './grouping.js';
import { enforceCaps } from './caps.js';
import { runStage1 } from './stage1.js';
import { runStage2 } from './stage2.js';
import type { Stage2SectionInput } from './stage2.js';
import { mergePatches } from './merge.js';
import { assembleBundle } from './bundle.js';
import type { PatchBundle } from './bundle.js';
import { Checkpoint } from './checkpoint.js';
import { CostLedger } from '../llm/costLedger.js';
import { validatePlan, buildIndependentFallback } from '../validation/planValidator.js';
import { preflight, checkUnrelatedChanges, stageFiles, createCommit } from '../git/adapter.js';
import { buildCommitMessage } from '../git/coherenceCommit.js';
import { appendCoherenceLog } from '../state/coherenceLog.js';

export interface StopOrchestratorOptions {
  sessionId: string;
  projectRoot: string;
  store: StateStore;
  sectionIndex: SectionIndexEntry[];
  projectFileContents: string[];
  mode: 'observe' | 'graduated';
}

export interface StopOrchestratorResult {
  bundles: PatchBundle[];
  deferred: number;
  cost_usd: number;
  notices: string[];
}

export async function runStopOrchestrator(
  opts: StopOrchestratorOptions,
): Promise<StopOrchestratorResult> {
  const { sessionId, projectRoot, store, sectionIndex, projectFileContents, mode } = opts;
  const notices: string[] = [];

  // Step 1: Read buffer
  const lifecycle = new BufferLifecycle(store);
  const buf = await lifecycle.read();

  // FR-BUFFER-1: Empty buffer → no-op
  if (buf.entries.length === 0) {
    return { bundles: [], deferred: 0, cost_usd: 0, notices: ['No pending drift — buffer is empty'] };
  }

  // Step 2: Git pre-flight
  const preflightResult = preflight(projectRoot);
  if (!preflightResult.ok) {
    notices.push(`Git pre-flight failed: ${preflightResult.reason} — deferring all sections`);
    return { bundles: [], deferred: buf.entries.length, cost_usd: 0, notices };
  }
  if (preflightResult.warning) {
    notices.push(`Git warning: ${preflightResult.warning}`);
  }

  // Step 3: Group entries by triggering_files overlap
  const groups = groupEntries(buf.entries);

  // Step 4: Enforce caps (DD-056)
  const { allowed, deferredSectionCount } = enforceCaps(groups);
  if (deferredSectionCount > 0) {
    notices.push(`${deferredSectionCount} section(s) deferred (cap limit reached)`);
  }

  // Step 5: Init checkpoint
  const checkpoint = new Checkpoint(store, sessionId);
  const existingProgress = await checkpoint.load();

  const costLedger = new CostLedger(store, sessionId);
  const bundles: PatchBundle[] = [];

  for (const group of allowed) {
    // Check for resume: skip already-done sections
    const pendingSectionRefs = existingProgress
      ? checkpoint.pendingSections(existingProgress, group.group_id)
      : null;

    // Init checkpoint group if starting fresh
    if (!existingProgress) {
      const progressGroups: StopProgressGroup[] = allowed.map((g) => ({
        group_id: g.group_id,
        canonical: g.entries[0]!.sectionRef,
        sections: g.entries.map((e) => ({
          sectionRef: e.sectionRef,
          status: 'pending' as const,
        })),
      }));
      await checkpoint.init(progressGroups);
    }

    // Step 6: Run Stage 1 (FR-STOP-2: single-section skips Stage 1)
    let plan: CoherencePlan | null = await runStage1(group, sectionIndex, costLedger);

    if (!plan) {
      notices.push(`Stage 1 returned null for group ${group.group_id} — using independent fallback`);
      const fallbacks = buildIndependentFallback(group.entries.map((e) => e.sectionRef));
      plan = fallbacks[0] ?? null;
    } else {
      // Step 7: Validate plan
      const expectedRefs = group.entries.map((e) => e.sectionRef);
      const validation = validatePlan(plan, expectedRefs);
      if (!validation.valid) {
        notices.push(`Plan invalid for group ${group.group_id}: ${validation.reason} — fallback to independent`);
        const fallbacks = buildIndependentFallback(expectedRefs);
        plan = fallbacks[0] ?? null;
      }
    }

    if (!plan) continue;

    // Step 8: Build Stage 2 inputs
    const stage2Inputs: Stage2SectionInput[] = group.entries
      .filter((e) => !pendingSectionRefs || pendingSectionRefs.includes(e.sectionRef))
      .map((e) => {
        const indexed = sectionIndex.find((s) => s.sectionRef === e.sectionRef);
        const planSection = plan!.sections.find((s) => s.sectionRef === e.sectionRef);
        return {
          sectionRef: e.sectionRef,
          role: planSection?.role ?? 'canonical',
          relation: planSection?.relation ?? null,
          heading: indexed?.heading ?? null,
          current_content: '',
          canonical_content: null,
          changed_tokens: [],
          layer: 'referring-doc' as const,
        };
      });

    // Step 9: Run Stage 2
    const stage2Results = await runStage2(
      plan,
      stage2Inputs,
      costLedger,
      projectRoot,
      projectFileContents,
    );

    // Step 10: Checkpoint each result
    for (const result of stage2Results) {
      await checkpoint.markDone(group.group_id, result.patch.sectionRef, result.patch);
    }

    // Step 11: Merge patches
    const patches = stage2Results.map((r) => r.patch);
    const { merged, rejected } = mergePatches(patches);

    for (const r of rejected) {
      notices.push(`Patch conflict in ${r.sectionRef}: ${r.reason}`);
    }

    // Step 12: Assemble bundle
    const bundle = assembleBundle(group.group_id, merged, plan.canonical);
    if (bundle.patches.length > 0) {
      bundles.push(bundle);
    }

    // Step 13: Apply + commit in graduated mode
    if (mode === 'graduated' && bundle.patches.length > 0) {
      const affectedPaths = [...new Set(bundle.patches.map((p) => p.sectionRef.split('#')[0] ?? ''))];
      const unrelated = checkUnrelatedChanges(projectRoot, affectedPaths);
      if (unrelated.length > 0) {
        notices.push(`Skipping commit: unrelated changes in ${unrelated.join(', ')}`);
      } else {
        const commitMsg = buildCommitMessage(bundle.summary, bundle.patches);
        const staged = stageFiles(projectRoot, affectedPaths);
        if (staged) {
          const commitResult = createCommit(projectRoot, commitMsg, affectedPaths);
          if (commitResult.ok) {
            await appendCoherenceLog(store, {
              type: 'auto-applied',
              gitRef: commitResult.sha,
              summary: bundle.summary,
              sectionRefs: bundle.patches.map((p) => p.sectionRef),
            });
          } else {
            notices.push(`Commit failed: ${commitResult.error ?? 'unknown'}`);
          }
        }
      }
    }
  }

  // Step 14: Flush cost ledger
  await costLedger.flush();

  // Step 15: Clear checkpoint
  await checkpoint.clear();

  // Clear the buffer (entries processed)
  await lifecycle.clear();

  return {
    bundles,
    deferred: deferredSectionCount,
    cost_usd: costLedger.totalCostUsd(),
    notices,
  };
}
