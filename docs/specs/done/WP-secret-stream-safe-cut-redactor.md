---
id: WP-secret-stream-safe-cut-redactor
title: Give the detector a bounded stream redactor that cuts only where no rule can match across
status: Done
model: opus
size: M
depends_on: [WP-secret-sink-wiring-probes]
adrs: [ADR-0004, ADR-0024, ADR-0031, ADR-0042, ADR-0043]
epic: secret-lifecycle
---

# WP-secret-stream-safe-cut-redactor: `createStreamRedactor()` in `src/core/secret-scan.js`

> **Errata, 2026-09-21 (post-merge) — five stale spec-prose facts, plus four
> quality observations recorded rather than dropped. None is a defect in what
> shipped.**
>
> **Landed in PR #306** (merge `1d8d4743`, 2026-09-19 03:32:39 UTC), tip
> `b9c78fde`, branch `wp/secret-stream-safe-cut-redactor`. **FIVE gate rounds
> plus a LIGHT round 5b**, the longest gate this stream has run, and the full
> record — every gate comment reproduced line for line — is
> `docs/specs/logbook/2026-09-19-secret-stream-safe-cut-pr306-gates.md`.
> Rounds 1 and 2 each found a real leak in the cut predicate (an overlapping
> sensitive-value opener, two different spellings of the same mistake); rounds
> 3, 4 and 5 found **no leak and no contract violation** — every finding in them
> was in one dimension, **cost**, which Table B did not pin. Round 5 was the
> freeze, and its one blocking item was a canonical cell contradicted by the
> code it pins, written by the architect pass itself; round 5b fixed it
> mechanically. CI on `b9c78fde`: seven checks pass.
>
> **The closing round's verdicts.** Round 5's independent gate (Codex plugin
> `review` on `gpt-6-astra`, orchestrator-run, detached worktree, porcelain
> identical) returned *"No actionable defects were found. All 49 targeted tests
> passed, and an additional 30,000-case differential check found no mismatches
> between chunked and whole-input redaction."* Round 5's wd-reviewer measured,
> among much else: `npm test` 2927 / **0 fail**; lint; boundary exact; this
> spec's verification script 20 `ok:` lines; all four RED declarations observed
> = declared with their signals, D1 non-vacuous **through the fast path** (raw
> emission measured under the mutation); the retention probe 32.13 MiB control →
> **0.16 MiB** on the tip, `end()` residue 0.13 MiB, four-instance worst case
> 1.12 MiB matching the memory row; the load guard firing with its named message
> under the filler mutation, and 2000 instances × adversarial pushes with **0**
> throws; both `RULES` mutations (JSON separator, PEM filler) reddening the
> exactness fuzz; `decomp-fuzz.js` **120 129 positions, 0 mismatches**; the
> 30 000-case leak fuzz 0; 17 overlap shapes × 1003 deliveries 0; no owner
> claim. Round 5b's delta `4512b736..b9c78fde` was verified mechanically by the
> orchestrator on a detached worktree at the tip: `src/core/secret-scan.js`
> changed **in JSDoc only** (no non-comment line in the diff, so the four RED
> anchors stand), `tests/unit/secret-scan.test.js` 49 / 49 / **0 fail**, and the
> retention probe after a 32 MiB push leaving a 100-character remainder
> **0.16 MiB**.
>
> **Red-proofs verdict, and exactly what it covers.** The implementer's
> **UNFILTERED** `npm run red-proofs`: `RUN: PROVEN`, `EXIT=0`, with all four of
> this package's declarations (`stream-cut-s1-no-buffering`,
> `stream-cut-s2-open-binder`, `stream-cut-s3-open-quoted`,
> `stream-cut-s4-open-pem`) `PROVEN`. It was measured on the round-5 tip
> `4512b736` and **not re-run for round 5b**, and the PR body says so: `src/`
> moved only in JSDoc, so no declaration's `find` anchor moved. That is the
> verdict this record claims.
>
> **What the gate established, and what it did not.** Five rounds, **no leak**:
> the cut predicate is exact against an independent `RULES`-derived reference at
> 120 129 candidate positions, and the four Table D declarations are measured
> rather than predicted. All four `WD-SINK-CHUNK-*` probes were still
> green-because-broken at this merge — this package ships a `src/` export with
> no caller, by owner item 2 — and they close with `WP-secret-sink-chunk-fix`
> (PR #310).
>
> **Erratum 1 — Current state (`:99`) pins a `tests/red-proofs/` count three
> revisions stale.** *What is wrong:* *"`tests/red-proofs/` holds **24**
> `*.proofs.json` files (count, do not assume)"*, pinned to `08de2bc3`. *What is
> true:* counted, not assumed — **27** at the merged tip `b9c78fde`, **31** at
> the merge commit `1d8d4743`, and **34** on `origin/main` at `8b4cbd4c` on
> 2026-09-21. The gate reported this number stale in all five rounds. *Routing:*
> **corrected in place**, and the sentence now says what its own parenthesis
> implies: a directory-wide total is provenance, never a contract, because every
> sibling package moves it. **Class: a spec cell pinning a number it does not
> own.**
>
> **Erratum 2 — Current state (`:77`) pins the detector's size and its export
> line, both of which this package itself more than doubled.** *What is wrong:*
> *"`src/core/secret-scan.js` — the detector, **325 lines**. Module exports at
> `:325`"*. *What is true:* on `origin/main` at `8b4cbd4c` the file is **802
> lines** and `module.exports` begins at **`:795`** — measured, and identical at
> the merged tip `b9c78fde`, because nothing has landed in that file since.
> (The gate watched this number climb round by round: 562 → ~624 → ~734 → 755 →
> 799 → 802.) *Routing:* **corrected in place**, with the construct named beside
> the number, because the number is a property of a file every sibling in this
> epic edits. **Class: a line cite in the file the package grows.**
>
> **Erratum 3 — Table D row D1's `testNamePattern` cell, as written, can never
> satisfy observed-equals-declared.** *What is wrong:* the cell fixes
> `split across two pushes`. *What is true:* that substring also selects **D4**'s
> name, `stream-redactor: a private-key block split across two pushes is
> redacted whole`, so the S1 mutation reddens both while the declaration names
> only D1 — and this spec's own runner rule requires the observed failing set to
> **equal** the declared set. The gate byte-confirmed the double selection in
> round 1. The implementer used the field's own escape hatch (the fixed-fields
> table says the implementer *"may narrow"* the pattern) and shipped the
> narrowed form; measured on `origin/main` at `8b4cbd4c`,
> `tests/red-proofs/secret-stream-safe-cut.proofs.json` carries
> `"a labelled secret split across two pushes"` for `stream-cut-s1-no-buffering`.
> *Routing:* **corrected in place to the narrowed form that shipped.**
> **Class: a canonical cell fixing a value that the contract beside it forbids.**
>
> **Erratum 4 — the AC9 boundary command reads a local `main` ref.** *What is
> wrong:* the verification block runs
> `git diff --name-only main... | grep -cvE …` and requires 0. *What is true:*
> `main...` resolves through the **local** `main` ref, which silently lags the
> branch base in a fresh worktree — and every file merged into `origin/main`
> since then is then counted as this branch's, so the check reads extra files
> and can fail for a reason that has nothing to do with the diff (or, with the
> lag in the other direction, read fewer). The implementer hit exactly this and
> recorded it as a lesson. *Routing:* **corrected in place** to
> `git diff --name-only origin/main...HEAD`, with a `git fetch` and an assertion
> that `main`, `origin/main` and the merge base agree before the count is
> trusted. **Class: a verification command whose subject is not the thing it
> names.**
>
> **Erratum 5 — the Dispatch-precondition owner item 1 is stale: ADR-0043 IS
> owner-signed.** *What is wrong:* owner item 1 recommends carrying ADR-0043
> with *"`Status: ACCEPTED under standing authorization 2026-09-18 — owner
> signature pending` until the owner signs it"*, and the preamble above it says
> *"Nothing in this repo records the owner approving, accepting or ratifying
> either"*; Definition of done item 1(b) repeats the same claim for ADR-0043.
> *What is true:* the owner signed it before this package was dispatched.
> `docs/adr/0043-safe-cut-stream-redaction.md:3` reads `Status: **ACCEPTED under
> standing authorization 2026-09-18 — owner-signed 2026-09-18.**`, the ruling is
> recorded verbatim in
> `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` under
> *"2026-09-18 — owner ruling, evening"*, and the Status-line edit is the
> owner's own working-tree change committed unchanged in **`a8ea9dab`**
> (PR #296). *Routing:* **corrected in place** — owner item 1 is recorded as
> **CLOSED by the owner's signature**, and the standing-form disclaimer is
> narrowed to owner item 2, which remains open. This errata pass also aligned
> two maintainer-owned surfaces that the same signature had left behind: that
> ADR's own block quote still said nothing recorded the owner approving it, and
> `docs/adr/README.md`'s `0043` row still said *"owner signature pending"*. Both
> now read what the Status line and `a8ea9dab` record, and nothing beyond what
> `a8ea9dab` itself records is claimed anywhere. **Class: a standing-authorization
> disclaimer outliving the signature it was waiting for.**
>
> **Quality observations, recorded rather than dropped** (round 5; none is a
> defect, and none was routed back to the implementer). (a) The test corpus
> filter hand-spells the private-key opener as its own regex —
> `const PEM_OPEN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/` at
> `tests/unit/secret-scan.test.js:787` on `origin/main`, used at `:852` — a
> third spelling of a rule the module already owns; a `RULES`-derived filter
> would not drift. (b) `pemParts(CUT_PEM_OPEN, 'private-key opener')` is called
> **twice at module load** (`src/core/secret-scan.js:437` and `:438`) for the
> two halves of one split. (c) `detached()` rests on a V8 implementation detail
> (`String.prototype.slice` returning a view), and the tripwire test that would
> catch its removal exists and is what makes that acceptable. (d) **The load-time
> guard's blast radius is a deliberate fail-closed choice that this spec never
> wrote down:** `pemParts` (`:425-436`) throws **at module load** if either
> private-key rule stops reading as `<head><filler><tail>`, so a `RULES` edit
> that breaks the cut layer's one structural assumption takes the whole detector
> down at `require` time rather than leaving `PEM_TAIL` `undefined` and throwing
> out of `push`. That is the right direction — `push` must never throw — and it
> is recorded here because the spec's Table S obligations did not price it.
>
> **Process finding recorded with this filing.** Three of five rounds were spent
> on a resource dimension the contract did not state: Table B priced memory and
> said *"bounded work"* with no per-byte number and no chunk-size envelope, so
> rounds 1–3 each landed a cost finding with nothing in the contract to check
> against. **A spec that ships a bounded-work claim must ship its per-byte
> ceiling and its chunk envelope with it.** The round-4 architect ruling added
> exactly that as a Table B cost row, and the round-5 pass registered its
> suite-side mirrors.

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **This WP ships a module function with no caller in `src/`.** That is
> deliberate and bounded: `WP-secret-sink-chunk-fix` is filed and wires it into
> the four stream call sites, and ADR-0043 (landed in this package's design
> commit) is the decision it implements. Nothing here changes any shipped
> behaviour, so the four `(KNOWN DEFECT WD-SINK-CHUNK-…)` probes stay green
> — i.e. those four leaks are still open when this merges.

## Context (read this, nothing else)

Wienerdog has **one** shared secret detector, `src/core/secret-scan.js`
(ADR-0024). It exports `scanAndRedact(text) -> {text, findings}` and
`redactOnly(text) -> string` (= `scanAndRedact(text).text`), plus `ScanLimits`,
`SEVERITY` and `hasHardFinding`. Matches are replaced inline by
`[REDACTED:<label>]`. The module is **pure, synchronous, total and fail-closed**:
a non-string becomes `''`; an input over `ScanLimits.SCAN_MAX_BYTES` (262144) is
**not scanned at all** and is replaced wholesale by the fixed 56-character string
`[wienerdog: oversized content withheld from secret scan]`; an internal error
returns `[wienerdog: secret scan failed — content withheld]`. It never throws and
never returns raw text on a degraded path. It is stateless and has no incremental
API.

Four durable-log call sites feed it **one stream chunk at a time**
(`src/core/dream/brain.js:517` stderr, `:545` stdout; `src/cli/run-job.js:1055`
stdout, `:1060` stderr). `WP-secret-sink-wiring-probes` (Done) measured, and
design review reproduced through real subprocess pipes, that a credential whose
two halves land in separate chunks is redacted by **neither** call and the two
writes land **contiguous** in `~/.wienerdog/logs/dream/<date>.log` and
`~/.wienerdog/logs/<job>/<date>.log` — the complete key, byte-for-byte. Four
committed tests assert that leak is present today.

**ADR-0043 decides the fix and this WP implements its transform half.** Per-chunk
redaction is withdrawn: the transform accumulates stream text and emits it as
**regions**, each scanned by one `redactOnly` call, and a region may end only at
an **accepted cut point** — a place where no detector rule can match across.
The accepted set is enumerated positively in **Table S** (it is our own grammar,
so it can be closed); a bound on region length is the only thing that can force
an unaccepted cut, and that forced cut is ADR-0043's stated residual.

Why a cut at just any newline would be wrong, and why Table S has four
conditions rather than one: **six rule families match across a line break**
(measured 2026-09-18 against the shipped detector) — `private-key` (its body is
`[\s\S]*?`), `Bearer <token>` (`\s+`), the legacy `key=value` assignment, the
JSON `"key": "value"` value rule, the extended assignment rule (all three use
`\s*` around the separator), and the keyword-bound entropy tier through those
same separators. Cutting at every newline unconditionally would stop catching
those **everywhere** instead of only at chunk boundaries — a regression dressed
as a fix. The entropy pass itself never crosses a newline (`hasBoundContext`
restricts its lookback to the current line), and every labelled provider-prefix
rule is single-line by construction.

**IRON RULE (ADR-0004): Wienerdog is just files.** The transform is a plain
synchronous function over strings. It is not a Node stream, holds no file
descriptor, registers no event handler, starts no timer and no process, and its
state dies with the call that created it.

## Current state

Measured on `main` at **`08de2bc3`**. Line numbers disambiguate; grep for the
cited construct, which is what authenticates it.

- `src/core/secret-scan.js` — the detector. At base `08de2bc3` it was 325
  lines with `module.exports` at `:325`, exporting
  `{ scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY }`; on the
  landed tree (`origin/main` at `8b4cbd4c`) it is **802 lines** with
  `module.exports` at **`:795`**, this package having added the whole cut layer
  (done-flip erratum 2). Grep for `module.exports`, not for the number.
  Relevant private constants this WP's predicate must be **derived from, never
  restate**: `ScanLimits` (`:21-26`, with `SCAN_MAX_BYTES: 256 * 1024` at `:22`
  and `ENTROPY_CTX_FILLER_MAX: 20` at `:25`), `SENSITIVE_KEYS` (`:43-44`, the
  longest-first keyword alternation) and `SEP` (`:189`, the separator-token
  alternation `/:{1,3}=|=>|\?=|[:=>]/.source`, ordered longest-first — the
  comment there forbids reordering). `CTX_BINDER` (`:203-208`) is the existing
  end-anchored binder predicate used by the entropy pass; it requires a
  separator, which is why Table S row S2 is not simply a reuse of it.
- `RULES` (`:79-156`) is the ordered rule list. The `private-key` rule (`:82`) is
  the one whose pattern spans newlines by construction.
- **Nothing in `src/` does incremental text buffering across `'data'` chunks for
  the log path.** Two precedents exist for the shape and are worth reading:
  `src/gws/broker/protocol.js:32-78` (`readMessages`) reassembles newline-framed
  messages across `'data'` chunks with a `MAX_MESSAGE_BYTES` bound, and
  `src/core/transcripts/stream.js:94-193` (`streamLines`) is a bounded line
  splitter with a carry-over tail and a `MAX_LINE_BYTES` overflow discipline.
  **Neither is reusable code here** — one is a framing protocol, the other a
  synchronous file reader — and this WP adds no dependency on either.
- `tests/unit/secret-scan.test.js` — the detector's existing unit suite.
  **Extend it; add no new test file and no new helper module.**
- `tests/red-proofs/` holds `*.proofs.json` files whose total every sibling
  package moves — **27** at this package's merged tip `b9c78fde`, **34** on
  `origin/main` at `8b4cbd4c` on 2026-09-21 (count, do not assume; done-flip
  erratum 1). This WP adds one, per Table D.
- `npm test` is `node tests/run.js`; `npm run lint` is `node scripts/lint.js`;
  `npm run red-proofs` is `node tests/with-temp-root.js scripts/red-proofs.js`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/secret-scan.js | add `createStreamRedactor` per "Exact contracts" and Table S, add `STREAM_REGION_MAX` to `ScanLimits` per Table B, export the new function; change no existing rule, constant value or exported behaviour |
| modify | tests/unit/secret-scan.test.js | add the suite the acceptance criteria require, including the four exactly-named tests of Table D; change no existing test |
| create | tests/red-proofs/secret-stream-safe-cut.proofs.json | Table D rows D1 through D4 only; `suite` is `tests/unit/secret-scan.test.js` |

Add nothing else to those files.

Per `docs/specs/_TEMPLATE.md` lines 33-35 and `scripts/boundary-check.js`, this
spec file, `package-lock.json`, `memory/lessons/inbox.md` and anything under
`docs/specs/logbook/` are exempt from every Deliverables table and are therefore
not listed, while remaining permitted in the verification whitelist below.

### Exact contracts

```js
/**
 * A bounded, stateful redactor for a text stream that arrives in arbitrary
 * chunks (ADR-0043). NOT a Node stream: plain synchronous calls, no events, no
 * file descriptor, no timer, no process (ADR-0004).
 * @returns {{push(text: string): string, end(): string}}
 */
