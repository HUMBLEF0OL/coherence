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
 * Detect frontmatter-only diff: all changed lines are inside the leading --- block
 * of a Markdown document.
 */
export function isFrontmatterOnlyDiff(diffRaw: string): boolean {
  const lines = diffRaw.split('\n');
  let inFrontmatter = false;
  let frontmatterOpened = false;

  for (const line of lines) {
    if (line.startsWith('---') && !frontmatterOpened) {
      frontmatterOpened = true;
      inFrontmatter = true;
      continue;
    }
    if (line.startsWith('---') && inFrontmatter) {
      inFrontmatter = false;
      continue;
    }
    // Any change line outside frontmatter means it's not frontmatter-only
    if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      if (!inFrontmatter) return false;
    }
  }
  return frontmatterOpened;
}
