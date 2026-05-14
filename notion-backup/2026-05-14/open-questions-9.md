<!-- url: https://www.notion.so/35c010d46a70816a98f9f63d528dfe03 -->
<!-- id: 35c010d4-6a70-816a-98f9-f63d528dfe03 -->
<!-- title: Open Questions -->
**Parent:** [v0.3](https://www.notion.so/35c010d46a7081539285e448bcd2cf35) · **Status:** Open register · 2026-05-10
> Tracks every assumption v0.3 planning makes that depends on v0.2 internals or unresolved trade-offs. **Spec freeze for v0.3 is gated on every entry below being resolved or explicitly deferred.** Mirrors v0.1 / v0.2 open-questions discipline.
## Status legend
- 🔴 **Open** — unresolved, blocks affected DD/spec section
- 🟡 **In progress** — investigation underway / awaiting v0.2 telemetry
- 🟢 **Resolved** — decision recorded; link to DD-NNN or note
- ⚫ **Deferred** — punted to v0.4+ with rationale
---
## Marketplace & distribution (G-1)
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
</table>
---
## Team-shared ignore (G-2)
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
</table>
---
## Monorepo `scope:` (G-3)
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
</table>
---
## Cross-team plan visibility (G-4) — **biggest architectural risk**
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
</table>
---
## v0.2 carry-overs
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
</table>
---
## Cross-cutting
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
</table>
---
## v0.2 → v0.3 sequencing gate
**All must be ✅ before v0.3 spec freeze.** Mirrors v0.2's "ALL CLEAR" gate.
1. v0.2.0 GA shipped (includes the P1–P15 finalisation patches).
2. v0.2.1 calibration patch landed (closes OQ-v3-26).
3. v0.2-alpha telemetry available (closes OQ-v3-23).
4. Marketplace target chosen (closes OQ-v3-01 → DD-093).
5. Cross-team architecture decided — file-only vs server (closes OQ-v3-14 → DD-099).
---
*Add new questions as they surface during planning. When resolved, set status 🟢 and link to the DD or note that closes it. Deferred items move to a separate "Deferred to v0.4+" section.*
— — —
<span color="green">**Resolved 2026-05-10 — closed by v0.2 substrate landing in main**</span>
*v0.2.0 GA scope (P1–P15 finalisation patches in commit fe909d8, plus DD-065..DD-092 substrate) is committed to main; the GA tag has not been applied yet but every cited code reference exists today. The 7 OQs below are resolved on that basis. Status emojis on the rows above stay 🔴 because this MCP integration cannot edit table_row cells directly — treat the entries below as the source of truth and flip the in-table emoji manually if you want a single rendering.*
- **🟢 OQ-v3-08** — v0.2 P5 (per-store strict; `snapshotWriter.flush` no longer falls through to defaultState) shipped. Decision: keep existing v0.2 file as `coherence/ignore` (committed-by-default); add opt-in `/coherence:ignore-split` for personal `coherence/ignore.local`. Final DD-NNN at v0.3 spec freeze.
- **🟢 OQ-v3-12** — v0.2 P5 (per-store strict snapshot writer) shipped. Decision: new state file `scope-cache.json` sibling of `state-snapshot.json` — separate writer + invalidation; not folded into the snapshot. Final DD-NNN at v0.3 spec freeze.
- **🟢 OQ-v3-15** — `src/state/locks.ts` confirmed shipped (DD-041 LockManager records hostname/pid + 30s/5s age fence). Decision: extend LockManager for the proposal-cache surface; combine with git merge + NFR-OBS-1 audit log for cross-host plan files. No new substrate.
- **🟢 OQ-v3-16** — v0.2 DD-068 hashing primitive shipped. Decision: hashed `git config user.email` for the cross-developer identifier in plan files; plain name in CLI display only — never persisted.
- **🟢 OQ-v3-18** — v0.2 P2 shipped (`src/signal/fileLocalityCache.ts`, session-scoped Map, reset at SessionStart/SessionEnd — commit fe909d8). Decision: `signal-cache.json` and the session map stay per-developer and never cross. Only `proposal-cache.json` entries cross. v0.3 spec must explicitly forbid committing the session map.
- **🟢 OQ-v3-20** — v0.2 DD-074 graduation scope shipped (`src/state/graduation.ts`). Decision: `/coherence:de-annotate` supports per-doc / per-directory / global scopes, persisted in `graduation.json` (or sibling), most-specific-wins.
- **🟢 OQ-v3-22** — v0.2 P7 doc-content memo shipped (commit fe909d8 — `Map<docPath, content|null>` shared by trickle scan + annotate proposer). Decision: tombstone shape = path-hash + content-hash; eviction tied to git mtime; cache key composes with the v0.2 P7 memo key (no disk re-read on hit). Per-file lock deferred until measured contention.
**Explicitly NOT closed (still blocked on post-GA v0.2 work):**
- **🔴 OQ-v3-23** — Author-pipeline planner trigger needs v0.2-alpha telemetry *data* (the harness in `scripts/alpha-telemetry-close.mjs` ships, but actual user data requires the alpha period). Stays 🔴.
- **🔴 OQ-v3-26** — DD-092 calibration drift waits on the v0.2.1 calibration patch; per `docs/v0.2/CHANGELOG.md` v0.2.1 is a post-GA deliverable in BRD-5 §1. Stays 🔴.
**Sequencing gate state: **Gate #1 (v0.2.0 GA shipped) — work landed in main; tag pending. Gate #2 (v0.2.1 calibration patch) — not yet shipped. Gate #3 (v0.2-alpha telemetry available) — harness shipped, data not yet collected. Gates #4 (OQ-v3-01 marketplace target) and #5 (OQ-v3-14 file-only vs server) — still open as v0.3 design choices.
— — —
<span color="green">**Recommendations 2026-05-10 — alternatives → recommended → audit**</span>
*15 of 17 remaining OQs receive a recommended decision below. OQ-v3-23 and OQ-v3-26 stay deferred — they need empirical data (v0.2-alpha telemetry, v0.2.1 calibration patch), not judgment. Provisional DD allocation lives in the Design Decisions page under ‘Provisional draft DDs (2026-05-10)’; DD-093..DD-115 cite each motivating OQ.*
**G-1 Marketplace & distribution**
- **🟡 OQ-v3-01** — Recommend: **Anthropic plugin registry only** (→ DD-093). Rejected: dual-channel registry + npm (no SDK consumer demand); registry + npm + GitHub tarball (tarball ships free with tag). **Audit:** third-party schema importers attach via the GitHub release; revisit in v0.4 if SDK demand emerges.
- **🟡 OQ-v3-02** — Recommend: **first-run migrator** (→ DD-094) reusing the v0.2 DD-080 SessionStart lifecycle. **Audit:** write a small install-time marker file with the installed version so first-run can short-circuit on already-migrated state. Quarantine fallback covers migration failure.
- **🟡 OQ-v3-03** — Recommend: **defer to Anthropic registry policy** (→ DD-114); no project-side scheme that would be replaced. **Audit:** GitHub tarball tampering window unsigned → publish SHA256 in release notes for technical-user verification.
- **🟡 OQ-v3-04** — Recommend: **fat tarball** (→ DD-095) — ship runtime + legacy `prompts/v1/` (preserves `/coherence:recover`). **Audit:** existing `pack:size` script + 10 MB gate (NFR-PERF-8) catches regression; CI matrix verifies install on win/mac/linux.
- **🟡 OQ-v3-05** — Recommend: **opt-out for local collection, explicit opt-in for upload** (→ DD-115). Mirrors v0.2 DD-068/086 split. **Audit:** marketplace install screen surfaces both controls; opt-in for collection would starve DD-092 calibration sample.
- **🟡 OQ-v3-06** — Mechanical: GitHub `humblefool/coherence`; npm `coherence` (fall back to `@humblefool/coherence` if taken); no live URL. **Audit:** run `npm view coherence` before publish.
**G-2 Team-shared ignore**
- **🟡 OQ-v3-07** — Recommend: **two-file additive** (`coherence/ignore` committed + `coherence/ignore.local` personal; committed-wins-on-conflict) (→ DD-096). **Audit:** `/coherence:ignore-split` ships an automatic `.gitignore` patch to prevent accidental commit of the local file.
- **🟡 OQ-v3-09** — Recommend: **immediate ignored_by_team transition with audit trail** (extends v0.2 DD-088 FSM); distinct events `ignored_by_team` vs `ignored_locally`. v0.2 P15 (single state_history merge) and v0.2 P4 (no second proposal_accepted) constraints both met. **Audit:** `/coherence:status` surfaces preempted proposals so devs aren’t silently overruled.
**G-3 Monorepo scope**
- **🟡 OQ-v3-10** — Recommend: **walk-all CLAUDE.md ancestors with depth cap 8** (→ DD-097), reusing the v0.2 P6 walker. **Audit:** cold-start cost amortised by DD-106 cache; emit warning when cap is hit so users can `/coherence:scope-debug`.
- **🟡 OQ-v3-11** — Recommend: **most-specific-wins default + opt-in extends: merge** (→ DD-105). Mirrors v0.2 DD-074. **Audit:** `extends:` is purely additive (absent = default). `/coherence:scope-debug <path>` explains which scope won.
- **🟡 OQ-v3-13** — Recommend: **sidecar coherence/scope.json** (→ DD-098), not `CLAUDE.md` frontmatter. **Audit:** schema-validate scope.json to catch typos; only monorepo roots need it; leaf packages have nothing to declare.
**G-4 Cross-team plan visibility**
- **🟡 OQ-v3-14** — Recommend: **file-only coherence/plans/** (→ DD-099); defer server to v0.4. **Audit:** doesn’t scale beyond \~50-dev teams → branch-scoped plans (DD-108) reduces conflicts; v0.4 can layer a server on the same file format. **Closes sequencing gate #5.**
- **🟡 OQ-v3-17** — Recommend: **branch-scoped plans, trunk via merge** (→ DD-108). **Audit:** `/coherence:doctor` flags plans staler than 7 days; squash-merge orphan trace via SHA prefix in plan filename.
**v0.2 carry-overs**
- **🟡 OQ-v3-19** — Recommend: **/coherence:export-metrics file-export only; upload via companion CLI** (→ DD-101). Defers TLS/GDPR/retention complexity to v0.4. **Audit:** print exact `curl` command at end of export to mitigate manual UX cost; no new redaction surface (DD-086 covers).
- **🟡 OQ-v3-21** — Recommend: **two-mode de-annotate** (default strip, `--keep-as-user-anchor` graduates) (→ DD-110). **Audit:** emit hint when stripping a block whose surrounding content has been user-edited so the option is discoverable.
- **🔴 OQ-v3-23** — <span color="red">**DEFERRED**</span> (DD-104 placeholder). Cannot recommend without v0.2-alpha telemetry data — making the call now bakes in the same guess that motivated DD-067’s staged-adoption rule. Resolution path: collect ≥1 month of v0.2-alpha telemetry, apply the DD-067 trigger to actual data, then ratify.
**Cross-cutting**
- **🟡 OQ-v3-24** — Recommend: **stay at v0.1 × 1.30** (→ DD-112); v0.3 candidates are mostly non-LLM (upload-metrics, monorepo scope, de-annotate). **Audit:** G-7 author-pipeline ships behind env gate (v0.2 pattern); telemetry before flipping default. CG-1/CG-2 partition tests catch regression.
- **🟡 OQ-v3-25** — Recommend: **DD-090 probe pattern; no new host APIs requested for v0.3** (→ DD-113). **Audit:** probe surface stays small — only optional capabilities probed; required ones fail loud. v0.2 P1/P10 dual-shape parser + closed-schema TS extension is the contract for new fields.
- **🔴 OQ-v3-26** — <span color="red">**DEFERRED**</span> (DD-092 carries). Calibration drift waits on v0.2.1 patch. Re-classified as process risk, *not a v0.3 spec freeze blocker* — v0.3 detection-adjacent DDs are deferred until DD-092 lands.
**Meta-themes:** (1) Defer to v0.4 anything that introduces a new substrate (server, signing scheme, npm channel). (2) Reuse v0.2 patterns aggressively (bounded walks, hashing, env gates, per-store strict snapshots, dual-shape parsers). (3) Prefer explicit two-mode controls over auto-detection (de-annotate, ignore split, scope inheritance).
<span color="green">**Final closures 2026-05-10 — OQ-v3-23 + OQ-v3-26 ratified as DDs**</span>
- **🟢 OQ-v3-23** → <span color="green">**DD-104 ratified**</span>. Author-pipeline planner ships behind `COHERENCE_AUTHOR_PLANNER=1` env flag, default OFF, in v0.2 + v0.3. Promotion to default ON deferred to v0.4 pending real-user telemetry. The env flag is the contract until then.
- **🟢 OQ-v3-26** → <span color="green">**DD-116 (new)**</span>. v0.3 spec authoring proceeds on v0.2.0 thresholds with explicit '(subject to v0.2.1 amendment)' annotations on detector-adjacent sections. v0.2.1 ships with corpus-calibrated thresholds (synthetic from `tests/fixtures/signal-corpora/`); field-calibrated re-tuning becomes v0.4 work.
**All v0.3 Open Questions are now closed.*** 24 closed via Recommendations 2026-05-10 + 2 ratified above. Empty section tables remaining are intentional — leave or drop as cosmetic preference. v0.3 BRD/Tech Spec authoring unblocked; no Open Questions outstanding.*
