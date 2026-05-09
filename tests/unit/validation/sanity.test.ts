/**
 * Change-class recount tests.
 * DD-017, FR-STOP-6b
 */
import { describe, it, expect } from 'vitest';
import { recomputeChangeClass } from '../../../src/validation/sanity.js';
import parseDiff from 'parse-diff';

function parse(diff: string): ReturnType<typeof parseDiff> {
  return parseDiff(diff);
}

const ADDITIVE_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,3 @@
 # API
+New line added.
 Existing line.
`;

const MODIFYING_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,2 @@
 # API
-Old description.
+New description.
`;

const DESTRUCTIVE_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,3 +1,2 @@
 # API
-Old line.
 Remaining.
`;

const WHITESPACE_ONLY_DEL_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,3 +1,2 @@
 # API
-
+New content.
 End.
`;

describe('recomputeChangeClass', () => {
  it('classifies additive diff correctly', () => {
    const result = recomputeChangeClass(parse(ADDITIVE_DIFF));
    expect(result.changeClass).toBe('additive');
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(0);
  });

  it('classifies modifying diff correctly', () => {
    const result = recomputeChangeClass(parse(MODIFYING_DIFF));
    expect(result.changeClass).toBe('modifying');
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(1);
  });

  it('classifies destructive diff correctly', () => {
    const result = recomputeChangeClass(parse(DESTRUCTIVE_DIFF));
    expect(result.changeClass).toBe('destructive');
    expect(result.removedLines).toBe(1);
  });

  it('ignores whitespace-only deletion lines (DD-017)', () => {
    const result = recomputeChangeClass(parse(WHITESPACE_ONLY_DEL_DIFF));
    // The whitespace-only '-' line is ignored; only '+New content.' counted
    expect(result.removedLines).toBe(0);
    expect(result.changeClass).toBe('additive');
  });
});
