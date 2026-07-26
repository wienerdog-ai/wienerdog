---
id: WP-quarantine-review-cli
title: wienerdog memory quarantine — review withheld notes and permanently approve an exact value
status: Superseded
model: sonnet
size: M
depends_on: [WP-secret-allowlist-exact-value-store, WP-secret-revert-defers-ledger]
adrs: [ADR-0004, ADR-0007, ADR-0019, ADR-0021, ADR-0023, ADR-0024, ADR-0031, ADR-0033]
epic: secret-lifecycle
---

# WP-quarantine-review-cli: the human side of the exact-value allowlist

> **SUPERSEDED 2026-07-25 — do not implement.** The human review surface for the exact-value allowlist. It has no purpose once the allowlist is gone. Its TTY-gate reasoning and its refusal tables are salvage if a future WP ever needs an attended review command.
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
vault. Before the single commit, ADR-0024's **EP2 staged-output secret gate**
scans the added content of every staged note with the one shared detector
(`scanAndRedact`, `src/core/secret-scan.js`). **Any** finding of **either**
severity reverts the whole note: it is not committed, a **byte-identical copy is
preserved in `~/.wienerdog/state/quarantine/`** (0700 dir, 0600 files), and a
warning is surfaced. That outcome is the **secret quarantine** (`docs/GLOSSARY.md`).

Behind eighteen precise labelled provider rules sits a high-entropy pass, and a
high-entropy run is a *shape*: a Google Drive file id is indistinguishable from a
credential by shape alone. On **2026-07-24** and **2026-07-25** the live gate
withheld three notes each night on the maintainer's machine; one of them contains
a permanent Drive id in its body, so **every** consolidation that touches it is
withheld, indefinitely.

Two work packages precede this one and are both hard prerequisites:

- **`WP-secret-revert-defers-ledger`** (already merged to `main`) stopped the
  withholding from being *destructive*. A run whose output was secret-reverted no
  longer marks its source transcripts `processed`; they are **deferred** in the
  transcript ledger (`state/transcript-ledger.json`, record
  `{outcome:'deferred', reason:'secret-revert', deferrals:n}`) and are naturally
  re-selected on the next run. A transcript may accumulate at most
  `SECRET_REVERT_MAX_DEFERRALS = 3` such deferrals; the **fourth** consecutive
  secret-reverted run that consumes it writes a `quarantined` record with reason
  `secret-revert-exhausted` instead. That record is **sticky**: `selectState`
  skips it regardless of the file's fingerprint, so an exhausted transcript is
  never dreamed over again until something removes the record. Nothing in the
  shipped tree removes it.
- **`WP-secret-allowlist-exact-value-store`** stops it from *recurring*, in
  principle: it builds the human-ratified exact-value allowlist
  (`state/secret-allowlist.json`, ADR-0033) — `sha256` digests of whole values a
  person approved — plus the detector's P0 suppressor and the two guards. But it
  deliberately ships **no user-facing command**, so on a user machine nothing can
  write the store and the mechanism is inert.

**This WP is the human side.** It adds the one interactive, TTY-confirmed CLI
path that may write the allowlist, the read-only review view the person uses to
decide, and the notification wiring that tells the user a review is waiting and
exactly what to run. It closes the loop: withheld note → the user is told and
told what to do → the user reviews and approves the specific benign value → the
ledger's secret-revert records are cleared → the next dream retries the same
transcripts and succeeds.

**Model output is untrusted in this threat model.** A review *skill* may one day
guide the session, but the write is a deterministic command the human runs. This
WP ships no skill.

**IRON RULE (ADR-0004): Wienerdog is just files.** No process, no daemon, no
telemetry leaving the machine. Every number this WP reports is derived at read
time from files already on disk.

## Current state

Two halves. **§1–§4 are in the tree today** — read them before you start. **§5 is
not in the tree**: it is `WP-secret-allowlist-exact-value-store`'s deliverable
and will exist by the time you start (Definition of done item 1). If it does not
exist when you open the repo, **stop** — the dependency has not merged.

### §1 `src/cli/memory.js` (159 lines) — the shape to extend

`wienerdog memory approve <file>` is the identity analog of `wienerdog grant`
(ADR-0007, ADR-0021): the security boundary is a typed-word confirmation read
from a **real controlling terminal**, with **no** headless / `--yes` /
environment bypass.

```js
const { defaultPrompt } = require('./grant');

async function run(argv, opts = {}) {
  const promptFn = opts.promptFn || defaultPrompt;   // TTY-only; --yes is never honored
  const paths = opts.paths || getPaths();

  const verb = argv[0];
  if (verb !== 'approve') {
    throw new WienerdogError(`unknown memory command '${verb || ''}' — only 'approve' is supported`);
  }
  …
  const vaultDir = readVaultPath(paths.config);
  if (!vaultDir) throw new WienerdogError('no vault configured — run /wienerdog-setup first');
  …
  const out = process.stdout;
  …
  const answer = await promptFn(`Type the word "approve" to confirm ${noun} (anything else cancels): `);
  if (String(answer).trim() !== 'approve') { out.write('Cancelled.\n'); return; }
  …
}
module.exports = { run };
```

Note the order: the verb check happens first, but the **vault lookup happens
before any verb-specific work**. The new verb needs no vault (it reads only
`state/`), so the dispatch must be restructured so `quarantine` never reaches
`readVaultPath`. `promptFn` and `paths` are the existing test seams; keep both,
and note that `approve` hard-codes `const out = process.stdout` in its own body —
leave that line exactly as it is.

`defaultPrompt` (in `src/cli/grant.js`) does two things worth knowing: when
`process.stdin.isTTY` it uses stdin/stdout; otherwise it opens `/dev/tty` for
input and uses **`process.stderr`** as the readline output, and if `/dev/tty`
cannot be opened it prints a refusal to stderr and resolves `''` (which every
caller treats as "not the typed word" → cancel). So `process.stderr` is already
this codebase's interactive output channel.

### §2 `src/core/digest.js` — the EP4 pending-review banner

Verbatim, at lines 571–577:

```js
  const quarantined = (Array.isArray(opts.secretQuarantine) ? opts.secretQuarantine : [])
    .map((n) => String(n).replace(/[^A-Za-z0-9._-]/g, '_'));
  const secretQuarantineWarn = quarantined.length > 0
    ? `> [!warning] Wienerdog: ${quarantined.length} dream note(s) were withheld from your vault because they ` +
      `appear to contain a secret — ${quarantined.join(', ')}. Review the copies in state/quarantine/: restore ` +
      'what you meant to keep, delete the rest; this notice clears when the folder is empty.'
    : '';
```

State-driven: it renders while `state/quarantine/` is non-empty and clears itself
when the directory is emptied. `listSecretQuarantine(stateDir)` (line 605) reads
the **directory listing only** — never file contents, which hold raw secrets —
skips dot-prefixed entries, sanitizes each basename to `[A-Za-z0-9._-]`, and
sorts. Both production callers (`src/cli/dream.js` and `src/cli/sync.js`) already
pass it, so the banner is re-rendered on every digest render.

### §3 `src/core/dream/ledger.js` — what the merged sibling WP shipped

Exports this WP reads or extends (line numbers are the shipped file):

- `SECRET_REVERT_REASON = 'secret-revert'` (17),
  `SECRET_REVERT_EXHAUSTED_REASON = 'secret-revert-exhausted'` (21),
  `SECRET_REVERT_MAX_DEFERRALS = 3` (30).
- `readLedger(stateDir)` (82) — missing/corrupt → an empty ledger, never throws.
  `writeLedger(stateDir, ledger)` (103) — atomic temp + rename + chmod 0600.
- `selectState(ledger, disc)` (173) — the sticky row is **first**: a
  `quarantined` record whose reason is `secret-revert-exhausted` returns
  `'skip-quarantined'` *whatever* the fingerprint. A `deferred` record returns
  `'select'` — a deferral is **not** a negative record, it only carries the
  counter.
