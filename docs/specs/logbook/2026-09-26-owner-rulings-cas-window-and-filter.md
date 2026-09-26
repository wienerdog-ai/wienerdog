---
date: 2026-09-26
title: "Rulings: keep the CAS-window re-cut, supersede the dialogue filter, show the carried phrases"
related_wps: [WP-vault-write-cas-window, WP-dream-primary-dialogue-filter]
---

# Rulings of 2026-09-26 (a later message the same day)

Quoted verbatim so this record stands on its own. **Transcribed by the
orchestrator, not owner-typed.** The two earlier rulings of the day are in
`2026-09-26-owner-ruling-opus-high-tier.md` and
`2026-09-26-owner-rulings-queue.md`.

```text
1) keep the disclose-only re-cut
2) supersede
3) please show me what phrases were carried
```

## What each line did

1. **"keep the disclose-only re-cut"** rules owner item 1 of
   `docs/specs/WP-vault-write-cas-window.md` ("Keep the re-cut: no link publish
   on the create arm") **in favour of the recommendation**. The re-cut stands:
   the check-to-publish window stays open on both arms, is pinned as a tested
   residual and is re-disclosed, and no `fs.linkSync` create-arm publish is
   built. The spec is already `Ready`; with item 1 ruled — the one item its
   Dispatch precondition says must be ruled before an implementer starts — it
   is **dispatchable**, subject to the dispatch-time re-verification of its
   citations. The message does not address owner item 2 (candidate 1 for the
   overwrite arm stays unbuilt), which by that spec's own text does not gate
   dispatch; it stays as written.
2. **"supersede"** rules the disposition proposed in
   `2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`
   ("Proposed disposition"):
   - `WP-dream-primary-dialogue-filter` is **`Superseded`** and moves to
     `docs/specs/done/`. No Sonnet relevance stage is built. The spec's own
     owner items 1–2 lapse with it (item 2 was moot once the first bullet of
     the proposed disposition was accepted).
   - **The deterministic strip is filed as a projection fix** against the Done
     contract of `WP-dream-primary-dialogue-projection`:
     `docs/specs/WP-dream-projection-harness-user-records.md` (`Draft`, a stub
     that has been through no design round).
   - **The first-pass novelty finding is filed as a candidate package**:
     `docs/specs/WP-dream-first-pass-novelty.md` (`Draft`, a stub that has been
     through no design round; it needs an owner product decision as well as a
     design round).
3. **"please show me what phrases were carried"** — a request, not a ruling.
   The orchestrator showed the owner, in the session, the phrases committed in
   `97e45ff0` (the commit that recorded the offline evaluation): topic-level
   descriptions of the sampled sessions, with no transcript text. This entry
   does not repeat them. Whether anything is purged — from the working tree or
   from history — is the owner's request to make; as of this entry it is
   **undecided**, and nothing was purged.
