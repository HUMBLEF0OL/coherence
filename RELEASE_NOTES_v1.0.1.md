# Coherence v1.0.1

Post-tag hardening for the v1.0.0 trust + intelligence release. Ten
correctness fixes caught during downstream-bootstrap audits, the
mcp-sentry LLM-layer smoke test, a fresh dummy-project smoke, and a
thorough Path-C migration audit against a freshly published v1.0.0
plugin install.

Fixes 4 and 5 unblock the main happy path — without them, the v1.0.0
trust ladder and auto-apply gate are structurally dead. Fix 7 closes
a content-extraction bug that mis-handled code fences in anchored
sections. Fix 8 closes LIM-1 (the rename-with-stale-callers drift
class) via a new opt-in `symbol_exported` assertion engine. **Fix 9
migrates the LLM transport from `@anthropic-ai/sdk` (API-key auth)
to `@anthropic-ai/claude-agent-sdk` (Claude Code subscription auth)**
— users with a paid Claude.ai subscription no longer need to
provision a separate Anthropic API key to use coherence.

## Highlights

- **README cosign verification block renders verbatim (`cb52271`)** — the
  `## Verification` block in `README.md` now contains the literal
  `--certificate-identity-regexp` value ending in `tags/v.*$'`. The
  prior render emitted a mangled regex because `$` in the replacement
  string was interpreted by `String.prototype.replace` as a backreference
  token (`$&`, `$1`, `` $` ``, `$'`).
- **Telemetry consent record's `plugin_version` follows `init.ts`
  (`2b1a60a`)** — `DEFAULT_PLUGIN_VERSION` in `src/state/consent.ts` is
  no longer a hardcoded `'0.4.0'` string. It now imports
  `PLUGIN_VERSION` from `src/state/init.ts` (the canonical source that
  `version.json` reads). Fresh installs write `plugin_version = "1.0.1"`
  in BOTH `version.json` and `config.json#telemetry`. Forward-only —
  existing installs that wrote a stale `"0.4.0"` consent record keep it
  (the re-prompt trigger is "missing `recorded_at`", not stale version).
- **Apply-gate trailing-newline preservation (BUG-V1.0-A)** —
  `parseStage2Response` strips trailing whitespace from LLM output
  (including the terminating `\n`). The previous `checkApplies`
  implementation then wrote that trimmed text verbatim to a tmp file
  and ran `git apply --check`, which rejected the patch with "corrupt
  patch at line N". `src/validation/apply.ts` now re-appends `\n`
  before writing. Without this, every Stage 2 unified diff was
  silently escalated to manual review.
- **`isFrontmatterOnlyDiff` ignores unified-diff file headers
  (BUG-V1.0-B)** — the previous implementation treated the very first
  `--- a/path/to/file` line as a YAML frontmatter delimiter (because
  `'--- a/...'.startsWith('---')` is true), classifying every markdown
  patch as `frontmatter`. Per DD-131, frontmatter patches always defer
  to user confirmation — so the trust ladder was structurally dead at
  v1.0.0 (no patch could ever cross the auto-apply threshold).
  `src/validation/sanity.ts` now skips diff metadata lines and only
  treats a bare `---` *content* line as a frontmatter delimiter.
- **Live-vs-mock transport gates widened to detect subscription auth
  (Fix 10)** — pre-fix, `pickAuthorTransport` (`stop.ts`,
  `sessionEnd.ts`) and `pickPlannerTransport` (`authorPlanner.ts`)
  defaulted to the LIVE transport only if `ANTHROPIC_API_KEY` was set.
  Combined with Fix 9, subscription users would silently get the
  mock author/planner pipelines despite their auth being usable.
  Now centralized in `src/llm/authDetect.ts#detectLiveAuthAvailable()`,
  which returns true if either env var is set OR the `claude` CLI is
  on PATH (memoized probe). Explicit `COHERENCE_AUTHOR_LIVE=1` /
  `COHERENCE_AUTHOR_MOCK=1` overrides still short-circuit detection.
- **LLM transport switched to Claude Agent SDK (Fix 9 / Path C)** —
  `src/llm/client.ts` no longer imports `@anthropic-ai/sdk` (the raw
  HTTP SDK that required `ANTHROPIC_API_KEY`). It now uses
  `@anthropic-ai/claude-agent-sdk`'s `query()` function, which
  automatically uses Claude Code's authenticated session when the
  `claude` CLI is set up. For paid-subscription users this means
  zero env-var setup; for CI / standalone scripts it transparently
  falls back to whatever auth Claude CLI is configured with.
  Cassette format is unchanged — historical recordings still replay
  cleanly. `total_cost_usd` is now reported by the SDK directly,
  removing coherence's per-million pricing constants. **`temperature`
  is no longer settable on Stage 1/2 calls** (the agent SDK doesn't
  expose it); this is a known semantic shift — determinism in tests
  comes from cassette replay, and in production from the trust ladder.
- **`anchorScanner` retains opening fence line (BUG-V1.0-D / Fix 7)** —
  the v1.0.0 anchor scanner toggled into fence-tracking mode without
  pushing the opening ``` line to the section's content. Closing
  fence was retained, opening lost. `has_example` consequently failed
  on every anchored section with a code block; LLM Stage 2 saw
  malformed `current_content`. Fixed in
  `src/detection/anchorScanner.ts:53-56`.
- **`symbol_exported` assertion engine (Fix 8 — LIM-1 closure)** —
  new opt-in `symbol_exported:<name>:<lang>` engine that returns true
  only when the symbol appears in an actual `export ...` declaration,
  not just anywhere in the corpus. Catches the rename-with-stale-
  callers drift class (`gradeBelow` → `isBelowThreshold` is the
  canonical example). Other languages return `ignored:
  'unsupported_lang'`. Residual limitation: broken re-exports
  (`export { X } from './mod.js'` when `./mod.js` no longer exports
  `X`) still pass — transitive resolution is v1.1 scope.
- **`.gitignore` patch broadened to directory level (`1ca029a`,
  NFR-PRIVACY-N5)** — `firstRun.ts` now seeds `.claude/coherence/` as a
  single directory-level line into a consumer repo's `.gitignore`,
  replacing the previous narrow two-file list (`signal-cache.json` +
  `session-map.json`). Closes a per-developer-state leak: every other
  file under `.claude/coherence/` — `trust-ledger.json`,
  `state-snapshot.json`, `cost-ledger.json`, `metrics.jsonl`,
  `coherence-log.md`, `scan-cache/state.json`, `proposal-cache.json`,
  `host-capabilities.json`, `drift-buffer.json`, `section-index.json`,
  `section-symbol-index.json`, `version.json`, `config.json`,
  `observations.md`, `stop-progress.json`, `velocity.json`,
  `graduation.json`, `quarantine/` — would commit on `git add .claude/`.

## Architectural commitments (unchanged from v1.0.0)

- **DD-117 — No backend, ever.** File-only plugin in perpetuity.
- **DD-118 — No cross-major migration.** v1.0.0 → v1.0.1 is patch
  (in-place); no migrator required.
- **DD-131 — Destructive + frontmatter patches always defer to
  confirmation** regardless of trust score.
- **DD-065 — Net-new artifacts always quarantine first**; only
  `proposeAccept` writes outside `.claude/coherence/`.
- **NFR-PRIVACY-N5 — All per-developer state under `.claude/coherence/`
  is gitignored at directory level** (codified by Fix 3).

## Fixes — detail with test coverage

### Fix 1 — README cosign verification regex render bug (`cb52271`)

`scripts/render-readme-verification.mjs` regenerates the README
`## Verification` block from `package.json#repository.url` on every
`npm run build`. The block embeds the cosign identity regex
`'^https://github.com/{owner}/{repo}/\.github/workflows/release\.yml@refs/tags/v.*$'`
— the trailing `$'` is the regex end-of-string anchor plus the closing
quote.

When the block was inlined via `readme.replace(re, replacement)`, the
`$` in the replacement string was interpreted as a `String.replace`
backreference token (`$&`, `$1`, `` $` ``, `$'`), mangling the rendered
regex across a line break.

**Source fix.** `scripts/render-readme-verification.mjs` — replaced the
string-form replacement with a function form
(`readme.replace(re, () => replacement)`). A function replacer never
invokes `$`-token expansion. The script was also refactored to export
`renderVerification(readmeText, pkg)` and `buildVerificationBlock(pkg)`
as pure functions so the render path is directly unit-testable; the
CLI entry point still performs the same disk I/O.

**Test coverage.**
- ✅ `tests/unit/scripts/render-readme-verification.test.ts` — 7
  regression tests, including the headline assertion that the literal
  `tags/v.*$'` anchor renders verbatim and that no `$&`/`$1`
  backreference tokens leak into the output. Also covers SSH-form
  repository URLs, missing-repo no-op, package/repo name divergence,
  and append-vs-replace idempotency.

### Fix 2 — Consent telemetry `plugin_version` aligned with init source-of-truth (`2b1a60a`)

`src/state/consent.ts` previously hardcoded
`DEFAULT_PLUGIN_VERSION = '0.4.0'`. This constant was missed by the
v1.0 version-sync work because `scripts/release-ga.mjs` only checks the
three top-level version sources (`package.json`,
`.claude-plugin/plugin.json`, `src/state/init.ts#PLUGIN_VERSION`), not
embedded constants in arbitrary source files.

Effect on a fresh v1.0.0 install: inconsistent state inside the same
`.claude/coherence/` directory:

```
.claude/coherence/version.json#plugin_version          = "1.0.0"   ✓
.claude/coherence/config.json#telemetry.plugin_version = "0.4.0"   ✗
```

**Source fix.** `src/state/init.ts:12` already exports
`PLUGIN_VERSION = '1.0.0'`. `src/state/consent.ts:24` now imports it
as `INIT_PLUGIN_VERSION`; line 65 sets
`DEFAULT_PLUGIN_VERSION = INIT_PLUGIN_VERSION`. Consent becomes
automatically reactive to future version bumps via the same single
source-of-truth.

Forward-only: existing installs that already wrote a stale `"0.4.0"`
consent record keep it because the re-prompt trigger is "missing
`recorded_at`" — a stale `plugin_version` does not re-prompt (avoids
annoying users on every minor bump). Users who want to refresh:
`/coherence:consent --reset`.

**Test coverage.**
- ✅ `tests/integration/first-run-consent.test.ts` — two new regression
  tests after a `runFreshInstall`: one asserts
  `consent.plugin_version === version.json#plugin_version`; the other
  asserts `consent.plugin_version === PLUGIN_VERSION` (the canonical
  export from `src/state/init.ts`). Either drift between the consent
  record and the canonical version source is now a hard test failure.
- v1.0.1 M1 will additionally introduce a structural guard: the
  `assertVersionSync` source-scanner extension in
  `scripts/release-ga.mjs` scans `src/**/*.ts` for embedded version
  constants matching `/['"]\d+\.\d+\.\d+['"]/` in identifier contexts
  containing `version` — catches the entire bug class at release time,
  not just the specific call site.

### Fix 3 — `.gitignore` patch broadened to directory level (`1ca029a`, NFR-PRIVACY-N5)

`src/state/firstRun.ts` writes a `.gitignore` patch into a consumer
repo at first install. The v1.0.0 patch listed only:

```
.claude/coherence/signal-cache.json
.claude/coherence/session-map.json
```

But `.claude/coherence/` contains many other per-developer files:
`trust-ledger.json`, `state-snapshot.json`, `cost-ledger.json`,
`metrics.jsonl`, `coherence-log.md`, `scan-cache/state.json`,
`proposal-cache.json`, `host-capabilities.json`, `drift-buffer.json`,
`section-index.json`, `section-symbol-index.json`, `version.json`,
`config.json`, `observations.md`, `stop-progress.json`,
`velocity.json`, `graduation.json`, `quarantine/`.

All of these are per-developer (NFR-PRIVACY-N5 / DD-117 — the committed
team-state tier is exclusively the user-owned `coherence/` root, never
`.claude/coherence/`). With the narrow patch, every file EXCEPT the
two listed would commit on `git add .claude/`.

**Source fix.** `src/state/firstRun.ts:42` — replace the two-file list
with a single directory-level line:

```ts
const PER_DEV_GITIGNORE_LINES = ['.claude/coherence/'];
```

Matches the plugin's own repo `.gitignore` (which has always ignored
the directory wholesale). The patch remains idempotent. Header comment
updated to `# Coherence plugin (npm: cohrence) — per-developer state`
for DD-093 brand/package legibility.

