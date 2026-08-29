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
| **2** | internal coherence, fresh executor | `docs/specs/logbook/2026-08-29-promote-family-design-round-2-coherence-raw.txt` | this commit's parent |

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
