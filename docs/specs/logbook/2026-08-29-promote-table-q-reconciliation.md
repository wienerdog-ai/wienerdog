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
