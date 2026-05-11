/**
 * v0.3 audit-3 B4 — trickle scanner consults tombstone before reading.
 *
 * Plan §M5: tombstone consultation BEFORE disk read; misses populate
 * the tombstone after scan. Prior to audit-3 the trickle path in
 * postToolUse never imported the tombstone module.
 *
 * This test seeds the trickle preconditions (idle past threshold, cap
 * not reached, anchored doc on disk) so a trickle pass actually runs,
 * then asserts the tombstones.json file lands and contains the scanned
 * file's hash. A second pass on the same unchanged file is a no-op
 * because the tombstone hit short-circuits the per-doc loop.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { postToolUseHook, _resetPostToolUseIdleState } from '../../src/hooks/postToolUse.js';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import {
  readScanCacheState,
  writeScanCacheState,
} from '../../src/scanner/trickleScanner.js';
import { tombstoneStatePath } from '../../src/scanner/scanCacheTombstone.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-trickle-tomb-'));
  await initCoherenceDir(dir);
  _resetPostToolUseIdleState();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function relaxTrickleGuards(): Promise<void> {
  // Lower idle threshold to 0 so any PostToolUse run is "idle enough" to
  // trigger a trickle pass.
  const store = makeStateStore(dir);
  const state = await readScanCacheState(store);
  await writeScanCacheState(store, {
    ...state,
    idle_threshold_ms: 0,
    per_session_cap: 50,
  });
}

describe('trickle × tombstone (audit-3 B4)', () => {
  it('first trickle pass writes tombstones.json with the scanned doc', async () => {
    await relaxTrickleGuards();
    const file = path.join(dir, 'docs', 'intro.md');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      '<!-- coherence:section intro -->\n# Intro\n\nbody\n',
    );

    // Two PostToolUse fires so the second one's idleMs > 0 (first one only
    // records last_fire_ms; second fires the trickle pass).
    await postToolUseHook({ tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 's' }, dir);
    await new Promise((r) => setTimeout(r, 5));
    await postToolUseHook({ tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 's' }, dir);

    const coherenceDir = path.join(dir, '.claude', 'coherence');
    const tombPath = tombstoneStatePath(coherenceDir);
    expect(existsSync(tombPath)).toBe(true);
    const tomb = JSON.parse(readFileSync(tombPath, 'utf8')) as {
      entries: Record<string, { path_hash: string; content_hash: string }>;
    };
    // Normalised key uses forward-slashes + (on win32/darwin) lowercased.
    const key = Object.keys(tomb.entries).find((k) => k.endsWith('docs/intro.md'));
    expect(key).toBeDefined();
    expect(tomb.entries[key!].path_hash).toMatch(/^[0-9a-f]{12}$/);
    expect(tomb.entries[key!].content_hash).toMatch(/^[0-9a-f]{12}$/);
  });
});
