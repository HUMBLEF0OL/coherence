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
}

export const DEFAULT_AGENT_CORRECTION_WINDOW_MIN = 5;
export const DEFAULT_AGENT_CORRECTION_LINE_RATIO = 0.2;
export const DEFAULT_AGENT_CORRECTION_COUNT = 3;
export const DEFAULT_AGENT_CORRECTION_WINDOW_DAYS = 7;

/**
 * Compute per-agent aggregate ratio across all of the agent's invocations
 * within the 7-day window, and the count of invocations whose 5-minute
 * follow-up edits exceeded the line-ratio threshold.
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

  const occurrencesAboveRatio = inWindow.filter(
    (s) => (s.total_lines === 0 ? 0 : s.lines_changed / s.total_lines) >= lineRatio,
  ).length;

  let fired = true;
  if (occurrencesAboveRatio < occurrenceCount) {
    reasons.push(`occurrences (${occurrencesAboveRatio}) < threshold (${occurrenceCount})`);
    fired = false;
  }
  if (ratio < lineRatio) {
    reasons.push(`aggregate ratio ${ratio.toFixed(3)} < ${lineRatio}`);
    fired = false;
  }

  return {
    agent_id: agentId,
    fired,
    ratio,
    occurrences_in_window: occurrencesAboveRatio,
    reasons,
  };
}
