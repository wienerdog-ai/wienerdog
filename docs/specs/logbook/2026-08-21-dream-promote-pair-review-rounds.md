---
title: Review rounds — the promote-in stacked pair
date: 2026-08-21
---

# Review rounds — WP-dream-workspace-retarget + WP-dream-promote-in-workspace

Specs: `docs/specs/WP-dream-workspace-retarget.md` (Part i),
`docs/specs/WP-dream-promote-in-workspace.md` (Part ii). Base:
`wp/dream-promote-in-workspace` @ `4dfd1e8` (src/ byte-identical to the pinned
`025021f`). Round zero: see
`2026-08-21-dream-promote-pair-round-zero.md` — closed GREEN after fixes;
nothing from it carries review credit here.

**Round counter starts at ONE.** The external reviewer is the other model
family (Codex side), per the 1a precedent. Rounds run on the Draft specs on
this branch; `Ready` comes after the loop closes.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the
  PRODUCT — nothing that changes what the implementer builds in `src/` or
  `tests/`.
- **THE FAMILY ESCALATION for this package:** its characteristic failure is
  **a vault write that bypasses the promotion decision** — the whole inversion
  exists so the vault is reachable only through promotion, so any path that
  reaches it otherwise (a spawn-seam leak, a merge writing in place, a
  publish outside the compare-window guard, an abort path touching the vault)
  is the family to watch. If a round lands twice on that family, it returns to
  the owner as a ruling request with the split seam itself on the table.
- **Otherwise:** two consecutive rounds on any other same contract family →
  contract extraction, not another patch. Two consecutive rounds on an owner
  ruling → owner.

## Round log (append per round)

<!-- Round N: date, reviewer, findings count by severity, dispositions,
     commit that applies the fixes. -->

### Round 1 — 2026-08-21 — reviewer: Codex (gpt-5.6-sol), external

**Does NOT close.** 10 capability findings constructed, 0 questions. The
reviewer's negative controls held (the six re-target sites, the git-free walk
vs `.gitignore`, `git merge-file` conflict-in-place, `precommitSessionEdits` /
`restoreVaultToHead` behaviour, the Part i transitional line, the byte-identical
src/ tree). Five load-bearing claims re-verified here against the code before
dispositioning: F2 (`cli/dream.js:237` clean-tree guard for the unknown-command
path, comment relies on the pre-spawn clean assert), F6 (reap verdict sits
inside `if (pidfile)`, `pidfile` null on tokenless runs — `:149-152`, `:256`,
`:272`), F1 (`delta.js` `lstat`s and treats a hardlink as a regular file, no
`nlink` check), F5 (`adapters/codex.js:24-76` handles `AGENTS.override.md` as a
real shadowing convention), F10 (`layout.js` imposes no cross-key distinctness).
All confirmed.

**FAMILY LANDING (per the stop criterion):** the round lands on the package's
characteristic family — a vault write that bypasses the promotion decision —
via F1, F3, F5, F10. This is the FIRST landing; a second lands the split seam
on the owner's table.

**Dispositions:**

Owner-ruling required (escalated; fixes held until ruled — they reshape the
mechanical ones):
- **F1 — hardlink through the Codex workspace shell writes the vault inode
  DURING the run.** Neither reap nor promotion sees it (damage precedes
  classification). Not closable by promotion-side text alone. Candidate cures
  are structural (Part i): place the workspace on a different filesystem from
  the vault so `ln` across it fails `EXDEV`; or a Codex-arm containment change;
  or accept as a named residual. Owner call.
