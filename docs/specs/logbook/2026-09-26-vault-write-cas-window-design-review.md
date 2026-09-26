---
date: 2026-09-26
related_wps: [WP-vault-write-cas-window, WP-dream-vault-write-primitive]
---

# WP-vault-write-cas-window — design round record

The design round that turned the 2026-09-18 backlog stub into a spec. Written
by wd-architect on branch `docs/wp-vault-write-cas-window`, based on `main` at
`41c2baf1`. The platform facts are the researcher's memo,
`docs/specs/logbook/2026-09-26-cas-window-platform-facts.md`, imported on this
branch (§5). **No external round has run yet.** The rounds table (§8) is filled
in by the orchestrator. Each raw file is committed before it is adjudicated.

## 0. STOP CRITERION — pinned before round 1

Pinned per `docs/runbooks/codex-review.md` ("Finding disposition", the STOP
CRITERION bullet). Bands: **A** — silent wrong behaviour with a data-loss or
security consequence; **B** — caught downstream; **C** — hygiene. **HEAVY**
means the fix changes what the implementer builds: `src/` behaviour, a Table K
or Table X row's outcome, a D1–D4 or E0–E6 claim, the Deliverables set, or an
owner item's recommendation. **LIGHT** means the fix touches only this spec's
verification machinery (a test, a grep, a RED row, a citation, wording).

Evaluated in this order; the first rule that matches decides.

0. **Band gate.** A band-A finding is HEAVY, whatever it touches.
1. **ESCALATES to the pre-pinned FALLBACK.** Suppose that at round 3, or at any
   later round, a HEAVY finding still lands on Table K or Table X. Then stop
   patching and re-cut the package to **candidate 0 on both arms**: size S,
   docs and tests only. It keeps the `beforePublish` barrier, `[CAS-2]`'s
   residual test (extended to the create arm), and the four code texts and the
   Done-spec erratum re-worded to "narrowed, not closed" on both arms, with no
   link publish. The stub names this as a legitimate outcome, and this is its
   trigger.
2. **ESCALATES to a DESIGN QUESTION.** Suppose two consecutive rounds land
   findings on the same table (K or X) — the ADR-0031 circuit-breaker. Then do
   not patch a third time. The next step is a canonical re-extraction or a
   re-decision of that arm, recorded here before any edit.
3. **ESCALATES to the OWNER.** This covers (a) a finding whose honest fix needs
   a platform measurement this repo cannot make (win32, NFS, FUSE, CIFS, the
   closed sync agents), and (b) a finding that argues against an owner item's
   recommendation. Each becomes an owner item or is recorded as input to the
   existing one, and neither counts as unresolved for closure. Nothing in the
   loop ratifies an owner item.
4. **HEAVY → FRESH ROUND.** Any other HEAVY finding: fix, re-run §4's
   mechanical checks, then one fresh external round, with this criterion
   re-stated at its head.
5. **LIGHT → CLOSES.** A round whose findings are all LIGHT (band B or C): fix
   in place, re-verify mechanically — `simulate.js` + `checks.js` (§4), the
   range check, the RED-declaration parse, `npm run lint` — and the loop
   **closes with no further external round**. A band-C finding may instead be
   dropped with a one-line reason recorded here.
6. **DONE** when a round finds nothing about the product. Machinery findings at
   that point are fixed or accepted as named residuals and do not extend the
   loop. The verification surface is **frozen** at seven tests, five RED
   proofs and the greps listed in the spec's Verification steps: a machinery
   finding is fixed within that surface or accepted, never answered with more
   machinery.

## 1. Template conformance — round zero (architect's self-report)

`docs/runbooks/codex-review.md` requires this conformance read to come from a
**clean-context executor** given only the spec and the template. The table below
is the author's own check, recorded so that executor has something to confirm or
contradict. It does not replace that read.

