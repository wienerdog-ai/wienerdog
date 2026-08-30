---
id: WP-hook-doctor-inspection-read-hardening
title: Type-guard and bound every inspection read, and make presence-doubt inject
status: Draft
model: opus
size: M
depends_on: [WP-session-start-digest-dedup]
adrs: [ADR-0004, ADR-0031, ADR-0039]
epic: digest-delivery
---

# WP-hook-doctor-inspection-read-hardening: type-guarded, bounded inspection reads, and presence-doubt injects

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the template
  gives the skeleton, the runbook the rules. Read both.

> **Two forward references, stated so a review does not have to discover them.**
> This spec cites `docs/specs/done/WP-session-start-digest-dedup.md` twice — for
> the accepted residuals and for the canonical-extraction trigger AC13
> discharges. On `main` at drafting time (`152ae3a`) that spec is
> `docs/specs/WP-session-start-digest-dedup.md` with `status: In-Review`; its
> archival to `done/` is **PR #53**, which also writes the trigger this WP
> inherits. **PR #53 lands first** — that is what `depends_on` records, and both
> citations resolve at that moment. Re-run this spec's Current-state claims at
> dispatch time regardless (`docs/runbooks/codex-review.md`); they were measured
> on `152ae3a` and the two surfaces they describe are not touched by #53.

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
  comparison as an `[ok]`/`[warn]` line and never mutates.

Both were shipped assuming the paths they read are ordinary regular files of
ordinary size. Neither assumption is enforced, and both are attacker-free
accidents a normal user can create: a stray `mkfifo`, a symlink to a device, a
CLAUDE.md that grew, a directory whose parent lost its search bit.

**Two invariants govern the fix, and they point the same way.** The hook's is
**fail-open** (ADR-0039): *any* doubt injects, because a wrong silence costs the
user a whole session of context while a wrong injection costs tokens. Doctor's is
**read-only and responsive** (WP-070): it reports, `sync` fixes, and it must
never hang an attended terminal. In both cases the correct answer to "I cannot
safely determine this" is to say so — inject, or warn — never to resolve doubt
into a confident silence or a confident `[ok]`.

## Current state

Measured on `main` = `152ae3a` (2026-08-30), by reproducing each defect. The
findings originate in the PR #50 Codex design gate (F1, F2), wd-reviewer finding
5 on the same PR, and the retro Codex gate on the merged PR #48 (two findings) —
all dispositioned **fix** by the owner and routed here; the measurements below
are this spec's own, not the gates' restated.

`digestBlockChecks` (`src/cli/doctor.js:371`… — the function added by
`WP-doctor-digest-block-drift`) reads each target with a bare
`fs.readFileSync(file, 'utf8')` inside a `try`, and treats any throw as "no
block". The hook (`templates/hooks/session-start.sh`) resolves harness presence
with `fs.statSync(dir).isDirectory()` inside a `try` returning `false`, checks
the Codex shadow file with `fs.existsSync`, and guards size with
`fs.statSync(file).size > MAX_TARGET_BYTES` (4 MiB, `session-start.sh:38`)
**before** a `readFileSync` — a size guard, not a type guard.

**D1 — doctor hangs forever on a FIFO.** With `CLAUDE.md` replaced by a FIFO
with no writer, `wienerdog doctor` printed its harness line and then blocked in
`open(2)`; still alive at 15 s, killed. There is no timeout on this path: it is
an attended CLI, so the user's terminal is simply gone.

**D2 — the hook blocks on the same FIFO.** Same fixture: the hook produced no
output and was still alive at 12 s. In production it is bounded only by the
`timeout: 10` the adapters register with the harness — a 10-second stall on
every new session, and the injection never happens.

**D3 — doctor's unbounded read amplifies file size ~6.5× in RSS.** A 64 MiB
line-rich `CLAUDE.md` (838,861 lines, block intact): `doctor` peaked at
**418 MB** maximum resident set size versus **61 MB** on the same install with a
normal-size file — **+357 MB**, and it reported `[ok]` in 0.17 s, so nothing
warns the user. `readFileSync` materialises the whole file, and
`locateManagedBlock` then `split('\n')`s it into an array of every line. (The
retro gate reported 2.1 GB on a 64 MiB file; the amplification factor depends on
the content's line and codepoint profile — a multi-byte file doubles the string
representation. Both measurements say the same thing: the read is unbounded and
the peak is a multiple of the file.)

