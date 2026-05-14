<!-- url: https://www.notion.so/35c010d46a7081658a13e3795c12e5f3 -->
<!-- id: 35c010d4-6a70-8165-8a13-e3795c12e5f3 -->
<!-- title: 🗄️ TS-3 — Data Model & Storage -->
**Parent: **[Technical Specification (v0.3)](https://www.notion.so/35c010d46a70815e9bd2f9a589e6ed9c)  ·  Status: Draft 2026-05-10
*v0.3 schema_version = 3. Adds 4 new state-file types. No migrator from v2 (DD-094 superseded by DD-118).*
<span color="blue">**v0.2 state files (carry-forward, recap)**</span>
- `.claude/coherence/version.json` — schema-version sentinel. v0.3 expects `schema_version: 3` on read; refuses on lower.
- `.claude/coherence/state-snapshot.json` — debounced writer (DD-084). Unchanged.
- `.claude/coherence/proposal-cache.json` — proposal lifecycle FSM (DD-088). v0.3 amends with `ignored_by_team` state per FR-IGNORE-2.
- `.claude/coherence/signal-cache.json` — per-developer signal cache (DD-089). Unchanged. Per NFR-PRIVACY-N5, never crosses developer boundary.
- `.claude/coherence/graduation.json` — mode resolver scope (DD-074). v0.3 adds `de_annotate` key namespace per FR-DEANNOTATE-2 (additive, no schema bump).
- `.claude/coherence/scan-cache/state.json` — trickle scanner reservation (DD-066). Unchanged.
- `.claude/coherence/drift-buffer.json`, `metrics.jsonl`, `cost-ledger.json`, `coherence-log/*` — unchanged.
<span color="blue">**v0.3 new state files (4)**</span>
- **`.claude/coherence/scope-cache.json`** (DD-106) — plugin-managed cache of resolved CLAUDE.md scope chains. Schema: `{ schema_version: 3, generated_at, entries: { [filePath]: { ancestor_chain: string[], extends_resolved: object, mtime } } }`. Eviction: when `CLAUDE.md` mtime in any ancestor changes. Per-store strict (v0.2 P5). Atomic write.
- **`coherence/scope.json`** (DD-098) — user-owned, version-controlled, written by humans. Schema: `{ schema_version: 1, scope_id?, extends?: string, ignore?, mode?, ... }`. Schema-validated on read; absent file = repo-root scope only. Lives at the package boundary in monorepos.
- **`coherence/ignore + coherence/ignore.local`** (DD-096) — plain-text path lists, additive. `ignore` is committed (team rules); `ignore.local` is gitignored automatically by `/coherence:ignore-split`. Committed wins on conflict.
- **`coherence/plans/<branch-sha-12>/<plan-id>.json`** (DD-099) — cross-team plan store, file-only. Branch SHA prefix is `git rev-parse --short=12 HEAD` at plan creation. Schema: `{ schema_version: 1, plan_id, author_hash (DD-107), created_at, branch_sha, kind, title, body_md, signal_refs, audit_log: AuditEntry[] }`. Per-plan writer; concurrent edits resolved via git merge.
<span color="blue">**Schema versioning**</span>
- **v0.3 schema_version = 3.** Bump from 2 to 3 because: (a) `proposal-cache.json` gains the `ignored_by_team` FSM state; (b) `scope-cache.json` is a new sibling state file. Older readers must not silently misparse. Per DD-118 there is no v2→v3 migrator.
- **Refusal contract (NFR-COMPAT-N4).** `src/state/refuseLegacy.ts` runs at SessionStart. Reads `version.json` if present. Outcomes: `schema_version === 3` → proceed. `< 3` → emit one-line CLI message ('cohrence v0.3 does not migrate from earlier major versions; remove `.claude/coherence/` or run on a fresh project'), then exit cleanly without entering degradedMode. `version.json` absent → fresh install → write `{ schema_version: 3 }` and proceed.
<span color="blue">**Concurrency model**</span>
- **Single-process / single-host** — v0.2 LockManager (`src/state/locks.ts`, DD-041) carries forward. Per-store mutexes via the per-store strict pattern (v0.2 P5).
- **Cross-developer (G-4 plan store)** — git is the substrate. Each plan file is per-plan; conflicts resolve via standard git merge. `/coherence:doctor` flags plans staler than 7 days. No distributed lock; the file format is conflict-friendly (audit_log is an append-only array; merging two appends produces the union).
- **Cross-host (DD-100)** — LockManager already records `hostname` + `pid` + 30s/5s age fence (v0.2 DD-041). v0.3 extends it to gate proposal-cache writes; no new substrate.
<span color="blue">**Plan file format — detail**</span>
- Schema location: `src/state/schemas/plan.schema.json` (already exists in v0.2 codebase). v0.3 adds `branch_sha` + `audit_log` fields.
- AuditEntry shape: `{ ts: ISO8601, actor_hash: string (12-hex SHA-256 of git email), event: 'created'|'commented'|'accepted'|'rejected'|'ignored_by_team'|'reverted', note?: string }`. Hash format mirrors DD-068 + DD-107.
- Lifecycle: `created` → (`commented`\*) → `accepted` \| `rejected` \| `ignored_by_team`. Terminal states immutable. Reverts append a `reverted` entry but do not delete the prior accept (audit-preserving).
<span color="blue">**Privacy-by-construction (DD-117 + DD-109)**</span>
- Plan files are user-owned and committed; everything in them must be safe to expose to teammates.
- Author hash (DD-107) is the only identity in the plan; plain names live in CLI display only and are computed at read time from `git config user.email` of the local clone.
- Signal cache + session map remain per-developer (NFR-PRIVACY-N5). The first-run installer adds them to `.gitignore` automatically. M-PRIVACY-1 ship-time gate (TS-6) enforces no codepath writes them under a committed path.
— — —
<span color="green">**Audit follow-up 2026-05-10**</span>
- **C2 clarification —** 'audit_log' refers to TWO distinct things in v0.3: (a) `plan_audit_log` inside each `coherence/plans/<sha>/<id>.json` file (per-plan, append-only); (b) `proposal-cache.json#state_history` (per-proposal FSM trail, v0.2 DD-088). They share the AuditEntry shape but live in different files and are written by different code paths. Implementation should namespace the helper as `appendPlanAudit()` vs `appendProposalState()` to avoid confusion.
<span color="blue">**Per-file scan tombstone (FR-TOMBSTONE-1, DD-103) — G1 fill**</span>
- **Location.** Reuses existing `.claude/coherence/scan-cache/state.json` (v0.2 DD-066). v0.3 augments the per-entry shape; no new state file.
- **Tombstone entry shape.** `{ path_hash: string (12-hex SHA-256 of normalised path), content_hash: string (12-hex SHA-256 of file body), git_mtime: ISO8601, inserted_at: ISO8601, expires_at?: ISO8601 }`. Path normalisation = repo-relative + forward-slashes + lowercased on case-insensitive filesystems.
- **Eviction policy.** Tied to git mtime: when `stat()` on the underlying file shows mtime \> tombstone `git_mtime`, the tombstone is invalid and re-scanned. Cap on tombstone count: 5,000 entries; LRU eviction beyond cap. Aligned with v0.2 P6 bounded-walk discipline.
- **Cache key composition with v0.2 P7 memo.** The doc-content memo (v0.2 P7, `Map<docPath, content|null>`) is keyed by path. The tombstone is keyed by path_hash + content_hash. On a tombstone hit where the v0.2 memo has the same docPath, the detector reads from the memo (no disk re-read). Implementation: tombstone consultation happens BEFORE doc read; memo consultation happens INSIDE detector when content is needed.
- **Lock granularity.** Per-store mutex on the whole `scan-cache/state.json` (v0.2 DD-066). Per-file lock deferred until measured contention shows it matters.
- **Concurrent-edit safety.** If a tombstone is written while another process is mutating the same file, `git_mtime` advances and the tombstone is invalidated next read. No corruption window because the cache is read-mostly.
<span color="blue">**Telemetry events — v0.3 additions (NFR-OBS-N5) — G5 fill**</span>
*All events follow the v0.2 DD-068 contract (only hashed signatures + bucketed metadata, no raw paths or content). 6 new event kinds:*
- **`plan_created`** — `{ plan_id_hash: 32-hex, branch_sha: 12-hex, kind: enum, author_hash: 12-hex }`. Emitted when a plan file appears under `coherence/plans/`.
- **`plan_accepted`** — same shape + `actor_hash: 12-hex`, `duration_minutes: number (created_at → accepted)`.
- **`plan_rejected`** — same as plan_accepted with `reason: enum` (one of: `stale | superseded | rejected_explicit`).
- **`plan_ignored_by_team`** — `{ plan_id_hash, branch_sha, ignore_path_hash: 12-hex }` when a teammate adds a path to committed `coherence/ignore` that auto-terminates a pending plan.
- **`metrics_export_started`** — `{ since: ISO8601, anonymized: bool, event_count_bucket: '<10'|'10-100'|'100-1000'|'>1000' }`. No raw paths.
- **`scope_cache_miss`** — `{ ancestor_count: number, depth_cap_hit: bool, walk_duration_ms: number }`. Sampled (1 in 100 misses) per NFR-OBS-2 retention budget.
- **Redaction matrix update.** `docs/v0.2/privacy.md` (event-redaction matrix) gets a v0.3 amendment listing these 6 events. M-PRIVACY-1 ship-time gate (TS-6) verifies no codepath emits these events with raw paths.
— — —
<span color="green">**Audit follow-up round 2 2026-05-10**</span>
- **C3 fix — event name correction.** The earlier round-1 follow-up listed the event as `plan_ignored_by_team`. That was wrong. The DD-088 amendment (FR-IGNORE-2) is about the v0.2 proposal-cache FSM — it amends the lifecycle of `proposal-cache.json` entries (quarantine-stored proposals), not v0.3 cross-team plan files in `coherence/plans/`. The correct event name is **`proposal_ignored_by_team`** with the same payload shape: `{ proposal_id_hash: 32-hex, ignore_path_hash: 12-hex }`.
- **Why the distinction matters.** v0.3 plans (G-4) live in committed git files and are ratified via merge — there's no FSM that 'auto-terminates' a plan when an ignore rule lands. Plans can be marked rejected explicitly, but not `ignored_by_team` by a third-party path addition. The `ignored_by_team` transition only applies to v0.2 proposals. **Updated v0.3 telemetry event roster: **plan_created, plan_accepted, plan_rejected, `proposal_ignored_by_team`, metrics_export_started, scope_cache_miss — 6 events, but one is on the proposal lifecycle (DD-088) not the plan lifecycle (DD-099).
<span color="blue">**C4 — schema_version two-tier convention**</span>
- Plugin-managed state in `.claude/coherence/` (e.g. `scope-cache.json`, `proposal-cache.json`, `state-snapshot.json`) tracks the v3 sentinel — each file's `schema_version: 3` mirrors `version.json#schema_version: 3`. A bump on the sentinel implies a coordinated bump on every plugin-managed file (per DD-080 single-coordinated-migrator pattern, retired in v0.3 per DD-118 — v0.3 just refuses pre-v3 state instead of migrating).
- User-owned new files in `coherence/` (e.g. `coherence/scope.json`, `coherence/plans/<sha>/<id>.json`) evolve independently — their `schema_version: 1` is per-file. Future schema breaks on these are independent of the plugin sentinel and are versioned per-file. Reasoning: user-owned files cross developer boundaries and survive plugin uninstalls; pinning them to the plugin's internal version would force migration headaches no one wanted.
- **Validation contract.** `src/state/refuseLegacy.ts` checks the v3 sentinel only. Per-file `schema_version` on user-owned files is checked at read time by the consuming module (e.g. scope resolver checks `scope.json#schema_version === 1`; plan reader checks `plan#schema_version === 1`). Mismatch on a user-owned file emits `schema_version_mismatch` telemetry + skips the file (not a session-blocker).
