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
src/validation/     Hallucination detection, plan validation, sanity checks, language registries
src/state/          State store, coherence log, quarantine, migrations, metrics
src/llm/            LLM client, cassette (record/replay), cost ledger
src/git/            Git adapter, coherence commits
src/commands/       Slash commands: /doctor /repair /review /graduate /recover /status
src/subagent/       Subagent tracking, stats, window management, retro-reclassification
src/buffer/         Content hash, lifecycle, velocity (revert detection)
src/permissions/    Permission gate, review assembly
```

## Core abstractions (god nodes — touch these carefully)

| Symbol | File | Role |
|--------|------|------|
| `runStopOrchestrator()` | `src/pipeline/stop.ts` | Central coordinator — bridges all 7 operational communities |
| `processSection()` | `src/pipeline/stage1.ts` | Per-section planner call |
| `nowIsoUtc()` | `src/util/time.ts` | Timestamps everything; appears in 8 communities |
| `withExceptionGuard()` | `src/hooks/exceptionGuard.ts` | Wraps all hook handlers |
| `getCoherenceDir()` | `src/state/init.ts` | All state paths derive from this |
| `parse()` | `src/llm/cassette.ts` | LLM cassette parsing; bridges hooks, validation, git, recovery |
| `assembleBundle()` | `src/pipeline/bundle.ts` | Packages sections for review |
| `selectCanonical()` | `src/pipeline/canonical.ts` | Picks which section to treat as canonical when duplicates exist |

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
| Add a new slash command | `src/commands/` — copy an existing one; register in `src/index.ts` |
| Add a new hook event | `src/hooks/` — wrap with `withExceptionGuard()`; register in `src/hooks/index.ts` |
| Add a validation check | `src/validation/` — implement and call from `src/validation/apply.ts` |
| Add a new state file | `src/state/stateStore.ts` — use atomic write pattern; add migration in `src/state/migrate/` |
| Add a language to hallucination detection | `src/validation/registries/` — add a new file following the existing pattern |
| Change LLM prompt | `prompts/v1/` — `stage1-planner.md` or `stage2-patch.md` |
| Understand a design decision | `docs/superpowers/plans/2026-05-09-coherence-v0.1.md` |

## Testing

```bash
npx vitest run              # unit + integration
npx vitest run tests/e2e/   # end-to-end harness
```

Cassette fixtures live in `tests/fixtures/`. Security tests are in `tests/security/`. Performance tests use reference codebases in `tests/perf/codebases/` (these are synthetic fixtures — ignore them when graphifying `src/`).

## Graph coverage

Last graphified: 2026-05-09 · 879 nodes · 1571 edges · 47 communities  
Cost: 28,700 input / 14,300 output tokens  
Refresh with `/graphify --update` after significant changes.