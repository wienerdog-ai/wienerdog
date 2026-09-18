---
id: WP-dream-collect-parse-throw-quarantine
title: Set aside a transcript whose preparation throws, instead of aborting the whole dream run
status: In-Review
model: opus
size: S
depends_on: [WP-dream-primary-dialogue-collection]
adrs: [ADR-0004, ADR-0005, ADR-0023, ADR-0031, ADR-0042]
---

# WP-dream-collect-parse-throw-quarantine: Set aside a transcript whose preparation throws, instead of aborting the whole dream run

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.
- **Design gate closed 2026-09-18 at round 1**, on base `a60c14e6`: product
  clean, one LIGHT machinery finding ("prove the boundary extends beyond the
  parser") fixed in the same commit and verified mechanically, one citation
  corrected. Round, dispositions and the two provider-refused attempts:
  `docs/specs/logbook/2026-09-17-dream-collect-parse-throw-quarantine.md`.
- **RE-PINNED 2026-09-18 to `297ef1df` and still `Ready`.**
  `WP-dream-primary-dialogue-collection` merged as PR #269 and rewrote the
  admission loop this package wraps. Every citation below was re-derived **by
  construct** at `297ef1df`, both ends of every range checked, never by adding a
  delta — the old→new table is
  `docs/specs/logbook/2026-09-18-dream-collect-parse-throw-quarantine-repin.md`.
  **No contract row's rule changed.** Two facts the new loop shape adds are
  written into Table B rather than left implied: the measured quantity is no
  longer a `JSON.stringify` (row B1), and the run's in-memory gate map is
  mutated **after** `writeFilePrivate`, so a set-aside candidate can leave no
  stale entry in it and the fix touches neither map (rows B3, B5).
  **This package is now dispatchable.**

## Context (read this, nothing else)

Wienerdog's core function is the **dream**: a nightly, scheduled run that reads
the session transcripts two AI coding harnesses leave on disk — Claude Code's
`~/.claude/projects/<project>/<uuid>.jsonl` and Codex CLI's
`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — and consolidates them into the
user's markdown memory vault. **Wienerdog is just files (ADR-0004):** the dream
is a process that runs and exits; there is no daemon, no server and no
telemetry, and nothing in this work package may introduce one. There are no
runtime npm dependencies; this package adds none.

Transcript content is **fully attacker-influenceable**. A transcript records
whatever a web page, a repository, a dependency's README or a tool's output put
in front of the model, and any of those parties can put arbitrary bytes into a
JSON string. Wienerdog's answer to that is **bounded intake plus a per-file
quarantine ledger** (ADR-0023): every read is bounded (a 50 MB pre-read ceiling,
a 1 MB per-line cap, a 500,000-line cap, a per-session byte budget), and a file
the reader cannot handle is recorded in `~/.wienerdog/state/transcript-ledger.json`
as **quarantined** — skipped on every later run until the file changes — so that
one bad file costs one file's worth of memory and nothing more. The ledger's
quarantines surface to the user in three places: an exact count in the digest
banner, an exact count in `wienerdog doctor`, and the full enumeration in
`reports/warnings.md` in the vault, which is the enumeration's **one home**
(ADR-0023 Amendment 2).

**That design has a hole, and it is live on `main` today.** The collector
(`collectExtracts` in `src/core/dream/scratch.js`) calls the parser inside its
admission loop with no try/catch. Every other exclusion arm in that loop —
quarantine on a non-`ok` stream outcome, read-deferred, individually oversized,
the capacity stop, the deadline stop — assumes the parser **returns**. It does
not always return: the Codex and Claude parsers join content blocks with
`Array.prototype.join`, which coerces, and a block whose `text` is an object
with a poisoned `toString` (literally `{"toString":null}`) makes that join throw
`TypeError: Cannot convert object to primitive value`. The throw escapes
`collectExtracts`, escapes the dream, and ends the run. **Because the file is
never quarantined, it ends the run again the next night, and every night after,
until the user finds and deletes it.** That is a persistent denial of the
product's core function, achievable by one file a third party can cause to be
written into a watched directory. Four distinct ways to reach it were measured
on this tree; they are listed under "Current state".

This package closes it on the **collector** side, which is where the guarantee
belongs: the loop gains a per-candidate fault boundary, and a candidate whose
preparation throws is set aside as a new quarantine reason, `parse-threw`,
exactly as an over-ceiling file is. The guarantee this buys is **closed** — it
holds for any throw from any step inside the boundary, including steps added
later — where a list of the individual throwing expressions in someone else's
grammar could never be closed.

## Current state

**Base: `297ef1df9f2b6b09baab48daa6676a23762f1d28`** (`main` after PR #269).
The behavioral claims below were executed on `a60c14e6` at the close of
design-review round 1 — the probes and their output are in
`docs/specs/logbook/2026-09-17-dream-collect-parse-throw-quarantine.md` — and
**every line citation was re-derived by construct at `297ef1df` on 2026-09-18**,
with the old→new table in
`docs/specs/logbook/2026-09-18-dream-collect-parse-throw-quarantine-repin.md`.
The only file under `src/` whose cites moved is the collector (plus two line
numbers in `src/cli/dream.js`); `ledger.js`, `warnings.js`, `promote.js`,
`src/core/transcripts/` and `scripts/red-proofs.js` were untouched by #269 and
their citations carried over unchanged, re-checked construct by construct.

**`src/core/dream/scratch.js`** — the collector. Line 18 defines
`sanitize(id)`, which is `String(id).replace(/[^A-Za-z0-9_-]/g, '_')` with no
width bound. Lines 128–195 are the admission loop over `underCeiling`, newest
first. In order, one iteration does: the capacity stop (`remaining === 0`,
131–134), the deadline stop (135–138), the cached-oversized memo skip (142–145),
`delete oversizedExtracts[key]` (148), then — **lines 149–150, unguarded** —

```js
    const { extract, gateExtract, intakeBytes, parse } =
      transcripts.parsePrimaryWithOutcome(d, transcripts.newRunBudget());
```

followed by the non-`ok` quarantine arm (151–154, `newlyQuarantined.push({ ...d, reason: parse.outcome })`),
the read-deferred arm (155–158), **`const extractBytes = intakeBytes;` (164)**,
the individually-oversized arm (165–169), the capacity-stop-with-break
(170–173), the scratch filename — `path.join` of `scratchDir` and the template
literal `<harness>-<sanitize(extract.session_id)>.json` — (174) and
`writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2))` (178).
**After the write**, and only after it, the iteration records the run's
in-memory gate evidence: the gate key `` `${d.harness}:${extract.session_id}` ``
(179), the filename eviction `gateExtracts.delete(evicted)` (180–181), the two
map writes (182–183), then `entries.push` (184–190), `wrote.push` (191),
`processed.push` (192), `intakeBytesTotal += intakeBytes` (193) and
`remaining -= extractBytes` (194).
`newlyQuarantined` is returned to `src/cli/dream.js`, which prints one console
line per element and — outside a dry run — calls `ledgerLib.recordQuarantined(ledger, q, q.reason)`.

**What #269 changed about this package's reasoning, stated rather than left to
be re-derived.** (i) The measured quantity is no longer produced in the loop:
`extractBytes` is now the parser's `intakeBytes`, a number, so the old
"`Buffer.byteLength(JSON.stringify(extract))` cannot throw on `JSON.parse`d
data" argument is replaced by a plainer one — a `let` assignment of a number
cannot throw at all. The `JSON.stringify(extract, null, 2)` that produces the
bytes to be written still exists, as `writeFilePrivate`'s second argument at
178, and Table B row B1 still puts it inside the boundary. (ii) The collector
now returns `gateExtracts` and `intakeBytesTotal`, and every mutation of the
gate maps sits **after** `writeFilePrivate`. Table B row B3's "consumes
nothing" therefore covers them by construction — a `continue` from inside the
boundary never reaches line 179 — and row B3 now names them so the fact is
checkable rather than implied. (iii) The gate key at 179 interpolates
`extract.session_id`, which is content-derived; it is nevertheless **not** a new
reachable throw site, because line 174's `sanitize` performs `String(id)` on the
same value first and a value that survives that cannot make a template literal
throw (the only divergence between the two is `Symbol`, which `JSON.parse`
cannot produce).

**The four measured whole-run aborts** (each: `collectExtracts` over a directory
containing the crafted file threw, and healthy sessions in the same directory
were never admitted):

1. `src/core/transcripts/codex.js:77-83`, `extractMessageText` —
   `.filter(block => block && (block.type === 'input_text' || block.type === 'output_text')).map(block => block.text).join('\n')`.
   No string check. A Codex `message` payload with an `output_text` block whose
   `text` is `{"toString":null}` throws inside `parse()` **and** `parseWithOutcome()`.
2. `src/core/transcripts/codex.js:91-95`, `extractToolOutputText`'s array branch
   — the same join over a `custom_tool_call_output` payload's `content`.
3. `src/core/transcripts/claude.js:57-66`, `flattenToolResultContent`, and
   `src/core/transcripts/claude.js:175-178`, the assistant text join — both the
   same shape, both reached by an ordinary `user`/`assistant` record.
4. **Outside the parser entirely**, so a try/catch around the parse call alone
   would not cover it: `codex.js` sets `sessionId = payload.id || null` from
   `session_meta`, with no type check. A rollout whose `payload.id` is
   `{"toString":null}` **parses cleanly** and returns an Extract whose
   `session_id` is that object; `sanitize(extract.session_id)` at
   `scratch.js:174` then evaluates `String(obj)` and throws. Separately, a
   `payload.id` of 4,000 characters produces a scratch filename over the
   filesystem's name limit, and `writeFilePrivate` at `scratch.js:178` throws
   `WienerdogError: … could not create a private temp file (ENAMETOOLONG)`.
   **Both are unchanged by #269**, which moved neither the filename derivation
   nor the write relative to each other.

No step in the loop that is **not** content-derived throws on content: the
measurement is now the plain assignment `const extractBytes = intakeBytes`
(`:164`) of a number the parser returned, the memo lookup is plain property
access, and `ledgerLib.fingerprint(d)` reads four numbers off the discovery
record. The one remaining content-derived serialization,
`JSON.stringify(extract, null, 2)` at `:178`, cannot throw on data that came
from `JSON.parse` (no cycles, no BigInt, no throwing `toJSON` is reachable) —
it is inside the boundary anyway (Table B row B1).

**`src/core/dream/ledger.js`** — a quarantine record is
`{fingerprint, outcome:'quarantined', reason, updated_at, harness}`, keyed by
the case-folded absolute path; `recordQuarantined(ledger, disc, reason)` writes
exactly those five fields and passes `reason` straight through, so a new reason
literal needs no change to the write path. `selectState` returns `'select'`
whenever a quarantined record's `fingerprint` differs from the file's current
`size:mtimeMs:dev:ino` — only `secret-revert-exhausted` is sticky and skips that
check. `INFORMATIONAL_QUARANTINE_REASONS` (line 41) is
`['over-ceiling', 'too-many-lines', 'read-error']`; a reason outside it never
lets the digest banner decay. `tests/unit/ledger.test.js:485` pins that array's
exact contents.

**`src/core/dream/warnings.js`** — `GROUPS` (lines 108–123) maps reason →
heading for `reports/warnings.md`, in emission order, ending in a catch-all row
with `reason: null` and the heading `Skipped for a reason this version does not
recognize`. `composeWarnings` is a pure function of the ledger alone and is the
file's only composer.

**Surfaces that need no change, confirmed by reading them:**
`src/core/dream/promote.js:642-644` builds the run report's
"set aside by this run" bullet from the `newlyQuarantined` **count** and names
no reason; `ledger.js`'s `quarantineBannerLine` builds the digest's
informational sentence from one integer and fixed text; `src/cli/dream.js:806-813`
interpolates `q.reason` into its console line; `src/cli/dream.js:822` guards the
ledger write on `!dryRun`. **#269 edited `src/cli/dream.js`** (it replaced the
`extractsBySession` disk rebuild with the collector's map and split one dry-run
byte line into two), which is why the two `dream.js` numbers moved; the
constructs themselves are unchanged.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/.
     Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | Table B in full (the fault boundary, rows B1–B6) and Table A rows A1 and A5 (the reason literal's one site, and discarding the caught value) |
| modify | src/core/dream/ledger.js | Table A row A3 only — the `reason?:` typedef union and `INFORMATIONAL_QUARANTINE_REASONS`. No function body changes |
| modify | src/core/dream/warnings.js | Table A row A4 only — one `GROUPS` row |
| modify | tests/unit/dream-collect.test.js | Table B and Table A rows A1, A5, A6. **Append after the two blocks appended today** (`WP-secret-sink-wiring-probes` and `WP-dream-report-run-skips`, the file's current tail) |
| modify | tests/unit/ledger.test.js | Table A row A3's pinned set at `:485` — one array literal |
| modify | tests/unit/dream-warnings.test.js | Table A row A4's render |
| create | tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl | The **in-parse** failure rollout, byte-exact as given under "Exact contracts" |
| create | tests/fixtures/dream/transcripts/codex-poisoned-session-id.jsonl | The **post-parse** failure rollout (Table B row B9), byte-exact as given under "Exact contracts" |
| create | tests/red-proofs/dream-collect-parse-throw.proofs.json | Table C — `suite` is `tests/unit/dream-collect.test.js` |

### Exact contracts

**The two fixtures, in full.** Each is two lines, each line terminated by `\n`,
no trailing blank line. **They fail at different points on purpose** (Table B
row B9): the first throws *inside* the parse, the second parses cleanly and
throws *after* it.

`tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl` — the second
record's `output_text` block carries a `text` that is an object with a null
`toString`, so `extractMessageText`'s join throws:

```
{"type":"session_meta","payload":{"id":"poisoned-text-block","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/wd-fixture"}}
{"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":{"toString":null}}]}}
```

`tests/fixtures/dream/transcripts/codex-poisoned-session-id.jsonl` — every
block's `text` is an ordinary string, so **the parse returns normally** and the
Extract's `session_id` is the header's non-string `id`; the throw happens later,
at `sanitize(extract.session_id)` during filename derivation:

```
{"type":"session_meta","payload":{"id":{"toString":null},"timestamp":"2026-01-01T00:00:00.000Z","cwd":"/tmp/wd-fixture"}}
{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"a perfectly ordinary message"}]}}
```

**`reports/warnings.md`, in full**, as `composeWarnings` renders it for a ledger
whose only quarantine is one `parse-threw` record keyed at a path whose basename
is `rollout-2026-01-01t00-00-00-abc.jsonl` (`displayName` case-folds and
sanitizes the basename). Blocks are joined by exactly one blank line and the
file ends with a single newline:

```
# Wienerdog warnings

