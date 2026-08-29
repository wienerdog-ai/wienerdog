---
id: WP-quarantine-warnings-file
title: Give quarantines a durable home in the vault — a code-owned `reports/warnings.md`
status: Draft
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
git-versioned by design, so a file that changes **exactly** when the quarantine set
changes (plus one reconciliation write when the file is missing — Table B's
refresh point 3) gives the user a permanent, diffable record the managed block can
never give. This package builds that file.

**It is the family's root, because the enumeration has exactly one home and this
is it.** ADR-0023 Amendment 2 states the principle: the full list of quarantined
transcripts lives here and nowhere else, and every other surface — the digest
banner, `wienerdog doctor`, the dream report — carries **exact counts and a
pointer to this file**, never a list. So all three of this package's siblings
point at what it builds, and all three depend on it:
`WP-doctor-quarantine-counts`, `WP-quarantine-banner-decay` and
`WP-dream-report-run-skips`. **Nothing here may be softened on the assumption that
another surface also carries the names — none of them does.**

**The file is code-owned and carries the banner's trust construction.** It is
generated from the ledger alone: `displayName`-sanitized basenames plus code-owned
labels. Never transcript content, never a full path, never a stored reason string,
and never brain-writable — the dream's model does not know this file exists.

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
| create | src/core/dream/warnings.js | renders the file (**Table A**) and performs one refresh (**Tables B, C**); pure of policy beyond Table C's `admit`. **Exports the vault-relative path as a constant** — Table A's path row — which `WP-doctor-quarantine-counts` imports rather than retyping |
| modify | src/core/dream/ledger.js | **one addition only:** an exported reader that yields the quarantine size, per **Table A**'s size row. `activeQuarantines`, `quarantineBannerLine`, `displayName` and every record-writing function keep their exact current behaviour and signatures |
| modify | src/cli/dream.js | the run-start snapshot and the **three** refresh call sites **Table B** names. Nothing else in the run changes |
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
/** Refresh the vault warnings file for one moment of one dream run. Reads the
 *  file, decides per Table C, and publishes through writeIntoVault. Never
 *  throws: every failure is reported by return.
 *  @param {{vaultDir:string, ledger:object, previous:Set<string>, date:string}} o
 *    previous  the quarantine key set as of the last successful refresh in this
 *              process (Table B row 1 supplies the run-start value)
 *    date      'YYYY-MM-DD', the run's date — the ONLY clock this module reads
 *  @returns {{written:boolean, current:Set<string>, reason?:string}}
 *    current   the set the caller must carry forward as `previous` — the NEW set
 *              on a successful write, and the UNCHANGED `previous` otherwise, so
 *              a refused write is retried at the next refresh */
function refreshWarnings(o)
```

A worked file, rendered in full. Two `over-ceiling` records (sizes 52 428 800 and
51 404 120) and one `read-error` record, on a vault whose earlier run log has one
entry:

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

## Run log

- 2026-08-17 — 191 session transcript(s) started being skipped; 0 stopped.
- 2026-08-29 — 3 session transcript(s) started being skipped; 191 stopped.
```

The same file once every quarantine has cleared (the Run log is what makes this
state meaningful rather than empty):

