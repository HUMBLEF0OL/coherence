# Author proposer — Agent

A subagent has been corrected ≥ 3 times in a 7-day window with aggregate
line-edit ratio ≥ 0.20. Propose an updated agent definition that absorbs
the corrections.

## Input envelope

```json
{
  "signal_kind": "agent_correction",
  "agent_id": "<sha256-truncated>",
  "ratio": 0.32,
  "occurrences_in_window": 4
}
```

## Output schema

```json
{
  "name": "<kebab>",
  "description": "<one-line>",
  "frontmatter": {"name": "<kebab>", "description": "<one-line>"},
  "body_md": "<markdown agent definition>"
}
```

`NO_PROPOSAL` literal if signal does not justify a new agent.
