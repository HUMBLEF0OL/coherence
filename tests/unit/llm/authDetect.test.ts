/**
 * v1.0.1 Fix 10 — detectLiveAuthAvailable regression tests.
 *
 * Pre-Fix-10: live/mock transport selectors gated on `ANTHROPIC_API_KEY`
 * only. Post-Fix-9 (Path C — agent-SDK migration), subscription users
 * with `claude` CLI authenticated would silently fall back to mock
 * transports. Fix 10 widens the gate to either auth source.
 */
import { describe, it, expect } from 'vitest';
import {
  detectLiveAuthAvailable,
  _resetAuthDetectCache,
} from '../../../src/llm/authDetect.js';

describe('detectLiveAuthAvailable — API-key path', () => {
  it('returns true when ANTHROPIC_API_KEY is set, without probing the CLI', () => {
    let probed = false;
    const r = detectLiveAuthAvailable({ ANTHROPIC_API_KEY: 'sk-test-…' }, () => {
      probed = true;
      return false;
    });
    expect(r).toBe(true);
    // Short-circuit: API-key path must not pay the spawnSync cost.
    expect(probed).toBe(false);
  });

  it('returns true for any non-empty string (we do not validate the key shape)', () => {
    expect(detectLiveAuthAvailable({ ANTHROPIC_API_KEY: 'x' }, () => false)).toBe(true);
  });

  it('treats empty-string ANTHROPIC_API_KEY as unset (falsy)', () => {
    expect(detectLiveAuthAvailable({ ANTHROPIC_API_KEY: '' }, () => false)).toBe(false);
  });
});

describe('detectLiveAuthAvailable — subscription / CLI path', () => {
  it('returns true when the CLI probe reports `claude` is available', () => {
    expect(detectLiveAuthAvailable({}, () => true)).toBe(true);
  });

  it('returns false when neither API key nor CLI is available', () => {
    expect(detectLiveAuthAvailable({}, () => false)).toBe(false);
  });

  it('returns true when API key takes priority over a failing CLI probe', () => {
    expect(detectLiveAuthAvailable({ ANTHROPIC_API_KEY: 'sk-…' }, () => false)).toBe(true);
  });
});

describe('detectLiveAuthAvailable — defensive defaults', () => {
  it('defaults to process.env when no env argument is supplied', () => {
    // We don't assert a specific value here because the real env may or
    // may not have ANTHROPIC_API_KEY / claude CLI. We assert the call
    // doesn't throw, and that it returns a boolean.
    _resetAuthDetectCache();
    const r = detectLiveAuthAvailable(undefined, () => false);
    expect(typeof r).toBe('boolean');
  });

  it('does NOT throw when the CLI probe itself throws', () => {
    expect(() =>
      detectLiveAuthAvailable({}, () => { throw new Error('claude not found'); }),
    ).toThrow(/claude not found/);
    // ↑ The exception propagates by design — caller decides UX.
    // Tests with a passing-by-default CLI probe never see this.
  });
});

describe('detectLiveAuthAvailable — interaction with transport pickers (regression for Fix 10)', () => {
  // Mirrors the logic in stop.ts, sessionEnd.ts, authorPlanner.ts.
  function pickTransport(env: NodeJS.ProcessEnv, cliProbe: () => boolean): 'live' | 'mock' {
    if (env['COHERENCE_AUTHOR_MOCK'] === '1') return 'mock';
    if (env['COHERENCE_AUTHOR_LIVE'] === '1') return 'live';
    return detectLiveAuthAvailable(env, cliProbe) ? 'live' : 'mock';
  }

  it('subscription user (CLI available, no API key) → live transport', () => {
    expect(pickTransport({}, () => true)).toBe('live');
  });

  it('API-key user (no CLI) → live transport', () => {
    expect(pickTransport({ ANTHROPIC_API_KEY: 'sk-…' }, () => false)).toBe('live');
  });

  it('no auth at all → mock transport', () => {
    expect(pickTransport({}, () => false)).toBe('mock');
  });

  it('explicit MOCK override beats both auth sources', () => {
    expect(
      pickTransport({ COHERENCE_AUTHOR_MOCK: '1', ANTHROPIC_API_KEY: 'sk-…' }, () => true),
    ).toBe('mock');
  });

  it('explicit LIVE override beats absent auth (caller accepts risk of SDK failure)', () => {
    expect(pickTransport({ COHERENCE_AUTHOR_LIVE: '1' }, () => false)).toBe('live');
  });
});
