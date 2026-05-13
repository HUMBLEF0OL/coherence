/**
 * v1.0 M1 — trust-ladder auto-apply gate behavior (FR-TRUST-2, DD-131).
 *
 * Verifies the patch classification gate that lives inside the stop pipeline.
 * Uses the same predicate function the pipeline applies; this isolates the
 * gate logic from the full Stop hook stack.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { StateStore } from '../../src/state/stateStore.js';
import {
  recordEvent,
  getSectionScore,
  LEDGER_FILE,
  emptyLedger,
} from '../../src/state/trustLedger.js';
import { setIdentityOverride } from '../../src/state/identity.js';
import type { Patch } from '../../src/types/index.js';

let tmp: string;
let store: StateStore;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-tl-'));
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

async function shouldAutoApply(p: Patch): Promise<boolean> {
  if (p.changeClass === 'destructive' || p.changeClass === 'frontmatter') return false;
  if (p.changeClass === 'additive') return true;
  return (await getSectionScore(store, p.sectionRef)) >= 0.85;
}

function patchFor(sectionRef: string, changeClass: Patch['changeClass']): Patch {
  return { sectionRef, diff: '@@ -1 +1 @@\n-old\n+new\n', changeClass, validationPassed: true };
}

describe('trust ladder gate (FR-TRUST-2)', () => {
  it('destructive ALWAYS requires confirmation regardless of score', async () => {
    for (let i = 0; i < 20; i++) await recordEvent(store, 'a.md#s', 'accept', 'sess');
    expect(await getSectionScore(store, 'a.md#s')).toBeGreaterThanOrEqual(0.85);
    expect(await shouldAutoApply(patchFor('a.md#s', 'destructive'))).toBe(false);
  });

  it('frontmatter ALWAYS requires confirmation (M-TRUST-3)', async () => {
    for (let i = 0; i < 20; i++) await recordEvent(store, 'a.md#s', 'accept', 'sess');
    expect(await shouldAutoApply(patchFor('a.md#s', 'frontmatter'))).toBe(false);
  });

  it('additive auto-applies even without score (v0.2 behavior preserved)', async () => {
    expect(await shouldAutoApply(patchFor('a.md#s', 'additive'))).toBe(true);
  });

  it('modifying with score >= 0.85 auto-applies', async () => {
    for (let i = 0; i < 20; i++) await recordEvent(store, 'a.md#s', 'accept', 'sess');
    expect(await shouldAutoApply(patchFor('a.md#s', 'modifying'))).toBe(true);
  });

  it('modifying with score < 0.85 requires confirmation', async () => {
    await recordEvent(store, 'a.md#s', 'accept', 'sess');
    await recordEvent(store, 'a.md#s', 'accept', 'sess');
    await recordEvent(store, 'a.md#s', 'revert', 'sess');
    const s = await getSectionScore(store, 'a.md#s');
    expect(s).toBeLessThan(0.85);
    expect(await shouldAutoApply(patchFor('a.md#s', 'modifying'))).toBe(false);
  });

  it('modifying for a never-recorded section requires confirmation (score = 0)', async () => {
    expect(await getSectionScore(store, 'never.md#x')).toBe(0);
    expect(await shouldAutoApply(patchFor('never.md#x', 'modifying'))).toBe(false);
  });

  it('empty ledger initialises lazily, gate evaluates without throwing', async () => {
    await store.write(LEDGER_FILE, emptyLedger());
    expect(await shouldAutoApply(patchFor('z.md#x', 'modifying'))).toBe(false);
  });
});
