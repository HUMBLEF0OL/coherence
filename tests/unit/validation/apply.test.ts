/**
 * v1.0.1 Fix 4 — apply-gate trailing-newline regression (BUG-V1.0-A).
 *
 * Pre-fix bug: Stage 2's `parseStage2Response` strips trailing whitespace
 * from LLM output (including the terminating `\n` of a unified diff).
 * The trimmed diff is then handed to `checkApplies`, which writes it
 * verbatim and runs `git apply --check`. Without a terminating newline,
 * `git apply` rejects every otherwise-valid diff with "corrupt patch at
 * line N", silently breaking coherence's main happy path.
 *
 * These tests:
 *   - Build a fresh git work tree with a known file.
 *   - Construct a valid unified diff that targets that file.
 *   - Trim the diff (mirroring what `parseStage2Response` does) and run
 *     `checkApplies` against the project root.
 *   - Assert the apply gate accepts the diff (the v1.0.0 implementation
 *     would have rejected it).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import { checkApplies } from '../../../src/validation/apply.js';

let tmpRepo: string;

beforeEach(() => {
  tmpRepo = mkdtempSync(path.join(os.tmpdir(), 'cohrence-apply-gate-'));
  mkdirSync(path.join(tmpRepo, 'docs'), { recursive: true });
  // Seed a known file and initialise the repo.
  writeFileSync(
    path.join(tmpRepo, 'docs', 'api.md'),
    [
      '# API',
      '',
      'The function `gradeBelow(actual, threshold)` returns a boolean.',
      'See `packages/cli/src/grade.ts` for the implementation.',
      '',
    ].join('\n'),
    'utf8',
  );
  execFileSync('git', ['init', '--quiet'], { cwd: tmpRepo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'], { cwd: tmpRepo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'seed'], { cwd: tmpRepo });
});

afterEach(() => {
  try { rmSync(tmpRepo, { recursive: true, force: true }); } catch { /* */ }
});

const VALID_DIFF = [
  '--- a/docs/api.md',
  '+++ b/docs/api.md',
  '@@ -1,4 +1,4 @@',
  ' # API',
  ' ',
  '-The function `gradeBelow(actual, threshold)` returns a boolean.',
  '+The function `isBelowThreshold(actual, threshold)` returns a boolean.',
  ' See `packages/cli/src/grade.ts` for the implementation.',
  '',
].join('\n');

describe('checkApplies — trailing-newline robustness (v1.0.1 BUG-V1.0-A)', () => {
  it('accepts a diff WITH a trailing newline (sanity check — the baseline)', () => {
    const r = checkApplies(VALID_DIFF, tmpRepo);
    expect(r.applies).toBe(true);
    expect(r.error).toBeNull();
  });

  it('accepts a diff WITHOUT a trailing newline (the BUG-A repro path)', () => {
    // This is exactly the bytes `parseStage2Response` produces today —
    // `raw.trim()` strips the terminating newline.
    const trimmed = VALID_DIFF.trim();
    expect(trimmed.endsWith('\n')).toBe(false);
    const r = checkApplies(trimmed, tmpRepo);
    // Without the fix, this would fail with "corrupt patch at line N".
    expect(r.applies).toBe(true);
    expect(r.error).toBeNull();
  });

  it('still rejects a genuinely malformed diff (apply gate is not a no-op)', () => {
    const malformed = [
      '--- a/docs/api.md',
      '+++ b/docs/api.md',
      '@@ -1,5 +1,5 @@',
      ' NONEXISTENT CONTEXT LINE',
      '-Some line that does not exist.',
      '+Some replacement.',
    ].join('\n');
    const r = checkApplies(malformed, tmpRepo);
    expect(r.applies).toBe(false);
    expect(r.error).not.toBeNull();
  });

  it('handles a diff with CRLF line terminators by treating it as-is', () => {
    // Coherence shouldn't crash if a diff somehow carries CRLF (e.g.
    // pasted from a Windows-recorded cassette). The fix preserves the
    // bytes; whether git apply accepts depends on the file's EOL.
    const crlfDiff = VALID_DIFF.replace(/\n/g, '\r\n');
    const r = checkApplies(crlfDiff, tmpRepo);
    // We don't assert applies=true here (CRLF vs LF in the target may
    // make git reject it). We only assert the function doesn't throw.
    expect(typeof r.applies).toBe('boolean');
  });
});
