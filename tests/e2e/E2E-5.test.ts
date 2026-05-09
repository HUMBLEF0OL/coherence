/**
 * E2E-5: Hallucination rejection — strict-tier unknown tokens cause patch failure.
 */
import { describe, it, expect } from 'vitest';
import { checkHallucination } from '../../src/validation/hallucination.js';

describe('E2E-5: hallucination rejection', () => {
  it('completely unknown import path in diff → strict fail', () => {
    const diffRaw = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,3 +1,4 @@
 # API
+See also: import { FabulousWidget } from "@nonexistent/package/deep/path"

 Content.`;

    const result = checkHallucination(diffRaw, [], []);
    expect(result.passed).toBe(false);
  });

  it('token from changed files → not hallucination', () => {
    const diffRaw = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,3 @@
 # API
+See AuthService for details.
 Content.`;

    const result = checkHallucination(diffRaw, ['class AuthService {}'], ['class AuthService {}']);
    expect(result.passed).toBe(true);
  });

  it('3+ loose-only tokens demote class but do not fail', () => {
    const diffRaw = `--- a/docs/api.md
+++ b/docs/api.md
@@ -1,2 +1,3 @@
 # API
+tokenAlpha.tokenBeta tokenGamma.tokenDelta tokenEpsilon.tokenZeta
 Content.`;

    const projectFiles = ['tokenAlpha.tokenBeta tokenGamma.tokenDelta tokenEpsilon.tokenZeta'];
    const result = checkHallucination(diffRaw, [], projectFiles);
    expect(result.passed).toBe(true);
    expect(result.demoteClass).toBe(true);
  });
});
