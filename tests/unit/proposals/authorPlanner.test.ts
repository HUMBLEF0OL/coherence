/**
 * M9 — Author planner stage (DD-067 staged adoption).
 */
import { describe, it, expect } from 'vitest';
import {
  runAuthorPlanner,
  mockPlannerTransport,
  shouldRunPlanner,
  isPlannerEnabled,
  pickPlannerTransport,
} from '../../../src/llm/authorPlanner.js';

describe('shouldRunPlanner', () => {
  it('returns true when ≥2 distinct kinds are present', () => {
    expect(
      shouldRunPlanner(
        [
          { kind: 'bash_repetition', signal_hash: 'a', evidence: {} },
          { kind: 'file_creation', signal_hash: 'b', evidence: {} },
        ],
        30,
      ),
    ).toBe(true);
  });

  it('returns false for a single-kind set', () => {
    expect(
      shouldRunPlanner(
        [
          { kind: 'bash_repetition', signal_hash: 'a', evidence: {} },
          { kind: 'bash_repetition', signal_hash: 'b', evidence: {} },
        ],
        30,
      ),
    ).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(shouldRunPlanner([], 30)).toBe(false);
  });
});

describe('runAuthorPlanner (mock)', () => {
  it('consolidates when ≥2 distinct kinds → kind=skill for bash+file', async () => {
    const out = await runAuthorPlanner(
      {
        signals: [
          { kind: 'bash_repetition', signal_hash: 'a', evidence: {} },
          { kind: 'file_creation', signal_hash: 'b', evidence: {} },
        ],
        window_minutes: 30,
      },
      mockPlannerTransport,
    );
    expect(out.status).toBe('consolidate');
    expect(out.consolidated_kind).toBe('skill');
    expect(out.covered_signal_hashes).toEqual(['a', 'b']);
  });

  it('consolidated_kind=agent when agent_correction is in the set', async () => {
    const out = await runAuthorPlanner(
      {
        signals: [
          { kind: 'agent_correction', signal_hash: 'a', evidence: {} },
          { kind: 'bash_repetition', signal_hash: 'b', evidence: {} },
        ],
        window_minutes: 30,
      },
      mockPlannerTransport,
    );
    expect(out.consolidated_kind).toBe('agent');
  });

  it('consolidated_kind=slash_command for bash-only-but-≥2-hashes path', async () => {
    // Two bash kinds → shouldRunPlanner returns false; runAuthorPlanner with
    // mock returns no_consolidation. Verify.
    const out = await runAuthorPlanner(
      {
        signals: [
          { kind: 'bash_repetition', signal_hash: 'a', evidence: {} },
          { kind: 'bash_repetition', signal_hash: 'b', evidence: {} },
        ],
        window_minutes: 30,
      },
      mockPlannerTransport,
    );
    expect(out.status).toBe('no_consolidation');
  });

  it('honours NO_CONSOLIDATION literal', async () => {
    const transport = async () => 'NO_CONSOLIDATION';
    const out = await runAuthorPlanner(
      { signals: [], window_minutes: 30 },
      transport,
    );
    expect(out.status).toBe('no_consolidation');
  });

  it('rejects unparseable JSON', async () => {
    const transport = async () => 'not json {';
    const out = await runAuthorPlanner(
      { signals: [], window_minutes: 30 },
      transport,
    );
    expect(out.status).toBe('invalid');
    expect(out.reason).toBe('unparseable_json');
  });

  it('rejects payload with invalid consolidated_kind', async () => {
    const transport = async () =>
      JSON.stringify({
        consolidate: true,
        consolidated_kind: 'annotate', // not allowed for planner
        name: 'foo',
        description: 'bar',
        covered_signal_hashes: ['a'],
      });
    const out = await runAuthorPlanner(
      { signals: [], window_minutes: 30 },
      transport,
    );
    expect(out.status).toBe('invalid');
    expect(out.reason).toBe('invalid_kind');
  });

  it('rejects payload with missing covered_signal_hashes', async () => {
    const transport = async () =>
      JSON.stringify({
        consolidate: true,
        consolidated_kind: 'skill',
        name: 'foo',
        description: 'a valid description string',
      });
    const out = await runAuthorPlanner(
      { signals: [], window_minutes: 30 },
      transport,
    );
    expect(out.status).toBe('invalid');
    expect(out.reason).toBe('invalid_covered_signal_hashes');
  });
});

describe('isPlannerEnabled / pickPlannerTransport', () => {
  it('isPlannerEnabled honours COHERENCE_AUTHOR_PLANNER=1 env', () => {
    const prev = process.env['COHERENCE_AUTHOR_PLANNER'];
    process.env['COHERENCE_AUTHOR_PLANNER'] = '1';
    expect(isPlannerEnabled()).toBe(true);
    delete process.env['COHERENCE_AUTHOR_PLANNER'];
    expect(isPlannerEnabled()).toBe(false);
    if (prev !== undefined) process.env['COHERENCE_AUTHOR_PLANNER'] = prev;
  });

  it('pickPlannerTransport: COHERENCE_AUTHOR_MOCK=1 → mock', () => {
    const prev = process.env['COHERENCE_AUTHOR_MOCK'];
    process.env['COHERENCE_AUTHOR_MOCK'] = '1';
    expect(pickPlannerTransport()).toBe(mockPlannerTransport);
    if (prev === undefined) delete process.env['COHERENCE_AUTHOR_MOCK'];
    else process.env['COHERENCE_AUTHOR_MOCK'] = prev;
  });
});
