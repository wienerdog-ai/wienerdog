# Handover — audit remediation state and remaining work

Written 2026-08-31 at the close of the promote-in family (PRs #55/#57/#60/#61).
This is the entry point for the developer taking over. Everything you need is
in this repository; there is no side channel.

## Read in this order

1. `CLAUDE.md` — how work happens here (spec-driven, one WP at a time).
2. `docs/GLOSSARY.md` — canonical names; never invent synonyms.
3. `docs/specs/README.md` + `docs/specs/_TEMPLATE.md` +
   `docs/runbooks/spec-authoring.md` — the spec system.
4. This file — where the audit remediation stands and what remains.
5. `memory/lessons/inbox.md` — paid-for lessons; the last 13 bullets
   (`WP-dream-promote-in-workspace:` prefix) are the distilled discipline of
   the hardest package.

## Audit remediation status (measured on main, 2026-08-31)

The security audit ruled five remediation groups. Status, measured from the
tree (`docs/specs/done/` + merged PRs), not from memory:

| Group | Subject | Status |
|-------|---------|--------|
| A | Interpolation neutralizer for code-owned markdown control planes | **Done** — `WP-sanitize-project-display-names`, `WP-daily-summary-per-line-framing`, `WP-neutralize-alert-callout-rendering` in `done/` |
| B | Vault-snapshot second path into model sessions | **Done** — `WP-gate-vault-snapshot`, `WP-snapshot-read-path-hardening` in `done/` |
| C | Dream write fence (machinery-controlling files) | **Done — E2 disposition act, 2026-09-06** (D1 (c) CLOSED by `WP-instruction-basename-currency`, #211; D1 (b) and D5 CLOSED by `WP-dot-segment-denial`, #215; D2 (b) and D4's env half CLOSED by `WP-dream-git-env-pinning`, #234; D4's second spawn point CLOSED by `WP-dream-git-env-validate-seam`, #238) — every group C mechanism retired or accepted, measured on `eedd8783`. **Three residuals ACCEPTED, not retired, each with a home that owns it:** the `reference-transaction` hook (`WP-dream-promote-in-workspace` Table W row W1, owner ruling of 2026-08-31, not reopened); the nested vault (`WP-dream-git-env-validate-seam` owner item O5, named in `assertGitRepo`'s contract); an undocumented tool's instruction file (the currency WP's dated inventory, its owner and its trigger). Basis in `docs/specs/logbook/2026-09-06-audit-group-c-closure.md`; per-finding disposition in `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md` |
| D | Code-derived draft recipients (no verb accepts a model-named address) | **Done** — `WP-audit-d-code-derived-recipients` in `docs/specs/done/` |
| E | Ledger-parser correctness + hostile corpus | **Done** — `WP-audit-e-ledger-parser-corpus` in `docs/specs/done/` |

**The five audit groups now read: A Done, B Done, C Done, D Done, E Done** — group
C closed by the E2 disposition act of 2026-09-06 with three residuals accepted
rather than retired (the `reference-transaction` hook, the nested vault, an
undocumented tool's instruction file), each named with the home that owns it in
`docs/specs/logbook/2026-09-06-audit-group-c-closure.md`.

Two known status anomalies at handover time:
`docs/specs/WP-ep2-unscannable-preserve.md` was still In-Review after its PR
(#57) merged — a done-flip PR accompanies this handover.
`docs/specs/WP-contract-reference-tables.md` sits In-Review; its
implementation state was not re-verified during handover — measure before
resuming it.

## The remaining work, in recommended order

> **Status pass, 2026-09-10 #11 (short day session — ops incident + one spec filed; no merges).**
> Measured on `main` at `5cb4e49b`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | new | `WP-dream-digest-omits-own-job-alerts` | **Draft, filed** | `5cb4e49b` (spec only, local commit on `main`) | **Trigger:** the 2026-09-10 01:30 UTC dream failed closed (pre-dream containment probe: `claude -p` session logged its prompt, received no assistant message within `PROBE_TIMEOUT_MS` 120 s → `ETIMEDOUT` → exit 1, email alert). The 02:00 UTC catch-up re-ran it: ok in 499 s, vault commit `3be46e1`. But the dream's own step-19 `regenerateDigest()` (`src/cli/dream.js:628`, call sites `:705`/`:1167`) renders `state/digest.md` with `unacknowledgedAlerts(readAlerts())` while the failure record is still on file; `run-job.js:1204` `clearAlerts` runs only after the dream returns. So the "job has failed" callout survives one full success and is injected into every session until the next dream (24 h) or an attended `sync`. **WP-041 knew this ("Known one-regeneration lag, accept it") — this spec withdraws that acceptance and keeps WP-041's prohibition on coupling `run-job` to the digest renderer.** Fix = option B: the dream's `regenerateDigest` filters out the records for the job whose success this run establishes, job identity from `WIENERDOG_JOB` (already exported by `buildCleanEnv`, `run-job.js:180`/`:219`) accepted only when `findJob` resolves it to `run: builtin:dream`; every doubt shows the callout. Deliverables: `src/cli/dream.js`, a comment-only narrowing of `src/core/alert-ack.js:127` ("ONLY suppression point"), tests. **Owner ruling recorded in the spec (Out of scope): ship this first; the follow-up WP for a standing managed-policy-hook-warning surface (`run-job.js:953`, whose only lasting surface today is this very bug) is drafted later.** Open for the owner: sign-off on trusting `WIENERDOG_JOB` under the config cross-check; whether the containment probe gets a single retry (recorded under Discovered, out of scope). |
>
> **Ops state after the pass:** `wienerdog sync` run 2026-09-10 12:05 CEST (vendored 0.13.0, one schedule repointed, digest rewritten — stale banner gone); `wienerdog doctor` all `[ok]`; `dream` + `catchup` launchd jobs loaded, exit 0; `app/current` → `0.13.0`. Vault index note: dream commits through a private index by the 2026-08-31 ruling, so `git status` in the vault shows cosmetic staged deletions until `git reset`.
>
> **Next in the queue:** implement `WP-dream-digest-omits-own-job-alerts` (owner intends to implement on return; branch `wp/dream-digest-omits-own-job-alerts`, both review gates per `docs/runbooks/codex-review.md`), then the queue below unchanged: `WP-quarantine-only-copy-shelf` (Draft), routed items to wd-architect, the unfiled three.
>
> **Status pass, 2026-09-06 #10 (night/day autopilot session, owner-authorized merges).**
> Measured on `main` at `8ea9e5d1`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3c-succ | `WP-quarantine-failed-preserve-disposal-flush` | **Done** | design loop #242 (`fdbeb9f2`), implementation #243 (`8ea9e5d1`), filed in this pass | **The O11 successor: a BEST-EFFORT `flushDir` of the removal's parent after each of Table D row D4's two failure-arm removals (`validate.js:984` `tmp`, `:1020` `dest`), gated by `DURABILITY_AVAILABLE` at the call site because `flushDir` itself carries no gate (Table Z row Z4, measured).** A completed POSIX flush closes that act's post-completion window; a flush that does not complete, and every win32 run, retain the residual priced under O10 (Z3 — the flush result does not change what `quarantinePreserve` returns; downstream branch-specific and unchanged). Owner items **O12** (value YES — 2.5–3 ms on an already-failing arm; the success path pays nothing, measured) and **O13** (best-effort; fail-loud priced as the overrule). **Design loop: round zero, two clean-context executors, TWO double-channel rounds** (round 1 HEAVY — Z3 narrowed to the observable contract, the forced-win32 recipe replaced and proven discriminating, Z2's residual written independently, Z5 pinning the comment blocks to V1; round 2 CLOSE — plugin approve, shadow one residual qualifier + one record inaccuracy). **Implementation: two rounds of the triple-channel PR gate** — round 1: plugin CLEAN, shadow one B (the forced-win32 tests counted fsyncs without establishing reach), wd-reviewer REQUEST-CHANGES with the implementation judged correct — the same reach gap (converged), a false `rc=0` pasted for V2, and a SPEC DEFECT: V2's `--wp`-filtered red-proofs run under `set -e` can never pass (the runner rolls unselected pairs up as FILTERED, rc 1) → **erratum 1 landed on the branch before merge** (`3cd68a85`: V2 is the unfiltered run; the `--wp` form a non-gating reading); round 2 on `ae164823`: plugin CLEAN, shadow *"patch is correct"* (zero findings), wd-reviewer **APPROVE** — all six round-1 findings genuinely fixed, four disjoint tracer patch sets, five band-C observations (one erratum, one routed to the predecessor, one routed to wd-architect as a cross-WP ADR-0031 signal). Merged tree: `2699/2687/0/12`, whole-tree `RUN: PROVEN` 66/66 (the two new declarations and the seven pre-existing preserve-durability roll-ups), lint clean. **Two dated errata** in the filed spec (one pre-merge on the branch). |
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward, **plus:** O10's class on every failed flush and every win32 run; Z1's same-PID collision; no test reaches what a power loss leaves (by design); the 2-space/4-space comment-line substring hazard in RED `find` literals (third occurrence, recorded).
>
> **Next in the queue:** `WP-quarantine-only-copy-shelf` (Draft, filed; the banner class + O9 + O10), then unfiled — `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up; routed hygiene: ADR-0012's pre-`done/` spec path, the unused `restoreVaultToHead` import.
>
> **Status pass, 2026-09-06 #9 (night autopilot session, owner-authorized merges).**
> Measured on `main` at `66b2b1f8 (the base this loop measured on)`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3c | `WP-quarantine-disposal-durability` | **Superseded** (three acts) → **narrowed**: two acts filed as the new Draft `WP-quarantine-failed-preserve-disposal-flush` | design loop + filing in #241 (`66b2b1f8 (the base this loop measured on)`) | **The value question was answered PER REMOVAL ACT, by measurement — the design gate withdrew the spanning claim after three rounds landed on it.** For M1 (the post-commit temp), M4 (the retention eviction) and M6 (the identity-gated duplicate) the state a crash leaves after a non-durable removal is a state a crash before it already leaves, and each is accepted by a named row (Table F row F2's flush when it completes; Table N rows N3/N5/N6/N7 — eligible for a future prune, may persist; the withheld twin at the identity check, owner-deletable). **For M2 and M3 — Table D row D4's two owned paths, removed on `quarantinePreserve`'s failure arms — the equivalence is FALSE:** the run continues, preserves a withheld copy, publishes and commits a record, and never flushes `redacted/` (QD-P11), so a later power loss resurrects entries a completed run's record omits; decided **(b) a BEST-EFFORT POSIX `flushDir` after each failure-path removal** — a completed flush closes that removal's window; a flush that does not complete, and every win32 run, retain the residual, priced under O10 — as **O11** (M2 measured by QD-P12: a fault before the commit reaches the shared catch, the fallback publishes, the resurrected temp collides at `O_EXCL`; option (a) priced honestly as keeping today's DISCLOSED non-durability — D4 requires none). M6 stays no-flush, priced in **O10** with its post-owner-deletion state named (the owner deletes the withheld twin; a later power loss restores the `redacted/` copy as sole surviving bytes) and the alternative costed; no O12. The measurement that decided it (probes QD-P1–P10): the post-commit temp removal is covered only when the quarantine directory's flush COMPLETES — `flushPreservation` short-circuits on an fsync failure (QD-P6, both arms) and issues no fsync at all on win32 (QD-P7) — and on every non-closing path the leftover is the same deterministic-name temp the failure route already owns (QD-P8: a planted leftover makes the next preservation return `null`, never a cleanup); 400 unflushed unlinks on APFS reappeared 0 times after a clean exit (QD-P1), so only a kernel panic or power loss remains, unstageable; a dedicated flush would replace a 3.5–4.1 ms window with its own 2.0–2.7 ms dirty-directory fsync (QD-P10 vs QD-P2). The round-1 gate corrected two supporting sentences — the retention cap is NOT a schedule (Table N: eligible for a future qualifying prune above the cap; may persist indefinitely, QD-P9) — and the equivalence survived on the corrected text. Measured cost of the flush it would have added: 2.0–2.7 ms per removal on a dirty directory (~500× the clean-directory figure). Recorded as **Table M** (7 rows) in the Superseded spec under `done/`, a dated clause inside Table F row **F7(a)** of `WP-quarantine-preserve-durability`, and owner items **O8** (Superseded), **O9** (the prune-SELECTION question — another live run's fresh `redacted/` copy is selectable for eviction once the pruning run's own set reaches the cap, measured reachable — ACCEPTED and routed) and **O10** (the indefinite, unbannered persistence of a `redacted/` copy — ACCEPT AND NAME recommended; deciding otherwise changes Table N row N7's shipped posture). **The Draft stub `WP-quarantine-only-copy-shelf` is now FILED** (the banner class it already owned, plus O9 and O10), so both routings point at a file. Design gate: round zero (nine-state both-directions proof, later twelve), then FOUR double-channel rounds (plugin + hermetic shadow; eight raws committed pre-adjudication): round 1 DESIGN (three A findings on the disposition's sentences), round 2 DESIGN (the equivalence false at M3 → the universal withdrawn; M2/M3 → the successor), round 3 (O11 re-labelled best-effort; M2 measured; M6 re-modelled), round 4 CLOSE (no decision falsified; two prose items deleted). The gate withdrew one universal sentence, re-labelled one option, re-modelled two rows and filed two stubs; every finding was about the disposition's SENTENCES, none reversed a row's decision. Record `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md` |
>
> **The dream-promotion epic's durability family is closed:** `WP-quarantine-preserve-durability` Done, its split `WP-quarantine-disposal-durability` Superseded on measurement. The selection and persistence questions live with the now-filed Draft `WP-quarantine-only-copy-shelf`. The move to `done/` also repathed the predecessor's two live pointers to this spec (an unscoped `mirror-walk` caught what the scoped one could not).
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward, **plus:** the prune-selection ownership question (O9's home); the `set -e` `!`/`&&` exemption class in verification shells (two broken trees read GREEN before the driver was rewritten — see the record).
>
> **Next in the queue:** `WP-quarantine-only-copy-shelf` (Draft, filed; owns the banner class, O9 and O10), then the unfiled — `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up from audit-D's erratum 4; and the two routed hygiene items (ADR-0012's pre-`done/` spec path; the unused `restoreVaultToHead` import).
>
> **Status pass, 2026-09-06 #8 (night autopilot session, owner-authorized merges).**
> Measured on `main` at `ba357a81`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | C-succ | `WP-dream-git-env-validate-seam` | **Done** | design loop #236 (`e7f1c957`) + dispatch-time fix #237 (`489f981e`), implementation #238 (`ba357a81`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-06-git-env-validate-seam-design-gate-rounds.md`). Three owner items under the standing authorization: **O4** extend the constructed environment to `validate.js`'s `git()` (one `buildGitEnv()` call, Table U cited not restated); **O5** the nested vault ACCEPTED and named in `assertGitRepo`'s contract — because `wienerdog adopt --yes` was MEASURED to accept a subdirectory of an existing repository (VS-P4), so both hardening answers carry a user-visible cost and are parked; **O6** Table W row W1(c)(i)'s standing trigger disposed by a dated amendment inside the row (its subject is the shape; the stale-stat safety re-measured under the constructed environment, VS-P7). **Round 1 was HEAVY** (the trigger amendment); **round 2 CLOSED** with no product finding after V4 was re-cut BY KIND — two rounds proved no line-oriented check over a JS diff can carry "no spawn added", so the textual step became a labelled completion screen and the invariant moved to AC2's exactly-one-spawn capture plus the reviewer's whole-diff read. **The dispatch-time gate then fired for real (D1):** V4's SHA-equality base guard was unsatisfiable by construction once the Ready PR moved `main`; fixed to a content comparison by a docs PR before dispatch. **Implementation: one round of the triple-channel PR gate** — plugin CLEAN, shadow *"patch is correct"* (zero findings; the three AC tests executed directly), wd-reviewer **APPROVE** with two band-C observations (one filed as erratum 1, one recorded); the implementer's own pre-review pass was disregarded as not the gate. Merged tree: `2693/2681/0/12`, whole-tree `RUN: PROVEN` (`validate-git-inherits-git-dir` PROVEN), lint clean. **One dated erratum** in the filed spec. |
>
> **Audit group C:** the second spawn point now runs under the constructed environment too; what remains for group C is E2's disposition act in `docs/specs/done/WP-audit-c-close-disposition.md` (an architect pass), plus the nested-vault residual now NAMED in `assertGitRepo`'s contract rather than implied.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward, **plus this WP's:** V4's blindness to additions (by design, reviewer-carried); the nested-vault ancestor commit (inferred from code, not measured); the unused `restoreVaultToHead` import in `src/cli/dream.js`; ADR-0012's 2026-09-05 amendment citing the pre-`done/` spec path; size (656-line Ready spec); O6's overrule cost as the queue's largest.
>
> **Next in the queue:** E2's group-C disposition act; `WP-quarantine-disposal-durability` (**Draft**); unfiled — `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 #7 (night autopilot session of 2026-09-05/06, owner-authorized
> merges).** Measured on `main` at `e269f5cd`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | C-D2(b) | `WP-dream-git-env-pinning` | **Done** | design loop #233 (`d6a233ea`), implementation #234 (`e269f5cd`), filed in this pass | **Design loop: round zero, two clean-context executors, and FOUR double-channel rounds** (plugin + hermetic shadow; eight raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-git-env-pinning-design-gate-rounds.md`). **The owner product decision was taken under the standing authorization** (record `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`; O1 pin by construction, O2 the validate.js spawn point to a successor, O3 `XDG_CONFIG_HOME` not carried — each with its overrule cost in the spec). Table U grew from 21 to 24 rows and every Reach cell was re-derived twice from drivers issuing the nine pinned shapes' exact argv; **round 1 fired the DESIGN branch** (one probe used a non-pinned argv), **round 2 fired the ADR-0031 breaker** and the extraction was of KIND — cells keep decided facts, one rationale section owns the reasoning, the record owns the probes — after which every finding landed on a sentence, not a row; **round 3 was HEAVY** (a Deliverables/contract dependency contradiction); **round 4 CLOSED** (plugin approve; shadow three non-product items). Measured along the way and now in Table U: `GIT_CONFIG_COUNT`+`core.fsmonitor` executes code inside the pinned `update-index --add --cacheinfo` and `write-tree`; inherited `GIT_AUTHOR_*`/`GIT_COMMITTER_*` beat `-c user.*` on `commit-tree`; a blob deduplicated against an inherited alternate is never stored in the vault and `fsck` breaks when the alternate goes; `commit-tree` ignores `commit.gpgsign`. **Implementation: one round of the triple-channel PR gate** — plugin CLEAN, shadow *"patch is correct"* (zero findings), wd-reviewer **APPROVE** with three band-C items (one fixed as erratum 1 in this pass, one residual, one informational). Merged tree: `2690/2678/0/12`, whole-tree `RUN: PROVEN` with the three new declarations and the re-targeted one, lint clean. **Two dated errata** in the filed spec |
>
> **The audit status table's group C row closes its last residual by this pass:** D2 (b) — the run's git calls inheriting `process.env` — is retired by construction (`src/core/dream/git-env.js`; ADR-0012 Amendment 2026-09-05; Table W row W1 amended 2026-09-05). Whether group C reads **Done** is E2's disposition act in `docs/specs/done/WP-audit-c-close-disposition.md`; this pass updates the row above to say the successor is Done with its own verification green, and leaves the disposition act to the next architect pass rather than pre-writing it.
>
> **Owner instruction this session, verbatim** (record:
> `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`):
> *"Great. Please proceed with the queue. Note that I will go to sleep soon, and you will be on autopilot. Accordingly, try and get as much done as possible. You have merge authorization for this session. And remember to follow the playbook of the project, including the double gate reviews and using subagents."*
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward unchanged, **plus this WP's:** the nested-vault discovery question and the second spawn point (owned by the Draft successor `WP-dream-git-env-validate-seam`); the size residual (932-line Ready spec, recorded not trimmed); U8/U9 resting on construction plus the canary rather than a per-channel proof; the unmeasured partial-clone lazy fetch and win32 rows; erratum 2's `PATH` guard asymmetry; E2's group-C disposition act.
>
> **Next in the queue:** `WP-dream-git-env-validate-seam` (Draft stub, filed by this loop), `WP-quarantine-disposal-durability` (**Draft**), and unfiled — `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 #6 (evening session of 2026-09-05, owner-authorized
> merges).** Measured on `main` at `2ccc3d58`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 8 | `WP-process-runbook-sweeps` | **Done** | design loop #230 (`e119b607`), implementation #231 (`2ccc3d58`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-process-runbook-sweeps-design-gate-rounds.md`). The 13 stub bullets measured as **19 atomic rules** against the five process files: 1 ALREADY BOUND (the ADR-0031 breaker), 9 PARTIAL, 8 UNBOUND, 1 UNPAID (R19, zero provenance, not landed — owner item O4); **17 rules landed through 14 edit points, 9 EXTENDing an existing sentence**, `codex-review.md` +4 bullets. **Round 1 fired the pinned DESIGN branch**: the shadow found R12 mis-measured UNBOUND, and the cause was the round-zero sweep using the stub's 13 ids against the 19-row table — the whole set was re-derived with aligned ids (exactly one row moved). Four findings converged across channels, among them the screen reading the WORKING TREE while the WP lands R04 (fixed: `git show HEAD:`, dirty-tree refusal, labelled an anchor-PRESENCE screen blind to meaning, placement and polarity) and R13's "only form is a design question" contradicting the unqualified two-rounds rule (fixed: the bullet opens with the precedence clause). **Round 2 returned no product finding on either channel**; the live criterion gained `docs/HANDOVER.md:371-372`'s band gate as step 0. Clean-context mechanical closure: three band-C items, one dropped with reason (a verification fence is not a program). **Implementation: two rounds of the triple-channel PR gate** — round 1 plugin CLEAN, shadow *"patch is correct"* with zero findings, wd-reviewer REQUEST-CHANGES **with no A finding** (one B: the R12 worked-example sentence transcribed a spec-internal "this WP" into the runbook; three C), EXTEND intactness proven by an 8-word-shingle survival check; round 2 on `3ce5ba57`: plugin CLEAN, shadow *"patch is correct"* (zero findings; round 1 confirmed resolved), wd-reviewer **APPROVE** with one band-C residual (erratum 3). Merged tree: lint clean, screen 21 PASS. **Two dated errata** plus one routed residual in the filed spec |
>
> **Owner instruction this session, verbatim** (record:
> `docs/specs/logbook/2026-09-05-owner-rulings-runbook-sweeps-queue.md`):
> *"I hereby authorize you to perform merges in this session too."* The four
> owner items (O1–O4) were dispatched under the settled recommendation process;
> the record carries a dated amendment with round 1's corrected overrule costs.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop; the adopt-e2e
> Deliverables cell; the basename WP's Table C position clause; the
> phase-environment contract table for `scripts/red-proofs.js`; ADR-0010's
> "adopt requires the user to confirm" sentence vs `--yes`; the orphaned `(ii)`
> sub-bullet at step 19 in `src/cli/dream.js`; the durability WP's five;
> audit-D's errata 3–6; audit-E's errata 1, 3 and 4) **plus this WP's:**
> ADR-0031 and `.claude/agents/wd-architect.md:22` say "in one pass" / "in the
> same pass" while `_TEMPLATE.md` now says "and in the same commit" — the ADR is
> the weaker of two surfaces stating one contract (owner's act to amend);
> `_TEMPLATE.md`'s Security-checklist heading says "delete only if" while
> `spec-authoring.md:25-27` requires an `N/A` line in place (the runbook governs;
> the heading is stale); Table B "after :N" insertion points inside a dense list
> should name the neighbouring bullet.
>
> **Next in the queue:** `WP-dream-git-env-pinning` (**owner product decision** —
> the maturing architect records a recommendation with the cost of overruling
> it), then the successors: `WP-quarantine-disposal-durability` (**Draft**), and
> unfiled — `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the
> owner's named option **(c)** (mid-trim of `References`), and the criterion-7
> one-test follow-up from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 #5 (owner-authorized merges).** Measured on `main`
> at `54960a9d`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | E | `WP-audit-e-ledger-parser-corpus` | **Done** | design loop #225, implementation #226 (`54960a9d`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-e-design-gate-rounds.md`). **The ADR-0031 breaker fired TWICE at round 2 and both were answered by EXTRACTION, not a third patch:** duplicate-heading normalisation became *detection on the key the parser CAPTURED*, witnessed by a **generated matrix over ECMAScript `\s` itself** (24 non-LF code points × three reads) after four hand-picked witnesses proved satisfiable by a wrong detector; and the RED-proof sets became a **proof-SELECTION contract** separating TOTAL REACH (measured, may vary by conforming implementation) from SELECTED WITNESSES (declared, graded), carried by the shipped `testNamePattern` facility. Round 2 returned **no product-verdict defect on either channel** and the loop closed under Weighted closure. Product: a **43-row hostile corpus**, **7 declared proofs**, and three live defects closed — trust washing (`TRUE`/`False` read as trusted on both paths), `__proto__` headings invisible to every schema and history loop, and a **duplicate heading in the COMMITTED ledger authorizing a Tier-3 body revision**. **Implementation: two rounds of the triple-channel PR gate** — round 1: plugin clean (52 focused tests), shadow *"patch is correct"*, wd-reviewer **REQUEST-CHANGES with the implementation judged correct** (140/140 Table C assertions) on two test-lane items; **erratum 2 (two Path-A fixtures that could not reach the `authorize` their Today column claims) landed on the branch at `3efcac1f`**; round 2 on that tip: plugin clean, shadow *"patch is correct"* (an in-memory LPC-E mutation confirmed the fail-open is now witnessed), wd-reviewer **APPROVE**, one band-C item routed to erratum 1. **Four dated errata** in the filed spec |
>
> **Measured numbers, and two corrections to the figures circulated with this
> flip.** The merged tree at `54960a9d` is **2684/2672/0/12** with **60 declared
> proofs, 60 selected, RUN: PROVEN**, lint clean. The gate's `2676/2664/0/12` and
> the spec's `44` are both true **of different trees**: `2676/2664` is the branch
> tip `3efcac1f` (re-measured here), and `37 → 44` is criterion 7 against this
> WP's design base `8c52808f`. `WP-audit-d-code-derived-recipients` landed sixteen
> declarations in between, so `main` reads 60, of which **exactly seven are this
> WP's** (`lpc-a-…` through `lpc-g-…`). That gap is **erratum 4**: an acceptance
> criterion phrased as an absolute repo-wide count goes stale without anyone
> touching the spec.
>
> **The audit is effectively closed.** With D and E both Done the five groups read
> **A Done, B Done, C Open (one residual), D Done, E Done** — the single remaining
> item is group C's D2 (b), owned by `WP-dream-git-env-pinning`, and it is an owner
> product decision rather than unfinished work.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop; the adopt-e2e Deliverables
> cell; the basename WP's Table C position clause; the phase-environment contract
> table for `scripts/red-proofs.js`; ADR-0010's "adopt requires the user to
> confirm" sentence vs `--yes`; the orphaned `(ii)` sub-bullet at step 19 in
> `src/cli/dream.js`; the durability WP's five; and audit-D's errata 3–6)
> **plus this WP's errata 1, 3 and 4:** the fixture-helper header comment at
> `tests/unit/dream-validate.test.js:3790-3791` that states the session-id
> convention more broadly than C18 and C40-authorization follow it (erratum 1, band
> C, non-blocking — it should say "on the section last-wins surfaces"); Table D not
> stating that a RED proof's `signal` is a **literal substring of the assertion's
> own message argument** as it reaches the TAP diagnostic, discoverable only by
> running the RED phase (erratum 3); and criterion 7's absolute count (erratum 4).
> **Also recorded, not defects:** the size-ceiling residual **F6** — 594 lines
> against a ~400 ceiling, all contract and corpus, **zero gate machinery added in
> any round** — and **C26's lookup-detector-only reach** as a stated property of
> Table D. **The audit-D input-bound unit question is CLOSED — ruled directly by the
> owner on 2026-09-06 (*"agreed. let us keep characters."*): step 0 stays at 998
> CHARACTERS as item 8 says, step 7 at 998 UTF-8 octets; no output-safety consequence
> either way, and the character bound is the more permissive. Record:
> `docs/specs/logbook/2026-09-05-owner-rulings-audit-d-queue.md`.
>
> **Next in the queue:** `WP-process-runbook-sweeps`, then
> `WP-dream-git-env-pinning` (**owner product decision** — the maturing architect
> records a recommendation with the cost of overruling it). After those, the
> successors: `WP-quarantine-disposal-durability` (**Draft**), and unfiled —
> `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the owner's named
> option **(c)** (mid-trim of `References`), and the criterion-7 one-test follow-up
> from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 (day session of 2026-09-05, owner-authorized
> merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | D | `WP-audit-d-code-derived-recipients` | **Done** | design loop #223, implementation #224 (`ee11229f`), filed in this pass | **Design loop: round zero, two clean-context executors, and SIX double-channel rounds** (plugin + hermetic shadow; twelve raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds.md`). **The ADR-0031 breaker fired at round 2** on Table B and the answer was a CONTRACT — the recipient derivation restated as **an ORDER of operations over raw values, bounds before parsing**; every finding across two rounds had been the same defect, parsing before bounding. **The stop criterion fired twice.** At round 3 it was ruled by the orchestrator under the standing instruction as **item 9** (keep the code-derived-recipient verb; the findings were the ORDER contract not yet applied to its own rows). At round 4 the **FINAL** criterion fired on derived header lines exceeding RFC 5322's 998 octets, Table B was **frozen**, and an owner brief was written — answered by the owner's **DIRECT ruling (a)**, refuse at the output, which became **item 10** and the first non-standing-instruction decision of the queue. **Round 6 returned zero product findings on both channels** and the loop closed under Weighted closure, verified by an independent clean-context executor. **Implementation: two rounds of the triple-channel PR gate** — round 1 plugin clean (a reading; its tests were sandbox-blocked, disclosed), shadow *"patch is correct"* with zero findings, wd-reviewer REQUEST-CHANGES **with no product finding** (a spec contradiction inside Table C); **errata 1 (the vendored-skill digest anchor missing from Deliverables) and 2 (a mutation parenthetical contradicting its own table's rule) landed on the branch** before merge; round 2 APPROVE / clean / *"patch is correct"*. Merged tree: `2638/2626/0/12`, **53 proofs PROVEN**, lint clean. **Six dated errata** in the filed spec |
> | E | `WP-audit-e-ledger-parser-corpus` | **Ready → implementation PR #226 open, gate round 1 in progress** at the time of writing | design loop #225 | Round zero, two clean-context executors and **two double-channel rounds**; **two ADR-0031 extractions**; a **43-row hostile corpus** and **44 declared proofs** |
>
> **Owner rulings this session, verbatim.** Merges were authorized for the
> session: *"You are hereby authorized to perform merges in this session. Go
> ahead and merge 223 once you are ready for it."* And the audit-D escalation was
> ruled **directly**, after the owner read the ruling brief: *"go with a) as you
> recommended"* — recorded on its own in
> `docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`,
> deliberately kept apart from the nine items dispatched under the standing
> instruction (`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-queue.md`).
> **A tree should be able to tell a decision the owner made from a
> recommendation dispatched under a standing authorization**, which is why the
> two records are separate.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop grading against the
> pre-filesystem spelling; the adopt-e2e Deliverables cell's setup enumeration
> omitting the PATH stub; the basename WP's Table C position clause; the
> phase-environment contract table for `scripts/red-proofs.js`; ADR-0010's
> "adopt requires the user to confirm" sentence vs `--yes`; the orphaned `(ii)`
> sub-bullet at step 19 in `src/cli/dream.js`; and the durability WP's five)
> **plus this WP's errata 3–6:** the one `[AUD-D*]` assertion with no band marker
> at `tests/unit/broker-verbs.test.js:626`, which is a test-constructed
> precondition no product mutation can redden — the rule needs a carve-out and
> the mechanical check it has always lacked (erratum 3, successor
> `WP-red-proofs-marker-audit`, **not filed**); acceptance criterion 7's second
> clause, unasserted by V1 though reviewer-verified TRUE — a one-test follow-up
> (erratum 4); the `classesFor` pass-through alias at
> `src/cli/gws-broker.js:102`, semantically identical and pinned through by both
> RED proofs (erratum 5, hygiene); and erratum 2's missing Mirrored Surface
> Checklist line, **fixed in this pass** (erratum 6). **Plus the OPEN owner
> question:** whether the input bound should be restated in UTF-8 octets to match
> the output bound — **no output-safety consequence either way, but availability
> differs**, and the character bound as ruled is the more permissive.
>
> **Next in the queue:** `WP-audit-e-ledger-parser-corpus` (finish the gate,
> merge, done-flip), then `WP-process-runbook-sweeps`, then
> `WP-dream-git-env-pinning`; after those the successors —
> `WP-quarantine-disposal-durability` (**Draft**), and unfiled:
> `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, and the owner's
> named option **(c)**, mid-trim of `References`.
>
> **Status pass, 2026-09-05 (overnight continuation #3, owner-authorized
> merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3b successor | `WP-quarantine-preserve-durability` | **Done** | design loop #220 (`bb58e398`), implementation #221 (`c891e0b6`), filed in this pass | **Design loop: round zero plus ELEVEN double-channel rounds** (plugin gate + hermetic shadow on every one, twenty-two raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-quarantine-preserve-durability-design-gate-rounds.md`). **The ADR-0031 circuit breaker fired TWICE and both times the answer was a CONTRACT, not a third patch** — round 2, the same-UID substitution family → Table F row **F10, THE ADVERSARY** (GUARANTEED / DISCLOSED / OUTSIDE, on `docs/THREAT-MODEL.md`'s A12); round 9, the flushed-bytes clause → **"an ORDER, not a COVERAGE"**. **Escalation (ii) parked FOUR owner items** (5 at round 2, 6 at round 4, 7 at round 6, 8 at round 9), taking the Dispatch precondition to **eight**, all eight ruled under the owner's standing *"go with your recommendations"* (record: `docs/specs/logbook/2026-09-05-owner-rulings-durability-queue.md`; the owner may reverse any by dated amendment, each with a stated cost). **Implementation: three rounds of the triple-channel PR gate** — round 1 wd-reviewer REQUEST-CHANGES **with no `src/` change requested** (a permission-boundary overrun it judged a SPEC defect, plus six declined V1/V2 states the reviewer ran itself), plugin P2 (win32 flush assumption), shadow two C; round 2 APPROVE with the census escalated, **one P2 converged across plugin and shadow**; round 3 APPROVE / *"patch is correct"* / one AIX P2. Merged tree: `npm test` `2630/2618/0/12`, `npm run red-proofs` 37/37 `RUN: PROVEN` with seven roll-up lines, lint clean. **Five dated errata** in the filed spec |
> | 3c | `WP-quarantine-disposal-durability` | **Draft** (stub) | — | The SPLIT (owner item 4). `depends_on` the durability spec; inherits the protocol, and with it the D1/D2 removals and `pruneRedactedOriginals`' eviction, which are still not crash-durable |
>
> **The audit status table's group C row is unchanged by this pass** — still its
> one residual (D2 (b), `WP-dream-git-env-pinning`).
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop grading against the
> pre-filesystem spelling; the adopt-e2e Deliverables cell's setup enumeration
> omitting the PATH stub; the basename WP's Table C position clause; the
> phase-environment contract table for `scripts/red-proofs.js`; ADR-0010's
> "adopt requires the user to confirm" sentence vs `--yes`; the orphaned `(ii)`
> sub-bullet at step 19 in `src/cli/dream.js`) **plus this WP's errata:** the
> Deliverables prose census extracted into a canonical table with criterion 10
> asserting the table (erratum 1, and the THIRD stale test title at
> `tests/unit/dream-validate.test.js:2442` that the two-title boundary forbade
> fixing); the missing **F3 chain-membership** bullet in the Mirrored Surface
> Checklist (erratum 2); `O_DIRECTORY` OR'd unguarded at
> `src/core/dream/validate.js:672-675` (erratum 3, cosmetic); row **F5**'s
> platform wording — name `darwin` and `linux` as the supported POSIX platforms
> and record other POSIX as neither measured nor supported (erratum 4); the D3
> observer comment saying "by INODE" over a fixture that keys on the fd number
> (erratum 5).
>
> **Next in the queue:** `WP-audit-d-code-derived-recipients`,
> `WP-audit-e-ledger-parser-corpus`, `WP-process-runbook-sweeps`,
> `WP-dream-git-env-pinning`. **Product decision, settled by the 2026-09-05
> rulings record — it settled the PROCESS, not just the eight items:** the
> maturing architect records a recommendation with the cost of overruling it,
> and the session may dispatch under that recommendation, the owner reversing
> any of them by dated amendment. Two proposed successors stand behind the
> queue: `WP-quarantine-only-copy-shelf` (**not filed**) and
> `WP-quarantine-disposal-durability` (**filed, Draft**).
>
> **Status pass, 2026-09-05 (overnight continuation #2, owner-authorized
> merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3b | `WP-quarantine-banner-location` | **Done** | design loop #217 (round zero + 5 double-channel rounds; **circuit breaker at round 2** — two consecutive A findings on "is the pointer's destination real?" were settled by DELETING the defect: row L7 reorders the undelivered-record print to step 17b, ahead of every durable write, which removes the crash window instead of narrowing the sentence a third time; round 3 moved the fault-injection seam to the ledger boundary, the first durable claim; **round 4's plugin run was voided by an orchestrator write into the reviewed worktree** and made good at round 5, where both channels were valid and returned one wording finding), implementation #218 (**one round** of the triple-channel PR gate, clean on the first tip: wd-reviewer APPROVE, plugin clean, shadow "patch is correct"; **four Band C findings → four dated errata** in the filed spec), filed in this pass | The four ledger-derived carriers (Table L rows L1–L4) now render one code-owned `PRESERVED_COPIES_POINTER` sentence naming no folder and instructing no delete; two RED-proof declaration files, four hand-written identities, five roll-up lines. **Dispatched under three architect recommendations the owner may reverse by dated amendment** (record: `docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md`): (1) confirm the four surfaces; (2) route L5's clearing sentence to `WP-quarantine-only-copy-shelf` rather than absorb it — `src/core/digest.js` stayed outside the boundary; (3) accept the pre-upgrade legacy crash-window record as a named residual, decided in Table L row **L0**, its durable half inherited by `WP-quarantine-preserve-durability` |
> | 3c | `WP-quarantine-preserve-durability` | Draft → in design | — | wd-architect matured it to **1043 lines** at `284144db` on `docs/wp-quarantine-preserve-durability`. **SPLIT**: `WP-quarantine-disposal-durability` filed as a Draft stub on that branch. Four owner items, each carrying a recommendation. Round zero is done; the external double-channel rounds are next |
> | 6–9 | unchanged | Draft | — | — |
>
> Round records and raws: `docs/specs/logbook/2026-09-05-quarantine-banner-*`.
> **Residuals routed to wd-architect, not dispatched** — the earlier list,
> carried forward unchanged, plus one new: the dot-segment spec's own V2 B3 loop
> grades against the pre-filesystem spelling (state the B3 pre-step once —
> `topLevelDirs`' `readdirSync`, then `pick`'s trim, then the `reports_dir` join
> — with V2 and the test file as registered mirrors); the adopt-e2e Deliverables
> cell's setup enumeration omits the PATH stub; the basename WP's Table C
> position clause; the phase-environment contract table for
> `scripts/red-proofs.js`; ADR-0010's "adopt requires the user to confirm"
> sentence vs `--yes`; **NEW —** the orphaned `(ii)` sub-bullet left at step 19
> in `src/cli/dream.js` by row L7's move (erratum 2 of the filed banner spec
> accepts the orphan on the record; a successor with an independent reason to be
> in that block may renumber it as part of step 19). The audit status table
> above is unchanged by this pass — group C still has its one residual
> (D2 (b), `WP-dream-git-env-pinning`).
>
> **Status pass, 2026-09-05 (overnight continuation of the 09-04 session,
> owner-authorized merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 4→ | `WP-dot-segment-denial` | **Done** | design loop #214 (round zero + 3 double-channel rounds; circuit breaker at round 2 — two hand-shaped sample families replaced by EQUALITY with a one-line reference predicate over a seeded full-alphabet generator; round 3 hardened the grading's inputs), implementation #215 (three-round triple-channel PR gate: PATH stub for the adopt round-trip test, `readdirSync`-derived B3 spelling, a non-vacuous seven-key round-trip oracle), filed in this pass | The class rule is enforced at `makeAdmit` (loop placed LAST), `isSafeRelativePath` (shared by `layout.js` and `layout-infer.js`) and thereby `adopt --yes`; two RED proofs over six named test identities. Dispatched under the architect's recommendation (the reader's per-key silent fallback stays silent) — the owner may reverse by dated amendment |
> | 3b, 6–9 | unchanged | Draft | — | next: `WP-quarantine-banner-location` → `WP-quarantine-preserve-durability` (owner-sequenced), `WP-audit-d-…`, `WP-audit-e-…`, `WP-process-runbook-sweeps`; `WP-dream-git-env-pinning` still needs the owner's product decision |
>
> **Residuals routed to wd-architect, not dispatched:** the dot-segment spec's
> own V2 B3 loop grades against the pre-filesystem spelling (state the B3
> pre-step once — `topLevelDirs`' `readdirSync`, then `pick`'s trim, then the
> `reports_dir` join — with V2 and the test file as registered mirrors); the
> adopt-e2e Deliverables cell's setup enumeration omits the PATH stub; the
> basename WP's Table C position clause; the phase-environment contract table
> for `scripts/red-proofs.js`; ADR-0010's "adopt requires the user to confirm"
> sentence vs `--yes`. Audit group C is down to ONE residual (row below).
>
> **Status pass, 2026-09-04 (owner-authorized merges; rulings given at
> ~12:50).** Measured on `main` at the time of writing, not from memory:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 2 | `WP-index-guard-residuals` | **Done** | #203, filed #207 | — |
> | 3a | `WP-preservation-abort-widening` | **Done** | #205, filed #207 | successor `WP-quarantine-preserve-durability` stays Draft, owner-sequenced after 3b |
> | 4 | `WP-audit-c-close-disposition` | **Done** | #202, filed #207 | group C row below: D1 (c) is now CLOSED in code (see next row); D1 (b)/D5 and D2 (b) stay open |
> | 5 | `WP-criterion-red-harness` | **Done** | #204, filed #207 | ADR-0042 **owner-signed** 2026-09-02, landed #208; successors `WP-red-proofs-{ci-lane,doctrine,adopt-index-guard}` still proposed ids, not filed |
> | 4→ | `WP-instruction-basename-currency` | **Done** | design loop #210 (round zero + 3 double-channel rounds, circuit breaker at round 2 — the loop closed by DELETING machinery: whole-artifact byte compares + one hand-written literal set), implementation #211 (two-round triple-channel PR gate), filed #212 | `INSTRUCTION_BASENAMES` is nine names; `docs/instruction-file-inventory.md` is GENERATED by V3 `--write`, never hand-edited; `docs/runbooks/release.md` step 2 carries the re-inventory obligation. Dispatched under the architect's two recommendations (deny all nine incl. `replit.md`/`AGENT.md`; obligation owner = the release-maintainer role) — the owner may reverse either by dated amendment |
> | 4→ | `WP-dot-segment-denial` | Draft → in design | — | wd-architect maturing on `docs/wp-dot-segment-denial`; closes the sibling's 17 HANDOFF rows |
> | W1 | wording follow-ups from #203/#204/#205 | **Done** | #209 | seven routed findings closed with dated errata; the `computed` JSDoc is a registered residual in W1(c) |
> | 3b, 6–9 | unchanged | Draft | — | — |
>
> Round records and raws: `docs/specs/logbook/2026-09-04-*`. **Residuals
> routed to wd-architect, not dispatched:** the Table C position clause for
> the basename WP (the re-inventory step must precede the bump and publish —
> say so in prose; V4 stays rot-free); no canonical table yet for the
> phase-environment contract in `scripts/red-proofs.js` (owner contract
> decision). **Process:** the herdr shadow's auto-approver is blocked by the
> permission classifier; the shadow now runs as
> `codex exec -s read-only -o <file>` with `CODEX_HOME=~/.codex-review-home`
> (no approvals, report captured verbatim; its sandbox denies even OS-temp
> writes, so mutant probes run in memory).
>
> **Status pass, 2026-09-02 (overnight autonomous run, owner-authorized
> merges).** Items 1–5 below have all been through the double-gate design loop;
> none is implemented — each is `Ready` and parked on an owner ruling recorded
> in its Dispatch precondition. Measured, not from memory:
>
> | # | Spec | State | Landed in | Owner item parked |
> |---|------|-------|-----------|-------------------|
> | 1 | `WP-show-slot-own-value-kind` | **Done** | #192–#195 | — |
> | 2 | `WP-index-guard-residuals` | Ready | #196 | **ruled 2026-09-02: ratified** — see `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md` |
> | 3a | `WP-preservation-abort-widening` (+ Draft `WP-quarantine-preserve-durability`) | Ready (M) | #197 | **ruled 2026-09-02: fail-loud confirmed; durability WP sequenced after the banner WP** |
> | 3b | `WP-quarantine-banner-location` | Draft | — | depends on 3a |
> | 4 | `WP-audit-c-close-disposition` (+ Draft `WP-dot-segment-denial`, `WP-instruction-basename-currency`; amendment to `WP-dream-git-env-pinning`) | Ready | #199 | **ruled 2026-09-02: QUEUED (option i)** — basename-currency then dot-segment-denial in normal order; the gate had found M7 LIVE beneath tiers and M9's environment half LIVE (`GIT_DIR` / `GIT_OBJECT_DIRECTORY`); **group C stays Open** |
> | 5 | `WP-criterion-red-harness` (+ ADR-0042) | Ready (M) | #198 | **ruled 2026-09-02: ADR-0042 signed; Node options stay parked per the spec's recommendations** |
> | 6–9 | unchanged | Draft | — | — |
>
> Round records and raw gate outputs: `docs/specs/logbook/2026-09-01-*` and
> `2026-09-02-*`. The audit status table above is NOT updated here — row C's
> cell is `WP-audit-c-close-disposition`'s own deliverable.
>
> **Status pass, 2026-09-02 afternoon (owner rulings landed; every Ready WP
> implemented).** The four parked rulings were given on 2026-09-02 (record:
> `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md`, PR #201) and all
> four Ready WPs went through implementation and the PR double gate (wd-reviewer,
> Codex plugin and hermetic herdr shadow, raws committed pre-adjudication under
> `docs/specs/logbook/2026-09-02-*-pr20N-raw-round*`). Measured at the time of
> writing:
>
> | # | Spec | PR | Rounds | Gate state | Merge note |
> |---|------|----|--------|------------|------------|
> | — | owner rulings record | #201 | — | docs-only, CI green | merge FIRST (the #202 stubs and logbook cite it) |
> | 2 | `WP-index-guard-residuals` | #203 | 2 | APPROVE / shadow clean / plugin P2 residual (concurred, routed to wd-architect) | any order |
> | 3a | `WP-preservation-abort-widening` | #205 | 4 | APPROVE / clean / clean | after #203 (both touch `src/cli/dream.js` comments and the done specs) |
> | 4 | `WP-audit-c-close-disposition` | #202 | 3 | APPROVE / clean / 1×C fixed; files `WP-instruction-basename-currency` and `WP-dot-segment-denial` as Draft stubs; group C row below reads **Open — four residuals** once merged | after #201 |
> | 5 | `WP-criterion-red-harness` | #204 | 14 | plugin CLEAN / wd-reviewer APPROVE / shadow clean on f729ba04; nineteen gate-found defects closed (see the PR's closing comment) | last |
>
> **What the gates caught after the implementers' own green** (the reason the
> rounds exist): #204 — pinned TAP shapes were Node-25-only and CI's Node 20 went
> red; six false-PROVEN paths (alias `..`, accepted zero-run CONTROL, dropped
> namesake test, ignored added declaration, `-`-prefixed suite path, UTF-8
> decode rewriting bytes outside the mutation). #205 — a `.tmp-${pid}` overwrite
> of a crash leftover, then the fix's own regression (ownership recorded after
> the whole write; reproduced with a real `ulimit -f` EFBIG). #202 — Table D
> cells claiming more than V1/V2 recorded, fixed by making V2 (b) prove the
> claims; tier-local `copilot-instructions.md` is not a documented Copilot path.
>
> **Follow-ups for wd-architect, not dispatched:** the W1 wording family from
> #203 (positional citations in `docs/specs/done/WP-show-slot-own-value-kind.md`
> rotted by the test file's growth; the `computed` JSDoc; the (c)(i)/(c)(ii)
> scope framing); `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1565`
> (B3b's action cell instructs carrying the basename, which the pair rule now
> forbids); `WP-criterion-red-harness.md:446` (stale round-5 "provided set" line).
>
> **Next in the queue:** `WP-quarantine-banner-location` →
> `WP-quarantine-preserve-durability` (owner-sequenced 2026-09-02);
> `WP-instruction-basename-currency` → `WP-dot-segment-denial` (ruled option
> (i), QUEUED); items 6–9 unchanged; `WP-dream-git-env-pinning` still needs the
> owner's product decision.

