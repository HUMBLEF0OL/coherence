<!-- url: https://www.notion.so/35b010d46a70816fa5cbf2da31f11bd4 -->
<!-- id: 35b010d4-6a70-816f-a5cb-f2da31f11bd4 -->
<!-- title: ⚠️ BRD-5 — Risks, Dependencies, Out-of-Scope -->
**Parent:** [📘 BRD](https://www.notion.so/35b010d46a7081718781cd2cb908ac52) · **Status:** Draft 1 · 2026-05-09
---
## 1. Risk Register (R-v0.2)
<table header-row="true">
<tr>
<td>Risk</td>
<td>Mitigation</td>
<td>DD</td>
</tr>
<tr>
<td>**R-v0.2-01** Author proposals misjudged → noise erodes the trust v0.1 built</td>
<td>DD-065 quarantine + DD-067 hard cap (≤ 3 / session) + DD-085 cost ceiling + DD-075 expiry + DD-092 calibration patch</td>
<td>65/67/75/85/92</td>
</tr>
<tr>
<td>**R-v0.2-02** v0.1 PostToolUse 50 ms p95 budget regresses</td>
<td>DD-084 debounced snapshot writer; DD-078 SessionEnd-deferred correction signal; DD-066 idle-gated trickle; PG-2 / PG-4 regression-gate cells</td>
<td>84/78/66</td>
</tr>
<tr>
<td>**R-v0.2-03** v1 → v2 migration corrupts v0.1 state</td>
<td>DD-080 single atomic migrator; FR-FAILURE-N2 quarantine-and-continue; FG-1 fixture</td>
<td>80</td>
</tr>
<tr>
<td>**R-v0.2-04** DD-068 hash collisions leak content via signal aggregation</td>
<td>SHA-256 12-hex (48-bit), bound verified by SG-1 corpus test</td>
<td>68</td>
</tr>
<tr>
<td>**R-v0.2-05** Annotate mode silently mutates user-owned docs</td>
<td>DD-065 quarantine; FR-ANNOTATE-5 explicit accept gate; `auto-annotated: true` discriminator (DD-069)</td>
<td>65/69</td>
</tr>
<tr>
<td>**R-v0.2-06** Statusline `statusLine` install corrupts user `~/.claude/settings.json`</td>
<td>DD-070 explicit confirmation + automatic backup; `/coherence:uninstall-statusline` reversal</td>
<td>70</td>
</tr>
<tr>
<td>**R-v0.2-07** OSC 8 click affordance produces garbled badges in unsupported terminals</td>
<td>DD-071 single-segment OSC 8 wrap + 3-tier graceful degradation; `host-capabilities.url_scheme_handler` probe</td>
<td>71</td>
</tr>
<tr>
<td>**R-v0.2-08** Author + Annotate cost stack pushes session over budget</td>
<td>DD-085 unified ceiling × 1.30; per-feature partition; degrade-to-no-LLM mode (DD-061 precedent)</td>
<td>85</td>
</tr>
<tr>
<td>**R-v0.2-09** Proposal queue grows unboundedly</td>
<td>DD-075 three-fence expiry; DD-088 terminal states; expiry sweep at SessionStart</td>
<td>75/88</td>
</tr>
<tr>
<td>**R-v0.2-10** Subagent provenance shape (per-line vs per-invocation) blocks DD-078</td>
<td>OQ-v2-24 reformulation: invocation-aggregate ratio + `files_touched` overlap; FR-AUTHOR-10 codifies the shipped shape</td>
<td>78 (OQ-v2-24)</td>
</tr>
<tr>
<td>**R-v0.2-11** v0.2-alpha consolidation feedback contradicts the no-planner choice</td>
<td>DD-067 staged adoption — Proposer planner stage may land in v0.2 final without spec churn</td>
<td>67</td>
</tr>
<tr>
<td>**R-v0.2-12** Cross-session `prior_response_id` leakage</td>
<td>FR-OBS-N2 explicit cache clear at SessionStart / SessionEnd; regression test (FG-12)</td>
<td>68 audit</td>
</tr>
</table>
## 2. v0.1 Dependency Surface
Validated before v0.2 spec freeze:
<table header-row="true">
<tr>
<td>Dependency</td>
<td>Resolution</td>
</tr>
<tr>
<td>PostToolUse buffer schema (drift-buffer)</td>
<td>Trickle deep-scan extends `BufferEntry.source` enum only (DD-066, DD-080)</td>
</tr>
<tr>
<td>Stop pipeline plan JSON</td>
<td>Author pipeline runs **after** Stop and does **not** reuse Stage 1 (DD-067)</td>
</tr>
<tr>
<td>Telemetry events — bash / prompt / response</td>
<td>Shipped as **v0.1.1 patch** (DD-068, implemented 2026-05-09)</td>
</tr>
<tr>
<td>Frontmatter contract</td>
<td>Annotate uses v0.1 byte-for-byte format + `auto-annotated: true` (DD-069)</td>
</tr>
<tr>
<td>Subagent provenance</td>
<td>DD-078 reformulated against shipped invocation-aggregate shape (OQ-v2-24)</td>
</tr>
<tr>
<td>Lock manager / atomic-write / quarantine</td>
<td>Reused unchanged for all 5 new v0.2 state files (NFR-RELIABILITY-N1)</td>
</tr>
<tr>
<td>`revertDetect` (`src/detection/revertDetect.ts`)</td>
<td>Picks up `[coherence-revert]` commits without modification (DD-083)</td>
</tr>
<tr>
<td>`coherence/ignore` / `PathFilter`</td>
<td>Single privacy boundary; per-doc Annotate respects it (DD-073, FR-ANNOTATE-8)</td>
</tr>
<tr>
<td>v0.1 Stage 1/2 prompts (`prompts/v1/`)</td>
<td>Unchanged; ship side-by-side with `prompts/v2/` (DD-091)</td>
</tr>
</table>
## 3. Out-of-Scope (deferred to v0.3+)
- **Auto-apply / graduated trust ladder** for accepted proposals → v1.0 candidate at the earliest (DD-065).
- **Egress / opt-in HTTPS upload** of anonymised metrics — file-write surface only ships in v0.2; HTTPS upload deferred to v0.3 (DD-086, provisional `/coherence:upload-metrics`).
- **Plugin marketplace packaging, team-shared ****`coherence-ignore`****, monorepo ****`scope:`**** declarations** → v0.3.
- **Cross-session pattern learning beyond a single 7-day rolling window** → v1.0 (requires explicit opt-in).
- **`/coherence:audit`**** + assertion checking** → v1.0.
- **`/coherence:de-annotate`** (rollback of Annotate-mode anchors via the `auto-annotated: true` discriminator) → v0.3.
- **Per-file scan tombstones** under `scan-cache/<hash>.json` → v0.3 (directory shape reserved by DD-066 amendment).
- **Author-pipeline planner / proposal consolidation stage** — ships in v0.2 *final* **only if** v0.2-alpha telemetry shows that consolidation has measurable value. Concrete trigger: ≥ 25% of `propose-accept` / `propose-reject` actions during v0.2-alpha span ≥ 2 distinct signal kinds (`bash_repetition`, `file_creation`, `agent_correction`) within a 30-minute window of each other. Below that threshold the no-planner shape ships in v0.2 final and the planner stage is reconsidered no earlier than v0.3 (DD-067 staged adoption).
## 4. Glossary (v0.2 additions)
<table header-row="true">
<tr>
<td>Term</td>
<td>Meaning</td>
</tr>
<tr>
<td>**Observe mode**</td>
<td>v0.1 default. Plugin watches but proposes neither annotations nor net-new artifacts.</td>
</tr>
<tr>
<td>**Annotate mode**</td>
<td>Plugin proposes anchor / frontmatter injections for anchor-less docs in scope. No file mutation without explicit accept.</td>
</tr>
<tr>
<td>**Author mode**</td>
<td>Plugin proposes net-new skills / agents / slash commands when DD-076/077/078 signals fire. No file mutation without explicit accept.</td>
</tr>
<tr>
<td>**Proposal**</td>
<td>Quarantined candidate artifact materialised under `.claude/coherence/proposals/<kind>/<id>/` with lifecycle managed by `proposal-cache.json` (DD-088 FSM).</td>
</tr>
<tr>
<td>**Quarantine (DD-065)**</td>
<td>Trust-isolation directory for proposals. Distinct from v0.1 `quarantine/` (state corruption recovery) — different depths, different artefacts (see DD-072).</td>
</tr>
<tr>
<td>**Author signal**</td>
<td>A privacy-safe pattern observed in v0.1 telemetry that exceeds DD-076 / DD-077 / DD-078 threshold and triggers Author-pipeline invocation.</td>
</tr>
<tr>
<td>**Annotation proposal**</td>
<td>A proposal of `kind = annotation` carrying a candidate anchor / frontmatter set for an anchor-less doc.</td>
</tr>
<tr>
<td>**Trickle pass**</td>
<td>An idle-gated background scan over not-recently-touched files emitting low-confidence buffer entries with `source = trickle_deep_scan`.</td>
</tr>
<tr>
<td>**Statusline badge**</td>
<td>The terse `🧭 <mode>  N⚠  [M proposals]` rendering in Claude Code's ambient statusline area, fed by `state-snapshot.json` via the user-installed script.</td>
</tr>
<tr>
<td>**Graduation**</td>
<td>A scoped mode flip via `/coherence:graduate`. Persisted in `graduation.json`. Most-specific scope wins.</td>
</tr>
<tr>
<td>**Calibration patch**</td>
<td>The DD-092-committed v0.2.1 numerical tuning of DD-076/077/078 thresholds against opt-in telemetry. Constants-only change; no schema bump.</td>
</tr>
</table>
## 5. Traceability — DD ↔ FR / NFR / Gate
<table header-row="true">
<tr>
<td>DD</td>
<td>Topic</td>
<td>FRs</td>
<td>NFRs</td>
<td>Gates</td>
</tr>
<tr>
<td>DD-065</td>
<td>Author quarantine trust model</td>
<td>FR-AUTHOR-1, FR-PERMISSION-N1, FR-ANNOTATE-5</td>
<td>NFR-PRIVACY (inherited)</td>
<td>SG-3</td>
</tr>
<tr>
<td>DD-066</td>
<td>Trickle deep-scan + scan-cache directory</td>
<td>FR-TRICKLE-1..7</td>
<td>NFR-PERF-N3</td>
<td>FG-15, PG-3</td>
</tr>
<tr>
<td>DD-067</td>
<td>Author pipeline runs after Stop, no Stage 1 reuse</td>
<td>FR-AUTHOR-1..5</td>
<td>NFR-PERF-N1</td>
<td>PG-1</td>
</tr>
<tr>
<td>DD-068</td>
<td>v0.1.1 telemetry amendment (3 hashed events)</td>
<td>FR-OBS-N1..N1e, FR-OBS-N2..N5, FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N1, NFR-PRIVACY-N3, NFR-PRIVACY-N4</td>
<td>FG-12, SG-1, SG-1a, SG-1b</td>
</tr>
<tr>
<td>DD-069</td>
<td>Annotate anchor format + `auto-annotated: true`</td>
<td>FR-ANNOTATE-1..6</td>
<td>—</td>
<td>FG-4</td>
</tr>
<tr>
<td>DD-070</td>
<td>Statusline hybrid + install command</td>
<td>FR-STATUSLINE-1..7</td>
<td>NFR-PERF-N2, NFR-COMPAT-N3</td>
<td>FG-13</td>
</tr>
<tr>
<td>DD-071</td>
<td>OSC 8 + 3-tier graceful degradation</td>
<td>FR-STATUSLINE-5, FR-STATUSLINE-9</td>
<td>NFR-COMPAT-N2</td>
<td>FG-14</td>
</tr>
<tr>
<td>DD-072</td>
<td>Quarantine directory layout</td>
<td>FR-PROPOSE-1</td>
<td>NFR-RELIABILITY-N1</td>
<td>FG-9</td>
</tr>
<tr>
<td>DD-073</td>
<td>Annotate opt-in (global / denylist / per-doc)</td>
<td>FR-ANNOTATE-7..8, FR-PERMISSION-N4</td>
<td>NFR-PRIVACY-N2</td>
<td>FG-3</td>
</tr>
<tr>
<td>DD-074</td>
<td>`/coherence:graduate` scope mapping</td>
<td>FR-MODES-1..7</td>
<td>—</td>
<td>FG-2</td>
</tr>
<tr>
<td>DD-075</td>
<td>Proposal expiry (14 d / 7 d / N-ignored)</td>
<td>FR-PROPOSE-9, FR-PROPOSE-11..12, FR-PROPOSE-14</td>
<td>—</td>
<td>FG-11</td>
</tr>
<tr>
<td>DD-076</td>
<td>Bash repetition threshold</td>
<td>FR-AUTHOR-6..7</td>
<td>NFR-PERF-N5</td>
<td>FG-5</td>
</tr>
<tr>
<td>DD-077</td>
<td>File-creation pattern threshold</td>
<td>FR-AUTHOR-8..9</td>
<td>NFR-PERF-N5</td>
<td>FG-6</td>
</tr>
<tr>
<td>DD-078</td>
<td>Agent-correction threshold (invocation-aggregate)</td>
<td>FR-AUTHOR-10..12</td>
<td>NFR-PERF-N6</td>
<td>FG-7</td>
</tr>
<tr>
<td>DD-079</td>
<td>**Vacated** (withdrawn pre-freeze; intentionally absent from the active register). Allowlisted in `scripts/changelog-dd-coverage.mjs` per RG-3.</td>
<td>—</td>
<td>—</td>
<td>—</td>
</tr>
<tr>
<td>DD-080</td>
<td>Single coordinated v1 → v2 migrator</td>
<td>FR-FAILURE-N1..N2, FR-COST-N1</td>
<td>NFR-RELIABILITY-N1</td>
<td>FG-1</td>
</tr>
<tr>
<td>DD-081</td>
<td>Proposal slash-command set</td>
<td>FR-PROPOSE-4..7, FR-COMMANDS</td>
<td>NFR-OBS-N1</td>
<td>(covered by FG-4..10)</td>
</tr>
<tr>
<td>DD-082</td>
<td>Name-collision policy</td>
<td>FR-PROPOSE-10, FR-AUTHOR-1, FR-PRIVACY-N1</td>
<td>—</td>
<td>FG-9</td>
</tr>
<tr>
<td>DD-083</td>
<td>Revert via `git revert`  • `revertDetect` reuse</td>
<td>FR-PROPOSE-8</td>
<td>NFR-OBS-N1</td>
<td>FG-10</td>
</tr>
<tr>
<td>DD-084</td>
<td>Snapshot debounced writer</td>
<td>FR-STATUSLINE-7</td>
<td>NFR-PERF-N4</td>
<td>PG-2</td>
</tr>
<tr>
<td>DD-085</td>
<td>Unified per-session cost ceiling × 1.30</td>
<td>FR-COST-N2..N4</td>
<td>NFR-COST-N1..N2</td>
<td>CG-1..3</td>
</tr>
<tr>
<td>DD-086</td>
<td>`share-metrics` redaction extension</td>
<td>FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N1</td>
<td>FG-16, SG-2</td>
</tr>
<tr>
<td>DD-087</td>
<td>`proposal.schema.json`</td>
<td>FR-PROPOSE-13</td>
<td>NFR-RELIABILITY-N1</td>
<td>State-files row in BRD-4 §1</td>
</tr>
<tr>
<td>DD-088</td>
<td>`proposal-cache.json` schema + lifecycle FSM</td>
<td>FR-PROPOSE-2..3, FR-FAILURE-N3</td>
<td>NFR-RELIABILITY-N2, NFR-OBS-N2</td>
<td>FG-8</td>
</tr>
<tr>
<td>DD-089</td>
<td>`signal-cache.json` discriminated union</td>
<td>FR-AUTHOR-13..14 (referenced by FR-AUTHOR-7..11)</td>
<td>NFR-RELIABILITY-N3</td>
<td>(covered by FG-5..7)</td>
</tr>
<tr>
<td>DD-090</td>
<td>`host-capabilities.json` v0.2 fields</td>
<td>FR-STATUSLINE-8</td>
<td>NFR-COMPAT-N1..N2</td>
<td>(covered by FG-13..14)</td>
</tr>
<tr>
<td>DD-091</td>
<td>Author/Annotate LLM contract + cost partition</td>
<td>FR-COST-N1, FR-COST-N5..N6</td>
<td>NFR-MAINT-N2</td>
<td>(covered by CG-2)</td>
</tr>
<tr>
<td>DD-092</td>
<td>v0.2.1 calibration commitment</td>
<td>(constants only)</td>
<td>NFR-MAINT-N1</td>
<td>RG-5</td>
</tr>
</table>
