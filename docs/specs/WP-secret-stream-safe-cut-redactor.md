---
id: WP-secret-stream-safe-cut-redactor
title: Give the detector a bounded stream redactor that cuts only where no rule can match across
status: Draft
model: opus
size: M
depends_on: [WP-secret-sink-wiring-probes]
adrs: [ADR-0004, ADR-0024, ADR-0031, ADR-0042, ADR-0043]
epic: secret-lifecycle
---

# WP-secret-stream-safe-cut-redactor: `createStreamRedactor()` in `src/core/secret-scan.js`

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
**not scanned at all** and is replaced wholesale by the fixed 55-character string
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

Why a cut at just any newline would be wrong, and why Table S has three
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

- `src/core/secret-scan.js` — the detector, 326 lines. Module exports at `:325`:
  `{ scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY }`.
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
- `tests/red-proofs/` holds **24** `*.proofs.json` files (count, do not assume).
  This WP adds one, per Table D.
- `npm test` is `node tests/run.js`; `npm run lint` is `node scripts/lint.js`;
  `npm run red-proofs` is `node tests/with-temp-root.js scripts/red-proofs.js`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/secret-scan.js | add `createStreamRedactor` per "Exact contracts" and Table S, add `STREAM_REGION_MAX` to `ScanLimits` per Table B, export the new function; change no existing rule, constant value or exported behaviour |
| modify | tests/unit/secret-scan.test.js | add the suite the acceptance criteria require, including the three exactly-named tests of Table D; change no existing test |
| create | tests/red-proofs/secret-stream-safe-cut.proofs.json | Table D rows D1, D2 and D3 only; `suite` is `tests/unit/secret-scan.test.js` |

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

A cut between buffer position `i-1` and `i` is **accepted** when **all three**
rows hold on the buffered text `P = buffer[0 .. i)`. This table is the whole set:
there is no forbidden-set to keep closed, and anything not accepted here is not a
cut.

