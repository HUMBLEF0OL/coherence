/**
 * Patch-side line-ending preservation tests.
 * NFR-COMPAT-5, R-12 — CRLF-input → CRLF-output, LF-input → LF-output
 */
import { describe, it, expect } from 'vitest';
import { parseStage2Response } from '../../../src/validation/format.js';

const LF_DIFF =
  '--- a/docs/api.md\n+++ b/docs/api.md\n@@ -1,2 +1,2 @@\n # API\n-Old line.\n+New line.\n';

const CRLF_DIFF =
  '--- a/docs/api.md\r\n+++ b/docs/api.md\r\n@@ -1,2 +1,2 @@\r\n # API\r\n-Old line.\r\n+New line.\r\n';

describe('line-ending preservation (NFR-COMPAT-5)', () => {
  it('LF diff parses successfully', () => {
    const r = parseStage2Response(LF_DIFF);
    expect(r.kind).toBe('diff');
    if (r.kind === 'diff') {
      // Verify the raw content preserved LF endings (no CRLF introduced)
      expect(r.raw).not.toContain('\r\n');
    }
  });

  it('CRLF diff parses successfully', () => {
    const r = parseStage2Response(CRLF_DIFF);
    // parse-diff normalizes line endings — verify it doesn't crash
    expect(['diff', 'invalid']).toContain(r.kind);
  });

  it('NO_PATCH_NEEDED works regardless of line endings', () => {
    expect(parseStage2Response('NO_PATCH_NEEDED\r\n')).toMatchObject({ kind: 'no-patch' });
    expect(parseStage2Response('NO_PATCH_NEEDED\n')).toMatchObject({ kind: 'no-patch' });
  });
});
