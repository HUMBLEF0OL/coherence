# Annotate proposer — Anchor placement

Input is an anchor-less doc + heading structure. Output a placement plan:
where to insert `<!-- coherence:section <id> -->` HTML comments above each
heading, and a frontmatter `auto-annotated: true` flag (DD-069).

## Output schema

```json
{
  "name": "<doc-basename-kebab>",
  "description": "auto-annotation",
  "frontmatter": {"auto-annotated": true},
  "anchors": [
    {"line": 12, "id": "introduction"},
    {"line": 34, "id": "usage"}
  ],
  "body_md": "<unchanged or reflowed body>"
}
```

If sidecar fallback is required (host strips unknown frontmatter keys),
output `sidecar` field instead of `frontmatter`.

`NO_PROPOSAL` literal if the doc already has anchors or is in the denylist.
