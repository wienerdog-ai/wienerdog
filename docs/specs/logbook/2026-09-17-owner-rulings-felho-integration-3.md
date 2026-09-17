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

## 3. The review backend and model

Given mid-session, after the orchestrator reported that every design round so
far had run on `gpt-5.6-sol` through a `codex exec` recipe and asked whether to
continue that way:

```text
Do not use llmp. Use either the Codex plugin or Herdr. Also, use the Astra
model, not Sol.
```

**What it carries.** A direct ruling. From that point every independent gate in
this session runs through the Codex plugin (`adversarial-review` for design,
`review` for a PR) with `--model gpt-6-astra` passed explicitly, in a detached
worktree, with `CODEX_HOME` unset so the default home applies. The earlier
recipe pointed at a separate review home that pins `gpt-5.6-sol`; it is not used
again. llmp was not in use at any point in the session.

**What it changed, measured.** Ten design rounds had already run on Sol. Each
spec Sol had closed or approved was given a confirming round on the plugin with
Astra before anything further was merged. Astra returned findings on all three,
each reproduced by executing production function bodies with mocked I/O rather
than by reading: `WP-dream-digest-omits-own-job-alerts` (already Ready on
`main`; re-opened and returned to Draft, its implementer paused),
`WP-dream-lock-stale-owner-loud` and `WP-dream-report-run-skips` (both held off
`main`). `WP-dev-descriptor-no-tree-hash` was reviewed on Astra only and approved
at round 1. The raws are preserved beside each spec's logbook entries with the
backend and requested model named in the file.

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

### WP-dev-descriptor-no-tree-hash (design gate closed 2026-09-17, round 1, `545df8bd`)

Three items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment.

**O1 — should a follow-on amendment record that
`WP-stance-authority-containment` landed, and should this WP carry it?**
ADR-0028's owner-signed 2026-07-25 amendment still calls that WP "in drafting"
and says "A7 is not closed", but it merged as `86d069e0` on 2026-07-26; it also
cites `launcher.js:309` for a reader now at `:334`. *Recommendation adopted:*
yes to the amendment, no to this WP carrying it — a separate docs WP. *Overrule
cost:* listing the ADR here puts a Sonnet implementer inside an owner-signed
document and turns an S into an M; not amending at all leaves the signed record
describing a closed violation as open.

**O2 — is ADR-0042's `tests/red-proofs/*.proofs.json` lane right for a WP this
size?** The two newest Done specs use a narrative regression criterion instead.
*Recommendation adopted:* yes — all three mutations are single-line exact
substrings against one suite. *Overrule cost:* drop the declaration file and
its criteria and revert to a hand-pasted red/green pair; one commit, no
redesign.

**O3 — does the weakened urgency change priority?** The maintainer's install is
prod stance today, so the defect is latent there and live only on dev-stance
installs. *Recommendation adopted:* ship — four lines implementing §1 of an
owner-signed amendment, removing a documented idempotency violation. *Overrule
cost:* `writeDescriptor` stays non-idempotent on every dev install and the
ENOENT-becomes-refusal path stays live for `git clone` installs.

### WP-dream-report-run-skips (design gate closed 2026-09-17, round 4 approve, `2d5e2465`)

Five items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment.

**O1 — Which arms the report counts, and what each bullet may promise.**
*Recommendation adopted:* all six counts, one bullet each, and **every bullet
says only what the collector can deliver**. Two promises were removed after a
reviewer executed the collector and reproduced them as false: **no bullet claims
a session was skipped for the first time** (a re-quarantine re-enters that
count, so the bullet states this run's decision — set aside now, skipped from
now on until it changes), and **no deferral bullet promises a retry** (a session
memoised as oversized behind a capacity or deadline stop is counted as deferred
and then passed over from its memo unparsed, so the three deferral bullets say
Wienerdog will *consider* it again and name the oversized outcome as possible).
The oversized bullet names all three releases — session changes, Wienerdog
updated, `dream_max_input_bytes` raised past the measured size — and that each
earns a re-measurement that may still find it too big. *Overrule cost:* merging
the deferral bullets hides two causes and their knobs; dropping oversized leaves
the one permanently-passed-over class with no durable surface; restoring either
removed promise puts a sentence in the user's vault that the collector
contradicts.

**O2 — Reword the `reports/warnings.md` pointer now it has non-quarantine
neighbours?** *Recommendation adopted:* no — keep the shipped sentence and scope
its promise lexically ("skipped" only in the two quarantine bullets and the
pointer). *Overrule cost:* one promise gets two wordings across the report and
the digest banner, and both full-string identities plus RED proof 1 are
rewritten.

**O3 — List oversized sessions in `reports/warnings.md`?** *Recommendation
adopted:* no; out of scope, nothing filed — the memo is deliberately not a
quarantine (ADR-0023 Amendment 3) and that file is a pure render of the ledger's
quarantines (Amendment 2). *Overrule cost:* a new WP against
`src/core/dream/warnings.js` plus an ADR-0023 amendment, and this package's
pointer rule re-decided.

**O4 — Durable per-run accounting for zero-admission runs?** *Recommendation
adopted:* yes it should exist, **not in this package** — every carrier reopens
ADR-0012 (a vault write on a run that makes no commit) or the ratified
failure-message text. *Overrule cost:* the package gains a second subject and
write path mid-review; accepting leaves the gap until its own WP, the
191-session first-contact run being the visible instance.

**O5 — Suppress the pointer when the warnings file's currency is unconfirmed?**
*Recommendation adopted:* no flag — measured, the refresh result exists before
`promote()` only when the run minted a new quarantine, so a flag would suppress
the pointer on every run whose quarantines are all pre-existing. *Overrule
cost:* either the pointer disappears from the main case, or this package absorbs
an edit to `WP-quarantine-warnings-file`'s refresh points and an ADR-0012
ordering question; accepting leaves a pointer that can name an absent or stale
file while its counts stay exact, repaired by the next successful refresh.
