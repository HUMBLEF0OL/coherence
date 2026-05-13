/**
 * v1.0 M3 — /coherence:audit --deep flag-based confirmation gate
 * (M-AUDIT-2, M-AUDIT-3).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { StateStore } from '../../src/state/stateStore.js';
import { handleDeepAudit, computeSignature } from '../../src/audit/deepConsistency.js';

let tmp: string;
let store: StateStore;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-deep-'));
  const cd = path.join(tmp, '.claude', 'coherence');
  mkdirSync(cd, { recursive: true });
  mkdirSync(path.join(cd, 'quarantine'), { recursive: true });
  store = new StateStore(cd, path.join(cd, 'quarantine'));
});
afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } });

function seedSectionIndex(sections: Array<{ sectionRef: string; content: string }>): void {
  const fp = path.join(tmp, '.claude', 'coherence', 'section-index.json');
  writeFileSync(fp, JSON.stringify({ entries: sections }, null, 2), 'utf8');
}

describe('handleDeepAudit flag-based confirmation', () => {
  it('first call without --confirm-deep prints estimate + signature, no LLM call', async () => {
    seedSectionIndex([
      { sectionRef: 'a.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolA AnotherOne MoreText' },
      { sectionRef: 'b.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolB AnotherOne MoreText' },
    ]);
    const out = await handleDeepAudit({ store, projectRoot: tmp, argv: ['--deep'], sessionId: 'sess' });
    expect(out).toContain('estimate');
    expect(out).toMatch(/Signature: `[0-9a-f]{12}`/);
    expect(out).toContain('Re-run with `--confirm-deep');
    expect(out).not.toContain('## `a.md#s` ↔ `b.md#s`');
  });

  it('correct signature on confirm leads to consistency-pass report', async () => {
    seedSectionIndex([
      { sectionRef: 'a.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolA AnotherOne MoreText' },
      { sectionRef: 'b.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolB AnotherOne MoreText' },
    ]);
    const first = await handleDeepAudit({ store, projectRoot: tmp, argv: ['--deep'], sessionId: 'sess' });
    const sig = /Signature: `([0-9a-f]{12})`/.exec(first)?.[1];
    expect(sig).toBeDefined();
    const second = await handleDeepAudit({
      store,
      projectRoot: tmp,
      argv: ['--deep', '--confirm-deep', sig!],
      sessionId: 'sess',
    });
    expect(second).toContain('consistency pass');
    expect(second).toContain('## `a.md#s` ↔ `b.md#s`');
  });

  it('stale signature on confirm throws', async () => {
    seedSectionIndex([
      { sectionRef: 'a.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolA AnotherOne MoreText' },
      { sectionRef: 'b.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolB AnotherOne MoreText' },
    ]);
    await expect(
      handleDeepAudit({
        store,
        projectRoot: tmp,
        argv: ['--deep', '--confirm-deep', '000000000000'],
        sessionId: 'sess',
      }),
    ).rejects.toThrow(/does not match the current pair-list signature/);
  });

  it('no candidate pairs short-circuits (no LLM call, no estimate)', async () => {
    seedSectionIndex([
      { sectionRef: 'a.md#s', content: 'unique1 unique2' },
      { sectionRef: 'b.md#s', content: 'unique3 unique4' },
    ]);
    const out = await handleDeepAudit({ store, projectRoot: tmp, argv: ['--deep'], sessionId: 'sess' });
    expect(out).toContain('no candidate pairs');
  });

  it('--no-confirm honoured only when CI=true', async () => {
    seedSectionIndex([
      { sectionRef: 'a.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolA AnotherOne MoreText' },
      { sectionRef: 'b.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolB AnotherOne MoreText' },
    ]);
    const before = process.env.CI;
    try {
      process.env.CI = 'true';
      const out = await handleDeepAudit({
        store,
        projectRoot: tmp,
        argv: ['--deep', '--no-confirm'],
        sessionId: 'sess',
      });
      expect(out).toContain('consistency pass');
      // Without CI=true, --no-confirm is ignored and estimate is printed
      process.env.CI = '';
      const out2 = await handleDeepAudit({
        store,
        projectRoot: tmp,
        argv: ['--deep', '--no-confirm'],
        sessionId: 'sess',
      });
      expect(out2).toContain('estimate');
    } finally {
      if (before === undefined) delete process.env.CI;
      else process.env.CI = before;
    }
  });
});

describe('computeSignature', () => {
  it('is deterministic for stable pair lists', () => {
    const pairs = [{ a: 'x', b: 'y' }, { a: 'p', b: 'q' }];
    expect(computeSignature(pairs)).toBe(computeSignature(pairs));
  });
  it('changes when pair order changes', () => {
    const a = [{ a: 'x', b: 'y' }, { a: 'p', b: 'q' }];
    const b = [{ a: 'p', b: 'q' }, { a: 'x', b: 'y' }];
    expect(computeSignature(a)).not.toBe(computeSignature(b));
  });
});

describe('--deep LLM call via cassette (FR-AUDIT-5)', () => {
  it('replays cassette and renders the structured verdict per pair', async () => {
    // Set up: section files (so deepConsistency can readSectionBody) +
    // section-index so pair detection finds them.
    const { writeFileSync: ws, mkdirSync: ms, existsSync } = await import('fs');
    ms(path.join(tmp, 'docs'), { recursive: true });
    ws(path.join(tmp, 'docs', 'a.md'), 'shared content for section A', 'utf8');
    ws(path.join(tmp, 'docs', 'b.md'), 'shared content for section B', 'utf8');
    seedSectionIndex([
      { sectionRef: 'docs/a.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolA AnotherOne MoreText' },
      { sectionRef: 'docs/b.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraSymbolB AnotherOne MoreText' },
    ]);

    // First call → estimate + signature
    const first = await handleDeepAudit({ store, projectRoot: tmp, argv: ['--deep'], sessionId: 'sess' });
    const sig = /Signature: `([0-9a-f]{12})`/.exec(first)?.[1];
    expect(sig).toBeDefined();

    // Compute the cassette ID exactly as deepConsistency.ts does
    const { createHash } = await import('crypto');
    const cassetteId = 'audit-deep-' + createHash('sha256')
      .update(`audit_deep|docs/a.md#s|docs/b.md#s|${sig!}`)
      .digest('hex').slice(0, 16);

    // Pre-write the cassette so llmCall replays instead of calling the API.
    const cassetteDir = path.join(tmp, 'cassettes');
    ms(cassetteDir, { recursive: true });
    const cassettePath = path.join(cassetteDir, `${cassetteId}.json`);
    ws(cassettePath, JSON.stringify({
      content: '{ "consistent": false, "issues": ["A says X; B says NOT X"] }',
      input_tokens: 100,
      output_tokens: 30,
      cost_usd: 0.001,
      timestamp: new Date().toISOString(),
    }), 'utf8');
    // The cassette layer reads COHERENCE_CASSETTES_DIR from env
    const before = process.env.COHERENCE_CASSETTES_DIR;
    process.env.COHERENCE_CASSETTES_DIR = cassetteDir;
    try {
      void existsSync;
      const second = await handleDeepAudit({
        store, projectRoot: tmp, argv: ['--deep', '--confirm-deep', sig!], sessionId: 'sess',
      });
      expect(second).toContain('INCONSISTENT');
      expect(second).toContain('A says X; B says NOT X');
    } finally {
      if (before === undefined) delete process.env.COHERENCE_CASSETTES_DIR;
      else process.env.COHERENCE_CASSETTES_DIR = before;
    }
  });
});

describe('symbol-index cache hit (M-AUDIT-3)', () => {
  it('second loadOrBuildIndex call returns the cached entry without rebuilding', async () => {
    seedSectionIndex([
      { sectionRef: 'a.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraA' },
      { sectionRef: 'b.md#s', content: 'sharedSymbolOne sharedSymbolTwo sharedSymbolThree extraB' },
    ]);
    const { loadOrBuildIndex } = await import('../../src/audit/sectionSymbolIndex.js');
    const first = await loadOrBuildIndex(tmp);
    const firstBuiltAt = first.built_at;
    // Wait long enough that a rebuild would have a different built_at timestamp.
    await new Promise((r) => setTimeout(r, 25));
    const second = await loadOrBuildIndex(tmp);
    expect(second.built_at).toBe(firstBuiltAt);
    expect(second.source_index_hash).toBe(first.source_index_hash);
    expect(second.registry_hash).toBe(first.registry_hash);
  });

  it('cache is invalidated when section-index.json hash changes', async () => {
    seedSectionIndex([{ sectionRef: 'a.md#s', content: 'oneSymbol twoSymbol threeSymbol' }]);
    const { loadOrBuildIndex } = await import('../../src/audit/sectionSymbolIndex.js');
    const first = await loadOrBuildIndex(tmp);
    // Mutate the section index so its hash changes.
    seedSectionIndex([{ sectionRef: 'a.md#s', content: 'differentSymbolNow' }]);
    const second = await loadOrBuildIndex(tmp);
    expect(second.source_index_hash).not.toBe(first.source_index_hash);
  });
});