| `_TEMPLATE.md` section | In the spec | Note |
|---|---|---|
| frontmatter: `id`, `title`, `status`, `model`, `size`, `depends_on`, `adrs`, `epic` | present | `status: Draft`, `size: M`, `epic: dream-promotion` |
| `# WP-<slug>: <title>` | present | |
| authoring-rules bullet | present | verbatim |
| `## Context (read this, nothing else)` | present | includes the decision per arm and "Open questions, answered" |
| `## Current state` | present | re-derived at `41c2baf1`; §3 below |
| `## Deliverables (permission boundary — touch ONLY these)` | present | 5 rows, boundary comment kept |
| `### Exact contracts` | present | the signature, `LINK_UNSUPPORTED_CODES`, D1–D4, E0–E6 |
| `## Contract reference` | present | the trigger fires on six of seven |
| `### Contract table(s)` | present | Table K (publish step), Table X (outcomes) |
| `### Mirrored Surface Checklist` | present | 10 bullets |
| `## Implementation notes & constraints` | present | includes the RED-proof register P1–P5 |
| `## Security checklist` | present | untrusted input is `rel`, unchanged |
| `## Acceptance criteria` | present | AC1–AC10 plus the idempotence line as `N/A — …` |
| `## Verification steps` | present | literal; §4 ran the text greps |
| `## Out of scope (do NOT do these)` | present | |
| `## Definition of done` | present | items 1–5 |
| *(extra)* `## Dispatch precondition — owner items` | present | not a template section; the shape the current pipeline expects; five items |
| *(extra)* package note and size paragraph under the title | present | not a template section |

### Clean-context executor, round zero (orchestrator-run, 2026-09-26)

Per the runbook, a separate executor that took no part in drafting — a fresh
general-purpose agent on Sonnet, given exactly two inputs, `docs/specs/_TEMPLATE.md`
and this spec at `9b40d3cc` — walked the template's section list and
frontmatter keys. Result: **conformant** — every template section PRESENT
verbatim at the same level and in template order (H1 at :12, Context :41,
Current state :143, Deliverables :221, Exact contracts :239, Contract
reference :387, Contract table(s) :399, Mirrored Surface Checklist :423,
Implementation notes :464, Security checklist :544, Acceptance criteria :564,
Verification steps :617, Out of scope :654, Definition of done :723); every
frontmatter key present (`epic` set, not commented). Extra headings, all
allowed: `### Open questions, answered` (:122), Tables K and X as H4 under
Contract table(s) (:401, :411), `## Dispatch precondition — owner items`
(:673). The executor noted that `## Erratum 1` at :331 is literal text inside
a fenced block, not a heading of this document.

## 2. Measurements added by this design round

These were run by the architect on this machine (darwin 25.5.0, Node v25.9.0,
APFS, in the session scratchpad). They supplement the memo's §5. Exact output:

```text
link onto directory -> EEXIST
link onto live symlink -> EEXIST | live still symlink: true
link in unwritable dir -> EACCES
link from a symlink source: published isSymlink false same ino as victim true
```

```text
rename between two links of one inode: tmp still exists: true target nlink: 2
v25.9.0 darwin
```

Readings:

- The link fails `EEXIST` onto a directory and onto a live symlink, and does not
  follow the symlink at the destination. Together with the memo's file and
  dangling-symlink results, this backs Table K row K1's "anything at the name".
- The link needs write permission on the directory, so `EACCES` → Table X row
  X2.
- On darwin the link **follows a symlink at its source**, which is what
  `man 2 link` says: *"If the last component of path1 is a symbolic link,
  link() will point the hard link, path2, to the underlying object pointed to
  by path1"*. This backs Table X row X6 and Erratum 1 E4.
- A rename between two names of one object is a no-op that reports success.
  This backs the Implementation-notes trap "never rename the staging name over
  the target after linking".

**Added in the round-1 revision** (same machine, same session). The staging
descriptor was held open across the publish, and its `fstat` was compared with
an `lstat` of the target:

```text
honest: target isFile true dev+ino match true
symlink-substituted: target isFile true dev+ino match false reads "SECRET"
after unlink(target): target exists false victim "SECRET" victim nlink 1
hardlink-substituted: dev+ino match false
staging removal in unwritable dir -> EACCES
target removal in unwritable dir -> EACCES
```

Readings:

- An identity check against the staged `(dev, ino)` tells an honest link from a
  link bound to a substituted object, both a symlink and a hard link. This
  backs K1 step 3 and X6.
- When the staging name cannot be removed because the directory became
  unwritable, removing the target fails the same way. So "undo the publish"
  is not a way out of X4, and X4 refuses instead.
- The `unlink(target)` line is recorded because round 1 proposed it. The
  revision rejects removing the target (X6): that same mismatch is what a
  user's replace-by-rename save right after the link looks like.

## 3. Current state — citations checked at both ends

Every `file:line` range in the spec was printed at both ends by a scratch helper
(`ranges.js`, not committed), against `41c2baf1`. The ones that needed care:

| Citation | First line | Last line | Verdict |
|---|---|---|---|
| `vault-write.js:205-479` | `function writeIntoVault(o) {` | `}` | OK |
| `vault-write.js:48-50` | `B. CHECK-TO-PUBLISH WINDOW …` | `still lost. Narrowed, not closed.` | OK |
| `vault-write.js:420-446` / `:420-423` | the section banner | the create arm's closing `}` / `(residual B).` | OK |
| `vault-write.js:448-456` | `// The rename is the publish …` | `tmp = null; …` | OK |
| `vault-write.js:463-478` | `} catch (e) {` | `}` | OK |
| `vault-write.js:467-475` | `// The rethrow below rests on an ORDERING INVARIANT` | `// failure shape H7 says it does not have.` | OK |
| `promote.js:1601-1604` | `// The compare→promote window is NARROWED` | `// stated residual, inherited here unchanged.` | OK |
| `promote.js:1757-1761` | `// R4 — the file mutated …` | `… it would clobber the user's edit.` | OK |
| `dream-vault-write.test.js:295-333` | the H4 test | `});` | **corrected from `:295-332`**, which ended inside the test |
| `dream-vault-write.test.js:162-179` | `/**` of `withPatchedFs` | `}` | **corrected from `:163-171`**, which ended at the signature |
| `dream-vault-write.test.js:474-512` | the H6 "IMMEDIATELY AFTER" test | `});` | OK |
| `dream-vault-write.test.js:508` | `assert.ok(injected, '… did not go through fs.renameSync')` | — | **corrected from `:507`**, a comment line |
| Done spec `:217`, `:221`, `:250`, `:295`, `:302-305`, `:376-379`, `:429-455`, `:522-523` | as quoted in the spec | as quoted | OK |

`git log --oneline c05a575b..41c2baf1 -- src/core/dream/vault-write.js src/core/dream/promote.js docs/specs/done/WP-dream-vault-write-primitive.md`
printed nothing. The stub's line numbers still resolved. Its **claims** did not
all hold, and §4 R0-a covers them.

## 4. Internal coherence pass — round zero

### 4.1 What was executed (not just read)

- **The spec's text greps, three-state.** `simulate.js` (a scratch helper, not
  committed) builds a compliant copy of the three edited files by applying the
  spec's **own fenced literal blocks** D1–D4 and E0–E6 — extracted from the
  spec, not retyped. `checks.js` then runs the verification greps with their
  exact arguments against three states:

  ```text
  == SHIPPED 41c2baf1            → FAIL on all 7 checks
  == SIMULATED compliant         → PASS on all 7 checks
  == ABSENT (no files)           → FAIL on all 7 checks
  ```

  The seven checks are: D1 first line present; old limit-B sentence gone
  (guarded); D4 first line present; `beforePublish` named; E0 heading dated;
  E1–E6 markers once each; the shipped `:295` line gone (guarded).
- **The one-hunk check on `promote.js`** (`diff -U0` shipped vs simulated):
  exactly one hunk, `@@ -1601,4 +1601,9 @@` — which is what the spec says to
  expect.
- **The shape of the Done-spec erratum** (`diff -U0` shipped vs simulated): seven
  hunks, one per E-item, at `:39` (E0), `:217` (E1), `:221` (E2), `:250` (E5),
  `:295` (E3), `:305` (E4) and `:523` (E6). No other line moves. The simulated
  amended Done spec passes markdownlint with 0 errors.
- **The RED declarations parse.** A draft of P1–P5 with placeholder
  `find`/`replace` and plausible test identities was run through the runner's
  own `validateProof` (`scripts/red-proofs.js`, exported): `parsed 5 proofs, 5
  valid, unique ids: true`. This validates the ids, the `wp`, the markers, the
  `testNamePattern` and the `expectRed` shape. It **cannot** validate the `find`
  strings or the red sets, because the code does not exist; that is why the
  spec marks `expectRed` DERIVED.
- **The production-caller check** reads green on the shipped tree too, because
  nothing names `beforePublish` yet. That is why it is guarded by the positive
  `grep -q "beforePublish" src/core/dream/vault-write.js`, which reads red on
  the shipped tree.
- **Not executable here:** the seven tests and the RED lane (the code does not
  exist), and every win32 claim (no Windows runner).

