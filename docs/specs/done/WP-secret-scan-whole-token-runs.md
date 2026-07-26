---
id: WP-secret-scan-whole-token-runs
title: Make the high-entropy redaction unit a whole delimiter-bounded token run
status: Superseded
model: sonnet
size: M
depends_on: [WP-secret-scan-baseline-oracle]
adrs: [ADR-0004, ADR-0024, ADR-0031, ADR-0033]
epic: secret-lifecycle
---

# WP-secret-scan-whole-token-runs: one maximal token run is the unit

> **SUPERSEDED 2026-07-25 — do not implement.** It widened the high-entropy redaction unit to a whole delimiter-bounded token run so a sha256 digest over it could mean "this exact value". That mattered only to the exact-value allowlist, which is gone. Reviewed and found sound on its own terms (0 verdict differences over 60,000 fuzzed inputs) — its measurement harness and its 12 enumerated behaviour classes are salvage.
>
> Replaced by `WP-secret-fence-two-tier-detector` + `WP-secret-fence-ep2-redact-arm` under ADR-0034, which scopes the
> fence to **accidental credential persistence** and fixes the one rule that
> caused 100% of the destructive false positives. Narrative:
> `docs/specs/logbook/2026-07-25-secret-fence-destructive-false-positives.md`.
>
> Everything below this line is the superseded design, preserved unedited.

---

> **This WP changes no verdict.** Every input that produces a `high-entropy`
> finding today still produces one, and every input that does not still does
> not. What changes is the **span** the detector replaces: it becomes the whole
> delimiter-bounded token instead of a fragment of one.
>
> The proof is the frozen oracle differential from
> `WP-secret-scan-baseline-oracle`. **That WP has not merged yet** — at
> `efd1489` none of its artifacts exist on disk (`git ls-files` shows no
> `tests/fixtures/secret-scan-legacy-entropy.js`, no
> `tests/fixtures/secret-scan-corpus.js`, no
> `tests/unit/secret-scan-baseline.test.js`, no
> `scripts/measure-entropy-arms.js`). It is this WP's `depends_on`, checked by
> Definition-of-done step 1. Do not read "the oracle already shipped" anywhere;
> it is coming, and this WP cannot start before it.

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent Claude/Codex sessions into the
user's markdown **vault**. Before anything is committed, every staged note passes
ADR-0024's **EP2 staged-output gate**: `src/core/dream/validate.js:14` requires
`scanAndRedact` from the ONE shared detector `src/core/secret-scan.js` and, if it
returns **any** finding of **either** severity, reverts the whole note. The same
detector gates three digest sections at **EP4** (`src/core/digest.js:11`) and
sanitizes five other durable-output sinks through `redactOnly`
(`src/cli/run-job.js:13`, `src/core/alerts.js:6`, `src/core/dream/brain.js:7`,
`src/core/run-evidence.js:19`, `src/core/transcripts/index.js:8`).

Behind eighteen precise labelled provider rules sits one **context-free
high-entropy pass**: any run of 24+ characters drawn from `[A-Za-z0-9+/=]` whose
Shannon entropy is at least 3.5 bits/char is labelled `high-entropy` at
`quarantine` severity, and that run is replaced by `[REDACTED:high-entropy]`.
That pass over-fires on ordinary vault prose. Measured on the maintainer's real
vault on 2026-07-25: **102 of 181 notes** contain at least one match and would be
reverted by EP2. Since `WP-secret-revert-defers-ledger` merged (commit
`efd1489`) those false positives are **non-destructive** — a secret-reverted
dream now defers its transcripts instead of consuming them, so the content is
retried, and only after three deferrals does it surface as a loud quarantine.

The fix for the over-firing is ADR-0033's **human-ratified exact-value secret
allowlist**: a person reviews what the gate withheld and permanently approves
specific values by `sha256` digest, so the same benign value is not filtered
again and again. Shape rules — length, prefix, character class, "provider-shaped
id" — are rejected **permanently** by ADR-0033; only whole-value equality is
allowed. ADR-0033 decision 1 is precise about what gets hashed: *"the exact UTF-8
bytes of one **maximal detector run** (the whole delimiter-bounded token the
entropy pass matched)"*.

**Today's detector cannot honour that sentence, and that is the whole reason
this WP exists.** Its candidate alphabet `[A-Za-z0-9+/=]` **excludes `-` and
`_`**. A Google Drive file id is base64url, so it contains `-` and `_`, so today
the detector matches *fragments* of it. Approving a fragment digest would be a
shape rule wearing a digest costume: the stored key would be "some 24+ character
piece of a value", not the value. Worked example, executed against the shipped
detector on 2026-07-25:

```text
input   see [[01-Projects/wienerdog/current-state]] for detail
today   see [[01-[REDACTED:high-entropy]-state]] for detail
        → the approvable unit would be the fragment "Projects/wienerdog/current"
after   see [[[REDACTED:high-entropy]]] for detail
        → the approvable unit is "01-Projects/wienerdog/current-state"
```

This WP makes the redaction unit a **token run**: one maximal run of token
characters, bounded by any character outside that set. Nothing else changes — not
the fire predicate, not a threshold, not a severity, not a rule, and no
suppression of any kind is introduced here.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP starts no process,
opens no socket, and writes nothing at runtime. It edits one pure module,
adds one test file, repairs one assertion block in one existing test, and adds
one glossary bullet.

### Why this is a separate work package

`~/.wienerdog/app/current` symlinks to the live checkout on the maintainer's
machine, so merging changes production immediately. This change gets its own
gate and its own revert point, separate from the allowlist that will consume its
output. It is also the only change in the chain that can be proven by
*equality*: after it, the frozen oracle from `WP-secret-scan-baseline-oracle`
must still agree with the shipped detector on every corpus input, exactly as it
did before. If a reviewer sees one verdict move, the change is wrong.

## Current state

`src/core/secret-scan.js`, 242 lines, pure (no `fs`, no env, no argv, no
network), zero dependencies. **This is the pre-fence file.** Anything you may
have read about a `SPAN_RUN` constant, a `DELIM_ALL` constant, an
`entropyRegions` function, a `consider` function, a P1–P5 precedence ladder, or
an `insideSuppressedUuid` helper describes `WP-secret-fence-shape-and-context`,
which is **superseded and was never implemented**. None of those symbols exist.
Do not look for them.

Verified at `efd1489`, line by line:

| Where | What is there today |
|-------|---------------------|
| line 21 | `const ScanLimits = { SCAN_MAX_BYTES: 256 * 1024, ENTROPY_MIN_LEN: 24, ENTROPY_MIN_BITS_PER_CHAR: 3.5 }` — **exactly three keys** |
| line 32 | `const SEVERITY = { REDACT: 'redact', QUARANTINE: 'quarantine' }` |
| lines 87–153 | `const RULES = [...]` — the eighteen labelled rules |
| line 155 | ``const ENTROPY_CANDIDATE = new RegExp(`[A-Za-z0-9+/=]{${ScanLimits.ENTROPY_MIN_LEN},}`, 'g');`` |
| line 158 | `function bitsPerChar(run)` — Shannon entropy over the run |
| lines 180–186 | `function entropyPass(text, add)` — a flat `text.replace(ENTROPY_CANDIDATE, …)` |
| line 200 | `function scanAndRedact(text)` — runs `RULES`, then `entropyPass`, inside one `try` |
| line 242 | `module.exports = { scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY };` |

