/**
 * v1.0 M0 — trust-ledger storage tests (M-LEDGER-1 atomic writes,
 * LRU eviction, FR-LEDGER-5 empty-init, FR-TRUST-4 promote eligibility).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { StateStore } from '../../../src/state/stateStore.js';
import {
  emptyLedger,
  readLedger,
  recordEvent,
  getSectionScore,
  checkPromoteEligibility,
  ledgerPath,
  LEDGER_FILE,
  MAX_EVENTS_PER_SECTION,
  type TrustLedger,
} from '../../../src/state/trustLedger.js';
import { setIdentityOverride } from '../../../src/state/identity.js';

let tmp: string;
let store: StateStore;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-trust-'));
  const coherenceDir = path.join(tmp, '.claude', 'coherence');
  mkdirSync(coherenceDir, { recursive: true });
  const quarantineDir = path.join(coherenceDir, 'quarantine');
  mkdirSync(quarantineDir, { recursive: true });
  store = new StateStore(coherenceDir, quarantineDir);
  setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'TestDev' });
});

afterEach(() => {
  setIdentityOverride(null);
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

describe('trustLedger storage', () => {
  it('readLedger returns empty ledger when file absent (FR-LEDGER-5)', async () => {
    const ledger = await readLedger(store);
    expect(ledger).toEqual(emptyLedger());
  });

  it('recordEvent persists a single event with summary', async () => {
    await recordEvent(store, 'README.md#install', 'accept', 'sess-1');
    const ledger = await readLedger(store);
    expect(ledger.events['README.md#install']).toHaveLength(1);
    expect(ledger.events['README.md#install'][0].kind).toBe('accept');
    expect(ledger.summary['README.md#install'].score).toBeCloseTo(1.0, 5);
    expect(ledger.summary['README.md#install'].event_count).toBe(1);
  });

  it('atomic writes — 50 concurrent recordEvent calls produce consistent final state (M-LEDGER-1)', async () => {
    const N = 50;
    // Concurrent worker pattern (pass-2 Minor #3): Promise.all of N independent
    // recordEvent calls against the same sectionRef. The lock manager
    // serialises writes; the final ledger must contain exactly N events.
    await Promise.all(
      Array.from({ length: N }, (_, i) => recordEvent(store, 'a.md#s', 'accept', 'sess-' + i)),
    );
    const ledger = await readLedger(store);
    expect(ledger.events['a.md#s']).toHaveLength(N);
    expect(ledger.summary['a.md#s'].event_count).toBe(N);
    // Strictly ascending _ts after sort+slice
    for (let i = 1; i < ledger.events['a.md#s'].length; i++) {
      expect(Date.parse(ledger.events['a.md#s'][i]._ts))
        .toBeGreaterThanOrEqual(Date.parse(ledger.events['a.md#s'][i - 1]._ts));
    }
    expect(existsSync(ledgerPath(store))).toBe(true);
  });

  it('atomic writes — 50 concurrent recordEvent calls across distinct sections preserve all events', async () => {
    const N = 50;
    await Promise.all(
      Array.from({ length: N }, (_, i) => recordEvent(store, 'sec' + (i % 10) + '.md#x', 'accept', 'sess-' + i)),
    );
    const ledger = await readLedger(store);
    let total = 0;
    for (const evs of Object.values(ledger.events)) total += evs.length;
    expect(total).toBe(N);
  });

  it('LRU eviction — keeps newest 200 events sorted ascending by _ts', async () => {
    const ledger = await readLedger(store);
    const sectionRef = 'big.md#s';
    // Inject 250 synthetic events directly to test the trim path
    ledger.events[sectionRef] = [];
    for (let i = 0; i < 250; i++) {
      ledger.events[sectionRef].push({
        _ts: new Date(Date.parse('2026-01-01T00:00:00.000Z') + i * 60_000).toISOString(),
        weight: 1,
        kind: 'accept',
      });
    }
    // Force write with the StateStore directly (bypasses schema-validation only if invalid)
    await store.write(LEDGER_FILE, ledger);
    // Now invoke recordEvent which sorts + trims
    await recordEvent(store, sectionRef, 'accept', 'sess-trim');
    const after = await readLedger(store);
    expect(after.events[sectionRef]).toHaveLength(MAX_EVENTS_PER_SECTION);
    // The earliest kept event timestamp should be later than the earliest synthetic one
    const earliest = after.events[sectionRef][0]._ts;
    expect(Date.parse(earliest)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
    // Strictly ascending
    for (let i = 1; i < after.events[sectionRef].length; i++) {
      expect(Date.parse(after.events[sectionRef][i]._ts))
        .toBeGreaterThanOrEqual(Date.parse(after.events[sectionRef][i - 1]._ts));
    }
  });

  it('re-install survives — ledger preserved when file exists at init (DD-118)', async () => {
    await recordEvent(store, 'README.md#x', 'accept', 'sess-1');
    // Simulate plugin re-install: same path, fresh StateStore
    const fresh = new StateStore(store.coherencePath, path.join(store.coherencePath, 'quarantine'));
    const after = await readLedger(fresh);
    expect(after.events['README.md#x']).toHaveLength(1);
  });
});

describe('getSectionScore', () => {
  it('returns 0 when section absent', async () => {
    expect(await getSectionScore(store, 'never.md#x')).toBe(0);
  });

  it('returns cached score when summary fresh', async () => {
    await recordEvent(store, 'a.md#s', 'accept', 'sess');
    const s = await getSectionScore(store, 'a.md#s');
    expect(s).toBeCloseTo(1.0, 5);
  });

  it('recomputes when summary stale relative to newest event', async () => {
    await recordEvent(store, 'a.md#s', 'accept', 'sess');
    // Corrupt the summary so it's older than the newest event
    const ledger = await readLedger(store);
    ledger.summary['a.md#s'].as_of = '2020-01-01T00:00:00.000Z';
    ledger.summary['a.md#s'].score = 0.123;
    await store.write(LEDGER_FILE, ledger);
    const s = await getSectionScore(store, 'a.md#s');
    expect(s).toBeCloseTo(1.0, 5);
  });
});

describe('checkPromoteEligibility (FR-TRUST-4)', () => {
  it('not eligible when ledger empty', async () => {
    const e = await checkPromoteEligibility(store);
    expect(e.eligible).toBe(false);
    expect(e.conditions_met).toEqual({ score: false, sections: false, days: false });
  });

  async function seedLedger(patch: Partial<TrustLedger>): Promise<void> {
    const ledger = { ...emptyLedger(), ...patch } as TrustLedger;
    await store.write(LEDGER_FILE, ledger);
  }

  it('three conditions evaluated independently', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
    // 5 sections, each with one old accept and score 1.0
    const events: Record<string, { _ts: string; weight: 1; kind: 'accept' }[]> = {};
    const summary: TrustLedger['summary'] = {};
    for (let i = 0; i < 5; i++) {
      const ref = 'f.md#s' + i;
      events[ref] = [{ _ts: old.toISOString(), weight: 1, kind: 'accept' }];
      summary[ref] = { score: 1.0, as_of: old.toISOString(), event_count: 1 };
    }
    await seedLedger({ events, summary });
    const e = await checkPromoteEligibility(store);
    expect(e.conditions_met).toEqual({ score: true, sections: true, days: true });
    expect(e.eligible).toBe(true);
  });

  it('hint_emitted blocks eligibility on subsequent calls', async () => {
    const ledger = emptyLedger();
    ledger.promote_hint_emitted_at = new Date().toISOString();
    await store.write(LEDGER_FILE, ledger);
    const e = await checkPromoteEligibility(store);
    expect(e.eligible).toBe(false);
    expect(e.hint_emitted).toBe(true);
  });
});
