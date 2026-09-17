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

### WP-dream-digest-omits-own-job-alerts (design gate closed 2026-09-17, round 3, `545df8bd`)

Three items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment.

**O3 — READ THIS ONE FIRST. Is it acceptable that the dream's own failures lose
their after-the-fact digest callout?** This is the item most likely to want the
owner's eye, because it changes what a user sees.

*What is true today, measured:* a failed dream never reaches its digest render,
and `run-job` appends the failure record only after the child has exited
(`src/cli/run-job.js` l.1251 → l.1257 → l.1269). So the callout for a dream
failure is displayed by a LATER render — typically the next *successful* dream,
i.e. **after the failure has already been resolved by the very run that shows
it**. That after-the-fact, wrong-at-the-moment-it-is-shown warning is exactly the
2026-09-10 bug report this WP was filed for.

*What changes:* after this WP, that later successful render filters the job out,
so a dream-job failure's callout reaches `digest.md` only via **an attended
`wienerdog sync`** or **a later dream's early quarantine render** (conditional on
a new quarantine). **There is no finite bound on that.** The timely channels are
unchanged and are the **fail-loud email** and **`alerts.jsonl` / `wienerdog
alerts`**. **`wienerdog doctor` does not read alerts at all** — measured:
`grep -ci alert src/cli/doctor.js` returns 0, and the design gate independently
re-ran it.

*Recommendation adopted:* **yes, accept the loss.** Keeping the display means
keeping a warning that is wrong when shown; the only way to show a dream failure
in the digest while it is still unresolved is a supervisor-side render, which
WP-041 prohibits by name.

*Overrule cost:* this WP does not ship as drafted. The fix becomes a
supervisor-side notification surface, which means re-opening WP-041's prohibition
(an ADR-level decision, not a spec edit) or designing a standing warning channel
that is not the failure log — plausibly the same package as the
managed-policy-warning follow-up. Table A's principle survives, but the filtering
design and AC1 become moot and the spec is superseded rather than amended. A
smaller overrule — "ship the filter, and also give `doctor` an
unacknowledged-alerts section" — is a separate additive WP that this one neither
blocks nor contains.

**O1 — is the env-plus-config-plus-token channel trustworthy as job identity?**
*Recommendation adopted:* yes, with all three conjuncts — `WIENERDOG_JOB` naming
a job `config.yaml` defines as `run: builtin:dream`, **and** a valid-shaped
`WIENERDOG_DREAM_RUN_TOKEN`. The token was added in response to design round 1 at
zero new surface. The residual is stated in the spec and not closed: possession
of the token is not proof of parentage, and on win32 no token is minted so the
omission never engages there. *Overrule cost:* the remaining alternative is a
supervisor→child channel that proves parentage (a per-run file under `state/`),
which adds a `state/` writer, an uninstall obligation and a lifecycle to keep in
step with `clearAlerts`; Table A's resolution rows, the predicate sketch, AC3,
AC4, AC5 and three RED declarations are rewritten and the spec returns to
drafting.

**O2 — should the pre-dream containment probe get a single retry?**
*Recommendation adopted:* decide it separately; it stays out of scope. It changes
a fail-closed security check's semantics on a file this WP does not touch.
*Overrule cost:* if ruled in scope here, the Deliverables table gains
`src/core/dream/containment-probe.js` and its test file and the WP crosses into a
second concern, so per the sizing rule it splits rather than grows. Nothing in
Tables A, B or C changes either way.