- `secretDeferralCount(ledger, disc)` (221) — the counter reader. (There is no
  `nextSecretRevertAttempt`; do not look for one.)
- `recordSecretDeferred(ledger, disc, deferrals)` (283) — writes
  `{fingerprint, outcome:'deferred', reason:'secret-revert', deferrals:n, updated_at, harness}`.
- `recordSecretExhausted(ledger, disc)` (303) — writes
  `{fingerprint, outcome:'quarantined', reason:'secret-revert-exhausted', updated_at, harness}`.
- `activeQuarantines(ledger)` (328) and `quarantineBannerLine(ledger)` (346) —
  the code-owned transcript-quarantine banner, called by both `src/cli/dream.js`
  and `src/cli/sync.js`.

`quarantineBannerLine`'s `secret-revert-exhausted` arm is **verbatim** at lines
359–370:

```js
  if (spent.length > 0) {
    // Names NO command: nothing ships a way to un-skip these sessions yet, and a
    // banner must not tell the user to run something that does not exist. It
    // states no deferral count either — a file can also reach this state through
    // an unreadable counter, and a banner must not assert what the ledger cannot
    // prove.
    lines.push(
      `> [!warning] Wienerdog: ${spent.length} session transcript(s) are no longer being dreamed over — the notes made ` +
        `from them were withheld by the secret check too many times in a row: ${spent.map((e) => e.file).join(', ')}. ` +
        'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest. ' +
        'The session files themselves are untouched.'
    );
  }
```

**That comment gives two reasons, and this WP retires exactly one of them.**
Reason one — "nothing ships a way to un-skip these sessions yet" — expires with
this WP, which is the thing that ships the command; the banner may and must now
name it. Reason two — no deferral count, because a file can also reach this state
through an unreadable counter (`secretDeferralCount` returns
`SECRET_REVERT_MAX_DEFERRALS` for a garbled counter, deliberately) — is still
true and is **binding**: Table E row E2's replacement text still states no
number, and Table E row E6 rewrites the comment to say so.

There is **no** `clearSecretRevertRecords` in the tree. This WP is its owner.

### §4 `bin/wienerdog.js`

`USAGE` line 22, to extend:

```text
  memory      Approve identity-note changes so they inject into your session (typed confirmation)
```

### §5 NOT YET IN THE TREE — `WP-secret-allowlist-exact-value-store`'s deliverables

Everything in this sub-section is contract inherited from the dependency. Do not
write it, do not change it; call it.

`src/core/secret-allowlist.js` (new file, created by the dependency) exports:

```js
ALLOWLIST_BASENAME, MAX_LABEL_CHARS, allowlistPath, readAllowlist, writeAllowlist,
allowedDigests, normalizeLabel, assertAllowable, recordAllowed, removeAllowed
```

- `readAllowlist(stateDir)` → `{version:1, entries:{<64-hex digest>: {label, approved_at, source:'approved'}}}`; missing/corrupt → empty, never throws.
- `recordAllowed(stateDir, value, label)` → `{digest, created}`; calls
  `assertAllowable(value)` first, which throws unless the value's own scan is
  **exactly one** finding labelled `high-entropy` — so a labelled provider match
  can never be approved. A second call with the same value returns
  `{created:false}` and writes nothing.
- `removeAllowed(stateDir, digestPrefix)` → `{digest, label}`; throws on a
  prefix shorter than 12 characters, on no match, and on an ambiguous match.
- `normalizeLabel(label)` — control characters stripped, whitespace collapsed,
  trimmed, capped at `MAX_LABEL_CHARS` (120).

