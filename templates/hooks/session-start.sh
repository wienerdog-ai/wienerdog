#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment, not capture): injects the
# pre-rendered digest into a new Claude Code session. Fast, no computation —
# just read one file and JSON-encode it. GENUINELY fail-open — always exit 0
# (audit A6/F4): no `set -e`, every fallible step is best-effort.

# Skip during Wienerdog's own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0

# No usable core path or no node → nothing to inject; fail-open.
[ -n "${WIENERDOG_HOME:-}" ] || [ -n "${HOME:-}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0

# Emit the Claude Code SessionStart envelope. node (>=18, always present since
# Wienerdog is a Node CLI) does the JSON-safe encoding — no jq dependency.
# The full envelope is built first and written in ONE call; on any read failure
# (TOCTOU-deleted/unreadable digest) it emits NOTHING — empty stdout means "no
# additional context", never a partial envelope.
node -e '
try {
  const fs = require("fs");
  const t = fs.readFileSync(process.argv[1], "utf8");
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: t } }));
} catch (e) { /* fail-open: no output */ }
' "$DIGEST" || true
exit 0
