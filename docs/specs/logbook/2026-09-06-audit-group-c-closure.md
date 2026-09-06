---
date: 2026-09-06
title: "Audit group C — the E2 disposition act: every mechanism retired or accepted"
related_wps: [WP-audit-c-close-disposition, WP-dot-segment-denial, WP-instruction-basename-currency, WP-dream-git-env-pinning, WP-dream-git-env-validate-seam]
---

# Audit group C — the E2 disposition act

This is the **basis file** `WP-audit-c-close-disposition` Table E row **E2**
points at: *"Closed — every group C mechanism retired or accepted; basis in
`<LOGBOOK>`. Written by a later disposition act once every successor in that
entry's Table D is Done with its own verification green."* The disposition facts
per finding remain
`docs/specs/logbook/2026-09-02-audit-group-c-disposition.md`'s; **this file adds
only the measurement that E2's precondition is met** and does not restate them.

**Measured on `eedd8783` (`origin/main`), 2026-09-06**, in a documentation-only
worktree. Everything below is a run, not a transcription: `npm test` once, the
whole-tree red-proof runner once on a `git archive` copy, and each owner's own
V-steps **extracted from the filed spec and executed**, never retyped. Nothing
was mutated.

## The measured table

| Table D row | Owner | Done at | Verification run, and result | Disposition |
|---|---|---|---|---|
| **D1 (a)** M7, enumerated instruction basenames | — (mooted at ruling time) | — | whole-tree `npm test` green; the enumeration is `promote.js:99-111` | **RETIRED** by the promote-in inversion; unchanged |
| **D1 (b)** M7, dot segments beneath a tier | `WP-dot-segment-denial` (`done/`, `status: Done`) | impl PR **#215** (`2da074d5`), filed **#216** (`8302ce8e`) | its **V2** re-run here, rc 0: `ref1 2000/2000 \| ref2 2000/2000 \| ref3 1000/1000 \| over 12/12 \| handoff 87/87 \| boundary 39/39` — the implementation EQUALS the reference predicate at all three enforcement points over 5000 full-alphabet samples. Roll-up `WP-dot-segment-denial criterion 1 — PROVEN` | **RETIRED** — the class rule at `src/core/dream/promote.js:274-277` |
| **D1 (c)** M7, stale basename list | `WP-instruction-basename-currency` (`done/`, `Done`) | impl PR **#211** (`c26214cb`), filed **#212** (`9e636118`) | its **V3** rc 0 (`docs/instruction-file-inventory.md` byte-identical to the canonical rendering, 13996 bytes, 10 placeholder sites) and **V4** rc 0 (the release-runbook obligation present exactly once, outside any fence). Roll-up `WP-instruction-basename-currency criterion 7 — PROVEN` | **RETIRED as a currency defect** — `promote.js:99-111`, a dated inventory with an owner and a trigger. Its ruling-time residual is **accepted**, below |
| **D2 (a)** M9, `git add`/`git commit` in the vault | — (mooted at round 1) | — | whole-tree `npm test` green; no `git commit` exists on the dream path | **RETIRED** by `commitNamedSet` — `src/cli/dream.js:259-263`, `commit-tree` + `update-ref`, so `--no-verify` has nothing to suppress |
| **D2 (b)** M9, the unfiltered environment | `WP-dream-git-env-pinning` (`done/`, `Done`) | impl PR **#234** (`e269f5cd`), filed **#235** (`8358655d`) | its **V4** rc 0 (the three declared ids, exactly) and **V5** rc 0 (both out-of-spec mirrors present, row W1's hook residual intact). Roll-ups `criterion 2/3/4 — PROVEN` (`git-env-inherits-git-dir`, `-object-directory`, `-config-count`) | **RETIRED** — the environment is built key by key at `src/core/dream/git-env.js:26-41` and the pipeline seam uses it at `src/cli/dream.js:167-168` |
| **D3** M10, the gitignored region | — (mooted) | — | `grep` over `src/` for `assertCleanTree`/`restoreVaultToHead` outside `validate.js`: **rc 1, no consumer** (re-measured today) | **RETIRED** by the git-free classifier — `src/core/dream/delta.js:77-79` requires `node:fs`, `node:path`, `../errors` and nothing that spawns |
| **D4** C2, the git seam | own-defense half **void**; env half = D2 (b); the second spawn point → `WP-dream-git-env-validate-seam` (`done/`, `Done`) | impl PR **#238** (`ba357a81`), filed **#239** (`eedd8783`) | its **V3** rc 0 (the one declared id), **V4a** rc 0 (the four argv literals byte-exact), **V5** rc 0 (the Table W row W1(c)(i) amendment present, hook residual intact). Roll-up `WP-dream-git-env-validate-seam criterion 1 — PROVEN` | **RETIRED** — `assertGitRepo`'s spawn now carries the same construction, `src/core/dream/validate.js:65-71`. Its nested-vault finding is **accepted**, below |
| **D5** C3, layout | `WP-dot-segment-denial` (same WP as D1 (b)) | same PRs as D1 (b) | the same V2 run: `boundary 39/39`, `handoff 87/87`, both validators graded. Roll-up as above | **RETIRED** at BOTH validators — the reader `src/core/layout.js:67-73` and the producer `src/core/layout-infer.js:114-117` |

