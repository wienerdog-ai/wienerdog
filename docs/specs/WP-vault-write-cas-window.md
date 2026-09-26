---
id: WP-vault-write-cas-window
title: Close the vault write's check-to-publish window on the create arm and re-disclose it on the overwrite arm
status: Draft
model: opus
size: M
depends_on: [WP-dream-vault-write-primitive]
adrs: [ADR-0004, ADR-0031, ADR-0036, ADR-0042]
epic: dream-promotion
---

# WP-vault-write-cas-window: publish a new note by create-or-fail; say plainly where the window stays open

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note.** This file was a backlog stub (filed 2026-09-18, no design
round). It is now a design: the decision per arm is taken, the contract lives in
Tables K and X, and the stub's five open questions are answered where each
answer lives (see "Open questions, answered" at the end of the Context). The
platform facts the decision rests on were produced by the researcher and are
committed as `docs/specs/logbook/2026-09-26-cas-window-platform-facts.md` (the
**memo**; its two measurement scripts sit beside it). Every platform claim below
cites the memo's section, or a measurement this design round added and recorded
in `docs/specs/logbook/2026-09-26-vault-write-cas-window-design-review.md` §2.
**Nothing the memo marks UNVERIFIED is used as a claim here** — each such fact is
an owner item or a named residual.

**Size: M, re-derived.** It is not S: the stub's own condition for S was "the
create arm alone, with a one-call substitution and **no new outcome rows**", and
this design adds outcome rows (Table X rows X1, X2, X4 and X5), a fallback
accept-list, an explicit platform branch and a test seam. It is not L: one
function changes in `src/`, plus one comment in a second file. Every
deliverable, the disclosure texts and the Done-spec erratum included, has a
literal verification command below. It is **not split**. The disclosure texts
and the erratum must land in the same commit as the behaviour they describe
(ADR-0031: no commit in which a canonical fact and its mirror disagree), and the
barrier has no consumer other than the race tests. A split would edit the same
four comments and the same Done-spec cells twice.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process or
outlives its call; no daemon, no lock service, no watcher. The nightly **dream**
consolidates recent sessions into the user's **vault** (their markdown memory).
It builds its changes in a disposable **workspace** and then performs
**promotion**: it puts what passes the gates into the vault.

**Every vault content write goes through one call — the vault write.**
`writeIntoVault` in `src/core/dream/vault-write.js` (shipped by
`WP-dream-vault-write-primitive`, Done) is the only way this family writes a
vault content file. Three kinds of write go through it: promoted notes and the
dream report (both from `src/core/dream/promote.js`), and the vault warnings
file (`src/core/dream/warnings.js`). Its contract is that spec's **Table H**; the
rows this package touches, quoted or summarized:

- **H4** — *"a reader looking at the target at any instant sees either its
  previous content or the complete new content, never a prefix. **The mechanism
  is the implementer's**."*
- **H5** — *"with `expect` present the write is abandoned unless the target still
  holds exactly those bytes; with `expect` absent it is abandoned unless the
  target does not exist. Abandonment is a refusal (H7), never a silent
  overwrite. **NARROWED, not closed:** a write landing between the check and the
  publish is still lost …"*
