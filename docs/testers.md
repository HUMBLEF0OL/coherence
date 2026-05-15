# Testing coherence v1.1.0

Thanks for taking on the v1.1.0 pre-release window. This is a ~1-week
testing pass against three external reviewers; your feedback is what
gates the GA tag.

## What this pre-release is

v1.1.0 bundles four phases of foundational hygiene + feedback-loop work
on top of v1.0.x. The big surface changes:

- Plugin renamed from `cohrence` → `coherence` (slash commands now
  `/coherence:<name>`).
- Slash dispatch is native — the legacy
  `<!-- coherence-command: ... -->` sentinel is gone.
- 27 slash commands consolidate into 17 (`propose-*`, `plan-*`,
  `*-statusline` become subcommand routers).
- New `userConfig` block at install time (`defaultMode`,
  `telemetryOptIn`) — no more hand-editing config files.
- New `/coherence:feedback` command (this is how you file the issue).

## Install

Pin to the pre-release tag (replace `v1.1.0-rc.1` with whichever tag
your invite mentions):

```bash
claude plugin marketplace add HUMBLEF0OL/coherence@v1.1.0-rc.1
claude plugin install coherence@coherence --scope local
```

Confirm hooks registered:

```bash
claude plugin details coherence@coherence
```

You should see at least one hook listed.

## Filing feedback

When something surprises you — good or bad — run:

```
/coherence:feedback
```

The command renders a JSON bundle (plugin version, mode, last ~10
events, your redacted note). Copy it into the **Feedback bundle** field
of the [tester-feedback issue template][template] on GitHub, add your
name in the **Tester** field, and submit.

The bundle redacts any absolute path that points outside your project
root. Eyeball it before pasting — if it looks like it still contains
something sensitive, edit before submitting.

[template]: https://github.com/HUMBLEF0OL/coherence/issues/new?template=feedback.yml

## Triage cadence

Issues you file get triaged within 24h on weekdays:

- **P1** (regression / install failure): patched on `dev`, new rc tag
  cut, you're pinged to re-test.
- **P2 / P3** (rough edge / docs gap): queued for the v1.1.x stream or
  a follow-up phase.

## Opting out

To leave the pre-release window cleanly:

```bash
claude plugin uninstall coherence@coherence --scope local --yes
claude plugin marketplace remove coherence
```

That removes both the install and the marketplace entry. Your local
`.claude/coherence/` directory is untouched — delete it manually if
you want a clean slate.

## FAQ

**Q: The first run prompts me about telemetry. What's the right answer?**

Local collection is default-on (events stay on your machine under
`.claude/coherence/metrics.jsonl`). Upload is default-off and only
happens if you explicitly run `/coherence:export-metrics` and curl
the file yourself. The `userConfig` toggle lets you change the
upload default at install time.

Flipping userConfig values in Claude Code's settings later propagates
on the next SessionStart: the plugin records the last-seen env value
and re-applies whenever it differs. So `telemetryOptIn=true` after
install will turn upload on at the next session; flipping back to
`false` will turn it off. CLI overrides (`/coherence:consent --upload
off`, `/coherence:graduate ...`) are preserved as long as userConfig
itself hasn't changed.

**Q: Auto-apply fired on a section I didn't expect.**

That's exactly the kind of thing this window is for. Run
`/coherence:feedback`, paste the bundle, file the issue. Include the
section ref if you can find it in the trust ledger.

**Q: I want to start clean between tests.**

`rm -rf .claude/coherence/` resets all per-developer state. Re-running
any hook (e.g. starting a new session) re-creates the skeleton.
