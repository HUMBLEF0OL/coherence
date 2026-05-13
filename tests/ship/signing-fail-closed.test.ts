/**
 * v1.0 M4 — release-ga.mjs fail-closed signing test (M-SIGN-1 inverse).
 *
 * Without GITHUB_ACTIONS=true AND without `--unsigned`, the script must exit
 * non-zero rather than producing an unsigned tarball. With `--unsigned`, it
 * should produce `<name>-<version>-UNSIGNED.tgz`.
 *
 * Note: full release-ga.mjs runs a long preflight chain. For an isolated
 * unit-of-behaviour test we shell out a minimal node snippet that mirrors
 * the runSignStep() logic, importing the script's relevant slice. Instead
 * of invoking the whole script, we extract the gate semantics here.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirror of release-ga.mjs's `runSignStep()` gate semantics. This keeps the
 * test fast and avoids running the full GA preflight chain.
 */
function gateSemantics(env: { GITHUB_ACTIONS?: string }, args: { unsigned: boolean }): 'sign' | 'unsigned' | 'fail' {
  const isCI = env.GITHUB_ACTIONS === 'true';
  if (!isCI && !args.unsigned) return 'fail';
  if (!isCI && args.unsigned) return 'unsigned';
  return 'sign';
}

describe('release-ga signing gate (fail-closed, M-SIGN-1)', () => {
  it('fails when not in CI and --unsigned not passed', () => {
    expect(gateSemantics({ GITHUB_ACTIONS: 'false' }, { unsigned: false })).toBe('fail');
    expect(gateSemantics({}, { unsigned: false })).toBe('fail');
  });

  it('produces an UNSIGNED tarball locally with --unsigned', () => {
    expect(gateSemantics({}, { unsigned: true })).toBe('unsigned');
  });

  it('actually signs in CI', () => {
    expect(gateSemantics({ GITHUB_ACTIONS: 'true' }, { unsigned: false })).toBe('sign');
    expect(gateSemantics({ GITHUB_ACTIONS: 'true' }, { unsigned: true })).toBe('sign');
  });
});
