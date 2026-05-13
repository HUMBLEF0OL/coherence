/**
 * v1.0 M4 — /coherence:repair trust-orphan handling (M-REPAIR-1, FR-REPAIR-1).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { StateStore } from '../../src/state/stateStore.js';
import { runRepair } from '../../src/commands/repair.js';
import {
  emptyLedger,
  recordEvent,
  readLedger,
  LEDGER_FILE,
  type TrustLedger,
} from '../../src/state/trustLedger.js';
import { setIdentityOverride } from '../../src/state/identity.js';

let tmp: string;
let store: StateStore;
let coherenceDir: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-rep-'));
  coherenceDir = path.join(tmp, '.claude', 'coherence');
  mkdirSync(coherenceDir, { recursive: true });
  mkdirSync(path.join(coherenceDir, 'quarantine'), { recursive: true });
  store = new StateStore(coherenceDir, path.join(coherenceDir, 'quarantine'));
  setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'Tester' });
});
afterEach(() => {
  setIdentityOverride(null);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

function seedIndex(sectionRefs: string[]): void {
  writeFileSync(
    path.join(coherenceDir, 'section-index.json'),
    JSON.stringify({ entries: sectionRefs.map((r) => ({ sectionRef: r })) }),
    'utf8',
  );
}

describe('/coherence:repair trust-orphans (default flow)', () => {
  it('lists orphaned trust-ledger keys with numbered output', async () => {
    seedIndex(['kept.md#x']);
    await recordEvent(store, 'kept.md#x', 'accept', 'sess');
    await recordEvent(store, 'orphan1.md#y', 'accept', 'sess');
    await recordEvent(store, 'orphan2.md#z', 'accept', 'sess');

    const result = await runRepair(store, coherenceDir, tmp);
    const joined = result.actions.join('\n');
    expect(joined).toContain('Orphaned trust-ledger keys (2)');
    expect(joined).toContain('[1] orphan1.md#y');
    expect(joined).toContain('[2] orphan2.md#z');
    expect(joined).not.toContain('kept.md#x');
    expect(joined).toContain('--reassociate');
    expect(joined).toContain('--expire-orphans');
  });
});

describe('/coherence:repair --reassociate --to', () => {
  it('moves events from old ref to new ref + writes coherence-log entry', async () => {
    seedIndex(['new.md#x']);
    await recordEvent(store, 'old.md#x', 'accept', 'sess');
    await recordEvent(store, 'old.md#x', 'accept', 'sess');

    const result = await runRepair(store, coherenceDir, tmp, { reassociate: { from: 'old.md#x', to: 'new.md#x' } });
    expect(result.actions[0]).toContain('Trust ledger reassociated: old.md#x → new.md#x');

    const ledger = await readLedger(store);
    expect(ledger.events['old.md#x']).toBeUndefined();
    expect(ledger.events['new.md#x']).toHaveLength(2);

    // coherence-log.md should contain the entry
    const logPath = path.join(coherenceDir, 'coherence-log.md');
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, 'utf8')).toContain('Trust ledger reassociated');
  });
});

describe('/coherence:repair --expire-orphans', () => {
  it('removes orphan keys + bulk log entry, preserves kept entries', async () => {
    seedIndex(['kept.md#x']);
    await recordEvent(store, 'kept.md#x', 'accept', 'sess');
    await recordEvent(store, 'g1.md#a', 'accept', 'sess');
    await recordEvent(store, 'g2.md#b', 'accept', 'sess');

    const result = await runRepair(store, coherenceDir, tmp, { expireOrphans: true });
    expect(result.actions[0]).toContain('Trust orphans expired: 2 sectionRef(s)');

    const ledger = await readLedger(store);
    expect(Object.keys(ledger.events)).toEqual(['kept.md#x']);
  });

  it('handles 21+ orphans with truncated preview', async () => {
    // Seed empty index + 25 orphan keys
    seedIndex([]);
    const ledger: TrustLedger = emptyLedger();
    for (let i = 0; i < 25; i++) {
      ledger.events['orphan' + i + '.md#x'] = [{ _ts: '2026-05-01T00:00:00.000Z', weight: 1, kind: 'accept' }];
      ledger.summary['orphan' + i + '.md#x'] = { score: 1, as_of: '2026-05-01T00:00:00.000Z', event_count: 1 };
    }
    await store.write(LEDGER_FILE, ledger);

    const result = await runRepair(store, coherenceDir, tmp, { expireOrphans: true });
    const joined = result.actions.join('\n');
    expect(joined).toContain('25 sectionRef(s)');
    expect(joined).toContain('and 5 more');
  });

  it('no-op when index empty + ledger empty', async () => {
    const result = await runRepair(store, coherenceDir, tmp, { expireOrphans: true });
    expect(result.actions[0]).toContain('0 sectionRef(s)');
  });
});
