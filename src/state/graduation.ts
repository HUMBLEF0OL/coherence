/**
 * graduation.json read/write helpers (DD-074, M3).
 */
import type { StateStore } from './stateStore.js';

export type V02Mode = 'observe' | 'annotate' | 'author';

export interface GraduationScope {
  path: string;
  mode: V02Mode;
}

export interface GraduationFile {
  schema_version: 2;
  global_mode: V02Mode;
  scopes: GraduationScope[];
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
