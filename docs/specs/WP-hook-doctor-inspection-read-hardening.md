---
id: WP-hook-doctor-inspection-read-hardening
title: Type-guard and bound every inspection read, and make presence-doubt inject
status: Ready
model: opus
size: M
depends_on: [WP-session-start-digest-dedup]
adrs: [ADR-0004, ADR-0031, ADR-0039]
epic: digest-delivery
---

# WP-hook-doctor-inspection-read-hardening: type-guarded, bounded inspection reads, and presence-doubt injects

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the template
  gives the skeleton, the runbook the rules. Read both.

> **Revision 4, 2026-08-30 — design round 3 returned 6 findings, and every
> mechanism passed.** Round 3 confirmed the E6 gates go RED on the `emit = false`
> mutation, the `-f` matrix matches the tables, and all six round-2 fixes are
> substantively present. **All six new findings were restatement surfaces
> contradicting ratified canon** — no design decision was left in any of them.
> Fixed in the style ADR-0031 prefers: **deletion over patching**, so a fact lives
> once and the copies point at it. Two restatements survive because they ship in
> code (the script's comments and `digestBlockChecks`' JSDoc); both are now
> registered on the Mirrored Surface Checklist and both were rewritten to point
> rather than claim. The script changed, so it was re-embedded and everything
> re-run: **26/26 sweep, 22/22 hooks-fail-open, all Table E gates green,
> 21.4 ms**.
>
> **Revision 3, 2026-08-30 — design round 2 returned 6 findings; the owner
> dispositioned all six FIX.** Round 2 verified the nine round-1 fixes except one
> narrowly (its finding 1 here). The two that changed the design again: **opening
> a special file has side effects before `fstat` can reject it** — so the `-f`
> pre-filter is restored as defense in depth, `O_NOCTTY` is added, and the
> remaining swap window is a named owner-accepted residual — and **`st_size` is no
> longer trusted as a content length**. Every gate and number below was re-derived
> against the revision-3 script.
>
> **The owner and Codex both confirmed the revision-2 refinement** flagged under
> "Pushback and refinements": taking the over-cap size from the `fstat` on the
> already-open descriptor is within row A-H7's intent and better than a separate
> `stat`. It stands, and the confirmation is recorded there.
>
> **Revision 2, 2026-08-30 — design-review round 1 (Codex) returned 9 findings;
> the owner dispositioned all nine FIX.** Every one is applied. The two that
> changed the design rather than the prose: the type check moved from
> `stat`-then-open to a **descriptor-based** mechanism (open `O_NONBLOCK`, `fstat`
> the fd, read the same fd), which closes the swap window round 1 found *and* the
> block; and the re-issued hook script is now **included verbatim** in Exact
> contracts, tested, with its sweep numbers in Current state. One disposition is
> **refined rather than followed literally** — see "Pushback and refinements"
> below, which is the only place this revision departs from the batch.
>
> **Two forward references.** This spec cites
> `docs/specs/done/WP-session-start-digest-dedup.md` for the accepted residuals
> and for the canonical-extraction trigger AC13 discharges. On `main` at drafting
> (`152ae3a`) that spec is `docs/specs/WP-session-start-digest-dedup.md`,
> `status: In-Review`; its archival is **PR #53**, which `depends_on` records.
> Both citations resolve when #53 lands.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing here starts a process or writes
state: this work package changes how two existing read-only surfaces *read*.

Two surfaces inspect the user's harness markdown (`~/.claude/CLAUDE.md`,
`$CODEX_HOME/AGENTS.md`) to compare the **managed block** — the
`<!-- wienerdog:begin -->`…`<!-- wienerdog:end -->` region Wienerdog owns —
against the current **digest** (`<core>/state/digest.md`):

- the **SessionStart hook** (`templates/hooks/session-start.sh`), which stays
  silent when every present harness's block already carries the same bytes and
  injects the digest otherwise (ADR-0039);
- **`wienerdog doctor`**'s `digestBlockChecks`, which reports the same
  comparison as an `[ok]`/`[warn]` line. Its read, memory and mutation
  properties are Table B's — rows B6, B7 and B8 — not this paragraph's.

Both were shipped assuming the paths they read are ordinary regular files of
ordinary size. Neither assumption is enforced, and both are attacker-free
accidents a normal user can create: a stray `mkfifo`, a symlink to a device, a
CLAUDE.md that grew, a directory whose parent lost its search bit.

**Two invariants govern the fix, and they point the same way.** The hook's is
**fail-open** (ADR-0039): *any* doubt injects, because a wrong silence costs the
user a whole session of context while a wrong injection costs tokens. Doctor's is
**read-only and responsive** (WP-070): it reports, `sync` fixes, and hanging an
attended terminal is the failure this WP exists to remove — within the bound
residual **R-B** states, which is the one place that limit is decided. In both
cases the correct answer to "I cannot safely determine this" is to say so —
inject, or warn — never to resolve doubt into a confident silence or a confident
`[ok]`.

**One clarification the fail-open rule needs, because it reads like a
contradiction otherwise.** "Any doubt injects" governs the **dedup decision** —
whether the block already carries the digest. It does not govern whether a digest
*exists*: when `digest.md` is missing or unreadable there is nothing to inject,
and the hook is silent. That is rows A2/A3 of the shipped dedup contract, it
predates this WP, and it is unchanged here.

## Current state

Measured on `main` = `152ae3a` (2026-08-30) by reproducing each defect, and then
re-measured against the replacement script in Exact contracts. The findings
originate in the PR #50 Codex design gate (F1, F2), wd-reviewer finding 5 on the
same PR, and the retro Codex gate on the merged PR #48 — all dispositioned **fix**
by the owner. The numbers below are this spec's own.

`digestBlockChecks` (`src/cli/doctor.js:371`…) reads each target with a bare
`fs.readFileSync(file, 'utf8')` inside a `try` and treats any throw as "no
block". The hook resolves harness presence with `fs.statSync(dir).isDirectory()`
inside a `try` returning `false`, checks the Codex shadow file with
`fs.existsSync`, and guards size with `fs.statSync(file).size >
MAX_TARGET_BYTES` (4 MiB, `session-start.sh:38`) **before** a `readFileSync` — a
size guard, not a type guard, and a `stat`-then-open pair with a window between
them.

**D1 — doctor hangs forever on a FIFO.** With `CLAUDE.md` replaced by a FIFO with
no writer, `wienerdog doctor` printed its harness line and then blocked in
`open(2)`; still alive at 15 s, killed. There is no timeout on this path: it is
an attended CLI, so the user's terminal is simply gone.

**D2 — the hook blocks on the same FIFO.** Same fixture: no output, still alive
at 12 s. In production it is bounded only by the `timeout: 10` the adapters
register — a 10-second stall on every new session, and no injection.