The current entropy pass, verbatim:

```js
function entropyPass(text, add) {
  return text.replace(ENTROPY_CANDIDATE, (run) => {
    if (bitsPerChar(run) < ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return run;
    add('high-entropy', SEVERITY.QUARANTINE);
    return '[REDACTED:high-entropy]';
  });
}
```

**The blob this WP edits.** `git hash-object src/core/secret-scan.js` at
`efd1489` is `eb273e19050037542c8beb441b8a320a3248b514`, which is the same value
`WP-secret-scan-baseline-oracle` recorded as the source its frozen oracle copies
(that spec's Table O, row O5, requires the successor to re-assert it on its
pre-edit base — this WP is that successor, and the assertion is step 0 of the
gate below).

**What `WP-secret-scan-baseline-oracle` puts on `main` before this WP starts.**
Read it if you have not; this WP consumes it and adds no second harness:

- `tests/fixtures/secret-scan-legacy-entropy.js` — the frozen pre-change oracle,
  exporting `legacyEntropyFires(text) -> boolean`. It does not `require` `src/`,
  so this WP's edit cannot change what "today's rule did" means.
- `tests/fixtures/secret-scan-corpus.js` — 99 literal inputs across six named
  families plus four generator functions producing 95 + 5 + 100 + 100 more, and
  a `LEGACY` map of each one's observed pre-change verdict.
- `tests/unit/secret-scan-baseline.test.js` — asserts, among other things, the
  **399-input differential**: for every corpus and generator input,
  `legacyEntropyFires(input) === scanAndRedact(input).findings.some(f => f.label === 'high-entropy')`.
  **This WP does not modify that file, and it must still pass unmodified.**
  That is this WP's central proof.
- `scripts/measure-entropy-arms.js` with modes `--baseline`, `--passphrase`,
  `--uuid-forms`, `--perf`, and the frozen fixture
  `tests/fixtures/measure-entropy-arms.baseline.txt`.

`tests/unit/secret-scan.test.js` exists and has spot-check tests. **This WP does
not modify it**; all of its tests pass unchanged (verified against a prototype).

`npm test` is `node tests/run.js`, which spawns `node --test`. `npm run lint` is
`node scripts/lint.js`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/secret-scan.js | replace the line-155 constant with the three constants of **Table T** and replace `entropyPass` with the two functions of **Table T**. Nothing else in the file changes — not `ScanLimits`, not `RULES`, not `bitsPerChar`, not `scanAndRedact`, not `redactOnly`, not `hasHardFinding`, **not the export list** |
| create | tests/unit/secret-scan-whole-token-runs.test.js | the 95-case closure family, the **one** derived-alphabet case, the twelve class vectors of **Table B**, and the idempotence / repeated-scan invariants — all through the public API. TAP test names must start with the prefixes `token-run closure:`, `token-run alphabet:` and `token-run class B` (each followed by a space) so the gate can count them. See "Acceptance criteria" |
| modify | tests/unit/scheduler-runjob.test.js | **one comment plus a two-line assertion block**, replacing the single assertion at line 1826, and **one `require` line** added to the require block at the top. Exact before/after under "Exact contracts". Change nothing else in that file |
| modify | docs/GLOSSARY.md | ONE new bullet, **token run**, inserted immediately after the existing **secret scan / `scanAndRedact`** bullet and before the **secret quarantine** bullet. Exact text under "Exact contracts" |

**Do not create, modify or delete anything else.** In particular: not
`tests/unit/secret-scan.test.js`, not `tests/unit/secret-scan-baseline.test.js`,
not either fixture under `tests/fixtures/`, not
`tests/fixtures/measure-entropy-arms.baseline.txt`, not
`scripts/measure-entropy-arms.js`, not any consumer module, not any ADR, not any
other spec.

### Exact contracts

#### `src/core/secret-scan.js` — the constants (replaces line 155)

```js
// The ONE canonical character-class declaration in this module. CANDIDATE_CLASS
// is FROZEN: it is today's entropy-candidate alphabet, byte for byte, and the
// fire predicate is unchanged because of it. TOKEN_CLASS is DERIVED from it by
// concatenation and is never re-typed anywhere, so the invariant
// "every candidate character is a token character" cannot be broken by editing
// one site and forgetting another. There is no delimiter list in this module,
// and none may be added: a DELIMITER is, by definition, any character that is
// not in TOKEN_CLASS.
//
// TOKEN_EXTRA's `-` is LAST and backslash-escaped. A `-` anywhere else inside a
// character class becomes a RANGE: writing `[A-Za-z0-9+/=-_]` silently admits
// `>`, `?`, `@`, `[`, `\`, `]` and `^` as token characters, which would merge
// runs across wikilink brackets. The 95-character closure test exists to catch
// exactly that.
const CANDIDATE_CLASS = 'A-Za-z0-9+/=';
const TOKEN_EXTRA = '_\\-';
const TOKEN_CLASS = `${CANDIDATE_CLASS}${TOKEN_EXTRA}`;

/** A high-entropy CANDIDATE — unchanged from before this WP. */
const ENTROPY_CANDIDATE = new RegExp(`[${CANDIDATE_CLASS}]{${ScanLimits.ENTROPY_MIN_LEN},}`, 'g');

/** A TOKEN RUN: one maximal run of token characters. This is the unit the
 *  entropy pass redacts and the unit an exact-value allowlist may later digest
 *  (ADR-0033 decision 1). */
const TOKEN_RUN = new RegExp(`[${TOKEN_CLASS}]+`, 'g');
```

After this edit the two compiled regexes are exactly:

```text
ENTROPY_CANDIDATE   /[A-Za-z0-9+/=]{24,}/g      ← identical to today's
TOKEN_RUN           /[A-Za-z0-9+/=_\-]+/g       ← new
```

#### `src/core/secret-scan.js` — the pass (replaces lines 172–186)

The existing JSDoc block above `entropyPass` is replaced together with the
function. `bitsPerChar` above it is untouched.

```js
/**
 * Does today's high-entropy rule fire anywhere inside `run`? This predicate is
 * UNCHANGED by WP-secret-scan-whole-token-runs: a candidate is still a run of
 * at least ENTROPY_MIN_LEN CANDIDATE_CLASS characters at at least
 * ENTROPY_MIN_BITS_PER_CHAR bits/char. Only the span that gets replaced moved.
 *
 * ENTROPY_CANDIDATE is module-scoped and carries the /g flag, so lastIndex MUST
 * be reset on entry — an early `return true` leaves it mid-string and the next
 * call would silently start scanning from there.
 * @param {string} run
 * @returns {boolean}
 */
function candidateFires(run) {
  ENTROPY_CANDIDATE.lastIndex = 0;
  let m;
  while ((m = ENTROPY_CANDIDATE.exec(run)) !== null) {
    if (bitsPerChar(m[0]) >= ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return true;
  }
  return false;
}

/**
 * Contextual high-entropy pass. The unit is one maximal TOKEN_RUN match — a
 * whole delimiter-bounded token — so the replaced span is exactly the value a
 * later exact-value allowlist can digest (ADR-0033 decision 1). A run fires iff
 * today's candidate rule fires somewhere inside it, so no input's verdict
 * changed. An unstructured secret has no safe partial redaction → QUARANTINE.
 * @param {string} text
 * @param {(label:string, severity:Severity)=>void} add
 * @returns {string}
 */
function entropyPass(text, add) {
  return text.replace(TOKEN_RUN, (run) => {
    // A candidate is at least ENTROPY_MIN_LEN characters and, because every
    // candidate character is a token character, lies wholly inside one token
    // run — so a shorter run cannot contain one. Pure fast path, no verdict.
    if (run.length < ScanLimits.ENTROPY_MIN_LEN) return run;
    if (!candidateFires(run)) return run;
    add('high-entropy', SEVERITY.QUARANTINE);
    return '[REDACTED:high-entropy]';
  });
}
```

