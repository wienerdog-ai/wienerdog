# 2026-08-30 — the pipeline package's Deliverables grant, and the rule behind it

**Subject:** `WP-dream-promote-in-workspace`, one Deliverables row added.
**Status:** owner ruling, applied in the implementer's own PR.

## What the implementer hit

Row G7 requires the EP2 revert core to be **unreachable** after the gate
extraction, and its acceptance criterion is proven RED "against one that leaves
the revert core reachable". The three spans the Deliverables cell names as
going — `validate.js:1325-1333` (revert, re-stage, index-drop),
`:1334-1338` (the refusal-reason suffixes) and `:1362-1364` (the `reverted[]`
accounting) — all sit inside `validateAndCommit`'s Step 3, re-verified on
`152ae3a` at a +1 shift from the spec's pinned base `36c2ce5`.

Removing them without removing the function leaves a validator that preserves a
flagged note and then commits it. So the function is **retired**, not reduced —
which is what Table V already says in six rows, each naming a Table G row or
another package as the inheritor.

`validateAndCommit` then has one consumer outside the Deliverables table:
`tests/unit/frontmatter-digest-differential.test.js:72`. It runs the validator
end to end to get the **validator half of a two-sided parity assertion** against
the digest classifier — deliberately, because (its own comment) "asserting a
property of the parser instead would not be the decision".

## The rule the ruling states

**When a contract retires a surface, the Deliverables table lists that
surface's CONSUMERS too.** A table that lists only the surface leaves its
callers red with no in-boundary fix, and the spec's own "a further file is a
finding, not a fix" then routes the implementer to a stop rather than to a
workaround — which is what happened, and is the behaviour the rule wants to
keep while removing the dead end.

## Scope, by measurement

Every consumer of `validateAndCommit` outside `src/` was swept:

| Surface | Kind | Disposition |
|---|---|---|
| `tests/unit/dream-validate.test.js` | calls | already a Deliverables row |
| `tests/unit/frontmatter-digest-differential.test.js:72` | calls | **granted here**, one exact file row |
| `tests/fixtures/dream/fake-brain.js:187,195` | COMMENTS | not granted; a comment is not a contract. Recorded under "Discovered issues" |

The grant is **one exact file row, never a directory prefix** — the precedent
and its reason are `WP-dream-workspace-retarget`'s amendment of 2026-08-27: a
trailing-slash row under `tests/unit/` would open the integrity guards this
family's designs exist to satisfy, and a boundary that can edit its own guard is
not a boundary.

## What changes in the granted file

The test is re-pointed at the extracted `tier3` gate, which **is** the
validator's Tier-3 decision after the extraction, so the parity assertion keeps
asserting a decision rather than a parser property. Nothing else about the file
changes.
