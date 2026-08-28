---
title: Review rounds — the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

# Review rounds — the promote split pair

Specs: `docs/specs/WP-dream-promote-module.md` and
`docs/specs/WP-dream-promote-in-workspace.md`. Base: `main` @ `36c2ce5`.

**No round history is inherited from the pre-split spec's ten rounds.** Those
findings were dispositioned against the unsplit text
(`2026-08-21-dream-promote-pair-review-rounds.md`); anything still applying had
to be re-found against these two.

## STOP CRITERION (pinned before the round, per the owner's ruling)

- **The owner authorised ONE external round** (2026-08-28), after round zero.
  **AMENDED 2026-08-28, same day: a SECOND round is authorised under the
  runbook's HEAVY rule** — round 1's fix changed `promote()`'s return type, and
  weighted closure says a HEAVY fix lands and then earns a full fresh external
  round. It runs **on the whole settled text**, not on the diff.
- **"CLEAN" IS DEFINED HERE, BEFORE THE ROUND RUNS, so the definition cannot be
  chosen after seeing the findings:** a round is clean when it returns **no
  A-band and no B-band finding**. C-band findings are spec hygiene by
  definition; per the runbook they are fixed or accepted as named residuals and
  **do not extend the loop**. This matches the runbook's own closure rule — the
  loop is done when a round finds nothing about the PRODUCT — and the A/B/C
  ruler the standing reporting rule already binds every round to.
- **A clean round is the owner's authorised trigger for the `Ready` flip and the
  PR** (owner, 2026-08-28). Not clean → disposition, and the loop rules below
  apply.
- **The family escalation, carried forward unchanged from the pre-split loop:**
  this family's characteristic failure is **a vault write that bypasses the
  promotion decision**, or **a decision made on bytes other than the ones that
  get published**. A round landing twice on that family returns to the owner
  with the seam on the table.
- **The Table R tripwire** (`2026-08-28-promote-split-owner-ruling.md`) is
  measured at the close of every round. It did not fire.

## Round zero — 2026-08-28 — internal, both disciplines

Full record: `2026-08-28-promote-split-round-zero.md`. **1 B, 4 C, zero A.** The
B: the pipeline half claimed three consumed-by-nothing modules where two already
have a module-level requirer. Fixed by quantifying over entry points.

## Round 1 — 2026-08-28 — reviewer: gptsol (Codex side), external

Raw output committed before adjudication:
`2026-08-28-promote-split-round-1-raw.md`. Verdict **needs-attention**, **one
finding, band B, zero scope objections**. Read-only verified independently
(`git status --porcelain` empty before and after).

### The finding, and why it is a good one

**The module's canonical return shape could not carry what its own prose
promised.** `@returns` typed `promoted:string[]` and `redacted:Array<{rel}>` —
paths only — while Table E's staged-bytes row said the module "supplies the
returned bytes in `promoted`", and the pipeline's row G8 required the commit to
carry "the bytes `promote()` returned". An implementer conforming to the
interface would have had three options: violate the interface, violate G8's
no-re-read rule, or invent an undocumented side channel. **The second of those
is the family failure this loop exists to catch** — staging by naming the path
re-reads the working tree, so a user save landing after the publish enters the
commit ungated.

**Reproduced independently by this author before acting**, per the runbook's
spot-check rule: `@returns` at `:210-215`, the Table E claim at `:365`, and row
G8's requirement all read as the finding describes.

**This defect is the split's own.** The pre-split spec had the same
`promoted:string[]`, but the commit rule lived in the same document, where no
interface had to carry it across a boundary. The split is what made the seam
load-bearing — and the split record's own claim to have "marked the commit rule
as a handoff" was true and insufficient: marking a handoff is not the same as
checking that the interface can carry it. **That is the reusable lesson.**

### Disposition

| # | Band | Disposition |
|---|---|---|
| R1-1 | B | **ACCEPTED and FIXED**, in the shape the reviewer's first option named — one field, no second mapping, per CLAUDE.md's simpler-option rule |

Applied:

- `@returns` now types `promoted:Array<{rel:string, bytes:Buffer}>` and
  `redacted:Array<{rel:string, bytes:Buffer}>`, with a `bytes` paragraph binding
  it to Table H's H6 and naming why it is in the interface rather than in prose.
  `report.bytes` is preserved for the separately accounted report outcome, as
  the reviewer recommended.
- Table E's staged-bytes handoff row now names the three fields.
- Pipeline row G8 now names the same three fields and cites where they are
  decided.
- A NEW Mirrored Surface Checklist entry in the module half registers the
  field-plus-rule pair, with the prohibition stated: **no surface may state the
  staged-bytes rule without the field that carries the bytes.** The pipeline's
  handoff bullet now names the fields too, so the two move together.
- The pipeline's decided-bytes acceptance criterion now asserts a REDACTED path
  as well as a promoted one — both carry `bytes`, both enter the commit, and the
  pre-fix criterion exercised only one of them.

**Counts after the fix: module half 24 acceptance criteria / 3 deliverables;
pipeline half 15 / 6.** Unchanged. The tripwire does not fire. `npm run lint`
exit 0.