**The export list does not change.** Everything the new tests need is observable
through `scanAndRedact`; see "Why nothing new is exported" in Implementation
notes. `module.exports` stays exactly
`{ scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY }`.

#### `tests/unit/scheduler-runjob.test.js` — the one assertion to repair

At line 1826, inside
`test('scheduler-runjob: managed policy hooks present → warns, records evidence, PROCEEDS (WP-132)', …)`.

Replace exactly this comment and assertion:

```js
  // The random temp-dir segment may be scrubbed by the uniform redaction pass
  // (a test-env artifact — production exec paths are stable); the executable
  // identity itself must survive.
  assert.ok(rec.execPath.endsWith('/ok.sh'), rec.execPath);
```

with exactly:

```js
  // `execPath` goes through the uniform redaction pass (run-evidence.js:85).
  // On macOS `os.tmpdir()` is itself high-entropy and `/` is a token character,
  // so the whole temp path plus the script stem is ONE token run and the field
  // reduces to `[REDACTED:high-entropy].sh`; on Linux (`/tmp/…`) nothing fires
  // and it survives intact.
  //
  // Line 1 pins the contract that holds on both platforms: evidence records the
  // RESOLVED executable path, redacted by the ONE shared detector.
  //
  // Line 1 ALONE is weaker than the assertion it replaces, in the dimension that
  // matters: on macOS `redactOnly(<tmp>/…/evil.sh)` and `redactOnly(<tmp>/…/ok.sh)`
  // are BOTH `[REDACTED:high-entropy].sh`, so it cannot tell which script ran.
  // Line 2 restores that check wherever the field survives redaction — which is
  // every Linux run, including CI. Do not delete it as redundant; it is the only
  // assertion here that names `ok.sh`.
  assert.equal(rec.execPath, redactOnly(fake));
  if (rec.execPath === fake) assert.ok(rec.execPath.endsWith('/ok.sh'), rec.execPath);
```

and add the import to the require block at the top of the file (after line 15,
`const { allowAll } = require('../../src/core/safety-profile');`):

```js
const { redactOnly } = require('../../src/core/secret-scan');
```

This is a **repair of an assertion this WP breaks**, not a new test. It is not
expected to be red before the change (both lines pass on unmodified `main` too);
it is listed in the Mutation checks table with the two mutations it catches, one
per platform (M10, M11). Measured
values on the maintainer's macOS machine, 2026-07-25:

```text
fake                /var/folders/3v/02rwx2m56_b270xrhlf020080000gn/T/wd-runjob-YaFr25/ok.sh
before this WP      [REDACTED:high-entropy]_[REDACTED:high-entropy]-runjob-YaFr25/ok.sh
after this WP       [REDACTED:high-entropy].sh
Linux shape, both   /tmp/wd-runjob-YaFr25/ok.sh   (unchanged — nothing fires)
```

This is the **only** assertion in the whole suite that this WP breaks. Verified
by running every file under `tests/unit/` (1577 tests) and `tests/integration/`
(94 tests) against a prototype of the change: one additional failure, this one.

#### `docs/GLOSSARY.md` — the new bullet

Insert immediately after the existing **secret scan / `scanAndRedact`** bullet
(which ends `(Not: "filter", "scrubber", "DLP".)`) and immediately before the
**secret quarantine** bullet:

```markdown
- **token run** — the unit the secret scan's high-entropy pass matches and
  redacts: one maximal run of **token characters** (`A`–`Z`, `a`–`z`, `0`–`9`,
  `+`, `/`, `=`, `_`, `-`), bounded on both sides by any character outside that
  set. Because it is a whole delimiter-bounded token, a `sha256` over it names
  one exact value rather than a fragment of one — which is what makes ADR-0033's
  exact-value secret allowlist possible. (Not: "span", "blob", "match",
  "segment".)
```

## Contract reference

Activation (ADR-0031, 4 of 7): **(i)** a result shape changes — `scanAndRedact`
returns a different `text` and a different `count` for some inputs; **(iv)**
precedence/boundary behaviour changes — which span is replaced; **(vi)** two
successor specs (`WP-secret-allowlist-exact-value-store`,
`WP-quarantine-review-cli`) inherit "the unit is one token run" as their central
contract; **(vii)** the same facts appear in the module constants, the module
JSDoc, the glossary bullet, the tests and the verification greps.

Two canonical tables:

| Family | Canonical table | Nothing else decides it |
|--------|-----------------|-------------------------|
| the token-run contract | **Table T** | the two character classes, their derivation, the fire predicate, the unit, and the four invariants |
| what observably changes | **Table B** | every behaviour class, its literal vector, and its measured before/after |

### Table T — canonical: the token-run contract

| Row | Fact | Value |
|-----|------|-------|
| T1 | candidate alphabet | `CANDIDATE_CLASS = 'A-Za-z0-9+/='` — **frozen**, byte-identical to the class at line 155 today. 65 of the 95 printable-ASCII characters |
| T2 | the two added characters | `TOKEN_EXTRA = '_\\-'` — `_` and `-`, and nothing else. Not `.`, not `~`, not `:`, not `@`. They are the two characters that separate base64url (RFC 4648 §5) from base64 (§4); the shared padding `=` is already in T1 |
| T3 | token alphabet | `TOKEN_CLASS = CANDIDATE_CLASS + TOKEN_EXTRA`, **derived by concatenation, never re-typed**. 67 of the 95 printable-ASCII characters |
| T4 | delimiter alphabet | **There is none, and none may be added.** A delimiter is any character not in `TOKEN_CLASS`. The complement is never enumerated, so no two sites can disagree about it |
| T5 | candidate regex | `ENTROPY_CANDIDATE = /[A-Za-z0-9+/=]{24,}/g` — unchanged |
| T6 | token-run regex | `TOKEN_RUN = /[A-Za-z0-9+/=_\-]+/g` |
| T7 | **the fire predicate** | a token run fires iff `candidateFires(run)`, i.e. iff some `ENTROPY_CANDIDATE` match inside it has `bitsPerChar >= 3.5`. **Identical to today's rule**, applied within the run |
| T8 | **the unit** | one maximal `TOKEN_RUN` match. That whole run is replaced by `[REDACTED:high-entropy]`, and it is the string a later allowlist digests (ADR-0033 decision 1) |
| T9 | invariant — subset | every character in `CANDIDATE_CLASS` is in `TOKEN_CLASS`. **True by construction** from T3's concatenation, so no mutation that leaves T3 intact can falsify it — T3 is pinned textually by the gate instead. Behaviourally, the derived-alphabet test asserts that all 65 candidate characters appear in the alphabet OBSERVED through `scanAndRedact` |
| T10 | invariant — containment | every `ENTROPY_CANDIDATE` match in any text lies wholly inside exactly one `TOKEN_RUN` match. Follows from T9 and maximality; asserted behaviourally by the closure family and by the derived-alphabet test |
| T11 | invariant — **verdict equality** | for every input, `scanAndRedact(input).findings.some(f => f.label === 'high-entropy')` is unchanged by this WP. Asserted by the unmodified 399-input differential in `tests/unit/secret-scan-baseline.test.js` |
| T12 | invariant — label sets | for every input, the **set** of finding labels is unchanged. Only `text` and the `high-entropy` `count` may differ |
| T13 | the fast path | `if (run.length < ScanLimits.ENTROPY_MIN_LEN) return run;` is sound because of T9 + T10: a 24-character candidate cannot fit in a 23-character run. It is an optimization with no verdict of its own |
| T14 | what is NOT here | no severity change, no threshold change, no new `ScanLimits` key, no new rule, no suppression of any kind, no allowlist, no context or proximity rule, no UUID handling, no export change |