Wienerdog writes this file itself, from its own record of which session
transcripts it could not read. Do not edit it — it is rewritten whenever the list
below changes.

## Current conditions

### Something in the session file stopped Wienerdog from reading it — 1

- rollout-2026-01-01t00-00-00-abc.jsonl
```

**The collector's shape.** `collectExtracts`'s signature and return object are
unchanged. The only change to its result is that `newlyQuarantined` may now
contain elements whose `reason` is `'parse-threw'`; every element's shape is
unchanged — the discovery record spread plus `reason`:

```js
/** @param {ReturnType<import('../paths').getPaths>} paths
 *  @param {import('./ledger').Ledger} ledger
 *  @param {number} maxInputBytes
 *  @param {{preprocessTimeoutMs?:number, now?:()=>number}} [options]
 *  @returns {{entries:Array<object>, scratchDir:string, processed:Array<object>,
 *             newlyQuarantined:Array<{harness:'claude'|'codex', path:string, mtimeMs:number,
 *                                     size:number, dev:number, ino:number,
 *                                     reason:'over-ceiling'|'too-many-lines'|'read-error'|'parse-threw'}>,
 *             …}} — unchanged apart from the widened `reason` union */
function collectExtracts(paths, ledger, maxInputBytes, options)
```

**The console line**, unchanged code, new reason rendered through it:

```
wienerdog: dream — quarantined codex/rollout-2026-01-01t00-00-00-abc.jsonl (parse-threw); it will not be retried until it changes.
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 activation trigger fires on **four** of the seven tests, so the
discipline is on: (ii) a status/result taxonomy is extended — a fourth intake
quarantine reason; (iv) error/fallback behavior changes — a throw becomes a
classified outcome; (v) the task crosses an authority boundary — the collector
emits the reason while the ledger, the warnings file, the digest banner, the
dream report and `doctor` each own their own interpretation of it; (vii) the
same contract appears in multiple mirrored surfaces, enumerated in the checklist
below. Operative prose below cites these tables rather than restating them.

