#!/usr/bin/env bash
# Coherence subagent statusline (DD-070, M3). Single-read, cancellation-safe.
set -eu
SNAP=".claude/coherence/state-snapshot.json"
if [ ! -f "$SNAP" ]; then
  exit 0
fi
if command -v jq >/dev/null 2>&1; then
  jq -r '
    if .degraded == true then "[🧭 sub ⚠]"
    elif (.proposal_counts.surfaced // 0) > 0 then "[🧭 sub \(.proposal_counts.surfaced)]"
    else "" end
  ' "$SNAP" 2>/dev/null || true
fi
