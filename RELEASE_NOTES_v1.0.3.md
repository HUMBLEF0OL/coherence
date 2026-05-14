# Coherence v1.0.3

Post-v1.0.2 cleanup release. The headline change is a one-field fix in
`.claude-plugin/marketplace.json` that lets users without GitHub SSH
keys configured (the common case on Windows) actually install the
plugin from a tag-pinned marketplace. Everything else is housekeeping:
lint cleanup, CI version bumps, an E2E test-suite closure for the
mcp-sentry rename-drift fixture, and a notion docs redesign. No
runtime-pipeline changes; the two-stage planner/patcher, trust ladder,
asserts engines, and cosign signing are all untouched.

## Highlights

- **Marketplace source shape switched from `github` to `url` + HTTPS**
  so the plugin install path works on hosts without SSH configured
  for `git@github.com:`. Functionally equivalent — same repo, same
  ref — just expressed as the explicit HTTPS URL. Smoke-tested
  end-to-end: `claude plugin marketplace add HUMBLEF0OL/coherence@v1.0.3`
  → `claude plugin install cohrence@cohrence` now completes (cloned
  over HTTPS, 7 hooks registered).
- **Lint clean.** Two leftover non-null assertions removed (one in
  `tests/e2e/E2E-11-rename-drift-fixture.test.ts:238`, one in
  `tests/unit/scripts/render-readme-verification.test.ts:81`). `tsc`
  + the dependent tests stay green.
- **Vitest fully clean.** `tests/unit/scripts/render-readme-verification.test.ts`
  was failing to load (V8 parse error at byte 0 from a `#!` shebang
  preserved by Vite's transformer in an ESM-loaded `.mjs`). Shebang
  dropped from `scripts/render-readme-verification.mjs` — the script
  is invoked exclusively via `node …` from npm scripts, direct
  execution was never used. Suite goes from 1103/1103 (one load
  failure) to 1110/1110.
- **mcp-sentry M2 E2E closure.** Real Stage 1 + Stage 2 cassettes
  recorded against the mcp-sentry `gradeBelow → isBelowThreshold`
  rename-drift fixture at upstream commit `9097294`, committed under
  `tests/cassettes/mcp-sentry/` for deterministic replay. The
  recorder (`scripts/record-mcp-sentry-cassettes.mjs`) drives Stage 1
  + Stage 2 through Claude Code subscription auth, bails by default
  if cassettes already exist (`--force` to overwrite). `E2E-12` locks
  in the four recorded responses. Frozen fixture snapshot under
  `tests/fixtures/mcp-sentry/` so CI doesn't depend on an external
  checkout.
- **GitHub Actions runner bumps** ahead of the Node 20 deprecation
  schedule (2026-06-02 forced default to Node 24; 2026-09-16
  removal): `actions/checkout` v4→v5, `actions/setup-node` v4→v5,
  `release.yml node-version` 20→24, `ci.yml` single-version jobs
  20.x→24.x, typecheck + unit matrices now `[20.x, 22.x, 24.x]`
  (20.x kept as the floor matching `package.json#engines.node`).
- **Notion docs redesign** for the project workspace — implementation
  plans archive, audit findings round 1 + 2 applied. Source-tree
  impact is doc-only.

## The marketplace.json fix — before and after

### Before (v1.0.2, fails over SSH on hosts without GitHub keys)

```json
{
  "plugins": [
    {
      "source": {
        "source": "github",
        "repo": "HUMBLEF0OL/coherence",
        "ref": "v1.0.2"
      }
    }
  ]
}
```

The `github` shorthand in Claude Code 2.1.139 defaults to `git@github.com:`
for plugin-source clones and does **not** auto-fall-back to HTTPS the
way the top-level `marketplace marketplace add` flow does. Hosts without
an SSH key registered against the user's GitHub account hit
`Permission denied (publickey)` during install.

### After (v1.0.3, explicit HTTPS)

```json
{
  "plugins": [
    {
      "source": {
        "source": "url",
        "url": "https://github.com/HUMBLEF0OL/coherence.git",
        "ref": "v1.0.3"
      }
    }
  ]
}
```

Same repo, same release pin. The `url` source type uses the URL
verbatim, so HTTPS is unambiguous and the install works regardless of
the host's SSH configuration. `marketplace.plugins[0].source.ref` is
still asserted equal to the tag by `assertVersionSync` in
`scripts/release-ga.mjs:54`, so the version-sync invariant is
preserved.

## Install (v1.0.3)

```bash
claude plugin marketplace add HUMBLEF0OL/coherence@v1.0.3
claude plugin install cohrence@cohrence
```

Or, once master tracks the latest tag, the bare form also works:

```bash
claude plugin marketplace add HUMBLEF0OL/coherence
claude plugin install cohrence@cohrence
```

For the official Anthropic-marketplace one-liner
(`claude plugin install cohrence`) to start working, the submission at
`claude.ai/settings/plugins/submit` (M3) still needs to land — that's
external review, not blocked on this release.

## Upgrade from v1.0.2

```bash
claude plugin marketplace update cohrence
claude plugin update cohrence
```

For users who registered cohrence as a local plugin via `--plugin-dir`,
no upgrade needed; the next session loads the new code from disk.

## Verification

```bash
cosign verify-blob cohrence-1.0.3.tgz \
  --signature cohrence-1.0.3.tgz.sig \
  --certificate cohrence-1.0.3.tgz.pem \
  --certificate-identity-regexp 'https://github.com/HUMBLEF0OL/coherence/.github/workflows/release.yml@refs/tags/v1.0.3' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## What did NOT change

- Two-stage Stage 1 / Stage 2 pipeline — identical.
- Trust ladder + per-section auto-apply gate (DD-131) — identical.
- Asserts engines (eight engines including `symbol_exported` from
  v1.0.1 Fix 8) — identical.
- Cassette system, hallucination corpus, language registries —
  identical.
- Plugin manifest schema — same as v1.0.2.

## Test gates passed

- typecheck (`tsc --noEmit`): clean
- lint (`eslint src tests`): 0 errors / 0 warnings
- build (`npm run build`): clean
- claude plugin validate: clean (one informational CLAUDE.md warning,
  intentional — see v1.0.2 notes)
- vitest: 1110 / 1110
- gates (`npm run gates`): all green