### Contract table(s)

**Table A — the `parse-threw` quarantine reason.** The single place its facts
are decided. Rows A7–A11 are decisions that a surface is **not** changed; they
are in the table because "no edit" is a fact the review must be able to check in
one place.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| A1 | The reason literal | `parse-threw`, written at **exactly one site**: the `catch` arm in `collectExtracts`. Code-owned — never derived from, and never interpolated with, any part of the caught value. |
| A2 | The ledger record | `recordQuarantined` is used **unchanged**: `{fingerprint, outcome:'quarantined', reason:'parse-threw', updated_at, harness}`. No new field, no counter, no stickiness. |
| A3 | Banner decay class | `parse-threw` joins `INFORMATIONAL_QUARANTINE_REASONS` in `src/core/dream/ledger.js:41`, so the digest's informational sentence covers it and decays after `QUARANTINE_BANNER_WINDOW_MS` (7 days), exactly as the three sibling intake reasons do. The `reason?:` union in the `Ledger` typedef (`ledger.js:92`) gains `'parse-threw'`. Mirror: `tests/unit/ledger.test.js:485`. Rationale and the alternative: **owner item 2**. |
| A4 | `reports/warnings.md` | One new `GROUPS` row in `src/core/dream/warnings.js`, placed **after** the `read-error` row and **before** the `SECRET_REVERT_EXHAUSTED_REASON` row: `{ reason: 'parse-threw', heading: 'Something in the session file stopped Wienerdog from reading it' }`. No `note`, no `size`. The full render is under "Exact contracts". |
| A5 | What is never recorded | The caught value is **discarded unbound** (`catch {`, no binding). No message, `name`, `stack`, `code` or any string derived from the thrown value reaches the ledger, the console, `reports/warnings.md`, the dream report, the digest or the scratch directory. The only durable bytes are the code-owned reason literal and the file's existing identity fields (its folded path key, its fingerprint, its harness). |
| A6 | Retry rule | **Unchanged code.** `selectState` already returns `'select'` when a quarantined record's `fingerprint` differs from the file's current `size:mtimeMs:dev:ino`, and `parse-threw` is not sticky (only `secret-revert-exhausted` is). So a crafted file that changes is reprocessed and an unchanged one is `skip-quarantined` — which is what makes this a bounded cost rather than a permanent exclusion, and what lets a genuine future harness-format change heal itself once the file is rewritten. |
| A7 | `wienerdog doctor` | **Not changed by this WP.** `src/cli/doctor.js` is outside the Deliverables, so its reason `switch` hits `default:` and the count renders as `N session transcript(s) are being skipped for a reason this version does not recognize`. Truthful about the count, wrong about the recognition. **Owner item 3.** |
| A8 | The dream console line | **No edit.** `src/cli/dream.js:806-813` interpolates `q.reason` through `ledgerLib.displayName`, so the new reason renders without a wording change. Literal output under "Exact contracts". |
| A9 | The run's report section | **No edit, confirmed by reading `src/core/dream/promote.js:642-644`.** The B1 bullet is built from the `newlyQuarantined` **count** alone and names no reason, so `- N session transcript(s) were set aside by this run and will be skipped from now on, until they change.` already covers a `parse-threw` set-aside truthfully — it is set aside by this run, and A6 makes "until they change" exact. |
| A10 | The digest banner | **No edit.** `quarantineBannerLine`'s informational sentence is one integer plus fixed text plus the pointer to `reports/warnings.md`. |
| A11 | Dry run | **No edit.** `collectExtracts` is the same function in both modes, so `wienerdog dream --dry-run` also catches, also classifies and also completes; `src/cli/dream.js:822` guards the ledger write on `!dryRun`, so a dry run prints `would quarantine … (parse-threw)` and persists nothing. A dry run over a crafted corpus therefore stops aborting too. |
| A12 | ADR status | **No ADR amendment.** The reason takes ADR-0023 §2's intake-quarantine lifecycle verbatim — fingerprint-gated retry, counted by every durable surface, enumerated only in `reports/warnings.md` — and introduces no record field, no counter and no new state, unlike Amendment 1's `secret-revert` pair, which introduced all three. Ratification if the owner wants it: **owner item 2**. |