**D4 — a `statSync` error on a harness directory reads as "harness absent",
which can turn into a wrong silence.** With Claude's config dir made
un-`stat`-able (parent `chmod 000`, `statSync` → `EACCES`), the hook's `isDir()`
returns `false` and that harness drops out of the conjunction. Single-harness,
this is benign — zero present harnesses means the hook injects. **Dual-harness,
it is a real wrong silence**, and that is the case that matters: with a *fresh*
Codex block and a Claude directory that errors, the control run (both readable,
Claude carrying no block) **injected 92 bytes**, and the identical run with
Claude's parent locked emitted **nothing**. Codex alone decided; the Claude block
was never examined. Absence and inability-to-tell were collapsed into one answer,
and the collapse resolved toward silence — the opposite of the fail-open rule.

**D5 — a dangling `AGENTS.override.md` symlink is not seen as shadowing.** The
hook checks the Codex shadow file with `fs.existsSync`, which follows symlinks:
on a symlink pointing at a non-existent target, `existsSync` returns `false`
while `lstatSync` reports a symlink. Measured: with such a link in place the hook
emitted **nothing**. Whether Codex itself honours a dangling override is not the
question the hook is answering — it is answering *"am I certain the block is
delivered?"*, and a link it cannot resolve is not certainty.

**What is deliberately NOT in this WP's problem statement.** The two residuals
the owner accepted on PR #50 — TOCTOU on a mid-hook digest rewrite (parked; every
honest fix is a freshness mechanism and the package makes no freshness claim) and
invalid-UTF-8 replacement folding (injection would deliver the identical decoded
string) — stay accepted. Nothing here reopens them; see
`docs/specs/done/WP-session-start-digest-dedup.md`, "Residuals".

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (you flip its `status:` — Definition of done item 4), package-lock.json,
     memory/lessons/inbox.md, and docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | templates/hooks/session-start.sh | re-issue the `node -e` payload per **Table A** and **Table C**; the bash scaffold's fail-open structure is unchanged |
| modify | src/cli/doctor.js | `digestBlockChecks` only — bounded, type-guarded reader per **Tables B and C**. No other check, no reordering |
| modify | tests/integration/session-start-dedup.test.js | cover the hook rows of Tables A and C |
| modify | tests/unit/doctor.test.js | cover the doctor rows of Tables B and C (append; never rewrite an existing case) |

**Not deliverables, and each for a reason.**
`tests/integration/hooks-fail-open.test.js` must keep passing **byte-unchanged** —
it is the independent witness that this WP did not weaken fail-open, and a
witness you may edit is not one. `src/adapters/shared.js` is untouched: this WP
changes no block semantics. No new `src/` module is created — see the helper
trade-off in Implementation notes.

### Exact contracts

Two functions change behaviour. Neither changes signature.

```js
/** src/cli/doctor.js — unchanged signature, hardened reads (Tables B and C).
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{claude:{present:boolean}, codex:{present:boolean}}} harnesses
 *  @returns {{status:'ok'|'warn', msg:string}[]}  never throws, never mutates,
 *    never blocks on a non-regular file, never resident-loads more than the
 *    Table C ceiling per target */
function digestBlockChecks(paths, harnesses)
```

The hook's `node -e` payload keeps its single-argument contract (`argv[1]` = the
digest path), its outer/inner `try/catch` shape, its single
`process.stdout.write`, and its no-apostrophe constraint (it is one
single-quoted bash argument). Only the guards change.

**Message strings.** Doctor's four existing strings are unchanged. Exactly one
new string is introduced, for Table B row B5; its wording is decided in Table B
and nowhere else.

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** a doubt/absence taxonomy is introduced
where one boolean stood; **(iv)** error, fallback and precedence behaviour is the
entire substance; **(vi)** two independent surfaces inherit one contract;
**(vii)** the same facts are mirrored across two implementations, two test files
and their acceptance criteria.

Tables A and B are declarative fact tables — observed state → required outcome.
Table C is a shared-constants table. None carries a `mechanism`, `seam` or
`how to produce it` column, so ADR-0036's cell schema does not apply; **how**
each state is produced is the implementer's design, per
`docs/runbooks/spec-authoring.md`.

### Table A — canonical: the hook's presence and read decisions

Replaces the corresponding rows of `WP-session-start-digest-dedup`'s Table A;
every row of that table not named here is unchanged and still governs.

