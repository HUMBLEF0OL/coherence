/**
 * /coherence:propose router contract tests (C3).
 *
 * The router is a parse-only dispatcher: it identifies the subcommand and
 * the first positional arg, and emits help when called bare. Actual handler
 * invocation lives in the underlying `runProposeAccept` etc. functions —
 * the router does NOT call them, because each handler takes its own complex
 * arg shape (StateStore + projectRoot context) that the router cannot
 * synthesise from a string array alone.
 */
import { describe, it, expect } from 'vitest';
import { routePropose } from '../../../src/commands/proposeRouter.js';

describe('routePropose', () => {
  it('dispatches accept to the accept subcommand', async () => {
    const result = await routePropose(['accept', 'install-section'], { dry: true });
    expect(result.subcommand).toBe('accept');
    expect(result.target).toBe('install-section');
  });

  it('lists subcommands when called with no args', async () => {
    const result = await routePropose([], { dry: true });
    expect(result.subcommand).toBe('help');
    expect(result.helpText).toContain('accept');
    expect(result.helpText).toContain('list');
    expect(result.helpText).toContain('reject');
    expect(result.helpText).toContain('revert-acceptance');
    expect(result.helpText).toContain('show');
  });

  it('errors clearly on unknown subcommand', async () => {
    await expect(routePropose(['frobnicate'], { dry: true })).rejects.toThrow(
      /unknown subcommand: frobnicate/i,
    );
  });

  it('returns the trailing positional args verbatim for downstream handlers', async () => {
    const result = await routePropose(['revert-acceptance', 'p_42'], { dry: true });
    expect(result.subcommand).toBe('revert-acceptance');
    expect(result.target).toBe('p_42');
  });
});