### Table B — canonical: what observably changes

Every row was executed against `src/core/secret-scan.js` at `efd1489` (the
`before` column) and against a prototype of this WP (the `after` column) on
2026-07-25. `count` is the `count` field of the `high-entropy` finding, `0`
meaning no such finding.

| Class | What it is | Literal input | before | after |
|-------|-----------|---------------|--------|-------|
| B1 | **unchanged span** — the firing candidate is already a whole token run | `blob 5NQywwNzM016QPy4x27M6z7310P3x524 end` | `blob [REDACTED:high-entropy] end`, count 1 | identical |
| B2 | **span widens** — the run extends past the candidate on both sides | `that-7f3a9c1e5b8d2406af71c39e5d8b204c-foo` | `that-[REDACTED:high-entropy]-foo`, count 1 | `[REDACTED:high-entropy]`, count 1 |
| B3 | **span widens — the base64url case this WP exists for** | `blob q7PmXz4KvR9tWc2LbN8dYfGh-JkL0pQrStUvWxYz3A1 end` | `blob [REDACTED:high-entropy]-JkL0pQrStUvWxYz3A1 end`, count 1 | `blob [REDACTED:high-entropy] end`, count 1 |
| B4 | **merge, count drops** — two firing candidates in one run become one finding | `ids 7f3a9c1e5b8d2406af71c39e5d8b204c-4e91c3a7f2058bd6194ea73c85f20db6 end` | `ids [REDACTED:high-entropy]-[REDACTED:high-entropy] end`, count **2** | `ids [REDACTED:high-entropy] end`, count **1** |
| B5 | **benign neighbours swallowed** — word-shaped text inside the run is redacted too | `Documentation-Repository-Configuration-5NQywwNzM016QPy4x27M6z7310P3x524` | `Documentation-Repository-Configuration-[REDACTED:high-entropy]`, count 1 | `[REDACTED:high-entropy]`, count 1 |
| B6 | **the vault case** — the approvable unit stops being a fragment | `see [[01-Projects/wienerdog/current-state]] for detail` | `see [[01-[REDACTED:high-entropy]-state]] for detail`, count 1 | `see [[[REDACTED:high-entropy]]] for detail`, count 1 |
| B7 | **no change, not firing** — a canonical UUID stays untouched | `session 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c closed` | unchanged, count 0 | unchanged, count 0 |
| B8 | **no change, not firing** — a snake_case identifier stays untouched | `threshold ENTROPY_HEX_MIN_BITS stays where it is` | unchanged, count 0 | unchanged, count 0 |
| B9 | **dilution cannot un-fire** — `-` padding | `blob 5NQywwNzM016QPy4x27M6z7310P3x524`, then 35 `-` characters, then a space and `end` | `blob [REDACTED:high-entropy]-----… end`, count 1 | `blob [REDACTED:high-entropy] end`, count 1 |
| B10 | **dilution cannot un-fire** — `_` padding | `blob 5NQywwNzM016QPy4x27M6z7310P3x524`, then 40 `_` characters, then a space and `end` | `blob [REDACTED:high-entropy]____… end`, count 1 | `blob [REDACTED:high-entropy] end`, count 1 |
| B11 | **length floor, below** — a 23-character candidate-alphabet run | `blob q7PmXz4KvR9tWc2LbN8dYfG end` | unchanged, count 0 | unchanged, count 0 |
| B12 | **length floor, at** — a 24-character candidate-alphabet run | `blob q7PmXz4KvR9tWc2LbN8dYfGh end` | `blob [REDACTED:high-entropy] end`, count 1 | identical |

