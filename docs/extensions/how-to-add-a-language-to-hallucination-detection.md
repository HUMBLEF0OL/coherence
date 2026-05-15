# How to add a language to hallucination detection

## What's the hallucination grep?

After Stage 2 writes a patch, Coherence runs a two-tier hallucination
check (DD-032 / DD-047) on the **added** lines of the diff. It extracts
tokens, then asks: "is this token also present anywhere in the
session-changed files' content?" Tokens that fail strict-tier indicators
(path separators, member access, suspicious shape, etc.) and aren't found
in the known-token set demote the patch.

A **language registry** plugs a new language's import-line tokenizer into
that extraction pipeline so that idiomatic import syntax (e.g.
`require_relative`, `from foo import bar`) is recognised as a source of
tokens rather than noise.

The integration point is `extractTokensFromDiff()` and `buildKnownTokenSet()`
in [src/validation/hallucination.ts](../../src/validation/hallucination.ts).

## Where registries live

```
src/validation/registries/
├── ts-js.ts            # TypeScript / JavaScript
├── python.ts
├── go.ts
├── rust.ts
├── java.ts
├── csharp.ts
├── ruby.ts
└── php.ts
```

Each file exports a single function `tokenizeImportLine(line: string):
string[]`. There is no central registry index — every language is
imported by name from `hallucination.ts`.

## The interface

```typescript
export function tokenizeImportLine(line: string): string[];
```

Pure function. No state. Given one line of source code (usually
something that looks like an import), return the **identifiers** worth
adding to the token set — module names, named-import bindings, aliases.

If the input doesn't match an import pattern in your language, return
`[]`. The caller filters falsy values so a `[]` return is the canonical
"no match".

## Worked example: adding Kotlin

Kotlin imports look like:

```kotlin
import com.example.foo.Bar
import com.example.baz.*
import com.example.qux.Quux as Q
```

### Step 1 — Create the registry

Write [src/validation/registries/kotlin.ts](../../src/validation/registries/):

```typescript
/**
 * Kotlin import-line tokenizer.
 */
export function tokenizeImportLine(line: string): string[] {
  const match = line.match(/^import\s+([\w.]+(?:\.\*)?)(?:\s+as\s+(\w+))?/);
  if (!match) return [];
  const tokens: string[] = [];
  if (match[1]) tokens.push(match[1].replace(/\.\*$/, ''));     // module path
  if (match[2]) tokens.push(match[2]);                          // alias
  return tokens;
}
```

Compare against [ruby.ts](../../src/validation/registries/ruby.ts) for the
simplest possible shape, and [ts-js.ts](../../src/validation/registries/ts-js.ts)
for one that handles named bindings.

### Step 2 — Wire it into the hallucination grep

In [src/validation/hallucination.ts](../../src/validation/hallucination.ts):

```typescript
import { tokenizeImportLine as tokenizeKotlin } from './registries/kotlin.js';

// ... inside extractTokensFromDiff():
for (const tokenizer of [
  tokenizeTsJs,
  tokenizePython,
  tokenizeGo,
  tokenizeRust,
  tokenizeJava,
  tokenizeCsharp,
  tokenizeRuby,
  tokenizePhp,
  tokenizeKotlin,                  // <-- new
]) {
  for (const t of tokenizer(line)) tokens.add(t);
}
```

That's the whole wiring change.

### Step 3 — Tests

Create `tests/unit/validation/registries/kotlin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { tokenizeImportLine } from '../../../../src/validation/registries/kotlin.js';

describe('kotlin tokenizeImportLine', () => {
  it('extracts module path', () => {
    expect(tokenizeImportLine('import com.example.foo.Bar')).toEqual(['com.example.foo.Bar']);
  });
  it('strips wildcard', () => {
    expect(tokenizeImportLine('import com.example.baz.*')).toEqual(['com.example.baz']);
  });
  it('captures alias', () => {
    expect(tokenizeImportLine('import com.example.Q as Qx')).toEqual(['com.example.Q', 'Qx']);
  });
  it('returns [] on non-import lines', () => {
    expect(tokenizeImportLine('val x = 1')).toEqual([]);
  });
});
```

Follow the pattern in
[tests/unit/validation/](../../tests/unit/validation/) — there is no
shared scaffolding to inherit; each registry test is self-contained.

## Gotchas

- **Parse-based vs grep-based.** Existing registries are all regex-based.
  That is deliberate: the hallucination pass runs on every patch and must
  stay sub-millisecond. Do not add a real parser unless the language
  cannot be tokenised by regex.
- **No control flow tokens.** Keep variable names, function calls, and
  inline-string contents out. Only emit tokens that come from the
  import statement itself — that's the contract the strict-tier
  detector in `hallucination.ts` relies on.
- **Return aliases too.** If `import X as Y` is legal in your language,
  emit both `X` and `Y`. The "known-token set" is a superset; missing
  an alias means a downstream `Y.foo` reference gets flagged.
- **No I/O.** The function must be pure. No filesystem access, no
  network — `hallucination.ts` calls it inside a tight loop over diff
  lines.
- **One file per language.** Keep the convention. Don't add the
  tokenizer into `hallucination.ts` directly.
- **No `symbol_exists` here.** The hallucination grep is separate from
  the `symbol_exists` asserts engine in
  [src/validation/assertions/codebaseLinked.ts](../../src/validation/assertions/codebaseLinked.ts).
  The latter walks the tree; this one only looks at the diff. If you
  want full per-language symbol resolution as well, add your language
  to the `LANG_GLOBS` map in `codebaseLinked.ts` — separate change,
  separate review.
