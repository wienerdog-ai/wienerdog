---
id: WP-refusal-remedy-discriminator
title: Choose the refusal remedy from a structured verdict class, so an app-tree tamper never tells the user to run `wienerdog sync`
status: Draft
model: sonnet
size: M
depends_on: [WP-stance-authority-containment]
adrs: [ADR-0004, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-refusal-remedy-discriminator: the remedy is a class, not a constant

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly "dream", plus optional routines) with the
OS's own scheduler. **IRON RULE (ADR-0004): Wienerdog is just files** — nothing
listens, nothing serves, nothing outlives its job. This WP adds no process, no
daemon, no telemetry; it changes one sentence of text and adds one field to an
in-memory return value.

The scheduler entry does not invoke the app directly. It invokes an **independent
launcher** vendored at `<core>/launcher/launch.js`, *outside* the mutable app tree
(`<core>/app/current`). Before it spawns anything, the launcher verifies four
things (ADR-0028): `current` resolves inside `<core>/app` and is user-owned; the
live app tree content-addresses to the digest recorded in the job's authorization
**descriptor**; the descriptor's production/dev **stance** matches what is live;
and the re-derived descriptor digest equals the digest bound into the OS entry.
Any mismatch ⇒ a durable alert appended to `<core>/state/alerts.jsonl`, a line on
stderr, exit 1, and **zero** spawn. The alert is re-rendered into the next
injected session **digest banner**, which is how the user actually finds out.

Every one of those refusals ends with the same sentence:

> If the change was intentional, run `wienerdog sync`; otherwise investigate.

For most mismatch classes that advice is correct. For the **app-tree** classes it
is actively harmful, and this WP is only about that. `wienerdog sync` re-vendors
the install by running out of the very tree it is re-vendoring: `vendorSelf` ends
by calling `writeLauncher(paths, {manifest})` with no `sourceRoot`, so the source
root falls back to `packageRoot()` — which on a production install reached through
the shim *is* `realpath(<core>/app/current)`, the writable tree. An attended
`sync` therefore **republishes `<app tree>/src/scheduler/launcher.js` over the
out-of-tree verifier at `<core>/launcher/launch.js`**. `WP-stance-authority-containment`
records this as its Table G row **S1**: known-open, deliberately not fixed there,
routed to the owner, with the amplification stated in as many words — *a tree-digest
refusal instructs the user to perform the exact act that installs the attacker's
launcher.*

So today, when the app files have been tampered with, the product's own refusal
banner tells the user to run the one command that completes the compromise. That
is the whole of what this WP fixes, and it fixes it in the smallest possible way:
the verdict object each verifier returns gains a small enumerated **`remedy`**
field, and the banner's final sentence is selected from that field instead of
being a constant. The reason string stays exactly as it is — it is the human
explanation, not the decision input. Nothing string-matches the reason text.

**The same amplification exists without touching the app tree at all, and it is
what sets the assignment rule in block R-P.** `currentBin` (`src/core/vendor.js:23`)
is `path.join(<core>/app/current, 'bin', 'wienerdog.js')`, and `writeShim`
(`src/core/vendor.js:310-314`) writes the user's `wienerdog` shim as literally
`exec node "<currentBin>" "$@"` — the symlink is resolved at **exec** time. So an
attacker who drops a package anywhere in `$HOME` and rewrites **one symlink**,
`<core>/app/current`, gets the same win more cheaply than S1 (one symlink write
versus writing a read-only published tree): the nightly fire refuses correctly on
the repoint, the banner says *"run `wienerdog sync`"*, the user types it, the shim
follows the repoint, and `vendorSelf` → `writeLauncher` republishes
`<core>/launcher/launch.js` from the attacker's root. A dev variant needs no
attacker at all: `current` pointing at dev checkout **B** while the descriptor
authorizes checkout **A** means an attended `sync` runs from B and installs B's
launcher. Both are refusals where a **descriptor field** says the tree is fine and
**live state has just falsified it** — which is why this WP's rule demands an
executed comparison, never a descriptor assertion, before it names `sync`.

This WP does **not** close S1. A sibling work package addresses the republish
itself and the structural channel goes to an ADR; see "Out of scope".

**Cross-WP constraint you must not violate.** The sibling
`WP-launcher-no-self-resync-republish` changes `sync` so that, once it merges, an
attended `wienerdog sync` **no longer refreshes `<core>/launcher/launch.js` on a
prod install**. Nothing this WP writes — not the banner, not the runbook
subsection, not the README or threat-model prose — may promise that `sync`
repairs or re-publishes the launcher. Do not open or edit that spec.

## Current state

### 1. The single refusal banner — `src/scheduler/launcher.js:436-448`

`main` defines one closure. It has no branch: every refusal, from every reason
class, gets the identical tail.

```js
  /** Refuse: fixed durable alert (never a bare throw — F13) pointing at the real
   *  surface (the next digest banner) + the real remedy (`wienerdog sync`), NOT
   *  `wienerdog doctor` which reads no A7 state (F27). Zero spawn, non-zero exit. */
  const refuse = (jobName, why) => {
    const reason =
      `wienerdog: refusing to run "${jobName}" — ${why} (integrity mismatch); no job was run. ` +
      'This alert will appear in your next digest. If the change was intentional, run ' +
      '`wienerdog sync`; otherwise investigate.';
    appendRefuseAlert(p, jobName, reason);
    process.stderr.write(`${reason}\n`);
    exit(1);
    return 1;
  };
```

Its own doc comment calls `wienerdog sync` *"the real remedy"*. It has exactly two
call sites, both in `main`:

```js
450:  if (error) return refuse(name || 'unknown', error);
461:  if (!verdict.ok) return refuse(name, verdict.reason);
```

### 2. The defect, executed on this branch (not asserted — run)

Built a real temp prod install (a `.git`-free copy of the package vendored into
`<core>/app/<version>`, real config, real exec pins, real descriptor), appended
bytes to `<app tree>/package.json`, and called `launcher.main` with an injected
`spawn`. Verbatim stderr:

```
wienerdog: refusing to run "dream" — the live app tree does not match the descriptor (app files changed since sync) (integrity mismatch); no job was run. This alert will appear in your next digest. If the change was intentional, run `wienerdog sync`; otherwise investigate.
```

`spawned=false`, `code=1`, and the identical string lands in `alerts.jsonl`:

```
{"job":"dream","at":"2026-07-26T15:12:31.922Z","reason":"wienerdog: refusing to run \"dream\" — the live app tree does not match the descriptor (app files changed since sync) (integrity mismatch); no job was run. This alert will appear in your next digest. If the change was intentional, run `wienerdog sync`; otherwise investigate.","log_hint":""}
```

The catch-up path, same run, `--expect-digest sha256:nope`:

```
wienerdog: refusing to run "--catch-up" — the live app tree does not match the scheduled digest (app files changed since sync) (integrity mismatch); no job was run. This alert will appear in your next digest. If the change was intentional, run `wienerdog sync`; otherwise investigate.
```

### 3. The contrast that proves the discrimination is real

The **descriptor-drift** reasons say in their own text that sync is required —
and for them it is, because they are only reached *after* block R-P's tie-back
check has passed (on a prod install, the tree proven byte-identical to the
descriptor; on a dev install, `app/current` proven to be exactly the authorized
checkout root). Same run, a `config.yaml` `run`-action edit without a sync, on a
prod install:

```
wienerdog: refusing to run "dream" — the job descriptor changed since it was scheduled (run/model/timeout/schedule/home/pin/app drift) — a `wienerdog sync` is required to re-authorize it (integrity mismatch); no job was run. This alert will appear in your next digest. If the change was intentional, run `wienerdog sync`; otherwise investigate.
```

That banner must survive this WP **byte for byte**.

### 4. The refusal return sites

Executed greps on `src/scheduler/launcher.js` at this branch's HEAD:

```
return { ok: false, reason:   -> 17     (the two verifiers' verdicts)
return { ok: false, why:      ->  4     (verifyContainment, an internal helper)
ok:false  (no space, JSDoc)   ->  3     (type annotations only — no collision)
```

`verifyContainment` returns a different shape (`why`, not `reason`) and is an
internal helper whose failures are re-wrapped by the two propagation sites inside
the verifiers. It is **not** a verdict site and is not touched.

Your tree will have **16** `reason` sites, not 17 — see Table S and the STOP rule.

### 5. Consumers of the verdict object

`grep -rn "verifyAndResolve\|verifyCatchup" src tests` outside `launcher.js`
returns only `tests/unit/launcher.test.js`. Nothing else reads a verdict, so
adding a field breaks no caller.

### 6. Surfaces that already assert on this text, and what they assert

- `tests/unit/launcher.test.js:166,436,518` — `/refusing to run/` (the prefix,
  unchanged).
- `tests/unit/launcher.test.js:525` — the F27 test, `/wienerdog sync/` +
  `/next digest/` + `doesNotMatch(/wienerdog doctor/)`. It drives a **descriptor
  drift** (`jobsLib.saveJob(paths, {...DREAM_JOB, run: 'skill:wienerdog-weekly-review'})`),
  i.e. a site that keeps the `sync` remedy. **It must pass unmodified.**
- `tests/scenarios/a7-integrity/fixtures/cases.js:25-32` — six `reasonRe`
  regexes. All six match fragments of the **reason** (`/the live app tree does not
  match the descriptor/`, `/the job descriptor changed since it was scheduled/`,
  …); none matches the remedy tail. `run-a7-integrity.js:125` asserts
  `code === 1 && calls.length === 0 && c.reasonRe.test(alerts)`.
  `tests/scenarios/a7-integrity/README.md:19` relies on `/integrity mismatch/`
  being unconditional in the banner — it stays unconditional. **The whole a7
  scenario is unaffected and is not a Deliverable.** Executed green on this
  branch: `WIENERDOG_RUN_SCENARIOS=1 WIENERDOG_TEST_NO_REAL_SCHEDULER=1 npm run
  scenarios:a7-integrity` ⇒ `PASS`.
- No golden fixture contains the banner. `grep -rn "If the change was intentional"`
  over the repo returns exactly one code hit: `src/scheduler/launcher.js:442`.

### 7. Three user-facing documents that mirror the remedy and become false

- `README.md`, the "Scheduled runs are verified before they run" bullet:
  *"Edits to `config.yaml` or the app tree made outside `wienerdog sync` don't
  change what runs — the job refuses with an alert instead (fail closed; the fix
  is one `wienerdog sync`)."*
- `docs/runbooks/scheduler-and-executable-integrity.md`, the level-2 heading that
  reads **The fix: `wienerdog sync`**, whose first sentence is *"For almost every
  mismatch, the fix is a single command"*. This is the runbook a user reaches
  from a refusal, and one of the mismatches it covers is *"The app code under
  `app/current` changed"*.
- `docs/THREAT-MODEL.md`, two spans: *"The one remedy is `wienerdog sync`."* and
  *"The runbook and the launcher's own refuse text point to the digest banner and
  `wienerdog sync`, never to `doctor`."*

All three are Deliverables. Leaving them stating the amplification as the
protection would defeat the code change for any user who follows them.

### 8. Alert plumbing (unchanged, but sized)

`appendRefuseAlert` (`launcher.js:157-190`) writes `{job, at, reason, log_hint}`
to `<core>/state/alerts.jsonl`; `src/core/alerts.js:47` caps each field at
`MAX_FIELD_CHARS = 2000`; `src/core/digest.js` `formatAlerts` renders
`lastReason` verbatim into the banner. **Banner length is per reason string**, so
it is stated per reason and never as a single before/after pair. Swapping tail
R-T1 for tail R-T2 is a fixed **+124** characters for the same reason: the new
banner is always *longer* than today's, never shorter. Measured this session by
executing the R-T0/R-T1/R-T2 blocks below against the live reason strings **and
each site's real `jobName`** (row 15's is the `--catch-up` sentinel, not `dream` —
a round-2 mismeasurement, corrected here):

| reason (Table S row) | `jobName` | today (R-T1 tail) | after this WP |
|---|---|---|---|
| prod tree mismatch (row 9) | `dream` | 273 | **397** (R-T2) |
| catch-up tree mismatch (row 15) | `--catch-up` | 284 | **408** (R-T2) |
| dev `current` repointed (row 4) | `dream` | 286 | **410** (R-T2) |
| dev descriptor drift (row 6) | `dream` | 340 | 340 — keeps R-T1, unchanged |
| prod descriptor drift (row 11) | `dream` | 344 | 344 — keeps R-T1, unchanged |

