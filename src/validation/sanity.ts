/**
 * Deterministic change-class recount from a parsed diff.
 * DD-017, FR-STOP-6b: LLM-claimed class is overridden by computed class.
 * Whitespace-only '-' lines are ignored in the recount.
 */
import type parseDiff from 'parse-diff';
import type { ChangeClass } from '../types/index.js';

type ParsedFiles = ReturnType<typeof parseDiff>;

export interface SanityResult {
  changeClass: ChangeClass;
  addedLines: number;
  removedLines: number;
}

function isWhitespaceOnly(line: string): boolean {
  return line.trim() === '';
}

export function recomputeChangeClass(files: ParsedFiles): SanityResult {
  let addedLines = 0;
  let removedLines = 0;
  let touchesFrontmatter = false;

  for (const file of files) {
    const path = file.to ?? file.from ?? '';
    // Detect frontmatter-only change: file is YAML/TOML with frontmatter block
    const isFrontmatterFile = /\.(ya?ml|toml)$/.test(path);

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type === 'add') {
          addedLines++;
        } else if (change.type === 'del') {
          // Ignore whitespace-only deletions (DD-017)
          if (!isWhitespaceOnly(change.content.slice(1))) {
            removedLines++;
          }
        }
      }
    }

    if (isFrontmatterFile) touchesFrontmatter = true;
  }

  // Check for frontmatter-only change (within --- delimiters in Markdown files)
  // For simplicity, if all changes are in the first few lines with frontmatter markers
  if (touchesFrontmatter && addedLines > 0 && removedLines > 0) {
    return { changeClass: 'frontmatter', addedLines, removedLines };
  }

  let changeClass: ChangeClass;
  if (addedLines > 0 && removedLines === 0) {
    changeClass = 'additive';
  } else if (addedLines === 0 && removedLines > 0) {
    changeClass = 'destructive';
  } else if (addedLines > 0 && removedLines > 0) {
    changeClass = 'modifying';
  } else {
    // No actual changes after whitespace filtering
    changeClass = 'additive';
  }

  return { changeClass, addedLines, removedLines };
}

/**
 * Detect frontmatter-only diff: all changed lines are inside the leading
 * `---`/`---` block of a Markdown document.
 *
 * v1.0.1 Fix 5 (BUG-V1.0-B): the previous implementation treated the
 * unified-diff file header `--- a/path/to/file` as a frontmatter delimiter
 * (because `'--- a/...'.startsWith('---')` is true), so every markdown
 * patch was classified as frontmatter and forced into manual review
 * regardless of trust score. This implementation:
 *
 *   1. Skips unified-diff metadata lines (file headers, hunk headers,
 *      `diff --git`, `index ...`).
 *   2. Only treats a *content* line — i.e. after the `+`/`-`/` ` patch
 *      prefix is stripped — whose remaining content is exactly `---` as
 *      a frontmatter delimiter.
 *   3. Returns true only when frontmatter delimiters were encountered AND
 *      at least one change exists.
 */
export function isFrontmatterOnlyDiff(diffRaw: string): boolean {
  const lines = diffRaw.split('\n');
  let inFrontmatter = false;
  let frontmatterOpened = false;
  let anyChange = false;

  for (const line of lines) {
    // Skip unified-diff metadata. These never represent markdown content.
    if (
      line.startsWith('--- ') ||      // file header (e.g. '--- a/file.md')
      line.startsWith('+++ ') ||      // file header (e.g. '+++ b/file.md')
      line.startsWith('@@') ||        // hunk header
      line.startsWith('diff ') ||     // git's diff header
      line.startsWith('index ') ||    // git's index header
      line.startsWith('new file') ||  // git's mode header
      line.startsWith('deleted file') ||
      line.startsWith('similarity index') ||
      line.startsWith('rename from') ||
      line.startsWith('rename to')
    ) {
      continue;
    }
    if (line.length === 0) continue;

    const prefix = line[0];
    // Patch-body lines always start with '+', '-', or ' '. Anything else
    // is metadata we haven't enumerated above — skip conservatively.
    if (prefix !== '+' && prefix !== '-' && prefix !== ' ') continue;
    const content = line.slice(1);

    // A bare `---` content line marks a frontmatter delimiter.
    if (content === '---') {
      if (!frontmatterOpened) {
        frontmatterOpened = true;
        inFrontmatter = true;
      } else if (inFrontmatter) {
        inFrontmatter = false;
      }
      if (prefix === '+' || prefix === '-') anyChange = true;
      continue;
    }

    if (prefix === '+' || prefix === '-') {
      anyChange = true;
      if (!inFrontmatter) return false;
    }
  }
  return frontmatterOpened && anyChange;
}