Every citation above was checked at both ends mechanically (`m3-citations.js`,
rc 0); the pasted first and last lines are in the runs below.

## The residuals ACCEPTED rather than retired

E2's words are *"retired **or accepted**"*. Three are accepted, each with a home
that already owns it. **None is reopened by this act, and closure does not
assert any of them is gone.**

1. **The `reference-transaction` hook.** A user hook the run's own contracted
   `update-ref` fires can write the index; it is neither suppressed nor detected.
   **Home:** `docs/specs/done/WP-dream-promote-in-workspace.md` Table W row W1,
   **owner ruling of 2026-08-31**, which also rejects `core.hooksPath`
   suppression by name. `WP-dream-git-env-pinning` recorded the one thing that
   changed — the hook now runs under the constructed environment — as row U20's
   named cost, explicitly **not** a narrowing of the residual. Verified present
   today: both env WPs' V5 greps (`NEITHER SUPPRESSED NOR DETECTED`) pass.
2. **The nested vault.** `assertGitRepo` establishes that the vault is INSIDE a
   repository, not that it IS one; a non-repository vault directory within one is
   targeted at the ancestor by **discovery**, with no environment variable
   involved, and `wienerdog adopt` accepts that configuration today (measured,
   `WP-dream-git-env-validate-seam` VS-P4). **Home:** that WP's owner item **O5**,
   adopted under the standing process, and — as the act it required — the shipped
   contract itself: `src/core/dream/validate.js:84-95` names it in
   `assertGitRepo`'s own JSDoc. The two hardening answers are parked there with
   their user-visible cost.
3. **An undocumented tool's instruction file.** The ruling-time residual of D1
   (c) — *"an unknown tool's instruction file passes"* — is not closed by a
   longer list and was never claimed to be. **Home:**
   `WP-instruction-basename-currency`'s dated inventory
   (`docs/instruction-file-inventory.md`), its accepted omissions, and its named
   owner plus objective trigger, all re-verified green today (V3, V4).

**One standing-discipline note, carried forward rather than closed** (Table D row
D3): `restoreVaultToHead`'s `git clean -fd` still exists, exported and with no
consumer in `src/` — re-measured today, rc 1. A future WP that re-wires it
re-opens M10's `-fd`-not-`-x` question and must re-run that row's steps.

## The runs

**`npm test`** — rc 0, on the worktree:

```text
ℹ tests 2693
ℹ suites 0
ℹ pass 2681
ℹ fail 0
ℹ skipped 12
ℹ duration_ms 49144.181292
```

**`node scripts/red-proofs.js --root <git archive copy>`** — rc 0. The archive
copy is required because a shared-dependency worktree's `node_modules` is a
symlink, which the runner refuses at SNAPSHOT.

