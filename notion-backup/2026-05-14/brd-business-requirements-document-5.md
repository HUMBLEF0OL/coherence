<!-- url: https://www.notion.so/35c010d46a708133b65dfad745442bf0 -->
<!-- id: 35c010d4-6a70-8133-b65d-fad745442bf0 -->
<!-- title: 📋 BRD — Business Requirements Document -->
**Parent: **[v0.3](https://www.notion.so/35c010d46a7081539285e448bcd2cf35)  ·  **Status: **Draft 2026-05-10  ·  **Reads: **v0.3 Overview + DD-093..DD-116 + closed OQs. *Theme: v0.1 reacts → v0.2 proposes → v0.3 distributes.*
<span color="blue">**BRD-1 · Personas & Use Cases**</span>
- **P1 · Solo developer (continued from v0.2).** One repo, one machine. Uses cohrence to detect drift between code and anchored docs / skills / agents / slash commands. v0.3 changes nothing for this persona except: (a) install via marketplace instead of git clone, (b) opt-in monorepo scope if their repo has nested packages.
- **P2 · Team developer (new in v0.3).** Multi-developer shared repo. Wants the team's accepted ignore rules (DD-096) propagated automatically, wants to see teammate proposals (DD-099 plan store), wants per-developer privacy on signals (DD-109). Cares deeply about merge-conflict surface.
- **P3 · Tech lead / reviewer.** Needs the proposal-cache audit trail to answer 'who proposed this, when, and against which signal?'. Reads identity = SHA-256 hash of git email (DD-107) but sees plain name in CLI display. Reviews and ratifies cross-team plans on merge.
- **P4 · Marketplace browser (new in v0.3).** First-time user discovering cohrence on the Anthropic plugin registry. Sees the listing card, reads description + use cases, installs. First-run UX runs the v2→v3 migrator (or initialises empty state) and surfaces the telemetry consent screen (DD-115).
<span color="blue">**BRD-2 · Functional Requirements**</span>
**Marketplace & distribution (G-1)**
- **FR-MARKETPLACE-1** — Plugin lists on Anthropic plugin registry as the canonical install path; no parallel npm channel for v0.3. (DD-093)
- **FR-MARKETPLACE-2** — First-run migrator runs at SessionStart, not at install. Install marker file lets first-run short-circuit on already-migrated state. (DD-094)
- **FR-MARKETPLACE-3** — Tarball ships runtime + legacy `prompts/v1/` (preserves `/coherence:recover`) + all schemas + bin/ statusline scripts. Gated by 10 MB cap (NFR-PERF-8). (DD-095)
- **FR-MARKETPLACE-4** — Code signing follows Anthropic registry policy; SHA256 of GitHub release tarball published in release notes for technical-user verification. (DD-114)
- **FR-MARKETPLACE-5** — Marketplace install screen surfaces telemetry consent: opt-out for local collection, explicit opt-in for upload. (DD-115)
**Team-shared ignore (G-2)**
- **FR-IGNORE-1** — Two-file additive ignore model: `coherence/ignore` (committed) + `coherence/ignore.local` (personal, gitignored). Committed wins on conflict. (DD-096)
- **FR-IGNORE-2** — New FSM state `ignored_by_team`. When a teammate adds a path to committed ignore that you have a pending proposal on, transition to terminal state with audit trail. Distinct event from `ignored_locally`. Constraints from v0.2 P15 (no duplicate state_history) + P4 (no second proposal_accepted) honoured. (DD-088 amendment)
- **FR-IGNORE-3** — v0.2 → v0.3 migration: leave existing `coherence/ignore` as committed-by-default. Opt-in `/coherence:ignore-split` adds the local file + auto-patches `.gitignore`. Idempotent on second run. (DD-111)
**Monorepo scope (G-3)**
- **FR-SCOPE-1** — Discovery walks all `CLAUDE.md` ancestors with depth cap 8 (reuses v0.2 P6 walker). Cache the resolved scope chain per file in scope-cache.json (FR-SCOPE-4). (DD-097)
- **FR-SCOPE-2** — Inheritance is most-specific-wins by default with explicit `extends:` for opt-in merge. Mirrors v0.2 DD-074. `/coherence:scope-debug <path>` explains which scope won. (DD-105)
- **FR-SCOPE-3** — `scope:` declaration lives in sidecar `coherence/scope.json`, not `CLAUDE.md` frontmatter. Schema-validated; only monorepo roots need it. (DD-098)
- **FR-SCOPE-4** — Scope cache lives in dedicated `scope-cache.json` (sibling of state-snapshot.json). Separate writer + invalidation; not folded into the snapshot (v0.2 P5 per-store strict). (DD-106)
**Cross-team plan visibility (G-4)**
- **FR-PLANS-1** — Cross-team plans stored as files under committed `coherence/plans/` directory. No server, no shared store. (DD-099)
- **FR-PLANS-2** — Cross-host concurrency: extend v0.2 LockManager `src/state/locks.ts` (DD-041 hostname/pid + 30s/5s fence) for the proposal-cache surface. Combine with git merge + audit log (NFR-OBS-N5). (DD-100)
- **FR-PLANS-3** — Cross-developer identity = SHA-256 of `git config user.email` (DD-068 hashing pattern). Plain name in CLI display only — never persisted to plan files. (DD-107)
- **FR-PLANS-4** — Plans are branch-scoped; trunk promotes via merge. Plan filename includes branch SHA prefix (orphan trace under squash-merge). `/coherence:doctor` flags plans staler than 7 days. (DD-108)
- **FR-PLANS-5** — Cross-developer signals stay per-developer. Only proposals cross. `signal-cache.json` + session map enforced into `.gitignore` automatically. (DD-109)
**Metrics share-out (G-5)**
- **FR-EXPORT-1** — `/coherence:export-metrics` writes audit-logged, redacted JSONL using v0.2 P8 bounded-read. Upload is a manual companion CLI (e.g. `curl`) printed at end of export. Full upload UX deferred to v0.4. (DD-101)
**v0.2 carry-overs (G-6/G-8)**
- **FR-DEANNOTATE-1** — `/coherence:de-annotate <path>` is two-mode. Default strips `auto-annotated: true` blocks. `--keep-as-user-anchor` graduates the block to a user-owned anchor. Hint emitted when surrounding content has been user-edited. (DD-110)
- **FR-DEANNOTATE-2** — De-annotate scope = per-doc / per-directory / global, persisted in `graduation.json` under `de_annotate` key (additive, no migration). Most-specific-wins. (DD-102)
- **FR-TOMBSTONE-1** — Per-file scan tombstone shape: path-hash + content-hash; eviction tied to git mtime. Cache key composes with v0.2 P7 doc-content memo (no disk re-read on hit). Per-file lock revisited only if measured contention. (DD-103)
**Author-pipeline planner (G-7) — env-gated**
- **FR-PLANNER-1** — Author-pipeline planner ships behind `COHERENCE_AUTHOR_PLANNER=1` env flag, default OFF. Promotion to default ON deferred to v0.4 pending real-user telemetry confirming ≥1-month rolling window of ≥25% cross-kind co-occurrence per DD-067 staged-adoption rule. (DD-104 ratified)
<span color="blue">**BRD-3 · Non-Functional Requirements**</span>
- **NFR-PRIVACY-N5 (new)** — Per-developer signal locality. `signal-cache.json` and the session map (v0.2 P2 `fileLocalityCache.ts`) never cross developers. CI lint enforces the path into `.gitignore`. (DD-109)
- **NFR-PRIVACY-N6 (new)** — Plan author identity hashed end-to-end (DD-107). Plain name only in CLI display, never persisted to disk. Hash collision risk negligible at team scale.
- **NFR-PERF-1 (reused)** — PostToolUse 50ms p95. v0.3 scope discovery (FR-SCOPE-1) MUST honour this; cold-start cost amortised by FR-SCOPE-4 cache.
- **NFR-PERF-N4 (new)** — Scope-cache cold-start budget \< 200ms for repos up to 100 packages × depth 8. Warning emitted when depth cap is hit (user can run `/coherence:scope-debug`).
- **NFR-COST-1 (reused)** — Per-session cost ceiling stays at v0.1 × 1.30. v0.3 candidate features are mostly non-LLM. G-7 author-pipeline gated by env flag (DD-112). CG-1 / CG-2 partition tests catch regression.
- **NFR-COMPAT-3 (reused)** — `min_claude_code_version` bumped if any v0.3 feature requires a newer Claude Code; otherwise unchanged.
- **NFR-COMPAT-N4 (new)** — v2 → v3 schema migration follows the DD-080 single-coordinated-migrator pattern. Idempotent. Quarantine fallback on failure. (DD-094)
- **NFR-OBS-1 (reused)** — Audit log captures every proposal-lifecycle transition with hashed identity + timestamp.
- **NFR-OBS-N5 (new)** — Cross-team plan transitions emit `ignored_by_team` / `ignored_locally` distinct events into the audit trail. `/coherence:status` surfaces preempted proposals so devs aren't silently overruled.
- **NFR-SECURITY-N3 (new)** — Host capability probe surface bounded. Only optional capabilities probed; required ones fail loud. v0.2 P1 dual-shape parser + v0.2 P10 closed-schema TS extension is the contract. (DD-113)
<span color="blue">**BRD-4 · Success Metrics & Acceptance**</span>
- **M-ADOPT-1** — ≥3 distinct teams using marketplace install within 60 days post-listing (Anthropic registry telemetry). Soft target; reset baseline if registry policy changes. (G-1)
- **M-IGNORE-1** — ≥1 entry per project on average in `coherence/ignore` across the alpha cohort. Validates the team-rule premise. (G-2)
- **M-SCOPE-1** — Monorepo discovery passes (PostToolUse \< 50ms p95) for repos with ≥5 nested packages × depth 8. (G-3, NFR-PERF-1)
- **M-PLANS-1** — ≥1 cross-team plan accepted per active branch in alpha cohort, with audit-log entry attributing identity. (G-4)
- **M-COST-1** — Per-session cost ≤ v0.1-baseline × 1.30 (CG-1 + CG-2 partition tests pass). (NFR-COST-1)
- **M-PRIVACY-1** — Zero accidental commits of `signal-cache.json` or `session-map.json` across the alpha cohort. Enforced by automatic `.gitignore` patch + CI lint check. (NFR-PRIVACY-N5)
- **M-CALIB-1** — Corpus-calibrated thresholds (DD-076/077/078) pass Wilson 95% lower bound ≥0.7 against the v0.2.1 corpus. Field calibration becomes M-CALIB-2 in v0.4. (DD-116)
<span color="blue">**BRD-5 · Roadmap & Post-GA Commitments**</span>
**Sequencing gates (revised after DD-104 + DD-116 ratifications)**
- **Gate #1 — v0.2.0 GA tag applied** (work in master at `fcaefea`; tag pending). Effective blocker for v0.3 implementation start of marketplace track.
- **Gate #2 — v0.2.1 corpus calibration** (DD-116). Soft prerequisite — detector-adjacent v0.3 sections carry '(subject to v0.2.1 amendment)' annotation until landed. Tractable in days, not months.
- **Gates #3, #4, #5 — closed.** #3 reclassified as process risk per DD-104; #4 closed by DD-093; #5 closed by DD-099.
**Post-GA commitments**
- **v0.4 author-pipeline planner promotion.** Once ≐1-month rolling alpha telemetry shows ≥25% cross-kind co-occurrence per DD-067 staged-adoption rule, `COHERENCE_AUTHOR_PLANNER` env flag flips to default ON. (DD-104, BRD-5 §3 commitment)
- **v0.4 field calibration.** Re-tune DD-076/077/078 thresholds against real `metrics.jsonl` across ≥50 sessions × ≥30 days observation. Wilson 95% lower bound ≥0.7 acceptance. (DD-116)
**Deferred to v0.4+**
- Server-backed plan store (DD-099 alternative)
- Full upload UX with TLS pinning, GDPR erasure, retention windows (DD-101 alternative)
- Multi-channel publishing (npm + GitHub release tarball as primary, DD-093 alternative)
- Auto-generated runnable slash command handlers (v0.2 ships docs-only)
- Cross-session learning (per v0.3 Overview Non-goals)
- Auto-apply, assertion checking, quality-metrics (per v0.3 Overview Non-goals)
**Acceptance summary.** v0.3 GA when: (1) all FR-\* land with passing tests; (2) M-COST-1 + M-PRIVACY-1 verified at GA; (3) M-ADOPT-1 + M-IGNORE-1 + M-PLANS-1 + M-SCOPE-1 + M-CALIB-1 verified at +60 days post-GA. Tech Spec authoring (TS-1..TS-9) is the next deliverable.
<page url="https://www.notion.so/35c010d46a7081028c7ac3287ae9a51c">BRD-1 — Personas & Use Cases</page>
<page url="https://www.notion.so/35c010d46a7081e0b319d08705d179ee">BRD-2 — Functional Requirements</page>
<page url="https://www.notion.so/35c010d46a7081c2a010cb13993184f4">BRD-3 — Non-Functional Requirements</page>
<page url="https://www.notion.so/35c010d46a708180bd9ae9a069601528">BRD-4 — Success Metrics & Acceptance</page>
<page url="https://www.notion.so/35c010d46a70815e9648e842493b141b">BRD-5 — Roadmap & Post-GA Commitments</page>
— — —
**Canonical slices (sub-pages above this divider) ***supersede the consolidated content below as of 2026-05-10. Content under the Architectural commitments / DD-117 + DD-118 amendments lives in the slice pages; the inline blocks beneath this banner are an earlier consolidated draft retained for diff continuity. New readers should follow the BRD-1..BRD-5 sub-pages.*
- [**BRD-1 — Personas & Use Cases**](https://www.notion.so/35c010d46a7081028c7ac3287ae9a51c)
- [**BRD-2 — Functional Requirements**](https://www.notion.so/35c010d46a7081e0b319d08705d179ee)
- [**BRD-3 — Non-Functional Requirements**](https://www.notion.so/35c010d46a7081c2a010cb13993184f4)
- [**BRD-4 — Success Metrics & Acceptance**](https://www.notion.so/35c010d46a708180bd9ae9a069601528)
- [**BRD-5 — Roadmap & Post-GA Commitments**](https://www.notion.so/35c010d46a70815e9648e842493b141b)
<empty-block/>
