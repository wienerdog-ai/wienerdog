---
id: WP-refusal-remedy-discriminator
title: Choose the refusal remedy from a structured verdict class, so an app-tree tamper never tells the user to run `wienerdog sync`
status: Draft
model: sonnet
size: S
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

This WP does **not** close S1. A sibling work package addresses the republish
itself and the structural channel goes to an ADR; see "Out of scope".

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
and for them it is, because they are only reached *after* the app tree has been
proven byte-identical to the descriptor. Same run, a `config.yaml` `run`-action
edit without a sync:

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
`lastReason` verbatim into the banner. Today's banner is **344** chars; the new
one is **336** (measured). Nothing truncates. No plumbing change is needed and
none is authorized.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

Five files. New non-test source is ≈ 20 lines (one lookup object, one pure
function, one changed closure signature, two changed call sites, plus a one-token
`remedy:` added to each existing verdict-return line). The three prose edits are
supplied verbatim in Table M — transcribe them, do not compose.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/launcher.js | **D1** — add `REMEDY_TAIL` + `refusalText` (Exact contracts) and **export `refusalText`**. **D2** — `refuse` takes a third parameter and delegates to `refusalText`; its doc comment (`:436-438`) is rewritten per Table R. **D3** — both `refuse` call sites pass a remedy explicitly (`:450` → `'reinstall'`; `:461` → `verdict.remedy`). **D4** — every `return { ok: false, reason: … }` in `verifyAndResolve` and `verifyCatchup` gains `remedy: '<class>'` per **Table S**, in the exact token order `{ ok: false, remedy: '<class>', reason: … }`. **D5** — the `@returns` of both verifiers gains `remedy:'sync'\|'reinstall'`; the header bullet at `:15` and the `appendRefuseAlert` doc at `:157` drop the word "fixed" per Table R's note. Nothing else: `verifyContainment`, `containedIn`, `appTreeDigestOf`, `liveStance`, `appendRefuseAlert`'s **body**, `readDescriptorFile`, `derivationEnv`, `reDeriveDigest`, `parseArgv`, and every verification rule in either verifier are untouched — **no reason string changes**. |
| modify | tests/unit/launcher.test.js | **T1–T7** (Test index). Append only, at the end of the file, under a new banner comment. **The existing test at `:525` (F27) must pass unmodified**, as must every other existing test. |
| modify | docs/runbooks/scheduler-and-executable-integrity.md | **M1** — the `## The fix: …` heading, its first sentence, and one appended subsection. Exact text in Table M. No other line. |
| modify | README.md | **M2** — the tail of the "Scheduled runs are verified before they run" bullet only. Exact text in Table M. The `[^a7-boundary]` footnote marker and the footnote itself are unchanged. No other line. |
| modify | docs/THREAT-MODEL.md | **M3** — two sentences, anchored by quoted text (not line number). Exact text in Table M. No other line. |

Not Deliverables, deliberately: `docs/adr/0028-scheduler-app-executable-integrity.md`
(ratified, owner-signed — routed), `docs/GLOSSARY.md`, `src/core/vendor.js`,
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
    'Do not run `wienerdog sync` — it would install the app files as they are now. ' +
    'Reinstall Wienerdog from a trusted source, then investigate.',
};

/** The full refusal banner. FAILS CLOSED on the remedy: only the exact string
 *  'sync' selects the permissive tail, so a verdict that omits `remedy`, carries
 *  an unknown value, or carries an inherited object key ('__proto__',
 *  'constructor', …) gets the conservative 'reinstall' tail. A future refusal
 *  return site added without a `remedy` therefore cannot recommend `sync`.
 *  @param {string} jobName @param {string} why @param {string} [remedy]
 *  @returns {string} */
function refusalText(jobName, why, remedy) {
  const tail = REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall'];
  return (
    `wienerdog: refusing to run "${jobName}" — ${why} (integrity mismatch); no job was run. ` +
    `This alert will appear in your next digest. ${tail}`
  );
}
```

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
if (!verdict.ok) return refuse(name, verdict.reason, verdict.remedy); // was: refuse(name, verdict.reason)
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
```

