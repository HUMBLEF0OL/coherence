# Coherence v0.2 Precondition Checklist (M0)

**Authoritative as of 2026-05-10.** This checklist refuses to start v0.2 work without a known-good v0.1 substrate.

## Substrate gates

- [x] **v0.1 source tree green.** All v0.1 BRD-4 acceptance gates pass on every CI matrix cell. Baseline `vitest run` count: 302 tests / 65 files.
- [x] **`version.json#schema_version === 1`** (the v1 → v2 migrator must find this on every legacy install).
- [x] **DD-068 telemetry events** are listed in `src/state/metrics.ts` MetricEventType union and emitted by hooks. The v0.2 substrate extends this union to include the three privacy-safe Author-signal events (`tool_invocation_signature`, `user_prompt_signature`, `agent_response_id`).
- [x] **DD numbering integrity.** v0.1 ended at DD-064; v0.2 register starts at DD-065 (no DD-064 collision).

## OQ-v2 status sweep

- 🟢 OQ-v2-04 (frontmatter round-trip) — resolved by DD-069 (auto-annotated discriminator + sidecar fallback).
- 🟢 OQ-v2-21 (proposal-id hashing rigor) — resolved by DD-072 (deterministic content-derived UUID, v5 namespace `coherence.v0.2.proposal`).
- 🟢 OQ-v2-24 (subagent provenance reformulation) — resolved by DD-078 amended (invocation-aggregate ratio against shipped `SubagentAttribution`).
- 🟢 OQ-v2-30/31 (scan-cache shape) — resolved by DD-066 amendment (directory reserved, `state.json` only in v0.2; per-file tombstones v0.3).
- ⚫ Auto-apply ladder — deferred to v1.0.
- ⚫ HTTPS metrics upload — deferred to v0.3.

## Spec freeze

- [x] DD-065..DD-092 ratified (28 entries).
- [x] DD-076/077/078 default thresholds locked; numeric tuning delegated to DD-092 v0.2.1 calibration patch.
- [x] DD-079 reserved (intentional numbering gap).

## Working branch policy

- Trunk merges from `dev → v0.2-trunk`.
- `v0.2-alpha` tag cut at M8 close.
- `v0.2.0` GA tag cut at M10 close.
- `v0.2.1` calibration patch committed at GA per DD-092.

## Acceptance

`tests/preconditions/v0.2-substrate.test.ts` is the metadata-only test that asserts (a) `version.json.schema_version === 1` for v0.1 installs, (b) DD-068 event names are present in the metrics emitter source, (c) the v0.2 milestones referenced in the plan exist as either implemented modules or reserved slots.