The longest fixed-length banner this WP can produce is **410**. The only reason
string with no fixed length is the two outer `catch` sites' `integrity check
errored: ${err.message}`, whose length is `err.message`'s — unbounded today and
unbounded after, and handled by the same 2000-char field cap as today. Nothing
truncates that does not truncate today. No plumbing change is needed and none is
authorized.

**Do not use these numbers as a proof of anything but "nothing truncates."** In
particular, do not write a test that asserts a banner length — T1 asserts
byte-identity against a literal, which is the stronger and stabler check.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

Five files. New non-test source is ≈ 30 lines (one lookup object, two small pure
functions, one changed closure signature, two changed call sites, one `let tied`
declaration plus two assignments, plus a one-token `remedy:` added to each
existing verdict-return line). The three prose edits are supplied verbatim in
Table M — transcribe them, do not compose.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/launcher.js | **D1** — add `REMEDY_TAIL`, `refusalText` and `remedyOf` (Exact contracts) and **export `refusalText` and `remedyOf`**. **D2** — `refuse` takes a third parameter and delegates to `refusalText`; its doc comment (`:436-438`) is rewritten per Table R. **D3** — both `refuse` call sites pass a remedy explicitly (`:450` → `'reinstall'`; `:461` → `remedyOf(verdict)`, **not** a bare `verdict.remedy` — see Table R's ownership row). **D4** — every `return { ok: false, reason: … }` in `verifyAndResolve` and `verifyCatchup` gains a `remedy` per **Table S**, in the exact token order `{ ok: false, remedy: …, reason: … }`. Fifteen of the sixteen carry a **literal** `'sync'`/`'reinstall'`; the sixteenth is Table S row 12, which carries the **ternary** `tied ? 'sync' : 'reinstall'` (D6). **D5** — the `@returns` of both verifiers gains `remedy:'sync'\|'reinstall'`; **three** doc comments drop the word "fixed" per Table R's doc-comment row — the header bullet at `:15`, `appendRefuseAlert` at `:157`, and `main`'s own doc comment at `:412`. **D6 — the `tied` provision (block R-P).** In `verifyAndResolve` only: declare `let tied = false;` immediately **before** the `try`, and set `tied = true;` on the statement immediately **after** each tie-back check's failure return — once on the dev arm (after the bound-root equality) and once on the prod arm (after the tree-digest comparison). Exact code in Exact contracts. `verifyCatchup` gets **no** flag. Nothing else: `verifyContainment`, `containedIn`, `appTreeDigestOf`, `liveStance`, `appendRefuseAlert`'s **body**, `readDescriptorFile`, `derivationEnv`, `reDeriveDigest`, `parseArgv`, and every verification **rule** in either verifier are untouched — **no reason string changes**, and D6 adds no check, no branch and no early return, only three assignments and one read. |
| modify | tests/unit/launcher.test.js | **T1–T10** (Test index). Append only, at the end of the file, under a new banner comment. **The existing test at `:525` (F27) must pass unmodified**, as must every other existing test. |
| modify | docs/runbooks/scheduler-and-executable-integrity.md | **M1** — the `## The fix: …` heading, its first sentence, and one appended subsection. Exact text in Table M. No other line. |
| modify | README.md | **M2** — the tail of the "Scheduled runs are verified before they run" bullet only. Exact text in Table M. The `[^a7-boundary]` footnote marker and the footnote itself are unchanged. No other line. |
| modify | docs/THREAT-MODEL.md | **M3** — two sentences, anchored by quoted text (not line number). Exact text in Table M. No other line. |

Not Deliverables, deliberately: `docs/adr/0028-scheduler-app-executable-integrity.md`
(ratified, owner-signed — routed), `docs/GLOSSARY.md`, `src/core/vendor.js`,
`src/cli/schedule.js` (the catch-up registration — routed; see "Out of scope"),
`src/core/alerts.js`, `src/core/digest.js`, `src/core/exec-identity.js`,
`tests/scenarios/a7-integrity/**`, and `memory/lessons/inbox.md`. See "Out of
scope" for each, with its reason.

### Exact contracts

```js
// src/scheduler/launcher.js — NEW, module-level, placed immediately above `main`.
/** The two refusal remedy classes and the sentence each one ends the banner with
 *  (WP-refusal-remedy-discriminator, Table R). The class is chosen by the
 *  verifier from WHERE in the verification flow it refused (Table S) — never by
 *  matching the human-readable reason text.
 *  @type {{sync: string, reinstall: string}} */
const REMEDY_TAIL = {
  sync: 'If the change was intentional, run `wienerdog sync`; otherwise investigate.',
  reinstall:
    'Do not run `wienerdog sync` — this check could not confirm the app files are ' +
    'the ones you installed, so syncing is not the safe next step. ' +
    'Reinstall Wienerdog from a trusted source, then investigate.',
};

/** The full refusal banner. FAILS CLOSED on the remedy: only the exact string
 *  'sync' selects the permissive tail, so an absent, empty, unknown or
 *  object-key-shaped value ('__proto__', 'constructor', …) gets the conservative
 *  'reinstall' tail. Normalizes BEFORE indexing, so no caller-supplied string is
 *  ever used as a lookup key.
 *  @param {string} jobName @param {string} why @param {string} [remedy]
 *  @returns {string} */
function refusalText(jobName, why, remedy) {
  const tail = REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall'];
  return (
    `wienerdog: refusing to run "${jobName}" — ${why} (integrity mismatch); no job was run. ` +
    `This alert will appear in your next digest. ${tail}`
  );
}

/** The remedy a verdict ASKS for — read only if the verdict OWNS the field.
 *  A refusal return site that forgets to set `remedy` must not INHERIT one:
 *  `verdict.remedy` alone resolves through the prototype chain, so a single
 *  `Object.prototype.remedy = 'sync'` anywhere in the process would silently
 *  turn every unclassified future refusal into a `sync` recommendation. The
 *  ownership check is what makes refusalText's fail-closed default actually
 *  reachable. @param {object} verdict @returns {string|undefined} */
function remedyOf(verdict) {
  return verdict && Object.hasOwn(verdict, 'remedy') ? verdict.remedy : undefined;
}
```

**The two `REMEDY_TAIL` literals above are a MIRROR, not a source.** Their
canonical home is blocks **R-T1** and **R-T2** under Table R. Concatenate the
`+`-joined fragments and compare the result to the fence, byte for byte, before
you write anything else — the round-2 draft of this spec updated R-T2 and left
this code block carrying the previous wording, and a fragment-matching test did
not notice. **T2 now asserts byte-identity against a literal copy of R-T2**
precisely so a stale-but-plausible tail cannot pass. If the fence and the code
block ever disagree again, **the fence wins**; report it as a spec bug.

`Object.hasOwn` is a Node 16.9+ builtin, so it is available on this project's
Node ≥ 18 floor and adds no `require` — the launcher's self-containment rule
(`launcher.js:16-26`) is not affected.

```js
// src/scheduler/launcher.js — the `tied` provision inside verifyAndResolve (D6).
// Block R-P evaluated at RUN time for the one return site whose POSITION cannot
// decide it: the outer `catch`, which is reachable both before and after the
// tie-back. Three assignments and one read; no new check, branch or early return.
function verifyAndResolve(p, name, o) {
  const env = o.env || process.env;
  const platform = o.platform || process.platform;
  /** Has the tie-back check (dev: bound-root identity; prod: content address)
   *  already EXECUTED AND PASSED on the path we are on? Block R-P. */
  let tied = false;
  try {
    // …unchanged…
      if (!boundRoot || path.resolve(target) !== path.resolve(boundRoot)) {
        return { ok: false, remedy: 'reinstall', reason: '…' };   // Table S row 4
      }
      tied = true; // dev arm: app/current proven to BE the authorized checkout root
    // …unchanged…
    if (liveTree !== expectTree) {
      return { ok: false, remedy: 'reinstall', reason: '…' };     // Table S row 9
    }
    tied = true;   // prod arm: the live tree proven byte-identical to the descriptor
    // …unchanged…
  } catch (err) {
    // Table S row 12 — the ONLY site whose class is not a literal.
    return { ok: false, remedy: tied ? 'sync' : 'reinstall', reason: `integrity check errored: ${err.message}` };
  }
}
```

`verifyCatchup` gets **no** flag and **no** ternary: it contains no tie-back check
at all, so its outer `catch` (Table S row 16) is unconditionally `'reinstall'`.

```js
// src/scheduler/launcher.js — CHANGED closure inside `main` (D2, D3)
/** Refuse: durable alert (never a bare throw — F13) pointing at the real surface
 *  (the next digest banner) plus the remedy for THIS refusal's class, chosen from
 *  the verdict's structured `remedy` field, never from the reason text
 *  (WP-refusal-remedy-discriminator, Table R). `wienerdog doctor` is still never
 *  named — it reads no A7 state (F27). Zero spawn, non-zero exit. */
const refuse = (jobName, why, remedy) => {
  const reason = refusalText(jobName, why, remedy);
  appendRefuseAlert(p, jobName, reason);
  process.stderr.write(`${reason}\n`);
  exit(1);
  return 1;
};

// call sites, both in `main`:
if (error) return refuse(name || 'unknown', error, 'reinstall');   // was: refuse(name || 'unknown', error)
if (!verdict.ok) return refuse(name, verdict.reason, remedyOf(verdict)); // was: refuse(name, verdict.reason)
```

```js
// src/scheduler/launcher.js — CHANGED @returns on BOTH verifiers (D5)
 * @returns {{ok:true, command:string, args:string[], home?:string}|{ok:false, remedy:'sync'|'reinstall', reason:string}}
```

```js
// src/scheduler/launcher.js — the shape EVERY refusal return site must take (D4).
// Token order is fixed so one grep can verify the whole file: `remedy` BEFORE
// `reason`, because a reason string may contain colons, quotes and braces.
return { ok: false, remedy: 'reinstall', reason: 'the live app tree does not match the descriptor (app files changed since sync)' };

// …and the ONE site (Table S row 12) whose class is dynamic. Same token order,
// same single line, so the same grep still sees it — the value is a ternary, not
// a literal, and verification step 2 counts it separately.
return { ok: false, remedy: tied ? 'sync' : 'reinstall', reason: `integrity check errored: ${err.message}` };
```

```js
// src/scheduler/launcher.js — module.exports gains exactly two names
module.exports = { verifyAndResolve, verifyCatchup, appTreeDigestOf, verifyContainment, parseArgv, refusalText, remedyOf, main };
// (plus `liveStance`, which WP-stance-authority-containment adds — leave it in place)
```

Worked examples (all five are acceptance criteria; all five were executed):

```
refusalText('dream', W, 'sync')                    → byte-identical to today's banner for W
refusalText('dream', W, 'reinstall')               → the reinstall tail
refusalText('dream', W, undefined)                 → the reinstall tail   ← fail closed
refusalText('dream', W, 'bogus')                   → the reinstall tail   ← fail closed
remedyOf({ok:false, reason:W})                     → undefined            ← fail closed
  …even with Object.prototype.remedy = 'sync' set, where a bare
  `verdict.remedy` read returns 'sync' and selects the PERMISSIVE tail
```

## Contract reference

**Activation trigger — 4 of ADR-0031's 7 fire**, so the discipline is on:
(ii) a result **taxonomy** is introduced (the `remedy` enumeration);
(iv) **error/reason-code** behaviour changes (which remedy a refusal recommends);
(v) an **authority boundary** is crossed — the verifiers emit the class, `refuse`
owns its interpretation into user-facing text;
(vii) the **same contract appears in multiple mirrored surfaces** (the launcher,
a runbook, the README, the threat model, and — by citation — another spec's
GLOSSARY entry).

Three canonical tables follow. **Table R** is the single place the classes, their
sentences, **and the rule that assigns them** are decided — the rule itself is
block **R-P**, stated exactly once, directly beneath the table. **Table S** is the
single place *the result of applying R-P to this tree* is recorded; it does not
restate R-P, it cites it. **Table M** is the single place the user-facing prose is
decided. Operative prose cites all three; it does not restate them.

> **Why R-P is a block and not two `means` cells** (ADR-0031, remedial
> extraction). Round 1 of this spec stated the assignment rule in three places —
> a `'sync' means` cell, a `'reinstall' means` cell, and a rationale paragraph
> under Table S — and they disagreed: the cell authorized `sync` whenever "the
> bound stance is `dev`", while the paragraph authorized it only for "descriptor
> drift a maintainer resolves with `sync`". Two of the sixteen sites fell in the
> gap and were misclassified. Both review legs found it independently. The three
> statements are now **one** statement, R-P, and every other surface in this spec
> is a registered mirror of it.

### Table R — the remedy classes (canonical; every other statement defers to this)

| Fact | Value |
|------|-------|
| **Field name** | `remedy`, on the `{ok:false}` verdict returned by `verifyAndResolve` and `verifyCatchup` |
| **Type** | string, exhaustively one of `'sync'` \| `'reinstall'`. There is no third value and none may be added without amending this table |
| **Class selection rule** | block **R-P** below — the single statement of when `'sync'` may be returned, and the only place that decision is made. `'sync'` means R-P holds on the path that reached this return; `'reinstall'` means it does not or could not be established. Neither class means anything else, here or anywhere in this spec. R-P is decided **statically by position** at fifteen of the sixteen sites and **at run time by the `tied` flag** at the sixteenth (Table S row 12) — one rule, two ways of evaluating it, no exception |
| **`'sync'` tail (verbatim, unchanged from today)** | block **R-T1** below |
| **`'reinstall'` tail (verbatim, NEW)** | block **R-T2** below |
| **Fail-closed default** | **`'reinstall'`.** Selection is `REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall']` — only the exact string `'sync'` reaches the permissive tail. Absent, `undefined`, `null`, `''`, any unknown value, and any object-key-shaped string all resolve to `'reinstall'` |
| **Ownership (the default's precondition)** | the production read of the field is `remedyOf(verdict)` — `Object.hasOwn(verdict, 'remedy') ? verdict.remedy : undefined` — **never a bare `verdict.remedy`**. A bare property read resolves through the prototype chain, so a verdict with **no own** `remedy` returns `'sync'` under a single `Object.prototype.remedy = 'sync'` and selects the permissive tail (executed: bare read ⇒ `'sync'`, `remedyOf` ⇒ `undefined`). Without this check the fail-closed default is unreachable for exactly the case it exists to protect — a future return site that forgot to classify itself |
| **What must NEVER decide the remedy** | the `reason` string, the `why` text, `process.env`, the platform, any file inside the app tree, and any **descriptor field** (including `appRelease.stance`) taken on its own word. The class is decided by R-P — an executed comparison — and by nothing else |
| **Unchanged banner prefix** | block **R-T0** below, followed by exactly one space, then the tail. `/refusing to run/` and `/integrity mismatch/` stay unconditional |
| **Unchanged mechanics** | zero spawn, exit 1, one `appendRefuseAlert` call, the same stderr write, `wienerdog doctor` still never named |
| **Doc-comment consequence** | the launcher's word **"fixed"** becomes wrong in **three** comments — header bullet `:15` *"a fixed durable alert"*; `appendRefuseAlert` `:157` *"fixed, code-owned reason"*; `main`'s doc comment `:412` *"append a fixed durable alert"*. The alert body is still **code-owned** but is no longer a single fixed sentence. Replace "fixed, code-owned" with "code-owned" and "a fixed durable alert" with "a code-owned durable alert" in all three; change nothing else in them |

#### R-P — the executed-proof rule (the ONE statement of when `sync` may be recommended)

A refusal **returns** `remedy: 'sync'` **iff, on the path that reached it, the
check that ties the live `app/current` to what the descriptor authorized has
already executed and PASSED.** The two tie-back checks are:

- in `verifyAndResolve`'s **prod arm**: the tree-digest comparison
  `liveTree !== expectTree`, today `src/scheduler/launcher.js:310`;
- in `verifyAndResolve`'s **dev arm**: the bound-root equality
  `path.resolve(target) !== path.resolve(boundRoot)`, today
  `src/scheduler/launcher.js:288`.

**How the rule is evaluated.** At fifteen of the sixteen return sites, *position*
settles it: a site that lies strictly after a tie-back check is reached only on
paths where that check passed, so it carries the literal `'sync'`; everything else
carries the literal `'reinstall'` — sites **before** either check, the two checks'
**own** failure returns, sites on paths that reach neither check, and every site in
`verifyCatchup` (which contains no tie-back check at all).

**The one site position cannot settle: `verifyAndResolve`'s outer `catch`** (Table
S row 12). It is reachable from **both** sides. `reDeriveDigest` is called at
`src/scheduler/launcher.js:319`, *after* `:310` has proven the tree byte-identical,
and its own doc comment says it **THROWS** on any require/derivation error — so an
unpinned `claude`, an unreadable `exec-pins.json` or a config parse error lands in
that `catch` over a tree that was just confirmed. Executed on a real temp prod
install with `<core>/state/exec-pins.json` removed and the app tree untouched:

