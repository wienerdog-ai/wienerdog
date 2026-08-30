---
id: WP-dream-promote-module
title: Build the promotion module — decide, gate, merge and publish, consumed by nothing
status: In-Review
model: opus
size: M
depends_on: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-module: the promotion decision, shipped consumed by nothing

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — one of THREE packages, and the ruling quoted below is the
PRE-T1 one.** The seam ruling reproduced here split the work TWO ways; **the T1
tripwire later cut a third package, `WP-dream-promote-report`, which took Table R
and the report row out of this spec.** The quotation is kept as history —
**current ownership is the canonical map, cited above, and nothing in this note
overrides it.** This WP and `WP-dream-promote-in-workspace` were one design,
split along the seam the owner ruled at the PR-review gate (logbook:
`2026-08-21-dream-promote-pair-review-rounds.md`, "Owner ruling on the
verdicts"): **Tables C, D, E and R become this `promote.js` package, shipped
consumed by nothing; Table G becomes the pipeline package.** The split's input
record is `2026-08-28-promote-split-inputs.md` and the split's own decisions are
recorded in `2026-08-28-promote-split.md`.

**Contract table letters are family-wide. The canonical map lives in ONE LIVING
surface — `docs/specs/logbook/2026-08-29-promote-family-map.md` — and this
spec CITES it rather than restating it.** It was restated in three
specs until the PR gate found two of them stale. **A cut that moves a table
updates that map AND sweeps each spec's Out-of-scope ownership prose, which stays
hand-maintained** — an earlier form of this sentence said "and nothing else",
which the next gate falsified by finding one of those bullets already drifted.
Every cross-package reference cites its owner and never restates it.

**This package ships consumed by nothing**, exactly as `delta.js` and
`vault-write.js` each did at their own merge (`delta.js` has since gained one:
`workspace.js:63` consumes `captureBaseline`, while `computeDelta` is still
called by nobody). It creates one module and its test; it changes
no call site, retires no code path, and leaves the running dream byte-identical.
Its first and only consumer is `WP-dream-promote-in-workspace`, which wires it
into the run under its own boundary.

**This spec owns the DECISIONS and owns no filesystem discipline**: every vault
byte it publishes goes through the primitive's `writeIntoVault` (Table H), and
its policy reaches that primitive as the injected `admit` callback.

## Dispatch precondition

**Written against the tree at `36c2ce51562aadb3eea83ccfe51a40bc728d9680`
(`36c2ce5`), verified as both `main` and `origin/main` at authoring time.** All
three dependencies are `Done` on that tree. Before dispatch, re-run every
`file:line` citation and every measurement below against the tree the
implementer will find (`docs/specs/README.md` → Dispatch-time re-verification).
A citation that does not resolve blocks the dispatch. **Range citations are
checked at BOTH ends.**

**RE-VERIFIED ON REBASE, 2026-08-30, against `68ac5e9` (`main` after PR #32).**
`WP-quarantine-warnings-file` landed between the authoring tree and this one and
added two lines to `src/core/dream/validate.js` — a `require` at `:16` and a
counting condition at `:1430` — so **every `validate.js` citation in this spec
and in `src/core/dream/promote.js` moved by exactly one line and was bumped by
one**, and the file's measured length went from 1469 to 1471. **TWO insertions
means the shift is NOT uniform over the file, and an earlier form of this note
said it was.** Measured, the map has three zones: old `1`–`15` → `+0`, old
`16`–`1428` → `+1`, old `1429`–`1469` → **`+2`**. Every citation carried over
here lands in the middle zone — the highest endpoint is old `1409` — so `+1` is
right for all of them, and the `+2` zone is named because a citation ASTRIDE the
second insertion does not shift as a block at all: it maps to non-contiguous
lines. `WP-dream-promote-in-workspace.md` has one (`validate.js:1427-1429`),
which is why this is stated rather than left as an unstated boundary condition.
Method: each cited
line's bytes were read from the authoring tree's `validate.js` and compared
against BOTH the same line and the next line of this tree's `validate.js`. **50
citation tokens carry over from the authoring tree — 47 in this spec and 3 in
`promote.js` — naming 73 line endpoints; all 73 matched one line down and NONE
matched in place**, both ends of every range included, and no citation was
bumped on a coincidence. **No other cited file changed** —
`delta.js`, `workspace.js`,
`brain.js`, `layout.js`, `digest.js`, `vault-write.js`, the dream `SKILL.md`,
`CURRENT-IMPLEMENTATION-REVIEW.md` and `WP-secret-fence-ep2-redact-arm.md` are
byte-identical between the two trees, so their citations, and the bare `:NNN`
citations that belong to them, were deliberately NOT bumped.

**Containment semantics are stated by CITATION, and no surface here paraphrases
a path-containment rule (owner ruling, 2026-08-28).** The shipped truth is
kernel-faithful resolution plus `(dev, ino)` identity. It is owned by **Table H**
(`docs/specs/done/WP-dream-vault-write-primitive.md`, rows H1 and H2) and
implemented in `src/core/dream/vault-write.js` and `src/core/dream/workspace.js`
(`isAtOrBeneath`, exported). The reason this is a ruling rather than a
preference is recorded in `memory/lessons/inbox.md` under
`WP-dream-workspace-retarget`: **every string answer to "is this path inside
that directory" is wrong** — substring, separator-splitting, case-folding and
both of Node's own path resolvers each failed, in both directions — and eleven
review rounds went into the answer that holds. Re-deriving it in prose is how
those eleven rounds get paid for twice.

Note for the re-verifier: the superseded filter-out design
(`WP-dream-fence-candidate-set`, `WP-dream-denied-object-disposal`, and their
two parent specs) is filed in `docs/specs/done/` as `Superseded`, with its round
records in the logbook. Nothing here depends on it and nothing here may build on
it.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** (ADR-0012) spawns a
headless AI brain, lets it write notes, and then runs a code validator that
classifies every write, reverts what fails policy, and makes one commit in the
vault. Today that classification derives its evidence from git in the vault — a
namespace that already holds the user's data, written by the brain itself.

Two packages have already inverted the write direction. `WP-dream-workspace-retarget`
built the **workspace**: the system copies the vault's readable content into a
private directory, captures the exact bytes it just wrote as a **constructed
baseline**, and `spawnBrain` takes the workspace as its write target. What it
deliberately did NOT do is flip the running pipeline — its transitional call-site
argument still passes the vault, because a brain writing into a workspace nothing
promotes is an inert product. `WP-dream-vault-write-primitive` then built the one
sanctioned way to put a content file into the vault (`writeIntoVault`, Table H):
it decides on the resolved object rather than the given name, never writes on or
through a symlink, never lets a reader see a partial write, publishes only while
the caller's premise still holds, and returns the bytes it published.

**This package builds the decision layer between them.** Given the run's
constructed baseline, the delta of what the brain wrote, and the live vault, it
decides per path what happens — promote, promote a merged version, promote a
scrubbed version, or refuse-and-report — runs four policy gates, publishes what
survives through the primitive, and composes the dream report's enforcement
record. **The gates do NOT share one input:** the secret scan judges what the
BRAIN wrote, before the merge; the other three judge the MERGED bytes that would
actually be published. **Table D owns that split and this summary states none of
its rule.** **Filtering out becomes promoting in.** It
ships with no caller: `WP-dream-promote-in-workspace` is the package that makes
it true of the running product.

One audit finding closes with this module's mechanism, and the closure names the
mechanism that prevents it rather than the policy that catches it. **M7** (a
hostile `CLAUDE.md` persists in the vault and re-steers later runs,
`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:676-752`): the
brain cannot write the vault at all, and promotion admits paths by a positive
allowlist (Table C, row C9) rather than denying two known filenames — the file
never comes into existence in the vault. **M10** (the dream writes `.gitignore`
and blinds every gate, `:931-989`) closes with the git-free classification the
pipeline package runs, and is that package's to claim: no surface here may claim
it, and none may attribute it to any repository-status property of the workspace
(sibling Table F measures the latter unestablishable).

## Current state

- **Nothing of this module exists.** `src/core/dream/promote.js` and
  `tests/unit/dream-promote.test.js` are created here.
- `src/core/dream/vault-write.js` (481 lines) — `writeIntoVault`, this module's
  only route into the vault. **Its signature is read from the code by path at
  dispatch, and from its spec's `### Exact contracts` block, rather than
  restated here** (`docs/specs/done/WP-dream-vault-write-primitive.md`).
- `src/core/dream/workspace.js` — `createWorkspace`, `destroyWorkspace` and the
  exported containment helper `isAtOrBeneath`. This module calls neither
  lifecycle function. **It DOES call `isAtOrBeneath`, and only there: to check
  that the merge's temp root is not at or beneath the workspace (Table C, row
  M2's cwd clause).** Amended after the PR-review gate found that
  `os.tmpdir()` honours the ambient `TMPDIR` — which the dream already passes
  through to the brain (`brain.js:225`) — so CLAIM 2b had to be CHECKED rather
  than assumed. **This is a CONSUMER of the family's one containment rule, not
  a second implementation of it**, which is what the Implementation-notes
  prohibition forbids; the rule itself is still owned by Table H.
- `src/core/dream/delta.js` — `captureBaseline` and `computeDelta`, git-free,
  spawns nothing. **`computeDelta` still has no consumer**; this module is the
  first code to read its records, and the pipeline package is the first to call
  it. A binary record deliberately carries no line numbers, so the consumer
  "withholds what it cannot scan" (`delta.js:517-520`) — Table D turns that into
  a refusal.
- `src/core/dream/validate.js` (1471 lines) — the four gates as they exist
  today, all deriving their evidence from git in the vault: ledger validation
  (`ledgerViolation`, `:1157`), the ADR-0020 skill-body guard
  (`skillBodyViolation`, `:1188`) and the Tier-3 floor (`tier3Decision`,
  `:1195`) inside Step 2's per-path classification (`:1145`); the EP2 secret
  gate as Step 3 (`:1212`), whose shipped redact arm is at `:1270-1295`, whose
  separate counters are at `:1065-1073`, whose unscannable-binary refusal is at
  `:1240-1256`, and whose revert, re-stage and index-drop core is at
  `:1325-1333`. **None of these is modified here** — Table D states the input
  and order this module applies to
  the gates it is HANDED, and extracting the real gate functions into that shape
  is the pipeline package's work. Step 4 appends the enforcement section to the
  dream report (`:1375`), interpolating two brain-influenceable values per line
  (`:1386-1387`). The repo already reasons about case-insensitive
  instruction-file matching at `:1084-1087`.
- `src/core/digest.js` — `sanitizeProjectName` (`:414-418`), exported at `:867`.
  **Named here only because the T1 cut moved its consumer**: the sanitizer
  neutralises the report's code-authored section, which is
  `WP-dream-promote-report`'s. This package uses it nowhere.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`. `:32-42` — the defaults.
- `skills/wienerdog-dream/SKILL.md:409-425` — the shipped skill requires the
  BRAIN to author the dream report body, including a `## Gated out (and why)`
  section naming candidates the brain did not write.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/promote.js | three-way decide + gates + merge + publish, for ordinary notes (Tables C, D, E, Q and S). **NOT the report — `WP-dream-promote-report` adds it** |
| create | tests/unit/dream-promote.test.js | Tables C, D, E, Q and S |
| modify | docs/GLOSSARY.md | one canonical name: **promotion** |

**Nothing else, and the exclusions are load-bearing.** This package does not
modify `src/core/dream/validate.js` and does not modify `src/cli/dream.js`: it
ships consumed by nothing, so the running dream is byte-identical after it
merges. Retiring the git-derived gate evidence, removing the EP2 enforcement
half, and wiring the run are all `WP-dream-promote-in-workspace`'s work under
its own boundary.

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
/** @typedef {{artifact:string, location:string}} GateReportedCopy
 *  ONE copy the EP2 gate preserved for one candidate, AS THE GATE RETURNS IT —
 *  the fields only the gate can know. The gate's arms carry
 *  `Array<GateReportedCopy>`. */

/** @typedef {GateReportedCopy & {remediation:'restore-or-delete'|'delete'}} PreservedCopy
 *  THE SAME COPY AS `promote()` RETURNS IT — the gate's fields plus the one
 *  this module assigns once the path's outcome is known. **The split is the
 *  TYPE carrying PROVENANCE: a field sits in `GateReportedCopy` when the GATE
 *  fills it and in the extension when THIS MODULE does, so no field's filler
 *  is left to prose. Table Q row Q9 owns which party fills each field, WHEN,
 *  and what values it may take; this typedef states the TYPE and restates none
 *  of Q9's rules.** `PreservedCopy` is declared once and used on every arm
 *  below, because writing the fields out twice would be the
 *  two-carriers-for-one-fact shape row Q8 exists to close. */

/** @typedef {{lines:number, labels:string}} RedactionAccounting
 *  WHAT ONE SUCCESSFUL SCRUB DID TO ONE CANDIDATE — a PER-PATH fact, which is
 *  why it is NOT a field of row Q9's per-COPY record. Table Q row **Q10** owns
 *  its two fields, WHO fills each and WHEN, and which shapes may carry it;
 *  this typedef states the TYPE and restates none of Q10's rules.
 *  **BOTH fields are filled by the EP2 GATE at gate time, so there is no
 *  base/extension split here** — the `GateReportedCopy`/`PreservedCopy` split
 *  exists because that record has TWO fillers, and this shape has one. Stated
 *  rather than left to symmetry. Declared ONCE and used on every carrier, so an
 *  ordinary note's redaction line and the report body's are composed from the
 *  SAME shape rather than from two look-alike field pairs. */

/** Decide, per changed path, what happens to it — and promote what survives.
 *  Pure decision first, writes second: **every POLICY decision** in the run —
 *  allowlist, merge, all four gates — is made before any vault byte is written
 *  (Table E). **NOT every decision**: the primitive's `expect` guard is
 *  necessarily per-path at publish time, so a path can still become
 *  refuse-and-report during the write phase, after earlier paths are published.
 *  @param {{vaultDir:string, workspaceDir:string, date:string,
 *           baseline:import('./delta').Baseline,
 *           delta:ReturnType<import('./delta').computeDelta>,
 *           layout:import('../layout').VaultLayout,
 *           gates}} o
 *    delta  the run's classified changes, computed by the CALLER. Passed in
 *           rather than computed here because the caller needs the same result
 *           for its own non-vacuity decision (`WP-dream-promote-in-workspace`,
 *           Table G) and computing it twice
 *           would let the two answers disagree
 *    date   the run's date, which names the report `<reports_dir>/<date>.md`
 *           (Tables D and R). Supplied rather than derived so the module reads
 *           no clock. **Its SHAPE, and what this module must check before it
 *           hands the value to any gate, are Table D's `date` row's — `string`
 *           is all the TYPE can carry, and this block states none of that
 *           row's rule**
 *    gates  the four decision functions of Table D, injected rather than
 *           imported so `promote.js` does not depend on `validate.js`. Their
 *           inputs differ BY GATE, and Table D owns them: the EP2 secret gate
 *           judges the delta's added lines against the baseline BEFORE the
 *           merge; the other three judge the MERGED candidate bytes, and the
 *           skill-body guard additionally takes the BASELINE ledger as its
 *           authorizing input. The three post-merge gates return a refusal
 *           reason or null; the EP2 gate returns the ADR-0034 taxonomy, and
 *           **every arm of it that preserved anything carries the GATE's half
 *           of the PRESERVATION RECORD — `Array<GateReportedCopy>`, the fields
 *           the gate fills. This module completes each entry with
 *           `remediation` at the point it records that path's outcome, which
 *           is why what it RETURNS is `Array<PreservedCopy>`. Table Q rows Q1
 *           and Q9 own that shape and its per-field provenance, and this block
 *           does not restate their rules. The REDACT arm additionally carries
 *           `redaction`, a complete `RedactionAccounting` — both of its fields
 *           are the gate's, so this module passes the object through and
 *           completes nothing on it (row Q10).**
 *           **Preserving the unredacted copy to quarantine is the EP2 GATE's
 *           own act, not this module's** — the module consumes the disposition
 *           and knows nothing about the state directory, but it DOES consume
 *           what the preservation produced, because for a copy on the redacted
 *           shelf the report line is the user's only route back to it
 *           (Table Q, rows Q3 and Q9)
 *  @returns {{promoted:Array<{rel:string, bytes:Buffer}>,
 *             redacted:Array<{rel:string, bytes:Buffer,
 *                             redaction:RedactionAccounting,
 *                             preserved:Array<PreservedCopy>}>,
 *             refused:Array<{rel:string, reason:string,
 *                            preserved:Array<PreservedCopy>}>,
 *             secretDisposition:{withheld:number, redactions:number}}}
 *    **Every published entry carries BOTH halves — `rel` AND `bytes`.** Table S
 *    owns why the bytes are required and this block does not restate it; the
 *    PATH half is required here because a consumer that has bytes without a path
 *    cannot stage, count or register them, and prose saying "per path" does not
 *    make a type carry one. **Pass (c)'s finding: the T1 cut removed this whole
 *    `@returns` block along with the report field, and Table S alone required
 *    `bytes` without ever requiring `rel`** — the path half of round 1's fix was
 *    unenforced for one round.
 *    `redacted[]` additionally carries `redaction`, the EP2 accounting Table Q
 *    row **Q10** defines — the scrubbed-line count and the detector labels, in
 *    ONE named field because the two are present together or not at all —
 *    because those reach the report and cannot be recomputed. It is REQUIRED
 *    and NON-NULL on every entry of this array: membership IS the redaction.
 *    Row Q10 owns its fields, who fills each and when, and which other shapes
 *    may carry it; this block restates none of that.
 *    **`preserved` is the PRESERVATION RECORD, and it is REQUIRED on BOTH of
 *    these arms** — empty when the gate preserved nothing for that path, or
 *    never ran for it. It is the ONE carrier for every fact about a copy the
 *    gate wrote: the copy behind an ordinary redaction, the copy written before
 *    a redaction was followed by a refusal, and the copies the withhold arm
 *    produces and keeps. The reason string carries none of them.
 *    **Every entry this module RETURNS is COMPLETE — the gate's fields plus
 *    the `remediation` this module assigns — so every surface downstream of
 *    this return only ever READS.** Table Q
 *    row Q1 owns which arms carry it, row Q9 owns an entry's fields AND which
 *    party fills each of them, row Q8
 *    owns why a refusing arm carries it at all, and Table S row S3 owns why a
 *    no-bytes arm may hold it; this block restates none of the four.
 *    **`report` is NOT in this package's return — `WP-dream-promote-report`
 *    adds it.** This module publishes ordinary notes and composes no report.
 *    `secretDisposition` is the typed signal the pipeline's transcript-advance
 *    consumes (`WP-dream-promote-in-workspace`, Table G) — never a parsed
 *    refusal reason. ONLY `withheld`
 *    defers a transcript; `redactions` is accounting (the sanitized note WAS
 *    promoted, so its transcript was consumed — `validate.js:1065-1073`).
 *    Named `withheld`, not `reverts`: promotion never wrote the bytes, so
 *    there is nothing to revert */
function promote(o)
```

## Contract reference

**Reading order, and one name that is no longer here.** The owner's seam ruling
named four tables "C, D, E and R"; **Table R has since been cut to
`WP-dream-promote-report` by the T1 tripwire**, so this spec owns C, D, E, Q and
S. Q and S were added later — S by the ADR-0031 circuit-breaker (round 2), Q in
pass (b) — and each sits after the table it generalises. A "Table R" reference
in this spec is a CITATION of the report package.

Activation (ADR-0031, 2-of-7 — five are true): (i) a new module interface
appears; (ii) a promotion outcome taxonomy is introduced; (iv) refusal and
fallback behaviour changes across four gates; (vi) the pipeline package inherits
this contract; (vii) the gate order is mirrored in the tests and the dream
report.

### Contract table(s)

`N/A — this spec's dense contracts are five NAMED canonical tables (C, D, E, Q
and S) rather than one unnamed table under this heading.` Naming them is what
makes a row addressable by letter across the whole family
(`docs/specs/logbook/2026-08-29-promote-family-map.md` maps letters to owners).
The heading stays in place rather than being deleted, per
`docs/runbooks/spec-authoring.md`: a section's absence must be visible and
checkable. **The named-table substitution is pre-existing in all three specs of
this family — noted by the round-zero pass of 2026-08-29 and closed then. What
changed on 2026-08-29 is that each spec now states its OWN tables here:** until
then all three carried one byte-identical paragraph, registered by no Mirrored
Surface Checklist, and its claim was false in one of them.

### Table C — the promotion decision

The three-way state triple per relative path: **baseline** (what the sibling's
copy-in wrote), **after** (the workspace now), **vault-now** (the live vault at
decision time). **Rows C1–C8 are the evaluated conditions**, top to bottom,
first match decides. C9 is the definition C1 refers to, and M1–M3 are mechanics
that apply to whichever row selected them; none of those four is itself a
condition.

**Where these rows sit against Table D's four gates — decided HERE, because this
table already owns "first match decides", and until this pass no surface ordered
the two sets against each other at all.** The implementation settled it and only
the code said so, which is the mirror-promoted-to-primary inversion ADR-0031
exists to prevent. The order is: **C1's CANDIDATE-DECIDABLE half and C2 are
evaluated before any gate runs**; the four gates are then positioned by Table D
**relative to the merge**, which happens inside C6, so C3–C8 interleave with them
rather than preceding them. C1 first, because a path the allowlist can never
admit must be refused with THAT reason rather than with a gate's. C2 before the
gates, because a `deleted` record has no after-bytes to scan and a gate handed
one would be judging nothing. **Table D's "here it runs FIRST" of EP2 orders EP2
among the four gates and does not order it against this table.**

**C1 HAS TWO HALVES, and only the first can precede the gates — corrected
2026-08-29, after a design round found the unconditional form false.** Row C9 is
ONE predicate applied TWICE, and its DEFINITIVE application is the primitive's,
on the resolved path. The other application is this module's, on the candidate,
and it may only REFUSE — which is what makes it orderable ahead of the gates.
So the **candidate-decidable half** — the tier and `reports_dir` prefixes, the
`.md` extension, the instruction-file basenames and the denied segments, all
readable off the candidate path without resolving it — is evaluated up front and
refuses before any gate runs. **Corrected 2026-08-29 (round-2 coherence, H-3):
an earlier form of this paragraph opened with C9's "never to the candidate"
clause and then wrote "So" in front of a candidate-time evaluation — importing,
as its premise, the very clause row C9 records as having contradicted the
header's previous claim.**
The **resolved-path half** is the primitive's `admit` call at publish time, and
it can deny a candidate the first half admitted: C9's measured case is a
pre-existing vault symlink that lands a lexically admitted
`01-Projects/alias/evil.md` inside a denied directory. **That half is a
publish-time refusal, exactly like the `expect` guard's, and it arrives AFTER
EP2 has run.** No surface may state C1 as wholly preceding the gates. Deciding
it earlier is not available to this module: resolving the path here would be the
second containment implementation the Dispatch precondition forbids, and asking
the primitive for a resolve-and-admit answer without publishing is a new
cross-package operation, which is an owner's call and not a patch.

**Two consequences, both of them product behaviour, both stated here rather than
left to the code.** (i) A path refused by C1's **candidate-decidable** half
never reaches the secret gate, so it never increments
`secretDisposition.withheld` — and only `withheld` defers a transcript
(`### Exact contracts`), so a note that is unpromotable at any destination no
longer holds its transcript back to be re-refused on every subsequent run. **The
same conclusion holds for a resolved-only refusal, by a different route and
stated rather than assumed:** the gate did run for it, but a path EP2 withholds
never reaches publish at all, so a refusal whose reason is C1's always sits on
an EP2 verdict of pass or redact and increments `withheld` for nobody. (ii) For
the **candidate-decidable** half the gate is not CALLED, so **it performs no
quarantine preservation**: a hard secret the brain writes into
`.claude/settings.json` leaves no recoverable copy and is discarded with the
workspace, where under the shipped validator it left one. **Ruled the right
trade, and recorded as a behaviour change rather than as an omission** — the
content is brain-authored on a path promotion can never accept, the workspace is
destroyed either way, and the alternative mints a durable artifact for a note
the product will never take while holding that note's transcript forever. The
refusal states the absence positively rather than by silence, and **row Q8
decides in what form; this paragraph cites it and does not state it** (corrected
2026-08-29: an earlier form named Q8 the owner and spelled out the owned fact in
the same sentence). **The resolved-only half is the opposite case, and row Q8
owns what such a refusal then carries:** the gate DID run for it, so the refusal
can sit on a preservation the gate had already made. **Measured against the
shipped implementation on `wp/dream-promote-module`: a resolved-only denial
makes one EP2 gate call.** Stating (ii) unconditionally was false for that half,
and is what the design round of 2026-08-29 found.

**Rejected here so it is not re-derived: moving C4, C8 and the
missing-baseline case ahead of EP2 as well.** It would remove three of the
routes by which a completed redaction is followed by a refusal, and it closes
none of them — C7's conflicting merge, the three post-merge gates, the
skill/ledger pair refusal and the primitive's `expect` guard all still follow a
redaction the gate has already preserved a copy for. It therefore buys a lower
incidence of an arm row Q8 already handles, at the price of an ordering
prescription this table would have to keep true for the life of the module.

| # | Condition | Outcome |
|---|---|---|
| C1 | the path is not admitted by the promotion allowlist (row C9) | **refuse-and-report.** No content is PUBLISHED to the vault. **What a refusal may leave behind is bounded by the primitive on BOTH sides, and this row cites both rather than restating either (corrected 2026-08-28; the pre-split form cited the primitive's H9 alone and its "no CONTENT is written" clause was arguable):** the DIRECTORY side is **the primitive's H9** — empty directories the call created are unwound, one that acquired content or failed removal for a platform reason is left and NAMED; the STAGING-OBJECT side is **the primitive's H7** — at most one object of that call's making, in the target's own parent directory, may survive an unwritable-parent refusal, holding the REFUSED payload, and the refusal NAMES it. **That spec's own H7 acceptance criterion is the single surface that enumerates and counts those cases; this row defers to it and states no number.** The consequence this package must carry is in Table E's staged-bytes row: a refused staging object sits where a wholesale `git add -A` would sweep it into the commit, which is one more reason the commit is built from the primitive's returned bytes and named paths |
| C2 | delta status is `deleted` (present in baseline, gone from the workspace) | **refuse-and-report — promotion never deletes.** The vault keeps the note. Named rather than traded off: a deletion is unrecoverable and the brain has no business making one |
| C3 | delta status is `added` and `vault-now` has no such path | **promote** the workspace bytes (Table E's write) |
| C4 | delta status is `added` and `vault-now` HAS the path | **refuse-and-report.** The user created a note at that path during the run; the brain's version does not displace it |
| C5 | delta status is `modified` and `vault-now` bytes equal `baseline` bytes | **promote** — the user did not touch it, so there is nothing to merge |
| C6 | delta status is `modified` and `vault-now` differs from `baseline`, and the three-way merge exits clean | **promote the MERGED bytes** |
| C7 | delta status is `modified`, `vault-now` differs, and the merge conflicts | **refuse-and-report. The note stays in the USER's live version** |
| C8 | delta status is `modified` and the path is gone from `vault-now` (the user deleted it during the run) | **refuse-and-report** — modify/delete is a conflict, and the user's deletion wins |
| C9 | **the promotion allowlist — this spec's `admit`, applied by the primitive to the RESOLVED path, and evaluated once on the candidate before that** | **Where it is applied is part of the rule.** C9 is handed to `writeIntoVault` as its `admit` callback, and the primitive calls it with the path the write actually resolves to, never the candidate path (Table H, the PRIMITIVE's row H1). **The DEFINITIVE application is that one.** The same predicate is ALSO evaluated on the candidate path before any gate runs, which is what makes row C1 orderable ahead of Table D — a denial the candidate form can decide is refused there, with C1's reason, and never reaches a gate. **The two are one predicate applied twice, not two rules: the candidate pass may only REFUSE, never admit**, because a candidate it admits can still resolve into a denied directory and the primitive is the party that finds out. Table C's header owns that ordering and its consequences (added 2026-08-29; the header previously stated C1 as wholly pre-gate, which this cell's "never the candidate path" clause contradicted). Measured motivation: a pre-existing vault symlink — `01-Projects/alias` → `../reports/dreams`, or → `../.claude` — makes a lexically admitted `01-Projects/alias/evil.md` land in a denied directory, and vault containment alone cannot see it because the resolved target is still inside the vault. **Matching is CANONICALISED then CASE-FOLDED, in that order:** the primary filesystem is case-insensitive — measured, a file created as `claude.md` answers to `CLAUDE.md` — so a literal comparison admits `agents.override.md` while the harness still loads it as an instruction file (the repo reasons this way already at `validate.js:1084-1087`). Case folding alone is not enough either: macOS enumerates decomposed names while accepting composed ones, and measured, `nfc.toLowerCase() === nfd.toLowerCase()` is FALSE for the same directory inode — so an instruction-file basename spelled composed and the same name spelled decomposed are one file that rule (c)'s deny-list would match in one form and miss in the other. **Every comparison in this row — the tier prefixes, the ADMITTED `reports_dir` prefix, the basenames and the segment names — normalises to NFC first**, and so does every layout value it compares against. With that settled, a path is admitted when ALL hold: (a) it is under one of the layout's writable tier directories — `identity_dir`, `daily_dir`, `projects_dir`, `skills_dir`, `inbox_dir` (`layout.js:21-29`; `daily_filename` is not a directory) — or under `02-Areas/` or `03-Resources/`; **or under the layout's `reports_dir` — which is ADMITTED, not denied (owner ruling, 2026-08-27). The shipped skill requires the brain to author the report (`skills/wienerdog-dream/SKILL.md:409-425`), so the report is brain content and must be admitted here;** (b) its final component ends in `.md`; (c) its basename is not one of the current harness instruction-file shapes — `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md` — at any depth, AND no path segment is `.claude` or `.codex`, AND the basename is not `.mcp.json`. (a) and (b) are a positive allowlist and close the class M7's remediation asks for — a vault-root `CLAUDE.md`, a `.gitignore`, a `.claude/settings.json` and an Obsidian plugin binary are all outside it without anyone enumerating them. (c) is a **named deny-list of the CURRENT conventions: the product itself already treats `AGENTS.override.md` as a live shadowing convention (`src/adapters/codex.js`), and `CLAUDE.local.md` / recursively-discovered `.claude/**` are current Claude conventions — so `.md` is not a safe content-only extension, and this list is stated as one that will not cover the NEXT convention.** It exists because (a) and (b) cannot reach an instruction file written inside a tier directory |
| M1 | Merge mechanics | **Merge on a COPY; promote only on a clean merge.** Measured on git 2.50.1: `git merge-file` exits 1 and writes conflict markers **INTO the target** — for a divergent edit and for modify/delete alike — so merging on the user's live note would violate the very guarantee refuse-and-report exists to keep. Clean divergent edits exit 0 with correct merged bytes |
| M2 | The merge's git invocation | The merge exit code is a security decision (clean → promote), so the invocation takes the dependency's **constructed-environment** discipline verbatim (`WP-dream-baseline-delta-primitive`, its own Table C — a different spec's letter-space, not row C1-C9 here): an environment BUILT from nothing rather than filtered, config and attribute roots pointed at directories this run created empty, a cwd outside any repository, and the verified absolute executable via `spawnPinnedSync` (`src/core/exec-identity.js`). **This spec does not restate that recipe — the dependency owns it, and its spec is a Done record on main: `docs/specs/done/WP-dream-baseline-delta-primitive.md`, Table C.** Measured here as corroboration, not as the guarantee: an armed `merge=` driver via `core.attributesFile` does not reach `merge-file`, and a hostile global config did not move an exit code. That enumeration is not trusted — this program's record at enumerating git's influence channels is 0 for 4, which is precisely why the answer is construction rather than a blocklist. **Named residual, inherited:** absolute verified invocation prevents PATH selection of an impostor; it does not freeze the executable's bytes. **The cwd rule is also this module's share of CLAIM 2b** (sibling Table F, row 2b) — the merge is the only git this module runs, and it never runs it with a cwd at or beneath the workspace root. The product-wide form of that claim is the pipeline package's |
| M3 | Repository attribute sensitivity | **DISCHARGED here, as the dependency required.** The dependency named this as the successor's obligation. Discharged structurally: classification is `computeDelta`, which is git-free and reads no attributes; the workspace contains no `.git` (sibling Table A, Postcondition 1); and the only git this package runs against workspace content is the merge, under the constructed roots above. There is no path by which a repository attribute reaches a promotion decision |

### Table D — the four gates: input and order

Today all four derive their evidence from git in the vault (`validate.js`
Steps 2 and 3). Under this design none of them consults git: the secret gate
judges the brain's added lines against the baseline, and the other three judge
the MERGED candidate bytes — which include the user's diverging edits, and are
therefore exactly what would be promoted. The **order inverts** relative to
today: today the secret gate runs LAST (`:1212`, after Step 2's three); here it
runs FIRST. **FIRST AMONG THESE FOUR — this table orders the
gates against each other and against the merge, and it does NOT order them
against Table C's rows.** That cross-ordering is decided in Table C's header
paragraph and is not restated here.

**This table states what `promote()` does with the gates it is HANDED.** The
gates are injected (`### Exact contracts`), so this package proves the order and
the input routing against injected gates, and never touches `validate.js`.
Extracting the real four into this input shape, and deleting the enforcement
half that reverts and re-stages (`:1325-1333`), is
`WP-dream-promote-in-workspace`'s work under its own boundary — **a named
handoff, not an omission.**

The EP2 gate is not a two-value gate. Per binding ADR-0034 its disposition is a
**taxonomy**, not `reason|null`: a context-free high-entropy hit is REDACTED,
not refused — the unredacted copy is preserved to quarantine, the added lines
are scrubbed, the sanitized candidate is promoted, the redaction is reported,
and it is counted separately from a hard refusal (`validate.js:1270-1295` is the
shipped redact arm, `:1065-1073` its separate counters). So EP2 returns one of
{pass, refuse-with-reason, redact-with-sanitized-bytes}; the other three gates
stay `reason|null`.

**Unscannable content is a REFUSAL, never a pass.** The delta primitive returns
no line numbers for a binary record — deliberately, so the consumer "withholds
what it cannot scan" (`delta.js:517-520`) — and an EP2 gate defined only over
added lines would see an empty scan and pass it, after which nothing else stops
an ordinary `.md` and it is promoted raw. Today's validator does the missing
work explicitly (`validate.js:1240-1256`: binary staged content "cannot be
secret-scanned; not committed"), so passing it would be a regression against
shipped behaviour. **A delta record marked binary, or carrying bytes that are
not lossless UTF-8, is refused by EP2 with that reason** — the empty scan is
never evidence of safety.

| Gate | Today | Decision input here | Position | Refusal remedy |
|---|---|---|---|---|
| EP2 secret gate (ADR-0034) | `validate.js:1212` — `git add -A` then `git diff --cached --numstat` per path | the delta's `addedLineNumbers` and derived scan text over the workspace's after-bytes vs the baseline — exactly the bytes this run is responsible for, which is the same property the staged-diff form had | **BEFORE the merge** | **per ADR-0034's taxonomy:** a hard secret → withhold from promotion + preserve to quarantine; a context-free high-entropy hit → **redact** (scrub the added lines, preserve the unredacted copy to quarantine, promote the sanitized candidate, report it, count it separately). Both quarantine writes are the GATE's own act, not this module's — **and what they PRODUCE travels back in the gate's result on the PRESERVATION RECORD, which every preserving arm carries — this one included: Table Q rows Q1 and Q9 own that shape, and the only-copy invariant Q4 binds every party that could destroy a working copy.** **There is nothing to revert**, because nothing was written to the vault: the enforcement half that reverts, re-stages and drops index entries (`:1325-1333` is its revert core) has no subject and goes — in the pipeline package. **No line count is stated here** |
| Skill-body guard (ADR-0020) | `validate.js:1188` `skillBodyViolation(vaultDir, rel, change, layout, registry, date)`, which additionally reads `HEAD:<rel>` (`:341`) and `HEAD:<ledgerRel>` (`:399`) | **the merged candidate skill bytes, the BASELINE skill bytes, the BASELINE ledger bytes, the ownership-registry snapshot, `rel`, `layout`, and the run date.** **Its authorizing input is the BASELINE ledger, never the post-brain one** — otherwise the brain authorizes its own skill rewrite within a single run. The two `HEAD:` reads become baseline reads; nothing else about the gate changes | AFTER the merge | refuse-and-report; the note stays in the user's live version |
| Tier-3 floor | `validate.js:1195` `tier3Decision(vaultDir, rel)`, which reads the file | **the merged candidate bytes, plus `rel` and `layout`** — enough to establish whether the gate applies at all. The frozen A0 profile it consults is process state, not run evidence, and is unchanged | AFTER the merge | refuse-and-report |
| Ledger validation | `validate.js:1157` `ledgerViolation(vaultDir, rel, change, layout, registry, extractsBySession)`, which additionally reads `HEAD:<rel>` (`:556`) and this run's extracts (`:601`) | **the merged candidate ledger bytes, the BASELINE ledger bytes, the paired SKILL.md bytes selected by the atomicity row's pair decision, the ownership-registry snapshot, THIS RUN'S EXTRACTS keyed by session, `rel`, and `layout`** | AFTER the merge | refuse-and-report |
| **The gates' evidence is enumerated, not summarised — and WHY (round 3, F2)** | — | — | — | an earlier form of the three rows above said "the merged candidate bytes" and stopped. **Measured, that is false of all three:** the skill guard takes a registry snapshot and the run date, the ledger validator takes a registry snapshot and `extractsBySession`, and both read committed baselines. **Their verdicts are therefore NOT functions of the candidate bytes** — identical ledger bytes must be refused or admitted depending on whether the named session appears in this run's extracts and invoked the parent skill (`validate.js:590-607`). A spec that understated this would let an extraction preserve the byte checks and silently drop ADR-0020's ownership, history and invocation-binding controls, while passing every case the spec listed. **Two rules follow: (a) each gate receives every value its row names, and (b) NO gate may substitute a vault re-read or a git query for any of them** — G7 forbids the git route and Table S row S4 forbids the re-read route, so the values must arrive as inputs or the gate cannot be built |
| **The `date` INPUT'S SHAPE — decided here, because this table owns what the gates are HANDED (added 2026-08-30, routed by the PR gate's round-4 finding 5 as a SPEC FAULT)** | — | — | — | **`date` must match `/^\d{4}-\d{2}-\d{2}$/`, and `promote()` refuses to run on any other value** — thrown with the module's other argument checks, never a per-path refusal, because a malformed `date` is a caller bug and not a policy outcome. **The shape is a contract rather than an implementer's guess because `date` reaches two consumers that BUILD A NAME OUT OF IT, and both are owned elsewhere: this row CITES them and restates neither.** (i) The EP2 gate composes the quarantine artifact's basename `<date>-<sanitized-basename>` — **only the basename half is sanitized, so `date` is an UNSANITIZED path component** (`src/core/dream/validate.js:683`, whose own `@param` at `:693` already declares `YYYY-MM-DD`); that artifact's durable lifecycle is `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s (rows Q5 and Q6). (ii) The same value names the report `<reports_dir>/<date>.md`, which `WP-dream-promote-report`'s report row owns. **Why the total pattern and not the weaker "no path separators":** the pattern is a POSITIVE ALLOWLIST — it admits no separator in either direction, no `.` and no `..`, on every platform, and nobody has to enumerate what a path separator is; enumerating is exactly what row C9 rejects for the same reason, and what this program's string-level path reasoning has measured is the containment lesson the Dispatch precondition cites. The pattern also MATCHES what both cited surfaces already spell rather than merely permitting it — **a module looser than its own consumer's declared contract is the gap this row closes**. **It is a SHAPE and not a calendar: `9999-99-99` passes, and nothing in this family needs it not to.** **Corroboration, not a second owner:** the skill-body guard's row above already names the run date among its inputs, and there it is compared against a note's `updated` frontmatter (`validate.js:282`), which the vault writes in the same spelling — so the pattern is also what keeps that comparison meaningful |
| **Why this order** | — | — | — | EP2 runs first and scans the BRAIN's added bytes because those are what the run authored and is responsible for (ADR-0034 is about the AI's accidental persistence); the other three gates run after the merge because a Tier-3/skill/ledger judgment must be made on the MERGED bytes, which are exactly what would be promoted — a gate judging pre-merge bytes would not be judging what is promoted, and that is a data-loss contract, not an implementation detail. **Owner-ruled correction:** the earlier rationale — "scanning the merged bytes would force discarding the user's diverging edits" — is FALSE, because refuse-and-report (C7) already leaves the user's live version untouched. EP2 is pre-merge and brain-scoped by CHOICE, not by that false necessity, and the consequence is a named residual (Security checklist): a secret the USER writes into their own note during the run rides a clean C6 merge into the dream commit unscanned. That is the user's own content in their own vault — the dream commits it but did not author it — and making the secret gate refuse or redact a user's own note was ruled the worse trade |
| **Atomicity: the skill-guard ↔ ledger pair** | — | — | — | the pair promotes **atomically at the DECISION**: both outcomes are decided before either is written, so a policy failure on one refuses BOTH — the guard authorizes the skill from the ledger and the ledger is validated from the skill, and promoting one while refusing the other would leave the vault inconsistent. Enforced by Table E's decide-then-write ordering. **This does NOT claim write-atomicity across the two paths**: if the first `rename` succeeds and the second fails (ENOSPC/EIO/kill), the vault holds a half-applied pair. Same-directory `rename` is atomic for ONE path, not across two, and rollback/crash-replay of a partial publish is the residue-lifecycle successor's subject, named in Out of scope — this row claims decision-atomicity and says so |
| The dream report | `validate.js:1375-1410` | **MOVED — `WP-dream-promote-report` owns the report row, Table Y and Table R.** What stays true here and matters to the gates: the brain writes `<reports_dir>/<date>.md` in the WORKSPACE, C9 admits `reports_dir`, and **three of the four gates above do not match a path under `reports_dir` and pass it through** — the gate rows are what say which gate applies where. Everything else about the report, including the second write and the fallback, is that package's | judged with the rest | that package's |

### Table R — MOVED to `WP-dream-promote-report`

**Cut by the T1 tripwire** (`2026-08-28-promote-split-review-rounds.md`, "T1 HAS
FIRED"). The report's publish decision, its preserve-and-extend fallback, its
gate rules and its four cases are owned by `WP-dream-promote-report` and are
**cited here, never restated**. This spec's surfaces refer to "Table R" by that
name; the name did not move, the ownership did.

### Table E — the promotion write, and the one new window

| Fact / rule | Value |
|-------------|-------|
| Decide, then write — **narrowed (owner ruling, 2026-08-27)** | every path's POLICY outcome — allowlist, merge, all four gates — is decided before **any** vault byte is written, and that is what makes Table D's decision-atomicity row enforceable. **It does NOT mean every outcome is decided first.** The premise-still-holds check is the primitive's `expect` guard and necessarily runs per path at publish time (the primitive's H5), so a path can turn into refuse-and-report during the write phase, after earlier paths are already published. **Decision recorded (the simpler of the two options the ruling offered):** the claim is narrowed rather than the primitive's API split into prepare/commit — a two-phase API buys write-atomicity across paths, which this package already disclaims as the residue-lifecycle successor's subject, at the cost of a second contract surface |
| The same-date second run | two runs on one date share `<reports_dir>/<date>.md`, and under the report ruling that path is an ordinary promotion candidate, so nothing special is needed: run 1 promotes it with `expect` absent (absent from baseline, absent from the vault); run 2 finds it in the baseline because `reports_dir` is copied in, the brain rewrites it, and it promotes as a `modified` with `expect` set to the vault's current bytes. **The append-based workaround is not needed and is forbidden** — it was what re-opened the symlink-following defect |
| **The publish goes through the primitive — this spec writes no vault byte itself** | every promoted path is published by `writeIntoVault` (Table H): the resolved path is what policy judges, nothing is written on or through a symlink, no partial content is ever observable at the target, the publish is conditional on the caller's premise still holding, and the published bytes come back. **Those are the primitive's OBSERVABLE properties, which is all a consumer may restate.** **This spec does not restate that discipline — the primitive owns it.** What this spec supplies is the two caller-side arguments: `admit` (Table C's policy, applied by the primitive to the RESOLVED path) and `expect` (the `vault-now` bytes the decision was made against). A promotion that writes the vault by any other route is a defect, and the acceptance criteria assert the seam |
| **The compare→promote window** | the only genuinely new window this direction introduces, and it is **NARROWED, not closed**, to milliseconds against today's minutes-long silent window. The narrowing is the primitive's `expect` guard (its row H5); this spec's obligation is to PASS the right bytes — the `vault-now` bytes the decision used — and to turn `{written:false}` into refuse-and-report. **The residual is the primitive's and is inherited here unchanged:** a user save landing between the re-read and the `rename` is still lost |
| Promotion accounting | every path gets exactly one recorded outcome: `promoted`, `redacted` (EP2 sanitized-and-promoted, Table D), or `refused` with a reason. **The report has no outcome in this package's accounting** — `WP-dream-promote-report` adds it, and its fallback publish is never recorded as a normal promotion. The dream report's enforcement section is written from that record. A path with no outcome is a bug, and the acceptance criteria assert the partition |
| **The staged bytes — a HANDOFF to `WP-dream-promote-in-workspace`, stated here because this table owns the rule** | the dream commit must contain **nothing but the run's NAMED commit set, each member carrying ITS CLASS's decided bytes** — never a wholesale stage, and never a fresh read of a path. **The set has three classes and each names its own byte source, because they do not share one (round 2 of the quarantine-surface review, finding 4):** (i) **promoted and redacted outcomes** — the bytes the primitive returned, governed by Table S; (ii) **the published report arm** (`promoted` or `fallback`) — the same discipline, `WP-dream-promote-report`'s arms, governed by Table S row S2; (iii) **the code-owned `reports/warnings.md`** — **not a `promote()` outcome at all and outside Table S entirely**: it is written by `WP-quarantine-warnings-file` at run points this module never sees, and its decided bytes are the commit-time render defined by `WP-dream-promote-in-workspace`'s **row G8, third clause**, which this row CITES and does not restate. **An earlier form of this row said "only promoted paths, and the DECIDED bytes", which row G8's named set falsified** — the shorthand read as an exhaustive contract, and two contracts that cannot both be satisfied literally are a defect however harmless the intent. **This module still supplies bytes for classes (i) and (ii) only**; class (iii) needs nothing from it. The DECIDED-BYTES half is the one a path-shaped implementation misses: staging re-reads the working tree, so a user save landing between the publish and the staging call is what enters the commit, ungated. Measured: with a save in that gap, `git add -- <path>` stages the user's post-publish bytes. **For classes (i) and (ii) the committed content must therefore be the bytes the primitive returned (the primitive's H6), not a fresh read of the path** — which is also what keeps a refused staging object surviving under the primitive's H7 (Table C, C1) out of the commit that a wholesale `git add -A` would have swept it into. **Class (iii) obeys the same no-fresh-read discipline through a different source:** its bytes are composed at commit time from the transcript quarantine ledger, never read back from the vault path, which is why a stray edit to that file cannot enter the commit either. **Which bytes those are, which outcomes carry them, and what a consumer may derive from them is TABLE S — extracted after two consecutive rounds landed here, and cited rather than restated.** **How that is achieved is the implementer's — round-4 CUT ruling:** an earlier draft prescribed `git hash-object -w --stdin` and `git update-index --cacheinfo`, and manufactured two contradictions doing so. Those findings dissolve with the prescription. ADR-0012's "one dream run = one git commit in the vault" is unchanged. **This module makes no commit and asserts nothing about one; it supplies the decided bytes per Table S so the pipeline package can satisfy this rule, and that package's acceptance criteria assert it** |

### Table Q — the EP2 gate's result, and what promotion does with it

**Extracted in pass (b)** from the step-(a) inventory
(`2026-08-28-promote-split-inventory.md`, items I063–I072), after round 4's F2
and all four of the measurement's GAP-INTERFACE items landed on one contract:
**what the EP2 gate produces besides a verdict.** Table D owns each gate's
INPUT; this table owns the EP2 gate's OUTPUT and what promotion does with it.
**It does NOT own the durable lifecycle behind that output** — the boundary the
2026-08-29 reconciliation drew, restated in the paragraph below and in this
table's rows Q4, Q5 and Q6. Table D's EP2 row and Table R's report rules cite
it.

**Why it is a table and not a sentence in Table D:** the shipped arm produces a
durable artifact, a name that is not predictable, a report line and a refusal
arm that can follow the preservation, and four rounds plus one blind measurement
found the same thing — a verdict-only interface silently drops all of it.

**RECONCILED 2026-08-29, after two PR-gate rounds put five findings on this one
contract** (logbook: `2026-08-29-promote-module-pr-gates.md`). **MERGE-ORDER
DEPENDENCY, stated so a maintainer merging in the wrong order sees it: that
logbook entry lives on branch `wp/dream-promote-module` (commit `3e37237`) and
is NOT on `main`. If this amendment merges first, the citation dangles until
that branch lands.** What changed, and
the boundary the pass drew: **this table owns what the EP2 gate's RESULT carries
into promotion and what promotion does with it. It does not own the durable
lifecycle behind that result.** The retention prune, the identity-gated deletion
of a redundant copy and the preservation-failure abort are decided, asserted and
mutation-covered in the shipped `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`;
**rows Q5 and Q6 are PURE POINTERS at it and restate none of it; row Q4 is a
HYBRID and is not swept in with them** — it points at the shipped enforcement
(that package's Table B row B3b and its Table Q row Q18) AND owns the invariant
as it binds THIS family, which is why `WP-dream-promote-in-workspace`'s row G5
cites Q4 rather than the shipped package. Rows Q5 and Q6 kept their NUMBERS:
renumbering the rows of a table other packages cite by number retargets those
citations silently, so in this family a row id is never reused and never
shifted, whether or not that particular row is cited today.

**THE SHAPE RULING, 2026-08-29 — one owned record, carried on every preserving
arm.** Two design rounds after the reconciliation above found the same disease
twice more, and a stop criterion pinned before those rounds routed it to the
owner rather than to a fifth patch. **The diagnosis the owner ruled on: the EP2
gate's OUTPUT had never had a single owned shape.** Four times this family
produced a fact about a preserved copy and decided its carrier separately — the
redact-then-refuse artifact, the prose mitigation for it, the hard-withhold
arm's artifact, and consequence 2's keep-suffix — and each time a review, not
the surface that produced the fact, found the carrier missing. **The ruling:
ONE typed preservation record per candidate, carried on EVERY arm that
preserved anything — the hard withhold included — with every fact about a copy
a TYPED FIELD on it, never prose and never a new per-arm carrier.** Row **Q1**
is where the arms carry it and row **Q9** is where its fields are decided; rows
Q2, Q3 and Q8 were swept onto it in the same sitting, along with `refused[]`,
the report package's report arm, its Table N channels, its Table R rows and
the acceptance criteria of all three specs. **What it deleted: the standalone
`refused[].artifact` field and the standalone `redacted[].artifact` field.** A
fifth field on a fifth arm was the treadmill the criterion existed to stop.

**THE SHAPE RULING'S SECOND HALF, 2026-08-29 (round 3) — the record states its
provenance PER FIELD.** The first round against the ruled shape found that one
of the record's three fields is not what the shape implicitly claimed all three
were: `artifact` and `location` are **gate-reported**, and `remediation` is
**assigned at outcome time, by THIS MODULE**, because the gate runs before the
merge and cannot know the candidate's outcome when it preserves a copy. Row Q2's
"every field" claim is narrowed to the gate-filled fields accordingly. **The
defect was not a wrong field — it was an IMPLICIT provenance claim about the
record as a whole, which measured false for one field.** A record filled by two
parties at two times, saying so nowhere, produces that defect again on the next
field anyone adds. **So row Q9 states, per field, WHO fills it and WHEN, the
`GateReportedCopy`/`PreservedCopy` split carries the same statement in the TYPE,
and the Mirrored Surface Checklist forbids adding a field to Q9 without both.**
**`remediation` remains a READ for every downstream surface, and the reason is
exact:** this module is where that fact FIRST EXISTS, not a consumer re-deriving
a value the gate returned — it returned none. Q9's no-re-derivation rule binds
the surfaces downstream of `promote()`'s return, which is the distinction a
careless wording turns into an accusation against the module.

**THE DISCLOSURE-PARITY RULING, 2026-08-29 — the report body gets the redaction
facts, and they travel as a FIELD.** Round 3 closed with a residual this table
could not carry: `WP-dream-promote-report`'s `report` union held no scrubbed-line
count and no detector labels, so a body EP2 REDACTED and promotion published
sanitized could never get the line an ordinary redacted note gets. **The owner
ruled the gap closed — the report body is an ordinary candidate, PARITY OF
DISCLOSURE is owed to it, and the fact travels as a FIELD of the disposition
shape: not as two loose fields on that union, and not as a second carrier beside
row Q9's record.** **WHERE the field sits was left to measurement, and the
measurement moved it OFF the record:** the scrubbed-line count and the labels are
per-PATH facts produced by one scrub, while row Q9's record is per-COPY and its
largest case — the redact arm's fall-through, which preserves two copies — has no
scrub at all. So the accounting is its own one-field shape, row **Q10**, and it is
NOT a field of Q9. **Row Q10 states each field's filler and moment exactly as row
Q9 does**, because the per-field provenance rule ratified in round 3 binds every
field of a shape that CARRIES ONE PARTY'S FACTS TO ANOTHER — row Q9's record,
row Q10's accounting, and `WP-dream-promote-report`'s `accounting` field, whose
`reason` is the vault-write primitive's — and not only the record's.
**The third shape's per-field provenance is DISCHARGED in that spec's report
row, which is its single owner (round 5's C1): this preamble BINDS the rule and
does not own that field, and no surface in this family but that row states its
fillers and moments.**
**NARROWED 2026-08-29 by round 4's F-4, and the narrowing is measured against
this family's own fields:** the rule was written down as "every field this family
adds", which this family's own surfaces falsify — `report.bytes`,
`report.outcome`, `redacted[].rel`, `refused[].reason`, `records[].path` and
their kin state neither a filler nor a moment, and none is owed one, because the
party that fills each is the party that returns it. **A universal its own
surfaces contradict is the unbuildable shape `WP-dream-promote-report`'s
`### Exact contracts` already records once**, and the narrow form is what makes
the rule checkable: "who fills this, and when" is a real question exactly where a
shape crosses a party boundary.

**LETTER-SPACE WARNING, and it is load-bearing for every citation in this
table.** `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` carries its own
tables in its own letter-space, and several of its letters are this family's
letters meaning different things.
**Every citation of that package in this family names the spec path, never the
bare letter, and a citation of a row in a colliding letter names its owner
(`the primitive's H7`, not `H7`).** **WHICH letters collide is the canonical
map's to state, and this surface deliberately does not list them**
(`docs/specs/logbook/2026-08-29-promote-family-map.md`): a member list in a
citing surface is the defect this family measured twice, and on 2026-08-29 a
list here was one of four surfaces giving three different answers.

| # | Fact / rule | Value |
|---|---|---|
| Q1 | **The taxonomy, and WHICH ARMS CARRY THE PRESERVATION RECORD** | `{ok}` \| `{refuse, reason, preserved}` \| `{redact, sanitizedBytes, redaction, preserved}`. **`redaction` is the REDACTION ACCOUNTING — row Q10 decides its fields, WHO fills each and WHEN, and which shapes may carry it; this row restates none of that.** What THIS row decides about it is that it is on the redact arm ALONE: the other two arms have no `redaction` field at all, because no scrub happened on them. **An earlier form of this row defined `lines` and `labels` inline, which made this the second surface deciding them once the report half needed the same shape** (2026-08-29, the disclosure-parity ruling). **`preserved` is the PRESERVATION RECORD — row Q9 decides its entries, its fields, and WHICH PARTY fills each field and when; this row restates none of that. On these GATE arms it carries the gate-filled fields only (`Array<GateReportedCopy>`), because the gate reports no `remediation`; this module completes every entry before the record leaves `promote()`.** What THIS row decides is which arms carry it: **`{ok}` has no `preserved` field at all** (nothing was preserved and nothing may be inferred), **the redact arm carries it**, and **the refuse arm carries it too — the hard withhold included.** It is REQUIRED wherever it appears and EMPTY when that arm preserved nothing, which is a positive statement of absence rather than a missing field (row S2's lesson). **The gap this closes, stated because it is what ended a nine-round loop:** until 2026-08-29 this row gave the refuse arm `{refuse, reason}` while Table D said BOTH quarantine writes are the gate's own act and that what they produce travels back in the gate's result — so row Q8 required a field the taxonomy could not deliver, and a contract that requires what its own taxonomy cannot produce is not implementable |
| Q2 | **THE GATE-FILLED FIELDS ARE REPORTED, NEVER PREDICTED** | the preserving call resolves collisions itself and returns the name it actually used (`validate.js:670-739`), so row Q9's `artifact` is that returned name and its `location` is the directory the gate says it wrote to. A caller that reconstructs either — the name from the date and the path, or the directory from a layout this module does not own (row Q7) — points the user at a file that does not exist, on exactly the runs where two notes collide. **This row exists because the pre-pass-(b) interface had no field for the name at all**, so the only available implementation was to guess. **SCOPE — narrowed by owner ruling on 2026-08-29, round 3, and this is the only thing that changed: this prohibition binds THE FIELDS THE GATE FILLS, which row Q9 names as `artifact` and `location`. It does NOT reach `remediation`, for which the gate reports no value at all** — that field is ASSIGNED by this module at outcome time, and row Q9 owns who fills each field and when. **An earlier form of this row said "every field of it", which asserted of the whole entry a provenance one of its fields does not have** — a false universal that would have sent an implementer looking for a gate value that is not there, and that is the defect the per-field statement in row Q9 exists to make impossible for the next field anyone adds |
| Q3 | **For a copy on the REDACTED shelf, the report line is the user's ONLY route back to it** | `state/quarantine/redacted/` deliberately carries no digest banner — measured in the banner's own source, which excludes that subdirectory and says the dream report announces it instead (`src/core/digest.js:847-849`, and `listSecretQuarantine` at `:853-863` is what builds the list) — so nothing else announces the file. Table R's report therefore carries one line per preserved copy, naming the path and the entry's fields, and for a redaction the `redaction` accounting row Q10 owns as well — the shape shipped today at `validate.js:1393-1410`. **Losing the line loses the copy in practice, which is why this is a data-loss row and not a reporting nicety.** **This row does NOT make the same claim for the WITHHELD shelf, and measuring that was part of the shape ruling:** a withheld copy is announced by that same shipped state-driven banner (`digest.js:817-822`). It is on the record anyway, and row Q9 says on what ground — contract coherence and typed composition, not an unannounced file |
| Q4 | **THE ONLY-COPY INVARIANT — the highest-damage item the measurement found (I067)** | **nothing may destroy the working copy of a note unless some durable artifact byte-identically holds THE BYTES THAT ARE THERE NOW.** Not an earlier version: the note's owner can have saved it mid-run, and a copy of what it used to be is not a copy of what they wrote. **The SHIPPED enforcement of it — the fail-loud abort (`validate.js:1299-1324`), the condition that fires it and every field of the message it raises — is decided in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`** (that spec's own letter-space: its Table B row B3b decides the condition, its Table Q row Q18 decides the message), **is asserted and mutation-covered there, and is restated NOWHERE here.** An earlier form of this row summarised that message as distinguishing three states; measured against the owner, the message decides FOUR fields and its identity disposition has three values of its own — so the summary was both weaker than the thing it summarised and already drifting from it. **What is THIS family's, and is genuinely new:** under promotion the destruction risk moves but does not vanish — the workspace, not the vault, is what teardown removes — so **the invariant binds the pipeline's teardown too, and `WP-dream-promote-in-workspace` row G5 cites this row.** No surface may weaken it to "a copy was attempted" |
| Q5 | **Deleting a redundant copy — NOT this family's contract, and this row is a POINTER** | decided in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, **Table R consequence 2** (that spec's own letter-space), which owns the byte-identity guard, the keep-combinations and their reason suffix, and which is fault-injected and mutation-covered there. **Restated nowhere here.** Until this reconciliation pass this row carried a summary of that rule and an acceptance criterion for it — in a package whose Deliverables cannot reach the state directory at all (Q7), against a shipped, `Done` owner that forbids restatement. A pointer is the only form that cannot drift |
| Q6 | **Retention of `redacted/` — NOT this family's contract, and this row is a POINTER** | decided in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, **Table N** (that spec's own letter-space), which states that every retention fact is decided there and forbids **any surface restating a number from it** — the cap, the trigger, the candidate set, the ordering, the cap-yields precedence, the overshoot's lifetime and its best-effort failure. **Restated nowhere here.** Until this reconciliation pass this row restated five of those seven facts, including the cap's literal value, and omitted two; the one open gap in that contract has its own package, `WP-ep2-retention-prune-timing-test`. **`state/quarantine/` itself is unbounded and that is decided there too** |
| Q7 | **Where the preservation happens, where it does not, and WHO CAN EVIDENCE WHAT** | the GATE preserves (Table D), because it is the party holding the pre-change bytes. **This module never touches the state directory**, which is also why rows Q5 and Q6 are pointers and why the durable lifecycle behind them belongs to the package Q4 cites. What this module does is three things: CARRY Q1's fields — the preservation record included — into its OWN RETURN, which is what the accounting and the report are BUILT FROM (Q8 and Q9), this module composing neither of them (`### Exact contracts`, Deliverables — **corrected 2026-08-29, round 4's F-1: this cell said "into the accounting and the report", which claimed of this package the very composition three other surfaces here deny it**); **ASSIGN the one field of that record the gate cannot fill, `remediation`, at the point this module records the path's outcome** (row Q9 owns the per-field provenance and its permitted values, and this row restates neither); and **refuse to publish when the redact arm reports an EMPTY preservation record.** **ASSIGNING IS NOT RE-DERIVING, and the distinction is the one row Q9's no-re-derivation rule turns on:** this module is where `remediation` FIRST EXISTS, because the gate returned no value for it, so there is nothing here to re-derive FROM. The prohibition binds the surfaces DOWNSTREAM of this module's return, and what it forbids them is a SECOND statement of a fact the record already carries. **That refusal is a SANITY CHECK on the gate's own result, not Q4's enforcement, and calling it the latter would be the weakening Q4 forbids:** this module cannot read a preserved copy, so it cannot tell "a copy exists and matches" from "a copy exists and does not" — only the gate holds both sides of that comparison, and only the gate and the pipeline's teardown destroy anything. **A match-verdict field on Q1 was considered and REJECTED:** it would put a second party's judgment on evidence only the first party has, and would duplicate a test that is already decided, asserted and mutation-covered in the package Q4 cites |
| Q8 | **A REFUSAL REACHED AFTER EP2 RAN CARRIES THE GATE'S PRESERVATION RECORD — typed, never in prose** | the gate preserves and reports BEFORE this module knows whether the path will publish, because Table D positions EP2 ahead of the merge. Everything downstream of EP2 can still refuse the path: the C3–C8 state checks, a conflicting merge, any of the three post-merge gates, the skill/ledger pair refusal, the primitive's `expect` guard, and **the primitive's application of C9's `admit` to the RESOLVED path — the resolved-only half of C1, which Table C's header separates out precisely because it CANNOT precede the gates.** That last route is the one the 2026-08-29 design round found, and it is why this row rather than Table C's header is the home for what such a refusal carries. The copies are on disk by then, a copy on the redacted shelf is announced by nothing else (Q3), and the path is not in `redacted[]` — so with no carrier their names leave the return entirely and an unredacted copy of secret-shaped content becomes a file nothing points at. **Therefore `refused[]` is `{rel, reason, preserved}` (Table S, row S3), where `preserved` is row Q9's record: REQUIRED, and EMPTY when the gate preserved nothing for that path or never ran for it** — a positive statement of absence rather than a missing field, because an optional field spanning both cases is the defect row S2 already records one field over. **The reason string names no copy, and no surface may make prose the carrier.** The shipped mitigation did exactly that and produced its own defect inside one review round: the pair refusal embeds its sibling's reason, so the SIBLING's copy was named first and a report composed by reading the name back out would have pointed the user at the wrong file — the same class of harm Q3 calls data loss, one file over. **One fact, one field, one place.** **THE RULE IS ABOUT THE SHAPE, NOT ABOUT ONE ARRAY: any arm of this family's return that can exist AFTER EP2 PRESERVED SOMETHING for that path carries the record the same way, required and possibly empty — a REFUSING arm and a PUBLISHING one alike.** **Widened from "any arm that can carry a refusal" by round 3's F1, and the narrow form was wrong about this package's own return:** the redact arm PUBLISHES a sanitized note and has carried the record since the shape ruling, so a rule quantified over refusals never described it. The other arms are not in this package — **EVERY arm of `WP-dream-promote-report`'s `report` union**, whose body is a promotion candidate under `reports_dir` that EP2 judges: the gate can redact the body and see the SANITIZED body publish (`outcome:'promoted'`), or withhold it and see the fallback publish (`outcome:'fallback'`), or preserve a copy for a body that is then refused (`outcome:'refused'`) — and all three preserved a copy that nothing else announces. That package's `### Exact contracts` owns its union's shape and this row is the rule it applies. **Scoping this row to `refused[]` alone left the report's own copy unannounced for one round** (round-zero pass, 2026-08-29), **and scoping it to REFUSALS left the report's two published arms uncovered for one more** (round 3) — the same omission twice, one surface over each time. What the report SAYS about a copy is `WP-dream-promote-report`'s Table R; returning it is not delivering it. **THE NARROWING THIS ROW USED TO CARRY IS HISTORY, and is recorded so it is not re-derived:** until the shape ruling this row scoped a single `artifact` field to the redact-then-refuse arm, which is why a review correctly concluded that consequence 2's keep-suffix could not ride it. That field no longer exists. **Row Q9's fields are not scoped by this row** — they carry whatever the gate preserved, on whichever arm |
| Q9 | **THE PRESERVATION RECORD — one entry per preserved copy; every fact about a copy is a FIELD of it, and every field states WHO FILLS IT AND WHEN** | `Array<{artifact:string, location:string, remediation:'restore-or-delete'\|'delete'}>`, one entry per copy the EP2 gate preserved for that candidate, in the order the gate wrote them. **This row is the single place a copy's facts are decided — AND the single place each field's PROVENANCE is decided: WHO fills it and WHEN. Every field below states both, and a field added to this record without stating both is incomplete.** **Why provenance is per FIELD rather than per record (owner ruling, 2026-08-29, round 3):** this record is filled by TWO parties at TWO times, and until round 3 the contract said so nowhere — row Q2 claimed the whole entry was gate-reported, which measured false for one field. A record whose fields are filled by two parties at two times, with only a sentence about the record as a whole, produces that defect again on the next field anyone adds. **Every surface DOWNSTREAM of `promote()`'s return READS a field off an entry; none re-derives one, and none adds a carrier beside it.** **`artifact` — FILLED BY THE EP2 GATE, AT GATE TIME.** The copy's basename as the gate reported it: the preserving call resolves collisions itself and returns the name it actually used, so the name is reported and never predicted (row Q2). **`location` — FILLED BY THE EP2 GATE, AT GATE TIME.** The state-relative DIRECTORY that copy sits in, again as the gate reported it and under the same prohibition (row Q2) — composed with `artifact` it is the path the user needs, and it is REPORTED rather than constructed here because this module never touches the state directory (row Q7): the two places a preserved copy can sit are the two shelves of the glossary's **secret quarantine**, and their layout, retention and disposal are `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s (rows Q5 and Q6). **`remediation` — FILLED BY THIS MODULE, AT OUTCOME TIME. The gate reports no value for it** (owner ruling, 2026-08-29, round 3). It is what the report tells the user to do with that copy, and it takes exactly two values: **`restore-or-delete`**, for a copy that is the pre-scrub original of content this run PROMOTED in sanitized form, which is the redact arm's value and the guidance the shipped redact-in-place report section carries (`validate.js:1399-1410`); and **`delete`**, for a copy belonging to a path nothing was promoted for, which is every refusing arm's value on both shelves — the note never entered the vault, the workspace is destroyed with the run, and what the copy holds is brain-authored text the product refused. **WHY THE GATE CANNOT FILL IT:** EP2 runs BEFORE the merge (Table D), so at the moment it preserves a copy the candidate's outcome is not decided — everything in row Q8's route list can still refuse the path afterwards. A gate-filled value would be a guess that is wrong on exactly the redact-then-refuse route, and telling a user to `restore` content the vault never took is worse than telling them nothing. **The value is knowable at exactly one moment, which is when this module records the path's outcome, so that is where it is assigned.** **AND THIS MODULE IS NOT A CONSUMER RE-DERIVING IT — the distinction the rule above turns on, stated because a careless wording makes the module look like the violator.** The module is where `remediation` FIRST EXISTS: the gate returned nothing to re-derive from. The no-re-derivation rule binds the surfaces downstream of this module's RETURN — this family's report and pipeline halves included — and what it forbids them is a SECOND, independent statement of a fact the record already carries. Assigning it once, in one place, at the only moment its value is knowable, is precisely what makes every other surface a reader. **A FIELD IS STILL THE RIGHT SHAPE, and the reason is unchanged:** its value is a function of the ARM today, and a surface that recomputed it from the outcome would be writing that second statement — which is exactly how a design round came to read two correct surfaces as a contradiction when, measured, they were each right about their own arm. A field makes the difference visible, and makes a future arm with a third value a change to this row rather than a sweep. **HOW MANY ENTRIES an arm carries is not decided here:** the redact arm preserves one copy, a refusing arm carries an entry for each copy the gate preserved AND KEPT, and which copies those are on any given run — including whether the redact arm's copy survives a withhold — is decided in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` and read off the record here. **NAMED RESIDUAL, and it is outside this family's boundary:** the withheld shelf also carries a shipped, state-driven digest banner whose guidance is restore-or-delete (`src/core/digest.js:817-822`), so under promotion that banner will offer restore for a copy this record marks `delete`. `src/core/digest.js` is in no Deliverables table in this family and is not changed here; reconciling the banner with promotion's provenance is not this family's act, and naming it beats discovering it |
| Q10 | **THE REDACTION ACCOUNTING — one PER-PATH fact in ONE field, both halves gate-filled, and NOT a field of row Q9's record** | `{lines:number, labels:string}` — the `RedactionAccounting` typedef of `### Exact contracts`, carried as ONE field named `redaction`. **`lines` — FILLED BY THE EP2 GATE, AT GATE TIME.** How many of the run's ADDED LINES that path's scrub RAN OVER (`validate.js:1287`, `addedLineNumbers.length`), pushed only on the branch where the scrub is verified and staged (`:1284-1293`). **THIS IS THE SHIPPED TRUTH, AND THE GAP IS NAMED IN PLACE (owner ruling, 2026-08-29, round 4's B1).** `scrubAddedLines` rewrites EVERY added line as `scanAndRedact(line).text` (`:839-841`), and a clean added line is rewritten BYTE-IDENTICALLY — so this value counts the lines the scrub PROCESSED and can exceed the number of lines whose bytes actually CHANGED: ten added lines carrying one secret report ten. **The shipped report line already renders exactly this value** (`:1402`, `` `${r.lines} line(s) scrubbed` ``), so this row is the spec catching up to the product rather than a new inaccuracy, and the word "scrubbed" on that line is the product's. **NARROWING IT IS ROUTED, NOT PERFORMED HERE — AND THE ROUTED INPUT IS NOW PENDING RATHER THAN MERELY UNBUILT (owner ruling, 2026-08-29, round 5's C4: the authorization is NOT granted):** the change — the gate returning the number of added lines whose POST-REDACTION bytes DIFFER from their captured bytes — is a NAMED INPUT to `WP-dream-promote-in-workspace`'s row **G7**, the package that owns `src/core/dream/validate.js` and extracts this gate, **and it is BLOCKED there on an owner decision against a value PINNED in a shipped `Done` package**: `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387` pins the dream report's redaction line and states that `<n>` is `addedLineNumbers.length`, with every byte outside the placeholders literal. **Row G7 QUOTES that pin in place; this row cites it by path and restates neither the format nor the rules around it. If the owner authorizes the change at the pipeline round, the settlement is an amendment to that `Done` spec.** Until that decision, **no surface in this family may describe `lines` as a count of CHANGED lines** and the SHIPPED count is what an implementer builds; when it lands, the change is to this field's meaning and not to its shape, its filler or its carriers. **`labels` — FILLED BY THE EP2 GATE, AT GATE TIME.** What the detectors matched, as code-owned label names joined into one string, and NEVER the matched bytes (`validate.js:1268` and `:1288`). **NO SURFACE MAY RE-DERIVE EITHER, and no later party could:** only the gate holds the pre-scrub bytes and the added-line set it judged (Table D's EP2 row), so a value recomputed downstream is a different value wearing the same name. **NO GATE/MODULE SPLIT HERE, unlike row Q9's record, and it is stated rather than left to symmetry:** both fields have ONE filler at ONE moment, so the `GateReportedCopy`/`PreservedCopy` split that carries per-field provenance in the TYPE has nothing to express — this module passes the object through untouched and completes nothing on it (row Q7's list of what this module does is unchanged by this row). **WHY THIS IS PER-PATH AND NOT A FIELD OF ROW Q9's RECORD — measured, and this is the question the disclosure-parity ruling left open.** (i) The case with the MOST preserved copies has NO accounting at all: when the redact arm FALLS THROUGH to the withhold, the gate has already written a redact-shelf copy (`validate.js:1277`) and then writes a withheld one (`:1298`), and it pushes no accounting, because the push happens only on the successful-scrub branch — so a field on the record would be null on BOTH entries of the two-entry case. (ii) On the ordinary redact arm one accounting would have to be duplicated onto every entry of that path's record, which is the two-carriers-for-one-fact shape row Q8 exists to close. **One scrub, one path, one accounting: row Q9's record answers WHICH COPIES the gate wrote, and this row answers WHAT THE SCRUB DID.** **WHY ONE FIELD AND NOT TWO (owner ruling, 2026-08-29):** the two values are present together or not at all, and two loose nullable fields make that an invariant the TYPE cannot express — the failure mode row S2 records one field over. A named shape declared ONCE is also what lets an ordinary note's redaction line and the report body's be composed from the SAME shape. **WHERE IT MAY TRAVEL — and this scope is ARGUED, because the ruling settled the parity and left the location open.** On the GATE's redact arm and on every `redacted[]` entry it is REQUIRED and NON-NULL: membership of either IS the redaction. On `WP-dream-promote-report`'s `report` union it is REQUIRED and NULLABLE on the **`promoted` arm alone**, `null` being the positive statement that the gate did not redact the body (row S2's lesson). **The report body is an ordinary promotion candidate — that package's report row carries the sentence as its own heading — and parity of disclosure is owed to it**, so the accounting reaches the body's disposition exactly where it reaches an ordinary note's: **on the arm that means THIS CANDIDATE'S SANITIZED BYTES WERE PUBLISHED.** Measured against that package's Table R, `promoted` is the only such arm — `fallback` means the brain's body was NOT published and the code section was published in its place, and `refused` means nothing was written at all. **Putting the field on BOTH published arms was considered and REJECTED on that measurement:** on `fallback` and on `refused` a scrubbed-line count would describe bytes no vault holds, which would hand the report body a disclosure its ordinary-note analogue is not given — an ordinary note redacted and then refused lands in `refused[]`, which carries its copies on row Q9's record and no accounting — in the very pass that exists to make the two equal. **NAMED RESIDUAL, argued rather than slipped:** on a redact-then-refuse, an ordinary note's or the body's, the count and the labels are lost, so the user learns WHICH file holds the unredacted copy and not WHAT KIND of secret the detectors matched. That loss is PRE-EXISTING, is not created here, and the disclosure-parity ruling did not reach it; closing it later is one field on `refused[]` and on the report's refusing arms plus one sweep — ordinary work under this family's stop criterion, not an escalation |