**D3 — doctor's unbounded read amplifies file size ~6.5× in RSS.** A 64 MiB
line-rich `CLAUDE.md` (838,861 lines, block intact): `doctor` peaked at **418 MB**
maximum resident set size versus **61 MB** on the same install with a normal-size
file — **+357 MB** — and reported `[ok]` in 0.17 s, so nothing warns the user.
`readFileSync` materialises the whole file and `locateManagedBlock` then
`split('\n')`s it into an array of every line. (The retro gate reported 2.1 GB on
a 64 MiB file; the factor depends on the content's line and codepoint profile.
Both measurements say the same thing: the read is unbounded and the peak is a
multiple of the file. My own first attempt read 57 MB and was **wrong** — the pad
I generated had no newlines, so `split` never allocated; recorded because the
mistake is instructive about how this defect hides.)

**D4 — a `statSync` error on a harness directory reads as "harness absent", which
becomes a wrong silence.** With Claude's config dir made un-`stat`-able (parent
`chmod 000`, `statSync` → `EACCES`), the hook's `isDir()` returns `false` and that
harness drops out of the conjunction. Single-harness this is benign. **Dual-harness
it is a real wrong silence:** with a *fresh* Codex block and a Claude directory
that errors, the control run (both readable, Claude carrying no block) **injected
92 bytes**, and the identical run with Claude's parent locked emitted **nothing**.
Codex alone decided; the Claude block was never examined.

**D5 — a dangling `AGENTS.override.md` symlink is not seen as shadowing.**
`fs.existsSync` follows symlinks, so on a link with no target it returns `false`
while `lstatSync` reports a symlink. Measured: the hook emitted **nothing**.

### The descriptor mechanism — probed before it was specified

Round 1's finding 1 is that a `stat`-then-open type check has a window: the path
can be swapped for a FIFO after the check and the open blocks anyway. The owner
directed a descriptor-based fix. **It was probed first**, on
`darwin 25.5.0 / node v24.18.0`, opening each fixture with
`O_RDONLY | O_NONBLOCK`, `fstat`-ing that descriptor and reading only when it is
a regular file:

| fixture | elapsed | result |
|---|---|---|
| regular file | 0 ms | `open` OK, `fstat`=regular, read succeeds |
| **FIFO, no writer** | **0 ms** | **`open` OK — does not block** — `fstat`=fifo, refused unread |
| symlink → regular | 0 ms | resolves to regular, read succeeds (**must stay accepted**) |
| symlink → FIFO | 0 ms | `fstat`=fifo, refused unread |
| symlink loop | 0 ms | throws `ELOOP` |
| dangling symlink | 0 ms | throws `ENOENT` |
| directory | 0 ms | `fstat`=dir, refused unread |
| char device (`/dev/zero`) | 0 ms | `fstat`=chardev, refused unread |
| unix socket | 0 ms | throws (macOS `EOPNOTSUPP`/-102; Linux `ENXIO`) |
| absent | 0 ms | throws `ENOENT` |
| path under a regular file | 0 ms | throws `ENOTDIR` |
| 500-char basename | 0 ms | throws `ENAMETOOLONG` |

Three further probes. A `ceiling + 1` bounded read returns exactly `ceiling + 1`
bytes on an over-ceiling file and the true length on a small one, so **one read
answers both questions**. `fstat.size` **on the already-open descriptor** decides
over-ceiling with **zero content bytes read**. And a read loop that **ignores
`st_size` entirely** and stops on EOF returns the correct bytes for an honest
file — which is what makes it safe to stop trusting `st_size` as a length
(round 2 finding 3); the memory factor that loop feeds is measured under Table B
row B7.

**The evidence boundary, stated rather than glossed.** All of the above is
measured on **macOS only** — this machine is darwin and CI is down (billing). The
FIFO property is POSIX-specified (`O_NONBLOCK` on a read-end returns immediately
rather than waiting for a writer) and `O_NONBLOCK` is a no-op for regular-file
reads on both Linux and macOS, so the mechanism is expected to be identical on
Linux; **it is not measured there, and AC14 exists to force that observation
before merge.** The socket row shows why the design does not depend on the code
table being complete: the rule is *"any non-`ENOENT` throw is doubt"*, so a
platform-specific errno is handled without being enumerated.

### The replacement script, measured

The script in Exact contracts was written and run before being specified, and
**re-run after every revision-3 change** (the `-f` pre-filter, `O_NOCTTY`, the
read-to-EOF loop, the comment fixes). Against the revision-3 script, on this
machine:

- **the full behavioural sweep passes 26/26** — all **17** scenarios the shipped
  dedup contract already required (six `buildBlock`-parity digests, stale,
  no-block, file-absent, ambiguous, no-harness, over-ceiling, dual-fresh,
  dual-codex-stale, dual-override, real `applyManagedBlock` append path,
  `CLAUDE_CONFIG_DIR` override), **plus 9 new rows**: FIFO target,
  symlink→FIFO, **symlink→regular still silences**, directory target, `ELOOP`,
  config-dir-is-a-file, dangling override link, the D4 dual-harness `EACCES`
  case (**was silent, now injects**), and a FIFO `digest.md` (silent — no digest
  to inject, per A2/A3);
- every FIFO row **returns promptly** under a `spawnSync` timeout, where the
  shipped script times out;
- `tests/integration/hooks-fail-open.test.js` passes **22/22, byte-unchanged**;
- elapsed time **21.4 ms** average over five runs on a 32 KB digest with a
  matching block — against 22.4 ms for the shipped script, i.e. the descriptor
  mechanism plus `O_NOCTTY` plus the read-to-EOF loop cost nothing measurable,
  and the ADR-0004 `<200ms` budget is intact;
- `O_NOCTTY` is defined on this platform (`131072`) and changes nothing for the
  cases that must keep working: a regular file still `fstat`s as regular and
  reads, and a FIFO with no writer still opens in **0 ms**;
- the restored `-f` pre-filter accepts exactly what it must and rejects the rest,
  measured: regular **true**, **symlink → regular true** (the AC4 acceptance case
  survives the restoration), FIFO false, symlink → FIFO false, symlink →
  `/dev/zero` false, `/dev/tty` false, directory false;
- the replacement **E6a/E6b/E6c** gates were observed on the mutation that
  defeated the old E6 — inner catch flipped to `emit = false`: **E6a RED, E6c
  RED**, while the old `grep -c 'catch (e)'` gate printed **ok** on that same
  file.

**What is deliberately NOT in this WP's problem statement.** The two residuals the
owner accepted on PR #50 — TOCTOU on a mid-hook *digest rewrite* (parked; every
honest fix is a freshness mechanism and the package makes no freshness claim) and
invalid-UTF-8 replacement folding — stay accepted. Note that round 1's finding 1
is a **different** TOCTOU: a *type* swap on an inspected path, which the
descriptor mechanism closes outright. See
`docs/specs/done/WP-session-start-digest-dedup.md`, "Residuals".

## Pushback and refinements

Nothing in the batch is rejected. **One disposition is implemented in a way that
exceeds its letter, and the owner should see the difference stated rather than
buried.**

