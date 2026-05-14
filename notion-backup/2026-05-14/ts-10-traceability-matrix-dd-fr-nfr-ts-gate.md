<!-- url: https://www.notion.so/35b010d46a7081da8978d276d57b7836 -->
<!-- id: 35b010d4-6a70-81da-8978-d276d57b7836 -->
<!-- title: 🔗 TS-10 — Traceability Matrix (DD / FR / NFR ↔ TS ↔ Gate) -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Bidirectional traceability matrix: DD ↔ FR ↔ NFR ↔ TS-section ↔ BRD-4 Gate. Mirrors and extends [BRD-5 §5](https://www.notion.so/35b010d46a70816fa5cbf2da31f11bd4) by adding the **TS-section** column and routes for inherited v0.1 surfaces.
> **Note on DD numbering.** v0.2 ratifies **27** Design Decisions across the range DD-065..DD-092. **DD-079 is intentionally vacated** (withdrawn pre-freeze) and therefore does not appear in the matrix below. Tools that enumerate DD coverage (e.g. `scripts/changelog-dd-coverage.mjs`, RG-3) MUST treat DD-079 as an explicit allowlisted gap, not a missing row.
---
## 1. DD ↔ FR ↔ NFR ↔ TS ↔ Gate
<table header-row="true">
<tr>
<td>DD</td>
<td>Topic</td>
<td>FRs</td>
<td>NFRs</td>
<td>TS sections</td>
<td>Gates</td>
</tr>
<tr>
<td>DD-065</td>
<td>Author quarantine trust model</td>
<td>FR-AUTHOR-1, FR-PERMISSION-N1, FR-ANNOTATE-5</td>
<td>NFR-PRIVACY (inherited)</td>
<td>TS-1 §1, TS-2 §4, TS-6 §1</td>
<td>SG-3</td>
</tr>
<tr>
<td>DD-066</td>
<td>Trickle deep-scan + scan-cache directory</td>
<td>FR-TRICKLE-1..7</td>
<td>NFR-PERF-N3</td>
<td>TS-2 §1, TS-3 §3.4, TS-4 §6, TS-7 §1</td>
<td>FG-15, PG-3</td>
</tr>
<tr>
<td>DD-067</td>
<td>Author pipeline runs after Stop, no Stage 1 reuse</td>
<td>FR-AUTHOR-1..5</td>
<td>NFR-PERF-N1</td>
<td>TS-2 §1, TS-4 §4, TS-5 §1..§2, TS-7 §1</td>
<td>PG-1</td>
</tr>
<tr>
<td>DD-068</td>
<td>v0.1.1 telemetry amendment (3 hashed events)</td>
<td>FR-OBS-N1..N1e, FR-OBS-N2..N5, FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N1, N3, N4</td>
<td>TS-2 §1 (signatureHash), TS-4 §2§3, TS-6 §5, TS-7 §3</td>
<td>FG-12, SG-1, SG-1a, SG-1b</td>
</tr>
<tr>
<td>DD-069</td>
<td>Annotate anchor format + `auto-annotated: true`</td>
<td>FR-ANNOTATE-1..6</td>
<td>—</td>
<td>TS-1 §2, TS-5 §3</td>
<td>FG-4</td>
</tr>
<tr>
<td>DD-070</td>
<td>Statusline hybrid + install command</td>
<td>FR-STATUSLINE-1..7</td>
<td>NFR-PERF-N2, NFR-COMPAT-N3</td>
<td>TS-2 §1, TS-6 §6, TS-8 §5</td>
<td>FG-13</td>
</tr>
<tr>
<td>DD-071</td>
<td>OSC 8 + 3-tier graceful degradation</td>
<td>FR-STATUSLINE-5, FR-STATUSLINE-9</td>
<td>NFR-COMPAT-N2</td>
<td>TS-6 §7, TS-8 §3</td>
<td>FG-14</td>
</tr>
<tr>
<td>DD-072</td>
<td>Quarantine directory layout</td>
<td>FR-PROPOSE-1</td>
<td>NFR-RELIABILITY-N1</td>
<td>TS-3 §1, TS-3 §3.7</td>
<td>FG-9</td>
</tr>
<tr>
<td>DD-073</td>
<td>Annotate opt-in (global / denylist / per-doc)</td>
<td>FR-ANNOTATE-7..8, FR-PERMISSION-N4</td>
<td>NFR-PRIVACY-N2</td>
<td>TS-5 §3, TS-6 §4</td>
<td>FG-3</td>
</tr>
<tr>
<td>DD-074</td>
<td>`/coherence:graduate` scope mapping</td>
<td>FR-MODES-1..7</td>
<td>—</td>
<td>TS-1 §2, TS-2 §1, TS-3 §3.1</td>
<td>FG-2</td>
</tr>
<tr>
<td>DD-075</td>
<td>Proposal expiry (14 d / 7 d / N-ignored)</td>
<td>FR-PROPOSE-9, FR-PROPOSE-11..12, FR-PROPOSE-14</td>
<td>—</td>
<td>TS-4 §1, TS-7 §3</td>
<td>FG-11</td>
</tr>
<tr>
<td>DD-076</td>
<td>Bash repetition threshold</td>
<td>FR-AUTHOR-6..7</td>
<td>NFR-PERF-N5</td>
<td>TS-2 §1, TS-4 §3, TS-9 §7</td>
<td>FG-5</td>
</tr>
<tr>
<td>DD-077</td>
<td>File-creation pattern threshold</td>
<td>FR-AUTHOR-8..9</td>
<td>NFR-PERF-N5</td>
<td>TS-2 §1, TS-4 §3, TS-9 §7</td>
<td>FG-6</td>
</tr>
<tr>
<td>DD-078</td>
<td>Agent-correction threshold (invocation-aggregate, OQ-v2-24)</td>
<td>FR-AUTHOR-10..12</td>
<td>NFR-PERF-N6</td>
<td>TS-2 §1, TS-4 §5, TS-9 §7</td>
<td>FG-7</td>
</tr>
<tr>
<td>DD-080</td>
<td>Single coordinated v1→v2 migrator</td>
<td>FR-FAILURE-N1..N2, FR-COST-N1, FR-TRICKLE-1</td>
<td>NFR-RELIABILITY-N1</td>
<td>TS-3 §2§5, TS-4 §1, TS-8 §2</td>
<td>FG-1</td>
</tr>
<tr>
<td>DD-081</td>
<td>Proposal slash-command set</td>
<td>FR-PROPOSE-4..7, FR-COMMANDS</td>
<td>NFR-OBS-N1</td>
<td>TS-2 §1, TS-6 §2</td>
<td>(covered FG-4..10)</td>
</tr>
<tr>
<td>DD-082</td>
<td>Name-collision policy</td>
<td>FR-PROPOSE-10, FR-AUTHOR-1, FR-PRIVACY-N1</td>
<td>—</td>
<td>TS-5 §2.3, TS-6 §2</td>
<td>FG-9</td>
</tr>
<tr>
<td>DD-083</td>
<td>Revert via `git revert` · `revertDetect` reuse</td>
<td>FR-PROPOSE-8</td>
<td>NFR-OBS-N1</td>
<td>TS-2 §2, TS-6 §3, TS-8 §6</td>
<td>FG-10</td>
</tr>
<tr>
<td>DD-084</td>
<td>Snapshot debounced writer</td>
<td>FR-STATUSLINE-7</td>
<td>NFR-PERF-N4</td>
<td>TS-2 §1, TS-4 §3, TS-7 §1</td>
<td>PG-2</td>
</tr>
<tr>
<td>DD-085</td>
<td>Unified per-session cost ceiling × 1.30</td>
<td>FR-COST-N2..N4</td>
<td>NFR-COST-N1..N2</td>
<td>TS-5 §2.4, TS-7 §2</td>
<td>CG-1..3</td>
</tr>
<tr>
<td>DD-086</td>
<td>`share-metrics` redaction extension</td>
<td>FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N1</td>
<td>TS-6 §5.4</td>
<td>FG-16, SG-2</td>
</tr>
<tr>
<td>DD-087</td>
<td>`proposal.schema.json`</td>
<td>FR-PROPOSE-13</td>
<td>NFR-RELIABILITY-N1</td>
<td>TS-3 §3.6, TS-5 §2.2..§2.3</td>
<td>(state-files row, BRD-4 §1)</td>
</tr>
<tr>
<td>DD-088</td>
<td>`proposal-cache.json` schema + lifecycle FSM</td>
<td>FR-PROPOSE-2..3, FR-FAILURE-N3</td>
<td>NFR-RELIABILITY-N2, NFR-OBS-N2</td>
<td>TS-3 §3.2, TS-4 §8</td>
<td>FG-8</td>
</tr>
<tr>
<td>DD-089</td>
<td>`signal-cache.json` discriminated union</td>
<td>FR-AUTHOR-13..14</td>
<td>NFR-RELIABILITY-N3</td>
<td>TS-2 §1, TS-3 §3.3, TS-4 §5</td>
<td>(covered FG-5..7)</td>
</tr>
<tr>
<td>DD-090</td>
<td>`host-capabilities.json` v0.2 fields</td>
<td>FR-STATUSLINE-8</td>
<td>NFR-COMPAT-N1..N2</td>
<td>TS-3 §2, TS-8 §4</td>
<td>(covered FG-13..14)</td>
</tr>
<tr>
<td>DD-091</td>
<td>Author/Annotate LLM contract + cost partition</td>
<td>FR-COST-N1, FR-COST-N5..N6</td>
<td>NFR-MAINT-N2</td>
<td>TS-3 §4, TS-5 §4</td>
<td>(covered CG-2)</td>
</tr>
<tr>
<td>DD-092</td>
<td>v0.2.1 calibration commitment</td>
<td>(constants only)</td>
<td>NFR-MAINT-N1</td>
<td>TS-9 §7</td>
<td>RG-5</td>
</tr>
</table>
## 2. FR → TS index (forward lookup)
<table header-row="true">
<tr>
<td>FR domain</td>
<td>TS sections</td>
</tr>
<tr>
<td>FR-MODES</td>
<td>TS-1 §2, TS-2 §1, TS-3 §3.1, TS-4 §1, TS-7 §4</td>
</tr>
<tr>
<td>FR-ANNOTATE</td>
<td>TS-1 §2, TS-5 §3, TS-6 §4</td>
</tr>
<tr>
<td>FR-AUTHOR</td>
<td>TS-2 §1, TS-4 §3§4§5, TS-5 §1§2, TS-7 §1§2</td>
</tr>
<tr>
<td>FR-PROPOSE</td>
<td>TS-2 §1, TS-3 §3.2, TS-4 §1§8, TS-6 §2§3, TS-7 §3</td>
</tr>
<tr>
<td>FR-STATUSLINE</td>
<td>TS-2 §1, TS-3 §3.5, TS-6 §6§7, TS-8 §3§4§5</td>
</tr>
<tr>
<td>FR-TRICKLE</td>
<td>TS-2 §1, TS-3 §3.4, TS-4 §3§6, TS-7 §1</td>
</tr>
<tr>
<td>FR-OBS</td>
<td>TS-4 §2§3§4, TS-6 §5, TS-7 §3</td>
</tr>
<tr>
<td>FR-COST</td>
<td>TS-3 §2§4, TS-5 §2.4§3.4, TS-7 §2</td>
</tr>
<tr>
<td>FR-PERMISSION</td>
<td>TS-2 §4, TS-6 §1§2§3§4</td>
</tr>
<tr>
<td>FR-COMMANDS</td>
<td>TS-2 §1, TS-6 §2§3§6</td>
</tr>
<tr>
<td>FR-FAILURE</td>
<td>TS-3 §2§5, TS-4 §8, TS-8 §2</td>
</tr>
<tr>
<td>FR-PRIVACY</td>
<td>TS-6 §5</td>
</tr>
</table>
## 3. NFR → TS index
<table header-row="true">
<tr>
<td>NFR</td>
<td>TS sections</td>
</tr>
<tr>
<td>NFR-PERF-N1..N6</td>
<td>TS-4 §3§5§6, TS-5 §2.5, TS-7 §1§6</td>
</tr>
<tr>
<td>NFR-COST-N1..N2</td>
<td>TS-5 §2.4, TS-7 §2</td>
</tr>
<tr>
<td>NFR-PRIVACY-N1..N4</td>
<td>TS-6 §5</td>
</tr>
<tr>
<td>NFR-RELIABILITY-N1..N3</td>
<td>TS-3 §5, TS-4 §8</td>
</tr>
<tr>
<td>NFR-OBS-N1..N2</td>
<td>TS-6 §2§3, TS-7 §3</td>
</tr>
<tr>
<td>NFR-COMPAT-N1..N3</td>
<td>TS-3 §2, TS-8 §4</td>
</tr>
<tr>
<td>NFR-MAINT-N1..N2</td>
<td>TS-5 §4, TS-9 §7</td>
</tr>
</table>
## 4. Gate → TS index
<table header-row="true">
<tr>
<td>Gate</td>
<td>TS section(s)</td>
</tr>
<tr>
<td>FG-1</td>
<td>TS-3 §2, TS-8 §2</td>
</tr>
<tr>
<td>FG-2</td>
<td>TS-2 §1, TS-3 §3.1</td>
</tr>
<tr>
<td>FG-3</td>
<td>TS-5 §3, TS-6 §4</td>
</tr>
<tr>
<td>FG-4</td>
<td>TS-5 §3</td>
</tr>
<tr>
<td>FG-5..7</td>
<td>TS-2 §1, TS-4 §3§5</td>
</tr>
<tr>
<td>FG-8</td>
<td>TS-3 §3.2, TS-4 §8</td>
</tr>
<tr>
<td>FG-9</td>
<td>TS-6 §2</td>
</tr>
<tr>
<td>FG-10</td>
<td>TS-6 §3, TS-8 §6</td>
</tr>
<tr>
<td>FG-11</td>
<td>TS-4 §1</td>
</tr>
<tr>
<td>FG-12</td>
<td>TS-4 §2§3, TS-6 §5.3</td>
</tr>
<tr>
<td>FG-13</td>
<td>TS-6 §6, TS-8 §5</td>
</tr>
<tr>
<td>FG-14</td>
<td>TS-6 §7, TS-8 §3§4</td>
</tr>
<tr>
<td>FG-15</td>
<td>TS-4 §6, TS-7 §1</td>
</tr>
<tr>
<td>FG-16</td>
<td>TS-6 §5.4</td>
</tr>
<tr>
<td>PG-1..5</td>
<td>TS-7 §1§6, TS-9 §3</td>
</tr>
<tr>
<td>CG-1..3</td>
<td>TS-5 §2.4, TS-7 §2, TS-9 §4</td>
</tr>
<tr>
<td>SG-1..3</td>
<td>TS-6 §5, TS-9 §5</td>
</tr>
<tr>
<td>RG-1..5</td>
<td>TS-8 §7, TS-9 §6§7</td>
</tr>
</table>
## 5. v0.1 surface reuse → TS index
<table header-row="true">
<tr>
<td>v0.1 module</td>
<td>TS section(s) referencing it</td>
</tr>
<tr>
<td>`PathFilter`</td>
<td>TS-2 §2, TS-6 §4</td>
</tr>
<tr>
<td>StateStore atomic-write / lock-manager / quarantine</td>
<td>TS-2 §2, TS-3 §5, TS-4 §8</td>
</tr>
<tr>
<td>CostLedger</td>
<td>TS-3 §2, TS-5 §2.4, TS-7 §2</td>
</tr>
<tr>
<td>`revertDetect`</td>
<td>TS-2 §2, TS-6 §3, TS-8 §6</td>
</tr>
<tr>
<td>`SubagentAttribution`</td>
<td>TS-2 §2, TS-4 §5</td>
</tr>
<tr>
<td>Stage 1 / Stage 2 healing</td>
<td>TS-1 §4, TS-4 §4, TS-5 §1</td>
</tr>
<tr>
<td>`coherence/ignore`</td>
<td>TS-2 §2, TS-6 §4</td>
</tr>
<tr>
<td>`shareMetrics.anonymizeRecord`</td>
<td>TS-6 §5.4</td>
</tr>
<tr>
<td>`hostCapabilitiesProbe`</td>
<td>TS-3 §2, TS-8 §4</td>
</tr>
</table>
## 6. Open Questions ↔ resolved-in-TS
Where a v0.2 OQ resolution affected a TS contract, the resolution lives in the slice noted below.
<table header-row="true">
<tr>
<td>Open Question</td>
<td>Resolution location</td>
</tr>
<tr>
<td>OQ-v2-19 (annotate vs ignore)</td>
<td>TS-5 §3.1, TS-6 §4</td>
</tr>
<tr>
<td>OQ-v2-22 (consecutive-ignored counter reset)</td>
<td>TS-3 §3.2, TS-4 §1 (FR-PROPOSE-9)</td>
</tr>
<tr>
<td>OQ-v2-24 (DD-078 invocation-aggregate)</td>
<td>TS-2 §1, TS-4 §5</td>
</tr>
<tr>
<td>OQ-v2-30 (scan-cache shape)</td>
<td>TS-3 §3.4</td>
</tr>
</table>
