/**
 * Section index — built once per session, cached in section-index.json.
 * R-17 mitigation, FR-DETECT-15
 */
import { readFileSync } from 'fs';
import { scanAnchors } from './anchorScanner.js';
import { hashContent } from '../buffer/contentHash.js';
import { normalizePath, makeSectionRef } from '../state/pathNormaliser.js';
import { discoverFiles } from './discovery.js';
import { nowIsoUtc } from '../util/time.js';
import type { SectionIndexEntry, NormalizedPath } from '../types/index.js';

export interface SectionIndex {
  built_at: string;
  entries: SectionIndexEntry[];
}

export function buildSectionIndex(projectRoot: string): SectionIndex {
  const files = discoverFiles(projectRoot);
  const entries: SectionIndexEntry[] = [];

  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file.path, 'utf8');
    } catch {
      continue;
    }

    const normalizedPath = normalizePath(file.path) as NormalizedPath;
    const { sections } = scanAnchors(source, file.path);

    for (const section of sections) {
      const sectionRef = makeSectionRef(normalizedPath, section.id);
      entries.push({
        path: normalizedPath,
        sectionRef,
        heading: section.heading,
        line_start: section.lineStart,
        line_end: section.lineEnd,
        contentHash: hashContent(section.content),
      });
    }
  }

  return { built_at: nowIsoUtc(), entries };
}

export function lookupSection(
  index: SectionIndex,
  sectionRef: string,
): SectionIndexEntry | undefined {
  return index.entries.find((e) => e.sectionRef === sectionRef);
}

export function getFileSections(index: SectionIndex, normalizedPath: string): SectionIndexEntry[] {
  return index.entries.filter((e) => e.path === normalizedPath);
}
