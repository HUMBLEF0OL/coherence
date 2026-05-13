# Coherence v1.0.0 — Release Notes

**Release date:** 2026-05-13
**Codename:** trust + intelligence

v1.0 is the first **major** release. It introduces per-section trust
ladders, cross-session learning, the `asserts:` frontmatter pipeline, deep
audit with cost gates, and Sigstore-signed release artifacts.

## Highlights

- **Per-section trust ladder** — `coherence:trust` tracks accept / edit /
  revert events per `sectionRef`. Modifying patches auto-apply once a
  section's score crosses `0.85`. Destructive and frontmatter patches
  always require explicit confirmation regardless of score.
- **Cross-session learning** — committed `coherence/trust/<author-hash>.json`
  files let teams see per-section trust at a glance; aggregate score is the
  arithmetic mean across active contributors (180-day window).
- **`asserts:` frontmatter pipeline** — 7 assertion engines
  (`has_example`, `no_placeholder_links`, `max_words`, `min_words`,
  `no_todo_comments`, `symbol_exists`, `file_exists`) with per-assertion
  `block` / `warn` policy.
- **Quality metrics** — `/coherence:metrics` renders a 5-section report:
  summary, top drifting sections, trust scores, cost trend (Unicode
  sparkline), revert hotspots.
- **Deep audit** — `/coherence:audit --deep` runs an LLM cross-section
  consistency pass. Flag-based confirmation (`--confirm-deep <signature>`)
  prevents accidental cost spend; CI bypass via `--no-confirm` only when
  `CI=true`.
- **Signed releases** — Sigstore `cosign` keyless OIDC via GitHub Actions.
  README `## Verification` block regenerated from `package.json#repository.url`.

## New slash commands

- `/coherence:trust` — `--status` (default), `sync`, `--promote --auto-land <kinds>`, `--prune-stale --yes`.
- `/coherence:metrics` — `--since`, `--revert-threshold`, `--out`, `--allow-out-of-tree`.

## Extended slash commands

- `/coherence:audit` — gained `--deep`, `--confirm-deep <sig>`, `--no-confirm` (CI), `--sections`.
- `/coherence:repair` — gained `--reassociate <old> --to <new>` and `--expire-orphans` (alias `--auto-expire`).

## State file additions

- `.claude/coherence/trust-ledger.json` (gitignored, per-dev).
- `.claude/coherence/section-symbol-index.json` (gitignored cache).
- `coherence/trust/<author-hash>.json` (committed, per-dev).
- `cost-ledger.json` schema: `stage` enum gains `audit_deep`.

## Breaking changes

None. v1.0 is the first major release, but it sits on the v0.4 substrate
without backward-incompatible state changes.

- Existing `.claude/coherence/` state is preserved across re-install
  (DD-118 carry).
- Pre-v3 schema state is still refused at SessionStart (DD-118 retired
  cross-major migration; no v0.4 → v1.0 migration path is needed).
- Downgrade from v1.0 → v0.4: stop using new commands; `trust-ledger.json`
  and `coherence/trust/` files are ignored by older versions (see
  [`docs/rollback.md`](docs/rollback.md) → "Cross-major: re-install,
  don't migrate").

## Architectural commitments

- DD-117 carry — no backend, file-only.
- DD-118 carry — no cross-major migration; re-install preserves state.
- DD-065 amended — destructive + frontmatter patches still require
  confirmation; modifying patches auto-apply iff `score >= 0.85`.
- DD-128 carry — `/coherence:metrics --out` reuses the v0.4 sandbox helper.

## Verification

The v1.0.0 release tarball is signed with Sigstore cosign keyless OIDC. See
the **Verification** section of `README.md` for the verify command. The
certificate's transparency-log entry is searchable at
<https://search.sigstore.dev/>.

## Acknowledgements

Plan: archived to Notion ([Coherence — Implementation Plans (archive)](https://www.notion.so/35f0e95fc22381d68135fdcd4ac353c8));
full markdown preserved at git permalink
[`master/cb52271:docs/superpowers/plans/2026-05-13-coherence-v1.0.md`](https://github.com/HUMBLEF0OL/coherence/blob/cb52271eb9aa792bcbc36bd97af13ab65511d216/docs/superpowers/plans/2026-05-13-coherence-v1.0.md).
Specs: BRD v1.0 · TS-1..TS-8 v1.0 · DD-131..DD-147

## What's next (post-1.0)

- v1.1: per-section trust-ledger sharding for very large repos
  (Pass-3 Minor #4 if real-world telemetry shows breach of NFR-PERF-N8).
- v1.1: parallel assertion dispatch via `Promise.all` for sections with
  many codebase-linked asserts (Pass-3 Minor #3).
- Plugin marketplace listing review by Anthropic.
