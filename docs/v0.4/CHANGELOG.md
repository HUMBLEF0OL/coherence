# Coherence v0.4 — CHANGELOG

> v0.4 polishes for first impressions: official plugin manifest layout, consent command,
> audit bundling, path sandboxing, trigger contracts, and parseMajor correctness.

## M0 — Manifest relocation + validate gate (DD-119, DD-121, DD-123)
- `plugin.json` relocated to `.claude-plugin/plugin.json` per the official plugin schema.
- FR-MANIFEST-4 fields populated: `author`, `license`, `repository`, `keywords`.
- `scripts/validate-plugin.mjs` added; `npm run validate-plugin` runs `claude plugin validate`.
- `assertVersionSync(tag)` added to the release pipeline so all three version sources stay in lockstep.

## M1 — parseMajor fix + refuseLayout (DD-122, DD-124)
- `parseMajor()` fixed to use the SemVer major digit only. Prior versions conflated minor into major
  for ≥1.0.0 versions, and over-triggered cross-major refusal between 0.x versions.
- `refuseLayout()` + `refuse_layout` discriminant added to `state/refuseLegacy.ts`.
- SessionStart Step 1b refuses startup if a v0.3-style `plugin.json` is found at the plugin install root.

## M2 — Trigger contracts (DD-129, DD-120)
- `src/state/triggerContracts.ts`: TC-1 (author-planner promotion hint at ≥25% cross-kind, 30-day window)
  and TC-2 (calibration re-tune hint at ≥50 sessions × ≥30 days).
- New per-developer state file: `trigger-state.json` — one-time hint guard.
- `firstRun.ts` creates the `${CLAUDE_PLUGIN_DATA}` directory on fresh install.

## M3 — Consent + sandbox + audit (DD-125, DD-127, DD-128)
- `/coherence:consent` — read/write telemetry consent without a TTY.
- `--out` path sandboxing in `/coherence:export-metrics` now applies always (not just when creating a
  directory). The `--allow-out-of-tree` flag is required to write outside `projectRoot`.
- `/coherence:audit` — bundling-only report: doctor + scope-debug + status + metrics export.
- `promptInteractive` placeholder removed from `src/state/consent.ts`.

## M4 — Autogen stubs + sentinel dispatch (DD-130)
- `scripts/generate-command-stubs.mjs` generates `commands/<name>.md` at build time from the manifest.
- `commands/` and `.coherence-stub-hash` gitignored (build artifacts).
- UserPromptSubmit detects `<!-- coherence-command: <name> -->` and dispatches to the JS handler.
- `src/hooks/commandDispatch.ts` routes `coherence:consent` and `coherence:audit`.

## M5 — Tri-partition enforcement + release pipeline
- `no-cross-dev-leak.test.ts` extended with M-TRIPLEX-1 tier assertions.
- Release pipeline: `build → assertVersionSync → validate-plugin → gates → calibrate → test → tag`.
- Version bumped to `0.4.0` across `package.json`, `.claude-plugin/plugin.json`, `PLUGIN_VERSION`.
