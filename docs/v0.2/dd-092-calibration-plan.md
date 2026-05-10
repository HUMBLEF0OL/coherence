# DD-092 calibration plan — moved to Notion

The full v0.2-alpha closeout methodology (Wilson 95% CI, sessions ≥ 50, observation_days ≥ 30, planner promotion gates) now lives in the canonical v0.2 Design Decisions register on Notion as **Amendment 2026-05-10** under DD-092:

- Notion: https://www.notion.so/35b010d46a708147911ddfddfb5a2f80 (DD-092)
- Implementation: `scripts/alpha-telemetry-close.mjs` (hard-gates `--enforce-gates`, default on)
- Artefact schema: `release-artifacts/v0.2-alpha-telemetry-<ts>.json` with `closeout_gates` + per-kind `detector_precision` blocks
- Cross-reference: `docs/v0.2/dd-092-calibration-commitment.md` retains the local commitment summary

This stub is retained so the v0.2 plan checklist reference (`docs/superpowers/plans/2026-05-09-coherence-v0.2.md` line 497) continues to resolve. Edit on Notion, not here.