Every item below has a Draft spec stub. **The stubs are deliberately Draft:
they carry the context, the intent, the known traps and the done-definition,
but they have NOT been through spec review.** Maturing one to Ready (via
`wd-architect`) is the first step of picking it up. Do them one at a time.

1. `WP-show-slot-own-value-kind` — the one open *spec decision* from the
   promote-in family's guard (a `show` option-position gap + a mirror drift).
2. `WP-index-guard-residuals` — three small measured residuals from the same
   family (one is a one-line fix).
3. `WP-preservation-abort-widening` then `WP-quarantine-banner-location` —
   two small, fully measured fixes; sequenced in that order by owner ruling.
4. `WP-audit-c-close-disposition` — measure C2 (git seam) and C3 (layout)
   against the landed architecture; much of both is likely mooted by the
   promote-in inversion, but "likely" is not a disposition.
5. `WP-criterion-red-harness` — the test-quality harness. This session found
   **ten-plus vacuous (false-green) assertions**, every one via mutation, none
   via existence checks. Highest-leverage protection for all future work.
6. `WP-audit-d-code-derived-recipients` — the larger of the two untouched
   audit groups.
7. `WP-audit-e-ledger-parser-corpus` — the smaller untouched group, with a
   measured history of expensive verification: watch the size discipline.