**Test coverage.**

- ✅ `tests/integration/first-run-consent.test.ts:108-116` — asserts
  `.claude/coherence/` is present in the patched `.gitignore` AND the
  old narrow single-file lines are NOT.
- ✅ `tests/integration/first-run-consent.test.ts:89-106` — BOM
  idempotency: re-running against an already-patched repo writes
  exactly one directory-level line.
- ✅ `tests/static-analysis/no-cross-dev-leak.test.ts:74-85` — M-PRIVACY-1
  ship gate asserts `src/state/firstRun.ts` source contains the literal
  `'.claude/coherence/'` ignore line and the new header comment.

### Fix 4 — Apply-gate trailing-newline preservation (BUG-V1.0-A)

**Discovered.** During the mcp-sentry LLM-layer smoke test
([scripts/smoke-mcp-sentry-llm.mjs](scripts/smoke-mcp-sentry-llm.mjs))
— every Stage 2 unified diff failed the apply gate with
`error: corrupt patch at line N` even though the same diffs applied
cleanly when invoked manually with `git apply`.

**Root cause.** Stage 2's response parser (`parseStage2Response` in
`src/validation/format.ts`) calls `raw.trim()` to normalise the LLM
output. `trim()` strips the trailing `\n` that terminates the diff's
last line. The trimmed text is stored in `parsed.raw` and handed to
`checkApplies(diffRaw, ...)`, which wrote it verbatim. `git apply`
requires a newline-terminated final line.

