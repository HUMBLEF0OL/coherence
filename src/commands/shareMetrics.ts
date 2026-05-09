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

function anonymizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'sectionRef' || k === 'session_id') {
      // Replace with anonymous hash
      out[k] = createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
    } else if (typeof v === 'string' && v.includes('/')) {
      // Redact path-like strings
      out[k] = '<redacted-path>';
    } else {
      out[k] = v;
    }
  }
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
