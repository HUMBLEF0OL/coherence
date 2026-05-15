# Rollback

Per DD-118 there is no cross-major migration. Each major version
stands alone. The rollback paths below cover everything that can be
undone within the current major.

## Rolling back a coherence commit

Coherence commits are prefixed `[coherence]` in the commit message.
After reverting, run `/coherence:repair` to re-sync the buffer state
with the current docs.

```bash
# If the [coherence] commit is HEAD
git revert HEAD --no-edit

# Otherwise, find the commit hash first
git log --oneline | grep '\[coherence\]'
git revert <sha> --no-edit
```

## Same-major rollback (`/coherence:recover`)

```bash
/coherence:recover                          # clear stale state, re-arm
/coherence:recover --target v1.0.0          # rollback to a specific same-major tag
```

Cross-major refusal: `/coherence:recover --target <tag>` refuses when
the SemVer major digit of `<tag>` differs from the installed version
(DD-095 amended under DD-118).

`/coherence:recover` (no target) clears:

- The `auto-disabled` sentinel (NOT the manual `DISABLED` kill-switch
  — manual removal of `DISABLED` is still required).
- Stale lock-manager state.
- `stop-progress.json` (Stop-pipeline checkpoints).
- Quarantine directory contents.

## Cross-major: re-install, don't migrate (DD-118)

Major-version bumps may break the on-disk format. Operators re-install
rather than migrate. SessionStart guards this with `refuseLegacy()`:

- Pre-v3 state on disk → refused with an actionable message.
- Future-major state on disk → distinct "future-major" message so the
  operator doesn't delete state thinking it's legacy.

`.claude/coherence/` (per-project state) is **preserved** across plugin
re-install. The layout-refusal guard (`refuseLayout`) also refuses a
pre-v0.4 `plugin.json`-at-root shape (DD-122 / DD-124).

## Trust-ledger rollback

The personal `trust-ledger.json` survives plugin re-install (DD-118
file-only). The team-aggregate files under `coherence/trust/` are
committed; rollback is just `git revert`.

If a `sectionRef` rename or file deletion leaves orphan ledger keys,
`/coherence:repair` cleans up:

```bash
/coherence:repair                                      # default: report orphans + clear stale state
/coherence:repair --reassociate <oldRef> --to <newRef> # atomic trust-key move
/coherence:repair --expire-orphans                     # bulk-drop orphan keys
```

Each branch writes a `coherence-log.md` entry recording the action.

## Proposal lifecycle rollback

| Surface              | Rollback                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Statusline install   | `/coherence:statusline uninstall` — restores the previous `~/.claude/settings.json` backup |
| Accepted proposal    | `/coherence:propose revert-acceptance <id>` (DD-083) — restores doc + state → `reverted`  |
| All quarantine       | `rm -rf .claude/coherence/proposals/`                                                     |
| Disable entirely     | `touch .claude/coherence/DISABLED` (manual kill-switch; permanent until you delete it)    |

## Recovering from corrupt state

Files that fail schema validation are auto-quarantined to
`.claude/coherence/quarantine/`. To inspect / clear:

```bash
ls .claude/coherence/quarantine/
/coherence:recover                # clears quarantine
```

For persistent state issues, manually delete the offending file —
SessionStart re-initialises atomically on next launch:

```bash
rm .claude/coherence/stop-progress.json
rm .claude/coherence/drift-buffer.json
```

## Cosign-signed release rollback

If a release introduces a regression and you need to ship an emergency
patch (e.g. v1.0.1):

1. Cut a new tag (e.g. `git tag -a v1.0.1 -m "..."`).
2. Push the tag — the GitHub Actions `release.yml` workflow signs the
   new tarball with cosign keyless OIDC and uploads `.sig` + `.pem` +
   `.sha256` artifacts.
3. The previous signed tarball remains attached to its release —
   verifiable indefinitely via Rekor (<https://search.sigstore.dev/>).

There is no "unsign" operation; signatures are append-only history.

## Telemetry consent reset

```bash
/coherence:consent --reset       # restore silent defaults (local ON, upload OFF)
```

Clears `.claude/coherence/config.json#telemetry`; re-prompts on the
next interactive session.

## Auto-disable cascade

If three hook exceptions occur within a session, coherence auto-disables
itself (FR-FAILURE-6, FR-DEGRADED-1). The session continues normally
without coherence interference. Re-arm with `/coherence:recover`;
`/coherence:doctor` will then re-probe host capabilities on the next
session.

## RB-1..RB-5 rollback gates

| Gate | Coverage |
| ---- | -------- |
| RB-1 | `git revert` undoes a coherence commit — `tests/rollback/migration.test.ts` |
| RB-2 | Atomic write prevents partial state — `tests/rollback/atomic-write.test.ts` |
| RB-3 | Quarantine preserves corrupt files — `tests/rollback/quarantine-retention.test.ts` |
| RB-4 | Kill-switch stops all processing — `tests/rollback/kill-switch.test.ts` |
| RB-5 | Crash self-disable + recovery — `tests/rollback/crash-self-disable.test.ts` |
