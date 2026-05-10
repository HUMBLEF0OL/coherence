/**
 * v0.3 scope resolver — DD-105 most-specific-wins with explicit `extends:` opt-in.
 *
 * Given the deepest-first ancestor chain from `walker.ts`, returns the
 * effective scope config for a file. Default semantics: most-specific wins
 * (deepest ancestor's value for any given key takes precedence). When an
 * ancestor declares `extends: <relative-or-id>`, its keys merge over the
 * extended scope rather than fully replacing it — opt-in shallow merge.
 *
 * Scope config files (coherence/scope.json / scope sections in CLAUDE.md)
 * are user-owned so they evolve under per-file `schema_version`. CLAUDE.md
 * scope blocks are not parsed here in M1 — only `coherence/scope.json` is
 * consumed as JSON. CLAUDE.md is treated as an *anchor presence* signal so
 * the cache eviction picks up edits there even though only the JSON sidecar
 * supplies machine-readable fields.
 */
import { readFileSync } from 'fs';
import path from 'path';
import type { ScopeAncestor } from './walker.js';

export interface ScopeConfig {
  schema_version: 1;
  /** Optional human-readable identifier (used by `extends:`). */
  scope_id?: string;
  /** Path or scope_id reference — opt-in for cross-scope merge. */
  extends?: string;
  /** Glob patterns to ignore at this scope. Merged additively. */
  ignore?: string[];
  /** Per-scope mode override. */
  mode?: 'observe' | 'annotate' | 'author';
  /** Free-form additional fields tolerated; the resolver only sees `extends`/`ignore`/`mode`. */
  [key: string]: unknown;
}

export interface ResolvedScope {
  /** The effective config — most-specific-wins applied. */
  effective: ScopeConfig;
  /** Per-key provenance: which ancestor file supplied the winning value. */
  provenance: Record<string, string>;
  /** Ancestors consulted during resolution, in deepest-first order. */
  ancestors: ScopeAncestor[];
  /** Whether any ancestor used `extends:` to opt into merge semantics. */
  extendsApplied: boolean;
}

/**
 * Resolve the effective scope for a file given its ancestor chain (deepest
 * first). Returns the merged config + per-key provenance.
 */
export function resolveScope(ancestors: ScopeAncestor[]): ResolvedScope {
  const effective: ScopeConfig = { schema_version: 1 };
  const provenance: Record<string, string> = {};
  let extendsApplied = false;

  // Walk shallowest-first so deeper writes win on overlap.
  const ordered = [...ancestors].reverse();
  for (const a of ordered) {
    if (!a.file.endsWith('.json')) {
      // CLAUDE.md is a presence-only signal in M1; no JSON merge.
      continue;
    }
    const cfg = readScopeJson(a.file);
    if (!cfg) continue;
    if (cfg.extends) {
      extendsApplied = true;
      // M1 semantics: `extends:` is acknowledged but the extended target
      // resolution is deferred to M3 (scope_id registry comes with plan
      // store). Today, `extends:` simply prevents the most-recent override
      // from clobbering keys absent in this ancestor — i.e. shallow merge
      // is already what the loop does, so flag and continue.
    }
    for (const [key, value] of Object.entries(cfg)) {
      if (key === 'schema_version' || key === 'extends') continue;
      if (key === 'ignore' && Array.isArray(value) && Array.isArray(effective.ignore)) {
        // ignore is additive even without explicit `extends:` (DD-105
        // narrative — committed-wins-on-conflict for ignore keys).
        const merged = [...effective.ignore];
        for (const item of value as string[]) {
          if (!merged.includes(item)) merged.push(item);
        }
        effective.ignore = merged;
      } else {
        effective[key] = value;
      }
      provenance[key] = a.file;
    }
  }

  return { effective, provenance, ancestors, extendsApplied };
}

function readScopeJson(file: string): ScopeConfig | null {
  try {
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw) as ScopeConfig;
  } catch {
    return null;
  }
}

/**
 * Compose ancestor + scope-config display path for the `/coherence:scope-debug`
 * command. Returns the ancestors with their resolved entries inline.
 */
export function describeChain(resolved: ResolvedScope): string[] {
  const lines: string[] = [];
  for (const a of resolved.ancestors) {
    const rel = path.relative(process.cwd(), a.file).replace(/\\/g, '/');
    lines.push(rel);
  }
  return lines;
}