function createStreamRedactor()
```

**The region contract.** Let `T` be the concatenation of every `text` passed to
`push`, in call order. The transform partitions `T` into contiguous, ordered
**regions** `R1 … Rn` with `R1 + … + Rn === T`, and the concatenation of every
`push` return value followed by the `end` return value is exactly
`redactOnly(R1) + … + redactOnly(Rn)`. No input character belongs to two regions
or to none; no region is emitted before an earlier one.

**Where a region may end.** Every region boundary is an **accepted cut point**
(Table S) except a **forced cut**, which happens only when Table B's
`STREAM_REGION_MAX` would otherwise be exceeded. `end()` closes the last region
wherever the input stopped.

**`push(text)`** appends `text` to the buffer, then emits every region the buffer
now completes, largest-first within the bound: repeatedly take the **last
accepted cut point at or before `STREAM_REGION_MAX` characters** from the
buffer's start; if the buffer holds at least `STREAM_REGION_MAX` characters and
no accepted cut point lies within them, cut at exactly `STREAM_REGION_MAX`
instead. Stop when no further region can be closed. Returns the concatenated
`redactOnly` output of the regions emitted by this call — `''` when none was.

**`end()`** scans and returns whatever remains in the buffer as one final region
(`''` if the buffer is empty), then empties it. A second `end()` returns `''`. A
`push` after `end()` is a programming error; it must not throw — treat the
redactor as freshly empty and keep the region contract.

**Totality.** `push` and `end` never throw. A non-string `text` is treated as
`''`. The underlying `redactOnly` is already total and fail-closed, and this
transform adds no failure mode of its own.

## Contract reference

Activation (ADR-0031, 4 of 7): (i) a new exported interface shape is introduced;
(iv) fallback behaviour at a bound is introduced (the forced cut); (vi) two
downstream call sites in a filed successor spec inherit the contract; (vii) the
accepted-cut set must appear in the contract prose, the acceptance criteria and
the verification greps.

Canonical tables: **S** (the accepted cut set), **B** (the bound), **D** (the RED
declarations).

### Table S — canonical: the accepted cut set

A cut between buffer position `i-1` and `i` is **accepted** when **all four**
rows hold on the buffered text `P = buffer[0 .. i)`. This table is the whole set:
there is no forbidden-set to keep closed, and anything not accepted here is not a
cut.

**Every condition is a statement about an INCOMPLETE MATCH over the whole of
`P`, never about `P`'s last line.** That distinction is the round-1 design
finding and it is load-bearing: a cut is safe exactly when no rule that could
still complete on the bytes yet to arrive has already begun in `P`. A last-line
predicate is blind to `password:\n\n`, to `password\n:\n` and to a quoted JSON
value left open several lines back, and all three were measured to leak across a
cut that such a predicate permits (round-1 logbook, HEAVY 1).

| # | Condition on `P` | What it keeps whole | Derivation (never restate a pattern) |
|---|------------------|---------------------|--------------------------------------|
| S1 | `P` ends with `\n` (`P` empty ⇒ no cut). | Every rule whose pattern cannot contain a newline: the twelve labelled provider-prefix rules, `basic-auth`, and both entropy tiers (`hasBoundContext` never crosses `\n`, `src/core/secret-scan.js:228`). | — |
| S2 | **No open key binder at the end of `P`.** `P` does not end with: a keyword from the detector's own `SENSITIVE_KEYS` alternation, or `authorization`; then, in this order and each optional — one quote (`"`, `'` or backtick), whitespace, **one** separator token from the detector's own `SEP` alternation, whitespace, one quote. **The whitespace spans line breaks, CR and LF included**, so the keyword may sit any number of blank lines back. | The four rule families that complete across a line break because their separator group is `\s*` or `\s+`: legacy `key=value` (`:107-114`), the JSON `"key": "value"` key half (`:128-137`), the extended assignment rule (`:140-148`) and `Bearer <token>` (`:101-105`). Measured shapes it must refuse: `password:\n`, `password:\r\n`, `password\n`, `password\n:\n`, `"client_secret"\n`. | Built by interpolating `SENSITIVE_KEYS` (`:43-44`) and `SEP` (`:189`), as `CTX_BINDER` (`:203-208`) is. `CTX_BINDER` itself is **not** reusable: it is anchored to one line and it requires the separator, which `Bearer <token>` has none of. |
| S3 | **No open sensitive quoted value in `P`.** `P` contains no `"<key>"` (key from `SENSITIVE_KEYS`) followed by `\s*:\s*` and an opening `"` with no closing `"` after it. | The JSON value rule's body is `[^"\\]{8,}`, which **includes `\n`** — a quoted value stays open across arbitrarily many lines until its closing quote. Measured shape it must refuse: `"client_secret":\n  "abc\n`. | The key set is `SENSITIVE_KEYS`; the quote and separator shapes come from that rule's own pattern (`:130`). Track the open/closed state over `P`, do not re-implement the rule. |
| S4 | **No open private-key block in `P`.** `P` contains no `-----BEGIN` … `PRIVATE KEY-----` opener without a later matching `-----END` … `PRIVATE KEY-----` closer. | `private-key` (`:82`), whose body is `[\s\S]*?` and spans arbitrarily many lines. | The opener/closer shapes come from that rule's own pattern; count openers and closers in `P`. |

