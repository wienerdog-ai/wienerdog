---
id: WP-secret-allowlist-exact-value-store
title: Human-ratified exact-value secret allowlist — the store and the detector-wide suppressor
status: Superseded
model: opus
size: M
depends_on: [WP-secret-scan-whole-token-runs]
adrs: [ADR-0004, ADR-0019, ADR-0021, ADR-0024, ADR-0031, ADR-0033]
epic: secret-lifecycle
---

# WP-secret-allowlist-exact-value-store: the store, the guards, and the suppressor

> **SUPERSEDED 2026-07-25 — do not implement.** The store and detector-wide suppressor for a human-ratified exact-value allowlist. Superseded because an allowlist whose size grows with the corpus is not a filter, it is a to-do list: measured on the real vault it needed ~118 approvals up front, 97% of them file paths, growing with every new project folder.
>
> Replaced by `WP-secret-fence-two-tier-detector` + `WP-secret-fence-ep2-redact-arm` under ADR-0034, which scopes the
> fence to **accidental credential persistence** and fixes the one rule that
> caused 100% of the destructive false positives. Narrative:
> `docs/specs/logbook/2026-07-25-secret-fence-destructive-false-positives.md`.
>
> Everything below this line is the superseded design, preserved unedited.

---

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates the user's AI sessions into a markdown
**vault**. ADR-0024 makes every persistence boundary fail closed against secrets:
one shared detector, `scanAndRedact` in `src/core/secret-scan.js`, is called
independently at four points, and at the two that cannot safely rewrite an
artifact — **EP2**, the staged brain-output gate in `src/core/dream/validate.js`,
and **EP4**, the digest-section gate in `src/core/digest.js` — **any** finding of
**either** severity withholds the **whole** artifact.

Behind eighteen precise labelled provider rules (private-key blocks, `sk-ant-`,
`AKIA`, `gh[pousr]_`, `ya29.`, JWT, `GOCSPX-`, `sk_live_`, sensitive
assignments, and the rest) sits a **high-entropy pass**: a long enough, random
enough run of characters is labelled `high-entropy` at `quarantine` severity. A
high-entropy run is a *shape*. The user's own prose legitimately contains such
runs — a Google Drive file id is 33 or 44 base64url characters and is
indistinguishable from a credential by shape alone.

On **2026-07-24** and again on **2026-07-25** the live EP2 gate reverted three
notes each night on the maintainer's machine. One of them, a 43 737-byte state
note, contains a permanent Drive id in its body, so **every** consolidation that
touches it is reverted, indefinitely. Two shape-level remedies were measured and
both failed: a shape allowlist (`1` + 43 base64url characters) would wave through
roughly **1 in 64** uniformly random 44-character base64url credentials, and
URL-slot-anchored suppression covered **0 of 8** real occurrences while zeroing
detection inside the allowed slot. Both are rejected permanently (ADR-0033).

**ADR-0033 is the decision this WP implements**: a human-ratified, exact-value
allowlist. A person reviews what the gate withheld and permanently approves
specific, unique values, so the same benign value is not filtered again and
again — while the fence itself stays intact. Entries are `sha256` digests of a
whole matched **token run**, never the raw value, for two reasons: a file of raw
high-entropy strings would trip the scanner itself and leak into digests and
logs, and a whole-run digest is **structurally incapable** of degenerating into
the rejected shape rule (no globs, no prefixes, no lengths — only whole-value
equality).

This WP builds the **store**, the **two guards**, the **suppressor**, and the
read-only review surface the successor CLI consumes. The human-facing review and
approval commands are `WP-quarantine-review-cli`; until it lands, nothing can
write the store, so this WP is inert on a user machine by construction.

**IRON RULE (ADR-0004): Wienerdog is just files.** No process, no daemon, no
telemetry. One 0600 JSON file and two pure-ish modules.

### Three things that will look wrong unless you read this

1. **`WP-secret-fence-shape-and-context` is superseded and was never
   implemented.** Six adversarial review rounds produced a fail-open critical in
   five consecutive ones. Anything you read about a `SPAN_RUN` constant, a
   `DELIM_ALL` constant, an `entropyRegions` function, a `consider` function, a
   P1–P5 precedence ladder or an `insideSuppressedUuid` helper describes that
   dead spec. **None of those symbols exist and none will.** Do not patch that
   spec, do not implement it, do not depend on it.
2. **This WP depends on `WP-secret-scan-whole-token-runs` for a structural
   reason.** ADR-0033 decision 1 hashes *"the exact UTF-8 bytes of one maximal
   detector run (the whole delimiter-bounded token the entropy pass matched)"*.
   On the detector as it stands **before** that WP, the entropy candidate
   alphabet is `[A-Za-z0-9+/=]`, which **excludes `-` and `_`** — so a base64url
   Drive id is matched as *fragments*, and a digest over a fragment is a shape
   rule wearing a digest costume. That WP makes the matched unit a whole token
   run; only then does "this exact value" mean anything. (The pre-edit blob-hash
   obligation from `WP-secret-scan-baseline-oracle`'s Table O row O5 also
   belongs to that WP, and is discharged in its gate, not here.)
3. **There is no ladder rung and no range arithmetic in this WP.** Earlier
   drafts of this spec planned a "P0 rung" inserted into a precedence ladder,
   plus a binary search over suppressed ranges to stop an approved value's own
   sub-spans from firing. Both were artefacts of the dead fence design. The
   shipped detector considers exactly one kind of span — one maximal token run —
   so a sub-span is never separately considered and ADR-0033 decision 2's
   containment scoping holds **structurally, with no code**. The suppressor is
   one line.

## Current state

### `src/core/secret-scan.js` — as `WP-secret-scan-whole-token-runs` leaves it

Read the file before you start. Every claim below was verified against the
shipped file at `efd1489` plus exactly what that WP's "Exact contracts" section
adds; nothing else is assumed.

Unchanged by that WP and unchanged by this one:

| Where | What |
|-------|------|
| `ScanLimits` | **exactly three keys**: `SCAN_MAX_BYTES: 256 * 1024`, `ENTROPY_MIN_LEN: 24`, `ENTROPY_MIN_BITS_PER_CHAR: 3.5`. **This WP adds no key and changes no value.** |
| `SEVERITY` | `{ REDACT: 'redact', QUARANTINE: 'quarantine' }` |
| `RULES` | the eighteen labelled rules. **Untouched: not their patterns, not their order, not their labels or severities.** |
| `bitsPerChar(run)` | Shannon entropy over the run |
| `scanAndRedact(text)` | runs `RULES` first, then `entropyPass`, inside one `try`; total and fail-closed (non-string → `{text:'', findings:[]}`; over `SCAN_MAX_BYTES` → the fixed oversized marker plus an `oversized` finding; any internal error → the fixed scan-failed marker plus a `scan-error` finding; never a throw, never the raw text) |
| `redactOnly`, `hasHardFinding` | unchanged |
| module purity | no `fs`, no env, no argv, no network. It requires nothing today |

Introduced by `WP-secret-scan-whole-token-runs`, and the only part this WP
touches:

```js
const CANDIDATE_CLASS = 'A-Za-z0-9+/=';
const TOKEN_EXTRA = '_\\-';
const TOKEN_CLASS = `${CANDIDATE_CLASS}${TOKEN_EXTRA}`;

const ENTROPY_CANDIDATE = new RegExp(`[${CANDIDATE_CLASS}]{${ScanLimits.ENTROPY_MIN_LEN},}`, 'g');
const TOKEN_RUN = new RegExp(`[${TOKEN_CLASS}]+`, 'g');

function candidateFires(run) {
  ENTROPY_CANDIDATE.lastIndex = 0;
  let m;
  while ((m = ENTROPY_CANDIDATE.exec(run)) !== null) {
    if (bitsPerChar(m[0]) >= ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return true;
  }
  return false;
}

function entropyPass(text, add) {
  return text.replace(TOKEN_RUN, (run) => {
    if (run.length < ScanLimits.ENTROPY_MIN_LEN) return run;
    if (!candidateFires(run)) return run;
    add('high-entropy', SEVERITY.QUARANTINE);
    return '[REDACTED:high-entropy]';
  });
}
```

Three properties of that shape are load-bearing for this WP:

- **The unit is one maximal `TOKEN_RUN` match** — a whole delimiter-bounded
  token. There is no other kind of span, so nothing smaller ever fires and
  ADR-0033 decision 2 needs no code (Table C row C4).
- **`candidateFires` is context-free over the run.** A run's verdict depends only
  on the run's own bytes, never on what surrounds it. That is what makes guard 2
  sound: scanning a candidate value *alone* gives exactly the verdict the
  suppressor will later see in context (Table D row D6).
- **`RULES` runs before `entropyPass`** and replaces every labelled match with
  `[REDACTED:<label>]`. By the time the entropy pass sees the text, the bytes a
  rule **consumed** are already gone. That is guard 1a (Table D row D1a) — an
  ordering property, not a check that could be forgotten. It is **not** the same
  as "a credential is gone": several rules' value classes are narrower than
  `TOKEN_CLASS`, so a rule truncates and leaves a tail behind. That gap is closed
  separately, by Table D row D1b.

The export list before this WP is exactly:

```js
module.exports = { scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY };
```

### `src/core/identity-approvals.js` — the shape to mirror

Read this file first; ADR-0033 decision 8 says the new store is the same shape
family, in a separate file. The parts to copy (verified at `efd1489`, lines
73–102):

```js
function readRegistry(stateDir) {           // missing/corrupt/malformed → {version:1, approvals:{}}
  try { const obj = JSON.parse(fs.readFileSync(registryPath(stateDir), 'utf8'));
        if (/* plain-object shape checks */) return { version: 1, approvals: obj.approvals };
  } catch { /* fall through */ }
  return { version: 1, approvals: {} };     // fail closed: nothing approved
}

function writeRegistry(stateDir, registry) { // atomic temp + rename + chmod, 0600 in a 0700 dir
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const dest = registryPath(stateDir);
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, approvals: registry.approvals }, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, dest);
  fs.chmodSync(dest, 0o600);
}
```

Two behavioural rules from that file are binding precedent here:

- **`recordApproval` is the human ratification path** (`wienerdog memory
  approve`, TTY-only, no `--yes`, no environment bypass) and is the only writer
  that may overwrite a record.
- **`seedApprovals` NEVER re-seeds an existing record** — "a change requires
  `memory approve`". ADR-0021 Amendment 1 records the P0 behind that rule:
  `seedApprovals` auto-trusted **any** unrecorded identity file on every `sync`,
  with no TTY and no bytes shown, which was only ever safe while the WP-112
  freeze guaranteed the dream could not author those files. **Do not repeat that
  class of mistake here.** Nothing in this WP writes the allowlist at all.

Note also what that file does **not** export: `writeRegistry` *is* exported
there, and that is a wart this WP deliberately does not copy — see Table B.

### `bin/wienerdog.js`

83 lines. A thin dispatcher: a `USAGE` string, a `help` / `--help` / `-h` branch
that returns early, a hidden `gws _broker` branch that returns early, then a
`commands` map of lazy `require`s and `await loader().run(rest)`. It is on
**every** production path — the independent launcher spawns
`node <app>/bin/wienerdog.js run-job <name>`, and `run-job` in turn spawns
`node <app>/bin/wienerdog.js dream --yes` — so a single wiring point here covers
every command that scans, **provided it is placed before the two early
returns** (Table C row C6).

