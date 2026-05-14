<!-- url: https://www.notion.so/35d010d46a70818bbadcde0ea0113d75 -->
<!-- id: 35d010d4-6a70-818b-badc-de0ea0113d75 -->
<!-- title: BRD-2 — Functional Requirements -->
**Parent:** [📋 BRD](https://www.notion.so/35d010d46a7081e0a2d9f7a928fbaa58) · [v0.4](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · **Status:** Draft 2026-05-11
> Each FR cites the DD that governs it and the acceptance gate in BRD-4 that closes it.
---
## Marketplace listing structural (G-1)
- **FR-MANIFEST-1** — **Manifest path.** `plugin.json` at the plugin root moves to `.claude-plugin/plugin.json`. Component directories (`skills/`, `agents/`, `commands/`, `hooks/hooks.json`, `.mcp.json`) stay at plugin root — only the manifest moves. `bin/` field omitted from manifest: statusline scripts (`coherence-statusline.ps1`, `coherence-statusline.sh`, `coherence-subagent-statusline.sh`) are invoked via path written into `~/.claude/settings.json` by `src/commands/installStatusline.ts`, not via PATH. Acceptance: FR-VALIDATE-1 + M-VALIDATE-1. (DD-119; OQ-v4-05 layout invariant)
- **FR-MANIFEST-2** — **State-storage tri-partition.** Three tiers enforced across all state-write paths:
	- `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/cohrence/`) — per-installation: plugin-version cache, per-installation flags. Nothing else.
	- `.claude/coherence/` (gitignored) — per-project per-developer: proposal-cache, scope-cache, signal-cache, session-map, `metrics.jsonl`, `coherence-log`, `config.json` (consent), `trigger-state.json` (one-time hint guard, new in v0.4). All v0.3 state paths unchanged.
	- `coherence/` (committed) — per-team: plans, ignore, `scope.json`.
	- Cassettes: dev-only `tests/` artifact — not in any tier.
	Static-analysis test (`tests/static-analysis/no-cross-dev-leak.test.ts`, M6) extended to assert every state-write call site lands in the correct tier. (DD-120)
