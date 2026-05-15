/**
 * v0.2 perf regression gate (PG-1..PG-5).
 *
 * Synthetic harness: each cell measures a single representative pure function
 * call. Real CI baselines are committed against actual cassette runs in M8.
 * We assert the budgets so any regression that pushes a hot path over its
 * v0.2 budget fails CI.
 */
import { describe, it, expect } from 'vitest';
import { detectBashRepetition } from '../../src/signal/bashRepetition.js';
import { defaultSignalCache } from '../../src/signal/signalCache.js';
import { renderClickAffordance } from '../../src/observability/statusline.js';
import { proposeAnnotate } from '../../src/proposers/annotateProposer.js';
import { signatureHash } from '../../src/signal/signatureHash.js';

function timeIt(fn: () => void, iterations = 1000): number {
  // Warm
  for (let i = 0; i < 50; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

describe('v0.2 perf regression gate', () => {
  it('PG-4: signature hashing on PostToolUse hot path < 1 ms p50 per call', () => {
    const avgMs = timeIt(() => {
      signatureHash('tool_invocation', 'ls -la');
    }, 5000);
    expect(avgMs).toBeLessThan(1);
  });

  it('bash repetition detection < 1 ms per call', () => {
    const cache = defaultSignalCache();
    const avgMs = timeIt(() => {
      detectBashRepetition(cache, 'ls -la', new Date('2026-05-10T10:00:00Z'));
    }, 5000);
    expect(avgMs).toBeLessThan(1);
  });

  it('PG-5: statusline render < 5 ms per call', () => {
    const avgMs = timeIt(() => {
      renderClickAffordance(
        '[2 proposals]',
        '/coherence:propose list',
        { terminal_hyperlink: 'osc8' },
        {},
      );
    }, 1000);
    expect(avgMs).toBeLessThan(5);
  });

  it('annotate proposer < 5 ms on a small doc', () => {
    const body = `# Foo\n\nbody\n\n## Bar\n\ntext\n\n## Baz\n\nmore`;
    const avgMs = timeIt(() => {
      proposeAnnotate({ body, basename: 'd', preservesUnknownFrontmatter: true });
    }, 1000);
    expect(avgMs).toBeLessThan(5);
  });
});