### The `redactOnly` sinks

`grep -rn "secret-scan" src bin` at `efd1489` returns exactly seven consumers:
`src/cli/run-job.js:13`, `src/core/alerts.js:6`, `src/core/digest.js:11`,
`src/core/dream/brain.js:7`, `src/core/dream/validate.js:14`,
`src/core/run-evidence.js:19`, `src/core/transcripts/index.js:8`. None of them
inspects a finding's `count`; EP2 and EP4 gate on `findings.length > 0` and the
five `redactOnly` callers discard findings entirely.

### Uninstall

`state/` is one of the four **core mechanics dirs** that `manifest.js`
`disposeCoreMechanics` removes wholesale on `wienerdog uninstall` (ADR-0019),
alongside `logs/`, `schedules/` and `secrets/`. A runtime-created file in
`state/` is therefore already fully reversible and needs **no** install-manifest
entry — exactly like `identity-approvals.json` and `transcript-ledger.json`.
**Do not add a manifest entry for the allowlist.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/secret-allowlist.js | the store: Table A file format, Table B API, Table D guard 2, and the write lock of Table B row B9. Requires `node:fs`, `node:path`, `./errors`, `./secret-scan` — nothing else |
| modify | src/core/secret-scan.js | add `require('node:crypto')`; add `spanDigest`; add the process-scoped allowed-digest set with `setAllowedDigests` / `clearAllowedDigests` / `allowedDigestCount`; add the **one-line suppressor** to `entropyPass` per Table C row C5; add `approvableRuns` **including its `if (labelled) return [];` short-circuit (Table D row D1b)**; extend the export list. `ScanLimits`, `RULES`, `bitsPerChar`, `CANDIDATE_CLASS`, `TOKEN_EXTRA`, `TOKEN_CLASS`, `ENTROPY_CANDIDATE`, `TOKEN_RUN`, `candidateFires`, `redactOnly`, `hasHardFinding` and `scanAndRedact`'s structure are unchanged |
| modify | bin/wienerdog.js | install the allowed digests once, at the **top of `main()`**, per Table C row C6. No `USAGE` change |
| modify | docs/GLOSSARY.md | ONE new bullet, **secret allowlist**, placed immediately after the existing **secret quarantine** bullet. Exact text below |
| create | tests/unit/secret-allowlist.test.js | Tables A, B and D, **plus the Table C round-trip** (the producer/consumer chain crosses both modules, and this is the file that requires both) |
| modify | tests/unit/secret-scan.test.js | Table C. Change no existing test |

**Do not create, modify or delete anything else.** In particular: not
`tests/unit/secret-scan-whole-token-runs.test.js`, not
`tests/unit/secret-scan-baseline.test.js`, not either fixture under
`tests/fixtures/`, not `scripts/measure-entropy-arms.js`, not `src/core/manifest.js`,
not any ADR, not any other spec.

### Exact contracts

#### `src/core/secret-scan.js` — `spanDigest` and the process-scoped set

```js
const crypto = require('node:crypto');

/** The allowlist key for one value: sha256 over its EXACT UTF-8 bytes, hex,
 *  lowercase. No normalization of any kind — no trimming, no case-folding, no
 *  Unicode normalization. Normalizing before hashing collides distinct byte
 *  sequences (ADR-0021's recorded lesson) and would turn whole-value equality
 *  into a shape rule.
 *
 *  This is the ONE producer of an allowlist key. src/core/secret-allowlist.js
 *  calls it rather than hashing independently, because two producers that must
 *  agree byte-for-byte is exactly how a silent no-op suppression happens.
 *  @param {string} value @returns {string} 64 lowercase hex characters */
function spanDigest(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

/** Process-scoped set of human-ratified value digests (ADR-0033). EMPTY by
 *  default — a caller that never installs one gets exactly today's behaviour,
 *  which is the fail-closed default. The module stays pure: this is an injected
 *  parameter installed once by bin/wienerdog.js, not a file the module reads.
 *  It is a SNAPSHOT: see Table C row C7. */
let ALLOWED_DIGESTS = new Set();

/** Replace the process-scoped allowed set. Non-conforming members are DROPPED
 *  (fail closed): only 64-character lowercase hex strings are accepted.
 *  @param {Iterable<string>} digests */
function setAllowedDigests(digests) {
  const next = new Set();
  for (const d of digests || []) {
    if (typeof d === 'string' && /^[0-9a-f]{64}$/.test(d)) next.add(d);
  }
  ALLOWED_DIGESTS = next;
}

/** Clear the process-scoped allowed set (tests, and any caller that must scan
 *  with no suppression). */
function clearAllowedDigests() { ALLOWED_DIGESTS = new Set(); }

/** @returns {number} how many digests are currently installed. */
function allowedDigestCount() { return ALLOWED_DIGESTS.size; }
```

#### `src/core/secret-scan.js` — the suppressor

`entropyPass` gains **one** guard clause. Nothing else in the function changes,
and no other function in the module changes.

```js
function entropyPass(text, add) {
  return text.replace(TOKEN_RUN, (run) => {
    if (run.length < ScanLimits.ENTROPY_MIN_LEN) return run;
    if (!candidateFires(run)) return run;
    // ADR-0033: a token run whose EXACT bytes a human ratified at a terminal is
    // not a finding. Scoping is structural — the unit IS the whole run, so an
    // approved value has no sub-spans left firing (decision 2, Table C row C4).
    // It can never suppress a labelled provider match: RULES already replaced
    // those before this pass ran (Table D row D1a).
    //
    // ORDER IS LOAD-BEARING: this check runs AFTER candidateFires, so we hash
    // only what would actually have produced a finding. Hoisting it above
    // candidateFires would sha256 every token run that clears the length floor,
    // including the ones that never fire. Measured (Node v25.9.0, macOS,
    // 2026-07-25) on a 256 KiB input of 32-character LOW-entropy token runs
    // (7,944 runs, none firing): 7.2 ms in this order, 12.6 ms hoisted. Short
    // runs cost nothing either way — the length floor above returns first.
    if (ALLOWED_DIGESTS.size > 0 && ALLOWED_DIGESTS.has(spanDigest(run))) return run;
    add('high-entropy', SEVERITY.QUARANTINE);
    return '[REDACTED:high-entropy]';
  });
}
```

#### `src/core/secret-scan.js` — `approvableRuns`

The review surface the successor CLI consumes. It returns **raw values**; it is
deliberately not a findings surface, and **this WP adds no caller for it**
(Table C row C9).

```js
/**
 * The token runs in `text` that the high-entropy pass would redact — the ONLY
 * values the exact-value allowlist may approve (ADR-0033).
 *
 * ALL-OR-NOTHING ON LABELLED FINDINGS (Table D row D1b, owner decision
 * 2026-07-25). If the labelled provider RULES matched ANYWHERE in `text`, this
 * returns []. Not the runs near the match — ALL of them, for the whole input.
 * Several rules' value classes are NARROWER than TOKEN_CLASS, so a rule
 * truncates the credential and its remainder becomes a fresh maximal token run
 * that a per-run test cannot tell from a Drive id. See "The truncated-tail
 * residue" below. There is no adjacency test and no position logic here: a
 * blunt rule that is provable in one line beats a precise one nobody can prove.
 *
 * Otherwise: computed on the text AFTER RULES ran, runs already covered by an
 * installed digest omitted, de-duplicated by digest, first-appearance order.
 *
 * REVIEW SURFACE ONLY. Unlike a finding, an element carries the matched bytes,
 * so its output must never be written to a durable artifact — it exists so a
 * human at a terminal can read what was withheld. Bounded exactly like
 * scanAndRedact: input over SCAN_MAX_BYTES, a non-string, or any internal error
 * returns [].
 *
 * @param {string} text
 * @param {number} [contextChars=60] characters of surrounding post-RULES text
 * @returns {Array<{value:string, digest:string, before:string, after:string}>}
 */
function approvableRuns(text, contextChars = 60)
```

Implementation shape, in full — it is short because the unit is a single regex
match:

1. Return `[]` for a non-string, for `''`, or when
   `Buffer.byteLength(text, 'utf8') > ScanLimits.SCAN_MAX_BYTES`. Wrap the whole
   body in `try { … } catch { return []; }`.
2. Run `RULES` over a copy to get `post`, exactly as `scanAndRedact` does, but
   with an `add` that records that a labelled rule fired:
   `let labelled = false; const add = () => { labelled = true; };`
3. **`if (labelled) return [];`** — the whole input is unapprovable. This is the
   one line that makes Table D row D1b's guarantee true as stated.
4. Walk `TOKEN_RUN` over `post`. For each match `m`, skip it unless
   `m[0].length >= ScanLimits.ENTROPY_MIN_LEN && candidateFires(m[0])`.
5. Compute `digest = spanDigest(m[0])`; skip if `ALLOWED_DIGESTS.has(digest)` or
   if the digest was already emitted.
6. Emit `{ value: m[0], digest, before: post.slice(Math.max(0, m.index - contextChars), m.index), after: post.slice(m.index + m[0].length, m.index + m[0].length + contextChars) }`.

#### The truncated-tail residue, and why step 3 is blunt on purpose

This is the reason step 3 exists. Read it before you are tempted to replace it
with something smarter.

Several `RULES` value classes are **narrower than `TOKEN_CLASS`**, verified in
`src/core/secret-scan.js` at `efd1489`: `sk-proj-[A-Za-z0-9_]{16,}` (line 97) and
`sk-[A-Za-z0-9_]{20,}` (line 98) exclude `-`; `AKIA[0-9A-Z]{12,}` (line 99)
excludes lowercase, `_` and `-`; `gh[pousr]_[A-Za-z0-9]{36,}` (line 100) and
`(?:sk|rk)_live_[A-Za-z0-9]{10,}` (line 151) exclude `_ - + / =`; the legacy
assignment class `[A-Za-z0-9_\-]{12,}` (line 117) excludes `+ / =`. So the rule
consumes a **prefix** of the credential and stops; the remainder is left in
`post`, becomes its own maximal token run, and fires `high-entropy` on its own
bytes. Executed against a prototype on 2026-07-25:

```text
input          my key is sk-proj-ABCDEFGHIJKLMNOP-Xk9Lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ ok
scanAndRedact  my key is [REDACTED:openai-key][REDACTED:high-entropy] ok
without step 3 approvableRuns offers "-Xk9Lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ"
               → 33 of the credential's 57 characters, verbatim, in every
                 redactOnly sink once approved
with step 3    approvableRuns returns []
```

The same shape reproduces on `sk-`, `AKIA`, `gh[pousr]_` and `sk_live_`: five
rules measured, five tails offered without step 3 (33, 33, 34, 27 and 34
characters), zero with it. The five vectors are pinned in the Acceptance
criteria.

**`assertAllowable` can never catch this.** It is context-free by construction
(Table D row D6) — it sees the bare tail, which really is exactly one
`high-entropy` finding, so it accepts. That is not a bug in D2; it is D2 working
as specified. The defence has to be at the point where a value is *offered*.