```text
64 declared proof(s), 64 selected
snapshot: 1403 entries under the declared domain (`.git/` and `node_modules/` excluded)
…
PROVEN       WP-dot-segment-denial criterion 1 — dot-segment-admit-reverted=PROVEN; dot-segment-layout-reverted=PROVEN
PROVEN       WP-instruction-basename-currency criterion 7 — instruction-basenames-reverted=PROVEN
PROVEN       WP-dream-git-env-pinning criterion 2 — git-env-inherits-git-dir=PROVEN
PROVEN       WP-dream-git-env-pinning criterion 3 — git-env-inherits-object-directory=PROVEN
PROVEN       WP-dream-git-env-pinning criterion 4 — git-env-inherits-config-count=PROVEN
PROVEN       WP-dream-git-env-validate-seam criterion 1 — validate-git-inherits-git-dir=PROVEN
RUN: PROVEN
```

**Each owner's own V-steps, extracted from the filed spec and run** (`m2-vsteps.sh`):

```text
-- pinning-V4  rc=0   git-env-inherits-config-count,git-env-inherits-git-dir,git-env-inherits-object-directory
-- pinning-V5  rc=0   V5 OK
-- seam-V3     rc=0   validate-git-inherits-git-dir
-- seam-V4a    rc=0   V4a OK — presence screen only
-- seam-V5     rc=0   V5 OK
-- currency-V3 rc=0   V3 OK: docs/instruction-file-inventory.md is byte-identical to the canonical rendering … (13996 bytes utf8, 10 placeholder sites)
-- currency-V4 rc=0   V4 OK: docs/runbooks/release.md carries the canonical step body exactly once, outside any fence (525 bytes utf8)
-- dot-segment-V2 rc=0
     seed 1788668824955  samples 1000 per enforcement point
     generator: 112 distinct first code points of 112, leading-dot share 0.507
     ref1 2000/2000 | ref2 2000/2000 | ref3 1000/1000 | over 12/12 | handoff 87/87 | boundary 39/39
     V2 OK: the implementation EQUALS the reference predicate at all three enforcement points over 5000 full-alphabet samples, Table D is closed, Table E holds, and nothing dot-free is over-denied
```

**Steps NOT re-run, each with the reason** — none is a gap in the evidence:

- **Every owner's `V1` (`npm test`) and every `--wp` red-proof selection**
  (dot-segment V3, currency V5, pinning V3, seam V2's second line): subsumed by
  the two whole-tree runs above, and a `--wp` selection exits 1 **by the runner's
  design** while any other WP has declarations, so its exit code was never the
  evidence.
- **Every owner's repo-gate step** (`boundary-check … $(git diff --name-only main...HEAD)`),
  and `WP-audit-c-close-disposition`'s own **V6**: **implementation-time only.**
  Both grade a WP's changed-file set against its Deliverables, and on `main`
  after the merge that set is empty; V6 additionally asserts a one-line HANDOVER
  diff, which this act does not have and is not claimed to. Each was green on its
  own PR.
- **`WP-dream-git-env-validate-seam`'s V4** — re-run, **rc 1**, and that is the
  step working: its base guard refuses when `src/core/dream/validate.js` differs
  in content between the pinned base `8358655d` and the merge-base, and on `main`
  it differs **because that WP's own change landed there**. It is an
  implementation-branch step by construction; its green is PR #238's.

## STOP CRITERION — pinned before the one external round

**One external double-channel round runs on this act.** Its subject is narrow:
**every claim here is a measurement, so a finding is either a false measurement
or it is not about this act.**

- **CLOSE** — the round finds no false measured claim. Machinery or wording
  findings are fixed in place and do not extend the loop.
- **RE-MEASURE** — a channel shows a Done/green claim to be false: an owner not
  actually `Done`, a roll-up that does not read `PROVEN`, a V-step that does not
  reproduce, or a citation that does not resolve at both ends. The answer is to
  **re-run the measurement and correct the table**, never to argue the cell — and
  if the correction removes a green, **E2 is withdrawn and group C returns to
  E1** with the failing row named.
- **OWNER item, parked, NOT blocking** — a channel argues that one of the three
  accepted residuals should be *fixed* rather than accepted. That is a product
  proposal about a residual whose home already owns it (Table W row W1's owner
  ruling; O5's parked answers with their user-visible cost; the currency
  inventory's trigger). It is appended to
  `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md` with an
  enumerated overrule cost and does not hold the act open — accepting a named
  residual is what E2's own words allow.
- A finding that group C should not close **because a residual exists at all**
  is the same item in different words, and gets the same disposition.
