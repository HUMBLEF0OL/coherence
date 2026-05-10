# Author proposer — Slash command

A bash command has been observed ≥ 3 times in the last 30 minutes. Propose a
slash command that would automate it. Output is structural only — never
emit the raw bash command (the input is hashed).

## Input envelope

```json
{
  "signal_kind": "bash_repetition",
  "signal_hash": "<12-hex>",
  "signal_evidence": {
    "first_seen": "<iso>",
    "last_seen": "<iso>",
    "occurrences": 3,
    "command_shape_bucket": 1
  }
}
```

## Output schema

```json
{
  "name": "<short-kebab-name>",
  "description": "<one-line>",
  "frontmatter": {"name": "<kebab>", "description": "<one-line>"},
  "body_md": "<markdown body documenting the command>"
}
```

`NO_PROPOSAL` literal if the shape cannot motivate a command.
