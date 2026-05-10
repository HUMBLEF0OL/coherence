# monorepo-100 — synthetic perf fixture (M1, NFR-PERF-N4)

Built lazily by `tests/perf/scope-cache-cold-start.test.ts` via
`buildMonorepoFixture(100)`. The on-disk fixture is regenerated under a
temporary directory per test run so this static directory just records the
layout the helper produces:

- 100 simulated packages laid out as `packages/pkg<NN>/src/...`
- ~30% of packages have a `CLAUDE.md` at their root
- ~5% have a `coherence/scope.json` sidecar
- Each package has files at depths up to 8

The test exercises a cold-start scope-cache walk over every leaf and asserts
the total wall time stays below `NFR-PERF-N4 ≤ 200 ms` (DD-097 + DD-106).
