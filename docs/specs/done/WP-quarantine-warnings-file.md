---
id: WP-quarantine-warnings-file
title: Give quarantines a durable home in the vault — a code-owned `reports/warnings.md`
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0023]
epic: quarantine-surface
---

# WP-quarantine-warnings-file: the vault becomes the durable record of what the dream could not see

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** This package adds one generated markdown
file and three call sites. No process, no daemon, no timer, no telemetry.

The nightly **dreaming** job consolidates the user's **transcripts** into the
**vault** (`~/wienerdog/`, PARA markdown, git-backed — the system's only durable
memory). ADR-0023 bounds that intake: a transcript that cannot be consumed *as-is*
gets a `quarantined` record in `<core>/state/transcript-ledger.json` with a
code-owned reason, and the dream carries on over everything else. A quarantine is
a **fail-safe skip, never a deletion** — the transcript file is untouched.

**The gap this closes: a quarantine leaves no durable trace anywhere the user
owns.** The only surface today is a banner in the injected session **digest**,
which lives inside the **managed block** of CLAUDE.md/AGENTS.md — re-rendered by
every `sync` and, for most users, not under version control. When the condition
clears, or the block is rewritten, the fact that N sessions were never dreamed
over vanishes without record. The vault contains zero mention of it, and so do the
**dream reports**. Measured on the maintainer's 0.13.0 install (2026-08-29): 191
historical Codex sessions legitimately quarantined `over-ceiling`, with nothing in
the vault to show for it.

**ADR-0023 Amendment 2 (2026-08-29)** resolves this by separating two things the
original ADR conflated. That *something entered quarantine* is an EVENT — news,
and news belongs in the digest for a bounded window. That *things are in
quarantine* is STANDING STATE — a durable coverage fact about what the dream could
not see, and standing state belongs in a pull-based durable surface. The vault is
git-versioned by design, so a file that changes **exactly** when its rendered
content changes (plus one reconciliation write when the file is missing — Table B's
refresh point 3) gives the user a permanent, diffable record the managed block can
never give. **Table C owns that trigger and is the only place it is decided.**
This package builds that file.

**The file keeps no history of its own, and that is deliberate (owner-ruled
2026-08-30).** It is a **pure, stateless render of the ledger**: the header
paragraph plus `## Current conditions`, and nothing else. Nothing on disk is ever
read forward into a write or into the composed bytes, so no byte a user or another
process leaves in the file can be laundered into Wienerdog's own **render**.
Whether that also holds of the dream COMMIT depends on which commit path is live:
it does once `WP-dream-promote-in-workspace`'s row G8 lands, and until then the
current wholesale-staging pipeline still commits whatever is on disk — the named
transitional residual under Implementation notes. The
**dated** history an earlier draft kept in a `## Run log` section comes for free
from where it already lives: **the vault is git-versioned by design, so every
rewrite commit IS the dated delta**, and the dream report's per-run counts
(`WP-dream-report-run-skips`) carry the per-run story. Two alternatives were
weighed and rejected; they are recorded under Implementation notes so nobody
re-proposes them.

**It is the family's root, because the enumeration has exactly one home and this
is it.** ADR-0023 Amendment 2 states the principle: the full list of quarantined
transcripts lives here and nowhere else, and every other surface — the digest
banner, `wienerdog doctor`, the dream report — carries **exact counts and, for
the counts this file can name, a pointer to it**, never a list. The banner and
`doctor` count quarantines only, every one of which this file names, so they
always point. The dream report also counts capacity-deferred transcripts, which
carry no ledger record and therefore cannot appear here: a report section whose
only non-zero count is that one carries no pointer. The exact condition is owned
by `WP-dream-report-run-skips`'s Table A pointer row, cited here and not
restated. So all three of this package's siblings
point at what it builds, and all three depend on it:
`WP-doctor-quarantine-counts`, `WP-quarantine-banner-decay` and
`WP-dream-report-run-skips`. **Nothing here may be softened on the assumption that
another surface also carries the names — none of them does.**

**The file is code-owned and carries the banner's trust construction.** It is
generated from the ledger alone: `displayName`-sanitized basenames plus code-owned
labels. Never transcript content, never a full path, never a stored reason string,
and never brain-authored — the dream's model is never told this file exists (no
`SKILL.md` mention, no prompt mention; a verification gate asserts it). **That is a
rule about what the brain is TOLD, not a filesystem permission**: in the current
pipeline a model that can write the vault can write any path in it, which is what
the pre-promotion transitional residual under Implementation notes names.

## Current state

**Nothing writes a `warnings.md` today; you are creating it and its module.**

### The ledger

`src/core/dream/ledger.js`. A record is `{fingerprint, outcome, reason?,
deferrals?, updated_at, harness}`, keyed by a case-folded absolute path (typedef
at `:58-66`). `fingerprint` is `` `${size}:${mtimeMs}:${dev}:${ino}` `` (`:41-43`)
— **the record carries no separate size field.** Relevant exports:

```js
function readLedger(stateDir)       // :82  → Ledger; missing/corrupt → empty; NEVER throws
function displayName(absPath)       // :319 → basename of the case-folded path, whitelisted to
                                    //        [A-Za-z0-9._-]; every other byte → '_'
function activeQuarantines(ledger)  // :328 → Array<{file, reason, harness}>, sorted by file
```