**Table B — the per-candidate fault boundary in `collectExtracts`.** The single
place its extent is decided.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| B1 | What is inside | Exactly the **content-derived** steps of one loop iteration, in their current order (`scratch.js`, re-derived at `297ef1df`): the `transcripts.parsePrimaryWithOutcome` call (`:149-150`), the non-`ok`-outcome arm (`:151-154`), the read-deferred arm (`:155-158`), the `extractBytes` measurement (`:164`), the individually-oversized arm and its memo write (`:165-169`), the capacity comparison (`:170-173`), the scratch-filename derivation (`:174`), and the `JSON.stringify(extract, null, 2)` that produces the bytes to be written (today the second argument of `:178`; the implementer lifts it into a `let` above the write). **The measurement is now `const extractBytes = intakeBytes` — an assignment of a number the parser returned, not a serialization.** It stays inside the boundary because it belongs to the iteration's ordered preparation, not because it can throw. |
| B2 | On a throw from inside | `newlyQuarantined.push({ ...d, reason: 'parse-threw' })` (Table A row A1) and `continue` — the loop visits the next candidate. The run is not ended, not shortened, and not marked failed. |
| B3 | What a set-aside candidate consumes | **Nothing.** `remaining` is not decremented (`:194`); `intakeBytesTotal` is not incremented (`:193`); no scratch file is written; no element is added to `entries`, `wrote` or `processed` (`:184-192`); **no entry is added to, and none is evicted from, either of the run's gate maps `gateExtracts` and `gateKeyByFile` (`:179-183`)**; `oversizedExtracts[key]` stays deleted, exactly as it is for every other exclusion arm that `continue`s. The gate-map clause is **satisfied by construction, not by new code**: every one of those mutations sits after `writeFilePrivate`, which row B5 puts outside the boundary, so a `continue` from inside can never reach them and **an eviction-adjacent throw cannot leave a stale gate entry**. The fix touches neither map. The clause is written down anyway, because `gateExtracts` is what `src/cli/dream.js` hands the learnings-ledger gate, and a future edit that moved a map write above the boundary's end would silently weaken that gate. |
| B4 | The other arms are untouched | `over-ceiling` (`:86`), the non-`ok` outcome, read-deferred, individually oversized, the capacity stop (`:131-134`) and the deadline stop (`:135-138`) keep their exact current semantics, order and precedence. `continue` and `break` out of the guarded region behave as they do today. |
| B5 | What is outside | `writeFilePrivate` (`:178`) and everything after it — which, since #269, includes the gate-key derivation and both gate-map writes (`:179-183`) as well as the four pushes and the two accumulators (`:184-194`). A failure at the write is **environmental** — a full disk, a revoked permission, a scratch directory that vanished mid-run — and must keep ending the run loudly. Catching it would quarantine every remaining transcript for a machine-wide condition, and A6 would then skip them all until they happened to change. Nothing after the write is content-derived in a way that can throw: the gate key interpolates `extract.session_id`, but `:174`'s `sanitize` has already called `String` on that same value and survived (Current state, note (iii)). |
| B6 | What makes that split safe | `sanitize` gains a width bound: it returns at most `SCRATCH_ID_MAX_CHARS = 128` characters. The derived scratch path is then admissible by construction, so `ENAMETOOLONG` is no longer reachable from file content and every remaining `writeFilePrivate` failure really is environmental. 128 is generous against both harnesses' real ids (UUIDs, 36 characters) and leaves the whole name — `<harness>-<id>.json`, at most 139 bytes — far inside every supported filesystem's 255-byte limit. |
| B7 | Why a boundary and not a list of throwing expressions | The expressions that can throw live in **someone else's grammar** — the shapes Claude Code and Codex CLI choose to write, which change without notice. A list of them is a forbidden-set enumeration and cannot be closed; a fault boundary states our own good instead: *one candidate's preparation either completes or that candidate is set aside*, which holds for every step inside B1, including steps a later package adds. |
| B8 | What is still not caught | Anything thrown before the loop — `transcripts.discover`, `fs.rmSync(scratchDir)`, `mkdirPrivate(scratchDir)` — and anything thrown by a caller of `collectExtracts`. Unchanged, and deliberately so: none of them is per-candidate, so none can be attributed to a file. |
| B9 | **How the extent is proven, and why row B1 needs its own evidence** | A boundary that wraps **only** the parse call, plus row B6's width bound, would satisfy an in-parse failure test, a seam-injected-throw test and a long-id test — and would still abort every nightly run on the documented non-string `session_id`, because that file's parse **returns**. So row B1's extent is proven by a **post-parse** failure whose throw is at `sanitize`/filename derivation: `codex-poisoned-session-id.jsonl`, admitted alongside a healthy file visited **after** it. Criterion 3 asserts it and Table C's `pt-only-parse-is-caught` is its mutation. This row is the reason the fixture set has two members, not one. |

**Table C — the declared RED proofs (ADR-0042).** One file,
`tests/red-proofs/dream-collect-parse-throw.proofs.json`, whose `suite` is
`tests/unit/dream-collect.test.js`; a second suite would need a second file,
and this package adds tests to only one suite that carries proofs.

| Proof id | Criterion | Mutation (exact-substring, in `src/core/dream/scratch.js`) | What it proves |
|----------|-----------|------------------------------------------------------------|----------------|
| `pt-boundary-drops-instead-of-quarantining` | 1, 2 | the `catch` arm's `newlyQuarantined.push({ ...d, reason: 'parse-threw' });` → `/* marker */` (leaving the bare `continue;`) | the assertion observes the **record**, not merely that the run survived: under the mutation the run still completes and the crafted file is silently dropped |
| `pt-reason-literal-pinned` | 1 | `reason: 'parse-threw'` → `reason: 'read-error'` | the assertion pins the literal, not just "some quarantine happened" |
| `pt-only-parse-is-caught` | 3 | the `catch` arm gains a leading re-throw guarded on the parse having already returned — `if (extract !== undefined) throw new Error('<marker>');` before the existing push. `extract` is one of the four names the parse call destructures (`scratch.js:149-150`) and is assigned the moment that call returns, so the guard is true for **exactly** a post-parse failure | **the boundary's extent (Table B row B9).** The mutation *is* the plausible wrong implementation — catch the parse, nothing after it — so criteria 1 and 2 stay green under it and only criterion 3 reddens. A criterion-3 test that passed here would be observing nothing |
| `pt-sanitize-unbounded` | 8 | `.slice(0, SCRATCH_ID_MAX_CHARS)` → `/* marker */` | the width bound is what admits a long-session-id rollout; without it the run aborts in `writeFilePrivate` |

**Binding on every test in this package, not a suggestion:**
`scripts/red-proofs.js:1655` refuses any red whose failure `code` is not
`ERR_ASSERTION` — *"a thrown error is not an assertion failure"* — so a
mutation that makes production code **throw** is unprovable unless the test
asserts on a value instead of letting the throw escape its body. Every test
whose expected outcome is a **successful collection** therefore wraps the
`collectExtracts` call in `assert.doesNotThrow`, which was measured on this
tree's Node to report `AssertionError` with `code: 'ERR_ASSERTION'`. This
applies to criteria 1, 3 and 8 at minimum — `pt-only-parse-is-caught` and
`pt-sanitize-unbounded` both redden by making the collector throw.

