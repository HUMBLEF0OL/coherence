/**
 * [coherence] commit message format.
 * FR-PERMISSION-4, DD-005, DD-038
 */
import type { Patch, SectionRef } from '../types/index.js';

export const COHERENCE_PREFIX = '[coherence]';
export const PENDING_MARKER_PREFIX = '<!-- coherence-pending:';

/**
 * Build the commit message for a coherence bundle.
 * Format:
 *   [coherence] <summary>
 *
 *   section: <workspace-relative-path>#<id>
 *   section: ...
 */
export function buildCommitMessage(summary: string, patches: Patch[]): string {
  const sections = patches
    .filter((p) => p.validationPassed && p.diff !== 'NO_PATCH_NEEDED' && p.diff !== 'ESCALATE')
    .map((p) => `section: ${p.sectionRef}`)
    .join('\n');

  const body = sections ? `\n\n${sections}` : '';
  return `${COHERENCE_PREFIX} ${summary}${body}`;
}

/**
 * Build a finalize commit message for aged pending markers.
 */
export function buildFinalizeMessage(sectionRefs: SectionRef[]): string {
  const sections = sectionRefs.map((r) => `section: ${r}`).join('\n');
  return `${COHERENCE_PREFIX} finalize\n\n${sections}`;
}

/**
 * Inject a <!-- coherence-pending: YYYY-MM-DD --> marker into additive patch content.
 * Used for additive auto-applied changes (DD-038).
 */
export function pendingMarker(date: string): string {
  return `${PENDING_MARKER_PREFIX} ${date} -->`;
}