### 4.2 Findings and dispositions

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| R0-a | The stub's Current state was wrong in three places. It named the function `writeFile` (that is `promote.js`'s seam name; the function is `writeIntoVault`). It listed three disclosure sites where the tree has two more in `vault-write.js` (`:420-423` and `:448-450`). And it called the Done spec's `:295` "its acceptance checklist line", when it is the Security checklist's named residual (the H5 acceptance criterion is `:376-379` and states no residual) | B | HEAVY (it changes the Deliverables and the erratum) | **Fixed.** Current state re-derived. D2 and D3 added. E3 aimed at `:295` as the Security line. The H5 criterion registered as unchanged |
| R0-b | An existing test is anchored on the create arm's rename: the H6 "IMMEDIATELY AFTER" test (`:474-512`) makes a create-arm write and asserts that its `fs.renameSync` patch fired (`:508`). K1 turns it red. The first draft said "no existing test changes" | B (a red suite, caught downstream) | HEAVY (it changes the Deliverables) | **Fixed.** The Deliverables test cell now permits exactly this edit — a seeded target and a matching `expect`, with every assertion unchanged — and the Current state and Implementation notes say why. Found by grepping every test that patches `renameSync` (`dream-vault-write`, `dream-pipeline`, `dream-validate`). The pipeline's patch passes through every rename except the ledger's, and the validate patch is on another module |
| R0-c | The E-marker loop could not pass on the first draft's own text: E3, E4 and E6 carried `(H5; Erratum 1, E3)`, `…; Erratum 1, E4)` and `(Erratum 1, E6: …)`, none of which contains the literal `(Erratum 1, E<n>)` | B | LIGHT | **Fixed**, and caught by running `checks.js` rather than by reading it |
| R0-d | Table X row X7's NFS case is a refusal that does not restore the vault, so it is a fifth case beside the Done spec's H7 count of four. It is pre-existing for the shipped rename | B | HEAVY (an erratum claim) | **Fixed by stating it rather than counting it.** X7 (b) names it, and E0 and E2 say it is outside the count, because the count covers filesystems that report their own results truthfully. The count is not re-opened: it would amend a Done criterion for a pre-existing platform behaviour this package does not change |
| R0-e | A universal statement with nothing to gate it: the Security checklist said "No fallback is ever worse than the shipped behaviour". K2's window is the shipped one plus one failed link call | C | LIGHT | **Fixed.** It now states the actual width |
| R0-f | The Context and Table K attributed "measured on APFS and HFS+" to all four destination kinds. The memo measured a file on both and a dangling symlink on APFS; §2 measured a directory and a live symlink on APFS | C | LIGHT | **Fixed.** The attribution is per kind |
| R0-g | Table K had no column saying where each row is disclosed. The brief requires "exactly where it is re-disclosed" | B | LIGHT | **Fixed.** A "Stated at (move together)" column was added. The Mirrored Surface Checklist already registered every item |
| R0-h | Wording overclaims from the first draft: "three callers" (there are two modules and three kinds of write); a trap bullet headed "each measured" whose `'wx'` item is by construction; "the linux rename(2) man page says the same" (recalled, not fetched); owner item 5's "does not cover a link" (the memo's inference) | C | LIGHT | **Fixed.** Each claim is narrowed to what the evidence reaches |
| R0-i | The memo copy failed markdownlint (three errors) | C | LIGHT | **Fixed by lint-only edits** (§5), and the content is unchanged |

## 5. The memo, as imported

`docs/specs/logbook/2026-09-26-cas-window-platform-facts.md` is the
researcher's, copied from the session scratchpad. Its two scripts are copied
verbatim beside it as `…-platform-facts-measure.js` and `…-fsprobe.js`.
`measure.js` creates its working directory under its own directory when run.
**Three lint-only edits** were made to the memo; no fact or word of analysis
changed:

1. line 60: the `|` characters inside backticks in a table cell were escaped
   (`O_CREAT\|O_EXCL` and two others). This is MD056.
2. line 135: the Windows row was missing its "Flags" cell. It now reads
   `(in the Call cell)`, since that row's flags are described in its Call cell.
   This is MD056.
3. line 245: one of two consecutive blank lines removed (MD012).

## 6. Discovered, not fixed (routing)

- `src/core/dream/vault-write.js:6-11` says the family owns "exactly two" vault
  content writers, while `docs/GLOSSARY.md`'s **vault write** entry names three
  (it includes the warnings file). It is stale since the warnings file adopted
  the primitive. It is not a window claim, so it is excluded from this package
  (Out of scope). **Route:** a one-line fix under whichever package next edits
  that header, or a docs-only landing.
