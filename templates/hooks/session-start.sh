#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment, not capture): injects the
# pre-rendered digest into a new session — but ONLY when the managed block in
# every present harness's CLAUDE.md / AGENTS.md is not already carrying exactly
# these bytes (ADR-0039). Fast: a few small reads and one string compare, no
# computation over the vault. GENUINELY fail-open — always exit 0 (audit A6/F4):
# no `set -e`, every fallible step is best-effort, and ANY doubt injects.

# Skip during Wienerdog's own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0

# No usable core path or no node → nothing to inject; fail-open.
[ -n "${WIENERDOG_HOME:-}" ] || [ -n "${HOME:-}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0

# Emit the Claude Code SessionStart envelope UNLESS every present harness's
# managed block already carries these exact bytes. node (>=18, always present
# since Wienerdog is a Node CLI) does the comparison and the JSON-safe encoding —
# no jq dependency. The envelope is built first and written in ONE call; on any
# read failure (TOCTOU-deleted/unreadable digest) it emits NOTHING — empty stdout
# means "no additional context", never a partial envelope. The dedup decision sits
# in its own try/catch whose catch sets emit=true: any error, any ambiguity, any
# doubt injects (wrong silence loses context; a wrong inject only costs tokens).
node -e '
var fs = require("fs");
var path = require("path");
var os = require("os");
var BEGIN = "<!-- wienerdog:begin -->";
var END = "<!-- wienerdog:end -->";
// Bound on a harness markdown file we will read for comparison. The users own
// CLAUDE.md can be arbitrarily large; a bigger one is treated as not-matching
// (so we inject) rather than read, keeping the hook inside its time budget.
var MAX_TARGET_BYTES = 4194304;

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function exists(p) { try { fs.statSync(p); return true; } catch (e) { return false; } }

// Byte-for-byte the block that adapters/shared.js buildBlock() would write for
// this digest: full-line sentinels neutralized, trailing whitespace trimmed.
function expectedBlock(d) {
  var safe = d.split("\n").map(function (l) {
    var t = l.trim();
    if (t === BEGIN) return l.replace(BEGIN, "<!-- wienerdog begin -->");
    if (t === END) return l.replace(END, "<!-- wienerdog end -->");
    return l;
  }).join("\n");
  return BEGIN + "\n" + safe.trimEnd() + "\n" + END;
}

// The single managed block in `content`, by full-line sentinel match, using the
// same offsets adapters/shared.js locateManagedBlock() uses. null when there is
// no block or the markers are ambiguous (0 or >1 of either, or END before BEGIN).
function blockOf(content) {
  var lines = content.split("\n");
  var starts = []; var off = 0; var i;
  for (i = 0; i < lines.length; i++) { starts.push(off); off += lines[i].length + 1; }
  var begins = []; var ends = [];
  for (i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (t === BEGIN) begins.push(i);
    else if (t === END) ends.push(i);
  }
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) return null;
  var e = ends[0];
  return content.slice(starts[begins[0]], starts[e] + lines[e].indexOf(END) + END.length);
}

function carries(file, want) {
  try {
    if (fs.statSync(file).size > MAX_TARGET_BYTES) return false;
    return blockOf(fs.readFileSync(file, "utf8")) === want;
  } catch (e) { return false; }
}

try {
  var text = fs.readFileSync(process.argv[1], "utf8");
  var emit = true;
  try {
    var home = process.env.HOME || os.homedir() || "";
    var claudeDir = process.env.WIENERDOG_CLAUDE_DIR || process.env.CLAUDE_CONFIG_DIR ||
      (home ? path.join(home, ".claude") : "");
    var codexDir = process.env.CODEX_HOME || (home ? path.join(home, ".codex") : "");
    var want = expectedBlock(text);
    var present = 0;
    var allCarry = true;
    if (claudeDir && isDir(claudeDir)) {
      present += 1;
      if (!carries(path.join(claudeDir, "CLAUDE.md"), want)) allCarry = false;
    }
    if (codexDir && isDir(codexDir)) {
      present += 1;
      // An AGENTS.override.md silently shadows our AGENTS.md, so the block is
      // not delivered to a Codex session no matter what it contains.
      if (exists(path.join(codexDir, "AGENTS.override.md"))) allCarry = false;
      else if (!carries(path.join(codexDir, "AGENTS.md"), want)) allCarry = false;
    }
    emit = !(present > 0 && allCarry);
  } catch (e) { emit = true; }
  if (emit) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
  }
} catch (e) { /* fail-open: no output */ }
' "$DIGEST" || true
exit 0
