# Coherence

A Claude Code plugin that detects and repairs documentation drift —
when code changes without updating the docs that describe them. Runs
as a set of Claude Code hooks and slash commands using a two-stage
LLM pipeline to plan and apply fixes, with a per-section trust ladder
gating auto-apply, `asserts:` frontmatter validation, and Sigstore
cosign signed releases.

## Before exploring source files

A pre-built knowledge graph lives in `graphify-out/`. **Read it before
touching source files** — it tells you what connects to what without
reading 100+ TypeScript files.

```
graphify-out/GRAPH_REPORT.md   # start here: god nodes, communities, surprising connections
graphify-out/graph.json        # machine-readable graph for programmatic queries
```

To query the graph for a specific topic:

```
/graphify query "how does the validation pipeline work"
/graphify query "where does hallucination detection happen"
/graphify path "runStopOrchestrator" "applyPatch"
/graphify explain "processSection"
```

Run `/graphify --update` after changing files to keep the graph current.

For a teaching-oriented diagram (Mermaid + narrative), see
[docs/architecture.md](docs/architecture.md). The summary below is the
orientation; the full diagram lives there. Operator-grade
state-corruption catalog: [docs/failure-modes.md](docs/failure-modes.md).
Extension tutorials (asserts engines, language registries, hook
handlers): [docs/extensions/](docs/extensions/).

## Architecture

```
src/hooks/                    Entry points — Claude Code fires these on events
src/pipeline/                 Two-stage LLM pipeline (stop orchestrator → stage1 → stage2 → merge)
src/detection/                Anchor scanning, section index, file discovery, compaction detection
src/validation/               Hallucination, plan validation, sanity, language registries
src/validation/assertions/    asserts: pipeline — 7 engines + policy dispatcher
src/audit/                    Token budget classifier, lazy symbol-index cache, --deep LLM pass
src/state/                    State store, schemas, locks, sentinels, trust ledger, team aggregate
src/llm/                      LLM client, cassette (record/replay), cost ledger
src/git/                      Git adapter, coherence commits
src/commands/                 All slash commands (status, review, repair, recover, doctor,
                              graduate, trust, metrics, audit, consent, propose-*, plan-*, etc.)
src/subagent/                 Subagent tracking, stats, window, retro-reclassification
src/proposals/                DD-065 quarantine + store + expiry sweep + auto-accept sweep
src/buffer/                   Content hash, lifecycle, velocity (revert detection)
src/permissions/              Permission gate, review assembly
src/scanner/                  DD-066 trickle deep-scan
src/proposers/                DD-069 annotate proposer
src/signal/                   DD-068 telemetry + bash/file/agent signal detectors
src/modes/                    DD-074 mode resolver
prompts/v2/                   Stage1 / Stage2 / author / annotate prompts
prompts/v3/                   audit-consistency.md for /coherence:audit --deep
```

## Core abstractions (god nodes — touch these carefully)

| Symbol | File | Role |
|--------|------|------|
| `runStopOrchestrator()` | `src/pipeline/stop.ts` | Central coordinator. Also gates auto-apply on `getSectionScore()` for `modifying` patches and emits synthetic accept events for auto-applied patches. |
| `processSection()` | `src/pipeline/stage1.ts` | Per-section planner call. |
| `nowIsoUtc()` | `src/util/time.ts` | Timestamps everything; appears in many communities. |
| `withExceptionGuard()` | `src/hooks/exceptionGuard.ts` | Wraps all hook handlers. |
| `getCoherenceDir()` | `src/state/init.ts` | All state paths derive from this. |
| `parse()` | `src/llm/cassette.ts` | LLM cassette parsing; bridges hooks, validation, git, recovery. |
| `assembleBundle()` | `src/pipeline/bundle.ts` | Packages sections for review. |
| `selectCanonical()` | `src/pipeline/canonical.ts` | Picks which section to treat as canonical when duplicates exist. |
| `recordEvent()` | `src/state/trustLedger.ts` | Records accept/edit/revert against a sectionRef; serialised by in-process `withLedgerLock`. |
| `getSectionScore()` | `src/state/trustLedger.ts` | DD-138 score lookup with lazy stale-recompute; called by the stop pipeline auto-apply gate. |
| `applyAssertions()` | `src/validation/assertions/applyToPatch.ts` | Reads file frontmatter `asserts:` and routes each entry to the registry; called from `stage2.ts` after hallucination. |
| `runAutoAcceptSweep()` | `src/proposals/autoAcceptSweep.ts` | FR-TRUST-3 net-new auto-accept; SessionStart-only. |
| `handleDeepAudit()` | `src/audit/deepConsistency.ts` | Two-step flag-based cost gate for the LLM cross-section consistency pass. |

## Key design decisions

- **Two-stage pipeline.** Stage 1 (planner) produces a structured
  plan; Stage 2 (patch writer) applies it. Never collapse them into
  one call.
- **Cassette system** (`src/llm/cassette.ts`). All LLM calls can be
  recorded and replayed in tests. Don't bypass it.
