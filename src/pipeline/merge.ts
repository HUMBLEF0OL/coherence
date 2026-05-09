/**
 * Per-file merge of multiple Stage 2 patches.
 * FR-STOP-8: overlapping patches reject entire file with consolidated review note.
 */
import type { Patch, SectionRef } from '../types/index.js';

export interface MergeResult {
  merged: Patch[];
  rejected: Array<{ sectionRef: SectionRef; reason: string }>;
}

/**
 * Merge patches for sections that touch the same file.
 * If two patches modify the same line range, both are rejected for that file.
 * Simple implementation: if any two diffs from the same file overlap, reject them all.
 */
export function mergePatches(patches: Patch[]): MergeResult {
  // Group by file (extract path from sectionRef)
  const byFile = new Map<string, Patch[]>();

  for (const patch of patches) {
    if (patch.diff === 'NO_PATCH_NEEDED' || patch.diff === 'ESCALATE' || !patch.validationPassed) {
      continue;
    }
    const file = patch.sectionRef.split('#')[0] ?? '';
    const list = byFile.get(file) ?? [];
    list.push(patch);
    byFile.set(file, list);
  }

  const merged: Patch[] = [];
  const rejected: Array<{ sectionRef: SectionRef; reason: string }> = [];

  for (const [file, filePatches] of byFile) {
    if (filePatches.length <= 1) {
      merged.push(...filePatches);
      continue;
    }

    // Check for overlapping hunks
    const hasOverlap = detectOverlap(filePatches.map((p) => p.diff as string));
    if (hasOverlap) {
      for (const patch of filePatches) {
        rejected.push({
          sectionRef: patch.sectionRef,
          reason: `File ${file} has overlapping patches from multiple sections — needs manual review`,
        });
      }
    } else {
      merged.push(...filePatches);
    }
  }

  // Also include pass-through patches (NO_PATCH_NEEDED)
  for (const patch of patches) {
    if (patch.diff === 'NO_PATCH_NEEDED') {
      merged.push(patch);
    }
  }

  return { merged, rejected };
}

function detectOverlap(diffs: string[]): boolean {
  // Extract line ranges from each diff's hunks
  const ranges: Array<[number, number]> = [];

  for (const diff of diffs) {
    for (const line of diff.split('\n')) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (hunkMatch) {
        const start = parseInt(hunkMatch[1]!, 10);
        const count = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
        ranges.push([start, start + count]);
      }
    }
  }

  // Check pairwise overlap
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const [a1, a2] = ranges[i]!;
      const [b1, b2] = ranges[j]!;
      if (a1 < b2 && b1 < a2) return true;
    }
  }
  return false;
}
