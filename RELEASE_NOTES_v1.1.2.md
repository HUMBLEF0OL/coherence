# Coherence v1.1.2

Phase 3 documentation-pass release. No runtime change — Stage 1 / Stage
2, validation chain, trust ladder, asserts engines, and the hook surface
all behave identically to v1.1.1 (whose commits land cumulatively in this
release, as Phase 2 was never separately tagged). The five moves here
are pure docs + one static-analysis gate that protects them:

- **X1** — ADR register repo mirror infrastructure at `docs/adr/`
  (one-way repo→Notion sync; bulk content import continues
  incrementally).
- **X2** — three extension tutorials: asserts engine, hallucination
  language registry, hook event handler.
- **X3** — hand-curated Mermaid architecture diagram + narrative at
  `docs/architecture.md`.
- **X4** — operator-grade failure-modes catalog at
  `docs/failure-modes.md`.
- **X5** — competitive comparison at `docs/comparison.md` (Coherence vs
  vale / lychee / markdownlint / docs-as-tests / doing nothing).

Plus a static-analysis gate (`tests/static-analysis/docs-link-check.test.ts`)
that fails CI when a relative markdown link inside `docs/**` points at a
missing file. Cheap insurance against drift in the very directory that
lectures about drift.

## Highlights

- **X3 — Architecture doc.** `docs/architecture.md` ships two
  GitHub-renderable Mermaid diagrams (Stop-pipeline data flow and the
  zoomed-in validation chain) plus a god-node table cross-referencing
  the canonical implementation files. Complements `graphify-out/`'s
  community-detection graph with a deliberate teaching view.
- **X2 — Three extension tutorials.** Each follows the same shape
  (what / where / interface / worked example / tests / gotchas) so
  contributors can copy-paste and adapt. Asserts engines
  (`docs/extensions/how-to-add-an-asserts-engine.md`), hallucination
  language registries
  (`docs/extensions/how-to-add-a-language-to-hallucination-detection.md`),
  and hook event handlers
  (`docs/extensions/how-to-add-a-hook-event-handler.md`) — the three
  extension surfaces a new contributor would touch first.
- **X4 — Failure-modes catalog.** `docs/failure-modes.md` documents
  every per-developer state file under four scenarios (healthy /
  quarantined / locked / missing), the sentinel inventory, the
  degraded-mode triggers + clear path, and the trust-orphan repair
  flow surfaced through `/coherence:repair`. Aimed at the solo-operator
  scenario where the only debugging substrate is the JSON file on disk.
- **X5 — Comparison piece.** `docs/comparison.md` honestly positions
  Coherence against vale, lychee, markdownlint, CodeQL on doc paths,
  manual docs-as-tests, and the do-nothing baseline. Explicit "when NOT
  to use Coherence" section to avoid overclaiming.
- **X1 — ADR register seed.** `docs/adr/` is now the repo-canonical
  mirror of the Notion DD register (DD-001..DD-147). Ships with the
  README template, the per-DD shape, and one worked example
  ([DD-117 — no backend, ever](docs/adr/DD-117-no-backend-file-only.md)).
  Remaining decisions land incrementally as content is extracted from
  Notion — not gated on this release.
- **Link-check gate.** `tests/static-analysis/docs-link-check.test.ts`
  walks `docs/**` (excluding the maintainer-private `docs/superpowers/`
  working-notes subtree), strips fenced + inline code spans, and
  asserts every `[label](relative-path)` link resolves to an existing
  file on disk.
- **Phase 3 bundles Phase 2 commits.** v1.1.1 was never separately
  tagged. All Phase 2 work — propose-/plan-/statusline-router
  consolidation (C3), `userConfig` schema (C4), tester-onboarding
  feedback command (S6), install-smoke CI (D3), audit findings B1..B3
  + E1..E3, native slash-command bodies wired through `dist/cli.js` —
  ships cumulatively in v1.1.2.

## Migration

None. Pure docs + one new test file. Re-install or pull as usual.

## Install (v1.1.2)

```bash
claude plugin marketplace add HUMBLEF0OL/coherence@v1.1.2
claude plugin install coherence@coherence
```

Or, once master tracks the latest tag:

```bash
claude plugin marketplace add HUMBLEF0OL/coherence
claude plugin install coherence@coherence
```

## Verification

```bash
cosign verify-blob coherence-1.1.2.tgz \
  --signature coherence-1.1.2.tgz.sig \
  --certificate coherence-1.1.2.tgz.pem \
  --certificate-identity-regexp '^https://github.com/HUMBLEF0OL/coherence/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## What did NOT change

- Two-stage Stage 1 / Stage 2 pipeline — identical.
- Trust ladder + per-section auto-apply gate (DD-131) — identical.
- Asserts engines (eight engines, including `symbol_exported`) —
  identical.
- Hallucination corpus + language registries — identical.
- Cassette system — identical.
- Hook surface — identical.
- Plugin manifest schema — same as v1.1.0.
- `.claude/coherence/` state directory layout and on-disk schemas —
  identical.

## Test gates passed

- typecheck (`tsc --noEmit`): clean
- lint (`eslint src tests`): clean
- vitest static-analysis suite (24 tests including the new
  `docs-link-check`): all green
- build (`npm run build`): clean — README cosign block regenerated for
  `coherence-1.1.2.tgz`

Full release-gate transcript appears in the chore(release) commit body.
