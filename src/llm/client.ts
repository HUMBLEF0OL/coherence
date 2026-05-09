/**
 * Anthropic SDK wrapper with prompt caching, cost tracking, and cassette replay.
 * TS-2 §2.6, TS-5 §5.2, FR-STOP-13, NFR-COST-6
 */
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

export interface LlmRequest {
  stage: 'stage1' | 'stage2';
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

function loadManifest(): PromptManifest {
  if (_manifest) return _manifest;
  const manifestPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prompts/v1/manifest.json',
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  _manifest = require(manifestPath) as PromptManifest;
  return _manifest;
}

export function loadStagePrompt(stage: 'stage1' | 'stage2'): string {
  const { readFileSync } = require('fs') as typeof import('fs');
  const promptsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../prompts/v1',
  );
  const filename = stage === 'stage1' ? 'stage1-planner.md' : 'stage2-patch.md';
  return readFileSync(path.join(promptsDir, filename), 'utf8');
}

export async function llmCall(req: LlmRequest): Promise<LlmResponse> {
  const manifest = loadManifest();

  // Cassette replay if available and not forcing refresh
  if (process.env['COHERENCE_REFRESH_CASSETTES'] !== '1' && req.cassetteId) {
    const replayed = loadCassette(req.cassetteId);
    if (replayed) {
      return {
        ...replayed,
        cached: true,
        prompt_version: buildPromptVersion(req.stage, manifest),
      };
    }
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: manifest.model,
    max_tokens: 8192,
    temperature: manifest.temperature,
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
    prompt_version: buildPromptVersion(req.stage, manifest),
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
  stage: 'stage1' | 'stage2',
  manifest: PromptManifest,
): { stage1?: string; stage2?: string } {
  return stage === 'stage1'
    ? { stage1: manifest.stage1_version }
    : { stage2: manifest.stage2_version };
}

/** Exposed for testing: invalidate cached manifest */
export function _resetManifestCache(): void {
  _manifest = null;
}
