# How to add an asserts engine

## What's an asserts engine?

An **asserts engine** is a function the validation pipeline calls when a
doc file declares `asserts:` in its YAML frontmatter. The engine inspects
the section (and optionally the codebase) and returns `pass / fail`. A
failed assertion either **blocks** the patch (escalates to review) or
**warns** (attaches to the bundle), depending on per-entry `policy`.

The integration point is `applyAssertions()` in
[src/validation/assertions/applyToPatch.ts](../../src/validation/assertions/applyToPatch.ts),
called from [src/pipeline/stage2.ts](../../src/pipeline/stage2.ts) right
after the hallucination grep.

Frontmatter example:

```yaml
---
asserts:
  - { type: has_example,            policy: block }
  - { type: min_words, param: '50', policy: warn  }
  - { type: symbol_exists, param: 'runStopOrchestrator', policy: block }
---
```

## Where engines live

```
src/validation/assertions/
├── index.ts            # the REGISTRY (SYNC_ENGINES + ASYNC_ENGINES)
├── applyToPatch.ts     # the dispatcher called by stage2.ts
├── textPatterns.ts     # sync engines: has_example, min/max_words, ...
├── codebaseLinked.ts   # async engines: symbol_exists, file_exists
└── exportedSymbol.ts   # async engine: symbol_exported (LIM-1 closure)
```

Pick `textPatterns.ts` if your engine only inspects the section's
content. Pick `codebaseLinked.ts` (or a new file alongside it) if your
engine has to walk the project tree.

## The interface

From [src/validation/assertions/textPatterns.ts](../../src/validation/assertions/textPatterns.ts):

```typescript
export interface AssertionInput {
  /** Section body content (Markdown). */
  content: string;
  /** sectionRef the assertion applies to. */
  sectionRef: string;
}

export type AssertionIgnoredReason =
  | 'unknown_type'
  | 'cap_exceeded'
  | 'unsupported_lang';

export interface AssertionOutcome {
  passed: boolean;
  message?: string;
  ignored?: AssertionIgnoredReason;
}
```

A **sync engine** has the signature

```typescript
type SyncEngine = (input: AssertionInput, param?: string) => AssertionOutcome;
```

An **async engine** has the signature

```typescript
type AsyncEngine = (
  input: AssertionInput,
  param: string | undefined,
  opts: { projectRoot: string },
) => Promise<AssertionOutcome>;
```

The dispatcher routes by name to either `SYNC_ENGINES` or `ASYNC_ENGINES`
in [src/validation/assertions/index.ts](../../src/validation/assertions/index.ts).
Unknown types are not an error — they are ignored with `ignored:
'unknown_type'` and a one-shot stderr warning per section per session.

## Worked example: `mentions_any`

We'll add a sync engine `mentions_any:<word>[,<word>...]` that passes when
the section content contains at least one of the comma-separated words
(case-insensitive). Useful for asserting that a "Quickstart" section
mentions one of `install`, `setup`, or `bootstrap`.

### Step 1 — Implement the engine

Append to [src/validation/assertions/textPatterns.ts](../../src/validation/assertions/textPatterns.ts):

```typescript
export function mentions_any(input: AssertionInput, param?: string): AssertionOutcome {
  const words = (param ?? '').split(',').map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) {
    return outcome(true, `mentions_any: empty param`);
  }
  const lower = input.content.toLowerCase();
  const passed = words.some((w) => lower.includes(w.toLowerCase()));
  return outcome(passed, passed ? undefined : `section ${input.sectionRef} mentions none of: ${words.join(', ')}`);
}
```

### Step 2 — Register it

In [src/validation/assertions/index.ts](../../src/validation/assertions/index.ts),
add to the `SYNC_ENGINES` table and update the import:

```typescript
import {
  has_example,
  no_placeholder_links,
  max_words,
  min_words,
  no_todo_comments,
  mentions_any,            // <-- new
  type AssertionInput,
  type AssertionOutcome,
} from './textPatterns.js';

const SYNC_ENGINES: Record<string, SyncEngine> = {
  has_example,
  no_placeholder_links,
  max_words,
  min_words,
  no_todo_comments,
  mentions_any,            // <-- new
};
```

That's the entire wiring — `knownAssertionTypes()` and the dispatcher pick
up the new key automatically.

### Step 3 — Tests

Add a `describe('mentions_any')` block to
[tests/unit/validation/assertions-text.test.ts](../../tests/unit/validation/assertions-text.test.ts):

```typescript
import { mentions_any } from '../../../src/validation/assertions/textPatterns.js';

describe('mentions_any', () => {
  const SR = 'README.md#quickstart';
  it('passes when content contains any of the words', () => {
    expect(mentions_any({ sectionRef: SR, content: 'Run npm install to set up.' }, 'install,setup').passed).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(mentions_any({ sectionRef: SR, content: 'Install first.' }, 'install').passed).toBe(true);
  });
  it('fails when none match', () => {
    expect(mentions_any({ sectionRef: SR, content: 'Hello world.' }, 'install,setup').passed).toBe(false);
  });
  it('empty param ignored (pass)', () => {
    expect(mentions_any({ sectionRef: SR, content: 'x' }, '').passed).toBe(true);
  });
});
```

For an **async** engine you'd add tests to
[tests/unit/validation/assertions-codebase.test.ts](../../tests/unit/validation/assertions-codebase.test.ts)
instead, and remember to call `resetFileListCache()` between fixtures to
keep the per-session file-list cache from leaking across tests.

### Step 4 — Use it from frontmatter

```yaml
---
asserts:
  - { type: mentions_any, param: 'install,setup,bootstrap', policy: block }
---
```

## Gotchas

- **Idempotency.** Engines must be pure — same input, same output, no
  side effects. The dispatcher caches nothing; you do not get to assume
  call ordering.
- **Two policies, one path.** `policy: block` violations land in
  `verdict.blocks` and escalate the patch to review.
  `policy: warn` (the default) land in `verdict.warns` and attach to the
  bundle UX. Choose deliberately — most engines should default to `warn`.
- **The 10-assertion cap.** `MAX_ASSERTIONS_PER_SECTION = 10` per
  section. Extras come back with `ignored: 'cap_exceeded'`; you can't
  bypass it from inside an engine.
- **One-shot warnings.** The dispatcher emits one combined stderr
  warning per `(sectionRef, session)` summarising any ignored
  assertions. Don't `console.error` from inside your engine — return
  `ignored: '<reason>'` and let the dispatcher aggregate.
- **Async engines pay file-system cost.** `symbol_exists` reads source
  files. Cache aggressively: the existing pattern is the
  `fileListCache` keyed by language inside `codebaseLinked.ts`, with a
  test helper `resetFileListCache()` to clear it. Mirror that pattern
  if your engine touches the tree.
- **`unsupported_lang`.** If your async engine can't evaluate for a
  given project (e.g. an `exported_symbol` check for Ruby when only the
  TS path is implemented), return `ignored: 'unsupported_lang'` rather
  than `passed: false`. The dispatcher treats `ignored` as
  non-violations.
- **Param parsing.** Both `:`-suffix string form and the structured
  object form land in your engine as a `string | undefined` param.
  Don't assume structure — `split(':')` happens upstream in
  `parseAsserts()`.
