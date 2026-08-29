---
id: WP-dream-promote-report
title: Promote the dream report and deliver the enforcement record
status: Ready
model: opus
size: S
depends_on: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive, WP-dream-promote-module]
adrs: [ADR-0004, ADR-0012, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-report: the report is a promotion candidate, and its record always lands

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — cut by a pinned tripwire, not by a fresh debate.** This package
exists because **T1 fired**: the module half reached 30 acceptance criteria
against a ceiling of 28 (`2026-08-28-promote-split-review-rounds.md`, "T1 HAS
FIRED"). The tripwire was pinned before any review round ran
(`2026-08-28-promote-split-owner-ruling.md`) precisely so that this cut would be
an execution rather than an argument under gate pressure, and it names both the
seam and the resulting shape.

**Contract table letters are family-wide. The canonical map lives in ONE LIVING
surface — `docs/specs/logbook/2026-08-29-promote-family-map.md` — and this
spec CITES it rather than restating it.** It was restated in three
specs until the PR gate found two of them stale. **A cut that moves a table
updates that map AND sweeps each spec's Out-of-scope ownership prose, which stays
hand-maintained** — an earlier form of this sentence said "and nothing else",
which the next gate falsified by finding one of those bullets already drifted.
Every cross-package reference cites its owner and never restates it.

**Stacked between the module and the pipeline.** The module half publishes
ordinary notes and ships consumed by nothing. This package adds the report: the
brain-authored body as an ordinary promotion candidate, the code-authored
second write, and the fallback that keeps BOTH values when the body is not
published. The pipeline half then consumes the whole. **It also ships consumed
by nothing** — `promote()` gains its report behaviour here, and nothing calls
`promote()` until the pipeline package lands.

**Why the report is its own package and not a section.** Measured, it is seven
acceptance criteria and a table with four cases plus its own gate rules — more
contract than several shipped packages carry in total. And its subject is
different in kind from the module's: the module decides what may enter the
vault, while this package guarantees that **the record of those decisions
reaches the user even when nothing enters the vault at all.**

## Dispatch precondition

**Written against the tree at `36c2ce5`**, verified as `main` and `origin/main`
at authoring time. Dispatchable only after `WP-dream-promote-module` is `Done` —
it extends `promote()`'s signature and return. Before dispatch, re-run every
`file:line` citation and every measurement against the tree the implementer will
find. **Range citations are checked at BOTH ends.**

**Containment semantics are stated by CITATION** (owner ruling, 2026-08-28): the
shipped truth is kernel-faithful resolution plus `(dev, ino)` identity, owned by
**Table H** and implemented in `src/core/dream/vault-write.js` and
`src/core/dream/workspace.js`. **No surface here paraphrases a path-containment
rule.**

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** (ADR-0012) spawns a
headless AI brain, lets it write notes, and then decides what may enter the
user's vault. `WP-dream-promote-module` built that decision layer: it classifies
the brain's writes against a constructed baseline, runs four policy gates, and
publishes what survives through the vault-write primitive.

**What it deliberately did not build is the dream report.** The report is the
one file in the run that is BOTH a promotion candidate and the record of the
promotion decisions. The brain authors its body — including a `## Gated out (and
why)` section naming candidates the brain did NOT write, which no filesystem
outcome can reconstruct (`skills/wienerdog-dream/SKILL.md:409-425`). Code then
appends its own measured accounting beneath it.

**The hard case, and the reason this package exists as a contract rather than a
paragraph:** the report can itself be refused — by a gate, by a promotion
decision, or by the primitive. When that happens the vault correctly keeps
nothing, and the run's enforcement record has nowhere to live. **A design that
chooses between preserving the existing report and preserving this run's record
loses one of them every time it fires.** Table R's answer is to preserve both,
and to deliver the record through the run's own output when the vault cannot
take it.

## Current state

- **From `WP-dream-promote-module` (`Done` at dispatch):**
  `src/core/dream/promote.js` exports `promote(o)`, which decides, gates, merges
  and publishes ordinary notes and returns `promoted`, `redacted`, `refused` and
  `secretDisposition`, with the preservation record on the arms its Table Q
  row Q1 names and the redaction accounting on every entry of `redacted[]`,
  where it is required and non-null — its two fields, their gate provenance and
  its permitted carriers are that spec's row **Q10**'s, while row Q1 decides
  only the GATE arm that carries it. **(Corrected 2026-08-29, round 4's F-8:
  this sentence said "the one arm rows Q1 and Q10 name", and the two rows do not
  name one arm between them.)** **This paragraph is a Table Q mirror and is now
  registered as one** — in this spec's Current-state checklist item and in that
  spec's Table Q entry (round 4's F-5). **It composes and publishes no report**, takes no `records`, and
  its return carries no `report` field. Those are added here.
- `src/core/dream/vault-write.js` — `writeIntoVault`, the only route into the
  vault. Its `expect` guard (the primitive's H5) and its returned bytes (the
  primitive's H6) are what
  make the second write and the fallback safe.
- `src/core/dream/validate.js:1374-1409` — today's report handling: the brain
  writes the body into the VAULT and code appends its enforcement section to
  that same file, interpolating two brain-influenceable values per line
  (`:1385-1386`). `:1392-1409` is the shipped "Redacted in place" section.
- `src/core/digest.js:414-418` — `sanitizeProjectName`, exported at `:867`.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`, including `reports_dir`.
- **`src/core/secret-scan.js` — `redactOnly` (`:314`), exported at `:325`, is THE
  shipped redactor Table N's "redact" step means.** Named because the sanitiser
  is named: an implementer told to "redact" with no function to reach for may
  write a second detector, and this repo already warns against exactly that
  (`src/core/transcripts/index.js:60` — "this delegates to the ONE shared
  detector"). **Naming which shipped function is not prescribing a mechanism**;
  the owner ruling that left the mechanism open governs how total coverage is
  guaranteed, not which redactor exists.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/promote.js | the report row and Table R: the body as a candidate, the second write, the fallback, and the `records` input |
| modify | tests/unit/dream-promote.test.js | the report row and Table R |

**Nothing else.** In particular this package does not touch
`src/core/dream/validate.js` or `src/cli/dream.js`: like the module half, **it
ships consumed by nothing.** Retiring today's report handling and wiring the run
are `WP-dream-promote-in-workspace`'s work.

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

This package EXTENDS `promote()`; it does not introduce a new interface. The
module half's `### Exact contracts` owns the base shape and is not restated.
Two additions:

**The base shape this extends is NAMED, not restated, and not an ellipsis
either.** The module half's `@returns` decides `promoted[]`, `redacted[]`,
`refused[]` and `secretDisposition`, and its `PreservedCopy` and
`RedactionAccounting` typedefs decide what a preservation-record entry and a
redaction accounting are; **all six are read from that spec's
`### Exact contracts` at dispatch and none of their FIELDS is written out
here.** **Pass (c) found that base block missing entirely, so this package was
extending nothing** — the fix for that was to name it, and naming is where this
block stops. **Ruled 2026-08-29, after the round-zero pass found the field list
stale here for one round and the round-2 pass found the block naming its own
restatement as a defect and keeping it anyway:** a spelled-out field list in a
citing surface goes stale between one revision and the next, and this block had
now proved it twice. The only shape this package DECIDES is the `report` union
below, and that is the only one it writes out.

```js
/** @param {{ <the module half's parameters>, records?:Array<{path:string, reason:string}> }} o
 *    records  code-owned accounting the CALLER produced before promotion and
 *             cannot compose into the report itself, because the report is
 *             composed here. Today's only producer is the pipeline's scratch
 *             enforcement (`WP-dream-promote-in-workspace`, row G12). Each is
 *             neutralised at composition exactly like this package's own
 *             records (Table R's gate rules). **Round 4's F1: the obligation
 *             existed with no field to travel on**
 *  @returns {{ <the module half's four returned fields>,
 *             report:{outcome:'promoted', bytes:Buffer,
 *                     redaction:RedactionAccounting|null,
 *                     preserved:Array<PreservedCopy>, record:string[],
 *                     accounting:({published:true}
 *                                |{published:false, reason:string})}
 *                   |{outcome:'fallback', bytes:Buffer,
 *                     preserved:Array<PreservedCopy>, record:string[]}
 *                   |{outcome:'refused', reason:string,
 *                     preserved:Array<PreservedCopy>, record:string[]} }}
 *    report  the dream report's own outcome, never folded into `promoted` —
 *            Table R's fallback publish is recorded as itself. **A DISCRIMINATED
 *            UNION: a published arm REQUIRES `bytes`, the refused arm cannot
 *            carry them** (round 2's finding — an optional field spanning
 *            success and refusal guarantees nothing on the successful branch).
 *            The published arms' `bytes` are decided bytes under the module
 *            half's Table S, whose row S6 names their consumers.
 *            On `refused` — and on `promoted` when `accounting.published`
 *            is `false` — the COMPLETE enforcement record is in `record` and
 *            reaches the user through no other channel, and **returning it is
 *            not delivering it** — the caller delivers
 *            (`WP-dream-promote-in-workspace`, row G11).
 *            **`preserved` is on EVERY ARM of this union — the module half's
 *            PRESERVATION RECORD, REQUIRED and possibly EMPTY, for the same
 *            reason its `refused[]` carries one (its Table Q row Q8, which owns
 *            the rule, and row Q9, which owns an entry's fields and which party
 *            fills each of them; neither is restated here, and `PreservedCopy`
 *            is that spec's typedef). **Every field of an entry is a READ in
 *            this package — `remediation` included, which the module half
 *            ASSIGNS at outcome time because the gate reports no value for it
 *            (that spec's row Q9). Entries reach this package complete.** The
 *            report body is a promotion candidate under `reports_dir`, and the
 *            report row below records that EP2 is the one gate that judges a
 *            path there — so the gate can preserve a copy for the body and the
 *            body can then take ANY of the three outcomes. **The union
 *            discriminates on OUTCOME, and preservation is ORTHOGONAL to
 *            outcome, which is why the field is on every arm rather than on
 *            the refused one** (round 3's F1): the gate can REDACT the body,
 *            preserve the unredacted copy, and see the SANITIZED body publish
 *            (`promoted`); it can WITHHOLD the body for a hard secret,
 *            preserve a copy, and the fallback then publishes the code section
 *            (`fallback`); or a preserved body can be refused afterwards by
 *            C4, C7, C8 or any H-rule (`refused`). The body is not a member of
 *            `refused[]`, so without this field on the arm the run actually
 *            took, those copies leave the return entirely. Empty
 *            when the gate preserved nothing for the body, or never ran.
 *            **`redaction` is on the `promoted` arm ALONE, REQUIRED and
 *            NULLABLE** — the module half's REDACTION ACCOUNTING, whose two
 *            fields, their GATE provenance and this very scope are its Table Q
 *            row **Q10**'s; `RedactionAccounting` is that spec's typedef and
 *            its fields are not written out here. Both are a READ in this
 *            package and neither may be recomputed. **The disclosure-parity
 *            ruling of 2026-08-29:** the report body is an ordinary promotion
 *            candidate — the report row below says so as its own heading — so
 *            the accounting reaches it exactly where it reaches an ordinary
 *            note's: on the arm meaning THIS CANDIDATE'S SANITIZED BYTES
 *            PUBLISHED. `promoted` is that arm and the only one: `fallback`
 *            means the brain's body did NOT publish and the code section
 *            published in its place, `refused` means nothing published at all,
 *            and on both a scrubbed-line count would describe bytes no vault
 *            holds — which is also exactly what an ordinary note redacted and
 *            then refused reports, namely nothing, since it lands in
 *            `refused[]` and that array has no accounting field. `null` on
 *            `promoted` states positively that the gate did not redact the
 *            body, which is the common case. **The scope is by MEASUREMENT,
 *            not by symmetry with `preserved`:** a preserved copy exists on
 *            every outcome and must be announced on every outcome, while a
 *            scrub's accounting describes a candidate that exists on one.
 *            **`accounting` is on the `promoted` arm ALONE, REQUIRED, and is
 *            itself a DISCRIMINATED SUB-UNION** — `{published:true}` or
 *            `{published:false, reason:string}` — the fate of the report's
 *            SECOND primitive write, the one that publishes the code-authored
 *            enforcement section on top of the body the first write published.
 *            **Added by the owner ruling of 2026-08-29 (round 4's A1), whose
 *            ruled property is that NO REAL OUTCOME IS SILENT.**
 *            **THE REPORT ROW BELOW IS THE SINGLE OWNER OF THIS CONTRACT, AND
 *            THIS BLOCK RESTATES NONE OF IT — one owner, settled by round 5's
 *            C1.** The two writes, WHICH BUFFER travels in `bytes` on which
 *            form, what each field means, WHO FILLS IT AND WHEN, why the arm
 *            stays `promoted`, and the measurement that scopes the field to
 *            this arm are all decided there. **What THIS block declares is the
 *            TYPE and its two-arm shape, and nothing else** — exactly as it
 *            declares `redaction` without writing out row Q10's fields.
 *            **The per-field-provenance rule that binds this field is
 *            `WP-dream-promote-module`'s Table Q preamble** — it binds every
 *            field of a shape that carries ONE PARTY'S FACTS TO ANOTHER, and
 *            this field is the third such shape — **and the report row is where
 *            this family DISCHARGES it for this field.** **Until round 5's C1
 *            this block and the report row each named the OTHER as owner and
 *            both wrote the fields out in full, which is two deciders and no
 *            owner; this block additionally wrote out what the vault holds,
 *            one of the three things it said it did not restate.** */```

## Contract reference

Activation (ADR-0031, 2-of-7 — four are true): (i) an interface is extended;
(ii) a report outcome taxonomy is introduced; (iv) fallback behaviour is this
package's whole subject; (vi) the pipeline package inherits the contract.

### Contract table(s)

`N/A — this spec's dense contracts are two NAMED canonical tables (N and R)
plus the report row, which is an UNLETTERED contract table, rather than one
unnamed table under this heading.` The report row is the section headed
"The report row" below. Naming a table is what makes its rows
addressable by letter across the whole family
(`docs/specs/logbook/2026-08-29-promote-family-map.md` maps letters to owners),
**and the report row is deliberately outside that scheme — the map lists it
separately, as "Tables N, R and the report row", and this spec claims no
letter for it.**
The heading stays in place rather than being deleted, per
`docs/runbooks/spec-authoring.md`: a section's absence must be visible and
checkable. **The named-table substitution is pre-existing in all three specs of
this family — noted by the round-zero pass of 2026-08-29 and closed then. What
changed on 2026-08-29 is that each spec now states its OWN tables here:** until
then all three carried one byte-identical paragraph, registered by no Mirrored
Surface Checklist, and its claim was false in one of them. **Here specifically it claimed every contract below
was addressable by letter, which the report row is not.**

### The report row — the body is an ordinary promotion candidate

Moved here whole from the module half's Table D by the T1 cut. It is stated as
a row because the module half's Table D owns the gates it refers to:

| Contract | Today | The rule here | Position | Refusal remedy |
|---|---|---|---|---|
| The dream report (owner ruling, 2026-08-27) | `validate.js:1374-1409` — the brain writes the body into the vault, then code APPENDS its enforcement section to that same file | **BRAIN-AUTHORED, and gated like any other file.** The brain writes `<reports_dir>/<date>.md` in the WORKSPACE; `reports_dir` is copied in (sibling Table A) so a same-day second run's existing report is in the baseline. The body is a normal promotion candidate: the delta sees it, C9 admits `reports_dir`, the gates that match it judge it, and it is published by the primitive like any other note. **Read this row against `WP-dream-promote-module`'s Table D: three of its four gates do not match a path under `reports_dir` and pass it through, and that table — not this one, and not anything above this line — is what says which gate applies where.** (Corrected 2026-08-29: this cell was moved here whole by the T1 cut and kept saying "the table above", which in this spec resolves to the Deliverables table.) **Code does not own the body** — the earlier code-owned design is withdrawn because it silently destroyed the `## Gated out (and why)` accounting the shipped skill requires (`SKILL.md:409-425`): that accounting names candidates the brain did NOT write, and **no filesystem outcome can reconstruct a file that never existed.** After promotion, code appends its own measured accounting to the promoted report — a SECOND write through the primitive, with `expect` set to the bytes the first publish returned (the PRIMITIVE's rows H5 and H6), never an in-place append. **THE SECOND WRITE HAS ITS OWN OUTCOME, AND IT IS NEVER SILENT — this row is where that contract is DECIDED (owner ruling, 2026-08-29, round 4's A1).** The first write publishes the body; the second publishes body-plus-section. The two can disagree, and the state in which the FIRST succeeded and the SECOND was refused — by the primitive's H5 `expect` guard, by a symlinked target under its H3, by any of its H-rules — is a real outcome the union carried NOWHERE before this ruling. It is **`outcome:'promoted'` with `accounting:{published:false, reason}`**: the body IS in the vault, so this is not `fallback` (which means the body did NOT publish) and not `refused` (which means nothing published). **WHICH BUFFER TRAVELS IN `bytes`, and the claim is about what THIS RUN PUBLISHED rather than about what the vault holds now:** on `accounting:{published:true}` it is the SECOND write's returned buffer, on `accounting:{published:false}` the FIRST write's. Neither is ever a fresh read, and which of the two travels to the caller is decided here because `WP-dream-promote-module`'s Table S row S5 puts this two-write sequence in this package (its rows S1 and S4 still govern what either buffer must be). **THE QUALIFIER IS ROW S1's OWN AND IT IS LOAD-BEARING — "the only bytes the vault is KNOWN TO HOLD AT PUBLISH TIME" — and the unqualified form is FALSE BY CONSTRUCTION on the `published:false` form, for the very refusal that produced it (round 5's C5, filed by BOTH gates independently, the first such overlap in this loop):** the primitive's H5 abandons the second write unless the target STILL holds exactly the `expect` bytes, so an `expect` conflict MEANS the vault no longer holds the first write's buffer — it holds whatever intervened — and under its H3 a symlinked report target is a symlink and not those bytes at all. **NO SURFACE MAY SAY THIS ARM's `bytes` IS BYTE-EQUAL TO WHAT THE VAULT THEN HOLDS.** What IS true on this form, and what this arm states positively: **the enforcement section never reached the vault, and `bytes` is the body this run published — the bytes any commit of this path must carry (`WP-dream-promote-in-workspace`, row G8), never a re-read.** **THE RULE THIS CONVERGES ON IS TABLE R's R4 RULE, APPLIED DELIBERATELY AND NOT VERBATIM:** the COMPLETE enforcement record goes to the caller in `report.record` for the run's log and output, and the refusal NAMES ITS REASON — carried from the primitive (its row H7), never composed here. **R4's OUTCOME CLAUSE — "the vault object is left untouched" — DOES NOT HOLD HERE AND MUST NOT BE COPIED:** R4 was written for a refusal of THE report write, where no byte of this run's report reached the vault; here the first write already published the body, so the truthful statement is the positive one above — what the vault HOLDS — and not an untouched-vault claim. **`preserved`, `record` and `redaction` are unchanged on this arm**: the body published, so row Q10's carrier rule still reaches it (`WP-dream-promote-module`, row Q10) and this outcome widens nothing. **THE SCOPE IS BY MEASUREMENT, not by symmetry, and the measurement is stated here because this row owns it:** `promoted` is the only arm whose sequence is TWO writes, so it is the only arm on which a second write can be refused after a first has succeeded — Table R's fallback publishes in ONE write and `refused` publishes nothing at all, and a refusal on either of those IS the arm, governed by Table R's row R4. **PER-FIELD PROVENANCE IS DECIDED HERE AND NOWHERE ELSE** — `WP-dream-promote-module`'s Table Q preamble binds the rule to every field of a shape that carries ONE PARTY'S FACTS TO ANOTHER and names this field as the third such shape, and this row is where the family discharges it: **`published` — FILLED BY THIS PACKAGE, AT SECOND-WRITE TIME**, `true` when the primitive returned for that write and `false` when it refused; **`reason` — ORIGINATING WITH THE VAULT-WRITE PRIMITIVE** (Table H, its row H7, which returns `{written:false, reason}`) **AND CARRIED UNCHANGED BY THIS PACKAGE, AT SECOND-WRITE TIME**, on the `published:false` form ALONE and required there, this package composing no reason of its own for that write and never recomputing one. **The TYPE carries that provenance BY DISCRIMINATION rather than by a base/extension split, and it is stated rather than left to symmetry:** the module half's `GateReportedCopy`/`PreservedCopy` split exists because ONE shape carries two parties' fields at once, whereas here the primitive's field exists on exactly the form where the primitive refused — a single `reason` spanning both states would be the guarantees-nothing shape that spec's Table S row S2 records. **`### Exact contracts` DECLARES THE TYPE AND RESTATES NONE OF THIS (round 5's C1):** until that finding both surfaces named the other as owner and both wrote the fields out in full. **DOWNSTREAM, because an outcome nothing handles is silent by another route:** `WP-dream-promote-in-workspace`'s row **G8** commits the report path from this arm's `bytes` on BOTH forms of `accounting`, and its row **G11** delivers `report.record` on the `published:false` form exactly as it delivers R4's. **The appended section is neutralised at composition time, per Table R's gate rules, which govern it here exactly as they do on the fallback branch.** **The fallback — whenever the brain-authored body is NOT successfully published, for ANY reason — is Table R**, which this row does not restate. **The trigger is stated as a complete class, not a list:** an earlier form said "when a gate refuses the body, or no body exists", which silently excluded the promotion-decision refusals (C4, C7, C8) and the primitive's own refusals (its H5 `expect` guard, its H3 symlinked target). On any of those the body is unpublished with no gate involved, and under the narrow trigger the enforcement record had nowhere to go | judged with the rest, before the append | the body is refuse-and-reported like any note; the code section is then published on its own — **and if THAT write is refused too, Table R's R4 governs: vault untouched, record returned in `report.record` for the caller's log and output, reason named.** This row does not restate R4. **A refusal of the SECOND write on the NORMAL path is a DIFFERENT case and R4 does not govern it** — there the body has already published, the vault is not untouched, and the outcome is the `accounting:{published:false, reason}` this row's rule cell decides |

### Table N — the neutralisation contract: which channels, which transformation, in which order

**Extracted by the ADR-0031 circuit-breaker.** Two consecutive rounds landed an
A-band finding on one rule — first that it named no ORDER, then that its named
value SET was incomplete. The breaker's prescription is not discretionary: stop
patching and pull the contract into one canonical table. **A third edit to a
hand-maintained list was rejected for the reason the second finding's own lesson
line states — "an 'every interpolated value' rule plus an explicit named list is
only as strong as the list".**

**THE CONTRACT IS AN OBSERVABLE PROPERTY, AND THE MECHANISM IS THE
IMPLEMENTER'S (owner ruling, 2026-08-29):**

> **Every interpolated string that is attacker-influenceable OR UNCLASSIFIED has
> passed redact-then-sanitize before composition. A string the implementation
> has not classified FAILS CLOSED — it is neutralised, or composition refuses.**

**The quantifier is deliberate and was corrected once (round (f)):** an earlier
form said "every string", which **contradicted this table's own rows** —
`redaction.labels` and `redaction.lines` are classified as needing nothing, so an
implementation following the
rows violated the universal and one following the universal violated the rows. A
universal its own classification contradicts is not a strong rule, it is an
unbuildable one.

**How that is achieved is not specified here.** An earlier form of this block
claimed the value set was "derived from the return shape" so that a new channel
could not exist without a row. **That was a MECHANISM prescribed from reading, and
it does not work in this repo: the contract is JSDoc in plain JavaScript, where
type information does not exist at runtime, and an actual returned object exposes
only the fields populated on that execution — not every declared field, and not
every arm of the report union.** The claim is withdrawn; the property below is
what replaces it, and it is checkable without prescribing how.

**The rows below are the CLASSIFICATION, not the enforcement.** They say which
channels are attacker-influenceable and what each therefore needs. The
enforcement is the fail-closed default plus the acceptance criterion, which is
what makes an unclassified channel a test failure rather than a silent
pass-through — the defect both prior A-bands shared.

| Channel (a field of the return shape or of `records`) | Origin | Attacker-influenceable? | Transformation |
|---|---|---|---|
| `refused[].rel` | the brain chose the path | **YES** | **redact, then sanitise** |
| `refused[].reason` | code-composed, but embeds brain-chosen path text — C1's allowlist refusal, and the primitive's rows H7 and H9 naming a surviving object | **YES** | **redact, then sanitise** |
| `redacted[].rel` | the brain chose the path | **YES — and this is the channel round (d) found leaking**, because the redaction line existed while the list named only the refusal fields | **redact, then sanitise** |
| `preserved[].artifact`, wherever a preservation record travels — on `redacted[]`, on `refused[]`, and on the `report` arm WHATEVER ITS OUTCOME (round 3's F1: this enumeration named the refused arm alone while the published arms preserve too) | the quarantine basename, DERIVED from the brain-chosen path (module half, Table Q rows Q2 and Q9) | **YES, by derivation** — the primitive's own sanitising of the name is not this contract's guarantee, and a value derived from attacker text is treated as attacker text | **redact, then sanitise** |
| `preserved[].location` | the state-relative directory the GATE reports for that copy — one of the two places the glossary's **secret quarantine** names, a code-owned closed set (module half, Table Q row Q9) | **NO** | none — **and stated rather than omitted**, for the reason the `labels` row gives: a channel with no row is indistinguishable from a channel nobody thought about |
| `preserved[].remediation` | one of two code-owned values the MODULE half ASSIGNS at outcome time, the gate reporting none (module half, Table Q row Q9, which owns the per-field provenance) | **NO** | none — same reason |
| `redaction.labels`, wherever a redaction accounting travels — on a `redacted[]` entry and on the `report` arm's `promoted` form (module half, Table Q row Q10, which owns both the fields and that scope) | detector names from a code-owned closed set, never the matched bytes | **NO** | none — **and stated rather than omitted**, because a channel with no row is indistinguishable from a channel nobody thought about, which is exactly how round (d)'s finding arose |
| `redaction.lines`, on the same two carriers | a count | **NO** | none — same reason |
| `records[].path`, `records[].reason` | the CALLER's pre-promotion accounting; today the pipeline's scratch enforcement, whose paths are filenames the brain wrote | **YES** | **redact, then sanitise** |
| `accounting.reason`, on the `promoted` arm's `published:false` form (the report row) | COMPOSED BY THE VAULT-WRITE PRIMITIVE (its row H7) and carried unchanged by this package; the primitive's rows H7 and H9 name a surviving staging object or directory, whose name derives from the brain-chosen path | **YES, by derivation** — the same classification `refused[].reason` carries and for the same reason, and a value derived from attacker text is treated as attacker text | **redact, then sanitise, wherever it is rendered.** **Its DELIVERY on that form is the run's log and output rather than the composed section** (`WP-dream-promote-in-workspace`, row G11) — the write carrying the section is the very one that was refused — so what reaches it is row N2's fail-closed default. **Classified rather than omitted (round 5's N1):** the field was added by round 4's A1 and this table had no row for it, which is the state row N1's own ground calls indistinguishable from a channel nobody thought about |
| **any string the composer interpolates that is not classified above** | — | **treated as YES — the classification is not a permission list** | **redact-then-sanitise, or composition REFUSES. This is the fail-closed default and it is the contract's actual enforcement**, not a note about the rows above: a channel nobody classified must not be able to reach the report unneutralised, and that is exactly how both prior A-bands leaked |

| Rule | Value |
|---|---|
| N1 — **THE ORDER: redact first, then sanitise** | EP2's context-dependent detectors need the RAW bytes, separators included, and `sanitizeProjectName` replaces every character outside `[\p{L}\p{N}\p{M} ._-]` — `=` and `:` among them. **Measured:** `refused token=abcdefghijkl` sanitises to `refused token_abcdefghijkl`, and the detector that fires on the first does not fire on the second. **The justification for the reverse order, corrected to what was actually measured (round (d)):** it is NOT that the redaction placeholder survives the sanitiser unchanged — measured, `[REDACTED:generic-secret]` becomes `REDACTED_generic-secret_`. **It is that sanitising a placeholder cannot restore the secret the redactor already removed.** The earlier "sanitizer-neutral" wording was asserted from reading rather than running, and is withdrawn |
| N2 — **The default is FAIL CLOSED, and it is the enforcement** | an unclassified string is neutralised or composition refuses. **A universal that depends on someone remembering to extend a list is what failed twice; a default that must be argued DOWN cannot fail the same way.** This row is the whole contract in one line, and everything above it is classification that makes the common cases explicit |
| N3 — **Scope: wherever the section is composed** | the normal second write and Table R's fallback alike, since the same interpolation happens in both |
| N4 — **What the contract buys** | **the code-authored section can never carry bytes any gate would refuse, so no gate exemption exists and none is needed.** This sentence is load-bearing and it has been FALSE twice — once under an unordered rule, once under an incomplete set. **Its prerequisites are the ones that exist: N1's ORDER, N2's FAIL-CLOSED DEFAULT, and the acceptance criterion — not the withdrawn "derived value set", which round (f) found this row still leaning on after the preamble had retired it** |

### Table R — the report's publish decision

**Trigger:** Table R governs whenever the brain-authored report body is not
successfully published — a gate refusal, no body at all, a promotion-decision
refusal (C4, C7, C8), or a primitive refusal (any H-rule). **One class, not a
list.**

**PRESERVE-AND-EXTEND. The fallback preserves BOTH values at stake — the report
already in the vault AND this run's enforcement record — and never chooses
between them.** The shape is the normal path's second write, generalised: read
the vault's current report bytes, compose IN MEMORY (what is there, plus this
run's enforcement section appended), publish the whole as ONE write through the
primitive with `expect` set to the bytes just read. No new mechanism and no new
naming: the only difference from the normal second write is that the base is
"what the vault currently holds" rather than "what we just published".

| # | The vault's report for this date, at fallback time | Candidate bytes | `expect` | Outcome |
|---|---|---|---|---|
| R1 | ABSENT | the code section alone | absent | published |
| R2 | PRESENT and byte-equal to what the fallback read | the read bytes + this run's section appended | the read bytes | published; run 1's report preserved intact |
| R3 | PRESENT but DIVERGED from any expectation — the user edited it since run 1 | **the bytes ACTUALLY there** + this run's section appended | the bytes read now | published. **The fallback never reconstructs or "corrects" existing content** — R3 is the same rule as R2, stated separately only because the instinct to repair a diverged file is what would break it |
| R4 | mutates between the read and the publish — **or the primitive refuses the write for ANY other reason: a symlinked target under the primitive's H3, containment, policy, any of its H-rules** | — | the read bytes | **refused.** The enforcement record then goes back to the caller in `report.record`, for the run's log and output, NOT the vault. **NAMED RESIDUAL, accepted by ruling:** in this narrow window an overwrite would be the worse failure, because it would clobber the user's live edit. **Every refusal path THIS TABLE GOVERNS converges on this ONE outcome — the vault object is left untouched, the complete enforcement record is delivered to the caller, and the refusal names its reason.** **The QUANTIFIER is Table R's own, NARROWED 2026-08-29 by round 4's A1, and the narrowing is the whole point:** on the NORMAL path the second write can be refused after the body has already published, and there the vault object is NOT untouched — it holds the published body. That outcome is the report row's (`accounting:{published:false, reason}` on the `promoted` arm), it carries this row's RULE — the complete record to the caller's log and output, the reason named — and it does not carry this row's untouched-vault clause. A surface that copies the clause onto it states a falsehood about the user's vault. A symlinked report target is additionally a suspicious state, and surfacing it beats overwriting anything. Rejected for the record: **writing through the symlink** (overwrites a different user note — the acceptance criterion below rightly goes RED on it); **replacing the symlink with a regular file** (a code decision mutating the user's vault structure); **a different filename** (a new product surface) |

| Rule | Value |
|---|---|
| Gates — **owner ruling, 2026-08-27; two rules, neither flagged option alone** | **(1) The PRESERVED REGION is not re-gated.** Gates guard content ENTERING the vault, not content residing in it. The preserved bytes are already vault content and stay byte-identical; re-scanning them protects nothing — that content is already exposed — while it can destroy the enforcement record or mutate user-edited bytes, which R3 forbids. **(2) The CODE-AUTHORED SECTION is neutralised at COMPOSITION time.** **TABLE N owns which channels are neutralised, with what, and in what order, and this rule does not restate it.** Two A-band findings came from this rule trying to carry that contract inline — first with no order, then with an incomplete set — which is why it was extracted. **WHICH values, with what, and in what order is TABLE N's — cited, never restated here. An earlier form of this cell hand-listed `r.path` and `r.reason`, and that list was already stale against Table N's own rows the day it was written (round (e)); a member list in a citing surface is the defect, not the shorthand** — measured, today's enforcement line interpolates two values, not one (`validate.js:1385-1386`), and under this design a refusal REASON carries brain-chosen path text too (C1's allowlist refusal, and the primitive's rows H9 and H7, which name in the refusal a directory or a staging object). An earlier form said "`r.path` and kin", which quantifies over nothing — and this universal is what justifies having no gate exemption, so an unneutralised reason channel would make that justification false. A redacted path still serves the record: "`sk-…[redacted]` — refused: secret-shaped path" says everything the user needs without the secret. **Scope: this rule governs the code-authored enforcement section WHEREVER it is composed — the normal second write and this fallback alike**, since the same interpolation happens in both |
| The observable property the two rules buy | **Table N, row N4 owns this claim and its history** — it has been false twice, and N4 names its own prerequisites. This row does not restate them |
| Measured cost of rule (2), named rather than absorbed | the shipped sanitizer is `sanitizeProjectName` (`digest.js:414-418`, exported at `:867`), built for display NAMES: it replaces every character outside `[\p{L}\p{N}\p{M} ._-]` with `_`, **path separators included**. Measured: `01-Projects/customer/note.md` → `01-Projects_customer_note.md`. The refused note stays identifiable, which is what the record is for, but the line is no longer a copy-pasteable path. **Accepted as stated, not silently**: swapping in a path-preserving sanitizer would be a new product surface, and the ruling chose the shipped one. **Under the ruled order this cost is unchanged and its cause is now visible: the same character class that flattens a path is what would flatten a secret's separator, which is exactly why the sanitizer runs second** |
| The redaction lines — **TWO sources, ONE shape, by the disclosure-parity ruling of 2026-08-29** | one line per entry of `redacted[]`, **and one line for the REPORT PATH when the `report` arm is `promoted` and its `redaction` is non-null**, each carrying the path, the scrubbed-line count and the labels read off that source's own `redaction` field — the module half's `RedactionAccounting`, whose two fields, their GATE provenance and their permitted carriers are its Table Q row **Q10**'s and are restated in neither source — and **each ENTRY of that path's preservation record, read field by field — its `artifact`, its `location` and its `remediation`** (module half, Table Q rows Q1–Q3, Q9 and Q10; `preserved` is an array and it is its ENTRIES that carry those fields, the record itself carrying none — round 3's F9. How many entries an arm holds is row Q9's and not this row's: the redact arm preserves one). **BOTH sources compose the SAME line from the SAME shape, and that is what parity of disclosure means here** — it is also why the accounting is ONE named field rather than two loose ones, because two look-alike field pairs would be two shapes. **An earlier form of this row was scoped to `redacted[]` alone**, which left a body the gate redacted and promotion published sanitized with no line at all — round 3 named it a residual and the ruling closed it. **NEITHER VALUE MAY BE RECOMPUTED HERE** (row Q10): only the gate held the pre-scrub bytes. **Table Q owns why this is data-loss-critical and what each field means; this row restates neither, and in particular it does not decide the guidance — `remediation` carries it.** Composed wherever the enforcement section is composed (Table N, row N3); the `report` source rides the normal second write, `promoted` being by construction an arm on which the body published — **and when that second write is REFUSED the line travels in `report.record` rather than into the vault, which the report row owns and this row does not restate.** **THE PARTITION, stated here as well as in the preserved-copy row below, because it is a TWO-SIDED rule and a checklist that protects it needs both sides to carry it (round 4's F-7):** every preserved copy is rendered EXACTLY ONCE, and the partition is over whether that copy's PATH HAS A REDACTION ACCOUNTING — never over the outcome, and no longer over where the entry sits. A copy on a `redacted[]` entry, and a copy on a `report` arm that is `promoted` with a non-null `redaction`, are rendered HERE; every other copy is the preserved-copy row's |
| **The preserved-copy line on a REFUSAL — added by the Table Q reconciliation pass, 2026-08-29, and re-cut by the shape ruling of the same day** | one line per entry of a preservation record that is not on a `redacted[]` entry, naming the path and reading the entry's `artifact`, `location` and `remediation` off it, **from BOTH of its sources: every `refused[]` entry, and the `report` arm's own record WHATEVER THAT ARM'S OUTCOME — save the copies the redaction-lines row above already names, per the partition stated below.** Both, because the report body is subject to the identical sequence and is not a member of `refused[]`: it is a promotion candidate under `reports_dir`, the report row above records that EP2 is the one gate that judges a path there, so the gate can preserve a copy for the body and the body can then be published sanitized, replaced by the fallback, or refused by C4, C7, C8 or an H-rule. **The arm's OUTCOME does not decide whether the line exists — preservation is orthogonal to outcome, which is round 3's F1 and is why the module half's row Q8 quantifies over arms that exist after a preservation rather than over refusals.** **The line names the path and the entry's fields and nothing else.** Until the disclosure-parity ruling of 2026-08-29 that was FORCED — the `report` union carried no scrubbed-line count and no labels at all, on any arm — and it is now a CONSEQUENCE OF THE PARTITION rather than a limitation: a body the gate redacted and promotion published sanitized is the redaction-lines row's, and every copy that still reaches THIS row sits on a path with no accounting to name (module half, row Q10, which owns why a refused path has none). A row scoped to `refused[]` alone left the report's own copy unannounced, found by the round-zero pass of 2026-08-29, one surface over from the defect that created this row. **THE TWO SOURCES ARE SCOPED DIFFERENTLY, and conflating them was a defect this row carried for one round (round-2 coherence, C-2):** the `refused[]` lines are composed **wherever the enforcement section is composed — the normal second write and the fallback alike (Table N, row N3)** — because a refused path with a preserved copy is the ORDINARY case and occurs on runs where the report body publishes perfectly well; scoping them to the fallback left the common case with no surface saying who writes the line. The `report` arm's line travels with the enforcement section too, on whichever write carries it — the normal second write when the body published sanitized, the fallback when the fallback fired, and `report.record` when the write that would have carried it was REFUSED — **which is TWO states and not one (round 5's C2): Table R's row R4, where no write published at all, AND the normal path's SECOND write refused after the first published the body (`accounting:{published:false}`, the report row's outcome), where the body IS in the vault and the section is not.** **An earlier form said "when every write was refused", which is false on the second state: this row is the STRUCTURAL TWIN of the redaction-lines row above, that row was given exactly this sentence in the same window, and this one was not.** **An earlier form of this sentence put that line on the fallback branch "by construction"; that was true only while the arm carrying a copy was the refused one (round 3's F1).** **Each preserved copy is rendered exactly once, and the partition is over WHETHER THAT PATH HAS A REDACTION ACCOUNTING, not over the outcome and no longer over where the entry sits — re-cut by the disclosure-parity ruling of 2026-08-29, which gave one `report` arm an accounting and so made the old partition send that arm's copies to the wrong row:** a copy on a `redacted[]` entry is the redaction-lines row's, always, because membership of that array IS a redaction; a copy on the `report` arm is that row's TOO when the arm is `promoted` with a non-null `redaction`; every other copy — on a `refused[]` entry, or on a `report` arm carrying no accounting — is this row's. **The guidance is NOT decided here and is NOT restated here — it is READ from the entry's `remediation`, whatever that entry holds.** The values, which arm takes which, their grounds, and the fact that the module half ASSIGNS the field at outcome time are all `WP-dream-promote-module`'s Table Q row Q9. **An earlier form of this cell restated the values and their rationale (round 3's F7) — which re-created, in the one surface that says it does not decide the guidance, the second independent statement the field exists to remove.** **Why the line exists at all:** the gate wrote those copies before promotion knew the path would be refused, a copy on the redacted shelf carries no digest banner, and the path is not in `redacted[]` — so without this line an unredacted copy of secret-shaped content sits unannounced until retention silently removes it (module half, Table Q rows Q3, Q8 and Q9, which own all three facts). **Every field is READ FROM THE TYPED RECORD; this row may not recover one from `reason`** — measured in the module half's own PR gate, a prose carrier on a paired refusal named the SIBLING's copy first. Neutralised at composition exactly like every other channel (Table N) |
| Accounting | the run's accounting states plainly that the brain's body was refused, and why. A fallback publish is never recorded as a normal report promotion — `report.outcome` carries it as its own value (`### Exact contracts`) |
| Rejected alternatives, recorded so they are not re-proposed | On the fallback shape: **overwrite** (loses run 1's report); **a distinct filename for the fallback** (a new product surface for a rare failure branch); **silent refusal** (loses the enforcement record — the very thing this branch exists to deliver). On the gate question, both of the options the author's flag named, rejected as insufficient ALONE: **exempting the code-authored section from the gates** (opens an unscanned brain-influenced channel into the vault — `r.path` is attacker-influenceable, so a secret in a filename would ride through), and **sanitizing alone** (a secret-shaped path, or user-edited preserved bytes, could still get the whole report withheld — the record dies either way) |

**The author's flag that opened this question is RESOLVED by the ruling above,
and is kept as the record of how it was found.** Measured, and both facts still
hold: the enforcement section interpolates `r.path` (`validate.js:1385-1386`), a
vault-relative path the BRAIN chose, so its content is attacker-influenceable;
and today's code appends the report **after** the EP2 gate deliberately, saying
so in as many words (`:1375-1377`). The collision was real: scanning the composed
report could withhold or redact the enforcement record on exactly the branch that
exists to deliver it. **What the ruling changed is that the question dissolves
rather than being traded off** — neutralise at composition and there is nothing
left for a gate to refuse.

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells
- [ ] `### Exact contracts`' `records` input and `report` return union
- [ ] Acceptance criteria that assert the report row and Table R
- [ ] Verification steps
- [ ] Current-state description (today's report handling, the sanitizer, the
      layout) **and the description of `promote()`'s RETURN, which is a Table Q
      mirror — registered 2026-08-29 by round 4's F-5, having been an
      unregistered mirror since it was written; `WP-dream-promote-module`'s
      Table Q checklist entry names it too**
- [ ] Implementation notes and the Security checklist
- [ ] Out of scope (what the module half, the pipeline half and the
      residue-lifecycle successor own)
- [ ] **The package note, the dispatch-precondition block and
      `### Contract table(s)`** — all three cite the canonical table-letter map;
      the `### Contract table(s)` line additionally names THIS spec's own tables
      and is the surface a moved table falsifies first (registered 2026-08-29).
      The note mirrors the citation of the canonical table-letter map and the consumed-by-nothing
      rule; the dispatch block mirrors the pinned base and the containment
      citation
- [ ] **The `report` union's arms** — `### Exact contracts`, Table R's four
      rows, Table R's preserved-copy row (the union's `preserved`), the
      module half's Table S row **S3**, and `WP-dream-promote-in-workspace`'s
      rows G8 and G11. **No surface may make `bytes` optional across the union,
      none may describe RETURNING the enforcement record as delivering it, and
      none may omit `preserved` from ANY arm** — it is required and
      possibly empty on all three for the same reason it is on `refused[]`
      (module half, Table Q rows Q8 and Q9), because the union discriminates on
      OUTCOME while preservation is orthogonal to outcome. **No surface may
      scope a preserved copy of the report body to the refused arm** — that
      scoping was round 3's F1. **The `redaction` field is registered here too,
      and its rule is the OPPOSITE quantifier, measured rather than mirrored
      (disclosure-parity ruling, 2026-08-29): it is on the `promoted` arm ALONE,
      required and nullable, because that is the one arm meaning the brain's
      body published — no surface may put it on `fallback` or `refused`, none
      may split it back into two loose fields, and none may recompute either
      value** (module half, Table Q row Q10, which owns the fields and the
      scope). **Nor may any surface here write out the
      FIELDS of the module half's returned shapes or of ANY of its THREE
      typedefs — `GateReportedCopy`, `PreservedCopy` and
      `RedactionAccounting`**: naming them is this package's job and restating
      them is how they went stale twice. **Three, not two (round 4's F-6):**
      `GateReportedCopy` was declared in the same window in which this count was
      written, so a prohibition naming two left the GATE's half of the record
      writable out here. This package READS only the completed `PreservedCopy`,
      which is why `### Exact contracts` names six shapes it reads while this
      prohibition covers seven.
      **The `accounting` field on the `promoted` arm is registered here too
      (owner ruling, 2026-08-29, round 4's A1).** **THE OWNER IS THE REPORT ROW's
      RULE CELL — one owner, named between the mirrors rather than left to be
      inferred (round 5's C1): that cell and `### Exact contracts` each named
      the OTHER as owner while both wrote the fields out in full, and this entry
      listed both as mirrors and named no owner between them.** `### Exact
      contracts` declares the TYPE; the rule cell decides everything else.
      Its mirrors are `### Exact contracts`, the report
      row's refusal-remedy cell, **Table R's row R4 (whose
      untouched-vault clause is scoped AWAY from it)**, **Table R's
      redaction-lines row (its sentence on the line travelling in
      `report.record` when the second write is refused) and Table R's
      preserved-copy row (its travel enumeration, which must name BOTH refusal
      states) — registered 2026-08-29 by round 5's C2, having been mirrors from
      the day they were written**, **Table N's `accounting.reason` channel row
      (round 5's N1)**, the Security checklist's
      refusal item, the report-refusal acceptance criterion's case (b),
      **the preserved-copy announcement criterion's channel disjunction (round
      5's H5)**, and
      `WP-dream-promote-in-workspace`'s rows **G8**, **G11** and **V4**, whose
      own side of the registration is that spec's checklist entry for the
      partially published report.
      **SEVEN prohibitions, each earned by a finding, and the last three by
      round 5:** no surface may describe the `promoted` arm as a complete report
      without saying what happened to the SECOND write; no surface may classify
      a published-body/refused-accounting run as `fallback` or `refused`; **no
      surface may copy R4's "the vault object is left untouched" onto this
      outcome** — the body published, and the true statement is what THIS RUN
      PUBLISHED; no surface may widen row Q10's carriers because of this field —
      the body published on BOTH of its forms, so `redaction` stays exactly
      where row Q10 put it; **no surface but the rule cell may state this
      field's PER-FIELD PROVENANCE** — `WP-dream-promote-module`'s Table Q
      preamble binds the rule and names this as the third shape it binds, and
      one shape has one discharging surface; **no surface may assert this
      arm's `bytes` is BYTE-EQUAL to what the vault then holds** — the refusal
      that produces the form can be, and on an `expect` conflict IS, the vault
      no longer holding those bytes (round 5's C5); **and a surface enumerating
      where the record TRAVELS on a
      refusal states BOTH refusal states or it is wrong** — the write that
      published nothing, and the second write refused after the first published
      the body (round 5's C2). **The count is stated because this checklist has
      carried a stale one before; seven, counted against the list above.**
- [ ] **Table R's four cases and its named residual** — the report row (which
      cites, never restates), and the acceptance criteria
- [ ] **Table N — the neutralisation contract.** Its mirrors are Table R's gate
      rule (2), Table R's observable-property row (which defers to N4), the
      **redaction-lines row (which cites row N3 for its composition scope)**,
      **Table R's preserved-copy row (which ends "Neutralised
      at composition exactly like every other channel (Table N)" and whose
      `refused[]` half cites row N3 for the same scope — registered
      2026-08-29, having been an unregistered mirror since the round it was
      added; naming the redaction-lines row twice in this list was round 3's
      F8)**, the `records` input in `### Exact contracts`, and the
      code-authored-section criterion. **Three prohibitions, each earned by a
      finding: no surface may state a neutralisation rule without its ORDER; no
      surface may carry a hand-listed value set, because a list in a citing surface
      goes stale — measured, two did (round (e)); and no surface may restate
      N4's justification, which has been false twice and whose prerequisites N4
      itself names.**
- [ ] **The redaction lines AND the preserved-copy line, each from BOTH of its
      sources, and the PARTITION between the two rows** — Table R's two rows for
      them, **the ONE acceptance
      criterion that asserts them (`- [ ] EVERY preserved copy is announced…`).
      That criterion asserts the REDACTION LINES too, from round 3's F11
      onward: the line is composed here, so it is asserted here, and the module
      half's criterion asserts only the record its RETURN carries. Naming two
      criteria here was a miscount this checklist carried until 2026-08-29, and
      delegating the redaction line's assertion to a package that composes no
      report was the error underneath it.**
      The mirrors also include the `preserved` on every arm of the report union in
      `### Exact contracts`, **Table N's
      three channel rows for the record's fields — `preserved[].artifact`,
      `preserved[].location` and `preserved[].remediation`** — and the module
      half's **Table Q**, which owns the metadata both carry (rows Q1–Q3 for the
      first, rows Q8 and Q9 for the second, row Q9 for every field of every
      entry AND for which party fills each field and when, and **row Q10 for the
      redaction accounting, its two gate-filled fields and the arms that may
      carry it**). **Registered 2026-08-29 by the disclosure-parity ruling:**
      the redaction-lines row's SECOND source (the `promoted` arm's
      `redaction`), the `redaction` on that arm in `### Exact contracts`, and
      **Table N's two channel rows for `redaction.labels` and
      `redaction.lines`, which are quantified over both carriers**. **The
      PARTITION between the two rows is a mirror in its own right and both rows
      state it: a copy whose path has a redaction accounting is the
      redaction-lines row's, every other copy is the preserved-copy row's, and
      no surface may re-cut it back to "where the entry sits" — that form sent
      the `promoted` arm's copies to the wrong row.** **No surface here may decide a copy's remediation guidance: it is
      READ from the entry's `remediation`, which the module half ASSIGNS at
      outcome time (its Table Q row Q9 owns who fills each field and when).** **This package cites Table Q and never
      restates the quarantine lifecycle** — and the DURABLE half of that
      lifecycle is not even the module half's: the retention prune, the
      identity-gated deletion and the preservation-failure abort are decided in
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, whose table letters
      collide with this family's, so it is cited by spec path and never by bare
      letter. **WHICH letters collide is the canonical map's
      (`docs/specs/logbook/2026-08-29-promote-family-map.md`); this surface does
      not list them.** **No surface here may read any field of a
      preserved copy out of a refusal reason.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing outlives the job.
- **The fallback is the normal path's second write, generalised** — read, compose
  in memory, publish once with `expect` set to what was read. Resist inventing a
  second mechanism for it; the only difference is what the base bytes are.
- **Do not build a containment check**, and do not re-implement a publish path:
  both are the primitive's (Table H).
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] **The code-authored section is neutralised at composition time — Table N
      owns which channels, what transformation and in what order, and this item
      does not restate its members.** What this item asserts is the consequence:
      **the no-gate-exemption justification is true only while Table N's property
      holds**, and an unclassified channel reaching the report unneutralised
      makes it false. **This item hand-listed two channels until round (e), and
      that list was stale against Table N's own rows** — which is why it cites.
- [ ] **The preserved region is not re-gated.** Gates guard content ENTERING the
      vault, not content residing in it; re-scanning bytes already in the vault
      protects nothing and can destroy the enforcement record or mutate
      user-edited bytes.
- [ ] **Every report write goes through the primitive** — the promoted body, the
      appended accounting and the fallback publish alike. A symlinked report
      target is refused (Table H, the PRIMITIVE's row H3), not written through.
- [ ] **A refusal must cost the user nothing**: on every refusal path the
      complete record still reaches the caller, and the vault holds only bytes
      this run gated and published through the primitive. **TWO SHAPES, and the
      second made this a false universal until round 4's A1:** on a refusal of
      the report write (Table R, row R4) the vault object is byte-unchanged; on
      a refusal of the NORMAL path's SECOND write the ENFORCEMENT SECTION never
      reached the vault and `report.bytes` is the body the FIRST write published
      (the report row), which is not "byte-unchanged" and may not be asserted as
      such. **AND IT MAY NOT BE ASSERTED AS BYTE-EQUALITY WITH THE LIVE VAULT
      EITHER (round 5's C5):** on the `expect`-conflict cause the vault no
      longer holds the first write's buffer — that IS why the primitive refused
      (Table H, the PRIMITIVE's row H5) — and a symlinked target is a symlink
      and not those bytes. What this item asserts on that shape is the two
      things that stay true: the complete record still reaches the caller, and
      the vault holds no byte this run did not gate and publish through the
      primitive.

## Acceptance criteria

- [ ] **The brain's report body survives end to end, and a same-date second run
      lands.** A brain that writes a report containing a `## Gated out (and
      why)` section sees that section, byte-for-byte, in the published report —
      with the code's own accounting appended below it. Proven RED against a
      code-composed report, which drops the section entirely. Asserted again for
      two runs on one date: the second finds the first's report in the baseline
      and promotes a rewritten body; neither run refuses the report for
      existing, and no append-in-place is used.
- [ ] **The refused-body fallback preserves both values, and is accounted as
      itself (Table R).** One case per row: **R1** with no report for the date,
      the code section alone is published; **R2** with run 1's report present,
      that report is byte-preserved and this run's section appended below it;
      **R3** with the report user-edited since run 1, the USER's bytes are
      preserved verbatim and appended to — the criterion goes RED against any
      implementation that reconstructs or repairs the diverged content; **R4**
      with the file mutated between the read and the publish, the write is
      refused, the vault keeps the user's bytes, and the enforcement record is
      returned in `report.record`. **No case may lose both values, and no case
      may silently lose either.** In every case `report.outcome` records the
      fallback as itself and the brain's body as refused with a reason, never as
      a normal promotion.
- [ ] **Every unpublished-body path enters the fallback.** Not only a gate
      refusal: with a **C4** conflict (the user creates a report at that path
      during the run) and with a **PRIMITIVE's H5** refusal (the target changes
      between decision and publish), the fallback fires in both cases. Proven RED
      against an implementation whose trigger is the gate-refusal case alone,
      which preserves the report and drops the record.
- [ ] **EVERY preserved copy is announced — a redaction's, a refused path's,
      and the REPORT body's on any outcome (Table R's redaction-lines and
      preserved-copy rows; module half, Table Q rows Q1–Q3, Q8, Q9 and Q10).**
      **The REDACTION lines are asserted here, and here only, from BOTH of
      their sources:** with a `redacted[]` entry the enforcement section names
      the path, the scrubbed-line count and the labels — both read off that
      entry's `redaction` — and that entry's `artifact`, `location`
      and `remediation` read off the record; **and with a `report` arm whose
      `outcome` is `promoted` and whose `redaction` is non-null, the SAME line
      for the REPORT path, composed from the same shape** (disclosure-parity
      ruling, 2026-08-29). **Proven RED against a composer that renders
      redaction lines for `redacted[]` alone**, which is the residual round 3
      named and which leaves a redacted-and-published report body announced
      without what the scrub did; **and separately RED against one that
      recomputes either value from the published bytes instead of reading
      `redaction`** — only the gate held the pre-scrub bytes (module half,
      row Q10). **This package composes the
      report, so this package asserts its lines** — until round 3's F11 the
      module half asserted a report line in a package whose Deliverables
      compose none, and it now asserts only what its RETURN carries.
      **The REFUSED-path lines:** with a `refused[]` entry whose preservation
      record holds an entry,
      the enforcement section names that path and reads the entry's `artifact`,
      `location` and `remediation` off the record; with an EMPTY record it names
      no copy for that path. **Asserted on the NORMAL branch as well as the
      fallback**, because a refused path with a preserved copy occurs on runs
      where the report body publishes perfectly well — proven RED against a
      composer that renders these lines only when the fallback fires, which is
      the scoping defect this row carried for one round. **THE REPORT BODY's
      own copies, asserted on EVERY arm of the `report` union**, because
      preservation is orthogonal to outcome (round 3's F1): a run in which EP2
      redacts the body and the SANITIZED body publishes (`promoted`), a run in
      which the body is withheld for a hard secret and the fallback publishes
      (`fallback`), and a run in which a preserved body is then refused
      (`refused`). In each, the enforcement section — or `report.record` on **EVERY arm whose
      section never reached the vault: the `refused` arm, which publishes
      nothing, and the `promoted` arm whose `accounting.published` is `false`,
      where the body published and the section did not** (round 5's H5 — before
      A1 the disjunction had one member, and it was still written that way
      afterwards) — names the report path and the entries in
      `report.preserved`; with an empty `report.preserved` it names none.
      **On the `promoted` arm with a non-null `redaction` that naming is the
      REDACTION line's and not a second preserved-copy line — proven RED
      against a composer that renders both for the same copy, which
      double-announces it** (Table R's partition, re-cut by the same ruling).
      **Proven RED against a composer that renders the report body's copies on
      the refused arm alone**, which is the arm-scoping F1 found and which
      leaves the ordinary redact-and-publish case unannounced.
      **Asserted on the WITHHOLD arm too, on both of its routes
      (round 3's F2, measured against the shipped gate; the ordinal this
      sentence carried was orphaned by a sweep and is dropped — round 4's
      F-3):** for a HARD secret
      the gate skips the redact arm entirely, so the record holds exactly one
      entry and one copy is named; on the redact arm's FALL-THROUGH — a soft
      finding whose scrub did not complete — the gate preserved a redact-shelf
      copy and then a withheld one, and when it reports that it KEPT the
      redact-shelf copy the record holds TWO entries, both named, each with its
      own `location`, **and rendered in the record's own order — the
      redact-shelf copy first, the withheld copy second** (module half, Table Q
      row Q9: the order is the order the gate wrote them). Proven RED against a composer that renders redaction lines
      only, which leaves an unredacted copy unannounced — the data-loss shape
      row Q3 names — **and separately RED against a composer that handles
      `refused[]` but not the report arm**, which is the same omission one
      surface over, **and separately RED against one that renders only the first
      entry of a record**. **Every field is asserted to come from the typed
      record: proven RED against a composer that recovers a name from `reason`**,
      asserted on a skill/ledger pair refusal where both halves were redacted,
      which is the case a prose carrier got wrong; **and RED against one that
      hardcodes the guidance instead of reading `remediation`**, asserted by a
      case that composes a redaction line and a refusal line in the same
      section and requires the two guidances to differ.
- [ ] **The preserved region is not re-gated (Table R).** A preserved report
      whose EXISTING bytes contain secret-shaped text is republished
      byte-identical, and no gate withholds, redacts or alters it. Proven RED
      against an implementation that scans the whole composed content.
- [ ] **The code-authored section cannot carry refusable bytes — the criterion
      asserts Table N's PROPERTY, and how it is achieved is not asserted.**
      **GREEN:** for every channel Table N classifies as attacker-influenceable,
      a value carrying both markdown-active text and a context-dependent secret
      is composed into the report, and the raw secret bytes appear nowhere in the
      published bytes — on the normal second write AND on the fallback.
      **RED, and this is the direction that makes the property real: add an
      UNCLASSIFIED, UNNEUTRALISED composer interpolation, exercise it with the
      hostile fixture on both the normal and the fallback path, and the test must
      FAIL until that interpolation is neutralised or composition refuses.**
      **The mutation is "unwired", not merely "new" — established by probe rather
      than argument (round (f)): a new channel already routed through a shared
      fail-closed neutraliser correctly stays GREEN, so "add a channel" alone
      does not discriminate.** **That is the whole contract; an implementation
      whose test passes with an unwired interpolation present has not built it,
      whatever its internal structure.**
      **Four further RED directions, each a failure this loop measured:**
      (i) the sanitiser skipped; (ii) the redact arm skipped; (iii) **sanitiser
      FIRST** — the round (c) A, which has both arms and still leaks; (iv)
      **the refusal fields neutralised while `redacted[].rel` is not** — the
      round (d) A, which passes every refusal-shaped case.
      **The secret values must be context-dependent** — at least
      `token=abcdefghijkl` and `client_secret: abcdefghijkl` — because a
      prefix-shaped secret survives the sanitiser intact and is caught in either
      order, so a test built only from one goes green on the leaking
      implementation.
- [ ] **Every report refusal delivers the record, and the TWO refusal shapes
      are asserted apart.** **(a) THE ONE-WRITE PATH's WRITE IS REFUSED — Table R's
      row R4, where nothing of this run's report reached the vault, and the
      return is `report.outcome === 'refused'`.** **The title was singular in a
      criterion whose whole subject is that the normal path has TWO report
      writes, and nothing in (a) said which write it meant (round 5's N3):**
      this case is the FALLBACK's single publish. For an `expect`
      conflict AND for a symlinked report target, the outcome is the same three
      things: the vault object is byte-unchanged, the COMPLETE enforcement
      record is returned in `report.record`, and the refusal names its reason.
      Proven RED against an implementation that refuses the write and drops the
      record — which is the failure that survives if only the `expect` path is
      handled. **(b) THE FIRST PUBLISH SUCCEEDS AND THE SECOND PRIMITIVE WRITE
      IS REFUSED (round 4's A1).** The body publishes, then the enforcement
      section's write is refused — asserted on an `expect` conflict AND on a
      symlinked target. The return is `report.outcome === 'promoted'` with
      `accounting.published === false` and `accounting.reason` carrying the
      PRIMITIVE's reason; `report.bytes` is the FIRST write's returned buffer.
      **THE VAULT-STATE ASSERTION IS SPLIT BY REFUSAL CAUSE, because ONE
      equality claim here is false by construction (round 5's C5):** on the
      **`expect` CONFLICT** the vault RETAINS THE INTERVENING USER BYTES that
      caused the refusal — the primitive's H5 abandons the write unless the
      target still holds the `expect` bytes, so the conflict IS the vault no
      longer holding them — while `report.bytes` retains the first-write body;
      the two are asserted UNEQUAL, and the criterion goes RED against an
      implementation that returns a fresh read and RED against one that
      overwrites the user's intervening bytes. On the **SYMLINKED TARGET** the
      path is a symlink and holds none of those bytes; what is asserted is that
      the symlink is not written through (Table H, the PRIMITIVE's row H3) and
      that `report.bytes` is still the first-write body. **Byte-equality with
      the live vault is asserted NOWHERE on this form** — it is assertable only
      where the premise "the target is unchanged since the first write" is
      explicitly established, and neither of these two cases establishes it.
      `report.record` holds the
      COMPLETE record, the redaction line and every preserved-copy line the
      unpublished section would have carried included. **Proven RED against an
      implementation that reports this as `fallback` or as `refused`** — the
      body did publish — **separately RED against one that reports a plain
      `promoted` with no `accounting`**, which is the silent outcome this case
      exists to close, **separately RED against one whose `report.bytes` is the
      composed-but-unpublished section or a fresh read of the vault path**, and
      **separately RED against one that drops the record on this path.** **The
      byte-unchanged assertion of (a) is asserted NOT to hold here** — the vault
      holds the published body — so an implementation that rolls the body back
      to satisfy it goes red too; rolling back a partial publish is the
      residue-lifecycle successor's subject and is Out of scope.
- [ ] **The caller's records reach the report (round 4's F1).** Records passed
      in `records` appear in the report's enforcement section, neutralised by
      Table R's rules exactly as this module's own are. Proven RED against a
      module that composes the report from its own records alone.
- [ ] Idempotence: `N/A — this package extends a module, not a command, and
      writes nothing outside the repo.` What it ships in its place is Table R's
      partition: every fallback case preserves both values or refuses and
      reports.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24), so
# every pattern run is guarded by the file's existence — the guard is what makes
# the deliverable-ABSENT state red instead of vacuously green. It is needed here
# even though the file is a MODIFY deliverable: it exists only once
# WP-dream-promote-module has landed, and an unguarded run is green on a tree
# where it never did.
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "dream-promote"
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "report-fallback"
npm test
npm run lint
# Still consumed by nothing: no production code requires the module this package
# extends. Guard the directory's existence first; grep on a missing path exits 2,
# which `!` would turn into a false green. The globs are quoted deliberately —
# unquoted, zsh expands them before grep sees them and the command dies, which
# `!` reads as success.
test -d src && ! grep -rqn "require(.*promote" src/ --include='*.js' --exclude='promote.js'
```

- The `report-fallback` pattern run and the consumed-by-nothing grep are NEW
  steps and each is an ASSERTION. Paste a real green on the finished state AND a
  real red from a deliberately broken state — a `require('./promote')` planted in
  another `src/` file reddens the grep; removing the fallback reddens its pattern
  run. Verify each **also** goes red when its deliverable is absent; for the
  pattern runs that is the file-existence guard's job, and it is the only
  deliverable-absent discrimination they have.

## Out of scope (do NOT do these)

- **`WP-dream-promote-module`'s contracts** — Tables C, D, E, Q and S: the
  promotion decision, the allowlist, the merge, the gate inputs and order, the
  EP2 gate's result and what promotion does with it, the decided bytes. This
  package extends `promote()` and cites those tables; it may not restate or
  re-implement them. **In particular the redaction lines and the preserved-copy
  line on a refusal render the PRESERVATION RECORD, whose fields, values and
  per-arm remediation are Table Q rows Q1, Q8 and Q9's, and the redaction lines
  additionally render the REDACTION ACCOUNTING, whose two fields and their gate
  provenance are row Q10's — this package reads all of them and decides none of
  them.**
- **The EP2 gate's DURABLE quarantine lifecycle** — the retention prune of
  `state/quarantine/redacted/`, the identity-gated deletion of a redundant copy,
  and the preservation-failure abort. Not the module half's either: they are
  decided, asserted and mutation-covered in the shipped
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`. **The module half's Table
  Q rows Q5 and Q6 are pure pointers at it; its row Q4 points at that package's
  enforcement of the only-copy invariant while owning the invariant as it binds
  this family.** **Cite that spec by path, never by bare table letter, and name
  the owner of any row id in a colliding letter — the canonical map
  (`docs/specs/logbook/2026-08-29-promote-family-map.md`) states which letters
  collide, and no spec restates that list.**
- **The pipeline** — `WP-dream-promote-in-workspace` owns Tables G and V,
  including row G11's delivery of `report.record` and row G12's production of
  the `records` this package consumes. Returning the record is this package's;
  delivering it is not.
- **`src/core/dream/validate.js` and `src/cli/dream.js`** — not in this
  package's Deliverables and not modified. Retiring today's report handling is
  the pipeline package's work.
- **The residue-lifecycle successor** — crash replay, the journal, uninstall
  restore, and the rollback of a partial publish.
- **`skills/wienerdog-dream/SKILL.md`** — the sibling's Out of scope owns the
  bounded claim; nothing here changes it.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): promote the dream report and deliver its record (WP-dream-promote-report)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