| id | observed state | hook must |
|----|----------------|-----------|
| A-H1 | `stat` of a harness config dir succeeds and it is a directory | treat that harness as **present** (unchanged) |
| A-H2 | `stat` of a harness config dir fails with a **clean `ENOENT`** | treat that harness as **absent** — the only absence that counts |
| A-H3 | `stat` of a harness config dir fails with **anything else** (`EACCES`, `ELOOP`, `ENOTDIR`, `EIO`, …) | treat as **doubt** → **inject**. Never "absent" |
| A-H4 | a harness config path exists but is **not** a directory | treat as **doubt** → **inject** |
| A-H5 | a target file is not a **regular file** — FIFO, socket, device, directory, or a symlink resolving to any of these | **doubt** → **inject**, without opening it for read |
| A-H6 | a target file cannot be type-checked at all (the type probe itself errors, other than a clean `ENOENT`) | **doubt** → **inject** |
| A-H7 | a target file is a regular file larger than the Table C ceiling | **inject** (unchanged in outcome; the existing size guard) |
| A-H8 | `$CODEX_HOME/AGENTS.override.md` is present **as a path entry** — regular file, directory, or symlink of any kind including one whose target does not exist | treat Codex's block as **not delivered** → **inject** |
| A-H9 | zero harnesses are present after A-H1…A-H4 are applied | **inject** (unchanged) |

**The rule the rows share, stated once:** the hook distinguishes three answers —
*present*, *cleanly absent*, and *cannot tell* — where it previously had two, and
**only a clean `ENOENT` is absence**. Every "cannot tell" is a member of the
conjunction that forces injection, exactly as a stale block is.

### Table B — canonical: doctor's inspection reads

| id | observed state | doctor must emit |
|----|----------------|------------------|
| B1 | target is a regular file at or under the ceiling | the existing `[ok]`/`[warn]` comparison lines, unchanged |
| B2 | target is not a regular file (FIFO, socket, device, directory, symlink to any of these) | one `[warn]`, **without opening it for read** |
| B3 | the type probe itself fails other than a clean `ENOENT` | one `[warn]` |
| B4 | target is cleanly absent (`ENOENT`) | the existing `no Wienerdog block in <file>` warn, unchanged |
| B5 | target is a regular file **larger than the ceiling** | one **actionable** `[warn]` naming the file, the ceiling, and what to do — the single new string this WP introduces. It must be distinguishable from B2/B3 and from "out of date": the file is fine, it is *too large to inspect* |
| B6 | any of B2, B3, B5 | `process.exitCode` is **not** set — no state here is a `fail`, matching every other row this function emits |
| B7 | every state above | resident memory attributable to this check stays bounded by the Table C ceiling **per target**, and the whole file is never materialised |
| B8 | every state above | the check returns; it never blocks waiting for a writer, and `doctor` never mutates |

### Table C — canonical: the shared constants and their two homes

