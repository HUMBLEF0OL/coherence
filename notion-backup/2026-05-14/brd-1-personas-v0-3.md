<!-- url: https://www.notion.so/35c010d46a7081028c7ac3287ae9a51c -->
<!-- id: 35c010d4-6a70-8102-8c7a-c3287ae9a51c -->
<!-- title: 👥 BRD-1 — Personas & Use Cases (v0.3) -->
**Parent:** [BRD](https://www.notion.so/35c010d46a708133b65dfad745442bf0) · **Status:** Draft 2026-05-10 (post DD-117/118 amendments)

Four personas drive v0.3 scope. P1 carries forward from v0.2; P2–P4 are new in v0.3.

- P1 · Solo developer (continued from v0.2). One repo, one machine. v0.3 changes nothing material; install via marketplace instead of git clone, optional opt-in monorepo scope.
- P2 · Team developer (new in v0.3). Multi-developer shared repo. Wants team's accepted ignore rules (DD-096) propagated, wants teammate proposals visible (DD-099 file-only plan store), wants per-developer privacy on signals (DD-109).
- P3 · Tech lead / reviewer. Needs proposal-cache audit trail. Reads identity = SHA-256 of git email (DD-107) but sees plain name in CLI display.
- P4 · Marketplace browser (new in v0.3). First-time user discovering cohrence on Anthropic plugin registry. First-run UX initialises empty state (DD-094 superseded by DD-118) and surfaces telemetry consent (DD-115).

Use-case coverage matrix:
- P1 → G-3 monorepo scope, G-6/G-8 carry-overs, continued v0.2 features.
- P2 → G-2 team-shared ignore, G-4 cross-team plans, G-5 metrics share-out.
- P3 → G-4 audit trail; `/coherence:status` for ignored_by_team; identity hashing in audit log.
- P4 → G-1 marketplace install + first-run UX.
