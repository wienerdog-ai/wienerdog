---
id: WP-vault-write-cas-window
title: Pin the vault write's check-to-publish window as a tested residual on both arms, and say why it stays open
status: Ready
model: opus
size: S
depends_on: [WP-dream-vault-write-primitive]
adrs: [ADR-0004, ADR-0031, ADR-0036, ADR-0042]
epic: dream-promotion
---

# WP-vault-write-cas-window: the check-to-publish window stays open on both arms — pin it, test it, say why

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — this is a re-cut.** The stub (filed 2026-09-18) offered three
outcomes: close the create arm with a create-or-fail publish, hold a descriptor
across the overwrite arm's compare, or "re-disclose and close nothing". The
design round first chose the create-or-fail publish (`fs.linkSync`) for the
create arm. Two design-gate rounds then found band-A defects in it twice on the
same contract, and both trace to one platform fact: **portable Node cannot bind
a link's source to the object the call staged.** The pinned stop criterion
therefore took its pre-decided fallback, **candidate 0 on both arms**. Nothing
is closed. The window is disclosed in the same words on both arms, pinned by
tests that go red the day anyone narrows or closes it, and the reason it stays
open is recorded where the next reader will find it.

History and evidence:

- `docs/specs/logbook/2026-09-26-vault-write-cas-window-design-review.md` — §8
  records rounds 1 and 2 and the design question.
- `docs/specs/logbook/2026-09-26-cas-window-platform-facts.md` — the
  researcher's platform memo (the **memo**).

**Size: S.** The change is one optional test seam in `src/core/dream/vault-write.js`,
three comment texts, three tests, three RED proofs and a four-part erratum. No
behaviour changes for any production caller.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process or
outlives its call. The nightly **dream** consolidates recent sessions into the
user's **vault**, builds its changes in a disposable **workspace**, and then
performs **promotion**: it puts what passes the gates into the vault.

**Every vault content write goes through one call — the vault write.**
`writeIntoVault` in `src/core/dream/vault-write.js` (shipped by
`WP-dream-vault-write-primitive`, Done). Three kinds of write go through it:
promoted notes and the dream report (both from `src/core/dream/promote.js`) and
the vault warnings file (`src/core/dream/warnings.js`). Its contract is that
spec's **Table H**. Row **H5**, quoted: *"with `expect` present the write is
abandoned unless the target still holds exactly those bytes; with `expect`
absent it is abandoned unless the target does not exist. Abandonment is a
refusal (H7), never a silent overwrite. **NARROWED, not closed:** a write
landing between the check and the publish is still lost — a residual this row
states rather than hides."* Row **H4**: a reader never sees a partial target.
Row **H7**: a refusal leaves nothing of the call's making, except four counted
cases that it names.

**The two arms.** `expect` omitted is the **create arm** (premise: nothing is at
the target). `expect` present is the **overwrite arm** (premise: the target
still holds these bytes). On both, the shipped code checks the premise, then
publishes with `fs.renameSync(staging, target)`: two syscalls, with nothing
binding them.

**The user's editor writes the vault concurrently** — that is why the
conditional publish exists at all. The memo (§4) measured how editors save.
Obsidian desktop (the product's primary editor; read from the installer 1.12.4
bundle) and VS Code write **in place**. vim (default `backupcopy=auto`),
TextEdit and Syncthing put a **new** file at the name. The cloud sync agents are
UNVERIFIED. A save of either kind that lands inside the window is lost.

**Why neither arm can be closed with portable Node — measured, and the reason
this package re-discloses instead.**

