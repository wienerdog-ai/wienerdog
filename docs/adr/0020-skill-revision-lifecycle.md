# ADR-0020: Skill revision lifecycle — dream-created-only, recurrence-gated, quarantined learnings

Status: Accepted
Date: 2026-07-11

## Context

The nightly dream already **creates** skills from recurring task patterns
(≥ 3 distinct sessions → a draft `<skills_dir>/<kebab>/SKILL.md` with
`status: incubating`, promoted to `active` on re-observation; Tier-3 gate:
`confidence ≥ 0.85` AND `recurrence ≥ 3` AND `derived_from_untrusted: false`).
The next step is closing the loop: the dream should learn from how those skills
actually perform and **revise** them over time.

Competitor research (local memo, 2026-07-11) looked at two projects exploring
this space (Hermes Agent, OpenClaw). The single idea worth
adopting is Hermes's **provenance scoping**: an autonomous revision process may
only ever touch skills *it itself created*, tracked by an explicit write-origin
marker. In the versions we reviewed (July 2026) we did not find a defense
against **transcript-poisoning** of skills — an
attacker plants text in a `tool_result` (email body, web page) that, if the
consolidation pass obeyed it, would get instructions written into a skill that
every future session then loads. Closing that gap is a design goal of this ADR.

This ADR records the design (owner-approved 2026-07-11; hardened 2026-07-12 after
an adversarial review — see the Revision section) for how the dream accumulates
per-skill learnings and revises skill bodies, and the invariants that keep the
feature safe. It is implemented by WP-080 (invocation signal), WP-083 (skill
ownership registry), WP-081 (learnings accumulation + ledger validator), WP-084
(ledger evidence references + mechanical trust derivation), and WP-082
(recurrence-gated revision + code backstop).

## Decision

1. **Dream-created-only scoping is a hard invariant, enforced by a tamper-proof
   registry — NOT by the skill's own frontmatter.** Provenance is tracked by an
   orchestrator-maintained ownership registry `state/skill-registry.json`.
   `validateAndCommit` writes a registry entry ONLY at the moment it accepts a
   NEW skill draft from the brain — an untracked `SKILL.md` under the skills dir
   that passes the Tier-3 floor — recording it (path → `{created, id}`) AFTER the
   single dream commit succeeds. A skill body is revisable **iff** its path is
   present in the registry; a registry that is absent or lacks the entry → the
   body change is reverted (**fail closed**). The registry lives in `state/`
   (core mechanics, outside the vault): the dream brain's sandbox grants tool
   access to the vault and the scratch dir only (`--add-dir vaultDir scratchDir`),
   so the brain cannot write `state/skill-registry.json`; and interactive
   sessions only ever write the vault. Neither of the two forgery pathways can
   therefore manufacture revision authority. **`HEAD` frontmatter is rejected as
   the authorization source because it is forgeable:** ADR-0012 commits
   interactive-session edits BEFORE the brain runs, so `HEAD` at validate time
   already contains anything a session — or an injected assistant turn — wrote,
   including a hand-added `origin: dream` label on a skill the dream never
   created. `origin: dream` frontmatter REMAINS as a human-readable provenance
   convention (the dream still stamps it), but it no longer gates anything.
   User-authored, imported, and shipped `wienerdog-*` skills are never entered in
   the registry; a `wienerdog-*` folder name is additionally refused by the code,
   independent of the registry (defense in depth). Proposals to change a shipped
   skill continue to go in the dream report only, never into the skill.

