/**
 * R7 fix coverage: SessionStart resets entries_this_session to 0 so the
 * trickle per-session cap is genuinely per-session.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { sessionStartHook } from '../../src/hooks/sessionStart.js';
import { initCoherenceDir } from '../../src/state/init.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-trickle-reset-'));
  await initCoherenceDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('R7: SessionStart resets trickle entries_this_session', () => {
  it('non-zero counter is reset to 0 on SessionStart', async () => {
    const scanCachePath = path.join(
      dir,
      '.claude',
      'coherence',
      'scan-cache',
      'state.json',
    );
    const initial = JSON.parse(readFileSync(scanCachePath, 'utf8'));
    // Simulate a prior session having scanned 18 entries.
    writeFileSync(
      scanCachePath,
      JSON.stringify({ ...initial, entries_this_session: 18 }, null, 2),
    );
    await sessionStartHook({ session_id: 's-fresh' }, dir);
    const after = JSON.parse(readFileSync(scanCachePath, 'utf8'));
    expect(after.entries_this_session).toBe(0);
    // Other fields preserved.
    expect(after.per_session_cap).toBe(initial.per_session_cap);
    expect(after.idle_threshold_ms).toBe(initial.idle_threshold_ms);
  });

  it('zero counter is unchanged (no spurious write)', async () => {
    const scanCachePath = path.join(
      dir,
      '.claude',
      'coherence',
      'scan-cache',
      'state.json',
    );
    const before = readFileSync(scanCachePath, 'utf8');
    await sessionStartHook({ session_id: 's' }, dir);
    const after = readFileSync(scanCachePath, 'utf8');
    // entries_this_session was already 0; the hook should not rewrite.
    const beforeJson = JSON.parse(before);
    const afterJson = JSON.parse(after);
    expect(afterJson.entries_this_session).toBe(0);
    expect(afterJson.entries_this_session).toBe(beforeJson.entries_this_session);
  });
});
