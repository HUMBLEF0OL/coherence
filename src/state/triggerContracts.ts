/**
 * v0.4 M2 — telemetry-gated trigger contracts (DD-129, FR-TRIGGER-1).
 *
 * Reads `.claude/coherence/metrics.jsonl` (bounded to last 5 MB per P8) and
 * evaluates two thresholds; emits a one-time CLI hint per contract.
 *
 *   TC-1 (author-planner promotion): cross-kind proposal rate > 25 % over
 *        a rolling 30-day window.
 *   TC-2 (calibration re-tune):       ≥ 50 unique sessions with a day-span
 *        of ≥ 30 days.
 *
 * Hints are recorded in `trigger-state.json` (per-developer tier). Once a
 * contract emits, the `*_emitted_at` field is set and never cleared — the
 * hint is one-time.
 *
 * Non-fatal: any exception during evaluation should be swallowed by the
 * caller. Returns an empty array on insufficient data.
 */
import { existsSync, openSync, readSync, closeSync, statSync } from 'fs';
import path from 'path';
import type { StateStore } from './stateStore.js';
import { nowIsoUtc } from '../util/time.js';

interface TriggerState {
  tc1_hint_emitted_at?: string;
  tc2_hint_emitted_at?: string;
}

const MAX_METRICS_BYTES = 5 * 1024 * 1024; // 5 MB P8 cap
const TC1_CROSS_KIND_THRESHOLD = 0.25;
const TC1_WINDOW_DAYS = 30;
const TC2_SESSION_COUNT = 50;
const TC2_DAY_SPAN = 30;

function readMetricsLines(metricsPath: string): string[] {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(metricsPath);
  } catch {
    return [];
  }
  const size = st.size;
  const start = Math.max(0, size - MAX_METRICS_BYTES);
  const fd = openSync(metricsPath, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const raw = buf.toString('utf8');
    const lines = raw.split('\n');
    return start === 0 ? lines : lines.slice(1);
  } finally {
    closeSync(fd);
  }
}

function parseJsonlLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap((l) => {
    try {
      return [JSON.parse(l) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

function crossKindRateExceeds(
  metricsPath: string,
  threshold: number,
  windowDays: number,
): boolean {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const events = parseJsonlLines(readMetricsLines(metricsPath))
    .filter((e) => e['event'] === 'proposal_proposed' && typeof e['ts'] === 'string')
    .filter((e) => Date.parse(e['ts'] as string) >= cutoff);
  if (events.length === 0) return false;
  const crossKind = events.filter((e) => {
    const kind = e['kind'] as string | undefined;
    return kind === 'code_to_doc' || kind === 'doc_to_code';
  });
  return crossKind.length / events.length > threshold;
}

function sessionStats(metricsPath: string): { sessionCount: number; daySpan: number } {
  const events = parseJsonlLines(readMetricsLines(metricsPath)).filter(
    (e) => typeof e['session_id'] === 'string' && typeof e['ts'] === 'string',
  );
  const ids = new Set(events.map((e) => e['session_id'] as string));
  const timestamps = events
    .map((e) => Date.parse(e['ts'] as string))
    .filter((t) => !isNaN(t));
  if (timestamps.length < 2) return { sessionCount: ids.size, daySpan: 0 };
  const span = (Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000;
  return { sessionCount: ids.size, daySpan: span };
}

export async function evaluateTriggerContracts(
  store: StateStore,
  coherenceDir: string,
): Promise<string[]> {
  const metricsPath = path.join(coherenceDir, 'metrics.jsonl');
  if (!existsSync(metricsPath)) return [];

  const state = (await store.read<TriggerState>('trigger-state.json')) ?? {};
  const hints: string[] = [];

  if (!state.tc1_hint_emitted_at) {
    if (crossKindRateExceeds(metricsPath, TC1_CROSS_KIND_THRESHOLD, TC1_WINDOW_DAYS)) {
      hints.push(
        'Author-planner readiness threshold met. ' +
          'Set COHERENCE_AUTHOR_PLANNER=1 to enable.',
      );
      state.tc1_hint_emitted_at = nowIsoUtc();
    }
  }

  if (!state.tc2_hint_emitted_at) {
    const { sessionCount, daySpan } = sessionStats(metricsPath);
    if (sessionCount >= TC2_SESSION_COUNT && daySpan >= TC2_DAY_SPAN) {
      hints.push(
        'Field calibration threshold met. ' +
          'Run /coherence:calibrate to re-tune thresholds.',
      );
      state.tc2_hint_emitted_at = nowIsoUtc();
    }
  }

  if (hints.length > 0) {
    await store.write('trigger-state.json', state);
  }
  return hints;
}
