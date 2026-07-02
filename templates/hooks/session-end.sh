#!/usr/bin/env bash
# Wienerdog SessionEnd hook (enrichment): appends a capture hint to the queue.
# Ground-truth capture is transcript scanning (WP-007); this only speeds
# discovery. Fail-open.
set -euo pipefail

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
QUEUE="$CORE/state/queue.jsonl"
mkdir -p "$CORE/state"

# Claude Code passes hook JSON on stdin: {session_id, transcript_path, cwd, ...}.
node -e '
let raw="";
process.stdin.on("data", d => raw += d);
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse(raw || "{}"); } catch (e) { j = {}; }
  const line = JSON.stringify({harness:"claude", session_path:j.transcript_path||null, cwd:j.cwd||null, ts:new Date().toISOString()});
  require("fs").appendFileSync(process.argv[1], line + "\n");
});' "$QUEUE"
exit 0
