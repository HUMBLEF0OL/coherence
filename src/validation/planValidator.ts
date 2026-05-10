/**
 * Plan validator — structural checks before Stage 2 dispatch.
 * FR-STOP-3, FR-STOP-16, TS-5 §5.3
 */
import type { CoherencePlan, SectionRef } from '../types/index.js';

export type PlanValidationResult =
  | { valid: true }
  | { valid: false; reason: string; fallback: 'independent' | 'reject' };

/**
 * Validate a Stage 1 plan:
 * - Exactly one canonical.
 * - canonical field matches the sections array entry with role: canonical.
 * - All input sectionRefs are accounted for.
 * - No section has role: no-change AND relation: omits (contradictory — FR-STOP-16).
 */
export function validatePlan(
  plan: CoherencePlan,
  expectedSectionRefs: SectionRef[],
): PlanValidationResult {
  // Must have at least one section
  if (!plan.sections || plan.sections.length === 0) {
    return { valid: false, reason: 'Plan has no sections', fallback: 'independent' };
  }

  // Exactly one canonical role
  const canonicals = plan.sections.filter((s) => s.role === 'canonical');
  if (canonicals.length !== 1) {
    return {
      valid: false,
      reason: `Plan must have exactly 1 canonical section, found ${canonicals.length}`,
      fallback: 'independent',
    };
  }

  // Top-level canonical matches section array
  const canonicalSection = canonicals[0];
  if (plan.canonical !== canonicalSection.sectionRef) {
    return {
      valid: false,
      reason: `Plan canonical (${plan.canonical}) does not match sections entry (${canonicalSection.sectionRef})`,
      fallback: 'independent',
    };
  }

  // All expected sectionRefs accounted for
  const plannedRefs = new Set(plan.sections.map((s) => s.sectionRef));
  const missing = expectedSectionRefs.filter((r) => !plannedRefs.has(r));
  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Plan missing sections: ${missing.join(', ')}`,
      fallback: 'independent',
    };
  }

  // No extra sections not in the expected set
  const expectedSet = new Set(expectedSectionRefs);
  const extra = plan.sections.filter((s) => !expectedSet.has(s.sectionRef));
  if (extra.length > 0) {
    return {
      valid: false,
      reason: `Plan contains unexpected sections: ${extra.map((s) => s.sectionRef).join(', ')}`,
      fallback: 'independent',
    };
  }

  // FR-STOP-16: no-change + omits is contradictory
  for (const s of plan.sections) {
    if (s.role === 'no-change' && s.relation === 'omits') {
      return {
        valid: false,
        reason: `Section ${s.sectionRef} has contradictory role:no-change + relation:omits`,
        fallback: 'independent',
      };
    }
  }

  return { valid: true };
}

/**
 * Build independent per-section plans as fallback when Stage 1 plan is invalid.
 * Each section becomes its own single-section canonical plan.
 */
export function buildIndependentFallback(sectionRefs: SectionRef[]): CoherencePlan[] {
  return sectionRefs.map((ref) => ({
    canonical: ref,
    sections: [{ sectionRef: ref, role: 'canonical' as const }],
  }));
}
