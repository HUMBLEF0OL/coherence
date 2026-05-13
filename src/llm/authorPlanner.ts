/**
 * M9 — Author planner stage (DD-067 staged adoption).
 *
 * When ≥2 distinct signal kinds recur within a 30-minute window, the
 * planner decides whether to consolidate them into a single proposal.
 *
 * The planner is opt-in: gated by `COHERENCE_AUTHOR_PLANNER=1` env var
 * (or live by default once v0.2-alpha telemetry justifies the trigger
 * — DD-067 staged adoption). Otherwise the per-signal Author pipeline
 * handles each signal independently (the v0.2 default).
 */
import type { ProposalKind } from '../proposals/quarantine.js';
import type { SignalKind } from '../state/proposalCache.js';
import { llmCall, loadV2Prompt } from './client.js';
import { detectLiveAuthAvailable } from './authDetect.js';

export interface PlannerSignal {
  kind: SignalKind;
  signal_hash: string;
  evidence: Record<string, unknown>;
}

export interface PlannerInput {
  signals: PlannerSignal[];
  window_minutes: number;
}

export interface PlannerOutput {
  status: 'consolidate' | 'no_consolidation' | 'invalid';
  reason?: string;
  consolidated_kind?: ProposalKind;
  name?: string;
  description?: string;
  rationale?: string;
  covered_signal_hashes?: string[];
}

export type PlannerTransport = (input: PlannerInput) => Promise<string>;

const KEBAB_RE = /^[a-z][a-z0-9-]+$/;
const PLANNER_KINDS = new Set<ProposalKind>(['skill', 'agent', 'slash_command']);

/** Hard trigger: ≥2 distinct signal kinds within `window_minutes`. */
export function shouldRunPlanner(
  signals: PlannerSignal[],
  windowMinutes: number,
): boolean {
  void windowMinutes;
  const distinctKinds = new Set(signals.map((s) => s.kind));
  return distinctKinds.size >= 2;
}

/**
 * Mock transport — deterministic for tests. Returns a consolidate output
 * if the input signals span ≥2 kinds, otherwise no_consolidation.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- mock transport must match async PlannerTransport signature
export const mockPlannerTransport: PlannerTransport = async (input) => {
  const distinctKinds = new Set(input.signals.map((s) => s.kind));
  if (distinctKinds.size < 2) return 'NO_CONSOLIDATION';
  // Pick a consolidated_kind heuristic: agent_correction wins, then skill, then slash_command.
  let consolidatedKind: ProposalKind = 'skill';
  if (distinctKinds.has('agent_correction')) consolidatedKind = 'agent';
  else if (distinctKinds.has('bash_repetition') && !distinctKinds.has('file_creation')) {
    consolidatedKind = 'slash_command';
  }
  return JSON.stringify({
    consolidate: true,
    consolidated_kind: consolidatedKind,
    name: 'auto-consolidated',
    description: `Consolidated proposal covering ${[...distinctKinds].join(' + ')}`,
    rationale: 'Mock planner: signals span multiple kinds within the window.',
    covered_signal_hashes: input.signals.map((s) => s.signal_hash),
  });
};

/** Live transport — calls llmCall with stage='author' and the planner prompt. */
export const livePlannerTransport: PlannerTransport = async (input) => {
  const systemPrompt = loadV2Prompt('author/planner.md');
  const userMessage = JSON.stringify(input, null, 2);
  const cassetteId = `author/planner/${input.signals.map((s) => s.signal_hash).join('-').slice(0, 32)}`;
  const response = await llmCall({
    stage: 'author',
    systemPrompt,
    userMessage,
    cassetteId,
  });
  return response.content;
};

export async function runAuthorPlanner(
  input: PlannerInput,
  transport: PlannerTransport = mockPlannerTransport,
): Promise<PlannerOutput> {
  const raw = await transport(input);
  if (raw.trim() === 'NO_CONSOLIDATION') return { status: 'no_consolidation' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'unparseable_json' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { status: 'invalid', reason: 'not_object' };
  }
  const p = parsed as {
    consolidate?: boolean;
    consolidated_kind?: string;
    name?: string;
    description?: string;
    rationale?: string;
    covered_signal_hashes?: string[];
  };
  if (p.consolidate === false) return { status: 'no_consolidation' };
  if (p.consolidate !== true) return { status: 'invalid', reason: 'missing_consolidate_flag' };
  if (typeof p.consolidated_kind !== 'string' || !PLANNER_KINDS.has(p.consolidated_kind as ProposalKind)) {
    return { status: 'invalid', reason: 'invalid_kind' };
  }
  if (typeof p.name !== 'string' || !KEBAB_RE.test(p.name)) {
    return { status: 'invalid', reason: 'invalid_name' };
  }
  if (typeof p.description !== 'string' || p.description.length < 4) {
    return { status: 'invalid', reason: 'invalid_description' };
  }
  if (!Array.isArray(p.covered_signal_hashes) || p.covered_signal_hashes.length === 0) {
    return { status: 'invalid', reason: 'invalid_covered_signal_hashes' };
  }
  return {
    status: 'consolidate',
    consolidated_kind: p.consolidated_kind as ProposalKind,
    name: p.name,
    description: p.description,
    ...(p.rationale ? { rationale: p.rationale } : {}),
    covered_signal_hashes: p.covered_signal_hashes,
  };
}

/** Whether the planner stage is enabled at runtime. */
export function isPlannerEnabled(): boolean {
  return process.env['COHERENCE_AUTHOR_PLANNER'] === '1';
}

/**
 * Pick the planner transport.
 *
 *  - `COHERENCE_AUTHOR_LIVE=1` forces live.
 *  - `COHERENCE_AUTHOR_MOCK=1` forces mock.
 *  - Default: live iff `detectLiveAuthAvailable()` — either
 *    `ANTHROPIC_API_KEY` is set OR the `claude` CLI is on PATH
 *    (subscription path, post-v1.0.1 Fix 9). Falls back to mock when
 *    neither auth source is configured. v1.0.1 Fix 10 widened the
 *    default gate from API-key-only to API-key-or-subscription.
 */
export function pickPlannerTransport(): PlannerTransport {
  const env = process.env;
  if (env['COHERENCE_AUTHOR_MOCK'] === '1') return mockPlannerTransport;
  if (env['COHERENCE_AUTHOR_LIVE'] === '1') return livePlannerTransport;
  if (detectLiveAuthAvailable(env)) return livePlannerTransport;
  return mockPlannerTransport;
}
