/**
 * Bundle assembly — groups plan-derived patches into atomic commit bundles.
 * FR-STOP-9, FR-STOP-18
 * Same section across independent groups stays separate.
 */
import type { Patch, SectionRef } from '../types/index.js';

export interface PatchBundle {
  bundle_id: string;
  patches: Patch[];
  summary: string;
}

/**
 * Assemble patches from a single group into a bundle.
 * Patches from different groups that happen to share the same sectionRef
 * remain in their respective bundles (FR-STOP-18).
 */
export function assembleBundle(
  groupId: string,
  patches: Patch[],
  canonical: SectionRef,
): PatchBundle {
  const applicable = patches.filter(
    (p) => p.validationPassed && p.diff !== 'NO_PATCH_NEEDED' && p.diff !== 'ESCALATE',
  );

  const changedSections = applicable.map((p) => p.sectionRef);
  const canonicalShort = canonical.split('#')[1] ?? canonical;

  return {
    bundle_id: `bundle-${groupId}`,
    patches: applicable,
    summary: `Update ${canonicalShort} and ${changedSections.length - 1} related section(s)`,
  };
}