### Weighted closure — the classification, and the one open question

The runbook's rule: a finding is **HEAVY** when fixing it changes what the
implementer builds in the product; HEAVY means "fixes land, then a full fresh
external round". **R1-1 is HEAVY.** It changes `promote()`'s return type, which
is `src/` behaviour and the pipeline's consumption of it — not verification
machinery.

**So the runbook asks for a second external round, and the owner authorised
one.** That is a genuine conflict between a standing rule and a specific
authorisation, and it is not the author's to resolve. It is recorded here and
put to the owner rather than settled by either silently running an unauthorised
round or silently skipping a standing rule.

The honest arguments on both sides, since the owner decides:

- **For a second round:** the fix touches the exact seam the family escalation
  names, and every fix in this program has injected 0.5–0.9 new defects. The fix
  also GREW the surface — one new checklist entry, one widened criterion, a new
  interface field — and the convergence condition is a frozen surface.
- **Against:** round 1 returned a single B and zero A, with zero scope
  objections, on text that had already passed round zero's two disciplines. The
  fix is the reviewer's own recommended shape, applied narrowly, and it makes a
  rule that was previously unimplementable implementable — it removes a degree
  of freedom rather than adding one. The specs stay `Draft`, so the PR gates and
  the implementer both still run on this text before anything ships.

## Round 2 — 2026-08-28 — reviewer: gptsol (Codex side), external, FRESH agent, WHOLE TEXT

Raw output committed before adjudication:
`2026-08-28-promote-split-round-2-raw.md`. Verdict **needs-attention**, **two
findings, both band B, zero scope objections.** Read-only verified
independently. Authorised by the owner under the runbook's HEAVY rule.

**NOT CLEAN** by the criterion pinned before the round: a clean round returns no
A-band and no B-band finding. Two B. **So the `Ready` flip and the PR do not
fire.** The definition was fixed in advance precisely so this could not be
argued after the fact.

### Prior findings, re-audited by the reviewer

| Prior | Reviewer's verdict |
|---|---|
| R1-1 | genuinely fixed **for ordinary and redacted notes** — with a surviving sibling on the report (its Finding 2) |
| Z1, Z2, Z3 | genuinely fixed, each with the current lines cited |

### The findings

| # | Band | Finding |
|---|---|---|
| R2-1 | **B** | **The pipeline drops the validator's post-commit skill-ownership registration.** Today `validateAndCommit` collects accepted NEW dream-created skill drafts (`validate.js:1200-1205`) and calls `recordSkills` after the commit (`:1443-1448`, Step 6). Table G replaced the validator's classification, gates, report and commit and assigned that side effect to **nobody** — Current state merely *acknowledged* Step 6. A conforming implementation leaves the old code and its passing unit test in place while production registration is dead: green tests, missing product. A committed-but-unregistered skill is not dream-owned, so every later autonomous revision of it fails closed |
| R2-2 | **B** | **`report.bytes` was still optional across the whole union**, so a conforming successful report outcome could omit the very bytes row G8 must stage — reintroducing, through the report, the exact decision-bytes-versus-committed-bytes race round 1 closed for ordinary notes |

Both reproduced independently by this author before acting, per the runbook's
spot-check rule: the two `validate.js` ranges, the `WP-083` acceptance criteria,
the absence of any registry obligation in Table G / the criteria / Out of scope,
and the optional `bytes?:Buffer` in the report union all read as reported.

### TWO LOOP MECHANISMS FIRED, and both were followed

**1. The ADR-0031 circuit-breaker.** R1-1 and R2-2 are the SAME contract in two
places — *the decided bytes must reach the commit, and the interface must carry
them across the package boundary*. Two consecutive external rounds on one
contract family is the breaker's trigger, and its rule is explicit: **stop
fixing finding-by-finding and do a contract-EXTRACTION pass instead.**

Done. **Table S — the decided bytes, and what may be derived from them** is now
the single canonical place that contract is decided, with its mirrors registered
in both specs' Mirrored Surface Checklists. `### Exact contracts`, Table E's
staged-bytes row and rows G8/G10 all CITE it; none restates it.

**The extraction earned its keep immediately, which is the evidence the
diagnosis was right:** row **S4** generalises the rule from "the staged content"
to *every fact a consumer derives about a published path* — and that
generalisation is exactly what R2-1's registry entry needed, since today's code
reads `id` and `created` by re-reading the vault path (`validate.js:1203`). One
extraction covers round 1's finding, round 2's second finding, and the derivation
half of round 2's first. Row **S5** then names the consumers as a closed list and
makes an unowned consumer a finding by construction — the shape R2-1 arrived in.

**2. The family escalation pinned in this record's STOP CRITERION.** The pinned
text: *this family's characteristic failure is a vault write that bypasses the
promotion decision, or a decision made on bytes other than the ones that get
published; a round landing twice on that family returns to the owner with the
seam on the table.* R1-1 and R2-2 are both that family. **It fires. It is
escalated below rather than absorbed.**

### Dispositions