```js
// src/scheduler/launcher.js — module.exports gains exactly one name
module.exports = { verifyAndResolve, verifyCatchup, appTreeDigestOf, verifyContainment, parseArgv, refusalText, main };
// (plus `liveStance`, which WP-stance-authority-containment adds — leave it in place)
```

Worked examples (all four are acceptance criteria; all four were executed):

```
refusalText('dream', W, 'sync')       → byte-identical to today's banner for W
refusalText('dream', W, 'reinstall')  → the reinstall tail
refusalText('dream', W, undefined)    → the reinstall tail   ← fail closed
refusalText('dream', W, 'bogus')      → the reinstall tail   ← fail closed
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

Three canonical tables follow. **Table R** is the single place the classes and
their sentences are decided. **Table S** is the single place the site→class
assignment is decided. **Table M** is the single place the user-facing prose is
decided. Operative prose cites them; it does not restate them.

### Table R — the remedy classes (canonical; every other statement defers to this)

| Fact | Value |
|------|-------|
| **Field name** | `remedy`, on the `{ok:false}` verdict returned by `verifyAndResolve` and `verifyCatchup` |
| **Type** | string, exhaustively one of `'sync'` \| `'reinstall'`. There is no third value and none may be added without amending this table |
| **`'sync'` means** | at this return point the app tree is **not** in question: either it has already been proven byte-identical to the descriptor's `treeDigest`, or the bound stance is `dev` (mutable-by-design, no integrity claim over the tree). Recommending `wienerdog sync` is safe |
| **`'reinstall'` means** | at this return point the app tree has **not** been proven intact. `wienerdog sync` runs *out of* that tree and would re-record it as authorized, so it must not be recommended |
| **`'sync'` tail (verbatim, unchanged from today)** | block **R-T1** below |
| **`'reinstall'` tail (verbatim, NEW)** | block **R-T2** below |
| **Fail-closed default** | **`'reinstall'`.** Selection is `REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall']` — only the exact string `'sync'` reaches the permissive tail. Absent, `undefined`, `null`, `''`, any unknown value, and any inherited object key all resolve to `'reinstall'` (executed for all nine) |
| **What must NEVER decide the remedy** | the `reason` string, the `why` text, `process.env`, the platform, or any file inside the app tree. The class is decided by **position in the verification flow** (Table S) and by nothing else |
| **Unchanged banner prefix** | block **R-T0** below, followed by exactly one space, then the tail. `/refusing to run/` and `/integrity mismatch/` stay unconditional |
| **Unchanged mechanics** | zero spawn, exit 1, one `appendRefuseAlert` call, the same stderr write, `wienerdog doctor` still never named |
| **Doc-comment consequence** | the launcher's word **"fixed"** (header bullet `:15` *"a fixed durable alert"*; `appendRefuseAlert` `:157` *"fixed, code-owned reason"*) becomes wrong — the alert body is still **code-owned** but is no longer a single fixed sentence. Replace "fixed, code-owned" with "code-owned" and "a fixed durable alert" with "a code-owned durable alert" in those two comments; change nothing else in them |

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

R-T2 — the `'reinstall'` tail (new):

```text
Do not run `wienerdog sync` — it would install the app files as they are now. Reinstall Wienerdog from a trusted source, then investigate.
```

### Table S — which return site gets which class (canonical)

**THE RULE, stated once.** A refusal return site carries `remedy: 'sync'` **iff**
it lies either (a) inside `verifyAndResolve`'s **dev arm** — the block guarded by
`stance === 'dev'` — or (b) inside `verifyAndResolve`'s **prod arm strictly after**
the `liveTree !== expectTree` comparison. **Every other** `{ok:false}` return site
in either verifier carries `remedy: 'reinstall'`. The rule is positional, so it is
decided by reading the code, not by reading a string.