`testNamePattern` for all four is `\\[PT-`, so every new test in this package
carries a `[PT-<n>]` tag in its name and a filtered run selects exactly them.
**The `expectRed` test-name sets are `derived — the implementer measures and
corrects`:** the tests do not exist yet, so the exact names cannot be measured
from this tree. The sentences that depend on those sets, and that must be
re-read once measured, are: this table's "Criterion" column; the
`pt-boundary-drops-instead-of-quarantining` row's "What it proves" cell, which
asserts that **two** criteria's assertions redden; the `pt-only-parse-is-caught`
row's "What it proves" cell, which asserts that criteria 1 and 2 stay **green**
under it and that **only** criterion 3 reddens; the paragraph above naming
criteria 1, 3 and 8 as the `assert.doesNotThrow` sites; acceptance criterion 10
and its count of **four**; and the `npm run red-proofs` line under
"Verification steps".

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
canonical table and a registered mirror disagree (update-all-mirrors) — and any
new mirror found in review is added here on the spot (register-new-mirrors).

- [ ] Deliverables-table cells that restate a path or rule — each row cites the
      table that decides it: `scratch.js` → Table B plus Table A rows A1 and A5;
      `ledger.js` → Table A row A3; `warnings.js` → Table A row A4;
      `dream-collect.test.js` → Table B plus Table A rows A1, A5, A6;
      `ledger.test.js` → Table A row A3; `dream-warnings.test.js` → Table A row
      A4; the **two** fixtures → "Exact contracts", with the post-parse one also
      citing Table B row B9; the proofs file → Table C
- [ ] Acceptance criteria that assert its facts — criteria 1 and 6 assert Table
      A rows A1 and A6; criterion 2 asserts Table B rows B1, B2 and B4;
      **criterion 3 asserts Table B rows B1 and B9** (the boundary's extent past
      the parse call); criterion 4 asserts Table A row A5 and Table B row B3;
      criterion 5 asserts Table A row A4; criterion 7 asserts Table B row B5;
      criterion 8 asserts Table B row B6; criterion 9 asserts Table A row A3;
      criterion 10 asserts Table C
- [ ] Verification commands / greps — the `node -e` boundary gate asserts Table A
      rows A1 and A5 and Table B rows B2, B3 (including B3's gate-map clause,
      via `checkGateMap`), B6 and B9 on real corpora, in three
      cases whose numbering maps to criteria 1, 3 and 8 in that order; the two
      `grep` gates assert Table A row A1's **one site** and row A5's unbound
      `catch`; `npm test` carries every criterion's suite assertions; the
      **UNFILTERED** `npm run red-proofs` asserts Table C — a `--wp`-scoped run
      is `RUN: FILTERED`, exit 1, by construction and cannot satisfy criterion
      10
- [ ] Current-state description — the loop's line citations and arm order (Table
      B rows B1 and B4), the four measured aborts (Table B rows B1 and B6 for
      what each one is covered by, and row B9 for why abort 4 is the one that
      decides the boundary's extent), the ledger record shape and `selectState`'s
      fingerprint rule (Table A rows A2 and A6), `INFORMATIONAL_QUARANTINE_REASONS`
      and its test pin (Table A row A3), `GROUPS` and its catch-all row (Table A
      rows A4 and A7), and the "surfaces that need no change" paragraph (Table A
      rows A8, A9, A10, A11) — plus the `297ef1df` base pin and the 2026-09-18
      re-derivation, which the Definition of done also names
- [ ] Operative prose steps that apply it — **walked, in document order**:
      - Context's closing paragraph ("closes it on the collector side … the
        guarantee this buys is closed") → Table B rows B2 and B7
      - Current state's item 4 ("so a try/catch around the parse call alone
        would not cover it") → Table B row B1's extent, row B6 and **row B9**,
        which is the same claim turned into evidence
      - "Exact contracts": the **in-parse** fixture → criterion 1's corpus; the
        **post-parse** fixture → criterion 3's corpus and Table B row B9; the
        `reports/warnings.md` render → Table A row A4; the console line → Table A
        row A8; the `collectExtracts` JSDoc's widened `reason` union → Table A
        row A1
      - the Contract-reference preamble's four ADR-0031 tests → Table A row A3
        (taxonomy), Table B row B2 (error behavior), Table A rows A7–A11
        (authority boundary), and this checklist (mirrored surfaces)
      - Table C's binding `assert.doesNotThrow` paragraph → Table B row B9 (the
        mutation it exists to make provable) and criteria 1, 3 and 8
      - Implementation notes' "order the change this way" bullet → Table B rows
        B1 and B5; its "no new reason lifecycle" bullet → Table A rows A2, A6 and
        A12; its "both fixtures stop throwing" bullet → Table A row A1, Table B
        row B9 and Out of scope's parser-hardening entry
      - the Security checklist's second and third bullets → Table A row A5 and
        Table B row B6
      - Out of scope's collision note → Table B rows B1 and B5 (what the
        successor package must preserve when it rewrites the same call site)
      - Dispatch precondition items 1, 2 and 3 → Out of scope's parser-hardening
        entry, Table A rows A3 and A12, and Table A row A7 respectively

## Implementation notes & constraints

- **No new npm dependencies** (CLAUDE.md), no TypeScript, JSDoc annotations
  only, and nothing that outlives the process (ADR-0004). This package adds one
  `try`/`catch`, one `.slice`, two literal table rows and a constant.
