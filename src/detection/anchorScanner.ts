/**
 * Anchor scanner: stack-based parser for <!-- coherence:section ... --> / <!-- /coherence:section -->
 * FR-DETECT-12, R-18 (skip fenced code blocks), R-7 (orphan/duplicate IDs)
 * GitHub-slug heading fallback with -1/-2 disambiguation.
 */
import { normalizeSectionId } from '../state/pathNormaliser.js';

export interface AnchorSection {
  id: string;
  heading: string | undefined;
  lineStart: number;
  lineEnd: number;
  content: string;
}

export interface AnchorScanResult {
  sections: AnchorSection[];
  warnings: string[];
}

const OPEN_RE = /<!--\s*coherence:section\s+id="([^"]+)"(?:\s+heading="([^"]*)")?\s*-->/;
const CLOSE_RE = /<!--\s*\/coherence:section\s*-->/;
const FENCE_RE = /^(`{3,}|~{3,})/;
const HEADING_RE = /^#{1,6}\s+(.+)$/;

export function scanAnchors(source: string, filePath: string): AnchorScanResult {
  const lines = source.split('\n');
  const sections: AnchorSection[] = [];
  const warnings: string[] = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  const stack: Array<{ id: string; heading?: string; lineStart: number; contentLines: string[] }> = [];
  const seenIds = new Set<string>();
  const warnedFiles = new Set<string>();

  let lastHeading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Fenced code block detection (R-18)
    const fenceMatch = FENCE_RE.exec(line);
    if (!inFence && fenceMatch) {
      inFence = true;
      fenceChar = fenceMatch[1]![0]!;
      fenceLen = fenceMatch[1]!.length;
      continue;
    }
    if (inFence) {
      const closeRe = new RegExp(`^[${fenceChar}]{${fenceLen},}\\s*$`);
      if (closeRe.test(line)) {
        inFence = false;
      }
      // Push line to current stack frame if inside
      if (stack.length > 0) stack[stack.length - 1]!.contentLines.push(line);
      continue;
    }

    // Track headings for fallback IDs
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      lastHeading = headingMatch[1]!.trim();
    }

    // Check for open anchor
    const openMatch = OPEN_RE.exec(line);
    if (openMatch) {
      const rawId = openMatch[1]!;
      const heading = openMatch[2] ?? lastHeading;
      const normId = normalizeSectionId(rawId);

      if (seenIds.has(normId)) {
        if (!warnedFiles.has(filePath)) {
          warnings.push(`Duplicate section id "${normId}" in ${filePath} (line ${i + 1})`);
          warnedFiles.add(filePath);
        }
      }
      seenIds.add(normId);
      stack.push({ id: normId, heading, lineStart: i + 1, contentLines: [] });
      continue;
    }

    // Check for close anchor
    const closeMatch = CLOSE_RE.exec(line);
    if (closeMatch) {
      if (stack.length === 0) {
        warnings.push(`Orphan close anchor at ${filePath}:${i + 1}`);
        continue;
      }
      const frame = stack.pop()!;
      sections.push({
        id: frame.id,
        heading: frame.heading,
        lineStart: frame.lineStart,
        lineEnd: i + 1,
        content: frame.contentLines.join('\n'),
      });
      continue;
    }

    // Accumulate content for open frames
    if (stack.length > 0) {
      stack[stack.length - 1]!.contentLines.push(line);
    }
  }

  // Report unclosed anchors
  for (const frame of stack) {
    warnings.push(`Unclosed anchor id="${frame.id}" in ${filePath} (opened at line ${frame.lineStart})`);
  }

  return { sections, warnings };
}

/**
 * Generate GitHub-style slug from a heading string, with collision disambiguation.
 */
export function slugifyHeading(heading: string, existing: Set<string>): string {
  let slug = normalizeSectionId(
    heading
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-'),
  );

  if (!existing.has(slug)) {
    existing.add(slug);
    return slug;
  }

  let counter = 1;
  while (existing.has(`${slug}-${counter}`)) counter++;
  const unique = `${slug}-${counter}`;
  existing.add(unique);
  return unique;
}