2. **Learnings are quarantined data AND a structurally-validated authorization
   input.** The dream accumulates per-skill observations (failures, corrections,
   workarounds, better approaches) in a sidecar `<skills_dir>/<name>/LEARNINGS.md`
   ledger. As data it stays quarantined: never injected into any session digest,
   never referenced from the skill's `SKILL.md` body (so no harness ever loads it
   as instructions), and never copied verbatim into a skill body. Each entry
   carries a stable `Pattern-Key` (`area.symptom`), a recurrence count with
   distinct session ids, First-/Last-Seen dates, and a mechanical
   `derived_from_untrusted` marking (true if any of the entry's substance came
   from `tool_result` text). Because the ledger must record single-session and
   untrusted-derived observations, it is **exempt from the Tier-3 numeric floor**.
   But it is ALSO the input that authorizes body revisions (invariant 3), so it is
   NOT kept blindly: the orchestrator runs a dedicated **ledger validator** on
   every `LEARNINGS.md` write. Keep-conditions (all must hold, else the ledger
   diff is reverted, fail closed): the parent dir holds a **registered** skill
   (invariant 1) whose sibling `SKILL.md` currently exists on disk with an
   `id`/`created` matching the registry entry (so a stale registry path — a
   deleted skill, or a different skill hand-authored at the same path — is
   refused, the same cross-check invariant 1 makes for revisions); every `##`
   entry validates against the schema; the diff is **append-only** versus `HEAD`
   — existing entries are byte-preserved except the designated mutable fields, and
   those are **monotonic**: Session-IDs are append-only (every committed id must
   remain — a brain cannot REPLACE ids with invented ones to mint recurrence),
   `Recurrence` and `Last-Seen` are non-decreasing, `Status` may only advance
   `open`→`resolved` (the WP-082 resolution path, never a regression), and
   `derived_from_untrusted` is raise-only; a *tracked* ledger whose committed
   version is unreadable fails closed (the history comparison is never silently
   skipped); Session-IDs are well-formed (`<harness>:<id>`), unique within an
   entry, and `Recurrence` equals their distinct count. **Counted sessions are
   bound to real invocations, and trust is derived from the invocation window
   (WP-084), not asserted:** a Claude session may be newly counted toward an entry
   ONLY if that session's extract `skill_invocations` (WP-080's structured signal)
   invoked THIS skill — an unrelated or invented session is reverted; and
   `derived_from_untrusted` is DERIVED from the invocation **window** (from the
   skill's invocation index to the next invocation or end-of-extract) — if any
   message in the window has role `tool_result` OTHER than the invocation's own
   paired result (`messages[resultIndex]`, matched by WP-080's `tool_use_id`
   pairing, NOT by position, so a batched external tool whose result lands first
   still taints), the session contributes untrusted; the derivation FAILS CLOSED
   (untrusted) on a `null`/out-of-window `resultIndex` or out-of-range `index`, and
   the brain's asserted boolean may only RAISE, never lower, the derived value.
   WP-080 rebases `index`/`resultIndex` under the message cap so they index the
   exact extract in scope (a padded session cannot push its poisoned window out of
   range and read clean). The extracts are in scope via `expectedScratch` + the
   WP-017 scratch-integrity check. **Codex sessions have no structured invocation signal, so they accumulate
   as quarantined learnings but never count toward revision authorization (v1 scope
   limit); WP-082 counts `claude:`-harness sessions only.** This closes both the
   "the ledger bypasses validation despite being authorization input" gap and the
   relevance gap: forged or replaced recurrence counters, invented or unrelated
   sessions, mislabeled trust, rewritten history, and a ledger planted beside a
   non-dream, deleted, or replaced skill can no longer commit.

3. **Revision is authorized deterministically from the committed ledger, and
   prefers patching.** A later dream may revise a skill **body** only when ALL of:
   (a) the skill is registered (invariant 1); (b) the revised `SKILL.md`
   frontmatter names the authorizing learning via `revision_pattern_key`; and (c)
   that learning **as committed in `HEAD`** — not the brain's this-run working
   copy — has **≥ 3 distinct Claude-invoked Session-IDs** and is **not**
   untrusted-derived. The orchestrator recomputes the distinct-session count itself
   from the HEAD ledger over `claude:`-harness sessions (it does not trust the
   `Recurrence` number, and Codex sessions do not authorize), and reads it from `HEAD`
   so a brain cannot inflate a counter and promote off it in the same run (the
   authorizing recurrence must have accrued over prior nights). **Confidence stays
   brain-asserted:** the ledger entry has no confidence field the orchestrator
   could recompute, so the trust posture is the skill's own `confidence ≥ 0.85`
   Tier-3 floor — the *same* posture skill CREATION already uses; recorded here
   honestly, not as a code guarantee. Untrusted-derived learnings can NEVER be
   promoted into a body, no matter how often they recur — this is the injection
   defense, and it is what makes a poisoned `tool_result` (mechanically marked
   untrusted) unable to reach a skill body. Edits are targeted and minimal
   (patch-over-rewrite). The WP-040 note-update discipline is extended to skills
   and **code-enforced** by diffing the revised frontmatter against `git show
   HEAD:<path>`: preserve `origin`, `created`, `id`; raise-only
   `derived_from_untrusted`; append `source_sessions`; bump `updated`. Only a
   **bare promotion** is exempt from learning authorization — enumerated exactly
   as `status` `incubating`→`active`, an `updated` bump **stamped to the run
   date**, and a `source_sessions` **append-only superset** (unique, well-formed
   ids), with the body unchanged. The allowlist validates field VALUES, not just
   names: `updated` cannot roll back and `source_sessions` cannot be replaced or
   emptied. Any other change — a body edit OR any other frontmatter field
   (`confidence`, `recurrence`, `description`, `tags`, a `status` regression, …) —
   needs a qualifying learning; the promotion exemption is a narrow allowlist, not
   "any unchanged-body change."

4. **No approval gate; report + git are the rollback story (v1).** Revisions apply
   automatically. Every revision is listed in the dream report with a summary of
   what changed, and surfaced in the next session's digest line. Rollback is
   vault git (`git revert` / history) — the dream is already one-commit-per-run
   (ADR-0012), so a revision is reverted like any commit. There is no staged
   queue, no approval command.

5. **No probation cycle (v1).** A revised skill keeps its existing `status`
   (`active`, or `incubating` if it was incubating). There is no `revised` state
   and no re-confirmation machinery; report-visibility plus git history is the v1
   safety story.

6. **The injection canary is a permanent regression class — deterministic first,
   real-brain second.** Two layers, both mandatory and permanently kept. (a) An
   **always-on deterministic test** in the normal suite (`npm test`/CI, no model):
   seed a registered skill plus a ledger whose only authorizing entry is
   untrusted-derived (and a second variant with < 3 distinct sessions), have a
   fixture body edit reference that entry via `revision_pattern_key`, and assert
   `validateAndCommit` reverts the body diff and records the revert line. This is
   the only end-to-end behavioral defense that runs on every commit. (b) The
   **EXPENSIVE real-brain canary** (WP-009 pattern) drives the real brain against
   a planted `tool_result` and asserts the skill body is byte-unchanged AND the
   attempt appears under the report's exact `## Gated out (and why)` section keyed
   by the injection's **stable payload marker** (e.g. `attacker@evil.com`) — never
   a generic skill-name mention, which produced false passes in the original
   design. This is a defense we did not find in the projects we reviewed
   (July 2026); neither layer may regress.

This lifecycle adds no process. It is entirely files plus the already-scheduled
nightly dream (ADR-0004: Wienerdog is just files). Revisions ride the existing
single-commit dream lifecycle (ADR-0012) — no new commit cadence, no new alert
channel.

## Consequences

- The dream's vault git history now interleaves skill-body revisions among its
  note writes; each is a plain, revertible commit and is itemized in the report.
- The registry + authorization + preservation code backstop closes WP-040's
  deferred frontmatter-diff-vs-HEAD gap, scoped to skills — a durable enforcement
  whose trust chain is code-verified (registry membership, HEAD-ledger recompute,
  immutable-field diff), not prose the brain is trusted to follow. The one honest
  residual is confidence (brain-asserted at the Tier-3 floor, invariant 3).
- Skill quality can now drift *down* as well as up: a bad revision is possible.
  We accept this in v1 because (a) revision is gated at the same bar as creation,
  (b) every revision is reported and digest-surfaced, and (c) git revert is
  one command. Voyager's "self-verification-or-perf-drop" result (research memo,
  open question 1) flags that we have no "does the revised skill still work"
  check; Wienerdog skills are markdown procedures with no execution harness, so
  such a check has no obvious meaning here. Deferred as a known limitation.
