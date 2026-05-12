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
import { isPathInside } from '../util/pathContainment.js';

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
  /**
   * v0.4 DD-128: opt-in escape hatch for writing outside the project root.
   * Defaults to false. Without this flag, any `out` path outside `projectRoot`
   * is refused.
   */
  allowOutOfTree?: boolean;
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
  // v0.4 DD-128: always-on `--out` path sandboxing. Refuse any path outside
  // projectRoot unless the caller explicitly passes `allowOutOfTree=true`.
  const outResolved = path.resolve(outPath);
  const rootResolved = path.resolve(projectRoot);
  if (!isPathInside(rootResolved, outResolved) && outResolved !== rootResolved) {
    if (!options.allowOutOfTree) {
      throw new Error(
        `export-metrics: output path is outside the project root.\n` +
          `  Path: ${outResolved}\n` +
          `  Pass --allow-out-of-tree to override.`,
      );
    }
    process.stderr.write(
      `[coherence] WARNING: writing metrics outside project root.\n` +
        `  Path: ${outResolved}\n` +
        `  Explicitly requested via --allow-out-of-tree.\n`,
    );
  }
  // Directory creation only when needed (follows the sandbox check).
  const outDir = path.dirname(outResolved);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  if (!existsSync(jsonlPath)) {
    throw new Error(`export-metrics: ${jsonlPath} does not exist`);
  }

  const raw = readBoundedJsonl(jsonlPath);
  const events: unknown[] = [];
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
  // Tail-read last METRICS_TAIL_BYTES bytes. Audit-fix B5: only drop the
  // first line when we're certain it was truncated mid-line. We detect that
  // by reading ONE extra byte before the tail boundary; if that byte is `\n`,
  // the boundary fell on a record edge and the first line of the tail is
  // intact. Otherwise we drop it to avoid emitting a partial record.
  const fd = openSync(filePath, 'r');
  try {
    const tailStart = st.size - METRICS_TAIL_BYTES;
    let firstLineMaybePartial = true;
    if (tailStart > 0) {
      const probe = Buffer.alloc(1);
      readSync(fd, probe, 0, 1, tailStart - 1);
      if (probe[0] === 0x0a /* \n */) firstLineMaybePartial = false;
    } else {
      firstLineMaybePartial = false;
    }
    const buf = Buffer.alloc(METRICS_TAIL_BYTES);
    readSync(fd, buf, 0, METRICS_TAIL_BYTES, tailStart);
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    if (firstLineMaybePartial) lines.shift();
    return lines.filter((l) => l.trim() !== '');
  } finally {
    closeSync(fd);
  }
}

/**
 * Recursive redaction (audit-fix B6). Strips every key in `REDACT_FIELDS`
 * at any depth — DD-068's matrix is a defense-in-depth strip and a future
 * payload extension nesting raw data inside an object must not bypass it.
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_FIELDS.has(k)) continue;
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursive anonymisation (audit-fix B6). Hashes every string value found
 * under any of `ANONYMIZE_FIELDS` keys at any depth. Strings under other
 * keys pass through unchanged.
 */
function anonymise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(anonymise);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ANONYMIZE_FIELDS.includes(k) && typeof v === 'string') {
        out[k] = createHash('sha256').update(v).digest('hex').slice(0, 12);
      } else {
        out[k] = anonymise(v);
      }
    }
    return out;
  }
  return value;
}

function bucketCount(n: number): ExportMetricsResult['countBucket'] {
  if (n === 0) return '0';
  if (n < 10) return '1-9';
  if (n < 100) return '10-99';
  if (n < 1000) return '100-999';
  return '1000+';
}
