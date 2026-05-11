/**
 * /coherence:de-annotate — strip auto-annotations or graduate them
 * (DD-102/DD-110).
 *
 * Two modes:
 *   default          — strip `auto-annotated: true` blocks from the targeted
 *                      doc(s); the future trickle scan no longer treats them
 *                      as anchored docs in scope.
 *   --keep-as-user-anchor — retain the anchor block but flip
 *                      `auto-annotated` from true → false (graduates to a
 *                      user-owned anchor; trickle still sees it).
 *
 * Scope (DD-102): `per-doc` (default), `per-directory`, `global`. The decision
 * is persisted into `graduation.json#de_annotate` so future scans honour it.
 *
 * Hint: when surrounding content has been edited since the auto-annotation
 * was placed, the command emits a one-line hint suggesting
 * `--keep-as-user-anchor` so the user does not lose the in-progress edits.
 */
import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import {
  readGraduation,
  writeGraduation,
  setDeAnnotate,
  type DeAnnotateAction,
  type DeAnnotateScope,
} from '../state/graduation.js';
import { nowIsoUtc } from '../util/time.js';

export interface DeAnnotateOptions {
  store: StateStore;
  projectRoot: string;
  /** Target doc path (project-relative). For `--scope global` this is `*`. */
  target: string;
  scope?: DeAnnotateScope;
  keepAsUserAnchor?: boolean;
}

export interface DeAnnotateResult {
  scope: DeAnnotateScope;
  action: DeAnnotateAction;
  filesAffected: string[];
  hint?: string;
}

/**
 * Audit-fix B7: tolerate CRLF + LF line endings on Windows checkouts.
 *
 * The regex matches only `auto-annotated: true` because that is the
 * machine-owned state. Once a user runs `--keep-as-user-anchor` the block
 * becomes `auto-annotated: false` (graduated to user-owned); subsequent
 * runs are intentional no-ops — the anchor is no longer the plugin's to
 * strip.
 */
const ANNOTATE_BLOCK_RE =
  /<!--\s*coherence:section\s+([a-z0-9_-]+)\s*\r?\nauto-annotated:\s*true\s*-->/gi;

const KEEP_REPLACEMENT = (id: string): string =>
  `<!-- coherence:section ${id}\nauto-annotated: false -->`;

export async function runDeAnnotate(
  options: DeAnnotateOptions,
): Promise<DeAnnotateResult> {
  const {
    store,
    projectRoot,
    target,
    scope = 'per-doc',
    keepAsUserAnchor = false,
  } = options;

  const action: DeAnnotateAction = keepAsUserAnchor ? 'keep-as-user-anchor' : 'strip';

  // Persist the decision first so re-scans honour it even if the file edit
  // step below errors out.
  const graduation = await readGraduation(store);
  const updated = setDeAnnotate(graduation, {
    path: target,
    scope,
    action,
    recorded_at: nowIsoUtc(),
  });
  await writeGraduation(store, updated);

  const filesAffected: string[] = [];
  let hint: string | undefined;

  if (scope === 'per-doc') {
    const abs = path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
    // Audit-3 S1: refuse paths outside projectRoot. Without this, a
    // malicious or buggy caller could `/coherence:de-annotate ../../etc/foo.md`
    // and we'd overwrite the file if it happened to match ANNOTATE_BLOCK_RE.
    if (!isInside(projectRoot, abs)) {
      throw new Error(
        `de-annotate: refuses to operate on path outside the project root: ${target}`,
      );
    }
    if (existsSync(abs)) {
      const result = applyAction(abs, action);
      if (result.changed) filesAffected.push(abs);
      if (result.hint) hint = result.hint;
    }
  }
  // per-directory + global: defer rewriting to the trickle scanner
  // (avoids walking every doc inline; matches DD-110 narrative).

  return {
    scope,
    action,
    filesAffected,
    ...(hint !== undefined ? { hint } : {}),
  };
}

interface ApplyResult {
  changed: boolean;
  hint?: string;
}

function applyAction(absPath: string, action: DeAnnotateAction): ApplyResult {
  const body = readFileSync(absPath, 'utf8');
  if (!ANNOTATE_BLOCK_RE.test(body)) {
    return { changed: false };
  }
  ANNOTATE_BLOCK_RE.lastIndex = 0;

  let next: string;
  if (action === 'strip') {
    next = body.replace(ANNOTATE_BLOCK_RE, '');
  } else {
    next = body.replace(ANNOTATE_BLOCK_RE, (_full, id: string) => KEEP_REPLACEMENT(id));
  }
  if (next === body) return { changed: false };

  let hint: string | undefined;
  // User-edit detection: if the file mtime is newer than the auto-annotation
  // block's apparent first appearance, suggest keep mode. The simple proxy:
  // `auto-annotated: true` blocks are normally written together with the
  // anchor on creation, so any mtime newer than insertion implies post-anchor
  // edit. We can't read the original insert time without scan-cache history,
  // so the heuristic is: file size > 4 KB and was modified within the last
  // 24 hours.
  try {
    const st = statSync(absPath);
    const ageMs = Date.now() - st.mtimeMs;
    if (st.size > 4 * 1024 && ageMs < 24 * 3600 * 1000 && action === 'strip') {
      hint = 'Run with --keep-as-user-anchor to preserve.';
    }
  } catch {
    /* mtime not available — skip the hint */
  }

  writeFileSync(absPath, next, 'utf8');
  return { changed: true, ...(hint !== undefined ? { hint } : {}) };
}

/**
 * Audit-3 S1: assert `candidate` resolves inside `projectRoot`. Symlinks
 * are not followed — relative-path traversal is the documented attack
 * surface; symlink hijacks require shell-level access already.
 */
function isInside(projectRoot: string, candidate: string): boolean {
  const projectAbs = path.resolve(projectRoot);
  const candAbs = path.resolve(candidate);
  if (candAbs === projectAbs) return true;
  const rel = path.relative(projectAbs, candAbs);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function formatDeAnnotate(r: DeAnnotateResult): string {
  const lines = [
    `[coherence] de-annotate (${r.scope}, ${r.action}):`,
    `  files affected: ${r.filesAffected.length}`,
  ];
  for (const f of r.filesAffected.slice(0, 5)) {
    lines.push(`    • ${f}`);
  }
  if (r.filesAffected.length > 5) {
    lines.push(`    … and ${r.filesAffected.length - 5} more`);
  }
  if (r.hint) lines.push(`  hint: ${r.hint}`);
  return lines.join('\n');
}
