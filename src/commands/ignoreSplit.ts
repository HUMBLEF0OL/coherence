/**
 * /coherence:ignore-split — DD-096 two-file additive ignore model.
 *
 * Splits a project's ignore configuration so the team-shared rules live in
 * `coherence/ignore` (committed) and per-developer rules live in
 * `coherence/ignore.local` (gitignored). Idempotent: re-running on a project
 * that has both files + the gitignore line is a no-op.
 *
 * Concretely:
 *   - if `coherence/ignore.local` is missing, create it empty
 *   - if `.gitignore` does not list `coherence/ignore.local`, append the
 *     line under a `# cohrence — personal ignore` header
 *   - exit 0 in all cases (the command is meant to be safe to chain)
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import path from 'path';

export interface IgnoreSplitResult {
  /** Actions taken — used by the CLI to print a one-line summary. */
  actions: string[];
  /** Resolved (absolute) paths the command interacted with. */
  paths: {
    coherenceIgnore: string;
    ignoreLocal: string;
    gitignore: string;
  };
}

const HEADER = '# cohrence — personal ignore';
const GITIGNORE_LINE = 'coherence/ignore.local';

export function runIgnoreSplit(projectRoot: string): IgnoreSplitResult {
  const coherenceDir = path.join(projectRoot, 'coherence');
  const coherenceIgnore = path.join(coherenceDir, 'ignore');
  const ignoreLocal = path.join(coherenceDir, 'ignore.local');
  const gitignore = path.join(projectRoot, '.gitignore');

  const actions: string[] = [];

  mkdirSync(coherenceDir, { recursive: true });

  if (!existsSync(coherenceIgnore)) {
    writeFileSync(coherenceIgnore, '', 'utf8');
    actions.push('Created empty coherence/ignore (committed)');
  }

  if (!existsSync(ignoreLocal)) {
    writeFileSync(ignoreLocal, '', 'utf8');
    actions.push('Created empty coherence/ignore.local (personal)');
  }

  const gitignoreRaw = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  // Audit-fix E1: strip UTF-8 BOM so a BOM-prefixed .gitignore is parsed correctly.
  const gitignoreText = gitignoreRaw.charCodeAt(0) === 0xfeff ? gitignoreRaw.slice(1) : gitignoreRaw;
  if (!hasGitignoreEntry(gitignoreText)) {
    const appended =
      (gitignoreText.endsWith('\n') || gitignoreText.length === 0 ? '' : '\n') +
      `${HEADER}\n${GITIGNORE_LINE}\n`;
    if (existsSync(gitignore)) {
      appendFileSync(gitignore, appended, 'utf8');
    } else {
      writeFileSync(gitignore, appended, 'utf8');
    }
    actions.push('Appended coherence/ignore.local to .gitignore');
  }

  if (actions.length === 0) {
    actions.push('already split, no-op');
  }

  return {
    actions,
    paths: { coherenceIgnore, ignoreLocal, gitignore },
  };
}

export function formatIgnoreSplit(r: IgnoreSplitResult): string {
  const lines = ['[coherence] ignore-split:'];
  for (const a of r.actions) lines.push(`  • ${a}`);
  return lines.join('\n');
}

/**
 * True if `text` already contains `coherence/ignore.local` as a non-comment
 * line (handles both forward-slash and backslash separators on Windows
 * conservatively). Comments + `!coherence/ignore.local` negations don't
 * count as "already entered".
 */
function hasGitignoreEntry(text: string): boolean {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('!')) continue;
    if (line === GITIGNORE_LINE) return true;
    // Tolerate `/coherence/ignore.local` and `coherence\ignore.local`.
    if (line === `/${GITIGNORE_LINE}`) return true;
    if (line === GITIGNORE_LINE.replace('/', path.sep)) return true;
  }
  return false;
}
