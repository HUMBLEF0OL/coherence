<!-- url: https://www.notion.so/35f010d46a7081fcb465e052d62d6a3f -->
<!-- id: 35f010d4-6a70-81fc-b465-e052d62d6a3f -->
<!-- title: BRD — Business Requirements Document (v1.0) -->
Parent: v1.0 | Status: Draft 2026-05-13 | Reads: v1.0 Overview + DD-131..DD-147 + OQ-v1-01..OQ-v1-10 (all closed). Theme: v0.1 reacts → v0.2 proposes → v0.3 distributes → v0.4 polishes → v1.0 trusts.

All 5 sequencing gates closed (Gate 1 → DD-138, Gate 2 → DD-139, Gate 3 → DD-141, Gate 4 → DD-143, Gate 5 → DD-140). BRD authoring fully unblocked across G-1 trust ladder, G-2 cross-session learning, G-3 asserts, G-4 metrics, G-5 deep audit, G-6 trust signals.

Canonical slices (authoritative):
<page url="https://www.notion.so/35f010d46a708198a92ad3af574c43a6">BRD-1 — Personas & Use Cases</page>
<page url="https://www.notion.so/35f010d46a708132a737d49070f8853a">BRD-2 — Functional Requirements</page>
<page url="https://www.notion.so/35f010d46a7081a8bf62cb7a1a224584">BRD-3 — Non-Functional Requirements</page>
<page url="https://www.notion.so/35f010d46a7081c38f01e2b48e36ea39">BRD-4 — Success Metrics & Acceptance</page>
<page url="https://www.notion.so/35f010d46a70817bb94cd2f899959b3c">BRD-5 — Roadmap & Post-GA Commitments</page>

——— BRD AUDIT 2026-05-13 ———
13 issues found across coverage, missing FRs, NFR placement, and acceptance summary. All amendments applied to relevant slice pages (BRD-2, BRD-3, BRD-4). DD coverage matrix is otherwise clean — all 17 DDs (DD-131..DD-147) have at least one FR/NFR/M-gate. DD-136 (milestone ordering) is process-only and covered in BRD-5 sequencing.
- Coverage gaps fixed: M-TRUST-4 (DD-146 auto-land scope), M-LEDGER-4 (DD-140 team conflict), M-ASSERTS-4 (DD-133 text-pattern assertions), M-SIGN-3 (FR-SIGN-4/5 verification artifacts).
- New FRs added: FR-TRUST-5 (--status output), FR-LEDGER-5 (first-run state), FR-ASSERTS-5 (unknown type behavior), FR-MANIFEST-5 (new commands in plugin.json#slashCommands), FR-TELEMETRY-1 (trust events).
- NFR placement corrected: NFR-OBS-2 event declarations moved to FR-TELEMETRY-1; NFR-PATH-SANDBOX added as explicit DD-128 carry.
- Acceptance clarifications: M-LISTING-1 carry status documented (awaiting Anthropic review; not gated on v1.0 GA). M-LEGACY-1 extension for release-artifacts/ exclusion verified via npm pack --dry-run.

——— BRD AUDIT PASS 3 — 2026-05-13 ———
6 BRD-scope issues found and amended inline. Audit converging (pass 1: 13 issues, pass 2: 13 issues, pass 3: 6 issues). 4 additional issues identified as TS-scope (deferred): team aggregate per-developer file schema; coherence-log.md trust event enumeration; --out file format; v0.4 → v1.0 state file backward compatibility.
- Pass 3 issue 1 — contested-section threshold (M-LEDGER-4 introduced 0.2 without FR backing). Amendment to FR-LEDGER-4.
- Pass 3 issue 2 — "logged and ignored" channel for FR-ASSERTS-5 and DD-143 max-10 rule. Amendment to FR-ASSERTS-1.
- Pass 3 issue 3 — FR-TELEMETRY-1 weight field semantics. Amendment.
- Pass 3 issue 4 — DD-136 milestone ordering not in BRD-5. Amendment to BRD-5.
- Pass 3 issue 5 — M-SIGN-3 "required headings" undefined. Amendment to M-SIGN-3.
- Pass 3 issue 6 — FR-TRUST-5 performance bound. Amendment to NFR-PERF-N6.
