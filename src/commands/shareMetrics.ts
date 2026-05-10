/**
 * /coherence:share-metrics --anonymized
 * Writes redacted metrics to a user-chosen file. No network egress in v0.1.
 * DD-060, DG-6, TS-7 §7.6
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export interface ShareMetricsOptions {
  anonymized?: boolean;
  outputPath: string;
  coherenceDir: string;
  confirmed?: boolean;
}

export interface ShareMetricsResult {
  outputPath: string;
  lineCount: number;
  message: string;
  requiresConfirmation?: boolean;
}

/**
 * FR-PRIVACY-N1 / DD-068: strict allowlist anonymisation.
 *
 * The previous implementation was a heuristic blocklist (replace path-like
 * strings, hash a few known keys). Any newly-introduced event field that
 * happened to contain raw user data — a command string, a prompt, an LLM
 * snippet — would silently leak through.
 *
 * The allowlist below enumerates every field shape that share-metrics is
 * permitted to emit when `--anonymized` is set. Anything not in the
 * allowlist is dropped (numeric / boolean / known-enum payload fields are
 * passed through verbatim where listed). String fields that the allowlist
 * marks as `hash` are replaced with a 12-hex sha256 truncation.
 */
type AnonRule =
  | 'pass'
  | 'hash'
  | 'drop';

// Field rules, indexed by event-payload key. Anything not listed is dropped.
const ANON_FIELD_RULES: Record<string, AnonRule> = {
  // Schema / routing fields — safe to pass through.
  event: 'pass',
  schema_version: 'pass',
  // Identifiers — hashed so cross-event correlation still works without
  // exposing the underlying string.
  session_id: 'hash',
  proposal_id: 'hash',
  signal_hash: 'hash',
  signature_hash: 'hash',
  agent_id_hash: 'hash',
  doc_path_hash: 'hash',
  invocation_id: 'hash',
  sectionRef: 'hash',
  // Categorical enums — safe to pass.
  kind: 'pass',
  signal_kind: 'pass',
  state: 'pass',
  to_state: 'pass',
  from_state: 'pass',
  reason: 'pass',
  source: 'pass',
  classification: 'pass',
  delivery_mode: 'pass',
  changeClass: 'pass',
  sentinel: 'pass',
  // Numeric / boolean payload — safe to pass.
  passed: 'pass',
  demoteClass: 'pass',
  unknownStrictCount: 'pass',
  unknownLooseOnlyCount: 'pass',
  cost_usd: 'pass',
  input_tokens: 'pass',
  output_tokens: 'pass',
  ratio: 'pass',
  occurrences_in_window: 'pass',
  occurrences_in_locality: 'pass',
  scanned_count: 'pass',
  duration_ms: 'pass',
  from: 'pass',
  to: 'pass',
  bash_repetition: 'pass',
  file_creation: 'pass',
  agent_correction: 'pass',
  would_have_fired: 'pass',
  consecutive_ignored: 'pass',
  // Versioning records — these are short literal strings ("v1.0").
  prompt_version: 'pass',
};
const ALLOWED_KEYS = new Set(Object.keys(ANON_FIELD_RULES));

function anonymizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const rule = ANON_FIELD_RULES[k];
    if (rule === undefined || rule === 'drop') {
      continue; // strict allowlist — unlisted keys are dropped (no leak)
    }
    if (rule === 'hash') {
      out[k] = createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
      continue;
    }
    // 'pass' rule: only permit primitive scalars (string enums / number /
    // boolean / null) and the small structured shapes we know about. Drop
    // anything that could carry arbitrary user content (arrays of strings,
    // nested free-form objects).
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'string') {
      // Even pass-listed string fields are bounded to a safe length so an
      // adversarial event cannot smuggle a long payload through.
      out[k] = v.length > 64 ? v.slice(0, 64) : v;
    } else if (k === 'prompt_version' && typeof v === 'object') {
      // {stage1?: string, stage2?: string, author?: string, annotate?: string}
      const pv: Record<string, unknown> = {};
      for (const [pk, pv2] of Object.entries(v as Record<string, unknown>)) {
        if (typeof pv2 === 'string' && pv2.length <= 32) pv[pk] = pv2;
      }
      out[k] = pv;
    }
    // arrays / unknown structures: dropped silently (not added to out).
  }
  // Inert preserved keys: ALLOWED_KEYS is referenced here so the compiler
  // does not strip the constant if the rules table is later extended via a
  // proxy. Keeps the strict-allowlist invariant explicit at runtime too.
  void ALLOWED_KEYS;
  return out;
}

export async function runShareMetrics(opts: ShareMetricsOptions): Promise<ShareMetricsResult> {
  if (!opts.confirmed) {
    return {
      outputPath: opts.outputPath,
      lineCount: 0,
      requiresConfirmation: true,
      message: [
        '[coherence] share-metrics: User confirmation required.',
        `  Output will be written to: ${opts.outputPath}`,
        opts.anonymized ? '  Mode: --anonymized (project paths redacted, section refs hashed)' : '  Mode: raw (all data included)',
        '  No network egress occurs — file-write only.',
        "  Re-run with confirmed: true to proceed.",
      ].join('\n'),
    };
  }

  const jsonlPath = path.join(opts.coherenceDir, 'metrics.jsonl');
  if (!existsSync(jsonlPath)) {
    return {
      outputPath: opts.outputPath,
      lineCount: 0,
      message: '[coherence] share-metrics: No metrics.jsonl found.',
    };
  }

  const raw = readFileSync(jsonlPath, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  const output: string[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const processed = opts.anonymized ? anonymizeRecord(parsed) : parsed;
      output.push(JSON.stringify(processed));
    } catch {
      // skip malformed lines
    }
  }

  const outContent = output.join('\n') + (output.length > 0 ? '\n' : '');
  writeFileSync(opts.outputPath, outContent, 'utf8');

  return {
    outputPath: opts.outputPath,
    lineCount: output.length,
    message: `[coherence] share-metrics: Wrote ${output.length} event(s) to ${opts.outputPath}${opts.anonymized ? ' (anonymized)' : ''}.`,
  };
}
