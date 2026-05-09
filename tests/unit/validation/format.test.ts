/**
 * Stage 2 format validation tests.
 */
import { describe, it, expect } from 'vitest';
import { parseStage2Response } from '../../../src/validation/format.js';

const VALID_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,3 +1,3 @@
 # API
-Old description.
+New description.
`;

describe('parseStage2Response', () => {
  it('parses NO_PATCH_NEEDED', () => {
    expect(parseStage2Response('NO_PATCH_NEEDED')).toMatchObject({ kind: 'no-patch' });
  });

  it('parses ESCALATE', () => {
    expect(parseStage2Response('ESCALATE')).toMatchObject({ kind: 'escalate' });
  });

  it('parses PLAN_DISAGREES with reason', () => {
    const r = parseStage2Response('PLAN_DISAGREES this section is unrelated');
    expect(r).toMatchObject({ kind: 'plan-disagrees', reason: 'this section is unrelated' });
  });

  it('parses a valid unified diff', () => {
    const r = parseStage2Response(VALID_DIFF);
    expect(r.kind).toBe('diff');
    if (r.kind === 'diff') {
      expect(r.files.length).toBeGreaterThan(0);
    }
  });

  it('rejects random prose', () => {
    const r = parseStage2Response('Here is my patch for your review...');
    expect(r.kind).toBe('invalid');
  });

  it('trims whitespace before checking', () => {
    expect(parseStage2Response('  NO_PATCH_NEEDED  ')).toMatchObject({ kind: 'no-patch' });
  });
});
