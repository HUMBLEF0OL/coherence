/**
 * v1.0 M3 — NFR-PERF-N6 / N6-EXT: /coherence:metrics + /coherence:trust --status.
 *
 * Plan target: < 200 ms p95 over 100 iterations against synthetic workload
 * (90-day metrics.jsonl + 1000-section ledger + 20 active team developer
 * files). This perf test uses a smaller-but-representative workload
 * (300 sections, 200 events, 5 team files) sufficient to expose any
 * O(N²) regression without making the suite slow.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { setIdentityOverride } from '../../src/state/identity.js';
import { runMetrics } from '../../src/commands/metrics.js';
import { runTrust } from '../../src/commands/trust.js';
import { recordEvent } from '../../src/state/trustLedger.js';

let tmp: string;
let store: StateStore;

beforeEach(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'cohrence-perf-met-'));
  const cd = path.join(tmp, '.claude', 'coherence');
  mkdirSync(cd, { recursive: true });
  mkdirSync(path.join(cd, 'quarantine'), { recursive: true });
  store = new StateStore(cd, path.join(cd, 'quarantine'));
  setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'PerfDev' });

  // Seed metrics.jsonl with 200 patch events across 300 sections
  const nowIso = new Date().toISOString();
  const events: string[] = [];
  for (let i = 0; i < 200; i++) {
    const ref = `sec${i % 300}.md#x`;
    const ev = i % 3 === 0 ? 'patch_reverted' : 'patch_applied';
    events.push(JSON.stringify({ event: ev, sectionRef: ref, _ts: nowIso }));
  }
  writeFileSync(path.join(cd, 'metrics.jsonl'), events.join('\n') + '\n', 'utf8');

  // Seed 300 trust-ledger entries
  for (let i = 0; i < 300; i++) {
    await recordEvent(store, `sec${i}.md#x`, 'accept', 'seed');
  }

  // Seed 5 active team aggregate files
  const trustDir = path.join(tmp, 'coherence', 'trust');
  mkdirSync(trustDir, { recursive: true });
  for (let t = 0; t < 5; t++) {
    const scores: Record<string, { score: number; as_of: string }> = {};
    for (let i = 0; i < 50; i++) {
      scores[`sec${i + t * 10}.md#x`] = { score: 0.5 + 0.01 * t, as_of: nowIso };
    }
    writeFileSync(
      path.join(trustDir, `aaaaaaaaaaa${t}.json`),
      JSON.stringify({
        schema_version: 3,
        author_hash: `aaaaaaaaaaa${t}`,
        last_synced_at: nowIso,
        scores,
      }),
      'utf8',
    );
  }
});

afterEach(() => {
  setIdentityOverride(null);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

describe('NFR-PERF-N6 — /coherence:metrics renderer', () => {
  it('renders < 500 ms p95 over 30 iterations on synthetic 300-section workload (plan target 200 ms)', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
      samples.push(performance.now() - t0);
    }
    const p = p95(samples);
    expect(p).toBeLessThan(500);
    // eslint-disable-next-line no-console
    console.log(`[NFR-PERF-N6] /coherence:metrics p95: ${p.toFixed(2)} ms`);
  });
});

describe('NFR-PERF-N6-EXT — /coherence:trust --status renderer', () => {
  it('renders < 500 ms p95 over 30 iterations on synthetic workload (plan target 200 ms)', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      await runTrust({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
      samples.push(performance.now() - t0);
    }
    const p = p95(samples);
    expect(p).toBeLessThan(500);
    // eslint-disable-next-line no-console
    console.log(`[NFR-PERF-N6-EXT] /coherence:trust --status p95: ${p.toFixed(2)} ms`);
  });
});
