/**
 * dispatchCoherenceCommand routing (v0.4 DD-130).
 */
import { describe, it, expect } from 'vitest';
import { dispatchCoherenceCommand } from '../../../src/hooks/commandDispatch.js';

describe('dispatchCoherenceCommand (DD-130)', () => {
  it('returns null for unrecognised command names', async () => {
    const result = await dispatchCoherenceCommand(
      'coherence:unknown',
      'some prompt <!-- coherence-command: coherence:unknown -->',
      {} as never,
      '/tmp',
      'sess-1',
    );
    expect(result).toBeNull();
  });
});
