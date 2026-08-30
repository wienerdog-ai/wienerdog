---
id: WP-session-start-digest-dedup
title: Make the SessionStart hook inject the digest only when the managed block lacks it
status: Done
model: opus
size: M
depends_on: [WP-doctor-digest-block-drift]
adrs: [ADR-0004, ADR-0039]
epic: digest-delivery
---

# WP-session-start-digest-dedup: Make the SessionStart hook inject the digest only when the managed block lacks it

> **Archived 2026-08-30, post-merge.** Shipped in PR #50 (`152ae3a`), after
> **both** gates: wd-reviewer **APPROVE** (its finding 1 applied in `d10fe7c`
> before merge) and the Codex design gate **FINDINGS (4), all dispositioned by
> the owner** — record in the PR #50 closing comment. The text below carries
> **three dated errata** folded in during this archive pass, plus the two
> accepted residuals, now recorded in a "Residuals" section of their own.
>
> 1. **Verification step 3** — `grep -n "set -e"` can never be silent: the
>    script's own header comment contains the phrase (`session-start.sh:7`,
>    "no `set -e`"), and that comment predates this WP. The step asserted
>    "expect: no output" against a grep that always matches, so it proved
>    nothing and could never go red. Replaced with an anchored form,
>    `grep -nE '^[[:space:]]*set -e'`, verified silent on the shipped script and
>    still matching a real `set -e`/`set -euo pipefail` line.
> 2. **Mirrored Surface Checklist** — the acceptance-criteria bullet said
>    AC1–AC13 while the spec defines **AC14**, and Table A row **A12** had no
>    criterion and no explanation. Both corrected in place; A12 is now marked
>    explicitly *unreachable from outside the process*, with the reason.
> 3. **`docs/adr/0004-no-daemon-invariant.md`** — its Decision line still says
>    hook scripts do "no computation at SessionStart", which this WP made
>    literally false. **Amendment 1 is written in that ADR and marked pending the
>    owner's signature**; ADR-0004's Decision line is registered on the checklist
>    below so the two move together. Until it is signed, the ADR's ratified text
>    stands as written and this note is the only thing marking it stale.
>
> A fourth reviewer recommendation — extract the scattered fail-open structural
> contract to one canonical owner — is **recorded as a named trigger** on the
> checklist rather than done here, because four of its five surfaces are product
> code or another document's ratified text. It is routed to
> `WP-hook-doctor-inspection-read-hardening`.

## Context (read this, nothing else)

Wienerdog gives a user's AI a memory made of files. The **digest** is the
pre-rendered session-context file `~/.wienerdog/state/digest.md` (identity notes
plus active context), rendered deterministically by `renderDigest`
(`src/core/digest.js`). The **managed block** is the sentinel-delimited region
(`<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->`) that Wienerdog owns inside
the user's `~/.claude/CLAUDE.md` and `$CODEX_HOME/AGENTS.md`; Wienerdog never
edits outside it. **Wienerdog is just files** — this WP adds no process, no
daemon, no telemetry, and the hook still runs and exits (ADR-0004).

**The digest reaches a session through two channels, on purpose:**

1. **The managed block**, written only by an attended `wienerdog sync`
   (`src/cli/sync.js` → `shared.applyManagedBlock`). This is the **no-hooks
   baseline** — a user who trusts no hooks, or a Codex user who has not run
   `/hooks`, still gets their context.
2. **The SessionStart hook** (`templates/hooks/session-start.sh`), which reads
   `digest.md` and emits it as `additionalContext` on every session. This is the
   **fresh-between-syncs enrichment** — the nightly dream job rewrites `digest.md`
   without touching the block, so between syncs only the hook carries the newer
   bytes.

**The problem, measured.** `renderDigest` is deterministic, so in the common
healthy steady state the nightly rewrite reproduces the block's bytes exactly, and
every session then carries **two byte-identical copies** of the same 6–23 KB. The
copies diverge only on a discrete event (identity re-approved, project list
changed, an alert / quarantine / update banner toggled), and such a divergence
persists until the user's next manual `sync` — possibly days. The cost is paid
every session; the benefit is collected only on the sessions after such an event.