> **CONFIRMED, round 2 (2026-08-30).** The owner ratified this refinement and
> Codex independently endorsed it: open-without-content-read is within row
> A-H7's intent and better than a separate `stat`. It stands as written; Table C
> row C2b now carries the same confirmation.
>
> **Narrowed by round 4 (2026-08-30).** What survives is the **fast path**:
> `st_size > ceiling` injects with zero content bytes read, and that is what A10
> and the `<200ms` figure rest on. What does **not** survive is the categorical
> "the hook does not probe": an `st_size`-underreporting file reaches the
> EOF-bounded read, which rejects on `off > ceiling`. Table A row A-H7 and Table
> C row C2b now state both tiers; the paragraph below is kept as the record of
> the refinement, not as a current claim about probe-freedom.

**Finding 5 — "the hook's over-cap path stays stat-based immediate injection with
NO content read".** The intent is clear: preserve the shipped A10 contract and the
`<200ms` measurement, and keep the `ceiling + 1` probe out of the hook. Both are
honoured. **But the hook no longer uses a separate `statSync`**: it takes the size
from the `fstat` on the descriptor it has already opened. That is strictly better
than the literal instruction — same "no content read", same immediate injection,
and it also closes the swap window on the *size* check that finding 1 closed on
the *type* check. Reverting to a standalone `stat` would re-open exactly the hole
finding 1 was about. Table A row A-H7 and Table C row C2 both say this explicitly
so the contradiction round 1 found cannot re-form.

**Two smaller judgement calls, flagged because they are mine and not the batch's.**

1. ~~The bash scaffold keeps a cheap existence pre-filter, but it is now `-e`
   (any entry), not `-f`.~~ **Withdrawn in revision 3 — round 2 was right and I
   was wrong.** My reasoning was that `-f` re-asserts the type assumption this WP
   removes. What I missed is that `-f` is not competing with the descriptor
   check, it *precedes* it: it rejects a non-regular path **without opening it**,
   and round 2 demonstrated that the open itself has side effects `fstat` cannot
   undo. The shipped script had that protection and my change removed it. `-f` is
   restored as **defense in depth** (Table C row C2c), explicitly not the
   authority, and the window it cannot close is named residual **R-A**.
2. A FIFO `digest.md` yields **silence**, not injection. This looks like a
   fail-open violation and is not: there is no content to inject. It is rows
   A2/A3 of the shipped contract, unchanged — but it is called out in Context
   because a reviewer is right to stop on it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (you flip its `status:` — Definition of done item 4), package-lock.json,
     memory/lessons/inbox.md, and docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | templates/hooks/session-start.sh | replace with the verbatim script in **Exact contracts**; implements **Tables A, C, D, E** |
| modify | src/cli/doctor.js | `digestBlockChecks` only — descriptor-based, bounded reader per **Tables B, C, D**. No other check, no reordering |
| modify | tests/integration/session-start-dedup.test.js | cover the hook rows of Tables A and D |
| modify | tests/unit/doctor.test.js | cover the doctor rows of Tables B and D (append; never rewrite an existing case) |

**Not deliverables, and each for a reason.**
`tests/integration/hooks-fail-open.test.js` must keep passing **byte-unchanged** —
it is the independent witness that this WP did not weaken fail-open, and a witness
you may edit is not one. `src/adapters/shared.js` is untouched: no block semantics
change. No new `src/` module — see the helper trade-off in Implementation notes.

### Exact contracts

**1. `templates/hooks/session-start.sh` — the complete replacement file.** Write
exactly this. It was written, run and swept before being specified (Current
state); the `node -e` program is a **single-quoted** bash argument and therefore
contains **no `'` character anywhere**. The count is not restated here: the
verifier in Verification steps prints both the payload line count and the number
of offending lines, and that command is the claim. Round 4 caught this sentence
asserting 128 when the payload had grown to 138.

```bash
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
```

**2. `src/cli/doctor.js` — `digestBlockChecks`, unchanged signature.**

```js
/** Read-only: never throws, never mutates. Its read discipline, memory bound and
 *  the residuals that bound them are decided in
 *  docs/specs/done/WP-hook-doctor-inspection-read-hardening.md — Table C
 *  (mechanism), Table B row B7 (memory), R-A/R-B (residuals). This comment
 *  points there and states no guarantee of its own.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{claude:{present:boolean}, codex:{present:boolean}}} harnesses
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function digestBlockChecks(paths, harnesses)
```

Both its **digest read** and its **target reads** go through the Table C
descriptor mechanism. Doctor's four existing message strings are unchanged;
**exactly two** new strings are introduced, for Table B rows B5 and B9, and their
wording is decided in Table B and nowhere else.

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** a doubt/absence taxonomy replaces a
boolean; **(iv)** error, fallback and precedence behaviour is the entire
substance; **(vi)** two independent surfaces inherit one contract; **(vii)** the
same facts are mirrored across two implementations, two test files and their
acceptance criteria.

Tables A, B, D and E are declarative fact tables; Table C is the shared mechanism
and constants. None carries a `mechanism`, `seam` or `how to produce it` column,
so ADR-0036's cell schema does not apply; **how** each state is produced in a test
is the implementer's design (`docs/runbooks/spec-authoring.md`).

### Table A — canonical: the hook's presence and read decisions

Replaces the corresponding rows of `WP-session-start-digest-dedup`'s Table A;
every row of that table not named here is unchanged and still governs.

| id | observed state | hook must |
|----|----------------|-----------|
| A-H1 | a harness config dir `stat`s successfully and is a directory | treat that harness as **present** |
| A-H2 | a harness config dir `stat` fails with a **clean `ENOENT`** | treat as **absent** — the only absence that counts |
| A-H3 | a harness config dir `stat` fails with **anything else** (`EACCES`, `ELOOP`, `ENOTDIR`, `ENAMETOOLONG`, `EIO`, …) | **doubt** → **inject**. Never "absent" |
| A-H4 | a harness config path exists but is **not** a directory | **doubt** → **inject** |
| A-H5 | a target's descriptor `fstat`s as anything other than a **regular file** — FIFO, socket, device, directory, including via a symlink | **doubt** → **inject**, and the descriptor is closed **without a content read** |
| A-H6 | opening a target's descriptor throws anything other than a clean `ENOENT` | **doubt** → **inject** |
| A-H7 | a target is a regular file that exceeds the Table C ceiling | **inject**, by a **two-tier** decision. **Fast path:** `fstat.size` on the already-open descriptor exceeds the ceiling → inject with **zero content bytes read** — this is what preserves the shipped A10 contract and the `<200ms` measurement. **Slow path:** a file that **underreports** `st_size` passes the fast check, and its over-cap then emerges from the EOF-bounded read itself, which stops at `ceiling + 1`. Both tiers are ratified (round-2 dispositions 3 and 5). **The hook is not probe-free, and this row no longer claims it is** — round 4 measured that categorical false against the shipped script, whose reader rejects on `off > ceiling` |
| A-H8 | `$CODEX_HOME/AGENTS.override.md` exists as a **path entry** judged by `lstat` — regular file, directory, or symlink of any kind **including a dangling one** | treat Codex's block as **not delivered** → **inject** |
| A-H9 | zero harnesses are present after A-H1…A-H4 | **inject** |
| A-H10 | `digest.md` is absent, non-regular, over-ceiling, or unreadable | **emit nothing** — there is no content to inject. Unchanged from the shipped A2/A3; see the Context clarification. **Verified against the shipped script in round 2: `[ -f ]` was already false for a FIFO, so the old behaviour was silent too — this is preserved behaviour, not a new silence** |
| A-H11 | `digest.md` is non-regular **at rest** | rejected by the `-f` pre-filter **without being opened** (Table C row C2c layer (a)). The descriptor check still runs for everything that passes `-f` and remains the authority |