- **Order the change this way, over the post-#269 loop shape.** Lift the parse
  call (`scratch.js:149-150`), the four existing exclusion arms, the measurement
  (`:164`), the filename derivation (`:174`) and the payload stringify (today
  `:178`'s second argument) into one `try` block. The parse call now destructures
  **four** names, so declare `extract`, `gateExtract`, `intakeBytes`, `parse`,
  `extractBytes`, `scratchFile` and the payload string with `let` above the
  `try` and assign the parse result with a parenthesized destructuring
  assignment. Leave `writeFilePrivate` and **everything after it** outside — the
  two gate-map writes and the eviction (`:179-183`) as well as the four pushes
  and the two accumulators (`:184-194`) (Table B rows B1, B3, B5).
  `continue` and `break` from inside a `try` are ordinary control flow and keep
  the arms' current behavior (Table B row B4) — this is a re-indentation plus a
  `catch`, not a rewrite of the loop's logic.
- **The caught value is not bound.** Write `} catch {`, not `} catch (e) {`.
  A binding invites a later edit to log it, and Table A row A5 is the reason
  there must be nothing to log: the headless nightly run's console output is
  captured to a durable log file, so "just the console" is not a non-durable
  surface.
- **No new reason lifecycle.** Do not add a field, a counter, a sticky arm or a
  `selectState` branch. `recordQuarantined` already passes any reason through,
  and `selectState`'s existing fingerprint comparison already gives Table A row
  A6's retry-on-change for free (Table A rows A2, A12).
- **Both fixtures stop throwing once the parsers are hardened.** Criteria 1 and
  3 are real end-to-end proofs *on this tree*, and they are deliberately
  fail-loud rather than silently vacuous: when the parser-hardening successor
  lands, `codex-poisoned-text-block.jsonl` parses cleanly and
  `codex-poisoned-session-id.jsonl`'s non-string `payload.id` falls back to the
  basename, so **both** sessions are admitted and **both** criteria fail with a
  red CI rather than passing over nothing. That successor must re-point or retire
  them together, and Out of scope names it. The boundary itself is proved by two
  fixture-independent means that cannot go vacuous whatever the parsers do:
  criterion 2's seam-injected throw, and Table C's `pt-only-parse-is-caught`
  mutation, which is what holds Table B row B9's extent claim up.
- **Known trap: the RED runner accepts only `ERR_ASSERTION`.** See the note
  under Table C.
- **`tests/unit/dream-collect.test.js` has been appended to by three packages.**
  Its current tail at `297ef1df` is `WP-dream-primary-dialogue-collection`'s
  block (the file ends at line 1656 with that package's cached-oversized-memo
  test), which followed `WP-secret-sink-wiring-probes`' sink probe and
  `WP-dream-report-run-skips`' partition tests. Append after all three, so the
  diff is an append rather than an interleave. Read the tail before editing.
- The suite's existing `assertPartition` helper requires every discovered file
  to be counted exactly once across the arms; a `parse-threw` set-aside lands in
  `newlyQuarantined`, so the helper holds unchanged — keep it holding.
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] Any untrusted identifier (version, name, path segment, filename) that flows
      into a filesystem path or a shell command is validated with a **fully
      anchored** pattern that rejects `/`, `\`, and `..`, in **every** language it
      passes through (e.g. JS `isSemver` AND the bash/PowerShell regex). A
      start-anchored-only check accepts `1.2.3/../../x` and becomes an
      arbitrary-write primitive (WP-022, WP-055). **Anchor correctly per engine:**
      in .NET/PowerShell `^…$` still matches *before* a trailing newline — use
      `\A…\z`; in JS `$` without the `m` flag is safe; in POSIX `grep` remember it
      is line-oriented (a multiline value with one valid line matches `^…$`), so
      confirm the value cannot contain a newline (WP-057).
- [ ] **Applied here:** the one untrusted identifier reaching a path is
      `extract.session_id`, and `sanitize` is a **character allowlist**, not a
      rejection list — `[^A-Za-z0-9_-]` → `_` globally, which already cannot
      emit `/`, `\`, `.` or a newline. Table B row B6 adds a width bound to that
      same allowlist and removes nothing from it. Confirm the `.slice` is applied
      **after** the replace, so a long id cannot be truncated into something the
      allowlist never saw.
- [ ] **No attacker-chosen byte becomes a durable string.** Table A row A5: the
      reason is a code-owned literal, the record's other fields are the folded
      path key, the fingerprint and the harness, and the exception is discarded
      unbound. Confirm by the `node -e` gate's field check and by reading the
      `catch` arm.
- [ ] **The new reason cannot launder ledger state.** A `parse-threw` record is
      written by the same `recordQuarantined` as its three siblings and has the
      same authority as `too-many-lines` — no more. It cannot hide a
      secret-revert count that the existing reasons could not: `recordQuarantined`
      overwrites a key wholesale for **every** reason, and `too-many-lines` is
      already reachable from file content alone (500,000 lines), so this package
      adds no new overwrite primitive. Confirm that no code path reads
      `reason === 'parse-threw'` to make a decision — only to render.

## Acceptance criteria

- [ ] 1. **The run survives a crafted transcript, and the crafted transcript is
      named.** Given a corpus of N healthy sessions plus the **in-parse** fixture
      rollout (`codex-poisoned-text-block.jsonl`), `collectExtracts` returns; all
      N healthy sessions are in `entries`; and the crafted file appears exactly
      once in `newlyQuarantined` with `reason === 'parse-threw'` (Table A rows
      A1, A6).
- [ ] 2. **The boundary is not parser-specific.** With a throw injected at the
      `transcripts` parse seam for one candidate only, that candidate is
      classified `parse-threw` and the loop continues to the next; the other
      arms' classifications for the remaining candidates are unchanged (Table B
      rows B1, B2, B4).
- [ ] 3. **The boundary extends past the parse call — a POST-parse failure is
      caught too.** Given the **post-parse** fixture rollout
      (`codex-poisoned-session-id.jsonl`, whose parse **returns** and whose throw
      is at `sanitize`/filename derivation) plus at least one healthy session
      whose mtime places it **after** the crafted file in the newest-first visit
      order: `collectExtracts` returns, the crafted file is in `newlyQuarantined`
      with `reason === 'parse-threw'`, **and the following healthy session is
      still in `entries`** (Table B rows B1, B9). Criteria 1, 2 and 8 are all
      satisfiable by a boundary that wraps only the parse call; this one is not.
- [ ] 4. **A set-aside candidate consumes nothing and records nothing derived
      from the throw.** Its `newlyQuarantined` element has exactly the discovery
      record's keys plus `reason`; `remaining` is unchanged by it (a later
      candidate that fits still fits); `intakeBytesTotal` is unchanged by it;
      no scratch file is written for it; **`sel.gateExtracts` holds no entry for
      it, and the entry an earlier colliding session put there is not evicted by
      it**; and no
      substring of the thrown value's message, name or stack appears in the
      element, the written ledger, the rendered `reports/warnings.md` or the
      scratch directory (Table A row A5, Table B row B3).
- [ ] 5. **`reports/warnings.md` renders it under its own heading**, byte-exact
      as given under "Exact contracts", and an unrecognized reason still falls to
      the catch-all row (Table A row A4).
- [ ] 6. **Retried on change, skipped while unchanged.** Two consecutive runs
      over an unchanged crafted file yield the file in `newlyQuarantined` on the
      first and in `skippedQuarantined` on the second; rewriting the file makes
      it a candidate again (Table A row A6).
- [ ] 7. **A write failure still ends the run.** A `writeFilePrivate` failure
      propagates out of `collectExtracts` and is not classified as
      `parse-threw` (Table B row B5).
- [ ] 8. **A long session id no longer aborts the run.** `sanitize` returns at
      most 128 characters, and a Codex rollout whose `session_meta.id` is 4,000
      characters is admitted normally, with a scratch filename of at most 139
      bytes (Table B row B6).
- [ ] 9. **`parse-threw` decays with its siblings.** It is a member of
      `INFORMATIONAL_QUARANTINE_REASONS`, and — observed through
      `quarantineBannerLine`, which is the exported surface;
      `hasFreshInformationalQuarantine` is module-private — a ledger holding one
      `parse-threw` record renders a banner at day 0 and `''` at day 8, matching
      `read-error` exactly, while a ledger holding one unrecognized reason still
      renders at day 8 (Table A row A3).
- [ ] 10. **The declared RED proofs are `PROVEN`.** The **UNFILTERED**
      `npm run red-proofs` reports `RUN: PROVEN` with `PROVEN` for all **four**
      declarations in Table C, and reports no `FILTERED`, `VACUOUS`,
      `UNCONTROLLED`, `FAILED` or `ERROR` verdict. A `--wp`-scoped run cannot
      satisfy this criterion — see the note under "Verification steps".
- [ ] 11. `N/A — this WP ships no command and writes nothing outside the repo;
      the dream's own run-to-run idempotence over a quarantined file is what
      criterion 6 asserts.`

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm run red-proofs   # UNFILTERED. See the note below before reaching for --wp.
```