| # | Condition | What it keeps whole | Derivation (never restate a pattern) |
|---|-----------|---------------------|--------------------------------------|
| S1 | The character at `i-1` is `\n`. | Every rule whose pattern cannot contain a newline: the twelve labelled provider-prefix rules, `basic-auth`, and both entropy tiers (`hasBoundContext` never crosses `\n`, `src/core/secret-scan.js:228`). | — |
| S2 | The final line of `P` (the text after its last `\n`, or all of `P` if it has none) does **not** end in an open key binder: a keyword from the detector's own `SENSITIVE_KEYS` alternation or the literal `authorization`, then up to `ScanLimits.ENTROPY_CTX_FILLER_MAX` characters of `[ \t\w.-]` filler, then optionally each of — one quote (`"`, `'` or backtick), horizontal whitespace, one separator token from the detector's own `SEP` alternation, horizontal whitespace, one quote — anchored to the line's end. | The four rule families that complete across a line break when the key ends one line and the value begins the next: legacy `key=value` (`:107-114`), the JSON `"key": "value"` value rule (`:128-137`), the extended assignment rule (`:140-148`), and `Bearer <token>` (`:101-105`). All four are measured to span a newline. | Built from `SENSITIVE_KEYS` (`:43-44`) and `SEP` (`:189`) by interpolation, exactly as `CTX_BINDER` (`:203-208`) is. `CTX_BINDER` itself is **not** reusable: it requires the separator, and `Bearer <token>` has none. |
| S3 | `P` contains no `-----BEGIN` … `PRIVATE KEY-----` opener without a later matching `-----END` … `PRIVATE KEY-----` closer. | `private-key` (`:82`), the one rule whose body spans arbitrarily many lines. | The opener/closer shapes come from that rule's own pattern; count openers and closers in `P` rather than re-implementing the rule. |

**S2 is deliberately conservative.** Because the separator is optional, a line
ending in the bare word `token` or `password` also blocks a cut. The cost is that
the region grows by one line; the benefit is that `Bearer` and the quote-first
JSON shape are covered without a second predicate. A blocked cut is never a leak.

**A rule added to `RULES` later that can match across a line break must extend
this table and the predicate in the same change** (ADR-0043 decision 3). A rule
that cannot is covered by S1 and needs nothing.

### Table B — canonical: the bound and the forced cut

| Fact / rule | Value |
|-------------|-------|
| Constant | `ScanLimits.STREAM_REGION_MAX`, added to the existing `ScanLimits` object; the tests import that one definition rather than a literal |
| Value | `32 * 1024` **characters** |
| Why this value, upper side | A region is scanned by one `redactOnly` call, and the detector does **not scan** an input over `SCAN_MAX_BYTES` (262144 bytes) — it replaces the whole input by its oversized marker, which would silently delete real log output. UTF-8 is at most 4 bytes per character, so `STREAM_REGION_MAX * 4 = 131072 < 262144` keeps every region scannable in the worst case |
| Why this value, lower side | It must exceed one ordinary log line by a wide margin, so a forced cut is not the normal path. Larger values buy nothing: a cut is taken as soon as one is accepted, so the bound is reached only by a single logical line (or an open PEM, or an unbroken run of binder-terminated lines) longer than 32768 characters |
| Memory ceiling | one buffer per redactor instance, at most `STREAM_REGION_MAX` characters held. `WP-secret-sink-chunk-fix` creates four instances (one per stream per sink), so at most 4 × 32768 characters are ever held |
| Forced cut | the only unaccepted cut. It ends the region at exactly `STREAM_REGION_MAX` characters and is ADR-0043 decision 5's residual: a secret can still be split by it |
| Adversarial case, priced | a child that emits `-----BEGIN RSA PRIVATE KEY-----` and then never closes it, or one long unbroken line, forces a cut every `STREAM_REGION_MAX` characters. That is bounded work and bounded memory, and it degrades to the pre-fix chunk behaviour for that stream — never worse, and never unbounded |

### Table D — canonical: the declared RED proofs (ADR-0042)

Each declaration removes exactly one of Table S's three conditions from the
accepted-cut predicate and requires the one test that condition exists for to
fail. The three test names below are **fixed by this spec** because the
declarations mirror them; the rest of the suite's names, shapes and fixtures are
the implementer's.

| # | Test name (exact) | What the test feeds | Mutation (semantics) | `testNamePattern` |
|---|-------------------|---------------------|----------------------|-------------------|
| D1 | `stream-redactor: a labelled secret split across two pushes is redacted whole` | `push(head)` then `push(tail + '\n')` where `head + tail` is one `sk-ant-…` key | make `push` emit its input immediately instead of buffering to an accepted cut (i.e. defeat S1 — every position becomes a cut) | `split across two pushes` |
| D2 | `stream-redactor: a sensitive key and its value on the next line are redacted whole` | `push('password:\n')` then `push('  <12+ char value>\n')` | drop Table S row S2 from the predicate | `on the next line` |
| D3 | `stream-redactor: a private-key block split across two pushes is redacted whole` | the `-----BEGIN`/body/`-----END` lines split across two pushes | drop Table S row S3 from the predicate | `private-key block split` |

**Which fields this spec fixes and which the implementer fills.** The code these
declarations mutate does not exist yet, so:

| Field | Fixed by |
|-------|----------|
| `suite` (`tests/unit/secret-scan.test.js`), `file` (`src/core/secret-scan.js`), `wp`, `criterion` (`AC6`) | this spec — Deliverables and the acceptance criteria |
| `expectRed[].test` | this spec — Table D's `Test name` cell, verbatim, one-element array |
| `testNamePattern` | this spec — Table D's cell; the implementer **may narrow** it if the mutation reddens a test beyond the declared one |
| `id` | this spec — `stream-cut-s1-no-buffering`, `stream-cut-s2-open-binder`, `stream-cut-s3-open-pem`; kebab, unique across the whole declaration directory |
| `find`, `replace`, `marker`, `occurrences`, `why` | **the implementer**, against their own code, per the runner's rules below |

**This constrains the implementation, and deliberately so:** each of D1, D2 and
D3 must be expressible as **one exact-substring replacement**. If your predicate
cannot be mutated that way, restructure it until it can (three separately named
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
      `tests/unit/secret-scan.test.js` row (Table D's three names) and the
      declaration row (Table D's three row ids).
- [ ] **Acceptance criteria** — AC1 (the exported shape), AC2 (the region
      contract), AC3 (the three accepted-cut conditions), AC4 (the bound and the
      forced cut), AC5 (totality and purity), AC6 (the declarations).
- [ ] **Verification commands / greps** — the export grep; the
      `STREAM_REGION_MAX` definition grep and its `4 × value < SCAN_MAX_BYTES`
      assertion (Table B); the three Table D test names; the
      no-timer/no-fd/no-process greps (ADR-0004); the declaration-shape check and
      `npm run red-proofs`; the permission-boundary whitelist.
- [ ] **Current-state description** — the constants the predicate derives from
      and their line numbers, the `CTX_BINDER`-is-not-reusable note, the two
      precedent modules, and the `tests/red-proofs/` count.
- [ ] **Operative prose steps** — the Context paragraph naming the six
      newline-spanning rule families; the whole of "Exact contracts" (the region
      contract, `push`, `end`, totality); Table S's conservatism note and its
      new-rule obligation; Table B's adversarial row; "Accepted residuals"; the
      "Out of scope" list.
- [ ] **Frontmatter** — `adrs` (must list ADR-0043 and, while Table D is
      non-empty, ADR-0042).

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
   line, an open PEM block, or an unbroken run of binder-terminated lines longer
   than 32768 characters. This is ADR-0043 decision 5's residual and it replaces
   a residual that fired at every chunk boundary.
2. **This WP leaks nothing and fixes nothing.** It has no caller; the four
   `WD-SINK-CHUNK-*` defects are open at merge and their probes stay green.
3. **A rule added later that spans a line break, without Table S being extended,
   silently loses its cross-line coverage.** No mechanical check can detect it —
   the obligation lives in ADR-0043 decision 3, in Table S, and in a comment at
   the predicate. The failure mode is the pre-fix behaviour for that one rule,
   not a new class of leak.

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
- [ ] **AC3** — Each of Table S's three conditions is exercised by at least one
      test that fails when that condition alone is removed, including the three
      exactly-named tests of Table D. A secret split across two `push` calls at
      an arbitrary offset is redacted whole.
- [ ] **AC4** — `ScanLimits.STREAM_REGION_MAX` is `32 * 1024`; a test asserts
      `STREAM_REGION_MAX * 4 < SCAN_MAX_BYTES`; an input with no accepted cut
      point is emitted in regions of exactly `STREAM_REGION_MAX` characters and
      the buffer never exceeds that; and the input is still reconstructed exactly
      (AC2 holds through forced cuts).
- [ ] **AC5** — `push` and `end` never throw for a non-string, `undefined`, an
      empty string, a `push` after `end`, or a lone `end` on an untouched
      redactor; two redactor instances share no state; and the module still
      registers no timer, no event handler, no file descriptor and no process.
- [ ] **AC6** — `tests/red-proofs/secret-stream-safe-cut.proofs.json` exists with
      exactly Table D's three rows, and the bare unfiltered `npm run red-proofs`
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

# AC3/AC6 — Table D's three names, present and passing.
TAP="$(mktemp)"
node --test --test-reporter=tap tests/unit/secret-scan.test.js >"$TAP" 2>&1 || true
while IFS= read -r n; do
  LINE="$(grep -F -- "- $n" "$TAP" || true)"
  need "$(printf '%s\n' "$LINE" | grep -c . || true)" 1 "Table D test present exactly once: $n"
  need "$(printf '%s\n' "$LINE" | grep -c '^not ok' || true)" 0 "Table D test passes: $n"
done <<'NAMES'
stream-redactor: a labelled secret split across two pushes is redacted whole
stream-redactor: a sensitive key and its value on the next line are redacted whole
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
  "stream-cut-s2-open-binder": "stream-redactor: a sensitive key and its value on the next line are redacted whole",
  "stream-cut-s3-open-pem": "stream-redactor: a private-key block split across two pushes is redacted whole",
};
if (!Array.isArray(d.proofs) || d.proofs.length !== 3) { console.log(`GATE FAIL: expected 3 proofs, got ${d.proofs && d.proofs.length}`); bad++; }
for (const pr of d.proofs || []) {
  if (pr.wp !== "WP-secret-stream-safe-cut-redactor") { console.log(`GATE FAIL: ${pr.id} wp=${pr.wp}`); bad++; }
  if (pr.file !== "src/core/secret-scan.js") { console.log(`GATE FAIL: ${pr.id} file=${pr.file}`); bad++; }
  if (pr.replace === pr.find) { console.log(`GATE FAIL: ${pr.id} replace === find`); bad++; }
  if (!pr.replace.includes(pr.marker)) { console.log(`GATE FAIL: ${pr.id} replace lacks marker`); bad++; }
  if (!(pr.id in NAMES)) { console.log(`GATE FAIL: ${pr.id} is not a Table D id`); bad++; }
  else if (pr.expectRed[0].test[0] !== NAMES[pr.id]) { console.log(`GATE FAIL: ${pr.id} expectRed name is not Table D verbatim`); bad++; }
  if (!fs.readFileSync(pr.file, "utf8").includes(pr.find)) { console.log(`GATE FAIL: ${pr.id} find does not occur in ${pr.file}`); bad++; }
}
console.log(bad ? "" : `ok: ${p} — 3 proofs, all mirroring Table D`);
process.exit(bad ? 1 : 0);
JS

# AC9 — permission boundary.
need "$(git diff --name-only main... | grep -cvE '^(src/core/secret-scan\.js|tests/unit/secret-scan\.test\.js|tests/red-proofs/secret-stream-safe-cut\.proofs\.json|docs/specs/WP-secret-stream-safe-cut-redactor\.md|docs/specs/logbook/.+\.md|package-lock\.json|memory/lessons/inbox\.md)$' || true)" 0 \
     "files outside the permission boundary"

npm run red-proofs    # AC6 — the bare unfiltered run; must exit 0
npm test              # AC7
npm run lint          # AC8
echo "ALL GATES PASSED"
```

Both-sides evidence, per `docs/runbooks/spec-authoring.md`, is required for every
check above and pasted into the PR. D1–D3 supply it mechanically for the three
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

Two items. **Neither was ruled on directly.** Each is **a recommendation adopted
under standing authorization, not a direct ruling** — the standing process is
recorded in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), carried forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under it,
and **the owner reverses it by dated amendment.** Nothing in this repo records
the owner approving, accepting or ratifying either, and this spec asserts no such
acceptance.

1. **Does ADR-0043 reverse an owner decision that needs the owner, rather than a
   dated amendment?** The 2026-07-17 record — *"deliberately NOT buffered across
   chunks"* — exists only as a code comment (`src/core/dream/brain.js:504-508`,
   echoed at `src/cli/run-job.js:1048-1052`). ADR-0043 reverses the mechanism it
   approves.
   *Recommendation: proceed under standing authorization, with ADR-0043 carrying
   `Status: ACCEPTED under standing authorization 2026-09-18 — owner signature
   pending` until the owner signs it.* What the 2026-07-17 record actually
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
   this file. (b) The design gate is closed per `docs/runbooks/codex-review.md`.
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
