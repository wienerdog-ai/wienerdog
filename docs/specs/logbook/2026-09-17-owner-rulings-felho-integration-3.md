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

### WP-dream-digest-omits-own-job-alerts (design gate closed 2026-09-17, round 7, `e545033c`)

Four items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment. **This
entry replaces the one recorded when the gate first closed at round 3**: a
confirming round on a second model re-opened the gate, and that earlier entry's
O3 rested on a premise the review then falsified. Seven rounds in all — three on
`gpt-5.6-sol`, four on `gpt-6-astra` through the Codex plugin — and the design
changed shape twice on evidence: the recovery re-render was removed at round 5,
and the filtered render was moved back under the dream lock at round 6.

**The design as it closed.** The existing end-of-run digest render stays exactly
as on `main`, unfiltered. One additional, filtered render is the last statement
of the locked body — after the workspace teardown, before scratch cleanup and
lock release — so it runs only when the body and the teardown succeeded, while
this process still holds the dream lock. A record is omitted only if all three
hold: `WIENERDOG_JOB` resolves through `findJob` to `run: builtin:dream`; a
valid supervisor-minted run token is present; and the record's `at` is strictly
earlier than this process's start. There is no recovery mechanism.

**O4 — read this one first (new).** Is one more `digest.md` write per fully
successful supervised dream an acceptable added race window? `writeFilePrivate`
renames and then checks the destination's identity; **any** writer publishing in
that window makes it throw `WD_F10_POST_RENAME` — no attacker needed. An
attended `sync` is such a writer and takes no dream lock. The exposure is
**pre-existing** (the end-of-run render races it today); this WP adds one
window. Consequence, as measured: exit 1, `last_success` unchanged,
`last_status: error`, `clearAlerts` skipped, a `job "dream" exited 1` alert — a
false failure for a run whose work succeeded. *Recommendation adopted:* accept;
the fix belongs in `writeFilePrivate` or in serializing `sync`, each its own
package. *Overrule cost:* neither fix lives here; forbidding the second render
reverts to filtering at the end-of-run render and brings back everything round 5
removed.

**O3 — the digest and the dream's own failures.** After this WP a dream-job
failure's callout reaches the digest only through an attended `sync` or a later
dream's conditional early quarantine render, with no finite bound. The timely
channels are the fail-loud email, which is **best-effort**, and `wienerdog
alerts`; **`wienerdog doctor` reads no alerts at all** (measured: zero
occurrences). **Correction to the earlier entry:** a successful run proves only
that this run's dream body succeeded. For a prior run's surviving process group,
`clearAlerts` deletes every record for the job after the next supervised success
regardless — so the callout goes and the record goes. Most of that is
pre-existing; what this WP changes is **one render's worth of display**.
*Recommendation adopted:* accept both. *Overrule cost:* the fix is a
supervisor-side surface, which re-opens WP-041's prohibition at ADR level; this
spec would be superseded, not amended.

**O1 — environment, config and run token as the job's identity.**
*Recommendation adopted:* yes, all three conjuncts; the token adds no new
surface. Residual: possession is not parentage, and no token is minted on win32,
so the omission never engages there — the safe direction. *Overrule cost:* a
per-run state file proving parentage — a new writer, an uninstall obligation and
a new lifecycle. **O2 — a retry for the pre-dream containment probe.**
*Recommendation adopted:* decide separately; it stays out of scope. *Overrule
cost:* the package splits rather than grows.

**Two named residuals:** scratch cleanup is a bare recursive remove that can
still throw after the filtered render, so a run whose work succeeded can exit 1
with the filtered digest on disk; and the concurrent-`sync` case priced in O4.

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

### WP-dream-lock-stale-owner-loud (design gate closed 2026-09-17, round 7, `c33f1678`)

Six items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment. Seven
review rounds on two backends and two models (4+3+2+1 findings on `gpt-5.6-sol`,
then 2+1+1 on `gpt-6-astra`) shaped O1 and O4 in particular.

