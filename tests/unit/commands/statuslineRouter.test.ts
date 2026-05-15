/**
 * /coherence:statusline router contract tests (C3).
 *
 * Parse-only dispatcher mirroring `proposeRouter`. See its docstring for
 * design rationale.
 */
import { describe, it, expect } from 'vitest';
import { routeStatusline } from '../../../src/commands/statuslineRouter.js';

describe('routeStatusline', () => {
  it('dispatches install to the install subcommand', async () => {
    const result = await routeStatusline(['install'], { dry: true });
    expect(result.subcommand).toBe('install');
  });

  it('dispatches uninstall to the uninstall subcommand', async () => {
    const result = await routeStatusline(['uninstall'], { dry: true });
    expect(result.subcommand).toBe('uninstall');
  });

  it('lists subcommands when called with no args', async () => {
    const result = await routeStatusline([], { dry: true });
    expect(result.subcommand).toBe('help');
    expect(result.helpText).toContain('install');
    expect(result.helpText).toContain('uninstall');
  });

  it('errors clearly on unknown subcommand', async () => {
    await expect(routeStatusline(['frobnicate'], { dry: true })).rejects.toThrow(
      /unknown subcommand: frobnicate/i,
    );
  });
});
