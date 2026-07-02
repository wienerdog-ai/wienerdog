#!/usr/bin/env bash
# Wienerdog Codex Stop hook (enrichment, not capture): appends a capture hint to
# the queue. Ground-truth capture is rollout-file scanning (WP-007); this only
# speeds discovery. Fail-open. Stop hooks must not print plain text — this emits
# no stdout at all (exit 0 = success), which is valid.
set -euo pipefail

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
QUEUE="$CORE/state/queue.jsonl"
mkdir -p "$CORE/state"

# Codex passes hook JSON on stdin: {session_id, transcript_path, cwd, hook_event_name, ...}.
node -e '
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let j = {};
  try {
    j = JSON.parse(raw || "{}");
  } catch (e) {
    j = {};
  }
  const line = JSON.stringify({ harness: "codex", session_path: j.transcript_path || null, cwd: j.cwd || null, ts: new Date().toISOString() });
  require("fs").appendFileSync(process.argv[1], line + "\n");
});' "$QUEUE"
exit 0
