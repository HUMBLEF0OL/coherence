/**
 * /coherence:graduate — v0.2 mode lifecycle (DD-074, FR-MODES-1..7).
 *
 * Backwards-compatible with the v0.1 toggle:
 *   `/coherence:graduate`           → upgrade global mode to 'graduated' (legacy flag)
 *   `/coherence:graduate --revert`  → reset global mode to 'observe' (legacy flag)
 *
 * v0.2 surface:
 *   `/coherence:graduate observe`              → set global mode 'observe'
 *   `/coherence:graduate annotate [<scope>]`   → set scope (or global) to 'annotate'
 *   `/coherence:graduate author   [<scope>]`   → set scope (or global) to 'author'
 *   `/coherence:graduate --status`             → render effective mode for cwd
 *
 * v0.2 mode never enables auto-apply (FR-MODES-6); DD-065 quarantine boundary
 * is preserved at every mode level.
 */
import type { StateStore } from '../state/stateStore.js';
import type { CoherenceConfig, CoherenceMode, VersionInfo } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';
import {
  readGraduation,
  writeGraduation,
  setGlobal,
  setScope,
  type V02Mode,
  type GraduationFile,
} from '../state/graduation.js';
import { resolveMode } from '../modes/resolver.js';

export interface GraduateOptions {
  /** Legacy v0.1 toggle: if set, the function delegates to v0.1 behaviour. */
  revert?: boolean;
  /** v0.2: target mode. */
  mode?: V02Mode;
  /** v0.2: optional scope (project-relative path). */
  scope?: string;
  /** v0.2: print effective mode for `cwdPath` instead of mutating. */
  status?: boolean;
  /** v0.2: when computing `--status`, the project-relative path to resolve. */
  cwdPath?: string;
}

export interface GraduateResult {
  previousMode: CoherenceMode;
  newMode: CoherenceMode;
  v02PreviousMode?: V02Mode;
  v02NewMode?: V02Mode;
  effectiveMode?: V02Mode;
  scope?: string;
  message: string;
}

export async function runGraduate(
  store: StateStore,
  opts: GraduateOptions = {},
): Promise<GraduateResult> {
  const config = await store.read<CoherenceConfig>('config.json');
  const previousMode: CoherenceMode = config?.mode ?? 'observe';
  const graduation = await readGraduation(store);

  // --- v0.2 --status branch -------------------------------------------------
  if (opts.status) {
    const target = opts.cwdPath ?? '.';
    const effective = resolveMode({ graduation, targetPath: target });
    const message = `[coherence] graduate --status: effective mode for '${target}' is '${effective}' (global: '${graduation.global_mode}', ${graduation.scopes.length} scope override(s))`;
    return {
      previousMode,
      newMode: previousMode,
      effectiveMode: effective,
      message,
    };
  }

  // --- v0.2 mode argument branch -------------------------------------------
  if (opts.mode) {
    let updated: GraduationFile;
    const v02NewMode: V02Mode = opts.mode;
    if (opts.scope) {
      updated = setScope(graduation, opts.scope, v02NewMode);
    } else {
      updated = setGlobal(graduation, v02NewMode);
    }
    await writeGraduation(store, updated);

    // Mirror to legacy config.mode for v0.1 callers that read it.
    const legacyMode: CoherenceMode = v02NewMode === 'observe' ? 'observe' : 'graduated';
    await store.write<CoherenceConfig>('config.json', {
      ...(config ?? {}),
      mode: legacyMode,
    });

    const where = opts.scope ? `for scope '${opts.scope}'` : 'globally';
    const result: GraduateResult = {
      previousMode,
      newMode: legacyMode,
      v02PreviousMode: graduation.global_mode,
      v02NewMode,
      message: `[coherence] graduate: mode set to '${v02NewMode}' ${where} (was global '${graduation.global_mode}')`,
    };
    if (opts.scope) result.scope = opts.scope;
    return result;
  }

  // --- legacy v0.1 toggle ---------------------------------------------------
  const newMode: CoherenceMode = opts.revert ? 'observe' : 'graduated';
  await store.write<CoherenceConfig>('config.json', {
    ...(config ?? {}),
    mode: newMode,
  });
  // Mirror legacy toggle into v0.2 graduation.global_mode:
  //   observe   → observe
  //   graduated → annotate (the simplest opt-in beyond observe)
  const v02FromLegacy: V02Mode = opts.revert ? 'observe' : 'annotate';
  await writeGraduation(store, setGlobal(graduation, v02FromLegacy));

  const version = await store.read<VersionInfo>('version.json');
  if (version) {
    await store.write<VersionInfo>('version.json', {
      ...version,
      upgraded_at: nowIsoUtc(),
    });
  }

  const verb = opts.revert ? 'reverted to' : 'upgraded to';
  const message = `[coherence] graduate: ${verb} ${newMode} mode (was: ${previousMode})`;
  return {
    previousMode,
    newMode,
    v02PreviousMode: graduation.global_mode,
    v02NewMode: v02FromLegacy,
    message,
  };
}
