/**
 * Change-class recount tests.
 * DD-017, FR-STOP-6b
 */
import { describe, it, expect } from 'vitest';
import { recomputeChangeClass, isFrontmatterOnlyDiff } from '../../../src/validation/sanity.js';
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

// ── v1.0.1 Fix 5 — isFrontmatterOnlyDiff regression (BUG-V1.0-B) ────────
//
// Pre-fix bug: the function treated the unified-diff file header
// `--- a/path/to/file.md` as a YAML frontmatter `---` delimiter. Every
// markdown patch returned `true`, forcing all modifying patches into
// manual review and structurally killing the trust ladder.
//
// These tests assert the function returns the right verdict across the
// full diff-shape surface a Stage 2 patch writer can emit.

describe('isFrontmatterOnlyDiff (v1.0.1 BUG-V1.0-B regression)', () => {
  it('returns false for a vanilla markdown body edit (the bug repro)', () => {
    const diff = [
      '--- a/docs/README.md',
      '+++ b/docs/README.md',
      '@@ -1,3 +1,3 @@',
      ' # heading',
      '-old text',
      '+new text',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(false);
  });

  it('returns false for an additive body edit (no frontmatter touched)', () => {
    const diff = [
      '--- a/docs/api.md',
      '+++ b/docs/api.md',
      '@@ -10,2 +10,3 @@',
      ' Existing line.',
      '+Added paragraph.',
      ' Another existing line.',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(false);
  });

  it('returns true for a change that lives strictly inside the frontmatter', () => {
    const diff = [
      '--- a/SKILL.md',
      '+++ b/SKILL.md',
      '@@ -1,5 +1,5 @@',
      ' ---',
      '-name: old-name',
      '+name: new-name',
      ' description: x',
      ' ---',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(true);
  });

  it('returns false when changes cross out of the frontmatter into body', () => {
    const diff = [
      '--- a/SKILL.md',
      '+++ b/SKILL.md',
      '@@ -1,6 +1,6 @@',
      ' ---',
      '-name: old',
      '+name: new',
      ' ---',
      '-Body line removed.',
      '+Body line replaced.',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(false);
  });

  it('returns false for a diff that adds a fresh frontmatter block AND body content', () => {
    const diff = [
      '--- a/new.md',
      '+++ b/new.md',
      '@@ -0,0 +1,4 @@',
      '+---',
      '+title: x',
      '+---',
      '+# heading',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(false);
  });

  it('returns false on an empty / pure-metadata diff (no changes at all)', () => {
    const diff = [
      '--- a/file.md',
      '+++ b/file.md',
      '@@ -1,1 +1,1 @@',
      ' unchanged',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(false);
  });

  it('ignores git-extended-format metadata (diff --git, index ...) before the file headers', () => {
    const diff = [
      'diff --git a/SKILL.md b/SKILL.md',
      'index 9097294..1ca029a 100644',
      '--- a/SKILL.md',
      '+++ b/SKILL.md',
      '@@ -1,5 +1,5 @@',
      ' ---',
      '-name: old',
      '+name: new',
      ' description: x',
      ' ---',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(true);
  });

  it('handles renamed files without misclassifying the body edit as frontmatter', () => {
    const diff = [
      'diff --git a/old.md b/new.md',
      'similarity index 95%',
      'rename from old.md',
      'rename to new.md',
      '--- a/old.md',
      '+++ b/new.md',
      '@@ -3,3 +3,3 @@',
      ' context',
      '-Body change.',
      '+Body change updated.',
    ].join('\n');
    expect(isFrontmatterOnlyDiff(diff)).toBe(false);
  });
});