**The red-proofs line is the unfiltered run, and that is not a preference.**
`--wp <id>` leaves every other package's declarations unselected;
`rollUp` (`scripts/red-proofs.js:2152-2154`) marks any pair with a left-out
declaration `FILTERED`, the run verdict is the worst pair verdict, and the exit
code is `verdict === 'PROVEN' ? 0 : 1` (`:1893`). So a scoped run reports
`RUN: FILTERED` and exits **1** however green its selected proofs are, and
criterion 10 — which requires `PROVEN` and no `FILTERED` — can only be read off
the unfiltered run. The `--wp` form is a fast non-gating reading while
iterating. The unfiltered run takes 15–20 minutes: redirect its whole output to
a file, wait on its own PID, and read the `RUN:` line from the file. **This is a
recurring trap** — it has now been recorded twice, in
`WP-quarantine-failed-preserve-disposal-flush` (erratum 1, fixed on its branch
before merge) and in `docs/specs/done/WP-dream-primary-dialogue-collection.md`
(Erratum 7).

```bash
# Table A row A1: the reason literal has exactly ONE site.
test "$(grep -c "reason: 'parse-threw'" src/core/dream/scratch.js)" = 1 && echo "ONE SITE OK"

# Table A row A5: the caught value is discarded unbound.
test -f src/core/dream/scratch.js \
  && grep -q '} catch {' src/core/dream/scratch.js \
  && ! grep -qE '\} catch \(' src/core/dream/scratch.js \
  && echo "UNBOUND CATCH OK"
```

```bash
# The boundary gate: Table A rows A1 and A5, Table B rows B2, B3, B6 and B9, on
# real corpora built in throwaway temp directories. Run from the repo root.
# Case 2 is the one that fails under a boundary wrapping only the parse call.
node -e "
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collectExtracts}=require('./src/core/dream/scratch');
const {getPaths}=require('./src/core/paths');
const F='tests/fixtures/dream/transcripts/';
const bad=[];
const mk=()=>fs.mkdtempSync(path.join(os.tmpdir(),'wd-pt-gate-'));
const run=(r)=>collectExtracts(getPaths({HOME:r,WIENERDOG_HOME:path.join(r,'wd'),CLAUDE_CONFIG_DIR:path.join(r,'claude'),CODEX_HOME:path.join(r,'codex')}),{version:1,baseline_mtime:{claude:null,codex:null},files:{}},10485760,{});
const claude=(r,i,when)=>{const d=path.join(r,'claude','projects','p');fs.mkdirSync(d,{recursive:true});const f=path.join(d,'0000000'+i+'-0000-0000-0000-000000000000.jsonl');fs.writeFileSync(f,JSON.stringify({type:'user',sessionId:'s'+i,message:{role:'user',content:'hello'}})+'\n');if(when)fs.utimesSync(f,when,when);};
const codex=(r,name,body,when)=>{const d=path.join(r,'codex','sessions','2026','01','01');fs.mkdirSync(d,{recursive:true});const f=path.join(d,name);fs.writeFileSync(f,body);if(when)fs.utimesSync(f,when,when);};
const fields=['harness','path','mtimeMs','size','dev','ino','reason'];
const checkRecord=(q,where)=>{
  const extra=Object.keys(q).filter((k)=>!fields.includes(k));
  if(extra.length)bad.push(where+': the set-aside record carries fields beyond the discovery record and the reason: '+extra.join(','));
  if(/TypeError|primitive|at Object|\.js:[0-9]/.test(JSON.stringify(q)))bad.push(where+': the caught error leaked into the set-aside record');
};
// Row B3, post-#269: a set-aside candidate leaves NO entry in the run's
// in-memory gate map, which is what src/cli/dream.js hands the learnings-ledger
// gate. No collision in these corpora, so one gate entry per admitted session.
const checkGateMap=(res,where)=>{
  if(res.gateExtracts.size!==res.entries.length)bad.push(where+': the gate map does not match the admitted set: '+res.gateExtracts.size+' entries for '+res.entries.length+' admitted');
};
// CASE 1 - an IN-PARSE failure beside two healthy sessions.
let r=mk();claude(r,0);claude(r,1);codex(r,'rollout-a.jsonl',fs.readFileSync(F+'codex-poisoned-text-block.jsonl','utf8'));
let res=null;try{res=run(r);}catch(e){bad.push('case 1: the run ABORTED on a crafted transcript: '+e.message);}
if(res){
  if(res.entries.length!==2)bad.push('case 1: healthy sessions were lost: '+res.entries.length+' of 2');
  const q=res.newlyQuarantined.filter((x)=>x.reason==='parse-threw');
  if(q.length!==1)bad.push('case 1: not set aside as parse-threw: '+JSON.stringify(res.newlyQuarantined.map((x)=>x.reason)));
  else checkRecord(q[0],'case 1');
  checkGateMap(res,'case 1');
}
// CASE 2 - a POST-parse failure (the parse RETURNS) visited BEFORE a healthy
// session, which must still be admitted. Newest mtime is visited first.
r=mk();claude(r,2,new Date('2026-01-02'));codex(r,'rollout-b.jsonl',fs.readFileSync(F+'codex-poisoned-session-id.jsonl','utf8'),new Date('2026-01-09'));
res=null;try{res=run(r);}catch(e){bad.push('case 2: the run ABORTED on a post-parse failure — the boundary does not extend past the parse call: '+e.message);}
if(res){
  const q=res.newlyQuarantined.filter((x)=>x.reason==='parse-threw');
  if(q.length!==1)bad.push('case 2: not set aside as parse-threw: '+JSON.stringify(res.newlyQuarantined.map((x)=>x.reason)));
  else checkRecord(q[0],'case 2');
  checkGateMap(res,'case 2');
  if(res.entries.length!==1)bad.push('case 2: the healthy session visited AFTER the crafted one was not admitted: '+res.entries.length+' of 1');
}
// CASE 3 - a 4000-character session id is admitted, with a bounded filename.
r=mk();codex(r,'rollout-c.jsonl',JSON.stringify({type:'session_meta',payload:{id:'A'.repeat(4000),timestamp:'2026-01-01T00:00:00.000Z',cwd:'/w'}})+'\n'+JSON.stringify({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'hi'}]}})+'\n');
try{
  const s=run(r);
  if(s.entries.length!==1)bad.push('case 3: a 4000-character session id was not admitted: '+s.entries.length+' of 1');
  else{const n=path.basename(s.entries[0].scratchFile);if(n.length>140)bad.push('case 3: the scratch filename is unbounded: '+n.length+' bytes');}
}catch(e){bad.push('case 3: a 4000-character session id ABORTED the run: '+e.message);}
if(bad.length){console.error(bad.join(' | '));process.exit(1);}
console.log('PARSE-THROW BOUNDARY OK');"
```

## Out of scope (do NOT do these)

- **Hardening the parsers themselves** — adding `typeof … === 'string'` checks
  to the four content joins in `src/core/transcripts/codex.js` and
  `src/core/transcripts/claude.js`, and accepting `session_meta.id`,
  `sessionId`, `cwd` and `timestamp` only as the strings the `Extract` typedef
  declares them to be. This is belt-and-braces over the guarantee this package
  ships, it is where **owner item 1** puts a successor package, and it is what
  will make **both** fixtures stop throwing, failing criteria 1 and 3 loudly
  (see Implementation notes). Do not touch `src/core/transcripts/` here.