- **Hallucination corpus** (`src/validation/hallucination.ts`).
  Checks that symbols referenced in patches actually exist in the
  codebase. Language registries live in `src/validation/registries/`.
- **Degraded mode** (`src/hooks/degradedMode.ts`). When exceptions
  exceed threshold, coherence silently backs off rather than blocking
  the session. Check `isDegraded()` before adding new hook logic.
- **State files** (`src/state/`). All state is written atomically.
  Quarantine (`src/state/quarantine.ts`) holds corrupt files.
  Sentinels (`src/state/sentinels.ts`) are kill-switches.
- **Trust gate.** Modifying patches auto-apply only when the section
  score ≥ 0.85 (DD-131). Destructive + frontmatter always defer to
  confirmation.
- **No backend, ever (DD-117).** File-only architecture. Cross-team
  plans live as committed JSON under `coherence/plans/`. Telemetry is
  local JSONL + user-driven `curl` only.
- **No legacy version support (DD-118).** Each major version stands
  alone. No cross-major migrator chain.

## Data flow for a Stop-pipeline run

1. Hook fires → `src/hooks/postToolUse.ts` (signal capture) or
   `src/hooks/stop.ts` (pipeline trigger).
2. `runStopOrchestrator()` in `src/pipeline/stop.ts` coordinates.
3. `discoverFiles()` → `buildSectionIndex()` → section candidates.
4. `selectCanonical()` picks the canonical section per group.
5. `runStage1()` → LLM plans patches per section.
6. `runStage2()` → LLM writes diffs.
7. Validation pipeline: format → apply → sanity → line ratio →
   prompt injection → hallucination → asserts.
8. `assembleBundle()` → trust gate → apply auto-applicable subset.
9. `createCommit()` via `src/git/adapter.ts`. Auto-applied modifying
   patches emit synthetic `accept` events into the trust ledger.

## Finding things by task

| Task | Where to look |
|------|---------------|
| Add a new slash command | `src/commands/` — copy an existing one; register in `.claude-plugin/plugin.json#slashCommands`; route in `src/hooks/commandDispatch.ts`; autogen stub regenerates on `npm run build`. |
| Add a new hook event | `src/hooks/` — wrap with `withExceptionGuard()`; register in `src/hooks/index.ts`. |
| Add a validation check | `src/validation/` — implement and call from the stage2 chain in `src/pipeline/stage2.ts`. |
| Add an assertion engine | `src/validation/assertions/` — add to `textPatterns.ts` or `codebaseLinked.ts`, register in `index.ts` REGISTRY. Tutorial: [docs/extensions/how-to-add-an-asserts-engine.md](docs/extensions/how-to-add-an-asserts-engine.md). |
| Add a new state file | `src/state/stateStore.ts` — atomic write pattern; register schema in `FILE_TO_SCHEMA` + `SCHEMA_NAMES`. |
| Add a language to hallucination detection | `src/validation/registries/` — new file following the existing pattern. Tutorial: [docs/extensions/how-to-add-a-language-to-hallucination-detection.md](docs/extensions/how-to-add-a-language-to-hallucination-detection.md). |
| Add a new hook event handler | `src/hooks/` + `bin/hooks/` + `hooks/hooks.json`. Tutorial: [docs/extensions/how-to-add-a-hook-event-handler.md](docs/extensions/how-to-add-a-hook-event-handler.md). |
| Diagnose a corrupt state file | [docs/failure-modes.md](docs/failure-modes.md) — per file: healthy / quarantined / locked / missing shapes + recovery cookbook. |
| Change LLM prompt | `prompts/v2/stage1-planner.md` / `stage2-patch.md`; deep-audit prompt at `prompts/v3/audit-consistency.md`. |
| Record a new cassette | Set `COHERENCE_REFRESH_CASSETTES=1`, run the relevant test, commit `tests/cassettes/<id>.json`. |
| Understand a design decision | Repo mirror: [docs/adr/](docs/adr/) (incremental DD-001..DD-147). Canonical: DD register on the Notion workspace; per-version implementation plans archived under the **Coherence** project page → [Implementation Plans (archive)](https://www.notion.so/Implementation-Plans-archive-35f010d46a70810589c2f3736efd925a). |

## Testing

```bash
npx vitest run              # unit + integration
npx vitest run tests/e2e/   # end-to-end harness
npm run gates               # ship-time gates (static-analysis + ship projects)
```

Cassette fixtures live in `tests/cassettes/`. Security tests are in
`tests/security/`. Performance tests use reference codebases in
`tests/perf/codebases/` (these are synthetic fixtures — ignore them
when graphifying `src/`).

## Graph coverage

The pre-built knowledge graph in `graphify-out/` lags the current
working tree. Run `/graphify --update` before doing cross-cutting
analysis. Latest source-file additions outside the original v0.1 graph
include `src/audit/`, `src/validation/assertions/`,
`src/state/{trustLedger,teamAggregate}.ts`,
`src/commands/{trust,metrics}.ts`, `src/proposals/autoAcceptSweep.ts`.
