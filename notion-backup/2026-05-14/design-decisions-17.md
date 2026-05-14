<!-- url: https://www.notion.so/35c010d46a7081d5b3dce4a6cbfdce1d -->
<!-- id: 35c010d4-6a70-81d5-b3dc-e4a6cbfdce1d -->
<!-- title: Design Decisions -->
**Parent:** [v0.3](https://www.notion.so/35c010d46a7081539285e448bcd2cf35) · **Status:** Open register · 2026-05-10
> Continues v0.2's design-decision register. v0.2 ratified **27 DDs (DD-065..DD-092, DD-079 vacated)** — 5 amendments to v0.1 DDs and 13 new (DD-080..DD-092). v0.3 starts at **DD-093**. Format mirrors v0.2: each entry has a one-line statement, the OQ that motivated it, the rejected alternative(s), and the codebase / spec evidence cited.
---
## Status legend
- 🟢 **Ratified** — entry is normative for v0.3 spec authoring
- 🟡 **Draft** — statement written, awaiting cross-check against v0.2 implementation
- 🔴 **Open** — placeholder; pending OQ resolution in [Open Questions](https://www.notion.so/35c010d46a70816a98f9f63d528dfe03)
---
## Numbering
- v0.1: DD-001..DD-064
- v0.2: DD-065..DD-092 (27 ratified, DD-079 vacated)
- v0.3: **DD-093 onward**
---
## Active register
*Empty. DD entries will be allocated as v0.3 Open Questions resolve. Each new DD must:*
1. *Cite the OQ-v3-NN that motivated it.*
2. *Reference v0.2 codebase precedent where applicable (mirrors v0.2's **`src/`** evidence pattern).*
3. *Record the rejected alternative.*
4. *Note the affected FR / NFR / Gate slot for the eventual BRD.*
---
## Allocation queue (provisional — will be filled as OQs resolve)
<table header-row="true">
<tr>
<td>DD</td>
<td>Source OQ</td>
<td>Subject</td>
<td>v0.2 dependency</td>
<td>Type</td>
</tr>
<tr>
<td>DD-093</td>
<td>OQ-v3-01</td>
<td>Marketplace publish target</td>
<td>(none — purely external)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-094</td>
<td>OQ-v3-02</td>
<td>Plugin upgrade triggers v2→v3 migrator</td>
<td>DD-080 (single coordinated migrator)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-095</td>
<td>OQ-v3-04</td>
<td>Bundling boundary (`prompts/`, schemas, `bin/`)</td>
<td>DD-091 (`prompts/v1/`  • `prompts/v2/` ship side-by-side)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-096</td>
<td>OQ-v3-07</td>
<td>Two-file ignore model (`coherence/ignore` vs `ignore.local`)</td>
<td>v0.2 P5 (per-store strict, no flush fallthrough)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-097</td>
<td>OQ-v3-10/11</td>
<td>Monorepo scope discovery + inheritance semantics</td>
<td>v0.2 P6 (bounded `git ls-files` walk + bounded directory walk fallback)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-098</td>
<td>OQ-v3-13</td>
<td>`scope:` declaration syntax</td>
<td>(none beyond DD-069 frontmatter contract)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-099</td>
<td>OQ-v3-14</td>
<td>Cross-team plan substrate (file-only vs server)</td>
<td>(none — net-new architectural axis)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-100</td>
<td>OQ-v3-15</td>
<td>Cross-machine concurrency / locking</td>
<td>DD-041 (`LockManager` cross-host fence + hostname/pid payload at `src/state/locks.ts`)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-101</td>
<td>OQ-v3-19</td>
<td>`/coherence:upload-metrics` HTTPS contract</td>
<td>DD-086 (`share-metrics` redaction) + v0.2 P8 (bounded `metrics.jsonl` read at expiry sweep)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-102</td>
<td>OQ-v3-20/21</td>
<td>`/coherence:de-annotate` scope + behaviour</td>
<td>DD-073 (per-doc annotate hybrid) + DD-074 (graduate scope)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-103</td>
<td>OQ-v3-22</td>
<td>Per-file scan tombstone shape + eviction</td>
<td>DD-066 (scan-cache reservation) + v0.2 P7 (doc-content memo across trickle+annotate)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-104</td>
<td>OQ-v3-23</td>
<td>Author-pipeline planner adoption decision</td>
<td>DD-067 staged-adoption rule (≥25% multi-signal-kind acceptance within 30 min)</td>
<td>Conditional DD</td>
</tr>
<tr>
<td>DD-088 amend</td>
<td>OQ-v3-09</td>
<td>`proposal-cache.json` lifecycle: `ignored_by_team` state</td>
<td>DD-088 base FSM + v0.2 P15 (state_history merge invariant) + v0.2 P4 (no double `proposal_accepted`)</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-080 successor</td>
<td>(cross-cutting)</td>
<td>Single coordinated `v2_to_v3.ts` migrator</td>
<td>DD-080 + v0.2 P5 (per-store strict — each store carries own migration step)</td>
<td>New DD</td>
</tr>
<tr>
<td>TBD</td>
<td>OQ-v3-25</td>
<td>Host-capability schema additions for cross-team</td>
<td>DD-090 (HostCapabilities probe pattern) + v0.2 P1 (dual-shape parser: documented + legacy) + v0.2 P10 (closed-schema TS-type extension)</td>
<td>New DD</td>
</tr>
</table>
*Numbering above is provisional and may shift; final allocation happens at the v0.3 spec-freeze gate.*
— — —
<span color="green">**Provisional draft DDs 2026-05-10 — proposals for v0.3 spec freeze**</span>
*All entries below are 🟡 Draft pending v0.3 spec freeze. Each cites the motivating OQ-v3-NN, the rejected alternative, v0.2 codebase precedent (where applicable), the BRD slot, and an audit note. DD-104 is left as a deferred placeholder; DD-093..DD-115 cover the actionable register.*
- **🟡 DD-093** — **Marketplace publish target = Anthropic plugin registry only.** Motivated by OQ-v3-01. Rejected: registry + npm (no SDK consumer demand); registry + npm + GitHub tarball (tarball ships free with tag). Precedent: v0.2 `scripts/release.mjs` single-target build. Affects: TS-1 packaging, NFR-COMPAT-3, sequencing gate #4. Audit: third-party schema importers attach via GitHub release.
- **🟡 DD-094** — **v2→v3 migrator runs at first run, not at install.** Motivated by OQ-v3-02. Rejected: install-time migrator (Anthropic install lifecycle inconsistent); both (duplicates work). Precedent: v0.2 DD-080 SessionStart-triggered single-coordinated-migrator. Affects: TS-3 state, FR-MIGRATE-\*. Audit: install-marker file lets first-run short-circuit on already-migrated state; quarantine fallback covers failure.
- **🟡 DD-095** — **Bundling boundary = ship runtime + legacy prompts (fat tarball).** Motivated by OQ-v3-04. Rejected: runtime-only (drops `prompts/v1/`, breaks `/coherence:recover`); lazy download (network dependency). Precedent: v0.1/v0.2 ship `prompts/v1/` and `prompts/v2/` as static artifacts. Affects: TS-1 packaging, NFR-PERF-8 (10 MB), NFR-COMPAT-3 platform matrix. Audit: `pack:size` script + 10 MB gate enforce; CI matrix verifies install on win/mac/linux.
- **🟡 DD-096** — **Team ignore = two-file additive model.** `coherence/ignore` (committed) + `coherence/ignore.local` (personal); committed-wins-on-conflict. Motivated by OQ-v3-07. Rejected: single-file (no team/personal split); local-wins (team can’t pin a rule). Precedent: `.gitignore` + `.git/info/exclude`; v0.2 P5 per-store strict. Affects: TS-3 state, NFR-PRIVACY-N2. Audit: `/coherence:ignore-split` auto-patches `.gitignore` to prevent accidental commit of `.local`.
- **🟡 DD-097** — **Discovery walk = walk-all CLAUDE.md ancestors with depth cap 8.** Motivated by OQ-v3-10. Rejected: closest-ancestor only (loses monorepo merged context); unbounded walk (NFR-PERF-1 violation). Precedent: v0.2 P6 bounded walker (depth 8, 500 files). Affects: TS-3 scope, NFR-PERF-1 (50 ms p95). Audit: cold-start cost amortised by DD-106 cache; depth-cap warning lets users `/coherence:scope-debug`.
- **🟡 DD-098** — **scope: syntax = sidecar coherence/scope.json, not CLAUDE.md frontmatter.** Motivated by OQ-v3-13. Rejected: frontmatter key (pollutes user-owned CLAUDE.md, requires host frontmatter parser); both supported (drift surface). Precedent: v0.2 keeps coherence config in `coherence/` (consistent with ignore + state). Affects: TS-3 schemas. Audit: schema-validate scope.json; only monorepo roots need it.
- **🟡 DD-099** — **Cross-team plan storage = file-only (coherence/plans/ in git).** Motivated by OQ-v3-14. Rejected: server-backed (fundamental shift in deployment/security; defer to v0.4); hybrid (dual code path). Precedent: v0.1/v0.2 file-only architecture; v0.2 DD-085 cost ceiling assumes file-bound IO. Affects: TS-2, TS-3, sequencing gate #5. Audit: scaling beyond \~50-dev teams handled by branch-scoped plans (DD-108) reducing conflict surface; v0.4 can layer a server on the same file format.
- **🟡 DD-100** — **Cross-host concurrency = extend v0.2 LockManager + git merge for proposal-cache.** Motivated by OQ-v3-15. Rejected: CRDT-style merge (premature complexity); last-write-wins audit-only (data loss). Precedent: v0.2 DD-041 LockManager `src/state/locks.ts` (hostname/pid + 30s/5s age fence). Affects: TS-3 locks, NFR-OBS-1. Audit: audit log captures every transition; git merge handles concurrent edits at the file level.
- **🟡 DD-101** — **/coherence:upload-metrics v0.3 surface = file-export only; upload via companion CLI.** Motivated by OQ-v3-19. Rejected: full upload feature (TLS pinning, GDPR — defer to v0.4); design-only (blocks calibration). Precedent: v0.2 P8 bounded-read for `metrics.jsonl`; v0.2 DD-086 redaction. Affects: TS-7 commands, NFR-PRIVACY-\*, NFR-OBS-2. Audit: print `curl` command at end of export to mitigate manual UX cost.
- **🟡 DD-102** — **/coherence:de-annotate scope = per-doc / per-directory / global, persisted in graduation.json, most-specific-wins.** Motivated by OQ-v3-20. Rejected: per-doc only (no team rollout); global only (no per-doc precision). Precedent: v0.2 DD-074 graduation scope mapping. Affects: TS-7 commands, FR-MODES-\*. Audit: namespace under `de_annotate` key in graduation.json (additive, no migration).
- **🟡 DD-103** — **Per-file scan tombstone = path-hash + content-hash; eviction tied to git mtime.** Motivated by OQ-v3-22. Rejected: path-only hash (false negatives on edits); per-file mutex (premature optimisation). Precedent: v0.2 P7 doc-content memo `Map<docPath, content|null>`; v0.2 DD-066 trickle scan-cache. Affects: TS-3, NFR-PERF-1. Audit: tombstone cache key composes with v0.2 P7 memo key (no disk re-read on hit); per-file lock revisited only if measured contention.
- **🔴 DD-104** — <span color="red">**Author-pipeline planner trigger threshold (DEFERRED placeholder).**</span> Motivated by OQ-v3-23. Status: open. Decision requires v0.2-alpha telemetry data; making one now bakes in DD-067’s same guess. Resolution path: collect ≥1 month of v0.2-alpha telemetry, apply DD-067 trigger to actual data, then ratify. Affects: BRD-5 §3, sequencing gate #3.
- **🟡 DD-105** — **Inheritance semantics = most-specific-wins default + opt-in extends: merge.** Motivated by OQ-v3-11. Rejected: pure most-specific (no merge for legitimate ‘add to parent’ cases); pure merge-and-override (doesn’t match DD-074 mental model). Precedent: v0.2 DD-074 graduation scope. Affects: TS-3 scope. Audit: `extends:` is purely additive; `/coherence:scope-debug <path>` explains which scope won.
- **🟡 DD-106** — **Scope cache = dedicated scope-cache.json (sibling of state-snapshot.json).** Motivated by OQ-v3-12. Rejected: fold into `state-snapshot.json` (forces snapshot writers to know scope-cache invariants). Precedent: v0.2 P5 per-store strict; v0.2 DD-084 snapshot debounced writer. Affects: TS-3 state, NFR-PERF-1. Audit: separate writer + invalidation; migration via DD-080 successor at v3 schema bump.
- **🟡 DD-107** — **Cross-developer identity = SHA-256 of git config user.email; plain name in CLI display only.** Motivated by OQ-v3-16. Rejected: plain email persisted (privacy breach); separate identity registration (UX friction). Precedent: v0.2 DD-068 telemetry hashing. Affects: NFR-PRIVACY-\*, TS-3 state. Audit: hash collision risk negligible at team scale; plain-name CLI display stripped on every state read.
- **🟡 DD-108** — **Cross-team plan branch model = branch-scoped, trunk promotes via merge.** Motivated by OQ-v3-17. Rejected: trunk-only (every proposal becomes a merge conflict); auto-promote-on-merge (loses ratification gate). Precedent: git’s own branch model; proposals co-evolve with feature branches. Affects: TS-2 architecture. Audit: `/coherence:doctor` flags plans staler than 7 days; squash-merge orphans traceable via SHA prefix in plan filename.
- **🟡 DD-109** — **Cross-developer signals stay per-developer; only proposals cross.** Motivated by OQ-v3-18. Rejected: shared signal cache (privacy breach — behavioural patterns leak); shared session map (P2 architecture violation). Precedent: v0.2 P2 session-scoped locality cache `src/signal/fileLocalityCache.ts`. Affects: NFR-PRIVACY-N5 (new), TS-3 state. Audit: spec must explicitly forbid committing the session map; CI lints `signal-cache.json` and `session-map.json` into `.gitignore` automatically.
- **🟡 DD-110** — **/coherence:de-annotate is two-mode (default strip; --keep-as-user-anchor graduates).** Motivated by OQ-v3-21. Rejected: strip-only (loses information); auto-detect graduation (too implicit). Precedent: v0.2 `/coherence:graduate` mode resolver (DD-074). Affects: TS-7 commands, FR-MODES-\*. Audit: emit hint when stripping a block whose surrounding content has been user-edited so the option is discoverable.
- **🟡 DD-111** — **v0.2→v0.3 ignore migration = leave existing file as coherence/ignore (committed-by-default); opt-in /coherence:ignore-split.** Motivated by OQ-v3-08 (closed). Rejected: rename (breaks existing teams); auto-split (assumes intent that may not hold). Precedent: v0.2 P5 per-store strict; existing `coherence/ignore` file shape preserved. Affects: v2→v3 migrator, NFR-COMPAT-1. Audit: migrator no-op for users who don’t run `--split`; idempotent on second run.
- **🟡 DD-112** — **Cost ceiling stays at v0.1 × 1.30 (no v0.3 raise).** Motivated by OQ-v3-24. Rejected: raise to × 1.50 (premature; no LLM-heavy v0.3 features default-on); per-feature budgets (fragments user-facing message). Precedent: v0.2 DD-085 cost ceiling; v0.2 CG-1/CG-2 partition gates. Affects: NFR-COST-1, BRD-5. Audit: G-7 author-pipeline ships behind env gate (v0.2 pattern); telemetry before flipping default. Ceiling raise becomes v0.4 if data justifies.
- **🟡 DD-113** — **Host capability strategy = continue v0.2 DD-090 probe pattern; no new host APIs requested for v0.3.** Motivated by OQ-v3-25. Rejected: request multi-session broadcast API from Anthropic (blocks v0.3 GA on external timeline). Precedent: v0.2 P1 dual-shape parser; v0.2 P10 closed-schema HostCapabilities TS extension. Affects: TS-2, NFR-COMPAT-3. Audit: probe surface stays small — only optional capabilities probed; required ones fail loud.
- **🟡 DD-114** — **Code signing for v0.3 = follow Anthropic plugin registry policy; no project-side signing scheme.** Motivated by OQ-v3-03. Rejected: GPG-sign tarball + SHA256 manifests (parallel scheme to be replaced); no signing at all (tampering risk). Precedent: v0.2 release pipeline doesn’t sign today. Affects: TS-1 release, NFR-SECURITY-\*. Audit: GitHub tarball tampering window unsigned → publish SHA256 in release notes; revisit in v0.4 if Anthropic policy shifts or threat model changes.
- **🟡 DD-115** — **Marketplace install telemetry default = opt-out for local collection, explicit opt-in for upload.** Motivated by OQ-v3-05. Rejected: opt-in everywhere (starves DD-092 calibration sample); opt-out everywhere (privacy concern for upload). Precedent: v0.2 DD-068 (events) + DD-086 (file-write share-metrics) split. Affects: NFR-PRIVACY-\*, TS-3 state, BRD-5. Audit: marketplace install screen surfaces both controls explicitly; upload flow (DD-101) requires interactive confirmation regardless.
**Numbering note:** DDs above are provisional. Final allocation happens at v0.3 spec freeze; numbers may shift if new OQs surface during BRD/TS authoring. The OQ-to-DD mapping is the canonical reference until then.
— — —
<span color="green">**Ratifications 2026-05-10 — final close-out of all v0.3 OQs**</span>
- <span color="green">**🟢 DD-104 ratified**</span> — **Author-pipeline planner ships behind COHERENCE_AUTHOR_PLANNER=1 env flag, default OFF, in v0.2 and v0.3.** Promotion to default ON deferred to v0.4 once real-user telemetry confirms ≥1-month rolling window of ≥25% cross-kind co-occurrence per the DD-067 staged-adoption rule. Until then, the env flag is the contract; v0.3 spec authors detector-adjacent sections assuming planner-OFF default. Closes OQ-v3-23 (previously placeholder DD-104). Rejected: ship default-ON unconditionally (no data); defer planner code entirely to v0.4 (loses self-dogfood path). Affects: BRD-5 §3, sequencing gate #3 (no longer a v0.3 spec-freeze blocker).
- <span color="green">**🟢 DD-116**</span> — **DD-076/077/078 calibration-drift policy: v0.3 spec authoring proceeds on v0.2.0 threshold defaults; detector-adjacent sections carry an explicit '(threshold values subject to v0.2.1 amendment)' annotation.** v0.2.1 ships with corpus-calibrated thresholds (synthetic from `tests/fixtures/signal-corpora/`) as the v0.3 substrate baseline; field-calibrated re-tuning becomes v0.4 work once ≥50 sessions × ≥30 days observation accrue. Closes OQ-v3-26. Motivated by OQ-v3-26 (calibration drift). Rejected: block v0.3 spec on real telemetry (multi-month delay); ship v0.2.1 with v0.2.0 defaults unchanged (defeats the v0.2.1 purpose). Precedent: v0.2 P7 corpus-driven test pattern + Wilson 95% CI helper (DD-092). Affects: NFR-PERF-1, BRD-5 §1, sequencing gate #2 (now process risk, not v0.3 blocker).
**All v0.3 Open Questions now resolved or ratified.** DD register total: DD-093..DD-116 (24 ratified). Sequencing gates #1 (v0.2.0 GA) remains pending tag application; gates #2, #3 reclassified as process risk per DD-104 + DD-116 above. Gates #4, #5 closed by DD-093 + DD-099. v0.3 BRD/Tech Spec authoring is unblocked.
— — —
<span color="green">**Amendments 2026-05-10 (architectural commitments — no backend, no legacy)**</span>
*Two architectural commitments narrow v0.3 scope and override several earlier provisional DDs:*
- <span color="green">**🟢 DD-117 (new)**</span> — **No backend, ever. cohrence is a file-only plugin in perpetuity.** No central server, no shared database, no remote upload service maintained by the project. Plan storage uses git (`coherence/plans/`); telemetry export uses local JSONL + user-driven curl. Rejected: server-backed plan store; full upload UX with TLS pinning + GDPR + retention. Affects: v0.4+ scope (these alternatives are permanently off the roadmap, not deferred). Implication: scaling beyond \~50-developer teams is not a project goal.
- <span color="green">**🟢 DD-118 (new)**</span> — **No legacy version support burden. Each major version stands alone.** Pre-v0.3 there are no real users, so cohrence v0.3 ships fresh: it does not migrate v1 or v2 state, it does not bundle `prompts/v1/`, it does not honour anchored docs left by earlier versions. Major-version bumps may break the on-disk format; users re-install rather than migrate. Rejected: cross-version migration path; legacy prompt set in tarball; `/coherence:recover` rollback to prior major version. Affects: DD-080, DD-094, DD-095, DD-111 (all amended below).
**DDs amended by DD-117**
- <span color="green">**🟢 DD-099 amended**</span> — Cross-team plan storage = file-only (`coherence/plans/` in git). **Server-backed alternative permanently rejected** (was: 'deferred to v0.4'). The file-only architecture is the end state.
- <span color="green">**🟢 DD-101 amended**</span> — `/coherence:export-metrics` writes audit-logged, redacted JSONL; upload via user-driven curl. **Full upload UX (TLS pinning, GDPR erasure, retention windows) permanently rejected** (was: 'deferred to v0.4'). File export + manual upload is the end state.
**DDs amended by DD-118**
- <span color="red">**🔴 DD-080 retired (v0.3 onward)**</span> — The v1→v2 single-coordinated-migrator was a v0.2 deliverable; it stays in the v0.2 codebase but is not carried into v0.3. v0.3 ships without any v1 awareness.
- <span color="red">**🔴 DD-094 superseded**</span> — The 'v2→v3 first-run migrator' is no longer a v0.3 deliverable. v0.3 ships fresh state on install. Existing v0.2 users (none today) re-install rather than migrate. The `FR-MARKETPLACE-2` entry is dropped from BRD-2.
- **🟡 DD-095 amended** — **Slim tarball: ship runtime only.** Drop `prompts/v1/` from the v0.3 distribution; only `prompts/v2/` (or v3 if updated) ships. `/coherence:recover` in v0.3 only rolls back within the current major version, not across major versions.
- <span color="red">**🔴 DD-111 retired**</span> — The 'leave existing v0.2 ignore file' migration path is no longer a v0.3 commitment. v0.3 expects a fresh `coherence/ignore` file written by the user (or via `/coherence:ignore-split`). The `FR-IGNORE-3` entry is dropped from BRD-2.
*DD register total: DD-093..DD-118 (24 active + 4 retired/superseded). v0.3 BRD/Tech Spec authoring proceeds against the amended set.*