Why that rule and not a longer taxonomy: after `liveTree !== expectTree` passes,
the tree `sync` would run out of is *proven* byte-identical to what was
authorized; on the dev arm there is no integrity claim over the tree at all
(a dev checkout is mutable by design), and its refusals are descriptor drift a
maintainer resolves with `sync`. Everywhere else the tree is either unverified or
actively mismatched. Assigning `sync` needs a proof; `reinstall` does not — which
is exactly why `reinstall` is also the fail-closed default in Table R.

Sites in source order, on the tree you will have (i.e. **after**
`WP-stance-authority-containment` has landed):

| # | Function / position | Reason fragment (identity only — do NOT change these strings) | Class |
|---|---|---|---|
| 1 | `verifyAndResolve`, descriptor read | `is missing or unreadable` | `reinstall` |
| 2 | `verifyAndResolve`, realpath of `app/current` | `cannot resolve app/current:` | `reinstall` |
| 3 | dev arm, live stance is not dev (**C1**) | `authorized for a dev checkout but app/current now resolves inside` | `sync` |
| 4 | dev arm, bound-root equality | `does not resolve to the authorized checkout root` | `sync` |
| 5 | dev arm, job absent from config | `nothing authorized to run` | `sync` |
| 6 | dev arm, reduced-descriptor drift | `the job descriptor changed since it was scheduled` | `sync` |
| 7 | stance is neither prod nor dev | `is not prod or dev` | `reinstall` |
| 8 | prod arm, `verifyContainment` propagation (`contain.why`) | *(interpolated helper text)* | `reinstall` |
| 9 | prod arm, **tree digest comparison** | `the live app tree does not match the descriptor` | **`reinstall`** ← the fix |
| 10 | prod arm, job absent from config (after 9) | `nothing authorized to run` | `sync` |
| 11 | prod arm, descriptor drift (after 9) | `the job descriptor changed since it was scheduled` | `sync` |
| 12 | `verifyAndResolve` outer `catch` | `integrity check errored:` | `reinstall` |
| 13 | `verifyCatchup`, realpath of `app/current` | `cannot resolve app/current:` | `reinstall` |
| 14 | `verifyCatchup`, `verifyContainment` propagation | *(interpolated helper text)* | `reinstall` |
| 15 | `verifyCatchup`, **tree digest comparison** | `does not match the scheduled digest` | **`reinstall`** ← the fix |
| 16 | `verifyCatchup` outer `catch` | `integrity check errored:` | `reinstall` |

**Counts: 16 sites, 6 `sync`, 10 `reinstall`.**

**STOP RULE.** On this branch's HEAD (before the dependency lands) the file has
**17** sites: one extra `reinstall`-class site, the prod-arm
`looks like a dev checkout (.git present)` pre-check, which
`WP-stance-authority-containment` deletes (its Table C row C5) and which its
Table C row C1 replaces row 3 above. The **`sync` count is 6 on both trees** —
the deleted site is `reinstall`-class and the rewritten one stays in the dev arm.
So: if your working tree yields **6** `sync` sites and a total equal to the
pre-change count of `return { ok: false, reason:` lines, you are correct. If the
`sync` count is anything other than 6, **STOP and report a spec bug in the PR
body** — do not adjust the number to match the code. Verification step 2 derives
the total from git rather than hardcoding it, precisely so 16-vs-17 is not a
number you have to get right.

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
| **M3b** | `docs/THREAT-MODEL.md` | the **last sentence** of the "Independent launcher outside the mutable app tree" bullet — block **M3b-old**, which is soft-wrapped across three source lines, beginning with the word "The" at the end of the line that ends *"not built in this pass."* — becomes block **M3b-new** |

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
— the job refuses with an alert instead (fail closed). For a `config.yaml` edit the fix is one `wienerdog sync`; when it is the **app files** that changed, the alert deliberately does *not* tell you to sync — syncing would record those files as the authorized ones — and asks you to reinstall from a trusted source instead.
```

M3a-old / M3a-new:

```text
The one remedy is `wienerdog sync`.
```

```text
The remedy depends on the class of mismatch: for `config.yaml`/descriptor drift, detected only after the app tree has verified, it is `wienerdog sync`; when the **app tree itself** fails its content address, the refusal withholds that advice — `sync` re-vendors by running out of that same tree — and directs a reinstall from a non-dev source root instead (WP-refusal-remedy-discriminator).
```

M3b-old / M3b-new:

```text
The runbook and the launcher's own refuse text point to the digest banner and `wienerdog sync`, never to `doctor`.
```

```text
The runbook and the launcher's own refuse text point to the digest banner, never to `doctor`; they name `wienerdog sync` only for the mismatch classes where the app tree has already verified.
```

M1c, verbatim:

```markdown
### The one case where `sync` is the wrong move

