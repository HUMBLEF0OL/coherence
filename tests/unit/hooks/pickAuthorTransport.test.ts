/**
 * T3 fix coverage: env-gated transport selection works end-to-end.
 *
 * The selection logic lives inside stop.ts and sessionEnd.ts; we mirror
 * it here as a tiny isolated function (with a dependency-injected
 * `detectLiveAuthAvailable`) and verify each branch.
 *
 * Selection rules (post-v1.0.1 Fix 10):
 *   - COHERENCE_AUTHOR_MOCK=1 → mock
 *   - COHERENCE_AUTHOR_LIVE=1 → live
 *   - else: live iff `detectLiveAuthAvailable()` — `ANTHROPIC_API_KEY`
 *     env var OR an authenticated `claude` CLI session (subscription
 *     path). Falls back to mock when neither auth source is configured.
 */
import { describe, it, expect } from 'vitest';
import {
  mockAuthorTransport,
  liveAuthorTransport,
  type AuthorTransport,
} from '../../../src/llm/authorPipeline.js';
import { detectLiveAuthAvailable } from '../../../src/llm/authDetect.js';

function pickAuthorTransport(
  env: NodeJS.ProcessEnv,
  cliProbe: () => boolean = () => false,
): AuthorTransport {
  if (env['COHERENCE_AUTHOR_MOCK'] === '1') return mockAuthorTransport;
  if (env['COHERENCE_AUTHOR_LIVE'] === '1') return liveAuthorTransport;
  if (detectLiveAuthAvailable(env, cliProbe)) return liveAuthorTransport;
  return mockAuthorTransport;
}

describe('T3: pickAuthorTransport selection (v1.0.1 Fix 10 gate)', () => {
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

  it('ANTHROPIC_API_KEY only → live (CLI probe not even called)', () => {
    let probed = false;
    expect(
      pickAuthorTransport({ ANTHROPIC_API_KEY: 'sk-…' }, () => { probed = true; return false; }),
    ).toBe(liveAuthorTransport);
    expect(probed).toBe(false);
  });

  it('claude CLI available (subscription) + no API key → live (v1.0.1 Fix 10)', () => {
    expect(pickAuthorTransport({}, () => true)).toBe(liveAuthorTransport);
  });

  it('MOCK=1 takes precedence over ANTHROPIC_API_KEY', () => {
    expect(
      pickAuthorTransport({ COHERENCE_AUTHOR_MOCK: '1', ANTHROPIC_API_KEY: 'sk-…' }),
    ).toBe(mockAuthorTransport);
  });

  it('MOCK=1 takes precedence over subscription-CLI availability', () => {
    expect(pickAuthorTransport({ COHERENCE_AUTHOR_MOCK: '1' }, () => true)).toBe(mockAuthorTransport);
  });

  it('empty env + no CLI → mock (safe default)', () => {
    expect(pickAuthorTransport({}, () => false)).toBe(mockAuthorTransport);
  });

  it('LIVE=0 falls through to the auth-detect gate (= 0 is not = 1)', () => {
    expect(pickAuthorTransport({ COHERENCE_AUTHOR_LIVE: '0' }, () => false)).toBe(mockAuthorTransport);
  });
});
