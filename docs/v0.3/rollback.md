# v0.3 rollback

> v0.3 honours **DD-118 — no legacy version support burden**. There are no
> migrators across major-version bumps and no rollback to a prior major
> version. This page documents the rollback paths that DO exist within
> v0.3.

## Within-major-version rollback (DD-095 amended)

`/coherence:recover` accepts an optional `target` tag. When the target's
**major.minor** matches the running plugin's, recover proceeds normally
(clears the auto-disabled sentinel, resets locks, drops `stop-progress.json`,
empties quarantine). When it differs, recover refuses with:

```
cohrence does not roll back across major versions; re-install the target version manually
```

Implementation: [src/commands/recover.ts](../../src/commands/recover.ts).

## Cross-major-version (NOT supported)

A v0.2 install upgrading to v0.3 hits `refuseLegacy()` at SessionStart and
sees:

```
[coherence] cohrence v0.3 does not migrate from earlier major versions; remove `.claude/coherence/` or run on a fresh project
```

The hook returns cleanly without engaging degraded mode. The user resolves
by removing `.claude/coherence/` (the plugin lays down a fresh v3 sentinel
on next start) or by re-cloning the project.

Enforcement points:

- [src/state/refuseLegacy.ts](../../src/state/refuseLegacy.ts) — runtime
  contract; tested in [tests/unit/state/refuse-legacy.test.ts](../../tests/unit/state/refuse-legacy.test.ts)
- [src/state/migrate/index.ts](../../src/state/migrate/index.ts) —
  migration chain truncated; only the v0→v1 historical baseline survives,
  and it's no longer called at runtime
- [tests/ship/tarball-shape.test.ts](../../tests/ship/tarball-shape.test.ts) —
  M-LEGACY-1 ship-time gate asserts the tarball excludes `prompts/v1/` and
  `src/state/migrate/v1_to_v2.ts`

## Disable kill-switch (unchanged from v0.2)

```
touch .claude/coherence/DISABLED
```

Suppresses every v0.3 hook silently. Removing the file restores normal
operation. This is the project-wide off switch and overrides everything
else.

## Statusline

```
/coherence:uninstall-statusline
```

Restores the previous `~/.claude/settings.json` from the backup created at
install time. Unchanged from v0.2.
