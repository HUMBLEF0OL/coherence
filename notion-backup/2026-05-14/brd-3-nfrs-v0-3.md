<!-- url: https://www.notion.so/35c010d46a7081c2a010cb13993184f4 -->
<!-- id: 35c010d4-6a70-81c2-a010-cb13993184f4 -->
<!-- title: 🛡️ BRD-3 — Non-Functional Requirements (v0.3) -->
**Parent:** [BRD](https://www.notion.so/35c010d46a708133b65dfad745442bf0) · **Status:** Draft 2026-05-10 (post DD-117/118)

**Architectural commitments (top of register)**
- NFR-ARCH-1 (new) — No backend, no shared central store, no hosted upload service ever. cohrence is a file-only plugin in perpetuity. Scaling beyond ~50-developer teams explicitly not a project goal. (DD-117)
- NFR-ARCH-2 (new) — No legacy version support burden. v0.3 ships fresh state on install; major-version bumps may break on-disk format; users re-install rather than migrate. No prompts/v1 in tarball. (DD-118)

**Privacy**
- NFR-PRIVACY-N5 (new) — Per-developer signal locality. signal-cache.json + session map (v0.2 P2 fileLocalityCache.ts) never cross developers. CI lint enforces .gitignore. (DD-109)
- NFR-PRIVACY-N6 (new) — Plan author identity hashed end-to-end. Plain name only in CLI display. (DD-107)

**Performance**
- NFR-PERF-1 (reused) — PostToolUse 50ms p95. Scope discovery (FR-SCOPE-1) MUST honour this; cold-start cost amortised by FR-SCOPE-4 cache.
- NFR-PERF-N4 (new) — Scope-cache cold-start budget < 200ms for repos up to 100 packages × depth 8.
- NFR-PERF-8 (reused) — Install size ≤ 10MB. DD-095 amended (slim tarball, no prompts/v1/).

**Cost**
- NFR-COST-1 (reused) — Per-session cost ceiling stays at v0.1 × 1.30. v0.3 features mostly non-LLM. G-7 author-pipeline gated by env flag (DD-112). CG-1/CG-2.

**Compatibility**
- NFR-COMPAT-3 (reused) — `min_claude_code_version` bumped if v0.3 features require newer Claude Code.
- NFR-COMPAT-N4 (new, amended under DD-118) — On install, detect version.json in any pre-existing `.claude/coherence/` state. If pre-v3 schema, refuse to start with clear message. No automatic data loss; no migration.

**Observability**
- NFR-OBS-1 (reused) — Audit log captures every proposal-lifecycle transition with hashed identity + timestamp.
- NFR-OBS-N5 (new) — Cross-team plan transitions emit `ignored_by_team`/`ignored_locally` distinct events.

**Security**
- NFR-SECURITY-N3 (new) — Host capability probe surface bounded. Only optional capabilities probed; required ones fail loud. v0.2 P1 dual-shape parser + v0.2 P10 closed-schema TS extension is the contract. (DD-113)
