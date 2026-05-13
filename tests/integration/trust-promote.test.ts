/**
 * v1.0 M1 — promote eligibility + auto_land_kinds persistence (FR-TRUST-1/4).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { StateStore } from '../../src/state/stateStore.js';
import {
  readLedger,
  writeLedger,
  emptyLedger,
  LEDGER_FILE,
  checkPromoteEligibility,
  type TrustLedger,
} from '../../src/state/trustLedger.js';
import { setIdentityOverride } from '../../src/state/identity.js';
import { runTrust } from '../../src/commands/trust.js';

let tmp: string;
let store: StateStore;
let projectRoot: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-tp-'));
  projectRoot = tmp;
  const cd = path.join(tmp, '.claude', 'coherence');
  mkdirSync(cd, { recursive: true });
  mkdirSync(path.join(cd, 'quarantine'), { recursive: true });
  store = new StateStore(cd, path.join(cd, 'quarantine'));
  setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'TestDev' });
});

afterEach(() => {
  setIdentityOverride(null);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

async function seedEligibleLedger(): Promise<void> {
  const now = new Date();
  const old = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const events: TrustLedger['events'] = {};
  const summary: TrustLedger['summary'] = {};
  for (let i = 0; i < 5; i++) {
    const ref = 'f.md#s' + i;
    events[ref] = [{ _ts: old.toISOString(), weight: 1, kind: 'accept' }];
    summary[ref] = { score: 1.0, as_of: old.toISOString(), event_count: 1 };
  }
  const ledger: TrustLedger = { ...emptyLedger(), events, summary };
  await store.write(LEDGER_FILE, ledger);
}

describe('promote eligibility + flow', () => {
  it('eligibility flips to false after hint stamped (one-shot, FR-TRUST-1)', async () => {
    await seedEligibleLedger();
    const first = await checkPromoteEligibility(store);
    expect(first.eligible).toBe(true);
    expect(first.hint_emitted).toBe(false);

    // Stamp the hint as sessionStart would
    const ledger = await readLedger(store);
    ledger.promote_hint_emitted_at = new Date().toISOString();
    await writeLedger(store, ledger);

    const second = await checkPromoteEligibility(store);
    expect(second.eligible).toBe(false);
    expect(second.hint_emitted).toBe(true);
  });

  it('--promote --auto-land annotate persists auto_land_kinds', async () => {
    await seedEligibleLedger();
    const result = await runTrust({
      store,
      projectRoot,
      argv: ['--promote', '--auto-land', 'annotate'],
      sessionId: 'sess-1',
    });
    expect(result).toContain('annotate');
    const ledger = await readLedger(store);
    expect(ledger.promoted_at).not.toBeNull();
    expect(ledger.auto_land_kinds).toEqual(['annotate']);
  });

  it('--promote --auto-land annotate,skill enables both kinds (M-TRUST-4)', async () => {
    await seedEligibleLedger();
    await runTrust({
      store,
      projectRoot,
      argv: ['--promote', '--auto-land', 'annotate,skill'],
      sessionId: 'sess-1',
    });
    const ledger = await readLedger(store);
    expect(ledger.auto_land_kinds.sort()).toEqual(['annotate', 'skill']);
  });

  it('--promote rejected when conditions unmet', async () => {
    const result = await runTrust({
      store,
      projectRoot,
      argv: ['--promote', '--auto-land', 'annotate'],
      sessionId: 'sess-1',
    });
    expect(result).toContain('Not eligible');
  });

  it('--promote --auto-land invalid_kind throws', async () => {
    await seedEligibleLedger();
    await expect(
      runTrust({ store, projectRoot, argv: ['--promote', '--auto-land', 'bogus'], sessionId: 'sess-1' }),
    ).rejects.toThrow(/invalid --auto-land/);
  });
});

describe('--status renderer', () => {
  it('renders all 5 sections with empty ledger', async () => {
    const result = await runTrust({ store, projectRoot, argv: [], sessionId: 'sess-1' });
    expect(result).toContain('## Trust state');
    expect(result).toContain('## Top 5 highest personal scores');
    expect(result).toContain('## Top 5 lowest personal scores');
    expect(result).toContain('## Team aggregate');
    expect(result).toContain('## Promote eligibility');
  });

  it('reflects eligible state when conditions are met', async () => {
    await seedEligibleLedger();
    const result = await runTrust({ store, projectRoot, argv: [], sessionId: 'sess-1' });
    expect(result).toContain('eligible right now: yes');
  });
});

describe('sync subcommand', () => {
  it('writes coherence/trust/<author-hash>.json under projectRoot', async () => {
    await seedEligibleLedger();
    const result = await runTrust({ store, projectRoot, argv: ['sync'], sessionId: 'sess-1' });
    expect(result).toMatch(/Synced \d+ section/);
    const teamFile = path.join(projectRoot, 'coherence', 'trust', 'aaaaaaaaaaaa.json');
    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(teamFile)).toBe(true);
    const parsed = JSON.parse(readFileSync(teamFile, 'utf8')) as { schema_version: number; author_hash: string };
    expect(parsed.schema_version).toBe(3);
    expect(parsed.author_hash).toBe('aaaaaaaaaaaa');
  });
});