```text
{"ok":false,"reason":"integrity check errored: refusing to authorize the dream job: claude is not pinned — install claude and run `wienerdog sync` so its identity is recorded before the job is bound."}
```

That refusal's own reason string tells the user to sync, and it is right to. For
this site alone, R-P is therefore evaluated **at run time**, by a `tied` flag set
the instant either tie-back check passes (D6). This is not an exception to R-P and
must not be written as one: the flag is R-P's condition — "has already executed and
passed on the path that reached this return" — measured directly instead of
inferred from position. Where position and the flag both apply they agree; the flag
is used only where position is silent.

`verifyCatchup`'s outer `catch` (row 16) gets **no** flag: there is no tie-back
check in that function for a flag to observe, so R-P cannot hold there under either
evaluation.

**The TOCTOU this does not open.** Between `:310` and `:319` an attacker who can
still write the tree could swap files after the digest passed, making `tied` true
over a tree that is no longer the authorized one. That race already grants
arbitrary code execution — `reDeriveDigest` `require`s from that tree — so an
attacker who wins it has no need of the banner; and the identical race already sits
under rows 10 and 11, which R-P authorizes as `'sync'`. The flag widens nothing.

**Why nothing weaker will do.** `wienerdog sync` re-vendors the install *by
running out of whatever tree `app/current` resolves to at exec time* — the user's
shim is literally `exec node "<core>/app/current/bin/wienerdog.js" "$@"`
(`src/core/vendor.js:23` and `:310-314`). Recommending `sync` is therefore safe
only when the tree that will execute has been proven to be the authorized one.
Prod proves it by **content address**; dev proves it by **root identity** — a dev
checkout is mutable by design and carries no content claim, but *which* checkout
runs is still authorized, and the bound-root equality is the proof of it.

**A descriptor field is an assertion, not a proof.** `appRelease.stance` records
what was authorized, not what is live. The two dev-arm sites that sit *before*
`:288` are precisely the sites where live state has **falsified** it — one where
the descriptor says `dev` but `app/current` now resolves inside `<core>/app`, one
whose own reason string says *"repointed since sync"*. Assigning `sync` there
would hand the win back to the very repoint the launcher just caught (Context).
So: `sync` requires an executed comparison; `reinstall` requires nothing — which
is why `reinstall` is also the fail-closed default in Table R.

The three strings Table R points at, verbatim. They contain backticks, so they
are given as fenced blocks rather than inline spans — copy the bytes between the
fences, and note that **R-T0 ends with a single trailing space** which the fence
preserves but a diff viewer may hide.

R-T0 — the banner prefix (unchanged; `jobName` and `why` interpolate):

```text
wienerdog: refusing to run "<job>" — <why> (integrity mismatch); no job was run. This alert will appear in your next digest. 
```

R-T1 — the `'sync'` tail (unchanged from today):

```text
If the change was intentional, run `wienerdog sync`; otherwise investigate.
```

R-T2 — the `'reinstall'` tail (new). **It asserts no cause and predicts no
outcome.** One tail is shared by **thirteen emitters**: the twelve verdict sites of
Table S that can return `'reinstall'` (eleven that always do, plus row 12 whenever
its `tied` flag is false), plus the argv-parse `refuse` call site
(`src/scheduler/launcher.js:450`, Exact contracts), which passes `'reinstall'`
directly and returns no verdict at all. Every clause below had to be made true at
all thirteen, and two rounds of review found it was not:

- **Round 1** said *"it would install the app files as they are now"* — a **cause**
  claim, false wherever the tree is intact (an unreadable descriptor, a containment
  failure, an invalid stance, an argv error).
- **Round 2** replaced it with *"…could not confirm the app files are the ones you
  installed, **and sync would authorize them as they are**"* — the cause claim was
  gone, but the second half is an **outcome prediction**, and it is false at Table S
  rows 2 and 13, where `app/current` cannot be resolved at all: the user's shim is
  literally `exec node "<core>/app/current/bin/wienerdog.js" "$@"`, so `sync` does
  not authorize anything there, it fails to start. Round 2's first half was also
  false at row 12's post-tie-back throws — fixed at the source by R-P's `tied`
  provision, which moves those returns to `'sync'`, so *"could not confirm"* is now
  true at every site where this tail can still fire.
- **Round 3, below.** The second clause states a **conclusion about what to do**,
  not a prediction about what `sync` would do. It is true whether `sync` would
  authorize a hostile tree (rows 3, 4, 9, 15), do nothing useful (row 1), or fail to
  launch at all (rows 2, 13).

A reviewer proposed *"this refusal does not establish that sync is safe"*, which is
also universally true; it was **not** taken because CLAUDE.md requires plain
language for knowledge workers and that phrasing is epistemic-negation register.
The clause below says the same thing in the imperative the reader needs. Splitting
the class per cause was rejected as the more complex option; see Implementation
notes:

```text
Do not run `wienerdog sync` — this check could not confirm the app files are the ones you installed, so syncing is not the safe next step. Reinstall Wienerdog from a trusted source, then investigate.
```

**R-T2 has two kinds of mirror, and only one of them is checkable by bytes.** The
`REMEDY_TAIL.reinstall` literal copies R-T2's *text*, and T2 pins it byte for
byte. The user-facing prose in Table M restates R-T2's *meaning* in its own words,
and no byte check can reach it — which is how round 3 came to correct R-T2 itself
while leaving **M2** and **M1c** carrying round 2's rejected outcome prediction
(*"syncing would authorize those files as they are"*) verbatim. That is the same
failure as the round-2 staleness of the code block, one level up: the canonical
string was fixed and its restatements were not. Both were corrected in round 4.
The constraint every restatement is bound by — *state the conclusion, never
predict what `sync` would do* — is registered as its own entry in the Mirrored
Surface Checklist, with the surfaces it binds and its gate.

### Table S — which return site gets which class (canonical)

**The rule is block R-P, above.** This table is R-P *applied*, not restated: for
each site it records its position relative to the tie-back check — the bound-root
equality `path.resolve(target) !== path.resolve(boundRoot)` on the dev arm, the
tree-digest comparison `liveTree !== expectTree` on the prod arm — and the class
that position yields. **R-P alone carries line numbers for those two checks**, and
qualifies them with "today"; this table names them by code expression because
`WP-stance-authority-containment` deletes a site *between* them, so any number
written here would already be stale. If a row and R-P ever disagree, **R-P wins and
the row is a bug** — report it, do not follow it.

Sites in source order, on the tree you will have (i.e. **after**
`WP-stance-authority-containment` has landed):

| # | Function / position | Position vs. R-P's check ("dev-arm check" = the bound-root equality; "prod-arm check" = the tree-digest comparison) | Reason fragment (identity only — do NOT change these strings) | Class |
|---|---|---|---|---|
| 1 | `verifyAndResolve`, descriptor read | before both | `is missing or unreadable` | `reinstall` |
| 2 | `verifyAndResolve`, realpath of `app/current` | before both | `cannot resolve app/current:` | `reinstall` |
| 3 | dev arm, live stance is not dev (**C1**) | **before the dev-arm check** | `authorized for a dev checkout but app/current now resolves inside` | **`reinstall`** ← round-2 fix |
| 4 | dev arm, bound-root equality | **is the dev-arm check's own failure return** | `does not resolve to the authorized checkout root` | **`reinstall`** ← round-2 fix |
| 5 | dev arm, job absent from config | after the dev-arm check | `nothing authorized to run` | `sync` |
| 6 | dev arm, reduced-descriptor drift | after the dev-arm check | `the job descriptor changed since it was scheduled` | `sync` |
| 7 | stance is neither prod nor dev | reaches neither | `is not prod or dev` | `reinstall` |
| 8 | prod arm, `verifyContainment` propagation (`contain.why`) | before the prod-arm check | *(interpolated helper text)* | `reinstall` |
| 9 | prod arm, **tree digest comparison** | **is the prod-arm check's own failure return** | `the live app tree does not match the descriptor` | **`reinstall`** ← the round-1 fix |
| 10 | prod arm, job absent from config | after the prod-arm check | `nothing authorized to run` | `sync` |
| 11 | prod arm, descriptor drift | after the prod-arm check | `the job descriptor changed since it was scheduled` | `sync` |
| 12 | `verifyAndResolve` outer `catch` | **reachable from both sides — position is silent** | `integrity check errored:` | **`tied ? 'sync' : 'reinstall'`** ← round-3 fix (D6) |
| 13 | `verifyCatchup`, realpath of `app/current` | no such check in this fn | `cannot resolve app/current:` | `reinstall` |
| 14 | `verifyCatchup`, `verifyContainment` propagation | no such check in this fn | *(interpolated helper text)* | `reinstall` |
| 15 | `verifyCatchup`, **tree digest comparison** | no such check in this fn | `does not match the scheduled digest` | **`reinstall`** ← the round-1 fix |
| 16 | `verifyCatchup` outer `catch` | no such check in this fn | `integrity check errored:` | `reinstall` |

**Counts: 16 sites — 4 carry the literal `'sync'` (rows 5, 6, 10, 11), 11 carry
the literal `'reinstall'`, and 1 (row 12) carries the ternary.** So the tail R-T2
can fire at **twelve** verdict sites (the eleven literals, plus row 12 whenever
`tied` is false) and R-T1 at **five** (the four literals, plus row 12 whenever
`tied` is true). Verification step 2 counts the literals and the ternary
separately: `sync=4`, `tied=1`.

Rows 3 and 4 changed class in round 2. Round 1 assigned them `sync` on the
strength of the descriptor's `dev` stance; R-P requires an executed comparison, and
these are the two sites where live state has just contradicted the descriptor.
Rows 5 and 6 keep `sync` because they sit *after* the dev-arm bound-root equality —
the distinction round 1 collapsed. Row 12 changed in round 3: it was flatly
`reinstall`, which made R-T2's *"could not confirm the app files"* false on the
post-tie-back throws that reach it and put a banner in front of the user whose
reason said *run `wienerdog sync`* and whose tail said *do not*. See R-P.

**Row 14 is the normal state of every dev install — read this before you file it as
a bug.** `verifyCatchup` has no dev arm by design: `src/scheduler/launcher.js:335-339`
says a dev install *"fails containment and refuses here — fail-closed for the
catch-up path, acceptable for the intermediate"*. Executed against a healthy
`setupDev`-shaped install this session, `verifyCatchup` returns
`{"ok":false,"reason":"app/current does not resolve inside …/wd/app"}` ⇒ row 14 ⇒
`reinstall`. Nothing about that is wrong under R-P — containment failed, so nothing
was confirmed — but the consequence is stated plainly under "Known consequence" in
Implementation notes, and it is **not** to be softened here. In particular, do
**not** add an `isDev(target)` test to `verifyCatchup` to pick a gentler tail: a
planted `.git` is attacker-controlled, that is precisely the downgrade F10 exists
to prevent, and it would carve the first real exception into R-P.

**STOP RULE.** On this branch's HEAD (before the dependency lands) the file has
**17** sites: one extra `reinstall`-class site, the prod-arm
`looks like a dev checkout (.git present)` pre-check at `:302`, which
`WP-stance-authority-containment` deletes (its Table C row C5) and whose Table C
row C1 rewrites `:282` into row 3 above. The **`sync` count is 4 on both trees** —
the deleted site is `reinstall`-class and the rewritten one is now
`reinstall`-class too. So: if your working tree yields **4** `sync` sites and a
total equal to the pre-change count of `return { ok: false, reason:` lines, you
are correct. If the `sync` count is anything other than 4, **STOP and report a
spec bug in the PR body** — do not adjust the number to match the code.
Verification step 2 derives the total from git rather than hardcoding it,
precisely so 16-vs-17 is not a number you have to get right.

`verifyContainment`'s own four `return { ok: false, why: … }` statements are
**not** verdict sites (different shape, internal helper) and get **no** `remedy`.
Rows 8 and 14 are the sites that wrap them.

### Table M — the user-facing mirrors (canonical prose; transcribe verbatim)

The banner is the only place the remedy is *decided*. These three documents
describe it to users, and each currently states the `sync`-for-everything rule.
Each is changed to the minimum that makes it true, and **none of them names a
recovery command**: the invocations that qualify as "a trusted source" have
exactly one user-facing home, `docs/GLOSSARY.md`'s **production/dev stance**
entry, written by `WP-stance-authority-containment` D6. See "The citation" below
for why they are cited and not copied.

Anchors and replacements contain backticks, so both are given as fenced blocks
below the table. Copy the bytes between the fences.

