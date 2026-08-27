---
title: Split ruling — the promote-in workspace package becomes a stacked pair
date: 2026-08-21
---

# Split ruling — the promote-in workspace package becomes a stacked pair

Spec before the split: `docs/specs/WP-dream-promote-in-workspace.md` at
`6e1f355` (517 lines, `status: Draft`, held undispatchable by its own SIZE
SELF-CHECK). The spec named its seam in advance so the split would be a
decision, not a discovery; this entry records the owner's ruling and the
decisions made while executing it.

## The owner's ruling (2026-08-21)

1. **Table F stays whole, in the first half, and the second half CITES it —
   never restates it.** Rationale: drift between two copies is the realer risk
   than citation resolution — the pair is stacked, so the second half is never
   dispatchable without the first being `Done`, and the cited table is always
   present and always current. The citation pattern is the one the package
   already uses for the delta primitive's constructed-environment recipe
   (row M2: "the dependency owns it"). Guard: the second half's Mirrored
   Surface Checklist registers a normative anchor — M10's closure rests on the
   git-free classification, never on any repository-status property — so its
   own review catches a mis-attribution without needing Table F inline.
2. **The reap precondition belongs to the second half.** The pre-split spec
   assigned it to both: the SIZE SELF-CHECK's Part i list named it, while the
   Deliverables table put it under Part ii's `cli/dream.js` row. The
   Deliverables were right: the precondition guards the post-brain
   `computeDelta` walk, which is the promotion pipeline's; the first half's two
   walks (copy-in, capture) run before any brain exists and need no reap. The
   first half's Table A carries the obligation as a named handoff.

## Decisions made while executing the split

- **The wiring gap, resolved by a transitional line.** The pre-split seam gave
  Part i no file through which to wire the spawn: `spawnBrain`'s write-target
  option is renamed by Part i, but its only production call site
  (`cli/dream.js:144`) was assigned wholly to Part ii — Part i as grouped
  would not even run. Resolution: Part i touches that ONE line, passing the
  vault as the explicit write-target argument, byte-identical behaviour. Each
  half therefore merges green on its own: Part i changes no behaviour
  (`tests/integration/dream.test.js` untouched), and Part ii replaces the
  transitional argument with the run's workspace — the line where the
  package's claims become true of the running product. This follows the repo's
  own precedent (the delta primitive shipped consumed-by-nothing) and replaces
  the pre-split "does not ship alone" framing, which would have put an inert
  dream on `main` between the two merges.
- **Table letters are package-wide.** Part i owns A, B, F; Part ii owns C, D,
  E and a new G (pipeline wiring, reap precondition, teardown wiring, abort
  paths — the rows that left Table A and Table E when their subjects moved).
  Cross-references between the halves keep resolving without renumbering.
- **Copy-in excludes symlinks, stated explicitly.** Implied before the split
  (Table F: the dependency's capture refuses symlinks), now a named exclusion
  row in Part i's Table A — a workspace the system builds must pass the
  capture the system is about to run on it, so following a symlink into the
  copy would fail the run the system itself constructed.
- **One wording correction to the original, made during the split:** Part i's
  Table B runnable form says "no element equal to, and no element containing,
  the vault path" where the original said "`vaultDir` (and any prefix of it)".
  Read literally, the original forbade every prefix of the vault path —
  including `$HOME`, and with it the workspace path itself — from appearing
  anywhere. The acceptance-criterion form was already the containing-element
  form; the table now matches it.
- **The two part-less "—" Deliverables rows assigned:** `docs/GLOSSARY.md`
  split one-name-each (workspace → Part i, promotion → Part ii); the
  `docs/adr/0012` amendment wholly to Part ii, because Part i changes no
  lifecycle.
- The split resolves the pre-split round zero's one undisposed blocking
  finding (the size ceiling). Each half now measures within
  `docs/specs/README.md`'s limits: Part i touches 5 files, Part ii touches 8.

## Resulting specs

- `docs/specs/WP-dream-workspace-retarget.md` — NEW, Part i: the workspace
  module, the constructed baseline, the six-site brain re-target, Tables A, B
  and F. Depends on `WP-dream-baseline-delta-primitive`.
- `docs/specs/WP-dream-promote-in-workspace.md` — REWRITTEN in place, Part ii:
  promotion, the four gates, the pipeline rewiring, Tables C, D, E and G.
  Depends on `WP-dream-workspace-retarget` (and the primitive).

Both remain `Draft`; moving either to `Ready` is the owner's or the architect
agent's move, after dispatch-time re-verification. Part ii's citations WILL
shift when Part i merges — its dispatch block names that shift as certain.

No round history is inherited from the pre-split spec's round zero: its
findings were dispositioned against the unsplit text. Anything still applying
must be re-found against these two.
