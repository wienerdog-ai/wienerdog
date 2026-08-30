---
id: WP-quarantine-banner-decay
title: Collapse the quarantine banner to an exact count and a pointer, on a 7-day window
status: In-Review
model: opus
size: M
depends_on: [WP-quarantine-warnings-file]
adrs: [ADR-0004, ADR-0023]
epic: quarantine-surface
---

# WP-quarantine-banner-decay: the digest stops carrying the list and starts carrying the count

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** This package adds **no state**: no
acknowledgement record, no new file, no CLI verb, no timer, no daemon. The
behaviour it introduces is computed at render time from a field the ledger
already writes.

Every AI session is bootstrapped with an injected **digest** —
`<core>/state/digest.md`, also embedded in the **managed block** of
CLAUDE.md/AGENTS.md. Its budget is hard: `DigestCaps` in `src/core/digest.js:24-31`
allows **32 KB** and **120 lines**. Ahead of the digest body sits a fixed-order
prefix of code-owned banner blocks (identity exclusions, failure alerts, the
transcript-quarantine banner, the staged-output secret quarantine, insecure modes,
scheduler status, update availability), joined at `digest.js:833-838`. The prefix
is **never truncated**: `capDigest` reserves its lines and its bytes first and cuts
the body instead.

**The defect.** ADR-0023 made the transcript-quarantine banner **enumerate every
quarantined file inline**, with no bound on count and no end date. Measured on the
maintainer's 0.13.0 install (2026-08-29): 191 historical Codex sessions
legitimately quarantined `over-ceiling` rendered as **one line of 16,805 bytes —
73% of a 22,986-byte digest**. The caps cannot help: the banner is *one line*, so
the 120-line cap never reaches it, while the 32 KB cap is spent on it and the
payload the digest exists to carry is what gets truncated — in every session, in
both harnesses. Worse, `over-ceiling` on a **closed historical session** is
permanent by construction (Codex never prunes session files; a closed >50 MB
rollout never changes its fingerprint), so ADR-0023's "retried when it changes" is
moot and even a collapsed count-banner would sit in every digest forever, training
the banner-blindness that damages the banners that *are* actionable.

