/**
 * Hard caps for the Stop pipeline.
 * DD-056, FR-STOP-11
 */
import type { SectionGroup } from './grouping.js';

export const MAX_GROUPS = 3;
export const MAX_SECTIONS_PER_GROUP = 12;
export const MAX_TOTAL_SECTIONS = 36;
export const MAX_INPUT_TOKENS = 30_000;
export const MAX_OUTPUT_TOKENS = 8_000;
export const MAX_CONCURRENT = 8;

export interface CapsResult {
  allowed: SectionGroup[];
  deferred: SectionGroup[];
  deferredSectionCount: number;
}

/**
 * Enforce hard caps on the group/section set.
 * Canonical-first ordering: groups are sorted so canonical sections come first.
 */
export function enforceCaps(groups: SectionGroup[]): CapsResult {
  const allowed: SectionGroup[] = [];
  const deferred: SectionGroup[] = [];
  let totalSections = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const groupSectionCount = group.entries.length;

    if (
      i >= MAX_GROUPS ||
      totalSections + groupSectionCount > MAX_TOTAL_SECTIONS ||
      groupSectionCount > MAX_SECTIONS_PER_GROUP
    ) {
      deferred.push(group);
    } else {
      allowed.push(group);
      totalSections += groupSectionCount;
    }
  }

  const deferredSectionCount = deferred.reduce((sum, g) => sum + g.entries.length, 0);
  return { allowed, deferred, deferredSectionCount };
}