**Why not an adjacency filter** ("drop a run whose `before` ends in
`[REDACTED:<label>]`"): that is selective extraction under suppression, which is
precisely the shape `WP-secret-fence-shape-and-context` spent six adversarial
review rounds proving fail-open. Every variant of it needs a position argument
that must hold for eighteen rules and every rule added later. Owner decision
2026-07-25: **do not substitute a cleverer rule.**

**The accepted cost, stated by the owner.** A note containing one labelled
provider match offers **no** approvable values at all — not even ones far away
from it. The user removes the credential from the note, then approves.

**Measured on the maintainer's real vault, 2026-07-25** (181 notes): exactly
**one** note contains a labelled finding, and it is
`01-Projects/wienerdog/current-state.md` — the note ADR-0033 exists to unblock.
Its labelled finding is a **single 20-character `AKIA…` match** — measured; that
note documents this detector, so it is near-certainly a quoted example rather
than a live key, but the owner should confirm before editing it. The same note
holds **16 of the vault's 118** distinct approvable units. So on today's vault step 3 costs
118 → **102** approvable units, all 16 lost from that one note, and that note
stays quarantined until its example credential is edited out. Recorded, not
worked around: the remedy is the owner's stated one.

**The successor must not report this as "nothing to approve."** `approvableRuns`
returns `[]` in two different situations and the CLI must tell them apart. It can,
without any change here: `scanAndRedact(text).findings` shows the labelled
findings. See "Known successor impact".

Export list becomes exactly:

```js
module.exports = {
  scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY,
  spanDigest, setAllowedDigests, clearAllowedDigests, allowedDigestCount, approvableRuns,
};
```

#### `src/core/secret-allowlist.js` (new)

```js
'use strict';
// The human-ratified exact-value secret allowlist (ADR-0033): a code-owned 0600
// JSON file recording the sha256 of values a person reviewed at a terminal and
// permanently approved. Entries are digests, never raw values. It may only ever
// suppress a `high-entropy` finding — never a labelled provider match.
//
// NOTHING UNATTENDED WRITES THIS FILE. The dream never writes it; `sync` never
// seeds it; no skill, hook, or scheduled job writes it. ADR-0021 Amendment 1
// records why (the seedApprovals auto-seed P0). The only writer is the
// interactive, TTY-confirmed CLI path.
//
// There is deliberately NO exported raw writer. Every mutation goes through
// recordAllowed or removeAllowed, both of which take the write lock and, in
// recordAllowed's case, run assertAllowable first. A caller cannot seed an
// arbitrary digest because there is no function that would let it.

const ALLOWLIST_BASENAME = 'secret-allowlist.json';   // module-internal
const MAX_LABEL_CHARS = 120;                          // module-internal

/** @typedef {{version:1, entries: Record<string, unknown>}} Allowlist */

// --- module-internal, NOT exported -----------------------------------------
/** @param {string} stateDir @returns {string} */
function allowlistPath(stateDir)
/** @param {string} stateDir @returns {string} */
function lockPath(stateDir)
/** Atomically persist at 0600 in a 0700 state dir (temp + rename + chmod),
 *  mirroring identity-approvals.writeRegistry. Callers MUST hold the lock.
 *  @param {string} stateDir @param {Allowlist} allowlist */
function writeAllowlist(stateDir, allowlist)
/** Table A row A9: does this key/value pair authorize suppression?
 *  @param {string} key @param {unknown} value @returns {boolean} */
function isAuthorizingEntry(key, value)
/** Table B row B9: run `fn` while holding an O_EXCL lockfile.
 *  @template T @param {string} stateDir @param {() => T} fn @returns {T} */
function withWriteLock(stateDir, fn)

// --- exported ---------------------------------------------------------------
/** Read the allowlist. Missing/corrupt/malformed → {version:1, entries:{}} —
 *  fail closed (a damaged store suppresses nothing). Never throws. `entries` is
 *  returned AS FOUND, never repaired, so removeAllowed can delete a conforming
 *  key whose value is non-conforming; conformance is decided by allowedDigests.
 *  A CALLER THAT RENDERS AN ENTRY MUST RENDER normalizeLabel(entry.label), NOT
 *  entry.label: a hand-edited file may hold control characters here (A9a).
 *  @param {string} stateDir @returns {Allowlist} */
function readAllowlist(stateDir)

/** The keys the detector consumes. Returns a key ONLY when the whole entry
 *  validates (Table A row A9) — a malformed value grants nothing.
 *  @param {string} stateDir @returns {string[]} */
function allowedDigests(stateDir)

/** Bound and sanitize a human-written label: strip C0/C1 control characters
 *  (including newlines), collapse runs of whitespace to one space, trim, cap at
 *  MAX_LABEL_CHARS. Non-ASCII is preserved ("Templom köz Drive folder id").
 *  @param {string} label @returns {string} */
function normalizeLabel(label)

/** GUARD 2 (Table D row D2). Throw unless `value` is allowable: a non-empty
 *  string whose own scanAndRedact produces EXACTLY ONE finding whose label is
 *  'high-entropy'. Anything else — zero findings, more than one finding, or any
 *  other label — is refused. Lives in the store, not the CLI, so it holds for
 *  every future caller.
 *  @param {string} value @throws {WienerdogError} */
function assertAllowable(value)

/** Record one approved value. Under the write lock: assertAllowable(value),
 *  then a non-empty normalized label is required, then read-modify-write.
 *  Never overwrites an existing entry's approved_at (a re-approval of the same
 *  value is a no-op that reports created:false). Persists only when something
 *  changed.
 *  @param {string} stateDir @param {string} value @param {string} label
 *  @returns {{digest:string, created:boolean}}
 *  @throws {WienerdogError} when the value is not allowable, when the label is
 *          empty after normalization, or when the lock is held */
function recordAllowed(stateDir, value, label)

/** Remove the single entry whose key starts with `digestPrefix` (>= 12
 *  lowercase hex characters), under the write lock. Matches over EVERY key in
 *  the file as read, not only the ones allowedDigests validated, so a CONFORMING
 *  key whose VALUE is corrupt can be cleaned up. A key that is not itself
 *  /^[0-9a-f]{64}$/ is unreachable by any accepted prefix and stays — it is
 *  inert, and the remedy is deleting the file (Table B row B6). Throws on a
 *  short prefix, on a non-hex prefix, on no match, and on an ambiguous match
 *  (listing the full keys).
 *  @param {string} stateDir @param {string} digestPrefix
 *  @returns {{digest:string, label:string}} `label` is '' when the removed
 *           entry had none */
function removeAllowed(stateDir, digestPrefix)

module.exports = {
  readAllowlist, allowedDigests, normalizeLabel,
  assertAllowable, recordAllowed, removeAllowed,
};
```

`src/core/secret-allowlist.js` requires `src/core/secret-scan.js` and never the
other way round — `spanDigest` lives in `secret-scan.js` precisely so there is no
cycle **and** so there is exactly one producer of a digest.

#### The write lock (Table B row B9)

```js
/** Serialize read-modify-write against another attended writer. An O_EXCL
 *  lockfile, no retry loop, no timeout, no staleness heuristic: both writers are
 *  human-driven TTY commands, so genuine contention is a second terminal, and a
 *  leaked lock (only possible after a hard kill mid-write) must be a visible
 *  refusal a human clears, not a timer that silently proceeds. Refusing fails in
 *  the safe direction — no new suppression can be added while the lock is held.
 *  Readers take no lock: writeAllowlist renames atomically, so a reader always
 *  sees one whole file. */
function withWriteLock(stateDir, fn) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  let fd;
  try {
    fd = fs.openSync(lockPath(stateDir), 'wx', 0o600);
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      throw new WienerdogError(
        `another wienerdog command is updating the secret allowlist. If none is running, remove ${lockPath(stateDir)} and try again.`,
      );
    }
    throw err;
  }
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch { /* ignore */ }
    try { fs.unlinkSync(lockPath(stateDir)); } catch { /* ignore */ }
  }
}
```

`recordAllowed` and `removeAllowed` each call `readAllowlist` **inside** `fn`, so
the whole read-modify-write is serialized. Nothing else takes the lock.

#### `bin/wienerdog.js` — the single install point

Insert at the **top of `main()`**, immediately after
`const rest = argv.slice(1);` and **before** the `help` branch and the
`gws _broker` branch:

```js
  // Install the human-ratified exact-value secret allowlist (ADR-0033) for
  // EVERY command, before any dispatch or early return: suppression is
  // DETECTOR-WIDE (ADR-0033 decision 6), so it must not depend on which command
  // happens to scan — including the hidden `gws _broker` path, which returns
  // before the commands map. Any failure leaves the set empty — fail closed,
  // nothing suppressed. Never writes.
  try {
    const { getPaths } = require('../src/core/paths');
    const { allowedDigests } = require('../src/core/secret-allowlist');
    require('../src/core/secret-scan').setAllowedDigests(allowedDigests(getPaths().state));
  } catch {
    /* fail closed: no suppression */
  }
```

#### `docs/GLOSSARY.md` — the new bullet

Insert immediately after the existing **secret quarantine** bullet:

```markdown
- **secret allowlist** — the code-owned, 0600 record
  (`~/.wienerdog/state/secret-allowlist.json`) of `sha256` digests of specific
  values a human reviewed at a terminal and permanently approved as not-secret
  (ADR-0033). Entries are whole **token run** digests, never raw values and
  never shapes; an entry may only suppress a `high-entropy` finding, never a
  labelled provider match. Suppression is detector-wide — an approved value also
  stops being redacted in alerts, run evidence, logs and the pre-brain
  transcript pass. Nothing unattended writes it: the dream never does, `sync`
  never seeds it. (Not: "exception list", "ignore list", "whitelist".)
```

## Contract reference

The ADR-0031 activation trigger fires on five of seven: **(i)** an interface
shape changes (`secret-scan.js` gains five exports and a process-scoped input);
**(iii)** a persisted file format is introduced and validated; **(iv)**
refusal/precedence behaviour changes (a new suppression clause plus two guards
with fixed refusal semantics); **(v)** the task crosses an authority boundary
(an attended CLI in a successor WP writes what an unattended detector reads);
**(vi)** a successor spec (`WP-quarantine-review-cli`) inherits every contract
here.

### Table A — `state/secret-allowlist.json` (canonical)

| Row | Fact | Value |
|-----|------|-------|
| A1 | path | `<stateDir>/secret-allowlist.json`, i.e. `~/.wienerdog/state/secret-allowlist.json` |
| A2 | modes | file `0600`, created inside a `0700` `state/` dir, written temp + rename + chmod |
| A3 | top-level shape | `{ "version": 1, "entries": { … } }` |
| A4 | entry key | `sha256` hex, **lowercase, 64 characters**, over the **exact UTF-8 bytes** of one maximal token run. No normalization of any kind before hashing |
| A5 | entry value | `{ "label": string, "approved_at": ISO-8601 string, "source": "approved" }` |
| A6 | `label` | human-written provenance note, `normalizeLabel`-bounded: control characters stripped, whitespace collapsed, trimmed, <= 120 characters. May be non-ASCII. **Must be non-empty after normalization** — `recordAllowed` refuses an empty one, because an entry with no provenance note is an entry with no audit trail |
| A7 | `source` | always the literal `"approved"`. There is no `"setup"`, no `"auto"`, no seeded source. Nothing unattended may create an entry |
| A8 | **file-level** read failure | missing / unreadable / not an object / `entries` not a plain object / any JSON error → `{version:1, entries:{}}`. **Fail closed: nothing suppressed** |
| A9 | **entry-level** validation | `allowedDigests` returns a key **only when the whole entry conforms**: the key matches `/^[0-9a-f]{64}$/` **and** the value is a non-array plain object **and** `typeof value.label === 'string'` **and** `value.label !== ''` **and** `normalizeLabel(value.label) === value.label` **and** `typeof value.approved_at === 'string'` **and** `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.approved_at)` **and** `Number.isFinite(Date.parse(value.approved_at))` **and** `value.source === 'approved'`. **Validation is total over keys and values.** `{"<64 hex>": null}`, `{"<64 hex>": "x"}`, a missing `label`, an empty `label`, a label carrying a control character / a newline / more than 120 characters, a missing `approved_at`, `"not a date"`, the `Date.parse`-accepting `"1"`, or any other `source` all yield **nothing** |
| A9a | **why the label predicate is `normalizeLabel(x) === x`, not "non-empty string"** | `recordAllowed` always writes `normalizeLabel(label)`, and `normalizeLabel` is idempotent, so every entry the store writes passes. A **hand-edited** entry does not: a 5 000-character label, a label containing `\n`, and a label containing a raw `\x1b]0;…\x07` terminal escape are all non-empty strings, and under a "non-empty string" test they would **authorize suppression** and then be rendered to a terminal by the review CLI. This predicate refuses them without repairing anything (A10) |
| A9b | **why `approved_at` needs a shape, not just `Date.parse`** | `Date.parse('1')` and `Date.parse('0')` are finite, so `Number.isFinite(Date.parse(...))` alone does not enforce the ISO-8601 contract A5 states. The pinned regex is exactly what `new Date().toISOString()` emits, which is exactly what `recordAllowed` writes |
| A10 | a non-conforming entry is **inert, not repaired** | it grants no suppression (A9), it is never rewritten, and it is never deleted by a read. `readAllowlist` still returns it so `removeAllowed` can clean up **a conforming key whose value is non-conforming** — see Table B row B6 for the limit of that, which is real and deliberate |
| A11 | uninstall | reversed by `disposeCoreMechanics`'s wholesale removal of `state/` (ADR-0019). **No install-manifest entry** |
| A12 | what is never stored | the raw value; any prefix, suffix, length, character class, glob or regex; any file path; any surrounding context |
| A13 | the lockfile | `<stateDir>/secret-allowlist.json.lock`, `0600`, created `O_EXCL`, removed in a `finally`. Held only around a read-modify-write. Never read for content |

Example file:

```json
{
  "version": 1,
  "entries": {
    "9f2c1a7e4b0d6538a1c94e7f2b8d05613ac7f9e2d4b81605c3a7e9f21d8b4c60": {
      "label": "Templom köz Drive folder id",
      "approved_at": "2026-07-25T09:14:02.113Z",
      "source": "approved"
    }
  }
}
```

### Table B — `src/core/secret-allowlist.js` API (canonical)

**Only six functions are exported, and that is a security property, not a style
choice.** Every earlier draft of this spec exported a raw `writeAllowlist`
alongside `assertAllowable`, which made the guard advisory: any caller could
persist an arbitrary digest without ever passing it. The audit below asks of each
symbol "which real caller needs this?" and exports nothing that fails the
question.

| Row | Symbol | Exported? | Contract |
|-----|--------|-----------|----------|
| B1 | `readAllowlist(stateDir)` | **yes** — `WP-quarantine-review-cli` resolves a prefix against entries and displays label + `approved_at` | Table A rows A8, A10. Never throws |
| B2 | `allowedDigests(stateDir)` | **yes** — `bin/wienerdog.js` installs from it | Table A row A9; returns `string[]`, never throws |
| B3 | `normalizeLabel(label)` | **yes** — the CLI must detect an empty-after-normalization label to re-prompt before calling `recordAllowed` | Table A row A6 |
| B4 | `assertAllowable(value)` | **yes** — the CLI checks at resolve time, before displaying anything | Table D row D2. Throws `WienerdogError`; returns nothing on success |
| B5 | `recordAllowed(stateDir, value, label)` | **yes** | inside `withWriteLock`: `assertAllowable(value)` **first**; then refuse when `normalizeLabel(label)` is `''`; then `digest = spanDigest(value)`; if the digest already has an entry, return `{digest, created:false}` and write nothing; else add `{label: normalizeLabel(label), approved_at: new Date().toISOString(), source:'approved'}`, persist, return `{digest, created:true}` |
| B6 | `removeAllowed(stateDir, digestPrefix)` | **yes** | inside `withWriteLock`: refuse a prefix shorter than 12 characters or not `/^[0-9a-f]+$/`; refuse no match; refuse an ambiguous match, naming every full key that matched; otherwise delete the entry, persist, return `{digest, label}`. Prefix matching runs over **every key in the file as read**, not over the keys `allowedDigests` validated — that is what lets it remove **a conforming key whose value is non-conforming** (A10), which is the corruption a hand-edit actually produces. **Reach limit, stated because it is a consequence, not an oversight:** a key that is not itself `/^[0-9a-f]{64}$/` — non-hex, or uppercase hex — is **unreachable by any prefix that passes the guard above**, and A10 forbids repair-on-read, so it stays in the file permanently. It is inert (A9 grants it nothing) and the remedy is deleting the whole file, which fails closed (A8). Widening the prefix charset to reach it was considered and rejected: it buys the ability to delete a string that already does nothing, at the cost of a validation surface on the one input that names a file's contents |
| B7 | `writeAllowlist(stateDir, allowlist)` | **NO** | module-internal. Exporting it defeats `assertAllowable` entirely, because a caller could persist any object |
| B8 | `allowlistPath`, `lockPath`, `ALLOWLIST_BASENAME`, `MAX_LABEL_CHARS`, `isAuthorizingEntry` | **NO** | no caller needs them. Tests assert the filename by writing the literal `'secret-allowlist.json'` themselves, which is *better* evidence — a test that imports the constant it is checking proves nothing |
| B9 | `withWriteLock` | **NO** | module-internal. `recordAllowed` and `removeAllowed` are the only two call sites, and no third may be added. An `O_EXCL` lockfile, no retries, no staleness heuristic; contention is a `WienerdogError` naming the lockfile. This closes the **resurrection** race: without it, a `removeAllowed` landing between another process's read and write is silently undone, which is the worst possible failure for this feature |
| B10 | who may call B5/B6 | — | **only** an attended TTY-confirmed CLI path (`WP-quarantine-review-cli`). Never the dream, never `sync`, never a skill, hook or scheduled job |
| B11 | `approvableRuns` — why it ships here with zero production callers | — | It is the one symbol in this chain that fails the "which real caller needs this?" question, so it is answered explicitly. **Decision: it ships here.** Three reasons, in order of weight. (1) It is the **only** function that must be written against the detector's internals — `RULES`, `TOKEN_RUN`, `candidateFires`, `ALLOWED_DIGESTS` — none of which are exported and none of which may be. Moving it to `WP-quarantine-review-cli` would make a *CLI* work package modify `src/core/secret-scan.js`, the one shared detector; shipping it beside the suppressor it is the exact inverse of is the better permission boundary. (2) It is the **producer** half of the producer/consumer agreement that the round-trip acceptance criterion exists to prove: `approvableRuns` → `recordAllowed` → `allowedDigests` → suppressor, four call sites of one `spanDigest`. Split across two WPs, no single WP can test the chain, and a byte-level disagreement anywhere in it is a **silent no-op suppression** — the worst failure this feature has. (3) Table D row D1b is a HIGH-severity owner decision taken on 2026-07-25 about **this function**. Deferring the function defers the decision into a spec that is itself `Draft` and not yet re-based, where it would survive only as prose. It is implemented, tested and mutation-checked here instead. **Cost accepted:** one function with no production call site for one WP, bounded by C9's grep and by D1b |

### Table C — `src/core/secret-scan.js` changes (canonical)

| Row | Fact | Value |
|-----|------|-------|
| C1 | new require | `node:crypto` only. The module stays pure: still no `fs`, no env, no argv, no network |
| C2 | `spanDigest(value)` | `sha256` hex lowercase over `Buffer.from(String(value), 'utf8')`. No normalization. **The one and only producer of an allowlist key**, used by the suppressor, by `approvableRuns` and by `recordAllowed` |
| C3 | process-scoped set | `let ALLOWED_DIGESTS = new Set()`, **empty by default**. `setAllowedDigests(iterable)` replaces it, dropping any member that is not a 64-character lowercase hex string; `clearAllowedDigests()` empties it; `allowedDigestCount()` reports its size |
| C4 | the approvable unit | one maximal `TOKEN_RUN` match — a whole delimiter-bounded token. There is no other kind of span in the detector, so ADR-0033 decision 2's containment scoping holds **structurally**: an approved value has no sub-spans left firing because sub-spans are never considered. **No range set, no binary search, no ladder rung.** |
| C5 | the suppressor | one clause inside `entropyPass`, **after** the `candidateFires` check: `if (ALLOWED_DIGESTS.size > 0 && ALLOWED_DIGESTS.has(spanDigest(run))) return run;`. The rule is **hash only what would have fired**. Hoisting it above `candidateFires` hashes every run that clears the length floor, firing or not. Measured (Node v25.9.0, macOS, 2026-07-25) at the 256 KiB cap on 32-character **low-entropy** token runs — 7,944 runs, none firing — **7.2 ms in this order, 12.6 ms hoisted**; the delta matches the isolated cost of 7,944 sha256 digests (7.8 ms). On **short** runs the order is irrelevant: the `run.length < ENTROPY_MIN_LEN` fast path returns before either clause, measured 2.9 ms both ways over 29,128 eight-character runs |
| C6 | who installs the set | `bin/wienerdog.js`, once, at the **top of `main()`** — before the `help` early return and before the hidden `gws _broker` early return, so suppression really is detector-wide. Wrapped in `try/catch`. A direct module import (a test, a future caller) installs nothing and gets an empty set — exactly today's behaviour |
| C7 | the set is a **snapshot** | it is read once, before dispatch. A command that *writes* the store therefore does **not** see its own write in the same process; the next invocation does. Stated here because `WP-quarantine-review-cli` prints a report after `recordAllowed` and must not claim the value is now suppressed in this process |
| C8 | `approvableRuns(text, contextChars=60)` | **`[]` whenever the labelled `RULES` matched anywhere in the input** (Table D row D1b). Otherwise: post-`RULES` token runs that would fire, excluding runs already covered by an installed digest, de-duplicated by digest, first-appearance order, returning `{value, digest, before, after}`. Bounded and total: non-string, `''`, over `SCAN_MAX_BYTES`, or any internal error → `[]` |
| C9 | `approvableRuns` has **zero callers** | this WP adds the function and no call site. `grep -rn 'approvableRuns' src/ bin/ \| grep -v 'src/core/secret-scan.js'` must show **zero** hits — i.e. no occurrence outside the module that defines and exports it. (Inside that module there are exactly two: the declaration and the export list. Do not assert a total count; a correct module has two, `main` has none, and any single number is wrong on one side or the other.) It carries raw bytes, so the invariant "it never reaches a durable sink" is enforced here by there being no path to one at all; the successor CLI adds the single attended caller |
| C10 | unchanged | `ScanLimits` (no new key, no changed value), `RULES`, `bitsPerChar`, `CANDIDATE_CLASS`, `TOKEN_EXTRA`, `TOKEN_CLASS`, `ENTROPY_CANDIDATE`, `TOKEN_RUN`, `candidateFires`, `scanAndRedact`'s structure and fail-closed behaviour, `redactOnly`, `hasHardFinding` |
| C11 | result shape | `scanAndRedact` still returns exactly `{text, findings}`. **No new field.** A suppressed run produces no finding and no replacement, so it is indistinguishable from text that never matched |

### Table D — the guards (canonical)

| Row | Guard | Statement |
|-----|-------|-----------|
| D1a | **structural — a whole labelled match is never suppressible** | `RULES` runs before `entropyPass` and replaces every labelled match with `[REDACTED:<label>]`. The bytes a rule consumed are gone before the entropy pass sees the text, so they never exist as a candidate run and can never be suppressed. This is an ordering property of the module, not a check that could be forgotten, and it holds **under every ordering of the suppressor within `entropyPass`**, because `entropyPass` runs only after the whole `RULES` loop (`scanAndRedact`: `for (const rule of RULES) out = rule(out, add); out = entropyPass(out, add);`). **D1a is exactly this and no more.** It says nothing about bytes a rule did *not* consume — see D1b |
| D1b | **explicit — the truncated tail** | D1a is not enough, because several rules' value classes are narrower than `TOKEN_CLASS` (`sk-proj-`/`sk-` exclude `-`; `AKIA` excludes lowercase, `_`, `-`; `gh[pousr]_` and `sk_live_` exclude `_ - + / =`; the legacy assignment class excludes `+ / =`). A rule truncates, and the **remainder** becomes a fresh maximal token run indistinguishable from a Drive id. So: **`approvableRuns` returns `[]` if the labelled `RULES` matched ANYWHERE in the input** — the whole input, not the runs near the match. No adjacency test, no position logic, no per-run judgement (owner decision, 2026-07-25). See "The truncated-tail residue" under Exact contracts for the reproduction, the rejected adjacency filter, and the measured cost |
| D2 | **explicit — the store** | `assertAllowable(value)` refuses unless `scanAndRedact(value).findings` is exactly one finding whose `label === 'high-entropy'`. Zero findings, more than one finding, or any other label is refused with a `WienerdogError` naming the labels found. It lives inside `recordAllowed`'s locked section in the store, and there is no exported writer that bypasses it (Table B row B7). **D2 is context-free (D6), so it CANNOT catch a truncated tail** — the bare tail genuinely is one `high-entropy` finding. That is what D1b is for; do not "strengthen" D2 to compensate |
| D3 | **structural, on the store** | there is no exported function that writes an arbitrary entry. `recordAllowed` derives the key with `spanDigest(value)` from the value it just validated, so a key and its provenance cannot disagree |
| D4 | what D1a–D3 guarantee | a labelled provider match can never be suppressed (D1a); **no part of an input that contains a labelled provider match can ever be offered for approval** (D1b); and no digest can be installed that never passed D2 (D2, D3) |
| D5 | what they do **not** guarantee | it is still possible to approve a real credential Wienerdog does **not** recognise — an unknown provider's opaque token looks exactly like a Drive id, and nothing in the input flags it. Accepted residual (ADR-0033 boundary statement); the human sees the full value and its context before confirming. D1b does not help here: an unrecognised credential produces no labelled finding to trip it |
| D6 | **why D2 is sound** | `candidateFires` is context-free over a run: a run's verdict depends only on its own bytes. So `scanAndRedact(value)` on the bare value yields exactly the verdict the suppressor will later compute in context. `RULES` on the bare value can only match a **subset** of what it would match in context (the assignment and JSON rules need surrounding text and have no negative lookbehind), so D2 can only be stricter, never laxer. **If a future WP ever adds a context, proximity or window rule to the entropy pass, this soundness argument breaks and D2 must be redesigned.** |
| D7 | the detector-wide consequence | an approved value stops being redacted **everywhere the one shared detector runs** — not just EP2/EP4, but the `redactOnly` sinks: `alerts.jsonl`, run evidence, the per-run brain log, routine logs, and the pre-brain transcript pass. Owner decision (ADR-0033 decision 6), on ADR-0024's one-shared-detector premise |

### Mirrored Surface Checklist

Mirrors of **Table A** (file format):

- [ ] the `ALLOWLIST_BASENAME` / `MAX_LABEL_CHARS` constants and the `Allowlist` typedef in `src/core/secret-allowlist.js`
- [ ] `readAllowlist`'s fail-closed return (A8) and `writeAllowlist`'s serialization (A2)
- [ ] `isAuthorizingEntry`'s predicate (A9, A9a, A9b) and `allowedDigests`'s use of it
- [ ] `recordAllowed`'s empty-label refusal (A6)
- [ ] `readAllowlist`'s JSDoc sentence obliging callers to render `normalizeLabel(entry.label)` (A9a)
- [ ] `removeAllowed`'s JSDoc and Table B row B6's reach limit — both must state the SAME limit (A10)
- [ ] `lockPath` and the lockfile mode (A13)
- [ ] the example JSON under "Exact contracts"
- [ ] the GLOSSARY bullet's path and "digests, never raw values" clause
- [ ] the "no manifest entry" statement in Current state and the Out-of-scope bullet (A11)
- [ ] the unit tests asserting the shape, the mode, the fail-closed read and every A9 malformed case

Mirrors of **Table B** (store API):

- [ ] each function's JSDoc in `src/core/secret-allowlist.js`
- [ ] the module export list (six names, exactly)
- [ ] the module header comment's "no exported raw writer" paragraph
- [ ] the Acceptance criteria naming each refusal
- [ ] the verification grep asserting the export list
- [ ] Table B row B11's `approvableRuns` audit answer, mirrored by Table C row C9 and by the Out-of-scope bullet that keeps the CLI out of the detector
- [ ] the successor spec `WP-quarantine-review-cli`'s use of the store API — **it currently expects a ten-name export list and must be updated; see "Known successor impact"**

Mirrors of **Table C** (detector changes):

- [ ] the `spanDigest` / `setAllowedDigests` / `clearAllowedDigests` / `allowedDigestCount` declarations
- [ ] the suppressor clause inside `entropyPass` and its comment (C5)
- [ ] `approvableRuns`'s body and JSDoc (C8, C9)
- [ ] the `secret-scan.js` export list
- [ ] the `bin/wienerdog.js` install block and its placement at the top of `main()` (C6)
- [ ] the Deliverables cell for `src/core/secret-scan.js`
- [ ] the verification greps for the suppressor, the install point, the zero call sites of `approvableRuns`, and the unchanged `ScanLimits` key count. **C9's grep must exclude `src/core/secret-scan.js` and expect 0 — never a total count.** An earlier draft of this row expected a total of 1 and was unsatisfiable both before and after the change; it drifted from its own canonical row
- [ ] the C5 performance figures — they appear in THREE places (Table C row C5, the comment pasted into `src/core/secret-scan.js`, and Mutation row M9) and must be one number. A wrong measurement inside a shipped source comment is worse than no measurement

Mirrors of **Table D** (the guards):

- [ ] `assertAllowable`'s JSDoc and body
- [ ] the module header comment of `src/core/secret-allowlist.js`
- [ ] `approvableRuns`'s "ALL-OR-NOTHING ON LABELLED FINDINGS" JSDoc paragraph and its step-3 line (D1b)
- [ ] the "truncated-tail residue" subsection under Exact contracts (D1b's reproduction, rejected alternative and measured cost)
- [ ] the Current-state bullet on `RULES` running first — it must say **consumed bytes**, not "a credential", and must point at D1b (D1a)
- [ ] the suppressor comment inside `entropyPass` (D1a only — the suppressor is not where D1b lives)
- [ ] the GLOSSARY bullet's "never a labelled provider match" clause
- [ ] the Security checklist's two separate guard items (D1a and D1b are DIFFERENT claims and each needs its own bullet)
- [ ] the Acceptance criteria enumerating refused provider labels, the five truncated-tail vectors, and the far-away vector
- [ ] Mutation rows M14a and M14b
- [ ] the verification gate's D1b textual check
- [ ] the D6 warning, mirrored in this WP's Out-of-scope bullet on context rules
- [ ] ADR-0033 decisions 3 and 6 (already written; do not edit them). D1b is stricter than decision 3 and does not contradict it — see "What ADR-0033 still owes this WP"

## Implementation notes & constraints

- **No new npm dependency**, plain Node >= 18, no TypeScript, JSDoc types only.
  `node:crypto` is a built-in, not a dependency.
- **`src/core/secret-scan.js` stays pure.** The allowed set is an *injected*
  parameter installed once by the entry point, never a file the detector reads.
  Do not add `fs`, `getPaths`, or a lazy self-load to that module — that was
  considered and rejected in ADR-0033's design (it would give the detector a
  filesystem and environment surface at every one of its call sites).
- **Fail closed at every degraded path.** An unreadable store, a malformed JSON
  body, a bad key, a malformed value, a throwing `getPaths`, a held lock — all
  produce an empty set or a refusal, never a suppression.
- **Prefer subtraction over a guard.** Every export in this WP had to justify
  itself against a real caller (Table B). If a review finding here can be closed
  by deleting a function or an export rather than by adding a check, delete it.
  The one symbol that failed that question is `approvableRuns`, and its answer is
  written out in full in Table B row B11 rather than left implicit — the reason
  it ships here is that moving it would put a CLI work package inside the one
  shared detector, break the four-link round trip no other WP could then test,
  and defer a HIGH-severity owner decision (D1b) into an un-re-based `Draft`.
- **Performance.** The suppressor costs one `Set.size` read per firing run when
  nothing is installed, and one sha256 of a firing run when something is. Firing
  runs are rare (102 of 181 notes on the maintainer's vault contain at least
  one; a note contains a handful). Do not memoize across scans, and do not hoist
  the digest above `candidateFires` (Table C row C5). If you re-measure and get a
  different number than C5's, **fix all three mirrors together** (Table C row C5,
  the source comment, Mutation row M9) — a stale figure inside a shipped source
  comment is worse than no figure.
