/**
 * v0.3 audit-3 B1 — PostToolUse populates scope-cache on miss.
 *
 * Plan TS-2 promised: "PostToolUse adds scope-cache consultation … cache
 * hit → use chain; miss → walk + populate + emit `scope_cache_miss`."
 * Prior to audit-3 this was unwired (only /coherence:scope-debug ever
 * populated the cache). This test asserts the cache entry lands after a
 * PostToolUse fire with a filePath in scope.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { postToolUseHook, _resetPostToolUseIdleState } from '../../src/hooks/postToolUse.js';
import { initCoherenceDir } from '../../src/state/init.js';
import { resetScopeCacheMissCounter } from '../../src/state/scope/cache.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pto-scope-'));
  await initCoherenceDir(dir);
  _resetPostToolUseIdleState();
  resetScopeCacheMissCounter();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('PostToolUse × scope-cache (audit-3 B1)', () => {
  it('populates scope-cache.json on first PostToolUse with a filePath', async () => {
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    const file = path.join(dir, 'docs', 'intro.md');
    writeFileSync(file, '# x\n');
    writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      '# project rules\n',
    );

    const r = await postToolUseHook(
      { tool_name: 'Edit', tool_input: { file_path: file }, session_id: 's1' },
      dir,
    );
    expect(r.success).toBe(true);

    const cachePath = path.join(dir, '.claude', 'coherence', 'scope-cache.json');
    expect(existsSync(cachePath)).toBe(true);
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      entries: Record<string, { ancestor_chain: Array<{ file: string }> }>;
    };
    const entry = cache.entries[file];
    expect(entry).toBeDefined();
    expect(entry.ancestor_chain.some((a) => a.file === path.join(dir, 'CLAUDE.md'))).toBe(true);
  });

  it('emits scope_cache_miss on the first cache miss (1:100 sampling — first call always fires)', async () => {
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    const file = path.join(dir, 'docs', 'intro.md');
    writeFileSync(file, '# x\n');

    await postToolUseHook(
      { tool_name: 'Edit', tool_input: { file_path: file }, session_id: 's1' },
      dir,
    );

    const metricsPath = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
    expect(existsSync(metricsPath)).toBe(true);
    const events = readFileSync(metricsPath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { event: string });
    expect(events.some((e) => e.event === 'scope_cache_miss')).toBe(true);
  });

  it('subsequent identical PostToolUse hits the cache (no second scope_cache_miss for the same file)', async () => {
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    const file = path.join(dir, 'docs', 'intro.md');
    writeFileSync(file, '# x\n');

    // First call → miss.
    await postToolUseHook(
      { tool_name: 'Edit', tool_input: { file_path: file }, session_id: 's1' },
      dir,
    );
    const metricsBefore = readFileSync(
      path.join(dir, '.claude', 'coherence', 'metrics.jsonl'),
      'utf8',
    )
      .trim()
      .split('\n')
      .filter((l) => JSON.parse(l).event === 'scope_cache_miss').length;

    // Second call on same file → hit (no NEW scope_cache_miss).
    await postToolUseHook(
      { tool_name: 'Edit', tool_input: { file_path: file }, session_id: 's2' },
      dir,
    );
    const metricsAfter = readFileSync(
      path.join(dir, '.claude', 'coherence', 'metrics.jsonl'),
      'utf8',
    )
      .trim()
      .split('\n')
      .filter((l) => JSON.parse(l).event === 'scope_cache_miss').length;

    expect(metricsAfter).toBe(metricsBefore);
  });
});
