/**
 * Anthropic SDK wrapper with prompt caching, cost tracking, and cassette replay.
 * TS-2 §2.6, TS-5 §5.2, FR-STOP-13, NFR-COST-6
 */
// eslint-disable-next-line import/no-named-as-default -- @anthropic-ai/sdk default export name collides with named
import Anthropic from '@anthropic-ai/sdk';
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

export type LlmStage = 'stage1' | 'stage2' | 'author' | 'annotate';

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

// Sonnet 4.5 pricing per million tokens (approximate)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

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

export async function llmCall(req: LlmRequest): Promise<LlmResponse> {
  const manifest = loadManifest();
  const v2 = req.stage === 'author' || req.stage === 'annotate' ? loadManifestV2() : null;
  const model = v2 ? v2.model : manifest.model;
  const temperature = v2 ? v2.temperature : manifest.temperature;

  // Cassette replay if available and not forcing refresh
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

  const client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    temperature,
    system: [
      {
        type: 'text',
        text: req.systemPrompt,
        // Prompt caching: long system prompts benefit from cache_control
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: req.userMessage }],
  });

  const content =
    response.content[0]?.type === 'text' ? response.content[0].text : '';
  const input_tokens = response.usage.input_tokens;
  const output_tokens = response.usage.output_tokens;
  const cost_usd =
    (input_tokens / 1_000_000) * INPUT_COST_PER_M +
    (output_tokens / 1_000_000) * OUTPUT_COST_PER_M;

  const result: LlmResponse = {
    content,
    input_tokens,
    output_tokens,
    cost_usd,
    prompt_version: buildPromptVersion(req.stage, manifest, v2),
    cached: false,
  };

  // Record cassette for future replay
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