```markdown
# Wienerdog warnings

Wienerdog writes this file itself, from its own record of which session
transcripts it could not read. Do not edit it — it is rewritten whenever the list
below changes.

## Current conditions

No session transcripts are being skipped.

## Run log

- 2026-08-17 — 191 session transcript(s) started being skipped; 0 stopped.
- 2026-08-29 — 3 session transcript(s) started being skipped; 191 stopped.
- 2026-09-02 — 0 session transcript(s) started being skipped; 3 stopped.
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
| Document shape | the two literal worked examples under "Exact contracts" ARE the shape: `# Wienerdog warnings`, the fixed two-sentence header paragraph byte-for-byte as shown, `## Current conditions`, the block below, `## Run log`, the entries. Exactly one blank line between every block; the file ends with exactly one `\n` |
| Current conditions, empty | the single line `No session transcripts are being skipped.` |
| Current conditions, non-empty | one `### <heading> — <N>` per non-empty reason group, in the row order of the next table, each followed by a blank line and one markdown list entry per member |
| Which records are members | every entry of `ledger.files` that is a plain object with `outcome === 'quarantined'`. Nothing else |
| Name shown | `displayName(key)` output and nothing else — never a full path, never content |
| **No stored `reason` string is ever rendered** | the unrecognized group uses a fixed heading. `readLedger` deliberately does not validate individual records, so rendering a stored string would let stored data choose the document's bytes |
| Size (`over-ceiling` group only) | the fingerprint's first `:`-separated field as an integer, rendered as the suffix `— <X.X> MB (<bytes> bytes)` after an em-dash-spaced separator, with `X.X` = `bytes / 1048576` to one decimal. Absent, non-numeric, negative or not a safe integer → the entry renders with **no** size suffix |
| Sort within a group | by `displayName` ascending; equal names render identical text, so the bytes are deterministic either way |
| **Nothing time-varying may appear above `## Run log`** | no timestamp, no run count, no "last checked". This is what makes "an existing file's bytes change exactly when the set changes" true (the one other write is Table C row 3's write-if-absent reconciliation, which by definition has no existing bytes to churn), and Table C's no-op rule depends on it |
| Run log entry | `- <date> — <E> session transcript(s) started being skipped; <L> stopped.` where `<date>` is the run's `date` argument, `<E>` is the size of `entered` and `<L>` the size of `left`. No reason breakdown: the Current conditions block in the **same commit** carries the grouping, and one label map is one thing to keep in sync instead of two |
| Run log order | append-only, oldest first; the new entry goes last. Two runs on one date make two entries |
| How the existing log survives a rewrite | everything after the **first** line whose entire content is `## Run log`, with leading blank lines stripped, is carried through verbatim. That marker line absent (file missing, or a user mangled it) → the carried log is empty |

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
| Run-start snapshot | taken from the ledger at `src/cli/dream.js:375`, immediately after `migrateFromWatermarks` and before `collectExtracts`. Migration seeds only `baseline_mtime`, never a `files` record, so taking it before or after is identical — after is stated so there is one answer |
| Refresh point 1 | inside the `sel.newlyQuarantined.length > 0 && !dryRun` block at `:443-447`, immediately after the existing `regenerateDigest()` call. **This is the point that serves the adopt-with-history first run**, whose "nothing fresh" return at `:467-470` never reaches point 2's neighbourhood with a commit. That run then also passes point 3 on its way out, which is a no-op because point 1 has just written the file |
| Refresh point 2 | immediately after the existing final `regenerateDigest()` at `:625`. This is the only point at which a quarantine that **left** the set, or a `secret-revert-exhausted` quarantine that **entered** it at `:604`, is knowable |
| Refresh point 3 — **write-if-absent** | immediately before the `return` inside step 7's `sel.entries.length === 0` block (`:467-470`), guarded by `!dryRun`. A **fully idle** run — nothing fresh to consume, no new quarantine, no commit — reaches neither point 1 (guarded by `sel.newlyQuarantined.length > 0`) nor point 2 (past this return), so without this call site an install whose quarantines are all **pre-existing** never gets the file at all until the set happens to change. Table C row 3 already decides what this call does: it writes only when the file is absent and the current set is non-empty, and it appends no run-log entry |
| Why point 3 exists at all (owner-ruled 2026-08-29) | `WP-doctor-quarantine-counts` ships a byte-gated message promising *"that file is not there yet; the next dream run writes it"*. Without a write-if-absent trigger that promise is false for an idle run, which is exactly the upgrade shape: 191 historical quarantines already in the ledger, quiet nights, no file. The owner ruled the mechanism in rather than hedging the message |
| Why these three, and no others | points 1 and 2 are already the two points at which the run refreshes its other ledger-derived durable surface, `state/digest.md` — one rule, two surfaces, nothing that can drift out of step. Point 3 is **not** a set-change point and refreshes nothing else: it is a reconciliation on the one run shape that reaches neither of the others. The capacity-wedge path (`:451-464`) is not a refresh point — it throws |
| Carrying the set forward | the caller keeps one mutable snapshot, seeded at run start and replaced by each call's returned `current`. A second refresh in the same run therefore sees an empty delta and writes nothing. Points 2 and 3 are mutually exclusive (point 3 returns from the run); the reachable pairing is point 1 then point 2, or point 1 then point 3, and in both the second call is a no-op unless the first was refused |
| Dry run | writes nothing. Point 1 is already inside a `!dryRun` guard; point 2 is unreachable on a dry run (`:474-477` returns first); **point 3 needs an explicit `!dryRun` guard** — step 7's return at `:467-470` comes BEFORE step 8's dry-run return, so it is reachable on a preview run. That guard is the one new guard this package adds |
| A refresh failure never fails the dream | `refreshWarnings` never throws, and a `written:false` result prints one `wienerdog: dream — …` console line and is otherwise ignored. The ledger still holds the condition, `doctor` still reports the counts, and the digest banner still raises it — what is lost is the enumeration, until the next refresh |

### Table C — the write decision

Let `entered = current \ previous` and `left = previous \ current`, over the sets
of `ledger.files` **keys** whose record is a plain object with `outcome ===
'quarantined'`.

| `entered`/`left` | File on disk | Action |
|---|---|---|
| either non-empty | absent or present | **write**, with a new run-log entry |
| both empty | present | **no write at all** — this is "a run that changes nothing appends nothing" |
| both empty | absent, and the current set is **non-empty** | **write**, with **no** run-log entry — this is **write-if-absent**, the reconciliation Table B's refresh point 3 exists to reach (a lost, deleted, refused or never-written file) |
| both empty | absent, and the current set is **empty** | **no write** — a vault that has never had a quarantine gets no file |

| Fact / rule | Value |
|---|---|
| Publish call | `writeIntoVault({vaultDir, rel: 'reports/warnings.md', bytes, admit, expect})` — this package is that primitive's first production caller |
| `admit` | admits the resolved vault-relative path `reports/warnings.md` and **nothing else**; every other value returns a refusal reason. The policy is the caller's by the primitive's contract |
| `expect` | the exact bytes read from the file immediately before composing, when the read succeeded; **omitted** when the read failed with ENOENT. Never `null` — the primitive rejects it |
| A read failure that is not ENOENT | no write, `{written:false, reason}`. Never guess at the file's content |
| `previous` on a refused write | unchanged, so the next refresh retries — that is why `current` is a return value and not an argument the module mutates |
| **An EXISTING file is still rewritten only when the set changes** | row 2. Write-if-absent adds a trigger for the **absent** case only, so the no-churn property is untouched: a file on disk changes its bytes and its mtime exactly when the quarantine set changes, and a run that changes nothing leaves it alone |
| **Write-if-absent fires at most once** | its own write makes the file present, so the very next idle run takes row 2 and writes nothing. It fires again only if the file goes missing again |
| **A write-if-absent write appends NOTHING to the run log** | the set did not change, so there is no delta to record and the append-only log stays delta-only. A reader who sees Current conditions with no matching Run log entry is looking at a reconciliation, which is correct |
| What a deleted file costs | Table A's carry rule: the `## Run log` marker is gone with the file, so the reconciliation starts a fresh, empty log. The Current conditions block is fully re-derivable from the ledger; the historical deltas are not, and they are not reconstructed |

### Table D — the validator's note count

| Fact / rule | Value |
|---|---|
| The problem | `src/core/dream/validate.js:1427-1429` counts a committed path as a `note` unless it is under `layout.skills_dir` or `layout.reports_dir`. `reports/warnings.md` is under neither, so a run that changes it reports one extra note in `dream: <date> — N notes, M skills` |
| The change | one added condition that excludes exactly the literal `reports/warnings.md` from `notes`, alongside the existing `reports_dir` exclusion. Nothing is reclassified as a skill, no other step is touched |
| Not changed | the file is still committed, still classified by Step 2's branch (c) at `:1208` ("keep"), and still scanned by the EP2 gate. This is a **counting** fix only |

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
      criterion that asserts Table B's point 3 with Table C's row 3
- [ ] Verification commands (the header/heading gate asserts Table A; the wiring
      gate asserts Table A's path row and Table B's three call sites; the GLOSSARY
      gate asserts Table E)
- [ ] Current-state description (the ledger shape, `writeIntoVault`'s contract, the
      `dream.js` line ranges — including `:467-470`, where point 3 goes — and the
      validator's counting loop)
- [ ] The two literal worked files under "Exact contracts" (they ARE Table A rendered)
- [ ] Implementation notes (the EP2 residual, the uncommitted-until-next-run
      residual, the adopted-vault path residual)
- [ ] Security checklist (the sanitizer sentence and the three residuals)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **The dream's model never learns this file exists.** Do not mention it in
  `skills/wienerdog-dream/SKILL.md`; do not add it to any prompt. It is code-owned,
  and the brain writing into it would destroy the trust construction that makes it
  safe to point the user at.
- **Named residual — the file can ride the next run's commit rather than this
  one's.** Refresh point 2 is after `validateAndCommit`, and the adopt-with-history
  run returns at `:467-470` with no commit at all. In both cases the file sits
  uncommitted in the vault until the next run's `precommitSessionEdits(vaultDir)`
  (`:507`) sweeps it in. The *diff* is still exactly right — it just lands one
  commit late. Do not add a second commit: ADR-0012 fixes one dream run to one
  commit.
- **Named residual — refresh point 1 is inside the EP2 window.** A file written at
  point 1 on a run that goes on to commit is staged before Step 3's secret gate and
  is scanned like any other change. Its content is code-owned labels, integers,
  dates and `displayName` output; only the last is attacker-influenceable, and a
  basename that tripped an entropy rule would cost a redaction or a withhold **of
  Wienerdog's own warnings file** — non-destructive (the ledger is untouched,
  `doctor` still reports the counts) and self-healing at the next set change. Do NOT
  carve this path out of the gate; a gate exemption is a much worse trade than a
  named residual.
- **Named residual — the fixed path in an adopted vault.** A user who set
  `vault_layout.reports_dir` to somewhere outside `reports/` gets a top-level
  `reports/` directory holding just this file. Accepted for now: the alternative
  (a `<reports_dir>/warnings.md`) collides with `vault-snapshot.js`'s hardcoded
  `'reports/dreams'` newest-N scoping. A `warnings_file` layout key is the future
  fix if anyone asks for it; do not add one here.
- The `date` argument is the run's date, already computed in `dream.js`. **Do not
  read a clock inside the module** — a module whose output depends on
  `Date.now()` cannot be tested for byte-exactness and violates Table A's
  no-time-varying-content rule by accident.
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
- [ ] Three residuals, all named under Implementation notes: the commit may be one
      run late; refresh point 1 is inside the EP2 window; the fixed path in an
      adopted vault with a relocated `reports_dir`.

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
- [ ] A second dream run that changes nothing, with the file **present**, writes
      nothing: the file's bytes and its mtime are unchanged, and `git status` in the
      vault is clean (Table C row 2).
- [ ] **Write-if-absent (Table B refresh point 3, Table C row 3).** A fully idle run
      — nothing fresh to consume, no new quarantine, no commit, i.e. the
      `sel.entries.length === 0` return at `src/cli/dream.js:467-470` — writes
      `reports/warnings.md` when the ledger holds at least one active quarantine and
      the file is absent. Its Current conditions block matches Table A for that
      ledger, and **no** run-log entry is appended. The same idle run repeated
      immediately after writes nothing at all (the trigger fires at most once), the
      same idle run with the file already present writes nothing, an idle run with an
      empty quarantine set writes nothing (Table C row 4), and `--dry-run` on this
      path writes nothing.
- [ ] A run in which a quarantine **leaves** the set rewrites Current conditions and
      appends an entry whose `stopped` count is exact; a run in which one enters and
      one leaves reports both counts in one entry.
- [ ] The existing Run log survives every rewrite verbatim, including when Current
      conditions collapses to the empty line; a file whose `## Run log` marker line
      has been removed by hand is rewritten with an empty carried log rather than
      throwing.
- [ ] A run in which two refresh points fire — point 1 then point 2, or point 1
      then point 3 — produces exactly one run-log entry (Table B, carrying the set
      forward).
- [ ] `--dry-run` writes no vault file and leaves `git status` clean.
- [ ] A refused publish (a symlink at `reports/warnings.md`; an `expect` mismatch)
      leaves the dream exit code and every other output unchanged, prints one console
      line, and is retried on the next refresh rather than being recorded as done.
- [ ] A hostile basename (newline, `> [!warning]`, a `## Run log` line, `..`, a path
      separator) reaches the file only in `displayName` form, on one line, and cannot
      create a heading, a group, or a second Run log section.
- [ ] Table D: a commit that includes `reports/warnings.md` does not count it as a
      note in the `dream: <date> — N notes, M skills` message, and the counts for
      every other path class are unchanged.
- [ ] Table E: `docs/GLOSSARY.md` carries the replacement sentence byte-exact and
      the **vault write** entry is otherwise unchanged.
- [ ] The vault-relative path is exported from `src/core/dream/warnings.js` as a
      single named constant, and the module reads no clock of its own.
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
node -e "const t=require('fs').readFileSync('src/core/dream/warnings.js','utf8');const need=['# Wienerdog warnings','Do not edit it','## Current conditions','## Run log','No session transcripts are being skipped.','The session file is bigger than Wienerdog will read','The session file has too many lines to read','The session file could not be read','were withheld by the secret check too many times in a row','Skipped for a reason this version does not recognize','session transcript(s) started being skipped'];const miss=need.filter(s=>!t.includes(s));if(miss.length){console.error('MISSING: '+miss.join(' | '));process.exit(1);}console.log('WARNINGS TEMPLATE OK');"
# Tables A + B + C gate — the module publishes through the primitive, EXPORTS the
# one fixed path as a constant (so consumers import rather than retype), reads no
# clock of its own, and the run calls it at all THREE of Table B's refresh points
# (the third is write-if-absent, on the idle-run return).
node -e "const fs=require('fs');const m=require('./src/core/dream/warnings.js');const t=fs.readFileSync('src/core/dream/warnings.js','utf8');const d=fs.readFileSync('src/cli/dream.js','utf8');const bad=[];if(!t.includes('writeIntoVault'))bad.push('does not use writeIntoVault');if(Object.values(m).filter((v)=>v==='reports/warnings.md').length!==1)bad.push('the vault-relative path is not exported exactly once as a constant');if(/Date\.now\(\)|new Date\(\)/.test(t))bad.push('reads a clock');const calls=(d.match(/refreshWarnings\(/g)||[]).length;if(calls!==3)bad.push('expected 3 refreshWarnings call sites in dream.js (Table B), got '+calls);if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('WARNINGS WIRING OK');"
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
  `dream.js`; the GLOSSARY sentence reworded;
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
  `dream`: only the dream run knows the before/after ledger a delta needs.
- Any way to *clear* a quarantine — `WP-quarantine-review-cli`, named in ADR-0023
  Amendment 1 and not shipped.
- Re-opening ADR-0023's intake ceiling, fingerprint, selection rule, or Amendment
  1's sticky `secret-revert-exhausted` skip.

## Definition of done

0. **DISPATCH PRECONDITION.** ADR-0023's Amendment 2 (2026-08-29) carries the
   owner's hand-written `Status: **ACCEPTED — OWNER-SIGNED <date>.**` line in
   place of its `PROPOSED` line. This package has no work-package dependency: it
   is the family's root, and its three siblings depend on it.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): write a durable quarantine warnings file into the vault (WP-quarantine-warnings-file)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
