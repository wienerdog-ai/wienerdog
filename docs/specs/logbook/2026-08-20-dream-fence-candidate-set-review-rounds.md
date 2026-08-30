---
title: Review rounds — WP-dream-fence-candidate-set
date: 2026-08-20
---

# Review rounds — WP-dream-fence-candidate-set

Spec: `docs/specs/WP-dream-fence-candidate-set.md`. Base: `main` @ `1d4c092`.

**Round counter starts at ZERO.** No round history is inherited from the superseded
parent, `docs/specs/done/WP-dream-control-file-fence.md`. Its record —
`docs/specs/logbook/2026-08-20-dream-control-file-fence-review-rounds.md` — is cited
as EVIDENCE for the measurements this spec carries, never as review credit: no finding
there counts as reviewed here, and this package's own rounds must re-find anything
that still applies.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the PRODUCT —
  nothing that changes what the implementer builds in `src/`.
- **THE FAMILY ESCALATION, inherited verbatim from the parent's split ruling:** if a
  round lands again on the **preservation/visibility family**, it returns to the owner
  as a ruling request, **and rethinking the package itself is on the table** — not
  merely its mechanism. Two designs have already failed that family.
- **Otherwise:** two consecutive rounds on any other same contract family → contract
  extraction, not another patch. Two consecutive rounds on an owner ruling → owner
  ruling request.
- **Surface frozen:** ZERO new source-level assertions — the parent measured twice why
  a source grep cannot assert these contracts. The behavioural both-directions
  requirement stands and does not grow.
- **Scope frozen:** this package is one half of a two-package pair. A finding
  belonging to the sibling, to C2 (the git-execution seam) or to C3 (the layout dot
  rule) is routed, never folded in.

## Rounds

| Round | Kind | Raw record | Commit that introduced the raw | Verdict |
|---|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-20-dream-fence-candidate-set-r0-template-conformance-raw.md` | `5a59b89` | clean — no blocking items |
| 0b | Internal coherence + runnable criteria | (in this record) | `5a59b89` | 2 findings |
| 1 | External adversarial (design), gptsol | `docs/specs/logbook/2026-08-20-dream-fence-candidate-set-round-1-raw.md` | `dbd20f4` | NO-SHIP — 4 findings |

## Round 0 dispositions

**0a — template conformance.** Both halves were read by independent clean-context
executors that took no part in drafting. Verdicts and the two findings below are
recorded in the raw files cited above.

**0b — internal coherence. Run by the orchestrator session itself**, not by a
separate executor, and therefore with **no separate raw file** — the C1 precedent had
one because a distinct pass produced it. The measurements below ARE the record; a
later reader re-runs them from here. Every `file:line` citation in both specs was re-run
against the tree, not re-read. Both specs' verification patterns were executed:
`npm test -- --test-name-pattern "dream|private-fs"` and
`npm test -- --test-name-pattern "dream"` both exit 0 with zero failures, and
`npm run lint` passes. As both specs already state in their own Verification steps,
**that greenness proves nothing on a spec-only branch** — the behavioural
both-directions requirement is the real gate.

| # | Finding | Weight | Disposition |
|---|---|---|---|
| R0-1 | The template's `### Contract table(s)` heading was silently absent from BOTH specs — the three named tables sat in its slot at `###` level with no heading and no `N/A` line. One executor called it BLOCKING, the other a heading-text deviation; the stricter reading is the correct one under `docs/runbooks/spec-authoring.md` ("a template section is never deleted silently") | LIGHT | **fix** — the template heading is restored in both specs with a one-line lead, and the named tables become `####` beneath it, which is the shape the template actually describes |
| R0-2 | `WP-dream-denied-object-disposal` cited `src/core/private-fs.js:105-113` for the A5 private-directory list; the list is `:106-113` (`:105` is the JSDoc tail) | LIGHT | **fix** — corrected in both places it appeared |

**A third finding, on the orchestrator's own record rather than the specs:** the two
conformance raw files were written citing commit `45c34a5` for the tree the executors
read — a hash that does not exist. The split commit is `4221a62`. Caught by running
`git log` instead of trusting the recollection, and corrected in place before the
round closed. It is recorded here because the whole point of a raw record is that a
later reader can re-run it, and a wrong SHA silently destroys that.

**Machinery surface after round zero: ZERO new source-level assertions**, in both
halves. Nothing to grow.

## Round 1 — verdicts, and why this joins the HAND's escalation

Four findings. The scope rule held, and the routed section explicitly confirms that
the spec **names the user-ignore residual accurately** — that part of the design
survived review. The orchestrator re-ran the decisive finding and it reproduced:

```text
x/.git as a DIRECTORY : git status --porcelain -z -uall -> 0 bytes
x/.git as a FILE      : git status --porcelain -z -uall -> 0 bytes
  (x/.gitignore contains "*", x/CLAUDE.md exists, both check-ignore as ignored)
```

**The inventory's nested-repository skip is defined as `lstat(<dir>/.git)` finding any
object — so a plain file named `.git` prunes the subtree.** The dream has Write; it can
create that file and its siblings. Both candidate sources then report nothing, and the
hostile instruction file survives on disk. This is the **third** design for the
candidate set to fail the visibility family: `git status` alone (blinded by a
self-hiding `.gitignore`), then the narrow inventory with a nested-repo skip (blinded
by a fake marker).

Finding 2 is structural in the same direction: the pre-brain visibility invariant
cannot be implemented from this package's permitted inputs. The baseline must be taken
**before the brain**, which is `src/cli/dream.js`, and only `validate.js` and its test
file are deliverables. The reviewer also showed the invariant is under-defined for a
directory rename, where the newly visible pathname did not exist pre-brain, and that
no changedness predicate distinguishes a clean pre-existing inventory hit from a
dream-written one — leaving an implementer to choose between relocating the user's own
files and re-opening the original blind spot.

Findings 3 (the bridge never says which bytes seed the atomic replacement) and 4 (size,
again) are real and would be ordinary fixes in a healthier package.

**This round does not itself fire this package's pinned escalation** — it is round 1,
so there is no "again" within this package. It is reported to the owner together with
the HAND's escalation because the two share one deployment unit and, on the evidence,
one root cause.