**ADR-0023 Amendment 2 (2026-08-29)** resolves it by separating an EVENT
(something entered quarantine — news, and news belongs in the digest for a bounded
window) from STANDING STATE (things are in quarantine — a durable coverage fact
belonging in pull-based surfaces). Amendment 2 also fixes where the *list*
lives: **the full enumeration has exactly ONE home, `reports/warnings.md` in the
vault, and every other surface carries exact counts and a pointer to it.** The
pointer promises only what that file can name, and **this banner's counts are
quarantine counts only** — every one of which the file names — so the exception
cannot arise here. (It arises in exactly one sibling: the dream report also counts
capacity-deferred transcripts, which carry no ledger record, and a section whose
only non-zero count is that one carries no pointer. The condition is owned by
`WP-dream-report-run-skips`'s Table A pointer row, cited and not restated.) That is
why the new sentence names one destination and not two. `wienerdog doctor`
(`WP-doctor-quarantine-counts`) also reports counts and also points at that file,
so naming it here would spend digest bytes sending the reader to a second surface
that answers the question the banner just answered. The banner points at the one
place that answers the question it cannot.

`WP-quarantine-warnings-file` must therefore be `Done` before this package ships,
because **a banner must never name a surface that does not do the thing** — the
rule this repo already follows in `ledger.js`'s comment on the exhausted sentence,
which deliberately names no command because none exists.

**The anti-silent-drop invariant survives, by different means.** The count stays
**exact**, the enumeration moves to a surface that is *more* durable than the
banner ever was, and the one **actionable** reason class keeps its permanent,
verbatim banner. A decaying banner is only ever correct for a condition the user
cannot act on.

## Current state

Every line number in this section was re-measured against `main` at `8f93bc4`
on 2026-08-30. Each citation is paired with the anchor text it points at, so a
number that has shifted again is re-derivable by searching for that anchor —
never by applying an offset to the number.

### `src/core/dream/ledger.js`

```js
function displayName(absPath)          // :319 basename of the case-folded path, whitelisted to [A-Za-z0-9._-]
function activeQuarantines(ledger)     // :328 → Array<{file, reason, harness}>, sorted by file
function quarantineSizeBytes(rec)      // :351 → number|null; reads no clock, NOT touched here
function quarantineBannerLine(ledger)  // :367 → string; '' when no quarantine is active
const SECRET_REVERT_EXHAUSTED_REASON   // :21  = 'secret-revert-exhausted'
```

`quarantineBannerLine` today partitions `activeQuarantines(ledger)` into two
buckets on `reason !== SECRET_REVERT_EXHAUSTED_REASON` and emits up to two
`> [!warning] Wienerdog: …` sentences joined by `'\n\n'`, intake first:

```js
  if (intake.length > 0) {
    lines.push(
      `> [!warning] Wienerdog: ${intake.length} session transcript(s) could not be read and were skipped — ` +
        `${intake.map((e) => `${e.file} (${e.reason})`).join(', ')}. Dreaming continues over your other sessions; ` +
        'a skipped file is retried automatically if it changes.'
    );
  }
```

`${intake.map(...).join(', ')}` is the unbounded enumeration, and it is the only
place a **ledger**-stored `reason` string is rendered into the injected digest.
(Two other prefix blocks render a `reason` of their own — the failure-alert block
from `alerts.json` at `digest.js:490-493`, and the identity-exclusion banner's
code-owned exclusion enum at `digest.js:799`. Neither is this ledger's and
neither is touched here; they are named only so this claim can be re-run without
a false hit.)

The record typedef (`:58-66`) already carries `updated_at:string` — an ISO
timestamp written by every recording function (`recordProcessed` `:256`,
`recordQuarantined` `:269`, `recordSecretDeferred` `:293`, `recordSecretExhausted`
`:308`). **Nothing reads it today.** No new field, and no new file, is needed for
this package.

### Callers

Exactly two, both passing the ledger and nothing else, both unchanged by this
package:

- `src/cli/dream.js:392` — `const quarantineLine = ledgerLib.quarantineBannerLine(ledger);` inside `regenerateDigest`, consumed at `:397` (`quarantineLine,` in the `renderDigest` options object).
- `src/cli/sync.js:288` — `quarantineLine: ledgerLib.quarantineBannerLine(ledgerLib.readLedger(paths.state)),`

`src/core/digest.js` takes the finished string as `opts.quarantineLine`
(typedef `:633-639`) and splices it into the prefix at position 3 (`:833-838`). It
does not know what is in it and needs no change.

### Tests that pin the current banner

- `tests/unit/ledger.test.js:454` `quarantineBannerLine reproduces the intake banner byte for byte`; `:469` the exhausted sentence; `:489` both sentences, intake first; `:501` an unrecognized reason lands in the intake sentence.
- `tests/unit/ledger.test.js:265` `adding the size reader left activeQuarantines and the banner exactly as they were` also calls `quarantineBannerLine`, but only to assert that a byte string is ABSENT from it. Its record is written by `recordQuarantined`, so its `updated_at` is `now` and the informational sentence still renders. **It passes unchanged and is not edited by this package** — do not touch it.
- `tests/unit/sync-digest-quarantine.test.js:86` `sync re-renders BOTH transcript-quarantine banners into the digest`; `:113`; `:134`.
- `tests/integration/dream.test.js:758` `an over-ceiling transcript is quarantined while the valid neighbour is consolidated` (its banner assertion is `:801`); `:806` `a quarantine-only run records + banners + exits 0; unchanged not retried; changed retried`; `:997` `a hostile quarantined filename reaches the banner and console only in sanitized form`, **whose premise this package changes**: after it, no filename reaches the banner at all.
- `tests/unit/digest.test.js:184`, `:192`, `:1101` carry the old banner text as *literal inputs* to `renderDigest`. They still pass unchanged, but they would stand as stale examples of a banner shape that no longer exists.

### Golden fixtures

`grep -rl "quarantine" tests/golden` finds **nothing**: no golden fixture contains
banner text. `tests/golden/digest-default.md` is the **no-banner** reference —
every banner test asserts the golden stays byte-identical when the banner is empty
and equals `` `${line}\n\n${golden}` `` when it is not. **No golden fixture is
edited by this package, and that is an acceptance criterion, not an omission.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/ledger.js | `quarantineBannerLine` per **Tables A, B, C**, plus the two new exported constants **Table B** names. `activeQuarantines`, `displayName`, `selectState`, `secretDeferralCount`, `quarantineSizeBytes` and every recording function keep their exact current behaviour and signatures |
| modify | tests/unit/ledger.test.js | the four banner tests named under Current state, plus the new decay cases |
| modify | tests/unit/sync-digest-quarantine.test.js | its fixture records need a `updated_at` inside the window for the intake banner to render (**Table B**) |
| modify | tests/integration/dream.test.js | the banner assertions, including the changed premise of the hostile-filename test |
| modify | tests/unit/digest.test.js | **the three literal banner strings only** (`:184`, `:192`, `:1101`) — replace them with **Table A**'s shape so they stop standing as examples of a withdrawn format. Assert nothing about `quarantineBannerLine` here; that is `ledger.test.js`'s |

`docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md` is **not** a
deliverable: Amendment 2 is written by the architect and is on `main` before this
package is dispatched (Definition of done item 0 gates on its owner signature),
and nothing in it is authored or revised by the implementer.

If a further file appears necessary, that is a finding, not a fix: record it under
"Discovered issues" in the PR body.

### Exact contracts

```js
/** @param {Ledger} ledger
 *  @param {{now?:number}} [opts]  epoch ms; defaults to Date.now(). The ONLY
 *    clock this function reads, and the seam its tests need
 *  @returns {string} '' when nothing renders */
function quarantineBannerLine(ledger, opts)
```

Both existing callers keep passing one argument and get today's behaviour with a
live clock — no call site changes.

The two sentences, byte-exact. These literals are the single place these bytes are
decided:

```text
informational: > [!warning] Wienerdog: <N> session transcript(s) are being skipped and will not be dreamed over. Which ones, and why: reports/warnings.md in your vault. Dreaming continues over your other sessions; a skipped file is retried automatically if it changes.
```

The **actionable** sentence is byte-identical to today's — reproduce it from the
`lines.push(...)` call inside `quarantineBannerLine`'s `if (spent.length > 0)`
branch, **`src/core/dream/ledger.js:386-392`**, unchanged, including its
enumeration, its `state/quarantine/` instructions, and its deliberate silence
about any command. The comment that explains that silence is `:381-385` and is
also kept. (Search for the anchor `'The withheld copies are in state/quarantine/:'`
if these numbers have shifted again — the literal is the contract, not the range.)

Worked examples. 191 `over-ceiling` records, the newest recorded 2 days ago, `now`
= 2026-08-29:

```text
> [!warning] Wienerdog: 191 session transcript(s) are being skipped and will not be dreamed over. Which ones, and why: reports/warnings.md in your vault. Dreaming continues over your other sessions; a skipped file is retried automatically if it changes.
```

The same 191 records, every one recorded more than 7 days ago, and no other
quarantine: the function returns the empty string. The same 191 records **plus**
one `secret-revert-exhausted` record: the informational sentence is gone and only
the actionable sentence renders, alone.

## Contract reference

Activation (ADR-0031, 2-of-7): **(i)** the emitted banner's shape changes;
**(ii)** a reason **class** taxonomy is introduced over the existing reason enum;
**(iv)** the render decision gains a precedence/fallback rule on an unreadable
timestamp; **(vii)** the same facts are mirrored across the Deliverables cells,
the acceptance criteria and the verification gates.

The **reason enum's** canonical source is `src/core/dream/ledger.js` (typedef
`:58-66`). Table A maps it onto **classes**, which is a different fact from the
per-surface label maps owned by `WP-doctor-quarantine-counts` and
`WP-quarantine-warnings-file`; those two render text, this one renders a decision.