- `docs/specs/WP-dream-primary-dialogue-filter.md` and this spec both use the
  "DERIVED `expectRed`" convention. It lives only in Implementation notes. If a
  third spec uses it, it is worth a runbook line — not taken here.

## 7. What the memo changed

- **It made the create-arm closure a design instead of a hope.** The link fails
  `EEXIST` on anything at the name, and keeps H4 (§5). And it made the fallback
  **mandatory, not optional**: `ENOTSUP` on FAT32/exFAT is measured, and a vault
  on an SD card or USB stick is a realistic setup. Without the memo the stub's
  candidate 2 had an unmeasured failure mode on the very filesystems where users
  keep portable vaults.
- **`EEXIST` is not a support probe.** On FAT32/exFAT a link onto an existing
  name returns `EEXIST` (§5). That is why `EEXIST` is structurally barred from
  the fallback set, and why proof P2 exists.
- **It killed `'wx'` as the create-arm publish** (an empty file, then writes,
  which breaks H4). That left `fs.linkSync` as the only H4-preserving
  create-or-fail call.
- **It decided the win32 answer.** The non-NTFS error code is UNVERIFIED — and
  if it is `EISDIR`, it is a code no one would think to enlist. Together with
  the missing Windows runner, that made "win32 keeps the rename" (K3, owner
  item 2) the honest choice rather than an arbitrary one.
- **It sharpened the overwrite-arm trade-off.** Obsidian desktop saves in place,
  so candidate 1 would reach the product's primary editor. That turned
  "candidate 1 is weak" into a real owner question (item 3) rather than an
  architect's dismissal. It still does not prevent a single loss.
- **It added the crash-durability question** (no `fsync`; `auto_da_alloc`), which
  the stub never raised. It is routed as owner item 5 rather than absorbed.
- **It corrected a framing.** MoveFileExW is "not documented as atomic", not
  "documented as not atomic". No surface of this spec makes either claim.

## 8. Rounds

| Round | Reviewer | Raw | Commit | Verdict |
|---|---|---|---|---|
| 0 | clean-context conformance executor (Sonnet) | §1, "Clean-context executor, round zero" | `23601732` | conformant |
| 1 | Codex design gate (Astra) | `docs/specs/logbook/2026-09-26-vault-write-cas-window-design-r1-astra-raw.json`, `…-r1-astra-focus.txt` | `f14c60af` | needs-attention, three findings |

### Round 1 — adjudication (the orchestrator proposed the dispositions; the architect applied them)

The pinned criterion (§0) decides the weights. Rule 0 makes both band-A
findings HEAVY, and rule 4 then requires a fix, the mechanical re-checks and
one fresh round. Rule 1's fallback is not triggered: this is round 1. Every
finding was accepted. None was dispositioned away.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| R1-1 | X4 treated a failed staging-name removal after a successful link as `written:true`, so a second vault name holding the payload went unreported — the state H7 calls dangerous for a refusal, created on a success. A crash between the link and the removal leaves the same state | A | HEAVY | **Fixed.** X4 is now a **refusal**, H7 case **(e)**. Its reason says the target holds the bytes and, through `refuse()`'s shipped first bucket, names the retained staging name — a channel all three callers already surface (`promote.js` into the dream report; `dream.js` prints the warnings file's reason). The revision **does not undo the publish**, and says why: in the only measured cause, an unwritable directory, removing the target fails the same way (§2). Reporting a success with a new return field was rejected because every caller would need new code to see it. The **crash** half is disposed separately: X7 (a) states that a crash anywhere after staging already leaves an approved payload under a staging name today, under either publish. A sweep of stale staging names is owner item 4 (ii), as a successor that must prove it never removes a live call's object. Owner item 4 is **revised**, not routed, per rule 0. Mirrors moved in the same commit: Table X rows X4 and X7, K1 steps 4–5, the Context decision bullet, AC3 and `[CAS-3]`, P3 (now `cas-removal-failure-reported-as-success`), D3, D5, E0, E2, E7 (case (e)), E8 (count four → six), the Security checklist and owner item 4 |
| R1-2 | X6's claim of "the same capability class as the shipped rename" was unsupported. A rename puts a *symlink* at the target, while the link can make the target a *regular* second name for another file's contents. No test exercised it | A | HEAVY | **Fixed, with a design change the reviewer did not propose, and argued here.** K1 gains an **identity check**. The staging descriptor is held open on K1 only, and after the link `lstat(target)` must be a regular file with the staged `(dev, ino)`. This is measured to catch both symlink and hard-link substitution (§2). On a mismatch the call **refuses and leaves the target as found, named** — X6, H7 case **(f)**. The round-1 suggestion was "unlink the target and refuse", and it is **rejected**. The same mismatch arises when a user's editor replaces the target by rename between the link and the check, and there the target is the user's only copy: removing it would turn a race the design tolerates into data loss. The capability argument is **restated against the right comparison.** A same-user actor who can substitute inside the vault can create the identical binding with one `ln`, without racing the dream. The dream's own commit never carries the other file's bytes (row H6; a refused path returns none). The first draft's comparison with the rename was the wrong comparison, and it is withdrawn. New test `[CAS-8]` covers symlink substitution, hard-link substitution and a concurrent-save control that must never be removed. New proof P6. New Done-spec surface E9 on row H3 ("DETECTED, not prevented"), and E4 rewritten. Mirrors moved in the same commit: Table K row K1 (steps 1–5), Table X row X6, D3, D5, E2, E4, E7 (case (f)), E9, the Security checklist, AC8, the RED table, the Considered-and-rejected list |
| R1-3 | The verification steps could not enforce AC8: only the first lines of D1 and D4 were grepped, and the `promote.js` hunk command printed without asserting anything | B | LIGHT | **Fixed within the frozen surface.** The greps and the marker loop are **replaced** — not supplemented — by one committed checker, `docs/specs/logbook/2026-09-26-vault-write-cas-window-text-check.js`. It reads every D and E block from the spec itself and requires each **verbatim** in its file, every replaced shipped sentence gone and every erratum marker exactly once. The hunk command now asserts exactly `@@ -1601,4 @@ -1759,3` (plus the trailing space `tr` leaves). That value was measured with `git diff -U0` on a tree built from D4 and D5: D5 keeps R4's first two lines, so git's hunk starts at `:1759`, and the draft's `-1757,5` guess was wrong. That was caught by running the check, not by reading it |

