/**
 * v1.0 M3 — /coherence:metrics renderer (M-METRICS-1, FR-METRICS-*).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { StateStore } from '../../src/state/stateStore.js';
import { setIdentityOverride } from '../../src/state/identity.js';
import { runMetrics, renderSparkline } from '../../src/commands/metrics.js';
import { recordEvent } from '../../src/state/trustLedger.js';

let tmp: string;
let store: StateStore;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-metrics-'));
  const cd = path.join(tmp, '.claude', 'coherence');
  mkdirSync(cd, { recursive: true });
  mkdirSync(path.join(cd, 'quarantine'), { recursive: true });
  store = new StateStore(cd, path.join(cd, 'quarantine'));
  setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'Tester' });
});

afterEach(() => {
  setIdentityOverride(null);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

function appendJsonl(filename: string, records: object[]): void {
  const fp = path.join(tmp, '.claude', 'coherence', filename);
  const data = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(fp, data, 'utf8');
}

describe('runMetrics renderer (5 sections)', () => {
  it('renders all 5 sections with completely empty inputs', async () => {
    const out = await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
    expect(out).toContain('# /coherence:metrics');
    expect(out).toContain('## Summary');
    expect(out).toContain('## Top drifting sections');
    expect(out).toContain('## Trust scores');
    expect(out).toContain('## Cost trend');
    expect(out).toContain('## Revert hotspots');
  });

  it('counts events by type and reports all-time + last-30-day windows', async () => {
    const nowIso = new Date().toISOString();
    appendJsonl('metrics.jsonl', [
      { event: 'patch_applied', sectionRef: 'a#x', _ts: nowIso },
      { event: 'patch_applied', sectionRef: 'a#x', _ts: nowIso },
      { event: 'patch_reverted', sectionRef: 'a#x', _ts: nowIso },
    ]);
    const out = await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
    // Markdown table cell — should reflect 2 applies, 1 revert
    expect(out).toMatch(/patch_applied \| 2 \| 2/);
    expect(out).toMatch(/patch_reverted \| 1 \| 1/);
  });

  it('Top drifting sections sorts by patch_applied count', async () => {
    const nowIso = new Date().toISOString();
    appendJsonl('metrics.jsonl', [
      { event: 'patch_applied', sectionRef: 'a#x', _ts: nowIso },
      { event: 'patch_applied', sectionRef: 'a#x', _ts: nowIso },
      { event: 'patch_applied', sectionRef: 'a#x', _ts: nowIso },
      { event: 'patch_applied', sectionRef: 'b#y', _ts: nowIso },
    ]);
    const out = await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
    // a#x (3 patches) should appear before b#y (1)
    const idxA = out.indexOf('`a#x`');
    const idxB = out.indexOf('`b#y`');
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });

  it('Trust scores pulled from ledger when populated', async () => {
    await recordEvent(store, 'high.md#s', 'accept', 'sess');
    await recordEvent(store, 'high.md#s', 'accept', 'sess');
    const out = await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
    expect(out).toContain('`high.md#s`');
    expect(out).toContain('Top 10 highest (personal)');
  });

  it('Revert hotspot threshold accepts --revert-threshold 10', async () => {
    const nowIso = new Date().toISOString();
    // 4 accepts + 1 revert = 20% revert rate
    const events = [
      ...Array(4).fill({ event: 'proposal_accept_recorded', sectionRef: 'hot.md#x' }),
      { event: 'proposal_revert_recorded', sectionRef: 'hot.md#x' },
    ];
    appendJsonl('metrics.jsonl', events.map((e) => ({ ...e, _ts: nowIso })));
    const outDefault = await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
    // default threshold = 20, and revert rate = 1/5 = 20%; >= 20 so included
    expect(outDefault).toContain('`hot.md#x`');
    const outHigh = await runMetrics({ store, projectRoot: tmp, argv: ['--revert-threshold', '50'], sessionId: 'sess' });
    expect(outHigh).not.toContain('`hot.md#x`');
  });

  it('--revert-threshold out of range throws', async () => {
    await expect(
      runMetrics({ store, projectRoot: tmp, argv: ['--revert-threshold', '150'], sessionId: 'sess' }),
    ).rejects.toThrow(/integer in \[0, 100\]/);
  });

  it('--out writes file under projectRoot', async () => {
    const outArg = path.join('.claude', 'coherence', 'metrics-report.md');
    const result = await runMetrics({ store, projectRoot: tmp, argv: ['--out', outArg], sessionId: 'sess' });
    expect(result).toMatch(/Wrote \d+ chars/);
    const written = readFileSync(path.resolve(tmp, outArg), 'utf8');
    expect(written).toContain('# /coherence:metrics');
  });

  it('--out outside projectRoot refused without --allow-out-of-tree', async () => {
    await expect(
      runMetrics({ store, projectRoot: tmp, argv: ['--out', path.join('..', 'sibling', 'metrics.md')], sessionId: 'sess' }),
    ).rejects.toThrow(/escapes project root/);
  });
});

describe('renderCostTrend (cost-ledger.json field is `timestamp`)', () => {
  it('renders a non-zero sparkline when cost-ledger has entries with `timestamp` field', async () => {
    // cost-ledger.schema.json names the timestamp field `timestamp` (not `_ts`).
    // The earlier audit caught this — without the fix, the sparkline would be
    // all-zero even with valid entries. This test guards the regression.
    const now = new Date();
    const ledger = {
      session_id: 'sess',
      entries: Array.from({ length: 20 }, (_, i) => ({
        session_id: 'sess',
        timestamp: new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString(),
        stage: 'stage1',
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.001 + i * 0.0005,
        prompt_version: { stage1: 'v1.0' },
      })),
    };
    const fp = path.join(tmp, '.claude', 'coherence', 'cost-ledger.json');
    writeFileSync(fp, JSON.stringify(ledger), 'utf8');
    const out = await runMetrics({ store, projectRoot: tmp, argv: [], sessionId: 'sess' });
    // Should contain at least one non-▁ block (▂..█) proving non-zero entries were read
    expect(out).toMatch(/[▂▃▄▅▆▇█]/);
  });
});

describe('renderSparkline edge cases', () => {
  it('< 3 sessions returns "no trend yet"', () => {
    expect(renderSparkline([])).toContain('no trend yet');
    expect(renderSparkline([1, 2])).toContain('no trend yet');
  });
  it('all-zero values render as repeating ▁', () => {
    expect(renderSparkline([0, 0, 0, 0])).toBe('▁▁▁▁');
  });
  it('max == min renders as repeating ▄', () => {
    expect(renderSparkline([5, 5, 5, 5])).toBe('▄▄▄▄');
  });
  it('mixed values map across 8 block levels', () => {
    const s = renderSparkline([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.length).toBe(8);
    expect(s).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
  });
});