8. `WP-process-runbook-sweeps` — codify the paid-for working disciplines into
   the runbooks (docs-only).
9. `WP-dream-git-env-pinning` — a registered product-hardening *candidate*;
   requires an owner product decision, not just implementation.

## What to watch for (the compressed discipline)

These rules were each paid for at least once in this program. The full set is
in `memory/lessons/inbox.md`; these are the ones that prevent the expensive
failure modes:

- **The proof of a fix is the re-grep/re-run, never the edit.** Report what
  the tool printed, not what you intended.
- **Read the tool's own summary, not your regex's match count.**
- **A +0 test delta on a test that dies before your change proves nothing**
  — check *where* it dies relative to what you touched.
- **`+0/−0` beside a claimed content change is a failure signature** (a
  `git mv` + unstaged edit). Prove the commit (`git show HEAD:<path>`), not
  the working tree.
- **Prove a mutation was applied before believing its matrix** (grep the
  injected marker); a guard must notice its own death.
- **Enumerating the BAD is unclosable when the grammar isn't yours;
  enumerating your OWN GOOD is closable** — the promote-in guard's central
  result; respect it in any allowlist/denylist design.
- **Distinguish FORM insufficiency from a PREDICATE defect** before reopening
  a review loop: form = the deciding facts never reach the observation point;
  predicate = the facts are there, the question is wrong. Only form is a
  design question.
- **Two consecutive review rounds on one contract family → extract the
  contract (ADR-0031), never a third patch.** Measured: two rounds of
  patching injected four defects; one contract round injected zero.
- **Sweep claims, not sentences**: whitespace-flattened, pronoun-aware,
  family-wide; a file swept by hand is not inside its own proof.
- **Materiality bands on every review round** (A: silent wrong behavior with
  data-loss/security consequence; B: caught downstream; C: hygiene). Counts
  without bands are not decision-grade.

## Process notes

- The review-gate flow that converged: two independent gates on the SAME tip,
  both verdicts on that tip, a pinned reading before each round ("clean or
  C-only → proceed; anything above C returns banded"), and a stop criterion
  pinned in advance for repeated same-family findings.
- CI runs are billing-blocked on this fork at handover time; the local gate
  protocol is in `memory/` history and PR bodies: run `npm test`,
  `npm run lint` and `scripts/boundary-check.js` on the simulated merge and
  paste outputs into the PR body. `tests/integration/adopt-e2e.test.js` is
  always red on the original machine (machine-local executable pin) — that
  failure is environmental; see the +0-delta rule above before trusting it.
- `gh` may resolve this checkout to the upstream repo — always pass
  `--repo <your fork>` explicitly.