- **`approvableRuns` is a review surface.** Its output carries raw bytes. Do not
  call it from `scanAndRedact`, from a gate, from `redactOnly`, or from anything
  that writes a durable artifact — and in this WP, do not call it at all
  (Table C row C9). Its `if (labelled) return [];` line is **not** an
  optimization and **not** negotiable (Table D row D1b): it is the reason the
  Security checklist's second guard bullet is true. If it looks over-broad while
  you are implementing it, that is the point — read "The truncated-tail residue".
- **Do not add a `suppressed` count to `scanAndRedact`'s result** (Table C row
  C11). Recurrence telemetry is derived at read time by the successor CLI from
  files already on disk; an additive result field would change a contract seven
  consumer modules inherit, for a number nobody persists.
- **Test hygiene for the process-scoped set.** `ALLOWED_DIGESTS` is module
  state, and `node --test` runs many tests in one process per file. Every test
  that calls `setAllowedDigests` must call `clearAllowedDigests()` in a
  `t.after(...)`, and the new test file's final assertion is
  `allowedDigestCount() === 0`. A leaked set silently changes later tests'
  meaning.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Known successor impact (report, do not fix here)

`docs/specs/WP-quarantine-review-cli.md` is `Draft` and depends on this WP.
**Do not edit that spec from this WP.** The architect must re-base it on the
five points below before it goes `Ready`.

