/**
 * Union-find grouping of buffer entries by triggering_files overlap.
 * FR-DETECT-3, DD-025
 */
import type { BufferEntry, SectionRef, NormalizedPath } from '../types/index.js';

export interface SectionGroup {
  group_id: string;
  entries: BufferEntry[];
  triggering_files: NormalizedPath[];
}

class UnionFind {
  private parent: Map<SectionRef, SectionRef> = new Map();

  find(x: SectionRef): SectionRef {
    if (!this.parent.has(x)) return x;
    const root = this.find(this.parent.get(x)!);
    this.parent.set(x, root);
    return root;
  }

  union(a: SectionRef, b: SectionRef): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Group buffer entries by section-level triggering overlap.
 * Two entries are in the same group if they share at least one triggering file
 * (i.e. the same source file triggered drift in both sections).
 */
export function groupEntries(entries: BufferEntry[]): SectionGroup[] {
  if (entries.length === 0) return [];

  const uf = new UnionFind();

  // Build path → [entries] index
  const pathToEntries = new Map<NormalizedPath, SectionRef[]>();
  for (const e of entries) {
    const list = pathToEntries.get(e.path) ?? [];
    list.push(e.sectionRef);
    pathToEntries.set(e.path, list);
  }

  // Union all section refs that share a path
  for (const refs of pathToEntries.values()) {
    for (let i = 1; i < refs.length; i++) {
      uf.union(refs[0], refs[i]);
    }
  }

  // Collect groups
  const rootToEntries = new Map<SectionRef, BufferEntry[]>();
  for (const e of entries) {
    const root = uf.find(e.sectionRef);
    const list = rootToEntries.get(root) ?? [];
    list.push(e);
    rootToEntries.set(root, list);
  }

  let groupIndex = 0;
  const groups: SectionGroup[] = [];
  for (const [, groupEntries] of rootToEntries) {
    const triggering_files = [
      ...new Set(groupEntries.map((e) => e.path)),
    ] as NormalizedPath[];
    groups.push({
      group_id: `g${groupIndex++}`,
      entries: groupEntries,
      triggering_files,
    });
  }

  return groups;
}