**The decision (ADR-0039, Accepted — OWNER-SIGNED 2026-08-30, ratified in the review round that
moves this spec to `Ready`): keep both channels, stop sending the second identical
copy.** The hook compares the digest against the managed block of every present
harness and emits **nothing** when they already carry the same bytes. On any
difference, missing or ambiguous block, read error, or doubt of any kind, it emits
the full digest exactly as it does today.

**Fail-open is the tie-breaker in every ambiguous case.** A wrong silence loses
the user's context for a whole session; a wrong injection only costs tokens. This
rule (WP-121's fail-open harness) is why the hook has no `set -e`, always exits 0,
and writes its envelope in a single call or not at all.

**Three constraints that shape the design and are not negotiable:**

- **No warning on mismatch.** A mismatch persists until the next manual sync, so a
  hook-side warning would fire on every session for days — pure noise. Surfacing
  drift belongs in `wienerdog doctor` (`WP-doctor-digest-block-drift`, this WP's
  one dependency).
- **The block is NOT byte-identical to `digest.md`.** `buildBlock`
  (`src/adapters/shared.js` lines 146–157) neutralizes any digest line that trims
  exactly to a sentinel (`wienerdog:begin` → `wienerdog begin`) and `trimEnd()`s
  the result. The comparison must reproduce that transformation.
- **The hook is harness-blind.** Both adapters copy the *same*
  `templates/hooks/session-start.sh` to `<core>/bin/session-start.sh`
  (`src/adapters/claude.js` lines 75–87, `src/adapters/codex.js` lines 55–105), so
  at runtime it cannot tell a Claude session from a Codex one. It therefore
  requires **every present harness's** block to match before going silent.

## Current state

`templates/hooks/session-start.sh` on `main` = `0410e3a` (verbatim, 31 lines).
**Every file this WP cites is byte-identical to `upstream/main`, and none of them
was touched by the `quarantine-surface` epic** — `session-start.sh`,
`src/adapters/shared.js`, `src/adapters/claude.js`, `src/adapters/codex.js`,
`src/core/paths.js`, `src/core/detect.js`, `src/cli/sync.js`,
`tests/integration/hooks-fail-open.test.js`, `docs/ARCHITECTURE.md` and
`tests/golden/` all return an empty `git diff --stat` both against
`upstream/main` and across `dcd5777..0410e3a` (verified 2026-08-30). Every
citation below was measured here:

```bash
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
```

The block-building and block-locating logic it must agree with, from
`src/adapters/shared.js` (verbatim):

```js
const BEGIN = '<!-- wienerdog:begin -->';
const END = '<!-- wienerdog:end -->';

function buildBlock(digest) {
  const safeDigest = digest
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t === BEGIN) return line.replace(BEGIN, '<!-- wienerdog begin -->');
      if (t === END) return line.replace(END, '<!-- wienerdog end -->');
      return line;
    })
    .join('\n');
  return `${BEGIN}\n${safeDigest.trimEnd()}\n${END}`;
}
```

`locateManagedBlock(content, what)` in the same file finds the single block by
**full-line** sentinel match (a line whose `trim()` equals the sentinel), returns
`{begin, end}` where `begin` is the start offset of the BEGIN line and `end` is
`startOfEndLine + line.indexOf(END) + END.length`, returns `null` when neither
sentinel line exists, and **throws** when the markers are ambiguous (more than one
BEGIN or END line, an END before the BEGIN, or exactly one of the two).

`src/core/paths.js` resolves the harness config dirs as
`WIENERDOG_CLAUDE_DIR || CLAUDE_CONFIG_DIR || $HOME/.claude` and
`CODEX_HOME || $HOME/.codex`, with `home = env.HOME || os.homedir()`.
`detectHarnesses` (`src/core/detect.js`) calls a harness *present* when that
directory exists.

`tests/integration/hooks-fail-open.test.js` (22 tests, all passing on fork `main`)
drives all three shipped hooks as bash subprocesses through every adverse
condition and asserts exit 0. Its `baseEnv(core)` sets `HOME` and
`WIENERDOG_HOME` to a fresh temp dir containing only `state/`, so **no harness
directory exists in any of those tests** — under the new behaviour every one of
them still injects, and all 22 pass unchanged — verified on `0410e3a` 2026-08-30 by running that file
against the exact script in "Exact contracts" below (`tests 22 / pass 22 /
fail 0`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (you flip its `status:` — Definition of done item 4), package-lock.json,
     memory/lessons/inbox.md, and docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | templates/hooks/session-start.sh | replace wholesale with the script in "Exact contracts"; implements Table A + Table B |
| create | tests/integration/session-start-dedup.test.js | the Table A / Table B cases, incl. the `buildBlock` parity loop |
| modify | docs/ARCHITECTURE.md | one row cell: the hook is no longer "no computation" (exact edit below) |

`tests/integration/hooks-fail-open.test.js` is **not** in this table: it must pass
byte-unchanged.

### Exact contracts

**1. `templates/hooks/session-start.sh` — the complete new file.** Write exactly
this. It was drafted, executed and verified against the real `buildBlock` and the
real `applyManagedBlock` on 2026-08-30; the `node -e` program is a
**single-quoted** bash argument, so it must contain **no `'` character anywhere**
(that is why it uses `var`, double quotes, and avoids contractions).

```bash
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
```

**2. `docs/ARCHITECTURE.md` — one cell.** In the "Canonical core and adapters"
table, the `Session digest` row currently reads:

```text
| Session digest | Pre-rendered `~/.wienerdog/state/digest.md` — refreshed by every dream run and by `sync`; the SessionStart hook only cats it (<200ms, no computation) | Same file |
```

Replace that middle cell with:

```text
Pre-rendered `~/.wienerdog/state/digest.md` — refreshed by every dream run and by `sync`; the SessionStart hook injects it only when the managed block is not already carrying the same bytes (<200ms; one string compare, no computation over the vault — ADR-0039)
```

Change nothing else in that file.

## Contract reference

The ADR-0031 activation trigger fires on **four** of the seven: **(i)** the hook's
output shape changes (an empty stdout becomes a normal outcome, not only a failure
outcome); **(ii)** a result taxonomy is introduced (carries / does-not-carry /
unknown, per harness); **(iv)** fallback and precedence behaviour is the substance
of the change; **(vii)** the same rules are mirrored across the script's comments,
the acceptance criteria, the verification commands and the test list.

Both tables below are **declarative fact tables** — observed state → decision, and
name → resolution. Neither carries a `mechanism`, `seam` or `how to produce it`
column, so ADR-0036's cell schema does not apply to them; how each state is
produced in a test lives in the test list under "Acceptance criteria", a registered
mirror.

### Table A — canonical: what the hook emits, for every observable state

`want` = `expectedBlock(digest)`. A harness is **present** iff its config
directory (Table B) exists. `carries` is evaluated per present harness.

| id | observed state | hook emits |
|----|----------------|------------|
| A1 | `WIENERDOG_JOB` is set | **nothing** (pre-existing job skip, unchanged) |
| A2 | neither `WIENERDOG_HOME` nor `HOME` set, or `node` unresolvable, or `<core>/state/digest.md` is not a regular file | **nothing** (pre-existing, unchanged) |
| A3 | `digest.md` exists but cannot be read (TOCTOU delete, EISDIR, mode 000) | **nothing** (pre-existing, unchanged — no partial envelope) |
| A4 | **zero** harness directories present | full digest |
| A5 | every present harness carries `want` | **nothing** |
| A6 | any present harness's target file has a block that differs from `want` | full digest |
| A7 | any present harness's target file exists but has **no** sentinel line | full digest |
| A8 | any present harness's target file is absent or unreadable | full digest |
| A9 | any present harness's target file has **ambiguous** sentinels (>1 BEGIN, >1 END, exactly one of the two, or END before BEGIN) | full digest |
| A10 | any present harness's target file is larger than `MAX_TARGET_BYTES` (4 MiB) | full digest (the file is not read) |
| A11 | Codex is present and `$CODEX_HOME/AGENTS.override.md` exists | full digest (the override silently shadows our `AGENTS.md`, so the block is not delivered) |
| A12 | anything throws inside the dedup decision | full digest (the inner `catch` sets `emit = true`) |

**The conjunction rule, stated once:** the hook is silent **only** when
`present > 0 && every present harness carries want`. Rows A6–A11 are each
sufficient on their own to force injection, for **any one** present harness.

### Table B — canonical: path and presence resolution (mirrors `src/core/paths.js`)

| id | name | resolution |
|----|------|------------|
| B1 | `home` | `$HOME` \|\| `os.homedir()` \|\| `""` |
| B2 | core | `$WIENERDOG_HOME` \|\| `$HOME/.wienerdog` (resolved in bash, passed to node as `argv[1]`'s parent) |
| B3 | digest | `<core>/state/digest.md` |
| B4 | Claude config dir | `$WIENERDOG_CLAUDE_DIR` \|\| `$CLAUDE_CONFIG_DIR` \|\| `<home>/.claude` |
| B5 | Claude target file | `<Claude config dir>/CLAUDE.md` |
| B6 | Codex config dir | `$CODEX_HOME` \|\| `<home>/.codex` |
| B7 | Codex target file | `<Codex config dir>/AGENTS.md` |
| B8 | Codex shadow file | `<Codex config dir>/AGENTS.override.md` |
| B9 | presence | the config dir exists **and is a directory** (`fs.statSync(dir).isDirectory()`) — mirrors `detectHarnesses` |
| B10 | `want` | `BEGIN + "\n" + neutralize(digest).trimEnd() + "\n" + END`, where `neutralize` replaces a line whose `trim()` equals a sentinel with the space-form (`wienerdog begin` / `wienerdog end`) — byte-for-byte `buildBlock` |

**B1/B4/B6 deliberately do not re-implement `assertSafeOverride`.** An unsafe
override value simply makes the reads fail, which lands on A8 → inject. Fail-open,
no new validation surface in a hook.

### Mirrored Surface Checklist

Every surface below restates a fact decided in Table A or Table B. A finding that
changes a table row changes all of these in the same pass; a new mirror found in
review is added here on the spot.

- [ ] **Deliverables cell** for `templates/hooks/session-start.sh` ("implements
      Table A + Table B") — Tables A and B.
- [ ] **The shipped script's comment header and inline comments** (the
      `ANY doubt injects` sentence, the `MAX_TARGET_BYTES` rationale, the
      `AGENTS.override.md` comment) — Table A rows A5, A10, A11, A12.
- [ ] **The `docs/ARCHITECTURE.md` cell** ("only when the managed block is not
      already carrying the same bytes") — Table A row A5.
- [ ] **Acceptance criteria** AC1–**AC14** — one per Table A row plus the two
      parity criteria (AC13 `buildBlock`, AC14 `applyManagedBlock`). **Table A row
      A12 has no acceptance criterion and is not supposed to have one:** it is the
      inner `catch`, and it is *unreachable from outside the process*. Every
      filesystem state a test can construct lands on A6–A11 first, so a test that
      claimed to exercise A12 would in fact be exercising one of those. A12 is a
      structural guarantee, pinned by the script's shape — the inner `try/catch`
      whose `catch` sets `emit = true` — and read by review, not by a case.
      *Registered 2026-08-30, post-Done: this line said AC1–AC13 while the spec
      defined AC14, and left A12's absence unexplained; both are corrected here.*
- [ ] **Verification commands / greps** in "Verification steps" — Table A rows A5
      and A6, Table B row B10.
- [ ] **Current-state description** (the `buildBlock` excerpt, the
      `locateManagedBlock` description, the `paths.js` resolution sentence) —
      Table B rows B4, B6, B10.
- [ ] **`tests/integration/session-start-dedup.test.js`** case list — every Table A
      row A4–A12 and Table B rows B4, B6, B8, B9, B10.
- [ ] **ADR-0039's Consequences bullets** (harness-blindness, the duplicated
      `buildBlock` transformation) — Table A's conjunction rule and Table B row B10.
- [ ] **`docs/adr/0004-no-daemon-invariant.md`, the Decision line's hook clause**
      — Table A's whole premise that the hook now computes. *Registered
      2026-08-30, post-Done: see Amendment 1 in that ADR, written and **pending
      the owner's signature**. Until it is signed the ADR's Decision line still
      reads "no computation at SessionStart", which this WP made literally false;
      the pair moves together the moment the signature lands.*

> **Canonical-extraction trigger, named and dated 2026-08-30 (post-Done) — the
> record ADR-0031 asks for when a contract is scattered rather than owned.** The
> **fail-open structural contract** — no `set -e`; always `exit 0`; the
> `WIENERDOG_JOB` guard first; a single `process.stdout.write` or none; the outer
> `try/catch` around the digest read; the inner `try/catch` whose `catch` sets
> `emit = true`; and the tie-break rule that ANY doubt injects — is currently
> stated on **five** surfaces with no canonical owner among them:
>
> 1. the shipped `templates/hooks/session-start.sh` header comment;
> 2. this spec's "Implementation notes" fail-open bullet;
> 3. this spec's Verification step 3 (the greps that assert the structure);
> 4. `tests/integration/hooks-fail-open.test.js`'s file header;
> 5. `docs/adr/0004-no-daemon-invariant.md`'s Decision line (the `<200ms` /
>    computation clause), plus ADR-0039's fail-open Consequence.
>
> **Not extracted in this round, deliberately.** Four of the five are product
> code or another document's ratified text; a docs-only archival pass can edit
> neither, and a canonical table added to a `Done` spec would be a sixth
> statement rather than an owner. **The extraction is routed to
> `WP-hook-doctor-inspection-read-hardening`**, which re-issues the hook script
> and touches `hooks-fail-open.test.js` anyway — it is the first change with
> legitimate write access to surfaces 1, 3 and 4 at once, which is what makes the
> extraction cheap there and impossible here.

## Implementation notes & constraints

- **Do not pass the harness as an argv flag or split the script per harness.**
  `doctor`'s stale-hook detector (`unquoteCommand` + basename matching,
  `src/cli/doctor.js` lines 155–228, keyed on `WD_HOOK_PAIRS`) and
  `applySettings`' own-variant pruning (`src/adapters/shared.js`) both key on the
  command *string shape*. A split would also strand the already-registered
  `session-start.sh` entry in an existing user's `hooks.json`: its script still
  exists, so neither the pruner nor the stale-hook detector would ever remove it,
  and the user would keep a duplicate SessionStart hook forever. One script,
  conservative conjunction — rejected alternative recorded in ADR-0039.
- **Do not extract the comparison into a separate `.js` file next to the hook.**
  It would be more testable, but a missing or unreadable helper would then have to
  fall back to injecting, which puts the emit logic back in the `.sh` anyway — two
  copies of the emitter, and a fail-open path that is exercised by nothing. One
  self-contained `node -e` program keeps "any throw ⇒ inject" true by construction.
- **The `node -e` program duplicates `buildBlock`'s transformation and cannot
  `require` it** — a shipped hook runs from `<core>/bin` and cannot rely on
  resolving the Wienerdog package (npm, vendored and tarball installs all differ).
  The duplication is bounded in the safe direction: any divergence yields a
  mismatch, and a mismatch injects. **The parity test (AC13) is what pins it** —
  do not weaken it into a hand-written expected string; it must call the real
  `buildBlock` from `src/adapters/shared.js`.
- **No single-quote characters anywhere inside the `node -e` program.** The whole
  program is one single-quoted bash argument. This is why the script uses `var`,
  double-quoted strings, and phrasings without apostrophes. If you need an
  apostrophe in a comment, rewrite the comment.
- **Keep the structure that makes fail-open true:** no `set -e`, `exit 0` at the
  end, `|| true` after the `node -e`, the single `process.stdout.write`, the outer
  `try/catch` around the read, the inner `try/catch` around the dedup decision, and
  the `WIENERDOG_JOB` guard as the very first statement.
- **Time budget: <200ms (ADR-0004).** Measured 2026-08-30 on the maintainer's real
  32 KB digest with a matching block: **22.4 ms** average over five runs on
  `0410e3a` (21.8 ms on the earlier base — unchanged, as the hook's inputs are).
  A 17-scenario behavioural sweep against the real `buildBlock` and real
  `applyManagedBlock` (append path included) passed 17/17 on 2026-08-30 —
  the six `buildBlock`-parity digests of AC13, plus stale, no-block, file-absent,
  ambiguous, no-harness, oversize-4 MiB, dual-fresh, dual-codex-stale,
  dual-override, applyManagedBlock-append and `CLAUDE_CONFIG_DIR`-override.
- `shellcheck --severity=warning` runs in CI (it is skipped locally when the
  binary is absent). The script's shell structure is unchanged from the current
  passing file — only the `node -e` payload grows — but confirm it in CI.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR description. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier flows into a filesystem path or a shell command.
      The hook composes paths only from environment variables that `paths.js`
      already treats as trusted install configuration, and passes exactly one
      argument (`"$DIGEST"`, double-quoted) to `node -e`. It executes nothing it
      reads; the digest and the harness markdown are read as data and compared as
      strings. The only bytes ever written to stdout are `JSON.stringify` output.
- [ ] Reads are bounded: `digest.md` is Wienerdog-written and capped at 32 KB by
      `DigestCaps`; a harness markdown file over `MAX_TARGET_BYTES` (4 MiB) is not
      read at all (Table A row A10).
- [ ] No new file is created, no file is modified, no permission is changed. The
      hook remains read-only plus stdout.

## Acceptance criteria

Each maps to a Table A row and to a named test in
`tests/integration/session-start-dedup.test.js` (skip the whole file on
`process.platform === 'win32'`, matching `hooks-fail-open.test.js`).

- [ ] **AC1 (A5, Claude only):** Claude dir present, `CLAUDE.md` written with the
      real `buildBlock(digest)` → exit 0, **empty stdout**.
- [ ] **AC2 (A6):** same, but the block was built from a *different* digest →
      exit 0, one valid envelope whose `additionalContext` equals the digest file
      byte-for-byte.
- [ ] **AC3 (A7):** Claude dir present, `CLAUDE.md` has content but no sentinel
      line → envelope.
- [ ] **AC4 (A8):** Claude dir present, `CLAUDE.md` absent → envelope.
- [ ] **AC5 (A9):** Claude dir present, `CLAUDE.md` holds **two** correct blocks →
      envelope.
- [ ] **AC6 (A10):** Claude dir present, `CLAUDE.md` is a correct block padded past
      4 MiB → envelope.
- [ ] **AC7 (A4):** no harness directory exists → envelope (this is the state every
      existing `hooks-fail-open.test.js` case runs in).
- [ ] **AC8 (A5, dual):** Claude **and** Codex dirs present, both files carrying
      `buildBlock(digest)` → empty stdout.
- [ ] **AC9 (A6, dual):** Claude fresh, Codex stale → envelope.
- [ ] **AC10 (A11):** Claude and Codex both fresh, plus an `AGENTS.override.md` →
      envelope.
- [ ] **AC11 (B4/B6):** with `CLAUDE_CONFIG_DIR` (and separately `CODEX_HOME`)
      pointed at a non-default directory holding the fresh block, and no
      `~/.claude` / `~/.codex` under `HOME` → empty stdout. Proves the override is
      honoured the way `paths.js` honours it.
- [ ] **AC12 (A1/A2/A3, regression):** `tests/integration/hooks-fail-open.test.js`
      passes **byte-unchanged**, all 22 tests.
- [ ] **AC13 (B10, parity — the anti-drift gate):** for each digest in a fixture
      list — plain, one with trailing blank lines, one containing a full-line
      `<!-- wienerdog:begin -->`, one containing a full-line
      `<!-- wienerdog:end -->`, one with CRLF line endings, one with non-ASCII
      text — writing `require('../../src/adapters/shared').buildBlock(digest)` into
      `CLAUDE.md` makes the hook emit **nothing**. A single loop; the expected
      block must come from the real `buildBlock`, never from a literal.
- [ ] **AC14 (integration parity):** a case that builds `CLAUDE.md` by calling the
      real `shared.applyManagedBlock(mdPath, digest, false, null, out)` on a file
      that already had user content (the *append* path, which adds separators
      around the block) → empty stdout. Proves the extraction offsets agree with
      the writer, not just with `buildBlock` in isolation.
- [ ] Every case asserts `status === 0`.

## Verification steps (run these; paste output in the PR)

```bash
# 1. The new dedup suite and the untouched fail-open suite.
node --test tests/integration/session-start-dedup.test.js
node --test tests/integration/hooks-fail-open.test.js   # 22/22, file unmodified
git diff --stat -- tests/integration/hooks-fail-open.test.js   # expect: no output

# 2. The node -e payload contains no single-quote character (it is one
#    single-quoted bash argument; one apostrophe inside would end it early).
node -e 'const fs=require("fs");
const Q=String.fromCharCode(39);
const lines=fs.readFileSync("templates/hooks/session-start.sh","utf8").split("\n");
const start=lines.findIndex((l)=>l==="node -e "+Q);
const end=lines.findIndex((l,i)=>i>start && l.startsWith(Q+" \"$DIGEST\""));
if(start<0||end<0){console.error("payload delimiters not found");process.exit(1);}
const payload=lines.slice(start+1,end);
const bad=payload.filter((l)=>l.includes(Q));
console.log("payload lines:",payload.length,"| lines with a single quote:",bad.length);
if(bad.length){console.error(bad.join("\n"));process.exit(1);}'

# 3. The fail-open structure is intact.
grep -nE '^[[:space:]]*set -e' templates/hooks/session-start.sh   # expect: no output
grep -n "WIENERDOG_JOB" templates/hooks/session-start.sh
grep -c "exit 0" templates/hooks/session-start.sh          # expect >= 4
grep -n "|| true" templates/hooks/session-start.sh

# 4. The architecture doc no longer claims "no computation" about the hook.
grep -n "no computation over the vault" docs/ARCHITECTURE.md
grep -c "the SessionStart hook only cats it" docs/ARCHITECTURE.md   # expect 0

# 5. Time budget (<200ms, ADR-0004): 5 runs against a 32 KB digest whose block
#    matches — the slowest path, since it reads and compares both files.
node -e 'const fs=require("fs"),os=require("os"),path=require("path");
const {execFileSync}=require("child_process");
const {buildBlock}=require("./src/adapters/shared");
const core=fs.mkdtempSync(path.join(os.tmpdir(),"wd-perf-"));
fs.mkdirSync(path.join(core,"state"));
const d="# Digest\n\n"+"x".repeat(32*1024)+"\n";
fs.writeFileSync(path.join(core,"state","digest.md"),d);
const c=path.join(core,".claude"); fs.mkdirSync(c);
fs.writeFileSync(path.join(c,"CLAUDE.md"),buildBlock(d)+"\n");
const env={PATH:process.env.PATH,HOME:core,WIENERDOG_HOME:core};
const t0=Date.now();
for(let i=0;i<5;i++){
  const out=execFileSync("/bin/bash",["templates/hooks/session-start.sh"],{env,encoding:"utf8"});
  if(out!==""){console.error("expected silence, got output");process.exit(1);}
}
const avg=(Date.now()-t0)/5;
console.log("avg ms per run:",avg); if(avg>=200) process.exit(1);'

# 6. Full suite and lint.
npm test
npm run lint
```

## Residuals — owner-dispositioned, 2026-08-30

Two Codex design-gate findings against this package were dispositioned by the
owner as **accepted residuals** rather than fixes (full record: the PR #50
closing comment). They are recorded here because a residual that lives only in a
PR comment is a residual nobody can find later.

**R1 — TOCTOU: the digest is rewritten while the hook is mid-flight. PARKED; no
freshness claim is made or implied.** The hook reads `digest.md`, then reads the
harness block, then compares. A dream run that rewrites `digest.md` between those
reads makes the comparison one against bytes that are already superseded, and the
hook can go silent on a digest that is no longer current.

This is parked under the runbook's explicit **park sub-case**
(`docs/runbooks/codex-review.md`, "Diff size does not measure contract impact"):
*a finding whose only honest fix re-imports a property the package was
deliberately re-cut to exclude is a contract change, and a contract change is the
owner's act.* Every honest fix here — a two-pass stability check, a lock, a
re-read-and-compare — is a **freshness mechanism**, and this package makes no
freshness claim: the hook decides only whether the block already carries *some*
version of the digest. The bound on the damage is what makes the park defensible:
digest writes are atomic (`writeFilePrivate`), so no torn read is possible, and
the worst case is that one session carries the block's bytes instead of bytes
written seconds earlier — **exactly the one-session staleness window that existed
before this WP and that `wienerdog sync` closes**. Nothing new is introduced.

**R2 — invalid UTF-8 folds to the same replacement character, so two
byte-different files can compare equal. RESIDUAL; no information is lost.** Both
sides of the comparison are read with `readFileSync(…, "utf8")`, which maps every
invalid byte sequence to U+FFFD. Two files that differ only in invalid bytes
therefore decode identically and the hook goes silent.

Accepted because **the counterfactual delivers nothing**: had the hook injected,
it would have injected `additionalContext: text` — the same `readFileSync(…,
"utf8")` string, with the same U+FFFD folding. The session would receive a
byte-for-byte identical decoded payload to the one the block already carries. The
silence loses no information the injection would have supplied. (A digest
containing invalid UTF-8 is itself an anomaly — `renderDigest` emits none — and
would be a defect in the writer, not in this comparison.)

## Out of scope (do NOT do these)

- **Any warning, notice or log line on mismatch.** Explicitly rejected: a
  mismatch persists for days, so it would fire every session. Drift reporting is
  `WP-doctor-digest-block-drift`.
- Splitting the hook per harness, adding an argv flag, or changing anything in
  `src/adapters/claude.js`, `src/adapters/codex.js`, `src/adapters/shared.js`,
  `src/cli/doctor.js`, the manifest, or `WD_HOOK_PAIRS`.
- Changing the managed block's content or `buildBlock`'s transformation.
- Changing `DigestCaps` — that is `WP-digest-line-cap-raise`.
- Touching `templates/hooks/session-end.sh` or
  `templates/hooks/codex-session-end.sh`.
- Anything owned by the (now `Done`) `quarantine-surface` epic. **No open WP and
  no open PR touches any file in this WP's Deliverables table** — checked
  2026-08-30 on `main` = `0410e3a` across every `docs/specs/*.md` Deliverables
  table for `templates/hooks/session-start.sh`, `docs/ARCHITECTURE.md` and
  `tests/integration/hooks-fail-open.test.js`: zero hits, and the one open PR
  (#42, dream-promote-report) touches `dream.js` / promote / validate only. This
  WP is collision-free on its own files; its only coupling is the dependency
  above.
- Adding a `doctor` check for `AGENTS.override.md`. This hook checks it because it
  must decide *delivery*; `doctor` reports *byte match*, and the Codex adapter
  already emits an override notice on every sync — a second, independently-worded
  copy would be an unregistered mirror (ADR-0031).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(hooks): inject the digest only when the block lacks it (WP-session-start-digest-dedup)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR. **This is not a
   Deliverables-boundary violation and needs no table row** — `scripts/boundary-check.js`
   allows the spec file by path, with or without one (proven: it exits 0 on a diff
   containing only the spec plus a listed file). If a boundary rule anywhere seems to
   forbid it, that rule is the stale one.
