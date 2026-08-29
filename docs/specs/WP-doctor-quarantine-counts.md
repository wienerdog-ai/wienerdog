---
id: WP-doctor-quarantine-counts
title: Make `wienerdog doctor` report quarantine counts by reason, and point at the one file that lists them
status: Draft
model: sonnet
size: S
depends_on: [WP-quarantine-warnings-file]
adrs: [ADR-0004, ADR-0023]
epic: quarantine-surface
---

# WP-doctor-quarantine-counts: `doctor` counts, and points at the enumeration's one home

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing here starts a process, writes
state, or phones anywhere: this work package adds read-only output to one
existing command.

The nightly **dreaming** job reads the user's **transcripts** (Claude Code JSONL
under `~/.claude/projects/`, Codex CLI rollout files under `~/.codex/sessions/`).
ADR-0023 bounded that intake and replaced the old scalar watermark with a
**per-file quarantine ledger** at `<core>/state/transcript-ledger.json` (0600).
A transcript that cannot be consumed *as-is* gets a `quarantined` record with a
code-owned reason, and the dream carries on over everything else. A quarantine is
a **fail-safe skip, never a deletion** — the transcript file on disk is untouched;
only Wienerdog's decision to read it changes.

ADR-0023's "Alternatives considered" rejected `wienerdog doctor` as the *sole*
channel for surfacing quarantines and left one sentence open: "`doctor` may
additionally surface it (a deferred follow-up)." **That follow-up never landed.**
The consequence, measured on the maintainer's 0.13.0 install on 2026-08-29: 191
historical Codex sessions were legitimately quarantined `over-ceiling`, and the
only place that list existed was a 16.8 KB single-line banner inside the injected
session digest — 73% of a 22,986-byte digest, crowding out the payload.

**ADR-0023 Amendment 2 (2026-08-29)** lands the follow-up under a principle that
governs this whole family: **the full enumeration has exactly ONE home, the vault
warnings file `reports/warnings.md`. Every other surface — this one, the digest
banner, the dream report — carries exact counts and a pointer, and never a list.**
The owner ratified that explicitly against a first draft of this very package that
had `doctor` printing all 191 names: *"I don't see 191 lines being useful to the
user; they can open the file the pointer names anytime."* A second enumeration is
not a second safety net — it is a second thing to keep in sync, in a surface with
no durability to offer over the first.

So this package gives `doctor` the shape `doctor` is good at: a per-reason count
the user can scan in one screen, and one line saying where the names are.
`reports/warnings.md` (built by `WP-quarantine-warnings-file`, this package's
prerequisite) is that "where".

**Counts come from the ledger, never from the warnings file.** The ledger is
ground truth; the warnings file is derived from it and can legitimately lag by one
dream run. `doctor` reading the derived file for its numbers would report the lag
as fact.

**And `doctor` must never point at a file that is not there without saying so** —
the same rule this repo already follows in `src/core/dream/ledger.js`'s comment on
the `secret-revert-exhausted` banner sentence, which deliberately names no command
because none exists. Hence Table B's missing-file branch.

`doctor` is diagnostic and **never mutates** — the file states this invariant at
`src/cli/doctor.js:60-61`, `:367-368` and `:406`, and this package must hold it:
it reads the ledger and checks one path's existence, and writes nothing.

## Current state

`src/cli/doctor.js` (438 lines), entry `async function run(_argv)` at `:311`.
Its output grammar is one closure at `:315-319`:

```js
  /** @param {'ok'|'warn'|'fail'} status @param {string} msg */
  const check = (status, msg) => {
    console.log(`[${status}] ${msg}`);
    if (status === 'fail') failed = true;
  };
```

Every line is `[<status>] <message>`; there are **no headings, no blank lines and
no indented lines**. `[fail]` sets `failed`, which becomes `process.exitCode = 1`
at `:435`. One existing line does not go through `check`: the cache-only update
notice at `:432`, printed with a bare `console.log` as `[info] …`, deliberately
outside the pass/fail accounting. **`[info]` is therefore an existing doctor
shape, not something this package invents.**

`run` is a flat sequence of twelve groups. Eight are inline; four use the
helper-loop idiom (scheduler `:408`, skill links `:414`/`:417`, stale hooks `:423`,
Google readiness `:427`), e.g. `:407-408`:

```js
  const { doctorSchedulerChecks } = require('../scheduler/status');
  for (const c of doctorSchedulerChecks(paths)) check(c.status, c.msg);
```

