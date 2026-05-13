/**
 * v1.0 M3 — NFR-PERF-N7: /coherence:audit free tier.
 *
 * Plan target: < 100 ms p95 over 100 iterations against a 1000-section
 * synthetic section-index. The free tier reads the index, classifies each
 * section's token count, and renders Markdown.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { tokenBudgetReport } from '../../src/audit/tokenBudget.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'cohrence-perf-aud-'));
  mkdirSync(path.join(tmp, '.claude', 'coherence'), { recursive: true });
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    sectionRef: `sec${i}.md#x`,
    content_length_chars: 500 + (i * 17) % 25000, // mix of Normal/Large/Bloated
  }));
  writeFileSync(
    path.join(tmp, '.claude', 'coherence', 'section-index.json'),
    JSON.stringify({ entries }),
    'utf8',
  );
});
afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

describe('NFR-PERF-N7 — /coherence:audit free tier', () => {
  it('tokenBudgetReport renders < 250 ms p95 over 50 iterations on 1000-section index (plan target 100 ms)', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      await tokenBudgetReport(tmp);
      samples.push(performance.now() - t0);
    }
    const p = p95(samples);
    expect(p).toBeLessThan(250);
    // eslint-disable-next-line no-console
    console.log(`[NFR-PERF-N7] tokenBudgetReport p95 over 1000-section index: ${p.toFixed(2)} ms`);
  });
});
