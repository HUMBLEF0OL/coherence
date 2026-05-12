/**
 * M-TRIGGER-1 — v0.4 DD-129.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;
let coherenceDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'trigger-contracts-'));
  coherenceDir = path.join(tmpDir, '.claude', 'coherence');
  mkdirSync(coherenceDir, { recursive: true });
});
afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

async function newStore() {
  const { StateStore } = await import('../../../src/state/stateStore.js');
  const quarantineDir = path.join(coherenceDir, 'quarantine');
  mkdirSync(quarantineDir, { recursive: true });
  return new StateStore(coherenceDir, quarantineDir);
}

describe('evaluateTriggerContracts (M-TRIGGER-1)', () => {
  it('returns empty array when metrics.jsonl absent (fresh install)', async () => {
    const { evaluateTriggerContracts } = await import(
      '../../../src/state/triggerContracts.js'
    );
    const store = await newStore();
    const hints = await evaluateTriggerContracts(store, coherenceDir);
    expect(hints).toEqual([]);
  });

  it('returns TC-1 hint when cross-kind rate exceeds 25% over 30 days and not yet emitted', async () => {
    const now = new Date();
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      const ts = new Date(now.getTime() - i * 60_000 * 60).toISOString();
      const kind = i < 30 ? 'code_to_doc' : 'doc_to_doc';
      lines.push(JSON.stringify({ event: 'proposal_proposed', kind, ts }));
    }
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), lines.join('\n'));

    const { evaluateTriggerContracts } = await import(
      '../../../src/state/triggerContracts.js'
    );
    const store = await newStore();
    const hints = await evaluateTriggerContracts(store, coherenceDir);
    expect(hints.some((h) => h.includes('Author-planner readiness'))).toBe(true);
  });

  it('does not emit TC-1 hint again once tc1_hint_emitted_at is set', async () => {
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), '');
    const triggerStatePath = path.join(coherenceDir, 'trigger-state.json');
    writeFileSync(
      triggerStatePath,
      JSON.stringify({ tc1_hint_emitted_at: new Date().toISOString() }),
    );

    const { evaluateTriggerContracts } = await import(
      '../../../src/state/triggerContracts.js'
    );
    const store = await newStore();
    const hints = await evaluateTriggerContracts(store, coherenceDir);
    expect(hints.some((h) => h.includes('Author-planner'))).toBe(false);
  });

  it('returns TC-2 hint when session count >= 50 and day span >= 30', async () => {
    const now = new Date();
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      const daysAgo = Math.floor(i * 0.6);
      const ts = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
      lines.push(JSON.stringify({ event: 'session_start', session_id: `sid-${i}`, ts }));
    }
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), lines.join('\n'));

    const { evaluateTriggerContracts } = await import(
      '../../../src/state/triggerContracts.js'
    );
    const store = await newStore();
    const hints = await evaluateTriggerContracts(store, coherenceDir);
    expect(hints.some((h) => h.includes('Field calibration threshold'))).toBe(true);
  });
});
