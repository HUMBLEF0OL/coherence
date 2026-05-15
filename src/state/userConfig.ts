/**
 * userConfig env-var bridge (C4).
 *
 * Claude Code surfaces install-time userConfig values declared in
 * `.claude-plugin/plugin.json#userConfig` as `CLAUDE_PLUGIN_OPTION_<KEY>`
 * env vars (uppercase, no underscore separator). This module reads those
 * env vars with explicit type coercion + validation, returning the
 * built-in default when unset so the rest of the codebase can keep calling
 * a single resolver regardless of install path.
 */
import type { V02Mode } from './graduation.js';

const VALID_MODES: ReadonlySet<V02Mode> = new Set([
  'observe',
  'annotate',
  'author',
] as V02Mode[]);

// `graduated` is the v0.1 legacy toggle; v0.2 mode graduation.json uses the
// V02Mode trio. We accept `graduated` from userConfig as an alias for
// "observe with the graduated toggle on" — surfacing it as a distinct value
// keeps the install-time prompt readable (DD-074 left this fork unresolved).
const ACCEPTED_MODES = new Set<string>([...VALID_MODES, 'graduated']);

export function resolveDefaultMode(): string {
  const env = process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'];
  if (env === undefined) return 'observe';
  if (!ACCEPTED_MODES.has(env)) {
    throw new Error(
      `invalid mode: ${env}. Expected one of: ${[...ACCEPTED_MODES].join(', ')}`,
    );
  }
  return env;
}

export function resolveTelemetryOptIn(): boolean {
  const env = process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'];
  if (env === undefined) return false;
  return env === 'true' || env === '1';
}
