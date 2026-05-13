/**
 * v1.0 M2 — text-pattern assertion engines (TS-4 FR-ASSERTS-2).
 *
 * Each engine takes a section's content (string) and an optional param,
 * returns `{ passed: boolean, message?: string }`. No state, no I/O.
 */

export interface AssertionInput {
  /** Section body content (Markdown). */
  content: string;
  /** sectionRef the assertion applies to. */
  sectionRef: string;
}

/**
 * Reason an assertion result was skipped or set-aside by the dispatcher.
 * Engines may emit `unsupported_lang` (e.g. `symbol_exported` for
 * non-TS/JS languages in v1.0.1). The dispatcher additionally sets
 * `unknown_type` (no matching engine) and `cap_exceeded` (over
 * MAX_ASSERTIONS_PER_SECTION).
 */
export type AssertionIgnoredReason =
  | 'unknown_type'
  | 'cap_exceeded'
  | 'unsupported_lang';

export interface AssertionOutcome {
  passed: boolean;
  message?: string;
  /**
   * Engines may return `ignored: 'unsupported_lang'` to signal "I can't
   * evaluate for this language yet". The dispatcher pipes the reason
   * through and may layer its own (`unknown_type`, `cap_exceeded`).
   */
  ignored?: AssertionIgnoredReason;
}

const FENCED_CODE_RE = /```[\s\S]*?```/;
const PLACEHOLDER_LINK_RE = /\[[^\]]+\]\((TODO|#|)\)/i;
const TODO_COMMENT_RE = /<!--\s*(TODO|FIXME)/i;

function outcome(passed: boolean, message?: string): AssertionOutcome {
  return passed || message === undefined ? { passed } : { passed, message };
}

export function has_example(input: AssertionInput): AssertionOutcome {
  const passed = FENCED_CODE_RE.test(input.content);
  return outcome(passed, passed ? undefined : `section ${input.sectionRef} has no code example`);
}

export function no_placeholder_links(input: AssertionInput): AssertionOutcome {
  const matched = PLACEHOLDER_LINK_RE.test(input.content);
  return outcome(!matched, matched ? `section ${input.sectionRef} contains placeholder links` : undefined);
}

export function max_words(input: AssertionInput, param?: string): AssertionOutcome {
  const max = parseInt(param ?? 'NaN', 10);
  if (!Number.isFinite(max) || max < 0) {
    return outcome(true, `max_words: invalid param '${param ?? ''}'`);
  }
  const words = input.content.trim().split(/\s+/).filter(Boolean).length;
  const passed = words <= max;
  return outcome(passed, passed ? undefined : `section ${input.sectionRef} has ${words} words (max ${max})`);
}

export function min_words(input: AssertionInput, param?: string): AssertionOutcome {
  const min = parseInt(param ?? 'NaN', 10);
  if (!Number.isFinite(min) || min < 0) {
    return outcome(true, `min_words: invalid param '${param ?? ''}'`);
  }
  const words = input.content.trim().split(/\s+/).filter(Boolean).length;
  const passed = words >= min;
  return outcome(passed, passed ? undefined : `section ${input.sectionRef} has ${words} words (min ${min})`);
}

export function no_todo_comments(input: AssertionInput): AssertionOutcome {
  const matched = TODO_COMMENT_RE.test(input.content);
  return outcome(!matched, matched ? `section ${input.sectionRef} contains <!-- TODO or <!-- FIXME marker` : undefined);
}
