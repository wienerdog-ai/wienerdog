---
title: The Table Q reconciliation pass — the EP2 failure arms decided in one sitting
date: 2026-08-29
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace, WP-secret-fence-ep2-redact-arm, WP-ep2-retention-prune-timing-test]
---

<!-- markdownlint-disable -->

# The Table Q reconciliation pass

The ADR-0031 reconciliation both PR gates recommended
(`2026-08-29-promote-module-pr-gates.md` — **that entry lives on branch
`wp/dream-promote-module` at commit `3e37237`, not on `main`; if this amendment
merges first the citation dangles until that branch lands**). **Nine rounds across this family had
landed on one question — what the EP2 secret gate produces besides a verdict,
and who carries each part of it downstream.** Table Q, extracted in pass (b),
had settled the SUCCESS arm and left the failure arms, the invariant's evidence
and the lifecycle rows without owners. Five escalated questions, decided
together rather than one per round. **Drafted by the architect; the owner rules.**

Run on `docs/promote-table-q-reconciliation`, branched from `main` at `dcd5777`
so the boundary gate treats it as docs-only. `wp/dream-promote-module` was read
(`git show`) and never checked out; its `status:` line and its `workspace.js`
Current-state bullet were left untouched, because PR #31 modifies both.

## THE FINDING NEITHER GATE RAISED, and it re-shaped three of the five answers

**Rows Q5 and Q6 were restating a SHIPPED, `Done` package's canonical tables.**
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md` owns the EP2 gate's durable
quarantine lifecycle:

| What Q4/Q5/Q6 said | Where it is actually decided |
|---|---|
| the fail-loud abort distinguishing three states | that spec's Table B row **B3b** (condition) and its Table Q row **Q18** (the message — **four** fields, and the identity disposition has three values of its own) |
| a redundant copy deleted only on proven byte-identity | that spec's Table R **consequence 2**, with its `Buffer.compare` guard, both keep-combinations, fault injections FI-10/FI-16 and mutations M-31/M-45/M-49/M-50/M-51 |
| `redacted/` pruned toward 50, oldest first, excluding this run's copies, best-effort | that spec's **Table N**, N1–N7 — whose own header says *"Every retention fact is decided here"* and *"None may restate a number from this table"* |

Both gates said "either Q1 gains a field, or the criterion moves to the package
that owns the gate". **Neither noticed that the package owning the gate is
`Done`, has these criteria already, and forbids the restatement by name.** Q6
restated five of Table N's seven facts including the literal cap, and omitted
two. Q4's "three states" was a summary that was weaker than, and already
drifting from, the four-field message it summarised.

That turns Q-B and Q-C from "where do we move these criteria" into "delete them,
and point". It also turns the answer to Q-A's shape question, because the same
`Done` package has solved the announce-a-quarantine-copy problem twice already
— and both times the surface it chose was **the one thing that reaches the
user**, which under promotion is the dream report, composed from typed fields.

## The five rulings

### Q-A — the redact-then-refuse arm. TYPED CARRIER ON THE REFUSED ARM.

`refused[]` becomes `{rel, reason, artifact}`, `artifact` **required and
nullable**. Table Q row **Q8** is new and owns it; Table S row **S3** is widened
to say a basename is not bytes and the no-bytes rule stops at bytes.

- **Protects:** an unredacted copy of secret-shaped content that the gate wrote
  before promotion knew the path would be refused, which nothing else announces
  (Q3) and which retention silently removes eventually.
- **Costs:** one field on one type, four registered mirrors, one acceptance
  criterion in each of two packages.
- **Rejected — a third return arm:** a new top-level array is a new contract
  surface with new consumers in two packages, for a fact that belongs to a
  refusal that already has a home.
- **Rejected — an explicit Q-row ruling that redact-then-refuse cannot occur:**
  unachievable inside this family's cut. EP2 must run pre-merge and brain-scoped
  by owner ruling, and the primitive's `expect` guard is necessarily at publish
  time — so the preservation cannot be ordered after the last thing that can
  refuse without inverting Q7 and handing this module the state directory.
- **Rejected — keeping the prose clause as well:** two carriers for one fact is
  the mirror shape this repo treats as a finding, and the prose one is the
  proven-broken half.

**The ruling deletes the shipped mitigation rather than extending it**, which is
the part worth stating plainly: `withPreserved`, its divergent inline copy and
the `refuseRaw` machinery all exist ONLY to make prose carry a structured fact.
Findings N1 and N4 are dissolved by the deletion, not fixed.

**Named residual, accepted:** the RECOVERY of brain-authored refused content is
not made a product promise. The line the report composes carries **delete**
guidance, not restore guidance. A refused note's content is discarded with the
workspace on every other refusal route too, and promising otherwise would be a
new product surface.

### Q-B — Q4's evidence. THE CRITERION IS DELETED, NOT MOVED, AND Q1 GAINS NO FIELD.

- **Q1 gains no match-verdict field.** It would put a second party's judgment on
  evidence only the first party holds, duplicating a test already decided,
  asserted and mutation-covered in the `Done` package. Row **Q7** now says so
  and says what this module's share actually is: **a sanity refusal on the
  gate's own result, not the invariant's enforcement.** Calling it the latter
  would be the weakening Q4 forbids.
- **The criterion is not relocated to a new home.** It already has one. Row Q4
  cites B3b/Q18; the module's criterion is rewritten to assert only what this
  module can observe.
- **Costs:** the family no longer asserts the three-state message anywhere of
  its own. That is correct — it is asserted where it is implemented.

### Q-C — Q5/Q6. THEY DO NOT BELONG IN THIS FAMILY AT ALL.

Rows kept, contents replaced by pointers; both acceptance criteria deleted;
Out-of-scope bullets added to all three specs. **Row NUMBERS were kept
deliberately** — other packages cite Q-rows by number, and renumbering would
silently retarget those citations.

The one open gap in that contract already has its own package,
`WP-ep2-retention-prune-timing-test`.

### Q-D — the ordering. ONE PARAGRAPH IN TABLE C's HEADER, AS RECOMMENDED.

With one correction to the recommendation as stated: **"C1 precedes the four
gates" is true but incomplete, and the incomplete form would have been wrong
about C3–C8.** Measured against the shipped code, the order is
**C1, C2 → EP2 → C3–C8 with the merge → the three post-merge gates**. Table D
positions the four gates relative to the MERGE, which happens inside C6, so
C3–C8 interleave with the gates rather than preceding them. The header now says
that, and says C2's own reason: a `deleted` record has no after-bytes, so a gate
handed one judges nothing. Table D's preamble gains a one-sentence pointer.

**Rejected, and recorded in the header so it is not re-derived:** moving C4, C8
and the missing-baseline case ahead of EP2 too. It removes three of the routes
into Q8's arm and closes none of them, so it buys a lower incidence of an arm
the contract now handles, at the price of an ordering prescription the table
would have to keep true forever.

### Q-E — the consequence. STATED IN THE SAME PARAGRAPH, AND JUDGED THE RIGHT TRADE.

A path C1 refuses never reaches the gate, so no quarantine copy is preserved for
it: a hard secret the brain writes into `.claude/settings.json` now leaves none
where the shipped validator left one. Right trade — brain-authored content on a
path promotion can never accept, the workspace is destroyed either way, and the
alternative mints a durable artifact for a note the product will never take
while holding that note's transcript forever. **Under Q-A the refusal now states
the absence positively:** `artifact: null`, rather than a silent omission.

**Deliberately NOT added: a Security-checklist bullet for it.** One fact, one
place — Table C's header owns the ordering and its consequences, and the
Mirrored Surface Checklist registers that paragraph as a Table Q mirror so the
sweep reaches it. The trade-off is named rather than hidden: a security reviewer
reading only the Security checklist will not see this consequence.

## What NOT to read this record as

**This pass did not re-import anything the family re-cut away.** The report
line's CONTENT is `WP-dream-promote-report`'s and is stated in its Table R; the
delivery of a refused report's record stays `WP-dream-promote-in-workspace`'s
row G11; filesystem discipline stays Table H's, cited and never restated. The
module half gained one field and one row and LOST two rows and one criterion.

## Surface accounting, because the constraint was to freeze it

| Surface | Before | After |
|---|---|---|
| `WP-dream-promote-module` Table Q rows | 7, two of them restating a `Done` package | 8, two of them pointers |
| `WP-dream-promote-module` acceptance criteria | 2 for Q4/Q5/Q6 | 1 for Q4's real share, 1 for Q8 |
| `WP-dream-promote-report` | — | +1 Table R row, +1 criterion |
| `WP-dream-promote-in-workspace` | — | 0 new criteria; the G7 criterion EXTENDED |
| new tables | — | **none** |

## The divergence this creates against PR #31, stated so nobody discovers it late

The shipped implementation is correct about the ordering (Q-D/Q-E need no code
change) and correct about Q4's sanity refusal. It diverges on Q-A, and the fix
is mostly a DELETION — see the report handed to the owner with this record.

## What I would flag about my own pass

- **I nearly ruled Q-C the way both gates framed it** ("move the criteria to the
  package that owns the gate") and only found the real owner because the specs
  directory had two `WP-ep2-*` files in it. Two adversarial gates and nine
  rounds did not find a duplicate of a `Done` package's canonical table. **A
  cross-family duplicate is invisible to a gate scoped to one package's diff**,
  which is a gap in the gate design, not in either gate's execution.
- **The letter-space collision was a hazard I created by ruling.** Citing a
  package whose Table N is a different Table N is exactly the correct-looking
  wrong reference this family keeps producing. Recording it in the map was part
  of the ruling, not follow-up.

## Design-review loop: STOP CRITERION, pinned BEFORE round 1

**Pinned by the relay before the first adversarial round, which is where this
rule belongs and where the PR-gate loop on `WP-dream-promote-module` failed to
put it.** That loop ran two rounds without an agreed finish line; this one does
not start until the finish line exists.

**What closes the loop.** A round that finds nothing about the PRODUCT — the
contracts an implementer builds against, what a user or a consuming model
observes. Findings about the specs' own verification machinery at that point are
fixed inside the existing surface or accepted as named residuals; they do not
extend the loop.

**What escalates instead of iterating.**

1. **A third round landing again on the EP2-result family** — what the secret
   gate produces besides a verdict, and who carries each part. Nine rounds have
   now landed there. A tenth is not a review finding, it is evidence that the
   contract wants a different shape, and it goes to the owner as a design
   question rather than a patch.
2. **Any finding whose honest fix RE-IMPORTS a property this family was re-cut
   to exclude** — the report, the commit, the pipeline, or the vault-write
   primitive's filesystem discipline. That is a contract change wearing a
   patch's clothes and it is the owner's act, however small the diff looks.
3. **Any finding that requires GROWING the verification surface to hold a
   finding about the verification surface.** Measured in this repo: each fix
   injects 0.5–0.9 new defects, so a growing surface refills the defect supply
   and the loop cannot converge. Fix inside the existing surface or name the
   residual.
4. **A second cross-family duplicate.** The pass found that Q5/Q6 restated a
   shipped `Done` package's canonical tables. If another surface in this family
   turns out to restate an owned contract, the question is no longer "fix this
   spec" but "why does this family keep copying contracts it does not own".

**Weighted closure applies as written:** a HEAVY finding (one that changes what
an implementer builds) lands its fix and then takes a fresh full round; a LIGHT
one (machinery, wording, a mirror walk) is verified mechanically and does not.

---

## ROUND RECORD — the design-review pair, 2026-08-29

**Two passes ran against the amendment at tip `06a92a7`, and both raw outputs
are committed before adjudication, per `docs/runbooks/codex-review.md`.**

| Round | Gate | Raw output | Commit |
|---|---|---|---|
| **1** | adversarial DESIGN review (`docs/runbooks/review-prompts/adversarial.md`), backend gptsol (codex/gpt-5.6-sol via llmp) | `docs/specs/logbook/2026-08-29-promote-family-design-round-1-gptsol-raw.txt` | `c1d9c006b38c2fa6b559eefc4748fa9f90bda773` |
| **0** | template conformance + internal coherence, fresh general-purpose executor with no part in drafting, relaying or reviewing | `docs/specs/logbook/2026-08-29-promote-family-design-round-zero-raw.txt` | `41d6031a9d5d935d3d86814e2ffb8ecef4699e7c` |

Round zero is a peer of round 1, not a predecessor: both read the same tip, and
round zero verified with `git diff --quiet 06a92a7..HEAD --` that every analysed
file was byte-identical after this session committed round 1's raw output.

### THE DIAGNOSIS THE OWNER MADE, and it is the one worth keeping

**Eight of the eighteen findings are one disease: an incomplete sweep.** C2, C3,
C4, H1, H3, H4, H8 and H9 all have the same shape — the amendment changed a
claim, or introduced a rule, and did not propagate it to every surface that
carries it. `docs/runbooks/spec-authoring.md:56-63` already states the rule, and
**this family has now paid for it five times.**

**The most damning instance is H4, and it is worth stating in full because it is
the shape a future round will repeat.** The amendment's own new
path-qualified-citation rule exists precisely BECAUSE table letters collide. The
one letter it failed to list as colliding was **H** — and H is the letter where
this family already cites `H7` and `H9` bare, two row ids that exist in BOTH
letter-spaces and mean different things in each. **The rule was written, and was
not applied at the single place it was needed.** A rule authored in the same pass
that leaves its own motivating case unfixed is not a half-fix; it is evidence
that the pass swept for wordings it remembered writing rather than for the claim.

**So the fixes were not applied one at a time.** For each changed claim the
complete set of carrying surfaces was derived first, then swept — which is how
the report package's stale `{rel, reason}` (C2), the module's `row S5's list`
(the same slip as H5, one spec over, that round zero did not find), and the two
unregistered mirrors were all closed in the same pass as their originals.

### PER-FINDING DISPOSITION

**Round 1 — the adversarial round (one finding).**

| # | Finding | Disposition |
|---|---|---|
| 1 | C1 cannot fully precede EP2 for resolved-path denials | **FIXED.** C1 is defined by C9, which the primitive applies to the RESOLVED path, so C1 has two halves. Table C's header now states both: the candidate-decidable half (tier prefixes, extension, instruction-file basenames, denied segments — all readable off the candidate path) refuses before any gate runs; the resolved-path half is the primitive's `admit` call at publish time and arrives AFTER EP2. Consequence (ii) is scoped to the first half; consequence (i) is kept for both, with the second half's ground stated rather than assumed (a path EP2 withholds never reaches publish, so a C1-reasoned refusal always sits on a pass-or-redact verdict). Row **Q8** gains the resolved-path route and is the home for the artifact it can carry — the reviewer's own recommendation. The resolved-path acceptance criterion now asserts the artifact on the same symlink fixture it already builds. **The reviewer's alternative — exposing a read-only resolve/admit operation from the primitive — was NOT taken: it is a cross-package contract change, blocked by this pass's own stop criterion, condition 2, and it is the owner's act.** |

**Round zero — contract defects.**

| # | Finding | Disposition |
|---|---|---|
| C1 | the delete range contains a must-survive behaviour | **FIXED, and re-derived from the file rather than from the finding.** Measured: revert/re-stage/index-drop core `:1324-1332`; its `reverted[]` accounting `:1361-1363`; **the identity-gated deletion `:1338-1360` between them**; the abort `:1298-1323` above; the prune `:1365-1366` after the enclosing per-path loop (`:1233-1364`) closes. `:1364` is the loop's own closing brace at 2-space indent, so `:1324-1364` could not be applied literally without unbalancing the function. Swept: Current state, the Deliverables row, row G7, row V3 and the G7 criterion. The two geometrically false sentences ("sits between three things", "the three regions are neighbours") are replaced with the measured geometry. **The identity-gated deletion gained the line citation it never had** — it was the only one of the three unlocated, and the only one inside the delete range. |
| C2 | a stale mirror of the shape the amendment changed | **FIXED.** `docs/specs/WP-dream-promote-report.md`'s base-shape citation still read `refused:Array<{rel, reason}>`, the last surviving statement of the pre-reconciliation shape in the family. Swept; `grep '{rel, reason}'` over `docs/specs/WP-*.md` is now empty. |
| C3 | Table N has no channel row for `refused[].artifact` | **FIXED.** One row added, covering `refused[].artifact` and the report arm's `artifact` together: attacker-influenceable by derivation, redact-then-sanitise — the same classification `redacted[].artifact` already carries. N2's fail-closed default kept the property true; the finding is that Table N is the declared OWNER of the channel list and the list was incomplete. |
| C4 | the report union's refused arm has no artifact carrier | **FIXED, and it is the heaviest finding of the pair.** Q8's argument applies verbatim one surface over: the report body is a promotion candidate under `reports_dir`, the report row records that EP2 is the one gate that judges a path there, and the body is NOT a member of `refused[]` — so a redact-then-refuse left the copy's name with nowhere to travel. The refused report arm becomes `{outcome:'refused', reason, artifact, record}`, `artifact` required and nullable; Table R's preserved-copy row and its acceptance criterion now cover both sources; Table S row **S3**, which mirrors that arm's shape from the module half, is swept. **Naming it a residual was considered and rejected: it would have declared acceptable, on the report, exactly the data loss row Q8 exists to close on every other path.** |
| C5 | an assertion citing a table that does not contain the rule | **FIXED.** Table C's header said "per Table E only `withheld` defers a transcript"; Table E contains zero occurrences of "transcript" (verified). The rule is decided in `### Exact contracts`, and the citation now names it. |
| C6 | a logbook citation to a file that does not exist | **NOT A DEFECT — and a real merge-order dependency.** `2026-08-29-promote-module-pr-gates.md` exists on `wp/dream-promote-module` (`3e37237`); this branch is cut from `main`. Verified on both branches with `git ls-tree`. **Both citation sites now state the dependency**, so a maintainer merging in the wrong order sees that the citation dangles until that branch lands. |
| C7 | two verification steps that cannot fail, on a premise measured false | **FIXED.** Reproduced here: `tests/unit/dream-promote.test.js` does not exist on this branch, and `npm test -- --test-name-pattern "zzz-no-such-test-zzz"` exits 0 printing `tests 108 / pass 108`. Both pattern runs are now guarded with `test -f`, like the other two specs. **The false justification is DELETED, not reworded** — and replaced with the true one: the file is a MODIFY deliverable that exists only once `WP-dream-promote-module` has landed, which is exactly the tree where an unguarded run reads greenest. |
| C8 | the G7 criterion's RED proof covers two of the three behaviours | **FIXED.** The criterion now proves RED once per behaviour rather than once for the set, and names the identity-gated deletion FIRST — it is the only one of the three inside the span an over-wide removal takes, and the removal range this spec itself published until today contained it. |

**Round zero — coherence defects.**