| # | Disposition |
|---|---|
| R2-1 | **ACCEPTED and FIXED.** New Table G row **G10** assigns the obligation, and it is not a port: (i) "NEW" can no longer be `change.untracked` (`validate.js:1202`) — a git INDEX fact, the same class of evidence whose absence made this family's predecessor `Superseded` — so newness comes from the delta status `added` for a path the outcome shows PUBLISHED; (ii) `id`/`created` derive from the decided bytes per Table S row S4, never from a re-read; (iii) the call still runs only after the commit succeeds. A new acceptance criterion asserts the entry for an ordinary AND a redacted acceptance, with three negatives, proven RED against a pipeline that never calls `recordSkills`. `skill-registry.js` is called, not modified, and is named in Out of scope |
| R2-2 | **ACCEPTED and FIXED**, in the reviewer's own recommended shape: `report` is now a DISCRIMINATED UNION whose published arms require `bytes` and whose refused arm cannot carry them. Table S row S2 states the rule as a SHAPE rule and says why — twice now the prose was right and the type was not. A new module criterion asserts bytes per outcome, proven RED against a return omitting them on the report's published arms |

### Defects this round's own fixes introduced, found and fixed in the same pass

Recorded rather than quietly corrected, because the 0.5–0.9-per-fix injection
rate is this loop's convergence argument and hiding an instance weakens it:

- **Row G10 was inserted BEFORE G9**, leaving the table reading G8, G10, G9.
  Caught by a mechanical row-order check, swapped back.
- **The family-letter division went stale in five surfaces** the moment Table S
  existed (both package notes, two Deliverables cells, two checklist bullets, one
  Out of scope bullet). All updated; the owner's seam ruling is quoted verbatim
  where it appears and deliberately NOT rewritten — S adds no subject, it gives
  an existing one an owner, and both specs now say so.
- **"The two rows it DOES discharge"** became ambiguous once G10 existed. Now
  stated as two DIFFERENT counts that happen to share a member: two handoffs
  (G7, G8) and two decided-bytes consumers (G8, G10), with G10 named as a
  consumer and not a handoff.

### Measurements after the round

| Measure | Value | Tripwire |
|---|---|---|
| module half acceptance criteria | **25** (was 24) | T1 fires above 28 — **not fired** |
| of those, the report's | **6** (unchanged) | T2 fires above 8 — **not fired** |
| module half deliverables | **3** | — |
| pipeline half acceptance criteria / deliverables | **16** / **6** | — |

`npm run lint` exit 0.

## ESCALATED TO THE OWNER — the family escalation fired

The pinned criterion is not discretionary, so this is stated as a fact and not
as a recommendation, and the seam question is put on the table as the criterion
requires. **What the owner is being asked to rule is whether the seam stays as
ruled.** The author's own reading, given plainly and without advocacy:

**The evidence that the seam CAUSED these findings.** Both R1-1 and R2-2 are
failures of a contract to cross a package boundary. Pre-split, the decided-bytes
rule and the commit that consumes it lived in ONE document, where no interface
had to carry anything; nothing could go stale between them because there was no
"between". The split created the boundary and therefore created the defect class.
Two rounds, two instances, and the second survived the first's fix.

**The evidence that the seam is nonetheless SOUND.** Every instance was found,
and found cheaply, by exactly the mechanisms the repo has for this — an external
round, then a circuit-breaker that converted the second instance into a
canonical table rather than a third patch. R2-1, the round's other finding, is
NOT a seam defect at all: the validator's Step 6 was unowned in the pre-split
spec too, and it went unnoticed there because one document made "who owns this"
un-askable. **The seam did not create R2-1; it exposed it.** And the split's own
reason has not moved: the pre-split package measured L, and "L is forbidden" is
house law.

**What has changed since the seam was ruled** is that the boundary now has a
named contract with an owner and registered mirrors, which it did not have when
either finding was written. Whether that is enough is the owner's call, not the
author's.

**No `Ready` flip and no PR.** The round was not clean, and the trigger the
owner set was a clean round.

### OWNER RULING on the escalation (2026-08-28)

**THE SEAM STANDS.** Two reasons, in the owner's terms:

1. **Table S IS the boundary's contract.** The thing that was missing when both
   findings were written now exists, is owned, and has registered mirrors. A
   boundary with a named contract is not the same object as a boundary without
   one, and it is the latter that produced R1-1 and R2-2.
2. **R2-1 is exposed inheritance, not a seam defect.** The validator's Step 6 was
   unowned before the split as well; the seam made "who owns this" an askable
   question and the question got asked. A boundary that surfaces a pre-existing
   gap is doing its job, not creating work.

**Consequence for this record's STOP CRITERION — stated so the next round does
not re-escalate a settled question.** The family escalation has now FIRED and
been ANSWERED. A third finding on the decided-bytes family therefore no longer
means "the seam is suspect"; that is ruled. It would mean **Table S is not
working as the boundary's contract**, which is a different claim with a different
remedy — the table's own rows, mirrors and prohibitions — and it returns to the
owner as that, not as a seam question. **The seam is closed to re-litigation
absent new evidence of a kind neither round produced.**

## Round 3 — authorised 2026-08-28

