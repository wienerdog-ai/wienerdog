#!/bin/bash
# SessionEnd hook: enqueue this session for the (future) dream job.
# Reads the hook JSON from stdin, appends one line to memory/transcripts/queue.jsonl.
# Prototype of templates/hook-scripts/ — keep dependency-free (node ships with the repo's toolchain).
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$dir/memory/transcripts"
node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let d = {};
  try { d = JSON.parse(raw); } catch {}
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    harness: "claude-code",
    session_id: d.session_id || null,
    transcript_path: d.transcript_path || null,
    cwd: d.cwd || null,
  });
  require("fs").appendFileSync(process.argv[1] + "/memory/transcripts/queue.jsonl", line + "\n");
});
' "$dir"
