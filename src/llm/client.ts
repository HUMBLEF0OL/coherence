/**
 * LLM transport wrapper — Claude Agent SDK with cassette replay.
 *
 * TS-2 §2.6, TS-5 §5.2, FR-STOP-13, NFR-COST-6.
 *
 * v1.0.1 Fix 9 (Path C): migrated from `@anthropic-ai/sdk` (which
 * required `ANTHROPIC_API_KEY` env var) to `@anthropic-ai/claude-agent-sdk`
 * (which uses Claude Code's subscription auth when set up — running
 * `claude` once authenticates the SDK). Subscription auth is the
 * intended path for coherence; API-key auth was a leaky workaround.
 *
 * Architectural notes:
 *   - The agent SDK is conversational (an async iterator yielding
 *     `SDKMessage` values). Coherence's Stage 1/2 are single-shot, so
 *     we configure `maxTurns: 1, allowedTools: []` and collect the
 *     assistant's full text from the terminal `SDKResultSuccess`.
 *   - `total_cost_usd` is reported directly by the SDK (no per-million
 *     pricing constants to drift over time).
 *   - Cassette format is unchanged — replay sessions continue to work
 *     against historical recordings without re-recording.
 *   - The agent SDK does NOT expose `temperature`. Coherence's
 *     determinism guarantees come from cassette replay in tests and
 *     trust-ladder rate of accepts in production; temperature was
 *     never the binding constraint.
 */
import { query, type SDKResultSuccess } from '@anthropic-ai/claude-agent-sdk';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { loadCassette, recordCassette } from './cassette.js';
import { nowIsoUtc } from '../util/time.js';

const require = createRequire(import.meta.url);

export interface PromptManifest {
  model: string;
  temperature: number;
  schema_version: number;
  stage1_version: string;
  stage2_version: string;
  cassette_ids: string[];
}

/**
 * Unified v0.3 prompts/v2/manifest.json shape.
 *
 * v0.3 (DD-118) collapses prompts/v1 into prompts/v2 — stage1/stage2 prompts
 * (planner + patch writer) and v0.2 author/annotate prompts now share a single
 * manifest. PromptManifestV2 carries the stage-prompt fields (schema_version,
 * stage1_version, stage2_version, cassette_ids) alongside the v0.2 fields.
 */
export interface PromptManifestV2 {
  model: string;
  temperature: number;
  schema_version?: number;
  stage1_version?: string;
  stage2_version?: string;
  cassette_ids?: string[];
  author_version?: string;
  annotate_version?: string;
  prompts: Record<string, { version: string; purpose?: string }>;
}

export type LlmStage = 'stage1' | 'stage2' | 'author' | 'annotate' | 'audit_deep';

export interface LlmRequest {
  stage: LlmStage;
  systemPrompt: string;
  userMessage: string;
  cassetteId?: string;
}

export interface LlmResponse {
  content: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  prompt_version: { stage1?: string; stage2?: string };
  cached: boolean;
}

let _manifest: PromptManifest | null = null;
let _manifestV2: PromptManifestV2 | null = null;

function loadManifest(): PromptManifest {
  if (_manifest) return _manifest;
  // v0.3: stage1/stage2 manifest fields live in the unified prompts/v2/manifest.json.
  const manifestPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prompts/v2/manifest.json',
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const raw = require(manifestPath) as PromptManifestV2;
  _manifest = {
    model: raw.model,
    temperature: raw.temperature,
    schema_version: raw.schema_version ?? 1,
    stage1_version: raw.stage1_version ?? 'v1.0',
    stage2_version: raw.stage2_version ?? 'v1.0',
    cassette_ids: raw.cassette_ids ?? [],
  };
  return _manifest;
}

/** D6: load the v0.2 prompts manifest (model + temperature for author/annotate). */
export function loadManifestV2(): PromptManifestV2 {
  if (_manifestV2) return _manifestV2;
  const manifestPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prompts/v2/manifest.json',
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  _manifestV2 = require(manifestPath) as PromptManifestV2;
  return _manifestV2;
}

export function loadStagePrompt(stage: LlmStage): string {
  const { readFileSync } = require('fs') as typeof import('fs');
  if (stage === 'stage1' || stage === 'stage2') {
    const promptsDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../prompts/v2',
    );
    const filename = stage === 'stage1' ? 'stage1-planner.md' : 'stage2-patch.md';
    return readFileSync(path.join(promptsDir, filename), 'utf8');
  }
  // For 'author' / 'annotate', the caller passes the specific prompt path
  // via `loadV2Prompt`. This helper exists only for v0.1 stages.
  throw new Error(`loadStagePrompt: unsupported stage '${stage}'`);
}

