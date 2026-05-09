/**
 * /coherence:review — run Stop pipeline mid-session.
 * --estimate: runs Stage 1 only (heuristic cost estimate, no patches).
 * FR-MIDSESSION-5, FR-MIDSESSION-6
 */
import type { StateStore } from '../state/stateStore.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import { groupEntries } from '../pipeline/grouping.js';
import { enforceCaps } from '../pipeline/caps.js';
import { runStage1 } from '../pipeline/stage1.js';
import { CostLedger } from '../llm/costLedger.js';
import { runStopOrchestrator } from '../pipeline/stop.js';
import type { StopOrchestratorResult } from '../pipeline/stop.js';
import type { SectionIndexEntry, CoherenceMode } from '../types/index.js';

export interface ReviewOptions {
  estimate?: boolean;
  sessionId: string;
  projectRoot: string;
  mode: CoherenceMode;
}

export interface ReviewResult {
  estimate: boolean;
  estimatedGroups?: number;
  estimatedSections?: number;
  result?: StopOrchestratorResult;
  message: string;
}

export async function runReview(
  store: StateStore,
  sectionIndex: SectionIndexEntry[],
  opts: ReviewOptions,
): Promise<ReviewResult> {
  const lifecycle = new BufferLifecycle(store);
  const buf = await lifecycle.read();

  if (buf.entries.length === 0) {
    return {
      estimate: opts.estimate ?? false,
      message: '[coherence] Buffer is empty — nothing to review.',
    };
  }

  if (opts.estimate) {
    // Stage 1 only — estimate mode
    const groups = groupEntries(buf.entries);
    const { allowed, deferredSectionCount } = enforceCaps(groups);
    const costLedger = new CostLedger(store, opts.sessionId);

    let totalPlanSections = 0;
    for (const group of allowed) {
      const plan = await runStage1(group, sectionIndex, costLedger);
      totalPlanSections += plan?.sections.length ?? group.entries.length;
    }

    await costLedger.flush();

    const msg = [
      `[coherence] --estimate: ${allowed.length} group(s), ~${totalPlanSections} section(s) to patch`,
      deferredSectionCount > 0 ? `  ${deferredSectionCount} section(s) deferred (cap)` : null,
      `  Stage 1 cost recorded in cost-ledger.json`,
    ].filter(Boolean).join('\n');

    return {
      estimate: true,
      estimatedGroups: allowed.length,
      estimatedSections: totalPlanSections,
      message: msg,
    };
  }

  // Full pipeline
  const result = await runStopOrchestrator({
    sessionId: opts.sessionId,
    projectRoot: opts.projectRoot,
    store,
    sectionIndex,
    projectFileContents: [],
    mode: opts.mode,
  });

  const lines: string[] = [`[coherence] review complete: ${result.bundles.length} bundle(s)`];
  for (const b of result.bundles) {
    lines.push(`  • ${b.summary} (${b.patches.length} patch(es))`);
  }
  if (result.deferred > 0) {
    lines.push(`  ${result.deferred} section(s) deferred`);
  }

  return {
    estimate: false,
    result,
    message: lines.join('\n'),
  };
}
