/**
 * v1.0 M2 — assertion registry + dispatcher (TS-4 FR-ASSERTS-1..5).
 *
 * Reads frontmatter `asserts:` array from a section's parsed YAML.
 * Each entry: `{ type: string; param?: string; policy?: 'block' | 'warn' }`.
 * The 10-entry cap (FR-ASSERTS-1) + one-time stderr "ignored" warning is
 * enforced here.
 *
 * Unknown types are logged + ignored (FR-ASSERTS-5).
 */
import {
  has_example,
  no_placeholder_links,
  max_words,
  min_words,
  no_todo_comments,
  type AssertionInput,
  type AssertionOutcome,
} from './textPatterns.js';
import { symbol_exists, file_exists } from './codebaseLinked.js';

export type AssertionPolicy = 'block' | 'warn';
export const DEFAULT_POLICY: AssertionPolicy = 'warn';

export interface RawAssertion {
  type: string;
  param?: string;
  policy?: AssertionPolicy;
}

export interface AssertionRunResult extends AssertionOutcome {
  type: string;
  param?: string;
  policy: AssertionPolicy;
  ignored?: 'unknown_type' | 'cap_exceeded';
}

export const MAX_ASSERTIONS_PER_SECTION = 10;

type AsyncEngine = (input: AssertionInput, param: string | undefined, opts: { projectRoot: string }) => Promise<AssertionOutcome>;
type SyncEngine = (input: AssertionInput, param?: string) => AssertionOutcome;

const SYNC_ENGINES: Record<string, SyncEngine> = {
  has_example,
  no_placeholder_links,
  max_words,
  min_words,
  no_todo_comments,
};

const ASYNC_ENGINES: Record<string, AsyncEngine> = {
  symbol_exists,
  file_exists,
};

/** Names of all assertion types that the registry knows about. */
export function knownAssertionTypes(): string[] {
  return [...Object.keys(SYNC_ENGINES), ...Object.keys(ASYNC_ENGINES)];
}

/** Parse `frontmatter.asserts` — tolerate either string-array or object-array. */
export function parseAsserts(raw: unknown): RawAssertion[] {
  if (!Array.isArray(raw)) return [];
  const result: RawAssertion[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      // "type" or "type:param"
      const [type, ...rest] = item.split(':');
      if (!type) continue;
      const entry: RawAssertion = { type: type.trim() };
      if (rest.length > 0) entry.param = rest.join(':');
      result.push(entry);
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as { type?: unknown; param?: unknown; policy?: unknown };
      if (typeof obj.type !== 'string') continue;
      const entry: RawAssertion = { type: obj.type };
      if (typeof obj.param === 'string') entry.param = obj.param;
      if (obj.policy === 'block' || obj.policy === 'warn') entry.policy = obj.policy;
      result.push(entry);
    }
  }
  return result;
}

const warnedSections = new Set<string>();

/** Test helper — reset per-session "warned once" cache. */
export function resetAssertionWarnings(): void {
  warnedSections.clear();
}

export async function runAssertionsForSection(
  sectionRef: string,
  sectionContent: string,
  asserts: RawAssertion[],
  opts: { projectRoot: string; emitWarning?: (msg: string) => void },
): Promise<AssertionRunResult[]> {
  const out: AssertionRunResult[] = [];
  const overCap = asserts.length > MAX_ASSERTIONS_PER_SECTION;
  const active = asserts.slice(0, MAX_ASSERTIONS_PER_SECTION);
  const skipped = overCap ? asserts.slice(MAX_ASSERTIONS_PER_SECTION) : [];

  const input: AssertionInput = { content: sectionContent, sectionRef };
  for (const a of active) {
    const policy: AssertionPolicy = a.policy ?? DEFAULT_POLICY;
    const syncEngine = SYNC_ENGINES[a.type];
    if (syncEngine) {
      const r = syncEngine(input, a.param);
      const entry: AssertionRunResult = { ...r, type: a.type, policy };
      if (a.param !== undefined) entry.param = a.param;
      out.push(entry);
      continue;
    }
    const asyncEngine = ASYNC_ENGINES[a.type];
    if (asyncEngine) {
      const r = await asyncEngine(input, a.param, opts);
      const entry: AssertionRunResult = { ...r, type: a.type, policy };
      if (a.param !== undefined) entry.param = a.param;
      out.push(entry);
      continue;
    }
    const entry: AssertionRunResult = {
      passed: true,
      type: a.type,
      policy,
      ignored: 'unknown_type',
      message: `unknown assertion type '${a.type}'`,
    };
    if (a.param !== undefined) entry.param = a.param;
    out.push(entry);
  }
  for (const a of skipped) {
    const entry: AssertionRunResult = {
      passed: true,
      type: a.type,
      policy: a.policy ?? DEFAULT_POLICY,
      ignored: 'cap_exceeded',
      message: `over ${MAX_ASSERTIONS_PER_SECTION}-assertion cap`,
    };
    if (a.param !== undefined) entry.param = a.param;
    out.push(entry);
  }

  // FR-ASSERTS-1: one combined stderr warning per (section, session)
  if (!warnedSections.has(sectionRef)) {
    const ignoredCount = out.filter((r) => r.ignored).length;
    if (ignoredCount > 0) {
      const reasons = new Set<string>();
      for (const r of out) if (r.ignored) reasons.add(r.ignored);
      const msg = `coherence: ${ignoredCount} assertion(s) in section ${sectionRef} ignored: ${[...reasons].join(', ')}`;
      (opts.emitWarning ?? ((m): void => console.error(m)))(msg);
      warnedSections.add(sectionRef);
    }
  }

  return out;
}

export interface AssertionVerdict {
  ok: boolean;
  blocks: AssertionRunResult[];
  warns: AssertionRunResult[];
}

/** Group results by policy outcome — used by the validation pipeline. */
export function verdict(results: AssertionRunResult[]): AssertionVerdict {
  const violations = results.filter((r) => !r.ignored && !r.passed);
  const blocks = violations.filter((v) => v.policy === 'block');
  const warns = violations.filter((v) => v.policy === 'warn');
  return { ok: blocks.length === 0, blocks, warns };
}