### Table A — reason classes and what each one gets

| Reason (from `ledger.js`) | Class | Which sentence | Decays? |
|---|---|---|---|
| `over-ceiling` | informational | the informational sentence | **yes** |
| `too-many-lines` | informational | the informational sentence | **yes** |
| `read-error` | informational | the informational sentence | **yes** |
| `secret-revert-exhausted` | actionable | the actionable sentence, verbatim and unchanged | **never** |
| anything else (incl. a missing or non-string `reason`) | unrecognized | counted in, and rendered by, the informational sentence | **never** |

| Fact / rule | Value |
|---|---|
| Why `read-error` is informational | owner decision, 2026-08-29 (ADR-0023 Amendment 2 §3). The counter-argument — that a read failure may be a fixable local problem — was considered and the informational classification chosen; a genuinely actionable read failure surfaces through `wienerdog doctor` and `reports/warnings.md`, neither of which decays |
| Why unrecognized never decays | fail-loud. A future reason class must not be retired by old code that assumed it was informational. It is still *counted* with the informational group, so it can never be silently dropped |
| Which records are members | every entry of `ledger.files` that is a plain object with `outcome === 'quarantined'` — the set `activeQuarantines` already selects. `processed` and `deferred` records are not quarantines |
| The count `<N>` | the **exact total** of ALL informational **and** unrecognized active quarantines — not just the fresh ones, not a rounded or capped number. This is what carries the anti-silent-drop invariant |
| **No name and no stored `reason` reaches the informational sentence** | it is built from one integer and fixed code-owned text. The actionable sentence keeps its existing `displayName` enumeration, which is bounded in practice by the deferral mechanism and is unchanged by this package |
| Sentence order and separator | unchanged: informational first, actionable second, joined by `'\n\n'`; a sentence that does not render contributes nothing, and neither rendering returns `''` |

