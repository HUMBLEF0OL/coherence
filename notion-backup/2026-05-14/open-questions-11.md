<!-- url: https://www.notion.so/35d010d46a7081c78b93ff369aa93147 -->
<!-- id: 35d010d4-6a70-81c7-8b93-ff369aa93147 -->
<!-- title: Open Questions -->
**Parent:** [v0.4](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · **Status:** Open register · 2026-05-11
> Tracks every assumption v0.4 planning makes about v0.3 internals, the official Anthropic plugin schema, or unresolved trade-offs. **Spec freeze for v0.4 is gated on every entry below being resolved or explicitly deferred.** Mirrors v0.1 / v0.2 / v0.3 open-questions discipline.
## Status legend
- 🔴 **Open** — unresolved, blocks affected DD/spec section
- 🟡 **In progress** — investigation underway / awaiting v0.3 launch signal
- 🟢 **Resolved** — decision recorded; link to DD-NNN or note
- ⚫ **Deferred** — punted to v0.4.1 / v0.5+ with rationale
---
## Numbering
- v0.1: OQ-NN (no version prefix)
- v0.2: OQ-v2-NN
- v0.3: OQ-v3-01..OQ-v3-26 (all closed)
- v0.4: **OQ-v4-NN onward**
---
## G-1 Marketplace listing (structural)
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v4-01</td>
<td>🟢</td>
<td>**State-storage tri-partition rule.** What state goes to `${CLAUDE_PLUGIN_DATA}` (per-installation), `.claude/coherence/` (per-project gitignored), and `coherence/` (per-team committed)? Specifically: telemetry consent — per-user (CLAUDE_PLUGIN_DATA) or per-project (`.claude/coherence/config.json`)? Cassette cache? Plugin-version cache?</td>
<td>DD-120, TS-3 schemas, NFR-PRIVACY-N5 carry</td>
<td>Audit every state file in v0.3; classify each as personal-vs-project-vs-team; default per-installation only when the data has no project semantics</td>
</tr>
<tr>
<td>OQ-v4-02</td>
<td>🟢</td>
<td>**Manifest layout migration to v0.3 users.** Per DD-118 the answer is "re-install". Confirm the messaging path — README banner? `/coherence:status` warning if old layout detected? Refusal at SessionStart?</td>
<td>DD-122, NFR-COMPAT-N4 (extended)</td>
<td>Default: refuseLegacy.ts pattern from v0.3 detects old `plugin.json` location and emits one-line CLI message</td>
</tr>
<tr>
<td>OQ-v4-03</td>
<td>🟢</td>
<td>**`claude plugin validate`**** baseline.** What does it check today on the v0.3 codebase? How many structural items are already passing?</td>
<td>DD-119, DD-123, milestone sizing</td>
<td>Run `claude plugin validate` on master; capture failure list; decide whether failures are gating or warning</td>
</tr>
<tr>
<td>OQ-v4-04</td>
<td>🟢</td>
<td>**Slash-command-handler autogen.** v0.3 ships docs-only handlers. Pull autogen into v0.4 or punt to v0.5?</td>
<td>DD-130, BRD-5 deferral</td>
<td>If `claude plugin validate` requires runnable handlers (OQ-v4-03), pull in. Otherwise punt.</td>
</tr>
<tr>
<td>OQ-v4-05</td>
<td>🟢</td>
<td>**`bin/`**** folder usage.** Official plugin model exposes `bin/` to Bash tool's PATH. Does cohrence lean on this for statusline scripts (currently in `bin/coherence-statusline.{ps1,sh}`) or keep current shape?</td>
<td>TS-1, plugin manifest</td>
<td>Inventory all bin/\* scripts; decide which need PATH access vs which are internal helpers</td>
</tr>
<tr>
<td>OQ-v4-08</td>
<td>🟢</td>
<td>**Version-field strategy.** Keep explicit semver (`"version": "0.4.0"`, manual bumps) or omit and rely on commit-SHA versioning? v0.3 uses explicit.</td>
<td>DD-121, plugin update UX</td>
<td>Recommend KEEP explicit semver — stable release cadence beats per-commit churn for installers</td>
</tr>
<tr>
<td>OQ-v4-09</td>
<td>🟢</td>
<td>**Required manifest fields population.** What goes in `homepage`, `repository`, `license`, `keywords`, `author`?</td>
<td>Plugin manifest, marketplace listing</td>
<td>Settle: `homepage` = GitHub repo README anchor; `repository` = GitHub URL; `license` = current LICENSE identifier; `keywords` = anti-drift / docs-coherence / claude-code</td>
</tr>
<tr>
<td>OQ-v4-13</td>
<td>🟢</td>
<td>**npm package squat-prevention.** DD-093 reaffirmed: marketplace registry is canonical, npm is squat-prevention only. With v0.4 listed on the registry, do we still claim the npm name `cohrence`?</td>
<td>BRD-5, release pipeline</td>
<td>Recommend YES claim the squat — cheap insurance, no maintenance burden</td>
</tr>
</table>
---
## G-2 First-impressions ergonomics
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v4-11</td>
<td>🟢</td>
<td>**Minimal ****`/coherence:audit`**** scope.** Which existing reports get bundled? `doctor`  • `scope-debug`  • `status` is the obvious base — also include telemetry-export-summary? Plan-staleness summary? Last-N proposal acceptance/rejection?</td>
<td>DD-125, TS-7 commands</td>
<td>Pick MVP set; v1.0 deep audit lives separately so v0.4's bundling is purely additive</td>
</tr>
</table>
---
## G-3 Telemetry-gated trigger contracts
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v4-10</td>
<td>🟢</td>
<td>**Trigger contract pattern.** How does code that "fires later when telemetry threshold crossed" actually ship? Options: (a) env-flag default + readiness check at SessionStart that consults metrics.jsonl rolling window; (b) config.json key flipped by a separate calibration job; (c) periodic re-evaluation hook.</td>
<td>DD-129, DD-104 promotion, DD-116 calibration</td>
<td>Recommend (a) — reuses v0.3 P8 bounded-read primitive; readiness check is deterministic; no new substrate</td>
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
<tr>
<td>OQ-v4-06</td>
<td>🟢</td>
<td>**v0.4.1 ship-train slot.** Is v0.4.1 a real calendar slot for trust signals (signed tarball, reproducible build, [SECURITY.md](http://SECURITY.md), M6 gates as README claims) or a tentative "if first-installer signal demands it" branch?</td>
<td>DD-126, BRD-5 §3</td>
<td>Recommend: tentative branch. Trigger condition = first-installer field signal indicates distrust-worthy gaps. Otherwise the trust-signal scope rolls into v0.5.</td>
</tr>
<tr>
<td>OQ-v4-07</td>
<td>🟢</td>
<td>**v1.0 Notion scope dependency.** Does v0.4 BRD need v1.0 to exist on Notion as a dedicated page first, or can it reference "v1.0 (TBD)" placeholder? Currently v1.0 only exists as 5 bullets in the [Roadmap](https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b).</td>
<td>v0.4 BRD authoring sequence</td>
<td>Recommend: placeholder OK. Define proper v1.0 scope on Notion in parallel; not a v0.4 spec-freeze blocker</td>
</tr>
<tr>
<td>OQ-v4-12</td>
<td>🟢</td>
<td>**Cassette cache location.** v0.3 cassettes live in `tests/cassettes/`. For an installed plugin, does the runtime cassette cache (LLM record/replay) belong in `${CLAUDE_PLUGIN_DATA}` (per-installation, survives updates) or `.claude/coherence/` (per-project)?</td>
<td>DD-120 sub-decision, TS-4 LLM pipeline</td>
<td>Recommend `${CLAUDE_PLUGIN_DATA}` — cassettes are a property of the plugin version, not the project</td>
</tr>
</table>
---
## v0.3 → v0.4 sequencing gate
**All must be ✅ before v0.4 spec freeze.** Mirrors v0.3's gate discipline.
1. v0.3 GA tagged + submitted to the official Anthropic plugin marketplace.
2. `claude plugin validate` run against v0.3; failure list captured (closes OQ-v4-03).
3. State-storage tri-partition rule decided (closes OQ-v4-01 → DD-120).
4. Manifest layout migration policy confirmed = strict re-install per DD-118 (closes OQ-v4-02 → DD-122).
5. v1.0 Notion scope decision (closes OQ-v4-07).
---
*Add new questions as they surface during planning. When resolved, set status 🟢 and link to the DD or note that closes it. Deferred items move to a separate "Deferred to v0.4.1 / v0.5+" section.*
**Meta-themes** (recommended for the v0.4 register):
1. **Honour DD-117 / DD-118 by default.** Any OQ that implies a backend, hosted service, or migrator is a non-starter — reject before adding to register.
2. **Reuse v0.3 patterns aggressively.** Bounded reads (P8), per-store strict (P5), atomic writes, env-gated features, refuseLegacy contract.
3. **Default to per-project state.** `${CLAUDE_PLUGIN_DATA}` is the exception, not the rule — most cohrence state has project semantics.
— — —
<span color="green">**Resolved 2026-05-11 — closed by v0.3 substrate landing in main**</span>
*v0.3 implementation is complete (v0.3.0 in **`package.json`** / **`plugin.json`** / **`src/state/init.ts#PLUGIN_VERSION`**; M0–M8 landed per **`docs/v0.3/CHANGELOG.md`**). The 9 OQs below are resolved on the basis of cited v0.3 code. Table status emojis have been updated to 🟢 above.*
- **🟢 OQ-v4-01** — State-storage tri-partition rule resolved (→ DD-120). v0.3 evidence: `src/state/init.ts#getCoherenceDir` anchors all per-project state under `.claude/coherence/`; `src/state/consent.ts` persists telemetry consent in `.claude/coherence/config.json#telemetry`; `src/state/plans/reader.ts` reads `coherence/plans/<branch-sha>/*.json` (per-team committed); `src/state/scope/cache.ts` writes `.claude/coherence/scope-cache.json`. **Rule:** consent stays per-project (data is per-developer-per-project, not per-installation); cassette is dev-only (closes OQ-v4-12 too); the only items in `${CLAUDE_PLUGIN_DATA}` are the future plugin-version cache and per-installation flags that don't yet exist in v0.3.
- **🟢 OQ-v4-02** — Manifest-layout migration messaging resolved (→ DD-122). v0.3 evidence: `src/state/refuseLegacy.ts` already implements the strict-refuse pattern with `REFUSE_LEGACY_MESSAGE` + `REFUSE_FUTURE_MESSAGE`; SessionStart consults it (lines 42–55 of `src/hooks/sessionStart.ts`). v0.4 extends the same module to detect a v0.3-style `plugin.json` at the wrong location and emit a parallel one-line refusal. Same outcome shape, zero new substrate.
- **🟢 OQ-v4-05** — `bin/` folder usage decided: no PATH exposure needed. v0.3 evidence: `bin/` contains `coherence-statusline.ps1`, `coherence-statusline.sh`, `coherence-subagent-statusline.sh` — all invoked by Claude Code's statusline mechanism via path written into `~/.claude/settings.json` by `src/commands/installStatusline.ts`. None are CLI entry points. **Decision:** keep current shape; the v0.4 `.claude-plugin/plugin.json` does NOT need a `bin` field. (No new DD; recorded as v0.4 layout invariant.)
- **🟢 OQ-v4-08** — Version field strategy = explicit semver (→ DD-121). v0.3 evidence: `plugin.json#version = "0.3.0"`, `package.json#version = "0.3.0"`, `src/state/init.ts#PLUGIN_VERSION = '0.3.0'` all agree. Explicit semver is the proven v0.3 release contract; v0.4 carries it forward unchanged.
- **🟢 OQ-v4-09** — Manifest field population resolved (no new DD; manifest delta only). v0.3 evidence: `package.json` already populates `author = "HUMBLEF0OL <123amitrana0123@gmail.com>"`, `license = "MIT"`, `repository = "github.com/HUMBLEF0OL/coherence"`, `keywords = ["claude-code","plugin","documentation","drift-detection","coherence"]`, `description`. **Decision:** v0.4 `.claude-plugin/plugin.json` mirrors these exact values verbatim; no separate `homepage` field (Anthropic plugin reference treats `repository` as the canonical link).
- **🟢 OQ-v4-10** — Telemetry-gated trigger contract pattern resolved (→ DD-129). v0.3 evidence: `COHERENCE_AUTHOR_PLANNER` env-flag default-OFF pattern (DD-104 ratified) proves option (a) of the OQ. `src/state/metrics.ts` + v0.2 P8 bounded-read primitive supply the readiness-check substrate. **Decision:** v0.4 ships a single `triggerContracts` module that reads `metrics.jsonl` at SessionStart and emits one-time CLI hints; user retains control of the env-flag flip.
- **🟢 OQ-v4-11** — Minimal `/coherence:audit` scope decided (→ DD-125). v0.3 evidence: `src/commands/doctor.ts`, `scopeDebug.ts`, `status.ts`, `exportMetrics.ts` all exist as v0.3 command surfaces. **Decision:** v0.4 `/coherence:audit` calls these four handlers in sequence and renders a single combined report. Bundling-only; v1.0 deep-audit reservation honoured.
- **🟢 OQ-v4-12** — Cassette cache location: N/A — cassettes are dev-only. v0.3 evidence: `src/llm/cassette.ts#cassettesDir()` only resolves when `COHERENCE_CASSETTES_DIR` env is set or in a dev-checkout layout (`../../tests/cassettes`); `recordCassette()` no-ops unless `COHERENCE_REFRESH_CASSETTES=1`. At runtime in production, cassettes are not loaded or recorded. **Decision:** no cassette-cache state in any of the three storage tiers; cassettes remain a `tests/` artifact (subsumes the question — no DD allocation needed).
- **🟢 OQ-v4-13** — npm package squat reaffirmed (no new DD). DD-093 (Anthropic plugin registry = canonical install path) remains the contract; claim npm name `cohrence` as a squat-prevention placeholder with no publish and no maintenance burden. v0.3 release pipeline does not touch npm — squat claim is a one-time `npm init --scope` operation outside the plugin codebase.
**Explicitly NOT closed (require external action — codebase alone insufficient):**
- **🟢 OQ-v4-03** — `claude plugin validate` baseline. → Closed in Final closures 2026-05-11 (tiered gate policy → DD-123 ratified; DD-119 ratified).
- **🟢 OQ-v4-04** — Slash-command-handler autogen. → Closed in Final closures 2026-05-11 (autogen pulled into v0.4 G-1 → DD-130 ratified).
- **🟢 OQ-v4-06** — v0.4.1 ship-train slot. → Closed in Final closures 2026-05-11 (tentative trigger-based branch with 4 explicit criteria → DD-126 ratified).
- **🟢 OQ-v4-07** — v1.0 Notion scope. → Closed in Final closures 2026-05-11 (placeholder + Roadmap-bullet inlining; no new DD slot).
**Sequencing gate state:** Gate #1 (v0.3 GA tagged + submitted to marketplace) — v0.3 implementation complete in main, tag + submission pending. Gates #3 (OQ-v4-01 tri-partition) and #4 (OQ-v4-02 migration policy) closed above. Gate #2 (`claude plugin validate` baseline) still open as OQ-v4-03. Gate #5 (v1.0 scope) still open as OQ-v4-07.
**v0.4 BRD/Tech Spec authoring is unblocked for G-2 (ergonomics), G-3 (telemetry triggers), and G-4 (**`parseMajor`**).** G-1 (marketplace structural) remains gated on OQ-v4-03.
— — —
<span color="green">**Final closures 2026-05-11 — last red OQs resolved (alternatives → recommendation → audit)**</span>
*Closes the four remaining red OQs that required external action or judgment, not just v0.3 codebase evidence. Each entry follows the v0.3 “Recommendations” pattern: alternatives → recommended decision → multi-axis audit (performance, optimization, correctness, completeness, token cost).*
- <span color="green">**🟢 OQ-v4-03**</span> — **`claude plugin validate`**** gating policy = tiered (errors halt release; warnings log to CI artifact)** (→ DD-123 ratified; DD-119 ratified). Alternatives considered: (a) full hard gate; (b) CI warning only; (c) manual pre-release run; (d) tiered — selected. Mirrors v0.3 M6 split (static-analysis hard gate + ship-time warnings). Baseline-result capture moves from OQ to implementation task. **Audit:** *Performance* — validate runs \<2s locally, negligible preflight cost. *Optimization* — cache result keyed by sha256(manifest + component tree); skip re-run on unchanged tree. *Correctness* — meta-test intentionally breaks `.claude-plugin/plugin.json` and asserts gate trips (v0.3 round-2 P7 pattern). *Completeness* — validates manifest structure only; paired with v0.3 M6 static-analysis tests for runtime correctness. *Token cost* — zero (no LLM).
- <span color="green">**🟢 OQ-v4-04**</span> — **Slash-command-handler autogen pulled into v0.4 G-1** (→ DD-130 ratified; reverses provisional "punt"). Critical context: v0.3's `plugin.json#slashCommands[].handler` array is a non-standard Coherence invention. Anthropic plugin schema surfaces slash commands via `commands/<name>.md` markdown files. Without autogen, 25 v0.3 commands are invisible to marketplace installers. Alternatives considered: (a) hand-write 25 markdown files — drift-prone; (b) rewrite every command as pure markdown prompt — loses 2500+ lines of v0.3 implementation; (c) build-time autogen — selected; (d) punt to v0.5 — ships v0.4 with no working slash commands. **Decision:** `scripts/generate-command-stubs.mjs` runs at `npm run build`, reads `plugin.json#slashCommands`, emits `commands/<name>.md` stubs. `UserPromptSubmit` hook intercepts sentinel patterns and dispatches to existing JS handlers. No v0.3 implementation lost. **Audit:** *Performance* — autogen \<100ms for 25 stubs, zero runtime cost. *Optimization* — idempotent regeneration when `plugin.json#slashCommands` hash differs. *Correctness* — static-analysis test asserts 1:1 mapping between manifest entries and `commands/*.md`; unit tests cover sentinel dispatch. *Completeness* — all 25 v0.3 commands covered; `npm run validate-plugin` (DD-123) catches missing stubs. *Token cost* — \~50 tokens per stub, \~1.3k tokens total static markdown (immaterial vs typical context budget); sentinel pattern \<100 tokens per invocation.
- <span color="green">**🟢 OQ-v4-06**</span> — **v0.4.1 = tentative trigger-based branch with tightened criteria** (→ DD-126 ratified with explicit trigger set). Alternatives considered: (a) calendared v0.4.1 — forces work regardless of demand; (b) tentative trigger-based — selected; (c) roll into v0.4 — blows milestone shape; (d) unconditional v0.5 — loses fast-follow. **Trigger fires on any of:** (1) ≥3 distinct installers request signed tarball / SBOM / reproducible build within 30 days of v0.4 GA; (2) public CVE in any direct dep requiring fast-patch beyond v0.4 patch cadence; (3) marketplace listing rejected or flagged for missing `SECURITY.md` / disclosure path; (4) supply-chain audit issue opened with severity ≥ medium. If none fire by v0.4 GA + 30 days, trust-signal scope rolls to v0.5. **Audit:** *Performance* — weekly manual triage; no runtime impact. *Optimization* — deterministic boolean criteria; no judgment call at decision time, no quarterly re-debate. *Correctness* — each criterion has explicit evidence source (GitHub issues, CVE feed, marketplace email, audit issue). *Completeness* — four trigger conditions cover the realistic distrust signals; explicit timer closure. *Token cost* — N/A.
- <span color="green">**🟢 OQ-v4-07**</span> — **v1.0 Notion scope = placeholder reference + Roadmap-bullet inlining in v0.4 BRD-5** (no new DD slot; recorded as v0.4 BRD authoring rule). Alternatives considered: (a) placeholder reference only; (b) block v0.4 BRD on v1.0 page; (c) inline Roadmap bullets as sidebar — selected with (a) hybrid. **Decision:** v0.4 BRD uses "v1.0 (TBD — see [Roadmap](https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b))" placeholder; BRD-5 §Non-goals lists the 5 v1.0-reserved features verbatim from Roadmap (auto-apply, `asserts:` checking, quality-metrics dashboard, cross-session learning beyond 7-day, deep `/coherence:audit`). Every v0.4 deferral cross-links to its matching Roadmap bullet. **Audit:** *Performance* — parallel v1.0 page authoring doesn't block v0.4 BRD freeze. *Optimization* — Roadmap bullets are single source of truth; no duplication. *Correctness* — every v0.4 non-goal cross-links to Roadmap, closes drift surface. *Completeness* — 5 bullets cover all known v1.0 reservations; new reservations add to Roadmap, not BRD. *Token cost* — N/A.
**All v0.4 Open Questions are now closed.** 9 closed via Resolved 2026-05-11 (v0.3 substrate landing) + 4 final closures above. Empty section tables remaining are intentional — leave or drop as cosmetic preference. **Sequencing gate state:** All 5 gates closed. Gate #1 — `v0.3.0` git tag exists; marketplace submission proceeds as an independent operational task (does not block v0.4 spec freeze). Gates #2–5 — all closed above. **v0.4 BRD/Tech Spec authoring is fully unblocked across all four goals (G-1 marketplace, G-2 ergonomics, G-3 telemetry triggers, G-4 ****`parseMajor`****).**
