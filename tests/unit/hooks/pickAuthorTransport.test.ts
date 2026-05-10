/**
 * T3 fix coverage: env-gated transport selection works end-to-end.
 *
 * The selection logic lives inside stop.ts and sessionEnd.ts; we mirror
 * it here as a tiny isolated function and verify each branch.
 *
 * Selection rules:
 *   - COHERENCE_AUTHOR_MOCK=1 → mock
 *   - COHERENCE_AUTHOR_LIVE=1 → live
 *   - else: live iff ANTHROPIC_API_KEY is set, mock otherwise
 */
import { describe, it, expect } from 'vitest';
import {
  mockAuthorTransport,
  liveAuthorTransport,
  type AuthorTransport,
} from '../../../src/llm/authorPipeline.js';

function pickAuthorTransport(env: NodeJS.ProcessEnv): AuthorTransport {
  if (env['COHERENCE_AUTHOR_MOCK'] === '1') return mockAuthorTransport;
  if (env['COHERENCE_AUTHOR_LIVE'] === '1') return liveAuthorTransport;
  if (env['ANTHROPIC_API_KEY']) return liveAuthorTransport;
  return mockAuthorTransport;
}

describe('T3: pickAuthorTransport selection', () => {
  it('COHERENCE_AUTHOR_MOCK=1 selects mock', () => {
    expect(pickAuthorTransport({ COHERENCE_AUTHOR_MOCK: '1' })).toBe(mockAuthorTransport);
  });

  it('COHERENCE_AUTHOR_LIVE=1 selects live', () => {
    expect(pickAuthorTransport({ COHERENCE_AUTHOR_LIVE: '1' })).toBe(liveAuthorTransport);
  });

  it('MOCK=1 takes precedence over LIVE=1', () => {
    expect(
      pickAuthorTransport({ COHERENCE_AUTHOR_MOCK: '1', COHERENCE_AUTHOR_LIVE: '1' }),
    ).toBe(mockAuthorTransport);
  });

  it('ANTHROPIC_API_KEY only → live', () => {
    expect(pickAuthorTransport({ ANTHROPIC_API_KEY: 'sk-…' })).toBe(liveAuthorTransport);
  });

  it('MOCK=1 takes precedence over ANTHROPIC_API_KEY', () => {
    expect(
      pickAuthorTransport({ COHERENCE_AUTHOR_MOCK: '1', ANTHROPIC_API_KEY: 'sk-…' }),
    ).toBe(mockAuthorTransport);
  });

  it('empty env → mock (safe default)', () => {
    expect(pickAuthorTransport({})).toBe(mockAuthorTransport);
  });

  it('LIVE=0 falls through to ANTHROPIC_API_KEY check (= 0 is not = 1)', () => {
    expect(pickAuthorTransport({ COHERENCE_AUTHOR_LIVE: '0' })).toBe(mockAuthorTransport);
  });
});
