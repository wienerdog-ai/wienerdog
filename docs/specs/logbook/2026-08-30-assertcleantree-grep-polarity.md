# 2026-08-30 — the `assertCleanTree` grep's polarity, and the rule behind it

**Subject:** `WP-dream-promote-in-workspace`, one verification step inverted.
**Status:** owner ruling, applied in the implementer's own PR. Second amendment
to this spec in the same PR; the first granted a Deliverables row.

## What the implementer hit

Two surfaces of the same spec gave opposite instructions, and an implementer
following the contract would have shipped a red verification step.

| Surface | Says |
|---|---|
| Row **G3** | the abort keys off `sawUnknownCommand` AND an empty `computeDelta` result, **"never off the vault"** |
| Row **G6** acceptance criterion | the guard discriminates a genuine rejection from a working run **"without reading the vault"** |
| Row **G6** prose | "The SECOND consumer of `assertCleanTree` does NOT go" |
| Implementation notes | "deleting both, or neither, are both wrong" |
| Verification step | `grep -q "assertCleanTree" src/cli/dream.js` — a PRESENCE check |

The contract rows and the criterion agree: after the re-base the guard reads no
vault. The prose and the step read as "keep the call". They cannot both hold —
**after the re-base there is no vault read left to grep FOR.**

## The rule the ruling states

**When a contract requires a call to disappear, its verification step asserts
the ABSENCE.** A presence check inherited from the pre-contract shape is a
mirror the contract has already falsified, and it fails in the worst direction:
it is green on the unchanged tree and red on the correct implementation, so it
rewards not doing the work.

## The distinction that survives

"Re-based" was the ambiguous word, and the ruling fixes what it COSTS:

- The **CONSUMER** is the unknown-command non-vacuity **GUARD**. It survives.
- The guard's **CALL** to `assertCleanTree` does not — **replacing that call is
  exactly what re-basing the guard means.**
- So: **deleting the GUARD is wrong; keeping the CALL is wrong.** The earlier
  "deleting both, or neither, are both wrong" was true of the two CALLS and read
  as being about the two consumers.

## What changed

The step is now, with the same absence-guard the `precommitSessionEdits` step
already carries (grep on a missing file exits 2, which `!` would turn into a
false green):

```bash
test -f src/cli/dream.js && ! grep -q "assertCleanTree" src/cli/dream.js
```

**Every mirror was swept in the same pass** — which is the part this class of
inversion has previously not done, and the reason `scripts/mirror-walk.js`
exists: row G6's prose, the Implementation-notes bullet, the row G6 acceptance
criterion, the red-proof bullet under Verification steps, and the note
classifying what the grep is worth.

**One RED proof was WITHDRAWN rather than reworded.** The criterion was "proven
RED against an implementation that deletes both `assertCleanTree` uses". Once
the correct implementation has no such use, that is not a mutation at all and
the criterion cannot fail on it. The RED moved to **dropping the guard's DELTA
half and aborting on the marker alone** — the vacuity that actually matters,
because the marker is attacker-influenceable and a guard resting on it alone
re-opens the nightly retry-DoS a writing run was protected from.

Current state's `:508` / `:251` citations are unchanged: they describe the tree
this package starts from, which the amendment does not move.