Helpers of that shape return `Array<{status:'ok'|'warn', msg:string}>`:
`skillLinkChecks(paths, harnessSkillsDir, label)` (`:67`),
`staleHookChecks(paths, harnesses)` (`:185`), `googleReadinessChecks(paths)`
(`:237`).

Group order today: core dir (`:321`), manifest (`:325`), config.yaml (`:337`),
vault (`:344`), secrets dir (`:354`), private modes (`:366`), harness detection
(`:393`), scheduler (`:401`), skill links (`:410`), stale hooks (`:420`),
**Google readiness (`:425-427`)**, `[info]` update notice (`:429-433`).

Two values `run` already holds are the only inputs this package needs:
`paths` from `getPaths()` (`:312`; its `state` field is the core state dir), and
`const vaultPath = readVaultPath(paths.config);` at `:345`, **which is `null` on a
just-installed machine with no vault yet**.

The ledger module `src/core/dream/ledger.js` already exports everything needed —
`doctor.js` requires nothing from it today:

```js
function readLedger(stateDir)          // :82  → Ledger; missing/corrupt → empty ledger; NEVER throws
function activeQuarantines(ledger)     // :328 → Array<{file:string, reason:string, harness:string}>
const SECRET_REVERT_EXHAUSTED_REASON   // :21  = 'secret-revert-exhausted'
```

A ledger record is `{fingerprint, outcome, reason?, deferrals?, updated_at,
harness}` (typedef at `:58-66`).