1. **Export list.** Its "Current state" (around lines 211–233) reproduces a
   **ten-name** export list for `src/core/secret-allowlist.js` including
   `writeAllowlist`, `allowlistPath`, `ALLOWLIST_BASENAME` and
   `MAX_LABEL_CHARS`. Table B here reduces it to **six** and makes
   `writeAllowlist` module-internal.
2. **Its Table E `E-lock` case** (around line 858) exercises "make the allowlist
   path a *directory* so `writeAllowlist`'s rename fails" — a symbol it can no
   longer name.
3. **Its DoD checks that `secret-scan.js` exports `approvableRuns`.** That
   remains true (Table B row B11 keeps the function here), so nothing to change
   — recorded so the re-base does not "fix" it.
4. **`approvableRuns` returning `[]` is now two different situations** and the
   CLI must tell them apart, or it will tell a user "nothing to approve" about a
   note the gate is reverting every night. `[]` means either *no run fires* or
   *the input contains a labelled provider match* (Table D row D1b). The CLI can
   distinguish them with `scanAndRedact(text).findings` and must say which,
   naming the labels found, with the remedy: remove the credential from the note
   and re-run. **Measured cost this makes visible** (2026-07-25, maintainer's
   vault): one note of 181 is in this state, it is
   `01-Projects/wienerdog/current-state.md`, and it holds 16 of the vault's 118
   approvable units.
