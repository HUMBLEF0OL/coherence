/**
 * /coherence:export-metrics — DD-117 file-export only (no upload).
 *
 * Reads `.claude/coherence/metrics.jsonl`, applies optional `--since`
 * filtering, redacts per DD-068 redaction matrix (no raw paths/content),
 * writes the result to a JSONL file at the user-supplied path. If
 * `--anonymized` is given, identifying fields (proposal_id, signal_hash) are
 * additionally hashed (12-hex SHA-256). At end of export, prints a
 * copy-paste curl command IFF the consent grants upload; otherwise prints a
 * one-line refusal pointing at config.json#telemetry.
 *
 * Bounded read primitive: when `metrics.jsonl` exceeds 5 MB we tail-read the
 * last 5 MB only (matching v0.2 P8). Smaller files read in full.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { getCoherenceDir } from '../state/init.js';
import { readTelemetryConsent } from '../state/consent.js';
import { emitMetric } from '../state/metrics.js';
import { nowIsoUtc } from '../util/time.js';

/** v0.2 P8 — tail-read fence for metrics.jsonl. */
const METRICS_TAIL_BYTES = 5 * 1024 * 1024;

export interface ExportMetricsOptions {
  store: StateStore;
  projectRoot: string;
  sessionId: string;
  /** Output path; defaults to `metrics-export-<ts>.jsonl` in cwd. */
  out?: string;
  /** ISO timestamp; only events with `_ts >= since` are emitted. */
  since?: string;
  /** Hash identifying fields (proposal_id, signal_hash). */
  anonymized?: boolean;
}

export interface ExportMetricsResult {
  /** Absolute path the export was written to. */
  outPath: string;
  /** Number of events exported. */
  count: number;
  /** Bucket of count: 0, 1-9, 10-99, 100-999, 1000+. */
  countBucket: '0' | '1-9' | '10-99' | '100-999' | '1000+';
  /** True when a curl command was printed (upload consent granted). */
  curlPrinted: boolean;
  /** The curl line printed (or an empty string when not printed). */
  curlLine: string;
}

const REDACT_FIELDS = new Set([
  // Per DD-068, raw paths/content/etc never appear in metrics.jsonl in the
  // first place, but defense-in-depth: strip these names if any payload
  // leaks them through extension.
  'path',
  'paths',
  'file',
  'files',
  'raw_path',
  'raw_command',
  'raw_response',
  'message',
  'content',
  'body',
]);

const ANONYMIZE_FIELDS = ['proposal_id', 'signal_hash', 'session_id'];

export async function runExportMetrics(
  options: ExportMetricsOptions,
): Promise<ExportMetricsResult> {
  const { store, projectRoot, sessionId, since, anonymized = false } = options;
  const coherenceDir = getCoherenceDir(projectRoot);
  const jsonlPath = path.join(coherenceDir, 'metrics.jsonl');

  const outPath = path.resolve(
    options.out ?? `metrics-export-${nowIsoUtc().replace(/[:.]/g, '-')}.jsonl`,
  );
  mkdirSync(path.dirname(outPath), { recursive: true });

  if (!existsSync(jsonlPath)) {
    throw new Error(`export-metrics: ${jsonlPath} does not exist`);
  }

  const raw = readBoundedJsonl(jsonlPath);
  const events: Array<Record<string, unknown>> = [];
  for (const line of raw) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (since) {
      const ts = (parsed['_ts'] as string | undefined) ?? (parsed['at'] as string | undefined);
      if (!ts || ts < since) continue;
    }
    const redacted = redact(parsed);
    const finalEvent = anonymized ? anonymise(redacted) : redacted;
    events.push(finalEvent);
  }

  writeFileSync(
    outPath,
    events.map((e) => JSON.stringify(e)).join('\n') + (events.length > 0 ? '\n' : ''),
    'utf8',
  );

  const countBucket = bucketCount(events.length);
  await emitMetric(store, {
    event: 'metrics_export_started',
    session_id: sessionId,
    ...(since !== undefined ? { since } : {}),
    anonymized,
    event_count_bucket: countBucket,
  });

  // Audit log — appended into coherence-log/exports.jsonl. The exports log
  // sits alongside other coherence-log entries (FR-OBS-2 already writes there).
  const exportsLog = path.join(coherenceDir, 'coherence-log', 'exports.jsonl');
  mkdirSync(path.dirname(exportsLog), { recursive: true });
  appendFileSync(
    exportsLog,
    JSON.stringify({
      kind: 'metrics_export',
      out: outPath,
      count_bucket: countBucket,
      since: since ?? null,
      anonymized,
      at: nowIsoUtc(),
    }) + '\n',
    'utf8',
  );

  const consent = await readTelemetryConsent(store);
  let curlPrinted = false;
  let curlLine = '';
  if (consent?.upload_consent) {
    curlLine = `curl -X POST -H "Content-Type: application/x-ndjson" --data-binary @"${outPath}" <YOUR_INGEST_URL>`;
    curlPrinted = true;
  }

  return { outPath, count: events.length, countBucket, curlPrinted, curlLine };
}

export function formatExportMetrics(r: ExportMetricsResult): string {
  const lines = [
    `[coherence] export-metrics:`,
    `  wrote ${r.count} event(s) to ${r.outPath}`,
    `  count bucket: ${r.countBucket}`,
  ];
  if (r.curlPrinted) {
    lines.push(`  upload (consented):`);
    lines.push(`    ${r.curlLine}`);
  } else {
    lines.push(
      `  upload consent not granted; edit .claude/coherence/config.json#telemetry.upload_consent to enable`,
    );
  }
  return lines.join('\n');
}

function readBoundedJsonl(filePath: string): string[] {
  const st = statSync(filePath);
  if (st.size <= METRICS_TAIL_BYTES) {
    return readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim() !== '');
  }
  // Tail-read last METRICS_TAIL_BYTES bytes; drop a partial first line.
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(METRICS_TAIL_BYTES);
    readSync(fd, buf, 0, METRICS_TAIL_BYTES, st.size - METRICS_TAIL_BYTES);
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    lines.shift(); // drop possibly-truncated first line
    return lines.filter((l) => l.trim() !== '');
  } finally {
    closeSync(fd);
  }
}

function redact(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (REDACT_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function anonymise(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...event };
  for (const f of ANONYMIZE_FIELDS) {
    if (typeof out[f] === 'string') {
      out[f] = createHash('sha256').update(String(out[f])).digest('hex').slice(0, 12);
    }
  }
  return out;
}

function bucketCount(n: number): ExportMetricsResult['countBucket'] {
  if (n === 0) return '0';
  if (n < 10) return '1-9';
  if (n < 100) return '10-99';
  if (n < 1000) return '100-999';
  return '1000+';
}
