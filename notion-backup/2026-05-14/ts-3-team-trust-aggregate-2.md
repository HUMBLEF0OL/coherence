<!-- url: https://www.notion.so/35f010d46a7081e7a51cc847d2bf716d -->
<!-- id: 35f010d4-6a70-81e7-a51c-c847d2bf716d -->
<!-- title: TS-3 — Team Trust Aggregate -->
TS-3 — TEAM TRUST AGGREGATE. Maps to FR-LEDGER-2, FR-LEDGER-3, FR-LEDGER-4, FR-LEDGER-5, NFR-PRIVACY-N6, DD-132, DD-140.
Architecture: one file per active team developer at coherence/trust/<author-hash>.json (committed). No single aggregate file. Aggregate computed at read time.
Per-developer file schema: schema_version (1), author_hash (12 hex), last_synced_at (ISO), scores (map sectionRef → {score, as_of}).
Privacy (NFR-PRIVACY-N6): only hashed author_hash. No email, IP, machine ID, commit hash, file paths beyond sectionRef.
Author hash: SHA-256(git config user.email lowercased trimmed), first 12 hex chars. Stable across sessions/machines for same email. Unset email → fail with actionable error.
/coherence:trust sync algorithm: derive own author_hash; read personal ledger summary scores; build file content; atomic tmp+rename to coherence/trust/<author-hash>.json. User commits.
Aggregate computation (DD-140 pass1) — read-time only, no cache: glob coherence/trust/*.json; parse, validate; filter active where (now - last_synced_at) < 180 days; for each sectionRef across active files, aggregate = arithmetic mean of contributors; contested flag (FR-LEDGER-4 pass3): |aggregate| < 0.2 AND ≥ 2 contributors.
/coherence:trust --prune-stale (FR-LEDGER-3 pass3): list files where (now - last_synced_at) > 365 days; print proposed deletions; --yes required; deletes; user commits removal. Returning developer's next sync recreates.
API (src/state/teamAggregate.ts): deriveAuthorHash, writeOwnFile, computeAggregate (always fresh O(files×sections)), listStaleFiles, pruneStale.
Perf: 20 active files × 1000 sections = 20k lookups, well under NFR-PERF-N6 200 ms.
Audit pass 1: writeOwnFile mkdirSync recursive; JSON.stringify produces native LF; deriveAuthorHash validates '@'; last_synced_at ISO 8601 Z.
Audit pass 2 #1: 'newline: LF' fs option does NOT exist; correct approach is JSON.stringify(obj, null, 2) which always emits LF. writeFileSync(path, content, 'utf8'). Atomic tmp+rename unchanged.
Snapshot vs live aggregate: team uses SNAPSHOT scores from each developer's last sync, NOT freshly decayed. Personal ledgers gitignored so live decay impossible. as_of timestamp exposed in /coherence:metrics.