**Nothing reads the size out of a fingerprint today** — `activeQuarantines`
returns only `{file, reason, harness}`, and its return shape is pinned by
`tests/unit/ledger.test.js:183`. This package therefore adds **one** exported
reader for it (Table A's size row). It is added here, and only here, because this
file is the only surface in the family that renders a size.

### The vault-write primitive

`src/core/dream/vault-write.js` `writeIntoVault(o)` (`:205`) is, per its own JSDoc
(`:169`), "the ONLY sanctioned way for this family to write a vault CONTENT file".
**It currently has zero production call sites** — this package is its first.

```js
/** @param {{vaultDir:string, rel:string, bytes:Buffer,
 *           admit:(resolvedRel:string)=>string|null, expect?:Buffer}} o
 *  @returns {{written:true, bytes:Buffer, sha256:string}|{written:false, reason:string}} */
function writeIntoVault(o)
```

- `admit` is the **caller's** policy, applied to the RESOLVED vault-relative path
  (a directory that is really a symlink resolves to where it points); it returns a
  refusal reason or `null`. The module owns no policy.
- `expect` has **two states only**: present → the write is abandoned unless the
  target still holds exactly those bytes at publish time; **omitted** → the caller
  asserts the target must not exist. An explicit `null` is rejected.
- **Refusal is by RETURN, never by exception.** Every policy, containment, symlink
  and `expect` failure yields `{written:false, reason}`. It throws only on a
  caller-contract violation (a non-Buffer `bytes`, a missing `admit`, …).

### The dream run — `src/cli/dream.js` (646 lines)

- `:373-376` reads the ledger and applies `migrateFromWatermarks`. **The migration
  only seeds `baseline_mtime`; it never adds, removes or alters a `files` record**,
  so it cannot change the quarantine set.
- `:377` `const sel = collectExtracts(paths, ledger, cfg.maxInputBytes);`
- `:388-407` `const regenerateDigest = () => { … }` — a closure that re-renders
  `<core>/state/digest.md` from the **current in-memory `ledger`**.
- `:443-447` **step 5b**: when `sel.newlyQuarantined.length > 0 && !dryRun`, record
  each new quarantine, `writeLedger`, then `regenerateDigest()`.
- `:451-470` steps 6-7: a run with nothing fresh **returns here without any git
  commit** — this is exactly the adopt-with-history first-run shape. The
  `sel.entries.length === 0` block is `:467-470`, and it is the **only** point a
  fully idle run reaches: **Table B's refresh point 3 goes immediately before its
  `return`.** Note the ordering — this return comes BEFORE step 8's dry-run return
  at `:474-477`, so that call site needs its own `!dryRun` guard.
- `:507` **step 10** `precommitSessionEdits(vaultDir)`, then `assertCleanTree(vaultDir)`
  at `:508`. `precommitSessionEdits` (`src/core/dream/validate.js:113-137`) stages
  **every** dirty working-tree path with `git add -A` (`:125`) and commits it as
  `vault: session edits before dream`. It runs BEFORE the brain, and therefore
  before step 13's commit. **What that ordering implies for this package is decided
  in exactly one place — Table B's precommit-ordering row — and is restated nowhere.**
- `:572-580` **step 13** `validateAndCommit({…})` — the run's single git commit
  (ADR-0012: one dream run = one commit).
- `:597-611` **step 14**: `recordProcessed` / `recordSecretDeferred` /
  `recordSecretExhausted`, then `writeLedger`. **This is after the commit** — so a
  quarantine that *leaves* the set, and a `secret-revert-exhausted` quarantine that
  *enters* it, are only knowable here.
- `:625` **step 15** `regenerateDigest();` — the final refresh from the final ledger.

### The validator's note count

`src/core/dream/validate.js` `validateAndCommit(o)` (`:1074`). Step 2 (`:1144`)
classifies each changed vault path; a path that is neither a Tier-3 path nor the
skills LEARNINGS ledger falls through to branch (c) at `:1208` — "Tier-1/2 note,
daily log, or report → keep". Step 3 (header `:1211`, first statement `:1223`) is
the **EP2 staged-output secret gate**: it scans the git-computed staged *added*
lines of every changed file. Step 5 (`:1411-1429`) counts what it commits for the
commit message:

```js
    if (rel.startsWith(layout.skills_dir + '/')) skills++;
    else if (rel.startsWith(layout.reports_dir + '/')) continue;
    else notes++;
```

`layout.reports_dir` defaults to `'reports/dreams'` (`src/core/layout.js:39`), so
a file at `reports/warnings.md` would fall into `notes++`.

### Tests

`tests/integration/dream.test.js:789` — `a quarantine-only run records + banners +
exits 0; unchanged not retried; changed retried` — is the end-to-end fixture for
exactly the run shape this package must write a file on.
`tests/unit/dream-validate.test.js:270` covers the report path under a non-default
layout. There is no `tests/unit/dream-warnings.test.js`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/warnings.js | renders the file (**Table A**) and performs one refresh (**Tables B, C**); pure of policy beyond Table C's `admit`. **Exports the vault-relative path as a constant** — Table A's path row — which `WP-doctor-quarantine-counts` imports rather than retyping. **Also exports `composeWarnings`**, the pure whole-document render — a function of the LEDGER ALONE — that is the family's ONLY assembler of these bytes and is simultaneously the rewrite trigger's seam (**Table C**), so the wiring gate can call it directly. **Table C's single-composer row** names its two callers, the second of which is post-promotion and outside this package |
| modify | src/core/dream/ledger.js | **one addition only:** an exported reader that yields the quarantine size, per **Table A**'s size row. `activeQuarantines`, `quarantineBannerLine`, `displayName` and every record-writing function keep their exact current behaviour and signatures |
| modify | src/cli/dream.js | the **three** refresh call sites **Table B** names, and nothing else. **No run-start snapshot and no carried state** — Table B's no-carried-state row: each call takes only `{vaultDir, ledger}` |
| modify | src/core/dream/validate.js | **one line only** — the note-count exclusion in **Table D**. No other behaviour, no other step |
| modify | docs/GLOSSARY.md | **one sentence** in the **vault write** entry — the exact replacement is in **Table E**. No other entry |
| create | tests/unit/dream-warnings.test.js | cover the acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/ledger.test.js | cover the new size reader only; the existing assertions on `activeQuarantines` and `quarantineBannerLine` are not weakened |
| modify | tests/integration/dream.test.js | extend the quarantine-run coverage to the new vault file |
| modify | tests/unit/dream-validate.test.js | cover Table D's exclusion only; no existing assertion is weakened |

If a further file appears necessary, that is a finding, not a fix: record it under
"Discovered issues" in the PR body.

### Exact contracts

```js
/** Compose the CANONICAL bytes of the whole warnings file for a ledger — the
 *  header paragraph and the `## Current conditions` block, assembled per Table A.
 *  **PURE, and pure of the LEDGER ALONE: no filesystem, no clock, no second
 *  argument.** Two calls on one ledger are byte-equal, and — the property the
 *  whole design now rests on — **no byte that is on disk can influence the
 *  result, because the function is never shown it.**
 *  **It is the family's ONLY composer of this document, and that is a contract,
 *  not a convenience (Table C's single-composer row).** Both callers use it and
 *  neither assembles bytes of its own: `refreshWarnings` below (Table B's three
 *  refresh points), and the dream commit's reconciliation in
 *  `WP-dream-promote-in-workspace`'s row G8, third clause, which renders the
 *  committed bytes from this function and never re-reads the path.
 *  Because the render is total, it is ALSO the rewrite trigger's seam: Table C
 *  compares its output to the bytes on disk, so "the trigger sees everything the
 *  file shows" is true by construction rather than by a list kept in sync.
 *  @param {object} ledger @returns {Buffer} the whole file, always — an empty
 *    quarantine set renders the "no session transcripts are being skipped" form,
 *    never `null`. **WHETHER that render is written or committed is not this
 *    function's** — Table C decides the write, row G8 decides the commit, and
 *    both of them own the never-had-a-quarantine case. */
function composeWarnings(ledger)

/** Refresh the vault warnings file for one moment of one dream run. Reads the
 *  file, composes with `composeWarnings`, decides per Table C, and publishes
 *  through writeIntoVault. Never throws: every failure is reported by return.
 *  Holds no state between calls — there is nothing to carry, because the
 *  decision is a byte comparison against the file itself.
 *  @param {{vaultDir:string, ledger:object}} o
 *  @returns {{written:boolean, reason?:string}} a refused write is simply
 *    retried at the next refresh point, which re-reads and re-decides */
function refreshWarnings(o)
```

A worked file, rendered in full. Two `over-ceiling` records (sizes 52 428 800 and
51 404 120) and one `read-error` record:

```markdown
# Wienerdog warnings

Wienerdog writes this file itself, from its own record of which session
transcripts it could not read. Do not edit it — it is rewritten whenever the list
below changes.

## Current conditions

### The session file is bigger than Wienerdog will read — 2

- rollout-2026-04-09t00-45-39-019d6f45-d0c3-7e00-8855-5a15fb3ffa67.jsonl — 50.0 MB (52428800 bytes)
- rollout-2026-04-09t01-15-36-019d6f61-3beb-7990-990d-2b105e672821.jsonl — 49.0 MB (51404120 bytes)

### The session file could not be read — 1

- rollout-2026-04-10t00-33-07-019d7460-b3e7-7fc2-bb7b-f2cb54c285b4.jsonl
```

The same file once every quarantine has cleared. **The file is not deleted and it
does not go blank: it says so, in words** — and because the vault is git-versioned,
that rewrite is itself the dated record that the last quarantine cleared:

```markdown
# Wienerdog warnings

Wienerdog writes this file itself, from its own record of which session
transcripts it could not read. Do not edit it — it is rewritten whenever the list
below changes.

## Current conditions

No session transcripts are being skipped.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** a taxonomy is introduced — the reason →
heading map; **(v)** an authority boundary is crossed — the ledger records the
data, this module owns its rendered lifecycle, and `writeIntoVault` owns the
publish while this module owns the policy; **(vi)** `WP-doctor-quarantine-counts`
inherits the path contract (it imports the exported constant — the banner and the
dream report carry the path only inside their own fixed sentences); **(vii)** the
same facts are mirrored across the Deliverables cells, the acceptance criteria and
the verification gates.

The **reason enum's** canonical source is `src/core/dream/ledger.js` (the typedef
at `:58-66`). Table A maps that enum onto *this file's* strings and is the single
place those strings are decided. `WP-doctor-quarantine-counts` maps the same enum
onto *terminal count lines* and owns its own table; the two surfaces render
deliberately different text, so there is no shared string set that can drift. The
one string that **is** shared across modules — the vault-relative path — is
exported from this package's module as a constant and imported by its consumers,
never retyped (Table A's path row).

### Table A — the rendered document

| Fact / rule | Value |
|---|---|
| Vault-relative path | the fixed literal `reports/warnings.md`, **exported from this module as a named constant** — it is the one place the path is decided, and `WP-doctor-quarantine-counts` imports it. Retyping it in a second module is drift waiting to happen; the only other occurrences in the codebase are inside fixed English sentences (the digest banner, the dream report), each pinned by its own package's byte-exact gate. **Layout-independent on purpose:** it is not a dream report, so it does not live under `layout.reports_dir` (`reports/dreams` by default), and `src/core/vault-snapshot.js` scopes routine snapshots by `'reports/dreams'` newest-N — a warnings file inside that dir would displace a dream report from a routine's window |
| Document shape | the two literal worked examples under "Exact contracts" ARE the shape: `# Wienerdog warnings`, the fixed two-sentence header paragraph byte-for-byte as shown, `## Current conditions`, the block below. **That is the whole document — there is no second section** (owner-ruled 2026-08-30; the earlier `## Run log` is dropped, and its dated history now comes from the vault's git log). Exactly one blank line between every block; the file ends with exactly one `\n` |
| **The header paragraph's trigger sentence stands as written — RULED 2026-08-30 (PR-review errata)** | the shipped bytes end `Do not edit it — it is rewritten whenever the list below changes.` The Mirrored Surface Checklist's rewrite-trigger item was read as forbidding them; it does not, and this row is where that is decided. What the item forbids is a MEMBERSHIP formulation — the file rewritten when the SET changes, i.e. when a transcript enters or leaves quarantine — which is false, because a same-key reason or size change rewrites the file with the set unmoved. **"The list below" denotes the rendered block, not the key set**, and the rendered block IS the trigger's operand (Table C). The sentence is therefore true in both directions: every rewrite changes what is printed below, and every change to what is printed below causes a rewrite. It is a registered, examined mirror of Table C, not a violation. **If the paragraph is ever reopened for an independent reason, the successor wording is `it is rewritten whenever what it shows changes`** — nearer the mechanism, no less plain for a non-technical reader. **It is not worth reopening on its own:** these bytes are part of the render, so under Table C row 1 every install that already holds the file rewrites it on its next dream run, producing a vault commit whose entire diff is this sentence — a real cost in the user's own history, bought for a wording that is already true |
| Current conditions, empty | the single line `No session transcripts are being skipped.` |
| Current conditions, non-empty | one `### <heading> — <N>` per non-empty reason group, in the row order of the next table, each followed by a blank line and one markdown list entry per member |
| Which records are members | every entry of `ledger.files` that is a plain object with `outcome === 'quarantined'`. Nothing else |
| Name shown | `displayName(key)` output and nothing else — never a full path, never content |
| **No stored `reason` string is ever rendered** | the unrecognized group uses a fixed heading. `readLedger` deliberately does not validate individual records, so rendering a stored string would let stored data choose the document's bytes |
| Size (`over-ceiling` group only) | the fingerprint's first `:`-separated field as an integer, rendered as the suffix `— <X.X> MB (<bytes> bytes)` after an em-dash-spaced separator, with `X.X` = `bytes / 1048576` to one decimal. Absent, non-numeric, negative or not a safe integer → the entry renders with **no** size suffix |
| Sort within a group | by `displayName` ascending. **The tie-break is deliberately unspecified — but NOT because tied entries render identically. That justification was false and is withdrawn (2026-08-30, PR-review errata):** two distinct ledger keys can sanitize to one `displayName` while carrying different sizes, and in the `over-ceiling` group the size suffix makes their order observable in the bytes. Measured: keys `{p1/huge.jsonl, p2/huge.jsonl}` with sizes 52 428 800 and 51 404 120 render `50.0 MB` then `49.0 MB` in one key order and the reverse in the other. **What makes leaving it unspecified affordable is that the order is not reachable churn**, and that is a property of the callers, not of the render: `composeWarnings` is a pure function of the ledger OBJECT, `writeLedger` (`ledger.js:102-115`) serializes `ledger.files` in key-insertion order, and `withRecord` (`:246-248`) re-spreads an existing key in place, so a tied pair's relative order is fixed at first insertion and never moves within an install. An unchanged ledger therefore still renders byte-equal output, which is all Table C row 2 needs. **A total sort — a secondary tie-break on the ledger KEY, unique by construction — would make that a property of the function instead. It is one line, it is deliberately NOT in this package, and it is recorded here so it is not rediscovered as a bug** |
| **Nothing time-varying may appear ANYWHERE in the file** | no timestamp, no date, no run count, no "last checked" — and, since 2026-08-30, no run log either. **The rule used to be scoped to "above `## Run log`"; dropping that section makes it total, which is strictly stronger and now trivially true**: the whole document is a pure function of the ledger. This is what makes "an existing file's bytes change exactly when its RENDERED CONTENT changes" true (the one other write is Table C row 3's write-if-absent reconciliation, which by definition has no existing bytes to churn), and Table C's no-op rule depends on it: `composeWarnings` is a pure function of the ledger, so an unchanged ledger yields byte-equal output and no rewrite |
| **Nothing on disk is carried forward** | a rewrite REPLACES the file with `composeWarnings(ledger)` in full. No section, line or byte of the previous file survives into the new one, and none survives into the bytes the commit-time render composes. **The COMMIT carries only those composed bytes once `WP-dream-promote-in-workspace`'s row G8 is the commit path; in the pre-promotion window the current `git add -A` staging still commits what is on disk** — the named transitional residual under Implementation notes. **This is the property that killed the run log** (round 3, finding 1): a carried section is user-controlled input to a code-owned document, and the only cheap way to be sure a user's bytes never enter Wienerdog's own commit is never to read them |

Reason → heading, in emission order:

| Reason (from `ledger.js`) | Level-3 heading text |
|---|---|
| `over-ceiling` | `The session file is bigger than Wienerdog will read` |
| `too-many-lines` | `The session file has too many lines to read` |
| `read-error` | `The session file could not be read` |
| `secret-revert-exhausted` | `The notes made from these sessions were withheld by the secret check too many times in a row` |
| anything else (incl. a missing or non-string `reason`) | `Skipped for a reason this version does not recognize` |

The `secret-revert-exhausted` group — **and only that group** — carries one fixed
remediation line between its heading and its entries, because it is the one class
the user can act on:

```text
The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest of the files there (not the redacted/ folder inside it).
```

### Table B — when the file is refreshed inside a dream run

| Fact / rule | Value |
|---|---|
| **No run-start snapshot, and no carried state at all (owner-ruled 2026-08-30)** | earlier drafts had `dream.js` take a `WarningsSnapshot` at `:375` and thread it through the refresh points. **There is nothing left to thread.** The write decision is a byte comparison between `composeWarnings(ledger)` and the file on disk (Table C), and both operands are read at the moment of the decision, so no state crosses call sites, no argument is carried, and a refused write needs no bookkeeping to be retried — the next refresh point simply re-reads and re-decides. Round 1's defect (a same-key reason or size change moving nothing) and round 2's converse (an `mtimeMs`-only change moving something) are both still excluded, now by construction: the operand IS the rendered document, which is neither the key set nor the fingerprint |
| Refresh point 1 | inside the `sel.newlyQuarantined.length > 0 && !dryRun` block at `:443-447`, immediately after the existing `regenerateDigest()` call. **This is the point that serves the adopt-with-history first run**, whose "nothing fresh" return at `:467-470` never reaches point 2's neighbourhood with a commit. That run then also passes point 3 on its way out, which is a no-op because point 1 has just written the file |
| Refresh point 2 | immediately after the existing final `regenerateDigest()` at `:625`. This is the only point at which a quarantine that **left** the set, or a `secret-revert-exhausted` quarantine that **entered** it at `:604`, is knowable |
| Refresh point 3 — **write-if-absent** | immediately before the `return` inside step 7's `sel.entries.length === 0` block (`:467-470`), guarded by `!dryRun`. A **fully idle** run — nothing fresh to consume, no new quarantine, no commit — reaches neither point 1 (guarded by `sel.newlyQuarantined.length > 0`) nor point 2 (past this return), so without this call site an install whose quarantines are all **pre-existing** never gets the file at all until the set happens to change. Table C row 3 already decides what this call does: it writes only when the file is absent and the current set is non-empty |
| Why point 3 exists at all (owner-ruled 2026-08-29) | `WP-doctor-quarantine-counts` ships a byte-gated message promising *"that file is not there yet; the next dream run writes it"*. Without a write-if-absent trigger that promise is false for an idle run, which is exactly the upgrade shape: 191 historical quarantines already in the ledger, quiet nights, no file. The owner ruled the mechanism in rather than hedging the message |
| Why these three, and no others | points 1 and 2 are already the two points at which the run refreshes its other ledger-derived durable surface, `state/digest.md` — one rule, two surfaces, nothing that can drift out of step. Point 3 is **not** a set-change point and refreshes nothing else: it is a reconciliation on the one run shape that reaches neither of the others. The capacity-wedge path (`:451-464`) is not a refresh point — it throws |
| **Where a refresh write lands relative to the run's own git steps — the ONE place this ordering is decided (added 2026-08-30, PR-review errata)** | measured on the tree this spec is written against, and written down because three other surfaces had each asserted it independently and all three were false. Step 10 `precommitSessionEdits(vaultDir)` (`src/cli/dream.js:507`; `src/core/dream/validate.js:113-137`) commits **every** dirty working-tree path with `git add -A` as `vault: session edits before dream`, and it runs BEFORE the brain and therefore before step 13's `validateAndCommit` (`:572-580`). **Refresh point 1 writes before it. Refresh points 2 and 3 write after it, or on a run that never reaches it.** So in the pre-promotion window **no refresh-point write is ever a member of a `validateAndCommit` changed set**: point 1's bytes are already in `HEAD` by the time step 3's EP2 staged-output secret gate scans `git diff --cached`, and points 2 and 3 are swept in by the NEXT run's precommit (the uncommitted-until-next-run residual under Implementation notes). **This row moves no call site** — every refresh point stays exactly where the three rows above put it; the row writes down the consequence those placements already had. Its two consequences are each stated by the surface that owns them and are not restated here: what the EP2 gate does and does not see (the EP2 residual under Implementation notes), and when Table D's exclusion can fire (**Table D**). Post-promotion this ordering is not this package's at all — `WP-dream-promote-in-workspace`'s row G6 removes the precommit and its row G8 makes the dream commit carry this file directly |
| What a second refresh in one run does | nothing, unless the ledger moved or the first write was refused — and it needs no memory to get that right. The first write leaves the file holding exactly `composeWarnings(ledger)`, so the second call's comparison is byte-equal and it writes nothing (Table C row 2). Points 2 and 3 are mutually exclusive (point 3 returns from the run); the reachable pairing is point 1 then point 2, or point 1 then point 3 |
| Dry run | writes nothing. Point 1 is already inside a `!dryRun` guard; point 2 is unreachable on a dry run (`:474-477` returns first); **point 3 needs an explicit `!dryRun` guard** — step 7's return at `:467-470` comes BEFORE step 8's dry-run return, so it is reachable on a preview run. That guard is the one new guard this package adds |
| A refresh failure never fails the dream | `refreshWarnings` never throws, and a `written:false` result prints one `wienerdog: dream — …` console line and is otherwise ignored. The ledger still holds the condition, `doctor` still reports the counts, and the digest banner still raises it — what is lost is the enumeration, until the next refresh |

### Table C — the write decision

**ONE comparison, and it is a byte comparison against the file itself.** Let
`render = composeWarnings(ledger)` — the whole document, a pure function of the
ledger (`### Exact contracts`). The refresh writes when, and only when, the file
does not already hold exactly those bytes:

| # | File on disk | Ledger's active quarantine set | Action |
|---|---|---|---|
| 1 | present, bytes **≠** `render` | any | **write** `render` |
| 2 | present, bytes **=** `render` | any | **no write at all** — nothing the file shows has changed |
| 3 | absent | **non-empty** | **write** `render` — this is **write-if-absent**, the reconciliation Table B's refresh point 3 exists to reach (a lost, deleted, refused or never-written file) |
| 4 | absent | **empty** | **no write** — a vault that has never had a quarantine gets no file |

**Row 4 is the only place the set size is consulted at all**, and it exists to
answer exactly one question: may this run CREATE the file? Once the file exists,
its content is decided by the render and nothing else — which settles the
empty-set-with-existing-file case as row 1: the last quarantine clearing rewrites
the file to `No session transcripts are being skipped.` **The file is never
deleted and never left saying something false.** Deleting it was rejected: on a
git-versioned vault the rewrite is a meaningful, dated diff, while a deletion
throws away the pointer three other surfaces promise the user is there.

**Why this is one comparison and not two (owner-ruled 2026-08-30).** Earlier
drafts ran a MEMBERSHIP test (`entered`/`left` over the quarantine keys) beside a
CONTENT test, because a `## Run log` section needed dated membership deltas.
That section is gone, and with it the membership computation, the carried
snapshot and the whole `WarningsSnapshot` type: **nothing else consumed
`entered`/`left`.** The dream console lines and the dream report's counts
(`WP-dream-report-run-skips`) are computed from `sel` — the selection outcomes
`collectExtracts` returns — never from a before/after set difference here, so
they are untouched. Both bounds round 1 and round 2 established survive
unchanged, now by construction rather than by a second test: a same-key reason or
size change moves the render and rewrites; an `mtimeMs`-, `dev`- or `ino`-only
change moves nothing rendered and writes nothing.

| Fact / rule | Value |
|---|---|
| **The single-composer row — one function assembles this document, and NOTHING else may** | `composeWarnings` (`### Exact contracts`) composes the whole file — the fixed header and the Current-conditions block — from the ledger alone. **It has exactly TWO callers, both named here so a third is a finding rather than a fix:** (1) `refreshWarnings`, at Table B's three refresh points; (2) **the dream commit's reconciliation** — `WP-dream-promote-in-workspace`'s row G8, third clause, which renders the committed bytes from this function post-promotion. The rule exists because the two callers must produce BYTE-EQUAL output for the same ledger: the commit-time render must carry the same header and the same Current conditions as a refresh write would. Two composers cannot be kept byte-equal by review; one function makes it true by construction, and the wiring gate asserts the export, its single argument and the single assembly site |
| **The PINNED state — ONE argument, the ledger** | both callers render from **the run's in-memory `ledger` binding**, which between refresh point 1 and the run's commit is **not mutated at all**. Measured on the current tree: the only assignments to that binding are `src/cli/dream.js:375` (post-migration), `:444` (recording `sel.newlyQuarantined`, inside refresh point 1's own block) and `:599-607` (`recordProcessed` / `recordSecretDeferred` / `recordSecretExhausted`), and **the last of those is after `validateAndCommit` at `:572-580`**. So the ledger point 1 rendered from and the ledger the commit renders from are the same object in the same state, and the two renders agree by construction rather than by timing luck. **The RULE is "the ledger as it stands at commit construction"; the measurement is what makes that byte-agree with point 1 today.** A future change that mutates the quarantine set between the two does not break the contract — the commit then carries the newer document and refresh point 2 brings the disk file to it later in the same run — but it does break the agreement, so it is a change that must be made deliberately. **A post-commit ledger change (a `secret-revert-exhausted` quarantine minted at `:604`) is deliberately OUTSIDE the pinned state**: refresh point 2 writes it to disk after the commit, and it rides the NEXT run's commit reconciliation — the one-run lag, now bounded to one commit instead of forever. **A SECOND pinned argument used to be needed and no longer exists** (owner ruling, 2026-08-30): with the run log gone the render takes no snapshot and no date, so there is nothing else for the two callers to agree about and nothing either of them can pass differently. That also disposes of round 3's finding 2, which was that the `date` argument was unpinned across the two callers — there is no date argument |
| **The reconciliation reads the LEDGER; it reads no file and it writes none** | the commit-time render composes bytes for the COMMIT from the ledger and writes nothing to disk. **Table B's three refresh points stay the only writers of `reports/warnings.md`**, and this package adds no fourth write site — post-promotion or not. So, **once row G8 is the commit path**, a stray user edit to this code-owned file is never committed and never silently absorbed — in the pre-promotion window the named transitional residual under Implementation notes applies instead: it is not in the composed bytes (they never saw it), the commit carries the canonical render, and the edit survives as an uncommitted working-tree modification until a refresh point legitimately rewrites the whole file (`WP-dream-promote-in-workspace` row G8, third clause, owns the commit branch) |
| Publish call | `writeIntoVault({vaultDir, rel: 'reports/warnings.md', bytes, admit, expect})` — this package is that primitive's first production caller |
| `admit` | admits the resolved vault-relative path `reports/warnings.md` and **nothing else**; every other value returns a refusal reason. The policy is the caller's by the primitive's contract |
| `expect` | the exact bytes read from the file for the comparison, when the read succeeded; **omitted** when the read failed with ENOENT. Never `null` — the primitive rejects it. **Those bytes are used for the row-1/row-2 comparison and as the primitive's premise, and for nothing else — no part of them reaches the composed document** |
| A read failure that is not ENOENT | no write, `{written:false, reason}`. Never guess at the file's content |
| A refused write | nothing to record: the file simply still does not hold the render, so the next refresh point's comparison decides to write again |
| **An EXISTING file is rewritten only when its RENDERED CONTENT changes** | rows 1 and 2 together. The no-churn property is now a tautology: `composeWarnings` is pure of the ledger and Table A forbids anything time-varying anywhere in the file, so a run over an unchanged ledger produces byte-equal output and takes row 2. What changed from the round-1 text is the TRIGGER, not the property: bytes and mtime change exactly when the rendered content changes, which is a superset of "when the set changes" and is the set of moments at which the file would otherwise be lying |
| **Write-if-absent fires at most once** | its own write makes the file present, so the very next idle run takes row 2 and writes nothing. It fires again only if the file goes missing again |
| What a deleted file costs | **nothing durable.** The document is fully re-derivable from the ledger, so refresh point 3 recreates it on the next run (row 3), and the dated history was never in the file — it is in the vault's git log, which a working-tree deletion does not touch |

### Table D — the validator's note count

| Fact / rule | Value |
|---|---|
| The problem | `src/core/dream/validate.js:1427-1429` counts a committed path as a `note` unless it is under `layout.skills_dir` or `layout.reports_dir`. `reports/warnings.md` is under neither, so **any dream commit that carries it** reports one extra note in `dream: <date> — N notes, M skills`. **WHICH runs those are is Table B's precommit-ordering row's to decide, cited not restated:** no refresh-point write is ever in a `validateAndCommit` changed set, so on the code-owned path the exclusion does not fire. (An earlier form of this row said "a run that changes it", which asserted the opposite and was false — 2026-08-30, PR-review errata.) **It is not dead code and it is not defensive padding.** It is reachable today on the brain-writes-it path — the precommit runs before the brain and `assertCleanTree` leaves the tree clean, so anything appearing at this path during the brain window (a model that can write the vault can write any path in it; so can a user saving mid-run) IS in the changed set and IS counted — and it is required FORWARD, because `WP-dream-promote-in-workspace`'s row G8 makes the dream commit carry this file by design. Landing it here is what lets that spec's row G11 inherit it by citation instead of inventing it |
| The change | one added condition that excludes exactly the literal `reports/warnings.md` from `notes`, alongside the existing `reports_dir` exclusion. Nothing is reclassified as a skill, no other step is touched |
| Not changed | **whenever the file IS in a changed set**, it is still committed, still classified by Step 2's branch (c) at `:1208` ("keep"), and still scanned by the EP2 gate — the change removes it from the `notes` tally and from nothing else. **On the code-owned path it is in no changed set at all** (Table B's precommit-ordering row), so on that path Step 2 and Step 3 have nothing to do with it; that is a fact about reachability, not a carve-out, and no path is exempted from any gate anywhere. (The unqualified "still scanned by the EP2 gate" this row used to carry was the same false ordering assumption — 2026-08-30, PR-review errata.) This is a **counting** fix only |

### Table E — the GLOSSARY sentence

| Fact / rule | Value |
|---|---|
| Anchor | `docs/GLOSSARY.md:73-75`, the **vault write** entry — the sentence beginning `Two writers use it and no others:`, which is hard-wrapped across three lines |
| Replacement | the literal below, hard-wrapped to the entry's existing width. It is the single place these bytes are decided |
| Scope | that one sentence. No other sentence of that entry, and no other entry, changes |
| After the edit | the string `Two writers use it and no others` does not occur anywhere in `docs/GLOSSARY.md` |
| **Known stale twin — NOT a deliverable, report it instead** | `src/core/dream/vault-write.js:7` carries the same superseded fact in its module header: "The family owns exactly two such writers". After this edit that header contradicts the GLOSSARY. `vault-write.js` is deliberately absent from the Deliverables table — this package changes no primitive and must not touch one — so **do not edit it**. Record it under "Discovered issues" in the PR body, naming the file, the line and the superseded phrase, so the maintainer can land the header fix on its own |

The replacement sentence, whitespace-insensitive (the verification gate flattens
runs of whitespace before comparing, so the hard-wrap points are the
implementer's):

```text
Three writers use it and no others: each promoted note; the dream report (whose body the brain authors and to which code appends its accounting section, so that one is two calls); and the vault warnings file (`reports/warnings.md`), which code writes whole from the transcript quarantine ledger.
```

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it; the
      `ledger.js` row cites Table A's size row, the `warnings.js` row its path row,
      the `dream.js` row Table B's three refresh points)
- [ ] Acceptance criteria that assert Tables A-E, including the write-if-absent
      criterion that asserts Table B's point 3 with Table C's row 3, and the
      no-churn criterion that asserts Table C's row 2
- [ ] Verification commands (the header/heading gate asserts Table A; the wiring
      gate asserts Table A's path row, Table B's three call sites and Table C's
      one-argument render; the GLOSSARY gate asserts Table E)
- [ ] **The rewrite trigger.** Table C decides it — the render differs from the
      bytes on disk — and its mirrors are the `composeWarnings` and
      `refreshWarnings` contracts under "Exact contracts", Table A's
      no-time-varying row, Table B's no-carried-state row, the
      second-run acceptance criterion, the wiring gate's render assertions, **and —
      registered 2026-08-30, because it was an UNREGISTERED mirror and that is
      exactly why it collided — the rendered document's own trigger sentence, whose
      ruling is Table A's header-sentence row.**
      **No surface may say the file is rewritten when the SET of quarantined
      transcripts changes** — when one enters or leaves quarantine — that is the
      round-1 wording a same-key reason change falsifies. **The prohibition is on
      the MEMBERSHIP formulation, not on the word "list":** a surface that names
      what is RENDERED — the list as printed, the document, what the file shows —
      is naming Table C's actual operand and is compliant. The rendered header
      sentence is precisely that case, and Table A rules it. **Nor may any
      surface say "when the FINGERPRINT changes"** — that is the round-2 wording an
      `mtimeMs`-only change falsifies in the other direction, and it would demand a
      rewrite the no-churn property forbids. **And no surface may reintroduce a
      membership (`entered`/`left`) test, a carried snapshot, or a second
      section** — that is round 3's defect, dropped by the owner on 2026-08-30
- [ ] **The single composer and the commit-time render.** Table C's
      single-composer row and its pinned-state row decide them, and their mirrors
      are the `composeWarnings` contract under "Exact contracts", the `warnings.js`
      Deliverables cell, the named residual under Implementation notes, the
      one-composer acceptance criterion, the wiring gate's `composeWarnings`
      assertions, and — across the package boundary —
      `WP-dream-promote-in-workspace`'s row G8 third clause, which is where the
      commit ELIGIBILITY is decided. **No surface here may state the commit
      eligibility itself** (that is G8's), **and no surface may describe the
      commit-time bytes as anything but `composeWarnings`' output over the pinned
      ledger** — an authorship test ("the run wrote it") is the round-2 defect, and
      a second composer is how the committed and the written bytes drift apart
- [ ] **Nothing on disk enters a write or the composed bytes — and, once
      `WP-dream-promote-in-workspace`'s row G8 lands, the commit.** Table A's
      nothing-carried-forward row decides it, and its mirrors are the
      `composeWarnings` contract's single-argument signature, Table C's `expect`
      row, its reconciliation row, the stray-edit acceptance criterion, the wiring
      gate's arity assertion, the Context paragraph's render-versus-commit
      sentence, the pre-promotion-window residual under Implementation notes, and
      `WP-dream-promote-in-workspace`'s row G8 consequence (a). **No surface may
      describe any byte of the existing file as being carried, preserved or
      appended to, and no surface may state the COMMIT half as a flat
      present-tense guarantee** — until row G8 lands the commit path is the
      current wholesale stage, and the residual is where that is said
- [ ] **Table D's note-count exclusion, which has a second mirror across the
      package boundary.** `WP-dream-promote-in-workspace`'s row G11 takes the
      counting over when the pipeline replaces the validator, and it inherits this
      exclusion by citing this table rather than restating it — so a change to
      Table D moves that row and its counts acceptance criterion too. **No surface
      may state the exclusion's shape anywhere but here.**
- [ ] **Where a refresh write lands relative to the run's own git steps.** Table
      B's precommit-ordering row decides it — added 2026-08-30 because three prose
      surfaces had each asserted it independently and all three were false — and its
      registered mirrors are the Current-state `:507` bullet, Table D's "The problem"
      and "Not changed" rows, the EP2 residual under Implementation notes, and the
      Security checklist's residual list. **No surface may state that ordering, or
      what the EP2 gate does and does not see, anywhere but by citing that row.**
- [ ] Current-state description (the ledger shape, `writeIntoVault`'s contract, the
      `dream.js` line ranges — including `:467-470`, where point 3 goes, and `:507`,
      the precommit whose ordering Table B's row decides — and the validator's
      counting loop)
- [ ] The two literal worked files under "Exact contracts" (they ARE Table A rendered)
- [ ] Implementation notes (the render-is-the-trigger decision, the EP2
      residual, the uncommitted-until-next-run residual **and its pre-/post-promote
      commit owners**, **the pre-promotion-window residual**, the adopted-vault
      path residual)
- [ ] Security checklist (the sanitizer sentence and the four residuals)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **The dream's model never learns this file exists.** Do not mention it in
  `skills/wienerdog-dream/SKILL.md`; do not add it to any prompt. It is code-owned,
  and the brain writing into it would destroy the trust construction that makes it
  safe to point the user at.
- **The trigger's operand IS the rendered document, not a tuple of the facts it
  shows (decided 2026-08-29, widened to the whole file 2026-08-30).** The
  alternative — carrying `(key, reason, displayName, size)` per record — is a
  second structure that has to be kept in step with the renderer by hand, and the
  failure mode is silent: add a rendered fact (a future group, a remediation line)
  and forget the tuple, and the trigger goes blind to it in exactly the way round 1
  found. Comparing the rendered bytes to the bytes on disk makes "the trigger sees
  everything the file shows" true by construction. It is affordable because
  `composeWarnings` is pure and the document is small — one short line per
  quarantine.
- **Named residual — the file can ride the next run's commit rather than this
  one's, and WHO sweeps it in changes with the promotion rewrite.** Refresh point 2
  is after `validateAndCommit`, and the adopt-with-history run returns at
  `:467-470` with no commit at all. In both cases the file sits uncommitted in the
  vault at the end of the run. **Pre-promotion (the tree this spec is written
  against): the next run's `precommitSessionEdits(vaultDir)` (`:507`) sweeps it
  in** — current behaviour, unchanged by this package.
  **Post-promotion: `WP-dream-promote-in-workspace` removes that call (its row G6),
  and its row G8 owns committing this file instead** — and it does so by
  **COMMIT-TIME RECONCILIATION, not by authorship** (owner-ruled direction A,
  2026-08-29, after round 2 found the authorship wording strands the file):
  at commit construction that run renders this file's canonical bytes with
  `composeWarnings` from the pinned ledger (Table C's pinned-state row) and
  compares them to the file's content at HEAD; **differ, or HEAD lacks the file →
  the commit carries the rendered bytes, no matter whether or when anything wrote
  the file on disk; equal → the file is omitted and no churn commit is made.**
  That spec carries `depends_on: WP-quarantine-warnings-file` so the handoff
  cannot land in the wrong order, and **row G8's third clause is the single place
  the commit eligibility is decided — cited here, never restated.** What this buys
  the residual: a write at refresh point 2 or point 3, on a run that makes no
  commit at all, is picked up by the NEXT run that commits, even though that run
  writes nothing itself. **The lag is one commit and is now actually discharged;
  before direction A it was unbounded** (round 2, finding 3). Either way the *diff*
  is exactly right. Do not add a second commit: ADR-0012 fixes one dream run to one
  commit, and do not edit the promotion spec from this package.
- **Two alternatives to direction A were rejected by the owner (2026-08-29), and
  they are recorded so a later reader does not re-propose them.** (a) **A
  pending-commit handoff:** the refreshing run persists its decided bytes (or a
  "commit me next" flag) for the next run to consume. Rejected — it is a NEW
  persisted artifact, one more thing that can be stale, orphaned or half-written,
  bought for a fact the next run can simply re-derive from the ledger it already
  reads. (b) **Reordering every refresh before the commit:** rejected because
  refresh point 2 exists precisely to see the post-commit ledger, and moving it
  earlier weakens `WP-069`'s processed-after-commit gate. **A third option —
  carrying the written Buffer through the pipeline — dissolved with direction A**
  (round 2, finding 2): no buffer crosses the pipeline, because the decided bytes
  are recomputed at commit time from the pinned ledger.
- **Named residual — in the pre-promotion window this file's integrity is the
  vault's, not the code's (round 4, finding 1; owner-ruled 2026-08-30).** **The
  window** runs from this package landing until `WP-dream-promote-in-workspace`
  lands. Inside it the pipeline is the current one: the brain writes the vault
  directly, this package's three refresh points write the same tree, and the next
  run's `precommitSessionEdits` (`src/cli/dream.js:507`) stages every surviving
  working-tree change with `git add -A` (`validate.js:125`) before the commit. So
  during the window, bytes that something other than `composeWarnings` left in
  `reports/warnings.md` on disk — a user's edit, or the brain's, since a model that
  can write the vault can write any path in it — can be committed verbatim.
  **The exposure, stated plainly: during the window this file's integrity level is
  the same as any vault note's.** The RENDER half of the trust construction holds
  from day one — nothing on disk can reach the composed bytes, because
  `composeWarnings` is never shown the file — but the COMMIT half, "no byte from
  disk enters Wienerdog's own record", holds with full force only once row G8 is
  the commit path. **The discharge event is G8 itself, not a later hardening
  pass:** `WP-dream-promote-in-workspace` carries
  `depends_on: WP-quarantine-warnings-file`, its row G6 removes
  `precommitSessionEdits`, its row G8 makes the commit a render-versus-HEAD
  reconciliation, and **its dream-commit acceptance criterion — row G8's, cited by
  name and deliberately not requoted here, because the commit eligibility is G8's
  to state — already carries this exact case** in its
  closing paragraph: with a stray edit **anywhere** in the file on disk, the commit
  carries the canonical render, none of the edited bytes appear in it, and the edit
  stays in the working tree, uncommitted and undeleted. **Why the window is
  accepted rather than closed (owner's reasoning, recorded so nobody re-opens it):**
  in the current pipeline the brain can write EVERY vault file — that is precisely
  the architecture the promote family exists to end — so the marginal exposure this
  package adds is one more file, and one the brain is never told about (the
  "the dream's model never learns this file exists" rule above, gated by the
  verification step that greps `skills/wienerdog-dream/SKILL.md`). **The rejected
  alternative is a transitional canonical re-stage guard:** re-render this one path
  with `composeWarnings` and re-stage those bytes immediately before the current
  validator commits, or reject every non-canonical change to it. It would close the
  window, and it is rejected as **throwaway machinery** — a second commit-time write
  path, with its own failure policy and its own gates, built and deleted inside a
  single epic, bought for marginal exposure. **Do not build it, and do not soften
  row G8 on the strength of it.**
- **Two alternatives to dropping the Run log were rejected by the owner
  (2026-08-30), and they are recorded so a later reader does not re-propose them.**
  Round 3 found that carrying the on-disk log forward makes it user-controlled
  input to a code-owned commit. (a) **Move the file out of the vault, into the
  state directory, where `0600` protects it.** Rejected: `0600` guards OTHER
  users, and the threat here is a same-user process, which writes the state
  directory exactly as it writes the vault — the exposure is location-independent
  — while the property that makes this file worth having, a git-versioned durable
  record the user can diff and keep, would be lost outright. (b) **Keep the log
  but validate its grammar before trusting it** (parse each carried line against
  the entry format, drop anything that does not match). Rejected as workable but
  not worth it: it is a parser, a grammar and a failure policy of new machinery,
  bought for a section that duplicates what the vault's git history already
  provides for free. **Dropping the section makes both round-3 findings dissolve
  at the root rather than be answered** — there is no carry to authenticate and no
  date to pin — and it removes surface rather than adding it.
- **Named residual — in the pre-promotion window this file's bytes reach the
  vault's git history WITHOUT passing the EP2 gate (restated 2026-08-30 after PR
  review; the earlier text claimed the opposite and was false).** The mechanism is
  Table B's precommit-ordering row's and is cited, not restated: a refresh point's
  write is committed by `precommitSessionEdits`, so it is never a member of a
  `validateAndCommit` changed set, and Step 3's staged-output secret gate — which
  scans exactly that set — never sees it. **The harm runs the OPPOSITE way from
  what this residual used to reason about.** It used to worry that the gate might
  redact or withhold Wienerdog's own file, a bounded and self-healing cost; the
  real exposure is unscanned bytes entering the user's own vault history.
  **It is bounded, and the bound is structural rather than a judgement call.** The
  document is code-owned labels, integers and `displayName` output; only the last
  is attacker-influenceable, and `displayName` whitelists `[A-Za-z0-9._-]` and
  rewrites every other byte to `_`, so no `:`, `=`, `/` or whitespace can appear in
  it and no assignment-shaped, URL-shaped or header-shaped token can be forged into
  the file by a filename. The same sanitized basename already reaches the injected
  digest and the dream console lines, so this file adds no new CLASS of byte to any
  surface — only one more place the same bytes land. **It sits in the same window
  as the pre-promotion-window residual above and has the same discharge event,
  `WP-dream-promote-in-workspace`'s row G8**, after which the commit path is that
  spec's and what gates it is that spec's to state, not this one's. **Do NOT answer
  it here.** A carve-out or suppression in the gate is forbidden outright (Out of
  scope), and a special-case re-scan or re-stage of this one path before the
  current validator commits is the transitional canonical re-stage guard the owner
  already rejected as throwaway machinery (the pre-promotion-window residual
  above).
- **Named residual — the fixed path in an adopted vault.** A user who set
  `vault_layout.reports_dir` to somewhere outside `reports/` gets a top-level
  `reports/` directory holding just this file. Accepted for now: the alternative
  (a `<reports_dir>/warnings.md`) collides with `vault-snapshot.js`'s hardcoded
  `'reports/dreams'` newest-N scoping. A `warnings_file` layout key is the future
  fix if anyone asks for it; do not add one here.
- **The module takes no date and reads no clock.** There is no `date` argument
  anywhere in its interface any more (the run log was the only thing that wanted
  one), and `Date.now()` / `new Date()` must not appear inside it: a module whose
  output depends on the time cannot be tested for byte-exactness and would violate
  Table A's no-time-varying-content rule by accident.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item: the untrusted identifier here is a
      **transcript basename**, and it flows into a **vault file path decision** only
      through `admit`, which admits one fixed literal and nothing derived from a
      ledger key. No ledger-derived string is ever joined into a path, opened, or
      executed. The publish itself goes through `writeIntoVault`, which resolves the
      destination before judging it and refuses a symlink it can see.
- [ ] The basename flows into **file content**. Containment: every name goes through
      the existing shared sanitizer `displayName` (whitelist `[A-Za-z0-9._-]`, every
      other byte → `_`) — the same one the digest banner and the dream console lines
      use, so those surfaces can never disagree. No newline, no markdown callout and
      no heading can be forged into the document by a filename.
- [ ] No stored `reason` string is rendered (Table A), so a corrupted or
      forward-schema record cannot choose the document's bytes.
- [ ] Nothing here reads transcript **content**. The ledger holds paths,
      fingerprints and reason classes only.
- [ ] Four residuals, all named under Implementation notes: the commit may be one
      run late; **in the pre-promotion window the file's integrity level is any
      vault note's, discharged when `WP-dream-promote-in-workspace`'s row G8
      lands**; **in that same window the file's bytes reach the vault's git history
      without passing the EP2 gate** — no refresh-point write is ever in a
      `validateAndCommit` changed set (Table B's precommit-ordering row), bounded by
      `displayName`'s whitelist and discharged by the same row G8; the fixed path in
      an adopted vault with a relocated `reports_dir`.

## Acceptance criteria

- [ ] On a run whose ledger gains quarantines in several reason classes — including
      one with an unrecognized `reason`, one with a missing `reason`, and one whose
      `reason` is not a string — `reports/warnings.md` is written and matches Table
      A's document shape byte-for-byte, groups in the stated order, with the
      `secret-revert-exhausted` remediation line present and present only there.
- [ ] `over-ceiling` entries carry the size in Table A's format; an entry whose
      fingerprint is absent, malformed, negative or non-numeric renders with no size
      suffix and does not throw.
- [ ] With no quarantine at all and no file, nothing is written and no `reports/`
      directory is created (Table C row 4).
- [ ] A second dream run that changes nothing — same keys, same reasons, same
      fingerprints — with the file **present**, writes nothing: the file's bytes and
      its mtime are unchanged, and `git status` in the vault is clean (Table C row 2).
      **Its converse rides here (Table C row 1).** With the key set UNCHANGED and the
      file present, each of these two ledger changes rewrites the file to match the
      new ledger: (a) the same key re-quarantined under a DIFFERENT reason
      (`over-ceiling` → `read-error`, the transition round 1 proved reachable —
      `selectState` answers `select` on a changed fingerprint, so an
      already-quarantined file is re-selected and re-recorded under its own key);
      (b) the same `over-ceiling` key whose rendered SIZE changed.
      **And the negative case rides here too, because it is
      the same contract seen from the other side (round 2, finding 1):** a same-key
      record whose fingerprint changed in `mtimeMs`, `dev` or `ino` ONLY — nothing
      rendered moving — writes **nothing at all** (Table C row 2), because those
      components are not rendered and the trigger is the rendered content. A
      criterion demanding a rewrite on ANY fingerprint change would contradict
      Table C and force churn the no-churn property forbids.
- [ ] **Write-if-absent (Table B refresh point 3, Table C row 3).** A fully idle run
      — nothing fresh to consume, no new quarantine, no commit, i.e. the
      `sel.entries.length === 0` return at `src/cli/dream.js:467-470` — writes
      `reports/warnings.md` when the ledger holds at least one active quarantine and
      the file is absent. The written bytes match Table A for that
      ledger. The same idle run repeated
      immediately after writes nothing at all (the trigger fires at most once), the
      same idle run with the file already present writes nothing, an idle run with an
      empty quarantine set writes nothing (Table C row 4), and `--dry-run` on this
      path writes nothing.
- [ ] **The last quarantine clearing rewrites the file rather than deleting it**
      (Table C row 1): a run after which the ledger holds no active quarantine, with
      the file present, leaves `reports/warnings.md` in place holding exactly Table
      A's empty form — `No session transcripts are being skipped.` — and the file is
      never unlinked on any path.
- [ ] **Nothing on disk can reach the written bytes (Table A's nothing-carried-forward
      row; round 3, finding 1).** With arbitrary extra markdown appended to a present
      `reports/warnings.md` — a forged heading, a fabricated log section, any bytes at
      all, anywhere in the file — the next refresh replaces the file with exactly
      `composeWarnings(ledger)` and none of those bytes survive into it. Asserted
      directly on the composer as well: its output for a ledger is identical no matter
      what the file on disk contains, because it is never given the file.
- [ ] A run in which two refresh points fire — point 1 then point 2, or point 1
      then point 3 — writes at most once: the second call finds the file already
      holding the render and takes Table C row 2.
- [ ] `--dry-run` writes no vault file and leaves `git status` clean.
- [ ] A refused publish (a symlink at `reports/warnings.md`; an `expect` mismatch)
      leaves the dream exit code and every other output unchanged, prints one console
      line, and is retried on the next refresh rather than being recorded as done.
- [ ] A hostile basename (newline, `> [!warning]`, a level-2 heading line, `..`, a path
      separator) reaches the file only in `displayName` form, on one line, and cannot
      create a heading, a group, or a second section.
- [ ] Table D: a commit that includes `reports/warnings.md` does not count it as a
      note in the `dream: <date> — N notes, M skills` message, and the counts for
      every other path class are unchanged.
- [ ] Table E: `docs/GLOSSARY.md` carries the replacement sentence byte-exact and
      the **vault write** entry is otherwise unchanged.
- [ ] The vault-relative path is exported from `src/core/dream/warnings.js` as a
      single named constant, and the module reads no clock of its own.
- [ ] **One composer, of one argument, and `refreshWarnings` is one of its two
      callers (Table C's single-composer row).** `composeWarnings` is exported and
      pure: called twice with the same ledger it returns byte-equal bytes, taking
      no second argument, touching no file and reading no clock. **The agreement is
      asserted directly:** for a ledger, the bytes `refreshWarnings` publishes are
      byte-identical to `composeWarnings(ledger)` — header and Current conditions
      alike. **This is what the post-promotion commit-time render depends on**
      (`WP-dream-promote-in-workspace` row G8, third clause): a second composer
      anywhere would let the committed bytes and the written bytes disagree.
- [ ] Running the dream twice over an unchanged corpus is idempotent for this file:
      the second run writes nothing.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "^ledger: "
npm test -- --test-name-pattern "dream-validate"
npm test -- --test-name-pattern "dream-integration"
npm test
npm run lint
# Table A gate — the fixed header and every group heading exist byte-exact in the source.
node -e "const t=require('fs').readFileSync('src/core/dream/warnings.js','utf8');const need=['# Wienerdog warnings','Do not edit it','## Current conditions','No session transcripts are being skipped.','The session file is bigger than Wienerdog will read','The session file has too many lines to read','The session file could not be read','were withheld by the secret check too many times in a row','Skipped for a reason this version does not recognize'];const miss=need.filter(s=>!t.includes(s));if(miss.length){console.error('MISSING: '+miss.join(' | '));process.exit(1);}console.log('WARNINGS TEMPLATE OK');"
# Tables A + B + C gate — the module publishes through the primitive, EXPORTS the
# one fixed path as a constant (so consumers import rather than retype), reads no
# clock of its own, and the run calls it at all THREE of Table B's refresh points
# (the third is write-if-absent, on the idle-run return). The rest asserts Table
# C's single composer, which is also the rewrite trigger's operand:
# `composeWarnings` is exported, takes exactly ONE parameter — the ledger, so no
# on-disk byte, no carried snapshot and no date can enter the render (round 3's
# two findings, dissolved rather than answered) — is deterministic, MOVES on a
# same-key reason or size change and STAYS on an mtime-only one (round 1's finding
# and round 2's finding 1, the same contract from both sides), renders the
# explicit empty form rather than nothing for an empty set, emits no run-log
# section, and assembles the document at exactly ONE site in the module, which is
# what keeps the post-promotion commit-time render (row G8's third clause)
# byte-equal to what a refresh writes.
node -e "const fs=require('fs');const m=require('./src/core/dream/warnings.js');const t=fs.readFileSync('src/core/dream/warnings.js','utf8');const d=fs.readFileSync('src/cli/dream.js','utf8');const bad=[];if(!t.includes('writeIntoVault'))bad.push('does not use writeIntoVault');if(Object.values(m).filter((v)=>v==='reports/warnings.md').length!==1)bad.push('the vault-relative path is not exported exactly once as a constant');if(/Date\.now\(\)|new Date\(\)/.test(t))bad.push('reads a clock');const calls=(d.match(/refreshWarnings\(/g)||[]).length;if(calls!==3)bad.push('expected 3 refreshWarnings call sites in dream.js (Table B), got '+calls);const L=(reason,fp)=>({version:1,baseline_mtime:{claude:null,codex:null},files:{'/x/rollout-a.jsonl':{fingerprint:fp,outcome:'quarantined',reason:reason,updated_at:'2026-08-29',harness:'codex'}}});if(typeof m.composeWarnings!=='function')bad.push('composeWarnings is not exported (Table C single-composer row)');else{if(m.composeWarnings.length!==1)bad.push('composeWarnings declares '+m.composeWarnings.length+' parameters — the render must be a pure function of the LEDGER ALONE, so that no byte on disk, no carried snapshot and no date can enter it (round 3)');const R=(l)=>Buffer.from(m.composeWarnings(l)).toString('utf8');const base=R(L('over-ceiling','52428800:1:1:1'));if(!base.includes('# Wienerdog warnings'))bad.push('composeWarnings did not render the document header');if(R(L('over-ceiling','52428800:1:1:1'))!==base)bad.push('composeWarnings is not deterministic on one ledger');if(R(L('read-error','52428800:1:1:1'))===base)bad.push('a same-key REASON change does not move the render (Table C row 1)');if(R(L('over-ceiling','51404120:2:1:1'))===base)bad.push('a same-key SIZE change does not move the render (Table C row 1)');if(R(L('over-ceiling','52428800:999:1:1'))!==base)bad.push('an mtime-only fingerprint change MOVES the render (round 2, finding 1 — mtime renders nothing)');const empty=R({version:1,baseline_mtime:{claude:null,codex:null},files:{}});if(!empty.includes('No session transcripts are being skipped.'))bad.push('an empty quarantine set does not render the explicit empty form — a cleared quarantine must rewrite the file to say so, never blank it or delete it (Table C row 1)');if(/## Run log|started being skipped/.test(base+empty))bad.push('the render still emits a run-log section — dropped, owner-ruled 2026-08-30');}const heads=(t.match(/# Wienerdog warnings/g)||[]).length;if(heads!==1)bad.push('the document header literal occurs '+heads+' time(s) in warnings.js — ONE composer means ONE assembly site (Table C single-composer row)');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('WARNINGS WIRING OK');"
# Table E gate — the replacement sentence occurs exactly once (whitespace-flattened,
# so a hard wrap cannot hide it) and the old one is gone. The literal travels through
# a quoted heredoc, so no inline-quoting accident can change what is matched.
cat > /tmp/vault-write-sentence.txt <<'LITERAL'
Three writers use it and no others: each promoted note; the dream report (whose body the brain authors and to which code appends its accounting section, so that one is two calls); and the vault warnings file (`reports/warnings.md`), which code writes whole from the transcript quarantine ledger.
LITERAL
node -e "const fs=require('fs');const flat=(s)=>s.replace(/\s+/g,' ').trim();const t=flat(fs.readFileSync('docs/GLOSSARY.md','utf8'));const s=flat(fs.readFileSync('/tmp/vault-write-sentence.txt','utf8'));const n=t.split(s).length-1;const bad=[];if(n!==1)bad.push('EXPECTED 1 OCCURRENCE, GOT '+n);if(t.includes('Two writers use it and no others'))bad.push('the superseded sentence is still present');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('GLOSSARY SENTENCE OK');"
# Table A gate — the dream skill must NOT learn about this file.
test -f skills/wienerdog-dream/SKILL.md && ! grep -q 'warnings.md' skills/wienerdog-dream/SKILL.md
```

- The last four are NEW steps and each is an ASSERTION: it exits non-zero on
  failure rather than printing something a reader must judge. Paste a real green on
  the finished state AND a real red from a deliberately broken state (one heading
  reworded; a `Date.now()` added to the module; a refresh call site deleted from
  `dream.js`; a `composeWarnings` narrowed to the key list, so a reason or size
  change no longer moves the render — the round-1 defect itself; a
  `composeWarnings` widened to the whole fingerprint, so an mtime-only change
  moves it — round 2's finding 1; a `composeWarnings` given a second parameter,
  which is how an on-disk byte gets back into the render — round 3's finding 1;
  a `composeWarnings` that returns nothing for an empty set instead of the
  explicit empty form; `composeWarnings` unexported, or a second
  assembly of the header added to the module; the GLOSSARY
  sentence reworded;
  `warnings.md` mentioned in the dream SKILL.md), so a check that cannot fail is
  caught before anyone believes it. The deliverable-absent case is guarded: the two
  node gates throw on a missing file, and the negated grep is preceded by `test -f`.

## Out of scope (do NOT do these)

- Changing `quarantineBannerLine` or anything the digest renders —
  `WP-quarantine-banner-decay`, which depends on this package.
- Changing anything `wienerdog doctor` prints — `WP-doctor-quarantine-counts`,
  which depends on this package and consumes the path constant it exports.
- The dream report's per-run skip accounting — `WP-dream-report-run-skips`.
- Any second git commit, or moving `validateAndCommit`'s commit (ADR-0012).
- Any carve-out, suppression or path exemption in the EP2 secret gate, the Tier
  gates, or `validate.js` Step 2 — Table D is a counting change and nothing more.
- A `warnings_file` key in `src/core/layout.js`, or any change to `LAYOUT_KEYS`.
- Refreshing this file from `wienerdog sync`, `doctor`, or any command other than
  `dream`: **neither of those commands may write vault content at all.** `doctor`
  is diagnostic and never mutates — the invariant its own file states at
  `src/cli/doctor.js:60-61`, `:367-368` and `:406`, and the reason
  `WP-doctor-quarantine-counts` probes this path read-only instead of healing it —
  and `sync` reads the vault to render the digest and the managed block rather
  than writing into it. Table B's three refresh points, all inside the dream run,
  are the only writers. (An earlier form of this bullet reasoned from "only the
  dream run knows the before/after ledger a delta needs"; the 2026-08-30 run-log
  ruling deleted that model — there is no delta, only a byte comparison against
  the file (Table C) — so the exclusion now rests on the reason that survives it.)
- Any way to *clear* a quarantine — `WP-quarantine-review-cli`, named in ADR-0023
  Amendment 1 and not shipped.
- Re-opening ADR-0023's intake ceiling, fingerprint, selection rule, or Amendment
  1's sticky `secret-revert-exhausted` skip.

## Definition of done

0. **DISPATCH PRECONDITION.** ADR-0023's Amendment 2 (2026-08-29) carries the
   owner's hand-written `Status: **ACCEPTED — OWNER-SIGNED <date>.**` line in
   place of its `PROPOSED` line. This package has no work-package dependency: it
   is the family's root, and its three siblings depend on it. **A fourth dependent
   sits outside this epic:** `WP-dream-promote-in-workspace` now carries
   `depends_on: WP-quarantine-warnings-file`, because its row G8 reconciles the
   file this package creates into every dream commit — rendering it with this
   package's `composeWarnings` — once its row G6 removes
   `precommitSessionEdits` (the uncommitted-until-next-run residual above). That
   changes nothing here — this package still ships first and is dispatchable
   today — but it is why this spec must land before that one.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): write a durable quarantine warnings file into the vault (WP-quarantine-warnings-file)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