**The rule the rows share, stated once:** the hook distinguishes three answers —
*present*, *cleanly absent*, *cannot tell* — where it had two, and **only a clean
`ENOENT` is absence**. Every "cannot tell" forces injection.

### Table B — canonical: doctor's inspection reads

Rows B9–B11 are new in revision 2: doctor's **own `digest.md` read** was outside
the guard, which round 1 found and the owner dispositioned FIX.

| id | observed state | doctor must emit |
|----|----------------|------------------|
| B1 | target is a regular file at or under the ceiling | the existing `[ok]`/`[warn]` comparison lines, unchanged |
| B2 | target `fstat`s as non-regular (FIFO, socket, device, directory, incl. via symlink) | one `[warn]`, **without a content read** |
| B3 | opening the target throws anything but a clean `ENOENT` | one `[warn]` |
| B4 | target is cleanly absent (`ENOENT`) | the existing `no Wienerdog block in <file>` warn, unchanged |
| B5 | target is a regular file **larger than the ceiling** | one **actionable** `[warn]` naming the file, **its observed size**, and **the ceiling**, and telling the user to **trim the file below the ceiling and re-run `doctor`**. It must **NOT** suggest `wienerdog sync` — sync cannot shrink a user-owned `CLAUDE.md`, and an instruction that cannot work is worse than none. It must be distinguishable from B2/B3 and from "out of date": the file is fine, it is *too large to inspect*. **"Observed size", not actual size, and the difference is forced by row B7:** on the credible fast path (`st_size > ceiling`) print `st_size`; when over-cap was instead discovered by the `ceiling + 1` read on an **underreporting** file, the true size is unknowable without reading past the ceiling, which B7 forbids — print `larger than <ceiling>` and say no more. Round 4 found the earlier "actual size" wording demanding what B7 makes unobtainable |
| B6 | any of B2, B3, B5, B9, B10 | `process.exitCode` is **not** set — no state here is a `fail` |
| B7 | every state above | see the memory contract below |
| B8 | every state above | the check returns rather than waiting for a writer, **within the bound residual R-B states** — `O_NONBLOCK` is specified for FIFO read-ends and is a no-op for regular files, and R-B is the ratified limit of that guarantee for other device classes. `doctor` never mutates. This row does not promise return for every conceivable device; it promises the mechanism, and R-B owns the exception |
| B9 | `<core>/state/digest.md` is non-regular, or over the ceiling, or its open throws anything but a clean `ENOENT` | one `[warn]` naming `digest.md` and the condition, and **no target is inspected** — without a trustworthy digest there is nothing to compare against. The second new string |
| B10 | `<core>/state/digest.md` is cleanly absent (`ENOENT`) | **emit nothing at all** — the existing no-vault silence, unchanged |
| B11 | the digest read | uses the same Table C mechanism as the targets. **`DigestCaps.MAX_BYTES` (32 KiB) is a product invariant about what `renderDigest` emits — it is not a filesystem-integrity guarantee.** Nothing stops a user, a bad merge, or a broken tool from putting something else at that path, so the reader must not assume the file it finds is the file Wienerdog wrote |

**The memory contract (row B7), quantified so AC8 has an objective threshold.**
`digestBlockChecks` reads **at most `ceiling + 1` input bytes per target**, and
**an over-ceiling file is never fully loaded**. Peak resident memory attributable
to one target is **at most `N x ceiling`, with `N = 17`** — i.e. **≤ 68 MiB** at
the 4 MiB ceiling.

