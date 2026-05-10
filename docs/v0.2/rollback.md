# v0.2 rollback procedures (DG-4)

## Statusline

```bash
/coherence:uninstall-statusline
```

Restores the most recent `~/.claude/settings.json.coherence-backup-<ts>`.

## Accepted proposal

```bash
/coherence:propose-revert-acceptance <id>
```

Removes the materialised file, transitions the FSM to `reverted`, and
appends a `[coherence-revert]`-prefixed row to `coherence-log.md` so the
v0.1 `revertDetect.ts` velocity-counter sweep picks it up next session.

## All quarantine state

```bash
rm -rf .claude/coherence/proposals/
```

Safe at any time — proposals are quarantined by construction (DD-065).