`src/core/secret-scan.js` gains (dependency's deliverable):

```js
/** @returns {Array<{value:string, digest:string, before:string, after:string}>} */
function approvableRuns(text, contextChars = 60)
function spanDigest(value)
function setAllowedDigests(digests)
function clearAllowedDigests()
```

`approvableRuns` returns post-`RULES` maximal runs that the high-entropy pass
would redact, **excluding runs already covered by an installed digest**,
de-duplicated by digest, in first-appearance order. It returns **raw values** —
it is a review surface, never a findings surface. Non-string, input over
`ScanLimits.SCAN_MAX_BYTES` (256 KB), or any internal error → `[]`.

`bin/wienerdog.js` gains a pre-dispatch block (dependency's deliverable) that
installs the allowed digests once via `setAllowedDigests(allowedDigests(state))`,
for every command. **That is why Table A row A11 exists**: with digests installed,
`approvableRuns` hides already-approved values, and the review view must see
through its own suppression.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/memory.js | restructure the verb dispatch; add the `quarantine` verb with its three forms per Table A, the refusals of Table B, the confirmation flow of Table C, and the disclosure rules of Table F. `approve` is unchanged in behaviour, including its `const out = process.stdout` line |
| modify | src/core/dream/ledger.js | add `clearSecretRevertRecords(ledger)` (Table D) and export it; replace the `secret-revert-exhausted` banner sentence with Table E row E2 and its comment with Table E row E6. Change nothing else |
| modify | src/core/digest.js | replace the `secretQuarantineWarn` template with Table E row E1. Change nothing else, including `listSecretQuarantine` |
| modify | bin/wienerdog.js | replace the `memory` `USAGE` line per Table A row A0. Change no other line |
| modify | tests/unit/memory-cli.test.js | Tables A, B, C, D and F. **Additive only** — no existing line may be deleted or changed (verification asserts zero deleted lines) |
| modify | tests/unit/digest.test.js | Table E row E1 |
| modify | tests/unit/ledger.test.js | Table D and Table E rows E2/E3 |

### Exact contracts

#### `src/cli/memory.js` — dispatch

```js
  const verb = argv[0];
  if (verb === 'quarantine') {
    return runQuarantine(argv.slice(1), {
      promptFn,
      paths,
      out: opts.out || process.stdout,
      tty: opts.tty !== undefined ? opts.tty : process.stderr.isTTY ? process.stderr : null,
    });
  }
  if (verb !== 'approve') {
    throw new WienerdogError(
      `unknown memory command '${verb || ''}' — supported: 'approve', 'quarantine'`
    );
  }
```

`runQuarantine` must not call `readVaultPath` or `readVaultLayout`: it reads
`paths.state` only. `approve`'s existing body, including its vault lookup and its
own `out`, moves below the dispatch unchanged.

`opts.out` and `opts.tty` are **JS-level test seams only**, exactly like
`opts.promptFn` and `opts.paths`. No argv flag and no environment variable
reaches them, ever (Table A row A7).

#### `src/cli/memory.js` — `runQuarantine`

Declare it at column 0, on one line, exactly like this — a verification step
extracts its body by that anchor:

```js
async function runQuarantine(args, opts) {
```

#### `src/cli/memory.js` — candidate derivation

One helper, used by the listing and by `allow`, so the two can never disagree
about what a candidate is:

```js
/**
 * Every approvable value sitting in `state/quarantine/` right now, in listing
 * order — INCLUDING values that are already on the allowlist, which is what the
 * recurrence view (ADR-0033 decision 9) and the recovery path (Table C row C9)
 * both need. Reads each quarantine copy's bytes (they are the withheld note, so
 * they may hold raw secrets — nothing read here is written anywhere durable) and
 * asks the detector which whole runs it would redact. An unreadable file is
 * skipped; a file larger than ScanLimits.SCAN_MAX_BYTES yields no candidates and
 * is reported as `oversize` (Table A row A1). De-duplicated by digest across
 * files; `files` accumulates every basename a digest was seen in.
 *
 * Calls `clearAllowedDigests()` FIRST (Table A row A11): bin/wienerdog.js
 * installs the approved digests before dispatch, which would otherwise make
 * `approvableRuns` hide exactly the values this view exists to show. The clear
 * is process-scoped and this command scans nothing else afterwards.
 *
 * @param {string} stateDir
 * @returns {{candidates: Array<{digest:string, value:string, before:string, after:string, files:string[]}>,
 *            copies: Array<{name:string, size:number, oversize:boolean}>}}
 */
function quarantineCandidates(stateDir)
```

Basenames come from the same sanitizer `listSecretQuarantine` uses
(`String(n).replace(/[^A-Za-z0-9._-]/g, '_')`); dot-prefixed entries are skipped;
each path is built as `path.join(quarantineDir, entry)` from the directory
listing, never from user input.

#### `src/cli/memory.js` — the three forms

Tables A, B, C and F are canonical for behaviour; this is the output shape.
`(stdout)` / `(terminal only)` mark the stream per Table F.

```text
$ wienerdog memory quarantine                                          (stdout)

Withheld notes awaiting review — /Users/ada/.wienerdog/state/quarantine/
  2026-07-24-2026-07-24.md                 4.1 KB
  2026-07-25-2026-07-25-current-state.md   42.7 KB

Values that caused them — approve one ONLY if you are certain it is not a secret:
  [9f2c1a7e4b0d]  44 characters  in 2026-07-25-2026-07-25-current-state.md
                  1A2b…yZ_9

Already approved — these are no longer flagged anywhere:
  [3d81ff02aa19]  Templom köz Drive folder id
                  approved 2026-07-25 — still appears in 1 withheld note

  wienerdog memory quarantine allow  9f2c1a7e4b0d   approve a value permanently
  wienerdog memory quarantine forget 3d81ff02aa19   undo an approval

This notice clears when state/quarantine/ is empty. Restoring or deleting the
copies there is a plain file operation — it approves nothing.
```

```text
$ wienerdog memory quarantine allow 9f2c1a7e4b0d

You are about to permanently approve this exact value:                 (terminal only)
----------------------------------------------------------------
1A2b3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ_9
----------------------------------------------------------------
Found in: 2026-07-25-2026-07-25-current-state.md
Context:  …the shared folder `1A2b…yZ_9` holds the…

This is DETECTOR-WIDE and permanent until you undo it. Once approved, this exact
value will no longer be treated as a secret anywhere: not by the checks that
withhold notes and digest sections, and not by the redaction applied to alerts,
run evidence, the dream's own log, or routine logs. Approve it only if you know
what it is.

Describe it so you recognise it later (e.g. "Templom köz Drive folder id"): _
Type the word "allow" to confirm (anything else cancels): _
```

On confirmation, in this order (Table C rows C7–C8): the ledger clear **first**,
then `recordAllowed`, then the report:

```text
                                                                       (stdout)
Cleared 4 secret-revert record(s); tonight's dream will retry those sessions.
wienerdog: approved — this value will not be flagged again from now on.
Anything already written while it was flagged stays as it is; anything already
written unredacted stays unredacted.
Restore or delete the copies in state/quarantine/ when you are done with them.
```

```text
$ wienerdog memory quarantine forget 3d81ff02aa19                      (stdout)

You are about to remove this approval:
  3d81ff02aa19…   Templom köz Drive folder id   approved 2026-07-25
The value itself was never stored, so it cannot be shown.

This only changes what happens FROM NOW ON. It does not undo anything: notes
already committed to your vault with this value in them keep it, and so do any
alerts, run evidence, dream logs or routine logs already written while it was
approved. From now on, notes and digest sections containing it are withheld
again.
Type the word "forget" to confirm (anything else cancels): _
```

#### `src/core/dream/ledger.js` — `clearSecretRevertRecords`

Declare it at column 0, on one line, exactly like this — a verification step
anchors on it:

```js
/**
 * Return a NEW ledger with every secret-revert record REMOVED: a `deferred`
 * record whose reason is SECRET_REVERT_REASON, and a `quarantined` record whose
 * reason is SECRET_REVERT_EXHAUSTED_REASON. Removing the record (rather than
 * rewriting it) returns the file to the ordinary baseline/mtime selection rules,
 * so it is selected again on the next run. Pure; touches no other record and no
 * other outcome — an intake quarantine (over-ceiling / too-many-lines /
 * read-error), every `processed` record, and any record this function cannot
 * positively identify are left exactly as they are.
 *
 * Membership is decided by an EXHAUSTIVE, explicit test, never by truthiness:
 * a present-but-non-object record proves nothing about secret-reverts and is
 * kept. (`selectState` already answers 'select' for a corrupt record, so keeping
 * it costs nothing and removing it would silently discard state this function
 * cannot read.)
 *
 * This grants NO trust: it only makes transcripts eligible again, and every
 * retried run still passes the EP2 gate in full. There is deliberately no
 * AUTOMATIC clear — an auto-clear on a later clean run produces a four-run
 * ping-pong (clear → reselect → revert → defer x3 → quarantine → clear …).
 * `wienerdog memory quarantine allow` is the only caller (Table D row D8).
 *
 * @param {Ledger} ledger
 * @returns {{ledger: Ledger, cleared: number}}
 */
function clearSecretRevertRecords(ledger) {
```

Export it alongside the existing names.

## Contract reference

The ADR-0031 activation trigger fires on five of seven: **(i)** a user-facing
CLI interface is introduced; **(iv)** refusal, precedence and cancellation
behaviour is defined for every input class; **(v)** the task crosses an
authority boundary (an attended command writes state that an unattended detector
and an unattended dream read); **(vi)** the disclosure rules govern which stream
each class of output may reach; **(vii)** the same fixed text is mirrored in two
banner surfaces, the CLI, the tests and `USAGE`.

### Table A — CLI surface (canonical)

| Row | Invocation | Behaviour |
|-----|-----------|-----------|
| A0 | `USAGE` line | the existing `memory` row's description becomes `Approve identity notes, or review notes the secret check withheld (typed confirmation)`. Keep the existing column alignment of the `USAGE` block; change no other row |
| A1 | `wienerdog memory quarantine` | **Read-only.** No TTY required, no prompt, exit 0 even with nothing to show, writes no file. Prints to **stdout**, in order: the withheld copies in `state/quarantine/` (sanitized basename + `KB`/`B` size, plus a trailing `(too large to review)` when the size exceeds `ScanLimits.SCAN_MAX_BYTES`); the approvable candidates that are **not** already approved (12-character digest prefix, value length in characters, the basenames it was found in, and a **masked** preview — first 4 characters, `…`, last 4 characters, always, with no whole-value special case); the current allowlist entries (12-character prefix, label, `approved_at` date, and how many withheld copies still contain that digest); then the two next-step command lines |
| A2 | `wienerdog memory quarantine allow <prefix>` | **TTY-gated** in the not-yet-approved case. Resolves `<prefix>` per Table C row C1; shows the **full** value, the file it came from and its context **to the terminal only** (Table F); prompts for a label; then requires the typed word `allow`. On confirm: the ledger clear, then `recordAllowed`, then the report (Table C rows C7–C8) |
| A3 | `wienerdog memory quarantine forget <prefix>` | **TTY-gated.** Resolves `<prefix>` against `readAllowlist(paths.state).entries`; shows prefix, label and `approved_at`, states that the value was never stored, and states precisely what `forget` does and does not undo (Table E row E5); requires the typed word `forget`; then `removeAllowed`. Does **not** touch the ledger |
| A4 | the raw value is never an argument | there is no form that accepts a value on the command line — that would put a possible credential in shell history. The human selects by digest prefix, always |
| A5 | approval source | only a value physically present in a `state/quarantine/` copy **at approve time** can be *approved* (ADR-0033 decision 5). Review is retroactive by construction. (Re-running `allow` on an already-approved digest is not an approval — Table C row C9) |
| A6 | what the command never does | it never deletes, restores, moves or edits a quarantine copy; never reads or writes the vault; never calls `readVaultPath` / `readVaultLayout`; never writes `alerts.jsonl`, the digest, or any log. Emptying `state/quarantine/` stays a plain file operation the human performs |
| A7 | seams | `opts.promptFn`, `opts.paths`, `opts.out`, `opts.tty` are JS-level test seams and nothing else. **No argv flag and no environment variable reaches any of them.** `--yes` is never honored anywhere in this command, on any prompt; `src/cli/memory.js` contains no `process.env` read |
| A8 | prompt order in `allow` | label **first**, typed-word confirmation **last**, so the confirmation is the final act after everything has been shown |
| A9 | unknown sub-form | `wienerdog memory quarantine <anything-else>` throws `unknown quarantine command '<x>' — supported: (none), 'allow', 'forget'` |
| A10 | streams | governed by Table F. Nothing sensitive ever reaches `opts.out` |
| A11 | the review view sees through its own suppression | `quarantineCandidates` calls `clearAllowedDigests()` before scanning, because `bin/wienerdog.js` installs the approved digests before dispatch and `approvableRuns` omits already-approved runs. Without this, an approved value could never be shown as "still appears in N withheld notes" (ADR-0033 decision 9) and Table C row C9's recovery path could never resolve. The clear is process-scoped; this command scans nothing else, writes nothing, and the next invocation of any command re-installs from the file |

### Table B — refusals (canonical)

Every row throws `WienerdogError` (printed as `wienerdog: <message>`, exit 1)
except where noted. **No refusal ever prints a candidate value**, on any stream.

| Row | Condition | Message |
|-----|-----------|---------|
| B1 | `allow`/`forget` with no prefix | `which value? run \`wienerdog memory quarantine\` to list them, then pass the id in brackets` |
| B2 | prefix shorter than 12 characters, or not `/^[0-9a-f]+$/` | `that is not a value id — pass at least 12 hex characters, exactly as \`wienerdog memory quarantine\` printed them` |
| B3 | `allow` prefix matches neither a current candidate nor an allowlist entry | `no value matches '<prefix>' — run \`wienerdog memory quarantine\` to see what is currently withheld (a value can only be approved while a copy of it is in state/quarantine/)` |
| B4 | `allow` prefix matches more than one digest, counting candidates and allowlist entries together | `'<prefix>' matches <n> values — use more characters: <full digests, space-separated>` |
| B5 | `forget` prefix matches no entry / more than one | the `removeAllowed` refusal, surfaced unchanged |
| B6 | the resolved candidate fails `assertAllowable` | `refused: that value is a recognised credential (<labels>), not an unidentified high-entropy string — it can never be approved`. Belt and braces: candidates come from `approvableRuns`, which is post-`RULES`, so this should be unreachable. Checked at **resolve** time, before any output and before any write (Table C row C1) |
| B7 | empty label after `normalizeLabel` | re-prompt **once**, then cancel with `Cancelled — a description is required.` (exit 0), writing nothing |
| B8 | the typed word does not match exactly (after `.trim()`) | `Cancelled.` to **stdout**, exit 0, nothing written. Matches `memory approve`'s behaviour |
| B9 | no controlling terminal | `defaultPrompt`'s existing abort (it resolves `''`, which is not the typed word → row B8). The command writes nothing |
| B10 | `allow`, and `opts.tty` is `null` — i.e. `process.stderr` is not a terminal | `refusing to continue: this command must show you the full value, and standard error is not a terminal. Run it directly in a terminal, without redirecting or piping standard error.` Refused **before** anything is printed and before anything is read from `state/quarantine/`. Does not apply to the listing form, to `forget`, or to Table C row C9 (none of them shows a value) |
| B11 | `state/quarantine/` missing or unreadable | not an error: A1 prints `No withheld notes.` and the approved-entries section, exit 0 |

### Table C — the `allow` flow (canonical)

| Row | Step | Rule |
|-----|------|------|
| C1 | resolve, before any output | validate the prefix (B1, B2); read `readAllowlist(paths.state)`; if the prefix matches an **entry**, take the already-approved path (row C9) and stop. Otherwise build `quarantineCandidates`, drop every candidate whose digest is already an entry, and match. Refuse per B3/B4. Then call `assertAllowable(candidate.value)` (B6) — **before** anything is displayed and before any write, so a refusal cannot happen after the ledger has been cleared |
| C2 | require a terminal | if `opts.tty` is `null`, refuse per row B10, before reading or printing anything |
| C3 | show the full value | to `opts.tty` only, between two `----` rules, exactly like `memory approve` shows identity bytes. The human cannot decide from a mask |
| C4 | show provenance | to `opts.tty` only: the sanitized basename it was found in, and `before…value…after` context from `approvableRuns` (already post-`RULES`, so a labelled credential in the context is already `[REDACTED:<label>]`) |
| C5 | the warning text | fixed and code-owned, to `opts.tty`, stating (a) detector-wide, (b) permanent until undone, (c) that it also stops redaction in alerts, run evidence, the dream log and routine logs. Never model-authored, never assembled from file content |
| C6 | label prompt, then confirmation | label first, free text, `normalizeLabel`d, required (B7); then the typed word `allow`, exact after `.trim()` (B8) |
| C7 | **write order — the ledger clear comes FIRST** | after the typed word: `readLedger(paths.state)` → `clearSecretRevertRecords` → `writeLedger` **only when `cleared > 0`**; *then* `recordAllowed(paths.state, value, label)`. Rationale is a fail-safe argument and is binding — see "Why the ledger is cleared before the allowlist is written" in Implementation notes. Do not reverse it, and do not add a lock, a journal, or a repair command |
| C8 | report | to **stdout**: the cleared count first (`Cleared <n> secret-revert record(s); tonight's dream will retry those sessions.`, omitted when `cleared === 0`), then the approval line, then the two sentences of Table E row E5 scoped to `allow`, then the reminder that the copies in `state/quarantine/` are still the human's to restore or delete |
| C9 | already-approved digest — the recovery path | prints `wienerdog: that value was already approved on <date> — <label>. Nothing to approve.` to stdout, performs the row-C7 **ledger clear only** (no allowlist write), reports the cleared count, exits 0. **No TTY required, no value shown, no prompt** — it discloses nothing and grants nothing (the fence still applies to every retried run), so a confirmation would be ceremony over a no-op. This is what makes `allow` idempotent and makes the row-C7 crash window self-healing by re-running the same command |

### Table D — `clearSecretRevertRecords` (canonical)

| Row | Record | Action |
|-----|--------|--------|
| D1 | `outcome:'deferred'`, `reason:'secret-revert'` | removed |
| D2 | `outcome:'quarantined'`, `reason:'secret-revert-exhausted'` | removed |
| D3 | `outcome:'quarantined'`, reason `over-ceiling` / `too-many-lines` / `read-error` | untouched |
| D4 | `outcome:'processed'` | untouched |
| D5 | a present record that is not a plain object, or carries an unrecognized `outcome`/`reason` | **untouched**. Decided by an explicit exhaustive test, never by truthiness |
| D6 | `baseline_mtime`, `version` | untouched |
| D7 | return value | `{ledger, cleared}` where `cleared` is the number of records removed. **Pure** — the input ledger object and its `files` object are not mutated |
| D8 | who may call it | only `wienerdog memory quarantine allow` (both the confirmed path C7 and the recovery path C9). Never the dream, never `sync`, never `doctor`, never automatically, never on a timer |

### Table E — code-owned banner text (canonical)

Fixed templates. Only sanitized basenames and integers are interpolated: never a
value, never a digest, never a path, never note content, never model text. This
follows `WP-151`'s precedent — a durable, injected surface is built from bounded,
code-owned fields, never from free-form prose.

| Row | Surface | Exact text |
|-----|---------|-----------|
| E1 | `src/core/digest.js` `secretQuarantineWarn` (renders while `state/quarantine/` is non-empty) | `> [!warning] Wienerdog: ${n} dream note(s) were withheld from your vault because they appear to contain a secret — ${names}. Run \`wienerdog memory quarantine\` to review them: restore what you meant to keep, delete the rest, and permanently approve any value that is not a secret. This notice clears when state/quarantine/ is empty.` |
| E2 | `src/core/dream/ledger.js` `quarantineBannerLine`'s `secret-revert-exhausted` sentence | `> [!warning] Wienerdog: ${spent.length} session transcript(s) are no longer being dreamed over — the notes made from them were withheld by the secret check too many times in a row: ${files}. The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest. Run \`wienerdog memory quarantine\` to review the values that keep triggering it; approving one puts these sessions back in the rotation. The session files themselves are untouched.` |
| E3 | the intake sentence of `quarantineBannerLine` | **unchanged, byte for byte** — this WP does not touch the `over-ceiling` / `too-many-lines` / `read-error` line |
| E4 | rendering coverage | E1 is passed by `src/cli/dream.js` and `src/cli/sync.js` (unchanged); E2 by the same two through `quarantineBannerLine` (unchanged). Both are therefore re-rendered on every digest render, as ADR-0023 requires |
| E5 | the "prospective only" sentences, code-owned, used by `forget` and (scoped to approval) by `allow` | `forget`: `This only changes what happens FROM NOW ON. It does not undo anything: notes already committed to your vault with this value in them keep it, and so do any alerts, run evidence, dream logs or routine logs already written while it was approved. From now on, notes and digest sections containing it are withheld again.` — `allow` C8: `Anything already written while it was flagged stays as it is; anything already written unredacted stays unredacted.` |
| E6 | the code comment above E2 | replaces the shipped one. It must (a) drop the "Names NO command" clause, because this WP ships the command it names, and (b) **keep** the no-deferral-count rule verbatim in substance: `Names the review command — WP-quarantine-review-cli ships it. It still states NO deferral count: a file can also reach this state through an unreadable counter (secretDeferralCount returns the maximum for a garbled one), and a banner must not assert what the ledger cannot prove.` The literal string `memory quarantine` must appear **exactly once** in `ledger.js`, in E2 — not in the comment |
| E7 | what is never in a banner | a matched value, a candidate digest, a full path, transcript or note content, or any string derived from model output |

**End-to-end notification, which is a requirement and not a nice-to-have.** The
night a note is withheld, E1 appears in the digest injected at the next
SessionStart and names the withheld copies **and the command to run**. If the
deferrals are spent, E2 appears too and stays until the ledger records go. Both
clear themselves — E1 when `state/quarantine/` is emptied, E2 when the ledger
records go. Nothing here emails, uploads, or reports anything off the machine.

### Table F — disclosure surfaces (canonical)

`opts.out` defaults to `process.stdout` and is redirectable, pipeable and
loggable. `opts.tty` is `process.stderr` **only when `process.stderr.isTTY`**,
and `null` otherwise. There is no third stream and no `/dev/tty` write (it does
not exist on Windows, which this project supports).

| Row | Output | Stream | Note |
|-----|--------|--------|------|
| F1 | a candidate's **full value** | `opts.tty` **only** | the reason this table exists: a secret written to stdout lands in whatever the user redirected stdout to |
| F2 | a candidate's `before` / `after` context | `opts.tty` **only** | it is note content, post-`RULES` but otherwise raw |
| F3 | the fixed detector-wide warning (C5) | `opts.tty` | it belongs to the same block as F1/F2 and must not be separable from it |
| F4 | prompts (label, typed word) | `promptFn` | `defaultPrompt` already writes to stdout when stdin is a TTY and to stderr otherwise; do not change it |
| F5 | masked preview, digest prefix, label, `approved_at`, counts, sanitized basenames, sizes | `opts.out` | everything the listing prints |
| F6 | every refusal, `Cancelled.`, and the success report | `opts.out` (refusals via `WienerdogError`) | no refusal message may embed a value or a context string |
| F7 | when `opts.tty` is `null` | nothing sensitive is printed at all | the `allow` verb refuses per B10 **before** it reads `state/quarantine/`. The listing and `forget` are unaffected — neither shows a value |

### Mirrored Surface Checklist

Mirrors of **Table A** (CLI surface):

- [ ] the verb dispatch and `runQuarantine` in `src/cli/memory.js`
- [ ] the `USAGE` line in `bin/wienerdog.js` (A0)
- [ ] the two next-step command lines the listing prints (A1)
- [ ] the command name quoted inside Table E rows E1 and E2
- [ ] the Acceptance criteria naming a form
- [ ] the verification greps for the verb names and for the `USAGE` text

Mirrors of **Table B** (refusals):

- [ ] each `throw new WienerdogError(...)` in `runQuarantine`
- [ ] `removeAllowed`'s own refusals, surfaced unchanged (B5)
- [ ] the unit tests, one per row
- [ ] the Security checklist's "no refusal prints a value" item
- [ ] Table F row F6

Mirrors of **Table C** (the `allow` flow):

- [ ] the `allow` body in `src/cli/memory.js`
- [ ] the fixed warning string (C5)
- [ ] the write-order (C7) and the `cleared > 0` guard
- [ ] the already-approved recovery branch (C9)
- [ ] the report lines (C8)
- [ ] "Why the ledger is cleared before the allowlist is written" in Implementation notes
- [ ] the unit tests for cancel-writes-nothing, clear-before-record, and C9

Mirrors of **Table D** (`clearSecretRevertRecords`):

- [ ] the function body and JSDoc in `src/core/dream/ledger.js`
- [ ] its export
- [ ] the two call sites in `src/cli/memory.js` — C7 and C9 (D8)
- [ ] the `ledger.test.js` cases for D1–D7
- [ ] the point-in-time note about `WP-secret-revert-defers-ledger`'s
      `clearSecretRevert` absence assertion, in Implementation notes

Mirrors of **Table E** (banner text):

- [ ] the `secretQuarantineWarn` template in `src/core/digest.js`
- [ ] the `secret-revert-exhausted` sentence and its comment in `src/core/dream/ledger.js`
- [ ] the `digest.test.js` and `ledger.test.js` assertions
- [ ] the end-to-end notification paragraph above
- [ ] the `forget` and `allow` CLI text (E5)
- [ ] the verification greps for both sentences and for the comment rewrite

Mirrors of **Table F** (disclosure surfaces):

- [ ] the `out` / `tty` resolution in the dispatch block
- [ ] every write in `runQuarantine`
- [ ] refusal B10 and the C2 ordering
- [ ] the "full value never on stdout" unit test
- [ ] the Security checklist's disclosure items
- [ ] the verification greps over `out.write(`

## Implementation notes & constraints

- **No new npm dependency**, plain Node >= 18, no TypeScript, JSDoc types only.
- **`--yes` is never honored** anywhere in this command, in any form, on any
  prompt. Neither is any environment variable. The seams are `opts.promptFn`,
  `opts.paths`, `opts.out` and `opts.tty`, all JS-level, exactly as in
  `memory approve` and `grant`.
- **This command never writes the vault** and never needs one configured. Do not
  let `readVaultPath` run on the `quarantine` path — a user whose vault is
  missing must still be able to review.
- **Reading a quarantine copy's bytes is deliberate and bounded to this command.**
  Those files hold the raw withheld note. Nothing read here is written to any
  durable artifact: not the allowlist (digests only), not a banner, not a log,
  not an alert. The full value reaches the terminal and nowhere else (Table F).
- **`listSecretQuarantine` stays listing-only.** Do not change it to read
  contents; the CLI does its own bounded reads.
- **Size formatting** is a plain `KB`/`B` rendering from `fs.statSync().size`; no
  new dependency, no locale formatting.
- **Idempotence.** Running the listing twice changes nothing. Running `allow` on
  an already-approved digest is a reported no-op plus an idempotent ledger clear
  (Table C row C9).
- **No golden fixture may change.** `tests/golden/digest-default.md` renders with
  no banners; if a golden diff appears, stop and report it — this spec does not
  authorize a golden update.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Why the ledger is cleared before the allowlist is written

Two files are written and there is no atomic way to write both. Pick the order by
asking what each crash window leaves behind, and whether the user can get out of
it with the commands that exist.

- **Allowlist first, ledger second** (the obvious order, and the wrong one): a
  crash in between leaves a value approved *and* transcripts still carrying a
  `secret-revert-exhausted` record. That record is **sticky** — `selectState`
  skips it whatever the fingerprint — so those sessions are gone until something
  removes it. If `allow` treated "already approved" as a skip, nothing ever
  would, and the user's only remedy would be hand-editing
  `state/transcript-ledger.json`.
- **Ledger first, allowlist second** (this spec): a crash in between leaves
  nothing approved and the transcripts eligible again. The ordinary nightly cycle
  handles that exactly as it handles the first night: the note is withheld again,
  a fresh deferral is recorded, the banner reappears, and the user re-runs the
  same command. No state is unreachable.

Two further rules make the surviving window self-healing rather than merely
survivable, and both are **subtractions**:

1. `assertAllowable` is called at resolve time (Table C row C1), not left to
   `recordAllowed`. So the only way `recordAllowed` can fail after the ledger
   clear is a filesystem error, and re-running the command re-resolves the same
   candidate, clears nothing (already clear), and writes.
2. An already-approved digest is **not** a skip; it is a recovery path that still
   clears the ledger (Table C row C9). Combined with Table A row A11, which makes
   the resolver see approved values, this means the same one command repairs
   every intermediate state. **There is no repair command and there must not be
   one.**

### The `clearSecretRevert` absence assertion in the merged sibling spec

`docs/specs/WP-secret-revert-defers-ledger.md` line 1000 carries
`test "$(grep -rl 'clearSecretRevert' src/ | wc -l | tr -d ' ')" = 0`. This WP
adds `clearSecretRevertRecords` to `src/`, so that line would fail if re-run
after this WP merges.

**Resolution: it is a point-in-time evidence step for that WP's own PR, and it is
left alone.** Three reasons, in order of weight:

1. Nothing re-runs it. `npm test` is `node tests/run.js` and `npm run lint` is
   `node scripts/lint.js`; neither reads a spec's verification block, and no CI
   workflow does either. A spec's "Verification steps" section is evidence pasted
   into one PR body, not a standing invariant.
2. It was run and passed at that WP's merge commit (`efd1489`). Editing it now
   would falsify the record of what was actually executed for that PR.
3. Under the One-Document Rule (ADR-0005), this WP's implementer reads this spec
   and `CLAUDE.md` only, and never opens that spec — so nobody trips over it in
   the course of this work.

That spec's Out-of-scope also *forbids* editing it, and its Out-of-scope text
already anticipates this WP by name ("Clearing is `WP-quarantine-review-cli`'s,
behind its confirmation flow"). Adding it to this WP's Deliverables for a
one-line amendment would buy nothing and would widen a permission boundary.
**Do not edit `docs/specs/WP-secret-revert-defers-ledger.md`.**

## Security checklist (this WP touches untrusted input)

- [ ] The digest prefix is the only user-supplied string in the command. It is
      validated `/^[0-9a-f]{12,}$/` **before** any use, is compared only against
      in-memory digests, and never reaches a filesystem path or a shell command.
      No path segment, no `..`, no `/` can enter.
- [ ] Quarantine basenames are attacker-influenceable (they derive from a vault
      path the brain chose). Every basename printed or interpolated into a banner
      passes the `[A-Za-z0-9._-]` whitelist first, exactly as
      `listSecretQuarantine` does.
- [ ] Directory entries are read with `readdirSync` and each candidate path is
      built as `path.join(quarantineDir, entry)` from that listing — never from
      user input. Dot-prefixed entries are skipped.
- [ ] The human-written label is `normalizeLabel`d (control characters stripped,
      whitespace collapsed, capped at 120) before it is persisted, so it cannot
      inject a line into the listing or any future surface.
- [ ] A candidate value reaches **only** a stream that is a terminal, and only
      inside the `allow` flow after the human asked for that specific value
      (Table F). It is never written to stdout, the allowlist, a banner, a log,
      an alert, or an error message. When stderr is not a terminal the command
      refuses before printing or reading anything (row B10).
- [ ] `assertAllowable` is re-checked at approve time (Table B row B6, Table C
      row C1), so even a future change to candidate derivation cannot let a
      labelled provider match through.
- [ ] The allowlist file keeps its 0600 mode and the ledger its 0600 mode; both
      writes go through the existing atomic writers. No new file is created.
- [ ] `clearSecretRevertRecords` grants no trust: a cleared transcript is
      re-dreamed and its output still passes the EP2 gate in full. Nothing
      unattended calls it (Table D row D8).

### Residual: a terminal is not a person

**State this honestly and do not overclaim it.** The `allow` and `forget` writes
are gated on a typed word read from a controlling terminal. That proves a
**terminal**, not a **human**. A model with PTY shell access on this machine can
type `allow` exactly as a person can. `process.stdin.isTTY`, `/dev/tty` and
`process.stderr.isTTY` are all satisfied by a pseudo-terminal.

This is **not a regression introduced here**: it is precisely the boundary
`wienerdog grant` (ADR-0007) and `wienerdog memory approve` (ADR-0021) have
always had, and ADR-0033's own boundary statement already says this is "not an OS
security boundary" — same-UID native code can rewrite the allowlist directly
(`docs/THREAT-MODEL.md` T0). Inventing a stronger authenticator here — a
passphrase, a hardware prompt, a signed token — would fork the idiom for one
command and would still be same-UID-defeatable. This WP does not attempt it.

What this WP *does* buy, and it is worth stating because it is real:

1. **Every approval is durably attributable and auditable after the fact.** Each
   entry carries a human-written `label`, an `approved_at` timestamp and
   `source:'approved'`, and `wienerdog memory quarantine` is a read-only view of
   exactly that. An approval nobody remembers making is visible the first time
   the user looks.
2. **Revocation is a first-class command.** `forget <prefix>` exists precisely so
   an unrecognised entry can be removed without editing JSON.
3. **The blast radius is bounded by construction, not by the prompt.** An
   approval can only be created from a value physically present in
   `state/quarantine/` at approve time (row A5) — the fence must already have
   caught and preserved it — and it can only ever suppress a `high-entropy`
   finding, never a labelled provider match (ADR-0033 decision 3, enforced
   structurally *and* by `assertAllowable`). There is no way to pre-approve an
   arbitrary future credential.

What it does **not** buy: an unattended approval is *discoverable* but not
*announced*. Nothing pushes "a new value was approved last night" into the user's
face the way a withheld note is pushed by banner E1. Closing that gap means a
standing, state-driven digest banner listing the current approvals — which is a
new durable injected surface, and every durable injected surface in this repo
carries an explicit owner sign-off (see the `OWNER-APPROVED` markers on the
quarantine and insecure-modes banners in `src/core/digest.js`). It also requires
`src/cli/dream.js` and `src/cli/sync.js` to pass a new field, which is outside
this WP's Deliverables. **It is therefore not in this WP**, and it is put to the
owner below rather than assumed.

> **OWNER-DECISION-REQUIRED — EMPTY.**
>
> Question: should a standing, state-driven digest banner announce that values
> are currently on the secret allowlist, so an approval made without the owner's
> knowledge cannot stay quiet?
>
> Proposed shape if yes (a separate follow-up WP, not this one): a
> `renderDigest` banner rendered while `state/secret-allowlist.json` has at
> least one entry, reading
>
> ```text
> > [!warning] Wienerdog: <n> value(s) are permanently approved as not-secret
> and are no longer redacted anywhere — <labels>. Run `wienerdog memory
> quarantine` to review or undo.
> ```
>
> labels only (never a digest, never a value), `normalizeLabel`-bounded so it
> cannot inject a line, state-driven and self-clearing exactly like E1, derived
> at read time with no counter and no history file. Files it would touch:
> `src/core/digest.js`, `src/cli/dream.js`, `src/cli/sync.js` and their tests.
>
> Cost if yes: a permanent banner in every digest for as long as any value is
> approved — deliberately, since that is the point.
>
> Nothing here is ratified. Gyula fills this in; no agent message substitutes
> for it.

## Acceptance criteria

**Every new test listed here must be provable to fail before the change.** The
"Mutation checks" section below gives the one-line source mutation that must turn
each key test red; run them, and say so in the PR body. A test that passes
against unmodified `main` is not evidence.

Naming: **every** new test in `tests/unit/memory-cli.test.js` has a name starting
with `memory quarantine` followed by a space — a verification step counts them
by that exact prefix, so a test that is
declared but never named that way is caught. The floor that step enforces is
**16**, from this minimum set: one separately-named test for each Table B row
this command can produce (**B1, B2, B3, B4, B7, B8, B10, B11** — eight; B5 is
covered under `forget`, B6 is unreachable by construction, B9 belongs to
`defaultPrompt`), plus the twelve behaviour tests below (empty listing; masked
listing; oversize copy; A11 recurrence; stream separation; entry shape and mode;
ledger cleared; write order; recovery path; end-to-end scan; `forget` confirms;
`forget` cancels).

- [ ] `wienerdog memory approve profile` behaves exactly as before, and
      `tests/unit/memory-cli.test.js` has **zero deleted lines** relative to
      `main` (verification asserts this; if a deletion is genuinely unavoidable,
      stop and report it as a spec bug rather than making it).
- [ ] `wienerdog memory quarantine` with an empty/absent `state/quarantine/` and
      an empty allowlist prints `No withheld notes.`, exits 0, prompts for
      nothing, and creates no file in `state/` (Table B row B11).
- [ ] The listing shows a candidate's 12-character digest prefix, its character
      length, its source basename and a masked preview, and the captured stdout
      contains **no 12-character substring** of the 44-character fixture token
      (Table A row A1, Table F row F5).
- [ ] The listing marks a quarantine copy larger than `ScanLimits.SCAN_MAX_BYTES`
      with a trailing `(too large to review)` and offers no candidate from it.
- [ ] The listing shows an approved entry's prefix, label, date and the number of
      withheld copies that still contain it — proving Table A row A11, since a
      digest installed via `setAllowedDigests` would otherwise be invisible — and
      omits that digest from the candidate section.
- [ ] `allow` with no prefix, an 11-character prefix, a non-hex prefix, an
      unmatched prefix, and an ambiguous prefix each produce the Table B message,
      write nothing, and print no part of any value on either stream.
- [ ] `allow <prefix>` with `opts.tty` set to `null` refuses per row B10, writes
      nothing, prints nothing on either stream containing the value, and never
      prompts.
- [ ] `allow <prefix>` writes the full value to the injected `tty` stream and
      **not** to the injected `out` stream: assert `tty` contains the whole
      44-character token and `out` contains no 12-character substring of it
      (Table F rows F1/F2).
- [ ] `allow <prefix>` where the typed word is not `allow` prints `Cancelled.`
      to `out`, exits 0, and leaves `secret-allowlist.json` and
      `transcript-ledger.json` byte-identical.
- [ ] `allow <prefix>` with an empty label re-prompts once, then cancels and
      writes nothing (Table B row B7).
- [ ] A successful `allow` writes exactly one entry with the normalized label,
      `source:'approved'` and a 64-hex key; the file is mode `0600`.
- [ ] A successful `allow` removes every `secret-revert` deferral and every
      `secret-revert-exhausted` quarantine from the ledger, leaves `processed`
      records, intake quarantines and a corrupt record untouched, and reports the
      cleared count (Tables C and D).
- [ ] **Write order (Table C row C7).** With `secret-allowlist.json` pre-created
      as a *directory* so `writeAllowlist`'s rename fails, `allow` throws, and
      the ledger **has been cleared** — proving the clear ran first. Re-running
      the command after removing the directory then succeeds and reports
      `cleared === 0`.
- [ ] **Recovery path (Table C row C9).** `allow` on a digest already in the
      allowlist, with `opts.tty` `null` and a `promptFn` that throws if called:
      prints the already-approved line, clears the ledger, reports the count,
      exits 0, prompts nothing, and leaves `secret-allowlist.json` byte-identical.
- [ ] End to end through the CLI: after a successful `allow`, re-installing the
      digests with `setAllowedDigests(allowedDigests(stateDir))` makes
      `scanAndRedact` return the fixture text unchanged with zero findings.
- [ ] `forget <prefix>` shows label and date, never a value; its output states
      that it undoes nothing already written (Table E row E5); on the typed word
      it removes the entry; on anything else it cancels and writes nothing; it
      never touches the ledger.
- [ ] `clearSecretRevertRecords` satisfies Table D rows D1–D7 as pure-function
      unit tests, including `cleared === 0` on a ledger with no such records, a
      corrupt record left in place, and the input ledger object provably
      unmutated.
- [ ] `renderDigest` emits Table E row E1 verbatim when `secretQuarantine` is
      non-empty, emits nothing when it is empty, and no longer emits the old
      sentence.
- [ ] `quarantineBannerLine` emits Table E row E2 verbatim for a
      `secret-revert-exhausted` record, contains no deferral count, and emits
      Table E row E3 **byte-identical to before** for intake reasons.
- [ ] No file under `tests/golden/` changes.
- [ ] `npm test` and `npm run lint` pass.

### Mutation checks (prove each test fails before the fix)

Apply each mutation to your own finished branch, confirm the named test goes red,
then revert it. Paste the list with a pass/fail mark into the PR body. **Do not
use `--test-name-pattern`** for any of this: a pattern that matches zero tests
exits 0 and looks like success. Run whole files.

| Test | Mutation that must turn it red |
|------|-------------------------------|
| full value never on stdout (F1) | change the value write from `tty.write(` to `out.write(` |
| B10 refusal | delete the `opts.tty === null` check |
| write order (C7) | swap the two writes so `recordAllowed` runs before the ledger clear — the "ledger has been cleared" assertion must fail |
| recovery path (C9) | make the already-approved branch `return` before the ledger clear |
| A11 sees through suppression | delete the `clearAllowedDigests()` call in `quarantineCandidates` |
| cancel writes nothing (B8) | move `recordAllowed` above the typed-word check |
| D4 / D5 (untouched records) | broaden the removal predicate to `if (rec)` — the exhaustive-switch mutation this repo has hit before |
| D7 purity | mutate `ledger.files` in place instead of building a new object |
| E1 verbatim | delete the phrase `and permanently approve any value that is not a secret` |
| E2 verbatim | delete the sentence naming `wienerdog memory quarantine` |
| E2 no-count rule (E6) | interpolate `SECRET_REVERT_MAX_DEFERRALS` into the spent-banner sentence |
| B2 prefix validation | delete the `/^[0-9a-f]{12,}$/` test |
| A6 no vault on this path | add `readVaultPath(paths.config)` inside `runQuarantine` — the verification step below must fail |

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint

# ── Non-vacuity first. Every absence assertion below is green on a file that
# ── does not exist or that no longer has the shape we think it has, so prove
# ── the shape before asserting over it.
test -f src/cli/memory.js && test -f src/core/dream/ledger.js && test -f src/core/digest.js
test "$(grep -c '^async function runQuarantine(args, opts) {' src/cli/memory.js)" = 1
test "$(grep -c '^function clearSecretRevertRecords(ledger) {' src/core/dream/ledger.js)" = 1

# ── Table A row A0: the USAGE line says the new thing (0 before, 1 after).
test "$(grep -c 'review notes the secret check withheld' bin/wienerdog.js)" = 1
test "$(grep -c 'Approve identity-note changes so they inject' bin/wienerdog.js)" = 0

# ── Table A rows A2/A3/A9: the three forms exist and the unknown form refuses.
test "$(grep -c "'allow'" src/cli/memory.js)" -ge 1
test "$(grep -c "'forget'" src/cli/memory.js)" -ge 1
test "$(grep -c 'unknown quarantine command' src/cli/memory.js)" = 1

# ── Table A row A7 / Security: no headless bypass, no env seam.
test "$(grep -c -- '--yes' src/cli/memory.js)" = 0
test "$(grep -c 'process.env' src/cli/memory.js)" = 0
test "$(grep -c "require('./grant')" src/cli/memory.js)" = 1

# ── Table A row A6: runQuarantine never looks up the vault. Extract its body by
# ── the pinned declaration anchor, prove the extract is non-empty, then assert.
qbody="$(awk '/^async function runQuarantine\(args, opts\) \{/{n=1} n; /^\}/{if(n) exit}' src/cli/memory.js)"
test -n "$qbody"
test "$(printf '%s\n' "$qbody" | grep -c 'readVaultPath\|readVaultLayout')" = 0

# ── Table A row A11: the review view clears the installed digests, and it is the
# ── only place in src/cli/ that does.
test "$(grep -c 'clearAllowedDigests' src/cli/memory.js)" -ge 1
test "$(grep -rl 'clearAllowedDigests' src/cli/ | wc -l | tr -d ' ')" = 1

# ── Table F rows F1/F2: no candidate field is ever handed to the stdout stream.
# ── These greps are a supplement — the real oracle is the injected-stream unit
# ── test, because a value can reach stdout through a variable.
test "$(grep -c 'out.write(.*\.value' src/cli/memory.js)" = 0
test "$(grep -c 'out.write(.*\.before\|out.write(.*\.after' src/cli/memory.js)" = 0
grep -n 'out.write(' src/cli/memory.js   # READ THESE: each argument must be a
                                         # code-owned template carrying only
                                         # counts, digest prefixes, labels and
                                         # sanitized basenames

# ── Table D row D8: exactly two files mention the clear, and neither is unattended.
test "$(grep -rl 'clearSecretRevertRecords' src/ | wc -l | tr -d ' ')" = 2
test "$(grep -c 'clearSecretRevertRecords' src/cli/memory.js)" -ge 1
test "$(grep -c 'clearSecretRevertRecords' src/cli/dream.js)" = 0
test "$(grep -c 'clearSecretRevertRecords' src/cli/sync.js)" = 0
grep -rn 'clearSecretRevertRecords' src/ | sort   # definition, export, call site(s)

# ── Table E row E1: the NEW sentence is in, the OLD one is out. Both halves are
# ── required — the two texts share their opening clause, so a grep for the
# ── shared part would be green before AND after and would prove nothing.
test "$(grep -c 'permanently approve any value that is not a secret' src/core/digest.js)" = 1
test "$(grep -c 'delete the rest; this notice clears when the folder is empty' src/core/digest.js)" = 0
test "$(grep -c 'memory quarantine' src/core/digest.js)" = 1

# ── Table E rows E2/E6: the banner names the command, the comment no longer
# ── claims it names none, and the literal command string appears exactly once.
test "$(grep -c 'approving one puts these sessions back in the rotation' src/core/dream/ledger.js)" = 1
test "$(grep -c 'Names NO command' src/core/dream/ledger.js)" = 0
test "$(grep -c 'memory quarantine' src/core/dream/ledger.js)" = 1

# ── Table E row E2, the no-deferral-count rule. Extract the spent-banner arm and
# ── prove no count was interpolated into it.
sbody="$(awk '/if \(spent.length > 0\) \{/{n=1} n; /^  \}/{if(n) exit}' src/core/dream/ledger.js)"
test -n "$sbody"
test "$(printf '%s\n' "$sbody" | grep -c 'SECRET_REVERT_MAX_DEFERRALS\|deferrals')" = 0

# ── Table E row E3: the intake sentence is byte-identical to main. Assert over
# ── REMOVED lines only — a whole-diff grep would also match context lines and
# ── would flip on an unrelated nearby edit.
test "$(git diff main -- src/core/dream/ledger.js | grep '^-' | grep -c 'could not be read and were skipped')" = 0
test "$(grep -c 'could not be read and were skipped' src/core/dream/ledger.js)" = 1

# ── Acceptance: memory-cli.test.js is additive only, and the new tests exist and
# ── are named so they cannot be silently absent. The floor is the enumeration in
# ── the Acceptance criteria: 8 refusal tests + 12 behaviour tests.
test "$(git diff main -- tests/unit/memory-cli.test.js | grep -c '^-[^-]')" = 0
test "$(grep -c "^test('memory quarantine " tests/unit/memory-cli.test.js)" -ge 16

# ── No golden fixture moved.
test -z "$(git status --porcelain tests/golden/)"

# ── Focused suites. Run whole files: --test-name-pattern is forbidden here,
# ── because a pattern matching zero tests exits 0 and looks like a pass.
node --test tests/unit/memory-cli.test.js
node --test tests/unit/digest.test.js
node --test tests/unit/ledger.test.js
```

## Out of scope (do NOT do these)

- **A review skill.** `wienerdog-quarantine-review` is a deferred follow-up WP.
  Adding a shipped skill drags in the skill install/copy list, the runtime skill
  digests and the manifest; the deterministic CLI is the security boundary and is
  self-sufficient, and the banners name it directly.
- **The standing "approved values" digest banner.** It is in the
  `OWNER-DECISION-REQUIRED` block above, unratified, and would touch
  `src/cli/dream.js` and `src/cli/sync.js`, which are not in the Deliverables
  table. Do not build it, and do not add a smaller version of it.
- Deleting, restoring, moving or editing anything in `state/quarantine/`. That
  stays a plain file operation the human performs (Table A row A6).
- Changing `listSecretQuarantine`, the EP2 gate, the EP4 gate, the detector, any
  entropy threshold, or the P0 suppressor.
- Changing `recordAllowed` / `removeAllowed` / `assertAllowable` /
  `approvableRuns` / `setAllowedDigests` / `clearAllowedDigests`. They are
  `WP-secret-allowlist-exact-value-store`'s contract; call them, do not edit them.
- Changing the deferral behaviour, `SECRET_REVERT_MAX_DEFERRALS`,
  `secretDeferralCount`, `selectState`, or the intake quarantine reasons. They
  are `WP-secret-revert-defers-ledger`'s contract.
- Any automatic clearing of a deferral or an exhausted quarantine (Table D row
  D8), and any separate "repair" verb.
- A lock file, a write journal, or a two-phase commit across the allowlist and
  the ledger. Table C row C7's ordering plus row C9's idempotence is the answer.
- Any accumulated counter, history file, or usage record. Every number the
  listing prints is derived at read time from files already on disk (ADR-0004).
- Adding an install-manifest entry: `state/` is disposed wholesale on uninstall
  (ADR-0019).
- Editing any ADR, or any other spec, including the two prerequisites — in
  particular `docs/specs/WP-secret-revert-defers-ledger.md`, whose
  `clearSecretRevert` absence assertion is point-in-time and deliberately left as
  it is (see Implementation notes).
- Updating any file under `tests/golden/`.

## Definition of done

1. Both `depends_on` WPs have merged to `main`. Concretely: `src/core/secret-allowlist.js`
   exists and `src/core/secret-scan.js` exports `approvableRuns`. If not, stop.
2. All verification steps pass locally; output pasted into the PR body.
3. Every row of "Mutation checks" was applied, confirmed red, and reverted; the
   list is in the PR body.
4. Conventional commits; PR titled
   `feat(memory): review withheld notes and approve exact values (WP-quarantine-review-cli)`.
5. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
6. This spec's `status:` flipped to `In-Review` in the same PR.