- **Overwrite arm.** No platform offers "replace only if the target is still
  this object", and Node reaches none of the flagged renames that come closest
  (`renameat2`, `renamex_np`, `FileRenameInfo`: no binding, no constant; memo
  §2). Holding a descriptor across the compare (the stub's candidate 1) would
  detect an in-place loss only **after** it happened, and would not see a
  replace-by-rename save at all (memo §5e–f). That is owner item 2.
- **Create arm.** A create-or-fail publish would close the window, but every one
  reachable from Node fails a Table H row:
  - `openSync(…, 'wx')` and `copyFileSync(…, COPYFILE_EXCL)` make the target
    visible empty or partial, which breaks H4 (memo §1–§2).
  - `fs.linkSync(staging, target)` keeps H4 only while the staging name is
    trustworthy. Node has no `linkat` with a descriptor source and no
    `O_TMPFILE`, so the link publishes whatever sits at the staging name. On
    darwin `link(2)` even follows a symlink planted there (measured, round
    record §2), and a vault reader can see the planted object's bytes before any
    check can run.
  - A link publish also has a two-name state (target plus staging name). If the
    staging name then cannot be removed, no current caller has a path that ever
    clears it.

  Those two findings (round record §8, R2-1 and R2-2) are why the create arm
  stays open. The facts that would re-open the question are a Node binding for
  `linkat` from a descriptor, for `O_TMPFILE`, or for a no-replace rename.

**What this package adds.** Three things:

- **A test seam, `beforePublish`**: an optional callback called after every check
  and just before the rename. It exists so tests can put a concurrent write at
  the one instant that matters, instead of patching `fs.renameSync` or
  `fs.readFileSync`.
- **Residual tests on both arms**, which pass today and go red if anyone narrows
  or closes the window, so the disclosures cannot silently go stale.
- **Disclosure texts, in code and in a Done-spec erratum**, that say the same
  thing on both arms and cite the reason above.

**Open questions from the stub, answered.**

1. **Which arm?** Both — the same answer, re-disclosed (Table W rows W1, W2).
2. **New refusal outcomes?** None. The barrier's throw becomes an ordinary
   refusal, with the shipped text and the shipped unwind. The H7 count stays
   four.
3. **Deterministic race test?** At the `beforePublish` barrier (row W3), never
   on `fs.renameSync` or `fs.readFileSync`.
4. **Disclosure sites?** Rewritten where they named one arm only:
   - `vault-write.js` limit B becomes D1;
   - `promote.js:1601-1604` becomes D3;
   - the Done spec gets Erratum 1 (E0–E3).

   `vault-write.js:420-423` and `:448-450` already state "NARROWED, not closed"
   for whatever check comes last, and stay unchanged.
5. **Is R4 still reachable?** Yes, unchanged. Its text stays true and it is not
   edited.

## Current state

Re-derived on `main` at `41c2baf1`. `git log c05a575b..41c2baf1` touches none of
the four files this package edits (`vault-write.js`, `promote.js`,
`tests/unit/dream-vault-write.test.js` and the Done spec). The ranges in the
primitive and the Done spec were checked at both ends at drafting time (round
record §3 and the round-2 re-cut checks in §8). Every range below, the
`promote.js`, `warnings.js` and test-file ranges included, was re-checked at
both ends by the wd-reviewer gate on `3098cdd0` (round record §8).

- `writeIntoVault` is `src/core/dream/vault-write.js:205-479`. `promote.js`
  calls it through the seam variable `writeFile` (`:1123`).
- The shipped sequence:
  - staging at `:386-418`: an exclusive open of a random staging name in the
    target's parent, the bytes written, the descriptor closed;
  - checks at `:420-446`: `lstat` of the target (`:424`); a symlink or
    non-regular target refuses (`:425-430`); the overwrite arm re-reads and
    compares against `expect` (`:431-443`); the create arm refuses if anything
    is there (`:444-446`);
  - publish at `:448-456`: `fs.renameSync(tmp, targetLexical)`.
  - The outer `catch` (`:463-478`) turns a non-`WienerdogError` into a refusal
    and re-throws `WienerdogError`, relying on the ordering invariant written
    at `:467-475` (caller code runs only before the first `mkdir`).
- Disclosure surfaces today:
  - `vault-write.js:48-50` — limit **B**. It speaks of the **compare** only,
    which is the overwrite arm.
  - `vault-write.js:420-423` and `:448-450` — arm-neutral, and true.
  - `promote.js:1601-1604` — speaks of the **re-read** only, which is the
    overwrite arm.
  - `promote.js:1757-1761` (row R4) — describes the detected case, and is true.
  - In the Done spec: the H5 row (`:217`); the Security checklist's residual
    (`:295`); the Out of scope bullet (`:522-523`), which declines the closure
    for the overwrite arm's reason ("a content-conditional replace does not
    exist at this layer") and is silent on the create arm; and the signature
    in its Exact contracts (`:155-199`), which this package's seam extends.
- Callers per arm:
  - `promote.js:1592-1599` gives a new note the create arm;
  - the report's second write (`:1686-1696`) takes the overwrite arm;
  - the report fallback (`:1743-1752`) takes the create arm for R1 and the
    overwrite arm for R2/R3;
  - `warnings.js:284-305` creates the warnings file (`:305`) or overwrites it
    (`:300`).
- **No shipped test puts a write between the check and the publish.** The
  primitive's H5 tests (`tests/unit/dream-vault-write.test.js:409-436`,
  `:438-450`) change the target before the call, and
  `tests/unit/dream-promote.test.js:1187-1202` changes it before the re-read.
  The suite's injection helper is `withPatchedFs`
  (`dream-vault-write.test.js:162-179`).
