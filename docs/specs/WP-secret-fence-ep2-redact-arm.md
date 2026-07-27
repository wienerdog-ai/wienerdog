---
id: WP-secret-fence-ep2-redact-arm
title: Make the EP2 staged-output gate consult severity — preserve the original, scrub only the added lines, and report the redaction
status: Draft
model: opus
size: M
depends_on: [WP-secret-fence-two-tier-detector]
adrs: [ADR-0004, ADR-0019, ADR-0024, ADR-0031, ADR-0034]
epic: secret-lifecycle
---

# WP-secret-fence-ep2-redact-arm: stop withholding a whole note for a `redact`-severity finding

## Provenance — this file was renamed on 2026-07-26, and why that matters

**This file was previously `docs/specs/WP-secret-fence-two-tier-entropy.md`.**
The owner authorised splitting that spec on 2026-07-26 along the Table A / Table
B line it had already drawn. Its detector half became
`docs/specs/WP-secret-fence-two-tier-detector.md` (a new file). **Its Table B
half — this document — stayed in place and was renamed**, so that the owner's
signature block at the end of this file never travelled between documents.
**"Renamed" here describes what the ARCHITECT did on disk, before either file was
tracked. It is not a claim git can confirm — point 5 below states exactly what
git does and does not show, and it is less than an earlier revision implied.**

**The table below records DECISION SCOPE ONLY and deliberately enumerates no
files.** Round 1 of the design gate found both legs' boundary tables carrying
divergent file lists — each an unregistered mirror of the *other* leg's
Deliverables, each already drifted, and neither checkable from inside its own
leg because the One-Document Rule (ADR-0005) forbids opening the sibling. This
leg's copy omitted `docs/GLOSSARY.md`, which leg 1 edits and which is the one
file both legs touch; it also named two of this leg's four canonical tables.
**This WP's own Deliverables table is the sole enumeration of its files**, and
the leg-1 side is leg 1's to enumerate.

| leg | canonical tables it owns |
|-----|--------------------------|
| 1 — `WP-secret-fence-two-tier-detector` | **Table A** (what the detector emits) and **Table C** (the corpora and the acceptance numbers) |
| **2 — this one** | **Table B** (what the EP2 gate does with a finding), **Table Q** (what every shipped claim about EP2's disposition says afterwards), **Table R** (the redact arm's outcome matrix) and **Table T** (how each outcome is produced and observed) |

**Leg 1 ships first and this WP `depends_on` it.** That is not a preference; see
"Why this leg cannot go first" under Implementation notes, and verification step
**V-16**, which refuses to proceed unless leg 1's changes are on disk.

If you followed a pointer to the old id — from a superseded spec in
`docs/specs/done/`, from `docs/specs/logbook/`, or from `ADR-0033` — the content
you were sent for is in one of these two files, and the table above says which.

### The owner signature at the end of this file

Read this before you read the `## OWNER-APPROVED` section, and read it again
before you touch anything near it.

1. **The signature block at the end of this file is the owner's own text, in the
   file it was written in, unmoved.** It was not retyped, reformatted, relocated
   or re-dated by the split. No agent has ever written an `OWNER-SIGNED` line in
   this repository and none ever will (row **S5** of the "Owner signature form"
   table below).
2. **Every item that signature names is still in this file.** It signs three
   things: the narrow override of ADR-0024, Table B rows **B4/B5/B10**, and Table
   B rows **B6/B7/B12/B13**. All three are Table B, all three are below, and the
   split moved none of them. What the split did was **remove** unsigned content
   (Tables A and C) from a signed document. A reduction in a signed document's
   scope is not a change to what was signed.
3. **Nothing in `WP-secret-fence-two-tier-detector` rests on that signature**, and
   that was checked row by row rather than assumed: none of the three signed
   items is a Table A row. That leg's authority is ADR-0034, which carries its own
   `OWNER-SIGNED 2026-07-25` line and is `Status: Accepted`.
4. **The signed block mentions "Table C", which is no longer in this file.** It
   does so only to say what the signature does *not* cover ("no acceptance number
   in Table C carries owner sign-off"), and that statement is still true — more
   obviously so now that Table C lives in the other leg. **It was not edited to
   repoint it**, because the block is a record of what the owner wrote, not a
   navigable index. Nothing in this file may be changed to make that block read
   more tidily.
5. **Recorded for a future auditor, because it is surprising: none of this is
   auditable from git, and THERE IS NO PRE-SPLIT BLOB TO DIFF AGAINST.**
   Re-measured against today's `main` in round 1 of the design gate, because an
   earlier revision of this point said "both leg files are still untracked",
   which stopped being true on 2026-07-26:
   - **Both leg files, and ADR-0034, are tracked as of `7ef4c51`
     (2026-07-26).** `git log --follow` on this file returns **exactly that one
     commit** — and `7ef4c51` is an **ADD, not a rename**: it created both leg
     files under their final names in one commit.
   - **`docs/specs/WP-secret-fence-two-tier-entropy.md` has NEVER existed as a
     path in any tree that has ever existed.** Verified by sweeping every commit
     reachable from every ref: `git rev-list --all --objects` returns no object
     under that path. `git log --all -S 'WP-secret-fence-two-tier-entropy'`
     returns one commit — `7ef4c51` again — and its only hits are the *string*
     inside the blobs that commit added, which are these two specs, the ADR and
     a logbook entry.
   - **Therefore `git log --follow`, `--find-renames` and every blob diff are
     blind to the split.** There is no committed pre-split state, so **byte
     identity of the signature block across the rename is not
     git-verifiable — and this document does not claim that it is.** An earlier
     review brief's premise that "the parent file renamed in place, so
     `git log --follow` holds the parent" is false, and so is any reading of
     this section that treats the rename as historically attested.

   **What the signature's continuity actually rests on**, stated exactly and
   claiming nothing more: (a) **this section and its counterpart in leg 1**,
   which say what moved and what did not; (b) **the owner's authorization of the
   split on 2026-07-26**; (c) **the `OWNER-ANSWERED` block below**, in which the
   owner was asked directly whether the signature carries and answered that it
   stands; and (d) **the signature block itself**, whose two lines V-11 pins by
   digest — so it can be shown *unedited since `7ef4c51`* even though it cannot
   be shown *unmoved across the split*. **V-20 pins this whole section by
   checksum** rather than by the presence of a token, which is why it is worth
   writing the limits down: the record is the warrant, so the record has to be
   frozen.

   **This is an observation about the evidence, not a defect and not a task.
   Nobody fabricates a commit, a rename or a signature line to make it look
   tidier**, and nobody "repairs" this by rewriting history.

<!-- OWNER REAFFIRMATION SLOT — leg 2.
     Prepared, deliberately EMPTY, and never filled by an agent.

     Point 5 above is honest that the split has no git record. The strongest
     confirmation available that these two documents are the ones the owner
     authorised is therefore the owner saying so ABOUT THE COMMITTED FORM. If he
     wants to give it, he types one line immediately below this comment, in his
     own words, in this form:

         OWNER-REAFFIRMED <YYYY-MM-DD> — the split into
         WP-secret-fence-two-tier-detector and WP-secret-fence-ep2-redact-arm,
         as committed, is the split I authorised on 2026-07-26, and the signed
         approval block at the end of this file still stands over it.

     THE TOKEN IS `OWNER-REAFFIRMED`, NEVER A SECOND SIGNATURE LINE, and
     that is a mechanical requirement rather than a stylistic one. V-11 asserts
     that its signature pattern
     `^[> *]*OWNER-SIGNED[ —–-]*[0-9]{4}-[0-9]{2}-[0-9]{2}` matches EXACTLY ONCE
     in this file, EXACTLY ONCE inside `## OWNER-APPROVED`, and that the two
     matched lines across the ADR and this file hash to one pinned digest — so a
     second such line anywhere would break V-11 three separate ways, and
     inside this section it would also break V-20. Measured in this pass: the
     `OWNER-REAFFIRMED` form above scores 0 against V-11's pattern.

     MIND THE LEADING WHITESPACE, and this is not a hypothetical — the FIRST
     DRAFT OF THIS COMMENT TRIPPED IT. The pattern's prefix class `[> *]*`
     CONTAINS A SPACE, so an indented line whose first non-blank token is the
     signature marker MATCHES it. The template above originally ended with that
     marker at the start of its fourth line; V-11 then counted TWO signatures in
     this file and its pinned digest went red. Caught by RUNNING V-11 rather
     than by reading it — which is the same lesson this document's own V-27
     sentinel taught in the same pass. Never begin a line in this comment with
     that marker; keep it mid-sentence, as this paragraph does.

     IT IS DELIBERATELY NOT A GATE. Nothing in the verification block requires
     this line to exist. Requiring it would invent a dispatch blocker out of an
     owner action nobody has asked for, and this WP has already paid once for a
     gate keyed on an unwritten owner line. What IS held: this comment is inside
     the region V-20 checksums, so deleting or rewording the slot turns V-20 red
     and the architect must recompute and disclose.

     S5 IS UNCHANGED AND ABSOLUTE: no agent writes an owner line of any kind,
     including this one, including "to carry it across a rename", including "to
     make the two legs look symmetrical". -->

> **OWNER-ANSWERED — 2026-07-26. The signature stands; this question is closed.**
> The signature below was given on 2026-07-25 against a document then named
> `WP-secret-fence-two-tier-entropy`. This file is that document, renamed and
> reduced. The architect's reading was that the signature carries, for the
> reasons in points 1–3 above; **the owner was asked directly and answered
> "stands"** — so V-11 passing as written is correct, not accidental. Everything
> the signature names — option B, the dream-report surface, the 50-cap — is still
> in this file; what left it (Table A) was never covered by it, so the split was a
> reduction in scope, not a change to what was signed.
>
> This block is the audit record and **must not be deleted as a tidy-up** (V-20
> asserts it). Nobody adds, copies or deletes a signature line on the strength of
> it, and nobody "fixes" V-11 in either direction.

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent Claude Code / Codex sessions
into the user's markdown **vault** (a git repository at `~/Obsidian/<name>` or
`~/wienerdog/`). Before the dream's single commit, every staged change passes
the **EP2 staged-output gate** (ADR-0024): `src/core/dream/validate.js` scans the
git-computed *added* lines of each file with the ONE shared detector
`scanAndRedact` (`src/core/secret-scan.js`) and, on **any** finding of **either**
severity, preserves the working-tree file into `state/quarantine/` and reverts
it. The note is not committed. The same detector gates three digest sections at
EP4 (`src/core/digest.js:506,521,543`) and sanitizes five other durable sinks
through `redactOnly`.

Detector findings carry a severity — `redact` or `quarantine` — and **no shipped
gate has ever branched on it.** `hasHardFinding(findings)` (quarantine-severity
only) is exported from `src/core/secret-scan.js` and, at the time this WP was
written, had no caller anywhere in `src/`. EP2 is `if (findings.length === 0)
continue;` and nothing else, so a `redact` finding and a `quarantine` finding
have identical consequences: the user loses the note, and — because
`src/cli/dream.js:577` defers transcripts on a non-zero `secretReverts` — loses
a night of consolidation with it.

**Leg 1 (`WP-secret-fence-two-tier-detector`) made severity mean something.** It
replaced the context-free entropy pass with two tiers: a candidate that binds a
sensitive keyword through a separator is `quarantine`, and a bare high-entropy
run with no such context is `redact`. It also raised all eighteen labelled rules
to `quarantine`, precisely so that when this WP teaches EP2 to branch on severity,
`redact` has exactly one producer and that producer is the context-free entropy
tier. **After leg 1 the detector is right and the gate is still blunt**: a note
whose only finding is a `redact`-severity entropy hit is still withheld and
reverted whole.

**This WP is the gate.** On a findings set containing no `quarantine` finding, it
preserves the unredacted original into `state/quarantine/redacted/`, rewrites
**only the lines this run added** to their sanitized form, leaves the note in the
vault, counts the outcome separately from a withhold so that transcripts are not
deferred, and announces it in the dream report. Any `quarantine` finding keeps
today's behaviour exactly: withhold, revert, banner, defer.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP starts no process,
opens no socket, and sends nothing off the machine. Every path it may touch is
enumerated in the **Deliverables** table below — that table is the only
enumeration of them in this document, and it creates no file and deletes none.

## OWNER-DECIDED — `redacted/` is the user's recovery original, ADR-0019 deletes it, and the fix is option C

**Raised in round 1 of the design gate by the adversarial reviewer, put to the
owner because it touches a RATIFIED ADR, and answered on 2026-07-27 — see
"ANSWERED" below, which is the decision; everything above it is the record of
what was weighed.** *Round 7.5 corrected this heading and the conditional
framing below: the section had carried "OWNER DECISION REQUIRED" and "if the
owner chooses…" for four rounds after the owner had chosen, which is the same
pending-versus-decided mismatch the fall-through section was corrected for in
the same pass.*

**The conflict, verified rather than argued.**

1. This WP creates `state/quarantine/redacted/` and puts **the only pre-scrub
   copy of the user's own text** in it. The dream-report line this WP pins tells
   the user, in these words: *"If the redaction was wrong, restore from that
   copy"*, and "The recovery runbook" edit 2 documents that path as the way back.
2. **ADR-0019 (`Status: Accepted`) makes that directory disposable.**
   `disposeCoreMechanics` removes `paths.state` with
   `fs.rmSync(dir, { recursive: true, force: true })`, so `redacted/` and
   everything in it go with it. This document's own Current state says so, and
   its "Why option B" argument **relies** on it: "removed wholesale by
   `wienerdog uninstall` through `disposeCoreMechanics` (ADR-0019)" is one of
   the three reasons preserving into `state/` is a materially weaker exposure
   than committing to the vault.
3. **ADR-0019 also states an invariant this content sits on the wrong side of.**
   Reproduced verbatim from `docs/adr/0019-uninstall-disposes-core-mechanics.md`,
   lines 52–54, with its own line breaks:

   ```text
   The invariant this rests on — **nothing user-authored is ever written under the
   canonical core; the vault is always outside it** — is binding on all future
   code. No WP may write user knowledge under `~/.wienerdog`.
   ```

   and, from its Consequences: *"Any future feature tempted to persist user
   content under the core must instead write to the vault (or be added to the
   manifest as a preserved kind)."* A pre-scrub copy of the user's own note
   **is** user-authored content. *(Round 2 of the design gate: the first
   revision of this item presented a SPLICED quotation as "Verbatim" — it
   dropped the opening clause and joined two fragments across the em-dash. In an
   owner-facing section whose whole job is to put a ratified ADR's own words in
   front of the owner, a paraphrase labelled verbatim is the defect, not the
   wording it produced.)*

**Two honest qualifications, so the question is not overstated.** (a) The
invariant is *already* crossed by the shipped withhold path: `state/quarantine/`
has held the user's own withheld notes since WP-123, so this WP **extends** an
existing breach rather than opening one. (b) Uninstall deleting raw secret bytes
is arguably **correct** — it is the same argument ADR-0019 makes for `secrets/`,
and leaving pre-scrub credential copies on disk after uninstall would be its own
finding. **The defect that is unambiguously this WP's is the PROMISE**: it tells
the user to restore from a copy without telling them the copy is disposable,
capped, and destroyed by uninstall without a specific warning.

### The three options, with what each costs

| | option | what changes | what it costs |
|---|--------|--------------|---------------|
| **A** | **Relocate** the recovery originals to a preserved location outside disposable `state/` | a new destination for `quarantinePreserve(…, 'redacted')`; Table B, Table R, Table Q rows Q4/Q6/Q15, `private-fs.js`'s A5 set, and the manifest | **The vault is not a candidate** — it is a git repository that may be synced or backed up, and keeping raw bytes out of it is this gate's entire job; writing them there would falsify accepted residual 1. A *new* preserved path under the core (manifest "preserved kind") keeps the bytes local but leaves raw credential copies on disk after uninstall — a new persistence surface, and one ADR-0019 deliberately closed for `secrets/` |
| **B** | **Amend ADR-0019** to carve `state/quarantine/` **and** `state/quarantine/redacted/` out of blind recursive disposal, with an uninstall-time **export-or-warn** step | `docs/adr/0019-*.md`, `src/cli/uninstall.js`, `src/core/manifest.js`, the `--dry-run` disclosure, and this WP's Deliverables | An ADR amendment plus three files **none of which is in this WP's Deliverables table**, and `src/cli/uninstall.js` is currently in its explicit prohibition list. This is a follow-on WP, not an in-place edit |
| **C** | **Keep disposal exactly as it is and make the PROMISE honest** | Table Q rows **Q4** (runbook) and **Q6** (glossary), the dream-report line's second sentence, and one accepted residual | Costs nothing outside this WP's existing boundary. Does **not** resolve qualification (3) — the invariant stays crossed, as it already is for `state/quarantine/` |

### The architect's recommendation: C now, B as a named follow-on

**Recommended: option C in this WP, with option B filed as a follow-on that
covers `state/quarantine/` and `redacted/` together.** The reasoning, so the
owner can disagree with the reasoning rather than the conclusion:

- **A is wrong on the security trade this WP already made.** Local-only, 0600
  inside 0700, never committed, never synced, **and removed by uninstall** is the
  four-part argument that justified option B (preserve-then-scrub) over
  scrub-only. Relocating to a preserved location deletes the fourth part and
  leaves raw credential material on disk after the user has uninstalled the
  product. That is a worse outcome than losing a recovery copy.
- **B is right but is not this WP.** It amends a ratified ADR and edits three
  files outside this permission boundary, including one this WP explicitly
  forbids. Doing it here would be exactly the scope creep the Deliverables table
  exists to prevent — and it would also change the withhold path, which
  "Out of scope" allows only under three named exceptions.
- **C closes the part that is genuinely this WP's fault** — a documented recovery
  path that does not disclose its own expiry — inside the boundary, in wording
  changes to rows this document already owns.

**The decided edits — option C** (written as conditionals until round 7.5, and
now stated as what they are) are: Q4's runbook bullet gains
*"and `wienerdog uninstall` removes this folder along with everything else under
`state/`, so copy anything you want to keep out of it first"*; Q6's glossary
sentence keeps its no-number rule and gains the word *disposable*; the dream
report's second sentence becomes *"If the redaction was wrong, restore from that
copy while it is there; otherwise delete it."*; and a **new** accepted
residual records the uninstall interaction and points at the option-B follow-on.
**It is the `wienerdog uninstall` residual, and this list names it by its
subject rather than by an ordinal** — round 2 corrected the number once and
round 6 renumbered it again when residual 11 was inserted ahead of it, so an
ordinal in the owner-facing edit list is a citation that rots on every
insertion.

**THE STANDING RULE, AND ITS SCOPE — round 7 wrote it as an absolute and this
document breaks it 42 times.** Round 7's form was *"cite an accepted residual by
its subject, not by its number, in this document and in the follow-on stub"*.
**Executed in round 8** —
`grep -onE 'residuals? +(\*\*)?[0-9]+[a-z]?' docs/specs/WP-secret-fence-ep2-redact-arm.md | wc -l`
returns **42**, the first of them at `:337`, **twenty-one lines below the rule
itself**. An absolute the document violates on its own next screenful is not a
rule, and converting 42 ordinal citations into subject phrases would make Table
R, Table K, Table T and the mutation table unreadable — a residual's ordinal is
the right handle in a contract cross-reference.

**So the rule is scoped to the surfaces it was written for, and only those:**

> **Cite an accepted residual by its SUBJECT, never by its ordinal, in
> (a) OWNER-FACING EDIT LISTS** — the decided-edits list above, and any future
> list of changes put in front of the owner — **and (b) APPROVAL AND
> TRANSCRIPTION RECORDS.** Everywhere else — contract tables, injections,
> mutations, verification comments, the residual list's own cross-references —
> **the ordinal is the correct citation** and the 42 uses are correct as they
> stand.

The reason for the scope is the reason the rule exists: those two surfaces are
**frozen or quoted**, so an ordinal in them cannot be re-pointed when a residual
is inserted ahead of it — which is exactly what happened twice, in round 2 and
again in round 6. A contract table is neither frozen nor quoted; a renumbering
sweeps it in the same pass, like any other id.

**Options A and B were not chosen.** Had either been, this spec would have been
re-scoped before dispatch — its Deliverables table grown and Tables B, R and Q
moved. Retained as the considered-and-rejected record, not as a live branch.

### ANSWERED — 2026-07-27. The owner chose **C now, B as a follow-on**

> **OWNER-DECIDED IN SESSION — 2026-07-27 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered this question in conversation; this record was written by
> the architect, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one, and no gate keys on
> it (rows **S5**/**S6** of the "Owner signature form" table govern: the merge
> gate keys only on an owner-written `OWNER-SIGNED` line, which no agent ever
> writes). **Scope of this decision:** the ADR-0019 conflict above, resolved as
> **option C in this WP, with option B filed as a named follow-on.** Verbatim:
> *"ADR-0019: C now + B as follow-on."*

**What that settles, and what it does not.** Option C is now the decided design
of this WP and the four edits listed above are **required**, not recommended —
they are folded into Table Q rows **Q4** and **Q6**, the dream-report line
template, and accepted residual **12**. **The invariant conflict is NOT
resolved by C** and this document does not claim it is: pre-scrub copies of the
user's own text still live under the canonical core, still disposable, exactly
as the shipped withhold path's copies already do. What C fixes is the part that
is unambiguously this WP's fault — **a documented recovery path that did not
disclose its own expiry.**

**Option B is filed as `WP-adr-0019-quarantine-uninstall-export`**
(`docs/specs/WP-adr-0019-quarantine-uninstall-export.md`, `status: Draft`,
`depends_on: [WP-secret-fence-ep2-redact-arm]`). It carries the ADR-0019
amendment and the uninstall export/warn step, for `state/quarantine/` **and**
`state/quarantine/redacted/` together — the withhold path has the same exposure
and predates this WP, so splitting them would fix half a problem twice.

**An implementer must still not invent a resolution beyond C.** Do not
add an uninstall exception, do not change the destination, and do not soften the
report line beyond the wording Table Q decides. Anything past option C is the
follow-on WP's, and re-opening the choice is an owner action.

## OWNER-DECIDED — the redact-arm fall-through is KEPT (option A)

**Raised in round 6 of the design gate by the adversarial reviewer, put to the
owner because the only clean alternative deletes a behaviour his own approval
names in its own words, and answered on 2026-07-27.**

**DATE CORRECTION — 2026-07-27, ROUND 8, AND THE ERROR WAS THE COORDINATOR'S.**
This record and four others carried **2026-07-28**. The ruling was taken in
session on **2026-07-27**; the round-7.5 brief that commissioned the
transcription stated 07-28, and the architect transcribed the brief's date
rather than the session's. **Measured:** the commit that wrote all five stamps,
`a516c77`, is authored `2026-07-27 20:38:12 +0200` — a record cannot be dated
after the commit that creates it. **Only the five DATES moved.** No verbatim
quotation, no scope clause and no owner word was touched, both transcription
records are preserved intact, and no gate keys on any of them (rows **S5**/**S6**).
The ADR-0019 record below already read 2026-07-27 and was correct.

> **OWNER-DECIDED IN SESSION — 2026-07-27 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered this in conversation; this record was written by the
> architect, not by him. It records that the decision was taken — it is **not**
> his signature and must never be treated as one, and **no gate keys on it**
> (rows **S5**/**S6** govern: the merge gate keys only on an owner-written
> `OWNER-SIGNED` line, which no agent ever writes).
> Verbatim: *"architect recommendation approved."*
> **Scope of this decision: the architect's recommendation below — OPTION A.** The redact-arm fall-through to withhold
> stays exactly as Table B rows B5/B5a describe it; accepted residual **11**
> discloses the inherited pre-revert race; and
> **`WP-ep2-atomic-withhold-handoff`** is the named follow-on that closes that
> race properly, for every severity, by capturing the file with `rename(2)`
> rather than by reading it and trusting the read.

**A NOTE BESIDE THE RECORD, NOT INSIDE IT — round 8.** The scope clause above
names the race residual **by its ordinal**, on the one surface where an ordinal
cannot be re-pointed: a transcription record is frozen the moment it is written.
**The record is NOT edited to fix this** — a transcription whose bytes an agent
adjusts afterwards stops being a transcription, and the residual-renumbering
lesson does not outrank that. **This note is the repair instead:** the residual
that block names is **the inherited pre-revert race between the last check and
the destructive step** — its subject, which cannot renumber. If a future round
inserts a residual ahead of it, **update this note and leave the record
untouched.** The same instruction governs the ADR-0019 record above, whose scope
clause names its residual by subject already.

**What this settles.** Nothing in this spec changes — which is the point of
choosing A, and was stated as such when the question was put. Every table
already describes option A: **B5** and **B5a** fall through to **B3**, the note
is preserved and reverted, the run continues and commits every other note. **An
implementer implements what these tables say and does not invent a third path.**

**What it does NOT settle**, stated so nothing reads as closed that is not:
**residual 11 remains open as a residual.** The pre-revert race is disclosed,
pinned by Table T row **RP-1**, and *not fixed here*. The decision is that this
WP does not fix it, not that it is gone.

### The problem, retained because the decision only makes sense with it

Every withhold ends in a destructive operation — `git checkout HEAD -- rel` on a
tracked file, `fs.rmSync` on an untracked one. Everything that makes that
destruction safe is a *check performed earlier*: K3's preserve, K4's identity
comparison. **A save landing between the check and the destruction is destroyed,
and no check can close that window**, because the check is always at T0 and the
destruction always at T1. On an untracked note the loss is irreversible.

**Two facts bound how alarming this is, and both are verified.** (1) **The race
is inherited, not created here** — shipped `main` reads the file at
`validate.js:654` and then reverts, on every withhold, for every severity, since
WP-123. (2) **K4 still helps**: it converts a *known* stale copy into an abort,
and never yields a worse outcome than its absence.

### The rejected alternative, retained as the considered-and-rejected record

**This table is not a live choice. It is the record of what was weighed**, kept
because a decision whose alternative has been deleted cannot be audited — and
because if a later round proposes option B again, it must argue against this,
not rediscover it.

| | option | what it does | what it costs |
|---|--------|--------------|---------------|
| **A — keep the fall-through** — **DECIDED 2026-07-27** | a failed redact arm falls through to B3 and withholds, exactly as the owner approved | the note is preserved and reverted; the run continues and commits every other note | **the inherited race remains on these paths**, disclosed as residual 11 |
| B — abort every redact-arm fall-through — **REJECTED** | B5 and B5a stop raising a withhold and raise a `WienerdogError` instead — the whole dream run ends, nothing is committed | zero data-loss risk on the new paths, and a large simplification: **K4, R0b, FI-10, FI-11, FI-17, FI-18, FI-19, RP-1, consequence 2's entire delete machinery, accepted residual 10b, and mutations M-31, M-45, M-49, M-50 and M-51 would all lose their subjects or collapse** | **it deletes a behaviour the owner's approval names verbatim**, and one note's scrub failure costs the whole run's commits |

**Why it was the owner's call rather than the architect's.** The first
`OWNER-RATIFIED` blockquote's scope reads, in its own parenthetical:
*"preserve the unredacted original first, scrub only the added lines second,
and fall through to withhold if the preserve failed"* (quoted as written; the
emphasis in the paragraph below is mine, not the approval's). **Option B would
have removed precisely that last clause.** The round-4 post-approval rule lets
the architect record a *content* change to an approved row; that would not have
been a refinement of B5 but the deletion of the behaviour the approval
describes. The standing rule — *a signed approval is scoped by what was put to
the owner* — pointed the same way. There was also an observable-behaviour change
beyond B5: under option B a single note's scrub failure ends the run, so notes
that were fine lose their commit.

### The recommendation the owner approved

1. **Option B buys a guarantee against a race it does not own.** The window it
   closes on the fall-throughs is the same window `main` already ships on every
   withhold. Closing it *there* — where it actually lives — is worth doing, and
   is worth doing properly: **take the file by `rename(2)` instead of reading it
   and trusting the read**, so the gate captures bytes by removing the path
   rather than by inspecting it. That fixes every severity at once. It is a
   change to shipped withhold behaviour, so it is its own WP —
   **`WP-ep2-atomic-withhold-handoff`**, now filed as a Draft stub at
   `docs/specs/WP-ep2-atomic-withhold-handoff.md` with this ruling as its
   mandate.
2. **Option B's blast radius is the wrong shape.** A scrub failure is a
   *per-note* problem; ending the whole run makes it a per-run one. Rows R0, R0b
   and R9 already abort, and they do so precisely because on those rows there is
   **no safe alternative** — here there is one, and it is the behaviour the
   owner approved.
3. **The simplification was real and was not dismissed.** It was put to the
   owner as a genuine trade — roughly a third of this spec's failure machinery
   against his approved behaviour — and he kept the behaviour.

## The threat model — this is the review criterion, not a suggestion

**Ratified as ADR-0034** (`docs/adr/0034-accidental-persistence-threat-model.md`,
`Status: Accepted`; ratified by the owner in session on 2026-07-25, transcribed
by an agent — the merge gate additionally requires an owner-written
`OWNER-SIGNED` line, see V-11). ADR-0034 is the canonical source
for everything in this section; the text below is this spec's inline copy,
because an implementer reads only this file (the One-Document Rule, ADR-0005).
ADR-0034 is Accepted and therefore immutable — if a review would change what
this section says, that is a new-ADR event, not a spec edit.

**This section is byte-identical in both legs of this epic** —
`WP-secret-fence-two-tier-detector` (the detector) and
`WP-secret-fence-ep2-redact-arm` (the EP2 gate). Each leg's verification step
V-18 checksums it against the same literal digest, so an edit to either copy is
caught by that leg's own suite. If you believe it needs to change, that is the
new-ADR event named above, not an edit here.

**Every previous review round on this problem was implicitly judged by "can you
construct a string that slips through?" That criterion has exactly one fixed
point — quarantine everything that looks random — because a 44-character random
API key and a 44-character random Google Doc id are byte-distribution
identical. No algorithm separates them.** The predecessor spec ran six rounds
and produced a fail-open critical in five consecutive ones, not because its
rules were bad but because the criterion was unwinnable. The loop could only
converge on today's behaviour, which is measurably unusable. This section exists
so that reviewers judge against a fixed model instead of producing
counterexamples.

**IN SCOPE: accidental credential persistence.** The user pasted a key into a
session; the dream must not copy it verbatim into plaintext markdown in the
vault.

**OUT OF SCOPE: deliberate adversarial exfiltration.** An attacker who wants a
key in the vault — for example via prompt injection in a transcript — encodes it
trivially: split across two sentences in 12-character pieces, spelled word by
word, wrapped in a benign-looking URL. On a free-text LLM-authored channel the
number of covert channels is unbounded, so **no content filter can stop
deliberate exfil.** Today's strict filter does not stop it either; tightening
only taxes the honest path. Containment of a missed secret is ADR-0025's
hermetic runtime profile (the dream brain has no network and no Bash) and
ADR-0026's capability broker (the model cannot self-authorize an external send)
— not this scanner. ADR-0024 already says this in its "Boundary statement (the
A5 residual)".

Three consequences, binding on this spec and on its review:

1. **For accidental persistence, format + context detection is sufficient.**
   Real credentials have formats. Providers added prefixes (`sk-ant-`, `ghp_`,
   `AKIA`, `GOCSPX-`, `glpat-`, `npm_`) *precisely so that scanners can find
   them*. That is the design point the industry converged on, and it is what
   gitleaks — 222 rules — is built out of.
2. **A hypothetical "credential that happens to look exactly like a file path or
   a doc id" is adversarial input by definition, therefore out of scope,
   therefore not a valid objection to a rule in this spec.**
3. **Live verification is out of scope and stays out.** trufflehog-style
   verification (calling the provider to check whether a key is real) would mean
   sending key-suspicious material to the network from a job whose entire
   security argument is that it has no network. That is its own risk class and it
   violates ADR-0004's just-files, no-network ethos. Do not propose it.

### Copy this block verbatim into the Codex review brief and the wd-reviewer brief

The threat model must travel with the review, not live only in this file. If it
lives only here, the next round reboots the "find a bypass" game — the failure
that cost six rounds. Paste this, unedited, into the brief for every review of
this WP:

> **Review criterion for every work package implementing the secret fence under
> ADR-0034 (epic `secret-lifecycle`) — ratified as ADR-0034 (Accepted,
> 2026-07-25). This is a decision, not a proposal; a reviewer who disagrees with
> it is asking for a new ADR.** In scope:
> accidental credential persistence (a user pasted a key into a session; it must
> not reach plaintext markdown in a git-tracked vault). Out of scope: deliberate
> adversarial exfiltration — an attacker who wants a key in the vault splits,
> spells, or re-encodes it, and no content filter on a free-text LLM channel can
> stop that; containment is ADR-0025/ADR-0026, not this scanner.
> **Therefore: a counterexample string that a human deliberately shaped to evade
> a rule is NOT a finding.** A finding must be one of: (a) a real, named,
> published credential format that the change stops catching relative to today's
> shipped detector; (b) a false positive class measured on real user prose; (c) a
> defect in the code, contracts, or verification as specified. Report anything
> else under "observations", not as a blocking finding.

## Current state

### Capture point — read this before you report a line number as wrong

**Every executable claim in this document — line numbers, greps, digests,
"today" behaviour — was RE-VERIFIED against `main` at `cea31e0` on 2026-07-27,
which is the capture point of this revision.** The design claims were originally
read at `efd1489` on 2026-07-25.

**This is capture-drift instance seven of seven in this epic, and naming it once
is cheaper than patching it finding by finding.** The `0.11.0` batch merged on
2026-07-26–27 and moved `main` underneath both legs of this split. Three
consequences landed on *this* file, and round 1 of the design gate found all
three plus four dependent citations:

- **`src/cli/dream.js` gained three lines** at ~`:382` (the `schedulerLine`
  cache fix), so `:574 → :577`, `:613 → :616` and `:382 → :385`.
- **`docs/THREAT-MODEL.md`'s stance clause was REWRITTEN** by
  `WP-stance-authority-containment`, and the A5 residual moved from `:416` to
  `:427`. **This one was not merely a moved line — it was a hard deadlock.**
  V-27's positive sentinel for the stance clause grepped for a sentence the
  stance WP deleted, so V-27 exited 1 before an implementer could write a line,
  while this WP's own Deliverables row and V-27's failure text both forbade
  touching the region that would fix it. The sentinel is re-derived from today's
  clause below.
- **Completed specs relocated into `docs/specs/done/`**, so the precedent
  citation for a clause-scoped `docs/THREAT-MODEL.md` Deliverables row moved
  both path and line.

**What that means for you as the implementer.** A line number in this document is
a *convenience*, re-pinned at the capture point above; the **content** beside it
is the contract, and where a citation could rot again it is now written
content-first. If a cited line has moved but the content is where the document
says it is, that is drift and you report it — you do not stop. If the **content**
is not there, that is a spec bug: stop and say so. **Digests, greps and
permitted-removals heredocs are different: those are gates, and a red one is
never drift you may work around.**

The `validate.js`, `dream.js` and `digest.js` claims below were read at commit
`efd1489` on 2026-07-25, re-verified at `cea31e0` on 2026-07-27, and are
unaffected by leg 1. **`src/core/dream/validate.js`, `src/core/digest.js`,
`src/core/private-fs.js` and `src/core/dream/ledger.js` are byte-unchanged
between the two commits**, so every line number in those four holds exactly; only
`src/cli/dream.js` moved. The detector description is
the state **after** leg 1 merges, which is the state you will find on `main` —
`WP-secret-fence-two-tier-detector` is this WP's `depends_on` and V-16 verifies
it before you change anything.

**`src/core/secret-scan.js`, after leg 1.** You do not need to read leg 1's spec;
everything this WP consumes is in **Table P** below, and Table P is checked by
V-16. In one paragraph: the module exports `scanAndRedact(text) -> {text,
findings}` where each finding is `{label, severity, count}` and never carries the
matched bytes; `redactOnly(text)` which is `scanAndRedact(text).text`; and
`hasHardFinding(findings)` which returns `true` iff any finding has severity
`quarantine`. **Nineteen labelled rules all emit `quarantine`.** *(Corrected in round 1 of the design gate: this sentence sits under the heading "after leg 1" and states the POST-merge total, which is the 18 shipped rules PLUS the `basic-auth` rule leg 1 adds as its Table A row A16. Nothing in Table P pins a rule count — P2 counts `SEVERITY.REDACT` producers, not rules — so V-16 could not catch the off-by-one, which is why it is stated here rather than only fixed.)* Behind them a
two-tier entropy pass emits the single label `high-entropy` at **either**
severity: `quarantine` when a sensitive keyword binds to the candidate through a
separator on the same line, `redact` otherwise. Severity is the **maximum** over
a label's occurrences, so a note mixing both arms reports `quarantine` regardless
of which arm fires first in the text. **`redact` therefore has exactly one
producer, and it is the context-free entropy tier** — that is the whole reason
this gate can safely branch on severity.

**`src/core/dream/validate.js`** (1033 lines).

- `quarantinePreserve(stateDir, vaultDir, rel, date)` (lines 650–676) — copies
  the working-tree bytes of `rel` into `<stateDir>/quarantine/` (dir 0700, file
  0600, atomic tmp+rename, name `<date>-<sanitized-basename>` with a numeric
  suffix before the extension on collision). Returns `false` on any failure,
  including a missing `stateDir`. **The directory is hardcoded at line 655.**
  **The destination basename it computes is not returned to anyone**, and it is
  not reconstructible by the caller: `displayName(rel)` (`src/core/dream/ledger.js:319`)
  is `path.basename(foldKey(rel))` — a **bare, lower-cased basename with the
  directories thrown away** — so `01-Projects/a/current-state.md` and
  `01-Projects/b/current-state.md` produce the same `<date>-current-state.md`
  and the second one silently becomes `<date>-current-state-1.md` through the
  `for (let n = 1; fs.existsSync(dest); n += 1)` loop at lines 662–664. With
  D2's per-pass redaction count this is a routine occurrence, not a corner case.
  **It never throws**: the whole body is inside one `try` and the `catch` at line
  670 removes the temp and returns the failure value, so Table R's `P` column is
  total over its two outcomes.
- Step 3, the EP2 gate (lines 897–956). Line 904 `git add -A`; lines 908–913
  walk `git diff --cached --name-status -z`; line 921 uses `--numstat` to detect
  binary; lines 927–932 build `added` from the `-U0` diff's `+` lines; **line 934
  `const { findings } = scanAndRedact(added);` and line 935 `if (findings.length
  === 0) continue;`.** **Severity is never consulted anywhere in this file** —
  `hasHardFinding` is not imported (line 14 imports `scanAndRedact` only) and
  has no caller in `src/`. Lines 940–949 preserve, revert and count.
- **Line 947 is `reverted.push({ path: rel, reason })`, unconditional inside
  that loop** — line **946** is the preceding
  `if (!preserved) reason += ' (quarantine copy failed)';`, which is B3's frozen
  reason-suffix and must not be disturbed. Earlier revisions of this spec cited
  946 for the push in four places; every one of them meant 947. And `reverted` is
  *not* a private counter: Step 4 renders it into
  the report's `## Reverted by orchestrator` section, and it is returned as
  `res.reverted`, which `src/cli/dream.js:616` prints to the user as
  `` `${res.reverted.length} reverted` ``. A redact-arm file left on that line
  would be announced as "reverted" in both places while in fact being committed.
- **The hunk headers this WP parses are `git diff -U0` output, and their shape
  is not what a first reading suggests.** Executed against a real repository on
  2026-07-26 — `git init`, commit `a\nb\nc\n`, then stage each change and read
  `git diff --cached -U0`:

  | change made | header git actually printed |
  |-------------|-----------------------------|
  | insert one line | `@@ -2,0 +3 @@ b` |
  | replace one line with one line | `@@ -2 +2 @@ a` |
  | replace one line with two | `@@ -2 +2,2 @@ a` |
  | delete one line | `@@ -2 +1,0 @@ a` |

  **git omits `,<count>` on either side whenever that side's count is 1** — so
  `,d` is absent on both of the first two rows, and on the second row `,b` is
  absent too. A header also carries a trailing function-context string after the
  closing `@@`. Today's code (lines 927–932) never reads a hunk header at all; it
  filters `+` lines out of the whole diff and joins them, so none of this has
  ever mattered before and **there is no existing helper to copy**.
- Step 4 (lines 958–975) appends `## Reverted by orchestrator (policy
  enforcement)` to the dream report at `<reports_dir>/<date>.md`, one
  `` - `<path>` — <reason> `` line per entry, or `- none`.
- The return value (lines 1016–1023) includes `secretReverts`.

**`src/core/private-fs.js`** (1014 lines) — the single enumerator behind
`wienerdog doctor`'s warnings, `wienerdog sync`'s `repairPrivateModes`, and the
digest's insecure-modes banner. `A5_PRIVATE_DIRS` (lines 104–110) lists
`path.join(paths.state, 'quarantine')` **because it can hold raw secret bytes**,
and `listPrivateEntries` (lines 655–657) enumerates its *direct* entries only.
`classifyPrivatePath` (line 442) returns `null` — **skip, not anomaly** — when a
path is offered as `kind === 'file'` but is a directory. A new
`state/quarantine/redacted/` subdirectory and **everything inside it** would
therefore be invisible to all three surfaces. Demonstrated at `efd1489`: with
`state/quarantine/redacted/` at `0755` holding a `0644` file, `insecureEntries`
returned `[]`; loosening `state/quarantine/` itself and a file directly in it
returned both paths. Note also the comment at line 666, which says the real
private tree is "depth 3" — a claim this WP makes false.

**`src/cli/uninstall.js` / `src/core/manifest.js`.** `disposeCoreMechanics`
removes `paths.state` with `fs.rmSync(dir, { recursive: true, force: true })`,
so a subdirectory of `state/quarantine/` is disposed with it (ADR-0019).
**Neither file changes in this WP, and that is now a DECIDED outcome rather
than an assumption** — see "ANSWERED — 2026-07-27" under OWNER DECISION
REQUIRED, where the owner chose **option C** (make the promise honest inside
this WP) with **option B** (the ADR-0019 amendment and an uninstall
export/warn step) filed as `WP-adr-0019-quarantine-uninstall-export`. Until
that follow-on lands, `wienerdog uninstall` destroys the pre-scrub originals
along with everything else under `state/`, and Table Q rows **Q4** and **Q6**
and accepted residual **12** are what say so to the user. *Round 2 of the
design gate found this sentence stating "no change is needed there and none
is in scope" as settled fact while the question was open above it — a
Current-state paragraph pre-empting an owner decision the same document was
reserving.*

**`src/cli/dream.js:577`** reads `res.secretReverts` and, when it is non-zero,
**defers** this run's transcripts instead of marking them processed
(`WP-secret-revert-defers-ledger`, shipped in `efd1489`). Three deferrals, then
a loud quarantine. This is why the counter's meaning is load-bearing: it means
"content this run produced was NOT committed."

**`src/core/digest.js`.** `listSecretQuarantine(stateDir)` (lines 605–615) does
`fs.readdirSync(path.join(stateDir, 'quarantine'))` — **no `withFileTypes`, so
it does not distinguish files from subdirectories** — filters dot-prefixed
entries, sanitizes and sorts. Its result feeds the banner at lines 573–577:

```text
> [!warning] Wienerdog: N dream note(s) were withheld from your vault because they appear to contain a secret — <names>. Review the copies in state/quarantine/: restore what you meant to keep, delete the rest; this notice clears when the folder is empty.
```

Callers: `src/cli/dream.js:385` and `src/cli/sync.js:281`. **That quotation is the
text on `main` and it must stay in this section exactly as it is** — Current state
describes the repository before the change. **Both halves of its closing sentence
become false when this WP lands**, and its replacement is decided in **Table Q row
Q1**, not here: "delete the rest" would destroy `redacted/`, and "clears when the
folder is empty" names a state that no longer exists. Nothing in the suite asserts
this string today (verified 2026-07-26).

**Tests.** `npm test` is `node tests/run.js`, which is the **only** place
`WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set (`tests/run.js:7`). `npm run lint` is
`node scripts/lint.js`. `tests/unit/dream-validate.test.js` asserts
`res.secretReverts` at fourteen sites (lines 970–1178, at `efd1489`).
`tests/unit/digest.test.js:666` covers `listSecretQuarantine`.

**One existing test changes meaning and you must find it.** At `efd1489`,
`tests/unit/dream-validate.test.js` has a case named *"EP2 false positive
(high-entropy blob) is a visible quarantined revert, not a silent rewrite"* whose
fixture is `'ref q7PmXz4KvR9tWc2LbN8dYfGh in prose\n'`. Under leg 1 that run
binds no context, so it is a `redact` finding — and it passed unchanged through
leg 1 only because EP2 still reverted on any finding. **Under this WP it becomes
a Table B row B4 case**: preserved to `state/quarantine/redacted/`, scrubbed in
place, committed, `secretRedactions` incremented, `secretReverts` **not**. Rewrite
that test to assert the new disposition; do not delete it. Its old name is now
false and its assertion `!res.committed.includes(...)` is now wrong. Every other
secret fixture in that file is a labelled-rule hit at `quarantine` severity and
keeps today's behaviour byte for byte.

## Derived measurements — copied, not re-measured

This WP asserts no vault measurement of its own. Two figures from the real-vault
corpus are load-bearing for decisions below, and they are **derived copies**.

**Where they are decided.** Not here, and not in leg 1's spec either: in
**ADR-0034**, `Status: Accepted`, on `main`, evidence blocks **E1** and **E3**.
ADR-0034 is the hub both legs pin to, so neither leg has to read the other's spec
to stay correct (the One-Document Rule, ADR-0005). **Verification step V-17 greps
ADR-0034 for these exact figures**, so if a future errata amendment moves one, this
WP's verification goes red rather than this table quietly going stale. Leg 1's own
V-15 greps the same lines, which is what forces the two legs to agree.

| id | figure | decided in | why this WP needs it |
|----|--------|-----------|----------------------|
| D1 | 182 notes scanned; **102** of them (56.0%) contain at least one finding and are reverted by EP2 today | ADR-0034 **E1**, as amended by errata **ER-4** | the size of the problem this gate closes; quoted in the Context of both legs |
| D2 | end state after **both** legs: **1** note withheld, **9** scrubbed in place, **172** untouched — per full-vault pass | ADR-0034 **E3**, as amended by errata **ER-5** | the rate that sets the retention cap (Table B rows B12/B13) and the reason a redaction gets no digest banner |

**Re-derived 2026-07-26 — and this is the mechanism working, not a defect.** Both
rows carried slightly different figures until this revision. While it was being
written the architect filed a dated errata amendment inside ADR-0034 (**ER-4**
and **ER-5**):
the vault is live, it grew by one note between 2026-07-25 and 2026-07-26, and the
figures were re-measured against the shipped detector at `efd1489`. **V-17 went
red and that is how this was found** — the D-table was stale against its own
deciding surface within hours of being written. Every structural fact ER-4 lists
is unchanged — the finding count, the disposition split, the `high-entropy`
occurrence count, the single `aws-key` hit, E2 reproducing byte-identically —
**and those figures are deliberately not restated here**, because V-17 pins only
the D1 and D2 rows and a number this paragraph carried would be an unpinned
mirror of ADR-0034. Read them in ER-4. So no argument in this spec moves: the withheld and scrubbed rows of D2 are untouched
and only the untouched-notes total shifts by one. Nothing here was re-measured by
this spec; it was re-derived from the amended ADR, which is the only legal
direction.

**Do not re-measure these and do not restate them anywhere else in this
document.** Every other surface here cites `D1` or `D2`. If you believe one is
wrong, that is an errata amendment inside ADR-0034, made by the architect — never
an edit on the spec side alone, which is the mirror-promotion failure ADR-0031
exists to prevent.

## Deliverables (permission boundary — touch ONLY these)

<!-- This spec file itself and package-lock.json are always exempt. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | EP2 consults severity (**Table B**); the redact arm and its outcome matrix (**Table R**); `quarantinePreserve` gains a `kind` argument and **its return shape is the one its `@returns` decides** — the buffer is the arm's single source of truth, see **ONE CAPTURED BUFFER**; **the redact arm passes that buffer to `scrubAddedLines` instead of re-reading the target, and `scrubAddedLines` re-reads it exactly once more, immediately before the rename, ONLY to compare against it — a byte mismatch aborts without renaming (row **R7c**); a throwing comparison read aborts as row **R2** — **Table K row K2 owns the split and this cell restates neither outcome****; **the withhold path gains row B3b — the ABORT, whose condition is a BYTE-IDENTITY test and not a copy-existence one**: when B3's own preserve returns `null` after any redact-arm fall-through **and no durable copy of the target's CURRENT bytes can be shown to exist**, the gate aborts without reverting, removing, or clearing the index entry. Two ways in — the redact preserve also failed (**row R0**), or it succeeded but the identity read shows the file now differs from the captured bytes, or cannot be read at all (**row R0b**). **Table B row B3b and Table K row K4 decide the test; this cell restates neither.** *Round 5's version of this cell specified the SUPERSEDED copy-existence condition — verbatim what mutation M-49 mutates TO — so an implementer building from it would have shipped the loss path the same commit closed elsewhere;* `scrubAddedLines` performs the **index-first stage** internally between its temp write and its rename (**row B10**, three `allowFail` git calls); the B5/B5a fall-through deletes the `redacted/` copy only under the guards **Table R consequence 2** decides — **including a `Buffer.compare` of that copy against B3's own withheld copy**, without which a note edited by its owner between the two preserve reads loses its only pre-edit copy — and appends that consequence's extra reason suffix in the **two** combinations where it keeps the copy; the untracked withhold branch stages its own removal (**row B3a**); retention prune; the dream-report redaction subsection. **`module.exports` gains exactly one name, `scrubAddedLines`** — required by **Table T**, which decides why; `quarantinePreserve` stays private. **And one comment correction, decided in Table Q row Q17 and nothing else in that block:** the Step-3 header comment at `:900-903` states this WP's exact negation twice — `ANY detector finding … quarantine-preserves the working-tree file, then reverts it`, and `` the sanitized `.text` is never written back (revert, never rewrite) `` — four lines above the code it describes, and the second is **Q10's second sentence in the same words**. `:897-899` stay byte-identical. Bounded by **V-28**, mutated by **M-33** |
| modify | src/core/digest.js | **three edits, all decided in Table Q and nothing else in the file.** (1) `listSecretQuarantine` lists **files only**, so the new subdirectory never enters the withhold banner. (2) **the withhold banner's closing sentence** (line 576) — today it tells the user to "delete the rest" of `state/quarantine/`, which after this WP destroys `redacted/`, and it promises the notice "clears when the folder is empty", which after this WP is a state the user cannot reach. Exact replacement in **Table Q row Q1**. (3) **the two comment lines at `:567-568`** that state the same banner lifecycle in code (`renders while state/quarantine/ is non-empty and clears itself once the owner empties the directory`) — both halves false after edit (1), and a stale comment beside a corrected string is how the next round re-derives the wrong contract. **Table Q row Q14** |
| modify | src/core/dream/ledger.js | **one sentence, in `quarantineBannerLine`'s `secret-revert-exhausted` banner at line 368, and nothing else.** Today it tells the user to "delete the rest" of `state/quarantine/`; after this WP obeying it destroys `redacted/`. Exact replacement text in **Table Q row Q2** |
| modify | tests/unit/ledger.test.js | the one pinned copy of that banner sentence (line 429). No other assertion in the file changes |
| modify | src/core/private-fs.js | bring `state/quarantine/redacted/` inside the A5 private tree: one entry in `A5_PRIVATE_DIRS`, one guarded `listNames` block in `listPrivateEntries`, the `A5_PRIVATE_DIRS` doc comment at `:101-102` (**whose wording is Table Q row Q15's**, not this row's — the obvious phrasing is one Q6 outlaws), and the stale "depth 3" sentence in the `MAX_DIR_REPAIR_PASSES` comment. See "The private-tree extension, exactly" below |
| modify | tests/unit/dream-validate.test.js | EP2 redact-arm cases; **every row of Table R** (thirteen rows, thirteen tests — round 1 added **R0** and **R7c**, round 5 added **R0b**); the `secretReverts`-vs-`secretRedactions` split; the one existing case whose meaning changes (see Current state). **The fault-injection seams live entirely in this file** — `require.cache` surgery on the collaborator modules and in-place patches of `node:fs`, both decided in **Table T**. Nothing under `src/` is edited to make a fault reachable |
| modify | tests/unit/digest.test.js | `listSecretQuarantine` ignores subdirectories; **and one new assertion pinning the withhold banner's rendered text** (Table Q row Q1). Verified 2026-07-26: `grep -rn 'were withheld from your vault' tests/` returns nothing, so **the banner's sentence text** is unasserted today — its count, its sanitized basenames, its placement in the prefix and its survival through the cap **are** covered, at `tests/unit/digest.test.js:624-664` (the cap-survival assertions are `:662-663`; an earlier revision of this cell cited `:661`, which is that test's closing brace), and none of those assertions changes |
| modify | tests/unit/private-fs.test.js | `state/quarantine/redacted/` and a file inside it are scanned and repaired |
| modify | docs/runbooks/secret-incident.md | **three edits, all required, and nothing else**: (1) step 3's existing `state/quarantine/` bullet has its two banner-lifecycle claims corrected (**Table Q row Q3**) — it says the banner shows "while this folder is non-empty" and "clears once the folder is empty", both false after this WP; (2) step 3 gains a second bullet, the recovery path for `state/quarantine/redacted/` (**Table Q row Q4**); (3) step 5's "Confirm `state/quarantine/` is empty" bullet is corrected (**Table Q row Q5**), because after this WP that folder is never observably empty. See "The recovery runbook" below for the required content of all three |
| modify | docs/GLOSSARY.md | the **secret scan / `scanAndRedact`** entry's **gate sentences** and the **secret quarantine** entry — see "The glossary edit, exactly" below. The detector sentences in the first entry are leg 1's and must not be touched |
| modify | docs/THREAT-MODEL.md | **two clauses in the A5/T4 secret-lifecycle section, and nothing else in the file.** (1) gate **(ii)**'s two sentences at `:130` — `**Any** detector finding — redact- or quarantine-severity alike — reverts that file rather than committing it` and `` The sanitized `[REDACTED]` text is **never** written back as a silent rewrite of the user's own note `` — the exact negation of this WP (**Table Q row Q10**). (2) the banner-lifecycle clause at `:134`, `` a pending-review notice while `state/quarantine/` holds files `` (**Table Q row Q11**). **Do NOT touch the production/dev STANCE CLAUSE** — the sentence beginning `**production/dev stance** matches, where the stance is decided by containment alone` and ending `a disagreement between the bound and live stance is refused in either direction.` (at `:277-282` on today's `main`; **the content is the boundary, not the line range**). That clause belongs to `WP-stance-authority-containment`, which carries its own clause-scoped Deliverables row for this file — now at `docs/specs/done/WP-stance-authority-containment.md`, the row reading `\| modify \| docs/THREAT-MODEL.md \| **D7** — the stance clause …`. *Round 1 of the design gate re-pinned this twice over: the clause was REWRITTEN by that WP (it used to end `is refused, never silently downgraded to the unverified dev path`, which no longer occurs in the file at all), and its spec moved into `done/`. Both citations are now content-anchored, because a line-number citation into another spec rots every time a spec completes.* "Helpfully" widening into that clause is a permission-boundary violation, not a favour. **Do NOT touch gate (iv) or the A5 residual** — `:132` and `:427` on today's `main`; Table Q rows **Q12** and **Q13** record why both stay byte-identical. Bounded by **V-27** |

**Do not create, modify or delete anything else.** In particular:

- **not `src/core/secret-scan.js`.** The detector is leg 1's
  (`WP-secret-fence-two-tier-detector`), it is already on `main`, and this WP
  consumes it through **Table P**. If you find yourself wanting to change a
  severity, a threshold or an alphabet to make a gate test pass, stop: the gate
  is wrong, not the detector.
- **not `src/cli/dream.js`** — its `secretReverts` semantics must not change (see
  Table B row B7 and rows B8/B9), and that is why `secretRedactions` is a
  separate field that nothing reads yet.
- **not `tests/integration/dream.test.js`.** Its line 1437 asserts
  `The withheld copies are in state/quarantine/` as a **substring**, and the
  replacement sentence in "The exhausted-transcript banner, exactly" keeps that
  prefix byte-identical precisely so this file needs no edit. If you find
  yourself wanting to change it, the wording is wrong — not the test. **V-24
  fails the run if this file appears in the changed set.**
- not `src/cli/sync.js`, not `src/cli/uninstall.js`, not `src/core/manifest.js`
  (`disposeCoreMechanics` already removes `state/` recursively — see Current
  state, and the owner's **option C** ruling recorded under OWNER DECISION
  REQUIRED; changing that disposal is the follow-on WP's, not this one's —
  state), not `tests/unit/secret-scan.test.js`, not
  `tests/unit/secret-fence.test.js`, not `tests/fixtures/secret-corpus.js`,
  not `tests/unit/sync-digest-quarantine.test.js` (it asserts only
  `are no longer being dreamed over`, which does not move), not
  `scripts/measure-secret-fp.js`, not `docs/adr/*`, not any other spec, and
  no part of `docs/runbooks/secret-incident.md` outside the three edits its
  Deliverables row names, and no part of `src/core/dream/ledger.js` or
  `tests/unit/ledger.test.js` outside the one banner sentence theirs name, and
  no part of `src/core/digest.js` outside `listSecretQuarantine`, the one
  banner line **Table Q row Q1** replaces and the two comment lines **Q14**
  replaces, and **no part of `docs/THREAT-MODEL.md` outside the two clauses its
  row names** — in particular not the production/dev **stance clause** (`:277-282`
  on today's `main`, and identified by its content in that row rather than by
  those numbers), which belongs to another spec,
  and not `docs/runbooks/incident.md`, which names the folder twice and says
  nothing this WP falsifies (**Table Q row Q16**).
- **not `memory/lessons/inbox.md`.** CLAUDE.md forbids editing it on a WP branch
  (parallel branches conflict on merge); report your lessons as bullets in the PR
  body. The shared `scripts/boundary-check.js` allows this path unconditionally,
  so **V-25 is the check that catches it** and it runs before the delegation.

### The glossary edit, exactly

Leg 1 rewrote the *detector* half of the **secret scan / `scanAndRedact`** entry
in `docs/GLOSSARY.md` and deliberately left two sentences about the *gates*
untouched, because they were still true after leg 1. This WP is what makes them
false, so this WP is what rewrites them.

**The two sentences to replace are the gate half of that entry** — they begin at
the word `Two` (as in "`Two` severities, `redact` and `quarantine`, but the
*persistence* gates …") and run to the end of the entry, `…no shipped gate
branches on it today.`

**You will NOT find them wrapped the way an earlier revision of this section
printed them, and that is the whole of round 1's finding here.** The previous
revision reproduced `docs/GLOSSARY.md` lines 77–82 verbatim **as they stand at
`efd1489`**, explained that line 77 is *shared* (leg 1's sentence ending
`…never stores the matched secret bytes.` followed by the gate half's first word
`Two`), and then hard-coded those six lines into V-22's permitted-removals list.
**That describes a file state you will never see.** Leg 1 ships first, and leg 1's
glossary edit is an *insertion* placed immediately after `…a finding never stores
the matched secret bytes.` and immediately before `Two severities, …` — so leg 1
necessarily destroys the composite line, and under **every** reflow the line
carrying `Two` that you must remove is a line **leg 1 created**. A byte-exact
list written against `efd1489` therefore rejects a *correct* implementation of
this WP.

It was also a One-Document-Rule break: the fact needed to write that list
correctly — what leg 1 does to that line — lives only in leg 1's spec, which you
are forbidden to open.

**So V-22's permitted-removals list is EXTRACTED FROM `$BASE` BY CONTENT at run
time, exactly as V-27's already is**, and this section prints no line numbers and
no wrapping. What is protected, and how:

- **leg 1's half of whatever line it ends up sharing** is held by a **positive**
  grep for `a finding never stores the matched secret bytes`, which your rewrite
  must leave somewhere in the entry. That grep does not care how the line wraps.
- **the gate half you are removing** is matched by extracting, from the merge
  base, every line of the entry from the one containing `Two` through the one
  containing `no shipped gate branches on it today` — whatever leg 1 left them
  looking like.
- **both ways out of the shared line still pass**: a rewrite that starts at `Two`
  and removes that line, and a rewrite that leaves the line byte-identical and
  starts on the next one.
- **the detector sentences leg 1 wrote** are protected by the bound itself —
  they are not in the extracted list, so removing one fails V-22. Do not reflow
  them.

They must become, in the glossary's existing voice and saying no more than this:

- the **staged-output gate (EP2) branches on severity** via `hasHardFinding`: any
  `quarantine` finding still withholds and reverts the whole note; a findings set
  with no `quarantine` finding is **redacted in place** — the unredacted original
  is preserved first, then only the lines that run added are replaced with their
  sanitized form, and the note is committed;
- **the digest-section gate (EP4) is unchanged** and still omits a section on any
  finding of either severity;
- the input and log/alert paths still use `redactOnly` (inline redaction of every
  match).

Then update the **secret quarantine** entry so it names both destinations. **Its
wording is decided in Table Q row Q6**, because the obvious phrasing is false on
the fall-through rows: `state/quarantine/` for a withheld note (unchanged,
unbounded, bannered) and `state/quarantine/redacted/` for the pre-scrub original
of a note **whose added lines the gate rewrote** — not "of a note that was
committed", which Table R rows R2–R7c make false while the copy briefly exists.
No banner, capped — Table B rows B7 and B12. Keep its closing sentence pointing
at `docs/runbooks/secret-incident.md`.

**Put no number in the glossary** — not the cap, not a rate. **Table N row N1**
decides the cap; the glossary is a naming document.

### The exhausted-transcript banner, exactly

**The replacement text is decided in Table Q row Q2, not here.** This section
carries only the argument for why the change is bounded to two files; if it and
Table Q could be read as disagreeing about a byte, Table Q wins.

**Why this exact shape, and why only two files.** The replacement keeps the
prefix `The withheld copies are in state/quarantine/` byte-identical, which is
what `tests/integration/dream.test.js:1437` asserts as a substring — so that file
does **not** change and is **not** in the Deliverables table. The only other
place the sentence is pinned is `tests/unit/ledger.test.js:429`, which holds the
whole string and is in the table. `tests/unit/sync-digest-quarantine.test.js`
asserts only `are no longer being dreamed over` and is unaffected.

**No other part of that banner changes** — not the count, not the file list, not
the "session files themselves are untouched" sentence, not the callout marker.
V-24 bounds the diff of both files to this single removed line each, exactly as
V-13 bounds the runbook. **This is a factual correction to user-facing copy, not
a new UX decision**; it is not covered by either `OWNER-RATIFIED IN SESSION`
block and does not claim to be. It is registered as a **Table Q row Q2** mirror
and a Table B **B6/B13** mirror.

### The private-tree extension, exactly

**Why this is in scope at all, stated rather than assumed.** `quarantinePreserve`
creates `redacted/` at 0700 and its files at 0600, so the *default* is already
right and nothing this WP writes is world-readable. `src/core/private-fs.js`
exists for the case the default does not cover: **drift** — a permissive umask on
an older path, a restore from a backup that flattened modes, a manual `chmod -R`,
an editor that rewrote the file. Its whole job is to notice that and repair it.
Leaving the new directory outside it would mean `wienerdog doctor` says clean,
the insecure-modes digest banner does not render, and `wienerdog sync` does not
repair — for a **world-readable pre-scrub copy of a credential**. That is a
strictly worse posture than the withhold path this WP is modelled on, and it is
created by this WP, so this WP closes it. The alternative — recording it as an
accepted residual — was considered and rejected: the residual would have been
"the one new place Wienerdog writes raw secret bytes is the one place it does not
check the permissions of", which is not a trade anyone would accept if it were
written out.

Three changes, all inside `src/core/private-fs.js`, and **no new abstraction**:

1. `A5_PRIVATE_DIRS` (lines 104–110) gains one element,
   `path.join(paths.state, 'quarantine', 'redacted')`, after the existing
   `path.join(paths.state, 'quarantine')` element, and its doc comment at
   `:101-102` is extended in the module's existing voice. **The wording is
   Table Q row Q15's, not this bullet's.** An earlier revision of this bullet
   prescribed "the pre-scrub original of a note that **was** committed" — the
   exact phrasing **Q6** outlaws, because Table R rows R2–R7c put a copy there
   for a note the gate then withheld. Q15 says what to write instead; if this
   bullet and Q15 could be read as disagreeing, Q15 wins.
2. `listPrivateEntries` gains one guarded block, **written exactly like the
   existing `quarantine` block at lines 655–657** — same `dirPaths.has(…)` guard,
   same `listNames(…, () => true)`, same `considerFile`. Do **not** generalise the
   walk into a recursive helper: one more literal block matches the module's
   style, and a recursive walk over a private tree is a new symlink-traversal
   surface this WP has no mandate to open.
3. The `MAX_DIR_REPAIR_PASSES` comment (the phrase "depth 3" is on line 666, in
   the block comment spanning lines 664–669) says the real private tree is
   "depth 3" and enumerates its branches. Update it: the tree is now depth 4 via
   `state → quarantine → redacted`. **This is a comment correction, not a
   behaviour change** — the cap is 64, the fixed-point loop discovers a newly
   traversable child on a later pass, and convergence is unaffected.

**Nothing else in that file changes.** In particular no mode, no symlink rule, no
enumerator signature, and no export.

**A second existing test changes meaning and you must find it.** At `efd1489`,
`tests/unit/private-fs.test.js:588` has a case named *"private-fs: the A5-scoped
set matches the OWNER-APPROVED membership"* whose `assert.deepEqual` pins
`A5_PRIVATE_DIRS` to its exact five elements. Adding the sixth makes it fail —
executed and confirmed. **Extend that list; do not weaken the assertion into a
`includes` check.** The whole value of that test is that the A5 membership cannot
grow without someone noticing, and this WP is someone noticing. Its name still
holds: the membership the owner approved is "the private tree, including
everywhere the gate can write raw secret bytes", and the new subdirectory is
exactly that.

### Exact contracts

#### `src/core/dream/validate.js`

**Both helpers' outcomes — every return value, every disk state, every counter —
are decided in one place, `Table R`, and nowhere else.** The signatures below
say what the arguments are; **Table R** says what each call does. Where the two
could be read as disagreeing, Table R wins and the disagreement is a spec bug —
report it, do not resolve it yourself.

```js
/** Preserve the working-tree bytes of `rel` into the private quarantine tree.
 *  @param {string|undefined} stateDir @param {string} vaultDir @param {string} rel
 *  @param {string} date
 *  @param {'withheld'|'redacted'} [kind='withheld']  selects the destination:
 *    'withheld' -> <stateDir>/quarantine/           (unchanged path — the note is NOT in the vault)
 *    'redacted' -> <stateDir>/quarantine/redacted/  (the note IS in the vault, scrubbed)
 *  @returns {{name:string, bytes:Buffer}|null} the destination BASENAME actually
 *    written (`<date>-<stem><ext>`, or `<date>-<stem>-<n><ext>` when the
 *    collision loop fired) TOGETHER WITH THE EXACT BYTES IT PRESERVED, or `null`
 *    on any failure. Outcomes: Table R. */
function quarantinePreserve(stateDir, vaultDir, rel, date, kind = 'withheld')
```

**Why the return carries the BYTES as well as the name (round 1 of the design
gate).** The preserved buffer is the arm's single source of truth: it is what
`scrubAddedLines` scrubs, what the verifying re-scan runs over, and what the
pre-rename comparison in "ONE CAPTURED BUFFER" checks the target against. Reading
the file a second time to obtain it is precisely the TOCTOU the rule closes. `null`
stays falsy exactly where `false` was, so **B3's withhold call site keeps its
`if (!preserved)` shape**; the two consumers of the object are B4's scrub and the
report line's `<basename>` (`preserved.name`).

`kind` is validated against the two literals and anything else throws — it is
code-supplied, never user input, so a typo must fail loudly rather than write to
a third directory. Both directories are created 0700 and both files 0600, by the
existing code path.

**Why the return type changes from `boolean` to the shape its `@returns` decides, rather than the
caller recomputing the name.** The dream-report line below must name the file the
user will open, and **only `quarantinePreserve` knows that name**: it derives
`displayName(rel)`, which throws the directories away (see Current state), and
then appends `-1`, `-2`, … in its own `existsSync` loop when that bare basename
is already taken. Two notes called `current-state.md` in different folders — an
ordinary vault shape — collide on the same date, and D2 puts several redactions
in a single pass, so the collision path is routine. A caller that rebuilt
`<date>-<displayName(rel)>` would print a filename that does not exist and send
the user down a broken recovery path, which is the one path this design exists to
keep open. Returning the real name costs nothing: `null` is falsy exactly where
`false` was, so **the B3 withhold call site keeps its `if (!preserved)` shape
unchanged** and only gains the ability to name the copy.

```js
/** Rewrite exactly the lines THIS run added, replacing each with its sanitized
 *  form. Never touches a line the run did not add — a secret already committed
 *  in HEAD is not rewritten (ADR-0024's "the gate scans the added bytes").
 *
 *  SANITIZATION UNIT: one line at a time. Each added line number L is replaced
 *  by `scanAndRedact(lines[L-1]).text`. NOT the joined blob the gate scanned —
 *  per-line keeps the line count fixed and keeps the rewrite local.
 *
 *  ORDER (INDEX-FIRST — Table B row B10 decides it and says why):
 *    compute → verify → write the sanitized bytes to a same-directory temp →
 *    STAGE the temp's blob in the git index at `rel` → only then rename the temp
 *    over the target. The git index is written STRICTLY BEFORE the working tree.
 *    This helper owns all four steps, including the staging, because they are one
 *    atomic replacement and splitting them across two owners is what let round 5
 *    find a kill window between them.
 *  Every outcome — what is returned,
 *  what the file on disk looks like afterwards, and which Table B row runs next
 *  — is enumerated in Table R. Read Table R; do not infer it from this comment.
 *  NEVER THROWS: like `quarantinePreserve`, the whole body sits in one try and
 *  every exception returns false, so Table R's `S` column is total over
 *  {true,false} and no failure of this helper can escape the matrix.
 *  @param {string} vaultDir @param {string} rel
 *  @param {number[]} addedLineNumbers  1-based line numbers in the NEW file
 *  @param {Buffer} captured  the EXACT bytes `quarantinePreserve` preserved for
 *    this path — the scrub's only input. This helper NEVER reads the target to
 *    obtain its content; it reads it once more immediately before the rename,
 *    ONLY to compare against this buffer — Table K row K2, whose two outcome
 *    columns decide R2 (throw) vs R7c (mismatch). See
 *    "ONE CAPTURED BUFFER, AND A CHANGE CHECK BEFORE THE RENAME".
 *  @returns {boolean} true iff the scrub is verified complete (Table R row R8) */
function scrubAddedLines(vaultDir, rel, addedLineNumbers, captured)
```

**`scrubAddedLines` is the one name added to `module.exports`.** Today that
object has six names (`validateAndCommit`, `parseFrontmatter`, `assertGitRepo`,
`assertCleanTree`, `precommitSessionEdits`, `restoreVaultToHead`); this WP makes
it seven. The reason is decided in **Table T**, not here: three of Table R's cells
— every `byte-unchanged` cell on a `false` return, and fault injection FI-3 — are
**unassertable at gate level by construction**, because by the time the gate
returns, B3 has already reverted the file. Without the export, AC-9's mandated
helper-level assertion has no reachable subject and the implementer would fake or
skip it. `quarantinePreserve` is **not** exported: every cell of its column is
observable at gate level through the contents of `state/quarantine/redacted/` and
the basename in the report line.

**The write must be atomic, and this is the one place that decides how.** A
single `fs.writeFileSync` onto the target **truncates before writing**: an
ENOSPC or EIO part-way through leaves a truncated, half-scrubbed note on disk and
returns `false`, at which point Table B row B5a hands the file to B3 — whose own
`quarantinePreserve(…, 'withheld')` would then preserve the **mangled** file as
"the true original". That is exactly the permanent-corruption outcome option B
exists to prevent, and it would be reached by the code path meant to prevent it.
So `scrubAddedLines` writes the way `quarantinePreserve` already does
(`validate.js:665-668`): a temp file in the **same directory** as the target,
then `fs.renameSync` onto it. Three differences from `quarantinePreserve`, all
required:

- **Mode — and the explicit `chmodSync` is part of the contract, not a flourish.**
  The target is a user vault note, not a quarantine copy. Read its current mode
  with `fs.statSync(target).mode & 0o777` before writing, pass it as
  `fs.writeFileSync(tmp, data, { mode })`, **and then apply it again with an
  explicit `fs.chmodSync(tmp, mode)`**. The `mode` option is a *creation* mode
  and is **filtered by the process umask** — executed 2026-07-26 on this
  machine: `writeFileSync(f, x, { mode: 0o644 })` under `umask 077` produced
  `0600`, and the following `chmodSync(f, 0o644)` produced `0644`. Without the
  second call a 0644 note silently becomes 0600 on any machine with a tight
  umask, i.e. this WP re-permissions the user's own file while claiming not to.
  `quarantinePreserve` already does exactly this pair (`validate.js:666` then
  `validate.js:667`) — the two lines are inside the very range you are copying,
  so copy both. Do not hardcode 0600 here.
- **The index is staged from the temp, before the rename.** Between the write and
  the rename, `scrubAddedLines` stages the temp's *content* at `rel`, so that no
  instant ever exists in which the working tree holds the scrubbed form while the
  index holds the raw one. The three git calls, their `allowFail` requirement and
  the interruption argument are **Table B row B10**; this bullet only records
  that the write is where they sit.
- **Temp name and cleanup.** The temp lives inside the **vault**, which Step 5's
  `git add -A` stages wholesale, so it must never survive the call: use a
  dot-prefixed, code-owned, collision-proof name
  (`.<basename>.wienerdog-scrub.<pid>.tmp`) and remove it on **every** exit path,
  success or failure. Note that on the success path the rename *is* the removal.
  Do not sweep for stale temps left by an earlier crashed run — see accepted
  residual 5, which states that case rather than fixing it.

#### ONE CAPTURED BUFFER, AND A CHANGE CHECK BEFORE THE RENAME — Table R row R8's concurrency contract

**Added in round 1 of the design gate, which found the success arm able to
overwrite an editor save that was never preserved. This is a contract, not an
optimisation; the three rules below are load-bearing and Table R row R8 depends
on all of them.**

**The defect, walked through as it was reported.** The design read the target
**twice** with no version check between the reads: `quarantinePreserve(…,
'redacted')` read it at the top of B4 (B10 makes that the first read), and
`scrubAddedLines` read it again to compute the scrub. The added line numbers came
from a diff taken earlier still, against the Step-3 staged snapshot. **A user
saving that note in their editor between those points — an ordinary thing to do
mid-dream, not an attack — makes all three disagree.** Then the line mapping is
computed against bytes that no longer exist; a shifted line can be scrubbed, or
committed as though this run produced it; and the final `fs.renameSync` puts the
gate's rewrite over the user's save, **while the copy in `redacted/` holds the
PRE-save bytes.** The saved version then exists nowhere at all. The spec handled
this collision on the *fall-through* deletion path (Table R consequence 2's
`Buffer.compare` guard) and not on the success path, where there is no second
copy to compare against.

**Rule 1 — ONE read, one buffer, and everything downstream is derived from it.**
`quarantinePreserve(…, 'redacted')` returns the **bytes it preserved** as well as
the destination basename, and `scrubAddedLines` takes that buffer as an argument
instead of reading the target again. Its signature gains one parameter (see
"Exact contracts" below). **The preserved copy, the scrub input and the verifying
re-scan are then provably the same bytes**, which is the property the previous
design assumed and never established. **There is no read of the target for CONTENT anywhere in the arm — that is what
rule 1 says, and it is not a claim about how many reads occur.** **Which reads
do occur, and how many on which path, is Table K's; this sentence restates
neither.** *Round 5's version of this sentence restated the counts in the same
breath as declaring that it did not — the third recurrence of the
self-falsifying pair, and round 6 struck the digits rather than the disclaimer.*
*Round 3 found this sentence saying "exactly one" while rule 2, the Table T
preamble, FI-15, AC-9 and M-46 all said or required two.*

**Rule 2 — RE-READ AND COMPARE IMMEDIATELY BEFORE THE RENAME, and fail without
overwriting on any mismatch.** As the last act before `fs.renameSync`, after the
index has been staged, re-read the target and compare it against the captured
buffer:

```js
Buffer.compare(fs.readFileSync(path.join(vaultDir, rel)), captured) === 0
```

**Either way the scrub is abandoned** — remove the temp, return `false`, do
**not** rename — **but the two failures are DIFFERENT ROWS with different
artifact outcomes, and Table K row K2 is where that is decided.** This read is
**K2**; read its two outcome columns rather than inferring them here:

- **the bytes DIFFER** → row **R7c**. The target demonstrably changed, so the
  `redacted/` copy is **kept** and named by Q8's suffix — B3's own preserve
  reads the *post*-save bytes, so consequence 2's byte-identity guard finds
  the two copies differ and keeps both.
- **the read THROWS** → row **R2**. A read error does **not** establish that
  the target changed, so the ordinary fall-through applies and the `redacted/`
  copy is **deleted**. *Round 3 found this sentence conflating the two, with
  R2 and R7c prescribing opposite outcomes for one input — the defect that
  made the twelve-row matrix non-disjoint.*

On the mismatch path the user's save survives untouched in the working tree and
the note is withheld by the fall-through. **The two guards compose deliberately**: rule 2 catches the save on
the success path, consequence 2 catches it on the fall-through path, and neither
covers the other's window.

**Rule 3 — the index stage does NOT need a second check, and here is why, so
nobody adds one.** The stage writes the *sanitized* form derived from the
captured buffer. If rule 2 then fires, the index holds a sanitized blob for a
working-tree file that was never scrubbed — which is exactly the state row R7b
already enumerates, and B3/B3a clear it on the fall-through by the same two
statements. Nothing raw is ever staged, so the window rule 2 opens is on the safe
side of invariant **I2**.

**What this does NOT claim to close.** A save landing *after* rule 2's compare
and *before* the kernel completes the rename is still possible — that is an
unavoidable filesystem race, not a design choice, and it is bounded to
microseconds rather than to the whole scrub. **Accepted residual 9 states it**,
and round 1 narrowed that residual from "the whole preserve-to-scrub window" to
"the compare-to-rename instant" rather than deleting it.

**Two Table T rows prove this, they are not optional, and they prove TWO
DIFFERENT PROPERTIES** — which round 2 of the design gate had to separate,
because round 1 conflated them into one perturbation that made both rows
unsound:

- **FI-15 proves rule 1 (derivation) by COUNTING, not by perturbing.** It
  records every read of the target and asserts the count and positions **Table
  K** decides — the
  capture and the comparison — plus that the written bytes are the per-line
  scrub of the captured buffer. **It must not poison any read**, because the
  comparison read is mandatory: a perturbation there is indistinguishable from
  a real editor save, and a conforming arm is *required* to take R7c on it.
- **FI-16 proves rule 2 (the compare) by modifying the target strictly BEFORE
  the comparison read**, then asserting the rename is never reached.

**The rule this leaves behind, and it generalises past these two rows: a fault
injection for a guard must perturb the system on the side of the guard the guard
can act on.** Round 1 put FI-15's perturbation where the guard *must* catch it —
so the row demanded an outcome the correct design forbids — and put FI-16's
where the guard *cannot* — so the row demanded an outcome the injection itself
disproves. Both are in Table T with the executed reasoning.

`addedLineNumbers` comes from the `-U0` diff's hunk headers, and **the header
shape is not the obvious one**. The nominal form is `@@ -a,b +c,d @@`, but git
**omits `,<count>` on either side whenever that side's count is 1**, and it omits
them independently. All four shapes measured in Current state must parse:

| header | `b` | `d` | added line numbers |
|--------|-----|-----|--------------------|
| `@@ -0,0 +1,3 @@` | 0 | 3 | `[1, 2, 3]` |
| `@@ -2,0 +3 @@ b` | 0 | **absent → 1** | `[3]` |
| `@@ -2 +2 @@ a` | **absent → 1** | **absent → 1** | `[2]` |
| `@@ -2 +2,2 @@ a` | **absent → 1** | 2 | `[2, 3]` |
| `@@ -2 +1,0 @@ a` | **absent → 1** | 0 | `[]` |

- **The first row is a brand-new file, and it is the commonest shape this gate
  sees** — every note the dream writes for the first time is an untracked add.
  Measured 2026-07-26 in a real repository alongside the four rows below it:
  a new three-line file stages as `@@ -0,0 +1,3 @@` and a new one-line file as
  `@@ -0,0 +1 @@`, both with **no trailing function-context string at all**
  (there is no preceding hunk to name). It is listed because it looks like it
  needs a special case and does not: the pattern below matches it with `a=0`,
  `b=0`, `c=1`, and the anchored-at-`^` form is indifferent to whether anything
  follows the closing `@@`. Executed against the pattern: all five rows produce
  the added-line list in the last column.
- **Both counts are optional.** The pattern must be
  `/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/`, with each missing count
  defaulting to `1`. **A pattern that requires `,b`** — the shape a first reading
  produces — **does not match `@@ -2 +2 @@` at all**, so a single-line
  *replacement* contributes zero added line numbers.
- **Both omissions fail the same way, and it is the fail-closed way that hides.**
  Whether `,d` is misread as `0` or the whole header fails to match, the scrub is
  a no-op on those lines, the re-scan still finds the secret, `scrubAddedLines`
  returns `false`, and the note is **withheld**. Nothing leaks — and this WP's
  headline feature is silently off for the two commonest hunk shapes there are.
  A single mutation cannot catch both, which is why the table below carries
  **two rows and mandates two fixtures, one per omission**: **M-24b** with a
  single-line *insertion* into a tracked file (`@@ -2,0 +3 @@`, exercises `,d`)
  and **M-24** with a single-line *replacement* in a tracked file
  (`@@ -2 +2 @@`, exercises `,b` and `,d` together). Neither fixture covers the
  other, and a parser can get one right while getting the other wrong.
- `d === 0` is a pure-deletion hunk and contributes **no** added line numbers.
- Otherwise the added lines occupy `c … c+d-1` in the new file.
- The header carries a trailing function-context string after the closing `@@`;
  anchor the pattern at `^` and ignore everything after the second `@@`.

A sanitized line has the same line **count** (`scanAndRedact` never inserts a
newline), so the numbering stays valid across the whole rewrite.

**The verified-scrub postcondition must not be dropped as "belt and braces".**
Without it, `scrubAddedLines` can only report what it *tried* to do, and Table B
row B4 has no way to tell a scrubbed file from an unscrubbed one. The failure
mode is specific and it commits the raw secret: preserve succeeds,
`secretRedactions` increments, the dream report announces a successful
redaction, and the unmodified line is committed. It costs one extra
`scanAndRedact` call on a path that fires roughly once per full-vault pass.

The gate's return value gains one field:

```js
/** @returns {{ …unchanged…, secretReverts:number, secretRedactions:number }}
 *  secretReverts    = files WITHHELD (a quarantine-severity finding, or unscannable
 *                     binary). Unchanged meaning: content this run produced was NOT
 *                     committed. `src/cli/dream.js:577` keys transcript deferral on it.
 *  secretRedactions = files COMMITTED with this run's added lines scrubbed. These
 *                     consumed their transcripts normally and MUST NOT defer. */
```

#### The dream report

Step 4 gains a second fixed section, written only when there is at least one
redaction (never a `- none` placeholder — an empty section is noise on the
common path):

**The line format is pinned here, not illustrated.** One line per redacted file,
in the order the gate processed them, built from exactly this template. **Every
byte outside the angle-bracket placeholders is literal**, including the section
heading, the leading list-item dash and space, the backticks around the path, the
em-dash separator and both sentence separators:

```text
- `<vault-relative path>` — <n> line(s) scrubbed (<labels>); unredacted copy at state/quarantine/redacted/<basename>. If the redaction was wrong, restore from that copy while it is there; otherwise delete it.
```

where `<n>` is `addedLineNumbers.length`, `<labels>` is the finding labels joined
by a comma and a space, in the order `scanAndRedact` returned them (the same
`findings.map((f) => f.label)` expression B3's reason string already uses at
`validate.js:937`), and `<basename>` is **`preserved.name`** — the `name` field
of `quarantinePreserve`'s return, never the object itself.
`- none` is never written. Rendered:

```markdown
## Redacted in place (secret scan)
- `02-Areas/second-brain/tooling.md` — 2 line(s) scrubbed (high-entropy); unredacted copy at state/quarantine/redacted/2026-07-25-tooling.md. If the redaction was wrong, restore from that copy while it is there; otherwise delete it.
```

Metadata only: the vault-relative path, a line count, the distinct labels, and
the sanitized destination basename. **Never the matched bytes**, never the
scrubbed line's text. `<n>` is always written as `<n> line(s)`, singular form
included — the existing report section has no pluralisation logic and neither
does this one.

**The basename is the one `quarantinePreserve` returned for that file — not a
reconstruction.** See the note under its signature above: a reconstruction is
wrong whenever the collision loop fired, and it fires routinely.

**Ordering, decided here so nobody has to guess.** The new section is appended
**after** `## Reverted by orchestrator (policy enforcement)`, in the same Step 4,
by a second `fs.appendFileSync`. Reason: the existing section is written
unconditionally (it always has content, if only `- none`), the new one is
conditional, and appending after keeps the existing section's byte output
identical whether or not a redaction happened — which is what makes Table B row
B6 "unchanged" true in the literal sense the golden checks read it. Withholds
before redactions also reads correctly: the urgent outcome first.

#### `src/core/digest.js`

`listSecretQuarantine` reads with `{ withFileTypes: true }` and keeps only
`e.isFile()`. **The banner's closing sentence is also edited — Table Q row Q1
decides it, and this paragraph does not restate the text.** What stays true is
the part the owner was asked about: the banner continues to describe withheld
notes and **only** withheld notes, because the redaction copies live one level
down and `listSecretQuarantine` no longer sees them. Redactions are reported in
the dream report (see Table B row B7), which is the artifact the glossary already
defines as "what was written, what was gated out and why". **Nothing else in the
file changes**, and **V-5** bounds which lines of `digest.js` the diff may
remove. **The bound is V-5's own `PERM5` heredoc and no count is restated here**
— this sentence carried one until round 5 and this document's AC-26 carried a
different one, both of them stale mirrors of a list that had moved (round 4 added
Q14's comment block; round 5 widened it from two lines to the whole wrapped
block). The no-bare-numbers rule in the Mirrored Surface Checklist covers exactly
this failure, and its audit could not see these two because the audit greps for
the retention cap's digits only; that gap is now recorded there.

## Contract reference

**Activation (ADR-0031, 6 of 7):** (i) the same user-facing claim about what EP2
does with a finding is authored in **ten shipped files** at once — Table Q's
family, which round 5 extracted, round 6 re-scoped and derived from a grep, and
round 7 widened by one file when the grep's own pattern turned out to be a
hand-written seed; (ii) the severity taxonomy acquires an
interpretation — `redact` gets a gate that acts on it; (iv) precedence and
fallback behaviour changes at EP2, including two new fall-through transitions
(B5, B5a); (v) an authority boundary — the detector (leg 1) emits severity,
`validate.js` owns its interpretation, `dream.js` owns the ledger consequence;
(vi) downstream consumers (`dream.js`, `sync.js`, `digest.js`, `private-fs.js`,
the incident runbook) inherit the contract; (vii) the same facts appear in the
gate, the banner, the report, the runbook, the tests and this spec.

**Round 3 activated a second dense contract inside this WP and it now has its own
table.** Both reviewers independently found that the round-3 findings clustered on
one family — `scrubAddedLines`/`quarantinePreserve` failure-and-return semantics —
which is also where round 2's B5a critical landed. It was about fifty lines of
JSDoc prose with no table behind it, so each mirror drifted independently: the "a
`false` return guarantees byte-unchanged" claim was false on the write path,
`reverted[]` had no row anywhere, and the fault-injection list enumerated four
cases while the contract had six. **Table R** is that family's canonical table;
extracting it resolved four findings mechanically and is why the JSDoc blocks
under "Exact contracts" now carry signatures and argument meanings only.

**Round 4 activated a third, and it is the reason this revision exists.** Both
reviewers again converged on one family, and this time it was not *what* the
contract says but **whether any of it can be produced and observed**: an
acceptance criterion demanding a helper-level assertion on a function that would
be module-private; two fault injections (FI-4, FI-6) naming a stub of a binding
that `validate.js` destructures at module load and therefore cannot be stubbed
through the exports object; a test file with zero stubbing patterns in it today;
and an FI-7 whose only plausible filesystem mechanism also breaks every
subsequent git call. An unproducible fault injection is not a weak test — it is a
row an implementer will fake or skip, and the round-3 table would have shipped
green with four of its rows untested. **Table T** is that family's canonical
table: for every fault injection and every Table R row it names the seam that
produces it, the level it is asserted at, and what makes it reachable inside the
Deliverables boundary.

**Round 5 activated a fourth, and it is the third consecutive round in which one
un-tabled family produced the blocking finding.** Round 4 found the ledger banner
telling users to delete the originals this WP creates and repaired it *as a
one-off*, in its own prose section, without asking what else says the same thing.
Round 5 found the identical trap in the digest banner — which this document
quotes verbatim in Current state, registers as "the second user-facing surface",
and then **freezes** in Table B row B6, verification V-5 and an Out-of-scope
bullet — plus two more false claims in the recovery runbook. One family, three
surfaces, three rounds, because each surface was argued where it happened to be
mentioned. **Table Q** is that family's canonical table.

**Round 6 did not activate a fifth family — it found that the fourth one's
membership predicate was wrong, and applied ADR-0031's remedial extraction move
to the predicate itself.** Table Q was scoped as "shipped strings naming
`state/quarantine/`", and on that predicate both reviewers converged on
`docs/THREAT-MODEL.md:130`, which states the **exact negation** of this WP —
`**Any** detector finding … reverts that file`, and the sanitized text `never`
written back — without naming the folder in either false sentence. Three more
came with it: the same file's banner-lifecycle clause, a code comment in
`digest.js` restating the lifecycle Q1 replaces, and the `A5_PRIVATE_DIRS` doc
comment, whose prescribed wording **in this very spec** was the phrasing **Q6**
outlaws. The predicate is now **"every shipped user-facing claim about what EP2
does with a finding and where the bytes go"** — and because a predicate assembled
from memory is what failed four rounds running, **membership is derived from a
committed grep**, run in verification step **V-26**, whose output is reproduced
and dispositioned row by row under "Table Q membership".

| Family | Canonical table | Nothing else decides it |
|--------|-----------------|-------------------------|
| what the detector emits | **Table P** | and Table P is a **precondition**, not a decision: leg 1 decided these in its Table A, this WP only checks they are on disk |
| what EP2 does with a finding | **Table B** | disposition, artifact placement, counters, **whether** a surface fires. **Not retention** — that moved to Table N in round 4 and this cell kept the word for a round |
| **what every shipped claim about EP2's disposition and destinations says afterwards** | **Table Q** | the digest banner and the comment above it, the exhausted-transcript banner and the ledger summary line, all three runbook surfaces, the glossary entry, the `A5_PRIVATE_DIRS` doc comment, four clauses of `docs/THREAT-MODEL.md`, the Step-3 header comment in `validate.js` itself and the dream-report line — the *words*, as against Table B's *whether*. **Membership is derived by V-26's grep, not recalled — and V-26's grep pattern is itself part of the table, for the reason round 7 found** |
| **every read of the target inside the arm** | **Table K** | the count, the encoding, the position, the arming rule, and **each read's failure outcome** — which is what makes R2 (comparison-read exceptions) and R7c (byte mismatches) disjoint. **Extracted in round 4 after three consecutive rounds of findings on this family** |
| **retention of `state/quarantine/redacted/`** | **Table N** | the cap, the prune trigger, the exclusion set, the ordering, **the precedence when the cap and the exclusion conflict**, the overshoot's lifetime, and best-effort failure. **Extracted in round 4 for the same reason** |
| **how the redact arm can fail, and what each failure leaves behind** | **Table R** | every return value of `quarantinePreserve` and `scrubAddedLines`, the working-tree and index state after each, which Table B row runs next, both counters, `reverted[]` membership, and the fault injection that proves it |
| **how each of those outcomes is produced and observed** | **Table T** | every fault injection's mechanism, the level each cell is asserted at, the module surface each one needs, and why no other mechanism reaches it |
| the two real-vault figures | **the D1/D2 derived rows** | and even those are derived — ADR-0034's E1 and E3 decide them |

### Table P — preconditions: what leg 1 must already have landed

**Every row is a fact about `main`, not a thing you implement.** Each has a
literal check in verification step **V-16**, which runs *before* anything else.
**If any row fails, STOP and do not write a line of code.** A failing row means
`WP-secret-fence-two-tier-detector` is not on `main`, and shipping this gate
against the old detector is the ordering violation described under "Why this leg
cannot go first" — it would convert sixteen labelled rules from "withhold the
note" to "scrub the line and commit the note".

| # | Precondition | Literal check (V-16) |
|---|--------------|----------------------|
| P1 | the two-tier alphabet is declared once, and today's hand-written wide literal is gone | `grep -c "^const ENTROPY_CORE_CLASS = 'A-Za-z0-9+=';$"` is `1`; `grep -c "^const ENTROPY_WIDE_EXTRA = '/';$"` is `1`; `must_not "<label>" grep -qF '[A-Za-z0-9+/=]'` — **the label is the helper's first argument**, see the note above the block |
| P2 | **`redact` has exactly one producer** — i.e. every labelled rule is `quarantine` and only the context-free entropy tier emits `redact`. **This is the row that makes branching on severity safe**, and it is counted as *occurrences*, not lines, so two producers written on one line cannot hide | `grep -o 'SEVERITY\.REDACT' src/core/secret-scan.js \| wc -l` is `1` |
| P3 | the per-key severity helpers are gone (they became constant when every labelled rule became `quarantine`) | `must_not "<label>" grep -q "severityForKey\|QUARANTINE_KEYS" src/core/secret-scan.js` — message-first, as P1 |
| P4 | severity is the **maximum** over a label's occurrences. Without this, `hasHardFinding` is order-dependent: a note mixing a bound tier-2 candidate and a bare tier-1 candidate reports whichever arm appears first in the text, so **this gate would take the B4 redact arm on a note containing a real bound-context secret** | `grep -q 'existing.severity = SEVERITY.QUARANTINE' src/core/secret-scan.js` |
| P5 | **no `redact`-severity producer can match across a newline.** This WP's scrub re-derives the redaction **one line at a time** (`scrubAddedLines`), which is equivalent to the blob scan the gate ran only if no producer of a `redact` finding spans lines. True after leg 1 — the sole producer is the context-free entropy tier, whose alphabet is P1's two whitespace-free class constants, and every newline-capable labelled rule is `quarantine` — but nothing pinned it, and this table's own rule is that a depended-on detector property gets a row with a literal check or is not depended on | **two checks, both in V-16.** (a) the alphabet is closed: `grep -c "^const ENTROPY_[A-Z_]* = '" src/core/secret-scan.js` is `2`, so together with P1's two byte-exact lines the only alphabets in the module are `A-Za-z0-9+=` and `/`, neither containing `\n` or any whitespace. (b) a **cross-line negative**, executed against the shipped detector: the reference fixture this document already names in Current state (`ref q7PmXz4KvR9tWc2LbN8dYfGh in prose`) must produce a `redact` finding whole, and must produce **none** when the same run is split across a newline |
| **P6** | **`Authorization: Basic` is caught, at `quarantine`, with the credential body redacted.** Leg 1's tiering *removes* coverage of this published format unless leg 1 also ships the labelled rule that closes the hole: without it, a standard-base64 Basic credential fragments on its slashes and produces **no finding at all** a measured 10–31% of the time depending on body length. **This row exists because P1–P5 do not catch that.** A detector carrying the two tier constants, the severity escalation and exactly one `redact` producer — but no basic-auth rule — passes every other row of this table, so this WP could be dispatched against a partial or skewed leg 1 and would then **commit a published credential format unsanitized**. *(Found in round 1 of the design gate, on this WP's own preflight, from the leg-1 side of the review.)* **This row is BEHAVIOURAL, not a grep, deliberately**: a `grep -q "add('basic-auth'…)"` passes on a rule that is present and wrong, and it also encodes a leg-1 label this table has no business pinning | **one check in V-16**, run against the shipped detector, with **a body drawn from the FULL standard-base64 alphabet — at least one `/`, at least one `+`, and padding**. Three assertions: (1) **at least one `quarantine`-severity finding**; (2) the returned `.text` still contains the literal `Authorization: Basic`; (3) **no eight-character window of the body survives anywhere in `.text`**. Never on the label string — leg 1 owns that name. <br>**Both the body and assertion (3) were strengthened in round 2 of the design gate, and MEASUREMENT SHOWS EITHER ALONE IS VACUOUS.** The round-1 probe used a purely alphanumeric body while P6's own justification is that a standard-base64 credential *fragments on its slashes* — so it tested a shape the row is not about. Executed 2026-07-27 against a simulated leg 1 whose `basic-auth` character class **omits `/`** (the present-and-wrong case P6 exists to catch): with the alnum body that rule leaves **zero residue** and is indistinguishable from a correct one; with a slash-and-plus body it leaves the 27-character residue `/K7MDENG/bPxRfiCYEXA+MPLEK=` — **but `.text` still does not contain the whole body**, so a `!includes(body)` assertion passes anyway. Only the **union** fires: slash-bearing body **and** the eight-window assertion, which reports the surviving window `/K7MDENG`. A correct rule leaves no window under either body |

**P4 is not a formality.** It is the single precondition whose absence turns this
WP's headline feature into a fail-open bug, and it is why the split had to be
detector-first rather than gate-first with the detector to follow.

**P6 is not a formality either, and it is the one that would have failed
silently in the wrong direction.** Every other row of this table describes a
property this WP *consumes*. P6 describes a property this WP does not consume at
all — it is pure detector coverage — and it is here for one reason: **a partial
leg 1 that satisfies P1–P5 is a real, reachable state**, and against it this
gate's redact arm would scrub-and-commit notes containing a credential format the
shipped detector catches today. The preflight's job is to refuse a leg 1 that is
not the leg 1 this WP was designed against, and coverage of a published format is
part of what "that leg 1" means.

**P5 is the one that fails silently, which is why it is checked twice.** If a
`redact`-severity producer could span a newline, every per-line scrub of such a
finding would be a no-op, the re-derivation would disagree with the gate's blob
scan, `scrubAddedLines` would return `false` (Table R row **R6**), and the note
would be **withheld** — fail-closed, green suite, and this WP's headline feature
silently off for the exact inputs it exists to handle. No test in this document
would go red, because R6 is a row the suite asserts *passes*. The cross-line
negative is deliberately expressed against a fixture this spec already states a
fact about, so it encodes no threshold, length or alphabet number of leg 1's.

### Table B — canonical: the EP2 disposition contract

| # | Condition on the added lines | Action |
|---|------------------------------|--------|
| B1 | no findings | commit unchanged (`continue`), as today |
| B2 | unscannable binary (`--numstat` reports `-\t-`) | **withhold**, as today. Reason string unchanged |
| B3 | `hasHardFinding(findings)` true | **withhold**: `quarantinePreserve(…, 'withheld')`, then revert (tracked → `git checkout HEAD -- rel`; untracked → `rm`). Reason string unchanged. `secretReverts += 1` |
| B3a | the **untracked** branch of that revert (`validate.js:944`) | **one added statement**: `git(vaultDir, ['add', '-A', '--', rel])` immediately after the `fs.rmSync`, so the index entry Step 3's opening `git add -A` created is dropped **now** rather than by Step 5. The tracked branch needs nothing: `git checkout HEAD -- rel` already rewrites the index to HEAD. **No `allowFail`** — if the index cannot be written, `git()` throws (`validate.js:80`), Step 4 never runs, and nothing is committed. See invariant **I1** under Table R for what this buys, and residual **7** for what it does not. This is the only line of the shipped withhold path this WP changes, and it moves no user-visible surface: Step 5's unconditional `git add -A` already produces the identical end state two statements later, so the change is purely *when* the window closes, never *what* the run ends up with |
| B4 | findings, none of them `quarantine` | **redact**: `quarantinePreserve(…, 'redacted')` **first**, whose return shape its `@returns` decides; then `scrubAddedLines(vaultDir, rel, addedLineNumbers, preserved.bytes)`, which performs the index-first stage internally (**B10**) and **takes the preserved buffer as its scrub input rather than re-reading the target**; only then `secretRedactions += 1`. **Every one of those results is checked and the counter increments last.** **The captured buffer is passed, not re-fetched, and the pre-rename compare inside the scrub is part of the contract** — see "ONE CAPTURED BUFFER, AND A CHANGE CHECK BEFORE THE RENAME"; without them a mid-run editor save is scrubbed against stale line numbers and then overwritten, with the only copy of it destroyed. The exact outcome of each step, and which row runs next, is **Table R** — B4 does not restate it |
| B5 | B4 and the **preserve** failed | **fall through to B3** — withhold instead. Never scrub a file whose original could not be preserved; that is the "permanent corruption" outcome the design exists to avoid. **This row IS the shared branch — `P` returned `null` — and it has TWO terminal outcomes, split by whether B3's own preserve then succeeds: Table R row R1 if it does, row R0 (via B3b) if it does not.** Do not call this branch "row R1": R1's definition requires B3's preserve to have succeeded, so naming the branch after it would apply R1's revert and index-clearing before the loss-prevention path is recognised. **See B3b, which is what stops this fall-through from becoming the loss it exists to prevent** |
| **B3b** | **B3's OWN preserve returned `null` after ANY redact-arm fall-through, and no durable copy OF THE TARGET'S CURRENT BYTES can be shown to exist.** The condition is a **byte-identity test, not a copy-existence test**, and round 5 of the design gate is why — see below. Precisely: B3's `quarantinePreserve(…, 'withheld')` returned `null`, **and** it is not the case that some durable copy compares equal to the file now on disk. Two ways in: **(a)** the redact preserve also failed (**B5**), so no copy exists at all — Table R row **R0**; **(b)** the redact preserve succeeded, so `redacted/` holds the bytes captured at **K1**, but the file on disk now differs from them (or cannot be read to check) — Table R row **R0b** | **ABORT THE WHOLE GATE. Do NOT revert, do NOT remove, do NOT clear the index entry.** Raise a `WienerdogError` naming the path, which preserves failed, whether an identity check was possible, **and — whenever the `redacted/` copy survives — its basename.** **The message's content is decided in Table Q row Q18 and this cell restates none of it.** **That last clause is round 6's design answer to a real gap**: on R0b the `redacted/` copy is the only record of the pre-save version, and it is otherwise **unannounced** — Q8's suffix belongs to consequence 2, which never runs on an abort, and `reverted[]` is never rendered because Step 4 is never reached. Two revisions claimed Q8 named it; it cannot. **The error message is the only surface that reaches the user on an abort, so it is the one that must carry the basename** — the alternative, leaving the copy unannounced, would put the user's only pre-save bytes in a folder nothing points at. Table R rows **R0** and **R0b**. <br>**Why this row exists, stated as the defect it repairs rather than as a principle.** Until round 1 of the design gate, B5 sent a failed redact-preserve into B3, and B3 called *the same preservation mechanism* — against the same `stateDir`, on the same filesystem, with the same permissions — and then **reverted the file or removed it regardless of whether that second preserve had also failed**. For the missing-`stateDir` case the row itself names, and for any shared ENOSPC or permission fault, the two preserves fail **together**, so the gate deleted an untracked note, or discarded tracked modifications, **with neither a redacted nor a withheld copy in existence**. The existing `(quarantine copy failed)` reason suffix *reported* that loss after causing it, and Table R had no outcome for it at all. <br>**Why aborting is the right answer and not merely the cautious one.** Every other failure in this arm has a recoverable resting place; this one does not. Leaving the file exactly where it is costs the user **nothing** — their note is still in the working tree, unmodified — and costs this run a loud, non-zero exit with no commit, which is the same outcome row **R9** already produces and which the dream job already knows how to report. The secret is *not* committed, because Step 4 and Step 5 never run. **The fail-closed property is preserved: nothing leaks. What changes is that nothing is destroyed either.** <br>**THE CROSS-PRODUCT THIS ROW WAS WIDENED TO CLOSE (round 5 of the design gate, found by the adversarial reviewer).** Round 1 wrote B3b as a *copy-existence* test — "no durable copy of the note exists anywhere" — and that is not the same question as "is the file I am about to destroy recoverable". The losing sequence, all four steps ordinary: the redact preserve captures bytes **A** into `redacted/`; **the note's owner saves bytes B over it mid-dream**; the scrub then fails for any reason at all (R2 … R7c); the fall-through reaches B3 and **B3's own preserve fails too**. Under the old condition a durable copy *did* exist — copy **A** — so B3b did not fire, consequence 2 kept A, and **B3 reverted or removed the working-tree file holding B.** Bytes **B** then exist nowhere. **The design's own worked example — an editor save mid-dream — walked straight into it**, and the two injections that look like they cover it each cover one axis: **FI-10** is preserve-failure with no concurrent change, **FI-16** is concurrent change with a *successful* second preserve. The destructive cell is the product, and nothing sat in it. <br>**Scope, so nobody widens it.** B3b fires only when B3's preserve returned `null` **and** byte identity with a durable copy could not be established. When B3's preserve fails but the `redacted/` copy **does** compare equal to the file on disk, the note is recoverable from that copy and the ordinary fall-through proceeds — that is consequence 2's first keep-combination (**FI-10**) and it is unchanged. When B3's preserve *succeeds*, rows R2–R7c are unchanged. **The rule underneath: never destroy the working-tree file unless some durable artefact holds THE BYTES THAT ARE THERE NOW.** |
| B5a | B4, the preserve succeeded, and the arm did not complete | **fall through to B3** — withhold instead, *before* Step 5 stages anything. `secretRedactions` is **not** incremented; `secretReverts` is, exactly as B3. **`secretRedactions` increments only after the scrubbed path has been staged** — never optimistically, never before the call. This row exists because Step 5's `git add -A` (`validate.js:978`) runs unconditionally: a B4 that ignored a failure would re-stage the *unmodified* working tree and commit the raw secret while reporting a successful redaction. B3 then runs unchanged, including **its own** `quarantinePreserve(…, 'withheld')`. **Which failures reach this row, and what each leaves on disk, is Table R rows R2–R7c.** Under B10's index-first ordering this gate writes nothing to the working-tree file on **every** one of them (R7c is the row where the file nevertheless differs from the captured bytes — because its owner changed it, which is the condition R7c detects), so B3's `withheld` copy is always the true original — that was not so before round 5 and it is the reason this row lost its special case. The fall-through also has to decide what becomes of the `redacted/` copy B4 already wrote, which would otherwise be an unannounced orphan on B12's capped FIFO; **Table R consequence 2 decides that, and this row does not restate it** |
| B6 | user-facing surface, B3 | `state/quarantine/<date>-<name>` + the existing digest banner + the existing `## Reverted by orchestrator` report line |
| B7 | user-facing surface, B4 | `state/quarantine/redacted/<date>-<name>` + the new `## Redacted in place (secret scan)` report section. **No digest banner** |
| B8 | `secretReverts` | counts B2 + B3 only. Its meaning — "content this run produced was NOT committed" — is what `src/cli/dream.js:577` defers transcripts on, and it must not change |
| B9 | `secretRedactions` | counts B4 only. **Must not feed the ledger deferral**: a redacted note *was* committed, so its transcripts were genuinely consumed |
| B9a | `reverted[]` — the array, not a counter | **`reverted.push(…)` is B2/B3 only. A completed B4 must NOT enter it.** Today `validate.js:947` pushes unconditionally inside the gate loop (line **946** is the `(quarantine copy failed)` reason-suffix and must stay where it is), and `reverted` is user-visible **twice**: Step 4 renders it into `## Reverted by orchestrator`, and it is returned as `res.reverted`, which `src/cli/dream.js:616` prints as `` `${res.reverted.length} reverted` ``. Leaving line 947 in the shared path would announce every redacted note as reverted in the report **and** in the CLI summary line — directly contradicting B9 and the report section B7 defines. A B5/B5a fall-through **does** enter it, because it really is a withhold |
| B10 | ordering and staging — **index-first** | `quarantinePreserve(…, 'redacted')` (**its own `fs.readFileSync` of the target is the FIRST read of the file** — B4 does not read it separately) → **compute the scrub and verify it in memory** → write the sanitized bytes to a same-directory temp → **stage the temp's blob at `rel` in the index** → **only then rename the temp over the working-tree file** → then the report. **The prune is NOT part of this ordering** — it runs once per gate run after the loop over changed paths, which is Table N row **N2**; reading it into this chain is a per-call prune, i.e. exactly what mutation M-48 does. **The git index is written strictly before the working tree, and that order is this row's whole content.** The stage is three `git()` calls, **every one of them `{ allowFail: true }` with its `.status` checked**, because the plain helper throws on any non-zero exit (`validate.js:80`) and a throw here would abort the run before Step 4 rather than falling through — it would make Table R rows **R7/R7b unreachable** and land in row **R9** instead: <br>1. `git(vaultDir, ['ls-files', '--stage', '--', rel], { allowFail: true })` — stdout is `` `<mode> <sha> <stage>\t<rel>` ``; take the first whitespace-delimited field as `<mode>`. Step 3's opening `git add -A` (line 904) guarantees an entry exists, because every `rel` this loop reached came out of `git diff --cached --name-status`. Non-zero status **or empty stdout** is row R7. <br>2. `git(vaultDir, ['hash-object', '-w', '--path', rel, '--', <temp absolute path>], { allowFail: true })` — stdout trimmed is the blob sha. **`--path rel` is mandatory**: it makes git apply the same `.gitattributes` clean filters and `core.autocrlf` conversion it would apply to the real path, so the blob is byte-identical to what `git add rel` produces after the rename. Without it a vault with `* text=auto` stages different bytes than Step 5 would, and the commit shows a diff nobody wrote. **`-w` writes a loose object into `.git/objects`, and on every row that then falls through (R7, R7b, and every B5a path where the stage already succeeded) that object is left unreferenced.** Stated so round 7 does not find it as a new persistence surface: what it holds is the **sanitized** form, never raw bytes; it is unreachable from any ref, so nothing renders or syncs it; and it is collected by the next `git gc`. Step 3's opening `git add -A` already writes raw loose objects for every changed path on every run — that surface is inherited and stays out of scope (residual 7). <br>3. `git(vaultDir, ['update-index', '--add', '--cacheinfo', <mode>, <sha>, rel], { allowFail: true })` — **the three-argument form.** It is the older of git's two `--cacheinfo` spellings and is accepted by every git that has `update-index`; the comma-joined `<mode>,<sha>,<path>` form arrived in git 2.0. **The justification an earlier revision carried — that the comma-joined form is ambiguous for a path containing a comma — does not reproduce and has been removed.** Executed 2026-07-26 against git 2.39.5 in a scratch repository: `git update-index --add --cacheinfo "100644,<sha>,no,te.md"` staged the path `no,te.md` correctly, because the parser takes the mode up to the first comma, then the 40 hex digits, then **the whole remainder** as the path. Both forms are correct here; pick neither on comma grounds. Do not "fix" this to the comma form — it is not wrong, it buys nothing, and a canonical row must not carry a claim that fails reproduction. `--add` costs nothing and makes the call total over "already in the index" and "not". <br>**Why index-first rather than write-then-stage.** Write-then-stage invents a divergence that does not exist before this WP: a SIGKILL, panic or power loss between the working-tree write and the `git add` leaves a **scrubbed working tree and a raw index**. Neither B3 nor R9 runs, nothing is reported, and the repository is now actively misleading — a user who opens the note sees the secret gone, while a later `git commit` ships it from the index. Before this WP the tree and the index always agreed on the raw content, so the window was inherited and honest. Index-first puts the same unavoidable window on the safe side: a kill between the stage and the rename leaves an **index holding the sanitized form and a working tree holding the user's own unmodified text**, which is additionally preserved in `redacted/`; a plain `git commit` there ships the scrubbed form, and the next dream's Step 3 `git add -A` re-derives the whole state from the working tree and re-runs the arm. Measured 2026-07-26 against real git for a tracked and an untracked path: after the two calls the staged diff shows the redacted line while `cat` shows the raw one, and `git checkout HEAD -- rel` (tracked) / `rm` + `git add -A -- rel` (untracked) clear the entry completely. <br>**Because Step 5 re-stages unconditionally, every transition out of B4 that is not a completed arm must reach B3 *before* Step 5** — that is B5 and B5a, and it is why they are transitions rather than warnings. The invariants all of this exists to establish are **I1** and **I2**, stated under Table R |
| B11 | a B4 file that is also a new skill draft | stays registered. B3's `secretReverted` de-registration (lines 951–956) applies to withholds only |
| B12 | retention, `quarantine/redacted/` | **decided in Table N and restated nowhere.** N1 the cap, N2 the trigger (once per run, only after a completed B4), N3 the exclusion set (every basename this run created), N4 the ordering, **N5 the precedence when the cap and the exclusion conflict — the cap yields**, N6 the overshoot's lifetime, N7 best-effort failure. *Round 4 extracted all seven after three consecutive rounds of findings on this family; this cell is now a pointer, which is the only form that cannot drift.* |
| B13 | retention, `quarantine/` | **unbounded, unchanged.** Withholds are rare and urgent, and the banner nags until the user empties it. **The banner's promise that it "clears when the folder is empty" is one of the strings this WP falsifies** — Table Q row **Q1** decides its replacement. **Round 7's addition: this row is now load-bearing for something outside retention.** Table R consequence 2's byte-identity guard reads the withheld copy B3 wrote moments earlier, which is sound only because nothing evicts from this directory. A future cap here is therefore not a local change: it re-derives that guard and residual 6 in the same pass |

### Table Q — canonical: the shipped claims about what EP2 does with a finding

**The membership predicate, re-scoped in round 6 because the previous one was too
narrow four rounds running.** Until this revision the family was "shipped strings
naming `state/quarantine/`". It is now:

> **every shipped user-facing claim about what EP2 does with a finding and where
> the bytes go** — the disposition (withhold / scrub / commit), the destination,
> and the lifecycle of the banner that announces it.

The old predicate missed, in one round, four surfaces that say exactly those
things without naming the folder in the sentence that is wrong:
`docs/THREAT-MODEL.md:130` (which states the *negation* of this WP), the same
file's banner-lifecycle clause at `:134`, the code comment at
`src/core/digest.js:567-568`, and the `A5_PRIVATE_DIRS` doc comment at
`src/core/private-fs.js:101-102`.

**Membership is derived from a committed grep, not from recall.** Verification
step **V-26** carries the sweep and the registered file set: the sweep runs over
`src/ docs/ skills/ templates/` (excluding `docs/specs/`, `docs/adr/` and the
dated `docs/security-audit/` snapshots, which are historical records nobody
edits) and its set of matching **files** must equal the set this table
dispositions. The line-level output is reproduced under "Table Q membership"
below.

**Round 6 wrote that this "means round 7 cannot find a fifth surface by hand".
Round 7 found one by hand** — `src/core/dream/validate.js:900-903`, row **Q17**,
this WP's own primary file — because the sweep's *pattern* was itself
hand-written and was not a registered surface. That sentence is deleted rather
than softened, and the rule it should have been is
"The sweep's own pattern is a member of the contract", below the membership
sub-table.

**This table is the single place the wording of every member is decided.** Table B
decides *whether* a surface fires; Table Q decides *what it says*. If any other
surface in this document — a Deliverables cell, an acceptance criterion, a
verification grep, a Current-state quote, an argument section — could be read as
deciding one of these strings, it is a mirror and Table Q wins.

**Why this family is dangerous, stated once so no future round re-derives it.**
This WP creates `state/quarantine/redacted/`, and what it puts there is **the only
pre-scrub copy of the user's own text**. Every shipped sentence that tells a user
what to do with the contents of `state/quarantine/` is therefore one edit away
from being a destructive instruction, and the folder now has a state ("empty")
that the user can no longer reach. Four rounds found four of these one at a
time. The rule that follows: **no string in this table may be frozen on the
grounds that this WP "does not change the withhold path" — the withhold path's
copy became false without being edited.** The second rule, added in round 6:
**a member may be a code comment or a threat-model clause, not only user-facing
copy.** A stale comment beside a corrected string is how the *next* round
re-derives the wrong contract, and a threat model that states the negation of the
shipped behaviour is worse than no threat model.

| # | surface (file:line at `efd1489`) | what it says after this WP | why |
|---|----------------------------------|----------------------------|-----|
| **Q1** | `src/core/digest.js:576` — the withhold banner's closing sentence. Today: `what you meant to keep, delete the rest; this notice clears when the folder is empty.` | **exactly one source line is removed and two replace it**, so line 574 and line 575 stay byte-identical: <br>`'what you meant to keep, delete the rest of the files there (not the redacted/ folder inside it); ' +` <br>`'this notice clears when no withheld copies are left.'` <br>Rendered tail: `Review the copies in state/quarantine/: restore what you meant to keep, delete the rest of the files there (not the redacted/ folder inside it); this notice clears when no withheld copies are left.` | **two independent falsehoods this WP creates.** (a) "delete the rest" now instructs the user to destroy `redacted/`, which after a full-vault pass holds one pre-scrub original per scrubbed note — derived row **D2** is where that rate is stated and this cell does not restate it — and the sentence adds an incentive, because it promises the notice clears when the folder is empty. (b) "when the folder is empty" is unreachable: from the first redaction onwards `redacted/` is in there. The parenthetical is byte-identical to Q2's, deliberately: two banners about the same folder must not warn about it in two different phrasings. **This row is an architect-authored post-approval correction to a surface the second `OWNER-RATIFIED` blockquote names** — see the dated note after that blockquote; it is **not** ratified and does not claim to be |
| **Q2** | `src/core/dream/ledger.js:368` — the `secret-revert-exhausted` banner. Today: `The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest.` | `The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest of the files there (not the redacted/ folder inside it).` | same trap as Q1, found a round earlier. The prefix `The withheld copies are in state/quarantine/` is byte-identical on purpose — `tests/integration/dream.test.js:1437` asserts it as a substring, which is why that file is not in Deliverables. See "The exhausted-transcript banner, exactly" for the two-file bound |
| **Q3** | `docs/runbooks/secret-incident.md:41-48` — the existing step-3 `state/quarantine/` bullet. Two claims: `the digest shows a banner while this folder is non-empty` and `the banner clears once the folder is empty` | both claims become **about withheld notes, not about the folder**: the banner shows while a **withheld note** is in the folder, and clears once none are left. `Open each file` becomes `Open each file in it` (the `redacted/` folder is a directory, not a file, and is covered by the next bullet). Everything else in the bullet — the true-positive/false-positive branch, the "rotate first" instruction, the T4 reference — is byte-unchanged | the bullet's two lifecycle claims are the runbook's copy of Q1's promise, and they go false for the same reason. Round 5 found them still frozen by V-13's permitted-removals list |
| **Q4** | `docs/runbooks/secret-incident.md` step 3, **new** bullet after Q3's | the **five** points enumerated under "The recovery runbook", edit 2 — location, what to do with it, that there is **no banner** for this one, the cap, and — **added by the owner's option-C ruling of 2026-07-27** — that `wienerdog uninstall` removes this folder along with everything else under `state/`, so anything worth keeping must be copied out first. It describes the folder as holding **one file per note the scan rewrote**, never "per scrubbed note that was committed" | a user who finds `[REDACTED:high-entropy]` inside a committed note has no documented path to the original today. The wording matters because Table R rows R2–R7c put a copy there for a note that was then **withheld**, and it is deleted again on the ordinary fall-through but not on all of them (Table R consequence 2) |
| **Q5** | `docs/runbooks/secret-incident.md:80-81` — step 5's `Confirm state/quarantine/ is empty` | the two points enumerated under "The recovery runbook", edit 3: confirm the folder **holds no withheld notes**, and while one is there the digest keeps showing the notice | after this WP the folder is never observably empty, so the instruction asks for a state the user cannot reach |
| **Q6** | `docs/GLOSSARY.md` — the **secret quarantine** entry | names both destinations: `state/quarantine/` for a withheld note (unchanged, unbounded, bannered) and `state/quarantine/redacted/` for **the pre-scrub original of a note whose added lines the gate rewrote** (no banner, capped, and **disposable** — the word is required by the owner's option-C ruling of 2026-07-27 and carries the uninstall fact without a number). Closing sentence still points at `docs/runbooks/secret-incident.md`. **No number** — B12 decides the cap and the glossary is a naming document | "the pre-scrub original of a note that **was** committed" — the phrasing an earlier revision carried — is false for every row of Table R between R2 and R7b, where the copy exists and the note is withheld |
| **Q7** | the dream report's `## Redacted in place (secret scan)` line | **unchanged from the pinned template** under "The dream report", which names `state/quarantine/redacted/<basename>`. Registered here only so the family is complete | this surface is new in this WP and was written for it, so it is the one member of the family that was never false. A future round that changes the template changes it there and walks back to this row |
| **Q8** | Table R consequence 2's fall-through reason suffix, `(the unredacted original is state/quarantine/redacted/<basename>)` | decided in **Table R consequence 2**, which owns every reason string of the redact arm. Registered here because it is the eighth shipped string naming the folder | it is appended in **both** combinations where a `redacted/` copy survives a withhold — B3's own preserve failed, or the two copies are not byte-identical — and it is the only thing that announces that copy. The withheld copy, where one exists, is already announced by Q1's banner and by the `## Reverted by orchestrator` line for the same path, so one suffix names the one copy nothing else names |
| **Q9** | `src/core/dream/ledger.js:390` — `secretRevertSummaryLine`'s closing sentence, `The withheld notes are in state/quarantine/.` (pinned as a full-string equality at `tests/unit/ledger.test.js:464`) | **unchanged, byte for byte, and neither file's line moves.** Registered so that a future sweep does not re-derive it | it is the one member of the withhold family this WP does **not** falsify: it makes no lifecycle promise, gives no instruction about the folder's contents, and says only where the withheld notes are — which stays true. Same disposition as **Q7**, opposite reason: Q7 is new copy that was never false, Q9 is old copy that stays true. Its `tests/unit/ledger.test.js` pin is why that file's V-24 bound permits exactly **one** removed line and not two |
| **Q10** | `docs/THREAT-MODEL.md:130` — gate **(ii)** of the layered secret lifecycle. Two claims: `**Any** detector finding — redact- or quarantine-severity alike — reverts that file rather than committing it` and `` The sanitized `[REDACTED]` text is **never** written back as a silent rewrite of the user's own note `` | both are replaced by the true contract, in the bullet's existing voice and saying no more than this: a **quarantine**-severity finding (and unscannable binary content) still preserves the working-tree copy into `state/quarantine/` and reverts the file, uncommitted; a findings set with **no** quarantine-severity finding is **redacted in place** — the unredacted original is preserved into `state/quarantine/redacted/` first, then only the lines this run added are replaced with their sanitized form and the note is committed, announced in the dream report. Everything else in the bullet — the mode facts, the binary fail-closed sentence — is byte-unchanged | **this is the exact negation of the WP**, in the document the repository holds up as its security claim. Shipping code that falsifies a shipped threat model is worse than shipping neither. Both legs' reviewers converged on it independently; the repo precedent for a clause-scoped THREAT-MODEL row is `docs/specs/done/WP-stance-authority-containment.md`, whose Deliverables row reads `\| modify \| docs/THREAT-MODEL.md \| **D7** — the stance clause …` |
| **Q11** | `docs/THREAT-MODEL.md:134` — the banner-lifecycle clause, `` a pending-review notice while `state/quarantine/` holds files `` | becomes a claim about **withheld notes**, not about the folder holding files: the notice renders while a withheld note is in `state/quarantine/`. The rest of the sentence — the artifact list, the `0600`/`0700` claim, the insecure-modes clause — is byte-unchanged | same falsification as **Q1** and **Q3**, one document further out. After this WP the folder can hold files the banner deliberately ignores: `redacted/`'s contents are files under `state/quarantine/`, and `listSecretQuarantine` counts direct **file** entries only, so "holds files" and "shows the notice" stop being the same condition. **The `0600`/`0700` half of the sentence is not extended to name `redacted/`** — it is covered by `state/quarantine/`, and widening the edit past the clause is what the Deliverables row forbids |
| **Q12** | `docs/THREAT-MODEL.md:132` — gate **(iv)**, whose text reads "**Any** finding omits the whole section — never an injected `[REDACTED]` rewrite" | **unchanged.** EP4 is untouched by this WP and still omits a digest section on any finding of either severity | registered because the sweep returns it and because it sits two lines from Q10: an implementer correcting Q10 is one line away from "consistently" correcting a claim that is still true. **Out of scope explicitly says EP4 does not move** |
| **Q13** | `docs/THREAT-MODEL.md:427` — the A5 residual, `Each of the four persistence gates acts on *any* detector finding, not only a hard one` | **unchanged.** It says the gates do not *ignore* a soft finding, which stays true: after this WP EP2 acts on a redact-severity finding by scrubbing and preserving rather than by ignoring it | registered because the sweep returns it and the phrase "any detector finding" is one grep away from Q10's. The residual's subject is detection coverage, not disposition; Q10 is the disposition claim and it is the only one that moves |
| **Q14** | `src/core/digest.js:567-568` — the code comment above the banner: `it renders while state/quarantine/ is non-empty and clears itself once the owner empties the directory` | both halves become claims about **withheld notes**: it renders while a withheld note is listed and clears once none are left. The rest of the comment block — the `WP-125 contract 5` provenance, the `OWNER-APPROVED` reference, the sanitized-basenames and never-read-content sentences — is byte-unchanged | **both halves are false after Q1 and the `listSecretQuarantine` change**, for the same two reasons Q1 gives, and this comment sits four lines above the string it describes. A stale comment beside a corrected string is the mechanism by which the *next* change re-derives the old contract. Its two lines join **V-5**'s permitted-removals list (`PERM5`) |
| **Q15** | `src/core/private-fs.js:101-102` — the `A5_PRIVATE_DIRS` doc comment, today `state/quarantine is WP-123's staged-output secret quarantine — it can hold raw secret bytes` | keeps that sentence byte-identical and gains one clause for the new element, in **Q6's** form: `state/quarantine/redacted/` holds **the pre-scrub original of a note whose added lines the gate rewrote** — raw secret bytes likewise. **Not "of a note that was committed"** | the obvious phrasing is the one **Q6** outlaws, and an earlier revision of "The private-tree extension, exactly" prescribed it verbatim. Table R rows R2–R7c put a copy there for a note the gate then **withheld**, and consequence 2 keeps it in two of those combinations |
| **Q18** | **`src/core/dream/validate.js` — the `WienerdogError` row B3b raises.** NEW copy, introduced by round 6's design answer and left ungated until round 7 | the message states: **the vault-relative path**; **which preserves failed**; **whether an identity check could be performed**; and **whenever the `redacted/` copy survives, its basename**. Metadata only — the path, the basename (already sanitized by `displayName`) and the outcome words; **never a matched byte, never a line of the note**. It must **not** reuse Q8's suffix wording: Q8 belongs to consequence 2, which never runs on an abort | **this is the ONLY surface that reaches the user on an abort**, and on row **R0b** the `redacted/` copy is the only record of the pre-save version. Step 4 never appends, so no report line exists; `reverted[]` is never rendered, so no CLI summary exists; no banner fires. **Without the basename in this message the user's only pre-save bytes sit in a folder nothing points at.** **EACH OF THE FOUR FIELDS IS HELD SEPARATELY, and until round 8 only one was.** Round 7 wrote four fields into this row and then held exactly one of them: AC-9, FI-17, FI-18 and FI-19 all asserted "the error names the surviving `redacted/` basename", and M-51 mutated the basename away. **An implementation that raised `new WienerdogError('preserve failed')` — no path, no which-preserve, no identity disposition, but with the basename appended — satisfied every assertion this document had.** The holders, one per field: **the path** — asserted on all three arms, mutated by **M-53**; **which preserves failed** — asserted on all three arms and DISCRIMINATED between them (on **R0** both preserves failed; on **R0b** only B3's did), mutated by **M-54**; **whether an identity check could be performed** — asserted with a DIFFERENT expected value on each of the three arms (**R0**: not performed, there was no copy to compare against; **R0b via FI-17/FI-18**: performed and MISMATCHED; **R0b via FI-19**: attempted and NOT POSSIBLE, the read threw), mutated by **M-55**; **the surviving basename** — asserted on the two R0b arms and asserted **ABSENT on R0**, where no copy exists, mutated by **M-51**. *Round 6 decided the content and shipped it with no Table Q row, no assertion and no mutation — the identical shape to the K4-throws hole the same round closed* |
| **Q16** | `docs/runbooks/incident.md:89` (the artifact table row `\| quarantine \| $CORE/state/quarantine/ \| reviewed in step 4 \|`) and `:379` (`Also review $CORE/state/quarantine/ … see secret-incident.md step 3`) | **unchanged, and the file is not in Deliverables.** Both are pointers: one names a path in a recovery inventory, the other delegates the handling to `docs/runbooks/secret-incident.md` step 3 — which **is** in Deliverables and gains the `redacted/` bullet (**Q4**) | the delegation is what makes this correct rather than lucky: the general incident runbook states no lifecycle claim and no disposition, so correcting step 3 of the secret runbook corrects this surface transitively. Registered in one row so the next sweep does not re-derive it, and so nobody widens the diff into a second runbook |
| **Q17** | `src/core/dream/validate.js:900-903` — the Step-3 header comment, in **this WP's own primary file**. Two claims: `ANY detector finding … quarantine-preserves the working-tree file, then reverts it` and `` the sanitized `.text` is never written back (revert, never rewrite) `` | both are replaced by the true contract, **in Q10's words** — the same claim in the same voice, because the threat model and the code comment describe one behaviour and must not describe it two ways: a **quarantine**-severity finding (and unscannable binary content) preserves the working-tree file into `state/quarantine/` and reverts it, uncommitted; a findings set with **no** quarantine-severity finding is redacted in place — the unredacted original is preserved into `state/quarantine/redacted/` first, then only the lines this run added are replaced with their sanitized form and the note is committed, announced in the dream report. The superseded `OWNER-APPROVED 2026-07-17` citation goes with the clause it justified and is replaced by the authority that actually carries this WP: **ADR-0034 supersedes ADR-0024's WP-123 "reverts on ANY finding" amendment for this gate only, and EP4's gate is unchanged** — which is the first `OWNER-RATIFIED` blockquote's item 1, cited, not re-decided. **Lines `:897-899` (the section header and the "bytes THIS run is responsible for" sentence) stay byte-identical**; the four false lines reflow into the replacement, exactly as Q14's do. **The replacement must keep naming `state/quarantine/`** — it does above — or V-26's sweep emits a `-` line for this file | **the exact negation of this WP, four lines above the code it describes**, and the second clause is **Q10's second sentence in the same words**. The Deliverables row for `validate.js` enumerates that file's changes precisely and named none of this until round 7, so a byte-faithful implementer would have left it: **M-32's mutation shipped as the default**, in the one file every future reader of this gate opens first. Found by the reviewer **by hand, in round 7**, which falsifies this section's previous claim that the derived sweep meant "round 7 cannot find a fifth surface by hand" — see "The sweep's own pattern is a member of the contract" below. Bounded by **V-28** and mutated by **M-33** |

**What Table Q does not touch.** The banner's *head* — everything from
`N dream note(s) were withheld from your vault because they appear to contain a
secret — <names>.` through `Review the copies in state/quarantine/: restore`
**and the single space that follows it**, which closes source line 575 — is
byte-identical on both source lines 574 and 575. The
`## Reverted by orchestrator (policy enforcement)`
section, B2/B3's reason strings and the `(quarantine copy failed)` suffix at
`validate.js:946` are byte-frozen (Out of scope, M-25). **V-5 is the check**, and
round 5 rewrote it: its previous form greped the whole `digest.js` diff for
`withheld from your vault`, which is a **context** line of the hunk Q1 changes,
so it fired on an edit that left the banner alone — fail-closed, but stricter
than the sentence "the withhold banner text was edited" it printed. It is now a
bounded-removed-lines check in V-13's shape.

#### Table Q membership — derived, not recalled

**This is the output of V-26's sweep, run at `efd1489` on 2026-07-26 with the
round-7 pattern, with every hit dispositioned.** It is reproduced so that the
family's membership is auditable without re-running anything, and so that a
reviewer can check the *dispositions* rather than re-deriving the *set*. The
exact command is in V-26.

**Execution record — the file set is re-derived whenever the pattern moves, never
predicted.** Round 7 widened `QSWEEP`'s `any…finding` alternation (rule 3 below).
The sweep was then re-executed at `efd1489` on 2026-07-26, and the new set is the
one V-26's `QREG` heredoc registers — **ten files**, the round-6 nine plus
`src/core/dream/validate.js`. The widening added exactly **two** line-level hits
and nothing else: `src/core/dream/validate.js:900` (row **Q17**) and
`src/core/digest.js:499` (registered below as a non-member; that file was already
in the set). Both are dispositioned in the table.

| file:line at `efd1489` | disposition |
|------------------------|-------------|
| `docs/GLOSSARY.md:79` | **Q6** + "The glossary edit, exactly" (the gate sentences) |
| `docs/GLOSSARY.md:85`, `:86`, `:89` | **Q6** (the **secret quarantine** entry) |
| `docs/THREAT-MODEL.md:130` | **Q10** — rewritten |
| `docs/THREAT-MODEL.md:132` | **Q12** — unchanged (EP4) |
| `docs/THREAT-MODEL.md:134` | **Q11** — one clause rewritten |
| `docs/THREAT-MODEL.md:427` | **Q13** — unchanged |
| `docs/runbooks/codex-review.md:44` | **not a member.** The sweep is deliberately over-inclusive; this line is prose about *review* findings (`anyone acts on a finding`) and says nothing about EP2. Registered so the file-set check has a reason to expect this file, and so nobody edits it to "clean up" the sweep |
| `docs/runbooks/incident.md:89`, `:379` | **Q16** — unchanged, delegates to the secret runbook |
| `docs/runbooks/secret-incident.md:41`, `:43`, `:48` | **Q3** — the step-3 bullet |
| `docs/runbooks/secret-incident.md:80` | **Q5** — the step-5 bullet |
| `src/core/digest.js:499` | **not a member, and not falsified.** EP4's own gate comment, `ANY detector finding … omits the WHOLE section; the redacted .text is discarded, never injected`. It is Q12's claim in code and stays true for the same reason: **EP4 is untouched by this WP** and still omits a digest section on a finding of either severity. New to the sweep in round 7 (the widened alternation), and byte-frozen by V-5's `PERM5` bound, which permits no removal here |
| `src/core/digest.js:567` | **Q14** — the comment |
| `src/core/digest.js:575` | the banner **head**, byte-frozen ("What Table Q does not touch") |
| `src/core/digest.js:576` | **Q1** — the closing sentence |
| `src/core/dream/ledger.js:368` | **Q2** — the exhausted-transcript banner |
| `src/core/dream/ledger.js:390` | **Q9** — unchanged |
| `src/core/dream/validate.js:900` | **Q17** — rewritten. The Step-3 header comment, in **this WP's own primary file**, stating this WP's exact negation twice. New to the sweep in round 7 |
| `src/core/private-fs.js:101` | **Q15** — the `A5_PRIVATE_DIRS` doc comment |
| `src/core/secret-scan.js:235` | **not editable, and not falsified.** `hasHardFinding`'s JSDoc says it is "the signal a persistence gate uses to withhold/revert the whole artifact" — which is exactly what this WP makes it, for the first time. The file is leg 1's and the Deliverables table forbids touching it |

**Why the line numbers are documentation and the check is not.** Leg 1 edits
`docs/GLOSSARY.md` and `src/core/secret-scan.js`, so several of these line numbers
will have moved by the time this WP is implemented. **V-26 therefore pins the set
of matching *files*, not the line numbers** — that is what catches a *new* surface
appearing in a file nobody dispositioned, which is the failure mode four rounds
running. The *content* of every member is pinned separately, by V-5 (Q1/Q14),
V-13 (Q3/Q4/Q5), V-22 (Q6), V-24 (Q2/Q9), V-27 (Q10/Q11) and V-28 (Q17).

#### The sweep's own pattern is a member of the contract

**A predicate derived from a tool is only as wide as the tool, and until round 7
the tool's own coverage was not a registered surface.** `QSWEEP` was hand-written
in round 6 from remembered phrasings. Its `any…finding` alternation read
`[Aa]ny[^.]{0,25}finding` — case-insensitive on the **first letter only** —
while every shipped comment in this family writes the word `ANY`. `ANY` scored
zero, no other alternation reached those lines, and `grep -cE "$QSWEEP"
src/core/dream/validate.js` returned **0** at `efd1489`, so the file-set diff
could never emit a `+` for it. Membership *looked* derived and was still, in one
alternation, recalled. **Leg 1 hit the identical failure in the same round from
the other side of the same seam** — a hand-seeded shape vocabulary in its own
sweep — which is what makes this a rule rather than a typo fix.

1. **`QSWEEP` is part of this contract's canonical text, not verification
   plumbing.** It is decided in **V-26** and nowhere else, and it is read like a
   Table Q row: a mirror may cite it; nothing may restate it.
2. **It changes only when the *predicate* changes** — never to make V-26 pass. A
   red V-26 carrying a `+` line is a surface nobody dispositioned; the repair is
   a Table Q row, not a narrower pattern. A red V-26 carrying a `-` line is an
   edit that went further than its row allows; the repair is the edit.
3. **Every time the pattern moves, the file set is re-derived by execution and
   the execution record is written into "Table Q membership"** — the pattern
   change, the date, and the resulting set. Predicting the set is how a widened
   pattern ships with a stale register; the round-7 record is the worked
   instance.
4. **A hand-written character class in the pattern is a seed, and is registered
   as one here.** What remains hand-written after round 7's widening is the
   literal path string `state/quarantine`, the `rewrit` stem and the
   `banner|notice` pair — all stems rather than whole words, which is the
   property the `any`/`ANY` class lacked. **That the class is now the only one
   that mattered was checked, not argued** (executed 2026-07-26): re-running the
   sweep with `grep -ril` — every alternation case-insensitive — returns the
   **same ten files and the same lines, with no addition**. No further
   case-sensitivity seed survives in this pattern.

### Table N — canonical: the retention contract for `state/quarantine/redacted/`

**Extracted in round 4 of the design gate, mandated for the same reason as
Table K: a third consecutive round of findings on one family.** Round 1 fixed the
prune's granularity, round 2 found the "decades of runs" arithmetic false and
added a precedence, round 3 found that **precedence contradicting B12's own
trigger condition** — a self-correction claim that a conforming implementation
cannot satisfy. **Every retention fact is decided here.**

| # | fact | value |
|---|------|-------|
| **N1** | **the cap** | **50** files in `state/quarantine/redacted/`. Owner-approved (the second `OWNER-RATIFIED` blockquote names the number and the choice to bound `redacted/` while leaving `quarantine/` unbounded) |
| **N2** | **the trigger** | the prune runs **once per gate run**, after the loop over changed paths, **and only if at least one B4 completed** (Table R row **R8**). A run that completed no redaction does **not** prune. **Never after a bare preserve**, so B5/B5a fall-throughs never prune |
| **N3** | **the candidate set** | regular files in `redacted/` matching `^[0-9]{4}-[0-9]{2}-[0-9]{2}-`, **minus every basename this run created**. The exclusion is the whole set the run wrote, not the last one |
| **N4** | **the ordering** | `(mtimeMs, name)` ascending over N3's candidates. `mtimeMs` first because filenames are `<date>-<basename>` and sort by *basename* within a date; `name` second only to break ties |
| **N5** | **the precedence when N1 and N3 conflict** | **N3 WINS; the cap yields.** Delete oldest candidates until at most N1 remain **or no candidate is left**, whichever comes first. A run creating more than N1 originals therefore ends **above** the cap, holding exactly its own copies |
| **N6** | **the overshoot's lifetime** | **until the next run that completes at least one B4** — not "the next run". A zero-redaction run does not prune (N2), so it cannot clear an overshoot. The bound is therefore *"at most N1, or the size of the most recent redacting run's output"*, and it is not time-bounded |
| **N7** | **failure** | best-effort. A failed prune is ignored and the arm still completes |

#### The N2/N6 decision — architect's, recorded, and it does not touch the approval

**Round 3 found N6's predecessor claiming the overshoot "lasts one inter-run
interval" and AC-14 mandating a test that "a subsequent run with no redactions
prunes it back".** Both are false against N2: a zero-redaction run never prunes.
Executed arithmetic confirms the shape — from an empty directory 51 completed B4s
leave 51 files (all protected); from a full one, the 50 old candidates are
deleted and the 51 new ones remain. **The mandated assertion fails against a
conforming implementation**, which is a spec bug, not an implementer's problem.

Two repairs were available and **the architect chose the first**:

- **(i) Keep N2, weaken the claim.** The overshoot clears on the next *redacting*
  run, and N6 says exactly that.
- **(ii) Make the prune unconditional**, so every run — including zero-redaction
  ones — prunes.

**Chosen: (i). The reasoning, so it can be disagreed with:**

1. **N2's condition is a SAFETY property, not an accident of drafting.** The
   prune is a **delete path** operating on the only pre-scrub copies of the
   user's own text. Gating it on "this run successfully completed a redaction"
   means a run that failed — that withheld everything, that hit R0 or R9 — never
   runs a delete path over the recovery directory. **Option (ii) trades that
   property for a tidier sentence**, and this design refuses that trade
   everywhere else: Table R consequence 2's deletion is likewise the *last*
   statement of the fall-through, gated on B3's revert having succeeded.
2. **The overshoot is bounded and harmless.** It is bounded by one run's
   redaction count; it adds nothing on subsequent runs, because only redacting
   runs write; and what it holds is 0600 files inside 0700, on the A5 private
   tree, never committed, never synced. **The cost of (i) is a longer sentence.
   The cost of (ii) is a delete path that runs on failed runs.**
3. **(ii) would also change a row a standing owner approval names**, and while
   the round-4 post-approval rule makes that *recordable*, spending an owner
   decision to buy a worse safety property is not a trade worth putting to him.

**This is an architect decision under the post-approval rule, and it changes
nothing the owner approved**: N1's cap and the bound/unbounded choice are
untouched — only the *description* of how long an overshoot persists, and an
acceptance criterion that mandated an impossible test. **No owner action is
required.** Recorded here rather than in the dated post-approval list because it
adds no content to an approved row; if a later round makes the prune
unconditional, that **is** a content change and goes in the list.

**Its mirrors, all citations**: Table B row **B12**, Table R **consequence 7**,
the **B12/B13 growth story**, **AC-14**, the **Security checklist** prune bullet,
and mutation **M-48**. None may restate a number from this table.

### Table K — canonical: every read of the target inside the redact arm

**Extracted in round 4 of the design gate, and the extraction was mandated.**
Three consecutive rounds produced findings on this family — round 2 rebuilt the
read counter's meaning, round 3 found rule 1 still saying "exactly one read"
while five other surfaces said two, and found **R2 and R7c both owning a
throwing comparison read with different artifact outcomes.** The last of those
made the twelve-row matrix non-disjoint, i.e. not testable as written. **The
count, the encoding, the position, the arming rule and — critically — EACH
READ'S FAILURE OUTCOME are decided here and nowhere else.**

**How many reads occur depends on the path, and the position column below is
what says so:** **two** on the success row (K1, K2); **three** on an ordinary
fall-through (K1, K2, K3); **four** on the B3b identity branch (K1, K2, K3, K4).
Every count in this document is a count of *these* reads. *Round 5's header said
"exactly THREE across a fall-through", which K4 had already made four.*

| # | which read | encoding | position in the arm | what anchors it | if it THROWS | if its bytes DIFFER from `captured` |
|---|-----------|----------|---------------------|-----------------|--------------|-------------------------------------|
| **K1** | `quarantinePreserve(…, 'redacted')` — **the capture** | **Buffer** (no encoding argument) | the **first** read of the target inside the arm; B10 makes it so | **it is the arming read.** Counting starts here, not at the start of the run — Step 2 reads the same path up to three times before the gate on a Tier-3 or new-skill-draft fixture (Table B row **B11**), and an absolute counter puts every later injection one row off | the preserve returns `null` → **B5**, and the terminal row is **R1** or **R0** depending on B3's own preserve (Table R) | *not applicable* — this read **defines** `captured` |
| **K2** | `scrubAddedLines`'s **pre-rename comparison** (rule 2) | Buffer | **after** the temp write and the index stage, **immediately before** `fs.renameSync` | the second read of the target counted from K1 | **row R2, exclusively.** A read error does **not** establish that the target changed, so the `redacted/` copy is **deleted** by the ordinary fall-through (Table R consequence 2) | **row R7c, exclusively.** The target demonstrably changed, so the `redacted/` copy is **kept** and named by Q8's suffix |
| **K3** | B3's `quarantinePreserve(…, 'withheld')` on a fall-through | Buffer | after the arm has returned `false`, inside B3 | counted from K1, the read that follows K2 — **only reached on a fall-through**, so the success row R8 makes exactly two reads | the preserve returns `null` → **R0** if K1 also failed; otherwise **K4** runs and decides: equal bytes take consequence 2's first keep-combination, anything else is **R0b** | it writes what it read; consequence 2's `Buffer.compare` then finds the two copies differ and **keeps** both |
| **K4** | **the IDENTITY read** — re-read the target and compare against the `redacted/` copy, when B3's preserve (K3) returned `null` | Buffer | after K3 failed, **before** B3 performs any revert | reached **only** on the B3b branch; on every other path it does not happen at all | **abort (row R0b).** A read that cannot be performed cannot show the file is recoverable, and the conservative direction keeps the user's bytes. **This outcome has its own injection, FI-19** — round 5 shipped it untested, and an implementation that aborted on mismatch but reverted on a throw passed every mandated arm | **abort (row R0b).** The durable copy is of different bytes, so reverting would destroy the only copy of what is on disk |

**K2's two outcome columns are the round-3 repair and the reason this table
exists.** Before it, a throwing comparison read satisfied **both** R2 ("the file
could not be read at the compare") and R7c ("the pre-rename re-read does not
compare equal … *or that read throws*"), and the two rows prescribed **opposite**
artifact outcomes — R2 deletes the `redacted/` copy, R7c keeps it. Table T's FI-2
row repeated the contradiction from the other side. **The split is stated once,
here: exceptions are R2's, mismatches are R7c's, and nothing else is.** The
justification is one sentence and it is the whole of the argument: **a read error
does not establish that the target changed**, so it must not trigger the
keep-the-copy behaviour that exists *because* the target changed.

**Everything else in this document CITES this table and restates no number.**
Rule 1 (there is no read for *content*), rule 2 (K2 exists and what it does),
the Table T preamble's arming rule (K1), **FI-2** (perturbs K2 → R2),
**FI-11** (perturbs K3), **FI-15** (asserts exactly K1 and K2 occur, in that
order and at those positions, on a completed R8), **FI-16** (modifies the target
before K2 → R7c), **AC-9**, and mutations **M-46**/**M-47**. **Row K4 and its
abort outcomes are cited by Table B row B3b and Table R row R0b.**

#### K4 IS A FILTER, NOT AN AUTHORIZATION — and round 5 shipped it as the latter

**The defect, stated as the reviewer found it.** K4 reads the file at one
instant and B3 destroys it at a later one. **An editor save in that window is
destroyed by a revert that K4 has already "cleared".** The same is true one row
over: **K3 succeeding does not make the revert safe either** — it preserves the
bytes as they were at K3, and a save after K3 is gone at revert time. Round 5's
own composition note called the K3-success paths safe "by construction", which
was true at write time and stale by revert time.

**This is the check-authorizes-later-destruction class**, and no amount of
re-reading closes it: every check is at T0 and every destruction is at T1.

**What K4 therefore does and does not do:**

- **It DOES** turn a *known* stale copy into an abort. Without it the gate
  reverts whenever any copy exists, including one demonstrably of different
  bytes — the round-4 cross-product. **K4 never produces a worse outcome than
  its absence**, which is why it stays.
- **It does NOT** make the revert safe. **No surface in this document may say
  it does** — and that is an assertion with a check beside it rather than a
  claim: **verification step V-31's terminology sweep** takes the prose view,
  **joins each paragraph onto one line and collapses its whitespace**,
  **subtracts a registered list of anchored fragments**, and then fails on any
  surviving co-occurrence of a safety word with a revert word. Round 6 stated
  this universal and round 6's own review falsified it at two canonical
  surfaces, which is why it has a grep instead of a promise. **Round 8 rebuilt
  the grep twice over**, because the round-7 form was itself two of the defects
  this document keeps finding: it was **line-local**, so the reviewers' wrapped
  claim passed green, and it **filtered whole lines through the allowlist**, so
  one floating entry excused everything beside it. Both are now measured, and
  the step carries a negative self-test that re-runs the published wrap attack.

**THE RESIDUAL RACE IS INHERITED, NOT CREATED HERE, AND THAT IS THE WHOLE
REASON IT IS A RESIDUAL RATHER THAN A BLOCKER.** Verified against shipped
`main` in this pass: `quarantinePreserve` reads the target at
`validate.js:654` and B3 then calls `revertPath` / `fs.rmSync` — **the identical
read-then-destroy window, on every withhold, for every severity, since
WP-123.** This WP adds paths that reach B3; it does not add the race. **Closing
it properly means changing how B3 destroys — an atomic path handoff, taking the
file by `rename(2)` instead of reading it and trusting the read — which changes
the shipped withhold path for `quarantine`-severity findings too and is
therefore a different WP.** Accepted residual **11** states it; the
owner-decision section "Abort the fall-through, or keep it?" states the one
alternative that is inside this WP's reach and explains why it is the owner's
call and not the architect's.

### Table R — canonical: the redact arm's outcome matrix

**This table is the single place the redact arm's failure-and-return semantics
are decided.** Every other surface in this document that mentions a return value,
a post-failure disk state, a counter or a `reverted[]` push is a mirror of a cell
here and defers to it: the two JSDoc blocks under "Exact contracts", Table B rows
B4/B5/B5a/B9a/B10/B12, acceptance criteria AC-9 and AC-24, mutation rows
M-16/M-17/M-20/M-21/M-28/M-30, **Table Q** row **Q8** (the one reason string this
table owns), and **Table T**, which decides how each row is produced and observed
but changes no cell here. If a review finding changes a cell, it changes it
**here** and then walks the Mirrored Surface Checklist; a fix applied to a mirror
alone is the mirror-promotion failure ADR-0031 exists to prevent.

`P` = `quarantinePreserve(…, 'redacted')`, `S` = `scrubAddedLines`,
`A` = the **index-first stage** from Table B row B10 (the three `allowFail` git
calls), which `S` performs internally between its temp write and its rename.

**The two disk columns are read at two different times, and that is deliberate.**
The working-tree column is the file **at the instant `S` returned** — before the
fall-through runs. The index column is the state **when the row finishes**, i.e.
after the fall-through and **before Step 4 writes a byte of the report**. They
cannot share a time point: Table R consequence 1 explains why the working-tree
cell is unassertable once B3 has run (B3 restores a tracked file to `HEAD` and
removes an untracked one, so *no* row's file equals its pre-scrub content
afterwards). Step 3's opening `git add -A` (`validate.js:904`) has already staged
the raw original, so "raw" in the index column is the *inherited* state; a row
that says anything else has actively changed it.

**This table is total over the fallback path, not only the primary one.** Rows
R1–R7c all end in B3, and B3 can itself fail **in three different ways** — which,
with **R7c**, is why the table has **thirteen** rows where round 7's had ten.
**All three abort; none of them reverts.**

- **Row R0b** is the fallback's *preserve* failing while a copy exists that is
  **not of the bytes on disk** — the round-4 cross-product. Same abort, different
  way in.
- **Row R9** is the fallback's *git* failing: the preserve worked, but
  `git checkout HEAD -- rel` or B3a's `git add -A -- rel` exited non-zero.
- **Row R0** is the fallback's *preserve* failing **on the same branch R1 starts
  from** (B5, i.e. `P` returned `null`) — both preserves down, no durable copy
  anywhere. It is not reached *from* R1; R1 and R0 are the two terminal outcomes
  of that one branch, split by whether B3's own preserve succeeded. **Round 1 of the design gate found
  that this outcome had no row and that the code path reached it by DESTROYING
  the note**: B5 handed a failed preserve to B3, B3 called the same preservation
  mechanism against the same `stateDir`, and reverted or removed the file
  whether or not that second call had also failed. The two fail together for the
  missing-`stateDir` case this table already names, and for any shared ENOSPC or
  permission fault. **B3b is the repair and R0 is its outcome: abort without
  touching the working tree or the index.**

**The rule underneath all three, stated once: the gate may lose a RUN, and may not
lose a NOTE.** Every row of this table either leaves the user's bytes somewhere
durable or leaves them exactly where they already were. No row deletes the last
copy of anything.

**R1 AND R0 ARE DISJOINT BY DEFINITION, AND ROUND 2 OF THE DESIGN GATE HAD TO
MAKE THEM SO.** Round 1 added R0 but left R1 reading "the preserve failed — any
cause, **including a missing `stateDir`**", with unconditional cells: index
cleared, file reverted or removed, `secretReverts` +1. **A missing `stateDir`
makes B3's second preserve fail too**, which B3b/R0 says must abort doing none
of those things — and FI-12 names that exact input. So the canonical table gave
an implementer or a test author **mutually exclusive instructions on the
original data-loss path**, which is the path R0 was added to close. The
shared-ENOSPC case walked correctly to R0; the `stateDir` case did not.

The repair is a definition, not a qualifier:

- **R1 is "the `redacted/` preserve failed AND B3's preserve succeeded".** Both
  clauses are the row. Its cells are unconditional again *because* the second
  clause is now part of the condition.
- **Every cause that fails BOTH preserves belongs exclusively to R0** — missing
  `stateDir`, shared ENOSPC, an unwritable quarantine tree. **The shared branch
  is named B5 or `P = null` throughout, never "row R1"**, because R1 is a
  terminal outcome and the branch is not. `stateDir` is
  removed from R1 and from FI-1, and lives only under R0/FI-12.
- **R1 therefore needs a fault that is PATH-SPECIFIC**, which round 1's did not
  have: the injection must fail writes under `<stateDir>/quarantine/redacted/`
  while letting a direct write into `<stateDir>/quarantine/` succeed. FI-1
  carries it. **It is the exact mirror of FI-10**, which fails the other side —
  and stating the pair together is what makes each one obviously reachable:
  FI-1 → redact preserve fails, withhold preserve succeeds (**R1**);
  FI-10 → redact preserve succeeds, withhold preserve fails (**consequence 2's
  first keep-combination**); FI-13 → **both** fail (**R0**).

| # | outcome | `P` | `S` | working-tree file **at the instant `S` returned** | `redacted/` copy when the row finishes | index **when the row finishes** | next row | `secretRedactions` | `secretReverts` | in `reverted[]` | fault injection |
|---|---------|-----|-----|---------------------------------------------------|----------------------------------------|----------------------------------|----------|--------------------|-----------------|-----------------|-----------------|
| R1 | **the `redacted/` preserve failed AND B3's own `withheld` preserve then SUCCEEDED** — so a durable copy of the note **as of K3** exists in `state/quarantine/`, and the ordinary withhold **proceeds** — subject to **residual 11**, the inherited race between that copy and the revert, which no cell of this table closes. **The two conditions are BOTH part of the row's definition** (round 2 of the design gate; see the note under this table) | `null` | *not called* | **byte-unchanged** (nothing was written) | **none exists** — the redact preserve is what would have written it | **cleared** by B3 (tracked → HEAD; untracked → dropped by **B3a**) | **B5 → B3** | — | +1 | yes | FI-1, which is now a **path-specific** fault: only writes under `redacted/` fail, while a direct write into `quarantine/` succeeds |
| R2 | **read K2 THREW** — the pre-rename comparison read could not be performed at all. **R2 owns comparison-read EXCEPTIONS exclusively, and R7c owns byte mismatches exclusively (Table K row K2).** The two were both claiming a throwing read until round 3, with opposite artifact outcomes; the split is decided in K2 and the reason is one sentence: **a read error does not establish that the target changed**, so it must not trigger the keep-the-copy behaviour that exists because it did | `{name, bytes}` | `false` | **byte-unchanged** | **deleted** by the fall-through (consequence 2 — *kept* in either of its two keep-combinations) | **cleared** by B3/B3a | **B5a → B3** | — | +1 | yes | FI-2, and **FI-11**, which reuses this row as its vehicle |
| R3 | a hunk line number is outside `1 … lines.length` | `{name, bytes}` | `false` | **byte-unchanged** — bounds are checked before any indexing and before any write | **deleted** (consequence 2 — *kept* in either of its two keep-combinations) | **cleared** by B3/B3a | **B5a → B3** | — | +1 | yes | FI-3 |
| R4 | the re-scan of the rewritten added lines still finds something | `{name, bytes}` | `false` | **byte-unchanged** — verify precedes write | **deleted** (consequence 2 — *kept* in either of its two keep-combinations) | **cleared** by B3/B3a | **B5a → B3** | — | +1 | yes | FI-4 |
| R5 | the temp write failed — open, or part-way through | `{name, bytes}` | `false` | **byte-unchanged** — this is what the same-directory temp buys; a truncating whole-file write would leave a half-scrubbed note here and B3 would preserve **that** as the original | **deleted** (consequence 2 — *kept* in either of its two keep-combinations) | **cleared** by B3/B3a | **B5a → B3** | — | +1 | yes | FI-5a *(open fails)* **and** FI-5b *(fails mid-write, after the temp is partly written)* |
| R6 | the rewrite is a **no-op** — the computed content equals the file's current bytes | `{name, bytes}` | `false` | **byte-unchanged** (nothing was written) | **deleted** (consequence 2 — *kept* in either of its two keep-combinations) | **cleared** by B3/B3a | **B5a → B3** | — | +1 | yes | FI-6 |
| R7 | the **index-first stage** failed — any of B10's three git calls returned non-zero, or `ls-files --stage` returned empty stdout | `{name, bytes}` | `false` | **byte-unchanged** — the rename never ran, which is the entire point of staging first | **deleted** (consequence 2 — *kept* in either of its two keep-combinations) | **cleared** by B3/B3a — tracked: `git checkout HEAD -- rel` rewrites it to HEAD; untracked: B3a's `git add -A -- rel` drops the entry | **B5a → B3** | — | +1 | yes | FI-7 |
| R7b | the stage **succeeded** and the `fs.renameSync` onto the target failed | `{name, bytes}` | `false` | **byte-unchanged** — `rename(2)` within one directory is atomic, so there is no partial outcome | **deleted** (consequence 2 — *kept* in either of its two keep-combinations) | the stage left the **sanitized** blob here; B3/B3a then **clear** it exactly as above. Nothing raw is ever staged on this row | **B5a → B3** | — | +1 | yes | FI-7b |
| **R7c** | **read K2 SUCCEEDED and its bytes DIFFER from `captured`** — the target demonstrably changed under the arm. **A throwing read is NOT this row; it is R2** (Table K row K2). The realistic cause is the note's own owner saving it in an editor mid-dream | `{name, bytes}` | `false` | **byte-unchanged BY THIS GATE** — the rename never ran, so what is on disk is the user's own save, which is the point of the row. **Note this is the one row whose working-tree file does not equal the CAPTURED bytes**, and that is the condition being detected rather than a violation of consequence 1 | **kept** — B3's own preserve reads the *post*-save bytes, so consequence 2's `Buffer.compare` finds the two copies differ and takes its second keep-combination. Q8's suffix names it, and it is then the only copy of the **pre**-save version anywhere | the stage left the **sanitized** blob here; B3/B3a then **clear** it exactly as on R7b. Nothing raw is ever staged | **B5a → B3** | — | +1 | yes | **FI-16** |
| R8 | **success** | `{name, bytes}` | `true` | **scrubbed** — the only row where it is | **kept**. That is the feature | **scrubbed**, by `A` itself, and it was scrubbed there *before* the working tree was | B4 completes | **+1** | — | **no** | — |
| **R0** | **NO DURABLE COPY EXISTS AND THE FALL-THROUGH WOULD DESTROY THE ONLY ONE** — reached on **the branch R0 and R1 SHARE**: the `redacted/` preserve returned `null` (Table B row **B5**), so nothing is in `redacted/`. R0 is the case where **B3's own `quarantinePreserve(…, 'withheld')` ALSO returns `null`** — the case R1's second clause excludes. **R0 is NOT reached "from R1"**: R1 is a terminal outcome whose definition requires B3's preserve to have *succeeded*, so the two cannot both hold, and calling the shared branch "R1" risks applying R1's revert and index-clearing before the loss-prevention path is recognised. Refer to the shared branch as **B5** or as **`P` returned `null`**, never as R1. Both preserves have now failed, for the same cause in every realistic case: a missing `stateDir`, ENOSPC, or an unwritable/permission-denied quarantine tree | `null` | *not called* | **byte-unchanged** (nothing was ever written to it) | **none exists**, and none is created | **raw**, inherited from Step 3's `git add -A` and deliberately NOT cleared — clearing the index entry is part of the revert this row refuses to perform | **NONE — B3 ABORTS.** The revert does not run: the working-tree file is **not** reverted to `HEAD`, an untracked file is **not** removed, and B3a does **not** drop the index entry. `git()` is never called, so nothing throws for the wrong reason. The gate raises a `WienerdogError` naming the path and both failed preserves, exactly as row R9 does, so Step 4 never appends, Step 5 never stages, **no commit is made**, and the dream job exits non-zero with its failure banner | *never returned* | *never returned* | *never rendered* | **FI-12** (`stateDir` undefined on both preserves), **FI-13** (ENOSPC on every write under `<stateDir>/quarantine/`), **FI-14** (permission failure on the quarantine tree) — each run **twice**, once with a TRACKED target and once with an UNTRACKED one |
| **R0b** | **A DURABLE COPY EXISTS BUT IT IS NOT OF THESE BYTES** — the redact preserve SUCCEEDED (so `redacted/` holds the bytes captured at **K1**), the arm then fell through on any of R2–R7c, **B3's own `quarantinePreserve(…, 'withheld')` returned `null`**, and the identity read **K4** shows the file now on disk is **not** byte-identical to the `redacted/` copy — or K4 could not be performed at all. The realistic cause is the note's owner saving it mid-dream, which is the same cause R7c and FI-11 exist for | `{name, bytes}` | `false` | **byte-unchanged BY THIS GATE** — whatever is on disk is the user's own text, and it is precisely because it is *not* the captured bytes that this row exists | **kept** — it is the only copy of the pre-save version. **It is NOT deleted**: consequence 2's deletion never runs on this row, because the fall-through aborts before reaching it. **It is named by B3b's `WienerdogError`, NOT by Q8's suffix** — Q8 belongs to consequence 2, which never runs here, and `reverted[]` is never rendered because Step 4 is never reached | **raw** (from R2–R7) or **sanitized** (from R7b/R7c), and deliberately **NOT cleared** — clearing the index entry is part of the revert this row refuses to perform | **NONE — B3 ABORTS (row B3b).** The revert does not run: a tracked file is **not** restored to `HEAD`, an untracked file is **not** removed, and B3a does **not** drop the index entry. The gate raises a `WienerdogError` naming the path, B3's failed preserve, and the failed identity check, so Step 4 never appends, Step 5 never stages, **no commit is made**, and the dream job exits non-zero with its failure banner | *never returned* | *never returned* | *never rendered* | **FI-17** (tracked) and **FI-18** (untracked) — each combining a target modification with a second-preserve failure — **and FI-19 (tracked and untracked), via K4's THROW**, which is the read-ERROR way into this row where FI-17/FI-18 are the byte-MISMATCH way. *Round 8 of the design gate: this canonical cell named two of the three injections while **Table T row FI-19**, **Table K row K4**'s throw column, **Table B row B3b**, the Checklist's **(b3)** bullet and mutation **M-50** all named the third. Five mirrors agreed and the canonical cell did not, so the CELL moved — the mirrors were not amended to match it.* |
| R9 | **the fallback itself failed** — on any of R1–R7c, B3's tracked `git checkout HEAD -- rel` or B3a's `git add -A -- rel` exited non-zero (a held index lock, an unwritable `.git`, IO) | any | `null`/`false` | **byte-unchanged** — no row that falls through ever leaves it scrubbed | **kept.** The deletion is the last statement of the fall-through and the throw precedes it (consequence 2) | **raw** (from R1–R7) or **sanitized** (from R7b and R7c) — nothing could change it either way | **none: `git()` throws** (`validate.js:80`). The `WienerdogError` leaves `validateAndCommit` — Step 4 never appends, Step 5 never stages, **no commit is made**, the dream job exits non-zero and its failure banner renders | *never returned* | *never returned* | *never rendered* | FI-8 *(tracked checkout fails)* **and** FI-9 *(untracked B3a fails)* |

**Invariant I1 (the report boundary).** *When Step 4 begins, no path the EP2 gate
touched has this run's raw added bytes in the git index.* Rows R1–R7c clear it
through B3/B3a, R8 clears it through `A`, and **rows R0, R0b and R9 do not reach
Step 4 at all**, so the invariant is vacuous on those three rather than violated.

**The R0/R0b carve-out is explicit because both rows deliberately LEAVE the index raw** —
its whole content is that nothing is touched when no durable copy exists. Round 1
added R0 and left this invariant reading "rows R1–R7b clear it", which was false
for the R1→R0 transition and would have licensed a test asserting a cleared index
on the one row that must not have one. **A row that aborts before Step 4 does not
satisfy I1 by clearing the index; it satisfies I1 by never reaching the boundary
I1 is about.** The same distinction is why AC-24 excludes R0 alongside R9, and
why both exclusions are asserted positively — the test asserts
`fs.appendFileSync` was **never called**, not that the index happened to be
clean.

**Invariant I2 (the ordering, new in round 5 and the reason B10 was reordered).**
*At no instant does the working-tree file hold this run's scrubbed form while the
git index holds its raw added bytes.* `A` runs strictly between `S`'s temp write
and `S`'s rename, so the index reaches the sanitized state first and the working
tree second. I2 is what makes a kill inside the arm leave a repository that is
wrong in the **safe** direction; without it, the one state this WP invents — a
scrubbed file the user reads as clean over an index that still commits the secret
— is reachable by any SIGKILL, and no row of this table sees it, because neither
B3 nor R9 runs.

**Both are what AC-24 asserts**, and together they are the property that makes
"the user has been told these bytes were removed" true of the repository and not
only of the working tree. Table T rows **I1** and **I2** name the mechanisms that
observe them.

Seven consequences of this table that are easy to get wrong:

1. **`false` from `S` means THIS GATE wrote nothing to the working-tree file, in
   every row.** Round 5's index-first reordering (B10) removed the single
   exception the previous revision carried, in which a verified scrub had already
   been written to disk before the staging was attempted. There is now no row on
   which a fall-through preserves anything other than the note's true pre-scrub
   bytes.

   **The wording changed in round 1 of the design gate, from "byte-unchanged" to
   "this gate wrote nothing", and the distinction is row R7c's whole content.**
   On R7c the file on disk is *not* the captured bytes — the note's owner
   replaced it mid-run, which is the condition R7c exists to detect. The gate
   still wrote nothing: it declined to rename precisely so that the user's save
   survives. Stating the old, stronger form would have made R7c read as a
   violation of this consequence rather than as an instance of it, and would have
   licensed a test asserting something false.
   State it in the test suite the way the table states it: the byte-unchanged
   postcondition is a **unit** assertion on `scrubAddedLines`, taken immediately
   after the `false` return. It cannot be asserted at integration level, because
   by then B3 has run and B3 restores a tracked file to `HEAD` and removes an
   untracked one — so the final working-tree file **cannot** equal its pre-scrub
   content, and a test that claims otherwise is asserting something impossible.
2. **The fall-through deletes the `redacted/` copy, and the cases where it must
   not are decided here.** On R2–R7c the preserve already wrote a pre-scrub
   original into `redacted/`, and then B3 writes a second copy into
   `quarantine/`. **Ordinarily the two hold the same bytes** — the working-tree
   file is byte-unchanged on every one of those rows (consequence 1) — but
   *ordinarily* is not *always*, and the difference is the whole of the
   byte-identity guard below. Left
   alone the `redacted/` one is an orphan: it belongs to a note that was
   **withheld**, nothing announces it (B7's report section is written only on a
   completed B4), and it occupies a slot on the capped FIFO B12 decides while
   B12's prune never runs on a fall-through. It would also make Table Q rows
   **Q4** and **Q6** false — the runbook and the glossary would describe a folder
   holding copies of notes nobody scrubbed. So the fall-through deletes it:

   ```js
   fs.rmSync(path.join(stateDir, 'quarantine', 'redacted', basename), { force: true })
   ```

   where `basename` is **exactly the string `quarantinePreserve` returned** and
   nothing else is ever passed to that call — no glob, no directory, no
   reconstruction. **Three conditions, all required, each a real case:**
   - **it is the LAST statement of the fall-through, after B3's revert
     succeeded.** If the revert throws (row R9) the copy survives, which is
     right: on R9 nothing was committed, the run failed loudly, and the working
     tree still holds the note.
   - **only when a byte-identical withheld copy demonstrably exists.** B3's own
     `quarantinePreserve(…, 'withheld')` must have returned a basename **and**
     the two files must compare equal:

     ```js
     Buffer.compare(
       fs.readFileSync(path.join(stateDir, 'quarantine', 'redacted', redactedBasename)),
       fs.readFileSync(path.join(stateDir, 'quarantine', withheldBasename))
     ) === 0
     ```

     Any other outcome — B3's preserve returned `null`, either read threw, or the
     buffers differ — **keeps** the `redacted/` copy. **And when B3's preserve
     returned `null`, keeping the copy is no longer the whole answer**: row
     **B3b** first runs the identity read **K4** against the live target, and
     unless it compares equal the gate **aborts before the revert** (row
     **R0b**), so this deletion never runs on that path. Round 5 of the design
     gate: keeping the copy was sound and insufficient — the copy can be of
     bytes the revert is about to destroy. **Do not weaken this into
     "B3's preserve returned a basename".** That was the previous condition and
     it rests on an argument that does not hold; see the TOCTOU note below.
     **This guard is safe only while `state/quarantine/` is never pruned — Table
     B row B13's "unbounded, unchanged" — and that coupling is load-bearing,
     stated here because it was implicit until round 7.** The comparison reads
     the withheld copy B3 wrote moments earlier. An eviction between the write
     and the read would make the read throw, which resolves to **keep** (safe),
     but it would also mean the withheld copy the report announces can vanish —
     a B13 decision, not one this consequence may take. **If B13 ever gains a
     cap, this guard and residual 6 are re-derived from it in the same pass.**
   - **best-effort.** A failed `rmSync` is ignored and the arm still falls
     through; what is left is a stale duplicate, not a hazard. Note the
     asymmetry: a failed *read* in the comparison is not best-effort, because it
     resolves to **keep**, and keeping is always safe.

   **Whenever the copy is kept, say so in the reason.** Append one further
   suffix, decided here and used in no other combination, after the existing
   one —

   ```text
   (the unredacted original is state/quarantine/redacted/<basename>)
   ```

   `<basename>` is **`preserved.name`** — the `name` field of
   `quarantinePreserve`'s return (metadata only, already
   sanitized by `displayName`). This is a **new** string in a combination that
   does not exist before this WP, not an edit to a frozen one: B2/B3's reason
   strings and the `(quarantine copy failed)` suffix stay byte-identical
   (M-25). Without it a copy of the user's note sits in `redacted/` with nothing
   pointing at it. **One suffix covers both keep-combinations**, and that is
   deliberate: the withheld copy, where one exists, is already announced by Q1's
   digest banner and by the `## Reverted by orchestrator` line for the same path,
   so the suffix names the one copy nothing else names. Registered as a Table Q
   **Q8** mirror.

   **Why a comparison and not the argument that the two copies must be
   identical.** Consequence 1 guarantees that *the gate* writes nothing to the
   working-tree file between the two preserves. It guarantees nothing about
   anyone else, and **the two copies come from two separate reads of the same
   path with no version check between them**: `quarantinePreserve(…, 'redacted')`
   reads the target at the top of B4 (B10 makes it the first read of the file),
   and B3's `quarantinePreserve(…, 'withheld')` reads it again after the
   fall-through. A user saving that note in their editor mid-dream — an ordinary
   thing to do, not an attack — replaces the file between them. Then `redacted/`
   holds the bytes the note had at preserve time and `quarantine/` holds the
   bytes it had at withhold time, an unconditional delete destroys the **only**
   copy of the earlier version, and the code path that exists to prevent
   permanent loss is the one that causes it. The guard costs two reads of two
   files this run just wrote. **Both copies are kept and both are named** — the
   withheld one by the banner and the report line, the `redacted/` one by the
   suffix above.

   R1 never wrote a copy, so it has nothing to delete. R8 keeps its copy — that
   is the whole feature. **Two injections cover the keep-combinations: FI-10**
   (B3's preserve failed) and **FI-11** (the two copies differ), both in Table T.
3. **R6 fails closed on purpose.** `scrubAddedLines` is only ever called from B4,
   which runs only when the gate already found something on these exact lines, so
   "nothing changed" means the rewrite and the gate disagree. That is a defect,
   and a defect in a secret gate withholds.
4. **`secretRedactions` has exactly one increment site in the code**, reached only
   from R8. If it appears twice in the diff, one of them is wrong.
5. **Neither helper throws, so the `P` and `S` columns are total.** Both wrap
   their whole body in one `try` and convert every exception into their failure
   value (`null` / `false`) — `quarantinePreserve` already does this at
   `validate.js:670` and `scrubAddedLines` must copy it. The one deliberate
   exception is `quarantinePreserve`'s `kind` validation, which throws on a value
   that is neither `'withheld'` nor `'redacted'`; that argument is code-supplied
   at two call sites and never reaches this table. **A helper that let an
   exception escape would bypass every row here** and land the run in R9's state
   without R9's diagnosis, which is why "never throws" is a contract and not a
   style note.
6. **A failure of Step 4's own `fs.appendFileSync` needs no row.** On R8 the
   scrub is already written *and staged* by `A` before Step 4 runs, and on
   R1–R7c the index is already cleared, so an append that throws leaves I1 holding
   and simply aborts the run before the commit: nothing raw is staged, nothing is
   committed, and the next run re-derives the same state from the working tree.
   The failure is downstream of every cell this table decides.
7. **The retention contract is TABLE N's, and this consequence restates none of
   it.** N1 the cap, N2 the trigger, N3 the exclusion set, N4 the ordering, N5
   the precedence, N6 the overshoot's lifetime, N7 best-effort failure.

   **What belongs here is the reasoning that produced N5, because it is a
   consequence of THIS table and not of retention policy.** The prune's
   candidate set excludes every basename the run created (N3) because
   `(mtimeMs, name)` ordering does not prevent a copy this run wrote from
   sorting oldest: **ties are real** (a coarse `mtime`, several copies inside
   one filesystem tick) and so is **clock skew**, and on a tie the `name`
   component decides — which sorts by *basename* within a date, the exact
   defect N4's ordering was introduced to fix, reappearing one level up. A copy
   named in the dream report the user is about to read must not be evictable by
   the run that wrote it.

   **Two claims this consequence carried and no longer does, both false when
   measured, both recorded so the corrections are traceable.** (a) Round 1's
   "decades of runs below the cap" — 50 ÷ 9 is under six full-vault passes, off
   by three orders of magnitude, and it was the *entire* argument for the
   per-call prune. (b) Round 2's "the overshoot lasts one inter-run interval" —
   false against N2, because a zero-redaction run does not prune at all. **N6
   states the true bound and the architect's decision under Table N records why
   N2 was kept rather than the claim.**

   **Tested rather than argued: AC-14's THIRD case** — the 51+ boundary from
   both an empty and a full directory — is what holds N5 and N6. The second
   case holds N3/N4 against tied and skewed `mtime`s. *Round 3 corrected this
   pointer: it named the second case for a precedence the third one tests.*

### Table T — canonical: how every Table R row is produced and observed

**This table is the single place the testability contract is decided.** Table R
says what must be true; Table T says, for each row and each fault injection, the
**seam** that produces it, the **level** the cells are asserted at, and **why no
cheaper mechanism reaches it**. Its mirrors are: Table R's `fault injection`
column (which names ids and nothing else), the `scrubAddedLines` export note
under "Exact contracts", the `src/core/dream/validate.js` and
`tests/unit/dream-validate.test.js` Deliverables rows, acceptance criteria
**AC-9** and **AC-24**, and mutation rows **M-17**/**M-21**/**M-27**. There is no
separate "how to produce it" list any more — this table replaced it.

**The one fact everything below follows from.** `src/core/dream/validate.js`
binds its collaborators two different ways, and the mechanism you need depends
entirely on which:

- **`node:fs` is a namespace binding** — `const fs = require('node:fs');` at line
  3, and every use is `fs.<method>(…)`. Assigning to `fs.writeFileSync` on the
  shared `node:fs` module object therefore takes effect inside `validate.js`
  immediately, with no re-require. Restore the original in a `finally`.
- **The three project collaborators are destructured at module load**:
  `spawnPinnedSync` (line 9 — the **only** way this module runs git),
  `scanAndRedact` (line 14) and `displayName` (line 15). Assigning to those
  modules' `exports` afterwards **does not rebind them**. The seam is:
  `require` the collaborator, mutate
  `require.cache[require.resolve('<collaborator>')].exports.<name>`,
  `delete require.cache[require.resolve('../../src/core/dream/validate')]`, then
  re-require `validate` and drive **that** instance. Restore both cache entries
  in a `finally`, or every later test in the file inherits the stub.
- **`tests/unit/dream-validate.test.js` has no stubbing today** — zero
  `require.cache` sites and zero `mock.` sites at `efd1489`. This seam is new to
  that file. It is inside the permission boundary because it lives entirely in
  the test file; **nothing in `src/core/secret-scan.js` or
  `src/core/exec-identity.js` is edited**, and V-4 still fails the run if either
  is touched.
- **`scrubAddedLines` is exported** (Deliverables). Three cells cannot be reached
  any other way — see rows FI-3 and BU below.
- **EVERY READ OF THE TARGET IS DECIDED IN TABLE K, AND THIS PREAMBLE RESTATES
  NO COUNT.** K1 is `quarantinePreserve(…, 'redacted')`'s Buffer read — the
  **arming** read, from which all counting starts; K2 is the pre-rename
  comparison; K3 is B3's own preserve on a fall-through; K4 is the identity read
  the B3b abort branch takes. **Read K2's two outcome
  columns before writing any injection that perturbs it**: a throwing read is
  **R2**, differing bytes are **R7c**, and until round 4 this preamble asserted
  the opposite of the FI-2 row twelve lines below it — it said an `EACCES` on
  read 2 "produces row R7c, not row R2" while FI-2 claimed R2. Table K settles
  it in one place and both now cite it.
  **The counting is RELATIVE and that is a seam property, not a fixture
  precondition.** Numbering from the start of the run is wrong: Step 2 reads the
  same path before the gate — `tier3Decision` (`:880` → `:190`),
  `skillBodyViolation` (`:873` → `:321`, `:506`) and the new-skill-draft
  frontmatter read (`:889`) — and **Table B row B11 explicitly contemplates a B4
  file that is also a new skill draft**, so an absolute counter is off by up to
  three on that fixture. Two shipped facts make the arming rule total, neither a
  fixture precondition: **(a)** every other read of that path inside
  `validateAndCommit` passes `'utf8'` (`:190`, `:321`, `:506`, `:889`) —
  verified 2026-07-26, the module has eight `readFileSync` sites and its only
  other Buffer read is `hashFile`'s `:699`, which reads under `scratchDir`
  alone; **(b)** B10 makes K1 the first read of the target inside the arm.
  Literal check:
  `grep -c 'fs.readFileSync(path.join(vaultDir, rel));' src/core/dream/validate.js`
  → `1`. **A precondition can be forgotten by the next test author and fails
  vacuously when it is; a seam property cannot be violated by a fixture.**

| id | produces | mechanism — the exact seam | asserted at | why nothing cheaper reaches it |
|----|----------|----------------------------|-------------|-------------------------------|
| FI-1 | **R1** | **PATH-SPECIFIC, and it must be — round 2 of the design gate replaced this row's mechanism outright.** Patch `fs.writeFileSync` on the shared `node:fs` object: throw `EACCES` for any path **under `<stateDir>/quarantine/redacted/`**, delegate for everything else. The redact preserve writes its temp inside `redacted/` and **fails**; B3's own preserve writes its temp directly in `quarantine/` and **succeeds** — which is R1's second definitional clause. **It is the exact mirror of FI-10**, which fails the complement of the same set. <br>**What this replaced, and why neither old case worked.** The row used to run two cases. (i) `stateDir` **undefined** — that fails BOTH preserves, so it produces **R0**, not R1, and it is now FI-12's; leaving it here was the contradiction Codex found between this row and B3b. (ii) `fs.chmodSync(<stateDir>/quarantine, 0o500)` — path-blind, so it also fails B3's preserve and lands in **R0**; and it carried a fixture precondition that made it vacuous besides. **Executed 2026-07-26 and worth keeping as a recorded trap:** when `<stateDir>/quarantine/redacted/` already exists, `fs.mkdirSync(redacted, {recursive:true})` succeeds on the existing directory, the owner-uid `fs.chmodSync(redacted, 0o700)` succeeds (chmod needs ownership of the target, not write permission on its parent), the 0700 `redacted/` accepts the temp write, and **the preserve SUCCEEDS — the row passed vacuously in exactly the fixture state AC-14 builds.** The path-matched patch has no such precondition | gate | **path-matched rather than call-counted or mode-based, so it is deterministic and it isolates the ONE preserve that must fail.** No mode-based fault can: a mode on `quarantine/` blocks both destinations, and a mode on `redacted/` alone hits the executed trap above. **And never run as root** — uid 0 ignores mode, though this row no longer depends on mode at all |
| FI-2 | **R2** | **helper level:** `fs.chmodSync(<vault>/<rel>, 0o000)`, then call `scrubAddedLines` directly. **Gate level: a STATEFUL `fs.readFileSync` patch on the shared `node:fs` object** — delegate always, except throw an `EACCES` `Error` on the **second** call whose path resolves to `<vault>/<rel>`, **counting from Table K's arming read K1** | helper **and** gate | **the plain chmod is unreachable at gate level and produces the wrong row.** K1 is the **first** read of the target inside the arm, so a 0000 file fails the *preserve* and lands in **R1**, never R2. Counting is what isolates it: the throw must land on **K2**, the pre-rename comparison — **and K2's exception column is what makes this row R2 rather than R7c.** *Round 3 found the Table T preamble asserting the opposite of this cell (it said an `EACCES` on read 2 produces R7c); Table K settles it once and both cite it.* **The count must be relative, not absolute** — Step 2 reads the same path up to three times before the gate on a Tier-3 or new-skill-draft fixture (Table B row **B11**), and an absolute counter puts the `EACCES` on K1, i.e. back on **R1**. Table K's arming rule is what makes it relative, and it needs no fixture precondition |
| FI-3 | **R3** | call the exported `scrubAddedLines(vaultDir, rel, [lines.length + 1])` directly | **helper only** | **unreachable at gate level by construction**: the gate derives line numbers from git's own hunk headers, which are always in range for the file git just diffed. Producing R3 through the gate would mean stubbing git to emit a lying header — more machinery, and it would test the stub |
| FI-4 | **R4** | `require.cache` stub of `scanAndRedact` that **always** returns `{ text: <input> + '!', findings: [{label:'high-entropy', severity:'redact', count:1}] }` — a detector that changes the line *and* keeps reporting a finding, so the computed content differs from the current bytes (the no-op check passes) while the verification re-scan still fires. **Replace `scanAndRedact` only**; leave `hasHardFinding` and `redactOnly` as the real implementations, because B3's branch is `hasHardFinding(findings)` over the stub's findings and must keep working | helper and gate | **not producible with the real detector**: it is idempotent, so a correctly scrubbed line never re-fires. The destructure at line 14 is why the exports object cannot be poked in place. **It must not share FI-6's stub**, which is what round 5 found: one stub for both rows makes R4 and R6 indistinguishable, and M-17 then survives on any implementation that checks the no-op before the re-scan |
| FI-5a | **R5** | `fs.chmodSync(path.dirname(<vault>/<rel>), 0o500)` → the temp **open** fails | helper | plain filesystem |
| FI-5b | **R5** | patch `fs.writeFileSync` on the shared `node:fs` object: for any path containing `.wienerdog-scrub.`, write a truncated prefix through the real function and **then throw** an `ENOSPC` error; delegate for every other path | helper | **the row that distinguishes temp+rename from a truncating whole-file write** (M-21). No permission fault reaches a mid-write failure — a read-only directory fails at open, before a byte exists |
| FI-6 | **R6** | a **different** `require.cache` stub of `scanAndRedact`, stateful on call count: on the **first** call return `{ text: <input>, findings: [{label:'high-entropy', severity:'redact', count:1}] }`; on **every later** call return `{ text: <input>, findings: [] }`. Call 1 is the gate's blob scan, so B4 is entered; every later call leaves the line unchanged and reports nothing, so the computed content equals the current bytes **and the verification re-scan passes**. Same "replace `scanAndRedact` only" rule as FI-4 | helper and gate | as FI-4 for the seam. **The two stubs are deliberately order-independent**: FI-4's makes the no-op check pass and the verification fail; FI-6's makes the verification pass and the no-op check fail. Each row is therefore reached whichever order `scrubAddedLines` runs its two checks in, which is why this document does **not** pin that order — pinning it would fix a degree of freedom the contract has no other reason to fix, and an unpinned order with a shared stub is what round 5 found |
| FI-7 | **R7** | `require.cache` wrapper around `spawnPinnedSync`: delegate to the real implementation except for the **single** invocation whose args are `['-C', vaultDir, 'update-index', '--add', '--cacheinfo', …]`, for which return `{ status: 1, signal: null, stdout: '', stderr: 'injected' }`. A second case fails `['-C', vaultDir, 'hash-object', …]` instead; a third returns `{ status: 0, stdout: '' }` for `['-C', vaultDir, 'ls-files', '--stage', '--', rel]`, which is the **empty-stdout** branch B10 names. **The same wrapper is also installed around a DIRECT `scrubAddedLines` call** — taken off the re-required `validate` instance's exports — which is the helper-level seam `BU` needs for this row | helper **and** gate | **a filesystem fault cannot produce R7 alone.** Making `.git` unwritable (or planting `.git/index.lock`) fails *every* later git call too — B3's checkout, B3a's add, Step 5's add — which is row **R9**, not R7. Only a one-shot, argument-matched injection isolates the staging failure. **The helper level is not optional and round 6 is why**: `BU` asserts R7's `byte-unchanged` cell, and that cell is unassertable at gate level (consequence 1). Without a helper-level FI-7 this row names a seam that produces R7 only where its own postcondition cannot be read, and mutation **M-30** — which reddens exactly that cell — has nothing to redden |
| FI-7b | **R7b** | patch `fs.renameSync` on the shared `node:fs` object: throw `EIO` for any source path containing `.wienerdog-scrub.`, delegate otherwise | helper and gate | the stage must be allowed to **succeed** and only the rename to fail, which no permission or argument fault produces — the temp and the target share a directory, so any mode that blocks the rename also blocked the temp's creation (that is FI-5a, row R5). This is the row that proves the index reached the sanitized state before the working tree did, i.e. invariant **I2** in its failure form |
| FI-8 | **R9** | the same `spawnPinnedSync` wrapper, failing `['-C', vaultDir, 'checkout', 'HEAD', '--', rel]` on a **tracked** file after an R7 | gate | as FI-7 |
| FI-9 | **R9** | the same wrapper, failing `['-C', vaultDir, 'add', '-A', '--', rel]` (row B3a) on an **untracked** file after an R7 | gate | as FI-7 |
| FI-10 | the **`redacted/` copy is kept** cell of Table R consequence 2's second condition | patch `fs.writeFileSync` on the shared `node:fs` object: throw `EACCES` for any path under `<stateDir>/quarantine/` that is **not** under `<stateDir>/quarantine/redacted/`; delegate otherwise. The redact preserve writes its temp inside `redacted/` and succeeds; B3's own preserve writes its temp directly in `quarantine/` and fails | gate | path-matched rather than call-counted, so it is deterministic regardless of how many writes either preserve makes. A `chmodSync` on `quarantine/` cannot do it: `redacted/` already exists by then, and FI-1's executed result above is that the write into it still succeeds |
| FI-11 | the **`redacted/` copy is kept** cell of Table R consequence 2's **byte-identity** condition | **one stateful `fs.readFileSync` patch on the shared `node:fs` object, counting only calls whose path resolves to `<vault>/<rel>` and counting them from the preamble's arming read**: delegate on **K1**, throw `EACCES` on **K2**, and on **K3** return a **different** buffer (the fixture's bytes plus one appended line). K2's exception column takes the run to **R2**; K3 is B3's own `quarantinePreserve(…, 'withheld')`, which therefore writes different bytes than the `redacted/` copy holds. **The relative count is load-bearing here in a way it is not even in FI-2**: under an absolute counter on a B11 fixture the different bytes land on the *scrub* instead of on B3's preserve, the two copies then agree, the guard is never exercised, and **M-31 survives green** — the mutation this row exists to kill. Assert: **both** copies exist after the run, their contents differ, and the report line for that path carries Q8's suffix naming the `redacted/` one | gate | **one seam, one patch, deterministic** — it reuses FI-2's counter rather than adding a second mechanism, and it needs no concurrent process. It is a faithful simulation of the fault: production compares the two *copies*, and the copies are exactly what the two patched reads produced, so perturbing read 3 is indistinguishable from an editor replacing the note between reads 1 and 3. **Nothing cheaper reaches it**: really racing an editor against the gate is non-deterministic, and no argument, mode or path fault makes two reads of one unchanging file return different bytes |
| BU | the **`byte-unchanged`** cell of R2–R7b — **R7c is deliberately NOT in this range**, and round 5 checked rather than assumed it: `BU` reads the target before the call and asserts equality after, but R7c's whole condition is that the target CHANGED during the call, so the assertion cannot hold. R7c's postcondition is FI-16's (the rename was never reached), not BU's | read the target's bytes before the call, call `scrubAddedLines` directly, assert `false` **and** byte equality immediately after it returns. For **R7** and **R7b** the direct call is made with FI-7's / FI-7b's seam installed around it — those are the only two rows whose fault is not a plain argument or filesystem condition | **helper only** | **unassertable at gate level, by construction** — see Table R consequence 1: by the time the gate returns, B3 has restored a tracked file to `HEAD` or removed an untracked one, so the file cannot equal its pre-scrub content and a gate-level test claiming otherwise asserts something impossible |
| I1 | invariant **I1** (**AC-24**) | patch `fs.appendFileSync` on the shared `node:fs` object to snapshot `execFileSync('git', ['-C', vaultDir, 'diff', '--cached'])` on its **first** call and then delegate. Assert on the snapshot: it contains no raw fixture bytes, and on the R8 case it matches the working tree for that path. **The test must drive `validateAndCommit` directly**, not a CLI entry point: `fs.appendFileSync` is not private to this module and a wider driver would let some other caller's append take the snapshot | gate | `fs.appendFileSync` is Step 4's first write *inside this function*, so under a direct driver its first call **is** "before any report operation". Asserting after the run instead would measure Step 5's re-stage and prove nothing about the window |
| I2 | invariant **I2** (**AC-24**) | patch `fs.renameSync` on the shared `node:fs` object: when the source path contains `.wienerdog-scrub.`, snapshot `execFileSync('git', ['-C', vaultDir, 'diff', '--cached', '--', rel])` **before** delegating. Assert the snapshot already holds the sanitized line and none of the fixture's raw bytes. Also drive `validateAndCommit` directly | gate | that rename is the exact instant the working tree stops being raw, so a snapshot taken immediately before it is the only observation that distinguishes index-first from write-then-stage. A snapshot taken at Step 4 cannot: by then both orders have converged, which is why round 4's AC-24 could not see the window at all |
| **FI-12** | **R0** — both preserves fail, missing `stateDir` | run the gate with `stateDir` **undefined** on a fixture whose finding set is `redact`-only, so B4 is entered, the redact preserve returns `null` (**B5**, the shared branch — *not* "row R1", which is the outcome where B3's preserve succeeds), and B3's own preserve returns `null` for the same reason. **Run TWICE: once with the target TRACKED and modified, once with it UNTRACKED.** Assert, in both: the gate **threw**; the working-tree file is **byte-identical to the fixture** (tracked: not reverted to HEAD; untracked: **still on disk**); `git diff --cached` still shows the raw staged entry, i.e. B3a did **not** run; no commit was made; `fs.appendFileSync` was never called; **and the thrown `WienerdogError` carries all four of Table Q row Q18's fields at their R0 values** — the vault-relative path, BOTH preserves named as failed, the identity check recorded as **not performed** (there was no durable copy to compare against), and **no basename**, asserted as an absence. *Round 8 added the message assertions: FI-12/13/14 asserted the disk and index state and said nothing about the only surface a user sees* | gate | **the two arms fail for different reasons and only the untracked one can lose data irreversibly**, so a single-arm test proves the wrong half. A tracked file discarded by `git checkout HEAD --` loses only this run's modifications; an untracked file removed by `fs.rmSync` is **gone**. The untracked arm is the case this row exists for |
| **FI-13** | **R0** — both preserves fail, ENOSPC | patch `fs.writeFileSync` on the shared `node:fs` object: throw an `ENOSPC` `Error` for **any** path under `<stateDir>/quarantine/` (including `redacted/`), delegate otherwise. Both preserves then fail from one cause, which is the realistic shape. Same two arms (tracked, untracked) and the same assertions as FI-12 | gate | **path-matched rather than call-counted, so it is deterministic regardless of how many writes either preserve makes** — the same reason FI-10 is path-matched. Note the contrast with FI-10, which is the *near-miss* of this row: FI-10 fails only the writes NOT under `redacted/`, so the redact copy survives and the fall-through takes its keep-combination; FI-13 fails both, so **nothing durable exists** and B3b aborts. **A test that confuses the two proves the opposite of what it claims** |
| **FI-14** | **R0** — both preserves fail, permission denied | `fs.chmodSync(<stateDir>, 0o500)` **before the run, with `<stateDir>/quarantine/` NOT yet existing** — so `mkdirSync` fails `EACCES` for both destinations. Same two arms and assertions | gate | **the fixture precondition is mandatory and it is FI-1's, one level up**: if `<stateDir>/quarantine/` already exists and is owner-writable, the withheld preserve **succeeds** and the row passes vacuously as an ordinary R1. FI-1's executed note records the same trap for `redacted/`. Use a fixture private to this row. **And never run as root** — uid 0 ignores mode, so this row silently becomes an R8 |
| **FI-15** | the **captured-buffer derivation** rule (rule 1) — **an OBSERVATION HARNESS, not a fault**: it perturbs nothing and produces no Table R row, because the property it proves is a property of the *success* row | **Patch THREE `node:fs` methods to DELEGATE FAITHFULLY and append to ONE ORDERED EVENT LOG** — `readFileSync` (record every call whose path resolves to `<vault>/<rel>`, with whether an encoding was passed, i.e. Buffer vs text), `writeFileSync` (record every call whose path contains `.wienerdog-scrub.`) and `renameSync` (same). **Counting starts at Table K's arming read K1**, exactly as FI-16's does. Drive an ordinary `redact` fixture to a completed **R8**. **Assert four things against the log:** (1) **exactly TWO** target reads occurred inside the arm — **K1** and **K2** — **counting only reads whose log index is below the rename event's**, which is what bounds the window at both ends and makes assertion (3) self-consistent; (2) the first was a **Buffer** read; (3) **the second read's index falls BETWEEN the temp write's and the rename's** — which is what "after the temp write and before the rename" means operationally; (4) the `redacted/` copy equals the captured bytes **and** the scrubbed target equals the per-line scrub of those same bytes. Restore all three patches and reset the log in a per-test `finally`, per this table's reachability rule 3. An implementation that re-reads the target for its scrub input makes a **third** read and fails (1) | gate | **ROUND 2 OF THE DESIGN GATE REPLACED THIS ROW'S MECHANISM BECAUSE THE OLD ONE WAS IMPOSSIBLE.** It said: patch `readFileSync` so that any read of the target *after* the arming read returns **different bytes**, then assert the run reaches **R8**. But **rule 2 MANDATES exactly such a read** — the pre-rename comparison — so a *conforming* implementation reads the poisoned bytes, correctly observes that the target changed, and takes **R7c**. It can never reach R8. The row asserted an outcome the correct design forbids, and would have failed against every conforming implementation while passing against none. **The property is real; only the way of observing it was wrong.** Counting is sound because it does not touch the bytes: on a completed R8 the conforming arm makes exactly the reads **Table K** lists for that path, and a content-re-reading one makes one more. **Round 3 found assertion (3) unobservable through a `readFileSync` patch alone** — "after the temp write and before the rename" names two events that patch never sees — which is why the mechanism now records writes and renames into the same ordered log and asserts an index ordering rather than a description. **A structural check still cannot substitute** — `grep -c 'fs.readFileSync(path.join(vaultDir, rel));'` returning `1` is satisfied by a module that reads once and reads the target again through any other spelling |
| **FI-16** | **R7c** — the target changes between the capture and the comparison | **Patch `fs.readFileSync` on the shared `node:fs` object, counting calls whose path resolves to `<vault>/<rel>` from the preamble's arming read.** Delegate on call 1 (the capture). On call **2** — the rule-2 comparison — **first write different bytes over the target on disk** (the fixture's content plus one appended line), **then delegate the read**, so the comparison genuinely reads the modified file. The captured buffer and the comparison read now differ, so the arm must return `false` **without renaming**. Separately patch `fs.renameSync` to **record and delegate**. **Assert:** the recorded rename was **never invoked with a `.wienerdog-scrub.` source**; `S` returned `false`; the working-tree file holds the **modified** bytes; the run took **B5a → B3**; and consequence 2's keep-combination fired — **both** copies exist, their contents differ, and the report line carries Q8's suffix | helper **and** gate | **ROUND 2 ALSO REPLACED THIS ROW, and the old form was self-contradictory.** It patched `fs.renameSync` to write different bytes over the target *inside the patched rename* and then asserted **the rename was never invoked** — but the patch only executes when rename IS invoked, so the assertion could never hold, and the modification landed **after** the comparison had already completed and passed, where no comparison could prevent it. **The fix is to move the modification to strictly BEFORE the comparison read**, which is the only point at which rule 2 can act on it. <br>**It is the mirror of FI-11 on the success path, and neither covers the other.** FI-11 perturbs B3's preserve read on a row that was already failing; FI-16 perturbs the target on the row that was about to **succeed**, which is the only path where the gate would otherwise write over the user's save. **The helper level is not optional**: R7c's `false` return and its no-rename postcondition are `BU`-class cells, unassertable once B3 has run |
| **FI-17** | **R0b** — the cross-product, TRACKED target | Combine the two axes that FI-10 and FI-16 each cover singly. **(1)** patch `fs.readFileSync` so that on **K2** it first writes different bytes over the target and then delegates — the FI-16 mechanism, which takes the arm to **R7c**; **(2)** patch `fs.writeFileSync` to throw `EACCES` for any path under `<stateDir>/quarantine/` that is **not** under `redacted/` — the FI-10 mechanism, which fails B3's own preserve. The redact preserve still succeeds, so `redacted/` holds the **pre-save** bytes while the target holds the **post-save** ones. **Assert:** the gate **threw**; the tracked file is **byte-identical to the post-save bytes** — *not* restored to `HEAD`; `git diff --cached` still shows the uncleared entry; `fs.appendFileSync` was never called; **both** the `redacted/` copy and the on-disk file survive and **differ from each other**; **and the `WienerdogError` carries all four of Table Q row Q18's fields at their R0b-MISMATCH values** — the vault-relative path; **B3's** preserve named as the one that failed and the redact preserve **not** so named; the identity check recorded as **performed and mismatched**; and the surviving `redacted/` basename. *Round 8 added the first three: round 7 asserted the basename alone, which an error message reading `preserve failed <basename>` satisfies* | gate | **this is the destructive cell neither existing injection occupies**, and stating why is the point: **FI-10** is preserve-failure with **no** concurrent change (so the copy *is* of the bytes K3 saw and the revert proceeds, subject to residual 11), **FI-16** is concurrent change with a **successful** second preserve (so a copy of the current bytes gets written). Only the product leaves a copy that is *not* of the bytes on disk while the code path that would delete them runs. **A test that varies one axis passes against the losing implementation** |
| **FI-18** | **R0b** — the cross-product, UNTRACKED target | the same two patches, on an **untracked** target. **Assert the same things, including all four of Q18's fields at their R0b-MISMATCH values, with the first two sharpened:** the file is **still on disk** (`fs.rmSync` never ran) and holds the post-save bytes | gate | **the untracked arm is the one that loses data irreversibly and it must be tested separately**, exactly as FI-12/13/14 are: a tracked file discarded by `git checkout HEAD --` loses only this run's modifications, while an untracked file removed by `fs.rmSync` is **gone**. Round 1 made that argument for R0 and round 5 makes it again for R0b, because the two rows share the abort and not the way in |
| **FI-19** | **R0b** via K4's THROW, tracked and untracked | **Three patches, and the fall-through trigger is the part round 6 got wrong.** **(1) THE TRIGGER — FI-7's `spawnPinnedSync` wrapper**, failing the single `['-C', vaultDir, 'update-index', '--add', '--cacheinfo', …]` invocation. That is **row R7 → B5a → B3**, and it is the cleanest fall-through available here because **it leaves the target byte-unchanged** — the rename never runs — which is what keeps this row's own "byte-identical to what was on disk before the arm" assertion true. **(2)** patch `fs.writeFileSync` to throw `EACCES` for any path under `<stateDir>/quarantine/` that is **not** under `redacted/` — FI-10's mechanism, so **K3's preserve returns `null`** (its read succeeds; its *write* is what fails). **(3)** patch `fs.readFileSync` to throw `EACCES` on **K4** — the identity read that follows a `null` from K3 — while letting **K1, K2 and K3's read** through. *(Round 8 corrected this let-through list, which named K1 and K2 only. **K3 reads the target too** — it is B3's own `quarantinePreserve`, whose read must SUCCEED here so that its WRITE is what fails, which is patch (2)'s whole point. A counter that lets two reads through and throws on the third lands the `EACCES` on K3, so the preserve fails at the read, `K4` never runs, and the row's own outcome is unreachable — the same off-by-one class as round 6's unproducible trigger.)* **Assert, on both arms:** the gate **threw**; **no `git checkout` and no `fs.rmSync` ran** against the target; the index entry was **not** cleared; the file is byte-identical to what was on disk before the arm; **and the `WienerdogError` carries all four of Table Q row Q18's fields at their R0b-READ-ERROR values** — the vault-relative path; **B3's** preserve named as the one that failed; the identity check recorded as **attempted and NOT POSSIBLE**, which must be a **different** recorded value from FI-17/FI-18's *performed and mismatched* (a single wording covering both is exactly what **M-55** mutates to); and the surviving `redacted/` basename. *(Assert the absence of the destructive calls directly — the same `spawnPinnedSync` wrapper records invocations, plus a recording `fs.rmSync` — not merely the end state, because on a tracked file the end states of "checkout ran" and "checkout did not run" coincide when the working tree already matched `HEAD`.)* | gate | **ROUND 6 SHIPPED THIS ROW UNPRODUCIBLE, and the reason is worth keeping.** It reached the branch "with FI-17's second patch" alone — but that patch fails writes under `quarantine/` **outside** `redacted/`, and **K1's preserve writes its temp INSIDE `redacted/`** while **the scrub's temp is in the vault**. Neither is touched, so the arm completes at **R8** and K3/K4 never execute: the row asserted an outcome its own mechanism could not reach, and **M-50 had nothing to redden**. A fall-through trigger is therefore mandatory, and it must be one that **does not touch the target** — FI-16's does (it rewrites the file at K2), which would falsify the byte-identity assertion; FI-7's does not |
| **RP-1** | **residual 11** — the pre-revert race, tracked and untracked | **A RESIDUAL-PINNING ROW, not a fault the design prevents**, and labelled so nobody reads it as a passing safety property. Patch the `spawnPinnedSync` wrapper (tracked) or `fs.rmSync` (untracked) to **write different bytes over the target immediately before delegating** — i.e. simulate a save landing *after* K3/K4 and *before* the destruction. **Assert the currently-specified outcome: the save is destroyed**, no durable artifact holds it, and — the part that matters — **no artifact claims otherwise**: the report line, the reason string and the banner all describe the *pre-save* copy, which is the only thing that was ever preserved. | gate | **it makes the residual visible and makes any future closure break loudly.** Residual 11 is an inherited race this WP does not own; a test that pins it is how the follow-on `WP-ep2-atomic-withhold-handoff` will know it changed something. **If this row ever starts failing, the race was closed — update residual 11 and this row together; do not "fix" the assertion.** |
| — | **R8** | no injection: an ordinary `redact`-severity fixture | gate | — |

**Three reachability rules that follow, and that the tests must obey.**

1. **Never run this suite as root.** FI-1, FI-2 and FI-5a all deny access by mode,
   and uid 0 ignores mode. As root those three rows take the *success* path and
   pass vacuously. Assert the denial actually happened — e.g. the row's expected
   return value — rather than only the downstream disposition.
2. **`require.cache` surgery re-instantiates `validate.js`.** The re-required
   module is a *different object* from the one at the top of the test file. Drive
   the re-required one, and restore in `finally`. **Restoring by re-assigning the
   saved original property is equivalent to deleting the collaborator's cache
   entry and re-requiring it, and it is cheaper**: only one property of a live
   exports object was replaced, so putting it back leaves that object exactly as
   it was, and every module that destructured from it before the test — including
   the `validate` instance at the top of the file, which was never rebound —
   is already correct. What must still happen in the `finally` is deleting
   `require.cache[require.resolve('../../src/core/dream/validate')]`, so the next
   `require` re-destructures from the restored object rather than handing back the
   stubbed instance.
3. **Every `fs.*` patch is per-test and restored in `finally`.** `node:fs` is
   process-global; a leaked patch would silently corrupt every later test in the
   run, including ones that pass for the wrong reason. This applies to the
   stateful patches too (FI-2's and FI-11's read counters, FI-6's call counter): reset the
   counter in the same `finally`, not only the function.

**B12/B13 — the growth story, stated rather than left to emerge.** The argument
rests on the measured rates in derived row **D2**, and takes them from there
rather than restating them. Withhold copies are rare and each one is an unread
note the user may want back, so nagging until the folder is empty is correct.
Redaction copies are routine and mostly uninteresting, so the same treatment
would push the user to delete copies they never needed to look at — and, worse,
would accumulate pre-scrub bytes indefinitely inside the very mechanism that
exists to keep those bytes off disk. Hence: no banner, and **a bounded
directory — a cap that yields only to the never-evict-run-created rule**
(**Table N**, rows N1/N3/N5; a *hard* cap is the alternative that table
rejects). Table N's cap
is roughly two months of nightly dreams at D2's measured rate, which comfortably
covers the "I noticed the redaction was wrong" window without becoming an
archive.

**Why option B (preserve-then-scrub) rather than scrub-only.** Recorded as a
decided design point, with the reasoning, because an earlier version of this
argument was wrong. The objection to preserving is "you scrub the secret out of
the note and then save it next to the note." That overstates the equivalence:
**the vault is a git repository** — committed, versioned, and potentially synced
or backed up off-machine — so bytes landing there persist in history even after
deletion, whereas `state/quarantine/` is local-only, 0600 inside 0700, never
committed, never synced, and removed wholesale by `wienerdog uninstall` through
`disposeCoreMechanics` (ADR-0019). Keeping bytes out of the first is the gate's
job; writing them to the second is a materially weaker exposure and is already
exactly what the withhold path does today. The decisive argument the other way:
**a scrub with no recoverable original converts a false positive from
"restorable" into permanent corruption of the user's own note**, and silent
mangling is a worse failure mode than withholding.

> **OWNER-RATIFIED IN SESSION — 2026-07-25 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér ratified this in conversation; this line was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one. The merge gate keys on an
> owner-written signature line, which no agent ever writes. Scope of this approval: Table B's
> option-B ordering — rows **B4**, **B5** and **B10** (preserve the unredacted
> original **first**, scrub only the added lines second, and fall through to
> withhold if the preserve failed).

**The two UX contract changes — confirmed.** Two user-facing consequences of
the redact arm were put to the owner separately, because each changes a surface
a user sees. Both are **confirmed**.

> **OWNER-RATIFIED IN SESSION — 2026-07-25 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér ratified this in conversation; this line was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one. The merge gate keys on an
> owner-written signature line, which no agent ever writes. Scope of this approval:
>
> 1. **A redaction is reported in the dream report, not in the digest banner** —
>    Table B rows **B6**/**B7**. The withhold banner keeps its byte-identical
>    text and continues to describe withheld notes only.
> 2. **`state/quarantine/redacted/` is capped at 50 files; `state/quarantine/`
>    stays unbounded** — Table B rows **B12**/**B13**.

Rows B6, B7, B12 and B13 are what this approval covers; no other row, and no
other surface, is approved by it.

**Post-approval content changes to rows the two blockquotes name — dated,
architect-authored, and none of them ratified.** Each entry below changed the
*content* of a row a standing approval names, after the approval date. **The
blockquotes above are transcripts and are not touched**; this is where the change
is recorded instead. The owner approved, in row B12's case, **the cap itself —
the number Table B row B12 carries, and the choice to bound `redacted/` while
leaving `quarantine/` unbounded** — that is what was put to him and that is what
came back.

- **A note on the fidelity of the two disclosures below, because it bounds what
  they can be.** Their subject is a *previous revision of this file*, and the
  revisions they describe are **pre-`7ef4c51` ones that were never committed** —
  each was written in place over the last, so those superseded bytes are not
  recoverable from git, from a backup, or from anywhere else. **The file itself
  IS committed** (`7ef4c51`, 2026-07-26) and every revision since is diffable;
  what is missing is the pre-split state, exactly as Provenance point 5 says.
  *Round 2 of the design gate corrected this: it read "this file has never been
  committed", which round 1 had already falsified twelve hundred lines above,
  and which would have told an auditor that nothing here is verifiable when in
  fact only the pre-split state is not.* **Nothing below is a quotation and none of
  it is presented as one.** What each disclosure gives instead is the superseded
  **contract**, enumerated completely: the exact sequence, or the exact ordering
  key, that row carried before. That is the strongest form available and it is
  the form an auditor can actually check the current row against. Where a
  superseded string *is* recoverable — the shipped copy Table Q row **Q1**
  replaces — it is quoted verbatim, and that is the difference.
- **2026-07-26 (row B12) — the eviction ordering became `(mtimeMs, name)`
  ascending, and the copy the current B4 just created was excluded from the
  candidate set.** **The superseded contract, stated in full:** the prune sorted
  the candidate entries of `state/quarantine/redacted/` by **filename, ascending,
  and by nothing else**, deleted from the front until at most the cap remained,
  and **excluded nothing** — the copy the running B4 had just written was an
  ordinary candidate. This corrected a measured defect in it: because the
  filename is `<date>-<basename>`, copies made on the same date sort by
  *basename*, so a lexical prune could delete a copy created seconds
  earlier — including, in the worst case, the one belonging to the note being
  scrubbed right then. The owner was told; he did not object. **He was not asked
  to ratify an ordering**, and nothing in the blockquote above claims he did.
- **2026-07-26, round 5 (row B10) — the staging became index-first.** The first
  blockquote's scope is "preserve the unredacted original **first**, scrub only
  the added lines second, and fall through to withhold if the preserve failed".
  That ordering is unchanged and is not what moved. What moved is a thing the
  owner was never asked about and which the blockquote does not mention: **the
  order of the git-index write relative to the working-tree write** inside the
  scrub. **The superseded contract, stated in full:** compute the scrub → verify
  it in memory → write the sanitized bytes to a same-directory temp →
  `fs.renameSync` the temp over the working-tree file → **then** stage it, with a
  single `git add -- rel` after the rename. A round-5 review showed that this
  invents a repository state that does not exist before this
  WP — scrubbed working tree over a raw index, reachable by any kill between the
  rename and the `add`. B10 now stages first, and the single `add` became the
  three `allowFail` calls the row enumerates. **Architect-authored, not ratified. Flagged for the
  owner** as a design change inside an approved row; it needs his eye, not a new
  signature, because the approved property (preserve first, never scrub what could
  not be preserved) is untouched.
- **2026-07-26, round 5 (row B6, and Table Q row Q1) — the withhold banner's
  closing sentence changes.** The second blockquote says, of the UX split, that
  "the withhold banner keeps its byte-identical text and continues to describe
  withheld notes only." The second half stays true — B7 still gives redactions no
  banner and `listSecretQuarantine` still keeps the subdirectory out of it. **The
  first half is now false, and it was already false when it was written**: the
  banner tells the user to "delete the rest" of `state/quarantine/`, which after
  this WP destroys the pre-scrub originals, and promises the notice "clears when
  the folder is empty", which after this WP the user cannot reach. Table Q row Q1
  is a **factual correction to copy this WP falsifies**, in the same class as the
  ledger banner the owner was already told about, and it adds no redaction
  announcement to the banner — the approved trade is untouched. **Architect-authored,
  not ratified, and it must never be described as covered by that blockquote.
  Flagged for the owner.**
- The rule that follows, and that the Mirrored Surface Checklist now carries: **a
  signed approval is scoped by what was put to the owner, not by a row id.** When
  a row's *content* changes under a standing signature, the change is recorded
  next to the signature with its date and its author, in this shape. Repointing,
  rewording or extending the blockquote itself is never the repair — those blocks
  are transcripts and are frozen (carve-out (i) of the no-bare-numbers rule).

**Why not scan through a temporary index — considered, rejected, recorded.**
Round 4's strongest finding was that Step 3 stages the raw file *before* it is
scanned (`validate.js:904`), so every failure path inherits an index holding raw
credential bytes; the proposed fix was to run the whole gate against a scratch
index (`GIT_INDEX_FILE=<tmp>`), leaving the real index untouched until Step 5.
**It is the better long-term design and it is not this WP.** Three reasons, in
order of weight:

1. **It deletes an owner-approved row.** With a scratch index, Table B row
   **B10**'s index-first stage has nothing to close and the whole
   preserve → scrub → *stage-before-rename* ordering collapses to preserve →
   scrub. B10 is inside the first approval blockquote above. Re-scoping an
   approval is an owner action, and "we made the row unnecessary" is a re-scope.
   Note that round 5 made this reason **stronger**, not weaker: B10 now carries
   invariant **I2**, a property of the real index that a scratch index would
   establish differently and that the owner has never been shown.
2. **It rewrites shipped Step 3 behaviour that this WP is not for.** Every git
   invocation in the gate would have to carry the env var, `--cached` would read
   a different index than the rest of the function, and the binary-detection and
   name-status walks would all move onto it. That is a refactor of the withhold
   path, which Out of scope forbids, in the same WP that adds the redact arm.
3. **The window it closes is inherited, not created here.** `git add -A` at line
   904 has staged raw bytes before any scan since WP-123; any throw between it
   and Step 5 has always left them staged, on the withhold path exactly as on the
   new one. This WP makes that window **strictly smaller** — row B3a closes it on
   the untracked withhold, and rows R1–R8 close it on every redact path that reaches a revert (that is
   invariant **I1**; rows **R0** and **R0b** deliberately do not close it, because
   they abort before the revert — see residuals 10 and 10b) — and Table R row **R9** states the one case that remains:
   an index that cannot be written at all, where nothing can unstage anything and
   the run therefore fails loudly with no commit. **Round 5's correction to this
   reason, because it was used too broadly.** "Inherited" covers the index holding
   *raw* bytes; it does **not** cover a divergence between the index and the
   working tree, which before this WP could not happen — Step 3 stages the file it
   is about to scan, so tree and index agreed. The redact arm creates the first
   opportunity for them to disagree, and that opportunity is **not** inherited.
   B10's index-first ordering and invariant **I2** are what answer it; the
   scratch-index redesign is not needed for it, which is why this reason survives
   round 5 rather than being defeated by it.

**What is deferred, so it is not lost:** a follow-on WP, provisionally
`WP-ep2-scan-through-a-temp-index`, to move the EP2 scan onto a scratch index and
retire B10's immediate stage. It needs its own owner conversation because it
un-scopes an approval. **A reviewer who believes the scratch index belongs in
*this* WP is asking for that conversation, not for a spec edit.**

### Mirrored Surface Checklist

Every surface in this spec that mirrors a canonical table, so that a review
finding updates the table **and all of its mirrors** in one pass, and any new
mirror found in review is registered here on the spot.

**The round-2 rule, learned the expensive way: a mirror may cite a table row id;
it may not restate a number the table decides.**

**NO NEW ABSOLUTE WITHOUT AN EXECUTED CHECK BESIDE IT — round 7's standing
rule, and it is written here because three of round 6's blocking findings were
that one class.** "Every", "none", "only", "the full set", "no surface may" —
each of those is a claim about the *whole document*, and a claim about the whole
document that nobody ran is a claim that the next review falsifies. Round 6
shipped three: *"No surface in this document may say it does"* (falsified at two
canonical cells), *"The full set"* (missing two members), and *"rejects every
literal"* (true only of the declaration line). **So: write the absolute and the
grep in the same edit, or write neither.** The three mechanized examples in this
document are V-26 (Table Q's membership), V-30/V-32 (the Checklist's) and V-31
(the safe/authorize universal); a fourth absolute with no check is a defect on
sight, whichever surface carries it. Four of round 2's blocking
findings were one defect wearing four hats — a count copied into prose and left
behind when the table moved. Registering a numeric mirror is not enough, because
nothing forces it to agree. This document therefore holds exactly **two**
numbers: the retention cap, decided in **Table N row N1**, and the derived rows
**D1/D2**, which are decided in ADR-0034 and pinned by V-17. A bare number
anywhere else here is a defect on sight — **with exactly four carve-outs, and no
fifth may be added without registering it here**:

- **(i) the approval and answer records.** The `OWNER-ANSWERED` block in the
  Provenance section and the two `OWNER-RATIFIED IN SESSION` blocks (and the
  `## OWNER-APPROVED` section at the end) restate the cap because they record
  **what was put to the owner and what came back**. They are transcripts, not
  mirrors: repointing them at a row id would falsify the record, and re-scoping
  them is an owner action, never an editorial one. They are frozen even when the
  number they name is later found wrong — the repair for that would be a fresh
  approval, not an edit.
- **(iv) A TEST'S OWN ASSERTION TEXT, which must be operational.** A Table T row
  that says a test asserts "exactly two reads" is telling an implementer what to
  write; replacing the figure with a citation would make the row unusable at the
  keyboard. **The bound: the ASSERTION column may carry the number; the
  rationale column may not**, and round 5 settled that split when it struck the
  digits from FI-15's rationale and kept them in its assertions.
- **(iii) ARITHMETIC RECORDS — registered in round 5 of the design gate, because
  it had become a de-facto carve-out without being written down.** A dated record
  of *why a figure was wrong* has to show the arithmetic — consequence 7's
  cap-over-rate division and the N2/N6 decision's worked above-cap walk cannot
  cite their way out without ceasing to be checkable, which
  is the whole point of a correction record. **The bound is narrow: an arithmetic
  record may carry a figure only inside a dated statement about a SUPERSEDED
  claim, never as a live assertion**, and the audit lists each one. Two exist.
- **(ii) user-facing copy in `docs/runbooks/secret-incident.md`.** A runbook that
  told a knowledge worker "the cap decided in Table N row N1" would be useless.
  The runbook says the number; **"The recovery runbook" section below is the only
  place in this spec that may carry it on the runbook's behalf**, and it is
  registered as a B12 mirror below.

Every other occurrence cites **N1**. That is a change from an earlier revision,
where the cap was restated in the recovery-runbook prose, in AC-14 and
in AC-19 — three unregistered numeric mirrors of exactly the kind this rule was
written to stop.

**How to audit this, and what does not count.** The audit is a substring grep of
this file for the cap's digits (the number in **Table N row N1**). Being a
substring grep it also returns line-number citations such as `digest.js:506`,
`lines 650–676`, the octal file modes in Table T, **and — since round 5 —
MUTATION IDS such as `M-50`, because `\b` matches across the hyphen.** Those
four categories are not restatements of the cap and are not defects; **round 6's
census reported eleven where the dispositioned table has seven, and the four
extra were exactly the mutation ids.** Exempt them explicitly: the census grep is
`grep -n '\b50\b' … | grep -v 'M-50'`, and any later mutation whose number
contains the cap's digits is exempted the same way, in the same commit. Those are not restatements
of the cap and are not defects — **only a bare number standing for the retention
cap is**, and this paragraph deliberately contains none so that it is not itself
a hit. **RE-RUN IN ROUND 5, AND THE COUNT IS EIGHT, NOT FIVE.** Round 4's paragraph
asserted five without executing the grep, and the executed grep returns eight —
which is how a de-facto third carve-out (the arithmetic records) accumulated
unregistered. **The rule this establishes, and it binds every later round: do
not re-assert this census without running it.** Executed 2026-07-27 against this
revision, `grep -n '\b50\b'`, every hit dispositioned:

| hit | surface | disposition |
|-----|---------|-------------|
| 1 | the `OWNER-ANSWERED` block (the cap phrase) | **carve-out (i)** — transcript, frozen |
| 2 | **Table N row N1** | **the deciding surface** |
| 3 | the N2/N6 decision's worked above-cap walk | **carve-out (iii)** — arithmetic record |
| 4 | Table R consequence 7's cap-over-rate correction | **carve-out (iii)** — arithmetic record |
| 5 | the second `OWNER-RATIFIED` blockquote | **carve-out (i)** — transcript, frozen |
| 6 | the recovery-runbook bullet | **carve-out (ii)** — user-facing copy |
| 7 | the `## OWNER-APPROVED` section | **carve-out (i)** — transcript, byte-frozen by V-11 |

So: **one canonical, three transcripts, two arithmetic records, one runbook.**
Round 4's paragraph asserted *five* without running the grep; the executed grep
returned *eight*, and this round reduced one of those (AC-14's boundary case,
now "the above-the-cap boundary") and rewrote this census so it does not match
itself — an earlier draft of this very table added three hits by quoting the
digits it was cataloguing. **Every remaining occurrence is the deciding surface
or a registered carve-out**, which is the property the old sentence claimed
without checking.

**The audit's own blind spot, found in round 7.** The audit greps for *the cap's*
digits, so it sees one numeric family only. A second had grown unseen: **V-5's
permitted-removals bound**, restated as a count in "Exact contracts →
`src/core/digest.js`" ("four lines… two edits") and again in **AC-26** ("six
lines… three edits") while V-5's own `PERM5` heredoc moved twice underneath them
(round 4 added Q14's comment lines; round 5 widened those to the whole wrapped
block). Three numbers for one bound, two of them stale, and no grep here could
see it. **The remedy is the round-2 rule applied, not the audit widened:** both
mirrors now cite `PERM5` and restate no count. Standing extension: **a bound
living in a verification heredoc is decided there, and prose about it cites the
step, never the count** — which holds identically for V-13's, V-24's and V-27's
lists, none of them restated numerically anywhere here.

**The round-4 extension, and it is about signatures rather than numbers: a row's
*content* can change under a standing approval without the row id moving, and
that is the same failure in a costlier place.** The previous revision's rule
covered row ids moving out from under an approval. It did not cover B12 keeping
its id while gaining an eviction ordering and a protection clause that the owner
was never asked about — which read, to anyone scanning the approval blockquote,
as though he had approved them. **Rule: when a row named by an approval changes
content after the approval date, the change is recorded next to that approval
with its date and its author, and the approval blockquote is not touched.** The
worked instance is the note headed "What that approval covers inside row B12"
above; the rule applies identically to rows B4, B5, B10, B6, B7 and B13.

- [ ] **Table Q** mirrors — registered in the pass that created the table, and
      **this is the family that produced the blocking finding in three
      consecutive rounds**, always the same way: a shipped string about
      `state/quarantine/` argued wherever it happened to be mentioned. Every
      mirror, and every one of them now defers to a Q row rather than deciding a
      word: the **`src/core/digest.js` Deliverables row** and the two edits it
      names (**Q1**); the `src/core/dream/ledger.js`, `tests/unit/ledger.test.js`
      and `tests/unit/digest.test.js` Deliverables rows (**Q1/Q2**); "The
      exhausted-transcript banner, exactly", which now carries the two-file
      argument and **no text** (**Q2**); the
      `docs/runbooks/secret-incident.md` Deliverables row naming **three** edits
      and the "The recovery runbook" section (**Q3/Q4/Q5**); "The glossary edit,
      exactly" (**Q6**); the dream-report pinned line template (**Q7**); Table R
      consequence 2's fall-through reason suffix (**Q8**, which Table R owns and
      Q8 only registers); the `docs/THREAT-MODEL.md` Deliverables row and the
      Out-of-scope sentence bounding it (**Q10/Q11**, and **Q12/Q13** for the two
      clauses in that file which stay); the `src/core/private-fs.js` Deliverables
      row and item 1 of "The private-tree extension, exactly" (**Q15** — round 6
      found that section *prescribing* the phrasing **Q6** outlaws); Table B rows
      **B6**, **B7** and **B13**, which decide
      *whether* each surface fires and never what it says; the Current-state
      quotation of the digest banner at "`src/core/digest.js`" (a quotation of the
      **before** text — it must stay as it is, because Current state describes
      `main`); acceptance criteria **AC-10**, **AC-19**, **AC-22**, **AC-25**,
      **AC-26** and **AC-27**; verification **V-5**, **V-13**, **V-22**, **V-24**,
      **V-26**, **V-27** and **V-28**; mutation
      rows **M-10**, **M-26**, **M-29**, **M-32** and **M-33**; the
      `src/core/dream/validate.js` Deliverables row's final clause (**Q17** —
      round 7 found that row enumerating this file's changes precisely while the
      file's own Step-3 comment stated the WP's negation); and the dated post-approval note after
      the second `OWNER-RATIFIED` blockquote, which is where **Q1**'s change to a
      surface that blockquote names is recorded. **The standing rule this table
      exists to enforce: no string in it may be frozen on the grounds that this WP
      "does not change the withhold path".** Q1 and Q3 became false without being
      edited, and both were frozen by a verification step for a whole round
      because of exactly that argument. **Round 6's rule, which is about the
      table's boundary rather than its contents: the membership predicate is
      itself a mirror, and it must be derived rather than recalled.** Four rounds
      running the blocking finding was a member nobody had listed. **V-26** is now
      the deciding surface for membership; the "Table Q membership" sub-table is
      its dispositioned output, and every row of it — including the three
      registered **non**-members — is part of this checklist.
      **Round 7's rule, one level further out and the same failure a third time:
      the sweep's own PATTERN is a mirror.** `QSWEEP` was hand-written and
      case-insensitive on one letter, so it scored zero on the shipped word `ANY`
      and missed `validate.js:900-903` — this WP's own primary file, stating this
      WP's exact negation. The predicate was derived from a tool and the tool's
      coverage was not a registered surface. `QSWEEP` is now decided in **V-26**
      and read as canonical text; the rule and its four clauses are "The sweep's
      own pattern is a member of the contract", and the file set is **re-derived
      by execution** and recorded whenever the pattern moves.
- [ ] **Table B** mirrors: the dream-report example block, its pinned line
      template and its ordering paragraph; the `digest.js` Deliverables row (whose
      *wording* is Table Q's, not this table's); the `docs/runbooks/secret-incident.md`
      Deliverables row (naming **three** edits) and the "The recovery runbook"
      section (B7/B12/B13 — the user-visible half of the redact arm, and the only
      registered carve-out holder for N1's number); the
      `src/core/dream/ledger.js` and `tests/unit/ledger.test.js` Deliverables rows
      and "The exhausted-transcript banner, exactly" (**B6/B13** — the second
      user-facing surface that names `state/quarantine/`; registered in round 4,
      when it was found telling users to delete the originals this WP creates);
      "The glossary edit, exactly" (which cites B7/B12 and carries no digit);
      acceptance criteria AC-7 … AC-10, AC-14, AC-19, AC-24, AC-25 and AC-26;
      verification V-0, V-4, V-5, V-9, V-13, V-24; the Current-state description
      of Step 3, Step 4, line 947 and `listSecretQuarantine`; the Out-of-scope
      bullet forbidding `src/cli/dream.js` edits and the one bounding row **B3a**;
      the Security checklist bullet on out-of-range hunk line numbers (it
      names **B5a**, not B5 — B5 is preserve-failure); acceptance criterion
      AC-22 and verification V-22 (the glossary's gate half); the Mutation checks
      table (M-7 … M-12, M-16 … M-18, M-20, M-22 … M-27); **the two
      approval blocks** after Table B, which name rows B4/B5/B10 and B6/B7/B12/B13
      by id (they scope an owner approval — if a row id moves, the approval must
      be re-scoped, not silently re-pointed; this is why the scrub-failure row is
      **B5a**, the `reverted[]` row is **B9a** and the index-repair row is
      **B3a**, none of them a renumber) **and the dated provenance note beneath
      them**, which is where a post-approval content change to a named row is
      recorded.
- [ ] **Table K** mirrors — registered in the pass that created the table.
      **Every one is a citation and none may carry a count**: rule 1 (there is
      no read for *content*); rule 2 (K2 exists, and its two outcome columns
      decide R2 vs R7c); the Table T preamble's arming rule; **FI-2**,
      **FI-11**, **FI-15**, **FI-16**; **AC-9**; mutations **M-46**/**M-47**;
      Table R rows **R1**, **R2**, **R7c**, **R0** and **R0b**; and — added in
      round 5 — **Table B row B3b**, whose abort condition is row **K4**'s
      identity test. **The rule that made
      this table necessary: a read's FAILURE OUTCOME is part of the read's
      contract, not of the row it lands in** — stating it per-row is what let
      R2 and R7c both claim a throwing comparison read with opposite artifact
      outcomes for a whole round.
- [ ] **Table N** mirrors — registered in the pass that created the table, and
      **all citations**: Table B row **B12**; Table R **consequence 7**; the
      **B12/B13 growth story**; **AC-14**; the **Security checklist** prune
      bullet; mutation **M-48**. **N2 and N6 are coupled and a change to
      either re-derives the other** — the trigger condition determines what
      can clear an overshoot, which is exactly the contradiction round 3
      found (AC-14 mandating a zero-redaction run prune back while N2 forbids
      it). The architect's decision on that pair is recorded under Table N.
- [ ] **(b3) THE ROUND-6 AND ROUND-7 ADDITIONS.** Round 6 added **FI-19**,
      **RP-1**, accepted residual **11**, B3b's basename clause and the
      "K4 IS A FILTER, NOT AN AUTHORIZATION" subsection, and registered none of
      them — the fourth consecutive round in which a canonical addition went
      unregistered. Round 7 added **Q18**, **M-51**, **V-30** and **V-31**.
      Their mirrors: **Q18** is decided in Table Q and mirrored by
      B3b's action cell, FI-12/FI-13/FI-14's, FI-17/FI-18's and FI-19's
      assertions, AC-9's abort-message paragraph, and mutations **M-51**,
      **M-53**, **M-54** and **M-55** — **one mutation per field, which is
      round 8's addition and the reason it was needed**: Q18 decides four
      fields and round 7 held one, so an implementation could omit the path,
      the which-preserve and the identity disposition and stay green.
      **M-53**, **M-54** and **M-55** are each mirrored by AC-9's
      abort-message paragraph, by the three arms' assertion lists, and by Q18
      itself; their ids were allocated by RUNNING the allocation procedure with
      both leg files final. **FI-19** by Table K row K4's throw column, Table R
      row **R0b**'s injection cell — **which named FI-17 and FI-18 only until
      round 8, while five mirrors named FI-19; the canonical cell moved, not the
      mirrors** — and **M-50**; **RP-1** by accepted residual **11**, which
      names it, **and by the follow-on stub's re-aimed tripwire**: round 8
      corrected the stub's inference that RP-1 going red proves the race closed,
      since this WP removes RP-1's own seam; the
      **K4-filter subsection** by Table K row K4, Table B row B3b and residual
      11; **residual 10b** by Table R row R0b and Table B row B3b.
      **THIS BULLET IS THE LAST ONE THAT WILL EVER BE WRITTEN BY HAND.**
      Verification step **V-30** now enumerates every id this document defines
      and fails if one is neither named here nor on its registered exclusion
      list. **Its output is the walk** — the rule below no longer depends on
      anybody remembering to perform one.
- [ ] **THE ROUND-1 ADDITIONS, registered in round 2 — and this bullet exists
      because NOT registering them cost six findings in one round.** Round 1
      added four things to the Table R / Table B family and did not walk any of
      them through this Checklist. **The reviewers verified that running it once
      would have caught four of the six mechanically.** Each addition and its
      full mirror set, so a third round cannot repeat it:
      **THE RETURN SHAPE IS STATED ONCE, IN THE `@returns` LINE, WITH ONE
      REGISTERED CARVE-OUT — round 5's decision on the third round-3
      extraction.** Round 3 mandated "stated once"; round 4 claimed it and
      round 4's reviewer measured it not to reproduce — the shape was still
      literally spelled in the JSDoc, six prose sites and **every `P` cell of Table R**. The prose sites are now citations. **Those `P`
      cells are a DELIBERATE READABILITY CARVE-OUT and are registered as one
      here**, stated by citation — *"every row of Table R"* — rather than by a
      count, because round 5 wrote "eleven cells / all twelve rows" into the very
      commit that added a thirteenth row and a twelfth success-shape cell, for a
      stated reason: Table R is a *matrix*, and its value is that a row can be
      read across without jumping. The column takes exactly two values, both
      structural (`null` and the success shape), and round 4 demonstrated the
      real failure mode is **partial** updates — round 4 left seven cells
      behind — which a citation would not have prevented and a whole-column
      sweep does. **The obligation that replaces it: when the shape changes,
      the ENTIRE `P` column moves in the same edit, and the sweep is executed
      and pasted.**
      **(a) `quarantinePreserve`'s return type `boolean` →
      the shape its `@returns` decides** — mirrors: **Table R's entire `P` column** (**every row of Table R** — round 5 wrote "all twelve" into the commit that
      added a thirteenth, which is why this cites instead of counting); the
      `quarantinePreserve` JSDoc; Table B row **B4**; the
      `src/core/dream/validate.js` **Deliverables cell**; **the dream-report
      line's `<basename>` derivation AND Table R consequence 2's Q8 suffix** —
      both `preserved.name`; **AC-9**, which requires every
      row's test to assert "the two return values"; **and the "Why the return
      type changes" heading**, which named the wrong new type *and* the wrong
      old one. **Round 3 found four of these still stale — three of them
      already members of this very bullet.** That is the sharpest evidence in
      this document that REGISTERING a mirror is not the same as WALKING it,
      and it is why the standing rule below says the walk must be disclosed.
      **(b2) THE ROUND-5 ADDITIONS — R0b, K4, FI-17, FI-18, M-49 and residual
      10b — registered in round 6, which is a round late, and that lateness IS
      the finding.** Round 5 added a canonical row, a canonical read, two
      injections, a mutation and a residual and registered **none** of them
      here; seven of round 5's thirteen review findings are consequences of
      that single omission. **The full mirror set, enumerated so the walk is
      checkable rather than claimed:** the `src/core/dream/validate.js`
      **Deliverables cell**; invariant **I1** and its carve-out; **AC-24**'s
      exclusion list; the **Table R preamble**'s enumeration of B3's failure
      modes; **AC-9**'s row count and its `redacted/`-cell listing; accepted
      residuals **10b** and **11**; **consequence 2**'s keep-combinations;
      **Table K**'s header and its position column; the **Table T** rows that
      name the new injections; and mutations **M-49**/**M-50**. **The walk for every one of these is V-30's output**, and that is the whole
      point of the mechanization: rounds 4, 5 and 6 each ASSERTED a completed
      walk, and each next review falsified it. **No bullet in this Checklist may
      claim a completed walk on any other basis.**
      **(b) Table B row B3b / Table R row R0 (the no-durable-copy abort)** —
      mirrors: invariant **I1**; **AC-24**'s exclusion list; **row R1's own
      definition**, which must exclude the case R0 owns; **FI-1**, which must
      stop producing R0 by accident; the `validate.js` Deliverables cell;
      accepted residual **10**; mutation **M-45**.
      **(c) the captured buffer and the pre-rename compare (rules 1 and 2, row
      R7c)** — mirrors: **rule 1's own closing sentence** (round 3 found it
      still saying "exactly one read" while five other surfaces said two — a
      canonical rule's own last line disagreeing with everything that cites
      it, which is why the count now lives in **Table K** and the sentence
      states only that no read exists *for content*); both JSDoc signatures;
      Table B rows **B4** and **B10**;
      Table R rows **R2** (its condition is now "at the compare") and **R7c**;
      Table T's **read-counter preamble**, whose call numbering the rules
      redefine; **FI-2**, **FI-11**, **FI-15**, **FI-16**; **AC-9**'s extras;
      accepted residual **9**; mutations **M-46**, **M-47**; the `validate.js`
      Deliverables cell.
      **(d) the per-run retention prune** — mirrors: Table B row **B12**;
      Table R **consequence 7**; **AC-14**; the **Security checklist** bullet on
      the prune; mutation **M-48**.
      **The standing rule this bullet enforces: an addition to a canonical table
      is not landed until its mirror set has been walked, and the walk is
      disclosed.** Round 1 disclosed its digest recomputation and not its mirror
      pass, which is precisely how seven `P`-column cells, an invariant, two
      Deliverables cells and a Security-checklist bullet were left behind.
      **Round 3 is the escalation boundary the reviewers set: if this family
      produces the blocking finding a fourth time, the family is the bug and the
      repair is an extraction pass, not another round of re-pins.**
- [ ] **Table R** mirrors — registered in the same pass that created the table,
      because this contract family is where round 2's B5a critical landed and
      where round 3 found four more defects, all of them a mirror disagreeing
      with prose that had no table to defer to: the `quarantinePreserve` and
      `scrubAddedLines` JSDoc blocks under "Exact contracts" (they carry
      **signatures and argument meanings only** — every outcome sentence was
      deleted from them and lives in Table R); Table B rows **B3a**, **B4**,
      **B5**, **B5a**, **B9a**, **B10**, **B12** and — **the pre-gate table's addition** —
      **B13**, which is a Table R mirror for a reason that has nothing to do with
      retention: consequence 2's byte-identity guard reads the withheld copy B3
      wrote moments earlier, and that read is sound only because nothing evicts
      from `state/quarantine/`. The coupling was load-bearing and unstated; it is
      now written in both cells, and a future cap on B13 re-derives the guard and
      residual 6 in the same pass; acceptance criteria **AC-9**
      and **AC-24** (the latter asserts invariants **I1** and **I2**, which Table
      R states); mutation rows **M-16**, **M-17**, **M-20**, **M-21**, **M-27**,
      **M-28**, **M-30**, **M-31**; **Table T**, whose `produces` column names Table R rows
      and whose `FI-*` ids are Table R's own last column; **Table Q row Q8**, the
      one reason string this table owns; accepted residuals **6**, **7**, **8**
      and **9**; the
      Security checklist bullets on out-of-range line numbers and on the
      fall-through deletion. **Round 6's addition to consequence 2: the deletion
      guard is a byte comparison, not an argument.** The claim it replaced — "the
      two copies must be byte-identical because consequence 1 says the gate wrote
      nothing between them" — was true about the gate and silent about the note's
      owner, who can save the file between the two preserve reads. Every mirror
      of that guard now says *compare*, and the injection that proves it is
      **FI-11**. **Table R's two disk columns are the load-bearing
      ones, and they are read at two different times** — the working-tree column
      at the instant `S` returned, the index column when the row finishes. Any
      surface that reads one at the other's time point is a defect; round 5 found
      the working-tree column had no stated time point at all.
- [ ] **Table T** mirrors — registered in the pass that created it, because
      round 4's findings were four mirrors of a testability contract that had no
      table: Table R's `fault injection` column (ids only — Table T decides what
      each id *is*); the `scrubAddedLines` export note under "Exact contracts" and
      the `src/core/dream/validate.js` Deliverables row that authorises it; the
      `tests/unit/dream-validate.test.js` Deliverables row; acceptance criteria
      **AC-9** (which level each cell is asserted at) and **AC-24** (the `I1` and
      `I2` rows); mutation rows **M-17**, **M-21**, **M-27**, **M-28**,
      **M-30** and **M-31**; the Implementation-notes bullet on `node tests/run.js`. **No
      surface may name a fault injection without a Table T row for it** — an FI id
      with no mechanism is the round-4 defect, and it ships as a faked or skipped
      test rather than as a red one. **Round 6's extension, which is the same
      defect one level up: an `asserted at` cell must cover every level some
      mutation reddens.** FI-7 said `gate` only, while `BU` needs R7 at *helper*
      level and **M-30** reddens exactly that cell — so the mutation had nothing
      to fail. FI-7 is now `helper and gate`, and the rule is: if a mutation row
      names a cell, some Table T row must produce that cell at the level the cell
      is assertable. **Round 5's extension: a mechanism is not
      enough — the row must also say what makes the fault land on the intended
      cell.** Three of round 4's rows were mechanically real and landed elsewhere:
      FI-1 passed vacuously whenever `redacted/` already existed (which is the
      fixture state AC-14 builds), FI-2 produced **R1** rather than R2 at gate
      level because the preserve reads the file first, and FI-4 and FI-6 shared one
      stub, which made **R4 and R6 indistinguishable** and let M-17 survive on any
      implementation that checks the no-op before the re-scan. Every row now
      carries its precondition, its distinguishing property, or both.
      **Round 7's extension closes the last of those three from the other side:
      prefer a seam property to a fixture precondition whenever both are
      available.** FI-2's and FI-11's read counter was absolute over the whole
      run, correct only on a fixture whose target Step 2 never read — and **Table
      B row B11 explicitly contemplates the fixture that breaks it**. The repair
      could have been a fourth precondition on AC-9's list; it is instead the
      **arming rule in this table's preamble**. A precondition can be forgotten
      by the next test author and fails *vacuously* when it is; a seam property
      cannot be violated by a fixture at all.
- [ ] **Table P** mirrors: the Current-state paragraph describing the detector
      after leg 1; the Deliverables prohibition on `src/core/secret-scan.js`;
      "Why this leg cannot go first"; acceptance criterion AC-21; verification
      V-16. **No mirror of Table P may restate a Table A fact that Table P does
      not check** — if this WP depends on a detector property, that property gets
      a Table P row with a literal check, or it is not depended on. **Round 5
      applied that rule to itself and found one missing**: the whole per-line
      scrub design depends on no `redact`-severity producer matching across a
      newline, a property no row checked. It is now row **P5**, and its mirrors
      are the `scrubAddedLines` JSDoc's "SANITIZATION UNIT: one line at a time"
      paragraph and Table R row **R6**, which is the row a broken P5 would make
      universal.
- [ ] **D1/D2** mirrors: the Context section's second and third paragraphs (which
      describe the problem's size in words, deliberately without digits); the
      B12/B13 growth-story paragraph after Table B, which cites D2 rather than
      restating it. **ADR-0034's E1 and E3 are the deciding surface**, and V-17 is
      what forces this document to agree with them. Leg 1's V-15 greps the same
      lines, which is what forces the two legs to agree without either reading
      the other.
- [ ] **ADR-0034** (`docs/adr/0034-accidental-persistence-threat-model.md`) is a
      mirror of this spec in both directions. Its mirrors here: the "The threat
      model" section and the review-criterion block (ADR-0034 Decisions 1–5); the
      Out-of-scope shape-allowlist bullet (Decision 7); the `## OWNER-APPROVED`
      section; the Current-state description of what EP2 does today; D1/D2.
      ADR-0034's Decision 6 states the EP2 principle and **defers to Tables A and
      B for the exact contract** — so a table edit is normally free, but an edit
      that made B3/B4/B5a contradict Decision 6 is a **new-ADR event**, not a
      spec revision. Say so in review rather than editing either.
      **What "Accepted, therefore immutable" does and does not cover** — settled
      in round 2 and recorded in the ADR's own errata block: its **Decisions 1–7
      and its `OWNER-SIGNED` line are immutable** and only a new ADR touches
      them. Its **measured evidence (E1–E4) and Boundary statement are not**:
      when a measurement is found to be wrong, the correct repair is a dated
      **errata amendment inside ADR-0034**, because fixing it only on the spec
      side would promote this document's copy to primary and leave the durable
      record stating a false figure. An errata amendment never touches the
      signature and never changes what was decided.
- [ ] **The threat-model section** is a mirror of leg 1's copy of itself, and the
      only cross-leg mirror in this document. It is held by **V-18**, a checksum
      over the section against a literal digest that both legs carry. It is
      deliberately not held by "read the sibling spec": the One-Document Rule
      (ADR-0005) means neither implementer opens the other's file. **If V-18
      fails, you edited a ratified review criterion — revert your edit; do not
      update the digest.**
- [ ] **The ADR gate and the owner signature** are mirrored in exactly three
      places — verification **V-11**, Definition-of-done items **0** and **0b**,
      and the "Owner signature form" table — and V-11's checks are all
      **positive** greps (assert `Status: Accepted` and the dated `OWNER-SIGNED`
      lines are present). Never restate this gate as "no warning present": that
      form is satisfied by deleting the warning. **The required signature form is
      published in the table below, not only in a bash comment** — round 2 found
      ADR-0034's line written unformatted precisely because the form lived only
      inside V-11's comment block, where an owner would never read it.
- [ ] **The split provenance** is mirrored in the Provenance section at the top
      of this file and in **V-20**, which pins that section **by checksum over
      the extracted block**, not by grepping tokens out of the whole file. The
      earlier token form was satisfied by its own grep commands — deleting the
      entire Provenance section left V-20 green, because both needles still
      occurred inside V-20 itself. **Any check that names a needle must extract
      the region it is checking first**, so the command's own text is out of
      scope; that rule now also holds V-17 and V-11. The section exists so that
      the `## OWNER-APPROVED` block at the end of this file can never be read out
      of context — a signature whose document changed name without a record of
      why is a signature nobody can audit — and V-20's checksum means the block is
      frozen, exactly like the threat model under V-18.
- [ ] **The private tree** is mirrored in the `src/core/private-fs.js` and
      `tests/unit/private-fs.test.js` Deliverables rows, the "The private-tree
      extension, exactly" section, the Current-state paragraph on
      `private-fs.js`, the Security checklist bullet on the redaction copy's
      modes, acceptance criterion **AC-23**, mutation row **M-19** and
      verification **V-23**. The deciding surface is `A5_PRIVATE_DIRS` in the
      code itself; this spec says which element to add and nothing about modes,
      which are the module's own (0700 dirs / 0600 files, unchanged).

### Owner signature form — canonical

V-11 greps for an owner-written signature line in two files. **This table, not
the grep, is what an owner reads to know what to type**; the grep is derived
from it. Round 2 found ADR-0034's line written plainly rather than as a
blockquote because the form existed only inside a bash comment.

| # | Fact | Value |
|---|------|-------|
| S1 | the marker | the literal token `OWNER-SIGNED`, followed by a `YYYY-MM-DD` date |
| S2 | position | at the **start of a line**. Leading `>` (blockquote) and `*` (bold/emphasis) characters are permitted and ignored; leading prose is not |
| S3 | separator between marker and date | any run of spaces, em-dashes, en-dashes or hyphens, including none |
| S4 | where it must appear | `docs/adr/0034-accidental-persistence-threat-model.md` **and** `docs/specs/WP-secret-fence-ep2-redact-arm.md` (this file), once each. The detector leg has neither and needs neither — everything it decides is governed by ADR-0034 |
| S5 | who may write it | **the owner, and nobody else.** No agent writes this line, ever, including to "fix" a red V-11, including to "carry it across" a rename, and including to make two legs look symmetrical. A red V-11 means the signature is genuinely absent and the WP is not ready to merge |
| S6 | what it is **not** | it is not the `OWNER-RATIFIED IN SESSION` blockquote. That block is an agent's transcription of a decision taken in conversation; a gate keyed on it would be satisfied by the process it exists to constrain |
| S7 | current state, 2026-07-26 | both signatures are on disk and V-11 passes. ADR-0034's is in **S2's plain form**, on its own line in the header region above the first `##`; this file's is in **S2's decorated form**, inside the `## OWNER-APPROVED` section at the end. Both carry a 2026-07-25 date. **Their exact bytes are deliberately not reproduced in this row** — the same reason V-11 pins them by digest rather than by a literal: a copy-pasteable signature template is an invitation to type one, and S5 says nobody ever does. The pin is V-11's `shasum` over the two matched lines; a red line there means one of them was edited, re-dated, re-formatted or relocated, and the repair is `git checkout` of the owner's text, never a retype and never a new digest. Both are the owner's own text and **must not be edited, re-formatted, re-dated or relocated by anyone.** This file's line was written when the file was named `WP-secret-fence-two-tier-entropy.md`; the rename is recorded in the Provenance section and is the subject of Definition-of-done item **0b** |

### The recovery runbook

`docs/runbooks/secret-incident.md` is the document the **secret quarantine**
entry of `docs/GLOSSARY.md` points users at. **This WP makes three edits to it and
no others** (its Deliverables row). All three are required; shipping any subset
leaves the runbook describing a folder that no longer behaves the way it says.
**The text of all three is decided in Table Q rows Q3, Q4 and Q5**; this section
carries the enumerated content each row points at, and where the two could be read
as disagreeing, Table Q wins.

**Edit 1 — step 3's existing `state/quarantine/` bullet loses its two false
lifecycle claims (Table Q row Q3).** At `efd1489` that bullet says the digest
"shows a banner while this folder is non-empty" (line 43) and that "the banner
clears once the folder is empty" (line 48). After this WP the folder contains
`redacted/` from the first redaction onwards, so both are false — the banner is
driven by `listSecretQuarantine`, which after the `digest.js` change counts
**files** only. Rewrite both to speak about **withheld notes** rather than about
the folder, and change `Open each file` to `Open each file in it` so the
instruction does not send the user into a directory. The rest of the bullet — the
T4 reference, the true-positive/false-positive branch, the "rotate first"
instruction — is byte-unchanged in meaning; V-13 permits the whole bullet to be
rewrapped because a wording change to two of its lines reflows the rest.

**Edit 2 — step 3 gains the redacted-copy recovery path (Table Q row Q4).** Today step 3 describes
only the withhold outcome: "Wienerdog set aside a dream note it wouldn't commit".
After this WP a user can also find `[REDACTED:high-entropy]` inside a note that
**was** committed, and there is currently no documented path from that to
`state/quarantine/redacted/` — where the original sits, under the cap
**Table N row N1** decides, which will eventually delete it. Add one bullet immediately after
the existing `state/quarantine/` bullet, in that runbook's existing voice (plain
language for knowledge workers, no jargon). It must say, and must not say more
than:

- where the original is — `state/quarantine/redacted/`, **one file per note the
  scan rewrote**, named `<date>-<note name>`. **Not "per scrubbed note that was
  committed"**: Table R rows R2–R7c put a copy there for a note the gate then
  withheld, and although the fall-through deletes it again (Table R consequence
  2) there is one combination in which it stays;
- what to do with it — if the scrub was wrong, copy the text back into the note
  by hand; if it was right, delete the file once the credential has been rotated
  (step 2), because it holds the raw bytes;
- that **there is no banner for this one**, so the dream report
  (`<reports_dir>/<date>.md`, section `## Redacted in place (secret scan)`) is
  where it is announced (Table B row B7);
- that the folder **keeps roughly the 50 most recent** copies (**Table N row N1**) — and that right after a run which redacted a great many notes it can briefly hold more, because a run never deletes its own copies (**N5**); so
  a redaction the user wants to review should be reviewed within roughly two
  months rather than left indefinitely. This is one of the two registered
  carve-outs the Mirrored Surface Checklist registers — read the count there, not here: the runbook is user-facing copy and
  must name the number, and this bullet carries it on the runbook's behalf;
- **that `wienerdog uninstall` removes this folder along with everything else
  under `state/`, so anything worth keeping must be copied out first.** In the
  runbook's own plain voice, not in those words — it is a knowledge-worker
  document. **This bullet is REQUIRED by the owner's option-C ruling of
  2026-07-27** (see "ANSWERED — 2026-07-27" under the OWNER-DECIDED ADR-0019 section) and
  is the whole of what option C adds to the runbook. Without it the runbook
  documents a recovery path and conceals its expiry, which is the defect the
  ruling closes; `wienerdog uninstall` is the one event that removes these
  copies without the user choosing to, and residual **12** records why the
  disposal itself is left alone until the follow-on WP lands.

**Edit 3 — step 5's "confirm it's empty" instruction becomes reachable (Table Q
row Q5).** Step 5 currently ends with:

> ```
>    - Confirm `state/quarantine/` is empty — while anything is in it, the
>      digest keeps showing a "held for review" notice.
> ```

After this WP that folder contains `redacted/` from the first redaction onwards
and is **never observably empty again**, so the user is told to reach a state
they cannot reach. The *banner* is correct — Table B row B7 gives redactions no
banner, and the `listSecretQuarantine` change means the subdirectory never enters
it — but the instruction contradicts what the user sees in their file manager.
Replace those two lines with a bullet that says, and says no more than:

- confirm `state/quarantine/` **holds no withheld notes** — the `redacted/`
  folder inside it is a different thing, covered in step 3, and it does not keep
  the notice showing;
- while a withheld note is there, the digest keeps showing the "held for review"
  notice.

**The banner's own text does change, and Table Q row Q1 is where** — an earlier
revision of this section claimed the opposite, on the argument that "from the
banner's point of view, files only, it is true". That argument fails on the
banner's own words: it does not say "when no withheld copies are left", it says
"when the folder is empty", and the folder the user opens is not empty. It also
tells the user to delete the rest of what is in it. Both are corrected in Q1, in
the same pass as this runbook, for the same reason.

**Do not** restate the detector's rules, the severities, or any number from the
detector leg's corpus tables in the runbook. It is a recovery document, not a
second copy of a spec. **No part of the file outside these three edits changes**,
and V-13 checks that by requiring every removed line in the diff to fall inside
either the step-3 quarantine bullet or the step-5 bullet, both reproduced in
full in V-13's permitted-removals list.

## Implementation notes & constraints

- **Zero new dependencies.** Plain Node ≥ 18, JSDoc types, no TypeScript, no
  build step (CLAUDE.md).
- **`node --test <file>` bypasses `tests/run.js:7`**, the only place
  `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set. Always run
  `node tests/run.js <paths>`. Never use `--test-name-pattern` as a gate: with a
  pattern that matches nothing, `node --test` exits 0 reporting `pass 1`, because
  the file wrapper itself counts as a passing test.
- **A test that passes against unmodified `main` is not evidence.** Every
  acceptance criterion below **that asserts `src/` behaviour** has a row in the
  Mutation checks table naming a one-line change to `src/` that must make it
  fail: AC-7, AC-8, AC-9, AC-10, AC-14, AC-23, AC-24, AC-25, AC-26 and AC-27
  (whose `src/` surface is the code comment M-32 mutates; its `docs/` surface is
  bounded by V-27 instead, exactly as AC-19's is by V-13). Run them;
  paste the output. **Five criteria deliberately have no mutation row, and here is
  why**, so that a reader does not read the gap as an omission (round 5 corrected
  the count, which said four and then listed five): **AC-21** is a
  precondition on `src/core/secret-scan.js`, which this WP may not edit at all —
  mutating it is forbidden by the Deliverables table, and V-16 is its check;
  **AC-15** *is* the claim that the mutation table works, so a row for it would
  be circular; **AC-16** asserts the suite and the lint pipeline rather than a
  behaviour; **AC-19** and **AC-22** are documentation criteria with no `src/`
  surface to mutate, and V-13 and V-22 bound their diffs instead.
- **A fault injection with no named mechanism is not a test either.** Every
  `FI-*` id in this document has a row in **Table T** giving the exact seam that
  produces it. If you cannot produce one from that row, that is a spec bug — say
  so in the PR and stop. Do not approximate it, and do not skip it.
- **Verification exit status carries the verdict.** A script that prints
  `DIVERGED` and exits 0 is a defect, not a report. Every command in
  "Verification steps" must exit non-zero on failure.
- **Do not touch `src/cli/dream.js`.** Table B rows B8/B9 exist precisely so
  that file needs no change: `secretReverts` keeps its meaning, and
  `secretRedactions` is a new field nothing reads yet.
- **Do not touch `src/core/secret-scan.js`.** It is leg 1's and it is already
  correct — Table P is how you check that, not something you fix.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Sizing — this is leg 2 of a two-leg split

`size: M`. The parent spec (`WP-secret-fence-two-tier-entropy`) was one large M
and its round-2 sizing assessment named the fault line precisely: **the Table A /
Table B boundary.** This WP is the Table B side of that line. The parent declined
to split on authorization grounds — the owner's signature sat on the parent file
and what it signed was Table B content, so moving Table B out would have stranded
it. **The split executed on 2026-07-26 solved that the other way round: Table B
stayed in the signed file and the file was renamed.** See the Provenance section.

**Round 3 added a third `src/` file and it is still M, deliberately.**
`src/core/private-fs.js` gains one array element, one guarded `listNames` block
copied from the line above it, and one stale comment correction — about fifteen
lines with no new abstraction, no new mode and no new export. It is in this WP
rather than a follow-on because the directory it covers is created **by** this
WP, and a follow-on would ship a window in which Wienerdog writes raw secret
bytes to a path it does not check the permissions of. The rest of round 3's work
is contract consolidation into Table R, which removed more prose than it added.

**Round 4 added a fourth `src/` file and one more test file, and it is still M.**
`src/core/dream/ledger.js` changes **one sentence** and
`tests/unit/ledger.test.js` changes **the one line that pins it** — the banner
that, after this WP, tells the user to delete the originals this WP creates. Same
argument as `private-fs.js`: the trap is created *by* this WP, so a follow-on
would ship a window in which the product instructs users to destroy the recovery
copy. Round 4's other work is `src/` behaviour that shrinks rather than grows —
row **B3a** is one statement, row B10's `allowFail` is an option object — plus
the contract consolidation into **Table T**, which deleted the fault-injection
list it replaced. **The scratch-index redesign was explicitly declined** and
deferred to a named follow-on; see "Why not scan through a temporary index".

**Round 5 changed no file count and it is still M.** The `src/` delta is one
banner line in `src/core/digest.js` (**Table Q row Q1**, a file already in
Deliverables for `listSecretQuarantine`) plus two changes inside the redact arm:
B10's single `git add` becomes three `allowFail` git calls placed before the
rename instead of after it, and the fall-through gains one guarded `fs.rmSync` —
on the order of fifteen lines, no new file, no new export, no new abstraction.
**The contract got smaller, not larger.** Making the stage index-first removed
the entire R7 special case it replaced: the old "the working tree is scrubbed and
B3 preserves the wrong bytes" row, its bespoke reason string, the residual that
stated its cost, and the exception in Table R consequence 1 all disappear,
because under index-first **every** failing row leaves the working tree
byte-unchanged. What is added back is one narrower row (**R7b**, the rename
failing after a successful stage) and one invariant (**I2**). Net: one more Table
R row, four fewer paragraphs of special-casing.

**Round 6 added an eleventh file and it is still M — and the file-count heuristic
is deliberately exceeded.** `docs/specs/README.md:11` sets ≤ 8 files touched as a
sizing heuristic; this WP is at eleven. The `src/` delta round 6 adds is **one
comparison** — the `Buffer.compare` guard on the fall-through's delete — plus two
comment corrections. The eleventh file is `docs/THREAT-MODEL.md`, and it is two
clauses in one bullet and one clause in one sentence. **Shipping code that
falsifies the repository's own threat model in order to hit a file count is the
wrong trade**, and there is direct precedent for exactly this row:
`docs/specs/done/WP-stance-authority-containment.md` carries a clause-scoped
`docs/THREAT-MODEL.md` row — the Deliverables row reading
`| modify | docs/THREAT-MODEL.md | **D7** — the stance clause …` — exceeds the
same heuristic by two, and says so. *(Re-pinned in round 1 of the design gate:
that spec completed and moved into `done/`, and the line number an earlier
revision cited now points at an unrelated line. Cited by row content here,
because a line citation into another spec rots on every completion.)* The
alternative — a follow-on WP — would ship a window in which the threat model
states the negation of the shipped behaviour, which is the same shape as the
`private-fs.js` and `ledger.js` arguments in the two paragraphs above and gets
the same answer. The rest of round 6 is contract work that removes prose: a
membership predicate derived from a grep instead of restated, two disclosures
made precise, one false uniqueness claim deleted, one unreproducible
justification deleted.

**Round 7 adds no file and no line of behaviour — still M, Deliverables
unchanged.** Its `src/` delta is **one comment block** in a file already listed
(`validate.js`, Table Q row **Q17**). The rest is contract work: one widened grep
alternation, two stale numeric mirrors replaced by a citation, one test-seam
precondition replaced by a seam property, four one-sentence disclosures. The
file-count heuristic is unmoved at eleven.

### Why this leg cannot go first — the ordering prohibition

`depends_on: [WP-secret-fence-two-tier-detector]` and verification step **V-16**
both enforce the order. The reason is recorded here in prose as well, because a
dependency edge tells you *that* something is ordered, not *why*, and a future
reader with a reason to hurry will otherwise re-derive the wrong answer. **Both
readings of "gate first" are bad:**

1. **This WP alone, without leg 1's Table A row A10.** EP2 starts branching on
   severity while sixteen labelled rules still carry `redact` — bearer headers,
   sensitive `key=value` assignments, JSON values under a sensitive key, and the
   rest. Those sixteen would silently convert from "withhold the note" to "scrub
   the line and commit the note", a loosening of ADR-0024's ratified behaviour
   that nothing in this epic intends and no measurement supports. **Table P row
   P2 is the check that catches exactly this**, which is why it is expressed as
   "`redact` has exactly one producer" rather than as a list of rules.
   Compounding it, without leg 1's row A15 (Table P row **P4**) `hasHardFinding`
   is order-dependent, so this gate would take the redact arm on a note that
   contains a genuine bound-context secret.
2. **This WP dragging A10 along but not the tiering.** Sixteen labelled rules
   rise to `quarantine` and EP2 learns to honour severity — but the entropy pass
   is still context-free and still `quarantine`, so it still fires on the notes
   D1 counts, and every one of them still withholds. The user gets the entire
   redact-arm mechanism (a second quarantine directory, a report section, a
   retention cap, a new counter) and **none** of the benefit, because the
   destructive rule is untouched. All cost, no payoff.

The order is fixed: **detector, then gate.** A useful consequence for this leg is
that leg 1's measured numbers are on `main` before this WP is implemented, so
this document cites shipped facts (Table P) and a durable ADR (D1/D2) rather than
restating a measurement it cannot reproduce.

## Security checklist

- [ ] No untrusted identifier flows into a filesystem path here. `kind` (Table B)
      is one of two code-supplied literals, validated by equality against both,
      throwing otherwise — it is never derived from vault content, argv, or env.
      The destination basename continues to come from the existing
      `displayName(rel)` sanitizer (`validate.js:658`), and `listSecretQuarantine`
      re-whitelists to `[A-Za-z0-9._-]` before rendering.
- [ ] The redaction copy is written 0600 inside 0700 by the existing
      `quarantinePreserve` code path, and its **content is never read** by the
      digest, the report, or any log line — only its sanitized basename.
- [ ] **Those modes stay right after drift, not just at write time.**
      `state/quarantine/redacted/` joins the A5 private tree in
      `src/core/private-fs.js`, so `wienerdog doctor` flags it, the insecure-modes
      digest banner counts it, and `wienerdog sync` repairs it if a umask, a
      restore-from-backup or a manual `chmod` ever loosens it. Without that entry
      a world-readable pre-scrub credential copy is invisible to all three
      surfaces — demonstrated, see Current state.
- [ ] `scrubAddedLines` writes only lines the run added. A line number derived
      from a hunk header is bounds-checked against the file's line count before
      indexing; an out-of-range number aborts the scrub and falls through to
      **Table B row B5a** (withhold, via **Table R row R3**), never writes at a
      computed offset. **B5a, not B5** — B5 is the *preserve*-failure transition;
      B5a is the *scrub*-failure transition, and out-of-range line numbers are
      the latter.
- [ ] The scrub's temp file is created **inside the vault**, in the target's own
      directory, and is removed on every exit path. It holds sanitized bytes, not
      raw ones — the redaction happens in memory before the temp is opened — so
      even the crash case in accepted residual 5 never leaves raw secret bytes at
      a new path.
- [ ] The retention prune (B12) deletes only inside `<stateDir>/quarantine/redacted/`,
      only entries matching `^[0-9]{4}-[0-9]{2}-[0-9]{2}-`, only regular files,
      and **never any copy this run created** — every fact here is **Table N**'s
      (N2 the trigger, N3 the exclusion set, N4 the ordering, N5 the
      precedence), and this bullet restates no number. *The per-call form it
      carried until round 2 — "never the copy the current B4 just created" — is
      exactly what mutation **M-48** mutates TO.*
- [ ] **The fall-through's deletion of the `redacted/` copy is the second and last
      delete path this WP adds, and it is narrower than the prune.** It is
      `fs.rmSync` on exactly `path.join(stateDir, 'quarantine', 'redacted', basename)`,
      where `basename` is the string `quarantinePreserve` itself returned — never
      a reconstruction, never a pattern, never a directory, and **never reached at
      all unless B3's own preserve wrote a copy whose bytes compare equal to the
      one about to be deleted** (Table R consequence 2). That comparison, not the
      argument that the two copies must agree, is what makes the delete safe when
      the note's owner saves it mid-dream. No untrusted identifier reaches it:
      the basename already went through `displayName`'s sanitizer.
- [ ] **The index never carries this run's raw added bytes into Step 4** —
      invariant **I1** under Table R, established by row B10's index-first stage on
      the success path and by rows B3/B3a on every fall-through **that reverts**,
      and asserted by AC-24. **On rows R0, R0b and R9 the invariant is VACUOUS
      rather than established** — all three abort before Step 4, so the boundary
      I1 is about is never reached; I1's own carve-out under Table R says so, and
      AC-24 excludes all three. Residual **7** covers R9's staged-bytes case and
      residuals **10**/**10b** cover the two aborts; none is a silent gap.
- [ ] **The working tree never holds the scrubbed form over an index holding the
      raw one** — invariant **I2**, established by B10 staging the temp's blob
      before renaming it over the target, and asserted by AC-24 through Table T
      row **I2**. This is the one repository state this WP would otherwise invent:
      before it, Step 3 stages the file it is about to scan, so the tree and the
      index always agreed, and a kill anywhere in the gate left them agreeing. A
      scrubbed file over a raw index is the state a user reads as "the secret is
      gone" while a later `git commit` ships it, and **no row of Table R sees it**,
      because neither B3 nor R9 runs on a kill.

## Accepted residuals (stated, not buried)

1. **A context-free high-entropy hit is now scrubbed and committed rather than
   withheld.** If it was a real credential, its `[REDACTED:high-entropy]`
   replacement is committed in its place and the raw bytes sit in
   `state/quarantine/redacted/` — local-only, 0600 inside 0700, never committed,
   never synced, removed wholesale by `wienerdog uninstall` through
   `disposeCoreMechanics` (ADR-0019) — rather than in vault git history. That is
   a strictly better outcome for the true positive **and** for the false
   positive; what is given up is the loud stop. Ratified in ADR-0034's Boundary
   statement, item 3.
2. **A benign run that trips the context-free tier is silently rewritten in the
   user's own note.** "Silently" is bounded, not absolute: the pre-scrub original
   is preserved before a byte is written (B4/B5/B10), the rewrite is announced in
   the dream report (B7), and the recovery path is documented in
   `docs/runbooks/secret-incident.md` (AC-19). What is genuinely given up is the
   digest banner — the user must read the dream report to notice. That is the
   owner-confirmed trade in Table B rows B6/B7, and the reason is that a routine
   outcome (D2's second figure) does not deserve a banner that says "action
   required".
3. **The preserved original ages out.** B12 caps `state/quarantine/redacted/`, so
   a redaction the user wants to review must be reviewed within roughly the
   window B12's cap buys at D2's rate. B13 keeps `state/quarantine/` unbounded
   because a withheld note is rare and urgent. The runbook says this in the
   user's words (AC-19).
4. **`secretRedactions` is written and nothing reads it.** Deliberate: making
   `src/cli/dream.js` react to it would change transcript-ledger semantics, which
   is out of scope and is exactly what rows B8/B9 forbid. A field with one
   producer and no consumer is the correct shape for a counter whose only current
   job is to be *distinguishable from* `secretReverts`.
5. **A hard kill inside `scrubAddedLines`'s write can leave one temp file in the
   vault, and no later run cleans it up.** The temp is dot-prefixed and
   code-named (`.<basename>.wienerdog-scrub.<pid>.tmp`) and is removed on every
   ordinary exit path, so this needs a kill -9, a panic or a power loss inside a
   window of a few milliseconds. What survives is **sanitized** content — the
   redaction is computed in memory before the temp is opened — so the residual is
   a stray junk file, never raw secret bytes at a new path. A subsequent run's
   Step 5 `git add -A` would commit it as an oddly-named note. Deliberately not
   fixed: a sweep for stale temps means a code path that **deletes files inside
   the user's vault** on a name match, which is a materially worse thing to own
   than a junk file, and it is not what this WP is for.
6. **A fall-through can leave a second copy of a withheld note in `redacted/`,
   in three combinations.** Ordinarily it does not: Table R consequence 2 deletes
   the `redacted/` copy as the last statement of the fall-through, so the user
   ends with exactly one copy, in `state/quarantine/`, announced by the existing
   banner and report line. The three exceptions are stated rather than engineered
   away. **(a) B3's own preserve also failed.** Then the `redacted/` copy is kept
   deliberately — it is the only copy of that note's bytes anywhere — and the
   report line names it through Q8's extra suffix. The residual is that a raw
   pre-scrub copy then lives in a folder no banner mentions, on B12's capped
   FIFO, so it ages out on the same schedule as a routine copy; the user has
   roughly the window B12's cap buys at D2's rate to act on it. **(b) row R9.**
   The fall-through threw before reaching the deletion, so a duplicate stays
   behind. Nothing was committed on R9 and the run failed loudly, so the copy is
   a stale duplicate of a note still in the working tree, not a loss — but it is
   raw bytes at a path nothing announces until the next run's prune reaches it.
   **(c) the two copies are not byte-identical** — the note was replaced between
   the two preserve reads, so the copies are two different versions of the user's
   text and both are kept. The residual is the same as (a): a raw pre-scrub copy
   in a folder no banner mentions, on B12's capped FIFO, named only by Q8's
   suffix in the dream report. All three are strictly better than the alternative
   considered and rejected: deleting unconditionally, which in cases (a) and (c)
   destroys the user's only copy of that version, inside the code path that
   exists to prevent exactly that.
7. **If the git index cannot be written at all, this run's raw added bytes stay
   staged** (Table R row **R9**). Nothing can unstage them — every repair is
   itself an index write — so the gate does the only safe thing: `git()` throws,
   Step 4 never appends, Step 5 never commits, and the dream job fails loudly with
   its failure banner. **This window is inherited, not created here**: Step 3's
   opening `git add -A` (`validate.js:904`) has staged raw bytes before any scan
   since WP-123, and any throw between it and Step 5 has always left them there.
   This WP makes the window strictly smaller (rows B3a and B10, invariant I1) and
   does not close it; closing it means scanning through a scratch index, which is
   the deferred follow-on recorded under "Why not scan through a temporary index".
   What remains staged is only recoverable by the user running `git reset` in
   their vault once the underlying condition (a held lock, a read-only `.git`) is
   fixed — and a subsequent successful dream does it for them, because Step 3's
   `git add -A` plus this gate re-derive the whole state from the working tree.
8. **A kill between the index-first stage and the rename leaves a repository a
   manual `git commit` resolves oddly — and it fails safe.** Invariant I2 makes
   the surviving state "index sanitized, working tree raw". If the user then
   commits by hand rather than letting the next dream re-derive the state, the
   commit carries the sanitized form while the working tree still holds the raw
   one, so the vault is dirty against `HEAD` and the **next dream's
   `assertCleanTree` refuses to run** with its ordinary message. Loud, no data
   lost, nothing raw committed, and the user's own text still on disk — but it is
   an unusual-looking stop, so it is stated here rather than discovered. The
   ordinary path needs no intervention: Step 3's `git add -A` re-derives
   everything from the working tree and the arm runs again.
9. **A note replaced between the pre-rename compare and the rename itself is
   still a race — but the window is now microseconds, not the whole arm.**
   **Round 1 of the design gate narrowed this residual rather than deleting it,
   and the previous, much wider version is quoted so the narrowing is
   checkable.** It read: "A note replaced between the preserve read and the scrub
   read is scrubbed against the newer bytes while `redacted/` holds the older
   ones… Deliberately not fixed: closing it means a version check — a stat/mtime
   or content re-read between the preserve and the scrub — whose only correct
   response is to abandon the arm and withhold, which trades a rare stale
   recovery copy for a more common lost night."

   **That trade was mis-stated, which is why the fix landed.** The cost is not "a
   more common lost night": the arm already withholds on a dozen other
   conditions, and a withhold is recoverable. The cost of *not* checking is the
   permanent loss of a save the user made and that nothing ever preserved — a
   loss the "preserve first" design exists to make impossible. So the version
   check is now in the contract, in two parts: **one captured buffer** removes
   the preserve/scrub divergence entirely (there is no second content read to
   diverge), and **the pre-rename compare** (row **R7c**) refuses to overwrite a
   target that changed.

   **What remains, stated exactly.** A save landing between the compare and the
   kernel completing the `rename(2)` is not detectable by any user-space check —
   that is a filesystem race, not a design choice. It is bounded to the interval
   between two adjacent syscalls rather than to the whole preserve-scrub-stage
   sequence. Two pre-existing properties still bound the damage and neither is
   accidental: **the scrub cannot mangle innocent text** — it replaces line `L`
   with `scanAndRedact(lines[L-1]).text`, which returns a finding-free line
   unchanged, so a stale line number can only rewrite a line that itself matches;
   and **an unscanned mid-run edit reaching the commit is inherited, not created
   here** — Step 5's unconditional `git add -A` (`validate.js:978`) has always
   staged whatever the working tree holds at that moment.
10. **The gate can abort a run without reverting anything, and the vault is left
    dirty** (Table R row **R0**, Table B row **B3b**). When both preserves fail —
    no `stateDir`, ENOSPC, an unwritable quarantine tree — the gate raises rather
    than reverting, so the note stays in the working tree, this run's raw added
    bytes stay staged, and no commit is made. **That is the same end state row R9
    already produces**, and residual 7 describes what it costs: the user runs
    `git reset` in their vault once the underlying condition is fixed, or simply
    lets the next successful dream re-derive the whole state from the working
    tree. **What is deliberately given up is the tidiness of the failure**; what
    is bought is that no note is ever deleted without a durable copy existing.
    The trade is stated rather than buried because the *previous* behaviour —
    revert anyway, report the loss in a reason suffix — looked tidier and
    destroyed data.
10b. **The gate can also abort when a durable copy EXISTS but is of the wrong
    bytes** (Table R row **R0b**, Table B row **B3b**, identity read **K4**).
    Same end state as residual 10 — nothing reverted, nothing committed, the run
    fails loudly — reached when the note's owner saved it mid-dream *and* B3's
    own preserve then failed. **The user ends holding two versions and losing
    neither**: their save on disk, and the pre-save capture in `redacted/`,
    **whose basename B3b's `WienerdogError` names** — *not* Q8's suffix, which
    belongs to consequence 2 and never runs on an abort. Round 5 claimed Q8
    twice and Q8 cannot reach this row: `reverted[]` is never rendered here
    because Step 4 is never reached. *Round 5 of the design gate: the
    previous condition tested whether a copy existed rather than whether it was a
    copy of the bytes about to be destroyed, and the difference is a whole class
    of permanent loss.*
11. **A save landing between the last check and the revert is destroyed, and no
    check can close that window.** Every withhold ends in `git checkout HEAD --`
    or `fs.rmSync`; everything that makes that safe — K3's preserve, K4's
    identity comparison — happens *earlier*. A save in between is gone, and on
    an untracked note irreversibly. **K4 narrows this and does not close it**:
    it converts a *known* stale copy into an abort, which is strictly better
    than reverting whenever any copy exists, and it cannot see a save that
    lands after it.

    **THIS RACE IS INHERITED AND THAT IS WHY IT IS A RESIDUAL.** Verified
    against shipped `main`: `quarantinePreserve` reads at `validate.js:654` and
    B3 then reverts — the identical window, on every withhold, for every
    severity, since WP-123. **This WP adds paths that reach B3; it does not add
    the race**, and it does not make it wider. What it *did* add, and round 6
    removed, was the claim that K4 made the revert safe.

    **Not fixed here, and the fix is named.** Closing it means changing how B3
    destroys — taking the file by `rename(2)` so the gate captures bytes by
    removing the path rather than by reading it and trusting the read — which
    changes shipped withhold behaviour for `quarantine`-severity findings too.
    That is **`WP-ep2-atomic-withhold-handoff`**, named here so it is not lost.
    **Table T row RP-1 pins this residual as a test**, so the follow-on will
    know when it has changed something. The one in-scope alternative — aborting
    every fall-through instead of withholding — deletes a behaviour the owner's
    approval names, **was put to him, and was DECLINED on 2026-07-27 in favour of
    the architect's recommendation** — see "OWNER-DECIDED — the redact-arm
    fall-through is KEPT (option A)". This residual is therefore the decided
    disposition of that race in this WP, not an open question.
12. **`wienerdog uninstall` destroys every pre-scrub original, and this WP does
    not change that — it only stops the product concealing it.** `redacted/`
    lives under `state/`, which `disposeCoreMechanics` removes recursively
    (ADR-0019). A user who uninstalls before reviewing a redaction loses the only
    copy of that note's pre-scrub text, with no separate warning beyond the
    general uninstall disclosure. **Decided by the owner on 2026-07-27 as
    option C** — see "ANSWERED — 2026-07-27" under the OWNER-DECIDED ADR-0019 section — so
    what this WP ships is the *disclosure*: Table Q row **Q4** puts the fact in
    the recovery runbook, **Q6** puts the word *disposable* in the glossary, and
    the dream-report line says "restore from that copy **while it is there**".

    **Two things are deliberately NOT fixed here and both are stated rather than
    left to be discovered.** (i) **The ADR-0019 invariant conflict stands.**
    ADR-0019 says nothing user-authored is written under the canonical core;
    a pre-scrub copy of the user's own note is user-authored. This WP *extends*
    a breach the shipped withhold path opened — `state/quarantine/` has held
    withheld notes since WP-123 — rather than opening one, and closing it means
    amending a ratified ADR. (ii) **Uninstall still deletes without an export or
    a specific warning.** Both are the scope of
    **`WP-adr-0019-quarantine-uninstall-export`**
    (`docs/specs/WP-adr-0019-quarantine-uninstall-export.md`), the option-B
    follow-on the same ruling filed, which covers `state/quarantine/` and
    `state/quarantine/redacted/` together because the exposure is identical and
    predates this WP. **Deleting the copies on uninstall is not obviously wrong**
    — it is the argument ADR-0019 makes for `secrets/`, and leaving raw
    credential material on disk after an uninstall would be its own finding;
    what the follow-on decides is whether the user is offered the bytes first.

## Acceptance criteria

Criterion ids are inherited from the parent spec `WP-secret-fence-two-tier-entropy`
so that a reader can trace a criterion across the split. The gaps (AC-1 … AC-6,
AC-11 … AC-13, AC-17, AC-18, AC-20) are the detector leg's and are not missing
here.

- [ ] **AC-21 (preconditions, checked first).** Every row of **Table P** holds on
      `main` before any change is made (V-16). This is a gate, not a criterion to
      satisfy: if it fails, leg 1 is not merged and this WP must not be
      implemented.
- [ ] **AC-7** EP2 withholds on `hasHardFinding` (B3) and on binary (B2), with
      byte-identical reason strings and `secretReverts` accounting to today.
- [ ] **AC-8** EP2 on a redact-only finding preserves to
      `state/quarantine/redacted/`, scrubs **only** the added lines, leaves the
      file in place, and increments `secretRedactions` — not `secretReverts`
      (B4, B8, B9). A pre-existing secret on an unmodified line is not rewritten.
- [ ] **AC-9 (Table R, row by row).** **Every row of Table R has its own test** —
      **thirteen rows, thirteen tests** (round 1 added **R0**, the no-durable-copy
      abort, and **R7c**, the target-changed-under-the-arm abort; **round 5 added
      R0b**, the cross-product of the two — a durable copy that is not of the
      bytes on disk) — asserting that row's full cell set: the two return
      values, the working-tree file **at the instant `S` returned**, the
      `redacted/` copy's fate, the index state *when the row finishes*, the Table
      B row that runs next, both counters, and `reverted[]` membership. Rows
      R1–R7c each end in a withhold with `secretRedactions` unincremented and
      `secretReverts` incremented; **R8** is the only row that
      increments `secretRedactions` and the only one absent from `reverted[]`;
      **R9** returns nothing at all and is asserted as a thrown `WienerdogError`
      with no commit made and no report section appended.
      **The `redacted/` cell is a gate-level directory listing**, taken after the
      run: absent on R1 and R0 (no copy was ever written), absent on R2–R7b,
      **present on R7c and on R0b** (both keep it — the target changed, so the
      copy is the only record of the pre-save version), and present on R8 and
      R9.
      **THE ABORT MESSAGE IS ASSERTED FIELD BY FIELD ON ALL THREE ABORT ARMS,
      and round 8 is why.** B3b's `WienerdogError` is the only surface that
      reaches the user on an abort — Step 4 never appends, `reverted[]` is never
      rendered, no banner fires — and **Table Q row Q18 decides four fields**.
      Round 7 asserted one of them. Each of the three arms therefore asserts all
      four, **with values that differ between the arms**, which is what makes the
      assertions discriminating rather than a substring hunt:
      **R0** (`FI-12`, `FI-13`, `FI-14`, each on both tracked and untracked) —
      the message names the vault-relative **path**; names **BOTH preserves** as
      failed; records the identity check as **not performed**, because no
      durable copy existed to compare against; and **names no basename at all**,
      asserted as an ABSENCE, since none survives.
      **R0b via mismatch** (`FI-17` tracked, `FI-18` untracked) — the **path**;
      **B3's preserve** named as the one that failed, and the redact preserve
      **not** so named; the identity check recorded as **performed and
      mismatched**; and the surviving `redacted/` **basename**.
      **R0b via read error** (`FI-19`, both arms) — the **path**; **B3's
      preserve** named as the one that failed; the identity check recorded as
      **attempted and not possible**, which is a different value from the
      mismatch arm's and is what stops one wording covering both; and the
      surviving **basename**.
      Mutations **M-51** (basename), **M-53** (path), **M-54** (which preserve),
      **M-55** (identity disposition) each remove one field and must redden.
      It has **two**
      `redacted/`-cell extra cases, each with its own injection, and in both the
      copy must be
      **kept** and the report line must carry Q8's extra suffix naming it (Table
      R consequence 2): **FI-10**, in which B3's own preserve fails too, and
      **FI-11**, in which B3's preserve succeeds but writes **different bytes**
      because the note changed between the two preserve reads — there the test
      must additionally assert that **both** copies survive and that their
      contents differ, which is the whole point of the byte-identity guard.
      **A THIRD MANDATED EXTRA, added in round 2 of the design gate: FI-15, the
      captured-buffer derivation harness.** It is not a `redacted/`-cell case and
      it produces no Table R row — it observes the **R8** success row — but it is
      mandated **here** because until round 2 nothing mandated it at all: FI-15
      existed only in Table T and in prose, appeared in no fault-injection
      column, and mutation **M-46** keyed on it, so **M-46 had no named test to
      redden.** That is the round-4 defect one level out — a mechanism with no
      criterion — and this is where it is closed. The test must assert, on a
      completed R8: **exactly the reads Table K decides** — K1 and K2, in that
      order and at those positions, with K2's index falling between the temp
      write's and the rename's in FI-15's event log — and no third;
      that the `redacted/` copy equals the captured bytes; and that the scrubbed
      target equals the per-line scrub of those same bytes. **It must perturb
      nothing** — see Table T for why a perturbing form of this row is
      impossible rather than merely weak.
      **Which level each cell is asserted at is decided by Table T, not here**,
      and two of its rows are not negotiable: the `byte-unchanged` cell is
      **helper-level** (Table T row `BU`) because after the gate returns B3 has
      already reverted the file and the assertion is unsatisfiable (Table R,
      consequence 1); and **FI-3** is helper-level because the gate cannot be made
      to emit an out-of-range hunk line number. **The mechanism for every
      injection is Table T's `mechanism` column** — including **FI-5b**, a failure
      part-way through the write rather than at open, and **FI-4/FI-6/FI-7/FI-8/FI-9**,
      which all go through the `require.cache` seam Table T's preamble describes
      because `validate.js` destructures those bindings at module load.
      **Four of those rows carry a condition that the test must honour or the
      row passes vacuously** — three found in round 5, the fourth in round 7:
      **FI-1**'s chmod case requires a fixture in which
      `<stateDir>/quarantine/redacted/` does **not** already exist; **FI-2** at
      gate level requires the stateful `fs.readFileSync` patch, because a plain
      0000 chmod produces **R1**, not R2; **FI-4 and FI-6 must use different
      stubs**, each order-independent, or R4 and R6 are the same test and M-17
      survives; and **FI-2's and FI-11's read counter must be RELATIVE, armed by
      the first Buffer read of the target as Table T's preamble defines**, never
      absolute over the whole `validateAndCommit` run. Step 2 reads the same path
      up to three times before the gate on a Tier-3 or new-skill-draft fixture —
      the case Table B row **B11** explicitly contemplates — and under an
      absolute counter FI-2 lands on **R1** instead of R2 while FI-11's differing
      bytes land on the scrub, leaving the byte-identity guard untested and
      **M-31 green**. It is the only one of the four that is a property of the
      *seam* rather than of the fixture, deliberately: the relative form removes
      the way to violate it.
- [ ] **AC-10** `listSecretQuarantine` ignores the `redacted/` subdirectory; the
      withhold banner's **head** is byte-unchanged (its closing sentence is
      AC-26's, not this criterion's); the dream report gains the
      `## Redacted in place (secret scan)` section only when a redaction occurred,
      and it is appended **after** `## Reverted by orchestrator`. **The redaction
      line matches the pinned template** under "The dream report" — asserted as a
      full-line equality against the expected string for a two-line scrub, not as
      a substring or a loose regex, so the separators, the `line(s)` form and the
      basename position are all held.
- [ ] **AC-14** The retention prune keeps at most the cap **Table N row N1**
      decides, prunes by `(mtimeMs, name)` rather than by name alone, **runs once
      per gate run rather than once per completed B4**, **never deletes ANY copy
      this run created**, never runs on a B5/B5a fall-through, and never deletes
      outside `quarantine/redacted/`. Driven by a
      fixture holding more than the cap's worth of **same-date, differently-named**
      copies, so a lexical prune is observably wrong.
      **A second case is mandatory and it is the one round 1 of the design gate
      added**: a fixture starting **at the cap**, and a single run that completes
      **several** B4s. The copies must be given **tied** `mtimeMs` values (several
      inside one filesystem tick) and, in a third variant, **skewed** ones (an
      `mtime` that is not monotonic across the run), because those are the two
      conditions under which `(mtimeMs, name)` ordering falls back to the
      basename and a copy this run just wrote becomes the oldest candidate.
      Assert that **every** basename the run created is still present when the
      run ends, and that the directory is back at the cap **(Table N rows N1–N4)**.
      **A THIRD CASE IS MANDATORY and it is the above-the-cap boundary (round 2 of the
      design gate):** a run completing **51 or more** successful B4s, driven
      **twice** — once from an **empty** `redacted/` and once from a **full**
      one (at the cap). In both, assert that **every** basename the run
      created is present when the run ends, that the directory **is allowed to
      exceed the cap** (**N5**), that **a subsequent run with NO redactions leaves
      the overshoot UNCHANGED** — N2 runs the prune only after a completed B4 —
      and that **the next run which completes at least one B4 prunes it back**
      (**N6**). **This is the case the cap and the never-evict rule
      cannot both satisfy**, which is why Table N row **N5** states a precedence
      rather than two rules; a fixture bounded below 51 cannot see it at all.
      *Provenance: round 3 found this criterion mandating a zero-redaction run
      prune back — impossible under N2 — and round 4 appended the correction as
      commentary instead of editing the assertion, so it stood for a further
      round. The assertion above is now the criterion. See the N2/N6 decision
      under Table N.* **A per-call prune
      fails this case and a per-run prune passes it** — which is the whole reason
      the case exists, because the previous design's defence was an arithmetic
      claim (Table R consequence 7) that was false by three orders of magnitude
      and that no test could have caught.
- [ ] **AC-15** Every mutation in the Mutation checks table makes at least one
      named test fail.
- [ ] **AC-16** `npm test` and `npm run lint` pass; running the dream twice over
      an unchanged corpus produces zero changes on the second run.
- [ ] **AC-19** `docs/runbooks/secret-incident.md` carries all three Table Q
      edits: step 3's existing quarantine bullet speaks about **withheld notes**
      rather than about the folder being empty (**Q3**), step 3 documents the
      `state/quarantine/redacted/` recovery path, the absence of a banner, the
      cap **and the fact that `wienerdog uninstall` removes the folder** (**Q4**
      — the last of those is required by the owner's option-C ruling of
      2026-07-27 and is what makes the documented recovery path disclose its own
      expiry), and step 5's "confirm it's empty" instruction names
      withheld notes rather than the folder (**Q5**, B13). Nothing outside those
      three edits changed — asserted by V-13 as a bound on the diff's **removed**
      lines, not as "zero removals", which edits 1 and 3 necessarily break.
- [ ] **AC-22** The glossary's gate sentences and its **secret quarantine** entry
      describe the severity branch and both destinations; the detector sentences
      leg 1 wrote are byte-unchanged — asserted as a bound on the glossary diff's
      removed lines, not as the presence of a single surviving token.
- [ ] **AC-23** `state/quarantine/redacted/` and a file inside it are enumerated
      by `insecureEntries` when their modes are wrong, and repaired to 0700/0600
      by `repairPrivateModes`. Test the reproduction from Current state directly:
      a `0755` `redacted/` holding a `0644` file must appear in
      `insecureEntries`, where today it does not.
- [ ] **AC-25** The `secret-revert-exhausted` banner
      (`src/core/dream/ledger.js:368`) no longer tells the user to delete
      everything in `state/quarantine/`: its new text carries
      `(not the redacted/ folder inside it)` and keeps the prefix
      `The withheld copies are in state/quarantine/` byte-identical, so
      `tests/integration/dream.test.js:1437` still passes **without being
      edited**. Nothing else in that banner changes — V-24 bounds the diff of
      `src/core/dream/ledger.js` and `tests/unit/ledger.test.js` to one removed
      line each.
- [ ] **AC-26 (Table Q row Q1).** The **digest withhold banner** no longer tells
      the user to delete everything in `state/quarantine/` and no longer promises
      that the notice clears when the folder is empty. Its rendered text carries
      `(not the redacted/ folder inside it)` — byte-identical to the ledger
      banner's parenthetical — and `this notice clears when no withheld copies are
      left`, while its head (`dream note(s) were withheld from your vault because
      they appear to contain a secret`) is byte-unchanged. **Pinned in
      `tests/unit/digest.test.js` as a full-string equality on the rendered
      banner**, which nothing in the suite asserts today (verified 2026-07-26:
      `grep -rn 'were withheld from your vault' tests/` returns nothing). **The
      claim is exactly that and no more:** this criterion adds the first
      assertion on the banner's *sentence text*. The banner is not otherwise
      uncovered — `tests/unit/digest.test.js:624-664` already pins its count, its
      sanitized basenames, its placement in the digest prefix and its survival
      through the cap, and none of those four assertions changes. **V-5 bounds
      which lines the `digest.js` diff may remove; the list is V-5's `PERM5`
      heredoc and this criterion restates no count** — it restated one until
      round 5, and it was stale from the moment PERM5 widened.
- [ ] **AC-27 (Table Q rows Q10/Q11/Q14/Q15/Q16 — round 6's surfaces — and Q17,
      round 7's).**
      `docs/THREAT-MODEL.md` no longer says the staged-output gate reverts on
      **any** finding, and no longer says the sanitized text is **never** written
      back (**Q10**); its banner-lifecycle clause speaks about withheld notes
      rather than about the folder holding files (**Q11**); `:132`, `:427` and
      the production/dev **stance clause** are byte-unchanged, the last of these because it belongs to
      another spec. The `src/core/digest.js` comment at `:567-568` no longer
      states the old banner lifecycle (**Q14**) and the `A5_PRIVATE_DIRS` doc
      comment describes `redacted/` in **Q6's** form, not as "a note that was
      committed" (**Q15**). `docs/runbooks/incident.md` is **not** in the changed
      set (**Q16**). **And `src/core/dream/validate.js`'s own Step-3 header
      comment no longer says the gate reverts on ANY finding, nor that the
      sanitized text is never written back (**Q17**)** — the same two claims as
      Q10, in Q10's words, in this WP's primary file, four lines above the code
      they describe. Bounded by **V-27**, which is V-13's shape (a check on which
      lines the `THREAT-MODEL.md` diff may remove), by **V-28** for Q17, and by
      the file-set sweep in **V-26** that proves no member was missed. **V-26's
      pattern is part of what this criterion asserts**: it is the round-7
      pattern, and narrowing it to make that step pass fails this criterion
      rather than satisfying it.
- [ ] **AC-24 (invariants I1 and I2).** Two properties, two mechanisms, and the
      second is new in round 5 because the first **cannot see the window it
      matters in**.
      **I1 — when Step 4 begins, no path the gate touched has this run's raw added
      bytes in the index.** Asserted by the mechanism in **Table T row I1** —
      `fs.appendFileSync` is patched to snapshot `git diff --cached` on its first
      call, which is Step 4's first write, with the test driving
      `validateAndCommit` **directly** so no other caller's append takes the
      snapshot — over **three** cases, one per way the invariant is established: a
      completed redaction (**R8**, staged by B10's index-first stage, and the
      snapshot must additionally match the working tree for that path); an **R7
      fall-through on a tracked file** (cleared by B3's `git checkout HEAD --`);
      and an **R7 fall-through on an untracked file** (cleared by row **B3a**).
      In all three the snapshot must contain none of the fixture's raw bytes.
      Rows **R9, R0 and R0b** are not among the cases: **all three throw before Step 4**,
      so the snapshot is never taken — assert *that* instead, i.e. that
      `fs.appendFileSync` was never called. **R0 joined this exclusion in round 2 of the design gate and R0b in round 5**; round 1 added the row and excluded only R9, which
      would have required a cleared index on the one row whose entire content is
      that the index is deliberately left alone. **On R0 and R0b the assertion is
      stronger than on R9 and the test must make it**: not only was
      `fs.appendFileSync` never called, but the index still holds its staged
      entry and the working-tree file is byte-identical to **whatever was on disk
      when the arm began** — the fixture's bytes on R0, the **post-save** bytes
      on R0b — i.e. the gate touched nothing.
      **I2 — the index reaches the sanitized state before the working tree does.**
      Asserted by **Table T row I2**: `fs.renameSync` is patched to snapshot
      `git diff --cached -- <rel>` immediately before the scrub temp's rename, and
      the snapshot must already hold the sanitized line and none of the fixture's
      raw bytes. **A Step-4 snapshot cannot substitute for this** — by Step 4 both
      orderings have converged on the same state, which is exactly why round 4's
      AC-24 could not see a write-then-stage implementation. One case is enough
      (an ordinary **R8**), and it is the case **M-30** must break.

### Mutation checks (run these; a green suite against unmodified `src/` is not evidence)

Mutation ids are inherited from the parent spec; the gaps (M-1 … M-6, M-13 …
M-15) mutate `src/core/secret-scan.js` and belong to the detector leg.

**Round 1 of the design gate added four rows — M-45 … M-48; rounds 5, 6 and 7 added M-49, M-50 and M-51; round 8 added M-53, M-54 and M-55 — and each allocation
was re-measured at write time rather than continued from the last one.** Round 8's
three were allocated by RUNNING the procedure below with both leg files final and
no agent writing to either, which is the condition the id convention names; they
are the one-mutation-per-field repair of Table Q row **Q18**. The obvious next
number after this leg's M-33 is M-34, and **M-34 … M-44 are the sibling's**;
taking them would have been the fourth cross-leg collision this epic has paid
for, committed by the party that could most easily have checked. The architect
held **both** leg files in one revision pass, with both final and no agent
writing to either — the condition the id convention names — enumerated every
`M-nn` in both, and allocated from the top of the union. **The procedure is now the command, stated in full in the detector leg's id
convention and reproduced here so neither leg has to open the other:**

**Round 7's form had none of the three properties it needed, and round 8 measured
each failure rather than reasoning about it.** (1) It sorted M- and V- ids into
ONE list, so `tail` reported whichever prefix held the larger numbers —
**executed at `a516c77` it returned `M-48 M-49 M-50 M-51 M-52` and not one V
id**, while the sentence beneath it stated a V figure the command had never
produced. (2) It globbed every `\b[MV]-nn\b` **occurrence**, so a sentence saying
an id was free made that id exist for the command; `V-33` occurred exactly once
in each leg, in that sentence. (3) `sort -u` over the concatenation **hides** an
id defined on both sides, which is the failure rounds 4, 5 and 6 each paid for —
and it could not see the collision at its own head: **`M-52` was declared free
here while the sibling's mutation table defined it.**

The procedure below enumerates **definitions** — a mutation TABLE ROW, a
verification STEP HEADER — never mentions, which is what makes it self-excluding
by construction: a sentence quoting a figure is neither, so it cannot read its
own answer.

```bash
# THE NEXT FREE M- AND V- ID ACROSS BOTH LEGS. Per prefix, definition-shaped,
# collision-detecting. Run it; do not quote its output into either document.
DET=docs/specs/WP-secret-fence-two-tier-detector.md
GATE=docs/specs/WP-secret-fence-ep2-redact-arm.md

# A MUTATION is defined by its row in that leg's Mutation-checks table.
mdefs() { grep -ohE '^\|[ *]*M-[0-9]+[a-z]?[ *]*\|' "$1" | grep -ohE 'M-[0-9]+[a-z]?' | sort -u; }
# A VERIFICATION is defined by its step header inside that leg's block.
vdefs() { grep -ohE '^# V-[0-9]+[a-z]? ' "$1" | grep -ohE 'V-[0-9]+[a-z]?' | sort -u; }
maxnum() { sed 's/^[MV]-\([0-9][0-9]*\).*/\1/' | sort -n | tail -1; }

printf 'M defined, detector leg : %s\n' "$(mdefs "$DET"  | tr '\n' ' ')"
printf 'M defined, EP2-gate leg : %s\n' "$(mdefs "$GATE" | tr '\n' ' ')"
printf 'V defined, detector leg : %s\n' "$(vdefs "$DET"  | tr '\n' ' ')"
printf 'V defined, EP2-gate leg : %s\n' "$(vdefs "$GATE" | tr '\n' ' ')"

# COLLISIONS. No M id may be defined in both legs. EXACTLY FOUR V ids may:
# V-1, V-10, V-11 and V-18 are inherited from the parent spec and mean the SAME
# check in both. Any other overlap is a collision, and `sort -u` over a
# concatenation is precisely what hid the last three.
MBOTH="$(comm -12 <(mdefs "$DET") <(mdefs "$GATE") | tr '\n' ' ' | sed 's/ *$//')"
VBOTH="$(comm -12 <(vdefs "$DET") <(vdefs "$GATE") | tr '\n' ' ' | sed 's/ *$//')"
if [ -n "$MBOTH" ]; then
  echo "FAIL allocation: M id(s) defined in BOTH legs: $MBOTH"
  exit 1
fi
if [ "$VBOTH" != "V-1 V-10 V-11 V-18" ]; then
  echo "FAIL allocation: the V ids defined in both legs are '$VBOTH', not the"
  echo "                 inherited shared set 'V-1 V-10 V-11 V-18'."
  exit 1
fi

printf 'next free M: M-%s\n' "$(( $({ mdefs "$DET"; mdefs "$GATE"; } | maxnum) + 1 ))"
printf 'next free V: V-%s\n' "$(( $({ vdefs "$DET"; vdefs "$GATE"; } | maxnum) + 1 ))"
```

**NO SURFACE IN EITHER LEG STATES A NEXT-FREE FIGURE ANY MORE — not even a dated
snapshot, and round 8 dropped that carve-out too.** Round 7 kept one and it was
wrong on the day it was written. Four numbers written down, four collisions. **The
reviewers' disposition is the one applied: drop snapshots entirely.** A reader who
wants the figure runs the procedure; there is nothing left in either leg to go
stale, and nothing for the procedure to read back as its own input.

**The preamble above names the sibling's range, which the id convention inherited
from the parent spec forbids — so round 2 of the design gate AMENDED THE
CONVENTION IN BOTH LEGS rather than deleting the sentence.** The prohibition
exists against *unverifiable* cross-leg claims: an agent inside one leg cannot
open the other, so anything it says about the sibling's ids is a guess. A
statement produced by a party **holding both files final, with no agent writing
to either**, is not a guess — it is the same measurement the convention's own
"re-measure at write time" rule demands. The carve-out, identical in both legs:

> A cross-leg id statement is permitted **iff** it is (i) taken by a party
> holding both files final, (ii) **dated**, and (iii) stated as a
> **measurement, never a reservation**. It is valid at the instant it was taken
> and at no later instant.

Deleting the sentence was rejected as the repair: **the next-free figure was
DERIVED from the sibling's allocation**, so removing the derivation would have
left it unexplained. **Round 7 removed the figure instead of the derivation and
then wrote a dated snapshot four lines below it; round 8 removed that too.** The
procedure above is now the whole derivation — executable, run at write time,
reading both files itself — so nothing in this document needs to assert what the
sibling holds. **The carve-out survives for one narrower job:** it is what
licenses the procedure to read both files and to fail on a cross-leg collision.
What stays forbidden is the undated, unmeasured form — "a range no other leg
uses", "the sibling's ids are unaffected" — which is what the rule was written
against; and as of round 8 the **dated** form is not used either, because round
7's dated snapshot was wrong on the day it was dated.

| # | One-line mutation to `src/` | Must fail |
|---|------------------------------|-----------|
| M-7 | change EP2's condition back to `findings.length === 0` | AC-8 (redact arm never runs) |
| M-8 | swap B4's order to scrub-then-preserve | AC-8 (the preserved copy is post-scrub) |
| M-9 | make the redact arm increment `secretReverts` | AC-8 (deferral semantics) |
| M-10 | drop `withFileTypes` from `listSecretQuarantine` | AC-10 (`redacted` appears in the banner) |
| M-11 | have `scrubAddedLines` rewrite the whole file | AC-8 (a pre-existing secret on an unmodified line is rewritten) |
| M-12 | make the redact arm proceed when preserve returned false | AC-9 |
| M-16 | make B4 ignore `scrubAddedLines`'s return value and increment `secretRedactions` unconditionally | AC-9 (Table R rows R2–R7c) |
| M-17 | drop the re-scan verification from `scrubAddedLines` — write without re-scanning | AC-9 (Table R row **R4**) |
| M-18 | raise B12's cap so the prune never fires | AC-14 |
| M-19 | remove the `state/quarantine/redacted/` element from `A5_PRIVATE_DIRS` | AC-23 |
| M-20 | drop B10's index-first stage entirely and let Step 5's `git add -A` do the staging | AC-24 (**I1**, the **R8** case: with nothing staged before Step 4, the index snapshot taken at the first `fs.appendFileSync` still holds this run's raw added bytes) **and** AC-9 (Table R row **R7** becomes unproducible — there are no staging calls left to fail — so its test has no subject). **Not the R7 fall-through cases**: those clear the index through B3's `git checkout HEAD --` or B3a's `git add -A -- rel`, which run regardless of whether B10 staged anything, and an earlier revision of this cell named them wrongly |
| M-21 | replace the temp+rename in `scrubAddedLines` with a single `fs.writeFileSync` onto the target | AC-9 (Table R row **R5**, injection FI-5b) |
| M-22 | move `reverted.push(…)` back into the shared path so a completed B4 enters it | AC-8 / AC-10 (Table B row **B9a** — the report section and `res.reverted.length`) |
| M-23 | prune by filename sort instead of `(mtimeMs, name)`, and stop excluding the just-created copy | AC-14 |
| M-24 | require `,b` in the hunk-header pattern (`/^@@ -(\d+),(\d+) \+…/`) so `@@ -2 +2 @@` never matches | AC-8 (the **single-line replacement** fixture) |
| M-24b | treat a hunk header with no `,d` as contributing zero added lines | AC-8 (the **single-line insertion** fixture) |
| M-25 | change B3's reason string (drop `; not committed`) | AC-7 (the withhold path's byte-identical reason strings) |
| M-26 | revert the `secret-revert-exhausted` banner sentence to today's text | AC-25 |
| M-27 | delete row B3a's `git add -A -- rel` from the untracked withhold branch | AC-24 (invariant **I1** on the untracked fall-through case) |
| M-28 | delete the `redacted/` copy on **every** fall-through, dropping the "only when B3's own preserve succeeded" guard | AC-9 (Table R consequence 2, the **FI-10** case: the user's only original is destroyed and the report line's Q8 suffix names a file that no longer exists) |
| M-29 | revert the withhold banner's closing sentence to today's text | AC-26 |
| M-30 | swap B10 back to write-then-stage — move the `fs.renameSync` **before** the three staging calls | **two criteria, and that is correct rather than a defect.** AC-24 (invariant **I2**: the snapshot taken at the rename no longer holds the sanitized line) **and** AC-9 (Table R row **R7**'s `byte-unchanged` cell, asserted helper-level by `BU` under FI-7's seam: with the rename moved first, an R7 renames and *then* fails `update-index`, so the target is **scrubbed** when `S` returns). It still must NOT fail AC-24's **I1** cases — I1 converges by Step 4 under either ordering, which is why I1 alone could not see this mutation and why I2 exists |
| M-31 | drop the `Buffer.compare` from the fall-through's delete guard — delete the `redacted/` copy whenever B3's own preserve returned a basename | AC-9 (Table R consequence 2, the **FI-11** case: the note changed between the two preserve reads, so the only copy of its pre-edit bytes is destroyed and Q8's suffix is never appended) |
| M-32 | leave the `src/core/digest.js:567-568` comment at its old text while making the banner edit | AC-27 (**Table Q row Q14**) |
| M-33 | leave the `src/core/dream/validate.js:900-903` Step-3 header comment at its old text while making the gate change — i.e. **ship the code and keep the comment that states its negation** | AC-27 (**Table Q row Q17**), through **V-28**. This is the one mutation that was the *default* until round 7: no Deliverables cell named the comment, so a byte-faithful implementer would have left it |
| **M-51** | **omit the basename from B3b's `WienerdogError`** — raise the abort naming the path and the failed preserves, but not the surviving `redacted/` copy | AC-9 (Table R row **R0b**), via **FI-17**, **FI-18** and **FI-19**, each of which asserts the message names it. **Table Q row Q18** decides the content. **Nothing else can catch this**: Step 4 never appends on an abort, so there is no report line to inspect; `reverted[]` is never rendered; no banner fires. The message is the only surface, which is exactly why it needed a row, an assertion and this mutation rather than a decided sentence. **This row mutates ONE of Q18's four fields**; M-53, M-54 and M-55 mutate the other three, and round 8 added them because until then an implementation could omit three fields and stay green |
| **M-53** | **omit the vault-relative PATH from B3b's `WienerdogError`** — raise the abort naming the failed preserves, the identity disposition and the surviving basename, but not which note it is about | AC-9 on **all three abort arms** — **R0** (via **FI-12/13/14**) and **R0b** (via **FI-17**, **FI-18**, **FI-19**) — each of which asserts the message names the path. **Table Q row Q18** decides the content. **The basename is not a substitute**: `displayName` throws the directories away (Current state), so two notes at different paths produce the same basename and the message would not say which one the gate stopped on. *Added in round 8; the id was allocated by RUNNING the allocation procedure with both leg files final, not by continuing a range* |
| **M-54** | **omit WHICH PRESERVE FAILED** — raise the abort with a single fixed wording (`"preserve failed"`) on every arm, naming neither the redact preserve nor B3's | AC-9 on all three abort arms, and it is the mutation the arms **discriminate**: on **R0** (FI-12/13/14) the message must name **both** preserves as failed; on **R0b** (FI-17/FI-18/FI-19) it must name **B3's** and must **not** name the redact preserve, which succeeded and whose copy is the thing the next field points at. A single wording contradicts one arm or the other whichever it picks. **Table Q row Q18** decides the content. *Added in round 8* |
| **M-55** | **collapse the IDENTITY-CHECK DISPOSITION into one value** — record "identity check failed" on every abort, instead of distinguishing *not performed* (R0, no copy existed), *performed and mismatched* (R0b via FI-17/FI-18) and *attempted and not possible* (R0b via FI-19, the read threw) | AC-9 on all three abort arms, each of which asserts a **different** value. **This is the field with the most user-visible consequence and the least obvious loss:** *mismatched* tells the user their own save is the thing on disk and the copy is the older version; *not possible* tells them the gate could not read the file at all, which is an entirely different thing to go and look at; *not performed* tells them nothing was preserved anywhere. **Table Q row Q18** decides the content, and **FI-19 exists precisely because round 6 shipped the throw path with no arm at all** — a single wording here is that hole re-opened one level down. *Added in round 8* |
| **M-50** | **convert K4's catch path into an ordinary revert** — abort on a byte mismatch, but when the identity read THROWS, fall through and revert as if identity had been established | AC-9 (Table R row **R0b**, injection **FI-19**, tracked and untracked): the gate reverts a file it could not read, so it destroys bytes no artifact holds. **Every other mandated arm stays green under this mutation** — FI-17 and FI-18 change the target at K2, so K4 reads differing bytes and the mismatch branch aborts correctly. That is why FI-19 exists and why round 5's arm set was insufficient |
| **M-49** | **weaken B3b's condition back to a copy-EXISTENCE test** — abort only when no durable copy exists at all, instead of when no durable copy of the target's **current bytes** can be shown to exist (i.e. drop the **K4** identity read) | AC-9 (Table R row **R0b**, injections **FI-17** and **FI-18**): with a `redacted/` copy present the weakened condition does not fire, B3 reverts, and the user's mid-dream save is destroyed while the surviving copy holds the pre-save bytes. **The untracked arm (FI-18) is where the loss is irreversible.** *This mutation is the shipped design of every revision before round 5 — like M-45, it is a default rather than a slip, which is why the row exists* |
| **M-45** | **delete row B3b** — let B3 revert or remove the file after its own preserve failed, exactly as it did before round 1 of the design gate | AC-9 (Table R row **R0**, injections **FI-12/13/14**, and specifically their **untracked** arms: with B3b gone the note is `fs.rmSync`ed while neither `redacted/` nor `quarantine/` holds a copy, so the assertion that the file is still on disk fails). **This mutation IS the shipped behaviour of every revision before this one**, which is why it is in the table: the loss path was the default, not a slip |
| **M-46** | **restore the second content read** — have `scrubAddedLines` call `fs.readFileSync` on the target for its scrub input instead of using the `captured` buffer | **AC-9 via FI-15, RE-KEYED IN ROUND 2 to the read COUNT rather than to a perturbation.** FI-15's harness records every read of the target and asserts there are **exactly two** (the capture and the rule-2 comparison); a module that re-reads for content makes a **third** and fails that assertion. It also fails FI-15's fourth assertion, that the scrubbed target equals the per-line scrub of the captured bytes. **The previous keying was to an impossible injection** — FI-15 used to poison every post-capture read, which a conforming implementation must observe at the comparison, so the row it named could never be reached and this mutation had nothing that could redden. **No structural check can substitute** — a grep for the read count is satisfied by any other spelling |
| **M-47** | **drop the pre-rename compare** — rename the temp over the target without re-reading and comparing against `captured` | **AC-9 (Table R row R7c, injection FI-16), RE-KEYED IN ROUND 2 to a modification made BEFORE the comparison read.** FI-16 now writes different bytes over the target immediately before delegating the comparison read, so a conforming arm detects the change and never renames; with the compare dropped, the recorded `fs.renameSync` **IS** invoked, the user's mid-run save is overwritten by the gate's rewrite, and the only copy of that save is destroyed while `redacted/` holds the pre-save bytes. **Asserted as *rename was called*, which is the observation that distinguishes the two designs.** The previous keying was self-contradictory: FI-16 modified the target *inside* the patched rename — after the comparison had already passed — and then asserted the rename was never invoked, which the patch's own execution disproves |
| **M-48** | **prune per call instead of per run**, excluding only the current B4's basename — i.e. violate **Table N** rows **N2** and **N3** | AC-14, the full-directory multi-redaction case with tied and skewed `mtime`s: a copy this run created is evicted before the run ends and the report line names a file that no longer exists. **The previous design's defence against this was an arithmetic claim ("decades of runs below the cap") that Table N's extraction record shows was false by three orders of magnitude — so nothing but this mutation stands between the two designs** |

M-16 and M-17 cover the transitions Table B had no row for until B5a; M-20 … M-24
cover the four defects round 3 found in this same contract family, which is why
Table R now decides all of it in one place. M-18 exists because a cap that never
fires is indistinguishable from a correct cap on a small fixture unless the test
drives the prune past it. **M-24 and M-24b are the two mutations that fail
*closed*** — the note is withheld rather than leaked — and they are separate rows
because they are separate defects with separate fixtures: git omits `,b` and `,d`
independently (see "Exact contracts"), and a parser that gets one right can still
get the other wrong. They are in the table precisely because a fail-closed
regression that silently disables the WP's headline feature would otherwise ship
green. **M-25 … M-27 close round 4's coverage gaps**: the withhold path's frozen
reason strings had no mutation, the ledger banner is new to this WP, and B3a's
one statement is invisible to every other criterion. **M-28 … M-30 close round
5's**, and M-30 is the important one, because write-then-stage and
index-first converge by Step 4 and differ only in a window no assertion looked
at until invariant **I2** existed. This row's design was the shipped design a
round ago, and a mutation that nothing catches is the definition of an untested
contract. **Round 6 corrected M-30's note rather than its mutation.** It used to
claim M-30 was the only row leaving every other criterion green — a uniqueness
claim, and false: an R7 under write-then-stage renames before it fails, so the
target is scrubbed when `S` returns and Table R row R7's `byte-unchanged` cell
goes red too. **A mutation may redden several criteria; that was never the
defect.** The defect was a row asserting otherwise, and — the second horn — a
Table T row for FI-7 that named only a gate-level seam, so the cell M-30 reddens
had no test to redden. Both are fixed: M-30 names both criteria and FI-7 is
`helper and gate`. **M-31 and M-32 are round 6's own**: M-31 covers the
byte-identity guard, the one condition standing between a mid-run editor save and
the permanent loss of the user's only pre-edit copy; M-32 covers the code comment
that would otherwise keep stating the banner lifecycle this WP replaced.

**Declined, 2026-07-26, architect-authored — the isolating M-30 variant.**
Codex's review proposed replacing M-30 with a variant engineered to redden
**only I2**, so each mutation maps one-to-one onto a criterion. Declined on three
grounds, recorded because this document records every other decline in full:
**(a)** the table mutates toward implementations somebody would plausibly write,
and write-then-stage is this WP's own round-4 design, while an I2-only variant
corresponds to no implementation at all; **(b)** one-to-one mapping is the
assumption round 6 *deleted* — the defect was a row claiming uniqueness, never a
mutation having breadth; **(c)** it costs coverage, since Table R row R7's
`byte-unchanged` cell would lose the only mutation that reddens it. The
finding's accepted half is the corrected note above.

**Fault injections are decided in Table T.** They used to be listed here as
"how to produce it"; that list is gone, because four of its eight rows named a
mechanism that does not exist — three stubs of bindings `validate.js`
destructures at module load, and one filesystem fault that cannot isolate the
failure it claims to. Table T carries the mechanism, the assertion level and the
reachability argument for every `FI-*` id, plus the two rows (`BU`, `I1`) that
have no `FI` id but the same problem.

## Verification steps (run these; paste output in the PR)

**Run this block as a script, not by pasting lines.** The first line is
`set -euo pipefail` and it is load-bearing: without it a failing `test` or `grep`
prints nothing and the block continues, so "exit status carries the verdict"
would be false. Round 2 found three steps in this block that exited 0 on
violation, 1 on success, or both.

**Every negative check is written as `must_not "<message>" cmd …` or as an
explicit `if … then exit 1; fi`. Never `cmd && exit 1`, and — the round-3
correction — never `! cmd` either.** `! cmd` reads like a negative assertion and
is not one:
POSIX and bash both **suppress errexit for a pipeline whose status is inverted
with `!`**, so under `set -euo pipefail` a violated `! grep` prints nothing,
returns 0, and the block runs on. Demonstrated:

```text
set -euo pipefail; echo before; ! grep -q root /etc/passwd; echo after
  -> prints BOTH lines, exits 0, with the negative check violated
```

shellcheck reports this as **SC2251**, and the extracted block must pass
`shellcheck` clean. The two `! grep` lines this
document carried until round 3 were **V-16's Table P rows P1 and P3** — the
ordering-prohibition gate whose entire job is to stop this leg's implementation
until leg 1 is on `main`. As written they were unenforced: if the old alphabet
literal or `severityForKey` were still present, the block would have sailed past
the violated precondition.

**The helper is MESSAGE-FIRST, and round 4 found that this document's previous
form was not.** The detector leg's `must_not` takes the failure message as `$1`
and `shift`s it off before running the command; this document's took the command
directly and claimed to be byte-identical to it. It was not, and the divergence
was the dangerous direction: a leg-2-shaped call
(`must_not grep -qF 'pattern' file`) evaluated under a message-first helper
consumes `grep` as the message and runs `-qF 'pattern' file` as the command —
which is not an executable, fails, and **the negative check passes vacuously with
the forbidden pattern present**. That is the same SC2251 failure class the helper
exists to close, reintroduced by the helper. This block now uses the message-first
shape at every call site, so the two legs cannot diverge on how a negative check
is written. **The claim made here is exactly this and no more**: the shape is the
same, the argument order is the same, and every call site in this block passes a
message first. This file does not assert byte-identity with a document its
implementer is forbidden to open (the One-Document Rule, ADR-0005) — an
unverifiable claim is what produced the defect.

**Two further rules this block enforces on itself, both from round-3 findings:**

1. **A check must not be satisfiable by its own text.** V-20 grepped two needles
   out of the whole spec file — and both needles occurred inside V-20's own
   commands, so deleting the entire section it guarded left it green (executed
   and confirmed). Every needle-based check below therefore **extracts the region
   it is checking first**, with an `awk` range that excludes this verification
   block, and greps inside the extraction. V-17 and V-11 had the same latent
   shape and are fixed the same way.
2. **Diff-based checks must see the working tree.** `git diff … origin/main...`
   compares the merge base to **committed HEAD** and ignores staged, unstaged and
   untracked changes. Measured in this repository: `git diff --name-only
   origin/main...` returned **0 paths while 22 files were dirty**, so V-4 and V-5
   exited 0 on a tree that violated them. Every diff check below goes through
   `$BASE` and `changed_paths`, defined once at the top, which compare the merge
   base to the **current working tree including untracked files**.

Verification ids are inherited from the parent spec; the gaps (V-2, V-2b, V-2c,
V-3, V-6, V-7, V-8, V-12, V-14, V-15, V-19) belong to the detector leg. **V-21 is
unused in this leg**, and this document deliberately makes no claim about whether
the detector leg uses it — the One-Document Rule (ADR-0005) means neither
implementer opens the other's file, so an id this leg does not use is simply not
this leg's to account for. **V-24 and V-25 are new ids** created in round 4, and
**V-26 and V-27 in round 6**, **V-28 in round 7** — all five continue past the
parent's range rather than reusing a detector-leg gap, so a cross-leg reader
never finds two different checks under one id.

**V-16 runs first and is a stop, not a report.**

```bash
set -euo pipefail

SPEC=docs/specs/WP-secret-fence-ep2-redact-arm.md
ADR=docs/adr/0034-accidental-persistence-threat-model.md

# The merge base, computed ONCE. `origin/main...` is NOT used anywhere below:
# it ignores the working tree, so a compliant commit followed by an edit to
# dream.js / secret-scan.js / the banner reruns green. `git diff $BASE` compares
# $BASE to the CURRENT WORKING TREE (staged + unstaged); untracked files are
# added separately, since a diff never lists them.
git fetch -q origin main 2>/dev/null || true
BASE="$(git merge-base origin/main HEAD)"
changed_paths() {
  { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u
}

# EVERY negative assertion goes through this helper. `! cmd` DOES NOT WORK under
# `set -e`: POSIX and bash both suppress errexit for a pipeline whose status is
# inverted with `!`, so when the forbidden pattern IS present the grep succeeds,
# `!` flips the status to 0, errexit stays quiet, and the block runs on past the
# violated check. Demonstrated:
#     set -euo pipefail; echo before; ! grep -q root /etc/passwd; echo after
#   -> prints BOTH lines and exits 0, with the negative check violated.
# The form is reported as SC2251. (Do not start a comment line with the word
# "shellcheck" — it is parsed as a directive and errors out with SC1072/SC1073;
# found by running the linter on this very block.) `must_not` makes the failure
# explicit and NAMES the check, so a red line says which precondition is unmet.
# MESSAGE-FIRST: $1 is the failure message and is shifted off; everything after
# it is the command. The detector leg's helper of the same name has the same
# shape, deliberately — the two blocks must not diverge on how a negative check
# is written. Passing the command FIRST (the shape this document carried until
# round 4) is silently catastrophic under a message-first helper: `grep` is eaten
# as the message, the remaining words are run as a non-existent command, that
# fails, and the check PASSES with the forbidden pattern present.
must_not() { local msg="$1"; shift; if "$@" >/dev/null 2>&1; then echo "FAIL: $msg"; exit 1; fi; }
# Positive counterpart. The `!` here is INSIDE an `if` condition, where errexit
# suppression is irrelevant because both branches are handled explicitly — that
# is the difference between this and a bare `! cmd` statement.
must() { if ! "$@"; then echo "FAIL: required check did not hold: $*"; exit 1; fi; }
# Count assertion that SAYS WHICH ROW FAILED. A bare `test "$(...)" = "1"` under
# `set -e` aborts correctly but prints NOTHING, so V-16 — the ordering-prohibition
# stop — would exit 1 with no indication of which Table P row is unmet, and the
# most likely reader of that silence is someone about to implement anyway.
# `must` / `must_eq` are local to this leg; `must_not` is the shared one.
must_eq() { # must_eq <label> <expected> <actual>
  if [ "$3" != "$2" ]; then echo "FAIL $1: expected $2, got $3"; exit 1; fi
}
# V-0  NEGATIVE PROBE for the guard itself, run and pasted with the rest: an
#      UNSTAGED edit to a forbidden file must make `changed_paths` fire. Without
#      this, a guard that silently ignores the working tree reports success and
#      every V-4/V-5/V-13 result below is worthless — which is exactly what the
#      `origin/main...` form did.
#      THE PROBE MUST NOT DESTROY WORK. The round-3 form appended a marker and
#      then ran `git checkout -- <path>`, which discards EVERY unstaged edit on
#      that path — so a verification step prescribed by this spec could silently
#      throw away an unrelated in-progress change. Two corrections, both required:
#      (a) REFUSE to run unless the path is clean in both the index and the
#          working tree, and
#      (b) restore the EXACT prior bytes and mode from a copy, under a trap, so an
#          abort mid-probe still restores. `cp -p` carries the mode both ways.
PROBE=src/cli/dream.js
if ! git diff --quiet -- "$PROBE" || ! git diff --cached --quiet -- "$PROBE"; then
  echo "FAIL V-0: $PROBE has uncommitted changes. This probe appends a marker and"
  echo "          then restores the file; it refuses to run against a dirty path,"
  echo "          because restoring would discard your edit. Commit or stash first."
  exit 1
fi
PROBE_BAK="$(mktemp)"
cp -p "$PROBE" "$PROBE_BAK"
restore_probe() { cp -p "$PROBE_BAK" "$PROBE"; rm -f "$PROBE_BAK"; }
trap restore_probe EXIT
printf '\n// v-0 probe\n' >>"$PROBE"
if changed_paths | grep -qx "$PROBE"; then
  restore_probe; trap - EXIT
  echo "V-0 ok: an unstaged edit to a forbidden file IS visible to changed_paths"
else
  restore_probe; trap - EXIT
  echo "FAIL V-0: changed_paths cannot see the working tree; do not proceed"
  exit 1
fi

# V-16 TABLE P — the preconditions. Leg 1 (WP-secret-fence-two-tier-detector)
#      must already be on main. If any line here fails, STOP: do not implement
#      this WP, do not "fix" src/core/secret-scan.js, and do not proceed on the
#      assumption that the gate is harmless without the detector. It is not —
#      see "Why this leg cannot go first".
must_eq "V-16 P1 ENTROPY_CORE_CLASS declared once" 1 \
  "$(grep -c "^const ENTROPY_CORE_CLASS = 'A-Za-z0-9+=';$" src/core/secret-scan.js)"
must_eq "V-16 P1 ENTROPY_WIDE_EXTRA declared once" 1 \
  "$(grep -c "^const ENTROPY_WIDE_EXTRA = '/';$" src/core/secret-scan.js)"
must_not "V-16 P1 the old wide alphabet literal is still present" \
  grep -qF '[A-Za-z0-9+/=]' src/core/secret-scan.js
must_eq "V-16 P2 redact has exactly one producer" 1 \
  "$(grep -o 'SEVERITY\.REDACT' src/core/secret-scan.js | wc -l | tr -d ' ')"
must_not "V-16 P3 the per-key severity helpers are still present" \
  grep -q "severityForKey\|QUARANTINE_KEYS" src/core/secret-scan.js
must grep -q 'existing.severity = SEVERITY.QUARANTINE' src/core/secret-scan.js                  # P4
#      P5 (a) — the alphabet is CLOSED. P1 pins the two ENTROPY_* class constants
#      byte-exactly; this line pins that there are exactly two of them, so no
#      third alphabet was added that admits a whitespace character. Together they
#      prove the only redact-severity producer cannot match across a newline,
#      which is what makes this WP's PER-LINE scrub equivalent to the blob scan
#      the gate ran.
must_eq "V-16 P5 exactly two ENTROPY_* alphabet constants" 2 \
  "$(grep -c "^const ENTROPY_[A-Z_]* = '" src/core/secret-scan.js)"
#      P5 (b) — the CROSS-LINE NEGATIVE, run against the shipped detector. It uses
#      only a fact this spec already states in Current state (the reference
#      fixture is a redact finding after leg 1), so it encodes no threshold,
#      length or alphabet number of leg 1's. If this fires, every per-line scrub
#      of a redact finding is a no-op, scrubAddedLines returns false, and the note
#      is PERMANENTLY WITHHELD with a green suite — Table R row R6, fail-closed
#      and invisible.
node -e '
const {scanAndRedact}=require("./src/core/secret-scan.js");
const red=(t)=>scanAndRedact(t).findings.filter((f)=>f.severity==="redact").length;
const t="q7PmXz4KvR9tWc2LbN8dYfGh";
if(red("ref "+t+" in prose\n")===0){
  console.error("FAIL V-16 P5: the reference fixture is not a redact finding.");
  console.error("             Leg 1 is not on main in the shape Table P describes. STOP.");
  process.exit(1);
}
if(red("ref "+t.slice(0,12)+"\n"+t.slice(12)+" in prose\n")>0){
  console.error("FAIL V-16 P5: a redact-severity producer matched ACROSS a newline.");
  console.error("             The per-line scrub is then NOT equivalent to the blob");
  console.error("             scan: every scrub becomes a no-op (Table R row R6) and");
  console.error("             this WP is silently off. STOP; do not implement.");
  process.exit(1);
}
console.log("V-16 P5 ok: the redact producer cannot span a newline");
'
#      P6 — Authorization: Basic is still caught, at quarantine, with the body
#      gone. BEHAVIOURAL, not a grep, and that is the point: a grep for the rule's
#      name passes on a rule that is present and wrong, and it would also pin a
#      leg-1 label this table has no business owning. This row is the one
#      precondition that is NOT about a property this WP consumes — it is about a
#      published credential format leg 1's tiering would otherwise stop catching,
#      and P1-P5 all pass on a leg 1 that shipped the tiering WITHOUT the rule
#      that closes it. Dispatching this gate against that detector commits a
#      published credential format unsanitized. Round 1 of the design gate.
#      ROUND 2 STRENGTHENED BOTH THE BODY AND THE ASSERTION, and measurement
#      shows EITHER ALONE IS VACUOUS against the case this row exists to catch —
#      a basic-auth rule that is PRESENT but whose character class omits `/`.
#      (a) THE BODY IS FULL STANDARD BASE64 (>=1 `/`, >=1 `+`, padding). The
#      round-1 body was pure alphanumeric while P6's own justification is that a
#      standard-base64 credential FRAGMENTS ON ITS SLASHES — it tested a shape
#      the row is not about. Against a slash-omitting rule the alnum body leaves
#      ZERO residue and is indistinguishable from a correct rule.
#      (b) THE ASSERTION IS "NO 8-CHARACTER WINDOW OF THE BODY SURVIVES", not
#      "the whole body is absent". Executed 2026-07-27: against the slash-
#      omitting rule the slash-bearing body leaves the 27-character residue
#      "/K7MDENG/bPxRfiCYEXA+MPLEK=" — and `text.includes(body)` is STILL false,
#      because the whole body is not there. The window form reports the surviving
#      window "/K7MDENG" and fires. A correct rule leaves no window under either
#      body, so the check is not merely stricter, it is the only form that
#      discriminates.
node -e '
const {scanAndRedact}=require("./src/core/secret-scan.js");
const body="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXA+MPLEK=";
if(!(body.includes("/")&&body.includes("+")&&body.length===40)){
  console.error("FAIL V-16 P6: the probe body is not full standard base64. It must carry");
  console.error("             at least one / and one + — see the comment above.");
  process.exit(1);
}
const {text,findings}=scanAndRedact("Authorization: Basic "+body);
const hard=findings.filter((f)=>f.severity==="quarantine").length;
if(hard===0){
  console.error("FAIL V-16 P6: Authorization: Basic produced no quarantine-severity");
  console.error("             finding. Leg 1 shipped the tiering without the labelled");
  console.error("             rule that closes it, so a published credential format is");
  console.error("             no longer caught. STOP; do not implement this WP against");
  console.error("             that detector.");
  process.exit(1);
}
let win=null;
for(let i=0;i+8<=body.length;i++){ const w=body.slice(i,i+8); if(text.includes(w)){win=w;break;} }
if(win!==null){
  console.error("FAIL V-16 P6: an 8-character window of the credential body survives in");
  console.error("             the sanitized text: "+JSON.stringify(win));
  console.error("             A finding fired but the body was only PARTIALLY redacted —");
  console.error("             the classic shape is a basic-auth rule whose character class");
  console.error("             omits / , which stops at the first slash. STOP.");
  process.exit(1);
}
if(!text.includes("Authorization: Basic")){
  console.error("FAIL V-16 P6: the Authorization: Basic header itself was consumed. The");
  console.error("             rule must replace the BODY and leave the header readable.");
  process.exit(1);
}
console.log("V-16 P6 ok: Authorization: Basic is quarantine and its body is fully redacted");
'

# V-1  full suite, through the ONE wrapper that sets the scheduler guard
node tests/run.js

# V-4  B8/B9: dream.js was not touched and still defers on withholds only.
#      `... | grep -qx ... && exit 1` was WRONG in both directions: when grep
#      correctly finds nothing it exits 1, the && short-circuits, and the line's
#      own status is 1. Under `set -e` an `&&` list whose left side fails does
#      not trip errexit either, so the check simply never fired. It now goes
#      through `changed_paths`, which V-0 proved can see the working tree.
if changed_paths | grep -qx "src/cli/dream.js"; then
  echo "FAIL V-4: src/cli/dream.js was changed (Table B rows B8/B9)"; exit 1
fi
grep -q "res.secretReverts" src/cli/dream.js
#      and the detector is leg 1's — it must not have been changed either
if changed_paths | grep -qx "src/core/secret-scan.js"; then
  echo "FAIL V-4: src/core/secret-scan.js was changed. That file is"
  echo "          WP-secret-fence-two-tier-detector's. If a gate test needs a"
  echo "          detector change, the gate is wrong."
  exit 1
fi

# V-5  AC-26 / Table Q row Q1: the withhold banner's CLOSING SENTENCE is replaced
#      and its HEAD is byte-unchanged, and nothing else in digest.js moves.
#      ROUND 5 REPLACED THIS STEP OUTRIGHT. Its previous form greped the whole
#      digest.js diff for `withheld from your vault` and failed if it appeared.
#      Two things were wrong with it. (1) It froze a string this WP falsifies —
#      the banner tells the user to delete the rest of state/quarantine/, which
#      after this WP destroys the pre-scrub originals. That is the finding this
#      step existed to prevent and it was the step enforcing it. (2) Even as
#      written it was stricter than the sentence it printed: `git diff` emits
#      CONTEXT lines, and line 574 (which carries that phrase) is context for the
#      hunk that changes line 576 — so it fired on an edit that left the banner
#      alone. Fail-closed, but "the withhold banner text was edited" was not what
#      it measured. It is now V-13's bounded-removed-lines shape.
must grep -qF 'dream note(s) were withheld from your vault because they ' src/core/digest.js
# The trailing backtick-free fragment below is the rest of the unchanged head; it
# lives on source line 575, which Q1 does not touch.
must grep -qF 'Review the copies in state/quarantine/: restore ' src/core/digest.js
must grep -qF '(not the redacted/ folder inside it)' src/core/digest.js
must grep -qF 'this notice clears when no withheld copies are left.' src/core/digest.js
if grep -qF 'delete the rest; this notice clears when the folder is empty.' src/core/digest.js; then
  echo "FAIL V-5: the withhold banner still tells the user to delete the rest of"
  echo "          state/quarantine/ and promises the notice clears when the folder"
  echo "          is empty. After this WP the first destroys redacted/ and the"
  echo "          second is a state the user cannot reach (Table Q row Q1)."
  exit 1
fi
#      Q14: the comment four lines above the banner stated the SAME lifecycle and
#      is corrected in the same pass. Both halves are false after the edits above,
#      and a stale comment beside a corrected string is how the next change
#      re-derives the old contract.
must_not "V-5 Q14 the digest.js comment still states the old banner lifecycle" \
  grep -qF 'renders while state/quarantine/ is non-empty and clears itself once the' src/core/digest.js
#      Q14's two false lines are lines 3 and 4 of a SIX-LINE wrapped comment
#      block, so correcting them reflows the block — exactly the shared-line trap
#      V-22 hit in round 4, where a line-exact list rejected a correct
#      implementation. The permitted-removals list below therefore holds the
#      WHOLE block (lines 565-570) plus Q1's line and listSecretQuarantine's
#      three, and the parts of the comment that must SURVIVE are held positively
#      instead, immediately below.
must grep -qF 'WP-124 walkthrough' src/core/digest.js
must grep -qF 're-whitelisted here as defense in depth' src/core/digest.js
must grep -qF 'CONTENT is never read or rendered' src/core/digest.js
#      The bound: only these ten source lines may be removed from digest.js —
#      the banner's closing line (Q1), the six-line comment block (Q14) and the
#      three lines listSecretQuarantine rewrites. Anything else removed is out of
#      scope for this WP.
PERM5="$(mktemp)"
cat >"$PERM5" <<'EOF'
      'what you meant to keep, delete the rest; this notice clears when the folder is empty.'
  // Staged-output quarantine pending-review banner (EP4 companion, WP-125
  // contract 5, OWNER-APPROVED in the WP-124 walkthrough): STATE-DRIVEN — it
  // renders while state/quarantine/ is non-empty and clears itself once the
  // owner empties the directory. Sanitized basenames only (the caller applies
  // displayName; re-whitelisted here as defense in depth) — the quarantined
  // files hold raw secrets and their CONTENT is never read or rendered.
      .readdirSync(path.join(stateDir, 'quarantine'))
      .filter((n) => !n.startsWith('.'))
      .map((n) => n.replace(/[^A-Za-z0-9._-]/g, '_'))
EOF
if git diff "$BASE" -- src/core/digest.js | grep '^-' | grep -v '^---' \
     | grep -vFf "$PERM5" | grep -q .; then
  echo "FAIL V-5: the digest.js diff removes a line outside the banner's closing"
  echo "          sentence, the two comment lines above it, and"
  echo "          listSecretQuarantine. Those are the only three edits this WP"
  echo "          makes to that file (Deliverables, Table Q rows Q1 and Q14)."
  rm -f "$PERM5"; exit 1
fi
rm -f "$PERM5"

# V-9  targeted suites
node tests/run.js tests/unit/dream-validate.test.js tests/unit/digest.test.js \
  tests/unit/private-fs.test.js

# V-10 lint
npm run lint

# V-13 AC-19: the runbook carries all THREE Table Q edits — step 3's existing
#      quarantine bullet no longer claims the banner tracks the folder's emptiness
#      (Q3), step 3 gained the redacted-copy recovery path (Q4), and step 5's
#      "confirm it's empty" bullet was corrected (Q5) — and NOTHING else moved.
#      The bound is on WHICH lines may be removed. ROUND 5 WIDENED IT, because
#      round 4's list held only the step-5 bullet, which FROZE the two false
#      lifecycle claims in step 3 that this WP creates. The permitted set is now
#      the whole step-3 quarantine bullet plus the step-5 bullet: a wording change
#      to two lines of a wrapped markdown bullet reflows the rest of it, so a
#      line-exact list of just those two would reject a correct implementation.
#      Everything outside those two bullets — steps 1, 2, 4, the intro, the rest
#      of step 3 and the rest of step 5 — still may not lose a line.
RB=docs/runbooks/secret-incident.md
grep -q "quarantine/redacted" "$RB"                       # Q4: step 3 gained the path
grep -q "no withheld notes" "$RB"                         # Q5: step 5 was corrected
must_not "V-13 Q3 step 3 still ties the banner to the folder being non-empty" \
  grep -qF 'the digest shows a banner while this folder' "$RB"
must_not "V-13 Q3 step 3 still says the banner clears when the folder is empty" \
  grep -qF 'the banner clears once the folder is empty' "$RB"
# The backticks below are literal markdown in the runbook's own text and the
# pattern is a FIXED string (-F), so single quotes are correct and the linter's
# SC2016 "expressions don't expand" note is a false positive here.
# shellcheck disable=SC2016
if grep -qF 'Confirm `state/quarantine/` is empty' "$RB"; then
  echo "FAIL V-13: the runbook still tells the user to confirm state/quarantine/"
  echo "           is empty. After this WP it always contains redacted/ and is"
  echo "           never observably empty (Table B row B13)."
  exit 1
fi
PERM13="$(mktemp)"
cat >"$PERM13" <<'EOF'
- **Also check `state/quarantine/`.** This is where Wienerdog set aside a
dream note it wouldn't commit because it looked like it contained a
secret (see T4, gate ii) — the digest shows a banner while this folder
is non-empty. Open each file: if it's a **true positive** (it really does
hold the secret), delete it once you've finished rotating in step 2 — it
holds the raw bytes, not a redacted copy. If it's a **false positive**
(the scanner was wrong), you can copy its content back into the vault by
hand; the banner clears once the folder is empty.
Confirm `state/quarantine/` is empty — while anything is in it, the
digest keeps showing a "held for review" notice.
EOF
if git diff "$BASE" -- "$RB" | grep '^-' | grep -v '^---' \
     | grep -vFf "$PERM13" | grep -q .; then
  echo "FAIL V-13: the runbook diff removes a line outside the step-3 quarantine"
  echo "           bullet and the step-5 bullet. Only those two bullets may lose"
  echo "           lines; step 3's new redacted/ bullet is an insertion and every"
  echo "           other line in the file must be byte-unchanged."
  rm -f "$PERM13"; exit 1
fi
rm -f "$PERM13"

# V-17 D1/D2: the derived figures still match ADR-0034's evidence E1 and E3 —
#      asserted on BOTH SIDES. The previous form greped only the ADR, so editing
#      the D-table in this spec left it green, defeating the whole point of a
#      derived row. If one fails, do NOT edit the ADR and do NOT edit the D-table:
#      a measured figure is repaired by a dated errata amendment inside ADR-0034,
#      by the architect, never by an implementer.
#      The literals below track ADR-0034's evidence AS AMENDED by its errata
#      ER-4/ER-5 of 2026-07-26 (the corpus is live and grew by one note). This
#      step going red is the SUCCESS case of that mechanism: it is what caught
#      the D-table being stale hours after it was written. Repair by re-deriving
#      this spec's D rows FROM the ADR — never by editing the ADR to match.
must grep -qE '^notes scanned +182$' "$ADR"
must grep -qE '^notes with ANY finding \(EP2 reverts today\) +102 +\(56\.0%\)$' "$ADR"
must grep -qF 'notes withheld **102 → 1**' "$ADR"
must grep -qF 'notes scrubbed in place **0 → 9**' "$ADR"
must grep -qF 'notes untouched **80 → 172**' "$ADR"
#      The spec side. EXTRACTED FIRST: greping the whole file for these literals
#      would be satisfied by the three lines above, which live in this same file.
#      The awk range covers only "## Derived measurements" … "## Deliverables".
#      COUNTED, NOT MERELY PRESENT (round-4 correction): `grep -qF` is existence
#      only, so a stale D1 row left beside a corrected one passed — exit 0 with
#      the document stating two different figures for the same derived fact.
#      ANCHORED WHOLE-LINE (round-5 correction): the round-4 form still fell to a
#      ONE-LINE-TWO-CLAIMS attack. `grep -c '^| D1 | '` counts LINES and
#      `grep -cF <row>` counts lines CONTAINING the row, so a single line carrying
#      the complete canonical row followed by a second, contradictory claim scored
#      1 on both and passed. Executed and confirmed on a fixture. Two checks per
#      row close it: the claim prefix must OCCUR exactly once in the extracted
#      region (`grep -o`, occurrences not lines), and the COMPLETE canonical row
#      must match a WHOLE LINE exactly once (`grep -cxF`), so nothing may be
#      appended to it.
DT="$(mktemp)"
awk '/^## Derived measurements/{f=1} /^## Deliverables/{f=0} f' "$SPEC" >"$DT"
must_eq "V-17 exactly one D1 claim (occurrences, not lines)" 1 \
  "$(grep -o '^| D1 | ' "$DT" | wc -l | tr -d ' ')"
must_eq "V-17 exactly one D2 claim (occurrences, not lines)" 1 \
  "$(grep -o '^| D2 | ' "$DT" | wc -l | tr -d ' ')"
must_eq "V-17 no second D1 claim anywhere on any line" 1 \
  "$(grep -o '| D1 |' "$DT" | wc -l | tr -d ' ')"
must_eq "V-17 no second D2 claim anywhere on any line" 1 \
  "$(grep -o '| D2 |' "$DT" | wc -l | tr -d ' ')"
must_eq "V-17 D1 canonical row, WHOLE LINE" 1 "$(grep -cxF \
  '| D1 | 182 notes scanned; **102** of them (56.0%) contain at least one finding and are reverted by EP2 today | ADR-0034 **E1**, as amended by errata **ER-4** | the size of the problem this gate closes; quoted in the Context of both legs |' "$DT")"
must_eq "V-17 D2 canonical row, WHOLE LINE" 1 "$(grep -cxF \
  '| D2 | end state after **both** legs: **1** note withheld, **9** scrubbed in place, **172** untouched — per full-vault pass | ADR-0034 **E3**, as amended by errata **ER-5** | the rate that sets the retention cap (Table B rows B12/B13) and the reason a redaction gets no digest banner |' "$DT")"
rm -f "$DT"

# V-18 the ratified threat model is byte-identical to the detector leg's copy.
#      Both specs carry this same expected digest over the section between
#      "## The threat model" and "## Current state". If this fails you edited a
#      ratified review criterion (ADR-0034) — revert the edit. Do NOT recompute
#      the digest to make it pass.
#      WRITTEN AS A PRINTING `if`, NOT A BARE `test` (round 1 of the design gate).
#      Under `set -e` a bare `test` exits 1 in SILENCE, so the loudest instruction
#      in this step — "do NOT recompute the digest" — is the one an implementer
#      never sees; they see a script that died with no message and reach for the
#      nearest literal. The sibling leg rewrote its own V-18 for exactly this
#      reason and this copy had not followed. THE ASSERTION AND THE LITERAL ARE
#      UNCHANGED, so both legs still carry the same digest; only the diagnostic
#      is new.
TM_DIGEST="$(awk '/^## The threat model /{f=1} /^## Current state$/{f=0} f' \
  "$SPEC" | shasum -a 256 | cut -d' ' -f1)"
if [ "$TM_DIGEST" != "77a67f3f2d52e27ed54c1ce7ec0bc29a03280147aab0ef2813fa3f3d62503871" ]; then
  echo "FAIL V-18: the ratified threat-model section has been edited."
  echo "           got  $TM_DIGEST"
  echo "           want 77a67f3f2d52e27ed54c1ce7ec0bc29a03280147aab0ef2813fa3f3d62503871"
  echo "           That section is ADR-0034's ratified review criterion and is"
  echo "           byte-identical in both legs. REVERT YOUR EDIT. Do not"
  echo "           recompute the digest to make this pass."
  exit 1
fi

# V-20 the split provenance is intact. It exists so the OWNER-APPROVED block at
#      the end of this file can never be read out of context: a signature whose
#      document changed name without a record of why is a signature nobody can
#      audit. Deleting this section is not a tidy-up.
#      THE PREVIOUS FORM WAS SELF-SATISFYING and was demonstrated to be: it
#      greped the whole spec for two needles that both occurred inside V-20's own
#      commands, so deleting the entire Provenance section left it green. It now
#      EXTRACTS the section first — the extraction stops at "## Context", so this
#      verification block is not in it — and pins it by CHECKSUM, like V-18. The
#      greps below run inside the extraction and exist only to give a readable
#      failure; the checksum is the gate.
#      EVERY ASSERTION IN THIS STEP PRINTS ON FAILURE — round 8, and it is the
#      round-1 V-18 lesson applied where it had not been. Under `set -e` a bare
#      `grep -q` or `test` exits 1 in SILENCE, so the loudest instruction here
#      ("this digest is agent-computed and MAY be recomputed; V-11's and V-18's
#      may not") is the one an implementer never sees. **The assertions and the
#      literal are unchanged**; only the diagnostics are new, so the digest does
#      not move.
PROV="$(mktemp)"
awk '/^## Provenance /{f=1} /^## Context /{f=0} f' "$SPEC" >"$PROV"
if [ ! -s "$PROV" ]; then
  echo "FAIL V-20: the Provenance extraction is EMPTY — its heading or the"
  echo "           '## Context' terminator moved. An empty range digests the"
  echo "           empty string and would pin it happily. STOP AND REPORT."
  rm -f "$PROV"; exit 1
fi
# Literal markdown backticks in a fixed-string pattern — SC2016 false positive.
# shellcheck disable=SC2016
if ! grep -qF 'previously `docs/specs/WP-secret-fence-two-tier-entropy.md`' "$PROV"; then
  echo "FAIL V-20: the Provenance section no longer records the file's former"
  echo "           name. That record is the whole warrant for reading the"
  echo "           OWNER-APPROVED block at the end of this file in context."
  rm -f "$PROV"; exit 1
fi
if ! grep -qF 'OWNER-ANSWERED' "$PROV"; then
  echo "FAIL V-20: the OWNER-ANSWERED block is gone from the Provenance section."
  echo "           It is the audit record for the signature carrying across the"
  echo "           rename and must not be deleted as a tidy-up."
  rm -f "$PROV"; exit 1
fi
#      RECOMPUTED IN ROUND 1 OF THE DESIGN GATE, and the recomputation is
#      legitimate where V-11's and V-18's would not be. This digest is
#      AGENT-COMPUTED over prose the architect owns; V-11's is over the OWNER's
#      own two signature lines and V-18's is over a RATIFIED review criterion.
#      Recomputing either of those two is forbidden in every circumstance — a red
#      line there means the owner's text or ADR-0034's was edited, and the repair
#      is `git checkout`, never a new literal. This one moved because the section
#      it covers was corrected: point 5 said "both leg files are still untracked"
#      (false since 7ef4c51), and the section now states what git does and does
#      not attest about the split, plus the empty owner-reaffirmation slot.
PROV_DIGEST="$(shasum -a 256 <"$PROV" | cut -d' ' -f1)"
rm -f "$PROV"
if [ "$PROV_DIGEST" != "ec53884c8fc5be494718b6ad7ae2b8439e10b2e00a2e2afd262d6d36933197cd" ]; then
  echo "FAIL V-20: the split-provenance section has been edited."
  echo "           got  $PROV_DIGEST"
  echo "           want ec53884c8fc5be494718b6ad7ae2b8439e10b2e00a2e2afd262d6d36933197cd"
  echo "           AS THE IMPLEMENTER: revert your edit. This section is not in"
  echo "           your Deliverables and nothing in this WP requires touching it."
  echo "           AS THE ARCHITECT: this one digest MAY be recomputed, unlike"
  echo "           V-11's and V-18's — it is agent-computed over prose you own —"
  echo "           and the recomputation is disclosed in the same pass."
  exit 1
fi

# V-22 AC-22: the glossary describes the severity branch and both destinations,
#      and leg 1's detector sentences are byte-unchanged. `grep -q 'two-tier'`
#      was NOT a check on the second half: one surviving token passed while the
#      rest of leg 1's prose could be rewritten wholesale. The real bound is on
#      WHICH LINES THIS WP MAY REMOVE — the two gate sentences (which leg 1 left
#      byte-unchanged and whose exact wrapping its own V-19 pins) and the
#      secret-quarantine entry. Anything else removed is leg 1's text.
grep -q 'quarantine/redacted' docs/GLOSSARY.md
if grep -qF 'withhold on **any** finding of either severity' docs/GLOSSARY.md; then
  echo "FAIL V-22: the glossary still says the persistence gates withhold on any"
  echo "           finding. EP2 no longer does; EP4 still does. Rewrite that"
  echo "           sentence per 'The glossary edit, exactly'."
  exit 1
fi
#      LEG 1'S HALF OF THE SHARED LINE, held positively. Whatever line the gate
#      sentences begin on, leg 1's sentence ending `… never stores the matched
#      secret bytes.` may share it, and a plausible-correct rewrite that starts
#      at `Two` REMOVES that whole line — round 4 found that a line-exact list
#      rejects a correct implementation. The line is inside the extracted
#      permitted-removals list below, and leg 1's sentence on it is protected by
#      this grep instead.
must grep -qF 'a finding never stores the matched secret bytes' docs/GLOSSARY.md
#      THE PERMITTED-REMOVALS LIST IS EXTRACTED FROM $BASE BY CONTENT, NOT
#      HARD-CODED — round 1 of the design gate replaced the heredoc outright, and
#      the defect it closed was not a stale string but a WRONG FILE STATE.
#      The old heredoc reproduced docs/GLOSSARY.md lines 77-82 exactly as they
#      stand at efd1489, i.e. BEFORE leg 1. But this WP runs AFTER leg 1, and
#      leg 1's glossary edit is an INSERTION placed immediately after
#      `… a finding never stores the matched secret bytes.` and immediately
#      before `Two severities, …`. That insertion necessarily destroys the
#      composite `… bytes. Two` line, so under every reflow the line carrying
#      `Two` that this WP must remove is a line LEG 1 CREATED and the old list
#      did not contain — leaving a residue and failing a CORRECT implementation.
#      It was also a One-Document-Rule break: the fact needed to write the list
#      correctly lives only in leg 1's spec, which this implementer may not open.
#      Extraction fixes both at once, and it is the shape V-27 already uses.
#      RANGE 1 — the gate sentences, INSIDE the `secret scan` entry only. It
#      starts at the line carrying the word `Two` that opens the gate half and
#      ends at the line carrying `no shipped gate branches on it today`.
#      WHY `Two` AND NOT THE `severities,` LINE, measured rather than assumed:
#      at the capture point those two are on DIFFERENT source lines (77 and 78) —
#      line 77 is the shared one, ending `… matched secret bytes. Two`, and it is
#      exactly the line the trap is about. Anchoring on `severities,` would have
#      missed it and re-created the round-4 defect from the other side.
#      The entry is delimited FIRST so that `Two` cannot match elsewhere in the
#      glossary, and its uniqueness inside the entry is ASSERTED, not hoped for:
#      leg 1's inserted prose writes `two-tier` in lower case (its own glossary
#      instruction forbids numbers and this document does not depend on its
#      wording beyond that), so `\bTwo\b` stays unique — and if a future leg-1
#      revision breaks that, this step says so loudly instead of silently
#      extracting the wrong range.
#      RANGE 2 — the whole `secret quarantine` entry, from its bullet head to
#      its `secret-incident.md` pointer.
#      Both ranges are taken from $BASE, i.e. from main WITH leg 1 already on it,
#      which is the only file state this WP is ever implemented against.
G22="$(mktemp)"
git show "$BASE:docs/GLOSSARY.md" \
  | awk '/^- \*\*secret scan \/ `scanAndRedact`\*\*/{f=1; print; next} f && /^- \*\*/{f=0} f' \
  >"$G22"
# The backticks below are literal markdown in the glossary's own heading and the
# pattern is a fixed string, so single quotes are correct and SC2016 is a false
# positive here. Placed by MEASUREMENT in round 2: this is the one line in this
# block that shellcheck actually flags — the reviewer's finding named a
# neighbouring line, and running the extracted block is what located the real one.
# shellcheck disable=SC2016
must_eq "V-22 the secret-scan entry was extracted"        1 \
  "$(git show "$BASE:docs/GLOSSARY.md" | grep -c '^- \*\*secret scan / `scanAndRedact`\*\*')"
#      The word match is written as a portable ERE, NOT as awk's `\<Two\>`:
#      measured on this machine, BSD awk (which macOS ships) does not implement
#      GNU's `\<`/`\>` word anchors and silently matches NOTHING, which produced
#      an empty range and therefore a vacuous bound. Caught by running it.
must_eq "V-22 exactly one \`Two\` opens the gate half"     1 \
  "$(awk '/(^|[^A-Za-z])Two([^A-Za-z]|$)/{n++} END{print n+0}' "$G22")"
must_eq "V-22 the gate half's last line is present"       1 \
  "$(grep -c 'no shipped gate branches on it today' "$G22")"
must_eq "V-22 the secret-quarantine entry is present"     1 \
  "$(git show "$BASE:docs/GLOSSARY.md" | grep -c '^- \*\*secret quarantine\*\*')"
PERM22="$(mktemp)"
awk '/(^|[^A-Za-z])Two([^A-Za-z]|$)/{f=1} f{print} /no shipped gate branches on it today/{f=0}' \
  "$G22" >"$PERM22"
git show "$BASE:docs/GLOSSARY.md" \
  | awk '/^- \*\*secret quarantine\*\*/{f=1} f{print} /secret-incident\.md` for recovery/{f=0}' \
  >>"$PERM22"
rm -f "$G22"
#      THE LIST MUST BE NON-EMPTY. An awk range that stopped matching would write
#      an EMPTY list, and `grep -vFf` against an empty pattern file REMOVES
#      NOTHING — the bound would silently invert into "any removal is permitted".
#      Same empty-match hazard the sibling leg's V-21 probes for, and the reason
#      the four counts above are asserted rather than assumed.
if [ ! -s "$PERM22" ]; then
  echo "FAIL V-22: the permitted-removals extraction is EMPTY. grep -vFf against an"
  echo "           empty file removes nothing, so the bound would pass any diff at"
  echo "           all. One of the awk ranges stopped matching — report it; do NOT"
  echo "           proceed and do not hard-code the list back."
  rm -f "$PERM22"; exit 1
fi
if git diff "$BASE" -- docs/GLOSSARY.md | grep '^-' | grep -v '^---' \
     | grep -vFf "$PERM22" | grep -q .; then
  echo "FAIL V-22: the glossary diff removes a line outside the two gate"
  echo "           sentences and the secret-quarantine entry. Leg 1's detector"
  echo "           sentences must be byte-unchanged (Deliverables)."
  rm -f "$PERM22"; exit 1
fi
rm -f "$PERM22"

# V-24 AC-25: the secret-revert-exhausted banner no longer tells the user to
#      delete the redacted/ folder, and NOTHING else in either file moved. Same
#      bounded-removed-lines shape as V-13: exactly one removed line per file,
#      and it must be the old sentence.
must grep -qF '(not the redacted/ folder inside it)' src/core/dream/ledger.js
must grep -qF '(not the redacted/ folder inside it)' tests/unit/ledger.test.js
#      The prefix tests/integration/dream.test.js asserts must survive verbatim,
#      which is WHY that file is not in the Deliverables table.
must grep -qF 'The withheld copies are in state/quarantine/' src/core/dream/ledger.js
if changed_paths | grep -qx "tests/integration/dream.test.js"; then
  echo "FAIL V-24: tests/integration/dream.test.js was changed. Its assertion is a"
  echo "           substring of the surviving prefix and must not need editing;"
  echo "           if it does, the replacement wording is wrong, not the test."
  exit 1
fi
PERM24="$(mktemp)"
cat >"$PERM24" <<'EOF'
'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest. ' +
EOF
for f in src/core/dream/ledger.js tests/unit/ledger.test.js; do
  if git diff "$BASE" -- "$f" | grep '^-' | grep -v '^---' \
       | grep -vFf "$PERM24" | grep -q .; then
    echo "FAIL V-24: $f removes a line outside the banner sentence. Only that one"
    echo "           line may be deleted in each file (Deliverables)."
    rm -f "$PERM24"; exit 1
  fi
done
rm -f "$PERM24"

# V-25 THE PERMISSION BOUNDARY, checked here rather than trusted to CI.
#      scripts/boundary-check.js parses this spec's Deliverables table, but it
#      also hard-codes memory/lessons/inbox.md as ALWAYS allowed (line 48) —
#      while CLAUDE.md forbids editing that file on a WP branch, because parallel
#      branches conflict on merge. Executed: a tree whose only change is that file
#      exits 0. So reject it explicitly FIRST, then delegate the rest.
if changed_paths | grep -qx "memory/lessons/inbox.md"; then
  echo "FAIL V-25: memory/lessons/inbox.md was edited on a WP branch. CLAUDE.md"
  echo "           forbids it; report the lesson in the PR body instead. The"
  echo "           shared boundary checker allows this path unconditionally, so"
  echo "           this line is the only thing that catches it."
  exit 1
fi
#      Seeded with $SPEC (always allowed) so the array is never empty under
#      `set -u` on bash 3.2, which has no mapfile.
CHANGED=("$SPEC")
while IFS= read -r p; do CHANGED+=("$p"); done < <(changed_paths)
node scripts/boundary-check.js "$SPEC" "${CHANGED[@]}"

# V-23 AC-23: state/quarantine/redacted/ is inside the A5 private tree, so
#      doctor/sync/the digest banner can see a world-readable pre-scrub copy.
#      Behavioural, not textual: build the exact reproduction from Current state
#      and require insecureEntries to report BOTH paths. A grep for the new
#      A5_PRIVATE_DIRS element would pass on a file that never walks into it.
node -e '
const fs=require("fs"), path=require("path"), os=require("os");
const {insecureEntries}=require("./src/core/private-fs.js");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"wd-v23-"));
const core=path.join(root,"core"), state=path.join(core,"state");
const red=path.join(state,"quarantine","redacted");
fs.mkdirSync(red,{recursive:true});
fs.mkdirSync(path.join(core,"logs")); fs.mkdirSync(path.join(core,"secrets"));
for (const d of [core,state,path.join(core,"logs"),path.join(core,"secrets"),path.join(state,"quarantine")]) fs.chmodSync(d,0o700);
const f=path.join(red,"2026-07-26-note.md");
fs.writeFileSync(f,"raw\n"); fs.chmodSync(red,0o755); fs.chmodSync(f,0o644);
const p={core,state,logs:path.join(core,"logs"),secrets:path.join(core,"secrets"),
         config:path.join(core,"config.yaml"),manifest:path.join(core,"install-manifest.json")};
const got=insecureEntries(p);
const ok=got.includes(red)&&got.includes(f);
fs.rmSync(root,{recursive:true,force:true});
if(!ok){console.error("FAIL V-23: insecureEntries did not report the loosened",
  "quarantine/redacted/ dir and the file inside it. Got:",got); process.exit(1);}
console.log("V-23 ok: quarantine/redacted/ is inside the A5 private tree");
'

# V-11  the ADR this WP implements is on disk and Accepted, and the owner signed
#       both it and this spec. POSITIVE checks only: assert the presence of what
#       must exist. Never write this as "a warning is absent" — that form is
#       satisfiable by deleting the warning, which is exactly how a sibling spec
#       shipped an empty gate.
#       EVERY ASSERTION HERE PRINTS ON FAILURE — round 8, and it is the round-1
#       V-18 lesson applied where it had not been. Under `set -e` a bare
#       `grep -qx` or `test` exits 1 in SILENCE, so the single most important
#       instruction in this document — "S5: no agent writes that line, ever, not
#       even to clear a red V-11" — is the one an implementer never sees; they
#       see a script that died with no message and reach for the nearest literal.
#       **THE ASSERTIONS, THE PATTERN AND THE DIGEST LITERAL ARE UNCHANGED**;
#       only the diagnostics are new, so V-11's pinned digest does not move and
#       the sibling leg's copy of it still agrees.
if ! grep -qx 'Status: Accepted' "$ADR"; then
  echo "FAIL V-11: ADR-0034's status line is not literally 'Status: Accepted'."
  echo "           The authority this WP rests on is not ratified. STOP AND REPORT."
  echo "           Do not edit the ADR: docs/adr/* is outside this Deliverables table."
  exit 1
fi
#       The signature FORM is decided by the "Owner signature form" table (rows
#       S1-S7); the patterns below are derived from it and must stay derived.
#       S5 in particular: `OWNER-SIGNED` is written by the owner and nothing
#       else. Do NOT "fix" a red V-11 by adding that line yourself — a red V-11
#       means the signature is genuinely absent and the WP is not ready to
#       merge. The greps do NOT key on the `OWNER-RATIFIED IN SESSION`
#       transcription (S6): that block was written by an agent, so a gate keyed
#       on it would be satisfied by the process it exists to constrain.
#       ANCHORED AT LINE START (S2) because an unanchored grep for the bare
#       token is satisfied by this very comment; TOLERANT OF `>`/`*` decoration
#       and of any dash run (S2, S3) because a gate a human cannot satisfy
#       without typing an em-dash gets bypassed, not obeyed.
SIG='^[> *]*OWNER-SIGNED[ —–-]*[0-9]{4}-[0-9]{2}-[0-9]{2}'
#       S4 — EXACTLY ONE per file. `grep -q` accepted any number, so a stray
#       second copy pasted in by a well-meaning tidy-up passed.
v11_count() {   # <label> <want> <got>
  if [ "$3" != "$2" ]; then
    echo "FAIL V-11: $1 — expected $2 owner-signature line(s), found $3."
    echo "           $3 > $2 means a second copy was pasted in; $3 < $2 means the"
    echo "           owner's line was deleted, re-dated, re-formatted or moved."
    echo "           EITHER WAY: revert to the owner's text with 'git checkout'."
    echo "           **NO AGENT EVER WRITES AN OWNER-SIGNED LINE (row S5)** — not"
    echo "           to clear this gate, not for symmetry, not for any reason."
    exit 1
  fi
}
v11_count "ADR-0034, whole file"  1 "$(grep -cE "$SIG" "$ADR")"
v11_count "this spec, whole file" 1 "$(grep -cE "$SIG" "$SPEC")"
#       S7 — PLACEMENT. Extract the region the signature must live in and count
#       there: this file's inside `## OWNER-APPROVED`, the ADR's in its header
#       above the first `##`. A signature that drifted elsewhere in the file
#       passed both the old greps and the count above.
v11_count "this spec, inside ## OWNER-APPROVED" 1 \
  "$(awk '/^## OWNER-APPROVED$/{f=1} f' "$SPEC" | grep -cE "$SIG")"
v11_count "ADR-0034, header region above the first ##" 1 \
  "$(awk '/^## /{exit} {print}' "$ADR" | grep -cE "$SIG")"
#       S7 — BYTE-IDENTITY of both lines, asserted as a DIGEST on purpose: the
#       exact bytes are deliberately NOT written out here, because a verification
#       step that publishes a copy-pasteable signature template is an invitation
#       to type one, and S5 says nobody ever does. A red line here means the
#       signature was edited, re-dated, re-formatted or relocated — the repair is
#       `git checkout` of the owner's text, never a retype and never a new digest.
SIG_DIGEST="$(grep -hE "$SIG" "$ADR" "$SPEC" | shasum -a 256 | cut -d' ' -f1)"
if [ "$SIG_DIGEST" != "4ca8fe05aded57ae5bdb3113292793c8498bf0490a76a0970ef008704ec741b6" ]; then
  echo "FAIL V-11: the two owner-signature lines are not byte-identical to the"
  echo "           pinned digest."
  echo "           got  $SIG_DIGEST"
  echo "           want 4ca8fe05aded57ae5bdb3113292793c8498bf0490a76a0970ef008704ec741b6"
  echo "           One of them was edited, re-dated, re-formatted or relocated."
  echo "           **DO NOT RECOMPUTE THIS DIGEST, AND DO NOT RETYPE THE LINE.**"
  echo "           This literal is over the OWNER'S OWN TEXT — unlike V-20's, it"
  echo "           may never be recomputed, by anyone, for any reason. The repair"
  echo "           is 'git checkout' of the owner's bytes. Row S5: no agent ever"
  echo "           writes an OWNER-SIGNED line. Report who changed it."
  exit 1
fi

# V-26 TABLE Q MEMBERSHIP — the sweep that DERIVES the family, so nobody has to
#      recall it. Four consecutive rounds, the blocking finding was a shipped
#      surface making a claim about EP2 that this WP falsifies, missed because
#      the family was assembled from memory. This step assembles it from a grep.
#      WHAT IT ASSERTS IS THE SET OF MATCHING **FILES**, NOT LINE NUMBERS, and
#      that is deliberate: leg 1 edits docs/GLOSSARY.md and
#      src/core/secret-scan.js, so several member line numbers will have moved by
#      the time this WP is implemented, and a line-pinned check would go red for
#      a benign reason. A NEW file acquiring a member surface is the failure this
#      catches; the CONTENT of each existing member is pinned by V-5 (Q1/Q14),
#      V-13 (Q3/Q4/Q5), V-22 (Q6), V-24 (Q2/Q9) and V-27 (Q10/Q11).
#      Excluded, and why: docs/specs/ and docs/adr/ are the specs and ADRs
#      themselves (this file is in the first), and docs/security-audit/ holds
#      DATED point-in-time audit snapshots — historical records, never edited.
#      The pattern is deliberately OVER-inclusive; docs/runbooks/codex-review.md
#      is a known non-member and is registered as one in "Table Q membership".
#      THE PATTERN IS PART OF THE CANONICAL CONTRACT — see "The sweep's own
#      pattern is a member of the contract" under Table Q. Do not tune it to make
#      this step pass. Round 7 widened the any-finding alternation from
#      `[Aa]ny` to a fully case-insensitive `[Aa][Nn][Yy]…[Ff]inding`, because
#      the hand-written character class was case-insensitive on the FIRST LETTER
#      ONLY: the shipped comments write the word as `ANY`, which scored zero, and
#      the sweep therefore missed src/core/dream/validate.js:900 — this WP's own
#      primary file, stating this WP's exact negation four lines above the code
#      it describes.
QSWEEP='state/quarantine|silent(ly)?[^.]{0,24}rewrit|[Aa][Nn][Yy][^.]{0,25}[Ff]inding|(banner|notice)[^.]{0,70}(folder|directory|empt)'
QFILES="$(mktemp)"
grep -rlE "$QSWEEP" src docs skills templates \
  --exclude-dir=specs --exclude-dir=adr --exclude-dir=security-audit \
  | LC_ALL=C sort >"$QFILES"
QREG="$(mktemp)"
cat >"$QREG" <<'EOF'
docs/GLOSSARY.md
docs/THREAT-MODEL.md
docs/runbooks/codex-review.md
docs/runbooks/incident.md
docs/runbooks/secret-incident.md
src/core/digest.js
src/core/dream/ledger.js
src/core/dream/validate.js
src/core/private-fs.js
src/core/secret-scan.js
EOF
if ! diff -u "$QREG" "$QFILES"; then
  echo "FAIL V-26: the set of files making a claim about what EP2 does with a"
  echo "           finding is not the set Table Q dispositions. A '+' line above"
  echo "           is a surface NOBODY HAS DISPOSITIONED — it is a spec bug, not"
  echo "           something to fix in code: report it and stop. A '-' line means"
  echo "           a registered member stopped matching, which usually means an"
  echo "           edit went further than its Table Q row allows."
  rm -f "$QREG" "$QFILES"; exit 1
fi
rm -f "$QREG" "$QFILES"
echo "V-26 ok: the Table Q family is exactly the registered file set"

# V-27 AC-27 / Table Q rows Q10 and Q11: docs/THREAT-MODEL.md no longer states
#      the negation of this WP, and NOTHING else in that file moved. Same
#      bounded-removed-lines shape as V-13. The two clauses live on single very
#      long source lines, so the permitted-removals list is those two whole
#      lines; every other line in the file must be byte-unchanged — INCLUDING
#      the production/dev STANCE CLAUSE, which belongs to
#      WP-stance-authority-containment, and :132/:427,
#      which Table Q rows Q12/Q13 keep.
TM=docs/THREAT-MODEL.md
must_not "V-27 Q10 the threat model still says EP2 reverts on ANY finding" \
  grep -qF 'redact- or quarantine-severity alike — reverts that file rather than committing it' "$TM"
must_not "V-27 Q10 the threat model still forbids the rewrite this WP performs" \
  grep -qF 'is **never** written back as a silent rewrite of the user' "$TM"
# The backticks below are literal markdown in the threat model's own text and the
# pattern is a FIXED string (-F), so single quotes are correct and the linter's
# SC2016 "expressions don't expand" note is a false positive here.
# shellcheck disable=SC2016
must_not "V-27 Q11 the pending-review notice is still tied to the folder holding files" \
  grep -qF 'a pending-review notice while `state/quarantine/` holds files' "$TM"
must grep -qF 'state/quarantine/redacted/' "$TM"          # Q10: the new destination is named
#      Q12/Q13/the stance clause: byte-identical, held positively.
must grep -qF '**Any** finding omits the whole section' "$TM"                         # Q12 (EP4)
must grep -qF 'acts on *any* detector finding, not only a hard one' "$TM"             # Q13
#      THE STANCE-CLAUSE SENTINEL WAS RE-DERIVED IN ROUND 1 OF THE DESIGN GATE,
#      and it was a HARD DEADLOCK rather than a stale string. The previous
#      sentinel was
#          'is refused, never silently downgraded to the unverified dev'
#      which WP-stance-authority-containment deleted when it rewrote that clause
#      in the 0.11.0 batch (commit 86d069e). Measured at the capture point:
#      ZERO matches in docs/THREAT-MODEL.md. So this step exited 1 before an
#      implementer could write a line — and the only edit that would have fixed
#      it is one this WP's own Deliverables row and this step's own failure text
#      both forbid, because that clause belongs to another spec. A positive grep
#      for a string that no longer exists is not a conservative gate; it is an
#      unsatisfiable one.
#      The replacement is taken from TODAY's clause and verified present at the
#      capture point — TWO greps, one at each end of the clause, so that an edit
#      widening into it from either direction removes one of them.
#      BOTH ARE SINGLE-LINE SUBSTRINGS AND THAT IS LOAD-BEARING. `grep -F`
#      matches within one line; the clause's own sentences WRAP, so the obvious
#      sentinel — the whole sentence "…and a disagreement between the bound and
#      live stance is refused in either direction" — spans source lines 281 and
#      282 and scores ZERO. Measured in this pass, which is how the first
#      candidate replacement was caught being as unsatisfiable as the string it
#      replaced. Verify a sentinel by RUNNING it, never by reading the document.
must grep -qF '**production/dev stance** matches, where the stance is decided by containment' "$TM"
must grep -qF 'the bound and live stance is refused in either direction' "$TM"
#      The permitted-removals list is EXTRACTED FROM $BASE BY CONTENT, not by
#      line number: both clauses sit on single very long source lines, and
#      pinning 130 and 134 literally would go red the moment any unrelated edit
#      lands above them on main.
PERM27="$(mktemp)"
git show "$BASE:$TM" | grep -F 'redact- or quarantine-severity alike'  >"$PERM27"
git show "$BASE:$TM" | grep -F 'Two state-driven digest banners'      >>"$PERM27"
must_eq "V-27 the permitted-removals list extracted exactly two lines" 2 \
  "$(wc -l <"$PERM27" | tr -d ' ')"
if git diff "$BASE" -- "$TM" | grep '^-' | grep -v '^---' \
     | grep -vFf "$PERM27" | grep -q .; then
  echo "FAIL V-27: the THREAT-MODEL diff removes a line outside gate (ii) and the"
  echo "           banner-lifecycle sentence. Those two clauses are the whole of"
  echo "           this WP's mandate in that file (Deliverables, Table Q rows Q10"
  echo "           and Q11). In particular the production/dev stance clause belongs"
  echo "           to WP-stance-authority-containment and must not be touched."
  rm -f "$PERM27"; exit 1
fi
rm -f "$PERM27"
echo "V-27 ok: the threat model states the shipped contract and nothing else moved"

# V-28 AC-27 / Table Q row Q17: validate.js's OWN Step-3 header comment no longer
#      states the negation of the gate it introduces. Same shape as V-5's Q14
#      block: negative greps on the two false clauses, positive greps on what the
#      replacement must say and on the two header lines that stay byte-identical.
#      There is no permitted-removals bound here and there cannot be — this file
#      is the WP's primary deliverable and its diff is large by design; the
#      content checks below are the whole of the bound. Round 7 added this step,
#      and the reason is in Table Q row Q17: no Deliverables cell named this
#      comment, so leaving it was the DEFAULT outcome, not a slip (mutation M-33).
VJ=src/core/dream/validate.js
must_not "V-28 Q17 validate.js still says the gate reverts on ANY finding" \
  grep -qF 'quarantine-preserves the working-tree file, then reverts it' "$VJ"
must_not "V-28 Q17 validate.js still forbids the rewrite this WP performs" \
  grep -qF 'is never written back (revert, never rewrite)' "$VJ"
must_not "V-28 Q17 the ANY-finding phrasing survives in validate.js" \
  grep -qF 'ANY detector finding' "$VJ"
#      What the replacement must say (Q17, which is Q10's wording): both
#      destinations named, and the superseding authority cited rather than the
#      superseded OWNER-APPROVED line.
must grep -qF 'state/quarantine/redacted/' "$VJ"
must grep -qF 'ADR-0034' "$VJ"
#      The two header lines Q17 keeps byte-identical.
must grep -qF '── Step 3: EP2 staged-output secret gate (audit A5, ADR-0024, WP-123) ───' "$VJ"
must grep -qF 'exactly the bytes THIS run is responsible for' "$VJ"
#      And the file must still MATCH the V-26 sweep after the edit: the
#      replacement names state/quarantine/ (above), so V-26 sees no '-' line for
#      it. This is the check that a "fix" which simply DELETES the comment fails.
#      $QSWEEP is still in scope — V-26 runs above.
must grep -qE "$QSWEEP" "$VJ"
echo "V-28 ok: validate.js's own comment states the shipped contract (Q17)"

# V-30 THE REGISTRATION STEP — the Mirrored Surface Checklist, mechanized.
#      FOUR CONSECUTIVE ROUNDS produced a blocking finding of one shape: a
#      canonical row, fault injection, mutation or accepted residual was added
#      and never registered in the Checklist, and the review found it rather
#      than the document. Rounds 3, 4, 5 and 6 each answered with a hand-walk;
#      rounds 4, 5 and 6 each ASSERTED a completed walk that the next review
#      falsified. A fifth hand-walk fails the same way.
#      SO THE CHECKLIST'S MEMBERSHIP IS DERIVED FROM THE DOCUMENT INSTEAD OF
#      RECALLED. This step enumerates every id the file DEFINES and fails unless
#      each one is either named inside the Checklist region or listed on the
#      dated backlog below.
#      ITS OUTPUT IS THE WALK. No surface in this document may claim a completed
#      registration walk on any other basis.
#      WHAT COUNTS AS A DEFINITION — THREE FAMILIES, and round 8 added two of
#      them. (1) A CONTRACT-TABLE ROW: the first cell of a table row. (2) An
#      ACCEPTED-RESIDUAL ORDINAL. (3) NEW IN ROUND 8 — an ACCEPTANCE CRITERION
#      (`- [ ] **AC-n**`) and a VERIFICATION STEP (`# V-n `). Rounds 6 and 7
#      wrote that this step covers "every id this document defines"; measured in
#      round 8, it covered NEITHER of those two families — 15 AC ids and 21 V
#      ids were invisible, and SIX of them were genuinely unregistered (AC-8,
#      AC-15, AC-16, V-1, V-10, V-25). Demonstrated green on an appended,
#      unregistered `AC-28` written as a numeric mirror of Table N row N1.
#      WHAT "REGISTERED" MEANS, DISCLOSED RATHER THAN IMPLIED: any `\b`-bounded
#      mention of the id anywhere inside the Checklist region, tested against
#      that region with its whitespace COLLAPSED so a registration that wraps
#      across source lines still matches. It is a PRESENCE test, not an
#      agreement test — an id named in a bullet whose mirror set is wrong is
#      still "registered". This step guarantees nothing is UNNAMED, and nothing
#      more.
#      WHAT THE BACKLOG IS, STATED HONESTLY: a DATED list with a REASON per
#      group, not a claim that these ids need no registration. It is what makes
#      the step fail-closed — a NEW id cannot be added without either
#      registering it or adding a line here, and both are visible in the diff.
#      Shrinking it is welcome; growing it needs a reason in the same commit.
#      THE SPEC PATH IS AN ARGUMENT, NOT A LITERAL (round 8): hard-coding it
#      meant a copy or a rename checked the wrong file while reporting on this
#      one.
# The node program below is a single-quoted script; the `$` characters inside it
# are JavaScript regex anchors, not shell expansions — SC2016 is a false positive.
# shellcheck disable=SC2016
node -e '
const fs=require("fs");
const file=process.argv[1];
if(!file){console.error("FAIL V-30: no spec path was given.");process.exit(1);}
const lines=fs.readFileSync(file,"utf8").split("\n");
const a=lines.findIndex((l)=>/^### Mirrored Surface Checklist\s*$/.test(l));
if(a<0){console.error("FAIL V-30: the Mirrored Surface Checklist heading is missing.");process.exit(1);}
let b=lines.findIndex((l,i)=>i>a&&/^### /.test(l)); if(b<0)b=lines.length;
const region=lines.slice(a,b).join("\n");
if(region.length<2000){console.error("FAIL V-30: the Checklist region is implausibly short ("+region.length+" bytes) — its terminator moved. Do not repin; report it.");process.exit(1);}
const flatRegion=region.replace(/\s+/g," ");
const defs=new Map();
for(let i=0;i<lines.length;i++){
  const m=/^\|\s*(?:\*\*)?([A-Z]{1,3}-?[0-9]+[a-z]?)(?:\*\*)?\s*\|/.exec(lines[i]);
  if(m&&!defs.has(m[1]))defs.set(m[1],i+1);
  const ac=/^- \[ \] \*\*(AC-[0-9]+[a-z]?)\b/.exec(lines[i]);
  if(ac&&!defs.has(ac[1]))defs.set(ac[1],i+1);
  const v=/^# (V-[0-9]+[a-z]?) /.exec(lines[i]);
  if(v&&!defs.has(v[1]))defs.set(v[1],i+1);
}
const ra=lines.findIndex((l)=>/^## Accepted residuals/.test(l));
if(ra<0){console.error("FAIL V-30: the Accepted residuals heading is missing.");process.exit(1);}
let rb=lines.findIndex((l,i)=>i>ra&&/^## /.test(l)); if(rb<0)rb=lines.length;
for(let i=ra;i<rb;i++){const m=/^([0-9]+[a-z]?)\.\s+\*\*/.exec(lines[i]); if(m)defs.set("residual "+m[1],i+1);}
// THE BACKLOG. Every group carries a DATE and a REASON; round 8 added both,
// because round 7 called this "a DATED BACKLOG" while its fifty-four entries
// carried neither.
//   P1…P6 B1 B2 B8 B9 Q9 Q16 N3 N4 N5 N7 K1 K3 R3 R5 R7b R8 R9
//   FI-3 FI-5a FI-5b FI-7b FI-8 FI-9 FI-10 FI-12 FI-13 FI-14
//   M-8 M-9 M-11 M-23 M-24 M-24b M-25
//     backlogged 2026-07-26 — rows that predate the mechanization. Each is
//     mirrored somewhere; none of those pairings is written in the Checklist,
//     and the summary line below counts them as BACKLOGGED, never registered.
//   S1 … S7  backlogged 2026-07-26 — the Owner-signature-form rows are
//     registered COLLECTIVELY by the Checklist bullet that names that table and
//     V-11; no row has a separate mirror set.
//   residual 1,2,3,4,5,7,8,12  backlogged 2026-07-26 — same reason.
//   AC-8 AC-15 AC-16 V-1 V-10 V-25  backlogged 2026-07-27, ROUND 8, and these
//     are the six the AC/V families revealed the moment they became visible.
//     AC-8 is mirrored by Table B rows B4/B8/B9 and mutations M-7…M-11; AC-15
//     by the Mutation-checks preamble; AC-16 by nothing but `npm test`; V-1 and
//     V-10 are the two ids INHERITED FROM THE PARENT SPEC that mean the same
//     check in both legs (the full-suite run and lint), so neither has a
//     leg-local mirror set; V-25 is the permission-boundary check, mirrored by
//     the `memory/lessons/inbox.md` prohibition. Fine AS BACKLOG — every one of
//     those mirrors exists and agrees today — but they are NOT registered, and
//     no surface may read the registered figure as covering them.
const EXCLUDED=new Set(`
P1 P2 P3 P4 P6
B1 B2 B8 B9
Q9 Q16
N3 N4 N5 N7
K1 K3
R3 R5 R7b R8 R9
FI-3 FI-5a FI-5b FI-7b FI-8 FI-9 FI-10 FI-12 FI-13 FI-14
S1 S2 S3 S4 S5 S6 S7
M-8 M-9 M-11 M-23 M-24 M-24b M-25
AC-8 AC-15 AC-16
V-1 V-10 V-25
`.trim().split(/\s+/).concat(["residual 1","residual 2","residual 3","residual 4","residual 5","residual 7","residual 8","residual 12"]));
const missing=[];
for(const [id,ln] of defs){
  if(EXCLUDED.has(id))continue;
  const pat=id.startsWith("residual ")
    ? new RegExp("residual[s]?\\s*(\\*\\*)?"+id.slice(9)+"\\b")
    : new RegExp("\\b"+id.replace(/-/g,"\\-")+"\\b");
  if(!pat.test(flatRegion))missing.push(id+" (defined at line "+ln+")");
}
const stale=[...EXCLUDED].filter((id)=>!defs.has(id));
if(stale.length){
  console.error("FAIL V-30: the exclusion list names ids this document no longer defines:");
  for(const x of stale)console.error("           "+x);
  console.error("           Remove them — a stale exclusion silently widens the carve-out.");
  process.exit(1);
}
if(missing.length){
  console.error("FAIL V-30: "+missing.length+" id(s) are defined by this document but appear");
  console.error("           NOWHERE in the Mirrored Surface Checklist and are not on the");
  console.error("           registered exclusion list:");
  for(const m of missing)console.error("           "+m);
  console.error("");
  console.error("           This is the defect four consecutive review rounds found by hand.");
  console.error("           Register each one in the Checklist with its mirror set — or, if it");
  console.error("           genuinely predates the mechanization, add it to the exclusion list");
  console.error("           WITH the reason in the same commit. Do not delete this step.");
  process.exit(1);
}
console.log("V-30 ok: "+defs.size+" ids defined across the table, acceptance-criterion, verification and residual families, "
  +EXCLUDED.size+" on the dated backlog, "+(defs.size-EXCLUDED.size)+" registered in the Checklist; 0 unregistered.");
' "$SPEC"

# V-31 THE TERMINOLOGY SWEEP — the safe/authorize universal, mechanized.
#      Round 6 wrote "No surface in this document may say K4 makes the revert
#      safe", and round 6's own review falsified it at two CANONICAL surfaces
#      (Table R row R1's cell and FI-17's rationale). An absolute claim with no
#      executed check beside it is the defect class this gate keeps finding, so
#      the claim now carries its grep.
#      SHAPED LIKE V-15, NOT LIKE A HEURISTIC. A first draft filtered hits by
#      looking for negation words on the same line and it failed immediately on
#      three legitimate ones, because the negation sits on the NEXT line — and it
#      matched its own failure message besides. So: sweep the PROSE VIEW (fenced
#      ```bash blocks removed, exactly as V-15 does and for the same self-match
#      reason), then subtract a REGISTERED list of permitted substrings. Any
#      residue is a surface asserting that a revert is safe.
#      ROUND 8 REBUILT IT TWICE OVER, and both repairs are the same lesson.
#      (a) IT WAS LINE-LOCAL, so a claim whose TOKEN and whose SUBJECT wrapped
#      onto different source lines was invisible to the paired greps. Executed
#      at a516c77 against the reviewers' published attack — the two lines
#        "The identity read makes the destructive step that follows"
#        "completely safe, so no further guard is needed on that branch."
#      — the first carries no `safe`, the second carries no `revert`/`K4`, and
#      the step passed GREEN. The view is now PARAGRAPH-JOINED before the greps
#      run, and a negative self-test below re-runs that exact attack.
#      (b) THE ALLOWLIST FILTERED WHOLE UNITS. `grep -vFf` drops any line an
#      entry matches, so a floating entry excuses everything beside it — and
#      one entry WAS floating: `everything that makes that safe` is a clause
#      that could occur anywhere. The allowlist is now SUBTRACTED from the text
#      (each registered fragment is excised, then the greps run on what is
#      left), which is V-15's shape, and every entry is ANCHORED to its own
#      surface by carrying enough of it to be unique.
#      THE ENTRIES ARE WRITTEN AGAINST THE JOINED VIEW, where a source line
#      break has become one space. They stay short enough to survive a reflow
#      and long enough to name their surface.
V31_TMP="$(mktemp)"
cat >"$V31_TMP" <<'EOF'
destruction safe is a *check performed earlier*
K3 succeeding does not make the revert safe either
own composition note called the K3-success paths safe
It does NOT** make the revert safe
A RESIDUAL-PINNING ROW, not a fault the design prevents
everything that makes that safe — K3's preserve, K4's identity comparison
removed, was the claim that K4 made the revert safe
K4 IS A FILTER, NOT AN AUTHORIZATION
fails on any surviving co-occurrence of a safety word with a revert word
**no safe alternative** — here there is one
puts the same unavoidable window on the safe side
**N2's condition is a SAFETY property, not an accident of drafting.**
spending an owner decision to buy a worse safety property
**This guard is safe only while `state/quarantine/` is never pruned
which resolves to **keep** (safe)
labelled so nobody reads it as a passing safety property
is what makes the delete safe when the note's owner saves it mid-dream
so the gate does the only safe thing: `git()` throws
resolves oddly — and it fails safe.**
43 base64url characters is safe
because it resolves to **keep**, and keeping is always safe
**This is the check-authorizes-later-destruction class**
EOF
#      THE PROSE VIEW, PARAGRAPH-JOINED. Fenced ```bash blocks are stripped
#      first — exactly as V-15 does, for the same self-match reason — then each
#      blank-line-delimited paragraph is emitted on ONE line, prefixed with the
#      source line it starts at so a failure is locatable.
v31_paragraphs() {   # <file>
  awk '
    /^```bash$/ { f = 1 }
    !f {
      if ($0 ~ /^[[:space:]]*$/) { if (buf != "") { print start ": " buf; buf = "" } }
      else { if (buf == "") { start = NR; buf = $0 } else { buf = buf " " $0 } }
    }
    f && /^```$/ { f = 0 }
    END { if (buf != "") print start ": " buf }
  ' "$1" | sed 's/[[:space:]][[:space:]]*/ /g'
}
#      WHITESPACE RUNS COLLAPSE TO ONE SPACE, and that is not cosmetic: a joined
#      paragraph otherwise carries each continuation line's leading indentation
#      in the middle of a sentence, so an allowlist entry written with single
#      spaces stops matching. Measured in round 8 — the residual-race entry
#      failed to excise for exactly that reason. It is V-15's own normalization,
#      applied here for the same purpose.
#      SUBTRACT the registered fragments as FIXED strings, then look at what is
#      left. Excision rather than line-dropping is what stops one entry
#      excusing an unregistered claim that shares its paragraph.
v31_residue() {   # <file> <allowlist-file>
  v31_paragraphs "$1" | awk -v L="$2" '
    BEGIN { while ((getline e < L) > 0) if (e != "") ent[++n] = e }
    {
      s = $0
      for (i = 1; i <= n; i++) {
        p = index(s, ent[i])
        while (p > 0) { s = substr(s, 1, p - 1) " " substr(s, p + length(ent[i])); p = index(s, ent[i]) }
      }
      print s
    }
  '
}
#      BOTH GREPS ARE CASE-INSENSITIVE, and round 8 made the first one so. It
#      was `grep -E '(safe|authoriz)'` — case-SENSITIVE — which is the identical
#      defect round 7 found in V-26's `QSWEEP` (a hand-written class that was
#      case-insensitive on the first letter only, and therefore scored zero on
#      the shipped word `ANY`). Measured here: `**N2's condition is a SAFETY
#      property**` scored zero against the sensitive form.
#      AND THE SUBJECT ALTERNATION IS `destr`, NOT `destro`. Round 8 built the
#      paragraph join, re-ran the reviewers' published attack, and watched it
#      STILL pass — because the attack's subject word is `destructive`, which
#      `destro` does not match. A stem short enough to be a stem, not a word
#      somebody happened to type. **The wrap repair alone would have shipped a
#      step that still could not see the attack it was built for**, which is
#      what the negative self-test below exists to prevent from recurring.
v31_hits() {   # <file> <allowlist-file>
  v31_residue "$1" "$2" | grep -iE '(safe|authoriz)' | grep -iE 'revert|withhold|K3|K4|destr' || true
}
#      NEGATIVE SELF-TEST — the reviewers' published wrap attack, verbatim. Append
#      it to a COPY and assert the sweep fires. Without this the paragraph join is
#      a claim nobody has watched work.
V31_PROBE="$(mktemp)"
{ cat "$SPEC"
  printf '\n%s\n%s\n' 'The identity read makes the destructive step that follows' \
    'completely safe, so no further guard is needed on that branch.'
} >"$V31_PROBE"
if [ -z "$(v31_hits "$V31_PROBE" "$V31_TMP")" ]; then
  echo "FAIL V-31: the sweep is blind to a safe/revert claim WRAPPED across two"
  echo "           source lines — the exact bypass round 8 measured green against"
  echo "           the round-7 form. The paragraph join is broken. Do not proceed."
  rm -f "$V31_PROBE" "$V31_TMP"
  exit 1
fi
rm -f "$V31_PROBE"
V31_BAD="$(v31_hits "$SPEC" "$V31_TMP")"
rm -f "$V31_TMP"
if [ -n "$V31_BAD" ]; then
  echo "FAIL V-31: a surface asserts that a revert is safe or authorized, rather than"
  echo "           negating it, quoting a falsified claim, or describing the problem:"
  printf '%s\n' "$V31_BAD"
  echo "           Reword to FILTER language and cite the inherited pre-revert race."
  echo "           If the new wording is legitimate, add an ANCHORED substring of it"
  echo "           to the list ABOVE in the same commit — never widen the grep, and"
  echo "           never add a floating clause that would excuse an arbitrary surface."
  exit 1
fi
echo "V-31 ok: paragraph-joined, allowlist subtracted, wrap self-test fired; every"
echo "         safe/authorize hit near a revert is a registered negation, quotation"
echo "         or problem statement"
```

For each Mutation-check row: apply the mutation, run the named command, paste the
**failing** output, revert. A row whose suite stays green is a spec bug — say so
in the PR and stop.

## Out of scope (do NOT do these)

- **The detector.** `src/core/secret-scan.js`, the entropy tiers, the context
  predicate, the fixture corpus and the FN/FP matrices are
  **`WP-secret-fence-two-tier-detector`**, which is this WP's `depends_on` and is
  already on `main`. Table P is how you depend on it; editing it is out of scope
  even if a gate test would be easier to write with a tweak.
- **Making anything read `secretRedactions`.** `src/cli/dream.js` keeps its
  `secretReverts` deferral logic byte-for-byte (rows B8/B9, V-4). Wiring the new
  counter into the ledger, the digest or an alert is a separate decision with a
  separate user-visible consequence.
- **Changing the withhold path — with exactly three named exceptions.** Rows B2,
  B3, B6 and B13 are today's behaviour, restated so that the redact arm can be
  defined against them. Reason strings, the `state/quarantine/` destination, the
  `## Reverted by orchestrator (policy enforcement)` report section and the
  unbounded retention all stay byte-identical. The three exceptions are all
  argued where they are decided rather than buried here:
  **(1) row B3a**, one `git add -A -- rel` after the untracked revert, which moves
  no user-visible surface and reaches the same end state Step 5 already produced
  two statements later (its row says why it is not deferred); **(2) the
  `secret-revert-exhausted` banner sentence** in `src/core/dream/ledger.js`
  (**Table Q row Q2**); and **(3) the digest withhold banner's closing sentence**
  in `src/core/digest.js` (**Table Q row Q1**). Exceptions 2 and 3 are the same
  defect on two surfaces and neither is a UX decision: both are shipped strings
  that **this WP falsifies without editing them**, because they instruct the user
  to delete the contents of a folder that now holds the only pre-scrub copy of
  their own text, and both promise a state the user can no longer reach. **Round
  5's correction to this bullet, recorded because it is the reason the finding
  survived a round:** the previous revision listed only exceptions 1 and 2 and
  named "the digest banner text" among the byte-identical surfaces, which froze
  exception 3 — the argument "this WP does not change the withhold path" was used
  to protect a string the WP had already made wrong. Nothing else on the withhold
  path moves, and V-5, V-13, V-24 and V-27 bound every surface that could.
  **Round 6's addition, and it is documentation rather than behaviour:** Table Q
  rows **Q10**, **Q11**, **Q14** and **Q15** correct four places that *describe*
  the withhold path — two clauses of `docs/THREAT-MODEL.md`, a comment in
  `digest.js` and the `A5_PRIVATE_DIRS` doc comment — none of which changes a
  byte the withhold path executes. They are in scope for the same reason
  exceptions 2 and 3 are: this WP falsifies them without editing them.
  **Round 7 adds a fifth on the same footing, row Q17** — the Step-3 header
  comment in `validate.js` itself, which states this WP's exact negation four
  lines above the code it describes. Same argument, one file closer in.
- **EP1, EP3 and EP4.** No file under those gates changes and no behaviour of
  theirs is in scope here — leg 1 already accounted for the loosening its
  detector change caused. **EP4 in particular still omits a digest section on any
  finding of either severity** (ADR-0034, "Unchanged, explicitly"): its input is a
  human-authored approved identity note, not brain output, and the availability
  trade-off ADR-0024 accepted there is untouched by this WP.
- **Any allowlist mechanism**, and **any shape allowlist**, permanently —
  ratified in ADR-0034, Decision 7, which lifted the ban verbatim out of the
  disposed ADR-0033. No rule of the form "a token starting with `1` followed by
  43 base64url characters is safe", and no length, prefix, suffix,
  character-class or "provider-shaped id" variant of it. Nothing in this WP
  suppresses a finding; it only chooses what to do with one.
- **trufflehog-style live verification.** See the threat model.
- **Editing `docs/adr/*`, `docs/adr/README.md`, or any other spec file.** The
  ADR this WP rests on, the repointing of references after the split, and the
  disposition of the superseded specs are the architect's to file.

## Definition of done

0. **V-11 passes**: `docs/adr/0034-accidental-persistence-threat-model.md` exists,
   its status line is literally `Status: Accepted`, and both it and this spec
   carry an `OWNER-SIGNED` line **written by the owner**. The dated
   `OWNER-RATIFIED IN SESSION` blocks are transcriptions by an agent and are
   deliberately NOT what this gate keys on — they record the decision, not the
   signature. All of them are positive greps — this gate asserts that something
   is present, never that a warning is absent. If any fails, **stop**: the
   authority this WP's EP2 change rests on is not on disk, and no amount of green
   tests substitutes for it.
0b. **ANSWERED 2026-07-26 — no longer a block.** The question was whether the
   2026-07-25 signature, given against this file under its former name, carries
   across the rename. The owner was asked directly and answered that it
   **stands**, so V-11 passing as written is correct rather than accidental. The
   record is the `OWNER-ANSWERED` block in the Provenance section, held by V-20.
   The standing rule survives the answer: **nobody writes, copies or deletes a
   signature line, and nobody adds or removes a V-11 gate**, on any reading.
1. **V-16 passed before any code was written**, and its output is the first thing
   in the PR body.
2. All verification steps pass locally; output pasted into the PR body, including
   **V-0's probe line** (a green suite whose diff guard cannot see the working
   tree is not evidence), **V-25's boundary result** (the changed set is a subset
   of the Deliverables table and does not include `memory/lessons/inbox.md`),
   **V-26's membership sweep coming back with exactly the files its `QREG`
   heredoc registers and nothing else** (a `+` line in its diff is a shipped
   surface nobody dispositioned — a spec bug, not something to fix in code;
   **and `QSWEEP` is never narrowed to make this pass** — see "The sweep's own
   pattern is a member of the contract"), **V-27's
   threat-model bound**, and the failing output for every Mutation-check row.
3. Conventional commits; PR titled
   `feat(dream): EP2 redacts in place on a redact-severity finding (WP-secret-fence-ep2-redact-arm)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.

---

## OWNER-APPROVED

**OWNER-SIGNED 2026-07-25.**

Everything that needed sign-off has it. Each line records **how** the approval
was given, so an auditor can trace it.

> **OWNER-RATIFIED IN SESSION — 2026-07-25 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér ratified this in conversation; this line was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one. The merge gate keys on an
> owner-written signature line, which no agent ever writes. Scope of this approval:
>
> 1. **The narrow override of ADR-0024.** This WP supersedes ADR-0024's WP-123
>    EP2 amendment ("this gate reverts on ANY detector finding — both `redact`
>    and `quarantine` severities, condition `findings.length > 0`",
>    OWNER-APPROVED 2026-07-17) and ADR-0024's "Alternatives considered"
>    rejection of "Treat high-entropy hits as `redact` rather than
>    `quarantine`" (ratified under ADR-0024's OWNER-APPROVED 2026-07-17 header
>    block) — **for the context-free case only.** ADR-0024's WP-125 EP4
>    amendment is unchanged. This is carried by **ADR-0034**
>    (`docs/adr/0034-accidental-persistence-threat-model.md`,
>    `Status: Accepted`), which is the durable record; this spec implements it.
> 2. **Table B's option-B preservation behaviour** — rows B4, B5, B10. Recorded
>    in full at "Why option B (preserve-then-scrub) rather than scrub-only"
>    above.
> 3. **Both UX contract changes** — rows B6/B7 (dream-report section, no digest
>    banner) and B12/B13 (`redacted/` capped at 50, `quarantine/` unbounded).
>    Recorded in full at "The two UX contract changes — confirmed" above.

**Nothing beyond those three items is approved.** In particular, no accepted
residual, no fixture, and no acceptance number in Table C carries owner
sign-off; they carry measurement, which is a different kind of warrant.

**This spec stays `status: Draft`.** It moves to `Ready` only after the double
gate (`docs/runbooks/codex-review.md` plus wd-reviewer), which the orchestrator
runs on this revision. Only the architect or the owner flips it.
