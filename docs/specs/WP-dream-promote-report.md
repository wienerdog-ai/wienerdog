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
  `secretDisposition`. **It composes and publishes no report**, takes no
  `records`, and its return carries no `report` field. Those are added here.
- `src/core/dream/vault-write.js` — `writeIntoVault`, the only route into the
  vault. Its `expect` guard (Table H, H5) and its returned bytes (H6) are what
  make the second write and the fallback safe.
- `src/core/dream/validate.js:1374-1408` — today's report handling: the brain
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

**The base shape this extends is CONCRETE, not an ellipsis** — the module half's
`@returns` names `promoted:Array<{rel, bytes}>`, `redacted:Array<{rel, bytes,
lines, labels, artifact}>`, `refused:Array<{rel, reason}>` and
`secretDisposition`. **Pass (c) found that base block missing entirely, so this
package was extending nothing;** it is cited here and not restated.

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
 *             report:{outcome:'promoted'|'fallback', bytes:Buffer,
 *                     record:string[]}
 *                   |{outcome:'refused', reason:string, record:string[]} }}
 *    report  the dream report's own outcome, never folded into `promoted` —
 *            Table R's fallback publish is recorded as itself. **A DISCRIMINATED
 *            UNION: a published arm REQUIRES `bytes`, the refused arm cannot
 *            carry them** (round 2's finding — an optional field spanning
 *            success and refusal guarantees nothing on the successful branch).
 *            The published arms' `bytes` are decided bytes under the module
 *            half's Table S, whose row S6 names their consumers.
 *            On `refused` the COMPLETE enforcement record is in `record`, and
 *            **returning it is not delivering it** — the caller delivers
 *            (`WP-dream-promote-in-workspace`, row G11) */