- LEARNINGS.md being exempt from the Tier-3 numeric floor means an attacker *can*
  get an untrusted observation recorded in the ledger — by design. It stays
  quarantined (marked untrusted, never injected) and structurally barred from
  promotion into a body (invariant 3 refuses untrusted-derived learnings), while
  the ledger validator (invariant 2) still enforces append-only integrity, a
  registered parent skill, and well-formed unique Session-IDs — so the ledger is
  exempt from the numeric floor but NOT from validation. The blast radius of a
  poisoned transcript is therefore a marked, integrity-checked ledger entry,
  nothing that reaches a session or a skill body.

## Revision (2026-07-12): adversarial-review hardening

An external adversarial review (OpenAI Codex, the ADR-adopted second reviewer)
ran six rounds on these drafts. **Round 1** (verdict: needs-attention / no-ship)
found five defects in the ORIGINAL HEAD-frontmatter design; **round 2** found
three gaps the round-1 fixes introduced; **round 3** found two mechanical
tightenings; **round 4** refuted the round-3 accepted residual with a concrete
attack; **round 5** found that round-4's cited-message evidence checked existence
and role but not relevance, and reworked WP-084 to invocation-binding + window
trust; **round 6** found the window's positional own-result exclusion exploitable
and its indexes drifting under the message cap (below). All fourteen findings are
owner-approved (2026-07-12) and recorded here; they are implemented across WP-080,
WP-083, WP-081, WP-084, and WP-082, and the Decision section above already reflects
them.