**Rows B9 and B10 are the reason the fire predicate stays on the candidate.**
Shannon entropy is computed over whatever span you measure, so evaluating the
*widened* run would let low-entropy padding drag a credential below the 3.5
floor: `5NQywwNzM016QPy4x27M6z7310P3x524` measures 4.000 bits/char alone, and
**2.909** bits/char once the 35 `-` characters of B9's vector are glued to it
(2.769 with B10's 40 `_`). Both are well under the 3.5 floor. Re-measured
2026-07-25 — an earlier draft printed 2.851, which is the value at **37** `-`
characters, not 35, and disagreed with B9's own vector. A detector that measured
the widened run would stop firing on both B9 and B10 — a **detection loss**, and
a trivially exploitable cloaking primitive. Because `candidateFires` measures the
candidate, not the run, neither can happen. Do not "simplify" `candidateFires`
into `bitsPerChar(run) >= 3.5`.

**Measured aggregate.** The population is **580** inputs, not the 543 an earlier
draft of this spec claimed. That number mis-decomposed the corpus at 62 literal
rows; `WP-secret-scan-baseline-oracle` defines **99** literal rows across six
named families (20 `NEGATIVE` + 23 `POSITIVE` + 9 `SOFTENED` + 31 `BOUNDARY` +
13 `PRECEDENCE` + 3 `RESIDUAL_FP`), so the decomposition is
**300 generated + 99 literal + 181 vault notes = 580**. The 543 figure is
withdrawn.

Measured on the maintainer's real vault (181 notes, 2026-07-25, Node v25.9.0),
prototype vs `efd1489`:

| Measure, over the 181 vault notes | Result |
|---------|--------|
| `high-entropy` verdict differences | **0** |
| finding-label-set differences | **0** |
| `high-entropy` `count` differences | **0** |
| redacted-`text` differences | 84 (classes B2–B6) |
| notes that EP2 would revert, before | 102 of 181 |
| notes that EP2 would revert, after | **102 of 181 — unchanged** |
| distinct approvable units, before | 106 (fragments) |
| distinct approvable units, after | **118 (whole tokens)** |

The other **399** inputs (99 literal + 300 generated) cannot be pre-measured in
this spec: they live in fixtures that do not exist until
`WP-secret-scan-baseline-oracle` merges. They are not asserted here on trust —
they are asserted **by the gate**, which requires
`tests/unit/secret-scan-baseline.test.js` to pass **unmodified**, and that file's
399-input differential is exactly the "0 verdict differences" claim. **The
implementer must report, in the PR body, the `text`-difference and `count`-
difference counts over all 580** (vault + corpus + generators). Nothing in the
design depends on those two numbers; they exist so the change's blast radius is
stated rather than guessed. Do not copy a figure from an earlier draft.

### Mirrored Surface Checklist

Every surface below restates a fact owned by Table T or Table B. A review finding
updates the owning table **and** every mirror listed here in one pass; a new
mirror found in review is registered here on the spot.

Mirrors of **Table T**:

- [ ] the three constants and their comment block in `src/core/secret-scan.js`
- [ ] `candidateFires`'s JSDoc (T7) and `entropyPass`'s JSDoc (T8)
- [ ] the fast-path comment inside `entropyPass` (T13)
- [ ] the Deliverables `Notes` cell for `src/core/secret-scan.js` (T14's "nothing else changes")
- [ ] the **token run** GLOSSARY bullet's character list (T3)
- [ ] the independently-written 67-character literal in the new test file, and the derived-alphabet test that compares the module's OBSERVED alphabet against it (T3, T9, T10)
- [ ] the verification greps for the class constants and the single declaration site
- [ ] the Out-of-scope bullets that name each excluded change (T14)
- [ ] the Current-state statement that `ScanLimits` has exactly three keys (T14)

Mirrors of **Table B**:

- [ ] every class vector in `tests/unit/secret-scan-whole-token-runs.test.js`
- [ ] the Acceptance criteria that assert them, **and the `Red before?` table that says which of them are red on `main`** — a criterion and its red-before verdict must move together
- [ ] the aggregate numbers quoted in Context and in "Why this is a separate work package" — the population is **580** (300 generated + 99 literal + 181 vault), decomposed the same way in both places
- [ ] the B9/B10 dilution footnote's bits/char figures — they must agree with B9's and B10's own padding lengths (35 `-` → 2.909, 40 `_` → 2.769)
- [ ] the `tests/unit/scheduler-runjob.test.js` repair (class B2 hitting an existing assertion) and its two platform-split mutation rows M10/M11
- [ ] the Mutation checks table rows for B4, B7, B9 and the closure family
- [ ] the gate's per-family TAP line counts (95 closure, **1** alphabet, 12 class, 399 differential)

## Implementation notes & constraints

- **No new npm dependency.** Plain Node ≥ 18, JSDoc types only, no TypeScript,
  no build step. The module stays pure: no `fs`, no env, no argv, no network.
- **Why nothing new is exported.** Every invariant in Table T is observable
  through `scanAndRedact`, so the module's public surface does not grow. The
  closure family works because a token run and a delimiter produce visibly
  different output: for a token character `c`, `BLOB + c + BLOB` yields ONE
  `[REDACTED:high-entropy]`; for a delimiter it yields
  `[REDACTED:high-entropy]<c>[REDACTED:high-entropy]`. Do not export
  `TOKEN_RUN`, `ENTROPY_CANDIDATE`, `TOKEN_CLASS` or `candidateFires` "for
  testability" — a test that reads the module's own constant and compares it to
  itself proves nothing, which is the standing lesson
  `WP-secret-scan-baseline-oracle` records: *before asserting a piece of
  evidence is trustworthy, name the thing outside it that would disagree if it
  were wrong.* Here that outside thing is the 67-character literal written by
  hand in the test file.
- **The `-` must be last in the class and escaped.** `'_\\-'` in a JS string
  literal is the two characters `_` and `\-` in the regex source. Writing the
  class as `[A-Za-z0-9+/=-_]` instead makes `=-_` a **range** and silently adds
  `>`, `?`, `@`, `[`, `\`, `]`, `^` as token characters — seven characters,
  including both wikilink brackets. Measured; it is in the Mutation checks table.
- **Reset `ENTROPY_CANDIDATE.lastIndex` on entry to `candidateFires`.** The
  regex is module-scoped with `/g`, and an early `return true` leaves `lastIndex`
  mid-string. `String.prototype.replace` manages `TOKEN_RUN`'s `lastIndex`
  itself, so only `candidateFires` needs the reset.
- **Linear time is preserved.** `TOKEN_RUN` matches are disjoint and cover the
  input once; the inner `ENTROPY_CANDIDATE` scan of a run is linear in that run.
  Measured at the 256 KiB `SCAN_MAX_BYTES` cap over the eleven `--perf` baits
  the oracle WP ships: every bait within 0.3 ms of the shipped detector, worst
  case 9.8 ms. A twelfth shape (`'a1B '` repeated — the maximum number of short
  space-separated runs per byte, so the maximum number of `replace` callbacks)
  went **~2.8 ms → ~4.3–4.8 ms** across three runs on **Node v25.9.0, macOS,
  2026-07-25**. Two honest caveats. (1) **Annotate every timing you record with
  its Node version**; these figures are JIT-sensitive and an independent
  re-measurement of this same shape on the same Node produced up to 8.0 ms. (2)
  The **claim** is linearity and a ~50× margin against the 400 ms budget, not any
  particular millisecond count — the gate asserts only the budget. An earlier
  draft printed 3.2 → 4.5 as if it were reproducible; it is not, and the gate
  never checked it.
- **Do not memoize, cache, or hoist anything across calls.** The module is pure
  and re-entrant; the two module-scoped regexes are the only state, and their
  `lastIndex` handling is specified above.
- **The `count` semantics change is intentional and safe** (class B4). No
  consumer branches on a finding's `count`: EP2 (`dream/validate.js`) and EP4
  (`digest.js`) both gate on `findings.length > 0`, and the five `redactOnly`
  sinks discard findings entirely. Verified by grep — the only `.count` uses in
  `src/` are `secret-scan.js:213` itself and an unrelated alert counter in
  `digest.js:294`.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Two things a reviewer will ask about

1. **"Doesn't a wider alphabet mean more false positives?"** It would, if the
   entropy floor were applied to the widened run. It is not (T7). Applying it to
   the run was measured and **rejected**: on the maintainer's vault it takes EP2
   reverts from 102 of 181 notes to **151 of 181**, and it takes the number of
   distinct values a human would have to approve from 106 to **699** — of which
   148 are canonical UUIDs and 319 are vault paths containing `/`. Both of those
   are *unbounded* sets: every new session produces a new UUID and every new note
   produces a new path, so an exact-value allowlist could never retire them. It
   also flips the `bare` and `session-prose` rows of the oracle WP's frozen
   `--uuid-forms` fixture from `no` to `yes` — independently confirmed in review:
   the canonical UUID measures **3.898 bits/char**, well over the 3.5 floor, so
   widening the *predicate* turns a frozen `no` into a `yes`. Recorded here so it
   is not re-proposed.

   **One honest sentence about that argument, because it cuts both ways.** The
   disqualifying property above is "319 of 699 are paths containing `/` — an
   unbounded set an allowlist can never retire." The **shipped** design has the
   same class in it, just smaller: measured on the maintainer's vault
   2026-07-25, **114 of the 118** distinct approvable units after this WP contain
   `/` (and **102 of 106** before it). Class B6 is literally a vault path, and
   the fragment `Projects/wienerdog/current` is already one of today's 106. So
   this WP does not *introduce* the path class — it is ~97% of the approval queue
   either way — but it does grow it 106 → 118, an **11% increase in what a human
   must approve**, and the queue keeps growing as the vault does. Whether the
   exact-value allowlist needs a retirement story for path-shaped digests is an
   **open owner question**; `WP-secret-allowlist-exact-value-store` and
   `WP-quarantine-review-cli` currently have none, and inventing one is not this
   WP's job. Stated so the successor inherits the number rather than the
   surprise.
2. **"Then what about a credential shredded by `-` into sub-24-character
   pieces?"** It is undetected today and stays undetected after this WP —
   `WP-secret-scan-baseline-oracle`'s corpus pins it as an existing legacy miss
   (six of the 100 `delimiterInside()` rows and sixteen of the 100
   `shortSegments()` rows). Closing that gap means firing on the widened run,
   which is finding 1's rejected design. It is an **unchanged accepted
   residual**, not a regression, and it needs a design that does not exist yet.
   Do not close it here.

## Security checklist

- [ ] The change can only ever redact **more** text than before, never less: the
      fire predicate is unchanged (T7, T11) and the replaced span is a superset
      of the old one (T9, T10). Asserted by the unmodified 399-input differential
      and by classes B9/B10.
- [ ] No suppression, allowlist, exemption, shape rule, prefix rule, length rule
      or context rule is introduced. Proved by two greps **that the verification
      gate actually runs** (step 3): `grep -cF 'ALLOWED'` is 0, and
      `grep -c 'return run;'` is exactly **2** — the length fast path and the
      `candidateFires` check, and no third branch.
- [ ] The character class cannot silently widen: all 95 printable-ASCII
      characters are classified by an independently written literal in the test
      file and compared against observed behaviour.
- [ ] Every credential-shaped literal added by this WP is **fake** — synthesized
      for the test file, never a real key, never copied from a private vault,
      transcript or log. No verbatim sentence from the maintainer's notes appears
      in any deliverable.
- [ ] The module stays pure and total: still no `fs`, no env, no argv, no
      network; still returns the fixed withheld marker plus a `quarantine`
      finding on the oversized and error paths, never the raw text, never a
      throw.
- [ ] No untrusted identifier flows into a filesystem path or a shell command —
      this WP touches neither.
- [ ] Merging this WP changes no verdict, so it neither closes nor opens any
      detection defect. Nothing here may be cited as making any byte safer.

## Acceptance criteria

**A test that passes against unmodified `main` is not evidence — but "every test
here is red before" is false, and an earlier draft of this spec said it.**
Measured against `efd1489` on 2026-07-25, exactly **ten** of the assertions
below are red before the change: **2** of the 95 closure cases (`-` and `_`,
and no others), **7** of the 12 Table B classes, and the single derived-alphabet
case. The rest are **regression locks** (they must be
green before *and* after; that is their job) or **oracle self-checks**. The
`Red before?` column is normative: an implementer who finds a "yes" already green,
or a "no" red, has found a spec bug and must say so in the PR rather than adjust
the test.

| Criterion | Red before? | Why |
|-----------|-------------|-----|
| baseline differential passes unmodified | **no** — regression lock | it passes before and must still pass after; that is the central proof (T11, T12) |
| `secret-scan.test.js` passes unmodified | **no** — regression lock | verified against a prototype |
| closure family, 95 cases | **2 of 95 red** | only `-` and `_` change branch. The other 93 are candidate characters or delimiters and behave identically before and after |
| token alphabet, derived | **yes** | the observed alphabet is 65 characters before, 67 after |
| Table B classes | **7 of 12 red**: B2, B3, B4, B5, B6, B9, B10 | B1, B7, B8, B11, B12 are the "no change" classes and are regression locks by construction |
| idempotence / re-entrancy | **no** — regression lock | green on all 12 inputs before |
| repeated-scan safety | **no** — regression lock | green on all 12 before; it exists to catch M5, which is a post-change mutation |
| `ScanLimits` three keys, export list byte-identical | **no** — regression lock | they must not move |
| `measure-entropy-arms.js` frozen artifacts | **no** — oracle self-check | byte-identity before and after is the point |

- [ ] `tests/unit/secret-scan-baseline.test.js` passes **unmodified**, including
      its 399-input oracle differential and its 18 `LABELLED_BASELINE`
      deep-equality cases. `git diff` shows that file untouched. (T11, T12)
- [ ] `tests/unit/secret-scan.test.js` passes **unmodified**.
- [ ] **Closure family, 95 cases.** For every printable-ASCII character `c`
      (codes 32–126), with `BLOB = '5NQywwNzM016QPy4x27M6z7310P3x524'`,
      `scanAndRedact(BLOB + c + BLOB)` returns `[REDACTED:high-entropy]` with
      `count: 1` when `c` is a token character, and
      `[REDACTED:high-entropy]<c>[REDACTED:high-entropy]` with `count: 2`
      otherwise. "Token character" is decided in the test by an **independently
      written literal**, not by importing anything:
      `const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_-'`.
      The test asserts `TOKEN_CHARS.length === 67` and that exactly **67** of the
      95 characters take the token branch.
- [ ] **The token alphabet is derived from behaviour, ONE case** (T3, T9, T10).
      Collect, from the 95 closure results above, the set of characters that
      produced **one** redaction — call it `OBSERVED`. Assert
      `[...OBSERVED].sort().join('') === [...TOKEN_CHARS].sort().join('')`, and
      assert that all **65** characters matched by `/[A-Za-z0-9+/=]/` are in
      `OBSERVED`. See "Why one derived case, not 95 literal ones" below.
- [ ] **Every class in Table B** (B1–B12) is a named test asserting the exact
      `after` text and the exact `count` from that table.
- [ ] **Idempotence / re-entrancy**: `scanAndRedact(scanAndRedact(x).text)` adds
      no `high-entropy` finding for each of the twelve Table B inputs, and
      `scanAndRedact('[REDACTED:high-entropy]')` yields zero findings.
- [ ] **Repeated-scan safety**: calling `scanAndRedact` twice on the same input
      returns `deepStrictEqual` results (guards the `lastIndex` reset).
- [ ] `ScanLimits` still has exactly the three keys `SCAN_MAX_BYTES`,
      `ENTROPY_MIN_LEN`, `ENTROPY_MIN_BITS_PER_CHAR`, with unchanged values.
- [ ] `module.exports` is byte-identical to before this WP.
- [ ] `scripts/measure-entropy-arms.js` still reproduces every frozen artifact:
      `--baseline` byte-identical to `tests/fixtures/measure-entropy-arms.baseline.txt`,
      `--passphrase` and `--uuid-forms` matching their expected blocks, and
      `--perf` printing eleven strictly-parseable rows each under 400 ms.
- [ ] `npm test` and `npm run lint` pass; no file under `tests/golden/` changes.

### Why one derived case, not 95 literal ones

The derived-alphabet criterion replaces a "subset invariant, 95 cases" family
that an earlier draft of this spec listed, **which was a spec bug by this spec's
own rule** (see the Mutation checks preamble). Both of its operands were literals
in the test file, so **no** mutation of `src/core/secret-scan.js` could redden it
and no mutation row named it — yet the gate demanded 95 passing TAP lines for it.

The replacement is behavioural: `OBSERVED` comes from the module, so the case is
red under M1, M2, M3 and M9.

State honestly what it still cannot catch. `CANDIDATE_CLASS ⊆ TOKEN_CLASS` is
true **by construction** from T3's concatenation, so the 65-character half is
unfalsifiable by any mutation that leaves T3's derivation intact — including M3's
range footgun, which still contains every candidate character. T3 is therefore
pinned **textually**, by the gate's `const TOKEN_CLASS = ...` grep, and the
65-character assertion is belt to that braces, not evidence on its own.

## Mutation checks

One-line mutation → the test that must turn **red**. Apply each mutation to the
post-change tree, confirm the named test fails, then revert it. A mutation that
leaves every test green is a spec bug: say so in the PR and stop.

| # | Mutation | Test that must turn red |
|---|----------|-------------------------|
| M1 | delete `TOKEN_EXTRA`'s `-`, i.e. `const TOKEN_EXTRA = '_';` | closure family, the `-` case (expects one redaction, gets two) |
| M2 | delete `TOKEN_EXTRA`'s `_`, i.e. `const TOKEN_EXTRA = '\\-';` | closure family, the `_` case |
| M3 | drop the escape and move the `-`: `const TOKEN_EXTRA = '-_';`, which compiles the class as `[A-Za-z0-9+/=-_]` and turns `=-_` into a range | closure family, **eight** cases — the seven range-admitted characters `>`, `?`, `@`, `[`, `\`, `]`, `^` flip from two redactions to one, **and `-` itself flips from one to two**, because a `-` used as a range operator is no longer a literal member of the class. Executed 2026-07-25; an earlier draft said seven and missed the `-`. Also red: the derived-alphabet case |
| M4 | replace `candidateFires(run)` with `bitsPerChar(run) >= ScanLimits.ENTROPY_MIN_BITS_PER_CHAR` | Table B classes **B9** and **B10** (dilution un-fires — a detection LOSS), **class B7** (the canonical UUID starts firing at 3.898 bits/char — a false-positive GAIN), and `tests/unit/secret-scan-baseline.test.js`'s 399-input differential. M4 moving detection in **both** directions at once is the strongest single argument for T7 and belongs in the PR body |
| M5 | delete `ENTROPY_CANDIDATE.lastIndex = 0;` from `candidateFires` | the repeated-scan safety test (**8 of 12** inputs differ) and the closure family (**58–59 of 95** cases fail). **Not "intermittently":** it is deterministic for a given execution order, and only *which* cases fail depends on the order in which calls run in the file, because `lastIndex` leaks between them. Executed 2026-07-25. A green run means the mutation was not applied — do not accept one |
| M6 | change the fast path to `if (run.length < 24 * 2) return run;` | Table B class **B12** (a bare 24-character run stops firing) and the 399-input differential |
| M7 | revert `entropyPass` to `text.replace(ENTROPY_CANDIDATE, …)` (i.e. undo this WP) | Table B classes **B2**, **B3**, **B4**, **B5**, **B6** |
| M8 | in `entropyPass`, replace the whole run with `run` instead of the marker while still calling `add` | Table B classes B1–B6 (text assertions) |
| M9 | add `.` to `TOKEN_EXTRA` | closure family, the `.` case (expects two redactions, gets one) |
| M10 | make `run-evidence.js` record `o.execPath` unscrubbed | the repaired `execPath` equality assertion — **macOS only**, because on Linux nothing fires and the scrubbed and unscrubbed values are identical. Stated so a green Linux run is not read as evidence. This is the mutation line 1 of that block exists to catch |
| M11 | in `run-evidence.js`, record a DIFFERENT resolved path (e.g. a sibling `evil.sh`) | the `endsWith('/ok.sh')` line of that block — **Linux only**, for the mirror-image reason: on macOS both paths redact to the same string, which is exactly why line 1 alone was not enough |

## Verification steps (run these; paste output in the PR)

This is an **executable gate**, not an observation. It exits non-zero on the
first failure. Two footguns it works around: `grep -c` prints a count but exits 1
when the count is 0, and the test runner exits non-zero when a test fails — so TAP
is captured first and every count is compared numerically.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TAP=$(mktemp)
SS=src/core/secret-scan.js

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}

# --- 0. the pre-edit base is the blob the frozen oracle copies (oracle WP, O5)
BASE=$(git merge-base HEAD origin/main)
[ "$(git rev-parse "$BASE:src/core/secret-scan.js")" \
  = 'eb273e19050037542c8beb441b8a320a3248b514' ] \
  || { echo "GATE FAIL: the detector moved after the oracle was frozen; the before/after argument is void"; exit 1; }
echo "ok: pre-edit base blob matches the frozen oracle's recorded source"

# --- 1. the frozen evidence base was NOT edited ------------------------------
need "$(git diff --name-only "$BASE" | grep -cE '^tests/(fixtures/secret-scan-|fixtures/measure-entropy-arms|unit/secret-scan-baseline|unit/secret-scan\.test)' || true)" 0 \
     "frozen oracle, corpus, baseline fixture and baseline/spot-check tests untouched"
need "$(git diff --name-only "$BASE" | grep -cxF 'scripts/measure-entropy-arms.js' || true)" 0 \
     "the measurement harness is untouched"

# --- 2. Table T: one declaration site, derived class, escaped trailing dash ---
# These four counts were executed against the finished file; they are exact.
need "$(grep -cF "const CANDIDATE_CLASS = 'A-Za-z0-9+/=';" "$SS" || true)" 1 "T1 frozen candidate class, declared once"
need "$(grep -cF "const TOKEN_EXTRA = '_\\\\-';" "$SS" || true)" 1 "T2 the two added characters, dash last and escaped"
need "$(grep -cF 'const TOKEN_CLASS = `${CANDIDATE_CLASS}${TOKEN_EXTRA}`;' "$SS" || true)" 1 "T3 token class DERIVED, not re-typed"
need "$(grep -cE '^const (CANDIDATE_CLASS|TOKEN_EXTRA|TOKEN_CLASS|ENTROPY_CANDIDATE|TOKEN_RUN) =' "$SS" || true)" 5 \
     "T1-T6 exactly five class/regex declarations — no sixth alphabet was added"
# T4: the candidate alphabet appears exactly ONCE outside comments. (`A-Za-z0-9`
# alone occurs 16 times — the labelled RULES use it — so the grep must be the
# full candidate class, and comment lines must be stripped because the header
# comment quotes the buggy `[A-Za-z0-9+/=-_]` form on purpose.)
need "$(grep -vE '^[[:space:]]*(//|\*|/\*)' "$SS" | grep -cF 'A-Za-z0-9+/=' || true)" 1 \
     "T4 the candidate alphabet appears exactly once outside comments"
# T5/T6 are NOT checked here by re-deriving the regexes in the gate — that would
# compare the spec to itself. They are checked behaviourally, by the 95-case
# closure family (TOKEN_RUN's alphabet) and by the unmodified 399-input oracle
# differential (ENTROPY_CANDIDATE's), both in step 4.

# --- 3. Table T row T14: nothing else moved ----------------------------------
need "$(grep -cE "^  (SCAN_MAX_BYTES|ENTROPY_MIN_LEN|ENTROPY_MIN_BITS_PER_CHAR):" "$SS" || true)" 3 \
     "T14 ScanLimits still has exactly three keys"
need "$(grep -cF 'module.exports = { scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY };' "$SS" || true)" 1 \
     "T14 the export list is unchanged"
need "$(grep -cE "require\('node:" "$SS" || true)" 0 "T14 the module is still dependency-free and pure"
need "$(grep -cF 'ALLOWED' "$SS" || true)" 0 "T14 no allowlist or suppression was smuggled in"
# Security checklist, second bullet: the module gained no branch that returns a
# run unredacted other than the TWO in entropyPass (the length fast path and the
# candidateFires check). This grep is what that bullet promises; without it the
# bullet asserts evidence nobody produces.
need "$(grep -c 'return run;' "$SS" || true)" 2 \
     "no third branch returns a token run unredacted"

# --- 4. the tests ------------------------------------------------------------
# Always through tests/run.js (it sets WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the
# whole suite and forwards argv), never `node --test` directly.
node tests/run.js --test-reporter=tap tests/unit/secret-scan-whole-token-runs.test.js >"$TAP" 2>&1 || true
need "$(grep -cE '^ok [0-9]+ - token-run closure: ' "$TAP" || true)" 95 "closure family cases"
need "$(grep -cE '^ok [0-9]+ - token-run alphabet: ' "$TAP" || true)" 1 \
     "derived-alphabet case (ONE behavioural test, not 95 literal-vs-literal ones)"
need "$(grep -cE '^ok [0-9]+ - token-run class B'   "$TAP" || true)" 12 "Table B class cases"
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the new file"

node tests/run.js --test-reporter=tap tests/unit/secret-scan-baseline.test.js >"$TAP" 2>&1 || true
need "$(grep -cE '^ok [0-9]+ - baseline differential: ' "$TAP" || true)" 399 "oracle differential still holds after the change"
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the frozen baseline file"

# Via tests/run.js, NEVER `node --test <file>`: run.js:7 sets
# WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the whole suite (src/scheduler/spawn.js:26
# reads it) and forwards argv. Latent rather than live for these two files today,
# but it is this repo's known trap and must not be modelled in a spec.
node tests/run.js tests/unit/secret-scan.test.js tests/unit/scheduler-runjob.test.js

# --- 5. the harness still reproduces every frozen artifact -------------------
BASEFX=tests/fixtures/measure-entropy-arms.baseline.txt
node scripts/measure-entropy-arms.js --baseline >"$TAP"
diff -u "$BASEFX" "$TAP" || { echo "GATE FAIL: --baseline drifted (it must not: it is oracle-derived)"; exit 1; }
echo "ok: --baseline byte-identical"
node scripts/measure-entropy-arms.js --uuid-forms >"$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 11 "--uuid-forms still prints eleven lines"
grep -qxF "$(printf 'bare\tno')" "$TAP" \
  || { echo "GATE FAIL: a bare canonical UUID now fires — the fire predicate moved"; exit 1; }
grep -qxF "$(printf 'session-prose\tno')" "$TAP" \
  || { echo "GATE FAIL: a prose canonical UUID now fires — the fire predicate moved"; exit 1; }
echo "ok: --uuid-forms unchanged"
node scripts/measure-entropy-arms.js --passphrase >"$TAP"
grep -qxF "$(printf 'assignment\tentropy-old\t100.00\tgate-old\t100.00')" "$TAP" \
  || { echo "GATE FAIL: --passphrase gate column moved"; exit 1; }
echo "ok: --passphrase unchanged"
node scripts/measure-entropy-arms.js --perf >"$TAP"
awk -F'\t' -v budget=400 '
  { if (NF != 3) { printf "GATE FAIL: line %d has %d fields\n", NR, NF; bad=1; next }
    if ($2 != 262144) { printf "GATE FAIL: %s bytes %s\n", $1, $2; bad=1 }
    if ($3 !~ /^[0-9]+(\.[0-9]+)?$/) { printf "GATE FAIL: %s ms %s is not finite non-negative\n", $1, $3; bad=1; next }
    if ($3 + 0 > budget) { printf "GATE FAIL: %s took %s ms\n", $1, $3; bad=1 } }
  END { if (NR != 11) { printf "GATE FAIL: %d perf rows, expected 11\n", NR; bad=1 } exit bad }' "$TAP"
echo "ok: eleven perf baits, each under 400 ms"

# --- 6. the permission boundary held ----------------------------------------
need "$(git diff --name-only "$BASE" | grep -cvE '^(src/core/secret-scan\.js|tests/unit/secret-scan-whole-token-runs\.test\.js|tests/unit/scheduler-runjob\.test\.js|docs/GLOSSARY\.md|docs/specs/WP-secret-scan-whole-token-runs\.md|package-lock\.json)$' || true)" 0 \
     "files outside the permission boundary"

# --- 7. full suite and lint --------------------------------------------------
npm test
npm run lint
echo "ALL GATES PASSED"
```

