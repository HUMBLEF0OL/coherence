# Coherence v1.1.0

Phase 1 foundational-hygiene release. The runtime pipeline is
unchanged — Stage 1 / Stage 2, trust ladder, asserts engines, cosign
signing all behave identically to v1.0.3. The five moves here are
infrastructure: a typo-fix rename across every install surface, a
switch from a custom slash-command dispatcher to Claude Code's native
`/<plugin>:<command>` namespacing, Windows-friendly line-ending
normalisation, an atomic single-source-of-truth version-bump script,
and weekly Dependabot PRs for npm + github-actions.

No behaviour change in the planner, patcher, validation pipeline, or
hooks beyond dispatch routing. Existing marketplace installations
need a one-time re-add under the new slug — see migration callout
below.

## Highlights

- **C1 — `cohrence` → `coherence` rename.** The historical typo is
  retired across the npm package slug, plugin name, marketplace name,
  and every doc reference. New install path:
  `claude plugin install coherence@coherence`. Existing
  `cohrence@cohrence` installs continue to work for the lifetime of
  the old marketplace pin but won't receive updates after v1.0.3 —
  re-add per `docs/migration/v1.1.0-rename.md`.
- **M4 — Native slash-command namespacing.** Dropped the bespoke
  `UserPromptSubmit` hook that parsed `/coherence:foo` and dispatched
  by hand. Claude Code 2.1+ natively handles `/<plugin>:<command>`
  routing via `.claude-plugin/plugin.json#slashCommands` entries, so
  the custom dispatcher was deadweight. Removes ~one hook handler and
  the associated parse/routing surface; behaviour is identical for
  end users. All 21 slash commands continue to resolve.
- **M2 — `.gitattributes` LF enforcement.** Added a `.gitattributes`
  with `* text=auto eol=lf` plus explicit `text eol=lf` for source,
  JSON, Markdown, and shell. Kills the CRLF/LF churn that plagued
  Windows checkouts of the repo (every commit from a Windows clone
  was rewriting line endings on tracked files). Existing checkouts
  should `git add --renormalize .` once after pull; this happens
  silently on next push.
- **M3 — `npm run bump <ver>` + `package.json`-derived `TAG`.**
  One command now atomically updates all 7 version-of-record
  sources: `package.json`, `package-lock.json`,
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
  (`version` field), `.claude-plugin/marketplace.json`
  (`source.ref` field → prefixed `v`), and `src/state/init.ts`'s
  `PLUGIN_VERSION` constant. Validation happens before any disk
  write — a bad input fails the whole bump rather than leaving the
  repo in a mixed state. `release-ga.mjs` no longer needs an
  explicit `TAG=v1.1.0` env var; it now derives the tag from
  `package.json#version`.
- **T7 — Dependabot weekly auto-PRs.** Added `.github/dependabot.yml`
  with `npm` (root) and `github-actions` (`.github/workflows`)
  ecosystems, weekly cadence, grouped minor/patch PRs. Major
  bumps come through as individual PRs so they get human review.

## Migration

Existing marketplace installers of `cohrence@cohrence` re-add under
the new slug per `docs/migration/v1.1.0-rename.md`.

The short version:

```bash
# Remove the old slug
claude plugin uninstall cohrence@cohrence
claude plugin marketplace remove cohrence

# Add under the new slug
claude plugin marketplace add HUMBLEF0OL/coherence@v1.1.0
claude plugin install coherence@coherence
```

State files under `.coherence/` carry over unchanged. The directory
name and on-disk schema are untouched in this release — only install
surface names changed.

## Install (v1.1.0)

```bash
claude plugin marketplace add HUMBLEF0OL/coherence@v1.1.0
claude plugin install coherence@coherence
```

Or, once master tracks the latest tag:

```bash
claude plugin marketplace add HUMBLEF0OL/coherence
claude plugin install coherence@coherence
```

## Upgrade from v1.0.3

Marketplace users — follow the **Migration** section above; the slug
changed.

For users who registered the plugin as a local plugin via
`--plugin-dir`, no upgrade needed; the next session loads the new
code from disk.

## Verification

```bash
cosign verify-blob coherence-1.1.0.tgz \
  --signature coherence-1.1.0.tgz.sig \
  --certificate coherence-1.1.0.tgz.pem \
  --certificate-identity-regexp 'https://github.com/HUMBLEF0OL/coherence/.github/workflows/release.yml@refs/tags/v1.1.0' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## What did NOT change

- Two-stage Stage 1 / Stage 2 pipeline — identical.
- Trust ladder + per-section auto-apply gate (DD-131) — identical.
- Asserts engines (eight engines, including `symbol_exported`) —
  identical.
- Cassette system, hallucination corpus, language registries —
  identical.
- Hook surface beyond removed UserPromptSubmit dispatcher —
  identical.
- Plugin manifest schema — same as v1.0.3.
- `.coherence/` state directory layout and on-disk schemas —
  identical.

## Test gates passed

- typecheck (`tsc --noEmit`): clean
- lint (`eslint src tests`): clean
- build (`npm run build`): clean
- vitest: all green
- gates (`npm run gates`): all green
- plugin validate (`scripts/validate-plugin.mjs`): clean
- pack:size: recorded in commit body