**S2 and S3 are deliberately conservative.** The separator is optional in S2, so a
line ending in the bare word `token` or `password` also blocks a cut, and S3
blocks until a quote closes. The cost is that the region grows by a line or two;
the benefit is that the `Bearer`, quote-first and blank-line shapes are covered
without a fourth predicate. A blocked cut is never a leak, and the Table B bound
is what keeps a permanently-blocked cut from growing the buffer.

**These conditions are complete against today's rule list, and here is the
argument.** A rule can be split by a cut only if its pattern can match a `\n`.
Reading `RULES` (`src/core/secret-scan.js:79-156`) rule by rule, exactly six can:
`private-key` (S4), the JSON value rule (S3 for its body, S2 for its key half),
the legacy assignment, the extended assignment and `Bearer` (S2). Every other
rule's alphabet excludes `\n`, so S1 alone keeps it whole. **A rule added to or modified in
`RULES` later that can match across a line break must extend this table and the
predicate in the same change** (ADR-0043 decision 3); one that cannot is covered
by S1 and needs nothing.

### Table B — canonical: the bound and the forced cut

| Fact / rule | Value |
|-------------|-------|
| Constant | `ScanLimits.STREAM_REGION_MAX`, added to the existing `ScanLimits` object; the tests import that one definition rather than a literal |
| Value | `32 * 1024` **characters** |
| Why this value, upper side | A region is scanned by one `redactOnly` call, and the detector does **not scan** an input over `SCAN_MAX_BYTES` (262144 bytes) — it replaces the whole input by its oversized marker, which would silently delete real log output. UTF-8 is at most 4 bytes per character, so `STREAM_REGION_MAX * 4 = 131072 < 262144` keeps every region scannable in the worst case |
| Why this value, lower side | It must exceed one ordinary log line by a wide margin, so a forced cut is not the normal path. Larger values buy nothing: a cut is taken as soon as one is accepted, so the bound is reached only by a single logical line (or an open PEM block, an open quoted sensitive value, or an unbroken run of binder-terminated lines) longer than 32768 characters |
| Memory ceiling | one buffer per redactor instance, at most `STREAM_REGION_MAX` characters held BETWEEN calls, plus a transient: a `push` appends before it cuts, so during a call the buffer holds the appended chunk on top of that; plus per-instance prefix state bounded by the region — the non-whitespace index (at most `STREAM_REGION_MAX` entries), two per-position byte arrays of `STREAM_REGION_MAX + 1`, and four running maxima — measured at about 1.1 MiB for four instances in the worst case. The retained remainder is copied into independent storage after every cut, so an idle stream never keeps a larger previous chunk alive (PR gate round 4) |
| Forced cut | the only unaccepted cut. It ends the region at exactly `STREAM_REGION_MAX` characters and is ADR-0043 decision 5's residual: a secret can still be split by it |
| Adversarial case, priced | *Amended by round 4 — see the end of this section.* a child that emits `-----BEGIN RSA PRIVATE KEY-----` or `\"token\": \"` and then never closes it, or one long unbroken line, forces a cut every `STREAM_REGION_MAX` characters. That is bounded work and bounded memory, and it degrades to the pre-fix chunk behaviour for that stream — never worse, and never unbounded. Re-priced at PR gate round 4 (cold, fresh process, µs/char at chunk 1 / 64 / 4096): never-closed PEM opener 0.64 / 0.06 / 0.04; never-closed quoted value 0.58 / 0.06 / 0.02; open key binder 0.73 / 0.07 / 0.04; every line an open binder 0.56 / 0.38 / 0.41; keyword + whitespace 0.12 / 0.02 / 0.02; plain blank lines 2.07 / 0.05 / 0.02; one 16 MiB push 0.04. The ceiling is 24 µs/char |