| id | fact | value | why it is here |
|----|------|-------|----------------|
| C1 | inspection ceiling for a harness markdown target | **4 MiB** (`4194304` bytes) | already the hook's `MAX_TARGET_BYTES`; doctor adopts the same number so the two surfaces cannot disagree about which files they will inspect |
| C2 | over-ceiling detection | read at most **ceiling + 1** bytes; getting `ceiling + 1` means over-ceiling | one bounded read answers both "does it fit" and "what does it contain"; a `stat`-then-read pair would be a second TOCTOU window for no gain |
| C3 | the constant's homes | the hook's inline `MAX_TARGET_BYTES`, and a named constant in `src/cli/doctor.js` | the hook cannot `require` (see Implementation notes), so the value is stated twice by necessity. **Both are mirrors of C1**, and a change to C1 changes both in one pass |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each names the tables it implements)
- [ ] Acceptance criteria — one per row of Tables A and B, plus C1's parity
- [ ] Verification commands / greps
- [ ] Current-state descriptions D1–D5 (each states the behaviour a row changes)
- [ ] The shipped hook's comment header, where it describes what counts as doubt — Table A's shared rule
- [ ] `digestBlockChecks`' JSDoc — Tables B and C
- [ ] The two constants named in Table C row C3
- [ ] **The fail-open structural contract**, inherited as this WP's job:
      `docs/specs/done/WP-session-start-digest-dedup.md` registered a dated
      canonical-extraction trigger naming five surfaces (the script header, that
      spec's notes, its verification greps, `hooks-fail-open.test.js`'s header,
      ADR-0004's Decision line) with no owner among them, and routed the
      extraction here because this is the first change with write access to
      three of them at once. **Land it: give the fail-open contract one canonical
      table in this spec, and make the script header and the re-issued
      verification greps cite it.** `hooks-fail-open.test.js` is not a
      deliverable, so its header stays a registered, uncorrected mirror — record
      that explicitly rather than quietly leaving it off the list.

## Implementation notes & constraints

- **One shared helper, or two local guards? Two, and the asymmetry is the
  point.** The hook is a single-quoted `node -e` payload with **zero imports by
  design** — it runs from `<core>/bin` and cannot rely on resolving the Wienerdog
  package across the npm, vendored and tarball install shapes; that
  self-containment is what makes "any throw ⇒ inject" true by construction. A
  shared `src/` helper could therefore serve **only** doctor, which means the
  choice is not "one helper vs two" but "one helper plus one inline guard, vs two
  inline guards". A single-consumer module in `src/` buys nothing here and adds a
  file, so: **doctor keeps its guard local to `digestBlockChecks`, the hook keeps
  its guard inline, and Table C is the single place their shared numbers are
  decided.** If a third consumer appears, extract then — the extraction is
  mechanical once two callers exist, and speculative now.
- **The duplication is bounded in the safe direction, and that is why it is
  tolerable.** Any divergence between the hook's guard and doctor's yields a
  *mismatch* in the hook, and a mismatch injects. The dangerous direction — the
  hook becoming more permissive than doctor — cannot arise from drift alone,
  only from editing the hook.
- **Do not weaken the hook's structure.** No `set -e`, `exit 0` at the end,
  `|| true` after the `node -e`, the single `process.stdout.write`, the outer and
  inner `try/catch`, and the `WIENERDOG_JOB` guard first. The payload stays free
  of `'` characters.
- **Do not add a timeout, a retry, or a signal handler.** The fix for a blocking
  read is to *not open* the thing — type-check first. A timeout would be a
  process that outlives its decision, and it would still have opened the FIFO.
- **`doctor` never mutates (WP-070)** and never sets `fail` from this check.
- **The `<200ms` hook budget (ADR-0004) still binds.** Type probes are `lstat`
  calls; they cost nothing measurable. Measure and report anyway.
- Plain Node ≥ 18, zero new dependencies, JSDoc types, no build step.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] Every path this WP opens is **type-checked before it is opened for read**,
      so a FIFO, socket or device on a Wienerdog-inspected path cannot block, and
      a symlink cannot redirect an inspection read to a target of a different
      type. Symlink resolution is deliberate per row: **A-H5/B2 judge the
      resolved type** (a symlink to a regular file is fine), while **A-H8 judges
      the link itself** (`lstat`), because a shadow file's mere presence is the
      signal.
- [ ] Every read is **bounded** by the Table C ceiling, so no inspected path can
      drive Wienerdog's memory by growing.
- [ ] No untrusted identifier flows into a filesystem path or a shell command:
      paths come from `paths.js`/env install configuration, and the new `[warn]`
      interpolates only a path Wienerdog itself composed plus a code-owned
      numeric ceiling. Nothing read is executed.
- [ ] Failure direction is stated per row and is never "assume fine": the hook
      injects, doctor warns.

## Acceptance criteria

Every criterion names the Table row it discharges. Cases, fixtures and test
structure are the implementer's design (`docs/runbooks/spec-authoring.md`);
these say what must be true.

- [ ] **AC1 (A-H2, A-H3, A-H4):** the hook injects whenever a harness directory's
      `stat` fails with anything other than a clean `ENOENT`, and treats only
      `ENOENT` as absence. **Including the dual-harness case that is a real wrong
      silence today** — one harness fresh, the other's directory erroring must
      inject, where `152ae3a` is silent.
- [ ] **AC2 (A-H5, A-H6):** the hook injects for a non-regular target — at
      minimum a FIFO with no writer — **and returns promptly**, proving it never
      opened it. Today's behaviour on that fixture is a block of at least 12 s.
- [ ] **AC3 (A-H8):** the hook injects when `AGENTS.override.md` is present as a
      **dangling symlink**, where `152ae3a` is silent.
- [ ] **AC4 (A-H1, A-H7, A-H9):** the unchanged rows stay unchanged — a fresh
      block still silences, an over-ceiling target still injects, zero harnesses
      still inject.
- [ ] **AC5 (B2, B8):** `doctor` emits a `[warn]` and **exits** on a non-regular
      target, at minimum a FIFO with no writer. Today it hangs indefinitely
      (measured: alive at 15 s, killed).
- [ ] **AC6 (B5):** `doctor` emits its new actionable `[warn]` on an
      over-ceiling regular file, naming the file and the ceiling, and does not
      claim the block is `[ok]` or out of date.
- [ ] **AC7 (B7):** on a target at least 64 MiB, `doctor`'s peak RSS stays within
      a small constant of its normal-file baseline. **Baseline to beat, measured
      on `152ae3a`: 418 MB peak against a 61 MB baseline on a 64 MiB file.** The
      criterion is the *shape* — bounded, not proportional to file size — and the
      PR states the number it achieved.
