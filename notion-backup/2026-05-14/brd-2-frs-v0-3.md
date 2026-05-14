<!-- url: https://www.notion.so/35c010d46a7081e0b319d08705d179ee -->
<!-- id: 35c010d4-6a70-81e0-b319-d08705d179ee -->
<!-- title: ⚙️ BRD-2 — Functional Requirements (v0.3) -->
**Parent:** [BRD](https://www.notion.so/35c010d46a708133b65dfad745442bf0) · **Status:** Draft 2026-05-10 (post DD-117/118)

Each FR cites motivating DD. Dropped FRs at bottom for traceability.

**Marketplace & distribution (G-1)**
- FR-MARKETPLACE-1 — Plugin lists on Anthropic plugin registry as canonical install path; no parallel npm channel. (DD-093)
- FR-MARKETPLACE-3 — Slim tarball ships runtime + active prompts only. `prompts/v1/` dropped. Gated by 10MB cap. (DD-095 amended)
- FR-MARKETPLACE-4 — Code signing per Anthropic registry policy; SHA256 of GitHub release tarball published in release notes. (DD-114)
- FR-MARKETPLACE-5 — Marketplace install screen surfaces telemetry consent: opt-out for local, explicit opt-in for upload. (DD-115)

**Team-shared ignore (G-2)**
- FR-IGNORE-1 — Two-file additive ignore: `coherence/ignore` (committed) + `coherence/ignore.local` (personal, gitignored). Committed wins. (DD-096)
- FR-IGNORE-2 — New FSM state `ignored_by_team`. Distinct event from `ignored_locally`. (DD-088 amendment)

**Monorepo scope (G-3)**
- FR-SCOPE-1 — Discovery walks all `CLAUDE.md` ancestors with depth cap 8 (reuses v0.2 P6 walker). Cache in scope-cache.json. (DD-097)
- FR-SCOPE-2 — Inheritance most-specific-wins by default with explicit `extends:` for opt-in merge. `/coherence:scope-debug <path>`. (DD-105)
- FR-SCOPE-3 — `scope:` declaration in sidecar `coherence/scope.json`, not CLAUDE.md frontmatter. (DD-098)
- FR-SCOPE-4 — Scope cache in dedicated `scope-cache.json`. (DD-106)

**Cross-team plan visibility (G-4)**
- FR-PLANS-1 — Plans stored as files under committed `coherence/plans/`. File-only forever. (DD-099 amended via DD-117)
- FR-PLANS-2 — Cross-host concurrency: extend v0.2 LockManager (DD-041 hostname/pid + 30s/5s fence). (DD-100)
- FR-PLANS-3 — Identity = SHA-256 of `git config user.email`. Plain name in CLI display only. (DD-107)
- FR-PLANS-4 — Plans branch-scoped; trunk promotes via merge. `/coherence:doctor` flags plans staler than 7 days. (DD-108)
- FR-PLANS-5 — Cross-developer signals stay per-developer. Only proposals cross. signal-cache.json + session map enforced into `.gitignore`. (DD-109)

**Metrics share-out (G-5)**
- FR-EXPORT-1 — `/coherence:export-metrics` writes audit-logged, redacted JSONL using v0.2 P8 bounded-read; prints `curl` command at end-of-export. File export + manual upload is end state. (DD-101 amended via DD-117)

**v0.2 carry-overs (G-6/G-8)**
- FR-DEANNOTATE-1 — `/coherence:de-annotate <path>` two-mode. Default strips `auto-annotated: true` blocks. `--keep-as-user-anchor` graduates the block. (DD-110)
- FR-DEANNOTATE-2 — De-annotate scope = per-doc/per-directory/global, persisted in graduation.json. (DD-102)
- FR-TOMBSTONE-1 — Per-file scan tombstone shape: path-hash + content-hash; eviction tied to git mtime. (DD-103)

**Author-pipeline planner (G-7) — env-gated**
- FR-PLANNER-1 — Author-pipeline planner ships behind `COHERENCE_AUTHOR_PLANNER=1` env flag, default OFF. Promotion to default ON deferred. (DD-104 ratified)

**Dropped FRs (traceability)**
- ~~FR-MARKETPLACE-2~~ — 'v2→v3 first-run migrator' — dropped under DD-094 superseded by DD-118.
- ~~FR-IGNORE-3~~ — 'leave existing v0.2 ignore file as committed-by-default' — dropped under DD-111 retired.
