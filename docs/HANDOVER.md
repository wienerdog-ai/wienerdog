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
| C | Dream write fence (machinery-controlling files) | **Open — one residual** (D1 (c) CLOSED by `WP-instruction-basename-currency`, #211; D1 (b) and D5 CLOSED by `WP-dot-segment-denial`, #215; D2 (b) — the run's git calls inherit `process.env` — stays with `WP-dream-git-env-pinning`, owner product decision) — the promote-in family retired M10 and the git-commit half of M9, and the promotion allowlist retired the enumerated instruction basenames; four mechanisms remain live, measured. Basis per finding in `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md`. Owners: `WP-dot-segment-denial`, `WP-instruction-basename-currency`, `WP-dream-git-env-pinning` |
| D | Code-derived draft recipients (no verb accepts a model-named address) | **Not started** — full harvested basis in `WP-audit-d-code-derived-recipients` |
| E | Ledger-parser correctness + hostile corpus | **Not started** — full harvested basis in `WP-audit-e-ledger-parser-corpus` |

Two known status anomalies at handover time:
`docs/specs/WP-ep2-unscannable-preserve.md` was still In-Review after its PR
(#57) merged — a done-flip PR accompanies this handover.
`docs/specs/WP-contract-reference-tables.md` sits In-Review; its
implementation state was not re-verified during handover — measure before
resuming it.

## The remaining work, in recommended order

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
