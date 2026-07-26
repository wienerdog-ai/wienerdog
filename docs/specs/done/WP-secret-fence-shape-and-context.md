---
id: WP-secret-fence-shape-and-context
title: Replace the context-free high-entropy rule with unbounded reach-scanning, shape-aware arms
status: Superseded
model: opus
size: M
depends_on: [WP-secret-scan-baseline-oracle]
adrs: [ADR-0024, ADR-0031]
epic: secret-lifecycle
---

# WP-secret-fence-shape-and-context: a high-entropy rule that fires on secrets, not on file paths

> **SUPERSEDED 2026-07-25 — do not implement, do not patch.** Six adversarial
> rounds produced a fail-open critical in **five consecutive** ones; every fix
> relocated the hole rather than closing it. The proven invariant is that
> **suppression plus any selective extraction is fail-open**, and exhaustive
> extraction measures quadratic (a DoS at the 256 KiB cap). The design is dead;
> the *evidence* is kept, which is why this file was filed rather than deleted —
> its measurement corpus, adversarial families and 528 MB transcript baseline are
> salvage, and two of its findings (the delimiter-agreement class, and the
> entropy-cloaking measurement) already fed the replacement.
>
> Replaced by the chain `WP-secret-scan-baseline-oracle` →
> `WP-secret-scan-whole-token-runs` → `WP-secret-allowlist-exact-value-store` →
> `WP-quarantine-review-cli`, under ADR-0033. The reframe that unblocked it:
> with *destructive* false positives you need a precise detector, which is why
> this spec's complexity spiralled; once false positives became non-destructive
> (`WP-secret-revert-defers-ledger`, merged `efd1489`) and reviewable, a blunt,
> provably fail-closed detector beats a precise one nobody can prove correct.
> Full narrative: `docs/specs/logbook/2026-07-25-secret-fence-destructive-false-positives.md`.
>
> Everything below this line is the superseded design, preserved unedited.

---

> **BLOCKED — do not implement.** This spec cannot leave `Draft` until the
> **OWNER-APPROVED** section below is filled in and dated. That section is
> deliberately **empty**; nobody has signed off on the threshold values or the
> detection softening yet. An implementer who finds it still empty must stop and
> say so.
>
> **This WP also cannot start until `WP-secret-scan-baseline-oracle` has
> merged.** That WP is a real prerequisite, not a formality: three of this WP's
> five non-source deliverables are *modifications* of files it creates, and every
> `old` column this WP relies on is asserted there against a frozen oracle. If
> `tests/fixtures/secret-scan-corpus.js` does not exist on `main`, stop.
>
> **Naming.** The slug keeps the historical word *fence*; the canonical
> `docs/GLOSSARY.md` terms are **secret scan / `scanAndRedact`** (the detector)
> and **secret quarantine** (the outcome). The gate this WP's incident happened
> at is ADR-0024's **EP2, the staged brain-output gate**. Use those terms in code
> comments, tests, commit messages and the PR body; "secret fence" appears
> nowhere but the slug. This WP introduces no new glossary term, so
> `docs/GLOSSARY.md` is not a deliverable.

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent Claude/Codex sessions into the
user's markdown vault. Before anything is committed, every staged note passes
ADR-0024's **EP2 staged-output gate**: `src/core/dream/validate.js:934` calls the
ONE shared detector `scanAndRedact` (`src/core/secret-scan.js`) on the added
content and, if it returns **any** finding of **either** severity, reverts the
whole note — the note is not committed, a byte-identical copy is dropped in
`state/quarantine/`, and a warning is surfaced. The same detector gates three
digest sections at **EP4** (`src/core/digest.js:506,521,543`, also on
`findings.length > 0`) and sanitizes five other durable-output sinks through
`redactOnly` (Table F).

The detector has two layers. **Eighteen labelled rules** (private-key blocks,
provider prefixes `sk-ant-`/`sk-proj-`/`sk-`/`AKIA`/`gh[pousr]_`/`xox`/`ya29.`/
JWT/`GOCSPX-`/`1//0`/`AIza`/`sk_live_`/`rk_live_`/`pk_live_`, bearer headers,
sensitive `key=value` assignments, JSON values under a sensitive key) are precise
and contextual. Behind them sits one **context-free entropy pass**: any run of
24+ characters from `[A-Za-z0-9+/=]` whose Shannon entropy is ≥ 3.5 bits/char is
labelled `high-entropy` at `quarantine` severity.

**That entropy pass is the bug.** Its character class includes `/` but excludes
`-` and `_`, so it slices *fragments* out of longer words; and 3.5 bits/char is
*below* the entropy of ordinary mixed-case prose. Measured against the
maintainer's real vault: **102 of 180 notes (56.7%) contain at least
one match and would be reverted by EP2.** The matches are things like
`Projects/wienerdog/current` (a fragment of
`[[01-Projects/wienerdog/current-state]]`, 3.70 bits/char) and
`local/share/claude/versions` (3.65).

This is not theoretical. On **2026-07-24** the live dream reverted three
legitimate notes — the day's daily log, an updated `claude-code-keychain-auth`
resource note, and the dream report itself. Because the transcript ledger had
already marked those sessions processed, the content will not be regenerated:
**the gate silently destroyed a day of the user's memory.** The same rule
withholds digest sections at `SessionStart`, so the loss is not confined to the
vault.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP starts no process; it
rewrites one function and extends fixtures and tests that already exist.

### The invariant that must not weaken

