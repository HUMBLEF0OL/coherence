# Coherence Privacy & Data Handling (DG-6)

**Legal review required before distribution.**

---

## Overview

Coherence processes documentation sections in your project to detect drift. This document describes exactly what data is collected, where it goes, and how it is stored.

---

## Data Sent to Anthropic API

Coherence uses the Anthropic API (claude-sonnet-4-5) for two pipeline stages:

### Stage 1 — Canonical Selection Planner

**Sent:**
- Section references (file paths + anchor IDs, e.g., `docs/api.md#intro`)
- Section headings (e.g., "Introduction")
- Buffer metadata (which files changed, from which source)

**Not sent:**
- Raw file content
- Source code
- Personal information

### Stage 2 — Patch Generation

**Sent:**
- Current section content (the text between coherence anchors)
- The coherence plan from Stage 1
- Changed token list (identifiers from changed source files, for hallucination checking)
- Project file token set (for hallucination grounding)

**Not sent:**
- Full source files beyond the changed-token summary
- Database content, credentials, or secrets
- Personal information outside documentation text

### API Key

The `ANTHROPIC_API_KEY` is read from the environment and used only for API calls. It is **never** persisted to disk in any coherence state file (NFR-SECURITY-3).

---

## Local Storage

All coherence state is stored locally in `.claude/coherence/`:

| File | Content | Retention |
|---|---|---|
| `drift-buffer.json` | Section hashes only — no raw content (NFR-PRIVACY-4) | Cleared after each Stop run |
| `cost-ledger.json` | LLM call cost in USD, token counts, timestamps | Manual deletion |
| `metrics.jsonl` | Event type, session ID (non-identifying), timestamps | 90-day rolling window |
| `coherence-log.md` | Patch summaries, git refs | Append-only, never rotated |
| `section-index.json` | File paths, line numbers, content hashes | Rebuilt on SessionStart |

### Raw Content Handling

Raw section content is loaded from disk during Stage 2 processing and **only** exists in memory during the pipeline run. It is not written to any state file.

---

## Metrics and Telemetry

Coherence collects **local-only** metrics in `metrics.jsonl`. No data is sent to external servers unless you explicitly use `/coherence:share-metrics`.

### `/coherence:share-metrics --anonymized`

When you run this command:
1. You are shown the output path and anonymization mode before anything is written.
2. Confirmation is required.
3. Project paths are redacted; section refs are replaced with SHA-256 hashes.
4. The output is written to a **local file only** — no network egress in v0.1 (TS-7 §7.6).
5. HTTPS POST to any endpoint is **explicitly out of scope** for v0.1.

---

## Ignore Semantics

You can control what coherence watches with `.claude/coherence/config.json`:

```json
{
  "ignore": [".env", "secrets/**", "*.key"]
}
```

Default ignores include `.env`, `node_modules/`, `.git/`, and other sensitive paths (NFR-PRIVACY-5).

---

## Data Retention Summary

| Data type | Location | Retention | Deletion |
|---|---|---|---|
| Buffer entries (hashes only) | `drift-buffer.json` | Until next Stop run | Auto-cleared |
| LLM call costs | `cost-ledger.json` | Session scoped | Manual |
| Audit log | `coherence-log.md` | Append-only | Manual |
| Event metrics | `metrics.jsonl` | 90-day rolling | Auto-aggregated |
| API key | Environment only | Never on disk | N/A |

---

## OWASP / Security Compliance

- **A02 (Cryptographic Failures)**: API key never persisted (NFR-SECURITY-3).
- **A01 (Broken Access Control)**: Path traversal blocked (NFR-SECURITY-2, SG-2).
- **A03 (Injection)**: Prompt injection detection per NFR-SECURITY-7 (SG-3).
- **Network egress**: Only `src/llm/client.ts` makes outbound HTTPS calls (NFR-PRIVACY-3).