### Table D — canonical: the declared RED proofs (ADR-0042)

Each declaration removes exactly one of Table S's four conditions from the
accepted-cut predicate and requires the one test that condition exists for to
fail. **D2, D3 and D4 are the RED baseline for the predicate**: each is a shape
measured on 2026-09-18 to be redacted when scanned whole and to leak across a cut
a weaker predicate permits (round-1 logbook, HEAVY 1). The four test names below
are **fixed by this spec** because the declarations mirror them; the rest of the
suite's names, shapes and fixtures are the implementer's.

| # | Test name (exact) | What the test feeds | Mutation (semantics) | `testNamePattern` |
|---|-------------------|---------------------|----------------------|-------------------|
| D1 | `stream-redactor: a labelled secret split across two pushes is redacted whole` | `push(head)` then `push(tail + '\n')` where `head + tail` is one `sk-ant-…` key | make `push` emit its input immediately instead of buffering to an accepted cut (i.e. defeat S1 — every position becomes a cut) | `a labelled secret split across two pushes` — the NARROWED form. *Done-flip erratum 3: this cell read `split across two pushes`, which also selects D4's name, so observed could never equal declared.* |
| D2 | `stream-redactor: a sensitive key whose value arrives on a later line is redacted whole` | **all four measured shapes**, each as two or more pushes split at a `\n`: `password:` ⏎ value; `password:` ⏎ ⏎ value; `password` ⏎ `:` ⏎ value; and the CRLF form of the second | drop Table S row S2 from the predicate | `value arrives on a later line` |
| D3 | `stream-redactor: a quoted sensitive JSON value left open across a line break is redacted whole` | `push('"client_secret":\n  "abc\n')` then `push('defghijkl"\n')` | drop Table S row S3 from the predicate | `left open across a line break` |
| D4 | `stream-redactor: a private-key block split across two pushes is redacted whole` | the `-----BEGIN`/body/`-----END` lines split across two pushes | drop Table S row S4 from the predicate | `private-key block split` |