`WP-quarantine-warnings-file` (this package's prerequisite) created
`src/core/dream/warnings.js` and **exports from it the vault-relative path
constant** for `reports/warnings.md`. Import that constant; do not retype the
literal — it is the one place that path is decided, and this is the second module
to consume it.

`tests/unit/doctor.test.js` has 37 tests, all named `doctor …`; each spawns the
real binary with `execFileSync(process.execPath, [bin, ...args], {env})` (`:45`)
under an isolated temp `HOME`/`WIENERDOG_HOME` (`tempEnv()`, `:14`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/doctor.js | add `quarantineReport(stateDir, vaultPath)` per **Tables A and B**, and one loop in `run` at the position **Table C** names. No other group is reordered or reworded |
| modify | tests/unit/doctor.test.js | cover the acceptance criteria below (the implementer designs the cases) |

**Nothing else.** In particular `src/core/dream/ledger.js` is **not** modified:
this package reads the ledger and adds nothing to it. The size reader that an
earlier draft of this spec added there belongs to — and ships with —
`WP-quarantine-warnings-file`, which is the only surface that renders sizes.

If a further file appears necessary, that is a finding, not a fix: record it under
"Discovered issues" in the PR body.

### Exact contracts

```js
/** Read-only. Never throws, never writes, never migrates.
 *  @param {string} stateDir   the core state dir (getPaths().state)
 *  @param {string|null} vaultPath  readVaultPath(paths.config) — null when no
 *    vault is configured yet, which Table B treats as "the file is not there"
 *  @returns {Array<{status:'ok'|'warn'|'info', msg:string}>} */
function quarantineReport(stateDir, vaultPath)
```

and, in `run`, exactly this idiom at the position Table C names:

```js
  for (const c of quarantineReport(paths.state, vaultPath)) {
    if (c.status === 'info') console.log(`[info] ${c.msg}`);
    else check(c.status, c.msg);
  }
```

Worked example — a ledger holding 191 `over-ceiling` records and 1 `read-error`
record, on a vault where `reports/warnings.md` exists, prints exactly:

```text
[warn] 191 session transcript(s) are being skipped: the session file is bigger than Wienerdog will read
[warn] 1 session transcript(s) are being skipped: the session file could not be read
[info] which sessions, and why: reports/warnings.md in your vault
```

The same ledger where `reports/warnings.md` is missing prints exactly:

```text
[warn] 191 session transcript(s) are being skipped: the session file is bigger than Wienerdog will read
[warn] 1 session transcript(s) are being skipped: the session file could not be read
[warn] which sessions, and why: reports/warnings.md in your vault — that file is not there yet; the next dream run writes it
```

An empty or quarantine-free ledger prints exactly one line and no pointer:

```text
[ok] no session transcripts are being skipped
```

**No filename appears in any of these outputs, ever.** That is the point of the
package.

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** a result taxonomy is introduced — the
reason → user-facing count-line map; **(iv)** the pointer line has a
present/absent fallback branch; **(vii)** it is mirrored across the Deliverables
cells, the acceptance criteria and the verification gate. The **enum's** canonical
source is `src/core/dream/ledger.js` (the five `reason` values in the typedef at
`:58-66`); Table A maps that enum onto *this* surface's strings and is the single
place those strings are decided. `WP-quarantine-warnings-file` maps the same enum
onto *document heading* strings and owns its own table; the two surfaces render
deliberately different text, so there is no shared string set that can drift. The
one string that **is** shared — the vault-relative path — is an imported
constant, not a retyped literal (see Current state).

### Table A — the reason → count-line map

Groups are emitted in the row order below. A group with zero members is emitted
not at all. `N` is that group's member count, taken from the **ledger**.

| Reason (from `ledger.js`) | `status` | Message |
|---|---|---|
| `over-ceiling` | `warn` | `N session transcript(s) are being skipped: the session file is bigger than Wienerdog will read` |
| `too-many-lines` | `warn` | `N session transcript(s) are being skipped: the session file has too many lines to read` |
| `read-error` | `warn` | `N session transcript(s) are being skipped: the session file could not be read` |
| `secret-revert-exhausted` | `warn` | `N session transcript(s) are being skipped: the notes made from them were withheld by the secret check too many times in a row. The withheld copies are in state/quarantine/.` |
| anything else (incl. a missing or non-string `reason`) | `warn` | `N session transcript(s) are being skipped for a reason this version does not recognize` |
| — no `quarantined` record at all | `ok` | `no session transcripts are being skipped` (and **no** pointer line follows) |

| Fact / rule | Value |
|---|---|
| Which records are members | every entry of `ledger.files` that is a plain object with `outcome === 'quarantined'`. Nothing else — `processed` and `deferred` records are not quarantines |
| **Where the counts come from** | the ledger, always. **Never** from `reports/warnings.md`: the ledger is ground truth and the file is derived from it, so it can legitimately lag by one dream run, and reading it for numbers would report that lag as fact |
| **No name is ever printed** | no basename, no path, no `displayName` output, no session id. The enumeration has one home (ADR-0023 Amendment 2), and it is not this surface. `displayName` is therefore not used by this package at all |
| **No raw `reason` string is ever printed** | the unrecognized row prints a fixed message. `readLedger` deliberately does not validate individual records, so rendering a stored string would make output shape depend on stored data |
| Output grammar | every line is `[<status>] <message>`. **No indented lines, no headings, no blank lines** — the grammar is exactly what it was before this package |
| Exit code | unchanged. Every row is `ok`, `warn` or `info`; **no row is ever `fail`** — a quarantine is a correct fail-safe skip, not a broken install |
| Mutation | none. `quarantineReport` calls `readLedger` plus one existence check, and nothing from the ledger's write side; it never calls `writeLedger` or `migrateFromWatermarks`, so a pre-ledger install (watermarks only) correctly reports zero quarantines |
| Failure mode | `readLedger` never throws; a missing, empty or corrupt ledger yields the `ok` row |

### Table B — the pointer line

Emitted **once**, after the last group line, and **only when at least one group
line was emitted**.

| Condition | `status` | Message |
|---|---|---|
| `vaultPath` is a string **and** `<vaultPath>/reports/warnings.md` exists as a regular file | `info` | `which sessions, and why: reports/warnings.md in your vault` |
| any other case — the file is absent, is not a regular file, is unreadable, or `vaultPath` is `null` | `warn` | `which sessions, and why: reports/warnings.md in your vault — that file is not there yet; the next dream run writes it` |

| Fact / rule | Value |
|---|---|
| Why a branch at all | a pointer to a file that is not there is a broken promise, and `doctor` is the command whose whole job is to notice broken promises. The `warn` branch is honest and actionable: the condition really is resolved by the next dream run |
| **Why "the next dream run writes it" is literally true** | `WP-quarantine-warnings-file` (this package's prerequisite) carries a third refresh trigger, **write-if-absent**: a dream run that ends with at least one active quarantine in the ledger and no `reports/warnings.md` on disk writes the file, even when that run consumed nothing and the quarantine set did not change. Any dream run therefore heals the missing file — including the idle nights of an install whose quarantines are all pre-existing, which is exactly the shape this branch is written for. This row records the mechanism the promise rests on; **the message text above is unchanged by it, byte for byte** |
| Why `info` and not `ok` on the present branch | the pointer is information, not a passing check, and folding it into the pass/fail accounting would misreport. `[info]` is an **existing** doctor shape (`:432`), which is why this needs no grammar change |
| **Existence only — staleness is deliberately NOT checked** | it *is* cheaply decidable read-only (`WP-quarantine-warnings-file`'s Current-conditions block is time-invariant by contract, so `doctor` could re-render it from the ledger and compare). Rejected anyway: it would make `doctor` a second authority on that file's bytes, for a condition the next dream run heals on its own, and a **false** "stale" warning is worse than a missing one. A pointer to a slightly-old file is still a good pointer; a pointer to no file is not |
| Path source | the vault-relative constant exported by `src/core/dream/warnings.js`, joined under `vaultPath`. Not retyped |
| `vaultPath === null` | takes the `warn` branch, and does so without throwing. Unreachable in practice — a quarantine requires a dream run, which requires a vault — but the function is total |

### Table C — where the group goes in `doctor`'s output

| Fact / rule | Value |
|---|---|
| Position | immediately **after** the Google-readiness loop (`src/cli/doctor.js:425-427`) and **before** the `[info]` update notice (`:429-433`) |
| Why there | the update notice is deliberately last, and every group before it is a subsystem check; quarantines are dream-subsystem state, so they belong with the checks |
| What is not touched | no existing group is moved, reworded, or given a different status; `check`'s body and `failed`/`process.exitCode` handling are unchanged |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the `doctor.js` row cites Tables A, B and C; the
      "nothing else" note carries the size-reader relocation)
- [ ] Acceptance criteria that assert Tables A and B, and Table C's position
- [ ] Verification commands (the message gate asserts Tables A and B; the
      no-mutation and no-enumeration gates assert Table A)
- [ ] Current-state description (doctor's grammar, the pre-existing `[info]` line,
      `vaultPath` being nullable, the imported path constant)
- [ ] The three worked examples under "Exact contracts" (they are Tables A and B
      rendered)
- [ ] Implementation notes (counts-from-the-ledger, and the rejected staleness check)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **Do not enumerate, and do not add a flag that enumerates.** No `--verbose`, no
  `--quarantines`, no truncated "first 10". ADR-0023 Amendment 2 gives the
  enumeration one home; a second one is a second thing to keep in sync in a surface
  with no durability to offer over the first.
- **Do not read `reports/warnings.md`'s content.** This package checks that the
  path exists and stops there (Table B). Reading it for counts is the error Table A
  forbids; reading it for staleness is the check Table B rejects.
- Because no name is printed, `displayName` is not called and no sanitizer question
  arises on this surface at all — a strict simplification over the earlier draft.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no identifier from this
      package reaches a filesystem path or a shell command.** The only paths built
      are the ledger path (from `getPaths().state`, via the existing `readLedger`)
      and `<vaultPath>/reports/warnings.md` (from a code-owned exported constant).
      Nothing derived from a ledger key is opened, joined, or executed.
- [ ] The attacker-influenceable input here is a **transcript basename**, and after
      this package **it does not reach this surface at all** (Table A): the output is
      built from integers and fixed code-owned text. This is strictly stronger than
      sanitizing it would be.
- [ ] No stored `reason` string is rendered (Table A), so a forward-schema or
      corrupted record cannot change the shape of `doctor`'s output.
- [ ] Nothing here reads transcript **content**, and nothing reads the warnings
      file's content; the ledger holds paths, fingerprints and reason classes only.

## Acceptance criteria

- [ ] With no ledger file, an empty ledger, a corrupt (non-JSON) ledger, and a
      ledger holding only `processed`/`deferred` records, `doctor` prints exactly
      `[ok] no session transcripts are being skipped` for this group, prints **no**
      pointer line, and exits 0.
- [ ] With records in every reason class of Table A — including one with an
      unrecognized `reason`, one with a missing `reason`, and one whose `reason` is
      not a string — each group renders exactly its Table A message with the exact
      ledger count, groups appear in Table A's row order, and no group with zero
      members is printed.
- [ ] **No basename, path, session id or stored `reason` string appears anywhere in
      `doctor`'s output**, for any of those records — including a hostile basename
      (newline, `> [!warning]`, ANSI escape, `..`, a path separator), which must not
      reach the output in any form, sanitized or otherwise.
- [ ] The counts are taken from the ledger: with a `reports/warnings.md` that
      disagrees with the ledger (stale, hand-edited, or empty), the printed counts
      still match the ledger exactly.
- [ ] The pointer line renders exactly once, only when a group line was emitted, and
      takes Table B's `info` branch when the file exists and its `warn` branch when
      it is absent, is a directory, or `vaultPath` is `null` — none of which throws.
- [ ] Every emitted line matches the regular expression `^\[(ok|warn|info)\][ ]` —
      no indented line, no heading, no blank line is produced by this package.
- [ ] The group appears at Table C's position, and every pre-existing `doctor` line
      is byte-identical to before this change for a fixture with no quarantines.
- [ ] `doctor`'s exit code is unchanged in every case above; no quarantine and no
      missing warnings file makes it non-zero.
- [ ] Running `doctor` twice leaves `<core>/state/transcript-ledger.json`, the vault
      and every other file byte-identical (`doctor` never mutates), and in particular
      does not create `reports/warnings.md`.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "^doctor"
npm test
npm run lint
# Tables A + B gate — every user-facing message exists byte-exact in the shipped source.
node -e "const t=require('fs').readFileSync('src/cli/doctor.js','utf8');const need=['are being skipped: the session file is bigger than Wienerdog will read','are being skipped: the session file has too many lines to read','are being skipped: the session file could not be read','were withheld by the secret check too many times in a row','are being skipped for a reason this version does not recognize','no session transcripts are being skipped','which sessions, and why:','that file is not there yet; the next dream run writes it'];const miss=need.filter(s=>!t.includes(s));if(miss.length){console.error('MISSING: '+miss.join(' | '));process.exit(1);}console.log('DOCTOR MESSAGES OK');"
# Table A gate — doctor never mutates, never enumerates, and does not retype the path.
node -e "const t=require('fs').readFileSync('src/cli/doctor.js','utf8');const bad=[];if(/writeLedger|migrateFromWatermarks/.test(t))bad.push('doctor mutates or migrates the ledger');if(t.includes('displayName'))bad.push('doctor names a transcript — the enumeration has one home');if(/(['\"\x60])reports\/warnings\.md\1/.test(t))bad.push('the warnings path is retyped instead of imported');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('DOCTOR DISCIPLINE OK');"
```

- The last two are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing something a reader must judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state (one message
  reworded; a `displayName` call added to `doctor.js`; the path literal retyped), so
  a check that cannot fail is caught before anyone believes it. Both gates throw on
  a missing `doctor.js` rather than passing, so the deliverable-absent case is red.

## Out of scope (do NOT do these)

- **Printing any transcript name, on any surface, behind any flag.** The
  enumeration's one home is `reports/warnings.md` (ADR-0023 Amendment 2).
- Rendering sizes. Only `reports/warnings.md` renders them, and the ledger reader
  that yields them ships with `WP-quarantine-warnings-file`.
- Any change to `src/core/dream/ledger.js`, `src/core/dream/warnings.js`, or the
  content of `reports/warnings.md`.
- Changing `quarantineBannerLine` or anything the digest renders —
  `WP-quarantine-banner-decay`.
- The dream report's per-run skip accounting — `WP-dream-report-run-skips`.
- Any way to *clear* a quarantine: no ack, no un-skip, no `--fix`. Explicitly
  rejected in ADR-0023 Amendment 2's alternatives.
- Any staleness comparison against `reports/warnings.md` (Table B), and any read of
  that file's content.
- Re-opening ADR-0023's intake ceiling, its fingerprint, its selection rule, or
  Amendment 1's sticky `secret-revert-exhausted` skip.
- Any change to `src/cli/dream.js`, `src/cli/sync.js`, `src/core/digest.js`, or the
  golden fixtures under `tests/golden/`.

## Definition of done

0. **DISPATCH PRECONDITION.** Both hold, and the dispatch message records each:
   (a) ADR-0023's Amendment 2 (2026-08-29) carries the owner's hand-written
   `Status: **ACCEPTED — OWNER-SIGNED <date>.**` line in place of its `PROPOSED`
   line; (b) `WP-quarantine-warnings-file` is `Done` on `main` — without it the
   pointer names a file nothing ever writes, and Table B's `warn` branch would
   promise a dream run that does not deliver.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(doctor): report quarantine counts and point at the warnings file (WP-doctor-quarantine-counts)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
