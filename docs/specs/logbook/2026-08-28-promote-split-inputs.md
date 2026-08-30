---
title: Split inputs — WP-dream-promote-in-workspace
date: 2026-08-28
related_wps: [WP-dream-promote-in-workspace]
---

# Split inputs — WP-dream-promote-in-workspace

The parent spec (`docs/specs/WP-dream-promote-in-workspace.md`, Draft) splits
along the seam ruled at the Ready-flip gate and recorded at the tail of
`docs/specs/logbook/2026-08-21-dream-promote-pair-review-rounds.md`: Tables
C/D/E/R become a promote package that ships consumed by nothing, Table G
becomes the pipeline package. This entry records the split's REMAINING inputs
— the two that lived only in owner-channel prose until now, and pointers to
the rest — so the split author needs nothing beyond the repo.

## Dispatch precondition (owner-ruled 2026-08-28)

**The containment semantics are stated canonically in the split text before
either package dispatches.** The shipped truth is kernel-faithful resolution
plus `(dev, ino)` identity — owned by the vault-write primitive's Table H
(`docs/specs/done/WP-dream-vault-write-primitive.md`) and implemented in
`src/core/dream/vault-write.js` and `src/core/dream/workspace.js`. The split
text CITES the owning surface and never paraphrases a path-containment rule:
the lesson (recorded in `memory/lessons/inbox.md` under
`WP-dream-workspace-retarget`) is that every string answer to "is this path
inside that directory" is wrong, and re-deriving the rule in prose is how
eleven review rounds get paid for twice.

## Routed inputs, with their canonical records

1. **The Part i implementer's three spec-modification requests** — PR #23's
   body (`gh pr view 23 --repo felho/wienerdog`), section "Amit még találtam"
   and the lessons block. Routed to this split by the owner; they concern the
   surfaces the split inherits (the containment rule's spec-side statement,
   the `vaultDir` option's semantics).
2. **The C1-row bound defect** — the parent's C1 row bounds refusal leftovers
   by H9 alone; the staging-object case is H7's bound. Recorded in
   `docs/specs/logbook/2026-08-28-vault-write-spec-amendment.md` (and PR #28's
   body). Fixed in the split text, not patched in the parent.
3. **Both dependencies are Done** — `done/WP-dream-workspace-retarget.md`,
   `done/WP-dream-vault-write-primitive.md`; `depends_on` and every citation
   re-pin to the current main tip per the parent's own dispatch block (the
   line shifts from the two merges are certain, not hypothetical).
4. **Canonical surfaces to cite, never restate:** the fixture-control channel
   and the child-PATH contract (`done/WP-dream-workspace-retarget.md`,
   Table B), the write contract (`done/WP-dream-vault-write-primitive.md`,
   Table H).