- **FR-MANIFEST-3** — **Explicit semver.** `plugin.json#version = "0.4.0"`, bumped manually on each release. `release-ga.mjs` preflight asserts `plugin.json#version`, `package.json#version`, and `src/state/init.ts#PLUGIN_VERSION` all match the pending git tag — any mismatch halts the release. (DD-121)
- **FR-MANIFEST-4** — **Manifest field population.** Populated verbatim from `package.json`: `author = "HUMBLEF0OL <123amitrana0123@gmail.com>"`, `license = "MIT"`, `repository = "github.com/HUMBLEF0OL/coherence"`, `keywords = ["claude-code", "plugin", "documentation", "drift-detection", "coherence"]`, `description`. No separate `homepage` field — Anthropic plugin schema treats `repository` as the canonical link. (OQ-v4-09; folded into DD-119 implementation)
- **FR-LAYOUT-1** — **Manifest-layout refusal.** `src/state/refuseLegacy.ts` extended with a `refuse_layout` discriminant: when `plugin.json` is detected at the plugin root (v0.3-style location), emit a one-line CLI refusal and exit cleanly. No migrator. No degraded-mode fallback. Users re-install via `claude plugin install cohrence`. (DD-122; DD-118)
- **FR-VALIDATE-1** — **`claude plugin validate`**** gate.** `scripts/release-ga.mjs` preflight runs `npm run validate-plugin` (wraps `claude plugin validate`) between `npm run gates` and `npm test`. Schema/required-field errors → halt release (non-zero exit). Warnings → logged to CI artifact, do not halt. Result cached by sha256(manifest + component tree); re-run skipped when unchanged. Meta-test intentionally breaks `.claude-plugin/plugin.json` and asserts the gate trips (mirrors v0.3 round-2 P7 pattern). (DD-123)
- **FR-AUTOGEN-1** — **Slash-command stub autogen.** `scripts/generate-command-stubs.mjs` runs at `npm run build`. Reads `plugin.json#slashCommands` (kept as the canonical command registry), emits one `commands/<name>.md` stub per entry. Each stub is a 5-line markdown file containing a sentinel pattern (`<!-- coherence-command: <name> -->`) that `src/hooks/userPromptSubmit.ts` intercepts and dispatches to the existing JS handler. Build is idempotent — regenerates only when sha256(plugin.json#slashCommands) differs. Static-analysis test asserts 1:1 mapping between manifest entries and `commands/*.md` — missing stubs are caught by `npm run validate-plugin` (FR-VALIDATE-1). No v0.3 handler implementation is lost. (DD-130)
---
## First-impressions ergonomics (G-2)
- **FR-CONSENT-1** — **Consent slash command.** `/coherence:consent` slash command implemented in `src/commands/consent.ts`. v0.3's `src/state/consent.ts#promptInteractive` placeholder removed (it never fired — no TTY in Claude Code hooks; silent defaults always applied). Behaviour:
	- No args → prints current consent state (`local: on|off`, `upload: on|off`) from `.claude/coherence/config.json#telemetry`.
	- `--local on|off` → updates `config.json#telemetry.local` with ISO timestamp.
	- `--upload on|off` → updates `config.json#telemetry.upload` with ISO timestamp.
	- `--reset` → removes `config.json#telemetry` key; defaults restored (local ON, upload OFF).
	`/coherence:status` continues to display current consent state (read path unchanged). (DD-127; NFR-PRIVACY-N5)
- **FR-SANDBOX-1** — **`--out`**** path sandboxing.** `src/commands/exportMetrics.ts`: `path.resolve(argv.out)` evaluated at command time. If resolved path does not start with `projectRoot` AND `--allow-out-of-tree` flag is absent → refuse with message: "Out-of-tree path refused. Pass --allow-out-of-tree to override.". If `--allow-out-of-tree` is present → print security warning to stderr, then write. (DD-128; NFR-SECURITY-N1)
- **FR-AUDIT-1** — **`/coherence:audit`**** bundling command.** `src/commands/audit.ts` (new). Calls `doctor`, `scopeDebug`, `status`, `exportMetrics` handlers in sequence, renders a single combined Markdown report to stdout. Prints: "v0.4 audit is a bundling-only summary; deep audit ships in v1.0." at the top of the report to set installer expectations. Does NOT implement any new analysis logic — bundling only (v1.0 deep-audit reservation honoured). (DD-125)
---
## Telemetry-gated trigger contracts (G-3)
- **FR-TRIGGER-1** — **`triggerContracts.ts`**** module.** `src/state/triggerContracts.ts` (new module) consulted at SessionStart (after `refuseLegacy`, before hook dispatch). Uses v0.3 P8 bounded-read primitive to read `metrics.jsonl`. Evaluates two trigger contracts:
	- **TC-1 (DD-104 promotion):** if rolling 30-day window shows ≥25% cross-kind co-occurrence → emit one-time CLI hint: "Author-planner readiness threshold met. Set COHERENCE_AUTHOR_PLANNER=1 to enable."
	- **TC-2 (DD-116 calibration):** if ≥50 sessions × ≥30 days of `metrics.jsonl` data → emit one-time CLI hint: "Field calibration threshold met. Run /coherence:calibrate to re-tune thresholds."
	- **No silent auto-flip.** User retains control of the env-flag flip.
	- **`metrics.jsonl`****-absent:** no-op (not an error — fresh installs have no metrics yet).
	- **One-time emission:** hint emitted once per threshold crossing, tracked in `.claude/coherence/trigger-state.json`. (DD-129)
---
## `parseMajor` correctness (G-4)
- **FR-PARSEMAJOR-1** — **`parseMajor`**** formula fix.** `src/state/refuseLegacy.ts#parseMajor` replaced: `major*1000 + minor` → `parseInt(version.split('.')[0])`. This fixes a pre-existing bug where v1.0.x and v1.1.x would be treated as different major buckets (1000 vs 1001), potentially fencing them against each other incorrectly. Ships in v0.4 because no installed base exists today — once any v1.0.x cut exists, the broken formula would be consulted. Acceptance: M-PARSEMAJOR-1 unit test. (DD-124; NFR-COMPAT-N5)