```

## Contract reference

Activation (ADR-0031, 2-of-7 — four are true): (i) an interface is extended;
(ii) a report outcome taxonomy is introduced; (iv) fallback behaviour is this
package's whole subject; (vi) the pipeline package inherits the contract.

### The report row — the body is an ordinary promotion candidate

Moved here whole from the module half's Table D by the T1 cut. It is stated as
a row because the module half's Table D owns the gates it refers to:

| Contract | Today | The rule here | Position | Refusal remedy |
|---|---|---|---|---|
| The dream report (owner ruling, 2026-08-27) | `validate.js:1374-1408` — the brain writes the body into the vault, then code APPENDS its enforcement section to that same file | **BRAIN-AUTHORED, and gated like any other file.** The brain writes `<reports_dir>/<date>.md` in the WORKSPACE; `reports_dir` is copied in (sibling Table A) so a same-day second run's existing report is in the baseline. The body is a normal promotion candidate: the delta sees it, C9 admits `reports_dir`, the gates that match it judge it, and it is published by the primitive like any other note. **Read this row against the gate rows above: three of the four do not match a path under `reports_dir` and pass it through; the table above is what says which gate applies where.** **Code does not own the body** — the earlier code-owned design is withdrawn because it silently destroyed the `## Gated out (and why)` accounting the shipped skill requires (`SKILL.md:409-425`): that accounting names candidates the brain did NOT write, and **no filesystem outcome can reconstruct a file that never existed.** After promotion, code appends its own measured accounting to the promoted report — a SECOND write through the primitive, with `expect` set to the bytes the first publish returned (Table H rows H5/H6), never an in-place append. **The appended section is neutralised at composition time, per Table R's gate rules, which govern it here exactly as they do on the fallback branch.** **The fallback — whenever the brain-authored body is NOT successfully published, for ANY reason — is Table R**, which this row does not restate. **The trigger is stated as a complete class, not a list:** an earlier form said "when a gate refuses the body, or no body exists", which silently excluded the promotion-decision refusals (C4, C7, C8) and the primitive's own refusals (H5's `expect` guard, H3's symlinked target). On any of those the body is unpublished with no gate involved, and under the narrow trigger the enforcement record had nowhere to go | judged with the rest, before the append | the body is refuse-and-reported like any note; the code section is then published on its own — **and if THAT write is refused too, Table R's R4 governs: vault untouched, record returned in `report.record` for the caller's log and output, reason named.** This row does not restate R4 |

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
form said "every string", which **contradicted this table's own rows** — `labels`
and `lines` are classified as needing nothing, so an implementation following the
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
| `refused[].reason` | code-composed, but embeds brain-chosen path text — C1's allowlist refusal, and H7/H9 naming a surviving object | **YES** | **redact, then sanitise** |
| `redacted[].rel` | the brain chose the path | **YES — and this is the channel round (d) found leaking**, because the redaction line existed while the list named only the refusal fields | **redact, then sanitise** |
| `redacted[].artifact` | the quarantine basename, DERIVED from the brain-chosen path (Table Q, row Q2) | **YES, by derivation** — the primitive's own sanitising of the name is not this contract's guarantee, and a value derived from attacker text is treated as attacker text | **redact, then sanitise** |
| `redacted[].labels` | detector names from a code-owned closed set | **NO** | none — **and stated rather than omitted**, because a channel with no row is indistinguishable from a channel nobody thought about, which is exactly how round (d)'s finding arose |
| `redacted[].lines` | a count | **NO** | none — same reason |
| `records[].path`, `records[].reason` | the CALLER's pre-promotion accounting; today the pipeline's scratch enforcement, whose paths are filenames the brain wrote | **YES** | **redact, then sanitise** |
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
| R4 | mutates between the read and the publish — **or the primitive refuses the write for ANY other reason: a symlinked target under H3, containment, policy, any H-rule** | — | the read bytes | **refused.** The enforcement record then goes back to the caller in `report.record`, for the run's log and output, NOT the vault. **NAMED RESIDUAL, accepted by ruling:** in this narrow window an overwrite would be the worse failure, because it would clobber the user's live edit. **Every refusal path converges on this ONE outcome — the vault object is left untouched, the complete enforcement record is delivered to the caller, and the refusal names its reason.** A symlinked report target is additionally a suspicious state, and surfacing it beats overwriting anything. Rejected for the record: **writing through the symlink** (overwrites a different user note — the acceptance criterion below rightly goes RED on it); **replacing the symlink with a regular file** (a code decision mutating the user's vault structure); **a different filename** (a new product surface) |

| Rule | Value |
|---|---|
| Gates — **owner ruling, 2026-08-27; two rules, neither flagged option alone** | **(1) The PRESERVED REGION is not re-gated.** Gates guard content ENTERING the vault, not content residing in it. The preserved bytes are already vault content and stay byte-identical; re-scanning them protects nothing — that content is already exposed — while it can destroy the enforcement record or mutate user-edited bytes, which R3 forbids. **(2) The CODE-AUTHORED SECTION is neutralised at COMPOSITION time.** **TABLE N owns which channels are neutralised, with what, and in what order, and this rule does not restate it.** Two A-band findings came from this rule trying to carry that contract inline — first with no order, then with an incomplete set — which is why it was extracted. **WHICH values, with what, and in what order is TABLE N's — cited, never restated here. An earlier form of this cell hand-listed `r.path` and `r.reason`, and that list was already stale against Table N's own rows the day it was written (round (e)); a member list in a citing surface is the defect, not the shorthand** — measured, today's enforcement line interpolates two values, not one (`validate.js:1385-1386`), and under this design a refusal REASON carries brain-chosen path text too (C1's allowlist refusal, and H9 and H7, which name in the refusal a directory or a staging object). An earlier form said "`r.path` and kin", which quantifies over nothing — and this universal is what justifies having no gate exemption, so an unneutralised reason channel would make that justification false. A redacted path still serves the record: "`sk-…[redacted]` — refused: secret-shaped path" says everything the user needs without the secret. **Scope: this rule governs the code-authored enforcement section WHEREVER it is composed — the normal second write and this fallback alike**, since the same interpolation happens in both |
| The observable property the two rules buy | **Table N, row N4 owns this claim and its history** — it has been false twice, and N4 names its own prerequisites. This row does not restate them |
| Measured cost of rule (2), named rather than absorbed | the shipped sanitizer is `sanitizeProjectName` (`digest.js:414-418`, exported at `:867`), built for display NAMES: it replaces every character outside `[\p{L}\p{N}\p{M} ._-]` with `_`, **path separators included**. Measured: `01-Projects/customer/note.md` → `01-Projects_customer_note.md`. The refused note stays identifiable, which is what the record is for, but the line is no longer a copy-pasteable path. **Accepted as stated, not silently**: swapping in a path-preserving sanitizer would be a new product surface, and the ruling chose the shipped one. **Under the ruled order this cost is unchanged and its cause is now visible: the same character class that flattens a path is what would flatten a secret's separator, which is exactly why the sanitizer runs second** |
| The redaction lines | one line per redaction, carrying the path, the scrubbed-line count, the labels and the **artifact name the gate returned** (module half, Table Q rows Q1–Q3). **Table Q owns why this is data-loss-critical and this row does not restate it.** |
| **The preserved-copy line on a REFUSAL — added by the Table Q reconciliation pass, 2026-08-29** | one line per entry of `refused[]` whose `artifact` is non-null, naming the path and that artifact. **The guidance is DELETE, not restore**, and the difference is the content's provenance: the note was never promoted, so what the copy holds is brain-authored text the product refused, and telling the user where it is and that removing it is the expected action is the whole obligation. **Why the line exists at all:** the gate wrote that copy before promotion knew the path would be refused, `state/quarantine/redacted/` carries no digest banner, and the path is not in `redacted[]` — so without this line an unredacted copy of secret-shaped content sits unannounced until retention silently removes it (module half, Table Q rows Q3 and Q8, which own both facts). **The name is READ FROM THE TYPED FIELD `refused[].artifact`; this row may not recover it from `reason`** — measured in the module half's own PR gate, a prose carrier on a paired refusal named the SIBLING's copy first. Neutralised at composition exactly like every other channel (Table N) |
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
- [ ] Current-state description (today's report handling, the sanitizer, the layout)
- [ ] Implementation notes and the Security checklist
- [ ] Out of scope (what the module half, the pipeline half and the
      residue-lifecycle successor own)
- [ ] **The package note and the dispatch-precondition block** — the note
      mirrors the citation of the canonical table-letter map and the consumed-by-nothing
      rule; the dispatch block mirrors the pinned base and the containment
      citation
- [ ] **The `report` union's arms** — `### Exact contracts`, Table R's four
      rows, and `WP-dream-promote-in-workspace`'s rows G8 and G11. **No surface
      may make `bytes` optional across the union, and none may describe
      RETURNING the record as delivering it.**
- [ ] **Table R's four cases and its named residual** — the report row (which
      cites, never restates), and the acceptance criteria
