---
date: 2026-09-17
title: "Rulings: the third fork integration, the ratification wording, and the session's merge authorization"
related_wps: [WP-dream-live-owner-lock, WP-dream-filtered-input-budget, WP-dream-primary-dialogue-filter, WP-dream-digest-omits-own-job-alerts, WP-dream-report-run-skips]
---

# Rulings: the third fork integration (2026-09-17)

Two instructions from the owner govern this session. Both are quoted verbatim
so this record stands on its own. They are **transcribed by the orchestrator,
not owner-typed**.

## 1. The request that opened the session

```text
Please check out Felho's fork. He implemented some fixes for the dreaming process
and also filed a new WP related to the dreaming process:

https://github.com/felho/wienerdog/blob/main/docs/specs/WP-dream-primary-dialogue-filter.md

Read his WP, and if you agree with it, let us add it to our backlog. Merge over
his completed items from his fork to our branch, Once done, take a look at the
backlog and propose an implementation order.
```

The orchestrator opened PR #245 (`integrate/felho-main-3`, 51 commits, clean
merge) and held the merge on one question: the two 2026-09-15 amendments to
ADR-0012 and Amendment 3 to ADR-0023 arrive worded "the owner ratified" /
`ACCEPTED — OWNER-RATIFIED 2026-09-15`, where the fork's logbook shows that owner
to be the fork's owner. The orchestrator asked whether to ratify as-is or to
reword and add an upstream signature.

## 2. The ruling and the authorization

```text
1) let us treat owner-ratified and owner-signed as equals, they stand for the
same thing

as for the rest of your points, execute them in your proposed order. You have
merge authorization in this session. Also, remember to follow the playbook of
this project (double gate approvals, etc.)
```

**What it carries.**

- **`OWNER-RATIFIED` and `OWNER-SIGNED` are equivalent markers.** The three
  amendments stand on upstream `main` as written; PR #245 merged as `b4af715e`
  with no rewording. This is a direct ruling.
- **The proposed order is adopted.** As reported to the owner before this
  ruling: (1) merge #245, done-flips, lessons, HANDOVER pass; (2)
  `WP-dream-digest-omits-own-job-alerts`; (3) a new small WP making a stale
  `busy` dream lock loud; (4) a wd-architect re-derivation of
  `WP-dream-report-run-skips`, then its implementation; (5) the primary-dialogue
  work, split into a deterministic projection and a model relevance stage, the
  second gated on an offline evaluation of the first; (6) a parallel lane with
  no dream-file overlap; (7) the stubs and the Windows-blocked package last.
- **Owner items inside those packages** are taken under the standing process
  recorded in `2026-09-05-owner-rulings-git-env-pinning-queue.md`: the maturing
  architect records a recommendation with the cost of overruling it, the session
  may dispatch under that recommendation, and the owner reverses any of them by
  dated amendment. Each is **recorded as a recommendation adopted under standing
  authorization, not as a direct ruling.**
- **Merges are authorized for this session only**; the next session needs it
  restated.

## Items dispatched under the standing process

Appended as each design loop parks them, each with the recommendation adopted
and the overrule cost as its spec states it.
