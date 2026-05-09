/**
 * Path normalisation utilities.
 * DD-027: OS canonical realpath, forward-slash, lowercase casing tracked but case-sensitive comparison.
 * FR-DETECT-15: section-ref id must match [a-z0-9_-]+
 */
import { realpathSync, existsSync } from 'fs';
import path from 'path';
import type { NormalizedPath, SectionRef } from '../types/index.js';

const SECTION_ID_RE = /^[a-z0-9_-]+$/;

/** Normalise a filesystem path: resolve symlinks if possible, convert to forward-slash. */
export function normalizePath(p: string): NormalizedPath {
  let resolved = p;
  try {
    if (existsSync(p)) {
      resolved = realpathSync(p);
    }
  } catch {
    // If realpathSync fails, fall through to raw resolution
  }
  return path.resolve(resolved).split(path.sep).join('/') as NormalizedPath;
}

/** Normalise a section anchor id to [a-z0-9_-]+ */
export function normalizeSectionId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Validate a section ref of the form path#id */
export function validateSectionRef(ref: string): boolean {
  const hash = ref.lastIndexOf('#');
  if (hash < 1) return false;
  const id = ref.slice(hash + 1);
  return SECTION_ID_RE.test(id);
}

/** Build a SectionRef from path + id, normalizing both. */
export function makeSectionRef(p: NormalizedPath, id: string): SectionRef {
  const normId = normalizeSectionId(id);
  return `${p}#${normId}` as SectionRef;
}

/** Convert a path to be relative to the project root, forward-slash. */
export function toProjectRelative(absPath: string, projectRoot: string): string {
  const rel = path.relative(projectRoot, absPath);
  return rel.split(path.sep).join('/');
}
