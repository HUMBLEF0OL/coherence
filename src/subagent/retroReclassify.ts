/**
 * 7-day revert-to-rejected reclassification.
 * FR-DETECT-17
 */
import type { SubagentAttribution } from './tracker.js';

const RECLASSIFY_WINDOW_DAYS = 7;

export function retroReclassify(
  history: SubagentAttribution[],
  revertedFiles: string[],
): SubagentAttribution[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECLASSIFY_WINDOW_DAYS);

  return history.map((entry) => {
    if (new Date(entry.started_at) < cutoff) return entry;
    const hasReverted = entry.files_touched.some((f) => revertedFiles.includes(f));
    if (hasReverted && entry.classification === 'accepted') {
      return { ...entry, classification: 'rejected' as const };
    }
    return entry;
  });
}
