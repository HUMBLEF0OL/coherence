/**
 * Consolidated Stop review UI tests.
 * FR-PERMISSION-5..10
 */
import { describe, it, expect } from 'vitest';
import { buildConsolidatedReview, formatReviewText } from '../../../src/permissions/review.js';
import type { PatchBundle } from '../../../src/pipeline/bundle.js';
import type { SectionRef } from '../../../src/types/index.js';

function ref(s: string): SectionRef { return s as SectionRef; }

const additivePatch = {
  sectionRef: ref('docs/api.md#intro'),
  diff: '--- a/docs/api.md\n+++ b/docs/api.md\n@@ -1 +1 @@\n-old\n+new',
  changeClass: 'additive' as const,
  validationPassed: true,
};

const modifyingPatch = {
  sectionRef: ref('docs/guide.md#setup'),
  diff: '--- a/docs/guide.md\n+++ b/docs/guide.md\n@@ -5 +5 @@\n-x\n+y',
  changeClass: 'modifying' as const,
  validationPassed: true,
};

const bundle: PatchBundle = {
  bundle_id: 'bundle-g0',
  patches: [additivePatch, modifyingPatch],
  summary: 'Update API intro',
};

describe('buildConsolidatedReview', () => {
  it('additive auto-applied in graduated mode', () => {
    const review = buildConsolidatedReview([bundle], 'graduated');
    const addRow = review.rows.find((r) => r.sectionRef === ref('docs/api.md#intro'));
    expect(addRow?.decision).toBe('auto-applied');
  });

  it('additive needs-review in observe mode', () => {
    const review = buildConsolidatedReview([bundle], 'observe');
    const addRow = review.rows.find((r) => r.sectionRef === ref('docs/api.md#intro'));
    expect(addRow?.decision).toBe('needs-review');
  });

  it('modifying always needs-review', () => {
    const review = buildConsolidatedReview([bundle], 'graduated');
    const modRow = review.rows.find((r) => r.sectionRef === ref('docs/guide.md#setup'));
    expect(modRow?.decision).toBe('needs-review');
  });

  it('demotedCanonicalsNotice includes count', () => {
    const review = buildConsolidatedReview([bundle], 'observe', 2);
    expect(review.demotedCanonicalsNotice).toContain('2 other declared-canonical');
  });

  it('assertion failures are included', () => {
    const failures = [
      { sectionRef: ref('docs/api.md#intro'), description: 'version mismatch', lastVerifiedAge: '3d' },
    ];
    const review = buildConsolidatedReview([bundle], 'observe', 0, failures);
    expect(review.assertionFailures).toHaveLength(1);
  });
});

describe('formatReviewText', () => {
  it('shows auto-applied section for graduated mode', () => {
    const review = buildConsolidatedReview([bundle], 'graduated');
    const text = formatReviewText(review);
    expect(text).toContain('[auto-applied]');
    expect(text).toContain('[needs review]');
  });

  it('shows assertion failures with Patch / Update / Dismiss actions', () => {
    const failures = [{ sectionRef: ref('docs/api.md#intro'), description: 'stale' }];
    const review = buildConsolidatedReview([bundle], 'observe', 0, failures);
    const text = formatReviewText(review);
    expect(text).toContain('Patch / Update assertion / Dismiss');
  });

  it('shows demoted canonical notice when present', () => {
    const review = buildConsolidatedReview([bundle], 'observe', 1);
    const text = formatReviewText(review);
    expect(text).toContain('declared-canonical');
  });
});