**`N` is measured, not asserted, and it is not small — that matters and revision 2
was wrong to imply otherwise.** Measured on this machine (`darwin`, node v24.18.0,
`--expose-gc`, RSS delta across the full pipeline: bounded buffer → UTF-8 string →
`locateManagedBlock`'s `split('\n')` line array → its per-line offset array), over
four line profiles of a ceiling-sized file:

| content profile | RSS delta | N |
|---|---|---|
| 4096-column ASCII | 2.1 MiB | 0.53x |
| 2-byte UTF-8, 40-col | 2.8 MiB | 0.70x |
| 80-column ASCII | 5.7 MiB | 1.43x |
| **3-column ASCII (worst case)** | **67.5 MiB** | **16.88x** |

**The dominant term is not the read — it is the per-line decomposition.** A 4 MiB
file of 3-byte lines becomes ~1.4M `String` objects plus a ~1.4M-element offset
array, and object overhead dwarfs the content. `locateManagedBlock` lives in
`src/adapters/shared.js`, which this WP explicitly does not touch, so the factor
is a property of the existing block parser, not of the new reader — **the reader
bounds it, it cannot remove it.**

`N = 17` is the measured worst case rounded up. The contract is
bounded-by-the-ceiling, *not* constant-bytes, and *not* small: revision 1 claimed
both bounded and constant and was incoherent; revision 2 said "small constant
factor" and could not have passed its own AC8, because no number existed to test.

### Table C — canonical: the inspection mechanism and its constants

| id | fact | value | why |
|----|------|-------|-----|
| C1 | inspection ceiling for any path either surface reads | **4 MiB** (`4194304` bytes) | already the hook's `MAX_TARGET_BYTES`; doctor adopts the same number so the two cannot disagree about which files they will inspect |
| C2 | how a path is read | `open(path, O_RDONLY \| O_NONBLOCK \| O_NOCTTY)` → `fstat` **that descriptor** → refuse unless `isFile()` → bounded `read` from **the same descriptor**, **to EOF**, stopping at `ceiling + 1` → `close`. Getting more than `ceiling` bytes is over-ceiling, discovered by reading | one descriptor for check and read closes the swap window between them; `O_NONBLOCK` makes `open` return immediately on a FIFO read-end; `O_NOCTTY` keeps a terminal device from becoming the process's controlling terminal |
| C2a | **`st_size` has exactly two roles — this row enumerates both, and neither is "length"** | **Role 1 — doctor: a cheap over-cap check.** An over-ceiling file is refused having read zero content bytes. **Role 2 — the hook: the over-cap decision itself** (row C2b). **NEVER a length:** `st_size` is never the number of bytes to read, and never the content length, on either surface | a readable regular file may report `st_size` 0 and still yield bytes (the procfs class), so a reader that trusts it as a length sees an empty file. Round 2 finding 3. Round 3 found revision 3 saying "exactly two roles" and then listing "Role 2: none" while C2b defined a second role — one formulation now, here |
| C2b | **Role 2 in full:** `st_size` is the hook's **fast-path** over-cap decision, not its only one | the hook takes `fstat.size` from the descriptor it already holds and injects immediately when that exceeds the ceiling (Table A row A-H7), reading zero content bytes. **When `st_size` underreports, the fast path does not fire and over-cap is decided by the EOF-bounded read** rejecting on `off > ceiling` — a `ceiling + 1` probe in all but name. Both tiers ship; only the earlier prose calling the hook probe-free was wrong | preserves the shipped A10 contract and the `<200ms` measurement. **Owner- and Codex-confirmed** (round 2): open-without-content-read is within A10's intent and better than a separate `stat` |
| C2c | **layered defense against special-file open side effects** | **(a)** the bash scaffold keeps a **`-f` pre-filter** on the digest path — **defense in depth, NOT the authority**: the descriptor `fstat` decides, and `-f` may never be the reason a decision is correct. It rejects a non-regular path **at rest without opening it**, which is protection the shipped script had and which open-then-`fstat` cannot give back. **(b)** `O_NOCTTY` in the flags of both readers. **(c)** the remaining window is a **named residual** — see Residuals below | round 2 finding 2: opening a special file has effects **before** `fstat` can reject it. Demonstrated on this machine: `digest.md` symlinked to a pseudoterminal, opened without `O_NOCTTY`, **acquired a controlling terminal**. The Linux auto-rewind tape class acts even on `close()`, which would collide with doctor's never-mutates claim |
| C3 | symlink policy | **targets and the digest are judged on the RESOLVED type** — a symlink to a regular file is acceptable and must keep working. **Only `AGENTS.override.md` is judged on the link itself** (`lstat`), because a shadow file's mere presence is the signal and a link we cannot resolve is not certainty | round 1 finding 4: revision 1's prose said "type probes are `lstat`", which contradicted both tables |
| C4 | the constants' homes | the hook's inline `MAX_TARGET_BYTES`, and a named constant in `src/cli/doctor.js` | the hook cannot `require` (Implementation notes), so the value is stated twice by necessity. **Both are mirrors of C1** and move in one pass |

### Table D — canonical: error code → answer

The three-answer model, applied uniformly by both surfaces. **The rule is the
first row; the rest are worked instances, not an allowlist** — an errno not listed
falls to "any other" and is therefore doubt, which is why a platform-specific code
needs no spec change.

| id | condition | answer |
|----|-----------|--------|
| D-E1 | **clean `ENOENT`** | **absent** — the only absence |
| D-E2 | **any other throw** | **doubt** |
| D-E3 | `EACCES` (unsearchable parent, unreadable entry) | doubt |
| D-E4 | `ELOOP` (symlink loop) | doubt |
| D-E5 | `ENOTDIR` (a path component is not a directory) | doubt. **Technically provable-unresolvable is still not clean absence** — consistent with A-H4, and the ruling round 1 asked for explicitly |
| D-E6 | `ENAMETOOLONG` | doubt |
| D-E7 | `ENXIO` / `EOPNOTSUPP` (unix socket; the code differs by platform) | doubt |
| D-E8 | `EMFILE`, `ENFILE`, `EIO`, and anything else | doubt |

### Table E — canonical: the fail-open structural contract

**This table is the single owner of these facts.** It exists because
`docs/specs/done/WP-session-start-digest-dedup.md` registered a dated
canonical-extraction trigger: the contract was stated on five surfaces with no
owner among them, and the extraction was routed here as the first change with
write access to three of them at once (round 1 finding 6 — revision 1 promised
this table in AC13 and did not contain it).

| id | required property of `templates/hooks/session-start.sh` | how it is checked |
|----|--------------------------------------------------------|-------------------|
| E1 | no `set -e` anywhere in the script body | anchored grep (an unanchored one matches the header comment and can never go red — the PR #50 erratum) |
| E2 | the script's last statement is `exit 0` | grep for a trailing `exit 0` |
| E3 | the `node -e` invocation is followed by `\|\| true` | grep |
| E4 | the `WIENERDOG_JOB` guard is the **first** executable statement | grep, asserting it precedes every other command |
| E5 | **exactly one** `process.stdout.write` in the payload | counted grep — more than one could emit a partial envelope |
| E6a | the **inner** catch sets `emit = true` | grep for the exact text `catch (e) { emit = true; }` |
| E6b | the **outer** catch is the fail-open no-output one | grep for the exact text `catch (e) { /* fail-open: no output */ }` |
| E6c | **no** catch anywhere sets `emit = false` | negated grep for `catch…emit = false` |
| E7 | every doubt injects | Tables A and D; not separately greppable, and this row says so rather than implying a check exists |

**Registered mirrors of Table E** (ADR-0031). Each cites this table instead of
restating it, and moves with it:

- the shipped script's header comment — **cites Table E by name** (in the Exact
  contracts text above);
- this spec's Verification steps gates — **E1–E5 and E6a–E6c, eight in total**;
- ADR-0004's Decision line, whose hook clause is under a **pending owner
  signature** (Amendment 1, written in PR #53) — not editable here;
- `tests/integration/hooks-fail-open.test.js`'s file header. **This one is a
  known, deliberately uncorrected mirror**: that file is not a deliverable
  because it is this WP's independent witness. Recorded rather than quietly
  omitted.

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each names the tables it implements)
- [ ] Acceptance criteria — one per row of Tables A, B and D, plus C1 parity and Table E
- [ ] Verification commands / greps
- [ ] Current-state descriptions D1–D5 and the two probe tables
- [ ] The two ceiling constants named in Table C row C4
- [ ] Table E's own registered-mirror list (above)

**The two restatements that SHIP IN CODE and therefore cannot be deleted** —
registered here explicitly, because rounds 1–3 each found a defect in this class
and an unregistered in-code comment is how every one of them survived:

- [ ] **The shipped hook's header and inline comments.** They must **point**, not
      restate: Table E for the fail-open structure, R-A/R-B for the residual
      bounds. Round 3 found two that still carried their own claim — a header
      whose "ONLY when" was false for the zero-harness case, and an "on any read
      failure it emits NOTHING" that is true of the digest read only. Both now
      state the digest/target asymmetry or defer.
- [ ] **`digestBlockChecks`' JSDoc.** Same rule: it cites Table C, Table B row B7
      and R-A/R-B and states **no guarantee of its own**. Round 3 found it
      claiming "at most the ceiling resident per target" (contradicting B7's
      measured `N`) and "never blocks on a non-regular path" (contradicting R-B).

**Everywhere else, the fix for a drifted mirror is DELETION, not repair**
(ADR-0031). A restatement that exists only to be kept in sync is a liability.
The rule stands on ADR-0031 alone and needs no incident count behind it — an
earlier draft justified it with "four consecutive rounds found nothing but this
class", which this spec's own history contradicts: rounds 1 and 2 changed
mechanisms, and only round 3 was purely mirror drift.

## Residuals — named, owner-accepted

**R-A — the pre-filter/open swap window.** Layer (a) tests the path with `-f`,
then layer (b) opens it. A **regular file swapped for a device or FIFO between
the test and the open** is not caught by `-f`, and reaches the `open`. What
happens then is bounded by layer (b) — `O_NONBLOCK` and `O_NOCTTY` — and by the
`fstat` refusal that follows, but the `open` itself has occurred.

**Accepted, and the reason is a boundary rather than a probability.** Producing
this requires adversarial-timed local placement inside the user's own config
directories, which is **outside the ADR-0035 attended-execution trust boundary**:
an actor who can write there at will already has the far cheaper option of
editing the files. The layering is what makes the residual small — `-f` removes
every *at-rest* special file, so only a live race remains — and the descriptor
check remains authoritative for everything that gets through.

**R-B — `O_NONBLOCK` is not a universal non-blocking guarantee.** It is specified
for FIFO read-ends and is a no-op for regular files, and those are the cases this
WP is about. **It is not a guarantee for every device class**, and the spec no
longer claims otherwise: the supported-input assumption is that inspected paths
are regular files or the ordinary special files a user creates by accident, and
R-A covers the rest. The script's comments were softened in revision 3 to match —
round 2 asked for exactly this, because "a device can never block this hook" was a
universal the mechanism does not earn.

## Implementation notes & constraints

- **One shared helper, or two local guards? Two, and the asymmetry is the
  point.** The hook is a single-quoted `node -e` payload with **zero imports by
  design** — it runs from `<core>/bin` and cannot rely on resolving the Wienerdog
  package across the npm, vendored and tarball install shapes; that
  self-containment is what makes "any throw ⇒ inject" true by construction. A
  shared `src/` helper could therefore serve **only** doctor, so the real choice
  is "one helper plus one inline guard vs two inline guards". A single-consumer
  module buys nothing and adds a file: **doctor keeps its reader local to
  `digestBlockChecks`, the hook keeps its inline, and Tables C and D are the
  single place their shared facts are decided.** Extract when a third consumer
  appears — mechanical then, speculative now.
- **What the duplication does and does not guarantee.** *Structurally
  guaranteed, and no wider:* **a `null` from the reader reaches `inject`.** The
  call sites are the whole guarantee — `carries()` returns `false` on `null`, and
  a `false` clears `allCarry`, so no refusal the reader *reports* can be
  swallowed downstream. *NOT guaranteed:* that the reader reports one. **A reader
  bug that FABRICATES content instead of returning `null` CAN produce silence —
  when the fabricated bytes happen to look like a fresh block — and round 5
  proved the reachable case by mutation:** the non-regular refusal branch changed
  to return the expected block turned a 92-byte injection into 0 bytes on a FIFO
  target. That class is covered by the Table E gates and the AC2/AC5 fixtures,
  **by testing, not by structure**, and saying otherwise was the defect in
  revision 4's wording. *Convention, not structure:* the two readers agreeing
  with each other. Round 4 also falsified the claim that the hook can only become
  more permissive "by editing the hook" — **doctor-side drift produces the same
  divergence**: tighten doctor's ceiling or its symlink policy and the hook is
  instantly the more permissive of the two, with no hook edit at all. Tables C
  and D are what keep them aligned, and they are a discipline, not a mechanism.
- **Do not add a timeout, a retry, or a signal handler.** The fix for a blocking
  read is to *not block*: `O_NONBLOCK` plus a type check. A timeout would still
  have opened the FIFO, and it would be a process outliving its decision.
- **`doctor` never mutates (WP-070).** Its exit-code behaviour is Table B row
  B6; this note does not restate it.
- **The `<200ms` hook budget (ADR-0004) still binds.** The measured figure lives
  in Current state; re-measure and state your own rather than copying it.
- Plain Node ≥ 18, zero new dependencies, JSDoc types, no build step.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] Every path either surface reads goes through the Table C row C2 mechanism
      and the row C2c layering, **with the limits those rows carry**: the
      check-to-read window is closed *between the `fstat` and the read on one
      descriptor*, and the guards are bounded by residuals **R-A** and **R-B**.
      This item asserts conformance to those rows; it deliberately states no
      universal of its own, because the two it used to state ("cannot block", "no
      swap is possible") were both wider than the mechanism earns.
- [ ] Symlink policy is per Table C row C3 and is **deliberately asymmetric**:
      targets and the digest are judged on the **resolved** type (a symlink to a
      regular file keeps working — AC4 pins it); `AGENTS.override.md` is judged
      on the **link** (`lstat`), because presence is the signal.
- [ ] Every read is **bounded** per Table C row C1 and Table B row B7, so no
      inspected path can drive Wienerdog's memory by growing. The bound is
      `N x ceiling`, not the ceiling — B7 owns the number.
- [ ] No untrusted identifier flows into a filesystem path or a shell command;
      the new warns interpolate only Wienerdog-composed paths and code-owned
      numbers. Nothing read is executed.
- [ ] Failure direction is decided per row in Tables A, B and D — not here.
      This item asserts that every row has one and that none of them is
      "assume fine".

## Acceptance criteria

Each names the row it discharges. Cases and fixtures are the implementer's design
(`docs/runbooks/spec-authoring.md`); these say what must be true. **Every test
that touches a potentially-blocking path must run its subject as a
timeout-bounded child** — `spawnSync`/`execFileSync` with an explicit `timeout`,
plus an assertion that it **did not** time out. A bare call would hang the suite
instead of failing it (round 1 finding 8).

- [ ] **AC1 (A-H2, A-H3, A-H4; Table D rows D-E1, D-E2, D-E3, D-E4, D-E5, D-E6, D-E7, D-E8):** the hook injects whenever a harness
      directory's `stat` fails with anything but a clean `ENOENT`, and treats only
      `ENOENT` as absence — **including the dual-harness case that is a real wrong
      silence today** (one harness fresh, the other's dir erroring). Deterministic
      minimum: `EACCES`, `ELOOP`, `ENOTDIR`, `ENAMETOOLONG`. `EMFILE`/`EIO` may be
      covered as structural-branch checks rather than fixtures — portable
      fixtures for them are unreliable.
- [ ] **AC2 (A-H5, A-H6):** the hook injects for a non-regular target — at minimum
      a FIFO with no writer, a symlink→FIFO, and a directory — **and the child
      does not time out**.
- [ ] **AC3 (A-H8):** the hook injects when `AGENTS.override.md` is a **dangling
      symlink**, where `152ae3a` is silent.
- [ ] **AC4 (C3, acceptance regression):** a target that is a **symlink to a
      regular file** carrying a fresh block still **silences** the hook, and is
      still inspected by doctor. The guard must not over-refuse.
- [ ] **AC5 (A-H1, A-H7, A-H9, A-H10; Table C rows C2, C2b):** unchanged rows stay unchanged — fresh
      block silences, zero harnesses inject, and an absent / non-regular /
      over-ceiling `digest.md` stays silent. **Over-ceiling targets inject on
      both A-H7 tiers, and both are exercised:** the **fast path**, where
      `st_size` exceeds the ceiling and injection happens with **zero content
      bytes read**; and the **slow path**, where an `st_size`-underreporting file
      passes the fast check and its over-cap emerges from the `ceiling + 1`
      bounded read. *An earlier revision asserted "no content read" universally
      here, which is false on the slow path — round 5 caught the stale mirror.*
- [ ] **AC6 (B2, B3, B8):** `doctor` warns and **exits** on a non-regular target
      and on a non-`ENOENT` open failure; the child does not time out. Today it
      hangs indefinitely (alive at 15 s, killed).
- [ ] **AC7 (B5):** `doctor` emits its actionable over-ceiling `[warn]` naming
      the file, its **observed** size and the ceiling, telling the user to trim
      and re-run, and **never** suggesting `wienerdog sync` (a grep proves
      `sync` is absent from that message). **Both B5 cases are exercised:** an
      honest over-ceiling file, where the message carries `st_size`; and an
      `st_size`-**underreporting** file whose over-cap is found by the read,
      where the message says `larger than <ceiling>` and states no number it
      cannot know. A test that only covers the honest case leaves the branch B7
      forced into existence untested.
- [ ] **AC8 (B7), with an objective threshold.** On a target of at least 64 MiB,
      `doctor`'s peak RSS must not exceed **baseline + the Table B row B7 bound**
      (B7 owns `N`, the ceiling and the product; this criterion asserts against
      it and does not restate the number). **Baseline on
      `152ae3a`: 418 MB peak against a 61 MB normal-file baseline**, i.e. today's
      code fails this by a wide margin and grows without limit above 64 MiB.
      **Run it at two sizes — 64 MiB and 256 MiB — and show the peak barely
      moves**; that is what distinguishes bounded from merely-smaller, and a
      single size cannot. Also run the **3-byte-line** profile at the ceiling,
      which is the worst case `N` came from. State every number.
- [ ] **AC9 (B9, B10, B11):** a non-regular / over-ceiling / unreadable
      `digest.md` produces the new `[warn]` and **no target inspection**; a
      cleanly absent one stays fully silent.
- [ ] **AC10 (B1, B4, B6):** every pre-existing `digestBlockChecks` behaviour,
      message string and exit code is unchanged, and the existing
      `tests/unit/doctor.test.js` cases pass untouched.
- [ ] **AC11 (regression witness):** `tests/integration/hooks-fail-open.test.js`
      passes **byte-unchanged**.
- [ ] **AC12 (C1, C4):** both homes of the ceiling carry the same number; a grep
      proves it.
- [ ] **AC13 (Table E rows E1, E2, E3, E4, E5, E6a, E6b, E6c; E7 is stated non-greppable by its own row and is discharged by Tables A and D, not by a gate):** the fail-open contract has its canonical table here, the
      shipped script header **cites it by name**, **all eight** verification
      gates run (E1–E5 and E6a–E6c; E6 became three when round 2 found the
      single gate vacuous), and `hooks-fail-open.test.js`'s header is recorded as
      a known uncorrected mirror.
- [ ] **AC14 (portability — the open evidence gap, enumerated).** The mechanism is
      probed on **macOS only** (Current state), so Linux evidence is mandatory.
      **Actor:** the implementer. **Timing:** before merge, not after.
      **Where:** a Linux runner, or Linux in a container — CI cannot be relied on
      while Actions is down. **What must be run, all of it:**
      1. `node --test tests/integration/hooks-fail-open.test.js`
      2. `node --test tests/integration/session-start-dedup.test.js`
      3. `node --test tests/unit/doctor.test.js` — the doctor suite is **not**
         optional here; the bounded reader is as platform-sensitive as the hook
      4. the named fixture rows, individually visible in the output: **target
         FIFO**, **`digest.md` FIFO**, **symlink → FIFO**, **symlink → regular
         (the acceptance case, must still silence)**, and **the virtual-regular
         `st_size` 0 case** — on Linux use a procfs path (e.g. `/proc/self/status`)
         as the target, which macOS cannot provide at all
      **What counts as the recorded observation:** the pasted stdout of each of
      the four, showing pass counts and the individual fixture-row names — not a
      summary sentence, and not "ran green locally". A row that could not be
      constructed is reported as such with the reason, never silently omitted.
      Codex confirmed the FIFO and symlink fixtures are constructible on macOS and
      Linux with plain `mkfifo` / `fs.symlinkSync`.
- [ ] **AC15 (budget):** the hook's measured time on a normal digest with a
      matching block stays well under 200 ms; the PR states the number
      (Current state records the figure measured for the specified script).
- [ ] **AC16 (C2a, `st_size` is not a length):** a readable regular file that
      reports `st_size` 0 and still yields bytes is read correctly, not as empty,
      by **both** surfaces. On Linux a procfs path serves; where the platform
      cannot produce one, the criterion is discharged by showing the read loop
      terminates on EOF rather than on `st_size` and saying which platform could
      not be exercised.
- [ ] **AC17 (C2c layered defense; A-H11 the at-rest rejection; C2 the mechanism):** the `-f` pre-filter is present in the
      scaffold **and** is proven non-authoritative — a path that passes `-f` and
      is then non-regular at `fstat` is still refused. `O_NOCTTY` is present in
      both readers' flags, and a grep proves it. **AC4's symlink → regular
      acceptance case must still pass**, since `-f` follows symlinks: restoring
      the pre-filter must not re-break what round 1 finding 4 fixed.
- [ ] Every new verification step is observed **on both sides** — green on the
      fixed state, red on a deliberately broken one, and red on the
      deliverable-absent case where a negated grep is used. Paste all outputs.

## Verification steps (run these; paste output in the PR)

```bash
# Suites. hooks-fail-open must be untouched as well as passing.
node --test tests/integration/hooks-fail-open.test.js
git diff --stat -- tests/integration/hooks-fail-open.test.js   # expect: no output
node --test tests/integration/session-start-dedup.test.js
node --test tests/unit/doctor.test.js
npm test
npm run lint

# Table E: EIGHT gates — E1-E5 and E6a-E6c. Each is guarded by `test -f` so the
# DELIVERABLE-ABSENT
# case is RED (a bare negated grep exits 0 when the file is missing — the
# runbook's rule), and each prints its own verdict rather than relying on exit
# status alone.
#
# ALREADY OBSERVED ON ALL THREE SIDES while drafting, against the script in
# Exact contracts (2026-08-30, this machine):
#   compliant           -> E1..E6 all "ok"
#   deliverable absent  -> all eight "RED" (every gate, not just the greps)
#   deliberately broken -> E1, E2, E4, E5 "RED"; E3 and E6b stayed "ok" because
#                          that mutation did not touch what they assert
# And E6a/E6b/E6c separately, on the mutation that defeated the old E6 (inner
# catch flipped to `emit = false`): E6a RED, E6c RED, E6b ok — while the OLD
# gate printed "ok" on that same file, which is the finding.
# Re-run all three on the finished tree and paste them; the third case must
# break a DIFFERENT property per gate, not one mutation for all eight.
H=templates/hooks/session-start.sh
test -f "$H" && ! grep -qE '^[[:space:]]*set -e' "$H" && echo "E1 ok: no set -e" || echo "E1 RED"
test -f "$H" && tail -n1 "$H" | grep -qE '^exit 0$' && echo "E2 ok: trailing exit 0" || echo "E2 RED"
test -f "$H" && grep -qE "^' \"\\\$DIGEST\" \|\| true$" "$H" && echo "E3 ok: || true" || echo "E3 RED"
test -f "$H" && [ "$(grep -nvE '^[[:space:]]*(#|$)' "$H" | head -1 | grep -c 'WIENERDOG_JOB')" = 1 ] \
  && echo "E4 ok: WIENERDOG_JOB is the first statement" || echo "E4 RED"
test -f "$H" && [ "$(grep -c 'process\.stdout\.write' "$H")" = 1 ] \
  && echo "E5 ok: exactly one stdout write" || echo "E5 RED"
# E6 was VACUOUS in revision 2: `grep -c 'catch (e)'` counts five in this script
# and stays green when the inner catch is flipped to `emit = false` — proven on
# exactly that mutation. Three exact-pattern gates replace it.
test -f "$H" && grep -qF 'catch (e) { emit = true; }' "$H" \
  && echo "E6a ok: inner catch sets emit = true" || echo "E6a RED"
test -f "$H" && grep -qF 'catch (e) { /* fail-open: no output */ }' "$H" \
  && echo "E6b ok: outer fail-open catch" || echo "E6b RED"
test -f "$H" && ! grep -qE 'catch[^\n]*emit[[:space:]]*=[[:space:]]*false' "$H" \
  && echo "E6c ok: no catch sets emit = false" || echo "E6c RED"

# The payload is still one single-quoted bash argument (no `'` inside it).
node -e 'const fs=require("fs");const Q=String.fromCharCode(39);
const lines=fs.readFileSync("templates/hooks/session-start.sh","utf8").split("\n");
const a=lines.findIndex((l)=>l==="node -e "+Q);
const b=lines.findIndex((l,i)=>i>a && l.startsWith(Q+" \"$DIGEST\""));
if(a<0||b<0){console.error("payload delimiters not found");process.exit(1);}
const bad=lines.slice(a+1,b).filter((l)=>l.includes(Q));
console.log("payload lines:",b-a-1,"| with a single quote:",bad.length);
if(bad.length){console.error(bad.join("\n"));process.exit(1);}'

# Table C row C1 — one number, both homes.
grep -n "4194304" templates/hooks/session-start.sh src/cli/doctor.js

# AC7 — the over-ceiling message must not send the user to `sync`.
node -e 'const t=require("fs").readFileSync("src/cli/doctor.js","utf8");
const m=t.split("\n").filter((l)=>l.includes("too large")||l.includes("ceiling"));
console.log(m.join("\n"));
if(m.some((l)=>l.includes("wienerdog sync"))){console.error("over-ceiling message must not suggest sync");process.exit(1);}
console.log("ok: no sync suggestion in the over-ceiling message");'

# doctor still never mutates.
grep -n "writeFileSync\|mkdirSync\|chmodSync\|rmSync\|unlinkSync" src/cli/doctor.js   # expect: no output

# The landed quarantine WP's DOCTOR DISCIPLINE gate, verbatim from
# docs/specs/done/WP-doctor-quarantine-counts.md, must still print OK.

# Universal-claim sweep over THIS spec. Prints a classification table; a review
# round DIFFS the table instead of rebuilding it, and the table is only worth
# diffing because this command regenerates it. Every row outside the canonical
# and registered buckets must be a reference or a record — never a self-claim.
node -e '
const fs=require("fs");
const L=fs.readFileSync(process.argv[1],"utf8").split("\n");
const U=/\b(never|always|cannot|can never|only|at most|exactly|impossible)\b/i;
const D=/\b(block|blocks|blocking|swap|swapped|resident|memory|RSS|ceiling|probe|read|reads|inject|injects|silence|silent|mutat|open|descriptor|device|FIFO)\b/i;
const a=L.findIndex((l)=>l.trim()==="#!/usr/bin/env bash");
const b=L.findIndex((l,i)=>i>a && l.trim()==="```");
let z=null; const Z=[];
for (const l of L){const t=l.trim();
  if(/^\*\*The memory contract \(row B7\)/.test(t)) z="B7";
  else if(/^## Residuals/.test(t)) z="residuals";
  else if(/^## /.test(t)&&z==="residuals") z=null;
  else if(/^### /.test(t)&&z==="B7") z=null;
  Z.push(z);}
const m=new Map(); const add=(k,i)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(i+1);};
L.forEach((raw,i)=>{const t=raw.trim();
  if(!U.test(t)||!D.test(t))return;
  if(a>=0&&i>=a&&i<=b) return add("registered in-code surface (embedded script)",i);
  if(t.startsWith("|")) return add("canonical table row",i);
  if(t.startsWith(">")) return add("historical / round record",i);
  if(t.startsWith("/**")||/^\*\s/.test(t)) return add("registered in-code surface (doctor JSDoc)",i);
  if(/^- \[ \]/.test(t)) return add("acceptance criterion / checklist",i);
  if(/^(grep|test -f|node -e|H=|npm|git|#)/.test(t)) return add("verification command",i);
  if(Z[i]) return add("canonical prose ("+Z[i]+")",i);
  return add("prose",i);});
let n=0; console.log("| classification | count | lines |"); console.log("|---|---|---|");
for(const [k,v] of m){n+=v.length; console.log(`| ${k} | ${v.length} | ${v.join(", ")} |`);}
console.log(`| **TOTAL** | **${n}** | |`);
' docs/specs/WP-hook-doctor-inspection-read-hardening.md
```

Two measurements are taken by hand and pasted, because no unit test asserts
them: **doctor's peak RSS** on a ≥64 MiB target (`/usr/bin/time -l` on macOS,
`-v` on Linux) against its normal-file baseline, per **AC8**; and **the hook's
elapsed time** on a normal digest with a matching block, per **AC15**. State
every number and the baseline compared against.

**The Linux evidence is a third obligation and is NOT summarised here.** It is
enumerated in **AC14** — suites, fixture rows, actor, timing, and what counts as
a recorded observation — and this paragraph deliberately does not repeat the
list, because the previous revision's summary re-narrowed it to "the two hook
suites", which is the exact drift AC14 was widened to prevent.

## Out of scope (do NOT do these)

- The two accepted residuals: TOCTOU on a mid-hook **digest rewrite**, and
  invalid-UTF-8 replacement folding. Owner-dispositioned; reopening either is a
  contract change and the owner's act. (The *type*-swap TOCTOU is in scope and is
  closed — different finding.)
- Any change to block semantics, `buildBlock`, `locateManagedBlock`,
  `applyManagedBlock`, or `src/adapters/shared.js`.
- Any other `doctor` check, and any reordering of `doctor`'s output groups.
- Timeouts, retries, signal handlers, or async rewrites of either surface.
- Editing `tests/integration/hooks-fail-open.test.js`.
- Amending ADR-0004. Its Amendment 1 is written and awaits the owner's signature;
  that is not an implementer's act.
- Changing `DigestCaps`, or treating its 32 KiB as a filesystem guarantee
  (Table B row B11).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   the three hand-taken measurements and the both-sides observation of every new
   check.
2. Conventional commits; PR titled
   `fix(hooks,doctor): type-guard and bound inspection reads (WP-hook-doctor-inspection-read-hardening)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR. This is not a
   Deliverables-boundary violation and needs no table row —
   `scripts/boundary-check.js` allows the spec file by path.
