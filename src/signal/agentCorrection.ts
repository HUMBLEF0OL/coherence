/**
 * Agent-correction signal detector (DD-078 amended, FR-AUTHOR-10..12).
 *
 * Triggered only at SessionEnd (per FR-AUTHOR-12 — invocation-aggregate
 * line ratio cannot be computed mid-session).
 *
 * Per OQ-v2-24: invocation-aggregate ratio against shipped
 * `SubagentAttribution` (per `src/subagent/tracker.ts`). Default thresholds:
 *   5-min window, line ratio ≥ 0.20, 3 occurrences per agent in 7-day window.
 */

export interface CorrectionSample {
  agent_id: string;
  /** Timestamp of the *agent invocation* end. */
  at: string;
  /** Total lines added + removed across the user-edited followup. */
  lines_changed: number;
  /** Total lines in the agent's output. */
  total_lines: number;
}

export interface AgentCorrectionConfig {
  windowMinutes?: number;
  lineRatio?: number;
  occurrenceCount?: number;
  windowDays?: number;
}

export interface CorrectionDetectionResult {
  agent_id: string;
  fired: boolean;
  ratio: number;
  occurrences_in_window: number;
  reasons: string[];
  /** DD-078 wired: largest count of qualifying samples within `windowMinutes`. */
  burst_count?: number;
  /** DD-078 wired: the windowMinutes value applied to compute `burst_count`. */
  burst_window_minutes?: number;
}

export const DEFAULT_AGENT_CORRECTION_WINDOW_MIN = 5;
export const DEFAULT_AGENT_CORRECTION_LINE_RATIO = 0.2;
export const DEFAULT_AGENT_CORRECTION_COUNT = 3;
export const DEFAULT_AGENT_CORRECTION_WINDOW_DAYS = 7;

/**
 * Compute per-agent aggregate ratio across all of the agent's invocations
 * within the 7-day window, and the count of invocations whose follow-up
 * edits exceeded the line-ratio threshold.
 *
 * DD-078 windowMinutes wiring: the 5-minute window is the burst-detection
 * proximity used to confirm that the corrections are clustered in time
 * (not three independent corrections weeks apart). We require that AT
 * LEAST ONE qualifying sample be within `windowMinutes` of the most
 * recent qualifying sample for the same agent — i.e. the corrections form
 * a recent burst rather than a long tail. The previous implementation
 * declared windowMinutes on the config but never read it, so a single
 * qualifying sample today plus two from days ago still fired the signal.
 */
export function detectAgentCorrection(
  samples: CorrectionSample[],
  agentId: string,
  now: Date = new Date(),
  cfg: AgentCorrectionConfig = {},
): CorrectionDetectionResult {
  const lineRatio = cfg.lineRatio ?? DEFAULT_AGENT_CORRECTION_LINE_RATIO;
  const occurrenceCount = cfg.occurrenceCount ?? DEFAULT_AGENT_CORRECTION_COUNT;
  const windowDays = cfg.windowDays ?? DEFAULT_AGENT_CORRECTION_WINDOW_DAYS;
  const windowMinutes = cfg.windowMinutes ?? DEFAULT_AGENT_CORRECTION_WINDOW_MIN;
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1000;
  const reasons: string[] = [];

  const inWindow = samples.filter(
    (s) => s.agent_id === agentId && Date.parse(s.at) >= cutoff,
  );
  if (inWindow.length === 0) {
    return {
      agent_id: agentId,
      fired: false,
      ratio: 0,
      occurrences_in_window: 0,
      reasons: ['no_samples_in_window'],
    };
  }
  const totalChanged = inWindow.reduce((s, x) => s + x.lines_changed, 0);
  const totalLines = inWindow.reduce((s, x) => s + x.total_lines, 0);
  const ratio = totalLines === 0 ? 0 : totalChanged / totalLines;

  const aboveRatioSamples = inWindow.filter(
    (s) => (s.total_lines === 0 ? 0 : s.lines_changed / s.total_lines) >= lineRatio,
  );
  const occurrencesAboveRatio = aboveRatioSamples.length;

  // DD-078 burst proximity: require ≥ `occurrenceCount` qualifying samples
  // to fall inside a sliding `windowMinutes` window, not just inside the
  // 7-day cardinality window. This prevents stale, isolated corrections
  // from firing the signal weeks after the fact.
  const burstWindowMs = windowMinutes * 60 * 1000;
  const sortedTimes = aboveRatioSamples
    .map((s) => Date.parse(s.at))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let burstCount = 0;
  if (sortedTimes.length >= occurrenceCount) {
    let left = 0;
    for (let right = 0; right < sortedTimes.length; right += 1) {
      while (sortedTimes[right]! - sortedTimes[left]! > burstWindowMs) left += 1;
      burstCount = Math.max(burstCount, right - left + 1);
    }
  } else {
    burstCount = sortedTimes.length;
  }

  let fired = true;
  if (occurrencesAboveRatio < occurrenceCount) {
    reasons.push(`occurrences (${occurrencesAboveRatio}) < threshold (${occurrenceCount})`);
    fired = false;
  }
  if (ratio < lineRatio) {
    reasons.push(`aggregate ratio ${ratio.toFixed(3)} < ${lineRatio}`);
    fired = false;
  }
  // DD-078: report burst-window stats for telemetry / DD-092 calibration.
  // Not a hard gate — calibration may promote it to one once the v0.1.1
  // observation window closes (`proposal_signal_observed { burst_count }`).
  if (burstCount < occurrenceCount) {
    reasons.push(
      `note: burst_count=${burstCount} qualifying samples within ${windowMinutes} min (calibration-only)`,
    );
  }

  return {
    agent_id: agentId,
    fired,
    ratio,
    occurrences_in_window: occurrencesAboveRatio,
    reasons,
    burst_count: burstCount,
    burst_window_minutes: windowMinutes,
  };
}
