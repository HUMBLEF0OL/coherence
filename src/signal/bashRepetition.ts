/**
 * Bash repetition detector (DD-076, FR-AUTHOR-6/-7).
 *
 * Threshold: 3 normalised matches in a 30-min rolling window.
 *
 * The detector is pure: feed it the current signal-cache and a candidate
 * normalised-bash-command, and it returns whether the threshold is met
 * (and the matching signature hash for proposal collision pre-checks).
 */
import { signatureHash } from './signatureHash.js';
import { normaliseBashCommand } from './normalize.js';
import type { SignalCache } from './signalCache.js';

export interface BashDetectionResult {
  signature_hash: string;
  normalised_command: string;
  fired: boolean;
  occurrences_in_window: number;
}

export const DEFAULT_BASH_REPETITION_COUNT = 3;
export const DEFAULT_BASH_REPETITION_WINDOW_MIN = 30;

export interface BashDetectionConfig {
  count?: number;
  windowMinutes?: number;
}

export function detectBashRepetition(
  cache: SignalCache,
  rawCommand: string,
  now: Date = new Date(),
  cfg: BashDetectionConfig = {},
): BashDetectionResult {
  const count = cfg.count ?? DEFAULT_BASH_REPETITION_COUNT;
  const windowMin = cfg.windowMinutes ?? DEFAULT_BASH_REPETITION_WINDOW_MIN;
  const normalised = normaliseBashCommand(rawCommand);
  const hash = signatureHash('tool_invocation', normalised);
  const cutoff = now.getTime() - windowMin * 60 * 1000;
  const item = cache.buckets.bash_repetition.items.find((i) => i.signature_hash === hash);
  let occurrencesInWindow = 0;
  if (item) {
    if (Date.parse(item.last_seen) >= cutoff) occurrencesInWindow = item.occurrences;
  }
  return {
    signature_hash: hash,
    normalised_command: normalised,
    fired: occurrencesInWindow + 1 >= count,
    occurrences_in_window: occurrencesInWindow + 1,
  };
}
