/**
 * Cross-layer expansion — scan other layers for sections that watch the canonical concepts.
 * FR-LAYERS-5, DD-008 Coherence Pass
 * Bounded by DD-056 caps.
 */
import type { BufferEntry, SectionIndexEntry } from '../types/index.js';
import type { SectionGroup } from './grouping.js';
import { nowIsoUtc } from '../util/time.js';

/**
 * Given a set of groups and the full section index, find sections in other layers
 * that reference any of the canonical concepts (via `watches:` annotations or
 * anchor references).
 * Returns additional BufferEntry items to fold into the batch.
 */
export function crossLayerExpand(
  groups: SectionGroup[],
  sectionIndex: SectionIndexEntry[],
  maxAdditional: number,
): BufferEntry[] {
  const canonicalPaths = new Set(groups.flatMap((g) => g.triggering_files));

  const additional: BufferEntry[] = [];

  for (const entry of sectionIndex) {
    if (additional.length >= maxAdditional) break;

    // Skip sections already in a group
    const alreadyIncluded = groups.some((g) =>
      g.entries.some((e) => e.sectionRef === entry.sectionRef),
    );
    if (alreadyIncluded) continue;

    // Check if this section is in a different layer and watches one of the canonical paths
    // Simplified: a section "watches" another if its path is in a different layer
    // and the canonical path appears in its heading or sectionRef
    const sectionPath = entry.path as string;
    const isRelated = [...canonicalPaths].some(
      (cp) =>
        sectionPath !== cp &&
        (entry.heading?.toLowerCase().includes(cp.split('/').pop()?.replace('.md', '') ?? '') ||
          entry.sectionRef.includes(cp.split('/').pop()?.replace('.md', '') ?? '')),
    );

    if (isRelated) {
      additional.push({
        path: entry.path,
        sectionRef: entry.sectionRef,
        contentHash: entry.contentHash,
        triggeredAt: nowIsoUtc(),
        source: 'posttooluse',
      });
    }
  }

  return additional;
}