- [ ] **Table N — the neutralisation contract.** Its mirrors are Table R's gate
      rule (2), Table R's observable-property row (which defers to N4), the
      redaction-lines row, the `records` input in `### Exact contracts`, and the
      code-authored-section criterion. **Three prohibitions, each earned by a
      finding: no surface may state a neutralisation rule without its ORDER; no
      surface may carry a hand-listed value set, because a list in a citing surface
      goes stale — measured, two did (round (e)); and no surface may restate
      N4's justification, which has been false twice and whose prerequisites N4
      itself names.**
- [ ] **The redaction lines AND the preserved-copy line on a refusal** — Table
      R's two rows for them, their two acceptance criteria, and the module
      half's **Table Q**, which owns the metadata both carry (rows Q1–Q3 for the
      first, row Q8 for the second). **This package cites Table Q and never
      restates the quarantine lifecycle** — and the DURABLE half of that
      lifecycle is not even the module half's: the retention prune, the
      identity-gated deletion and the preservation-failure abort are decided in
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, whose table letters
      collide with this family's, so it is cited by spec path and never by bare
      letter. **No surface here may read an artifact name out of a refusal
      reason.**

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
      target is refused (Table H, H3), not written through.
- [ ] **A refusal must cost the user nothing**: on every refusal path the vault
      object is byte-unchanged and the complete record still reaches the caller.

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
      during the run) and with an **H5** refusal (the target changes between
      decision and publish), the fallback fires in both cases. Proven RED
      against an implementation whose trigger is the gate-refusal case alone,
      which preserves the report and drops the record.
- [ ] **A refused path's preserved copy is announced (Table R's
      preserved-copy row; module half, Table Q rows Q3 and Q8).** With a
      `refused[]` entry carrying a non-null `artifact`, the enforcement section
      names that path and that artifact with delete guidance; with
      `artifact: null` it names no artifact for that path. Proven RED against a
      composer that renders redaction lines only, which leaves an unredacted
      copy unannounced — the data-loss shape row Q3 names. **The name is
      asserted to come from the typed field: proven RED against a composer that
      recovers it from `reason`**, asserted on a skill/ledger pair refusal where
      both halves were redacted, which is the case a prose carrier got wrong.
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
- [ ] **Every report refusal delivers the record.** For an `expect` conflict AND
      for a symlinked report target, the outcome is the same three things: the
      vault object is byte-unchanged, the COMPLETE enforcement record is
      returned in `report.record`, and the refusal names its reason. Proven RED
      against an implementation that refuses the write and drops the record —
      which is the failure that survives if only the `expect` path is handled.
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
# The deliverable test file exists today (a modify deliverable), so no guard is
# needed for its existence — but the pattern must actually match something.
npm test -- --test-name-pattern "dream-promote"
npm test -- --test-name-pattern "report-fallback"
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
  run. Verify each **also** goes red when its deliverable is absent.

## Out of scope (do NOT do these)

- **`WP-dream-promote-module`'s contracts** — Tables C, D, E, Q and S: the
  promotion decision, the allowlist, the merge, the gate inputs and order, the
  EP2 gate's result and what promotion does with it, the decided bytes. This
  package extends `promote()` and cites those tables; it may not restate or
  re-implement them. **In particular the redaction lines and the preserved-copy
  line on a refusal carry Table Q's metadata, and Table Q owns it.**
- **The EP2 gate's DURABLE quarantine lifecycle** — the retention prune of
  `state/quarantine/redacted/`, the identity-gated deletion of a redundant copy,
  and the preservation-failure abort. Not the module half's either: they are
  decided, asserted and mutation-covered in the shipped
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, which the module half's
  Table Q rows Q4–Q6 point at. **Cite it by spec path, never by bare table
  letter — its Tables N, Q and R collide with this family's.**
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