**The seven measured leak shapes, byte-exact (AC3a).** Each is one text; every
one is redacted when `redactOnly` scans it whole, and every one leaks when a
last-line-only predicate permits a cut at one of its `\n`s (measured 2026-09-18).
They are published here rather than in table cells because the embedded newlines
and leading spaces are load-bearing. `V` below is the literal
`hunter2hunter2hunter2` (21 characters). The `# L<n>` lines are labels; `<CRLF>`
means the same two lines with `\r\n` line endings throughout.

```text
# L1
password:
  V
# L2
password:

V
# L3
password
:
V
# L4
password
: V
# L5
"client_secret":
  "abc
defghijkl"
# L6
"client_secret"
: "abcdefghijkl"
# L7 = L2 <CRLF>
```

**Which fields this spec fixes and which the implementer fills.** The code these
declarations mutate does not exist yet, so:

| Field | Fixed by |
|-------|----------|
| `suite` (`tests/unit/secret-scan.test.js`), `file` (`src/core/secret-scan.js`), `wp`, `criterion` (`AC6`) | this spec — Deliverables and the acceptance criteria |
| `expectRed[].test` | this spec — Table D's `Test name` cell, verbatim, one-element array |
| `testNamePattern` | this spec — Table D's cell; the implementer **may narrow** it if the mutation reddens a test beyond the declared one |
| `id` | this spec — `stream-cut-s1-no-buffering`, `stream-cut-s2-open-binder`, `stream-cut-s3-open-quoted`, `stream-cut-s4-open-pem`; kebab, unique across the whole declaration directory |
| `find`, `replace`, `marker`, `occurrences`, `why` | **the implementer**, against their own code, per the runner's rules below |

**This constrains the implementation, and deliberately so:** each of D1 through
D4 must be expressible as **one exact-substring replacement**. If your predicate
cannot be mutated that way, restructure it until it can (four separately named
boolean sub-checks is the obvious shape) — ADR-0042 declarations are a shipping
requirement, not an optional extra. Do not weaken a mutation to make it fit.

Runner rules that have burned earlier packages:

- `replace` must differ from `find` and must contain `marker`.
- `file` may not be the suite, the runner, `tests/run.js`, or anything under
  `tests/red-proofs/`.
- `signal` is a non-empty substring of the expected diagnostic — use a fixed
  assertion message, and **never a substring containing a probe value**.
- The observed own-body failing set must **equal** the declared set. If a
  mutation reddens more than its declared test, narrow `testNamePattern`; if it
  still does, declare the extras and say so in the PR.
- **The gate is the bare unfiltered `npm run red-proofs`.** A `--wp`-filtered run
  exits non-zero by construction and is a reading, never a pass. Do not pin a
  repo-wide declaration total.

### Mirrored Surface Checklist

For each canonical table above, every surface in this spec that mirrors it, so a
review finding updates the table and all its mirrors **in the same commit**
(update-all-mirrors), and a new mirror found in review is added here on the spot
(register-new-mirrors):

