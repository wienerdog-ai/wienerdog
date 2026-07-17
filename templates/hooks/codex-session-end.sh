#!/usr/bin/env bash
# Wienerdog Codex Stop hook (enrichment, not capture): appends a capture hint to
# the queue. Ground-truth capture is rollout-file scanning (WP-007); this only
# speeds discovery. Stop hooks must not print plain text — this emits no stdout
# at all (exit 0 = success), which is valid. GENUINELY fail-open — always exit 0
# (audit A6/F4): no `set -e`, every fallible step is best-effort, stdin is
# bounded.

# No usable core path or no node → nothing to record; fail-open.
[ -n "${WIENERDOG_HOME:-}" ] || [ -n "${HOME:-}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
QUEUE="$CORE/state/queue.jsonl"
mkdir -p "$CORE/state" 2>/dev/null || true

# Codex passes hook JSON on stdin: {session_id, transcript_path, cwd, hook_event_name, ...}.
# The reader accumulates at most HOOK_STDIN_MAX (1 MB) and ignores the rest, so
# a hostile pipe can never make node buffer unbounded input; a failed append is
# swallowed (nothing in src/ consumes the queue — it is enrichment only).
node -e '
const HOOK_STDIN_MAX = 1048576;
let raw = "";
process.stdin.on("data", (d) => {
  if (raw.length < HOOK_STDIN_MAX) raw += d;
});
process.stdin.on("end", () => {
  let j = {};
  try {
    j = JSON.parse(raw || "{}");
  } catch (e) {
    j = {};
  }
  const line = JSON.stringify({ harness: "codex", session_path: j.transcript_path || null, cwd: j.cwd || null, ts: new Date().toISOString() });
  try {
    require("fs").appendFileSync(process.argv[1], line + "\n");
  } catch (e) {
    /* fail-open */
  }
});' "$QUEUE" || true
exit 0
