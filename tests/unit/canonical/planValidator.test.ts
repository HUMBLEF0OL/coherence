/**
 * Plan validator unit tests.
 * FR-STOP-3, FR-STOP-16
 */
import { describe, it, expect } from 'vitest';
import { validatePlan, buildIndependentFallback } from '../../../src/validation/planValidator.js';
import type { CoherencePlan, SectionRef } from '../../../src/types/index.js';

function ref(s: string): SectionRef {
  return s as SectionRef;
}

const REFS = [ref('docs/api.md#intro'), ref('docs/guide.md#overview')];

describe('validatePlan', () => {
  it('passes a valid two-section plan', () => {
    const plan: CoherencePlan = {
      canonical: REFS[0]!,
      sections: [
        { sectionRef: REFS[0]!, role: 'canonical' },
        { sectionRef: REFS[1]!, role: 'reference', relation: 'mirrors' },
      ],
    };
    expect(validatePlan(plan, REFS)).toEqual({ valid: true });
  });

  it('rejects plan with zero canonicals', () => {
    const plan: CoherencePlan = {
      canonical: REFS[0]!,
      sections: [
        { sectionRef: REFS[0]!, role: 'no-change' },
        { sectionRef: REFS[1]!, role: 'reference', relation: 'mirrors' },
      ],
    };
    const result = validatePlan(plan, REFS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.fallback).toBe('independent');
    }
  });

  it('rejects plan with two canonicals', () => {
    const plan: CoherencePlan = {
      canonical: REFS[0]!,
      sections: [
        { sectionRef: REFS[0]!, role: 'canonical' },
        { sectionRef: REFS[1]!, role: 'canonical' },
      ],
    };
    const result = validatePlan(plan, REFS);
    expect(result.valid).toBe(false);
  });

  it('rejects mismatched top-level canonical', () => {
    const plan: CoherencePlan = {
      canonical: ref('docs/other.md#x'),
      sections: [
        { sectionRef: REFS[0]!, role: 'canonical' },
        { sectionRef: REFS[1]!, role: 'reference', relation: 'mirrors' },
      ],
    };
    const result = validatePlan(plan, REFS);
    expect(result.valid).toBe(false);
  });

  it('rejects plan missing an expected section', () => {
    const plan: CoherencePlan = {
      canonical: REFS[0]!,
      sections: [{ sectionRef: REFS[0]!, role: 'canonical' }],
    };
    const result = validatePlan(plan, REFS);
    expect(result.valid).toBe(false);
  });

  it('rejects plan with unexpected extra sections', () => {
    const plan: CoherencePlan = {
      canonical: REFS[0]!,
      sections: [
        { sectionRef: REFS[0]!, role: 'canonical' },
        { sectionRef: REFS[1]!, role: 'reference', relation: 'mirrors' },
        { sectionRef: ref('docs/extra.md#x'), role: 'no-change' },
      ],
    };
    const result = validatePlan(plan, REFS);
    expect(result.valid).toBe(false);
  });

  it('rejects no-change + omits (FR-STOP-16 contradiction)', () => {
    const plan: CoherencePlan = {
      canonical: REFS[0]!,
      sections: [
        { sectionRef: REFS[0]!, role: 'canonical' },
        { sectionRef: REFS[1]!, role: 'no-change', relation: 'omits' },
      ],
    };
    const result = validatePlan(plan, REFS);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/contradictory/);
    }
  });
});

describe('buildIndependentFallback', () => {
  it('produces one plan per section', () => {
    const plans = buildIndependentFallback(REFS);
    expect(plans).toHaveLength(2);
    expect(plans[0]!.canonical).toBe(REFS[0]);
    expect(plans[1]!.canonical).toBe(REFS[1]);
  });

  it('each plan has exactly one canonical section', () => {
    const plans = buildIndependentFallback(REFS);
    for (const p of plans) {
      expect(p.sections.filter((s) => s.role === 'canonical')).toHaveLength(1);
    }
  });
});
