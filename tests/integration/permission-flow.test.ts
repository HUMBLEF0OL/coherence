/**
 * Observe vs Graduated branching; frontmatter always-confirm.
 * FR-PERMISSION-1..3, FR-PERMISSION-5
 */
import { describe, it, expect } from 'vitest';
import { buildConsolidatedReview } from '../../src/permissions/review.js';
import { gateChangeClass } from '../../src/permissions/classes.js';
import type { PatchBundle } from '../../src/pipeline/bundle.js';
import type { SectionRef } from '../../src/types/index.js';

function ref(s: string): SectionRef { return s as SectionRef; }

describe('Observe mode: all patches need review', () => {
  const bundles: PatchBundle[] = [
    {
      bundle_id: 'bundle-g0',
      patches: [
        { sectionRef: ref('docs/api.md#intro'), diff: '--- diff', changeClass: 'additive', validationPassed: true },
        { sectionRef: ref('docs/guide.md#setup'), diff: '--- diff', changeClass: 'modifying', validationPassed: true },
        { sectionRef: ref('docs/config.md#opts'), diff: '--- diff', changeClass: 'destructive', validationPassed: true },
      ],
      summary: 'Test',
    },
  ];

  it('all rows need-review in observe mode', () => {
    const review = buildConsolidatedReview(bundles, 'observe');
    for (const row of review.rows) {
      expect(row.decision).toBe('needs-review');
    }
  });
});

describe('Graduated mode: additive auto-applies, others confirm', () => {
  it('additive auto-applies in graduated', () => {
    expect(gateChangeClass('additive', 'graduated')).toBe('auto-apply');
  });

  it('modifying still needs confirm in graduated', () => {
    expect(gateChangeClass('modifying', 'graduated')).toBe('confirm');
  });

  it('destructive still needs confirm in graduated', () => {
    expect(gateChangeClass('destructive', 'graduated')).toBe('confirm');
  });

  it('frontmatter always-confirm in graduated (FR-PERMISSION-3)', () => {
    expect(gateChangeClass('frontmatter', 'graduated')).toBe('confirm');
  });
});

describe('Mixed bundle in graduated mode', () => {
  const bundles: PatchBundle[] = [
    {
      bundle_id: 'bundle-g0',
      patches: [
        { sectionRef: ref('docs/api.md#intro'), diff: '--- diff', changeClass: 'additive', validationPassed: true },
        { sectionRef: ref('docs/api.md#frontmatter'), diff: '--- diff', changeClass: 'frontmatter', validationPassed: true },
      ],
      summary: 'Mixed',
    },
  ];

  it('additive auto-applied, frontmatter needs-review', () => {
    const review = buildConsolidatedReview(bundles, 'graduated');
    const addRow = review.rows.find((r) => r.changeClass === 'additive');
    const fmRow = review.rows.find((r) => r.changeClass === 'frontmatter');
    expect(addRow?.decision).toBe('auto-applied');
    expect(fmRow?.decision).toBe('needs-review');
  });
});