5. **Rendering an entry.** `readAllowlist` returns entries **as found**,
   including hand-edited ones (A10). Anything the CLI prints from an entry must
   go through `normalizeLabel` (A9a) — never `entry.label` directly.

### What ADR-0033 still owes this WP (owner action — do NOT edit the ADR)

**This WP is blocked until the owner adds one thing to ADR-0033.** It is not an
implementer task, it is not this spec's to invent, and gate step 0 fails loudly
until it exists.

ADR-0033 lines 6–9 specify only the **empty** state:

```markdown
> **OWNER-APPROVED — EMPTY.** Nothing here is ratified yet. This ADR stays
> `Proposed` until the owner fills in a dated approval block.
```

"a dated approval block" names no format, so **no gate can check for one**. The
previous draft of this gate checked for the *absence* of the string
`OWNER-APPROVED — EMPTY`, which is satisfied by deleting the warning paragraph
and adding nothing — a ratification gate that a deletion passes. It has been
replaced with a positive grep, which needs a literal shape to grep for.

**What the owner should add to ADR-0033** (exact wording is his; the *shape* is
what the gate depends on):

```markdown
> **OWNER-APPROVED — 2026-07-25.** Ratified by <name>, at a terminal.
```

i.e. a line matching `^> \*\*OWNER-APPROVED — YYYY-MM-DD\.\*\*`, replacing the
`— EMPTY.` paragraph, together with flipping `Status: Proposed` to
`Status: Accepted` on line 3 **and** the `Proposed` cell in the ADR-0033 row of
`docs/adr/README.md` (currently line 41), which is a second, independent mirror
of the same status that no gate has ever checked. Gate step 0 now checks all
three.

Separately, the owner may want to record **Table D row D1b** in ADR-0033 —
decision 3 currently claims the two-guard enforcement (structural + explicit)
that this WP has now shown is insufficient on its own for the *offer* path.
**The architect's read: no amendment is required for this WP to be correct.**
Decision 3's two guards are both true as written, and both are implemented; D1b
is a third, stricter guard on a surface (`approvableRuns`) that ADR-0033 does not
name. It is a spec-level decision the ADR authorises rather than contradicts.
But it is a HIGH-severity owner decision taken on 2026-07-25 and it lives only in
a `Draft` spec today, so recording it in decision 3 as a third bullet would be
cheap insurance. **Owner's call.**

## Security checklist (this WP touches untrusted input)

- [ ] The allowlist key is a **whole-value** digest of one token run. No entry
      format that is a prefix, suffix, length, character class, glob or regex
      exists anywhere in the code or the file, and none can be added without
      changing Table A.
- [ ] The suppressor can never suppress a labelled provider match — meaning the
      bytes a rule **consumed**. Verified two ways: the ordering property
      (Table D row D1a) and a test that feeds each of `private-key`,
      `anthropic-key`, `openai-key`, `aws-key`, `github-token`, `google-oauth`,
      `jwt`, `google-client-secret`, `stripe-secret-key` to `assertAllowable`
      and asserts a refusal.
- [ ] **No part of an input containing a labelled provider match can be offered
      for approval.** This is a separate claim from the one above and needs its
      own mechanism, because several rules' value classes are narrower than
      `TOKEN_CLASS`, so a rule truncates and leaves a high-entropy tail that is
      indistinguishable from a benign token. `approvableRuns` returns `[]` for
      the whole input whenever any labelled rule fired (Table D row D1b).
      Verified by the five truncated-tail vectors and the far-away vector in the
      Acceptance criteria, and by mutations M14a and M14b.
- [ ] The store refuses to record anything whose own scan is not exactly one
      `high-entropy` finding, and the refusal lives in the store, not in a
      caller. **There is no exported function that writes an entry without
      passing it** (Table B row B7).
- [ ] A malformed **value** cannot authorize suppression: `{"<64 hex>": null}`,
      a string value, an array value, a missing/empty `label`, a label carrying
      a newline / a terminal escape sequence / more than 120 characters, a
      missing or unparseable `approved_at`, the `Date.parse`-accepting `"1"`,
      and any `source` other than `"approved"` all yield nothing from
      `allowedDigests` (Table A rows A9, A9a, A9b).
- [ ] A concurrent approve and remove cannot resurrect a removed digest: both
      mutators hold an `O_EXCL` lock across the whole read-modify-write, and
      contention is a visible refusal (Table B row B9).
- [ ] Nothing in this WP writes `secret-allowlist.json`. Verified by **one
      non-enumerative grep** — `recordAllowed` and `removeAllowed` have zero
      occurrences in `src/` and `bin/` outside `src/core/secret-allowlist.js` —
      not by a list of directories, which drifted three ways across earlier
      drafts of this spec.
- [ ] `approvableRuns` returns raw bytes and has **zero** call sites in `src/`
      and `bin/` after this WP (Table C row C9).
- [ ] No untrusted identifier reaches a filesystem path: the only paths this WP
      builds are `path.join(stateDir, 'secret-allowlist.json')` and that path
      plus `.lock`, both from code-owned basenames. A digest prefix is validated
      `/^[0-9a-f]{12,}$/` before use and never touches the filesystem.
- [ ] A human-written label is bounded and control-character-stripped before it
      is persisted, **and a hand-edited one that is not already in that form
      authorizes nothing** (A9a) — `isAuthorizingEntry` requires
      `normalizeLabel(value.label) === value.label`, so a label containing a
      terminal escape sequence, a newline, or 5 000 characters is inert. It is
      refused, never repaired (A10). A caller that *renders* an entry must
      render `normalizeLabel(entry.label)`, because `readAllowlist` returns
      entries as found; that obligation is registered under "Known successor
      impact" for the review CLI.
- [ ] The file is created 0600 inside a 0700 dir via temp + rename + chmod, and
      is removed by `wienerdog uninstall` through `disposeCoreMechanics`.
- [ ] The raw approved value is never persisted, never logged, never placed in a
      finding, and never passed as a command-line argument.

## Acceptance criteria

**A test that passes against unmodified `main` is not evidence.** Every
criterion below must be demonstrably red before the change and green after; the
Mutation checks table names, for each mutation, the test that must turn red. Run
the new tests against a stashed working tree before you claim any of this.

### The pinned test token — use this literal, do not invent one

**Every criterion below that says "the token" means this exact string**, written
as a literal in the test file:

```js
const T = '1QzR7vK3mXbT9pLc2WsYfHd8-NjE4gAu5oZ_1rVtBiM';        // 43 chars
const T_DIGEST = 'cf9096c4c891a7787ce06eb322f6157a4da3b5e2dc4b924717e664f033ebcf48';
```

It is **synthesized**, not a real id (Security checklist), and it is
base64url-shaped with **both** `-` and `_`, so it exercises exactly what
`WP-secret-scan-whole-token-runs` changed. Verified on 2026-07-25: it is one
maximal token run, `scanAndRedact(T).text === '[REDACTED:high-entropy]'` with a
single `high-entropy` finding, and `spanDigest(T) === T_DIGEST` (cross-checked
against `shasum -a 256`, so the test is not re-deriving its own expectation).

**Why a literal and not "a Drive-id-shaped token you pick".** `candidateFires`
needs a >= 24-character sub-run of `[A-Za-z0-9+/=]`, which **excludes `-` and
`_`** — so a base64url id whose separators chop it into sub-24 pieces never
fires at all, and every "install the digest, assert nothing changes" criterion
below would pass **vacuously, on unmodified `main` too**. Measured: of five
plausible 43–44-character Drive-id shapes, **one of five was silent**, with
before, after and `main` all identical. `T` is pinned so that cannot happen.

**Every suppression criterion asserts its own precondition first.** Before
installing any digest: with `clearAllowedDigests()` in effect, assert
`scanAndRedact(input).findings` is exactly one `high-entropy` finding **and**
`scanAndRedact(input).text !== input`. A suppression test whose subject never
fired is not evidence of suppression.

**Detector (`tests/unit/secret-scan.test.js`, added tests only):**

- [ ] With no digests installed, `scanAndRedact` output is **unchanged** for
      every existing test in `tests/unit/secret-scan.test.js` and every test in
      `tests/unit/secret-scan-whole-token-runs.test.js` and
      `tests/unit/secret-scan-baseline.test.js` — none of those files needs an
      edit and none may receive one except the additive tests below.
- [ ] `spanDigest('abc')` equals the pinned literal
      `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`
      (written out in the test, **not** re-derived with `crypto` — a test that
      recomputes the value it checks proves only that sha256 is deterministic),
      and `spanDigest` applies no trimming, case-folding or Unicode
      normalization (a leading space, a differing case, and an NFD/NFC pair all
      give different digests).
- [ ] `setAllowedDigests` drops a non-hex member, an uppercase-hex member, a
      63- or 65-character member, and a non-string member;
      `allowedDigestCount()` reflects only the accepted ones.
- [ ] Suppression works end to end: **precondition first** (see above), then
      install `T_DIGEST` and assert `scanAndRedact(input).text === input` with
      `findings.length === 0` — for `T` bare, in prose, inside backticks, and
      repeated twice in one input. All four preconditions asserted separately.
- [ ] Whole-run scoping (Table C row C4): with `T_DIGEST` installed, `T`
      surrounded by spaces, by backticks, and at start-of-string yields **zero**
      findings — i.e. no shorter piece of it is separately considered inside a
      document that contains the whole token. Assert the three complements too,
      each with its precondition: `T.slice(0, 30)`, `T + 'x'` and `T + '-abc'`
      as documents of their own are **different values** and each still produces
      exactly one `high-entropy` finding, so the scoping claim cannot be
      mistaken for prefix matching. (Verified 2026-07-25: all three fire.)
- [ ] Neighbour independence: a **different** high-entropy token beside the
      approved one in the same input is still redacted, with `count === 1`.
      Precondition: without the digest installed, that same input yields
      `count === 2`.
- [ ] Delimiter sensitivity: installing the digest of the token **without** a
      neighbouring word suppresses nothing when the token appears glued to that
      word by a token character, because the run — and therefore the digest —
      differs. (This is the honest cost of whole-run equality; assert it so it is
      not mistaken for a bug.)
