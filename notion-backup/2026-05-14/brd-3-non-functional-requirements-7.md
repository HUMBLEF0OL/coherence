<!-- url: https://www.notion.so/35b010d46a708197ba8efff2ba988296 -->
<!-- id: 35b010d4-6a70-8197-ba8e-fff2ba988296 -->
<!-- title: 🛡️ BRD-3 — Non-Functional Requirements -->
**Parent:** [📘 10. BRD — Coherence v0.1](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea)
---
NFRs are budgeted, enforced via test harnesses (DD-059, DD-063), and gated by CI. Each item is verifiable.
## 3.1 Performance (NFR-PERF)
All latency budgets are p95 unless noted; measured by `tests/perf/` harness across four reference codebases (small, medium, large, monorepo). CI fails any merge with a \>30% regression.
<table header-row="true">
<tr>
<td>ID</td>
<td>Subject</td>
<td>Budget</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-PERF-1</td>
<td>PostToolUse hook total latency</td>
<td>\< 50 ms p95 typical</td>
<td>DD-059</td>
</tr>
<tr>
<td>NFR-PERF-2</td>
<td>PostToolUse worst-case (lock contention)</td>
<td>Single-hook lock-wait bounded by 5s timeout (DD-041); after 3 consecutive lock-acquisition timeouts within a session plugin transitions to degraded mode (DD-061).</td>
<td>DD-041, DD-061</td>
</tr>
<tr>
<td>NFR-PERF-3</td>
<td>SessionStart hook</td>
<td>\< 2 s p95 medium codebase, \< 4 s p95 monorepo</td>
<td>DD-059</td>
</tr>
<tr>
<td>NFR-PERF-4</td>
<td>Stop hook (typical, ≤12 sections)</td>
<td>\< 10 s p95</td>
<td>DD-059</td>
</tr>
<tr>
<td>NFR-PERF-5</td>
<td>Stop hook at DD-056 ceiling (36 sections, 8 concurrent Stage 2 calls)</td>
<td>\< 25 s p95</td>
<td>DD-059</td>
</tr>
<tr>
<td>NFR-PERF-6</td>
<td>UserPromptSubmit, SubagentStop, SessionEnd</td>
<td>\< 100 ms p95 (deterministic, no LLM)</td>
<td>Architecture</td>
</tr>
<tr>
<td>NFR-PERF-7</td>
<td>`/coherence:status`</td>
<td>\< 250 ms p95</td>
<td>DD-055</td>
</tr>
<tr>
<td>NFR-PERF-8</td>
<td>Plugin install size on disk</td>
<td>\< 10 MB</td>
<td>—</td>
</tr>
<tr>
<td>NFR-PERF-9</td>
<td>Resident memory (plugin process only)</td>
<td>\< 50 MB p95 / \< 80 MB p99</td>
<td>DD-059</td>
</tr>
<tr>
<td>NFR-PERF-10</td>
<td>Stage 2 max concurrency</td>
<td>≤ 8 parallel calls (bounds API rate-limit risk and memory)</td>
<td>DD-059</td>
</tr>
</table>
## 3.2 Cost (NFR-COST)
Cost target governs Stop pipeline LLM usage and is enforced by hard caps (DD-056) and prompt caching (DD-057).
<table header-row="true">
<tr>
<td>ID</td>
<td>Scenario</td>
<td>Target</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-COST-1</td>
<td>Per-Stop session p50 cost</td>
<td>≤ \$0.07</td>
<td>DD-056</td>
</tr>
<tr>
<td>NFR-COST-2</td>
<td>Per-Stop session p95 cost</td>
<td>≤ \$0.15</td>
<td>DD-056</td>
</tr>
<tr>
<td>NFR-COST-3</td>
<td>PostToolUse silent context refresh</td>
<td>\~50 tokens / refresh; capped at 1 per buffer change</td>
<td>DD-012, DD-020</td>
</tr>
<tr>
<td>NFR-COST-4</td>
<td>Mid-session `/coherence:review`</td>
<td>costed and surfaced to user before run</td>
<td>DD-046</td>
</tr>
<tr>
<td>NFR-COST-5</td>
<td>Cost telemetry</td>
<td>recorded in `metrics.jsonl` per Stop</td>
<td>DD-046, DD-060</td>
</tr>
<tr>
<td>NFR-COST-6</td>
<td>Prompt-cache leverage</td>
<td>Stable Stage 1 / Stage 2 prefix routed through Anthropic prompt caching; budget assumes ≈70% input-token savings on cache hits within the 5-minute idle window. Release telemetry verifies actual hit rate.</td>
<td>DD-057, DD-056</td>
</tr>
</table>
## 3.3 Reliability & Recovery (NFR-RELIABILITY)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-RELIABILITY-1</td>
<td>All state-file writes are atomic (temp + rename); reads validate schema and quarantine on failure.</td>
<td>DD-026, DD-061</td>
</tr>
<tr>
<td>NFR-RELIABILITY-2</td>
<td>Stop pipeline is resumable after crash via `stop-progress.json`; resume must skip completed Stage 2 calls.</td>
<td>DD-061</td>
</tr>
<tr>
<td>NFR-RELIABILITY-3</td>
<td>Concurrent-session safety: file-level locks with bounded timeout; degraded-mode escape after 3 consecutive timeouts.</td>
<td>DD-041, DD-061</td>
</tr>
<tr>
<td>NFR-RELIABILITY-4</td>
<td>Coherence-caused file corruption rate target: 0 detected incidents in v0.1 release E2E suite.</td>
<td>DD-063</td>
</tr>
<tr>
<td>NFR-RELIABILITY-5</td>
<td>Crash self-disable: 3 hook-fire exceptions per session → automatic kill-switch.</td>
<td>DD-064</td>
</tr>
<tr>
<td>NFR-RELIABILITY-6</td>
<td>Git pre-flight checks before commit (clean tree on targets, branch unchanged, HEAD unchanged).</td>
<td>DD-061</td>
</tr>
<tr>
<td>NFR-RELIABILITY-7</td>
<td>Quarantined corrupt state files **must** be retained at `.claude/coherence/quarantine/<filename>.<unix-ts>.bak` with the last 10 copies per file kept (oldest deleted) so users can recover or audit; the corruption event **must** be logged to `coherence-log.md` with the quarantine path.</td>
<td>DD-061</td>
</tr>
</table>
## 3.4 Quality Gates (NFR-QUALITY)
Production-readiness gates enforced by fixture suites in CI; releases blocked on failure.
<table header-row="true">
<tr>
<td>ID</td>
<td>Metric</td>
<td>Threshold</td>
<td>Fixture / Source</td>
</tr>
<tr>
<td>NFR-QUALITY-1</td>
<td>Stage 1 planner schema-valid output</td>
<td>≥ 90%</td>
<td>DD-057 fixture suite</td>
</tr>
<tr>
<td>NFR-QUALITY-2</td>
<td>Stage 2 patch apply rate (cleanly applies)</td>
<td>≥ 80%</td>
<td>DD-057 fixture suite</td>
</tr>
<tr>
<td>NFR-QUALITY-3</td>
<td>Hallucination escape rate</td>
<td>≤ 2%</td>
<td>DD-057, DD-058 corpus</td>
</tr>
<tr>
<td>NFR-QUALITY-4</td>
<td>Hallucination grep precision/recall</td>
<td>published per language across 8+2 langs (50 valid + 50 hallucinated)</td>
<td>DD-058</td>
</tr>
<tr>
<td>NFR-QUALITY-5</td>
<td>Per-class fixture coverage</td>
<td>apply / escalate / disagree classes — ≥5 fixtures each</td>
<td>DD-057</td>
</tr>
</table>
## 3.5 Privacy & Data Handling (NFR-PRIVACY)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-PRIVACY-1</td>
<td>All metrics stored locally in `metrics.jsonl`; no auto-upload.</td>
<td>DD-060</td>
</tr>
<tr>
<td>NFR-PRIVACY-2</td>
<td>Anonymized share is opt-in per session and explicit (slash command), not background.</td>
<td>DD-060</td>
</tr>
<tr>
<td>NFR-PRIVACY-3</td>
<td>Plugin **must not** transmit code outside the user's machine except as part of intentional Stop pipeline LLM calls (Anthropic API only).</td>
<td>—</td>
</tr>
<tr>
<td>NFR-PRIVACY-4</td>
<td>Plugin **must not** persist code content beyond what is required for the buffer (path + section ID + content hash, not raw content) and the Stage 2 LLM call (in-flight only).</td>
<td>DD-026</td>
</tr>
<tr>
<td>NFR-PRIVACY-5</td>
<td>Plugin **must not** read or transmit `.env`, `.envrc`, `.git/`, files matching `.gitignore`, or any path declared in `.claude/coherence/ignore`.</td>
<td>—</td>
</tr>
</table>
## 3.6 Security (NFR-SECURITY)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-SECURITY-1</td>
<td>Plugin **must not** execute arbitrary shell commands from Stage 2 outputs; LLM outputs are restricted to unified diffs that pass validation.</td>
<td>DD-008</td>
</tr>
<tr>
<td>NFR-SECURITY-2</td>
<td>Plugin **must** sanitize all paths against directory-traversal (`..`) before any file operation.</td>
<td>OWASP A01</td>
</tr>
<tr>
<td>NFR-SECURITY-3</td>
<td>Anthropic API key is read from environment / host-provided credentials only; plugin **must not** persist it.</td>
<td>OWASP A02</td>
</tr>
<tr>
<td>NFR-SECURITY-4</td>
<td>All file writes are scoped to the project root and `.claude/`; writes outside these roots are refused.</td>
<td>OWASP A01</td>
</tr>
<tr>
<td>NFR-SECURITY-5</td>
<td>Plugin **must not** introduce dependencies with known CVEs at release; CI enforces `npm audit --audit-level=high` zero findings.</td>
<td>—</td>
</tr>
<tr>
<td>NFR-SECURITY-6</td>
<td>Patch validation rejects diffs that introduce shell-execution constructs into skill / agent frontmatter.</td>
<td>DD-040, DD-050</td>
</tr>
<tr>
<td>NFR-SECURITY-7</td>
<td>Prompt-injection defense: Stage 2 patches **must not** introduce `<!-- coherence:* -->` HTML comments into skill or agent files (DD-050 restricts those to prose docs). Patches that attempt to inject coherence directives, role-prompt fragments, or instruction-shaped HTML into `.claude/skills/*/SKILL.md` or `.claude/agents/*.md` body content **must** be rejected by validation.</td>
<td>DD-050</td>
</tr>
</table>
## 3.7 Compatibility (NFR-COMPAT)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-COMPAT-1</td>
<td>Plugin **must** run on Linux, macOS, and Windows. CI matrix covers all three.</td>
<td>DD-063</td>
</tr>
<tr>
<td>NFR-COMPAT-2</td>
<td>Plugin **must** support Node.js 20.x and 22.x.</td>
<td>DD-063</td>
</tr>
<tr>
<td>NFR-COMPAT-3</td>
<td>Plugin **must** declare `min_claude_code_version` in its manifest; host refuses to load if too old.</td>
<td>DD-064</td>
</tr>
<tr>
<td>NFR-COMPAT-4</td>
<td>State file schema versioning: forward-compat (older plugin reads newer state) is read-only; backward-compat (newer plugin reads older state) runs explicit migrate steps.</td>
<td>DD-026, DD-064</td>
</tr>
<tr>
<td>NFR-COMPAT-5</td>
<td>Plugin **must** handle CRLF / LF line endings consistently across platforms; patches preserve the file's existing line ending convention.</td>
<td>—</td>
</tr>
</table>
## 3.8 Observability & Diagnostics (NFR-OBS)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-OBS-1</td>
<td>`coherence-log.md` is append-prepend (newest-first) and **must not** be auto-rotated or truncated in v0.1; size is bounded by the number of applied patches (typically small). `--since` filtering and rotation are v0.2 candidates.</td>
<td>DD-052</td>
</tr>
<tr>
<td>NFR-OBS-2</td>
<td>`metrics.jsonl` is append-only with 90-day rolling retention; entries older than 90 days are summarised into `metrics-summary.json` (counts only, no content).</td>
<td>DD-060</td>
</tr>
<tr>
<td>NFR-OBS-3</td>
<td>`revalidation-log.md` records (a) DD-029 SessionStart entry-drop reasons and (b) Stage 2 validation failures with the failed-check identifier and the rejected payload, so `/coherence:repair` and audits can inspect history.</td>
<td>DD-008, DD-029</td>
</tr>
<tr>
<td>NFR-OBS-4</td>
<td>`/coherence:status` output is canonical and ordered, suitable for diff-based regression testing.</td>
<td>DD-055</td>
</tr>
<tr>
<td>NFR-OBS-5</td>
<td>All log timestamps are ISO-8601 UTC.</td>
<td>—</td>
</tr>
</table>
## 3.9 Maintainability (NFR-MAINT)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-MAINT-1</td>
<td>Prompts are versioned files in `prompts/v{n}/`; bumping `n` requires DD-057 fixture-suite passage.</td>
<td>DD-057</td>
</tr>
<tr>
<td>NFR-MAINT-2</td>
<td>State-file schema migrations follow a documented `migrate_v{n}_to_v{n+1}` chain executed at SessionStart on version mismatch.</td>
<td>DD-026</td>
</tr>
<tr>
<td>NFR-MAINT-3</td>
<td>Public TypeScript types for buffer entry, plan, patch, and host-capabilities are exported and stable across MINOR versions.</td>
<td>—</td>
</tr>
<tr>
<td>NFR-MAINT-4</td>
<td>Code coverage ≥ 80% for non-LLM modules; LLM-call sites covered by fixture replay tests.</td>
<td>—</td>
</tr>
</table>
## 3.10 Internationalization (NFR-I18N)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>Source</td>
</tr>
<tr>
<td>NFR-I18N-1</td>
<td>Plugin UI strings are English-only in v0.1; localization deferred.</td>
<td>—</td>
</tr>
<tr>
<td>NFR-I18N-2</td>
<td>Plugin **must** correctly handle non-ASCII content in source files and patches (UTF-8 throughout).</td>
<td>—</td>
</tr>
</table>
