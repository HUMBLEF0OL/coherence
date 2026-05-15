/**
 * /coherence:plan router contract tests (C3).
 *
 * Parse-only dispatcher mirroring `proposeRouter`. See its docstring for
 * design rationale.
 */
import { describe, it, expect } from 'vitest';
import { routePlan } from '../../../src/commands/planRouter.js';

describe('routePlan', () => {
  it('dispatches accept to the accept subcommand', async () => {
    const result = await routePlan(['accept', 'abc1234/p_42'], { dry: true });
    expect(result.subcommand).toBe('accept');
    expect(result.target).toBe('abc1234/p_42');
  });

  it('lists subcommands when called with no args', async () => {
    const result = await routePlan([], { dry: true });
    expect(result.subcommand).toBe('help');
    expect(result.helpText).toContain('accept');
    expect(result.helpText).toContain('create');
    expect(result.helpText).toContain('reject');
  });

  it('errors clearly on unknown subcommand', async () => {
    await expect(routePlan(['frobnicate'], { dry: true })).rejects.toThrow(
      /unknown subcommand: frobnicate/i,
    );
  });
});