| id | File | What changes |
|----|------|--------------|
| **M1a** | `docs/runbooks/scheduler-and-executable-integrity.md` | the level-2 heading whose text is block **M1a-old** becomes block **M1a-new** |
| **M1b** | same file | the sentence in block **M1b-old** (the line directly under that heading) becomes block **M1b-new** |
| **M1c** | same file | **append** block **M1c** immediately after the paragraph beginning **"Before you re-sync, confirm the change was expected."** and before the level-2 heading **"Updating Claude, Git, or Wienerdog itself"** |
| **M2** | `README.md` | in the "Scheduled runs are verified before they run" bullet, the tail in block **M2-old** becomes block **M2-new**. The `[^a7-boundary]` marker that follows it stays exactly where it is |
| **M3a** | `docs/THREAT-MODEL.md` | the sentence in block **M3a-old** becomes block **M3a-new** |
| **M3b** | `docs/THREAT-MODEL.md` | the **last sentence** of the **"Where a refusal surfaces"** bullet (that bullet spans `docs/THREAT-MODEL.md:354-361`) — block **M3b-old**, soft-wrapped across the last two source lines of the bullet, beginning with the word "The" at the end of the line ending *"not built in this pass."* — becomes block **M3b-new**. **Not** the "Independent launcher outside the mutable app tree" bullet (`:272-280`), whose last sentence is about the read-only publish and is correct as it stands — leave it alone |

M3a is a single source line, so it is a literal substring replacement. **M3b is
soft-wrapped**: replace the sentence, then re-wrap the paragraph to the file's
existing ~80-column style and two-space list indent. Do not reflow any other
paragraph — a whole-paragraph rewrap is a larger diff than this change needs.
Verified this session: M1a, M1b, M1c's two insertion anchors, M2 and M3a each
match **exactly once** as a literal substring of a single line in their target
file; M3b matches only across the line break, which is why it is described rather
than quoted as a one-line anchor.

M1a-old / M1a-new:

```text
## The fix: `wienerdog sync`
```

```text
## The fix — and the one case where `sync` is the wrong move
```

M1b-old / M1b-new:

```text
For almost every mismatch, the fix is a single command:
```

```text
For most mismatches — you edited `config.yaml`, Claude or Git moved, you upgraded
Wienerdog — the fix is a single command:
```

M2-old / M2-new (the tail of one bullet; the em dash is part of the anchor):

```text
— the job refuses with an alert instead (fail closed; the fix is one `wienerdog sync`).
```

```text
— the job refuses with an alert instead (fail closed). For a `config.yaml` edit the fix is one `wienerdog sync`; when the check couldn't confirm the **app files** themselves, the alert deliberately does *not* tell you to sync — syncing is not the safe next step there — and asks you to reinstall from a trusted source instead.
```

M3a-old / M3a-new:

```text
The one remedy is `wienerdog sync`.
```

```text
The remedy depends on where in the verification flow the refusal happened: `wienerdog sync` is named only after the live `app/current` has been tied to what the descriptor authorized — by content address on a production install, or by bound-root identity for an authorized mutable dev checkout — which in practice means the `config.yaml`/descriptor-drift classes. Every refusal reached before that tie-back, including the app tree failing its content address, withholds the advice — `sync` re-vendors by running out of the very tree in question — and directs a reinstall from a non-dev source root instead (WP-refusal-remedy-discriminator).
```

M3b-old / M3b-new:

```text
The runbook and the launcher's own refuse text point to the digest banner and `wienerdog sync`, never to `doctor`.
```

```text
The runbook and the launcher's own refuse text point to the digest banner, never to `doctor`; they name `wienerdog sync` only for refusals reached after the live `app/current` has been tied to what the descriptor authorized — after tree verification on a production install, or for an authorized mutable dev checkout.
```

M1c, verbatim:

```markdown
### The one case where `sync` is the wrong move

If the alert tells you **not** to run `wienerdog sync`, take it literally. That
wording appears whenever the check stopped *before* it could confirm that the app
files under `~/.wienerdog/app/current` are the ones you installed. Sometimes that
is because the files no longer match; sometimes it is because the check could not
be completed at all — an unreadable authorization record, a `current` pointer that
now leads somewhere unexpected, an error part-way through. The alert does not
claim to know which, and neither should you until you have looked.

`sync` re-vendors Wienerdog by running out of whatever folder `current` leads
to, and that folder is exactly what this check could not confirm. So syncing is
not the safe next step on this class of alert, whichever of those causes turns
out to be yours. The order is therefore reversed: **reinstall first, investigate
second, and don't sync at all.**

Reinstall from a trusted source — a copy of Wienerdog that is not a git checkout
and is not the folder this install already runs from. The
[production/dev stance](../GLOSSARY.md) entry names the commands that qualify.
Then look at what changed under `~/.wienerdog` before you re-enable anything.
```

**The citation — registered, not paraphrased.** "A trusted source" is not defined
here. Its canonical definition is `WP-stance-authority-containment`'s **Table G
row 1, "The recovery path" paragraph**: *an attended run whose source root is
provably not a dev checkout and provably not the tree `app/current` already
resolves to*, and the only two invocations that ship into user-facing prose are
its **D6** pair, scoped there as *"On POSIX systems (executed on macOS)"*. That
enumeration was corrected in five consecutive review rounds; copying it into a
fourth surface would create a fourth thing to keep true. This WP therefore
**cites** it and **links** to the one user-facing home D6 creates. Do not add
commands to M1c, M2 or M3, and do not add them to the banner.

### Mirrored Surface Checklist

Every surface in this spec that restates a fact owned by Table R, Table S or
Table M. A review finding updates the table **and** every box below in the same
pass; a new mirror discovered in review is added here on the spot.

Table R (classes, sentences, fail-closed default, ownership). **The three
sentences themselves live in blocks R-T0/R-T1/R-T2 directly beneath Table R —
that is their canonical home; the table's cells point at them and every item
below mirrors them:**

- [ ] Deliverables cell for `src/scheduler/launcher.js` (D1, D2, D3, D5 — "per Table R")
- [ ] Exact contracts → the `REMEDY_TAIL` / `refusalText` / `remedyOf` code block
      and its JSDoc (the literals there must be byte-equal to R-T1 and R-T2, and
      the template literal's prefix byte-equal to R-T0 including its trailing
      space). **This is the mirror that went stale in round 2** — R-T2 was
      rewritten and this block was not, and T2's three fragment regexes still
      passed against the old wording. T2 is now a byte-identity assertion, and the
      paragraph under the code block tells the implementer the fence wins