**Authorised by the owner under the runbook's HEAVY rule**, on the same terms as
round 2: the **whole settled text**, not the diff, and **the clean definition
pinned above stands unchanged** — no A-band and no B-band finding. Round 2's
fixes were larger than round 1's (a new canonical table, a new Table G row, two
new acceptance criteria, and five stale mirrors repaired), which is precisely
what the HEAVY rule exists to re-test.

**A clean round 3 is the owner's authorised trigger for the `Ready` flip on both
specs and the PR** (owner: "tiszta = Ready-flip + PR #30").

### Round 3 — 2026-08-28 — reviewer: gptsol (Codex side), external, FRESH agent, WHOLE TEXT

Raw: `2026-08-28-promote-split-round-3-raw.md`, committed before adjudication.
Verdict **needs-attention**, **four findings — 3 B + 1 C — zero scope
objections.** Read-only verified independently.

**All six prior findings (R1-1, R2-1, R2-2, Z1, Z2, Z3) re-audited and ruled
GENUINELY FIXED**, each with current lines cited. **NOT CLEAN** by the pinned
criterion, so no `Ready` flip and no PR.

| # | Band | Finding |
|---|---|---|
| R3-1 | B | **No Table G row consumes `report.record`.** On Table R's refused arm the vault correctly keeps nothing — so `report.record` is the ONLY surviving copy of the run's enforcement record, and the module returning it is not the pipeline delivering it |
| R3-2 | B | **Table D understated the gates' evidence.** Measured: `skillBodyViolation` takes a registry snapshot and the run date and reads `HEAD:<rel>` (`:340`) and `HEAD:<ledgerRel>` (`:398`); `ledgerViolation` takes a registry snapshot and `extractsBySession` and reads `HEAD:<rel>` (`:555`) and the extracts (`:600`). **Their verdicts are not functions of the candidate bytes** — identical ledger bytes flip on whether the named session invoked the parent skill (`:589-606`). An extraction following the old table would keep the byte checks and silently drop ADR-0020's ownership, history and invocation-binding controls |
| R3-3 | B | **Validator Step 1's delete-and-RECORD half was inherited by nobody**, while this spec's own checklist claimed every step had an inheriting row. `scratchIntact` (`cli/dream.js:57-78`) is not equivalent — measured, an added `EVIL.json` passes it |
| R3-4 | C | **Table S's closed consumer list was false**: S1 quantified over "any path this module publishes" while the list held only downstream consumers, and the report's own internal second write consumes the first publish's returned buffer |

All four reproduced independently against the tree before acting.

### THE CIRCUIT-BREAKER FIRED A SECOND TIME, on a NEW family

R2-1, R3-1, R3-2 and R3-3 are one family: **a durable or security-visible
behaviour of the code this package replaces that no row inherits, or whose
evidence the replacement understates.** Four instances across two consecutive
rounds. The breaker's rule is to stop patching and extract.

**Table V — what `validateAndCommit` owns today, and which row inherits it** is
that extraction, in the pipeline half. Six step rows plus a row for the RETURN.

**The root cause, named in the table itself:** this spec's Current state listed
the validator's six steps **by name and line — an inventory, not an
enumeration.** It never said what any step CONSUMES or what it durably PRODUCES,
and all four findings lived in exactly that gap. **A 1469-line function is
replaced safely only by the second kind of reading, and it never got one.**

**The enumeration immediately found a FIFTH instance the round did not report:**
row V7. The pipeline consumes five of the validator's seven return fields, four
of them in the user-visible summary line (`cli/dream.js:628-631`), and **no row
owned that channel** — which is the same channel R3-1's enforcement record and
R3-3's out-of-vault records must travel on. That is what makes the extraction
load-bearing rather than clerical.

### Dispositions

| # | Disposition |
|---|---|
| R3-1 | **FIXED.** New row **G11** owns the run's accounting and output, and states plainly that returning is not delivering. New criterion, RED against a pipeline that reads the published outcomes but never `report.record` |
| R3-2 | **FIXED.** Table D's three gate rows now enumerate the complete evidence per gate, with a new row stating why and two rules: each gate receives every value its row names, and no gate may substitute a vault re-read or a git query. New criterion: identical bytes, different verdicts, solely from registry or invocation evidence |
| R3-3 | **FIXED.** New row **G12** keeps both halves — the fail-loud abort unchanged, and the enumerate-delete-record behaviour preserved. New criterion RED against `scratchIntact` alone, which is green on the input that discriminates |
| R3-4 | **FIXED.** Table S gains a SCOPE row (S5) before its list (now S6): the table governs what `promote()` RETURNS, and the one internal `writeIntoVault` handoff is Table D's report row and Table R's, cited not restated |

Also repaired: the Mirrored Surface Checklist bullet that **asserted every
validator step had an inheriting row.** It was written with nothing to check it
against and was false. It now points at Table V, where "no owner" is a visible
row rather than an absence.

### Defects this round's own fixes introduced

- **Rows G11 and G12 were again inserted BEFORE G10** — the identical mistake as
  round 2's G10-before-G9. **Twice is a pattern, so it now has a mechanical
  check** rather than another promise to be careful: extract the row ids, sort
  numerically, diff. It caught this one; it is recorded here so any future editor
  runs it instead of re-deriving it.

