# Coherence v0.4.0

First-impressions polish + marketplace structural release of the `cohrence` Claude Code plugin.

## Highlights

- **Official plugin manifest layout (G-1, DD-119)** — `plugin.json` relocated to `.claude-plugin/plugin.json` per the Anthropic plugin schema. `${CLAUDE_PLUGIN_ROOT}` for internal paths, `${CLAUDE_PLUGIN_DATA}` for per-installation state. `npm run validate-plugin` wired into the release pipeline. Users upgrading from v0.3 **must re-install** (DD-118/DD-122); `.claude/coherence/` state is preserved.
- **`/coherence:consent` (G-2, DD-127)** — read/write telemetry consent without a TTY. Replaces the interactive first-run prompt that was inoperable in hook contexts. Flags: `--local on|off`, `--upload on|off`, `--reset`.
- **`/coherence:audit` (G-2, DD-125)** — bundling-only report: runs doctor, scope-debug, status, and metrics export in sequence; renders a single Markdown summary. Failures captured as `[error: ...]` without aborting.
- **`--out` path sandboxing hardened (G-2, DD-128)** — `/coherence:export-metrics --out` now refuses paths outside `projectRoot` on every invocation. `--allow-out-of-tree` required to escape, with a stderr warning.
- **Telemetry-gated trigger contracts (G-3, DD-129)** — TC-1 (author-planner promotion hint at ≥ 25 % cross-kind + 30-day window) and TC-2 (calibration re-tune hint at ≥ 50 sessions × 30 days) now ship as executable code. They fire automatically when field thresholds are crossed, without a further code release. State tracked in `trigger-state.json`.
- **`parseMajor` correctness (G-4, DD-124)** — SemVer major digit only; prior formula (`major × 1000 + minor`) incorrectly treated `0.3 → 0.4` as a cross-major bump. All `0.x.y` installs are the same major bucket.
- **Autogen command stubs (M4, DD-130)** — `scripts/generate-command-stubs.mjs` generates `commands/<name>.md` at build time from the manifest; `UserPromptSubmit` dispatches `coherence:consent` and `coherence:audit` via sentinel detection.

## Architectural commitments (unchanged from v0.3)

- **DD-117 — No backend, ever.** File-only plugin in perpetuity.
- **DD-118 — No legacy version support.** Re-install across structural bumps; no migrators.
- **DD-065 — Trust model.** Net-new files never auto-land without explicit user acceptance.

## Storage tiers (v0.4)

| Tier | Path | Semantics |
|---|---|---|
| Per-installation | `${CLAUDE_PLUGIN_DATA}/` | Survives plugin updates. Reserved in v0.4; used from v0.4.1+. |
| Per-project per-developer | `.claude/coherence/` | Gitignored. Adds `trigger-state.json`. |
| Per-team | `coherence/` | Committed. Unchanged from v0.3. |

## What's in the tarball

`dist/`, `.claude-plugin/plugin.json`, `prompts/v2/`. Schemas in `dist/state/schemas/` (19 files). `commands/` excluded (build artifact).

## Acceptance

- **Tests:** all suites passing (unit / integration / e2e / security / perf / preconditions / rollback / schema / cost / static-analysis / ship / fixtures)
- **Gates:** `npm run gates` green — M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-TRIPLEX-1
- **Validate:** `npm run validate-plugin` exit 0
- **Calibration:** 3/3 detectors pass M-CALIB-1 (carry from v0.3)

## Install

```bash
claude plugin install cohrence   # Anthropic plugin registry
```

Or for local development:

```bash
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
```

Wire via `.claude-plugin/plugin.json`. Marketplace listing submission in progress.

## Upgrade from v0.3

Re-install only — do **not** delete `.claude/coherence/` (your per-project state is intact):

```bash
claude plugin install cohrence   # replaces v0.3 layout
```

If SessionStart prints a re-install prompt (v0.3 `plugin.json` detected at install root), follow the printed instruction. Your `config.json`, `drift-buffer.json`, and `coherence-log.md` are unaffected.