### Table B — the freshness window

| Fact / rule | Value |
|---|---|
| Window | **7 days** — `7 * 24 * 60 * 60 * 1000` ms. Owner decision, 2026-08-29: 7 over 14 |
| Exported as | a named constant on `module.exports`, alongside a named constant for the informational reason set, so the tests and any future surface read the same values rather than re-deciding them |
| Clock | `opts.now` when it is a finite number, otherwise `Date.now()`. Nothing else reads a clock |
| The field read | `rec.updated_at` — the ISO string every recording function already writes. **No new field, no new file, no acknowledgement state** (ADR-0004) |
| A record is STALE iff | `Date.parse(rec.updated_at)` is a finite number **and** `now - parsed > 7 days` |
| A record is FRESH in every other case | missing `updated_at`, a non-string, an unparseable string, and a timestamp in the future all count as fresh. This is the **fail-loud** direction: an unreadable or skewed timestamp keeps the warning up rather than silently retiring it |
| Render decision | the informational sentence renders **iff at least one** informational-or-unrecognized active quarantine is fresh. Unrecognized members are fresh by Table A, so one of those alone keeps it up |
| What the decay is NOT | it does not remove, alter or expire any ledger record; it does not change `selectState`; a "decayed" transcript is still quarantined, still skipped, still counted by `wienerdog doctor` and still listed in `reports/warnings.md`. Only the banner retires |
| Re-raising | a new quarantine writes a fresh `updated_at`, so the banner returns on the next render with the new exact total |

### Table C — what does not change

| Fact / rule | Value |
|---|---|
| The actionable sentence | byte-identical, including the enumeration, the `state/quarantine/` instructions and its deliberate silence about any command |
| The two call sites | `src/cli/dream.js:392` and `src/cli/sync.js:288` keep passing one argument; neither file is a deliverable |
| `src/core/digest.js` | unchanged. It receives a finished string, splices it at prefix position 3 (`:833-838`), and reserves the prefix's bytes and lines before capping the body |
| Golden fixtures | `tests/golden/**` is byte-identical after this package. `tests/golden/digest-default.md` is the no-banner reference and is not edited |
| Other banners | identity exclusions, failure alerts, secret quarantine, insecure modes, scheduler status and update availability are untouched. Nothing here generalizes a decay rule to any of them |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it)
- [ ] Acceptance criteria that assert Tables A, B and C
- [ ] Verification commands (the sentence gate and the no-enumeration gate assert
      Table A; the window gate asserts Table B; the golden gate asserts Table C)
- [ ] Current-state description (the current partition, the caller list, the
      golden-fixture finding, the four pinned tests)
- [ ] The two literals and the three worked examples under "Exact contracts"
- [ ] Implementation notes (the pointer-honesty ordering and the three named
      residuals — the time-dependence one is what the idempotence criterion defers
      to, so a change to either moves both)
- [ ] Security checklist (what stops reaching the digest, and why that is a
      strict improvement)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **Pointer honesty is why this package depends on the warnings file.** The one
  surface the new sentence names must already exist on `main`. Do not ship this
  against a `reports/warnings.md` that nothing writes, and do not soften the
  sentence to work around a missing prerequisite — fix the ordering instead.
- **Do not add a second pointer.** Naming `wienerdog doctor` as well was considered
  and dropped: it answers the same question the banner already answers (the
  counts), the digest is the most expensive surface in the system to spend bytes
  in, and one destination is the whole point of the one-home principle.
- The informational sentence is built from **one integer and fixed text**. Keep it
  that way: the moment a name or a stored string enters it, the whole class of
  defects this package closes (unbounded volume, stored data choosing the digest's
  bytes) is reopened.