### Table S — the decided bytes, and what may be derived from them

**Extracted by the ADR-0031 loop circuit-breaker**, after two consecutive
external rounds landed a finding on this one contract: round 1's R1-1 (the
interface typed paths where the prose promised bytes) and round 2's F2 (the same
defect surviving on the report's arm of the same interface). The breaker's rule
is to stop patching finding-by-finding and pull the contract into ONE canonical
table with registered mirrors. **This table is now the single place the contract
is decided;** `### Exact contracts`, Table E's staged-bytes row, and
`WP-dream-promote-in-workspace`'s rows G8 and G10 cite it and do not restate it.

| # | Fact / rule | Value |
|---|---|---|
| S1 | **What "the decided bytes" ARE** | for any path this module publishes and REPORTS in its return (row S5's scope), the exact buffer `writeIntoVault` returned for it (Table H, the PRIMITIVE's row H6). Not the candidate this module composed, not a read of the target afterwards, and not a digest of either. They are the only bytes any gate judged and the only bytes the vault is known to hold at publish time |
| S2 | **Every published outcome carries them, and the SHAPE is what guarantees it — not the prose** | **published entries are `{rel, bytes}` — BOTH halves required, not the bytes alone (pass (c)).** A consumer that receives bytes without a path cannot stage, count or register them, and this row said "`.bytes` is required" for one round while nothing required `rel`, which is the same defect one field over. `promoted[].bytes` and `redacted[].bytes` are required fields, and `report` is a DISCRIMINATED UNION whose published arms (`promoted`, `fallback`) require `bytes` while the refused arm cannot carry them. **Stated as a shape rule because twice now the prose was right and the type was not:** a return of paths alone (round 1), then an OPTIONAL `bytes` spanning success and refusal (round 2) — the second conforms to its own interface while omitting the bytes on exactly the branch that enters the commit. A rule the type cannot express is a rule an implementation can satisfy and still break |
| S3 | **A refused outcome carries no BYTES, and must not — but it does carry the PRESERVATION RECORD** | nothing was published, so there is nothing to carry, and a field that could hold the candidate would invite a consumer to commit bytes the vault never took. `refused[]` is `{rel, reason, preserved}`; the report's refused arm is `{outcome:'refused', reason, preserved, record}` — that arm's shape, and its union's, are `WP-dream-promote-report`'s `### Exact contracts`, which owns them, and **`preserved` is on EVERY arm of that union**, carried for the same reason and under the same rule (Table Q row Q8). This row's no-bytes prohibition reaches only the refused arm, which is the only one with no bytes to carry. **NO FIELD OF AN ENTRY IS CONTENT**: an entry names and classifies a file the GATE already wrote into the state directory, so it cannot be staged, committed, hashed into the vault or mistaken for a candidate, and the no-bytes rule does not exclude it. **This row enumerates none of row Q9's fields and decides none of them — including which party fills each, which is Q9's per-field provenance.** It is **required and possibly EMPTY**, so "no copy exists for this path" is stated rather than left to a missing field, which is row S2's own lesson applied one field over. **Table Q row Q8 owns WHY the record travels on this arm and row Q9 owns an entry's fields; this row restates neither.** What this row decides is that S3's prohibition is about bytes and stops there |
| S4 | **EVERY fact a consumer derives about a published path is derived FROM these bytes** | and this is deliberately broader than "the staged content". A frontmatter field, a length, a digest, a registry entry — each is derived from the returned buffer, never from a fresh read of the vault path. **Re-reading re-opens the window the publish closed:** a user save landing after the publish would decide what gets committed, hashed or registered, and none of it was gated. **This generalisation is what round 2's F1 needed** — its registry entry reads `id` and `created` out of a promoted `SKILL.md`, and today's code reads them from the vault path (`validate.js:1204`), which is correct only because today the brain wrote that path directly |
| S5 | **SCOPE, stated before the list, because round 3's F4 showed the list without it was false** | this table governs the bytes `promote()` RETURNS to its caller — the downstream consumers of its result. **It does NOT govern this module's own internal use of a `writeIntoVault` return**, of which there is exactly one: the report's second write, whose `expect` is the buffer the first report publish returned. That handoff is owned by `WP-dream-promote-report` — its **report row** and its **Table R**, which state it operatively — and NOT by this spec's two placeholders for them, which point onward and decide nothing (corrected 2026-08-29: this cell pointed at the placeholders, so its target was itself a pointer). Naming the rule here as well would be the restatement this family's citation rule forbids. **An earlier form of this row listed two consumers while S1 quantified over "any path this module publishes", which the internal report handoff falsified** — the scope sentence is what makes the list true rather than the list being widened. **AND THE REPORT PATH IS THE ONE PATH FOR WHICH TWO PRIMITIVE WRITES CAN EACH RETURN A BUFFER, so WHICH of them travels to the caller in `report.bytes` is that package's decision too — its **Table Y, row Y3** decides it, and this row does not** (registered 2026-08-29, round 4's A1; that contract became a lettered table on 2026-08-30, so this citation names a ROW). What row S1 requires of either answer is unchanged: a buffer the primitive returned, never a fresh read |
| S6 | **The downstream consumers, named — S4's universal quantifies over THIS list** | two, both in `WP-dream-promote-in-workspace`: the dream commit (row G8) and the skill-ownership registry (row G10). **A downstream consumer that needs a byte, a field or a digest of a published path and is not in this list is a finding, not a fix** — it means an obligation this family owns has no owner, which is exactly how round 2's R2-1 arose |

### Mirrored Surface Checklist

- [x] Deliverables-table `Notes` cells (each cites its owning table)
- [x] `### Exact contracts`' signature and its return shape
- [x] Acceptance criteria that assert Tables C, D, E, Q and S
- [x] Verification steps (the assertions mirror Tables C, D, E, Q and S)
- [ ] Current-state description (the validator's four gates, the delta
      primitive's binary record, the shipped sanitizer, the skill's report
      requirement)
- [ ] Implementation notes (the merge-on-a-copy trap, the injected gates)
- [ ] Out of scope (what the pipeline package, the residue-lifecycle successor
      and audit finding C2 own)
- [ ] **The package note, the dispatch-precondition block and
      `### Contract table(s)`** — all three cite the canonical table-letter map;
      the `### Contract table(s)` line additionally names THIS spec's own tables
      and is the surface a moved table falsifies first (registered 2026-08-29).
      The note mirrors the citation of the canonical table-letter map and the consumed-by-nothing
      rule; the dispatch block mirrors the pinned base and the containment
      citation. A finding that changes either updates this section too
- [ ] **The containment-by-citation rule** — the dispatch block, Table C rows C1
      and C9, Table E's publish row, and the Security checklist. **No surface
      here may paraphrase a path-containment rule; each cites Table H.**
- [ ] **Every surface that states what a claim establishes** — the Context
      paragraph, rows M2 and M3, the Security checklist, and the acceptance
      criteria. **No surface may say the workspace is not a git repository
      without qualification, none may claim M10's closure (it is the pipeline
      package's), and none may restate Table F's content instead of citing it.**
- [ ] **The EP2 disposition taxonomy** — the `promote()` return shape, Table D's
      EP2 row and its preamble, the promotion-accounting row, and the
      redact acceptance criterion. **No surface may reduce EP2 to `reason|null`
      or drop the `redacted` outcome or `secretDisposition`.**
- [ ] **What the T1 cut removed** — Table R, Table D's report row and the seven
      report criteria are `WP-dream-promote-report`'s. **Their placeholders here
      cite that package; no surface may restate a report rule, and none may
      claim a report outcome in this package's accounting.**
- [x] **Table Q — the EP2 result, and this family's share of the quarantine
      lifecycle.** Its mirrors are the `gates` paragraph, the
      `GateReportedCopy` and `PreservedCopy` typedefs (which are where the TYPE
      carries row Q9's per-field provenance), the `RedactionAccounting` typedef
      (row Q10's, and the one place the TYPE says the accounting has a single
      filler) and the `@returns` block in
      `### Exact contracts`, Table D's EP2
      row, Table C's header paragraphs (which state the consequences of C1's two
      halves — the candidate-decidable one preceding the gates, the
      resolved-only one landing after them on row Q8's arm),
      `WP-dream-promote-report`'s Table R redaction-lines row, its
      preserved-copy row, its Table N channel rows for the record's
      three fields AND its two rows for the accounting's fields, its criterion
      asserting Q3, Q8 and Q10, AND the `preserved` on
      EVERY arm of its `report` union in that spec's `### Exact contracts`
      together with the `redaction` on that union's `promoted` arm, and
      `WP-dream-promote-in-workspace`'s rows G5, G7 and V3 and row G7's
      acceptance criterion, **and that report package's Current-state
      description of `promote()`'s RETURN, which paraphrases which arms carry
      the record and the accounting (registered 2026-08-29 by round 4's F-5,
      having been an unregistered mirror since it was written; that spec's own
      Current-state checklist item names it too).** **Prohibitions, each earned: no surface may reduce
      the redact arm to a verdict plus bytes; no surface may PREDICT any field
      of a record entry instead of reporting what the gate returned (row Q2);
      no surface may weaken Q4's only-copy invariant to "a copy was attempted";
      no surface may make the refusal REASON the carrier for a preserved copy
      (row Q8 — a prose carrier named the wrong file's copy within one round of
      being written); NO SURFACE MAY ADD A SECOND CARRIER BESIDE THE RECORD OR
      RE-DERIVE A FIELD OF IT — a new fact about a preserved copy becomes a
      field on row Q9, which is the whole of the 2026-08-29 shape ruling;
      **no field may be added to row Q9 without stating WHO FILLS IT AND
      WHEN**, and no surface may claim a provenance for the record AS A WHOLE
      (round 3: "every field is gate-reported" was such a claim, and it was
      false of `remediation`); no surface may describe this module's ASSIGNMENT
      of `remediation` as a consumer re-deriving a gate value — the gate
      reports none, and the no-re-derivation rule binds the surfaces
      downstream of `promote()`'s return;
      **no surface may carry the REDACTION ACCOUNTING as loose fields beside a
      disposition, or as a field of a preservation-record entry, or re-derive
      either of its values — one scrub, one path, one `redaction` field
      (row Q10); no field may be added to row Q10 without stating WHO FILLS IT
      AND WHEN, which is row Q9's rule applied to the SECOND of the **THREE**
      shapes that carry ONE PARTY'S FACTS TO ANOTHER — **not to every field
      this family adds, a
      universal this family's own fields falsify (round 4's F-4)**.
      **THREE, and the count is this table's own preamble's: row Q9's record,
      row Q10's accounting, and `WP-dream-promote-report`'s `accounting` field,
      whose `reason` is the vault-write primitive's. The third shape's
      per-field provenance is DECIDED in that spec's **Table Y, row Y9** — its
      report row's rule cell until 2026-08-30, when the contract was extracted
      into a lettered table — and is neither owned nor restated here; what binds family-wide, and what this
      prohibition carries, is that a field of ANY of the three added without
      its filler and its moment is incomplete.** **The preamble bound the rule
      to three shapes and this prohibition bound it to one, both written in the
      same window — round 5's H1, and the effect was that the report's field
      dropped out of the family-wide prohibition on the one surface that
      carries prohibitions;**
      and no surface may widen row Q10's carriers past the `promoted` arm of
      the report union without the measurement that row states**;
      and NO SURFACE IN THIS FAMILY MAY RESTATE THE DURABLE LIFECYCLE — the
      retention prune, the identity-gated deletion and the preservation-failure
      abort are `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s, cited by
      spec path because its table letters collide with this family's.**
- [ ] **THE PENDING COUNTING INPUT — this side of a TWO-SIDED registration,
      which this spec registered NOWHERE for a round (round 6's COH-1).** The
      input is row Q10's routed narrowing of `lines`, **NOT authorized** (owner
      ruling, 2026-08-29, round 5's C4): unblocking it needs an owner decision
      against the pin in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`,
      and the settlement, if there is one, is an amendment to that `Done` spec.
      **This spec carries the pending state on row Q10 and on Out-of-scope
      bullet (ii); its mirrors on the other side are
      `WP-dream-promote-in-workspace`'s row G7 (which QUOTES the pin), that
      spec's Deliverables `Notes` cell for `src/core/dream/validate.js`, its
      Current-state validate.js bullet, its Table V row V3, its Out-of-scope
      bullet for the EP2 gate's durable quarantine lifecycle, and its checklist
      entry for the pending counting input, which is the registration on that
      side.** **No surface here may present the change as authorized or coming;
      none may describe `lines` as a count of CHANGED lines while it is
      pending; and none may add an acceptance criterion for it before the
      decision — the criterion lands with the change.** **The failure this
      entry closes is exact: the state was carried in TWO of this spec's
      surfaces and registered in NEITHER of its checklists, while the pipeline's
      own entry named no surface here — which is round 5's H4 one spec over, in
      the very window that fixed H4.**
- [ ] **Table C's ORDERING RULING — where its rows sit against Table D's four
      gates, and C1's two halves.** Decided in Table C's header, which is the
      canonical statement. Its mirrors are **Table D's preamble sentence**
      ("this table orders the gates against each other and against the merge,
      and it does NOT order them against Table C's rows"), **rows C1 and C9**,
      Table Q **row Q8**'s route list, and the resolved-path acceptance
      criterion. **No surface may state C1 as wholly preceding the gates, and
      none may claim a C1 refusal always carries an empty preservation record**
      — the resolved-only half runs after EP2 and can carry entries.
- [x] **Table S — the decided bytes.** Its mirrors are the `@returns` shape
      (including the refused arm's `preserved`, whose presence row S3 permits
      and row Q8 requires), Table E's staged-bytes handoff row, and
      `WP-dream-promote-in-workspace`'s rows G8 and G10. **The `report` union's
      arms are `WP-dream-promote-report`'s and are governed by Table S from
      there — this spec's `@returns` has no `report` arm.** **Two prohibitions,
      both earned by a round: no surface may state a decided-bytes rule that the
      TYPE does not enforce; and no surface may add a consumer of published
      bytes without adding it to row S6's list** — S5 is the SCOPE row, S6 is the
      list, and the same one-row slip was live in
      `WP-dream-promote-in-workspace` until 2026-08-29.**
- [ ] **The primitive seam** — the package note, Table E's publish row, C9's
      application clause, the staged-bytes handoff row, and their acceptance
      criteria. **No surface may describe filesystem discipline as this spec's
      (it is Table H's), and none may show a vault write that does not go
      through `writeIntoVault`.**
- [ ] **The refusal-leftover bound** — Table C's C1 row and the Security
      checklist. **Both sides are cited — the PRIMITIVE's H9 for directories,
      the PRIMITIVE's H7 for the staging object, each named with its owner
      because Table H's letter collides — and NEITHER is counted here: that
      spec's own H7 acceptance criterion is the single counting surface.**
- [ ] **The two HANDOFFS** — the gate-extraction handoff in Table D's preamble
      and Table E's staged-bytes row. Both name `WP-dream-promote-in-workspace`
      as the package that discharges them, both are repeated in Out of scope's
      first bullet, and neither has an acceptance criterion HERE — by design,
      since this package ships neither the extraction nor a commit
- [ ] **The commit SET, and that it is stated by CLASS.** Table E's staged-bytes
      row decides it — three classes, each with its own decided-byte source — and
      its mirrors are Table C's C1 row, Out of scope's pipeline bullet, and
      `WP-dream-promote-in-workspace`'s row G8 and its acceptance criterion.
      **No surface may state the commit as "only promoted paths"**: the
      code-owned `reports/warnings.md` is in the set, is not a `promote()`
      outcome, and its bytes are row G8's commit-time render — outside Table S,
      which governs only the bytes `promote()` RETURNS (round 2 of the
      quarantine-surface review, finding 4)
- [ ] **The narrowed window and the decision-atomicity** — Table D's "Why this
      order" and atomicity rows, Table E's window row, the Security checklist's
      named residual, Out of scope's partial-publish line, and their acceptance
      criteria. **No surface may call the window "closed" or claim cross-path
      write-atomicity, and none may re-assert the withdrawn "scanning merged
      forces discarding the user edit" rationale.**

**WALK OF 2026-08-30 — SIX ITEMS OF 21, IN TWO SITTINGS: items 1–4, then
items *Table Q* and *Table S*. The tick marks say so, and no sentence below
reaches past them.** The
PR-review gate found this registry had never been walked at all: every one of
its 21 boxes was empty, and the surface item 2 names was stale. `promote.js`'s
public `@returns` still declared the pre-reconciliation shape (loose
`lines`/`labels`/`artifact` on `redacted[]`, no `preserved` on `refused[]`)
three commits after the typed record landed. In a repo that forbids TypeScript
in `src/`, that JSDoc IS the module's type contract, so a consumer coding
against it would look for fields that no longer exist and would not know
`refused[]` carries the only route back to a quarantined original.

**The sweep behind that fix went by FIELD, not by sentence** — `artifact:`,
`lines:` and `labels:` across `promote.js` and its test. Every surviving
occurrence is the CORRECT shape (`artifact`/`location` inside a
`GateReportedCopy`, `lines`/`labels` inside a `RedactionAccounting`), and the
gate re-ran that sweep independently and agreed. **One stale surface, and no
second one inside items 1–4.**

**THE SECOND SITTING, 2026-08-30 — ITEMS *Table Q* AND *Table S*, AND NO
OTHER.** An earlier form of this paragraph said "the mirror is otherwise
consistent" — a claim over 21 items backed by evidence from four, which is the
same widening this package has now produced four times; the owner then ruled
that exactly these two of the seventeen get walked, because they are the two
that register the repaired `@returns` as a mirror. Both were resolved mirror by
mirror against what `promote.js` now declares —
`{promoted:[{rel,bytes}], redacted:[{rel,bytes,redaction,preserved}],
refused:[{rel,reason,preserved}], secretDisposition:{withheld,redactions}}` —
and **both CLEARED: every mirror the two items name either agrees with that
shape or is a pure citation that decides none of it.** Item *Table Q*'s in-spec
mirrors — the `gates` paragraph, the three typedefs, the `@returns` block,
Table D's EP2 row and Table C's header paragraphs — carry
`Array<GateReportedCopy>` on the GATE's arms and `Array<PreservedCopy>` on this
module's return, which is what the annotation declares. Its cross-package
mirrors were read on `main`: `WP-dream-promote-report`'s Table N rows for
`preserved[].artifact`, `preserved[].location`, `preserved[].remediation`,
`redaction.labels` and `redaction.lines`; its Table R redaction-lines and
preserved-copy rows; its criterion asserting rows Q1–Q3, Q8, Q9 and Q10; the
`preserved` on EVERY arm of its `report` union together with the `redaction` on
that union's `promoted` arm; and its Current-state description of this module's
return. `WP-dream-promote-in-workspace`'s rows G5, G7 and V3 and row G7's
acceptance criterion were read the same way — G7's owner-authorized carrier
change puts the kept copy on a record entry whose `artifact` and `location` the
GATE fills and whose `remediation` this module fills, which is row Q9 exactly.
Item *Table S*'s mirrors — the `@returns` shape including `refused[].preserved`,
Table E's staged-bytes handoff row, and rows G8 and G10 — agree with rows S2 and
S3 as written; **row G10 is the mirror that would have caught the pass-(c)
defect**, because it derives a registry entry's `id` and `created` from the
decided bytes of a path the promotion outcome shows PUBLISHED, which needs BOTH
`rel` and `bytes` on a published entry and not the bytes alone. **One
citation-precision defect was found on `main` and is recorded as a Discovered
issue rather than fixed** — both sibling specs are outside this PR's boundary —
and it does not disagree with the annotation: the report package's Current-state
paragraph attributes "the arms that carry the preservation record" to row Q1,
which decides that for the GATE's three arms, where the rule for THIS module's
RETURN arms is row Q8's (with Table S row S3 for `refused[]`).

**FIFTEEN ITEMS REMAIN UNWALKED — 5 through 12, 14, 15, and 17 through 21 — and
nothing above reaches them.** They are the machine walker's
(`scripts/mirror-walk.js`, which `WP-dream-promote-in-workspace` names as the
surface built because a registered mirror went unwalked). No sentence in this
section certifies them, and none may be added that does without the walk behind
it.

**One registry GAP, recorded because the checklist cannot catch what it does not
name:** `docs/GLOSSARY.md` is a Deliverable of this package and mirrors both the
EP2 outcome taxonomy and the gates' input split, and it appears on NO item of
this list. That is why two false canonical claims in it — an outcome count that
omitted `redacted`, and "the four quality gates judge the bytes that would
actually land", which is false of the pre-merge secret scan — survived three
review rounds. Registering it belongs to the next architect touch of item
"The EP2 disposition taxonomy".

**A SECOND registry gap, opened deliberately in this same pass and named rather
than left to be discovered:** Table D's `date` row is a contract with a mirror —
`### Exact contracts`' `date` line, which cites it — and that pair is on NO item
of this list. It is not registered here because the owner's ruling for this pass
fixed the walk arithmetic at SIX OF TWENTY-ONE, and adding a twenty-second item
would have made that count wrong in the same breath as writing it. **Registering
the `date` row is therefore an owner's call, not a quiet addition**, and until it
happens the row and its one mirror are protected by nothing but this paragraph.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing outlives the job.
- **Merge on a copy — the trap, measured.** `git merge-file` mutates its first
  operand in place on conflict. The obvious shape (merge the vault note against
  the workspace note) leaves conflict markers in the user's live file on exactly
  the path where refuse-and-report promised not to touch it.
- **The gates are injected, so this module's tests use fakes.** That is the
  point of the injection: the order, the input routing and the taxonomy are
  provable here without `validate.js` in the picture, and the module carries no
  dependency on it.
- **Do not build a containment check.** The one rule the family has is the
  primitive's, and it took eleven review rounds — see the Dispatch precondition.
  A second implementation of it in this module is a defect, not a defence.
- **Measure `promote.js` and report the number in the PR body.** A pinned
  tripwire (logbook: `2026-08-28-promote-split-owner-ruling.md`) fires at **600
  lines of non-test content**. **T1 has already fired once**, on the criteria
  count, and cut Table R and the report's criteria into
  `WP-dream-promote-report`; T3 is the remaining arm and it is measured at
  implementation time. Reporting the measurement is the implementer's only
  obligation here; a cut, if one comes, is not theirs to make
  mid-implementation.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item applies twice over. Relative
      paths from the delta are attacker-influenceable and flow into filesystem
      writes **into the vault** — and this module hands every one of them to
      `writeIntoVault` rather than joining it to a vault root itself.
      **Segment validation, resolution and containment are ALL the primitive's
      (Table H, rows H1–H3), applied by it, cited here and not reimplemented:**
      it segment-validates `rel` and throws on a violation, resolves the target,
      and calls this module's `admit` with the RESOLVED path. **Table C's row C9
      is a POLICY, not a path validator** — it decides which resolved paths are
      allowed, and a second segment check written here would be the duplicated
      containment rule the Dispatch precondition forbids.
- [ ] **Named residual: a secret the USER writes into their own note during the
      run can enter the dream commit.** EP2 scans the brain's added bytes before
      the merge (Table D); a user credential added to the live note during the
      run rides a clean C6 merge into the committed bytes unscanned.
      Owner-ruled acceptable: it is the user's own content in their own vault —
      the dream commits it but did not author it — and making the secret gate
      refuse or redact a user's own note was ruled the worse trade.
- [ ] **What a refusal may leave behind is the primitive's bound, on both sides,
      and this package inherits it rather than closing it** (Table C, C1): the primitive's
      H9 directory side and its H7 staging-object side, each named in the
      refusal by the primitive. The consequence this package must handle is that a
      surviving staging object holds the REFUSED payload; Table E's staged-bytes
      row is what keeps it out of the commit.
- [ ] The merge's git invocation is a security decision and takes the
      dependency's constructed-environment discipline (Table C, row M2). Named
      residual, inherited and not closed: executable-identity influence at a
      verified absolute path.
- [ ] **The findings this package closes are not the brain's routes at all —
      they are OUR OWN process writing the vault, which no harness sandbox
      constrains (Table H's primitive).** What the Codex arm's shell can reach
      inside the workspace is measured and bounded in sibling Table F, and is
      not this package's subject.

## Acceptance criteria

- [ ] **Table C's decision matrix**, one case per row C1–C8, each asserting both
      the outcome and the vault's resulting bytes. **C1's case here is its
      CANDIDATE-DECIDABLE half** — the half Table C's header orders ahead of the
      gates; the resolved-only half has its own criterion below, and counting
      the two as one row is what the header forbids.
- [ ] **M7's mechanism, current conventions.** A brain that writes
      `<workspace>/CLAUDE.md`, `<workspace>/AGENTS.md`,
      `<workspace>/01-Projects/x/AGENTS.md`,
      `<workspace>/01-Projects/x/CLAUDE.local.md`,
      `<workspace>/01-Projects/x/AGENTS.override.md`,
      `<workspace>/.gitignore`,
      `<workspace>/01-Projects/x/.claude/rules/evil.md` and
      `<workspace>/01-Projects/x/.claude/settings.json`
      promotes **none** of them, each with a recorded reason, and the vault
      contains none of them afterwards.
- [ ] **Spelling does not decide admission, in BOTH directions.** RED: an
      instruction-file basename in either normal form is refused —
      `01-Projects/x/agents.override.md`, `claude.local.md`, and a path with a
      `.CLAUDE` segment are each refused. GREEN: with an admitted directory
      spelled composed in the layout and decomposed on disk (or vice versa) —
      `reports_dir` is the worked example, since it is admitted — both spellings
      name ONE directory and both ADMIT. No false refusal, and no
      implementation may derive two directories from one name.
- [ ] **Policy is judged on the RESOLVED path, and that refusal carries the
      gate's preservation record.** With a pre-existing vault symlink `01-Projects/alias` → a
      directory C9 denies (`../.claude`, and a vault-root target), a
      brain-written `01-Projects/alias/evil.md` is refused and the victim
      directory gains nothing. Proven RED against an implementation that hands
      the primitive the candidate path. **Asserted again with the same fixture
      after an EP2 REDACT verdict**, because this is C1's resolved-only half and
      the gate has already run: the refusal's `preserved` carries the entry the
      gate reported, not an empty record (Table C's header, Table Q rows Q8 and
      Q9). Proven RED against an implementation that treats every C1 refusal as
      carrying no preservation.
- [ ] **The merge never touches the user's live note.** On a conflicting
      three-way state the vault file is byte-identical to its `vault-now`
      version afterwards and contains no conflict marker.
- [ ] **This module's git seam is never given a workspace cwd (CLAIM 2b, this
      module's share).** Asserted by a test that substitutes the git seam and
      fails if the merge is ever invoked with a cwd at or beneath the workspace
      root. Proven RED by a deliberate merge call from the workspace. **A test
      asserting the workspace "is not a git repository" is asserting something
      sibling Table F measures to be unestablishable — the criterion is the cwd
      assertion, not a repository probe.** The product-wide form of the claim is
      `WP-dream-promote-in-workspace`'s.
- [ ] **Gate order and input (Table D).** A secret in the brain's added lines is
      withheld before the merge and never appears in a merged candidate; and a
      Tier-3 / skill-guard / ledger refusal is shown to have judged the
      **merged** bytes, demonstrated by a case whose pre-merge bytes would pass
      and whose merged bytes must not.
- [ ] **ADR-0020's authorizing input.** A brain that rewrites both a skill and
      the ledger in the same run is refused, because the guard is handed the
      **baseline** ledger.
- [ ] **EP2's redact disposition (ADR-0034).** A brain-added line that triggers
      only a context-free high-entropy hit is REDACTED: the sanitized candidate
      is promoted, the path is recorded `redacted`, and
      `secretDisposition.redactions` counts it separately from a hard refusal.
      Asserted through the injected gate's returned taxonomy.
- [ ] **Unscannable content is refused.** A brain-written `.md` whose delta
      record is binary is refused by EP2 with that reason and does not reach the
      vault. Proven RED against a gate that treats the empty scan as a pass.
- [ ] **Atomicity — at the DECISION.** A run where the skill passes and the
      ledger fails-policy promotes **neither**. The criterion covers the
      decision, not a mid-write crash: a partial publish (first `rename`
      succeeds, second fails) is the residue-lifecycle successor's subject
      (Out of scope) and is not asserted against here.
- [ ] **Every vault content write goes through the primitive.** Asserted by
      substituting the primitive's seam and failing if any vault content write
      bypasses it. **The report's own writes are `WP-dream-promote-report`'s to
      assert; this criterion covers every write this package makes.** Proven RED
      with a promoted note published by a direct `writeFileSync`.
- [ ] **The compare→promote window is narrowed.** With the vault target changed
      between the decision and the re-read, the write is abandoned and the path
      is reported refused; the vault keeps the changed bytes. The criterion
      asserts the NARROWED window (a change visible at the re-read), not a
      closed one — a save landing between the re-read and the `rename` is the
      stated residual and is not asserted against.
- [ ] **Promotion accounting partitions the delta**: every record is exactly one
      of `promoted`, `redacted`, or `refused` with a reason, and the counts sum
      to the record count.
- [ ] **The gates are judged on the evidence Table D enumerates, not on bytes
      alone (round 3, F2).** Two cases, each RED against a gate given candidate
      bytes only: **identical** candidate ledger bytes are refused or admitted
      solely because the named session is absent from, or present in, this run's
      extracts; and a skill revision is refused solely because the ownership
      registry does not name it. A paired skill-plus-ledger change is judged from
      the pair's candidate and BASELINE bytes, never from the live vault.
- [ ] **A redaction's recovery copy travels on the RETURN, reported not
      predicted and complete, and so does what the scrub did (Table Q, rows
      Q1–Q3, Q9 and Q10).** **Asserted on what
      this package can build — `promote()`'s returned `redacted[]` entry — and
      NOT on a report line: this module composes no report** (`### Exact
      contracts`, Deliverables), so the line built from this record is
      `WP-dream-promote-report`'s to assert, and its preserved-copy criterion
      does. A redacted note's `redacted[]` entry carries the path, its
      `redaction` accounting — the scrubbed-line count and the detector labels
      in ONE field, read off the gate's result and recomputed by nobody
      (row Q10) — and **a complete preservation
      record entry: the `artifact` and `location` the gate actually returned,
      and the `remediation` this module assigned** — asserted with a deliberate
      basename COLLISION, so a record built by predicting the name from the
      date and path names a file that does not exist, and asserted with a
      `location` the test does not hardcode, so a record built from a directory
      the module composed for itself is red too. Proven RED against a gate
      result that carries only `{redact, sanitizedBytes}`, separately against
      one whose redact arm carries no `preserved` at all, **and separately
      against a return whose entries reach the caller WITHOUT `remediation`** —
      the field the gate never reports, which this module must fill before the
      record leaves it (row Q9's per-field provenance).
- [ ] **This module's share of the only-copy invariant, and only that share
      (Table Q, rows Q4 and Q7).** A redact verdict whose preservation record
      is EMPTY refuses fail-loud, promotes nothing for that path, and leaves the
      vault note byte-unchanged. Proven RED against an implementation that
      promotes the sanitized bytes on a redact verdict that reports no preserved
      copy — whether the record is empty or the field is missing altogether.
      **The criterion asserts the SANITY REFUSAL and stops
      there, deliberately.** An earlier form mandated that the refusal name
      which of three states it found — an assertion this module cannot make on
      any implementation, because it never reads a preserved copy (row Q7) and
      row Q7 forbids it the state directory. **The abort that DOES distinguish those
      states, its condition and every field of its message are decided, asserted
      and mutation-covered in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`**
      (its Table B row B3b and its Table Q row Q18, that spec's own
      letter-space), and that the extraction preserves them is asserted by
      `WP-dream-promote-in-workspace`'s row G7 criterion. Nothing about the
      retention prune or the identity-gated deletion is asserted here: rows Q5
      and Q6 are pointers at the same owner, and this package's Deliverables
      cannot reach the state directory to assert either.
- [ ] **Every refusal reached after EP2 ran carries the gate's preservation
      record, and a refusal with no copy says so (Table Q rows Q8 and Q9, Table
      S row S3).** A path the gate REDACTS — so an unredacted copy already
      exists on the redacted shelf — and which is then refused returns a
      `refused[]` entry `{rel, reason, preserved}` whose record holds the entry
      the gate reported, field for field. Asserted on three routes, chosen
      because they refuse at three different points: a post-merge gate, the
      skill/ledger pair refusal, and the primitive's `expect` guard. **Asserted
      a fourth time on the WITHHOLD arm**, which is the arm the shape
      ruling of 2026-08-29 added and the one whose absence ended the design
      loop, **and asserted there on BOTH of its routes, because only one of
      them can produce two entries (round 3's F2, measured against the shipped
      gate):** (a) a HARD secret, which skips the redact arm entirely
      (`validate.js:1270` gates the whole arm on `!hasHardFinding`, and the
      copy is written inside it at `:1277`), so the gate preserved exactly one
      copy and the record holds **exactly one entry, always**; and (b) the
      redact arm's FALL-THROUGH — a soft finding whose scrub did not complete,
      so the arm preserved its copy first (`:1277`) and the withhold below
      preserved a second (`:1298`) — where, **when the gate also reports that
      it KEPT the redact arm's copy**, the record holds TWO entries, each with
      its own `location`. **Their ORDER is the order the gate wrote them (row
      Q9), which is measured: the REDACT-shelf copy is written first and is the
      FIRST entry; the withheld copy is second.** Proven RED against a refuse
      arm that carries no record, **and separately RED against a fixture that
      builds the two-entry case on the hard-secret route** — the real gate
      cannot reach it there, so a test that does has proved something only a
      fake gate can do. A path refused
      with no preservation, and a path refused before EP2 ran at all, each
      return `preserved: []`. **Proven RED against a return whose refused arm
      has no `preserved` field, and separately against one that omits the field
      rather than setting it to an empty array** — the second is row S2's own
      lesson, one field over. **`remediation` is asserted per arm, on the
      RETURNED record**: the redact arm's entry reads `restore-or-delete` and
      every refusing arm's entry reads `delete`. **The gate fake reports no
      `remediation` on any arm** — it returns only the fields row Q9 assigns to
      the gate — so the assertion is on THIS MODULE's assignment, and it is
      proven RED against an implementation that passes the gate's entries
      through unchanged, which leaves the field missing on every arm, **and
      separately RED against one that assigns the same value on both arms**. **Asserted for a
      skill/ledger pair where BOTH halves were redacted**, which is the case a
      prose carrier got wrong: each half's record must hold its OWN copy, and
      the reason string is asserted NOT to contain either basename — one fact,
      one field.
- [ ] **Every published outcome carries its decided bytes (Table S).** Asserted
      per outcome: an ordinary promotion and a redacted promotion each return
      **both `rel` and** the exact buffer the primitive published, byte-equal to
      what the vault then holds; a refused path returns no bytes at all.
      **Proven RED against a return carrying bytes without `rel`**, which the
      pre-pass shape permitted. **Proven RED against a
      return that carries paths without bytes** — round 1's finding. **The
      report's arms are `WP-dream-promote-report`'s to assert**, under the same
      Table S rule, which is why row S2 states it as a shape rule rather than
      per-outcome prose.
- [ ] **The module ships consumed by nothing.** No file outside the Deliverables
      table changes, and no production code requires `promote.js`. Asserted by
      the boundary check and by a grep whose red side is a planted require.
- [ ] **The glossary carries the name.** `docs/GLOSSARY.md` defines
      **promotion** as a canonical name (the grep below is the anchor; the
      wording is the implementer's).
- [ ] Idempotence: `N/A — this package ships a module, not a command, and writes
      nothing outside the repo.` What it ships in its place is the promotion
      partition above: a run in which the brain writes nothing promotes nothing
      and changes no vault note.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24),
# so pattern runs against a CREATED file are guarded by its existence — the
# guard is what makes the deliverable-ABSENT state red instead of vacuously
# green.
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "dream-promote"
npm test
npm run lint
# The module's own git-seam claim lives in the deliverable test file; the spec
# fixes only the test NAME, because a verification command must be runnable.
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "claim-2b-merge-cwd"
# Consumed by nothing: no production code requires the new module. This is a
# grep over a directory that MUST exist, so guard the absence case first — grep
# on a missing path exits 2, which `!` would turn into a false green. NO
# `--exclude` (PR-review gate, round 3): an earlier form excluded `promote.js`
# on the stated ground that "a JSDoc line in it would otherwise redden this",
# and the delivered module contains no such line — measured, the grep is empty
# with or without the flag. The flag bought nothing and cost the one case that
# matters most: a genuine `require('./promote')` inside a file of that name.
test -d src && ! grep -rqn "require(.*promote" src/ --include='*.js'
test -f docs/GLOSSARY.md && grep -q "\*\*promotion\*\*" docs/GLOSSARY.md
```

- The `claim-2b-merge-cwd` run, the consumed-by-nothing grep and the glossary
  grep are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing something a reader must judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state — a merge call
  added with the workspace as cwd (reddens `claim-2b-merge-cwd`); a
  `require('./promote')` planted in another `src/` file (reddens the
  consumed-by-nothing grep); the glossary text reverted (reddens the docs grep) — so a check that
  cannot fail is caught before anyone believes it. Verify each **also** goes red
  when its deliverable is ABSENT — for the pattern run that is the
  file-existence guard's job.
- **The git-seam claim is asserted through the seam, never through a grep.** A
  source grep for a workspace-rooted cwd cannot discriminate: it is green today,
  green on a correct implementation, and green on a broken one that passes the
  path through a variable.

## Out of scope (do NOT do these)

- **The pipeline** — `WP-dream-promote-in-workspace` owns Tables G and V: the workspace
  lifecycle in the run, replacing the sibling's transitional `spawnBrain`
  argument, calling `computeDelta` and this module, the reap precondition, the
  unknown-command non-vacuity signal, the transcript-advance, the abort paths
  and the dream commit. **Both of this spec's HANDOFF rows are discharged there
  and nowhere else:** Table D's extraction of the four real gates into their new
  input shape (and the removal of the EP2 enforcement half from
  `validate.js`), and Table E's staged-bytes rule for the commit.
- **`src/core/dream/validate.js` and `src/cli/dream.js`** — not in this
  package's Deliverables and not modified. This module is not wired to anything.
- **Audit finding M9** — repo-local git configuration naming executable
  programs. Owner-ruled open on 2026-08-05, audit finding C2's package.
- **Audit finding C3** — the layout dot-rule and its notice. Table C9's
  allowlist is a directory-and-extension rule, deliberately **not** a dot-rule,
  so it does not step on audit C3.
- **The EP2 gate's DURABLE quarantine lifecycle** — the retention prune of
  `state/quarantine/redacted/`, the identity-gated deletion of a redundant copy,
  and the preservation-failure abort with its message. All three are decided,
  asserted and mutation-covered in the shipped
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`. **Table Q rows Q5 and Q6
  are pure pointers at it; row Q4 points at the shipped ENFORCEMENT of the
  only-copy invariant while owning the invariant as it binds this family, and is
  not a pure pointer.** None of the three restates the lifecycle. **This package never touches the
  state directory (Table Q row Q7), so it can neither implement nor assert any
  of them**; that the gate extraction preserves **their DECISIONS** is asserted
  by `WP-dream-promote-in-workspace`'s row G7. **"Their decisions", not "them"
  whole, and the narrowing is the pipeline package's own.** The WORDS are that
  package's Mirrored Surface Checklist entry on the only-copy invariant — "the
  extraction preserves their DECISIONS, nothing more" — and its rows G7 and V3
  and its G7 acceptance criterion carry the same narrowing operatively, without
  that phrasing. **(Corrected 2026-08-29, round 4's F-2: the quotation was
  attributed to those three operative surfaces, none of which carries it.)**
  **The narrowing has TWO exceptions, and they DO NOT HAVE THE SAME STATUS — one
  AUTHORIZED, one PENDING (round 5's C4: this bullet said "exactly one" while
  row Q10 and the pipeline's row G7 carried a second, so an implementer reading
  here refused what an implementer reading there built).**
  **(i) AUTHORIZED rather than
  implied:** ONE owner-authorized change rides with that extraction — the identity-gated
  deletion's kept copy is announced through the preservation record instead of
  through a refusal reason (Table Q rows Q1, Q8 and Q9). What that deletion
  DECIDES is untouched.
  **(ii) PENDING, and NOT authorized (owner ruling, 2026-08-29):** row Q10's
  routed counting change, which would alter the `<n>` that
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387` PINS as
  `addedLineNumbers.length`. **Unblocking it requires an owner decision against
  that pin, and the settlement would be an amendment to that `Done` spec.
  Until then the shipped count stands, here and in the pipeline package.** **This bullet carried the pre-ruling premise for one
  round after the pipeline narrowed it (round 3's F5).** **Cite that spec by PATH, never by
  bare table letter — its letters collide with this family's.**
- **The residue-lifecycle successor** (not yet drafted — it has no WP id yet) —
  the journal schema, crash replay, uninstall restore, a workspace surviving a
  crash, and **the rollback/replay of a PARTIAL PUBLISH** (first promoted
  `rename` succeeds, a later one fails — Table D's atomicity row claims
  decision-atomicity only).
- **An ADR for the promote-in inversion.** The war-room decision log owns the
  reasoning and this spec cites the rulings; whether the inversion also needs an
  indexed ADR is an owner call. `docs/adr/0012` is amended by the pipeline
  package, where the lifecycle actually changes.
- **`skills/wienerdog-dream/SKILL.md`** — the sibling's Out of scope owns the
  bounded claim and the reason; nothing here changes it.
- **The siblings' contracts** — the workspace module, the constructed baseline,
  the seven re-target sites and Table F (`WP-dream-workspace-retarget`); and the
  vault-write primitive's filesystem discipline, Table H
  (`WP-dream-vault-write-primitive`) — its resolved-path application, symlink
  refusal, temp creation, conditional publish and published-bytes return. This
  WP CONSUMES both and cites them; restating a proved property is how it becomes
  a drifting copy. In particular this WP may not re-implement a publish path or
  a containment check of its own.
- **The dependency's own contract** — the delta primitive, its binary/text
  equivalence, its `addedLineNumbers` property. This package CONSUMES
  `computeDelta`'s fields and does not re-derive them.
- **The superseded predecessor's Tables C, D and E**
  (`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`). Tables C, D and E
  here are this package's own, recomputed against the tree at `36c2ce5`.
  Copying a table out of a superseded record is how a dead contract comes back
  to life.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): build the promotion module (WP-dream-promote-module)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
