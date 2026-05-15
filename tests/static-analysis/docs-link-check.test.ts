/**
 * Phase 3 (X3..X5, X1, X2) doc cross-link gate.
 *
 * Every relative markdown link `[label](path)` inside user-facing
 * `docs/**\/*.md` (excluding the maintainer-private `docs/superpowers/`
 * working-notes subtree) must resolve to an existing file on disk.
 *
 * Skipped:
 *   - External links (`https:`, `http:`, `mailto:`).
 *   - Pure-anchor links (`#section`).
 *   - Anything inside fenced code blocks or inline code spans — those
 *     are illustrative examples (e.g. `[text](FILLME)` documenting the
 *     no_placeholder_links assertion) and must not be treated as live
 *     links.
 *
 * Insurance against docs drift in the very directory that lectures
 * about drift.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const EXCLUDED_SUBTREES = ['superpowers'];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (dir === DOCS && EXCLUDED_SUBTREES.includes(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (full.endsWith('.md')) acc.push(full);
  }
  return acc;
}

/** Strip fenced code blocks and inline code spans so their content is
 *  not scanned for links. */
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

// [label](target) — capture group 1 = target. Negative lookahead skips
// external / mailto / pure-anchor links.
const LINK_RE = /\[[^\]]+\]\((?!https?:|mailto:|#)([^)\s]+)(?:\s+"[^"]*")?\)/g;

describe('docs link check', () => {
  it('every relative markdown link in docs/** resolves to an existing file', () => {
    const files = walk(DOCS);
    const broken: string[] = [];
    for (const file of files) {
      const text = stripCode(readFileSync(file, 'utf8'));
      LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = LINK_RE.exec(text)) !== null) {
        const raw = m[1];
        if (!raw) continue;
        const target = raw.split('#')[0];
        if (!target) continue;
        const resolved = path.resolve(path.dirname(file), target);
        if (!existsSync(resolved)) {
          broken.push(`${path.relative(ROOT, file)} -> ${target}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