- [ ] Exact contracts → the `module.exports` line and the five worked examples
- [ ] Current state §1 (today's single banner) and §3 (the banner that must survive byte-for-byte)
- [ ] Current state §8 (the per-reason length table) — mirrors R-T1/R-T2's lengths only
- [ ] The **three** doc comments that must drop "fixed" (`:15`, `:157`, `:412`) —
      enumerated in Table R's doc-comment row and in D5, nowhere else
- [ ] Security checklist (the normalize-before-index and ownership paragraphs)
- [ ] Acceptance criteria AC1, AC2, AC3, AC4, AC9
- [ ] Verification step 1 (the T1–T4 + T9 test names) and step 3 (byte-identity)
- [ ] Test index rows T1, T2, T3, T4, T9
- [ ] Implementation notes → "Why a two-value remedy class and not a cause
      taxonomy" and "Fail closed three times, deliberately"
- [ ] Out of scope → the `src/core/alerts.js` / `src/core/digest.js` bullet
      (it restates R-T2's measured length and the 2000-char cap)

**R-T2's semantic constraint — a mirror of its MEANING, not of its bytes**
(registered in round 4). R-T2 *asserts no cause and predicts no outcome*: it says
what the reader should not do, never what `wienerdog sync` would do if run. T2's
byte-identity assertion enforces the **text** at the one surface that copies it
verbatim; it cannot reach a surface that restates R-T2 in its own words, which is
why round 3's correction of R-T2 left two prose mirrors stale and no check
noticed. Every surface that restates R-T2's meaning is registered here, and each
must state a conclusion, not a prediction:

- [ ] **M2-new** (README bullet) — now *"syncing is not the safe next step
      there"*. It carried round 2's *"syncing would authorize those files as they
      are"* for a full round after R-T2 itself was corrected; fixed in round 4
- [ ] **M1c**, second paragraph (runbook) — now *"So syncing is not the safe next
      step on this class of alert, whichever of those causes turns out to be
      yours."* It carried the same round-2 prediction stated **universally**
      (*"syncing would authorize whatever is in that folder, sight unseen"*) plus a
      second one (*"it would finish the job for anything that put it there"*); both
      are false at Table S rows 2 and 13, where `app/current` cannot be resolved
      and `sync` does not start at all. Both dropped in round 4
- [ ] **M3a-new / M3b-new** (threat model) — re-read in round 4 against this
      constraint and left as they stand. M3a's *"`sync` re-vendors by running out
      of the very tree in question"* states the **mechanism** of `sync` — the same
      fact R-P states under "Why nothing weaker will do", and the reason the advice
      is withheld — not an outcome for the refusal at hand; M3b names no mechanism
      at all. If either is ever reworded, re-read it against this entry first
- [ ] **R-T2's own round-1/round-2 history bullets** and Implementation notes →
      "Why one `reinstall` tail and not one per cause" — these **quote** the
      rejected wordings as history and are the only places in this spec where they
      may appear. The gate below deliberately does not scan this spec
- [ ] **Checkable form — verification step 4's prediction sweep.**
      `grep -cE "would authorize|would install|would finish"` over the three
      delivered prose files plus `src/scheduler/launcher.js`. Executed both
      directions this session: `0` in all four on the pre-change tree **and** `0`
      after Table M's six replacements are applied to a scratch copy; re-injecting
      round 2's *"syncing would authorize those files as they are"* into M2 takes
      README's count to `1` and grep's exit to `0`. It is a **violation detector,
      not a completion detector** (`kind: regression` in the verification gate
      table) — it reads `0` on an untouched tree too, so it is
      paired with, never a substitute for, the five stale-form gates that prove the
      work landed. It cannot catch a *novel* prediction phrased without those three
      verbs; that residue is a **review obligation**, recorded here so coverage is
      not overstated

Table S and **block R-P** (the positional proof and its application). R-P is the
canonical statement; Table S is R-P applied; **everything below mirrors R-P**:

- [ ] Table S itself — its rule paragraph must cite R-P and must not restate it
- [ ] Deliverables cell for `src/scheduler/launcher.js` (D4 and **D6**, the `tied`
      provision — "per Table S" / "per block R-P")
- [ ] Exact contracts → the fixed `{ ok: false, remedy: …, reason: … }` token order
      **and its ternary variant**, plus the `tied`-provision code block
- [ ] Context → the symlink-repoint / dev-checkout-B paragraph (it is R-P's
      motivating attack, not an independent claim)
- [ ] Current state §3 (the descriptor-drift contrast — it restates R-P's per-arm
      tie-back semantics in prose: content address on prod, checkout-root identity
      on dev). **Registered in round 3; it was previously listed only under Table R**
- [ ] Current state §4 (the executed grep counts) and its "16, not 17" pointer
- [ ] Table M's M3a-new and M3b-new replacements (both state R-P in user-facing
      prose: `sync` only after the tie-back, "or for an authorized mutable dev
      checkout")
- [ ] Acceptance criteria AC5, AC6, AC7, **AC14** (the `tied` provision)
- [ ] Verification step 2 (the five counts + the git-derived baseline + the
      reason-drift diff)
- [ ] Test index rows T5, T6, T7, T8, **T10**
- [ ] Implementation notes → "Do not string-match the reason", **"Why the outer
      `catch` is decided at run time"** and **"Known consequence: row 14 on a dev
      install"**
- [ ] Out of scope → the "reclassifying sites beyond Table S" item, the ADR-0028
      correction wording, and the routed `ensureCatchup`-on-dev item

Table M (the user-facing prose and the citation). **The prose itself lives in the
`M1a-old`…`M3b-new` and `M1c` fenced blocks beneath Table M — that is its
canonical home; the table's rows only say which block goes where:**

- [ ] Deliverables cells for the runbook, `README.md` and `docs/THREAT-MODEL.md`
- [ ] Table M's own rows (each names a block; none restates its text)
- [ ] The anchor-fidelity paragraph under Table M (which anchors are single-line
      literals and which is soft-wrapped)
- [ ] Current state §7 (the three quoted false statements)
- [ ] Acceptance criteria AC10, AC11
- [ ] Verification step 4 — **all five stale-form gates** (M1a, M1b, M2, M3a,
      M3b), the GLOSSARY-link count, the recovery-command counts and the
      **prediction sweep** (registered above under R-T2's semantic constraint).
      Every one of Table M's five replacements must have a gate here; adding a
      Table M row without adding its gate is the omission round 2 caught
- [ ] Out of scope → `docs/GLOSSARY.md` and `docs/adr/0028-…`
- [ ] **The citation of `WP-stance-authority-containment` Table G row 1 / D6** —
      appears in Context (S1 and the amplification), in Table M's "The citation"
      paragraph, in M1c's link target, in Out of scope, and in Definition of done
      item 5. It is a **citation, never a copy**: if that spec's recovery property
      or its D6 entry list changes, nothing here needs re-wording, and nothing
      here may be re-worded to "match" it

## Implementation notes & constraints

**Do not string-match the reason (block R-P).** The single most important
constraint. The remedy must never be derived from `why`, from a regex over the
reason, or from anything an attacker who can write the app tree could influence.
It is decided at the return statement, by position in the verification flow, and
carried as data. If you find yourself writing `/does not match/.test(reason)`,
stop — that is the defect this WP exists to prevent, not the fix.

**Do not read a descriptor field either (block R-P).** The same applies to
`descriptor.appRelease.stance` and friends. A descriptor field says what was
authorized; R-P demands an executed comparison against what is *live*. This is
the round-2 correction and the reason Table S rows 3 and 4 are `reinstall`.

**Why a two-value remedy class and not a cause taxonomy (Table R).** A cause
enum (`'tree-mismatch'`, `'descriptor-drift'`, …) mapped to remedies would need
its own default for an unmapped cause, doubling the number of places the
fail-closed property has to hold and adding a mapping table that can drift from
the enum. Two values that *are* the remedy classes make the fail-closed property
a single expression (`remedy === 'sync' ? … : …`) that cannot be got wrong. The
cost is that the class name is presentation-shaped; that is acceptable because
the verdict already carries a fully presentation-shaped field (`reason`).

**Why one `reinstall` tail and not one per cause (recorded decision, rounds 2–3).**
Round 1's tail asserted a **cause** — *"it would install the app files as they are
now"* — true only at the tree-mismatch sites, while the same tail also fires for a
missing descriptor, a containment failure, an invalid stance, an outer exception, a
catch-up containment failure and an argv error. Round 2 removed the cause but added
an **outcome prediction** — *"and sync would authorize them as they are"* — false at
Table S rows 2 and 13, where `app/current` cannot be resolved and `sync` therefore
cannot start at all. Both times the option of splitting the class per cause was on
the table and both times **the simpler option was taken**: make the one sentence
true everywhere. R-T2's final clause states a conclusion (*syncing is not the safe
next step*), not a prediction, which holds whether `sync` would authorize a hostile
tree, do nothing useful, or fail to launch. Splitting would have re-introduced
exactly the cause taxonomy the previous note rejects, and would have needed its own
fail-closed default per cause. The cost is a slightly vaguer banner; the runbook
subsection M1c carries the nuance instead, which is where a user who wants it will
be.

**Why the outer `catch` is decided at run time (recorded decision, round 3).**
Table S row 12 is the only site whose class a reader cannot settle by looking at
where it sits, and review proved the consequence rather than arguing it: on a real
temp prod install with the app tree untouched and `<core>/state/exec-pins.json`
removed, `reDeriveDigest` throws *after* the tree-digest comparison has passed, and
the resulting reason string is *"…install claude and run `wienerdog sync` so its
identity is recorded…"*. A flat `'reinstall'` there produces a banner that tells the
user to sync and then forbids it, over app files that were **confirmed**. Two
resolutions were offered: (a) weaken R-T2 so it claims nothing about confirmation,
or (b) carry a `tied` flag and let the `catch` return the class R-P actually
yields. **(b) was taken, and (a)'s valid part was taken too but for a different
reason** — see the R-T2 note above. (a) alone was rejected because it leaves the
self-contradiction standing: the user is still told both to sync and not to sync,
and the tail is merely *non-false* instead of *right*. (b) costs one `let`, two
assignments and one read, adds no check and no branch to the verification flow, and
is R-P's own condition measured rather than inferred — so it needed no exception in
R-P and got none. The TOCTOU objection is answered inside R-P. Do **not** widen the
flag: it is set only where a tie-back check has *passed*, never where one was
skipped, and `verifyCatchup` gets none.

**Known consequence: row 14 fires on every dev install, including this repo's own
(recorded decision, round 3).** `ensureCatchup` (`src/cli/schedule.js:409`) is
called unconditionally on macOS registration with no stance gating, so a dev
install carries a login + hourly catch-up entry. `verifyCatchup` has no dev arm by
design, so every one of those fires refuses at Table S row 14 — executed this
session against a healthy `setupDev`-shaped install:
`{"ok":false,"reason":"app/current does not resolve inside …/wd/app"}`. Today that
refusal ends *"If the change was intentional, run `wienerdog sync`"*; after this WP
it ends *"…could not confirm the app files … Reinstall Wienerdog from a trusted
source."* `formatAlerts` (`src/core/digest.js:288-309`) collapses alerts per job, so
the effect is **one persistent banner line** in every injected digest, reading
*"the "--catch-up" job has failed N times since …"* with that tail, and it **never
clears**, because catch-up structurally never succeeds on a dev install. **On the
maintainer's own dogfooding machine that is a standing "reinstall Wienerdog from a
trusted source" warning.** This is accepted, not fixed, and it is stated here so it
is discovered in the spec rather than in production. The reasons: the class is
*correct* under R-P (containment failed, so nothing was confirmed); the only way to
soften it is to consult live `isDev(target)`, which a planted `.git` controls and
which F10 exists to prevent; a third tail would mean a third class, which Table R
forbids; and the real defect — registering a catch-up entry whose path is
documented to always refuse on dev — lives in `src/cli/schedule.js`, a different
contract and not a Deliverable here. It is routed under "Out of scope" as a
Discovered issue. Today's wording is *also* wrong on that banner, so this WP does
not create the false alert; it makes an already-false alert alarming, which is the
part the owner needs to weigh.

**Fail closed three times, deliberately.** (1) Every site sets `remedy`
explicitly (Table S) — including row 12, whose ternary is still an explicit
classification, just one evaluated at run time rather than written as a literal.
(2) The production read is `remedyOf(verdict)`, which
requires the verdict to **own** the field. (3) `refusalText` defaults to
`'reinstall'` for anything that is not the exact string `'sync'`. Layer 1 is what
makes a reviewer think about each site; layer 3 is what protects a site added by a
future WP whose author did not read this spec; **layer 2 is what makes layer 3
reachable** — without it a verdict with no own `remedy` inherits one through the
prototype chain and layer 3 never sees `undefined` (executed; see T9). Both
`refuse` call sites also pass a remedy explicitly — including the argv-parse-error
site, which passes `'reinstall'` because an unknown flag means the OS scheduler
entry is not the one Wienerdog wrote, and that is not something `sync` should be
recommended for. Do **not** leave a production call site relying on the default,
and do **not** replace `remedyOf(verdict)` with a bare `verdict.remedy` because it
reads shorter.

**The `'sync'` banner must be byte-identical to today's.** Verified by
construction and by execution: today's three-part concatenation and
`refusalText(job, why, 'sync')` produce the same string for the same inputs —
byte-for-byte, for every reason string (Current state §8 lists the per-reason
lengths; do not treat any single number as "the" banner length). Note the single
trailing space that block R-T0 ends with, before the tail is interpolated — today
it sits at the end of the second string literal (`'…run '`), and in `refusalText`
it sits inside the template literal after `digest.`.

**F27 cannot detect a wrong class — do not rely on it.** The existing F27 test
(`tests/unit/launcher.test.js:525`, assertions at `:545-547`) drives a **prod
descriptor drift** (Table S row 11, still `sync`) but asserts only
`/wienerdog sync/`, `/next digest/` and `doesNotMatch(/wienerdog doctor/)` — and
**R-T2 contains the literal string "Do not run `wienerdog sync`"**, so
`/wienerdog sync/` matches under *either* tail. Executed this session against the
R-T2 banner for row 11's reason: all three F27 assertions pass. F27's job is to
keep `doctor` out of the banner and it still does that; the guard against a wrong
class on row 11 is **T7's own `doesNotMatch(/Do not run/)`**, and nothing else.

**The launcher is not repaired by `sync` (cross-WP constraint).** Once the sibling
`WP-launcher-no-self-resync-republish` merges, an attended `wienerdog sync` no
longer refreshes `<core>/launcher/launch.js` on a prod install. Nothing you write
here may imply otherwise: R-T2 says "reinstall from a trusted source", not "sync
will fix the launcher", and M1c, M2, M3a and M3b are worded the same way. Do not
add a "and this also restores the launcher" clause anywhere. Do not open or edit
that spec.

**No new dependency, no new file, no schema change.** `REMEDY_TAIL` and
`refusalText` are module-level in `launcher.js`, whose self-containment rule
(`launcher.js:16-26`) allows only Node builtins at top level — neither adds a
`require`. Nothing is persisted, so there is no migration: `alerts.jsonl` records
a plain string exactly as before, and the digest renders it exactly as before.
**ADR-0004:** this WP starts nothing and leaves nothing running.

**Plain language (CLAUDE.md).** The banner and the three documents are read by
knowledge workers, not developers. The `reinstall` tail deliberately says "the app
files" and "a trusted source" rather than "the app tree", "content address" or
"tampered". Do not "improve" it toward precision.

**Ambiguity → simpler option, recorded.** If Table S's positional rule and a site
you are looking at seem to disagree, choose `'reinstall'` (the conservative
class), and record it under "Decisions made" in the PR body. Do not invent a
third class to resolve it.

### Test index (all in `tests/unit/launcher.test.js`, appended)

Prefix every new test name with `remedy:` followed by a single space, so
`node tests/run.js --test-name-pattern "remedy: " tests/unit/launcher.test.js`
selects exactly this WP's tests. The flag must precede the file path — after it,
node ignores it and runs the whole file (executed; see verification step 3).

| id | Test | Asserts | Mutation partner that reddens it |
|----|------|---------|----------------------------------|
| **T1** | `remedy: refusalText('sync') is byte-identical to the shipped banner` | `refusalText('dream', REASON, 'sync')` `assert.equal`s a literal copy of the whole banner, written out in the test. **Assert byte-identity, never a length** — the banner's length is the reason string's length plus a constant, so "the" banner has no single length (Current state §8 lists five). If you want a sanity number: with `REASON` = the prod tree-mismatch string (Table S row 9) the result is 273 chars; with the prod descriptor-drift string (row 11) it is 344 | change one character of `REMEDY_TAIL.sync` |
| **T2** | `remedy: refusalText('reinstall') is byte-identical to the canonical reinstall banner` | **`assert.equal` against a literal copy of block R-T0 (with the same `jobName`/`why`) followed by a literal copy of block R-T2, written out in the test.** Then, and only as a readability aid, `doesNotMatch(/If the change was intentional/)`. **A fragment check is NOT acceptable here** — the round-2 draft carried a different R-T2 wording in its Exact contract, and three fragment regexes (`/Do not run/`, `/Reinstall Wienerdog from a trusted source/`, `doesNotMatch(/If the change was intentional/)`) all passed against the stale text. Byte-identity is what makes the code block a checked mirror of the fence instead of an unchecked one | swap the two `REMEDY_TAIL` values; **and** restore round 2's tail (`…and sync would authorize them as they are.`), which the old fragment form did not catch and this form does |
| **T3** | `remedy: an absent or unknown remedy falls back to reinstall (fail closed)` | for each of `undefined`, `null`, `''`, `'bogus'`, `'SYNC'`, `'__proto__'`, `'constructor'`, `'toString'` the result carries the reinstall tail and **not** `/If the change was intentional/` | change the selector to `REMEDY_TAIL[remedy] \|\| REMEDY_TAIL.reinstall` (passes for the first **five** — `'SYNC'` is not a key on `REMEDY_TAIL` either, so it falls through to the `\|\|` exactly as `undefined`, `null`, `''` and `'bogus'` do; **fails** for the last three, which resolve to `Object.prototype` members) |
| **T4** | `remedy: only the exact string 'sync' selects the sync tail` | `refusalText(j,w,'sync')` carries the sync tail; no other input in T3's list does | change the selector to `remedy !== 'reinstall' ? 'sync' : 'reinstall'` |
| **T5** | `remedy: a prod app-tree mutation refuses with remedy 'reinstall' and a banner that forbids sync` | reuse `setupProd()`; make `<app tree>/package.json` writable and append bytes; `verifyAndResolve(...)` returns `ok:false`, `remedy === 'reinstall'`, and `/app tree does not match the descriptor/`; then drive `main` with an injected `spawn` and assert **zero spawn**, **exit 1**, the alert file `match`es `/Do not run/` and `doesNotMatch(/If the change was intentional/)` | set that site's class back to `'sync'` |
| **T6** | `remedy: a catch-up tree mismatch refuses with remedy 'reinstall'` | `verifyCatchup(corePaths, 'sha256:nope', env, process.platform)` returns `remedy === 'reinstall'` and `/does not match the scheduled digest/` | set that site's class to `'sync'` |
| **T7** | `remedy: a prod descriptor drift keeps remedy 'sync' and the unchanged banner` | reuse `setupProd()`; `jobsLib.saveJob(paths, {...DREAM_JOB, run: 'skill:wienerdog-weekly-review'})`; `verifyAndResolve(...)` returns `remedy === 'sync'` (Table S **row 11**); `main`'s stderr matches `/If the change was intentional/` and **`doesNotMatch(/Do not run/)`, which is the only assertion in the file that catches this mutation** | set that site's class to `'reinstall'`. **The existing F27 test does NOT go red on this** — it asserts `/wienerdog sync/`, which R-T2 also contains ("Do not run \`wienerdog sync\`"); executed, all three F27 assertions pass under R-T2. T7's own `doesNotMatch(/Do not run/)` is the guard |
| **T8** | `remedy: a repointed dev app/current refuses with remedy 'reinstall'` | **Table S row 4 — the round-2 fix, which had no test at all in round 1.** Reuse `setupDev('file')` and the repoint recipe already used by the existing test at `tests/unit/launcher.test.js:288-298`: copy `prodSource()` into a second temp dir, plant a `.git` file in it, `fs.rmSync` the `current` symlink and `fs.symlinkSync` it to that dir. Then `verifyAndResolve(...)` returns `ok:false`, `remedy === 'reinstall'`, `/authorized checkout root/`; drive `main` with an injected `spawn` and assert **zero spawn**, **exit 1**, and a banner that `match`es `/Do not run/` and `doesNotMatch(/If the change was intentional/)` | set row 4's class back to `'sync'` (this is exactly round 1's assignment, so this partner reddening is the regression guard for the finding) |
| **T9** | `remedy: an INHERITED remedy does not select the sync tail (ownership)` | in a `try`/`finally` that deletes it again, set `Object.prototype.remedy = 'sync'`; then for `const v = { ok: false, reason: REASON }` (no own `remedy`) assert `v.remedy === 'sync'` (the hazard is real), `remedyOf(v) === undefined`, and `refusalText('dream', REASON, remedyOf(v))` carries the **reinstall** tail with `doesNotMatch(/If the change was intentional/)`. Also assert `remedyOf({ok:false, remedy:'sync', reason:REASON}) === 'sync'` so the ownership check is not simply disabling the field | replace `remedyOf`'s body with `return verdict.remedy;` — T9's `remedyOf(v) === undefined` and reinstall-tail assertions both go red, while every other test in the file stays green |
| **T10** | `remedy: the outer catch follows the tie-back — after it 'sync', before it 'reinstall'` | **Block R-P's `tied` provision (D6), Table S row 12.** Two halves, both driving `verifyAndResolve` directly. **(a) after:** reuse `setupProd()`, assert the install is healthy (`ok === true`), then `fs.rmSync(path.join(paths.state, 'exec-pins.json'), {force:true})` and re-run — expect `ok:false`, `/integrity check errored:/`, and **`remedy === 'sync'`**. Executed this session, the reason is *"integrity check errored: refusing to authorize the dream job: claude is not pinned — install claude and run `wienerdog sync` so its identity is recorded before the job is bound."* — the app tree is untouched, the tie-back passed, so `sync` is the correct advice. **(b) before:** reuse the existing F13 recipe at `tests/unit/launcher.test.js:486-519` — `fs.chmodSync(<app tree>/package.json, 0o000)` so the tree walk throws *before* the digest comparison — and expect `ok:false`, `/integrity check errored:/`, **`remedy === 'reinstall'`**. Restore the mode in a `finally` exactly as that test does. Skip on `win32`, same as F13 | (a) hardcode the `catch` to `'reinstall'` — half (a) goes red; (b) hardcode it to `'sync'`, or move `tied = true` above its tie-back check — half (b) goes red. Both halves are needed: either mutation alone leaves the other half green |

`setupProd()`, `corePathsOf()` and `DREAM_JOB` already exist at the top of the
file — `DREAM_JOB` at `:15`, `corePathsOf` at `:18-25`, `prodSource` at `:36-42`,
`setupProd` at `:44-65` — and `setupDev(gitKind)` at `:234-259`. Reuse all of
them; do not add new fixtures.

**T9 hygiene.** It mutates `Object.prototype`, which leaks into every test that
runs after it in the same process. Restore it in a `finally` (`delete
Object.prototype.remedy;`) and place T9 **last** in the appended block — after
T10. Do not make any other test depend on it.

**Criteria without a test partner, enforced by review instead of by test** —
state this explicitly in the PR body:

- AC8 (no reason string changed) is enforced by verification step 2's
  **reason-drift diff** (the `diff` of the two normalized reason-line sets) plus
  the unchanged a7 scenario, not by a dedicated test.
- AC15's residue (a prediction about what `sync` would do, phrased without the
  three verbs the prediction sweep greps for) is enforced by review only. The
  sweep catches the wordings review has actually seen; it cannot catch a new one.