**What this gate does not do, stated plainly.** It is a script an implementer
runs locally and pastes into the PR body. Adding it to `.github/workflows/ci.yml`
is deliberately not in this WP's Deliverables, so a branch on which it was never
run can be merged and nothing will object. This WP claims **no** CI enforcement.

## Out of scope (do NOT do these)

- **Any change to the fire predicate.** Not the 3.5 bits/char floor, not the
  24-character length floor, not a per-alphabet threshold, not a hex-specific
  band. Evaluating entropy over the widened run is specifically forbidden — see
  Table B rows B9/B10 and reviewer question 1.
- **Any suppression, exemption or allowlist.** No UUID suppressor, no benign-shape
  suppressor, no context or proximity rule, no "word-shaped" discriminator, no
  coverage ratio, no precedence ladder. ADR-0033 rejects the whole shape family
  permanently; a bigram/language-model text-likeness discriminator was measured
  and rejected (11–41 false positives of 178 against a 3/178 target).
- **The exact-value allowlist itself** — the store, `spanDigest`,
  `setAllowedDigests`, the P0 suppressor. That is
  `WP-secret-allowlist-exact-value-store`, which depends on this WP.
- **Any user-facing command or review surface.** That is
  `WP-quarantine-review-cli`.
- **Any change to the EP2 / EP4 gates**, their `findings.length > 0` condition,
  the transcript ledger, or `WP-secret-revert-defers-ledger`'s deferral
  behaviour.
