/**
 * v0.3 audit-4 A — scope-cache survives concurrent read-modify-write.
 *
 * Two parallel postToolUse hooks on different files race the cache
 * read-modify-write. Without `withCacheLock('scope-cache', ...)`, the
 * second writer's entry would be overwritten by the first's, losing data.
 * This test launches N concurrent hooks and asserts every entry survives.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { postToolUseHook, _resetPostToolUseIdleState } from '../../src/hooks/postToolUse.js';
import { initCoherenceDir } from '../../src/state/init.js';
import { resetScopeCacheMissCounter } from '../../src/state/scope/cache.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-scope-conc-'));
  await initCoherenceDir(dir);
  _resetPostToolUseIdleState();
  resetScopeCacheMissCounter();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scope-cache concurrent write (audit-4 A)', () => {
  /**
   * 20 concurrent PostToolUse hooks on distinct files all land in the cache.
   * The Promise-queue mutex (`withInProcessMutex`) serialises the RMW
   * without paying fs-lock retry budgets — well below realistic Claude
   * Code parallelism.
   */
  it('20 parallel PostToolUse hooks on distinct files all land in scope-cache', async () => {
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < 20; i++) {
      const f = path.join(dir, 'docs', `file-${i}.md`);
      writeFileSync(f, '# x\n');
      files.push(f);
    }

    await Promise.all(
      files.map((f) =>
        postToolUseHook(
          { tool_name: 'Edit', tool_input: { file_path: f }, session_id: 's' },
          dir,
        ),
      ),
    );

    const cachePath = path.join(dir, '.claude', 'coherence', 'scope-cache.json');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as {
      entries: Record<string, unknown>;
    };
    for (const f of files) {
      expect(cache.entries[f], `missing entry for ${f}`).toBeDefined();
    }
  });
});