### Measurements after the round

| Measure | Value | Tripwire |
|---|---|---|
| module half acceptance criteria | **26** (was 25) | T1 fires above 28 — **not fired, and now two away** |
| of those, the report's | **6** | T2 fires above 8 — not fired |
| pipeline half criteria / deliverables | **18** / **6** | — |

`npm run lint` exit 0.

### The trend, and an honest confound

**B-band findings per round: 1 → 1 → 2 → 3.** Rising, which is the opposite of
what convergence looks like, and it is decision-grade rather than reassuring.

**The confound, stated because it cuts against the alarming reading and this
author introduced it:** round 3's dispatch explicitly aimed the reviewer at the
family that had just produced a finding — it told the reviewer to walk
`validateAndCommit`'s six steps and ask which row owns each outcome. **Finding
more of that family is therefore not independent evidence that the text is
decaying.** It is partly evidence that a region nobody had systematically
inspected was finally inspected. The two readings are not distinguishable from
the count alone, and the count should not be reported as if they were.

What IS independent: **every finding in rounds 2 and 3 was in the same region**,
and that region now has a canonical table with an explicit "no owner" entry. The
next round's B count is the measurement that discriminates — if the family is
genuinely drained, it should come back on something else or on nothing.

## Round 4 — authorised 2026-08-28, WITH ITS READING PINNED IN ADVANCE

**Authorised** by the owner under the runbook's HEAVY rule, whole settled text,
clean definition unchanged (no A, no B).

**Why this round is designed differently.** Round 3's B count could not be
interpreted, because this author had aimed that round at the family which had
just produced a finding — so "found more of them" and "the text is decaying"
were indistinguishable. The owner's fix is to remove the confound at the source
and to fix the interpretation before the measurement exists.

### (b) UNDIRECTED DISPATCH — owner-ruled

**The dispatch does NOT name the family, does NOT name `validateAndCommit`, and
does NOT tell the reviewer to walk anything.** Table V is handed over the way
Table S was in round 3 — as the newest text, attack it — with no hint of what
produced it. The attack surface is the generic one this gate always carries.

**One tension, resolved and recorded.** The runbook requires that a round ≥ 2
list the prior findings and ask the reviewer to verify each is genuinely fixed.
That listing inevitably carries some signal. It is kept, because catching a
re-worded fix is what it exists for and round 2 proved it necessary — but the
priors are stated as *individual defects and their claimed fixes only*, with no
pattern named, no grouping, and nothing said about where the next one might be.

### THE READING, PINNED BEFORE THE ROUND — owner-ruled

| Round 4 returns | Reading | Consequence |
|---|---|---|
| **Clean** (no A, no B) | the region is drained | **Ready path** — flip both specs, update PR #30 |
| **B-band findings, but NOT in the family** | the region is drained; the loop is finding ordinary new-design defects | **Ready path**, after those findings are dispositioned under the normal rules |
| **B-band findings IN the family** | the region is NOT drained, and three consecutive rounds on one family after two extractions is a structural signal, not a defect list | **STRUCTURAL ESCALATION to the owner** — no further patching, no fourth extraction |

### "IN THE FAMILY" — the decidable test, written before any finding exists

The family: *a durable or security-visible behaviour of the code this package
replaces that no row inherits, or whose evidence the replacement understates.*
A finding is IN the family **iff BOTH hold**:

1. **It concerns something that already EXISTS** in the code this package
   replaces or rewires — `validateAndCommit` and its return, or the
   `src/cli/dream.js` run path — on `main` @ `36c2ce5`. Not something this
   package newly invents.
2. **The defect is one of ownership or understated evidence**: no Table G or
   Table V row assigns the thing an owner, or a row assigns it but names less
   than it actually consumes or produces.

**The operational form, which must agree:** *does knowing the right answer
require reading the REPLACED code?* If the correct fix can only be found by
going and looking at what `validateAndCommit` or the current pipeline actually
does — IN the family. If it is derivable from this package's own new design —
NOT in the family.

**Worked both ways, from findings already ruled, so the test is calibrated
rather than asserted:**

- **IN:** R2-1 (Step 6 unowned), R3-2 (gate evidence understated), R3-3 (Step 1
  unowned), R3-1 (the return/summary delivery channel is inherited, and V7 is
  where it lives).