/** D6: load a v0.2 prompt body by its manifest key (e.g. "author/skill.md"). */
export function loadV2Prompt(promptKey: string): string {
  const { readFileSync } = require('fs') as typeof import('fs');
  const promptsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prompts/v2',
  );
  return readFileSync(path.join(promptsDir, promptKey), 'utf8');
}

/**
 * Drive a single-shot agent SDK query and collect the terminal result.
 *
 * The SDK streams partial messages during execution; for coherence's
 * purposes we wait for the `SDKResultSuccess` terminal message which
 * carries:
 *   - `result` — the assistant's complete text (already concatenated).
 *   - `usage` — token counts.
 *   - `total_cost_usd` — billed cost (subscription users see $0 here,
 *     which is the intended outcome for the v1.0.1 migration).
 *   - `is_error` / `subtype` — failure modes.
 *
 * If the SDK terminates with anything other than `subtype: 'success'`,
 * the function throws with the result's error details so the cost
 * ledger does not record a malformed entry.
 */
async function runAgentQuery(opts: {
  systemPrompt: string;
  userMessage: string;
  model: string;
}): Promise<{ content: string; input_tokens: number; output_tokens: number; cost_usd: number }> {
  let resultMessage: SDKResultSuccess | undefined;
  let lastErrorSubtype: string | undefined;
  let lastErrorReason: string | undefined;

  for await (const msg of query({
    prompt: opts.userMessage,
    options: {
      systemPrompt: opts.systemPrompt,
      model: opts.model,
      // Single-shot — no tool loop. Stage 1 / Stage 2 produce one
      // response per call; coherence's pipeline orchestrates the next
      // stage itself.
      allowedTools: [],
      maxTurns: 1,
      // Isolate from any host-side CLAUDE.md / settings files. The
      // pipeline supplies the full system prompt explicitly via the
      // `systemPrompt` option.
      settingSources: [],
    },
  })) {
    if (msg.type === 'result') {
      if (msg.subtype === 'success') {
        resultMessage = msg;
      } else {
        lastErrorSubtype = msg.subtype;
        lastErrorReason = (msg.errors ?? []).join('; ');
      }
    }
  }

  if (!resultMessage) {
    throw new Error(
      `[llm] agent SDK terminated without a success result ` +
      `(subtype=${lastErrorSubtype ?? 'unknown'}; errors=${lastErrorReason ?? 'n/a'})`,
    );
  }

  const usage = resultMessage.usage;
  return {
    content: resultMessage.result,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cost_usd: resultMessage.total_cost_usd,
  };
}

export async function llmCall(req: LlmRequest): Promise<LlmResponse> {
  const manifest = loadManifest();
  const v2 = req.stage === 'author' || req.stage === 'annotate' ? loadManifestV2() : null;
  const model = v2 ? v2.model : manifest.model;

  // Cassette replay if available and not forcing refresh. The cassette
  // format is unchanged across the v1.0.1 Path C migration — replay
  // works against any historical recording.
  if (process.env['COHERENCE_REFRESH_CASSETTES'] !== '1' && req.cassetteId) {
    const replayed = loadCassette(req.cassetteId);
    if (replayed) {
      return {
        ...replayed,
        cached: true,
        prompt_version: buildPromptVersion(req.stage, manifest, v2),
      };
    }
  }

  const { content, input_tokens, output_tokens, cost_usd } = await runAgentQuery({
    systemPrompt: req.systemPrompt,
    userMessage: req.userMessage,
    model,
  });

  const result: LlmResponse = {
    content,
    input_tokens,
    output_tokens,
    cost_usd,
    prompt_version: buildPromptVersion(req.stage, manifest, v2),
    cached: false,
  };

  // Record cassette for future replay (only when COHERENCE_REFRESH_CASSETTES=1).
  if (req.cassetteId) {
    recordCassette(req.cassetteId, {
      content,
      input_tokens,
      output_tokens,
      cost_usd,
      timestamp: nowIsoUtc(),
    });
  }

  return result;
}

function buildPromptVersion(
  stage: LlmStage,
  manifest: PromptManifest,
  v2: PromptManifestV2 | null,
): { stage1?: string; stage2?: string; author?: string; annotate?: string } {
  if (stage === 'stage1') return { stage1: manifest.stage1_version };
  if (stage === 'stage2') return { stage2: manifest.stage2_version };
  if (stage === 'author') return { author: v2?.author_version ?? 'v2.0' };
  return { annotate: v2?.annotate_version ?? 'v2.0' };
}

/** Exposed for testing: invalidate cached manifests */
export function _resetManifestCache(): void {
  _manifest = null;
  _manifestV2 = null;
}
