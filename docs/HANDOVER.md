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
| C | Dream write fence (machinery-controlling files) | **Structurally closed** by the promote-in family: the brain writes a workspace; only promoted content enters the vault through `writeIntoVault`. Five WPs Done (`WP-dream-workspace-retarget`, `WP-dream-vault-write-primitive`, `WP-dream-promote-module`, `WP-dream-promote-report`, `WP-dream-promote-in-workspace`). Remaining: formal C2/C3 disposition — see `WP-audit-c-close-disposition` |
| D | Code-derived draft recipients (no verb accepts a model-named address) | **Not started** — full harvested basis in `WP-audit-d-code-derived-recipients` |
| E | Ledger-parser correctness + hostile corpus | **Not started** — full harvested basis in `WP-audit-e-ledger-parser-corpus` |

Two known status anomalies at handover time:
`docs/specs/WP-ep2-unscannable-preserve.md` was still In-Review after its PR
(#57) merged — a done-flip PR accompanies this handover.
`docs/specs/WP-contract-reference-tables.md` sits In-Review; its
implementation state was not re-verified during handover — measure before
resuming it.

## The remaining work, in recommended order

> **Status pass, 2026-09-02 (overnight autonomous run, owner-authorized
> merges).** Items 1–5 below have all been through the double-gate design loop;
> none is implemented — each is `Ready` and parked on an owner ruling recorded
> in its Dispatch precondition. Measured, not from memory:
>
> | # | Spec | State | Landed in | Owner item parked |
> |---|------|-------|-----------|-------------------|
> | 1 | `WP-show-slot-own-value-kind` | **Done** | #192–#195 | — |
> | 2 | `WP-index-guard-residuals` | Ready | #196 | refusing to judge a non-absolute private `GIT_INDEX_FILE` is not a fifth failure mode |
> | 3a | `WP-preservation-abort-widening` (+ Draft `WP-quarantine-preserve-durability`) | Ready (M) | #197 | whole-run fail-loud blast radius; successor sequencing |
> | 3b | `WP-quarantine-banner-location` | Draft | — | depends on 3a |
> | 4 | `WP-audit-c-close-disposition` (+ Draft `WP-dot-segment-denial`, `WP-instruction-basename-currency`; amendment to `WP-dream-git-env-pinning`) | Ready | #199 | **queued WP or incident?** — the gate found M7 LIVE beneath tiers (dot-prefixed directories and unenumerated instruction basenames are promotable) and M9's environment half LIVE (`GIT_DIR` / `GIT_OBJECT_DIRECTORY` redirect the run's writes); **group C stays Open** |
> | 5 | `WP-criterion-red-harness` (+ ADR-0042 Proposed) | Ready (M) | #198 | ratify ADR-0042; options: `engines` ≥ 18.15, Node matrix |
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