- [ ] The suppressor does not disarm the labelled rules: install `T_DIGEST`, put
      a labelled credential in the same input, and assert the labelled match is
      still `[REDACTED:<label>]` with its finding.
- [ ] `clearAllowedDigests()` restores unsuppressed behaviour, and the new
      tests leave `allowedDigestCount() === 0`.
- [ ] `approvableRuns` returns `T` for a note containing it; returns `[]` for
      text with no entropy hit, for a non-string, for `''`, and for input over
      `SCAN_MAX_BYTES`; omits a run whose digest is already installed;
      de-duplicates a token appearing twice; caps `before`/`after` at
      `contextChars`; and never returns a value that `assertAllowable` would
      refuse.
- [ ] **Table D row D1b — the truncated-tail residue.** For each of the six
      vectors listed under "The D1b vectors" below, `scanAndRedact` produces a
      labelled finding **and** a `high-entropy` finding (assert both, so the case
      is real), and `approvableRuns(input)` returns **`[]`**.
- [ ] `ScanLimits` has exactly the three keys it had before, with unchanged
      values.

**Store (`tests/unit/secret-allowlist.test.js`):**

- [ ] `assertAllowable` accepts a bare high-entropy token and **refuses** each of
      the nine provider examples in the Security checklist, an empty string, a
      non-string, and a value that produces no finding at all.
- [ ] `recordAllowed` writes Table A's exact shape; the file is mode `0600`; a
      second call with the same value returns `{created:false}` and leaves
      `approved_at` unchanged and the file bytes identical.
- [ ] `recordAllowed` **refuses** a label that is empty, whitespace-only, or
      control-characters-only after `normalizeLabel`, and writes nothing (A6).
- [ ] **Round trip, byte-for-byte** — the producer/consumer agreement test:
      take a value from `approvableRuns(note)` where `note` embeds `T`, assert
      that value **is** `T`, call `recordAllowed`, then
      `setAllowedDigests(allowedDigests(stateDir))`, re-scan `note`, and assert
      zero findings and unchanged text. Assert also that the recorded key equals
      `T_DIGEST`. A byte-level disagreement anywhere in that four-link chain
      (`approvableRuns` → `recordAllowed` → `allowedDigests` → suppressor) is a
      silent no-op suppression, and this is the only test that walks all four.
      **Precondition**: with `clearAllowedDigests()`, `note` yields exactly one
      `high-entropy` finding.
- [ ] `readAllowlist` returns `{version:1, entries:{}}` for a missing file, a
      truncated JSON file, a JSON array, and a file whose `entries` is a string.
- [ ] `allowedDigests` returns **nothing** for each of: a non-hex key, an
      uppercase-hex key, a 63-character key, a `null` value, a string value, an
      array value, a value with no `label`, a value with an empty `label`, a
      label containing `\n`, a label containing the raw bytes
      `\x1b]0;pwned\x07`, a 5 000-character label, a value with no
      `approved_at`, a value whose `approved_at` is `"not a date"`, a value
      whose `approved_at` is `"1"` (which `Date.parse` accepts — A9b), and a
      value whose `source` is `"setup"` — **fifteen** cases, each asserted
      separately, and each entry is still present in the file afterwards (A10).
- [ ] `removeAllowed` refuses an 11-character prefix, refuses a non-hex prefix,
      refuses a prefix matching nothing, refuses an ambiguous prefix (naming both
      full keys), removes on an unambiguous one, and **can remove a conforming
      key whose value is non-conforming** (A10). Assert the reach limit too, so
      it is recorded rather than discovered: a key that is not
      `/^[0-9a-f]{64}$/` — use an uppercase-hex key and a non-hex key — is
      **not removable**, because no prefix that passes `/^[0-9a-f]{12,}$/` can
      match it. Both remain in the file and both grant nothing (Table B row B6).
- [ ] **The resurrection race is closed**: with the lockfile present,
      `recordAllowed` and `removeAllowed` both throw a `WienerdogError` naming
      the lockfile and write nothing; after the lockfile is removed both
      succeed; and no lockfile remains after a successful call or after a call
      whose inner work threw.
- [ ] `normalizeLabel` strips a newline and a raw control byte, collapses
      whitespace, trims, caps at 120 characters, and preserves `Templom köz`.
- [ ] The module exports **exactly six** names, and `writeAllowlist`,
      `allowlistPath`, `ALLOWLIST_BASENAME`, `MAX_LABEL_CHARS`,
      `isAuthorizingEntry` and `withWriteLock` are **not** among them.

**Wiring:**

- [ ] `grep` proves nothing unattended writes the store — as **one
      non-enumerative invariant**, not a list of directories that drifts:
      `grep -rn 'recordAllowed\|removeAllowed' src/ bin/` has **zero** hits
      outside `src/core/secret-allowlist.js`. This WP adds no caller anywhere,
      so no enumeration of "the unattended paths" is needed and none may be
      written down (three earlier drafts of this spec listed three different
      sets).
- [ ] `setAllowedDigests` has exactly one call site outside
      `src/core/secret-scan.js`, and it is in `bin/wienerdog.js` **above** both
      the `help` branch and the `gws _broker` branch.
- [ ] `approvableRuns` has **zero** occurrences across `src/` and `bin/` outside
      `src/core/secret-scan.js` (C9).
- [ ] `npm test` and `npm run lint` pass; no file under `tests/golden/` changes.

### The D1b vectors

Five truncated-tail vectors, one per truncating rule. All are **fake**,
synthesized for this test — no real key, none copied from a vault, transcript or
log.

```text
my key is sk-proj-ABCDEFGHIJKLMNOP-Xk9Lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ ok
my key is sk-ABCDEFGHIJKLMNOPQRSTU-Xk9Lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ ok
id AKIAQWERTYUIOPASDFG-xK9lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ4 done
tok ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-xK9lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh done
k sk_live_ABCDEFGHIJKLMNOP-xK9lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ4 done
```

Verified 2026-07-25: without the D1b line each offers its truncated tail — 33,
33, 34, 27 and 34 characters of the credential respectively — and with it, all
five return `[]`.

The **sixth** vector is what makes the rule blunt rather than adjacent, and it is
the one that fails under the rejected design (mutation M14b):

```text
<T> and my key is sk-proj-ABCDEFGHIJKLMNOP-Xk9Lm2Pq7Rt4Vw8Zb3Nc6Fd1Gh5Jy0zQ ok
```

`T` is nowhere near the labelled match and would be perfectly safe to approve.
`approvableRuns` must still return `[]`.

## Mutation checks

One-line mutation → the test that must turn **red**. Apply each to the
post-change tree, confirm the named test fails, then revert it.

| # | Mutation | Test that must turn red |
|---|----------|-------------------------|
| M1 | export `writeAllowlist` from `src/core/secret-allowlist.js` | the "exports exactly six names" test |
| M2 | in `isAuthorizingEntry`, drop the value checks and keep only the key regex | the fifteen `allowedDigests` malformed-value cases (`null`, string, array, missing/empty/newline/escape/over-long `label`, missing / `"not a date"` / `"1"` `approved_at`, wrong `source`) |
| M3 | in `isAuthorizingEntry`, accept any non-empty `source` | the `source: "setup"` case |
| M3a | in `isAuthorizingEntry`, weaken the label check to `typeof value.label === 'string' && value.label !== ''` | the `\n` label, the `\x1b]0;pwned\x07` label and the 5 000-character label cases (A9a) |
| M3b | in `isAuthorizingEntry`, drop the `approved_at` shape regex and keep only `Number.isFinite(Date.parse(...))` | the `approved_at: "1"` case (A9b) |
| M4 | delete `withWriteLock` from `recordAllowed` (call the body directly) | the "lockfile present → refuses and writes nothing" case for `recordAllowed` |
| M5 | delete `withWriteLock` from `removeAllowed` | the same case for `removeAllowed` |
| M6 | remove the `finally` that unlinks the lockfile | the "no lockfile remains after a successful call" case |
| M7 | in `recordAllowed`, drop the `assertAllowable(value)` call | the nine provider-refusal cases routed through `recordAllowed` |
| M8 | in `recordAllowed`, drop the empty-label refusal | the empty/whitespace-only label case |
| M9 | in `entropyPass`, hoist the digest check above `candidateFires` | none of the behaviour tests — verdicts are identical either way, so this is the one mutation the suite cannot see. It is pinned by the Table C row C5 verification grep asserting the clause order instead. Record that limitation in the PR, and record the measured cost the order buys (7.2 ms → 12.6 ms on the C5 input); do NOT claim a test caught it |
| M10 | in `entropyPass`, drop `ALLOWED_DIGESTS.size > 0` from the guard | none (it is a pure fast path) — asserted only by the perf note. Do not add a test for it |
| M11 | in `spanDigest`, add `.trim()` before hashing | **only** the `spanDigest` "no normalization" test (the leading-space case). NOT the round trip: a token run can never contain whitespace, so `spanDigest(run) === spanDigest(run.trim())` for every run — and because `spanDigest` is the single producer for all four links, no `spanDigest` mutation can make the chain disagree with itself. Stated so the round trip is not credited with catching it |
| M11a | in `recordAllowed`, hash `value.trim()` instead of `value` when deriving the key | the round-trip byte-for-byte test. This is a mutation that genuinely breaks producer/consumer agreement — one link normalizes, the other does not — which is what the round trip exists to catch. Use a `note` in which `T` is preceded by a space so the trimmed and untrimmed forms differ |
| M12 | in `bin/wienerdog.js`, move the install block below the `gws _broker` branch | the wiring test asserting the install line number is above both early returns |
| M13 | in `setAllowedDigests`, accept uppercase hex | the "drops an uppercase-hex member" case |
| M14 | in `approvableRuns`, drop the `RULES` pass and scan the raw text | the "never returns a value `assertAllowable` would refuse" case |
| M14a | in `approvableRuns`, delete the `if (labelled) return [];` line (Table D row D1b) | all five truncated-tail vectors **and** the far-away case. Verified 2026-07-25: without the line each of the five offers its truncated tail |
| M14b | in `approvableRuns`, replace `if (labelled) return [];` with an adjacency filter that drops only runs whose `before` ends in `[REDACTED:`| the **far-away** case (`T + ' and ' + <credential>`), which must still return `[]`. This mutation is the rejected design, and this row is why it is testable rather than argued about |
| M15 | in `approvableRuns`, drop the `ALLOWED_DIGESTS.has(digest)` skip | the "omits a run whose digest is already installed" case |

## Verification steps (run these; paste output in the PR)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

need() { [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }; echo "ok: $3 = $1"; }

# --- 0. ADR-0033 is RATIFIED. This WP implements its decisions; it may not
#        merge while the ADR is still a proposal with an empty approval block.
#        EVERY CHECK HERE IS POSITIVE — it greps for what MUST be present, never
#        for the absence of a warning. Deleting a paragraph must not satisfy a
#        ratification gate. This requires ADR-0033 to specify the ratified block's
#        literal shape; see this spec's "What ADR-0033 still owes this WP". If
#        the ADR does not yet carry that shape, this WP is BLOCKED, not adaptable.
ADR=docs/adr/0033-human-ratified-exact-value-secret-allowlist.md
grep -qx 'Status: Accepted' "$ADR" \
  || { echo "GATE FAIL: ADR-0033 is not Accepted — this WP cannot merge"; exit 1; }