- Discovered, outside this package: `vault-write.js:6-11` says "exactly two"
  content writers, while `docs/GLOSSARY.md` names three. Routed from the round
  record — **do not edit it here.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/vault-write.js | the `beforePublish` barrier (Table W row W3) and its JSDoc; D1 replaces `:48-50`; D2 is appended to the ordering-invariant comment ending at `:475`; the throws list in the `writeIntoVault` JSDoc (`:201-203`) gains one clause, "a `beforePublish` that is present and is not a function". No other change |
| modify | src/core/dream/promote.js | D3 replaces `:1601-1604`; nothing else |
| modify | tests/unit/dream-vault-write.test.js | new tests `[CAS-1]`–`[CAS-3]`; no existing test changes |
| create | tests/red-proofs/vault-write-cas-window.proofs.json | ADR-0042 declarations P1–P3 whose `suite` is `tests/unit/dream-vault-write.test.js` |
| modify | docs/specs/done/WP-dream-vault-write-primitive.md | Erratum 1: E0–E3, verbatim from Exact contracts; no other byte changes |

Nothing else — in particular not `warnings.js`, `docs/GLOSSARY.md`, or R4.

### Exact contracts

**The signature gains one optional, test-only field.** The `writeIntoVault` JSDoc
(`vault-write.js:175-204`) adds `beforePublish?:()=>void` to the parameter type
and this paragraph to the parameter list; the return shape does not change.

```js
/*   beforePublish  TEST SEAM, never passed by a production caller. Called with
 *            no arguments exactly once on a call that reaches the publish:
 *            after every check this call makes on the target and immediately
 *            before the rename (Table W row W3). Never called on a call that
 *            refuses first. A throw of ANY type from it is a refusal (H7) and
 *            the unwind runs. Present and not a function is a caller-contract
 *            violation and throws, exactly as a missing `admit` does */
```

**Code texts — copy verbatim.**

D1 — `vault-write.js:48-50` becomes:

```text
 *   B. CHECK-TO-PUBLISH WINDOW — BOTH ARMS, NARROWED, NOT CLOSED
 *      (WP-vault-write-cas-window, Table W). The premise check runs immediately
 *      before the rename: on the overwrite arm the compare against `expect`, on
 *      the create arm the check that nothing is at the target. A save landing
 *      between the check and the rename is still lost, whether it writes in
 *      place or replaces the file, and on the create arm a file created there
 *      is overwritten. No portable Node call closes it: none replaces a file
 *      only if it is unchanged, and the create-or-fail publishes either show a
 *      partial file (an exclusive open) or cannot be bound to the staged object
 *      (a link). Tests pin this as a residual.
```

D2 — appended after `vault-write.js:475` (the last line of the ordering-invariant
comment), same indentation:

```text
    // The one other piece of caller code, the `beforePublish` test seam, runs
    // after the chain creation; its call converts any throw, WienerdogError
    // included, into a refusal itself, so nothing it throws reaches here.
```

D3 — `promote.js:1601-1604` becomes:

```text
      // The compare→promote window is NARROWED, not closed, on both arms (the
      // primitive's limit B, WP-vault-write-cas-window): a vault change visible
      // at the primitive's last check abandons the write and the path is
      // refused, and a save landing between that check and the `rename` — an
      // existing note edited, or a new note's path created — is the
      // primitive's stated residual, inherited here unchanged.
```

**Erratum 1 to `docs/specs/done/WP-dream-vault-write-primitive.md` — copy
verbatim.** `<DATE>` is the `YYYY-MM-DD` date of the implementation commit that
adds it. E0 is a new section between the `**Dispatch precondition.**` paragraph
(ending at `:38`) and `## Context`. E1–E3 are appended in place, each carrying
its marker `(Erratum 1, E<n>)` exactly once.

E0:

```text
## Erratum 1 (<DATE>) — why the compare→publish window stays open on both arms

**Filed by `WP-vault-write-cas-window`, whose Table W is canonical for
everything this erratum restates.** That package tried to close the create
arm's window with a create-or-fail publish. After two design-gate rounds it
kept the shipped rename on both arms. It adds a test seam, `beforePublish`, and
tests that pin the window as a residual on each arm. Three surfaces in this file
are amended in place, each carrying its marker. No row of Table H changes its
guarantee, and the H7 criterion's count stays four.
```

E1 — at the end of the H5 row's third cell (`:217`, after `rather than hides`),
append:

```text
 — on **both** arms (Erratum 1, E1): on the create arm, a file created at the target between the existence check and the publish is overwritten, and no portable publish closes that without breaking H4 or binding the target to an unchecked object (`WP-vault-write-cas-window` Table W)
```

E2 — at the end of the Out of scope bullet ending `does not exist at this layer.`
(`:523`), append:

```text
  (Erratum 1, E2) `WP-vault-write-cas-window` also measured the create arm. A `link(2)` publish would close its window, but portable Node cannot bind the link to the staged object, and an exclusive-create publish shows a partial file — so that arm stays open too.
```

E3 — insert after the Exact contracts code block (after its closing fence at
`:199`), preceded by one blank line:

```text
(Erratum 1, E3) `writeIntoVault` also accepts `beforePublish?: () => void`, a test seam added by `WP-vault-write-cas-window`. It is called once, after every check and immediately before the publish. A throw from it is a refusal, and no production caller passes it.
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 trigger fires on two of seven:

- **(i)** the primitive's signature gains `beforePublish`;
- **(vii)** the window's facts appear in D1, D3, E0–E2, the acceptance criteria
  and the text checker.

Nothing else fires. There is no new outcome taxonomy, no fallback or precedence
change, and consumers inherit nothing new. One canonical table follows.

### Contract table(s)

#### Table W — the window, per arm, and the barrier (canonical)

| # | Subject | Check, then publish (shipped, unchanged) | What is lost inside the window | Why it is not closed | Stated at (move together) |
|---|---|---|---|---|---|
| W1 | **Create arm** (`expect` omitted), every platform | `lstat` at `:424`, "already exists" refusal at `:444-446`, then `fs.renameSync` at `:452` | a file created at the target between the check and the rename is overwritten by the rename and is not recoverable from anything the call produced | a create-or-fail publish reachable from Node either shows a partial target (`'wx'`, `COPYFILE_EXCL`: memo §1–§2) or, as `fs.linkSync`, cannot be bound to the staged object and, when its staging name cannot be removed, leaves a second name no current caller ever clears (round record §8, R2-1 and R2-2; darwin symlink-following measured, round record §2). Re-open only with a Node binding for `linkat` from a descriptor, `O_TMPFILE`, or a no-replace rename. Retaining a link publish anyway is owner item 1 | D1, D3; Done spec E0, E1, E2 |
| W2 | **Overwrite arm** (`expect` present), every platform | re-read and compare at `:431-443`, then `fs.renameSync` at `:452` | a save landing between the compare and the rename is lost, whether the writer saves in place (Obsidian desktop, VS Code) or replaces the file (vim's default, TextEdit, Syncthing) — memo §4 | no platform exposes, and Node reaches none of, a "replace only if unchanged" rename (memo §2). A held descriptor detects an in-place loss only afterwards (memo §5e–f) — owner item 2 | D1, D3; Done spec E0, E1 |
| W3 | **The barrier** `o.beforePublish`, both arms | — | — | Called with no arguments exactly once per call that reaches the rename: **after** every check the call makes on the target, **immediately before** the rename. Not called on a call that refuses first. Its return value is ignored. A throw of **any** type, `WienerdogError` included, is a refusal with the shipped text `` `the write failed unexpectedly (<code or message>)` ``, and the shipped unwind runs. Present and not a function throws a caller-contract `WienerdogError` before the vault is touched. No production caller passes it | the `beforePublish` JSDoc; D2; Done spec E3 |

### Mirrored Surface Checklist

A finding updates the table **and every mirror below in the same commit**; a new
mirror found in review is registered here on the spot.

- [ ] **Deliverables cells** — the `vault-write.js` cell names W3, D1 and D2;
      the `promote.js` cell names D3; the test cell names `[CAS-1]`–`[CAS-3]`;
      the proofs cell names P1–P3; the Done-spec cell names E0–E3.
- [ ] **Exact contracts** — the JSDoc and D2 mirror W3; **D1 and D3 mirror W1
      and W2** (both arms, narrowed not closed, and why); **E0 and E1 mirror
      W1–W2; E2 mirrors W1**; E3 mirrors W3.
- [ ] **Code mirrors kept true, not edited** — `vault-write.js:420-423` and
      `:448-450` (arm-neutral "NARROWED, not closed" and "the rename is the
      publish") and `promote.js:1757-1761` (R4).
- [ ] **Done-spec mirrors kept true, not edited** — the H5 criterion
      (`:376-379`), the Security checklist's `:295`, the Mirrored Surface
      Checklist's "no surface may call the window closed" (`:248-256`), and the
      H7 criterion's count of four (`:429-455`).
- [ ] **Acceptance criteria** — AC1 (W1), AC2 (W2), AC3 (W3), AC4 (D1–D3),
      AC5 (E0–E3).
- [ ] **Verification** — the text checker, the one-hunk check on `promote.js`,
      the production-caller check, the RED lane.
- [ ] **RED proofs** — P1 (W1), P2 (W2), P3 (W3).
- [ ] **Operative prose** — the package note, the Context's "why neither arm can
      be closed" and "open questions, answered", the Security checklist, the
      owner items, and Out of scope.

## Implementation notes & constraints

- **No new dependency, no TypeScript, no build step** (CLAUDE.md). No behaviour
  changes for a caller that does not pass `beforePublish`: every existing test
  passes unchanged.
- **Where the barrier goes:** after the create-arm check at `:444-446` and before
  the rename at `:451-452` — one call site serves both arms. Wrap it locally so
  that a throw of any type becomes a refusal through `refuse()`. The outer
  `catch` re-throws `WienerdogError` (`:476`), and D2 says why the seam does not
  reach it.
- **Validate it with the other arguments** (`:207-221`): present and not a
  function → `WienerdogError`, before anything touches the vault.
- **The residual tests assert the loss, not a guarantee.** Each test's comment
  says so, and says that when it fails because someone narrowed or closed the
  window, W1 or W2 and every surface in its "Stated at" cell must move in the
  same commit. That is how the disclosures stay true: a test that pins the
  residual forces the text change.
- **The race tests anchor on the barrier only** — never on `fs.renameSync` or
  `fs.readFileSync`.
- **RED proofs** (ADR-0042; one mutation per row, ADR-0036 A3; markers
  `RP_MUT_CAS_P<n>`; `testNamePattern` `\[CAS-`). The `expectRed` sets are
  **DERIVED**: the code does not exist yet. The implementer writes each exact
  `find`/`replace`, runs `npm run red-proofs -- --wp WP-vault-write-cas-window`,
  and corrects each set to what it observes. A correction may falsify this table
  and the RED clauses of AC1–AC3.
- **The declaration file's shape** (inert JSON, validated by the runner and never
  executed):
  - a top-level `suite` (`tests/unit/dream-vault-write.test.js`);
  - a `proofs` array. Each entry has `id` (a kebab slug), `wp`
    (`WP-vault-write-cas-window`), `criterion`, `why`, `file`, `find`,
    `replace` (containing `marker`), `marker`, an optional `occurrences`,
    `testNamePattern`, and `expectRed`: an array of
    `{ "test": [<the full test name>], "signal": <a substring of the failing
    assertion's message> }`.
  - `criterion` takes the form `"AC1"`–`"AC3"`, as
    `tests/red-proofs/primary-dialogue.proofs.json` does (some older files use
    `"2"`).
  - A shape exemplar: `tests/red-proofs/dream-git-env-pinning.proofs.json`.

| Id | Criterion | The one mutation | `expectRed` (DERIVED) | Signal in the failing assertion's message |
|---|---|---|---|---|
| P1 `cas-create-arm-recheck-after-barrier` | AC1 | after the barrier, **on the create arm only** (`!conditional`), a second `lstat` of the target that refuses if anything is there. Scoped so the overwrite-arm publishes in `[CAS-2]` and `[CAS-3]` are untouched | `[CAS-1]` | `CAS-1 residual: the concurrent create is overwritten` |
| P2 `cas-overwrite-recompare-after-barrier` | AC2 | after the barrier, a second compare of the target against `expect` that refuses on mismatch | `[CAS-2]` | `CAS-2 residual: the in-place save is overwritten` |
| P3 `cas-barrier-throw-escapes` | AC3 | the barrier's call is no longer wrapped, so a `WienerdogError` it throws escapes past the unwind. `[CAS-3]` must make that an ASSERTION failure: the runner accepts a red only when its code is `ERR_ASSERTION` (`scripts/red-proofs.js:1655-1656`). So each barrier-throw call is wrapped as `try { … } catch (e) { assert.fail('CAS-3 a throw from the barrier is a refusal: ' + (e && e.message)) }` | `[CAS-3]` | `CAS-3 a throw from the barrier is a refusal` |

- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] `rel` validation, the symlink refusal and `admit` on the resolved path are
      untouched (Table H rows H1–H3); the publish is the shipped rename.
- [ ] `beforePublish` is a test seam: no file under `src/` other than
      `vault-write.js` names it (verification step). A throw from it cannot
      escape past the unwind (W3).
- [ ] Named residual, canonical in W1 and W2: the window is open on both arms,
      and a concurrent save or create inside it is lost.

## Acceptance criteria

- [ ] **AC1 — the create arm's window is pinned AS A RESIDUAL (W1).** `[CAS-1]`:
      a create-arm write into an existing parent. Inside `beforePublish` a
      concurrent file is created at the target. The call returns
      `written:true`, and the target holds the call's bytes — the concurrent
      file is gone. The test's name says RESIDUAL. **RED:** P1.
- [ ] **AC2 — the overwrite arm's window is pinned AS A RESIDUAL (W2).**
      `[CAS-2]`: an overwrite-arm write whose `expect` matches. Inside
      `beforePublish`, one case saves the target in place and another replaces
      it by rename. In both cases the call returns `written:true` and the target
      holds the call's bytes. **RED:** P2.
- [ ] **AC3 — the barrier contract (W3).** `[CAS-3]`, with RED proof P3:
  - it is called exactly once on a publishing call on each arm;
  - it is not called on a policy refusal, an `expect` mismatch or a create-arm
    "already exists" refusal;
  - a throw from it — a plain `Error`, and a `WienerdogError` — returns a
    refusal with W3's text, and the vault is byte-identical to its pre-call
    state, including a parent chain the call had created;
  - a non-function `beforePublish` throws `WienerdogError`;
  - each barrier-throw call is wrapped so an escaping throw fails an assertion
    carrying P3's signal (see the P3 row).
- [ ] **AC4 — the code texts are D1–D3 verbatim.** The shipped limit-B sentence
      and the shipped `promote.js:1601` sentence are gone, and `promote.js`
      changes in exactly one hunk (verification steps).
- [ ] **AC5 — Erratum 1 is in the Done spec verbatim**: E0 with a real date, and
      E1–E3 each present with its marker exactly once (verification steps).
- [ ] **AC6 —** `npm test` and `npm run lint` pass, and
      `npm run red-proofs -- --wp WP-vault-write-cas-window` reports every
      declared criterion (AC1–AC3) `PROVEN`.
- [ ] Idempotence: `N/A — a vault write is not a repeatable command; Table H's
      expect-guard is what the Done spec ships in its place, and this package
      adds no command and no state.`

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern matching zero tests exits 0, so the three test names are
# checked for BEFORE the pattern run (absent → red).
test -f tests/red-proofs/vault-write-cas-window.proofs.json
bash -c 'for n in 1 2 3; do grep -q "dream-vault-write: \[CAS-$n\]" tests/unit/dream-vault-write.test.js || { echo "MISSING [CAS-$n]"; exit 1; }; done; echo "CAS-1..3 present"'
npm test -- --test-name-pattern "\[CAS-" tests/unit/dream-vault-write.test.js
npm test
npm run lint
npm run red-proofs -- --wp WP-vault-write-cas-window

# AC4 and AC5: every D and E block verbatim, every replaced sentence gone,
# every marker exactly once. The checker reads the blocks from THIS spec. It is
# the architect's: if it is wrong, report that in the PR — never edit it.
node docs/specs/logbook/2026-09-26-vault-write-cas-window-text-check.js

# AC4: promote.js changes in exactly one hunk. The expected value was measured
# with git diff -U0 on a tree built from D3 (round record §8).
test "$(git diff -U0 "$(git merge-base HEAD main)" -- src/core/dream/promote.js | grep -o '^@@ -[0-9]*,[0-9]*' | tr '\n' ' ')" = "@@ -1601,4 " && echo "promote.js: exactly the one prescribed hunk"

# W3: the barrier exists and no production file passes it.
grep -q "beforePublish" src/core/dream/vault-write.js
test -z "$(grep -rln "beforePublish" src/ | grep -v '^src/core/dream/vault-write.js$')" && echo "no production caller"
git diff --check
```

- `npm test`, `npm run lint` and `git diff --check` are the repository's
  standing gates: paste their green. Every other step is NEW. Each must be
  observed **green** on the finished tree and **red** on a deliberately broken
  one, with both outputs pasted:
  - the checker and the hunk check: red with the deliverable absent, and red
    with one block reverted;
  - AC1–AC3: the RED lane's own red.

## Out of scope (do NOT do these)

- **Any publish other than the shipped rename** — `fs.linkSync`, `'wx'`,
  `COPYFILE_EXCL`, a platform branch, a fallback code list. Rejected, with the
  measured reason in W1. Retaining a link publish is owner item 1.
- **Candidate 1 for the overwrite arm** (detect an in-place loss through a held
  descriptor and recover the bytes). A package of its own (owner item 2).
- **Crash durability (`fsync`)**, the component-swap and unwind-identity
  residuals (`vault-write.js:40-47` limit A and `:51-57` limit C), and the
  stale "exactly two" writer count at `:6-11`.
- **Anything that starts a process, takes a lock daemon or watches the vault**
  (ADR-0004).

## Dispatch precondition — owner items

**Citations.** Written against `main` at `41c2baf1`. Before dispatch, re-run every
`file:line` citation, checked at both ends
(`docs/runbooks/codex-review.md`, "Dispatch-time re-verification"). A citation
that does not resolve blocks the dispatch.

**Owner items** — each a recommendation with the cost of overruling it. None is
ratified by this document. **They gate DISPATCH, not `Ready`** (repo precedent:
specs "Ready and parked on an owner ruling recorded in its Dispatch
precondition"). Item 1 must be ruled before an implementer is dispatched. An
overrule of item 1 **replaces** this package with a new one; it does not refine
this one.

1. **Keep the re-cut: no link publish on the create arm.** *Recommendation:*
   accept. This is the reversible alternative the design gate named as the
   owner's call, not the architect's. *Cost of overruling* (retaining a
   `fs.linkSync` create-arm publish with its residuals accepted) — the two
   round-2 findings, in substance:
   - **(a)** On darwin, a symlink substituted at the staging name makes the link
     create a regular vault file that is a second name for the symlink's target.
     Any vault reader can see those foreign bytes before a check can run, so the
     H4 claim — a reader sees nothing or the approved payload — is false on that
     path. After the check, that second name stays in the vault until the user
     acts.
   - **(b)** If removing the staging name fails after the link, a second vault
     name holding the payload persists. The warnings caller's promised retry
     reads the now-correct target, does nothing, and never removes it.
     Promotion keeps the path out of the commit while both names remain.

   Doing it properly would add:
   - a typed partial-publish outcome and a durable cleanup in `promote.js`,
     `warnings.js` and the dream report (an M package at least);
   - the design's own extra surface: an `ENOTSUP`/`EPERM` fallback for vaults
     without hard links (FAT32/exFAT measured), a win32 rename branch (nothing
     measured there), and a post-link identity check.

   All of that buys a closed create-arm window where hard links exist — a
   window a few syscalls wide, on the arm whose loss is a same-named file
   created in those microseconds.
2. **Candidate 1 for the overwrite arm stays unbuilt for now.**
   *Recommendation:* accept, and commission it as a successor only if a real
   loss is ever reported. *Cost of overruling:* Obsidian desktop saves in place
   (memo §4), so a held descriptor would detect a lost Obsidian save and could
   recover its bytes — but only after the loss. It needs a "published, but
   displaced a concurrent save" outcome in every caller and in the dream report,
   does nothing for vim, TextEdit or Syncthing, and on win32 holding the
   descriptor may itself make the rename fail (UNVERIFIED). That is an M package
   at least.

## Definition of done

1. All verification steps pass locally, green and the deliberately broken red;
   output pasted into the PR body.
2. Conventional commits; PR titled
   `test(dream): pin the vault write's check-to-publish window on both arms (WP-vault-write-cas-window)`.
3. PR template filled, including "Decisions made" (or "none"), the corrected
   `expectRed` sets, and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
