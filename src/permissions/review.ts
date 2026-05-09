/**
 * Consolidated Stop review UI — formats patch bundles for user presentation.
 * TS-4 §4.6, FR-PERMISSION-1..3, FR-PERMISSION-5..10
 */
import type { ChangeClass, CoherenceMode, SectionRef } from '../types/index.js';
import type { PatchBundle } from '../pipeline/bundle.js';
import { gateChangeClass } from './classes.js';

export interface ReviewRow {
  sectionRef: SectionRef;
  changeClass: ChangeClass;
  decision: 'auto-applied' | 'needs-review' | 'skipped';
  diffPreview?: string | undefined;
}

export interface AssertionFailure {
  sectionRef: SectionRef;
  description: string;
  lastVerifiedAge?: string;
}

export interface ConsolidatedReview {
  rows: ReviewRow[];
  assertionFailures: AssertionFailure[];
  demotedCanonicalsCount: number;
  demotedCanonicalsNotice?: string | undefined;
}

export function buildConsolidatedReview(
  bundles: PatchBundle[],
  mode: CoherenceMode,
  demotedCanonicalsCount = 0,
  assertionFailures: AssertionFailure[] = [],
): ConsolidatedReview {
  const rows: ReviewRow[] = [];

  for (const bundle of bundles) {
    for (const patch of bundle.patches) {
      const decision = gateChangeClass(patch.changeClass, mode);
      const row: ReviewRow = {
        sectionRef: patch.sectionRef,
        changeClass: patch.changeClass,
        decision: decision === 'auto-apply' ? 'auto-applied' : 'needs-review',
        diffPreview: typeof patch.diff === 'string' && patch.diff.startsWith('---')
          ? patch.diff.split('\n').slice(0, 8).join('\n')
          : undefined,
      };
      rows.push(row);
    }
  }

  let demotedCanonicalsNotice: string | undefined;
  if (demotedCanonicalsCount > 0) {
    demotedCanonicalsNotice = `${demotedCanonicalsCount} other declared-canonical section(s) were treated as references for this change`;
  }

  return {
    rows,
    assertionFailures,
    demotedCanonicalsCount,
    demotedCanonicalsNotice,
  };
}

export function formatReviewText(review: ConsolidatedReview): string {
  const lines: string[] = ['[coherence] Stop Review', ''];

  if (review.rows.length === 0) {
    lines.push('No patches to review.');
    return lines.join('\n');
  }

  const autoApplied = review.rows.filter((r) => r.decision === 'auto-applied');
  const needsReview = review.rows.filter((r) => r.decision === 'needs-review');

  if (autoApplied.length > 0) {
    lines.push(`Auto-applied (${autoApplied.length}):`);
    for (const row of autoApplied) {
      lines.push(`  [auto-applied] ${row.sectionRef} (${row.changeClass})`);
    }
    lines.push('');
  }

  if (needsReview.length > 0) {
    lines.push(`Needs review (${needsReview.length}):`);
    for (const row of needsReview) {
      lines.push(`  [needs review] ${row.sectionRef} (${row.changeClass})`);
      if (row.diffPreview) {
        lines.push('  <expand to see diff>');
      }
    }
    lines.push('');
  }

  if (review.assertionFailures.length > 0) {
    lines.push(`Assertion failures (${review.assertionFailures.length}):`);
    for (const af of review.assertionFailures) {
      const age = af.lastVerifiedAge ? ` [last verified: ${af.lastVerifiedAge}]` : '';
      lines.push(`  [!] ${af.sectionRef}: ${af.description}${age}`);
      lines.push('      Actions: Patch / Update assertion / Dismiss');
    }
    lines.push('');
  }

  if (review.demotedCanonicalsNotice) {
    lines.push(`Note: ${review.demotedCanonicalsNotice}`);
    lines.push('');
  }

  return lines.join('\n');
}
