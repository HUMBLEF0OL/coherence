/**
 * SessionStart-driven metrics.jsonl retention sweep.
 * NFR-OBS-2, DD-060
 * Entries older than 90 days are aggregated (counts only) into metrics-summary.json
 * and truncated from the rolling log.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import path from 'path';
import type { StateStore } from './stateStore.js';

const RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;

interface MetricsSummary {
  generated_at: string;
  cutoff: string;
  counts: Record<string, number>;
}

export async function runRetentionSweep(store: StateStore, coherenceDir: string): Promise<void> {
  const jsonlPath = path.join(coherenceDir, 'metrics.jsonl');
  if (!existsSync(jsonlPath)) return;

  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf8');
  } catch {
    return;
  }

  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
  const cutoffIso = cutoff.toISOString();

  const retained: string[] = [];
  const aggregateCounts: Record<string, number> = {};
  let hadOld = false;

  for (const line of lines) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      retained.push(line);
      continue;
    }

    const ts = (parsed['_ts'] ?? '') as string;
    if (ts && ts < cutoffIso) {
      hadOld = true;
      const eventType = (parsed['event'] as string | undefined) ?? 'unknown';
      aggregateCounts[eventType] = (aggregateCounts[eventType] ?? 0) + 1;
    } else {
      retained.push(line);
    }
  }

  if (!hadOld) return;

  // Write truncated metrics.jsonl
  const tmpPath = `${jsonlPath}.retention.tmp`;
  writeFileSync(tmpPath, retained.join('\n') + (retained.length > 0 ? '\n' : ''), 'utf8');
  renameSync(tmpPath, jsonlPath);

  // Merge into metrics-summary.json
  const summaryPath = path.join(coherenceDir, 'metrics-summary.json');
  let existing: MetricsSummary | null = null;
  if (existsSync(summaryPath)) {
    try {
      existing = JSON.parse(readFileSync(summaryPath, 'utf8')) as MetricsSummary;
    } catch { /* start fresh */ }
  }

  const merged: Record<string, number> = { ...(existing?.counts ?? {}) };
  for (const [k, v] of Object.entries(aggregateCounts)) {
    merged[k] = (merged[k] ?? 0) + v;
  }

  const summary: MetricsSummary = {
    generated_at: new Date().toISOString(),
    cutoff: cutoffIso,
    counts: merged,
  };

  const summaryTmp = `${summaryPath}.tmp`;
  writeFileSync(summaryTmp, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  renameSync(summaryTmp, summaryPath);

  void store; // store reserved for future lock-based append
}