- **NOT IN:** R1-1 and R2-2 (the decided-bytes interface is this package's own
  invention — no replaced code to consult); R3-4 (Table S's scope, likewise);
  and, hypothetically, anything about C9's allowlist, Table R's fallback shape,
  or the reap precondition's platform scoping — all new design.

**If the two formulations disagree on a real finding, the owner rules the
classification. This author does not.** That is the whole point of pinning it
now: the classification decides the consequence, so it must not be made by the
person whose work is being judged, after seeing what was found.

### (c) The tripwire is self-acting — acknowledged

Module half stands at **26** of a **28** ceiling. If round 4's dispositions add
three or more criteria there, **T1 fires by itself** and Table R plus the
report's criteria move to `WP-dream-promote-report`. No further owner decision
is needed for that; the ruling that pinned it is the decision.

### Round 4 — 2026-08-28 — gptsol, external, FRESH agent, UNDIRECTED, WHOLE TEXT

Raw: `2026-08-28-promote-split-round-4-raw.md`, committed before adjudication.
Verdict **needs-attention**, **two findings, both band B, zero scope
objections.** Nine of ten priors genuinely fixed; **R3-3 ruled RE-WORDED BUT
STILL DEFECTIVE** — the first time this loop's re-audit has caught that, and the
reason the runbook requires the re-audit at all.

**NOT CLEAN.** No `Ready` flip, no PR.

**The dispatch carried no steer.** The family was not named, `validateAndCommit`
was not named, no walk was prescribed, and Table V went over as "the newest
text". The round-3 confound is therefore absent from this measurement.

### THE CLASSIFICATION, applied against the test pinned before the round

**F2 — Table V drops EP2's durable redaction lifecycle. IN THE FAMILY. Both
formulations agree, unambiguously.**

- Test (1) — does it concern something that already EXISTS in the replaced code?
  **Yes**, and this author verified all four on the tree before classifying:
  `quarantinePreserve` writing the private artifact and its collision-resolved
  basename (`validate.js:1276-1290`); the byte-identity preservation-failure
  abort that refuses to destroy a file when no durable copy holds the bytes that
  are there NOW (`:1298-1323`); once-per-run retention via
  `pruneRedactedOriginals` (`:1365-1366`); and the report's "Redacted in place"
  section carrying `{path, lines, labels, name}` (`:1398-1408`).
- Test (2) — is the defect ownership or understated evidence? **Yes.** V3 lists
  only "dispositions and the revert/re-stage/index-drop machinery". Table D's
  gate return is `{ok} | {refuse, reason} | {redact, sanitizedBytes}` and carries
  none of `lines`, `labels` or `name`.
- Operational form — does the right answer require reading the REPLACED code?
  **Yes, decisively.** Nothing in this package's own design says a redaction owes
  the user a recovery pointer; only Step 3 does.

**The user-visible consequence, stated plainly:** a conforming implementation can
redact a note, delete nothing, break nothing any criterion tests — and never tell
the user where their unredacted original is. `state/quarantine/redacted/`
deliberately carries no digest banner, so **the report line IS the discovery
path**. Losing it loses the copy in practice.

**F1 — scratch violations have no interface into the report. AMBIGUOUS; the two
formulations DISAGREE, so per the pin the OWNER classifies, not this author.**

- The structural test leans IN: the obligation exists in the replaced code
  (Step 1's records reach the report at `:1385-1386`), and that is where G12's
  wording came from.
- The operational test leans OUT: knowing the right ANSWER — that `promote()`
  needs an input field for code-owned pre-promotion records — requires only this
  package's own design, not the replaced code. That makes it the R1-1/R2-2 class:
  **a rule stated that the interface cannot carry**, which was ruled NOT in the
  family when it was calibrated.
- **It does not change the consequence.** F2 alone triggers the escalation. F1's
  classification matters for the RECORD and for whether the family is one
  phenomenon or two, so it is left to the owner rather than resolved by the
  author whose work is being judged.

### CONSEQUENCE — STRUCTURAL ESCALATION, per the pinned reading

**Three consecutive rounds have landed a finding in this family, after TWO
extractions built to close it — and round 4's instance is INSIDE Table V, the
extraction whose entire purpose was to prevent it.** The pinned rule is
unambiguous and is followed exactly:

> **STRUCTURAL ESCALATION to the owner — no further patching, no fourth
> extraction.**

**Nothing is patched. No spec was edited in response to this round.** F1 and F2
stand open and undispositioned, on purpose. Patching them would be the fourth
instance of the behaviour the escalation exists to stop, and would also destroy
the measurement the owner set up.

### What this author believes the escalation MEANS — offered as input, not as a ruling

**The undirected round is the decisive evidence.** Round 3's count was
confounded because this author aimed it. Round 4 was not aimed, and the family
came back anyway — from a completely different region of the replaced code
(EP2's redaction lifecycle, which no prior round had touched). **That is the
measurement the owner designed, and it came back "not drained".**

**What the two extractions did and did not achieve.** Table S closed the
decided-bytes contract, and it has held for two rounds. Table V closed the
STRUCTURE of inheritance — it made "who owns this step" askable and gave "no
owner" a visible home. **What neither did is establish WHAT each step actually
owns**, and that is not a table-shaped problem. V3 is not wrong in form; it is
wrong in content, because its content was written from the same inventory-level
reading of `validateAndCommit` that produced every prior instance. **A ledger
filled in from an incomplete reading inherits the incompleteness and gives it an
official-looking home.**

**The honest conclusion this author draws, with its counterweight.** The
remaining work is not review work. It is a **systematic read of
`validateAndCommit`'s 1469 lines and the run path around it**, enumerating every
durable output, side effect, artifact, retention behaviour and report line, and
checking each against a Table V row — done once, offline, against the code rather
than against the spec. Four rounds have each found a slice of that by sampling;
sampling has produced 1, 2, 3 and 2 B-band findings and is not converging on
zero. **The counterweight, because it is real:** such a pass is expensive, it is
exactly the work the split was supposed to have already done, and there is no
guarantee it is complete either — its only advantage is that it reads the source
of truth instead of sampling around it, and that it can be checked line-by-line
against Table V afterwards.

**What is NOT in question:** the seam (owner-ruled, closed), the two extractions
(both holding — Table S for two rounds, Table V structurally), and the nine
priors that are genuinely fixed. The loop is finding real defects and the fixes
are sticking. The question the escalation puts is whether to keep finding them
one round at a time.

### Measurements after round 4

Unchanged from round 3, because **nothing was edited**: module half **26**
criteria (T1 fires above 28 — not fired) / **3** deliverables; pipeline half
**18** / **6**. `npm run lint` exit 0.

**B-band trend: 1 → 1 → 2 → 3 → 2.** The round-3 peak was partly this author's
steer; round 4 removed the steer and still returned two.

## OWNER RULINGS on the round-4 structural escalation (2026-08-28)

### (1) F1 is the INTERFACE family, not the replaced-code family

**The deciding test is the REMEDY, and the owner states it as the general rule:**
F1's fix is an interface field — `promote()` gains an input for code-owned,
pre-promotion records — which is **Table S's closed-consumer-list
jurisdiction**. That places it with R1-1 and R2-2.

**The structural test's inward pull recorded the DISCOVERY path, not the family
membership.** That distinction is the reusable part: *where a defect was found*
and *what kind of defect it is* are different questions, and the classification
test this author pinned conflated them. The remedy test does not.

**The two families are TWO PROJECTIONS OF ONE ROOT CAUSE — the inventory-level
reading.** Reading `validateAndCommit` by step name and line, rather than by what
each step consumes and durably produces, yields:

- **an ownership gap** when a produced thing has no row — the replaced-code
  projection (R2-1, R3-1, R3-3, F2);
- **an interface gap** when a produced thing has a row but no field to travel on
  — the interface projection (R1-1, R2-2, F1).

**This is why the remedy below is SHARED rather than two remedies.** Both
projections are closed by the same act: reading the source of truth once,
completely, and checking every produced thing against both a row AND a field.

**F2's consequence and the escalation STAND** regardless of F1's
reclassification, exactly as this author stated when escalating: F2 alone
triggered it.

### (2) THE STRUCTURAL REMEDY IS APPROVED — the systematic read, not more sampling

Sampling has produced 1, 2, 3 and 2 B-band findings across four rounds and is not
converging on zero. The approved sequence, in order, **pinned here before step
(a) runs**:

| Step | What | Constraint |
|---|---|---|
| **(a) MEASUREMENT** | a fresh clean-context agent reads `validateAndCommit`'s **all 1469 lines** and the surrounding run path **against the CODE**, and produces the COMPLETE inventory — every durable output, side effect, artifact, retention behaviour and report line, each with its consumers — then diffs it line by line against Table V and the D / G / S surfaces | **NO SPEC EDITS.** Its output is the **gap list**, not spec text |
| **(b) FIX** | ONE pass from the VERIFIED inventory, including **F1's interface field** and **F2's discovery-path delivery** | under the standing disciplines: intra-cell whole re-read after rewriting a canonical cell, claim-level family-wide sweep, the mechanical G-row-ordering check, number-vs-noun |
| **(c) CONFIRM** | ONE round under the HEAVY rule, **undirected** | **its B-count is the deciding measurement** |

**The tripwire stays self-executing as designed** — if step (b) pushes the module
half past 28 criteria, T1 fires on its own and the report moves to
`WP-dream-promote-report`. No further decision is needed.

**F1 and F2 stay OPEN until pass (b).** The owner recorded that this author's
restraint in not fixing them was correct.

### Method note for step (a), pinned so the measurement is not anchored

**The inventory is built from the CODE BEFORE the specs are opened.** Reading the
spec first and then looking for confirmation in the code is the exact failure
mode that produced every instance of both projections — the reader inherits the
spec's frame and sees what it describes. The agent therefore produces its
complete inventory from `src/` alone, writes it down, and only then opens Table V
and the D / G / S surfaces to diff. **The ordering is the method, not a
preference.**

## Step (a) — the measurement's result, and ONE scope question for the owner

Raw: `2026-08-28-promote-split-inventory-measurement.md`, committed before
adjudication. **95 items; 48 COVERED, 8 DROPPED-BY-DESIGN, and 39 gaps** — 27
ownership, 4 interface, 8 understated.

**The method held.** The agent confirms it wrote `/tmp/inventory.md` from the
code before opening any spec, and its execution report shows it read all 1469
lines of `validate.js` and all 646 of `cli/dream.js` by numbered ranges plus the
called modules. This is the first reading of this system that was not anchored
by the spec's own frame.

### The strongest independent result

**All four GAP-INTERFACE items are the EP2 redaction metadata** — the
collision-resolved quarantine basename, the scrubbed-line count and detector
labels, the per-redaction report line, and the enforcement record's
surviving-original metadata. **A different method, run blind, landed on exactly
round 4's F2.** That is confirmation rather than repetition, and it means the
interface projection of the root cause is real and precisely located.

Alongside them the measurement adds three EP2 items no round had found: **I067**
(no recoverability invariant when redaction fails AND withheld preservation
fails — workspace teardown could then destroy the only copy), **I070** (the
byte-identity condition for deleting a redundant redacted copy), and **I072**
(retention: the 50-file cap, oldest-first, never pruning this run's own copies).
I067 is ranked first in the gap list on damage, and this author agrees with that
ranking: it is the one item where a conforming implementation destroys a user's
only copy of something.

### THE SCOPE QUESTION — the owner's call, not this author's

**The measurement inventoried the WHOLE RUN PATH. Table V's stated remit is
`validateAndCommit`** — its heading says so. That difference is worth roughly
**20 of the 27 ownership gaps**, so it changes the size of pass (b) by about
three times, and it is a scope decision rather than a technical one.

The disputed items are behaviours in `cli/dream.js` that this package does not
change: the single-run lock (I004, I005, I006), transcript selection, budgeting
and scratch construction (I007–I017), the digest and its inputs (I019, I020),
the containment probe (I021, I022), private logging and output redaction (I025,
I031), run-evidence (I030), the settings profile and staging reset (I027, I028),
and the config/date input contract (I002).

**The case for the narrow reading (Table V = the validator):** a spec does not
owe a row to every behaviour in a file it edits. These are untouched by rows
G1–G12, and "don't break what you don't touch" is the default that keeps a
package's boundary meaningful. Writing 20 rows for behaviour nobody is changing
is the plausible-looking rigor the authoring rules tell us to cut.

**The case for the wide reading (Table V = the run path):** this package
**modifies `src/cli/dream.js`** — its whole blast radius is that file. Four
rounds have now shown that what this pair fails at is precisely *not noticing
what existing code produces*. The narrow reading is also what produced R3-3: Step
1 was "not this package's subject" right up until it turned out G12 had to own
it.

**This author's recommendation, with its weakness stated.** Take a MIDDLE
reading: Table V's remit is the validator PLUS any run-path behaviour that this
package's own required changes interact with. On that reading the real gap list
is about twelve items — the four interface gaps, I067, I070, I072, plus **I095**
(lock-guarded scratch cleanup, which G5's teardown wiring touches), **I018**
(dry-run previews the composed argv, which G1 re-points), **I078/I085** (the
note/skill counter semantics, which G11 now claims), **I081** (`committed[]`
neither inherited nor dropped), and a check on **I093** (digest regeneration
ordering versus G4's changed transcript-advance). **The weakness: "interacts
with" is a judgement, and it is the same kind of judgement that missed Step 1.**
A middle reading is only as good as the person drawing the line, and that person
has now been wrong about this four times.

**Nothing is edited. Pass (b) does not start until the scope is ruled**, because
the ruling determines what pass (b) contains.

## T1 HAS FIRED — measured mid-pass-(b), 2026-08-28

**Measured, not estimated:** the module half now carries **30** acceptance
criteria. **T1 fires above 28.** The pinned ruling
(`2026-08-28-promote-split-owner-ruling.md`) makes this self-executing: *"whoever
measures the condition states the measurement and cuts the package. It is not a
fresh escalation; the escalation already happened and this is its answer."* The
owner reaffirmed it when approving the remedy — *"the tripwire stays
self-executing as designed"*.

| Measure | Value | Threshold | State |
|---|---|---|---|
| module acceptance criteria | **30** | T1 fires above **28** | **FIRED** |
| of those, the report's (#15–#20, #25) | **7** | T2 fires above **8** | not fired |
| module deliverables | 3 | — | — |

**What pushed it over, stated so the cause is visible:** pass (b) added four
criteria to the module half — three for Table Q (the redaction's recovery copy,
the only-copy invariant, retention) and one for round 4's F1 (the caller's
records reaching the report). The count went 26 → 30. **None of the four is
report-scoped**, which is why T2 did not fire alongside it: the pressure this
time came from the EP2 quarantine lifecycle, not from Table R.

**That is worth recording against the tripwire's own design.** The tripwire was
pinned on the hypothesis that the REPORT was the module half's pressure point,
and T2 was the sharper instrument aimed at exactly that. The measurement says
the hypothesis was half right: the report is large, but what actually broke the
ceiling was a contract nobody had inventoried. **T1, the blunt instrument, is
what caught it** — an argument for keeping a coarse ceiling alongside a targeted
one, since the targeted one can only watch what you already suspect.

**The cut, as pinned:** Table R, Table D's report row, and the report's
acceptance criteria move to a third, stacked package **`WP-dream-promote-report`**,
which depends on the module half and is depended on by the pipeline half. The
module half keeps the decision, the four gates, Table Q and the publish for
ordinary notes; the report package takes the body's promotion, the code-authored
second write, and the fallback. **Ordinary notes need nothing from Table R**, and
the module half already ships consumed by nothing, so the intermediate state
regresses no running product.

**Pass (b) is therefore not finished.** Its module-side work is committed; the
pipeline-side items (I095, I018, I078/I085, I081, I093, F1's G12 wiring, and
F2's V3 expansion) and the cut itself remain. **The cut lands before pass (c)**,
because pass (c)'s undirected round must run on the shape that will ship.
