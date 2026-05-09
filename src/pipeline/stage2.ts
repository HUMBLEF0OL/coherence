/**
 * Stage 2 — Patch Writer orchestration.
 * TS-5 §5.4, FR-STOP-15/-16, NFR-PERF-10 (≤8 concurrent)
 */
import type { CoherencePlan, Patch, SectionRef } from '../types/index.js';
import { llmCall, loadStagePrompt } from '../llm/client.js';
import type { CostLedger } from '../llm/costLedger.js';
import { parseStage2Response } from '../validation/format.js';
import { recomputeChangeClass, isFrontmatterOnlyDiff } from '../validation/sanity.js';
import { checkLineRatio } from '../validation/lineRatio.js';
import { checkPromptInjection, isSkillOrAgentPath } from '../validation/promptInjection.js';
import { checkHallucination } from '../validation/hallucination.js';
import { checkApplies } from '../validation/apply.js';

const MAX_CONCURRENT = 8;

export interface Stage2SectionInput {
  sectionRef: SectionRef;
  role: 'canonical' | 'reference' | 'no-change';
  relation: string | null;
  heading: string | null;
  current_content: string;
  canonical_content: string | null;
  changed_tokens: string[];
  layer: 'referring-doc' | 'skill' | 'subagent' | 'config';
}

export interface Stage2Result {
  patch: Patch;
  validationLog: string[];
}

async function processSection(
  section: Stage2SectionInput,
  costLedger: CostLedger,
  projectRoot: string,
  projectFiles: string[],
  cassetteId?: string,
): Promise<Stage2Result> {
  const log: string[] = [];

  // FR-STOP-16: role:no-change → short-circuit without API call
  if (section.role === 'no-change') {
    return {
      patch: {
        sectionRef: section.sectionRef,
        diff: 'NO_PATCH_NEEDED',
        changeClass: 'additive',
        validationPassed: true,
      },
      validationLog: ['no-change: short-circuit'],
    };
  }

  const systemPrompt = loadStagePrompt('stage2');
  const userMessage = JSON.stringify(section, null, 2);

  const response = await llmCall({
    stage: 'stage2',
    systemPrompt,
    userMessage,
    ...(cassetteId !== undefined ? { cassetteId } : {}),
  });

  costLedger.record({
    stage: 'stage2',
    input_tokens: response.input_tokens,
    output_tokens: response.output_tokens,
    cost_usd: response.cost_usd,
    prompt_version: response.prompt_version,
  });

  // Step 1: Format validation
  const parsed = parseStage2Response(response.content);

  if (parsed.kind === 'no-patch') {
    return {
      patch: { sectionRef: section.sectionRef, diff: 'NO_PATCH_NEEDED', changeClass: 'additive', validationPassed: true },
      validationLog: ['format: NO_PATCH_NEEDED'],
    };
  }

  if (parsed.kind === 'escalate') {
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass: 'additive', validationPassed: false },
      validationLog: ['format: ESCALATE'],
    };
  }

  if (parsed.kind === 'plan-disagrees') {
    log.push(`format: PLAN_DISAGREES — ${parsed.reason}`);
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass: 'additive', validationPassed: false },
      validationLog: log,
    };
  }

  if (parsed.kind === 'invalid') {
    log.push(`format: invalid — ${parsed.reason}`);
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass: 'additive', validationPassed: false },
      validationLog: log,
    };
  }

  const diffRaw = parsed.raw;
  log.push('format: valid diff');

  // Step 2: Apply check
  const applyResult = checkApplies(diffRaw, projectRoot);
  if (!applyResult.applies) {
    log.push(`apply: FAIL — ${applyResult.error ?? 'unknown'}`);
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass: 'additive', validationPassed: false },
      validationLog: log,
    };
  }
  log.push('apply: ok');

  // Step 3: Sanity recount (DD-017)
  const frontmatterOnly = isFrontmatterOnlyDiff(diffRaw);
  const sanity = recomputeChangeClass(parsed.files);
  const changeClass = frontmatterOnly ? 'frontmatter' : sanity.changeClass;
  log.push(`sanity: ${changeClass} (added=${sanity.addedLines} removed=${sanity.removedLines})`);

  // Step 4: Line ratio check
  const originalLines = section.current_content.split('\n').length;
  const ratio = checkLineRatio(sanity.addedLines, sanity.removedLines, originalLines);
  if (ratio.shouldEscalate) {
    log.push(`line-ratio: ESCALATE (${(ratio.ratio * 100).toFixed(1)}% > 40%)`);
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass, validationPassed: false },
      validationLog: log,
    };
  }
  log.push(`line-ratio: ok (${(ratio.ratio * 100).toFixed(1)}%)`);

  // Step 5: Prompt injection check
  const isSkillAgent = isSkillOrAgentPath(section.sectionRef);
  const injection = checkPromptInjection(diffRaw, isSkillAgent);
  if (injection.rejected) {
    log.push(`prompt-injection: REJECTED — ${injection.reason}`);
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass, validationPassed: false },
      validationLog: log,
    };
  }
  log.push('prompt-injection: ok');

  // Step 5b: Hallucination check
  const changedContent = [section.current_content, section.canonical_content ?? ''];
  const hallu = checkHallucination(diffRaw, changedContent, projectFiles);
  if (!hallu.passed) {
    log.push(`hallucination: FAIL — unknown strict tokens: ${hallu.unknownStrictTokens.join(', ')}`);
    return {
      patch: { sectionRef: section.sectionRef, diff: 'ESCALATE', changeClass, validationPassed: false },
      validationLog: log,
    };
  }
  if (hallu.demoteClass) {
    log.push(`hallucination: demote-class (${hallu.unknownLooseOnlyTokens.length} loose-only unknowns)`);
  } else {
    log.push('hallucination: ok');
  }

  return {
    patch: { sectionRef: section.sectionRef, diff: diffRaw, changeClass, validationPassed: true },
    validationLog: log,
  };
}

/**
 * Run Stage 2 for all sections in a plan, respecting ≤8 concurrency.
 */
export async function runStage2(
  plan: CoherencePlan,
  sections: Stage2SectionInput[],
  costLedger: CostLedger,
  projectRoot: string,
  projectFiles: string[],
  cassetteIds?: Map<SectionRef, string>,
): Promise<Stage2Result[]> {
  const results: Stage2Result[] = [];
  const sectionMap = new Map(sections.map((s) => [s.sectionRef, s]));

  // Process in batches of MAX_CONCURRENT
  const queue = plan.sections.map((ps) => sectionMap.get(ps.sectionRef)).filter(Boolean) as Stage2SectionInput[];

  for (let i = 0; i < queue.length; i += MAX_CONCURRENT) {
    const batch = queue.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((section) =>
        processSection(
          section,
          costLedger,
          projectRoot,
          projectFiles,
          cassetteIds?.get(section.sectionRef),
        ),
      ),
    );
    results.push(...batchResults);
  }

  return results;
}
