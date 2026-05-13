# Coherence

A Claude Code plugin that detects and repairs documentation drift — when code changes without updating the docs that describe them. It runs as a set of Claude Code hooks and slash commands, using a two-stage LLM pipeline to plan and apply fixes.

## Before exploring source files

A pre-built knowledge graph lives in `graphify-out/`. **Read it before touching source files** — it will tell you what connects to what without reading 80+ TypeScript files.

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

## Architecture

```
src/hooks/          Entry points — Claude Code fires these on events
src/pipeline/       Two-stage LLM pipeline (stop orchestrator → stage1 → stage2 → merge)
src/detection/      Anchor scanning, section index, file discovery, compaction detection
src/validation/     Hallucination, plan validation, sanity, language registries, + (v1.0) assertions/
src/audit/          (v1.0) Token budget classifier, lazy symbol-index cache, --deep LLM pass
src/state/          State store, coherence log, quarantine, migrations, metrics,
                    + (v1.0) trustLedger.ts, teamAggregate.ts
src/llm/            LLM client, cassette (record/replay), cost ledger
src/git/            Git adapter, coherence commits
src/commands/       Slash commands: /doctor /repair /review /graduate /recover /status
                    + (v0.4) /audit /consent /export-metrics
                    + (v1.0) /trust /metrics; /repair gains --reassociate, --expire-orphans
src/subagent/       Subagent tracking, stats, window management, retro-reclassification
src/proposals/      DD-065 quarantine, store, expiry sweep; (v1.0) autoAcceptSweep.ts
src/buffer/         Content hash, lifecycle, velocity (revert detection)
src/permissions/    Permission gate, review assembly
prompts/v2/         Stage1/Stage2/author/annotate prompts
prompts/v3/         (v1.0) audit-consistency.md for /coherence:audit --deep
```

## Core abstractions (god nodes — touch these carefully)

| Symbol | File | Role |
|--------|------|------|
| `runStopOrchestrator()` | `src/pipeline/stop.ts` | Central coordinator — bridges all 7 operational communities; in v1.0 also gates auto-apply on `getSectionScore()` for `modifying` patches |
| `processSection()` | `src/pipeline/stage1.ts` | Per-section planner call |
| `nowIsoUtc()` | `src/util/time.ts` | Timestamps everything; appears in 8 communities |
| `withExceptionGuard()` | `src/hooks/exceptionGuard.ts` | Wraps all hook handlers |
| `getCoherenceDir()` | `src/state/init.ts` | All state paths derive from this |
| `parse()` | `src/llm/cassette.ts` | LLM cassette parsing; bridges hooks, validation, git, recovery |
| `assembleBundle()` | `src/pipeline/bundle.ts` | Packages sections for review |
| `selectCanonical()` | `src/pipeline/canonical.ts` | Picks which section to treat as canonical when duplicates exist |
| `recordEvent()` | `src/state/trustLedger.ts` | (v1.0) Records accept/edit/revert against a sectionRef; serialised by in-process `withLedgerLock` |
| `getSectionScore()` | `src/state/trustLedger.ts` | (v1.0) DD-138 score lookup with lazy stale-recompute; called by the stop pipeline auto-apply gate |
| `applyAssertions()` | `src/validation/assertions/applyToPatch.ts` | (v1.0) Reads file frontmatter `asserts:` and routes each entry to the registry; called from `stage2.ts` after hallucination |
| `runAutoAcceptSweep()` | `src/proposals/autoAcceptSweep.ts` | (v1.0) FR-TRUST-3 net-new auto-accept; SessionStart-only |
| `handleDeepAudit()` | `src/audit/deepConsistency.ts` | (v1.0) Two-step flag-based cost gate for the LLM cross-section consistency pass |

## Key design decisions

- **Two-stage pipeline**: Stage 1 (planner) produces a structured plan; Stage 2 (patch writer) applies it. Never collapse them into one call.
- **Cassette system** (`src/llm/cassette.ts`): All LLM calls are recorded and can be replayed in tests. Don't bypass it.
- **Hallucination corpus** (`src/validation/hallucination.ts`): Checks that symbols referenced in patches actually exist in the codebase. Language registries live in `src/validation/registries/`.
- **Degraded mode** (`src/hooks/degradedMode.ts`): When exceptions exceed threshold, coherence silently backs off rather than blocking the session. Check `isDegraded()` before adding new hook logic.
- **State files** (`src/state/`): All state is written atomically. Quarantine (`src/state/quarantine.ts`) holds corrupt files. Sentinels (`src/state/sentinels.ts`) are kill-switches.

## Data flow for a new feature

1. Hook fires → `src/hooks/postToolUse.ts` (or `stop.ts`)
2. `runStopOrchestrator()` in `src/pipeline/stop.ts` coordinates
3. `discoverFiles()` → `buildSectionIndex()` → section candidates
4. `selectCanonical()` picks the canonical section per group
5. `runStage1()` → LLM plans patches per section
6. `runStage2()` → LLM writes diffs
7. Validation pipeline: hallucination check → sanity → line ratio → prompt injection
8. `assembleBundle()` → `requiresConfirmation()` → apply or queue
9. `createCommit()` via `src/git/adapter.ts`

## Finding things by task

| Task | Where to look |
|------|--------------|
| Add a new slash command | `src/commands/` — copy an existing one; register in `.claude-plugin/plugin.json#slashCommands`; route in `src/hooks/commandDispatch.ts` (v0.4+ dispatch); autogen stub regenerates on `npm run build` |
| Add a new hook event | `src/hooks/` — wrap with `withExceptionGuard()`; register in `src/hooks/index.ts` |
| Add a validation check | `src/validation/` — implement and call from the stage2 chain in `src/pipeline/stage2.ts` |
| Add an assertion engine | `src/validation/assertions/` — add to `textPatterns.ts` or `codebaseLinked.ts`, register in `index.ts` REGISTRY |
| Add a new state file | `src/state/stateStore.ts` — use atomic write pattern; register schema in `FILE_TO_SCHEMA` + `SCHEMA_NAMES` |
| Add a language to hallucination detection | `src/validation/registries/` — add a new file following the existing pattern |
| Change LLM prompt | `prompts/v2/stage1-planner.md`/`stage2-patch.md`; v1.0 deep-audit prompt at `prompts/v3/audit-consistency.md` |
| Record a new cassette | Set `COHERENCE_REFRESH_CASSETTES=1`, run the relevant test, commit `tests/cassettes/<id>.json` |
| Understand a design decision | `docs/superpowers/plans/` — most recent: `2026-05-13-coherence-v1.0.md` |

## Testing

```bash
npx vitest run              # unit + integration
npx vitest run tests/e2e/   # end-to-end harness
```

Cassette fixtures live in `tests/fixtures/`. Security tests are in `tests/security/`. Performance tests use reference codebases in `tests/perf/codebases/` (these are synthetic fixtures — ignore them when graphifying `src/`).

## Graph coverage

Last graphified: 2026-05-09 (pre-v1.0) · 879 nodes · 1571 edges · 47 communities  
**Stale.** v1.0 added ~15 source files (`src/audit/`, `src/validation/assertions/`,
`src/state/{trustLedger,teamAggregate}.ts`, `src/commands/{trust,metrics}.ts`,
`src/proposals/autoAcceptSweep.ts`) and ~20 test files. Refresh with
`/graphify --update` before doing cross-cutting analysis.