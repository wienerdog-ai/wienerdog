---
date: 2026-09-27
title: "Ruling: harness-authored Claude records — option (iii), and commission the flag-not-decline design"
related_wps: [WP-dream-projection-harness-user-records, WP-dream-projection-notification-taint, WP-dream-projection-done-spec-errata]
---

# Ruling of 2026-09-27 — harness-authored Claude user records

Quoted verbatim so this record stands on its own. **Transcribed by the
orchestrator, not owner-typed.** It answers the one product question in the
Dispatch precondition of `WP-dream-projection-harness-user-records` (now
`docs/specs/done/WP-dream-projection-harness-user-records.md`), whose design
round is `2026-09-26-projection-harness-user-records-design-review.md`.

```text
option 3, and commission the flag-not-decline design
```

## What it did

1. **"option 3"** chooses **(iii) Build nothing** on the decline rule, which
   was also the architect's recommendation. No field-keyed accept rule
   (the recorded Table H) and no safety net (the recorded Table G) is built,
   on either harness; ADR-0023 Amendment 5 stays an unapplied draft in the
   superseded spec and is not filed. Harness-authored Claude `user` records —
   task notifications, command echoes, `!`-command records, compaction and
   interruption records — keep reaching the dream as today. The Codex arm's
   pre-0.151 rollouts (round record §2.8) are untouched by this ruling; they
   stay routed as a separate candidate.
2. **`WP-dream-projection-harness-user-records` is `Superseded`** and moves
   to `docs/specs/done/`, with a banner naming this record and the two
   packages below. The rest of the file is left as history.
3. **"commission the flag-not-decline design"** commissions the narrower
   provenance design the superseded spec's recommendation named: do not
   decline harness-authored records; **flag** the records Claude Code
   positively labels as task notifications (`origin.kind` exactly
   `"task-notification"`) as `derived_from_untrusted: true`, so a subagent's
   result never reaches the dream flagged as the person's own words. It is
   filed as a new package, `docs/specs/WP-dream-projection-notification-taint.md`
   (`Draft`), and goes straight into a design round:
   `2026-09-27-projection-notification-taint-design-review.md`, whose STOP
   CRITERION is committed before the spec. Nothing in this ruling decides that
   design's details; its owner items travel with it.
4. **The Done-spec errata land as their own S docs package**,
   `docs/specs/WP-dream-projection-done-spec-errata.md` (`Draft`, docs only,
   implementable by anyone as a docs PR): **Erratum 8** — the Done spec
   `WP-dream-primary-dialogue-projection` says no field separates a `claude -p`
   prompt from a human one; the `promptSource` value does — and the measured
   half of **Erratum 9** — the worked example's mixed record shape occurs in 0
   of 11,884 array-valued `user` records. Option (iii)'s own text also said the
   Done spec's "Harness-authored and developer-authored instructions are not
   dialogue" sentence "stays false and is corrected by the docs package"; that
   correction is carried in the same package as **Erratum 7**, worded as a
   recorded gap.