- **`src/cli/doctor.js`** — Table A row A7 and **owner item 3**.
- **Collision, resolved: `WP-dream-primary-dialogue-collection` HAS LANDED**
  (PR #269, merge `297ef1df`, now `docs/specs/done/`) **and rewrote the same
  admission loop and the same test file.** It swapped
  `parseWithOutcome` for `parsePrimaryWithOutcome`, moved capacity measurement to
  `intakeBytes` instead of `Buffer.byteLength(JSON.stringify(extract))`, added
  the gate maps after the write, and its Deliverables cell states that `sanitize`
  at `scratch.js:18-20` is not changed — a sentence this package falsifies
  (Table B row B6), and one that belongs to a spec now filed `Done`.
  **The rebase is DONE: this spec was re-pinned to `297ef1df` on 2026-09-18**
  and every cite below is derived against that shape, so there is nothing left to
  reconcile at dispatch beyond re-running the Current-state reading. The
  invariants that survived the rebase, restated: the parse call, the measurement
  and the filename derivation are **inside** the boundary (Table B rows B1, B9),
  and `writeFilePrivate` and everything after it — including the gate maps — is
  **outside** it (rows B3, B5). Do not edit that spec from this package.
- **Scratch filename collisions**, a pre-existing residual this package widens
  slightly and does not fix. `sanitize` maps every byte outside
  `[A-Za-z0-9_-]` to `_`, so two session ids differing only in excluded bytes
  already collide today and the second write overwrites the first; Table B row
  B6's 128-character bound adds ids sharing a 128-character allowlisted prefix
  to that set. It is **already routed**: `WP-dream-primary-dialogue-collection`
  records the same defect under its own Discovered issues (its Table row C4a
  executes the `s_1` / `s.1` case and states that the overwritten session's
  dialogue is silently lost and never retried) and deliberately does not fix it
  either. Do not attempt it here.
- Any change to the ledger's record shape, to `selectState`, to
  `secretDeferralCount`, or to the secret-revert deferral lifecycle.
- Any change to the digest banner, the dream report section or the console line
  (Table A rows A8, A9, A10).

## Dispatch precondition — owner items

Every item below is **a recommendation adopted under standing authorization, not
a direct ruling** — the standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the
architect records a recommendation with the cost of overruling it, the session
may dispatch under that recommendation, and **the owner reverses any of them by
dated amendment**, applied to this spec by a committed revision rather than by a
dispatch message, because `scripts/boundary-check.js` reads the Deliverables
table in this file and nothing a message says changes what CI sees. **Nothing in
this repository records the owner approving, accepting or ratifying any of them,
and this spec asserts no such acceptance.** Each was raised by the architect
during round zero and carried through design-review round 1, dispositioned in
`docs/specs/logbook/2026-09-17-dream-collect-parse-throw-quarantine.md`.

**1. Should the parser hardening land in this package, or as a successor?**

- *Recommendation:* **a successor package.** Keeping them apart keeps this one
  S and keeps two different kinds of change apart: the boundary is pure
  containment and changes no output for any input, while the hardening changes
  what the default parser emits for hostile input — which is the surface
  `WP-dream-primary-dialogue-projection` built its "default parser output is
  byte-identical" law on. Measured on this tree: the hardening (four content
  joins plus the seven metadata fields) breaks **zero** existing tests and
  **zero** golden files — `tests/golden/` holds adapter, digest and vault
  outputs and no transcript-parse output at all — so deferring it costs nothing
  and risks nothing.
- *Overrule cost:* fold `src/core/transcripts/codex.js`,
  `src/core/transcripts/claude.js`, `tests/unit/transcripts.test.js`, two more
  fixtures and a second `.proofs.json` (its `suite` would be
  `tests/unit/transcripts.test.js`) into this package. Roughly eleven added
  one-line conditions plus their tests; **the size becomes M**, and criteria 1
  and 3's fixture-based assertions must both be re-pointed within the same
  package rather than by a successor.

**2. Is `parse-threw` an informational (decaying-banner) reason, and does the
taxonomy extension need an ADR-0023 amendment?**

- *Recommendation:* **informational, and no amendment** (Table A rows A3, A12).
  Informational, because after night one the condition is standing state rather
  than news: the dream keeps working over every other session, and
  `reports/warnings.md` and `wienerdog doctor` never decay. Leaving it *out* of
  the set is the fail-loud option the code's own comment argues for, but here it
  hands a third party a permanent channel — anyone who can cause one crafted
  file to be written can pin a warning into the user's digest forever, which is
  exactly the banner-blindness Amendment 2 was written to stop. No amendment,
  because the reason adds no record field, no counter and no new state.
- *Overrule cost:* leaving it out of `INFORMATIONAL_QUARANTINE_REASONS` is one
  line less in `ledger.js` and no change to `tests/unit/ledger.test.js:485`, and
  criterion 9 inverts. Ratifying the taxonomy extension is a separate docs-only
  ADR-0023 Amendment 4 work package (S), with no code change and no effect on
  this one.

**3. May the Deliverables be extended by one file, `src/cli/doctor.js`?**

- *Recommendation:* **yes, extend it.** As drafted, `wienerdog doctor` will tell
  the user that sessions are *"being skipped for a reason this version does not
  recognize"* about a reason this version itself emits (Table A row A7). The fix
  is one `switch` arm, one message in the existing shape
  (`N session transcript(s) are being skipped: something in the session file
  stopped Wienerdog from reading it`) and one assertion in
  `tests/unit/doctor.test.js`.
- *Overrule cost:* accept that line for one release. The count stays exact and
  `reports/warnings.md` — the enumeration's one home — is already correct, so
  nothing is *wrong*, only confusing. A follow-up S package corrects it.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) The design gate is **closed at round 1**,
   which is what makes this spec `Ready` (`docs/runbooks/codex-review.md`,
   "Weighted closure"): one external round on `gpt-6-astra` after two
   provider-refused attempts, verdict `needs-attention` with the **product
   clean**, and one LIGHT machinery finding fixed and verified. The round, its
   disposition and the two refusals are in
   `docs/specs/logbook/2026-09-17-dream-collect-parse-throw-quarantine.md`, with
   the raw, both focus texts and the meta preserved beside it before
   adjudication. (b) The owner items travel with this package as
   **recommendations adopted under standing authorization**; any the owner
   reverses by dated amendment is applied by a committed revision, never by a
   dispatch message. (c) **The dispatch order is SATISFIED:**
   `WP-dream-primary-dialogue-collection` merged as PR #269 (`297ef1df`) on
   2026-09-18 and is filed `Done`. That is why `depends_on` names it — the
   dependency is merge order, not contract; this package needs nothing that
   package produces. **This package is now dispatchable.**
   (d) **Every cite is pinned to base `297ef1df` and was re-derived by construct
   on 2026-09-18**, both ends of every range, with the old→new table in
   `docs/specs/logbook/2026-09-18-dream-collect-parse-throw-quarantine-repin.md`.
   Table B row B1's extent was re-established over the post-#269 loop shape and
   no contract row's rule changed. Re-run the Current-state reading before
   writing code, and if anything has landed in `src/core/dream/scratch.js` or
   `src/cli/dream.js` since `297ef1df`, re-derive those cites again construct by
   construct — that file pair is the one sibling packages keep moving.
   (e) Branch `wp/dream-collect-parse-throw-quarantine`.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled `fix(dream): title (WP-dream-collect-parse-throw-quarantine)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
