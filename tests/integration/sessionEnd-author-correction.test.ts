/**
 * R8 fix coverage: SessionEnd Author tail authors a proposal for an
 * agent_correction signal that crossed the threshold during the session.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { sessionEndHook } from '../../src/hooks/sessionEnd.js';
import { initCoherenceDir } from '../../src/state/init.js';
import { ProposalStore } from '../../src/proposals/store.js';

let dir: string;
const SESSION_ID = 'session-r8';

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-r8-'));
  await initCoherenceDir(dir);
  ProposalStore.resetSessionCount(SESSION_ID);
  process.env['COHERENCE_AUTHOR_MOCK'] = '1';
});

afterEach(() => {
  delete process.env['COHERENCE_AUTHOR_MOCK'];
  rmSync(dir, { recursive: true, force: true });
});

function readMetrics(): Array<Record<string, unknown>> {
  const p = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('R8: SessionEnd Author tail authors agent_correction proposals', () => {
  it('walks agent_correction bucket and enqueues an Author proposal', async () => {
    const cachePath = path.join(dir, '.claude', 'coherence', 'signal-cache.json');
    writeFileSync(
      cachePath,
      JSON.stringify({
        schema_version: 2,
        buckets: {
          bash_repetition: { maxItems: 500, items: [] },
          file_creation: { maxItems: 500, items: [] },
          agent_correction: {
            maxItems: 200,
            items: [
              {
                agent_id: 'agent-foo',
                first_seen: '2026-05-09T10:00:00.000Z',
                last_seen: '2026-05-10T10:00:00.000Z',
                occurrences: 4,
                line_ratio: 0.32,
              },
            ],
          },
        },
      }),
    );

    await sessionEndHook({ session_id: SESSION_ID }, dir);

    const events = readMetrics();
    const proposed = events.find((e) => e.event === 'proposal_proposed');
    expect(proposed).toBeDefined();
    expect(proposed!.kind).toBe('agent');
    expect(proposed!.signal_kind).toBe('agent_correction');
  });

  it('skips agent_correction below threshold (occurrences < 3)', async () => {
    const cachePath = path.join(dir, '.claude', 'coherence', 'signal-cache.json');
    writeFileSync(
      cachePath,
      JSON.stringify({
        schema_version: 2,
        buckets: {
          bash_repetition: { maxItems: 500, items: [] },
          file_creation: { maxItems: 500, items: [] },
          agent_correction: {
            maxItems: 200,
            items: [
              {
                agent_id: 'agent-foo',
                first_seen: '2026-05-10T10:00:00.000Z',
                last_seen: '2026-05-10T10:01:00.000Z',
                occurrences: 2, // below threshold
                line_ratio: 0.5,
              },
            ],
          },
        },
      }),
    );
    await sessionEndHook({ session_id: SESSION_ID }, dir);
    const events = readMetrics();
    expect(events.find((e) => e.event === 'proposal_proposed')).toBeUndefined();
  });

  it('R11: skips items already authored by Stop tail (collision filter)', async () => {
    const sigHash = (await import('../../src/signal/signatureHash.js')).signatureHash(
      'agent_correction',
      'agent-foo',
    );
    // Simulate Stop tail having already enqueued this signal.
    const proposalCachePath = path.join(
      dir,
      '.claude',
      'coherence',
      'proposal-cache.json',
    );
    writeFileSync(
      proposalCachePath,
      JSON.stringify({
        schema_version: 2,
        entries: [
          {
            proposal_id: 'a'.repeat(32),
            kind: 'agent',
            signal_hash: sigHash,
            state: 'surfaced',
            generated_at: '2026-05-10T10:00:00.000Z',
            expires_at: '2026-05-24T10:00:00.000Z',
            consecutive_ignored: 0,
            state_history: [{ state: 'queued', at: '2026-05-10T10:00:00.000Z' }],
          },
        ],
      }),
    );
    const cachePath = path.join(dir, '.claude', 'coherence', 'signal-cache.json');
    writeFileSync(
      cachePath,
      JSON.stringify({
        schema_version: 2,
        buckets: {
          bash_repetition: { maxItems: 500, items: [] },
          file_creation: { maxItems: 500, items: [] },
          agent_correction: {
            maxItems: 200,
            items: [
              {
                agent_id: 'agent-foo',
                first_seen: '2026-05-09T10:00:00.000Z',
                last_seen: '2026-05-10T10:00:00.000Z',
                occurrences: 4,
                line_ratio: 0.5,
              },
            ],
          },
        },
      }),
    );
    await sessionEndHook({ session_id: SESSION_ID }, dir);
    const events = readMetrics();
    // No new proposal_proposed for the same signal hash — pre-filter blocked.
    const proposed = events.filter((e) => e.event === 'proposal_proposed');
    expect(proposed).toEqual([]);
  });
});