If the alert tells you **not** to run `wienerdog sync`, take it literally. That
wording appears only when the check that failed was the app's own code — the
files under `~/.wienerdog/app/current` are no longer the files that were there
when you last synced.

`sync` re-vendors Wienerdog by running out of that same folder. If something has
changed the files in it, syncing would re-record the changed files as the
authorized ones — it would finish the job for whatever changed them, not undo it.
So on that alert, and only that alert, the order is reversed: **reinstall first,
investigate second, and don't sync at all.**

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

Table R (classes, sentences, fail-closed default). **The three sentences
themselves live in blocks R-T0/R-T1/R-T2 directly beneath Table R — that is their
canonical home; the table's cells point at them and every item below mirrors
them:**

- [ ] Deliverables cell for `src/scheduler/launcher.js` (D1, D2, D5 — "per Table R")
- [ ] Exact contracts → the `REMEDY_TAIL` / `refusalText` code block and its JSDoc
      (the literals there must be byte-equal to R-T1 and R-T2, and the template
      literal's prefix byte-equal to R-T0 including its trailing space)
- [ ] Exact contracts → the four worked examples
- [ ] Current state §1 (today's single banner) and §3 (the banner that must survive byte-for-byte)
- [ ] Acceptance criteria AC1, AC2, AC3, AC4, AC9
- [ ] Verification step 1 (the T1–T4 test names) and step 3 (byte-identity)
- [ ] Test index rows T1, T2, T3, T4
- [ ] Implementation notes → "Why a two-value remedy class and not a cause taxonomy"

Table S (the positional rule and the site enumeration):

- [ ] Deliverables cell for `src/scheduler/launcher.js` (D4 — "per Table S")
- [ ] Exact contracts → the fixed `{ ok: false, remedy: …, reason: … }` token order
- [ ] Current state §4 (the executed grep counts) and its "16, not 17" pointer
- [ ] Acceptance criteria AC5, AC6, AC7
- [ ] Verification step 2 (the three greps + the git-derived baseline)
- [ ] Test index rows T5, T6
- [ ] Implementation notes → "Do not string-match the reason"
- [ ] Out of scope → the "broaden the reinstall class" item

Table M (the user-facing prose and the citation). **The prose itself lives in the
`M1a-old`…`M3b-new` and `M1c` fenced blocks beneath Table M — that is its
canonical home; the table's rows only say which block goes where:**

- [ ] Deliverables cells for the runbook, `README.md` and `docs/THREAT-MODEL.md`
- [ ] Table M's own rows (each names a block; none restates its text)
- [ ] The anchor-fidelity paragraph under Table M (which anchors are single-line
      literals and which is soft-wrapped)
- [ ] Current state §7 (the three quoted false statements)
- [ ] Acceptance criteria AC10, AC11
- [ ] Verification step 4 (the doc greps)
- [ ] Out of scope → `docs/GLOSSARY.md` and `docs/adr/0028-…`
- [ ] **The citation of `WP-stance-authority-containment` Table G row 1 / D6** —
      appears in Context (S1 and the amplification), in Table M's "The citation"
      paragraph, in M1c's link target, in Out of scope, and in Definition of done
      item 5. It is a **citation, never a copy**: if that spec's recovery property
      or its D6 entry list changes, nothing here needs re-wording, and nothing
      here may be re-worded to "match" it

## Implementation notes & constraints

**Do not string-match the reason (Table S).** The single most important
constraint. The remedy must never be derived from `why`, from a regex over the
reason, or from anything an attacker who can write the app tree could influence.
It is decided at the return statement, by position in the verification flow, and
carried as data. If you find yourself writing `/does not match/.test(reason)`,
stop — that is the defect this WP exists to prevent, not the fix.

**Why a two-value remedy class and not a cause taxonomy (Table R).** A cause
enum (`'tree-mismatch'`, `'descriptor-drift'`, …) mapped to remedies would need
its own default for an unmapped cause, doubling the number of places the
fail-closed property has to hold and adding a mapping table that can drift from
the enum. Two values that *are* the remedy classes make the fail-closed property
a single expression (`remedy === 'sync' ? … : …`) that cannot be got wrong. The
cost is that the class name is presentation-shaped; that is acceptable because
the verdict already carries a fully presentation-shaped field (`reason`).

**Fail closed twice, deliberately.** Every site sets `remedy` explicitly (Table S)
*and* `refusalText` defaults to `'reinstall'`. The explicit setting is what makes
a reviewer think about each site; the default is what protects a site added by a
future WP whose author did not read this spec. Both `refuse` call sites also pass
a remedy explicitly — including the argv-parse-error site, which passes
`'reinstall'` because an unknown flag means the OS scheduler entry is not the one
Wienerdog wrote, and that is not something `sync` should be recommended for. Do
**not** leave a production call site relying on the default; the default is
exercised by test T3/T4 only.

**The `'sync'` banner must be byte-identical to today's.** Verified by
construction and by execution: today's three-part concatenation and
`refusalText(job, why, 'sync')` produce the same 344-character string for the
same inputs. Note the single trailing space that block R-T0 ends with, before the
tail is interpolated — today it sits at the end of the second string literal
(`'…run '`), and in `refusalText` it sits inside the template literal after
`digest.`. The existing F27 test at `tests/unit/launcher.test.js:525` drives a
descriptor drift and asserts `/wienerdog sync/` — if it goes red you have changed
the wrong class.

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
`--test-name-pattern "remedy: "` selects exactly this WP's tests.

| id | Test | Asserts | Mutation partner that reddens it |
|----|------|---------|----------------------------------|
| **T1** | `remedy: refusalText('sync') is byte-identical to the shipped banner` | `refusalText('dream', REASON, 'sync')` equals a literal copy of today's full 344-char string, written out in the test | change one character of `REMEDY_TAIL.sync` |
| **T2** | `remedy: refusalText('reinstall') withholds sync and names a reinstall` | the result `match`es `/Do not run/` and `/Reinstall Wienerdog from a trusted source/`, and `doesNotMatch(/If the change was intentional/)` | swap the two `REMEDY_TAIL` values |
| **T3** | `remedy: an absent or unknown remedy falls back to reinstall (fail closed)` | for each of `undefined`, `null`, `''`, `'bogus'`, `'SYNC'`, `'__proto__'`, `'constructor'`, `'toString'` the result carries the reinstall tail and **not** `/If the change was intentional/` | change the selector to `REMEDY_TAIL[remedy] \|\| REMEDY_TAIL.reinstall` (passes for the first four, **fails** for the last three) |
| **T4** | `remedy: only the exact string 'sync' selects the sync tail` | `refusalText(j,w,'sync')` carries the sync tail; no other input in T3's list does | change the selector to `remedy !== 'reinstall' ? 'sync' : 'reinstall'` |
| **T5** | `remedy: a prod app-tree mutation refuses with remedy 'reinstall' and a banner that forbids sync` | reuse `setupProd()`; make `<app tree>/package.json` writable and append bytes; `verifyAndResolve(...)` returns `ok:false`, `remedy === 'reinstall'`, and `/app tree does not match the descriptor/`; then drive `main` with an injected `spawn` and assert **zero spawn**, **exit 1**, the alert file `match`es `/Do not run/` and `doesNotMatch(/If the change was intentional/)` | set that site's class back to `'sync'` |
| **T6** | `remedy: a catch-up tree mismatch refuses with remedy 'reinstall'` | `verifyCatchup(corePaths, 'sha256:nope', env, process.platform)` returns `remedy === 'reinstall'` and `/does not match the scheduled digest/` | set that site's class to `'sync'` |
| **T7** | `remedy: a descriptor drift keeps remedy 'sync' and the unchanged banner` | reuse `setupProd()`; `jobsLib.saveJob(paths, {...DREAM_JOB, run: 'skill:wienerdog-weekly-review'})`; `verifyAndResolve(...)` returns `remedy === 'sync'`; `main`'s stderr matches `/If the change was intentional/` and `doesNotMatch(/Do not run/)` | set that site's class to `'reinstall'` (this also reddens the existing F27 test — that is the point) |

`setupProd()`, `corePathsOf()` and `DREAM_JOB` already exist at the top of the
file (`:15-64`) — reuse them, do not add new fixtures.

**Criteria without a test partner, enforced by review instead of by test** —
state this explicitly in the PR body:

- AC8 (no reason string changed) is enforced by verification step 2's third grep
  plus the unchanged a7 scenario, not by a dedicated test.
- AC10/AC11 (the three prose edits) are enforced by verification step 4's greps
  and by review; prose is not unit-testable.
- The Table S *rule* (position, not text) is a property of how the code reads.
  The greps prove every site carries a class and that the permissive class has
  exactly six members; they cannot prove the six are the *right* six. That is a
  review obligation, and Table S is what the reviewer checks against.

## Security checklist

No untrusted identifier introduced by this WP flows into a filesystem path or a
shell command. `remedy` is a code-owned literal at every producing site; it is
never read from a file, an environment variable, argv, or any content under the
app tree, and it is never interpolated into a path or command — it selects one of
two constant strings by exact equality. The selector normalizes **before**
indexing (`remedy === 'sync' ? 'sync' : 'reinstall'`), so an object-key-shaped
value such as `'__proto__'`, `'constructor'` or `'toString'` cannot reach
`REMEDY_TAIL` as a lookup key at all (executed for all three).

The banner interpolates `jobName` and `why`, exactly as it does today — unchanged
behaviour, and both are already bounded and sanitized by `src/core/alerts.js`
before they reach the digest.

## Acceptance criteria

- [ ] **AC1** `refusalText(job, why, 'sync')` is byte-identical to the banner
      `main` produces today for the same inputs (T1).
- [ ] **AC2** `refusalText(job, why, 'reinstall')` ends with Table R's reinstall
      tail and contains no `If the change was intentional` (T2).
- [ ] **AC3** An absent, empty, unknown or inherited-key `remedy` yields the
      reinstall tail (T3).
- [ ] **AC4** Only the exact string `'sync'` yields the sync tail (T4).
- [ ] **AC5** Every `{ok:false}` return in `verifyAndResolve` and `verifyCatchup`
      carries `remedy: 'sync'` or `remedy: 'reinstall'`, in the token order
      `{ ok: false, remedy: …, reason: … }`; no site remains on the old shape
      (verification step 2, greps 1 and 2).
- [ ] **AC6** Exactly **6** sites carry `remedy: 'sync'`, and they are Table S
      rows 3, 4, 5, 6, 10, 11 (verification step 2, grep 3 + review).
- [ ] **AC7** The number of conforming sites equals the number of refusal return
      sites before the change (verification step 2, git-derived baseline).
- [ ] **AC8** No reason string, no verification rule, and no
      `verifyContainment`/`appendRefuseAlert` body changed (verification step 2,
      grep 4; a7 scenario green).
- [ ] **AC9** A prod app-tree mutation and a catch-up tree mismatch both refuse
      with `remedy: 'reinstall'`, spawn nothing, exit 1, and write an alert whose
      text forbids `sync` (T5, T6). A descriptor drift still refuses with
      `remedy: 'sync'` and today's banner (T7).
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

## Verification steps (run these; paste output in the PR)

Every command is read-only against your machine: no real launchd/systemd/schtasks
entry is created or read, nothing under `~/.wienerdog` is touched, and all
fixtures live under `mktemp`-created directories. **Never run bare `node --test`**
— `tests/run.js` is the only place `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set,
and without it the suite can drive the real scheduler.

**1. The new tests, and the existing ones next to them.**

```bash
node tests/run.js tests/unit/launcher.test.js
```

Expect `fail 0`, and all seven `remedy: …` tests present.
*Red input:* revert D4 on Table S row 9 (drop its `remedy`, restoring the old
shape) — T5 fails, because the banner then carries the sync tail.

**2. The site gates.** Run from the repo root.

```bash
BASE=$(git merge-base HEAD main)
before=$(git show "$BASE:src/scheduler/launcher.js" | grep -c "return { ok: false, reason:")
stale=$(grep -c "return { ok: false, reason:" src/scheduler/launcher.js || true)
after=$(grep -c "return { ok: false, remedy: '\(sync\|reinstall\)', reason:" src/scheduler/launcher.js)
sync=$(grep -c "return { ok: false, remedy: 'sync', reason:" src/scheduler/launcher.js)
echo "baseline=$before stale=$stale conforming=$after sync=$sync"
test "$stale" -eq 0 && test "$after" -eq "$before" && test "$sync" -eq 6 && echo GATE-OK || echo GATE-FAIL
```

Expect `stale=0`, `conforming=$baseline`, `sync=6`, `GATE-OK`. These greps were
executed against a mechanically transformed copy of the current file: baseline
17, conforming 17, sync 6.
*Red inputs, each executed on a scratch copy:* (a) revert one site to the old
shape ⇒ `stale=1`, `conforming=16` ≠ baseline; (b) promote one `reinstall` site
to `sync` ⇒ `sync=7`. Both print `GATE-FAIL`.
*Non-vacuity:* `before` is derived from git, not hardcoded, and is non-zero;
`grep -c` is line-oriented and every site is a single line.

Then confirm no reason string moved (AC8):

```bash
git diff -U0 -- src/scheduler/launcher.js | grep -E "^[+-].*reason:" | grep -v "remedy:" || echo "NO-REASON-DRIFT"
```

Expect `NO-REASON-DRIFT` — every changed `reason:` line is a line that gained a
`remedy:` token. *Red input:* edit any reason string; the diff line prints.

**3. The `sync` banner is byte-identical to today's.**

```bash
node tests/run.js tests/unit/launcher.test.js --test-name-pattern "remedy: refusalText\('sync'\)"
```

Expect 1 pass. *Red input:* change one character of `REMEDY_TAIL.sync`.

**4. The prose gates.**

```bash
grep -n "the fix is one \`wienerdog sync\`" README.md || echo "README-OK"
grep -n "The one remedy is \`wienerdog sync\`" docs/THREAT-MODEL.md || echo "THREATMODEL-OK"
grep -n "For almost every mismatch" docs/runbooks/scheduler-and-executable-integrity.md || echo "RUNBOOK-OK"
grep -c "production/dev stance" docs/runbooks/scheduler-and-executable-integrity.md
grep -cE "npx wienerdog|wienerdog update|npm install -g" docs/runbooks/scheduler-and-executable-integrity.md README.md docs/THREAT-MODEL.md src/scheduler/launcher.js
```

Expect the three `*-OK` markers (each stale claim gone), `1` for the GLOSSARY
link, and — for the last grep — **exactly** these counts, which are the measured
pre-change baseline and must not move:

```text
docs/runbooks/scheduler-and-executable-integrity.md:1
README.md:3
docs/THREAT-MODEL.md:2
src/scheduler/launcher.js:0
```

(The runbook's single hit is its pre-existing "Upgrading Wienerdog" bullet, which
already names `npx wienerdog@latest sync`; it is not yours to touch. README's
three are its install instructions.) AC11 fails if any count goes up.

Executed against the pre-change tree this session, all four commands behave as
the red inputs predict: each of the first three prints its stale line and **no**
`*-OK` marker, and the GLOSSARY-link count is `0`.
*Red inputs:* leave one stale sentence in place (its `grep -n` prints a line and
the `*-OK` marker is absent); or add a recovery command to M1c, M2 or M3 (that
file's count in the last grep goes up).

**5. Nothing else regressed.**

```bash
npm test
```

Expect `fail 0`. Baseline on this branch before the change: `tests 1671, pass
1666, fail 0, skipped 5` — afterwards, seven more passes and the same zero.

**6. The A7 integrity proof still holds.**

```bash
WIENERDOG_RUN_SCENARIOS=1 WIENERDOG_TEST_NO_REAL_SCHEDULER=1 npm run scenarios:a7-integrity
```

Expect `PASS` (executed green on this branch before the change). Its six
`reasonRe` regexes match reason fragments only, so a correct implementation
cannot move them. *Red input:* change any reason string — the corresponding case
fails with a reason mismatch.

**7. Lint.**

```bash
npm run lint
```

Expect green (markdownlint + frontmatter schema).

## Out of scope (do NOT do these)

- **Closing S1 — the `sync` republish itself.** `vendorSelf` calling
  `writeLauncher(paths, {manifest})` with no `sourceRoot`, so `packageRoot()`
  resolves to the writable app tree and republishes `<core>/launcher/launch.js`
  from it, is `WP-stance-authority-containment`'s **Table G row S1**: explicitly
  known-open, out of that WP's scope, routed to the owner. A **sibling work
  package** covers the republish and the structural channel goes to an ADR. This
  WP only stops the product from *instructing* the user into it. Do not touch
  `src/core/vendor.js`.
- **Broadening the `reinstall` class beyond Table S.** Several `sync`-class sites
  are reachable only after the tree has verified, but some `reinstall`-class ones
  (a planted `.git`, a missing descriptor, a containment failure) are also
  reachable by an app-tree write, and a case can be made for reclassifying more.
  Table S's positional rule is the ratified assignment for this WP. Changing it
  needs its own analysis per class; note any argument under "Discovered issues"
  in the PR body and leave the table alone.
- **`docs/adr/0028-scheduler-app-executable-integrity.md`.** Ratified and
  owner-signed. Three of its claims become false —
  §3 *"the single remedy is always `wienerdog sync`"*; Alternatives considered,
  *"A mismatch is fail-closed; `sync` is the one remedy"*; and the "Refuse-surface
  decision" section, *"the refuse text and runbook point there + to `wienerdog
  sync`"*. **Do not edit it**, not even to add a note. Record all three under
  "Discovered issues" in the PR body with the correction they need (each should
  read "…for the mismatch classes where the app tree has already verified"), so
  the owner can amend a ratified surface as the owner's act.
- **`docs/GLOSSARY.md`.** `WP-stance-authority-containment` D6 rewrites its
  **production/dev stance** entry and is this WP's dependency, so that entry is
  already the single user-facing home for what a trusted source is. Adding a
  glossary term for the remedy classes is not warranted — `remedy` is an internal
  field name, not a product noun. Do not edit this file.
- **`src/core/alerts.js`, `src/core/digest.js`.** The alerting mechanism and the
  digest banner are unchanged. The new text is 336 chars against a 2000-char field
  cap (measured); nothing truncates and nothing needs widening.
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

1. All seven verification steps pass locally; output pasted into the PR body,
   including the `GATE-OK` line and the a7 scenario's `PASS`.
2. Conventional commits; PR titled
   `fix(scheduler): choose the refusal remedy from a structured verdict class (WP-refusal-remedy-discriminator)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. "Discovered issues" names ADR-0028's three false claims.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. The PR body states, in one line, that the recovery property and the two
   invocations it ships are **cited** from `WP-stance-authority-containment`
   Table G row 1 / D6 and were not re-derived, re-worded or copied here.
6. The PR body lists the review-only criteria named under "Test index" — AC8,
   AC10, AC11 and the correctness of Table S's six `sync` sites — so the reviewer
   knows which claims no test can make.
