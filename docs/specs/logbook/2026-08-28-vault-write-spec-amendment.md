---
title: Post-implementation spec amendment — WP-dream-vault-write-primitive
date: 2026-08-28
related_wps: [WP-dream-vault-write-primitive, WP-dream-promote-in-workspace]
---

# Post-implementation spec amendment — WP-dream-vault-write-primitive

Spec: `docs/specs/WP-dream-vault-write-primitive.md` (status `In-Review`).
Implementation merged as PR #27; base `main` @
`42b83a1`. Three items were routed here by the PR gates, both of which agreed
they are spec-side. The shipped tree is the truth the spec is aligned to, not
the other way round: the code and its tests are correct, the spec understated
them.

## The routed three

| # | Item | Disposition |
|---|---|---|
| 1 | The Deliverables cell and the Mirrored Surface Checklist both said the test file covers **three** measured defects as red-side cases; the acceptance criteria carried an explicit red for **one**. | Canonical side raised. The second defect's red now lives in a new H4 criterion, the third's in the H6 criterion. |
| 2 | H7's file side was stated as an absolute ("nothing of this call's making survives it"), which the implementation measured to be unsatisfiable. | H7's row now states the strength that holds, with its damage bound; the H7 criterion counts **four** bounded cases. |
| 3 | `docs/GLOSSARY.md`'s `**vault write**` entry restates Table H but was not a registered mirror. | Registered. Read against Table H: no contradiction, so the glossary is unchanged. |

### Item 1 — the arithmetic was worse than routed

The routing said two of three defects carried explicit reds. Measured on the
spec, only **one** did. The spec's other `Proven RED` clause (H4's
in-place-write red) belongs to the partial-content property, which is not one of
the three measured defects. So the canonical side needed two additions, not one:

- The **second** defect (`validate.js:855-863`, a predictable staging name plus
  a following write) had no criterion-level red at all. Its shipped test sits in
  the test file's H4 section (`tests/unit/dream-vault-write.test.js:366`,
  section header at `:292`), because H4 is the row that makes a staging object
  exist. A new H4 criterion states it, name-agnostically — the probe plants at
  whatever path the implementation opens, never at a guessed name, because the
  staging object's naming is the implementer's under the round-4 CUT.
- The **third** defect (`validate.js:1412`, staging reads the working tree) is
  exercised at `tests/unit/dream-vault-write.test.js:464`, inside the H6 test.
  The H6 criterion now carries its red at both ends of the return: a module that
  reads the path back, and a caller that re-reads the path.

### Item 2 — and a fourth bounded case the sweep found

`tests/unit/dream-vault-write.test.js:631-679` measures what the routing
described: the parent directory is made unwritable between the staging open and
the refusal, `rmSync` fails `EACCES`, and the staged bytes — the REFUSED payload
— stay in the vault. `src/core/dream/vault-write.js:268-274` retains them and
`:294` names them in the reason. That is case **(c)**, H7's own.

Sweeping the CLAIM rather than the routed wording turned up a **fourth** case the
spec never stated. `tests/unit/dream-vault-write.test.js:681-722` measures a
call-created directory whose `rmdirSync` fails for a reason that is NOT
non-emptiness: it is retained, named, and reported as what the platform said —
the test asserts the reason must NOT say "no longer empty", because a failed
removal is not evidence that a concurrent writer put something there
(`src/core/dream/vault-write.js:284-287`, `:300`). That is case **(d)**, H9's.
The H9 row and the Security checklist now state it.

The count therefore moved one → two → **four**, twice as arithmetic left behind
by a residual added elsewhere. The H7 acceptance criterion is now declared the
single counting surface, and the H7 row, the H9 row and the H9 criterion all
defer to it instead of repeating a number. A new Mirrored Surface Checklist
bullet registers both counts (three defects, four bounded cases) with their
owning surfaces.

## Discovered, NOT fixed — outside this pass's boundary

**`docs/specs/WP-dream-promote-in-workspace.md:207` (row C1) is now incomplete.**
It reads: *"No CONTENT is written to the vault; what a refusal may leave behind
is bounded by the primitive's H9 — empty directories the call created are
unwound, one that acquired content is left and named — and this row does not
restate that bound."* With case (c) raised, a refusal can also leave the
primitive's staging object holding the REFUSED payload, which is H7's bound, not
H9's — and it sits where that consumer's own `git add -A` would sweep it into a
commit. The cell cites the wrong row and its "No CONTENT" clause is now arguable.
That spec is live and outside this amendment's Deliverables; the fix belongs to
its own pass.

**`WP-dream-vault-write-primitive`'s citation of `src/cli/dream.js:254-280` has
drifted.** The spec pins its tree at `025021f`, where that range was the reap's
`} finally {` block. `src/cli/dream.js` gained 16 lines in the merge, so on
`main` @ `42b83a1` the same block is at `:268-295` and `:254` now lands
on an unrelated dirty-tree probe. The citation is not wrong — it is pinned, and
the spec's Dispatch precondition says citations are re-run against the tree the
implementer finds. Re-pinning the spec forward is a separate decision for the
owner, not a silent edit inside a three-item amendment.
