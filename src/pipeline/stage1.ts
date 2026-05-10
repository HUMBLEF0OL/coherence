/**
 * Stage 1 — Coherence Planner invocation.
 * TS-5 §5.3, DD-049
 * Reads sections fresh from disk; deterministic input prep (no LLM-generated summary).
 */
import type { CoherencePlan, SectionRef, NormalizedPath, SectionIndexEntry } from '../types/index.js';
import { llmCall, loadStagePrompt } from '../llm/client.js';
import type { CostLedger } from '../llm/costLedger.js';
import type { SectionGroup } from './grouping.js';

export interface Stage1SectionInput {
  sectionRef: SectionRef;
  path: NormalizedPath;
  heading: string | null;
  declared_canonical: boolean;
  layer: 'referring-doc' | 'skill' | 'subagent' | 'config';
}

export interface Stage1Input {
  sections: Stage1SectionInput[];
  triggering_files: string[];
}

function detectLayer(filePath: string): Stage1SectionInput['layer'] {
  if (/SKILL\.md$/i.test(filePath)) return 'skill';
  if (/CLAUDE\.md$/i.test(filePath)) return 'config';
  if (/agent/i.test(filePath)) return 'subagent';
  return 'referring-doc';
}

function buildStage1Input(
  group: SectionGroup,
  sectionIndex: SectionIndexEntry[],
): Stage1Input {
  const indexMap = new Map(sectionIndex.map((e) => [e.sectionRef, e]));

  const sections: Stage1SectionInput[] = group.entries.map((entry) => {
    const indexed = indexMap.get(entry.sectionRef);
    return {
      sectionRef: entry.sectionRef,
      path: entry.path,
      heading: indexed?.heading ?? null,
      declared_canonical: false,
      layer: detectLayer(entry.path),
    };
  });

  return {
    sections,
    triggering_files: group.triggering_files,
  };
}

function parsePlanResponse(raw: string): CoherencePlan | null {
  let json = raw.trim();
  if (json.startsWith('```')) {
    const start = json.indexOf('\n') + 1;
    const end = json.lastIndexOf('```');
    json = end > start ? json.slice(start, end).trim() : json.slice(start).trim();
  }

  try {
    return JSON.parse(json) as CoherencePlan;
  } catch {
    return null;
  }
}

export async function runStage1(
  group: SectionGroup,
  sectionIndex: SectionIndexEntry[],
  costLedger: CostLedger,
  cassetteId?: string,
): Promise<CoherencePlan | null> {
  // Single-section group: skip Stage 1, build trivial plan
  if (group.entries.length === 1) {
    const entry = group.entries[0];
    return {
      canonical: entry.sectionRef,
      sections: [{ sectionRef: entry.sectionRef, role: 'canonical' }],
    };
  }

  const input = buildStage1Input(group, sectionIndex);
  const systemPrompt = loadStagePrompt('stage1');
  const userMessage = JSON.stringify(input, null, 2);

  const response = await llmCall({
    stage: 'stage1',
    systemPrompt,
    userMessage,
    ...(cassetteId !== undefined ? { cassetteId } : {}),
  });

  costLedger.record({
    stage: 'stage1',
    input_tokens: response.input_tokens,
    output_tokens: response.output_tokens,
    cost_usd: response.cost_usd,
    prompt_version: response.prompt_version,
  });

  return parsePlanResponse(response.content);
}