- **Named residual — the banner is time-dependent, so two renders of the same
  ledger can differ.** That is deliberate, and it is already true of the digest's
  daily-log block. The practical consequence: a user who never re-runs `sync` or
  `dream` keeps a stale banner until one of them runs. Both refresh the digest on
  every run, so the self-healing path is the normal one.
- **Named residual — clock skew.** A machine whose clock jumps backwards makes
  records look future-dated, which Table B counts as fresh: the banner stays up.
  Fail-loud, and the correct direction.
- **Named residual — the 7-day window is a heuristic, not a proof.** A user who
  looks at no session for 8 days after a quarantine never sees the banner. The
  durable surfaces exist precisely for that reader, which is why this package is
  third and not first.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no identifier from this
      package reaches a filesystem path or a shell command.** This package removes
      code and adds an integer comparison; it constructs no path and spawns nothing.
- [ ] The surface this package touches is **untrusted-influenceable bytes entering
      instruction-adjacent model context.** This change is a strict *reduction*:
      after it, the informational sentence contains no filename and no stored
      `reason` string at all, so the only remaining ledger-derived text in the
      banner is the actionable sentence's `displayName` enumeration, which is
      unchanged and already whitelisted to `[A-Za-z0-9._-]`.
- [ ] `updated_at` is parsed with `Date.parse` and used only in a numeric
      comparison; no branch of Table B renders it, and an unparseable value takes
      the fail-loud branch rather than throwing.
- [ ] Three residuals, all named under Implementation notes: time-dependent
      output, clock skew, and the window being a heuristic.

## Acceptance criteria

- [ ] With one `over-ceiling` record recorded `now`, the banner is exactly Table
      A's informational sentence with `<N>` = 1: it contains no filename, no reason
      string, no comma-separated list, and it is under 400 bytes.
- [ ] With 191 informational records the banner is the same sentence with `<N>` =
      191 and **the same byte length** as the 1-record case except for the digits —
      i.e. the output does not grow with the number of quarantines.
- [ ] With every informational record older than 7 days and no other quarantine,
      `quarantineBannerLine` returns `''`.
- [ ] With records straddling the boundary, the sentence renders while **at least
      one** is fresh and stops when the last one goes stale; when it renders, `<N>`
      is the exact total of **all** informational and unrecognized records, stale
      ones included.
- [ ] Boundary behaviour is exact and tested on both sides of `7 days`: a record at
      exactly the window is fresh, one a millisecond past it is stale.