grep -qE '^> \*\*OWNER-APPROVED — [0-9]{4}-[0-9]{2}-[0-9]{2}\.\*\*' "$ADR" \
  || { echo "GATE FAIL: ADR-0033 carries no dated OWNER-APPROVED block in the ratified shape"; exit 1; }
# The ADR index is a second mirror of the same status and is not allowed to drift.
grep -qE '^\| \[0033\].*\| Accepted \|$' docs/adr/README.md \
  || { echo "GATE FAIL: docs/adr/README.md still lists ADR-0033 as Proposed"; exit 1; }
echo "ok: ADR-0033 is Accepted, dated-approved, and the index agrees"

# --- 1. the dependency really landed ----------------------------------------
grep -qF "const TOKEN_RUN = new RegExp(\`[\${TOKEN_CLASS}]+\`, 'g');" src/core/secret-scan.js \
  || { echo "GATE FAIL: WP-secret-scan-whole-token-runs has not merged"; exit 1; }
echo "ok: the token-run detector is on main"

npm test
npm run lint

SS=src/core/secret-scan.js
SA=src/core/secret-allowlist.js

# --- 2. Table B: the export list is exactly six names, and no raw writer -----
node -e '
const m = require("./src/core/secret-allowlist.js");
const got = Object.keys(m).sort().join(",");
const want = "allowedDigests,assertAllowable,normalizeLabel,readAllowlist,recordAllowed,removeAllowed";
if (got !== want) { console.error("GATE FAIL: exports are", got); process.exit(1); }
console.log("ok: secret-allowlist exports exactly", want);'
# B9: both mutators take the write lock, and nothing outside this file mentions it.
node -e '
const fs = require("node:fs");
const s = fs.readFileSync("src/core/secret-allowlist.js", "utf8");
for (const fn of ["recordAllowed", "removeAllowed"]) {
  const i = s.indexOf("function " + fn + "(");
  if (i < 0) { console.error("GATE FAIL: no", fn); process.exit(1); }
  const j = s.indexOf("\nfunction ", i + 1);
  const body = s.slice(i, j < 0 ? s.length : j);
  if (!body.includes("withWriteLock(")) { console.error("GATE FAIL:", fn, "does not take the write lock"); process.exit(1); }
}
console.log("ok: B9 both mutators take the write lock");'
need "$(grep -rl 'withWriteLock' bin/ src/ | wc -l | tr -d ' ')" 1 \
     "B9: withWriteLock appears in exactly one file"

# --- 3. Table C row C5: the suppressor is AFTER candidateFires ---------------
# M9 is invisible to the test suite, so the ORDER is asserted textually here.
node -e '
const fs = require("node:fs");
const src = fs.readFileSync("src/core/secret-scan.js", "utf8");
const body = src.slice(src.indexOf("function entropyPass"));
const fires = body.indexOf("candidateFires(run)");
const allow = body.indexOf("ALLOWED_DIGESTS.has(spanDigest(run))");
if (fires < 0 || allow < 0) { console.error("GATE FAIL: C5 clauses not found"); process.exit(1); }
if (!(fires < allow)) { console.error("GATE FAIL: C5 the digest check is not after candidateFires"); process.exit(1); }
console.log("ok: C5 the suppressor runs after candidateFires");'

# --- 4. Table C rows C1/C6/C9/C10 -------------------------------------------
need "$(grep -cE "require\('node:" "$SS" || true)" 1 "C1 exactly one node: require (crypto)"
need "$(grep -cE "require\('node:crypto'\)" "$SS" || true)" 1 "C1 and it is node:crypto"
need "$(grep -cE "require\('node:(fs|path|os|child_process)'\)" "$SS" || true)" 0 "C1 the module is still pure"
need "$(grep -cE "^  (SCAN_MAX_BYTES|ENTROPY_MIN_LEN|ENTROPY_MIN_BITS_PER_CHAR):" "$SS" || true)" 3 \
     "C10 ScanLimits still has exactly three keys"
# C9: ZERO occurrences outside the module that defines and exports it. Do NOT
# assert a total count: a correct module has TWO hits (the declaration and the
# export list), and `main` has none, so any single total is wrong on one side.
need "$(grep -rn 'approvableRuns' src/ bin/ | grep -vc 'src/core/secret-scan.js' || true)" 0 \
     "C9 approvableRuns has zero hits outside src/core/secret-scan.js"
# D1b: the blunt all-or-nothing line exists. Behaviour is covered by the five
# truncated-tail vectors; this pins that the line was not "simplified" away.
node -e '
const fs = require("node:fs");
const src = fs.readFileSync("src/core/secret-scan.js", "utf8");
const body = src.slice(src.indexOf("function approvableRuns"));
if (!/if \(labelled\) return \[\];/.test(body)) {
  console.error("GATE FAIL: D1b the labelled-findings short-circuit is missing from approvableRuns");
  process.exit(1);
}
console.log("ok: D1b approvableRuns short-circuits on any labelled finding");'
# C6: exactly one install point, and it is above BOTH early returns.
need "$(grep -rn 'setAllowedDigests' bin/ src/ | grep -vc 'src/core/secret-scan.js' || true)" 1 \
     "C6 exactly one install site outside the detector"
node -e '
const fs = require("node:fs");
const lines = fs.readFileSync("bin/wienerdog.js", "utf8").split("\n");
const at = (needle) => lines.findIndex((l) => l.includes(needle));
const install = at("setAllowedDigests");
const help = at("cmd === \x27help\x27");
const broker = at("rest[0] === \x27_broker\x27");
if (install < 0 || help < 0 || broker < 0) { console.error("GATE FAIL: C6 landmarks not found"); process.exit(1); }
if (!(install < help && install < broker)) {
  console.error("GATE FAIL: C6 install at line", install + 1, "is not above help", help + 1, "and _broker", broker + 1);
  process.exit(1);
}
console.log("ok: C6 install line", install + 1, "precedes help", help + 1, "and _broker", broker + 1);'

# --- 5. Table B row B10: nothing unattended writes ---------------------------
# ONE non-enumerative invariant, not a list of directories. Three earlier drafts
# of this spec enumerated three DIFFERENT sets and drifted apart; this WP adds no
# caller anywhere, so the invariant is simply "zero, outside the store itself".
need "$(grep -rn 'recordAllowed\|removeAllowed' src/ bin/ | grep -vc 'src/core/secret-allowlist.js' || true)" 0 \
     "B10 no caller of recordAllowed/removeAllowed outside the store"
need "$(grep -c 'secret-allowlist' src/core/manifest.js || true)" 0 "A11 no install-manifest entry"

# --- 6. focused suites ------------------------------------------------------
# Via tests/run.js, NEVER `node --test <file>` directly: run.js:7 sets
# WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the whole suite and forwards argv.
# Bypassing it is this repo's known trap; do not model it in a spec.
node tests/run.js tests/unit/secret-allowlist.test.js \
                  tests/unit/secret-scan.test.js \
                  tests/unit/secret-scan-whole-token-runs.test.js \
                  tests/unit/secret-scan-baseline.test.js

# --- 7. the permission boundary held ----------------------------------------
BASE=$(git merge-base HEAD origin/main)
need "$(git diff --name-only "$BASE" | grep -cvE '^(src/core/secret-allowlist\.js|src/core/secret-scan\.js|bin/wienerdog\.js|docs/GLOSSARY\.md|tests/unit/secret-allowlist\.test\.js|tests/unit/secret-scan\.test\.js|docs/specs/WP-secret-allowlist-exact-value-store\.md|package-lock\.json)$' || true)" 0 \
     "files outside the permission boundary"
echo "ALL GATES PASSED"
```

## Out of scope (do NOT do these)

- **Any user-facing command.** Review, approval and removal commands are
  `WP-quarantine-review-cli`. This WP ships no CLI verb and no `USAGE` change.
- Any review skill. `wienerdog-quarantine-review` is a deferred follow-up; the
  deterministic CLI is the security boundary and is self-sufficient.
- Reading, listing, or writing `state/quarantine/`.
- Changing the transcript ledger, `WP-secret-revert-defers-ledger`'s deferral
  behaviour, or any digest banner text.
- Adding a shape, prefix, length, provider-name, URL-slot or `id`-field rule of
  any kind. ADR-0033 rejects the whole family permanently.
- Changing `RULES`, `ScanLimits`, any entropy threshold, `candidateFires`,
  `TOKEN_RUN`, or the token/candidate character classes. That was
  `WP-secret-scan-whole-token-runs`.
- **Adding any context, proximity, window or coverage rule to the entropy
  pass.** Table D row D6's soundness argument for guard 2 depends on
  `candidateFires` being context-free over a run; such a rule would silently
  break it.
- **Replacing Table D row D1b's all-or-nothing rule with anything selective** —
  an adjacency test on `before`, a byte-distance window, a "the tail starts with
  a delimiter" heuristic, or a per-run judgement of any kind. Owner decision,
  2026-07-25: suppression plus selective extraction is the exact shape
  `WP-secret-fence-shape-and-context` was proven fail-open on, five rounds
  running. Mutation row M14b makes the rejected design fail a test rather than an
  argument.
- **"Fixing" the cost of D1b by relaxing it.** On the maintainer's vault it costs
  16 of 118 approvable units, all in one note, and that note stays quarantined
  until its example credential is edited out. That is the owner's accepted cost,
  measured and recorded, not a defect to route around.
- Re-introducing a precedence ladder, a range set, a `SPAN_RUN` constant, an
  `insideRange` helper or a UUID suppressor. `WP-secret-fence-shape-and-context`
  is superseded; do not implement it.
- Adding a field to `scanAndRedact`'s result (Table C row C11).
- Adding an install-manifest entry for the store (Table A row A11).
- Editing `docs/adr/0033-human-ratified-exact-value-secret-allowlist.md` —
  including flipping its status. Ratification is the owner's act, and the gate
  above only checks it.
- Editing `docs/adr/0024-layered-secret-lifecycle.md`,
  `docs/specs/done/WP-secret-fence-shape-and-context.md` (it has been moved to
  `done/` by concurrent work; do not edit it at either path),
  `docs/specs/WP-secret-scan-whole-token-runs.md`,
  `docs/specs/WP-secret-scan-baseline-oracle.md`, or
  `docs/specs/WP-quarantine-review-cli.md` (see "Known successor impact").
- Updating any file under `tests/golden/`.

## Definition of done

1. **ADR-0033 is `Accepted` with a dated OWNER-APPROVED block on `main`, and
   `docs/adr/README.md`'s ADR-0033 row says `Accepted`.** Gate step 0 checks all
   three, positively. If any is missing, stop — this WP implements decisions
   nobody has ratified, and the required literal shape is spelled out under
   "What ADR-0033 still owes this WP". Do not edit the ADR or the index to make
   the gate pass; that is the owner's act.
2. `WP-secret-scan-whole-token-runs` has merged to `main`. Concretely,
   `src/core/secret-scan.js` declares `TOKEN_RUN` and `candidateFires`. If not,
   stop: a digest over a fragment is not an exact value.
3. Every Mutation-check row was applied, observed red (or, for M9 and M10,
   recorded as suite-invisible with its grep substitute), and reverted; results
   pasted into the PR body.
4. All verification steps pass locally; output pasted into the PR body.
5. Conventional commits; PR titled
   `feat(secret-scan): human-ratified exact-value allowlist store and suppressor (WP-secret-allowlist-exact-value-store)`.
6. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
7. This spec's `status:` flipped to `In-Review` in the same PR.
