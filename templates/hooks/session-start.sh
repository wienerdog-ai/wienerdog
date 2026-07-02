#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment, not capture): injects the
# pre-rendered digest into a new Claude Code session. Fast, fail-open
# (always exit 0), no computation — just read one file and JSON-encode it.
set -euo pipefail

# Skip during Wienerdog's own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0

# Emit the Claude Code SessionStart envelope. node (>=18, always present since
# Wienerdog is a Node CLI) does the JSON-safe encoding — no jq dependency.
node -e 'const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:t}}));' "$DIGEST"
exit 0
