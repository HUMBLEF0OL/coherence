/**
 * graduation.json read/write helpers (DD-074, M3).
 *
 * v0.3 M5 (DD-102/DD-110): adds the `de_annotate` namespace alongside
 * `global_mode` + `scopes`. The namespace records per-scope decisions about
 * how the trickle scanner treats already-annotated docs going forward
 * (strip vs graduate-to-user-anchor). Most-specific-wins per DD-074.
 */
import type { StateStore } from './stateStore.js';

export type V02Mode = 'observe' | 'annotate' | 'author';

export interface GraduationScope {
  path: string;
  mode: V02Mode;
}

export type DeAnnotateScope = 'per-doc' | 'per-directory' | 'global';
export type DeAnnotateAction = 'strip' | 'keep-as-user-anchor';

export interface DeAnnotateDecision {
  /** Scope path the decision applies to (e.g. 'docs/intro.md', 'docs/', or '*'). */
  path: string;
  scope: DeAnnotateScope;
  action: DeAnnotateAction;
  recorded_at: string;
}

export interface GraduationFile {
  schema_version: 2;
  global_mode: V02Mode;
  scopes: GraduationScope[];
  de_annotate?: DeAnnotateDecision[];
}

export function defaultGraduation(): GraduationFile {
  return { schema_version: 2, global_mode: 'observe', scopes: [] };
}

export async function readGraduation(store: StateStore): Promise<GraduationFile> {
  const f = await store.read<GraduationFile>('graduation.json');
  return f ?? defaultGraduation();
}

export async function writeGraduation(
  store: StateStore,
  f: GraduationFile,
): Promise<void> {
  await store.write('graduation.json', f);
}

/** Set the global mode (in-place; returns the new file). */
export function setGlobal(f: GraduationFile, mode: V02Mode): GraduationFile {
  return { ...f, global_mode: mode };
}

/** Set per-scope mode (in-place; returns the new file). Replaces any existing scope at the same path. */
export function setScope(
  f: GraduationFile,
  scopePath: string,
  mode: V02Mode,
): GraduationFile {
  const remaining = f.scopes.filter((s) => s.path !== scopePath);
  return { ...f, scopes: [...remaining, { path: scopePath, mode }] };
}

/** Clear a scope override. */
export function clearScope(f: GraduationFile, scopePath: string): GraduationFile {
  return { ...f, scopes: f.scopes.filter((s) => s.path !== scopePath) };
}

/** v0.3 M5: record a de-annotate decision (DD-102 most-specific-wins). */
export function setDeAnnotate(
  f: GraduationFile,
  decision: DeAnnotateDecision,
): GraduationFile {
  const existing = f.de_annotate ?? [];
  const remaining = existing.filter(
    (d) => !(d.path === decision.path && d.scope === decision.scope),
  );
  return { ...f, de_annotate: [...remaining, decision] };
}

/**
 * v0.3 M5: resolve the active de-annotate decision for `path`. Most-specific
 * wins: per-doc (path === filePath) > per-directory (filePath.startsWith(dir))
 * > global (path === '*').
 */
export function resolveDeAnnotate(
  f: GraduationFile,
  filePath: string,
): DeAnnotateDecision | undefined {
  const decisions = f.de_annotate ?? [];
  const perDoc = decisions.find((d) => d.scope === 'per-doc' && d.path === filePath);
  if (perDoc) return perDoc;
  const perDir = decisions
    .filter((d) => d.scope === 'per-directory' && filePath.startsWith(d.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (perDir) return perDir;
  const global = decisions.find((d) => d.scope === 'global' && d.path === '*');
  return global;
}