ADR-0024's layered lifecycle is **fail-closed**: a real credential must never
reach a durable artifact. This WP may not trade away credential-grade detection
to buy a lower false-positive rate. Both gates cited above trigger on
`findings.length > 0` — **either severity** — so lowering `high-entropy` from
`quarantine` to `redact` would change nothing at the gates; ADR-0024 also
rejected that option explicitly ("an unstructured high-entropy blob has no safe
partial form"). The fix must therefore be in **detection**, not severity.

Concretely, that rules out the obvious-looking fix of *rejecting a whole token
because most of it looks like prose*. `0123456789abcdef0123456789abcdef-foo`
would then be waved through even though its first 32 characters are a hex
credential. The design below therefore **enumerates credential-shaped spans
inside a token (Table A) and runs each span down one fixed precedence ladder
(Table B)**. Five properties are load-bearing, and each was found missing in an
earlier review round:

1. A suppressor disqualifies **only the span it matched** — never a span nested
   inside it (Table A row A8).
2. A suppressor sits **below** the structured arm on the ladder, so a benign
   *shape* can never veto a structured credential (Table B, P1 above P3).
3. **Delimiter closure.** The set of characters at which span extraction cuts and
   the set at which the benign-shape suppressor cuts are **the same set**,
   because both are derived from one constant (Table A0). Round 3 got this
   wrong: `+` was in the span alphabet and in the suppressor's split set but in
   neither extraction level, so a 33-character word prefix could buy suppression
   of a 66-character span whose second half was a 32-character credential that
   was never evaluated on its own. Table A0 makes that class unrepresentable.
4. **Multi-piece completeness (round 5).** Cutting a run at delimiters is not
   enough if the credential *itself contains a delimiter*: the pieces fall below
   the length floor and the credential never exists as a candidate at all.
   Extraction must span multiple segments.
5. **No truncating bound anywhere in extraction (new in round 6, and the reason
   this round exists).** Round 5 satisfied property 4 with *contiguous groups of
   at most eight segments*. A bound is a hit cap, and a hit cap that stops
   enumerating and reports nothing is a **fail-open** design. Extraction must
   therefore have **no** parameter that can stop it early (Table A).

### The five-round pattern this round breaks

This is the fifth consecutive round in which the extraction/suppression family
produced a high or critical finding: word-shaped hex, then plus-cloaking, then
delimiter-inside-credential, then more-than-eight-segments. Each round raised or
added a bound. The diagnosis, and the reason raising it again is not on the
table:

> **Both mechanisms fail open.** The benign-shape suppressor silently vetoes,
> and the group bound silently truncates. This repo already learned the
> governing principle, from WP-149 F3, quoted verbatim from
> `memory/lessons/inbox.md`: *"in a security guard, ANY scan incompleteness
> (unreadable dir, read fault, hit cap) must fail CLOSED, never silently return
> clean"*. A segment-count bound on extraction **is** a hit cap that returns
> clean.

Round 6 applies that principle in the strongest available form: rather than
adding a fail-closed *fallback* for the case where the bound truncates, it
**removes the truncation**. `ENTROPY_MAX_GROUP_SEGMENTS` is deleted. The
extractor's inner loop stops when it has reached a length the ladder can
actually accept — never because a budget ran out. There is no bound left to
raise, and therefore no future round in which a longer credential re-opens the
same hole. The argument is in Table A row A5; the family that proves it is
`shortSegments()` (100 cases), and the numbers are:

| Extractor | `shortSegments()` fires | `delimiterInside()` fires | base64-with-`+` bypasses |
|---|---|---|---|
| today's shipped rule | 84 / 100 | 94 / 100 | — (the denominator) |
| round-4 tiers | 35 / 100 | 85 / 100 | 7 844 / 7 844 |
| round-5, bound 8 | **35 / 100** | 100 / 100 | 4 / 7 844 |
| bound 16 | 80 / 100 | 100 / 100 | 4 / 7 844 |
| unbounded groups (quadratic, unshippable) | 80 / 100 | 100 / 100 | 4 / 7 844 |
| **round 6, reach spans (no bound)** | **80 / 100** | **100 / 100** | **4 / 7 844** |

Bound 16 also scores 80 — which is exactly the point. A family with seventeen
short pieces would put bound 16 back at 35, and the round would repeat. The
reach extractor scores what the unbounded enumeration scores, at linear cost,
with nothing left to increment. The 20 cases it does not fire on are **all and
only** the 31-character credentials without a nearby keyword — softening **S1**,
already disclosed, and identical for the unbounded enumeration (E-X1).

### The round-5 critical this round closes

Round 5's extraction emitted the whole run (L1), its `-`/`_` segments (L2), and
every contiguous group of at most eight `-_/=+` segments. Feed it

```text
documentationrepositoryconfigurationsomethinglong+a1B+c2D+e3F+g4H+i5J+k6L+m7N+o8P+q9R+s0T
```

— a 49-character lowercase word, a joining `+`, then a 39-character credential of
ten 3-character pieces. The 89-character input carries 4.83 bits/char and
**today's shipped rule flags it**. Round 5 does not: L1 and L2 are P3-suppressed
by the word prefix; every credential-only group of at most eight pieces reaches
only 31 characters, one below the 32-character P4 floor; every group that would
be long enough contains the prefix and is P3-suppressed. Generalising over the
piece count with the same prefix (E-X1): 9 pieces (35 ch) missed, 10 (39 ch)
missed, 12 (47 ch) missed, 16 (63 ch) fires again, because some eight-piece group
finally reaches 32 characters.

**The bypass window is therefore: any credential whose pieces are short enough
that no group within the bound reaches the length floor, while the whole
credential exceeds it.** It is deterministic and adversary-constructible, and it
exists for every finite bound.

Round 6 fires on it: the shortest span starting at the credential's first piece
that reaches 32 characters is 35 characters long (`a1B+…+q9R`), it contains no
word-shaped segment, and it clears P4. Output:
`documentationrepositoryconfigurationsomethinglong+[REDACTED:high-entropy]`.

**Correcting the round-5 superset claim as well as the code.** Round 5's A3
proof said the new span set is a superset of today's candidate set, and that is
true — but a *superset of spans* is not a superset of *detections*, because P3
can suppress a span that legacy fired on. The proof as written did not say so.
Table A row A3 now states the property it actually proves (span presence) and
names the two disclosed places where presence does not imply detection (S1 and
S2). The empirical superset check is unchanged and still holds: **306 of 306**
legacy candidates on the maintainer's vault reappear as spans (E-V4).

### The round-4 defect, still closed

Round 4's extraction had no multi-segment spans at all. Feed it

```text
abcdefghijklmnopqrstuvwxyzabcdefg+5NQywwNzM016QPy+x27M6z7310P3x524
```

— a 33-character word-shaped prefix, then a 32-character credential **that
itself contains a `+`** — and it produces exactly two candidates: the
66-character whole run, which the benign-shape suppressor rejects because the
prefix covers exactly half of it, and the 33-character prefix. The credential's
own pieces are 15 and 16 characters, below `ENTROPY_MIN_LEN`, so they are
discarded. **The credential is never evaluated.** Today's shipped rule flags the
same input.

At scale: of 20 000 fixed-seed 24-byte base64 secrets, the 7 844 that contain a
`+` **and** are caught by today's rule are bypassed by round-4 extraction
**7 844 out of 7 844 times** (E-M1). Base64 alphabets emit `+` or `/` roughly one
character in 32, so a 32-character secret carries one about 63% of the time; this
is not a corner. Round 6 bypasses **4 of 7 844**, which is the same as the
unbounded enumeration and is entirely softening class S2-a.

### Two alternatives that were measured and rejected

Both are recorded so they are not re-proposed.

- **A bigram text-likeness discriminator instead of the benign-shape
  suppressor.** Owner-attested measurement, **not reproduced here and
  deliberately not reproducible from this repository**, because the owner's
  decision is that no bigram or language-model discriminator may be introduced:
  it moved the vault from 100/178 to somewhere between 11/178 and 41/178 with 1
  to 4 notes *newly* flagged, against 4/178 and 0 newly flagged for the design
  below. *(Those figures are against the 178-note vault of round 5; the vault is
  now 180 notes and this design scores 4/180 with 0 newly flagged. The
  comparison is unaffected.)* The reason it cannot work is structural: hex credentials score about
  −6.48 mean log2 bigram probability while the held-out prose tail sits at −7.28,
  so no threshold separates them. It only reached parity once a character-class
  arm was added back — at which point it was this design with a worse
  discriminator. **Do not introduce one.**
- **Trimming word-shaped segments off the ends of a group**, or equivalently
  **starting spans only at non-word segments** (both attempts to remove residual
  R6). Measured: trimming raises the base64-with-`+` bypass rate from **4 in
  7 844** to **1 070 in 7 844**; restricting span starts to non-word segments
  raises it to **574 in 7 844** (E-M3). The reason is the same in both cases:
  real credentials contain accidentally word-shaped pieces —
  `Vfcs+raen+NhcNV4HWRCitatqf0kKGkw` splits into `Vfcs`, `raen` and a 22-character
  tail, and only a span that *starts at a word-shaped piece* reaches 32
  characters. Rejected.
- **Emitting each maximal block of consecutive non-word segments, unbounded**
  (Codex's proposed fail-closed fallback for the case where P3 suppression leaves
  a non-word remainder longer than the bound). It closes the round-5 critical,
  but measured on its own it bypasses **1 574 of 7 844** (20.07%, E-M3) for
  exactly the reason above, and adds nothing on top of reach spans (**identical**
  verdicts on all 7 844). Superseded rather than rejected: reach spans deliver
  the same fail-closed property with better recall and fewer emitted spans.

## Current state

### What `WP-secret-scan-baseline-oracle` already put on `main`

Read these files before you start; this WP extends three of them.

- `tests/fixtures/secret-scan-legacy-entropy.js` — the frozen pre-change oracle,
  exporting `legacyEntropyFires(text) -> boolean`. **Not modified by this WP.**
  It is the definition of the `old` column and must survive your edit to the
  detector. That WP's **Table O** records which blob of
  `src/core/secret-scan.js` the oracle is a copy of, and asserts the oracle
  against the shipped detector's own `high-entropy` behaviour on 399 inputs with
  0 disagreements — so the `old` column is checked against something outside
  itself, not merely frozen.

  **Before you change a byte of the detector**, confirm your pre-edit base
  carries that blob:

  ```bash
  git hash-object src/core/secret-scan.js
  # must print eb273e19050037542c8beb441b8a320a3248b514
  ```

  If it does not, the detector moved after the oracle was frozen, every `old`
  column is stale, and you must stop and say so. The gate asserts this against
  the merge-base.
- `tests/fixtures/secret-scan-corpus.js` — every literal test vector, with
  `LABELLED_INPUTS`, `LABELLED_BASELINE`, `NEGATIVE` (20), `POSITIVE` (23),
  `SOFTENED` (9), `BOUNDARY` (31), `PRECEDENCE` (13), `RESIDUAL_FP` (3), the
  `LEGACY` verdict map, and the generators `delimiterClosure()` (95),
  `delimiterReverse()` (5), `delimiterInside()` (100) and `shortSegments()`
  (100 — the round-5-critical family). **This WP adds exactly
  one export to it, `NEW`, and changes nothing else in the file.** The literal
  inputs are in that file; read them there — this spec deliberately does not
  reprint them, because reprinting a literal in two places is how the two copies
  drift.
- `scripts/measure-entropy-arms.js` — the measurement harness with modes
  `--baseline` (default), `--passphrase`, `--uuid-forms`, `--perf`. Its 19
  generators include `driveid-44` and its 11 `--perf` baits include
  `segment-dense-nonword` and `segment-dense-short`. This WP adds three modes
  and extends three.
- `tests/fixtures/measure-entropy-arms.baseline.txt` — the frozen pre-change
  generator table. **Not modified by this WP**, and the gate re-diffs it, which
  is what makes the `old` half of this WP's evidence non-circular.
- `tests/unit/secret-scan-baseline.test.js` — the characterization tests.
  **Not modified by this WP.** They must all keep passing after your change,
  because every one of them is an `old`-side assertion.

### `src/core/secret-scan.js` (242 lines, pure, zero deps)

- Module header comment, lines 3–15 — its last sentence names "high-entropy" as
  part of the A5 additive coverage.
- `ScanLimits` (lines 21–25) `= { SCAN_MAX_BYTES: 256*1024, ENTROPY_MIN_LEN: 24,
  ENTROPY_MIN_BITS_PER_CHAR: 3.5 }`. Its JSDoc says the values are OWNER-APPROVED
  in `docs/specs/done/WP-122-shared-secret-detector.md`; that shipped spec is
  **not** edited by this WP.
- `RULES` (lines 87–153) — the eighteen labelled rules. **Untouched: not their
  patterns, not their order, not their labels or severities.**
- `const ENTROPY_CANDIDATE = new RegExp('[A-Za-z0-9+/=]{24,}', 'g')` (line 155).
  **Removed by this WP**; the frozen fixture is its permanent record.
- `bitsPerChar(run)` (line 158) — Shannon entropy over the run. **Unchanged by
  this WP**, including its signature.
- `entropyPass(text, add)` (line 180) — **this is the function being replaced**,
  by the extractor of Table A plus the precedence ladder of Table B.
- `scanAndRedact` (line 200) runs `RULES` first, then `entropyPass`, inside one
  `try`. Exports at line 242 are unchanged — **this WP exports nothing new**, so
  every acceptance criterion below is stated as a black-box `scanAndRedact` case.

Seven consumer modules inherit the detector's behavior and are **not** modified
by this WP: the two gates `src/core/dream/validate.js` (EP2) and
`src/core/digest.js` (EP4), plus the five `redactOnly` durable-output sinks of
Table F.

### Existing tests this WP must handle explicitly

- `tests/unit/secret-scan.test.js:174` — `'entropy: an unlabelled high-entropy
  base64 run is quarantined'`, blob `q7PmXz4KvR9tWc2LbN8dYfGh` (24 chars, no
  credential keyword nearby). **Must change** — this exact shape is softening
  class S1 (Table C).
- `tests/unit/secret-scan.test.js:186` — `'entropy: long low-entropy runs are NOT
  flagged'`, input `padding <'a'×40> and <'abc'×20> end`. **Must stay
  byte-identical — do not edit this test.** Both runs are valid hex of length
  ≥ 32, so they reach Table B's P1a arm; P1a's 3.0-bit floor rejects them
  (0.0000 and 1.5850 bits/char, measured) and the P3 suppressor would reject them
  independently. Pinned as `bnd-lowent-a40` / `bnd-lowent-abc60` in the corpus.
- `tests/unit/dream-validate.test.js:1040` — the EP2 false-positive revert test,
  fixture `ref q7PmXz4KvR9tWc2LbN8dYfGh in prose`. **Must change** — same S1
  shape; give it the corpus's `pos-alnum-32` blob so the EP2 revert behavior
  stays covered.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/secret-scan.js | replace `entropyPass`, delete `ENTROPY_CANDIDATE`, add the **Table A0 delimiter constants** and the extraction/suppression/keyword/assignment constants, extend `ScanLimits` per Table B. `RULES`, `bitsPerChar`, `scanAndRedact`'s structure and the export list stay as they are |
| modify | tests/fixtures/secret-scan-corpus.js | add **exactly one** export, `NEW` — the `{[id]: boolean}` map of Table D. Change no literal, no id, no generator, no existing export |
| modify | scripts/measure-entropy-arms.js | add the `--candidate`, `--extract` and `--sustained` modes; add the `*:new` / `entropy-new` / `gate-new` / `<new>` columns to `--passphrase` and `--uuid-forms`; add the `<new-ms>` and `<ratio>` columns to `--perf`, keeping its eleven baits and their order; leave `--baseline` untouched. Complete contract under Table E |
| create | tests/fixtures/measure-entropy-arms.candidate.txt | the byte-exact expected `--candidate` output for `SEED = 0x5eed1234`, `N = 20000`, copied verbatim from Table E. The gate diffs against it |
| modify | tests/unit/secret-scan.test.js | update the entropy fixture at line 174; add the corpus-driven tests listed in Acceptance criteria. Do **not** edit line 186's test |
| modify | tests/unit/dream-validate.test.js | the EP2 fixture at ~line 1040 (blob → `pos-alnum-32`) plus ONE new test: a note whose only "secret-shaped" content is `[[01-Projects/wienerdog/current-state]]` commits cleanly |
| modify | tests/unit/digest.test.js | ONE new EP4 test pair: a section containing the `pos-alnum-32` blob is omitted + bannered; a section containing only wikilinks/absolute paths renders |
| modify | docs/adr/0024-layered-secret-lifecycle.md | ONE dated amendment appended to the **Coverage** bullet of section "1. One shared detector — `scanAndRedact` (WP-122)" — see "The ADR-0024 amendment" |

Per `docs/specs/_TEMPLATE.md` lines 30-31, this spec file and
`package-lock.json` are exempt from every Deliverables table and are therefore
not listed here, while remaining permitted in the verification whitelist below.

<!-- EVIDENCE-BLOCK-START -->

### Exact contracts

The labelled-rule pipeline is unchanged. Only the pass that runs after it
changes: from one context-free regex to **reach-span extraction (Table A) plus
the five-rung precedence ladder (Table B)**. Severity, label and replacement text
are unchanged (`high-entropy`, `quarantine`, `[REDACTED:high-entropy]`).

This is the whole replacement, verbatim. Copy it; do not re-derive it. Every
threshold, every emitter and every suppressor scope in it is decided by
**Table A** or **Table B** — if this code and those tables ever disagree, the
tables are right and the disagreement is a bug in this block.

Read the `entropyRegions` loop with one thing in mind: **there is no constant in
it that limits how far extraction may go.** The inner `for (let b = a; ...)` loop
exits on `>= target`, where `target` is one of the ladder's own acceptance
lengths. It stops because it has found something the ladder can judge, never
because a budget ran out.

```js
// ==== CANONICAL DELIMITER ALPHABET (Table A0). ONE fact, four consumers. ====
// These two strings are the ONLY place in this module where a delimiter
// character may be written. SPAN_RUN, SPLIT_ALL and IS_TIER1 are all DERIVED
// from them, so they cannot drift apart.
//   tier 1 — structural joiners      DELIM_TIER1 = '\-_'   (i.e. `-` and `_`)
//   tier 2 — base64/path separators  DELIM_TIER2 = '/=+'
// `-` is written `\\-` so every derived character class is range-free.
const DELIM_TIER1 = '\\-_';
const DELIM_TIER2 = '/=+';
const DELIM_ALL = DELIM_TIER1 + DELIM_TIER2;
const SPAN_RUN = new RegExp(`[A-Za-z0-9${DELIM_ALL}]+`, 'g');
const SPLIT_ALL = new RegExp(`[${DELIM_ALL}]`);
const IS_TIER1 = new RegExp(`^[${DELIM_TIER1}]$`);
// ===========================================================================

// Table A row A4. The two lengths a reach span aims at are the ladder's OWN
// acceptance floors, not tuning knobs: P5 can accept at ENTROPY_MIN_LEN, P4 at
// ENTROPY_BARE_MIN_LEN. Extraction therefore probes every start position at
// exactly the lengths at which a verdict becomes possible, and no further.
const REACH_TARGETS = [ScanLimits.ENTROPY_MIN_LEN, ScanLimits.ENTROPY_BARE_MIN_LEN];

const WORD_SEGMENT =
  /^(?:[a-z]{2,}|[A-Z][a-z]+|[A-Z]{2,}|[0-9]{1,10}|[a-z]{2,}(?:[A-Z][a-z]+)+[0-9]{0,4}|(?:[A-Z][a-z]+){2,}[0-9]{0,4}|(?:[a-z]{3,}|[A-Z][a-z]{2,}|[A-Z]{3,})[0-9]{1,10})$/;
// RFC-4122 CANONICAL only: version nibble 1-8, variant nibble 8|9|a|b. A
// UUID-shaped value outside that set is NOT suppressed (Table B, P2). Global,
// because P2 suppresses every span INSIDE an occurrence, not only a span that
// equals one (Table B, P2 scope).
const UUID_OCCURRENCE =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/g;
const HEX_SHAPE = /^[0-9a-fA-F]+$/;
const BASE32_SHAPE = /^[A-Z2-7]+$/;
const CREDENTIAL_KEYWORD =
  /(?:^|[^a-z])(?:keys?|secrets?|passwords?|passwd|passphrase|credentials?|tokens?|bearer|authorization|auth[ \t_-]?(?:code|token)|cookie|signature)(?![a-z])/i;
// Table B P2's narrow override: the UUID is the VALUE of a direct assignment
// to a credential key. Anchored at the end of the lookbehind slice, so the
// separator must be immediately before the occurrence. Deliberately excludes
// bare `session`/`id` keys — those are the false-quarantine source (Table B).
const ASSIGNMENT_LEAD =
  /(?:^|[^A-Za-z0-9])(?:authorization|api[_-]?key|apikey|secret|token|password|passwd|passphrase|credential|bearer|auth[_-]?token|access[_-]?token|refresh[_-]?token|client[_-]?secret|signature)["']?[ \t]*[:=][ \t]*["']?$/i;

/** Table B rung P5's context test. True iff a credential keyword match lies
 *  ENTIRELY within the ENTROPY_CONTEXT_WINDOW characters immediately before OR
 *  immediately after the span. Symmetric; no line-boundary clipping. */
function keywordNear(text, start, end) {
  const w = ScanLimits.ENTROPY_CONTEXT_WINDOW;
  return (
    CREDENTIAL_KEYWORD.test(text.slice(Math.max(0, start - w), start)) ||
    CREDENTIAL_KEYWORD.test(text.slice(end, end + w))
  );
}

/** Table B rung P2's narrow override. True iff a canonical UUID starting at
 *  `start` is the value of a direct assignment to a credential key. */
function assignedToCredentialKey(text, start) {
  const w = ScanLimits.ENTROPY_ASSIGN_LOOKBEHIND;
  return ASSIGNMENT_LEAD.test(text.slice(Math.max(0, start - w), start));
}

/** Table B rung P2's scope: the disjoint, ascending ranges of `text` covered by
 *  a canonical RFC-4122 UUID that is NOT directly assigned to a credential key.
 *  Computed once per scan. @param {string} text */
function suppressedUuidRanges(text) {
  const starts = [];
  const ends = [];
  UUID_OCCURRENCE.lastIndex = 0;
  let m;
  while ((m = UUID_OCCURRENCE.exec(text)) !== null) {
    if (assignedToCredentialKey(text, m.index)) continue;
    starts.push(m.index);
    ends.push(m.index + m[0].length);
  }
  return { starts, ends };
}

/** True iff [start,end) lies wholly inside one suppressed UUID range. Binary
 *  search over disjoint ascending ranges — a linear scan here is quadratic on a
 *  UUID-dense input (E-P2). */
function insideSuppressedUuid(ranges, start, end) {
  let lo = 0;
  let hi = ranges.starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ranges.starts[mid] > start) hi = mid - 1;
    else if (ranges.ends[mid] < end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * The merged, non-overlapping regions of `text` that the Table B ladder accepts.
 *
 * Per maximal SPAN_RUN match, three emitters, canonical definition in Table A
 * rows A2-A4:
 *   L1      the whole run;
 *   L2      its tier-1 segments — exactly today's candidate boundaries, which is
 *           what makes the new span set a superset of the old one (A3);
 *   REACH   for every segment index `a` and every target in REACH_TARGETS, the
 *           SHORTEST contiguous group starting at `a` whose length reaches that
 *           target. UNBOUNDED in segment count (A5).
 *
 * Spans are considered in ascending start order, so the merge below needs no
 * sort: within a run, L1 starts at offset 0 and every later span starts at a
 * segment offset visited in increasing order. Table B's P3 is decided in O(1)
 * from the `cov` prefix sums, which is why a span is only materialised — and
 * `bitsPerChar` only called — once it has survived P3.
 *
 * @param {string} text @returns {number[][]} ascending, disjoint [start,end)
 */
function entropyRegions(text) {
  const ranges = suppressedUuidRanges(text);
  const hits = [];
  SPAN_RUN.lastIndex = 0;
  let m;
  while ((m = SPAN_RUN.exec(text)) !== null) {
    const run = m[0];
    const base = m.index;
    const segs = run.split(SPLIT_ALL);
    const n = segs.length;
    const offs = new Array(n);
    // cov[i] = total length of WORD_SEGMENT-matching segments before index i.
    // The segments scored here ARE the segments extraction cuts at, so Table
    // A0's delimiter closure is structural, not a coincidence to be re-checked.
    const cov = new Array(n + 1);
    cov[0] = 0;
    for (let i = 0, p = 0; i < n; i += 1) {
      offs[i] = p;
      p += segs[i].length + 1;
      cov[i + 1] = cov[i] + (segs[i] !== '' && WORD_SEGMENT.test(segs[i]) ? segs[i].length : 0);
    }
    // tier1End[a] = last segment index of the tier-1 segment that begins at a,
    // or -1 if no tier-1 segment begins there.
    const tier1End = new Array(n).fill(-1);
    for (let i = 0, s = 0; i < n; i += 1) {
      if (i === n - 1 || IS_TIER1.test(run[offs[i + 1] - 1])) {
        tier1End[s] = i;
        s = i + 1;
      }
    }
    /** Run segment range [a..b] down the Table B ladder. */
    const consider = (a, b) => {
      const from = offs[a];
      const to = offs[b] + segs[b].length;
      const len = to - from;
      if (len < ScanLimits.ENTROPY_MIN_LEN) return;
      const start = base + from;
      const end = start + len;
      // P2 canonical-UUID suppressor, by RANGE: no fragment of a canonical UUID
      // is a candidate either.
      if (insideSuppressedUuid(ranges, start, end)) return;
      // P1 structured — a strict-alphabet credential; NOT vetoable by P3. Only
      // reachable when a === b: HEX_SHAPE and BASE32_SHAPE both exclude every
      // DELIM_ALL character, so a multi-segment span can never match either.
      // TWO arms with SEPARATE floors (hex 4.0 ceiling, base32 5.0).
      if (a === b && len >= ScanLimits.ENTROPY_STRUCTURED_MIN_LEN) {
        const bits = bitsPerChar(segs[a]);
        if (HEX_SHAPE.test(segs[a]) && bits >= ScanLimits.ENTROPY_HEX_MIN_BITS) {
          hits.push([start, end]);
          return;
        }
        if (BASE32_SHAPE.test(segs[a]) && bits >= ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) {
          hits.push([start, end]);
          return;
        }
      }
      // P3 benign-shape suppressor. Denominator is the span's OWN length, so
      // delimiters count against coverage and padding a blob with DELIM_ALL
      // characters cannot buy suppression. Applies to THIS span only (A8).
      if ((cov[b + 1] - cov[a]) * 2 >= len) return;
      if (bitsPerChar(run.slice(from, to)) < ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return;
      // P4 bare, then P5 contextual.
      if (len >= ScanLimits.ENTROPY_BARE_MIN_LEN || keywordNear(text, start, end)) {
        hits.push([start, end]);
      }
    };
    consider(0, n - 1); // L1 — starts at offset 0, the smallest start in this run
    for (let a = 0; a < n; a += 1) {
      if (tier1End[a] >= 0) consider(a, tier1End[a]); // L2
      // A span may not begin in the MIDDLE of a delimiter run; the first empty
      // segment of the run is kept, so a credential whose own first characters
      // are delimiters is still evaluated whole (A6).
      if (segs[a] === '' && a > 0 && segs[a - 1] === '') continue;
      for (const target of REACH_TARGETS) { // REACH
        for (let b = a; b < n; b += 1) {
          if (offs[b] + segs[b].length - offs[a] >= target) {
            consider(a, b);
            break;
          }
        }
      }
    }
  }
  // A10: accepted spans are already ascending by start, so one linear pass
  // merges them. No sort — the round-5 hits.sort() was the only O(L log L) step
  // in an otherwise linear pass and it is gone.
  const merged = [];
  for (const [a, b] of hits) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) {
      if (b > last[1]) last[1] = b;
    } else {
      merged.push([a, b]);
    }
  }
  return merged;
}

/**
 * Shape- and context-aware high-entropy pass (WP-secret-fence-shape-and-context).
 * Each merged region is replaced by one [REDACTED:high-entropy] token with one
 * finding. No safe partial redaction exists for an opaque blob → QUARANTINE.
 * @param {string} text
 * @param {(label:string, severity:Severity)=>void} add
 * @returns {string}
 */
function entropyPass(text, add) {
  const merged = entropyRegions(text);
  if (merged.length === 0) return text;
  let out = '';
  let prev = 0;
  for (const [a, b] of merged) {
    out += `${text.slice(prev, a)}[REDACTED:high-entropy]`;
    add('high-entropy', SEVERITY.QUARANTINE);
    prev = b;
  }
  return out + text.slice(prev);
}
```

`ScanLimits` gains exactly five keys and keeps its three existing keys at their
existing values. **Table B's value column is canonical for all eight**:

```js
const ScanLimits = {
  SCAN_MAX_BYTES: 256 * 1024,
  ENTROPY_MIN_LEN: 24,
  ENTROPY_MIN_BITS_PER_CHAR: 3.5,
  ENTROPY_BARE_MIN_LEN: 32,
  ENTROPY_STRUCTURED_MIN_LEN: 32,
  ENTROPY_HEX_MIN_BITS: 3.0,
  ENTROPY_CONTEXT_WINDOW: 80,
  ENTROPY_ASSIGN_LOOKBEHIND: 64,
};
```

**There is no `ENTROPY_MAX_GROUP_SEGMENTS`, and adding one is out of scope.**
Round 5 had it at 8; it is deleted because a segment-count bound on extraction is
a hit cap that silently returns clean. `REACH_TARGETS` is not its replacement: it
is *derived* from two thresholds the ladder already uses, it makes spans
**shorter** rather than fewer, and raising or lowering it cannot hide a span —
it can only change which of two already-approved acceptance lengths a start
position is probed at.

There is deliberately **no** `ENTROPY_BASE32_MIN_BITS` either. P1's base32 arm
reuses `ENTROPY_MIN_BITS_PER_CHAR` — it exists to make P3 unable to veto a base32
credential, **not** to lower the entropy bar. Only the hex arm lowers it, and it
must (E-S1).
Worked examples. These **defer to Tables A and B** — they illustrate the ladder,
they do not decide anything. Each is a verified corpus row; the id in parentheses
is that row, whose literal input lives in `tests/fixtures/secret-scan-corpus.js`.

```text
"see [[01-Projects/wienerdog/current-state]] for detail"
  → unchanged, no finding            (P3 on every span)                    (neg-1)

"session 019f819d-6aea-7950-b28e-9f26b7718c08 resumed"
  → unchanged, no finding            (P2, canonical UUIDv7)       (prec-p2-uuid-v7)

"abcdefabcdefabcdefabcd9876543210"
  → "[REDACTED:high-entropy]"        (P1a beats P3: hex-32 at 3.7038 bits
                                      that is ALSO word-shaped)  (prec-p1-over-p3-bare)

"0123456789abcdef0123456789abcdef-foo"
  → "[REDACTED:high-entropy]"        (the L2 hex span fires on P1a; L1 also
                                      fires; the two merge)           (prec-a9-merge)

"abcdefghijklmnopqrstuvwxyzabcdefg+5NQywwNzM016QPy+x27M6z7310P3x524"
  → "abcdefghijklmnopqrstuvwxyzabcdefg+[REDACTED:high-entropy]"
                                     (THE ROUND-4 CRITICAL. Segments are
                                      33 / 15 / 16. REACH from segment 1 with
                                      target 32 stops at segment 2, giving
                                      "5NQywwNzM016QPy+x27M6z7310P3x524" — 32
                                      chars, not word-shaped, fires on P4.
                                      Round 4 emitted only the 66-char run and
                                      the 33-char prefix, and missed it)
                                                                  (pos-plus-inside)

"documentationrepositoryconfigurationsomethinglong+a1B+c2D+e3F+g4H+i5J+k6L+m7N+o8P+q9R+s0T"
  → "documentationrepositoryconfigurationsomethinglong+[REDACTED:high-entropy]"
                                     (THE ROUND-5 CRITICAL. Eleven segments:
                                      one 49-char word, then ten 3-char pieces.
                                      REACH from segment 1 with target 32 stops
                                      at segment 9, giving the 35-char span
                                      "a1B+c2D+e3F+g4H+i5J+k6L+m7N+o8P+q9R" —
                                      zero word coverage, fires on P4. Round 5
                                      could only build 8-segment groups, which
                                      reach 31 chars, and missed it)
                                                                 (seg-plus-10-prefix)

"Documentation-Repository-Configuration-5NQywwNzM016QPy4x27M6z7310P3x524"
  → "Documentation-[REDACTED:high-entropy]"
                                     (REACH from segment 1 with target 32 stops
                                      at segment 3, giving
                                      "Repository-Configuration-<blob>" — 57
                                      chars with only 23 covered, so it fires;
                                      it merges with the blob's own span. The
                                      redaction is WIDER than round 4's, which
                                      stopped after "Configuration-")
                                                                (prec-a7-nested-bare)

"https://app.example/cb?code=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEy&state=1"
  → "https://app.example/cb?[REDACTED:high-entropy]&state=1"      (P4) (pos-query)

"blob q7PmXz4KvR9tWc2LbN8dYfGh end"
  → unchanged, no finding            (softening S1)               (sft-s1-alnum-24)

"CorrectHorseBatteryStaple2024"
  → unchanged, no finding            (softening S2 — see Table C's S2-b cost
                                      row before approving) (sft-s2-passphrase-bare)

"the token used 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c ok"
  → unchanged, no finding            (P2 by RANGE: the 27-char reach span
                                      "9d4e-4a6f-8b7c-1e2d3f4a5b6c" is inside a
                                      canonical UUID, so it is not a candidate
                                      even though "token" is 15 chars away)
                                                       (prec-p2-subgroup-not-a-candidate)

"authorization: 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c"
  → "authorization: [REDACTED:high-entropy]"
                                     (P2's narrow override: a canonical UUID
                                      directly assigned to a credential key is
                                      not range-suppressed) (prec-p2-assign-override)
```

### The ADR-0024 amendment (exact text and target)

Append the following **inside** the existing **Coverage** bullet of ADR-0024
section "1. One shared detector — `scanAndRedact` (WP-122)", immediately after
the existing `*(Amended, OWNER-APPROVED 2026-07-17, WP-122 walkthrough: …)*`
parenthetical, matching that file's amendment style. Replace `<DATE>` with the
date recorded in this spec's OWNER-APPROVED section — if that section is still
empty, **stop and do not implement**.

```markdown
*(Amended, OWNER-APPROVED <DATE>, WP-secret-fence-shape-and-context
walkthrough: "contextual high entropy" is now shape- and context-aware. The
pass enumerates credential-shaped **spans** — the maximal
`[A-Za-z0-9]`-plus-delimiter run, its `-`/`_` segments, and, from every
delimiter-separated segment boundary, the **shortest** run of consecutive
segments that reaches 24 characters and the shortest that reaches 32 — and
fires if any span qualifies. Multi-segment spans exist because a credential may
contain a delimiter of its own; a single-segment split shreds such a credential
below the length floor and loses it entirely. **Extraction carries no bound on
how many segments a span may cover**: the enumeration stops when it reaches a
length the ladder can accept, never because a budget is exhausted, so no
credential can be missed on the grounds that the scan gave up. An earlier design
used contiguous groups of at most eight segments and was withdrawn because a
credential of ten three-character pieces slipped through every group. The
delimiter alphabet is a single constant (`-` `_` `/` `=` `+`) from
which the span alphabet, both splits and the benign-shape suppressor are all
derived, so extraction and suppression cut at exactly the same characters. Each
span runs one fixed precedence ladder: (P2) no span lying inside a canonical
RFC-4122 UUID is a candidate, unless that UUID is the value of a direct
assignment to a credential key; (P1) hex of >=32 characters at >=3.0 bits/char,
or base32 of >=32 characters at >=3.5 bits/char, is a credential and **cannot**
be suppressed by shape; (P3) a span whose word-shaped segments cover half of its
own length is not a candidate; (P4) any remaining span >=32 characters at >=3.5
bits/char; (P5) any remaining span >=24 characters at >=3.5 bits/char with a
credential keyword wholly inside the 80 characters before or after it. Two
detections are knowingly given up: an opaque 24-31-character span with no nearby
credential keyword (S1), and a word-shaped span (S2, which includes human
passphrase-style passwords bare and in prose — the labelled `password=`/`token:`
assignment rules still cover the assignment forms at 100%). Measured cost and
benefit are recorded in the WP's Tables C and E. Severity, label, the
`findings.length > 0` gate condition and the eighteen labelled rules are
unchanged.)*
```

## Contract reference

Activation (ADR-0031, 5 of 7): (i) the detector's matching contract changes;
(iii) input acceptance changes; (iv) the accept/reject **precedence** between
arms and suppressors changes; (v) the detector emits sanitized bytes but seven
other modules own the durable artifacts they land in; (vi) those seven consumers
inherit the contract.

Four contract families drew findings in consecutive review rounds, so per
ADR-0031's circuit-breaker each is extracted into exactly one canonical table:

| Family | Canonical table | Nothing else decides it |
|--------|-----------------|-------------------------|
| **the delimiter alphabet** | **Table A0** | which characters are credential material and which are cut points — for span extraction *and* for the suppressor, from one constant |
| **what is extracted** | **Table A** | every emitter, the reach targets, the superset property, the completeness argument, the linear cost |
| suppression semantics / precedence | **Table B** | every threshold, every rung order, every suppressor scope |
| evidence and corpus | **Table E** (provenance of every number) and **Table D** (the `new` verdict of every corpus row) | no number appears anywhere in this spec without an E-row; no verdict exists without a D-row |
| the consumer / permission boundary | **Table F** | what changes for each sink, and where it is verified |

Table A0 was added in round 4, after the circuit-breaker fired a second time on
the suppression family: the diagnosis was that round 3 extracted the *thresholds*
and the *precedence* into canonical tables but left the **delimiter alphabet**
scattered across four regexes that had to agree and did not. Table A was promoted
to canonical in round 5, after the circuit-breaker fired a third time — this
time because the *extraction* contract was described only in prose and in code,
and the code was wrong in a way no table was responsible for noticing. Round 6
rewrote Table A rather than adding a fifth: the circuit-breaker had fired a
fourth time on the same family, and the diagnosis was no longer "a fact with no
owning table" but "a mechanism that fails open no matter which table owns it".

**A standing checklist item, carried from `WP-secret-scan-baseline-oracle`.**
Three findings across three specs in this family have now been the same failure:
*evidence that validates only against itself* — round 2's corpus was generated
by the harness meant to check it, round 4's SHA gate hashed a fixture the
implementer produced, and the oracle WP's first review found a frozen oracle
nothing outside itself compared against. Before asserting that a piece of
evidence here is trustworthy, name the thing outside it that would disagree if
it were wrong. For this WP those things are: the frozen `old` column, which
merged on `main` under separate review; the shipped detector, against which the
oracle is differentially asserted (that WP's Table O); and the `--extract` mode,
which re-runs the *rejected* extractors side by side so a claim about them is
never just prose.

Table C (the old→new delta) is derived from Tables A, B and E and re-decides
nothing.

### Table A0 — canonical: the delimiter alphabet

**This table is the single source of truth for every delimiter character in the
entropy pass.** `SPAN_RUN`, `SPLIT_ALL` and `IS_TIER1` are all *derived* from
the two tier strings in the code block under "Exact contracts". No other line in
`src/core/secret-scan.js` may write a delimiter character into a character class.

| Tier | Characters | Role in the span alphabet | Used for |
|------|-----------|---------------------------|----------|
| **tier 1** | `-` `_` | credential material | deciding tier-1 segment ends (L2) — and only that. These are exactly the characters today's candidate alphabet excludes, which is what makes L2 the legacy-candidate boundary set |
| **tier 2** | `/` `=` `+` | credential material | nothing on its own; it exists so that `DELIM_ALL` is a single derived constant |
| — | `A-Za-z0-9` | credential material | never a cut point |
| — | everything else (`.` `:` `@` `?` `&` `#` quotes, brackets, whitespace, …) | **not** span material — ends the span | n/a |

Derived, by construction:

| Derived value | Definition | Consumer |
|---------------|-----------|----------|
| `DELIM_ALL` | tier 1 ∪ tier 2 = `-` `_` `/` `=` `+` | — |
| `SPAN_RUN` | `[A-Za-z0-9` + `DELIM_ALL` + `]+` with the `g` flag | L1 extraction |
| `IS_TIER1` | `^[` + tier 1 + `]$` | deciding where a tier-1 segment ends (L2 extraction) |
| `SPLIT_ALL` | `[` + `DELIM_ALL` + `]` | the **one** segment split, from which reach spans **and** the P3 coverage prefix sums are both built |

**The delimiter-closure property (this is the security argument, not a
comment).** In round 6 this stopped being a property two pieces of code had to
agree on and became a property of one array. `cov[]`, the prefix sum P3 is
decided from, is built over **exactly** the `SPLIT_ALL` segments that extraction
cuts at — the same `segs[]`. There is no second split to keep in step.
Therefore **every boundary the suppressor uses to earn coverage is also a
boundary at which extraction produces a candidate**, by construction rather than
by review.

A span that P3 suppresses always has each of its own segment boundaries probed
independently, at both acceptance lengths, so suppression can never cloak a
credential — at worst it declines to flag the wrapper. Exactly two gaps remain,
both disclosed and **neither of them a bound**:

- a span shorter than `ENTROPY_MIN_LEN` is dropped, and one of 24–31 characters
  needs a nearby keyword — softening **S1**;
- a span whose own pieces are word-shaped is suppressed — softening **S2**.

Round 5 had a third gap here: "a remainder spanning more than
`ENTROPY_MAX_GROUP_SEGMENTS` segments is not emitted as a group". That gap was
the round-5 critical, and it is gone with the bound.

Pinned by four exhaustive corpus families, not by argument:

| Family | Construction | Asserted |
|--------|-------------|----------|
| `delimiterClosure()` | 95 cases: a 33-character word prefix, then **every** printable-ASCII character, then a 32-character 4.0000-bit blob | **all 95 fire.** Legacy fires on 95/95; the round-3 design fired on 94/95, failing only at `c = '+'`; rounds 4, 5 and 6 fire on 95/95 (E-D1). Needs no edit when a delimiter is added |
| `delimiterReverse()` | 5 cases: `'see Documentation' + c + 'RepositoryConfiguration end'` for each `DELIM_ALL` character | **all 5 yield zero findings** — every canonical delimiter really is a suppressor boundary. Legacy fires on 3 of the 5; the round-3 design fired on `=` (E-D2) |
| `delimiterInside()` | 100 cases: the delimiter is **inside the credential**, at most 5 pieces | **all 100 fire** (E-D3). Round-4 extraction: 85 |
| `shortSegments()` | 100 cases: the credential is **8, 9, 10 or 12 pieces of 3 characters**, crossed with all five delimiters and five word contexts (bare / prefix / suffix / both / keyword) | **exactly 80 fire**, and the 20 that do not are exactly the 8-piece (31-character) cases outside the `keyword` context — softening S1. Round-5 bound-8 extraction fires on **35**; so does every bound up to 8 (E-X1). This is the family the round-5 critical belongs to |

### Table A — canonical: what the pass extracts

**This table is the single source of truth for span extraction.** Every
delimiter character named is owned by Table A0. Throughout, a run's *segments*
`s_0..s_{n-1}` are its maximal substrings containing no `DELIM_ALL` character
(so a delimiter pair yields an empty segment between them), and a *span* is
always a contiguous segment range `[a..b]` of one run.

| # | Rule | Definition | Why |
|---|------|-----------|-----|
| A1 | span alphabet | `SPAN_RUN`, derived from Table A0 | credential material; `.`, `:`, `@`, `?`, `&`, `#`, quotes and brackets are outside it, so a blob glued into a URL, a DSN or `blob.md` is isolated rather than absorbed |
| A2 | **L1** | each maximal `SPAN_RUN` match, i.e. `[0 .. n-1]` | the whole token. Always emitted, whatever its segment count |
| A3 | **L2** | each tier-1 segment of the run — the ranges delimited by `-` and `_` only | **the superset property** — see A3 below. Always emitted, whatever its segment count |
| A4 | **REACH** | for every segment index `a` and every `target` in `REACH_TARGETS = [ENTROPY_MIN_LEN, ENTROPY_BARE_MIN_LEN] = [24, 32]`: emit `[a..b]` for the **smallest** `b ≥ a` with `len(a..b) ≥ target`, if one exists | **the round-6 fix, replacing round-5's bounded groups.** From every place a credential can begin, the pass evaluates the *shortest* span long enough for the ladder to accept — one per acceptance length. Shortest means least diluted by neighbouring text |
| A5 | **there is no bound** | `REACH_TARGETS` is derived from two thresholds Table B already owns. **No constant limits how many segments a span may cover.** The inner loop exits on `len ≥ target`, never on a counter | see A5 below. A bound is a hit cap; a hit cap that reports clean is fail-open (WP-149 F3) |
| A6 | delimiter runs | a REACH span may not begin at an empty segment whose predecessor is also empty. L1 and L2 are unaffected | inside a run of consecutive delimiters, only the **first** position is probed. It is the one that yields the longest span, so a credential whose own leading characters are delimiters (`+/FYCw…`) is still evaluated whole. Dropping this rule costs nothing in recall and turns `'-_/=+'`-dense input into 262 144 near-duplicate spans (E-P1) |
| A7 | minimum | a span shorter than `ENTROPY_MIN_LEN` is discarded | |
| A8 | no trimming | spans are **never** trimmed of leading/trailing characters, and a span is **never** shortened, skipped or re-based because its first or last segment is word-shaped | every Table A0 delimiter is also a legal credential character, and real credentials contain accidentally word-shaped pieces. Trimming word-shaped end segments was measured and rejected at **1 070** bypasses per 7 844; refusing to *start* at a word-shaped segment was measured and rejected at **574** per 7 844 (E-M3) |
| A9 | suppression is per-span | Table B's P3 disqualifies **only the span it matched**. Nested and overlapping spans are still evaluated independently. P2 is the one deliberate exception and it is scoped by *range*, not by span identity — see Table B | pinned by `prec-a7-nested-bare` and `prec-p2-subgroup-not-a-candidate` |
| A10 | suppression never outranks P1 | a suppressor cannot stop a span that Table B's P1 already accepted, because P1 is evaluated first | pinned by `prec-p1-over-p3-bare` and `prec-p1-over-p3-nested` |
| A11 | replacement | accepted spans are produced in **ascending start order** and **merged where they overlap** in one linear pass; each merged interval becomes one `[REDACTED:high-entropy]` and one finding | L1, L2 and REACH spans routinely overlap; without merging the output would be corrupt and the count inflated. Ascending emission is why round-5's `hits.sort()` — the pass's only `O(L log L)` step — is gone. Pinned by `prec-a9-merge` |

#### A5 — canonical: why there is no bound, and why none can be reintroduced

**The completeness property.** For every run and every segment index `a` at
which a span may begin (A6), and for each of the two lengths at which the ladder
can accept a span, the pass evaluates the **shortest** span starting at `a` that
reaches that length. The inner loop terminates because the target is met, not
because a counter ran out. Consequently:

> **There is no input for which "extraction stopped early" is the reason a
> credential was missed.** The only reasons a span can fail to become a finding
> are the ladder's own, owner-approved rungs: the length floors (softening S1),
> the word-shape suppressor (softening S2), the entropy floor, and the canonical
> UUID suppressor (residual miss M1).

Two consequences worth stating plainly, because they are what the previous five
rounds kept getting wrong:

- **A longer credential can never re-open the hole.** Round 5's bypass window was
  "pieces short enough that no group within the bound reaches the floor". Under
  A4 the span from the credential's first piece grows until it reaches the floor,
  however many pieces that takes. Adding pieces makes the span *easier* to find,
  not harder.
- **The loop's natural stopping point is bounded, and that is a consequence, not
  a parameter.** Each extra segment contributes at least one character (its
  preceding delimiter), so `b - a ≤ target ≤ 32`. Nobody chose 32 as an
  extraction limit; it falls out of `ENTROPY_BARE_MIN_LEN`, and changing that
  threshold changes what the ladder accepts, not what extraction can see.

**Measured, against the extractor this replaces and against the unbounded
enumeration it matches.** All three columns are one command,
`node scripts/measure-entropy-arms.js --extract` (E-M1, E-D3, E-X1):

| Extractor | base64-with-`+` bypasses / 7 844 | `delimiterInside()` / 100 | `shortSegments()` / 100 |
|---|---|---|---|
| round-4 tiers | 7 844 (100.00%) | 85 | 35 |
| bound 1 | 7 844 (100.00%) | 85 | 35 |
| bound 2 | 4 158 (53.01%) | 90 | 35 |
| bound 3 | 1 432 (18.26%) | 95 | 35 |
| bound 4 | 333 (4.25%) | 100 | 35 |
| bound 6 | 12 (0.15%) | 100 | 35 |
| **bound 8 (round 5)** | **4 (0.05%)** | **100** | **35** |
| bound 16 | 4 (0.05%) | 100 | 80 |
| bound 64 | 4 (0.05%) | 100 | 80 |
| unbounded groups | 4 (0.05%) | 100 | 80 |
| **REACH (this design)** | **4 (0.05%)** | **100** | **80** |

The `shortSegments()` column is the whole argument. Round 5 tuned the bound on
the first column, where 8 is indistinguishable from unbounded, and that column
was blind to the failure. Raising the bound to 16 fixes *this* family and
nothing else: a family of seventeen pieces would put bound 16 back at 35. REACH
scores what unbounded scores on all three columns and has nothing to raise.

The four residual bypasses in column 1 are *identical* for REACH and for
unbounded grouping, so they are not an extraction failure: in each, the
credential's own pieces are accidentally word-shaped and P3 suppresses it —
softening class **S2-a**, measured at 99.97% worst-case recall (Table C).

**REACH versus unbounded enumeration, measured rather than argued.** Unbounded
enumeration is not "truth"; it is a different, quadratic, unshippable extractor.
Two differential measurements say where they part company (E-X2):

| Population | N | REACH fires | unbounded fires |
|---|---|---|---|
| planted credential (24–64 chars, 0–15 internal delimiters) in word soup, 42 length×delimiter cells | 20 000 per cell | within **0.06 pp** of unbounded in every cell; identical in 34 of 42 | — |
| random word/path soup, no planted credential | 200 000 | **49.636%** | 51.108% |
| the whole corpus and all four generators | 399 | identical verdicts | identical verdicts |

So on credential-bearing input REACH is recall-equivalent to unbounded
enumeration, and on benign soup it fires 1.47 pp *less* often. It is not a
weaker extractor bought at a discount; it is a cheaper one that is also slightly
more precise.

**Cost, argued and measured.** Per run of length `L` with `s` segments: L1
contributes 1 span, L2 at most `s`, REACH at most `2s`, so at most `3s + 1`
spans — linear. Character work has three parts: building `offs`/`cov`/`tier1End`
is one pass over the run; L1 and L2 together touch each character at most twice;
each REACH span is at most `target + max_seg_len` characters and, because the
stopping index is non-decreasing in `a` and each value is taken by at most
`target` starts, the REACH spans total at most `target × (s + L)` characters,
i.e. `≤ (24 + 32) × 2L = 112L` in the worst case. **Crucially, `bitsPerChar` is
only called on a span that has already survived P3, which is an `O(1)` prefix-sum
test** — so the theoretical worst case is only reached on input that is dense in
*non-word* short segments. That input exists and is measured: bait
`segment-dense-nonword` (`'a1+'` repeated). See Table B's performance row and
E-P1.

Round 5's equivalent constant was 38, but its spans were built unconditionally
and sorted; measured at the 256 KiB cap, round 6 is **2.6× faster on its worst
bait** than round 5 is on its worst bait (128.5 ms against 355.6 ms) and 1.2×
faster on the real vault.

#### A3 — the superset property, and what it does and does not prove

Round 4 asserted "the new span set is a superset of today's candidate set" and
verified it empirically. Round 5 proved it. Round 6 keeps the proof and
**corrects the claim it was used to support**, which was a live review finding:

> Today's candidate is a maximal run over `[A-Za-z0-9+/=]`. That alphabet is
> exactly `SPAN_RUN`'s alphabet minus tier 1. A maximal run over it is therefore
> a maximal `-`/`_`-free substring of some `SPAN_RUN` run — which is precisely an
> **L2 segment** (A3). L2 segments are emitted unconditionally. Therefore every
> candidate today's rule can produce is a span this design evaluates. ∎

**What that proves is span PRESENCE, not DETECTION.** A span can be present and
still not become a finding, because P3 may suppress it or it may fall in the
24–31 band. Round 5's spec asserted the superset property in a context that
implied detection was preserved, and it is not: `sft-s1-*` and `sft-s2-*` are
exactly the rows where legacy fires and this design does not, by design. The
honest statement is:

> Every candidate today's rule produces **is evaluated** by this design. Whether
> it becomes a finding is then decided by Table B, and the two places where the
> answer differs from legacy are the disclosed softenings S1 and S2 — nowhere
> else.

The corpus row `prec-superset-tier1` pins the presence property executably with
a 45-character legacy candidate made of fifteen 2-character pieces: the whole run
is word-shaped and P3-suppressed, and only L2 catches it. Measured independently
on the vault: **306 of 306** today-candidates reappear as spans, 0 missing
(E-V4).

### Table B — canonical: the precedence ladder and every threshold

**This table is the single source of truth for when a span is a `high-entropy`
finding.** The code block under "Exact contracts", the Table C delta, the Table D
verdicts, the acceptance criteria and the ADR amendment are all mirrors of it.

Evaluated top to bottom. The **first rung that applies decides**; no later rung
can overturn it. `b = bitsPerChar(span)`, computed over the **whole span
including any `=` padding** (unchanged from today's treatment). Every accepted
span produces label `high-entropy` at severity `quarantine`.

| Rung | Name | Condition | Verdict | `ScanLimits` keys |
|------|------|-----------|---------|-------------------|
| **P2** | canonical-UUID suppressor, **by range** | the span lies wholly inside an occurrence of 8-4-4-4-12 hex **with** version nibble ∈ `[1-8]` and variant nibble ∈ `[89abAB]`, **and** that occurrence is not `assignedToCredentialKey` | **not a candidate** | `ENTROPY_ASSIGN_LOOKBEHIND` |
| **P1a** | structured, hex arm | `HEX_SHAPE ∧ len ≥ 32 ∧ b ≥ 3.0` | **FINDING** | `ENTROPY_STRUCTURED_MIN_LEN`, `ENTROPY_HEX_MIN_BITS` |
| **P1b** | structured, base32 arm | `BASE32_SHAPE ∧ len ≥ 32 ∧ b ≥ 3.5` | **FINDING** | `ENTROPY_STRUCTURED_MIN_LEN`, `ENTROPY_MIN_BITS_PER_CHAR` |
| **P3** | benign-shape suppressor | `WORD_SEGMENT`-matching `SPLIT_ALL` segments of the span must cover ≥ half of **`span.length`** (delimiters are in the denominator). Computed in `O(1)` as `(cov[b+1] - cov[a]) * 2 >= len` — the `cov` prefix sums are built over the *same* `segs[]` extraction cuts at, so Table A0's closure is structural | **not a candidate** | — |
| — | entropy floor | `b < 3.5` | **not a candidate** | `ENTROPY_MIN_BITS_PER_CHAR` |
| **P4** | bare | `len ≥ 32` | **FINDING** | `ENTROPY_BARE_MIN_LEN`, `ENTROPY_MIN_BITS_PER_CHAR` |
| **P5** | contextual | `len ≥ 24 ∧ keywordNear(±80)` | **FINDING** | `ENTROPY_MIN_LEN`, `ENTROPY_MIN_BITS_PER_CHAR`, `ENTROPY_CONTEXT_WINDOW` |
| — | default | anything else | **not a candidate** | — |

The rung numbering is historical (P1 named the structured arm before P2 existed);
the **evaluation order is the row order above** and that is what is canonical.
P2 sits first because it is a range test on the text, not a shape test on the
span, and because a span inside a canonical UUID must not reach P1a — a UUID's
hex pieces are hex-shaped.

**P1 is only reachable for a single-segment span,** and the implementation says
so explicitly (`a === b`). This is not a narrowing: `HEX_SHAPE` and
`BASE32_SHAPE` both exclude every `DELIM_ALL` character, so a span covering two
or more segments contains a delimiter and can never match either. Making the
condition explicit lets the ladder skip `bitsPerChar` on every multi-segment
span until after P3 has rejected it, which is what keeps the pass linear in
practice.

The six ordering decisions, each settled by measurement (Table E):

| Decision | Chosen | Rejected alternative | Evidence |
|----------|--------|----------------------|----------|
| P1 above P3 | yes | suppressors first (the round-2 shape) | round-2 A1: `abcdefabcdefabcdefabcd9876543210` is hex-32 at 3.7038 bits **and** word-shaped; suppressors-first missed it bare and nested. P1-first costs **0** extra vault notes (E-V2) |
| P3's denominator | `span.length` | non-delimiter characters only | round-2 A2: with the delimiter-free denominator, `Documentationsegment` + 20 `-_` delimiters + a 20-char blob suppresses at 33% true coverage. `span.length` closes it, at **0** extra vault notes (E-V2) |
| P1 has two arms with separate floors | hex ≥ 3.0, base32 ≥ 3.5 | one shared 3.0 floor (the round-3 shape) | round-3 F2. `BASE32_SHAPE` accepts **every** all-uppercase run, and P1 outranks P3's uppercase-word suppressor, so a shared 3.0 floor quarantined ordinary uppercase text: `ABCDEFGHABCDEFGHABCDEFGHABCDEFGH` is 32 characters at exactly 3.0000 bits and fired, in prose, where legacy did not. The separate floor costs **nothing measurable**: random base32-32 falls below 3.5 bits in **0 of 20 000** samples (min 3.504) and **29 of 1 000 000** (0.0029%, min 3.3317) — and legacy misses those same samples too (E-S8). Hex genuinely needs its lower floor: **18.79%** of random hex-32 is below 3.5 (E-S1). Pinned by `bnd-b32-bits-below` / `bnd-b32-bits-at` |
| **P2's scope: by range, not by span identity** | a span *inside* a canonical UUID is not a candidate | round-4's `UUID_CANONICAL.test(span)` (span must **equal** a UUID) | **new in round 5, and a direct consequence of multi-segment extraction.** A canonical UUID's own sub-ranges are spans that are not themselves UUIDs, so span-identity P2 let them through: `the session token flow used <uuid> today` produced a finding on the 27-character span `9d4e-4a6f-8b7c-1e2d3f4a5b6c` via P5, reopening exactly the false-quarantine class round 4 measured and rejected. Round 5 attached a transcript count to this (E-T5); **that count is withdrawn** because the measurement method was unsound, and it is not restated with a new number — the decision stands on the executable pins instead. Pinned by `prec-p2-subgroup-not-a-candidate`, `prec-p2-session-prose`, `prec-p2-keyword-not-enough` |
| P2 scope: canonical nibbles only | yes, **with a disclosed cost** | suppress any 8-4-4-4-12 hex shape | canonical-only buys a hypothetical detection (~87.5% of random 128-bit values rendered in UUID format fall outside the canonical nibble set) and costs a real, measured false-quarantine class (residual **R4**): **21 distinct** uuid-shaped-but-non-canonical spans in 535 MB of real transcripts, **all 21 benign document identifiers, zero credentials** (E-T4). It is kept because the stated invariant forbids trading credential-grade detection for a lower false-positive rate. **This is now a single, resolved scope** — see the note below |
| P2's override: direct assignment only | `assignedToCredentialKey` (anchored separator, 64-char lookbehind) | (a) no override at all; (b) let P5's ±80 keyword window override P2 | (b) is catastrophic at a real denominator: a canonical UUID with a credential keyword within ±80 characters occurs **5 197 times in 528 MB** of real transcripts, none of them credentials — Claude Code JSONL writes `"uuid":"…"` next to `"tokens": N` constantly (E-T6). (a) leaves `authorization: <uuid>` invisible. The narrow override costs **0** genuine false quarantines (E-T7). Pinned by `prec-p2-assign-override`, `prec-p2-keyword-not-enough`, `prec-p2-session-prose` |

**On P2's scope being offered "both ways".** Round 4 asked the owner to choose
between canonical-only and shape-only in the approval block. That was a defect,
not a courtesy: the corpus, the acceptance criteria and the gate were all written
for canonical-only, so choosing shape-only would have left the executable
contract contradicting the approved one. **This spec resolves P2 to
canonical-only and offers no alternative.** If the owner prefers shape-only, that
is a separate WP with its own corpus delta (`prec-p2-canonical-only` flips,
`res-uuid-noncanon` flips, Table C's R4 and G7 rows come out) — it is named under
"Out of scope" and must not be smuggled in here.

Threshold values — canonical:

| Constant | Value | Status | Justification (measurement ids in Table E) |
|----------|-------|--------|--------------------------------------------|
| `SCAN_MAX_BYTES` | `256 * 1024` | unchanged | WP-122 |
| `ENTROPY_MIN_LEN` | `24` | unchanged | WP-122; governs P5 and the extraction floor |
| `ENTROPY_MIN_BITS_PER_CHAR` | `3.5` | unchanged | WP-122; governs P1b, P4 **and** P5 — deliberately **not** raised, so no length-≥32 detection is lost. At 4.5 it would lose 33.05% of random 32-char alphanumerics (E-S3) |
| `ENTROPY_BARE_MIN_LEN` | `32` | **new** | the only threshold that softens anything (class S1). 24–31 is the band where prose fragments and credentials overlap; every **non-hex** generator at length ≥ 32 clears 3.5 bits in 20 000/20 000 samples (E-S2) |
| `ENTROPY_STRUCTURED_MIN_LEN` | `32` | **new** | 32 hex chars = 128 bits; below that a hex run is usually a truncated id. Applies to both P1 arms |
| `ENTROPY_HEX_MIN_BITS` | `3.0` | **new** | P1a only. A *floor*, not a raise: hex maxes out at 4.0 bits/char and **18.79%** of random hex-32 falls below 3.5 (E-S1), so the hex arm needs its own lower floor. 3.0 still rejects `'a'×40` (0.0000 bits), `'abc'×20` (1.5850) and `deadbeef`×5 (2.1556), and costs only **3 of 20 000** random hex-32 samples (E-S1) |
| *(no `ENTROPY_BASE32_MIN_BITS`)* | — | **deliberately absent** | P1b reuses `ENTROPY_MIN_BITS_PER_CHAR`. Base32's ceiling is 5.0, not 4.0, so it does not need a lowered floor — and giving it one is exactly what created round-3's false-quarantine class F2 |
| `ENTROPY_CONTEXT_WINDOW` | `80` | **new** | symmetric; the keyword must fit **entirely** inside the window, so for the 6-character keyword `secret` the last accepted gap is 74 and 75 is rejected, in both directions (`bnd-win-*`) |
| `ENTROPY_ASSIGN_LOOKBEHIND` | `64` | **new** | P2's override only. `ASSIGNMENT_LEAD` is anchored at the end of the slice, so the separator must be immediately before the occurrence; 64 characters is simply enough room for the longest key plus quoting and whitespace. It is **not** a proximity window |
| *(no `ENTROPY_MAX_GROUP_SEGMENTS`)* | — | **deliberately absent** | round 5 had this at 8. It is deleted: a segment-count bound on extraction is a hit cap that silently returns clean, and every finite value of it has an adversarial family (Table A row A5). `REACH_TARGETS` is **not** a replacement — it is derived from `ENTROPY_MIN_LEN` and `ENTROPY_BARE_MIN_LEN`, both already in this table, and it makes spans shorter rather than fewer |

### Table C — canonical: the complete old→new detection delta

Derived from Tables A, B and E; it re-decides nothing. Because A3 is *proved*
(and independently verified 306/306, E-V4), every candidate today's rule
produces is still evaluated, so every detection change is a change of *rung* and
the lists below are exhaustive by construction. A3 proves span **presence**, not
detection — the two places where presence does not become detection are exactly
S1 and S2 below.

**Softenings — detections given up (this is the complete list):**

| Id | Class | Definition | Measured cost, with denominator |
|----|-------|-----------|---------------------------------|
| **S1** | short opaque span | a span 24–31 characters long with `b ≥ 3.5` that P1 does not accept and that has **no** credential keyword wholly within 80 characters either side | bare-token recall for 24–26-char generators drops to 0.00%: alnum-24 100.00→0.00, b64-16B 100.00→0.00, base32-26 99.83→0.00, hex-24 45.38→0.00 (N = 20 000 each, E-S4). **With** a keyword nearby the same shapes stay at 99.31–99.98% (hex-24 stays at 45.38%, unchanged from today — limited by its own entropy, not by this WP). This is also the entire residual of the `shortSegments()` family: the 20 of 100 that do not fire are exactly the 31-character cases without a keyword (E-X1) |
| **S2** | word-shaped span | a span whose `WORD_SEGMENT` segments — split on **`SPLIT_ALL`, the Table A0 delimiter set** — cover ≥ half of its own length (Table B, P3), where P1 does not apply | see the four sub-rows below |
| S2-a | S2 sub-class | machine-generated credential material that happens to be word-shaped | at length ≥ 32 the worst end-to-end bare recall of any generator is **99.97%** (b64-24B and b64url-24B; hex-32 99.98%, aws-40 99.99%, b64url-32B 99.99%, driveid-44 100.00%, everything else 100.00%). N = 20 000 per generator (E-S5). This class is also the entire residual of the base64-with-`+` sweep: the 4 in 7 844 that REACH does not catch are S2-a, and **the unbounded enumeration misses the same four** |
| S2-b | S2 sub-class | **human passphrase-style passwords** — word-shaped by construction | **99.31% → 0.00%**, i.e. essentially total loss, for 4-word + 4-digit passphrases (mean length 28.0, N = 20 000, E-S6), both bare and in prose next to the word "password". **Partial mitigation, unchanged by this WP:** the labelled `key=value` rules still catch the *assignment* form at **100.00%** measured end to end — `password=<passphrase>` still yields a finding and both gates still withhold (E-S7). The prose form (`My password is X`) and the bare form are lost. The dream ingests chat transcripts where a pasted password is plausible, so this is a real exposure, not a theoretical one |
| S2-c | S2 sub-class | any all-lowercase span ≥ 24 characters — `WORD_SEGMENT`'s `[a-z]{2,}` arm has no length cap | fully suppressed. **Deliberate:** capping that arm at 23 characters was measured and rejected — it costs a large number of additional false positives, every one a long lowercase URL slug such as `consumerpriceinflationukjuly2025`, while costing 0 on the vault (E-T8) |
| S2-d | S2 sub-class | a span containing `=` whose two sides are both word-shaped, e.g. `Documentation=RepositoryConfiguration` | now suppressed; legacy and the round-3 design both fired (E-D2). This is S2 applying uniformly, because `=` joined the suppressor's delimiter set when Table A0 made one set out of four. Safe by delimiter closure: `=` is also a segment boundary, so a credential on either side is still evaluated (`pos-eq-embedded`) |

There are **no classes beyond S1 and S2.** In particular there is no softening at
length ≥ 32 for non-word-shaped spans: `ENTROPY_MIN_BITS_PER_CHAR` stays at 3.5.
Canonical UUIDs (P2) are not a softening — a UUID contains `-`, so it was never a
candidate under today's regex either. P1b's 3.5 base32 floor is not a softening
either: legacy needs 3.5 on the same run, so the two agree exactly on bare base32
(E-S8). **And there is no softening caused by extraction:** with no bound, the
extractor never declines to look.

**Strengthenings — detections gained (N = 20 000 per generator, E-S4):**

| Id | Class | Measured |
|----|-------|----------|
| **G1** | tokens containing `-` or `_` are no longer sliced below the length bar | bare-token recall: b64url-24B 58.40% → 99.97%, b64url-32B 74.33% → 99.99%, b64url-64B 97.35% → 100.00%, driveid-44 75.78% → 100.00% |
| **G2** | hex ≥32 in the 3.0–3.5 bits band (rung P1a) | hex-32 81.22% → 99.98%, hex-40 95.08% → 100.00% |
| **G3** | blobs embedded in URLs, DSNs, query strings and `<blob>.md` are isolated instead of absorbed | for generators of length ≥ 32, recall in the `notes/<blob>.md`, `?code=<blob>&` and DSN-password contexts is **99.97–100.00%**, against **58.40–100.00%** today |
| **G4** | a credential adjacent to a `+` or `=` inside an otherwise word-shaped token | the round-3 `+` bypass: `delimiterClosure()` goes from **94/95** firing to **95/95** (E-D1). Pinned by `pos-plus-embedded` and `pos-eq-embedded` |
| **G5** | **a credential that CONTAINS a canonical delimiter** | the round-5 fix, retained. `delimiterInside()` goes from **85/100** (round-4 extraction) to **100/100**; the randomized sweep from **7 844/7 844 bypassed** to **4/7 844** (E-D3, E-M1). Pinned by `pos-plus-inside` |
| **G6** | **a credential made of MANY SHORT pieces** | **the round-6 fix.** `shortSegments()` goes from **35/100** under round-5's bound-8 grouping to **80/100**, matching the unbounded enumeration exactly; the 20 that remain are softening S1, not extraction (E-X1). Pinned by the `shortSegments()` family and by the `seg-plus-10-prefix` worked example |
| **G7** | UUID-format credentials outside the canonical nibble set | now reach P4. **Hypothetical only** — 0 such spans in the re-measured 275-chunk transcript sample and 21 distinct in the full 535 MB corpus, all benign identifiers (E-T4). Recorded as a gain because the shape genuinely is a 128-bit random value, but its measured effect so far is entirely residual R4. Pinned by `prec-p2-canonical-only` |
| **G8** | a canonical UUID used as the value of a credential assignment | `authorization: <uuid>` previously invisible, now fires. **This is the only assignment form that was actually uncovered** — `token:`, `token=`, `api_key:`, `secret=`, `password:`, `"client_secret":`, `X-Api-Key:` and `Authorization: Bearer` are already caught by the unchanged labelled rules and always were (E-S9). Pinned by `prec-p2-assign-override` |
| **G9** | opaque blobs that a looser `WORD_SEGMENT` would have called word-shaped | the letters-then-digits arm requires a single-case letter run rather than `[A-Za-z]{3,}[0-9]{1,10}`, so arbitrary mixed-case blobs ending in a digit are not suppressed (E-T9) |

**Residual false positives (accepted):**

| Id | Shape | Status |
|----|-------|--------|
| **R1** | **Google Drive / Docs file ids** — 33 and 44 characters, 4.68 / 4.79 bits | **the largest real-world cost of this design, and it recurs — accepted, and MITIGATED outside this WP** by `WP-secret-revert-defers-ledger` (a revert stops costing the note permanently) and by `WP-secret-allowlist-exact-value-store` + `WP-quarantine-review-cli` (a human-ratified exact-value allowlist stops the recurrence). Fully re-characterised below; do not read the round-5 wording, which understated it |
| **R2** | a full 40-character git object SHA | fires on P1a — **as it already does today** (bits ≈ 3.58 ≥ 3.5). Unchanged by this WP |
| **R3** | a 32–39-character hex string at 3.0–3.5 bits (e.g. a truncated SHA) | **new** — the flip side of G2. Accepted: the alternative is missing 18.79% of real hex-32 credentials (E-S1). **19** occurrences in the 275-chunk transcript sample (E-T3). Pinned by `res-hex-32-lowbits` |
| **R4** | a UUID-shaped 8-4-4-4-12 hex identifier **outside** the RFC-4122 canonical nibble set — e.g. a docs-pipeline `document_id` | **measured, not assumed.** 21 distinct such spans in 535 MB of real transcripts; all 21 benign, none a credential (E-T4); **0** in the 275-chunk sample and **0** across the 180-note vault, so EP2 is unaffected. This is the price of P2's canonical-only scope. Pinned by `res-uuid-noncanon` |
| **R5** | base64 filler inside embedded binary/PDF payloads, isolated by a `+` cut | the price of G4. Arguably true positives (opaque encoded bytes); **2** occurrences in the 275-chunk sample, 0 on the vault. **No corpus vector** — every observed instance is private-corpus binary payload and must not be copied into the repository |
| **R6** | a path-like fragment of ≥ 32 characters whose word segments cover less than half of it, e.g. `packaging/build-<17-char tail>` or `<dir>/<dir>/<uuid-ish tail>` | **the largest new false-positive class by count, and it is NOT a round-6 regression** — see the re-measured comparison below. **Vault: 1 note of 180**, already flagged today, so **0 notes newly flagged**. Pinned by `res-path-tail-33` |

#### R1, re-characterised: a recurring quarantine, not a one-off

Round 5 described R1 as "3 of 178 notes, still quarantined, accepted". That is
not an honest cost model, and the review was right to say so. The denominator is
not notes; it is **consolidation attempts and lost note versions over time**,
because the ids are permanent body content and every dream run re-encounters
them.

Field evidence, `~/.wienerdog/state/quarantine/`, read-only on 2026-07-25
(E-R1, E-R2):

| Fact | Value |
|------|-------|
| notes quarantined by the shipped detector over the two nights 2026-07-24 and 2026-07-25 | **6** |
| of those, notes this design scans clean | **5** |
| of those, notes this design still quarantines | **1** — `2026-07-25-current-state.md`, 43 737 bytes |
| what makes it fire | one span: a 44-character Drive id, mask `99AAaaA-aAAAAAaaa9aAAaaAaaaAAAA9-aAAaAA-AaAa`, 4.79 bits |
| times that same note has been quarantined | at least **twice** — it was reported quarantined before this round and was quarantined again overnight; it has been restored by hand once |
| expected future rate | **every consolidation that touches it**, indefinitely, because the id is permanent body content |
| vault-wide | 2 distinct ids, **8 occurrences** across **6 notes**; 3 notes flagged by this design (E-R1) |

**The remedy the review named was measured, and it does not work.** The only
suppression the review considered defensible is one anchored to an *exact*
official Drive or Docs URL slot — `drive.google.com/…/d/<id>` or
`?id=<id>` — with adjacent spans still evaluated independently. Measured against
the real vault (E-R1):

| Question | Answer |
|----------|--------|
| legitimate Drive-id coverage: occurrences sitting in an exact Drive/Docs URL slot | **0 of 8 (0.0%)** |
| what the occurrences actually look like | bare ids inside markdown backticks in Hungarian prose, e.g. `` `…` ``, never as part of a URL |
| adversarial secret recall **inside** the allowed slot, if adopted | **0.00%** by construction (N = 20 000 planted 44-char base64url secrets in `drive.google.com/file/d/<secret>/view`) |
| adversarial secret recall **adjacent** to the allowed slot, if adopted | **100.00%** (N = 20 000) — the adjacency requirement is satisfiable |
| generic-id collisions | not reached: the rule never fires on this corpus |
| EP2 / EP4 outcome if adopted | **unchanged** — all 3 notes still quarantined, because none of the ids is in a URL slot |

So the defensible remedy buys **zero** benefit on the corpus that motivates it
and costs a 100%-of-in-slot detection hole. **It is therefore not adopted.**

Two remedies that were considered and are explicitly rejected:

- **Allowlisting the shape `1` + 43 base64url characters.** **Rejected
  permanently** (owner decision, 2026-07-25 — not "not now", not "unless
  measured differently"). Violates fail-closed and would suppress roughly **1 in
  64** uniformly random 44-character base64url credentials, because that is the
  share of uniformly random 44-character base64url strings whose first character
  is `1`. The `driveid-44` generator exists precisely to make that cost
  measurable rather than arguable: it fires at **100.00%** under this design and
  **75.78%** under today's (E-S4). Do not adopt, here or in any successor WP; a
  length rule, a prefix rule, a character-class rule and a "provider-shaped id"
  rule are the same rejected thing (ADR-0033, Alternatives considered).
- **A generic `id` field context.** Unsafe: credentials are routinely stored
  under that name.

**What the owner is therefore being asked to accept for R1** is not "3 notes
once" but: *one specific 43 KiB note, and any future note containing a bare
Drive id, will be quarantined by this design on every consolidation that touches
it.* That is fail-closed and it is a real, recurring operational cost. It is
stated here rather than smoothed over, and it is OWNER-APPROVED item 3.

**R1's disposition is "accepted, mitigated by two follow-up WPs" — not "accepted
as-is with recurring manual restoration".** Neither mitigation is in this WP's
scope and neither changes a byte of the detector's shape logic; both are cited
here so the owner signs off on the mitigated cost, not the raw one:

- **`WP-secret-revert-defers-ledger`** (independent of this WP; can land first)
  removes the *destructive* half. Today a secret-reverted run still marks its
  source transcripts `processed`, so the withheld content never regenerates —
  that is what turned this false positive into the permanent loss of the
  2026-07-24 daily rollup. After it, a reverted run **defers** its transcripts
  and retries them, bounded, so a quarantine costs a retry rather than a note.
- **`WP-secret-allowlist-exact-value-store` + `WP-quarantine-review-cli`**
  (ADR-0033, both sequenced **after** this WP) remove the *recurrence*. The
  owner reviews what was withheld and permanently approves the specific,
  unique id by `sha256` of its exact bytes, so the same benign value is not
  filtered again and again. Whole-value equality only — no shape, no prefix, no
  length — and the allowlist may only ever suppress a `high-entropy` finding,
  never a labelled provider match. Suppression is **detector-wide**: an approved
  value also stops being redacted in alerts, run evidence, transcripts and logs,
  which is the owner's explicit choice over a gate-only allowlist on ADR-0024's
  one-shared-detector premise.

The allowlist WPs depend on this one (it pins this file's pre-edit blob hash
against a frozen oracle, and only after it does a detector run correspond to a
whole token rather than a fragment), so **until they land the manual restoration
remains** — but with `WP-secret-revert-defers-ledger` in place it is no longer
destructive. Nothing in either follow-up softens the fence: this WP still ships
no allowlist, no rung P0, and no configurability.

#### R6, re-measured against round 5 with the same method

Round 5 reported "2 835 new-location regions per ≈55 MB, of which 1 857 are R6",
leaving 978 (34.5%) unclassified. That measurement used a text-diffing region
reconstruction that mis-aligns after the first redaction marker; **its numbers
are withdrawn.** Round 6 extracts merged intervals directly from the pass and
classifies every one. Same 1-in-12 chunk sample, same self-reference filter, same
corpus (E-T2, E-T3):

| | round-5 bound-8 grouping | **round 6 (REACH)** |
|---|---|---|
| legacy regions | 39 426 | 39 426 |
| design regions | 8 580 | **8 565** |
| regions at locations legacy did not redact | 6 467 | **6 394** |

Round 6 produces **fewer** regions and **fewer** new locations than round 5. R6
is not a round-6 regression; the round-5 figure was simply wrong.

Classification of **all 6 394** new-location regions — 0 unclassified:

| Class | Regions | Share | Total bytes |
|---|---|---|---|
| R6 — span contains a word-shaped segment (path-like) | 6 347 | 99.3% | 317 025 |
| TP — no word-shaped segment, opaque high-entropy blob | 26 | 0.4% | 3 362 |
| R3 — hex ≥32 at 3.0–3.5 bits | 19 | 0.3% | 624 |
| R5 — base64 filler | 2 | 0.0% | 460 |
| R4 — uuid-shaped, non-canonical | 0 | 0.0% | 0 |
| unexplained | **0** | 0.0% | 0 |

**Benign bytes removed, quantified.** Across the 6 347 R6 regions the characters
belonging to word-shaped segments total **130 287**, i.e. a mean of **20.5
benign characters per region** out of a mean region length of 49.9 — about 41% of
each R6 region is benign text that a `redactOnly` sink will now mask. Two
representative shapes, as character-class masks (no corpus text was copied):
`/aaa/aaaaaaa/9a/99aaa9a99_a999aaaaa999999999aa/A//aaaaa-aaaaaa-9999-99-99` (73
chars) and `aaaaaaaaa/aaaaa/aaaaa-aaaaaaa/aaaaaa-9a9aaaa9-9999-9a9a-a99a-aaaaa999999a`
(73 chars).

**Gate-only artifacts on unsaturated inputs.** Round 5 argued from "0 newly
flagged chunks", and the review correctly objected that a saturated corpus
proves nothing. Two separate populations are therefore reported (E-T1, E-T10):

| Population | What it speaks to | Denominator | Newly flagged |
|---|---|---|---|
| the maintainer's vault, 180 notes | **EP2** — this is what a staged note looks like | 180 notes, 102 flagged by legacy | **0** (round-4: 0, round-5: 0) |
| 4 KiB transcript windows that legacy does **not** flag | the `redactOnly` sinks on unsaturated input | **442** legacy-clean windows out of 3 273 sampled | round-4 **7** (1.58%), round-5 **9** (2.04%), **round 6 9 (2.04%)** |
| whole 200 000-char transcript chunks | saturated; reported only for continuity | 275 sampled | **0** |

The 2.04% figure is the honest one and it is **identical to round 5's** — this
design does not widen it. Of the 51 regions in those 9 windows, 12 are R6 path
fragments and 6 are opaque blobs; the classification is the same as above.
Because those windows are transcript content, not staged notes, the exposure is
the five `redactOnly` sinks of Table F, not EP2. The EP2 population's answer is
the vault row: **0 of 180**.

**Accepted residual miss:**

| Id | Shape | Status |
|----|-------|--------|
| **M1** | a 128-bit credential rendered as a *canonical* RFC-4122 UUID **bare or in prose** — e.g. `the session token flow used <uuid> today` | **not a regression** — today misses it too. Measured (E-S9): `token:`, `token=`, `api_key:`, `secret=`, `password:`, `"client_secret":`, `X-Api-Key:` and `Authorization: Bearer` are all already caught by unchanged labelled rules; `authorization: <uuid>` is closed by P2's narrow override (G8). What remains is the bare and prose forms only, **and every fragment of them** (P2 is a range test). The broad fix (P5's ±80 window overriding P2) was measured and rejected at **5 197 false quarantines per 528 MB** (E-T6). Pinned by `prec-p2-session-prose`, `prec-p2-keyword-not-enough` and `prec-p2-subgroup-not-a-candidate` |

**One behavior change that is neither a softening nor a strengthening:**
**redaction boundaries can widen.** Because a reach span may combine a word
segment with a blob and fail P3 as a whole, an accepted region can start earlier
than it would have under round-4 extraction:
`Documentation-Repository-Configuration-<blob>` becomes
`Documentation-[REDACTED:high-entropy]`, not
`Documentation-Repository-Configuration-[REDACTED:high-entropy]`. Detection is
unaffected and the finding count is unaffected; more benign bytes are replaced —
quantified at 20.5 characters per R6 region above. For the two gates this is
invisible (they revert the whole artifact anyway); for the five `redactOnly`
sinks it means slightly more of a log line is masked. Pinned by
`prec-a7-nested-bare`'s exact-output assertion, and by the two multi-region
assertions in Acceptance criteria (`multi-region exact output` and
`multi-region count`), which round 5 lacked.

Overall on the maintainer's vault (n = 180 notes): **102/180 (56.7%) → 4/180
(2.2%)**; notes flagged by the new rule but **not** by today's rule: **0**
(E-V1, E-V2). Five of the six notes quarantined on 2026-07-24 and 2026-07-25
scan clean; the sixth is R1 (E-V3).

### Table D — canonical: the `new` verdict of every corpus row

**This table is the single source of truth for the `NEW` map this WP adds to
`tests/fixtures/secret-scan-corpus.js`.** The literal inputs are **not** repeated
here: they live in that fixture, which `WP-secret-scan-baseline-oracle` merged and
which is in this WP's Deliverables, so you will read it. The `old` column lives
in the same fixture as `LEGACY` and is **not** this WP's to change.

Every verdict below was executed against the reference implementation of the
code block under "Exact contracts" on 2026-07-25; they are observed results, not
intentions. **Every keyed verdict is identical to round 5's** — the extraction
change is invisible to the corpus and visible only in the two adversarial
generator families and in the new `shortSegments()` family.

| Family | Cases | Verdict asserted per case |
|--------|-------|---------------------------|
| `LABELLED_INPUTS` + `LABELLED_BASELINE` | 18 | `deepStrictEqual(scanAndRedact(input), baseline)` — byte-identical to the pre-change result |
| `NEGATIVE` | 20 | `findings.length === 0` for **all 20** |
| `POSITIVE` | 23 | exactly one `high-entropy` finding at `quarantine`, `count === 1`, no labelled finding, for **all 23** |
| `SOFTENED` | 9 | `findings.length === 0` for **all 9** (and `LEGACY[id] === true`, already asserted by the baseline WP) |
| `BOUNDARY` | 31 | `NEW[id]` per the table below |
| `PRECEDENCE` | 13 | `NEW[id]` per the table below |
| `RESIDUAL_FP` | 3 | `NEW[id]` per the table below — all three **fire**; that is the accepted cost |
| `delimiterClosure()` | 95 | `findings.length > 0` for **all 95** |
| `delimiterReverse()` | 5 | `findings.length === 0` for **all 5** |
| `delimiterInside()` | 100 | `findings.length > 0` for **all 100** |
| `shortSegments()` | 100 | `findings.length > 0` for **exactly 80**; the 20 that do not fire are exactly the ids matching `seg-*-8-{bare,prefix,suffix,both}` — softening S1 |

`NEW` is keyed exactly like `LEGACY` and must contain one entry per id of
`POSITIVE`, `SOFTENED`, `BOUNDARY`, `PRECEDENCE`, `RESIDUAL_FP` and `neg-1` …
`neg-20`. For `NEGATIVE` and `SOFTENED` every value is `false`; for `POSITIVE`
every value is `true`. The generator families are asserted by count and by named
exception, not through `NEW`.

#### D-1 — `BOUNDARY` (31)

`old` is repeated here for readability only; the fixture's `LEGACY` map is
canonical for it and the gate cross-checks the two.

| Id | old | **new** | What changed, if anything |
|----|-----|---------|---------------------------|
| `bnd-len-23-kw` | false | false | |
| `bnd-len-24-kw` | true | true | |
| `bnd-len-25-kw` | true | true | |
| `bnd-len-31-bare` | true | **false** | softening S1 |
| `bnd-len-32-bare` | true | true | |
| `bnd-len-33-bare` | true | true | |
| `bnd-hexlen-31` | false | false | |
| `bnd-hexlen-32` | false | **true** | gain G2 |
| `bnd-hexlen-33` | false | **true** | gain G2 |
| `bnd-hexbits-below` | false | false | |
| `bnd-hexbits-at` | false | **true** | gain G2 — same literal as `bnd-hexlen-32`, different axis |
| `bnd-hexbits-above` | false | **true** | gain G2 |
| `bnd-bits-below` | false | false | |
| `bnd-bits-at` | true | true | |
| `bnd-bits-above` | true | true | |
| `bnd-ctxbits-below` | false | false | |
| `bnd-ctxbits-above` | true | true | |
| `bnd-win-before-74` | true | true | |
| `bnd-win-before-75` | true | **false** | softening S1 — the window boundary |
| `bnd-win-after-74` | true | true | |
| `bnd-win-after-75` | true | **false** | softening S1 — the window boundary |
| `bnd-cover-half` | false | false | P3 at exactly ½ coverage |
| `bnd-cover-under` | false | **true** | P3 one character under ½ |
| `bnd-lowent-a40` | false | false | pinned by the untouched test at line 186 |
| `bnd-lowent-abc60` | false | false | pinned by the untouched test at line 186 |
| `bnd-lowent-deadbeef` | false | false | |
| `bnd-reentrancy` | false | false | |
| `bnd-b32-bits-below` | false | false | the round-3 F2 vector — must stay false |
| `bnd-b32-bits-at` | true | true | |
| `bnd-b32-len-31` | true | **false** | softening S1 |
| `bnd-b32-len-32` | true | true | |

**Counts asserted by the gate: 15 `true` in `old`, 16 `true` in `new`.**

#### D-2 — `PRECEDENCE` (13) and `RESIDUAL_FP` (3)

| Id | old | **new** | Additional assertion |
|----|-----|---------|----------------------|
| `prec-p1-over-p3-bare` | true | true | |
| `prec-p1-over-p3-nested` | true | true | |
| `prec-p3-denominator` | false | **true** | |
| `prec-p2-uuid-v7` | false | false | |
| `prec-p2-canonical-only` | false | **true** | |
| `prec-p2-assign-override` | false | **true** | output is exactly `authorization: [REDACTED:high-entropy]` |
| `prec-p2-keyword-not-enough` | false | false | |
| `prec-p2-session-prose` | false | false | |
| `prec-p2-subgroup-not-a-candidate` | false | false | round-5 vector. Without P2's range scope this fires on the 27-character reach span `9d4e-4a6f-8b7c-1e2d3f4a5b6c` |
| `prec-p1-b32-not-over-uppercase` | false | false | |
| `prec-a7-nested-bare` | true | true | output is exactly `Documentation-[REDACTED:high-entropy]`, `count === 1` — the boundary-widening pin |
| `prec-a9-merge` | true | true | output is exactly `[REDACTED:high-entropy]`, `count === 1` |
| `prec-superset-tier1` | true | true | output is exactly `abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst-[REDACTED:high-entropy]`, `count === 1` — the A3 presence pin |
| `res-hex-32-lowbits` | false | **true** | residual R3 |
| `res-uuid-noncanon` | false | **true** | residual R4 |
| `res-path-tail-33` | false | **true** | residual R6; output is exactly `path [REDACTED:high-entropy] cached` |

**Counts asserted by the gate: 5 `true` in `old`, 11 `true` in `new` across these
16 rows.**

Two rows deserve one more sentence each.

`pos-plus-inside` is why round 5 existed: under round-4 extraction it was
`old = true, new = false`. Under this design it is `true / true` with output
`abcdefghijklmnopqrstuvwxyzabcdefg+[REDACTED:high-entropy]`.

`seg-plus-10-prefix`, in the new `shortSegments()` family, is why round 6
exists: under round-5 bound-8 grouping it is `old = true, new = false`. Under
this design it is `true / true` with output
`documentationrepositoryconfigurationsomethinglong+[REDACTED:high-entropy]`.

### Table E — canonical: provenance of every number in this spec

No figure appears anywhere in this spec without a row here. Three provenance
classes, and the differences are not cosmetic:

- **repo-reproducible** — regenerable from this repository alone by running the
  command in the "How to reproduce" column. Deterministic (fixed-seed splitmix32
  PRNG, no `crypto` randomness except in `--perf`, which measures time).
- **owner-attested / external** — measured against the maintainer's private vault
  or private Claude Code transcripts. **Not reproducible from the repository, and
  never will be**: the inputs are private and must not be copied into it
  (ADR-0024). The owner is asked to accept these on attestation.
- **owner-supplied, not re-measured** — a figure the owner produced and this spec
  records without reproducing, because reproducing it would require building the
  thing the owner forbade. Exactly one row is in this class.

**Every figure below was re-measured in round 6** against the code block under
"Exact contracts", except where the class says otherwise. Round-5 figures that
changed are marked; two are **withdrawn** as unsound.

| Id | Figure | Class | How to reproduce / provenance |
|----|--------|-------|-------------------------------|
| E-M1 | the base64-with-`+` bypass sweep of Table A row A5: denominator **7 844** of 20 000 draws; bypasses 7 844 / 7 844 / 4 158 / 1 432 / 333 / 12 / 4 / 4 / 4 / 4 / **4** for round-4 tiers, bounds 1, 2, 3, 4, 6, 8, 16, 64, unbounded, and REACH | repo-reproducible | `node scripts/measure-entropy-arms.js --extract` |
| E-M2 | the round-4 critical: `pos-plus-inside` is `old = true, new = false` under round-4 extraction and `true / true` under this design | repo-reproducible | the `--extract` row for `round4`; the vector itself is pinned in the corpus |
| E-M3 | rejected narrowings: trimming word-shaped end segments raises the bypass rate from **4** to **1 070** of 7 844; refusing to start a span at a word-shaped segment raises it to **574**; emitting only maximal non-word blocks raises it to **1 574** (20.07%) and adds nothing on top of REACH (identical verdicts on all 7 844) | repo-reproducible | `--extract` prints the `trim`, `nonword-start` and `residue-only` rows alongside the sweep |
| E-M4 | the bigram discriminator: vault 11–41 of 178, 1–4 notes newly flagged; hex credentials −6.48 mean log2 bigram probability against a held-out prose tail at −7.28 | **owner-supplied, not re-measured** | measured by the orchestrator before round 5 and reported by the owner. **Deliberately not reproduced**: the owner's binding decision is that no bigram or language-model discriminator may be introduced, and building one to re-measure it would violate that decision. Recorded so the alternative is not re-proposed |
| E-X1 | the `shortSegments()` family: **100** cases; legacy **84**; round-4 tiers **35**; every bound from 1 to 8 **35**; bounds 16 and 64 and unbounded **80**; REACH **80**. The 20 REACH misses are exactly `seg-*-8-{bare,prefix,suffix,both}` (31-character credentials without a keyword) | repo-reproducible | `--extract`, the `short` rows; the family itself is in the corpus fixture |
| E-X2 | REACH versus unbounded enumeration: on planted credentials (24/28/32/40/48/64 chars × 0/1/2/3/5/9/15 internal delimiters, N = 20 000 per cell) REACH is within **0.06 pp** of unbounded in all 42 cells; on 200 000 random word/path soup samples REACH fires **49.636%** against unbounded's **51.108%** and legacy's **44.036%**; on all 399 corpus and generator inputs the two are identical | repo-reproducible | `--extract --differential` |
| E-S1 | 18.79% of random hex-32 below 3.5 bits (**3757**/20 000); below 3.0: **3**/20 000; min 2.928 | repo-reproducible | `node scripts/measure-entropy-arms.js --candidate`, row `hex-32`, columns `<3.0` and `<3.5` |
| E-S2 | every **non-hex** generator at length ≥ 32 clears 3.5 bits in 20 000/20 000; hex-32 is 3757, hex-40 983, hex-64 8 | repo-reproducible | same, column `<3.5` |
| E-S3 | 33.05% of random alnum-32 below 4.5 bits (**6609**/20 000) | repo-reproducible | same, row `alnum-32`, column `<4.5` |
| E-S4 | every old→new recall figure in Tables B/C (S1, G1, G2, G3), including `driveid-44` at 75.78 → 100.00 | repo-reproducible | same, columns `bare:old/new`, `keyword:old/new`, `suffixed:*`, `filename:*`, `query:*`, `dsn:*` |
| E-S5 | S2-a: worst end-to-end bare recall at len ≥ 32 is **99.97** (b64-24B, b64url-24B) | repo-reproducible | same, column `bare:new`, rows with `len ≥ 32` |
| E-S6 | S2-b: passphrase recall **99.31 → 0.00** bare and prose, mean length **28.0**, N = 20 000 | repo-reproducible | `node scripts/measure-entropy-arms.js --passphrase`, rows `bare` / `prose`, columns `entropy-old` / `entropy-new`, plus `meanlen` |
| E-S7 | S2-b mitigation, measured **end to end at the gate**: `password=<passphrase>` yields ≥1 finding in **100.00%** of samples under both the shipped and the new detector | repo-reproducible | same, row `assignment`, columns `gate-old` / `gate-new` |
| E-S8 | P1b's floor costs nothing: random base32-32 below 3.5 bits is **0**/20 000 (min 3.504) and **29**/1 000 000 (0.0029%, min 3.3317); legacy misses the same samples | repo-reproducible | `--candidate`, row `base32-32`, column `<3.5`; and `--candidate --n=1000000` |
| E-S9 | which UUID-assignment forms the **unchanged labelled rules** already cover: `token:` `token=` `api_key:` `secret=` `password:` `"client_secret":` `X-Api-Key:` `Authorization: Bearer` all yield a finding today; `authorization: <uuid>`, `session-prose` and a bare UUID do not; under the new detector `authorization-colon` becomes `yes` and nothing else changes | repo-reproducible | `node scripts/measure-entropy-arms.js --uuid-forms` — **all eleven** rows, both columns |
| E-D1 | `delimiterClosure()`: legacy **95/95**; the round-3 design **94/95** (fails only at `+`); this design **95/95** | repo-reproducible | the closure tests in `tests/unit/secret-scan.test.js` |
| E-D2 | `delimiterReverse()`: this design yields zero findings for all **5**; legacy fires on **3**; the round-3 design fired on `=` | repo-reproducible | the reverse tests in the same file |
| E-D3 | `delimiterInside()`: legacy **94/100**; round-4 tiers **85/100**; bound 2 **90/100**, bound 3 **95/100**, bounds 4 and above **100/100**; REACH **100/100** | repo-reproducible | the inside tests in the same file; the per-variant figures from `--extract` |
| E-P1 | performance at the 256 KiB cap, minimum of five runs, this design against the shipped detector: `one-long-run` 21.7 / 6.8, `random-base64` 76.0 / 9.5, `ab-dash-bait` 16.1 / 3.4, `camel-bait` 29.2 / 6.0, `delimiter-padding` 18.2 / 2.5, `hex-run` 25.5 / 6.0, `segment-dense-word` 9.2 / 9.4, `segment-dense-blob` 56.9 / 5.0, `uuid-dense` 62.9 / 4.6, `segment-dense-nonword` **128.5** / 4.8, `segment-dense-short` 121.8 / 5.4 ms. Worst bait **128.5 ms**, worst ratio **26.5×**, both on `segment-dense-nonword`. Round-5 bound-8 grouping on the same machine: worst bait **355.6 ms** on `segment-dense-word`. Round-6 numbers are bimodal at 98/128 ms across runs (JIT tier); the worse mode is quoted | repo-reproducible | `node scripts/measure-entropy-arms.js --perf` |
| E-P2 | the binary search in `insideSuppressedUuid` is load-bearing: with a linear scan the `uuid-dense` bait is several times slower, because the check is then `O(spans × uuids)` | repo-reproducible | replace the binary search with a linear scan and re-run `--perf`; do **not** ship that |
| E-P5 | sustained throughput, 40 consecutive 256 KiB chunks of the worst bait (`segment-dense-nonword`): shipped **50.2 MiB/s**, round-5 bound-8 **12.4 MiB/s**, this design **1.9 MiB/s**. This is the figure the per-call cap does not bound and the reason the gate asserts it | repo-reproducible | `node scripts/measure-entropy-arms.js --sustained` |
| E-P4 | on **real** content the cost is 2.0×, not 26×: the whole 180-note vault (1 079 456 bytes) scans at **24 ms/MiB** shipped, **58** under round-5 grouping and **48** under this design | owner-attested | private vault at `~/Obsidian/gyula`, scanned read-only 2026-07-25 |
| E-V1 | vault today: **102 of 180 notes** flagged; 295 legacy regions. *(Round 5 reported 100 of 178; the vault has since gained two notes.)* | owner-attested | same vault, 180 `.md` files |
| E-V2 | vault under this WP: **4 of 180** flagged (5 regions), **0** newly flagged vs today. Round-4 extraction and round-5 bound-8 grouping also give 4 of 180 | owner-attested | same scan |
| E-V3 | of the **6** notes in `~/.wienerdog/state/quarantine/` dated 2026-07-24 and 2026-07-25, **5** scan clean under this design and **1** does not — the 43 737-byte R1 note | owner-attested | `~/.wienerdog/state/quarantine/`, scanned read-only 2026-07-25 |
| E-V4 | Table A3 presence property, verified as well as proved: **306 of 306** today-candidates reappear as spans, 0 missing | owner-attested | same vault scan |
| E-R1 | R1 detail: 2 distinct Drive ids (33 and 44 chars, 4.68 / 4.79 bits), **8 occurrences** in **6 notes**, **0** of the 8 in an exact Drive/Docs URL slot; the URL-slot suppression rule would therefore cover 0 of 8 while zeroing in-slot detection (N = 20 000 planted secrets, 0.00% in-slot, 100.00% adjacent) | owner-attested (vault) + repo-reproducible (the planted-secret half) | same vault scan; the planted-secret half is `--candidate` row `driveid-44` plus the in-slot/adjacent probe described in Table C |
| E-R2 | R1 recurrence: the same 43 737-byte note was quarantined on 2026-07-25 having already been quarantined and hand-restored once | owner-attested | `~/.wienerdog/state/quarantine/` file listing, 2026-07-25 |
| E-T1 | transcript corpus: **1 153 files, 536 248 923 bytes, 3 359 chunks** of ≤ 200 000 chars, every `~/.claude/projects/**/*.jsonl` with mtime ≥ 2026-07-01. Chunks flagged by this design that legacy did not flag: **0** | owner-attested | private `~/.claude/projects/**/*.jsonl`, scanned read-only 2026-07-25 |
| E-T2 | region counts on a deterministic 1-in-12 chunk sample (**275 chunks, ≈55 MB**, 4 self-referential chunks excluded), intervals taken directly from the pass: legacy **39 426**, round-5 bound-8 **8 580** (6 467 at new locations), this design **8 565** (**6 394** at new locations). **Round 5's 7 834 / 2 835 are withdrawn** — they came from a text-diffing reconstruction that mis-aligns after the first marker | owner-attested | same, sampled |
| E-T3 | classification of **all 6 394** new-location regions, 0 unclassified: R6 **6 347** (317 025 bytes), true-positive opaque blobs **26**, R3 **19**, R5 **2**, R4 **0**. Benign (word-segment) characters inside R6 regions: **130 287**, mean **20.5** per region | owner-attested | same sample; shapes recorded as character-class masks only — no corpus text was copied |
| E-T10 | unsaturated inputs: of **3 273** sampled 4 KiB windows (1-in-40, self-reference filtered), **442** are not flagged by legacy; of those, round-4 flags **7** (1.58%), round-5 bound-8 flags **9** (2.04%) and this design flags **9** (2.04%), producing **51** regions | owner-attested | same corpus, 4 KiB windowing |
| E-T4 | **21 distinct** uuid-shaped-but-non-canonical spans in the full 535 MB corpus; inspection of all 21 shows docs-pipeline `document_id` / `platformId` values, a publication id, a news-article URL segment and a `1111…` placeholder — **zero credentials**. **0** in the 275-chunk sample. Residual R4 | owner-attested | same corpus |
| E-T6 | letting P5's ±80 window override P2 costs **5 197** false quarantines per 528 MB (all unflagged by legacy) — Claude Code JSONL writes `"uuid"` beside `"tokens"` constantly. *(Round-4 figure, unchanged, because the rejected variant is unchanged.)* | owner-attested | round-4 transcript scan |
| E-T7 | the narrow `assignedToCredentialKey` override fires **12** times in the corpus, and **all 12** occur in chunks containing this WP's own spec or review text; distinct strings with no self-referential occurrence: **0**. On the vault: **0** canonical UUIDs assigned to a credential key | owner-attested | same, with a self-reference filter |
| E-T8 | capping `WORD_SEGMENT`'s lowercase arm at 23 costs a large number of additional false positives, all long lowercase URL slugs, at 0 vault benefit | owner-attested | same |
| E-T9 | requiring a single-case letter run in the letters-then-digits arm prevents suppression of mixed-case blobs ending in digits | owner-attested | same |

**Withdrawn round-5 figures.** E-T5 (the "162 regions removed by range-scoping
P2" figure) and the region counts inside round-5's E-T2/E-T3 were produced by the
mis-aligning reconstruction described above. P2's range scope is still correct
and still pinned executably by `prec-p2-subgroup-not-a-candidate`; only the
transcript *count* attached to it is withdrawn rather than restated with a wrong
number.

**On self-reference in the transcript corpus.** The maintainer's Claude Code
transcripts contain this WP's own drafts and review rounds, so any vector quoted
in the spec appears in the corpus. Every count above that could be affected is
reported with a self-reference filter (E-T2, E-T3, E-T7, E-T10). Do not re-derive
these numbers without the same filter.

**On saturation.** Chunk-level "flagged / total" at 200 000 characters is a
useless statistic at this corpus size: essentially every chunk contains something
high-entropy under legacy. That is why round 6 reports **region-level** counts
with a full classification (E-T3) and, separately, a genuinely unsaturated
population — 4 KiB windows that legacy does not flag (E-T10). The chunk-level
figure is kept only for continuity with round 5.

#### `scripts/measure-entropy-arms.js` — what this WP adds

`WP-secret-scan-baseline-oracle` owns the harness's structure — the splitmix32
PRNG (`SEED = 0x5eed1234`), the alphabets, the 19 generators, the 6 contexts, the
loop order, the 64-word passphrase list, the 11 UUID forms and the 11 `--perf`
baits — and its Table H is canonical for all of them. **Do not change any of
that.** Read that spec's Table H if you need the details; the file itself is in
this WP's Deliverables, so read the file.

This WP adds exactly this:

1. **`--candidate`** — the `--baseline` table plus, after each `<context>:old`
   column, a `<context>:new` column holding the percentage of samples for which
   `scanAndRedact(s).findings.some(f => f.label === 'high-entropy')` is true. The
   `old` columns must be **bit-identical to `--baseline`'s**; the gate diffs them.
2. **`--extract`** — the extractor comparison of Table A row A5, plus the rejected
   narrowings of E-M3, plus `--extract --differential` for E-X2. Output format is
   fixed below. The alternative extractors are **local to the script** and must
   not be added to `src/`.
3. **`--sustained`** — E-P5: 40 consecutive 256 KiB chunks of the
   `segment-dense-nonword` bait through the shipped detector and through the new
   one, printing MiB/s for each.
4. `--passphrase` gains `entropy-new` and `gate-new` columns; `--uuid-forms`
   gains a second `yes`/`no` column; `--perf` keeps its eleven baits and their
   order and gains two columns — `<new-ms>` and `<ratio>` — so each line becomes
   `<label>\t<bytes>\t<shipped-ms>\t<new-ms>\t<ratio>`. `--baseline` is untouched
   and the gate re-diffs it.

**`--candidate` — the complete expected table for `SEED = 0x5eed1234`,
`N = 20000`.** Checked in as `tests/fixtures/measure-entropy-arms.candidate.txt`:
line 1 `N = 20000`, line 2 the tab-separated header, then these 19 rows,
tab-separated, `\n`-terminated, no trailing blank line.

| generator | len | minBits | <3.0 | <3.5 | <4.5 | bare:old | bare:new | keyword:old | keyword:new | suffixed:old | suffixed:new | filename:old | filename:new | query:old | query:new | dsn:old | dsn:new |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hex-24 | 24 | 2.689 | 100 | 10925 | 20000 | 45.38 | 0.00 | 45.38 | 45.38 | 45.38 | 99.86 | 99.79 | 0.00 | 93.94 | 0.00 | 45.38 | 0.00 |
| hex-32 | 32 | 2.928 | 3 | 3757 | 20000 | 81.22 | 99.98 | 81.22 | 99.98 | 81.22 | 100.00 | 100.00 | 100.00 | 99.12 | 99.98 | 81.22 | 99.98 |
| hex-40 | 40 | 3.164 | 0 | 983 | 20000 | 95.08 | 100.00 | 95.08 | 100.00 | 95.08 | 100.00 | 100.00 | 100.00 | 99.86 | 100.00 | 95.08 | 100.00 |
| hex-64 | 64 | 3.351 | 0 | 8 | 20000 | 99.96 | 100.00 | 99.96 | 100.00 | 99.96 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 99.96 | 100.00 |
| base32-26 | 26 | 3.240 | 0 | 33 | 19995 | 99.83 | 0.00 | 99.83 | 99.31 | 99.83 | 99.47 | 100.00 | 99.47 | 100.00 | 0.00 | 99.83 | 0.00 |
| base32-32 | 32 | 3.504 | 0 | 0 | 19720 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| base32-52 | 52 | 4.007 | 0 | 0 | 9615 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-24 | 24 | 3.491 | 0 | 1 | 19014 | 100.00 | 0.00 | 100.00 | 99.98 | 100.00 | 99.98 | 100.00 | 0.00 | 100.00 | 0.00 | 100.00 | 0.00 |
| alnum-32 | 32 | 3.929 | 0 | 0 | 6609 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-40 | 40 | 4.201 | 0 | 0 | 496 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-64 | 64 | 4.659 | 0 | 0 | 0 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| b64-16B | 24 | 3.518 | 0 | 0 | 19657 | 100.00 | 0.00 | 100.00 | 99.89 | 100.00 | 99.79 | 100.00 | 0.00 | 100.00 | 0.00 | 100.00 | 0.00 |
| b64-24B | 32 | 3.926 | 0 | 0 | 6101 | 100.00 | 99.97 | 100.00 | 99.97 | 100.00 | 99.97 | 100.00 | 99.97 | 100.00 | 99.97 | 100.00 | 99.97 |
| b64-32B | 44 | 4.317 | 0 | 0 | 28 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| b64url-24B | 32 | 3.926 | 0 | 0 | 6101 | 58.40 | 99.97 | 58.40 | 99.97 | 58.40 | 99.97 | 68.19 | 99.97 | 66.44 | 99.97 | 58.40 | 99.97 |
| b64url-32B | 43 | 4.257 | 0 | 0 | 75 | 74.33 | 99.99 | 74.33 | 99.99 | 74.33 | 99.98 | 83.34 | 99.99 | 82.51 | 99.99 | 74.33 | 99.99 |
| b64url-64B | 86 | 4.997 | 0 | 0 | 0 | 97.35 | 100.00 | 97.35 | 100.00 | 97.35 | 100.00 | 98.06 | 100.00 | 97.96 | 100.00 | 97.35 | 100.00 |
| aws-40 | 40 | 4.213 | 0 | 0 | 410 | 100.00 | 99.99 | 100.00 | 99.99 | 100.00 | 99.99 | 100.00 | 99.99 | 100.00 | 99.99 | 100.00 | 99.99 |
| driveid-44 | 44 | 4.237 | 0 | 0 | 62 | 75.78 | 100.00 | 75.78 | 100.00 | 75.78 | 100.00 | 84.37 | 100.00 | 83.50 | 100.00 | 75.78 | 100.00 |

SHA-256 of `tests/fixtures/measure-entropy-arms.candidate.txt`:

```text
94313d1e3997d78dc2d0a42044072ddd897c3b6359f51ca0f565d95600c77f8d
```

**Why both a diff and a digest.** The gate diffs the harness's live output
against the checked-in fixture — that catches a detector regression with a
readable per-row failure. But if the implementer *generated* the fixture from
their own harness, that diff is circular. Three things break the circle and all
three are asserted: the digest above, transcribed from this spec into the gate;
the byte-identity of the `old` columns with
`tests/fixtures/measure-entropy-arms.baseline.txt`, which merged before this
branch existed; and the untouched `tests/unit/secret-scan-baseline.test.js`,
every assertion in which is `old`-side — including that WP's Table O
differential, which is what makes the `old` column itself trustworthy rather
than merely frozen.

**`--passphrase` — exact expected output**, four lines, each with its literal
column labels interleaved. **`\t` below stands for one literal tab character;
the output contains real tabs, not the two-character sequence:**

```text
bare\tentropy-old\t99.31\tentropy-new\t0.00\tgate-old\t99.31\tgate-new\t0.00
prose\tentropy-old\t99.31\tentropy-new\t0.00\tgate-old\t99.31\tgate-new\t0.00
assignment\tentropy-old\t100.00\tentropy-new\t0.00\tgate-old\t100.00\tgate-new\t100.00
meanlen\t28.0
```

**`--uuid-forms` — exact expected output**, `<form>` tab `<shipped>` tab
`<new>`, **eleven lines, all of which the gate checks byte for byte** (`\t`
again stands for one literal tab):

```text
authorization-colon\tno\tyes
bearer-header\tyes\tyes
token-colon\tyes\tyes
token-equals\tyes\tyes
api_key-colon\tyes\tyes
secret-equals\tyes\tyes
password-colon\tyes\tyes
client_secret-json\tyes\tyes
x-api-key-colon\tyes\tyes
session-prose\tno\tno
bare\tno\tno
```

**`--extract` — exact expected output.** All lines are tab-separated and `\t`
below stands for one literal tab. Three blocks separated by blank lines.

Block 1, the base64-with-`+` bypass sweep (E-M1, E-M3): `sweep` tab `<variant>`
tab `<bypasses>` tab `7844`, variants in this order. `round4` re-implements the
round-4 tiered extractor; `bound-N` re-implements round 5's contiguous groups at
bound `N`; `bound-inf` is the unbounded enumeration; `reach` is the shipped
design; `trim`, `nonword-start` and `residue-only` are the rejected narrowings.

```text
sweep\tround4\t7844\t7844
sweep\tbound-1\t7844\t7844
sweep\tbound-2\t4158\t7844
sweep\tbound-3\t1432\t7844
sweep\tbound-4\t333\t7844
sweep\tbound-6\t12\t7844
sweep\tbound-8\t4\t7844
sweep\tbound-16\t4\t7844
sweep\tbound-64\t4\t7844
sweep\tbound-inf\t4\t7844
sweep\treach\t4\t7844
sweep\ttrim\t1070\t7844
sweep\tnonword-start\t574\t7844
sweep\tresidue-only\t1574\t7844
```

Block 2, `delimiterInside()` per variant (E-D3): `inside` tab `<variant>` tab
`<fires>` tab `100`.

```text
inside\tlegacy\t94\t100
inside\tround4\t85\t100
inside\tbound-2\t90\t100
inside\tbound-3\t95\t100
inside\tbound-4\t100\t100
inside\tbound-8\t100\t100
inside\tbound-inf\t100\t100
inside\treach\t100\t100
```

Block 3, `shortSegments()` per variant (E-X1) — **the round-6 argument**:
`short` tab `<variant>` tab `<fires>` tab `100`.

```text
short\tlegacy\t84\t100
short\tround4\t35\t100
short\tbound-2\t35\t100
short\tbound-4\t35\t100
short\tbound-8\t35\t100
short\tbound-16\t80\t100
short\tbound-64\t80\t100
short\tbound-inf\t80\t100
short\treach\t80\t100
```

`--extract --differential` additionally prints the E-X2 comparison: one
`recall` line per (length, delimiter-count) cell with REACH's and unbounded's
percentages, then

```text
soup\tlegacy\t44.036\treach\t49.636\tbound-inf\t51.108\t200000
maxcell\t0.06
```

where `maxcell` is the largest absolute percentage-point difference between
REACH and `bound-inf` across the 42 recall cells.

**`--sustained` — exact expected shape** (E-P5). Three lines; the MiB/s values
are machine-dependent, so the gate asserts a floor on the third line only.

```text
sustained\tshipped\t<MiBps>
sustained\tbound-8\t<MiBps>
sustained\treach\t<MiBps>
```

Observed on the maintainer's machine, 2026-07-25: **50.2 / 12.4 / 1.9 MiB/s**.

**`--perf` — the budget, and why there are two of them.** Round 5's gate was a
single 1500 ms tripwire, which permitted a **319×** regression against the
shipped detector while the design's worst bait was 355.6 ms. That is not a gate.
Round 6 asserts three things, each with its measured value and its headroom:

| Budget | Value | Worst measured | Headroom | What it catches |
|---|---|---|---|---|
| absolute, per bait, at the 256 KiB cap | **400 ms** | 128.5 ms (`segment-dense-nonword`) | 3.1× | "this is simply too slow on the maintainer's machine" |
| ratio against the shipped detector, per bait | **60×** | 26.5× (same bait) | 2.3× | an algorithmic regression, **machine-independently** — a slow CI box scales both sides |
| sustained throughput, 40 × 256 KiB chunks of the worst bait | **≥ 1.0 MiB/s** | 1.9 MiB/s | 1.9× | the cost the per-call `SCAN_MAX_BYTES` cap does **not** bound: repeated chunks accumulate CPU without limit |

The ratio gate is the one that matters. The absolute gate is deliberately the
loose one, because it is the machine-dependent one.

### Table F — canonical: the durable-output consumer boundary

`scanAndRedact` has seven consumers. **No consumer module is modified by this
WP.** This table decides what changes for each and where that is verified.

| Sink | Module / call site | Consumes | What this WP changes for it | Verified where |
|------|--------------------|----------|-----------------------------|----------------|
| EP2 dream validate | `src/core/dream/validate.js:934` | `findings` | far fewer legitimate notes reverted (102/180 → 4/180 on the maintainer's vault); an S1/S2 span no longer reverts | new tests in `tests/unit/dream-validate.test.js` (this WP) |
| EP4 digest | `src/core/digest.js:506,521,543` | `findings` | far fewer sections withheld | new test pair in `tests/unit/digest.test.js` (this WP) |
| alerts | `src/core/alerts.js:47` | `redactOnly` | an S1/S2 span's original bytes now persist to `alerts.jsonl`; an R6 path fragment is now masked that was not | **nothing in this WP.** Current behaviour is documented, not fixed, by `WP-secret-sink-wiring-probes` |
| run evidence | `src/core/run-evidence.js:64` (argv) and `:78` (scalar fields) | `redactOnly` | same, to `run-evidence.jsonl` | as above |
| transcript extracts | `src/core/transcripts/index.js:67` (inside `capMessage`) | `redactOnly` | same, into `~/.wienerdog/state/dream-scratch/<harness>-<session>.json` | as above |
| brain logs | `src/core/dream/brain.js:287` (stderr) and `:315` (stdout) | `redactOnly` | same, into `~/.wienerdog/logs/dream/<date>.log` | as above |
| routine logs | `src/cli/run-job.js:867` (stdout) and `:872` (stderr) | `redactOnly` | same, into `~/.wienerdog/logs/<job>/` | as above |

**The five `redactOnly` sinks are NOT a dependency of this WP, and this WP does
not claim they are safe.** Round 3 declared `depends_on:
WP-secret-sink-wiring-probes` on the reasoning that S1/S2 widen the class of
bytes reaching those sinks. The owner removed that dependency, and the reasoning
is recorded here because it governs how the rest of this section must be read:

> A dependency that implies protection it does not provide is worse than no
> dependency.

`WP-secret-sink-wiring-probes` is **purely diagnostic**. It adds characterization
tests that record what each sink does today with a labelled secret. It **closes
none of the defects it documents** and changes no shipped behaviour. Merging it
would not make a single byte safer, so gating this WP on it bought nothing but
the appearance of safety.

The two defect families it documents are real, are **pre-existing**, and remain
**open after both WPs merge**:

1. **Truncate-then-redact**, at two independent call sites per module —
   `alerts.js:47` is `redactOnly(String(v ?? '').slice(0, MAX_FIELD_CHARS))`;
   `run-evidence.js:64` is `redactOnly(a.slice(0, 2000))` on each argv element and
   `:78` is a separate `redactOnly(String(v).slice(0, 2000))` on each scalar
   field. The value is cut before it is scanned.
2. **Per-chunk redaction of a stream**, at two independent handlers per module —
   `brain.js:287` (stderr) and `:315` (stdout), `run-job.js:867` (stdout) and
   `:872` (stderr) each call `redactOnly(chunk.toString('utf8'))` once per chunk,
   so a credential straddling a chunk boundary is never seen whole.

Neither is caused by, worsened in kind by, or fixed by this WP. What this WP does
change is the **mix** of bytes that reach them: an S1 or S2 span that today
becomes `[REDACTED:high-entropy]` in `alerts.jsonl` will after this WP appear
verbatim, and an R6 path fragment that today appears verbatim will be masked. The
owner is asked to accept that explicitly (OWNER-APPROVED item 2), with no
implication that the sinks are otherwise sound. **Fixing** truncate-then-redact
and per-chunk redaction is a third, separate package that neither WP performs.

<!-- EVIDENCE-BLOCK-END -->

### Mirrored Surface Checklist

Every surface below restates a fact owned by Table A0, A, B, C, D, E or F. A
review finding updates the owning table **and** every mirror listed here in one
pass; a new mirror discovered in review is registered here on the spot.

Mirrors of **Table A0** (the delimiter alphabet):

- [ ] the `DELIM_TIER1` / `DELIM_TIER2` declaration under "Exact contracts" — the **only** place a delimiter character may be written
- [ ] `SPAN_RUN`'s construction (derived, never a literal class)
- [ ] the `IS_TIER1` test that builds `tier1End` in `entropyRegions`
- [ ] the single `run.split(SPLIT_ALL)` in `entropyRegions` — the `cov` prefix sums are built from its output, so P3 cannot split differently
- [ ] Table A rows A1, A3, A4, A6, A8 (they name levels, not characters)
- [ ] Table B row P3's condition cell
- [ ] Table C's S2 and S2-d definitions
- [ ] the `delimiterClosure` / `delimiterReverse` / `delimiterInside` constructions in the corpus fixture
- [ ] the ADR-0024 amendment's delimiter sentence
- [ ] the "delimiter closure" bullet in "The invariant that must not weaken"
- [ ] the Implementation-notes bullet on delimiter closure
- [ ] the Security-checklist delimiter-closure item
- [ ] the verification gate's "delimiter alphabet is derived" greps

Mirrors of **Table A** (extraction) — registered in round 5, rewritten in round 6:

- [ ] `entropyRegions`'s body and JSDoc under "Exact contracts"
- [ ] the `REACH_TARGETS` declaration (must be *derived* from `ScanLimits`, never a literal pair)
- [ ] the absence of `ENTROPY_MAX_GROUP_SEGMENTS` from the `ScanLimits` literal, here and in `src/core/secret-scan.js`
- [ ] the *(no `ENTROPY_MAX_GROUP_SEGMENTS`)* row of Table B's threshold table (which defers to A5)
- [ ] the `--extract` mode's three expected blocks in Table E and in the gate
- [ ] Table C's G5 and G6 rows and the S2-a note about the residual 4 of 7 844
- [ ] the ADR-0024 amendment's "no bound" sentence
- [ ] the "five-round pattern", "round-5 critical" and "round-4 defect" sections in Context
- [ ] the `prec-superset-tier1`, `pos-plus-inside` and `seg-plus-10-prefix` rows of Table D
- [ ] the Implementation-notes bullets on the absence of a bound, on A6, and on the linear cost
- [ ] the Security-checklist extraction-completeness and denial-of-service items
- [ ] the `--perf` budgets, the `--sustained` floor, and the eleven baits
- [ ] the `shortSegments()` construction in the corpus fixture (owned by the prerequisite WP's Table L-10)

Mirrors of **Table B** (precedence and thresholds):

- [ ] the `consider` ladder inside `entropyRegions`, and the `keywordNear` / `suppressedUuidRanges` / `insideSuppressedUuid` code and JSDoc under "Exact contracts"
- [ ] the `cov` prefix-sum P3 test (must be exactly `(cov[b+1] - cov[a]) * 2 >= len`)
- [ ] the `a === b` guard on P1 and the paragraph under Table B that justifies it
- [ ] the `ScanLimits` object literal under "Exact contracts" and in `src/core/secret-scan.js`
- [ ] `entropyPass`'s JSDoc (must describe the ladder, not "contextual high entropy")
- [ ] the module header comment, lines 3–15 of `src/core/secret-scan.js`
- [ ] the worked examples under "Exact contracts" (each cites a corpus id)
- [ ] the ADR-0024 amendment text
- [ ] Table C's softening / strengthening / residual rows
- [ ] Table D's `new` column
- [ ] "Current state" bullets on `ENTROPY_CANDIDATE` and `entropyPass`
- [ ] the Acceptance criteria that name a rung or a threshold
- [ ] the OWNER-APPROVED value list

Mirrors of **Table D** (corpus verdicts):

- [ ] the `NEW` export in `tests/fixtures/secret-scan-corpus.js`
- [ ] the family counts in Acceptance criteria (including `shortSegments()` at 80 of 100)
- [ ] the numeric assertions in the verification gate
- [ ] the worked examples' parenthesised ids

Mirrors of **Table E** (evidence):

- [ ] every figure quoted in Context, Table A, Table B, Table C and OWNER-APPROVED
- [ ] the `scripts/measure-entropy-arms.js` Deliverables cell
- [ ] `tests/fixtures/measure-entropy-arms.candidate.txt` (must equal Table E's block byte for byte, 19 rows)
- [ ] the verification gate's harness assertions
- [ ] the evidence-block digest in the OWNER-APPROVED line. **The block runs from the marker immediately before "Exact contracts" to the marker immediately before this checklist**, so it covers the canonical implementation code, the `ScanLimits` literal, the ADR-0024 amendment text, the Contract-reference index and Tables A0, A, B, C, D, E and F. Round 5's block covered only B–E, which meant a post-approval edit to group construction, redaction merging, delimiter derivation or consumer consequences left the digest unchanged

Mirrors of **Table C**'s R1 disposition (registered 2026-07-25, when R1 moved
from "accept as-is" to "accepted, mitigated by two follow-up WPs"):

- [ ] Table C's **R1** status cell
- [ ] the "R1, re-characterised" section's closing disposition paragraph and its two mitigation bullets
- [ ] the rejected-alternatives bullet on the `1`+43-base64url shape allowlist (must say *permanently*)
- [ ] OWNER-APPROVED item 3
- [ ] the "Out of scope" bullet on suppressing R1 (which stays a flat prohibition **for this WP**)
- [ ] the Acceptance criterion asserting no shape allowlist was added, and its `grep`

Mirrors of **Table F** (consumer boundary):

- [ ] the Context paragraph naming the sinks
- [ ] "Current state"'s seven-consumer sentence
- [ ] the Security checklist's consumer-consequence item
- [ ] the Acceptance criterion listing the unmodified modules
- [ ] the `depends_on` frontmatter entry (the probe WP is **not** in it — it is diagnostic, not protective)
- [ ] OWNER-APPROVED item 2's sink sentence
- [ ] the "Out of scope" bullet on the five sinks
- [ ] Definition of done (must not require the probe WP to have merged)
- [ ] the verification gate's permission-boundary check

## OWNER-APPROVED

**EMPTY — nothing here is approved yet. This section is a placeholder.**

`status:` stays `Draft` until the owner fills this in with a date, an explicit
"approved", and the evidence-block digest. Neither the review loop, nor the
orchestrator, nor any agent message substitutes for it.

What the owner is being asked to sign off on, and nothing else:

1. **The five new `ScanLimits` values, the ladder order, and the removal of the
   group bound** — `ENTROPY_BARE_MIN_LEN = 32`, `ENTROPY_STRUCTURED_MIN_LEN = 32`,
   `ENTROPY_HEX_MIN_BITS = 3.0`, `ENTROPY_CONTEXT_WINDOW = 80`,
   `ENTROPY_ASSIGN_LOOKBEHIND = 64`, and the six ordering decisions in Table B —
   including that P1's base32 arm uses the ordinary 3.5 floor and that there is
   deliberately no separate base32 constant. WP-122's three existing values are
   unchanged. **Round 5's `ENTROPY_MAX_GROUP_SEGMENTS = 8` is deleted, not
   retuned**: extraction now carries no segment-count bound at all (Table A row
   A5). Signing this accepts that the extractor probes every segment boundary at
   two lengths derived from thresholds already in this list, and that the
   worst-case cost of doing so is the performance budget in item 7.
2. **The complete softening list, and where the softened bytes now land** — S1,
   and S2 including **S2-b: human passphrase-style passwords go from 99.31%
   detected to 0.00% bare and in prose** (only the assignment form stays covered,
   at 100.00% measured at the gate, via unchanged labelled rules), **S2-c: any
   all-lowercase span is suppressed**, and **S2-d: `Word=Word` pairs are
   suppressed**. Table C. Signing this also accepts that an S1/S2 span's original
   bytes now persist through the five `redactOnly` sinks of Table F — **and that
   those sinks have two known, open defect families (truncate-then-redact at two
   call sites per module, per-chunk stream redaction at two handlers per module)
   that neither this WP nor `WP-secret-sink-wiring-probes` fixes.**
3. **Residual R1 — a recurring quarantine, not a one-off.** A bare Google Drive
   or Docs file id in note text is indistinguishable from a credential by shape
   and is still quarantined. Because the id is permanent body content, **every**
   consolidation that touches such a note reverts it. Field evidence: 6 notes
   were quarantined over the nights of 2026-07-24 and 2026-07-25; this design
   clears 5 of them; the sixth is a 43 737-byte note that has now been
   quarantined at least twice and hand-restored once, and it will be quarantined
   again on every future run. Vault-wide: 2 distinct ids, 8 occurrences, 6 notes,
   3 flagged. **The only remedy the review considered defensible — suppression
   anchored to an exact Drive/Docs URL slot — was measured and covers 0 of the 8
   occurrences, because every one of them is a bare backticked id in prose, not
   part of a URL.** A shape allowlist (`1` + 43 base64url characters) is
   **rejected permanently** (owner decision, 2026-07-25): it would suppress ~1 in
   64 uniformly random 44-character base64url credentials. **What is being signed
   off is the MITIGATED cost, not the raw one.** R1's disposition is *accepted,
   mitigated by* `WP-secret-revert-defers-ledger` (a secret-reverted run defers
   its transcripts instead of marking them processed, so a quarantine costs a
   retry rather than a lost note — independent of this WP) *and by*
   `WP-secret-allowlist-exact-value-store` + `WP-quarantine-review-cli`
   (ADR-0033: the owner permanently approves the specific Drive id by the
   `sha256` of its exact bytes, whole-value equality only, `high-entropy`
   findings only, suppression detector-wide — both sequenced after this WP).
   Signing this accepts that **this WP** ships no allowlist and no softening, and
   that manual restoration continues until those follow-ups land. Table C, R1.
4. **The other accepted residual false positives** — R3, R4, R5, and **R6**, a
   path-like fragment of ≥ 32 characters. Measured at **1 of 180 vault notes
   (already flagged today, so 0 newly flagged)**; in transcripts, **6 394 new
   redaction locations per ≈55 MB sample against legacy's 39 426 regions**, of
   which **6 347 are R6** and **0 are unclassified**, removing a mean of **20.5
   benign characters per region**. On genuinely unsaturated input (4 KiB windows
   legacy does not flag) this design newly flags **9 of 442 (2.04%)** — identical
   to round 5. Table C.
5. **The accepted residual miss M1, as restated** — a canonical RFC-4122 UUID
   used as a credential **bare or in prose** stays invisible, **and so does every
   fragment of it**, because P2 is a range test. Table C.
6. **That P2's scope is resolved to canonical-only and is not offered as a
   choice.** Round 4 offered shape-only as an alternative inside this block; that
   was withdrawn because the corpus, the acceptance criteria and the gate are all
   written for canonical-only, so approving the alternative would have approved a
   contract the executable artifacts contradict. If shape-only is wanted, say so
   and it becomes a separate WP — do **not** approve this one with a
   modification.
7. **The performance budget and its three gates** — absolute **400 ms** per bait
   at the 256 KiB cap (worst measured 128.5 ms), ratio **60×** against the shipped
   detector (worst measured 26.5×), and sustained throughput **≥ 1.0 MiB/s** over
   40 consecutive maximum-size chunks (measured 1.9 MiB/s, against the shipped
   detector's 50.2). Signing this accepts that adversarial delimiter-dense input
   costs roughly 26× the shipped detector, that real content costs 2.0×
   (48 ms/MiB against 24), and that round 5's single 1500 ms tripwire — which
   permitted a 319× regression — is replaced. Table E rows E-P1, E-P4, E-P5.
8. **The evidence split of Table E** — that figures E-V1…E-T10, E-R1, E-R2 and
   E-P4 are owner-attested measurements against the private vault and private
   transcripts and are **not reproducible from this repository**; that E-M4 (the
   rejected bigram discriminator) is owner-supplied and deliberately not
   reproduced; that round 5's E-T5 and its transcript region counts are
   **withdrawn** as unsound rather than restated; and that everything else is
   reproducible by running `scripts/measure-entropy-arms.js` and `npm test`.

**Compute the evidence digest first.** Run this and paste the result into the
sign-off line:

```bash
awk '/^<!-- EVIDENCE-BLOCK-START -->$/{f=1;next}/^<!-- EVIDENCE-BLOCK-END -->$/{f=0}f' \
  docs/specs/WP-secret-fence-shape-and-context.md | shasum -a 256 | cut -d' ' -f1
```

Sign-off form. Paste **exactly** this, as **one contiguous block with no blank
line between the two lines**, with a real date and with `<SHA>` replaced by the
digest above — the verification gate greps for this literal shape, requires the
digest line to be the line immediately after the approval line, requires exactly
one of each in the whole file, and recomputes the digest:

```markdown
> **OWNER-APPROVED (2026-MM-DD).** Table A0 delimiter alphabet, Table A reach
> extraction with NO segment-count bound, Table B ladder and thresholds with P2
> scoped by range and to canonical nibbles only, softening list S1+S2 (including
> S2-b, S2-c and S2-d) in Table C together with the open sink defects in Table F,
> residuals R1 (recurring) + R3 + R4 + R5 + R6, residual miss M1 as restated, the
> performance budget of 400 ms / 60x / 1.0 MiB-per-second, and the Table E
> evidence split accepted as measured.
> evidence-sha256=<SHA>
```

### What the approval gate does and does not enforce

Round-4 review finding R4-2 was that binding approval to *commit ordering* is not
a binding at all: a later commit could regenerate a wrong fixture, rewrite the
evidence tables to match, and both the ordering check and the fixture hash would
still pass. This round binds approval to the **bytes of the evidence block**
instead:

- The block is delimited by the literal lines `<!-- EVIDENCE-BLOCK-START -->` and
  `<!-- EVIDENCE-BLOCK-END -->`. **In round 6 it was widened**, because round-5
  review finding R5-3 showed it covered only Tables B–E while the sign-off text
  also approved Table A0, Table A's extraction contract and Table F's sink
  consequences — so a post-approval edit to extraction, redaction merging,
  delimiter derivation or consumer consequences left the digest unchanged. The
  block now starts immediately before **"Exact contracts"** and ends immediately
  before the **Mirrored Surface Checklist**, so it contains, in one contiguous
  run of bytes: the canonical implementation code, the `ScanLimits` literal, the
  worked examples, the ADR-0024 amendment text, the Contract-reference index and
  Tables A0, A, B, C, D, E and F. Every item the sign-off line names is inside it.
- The approval line carries `evidence-sha256=<digest of that block>`.
- **The approval line and the digest line must be adjacent, and there must be
  exactly one of each in the file.** Round-5's gate grepped for the two
  independently, so a date on one line and a digest 400 lines away — or a second,
  stale approval block left behind by an earlier round — would have satisfied it.
  The gate now asserts `count == 1` for each and that the digest line is the line
  immediately following the approval line.
- The gate recomputes the digest from the working tree and compares. **Any
  post-approval edit to a threshold, a verdict, a measurement, an expected
  output, the implementation code or a consumer consequence changes the digest
  and fails the gate**, and the only way to pass again is a new approval line
  with the new digest — i.e. renewed approval.
- The commit-ordering check from round 4 is kept as a second, weaker signal.

**Stated plainly, because it would be dishonest to imply more: none of this is
enforced by CI.** The gate is a script an implementer runs locally and pastes
into the PR body. Adding it to `.github/workflows/ci.yml` is deliberately not in
this WP's Deliverables, so a branch on which the gate was never run can be merged
and nothing will object. The digest makes tampering *visible to anyone who runs
the gate*; it does not make running the gate mandatory. Making it a required
check is a separate WP whose Deliverables would have to include the workflow
file. Do not describe this WP's approval as gated, enforced, required or
blocking.

Two further residuals, also stated rather than implied:

- The digest binds the evidence *bytes*, not the owner's comprehension. It cannot
  check that anyone read Table C.
- The digest covers this spec's evidence block only. Everything outside it —
  Context, Implementation notes, the Security checklist, Acceptance criteria and
  the gate itself — can still be edited after approval without invalidating the
  digest. Those sections restate the block rather than deciding anything, and the
  Mirrored Surface Checklist is what keeps them in step; but the binding is on
  the block, and that limit is stated rather than implied.
- The digest does not cover the `old` half of the evidence. That half is
  protected differently and more strongly: it merged on `main` in
  `WP-secret-scan-baseline-oracle`, under its own review, this WP's gate re-diffs
  `measure-entropy-arms.baseline.txt` and re-runs
  `tests/unit/secret-scan-baseline.test.js` untouched, **and that WP's Table O
  differential asserts the frozen oracle against the shipped detector on 399
  inputs** — so the `old` column is checked against something outside itself, not
  merely frozen.

## Implementation notes & constraints

- **Do not touch any labelled rule, their order, their labels or severities, or
  `bitsPerChar`.** `redactOnly` must stay byte-compatible for every input the
  labelled rules already covered — that is what `LABELLED_BASELINE` proves.
- **This WP adds no export.** `module.exports` at line 242 is unchanged. Every
  acceptance criterion is therefore a black-box `scanAndRedact` case; do not add
  a test-only export to make an internal observable. (`ScanLimits` is already
  exported, which is how `--extract` drives the alternative extractors.)
- No new npm dependencies; the module stays pure (no fs/env/argv/network).
- `scanAndRedact` must stay **total**: the new helpers run inside the existing
  `try`, so any internal error still yields the fail-closed `scan-error` result.
  Add no new `try` blocks and no new `catch`.
- **Re-entrancy.** A token already rewritten to `[REDACTED:<label>]` by a
  labelled rule must not be re-matched. `[`, `]` and `:` are outside `SPAN_RUN`'s
  alphabet, and the longest of the 23 labels the module can emit,
  `aws_secret_access_key`, is 21 characters — under `ENTROPY_MIN_LEN`. Pin this
  with a test that asserts it for **every** label; a future 24-character label
  would silently break it.
- **`SPAN_RUN` and `UUID_OCCURRENCE` are stateful.** Both carry the `g` flag and
  are module-scoped, so `lastIndex` must be reset before each use (the reference
  implementation does this for both). Reusing either without resetting is the
  classic way to make this pass intermittently skip content.
- **Do not reintroduce a segment-count bound on extraction, under any name.**
  Round 5 had `ENTROPY_MAX_GROUP_SEGMENTS = 8` and it produced this round's
  critical. Every finite bound has an adversarial family; bound 16 fixes
  `shortSegments()` and loses to a seventeen-piece family (Table A row A5).
  `REACH_TARGETS` is not a bound: it is derived from `ENTROPY_MIN_LEN` and
  `ENTROPY_BARE_MIN_LEN`, and the inner loop exits on "reached the target",
  never on "used up the budget". If you find yourself adding a counter to that
  loop, stop — you are rebuilding the defect.
- **A6 exists for performance and costs no recall — do not drop it and do not
  widen it.** A reach span may not begin at an empty segment whose predecessor is
  also empty. Dropping it turns `'-_/=+'`-dense input into 262 144 near-duplicate
  spans (751 ms against 18 ms, measured). Widening it to "no span may begin at a
  delimiter at all" costs **413 of 7 844** credentials, because a base64 secret
  can begin with `+` or `/` (measured; the failing vector shape is
  `<word>+<+oLFhYyz+DXF8CYxCAYP6UgL8/KlxBmG>`). Keeping only the **first** empty
  segment of each delimiter run is the one variant that is both fast and
  recall-neutral.
- **P3 must be decided from the `cov` prefix sums, before the span is
  materialised.** It is exactly equivalent to splitting the span on `SPLIT_ALL`
  and summing word-segment lengths — the prefix sums are built from that same
  split — but it is `O(1)` instead of `O(len)`, and it is what stops
  `bitsPerChar` being called on every reach span of ordinary path-dense text.
  Computing P3 the slow way is a correctness no-op and a large performance
  regression.
- **Do not add `hits.sort()` back.** Spans are emitted in ascending start order
  (L1 first, then segment index ascending), which is exactly what the linear
  merge needs. Round 5 sorted, which made the pass `O(L log L)`; the sort is gone
  and the complexity claim in Table A row A5 depends on it staying gone.
- **`insideSuppressedUuid` must stay a binary search.** A linear scan is
  `O(spans × uuids)` and makes the `uuid-dense` bait several times slower (E-P2).
- **Performance.** Every regex is anchored or a single quantifier over disjoint
  character classes, so no backtracking. Span count is at most `3s + 1` per run
  and total character work is linear (Table A row A5) — but the constant is real:
  the worst measured bait at the 256 KiB cap is **128.5 ms** against 4.8 ms for
  the shipped detector, and sustained over 40 consecutive maximum-size chunks the
  worst bait runs at **1.9 MiB/s** against 50.2. On the real vault the cost is
  48 ms/MiB against 24 (E-P1, E-P4, E-P5). Three gates apply and all three are in
  the verification steps: **400 ms** absolute per bait, **60×** ratio against the
  shipped detector, **≥ 1.0 MiB/s** sustained. The ratio gate is the
  machine-independent one and is the one that catches an algorithmic regression;
  if you trip it, stop — the implementation has diverged from Table A.
- **Delimiter closure is the one invariant you must not break while editing.**
  Every delimiter character lives in `DELIM_TIER1` / `DELIM_TIER2` (Table A0) and
  every regex that cuts on a delimiter is *built* from them. If you find yourself
  typing `-`, `_`, `/`, `=` or `+` inside a character class anywhere else in this
  module, stop.
- **`-` is written `\\-` inside `DELIM_TIER1`** so that every derived character
  class is range-free. Writing it unescaped makes `[A-Za-z0-9-_/=+]` parse `9-_`
  as a range; putting it after `_` makes `-/` a range that silently swallows `.`.
  Both are silent correctness bugs, not syntax errors.
- **P1's two arms must keep their separate floors.** Collapsing them back to one
  shared 3.0 floor reintroduces the round-3 false-quarantine class.
- **`WORD_SEGMENT`'s last alternative is deliberately narrower than it looks.**
  It is `(?:[a-z]{3,}|[A-Z][a-z]{2,}|[A-Z]{3,})[0-9]{1,10}`, not
  `[A-Za-z]{3,}[0-9]{1,10}`: the letter run must be single-case (E-T9).
- **Do not add a bigram, n-gram, dictionary or language-model discriminator.**
  Owner decision; see E-M4 for why it does not work.
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT add a sixth rung, an allowlist file, or any configurability.

## Security checklist

- [ ] Every labelled rule still fires exactly as before — proved by
      `deepStrictEqual` against the 18 frozen `LABELLED_BASELINE` results (text,
      labels, severities and counts), not by spot checks.
- [ ] The change cannot be argued to reduce credential-grade coverage without
      naming the exact shape lost: Table C's S1, S2 (a/b/c/d) and M1 are the
      complete list, each pinned by a `SOFTENED` or `PRECEDENCE` case.
- [ ] **Extraction cannot fail open** (Table A row A5): there is **no**
      segment-count bound, `grep -c ENTROPY_MAX_GROUP_SEGMENTS src/core/secret-scan.js`
      is 0, and the only loop that walks segments exits on a length target
      derived from `ScanLimits`. Every credential-shaped stretch is evaluated
      whole at whatever length it has; the only ways to miss one are the ladder's
      own disclosed rungs (S1, S2, M1).
- [ ] **Multi-piece completeness holds** (Table A): a credential containing
      canonical delimiters is still evaluated — pinned by `pos-plus-inside`,
      exhaustively by `delimiterInside()` (all 100 fire, against 85 under
      round-4 extraction) and, for many short pieces, by `shortSegments()`
      (exactly 80 of 100 fire, against 35 under round-5 bound-8 grouping; the 20
      that do not are the disclosed S1 band).
- [ ] **Extraction is not a denial-of-service surface** (Table A row A5): span
      count is at most `3s + 1` per run and cost is linear, and all **eleven**
      `--perf` baits at the 256 KiB cap are under **400 ms** absolute and **60×**
      the shipped detector, with sustained throughput on the worst bait at or
      above **1.0 MiB/s**.
- [ ] **Delimiter closure holds** (Table A0): extraction and suppression cut at
      exactly the same characters — pinned exhaustively by `delimiterClosure()`
      (all 95 fire) and `delimiterReverse()` (all 5 suppress).
- [ ] **The superset property holds, and is claimed only for what it proves**
      (Table A row A3): every candidate today's rule can produce is still
      **evaluated** — proved from the alphabets, verified at 306/306 on the vault,
      and pinned by `prec-superset-tier1`. It does **not** claim detection is
      preserved: P3 can suppress a legacy-firing span, and the two places that
      happens are exactly the disclosed softenings S1 and S2, each pinned by a
      `SOFTENED` row.
- [ ] A benign *shape* never vetoes a structured credential (Table B, P1 above
      P3) — pinned by `prec-p1-over-p3-bare` and `prec-p1-over-p3-nested`.
- [ ] A benign *outer* span never vetoes a credential nested inside it (Table A9)
      — pinned by `prec-a7-nested-bare`, `pos-suffixed`, `pos-filename`,
      `pos-query`, `pos-dsn`, `pos-plus-embedded`, `pos-eq-embedded` and
      `pos-plus-inside`.
- [ ] Delimiter padding cannot buy suppression (Table B, P3's denominator) —
      pinned by `prec-p3-denominator` and `bnd-cover-half` / `bnd-cover-under`.
- [ ] P1's base32 arm does not quarantine ordinary uppercase prose — pinned by
      `bnd-b32-bits-below` and `prec-p1-b32-not-over-uppercase`.
- [ ] P2 suppresses by **range**, so multi-segment extraction cannot leak a
      canonical UUID through one of its own fragments — pinned by
      `prec-p2-subgroup-not-a-candidate` against `prec-p2-assign-override`, which
      must still fire.
- [ ] The pass stays fail-closed: an internal error still returns the withheld
      marker plus a `scan-error` quarantine finding; the oversized path is
      unchanged.
- [ ] No untrusted identifier flows into a filesystem path or a shell command —
      this module touches neither.
- [ ] No verbatim text from the maintainer's vault or transcripts entered the
      repository in this WP; the R1 and R6 evidence is recorded as
      character-class masks and counts only, and the Drive-id context is
      described by shape rather than quoted.
- [ ] **No shape allowlist was added.** In particular there is no rule that
      suppresses `1` followed by 43 base64url characters, no `id`-field context,
      and no provider-name context. R1 is accepted, not suppressed (Table C, R1;
      OWNER-APPROVED item 3). `grep -c "drive\.google\|docs\.google" src/core/secret-scan.js`
      is 0.
- [ ] Consumer consequence is stated, not discovered: Table F names all seven
      consumers and what changes for each. **This WP asserts nothing about the
      five `redactOnly` sinks and does not depend on anything that does.**
      `WP-secret-sink-wiring-probes` documents their current behaviour and closes
      none of their defects. Nothing in this spec may be read as a claim that
      those sinks are safe.

## Acceptance criteria

Every criterion below is a black-box assertion on `scanAndRedact` or on a
consumer's public behaviour. Nothing observes a non-exported internal.

- [ ] All 18 `LABELLED_BASELINE` cases `deepStrictEqual` their frozen result.
- [ ] All 20 `NEGATIVE` cases produce zero findings.
- [ ] All 23 `POSITIVE` cases produce exactly one `high-entropy` finding at
      `quarantine` severity with `count === 1`, no labelled finding, and the
      matched bytes absent from the output.
- [ ] All 9 `SOFTENED` cases produce zero findings.
- [ ] All 31 `BOUNDARY`, 13 `PRECEDENCE` and 3 `RESIDUAL_FP` cases match
      `NEW[id]`, and `NEW[id]` equals the `new` column of Table D for every one.
- [ ] `NEW` and `LEGACY` have exactly the same key set, and every id in both is
      an id of one of the five keyed families or `neg-1` … `neg-20`.
- [ ] All 95 `delimiterClosure()` cases produce at least one finding.
- [ ] All 5 `delimiterReverse()` cases produce zero findings.
- [ ] **All 100 `delimiterInside()` cases produce at least one finding.** This is
      the class-level guard for the round-4 critical.
- [ ] **Exactly 80 of the 100 `shortSegments()` cases produce at least one
      finding, and the 20 that do not are exactly the ids matching
      `seg-<delim>-8-{bare,prefix,suffix,both}`.** This is the class-level guard
      for the round-5 critical. Round-5's bound-8 extraction scores 35 here.
- [ ] Exact-output assertions: `prec-a9-merge` → `[REDACTED:high-entropy]`;
      `prec-a7-nested-bare` → `Documentation-[REDACTED:high-entropy]`;
      `prec-superset-tier1` →
      `abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst-[REDACTED:high-entropy]`;
      `prec-p2-assign-override` → `authorization: [REDACTED:high-entropy]`;
      `pos-plus-inside` →
      `abcdefghijklmnopqrstuvwxyzabcdefg+[REDACTED:high-entropy]`; and
      `scanAndRedact('see [[01-Projects/wienerdog/current-state]] end')` returns
      its input unchanged with zero findings. *(Round 4 additionally specified
      `Documentation-Repository-Configuration-[REDACTED:high-entropy]` for
      `prec-a7-nested-bare`. That is false under multi-segment extraction — the
      redaction starts one segment earlier. Do not restore it.)*
- [ ] **Multi-region exact output**, which round 5 lacked and which is what bounds
      the boundary-widening claim across disjoint regions. For the single input
      `` `prefix Documentation-Repository-Configuration-5NQywwNzM016QPy4x27M6z7310P3x524 mid 0123456789abcdef0123456789abcdef-foo end` ``
      the output is exactly
      `` `prefix Documentation-[REDACTED:high-entropy] mid [REDACTED:high-entropy] end` ``.
- [ ] **Multi-region count**: the same input yields exactly one `high-entropy`
      finding with `count === 2` — two merged regions, not one and not three.
- [ ] **`res-path-tail-33` exact output** is `path [REDACTED:high-entropy] cached`
      — the R6 pin, so the number of benign bytes the class removes is fixed by a
      test and not only by a table.
- [ ] Benign-shape behaviour is asserted black-box via `bnd-cover-half`
      (suppressed) and `bnd-cover-under` (fires), which differ by one character
      of coverage.
- [ ] Re-entrancy: for every one of the 23 labels the module can emit, scanning
      `[REDACTED:<label>]` yields zero findings.
- [ ] `tests/unit/secret-scan.test.js:186` (`'entropy: long low-entropy runs are
      NOT flagged'`) passes **unmodified**.
- [ ] `tests/unit/secret-scan-baseline.test.js` passes **unmodified** — every
      assertion in it is `old`-side and must survive this change.
- [ ] EP2: the modified `dream-validate` fixture still quarantines the
      `pos-alnum-32` blob, and a note whose only candidate is
      `[[01-Projects/wienerdog/current-state]]` commits cleanly.
- [ ] EP4: a digest section containing the `pos-alnum-32` blob is omitted and
      bannered; a section containing only wikilinks and absolute paths renders.
- [ ] `scanAndRedact` remains total: the oversized and scan-error paths are
      unchanged and still covered; `module.exports` is byte-identical.
- [ ] The seven consumer modules named in Table F are **not** modified.
- [ ] `scripts/measure-entropy-arms.js` runs clean in all seven modes;
      `--baseline` output is still byte-identical to the fixture that merged with
      the prerequisite WP; `--candidate` output is byte-identical to
      `tests/fixtures/measure-entropy-arms.candidate.txt`; `--passphrase`,
      `--uuid-forms` and `--extract` match Table E's blocks exactly; `--perf`
      prints eleven strictly-parseable rows, each under **400 ms** and under
      **60×** the shipped detector; `--sustained` reports the `reach` row at or
      above **1.0 MiB/s**.
- [ ] **The pre-edit base is the blob the frozen oracle was taken from** (the
      prerequisite WP's Table O5): before the first commit that touches
      `src/core/secret-scan.js`,
      `git hash-object src/core/secret-scan.js` is
      `eb273e19050037542c8beb441b8a320a3248b514`. If it is not, the detector moved
      after the oracle was frozen, every `old` column is stale, and this WP must
      stop and say so.

## Verification steps (run these; paste output in the PR)

This is an **executable gate**, not an observation. It exits non-zero on the
first failure. Note the two footguns it works around: `grep -c` prints a count
but exits 1 when the count is 0, and `node --test` exits non-zero when a test
fails — so TAP is captured to a file first and every count is compared
numerically.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
SPEC=docs/specs/WP-secret-fence-shape-and-context.md
TAP=$(mktemp)

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}
expect_line() { grep -qxF "$(printf '%b' "$1")" "$2" \
  || { echo "GATE FAIL: missing expected line: $1"; cat "$2"; exit 1; }; }

# --- 0. the prerequisite really merged ------------------------------------
for f in tests/fixtures/secret-scan-legacy-entropy.js \
         tests/fixtures/secret-scan-corpus.js \
         tests/fixtures/measure-entropy-arms.baseline.txt \
         tests/unit/secret-scan-baseline.test.js \
         scripts/measure-entropy-arms.js; do
  git cat-file -e "main:$f" 2>/dev/null \
    || { echo "GATE FAIL: $f is not on main — WP-secret-scan-baseline-oracle has not merged"; exit 1; }
done
echo "ok: prerequisite WP is on main"
# Three of its files must be byte-untouched by this branch.
need "$(git diff --name-only main... | grep -cE '^(tests/fixtures/(secret-scan-legacy-entropy\.js|measure-entropy-arms\.baseline\.txt)|tests/unit/secret-scan-baseline\.test\.js)$' || true)" 0 \
     "the frozen oracle, baseline fixture and baseline tests are untouched"

# --- 0b. the pre-edit base is the blob the frozen oracle was taken from -----
# (prerequisite WP, Table O5). If the detector moved after the oracle was
# frozen, every `old` column is stale and the before/after argument is void.
BASE_SHA=$(git rev-parse "$(git merge-base main HEAD)")
[ "$(git rev-parse "$BASE_SHA:src/core/secret-scan.js")" \
  = 'eb273e19050037542c8beb441b8a320a3248b514' ] \
  || { echo "GATE FAIL: this branch's base does not carry the detector blob the frozen oracle copies"; exit 1; }
echo "ok: pre-edit base carries the oracle's detector blob"

# --- 1. the approval gate --------------------------------------------------
# Exactly ONE approval line and ONE digest line, and the digest must be the very
# next line. Round-5's gate grepped for them independently, so a date here and a
# digest 400 lines away — or a stale second block — would have passed.
need "$(grep -cE '^> \*\*OWNER-APPROVED \(20[0-9]{2}-[0-9]{2}-[0-9]{2}\)\.\*\*' "$SPEC" || true)" 1 \
     "exactly one dated OWNER-APPROVED line"
need "$(grep -cE '^> evidence-sha256=[0-9a-f]{64}$' "$SPEC" || true)" 1 \
     "exactly one evidence-sha256 line"
APPROVE_LN=$(grep -nE '^> \*\*OWNER-APPROVED \(20[0-9]{2}-[0-9]{2}-[0-9]{2}\)\.\*\*' "$SPEC" | cut -d: -f1)
DIGEST_LN=$(grep -nE '^> evidence-sha256=[0-9a-f]{64}$' "$SPEC" | cut -d: -f1)
# The approval block is a quoted paragraph; the digest must be its LAST line, so
# every line between them must also be part of the same block quote.
[ "$DIGEST_LN" -gt "$APPROVE_LN" ] \
  || { echo "GATE FAIL: the digest line precedes the approval line"; exit 1; }
need "$(sed -n "${APPROVE_LN},${DIGEST_LN}p" "$SPEC" | grep -cvE '^> ' || true)" 0 \
     "approval and digest are one contiguous block quote"
need "$(grep -cE '^status: Draft$' "$SPEC" || true)" 0 "spec is no longer Draft"

# The approval is bound to the BYTES of the evidence block, not to commit order.
# Any post-approval edit to Table B, C, D or E changes this digest and fails here.
EV_ACTUAL=$(awk '/^<!-- EVIDENCE-BLOCK-START -->$/{f=1;next}/^<!-- EVIDENCE-BLOCK-END -->$/{f=0}f' "$SPEC" \
            | shasum -a 256 | cut -d' ' -f1)
EV_APPROVED=$(grep -oE '^> evidence-sha256=[0-9a-f]{64}$' "$SPEC" | head -1 | cut -d= -f2 || true)
[ -n "$EV_APPROVED" ] || { echo "GATE FAIL: the approval line carries no evidence-sha256"; exit 1; }
[ "$EV_ACTUAL" = "$EV_APPROVED" ] || {
  echo "GATE FAIL: the evidence block changed after approval."
  echo "  approved: $EV_APPROVED"
  echo "  actual:   $EV_ACTUAL"
  echo "  Renewed OWNER approval with the new digest is required."
  exit 1; }
echo "ok: evidence block matches the approved digest $EV_ACTUAL"
# Weaker second signal: approval must precede any non-spec work on this branch.
NONSPEC='src/core/secret-scan.js
tests/fixtures/secret-scan-corpus.js
tests/fixtures/measure-entropy-arms.candidate.txt
scripts/measure-entropy-arms.js
tests/unit/secret-scan.test.js
tests/unit/dream-validate.test.js
tests/unit/digest.test.js
docs/adr/0024-layered-secret-lifecycle.md'
# shellcheck disable=SC2046,SC2086
FIRST_WORK=$(git log --reverse --format=%H main..HEAD -- $(echo $NONSPEC) | head -1)
if [ -n "$FIRST_WORK" ]; then
  APPROVE=$(git log --format=%H -G'^> evidence-sha256=' -- "$SPEC" | tail -1)
  [ -n "$APPROVE" ] || { echo "GATE FAIL: no commit introduces the approval digest"; exit 1; }
  git merge-base --is-ancestor "$APPROVE" "${FIRST_WORK}^" \
    || { echo "GATE FAIL: a non-spec deliverable was committed before approval ($FIRST_WORK)"; exit 1; }
  echo "ok: approval $APPROVE precedes first deliverable commit $FIRST_WORK"
fi

# --- 2. the corpus ran, case by case --------------------------------------
node --test --test-reporter=tap tests/unit/secret-scan.test.js >"$TAP" 2>&1 || true
need "$(grep -cE '^ok [0-9]+ - entropy baseline: '   "$TAP" || true)"  18 "LABELLED_BASELINE cases"
need "$(grep -cE '^ok [0-9]+ - entropy negative: '   "$TAP" || true)"  20 "NEGATIVE cases"
need "$(grep -cE '^ok [0-9]+ - entropy positive: '   "$TAP" || true)"  23 "POSITIVE cases"
need "$(grep -cE '^ok [0-9]+ - entropy softening: '  "$TAP" || true)"   9 "SOFTENED cases"
need "$(grep -cE '^ok [0-9]+ - entropy boundary: '   "$TAP" || true)"  31 "BOUNDARY cases"
need "$(grep -cE '^ok [0-9]+ - entropy precedence: ' "$TAP" || true)"  13 "PRECEDENCE cases"
need "$(grep -cE '^ok [0-9]+ - entropy residual: '   "$TAP" || true)"   3 "RESIDUAL_FP cases"
need "$(grep -cE '^ok [0-9]+ - entropy closure: '    "$TAP" || true)"  95 "delimiterClosure cases"
need "$(grep -cE '^ok [0-9]+ - entropy reverse: '    "$TAP" || true)"   5 "delimiterReverse cases"
need "$(grep -cE '^ok [0-9]+ - entropy inside: '     "$TAP" || true)" 100 "delimiterInside cases"
need "$(grep -cE '^ok [0-9]+ - entropy short: '      "$TAP" || true)" 100 "shortSegments cases"
need "$(grep -cE '^ok [0-9]+ - entropy short fires: exactly 80 of 100$' "$TAP" || true)" 1 \
     "shortSegments fires on exactly 80 (round-5 bound-8 scores 35)"
need "$(grep -cE '^ok [0-9]+ - entropy multi-region output$' "$TAP" || true)" 1 "multi-region exact output"
need "$(grep -cE '^ok [0-9]+ - entropy multi-region count$'  "$TAP" || true)" 1 "multi-region count === 2"
need "$(grep -cE '^ok [0-9]+ - entropy reentrancy: ' "$TAP" || true)"  23 "re-entrancy cases"
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in secret-scan.test.js"
need "$(grep -cE '^ok [0-9]+ - entropy: long low-entropy runs are NOT flagged$' "$TAP" || true)" 1 \
     "the pre-existing low-entropy test still passes"
need "$(git diff --unified=0 main... -- tests/unit/secret-scan.test.js \
        | grep -cE '^[-+].*long low-entropy runs are NOT flagged' || true)" 0 \
     "the pre-existing low-entropy test is untouched"

# The old-side characterization suite must still pass, unmodified.
: >"$TAP"
node --test --test-reporter=tap tests/unit/secret-scan-baseline.test.js >"$TAP" 2>&1 || true
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the untouched baseline suite"

# --- 3. the delimiter alphabet is DERIVED, and extraction is GROUP-based ---
SS=src/core/secret-scan.js
need "$(grep -cE '^const DELIM_TIER[12] = ' "$SS" || true)" 2 "two delimiter tier declarations"
need "$(grep -cF 'const DELIM_ALL = DELIM_TIER1 + DELIM_TIER2;' "$SS" || true)" 1 "DELIM_ALL derived"
need "$(grep -cF 'IS_TIER1' "$SS" || true)" 2 "IS_TIER1 is derived and used"
need "$(grep -cF 'split(SPLIT_ALL)' "$SS" || true)" 1 \
     "there is exactly ONE segment split; the P3 prefix sums are built from it"
need "$(grep -cF 'ENTROPY_MAX_GROUP_SEGMENTS' "$SS" || true)" 0 \
     "no segment-count bound on extraction (Table A row A5)"
need "$(grep -cF 'REACH_TARGETS = [ScanLimits.ENTROPY_MIN_LEN, ScanLimits.ENTROPY_BARE_MIN_LEN]' "$SS" || true)" 1 \
     "the reach targets are DERIVED from ScanLimits, not literals"
need "$(grep -cE 'REACH_TARGETS *= *\[ *[0-9]' "$SS" || true)" 0 "the reach targets are not hard-coded numbers"
need "$(grep -cF 'hits.sort' "$SS" || true)" 0 "ascending emission — the round-5 sort is gone"
need "$(grep -cF 'SPLIT_TIER1' "$SS" || true)" 0 "the round-5 tier-1 split helper is gone"
need "$(grep -cF 'SPLIT_TIER2' "$SS" || true)" 0 "the round-4 tier-2 split is gone"
need "$(grep -cE 'drive\.google|docs\.google|googleusercontent' "$SS" || true)" 0 \
     "no provider allowlist was smuggled in (R1 is accepted, not suppressed)"
need "$(grep -cE '/\[-_\]/|/\[/=\]/|/\[-_/\+\]/|\[A-Za-z0-9\+/=_-\]' "$SS" || true)" 0 \
     "no hand-written delimiter class survives"
need "$(grep -cF 'ENTROPY_CANDIDATE' "$SS" || true)" 0 "the legacy candidate class is gone"

# --- 4. the harness reproduces its figures EXACTLY -------------------------
BASE=tests/fixtures/measure-entropy-arms.baseline.txt
CAND=tests/fixtures/measure-entropy-arms.candidate.txt
need "$(shasum -a 256 "$CAND" | cut -d' ' -f1 \
        | grep -cFx '94313d1e3997d78dc2d0a42044072ddd897c3b6359f51ca0f565d95600c77f8d' || true)" 1 \
     "candidate fixture matches the digest recorded in this spec"
need "$(awk 'NR>2' "$CAND" | wc -l | tr -d ' ')" 19 "candidate fixture has 19 generator rows"
node scripts/measure-entropy-arms.js --baseline >"$TAP"
diff -u "$BASE" "$TAP" \
  || { echo "GATE FAIL: --baseline output changed. The pre-change column is frozen."; exit 1; }
echo "ok: --baseline is still byte-identical to the pre-change fixture"
node scripts/measure-entropy-arms.js --candidate >"$TAP"
diff -u "$CAND" "$TAP" \
  || { echo "GATE FAIL: --candidate output differs from the checked-in expectation"; exit 1; }
echo "ok: --candidate table is byte-identical"
# The candidate table's old columns must equal the frozen baseline's, field by
# field. This is the cross-check that makes the before/after non-circular.
awk -F'\t' 'NR>2' "$BASE" >"$TAP.b"
awk -F'\t' 'NR>2 { printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", \
  $1,$2,$3,$4,$5,$6,$7,$9,$11,$13,$15,$17 }' "$CAND" >"$TAP.c"
diff -u "$TAP.b" "$TAP.c" \
  || { echo "GATE FAIL: --candidate's old columns disagree with the frozen baseline"; exit 1; }
echo "ok: candidate old columns == frozen baseline"

node scripts/measure-entropy-arms.js --passphrase >"$TAP"
expect_line 'bare\tentropy-old\t99.31\tentropy-new\t0.00\tgate-old\t99.31\tgate-new\t0.00' "$TAP"
expect_line 'prose\tentropy-old\t99.31\tentropy-new\t0.00\tgate-old\t99.31\tgate-new\t0.00' "$TAP"
expect_line 'assignment\tentropy-old\t100.00\tentropy-new\t0.00\tgate-old\t100.00\tgate-new\t100.00' "$TAP"
expect_line 'meanlen\t28.0' "$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 4 "--passphrase prints exactly four lines"

# --uuid-forms: ALL ELEVEN rows, byte for byte, plus the line count, so a
# harness that omits or misreports a row cannot pass (round-4 finding R4-3).
node scripts/measure-entropy-arms.js --uuid-forms >"$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 11 "--uuid-forms prints exactly eleven lines"
expect_line 'authorization-colon\tno\tyes' "$TAP"
expect_line 'bearer-header\tyes\tyes'      "$TAP"
expect_line 'token-colon\tyes\tyes'        "$TAP"
expect_line 'token-equals\tyes\tyes'       "$TAP"
expect_line 'api_key-colon\tyes\tyes'      "$TAP"
expect_line 'secret-equals\tyes\tyes'      "$TAP"
expect_line 'password-colon\tyes\tyes'     "$TAP"
expect_line 'client_secret-json\tyes\tyes' "$TAP"
expect_line 'x-api-key-colon\tyes\tyes'    "$TAP"
expect_line 'session-prose\tno\tno'        "$TAP"
expect_line 'bare\tno\tno'                 "$TAP"
echo "ok: all eleven uuid forms exact (E-S9, M1 restatement)"

# --extract: the whole justification for having NO bound. The `short` block is
# the round-6 argument: every bound up to 8 scores 35, reach scores 80.
node scripts/measure-entropy-arms.js --extract >"$TAP"
expect_line 'sweep\tround4\t7844\t7844'         "$TAP"
expect_line 'sweep\tbound-1\t7844\t7844'        "$TAP"
expect_line 'sweep\tbound-2\t4158\t7844'        "$TAP"
expect_line 'sweep\tbound-3\t1432\t7844'        "$TAP"
expect_line 'sweep\tbound-4\t333\t7844'         "$TAP"
expect_line 'sweep\tbound-6\t12\t7844'          "$TAP"
expect_line 'sweep\tbound-8\t4\t7844'           "$TAP"
expect_line 'sweep\tbound-16\t4\t7844'          "$TAP"
expect_line 'sweep\tbound-64\t4\t7844'          "$TAP"
expect_line 'sweep\tbound-inf\t4\t7844'         "$TAP"
expect_line 'sweep\treach\t4\t7844'             "$TAP"
expect_line 'sweep\ttrim\t1070\t7844'           "$TAP"
expect_line 'sweep\tnonword-start\t574\t7844'   "$TAP"
expect_line 'sweep\tresidue-only\t1574\t7844'   "$TAP"
expect_line 'inside\tlegacy\t94\t100'    "$TAP"
expect_line 'inside\tround4\t85\t100'    "$TAP"
expect_line 'inside\tbound-2\t90\t100'   "$TAP"
expect_line 'inside\tbound-3\t95\t100'   "$TAP"
expect_line 'inside\tbound-4\t100\t100'  "$TAP"
expect_line 'inside\tbound-8\t100\t100'  "$TAP"
expect_line 'inside\tbound-inf\t100\t100' "$TAP"
expect_line 'inside\treach\t100\t100'    "$TAP"
expect_line 'short\tlegacy\t84\t100'     "$TAP"
expect_line 'short\tround4\t35\t100'     "$TAP"
expect_line 'short\tbound-2\t35\t100'    "$TAP"
expect_line 'short\tbound-4\t35\t100'    "$TAP"
expect_line 'short\tbound-8\t35\t100'    "$TAP"
expect_line 'short\tbound-16\t80\t100'   "$TAP"
expect_line 'short\tbound-64\t80\t100'   "$TAP"
expect_line 'short\tbound-inf\t80\t100'  "$TAP"
expect_line 'short\treach\t80\t100'      "$TAP"
echo "ok: extraction is complete without a bound (E-M1, E-M3, E-D3, E-X1)"

node scripts/measure-entropy-arms.js --extract --differential >"$TAP"
expect_line 'soup\tlegacy\t44.036\treach\t49.636\tbound-inf\t51.108\t200000' "$TAP"
expect_line 'maxcell\t0.06' "$TAP"
echo "ok: reach is recall-equivalent to unbounded enumeration (E-X2)"

# --perf: THREE budgets, parsed strictly. Round 5 had one 1500 ms tripwire,
# which permitted a 319x regression. Fields:
#   1 label  2 bytes  3 shipped-ms  4 new-ms  5 ratio
# A bare `$4+0 > budget` test accepts NaN, empty and negative values (all coerce
# to 0), so every field is validated before it is compared.
node scripts/measure-entropy-arms.js --perf >"$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 11 "--perf prints exactly eleven baits"
PERF_LABELS='one-long-run random-base64 ab-dash-bait camel-bait delimiter-padding hex-run segment-dense-word segment-dense-blob uuid-dense segment-dense-nonword segment-dense-short'
awk -F'\t' -v want="$PERF_LABELS" -v ms=400 -v ratio=60 -v cap=262144 '
  BEGIN { n = split(want, L, " ") }
  {
    if (NF != 5) { printf "GATE FAIL: line %d has %d fields, expected 5\n", NR, NF; bad = 1; next }
    if ($1 != L[NR]) { printf "GATE FAIL: line %d label %s, expected %s\n", NR, $1, L[NR]; bad = 1 }
    if ($2 != cap) { printf "GATE FAIL: %s bytes %s, expected %d\n", $1, $2, cap; bad = 1 }
    for (f = 3; f <= 5; f++)
      if ($f !~ /^[0-9]+(\.[0-9]+)?$/) { printf "GATE FAIL: %s field %d = %s is not a finite non-negative number\n", $1, f, $f; bad = 1; next }
    if ($3 + 0 <= 0) { printf "GATE FAIL: %s shipped time %s is not positive\n", $1, $3; bad = 1; next }
    if ($4 + 0 > ms) { printf "GATE FAIL: %s took %s ms, absolute budget %d\n", $1, $4, ms; bad = 1 }
    if ($5 + 0 > ratio) { printf "GATE FAIL: %s is %sx the shipped detector, ratio budget %dx\n", $1, $5, ratio; bad = 1 }
  }
  END { if (NR != n) { printf "GATE FAIL: %d rows, expected %d\n", NR, n; bad = 1 } exit bad }' "$TAP"
echo "ok: eleven perf baits, each under 400 ms absolute and 60x the shipped detector (E-P1)"

# Sustained throughput: the cost SCAN_MAX_BYTES does NOT bound. 40 consecutive
# maximum-size chunks of the worst bait.
node scripts/measure-entropy-arms.js --sustained >"$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 3 "--sustained prints exactly three rows"
awk -F'\t' -v floor=1.0 '
  { if (NF != 3) { printf "GATE FAIL: sustained line %d has %d fields\n", NR, NF; bad = 1; next }
    if ($1 != "sustained") { printf "GATE FAIL: sustained line %d label %s\n", NR, $1; bad = 1 }
    if ($3 !~ /^[0-9]+(\.[0-9]+)?$/) { printf "GATE FAIL: %s throughput %s is not a number\n", $2, $3; bad = 1; next }
    if ($2 == "reach" && $3 + 0 < floor) { printf "GATE FAIL: sustained reach throughput %s MiB/s, floor %s\n", $3, floor; bad = 1 }
    seen[$2] = 1 }
  END { if (!(seen["shipped"] && seen["bound-8"] && seen["reach"])) { print "GATE FAIL: sustained rows missing"; bad = 1 } exit bad }' "$TAP"
echo "ok: sustained throughput on the worst bait is at or above 1.0 MiB/s (E-P5)"

# --- 5. the two gates ------------------------------------------------------
: >"$TAP"
node --test --test-reporter=tap tests/unit/dream-validate.test.js >>"$TAP" 2>&1 || true
node --test --test-reporter=tap tests/unit/digest.test.js         >>"$TAP" 2>&1 || true
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the two gate files"

# --- 6. the permission boundary held --------------------------------------
need "$(git diff --name-only main... | grep -cvE '^(src/core/secret-scan\.js|tests/fixtures/secret-scan-corpus\.js|tests/fixtures/measure-entropy-arms\.candidate\.txt|scripts/measure-entropy-arms\.js|tests/unit/(secret-scan|dream-validate|digest)\.test\.js|docs/adr/0024-layered-secret-lifecycle\.md|docs/specs/WP-secret-fence-shape-and-context\.md|package-lock\.json)$' || true)" 0 \
     "files outside the permission boundary"

# --- 7. full suite and lint ------------------------------------------------
npm test
npm run lint
echo "ALL GATES PASSED"
```

## Out of scope (do NOT do these)

- Changing any gate's `findings.length > 0` policy (EP2 dream validate, EP4
  digest).
- Changing `high-entropy` severity (ADR-0024 rejected it; the gates ignore
  severity anyway).
- Introducing a bigram, n-gram, dictionary or language-model discriminator, in
  any rung, in any mode of the harness, or as an "optional" refinement. Owner
  decision; E-M4 records why it does not work.
- Widening P2 to shape-only. It is resolved to canonical-only (Table B). If the
  owner wants shape-only, it is a separate WP whose deliverables include the
  corpus delta (`prec-p2-canonical-only` and `res-uuid-noncanon` flip, Table C's
  R4 and G7 rows come out). Do not implement it here, and do not add it back to
  OWNER-APPROVED as an option.
- Narrowing residual R6 by trimming word-shaped segments off span ends, or by
  refusing to start a span at a word-shaped segment. Measured and rejected at
  1 070 and 574 bypasses per 7 844 respectively (E-M3, Table A row A8).
- **Reintroducing a segment-count bound on extraction, under any name** —
  `ENTROPY_MAX_GROUP_SEGMENTS`, a group cap, a candidate cap, a per-run span cap.
  Every finite value has an adversarial family (Table A row A5). `REACH_TARGETS`
  is derived from two existing thresholds and is not a bound; do not turn it into
  a tunable pair of literals either.
- **Suppressing residual R1** — no Drive/Docs URL-slot rule, no `1`+43-base64url
  shape allowlist, no `id`-field context, no provider-name context. The URL-slot
  rule was measured (0 of 8 real occurrences covered, 0.00% in-slot detection
  retained) and the shape allowlist violates fail-closed. If the owner wants a
  provider-anchored suppression it is a separate WP with its own measurement and
  its own review; see OWNER-APPROVED item 3.
- Anything about the five `redactOnly` sinks. Documenting them is
  `WP-secret-sink-wiring-probes`, which is **diagnostic only and fixes nothing**;
  **fixing** truncate-then-redact (`alerts.js:47`, `run-evidence.js:64,78`) or
  per-chunk stream redaction (`brain.js:287,315`, `run-job.js:867,872`) is a
  third, separate package that does not exist yet. Do not add a `depends_on` on
  the probe WP: it was removed on purpose.
- Editing `tests/fixtures/secret-scan-legacy-entropy.js`,
  `tests/fixtures/measure-entropy-arms.baseline.txt` or
  `tests/unit/secret-scan-baseline.test.js`. They are the frozen `old` side.
- Adding the approval gate to `.github/workflows/ci.yml`.
- Restoring the three quarantined notes or replaying the 2026-07-24 transcripts —
  maintainer recovery, tracked separately.
- Any allowlist mechanism, config surface, or per-user tuning.
- Reducing the residual false positives R1/R2/R3 or the residual miss M1.
- Editing `docs/specs/done/WP-122-shared-secret-detector.md` or its
  OWNER-APPROVED block.

## Definition of done

1. `WP-secret-scan-baseline-oracle` has merged to `main`. This is a real
   dependency: three of this WP's deliverables modify files it creates, and the
   gate refuses to run without them.
2. The OWNER-APPROVED section above is filled in, dated, and carries an
   `evidence-sha256` that matches the current evidence block, **before any
   non-spec deliverable is committed**. This WP does **not** depend on
   `WP-secret-sink-wiring-probes`; do not wait on it.
3. All verification steps pass locally; output pasted into the PR body.
4. Conventional commits; PR titled
   `fix(secret-scan): unbounded reach-scanning, shape-aware high-entropy rule (WP-secret-fence-shape-and-context)`.
5. PR template filled, including "Decisions made" and `Generated-by:`.
6. This spec's `status:` flipped to `In-Review` in the same PR.