**Re-run after the revision (on this branch, before commit):**

- **The checker, three-state.** On a tree built by applying the spec's own
  blocks D1–D5 and E0–E9 to the shipped files (a scratch `simulate2.js`, not
  committed) it reports `ALL PASS`, exit 0, 35 checks. On the shipped tree it
  reports `35 FAILED`, exit 1. On an empty tree (every deliverable absent) it
  reports `35 FAILED`, exit 1. Running it caught two marker defects in the
  revision's own E7 and E8 texts, fixed before commit.
- **The hunk shape.** `git diff --no-index -U0` from shipped to simulated
  `promote.js` gives `@@ -1601,4 @@ -1759,3`, the asserted value. The
  simulated Done spec has one hunk per E-item, and no other line moves. It
  passes markdownlint with 0 errors.
- **The RED declarations parse.** A draft of P1–P6 run through the runner's
  `validateProof` gives `parsed 6 proofs, 6 valid, unique ids: true`.
- **Both-ends range check** for every citation the revision added:
  `vault-write.js:293-295` (the `if (staleStaging)` bucket) and `:414-418`
  (the staging descriptor's close); the Done spec's `:215` (the H3 row),
  `:262` (`**four**`) and `:429-455` (the H7 criterion). All resolve.
- `npm run lint`: passed.

### STOP CRITERION — restated at the head of round 2

§0 is unchanged and is restated here as it binds round 2.

- **Rule 0.** A band-A finding is HEAVY.
- **Rule 1.** A HEAVY finding on Table K or Table X at round 3 or later
  triggers the pre-pinned fallback: candidate 0 on both arms, size S.
- **Rule 2.** A second consecutive round landing on the same table is a design
  question, not a patch. **Round 1 landed on Table X (X4 and X6), so a round-2
  HEAVY finding on Table X fires this rule.** The design question is then
  "does the create-arm link still earn its surface?", answered here before any
  edit. The pre-pinned answer, if it does not, is rule 1's fallback, taken a
  round early.
- **Rule 3.** A finding that needs an unmeasurable platform fact, or that argues
  against an owner item's recommendation, goes to the owner.
- **Rule 4.** Any other HEAVY finding: fix, re-check, fresh round.
- **Rule 5.** A round whose findings are all LIGHT closes the loop.

The verification surface is re-frozen at **eight tests, six RED proofs, the
checker, the hunk check and the production-caller check**. It grew by one test
and one proof only to guard the new product behaviour, X6. Any machinery
finding from here on is fixed within that surface or accepted as a residual.