- AC10/AC11 (Table M's six items across three files) are enforced by verification
  step 4 and by review; prose is not unit-testable. Five of the six are
  replacements with a stale-form gate each (M1a, M1b, M2, M3a, M3b); the sixth,
  **M1c**, is an append and is gated instead by
  `grep -c "production/dev stance" <runbook>` being `1` — M1c's GLOSSARY link is
  the only occurrence of that phrase in the file, so the count moves from 0 to 1
  exactly when M1c lands.
- Block R-P (position, not text) is a property of how the code reads. The greps
  prove every site carries a class, that the literal permissive class has exactly
  **four** members, and that the ternary appears exactly **once**; they cannot
  prove those are the *right* four and the right one. Tests T5–T8 and T10 pin five
  of the sixteen sites directly (rows 4, 9, 11, 12 — both of row 12's outcomes —
  and 15); the other eleven are a review obligation, and **R-P** — not Table S's
  rows — is what the reviewer checks each site against.

## Security checklist

No untrusted identifier introduced by this WP flows into a filesystem path or a
shell command. `remedy` is a code-owned literal at every producing site; it is
never read from a file, an environment variable, argv, or any content under the
app tree, and it is never interpolated into a path or command — it selects one of
two constant strings by exact equality. The selector normalizes **before**
indexing (`remedy === 'sync' ? 'sync' : 'reinstall'`), so an object-key-shaped
value such as `'__proto__'`, `'constructor'` or `'toString'` cannot reach
`REMEDY_TAIL` as a lookup key at all (executed for all three).

**Prototype-chain read (round-2 finding).** Normalizing before indexing protects
the *lookup*; it does not protect the *read*. `verdict.remedy` on a verdict with
no own `remedy` resolves up the prototype chain, so a single
`Object.prototype.remedy = 'sync'` anywhere in the process makes every
unclassified refusal recommend `sync` — executed on this branch: the bare read
returns `'sync'` and selects the permissive tail, while
`Object.hasOwn(verdict,'remedy')` is `false`. The production read is therefore
`remedyOf(verdict)` (Table R's ownership row, D3), and T9 pins it. This is not a
theoretical hardening: without it the explicit fail-closed guarantee this WP
advertises for future return sites does not hold.

The banner interpolates `jobName` and `why`, exactly as it does today — unchanged
behaviour, and both are already bounded and sanitized by `src/core/alerts.js`
before they reach the digest.

## Acceptance criteria

- [ ] **AC1** `refusalText(job, why, 'sync')` is byte-identical to the banner
      `main` produces today for the same inputs (T1).
- [ ] **AC2** `refusalText(job, why, 'reinstall')` is **byte-identical** to block
      R-T0 followed by block R-T2 for the same inputs — asserted against a literal
      copy of R-T2, not against regex fragments (T2).
- [ ] **AC3** An absent, empty, unknown or object-key-shaped `remedy` yields the
      reinstall tail (T3), **and** a verdict that does not *own* a `remedy` yields
      the reinstall tail even when `Object.prototype.remedy === 'sync'` — the
      production read is `remedyOf(verdict)`, never a bare `verdict.remedy` (T9).
- [ ] **AC4** Only the exact string `'sync'` yields the sync tail (T4).
- [ ] **AC5** Every `{ok:false}` return in `verifyAndResolve` and `verifyCatchup`
      carries a `remedy`, in the token order `{ ok: false, remedy: …, reason: … }`;
      no site remains on the old shape (verification step 2, `stale` and
      `conforming`).
- [ ] **AC6** Exactly **4** sites carry the literal `remedy: 'sync'`, and they are
      Table S rows **5, 6, 10, 11** — every one of them strictly after block R-P's
      tie-back check (the bound-root equality on the dev arm, the tree-digest
      comparison on the prod arm) (verification step 2, `sync` + review).
- [ ] **AC7** The number of conforming sites equals the number of refusal return
      sites before the change (verification step 2, git-derived baseline).
- [ ] **AC8** No reason string, no verification rule, and no
      `verifyContainment`/`appendRefuseAlert` body changed (verification step 2's
      reason-drift `diff`; a7 scenario green).
- [ ] **AC9** A prod app-tree mutation, a catch-up tree mismatch and a **repointed
      dev `app/current`** all refuse with `remedy: 'reinstall'`, spawn nothing,
      exit 1, and write an alert whose text forbids `sync` (T5, T6, T8). A prod
      descriptor drift still refuses with `remedy: 'sync'` and today's banner (T7).
- [ ] **AC10** The runbook, `README.md` and `docs/THREAT-MODEL.md` carry Table M's
      replacements and no longer claim `sync` is the remedy for every mismatch
      (verification step 4).
- [ ] **AC11** No recovery command appears in the banner, the runbook's new
      subsection, the README bullet, or the threat-model sentences; the runbook
      links to `docs/GLOSSARY.md`'s **production/dev stance** entry instead
      (verification step 4, greps 3 and 4).
- [ ] **AC12** The full unit suite and the a7 integrity scenario pass, with every
      pre-existing test unmodified (verification steps 1, 5, 6).
- [ ] **AC13** Running the verification commands twice produces identical output;
      nothing in this WP writes state (idempotent by construction — it adds no
      writer).
- [ ] **AC14** Block R-P's `tied` provision (D6) holds: `verifyAndResolve`'s outer
      `catch` returns `'sync'` when a tie-back check had already executed and
      passed on the path that reached it, and `'reinstall'` when none had; the
      ternary appears exactly **once** in the file; `verifyCatchup` has no `tied`
      flag (T10; verification step 2, `tied`).
- [ ] **AC15** R-T2's **semantic constraint** holds at every surface that restates
      it: no prose you land predicts what `wienerdog sync` *would do* — M2 and M1c
      state the conclusion (*syncing is not the safe next step*), and M3a/M3b state
      the mechanism and the rule, not an outcome. Gated by verification step 4's
      **prediction sweep** reading `0` in all four files; the residue it cannot
      catch (a novel prediction phrased without those three verbs) is a review
      obligation. See the Mirrored Surface Checklist entry "R-T2's semantic
      constraint" for the full list of bound surfaces.

## Verification steps (run these; paste output in the PR)

Every command is read-only against your machine: no real launchd/systemd/schtasks
entry is created or read, nothing under `~/.wienerdog` is touched, and all
fixtures live under `mktemp`-created directories. **Never run bare `node --test`**
— `tests/run.js` is the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set,
and without it the suite can drive the real scheduler.

**0. Gate polarity — read this before running anything below.**

`grep` exits **0 when it matched** and **1 when it did not**, and `grep -c` is no
exception: it prints `0` *and* exits 1 on zero matches. So a gate written as
`grep -c PAT file || echo OK` fires its marker on **absence**, and one written as
`grep -c PAT file && echo OK` fires on **presence**. Getting this backwards makes
a gate pass on the violation and fail on the correct state.

And polarity is only half of it. A gate can also be **vacuous** (it fires its
marker no matter what the tree contains) or **inverted against the work** (it goes
red on a correct implementation and green on no implementation at all). Round 2's
sweep claimed "every gate was proven in both directions" while enumerating only
three buckets, and review then found **two** gates that were in none of them and
that had *both* of the other faults. That claim is therefore re-established here
**gate by gate**, not in the abstract. Every gate below was executed on a correct
state and on a deliberately broken one, and judged by **exit code**, with one
stated exception that carries its reason in its own row: **step 3**, whose verdict
is a printed test name because both outcomes exit 0.

**Two different red inputs, and the `kind` column that keeps them apart.** Round 5
falsified this table's claim that `npm test` and `npm run lint` had "no WP-specific
red input". They do: `npm test` is `node tests/run.js` (`package.json:22`), which
runs the **whole** suite — the 27 `launcher:` tests included — so any mutation that
reddens `tests/unit/launcher.test.js` reddens `npm test` too (executed: one reason
string mutated ⇒ launcher-only `exit=1`, full suite `exit=1`, `fail 3`). What those
gates lack is something else: an **absent-work** red state. On an untouched tree
T1–T10 do not exist and no prose has moved, so they are green on a tree where none
of the work was done. *"Has no red input"* and *"has no absent-work red input"* are
different properties, and collapsing them is what produced step 1's defect two
rounds ago and this one. So every row now carries a **`kind`**:

- **completion** — red on an untouched tree. Its green state is itself evidence the
  work landed. Six rows: step 1, both step-2 count rows, step 3, step 4's five
  stale-form greps, step 4's GLOSSARY-link count.
- **regression** — green on an untouched tree, so its green state is **never**
  evidence the work landed; it only catches work that went wrong. Six rows: step 2's
  reason-drift `diff`, step 4's recovery and prediction sweeps, and steps 5, 6 and 7.
  Every one of them still has a mutation red input, recorded in its own row, and each
  is paired with a completion gate that does prove the work landed.

Read "green" on a **regression** row as *nothing broke*, never as *it is done*. The
reverse mistake — a gate that goes red on a correct implementation and green on no
implementation at all — is the **inverted** fault that round 2's sweep missed twice
(the README M2 anchor, below), and it is neither of these kinds; it is a broken gate.

**The table's own completeness is part of the gate.** Three separate rounds have
falsified a blanket "the gates are complete" claim — an acceptance criterion with
no gate, a gate anchored on a string the correct text keeps, and a command that
had no row here at all and was a silent no-op precisely because nobody had argued
about it. So: **every command in steps 1 through 7 has a row in this table, and
adding a command means adding its row in the same edit.** Presence in the table
is itself the thing to check.

**And a row can be wrong in the other direction: correct commands, backwards
record.** Round 4 found the five stale-prose gates' verdict columns swapped — the
"proved green on" cell described the pre-change tree (where the marker is
**absent**, i.e. red) and "proved red on" described the applied replacement (where
it prints, i.e. green). The commands' polarity was right the whole time; only this
table's account of them was inverted, which is worse than useless, because a
reader auditing the table would "fix" a working gate. The rows were re-measured
and rewritten in round 4 with the direction actually observed. **Write the row
from the run you just did, not from the outcome you expect.**

| gate | kind | verdict comes from | proved green on | proved red on |
|---|---|---|---|---|
| step 1 `node tests/run.js …` | completion | process exit + `fail 0` **and the ten `remedy: …` ✔ lines being present** — `fail 0` alone is true of an untouched tree too, so the presence of T1–T10 is part of this verdict, not commentary on it | the implemented tree: `fail 0` with ten `remedy: …` ✔ lines | reverting D4 on Table S row 9 ⇒ T5 fails; and an untouched tree, which reaches `fail 0` with **zero** `remedy: …` lines |
| step 2 `before`/`stale`/`after`/`sync`/`tied` | completion | five `grep -c` outputs assigned to **variables**; no `\|\|`/`&&` marker reads grep's status, and each assignment already swallows the exit-1-on-zero with `\|\| true` (`before` is guarded instead, by `test "$before" -gt 0`) | `baseline=17 stale=0 conforming=17 sync=4 tied=1` ⇒ `GATE-OK` | (a) one site reverted ⇒ `stale=1 conforming=16`; (b) one `reinstall` promoted ⇒ `sync=5`; (c) the ternary dropped ⇒ `tied=0`. All three ⇒ `GATE-FAIL` |
| step 2 `GATE-OK`/`GATE-FAIL` marker | completion | `test`'s exit status, never grep's | as above | as above, **plus the untouched tree**: executed round 5 on the pre-change tree ⇒ `baseline=17 stale=17 conforming=0 sync=0 tied=0` ⇒ `GATE-FAIL`. This is the row that makes step 2 a completion gate |
| step 2 **reason-drift `diff`** | regression | **the raw exit code of `diff`** — there is no `\|\|` marker to get backwards | a token-only correct transformation, **committed** ⇒ `exit=0`. **Also `exit=0` on the untouched tree** (executed round 5): with no change, the two normalized line sets are trivially equal, which is what makes this a regression gate — it can only catch a reason string that *moved*, never work that was never done. Paired with the step-2 count rows above, which are red on an untouched tree | one character changed in any reason string ⇒ `exit=1` and the differing lines print |
| step 3 `node tests/run.js --test-name-pattern … <file>` | completion | **the ✔ line naming T1** — *not* the count and *not* the exit code. A pattern that matches nothing prints `tests 1  pass 1  fail 0` and **exits 0**, with the ✔ line naming the *file*; a genuine single match prints identical counts. Executed both this session against a scratch fixture. So the row requires the ✔ line to read `remedy: refusalText('sync') is byte-identical to the shipped banner`, and `pass 1  fail 0` alongside it | the implemented tree | mutating one character of `REMEDY_TAIL.sync` ⇒ `fail 1`, non-zero exit. **And the untouched tree** (executed round 5): `tests 1  pass 1  fail 0`, `exit=0`, but the ✔ line reads `tests/unit/launcher.test.js` — verdict **red**, which is what makes this a completion gate despite the zero exit. Also red-by-inspection if the flag is moved after the path: the run becomes all 27 tests (executed) |
| step 4, five `grep -n PAT file \|\| echo "<X>-OK"` (one row, all five gates, each measured separately) | completion | the marker's presence, which follows grep's status: grep exits **1** (stale form absent) ⇒ marker prints ⇒ **green**; exits **0** (stale form still present) ⇒ no marker ⇒ **red** | the tree with Table M's replacements applied: every anchor is gone, all five greps exit **1**, all five `*-OK` markers print (executed round 4 on a scratch copy of the three files with all six Table M edits applied — `M1a/M1b/M2/M3a/M3b grep_exit=1`) | the pre-change tree, where each anchor matches **exactly once**: every grep prints its stale line and exits **0**, and **no** marker prints (executed round 4 — `M1a/M1b/M2/M3a/M3b grep_exit=0`). **Round 3 recorded these two columns swapped**; the commands were right and the record of them was not |
| step 4 `grep -c "production/dev stance"` | completion | printed count, no marker | `1` after M1c lands (executed round 4 on the scratch copy) | `0` on the pre-change tree (executed round 4, re-confirmed round 5) |
| step 4 `grep -cE` recovery sweep | regression | printed per-file counts, no marker. A **violation detector**, like the sweep below — the baseline is also the untouched tree's value | the stated baseline, which the replacements must not move (executed round 4: `1 / 3 / 2` on the pre-change tree **and** on the replacements-applied copy; `0` for `launcher.js`) | any count going **up** — e.g. adding a recovery command to M1c, M2 or M3 |
| step 4 **prediction sweep** `grep -cE "would authorize\|would install\|would finish"` | regression | printed per-file counts, no marker. A **violation detector**, not a completion detector: `0` is also the untouched tree's value, so it is paired with the five stale-form gates, never a substitute for them | `0` in all four files — executed round 4 on the pre-change tree (grep exit **1**) and on the replacements-applied copy (grep exit **1**) | re-injecting round 2's *"syncing would authorize those files as they are"* into M2 ⇒ `README.md:1`, grep exit **0** (executed round 4) |
| step 5 `npm test` | regression | the process exit code; a non-zero exit is the failure and there is no marker to invert | the untouched pre-change tree — executed round 5: `exit=0`, `tests 1671, pass 1666, fail 0, skipped 5`. **Green on a tree where none of this WP's work was done**, because T1–T10 do not exist there; that is what makes it regression-kind, *not* an absence of red inputs | it **does** have WP-specific mutation red inputs. `npm test` is `node tests/run.js` (`package.json:22`) with no path, so it runs the whole suite, and the 27 `launcher:` tests are in it (executed round 5, counted in a full run). Any mutation that reddens `tests/unit/launcher.test.js` therefore reddens `npm test`: proved round 5 with a proxy mutation of one reason string in `src/scheduler/launcher.js` on a scratch copy ⇒ launcher-file run `exit=1` (`fail 1`) **and** full-suite `exit=1` (`fail 3` — the launcher unit test plus two `a7-integrity-negatives` cases). The step-1 red input (revert D4 at Table S row 9 ⇒ T5 fails) reddens this step by the same mechanism once T1–T10 exist; a proxy was used because they do not exist pre-implementation |
| step 6 a7 scenario `npm run scenarios:a7-integrity` | regression | the process exit code + the printed `PASS`/`FAIL` line | the untouched pre-change tree — executed round 5: `PASS`, `exit=0`. Green with none of the work done, so its green is never evidence the work landed | change any reason string ⇒ that case's `reasonRe` fails. Executed round 5 on the scratch copy with one reason string mutated ⇒ `FAIL (2 failure(s))`, `exit=1` |
| step 7 `npm run lint` | regression | the process exit code of `scripts/lint.js`; a non-zero exit is the failure | the untouched pre-change tree — executed round 5: `exit=0`, `lint passed`. Green with none of the work done | it **does** have a WP-specific mutation red input: all three prose deliverables are inside markdownlint's globs (`docs/**/*.md` for the runbook and threat model, `*.md` for `README.md` — `scripts/lint.js:54-58`), so a Table M transcription that breaks a markdownlint rule reddens it. Proved round 5 in both files by injecting a heading-level skip: runbook ⇒ `MD001` at `:143`, `npm run lint exit=1`; `README.md` ⇒ `MD001` at `:86`, markdownlint `exit=1`. Note `MD013` (line length) is **off** (`package.json:51`), so long transcribed lines are fine |

**Two round-2 gates were rewritten because that sweep is what caught them.** Both
had passed review twice:

1. **The AC8 gate** was `git diff -U0 -- src/scheduler/launcher.js | … || echo
   "NO-REASON-DRIFT"`. `git diff` with **no rev** compares worktree to index, so
   once you commit on `wp/<slug>` — which git discipline requires before you open
   the PR — the diff is empty and the marker fires unconditionally. Executed on a
   clean tree with zero changes: prints `NO-REASON-DRIFT`, `exit=0`. It was *also*
   inverted: `grep -v "remedy:"` filters added lines but keeps every **deleted**
   old `{ ok: false, reason: …}` line, so a correct transformation printed all
   sixteen deletions and no marker (executed). Replaced by the `diff` of two
   normalized line **sets**, which is immune to both.
2. **The README M2 gate** searched for `` the fix is one `wienerdog sync` `` — a
   substring **M2-new deliberately keeps** for the `config.yaml` case. Executed
   against the intended new text: grep exits 0 and `README-M2-OK` is **absent**,
   while deleting the replacement outright produces the marker. The gate punished
   correct work and rewarded doing nothing. Re-anchored on
   `` fail closed; the fix is one ``, which M2-old has and M2-new does not
   (executed both directions; matches exactly once on the pre-change tree).

If you add a gate, prove it the same way, and prove four properties: correct
polarity; non-vacuity (it can fail); a mutation red input (some deliberately broken
version of the correct work turns it red); and its **kind**, measured by running it
on an **untouched** tree — red there ⇒ `completion`, green there ⇒ `regression`.
Never infer the kind from the command's shape; the last two rounds each got it
wrong that way. Run it on the correct state, on a deliberately broken copy, **and**
on the untouched tree, and paste `echo "exit=$?"` for all three. A `regression` gate
is only admissible alongside a `completion` gate for the same acceptance criterion;
alone, it proves nothing about whether the work landed.

**Mirrors of this table** (registered round 5 — the table decides, these repeat).
Change a row and change its mirror in the same edit: the `**Kind: …**` paragraph
under step 2's reason-drift block, under step 4's prediction sweep, and under steps
5, 6 and 7; the "violation detector" wording in the Mirrored Surface Checklist entry
"Checkable form — verification step 4's prediction sweep"; and every `*Red input:*`
line in steps 1–7. No other surface in this spec states a gate's kind or verdict.

**1. The new tests, and the existing ones next to them.**

```bash
node tests/run.js tests/unit/launcher.test.js
```

Expect `fail 0`, and all **ten** `remedy: …` tests present.
*Red input:* revert D4 on Table S row 9 (drop its `remedy`, restoring the old
shape) — T5 fails, because the banner then carries the sync tail.

**2. The site gates.** Run from the repo root.

**Brace `${BASE}`.** Under **zsh** — the macOS default and this project's shell —
`"$BASE:src/..."` is parsed as a history-style `:s` modifier and the argument is
rewritten to `<sha>.js`, so `git show` dies with *"ambiguous argument
'<sha>.js'"*, `before` becomes `0`, and the gate prints a spurious `GATE-FAIL`.
Verified this session: unbraced ⇒ fatal under zsh, `17` under bash; braced ⇒ `17`
under both.

**`conforming` must accept the ternary.** Fifteen sites carry a literal class and
one (Table S row 12) carries `tied ? 'sync' : 'reinstall'`. `conforming` therefore
matches `remedy: [^,]+,` — any single-token-through-first-comma value — while
`sync` still counts only the literal `'sync'` (so AC6's **4** is unaffected) and
`tied` counts the ternary, which must appear exactly **once**. A `remedy:` value
can never itself contain a comma, so `[^,]+` cannot over-run into `reason:`.

```bash
BASE=$(git merge-base HEAD main)
before=$(git show "${BASE}:src/scheduler/launcher.js" | grep -c "return { ok: false, reason:")
stale=$(grep -c "return { ok: false, reason:" src/scheduler/launcher.js || true)
after=$(grep -cE "return \{ ok: false, remedy: [^,]+, reason:" src/scheduler/launcher.js || true)
sync=$(grep -c "return { ok: false, remedy: 'sync', reason:" src/scheduler/launcher.js || true)
tied=$(grep -c "remedy: tied ? 'sync' : 'reinstall', reason:" src/scheduler/launcher.js || true)
echo "baseline=$before stale=$stale conforming=$after sync=$sync tied=$tied"
test "$before" -gt 0 && test "$stale" -eq 0 && test "$after" -eq "$before" && test "$sync" -eq 4 && test "$tied" -eq 1 && echo GATE-OK || echo GATE-FAIL
```

Expect `stale=0`, `conforming=$baseline`, `sync=4`, `tied=1`, `GATE-OK`. Executed
this session against a mechanically transformed copy of the current file in a
scratch `mktemp -d` git repo: `baseline=17 stale=0 conforming=17 sync=4 tied=1
GATE-OK`. The `test "$before" -gt 0` guard is what makes a broken `git show` fail
loudly instead of silently comparing against zero.
*Red inputs, each executed on that scratch copy:* (a) revert one site to the old
shape ⇒ `stale=1 conforming=16` ≠ baseline; (b) promote one `reinstall` site to
`sync` ⇒ `sync=5`; (c) drop the ternary (hardcode row 12 to `'reinstall'`) ⇒
`tied=0`. All three print `GATE-FAIL`.
*Non-vacuity:* `before` is derived from git, not hardcoded, and is asserted
non-zero; `grep -c` is line-oriented and every site is a single line.

Then confirm no reason string moved (AC8). **Do not use `git diff` with no rev
here** — it compares worktree to index, so it goes empty the moment you commit,
and any `|| echo` marker hanging off it fires unconditionally (step 0). Compare
the two **sets of reason lines** instead, normalizing the added `remedy:` token
away so a correct transformation is a no-op:

```bash
# same shell as the block above — reuses $BASE
diff <(git show "${BASE}:src/scheduler/launcher.js" | grep "return { ok: false, reason:") \
     <(sed -E "s/return \{ ok: false, remedy: [^,]+, reason:/return { ok: false, reason:/" src/scheduler/launcher.js | grep "return { ok: false, reason:")
echo "reason-drift exit=$?   # 0 ⇒ NO REASON DRIFT; 1 ⇒ a reason string moved (the lines print above)"
```

**The exit code *is* the verdict — there is no marker to get backwards.** `sed -E`
is required: BSD `sed` (macOS) has no `\|` alternation in BRE, and the normalizer
must also flatten the ternary form, which `[^,]+` does. Executed this session in a
scratch git repo on a **committed**, token-only-correct transformation of the real
file ⇒ `exit=0`; with one character changed in the `is not prod or dev` reason ⇒
`exit=1` and the pair prints. `$before` being non-zero (asserted above) is what
rules out the degenerate "two empty streams compare equal" case.

**Kind: regression** (see the gate table). On an untouched tree the two normalized
sets are trivially equal and this prints `exit=0` (executed round 5), so a green
here says only *no reason string moved* — never *the remedy work landed*. The
`GATE-OK`/`GATE-FAIL` block above is the completion gate it is paired with; that
one prints `GATE-FAIL` on an untouched tree (executed round 5:
`baseline=17 stale=17 conforming=0 sync=0 tied=0`).

**3. The `sync` banner is byte-identical to today's.**

```bash
node tests/run.js --test-name-pattern "remedy: refusalText\('sync'\)" tests/unit/launcher.test.js
```

**The flag must come *before* the file path.** `tests/run.js:8` forwards argv
verbatim to `node --test`, and node silently ignores a `--test-name-pattern` that
follows a positional path: executed this session, the flag-after-path form ran
the whole file (`tests 27, pass 27, fail 0`) while the form above selects. Round
3's draft carried the flag last, so its stated "Expect 1 pass" was unreachable.

**The verdict is the printed test name, not the count and not the exit code.**
When the pattern matches nothing, node reports the *file* as one passing entity —
`tests 1  pass 1  fail 0`, exit 0, with the ✔ line naming
`tests/unit/launcher.test.js` instead of a test. A genuine single match prints
exactly the same counts. Both executed this session against a scratch fixture, so
`pass 1` alone cannot tell them apart. Expect a ✔ line reading
`remedy: refusalText('sync') is byte-identical to the shipped banner`, then
`tests 1  pass 1  fail 0`. If the ✔ line is a file path, the pattern selected
nothing and this step proved nothing.
*Red input:* change one character of `REMEDY_TAIL.sync` — T1 fails, `fail 1`,
non-zero exit.

**4. The prose gates.**

**One gate per Table M replacement — five, not three.** Round 1 gated only M1b,
M2 and M3a; M1a and M3b could be left unapplied with every gate still green.
Both stale forms are single-line literals matching exactly once on the pre-change
tree, so the two added gates are non-vacuous.

**The M2 anchor must be a substring M2-new does NOT keep.** Round 2 anchored on
`` the fix is one `wienerdog sync` `` — which M2-new deliberately retains for the
`config.yaml` case — so the gate went red on correct work and green on no work at
all (step 0). The anchor is now `` fail closed; the fix is one ``: present in
M2-old, absent from M2-new, matching exactly once on the pre-change tree. Executed
both directions this session. Check any anchor you add the same way — read the
replacement text and confirm the anchor is gone from it.

```bash
grep -n "fail closed; the fix is one" README.md || echo "README-M2-OK"
grep -n "The one remedy is \`wienerdog sync\`" docs/THREAT-MODEL.md || echo "THREATMODEL-M3A-OK"
grep -n "point to the digest banner and" docs/THREAT-MODEL.md || echo "THREATMODEL-M3B-OK"
grep -n "For almost every mismatch" docs/runbooks/scheduler-and-executable-integrity.md || echo "RUNBOOK-M1B-OK"
grep -n '## The fix: `wienerdog sync`' docs/runbooks/scheduler-and-executable-integrity.md || echo "RUNBOOK-M1A-OK"
grep -c "production/dev stance" docs/runbooks/scheduler-and-executable-integrity.md
grep -cE "npx wienerdog|wienerdog update|npm install -g" docs/runbooks/scheduler-and-executable-integrity.md README.md docs/THREAT-MODEL.md src/scheduler/launcher.js
grep -cE "would authorize|would install|would finish" README.md docs/runbooks/scheduler-and-executable-integrity.md docs/THREAT-MODEL.md src/scheduler/launcher.js
```

Expect all **five** `*-OK` markers (each stale claim gone), `1` for the GLOSSARY
link, and — for the recovery sweep — **exactly** these counts, which are the
measured pre-change baseline and must not move:

```text
docs/runbooks/scheduler-and-executable-integrity.md:1
README.md:3
docs/THREAT-MODEL.md:2
src/scheduler/launcher.js:0
```

(The runbook's single hit is its pre-existing "Upgrading Wienerdog" bullet, which
already names `npx wienerdog@latest sync`; it is not yours to touch. README's
three are its install instructions.) AC11 fails if any count goes up.

**The last grep is the prediction sweep (AC15).** Expect `0` from **all four**
files. It enforces R-T2's semantic constraint on the prose that restates it: the
three rejected verbs are the ones round 1 and round 2 actually used, and round 3
left two of them standing in M2 and M1c after R-T2 itself had been corrected (see
the Mirrored Surface Checklist entry "R-T2's semantic constraint"). Transcribe
Table M's blocks exactly and this stays `0`; write your own wording about what
`sync` *would do* and it will not. It is **kind: regression** in the gate table — a
violation detector, not a completion detector: `0` is also what an untouched tree
prints, so it proves nothing on its own and is paired with the five stale-form
gates above, which are `kind: completion` and are what prove the work landed. The
recovery sweep on the line above is regression-kind for the same reason.

Executed against the pre-change tree (round 4, by exit code): each of the five
`grep -n` gates prints its stale line, **exits 0**, and prints **no** `*-OK`
marker; the GLOSSARY-link count is `0`; the prediction sweep is `0` in all four
files. That is the red state for the five gates. Executed again against a scratch
copy of the three files with all six Table M edits applied: every anchor grep
**exits 1**, all five markers print, the GLOSSARY count is `1`, the recovery
counts are unchanged at `1 / 3 / 2 / 0`, and the prediction sweep is still `0` —
the green state, also by exit code.
*Red inputs:* leave one stale sentence in place (its `grep -n` exits 0 and the
`*-OK` marker is absent); add a recovery command to M1c, M2 or M3 (that file's
count in the recovery sweep goes up); or reintroduce round 2's *"syncing would
authorize those files as they are"* into M2 (executed: the prediction sweep prints
`README.md:1` and grep exits 0).

**5. Nothing else regressed.**

```bash
npm test
```

Expect `fail 0`. Baseline on this branch before the change: `tests 1671, pass
1666, fail 0, skipped 5` — afterwards, **ten** more (T1–T10) and the same zero.
T10 carries `{ skip: process.platform === 'win32' }` like the F13 test whose
`chmod` recipe its second half reuses, so on Windows expect nine more passes and
one more skip.

**Kind: regression** (see the gate table). This is the same 27-`launcher:`-test
file as step 1 plus the rest of the suite — `node tests/run.js` with no path runs
everything — so step 1's red input reddens this too. It is *not* redundant with
step 1: step 1 reads the ten `remedy:` ✔ lines and so is red on an untouched tree,
while this step is green there and only tells you nothing else broke.
*Red input:* the step-1 red input (revert D4 on Table S row 9 ⇒ T5 fails) ⇒ `fail`
non-zero here as well; measured round 5 with a proxy mutation (one reason string
changed) ⇒ full-suite `exit=1`, `fail 3`.

**6. The A7 integrity proof still holds.**

```bash
WIENERDOG_RUN_SCENARIOS=1 WIENERDOG_TEST_NO_REAL_SCHEDULER=1 npm run scenarios:a7-integrity
```

Expect `PASS` (executed green on this branch before the change). Its six
`reasonRe` regexes match reason fragments only, so a correct implementation
cannot move them. **Kind: regression** (see the gate table) — `PASS` here is also
what the untouched tree prints, so it never shows the work landed.
*Red input:* change any reason string — the corresponding case fails with a reason
mismatch. Executed round 5 on a scratch copy with one reason string mutated ⇒
`FAIL (2 failure(s))`, `exit=1`.

**7. Lint.**

```bash
npm run lint
```

Expect green (markdownlint + frontmatter schema).

**Kind: regression** (see the gate table), but it is not input-free: markdownlint's
globs cover all three prose deliverables — `docs/**/*.md` for
`docs/runbooks/scheduler-and-executable-integrity.md` and `docs/THREAT-MODEL.md`,
`*.md` for `README.md` (`scripts/lint.js:54-58`) — and the frontmatter layer covers
this spec's own status flip.
*Red input:* a Table M transcription that breaks a markdownlint rule. Measured
round 5 by appending a `####` subsection under an `##` heading: the runbook ⇒
`MD001/heading-increment` at `:143` and `npm run lint exit=1`; `README.md` ⇒ `MD001`
at `:86` and markdownlint `exit=1`. `MD013` (line length) is disabled
(`package.json:51`), so a long transcribed line is not a violation; a skipped
heading level, a bare `#` duplicate or a missing final newline is.

## Out of scope (do NOT do these)

- **Closing S1 — the `sync` republish itself.** `vendorSelf` calling
  `writeLauncher(paths, {manifest})` with no `sourceRoot`, so `packageRoot()`
  resolves to the writable app tree and republishes `<core>/launcher/launch.js`
  from it, is `WP-stance-authority-containment`'s **Table G row S1**: explicitly
  known-open, out of that WP's scope, routed to the owner. A **sibling work
  package** covers the republish and the structural channel goes to an ADR. This
  WP only stops the product from *instructing* the user into it. Do not touch
  `src/core/vendor.js`.
- **Reclassifying any site away from what block R-P yields.** R-P is the ratified
  rule for this WP and Table S is R-P applied; do not move a row in **either**
  direction. Round 1 framed this bullet as "broadening the `reinstall` class",
  which quietly told the reader the only open question was whether *more* sites
  should be conservative — and that framing is exactly why two sites that were
  wrongly `sync` went unexamined for a round. The open question is symmetric:
  **any** row whose position relative to the two tie-back checks (the dev-arm
  bound-root equality, the prod-arm tree-digest comparison) you read differently
  from Table S is a finding, whichever class it moves toward. Note it under
  "Discovered issues" in the PR body, choose `'reinstall'` for the implementation
  (the conservative class, per Implementation notes), and leave the table alone.
- **Gating, moving or removing the macOS catch-up registration.**
  `ensureCatchup` (`src/cli/schedule.js:409`) registers a login + hourly catch-up
  entry unconditionally on macOS, with no stance gating, even though `verifyCatchup`
  is documented (`src/scheduler/launcher.js:335-339`) to always refuse on a dev
  install. The consequence for this WP is stated under "Known consequence" in
  Implementation notes: a permanent `reinstall`-tail banner in every digest on
  every dev install, the maintainer's own included. **Do not touch
  `src/cli/schedule.js`** — it is not a Deliverable and the registration rule is a
  different contract. Record it under "Discovered issues" in the PR body as a
  candidate sibling WP, quoting the executed `verifyCatchup` refusal from
  Implementation notes, so the owner can decide whether the entry should exist on
  dev at all.
- **`docs/adr/0028-scheduler-app-executable-integrity.md`.** Ratified and
  owner-signed. Three of its claims become false —
  §3 *"the single remedy is always `wienerdog sync`"* (`:185`); Alternatives
  considered, *"A mismatch is fail-closed; `sync` is the one remedy"* (`:336`);
  and the "Refuse-surface decision" section, *"the refuse text and runbook point
  there + to `wienerdog sync`"* (`:630-632`). **Do not edit it**, not even to add
  a note. Record all three under "Discovered issues" in the PR body with the
  correction they need — each should read *"…only for refusals reached after the
  live `app/current` has been tied to what the descriptor authorized: after tree
  verification on a production install, or for an authorized mutable dev
  checkout"* — so the owner can amend a ratified surface as the owner's act. Note
  the "or for an authorized mutable dev checkout" clause: dev rows 5 and 6 keep
  `sync` without any tree hash, so a correction that said "only after tree
  verification" would itself be false.
- **`WP-stance-authority-containment` (`Ready`, this WP's dependency).** Table S
  row 3 reclassifying from `sync` to `reinstall` falsifies two of its registered
  cells: **Table B row 4** (`:780`, *"durable alert, remedy `wienerdog sync`"*) and
  **Table F row 3** (`:2031`, *"durable alert naming `wienerdog sync`"*). Both now
  describe a site this WP makes `reinstall`. **Do not open or edit that file** — it
  is `Ready` and is not a Deliverable here. Record both under "Discovered issues"
  in the PR body, naming the table, the row and the line, so an architect pass can
  correct them on that spec.
- **`docs/GLOSSARY.md`.** `WP-stance-authority-containment` D6 rewrites its
  **production/dev stance** entry and is this WP's dependency, so that entry is
  already the single user-facing home for what a trusted source is. Adding a
  glossary term for the remedy classes is not warranted — `remedy` is an internal
  field name, not a product noun. Do not edit this file.
- **`src/core/alerts.js`, `src/core/digest.js`.** The alerting mechanism and the
  digest banner are unchanged. Per-reason lengths are in Current state §8 — the
  longest fixed-length banner this WP can produce is **410** chars against a
  2000-char field cap; nothing truncates and nothing needs widening.
- **`src/core/exec-identity.js:491,503`.** Its `refusing to run <name>: …`
  messages also name `wienerdog sync`. They belong to the attended CLI's
  executable-pin path, not the launcher's fire-time refusal, and are a different
  contract. Leave them.
- **`tests/scenarios/a7-integrity/**`.** Its assertions key on reason fragments,
  which this WP does not change (Current state §6). Run it; do not edit it.
- **`memory/lessons/inbox.md`.** `scripts/boundary-check.js:48` unconditionally
  allowlists this path, so CI would *not* reject an edit to it — but `CLAUDE.md`
  forbids editing it on a WP branch (parallel branches conflict on merge). Put
  your lessons in the PR body as bullets prefixed with this WP's id; the
  maintainer appends them on `main`.
- **Rewording the `reason` strings** to explain the remedy. The reason is the
  *what*; the remedy sentence is the *what to do*. Keeping them separate is the
  point of the discriminator.
- **Wiring `wienerdog doctor` to A7 state.** Still the deferred candidate WP-162.

## Definition of done

1. All verification steps (0 through 7) pass locally; output pasted into the PR
   body, including the `GATE-OK` line, the `reason-drift exit=0` line, all five
   `*-OK` prose markers, the prediction sweep's four `:0` counts, and the a7
   scenario's `PASS`. Step 0's sweep is restated
   in one line: that every gate you ran or added was proven by **exit code** to be
   correctly polarized, non-vacuous, and green-on-correct-work rather than
   green-on-no-work.
2. Conventional commits; PR titled
   `fix(scheduler): choose the refusal remedy from a structured verdict class (WP-refusal-remedy-discriminator)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. "Discovered issues" names **six** routed items: ADR-0028's
   three false claims (`:185`, `:336`, `:630-632`) with the correction wording
   from "Out of scope"; `WP-stance-authority-containment`'s Table B row 4
   (`:780`) and Table F row 3 (`:2031`), which Table S row 3's reclassification
   falsifies; and the unconditional macOS catch-up registration
   (`src/cli/schedule.js:409`) that makes Table S row 14 fire forever on every dev
   install. Do not edit any of those files.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. The PR body states, in one line, that the recovery property and the two
   invocations it ships are **cited** from `WP-stance-authority-containment`
   Table G row 1 / D6 and were not re-derived, re-worded or copied here.
6. The PR body lists the review-only criteria named under "Test index" — AC8,
   AC10, AC11, AC15's ungreppable residue, and the correctness against block R-P
   of Table S's **four** literal
   `sync` sites plus the eleven literal `reinstall` sites — so the reviewer knows
   which claims no test can make. (Row 12's two outcomes *are* tested, by T10.)
7. The PR body states, in one line, that no text you wrote implies `wienerdog
   sync` repairs or re-publishes `<core>/launcher/launch.js` (the
   `WP-launcher-no-self-resync-republish` constraint in Context).
