#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment, not capture): injects the
# pre-rendered digest into a new session. Several preconditions are silent by
# design and come first: the WIENERDOG_JOB guard, a usable core path and node,
# and the digest preconditions of Table A rows A-H10/A-H11 — which this comment
# points at rather than enumerating, because an earlier enumeration omitted the
# size gate and was wrong. ONCE THOSE HAVE PASSED, silence has exactly one
# remaining case: at least one harness is present AND
# every present harness CLAUDE.md / AGENTS.md already carries exactly these
# bytes. Every other state injects — including no harness present at all
# (ADR-0039). Fast: a few small descriptor
# reads and one string compare. GENUINELY fail-open — always exit 0 (audit
# A6/F4): no `set -e`, every fallible step is best-effort, and ANY doubt
# injects. The fail-open structural contract is Table E of
# docs/specs/WP-hook-doctor-inspection-read-hardening.md; this comment cites it
# and does not restate it.

# Skip during Wienerdog own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0

# No usable core path or no node → nothing to inject; fail-open.
[ -n "${WIENERDOG_HOME:-}" ] || [ -n "${HOME:-}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
# Regular-file pre-filter. DEFENSE IN DEPTH, NOT THE AUTHORITY: the fstat on the
# descriptor below is what decides, and this line is not allowed to be the reason
# any decision is correct. It earns its place twice anyway — a no-vault install
# does not spawn node at all, and a non-regular path at rest (FIFO, device,
# symlink to either) is rejected WITHOUT EVER BEING OPENED, which is the
# protection the shipped script had and which open-then-fstat cannot give back.
# The residual it does not close — a regular file swapped for a device between
# this test and the open — is named and owner-accepted in the spec.
[ -f "$DIGEST" ] || exit 0

# Emit the Claude Code SessionStart envelope UNLESS every present harness
# managed block already carries these exact bytes. node (>=18, always present
# since Wienerdog is a Node CLI) does the inspection and the JSON-safe encoding —
# no jq dependency. Every path is opened O_RDONLY|O_NONBLOCK, type-checked by
# fstat on that same descriptor, and read only when it is a regular file within
# the ceiling, so a FIFO, socket, device or directory is refused unread. Neither
# guard is absolute; the bounds are residuals R-A and R-B in the spec, which this
# comment points at rather than restating. The envelope is built first and
# written in ONE call. Read failures are NOT uniform and must not be described as
# if they were: a failure of the DIGEST read emits nothing (there is no content
# to inject), while a failure of a HARNESS-TARGET read is doubt, and doubt
# injects. The dedup decision sits in its own try/catch whose catch sets
# emit=true.
node -e '
var fs = require("fs");
var path = require("path");
var os = require("os");
var BEGIN = "<!-- wienerdog:begin -->";
var END = "<!-- wienerdog:end -->";
// Ceiling on any path this hook will read. Table C row C1 of
// WP-hook-doctor-inspection-read-hardening; doctor carries the same number.
var MAX_TARGET_BYTES = 4194304;
var FLAGS = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOCTTY;
// O_NOCTTY: opening a terminal device must never make it this process controlling
// terminal. O_NONBLOCK alone does not prevent that, and a digest path pointed at a
// pseudoterminal is exactly the accident this hook must survive.

// Read a path as a regular file, bounded. O_NONBLOCK makes open return
// immediately on a FIFO with no writer instead of waiting for one, and fstat on
// the SAME descriptor decides the type, so nothing can be swapped between THIS
// check and THIS read. Returns null for every refusal — not regular, over the
// ceiling, or any error at all.
function readRegular(p) {
  var fd = null;
  try {
    fd = fs.openSync(p, FLAGS);
    var st = fs.fstatSync(fd);
    if (!st.isFile()) return null;
    // st.size has ONE role here: the cheap over-cap check, which lets an
    // over-ceiling file be refused with zero content bytes read.
    if (st.size > MAX_TARGET_BYTES) return null;
    // st.size has NO role as a length. A readable regular file may report
    // st_size 0 and still yield bytes (the procfs class), so the loop reads to
    // EOF and stops at the ceiling, whatever st.size claimed.
    var buf = Buffer.alloc(MAX_TARGET_BYTES + 1);
    var off = 0;
    while (off < MAX_TARGET_BYTES + 1) {
      var n = fs.readSync(fd, buf, off, MAX_TARGET_BYTES + 1 - off, null);
      if (n <= 0) break;
      off += n;
    }
    // More than the ceiling actually arrived: over-cap, discovered by reading.
    if (off > MAX_TARGET_BYTES) return null;
    return buf.subarray(0, off).toString("utf8");
  } catch (e) {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e2) { /* ignore */ } }
  }
}

// present | absent | doubt. ONLY a clean ENOENT is absence.
function dirState(d) {
  if (!d) return "doubt";
  try {
    return fs.statSync(d).isDirectory() ? "present" : "doubt";
  } catch (e) {
    return e && e.code === "ENOENT" ? "absent" : "doubt";
  }
}

// Does a path entry exist AT ALL, judged on the link itself? A dangling symlink
// counts as present: a shadow file we cannot resolve is not certainty.
// present | absent | doubt.
function entryState(p) {
  try {
    fs.lstatSync(p);
    return "present";
  } catch (e) {
    return e && e.code === "ENOENT" ? "absent" : "doubt";
  }
}

// Byte-for-byte the block adapters/shared.js buildBlock() would write.
function expectedBlock(d) {
  var safe = d.split("\n").map(function (l) {
    var t = l.trim();
    if (t === BEGIN) return l.replace(BEGIN, "<!-- wienerdog begin -->");
    if (t === END) return l.replace(END, "<!-- wienerdog end -->");
    return l;
  }).join("\n");
  return BEGIN + "\n" + safe.trimEnd() + "\n" + END;
}

// The single managed block in content, by full-line sentinel match, using the
// same offsets adapters/shared.js locateManagedBlock() uses. null when there is
// no block or the markers are ambiguous.
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
  var text = readRegular(file);
  if (text === null) return false;
  return blockOf(text) === want;
}

try {
  var text = readRegular(process.argv[1]);
  if (text === null) process.exit(0);
  var emit = true;
  try {
    var home = process.env.HOME || os.homedir() || "";
    var claudeDir = process.env.WIENERDOG_CLAUDE_DIR || process.env.CLAUDE_CONFIG_DIR ||
      (home ? path.join(home, ".claude") : "");
    var codexDir = process.env.CODEX_HOME || (home ? path.join(home, ".codex") : "");
    var want = expectedBlock(text);
    var present = 0;
    var allCarry = true;
    var cs = dirState(claudeDir);
    if (cs === "doubt") allCarry = false;
    else if (cs === "present") {
      present += 1;
      if (!carries(path.join(claudeDir, "CLAUDE.md"), want)) allCarry = false;
    }
    var xs = dirState(codexDir);
    if (xs === "doubt") allCarry = false;
    else if (xs === "present") {
      present += 1;
      // An AGENTS.override.md shadows our AGENTS.md, so the block is not
      // delivered no matter what it contains. Judged on the link itself.
      var ov = entryState(path.join(codexDir, "AGENTS.override.md"));
      if (ov !== "absent") allCarry = false;
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