**Impact.** Every Stage 2 unified diff that's not trivially
applicable (i.e., every diff with a final hunk that requires
context) was rejected. Coherence's main happy path — produce a
patch, validate it, auto-apply or queue for review — was broken
end-to-end in v1.0.0.

**Source fix.** [src/validation/apply.ts:20](src/validation/apply.ts#L20)
re-appends `\n` at the gate boundary:

```ts
const patchBody = diffRaw.endsWith('\n') ? diffRaw : diffRaw + '\n';
writeFileSync(tmpPath, patchBody, 'utf8');
```

The fix is at the boundary that consumes the bytes (rather than in
`parseStage2Response.trim()`) because the trim() is load-bearing for
the sentinel comparisons (`NO_PATCH_NEEDED`, `ESCALATE`,
`PLAN_DISAGREES`).

**Test coverage.**
- ✅ [tests/unit/validation/apply.test.ts](tests/unit/validation/apply.test.ts)
  — 4 tests: accepts a diff with trailing newline (baseline), accepts
  a diff after `trim()` strips it (the BUG-A repro path), still
  rejects genuinely malformed diffs (proves the gate isn't a no-op),
  and tolerates CRLF inputs without crashing.

### Fix 5 — `isFrontmatterOnlyDiff` ignores unified-diff metadata (BUG-V1.0-B)

**Discovered.** Once Fix 4 unblocked the apply gate, the mcp-sentry
smoke surfaced that every modifying patch was classified as
`changeClass = frontmatter`, forcing all of them into manual review.
A markdown body-text rename should be `modifying`.

**Root cause.** `isFrontmatterOnlyDiff` in `src/validation/sanity.ts`
walked the diff line-by-line looking for `line.startsWith('---')` as
a frontmatter delimiter. But the very first line of every unified
diff is `--- a/path/to/file` — and `'--- a/...'.startsWith('---')`
is `true`. The function entered "frontmatter mode" immediately and
returned `true` for any markdown patch.

**Impact.** Per DD-131, `frontmatter` patches always defer to user
confirmation regardless of trust score. The auto-apply gate in
`runStopOrchestrator` only fires for `changeClass === 'modifying'`,
so:
- No patch could ever auto-apply.
- The synthetic `accept` events that auto-applied patches were
  supposed to emit into the trust ledger never fired.
- The bundle summary mislabelled every markdown patch as a
  frontmatter change.

The v1.0 trust ladder was structurally dead at v1.0.0.

**Source fix.** [src/validation/sanity.ts:72-122](src/validation/sanity.ts#L72-L122)
rewrites the detector to:
1. Skip unified-diff metadata lines (`--- a/…`, `+++ b/…`, `@@ …`,
   `diff --git`, `index …`, `new file`, `deleted file`,
   `similarity index`, `rename from`, `rename to`).
2. Only treat a *content* line — i.e. after the `+`/`-`/space patch
   prefix is stripped — whose remaining content is exactly `---` as
   a frontmatter delimiter.
3. Return `true` only when frontmatter delimiters were encountered
   AND at least one change exists.

Alternative considered: re-architect to consume `parse-diff`'s
structured output (`file.chunks.changes`) and pass `files` to the
detector instead of `diffRaw`. Cleaner, but requires updating the
call site in `stage2.ts` and the public signature. Deferred to a
follow-up refactor; the surgical fix is sufficient for v1.0.1.

**Test coverage.**
- ✅ [tests/unit/validation/sanity.test.ts](tests/unit/validation/sanity.test.ts)
  — 8 new tests covering vanilla body edits (the bug repro path),
  additive edits, changes strictly inside the frontmatter, changes
  that cross out of frontmatter into body, diffs that add a fresh
  frontmatter block + body content, pure-metadata diffs with no
  changes, git-extended-format metadata before file headers
  (`diff --git`, `index …`), and renamed-file diffs.

**End-to-end validation.** The mcp-sentry LLM-layer smoke (Stage 1 +
Stage 2 cassette replay against the
[mcp-sentry `test/coherence-v1-smoke`](https://github.com/HUMBLEF0OL/mcp-sentry/tree/test/coherence-v1-smoke)
fixture) now reports `changeClass = modifying`, `validationPassed = true`,
and the bundle correctly contains the applicable patches — the trust
ladder evaluates scores against the 0.85 auto-apply threshold (fresh
sections at 0.000 correctly defer to review).

## Known limitations (v1.0.1 — document don't fix)

### LIM-1 — *closed in v1.0.1 via Fix 8 (`symbol_exported` engine)*

Pre-v1.0.1, the hallucination layer was corpus-grep based: a symbol
was "known" if any project source file contained its literal text.
Renaming a function (e.g. mcp-sentry's `gradeBelow` →
`isBelowThreshold`) while leaving stale callers / tests text-mentioning
the old name produced a TS2305 build break but no coherence signal.

Fix 8 introduces a new opt-in assertion engine `symbol_exported` that
returns `passed: true` only when the symbol appears in an actual
`export ...` declaration. Docs maintainers opt in via frontmatter:

```yaml
asserts:
  - type: symbol_exported
    param: gradeBelow:typescript
    policy: block
```

The realistic stale-caller rename drift is now caught. **Residual
limitation:** broken re-exports (`export { X } from './mod.js'` where
`./mod.js` no longer exports `X`) are still trusted at face value —
transitive re-export resolution is v1.1 scope.

### LIM-2 — `/coherence:audit --deep` requires a populated section-index.json

`loadOrBuildIndex` in `src/audit/sectionSymbolIndex.ts` reads section
entries from `.claude/coherence/section-index.json`. That file is
populated by PostToolUse hooks during a live Claude Code session, so
the audit subsystem cannot be exercised standalone via a Node-script
harness. Live-session testing remains the only path. The deterministic
smoke harness ([scripts/smoke-mcp-sentry.mjs](scripts/smoke-mcp-sentry.mjs))
correctly works around this by walking the project directly with
`anchorScanner`.

### Fix 7 — `anchorScanner` retains the opening fence line (BUG-V1.0-D)

**Discovered.** During the dummy-project LLM smoke. The SKILL.md
`#basics` section reproducibly reported `assertions: warn —
has_example: ... has no code example` despite carrying an obvious
```` ```ts ```` code block.

**Root cause.** [src/detection/anchorScanner.ts](src/detection/anchorScanner.ts)
detects fence lines so subsequent heading/anchor parsing inside fences
is skipped, but the opening fence line itself was dropped from
`section.content` (the function `continue`d after toggling fence
mode). The closing fence was retained but the opening was lost.
`FENCED_CODE_RE = /\`\`\`[\s\S]*?\`\`\`/` requires both fences, so
`has_example` failed; worse, the LLM Stage 2 received `current_content`
that was missing the opening fence, which could induce hallucinated
diffs whose context lines don't match disk.

**Source fix.** [src/detection/anchorScanner.ts:53-56](src/detection/anchorScanner.ts#L53-L56)
now pushes the opening fence line to the active stack frame before
continuing.

**Test coverage.**
- ✅ [tests/unit/detection/anchorScanner.test.ts](tests/unit/detection/anchorScanner.test.ts)
  — 3 new regression tests: single fence with language tag, multiple
  code blocks, tilde fences.

### Fix 8 — `symbol_exported` assertion engine (LIM-1 closure)

**Why.** The existing `symbol_exists` engine does corpus-grep —
returns `true` if any source file textually contains the symbol.
Renaming a function while leaving stale callers / tests / docs
text-mentioning the old name silently slipped through. The
mcp-sentry fixture (`gradeBelow` → `isBelowThreshold`) is the
canonical example.

**New engine.** [src/validation/assertions/exportedSymbol.ts](src/validation/assertions/exportedSymbol.ts)
introduces `symbol_exported:<name>[:<lang>]`. Parameter shape mirrors
`symbol_exists`. The engine scans `.ts`/`.tsx` (and JS variants) for
actual `export ...` declarations and returns `passed: true` only when
the symbol appears in one. Stale imports, test references, and
documentation mentions no longer count.

**Patterns covered (TypeScript / JavaScript).** `export
function|const|let|var|class|interface|type|enum NAME`, `export
default (function|class) NAME` (when named), `export { A, B as C, D }
[from '...']` including type-only forms and aliased exports.

**Opt-in usage.**
```yaml
asserts:
  - type: symbol_exported
    param: gradeBelow:typescript
    policy: block
```

When the rename drift lands, the section blocks until the docs are
updated to reference the new name.

**Residual limitation (documented, deferred to v1.1).** Re-exports
of the form `export { X } from './mod.js'` are trusted at face value
even when `./mod.js` no longer exports `X`. Transitive resolution
would catch this but requires module-graph traversal with cycle
detection. The unit suite pins the current behaviour with a
"v1.0.1 known limitation" test so v1.1 changes are deliberate.

**Other languages.** Python, Go, Rust, Java return `passed: true`
with `ignored: 'unsupported_lang'` — non-blocking signal that the
engine declined to evaluate. v1.1+ adds language-specific
declaration grammars.

**Test coverage.**
- ✅ [tests/unit/validation/exportedSymbol.test.ts](tests/unit/validation/exportedSymbol.test.ts)
  — 28 tests covering the full TS export grammar
  (`extractExportedSymbols` against 17 grammar variants), the engine
  end-to-end against a tmp project tree (8 cases including the
  unsupported-lang and `.d.ts` skip paths), the residual re-export
  limitation (pinned), and the mcp-sentry LIM-1 fixture replayed in
  miniature.
- ✅ End-to-end on the dummy project: with the drift-fixture stale-
  caller pattern (`src/index.ts` imports `multiply` but `calc.ts`
  exports `times`), the engine correctly reports
  `verdict.ok = false` with the diagnostic message hinting at the
  `symbol_exists` distinction.

### Fix 10 — Transport gates honor subscription auth (Path C completeness audit)

**Discovered.** Auditing the Path C migration end-to-end revealed that
three call sites still gated live-vs-mock transport selection on
`ANTHROPIC_API_KEY` alone:
- `src/hooks/stop.ts#pickAuthorTransport`
- `src/hooks/sessionEnd.ts#pickAuthorTransport`
- `src/llm/authorPlanner.ts#pickPlannerTransport`

With Fix 9 in place, the LLM transport itself accepts subscription
auth, but these picker gates would still default to mock for users
without an API key. The author/planner pipelines would silently run
in mock mode for the very subscription users Fix 9 was designed to
support.

**Source fix.** New module
[src/llm/authDetect.ts](src/llm/authDetect.ts) exports
`detectLiveAuthAvailable(env?, cliProbe?)`. It returns true when:
- `ANTHROPIC_API_KEY` is set in the environment (fast path; no CLI
  probe), OR
- the `claude` CLI is on PATH (memoized `claude --version` probe;
  paid for once per process).

The CLI-probe dependency is injectable so unit tests don't depend
on the developer's machine having `claude` installed. The function
defaults to `process.env` and the real probe; both can be overridden.

All three picker call sites now consume `detectLiveAuthAvailable()`
inside their gate; explicit `COHERENCE_AUTHOR_LIVE=1` /
`COHERENCE_AUTHOR_MOCK=1` overrides still take precedence.

**Other call-site updates surfaced by the same audit:**
- `docs/privacy.md` — replaced the API-key-only section with a
  two-path "Authentication" section that documents subscription
  auth as the default, API-key auth as the override.
- `scripts/release-candidate-cost-burn.mjs` — now invokes
  `detectLiveAuthAvailable` instead of requiring `ANTHROPIC_API_KEY`,
  with a clearer error message pointing users at either auth source.
- `tests/ship/tarball-shape.test.ts` — comment "schemas loaded by
  Anthropic SDK / AJV path" reduced to "loaded by AJV" (the SDK is
  no longer involved in schema validation).

**Test coverage.**
- ✅ [tests/unit/llm/authDetect.test.ts](tests/unit/llm/authDetect.test.ts)
  — 15 unit tests covering API-key short-circuit, CLI-probe path,
  precedence ordering, defensive defaults, and the picker logic the
  three call sites implement.
- ✅ [tests/unit/hooks/pickAuthorTransport.test.ts](tests/unit/hooks/pickAuthorTransport.test.ts)
  — rewritten to use `detectLiveAuthAvailable` with an injected probe.
  9 tests covering all selection branches.

**End-to-end verification (audit findings summary).**
| Audit | Result |
|---|---|
| A — zero direct `@anthropic-ai/sdk` imports outside the comment docstring | ✅ Clean (transitive dep via agent-sdk is expected) |
| B — `ANTHROPIC_API_KEY` references in src/ | ⚠️ Found 3 stale gates → fixed in Fix 10 |
| C — every `llmCall` caller unchanged | ✅ 5 callers; API surface preserved |
| D — cassette format byte-identical | ✅ 1090 tests pass without re-recording any cassette |
| E — error / no-auth diagnostics | ✅ New transport throws with subtype + errors detail |
| F — tarball composition | ✅ 334.5 kB / 682 files; agent SDK shipped as runtime dep |
| G — docs / release-notes references | ⚠️ `docs/privacy.md` stale → updated; `tarball-shape.test.ts` comment stale → updated |
| H — full vitest + gates + tsc | ✅ 1105 / 1105, 32 / 32, clean |

### Fix 9 — LLM transport via Claude Agent SDK (Path C / subscription auth)

**Why.** The v1.0.0 client used `@anthropic-ai/sdk` with `new Anthropic()`,
which reads `ANTHROPIC_API_KEY` from `process.env` and throws if absent.
Users with a Claude.ai paid subscription had to provision a separate
Anthropic API key just to use coherence — duplicating billing and
adding a friction step the official Claude Code workflow doesn't have.

**What changed.**
[src/llm/client.ts](src/llm/client.ts) now imports `query` from
`@anthropic-ai/claude-agent-sdk`. The agent SDK invokes the
`claude` CLI under the hood and uses whatever auth that CLI is
configured with — for subscription users that's their existing
Claude Code session; for API-key users `ANTHROPIC_API_KEY` still
works exactly as before. No env var is required for the common path.

**Architecture.** Coherence's Stage 1/2 are single-shot prompts. The
agent SDK is conversational, so the new `runAgentQuery` helper
configures:
- `maxTurns: 1` — single response, no agent loop.
- `allowedTools: []` — text-only; no shell / file edits.
- `settingSources: []` — isolate from host CLAUDE.md / settings.
- `systemPrompt` — the same stage1/stage2 prompts that were used
  before.

The SDK's terminal `SDKResultSuccess` message carries:
- `result` (string) — assistant's full text, ready for `parseStage2Response`.
- `usage` — input/output tokens.
- `total_cost_usd` — billed cost (subscription users see this as $0,
  which is the intended outcome).

**Cassette compatibility.** Cassettes record `{ content, input_tokens,
output_tokens, cost_usd, timestamp }`. The new transport produces
the same shape, so every cassette recorded against the old SDK
replays cleanly through the new one. The 1090-test suite passed
unchanged after the migration without re-recording any cassette.

**Semantic shifts to be aware of.**
- **`temperature` is no longer settable.** The agent SDK doesn't
  expose it. v1.0.0 set `temperature` from the manifest (typically
  low for determinism). Determinism in tests is preserved by
  cassette replay; in production it's preserved by the trust
  ladder converging on accepted patches. This was never the
  binding constraint.
- **`cost_usd` reporting source changed.** v1.0.0 derived cost from
  `input_tokens * INPUT_COST_PER_M + output_tokens * OUTPUT_COST_PER_M`
  (constants for Sonnet 4.5 pricing). v1.0.1 reads `total_cost_usd`
  from the SDK directly — accurate and version-tracking, but
  subscription users will see $0 rather than a synthetic cost.
- **Streaming.** The SDK yields multiple message types; coherence
  collects only the terminal `result` message. No partial-message
  caching today.

**Dependencies.**
- Added: `@anthropic-ai/claude-agent-sdk ^0.2.140`.
- Removed: `@anthropic-ai/sdk` (no longer imported anywhere in src/).

**Test coverage.** 1090 existing tests pass unchanged — proving the
cassette path remains identical. The transport-level integration is
not directly tested in unit suites (live LLM calls aren't run in CI);
end-to-end verification is via the dummy + mcp-sentry LLM smoke
harnesses which exercise the cassette replay path that the new
transport uses for non-recording calls.

**Live recording path (now unblocked).** Recording real Stage 1+2
cassettes against mcp-sentry no longer requires `ANTHROPIC_API_KEY`:

```bash
# 1. Make sure your Claude Code session is authenticated.
claude  # one-time login if not already done

# 2. Force re-recording at the cassette layer.
export COHERENCE_REFRESH_CASSETTES=1
export COHERENCE_CASSETTES_DIR=tests/cassettes

# 3. Drive the pipeline against any fixture.
node scripts/smoke-mcp-sentry-llm.mjs
```

## State file additions

None. v1.0.1 is source-only; no state-schema changes. Existing
`.claude/coherence/` survives the upgrade untouched (DD-118 carry).

## What's in the tarball

`dist/`, `.claude-plugin/plugin.json`, `prompts/v2/`, `prompts/v3/`.
Schemas in `dist/state/schemas/`. `commands/` excluded (build artifact).
Same layout as v1.0.0.

## Acceptance

- **Tests:** all suites passing across unit / integration / e2e /
  security / perf / preconditions / rollback / schema / cost /
  static-analysis / ship / fixtures — includes the following v1.0.1
  regression tests:
  - 7 cosign-render unit (Fix 1)
  - 2 consent-plugin_version integration (Fix 2)
  - .gitignore directory-level coverage carried from v1.0.0 (Fix 3)
  - 4 apply-gate trailing-newline unit (Fix 4)
  - 8 frontmatter-detection unit (Fix 5)
  - M1 version-scanner unit suite + status.ts canonical-fallback (Fix 6)
  - 3 anchorScanner opening-fence regression tests (Fix 7)
  - 28 symbol_exported / extractExportedSymbols + LIM-1 fixture (Fix 8)
  - 28 validateAuthorPayload security boundary
  - 15 runAssertionsForSection router + cap + warn-cache
  - 15 detectLiveAuthAvailable + picker-logic + interaction (Fix 10)
  - 9 pickAuthorTransport (rewritten for Fix 10 gate)
- **TypeScript:** clean (`tsc --noEmit`).
- **Gates:** `npm run gates` green — M-ARCH-1, M-PRIVACY-1, M-LEGACY-1,
  M-TRIPLEX-1, plus v1.0 M-LEDGER-*, M-TRUST-*, M-ASSERTS-*,
  M-METRICS-*, M-AUDIT-*, M-SIGN-*, M-REPAIR-*.
- **Validate:** `npm run validate-plugin` exit 0.

## Install

```bash
claude plugin install cohrence   # Anthropic plugin registry
```

Local development / direct path:

```bash
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
```

See `README.md ## Install` for the three documented paths (marketplace,
local-path `settings.local.json`, global
`~/.claude/settings.json`). v1.0.1 M3 expands these into per-user vs
per-project install guidance.

## Upgrade from v1.0.0

In-place patch — no migration required:

```bash
claude plugin update cohrence
```

Existing `.claude/coherence/` is preserved (DD-118 carry). Users whose
v1.0.0 install wrote `plugin_version: "0.4.0"` into
`config.json#telemetry` (Fix 2) keep that record; refresh with
`/coherence:consent --reset` if a clean v1.0.1-stamped consent record
is desired.

## Verification

```bash
cosign verify-blob cohrence-1.0.1.tgz \
  --signature cohrence-1.0.1.tgz.sig \
  --certificate cohrence-1.0.1.tgz.pem \
  --certificate-identity-regexp '^https://github.com/HUMBLEF0OL/coherence/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

A successful verification prints `Verified OK`. The certificate's Rekor
transparency-log entry is searchable at <https://search.sigstore.dev/>.
Gate names asserted at release time: `M-SIGN-1`, `M-SIGN-2`, `M-SIGN-3`.

## Acknowledgements

Plan: Notion canonical at [v1.0.1](https://www.notion.so/v1-0-1-35f010d46a7081ac9d02e7cc4db48f22).
Specs unchanged: BRD v1.0 · TS-1..TS-8 v1.0 · DD-131..DD-147.

## What's next (v1.0.1 follow-up)

- **M1 — Release-pipeline hardening.** Extend `assertVersionSync` to
  scan `src/**/*.ts` for embedded version literals (structural guard
  for Fix 2's bug class). Add concurrency-test template for
  `proposal-cache.json`, `signal-cache.json`, `scope-cache.json`
  matching the trust-ledger pattern. Bump
  `.github/workflows/release.yml` to `actions/checkout@v5` +
  `actions/setup-node@v5` ahead of the Node 20 runner deprecation
  (2026-06-02). Add downstream-smoke step to `scripts/release-ga.mjs`.
- **M2 — E2E cassette fixture.** Record Stage 1 + Stage 2 +
  `/coherence:audit --deep` cassettes against the
  [mcp-sentry `test/coherence-v1-smoke` branch](https://github.com/HUMBLEF0OL/mcp-sentry/tree/test/coherence-v1-smoke)
  (pinned at commit `9097294` — `gradeBelow` renamed to
  `isBelowThreshold`). Add
  `tests/e2e/mcp-sentry-fixture.test.ts` that seeds the buffer,
  invokes `runStopOrchestrator`, and asserts patches against the real
  drift.
- **M3 — Install documentation + marketplace listing.** Rewrite
  `README.md ## Install` with three documented paths. Submit `cohrence`
  to the Anthropic plugin marketplace (M-LISTING-1).
