<!-- url: https://www.notion.so/35d010d46a70812aa8f0c30a0f13beac -->
<!-- id: 35d010d4-6a70-812a-a8f0-c30a0f13beac -->
<!-- title: BRD-4 — Success Metrics & Acceptance (v0.4) -->
**Parent:** [📋 BRD](https://www.notion.so/35d010d46a7081e0a2d9f7a928fbaa58) · [v0.4](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · **Status:** Draft 2026-05-11

> Audit note: every FR in BRD-2 has corresponding gate below. FR-MANIFEST-2 → M-TRIPLEX-1; FR-LAYOUT-1 → M-LAYOUT-1; FR-AUDIT-1 → M-AUDIT-1.

## GA-time gates (must be green at v0.4.0 tag)
- M-TRIPLEX-1 — Static-analysis test asserts every state-write call site resolves to correct storage tier: `${CLAUDE_PLUGIN_DATA}` per-installation, `.claude/coherence/` per-project per-developer, `coherence/` per-team. Zero cross-tier leaks. (DD-120; G-1)
- M-LAYOUT-1 — Integration test: when plugin.json is at plugin root (v0.3-style), SessionStart emits one-line CLI refusal (`status: 'refuse_layout'`) and exits cleanly. (DD-122; G-1)
- M-AUDIT-1 — `/coherence:audit` output includes sections from doctor, scope-debug, status, exportMetrics + disclaimer "v0.4 audit is bundling-only summary; deep audit ships in v1.0". (DD-125; G-2)
- M-VALIDATE-1 — `claude plugin validate` exits 0 on 100% of master commits. Meta-test breaks .claude-plugin/plugin.json and asserts gate trips. (DD-123; G-1)
- M-AUTOGEN-1 — Static-analysis test asserts 1:1 mapping between plugin.json#slashCommands[].name and commands/<name>.md. Build idempotency verified. (DD-130; G-1)
- M-PARSEMAJOR-1 — Unit test assertions all pass. (DD-124; G-4)
- M-TRIGGER-1 — Synthetic harness: threshold-met (TC-1, TC-2 independently) → one-time CLI hint; threshold-not-met → silent; metrics.jsonl-absent → no-op; second session after threshold-met → hint NOT re-emitted. (DD-129; G-3)
- M-SEMVER-1 — release-ga.mjs preflight asserts plugin.json#version, package.json#version, src/state/init.ts#PLUGIN_VERSION all match pending git tag. (DD-121; G-1)
- M-COST-1 (carry) — Per-session cost ≤ v0.1-baseline × 1.30. CG-1 + CG-2.
- M-CONSENT-1 — Integration test for `/coherence:consent --local off`, no-args, `--reset`. (DD-127; FR-CONSENT-1; G-2)
- M-SANDBOX-1 — Integration test: in-tree `--out` accepted; out-of-tree without flag refused; out-of-tree with flag accepted + warning. (DD-128; FR-SANDBOX-1; G-2)

## Operational gates (before v0.4 GA tag)
- M-LISTING-1 — Official Anthropic plugin marketplace submission form submitted. Non-blocking spec-freeze gate.

## Post-GA field signals (measured at +30 days)
- M-FIRSTIMPRESSION-1 — p50 marketplace install → first proposal accept < 24h. Soft target — reset baseline if cohort < 10. (G-2; P4)
- M-ABANDONMENT-1 — First-installer abandonment within 7 days < 30%. (G-2; P4)

## Acceptance summary
v0.4 GA when:
1. All FR-* land with passing tests.
2. M-TRIPLEX-1 + M-LAYOUT-1 + M-AUDIT-1 + M-SEMVER-1 + M-VALIDATE-1 + M-AUTOGEN-1 + M-PARSEMAJOR-1 + M-TRIGGER-1 + M-COST-1 + M-CONSENT-1 + M-SANDBOX-1 verified.
3. M-LISTING-1 submitted before tag.
4. M-FIRSTIMPRESSION-1 + M-ABANDONMENT-1 verified at +30 days post-GA.