- **F4 — a concurrent user secret enters the dream commit via a clean C6
  merge, past the pre-merge EP2 scan.** The spec's stated rationale for
  pre-merge scanning ("scanning merged would force discarding the user edit")
  is false — C7 already leaves the user's live version on refusal. Owner call
  on EP2's scope: scan brain-added bytes only (status quo, accepts the hole) vs
  scan every newly-durable byte in the staged candidate (refuses a note for the
  user's own secret) vs stage only brain-attributable bytes.

In-scope spec fixes (Part ii unless noted; applied after the two rulings, since
F1 may move Table A and F4 reshapes F7/F9):
- **F5** — C9 deny-list extended to current instruction-file shapes and control
  namespaces (`CLAUDE.local.md`, `AGENTS.override.md`, any `.md` under
  `.claude/`/`.codex/`), and Part i copy-in exclusions matched; M7 criterion
  broadened past the two exact basenames.
- **F6** — Table G requires an UNCONDITIONAL post-settle reap verdict covering
  tokenless manual runs; acceptance tests both run types.
- **F7** — EP2 gate gains an outcome taxonomy (redact → sanitized candidate
  bytes + artifact + separate counter) per binding ADR-0034, replacing the
  `reason|null` shape for that gate.
- **F9** — `promote()` return gains a typed EP2 disposition summary; Table G
  states how the pipeline's transcript-deferral consumes it (today's
  `secretReverts` signal, `cli/dream.js:568-596`).
- **F2** — Part ii replaces the removed clean-tree non-vacuity signal (the
  unknown-command guard, `cli/dream.js:237`) with workspace/brain evidence.
- **F10** — C9 gains an explicit `reports_dir` negative check; layout overlap
  semantics named (Part i or a noted layout obligation).
- **F3** — the compare→promote window relabelled "narrowed", not "closed", with
  the residual stated (matches the cited precedent's real TOCTOU).
- **F8** — the atomicity claim narrowed to DECISION atomicity; partial-publish
  recovery routed to the residue-lifecycle successor, or a publish-failure
  acceptance arm added.

Editorial (fold into the fix commit): "rejects `/` before any path is joined" →
"rejects separators within each validated segment"; "closed" → "narrowed" for
the millisecond race wherever it appears.

**Owner rulings (2026-08-21):**
- **F1 → different-filesystem placement (EXDEV).** The workspace sits on a
  different filesystem from the vault; `createWorkspace` asserts distinct
  devices before copy-in. A hard link cannot cross a filesystem, so the Codex
  shell's `ln`-into-workspace vector fails `EXDEV` at creation — closed
  structurally in Part i, unconditionally and on every platform, not by the
  reap and not by promotion policy. Cost accepted: cross-device copy has no
  reflink; the copy-in cost is re-measured against the boundary.
- **F4 → status quo + named residual.** EP2 stays pre-merge and brain-scoped;
  a secret the USER writes into their own note during the run can enter the
  dream commit via a clean C6 merge. Recorded as a named residual (it is the
  user's own content in their own vault; refusing/redacting a user's own note
  was ruled the worse trade). The spec's false "scanning merged forces
  discarding the user edit" rationale is corrected in place.

**All ten applied.** F1 (Part i Table A placement + hardlink-vector row +
Table F Codex-shell row + contract + acceptance); F5 (C9 deny broadened to
current instruction-file shapes and control namespaces; Part i baseline
exclusions matched; M7 criterion widened); F6 (Table G unconditional reap,
tokenless-run caveat + criterion); F7 (EP2 taxonomy: redact arm, per ADR-0034);
F9 (`promote()` returns `secretDisposition`; Table G pipeline-consumes row);
F2 (Table G non-vacuity signal moved to workspace-delta evidence; Table E and
Current state note the second `assertCleanTree` consumer); F10 (C9 explicit
`reports_dir` negative check); F3 ("narrowed" not "closed" + stated TOCTOU
residual); F8 (decision-atomicity only; partial-publish routed to the
successor). Editorial folded in. New mirror lines registered in both
checklists.

Fix commit: applied in the commit that carries this update.

**Round 1 does not close the loop.** Per the stop criterion, the next external
round runs on the fixed specs; the family (vault-write-bypasses-promotion) took
its FIRST landing here — a second lands the split seam on the owner's table.
