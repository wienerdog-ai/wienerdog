---
date: 2026-08-02
title: One shape is not one work package — the forward-time ownership provenance WP split after three gate rounds, and the split line was the one it had drawn itself
related_wps: [WP-managed-block-insertion-anchor, WP-symlink-authorship-identity, WP-147, WP-153]
---

# One shape is not one work package (2026-08-02)

**What happened.** The 2026-08-02 wave closed two `Done` specs with an
owner-approved residual each, and both residuals had the same *shape*: the
manifest records what an artifact **looks like** but not enough to prove
**we made it**, so `uninstall` can delete something the user made.

- **WP-147** (managed block): the manifest records the separator's shape
  (`sepBefore`/`sepAfter`) but not its position, so a relocated block's
  surrounding bytes cannot be attributed. Routed to
  **`WP-managed-block-insertion-anchor`**.
- **WP-153** (skill symlink): the manifest records the link's target, and target
  equality is not authorship, so a user's same-named link resolving to our source
  is deleted. Routed to **`WP-forward-time-ownership-provenance`**, with WP-153's
  architect adding the routing call *"ONE WP covers both […] — they are the same
  shape (record more identity at forward time so ownership survives later user
  edits) — with a note it may split in review if the two mechanisms diverge."*

The consolidated WP was drafted under the second slug on 2026-08-02, went through
**three Codex design-gate rounds** (11 findings, 3 of them high), and was split
at the pre-cut line it had carried since round 1. **The consolidated file was
deleted** — the split abandons no design, so `Superseded` (which
`docs/specs/README.md` scopes to *"a spec whose design is abandoned rather than
shipped"*) does not apply. This is the same handling `WP-a10-supervisor-race-close`
got when it split (`6ca7d2f`): file deleted, rationale in the logbook.

## The two successors

| | Part A | Part B |
|---|---|---|
| slug | `WP-managed-block-insertion-anchor` | `WP-symlink-authorship-identity` |
| mechanism | a bounded context hash of the bytes preceding the inserted separator, plus a uniqueness test | `lstat` device/inode recorded at creation, plus an explicit `origin` (created vs adopted) bit |
| `depends_on` | `[WP-147]` | `[WP-153, WP-managed-block-insertion-anchor]` |
| size | M | S |
| owner ruling | **required before `Ready`** | **required before `Ready`** |

**Part B depends on Part A for merge-ordering, not for design.** The two
mechanisms are independent. What couples them is three **shared, additive** hunks
— the `manifest.js` module doc comment, its `@typedef ManifestEntry`, and the
`shared.js:5` core import — which Part A writes in an `a` form and Part B
extends. Running them in parallel is a merge collision, exactly as WP-153 found
against WP-147.

## The routing name that no longer exists

`docs/specs/done/WP-153-target-aware-symlink-reverser.md` routes its residual to
`WP-forward-time-ownership-provenance` in four places (`:514`, `:868`, `:1274`,
`:1286`). **Those are not edited.** A `Done` spec describes the code it shipped,
and the ROADMAP-retirement precedent is explicit that *"historical mentions
inside `done/` spec bodies … are inert records — deliberately NOT edited"*.
**This entry is the bridge**: the WP-153 residual lands in
`WP-symlink-authorship-identity`. `WP-147`'s own routing prose is luckier — it
already names `WP-managed-block-insertion-anchor`, so Part A reclaims that slug
and those pointers resolve without help.

**The retired slug is not to be reused.** Nothing mechanical forbids it —
ADR-0029 scopes id uniqueness to files that currently exist — but rebinding that
name to different work would silently falsify a `done/` record.

## Why it split, stated as the thing to learn

**The routing call was right that the mechanisms share a shape. It was wrong that
a shared shape makes one work package.** What a WP is sized by is not its idea
but its *contract surface*, and the two halves shared almost none of theirs:

- **Different failure semantics.** A withheld separator strip leaves whitespace;
  a withheld unlink leaves a file. One is cosmetic, the other is an uninstall
  completeness cost.
- **Opposite validation posture, for a reason that is not symmetric.** A
  malformed `anchorBefore` must **not** be type-gated — rejecting the entry
  upstream would leave the managed block installed forever. A malformed
  `dev`/`ino` **must** be type-gated — rejecting the entry preserves the link,
  which is the safe direction. The same schema table, opposite decisions.
- **Each half carries its own owner ruling, over different costs.** Part B trades
  uninstall completeness for safety on *files*; Part A does the same on *bounded
  whitespace it authored itself*. WP-153 established that direction is the gated
  register. **This bullet originally read "only one half carries a ruling — Part A
  trades nothing", and that was wrong**: Codex round 4 finding 2 showed Part A's
  withhold cases leave separators shipped code removes, which is a new cost by the
  repo's own *"may not be worse than the code it replaces"* rule. Splitting still
  helped — the two ledgers are over different artifacts and decide independently —
  but the reason is separability, not that one half was free.

**The measurable tell was test-row growth under review.** Eleven rows at draft,
fourteen after round 1, eighteen after round 2 — none removed, because every
round found a real case. The spec recorded that pressure from round 1 and
hardened its own recommendation each round ("splitting is defensible" → "split
it" → "a round 4 should split first"). **Codex round 3 then invoked the spec's own
rule back at it** — *"Split the WP before adding the missing symlink-shape
rows"* — and the coordinator concurred. The rule worked; what it cost was two
rounds of revising a document that was already over the line.

**The lesson, and it is a sizing lesson, not a review one:** when a routing call
says *two residuals, one mechanism, one WP*, the question to ask is not "is it
the same mechanism?" but **"do they share a contract table, a failure mode, and a
ruling?"** Here the answer was no on all three, and it was answerable on day one —
the consolidated draft's own Split plan named the divergences in its first
revision. **A pre-cut split line is good practice; drawing it and then not cutting
is the defect.** Cut when the line is drawn, not when a reviewer points at it.

## What the three gate rounds produced that survives in both parts

Recorded because the split must not lose it — this is why the successors carry the
evidence and the consolidated file could be deleted rather than filed:

- **Round 1 (2 high).** A hash match alone is not a position proof — the
  duplicate-window move defeats it, with no forgery and no collision. The
  architect's *first* repair (a `candidate.length <= ANCHOR_WINDOW` shortcut) was
  measured red on the same fixture and is recorded as rejected. And `(dev, ino)`
  is neither permanent nor unrecyclable, which the draft admitted in one section
  and denied in another.
- **Round 2 (1 high).** The uniqueness corpus still contained Wienerdog's own
  separator bytes, so a file whose entire content was `"\n"` restored as `"\n\n"`
  — an **ordinary-path** regression against shipped, found by a reviewer reading
  a corpus definition rather than a behaviour. Also: the verify→unlink race,
  declared and pinned rather than claimed closed, following ADR-0028's
  *"not claimed as TOCTOU-free"* precedent.
- **Round 3.** The header still claimed a "full close" that three declared
  residuals contradicted; the accepted schema shape space was 20 combinations,
  not the 6 the spec enumerated; and a residual the spec had called unpinnable
  was pinnable. **Two of the three were mirror misses** — the fix had landed in
  one surface and not in its canonical table — which is the failure ADR-0031's
  Mirrored Surface Checklist exists to prevent and which a full mirror sweep now
  closes in both successors.

**A pattern worth naming across all three rounds:** every high finding was a
claim the spec made about its own strength — "the anchor proves position", "row
4b has no completeness cost", "this is a full close". None was a bug in a
mechanism. **Overclaiming is the failure mode of a spec that has survived
several review rounds**, because each round's fix arrives with confidence
attached. The countermeasure that worked was measurement: every rejected design
in both successors is recorded with the fixture that reddened it.
