<!-- url: https://www.notion.so/35f010d46a7081ea80a5c98c9e315246 -->
<!-- id: 35f010d4-6a70-81ea-80a5-c98c9e315246 -->
<!-- title: TS-2 — Trust Ledger (Personal) -->
TS-2 — TRUST LEDGER (PERSONAL). Maps to FR-LEDGER-1, FR-LEDGER-5, NFR-TRUST-1, NFR-TRUST-2, NFR-PERF-N8, DD-138, DD-144.
File: .claude/coherence/trust-ledger.json. Gitignored. Per-developer. Schema version 3.
Schema: schema_version (3), events (map sectionRef → event[]), summary (map sectionRef → score record), promoted_at, promote_hint_emitted_at, auto_land_kinds.
Event record: _ts (ISO), weight (+1.0 accept, 0.0 edit, -1.0 revert), kind.
Summary record: score [-1.0,+1.0], score_computed_at, event_count. Recomputed lazily when stale.
Init (FR-LEDGER-5): absent file = empty ledger. First write creates.
Atomic write (NFR-TRUST-1): read → mutate → LRU 200 (sort by _ts then slice -200) → write tmp → rename. Windows EBUSY retry via existing v0.3 helper.
Score (DD-138 pass2): age_days = (now - _ts)/days; decay = 0.977^age_days; numerator weight: accept=+1, revert=-1, edit=0; denominator: accept=1.0, revert=1.0, edit=0.5. Div-zero guard: denom < 0.001 → 0.0. Result in [-1,+1].
API (src/state/trustLedger.ts): recordEvent, getSectionScore, checkPromoteEligibility, promote(authLandKinds), listOrphanedKeys, reassociateKey, expireOrphans.
Perf (NFR-PERF-N8): O(min(n,200)); Stop-hook < 20 ms p95 with 100 sections. Lazy recompute.
Re-install (FR-LEDGER-5/DD-118): trust-ledger.json preserved in .claude/coherence/.
Audit pass 1: LRU sorted by _ts (clock-skew safe); empty events → delete summary entry; getSectionScore missing → 0.0; deriveAuthorHash validates @; ISO 8601 with Z suffix.
Audit pass 2: event_count = LRU-capped post-eviction length, NOT all-time. Timestamps via toISOString() (always LF, sortable). Sort-on-write O(n log n) at n=200 ~1500 ops <1ms.
