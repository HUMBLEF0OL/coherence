/**
 * Velocity tracker: revert detection, consecutive-defer counter, auto-ignore.
 * TS-3 §3.7, DD-011, DD-051, FR-BUFFER-5
 */
import type { VelocityState } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

const REVERT_WINDOW_DAYS = 30;
const REVERT_THRESHOLD = 2;

export function initialVelocity(): VelocityState {
  return {
    revert_window_start: nowIsoUtc(),
    revert_count: 0,
    revert_timestamps: [],
    consecutive_defer_sessions: 0,
    last_defer_session_id: undefined,
    auto_ignored: [],
  };
}

/** Record a revert event. Returns true if auto-ignore threshold crossed (2 reverts/30 days). */
export function recordRevert(state: VelocityState, sectionPath: string): {
  updated: VelocityState;
  shouldAutoIgnore: boolean;
} {
  const now = nowIsoUtc();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - REVERT_WINDOW_DAYS);

  // Prune timestamps outside the 30-day window
  const recentTimestamps = state.revert_timestamps.filter(
    (t) => new Date(t) > windowStart,
  );
  recentTimestamps.push(now);

  const newCount = recentTimestamps.length;
  const shouldAutoIgnore =
    newCount >= REVERT_THRESHOLD && !state.auto_ignored.includes(sectionPath);

  const auto_ignored = shouldAutoIgnore
    ? [...state.auto_ignored, sectionPath]
    : state.auto_ignored;

  return {
    updated: {
      ...state,
      revert_count: newCount,
      revert_timestamps: recentTimestamps,
      auto_ignored,
    },
    shouldAutoIgnore,
  };
}

/** Record a session defer (buffer deferred). Reset on successful Stop. */
export function recordDefer(state: VelocityState, sessionId: string): VelocityState {
  return {
    ...state,
    consecutive_defer_sessions: state.consecutive_defer_sessions + 1,
    last_defer_session_id: sessionId,
  };
}

/** Reset consecutive defer count (after a successful Stop pipeline run). */
export function resetDefer(state: VelocityState): VelocityState {
  return {
    ...state,
    consecutive_defer_sessions: 0,
    last_defer_session_id: undefined,
  };
}
