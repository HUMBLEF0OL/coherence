/**
 * Q8 fix coverage: userPromptSubmit hook emits user_prompt_signature
 * (DD-068) when the host event carries a `prompt` field. Verifies the
 * privacy-safe contract — only digests/buckets land in metrics.jsonl,
 * never the raw prompt text.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { userPromptSubmitHook } from '../../src/hooks/userPromptSubmit.js';
import { initCoherenceDir } from '../../src/state/init.js';
import { clearResponseCorrelation } from '../../src/signal/telemetry.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-ups-'));
  await initCoherenceDir(dir);
  clearResponseCorrelation();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function readMetrics(): Array<Record<string, unknown>> {
  const p = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('Q8: userPromptSubmit emits DD-068 user_prompt_signature', () => {
  it('emits with length_bucket + refers_to_prior, never raw prompt', async () => {
    const prompt = 'fix the regression in postToolUse';
    await userPromptSubmitHook({ prompt, session_id: 's-1' }, dir);
    const events = readMetrics();
    const sig = events.find((e) => e.event === 'user_prompt_signature');
    expect(sig).toBeDefined();
    expect(typeof sig!.length_bucket).toBe('number');
    expect(typeof sig!.refers_to_prior).toBe('boolean');
    // Privacy contract: raw prompt text never persisted.
    const raw = readFileSync(
      path.join(dir, '.claude', 'coherence', 'metrics.jsonl'),
      'utf8',
    );
    expect(raw).not.toContain(prompt);
  });

  it('refers_to_prior detects corrective phrasings', async () => {
    await userPromptSubmitHook(
      { prompt: 'no, not that — undo and try again', session_id: 's' },
      dir,
    );
    const events = readMetrics();
    const sig = events.find((e) => e.event === 'user_prompt_signature');
    expect(sig?.refers_to_prior).toBe(true);
  });

  it('skips emit when host event has no prompt field', async () => {
    await userPromptSubmitHook({ session_id: 's' }, dir);
    const events = readMetrics();
    expect(events.find((e) => e.event === 'user_prompt_signature')).toBeUndefined();
  });
});