- **Any change to `docs/adr/0024-layered-secret-lifecycle.md` or
  `docs/adr/0033-human-ratified-exact-value-secret-allowlist.md`.** ADR-0033
  decision 1 already specifies the whole-token unit; this WP implements it and
  adds nothing to it.
- **Any change to `WP-secret-fence-shape-and-context.md`** (moved to
  `docs/specs/done/` by concurrent work; the ban holds at either path). That spec is
  superseded. Do not patch it, do not depend on it, do not implement it.
- Adding an export to `src/core/secret-scan.js` (see Implementation notes).
- Adding the gate to `.github/workflows/ci.yml`.
- Updating any file under `tests/golden/`.
- Restoring notes quarantined on 2026-07-24 or 2026-07-25 — maintainer recovery,
  tracked separately.

## Definition of done

1. `WP-secret-scan-baseline-oracle` has merged to `main`. Concretely:
   `tests/fixtures/secret-scan-legacy-entropy.js`,
   `tests/fixtures/secret-scan-corpus.js` and
   `tests/unit/secret-scan-baseline.test.js` exist on your base commit. If not,
   stop — this WP's entire proof is that file's differential still passing.
2. Gate step 0 passes: the pre-edit base blob of `src/core/secret-scan.js` is
   `eb273e19050037542c8beb441b8a320a3248b514`.
3. Every Mutation-check row was applied, observed red, and reverted; the results
   are pasted into the PR body.
4. All verification steps pass locally; output pasted into the PR body.
5. Conventional commits; PR titled
   `fix(secret-scan): redact whole delimiter-bounded token runs (WP-secret-scan-whole-token-runs)`.
6. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. The PR body must state that this WP changes **no verdict**,
   and quote the 399-input differential result.
7. This spec's `status:` flipped to `In-Review` in the same PR.
