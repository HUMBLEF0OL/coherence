/**
 * Hallucination detector tests.
 * DD-032/047, FR-STOP-7
 */
import { describe, it, expect } from 'vitest';
import { checkHallucination } from '../../../src/validation/hallucination.js';

const CLEAN_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,2 @@
 # API
-Old endpoint: /api/v1/users
+Updated endpoint: /api/v2/users
`;

// Diff referencing a token that's in the project files
const KNOWN_TOKEN_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,2 @@
 # API
-Old description
+Use getUserById function
`;

// Diff referencing an invented function not found anywhere
const HALLUCINATED_DIFF = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,2 @@
 # API
-Old description
+Call the xQzFabulousInvent.doMagicThing99() method
`;

describe('checkHallucination', () => {
  it('passes diff with tokens from changed files', () => {
    const changedFiles = ['const endpoint = "/api/v2/users"; // Updated endpoint'];
    const r = checkHallucination(CLEAN_DIFF, changedFiles, changedFiles);
    expect(r.passed).toBe(true);
  });

  it('passes diff referencing known function', () => {
    const changed = ['function getUserById(id) { return db.users.find(id); }'];
    const r = checkHallucination(KNOWN_TOKEN_DIFF, changed, changed);
    expect(r.passed).toBe(true);
  });

  it('fails diff with hallucinated strict-tier tokens', () => {
    const r = checkHallucination(HALLUCINATED_DIFF, ['existing content only'], ['existing content only']);
    expect(r.passed).toBe(false);
    expect(r.unknownStrictTokens.length).toBeGreaterThan(0);
  });

  it('flags ≥3 loose-only unknown tokens for class demotion (FR-STOP-7)', () => {
    // Create a diff with compound tokens known only in project files (loose tier, not changed files)
    const looseOnlyDiff = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,2 @@
 # API
-Old
+tokenAlpha.tokenBeta tokenGamma.tokenDelta tokenEpsilon.tokenZeta tokenOmega.tokenSigma
`;
    // Project files contain these compound tokens (as written)
    const changedFiles = ['minimal content'];
    const projectFiles = ['tokenAlpha.tokenBeta tokenGamma.tokenDelta tokenEpsilon.tokenZeta tokenOmega.tokenSigma are helper methods'];
    const r = checkHallucination(looseOnlyDiff, changedFiles, projectFiles);
    // Tokens exist in project files → passed=true (loose-only, just demoted)
    expect(r.passed).toBe(true);
    expect(r.demoteClass).toBe(true);
  });
});