1. **[critical] The orchestrator never verified that a revision was backed by a
   trusted recurring learning.** The old backstop checked only the modified
   `SKILL.md`'s HEAD frontmatter (origin + immutable fields); it never parsed the
   ledger. → Invariant 3: a body change now requires a `revision_pattern_key`
   naming a learning that, **as committed in `HEAD`**, has ≥ 3 orchestrator-
   recomputed distinct Session-IDs and is not untrusted-derived.
2. **[high] HEAD-based `origin: dream` scoping authenticated a forgeable label**
   (session edits are committed pre-brain, so HEAD includes them). → Invariant 1:
   the tamper-proof `state/skill-registry.json` replaces HEAD frontmatter as the
   write-origin marker; `origin: dream` is demoted to provenance prose.
3. **[high] The poison canary was optional and its assertion had false passes**
   (a generic skill-name mention satisfied it). → Invariant 6: an always-on
   deterministic revert test in `npm test`/CI, plus the real-brain canary now
   keyed to the injection's stable payload marker under the exact `## Gated out
   (and why)` section.
4. **[high] LEARNINGS.md bypassed all validation despite being authorization
   input** (a blanket exemption kept any `LEARNINGS.md`). → Invariant 2: a ledger
   validator (registered parent, schema, append-only vs HEAD, raise-only untrusted,
   unique well-formed Session-IDs) replaces the blanket exemption.
5. **[medium] WP-080 invocation names were uncapped model-authored control-plane
   identifiers** (with an `input.command` fallback that could carry arbitrary
   text). → WP-080 now emits only names matching `^[a-z0-9][a-z0-9-]{0,63}$`, drops
   the `command` fallback, and omits any non-conforming or absent name.

A **round-2 review of the revised drafts** (2026-07-12) found three further gaps
the round-1 fixes introduced; all three are owner-approved and now reflected above:

1. **[high] The promotion exemption was too broad** — any unchanged-body change
   bypassed learning authorization, so `confidence`/`recurrence`/`status`/
   `description`/`tags`/`revision_pattern_key` could change with no recurrence
   evidence. → Invariant 3: the exemption is a narrow enumerated allowlist
   (`status` incubating→active, the `updated` bump, a `source_sessions` append);
   any other frontmatter change needs a qualifying learning, same as a body edit.
2. **[high] The ledger validator trusted a stale registry path** — it checked
   registry membership but never that the sibling `SKILL.md` still existed or that
   its `id` matched (WP-082 cross-checks this; WP-081 did not). → Invariant 2: the
   ledger keep-conditions now read the sibling `SKILL.md` and require it to exist
   with an `id`/`created` matching the registry entry (fail closed otherwise).
3. **[medium] Append-only validation failed open on an unreadable HEAD** — for a
   tracked ledger, a nonzero `git show HEAD:<rel>` silently skipped the history
   comparison. → Invariant 2: a tracked ledger with an unreadable committed
   version now fails closed; the ledger revert is removal-safe so a not-in-HEAD
   path reverts cleanly instead of crashing `git checkout`.

A **round-3 review** (2026-07-12) found two mechanical tightenings of the round-2
checks; both applied and owner-approved:

1. **[high] Ledger mutable fields were under-constrained across `HEAD`** — the
   comparison preserved First-Seen/Observation and raise-only untrusted but left
   Session-IDs/Recurrence/Last-Seen/Status free, so a brain could REPLACE an
   entry's ids with three well-formed invented ones (or regress the counters),
   pass schema, and mint recurrence a later dream reads as body-revision
   authorization. → Invariant 2: the mutable fields are now monotonic — Session-IDs
   append-only (committed ids preserved), Recurrence/Last-Seen non-decreasing,
   Status only `open`→`resolved`.
2. **[medium] The bare-promotion allowlist checked field names, not values** —
   `updated` could roll back and `source_sessions` could be replaced/emptied. →
   Invariant 3: the allowlist now value-checks `updated` (stamped to the run date)
   and `source_sessions` (append-only, unique, well-formed superset).

A **round-4 review** refuted the round-3 accepted residual with a concrete
in-threat-model attack and Gyula chose to close it with code (not accept it):

1. **[high, design change] The ledger's `derived_from_untrusted` was
   brain-asserted.** Adversarial `tool_result` text can instruct the brain to mint
   a NEW entry with `derived_from_untrusted: false` and three invented well-formed
   Session-IDs — the validator only checked the boolean, grammar, uniqueness, and
   count, and append-only protects nothing on a *new* entry, so it commits and
   authorizes a body revision. "Requires a fully-compromised brain" was circular:
   transcript poisoning IS brain manipulation. → the new **WP-084** makes trust
   mechanical (round-5 finalized the mechanism — see below). The round-3
   accepted-residual is **withdrawn**.

A **round-5 review** found that WP-084's first mechanism (per-message `Evidence:`
citations) verified message existence and role but not **relevance**, and correctly
objected that the leftover was persistent instruction injection, not "quality
drift":

1. **[high] Cited-message evidence did not bind sessions to the skill.** A poisoned
   brain could cite benign `user`/`assistant` messages from any three real same-run
   sessions (unrelated to the skill), mint a trusted entry with an attacker-chosen
   `Observation`, and have WP-082 authorize attacker-chosen persistent instructions.
   → WP-084 was reworked (Invariant 2): a counted Claude session must actually have
   invoked THIS skill (WP-080's `skill_invocations`, extended with the invocation's
   message `index`), and trust is derived from the invocation **window** (any
   `tool_result` between the invocation and the next → untrusted; an omitted taint
   still counts). Per-message `Evidence:` refs are **dropped** — the structured
   signal derives everything, so the ledger format keeps its shape and WP-084 is
   simpler. Codex sessions (no structured signal) accumulate but do not authorize
   (v1 scope limit); WP-082 counts `claude:` sessions only. **Addendum (orchestrator
   decision 2026-07-12, pending owner sign-off):** the window EXCLUDES the
   invocation's own paired result — else a `Skill` invocation's own result, itself a
   `tool_result`, would taint every window and make trusted authorization
   unreachable (vacuous). Every other (external) `tool_result` still taints. *(This
   addendum first identified the own result positionally as "the first `tool_result`
   in the window" and claimed a mismatch would only under-taint by one — round 6
   corrected both; see below.)*

A **round-6 review** (against the actual parser) found two mechanical holes in the
round-5 window mechanism; both fixed:

1. **[high] Positional own-result exclusion was exploitable, and "under-taint by
   one" was the attack, not a bounded error.** Excluding the *first* `tool_result`
   in the window does not match it to the `Skill` `tool_use`: an assistant turn that
   batches a `Read` (or any external tool) BEFORE the `Skill` call puts the
   attacker-influenceable result first, so the poisoned message is precisely the
   excluded one and a window with no *later* external result derives clean. Session-
   time batching order is fixed in the transcript. → WP-080 now carries the paired
   result's exact message index (`resultIndex`, from `tool_use_id` pairing); WP-084
   excludes ONLY `messages[resultIndex]` and FAILS CLOSED (session untrusted) when it
   is `null`, non-integer, or outside the window. The round-5 "first `tool_result`"
   heuristic and its under-taint-is-bounded claim are **withdrawn**.
2. **[high] Index drift under the message cap made poisoned windows invisible.**
   `parse()` retains only the last `MAX_MESSAGES` (2000) but spread
   `skill_invocations` unchanged, so after front-truncation every recorded index was
   stale and beyond-length invocations produced empty windows that derived clean — a
   padded session hid its poisoned window. → WP-080's `parse()` now rebases
   `skill_invocations` with the messages (subtract the dropped-leading count from
   `index`/`resultIndex`; DROP any invocation whose window is not fully retained),
   with the invariant that every emitted index refers to the exact `messages` array
   written to the extract; WP-084 additionally fails closed on any residual
   out-of-range index. WP-080 grows to size M for this.

**Accepted residual after round-5 (named honestly: persistent skill injection, not
"quality drift").** For an attacker to land a persistent attacker-chosen body edit,
ALL of the following must hold at once: (i) the dream run is poisoned (an injected
`tool_result` steering the brain); AND (ii) there exist **≥ 3 real Claude sessions
that genuinely invoked the target skill**, processed in that run (a transcript
poisoner cannot manufacture sessions or invocations); AND (iii) **all three
invocation windows are free of EXTERNAL `tool_result` messages** — i.e. in each of
the three sessions the skill ran without other captured tool output (the
invocation's own paired result is excluded, being the skill's own Tier-3-gated body
output, not external data). Tool-using skills — that read files, run shell, or
fetch web content — still rarely satisfy this, so the conservative posture stands;
tool-free procedural skills are genuinely revisable. AND (iv) the brain writes a
body edit that the orchestrator cannot semantically check (Wienerdog skills are
markdown procedures with no execution harness — the standing "no
does-the-revised-skill-still-work gate" limitation). The orchestrator verifies
invocation + window, not that the `Observation` faithfully describes what happened,
so within that clean-window case a manipulated brain's chosen edit is not caught.
This stacked condition set is the accepted v1 residual; closing (iv) needs semantic
attribution that has no mechanical definition here, and tightening (iii) to taint on
the own result too would make trusted authorization unreachable (vacuous, not
conservative).

**Invariants re-checked against the platform ADRs.** IRON RULE (ADR-0004): the
registry is a JSON state file written by the existing `validateAndCommit` inside
the already-scheduled dream — no new process, daemon, or telemetry. Single-commit
lifecycle (ADR-0012): the registry write happens AFTER the one dream commit,
alongside the existing watermark/digest `state/` writes, so one-dream-one-commit
holds; the registry is not committed to the vault. **Crash behavior:** a crash
between the commit and the registry write leaves a committed-but-unregistered
skill, which is simply never revised (fail closed) — safe; the write is idempotent
on the same key but is not re-triggered for an already-tracked skill, so that
window is unrecoverable-but-safe (recorded, no backfill code). **Uninstall**
(ADR-0019): the registry lives in `state/`, which `disposeCoreMechanics` sweeps —
no manifest entry, no uninstall change. **Migration:** no dream-created skills
exist in any field vault yet, so there is nothing to backfill; a pre-registry
dream-created skill is un-revisable (fail closed), which is acceptable.

## Future work (parked, not specced)

- **Dormancy / staleness aging.** Hermes's curator auto-archives skills unused
  for N days. We deliberately do **not** build this in v1 (WP-D parked). If added
  later it must stay deterministic, archive-only (never delete), and dream-created
  scoped — consistent with invariant 1.