- **H7** — every failure returns `{written:false, reason}`; nothing of the call's
  making survives a refusal, except bounded cases the refusal reason NAMES (four,
  counted by that spec's H7 acceptance criterion).
- **H9** — missing parent directories are created by the call, and a refusal
  removes the ones it created that are still empty.

So the vault write has **two arms**, told apart by `expect`: the **create arm**
(`expect` omitted — premise "the target does not exist") and the **overwrite
arm** (`expect` present — premise "the target still holds these bytes"). Today
both arms check their premise and then publish by `fs.renameSync(staging,
target)`: check-then-act, two syscalls, nothing binding them. A save that lands
between them is overwritten and not recoverable from anything the call produced.

**The user's editor is a live vault writer throughout** — that is why the
conditional publish exists at all. The memo (§4) measured how the editors in
question save: **Obsidian desktop** (the product's primary editor; read from
the installer 1.12.4 bundle — the auto-updated copy was not inspected) and
**VS Code** write **in place** (truncate, then write, same file object);
**vim** (default `backupcopy=auto`), **TextEdit** and **Syncthing** put a
**new** file object at the name. iCloud Drive, Dropbox,
OneDrive and Google Drive are UNVERIFIED. A real vault has both kinds of writer.

**What portable Node can do (memo §1–§3, §5).** `fs.linkSync(a, b)` is `link(2)`
on darwin/linux: it creates `b` as a second name for `a`'s file object, and fails
`EEXIST` if **anything** is at `b` — in **one** syscall, so check and act are the
same act. Measured: a regular file (APFS, HFS+) and a dangling symlink (APFS) in
memo §5, a directory and a live symlink (APFS) in the round record §2. The new
name points at an object whose bytes were all written before the call, so H4
holds. It is **not available everywhere**: on FAT32 and
exFAT it fails `ENOTSUP` (measured on darwin), linux documents `EPERM` for a
filesystem without hard links, and on win32 it is NTFS-only by Microsoft's own
documentation with the non-NTFS error code UNVERIFIED. **No platform offers, and
Node reaches none of, a "replace only if the target is still this object"
call**: `renameat2(RENAME_NOREPLACE|RENAME_EXCHANGE)`, `renamex_np(RENAME_EXCL|
RENAME_SWAP)` and `FileRenameInfo` have no binding and no constant in `fs`
(measured). `fs.openSync(path, 'wx')` is create-or-fail everywhere but creates an
**empty** file and then writes it, which breaks H4.

**The decision, per arm (Table K is canonical).**

- **Create arm: CLOSED where a hard link can be made.** Off win32, the publish
  becomes `fs.linkSync(staging, target)` followed by removing the staging name.
  On a filesystem without hard links (the link fails `ENOTSUP` or `EPERM`) the
  call falls back to the shipped rename, and on win32 it never tries the link;
  in both places the shipped narrowed window remains and is disclosed.
- **Overwrite arm: re-disclosed, nothing closed (the stub's candidate 0).** No
  portable call closes it. Holding a descriptor across the compare (the stub's
  candidate 1) would not prevent a single loss: against an in-place writer it
  can only detect the loss afterwards, and against a replace-by-rename writer it
  sees nothing (memo §5e–f). Turning that detection into recovery needs a new
  outcome in every caller, and that belongs in a package of its own (owner
  item 3).
- **A test barrier, `beforePublish`.** One optional callback, called after every
  check and just before the publish. It exists so the race tests can inject the
  concurrent write at a point every implementation has, instead of patching a
  filesystem call the design is free to remove (Table K row K5).

### Open questions, answered

1. **Which arm is the subject?** Both, with different answers: Table K rows
   K1–K3 (create) and K4 (overwrite).
2. **What does the closed form do when it refuses?** Table X, whose rows are
   members of H7's refusal taxonomy. The Done spec's H7 row cites Table X
   (Erratum 1, E2). H9's unwind is unchanged on every refusal row, and the H7
   criterion's count stays at **four**.
3. **How is the race tested deterministically?** At the `beforePublish` barrier
   (Table K row K5). The race tests (`[CAS-1]`, `[CAS-2]`) never patch
   `fs.renameSync`, `fs.readFileSync` or `fs.linkSync` (Implementation notes).
4. **Do the disclosure sites retire or get rewritten?** Rewritten, in the same
   commit as the behaviour change: four code texts (Exact contracts D1–D4)
   and six Done-spec surfaces (Erratum 1, E1–E6). `promote.js`'s row R4 text is **not** edited,
   because it stays true (next item).
5. **Is `promote.js`'s R4 still reachable?** Yes, on both arms. On the create
   arm (R1, no report for the date), a report that appears between
   `readVaultNow` and the publish now refuses with `EEXIST` (Table X row X1)
   instead of the pre-check. On the overwrite arm (R2/R3), a compare mismatch
   refuses as today. R4 keeps its reason. Nothing retires.

## Current state

Re-derived on `main` at `41c2baf1`. `git log c05a575b..41c2baf1` touches none of
`src/core/dream/vault-write.js`, `src/core/dream/promote.js` or
`docs/specs/done/WP-dream-vault-write-primitive.md`, so the stub's line numbers
still resolve. Every range below was checked at both ends
(`docs/specs/logbook/2026-09-26-vault-write-cas-window-design-review.md` §3).

- **The function is `writeIntoVault`** (`src/core/dream/vault-write.js:205-479`).
  The stub called it `writeFile`, which is `promote.js`'s seam variable for it
  (`promote.js:1123`, documented as "a JS-only injection point, never an env one"
  at `:965-966`).
- **The shipped publish sequence** (`vault-write.js`):
  - staging at `:386-418`: `openSync(candidate, O_WRONLY|O_CREAT|O_EXCL[|O_NOFOLLOW])`
    on `.wienerdog-vault-write.<16 hex>.tmp` in the target's parent, a
    `writeSync` loop, `closeSync`. No `fsync` anywhere in the file (memo §0).
  - premise checks at `:420-446`: `lstatOrNull(targetLexical)` (`:424`); a
    symlink or non-regular target refuses (`:425-430`); the overwrite arm
    `readFileSync` + `Buffer.compare` against `expect` (`:431-443`); the create
    arm refuses if anything was there (`:444-446`, reason
    `` `${resolvedRel} already exists and this write asserted it would not` ``).
  - publish at `:448-456`: `fs.renameSync(tmp, targetLexical)`; failure reason
    `` `${resolvedRel} could not be published (<code>)` ``; then `tmp = null`.
  - `refuse()` at `:265-303` removes the staging object, then every directory the
    call created that is still empty, and names whatever it could not remove. The
    outer `catch` (`:463-478`) turns any non-`WienerdogError` into a refusal and
    re-throws `WienerdogError`, relying on the ordering invariant written there
    (caller code runs only before the first `mkdir`).
- **Where the window is disclosed today** — more surfaces than the stub's three
  sites:
  - `vault-write.js:48-50` — header limit **B**, `CHECK-TO-PUBLISH WINDOW`,
    "Narrowed, not closed."
  - `vault-write.js:420-423` — the section comment "The window between them and
    the rename is NARROWED, not closed (residual B)." **Missed by the stub.**
  - `vault-write.js:448-450` — "The rename is the publish. A reader of the target
    sees the previous content or the complete new content, never a prefix"
    (becomes false for the create arm). **Missed by the stub.**
  - `promote.js:1601-1604` — "The compare→promote window is NARROWED, not
    closed … a save landing between the re-read and the `rename` is the
    primitive's stated residual, inherited here unchanged."
  - `promote.js:1757-1761` — row **R4**, which describes the **detected** case
    ("the file mutated between the read and the publish, or the primitive refused
    for any other reason. The vault object is left untouched"). It does not
    state the residual, and it stays true under this design. It is a registered
    mirror that is **not edited**.
  - Done spec `docs/specs/done/WP-dream-vault-write-primitive.md`: the H5 row
    (`:217`); the Security checklist's named residual (`:295`, which the stub
    mislabelled as "its acceptance checklist line"); and the Mirrored Surface
    Checklist's prohibition "No surface may call the compare→publish window
    'closed'" (`:248-256`). Its "Out of scope" (`:522-523`) declines the closure.
    The H5 **acceptance criterion** (`:376-379`) states no residual and stays
    true.
- **The callers, per arm.** `promote.js:1592-1599` sets `expect` only when the
  decision carries bytes, so a new note takes the create arm. The report's
  second write (`:1686-1696`, Table Y) always takes the overwrite arm. The
  report fallback (`:1743-1752`) takes the create arm for R1 and the overwrite
  arm for R2/R3. `warnings.js:284-305` creates the warnings file (`:305`) or
  overwrites it (`:300`).
- **No shipped test injects a write between the check and the publish.** The
  primitive's H5 tests (`tests/unit/dream-vault-write.test.js:409-436`,
  `:438-450`) change the target before the call starts, and
  `tests/unit/dream-promote.test.js:1187-1202` changes it before the primitive's
  re-read. The suite's injection helper is `withPatchedFs`
  (`dream-vault-write.test.js:162-179`).
- **One shipped test is anchored on the create arm's rename.** The H6 test
  "a target mutated IMMEDIATELY AFTER the publish …"
  (`dream-vault-write.test.js:474-512`) makes a **create-arm** write
  (`:500`, no `expect`), injects its concurrent write by patching
  `fs.renameSync`, and asserts that the patch fired ("the publish did not go
  through fs.renameSync", `:508`). Under K1 the create arm no longer renames, so
  this test fails as written. It is the one existing test this package edits:
  it moves to the overwrite arm (Deliverables), where the rename remains the
  publish on every platform, and its H6 subject does not depend on the arm.
- **Discovered, outside this package:** `vault-write.js:6-11` says the family
  owns "exactly two" content writers, while `docs/GLOSSARY.md`'s **vault write**
  entry names three (it includes the warnings file). It is not a window claim.
  Recorded in the round record for routing; **do not edit it here.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/vault-write.js | Table K rows K1–K5 and Table X rows X1–X5; disclosure texts D1–D3 replace `:48-50`, `:420-423`, `:448-450`; the `beforePublish` JSDoc; one added sentence in the ordering-invariant comment (`:467-475`) |
| modify | src/core/dream/promote.js | disclosure text D4 replaces `:1601-1604` and nothing else: no behaviour change, R4 (`:1757-1761`) untouched |
| modify | tests/unit/dream-vault-write.test.js | new tests `[CAS-1]`–`[CAS-7]` (Acceptance criteria). One existing test changes, and only this much: the H6 "IMMEDIATELY AFTER the publish" test (`:474-512`) seeds the target and passes `expect`, so its `fs.renameSync` patch still sits on the publish (Current state) |
| create | tests/red-proofs/vault-write-cas-window.proofs.json | ADR-0042 declarations P1–P5 whose `suite` is `tests/unit/dream-vault-write.test.js` |
| modify | docs/specs/done/WP-dream-vault-write-primitive.md | dated Erratum 1: section E0 plus in-place amendments E1–E6, verbatim from Exact contracts |

Nothing else. In particular, **`src/core/dream/warnings.js` and
`docs/GLOSSARY.md` are not touched**. The warnings file takes the new create arm
through the unchanged call, and the glossary's **vault write** entry states no
window claim.

### Exact contracts

**The signature gains one optional, test-only field.** The JSDoc for
`writeIntoVault` adds this line to the parameter type and this paragraph to the
parameter list; nothing else in the signature or the return shape changes.

```js
/** @param {{vaultDir:string, rel:string, bytes:Buffer,
 *          admit:(resolvedRel:string)=>string|null,
 *          expect?:Buffer, beforePublish?:()=>void}} o
 *   beforePublish  TEST SEAM, never passed by a production caller. Called with
 *            no arguments exactly once on a call that reaches the publish:
 *            after every check this call makes on the target and immediately
 *            before the publishing act (Table K row K5). Never called on a call
 *            that refuses first. A throw of ANY type from it is a refusal (H7)
 *            and the unwind runs. Present and not a function is a
 *            caller-contract violation and throws, exactly as a missing `admit`
 *            does */
```

**The fallback code set** is one module-level constant with exactly these two
members, and a comment that cites the measurement (memo §1, §5):

```js
const LINK_UNSUPPORTED_CODES = new Set(['ENOTSUP', 'EPERM']);
```

**Disclosure texts — copy verbatim.** Each replaces the lines named in the
Deliverables table, keeping the file's comment style.

D1 — `vault-write.js:48-50` becomes:

```text
 *   B. CHECK-TO-PUBLISH WINDOW — PER ARM (WP-vault-write-cas-window, Table K).
 *      CREATE ARM (`expect` omitted), off win32, on a filesystem with hard
 *      links: CLOSED. The publish is a link from the staging object to the
 *      target, which fails if anything at all is at the name, so the check and
 *      the publish are one act. OVERWRITE ARM (`expect` present), everywhere:
 *      NARROWED, not closed. The compare runs immediately before the rename,
 *      and a save landing between them, in place or by replacing the file, is
 *      still lost; no portable Node call replaces a file only if it is
 *      unchanged. The create arm keeps the same narrowed window on win32,
 *      where it publishes by rename, and on a filesystem without hard links
 *      (the link fails ENOTSUP or EPERM), where it falls back to the rename.
```

D2 — `vault-write.js:420-423` becomes:

```text
    // ── The conditional publish ─────────────────────────────────────────────
    // The last checks before the publish, in this order and as close to it as
    // this layer can put them. On the create arm off win32 the publish itself
    // re-asserts the premise in the same act (the link fails if anything is at
    // the name). On the overwrite arm, and wherever the create arm publishes
    // by rename, the window between these checks and the publish is NARROWED,
    // not closed (residual B).
```

D3 — `vault-write.js:448-450` becomes:

```text
    // The publish, per arm (Table K). CREATE ARM off win32: link the staging
    // object to the target, then remove the staging name. A reader of the
    // target sees nothing or the complete new content, never a prefix: every
    // byte was written and the staging descriptor closed before the name ever
    // points at them. OVERWRITE ARM, and the create arm wherever it publishes
    // by rename: a reader sees the previous or the complete new content.
```

D4 — `promote.js:1601-1604` becomes:

```text
      // The compare→promote window depends on the arm (the primitive's Table K,
      // WP-vault-write-cas-window). A NEW note is published by a create that
      // fails if anything is already at the path, so a save that got there
      // first is kept and the path is refused: closed, except on win32 and on
      // a filesystem without hard links, where the narrowed window below
      // applies. A CHANGED note's window is NARROWED, not closed: a vault
      // change visible at the re-read abandons the write and the path is
      // refused, and a save landing between the re-read and the `rename` is
      // the primitive's stated residual, inherited here unchanged.
```

**Erratum 1 to `docs/specs/done/WP-dream-vault-write-primitive.md` — copy
verbatim.** `<DATE>` is the `YYYY-MM-DD` date of the implementation commit that
adds it. E0 is a new section inserted between the `**Dispatch precondition.**`
paragraph (ending at `:38`) and `## Context`. E1–E6 are in-place edits, each
carrying its own marker `(Erratum 1, E<n>)`. No other byte of that file changes.

E0:

```text
## Erratum 1 (<DATE>) — the create arm's window is closed where hard links exist

**Filed by `WP-vault-write-cas-window`, whose Tables K and X are canonical for
everything this erratum restates.** That package publishes the create arm
(`expect` omitted) by a link from the staging object to the target, which fails
if anything is at the name, so on that arm the check and the publish are one
act. It keeps the shipped rename, and the narrowed window, on the overwrite arm
everywhere, and on the create arm on win32 and on a filesystem without hard
links. Six surfaces in this file are amended in place, each carrying its marker. The
H5 acceptance criterion and the H7 criterion's count of four are unchanged,
because every refusal the new code produces unwinds exactly as an existing
refusal does (row H7's amendment E2 says where the one exception, an NFS
mis-report, is stated).
```

E1 — in the H5 row (`:217`), replace the sentence beginning `**NARROWED, not
closed:**` through `rather than hides` with:

```text
**Per arm (Erratum 1, E1):** with `expect` absent, off win32, on a filesystem with hard links, the check and the publish are one create-or-fail act and the window is CLOSED. With `expect` present — and on the create arm on win32 or on a filesystem without hard links — it is NARROWED, not closed: a write landing between the check and the publish is still lost — a residual this row states rather than hides (canonical: `WP-vault-write-cas-window` Table K)
```

E2 — at the end of the H7 row's third cell (`:221`, after `never on a policy
refusal`), append:

```text
. **Publish-step outcomes (Erratum 1, E2):** the create arm's link publish adds `WP-vault-write-cas-window`'s Table X rows X1–X7 to this taxonomy. None adds a case to the H7 criterion's count: X1, X2, X3 and X5 are refusals that unwind exactly as an existing refusal does; X4 — a staging name surviving a SUCCESSFUL publish — is not a refusal and is a named residual there; X6 restates this spec's substitution residual; and X7 names a refusal that does NOT restore the vault — an NFS server that performed the link, or the shipped rename, and reported failure — which exists for the shipped rename too, is outside the count because the count covers filesystems that report their own results truthfully, and is stated there rather than here
```

E3 — the Security checklist line (`:295`) becomes:

```text
- [ ] Named residual: the compare→publish window is narrowed, not closed, on the overwrite arm, and on the create arm on win32 or on a filesystem without hard links; on the create arm elsewhere it is closed (H5) (Erratum 1, E3).
```

E4 — at the end of the Security checklist item that ends `is not a contract
here.` (`:302-305`), append:

```text
      Under the create arm's link publish the consequence changes form, not class: on darwin `link(2)` follows a symlink substituted at the staging name, so the target becomes a second name for the object it points at (measured 2026-09-26; `WP-vault-write-cas-window` Table X row X6) (Erratum 1, E4).
```

E5 — in the Mirrored Surface Checklist (`:250`), replace `**No surface may call
the compare→publish window "closed",` with:

```text
**No surface may call the compare→publish window "closed" except on the create arm off win32 on a filesystem with hard links (Erratum 1, E5),
```

E6 — at the end of the Out of scope bullet ending `does not exist at this
layer.` (`:523`), append:

```text
  (Erratum 1, E6) The create arm is closed by `WP-vault-write-cas-window` wherever a hard link can be made; the overwrite arm stays open for exactly the reason stated here.
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 trigger fires on six of seven: (i) the signature gains
`beforePublish`; (ii) the H7 outcome taxonomy gains rows; (iv) error,
fallback and precedence behaviour change (`EEXIST` vs the fallback codes vs
every other code); (v) authority boundary — the primitive decides publish
outcomes, `promote.js` and `warnings.js` interpret them, and the Done spec owns
Table H; (vi) two consumer modules, with three kinds of write, inherit the
contract; (vii) the same facts
appear in four code texts, six Done-spec surfaces, the acceptance criteria and
the verification greps.

### Contract table(s)

#### Table K — the publish step, per arm (canonical)

| # | Arm and condition | Premise check | Publishing act | Window after this package | Why H4 holds | Stated at (move together) |
|---|---|---|---|---|---| --- |
| K1 | **Create arm** (`expect` omitted), `process.platform !== 'win32'`, evaluated on each call | the shipped checks at `:424-430` and `:444-446`, **retained unchanged** as the early refusal and the source of the symlink and non-regular reasons | `fs.linkSync(tmp, targetLexical)`; on success `tmp` is cleared at once, then the staging name is removed. **From the moment the link succeeds no path returns a refusal** (Table X row X4) | **CLOSED.** The link fails `EEXIST` if anything is at the name — regular file (APFS, HFS+) and dangling symlink (APFS), memo §5; directory and live symlink (APFS), round record §2 — so the premise is re-asserted by the act itself. `EEXIST` → X1. Any code in `LINK_UNSUPPORTED_CODES` → K2. Any other code → X2 | the target name is created only by the link, pointing at the object whose every byte was written and whose descriptor was closed before the call (memo §5d: same inode, full content). A reader sees no file or the complete content. Between the link and the removal the object has two names; the staging name is never handed to anyone | D1, D2, D3, D4 (closed); Done spec E0, E1, E3, E5, E6 |
| K2 | Create arm, K1's link failed with a code in `LINK_UNSUPPORTED_CODES` = {`ENOTSUP`, `EPERM`} — **exactly these two**; `EEXIST` is **never** a member (on FAT32/exFAT a link onto an existing name returns `EEXIST`, memo §5, so `EEXIST` says nothing about link support) | none added: the call goes straight to the rename | `fs.renameSync(tmp, targetLexical)` — the shipped publish and its shipped failure reason | **OPEN, re-disclosed**: the shipped narrowed window, from the `:424` check to the rename, now including one failed link call. Membership rests on measurement for `ENOTSUP` (darwin FAT32/exFAT) and on link(2)'s documented meaning for `EPERM` (linux; that vfat emits it is recalled, not measured) — owner item 1 | rename, as shipped | D1, D2, D3, D4 (open); E0, E1, E3 |
| K3 | Create arm, `process.platform === 'win32'` | the shipped checks | `fs.renameSync`, as shipped. **No link is attempted.** Stated as an explicit platform branch, not hidden behind an error code | **OPEN, re-disclosed.** Nothing on win32 is measured (no Windows runner exists; the non-NTFS link error code and a staging-name removal under another process's handle are both UNVERIFIED, memo §1–§2) — owner item 2 | rename, as shipped | D1, D2, D3, D4 (open); E0, E1, E3 |
| K4 | **Overwrite arm** (`expect` present), every platform | the shipped checks at `:424-443`, unchanged | `fs.renameSync`, as shipped | **OPEN, re-disclosed (candidate 0).** A save landing between the compare and the rename is lost, whether the writer saves in place (Obsidian desktop, VS Code) or by replacing the file (vim's default, TextEdit, Syncthing) — memo §4. No reachable call replaces only an unchanged file (memo §2) | rename, as shipped | D1, D2, D3, D4 (open); E0, E1, E3, E6. R4 (`promote.js:1757-1761`) stays true unedited |
| K5 | **The barrier** `o.beforePublish`, every arm and platform | — | called with no arguments exactly once per call that reaches K1, K3 or K4's publishing act: **after** every check the call makes on the target and **before** the publishing act. Not called on a call that refuses first. **K2 does not call it again**, since the barrier has already run before K1's link. Its return value is ignored. A throw of **any** type, `WienerdogError` included, → X5. Present and not a function → caller-contract `WienerdogError`, thrown before the vault is touched. No production caller passes it | — | — | the `beforePublish` JSDoc (Exact contracts) |

#### Table X — publish-step outcomes (members of Table H row H7's taxonomy; canonical)

| # | When | Returned | Reason text | What survives in the vault | H9 unwind |
|---|---|---|---|---|---|
| X1 | K1's link fails `EEXIST` | refusal | `` `${resolvedRel} already exists and this write asserted it would not` `` — byte-identical to the pre-check's, so every caller sees one reason for "the create arm's premise failed", whichever check caught it | the object at the target, untouched; nothing of this call's making except H7 cases (a), (c), (d) exactly as the Done spec's H7 criterion counts them (for example the racer's file sits in a directory this call created, which is then retained and named) | runs as today |
| X2 | K1's link fails with any code **not** `EEXIST` and not in `LINK_UNSUPPORTED_CODES` — `EACCES`, `EIO`, `EMLINK`, `EXDEV` (reachable only through residual A's component swap), an unknown code | refusal | `` `${resolvedRel} could not be published (<code or message>)` `` — the shipped publish-failure text | as X1 | runs as today |
| X3 | K2, K3 or K4's rename fails | refusal, as shipped | as shipped | as shipped | as shipped |
| X4 | K1's link succeeded and removing the staging name then fails | **`{written:true, bytes, sha256}`** — never a refusal. The target holds the published bytes, and a refusal would claim the vault object untouched, which is false, and the caller would then account for a promotion as not having happened | none | **named residual, unreported:** the staging name, a second name for the bytes this call just published (not a refused payload), in the target's own parent directory — at most one per call. Owner item 4 | none — the call succeeded |
| X5 | `beforePublish` throws | refusal | `` `the write failed unexpectedly (<code or message>)` `` — the shipped text of the outer catch | as X1 | runs, including for a `WienerdogError` thrown by the seam (the shipped outer catch re-throws that type, so the seam's call must convert it itself) |
| X6 | the staging object is **substituted** between its creation and K1's link (the Done spec's existing named residual, `:302-305`) | unchanged in class | — | on darwin `link(2)` follows a symlink at its source (`man 2 link`; measured in round record §2), so the target becomes a second name for the object the symlink points at. Under the shipped rename, the target became the planted symlink. Either way a same-user actor who can substitute inside the vault gets the target bound to an object of their choosing, so the capability class is unchanged | — |
| X7 | (a) the process dies between K1's link and the removal; (b) on NFS, K1's link — or K2/K3/K4's rename — is performed by the server but reported as failed | (a) no return; (b) a refusal | (b) X1's, X2's or X3's text | (a) the staging name holding the **published** bytes — the class a crash at any point after staging already leaves (today: the unpublished staging object). (b) the target holding the payload **while the call reports a refusal**: a refusal that does not restore the vault. link(2) documents that NFS can return the wrong code, and rename(2) documents the same for the shipped rename, so (b) exists today and is not new. It is **not** added to the Done spec's H7 count of four, which covers filesystems that report their own results truthfully (Erratum 1, E2 says so) | (a) none; (b) runs, and removes the staging name |

### Mirrored Surface Checklist

A review finding updates the table **and every mirror below in the same
commit**; a newly found mirror is registered here on the spot. Where a mirror
and a table disagree, the table is right and the mirror is the bug.

- [ ] **Deliverables-table cells** — the `vault-write.js` cell names K1–K5 and
      X1–X5; the `promote.js` cell names D4 and R4's non-edit; the test cell
      names `[CAS-1]`–`[CAS-7]` and the one H6 fixture edit that K1 forces; the
      proofs cell names P1–P5; the Done-spec cell names E0–E6.
- [ ] **Exact contracts** — the `beforePublish` JSDoc mirrors K5 and X5;
      `LINK_UNSUPPORTED_CODES` mirrors K2; **D1–D4 mirror K1–K4** (arm by arm:
      closed only on K1; open on K2, K3, K4); **E0, E1, E3, E5, E6 mirror
      K1–K4**, and **E2 and E4 mirror Table X** (E2: X1–X7, and the count of
      four; E4: X6).
- [ ] **Code mirrors outside this spec, edited by this package** —
      `vault-write.js` limit B (D1), the section comment (D2), the publish
      comment (D3), `promote.js:1601-1604` (D4).
- [ ] **Code mirror outside this spec, NOT edited, kept true** —
      `promote.js:1757-1761` (R4): it describes the detected case, and it stays
      reachable on both arms (Context, open question 5).
- [ ] **Done-spec mirrors, amended by Erratum 1** — H5 (E1), H7 (E2),
      Security checklist `:295` (E3) and `:302-305` (E4), the Mirrored Surface
      Checklist's prohibition (E5), Out of scope (E6). **Registered and verified
      unchanged:** H4 (`:216`, which states a property and not a mechanism), the
      H5 criterion (`:376-379`), and the H7 criterion's count of four
      (`:429-455`).
- [ ] **Acceptance criteria** — AC1 (K1, X1; K2's `EEXIST` exclusion), AC2
      (K4), AC3 (X4), AC4 (K2, X2), AC5 (K5, X5), AC6 (K1's H4 argument), AC7
      (K3), AC8 (D1–D4), AC9 (E0–E6).
- [ ] **Verification commands** — the D1/D4 greps, the one-hunk check on
      `promote.js`, the E-marker loop, the `beforePublish` production-caller
      grep, `npm run red-proofs -- --wp WP-vault-write-cas-window`.
- [ ] **RED proofs** — P1 (K1), P2 (K2's `EEXIST` exclusion), P3 (X4), P4
      (K2), P5 (K4).
- [ ] **Current state** — the shipped sequence (the K rows' "as shipped"
      cells) and the disclosure-site list (the D and E items).
- [ ] **Operative prose** — the Context's decision paragraph and "Open
      questions, answered"; the Implementation-notes traps; the Security
      checklist; owner items 1–5; Out of scope.

## Implementation notes & constraints

- **No new dependency, no TypeScript, no build step, no native addon** (CLAUDE.md:
  zero runtime dependencies). The flagged renames that would narrow the overwrite
  arm need an addon, so they are unreachable (memo §2).
- **Keep the shipped checks and reasons.** The create-arm pre-check at
  `:444-446` stays; under K1 it is an early refusal and the link is the
  authority. Every existing test must pass, and exactly one is edited: the H6
  test that anchors on the create arm's rename (Current state, Deliverables).
  Its edit is a fixture change only (a seeded target and a matching `expect`),
  and every one of its assertions stays as it is.
- **Traps:**
  - **Never rename the staging name over the target after linking.** When both
    names already point at the same object, `rename(2)` does nothing and reports
    success, so the staging name survives (measured on darwin, round record §2).
    Remove the staging name.
  - **`openSync(target, 'wx')` is not a publish.** It creates an empty file and
    then writes into it, so a reader can see an empty or partial file, which
    breaks H4 (memo §1). `copyFileSync(…, COPYFILE_EXCL)` breaks H4 the same
    way (memo §2: libuv creates the destination, then copies the bytes into it).
  - **`EEXIST` is never a fallback code.** It is the create arm's premise
    failing, and on FAT32/exFAT a link onto an existing name returns `EEXIST`
    even though the filesystem cannot make links at all (memo §5).
  - **The outer `catch` re-throws `WienerdogError`.** The barrier is caller code
    that runs after the first `mkdir`, which is exactly the case its ordering
    comment (`:467-475`) warns about. So the barrier's call is wrapped
    locally and converted to a refusal (X5), and the ordering invariant
    comment is extended by one sentence saying so.
  - **Clear `tmp` as soon as the link succeeds.** If it is cleared later, any
    throw in between reaches `refuse()`, which returns a refusal for a publish
    that happened (X4).
- **The race tests anchor on the barrier, never on a filesystem call.** `[CAS-1]`
  and `[CAS-2]` inject their concurrent write inside `beforePublish`. `[CAS-3]`,
  `[CAS-4]` and `[CAS-7]` do patch filesystem calls, and that is legitimate:
  their subject is the link publish itself, which Table K names as the mechanism.
  `[CAS-3]` must stay name-agnostic — it patches **both** `fs.unlinkSync` and
  `fs.rmSync` to fail for any path under the target's parent other than the
  target, and asserts that the fault was actually reached. A probe that never
  fires proves nothing (the shipped suite's `plantSymlinkAtEveryCreateOpen`
  comment records the same lesson).
- **`[CAS-6]` is H4 on the create arm, proven RED in-test** (the shipped suite's
  `assertDiscriminates` pattern): at every point where the target name exists
  during the call, it holds the complete payload. The in-test control is an
  exclusive-create-then-write sequence, and the probe must reject it. How the
  probe observes is the implementer's choice. Observing the target from inside
  every `fs` call made after the barrier is one way that does not depend on
  which call publishes.
- **`[CAS-7]` stubs the platform per call** (for example with
  `Object.defineProperty(process, 'platform', …)`, restored in a `finally`), which
  is why K1's condition is evaluated on each call rather than at module load.
- **The RED proofs' `expectRed` sets are DERIVED, not measured** — the code they
  mutate does not exist. The implementer writes each declaration's exact
  `find`/`replace`, runs `npm run red-proofs -- --wp WP-vault-write-cas-window`,
  and **corrects `expectRed` to the observed set**. A correction may falsify
  prose, so these are the sentences that depend on it: the proofs cell of the
  Deliverables table, the table below, this bullet, and the RED clause of each of
  AC1–AC4.

**RED proofs** (ADR-0042; one mutation per row, ADR-0036 A3; markers
`RP_MUT_CAS_P<n>`; each proof's `testNamePattern` is `\[CAS-`):

| Id | Criterion | The one mutation | `expectRed` (DERIVED) | Signal the assertion message carries |
|---|---|---|---|---|
| P1 `cas-create-arm-publishes-by-rename` | AC1 | K1's link publish (link plus staging-name removal) replaced by the shipped `fs.renameSync(tmp, targetLexical)` | `[CAS-1]`, `[CAS-3]`, `[CAS-4]` | `CAS-1 the concurrent file survives`; `CAS-3 the removal fault was reached`; `CAS-4 the link was attempted` |
| P2 `cas-eexist-falls-back` | AC1 | `'EEXIST'` added to `LINK_UNSUPPORTED_CODES` | `[CAS-1]` | `CAS-1 the concurrent file survives` |
| P3 `cas-removal-failure-refuses` | AC3 | a failed staging-name removal after the link returns a refusal | `[CAS-3]` | `CAS-3 a publish is never reported as a refusal` |
| P4 `cas-no-fallback` | AC4 | `LINK_UNSUPPORTED_CODES` emptied | `[CAS-4]` | `CAS-4 ENOTSUP publishes by rename` |
| P5 `cas-overwrite-rechecks-after-barrier` | AC2 | a second compare of the target against `expect`, placed after the barrier and refusing on mismatch | `[CAS-2]` | `CAS-2 residual: the in-place save is overwritten` |

- **Considered and rejected**, so the reasons are not re-argued. `'wx'` or
  `COPYFILE_EXCL` as the publish (breaks H4). For the overwrite arm, "rename
  the target aside, compare, then link" — the target is absent in the middle,
  which an editor's file watcher or a sync agent can read as a deletion, and a
  save already in flight still writes into the moved-aside object. The stub's
  candidate 1 (owner item 3). An `fsync` (owner item 5). A post-link identity
  check against substitution, which the Done spec leaves to the implementer's
  choice and which this package does not add.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] `rel` validation, symlink refusal and `admit` on the resolved path are
      unchanged (Table H rows H1–H3). The link does not follow a symlink at the
      target: it fails `EEXIST` and the symlink is left as it was (measured on
      APFS for a live and a dangling symlink; K1).
- [ ] `beforePublish` is a test seam. No file under `src/` other than
      `vault-write.js` names it (verification step). A throw from it cannot escape
      past the unwind (K5, X5).
- [ ] The fallback is an **enumerated accept-list**: exactly `ENOTSUP` and
      `EPERM` choose the rename; every other code refuses (K2, X2). A
      filesystem that reports "no hard links" with some other code refuses
      loudly, with the code in the reason — it never degrades silently. The
      fallback is the shipped publish, and its window is the shipped one plus
      one failed link call (K2).
- [ ] Named residuals, each canonical in its row: the overwrite arm's window
      (K4); the create arm's window on win32 (K3) and without hard links (K2);
      the unreported staging name after a successful publish (X4); substitution
      now followed by the link on darwin (X6); crash and NFS leftovers (X7).

## Acceptance criteria

- [ ] **AC1 — the create arm is closed where a link can be made (K1, X1).**
      `[CAS-1]`: an existing parent directory, a create-arm write, and a file
      created at the target inside `beforePublish`. The call refuses with X1's
      exact reason, the concurrent file keeps its bytes, and the vault is
      byte-identical to its state after the concurrent create (the staging object
      is gone). Skipped on win32. **RED:** P1 (the shipped rename clobbers the
      file) and P2 (an `EEXIST` fallback clobbers it).
- [ ] **AC2 — the overwrite arm's window is asserted AS A RESIDUAL (K4).**
      `[CAS-2]`: an overwrite-arm write whose `expect` matches, and inside
      `beforePublish` either (a) an in-place save of the target or (b) a save
      that replaces the target by rename. In both cases the call returns
      `written:true` and the target holds the call's bytes. The test's name says
      RESIDUAL, and its comment says that if it ever fails because the window
      closed, D1–D4 and E1/E3/E5/E6 must move with it. **RED:** P5.
- [ ] **AC3 — a publish is never reported as a refusal (X4).** `[CAS-3]`: a
      create-arm write where removing the staging name fails `EACCES`. The call
      returns `written:true`, `bytes` equals the payload, the target holds it,
      and the probe asserts that the fault was reached. Skipped on win32.
      **RED:** P3.
- [ ] **AC4 — the fallback is exactly the accept-list (K2, X2).** `[CAS-4]`,
      with `fs.linkSync` patched to fail (asserting that the link was attempted).
      With `ENOTSUP`, and again with `EPERM`, the write publishes (`written:true`,
      target complete, no staging name left). With `EIO` it refuses with X2's
      reason naming `EIO`, and the vault is byte-identical to its pre-call state.
      Skipped on win32. **RED:** P4.
- [ ] **AC5 — the barrier contract (K5, X5).** `[CAS-5]`: called exactly once on
      a publishing call on each arm; not called on a policy refusal, an
      `expect` mismatch or a create-arm pre-check refusal. A throw from it — a
      plain `Error` and a `WienerdogError` — returns a refusal with X5's reason,
      and the vault is byte-identical to its pre-call state. A non-function
      `beforePublish` throws `WienerdogError`.
- [ ] **AC6 — H4 on the create arm (K1).** `[CAS-6]`: wherever the target name
      exists during a create-arm call, it holds the complete payload. After
      success, the target's directory holds no staging name. Proven RED in-test
      against an exclusive-create-then-write control. Skipped on win32.
- [ ] **AC7 — win32 never links (K3).** `[CAS-7]`: with `process.platform`
      stubbed to `'win32'` and `fs.linkSync` patched to record calls and fail, a
      create-arm write publishes and `fs.linkSync` is never called.
- [ ] **AC8 — the four code texts are D1–D4 verbatim**, the shipped limit-B
      sentence is gone, and `promote.js` changes in exactly one hunk, the one at
      `:1601` (verification steps).
- [ ] **AC9 — Erratum 1 is present in the Done spec**: the E0 heading with a
      real date, markers E1–E6 each exactly once, and the shipped `:295` line
      gone (verification steps).
- [ ] **AC10 —** `npm test`, `npm run lint`, and
      `npm run red-proofs -- --wp WP-vault-write-cas-window` report every
      declared criterion `PROVEN`.
- [ ] Idempotence: `N/A — a vault write is not a repeatable command; Table H's
      expect-guard is what the Done spec ships in its place, and this package
      adds no command and no state.`

## Verification steps (run these; paste output in the PR)

```bash
# Deliverables exist. A --test-name-pattern matching zero tests exits 0, so the
# seven test names are checked for BEFORE the pattern run (absent → red).
test -f tests/red-proofs/vault-write-cas-window.proofs.json
bash -c 'for n in 1 2 3 4 5 6 7; do grep -q "dream-vault-write: \[CAS-$n\]" tests/unit/dream-vault-write.test.js || { echo "MISSING [CAS-$n]"; exit 1; }; done; echo "CAS-1..7 present"'
npm test -- --test-name-pattern "\[CAS-" tests/unit/dream-vault-write.test.js
npm test
npm run lint
npm run red-proofs -- --wp WP-vault-write-cas-window

# AC8 — the disclosure texts (D1 and D4 by their first line; the old limit-B
# sentence gone; promote.js touched in exactly one hunk, at :1601).
grep -q "B. CHECK-TO-PUBLISH WINDOW — PER ARM (WP-vault-write-cas-window, Table K)." src/core/dream/vault-write.js
test -f src/core/dream/vault-write.js && ! grep -q "still lost. Narrowed, not closed." src/core/dream/vault-write.js
grep -q "The compare→promote window depends on the arm (the primitive's Table K," src/core/dream/promote.js
git diff -U0 "$(git merge-base HEAD main)" -- src/core/dream/promote.js | grep '^@@'   # expect exactly one line, starting "@@ -1601,4 "

# K5 — the barrier exists and no production file passes it.
grep -q "beforePublish" src/core/dream/vault-write.js
test -z "$(grep -rln "beforePublish" src/ | grep -v '^src/core/dream/vault-write.js$')" && echo "no production caller"

# AC9 — Erratum 1 in the Done spec.
D=docs/specs/done/WP-dream-vault-write-primitive.md
grep -Eq "^## Erratum 1 \(20[0-9]{2}-[0-9]{2}-[0-9]{2}\) — the create arm's window is closed where hard links exist$" "$D"
bash -c 'D=docs/specs/done/WP-dream-vault-write-primitive.md; for n in 1 2 3 4 5 6; do c=$(grep -c "(Erratum 1, E$n)" "$D"); [ "$c" = 1 ] || { echo "E$n count $c"; exit 1; }; done; echo "E1..E6 once each"'
test -f "$D" && ! grep -qx -- "- \[ \] Named residual: the compare→publish window is narrowed, not closed (H5)." "$D"
git diff --check
```

- Every step above is NEW. Each must be observed **green** on the finished tree
  and **red** on a deliberately broken one, and both outputs pasted. The broken
  states: for the greps, the deliverable absent and the old text restored. For
  AC1–AC4, the RED-proof lane's own red. For AC5–AC7, a revert of that row's
  behaviour, named in the PR.

## Out of scope (do NOT do these)

- **Recovering a lost overwrite-arm save** (the stub's candidate 1: hold a
  descriptor, detect the in-place loss afterwards, recover the bytes from it). It
  needs a "published, but displaced a concurrent save" outcome in `promote.js`,
  `warnings.js` and the dream report, and a place to put the recovered bytes.
  That is a package of its own, if the owner wants it (owner item 3).
- **Crash durability — `fsync` of the staging object or its directory** (owner
  item 5). H4 speaks to readers of a running system.
- **win32 link publishing** (owner item 2) and **any change to
  `src/core/dream/warnings.js`**, which inherits K1–K4 through the unchanged
  call.
- **The component-swap and unwind-identity residuals** (`vault-write.js:40-47`
  limit A, `:51-57` limit C) and the stale "exactly two" writer count at
  `:6-11`. They are different limits, owned by `WP-dream-vault-write-primitive`,
  and the last is routed from the round record.
- **Anything that starts a process, takes a lock daemon or watches the vault**
  (ADR-0004).

## Dispatch precondition — owner items

**Citations.** This spec was written against `main` at `41c2baf1`. Before
dispatch, re-run every `file:line` citation, each checked at both ends
(`docs/runbooks/codex-review.md`, "Dispatch-time re-verification"). A citation
that does not resolve blocks the dispatch.

**Owner items** — each is a recommendation with the cost of overruling it. None
is ratified by this document.

1. **Vaults on a filesystem without hard links fall back to the shipped rename
   on `ENOTSUP`/`EPERM` (K2).** *Recommendation:* accept. *Cost of overruling
   (refuse instead):* on a vault kept on a FAT32 or exFAT USB stick or SD card,
   or on linux vfat, every new note, every new dream report and the warnings
   file's creation would refuse — the dream would stop adding notes there,
   loudly. The narrower overrule — enumerating more codes — costs a measurement
   per code; unlisted codes already refuse loudly.
2. **win32 keeps the rename on the create arm (K3).** *Recommendation:* accept
   until a Windows runner exists (`WP-a10-windows-reap` is blocked on the same
   purchase). *Cost of overruling:* shipping unmeasured behaviour. Two effects
   are possible, both loud rather than silent: if the non-NTFS error code is
   `EISDIR`, create-arm writes on those volumes refuse; and a staging-name
   removal blocked by another process's open handle (antivirus, indexer) could
   make X4's leftover common.
3. **The overwrite arm is re-disclosed, not narrowed (K4, candidate 0).**
   *Recommendation:* accept, because nothing portable closes it. *Cost of
   overruling (commission candidate 1 as a successor):* Obsidian desktop, the
   product's primary editor, saves in place (memo §4), so candidate 1 would
   detect a lost Obsidian save and could recover its bytes from the held
   descriptor — but only after the loss. It would add an outcome to every
   caller and to the dream report, would do nothing about vim, TextEdit or
   Syncthing, and on win32 holding the descriptor may itself make the rename
   fail (UNVERIFIED). That is an M package at least.
4. **A staging name that survives a successful publish is a named residual,
   not reported (X4).** *Recommendation:* accept. The leftover is a hidden
   (dot-named) second name for bytes the call has just published, not a refused
   payload. It is reachable only when the removal fails right after a link that
   needed write permission on the same directory. *Cost of overruling:* a new
   field on the success return, plus reporting code in `promote.js` and
   `warnings.js`, for a duplicate of content that was already approved.
5. **H4 does not speak to power loss; no `fsync` is added.** *Recommendation:*
   accept, and route durability to its own package if it is wanted. The
   primitive fsyncs nothing today (memo §0). ext4's `auto_da_alloc` is
   documented for replace-by-rename, which means the overwrite arm here, and —
   by the memo's reading of that documentation — not for a link (memo §3). Whether it covers today's create-arm rename to a new name is
   the memo's inference ("arguably not"), so this item makes no claim that the
   create arm loses crash protection it had. *Cost of overruling:* an
   `fsync` per vault write, plus a directory `fsync` for the new name to be
   durable, in a package whose subject is the concurrent-writer window.

## Definition of done

1. All verification steps pass locally, green and the deliberately broken red;
   output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): close the vault write's create-arm window where hard links exist (WP-vault-write-cas-window)`.
3. PR template filled, including "Decisions made" (or "none"), the corrected
   `expectRed` sets, and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
