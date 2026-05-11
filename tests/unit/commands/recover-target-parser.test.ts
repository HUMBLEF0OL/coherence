/**
 * v0.3 audit-3 B5 — `/coherence:recover` arg parser.
 *
 * Verifies `--target <tag>` reaches the structured `RecoverOptions.target`
 * field and that a bare positional is also accepted.
 */
import { describe, it, expect } from 'vitest';
import { parseRecoverArgs } from '../../../src/commands/recover.js';

describe('parseRecoverArgs (B5)', () => {
  it('--target <tag> populates options.target', () => {
    expect(parseRecoverArgs(['--target', 'v0.2.0'])).toEqual({ target: 'v0.2.0' });
  });

  it('bare positional is interpreted as the target tag', () => {
    expect(parseRecoverArgs(['v0.3.0'])).toEqual({ target: 'v0.3.0' });
  });

  it('returns empty options when no args supplied', () => {
    expect(parseRecoverArgs([])).toEqual({});
  });

  it('unknown --flags are ignored without throwing', () => {
    expect(parseRecoverArgs(['--unknown', 'value', '--target', 'v0.2.0'])).toEqual({
      target: 'v0.2.0',
    });
  });
});
