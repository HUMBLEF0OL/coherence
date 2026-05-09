# Coherence Rollback Procedures (DG-4)

## Rolling Back a Coherence Commit

Coherence commits are prefixed `[coherence]` in the commit message. To roll back:

```bash
# If the [coherence] commit is the most recent commit
git revert HEAD --no-edit

# If it's not HEAD, find the commit hash
git log --oneline | grep '\[coherence\]'
git revert <sha> --no-edit
```

After reverting, run `/coherence:repair` to re-sync the buffer state with the current docs.

---

## Clearing Stuck Plugin State

If coherence is stuck (e.g., after a crash mid-pipeline):

```
/coherence:recover
```

This clears:
- `auto-disabled` sentinel
- Stale lock state
- `stop-progress.json` (orphaned crash progress)
- Quarantine directory

For persistent issues, manually delete the coherence state:

```bash
rm -rf .claude/coherence/stop-progress.json
rm -rf .claude/coherence/drift-buffer.json
```

---

## Disabling Coherence

To disable coherence for a session (manual kill-switch):

```bash
touch .claude/coherence/DISABLED
```

To re-enable:

```bash
rm .claude/coherence/DISABLED
```

Note: `/coherence:recover` does **not** remove the `DISABLED` sentinel — only manual deletion does.

---

## Recovering from Corrupted State

If state files are corrupt, coherence automatically quarantines them to `.claude/coherence/quarantine/`.

To inspect:

```bash
ls .claude/coherence/quarantine/
```

To clear:

```
/coherence:recover
```

---

## Schema Migration Issues

If a migration fails:

1. Check `.claude/coherence/quarantine/` for the corrupt file.
2. Run `/coherence:repair` to re-validate state.
3. If necessary, delete `version.json` to force re-initialization:
   ```bash
   rm .claude/coherence/version.json
   ```
   Coherence will re-create it on next SessionStart.

---

## RB-1..RB-5 Rollback Gates

| Gate | Test | Coverage |
|---|---|---|
| RB-1 | `git revert` undoes coherence commit | `tests/rollback/migration.test.ts` |
| RB-2 | Atomic write prevents partial state | `tests/rollback/atomic-write.test.ts` |
| RB-3 | Quarantine preserves corrupt files | `tests/rollback/quarantine-retention.test.ts` |
| RB-4 | Kill-switch stops all processing | `tests/rollback/kill-switch.test.ts` |
| RB-5 | Crash self-disable + recovery | `tests/rollback/crash-self-disable.test.ts` |