- [ ] A record with a missing `updated_at`, a non-string `updated_at`, an
      unparseable string, and a future timestamp each keep the sentence rendering
      (Table B's fail-loud rule), and none of them throws.
- [ ] A record with an unrecognized `reason`, a missing `reason`, and a non-string
      `reason` are each counted in `<N>` and each keep the sentence rendering
      **regardless of `updated_at`** (Table A's never-decays rule).
- [ ] The `secret-revert-exhausted` sentence is byte-identical to before this
      change, renders regardless of `updated_at` and of how old it is, and renders
      alone (with no leading blank line) when every informational record is stale.
- [ ] Both sentences render in the existing order, separated by exactly one blank
      line, when both apply.
- [ ] An empty ledger, a ledger with only `processed`/`deferred` records, and a
      corrupt ledger each produce `''` and do not throw.
- [ ] `opts.now` controls every decision above; omitting it uses the live clock and
      changes nothing else; a non-numeric `opts.now` falls back to the live clock.
- [ ] `wienerdog sync` and a dream run still render the banner into
      `state/digest.md` for a fresh quarantine, and render no intake banner for a
      stale-only one.
- [ ] Every file under `tests/golden/` is byte-identical (Table C).
- [ ] Idempotence: `N/A — this package ships no command and writes nothing; it
      changes one pure render, and that render is DELIBERATELY time-dependent, so
      two calls on the same ledger legitimately differ across the 7-day boundary
      (Table B; the first named residual under Implementation notes).` The
      repeatable property it ships instead is the contract's own: the render
      is a function of the ledger and `opts.now` alone, so two calls with the same
      ledger and the same `opts.now` are byte-equal, and no call writes, mutates
      or expires a record.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "^ledger: "
npm test -- --test-name-pattern "sync-digest-quarantine"
npm test -- --test-name-pattern "dream-integration"
npm test
npm run lint
# Table A gate — the new sentence and both pointers exist byte-exact; the withdrawn
# enumeration wording is gone from the module.
node -e "const t=require('fs').readFileSync('src/core/dream/ledger.js','utf8');const bad=[];for(const s of ['session transcript(s) are being skipped and will not be dreamed over','reports/warnings.md in your vault'])if(!t.includes(s))bad.push('MISSING: '+s);if(t.includes('wienerdog doctor'))bad.push('the banner names a second pointer; the enumeration has one home');if(t.includes('could not be read and were skipped'))bad.push('the withdrawn intake wording is still present');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('BANNER TEXT OK');"
# Table B gate — the window is 7 days and is exported, and updated_at is what is read.
node -e "const l=require('./src/core/dream/ledger.js');const wk=Object.entries(l).filter(([,v])=>v===604800000);if(wk.length!==1){console.error('EXPECTED exactly one exported 7-day constant, got '+wk.length);process.exit(1);}const mk=(r,u)=>({version:1,baseline_mtime:{claude:null,codex:null},files:{'/x/a.jsonl':{fingerprint:'1:2:3:4',outcome:'quarantined',reason:r,updated_at:u,harness:'codex'}}});const now=Date.parse('2026-08-29T00:00:00.000Z');const fresh=l.quarantineBannerLine(mk('over-ceiling','2026-08-28T00:00:00.000Z'),{now});const stale=l.quarantineBannerLine(mk('over-ceiling','2026-08-01T00:00:00.000Z'),{now});const bad=[];if(!fresh.includes('1 session transcript(s) are being skipped'))bad.push('a fresh over-ceiling record did not render');if(stale!=='')bad.push('a stale over-ceiling record still rendered: '+JSON.stringify(stale));if(/a\\.jsonl/.test(fresh))bad.push('a filename reached the informational sentence');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('DECAY OK ('+wk[0][0]+')');"
# Table C gate — no golden fixture changed.
test -z "$(git diff --name-only main -- tests/golden/)" || { echo 'a golden fixture was modified'; exit 1; }
```

- The last three are NEW steps and each is an ASSERTION: it exits non-zero on
  failure rather than printing something a reader must judge. Paste a real green on
  the finished state AND a real red from a deliberately broken state (the sentence
  reworded; the window changed to 14 days; a golden touched), so a check that
  cannot fail is caught before anyone believes it. The deliverable-absent case is
  covered: both node gates throw when the module is missing or does not export what
  they read, rather than passing.

## Out of scope (do NOT do these)

- Any acknowledgement, `ack`, snooze or clear mechanism, and any new state file or
  CLI verb — explicitly rejected in ADR-0023 Amendment 2's alternatives.
- Changing `selectState`, `secretDeferralCount`, `activeQuarantines`,
  `displayName`, or any recording function; changing the ledger's on-disk schema;
  or expiring, rewriting or pruning any record.
- Changing what `wienerdog doctor` prints (`WP-doctor-quarantine-counts`) or what
  `reports/warnings.md` contains (`WP-quarantine-warnings-file`), and adding any
  enumeration, sample or truncated list to the banner — the enumeration has one
  home (ADR-0023 Amendment 2).
- Any change to `src/core/digest.js`, `DigestCaps`, `capDigest`, the prefix order,
  or any other banner in that prefix. Do not generalize a decay rule to alerts,
  identity exclusions, secret quarantine, insecure modes, scheduler status or
  update availability.
- Any change to `src/cli/dream.js` or `src/cli/sync.js` — the optional second
  argument exists for tests, and both callers keep passing one.
- Editing any file under `tests/golden/`.
- Re-opening ADR-0023's intake ceiling, fingerprint, selection rule, or Amendment
  1's sticky `secret-revert-exhausted` skip and its permanent banner.

## Definition of done

0. **DISPATCH PRECONDITION.** Both hold, and the dispatch message records each:
   (a) ADR-0023's Amendment 2 (2026-08-29) carries the owner's hand-written
   `Status: **ACCEPTED — OWNER-SIGNED <date>.**` line in place of its `PROPOSED`
   line; (b) `WP-quarantine-warnings-file` is `Done` on `main`. Without (b) the new
   banner names a surface that does not do the thing.
   `WP-doctor-quarantine-counts` is **not** a prerequisite — the sentence no longer
   names `doctor` — and the two packages may land in either order.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): collapse the quarantine banner to a decaying count (WP-quarantine-banner-decay)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