**O4 — read this one first. What the alert message tells a user to do.**
*Recommendation adopted:* the message instructs **no deletion**. Three drafts
tried to qualify one and each failed against the tree: "when no dream is about
to start" does not exclude one already running; "restart, then delete straight
away" targets exactly the moment boot catch-up (`RunAtLoad`, `Persistent=true`,
`StartWhenAvailable`) has just taken the lock over; a repeated message is read
from a log after the fact and identifies nothing; "nothing started recently" is
false because a scheduled dream may be configured to run for hours; and no
process-listing command can be stood behind on three platforms. The message
names the lock file and says removing it by hand is only safe while no dream is
running, so someone should check first. *Overrule cost:* restoring a deletion
instruction accepts that some users will delete a live owner's lock. The real
fix is an attended conditional-recovery command, routed under Discovered.

**O1 — six hours past the deadline before a `busy` decline becomes loud, with
two named costs.** *Recommendation adopted:* six hours — above any overrun a
same-day contender is likely to witness under the **default** configuration,
below a day so the next nightly run trips it. *Cost 1:* neither timeout is
bounded (`wienerdog schedule --timeout`, `resolveTimeoutMs`), so a legitimately
live **scheduled** dream can trip the gate; the consequence is an alert, never a
takeover. *Cost 2:* a restart taken on this message ends a working dream, and
that is **not** a clean rollback — promotion publishes paths one at a time
before the commit and `promote.js` declines to claim cross-path write-atomicity,
so the vault can be left half-published with the ledger unadvanced. These are
properties of any interruption of a dream, not introduced here. *Overrule cost:*
one constant and its tests; O1 also carries a ready stronger-warning variant of
the message.

**O2 — an absolute 24-hour cap** on how far ahead a stored deadline may be
before the record is refused as `owner-unknown`; a config-derived cap was
rejected because `dream_timeout_minutes` has no validated maximum. *Overrule
cost:* one constant; removing it restores unbounded silence. **O3 — hourly
repeat alerts once loud** (the cadence the shipped `owner-unknown` throw already
has). *Overrule cost:* a rate-limiting package blocking this one. **O5 — crash
recovery is attended, not automatic, when the dead owner's PID has been
reused.** *Overrule cost:* blocks this WP behind a lock-payload boot-identity
change. **O6 — no ADR beyond the dated ADR-0012 part-6 amendment**, which lands
with its Status line reading "ACCEPTED under standing authorization 2026-09-17 —
owner signature pending"; the owner adds his signature line himself.

**No wall-clock maximum is claimed for the silence before the first alert** —
only the sampling rule (24 h cap, 6 h bound, one local schedule day), with two
worked cases: 54 hours, and 55 across a daylight-saving fall-back. The realistic
case — default 20-minute deadline, a crash — is one lost night.

### WP-secret-sink-wiring-probes (design gate closed 2026-09-17, round 1 approve, `35e00e99`)

Two items. **Neither was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment. The
package is diagnostic and tests-only: it pins what nine `redactOnly` call sites
actually do and fixes nothing.

**O2 — read this one first. The whole-credential chunk leak.** Measured at four
per-chunk `redactOnly` sites, and independently reproduced by the design
reviewer through real subprocess pipes: a secret split across two stream chunks
is redacted by neither call, and the **whole credential lands contiguous** in
`logs/dream/<date>.log` and `logs/<job>/<date>.log`. The only record of approval
is the code comment at `src/core/dream/brain.js:504-508` (OWNER-APPROVED
2026-07-17), echoed at `src/cli/run-job.js:1048-1052`. It approves *not
buffering across chunks*, which is unchanged — but its wording, "may be only
partially redacted", **understates the measured behaviour**. *Recommendation
adopted:* treat it as approved but mis-described, not as a new approval; nothing
on record shows the owner approving the whole-credential behaviour, and both
comments need correcting by whichever package takes the fix. Exposure is
same-user (0600 files, 0700 directories). *Overrule cost:* ruling it a new,
unapproved exposure holds back the four probes that pin the largest leak until a
fix lands, leaving it the only leak with no test.