- [ ] **AC8 (B3, B4, B6):** a probe failure warns, a clean `ENOENT` keeps its
      existing wording, and none of the new states sets a non-zero exit code.
- [ ] **AC9 (B1):** every pre-existing `digestBlockChecks` behaviour and message
      string is unchanged, and `tests/unit/doctor.test.js`'s existing cases pass
      untouched.
- [ ] **AC10 (regression witness):** `tests/integration/hooks-fail-open.test.js`
      passes **byte-unchanged**.
- [ ] **AC11 (C1):** both homes of the ceiling carry the same number, and a grep
      proves it.
- [ ] **AC12 (ADR-0004 budget):** the hook's measured time on a normal digest and
      a matching block stays well under 200 ms; the PR states the number.
- [ ] **AC13 (canonical extraction):** the fail-open structural contract has one
      canonical table in this spec, the shipped script header and the
      verification greps cite it instead of restating it, and
      `hooks-fail-open.test.js`'s header is recorded as a known uncorrected
      mirror (it is not a deliverable).
- [ ] Every new verification step is observed **on both sides** — green on the
      fixed state, red on a deliberately broken one, and red on the
      deliverable-absent case where a negated grep is used
      (`docs/runbooks/spec-authoring.md`). Paste all outputs.

## Verification steps (run these; paste output in the PR)

```bash
# Suites. hooks-fail-open must be untouched as well as passing.
node --test tests/integration/hooks-fail-open.test.js
git diff --stat -- tests/integration/hooks-fail-open.test.js   # expect: no output
node --test tests/integration/session-start-dedup.test.js
node --test tests/unit/doctor.test.js
npm test
npm run lint

# The hook payload is still one single-quoted bash argument (no `'` inside it).
node -e 'const fs=require("fs");const Q=String.fromCharCode(39);
const lines=fs.readFileSync("templates/hooks/session-start.sh","utf8").split("\n");
const a=lines.findIndex((l)=>l==="node -e "+Q);
const b=lines.findIndex((l,i)=>i>a && l.startsWith(Q+" \"$DIGEST\""));
if(a<0||b<0){console.error("payload delimiters not found");process.exit(1);}
const bad=lines.slice(a+1,b).filter((l)=>l.includes(Q));
console.log("payload lines with a single quote:",bad.length);
if(bad.length){console.error(bad.join("\n"));process.exit(1);}'

# Fail-open structure intact (anchored — the unanchored form matches the header
# comment and can never go red; that was this family's erratum on PR #50).
grep -nE '^[[:space:]]*set -e' templates/hooks/session-start.sh   # expect: no output
grep -n "WIENERDOG_JOB" templates/hooks/session-start.sh
grep -n "|| true" templates/hooks/session-start.sh

# Table C row C1 — one number, both homes.
grep -n "4194304" templates/hooks/session-start.sh src/cli/doctor.js

# doctor still never mutates.
grep -n "writeFileSync\|mkdirSync\|chmodSync\|rmSync\|unlinkSync" src/cli/doctor.js   # expect: no output

# The landed quarantine WP's DOCTOR DISCIPLINE gate, verbatim from
# docs/specs/done/WP-doctor-quarantine-counts.md, must still print OK.
```

Two measurements must be taken by hand and pasted, because no unit test asserts
them: **doctor's peak RSS** on a ≥64 MiB target (`/usr/bin/time -l` on macOS,
`/usr/bin/time -v` on Linux) against its normal-file baseline, and **the hook's
elapsed time** on a normal digest with a matching block. State both numbers and
the baseline you compared against.

## Out of scope (do NOT do these)

- The two accepted residuals: TOCTOU on a mid-hook digest rewrite, and
  invalid-UTF-8 replacement folding. Both are owner-dispositioned; reopening
  either is a contract change and the owner's act.
- Any change to block semantics, `buildBlock`, `locateManagedBlock`,
  `applyManagedBlock`, or `src/adapters/shared.js`.
- Any other `doctor` check, and any reordering of `doctor`'s output groups.
- Timeouts, retries, signal handlers, or async rewrites of either surface.
- Editing `tests/integration/hooks-fail-open.test.js` — it is this WP's
  independent witness.
- Amending ADR-0004. Its Amendment 1 is written and awaits the owner's
  signature; that is not an implementer's act.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including both hand-taken measurements and the both-sides observation of
   every new check.
2. Conventional commits; PR titled
   `fix(hooks,doctor): type-guard and bound inspection reads (WP-hook-doctor-inspection-read-hardening)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR. This is not a
   Deliverables-boundary violation and needs no table row —
   `scripts/boundary-check.js` allows the spec file by path.