- [ ] **Deliverables-table cells** — the `src/core/secret-scan.js` row (cites
      Table S and Table B rather than restating either), the
      `tests/unit/secret-scan.test.js` row (Table D's four names) and the
      declaration row (Table D's four row ids).
- [ ] **Acceptance criteria** — AC1 (the exported shape), AC2 (the region
      contract), AC3 and AC3a (the four accepted-cut conditions and the seven measured
      leak shapes), AC4 (the bound and the forced cut), AC5 (totality and purity), AC6 (the declarations).
- [ ] **Verification commands / greps** — the export grep; the
      `STREAM_REGION_MAX` definition grep and its `4 × value < SCAN_MAX_BYTES`
      assertion (Table B); the four Table D test names; the
      no-timer/no-fd/no-process greps (ADR-0004); the declaration-shape check and
      `npm run red-proofs`; the permission-boundary whitelist.
- [ ] **Current-state description** — the constants the predicate derives from
      and their line numbers, the `CTX_BINDER`-is-not-reusable note, the two
      precedent modules, and the `tests/red-proofs/` count.
- [ ] **Operative prose steps** — Table S's incomplete-match preamble, its
      conservatism note and its completeness argument over `RULES`; the
      Context paragraph naming the six
      newline-spanning rule families; the whole of "Exact contracts" (the region
      contract, `push`, `end`, totality); Table S's conservatism note and its
      new-rule obligation; Table B's adversarial row; "Accepted residuals"; the
      "Out of scope" list.
- [ ] **`ScanLimits` comment in `src/core/secret-scan.js`** — the comment on
      `STREAM_REGION_MAX` mirrors Table B (its value, the `* 4 <
      SCAN_MAX_BYTES` derivation, and that the ceiling is what survives a call).
- [ ] **`isAcceptedCut`'s JSDoc in `src/core/secret-scan.js`** — mirrors Table S
      (the four rows, the incomplete-match preamble, and the new-rule obligation).
- [ ] **`MAX_MICROS_PER_CHAR`, the six cost-row bait names, the chunk set
      `[1, 64, 4096]` and the 16 MiB single-push test in
      `tests/unit/secret-scan.test.js`** mirror the round-4 cost row.
- [ ] **Frontmatter** — `adrs` (must list ADR-0043 and, while Table D is
      non-empty, ADR-0042).

### Design gate round 4 (PR #306 review, 2026-09-19) — Table B gains a cost row

**Cost — bounded work, stated as a per-byte ceiling at a chunk-size envelope.** `push`/`end` perform work linear in the total input length: prefix-determined state (row S2's non-whitespace index, rows S3/S4's four running maxima (`lastQuote`, `jsonOpenEnd`, `pemOpenEnd`, `pemCloseStart`) and two per-position flags) is carried across pushes within a region and extended over the appended text only, and every regex subject is bounded to the current region, never the whole remaining input. The suite asserts a per-byte ceiling of at most `MAX_MICROS_PER_CHAR`, set at ≥ 8× the slowest shape measured on the tree that sets it, for each of: a never-closed PEM opener, a never-closed quoted sensitive value, an open key binder, every line an open binder, `keyword + whitespace run` (a run of spaces and tabs, no line breaks — distinct from the open-binder shape), and plain blank lines — each in its candidate-dense form — its opener followed by its named filler, newline-terminated so the predicate is reached, at chunk sizes 1, 64 and 4096 characters, plus one single push of ≥ 16 MiB of inert text. The 'Adversarial case, priced' row's 'bounded work' means exactly this ceiling and nothing weaker.

## Implementation notes & constraints

- **One module, no new file in `src/`.** The predicate must sit with the rules it
  is derived from (ADR-0043 decision 3). Do not export `SENSITIVE_KEYS`, `SEP` or
  the predicate itself; the only new export is `createStreamRedactor`.
- **Derive, never restate.** S2's pattern is built by interpolating
  `SENSITIVE_KEYS` and `SEP`, the same way `CTX_BINDER` is built at
  `src/core/secret-scan.js:203-208`. A second hand-written copy of either
  alternation is the drift ADR-0031 exists to prevent, and `SEP`'s longest-first
  order must be preserved (the comment at `:175-188` explains why).
- **Nothing existing changes.** No rule is added, removed or reordered; no
  `ScanLimits` value is altered; `scanAndRedact` and `redactOnly` keep their
  exact current behaviour for every input. `ScanLimits` gains one key.
- **The transform takes strings, not Buffers.** Converting a chunk is the
  caller's job and stays exactly as it is today (`chunk.toString('utf8')`). A
  multi-byte character split across two chunks already yields U+FFFD at all four
  call sites; that is a pre-existing fidelity defect, it is **not** a secret-leak
  path (every rule's alphabet is ASCII), and it is recorded under "Discovered
  issues / routed" rather than fixed here.
- **No `setImmediate`, no `process.nextTick`, no timer, no event emitter, no
  stream class.** A caller must be able to call `push` inside a `'data'` handler
  and `end()` inside an `'end'` handler and have everything on disk
  synchronously; `WP-secret-sink-chunk-fix` depends on exactly that.
- No new npm dependencies. The new declaration file is inert JSON, never executed
  (ADR-0042 decision 1).
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope to resolve ambiguity.

### Accepted residuals

1. **A forced cut can still split a secret** (Table B). It needs a single logical
   line, an open PEM block, an open quoted sensitive value, or an unbroken run of
   binder-terminated lines longer than 32768 characters. This is ADR-0043 decision 5's residual and it replaces
   a residual that fired at every chunk boundary.
2. **This WP leaks nothing and fixes nothing.** It has no caller; the four
   `WD-SINK-CHUNK-*` defects are open at merge and their probes stay green.
3. **A rule added OR MODIFIED later that spans a line break, without Table S
   being extended, silently loses its cross-line coverage.** The obligation
   lives in ADR-0043 decision 3, in Table S, and in a comment at the predicate.
   The cut constants derive from the rule shapes AS THEY STAND, so a later
   change to a rule's separator group or filler class fails open until the cut
   layer is updated in the same change; the suite's naive references derive from
   `RULES`, so the exactness fuzz reddens on such a change. The failure mode is
   the pre-fix behaviour for that one rule, not a new class of leak.

## Discovered issues / routed

1. **A multi-byte character split across two stream chunks already becomes
   U+FFFD** at all four per-chunk call sites, because each does
   `chunk.toString('utf8')` on a Buffer that may end mid-codepoint. Pre-existing,
   a fidelity defect only (every detector rule's alphabet is ASCII), and **not
   fixed here or by `WP-secret-sink-chunk-fix`**. A later package may hand the
   sinks a `StringDecoder`; this transform's string-in contract does not have to
   change for that.

## Security checklist

- [ ] The transform never emits a character it has not passed through
      `redactOnly` as part of a region.
- [ ] Every region boundary is an accepted cut point (Table S) or a forced cut at
      the Table B bound — there is no third case, and no code path emits the
      buffer without scanning it.
- [ ] `STREAM_REGION_MAX * 4 < ScanLimits.SCAN_MAX_BYTES`, asserted by a test, so
      a region can never trip the detector's oversized path and blank real log
      output.
- [ ] Buffered text is bounded by `STREAM_REGION_MAX` characters per instance
      regardless of what the child emits — an unterminated PEM block or an
      endless single line forces cuts rather than growing the buffer (the WP-118
      OOM surface ADR-0043 decision 4 answers).
- [ ] `push` and `end` never throw, for any input including non-strings; the
      transform adds no failure mode to a detector that is already total.
- [ ] Every fixture uses only the repo's own synthetic secret-shaped patterns —
      never an environment variable, a developer-supplied file, or any value read
      from the machine — because a failing assertion prints what it was fed into
      `npm test` output and from there into CI logs.
- [ ] No probe value appears in the committed declaration file; `signal` is a
      substring of a fixed assertion message.
- [ ] The tests write no file: this is a pure function and needs no temp root.
- [ ] Nothing in this WP is described as fixing, mitigating or reducing any
      `WD-SINK-*` defect. All four chunk defects remain fully open at merge.

## Acceptance criteria

- [ ] **AC1** — `src/core/secret-scan.js` exports `createStreamRedactor`, and
      calling it returns an object with exactly the two methods `push` and `end`
      of the "Exact contracts" signature. The existing five exports are
      unchanged.
- [ ] **AC2** — The region contract holds: for a property-style test over many
      random split points of a fixed input, the concatenation of every `push`
      return plus the `end` return equals the concatenation of `redactOnly`
      applied to that run's regions, in order, and the regions reconstruct the
      input exactly. No characters dropped, none duplicated, none reordered.
- [ ] **AC3** — Each of Table S's four conditions is exercised by at least one
      test that fails when that condition alone is removed, including the four
      exactly-named tests of Table D. A secret split across two `push` calls at
      an arbitrary offset is redacted whole.
- [ ] **AC3a** — The **seven measured leak shapes** of the round-1 logbook are
      each covered by an assertion: fed as two or more pushes split at a `\n`,
      every one produces exactly what `redactOnly` produces for the same text
      scanned whole. The seven shapes are published literally under Table D.
      Each of them **leaks under a last-line-only predicate**, which is what this
      criterion exists to keep out.
- [ ] **AC4** — `ScanLimits.STREAM_REGION_MAX` is `32 * 1024`; a test asserts
      `STREAM_REGION_MAX * 4 < SCAN_MAX_BYTES`; an input with no accepted cut
      point is emitted in regions of exactly `STREAM_REGION_MAX` characters and
      the buffer never exceeds that between calls (Table B: during a call it
      also holds the appended chunk); and the input is still reconstructed exactly
      (AC2 holds through forced cuts).
- [ ] **AC5** — `push` and `end` never throw for a non-string, `undefined`, an
      empty string, a `push` after `end`, or a lone `end` on an untouched
      redactor; two redactor instances share no state; and the module still
      registers no timer, no event handler, no file descriptor and no process.
- [ ] **AC6** — `tests/red-proofs/secret-stream-safe-cut.proofs.json` exists with
      exactly Table D's four rows, and the bare unfiltered `npm run red-proofs`
      reports `PROVEN` for this WP's criterion and exits 0.
- [ ] **AC7** — `npm test` passes and exits 0; every existing
      `tests/unit/secret-scan.test.js` test still passes unchanged; the four
      `WD-SINK-CHUNK-*` probes still pass (still red-on-fix).
- [ ] **AC8** — `npm run lint` passes.
- [ ] **AC9** — No file outside the three in Deliverables is modified, **except**
      this spec file (status flip), `package-lock.json`,
      `memory/lessons/inbox.md` and `docs/specs/logbook/`.
- [ ] **AC10** — Idempotency: `N/A — this WP adds one pure module function and
      its tests. It ships no command and writes nothing outside the repo.`

## Verification steps (run these; paste output in the PR)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}

# AC1/AC4/AC5 — the exported shape, the bound and its derivation, purity.
# Guarded by `test -f` first: a check over a MISSING file reads greenest exactly
# where the work was never done.
test -f src/core/secret-scan.js
node - <<'JS'
const m = require("./src/core/secret-scan.js");
const bad = [];
if (typeof m.createStreamRedactor !== "function") bad.push("createStreamRedactor is not exported");
for (const k of ["scanAndRedact", "redactOnly", "hasHardFinding", "ScanLimits", "SEVERITY"]) {
  if (!(k in m)) bad.push(`existing export ${k} disappeared`);
}
const L = m.ScanLimits;
if (L.STREAM_REGION_MAX !== 32 * 1024) bad.push(`STREAM_REGION_MAX = ${L.STREAM_REGION_MAX}, expected ${32 * 1024}`);
if (!(L.STREAM_REGION_MAX * 4 < L.SCAN_MAX_BYTES)) bad.push("STREAM_REGION_MAX*4 is not below SCAN_MAX_BYTES");
const r = m.createStreamRedactor();
if (typeof r.push !== "function" || typeof r.end !== "function") bad.push("push/end missing");
if (Object.keys(r).sort().join(",") !== "end,push") bad.push(`unexpected surface: ${Object.keys(r)}`);
// Totality, in the shapes AC5 names.
for (const f of [() => r.push(undefined), () => r.push(42), () => r.push(""), () => r.end(), () => r.end(), () => r.push("x")]) {
  try { f(); } catch (e) { bad.push(`threw: ${e && e.message}`); }
}
// ADR-0004: loading and using the module leaves nothing running.
if (process._getActiveHandles().length > 2) bad.push("active handles after use");
bad.forEach((b) => console.log(`GATE FAIL: ${b}`));
console.log(bad.length ? "" : "ok: exported shape, bound and totality");
process.exit(bad.length ? 1 : 0);
JS

# ADR-0004 — no process, timer, fd or event machinery introduced in the module.
for pat in 'setInterval' 'setTimeout' 'setImmediate' 'nextTick' 'require(.node:fs.)' 'require(.node:child_process.)' 'EventEmitter' "require(.node:stream.)"; do
  need "$(grep -cE "$pat" src/core/secret-scan.js || true)" 0 "no $pat in secret-scan.js"
done

# AC3/AC6 — Table D's four names, present and passing.
TAP="$(mktemp)"
node --test --test-reporter=tap tests/unit/secret-scan.test.js >"$TAP" 2>&1 || true
while IFS= read -r n; do
  LINE="$(grep -F -- "- $n" "$TAP" || true)"
  need "$(printf '%s\n' "$LINE" | grep -c . || true)" 1 "Table D test present exactly once: $n"
  need "$(printf '%s\n' "$LINE" | grep -c '^not ok' || true)" 0 "Table D test passes: $n"
done <<'NAMES'
stream-redactor: a labelled secret split across two pushes is redacted whole
stream-redactor: a sensitive key whose value arrives on a later line is redacted whole
stream-redactor: a quoted sensitive JSON value left open across a line break is redacted whole
stream-redactor: a private-key block split across two pushes is redacted whole
NAMES
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in secret-scan.test.js"

# AC6 — the declaration file: present, shaped, mirroring Table D, no probe bytes.
node - <<'JS'
const fs = require("node:fs");
const p = "tests/red-proofs/secret-stream-safe-cut.proofs.json";
if (!fs.existsSync(p)) { console.log(`GATE FAIL: missing ${p}`); process.exit(1); }
const raw = fs.readFileSync(p, "utf8");
let bad = 0;
if (/sk-ant-|sk-proj-|BEGIN [A-Z ]*PRIVATE KEY/.test(raw)) { console.log(`GATE FAIL: ${p} carries probe bytes`); bad++; }
const d = JSON.parse(raw);
if (d.suite !== "tests/unit/secret-scan.test.js") { console.log(`GATE FAIL: suite ${d.suite}`); bad++; }
const NAMES = {
  "stream-cut-s1-no-buffering": "stream-redactor: a labelled secret split across two pushes is redacted whole",
  "stream-cut-s2-open-binder": "stream-redactor: a sensitive key whose value arrives on a later line is redacted whole",
  "stream-cut-s3-open-quoted": "stream-redactor: a quoted sensitive JSON value left open across a line break is redacted whole",
  "stream-cut-s4-open-pem": "stream-redactor: a private-key block split across two pushes is redacted whole",
};
if (!Array.isArray(d.proofs) || d.proofs.length !== 4) { console.log(`GATE FAIL: expected 4 proofs, got ${d.proofs && d.proofs.length}`); bad++; }
for (const pr of d.proofs || []) {
  if (pr.wp !== "WP-secret-stream-safe-cut-redactor") { console.log(`GATE FAIL: ${pr.id} wp=${pr.wp}`); bad++; }
  if (pr.file !== "src/core/secret-scan.js") { console.log(`GATE FAIL: ${pr.id} file=${pr.file}`); bad++; }
  if (pr.replace === pr.find) { console.log(`GATE FAIL: ${pr.id} replace === find`); bad++; }
  if (!pr.replace.includes(pr.marker)) { console.log(`GATE FAIL: ${pr.id} replace lacks marker`); bad++; }
  if (!(pr.id in NAMES)) { console.log(`GATE FAIL: ${pr.id} is not a Table D id`); bad++; }
  else if (pr.expectRed[0].test[0] !== NAMES[pr.id]) { console.log(`GATE FAIL: ${pr.id} expectRed name is not Table D verbatim`); bad++; }
  if (!fs.readFileSync(pr.file, "utf8").includes(pr.find)) { console.log(`GATE FAIL: ${pr.id} find does not occur in ${pr.file}`); bad++; }
}
console.log(bad ? "" : `ok: ${p} — 4 proofs, all mirroring Table D`);
process.exit(bad ? 1 : 0);
JS

# AC9 — permission boundary.
# Done-flip erratum 4: this read `main...`, which resolves through the LOCAL
# `main` ref. In a fresh worktree that ref lags the branch base, and every file
# merged into origin/main since is then counted as this branch's. Fetch, assert
# the three agree, and diff against `origin/main...HEAD`.
git fetch origin >/dev/null 2>&1 || true
need "$(git rev-parse main origin/main "$(git merge-base HEAD origin/main)" | sort -u | grep -c . || true)" 1 \
     "main == origin/main == merge-base"
need "$(git diff --name-only origin/main...HEAD | grep -cvE '^(src/core/secret-scan\.js|tests/unit/secret-scan\.test\.js|tests/red-proofs/secret-stream-safe-cut\.proofs\.json|docs/specs/WP-secret-stream-safe-cut-redactor\.md|docs/specs/logbook/.+\.md|package-lock\.json|memory/lessons/inbox\.md)$' || true)" 0 \
     "files outside the permission boundary"

npm run red-proofs    # AC6 — the bare unfiltered run; must exit 0
npm test              # AC7
npm run lint          # AC8
echo "ALL GATES PASSED"
```

Both-sides evidence, per `docs/runbooks/spec-authoring.md`, is required for every
check above and pasted into the PR. D1–D4 supply it mechanically for the four
named tests. For every other new check, observe and paste all three states:
**absent** (the export, constant or file missing → red), **compliant** (→ green)
and **violating** (→ red).

## Out of scope (do NOT do these)

- Wiring the transform into any call site. `src/core/dream/brain.js` and
  `src/cli/run-job.js` are `WP-secret-sink-chunk-fix`'s and are not touched here.
- Converting, renaming or re-messaging any `sink-probe:` test. All sixteen stay
  exactly as they are.
- Any change to `RULES`, to an existing `ScanLimits` value, to `scanAndRedact`,
  `redactOnly`, `hasHardFinding` or `SEVERITY`, or to the entropy pass.
- Exporting `SENSITIVE_KEYS`, `SEP`, `CTX_BINDER` or the cut predicate.
- Fixing the multi-byte-split defect under "Discovered issues / routed".
- Using or modifying `src/gws/broker/protocol.js` or
  `src/core/transcripts/stream.js`. They are cited as precedent only.
- Making the transform a Node `Transform` stream, or giving it any asynchronous
  surface.
- Editing `docs/specs/done/WP-secret-sink-wiring-probes.md`.

## Dispatch precondition — owner items

Two items, dispatched as **recommendations adopted under standing
authorization** — the standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), carried forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under it,
and **the owner reverses it by dated amendment.**

**Item 1 is CLOSED by the owner's own signature (done-flip erratum 5);
item 2 remains open in the standing form, and nothing in this repo records the
owner approving, accepting or ratifying item 2.**

1. **Does ADR-0043 reverse an owner decision that needs the owner, rather than a
   dated amendment?** The 2026-07-17 record — *"deliberately NOT buffered across
   chunks"* — exists only as a code comment (`src/core/dream/brain.js:504-508`,
   echoed at `src/cli/run-job.js:1048-1052`). ADR-0043 reverses the mechanism it
   approves.
   **CLOSED — the owner signed ADR-0043 on 2026-09-18, before this package was
   dispatched.** `docs/adr/0043-safe-cut-stream-redaction.md:3` reads
   `Status: **ACCEPTED under standing authorization 2026-09-18 — owner-signed
   2026-09-18.**`; the ruling is recorded verbatim in
   `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` under
   "2026-09-18 — owner ruling, evening", and the Status-line edit is the owner's
   own working-tree change, committed unchanged in `a8ea9dab` (PR #296). Nothing
   beyond what that commit records is claimed here. *(Done-flip erratum 5: this
   item previously read as pending.)*
   *The recommendation, as dispatched:* proceed under standing authorization,
   with ADR-0043 carrying `Status: ACCEPTED under standing authorization
   2026-09-18 — owner signature pending` until the owner signs it. What the
   2026-07-17 record actually
   defends is the WP-118 OOM/DoS surface, and Table B answers that with a hard
   bound rather than by refusing to buffer; what it describes as the consequence
   is measurably wrong.
   *Cost of overruling toward "wait for the signature":* the whole-credential
   chunk leak stays open — with four committed tests asserting it is present —
   for as long as the signature takes.
2. **Is a `src/` export with no caller acceptable for one work package?**
   *Recommendation: yes.* The alternative is folding the transform, four call
   sites, four probe conversions, four declarations and two comment corrections
   into one package, which is an L by the `docs/specs/README.md` heuristic
   (≤ 8 files, zero "and also" clauses).
   *Cost of overruling:* either an L package, or the transform lands inside
   `WP-secret-sink-chunk-fix` and its subtle predicate gets the review attention
   left over from the wiring.

## Definition of done

1. **DISPATCH PRECONDITION.** (a) The two owner items above travel with this
   package as **recommendations adopted under standing authorization**; a
   reversal is applied by a committed revision of this spec, never by a dispatch
   message, because `scripts/boundary-check.js` reads the Deliverables table in
   this file. (b) **THE DESIGN GATE IS CLOSED, at round 3, 2026-09-18**
   (`docs/runbooks/codex-review.md`), which is what makes this spec `Ready`.
   Rounds 1 and 2 landed HEAVY product findings and round 3 landed one LIGHT
   verification-machinery finding, all accepted in full and none dispositioned
   away; each round's raw reviewer output was committed **before** adjudication
   — `efd7d619` (r1), `c2490b4a` (r2), `dd6fb9e0` (r3) — and the dispositions
   table is `docs/specs/logbook/2026-09-18-secret-sink-fix-design-review.md`.
   Rounds 4 and 5 are PR-gate rulings on PR #306 (2026-09-19), recorded in the
   round-4 section above and in
   `docs/specs/logbook/2026-09-19-secret-stream-safe-cut-pr306-gates.md`; the
   design gate itself remains closed at round 3.
   **A closed design gate is a review gate, not owner approval**: owner item 2
   stays open in the standing form and nothing in this repo records the owner
   approving, accepting or ratifying it. **Owner item 1 is closed: ADR-0043 is
   owner-signed 2026-09-18 (`a8ea9dab`, PR #296) — done-flip erratum 5, which
   corrected this sentence's earlier claim that nothing recorded the owner
   signing it.**
   (c) **THE DISPATCHER RE-DERIVES EVERY CITATION.** They are pinned to `main` at
   **`08de2bc3`**; every `src/core/secret-scan.js` line number in Current state
   and Table S must be re-confirmed by grepping for the construct, not by the
   number. (d) Branch `wp/secret-stream-safe-cut-redactor`.
2. All verification steps pass locally; output pasted into the PR body, including
   the bare unfiltered `npm run red-proofs`, `npm test` and `npm run lint`.
3. Conventional commits; PR titled
   `feat(secret-scan): bounded stream redactor that cuts only where no rule can match across (WP-secret-stream-safe-cut-redactor)`.
4. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. "Discovered issues" repeats the multi-byte-split item above
   and states plainly that this WP has no caller, changes no shipped behaviour,
   and leaves all four `WD-SINK-CHUNK-*` defects open.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