**O1 — may a diagnostic package commit seven tests that are green because the
product is broken?** Three pin a truncation leak (a value straddling the
2000-character field cap leaves a 24-character head in `alerts.jsonl` and
`run-evidence.jsonl`); four pin the chunk leak above. *Recommendation adopted:*
yes, in the named `(KNOWN DEFECT <id>)` form with a positive-presence assertion,
so that a fix turns them red and nobody reads green as safe. *Overrule cost:*
the seven leaks return to being findable only by reading the code.

### WP-dream-primary-dialogue-projection (design gate closed 2026-09-17, round 5 approve, `c94e0e66`)

Six items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment. This
package and the next are the split the owner adopted for
`WP-dream-primary-dialogue-filter`, which stays Draft, parked behind an offline
evaluation of their output.

**Item 3 — read this one first. User text stays `false` by role**, even when it
quotes tool output the model has just seen. That preserves today's rule
(`skills/wienerdog-dream/SKILL.md:101-105`: untrusted only when a supporting
message has role `tool_result`); it is not a new exposure, and the person is the
trust root. *Overrule cost:* after the first tool call in a session — nearly
every agentic session — nothing the person says in it could reach identity or
skills again, because every Tier-3 write requires `false`. Relatedly, **`false`
claims only that the harness attributed the record to the user role**: a
headless routine's prompt is measurably indistinguishable from a human one, so
`false` never means "a human typed this", nor that the content is true, verified
or safe to obey.

**Item 6 — an unrecognised content-block type taints the rest of the session**,
against a decided list of five Claude and three Codex block types, because the
block type is where Claude signals tool output; a renamed or case-shifted tool
result is the realistic failure, and an executable model found it before any
reviewer did. *The cost is a cliff with no diagnostic:* a future benign block
type such as `redacted_thinking` will taint every session containing it until
the list is updated. **Item 4** is the same rule for Codex `payload.type`, with
the same cliff and the same absence of a diagnostic.

**Item 1** — X bounds transcript intake, not model-visible output. **Item 2** —
Codex subagent rollouts supply no dialogue (32 of 50 sampled local rollouts).
**Item 5** — the tool-result scan is bounded to `message.content` at depth one,
with the deeper-nesting residual named. Assistant text is governed by a
monotonic taint state that never resets; `tool_use` does not taint.

### WP-dream-primary-dialogue-collection (design gate closed 2026-09-17, round 3 approve, `c94e0e66`)

Three items. **None was ruled on directly**; each is a recommendation adopted
under the standing authorization above, reversible by dated amendment.

**Items 1 and 3 — read these first. The package promises byte-policy
equivalence, not admitted-set identity.** Admission against X is measured on the
raw capped extract, so every byte-based admission decision stays today's. But
the collector also stops on a wall-clock preprocessing deadline, and projection
changes what parsing and writing cost — so **on a deadline-bound install the
admitted set can move in either direction, and more sessions can be admitted and
marked processed whether or not the consolidation agent read them.** That is the
shape of the large-backlog installs where the unread-but-processed problem
matters most. It is measured at dispatch, not designed away, and the two
redesign routes (a lower default X; a session-count bound) are priced.

**Item 2 — which provenance guarantees are code and which are prompt-only.**
Code produces the per-message flag, derives and refuses the skill-learnings
ledger's flag, and enforces the Tier-3 floor. **Propagating message flags onto
an ordinary note's frontmatter is prompt-only** — no code checks which messages
supported an ordinary candidate. That was equally true before; it is written
down because the new code-produced input makes it easy to mistake the whole
chain for code. The package also corrects a shipped inaccuracy: the dream skill
tells the model the orchestrator *raises* an understated flag, whereas the code
*refuses* the write.

The ADR-0020 amendment is a deliverable of this package's implementation and
lands with its Status line reading "ACCEPTED under standing authorization
2026-09-17 — owner signature pending"; the owner adds his signature line
himself. This package is dispatched only after both
`WP-dream-primary-dialogue-projection` and `WP-dream-report-run-skips` have
landed.
