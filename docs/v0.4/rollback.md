# Coherence v0.4 — Rollback

See `docs/v0.3/rollback.md` for the v0.3 baseline.

## v0.4 note on parseMajor (DD-124)

Prior to v0.4, `parseMajor` used `major * 1000 + minor` as the breaking-change key, treating
v0.3 → v0.4 as a cross-major bump. This was corrected: the key is now the SemVer major digit only.
All `0.x.y` versions are the same major bucket. Cross-major recovery refusal in
`/coherence:recover --target <tag>` only fires when the SemVer major digit differs (e.g. targeting
`v1.0.0` from a `v0.4.x` install).

Within-major-version recovery is unchanged.

## v0.4 note on manifest layout (DD-122)

If `cohrence` finds `plugin.json` at the plugin install root (v0.3 layout), SessionStart refuses to
proceed and prints:

> cohrence found plugin.json at the plugin root (v0.3 layout); re-install via `claude plugin install
> cohrence` to use the v0.4 layout — do NOT delete `.claude/coherence/` (your per-project state is
> intact)

The remediation is a re-install: `.claude/coherence/` (per-project state) is preserved.
