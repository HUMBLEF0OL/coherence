<!-- url: https://www.notion.so/35b010d46a70814da24cf2282be2f310 -->
<!-- id: 35b010d4-6a70-814d-a24c-f2282be2f310 -->
<!-- title: TS-10 — Traceability Matrix (FR / NFR / DD ↔ TS) -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
> Bidirectional matrix mapping every BRD-2 functional requirement, BRD-3 non-functional requirement, and BRD-4 acceptance gate to the TS slice that designs it. Design Decisions (DD-001..DD-064) are surfaced inline alongside the requirements they motivate.
## 10.1 Functional Requirements → TS Slice (BRD-2)
<table header-row="true">
<tr>
<td>FR</td>
<td>Subject</td>
<td>TS slice / section</td>
<td>DDs</td>
</tr>
<tr>
<td>FR-INSTALL-1..7</td>
<td>Install, doctor, version, kill-switch</td>
<td>TS-8 §8.1, §8.4; TS-6 §6.5</td>
<td>DD-019, DD-029, DD-043, DD-050, DD-062, DD-064</td>
</tr>
<tr>
<td>FR-DETECT-1..6</td>
<td>PostToolUse path filter, buffer schema, anchors, re-validation</td>
<td>TS-4 §4.3; TS-3 §3.3, §3.4; TS-2 §2.7</td>
<td>DD-007, DD-025, DD-026, DD-029, DD-045, DD-050</td>
</tr>
<tr>
<td>FR-DETECT-7..8</td>
<td>SubagentStop output-use signal + file-level fallback</td>
<td>TS-2 §2.4; TS-4 §4.5</td>
<td>DD-013, DD-022, DD-062</td>
</tr>
<tr>
<td>FR-DETECT-9..10</td>
<td>Mid-session branch / compaction handling</td>
<td>TS-4 §4.3 step 5; TS-4 §4.8</td>
<td>DD-020, DD-024, DD-039, DD-044</td>
</tr>
<tr>
<td>FR-DETECT-11..12</td>
<td>`<!-- coherence-pending -->` finalize sweep + anchor integrity</td>
<td>TS-4 §4.2 steps 3-4</td>
<td>DD-007, DD-038, DD-045, DD-053</td>
</tr>
<tr>
<td>FR-DETECT-13</td>
<td>Canonical-path discovery scope</td>
<td>TS-3 §3.4</td>
<td>DD-040</td>
</tr>
<tr>
<td>FR-DETECT-14</td>
<td>Revert detection (≥80% line removal)</td>
<td>TS-4 §4.2 step 7; TS-6 §6.1 velocity</td>
<td>DD-011, DD-035</td>
</tr>
<tr>
<td>FR-DETECT-15</td>
<td>Section-ref normalisation</td>
<td>TS-3 §3.4</td>
<td>DD-007, DD-027</td>
</tr>
<tr>
<td>FR-DETECT-16</td>
<td>2-message keyword classifier window</td>
<td>TS-2 §2.4; TS-4 §4.5</td>
<td>DD-013, DD-034</td>
</tr>
<tr>
<td>FR-DETECT-17</td>
<td>Subagent line-level provenance</td>
<td>TS-2 §2.4; TS-3 §3.12</td>
<td>DD-011, DD-013, DD-035</td>
</tr>
<tr>
<td>FR-MIDSESSION-1..1c</td>
<td>Silent context refresh + section-set hash + compaction detection</td>
<td>TS-4 §4.3, §4.10</td>
<td>DD-012, DD-020, DD-024, DD-039</td>
</tr>
<tr>
<td>FR-MIDSESSION-2..4</td>
<td>Long-turn detection, conversational mention, never block hot path</td>
<td>TS-4 §4.4</td>
<td>DD-012, DD-061</td>
</tr>
<tr>
<td>FR-MIDSESSION-5..6</td>
<td>`/coherence:review` and `--estimate`</td>
<td>TS-2 §2.8; TS-5 §5.6</td>
<td>DD-021, DD-046</td>
</tr>
<tr>
<td>FR-STOP-1..3</td>
<td>Trigger grouping + Stage 1 planner + plan validation</td>
<td>TS-2 §2.5 steps 2-5; TS-5 §5.3</td>
<td>DD-008, DD-009, DD-015, DD-025, DD-049</td>
</tr>
<tr>
<td>FR-STOP-4..5</td>
<td>Stage 2 patch writers + outputs enum</td>
<td>TS-5 §5.4</td>
<td>DD-008, DD-033, DD-042</td>
</tr>
<tr>
<td>FR-STOP-6, 6b, 6c</td>
<td>Validation pipeline + change-class recount + per-language hallucination tiers</td>
<td>TS-5 §5.5</td>
<td>DD-008, DD-017, DD-032, DD-047, DD-058</td>
</tr>
<tr>
<td>FR-STOP-7</td>
<td>Loose-tier demotion of change-class</td>
<td>TS-5 §5.5 step 5</td>
<td>DD-058</td>
</tr>
<tr>
<td>FR-STOP-8..9</td>
<td>File-level merge + bundle atomicity</td>
<td>TS-2 §2.5 steps 9-10; TS-6 §6.1</td>
<td>DD-008</td>
</tr>
<tr>
<td>FR-STOP-10..11</td>
<td>Hard caps + canonical-first defer</td>
<td>TS-5 §5.6</td>
<td>DD-056</td>
</tr>
<tr>
<td>FR-STOP-12</td>
<td>`stop-progress.json` resume</td>
<td>TS-3 §3.8; TS-5 §5.9</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-STOP-13</td>
<td>Versioned prompt files + caching</td>
<td>TS-5 §5.8</td>
<td>DD-057</td>
</tr>
<tr>
<td>FR-STOP-14</td>
<td>Canonical Selection Algorithm</td>
<td>TS-4 §4.11</td>
<td>DD-016, DD-018, DD-028, DD-049</td>
</tr>
<tr>
<td>FR-STOP-15</td>
<td>Read section content fresh from disk</td>
<td>TS-5 §5.4</td>
<td>DD-053</td>
</tr>
<tr>
<td>FR-STOP-16</td>
<td>`role: no-change` skips Stage 2; reject `no-change + omits`</td>
<td>TS-5 §5.4</td>
<td>DD-015, DD-042</td>
</tr>
<tr>
<td>FR-STOP-17</td>
<td>`PLAN_DISAGREES` handling</td>
<td>TS-5 §5.4</td>
<td>DD-010, DD-033</td>
</tr>
<tr>
<td>FR-STOP-18</td>
<td>Same-section across groups stays separate</td>
<td>TS-4 §4.12; TS-2 §2.5 step 10</td>
<td>DD-008, DD-031</td>
</tr>
<tr>
<td>FR-STOP-19</td>
<td>Assertion synthetic trigger group</td>
<td>TS-5 §5.7; TS-4 §4.2 step 6</td>
<td>DD-007, DD-054</td>
</tr>
<tr>
<td>FR-STOP-20</td>
<td>`demoted_canonicals` reporting</td>
<td>TS-5 §5.3; TS-6 §6.1</td>
<td>DD-028</td>
</tr>
<tr>
<td>FR-STOP-21</td>
<td>Low-confidence → `observations.md`</td>
<td>TS-7 §7.3; TS-3 §3.1</td>
<td>DD-026</td>
</tr>
<tr>
<td>FR-BUFFER-1..4</td>
<td>Buffer state machine + persistence</td>
<td>TS-4 §4.9</td>
<td>DD-010, DD-029</td>
</tr>
<tr>
<td>FR-BUFFER-5</td>
<td>Velocity limit</td>
<td>TS-3 §3.7; TS-6 §6.1</td>
<td>DD-011</td>
</tr>
<tr>
<td>FR-BUFFER-6</td>
<td>Consecutive-defer counter</td>
<td>TS-3 §3.7</td>
<td>DD-051</td>
</tr>
<tr>
<td>FR-BUFFER-7</td>
<td>`pending.md` cap + 14-day fence</td>
<td>TS-3 §3.3; TS-4 §4.2 step 5</td>
<td>DD-029</td>
</tr>
<tr>
<td>FR-PERMISSION-1..3</td>
<td>Observe default, additive auto-apply, frontmatter always-confirm</td>
<td>TS-6 §6.1</td>
<td>DD-002, DD-030, DD-037, DD-050</td>
</tr>
<tr>
<td>FR-PERMISSION-4</td>
<td>`[coherence]` commit format</td>
<td>TS-6 §6.4</td>
<td>DD-005, DD-008, DD-035, DD-051, DD-052, DD-061</td>
</tr>
<tr>
<td>FR-PERMISSION-5</td>
<td>Canonical `/coherence:status`</td>
<td>TS-7 §7.4</td>
<td>DD-055</td>
</tr>
<tr>
<td>FR-PERMISSION-6</td>
<td>`/coherence:repair`</td>
<td>TS-2 §2.8; TS-6 §6.7</td>
<td>DD-038, DD-045</td>
</tr>
<tr>
<td>FR-PERMISSION-7</td>
<td>Statusline badge</td>
<td>TS-7 §7.3</td>
<td>DD-019, DD-061</td>
</tr>
<tr>
<td>FR-PERMISSION-8..10</td>
<td>Assertion review UX, demoted-canonical notice, last-verified age</td>
<td>TS-6 §6.1</td>
<td>DD-028, DD-049, DD-054</td>
</tr>
<tr>
<td>FR-FAILURE-1..2</td>
<td>Atomic writes + quarantine on schema fail</td>
<td>TS-3 §3.2, §3.15</td>
<td>DD-026, DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-3, 3b</td>
<td>File-level locking + advisory `<file>.lock` semantics</td>
<td>TS-6 §6.6</td>
<td>DD-041</td>
</tr>
<tr>
<td>FR-FAILURE-4</td>
<td>Degraded mode after 3 lock timeouts</td>
<td>TS-6 §6.5..6.6</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-5</td>
<td>Git pre-flight + rollback</td>
<td>TS-6 §6.4</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-6, 8</td>
<td>Crash self-disable + manual kill-switch</td>
<td>TS-6 §6.5</td>
<td>DD-019, DD-064</td>
</tr>
<tr>
<td>FR-FAILURE-7</td>
<td>`/coherence:recover`</td>
<td>TS-2 §2.8; TS-6 §6.7</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-OBS-1..7</td>
<td>All observability surfaces</td>
<td>TS-7 §7.3..7.5</td>
<td>DD-008, DD-022, DD-024, DD-029, DD-046, DD-051, DD-052, DD-055, DD-060</td>
</tr>
<tr>
<td>FR-LAYERS-1..2</td>
<td>YAML-only metadata for skills/agents; preserve `coherence:`</td>
<td>TS-3 §3.4; TS-6 §6.3</td>
<td>DD-043, DD-050</td>
</tr>
<tr>
<td>FR-LAYERS-3..4</td>
<td>Subagent rolling-window thresholds</td>
<td>TS-2 §2.4</td>
<td>DD-013, DD-022, DD-023</td>
</tr>
<tr>
<td>FR-LAYERS-5</td>
<td>Cross-reference (subsumed by Stage 1)</td>
<td>TS-2 §2.2</td>
<td>DD-008</td>
</tr>
<tr>
<td>FR-COMMANDS-1..7</td>
<td>All slash commands</td>
<td>TS-2 §2.8; TS-8 §8.4</td>
<td>DD-021, DD-038, DD-043, DD-045, DD-046, DD-048, DD-050, DD-055, DD-061, DD-062</td>
</tr>
</table>
Sub-variant notation: FR-MIDSESSION-1c, FR-STOP-6b, FR-STOP-6c, FR-STOP-21, and FR-FAILURE-3b are TS-level decompositions not enumerated as discrete integer IDs in BRD-2. They represent implementation-level detail below the BRD grain of FR-MIDSESSION-1, FR-STOP-6, and FR-FAILURE-3 respectively, and are included in this matrix for completeness.
## 10.2 Non-Functional Requirements → TS Slice (BRD-3)
<table header-row="true">
<tr>
<td>NFR</td>
<td>Subject</td>
<td>TS slice / section</td>
<td>DDs</td>
</tr>
<tr>
<td>NFR-PERF-1..10</td>
<td>Latency, memory, install size, concurrency</td>
<td>TS-7 §7.1, §7.7; TS-4 §4.\*</td>
<td>DD-041, DD-059, DD-061</td>
</tr>
<tr>
<td>NFR-COST-1..6</td>
<td>Per-Stop cost, refresh cap, telemetry, prompt cache assumption</td>
<td>TS-7 §7.2; TS-5 §5.6, §5.8</td>
<td>DD-012, DD-020, DD-046, DD-056, DD-057, DD-060</td>
</tr>
<tr>
<td>NFR-RELIABILITY-1..7</td>
<td>Atomic writes, resume, locks, no-corruption, crash self-disable, git pre-flight, quarantine retention</td>
<td>TS-3 §3.2, §3.8, §3.15; TS-6 §6.4..6.7</td>
<td>DD-026, DD-041, DD-061, DD-063, DD-064</td>
</tr>
<tr>
<td>NFR-QUALITY-1..5</td>
<td>Stage 1/2 fixture gates, hallucination escape, per-language reporting, per-class coverage</td>
<td>TS-9 §9.3</td>
<td>DD-057, DD-058</td>
</tr>
<tr>
<td>NFR-PRIVACY-1..5</td>
<td>Local-only metrics, opt-in share, no extra-API egress, hash-only buffer payload, ignore semantics</td>
<td>TS-6 §6.2; TS-7 §7.6</td>
<td>DD-026, DD-060</td>
</tr>
<tr>
<td>NFR-SECURITY-1..7</td>
<td>No shell from LLM, path sanitisation, key handling, scoped writes, audit, frontmatter shell-execution rejection, prompt-injection HTML rejection</td>
<td>TS-5 §5.5; TS-6 §6.3, §6.4</td>
<td>DD-008, DD-040, DD-050, OWASP A01/A02</td>
</tr>
<tr>
<td>NFR-COMPAT-1..5</td>
<td>OS / Node matrix, host version pin, schema versioning, line endings</td>
<td>TS-8 §8.1, §8.5; TS-3 §3.15</td>
<td>DD-026, DD-063, DD-064</td>
</tr>
<tr>
<td>NFR-OBS-1..5</td>
<td>Log rotation policy, JSONL retention, revalidation log, canonical status, ISO-8601 UTC</td>
<td>TS-7 §7.3..7.5</td>
<td>DD-008, DD-029, DD-052, DD-055, DD-060</td>
</tr>
<tr>
<td>NFR-MAINT-1..4</td>
<td>Versioned prompts, schema migrations, public types, coverage ≥80%</td>
<td>TS-5 §5.8; TS-3 §3.14; TS-7 §7.8; TS-8 §8.5</td>
<td>DD-026, DD-057</td>
</tr>
<tr>
<td>NFR-I18N-1..2</td>
<td>English-only UI, UTF-8 throughout</td>
<td>TS-7 §7.9</td>
<td>—</td>
</tr>
</table>
## 10.3 Acceptance Gates → TS Owner (BRD-4)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Owner</td>
</tr>
<tr>
<td>E2E-1..E2E-9</td>
<td>TS-9 §9.4</td>
</tr>
<tr>
<td>QG-1..QG-6</td>
<td>TS-9 §9.3</td>
</tr>
<tr>
<td>PG-1..PG-5</td>
<td>TS-9 §9.5</td>
</tr>
<tr>
<td>RG-1..RG-4</td>
<td>TS-9 §9.6</td>
</tr>
<tr>
<td>SG-1..SG-4</td>
<td>TS-9 §9.7</td>
</tr>
<tr>
<td>RB-1..RB-5</td>
<td>TS-9 §9.8</td>
</tr>
<tr>
<td>DG-1..DG-6</td>
<td>TS-8 §8.7</td>
</tr>
</table>
## 10.4 Reverse Lookup — TS Slice → Requirements
<table header-row="true">
<tr>
<td>TS slice</td>
<td>Owns (FR / NFR / Gate)</td>
</tr>
<tr>
<td>TS-1 System Overview</td>
<td>BRD-1 §1.4..1.8 (constraints, scope, personas)</td>
</tr>
<tr>
<td>TS-2 Components</td>
<td>FR-FAILURE-1..2; module boundaries underpin every FR/NFR</td>
</tr>
<tr>
<td>TS-3 Data Model</td>
<td>FR-DETECT-3..4, FR-DETECT-15, FR-BUFFER-7, FR-LAYERS-1..2; NFR-RELIABILITY-1, NFR-MAINT-2..3, NFR-COMPAT-4..5, NFR-PRIVACY-4</td>
</tr>
<tr>
<td>TS-4 Hooks</td>
<td>FR-DETECT-1..2,5..14,16; FR-MIDSESSION-1..4; FR-BUFFER-1..6; NFR-PERF-1..6</td>
</tr>
<tr>
<td>TS-5 LLM Pipeline</td>
<td>FR-STOP-1..21; FR-MIDSESSION-5..6; NFR-COST-1..6; NFR-QUALITY-1..5; NFR-MAINT-1; NFR-SECURITY-1,7</td>
</tr>
<tr>
<td>TS-6 Permission/Security/Privacy</td>
<td>FR-PERMISSION-1..10; FR-FAILURE-3..8; FR-LAYERS-1..2; NFR-PRIVACY-1..5; NFR-SECURITY-1..7; NFR-RELIABILITY-3..6</td>
</tr>
<tr>
<td>TS-7 Perf/Cost/Observability</td>
<td>NFR-PERF-1..10; NFR-COST-1..6; NFR-OBS-1..5; FR-OBS-1..7; FR-PERMISSION-5,7; NFR-MAINT-1..4; NFR-I18N-1..2</td>
</tr>
<tr>
<td>TS-8 Init/Distribution/Migration</td>
<td>FR-INSTALL-1..7; FR-COMMANDS-5..7; NFR-COMPAT-1..4; NFR-RELIABILITY-7; DG-1..DG-6</td>
</tr>
<tr>
<td>TS-9 Test Strategy</td>
<td>All E2E / QG / PG / RG / SG / RB gates; BRD-4 §4.10 DoD</td>
</tr>
<tr>
<td>TS-10 Traceability</td>
<td>This page</td>
</tr>
</table>
## 10.5 Risk Register → Mitigation Owner (BRD-5 §5.1)
<table header-row="true">
<tr>
<td>Risk</td>
<td>Mitigation owner</td>
</tr>
<tr>
<td>R-1 Hallucination escape</td>
<td>TS-5 §5.5 (grep + DD-058 corpus); TS-9 §9.3 (QG-4)</td>
</tr>
<tr>
<td>R-2 Cost spikes</td>
<td>TS-5 §5.6 (caps); TS-7 §7.5 (telemetry)</td>
</tr>
<tr>
<td>R-3 Lock contention lag</td>
<td>TS-6 §6.5..6.6; TS-7 §7.1 (PG-1)</td>
</tr>
<tr>
<td>R-4 Stop pipeline crash mid-run</td>
<td>TS-3 §3.8; TS-9 §9.4 (E2E-4)</td>
</tr>
<tr>
<td>R-5 Subagent attribution unavailable</td>
<td>TS-2 §2.4; TS-8 §8.4</td>
</tr>
<tr>
<td>R-6 Buggy release crashes sessions</td>
<td>TS-6 §6.5; TS-8 §8.6</td>
</tr>
<tr>
<td>R-7 Anchor ID collisions</td>
<td>TS-3 §3.4; TS-4 §4.2 step 3</td>
</tr>
<tr>
<td>R-8 Patch overwrites unrelated edits</td>
<td>TS-6 §6.4</td>
</tr>
<tr>
<td>R-9 Velocity-limit hides real drift</td>
<td>TS-3 §3.7; TS-7 §7.4</td>
</tr>
<tr>
<td>R-10 Privacy of code sent to API</td>
<td>TS-6 §6.2; TS-8 §8.7 (DG-6)</td>
</tr>
<tr>
<td>R-11 Prompt regression</td>
<td>TS-5 §5.8; TS-9 §9.3</td>
</tr>
<tr>
<td>R-12 Cross-platform line-ending bugs</td>
<td>TS-3 §3.15 (NFR-COMPAT-5); TS-9 §9.2 (CI matrix)</td>
</tr>
<tr>
<td>R-13 Battery / IO drain</td>
<td>n/a v0.1 (trickle deferred to v0.2)</td>
</tr>
<tr>
<td>R-14 Schema migration bug strands users</td>
<td>TS-8 §8.5; TS-9 §9.4 (E2E-8)</td>
</tr>
<tr>
<td>R-15 LLM provider outage</td>
<td>TS-5 §5.9</td>
</tr>
<tr>
<td>R-16 Prompt injection via skill/agent body</td>
<td>TS-6 §6.3 (NFR-SECURITY-7); TS-9 §9.7 (SG-3)</td>
</tr>
<tr>
<td>R-17 Case-insensitive filesystem ambiguity</td>
<td>TS-3 §3.4 (DD-027); TS-9 §9.2 (CI matrix)</td>
</tr>
<tr>
<td>R-18 Anchor scan misclassifies fenced code</td>
<td>TS-3 §3.4 (scanner skips fences)</td>
</tr>
</table>
## 10.6 Dependency Map (BRD-5 §5.2)
<table header-row="true">
<tr>
<td>Dependency</td>
<td>Used in TS slice</td>
</tr>
<tr>
<td>D-1 Claude Code v2.0+</td>
<td>TS-1 §1.2; TS-8 §8.1</td>
</tr>
<tr>
<td>D-2 Anthropic API (Sonnet 4.5) + prompt caching</td>
<td>TS-5 §5.2, §5.8</td>
</tr>
<tr>
<td>D-3 Node.js 20.x / 22.x</td>
<td>TS-1 §1.2</td>
</tr>
<tr>
<td>D-4 Git 2.30+</td>
<td>TS-6 §6.4</td>
</tr>
<tr>
<td>D-5 Linux / macOS / Windows</td>
<td>TS-9 §9.2</td>
</tr>
<tr>
<td>D-6 `ajv` draft-07</td>
<td>TS-3 §3.2</td>
</tr>
<tr>
<td>ID-1..ID-6 internal assets</td>
<td>TS-9 §9.12</td>
</tr>
</table>
## 10.7 Glossary Anchor
Definitions are owned by BRD-5 §5.6. This Tech Spec uses every term verbatim.
## 10.8 Foundational & v0.2-Deferred Design-Decision Coverage
The following Design Decisions do not appear inline in §10.1–10.2 because they are either foundational architectural premises (already realised by an entire TS slice rather than a single FR) or explicitly deferred. They are recorded here for completeness so every DD in the source corpus has at least one TS reference.
<table header-row="true">
<tr>
<td>DD</td>
<td>Subject</td>
<td>Status in v0.1</td>
<td>TS reference</td>
</tr>
<tr>
<td>DD-001</td>
<td>Doc-declared watches as the only detection signal</td>
<td>Foundational; underpins all of FR-DETECT-\*</td>
<td>TS-1 §1.4; TS-3 §3.4; TS-4 §4.3</td>
</tr>
<tr>
<td>DD-003</td>
<td>LLM only at Stop / `/coherence:review`</td>
<td>Foundational cost/architecture premise</td>
<td>TS-1 §1.1; TS-5 §5.1</td>
</tr>
<tr>
<td>DD-004</td>
<td>Observe-first default mode</td>
<td>Foundational permission premise</td>
<td>TS-1 §1.4; TS-6 §6.1</td>
</tr>
<tr>
<td>DD-005</td>
<td>Always-individual `[coherence]` git commits</td>
<td>v0.1 commit format</td>
<td>TS-6 §6.1, §6.4; FR-PERMISSION-4 row above</td>
</tr>
<tr>
<td>DD-006</td>
<td>Greenfield-mode bootstrapping</td>
<td>Deferred to v0.2 (BRD-5 §5.3)</td>
<td>TS-1 §1.5 (out-of-scope)</td>
</tr>
<tr>
<td>DD-014</td>
<td>Trickle-scan throttling</td>
<td>Deferred to v0.2 (trickle scanner not in v0.1)</td>
<td>TS-1 §1.5; TS-3 §3.1 (`scan-cache.json` reservation)</td>
</tr>
<tr>
<td>DD-036</td>
<td>Trickle-scan child process model</td>
<td>Deferred to v0.2</td>
<td>TS-1 §1.5; TS-3 §3.1</td>
</tr>
</table>
With §10.8 in place, every DD-001..DD-064 in [3. Design Decisions](https://www.notion.so/e3d010d46a70839f9e358122c2a8cd07) has at least one TS reference; every BRD-2 FR, BRD-3 NFR, and BRD-4 acceptance gate has at least one TS owner.