| # | Finding | Disposition |
|---|---|---|
| H1 | Table Q's ownership claim made twice and unmade once, in one section | **FIXED.** The heading and the lead-in were the two surfaces closest to the change and the two the original sweep missed, while three sibling surfaces were corrected. Heading is now "the EP2 gate's result, and what promotion does with it"; the lead-in states the boundary and points at the paragraph and rows that draw it. |
| H2 | Q4 called a pointer in three places and an owner in two | **FIXED.** Q4 is a HYBRID and is no longer swept in with Q5/Q6: it points at the shipped enforcement (that package's B3b and Q18) AND owns the invariant as it binds this family, which is why row G5 cites Q4 rather than the shipped package. All three "Q4, Q5 and Q6 are pointers" surfaces corrected. |
| H3 | three different counts of the letter collision, none right | **FIXED STRUCTURALLY, not arithmetically.** Counted from the headings rather than copied: the EP2 package carries nine (`B H J K N P Q R T`); **five collide — B, H, N, Q, R.** The list now lives ONLY in the canonical map. The three specs cite the map and list nothing, and the map states the letters without stating a count, so there is no number left to drift. This is the same rule the report package's own Table R gate cell already states about member lists in citing surfaces. |
| H4 | the H collision is unlisted, and the family cites H7/H9 BARE | **FIXED.** The map's rule now reaches ROW IDS, not only table letters, stated over the class rather than over the two ids that provoked it. All six bare sites name their owner ("the primitive's H7"). Verified: `H7` and `H9` exist in both Table H letter-spaces — the primitive's staging object and directory unwind versus the EP2 package's "registration is a presence test" and "the step prints what it checked". |
| H5 | a wrong row cited as the surface that lists the consumers | **FIXED, PRE-EXISTING.** `S5` → `S6`. **And the sweep found the same slip unregistered in the module half** (`row S5's list` in its own Mirrored Surface Checklist), which round zero did not report; both are fixed, and both cells now say which row is the scope and which is the list. |
| H6 | line-range boundaries landing in the wrong construct | **FIXED for the ranges the amendment made load-bearing** — the delete range and the abort (`:1293-1323` → `:1298-1323`, the construct, `:1293` being a statement inside the preceding redact arm). **Also fixed, pre-existing:** the redact arm cited as `:1269-1291` in three places, where `:1291` is `continue;` and the construct closes at `:1294`. `:669-738`, `:906-946`, `:1365-1366`, `:1385-1386`, `:1392-1409` and `:1211` were re-checked and left alone. |
| H7 | a rule attributed to a header that carries it in the footer | **FIXED.** Verified: "Every retention fact is decided here" is at that spec's `:1755` (header), "None may restate a number from this table" at `:1813` (after the rows). Q6 no longer says both are in the header. |
| H8 | an MSC mirror list not updated for a mirror the same amendment added | **FIXED.** Table R's preserved-copy row ends "Neutralised at composition exactly like every other channel (Table N)" — a Table N mirror by its own text. Registered. |
| H9 | a new canonical ruling with no MSC entry at all | **FIXED.** Table C's ordering ruling now has its own checklist entry, naming its mirrors (Table D's preamble, rows C1 and C9, Q8's route list, the resolved-path criterion) and its two prohibitions. |

**Round zero — nits and conformance.**

| # | Finding | Disposition |
|---|---|---|
| N1 | a pointer carrying a premise that does not reach the rows offered for it | **FIXED by stating the smaller claim.** Measured: nothing outside the module cites Q5 or Q6. The text no longer asserts that they are cited; it states the general rule — renumbering the rows of a table other packages cite by number retargets those citations silently, so in this family a row id is never reused and never shifted, cited or not. |
| N2 | the rule that mandates spec paths names its target by bare WP id | **FIXED** at both sites. |
| N3 | a pointer carrying a count read out of its owner | **FIXED.** "both keep-combinations" → "the keep-combinations". Same disease as H3, one row over. |
| J1-1 | `### Contract table(s)` silently absent | **FIXED, RECORDED PRE-EXISTING.** Present in all three specs before this amendment; the round record does not credit it to the amendment. One `N/A as a single heading` line per spec, saying why the named-table substitution is right. |

### RESIDUALS NAMED RATHER THAN FIXED

**One, and it is the reviewer's own alternative rather than a finding.**

1. **The resolved-path admission answer is not available to `promote()` before the
   write.** The adversarial round offered, as its second option, exposing a
   read-only resolve/admit operation from the vault-write primitive so C1 could
   be decided in full ahead of EP2. **Not taken.** It is a cross-package contract
   change to a `Done` package, which this pass's stop criterion routes to the
   owner rather than to a patch, and the family's existing answer — do not build a
   second containment implementation — is an eleven-round result. **The cost is
   named where it lands:** a resolved-only denial makes a gate call and can mint a
   quarantine artifact that a fully-pre-gate C1 would have avoided. Row Q8 carries
   the artifact, so the cost is an extra durable file on a rare path, not a lost
   one. **If a later round lands on this again, it is the owner's design question,
   not a patch.**

**Nothing was named a residual to avoid work, and nothing required growing the
verification machinery.** C7's fix reused the guard shape the other two specs
already carry; C8's fix split an existing RED into three; C4's fix added one
field to one arm and one row to one table, both of which already existed.

### WHAT THE STOP CRITERION SAYS ABOUT WHERE THIS SITS

**The loop is NOT closed.** Round 1 found one PRODUCT finding (the C1 ordering
was wrong about real behaviour), and round zero found three more (C1's delete
range, C4's missing carrier, C7's non-discriminating steps). Under the pinned
criterion a HEAVY finding lands its fix and then takes a fresh full round.
**C4 and the round-1 finding are both heavy — each changes what an implementer
builds — so a fresh adversarial round is owed before `Ready`.**

**No escalation trigger fired, and each was checked:**

1. *A third round landing again on the EP2-result family.* **Fired in spirit and
   is worth the owner's eye.** Round 1's finding and round zero's C4 are both
   about what the EP2 gate produces and who carries it — that is now eleven
   rounds on one question. **The counter-argument for not escalating: both
   findings were absorbed by the shape this pass already chose** (a typed,
   required-and-nullable `artifact` on the refusing arm), extended to two routes
   nobody had enumerated. The contract did not want a different shape; it wanted
   the shape applied everywhere it belonged. **If a further round finds a THIRD
   carrier gap, that is the escalation.**
2. *A fix that re-imports an excluded property.* **Checked and refused once** —
   the primitive resolve/admit operation, named as the residual above.
3. *Growing the verification surface to hold a finding about it.* **Did not
   occur.**
4. *A second cross-family duplicate.* **None found.**

### DIVERGENCE AGAINST THE SHIPPED IMPLEMENTATION

Stated in the pass's return to the owner, not restated here — the record above
changes what the specs say, and the implementation on `wp/dream-promote-module`
is measured against the amended text by whoever folds it back.

### THE EDIT MADE TO THIS RECORD'S OWN BODY

**One, owner-directed:** the opening citation of
`2026-08-29-promote-module-pr-gates.md` gained its merge-order note (C6). Every
other statement above the `---` is left as written, including the ones this
round falsified — **Q-C's "other packages cite Q-rows by number" (N1) and Q-E's
"a path C1 refuses never reaches the gate" (round 1's finding).** A dated
execution record is not a living surface; the corrections live in the specs and
in this round record, which is what supersedes it.

## LOOP STOPPED AT ROUND 2 — escalated to the owner

**The stop criterion pinned before round 1 fired on condition 1.** Not a
judgement call made after the fact: the condition was written down, in this file,
before the first round ran, and both round-2 passes hit it independently.

| Round | Gate | Raw output | Commit |
|---|---|---|---|
| **2** | adversarial DESIGN review, backend gptsol | `docs/specs/logbook/2026-08-29-promote-family-design-round-2-gptsol-raw.txt` | `95fe35a` |
| **2** | internal coherence, fresh executor | `docs/specs/logbook/2026-08-29-promote-family-design-round-2-coherence-raw.txt` | `9283a87` |

**Round 1's finding is confirmed fixed** by the adversarial gate, on the text and
without a scope objection: C1's two halves are separate, and the
no-quarantine-artifact consequence is attached only to the half that supports it.
That part of the pass holds.

### The evidence, and why it is a shape question rather than four findings

**Four times now, this family has produced a fact and decided its carrier
separately — and each time the carrier was found missing by a review, never by
the surface that produced the fact.**

1. **PR gate, round 1.** A redaction followed by a refusal lost the quarantine
   artifact's name: `refused[]` was `{rel, reason}` and had nowhere to put it.
2. **PR gate, round 2.** The prose mitigation for (1) named the *sibling's* copy
   first on the pair route — a structured fact encoded into free text, which
   composed wrongly within one review round.
3. **Design round 2, adversarial.** Table D says **both** EP2 arms preserve to
   quarantine and that what they produce "travels back in the gate's result".
   Q1's taxonomy gives the refuse arm `{refuse, reason}` — **no `artifact`** —
   while Q8 requires that field "when a copy was preserved for that path" and
   forbids prose as the carrier. **A contract that requires what its own
   taxonomy cannot deliver.**
4. **Design round 2, coherence.** `validate.js:1358`, inside the span the
   pipeline spec marks MUST SURVIVE (`:1338-1360`), appends the copy's location
   to `reason`; `:1361` is the sole consumer of `reason` in that loop and sits in
   the range the same rows delete. **The surviving branch's only announcement
   channel is removed by the rows that mandate its survival.** Verified by
   `awk 'NR>=1233 && NR<=1364 && /reason/'` — one consumer, line 1361.

Each was absorbable alone. Together they are one root cause: **the EP2 gate's
OUTPUT has never had a single owned shape.** Table Q was extracted because four
rounds landed there; it settled the success arm and left the failure arms. This
pass added a typed carrier to one refused arm, and rounds found the next two arms
within one cycle. A fifth field on a fifth arm is the treadmill this criterion
exists to stop.

### The question for the owner

**One EP2 disposition shape that carries preservation output on every
preservation-producing arm** — hard withhold included — then propagated in one
sweep through Q1, `refused[]`, the report arm, Table N's channels, Table R's
lines, and the acceptance criteria.

Two sub-questions the rounds surfaced that the shape must answer:

- **Does the payload distinguish remediation?** The adversarial gate reports that
  Table R assigns **delete** guidance to a refused brain-authored copy while the
  shipped hard-withhold banner offers **restore** guidance. *(Relay note: this
  half is the reviewer's, reported as such — it was not independently verified
  here.)*
- **What carries consequence 2's keep-suffix** once `reverted[]` goes? It cannot
  be `refused[].artifact`: Q8 scopes that to the redact-then-refuse arm, and the
  suffix belongs to a branch owned by a shipped `Done` package.

### What is NOT waiting on that ruling

Round 2's mechanical findings are LIGHT and independently fixable once the shape
is ruled — bare colliding H-row citations in `WP-dream-promote-report.md`
(`:95`, `:286`, `:388`, `:417`) and two in the module (`:367`, `:436`), the
9-vs-5 letter-list ambiguity, the MSC gaps (H-7 to H-9), and the nits. They are
recorded in the raw output and deliberately NOT patched here: sweeping citations
into a shape that is about to change is how the same surface gets rewritten
twice.

**Nothing merges on this branch until the ruling lands.** `WP-dream-promote-module`'s
implementation (PR #31) is unaffected in its shipped behaviour — the divergence
is the typed carrier, which is exactly what the ruling decides.

---

## OWNER RULING ON THE ESCALATION, AND THE SWEEP THAT IMPLEMENTED IT

**The EP2 disposition shape is APPROVED as the root-cause fix**, and the ruling
is reproduced in substance because the sweep below is only checkable against it:

> One owned, typed disposition record per candidate, carried on **EVERY**
> preserving arm — the hard withhold included — and every fact about a preserved
> copy (artifact, remediation, the keep-suffix) is a **TYPED FIELD ON THAT
> SHAPE**, never prose, never a new per-arm carrier. Then the one sweep through
> Q1, `refused[]`, the report arm, Table N's channels, Table R's rows and the
> criteria.

Implemented on `docs/promote-table-q-reconciliation` in four commits — the shape
and the module half, the report half, the pipeline half, and the round-2 LIGHT
findings swept last so the same surfaces were not rewritten twice.
`wp/dream-promote-module` was read with `git show` and never checked out; its
`status:` line and its `workspace.js` Current-state bullet are untouched, because
PR #31 modifies both.

### THE TWO SUB-QUESTIONS, ANSWERED BY MEASUREMENT

**(a) Remediation semantics IS arm-dependent, and the two surfaces do not
conflict — they describe different arms, each correctly.** Measured here rather
than relayed: `validate.js:1398-1409` is the **redacted-in-place** arm, gated on
`secretRedacted.length > 0`, and its guidance is *"If the redaction was wrong,
restore from that copy while it is there; otherwise delete it."*
`WP-dream-promote-report`'s preserved-copy row is the **refused** arm, and its
guidance is delete, because the note never promoted — a provenance rationale, not
a contradiction. **The round-2 adversarial gate's framing of this as a conflict
was a category error and is NOT carried into any spec text.** The shape carries
remediation as a typed per-arm value (row Q9) so every surface READS it.

**One correction to the ruling's own citation, made by measuring both ends:** the
redact-in-place section's construct is `validate.js:1398-1409`, not `:1398-1404`
— `:1398` is `if (secretRedacted.length > 0) {` at indent 2 and `:1409` is its
closing brace at indent 2, while `:1404` is the `);` that closes the inner
`.map(` call. That is exactly the shape round-2 nit P-4 filed against three other
citations, so it is corrected rather than copied.

**A third measurement the sub-question did not ask for, and it changed what row
Q3 may claim.** The WITHHELD shelf is *not* in the same position as the redacted
one: `src/core/digest.js:817-822` renders a state-driven banner for
`state/quarantine/`, built by `listSecretQuarantine` (`:853-863`) from a
directory listing, and that function's own comment says the `redacted/`
subdirectory is deliberately excluded because "they are announced in the dream
report instead". So a withheld copy IS announced elsewhere; a redacted-shelf copy
is not. Row Q3 now says only what is true, and row Q9 states the withhold arm's
ground for being on the record — contract coherence and typed composition, not an
unannounced file. **Overclaiming there would have been a new false universal in
the same pass that closed one.**

**(b) The keep-suffix rides the record.** Q8's narrowing bound
`refused[].artifact`, a field this ruling deletes; row Q9's fields are not scoped
by Q8, and row Q8 now says so in as many words so the narrowing is not
re-derived.

### THE SHAPE, AND WHERE IT IS OWNED

**Owned in `WP-dream-promote-module`'s Table Q**, which was already the canonical
table for the EP2 gate's result. **No new table** — the surface accounting this
pass froze stays frozen; the shape cost ONE new row.

- **Row Q1 owns WHICH ARMS CARRY IT.** `{ok}` | `{refuse, reason, preserved}` |
  `{redact, sanitizedBytes, lines, labels, preserved}`. `{ok}` has no `preserved`
  field at all; the redact arm carries it; **the refuse arm carries it, hard
  withhold included** — the gap that ended the loop.
- **Row Q9 (NEW) owns AN ENTRY'S FIELDS.**
  `Array<{artifact, location, remediation}>`, one entry per copy the gate
  preserved, in the order it wrote them. `artifact` is the reported basename;
  `location` is the state-relative directory the gate reports; `remediation` is
  `restore-or-delete` (the redact arm) or `delete` (every refusing arm).
- **REQUIRED wherever it appears, EMPTY when nothing was preserved** — row S2's
  positive-absence lesson, applied to an array instead of a nullable field.
- **Deleted: the standalone `refused[].artifact` and `redacted[].artifact`.**

**`location` is a field the ruling did not name, and adding it was a judgment
call worth stating.** The keep-suffix the ruling puts on the record IS a location
string (`state/quarantine/redacted/<basename>`), so making it a field means a
field that carries where the copy sits. Without it the report package would have
to hardcode the quarantine directory — restating a fact
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md` owns, which is the
cross-family duplicate this pass's stop criterion names as condition 4.

**Rejected, and recorded so it is not re-proposed: named slots keyed by shelf**
(`{withheld, redacted}`) instead of a list. It reads more explicitly and it bakes
the two-shelf layout of the durable lifecycle into this family's TYPE, which is
condition 2 of the stop criterion — re-importing a property the family was re-cut
to exclude. A list plus a reported `location` carries the same information and
owns none of it.

### THE SWEEP, SURFACE BY SURFACE

**`WP-dream-promote-module`** — `### Exact contracts`' `gates` paragraph; a new
`PreservedCopy` typedef declared once and used on both arms (writing the fields
out twice would be the two-carriers shape Q8 closes); the `@returns` shape and
its prose; Table C's header consequence (ii) and its resolved-only sentence;
Table D's EP2 row; Table Q rows Q1, Q2, Q3, Q7, Q8 and the new Q9, plus a
preamble paragraph recording the ruling; Table S row S3; three Mirrored Surface
Checklist entries (Table Q's mirror list and prohibitions, Table C's ordering
entry, Table S's entry); and four acceptance criteria — the resolved-path
refusal, the redaction-reports-its-copy criterion, the only-copy sanity refusal,
and the Q8 criterion, which gains **a fourth assertion route on the hard-withhold
arm** including the two-entry keep case and a per-arm `remediation` assertion
read off the record rather than derived from the outcome.

**`WP-dream-promote-report`** — Current state's description of the module's
return; the base-shape block, which now NAMES the module's shapes instead of
writing out their fields; the refused `report` arm, `artifact` → `preserved`;
Table N's two artifact channel rows become **three rows over the record's three
fields**, with `location` and `remediation` classified **NO** and stated rather
than omitted, because N2's fail-closed default makes an unclassified channel a
test failure; Table R's redaction-lines row and preserved-copy row, both of which
now READ each field off the entry and neither of which decides the guidance; four
Mirrored Surface Checklist entries; the preserved-copy acceptance criterion; and
the Out-of-scope bullet.

**`WP-dream-promote-in-workspace`** — the `validate.js` Deliverables cell,
Current state's geometry sentence, row G7, Table V row V3, row G7's acceptance
criterion, and a NEW Mirrored Surface Checklist entry registering the carrier
change and its five mirrors.

**No acceptance criterion was ADDED to any of the three specs** — every new
assertion extends an existing criterion. Counted after the sweep: module 23
(ceiling 28), report 10, pipeline 24, all unchanged.

### THE KEEP-SUFFIX, AND WHY "MUST SURVIVE" NEEDED ONE WORD MORE

Measured at both ends: `:1338` is `if (redactCopy) {` at indent 4 and `:1360` is
its closing brace at indent 4; the keep branch is `:1357-1359`, whose `reason +=`
at `:1358` is the only thing announcing a kept copy; `reason`'s only consumer in
the per-path loop (`:1233-1364`) is `:1361`, inside the range these rows delete.

**So `:1338-1360` survives with exactly one change, and the four surfaces now
say so identically:** the DECISION is untouched — the `Buffer.compare` guard,
which copy is deleted, which is kept, all exactly as their shipped owner decides
them — and the CARRIER moves to the record. **This is an owner-authorized change
to how a shipped `Done` package's contract item travels** (that package's own
Table Q registers the suffix as the only thing announcing that copy), so the
obligation is discharged rather than dropped, and the criterion proves RED in
both directions: against an extraction that keeps `:1358` and announces to
nobody, and against one that drops the branch without adding the entry.

The removal also gained the refusal-reason suffixes at `:1333-1337`, which fed
the same doomed consumer and were named by no surface.

### PER-FINDING DISPOSITION — ROUND 2, BOTH GATES

**Adversarial (gptsol).**

| # | Finding | Disposition |
|---|---|---|
| 1 | third carrier gap: the hard-withhold artifact cannot leave the gate | **RULED, then FIXED as a shape rather than a field.** Row Q1 carries the record on the refuse arm; row Q9 decides its fields. The finding's own recommendation — "define ONE EP2 disposition shape... including hard withhold... then propagate through Q1, `refused[]`, report composition, neutralisation classification, and acceptance tests" — is what the sweep above did, in that order |
| 1 (sub) | "decide whether the payload must also distinguish artifact provenance/remediation — because Table R assigns DELETE while the shipped banner offers RESTORE" | **YES to the field, NO to the premise.** Remediation is a typed per-arm value (Q9). **The conflict the gate reported does not exist:** the two surfaces describe different arms and each is correct about its own, measured at `validate.js:1398-1409` and at Table R's refused-arm row. The framing is recorded here and is deliberately absent from every spec |
| 2 | colliding H rows still cited without their owner | **FIXED.** Counted: fourteen citation edits, of which twelve were genuinely unqualified — five in the module, seven in the report, the spec that ADDED the rule and was never swept — and two already named the primitive and were reworded to the same form. |
| 2 (sub) | "add a mechanical absence check for bare row ids so the rule is ENFORCEABLE rather than advisory" | **DECLINED, on the stop criterion pinned before round 1, condition 3:** a grep over spec text for bare row ids grows the verification surface to hold a finding about the verification surface. Named residual: the row-id rule stays advisory, enforced by the sweep discipline and the Mirrored Surface Checklists, not by a check |

**Internal coherence.**

| # | Finding | Disposition |
|---|---|---|
| C-1 | the must-survive block's only output channel is deleted by the rows that mandate its survival | **FIXED under the ruling, as a carrier change rather than a narrowed removal.** See above. The reviewer's own two options were "either the removal narrows, or a replacement carrier is assigned"; the ruling assigns the carrier, and its objection that it "CANNOT be `refused[].artifact`" is correct and moot — that field no longer exists |
| C-2 | the preserved-copy line is scoped to a branch that excludes the common case | **FIXED — and it is NOT in the ruling's list, which named only C-1 and the LIGHT findings.** Fixed anyway, because it is a product defect in exactly the surface the ruling ordered swept ("Table R's rows"), and because leaving it would leave the ORDINARY case — a refused path with a preserved copy on a run where the report publishes normally — with no surface saying who writes the line. The `refused[]` lines now follow Table N row N3's scope (the normal second write and the fallback alike); only the report arm's own line is fallback-scoped, which it is by construction. The acceptance criterion asserts the normal branch and goes RED on a fallback-only composer. **Flagged to the owner rather than absorbed silently** |
| H-1 | the row-id rule swept into one spec and not the sibling | **FIXED**, same sweep as adversarial finding 2 |
| H-2 | Table C's header names Q8 the owner and restates the owned fact | **FIXED.** The header now states the ORDERING consequence and defers the form of the refusal to Q8, with the correction dated in place |
| H-3 | the header imports the clause the same revision identified as the contradiction's source | **FIXED, and by restating the logic rather than deleting the "So".** The paragraph now opens with the rule that actually carries the conclusion — C9 is ONE predicate applied TWICE, the primitive's application is definitive, the candidate application may only REFUSE — which is why the candidate-decidable half is orderable ahead of the gates |
| H-4 | the report's `### Exact contracts` restates the module's shape and names its own defect | **FIXED by stopping, not by re-syncing.** The block names the module's four returned shapes and its `PreservedCopy` typedef and writes out none of their fields. The same list had gone stale once already (round-zero C2); a block that names its own defect and keeps it had now proved the point twice |
| H-5 | the map puts a 9-item and a 5-item letter list two lines apart | **FIXED by labelling both counts.** Nine is that spec's tables, five is the collisions, and the page says which is which |
| H-6 | the module's letter-space warning names a collision three lines before saying it names none | **FIXED.** The Table N example is deleted; the map states the collisions |
| H-7 | three byte-identical blocks, registered by no MSC, carrying a claim false in one | **FIXED by making them NOT mirrors.** Each spec's `### Contract table(s)` now states its OWN tables, so there is no shared text to go stale, and the false claim dies with it: the report spec says its report row is deliberately unlettered, which is what the map already records. Registered on each spec's existing map-citation checklist entry rather than in a new one |
| H-8 | an MSC entry names two acceptance criteria where the spec has one | **FIXED, and the miscount is named in place.** One criterion here; the redaction-lines row's assertion is the module half's, and the entry now says so |
| H-9 | the Table Q owner's mirror list omits two mirrors this revision created | **FIXED.** Table Q's mirror list now names the report spec's Table N channel rows, its criterion asserting Q3 and Q8, the pipeline's rows G7 and V3 and row G7's criterion |
| N-1 | "immediately BELOW it" where five lines intervene | **FIXED at both sites**, and the geometry is now stated as an ordered five-part list with the intervening suffixes named |
| N-2 | the blocks write `N/A as a single heading` where the runbook prescribes `N/A — <one-line reason>` | **FIXED in all three, in the prescribed literal**, in the same edit as H-7 |
| N-3 | ragged mid-sentence break left by a range edit | **FIXED** |
| N-4 | "one case per row C1-C8" under-specified now that C1 has two halves | **FIXED.** The criterion says which half it covers and points at the resolved-only half's own criterion |
| P-1 | a cell moved whole by the T1 cut still says "the table above" | **FIXED.** It names `WP-dream-promote-module`'s Table D, and says why the old wording resolved to the Deliverables table here |
| P-2 | a pointer whose target is a pointer | **FIXED.** Row S5 names `WP-dream-promote-report`'s report row and Table R directly, not this spec's two placeholders for them |
| P-3 | dropped sentence boundary | **FIXED** |
| P-4 | two endpoints one line short of their construct | **FIXED at all three sites** (`:1450-1458` twice-cited as `:1450-1457`, and `:1374-1409` cited as `:1374-1408` in two specs), each re-verified by indentation. **The same class was then found in the ruling's own citation and corrected** — see sub-question (a) |

**Round-2 findings NOT re-dispositioned here:** the adversarial round's
confirmation that round 1's C1 ordering finding is fixed stands unchanged, and
the coherence pass's four no-finding categories were not re-run.

### STOP-CRITERION COMPLIANCE, CHECKED CONDITION BY CONDITION

1. *A third round landing again on the EP2-result family.* **This is the
   escalation's own resolution, not a new round.** The shape is the owner's act.
2. *A fix that re-imports an excluded property.* **Checked and refused once** —
   named slots keyed by shelf, rejected above. `location` was checked against the
   same condition and passes: it CARRIES what the owning package produces and
   restates none of its rules, which is what the ruling required of every field.
3. *Growing the verification surface to hold a finding about it.* **Refused
   once** — the mechanical bare-row-id check. No criterion was added anywhere.
4. *A second cross-family duplicate.* **None found; one was PREVENTED.** Without
   `location`, the report package would have had to hardcode the quarantine
   directory, which is a duplicate of the `Done` package's layout fact.

### WHAT I WOULD FLAG ABOUT MY OWN PASS

- **C-2 was missing from the ruling's finding list and is a contract defect, not
  a LIGHT one.** I fixed it and said so rather than deferring it to a round that
  might not come; if the omission was deliberate, this is the surface to reverse
  it on.
- **`location` is mine, not the ruling's.** The ruling named three facts and I
  shipped four fields. The argument is above; if it is wrong, the smaller shape
  is `{artifact, remediation}` and the cost is a hardcoded directory in the
  report composer.
- **The withheld shelf's shipped digest banner still offers RESTORE for a copy
  this record marks `delete`.** Named as a residual on row Q9 rather than fixed:
  `src/core/digest.js` is in no Deliverables table in this family.

## STOP CRITERION, RE-STATED before round 3

**Re-stated because a HEAVY fix landed**, as the runbook requires — the owner's
ruled EP2 disposition shape changed what an implementer builds, so the round-1
criterion no longer describes the situation. Two of its four escalation
conditions were written against a defect class the ruling has now closed by
design, and leaving them standing would let a finding about the NEW shape read
as evidence against a shape that was never tried.

**Owner ratifications carried into this round** (both settled, neither reopenable
by a finding — a reviewer disagreeing files a scope objection):

- the record is `{artifact, location, remediation}`; `location` is ratified, and
  the rejected alternative (per-shelf named slots) stays rejected because it
  bakes the durable two-shelf layout into this family's type;
- round-2 coherence C-2's fix stands — its omission from the ruling's LIGHT list
  was not deliberate;
- remediation is arm-dependent and the two shipped surfaces do NOT conflict;
  a finding re-raising that conflict is a category error, measured twice.

**What closes the loop.** A round that finds nothing about the PRODUCT. Findings
about the specs' own verification machinery are fixed inside the existing surface
or accepted as named residuals; they do not extend the loop.

**What escalates instead of iterating.**

1. **A carrier gap that the ruled shape CANNOT express.** This replaces the old
   condition 1, which counted occurrences. Counting is now the wrong test: the
   shape exists precisely so a new preserved-copy fact becomes a FIELD rather
   than a fifth carrier, so another missing-carrier finding is ordinary work —
   add the field, sweep once. What escalates is a fact that has nowhere to go
   ON the record: a per-arm value the record cannot hold, or a consumer that
   must re-derive rather than read. That would mean the shape is wrong, not
   incomplete, and it is the owner's.
2. **Any finding whose honest fix RE-IMPORTS a property this family was re-cut
   to exclude** — the report, the commit, the pipeline, or the vault-write
   primitive's filesystem discipline. Unchanged.
3. **Any finding that requires GROWING the verification surface to hold a
   finding about the verification surface.** Unchanged, and it has already bitten
   once this arc: the mechanical bare-row-id check was declined under it, and the
   advisory-rule residual was named instead.
4. **A cross-family duplicate** — a surface restating a contract an owning
   package forbids restating. Unchanged. `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`
   is the package this family keeps copying from; the `location` field exists
   partly so the report composer does not hardcode what that package owns.

**Weighted closure, unchanged:** HEAVY lands its fix and takes a fresh full
round; LIGHT is verified mechanically and does not extend the loop.

**One measurement to carry into the round, so it is not re-derived:** the
acceptance-criteria counts are 23 / 10 / 24 (module / report / pipeline),
unchanged across the shape implementation. A round-3 fix that moves them is
growing the surface and owes an explicit justification.

---

## ROUND 3 — the shape's first round, its escalation, the owner's ruling, and the sweep

**Both raw outputs committed before adjudication, per `docs/runbooks/codex-review.md`.**

| Round | Gate | Raw output | Commit that introduced it |
|---|---|---|---|
| **3** | adversarial DESIGN review (`docs/runbooks/review-prompts/adversarial.md`), backend gptsol (codex/gpt-5.6-sol via llmp) | `docs/specs/logbook/2026-08-29-promote-family-design-round-3-gptsol-raw.txt` | `474110a172c3e1b724f676185b6ae6d8104adbf2` |
| **3** | internal coherence, fresh general-purpose executor with no part in drafting, relaying or reviewing | `docs/specs/logbook/2026-08-29-promote-family-design-round-3-coherence-raw.txt` | `dd958b370865afe0613bed7aa3a36e24c17d984a` |

Both read tip `1757e8e`. The coherence pass recorded that HEAD moved to `474110a`
mid-pass and verified `git diff --quiet 1757e8e..HEAD` over all five analysed
files, so every finding holds at both tips.

### THE OWNER'S RULING ON THE ESCALATION

The adversarial round escalated under the re-stated criterion's condition 1 —
*a fact that has nowhere to go ON the record, or a consumer that must re-derive
rather than read.* Its claim: `remediation` cannot be gate-reported, because EP2
runs before the merge and the outcome that decides the value is not known yet,
so promotion must either overwrite the gate's value or ship wrong recovery
guidance. **The ruling, reproduced because the sweep is only checkable against
it:**

> `artifact` and `location` are **gate-reported**; `remediation` is assigned
> **at outcome time**, and its named owner is **the MODULE**. Q2's "every field"
> claim narrows accordingly.
>
> **One addition: the shape's contract states provenance PER FIELD — who fills
> it, and when — so that shared filling does not become the next ambiguity.**

**The addition is the ruling, and the sweep treated it as such.** The defect
round 3 found was not a wrong field. It was an IMPLICIT provenance claim — "every
field of a record entry is reported by the gate" — that turned out false for one
of three fields. A record filled by two parties at two times, with only a
sentence about the record as a whole, reproduces that defect on the next field
anyone adds. **So provenance is now a stated property of EACH FIELD, in three
places that cannot drift apart:**

1. **Row Q9 states it per field**, each field's statement opening with
   `— FILLED BY <party>, AT <time>` and the row's own header saying that a field
   added without both is incomplete.
2. **The TYPE carries the same split.** `### Exact contracts` declares
   `GateReportedCopy` (`{artifact, location}` — what the gate returns) and
   `PreservedCopy` (`GateReportedCopy & {remediation}` — what `promote()`
   returns). A field sits in the base when the gate fills it and in the
   extension when the module does, so no field's filler is left to prose.
3. **The Mirrored Surface Checklist forbids** adding a field to Q9 without
   stating who fills it and when, and forbids any surface claiming a provenance
   for the record AS A WHOLE.

**What the ruling does NOT change, stated because a careless wording inverts
it:** `remediation` is still a READ for every downstream surface. Rows Q7 and Q9
say why in as many words — **the module is where that fact FIRST EXISTS, not a
consumer re-deriving a value the gate already returned, because the gate returns
none.** Q9's no-re-derivation rule binds the surfaces DOWNSTREAM of `promote()`'s
return, and what it forbids them is a SECOND, independent statement of a fact the
record already carries. Assigning it once, in one place, at the only moment its
value is knowable, is exactly what makes every other surface a reader.

**Row Q9's own `WHY THE GATE CANNOT FILL IT` paragraph carries the reviewer's
argument**, so the reasoning is in the contract rather than only in this record:
a gate-filled value would be a guess that is wrong on exactly the
redact-then-refuse route, and telling a user to `restore` content the vault
never took is worse guidance than none.

### PER-FINDING DISPOSITION — ROUND 3, BOTH GATES

**Adversarial (gptsol) — one finding, the escalation.**

| # | Finding | Disposition |
|---|---|---|
| 1 | the gate cannot report final `remediation` before promotion determines the outcome | **ESCALATED, RULED, IMPLEMENTED — and the reviewer's recommendation was taken in substance, not in form.** It asked for "a two-phase typed contract... distinguish gate-known preservation identity (`artifact`, `location`) from the FINALIZATION step that assigns `remediation`... define exactly one owner for that transition". That is what the `GateReportedCopy` → `PreservedCopy` split plus row Q9's per-field provenance is, with the module named as the one owner and outcome time named as the one moment. **What was NOT taken: its "do not claim that the pre-merge gate reported `remediation`" framed as a reason to move the gate.** The gate stays pre-merge and brain-scoped by standing owner ruling; the claim is dropped instead. **And the ruling's own addition went further than the finding:** the finding named one field, the ruling made provenance a per-FIELD property of the shape, because the next field would otherwise repeat the defect |

**Internal coherence — eleven findings, batched deliberately.**

| # | Finding | Disposition |
|---|---|---|
| F1 | the report union's PUBLISHED arms carry no `preserved`, though EP2 can redact the body and publish it sanitized | **FIXED as ordinary work under the re-stated criterion — the fact has somewhere to go ON the record — and the root cause was one surface deeper than the finding.** Row Q8 quantified over "any arm that can carry a REFUSAL reached after EP2 ran", which never described this family's own redact arm: it PUBLISHES. Q8 now quantifies over **any arm that can exist after EP2 preserved something for that path, refusing and publishing alike**, and `preserved` is on ALL THREE arms of the report union — the union discriminates on OUTCOME, and preservation is orthogonal to outcome. Swept: Q8, Table S row S3, the module's Table Q MSC entry, the report's `### Exact contracts`, Table N's channel enumeration (`:270`), Table R's preserved-copy row (source scope, composition scope and the render-exactly-once partition, which is now over WHERE THE ENTRY SITS rather than over the outcome), Table R's redaction-lines row, the announcement criterion and two report MSC entries. **One thing the row now states that it could not before:** the report arm's line names the path and the entry's fields and nothing else, because the union carries no scrubbed-line count or labels for the body |
| F2 | the two-entry keep case is attributed to an arm the shipped gate cannot reach | **FIXED at both wrong surfaces, and the measurement is the owner's, re-verified here.** `validate.js:1269` (`if (!hasHardFinding(findings)) {`) gates the ENTIRE redact arm and `redactCopy` is assigned at `:1276` inside it, so a hard finding leaves `redactCopy` null, `:1338 if (redactCopy)` never fires, and **a hard secret yields exactly one entry, always.** The two-entry case is the redact arm's FALL-THROUGH (`:1293` → `:1297` → `:1338-1360`). Both criteria now assert the WITHHOLD arm on **both routes** and say which one can produce two entries; each is additionally proven RED against a fixture that builds the two-entry case on the hard-secret route, since only a fake gate can. `in-workspace.md`'s G7 criterion and row Q9 described it correctly and are unchanged |
| F3 | entry order in that same case contradicts row Q9 | **FIXED in the same sentences as F2.** Measured write order: redact-shelf copy `:1276`, withheld copy `:1297` — the REDACT copy is FIRST. Row Q9 fixes entries "in the order the gate wrote them"; both surfaces called the redact-arm copy the SECOND entry. They now name the redact-shelf copy first and cite Q9 for the rule |
| F4 | the pipeline's Out-of-scope bullet contradicts the ruling it landed, and is a sixth carrying surface absent from the new MSC entry's five | **FIXED, both halves.** The bullet said row G7's criterion asserts the durable behaviours SURVIVE the extraction and that it "may not change what they do" — contradicted by G7, V3, the MSC entry and the G7 criterion, all rewritten in the previous window to land the carrier change. It now says the criterion asserts the extraction preserves their DECISIONS, and names the one owner-authorized exception. **And it is registered as the sixth mirror** in the carrier-change MSC entry that listed five |
| F5 | the module's Out-of-scope bullet carries the pre-ruling premise the pipeline narrowed | **FIXED to the pipeline's own wording** — "preserves their DECISIONS", with the one owner-authorized carrier change named and the decision itself stated as untouched |
| F6 | a range one line short of its construct, live in two contract surfaces while two siblings carry the corrected value | **FIXED at both, re-measured at both ends.** `:1398` is `if (secretRedacted.length > 0) {` at indent 2 and `:1409` is its closing brace at indent 2; `:1410` is blank and `:1411` opens Step 5, so Step 4 runs `:1374-1409`. All four live spec sites now read `:1374-1409` (`module:447`→`:463`, `report:224`→`:235`, `report:99`, `in-workspace:343`, at this commit's tip). **`report:224` had been rewritten in the previous window — the P-1 "the table above" fix — and kept the stale range, which is the whole lesson: a cell being edited for one reason is where a stale citation survives a sweep** |
| F7 | remediation guidance restated in the surface that says it does not decide it | **FIXED at the two restating surfaces; the OWNER is left alone.** `report.md`'s preserved-copy row restated the values and their provenance rationale — re-creating, in the one cell that says the guidance is not decided there, the second independent statement the field exists to remove. It now reads the field and points at row Q9 for everything else. Table S row **S3** stopped enumerating Q9's three fields and states the property it actually owns (no field of an entry is content). **Row Q9 itself is the decider and keeps its statement**, which the finding lists as "same class" but which is the canonical surface |
| F8 | the report's Table N mirror list names one surface twice | **FIXED.** The redaction-lines row appeared twice with different parenthetical scopes; merged into one member, and the miscount is named in place |
| F9 | record vs entry | **FIXED.** `preserved` is an array; the record has no fields, its ENTRIES do. Table R's redaction-lines row now says each ENTRY of that path's record is read field by field, and says that how many entries an arm holds is row Q9's |
| F10 | the Deliverables cell reintroduces the containment framing its three siblings were swept out of | **FIXED.** "sits inside that span's middle" → the measured geometry the three siblings carry: between the refusal-reason suffixes (`:1333-1337`) and the `reverted[]` accounting (`:1361-1363`), inside the same per-path loop (`:1233-1364`) |
| F11 | a criterion in a package that composes no report asserts a report line | **FIXED by moving the ASSERTION to where the line is composed, not by adding one.** The module's criterion now asserts `promote()`'s returned `redacted[]` entry — the collision fixture and the un-hardcoded `location` assert the same two properties on the RECORD instead of on a line — and it gains a third RED, against a return whose entries reach the caller without `remediation`. The report's announcement criterion absorbs the redaction lines, and its MSC entry no longer delegates their assertion to a package whose Deliverables compose no report. **No criterion was added anywhere: 23 / 10 / 24 after the sweep, counted** |

### THE CORRECTED P-4 ENTRY — a disposition that claimed a fix that was not there

**The round-2 disposition for P-4 above reads "FIXED at all three sites
(`:1450-1458` twice-cited as `:1450-1457`, and `:1374-1409` cited as
`:1374-1408` in two specs), each re-verified by indentation."** Measured against
the tree at `1757e8e`, **that second half was false.** What actually happened:

- `:1450-1458` — **genuinely fixed**, and re-verified again here (`:1450` is
  `return {` and `:1458` its `};`).
- `:1374-1408` → `:1374-1409` — **fixed at TWO of the four sites that carried
  it**, `report:99` and `in-workspace:343`. `module:447` and `report:224` were
  left at `:1374-1408` and stayed there through the round. The claim "at all
  three sites" also miscounted the sites: this citation lives at four.
- **`report:224` was itself rewritten in the same window** for round-2's P-1 and
  kept the stale range — the diff added a line to that cell and did not touch
  the citation two words away.

**Corrected here rather than in place**, because a dated execution record is not
a living surface and the correction belongs where it can be read against the
finding. **A disposition record that claims a fix which is not in the tree is
worse than one that admits a miss:** it is the surface a later round trusts
instead of measuring, and it converts a one-line stale citation into a reason not
to look. The lesson is narrower than "sweep harder": **every site of a changed
citation must be enumerated BEFORE the sweep and counted after it** — the same
derive-the-complete-set-first discipline this record already credits for round
zero's H4, applied to citations rather than to claims.

### STOP-CRITERION COMPLIANCE, CHECKED CONDITION BY CONDITION

1. *A carrier gap the ruled shape CANNOT express.* **Fired once, on the
   adversarial finding, and it was the correct call:** `remediation`'s producer
   was not a missing field but a wrong claim about who produces the fields the
   shape already had. It went to the owner and came back as a ruling. **F1 did
   NOT fire it** — the fact had somewhere to go on the record, which is
   precisely the test the re-stated condition installed to replace occurrence
   counting, and the fix was one field on two arms plus a sweep.
2. *A fix that re-imports an excluded property.* **None.** The typedef split
   adds no filesystem discipline, no report rule and no lifecycle fact; it
   states which party fills a field the record already carried.
3. *Growing the verification surface to hold a finding about the verification
   surface.* **None. No acceptance criterion was added, moved between packages
   as a new one, or deleted: 23 / 10 / 24, counted after the sweep.** F11 is the
   one that looks like it should have grown the surface and did not — the
   assertion moved into an existing criterion in the package that composes the
   line, and the module's criterion was restated rather than dropped.
4. *A cross-family duplicate.* **None.** The provenance statement names the
   parties in THIS family; the durable lifecycle stays cited by spec path.

### WEIGHTED CLOSURE — WHERE THIS LEAVES THE LOOP

**The loop is NOT closed, and the reason is the ruling itself.** The
adversarial finding was HEAVY by any reading — it changed what an implementer
builds, adding a type and an assignment step — and F1 and F2 are heavy too: F1
adds a field to two arms, F2 corrects a fixture two criteria mandate. **Under
the pinned rule a HEAVY fix lands and then takes a fresh full round**, so a
round 4 is owed before `Ready`.

**One measurement to carry into it, so it is not re-derived:** the counts are
still **23 / 10 / 24**, unchanged across the shape implementation, the round-2
sweep and this one.

### WHAT I WOULD FLAG ABOUT MY OWN PASS

- **The `GateReportedCopy` typedef is mine, not the ruling's.** The ruling
  required the contract to state provenance per field; a prose statement in row
  Q9 would have satisfied it literally. I added the type split as well, because
  a rule that only prose carries is the shape this family has now watched drift
  four times. **If it is one surface too many, the smaller form is row Q9's
  per-field statement alone, and the cost is that an implementer can write a
  gate fake that returns `remediation` without the type objecting.**
- **F7 lists row Q9 itself as "same class", and I did not treat it as a
  finding.** Q9 is the decider; a decider stating what it decides is not a
  restatement. If that reading is wrong, the surface to reverse it on is this
  bullet.
- **F1's fix widened row Q8's quantifier, which is a bigger change than the
  finding asked for.** The finding asked for a field on two arms. I changed the
  rule those arms are covered by, because the narrow rule was also wrong about
  `redacted[]` — a published arm that has carried the record since the shape
  ruling. **That is a second defect the round did not report**, and it is fixed
  here rather than deferred.
- **The report body's redaction has no line count or labels anywhere**, because
  the `report` union carries neither. The preserved-copy row now says the line
  names the path and the entry's fields only. **Named rather than fixed:** adding
  `lines`/`labels` to the published arms is a contract change the round did not
  ask for and the ruling did not cover.

---

## THE DISCLOSURE-PARITY RULING — round 3's named residual, crossed by the owner

**This is not a round.** Round 3 closed with a residual I named and did not fix:
*"The report body's redaction has no line count or labels anywhere... adding
`lines`/`labels` to the published arms is a contract change the round did not ask
for and the ruling did not cover."* I stopped at the contract boundary, correctly.
**The owner then crossed it, and the ruling is reproduced because the sweep below
is only checkable against it:**

> **(1) The report's published arms get the redaction facts.** The report body is
> an ordinary candidate; **parity of disclosure is owed to it.** The fact travels
> as a **field of the disposition shape**, in one sweep.
>
> **(2) The `GateReportedCopy` / `PreservedCopy` typedef split is RATIFIED** —
> per-field provenance lives in the type, not only in prose.

**The stop criterion re-stated before round 3 was reviewed against this ruling by
the owner and STANDS UNCHANGED.** Its condition 1 already says that a new
preserved-copy fact becoming a FIELD is ordinary work rather than an escalation,
which is exactly what this is. Recorded here so the review is on the record and
the criterion is not re-derived.

### WHAT THE RULING SETTLED, AND THE ONE THING IT LEFT TO MEASUREMENT

Settled: the gap closes, and it closes as **a field of the disposition shape** —
not two loose fields on the report union, not a second carrier beside row Q9's
record. Left open: **WHERE** the scrubbed-line count and the detector labels sit,
under three constraints — an ordinary note's redaction line and the report body's
must be composed from the SAME shape, nothing may re-derive either value, and the
ratified per-field provenance rule applies to whatever is added.

**The asymmetry the ruling flagged is real and the measurement resolves it
against the record.** `lines` and `labels` are per-PATH; row Q9's record is
per-COPY. Two measurements decide it, both taken from the shipped gate rather
than from the shape's symmetry:

1. **The case with the MOST preserved copies has NO accounting at all.** When the
   redact arm falls through to the withhold, the gate has written a redact-shelf
   copy (`validate.js:1276`) and then a withheld one (`:1297`) and pushed no
   accounting — the push happens only on the branch where the scrub is verified
   and staged (`:1283-1292`, verified at both ends: `:1283` is the `else if` head
   at indent 8, `:1292` its close at indent 8). **A field on the record would be
   null on BOTH entries of the two-entry case.**
2. **On the ordinary redact arm one accounting would have to be duplicated onto
   every entry of that path's record** — the two-carriers-for-one-fact shape row
   Q8 exists to close.

**So the honest answer is the one the ruling's own escape clause anticipated: they
are per-path and NOT per-copy.** The report arm gets the same per-path carrier an
ordinary note has, and the record is left alone. **One scrub, one path, one
accounting: row Q9 answers WHICH COPIES the gate wrote, row Q10 answers WHAT THE
SCRUB DID.**

### WHERE THE FACTS NOW LIVE, AND THE PROVENANCE ASSIGNED TO EACH

**A new typedef `RedactionAccounting` (`{lines, labels}`), declared ONCE in
`WP-dream-promote-module`'s `### Exact contracts` and carried as ONE field named
`redaction`.** One field rather than two, per the ruling's own prohibition: the
two values are present together or not at all, and two loose nullable fields make
that an invariant the TYPE cannot express — row S2's failure mode, one field over.
A shape declared once is also what makes the two redaction lines composable from
the same shape, which is constraint (a).

**New Table Q row Q10 owns it, and states provenance PER FIELD**, opening each
field with the same `— FILLED BY <party>, AT <time>` form row Q9 uses:

| Field | Provenance | Evidence |
|---|---|---|
| `lines` | **FILLED BY THE EP2 GATE, AT GATE TIME** | `validate.js:1286` — `addedLineNumbers.length`, pushed only on `:1283-1292` |
| `labels` | **FILLED BY THE EP2 GATE, AT GATE TIME** | `validate.js:1267` and `:1287` — code-owned label names, never the matched bytes |

**Both are gate-filled, so there is NO base/extension split for this shape — and
row Q10 says so rather than leaving it to symmetry.** The
`GateReportedCopy`/`PreservedCopy` split exists because that record has TWO
fillers; this one has one. **Leaving that unstated would have invited exactly the
symmetry-driven finding the ratified split was meant to prevent** — a reviewer
asking where `GateReportedRedaction` is. The module passes the object through and
completes nothing on it, which is why row Q7's list of what this module does is
unchanged.

**Carriers, and the nullability per carrier:** REQUIRED and NON-NULL on the
gate's redact arm and on every `redacted[]` entry (membership of either IS the
redaction); REQUIRED and NULLABLE on the `report` union's **`promoted` arm
alone**, `null` stating positively that the gate did not redact the body.

### THE ONE PLACE I NARROWED THE RULING'S LITERAL WORDING, AND THE ARGUMENT

The ruling says **"the report's published arms"** — plural, and in this union's
own vocabulary that is `promoted` AND `fallback`. **I put the field on `promoted`
alone, and the reason is parity itself.** Measured against Table R: `fallback`
means the brain's body was **NOT** published and the code section was published in
its place; `refused` means nothing was written at all. On both, a scrubbed-line
count would describe bytes no vault holds — **and that is precisely what an
ordinary note redacted and then refused reports, namely nothing:** it lands in
`refused[]`, which has no accounting field. **Putting the field on both published
arms would have handed the report body a disclosure its ordinary-note analogue is
not given, in the very pass that exists to make the two equal.**

**The arm is doing contract work, which is the second reason.** A field that only
the `promoted` arm can carry makes "an accounting exists only where the sanitized
candidate published" a rule the TYPE enforces rather than one prose asserts —
row S2's standing lesson in this family: *a rule the type cannot express is a rule
an implementation can satisfy and still break.*

**This is the deviation to reverse if it is wrong**, and the smaller change is to
add `redaction` to the `fallback` arm as well; the cost is a redaction line for a
body whose sanitized bytes are in no vault, and an asymmetry against `refused[]`.

**NAMED RESIDUAL, argued rather than slipped:** on a redact-then-refuse — an
ordinary note's or the body's — the count and the labels are lost, so the user
learns WHICH file holds the unredacted copy (row Q9's record travels on every
refusing arm) but not WHAT KIND of secret the detectors matched. **That loss is
PRE-EXISTING and this ruling did not reach it.** Closing it later is one field on
`refused[]` and on the report's refusing arms plus one sweep — ordinary work under
the standing criterion's condition 1, not an escalation. It is recorded on row Q10
so it is found rather than rediscovered.

### THE SWEEP, SURFACE BY SURFACE

**`WP-dream-promote-module`** — the `RedactionAccounting` typedef (new, in
`### Exact contracts`); the `gates` paragraph; the `@returns` shape for
`redacted[]` and its prose; Table Q's preamble (a paragraph recording the ruling
and the measurement that moved the field off the record); rows **Q1** (the redact
arm's shape, and it stops defining `lines`/`labels` inline) and **Q3** (cites
Q10); the new row **Q10**; the Table Q Mirrored Surface Checklist entry — mirrors
plus **three new prohibitions**: no loose fields and no field-of-an-entry and no
re-derivation, no field added to Q10 without its filler and moment, and no
widening of Q10's carriers without the measurement; and the redaction acceptance
criterion.

**`WP-dream-promote-report`** — Current state; the base-shape naming block (**five
named shapes to six** — `RedactionAccounting` joins `PreservedCopy`); the `report`
union, whose combined `'promoted'|'fallback'` arm splits into two so the field can
sit on one, plus its prose; Table N's preamble field names and its **two channel
rows for `redaction.labels` and `redaction.lines`, requantified over both
carriers**; Table R's **redaction-lines row** (two sources, one shape) and its
**preserved-copy row**, whose PARTITION is re-cut from *"where the entry sits"* to
*"whether that path has a redaction accounting"* — the old form sent the
`promoted` arm's copies to the wrong row — and whose *"the union carries no
scrubbed-line count and no labels"* sentence is now false and is replaced by the
partition's consequence; **three** Mirrored Surface Checklist entries; the
announcement criterion; and the Out-of-scope bullet.

**`WP-dream-promote-in-workspace`** — **checked and unchanged, deliberately.**
`grep -n "redacted\[\]\.lines\|redacted\[\]\.labels\|scrubbed-line count\|detector
labels"` over all three specs returns one pipeline hit, row **V3**, whose
"the per-redaction report line carrying path, scrubbed-line count, labels and
artifact name" is an inventory of the SHIPPED behaviour the extraction must
preserve — still true, and not a statement of this contract.

**Two surfaces checked against the new field and deliberately NOT edited**, so the
next round does not re-derive the check: **row S4** ("every fact a consumer
DERIVES about a published path is derived from these bytes") is not contradicted —
the accounting is not derived at all, it is reported and read, and Q10's
no-re-derivation rule is strictly stronger than S4's no-fresh-read rule; **row
S3**'s "no field of an ENTRY is content" is about preservation-record entries, and
the accounting is not an entry. Table N classifies both of its fields.

### COUNTS, EACH ONE COUNTED

- **Acceptance criteria: 23 / 10 / 24 (module / report / pipeline), UNCHANGED**,
  counted with `awk` over each spec's `## Acceptance criteria` span after the
  sweep. **No criterion was added.** The announcement criterion gained the second
  source and two REDs; the module's redaction criterion gained a field name and a
  citation. **The count did not move, so no justification is owed** — the standing
  measurement survives a fourth window.
- **New tables: none. New rows: one** (Q10) — the same cost the shape ruling paid
  for Q9, and the surface accounting frozen in this record stays frozen.
- **New citations: six, all in row Q10** (`validate.js:1267`, `:1276`, `:1283-1292`,
  `:1286`, `:1287`, `:1297`), **enumerated before the sweep and counted after it**:
  each appears exactly once across the three specs, verified by grep. **`:1283-1292`
  was verified at BOTH ends by indentation** — the narrower lesson the corrected
  P-4 entry above records, applied to the citations this pass created rather than
  only to the ones it moved.
- `npm run lint` passes: markdownlint 0 errors over 556 files, frontmatter check
  232 specs.

### STOP-CRITERION COMPLIANCE, CHECKED CONDITION BY CONDITION

1. *A carrier gap the ruled shape CANNOT express.* **Did not fire, and the owner
   said so before the work started.** The fact had somewhere to go — it became a
   field, in one sweep. **What it did NOT become is a field of row Q9's record,
   and that is a measurement rather than a preference:** the largest-record case
   has no accounting at all.
2. *A fix that re-imports an excluded property.* **None.** `RedactionAccounting`
   adds no filesystem discipline, no lifecycle fact and no report rule; it names
   two values the shipped gate already produces.
3. *Growing the verification surface to hold a finding about it.* **None. No
   criterion added, none moved between packages, none deleted.**
4. *A cross-family duplicate.* **None.** Both fields are this family's gate
   result, not the `Done` package's durable lifecycle.

### DIVERGENCE THIS PASS ADDS AGAINST PR #31, incremental to the list already handed over

**One item, and it is additive rather than a correction.** The shipped gate
already computes both values and already composes the shipped redaction line from
them (`validate.js:1284-1289` and `:1392-1409`). What diverges is the SHAPE they
travel in and the second source that now composes the same line: `lines` and
`labels` become one `redaction` field on the redact arm and on `redacted[]`
entries, and `WP-dream-promote-report`'s `promoted` arm carries the same field.
**Nothing about the shipped gate's behaviour changes** — no new value is computed
and none is dropped. Whoever folds PR #31 back reads this as a field-grouping
change on the module half plus one new carrier on the report half.

### WHAT I WOULD FLAG ABOUT MY OWN PASS

- **The narrowing to the `promoted` arm is the one place I did not implement the
  ruling as literally stated**, and it is argued above rather than absorbed. If
  the owner meant both published arms, the reversal is one field on `fallback`
  and one sentence in row Q10.
- **Splitting the union's `'promoted'|'fallback'` arm in two is a shape change the
  ruling did not ask for**, and it is what makes the narrowing type-enforced
  rather than prose-enforced. Row S2's "a rule the type cannot express" lesson is
  the whole argument; if it is one surface too many, the smaller form keeps the
  combined arm and states the scope in prose, and the cost is an implementation
  that can put an accounting on `fallback` without the type objecting.
- **Table R's partition changed meaning, and that is the surface most likely to
  be missed by a reader who knows the old form.** It is now over whether the path
  has an accounting, not over where the entry sits. Both rows state it, the
  Mirrored Surface Checklist registers it as a mirror in its own right, and the
  announcement criterion goes RED on a composer that renders both lines for the
  same copy — because the honest failure mode of a re-cut partition is
  double-announcement, not silence.

---

## ROUND 4 — the union's escalation, the owner's two rulings, and the sweep

**The gates, their raw output and the commit each was committed in — both
committed BEFORE adjudication, per `docs/runbooks/codex-review.md`:**

| Gate | Raw output | Commit | Analysed at |
|---|---|---|---|
| Adversarial DESIGN review (gptsol, codex/gpt-5.6-sol via llmp) | `docs/specs/logbook/2026-08-29-promote-family-design-round-4-gptsol-raw.txt` | `3c0bd19` | `36cfc23` |
| INTERNAL COHERENCE pass (fresh general-purpose executor) | `docs/specs/logbook/2026-08-29-promote-family-design-round-4-coherence-raw.txt` | `81457b2` | `36cfc23` |

Both passes confirm the mechanical baseline: acceptance criteria **23 / 10 / 24**,
unchanged; whole-file checkbox counts unchanged; every citation introduced or
changed since `1757e8e` correct at BOTH endpoints. Round 3's
remediation-provenance finding is CONFIRMED FIXED. The adversarial pass raised
**A1 as an OWNER ESCALATION** under this record's own stop criterion, condition 1,
and **B1** as a contract defect; the coherence pass raised **F-1 … F-8** plus two
observations.

### THE OWNER'S RULINGS

**A1 — ESCALATION ACCEPTED, and the ruling separates form from property.**

> The FORM is yours. The PROPERTY is ruled: **no real outcome is silent**, and
> the failed second write's accounting **goes to the run's log per the standing
> R6-2 rule**.

**B1 — SPLIT IN TWO.**

> The spec states the SHIPPED TRUTH NOW — it counts **added lines**, and **the
> gap is named in place**. The counting change is **routed to the pipeline
> package as a named input**.

### THE R6-2 CITATION, RESOLVED — and the trap in applying it

Table letters and row ids collide across this repo, so the citation was resolved
rather than passed on. The rule the ruling means is **this family's own**, at
`docs/specs/logbook/2026-08-21-dream-promote-pair-review-rounds.md:881`:

> **GENERALISE R4.** Any primitive refusal of the report write — `expect`, a
> symlinked target under H3, any H-rule — converges on one outcome: **vault
> object untouched, the COMPLETE record to the run's log and output, reason
> named.**

Not the `R6-2` of `WP-a10-escape-harness.md:92`, and not the ones in the a9/a10
round records: different letter-spaces, different subjects.

**THE TRAP, and it decided the wording of every surface below.** R6-2's *rule* is
what the owner applied — the complete record reaches the run's log and output and
the reason is named, so no outcome is silent. R6-2's *outcome clause* says
"**vault object untouched**", and in A1's state the vault object is **not**
untouched: the first write published the body; only the accounting write failed.
R6-2 and Table R's row R4 were both written for a refusal of THE report write,
which assumes the WHOLE write. **Applying either verbatim would have put a false
clause about the user's vault into the contract**, and the next round would have
filed it. So: the RULE is carried, the outcome clause is explicitly scoped away
from the new state, and the new state states POSITIVELY what the vault holds.

### THE A1 FORM CHOSEN — a required discriminated field on the `promoted` arm

**`accounting:{published:true} | {published:false, reason:string}`**, on the
`promoted` arm ALONE, required, with the contract DECIDED in
`WP-dream-promote-report`'s **report row** — the row that already owns the two
writes — and the TYPE declared in that spec's `### Exact contracts`.

**Why a field and not a fourth arm, argued rather than preferred:**

1. **The union's discriminant is the BODY's outcome, and the second write's fate
   is a different axis.** This family has already ruled once that a fact
   orthogonal to the discriminant is a FIELD, not an arm — that is round 3's F1
   and the whole reason `preserved` sits on every arm. A fourth arm would encode
   two axes in one discriminant, which is the shape that argument rejected.
2. **A fourth arm would widen row Q10's carriers.** A new arm meaning "the body's
   sanitized bytes published, but the section did not" is an arm on which a
   redaction accounting is owed, so `redaction` would have to travel there too —
   past the `promoted`-alone scope row Q10 states by measurement, and past the
   Mirrored Surface Checklist prohibition that forbids widening it without that
   measurement. The field keeps `redaction` exactly where the disclosure-parity
   ruling put it: the arm is still `promoted` because **the body did publish**,
   on both forms of `accounting`.
3. **The scope is by MEASUREMENT, exactly as `redaction`'s is.** `promoted` is the
   only arm whose sequence is TWO primitive writes. Table R's fallback publishes
   in ONE write and `refused` publishes nothing, so on those a refusal IS the arm
   and row R4 governs it. A field on one precisely defined arm is the narrow true
   scope; a field on the union would be symmetry rather than measurement.
4. **Every "on every arm" enumeration in three specs stays true.** A fourth arm
   would have re-swept `preserved`-on-every-arm, the announcement criterion's
   three-arm walk, Table N's arm-quantified channel rows and the family map. The
   field costs none of that.

**WHAT THE FORM CARRIES — the five facts the reviewer enumerated, each in a named
field:** the published body bytes → `report.bytes`; the complete enforcement
record → `report.record`; the primitive's refusal reason → `accounting.reason`;
the preservation metadata → `report.preserved`; the redaction accounting where it
applies → `report.redaction`, unchanged.

**PER-FIELD PROVENANCE, stated in prose AND carried by the type:**

| Field | Filler | Moment | How the TYPE carries it |
|---|---|---|---|
| `accounting.published` | **THIS PACKAGE** (`WP-dream-promote-report`) | at SECOND-WRITE time — `true` when the primitive returned for that write, `false` when it refused | the literal discriminant |
| `accounting.reason` | **ORIGINATES WITH THE VAULT-WRITE PRIMITIVE** (Table H, its row H7, which returns `{written:false, reason}`) and is **CARRIED UNCHANGED** by this package | at SECOND-WRITE time | it exists on the `published:false` form ALONE — the form on which the primitive refused |

**The type carries provenance by DISCRIMINATION rather than by a base/extension
split, and it is stated rather than left to symmetry** — the same move row Q10
made for `RedactionAccounting`. The `GateReportedCopy`/`PreservedCopy` split
exists because ONE shape carries two parties' fields at once; here the
primitive's field exists on exactly the form where the primitive spoke, and a
single `reason` spanning both states would be the guarantees-nothing shape row S2
records.

**WHAT THE VAULT HOLDS, which the ruling required the new state to say.**
`report.bytes` is the bytes the vault holds for the report path: the SECOND
write's returned buffer on `published:true`, the FIRST write's on
`published:false`. Never a fresh read and never the composed-but-unpublished
section. **This also closes a seam row S1 left open** — "the exact buffer
`writeIntoVault` returned for it" is singular, and the report path is the one
path two writes can each return a buffer for. Row **S5** now hands that choice to
the report package by pointer (it already puts the two-write sequence there); the
report row decides it. No Table S row was added and none was restated.

**IS THIS STATE "PUBLISHED" FOR THE DISCLOSURE PURPOSE? Yes, and deliberately.**
Row Q10's carrier rule is keyed on THIS CANDIDATE'S SANITIZED BYTES HAVING
PUBLISHED, which is true on both forms — so `redaction` stays required and
nullable on `promoted`, and Q10's carriers are not widened. **What the
`published:false` form loses is not the accounting but its delivery INTO THE
VAULT:** the write that was refused is the very one carrying the redaction line
and every preserved-copy line, so on that form `report.record` is the only route
those lines take to the user. That is precisely the sense in which the ruled
property — no real outcome is silent — is satisfied by R6-2's rule.

**DOWNSTREAM, because an outcome nothing handles is silent by another route.**
`WP-dream-promote-in-workspace` row **G8** commits the report path from the arm's
`bytes` on BOTH forms — a commit that skips it drops a published, gated file out
of the run's one commit, and a commit that manufactures the missing section
commits bytes no gate judged. Row **G11** delivers `report.record` on the
`published:false` form exactly as it delivers R4's, naming
`accounting.reason`; it differs from R4's delivery in one respect, stated in
place: here something IS committed. Row **V4** records both deliveries.

### B1 — THE SHIPPED TRUTH HERE, THE COUNTING CHANGE ROUTED THERE

**Here, now (row Q10).** `lines` is how many of the run's ADDED LINES the scrub
RAN OVER — `addedLineNumbers.length` (`validate.js:1286`) — **and the gap is
named in place**: `scrubAddedLines` rewrites EVERY added line as
`scanAndRedact(line).text` (`:838-840`), and a clean added line is rewritten
byte-identically, so the count can exceed the number of lines whose bytes
changed. Ten added lines with one secret report ten. **The shipped report line
already renders exactly this value** (`:1401`, `` `${r.lines} line(s) scrubbed` ``),
so the row is the spec catching up to the product rather than a new inaccuracy,
and the word "scrubbed" on that line is the product's. Until the narrowing lands,
**no surface in this family may describe `lines` as a count of CHANGED lines.**

**Routed (row G7).** `WP-dream-promote-in-workspace` owns
`src/core/dream/validate.js` as a modify deliverable and extracts this gate, so
the change is a **NAMED INPUT** to that package: the extracted EP2 gate returns,
as the accounting's `lines`, the number of added lines whose POST-REDACTION bytes
DIFFER from their captured bytes. The row states it as an input, not as work this
pass performs, and says so. **No acceptance criterion was added for it**, and the
omission is deliberate and recorded in the row: this pass routes the change, and
growing that package's verification surface for work it has not been given is
what this record's stop criterion, condition 3, forbids. The criterion lands with
the counting change.

### PER-FINDING DISPOSITION — ROUND 4, BOTH GATES

| # | Gate | Verdict | What was done |
|---|---|---|---|
| **A1** | adversarial | **ESCALATED, RULED, FIXED** | the `accounting` field above, its owner (the report row), its per-field provenance, its type, its acceptance case, and G8/G11/V4 downstream. R4's and R6-2's untouched-vault clause scoped away from it rather than copied onto it |
| **B1** | adversarial | **RULED, SPLIT, BOTH HALVES DONE** | row Q10 states the shipped truth and names the gap; row G7 carries the counting change as a named input |
| **F-1** | coherence | **FIXED** | row Q7 said the module carries the record "into the accounting and the report" while three surfaces — one written in the same window — say it composes no report. Now: into its OWN RETURN, which is what the accounting and the report are BUILT FROM, "this module composing neither of them", with the old wording quoted as corrected history |
| **F-2** | coherence | **FIXED** | the Out-of-scope bullet attributed "preserves their DECISIONS, nothing more" to rows G7 and V3 and the G7 criterion; measured, the words are the pipeline package's Mirrored Surface Checklist entry (`in-workspace:404`). The quotation is re-attributed to its real owner and the three operative surfaces are described as carrying the narrowing WITHOUT that phrasing |
| **F-3** | coherence | **FIXED** | the orphaned "Asserted a THIRD time" in the announcement criterion — a sweep removed its predecessor. The ordinal is dropped rather than renumbered ("Asserted on the WITHHOLD arm too"), because an ordinal in a criterion this long is a count waiting to be falsified again |
| **F-4** | coherence | **FIXED, and the rule is now checkable** | "every field this family adds" is falsified by this family's own fields (`report.bytes`, `redacted[].rel`, `records[].path` and kin state neither filler nor moment, and none is owed one). Narrowed at both sites to **every field of a shape that CARRIES ONE PARTY'S FACTS TO ANOTHER** — row Q9's record, row Q10's accounting, and this pass's own `accounting` field, whose `reason` is the primitive's. The narrow form is what makes "who fills this, and when" a real question rather than a ritual |
| **F-5** | coherence | **FIXED (registration)** | the report's Current-state description of `promote()`'s return is a Table Q mirror, was edited in this window, and was registered by neither checklist. Registered in BOTH — the module's Table Q entry and the report's own Current-state item — and the paragraph itself now says so |
| **F-6** | coherence | **FIXED** | "its two typedefs" where three are declared, the count stale on arrival because `GateReportedCopy` was added in the same window. The prohibition now names all three, and records why the neighbouring "six shapes" count is nonetheless right: this package READS six and must never write out the seventh |
| **F-7** | coherence | **FIXED on the SIDE THAT WAS MISSING, not in the checklist** | the checklist claimed the partition is stated by "both rows" while only the preserved-copy row stated it. The redaction-lines row now states its side — render exactly once, the partition is over whether the path HAS an accounting — so the checklist's two-sided claim is TRUE rather than weakened. Weakening it would have left a sweeper checking one side of a two-sided rule |
| **F-8** | coherence | **FIXED** | "the one arm rows Q1 and Q10 name": Q1 names a GATE arm, Q10 names three carriers. The Current-state sentence now says what it means — the accounting is on every entry of `redacted[]`, required and non-null; row Q10 owns fields, provenance and carriers; row Q1 decides only the gate arm |
| obs. 1 | coherence | **CORRECTED BY APPENDING** — see the next subsection | |
| obs. 2(a) | coherence | **FIXED** | row Q9's broken `location` sentence (a dropped clause) — "the two places a preserved copy can sit are the two SHELVES of the glossary's **secret quarantine**" |
| obs. 2(b) | coherence | **FIXED** | the unbalanced bold run in the T3 tripwire bullet |
| obs. 2(c) | coherence | **FIXED** | the `awk` description said the command "finds exactly one consumer"; re-run, it prints NINE lines mentioning `reason`, exactly one of which CONSUMES it (`:1361`). The description now states the command's OUTPUT and the conclusion separately. The substantive claim holds |

### THE CORRECTED CITATION COUNT — appended, not rewritten, exactly as P-4 was

Round 3's `### COUNTS, EACH ONE COUNTED` says of row Q10's six new citations that
"each appears exactly once across the three specs, verified by grep". **Measured
at `36cfc23`, that is wrong for two of the six: `:1276` appears 3× and `:1297`
appears 2×**, all inside `WP-dream-promote-module.md` — row Q10 plus the Q8
acceptance criterion added in the same window by round 3's F2. **The correction is
appended here rather than edited into that section**, which is how the P-4
disposition was corrected and for the same reason: a record that silently rewrites
its own measurement teaches the next sweep to trust a number nobody can re-derive.

**No contract consequence:** the two surfaces cite the same code lines for
different facts, so there is no second carrier and no drifting restatement. The
count was wrong, not the citations.

**Enumerated before this pass's sweep and counted after it, at the tip this
section is committed in:**

| Citation | Sites before | Sites after | Where |
|---|---|---|---|
| `validate.js:1276` | 3 | 3 | module (row Q10 ×1, Q8 criterion ×2) — unchanged by this pass |
| `validate.js:1297` | 2 | 2 | module (row Q10 ×1, Q8 criterion ×1) — unchanged by this pass |
| `validate.js:1267` | 1 | 1 | module row Q10 |
| `validate.js:1287` | 1 | 1 | module row Q10 |
| `validate.js:1283-1292` | 1 | 1 | module row Q10 |
| `validate.js:1286` | 1 | **2** | module row Q10, **and pipeline row G7 (new — B1's routed input)** |
| **`validate.js:838-840`** (NEW) | 0 | **2** | module row Q10, pipeline row G7 |
| **`validate.js:1401`** (NEW) | 0 | **2** | module row Q10, pipeline row G7 |

**Both new citations verified at BOTH ends against the construct and its
indentation:** `:838-840` is the `for (const l of addedLineNumbers)` loop whose
body is `lines[l - 1] = scanAndRedact(lines[l - 1]).text;`, opening and closing
brace included; `:1401` is the single template line the shipped report renders.
**Two sites each is deliberate and is not a restatement:** the module row states
the FIELD's shipped meaning and the pipeline row states the CHANGE it must build,
and neither could cite the other's evidence without the reader having to leave the
one-document boundary.

### COUNTS, EACH ONE COUNTED

- **Acceptance criteria: 23 / 10 / 24, UNCHANGED**, counted with `awk` over each
  spec's `## Acceptance criteria` span after the sweep.
- **A1's acceptance case did not move the count, and that is an argument rather
  than luck.** The case went into the criterion that already existed for it —
  "Every report refusal delivers the record" — which was itself carrying the
  defect: its universal ("the vault object is byte-unchanged") is FALSE of the
  second-write refusal, so a new criterion would have left a false one standing
  beside it. The criterion is now partitioned into **(a)** the report write
  refused and **(b)** the first publish succeeding while the second write is
  refused, with four REDs on (b). **This is the extraction move applied to a
  criterion: pull the contract into one place, fix the mirrors, register the new
  one** — not surface growth.
- **New tables: none. New rows: none.** One new FIELD on one existing arm.
- **`npm run lint` passes:** markdownlint 0 errors over 556 files, frontmatter
  check 232 specs / 4 agents.

### STOP-CRITERION COMPLIANCE — the re-stated criterion, REVIEWED against these rulings

**Reviewed condition by condition, and the review itself is the record the
constraint asked for.**

1. *A carrier gap the ruled shape CANNOT express.* **FIRED, correctly, and was
   ruled.** This is the one condition written to catch exactly what A1 found: a
   real outcome fact with nowhere to go ON the shape. The reviewer escalated
   rather than proposing a repair, the owner ruled the property and left the form
   to the architect, and the fix is a field on a precisely defined arm. **The
   condition survives this round unchanged** — it did its job, and nothing about
   the ruling narrows it.
2. *A fix that re-imports an excluded property.* **None.** `accounting` adds no
   filesystem discipline (the primitive's refusal is cited, never described), no
   quarantine-lifecycle fact, and no new report rule beyond the outcome of a
   write the report row already owned. B1's routed input adds no property to the
   module half at all.
3. *Growing the verification surface to hold a finding about it.* **None, and it
   was consulted twice** — once to keep A1's case inside the existing criterion,
   and once to decline an acceptance criterion for B1's routed counting change in
   the package that has not yet been given the work.
4. *A cross-family duplicate.* **None.** Nothing here restates
   `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`; F-2's fix removes a
   quotation this family was attributing to surfaces that do not carry it, which
   is the same class one step milder.

**Weighted closure.** A1 is a **HEAVY** fix — it changed what an implementer
builds — so it lands its fix and **takes a fresh full round**. B1's first half and
F-1 … F-8 are LIGHT and verified mechanically. **The owner ratifications carried
into round 3 are carried into round 5 unchanged**, and one is added: **the A1 form
is ratified — a field on the `promoted` arm, not a fourth union arm.** A finding
re-proposing the arm is a scope objection, not a defect, unless it shows a
published-body outcome the field cannot express.

### DIVERGENCE THIS PASS ADDS AGAINST PR #31 — incremental, and it is small

**On the module half's SHAPE: nothing new.** A1 touched no field of `promote()`'s
return — the `accounting` field is on the report union, which the report package
adds and which no branch has implemented. B1 changed no value: row Q10 now
DESCRIBES what the shipped gate already computes (`addedLineNumbers.length`)
instead of describing something else, so whoever folds PR #31 back finds the row
agreeing with the code where it previously did not.

**Two items to carry forward, neither of them a correction to PR #31:**

1. **One prose pointer on the module half** — row S5 now says which package
   decides WHICH of the report path's two returned buffers travels in
   `report.bytes`. Nothing in `promote.js` changes.
2. **One FUTURE divergence, flagged now so it is not discovered late** — the
   counting change routed to row G7. When the pipeline package builds it, the
   extracted EP2 gate's `lines` stops being `addedLineNumbers.length` and becomes
   the count of added lines whose post-redaction bytes differ. **That is a change
   to shipped behaviour** (the report line's number will drop on notes with clean
   added lines) and it belongs to that package, not to this one and not to PR #31.

### WHAT I WOULD FLAG ABOUT MY OWN PASS

- **The field-versus-arm choice is the whole of A1, and I chose the form the
  owner left open.** The four arguments are above; the strongest is that a fourth
  arm would have forced `redaction` past the `promoted`-alone scope that the
  disclosure-parity ruling settled one round earlier. If the owner prefers the
  arm, the reversal is one arm in `### Exact contracts`, one sentence in row Q10's
  scope, one prohibition in two checklists, and a re-sweep of every "on every arm"
  enumeration in three specs — which is the cost the field avoids.
- **`report.bytes` on `published:true` now means the SECOND write's buffer, and
  that is a decision row S1 did not make.** I placed it in the report row and
  pointed row S5 at it rather than widening Table S, because S5 already puts the
  two-write sequence in that package. A reviewer could reasonably argue Table S
  should decide it; the counter-argument is that the module half never performs
  the second write.
- **F-4's narrowing invents a phrase — "a shape that carries one party's facts to
  another".** It is checkable and it covers exactly the three shapes that need the
  rule, but it is a NEW piece of vocabulary in a family that already has many. If
  it does not earn its keep, the fallback is to enumerate the three shapes and
  drop the general form.
- **F-7 was fixed by adding prose to a row rather than by weakening a checklist
  claim**, which grows the redaction-lines row a little further. The row was
  already the longest in Table R.

---

## ROUND 5 — the C4 ruling, the twin-sweep discipline, and the first overlap between the gates

**The gates, their raw output and the commit each was committed in — both
committed BEFORE adjudication, per `docs/runbooks/codex-review.md`:**

| Gate | Raw output | Commit | Analysed at |
|---|---|---|---|
| Adversarial DESIGN review (gptsol, codex/gpt-5.6-sol via llmp) | `docs/specs/logbook/2026-08-29-promote-family-design-round-5-gptsol-raw.txt` | `aa4a157` | `4f1f050` |
| INTERNAL COHERENCE pass (fresh general-purpose executor) | `docs/specs/logbook/2026-08-29-promote-family-design-round-5-coherence-raw.txt` | `96e72f4` | `4f1f050` |

Both passes confirm the mechanical baseline: acceptance criteria **23 / 10 / 24**,
unchanged; **citation endpoints clean for the SECOND consecutive round** (19
distinct ranges verified at both ends by indentation against the live tree).
Round 4's **B1 is CONFIRMED FIXED**. Round 4's **A1 is NOT confirmed genuinely
fixed** — the adversarial gate accepted the carrier, the reason propagation, the
G8/G11 routing and the prohibition against copying R4's untouched-vault clause,
and rejected one invariant the fix introduced. That rejection is C5.

**The trend broke.** Rounds found 21 → 15 → 11 → 8; this pass found **13** —
five contract defects, five coherence defects, three nits.

### THE OWNER'S RULING ON C4 — the authorization is NOT granted

> The G7 input becomes explicitly **PENDING**: it states that unblocking requires
> an owner decision against the pinned format in
> `WP-secret-fence-ep2-redact-arm:1373-1387`, **and quotes the pin**. The
> Out-of-scope bullets name it as a **second, PENDING exception**. If I authorize
> it at the pipeline round, the settlement happens via an **amendment to that
> `Done` spec**, exactly as the carrier change's did.

**The contradiction the ruling closes.** Round 4 routed the `lines` narrowing to
the pipeline's row **G7** as a NAMED INPUT. Measured by the coherence pass: the
value it changes is PINNED in a shipped `Done` package —
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387` states that the
report's redaction line is built "from exactly this template", that "every byte
outside the angle-bracket placeholders is literal", and that `<n>` is
`addedLineNumbers.length`. Meanwhile the two Out-of-scope bullets governing
changes to that package each asserted **exactly ONE authorized exception** — the
carrier change. **An implementer reading Out of scope refused the input as
unauthorized; one reading G7 shipped it.** That is the defect, and it is a
contradiction between two surfaces of this family rather than a question about
the shipped package.

**HOW THE PENDING STATE IS EXPRESSED — three moves, not one.**

1. **The blocker is QUOTED where the instruction lives, not only cited.** Row G7
   now carries the pin's own words inline — "The line format is PINNED HERE, not
   illustrated … EVERY BYTE OUTSIDE THE ANGLE-BRACKET PLACEHOLDERS IS LITERAL …
   where `<n>` is `addedLineNumbers.length`" — so a reader of that row cannot
   reach "ship it" without meeting the reason not to. The quotation is
   **owner-directed** and is deliberately not a second decider: the format stays
   that package's, and this family cites it by spec path.
2. **The instruction is put in the conditional and the fallback is stated
   operatively.** The row says the gate **WOULD** return the narrowed count, that
   unblocking **requires an owner decision against that pin**, and that **until
   that decision an implementer of this package BUILDS THE SHIPPED COUNT AND NOT
   THIS ONE**. A pending input with no instruction for the pending state is the
   same silence one level up.
3. **Both Out-of-scope bullets now name TWO exceptions with DIFFERENT statuses.**
   `WP-dream-promote-in-workspace`'s reads "TWO EXCEPTIONS, AND THEY DO NOT HAVE
   THE SAME STATUS — ONE AUTHORIZED, ONE PENDING", with (i) the carrier change
   and (ii) this one; `WP-dream-promote-module`'s Out-of-scope bullet carries the
   same two-status split. **Neither surface can now be read as a refusal of work
   the other authorizes.**

**And the settlement route is written down** — in row G7, in both Out-of-scope
bullets and in row Q10: if the owner authorizes it at the pipeline round, the
settlement is an **amendment to that `Done` spec**. Nobody has to rediscover
what "authorized" would mean.

**The counting change was neither shipped nor deleted.** It stays a named input,
with its blocker attached, in every surface that would otherwise have to
re-derive its status.

### THE TWIN-SWEEP DISCIPLINE, APPROVED AT THIS ROUND AND APPLIED TO IT

> When a ruling touches a row that has a **structural twin**, the twin is swept
> in the same pass. The twin set is: the **paired row**, that row's **acceptance
> criterion**, and the **Out-of-scope bullet that carries its authorization**.

**It is not advice, and the evidence is this round's own shape.** The coherence
pass's own reading: four of the five contract defects are one-surface-short
sweeps of round 4's rulings, and in three of them the missed surface is the
structural twin of one that WAS swept — the preserved-copy row beside the
redaction-lines row (C2); the G11 acceptance criterion beside rows G8/G11/V4
(C3); the Out-of-scope bullets that carried the PREVIOUS ruling's authorization
and not this one's (C4). **Each missed surface is one of the three kinds the
discipline names.**

**It is PROCESS discipline, not verification surface** — it adds no acceptance
criterion and no test — so stop-criterion condition 3 does not bite. Checked
explicitly, because that condition has already declined two additions in this
arc.

**WHAT THE WALK CAUGHT THAT THE FINDING LIST DID NOT NAME.** Every row touched in
this pass was walked through the three questions. Two surfaces came out of it
that no finding asked for:

1. **`WP-dream-promote-module`'s row Q10 — the PAIRED ROW of the pipeline's row
   G7.** C4 mentioned Q10 only to observe that it does not cite the shipped
   package; its remedy was framed around G7 and the two Out-of-scope bullets. But
   Q10 is where the input is ROUTED FROM, and it read "NARROWING IT IS ROUTED,
   NOT PERFORMED HERE" — routed-and-coming. Left alone, the module half would
   have said the change is on its way while the pipeline half said it is blocked:
   **the identical two-surfaces-disagreeing shape C4 filed, reconstructed one
   package over.** Q10 now states the input as PENDING, cites the pin by path and
   names the amendment route.
2. **The Table Q PREAMBLE — the paired surface of the checklist prohibition H1
   corrected.** H1 asked only that the prohibition bind the same three shapes the
   preamble binds. But C1's ruling gave the third shape a single owner in another
   spec, and the preamble is the surface that BINDS the rule for the family. It
   now says where that shape's provenance is DISCHARGED, so the single-owner
   ruling is legible from the rule's own surface. **Without it, C1's fix lived
   entirely inside the report spec and the module half still implied the rule was
   satisfied wherever someone chose to satisfy it.**

**Two more the walk reached and deliberately left alone, recorded so the next
sweep does not re-open them:**

- **`WP-dream-promote-module`'s "every published outcome carries its decided
  bytes" criterion** carries the same phrase C5 killed — "byte-equal to what the
  vault then holds". **Left standing, and it is not the same claim:** there the
  subject is a SUCCESSFUL single publish, "then" is the publish moment, and no
  second write intervenes. C5's falsity comes from a refusal whose own cause is
  that the vault changed. Editing it would have been sweeping a phrase rather
  than a contract.
- **`WP-dream-promote-report`'s Out-of-scope bullet for the EP2 durable
  lifecycle** carries no authorization clause and needs none: that package
  touches no `validate.js` byte, and its redaction-lines row already defers the
  count's MEANING wholly to row Q10, so the pending narrowing reaches it through
  its owner and not as a second statement.

### PER-FINDING DISPOSITION — ROUND 5, BOTH GATES, ALL THIRTEEN

| # | Gate | Verdict | What was done |
|---|---|---|---|
| **C5** | **BOTH** — adversarial Finding 1 and coherence C5 | **RULED BY MEASUREMENT, FIXED ON FOUR SURFACES** | `report.bytes` on `accounting.published:false` was the first write's returned buffer AND "byte-equal to what the vault then holds". The second is false on BOTH cases the criterion mandates: an `expect` conflict MEANS the target no longer holds those bytes (the primitive's H5 — that is why it refused), and a symlinked target is a symlink. `bytes` KEEPS its definition, because row G8 needs the decided bytes; every live-vault equality claim is REMOVED; the acceptance assertion is SPLIT BY REFUSAL CAUSE — on the `expect` conflict the vault retains the intervening user bytes while `report.bytes` retains the first-write body, asserted as an INEQUALITY with two REDs; on the symlinked target only the not-written-through and the buffer identity are asserted. **Row S1's own qualifier — "the only bytes the vault is KNOWN TO HOLD AT PUBLISH TIME" — is restored to all four surfaces that dropped it.** A prohibition is added |
| **C1** | coherence | **RULED, ONE OWNER PICKED** | `### Exact contracts` said the report row owns the per-field provenance; the report row said `### Exact contracts` does; both wrote it out in full. **The REPORT ROW's RULE CELL is the owner** — it already owns the two writes, and round 4's own ruling record put the contract there with the TYPE declared in `### Exact contracts`. That block is reduced to the type and a pointer; the scope-by-measurement argument moves to the owner with the provenance. The checklist entry NAMES the owner between the mirrors instead of listing both, and **gains the per-field-provenance prohibition it lacked** though the module's Table Q preamble asserts the rule binds this field |
| **C2** | coherence | **FIXED, and the twin's sentence REGISTERED** | the preserved-copy row's travel enumeration still said "when every write was refused"; on the partial form the first write SUCCEEDED. It now names both refusal states. **Its structural twin one row above received exactly this sentence in the same window and this row did not** — the discipline's first instance. The twin's new sentence was itself an unregistered mirror; **both are now registered** in the checklist's `accounting` mirror list |
| **C3** | coherence | **FIXED BY PARTITION, no count movement** | the G11 acceptance criterion asserted the retired untouched-vault universal over exactly the two cases round 4's A1 gave to the partial publish, and demanded "nothing is staged or committed" where row G8 requires the commit. It is now partitioned **(a)** the one-write path's write refused (`refused`, Table R's R4) and **(b)** the body published and the second write refused (`promoted` + `published:false`), with (a)'s byte-unchanged and nothing-committed clauses **asserted NOT to hold** on (b), and a RED for an implementation that applies them there. **The partition mirrors the report spec's own, made for the same reason one round earlier** |
| **C4** | coherence | **ESCALATED, RULED, IMPLEMENTED AS PENDING** | see the ruling above — quoted pin, conditional instruction with a stated fallback, two-status Out-of-scope on both bullets, amendment route written down, and row Q10 swept as G7's paired row |
| **H1** | coherence | **FIXED** | the Q-preamble binds the per-field-provenance rule to THREE shapes and the checklist prohibition bound it to ONE, both written in the same window — so the report's `accounting` dropped out of the family-wide prohibition on the one surface that carries prohibitions. The prohibition now names all three and states where the third is discharged |
| **H2** | coherence | **FIXED** | G7's "and nothing else" universal was left standing with the named input appended AFTER it. The exception is now **announced before the universal closes**, which is exactly the form the carrier change in the same cell already had — the contrast is named in place |
| **H3** | coherence | **FIXED — six surfaces, enumerated** | the named input reached row G7 alone. It now reaches the Deliverables `Notes` cell for `src/core/dream/validate.js`, Current state's validate.js bullet, row G7, Table V row V3, the Out-of-scope bullet (as the second, PENDING exception) and a new checklist entry that registers the set and forbids presenting it as authorized work |
| **H4** | coherence | **FIXED BOTH WAYS — registration AND criteria, no count movement** | the pipeline spec registered NONE of the A1 contract (`grep -c accounting` over its checklist and its criteria both 0) while the report checklist declared G8/G11/V4 its mirrors. A checklist entry registers this side with four prohibitions. **On the criteria: they are OWED, and both fold into criteria that already owned their subject** — see the count argument below |
| **H5** | coherence | **FIXED** | criterion 4's channel disjunction said "the arm that publishes nothing"; after A1 `record` is also the channel on an arm that DID publish. It now names both arms, and is registered as an `accounting` mirror |
| **N1** | coherence | **FIXED by classification, not by rule** | `accounting.reason` had no Table N row though that table's own ground is that a channel with no row is indistinguishable from one nobody thought about. It is classified **YES, by derivation** — the same classification `refused[].reason` carries, and for the same reason — with its actual delivery channel named (the run's log and output, row G11, because the write carrying the section is the one that was refused). **No rule changed and no criterion was added:** the fail-closed default already reaches it, and the code-authored-section criterion already quantifies over "every channel Table N classifies as attacker-influenceable" |
| **N2** | coherence | **FIXED by dropping the count** | G11 said "Two obligations" and listed five. **Dropped rather than renumbered, exactly as round 4's F-3 dropped an orphaned ordinal** — the count was already wrong before this window and a later pass added an item without touching it, which is what a hand-maintained count inside a cell this long does |
| **N3** | coherence | **FIXED** | case (a) was titled "THE REPORT WRITE IS REFUSED" — singular, in a criterion whose whole subject is that the path has TWO writes, and nothing in (a) said it meant Table R's fallback write. It is now named as the one-write path's write, with its return value (`refused`) stated |

### COUNTS, EACH ONE COUNTED — AND WHY NOTHING MOVED

- **Acceptance criteria: 23 / 10 / 24, UNCHANGED**, re-counted with `awk` over
  each spec's `## Acceptance criteria` span after the sweep.
- **C3 did not move the count, and that is an argument.** The fix is the same
  move round 4 made on the report spec's own refusal criterion: the criterion
  that carried the defect was the criterion the new case belongs in, because its
  universal was FALSE of that case. A new criterion would have left a false one
  standing beside it. **Pull the contract into one place, partition it, register
  the mirrors** — the extraction move applied to a criterion, not surface growth.
- **H4 did not move it either, and this was the deliberate decision the
  constraint asked for. THE OBLIGATIONS ARE OWED A CRITERION — they are not
  declared deliberately absent — and both fold into criteria that already owned
  their subject.** G11's obligation lands in the report-refusal criterion via
  C3's partition. **G8's lands in "The commit carries the decided bytes, not a
  fresh read"**, whose subject is exactly *which bytes enter the commit for a
  path this run published*; the report path on the partial form is that question
  asked about one more path, with two REDs (skips the path / manufactures the
  missing section). **Why owed rather than deliberately absent:** the test that
  separates them is whether this package has been GIVEN the work. G8 and G11
  carry obligations this package must BUILD — an unasserted obligation in a
  package that must build it is the silent-outcome failure A1 was escalated
  over, one level up. G7's counting input is the opposite: the package has not
  been given it, and now cannot be until an owner decision. **Its absence stays
  deliberate and is stated in two surfaces; theirs would not have been.**
- **New tables: none. New rows: ONE** — Table N's `accounting.reason`
  classification row, which is classification rather than contract and adds no
  assertion.
- **New checklist entries: TWO**, both in `WP-dream-promote-in-workspace` (the
  pending input; the partially published report). Both are registrations of
  contracts that already existed.
- **`npm run lint` passes:** markdownlint 0 errors over 556 files, frontmatter
  check 232 specs / 4 agents.

### CITATIONS — ENUMERATED BEFORE THE SWEEP, COUNTED AFTER IT

Endpoints have been clean for two rounds. No citation was CHANGED this pass;
three were re-used at new sites and one is new. **The new range was verified at
both ends with `sed -n l` before it was written down.**

| Citation | Sites before | Sites after | Where |
|---|---|---|---|
| `validate.js:1286` | 2 | **4** | module row Q10; pipeline row G7, **the validate.js Deliverables `Notes` cell (new)**, **Current state's validate.js bullet (new)** |
| `validate.js:838-840` | 2 | **3** | module row Q10; pipeline row G7, **Current state (new)** |
| `validate.js:1401` | 2 | **3** | module row Q10; pipeline row G7, **Current state (new)** |
| **`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`** (NEW) | 0 | **7** | module row Q10 and its Out-of-scope bullet; pipeline row G7 (which QUOTES it), the Deliverables `Notes` cell, Table V row V3, the Out-of-scope bullet, the new checklist entry |

**Endpoint verification of the new range:** `:1373` opens the pinned-format
paragraph (`**The line format is pinned here, not illustrated.** One line per
redacted file,`) and `:1387` closes the `where <n> is …` paragraph on a sentence
end (`of \`quarantinePreserve\`'s return, never the object itself.`). Both
checked with `sed -n l` against the live file.

**Seven sites for one citation is deliberate and is not a restatement:** every
one of them is a POINTER to the blocker, and the blocker's content is quoted in
exactly ONE of them (row G7), by the owner's instruction. A surface that names
the pending exception without naming what blocks it is the surface a future
round reads as an instruction to ship.

### STOP-CRITERION COMPLIANCE — the re-stated criterion, REVIEWED against this pass

**Reviewed condition by condition, and the review is the record the constraint
asked for.**

1. *A carrier gap the ruled shape CANNOT express.* **Not fired, and the
   adversarial gate said so explicitly** — its escalation test returned NOT
   TRIGGERED, on the ground that "no new fact lacks a field and no consumer is
   forced to re-derive one", and that C5 is an internally impossible vault-state
   assertion rather than a missing carrier. **That reading is accepted.** C5 is a
   false invariant inside an existing field, not a fact with nowhere to go.
2. *A fix that re-imports an excluded property.* **None.** C5's fix cites the
   primitive's H3 and H5 as CAUSES and describes no filesystem discipline; C4
   adds no quarantine-lifecycle fact and changes nothing the shipped package
   decides; C3 and H4 add no report rule — they assert what rows G8 and G11
   already carried.
3. *Growing the verification surface to hold a finding about it.* **None, and it
   was consulted three times** — to keep C3's case inside the existing criterion;
   to fold H4's G8 obligation into the decided-bytes criterion rather than adding
   one; and to decline (again, and now doubly) a criterion for G7's pending
   input. **The twin-sweep discipline was itself checked against this condition
   and passes: it adds process, not assertions.**
4. *A cross-family duplicate.* **The one place this pass came close, and it was
   ruled.** Quoting the pin is a quotation of a shipped package's own words in a
   family whose standing rule is to cite that package by path and never restate
   it. **It is owner-directed, it is the BLOCKER being named rather than the
   contract being re-decided, the format stays that package's, and it appears in
   exactly one surface** — the other six point at it. Recorded here rather than
   left implicit, because a later round that finds a quotation of that spec in
   this family should find this paragraph before filing it.

**Weighted closure.** C4 is a **HEAVY** ruling — it changes what an implementer
of the pipeline package builds today (the shipped count, not the narrowed one) —
so it lands its fix and **takes a fresh full round**. C1 and C5 are HEAVY on the
report spec for the same reason: C5 changes an acceptance assertion an
implementer would have failed to satisfy, and C1 moves where a contract is
decided. C2, C3, H1–H5 and N1–N3 are LIGHT and verified mechanically.

**Owner ratifications carried forward, unchanged:** the record shape; round-2
coherence C-2's fix; arm-dependent remediation; **the A1 form (a field on the
`promoted` arm, not a fourth union arm)**. **One is added: the twin-sweep
discipline** — a ruling that touches a row sweeps the paired row, that row's
acceptance criterion, and the Out-of-scope bullet carrying its authorization, in
the same pass. A finding that a twin was missed is an ordinary defect; a finding
that the discipline should not exist is a scope objection.

### DIVERGENCE THIS PASS ADDS AGAINST PR #31 — incremental, and it is one item

**On the module half's SHAPE: nothing.** C1 and C5 touch the report union, which
the report package adds and no branch has implemented. C3, H4 and the checklist
entries are pipeline-side. H1, H2, N1, N2 and N3 change no value.

**The one item, and it is a REVERSAL of a divergence round 4 flagged.** Round 4
recorded a FUTURE divergence: when the pipeline package builds the routed
counting change, `lines` stops being `addedLineNumbers.length`. **That future
divergence is now BLOCKED, not scheduled.** Until the owner rules against the pin
in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, the pipeline
package builds the SHIPPED count, so the specs and the shipped gate agree and
whoever folds PR #31 back has nothing to reconcile on this field. **If the owner
later authorizes it, the divergence returns — and it will arrive as an amendment
to that `Done` spec rather than as a spec sentence somebody has to notice.**

### WHAT I WOULD FLAG ABOUT MY OWN PASS

- **The pin is quoted in a family whose standing rule is never to restate that
  package.** The owner directed the quotation and the reasoning is above, but it
  is the first time this family has put that spec's words inside its own
  surfaces, and it creates a byte that can go stale if the pin is ever amended.
  **The mitigation chosen is that only ONE surface carries the words and six
  carry pointers** — if the pin moves, there is one place to fix. A reviewer who
  thinks even one is too many has a real argument, and the fallback is a citation
  plus the single sentence "that spec pins `<n>` as `addedLineNumbers.length`".
- **C1 was decided by precedent rather than by measurement.** The report row won
  because round 4's own ruling record put the contract there. The counter-case is
  that `### Exact contracts` is the TYPE surface and per-field provenance is a
  type-adjacent fact — which is how the module half carries it, in table rows
  beside the typedef. If the owner prefers that, the reversal is one block and
  one pointer.
- **The report row keeps growing.** It absorbed the scope measurement, the
  provenance and the type-discrimination argument this pass. It is now the
  longest cell in the spec, and "the owner surface absorbs everything" is a
  failure mode of the contract-density pattern, not a success of it. **If it is
  touched again, the honest move is a lettered table for the report row rather
  than a fifth paragraph** — and the map's line about the report row being
  deliberately outside the letter scheme is what would have to change first.
- **H4's fold is the judgement I am least certain of.** Putting the report path's
  partial-publish commit inside "the commit carries the decided bytes" is right
  by subject, but that criterion is now asserting three path classes. A reviewer
  could reasonably say the report path on a partial publish deserves its own
  criterion; the counter-argument is that a separate criterion asserting the same
  contract in a second place is exactly the shape the count freeze exists to
  prevent.
- **The trend broke and I do not think this pass reverses it.** Four of five
  contract defects were incomplete sweeps of the previous round's rulings, and
  the discipline the owner approved is aimed precisely at that. **Whether it
  works is a measurement the next round makes, not an argument this section can
  win.**

---

## ROUND 6 — the report row is lettered, the mirror-walk becomes mechanical, and the loop CLOSES

**The gates, their raw output and the commit each was committed in — both
committed BEFORE adjudication, per `docs/runbooks/codex-review.md`:**

| Gate | Raw output | Commit | Analysed at |
|---|---|---|---|
| Adversarial DESIGN review (gptsol, codex/gpt-5.6-sol via llmp) | `docs/specs/logbook/2026-08-29-promote-family-design-round-6-gptsol-raw.txt` | `d7587f2` | `3e0b930` |
| INTERNAL COHERENCE pass (fresh general-purpose executor) | `docs/specs/logbook/2026-08-29-promote-family-design-round-6-coherence-raw.txt` | `98f0cef` | `3e0b930` (HEAD moved to `d7587f2` mid-pass; all four analysed files verified byte-identical across `3e0b930`, `d7587f2` and the worktree by `shasum -a 256`) |

**The trend.** Rounds found 21 → 15 → 11 → 8 → 13 → **9** (three contract, three
coherence, three nits). The adversarial gate filed two, both of which the
coherence gate filed independently — the second round in a row the two gates
overlap. **Citation endpoints: clean for the THIRD consecutive round (round 4 was the first; round 3 still carried F6, a range one line short of its construct).**
**Acceptance criteria: 23 / 10 / 24, unchanged.** The adversarial gate's
escalation test returned **NOT TRIGGERED**.

### THE OWNER'S THREE RULINGS

---

#### RULING 1 — THE REPORT ROW GETS A LETTERED TABLE

**The measurement came back AT THRESHOLD and the owner accepted it.** The report
row's rule cell: **8,082 characters** — the longest cell in the family, **1.24x
the next** and **1.53x the longest OTHER cell in its own spec**; roughly
**FIFTEEN separable rules across FIVE unrelated subjects**; **37 references to
"the report row" across the family and ZERO able to sub-address a rule inside
it**, while every peer contract of comparable density is citable by row id (R4,
N3, Q9, Q10, S1, G7, V3). **The `accounting` contract ALONE was cited from
ELEVEN surfaces, each of which had to scan the whole cell to find the sentence it
pointed at.** The spec's own `### Contract table(s)` already conceded the
category: it called the report row **"an UNLETTERED contract table"**.

**Every extraction threshold this family has ever used was met or passed.** Table
N was extracted after two consecutive rounds landed an A-band finding on ONE
rule; Table S after two consecutive rounds landed a finding on ONE contract;
Table V after four findings in two rounds. **The report row's rule cell took
FOUR findings across THREE rounds** — round 4's A1, round 5's C1, round 5's C5
and the pre-window "the table above" correction — **and in every window it GREW
rather than split.** Round 5's own self-flag said so and named the remedy; round
6 measured it.

**WHAT WAS DONE.**

- **`### Table Y` is created in `WP-dream-promote-report`**, rows **Y1–Y12**,
  and it is the single decider of the report's second write. The cut follows the
  coherence pass's own enumeration: its rules 3–14 become rows Y1–Y12; its rules
  1, 2 and 15 (the body is brain-authored and gated, code does not own it, the
  fallback trigger as a complete class) **stay in the report row, because they
  are that row's own subject — "the body is an ordinary promotion candidate" is
  its heading.**
- **The report row survives as an ordinary row.** Its `Contract`, `Today`,
  `Position` and `Refusal remedy` columns are real and unchanged in kind; its
  rule cell becomes a row-by-row pointer at Table Y. **This is why the 35
  surviving "report row" references did not have to be rewritten as a class** —
  only the ones that meant the ACCOUNTING contract did, and those now name a row.
- **`### Contract table(s)` now reads "THREE NAMED canonical tables (N, R and
  Y)"** and records that the "deliberately outside that scheme" concession is
  closed, with the reason.
- **The family map's ownership row reads `Tables **N, R, Y** and the report
  row`**, and the map — the canonical collision surface — carries the letter's
  justification.

**WHY THE LETTER `Y`, and it does not create a sixth collision.** Measured with
`grep -rhoE '^### Table [A-Z]' docs/specs/`: the letters live ANYWHERE under
`docs/specs/` are **A, B, C, D, E, F, G, H, J, K, L, M, N, O, P, Q, R, S, T, U,
V and W**. **I, X, Y and Z occur nowhere.** So `Y` collides with nothing in this
family's thirteen (A, B, C, D, E, F, G, H, N, Q, R, S, V), nothing in
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s nine (B, H, J, K, N, P, Q,
R, T), and nothing in any other spec in the tree — **the map's collision table
stays at FIVE rows and gains none.** Of the four letters free tree-wide:

- **`I` rejected** — its row ids (`I1`) are misread as `11` or `Il` in running
  prose, and this family's rows are cited inside sentences, not in code.
- **`X` rejected** — this family already uses `### Table X` as its METASYNTACTIC
  placeholder for "some table"
  (`2026-08-29-promote-family-design-round-zero-raw.txt:164`), so a real Table X
  would collide with the family's own notation. That is a smaller hazard than a
  cross-package letter collision and a real one all the same.
- **`Z` left free** — it reads as "the last one", and spending it on a table that
  is not last would make the next extraction's letter read backwards.
- **`Y` chosen.** Zero collisions, unambiguous row ids, no borrowed semantics.

**Measurement of the choice, run after the sweep:** `grep -rlE '^\| \*{0,2}Y[0-9]'
docs/specs/` returns exactly one file, `WP-dream-promote-report.md`.

---

#### RULING 2 — THE MIRROR-WALK BECOMES A MECHANICAL STEP

**Round 6's diagnosis, and it is the finding under the findings.** In all three
sweep misses **the checklist had already named the mirror correctly and nothing
walked it**:

> *"IN EACH CASE THE REGISTRATION WAS ALREADY CORRECT AND THE SWEEP SIMPLY DID
> NOT FOLLOW IT. The discipline's weakness is not its rule set; it is that
> NOTHING MECHANICALLY WALKS THE MIRROR LISTS THE CHECKLISTS ALREADY CONTAIN."*

**A CITATION CORRECTION, recorded because the record is where a wrong name gets
fixed.** The instruction cited **"the G-order-check precedent"**. It was searched
for across `scripts/`, `tests/`, the lint layers and the specs, and **it does not
exist — zero hits.** No precedent by that name was applied, because none could be
resolved. **The nearest real one, and structurally the right model, is
`scripts/boundary-check.js`:** it parses a spec's markdown table (`## Deliverables`),
enforces the rule mechanically, exits non-zero with the offending items named, and
is invoked from `.github/workflows/ci.yml`. The mirror-walk is built in that
shape. **If the owner meant something else by "the G-order-check", this paragraph
is where to correct the naming.**

**WHAT WAS BUILT: `scripts/mirror-walk.js`.** Plain Node, zero dependencies,
JSDoc types, no build step — the repo's conventions.

**WHAT IT CHECKS — NOT DESCRIBED HERE ANY MORE, and that is the point.** This
section once carried its own copy of the tool's contract, and when the round-2 PR
gate forced the contract to narrow, the header was swept and this copy was not —
so the tool's contract stood in two surfaces that disagreed. Two descriptions of
one contract is the exact defect this whole amendment exists to remove.

**The tool was routed OUT of this PR by owner ruling (2026-08-30)** and lives on
`tools/mirror-walk` with its own gate, because a review round found the root
cause of its unreliable row resolution: `stripFindingIds`' first regex is
case-insensitive and permits zero digits, so it deletes real row citations along
with runs of short words before extraction — `(round 6's CD-1, see row Y4)`
becomes `( )`. **Its header is the single canonical statement of what it checks — on
`tools/mirror-walk`, commit `240881c`, cited by SHA so the pointer survives a
rebase of that branch. This record states only why it exists and where it went,
and the remedy was DELETION, not a fourth re-wording: a second description is
exactly what produced the finding.**

**WHAT THE FIRST RUN FOUND — HISTORICAL, and qualified.** Read the canonical
header before trusting any of it. The run was taken at `c96c7e3`, before the tool
left this branch, and its verbatim output is NOT reproduced here: a paste nobody
can refresh is a citation that goes stale silently, and no reader can re-run it
on this branch. Its reported row-reference count asserts nothing, because the
canonical header records that a green run says nothing about row ids until
`stripFindingIds` is fixed. What it does establish is what the header's table
and spec-path checks cover.

1. **The family was GREEN on what the tool actually checks, and the two skipped
   ids are correct skips** (`M2`, `M3` in the module spec: rows of an unlettered
   table, so their letter names no `Table M`. Observed, not filed — an
   unlettered table with three rows is nowhere near this pass's threshold, and
   noting it is not the same as extracting it).
2. **The AMBIGUITY report is a measurement nobody had taken:** the family's
   letters collide not only with the shipped EP2 package the map lists, but also
   with **`WP-dream-gate-inputs-baseline-delta`'s Tables C, D and E** and with
   the Table C of **`WP-dream-baseline-delta-primitive`,
   `WP-dream-denied-object-disposal` and `WP-dream-fence-candidate-set`** —
   four more packages, not one. **NAMED RESIDUAL, NOT
   FILED AND NOT FIXED:** it is pre-existing, it is not created by this pass, the
   map's collision table is explicitly scoped to the package this family CITES
   BY PATH twenty-five times, and widening it on the closing pass would be
   scope growth of exactly the kind this loop's stop criterion declines. **The
   tool now measures it on every run, which is the durable form of the finding.**
3. **Tree-wide it is RED — 12 unresolved references, ALL in `Done` specs** (stale
   `D3`/`D4`/`D6`/`A1` row ids, and four `docs/specs/<slug>.md` paths whose specs
   have since moved to `done/`). Those are closed records in other families.

**WHY IT IS NOT WIRED INTO CI IN THIS PASS, stated rather than left as an
omission.** Three reasons, and the first is decisive: **tree-wide the tool is red
on twelve pre-existing stale references in closed records**, so wiring it as a
gate today would make every PR in the repo fail for debt no PR introduced.
Cleaning that up is a change to seven `Done` specs (12 references) and belongs to a WP with its
own Deliverables table. Second, this branch is a design-record branch, not a work
package, and adding a repo-wide gate is not a documentation change. Third, the
tool's reference extractor follows THIS family's citation grammar; before it
gates the whole tree it should be measured against the others. **NAMED RESIDUAL,
with its shape: a small WP that (i) fixes the twelve stale references, (ii) adds
`node scripts/mirror-walk.js` to `.github/workflows/ci.yml` beside
`boundary-check.js`, and (iii) registers the step in
`docs/runbooks/spec-authoring.md`. Until then the walk is recorded here, exactly
where the twin-sweep discipline was recorded and by the same reasoning** — that
runbook carries authoring rules and has never carried this loop's process
disciplines (verified: it contains one occurrence of "mirror", in an unrelated
sentence).

**AND THE HONEST LIMIT, because a tool is easier to over-trust than a rule.**
Nothing here would have caught **COH-1**. That finding was a MISSING entry, and a
missing entry is precisely what a walker of existing entries cannot see. The
mirror-walk closes the "named but not walked" failure, which is three of round
6's nine; it does not close "not named at all". **A rule that claims more than it
does is the shape this family has filed findings about six times.**

---

#### RULING 3 — THE DESIGN LOOP CLOSES BY MATERIALITY

**The reasoning is the one already proven twice in this family, and it is on
record at `docs/specs/logbook/2026-08-29-promote-split-pr-gates.md:150-158`:**

> *"Three consecutive fix-and-regate cycles have each produced defects in the
> fixes themselves, at a rate this program measures at 0.5–0.9 per fix. **A
> fourth iteration is therefore not free and not obviously convergent**, so a
> B-band finding is a decision about materiality … and that decision is the
> owner's, not the author's."*

**The alternative that citation names is "the post-merge implementation defence
line, not another spec iteration", and that is what the owner has chosen.**

**The evidence from this round is that the rate is real and self-similar.** Of
round 6's nine findings, **FIVE are defects introduced by round 5's own fixes**:
COH-2 (the sentence replacing a stale count introduced two fresh false numbers,
inside the sentence warning that counts go stale), COH-3 (the reduced block still
glossing what it declared it did not), CD-3 (a row added with a classification
and no enforcement half), NIT-2 (a prohibition written in the same window a new
row falsified), NIT-3 (two structurally twin entries counting by different
conventions). **A sixth, CD-1, is a fix that did not reach one of its own
registered mirrors.** That is the 0.5–0.9-per-fix rate landing again, one round
later, on a round whose whole subject was not letting that happen.

**And this pass is not exempt from it.** It made large edits — a new twelve-row
table, six surfaces re-pointed, seven prohibitions re-cut, a new script — and
there is no reason to believe its own defect rate is zero. **A round 7 would
find some of them and introduce more; the question is not whether findings
remain but which detector is cheaper.**

**THE OWNER'S RULING: the implementation is now the cheaper detector.**
`wp/dream-promote-module` is re-shaped against these contracts, and **if that
work hits a contract gap it escalates AS A SPEC DEFECT** — to the architect, with
the surface named — rather than waiting for a round 7 that does not exist. **The
loop is CLOSED. A finding against these specs is now an implementation-time
escalation, not a review round.**

**What that does NOT mean, stated because a closure is easy to over-read:** the
specs are not declared correct, the residuals named in this record are not
declared closed, and the two review gates on the implementation PR
(`docs/runbooks/codex-review.md`) run exactly as they always do. **What closed is
the DESIGN loop over the spec text, on the ground that another iteration is not
obviously convergent and the next detector is better.**

### THE STOP CRITERION, REVIEWED — and this is the round where the review matters most

**Reviewed condition by condition against the re-stated criterion (before round
3), because this is the round that closes and the record of WHY it closes is the
point.**

1. ***A carrier gap the ruled shape CANNOT express.* NOT FIRED, and the
   adversarial gate said so explicitly** — its escalation test returned NOT
   TRIGGERED, on the ground that "both findings are contradictions inside
   existing contracts, not facts with nowhere to go on the shape and not facts a
   consumer must re-derive". **Accepted.** Every one of the nine is a false or
   incomplete statement inside a field that already exists. **The shape has now
   survived four rounds without a carrier gap** — the strongest single argument
   for closing.
2. ***A fix that RE-IMPORTS an excluded property.* NONE.** CD-1's fix removes a
   vault-state claim rather than adding one; CD-3's fix asserts neutralisation of
   a field this family already carries and adds no filesystem discipline, no
   report rule and no quarantine-lifecycle fact; Table Y moves text within one
   spec and decides nothing new. **The EP2 package's durable quarantine
   lifecycle is untouched, and containment stays the vault-write primitive's
   Table H, cited and never restated** — re-verified in the sweep.
3. ***Growing the verification surface to hold a finding about the verification
   surface.* CONSULTED THREE TIMES, AND IT BIT ONCE.** It declined a new
   criterion for CD-3 (folded into the criterion that already owns the subject —
   the H4 move); it declined a criterion for the still-pending counting input (a
   third refusal); **and it is the reason the mirror-walk is NOT wired into CI in
   this pass** — a repo-wide gate added to hold a finding about the review
   process is exactly this condition, and the residual is named instead. **The
   script itself adds no acceptance criterion and no test: like the twin-sweep
   discipline it is process, not assertions, so building it does not fire the
   condition; wiring it into the gate set would.**
4. ***A cross-family duplicate.* THE ONE PLACE THIS PASS CAME CLOSE, AND IT WAS
   ALREADY RULED.** CD-2 required making the pin quotation verbatim — that is,
   putting MORE of a shipped `Done` package's exact bytes into this family. **It
   is the ruled exception of round 5's C4, it remains in exactly ONE surface
   while eight point at it, and making it verbatim REDUCES the divergence risk
   rather than raising it: an exact quotation is checkable against its source,
   which a paraphrase wearing quotation marks is not.** The check is now
   mechanical and was run (below).

**Weighted closure.** Ruling 1 is **HEAVY** — it moves where a contract is
decided and changes how eleven surfaces address it. Under the criterion a HEAVY
fix "lands its fix and takes a fresh full round". **That round is the
implementation, by Ruling 3.** CD-1, CD-2 and CD-3 are HEAVY on their own
surfaces; COH-1/2/3 and NIT-1/2/3 are LIGHT and were verified mechanically.

**Owner ratifications carried forward, unchanged and NOT reopenable by an
implementation-time finding:** the record shape `{artifact, location,
remediation}`; round-2 coherence C-2's fix; arm-dependent remediation; the A1
form (a field on the `promoted` arm, not a fourth union arm); the C4 ruling that
the counting change is PENDING and NOT authorized; the twin-sweep discipline.
**Two are added: the report row's contract is Table Y's, row by row; and the
mirror-walk is a step, run before a sweep is called complete.**

### PER-FINDING DISPOSITION — ROUND 6, BOTH GATES, ALL NINE

**The adversarial gate's two findings are the same defects as CD-1 and CD-2,
filed independently — the second consecutive round in which the gates overlap.**
The adversarial gate's Finding 1 named a wider surface set than CD-1 did (it
reached `report.md:295`, `report.md:387` and the pipeline criterion, where CD-1
named row G8), and **the union of the two is what was swept.**

| # | Gate | Verdict | What was done |
|---|---|---|---|
| **CD-1** | **BOTH** — adversarial Finding 1 and coherence CD-1 | **FIXED ON SIX SURFACES, and the claim is re-grounded rather than reworded** | round 5's C5 killed "byte-equal to what the vault then holds" and the claim survived in two other wordings: "the bytes the vault holds" (row G8) and "the body IS in the vault" (four more). **The root fix is that every statement now turns on the PUBLISH EVENT — "this run's first write PUBLISHED the body" — which is the only ground the classification ever needed**, since `fallback` and `refused` are discriminated by what the run published and by nothing else. **What the target holds at the end of the run is REFUSAL-CAUSE-SPECIFIC and is now stated as such wherever it comes up: intervening bytes on an `expect` conflict, a symlink under the primitive's H3.** Six surfaces: Table Y row Y2 (the classification's ground), Table Y row Y4 (the prohibition, WIDENED to cover the second wording), Table R's row R4 narrowing clause (`it holds the published body`), Table R's preserved-copy row, row G8, row G11, and the pipeline's report-refusal criterion case (b). **Post-sweep verification: five claim-shaped patterns swept over all three specs, whitespace-flattened; ten hits remain and every one is inside a prohibition or a named withdrawal quoting the killed wording. Zero positive assertions.** |
| **CD-2** | **BOTH** — adversarial Finding 2 and coherence CD-2 | **FIXED — the quotation is now VERBATIM** | the exact-quotation option was taken over the mark-it-a-paraphrase option, because this is the family's one ruled exception to cite-never-restate and an exception that alters the bytes it exists to reproduce has not been taken. The three fragments are exact contiguous source text, ellipses appear only BETWEEN exact fragments, the source's own bold markers are not reproduced, and the row says so. **Verified mechanically: each fragment `in` the whitespace-flattened source AND `in` the whitespace-flattened quoting spec** — the flattened comparison is the correct one because the source hard-wraps mid-fragment. **The irony was load-bearing and is recorded in place:** the mis-quoted sentence was the one saying every byte outside the placeholders is literal |
| **CD-3** | coherence | **FIXED IN BOTH HALVES, AND THE UNIVERSAL WAS NARROWED RATHER THAN STRETCHED** | Table N's `accounting.reason` row had a classification and no enforcement, and the criterion its own checklist entry names as a mirror quantifies over "the normal second write AND the fallback" — **neither of which is the form `accounting.reason` exists on.** The diagnosis underneath the finding: **that channel is never interpolated by the SECTION COMPOSER at all** — the write that would have carried the section is the very one that was refused — **so row N2's fail-closed default, which binds "any string the COMPOSER interpolates", never reached it, and the row's claim that it did was wrong.** Fixed three ways: (i) Table N's row now states that this is the one channel the composer never interpolates, and names where the obligation is discharged; (ii) **the report's code-authored-section criterion states its DOMAIN and scopes this member OUT, with a pointer** — rejecting the alternative of stretching a universal over a member it cannot exercise, which is the shape that made row N4 false twice; (iii) **the assertion lands in `WP-dream-promote-in-workspace`'s report-refusal criterion case (b), the criterion that already owns the sentence "the run's accounting names `report.accounting.reason`", because the PIPELINE is the party that renders it.** GREEN and RED both stated, with the context-dependent secret pair the sibling criterion requires. **No count moved — see the argument below** |
| **COH-1** | coherence | **FIXED — a new checklist entry in the MODULE spec, and the pipeline's entry now names module surfaces** | the module carried the PENDING counting input on row Q10 and Out-of-scope (ii) and registered it in NEITHER of its checklists, while the pipeline's entry named no module surface — **round 5's H4 exactly, one spec over, in the window that fixed H4.** The module gains a `THE PENDING COUNTING INPUT` entry naming its two carrying surfaces and all six on the other side; the pipeline's entry gains row Q10 and Out-of-scope (ii). **Both sides now name each other, which is what a two-sided registration is. And this is the finding the mirror-walk CANNOT catch — a missing entry is invisible to a walker of existing entries — which is why it is named as the tool's honest limit above** |
| **COH-2** | coherence | **FIXED BY REMOVING THE NUMBERS, not by correcting them** | row G11's replacement sentence claimed the count "stood against five items" and that "a later pass added a SIXTH". Measured: it stood against FOUR for most of its wrong life, the pass that added `(i-b)` took it four→five, and **no sixth has ever existed** — two fresh false numbers, inside the sentence warning that counts beside lists go stale. **A corrected number is only a number that has not been falsified yet**, so the sentence now carries none: it states that the cell said "two" and listed more, that it was already wrong, that a later pass added an item without touching it, **and that its own first replacement introduced two false numbers of its own.** The failure is recorded in the surface that made it |
| **COH-3** | coherence | **FIXED — the gloss is gone, and `redaction` is now actually the model it names** | `### Exact contracts` glossed the two writes ("the fate of the report's SECOND primitive write, the one that publishes the code-authored enforcement section on top of the body the first write published") two lines before claiming to declare "the TYPE and its two-arm shape, AND NOTHING ELSE" — while offering its own treatment of `redaction`, which is named without gloss, as the model. **Round 5's C1 closed the full-restatement form; the reduced form survived in the same block.** The block now declares the two-arm shape, points at Table Y, and enumerates what it does NOT restate. **Both findings on this block are recorded in it, one round apart** |
| **NIT-1** | coherence | **FIXED — the prohibition gains its or-clause** | prohibition #7 said a surface enumerating where the record TRAVELS on a refusal "states BOTH refusal states or it is wrong". Table R's redaction-lines row enumerates ONE and is CORRECT to: its `report` source exists only on the `promoted` arm. **The scoping lived in the mirror list four lines above; the flat prohibition, which is where an implementer looks, was over-broad.** It now reads "states BOTH refusal states, OR names why its own source exists on only one", with the exemplar named |
| **NIT-2** | coherence | **FIXED — the verb is restored to the owner row's own** | prohibition #5 said "no surface but the rule cell may STATE this field's PER-FIELD PROVENANCE", and Table N's `accounting.reason` row — added in the same window, registered as a mirror in the same entry — states it. **The owner row's verb is DECIDED; the checklist rendered it as STATE, and the weaker verb is what made the prohibition false.** It now reads DECIDE, names Table Y row Y9 as the sole decider, and says in place that a surface CITING the provenance to ground something else is not deciding it |
| **NIT-3** | coherence | **FIXED — one convention, stated once, and the counts dropped** | two defects in one. **(a)** Row V3 carried "the carrier change reached six surfaces" — correct the day it was written, stale the moment a seventh is registered, and the exact pattern row G11 warns about one row over. Dropped, replaced by "every surface its own checklist entry registers". **(b)** The carrier-change entry EXCLUDED itself from its own ordinal while the structurally-twin pending-input entry INCLUDED itself. **The convention is now stated ONCE, in the carrier-change entry — a list names the surfaces OUTSIDE the entry, and the entry itself is always a carrier and never one of them — and the twin defers to it.** **No mirror list in that spec states a total any more, because `scripts/mirror-walk.js` walks the lists.** The distinction that survives, and it is principled: **a count of PROHIBITIONS inside one cell is re-countable in place and stays (the report's "seven"); a count of MIRROR SURFACES predicts another surface's content and goes** |

### COUNTS, EACH ONE COUNTED — AND THE ONE THAT COULD HAVE MOVED

- **Acceptance criteria: 23 / 10 / 24, UNCHANGED**, re-counted with a script over
  each spec's `## Acceptance criteria` span after the sweep. **Unchanged across
  all six rounds.**
- **CD-3 IS THE COUNT THE CONSTRAINT ASKED ABOUT, AND IT DID NOT MOVE. The
  argument, because "it may legitimately need a criterion" was the instruction.**
  The obligation is **OWED** — `accounting.reason` is attacker-influenceable by
  derivation and reaches the user, so an unasserted neutralisation is the
  silent-outcome failure A1 was escalated over. It is not deliberately absent.
  **But it folds into a criterion that already owns its subject, which is exactly
  the H4 move round 5 made and the same test applies:** the pipeline's
  report-refusal criterion case (b) already asserts what form (b) delivers to the
  run's log and output, and **already names `report.accounting.reason` in that
  sentence.** The neutralisation of that field is the same question asked about
  the same field on the same channel in the same case. **A separate criterion
  would assert a second contract about one channel in two places — the shape the
  count freeze exists to prevent — and would leave the sibling criterion's
  domain still silently over-quantified.** The domain sentence in the report
  package is what makes the fold honest: **the member is removed from a universal
  it cannot exercise AND its assertion is named, so no reader finds a gap.**
  **The alternative was measured and rejected, not overlooked.**
- **New tables: ONE — Table Y**, and it is an EXTRACTION: twelve rows, every one
  of them text that already existed inside one cell of the same spec. **No rule
  is new, no assertion is added, and no contract changed by the move.** The
  changes to those rules are CD-1's and COH-3's, and they are subtractions.
- **New rows outside Table Y: NONE.**
- **New checklist entries: TWO.** `WP-dream-promote-report`'s Table Y entry —
  which is a SPLIT of the `accounting` registration out of the `report` union's
  entry, not a new registration — and `WP-dream-promote-module`'s pending-input
  entry, which is COH-1's fix.
- **New prohibitions: NONE. Three of the report's seven were RE-CUT** (NIT-1's
  or-clause, NIT-2's verb, CD-1's second half), and the count stays seven,
  counted against the list.
- **`npm run lint` passes.** `npm test`: **2143 tests, 2133 pass, 1 fail** — the
  pre-existing `adopt-e2e` failure, **byte-identical to the round-6 coherence
  pass's own measurement**, so nothing in this pass moved it.

### CITATIONS — ENUMERATED BEFORE THE SWEEP, COUNTED AFTER IT

**Endpoints have been clean for three rounds — 4, 5 and 6 — and this pass does not break them.** (Corrected 2026-08-30: an earlier form said four. Round 3 still carried F6, a range one line short of its construct, so round 4 is the first clean round. The first correction fixed two sites in this file and missed this one; a PR gate found it. Sweep for the CLAIM, in every file.)
No existing citation's ENDPOINTS were changed. Two citation classes moved.

| Citation | Sites before | Sites after | Note |
|---|---|---|---|
| `validate.js:1286` | 4 | **4** | untouched |
| `validate.js:838-840` | 3 | **3** | untouched |
| `validate.js:1401` | 3 | **3** | untouched |
| `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387` | 7 | **8** | **+1, and it is argued below** |
| "the report row" (as a citable surface) | 35 in the four files | **31** | four re-pointed at Table Y; the rest are the row's own subject or historical narration |
| `Table Y` / rows `Y1`–`Y12` | 0 | **30 `Table Y` + 43 row citations** | new |

**THE PIN CITATION MOVED FROM SEVEN SITES TO EIGHT, and the eighth is COH-1's
fix.** `WP-dream-promote-module`'s new checklist entry names the blocker by spec
path, exactly as every other surface carrying the pending state does. **The
content is still QUOTED in exactly ONE surface — verified: `grep -c "The line
format is pinned here, not illustrated"` returns 1 in the pipeline spec and 0 in
the other two.** A surface that names the pending exception without naming what
blocks it is the surface a future round reads as an instruction to ship, which is
why the eighth pointer is right rather than merely harmless.

**Endpoints re-verified for the pin range**, because CD-2 made its bytes
load-bearing: `:1373` opens the pinned-format paragraph and `:1387` closes the
`where <n> is …` paragraph on a sentence end. Both unchanged from round 5, both
re-read this pass.

### DIVERGENCE AGAINST `wp/dream-promote-module` (PR #31) — THE COMPLETE LIST

**This list is CUMULATIVE and supersedes the four incremental ones above.** Every
prior pass recorded its own increment; this is the whole of it in one place,
because the branch is folded back once and against the final text. **It is
organised by what the folder has to DO, not by which round produced it.**

**A. THE ONE REAL CORRECTION TO SHIPPED CODE — and it is mostly a DELETION.**
The redact-then-refuse arm. `refused[]` no longer carries a prose mitigation:
**`withPreserved`, its divergent inline copy and the `refuseRaw` machinery all
exist ONLY to make prose carry a structured fact, and the ruling deletes them
rather than extending them.** The fact moves onto a typed **preservation
record** — `Array<{artifact, location, remediation}>`, one entry per copy the
gate preserved, in the order it wrote them, REQUIRED wherever it appears and
EMPTY when nothing was preserved. **The standalone `refused[].artifact` and
`redacted[].artifact` are deleted with it.** Owner: `WP-dream-promote-module`'s
Table Q rows Q1, Q8 and Q9.

**B. TWO SHAPE CHANGES ON `promote()`'s RETURN, neither of which changes a
computed value.**
1. **The preservation record above**, replacing two loose `artifact` fields.
2. **The redaction accounting becomes ONE named field.** `lines` and `labels`
   become a single `redaction: {lines, labels}` on the redact arm and on
   `redacted[]` entries. **The shipped gate already computes both values and
   already composes the shipped report line from them (`validate.js:1284-1289`,
   `:1392-1409`); no value is computed differently and none is dropped.** This
   is a field-grouping change. Owner: Table Q row Q10.

**C. WHAT THE SHIPPED IMPLEMENTATION GOT RIGHT AND MUST NOT BE "FIXED".** The
ordering (Q-D/Q-E need no code change) and Q4's sanity refusal. **And the
scrubbed-line count: `lines` STAYS `addedLineNumbers.length`.** Row Q10 now
describes what the code does, so the row and the code agree where they
previously did not.

**D. ONE PROSE POINTER, no code effect.** Table S row S5 says which package
decides WHICH of the report path's two returned buffers travels in
`report.bytes`. Nothing in `promote.js` changes; **the citation was re-pointed
this pass from "its report row" to "its Table Y, row Y3", which is a citation
change and not a contract change.**

**E. NOTHING ON THE MODULE HALF FROM THE REPORT UNION.** The `accounting` field,
Table Y in its entirety, CD-1's re-grounding, CD-3's neutralisation assertion and
COH-3's block reduction all live on the report union and the pipeline — **which
the report and pipeline packages add and which NO BRANCH HAS IMPLEMENTED.** PR
#31 has nothing to reconcile against any of it.

**F. ONE FUTURE DIVERGENCE, BLOCKED RATHER THAN SCHEDULED.** The counting change
routed to row G7 would make the extracted EP2 gate's `lines` the count of added
lines whose post-redaction bytes DIFFER — a change to shipped behaviour, since
the report line's number would drop on notes with clean added lines. **It is NOT
authorized** (round 5's C4). Until an owner decision against the pin in
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1373-1387`, the pipeline
package builds the SHIPPED count, **so the specs and the shipped gate agree and
whoever folds PR #31 back has nothing to reconcile on this field.** If it is ever
authorized, the settlement arrives as an AMENDMENT to that `Done` spec rather
than as a spec sentence somebody has to notice.

**G. NO NEW REPO FILE — corrected 2026-08-30.**  `scripts/mirror-walk.js` was
routed OUT of PR #32 by owner ruling and lives on `tools/mirror-walk` (commit
`240881c`) with its own gate. It is in no Deliverables table, no CI step and no
`package.json` script, and it is absent from both PRs' diffs. This item said the
opposite until a closing gate caught it — the divergence list was not swept when
the tool was routed out, which is the same one-surface-short miss this record
documents four times.

**NOT ON THIS LIST, and deliberately:** every change of round 6 that is a
citation re-point, a prohibition re-cut, a count removed or a false sentence
corrected. **Those change what the specs SAY and nothing an implementer BUILDS**,
and a divergence list that included them would bury the four items that matter.

### WHAT I WOULD FLAG ABOUT MY OWN PASS

- **Table Y is the largest single edit this loop has made, and it was made on the
  pass with no round after it.** The cut is defensible — it follows the coherence
  pass's own measured enumeration, and rules 1, 2 and 15 stayed because they are
  the report row's own subject — **but "which rules belong to the row and which
  to the table" is a judgment nobody will re-review.** The concrete risk is a
  reader who goes to the report row for the second write's contract and finds a
  pointer; the mitigation is that the pointer names all twelve rows by number and
  subject, so the pointer is itself the index.
- **Twelve rows is a lot of rows to author in one pass, and three of them are
  short.** Y5, Y7 and Y8 could each have been a clause of a neighbour. **I split
  finely on purpose** — the whole finding was that nothing could be
  sub-addressed — **but a reviewer could reasonably say the table now has rows
  that exist to be citable rather than because they decide something separable.**
  Y7 is the weakest of the three.
- **The mirror-walk has never been run in anger.** It is green on the family
  today, but it has walked exactly one tree state, and its extractor was tuned
  against this family's citation grammar by looking at this family's citations.
  **A tool calibrated on its own test case is a tool whose false-negative rate is
  unmeasured.** The honest claim is narrow: it demonstrably answers the query
  that would have prevented CD-1, and it demonstrably cannot see COH-1.
- **CD-3's fold is the judgement I am least certain of**, and for the same reason
  round 5 flagged H4's: putting the reason channel's neutralisation into the
  pipeline's report-refusal criterion is right BY SUBJECT and by who renders the
  value, but that criterion now asserts delivery, partition, commit behaviour and
  neutralisation. **A reviewer could say the neutralisation deserves its own
  criterion in the package that owns Table N.** The counter-argument is that the
  package that owns Table N does not render the value, and a criterion asserting
  a property of output it does not produce is the shape round 3's F11 already
  corrected once in this family.
- **I did not widen the map's collision table**, though the mirror-walk's own
  first run measured four more colliding packages. That is a deliberate
  scope-growth refusal on a closing pass, and it is a judgement the owner may
  reverse cheaply — it is one table and a handful of rows. **The argument for
  refusing is that the map's collision table exists for the package this family
  CITES BY PATH twenty-five times; the argument against is that a collision is
  a collision and the map claims to list them.** I think the second argument is
  the better one and the timing is wrong.
- **The "G-order-check precedent" could not be resolved and I did not invent
  one.** `boundary-check.js` was used as the model on structural grounds. If the
  owner meant a different precedent, the script's shape is the thing to re-examine
  first.

## QUEUED, owner-ratified — FIVE items: three this arc produced, two standing

1. **A structural parser check in the lint pipeline.** An unclosed code fence
   swallowed 764 lines of `WP-dream-promote-report.md` — every heading from
   `## Contract reference` down, all three named contract tables (N, R and Y), both prose sections
   and every acceptance criterion rendered as JavaScript — and survived FOUR
   gate passes with `npm run lint` green. It survived because every check this
   arc ran greps raw text, and a lexical check cannot see a structural break.
   That includes the relay's own: acceptance criteria were counted with `awk`
   over raw lines through all seven rounds, and would have counted the same had
   the file been one code block. `markdownlint` does not flag the shape.

2. **A branch under gate review is FROZEN until the verdict** (owner rule,
   2026-08-30, for the runbook). Produced by an incident in this very PR: the
   spec-fidelity gate was assigned tip `9aee7f5` at 09:46 and a commit landed on
   the same branch at 10:02 while it was reading. Its verdict is therefore
   sound only for the tip it names, and the commit that overtook it was never
   gated — so the same diff needs a closing same-tip pass. In a shared checkout
   this is not a courtesy; a verdict against a moving tip is not a verdict.

3. **The `mirror-walk` resolver defect**, routed to `tools/mirror-walk` with its
   root cause characterised (`stripFindingIds`' first regex is case-insensitive
   and permits zero digits, so it deletes real row citations along with runs of
   short words before extraction). It gets its own PR and its own gate. The
   earlier two queue items stand: the family map's four further colliding
   packages at its next touch, and the tool's CI wiring after the twelve stale
   `Done`-spec references are cleaned.
