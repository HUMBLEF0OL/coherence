#!/usr/bin/env bash
# Coherence statusline (DD-070, M3).
#
# Cancellation-safe: a single read of `.claude/coherence/state-snapshot.json`,
# no multi-step computation. Outputs the precomputed `text` field if any,
# otherwise empty (FR-STATUSLINE-6).
set -eu
SNAP=".claude/coherence/state-snapshot.json"
if [ ! -f "$SNAP" ]; then
  exit 0
fi
if command -v jq >/dev/null 2>&1; then
  jq -r '
    if .degraded == true then "[🧭 ⚠]"
    elif (.proposal_counts.surfaced // 0) > 0 then
      "[🧭 \(.proposal_counts.surfaced)\(if .mode == \"author\" then \"A\" elif .mode == \"annotate\" then \"N\" else \"O\" end) → /coherence:propose-list]"
    elif (.proposal_counts.queued // 0) > 0 then
      "[🧭 \(.proposal_counts.queued)q\(if .mode == \"author\" then \"A\" elif .mode == \"annotate\" then \"N\" else \"O\" end)]"
    elif (.buffer_count // 0) > 0 then
      "[🧭 \(.buffer_count)\(if .mode == \"author\" then \"A\" elif .mode == \"annotate\" then \"N\" else \"O\" end)]"
    else "" end
  ' "$SNAP" 2>/dev/null || true
else
  # No jq: try to surface buffer_count via a tiny grep+sed; degrade to empty.
  awk '/"buffer_count"/{gsub(/[",: ]/, ""); split($0,a,/buffer_count/); n=a[2]+0; if(n>0) print "[🧭 " n "]"}' "$SNAP" 2>/dev/null || true
fi
