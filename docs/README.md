# coherence — Documentation Drift Detection for Claude Code

`coherence` is a Claude Code plugin that automatically detects and repairs drift between your codebase and its documentation. It watches for documentation changes during your session, then proposes surgical patches at session end (Stop) or on demand (`/coherence:review`).

## Installation

```bash
npm install -g coherence-plugin
```

Or add to your project:

```bash
npm install --save-dev coherence-plugin
```

Then add to `.claude/settings.json`:

```json
{
  "plugins": ["coherence"]
}
```

## Quick Start (Observe Mode)

On first launch, coherence starts in **Observe mode** — it watches and proposes patches for review, but never auto-applies.

1. Open a Claude Code session in your project.
2. Make changes to source files. Coherence tracks documentation sections via `<!-- coherence:section id="..." -->` anchors.
3. At session end, coherence runs its pipeline and shows proposed documentation patches.
4. Review each patch: accept, edit, or dismiss.

## Observe → Graduated Mode

Once you're comfortable, switch to **Graduated mode** to auto-apply additive patches:

```
/coherence:graduate
```

To revert:

```
/coherence:graduate --revert
```

In Graduated mode:
- **Additive** patches (new content only): auto-applied and committed as `[coherence] <summary>`.
- **Modifying** and **destructive** patches: still require your review.
- **Frontmatter** changes: always require confirmation.

## Slash Commands

See [commands.md](commands.md) for the full reference.

| Command | Description |
|---|---|
| `/coherence:status` | Show plugin status, buffer, costs |
| `/coherence:review` | Run Stop pipeline mid-session |
| `/coherence:review --estimate` | Estimate patches without applying |
| `/coherence:repair` | Fix anchor collisions and state issues |
| `/coherence:recover` | Clear auto-disable sentinel, reset locks |
| `/coherence:doctor` | Probe host capabilities |
| `/coherence:graduate` | Switch to Graduated mode |
| `/coherence:graduate --revert` | Return to Observe mode |
| `/coherence:enable-sidecars` | Provision sidecar files for hosts that strip frontmatter |
| `/coherence:share-metrics --anonymized` | Export anonymized metrics |

## State Files

See [state-files.md](state-files.md) for schema details.

Key files in `.claude/coherence/`:

| File | Description |
|---|---|
| `config.json` | Mode (observe/graduated), watches, ignores |
| `drift-buffer.json` | Pending documentation drift entries |
| `coherence-log.md` | Append-only audit log of applied patches |
| `metrics.jsonl` | Rolling 90-day event log |
| `cost-ledger.json` | Per-session LLM cost tracking |

## Rollback

See [rollback.md](rollback.md) for rollback procedures.

To roll back a coherence commit:

```bash
git revert HEAD  # if HEAD is the [coherence] commit
```

Or use `/coherence:recover` to clear stuck state.

## Known Limitations

<!-- coherence:section id="limitations" -->

- **DD-044 / FR-DETECT-9**: Mid-session branch switches are not detected. If you switch branches during a session, coherence re-validates at Stop time against the current branch state.
- **DD-006**: Greenfield mode (bootstrapping docs from scratch) is deferred to v0.2.
- **DD-014 / DD-036**: Trickle-scan throttling is deferred to v0.2. Large codebases may have initial scan latency.
- **LLM dependency**: Stage 1 (canonical selection) and Stage 2 (patch generation) require Anthropic API access. Without `ANTHROPIC_API_KEY`, coherence runs in no-op mode with a one-liner notice.

## Privacy

See [privacy.md](privacy.md) for full data-handling details.

- No project code or content is sent to Anthropic, only documentation section hashes and diffs.
- Metrics are stored locally in `.claude/coherence/metrics.jsonl` (90-day rolling window).
- Use `/coherence:share-metrics --anonymized` to export redacted metrics for support.
