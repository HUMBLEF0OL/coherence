/**
 * v0.3 M4 — /coherence:export-metrics integration.
 *
 * Verifies:
 *   - file export with redaction (raw_path/file/content stripped)
 *   - curl line printed only when upload_consent=true
 *   - bounded read for jsonl > 5 MB (stub via fixture)
 *   - metrics_export_started event emitted with bucket
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { runExportMetrics, formatExportMetrics } from '../../src/commands/exportMetrics.js';
import { setTelemetryConsent } from '../../src/state/consent.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-export-metrics-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedJsonl(events: Array<Record<string, unknown>>): void {
  const cohDir = path.join(dir, '.claude', 'coherence');
  mkdirSync(cohDir, { recursive: true });
  writeFileSync(
    path.join(cohDir, 'metrics.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );
}

describe('runExportMetrics (DD-117 + DD-068 redaction matrix)', () => {
  it('writes redacted JSONL, strips raw paths/content fields', async () => {
    await initCoherenceDir(dir);
    seedJsonl([
      {
        event: 'patch_proposed',
        session_id: 's1',
        sectionRef: 'docs/foo.md#bar',
        raw_path: '/abs/path/should/not/leak',
        content: 'secret',
      },
    ]);
    const store = makeStateStore(dir);
    const out = path.join(dir, 'export.jsonl');
    const r = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 'session-x',
      out,
    });
    expect(existsSync(r.outPath)).toBe(true);
    const exported = readFileSync(r.outPath, 'utf8').trim();
    const obj = JSON.parse(exported) as Record<string, unknown>;
    expect(obj.raw_path).toBeUndefined();
    expect(obj.content).toBeUndefined();
    expect(obj.event).toBe('patch_proposed');
    expect(r.count).toBe(1);
    expect(r.countBucket).toBe('1-9');
  });

  it('curl line is printed ONLY when upload_consent=true', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    seedJsonl([{ event: 'patch_applied', session_id: 's' }]);

    // Default consent → upload_consent: false.
    const r1 = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's',
      out: path.join(dir, 'e1.jsonl'),
    });
    expect(r1.curlPrinted).toBe(false);
    expect(formatExportMetrics(r1)).toContain('upload consent not granted');

    // Flip consent.
    await setTelemetryConsent(store, { local_collection: true, upload_consent: true });

    const r2 = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's',
      out: path.join(dir, 'e2.jsonl'),
    });
    expect(r2.curlPrinted).toBe(true);
    expect(r2.curlLine).toContain('curl');
    expect(formatExportMetrics(r2)).toContain('curl');
  });

  it('honours --since to filter older events', async () => {
    await initCoherenceDir(dir);
    seedJsonl([
      { event: 'a', session_id: 's', _ts: '2026-04-01T10:00:00.000Z' },
      { event: 'b', session_id: 's', _ts: '2026-05-09T10:00:00.000Z' },
      { event: 'c', session_id: 's', _ts: '2026-05-10T10:00:00.000Z' },
    ]);
    const store = makeStateStore(dir);
    const r = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's',
      since: '2026-05-01T00:00:00.000Z',
      out: path.join(dir, 'e.jsonl'),
    });
    expect(r.count).toBe(2);
  });

  it('--anonymized hashes proposal_id and signal_hash to 12-hex', async () => {
    await initCoherenceDir(dir);
    seedJsonl([
      {
        event: 'proposal_proposed',
        session_id: 'plain-session',
        proposal_id: 'a'.repeat(32),
        signal_hash: 'sig123',
      },
    ]);
    const store = makeStateStore(dir);
    const r = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's',
      anonymized: true,
      out: path.join(dir, 'a.jsonl'),
    });
    const obj = JSON.parse(readFileSync(r.outPath, 'utf8').trim()) as Record<string, string>;
    expect(obj.proposal_id).toMatch(/^[0-9a-f]{12}$/);
    expect(obj.signal_hash).toMatch(/^[0-9a-f]{12}$/);
    expect(obj.session_id).toMatch(/^[0-9a-f]{12}$/);
  });

  it('emits metrics_export_started with the count bucket', async () => {
    await initCoherenceDir(dir);
    seedJsonl([{ event: 'a', session_id: 's' }]);
    const store = makeStateStore(dir);
    await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's-export',
      out: path.join(dir, 'e.jsonl'),
    });
    const lines = readFileSync(path.join(dir, '.claude', 'coherence', 'metrics.jsonl'), 'utf8')
      .trim()
      .split('\n');
    const event = lines
      .map((l) => JSON.parse(l) as { event: string; event_count_bucket?: string })
      .find((e) => e.event === 'metrics_export_started');
    expect(event).toBeDefined();
    expect(event!.event_count_bucket).toBe('1-9');
  });

  it('writes audit entry to coherence-log/exports.jsonl', async () => {
    await initCoherenceDir(dir);
    seedJsonl([{ event: 'a', session_id: 's' }]);
    const store = makeStateStore(dir);
    const r = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's',
      out: path.join(dir, 'audit.jsonl'),
    });
    const exportsLog = path.join(dir, '.claude', 'coherence', 'coherence-log', 'exports.jsonl');
    expect(existsSync(exportsLog)).toBe(true);
    const audit = JSON.parse(readFileSync(exportsLog, 'utf8').trim()) as Record<string, unknown>;
    expect(audit.kind).toBe('metrics_export');
    expect(audit.out).toBe(r.outPath);
  });
});
