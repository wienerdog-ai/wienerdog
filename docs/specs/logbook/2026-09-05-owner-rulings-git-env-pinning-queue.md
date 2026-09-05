---
date: 2026-09-05
title: "Rulings: the git-env-pinning queue and the night session's merge authorization"
related_wps: [WP-dream-git-env-pinning]
---

# Rulings: the git-env-pinning queue (2026-09-05, night session)

**One instruction from the owner governs this session.** It is quoted verbatim
so this record stands on its own.

At the session's resume, after a context clear and the orchestrator's report
that the queue head is `WP-dream-git-env-pinning` and that merge authorization
had not been restated:

```text
Great. Please proceed with the queue. Note that I will go to sleep soon, and you
will be on autopilot. Accordingly, try and get as much done as possible. You
have merge authorization for this session. And remember to follow the playbook
of the project, including the double gate reviews and using subagents.
```

**What it carries.** "Proceed with the queue" continues `docs/HANDOVER.md`'s
status pass #6 order (`WP-dream-git-env-pinning` first) under the process the
2026-09-05 rulings records settled: *the maturing architect records a
recommendation with the cost of overruling it, and the session may dispatch
under that recommendation, the owner reversing any of them by dated amendment.*
`WP-dream-git-env-pinning` is the first queue item whose stub names an **owner
product decision** as its item 1 — pin, don't pin, or pin-with-exceptions. The
owner was told, in the report this instruction answers, that this item is an
owner product decision dispatchable under a recommendation, and answered
"proceed"; so the decision is taken under the standing process, **recorded as a
recommendation adopted under standing authorization and not as a direct
ruling**, with its overrule cost stated where the decision is recorded (ADR
paragraph and spec). A direct ruling, if the owner gives one on waking, will be
recorded apart from this, as `2026-09-05-owner-rulings-audit-d-derived-headers.md`
was.

**Merges are authorized for this session only**; the next session needs it
restated, as every status pass since 2026-09-02 has recorded.

## Items dispatched under the standing process

Appended as the design loop parks them (escalation (ii) items, if any), each
with the recommendation adopted and the overrule cost as the spec states it.

### Appended 2026-09-05 after the maturing pass (spec revision `88172a13`)

Two items, both **recommendations adopted under the standing process above**, not
direct rulings. **Their text and their enumerated overrule costs live in ONE
place** — the spec's `## Dispatch precondition — owner items` — and are cited
here rather than restated, because the last queue's record had to amend itself
when the costs it quoted turned out understated. The owner reads them there
before reversing either.

1. **O1 — the product decision: PIN, by construction, at the pipeline seam.**
   The run's own git calls get an environment built from the named allowlist in
   the spec's **Table U**; every inherited `GIT_*` is thereby absent, and the
   run's own `GIT_INDEX_FILE` is added for the private-index shapes exactly as
   today. The principle drawn, and the reason it is not the hook suppression
   `WP-dream-promote-in-workspace` Table W row W1 rejects: git's **config files
   and hooks are the user's standing instructions and stay honoured** (`HOME` and
   `XDG_CONFIG_HOME` are carried), while the **launching process's environment**
   redirects our own act's target and is not a configuration surface. Measured
   support for the asymmetry: an environment-injected `core.hooksPath` fires a
   hook the user never configured, and an environment-injected `core.fsmonitor`
   **executes an arbitrary script** inside the run's own `write-tree`. Reversing
   this is the spec's overrule cost (a) or (b).
2. **O2 — the second git spawn point stays with a successor.**
   `assertGitRepo`'s call through `validate.js`'s own `git()` is a **named
   residual** of that WP, owned by the new Draft stub
   `WP-dream-git-env-validate-seam`, rather than folded in — which is what keeps
   the package at S and inside the `≤ 8 files` sizing bound. Measured: with
   `GIT_DIR` exported elsewhere that invocation exits 0 for a directory that is
   not a repository. Reversing this is the spec's overrule cost (c).

**No item was parked by the design loop under escalation (ii): round zero
produced no finding that argues against the recommendation.** The six round-zero
findings are all machinery or citations and are recorded, with what changed, in
`2026-09-05-git-env-pinning-design-gate-rounds.md`.

### Appended 2026-09-06 after design-gate round 1 — one PARKED item (escalation (ii))

Round 1's hermetic shadow (finding F2, band A) argued that carrying `HOME` and
`XDG_CONFIG_HOME` verbatim from the launching shell preserves an arbitrary-code
channel, since a selected config may carry `core.fsmonitor`. Two of its facts
were right and were fixed rather than argued with: `HOME` is now carried **as
`paths.home`**, the run's bound home, and `XDG_CONFIG_HOME` is **not carried**.
The second half is a product call, so it is parked here.

**O3 — `XDG_CONFIG_HOME` is NOT carried by the run's constructed git
environment** (the third item of this queue, numbered to continue the two
above). Recommendation adopted under the standing process above.
*Why:* `run-job`'s `ENV_PASSTHROUGH` does not carry it either, so dropping it
is exactly what makes *"a manual dream behaves like the scheduled one"* a
true sentence rather than an aspiration — and carrying it in the manual path
alone would recreate the divergence this WP exists to remove. *The cost, and
it is real:* a user whose global git config is relocated **only** by
`XDG_CONFIG_HOME` does not have it applied to the run's own git calls, in
either mode. That is already the scheduled run's behaviour today. A
`HOME`-resolved `~/.gitconfig` still applies, and this is measured in both
directions (carried → a `core.fsmonitor` in that config runs during the
pinned `update-index` and `write-tree`; not carried → it runs during none of
the nine). *Overrule cost:* the reversal is **"carry it in BOTH surfaces"**,
never in this one alone — `src/cli/run-job.js` joins the Deliverables with a
new `ENV_PASSTHROUGH` entry, Table U row U3 flips to CARRIED, AC1's key→value
map and its unset fixture change, and the ADR amendment and the design-gate
record follow. The spec's `## Dispatch precondition — owner items` carries
this text; it is cited here, not restated, for the reason the previous
append gives.

### Amendment, 2026-09-06 (after design-gate round 2) — the O1 entry above is superseded on one clause

Round 2's hermetic shadow (finding F2, band B) found that the **O1 entry above
still says `HOME` and `XDG_CONFIG_HOME` are carried**, which contradicts O3 and
Table U row U3 as adopted after round 1. This record is append-only, so the
sentence stands where it is and is corrected here.

**The adopted state, and the primary spec's `## Dispatch precondition — owner
items` governs it:** `HOME` is **carried, taken through `getPaths().home`** —
the run's single authority for the home the vault, state directory and config
roots all derive from, and the same value `buildCleanEnv` gives the scheduled
child. `XDG_CONFIG_HOME` is **NOT carried** (owner item O3, appended above).

**Two claims in the O1 entry's own reasoning are also withdrawn**, with the
measurements that falsified them recorded in the spec's *"Why Table U is what it
is"* section: that `HOME` is *never* the launching shell's string (with `HOME`
set, it is), and that an environment lying about `HOME` *relocates the whole
product* (measured: with the four `WIENERDOG_*`/`*_DIR` overrides set, changing
`HOME` leaves every root but `home` itself identical). **The recommendation O1
records is unchanged and the adoption stands on it, not on those two
sentences** — `HOME` is carried because it is where the user's own git
configuration lives and O1 declines to override the user's configuration. That
is a trust decision, stated as one.
