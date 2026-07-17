---
id: WP-123
title: Staged brain-output secret gate — scan pre-commit added content, revert on a hard finding (audit A5)
status: In-Review
model: opus
size: M
depends_on: [WP-122]
adrs: [ADR-0004, ADR-0024]
branch: wp/123-staged-output-secret-gate
---

# WP-123: Staged brain-output secret gate — scan pre-commit added content, revert on a hard finding (audit A5)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Plain Node ≥ 18, **zero runtime deps**, JSDoc types only, no build step.

The nightly **dreaming** job runs a headless **brain** (Claude/Codex) that reads redacted
scratch **extracts** and writes **notes** into the **vault** git repo. `validateAndCommit`
(`src/core/dream/validate.js`) then classifies every vault change, **reverts** policy
violations **per item** (never aborting the whole run), appends a metadata-only enforcement
section to the dream **report**, and makes **exactly one** git commit.

A 2026-07-15 security audit (action **A5**, deep-dive `05-secret-lifecycle.md`) found this
commit step has **no secret gate**. The pre-brain redaction (WP-122) sanitizes the brain's
*inputs*, but the brain can **re-materialize a secret in its output** — it can copy a value
out of an extract that redaction under-matched, or (in the Codex `workspace-write` case that
can read the real filesystem) read a live `.env`/token and write it into a note. Whatever the
brain writes is `git add -A`'d and committed verbatim: a **secret becomes a committed,
git-tracked note**, and (if it lands in an identity file) is later injected into every session.

This WP adds the **second A5 enforcement point (EP2): scan the staged, about-to-be-committed
added content** and, on **any finding** (`findings.length > 0` from the shared detector — both
`redact` and `quarantine` severities; OWNER-APPROVED 2026-07-17, see below), **revert that
whole file** — never silently commit `[REDACTED]`-mutated prose — and record a fixed,
metadata-only reason. It touches only `src/core/dream/validate.js` and its tests. This is one
of the four persistence gates of **ADR-0024**.

**A5 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

`src/core/dream/validate.js` `validateAndCommit(o)` (WP-017/069, unchanged shape here):

- **Step 1** — scratch-integrity: delete any brain write into the read-only scratch dir.
- **Step 2** — for each `changedPaths(vaultDir)` record `{code, path, untracked}`: resolve
  containment (revert `..`/symlink escapes), then classify:
  - a `LEARNINGS.md` → `ledgerViolation` gate;
  - an injected identity file → A0 freeze revert;
  - a Tier-3 path → `skillBodyViolation` then `tier3Decision` numeric floor;
  - **a Tier-1/2 note, daily log, or report → kept (falls through, no gate).** ← the gap.
    A secret written into an ordinary atomic note or the daily log is committed with no check.
- **Step 4** — append the enforcement section to the report: one `- \`path\` — reason` line
  per entry in `reverted[]` and `outOfVaultDetailed[]` (metadata-only reason strings), else
  `- none`.
- **Step 5** — `git add -A`; read `git diff --cached --name-status -z`; make ONE commit;
  count notes/skills.
- **Returns** `{ committed, reverted:[{path,reason}], outOfVault, sha, counts:{notes,skills} }`.

Helpers already present: `git(vaultDir, args, {allowFail})`, `revertPath(vaultDir, rel,
untracked)` (untracked → `rm`, tracked → `git checkout HEAD -- rel`), `changedPaths`. The
report is written/`appendFileSync`'d in Step 4; `reverted` flows into it AND into the return
value (dream.js prints `${res.reverted.length} reverted`).

WP-122 shipped `src/core/secret-scan.js` exporting `scanAndRedact(text) → {text, findings}`,
`hasHardFinding(findings)`, and `SEVERITY`. `findings` is a metadata-only array
(`{label, severity, count}` per matched class, never the raw bytes): a `redact`-severity
finding means "a secret with a safe inline partial form"; a `quarantine`-severity finding
means "no safe partial form — withhold/revert the whole artifact." **This gate (EP2) consumes
the `findings` array directly and reverts on ANY finding (`findings.length > 0`), regardless
of severity — NOT only a hard one (OWNER-APPROVED 2026-07-17, see below). `hasHardFinding` is
the export the OTHER gates (EP1/EP3/EP4) use; EP2 does not call it.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | scan the staged added content of every kept change; on any finding (`findings.length > 0`, either severity) preserve the file into `state/quarantine/` then revert it; record a metadata-only reason; expose the secret-revert count on the result |
| modify | src/cli/dream.js | ONLY if the quarantine root must be plumbed into `validateAndCommit` — a one-line call-site change (record it) |
| modify | tests/unit/dream-validate.test.js | a note/daily-log with a planted secret → quarantined + reverted (uncommitted), metadata-only reason, valid neighbour still committed; a false positive is a visible recoverable quarantine not a silent rewrite; identity/skill paths still gated as before |

> If `tests/unit/dream-validate.test.js` does not exist under that exact name, use the
> existing validate unit test file (`grep -l validateAndCommit tests/unit`) and record the
> actual path in the PR "Decisions made". Do NOT create a second validate test file.

### Exact contracts

**Where the gate runs.** Scan the **staged added content**, so the check sees exactly the
bytes about to be committed (after all per-item reverts above have run). Two equivalent
placements — pick the simpler and record it:

- **(A, recommended) After Step 2, before Step 5's commit**, over the surviving changes:
  `git add -A` first, then for each staged file read its **added lines** via
  `git diff --cached -U0 -- <rel>` (lines starting with `+`, excluding the `+++` header) and
  `scanAndRedact(addedText)`. **Any finding** (`findings.length > 0`, either severity) →
  **revert the file** (`revertPath` for an untracked add; for a tracked modification restore
  HEAD via `git checkout HEAD -- rel`), then
  re-stage (`git add -A`) so the reverted state is what gets committed. This scans a
  git-computed diff, so an append to an existing note only scans the NEW lines (a
  pre-existing secret already in HEAD is not re-flagged — it was the human's, and re-reverting
  it would fight the user).
- **(B) Inside the Step-2 loop** for the "kept Tier-1/2 note / daily log / report" branch:
  read the file's current content, scan it, revert on any finding (`findings.length > 0`).
  Simpler but scans the
  WHOLE file (re-flags a pre-existing secret the human already committed). Rejected unless the
  diff approach proves impractical — record the choice.

**Scope of the scan.** Apply the gate to **every kept vault change that is a file the brain
authored content into** — Tier-1/2 notes, the daily log, and the dream report itself. The
identity/skill Tier-3 paths and the LEARNINGS ledger are ALREADY gated above; scanning them
too is harmless defense-in-depth (any finding there reverts them the same way) — do it
uniformly rather than special-casing, so no authored file escapes. **Do not scan the reverted
paths** (already gone) or paths outside the vault (already reverted).

**On any finding (`findings.length > 0`) — quarantine-preserve, then revert; never rewrite.**
- **First preserve** (OWNER-APPROVED 2026-07-17): copy the offending working-tree file's
  current content to `state/quarantine/<YYYY-MM-DD>-<sanitized-basename>` (dir `0700`,
  file `0600`, atomic write, numeric suffix on name collision; reuse the shared basename
  sanitizer). The quarantine dir is OUTSIDE the vault and never committed. This makes a
  false positive recoverable by the owner the next day.
- **Then revert** the whole file in the vault (untracked add → remove; tracked mod →
  restore HEAD). **Never write the `scanAndRedact` `.text` back into the note** — a false
  positive must be a *visible quarantine of the file*, not a silent mutation of the prose; a
  true positive must not leave a half-redacted note committed.
- If the quarantine copy itself fails (unwritable dir), still revert — fail closed on the
  commit; the preserve step is best-effort and its failure is noted in the reason string.
- Record `{ path: rel, reason }` in `reverted[]` with a **fixed, metadata-only** reason that
  names the finding **labels only**, never the matched bytes:
  `reason = 'reverted: staged content matched a secret pattern (' + labels.join(', ') +
  '); not committed'` where `labels` are the distinct `finding.label`s (code-owned enum
  strings). This line lands in the report enforcement section and in the `reverted` count —
  the fixed metadata-only alert the audit requires (audit A5 item 5).

**Result shape.** Extend the return with a count so dream.js can surface it distinctly:
add `secretReverts: number` (the number of files reverted specifically by THIS gate) to the
returned object. `reverted[]` continues to include these entries (so the report + the existing
`reverted` count already reflect them); `secretReverts` is additive and MUST default such that
no existing caller breaks (dream.js reads `res.reverted.length` and `res.counts`, both
unchanged). Do NOT change `committed`, `outOfVault`, `sha`, or `counts` semantics.

### Worked example (assert in the validate test)

Brain writes two untracked notes: `04-Atomic/good.md` (clean) and `04-Atomic/leak.md`
containing `AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`. After
`validateAndCommit`:

```
- leak.md is NOT in `committed`; `git show HEAD:04-Atomic/leak.md` fails (never committed);
  the file is gone from the vault working tree (untracked add reverted).
- its content IS preserved at state/quarantine/<date>-leak.md with mode 0600 (owner can
  review and manually restore a false positive); the quarantine path is never committed.
- good.md IS committed.
- reverted[] contains { path:'04-Atomic/leak.md', reason:'reverted: staged content matched a
  secret pattern (aws_secret_access_key); not committed' }  (no raw key bytes in the reason).
- res.secretReverts === 1.
- the dream report's enforcement section shows the leak.md line; the committed note does not
  contain the key.
```

## OWNER-APPROVED (2026-07-17) — DECISION NEEDED, resolve in the walkthrough

- **OWNER-APPROVED (2026-07-17) — EP2 gate condition: revert on ANY detector finding, not
  only a hard finding.** *Trigger:* the WP-123 implementer raised a spec-gap via the spec-gap
  protocol. The "Exact contracts" section reverted a file only on a **hard** finding (a
  `quarantine`-severity hit / `hasHardFinding`), but the Acceptance criteria require a planted
  `refresh_token=` assignment — a `redact`-severity finding per the WP-122 owner-approved
  severity table — to be "reverted and never committed." Under the hard-only contract that
  file would be committed raw. Worse, the audit's flagship EP2 scenario (a Codex
  `workspace-write` brain reads a live `.env` and writes `API_KEY=…`/`refresh_token=…` into a
  note) produces exactly those `redact`-severity **assignment** findings, so a hard-only gate
  would miss the motivating attack. *Ruling:* **at EP2 the gate reverts (quarantine-preserve,
  then revert) on ANY finding from the shared detector — both `redact` and `quarantine`
  severities. The condition is `findings.length > 0`, NOT `hasHardFinding`.** *Rationale:*
  EP2's input is brain output whose inputs EP1 already redacted, so any secret-shaped string
  in the staged **added** content is anomalous **re-materialization** — a value the brain
  copied out of an extract that redaction under-matched, or the live-`.env`-read case.
  Rewriting is forbidden at this gate (revert, never rewrite), so the only safe action on any
  finding is **withhold-the-whole-file**. The increased false-positive withholds are
  **accepted**: they are visible, quarantine-preserved (recoverable by the owner the next day
  from `state/quarantine/`), and surfaced by the WP-125 pending-review digest banner. *The
  WP-122 severity table is NOT reopened:* `severity` continues to distinguish
  inline-redactable matches from no-safe-partial-form matches for the OTHER enforcement points
  (EP1/EP3/EP4), and `hasHardFinding` remains a WP-122 export those gates use; EP2 simply
  consumes the `scanAndRedact` `findings` array directly and keys on `findings.length > 0`.
- **OWNER-APPROVED (2026-07-17) — durable-alert channel: report + counts only in this WP.**
  A staged secret revert is a *closed event* (the file was reverted, no secret was committed,
  no ongoing unsafe state) — unlike a transcript quarantine, which persists nightly and
  earns its durable digest banner. The revert reason lands in the dream report's enforcement
  section and in the `secretReverts` count dream.js prints. *Revisited and RESOLVED in the
  WP-124 walkthrough (OWNER-APPROVED 2026-07-17): with the quarantine-preserve amendment
  below, a withheld note IS an ongoing pending-review state — WP-125 adds a state-driven
  digest banner rendered while `state/quarantine/` is non-empty (see WP-125 contract 5).
  No `alerts.jsonl` entry (its cleared-on-next-success lifecycle would not track review).*
- **OWNER-APPROVED (2026-07-17) — scan placement: option (A), staged added lines only.**
  The gate scans the git-computed staged diff (`git diff --cached -U0`, `+` lines), i.e.
  exactly the bytes THIS dream run is responsible for. A secret-shaped string the human
  already committed in HEAD is not re-flagged — otherwise the gate would revert the brain's
  innocent append to that file every night and permanently exclude it from consolidation.
  Pre-existing committed secrets are the incident runbook's domain (WP-127), not this
  gate's. Fallback (B, whole-file scan) is allowed only if diff parsing proves impractical,
  recorded under "Decisions made".
- **OWNER-APPROVED (2026-07-17) — false-positive posture accepted, AMENDED to
  quarantine-preserve instead of destructive revert.** The owner accepts that any finding
  (`findings.length > 0`; including a high-entropy false positive) visibly withholds the file
  from the commit with a metadata-only reason — but asked "can I manually allow it the next day?", and under the
  original contract the answer was no (an untracked add was deleted; the brain's text was
  unrecoverable). Ruling: **before reverting the vault state, preserve the offending
  working-tree file's content into the staged-output quarantine directory
  `state/quarantine/`** (dir `0700`, file `0600`, name `<YYYY-MM-DD>-<sanitized-basename>`
  with a numeric suffix on collision, reusing the shared basename sanitizer), then revert the
  vault (untracked add → remove; tracked mod → restore HEAD). The audit's A5 item 5 says
  "reverts/quarantines" — this is the quarantine reading. A false positive is thus
  recoverable: the owner reviews the quarantined copy and manually moves the content back
  into the vault (no CLI approve flow in this WP — the vault is user-editable). A true
  positive means the raw secret persists in the private quarantine file until purged — the
  incident runbook (WP-127) covers reviewing/purging `state/quarantine/`, and WP-126 adds
  the directory to the A5 private-mode set. The quarantine root comes from the options
  `validateAndCommit` already receives; if a field must be plumbed from the call site, that
  one-line `dream.js` change is in scope — record it under "Decisions made".

## Implementation notes & constraints

- **This is EP2 of ADR-0024.** Reference it where the gate is wired.
- **Revert, never rewrite.** The single most important invariant: on a finding, the file is
  reverted to its pre-brain state; the redacted `.text` is discarded. Never `writeFileSync`
  the sanitized text back.
- **Metadata-only reasons.** The reason string names finding **labels** (code-owned enum) and
  nothing else — no matched bytes, no offsets, no surrounding line. It lands in the committed
  report and the console summary, both of which must stay secret-free.
- **Per-item, never abort.** Any finding reverts ONE file; every clean file is still
  committed. The run exits normally (the gate is not a failure). This matches every existing
  revert in `validateAndCommit`.
- **Preserve every existing gate and the single-commit invariant.** The secret scan is an
  ADDITIONAL revert reason layered onto Step 2/Step 5; do not reorder the identity freeze,
  Tier-3 floor, skill-body/ledger gates, or the one-commit step.
- Reuse `scanAndRedact` from `secret-scan` — this gate keys on `findings.length > 0` (either
  severity); do NOT call `hasHardFinding` here (it is the export the other EP gates use). Reuse
  `revertPath` and the `git` helper verbatim. Zero deps, JSDoc only. When uncertain, choose
  simpler + record it.

## Security checklist

- [ ] Every file the brain authored content into is scanned with the shared detector on its
      staged **added** bytes before the commit; **any** finding (`findings.length > 0`, either
      severity) reverts the whole file (untracked add removed, tracked mod restored to HEAD) so
      **zero raw secret bytes reach the commit**, and the recorded reason is metadata-only
      (finding labels, never
      the matched bytes). The `[REDACTED]`-mutated text is never written back (a false positive
      is a visible revert, not a silent rewrite). No untrusted identifier flows into a path or
      shell — git args stay arrays, paths come from `changedPaths`/`git diff`, not content.

## Acceptance criteria

- [ ] A note/daily-log the brain wrote containing a planted secret is **reverted and never
      committed** on **ANY** detector finding (`findings.length > 0`), regardless of severity —
      both a `quarantine`-severity hit (an AWS secret key, a private-key block) AND a
      `redact`-severity hit (a `refresh_token=` assignment) revert the file
      (`git show HEAD:<path>` fails / the committed bytes do not contain the secret); a clean
      neighbour note in the same run IS committed.
- [ ] The revert reason is present in `reverted[]` and the report enforcement section, names
      only the finding label(s), and contains **none** of the secret's bytes.
- [ ] `res.secretReverts` equals the number of files reverted by this gate; `reverted.length`
      and `counts` still reflect the reverts (existing surfaces unbroken).
- [ ] A false positive (e.g. a legitimate high-entropy string) is a **quarantined revert with
      a metadata reason**, not a silently-redacted committed note (assert the file is absent
      from the commit, not committed-with-`[REDACTED]`).
- [ ] The quarantined copy exists under `state/quarantine/` with mode `0600` (dir `0700`) and
      byte-identical content; it is never staged/committed; an unwritable quarantine dir still
      reverts the vault file (fail closed) with the failure noted in the reason.
- [ ] The existing identity-freeze, Tier-3-floor, skill-body, and ledger gates and the
      single-commit behavior are unchanged (the pre-existing validate tests pass).
- [ ] `wienerdog safety` shows all five gates BLOCKED; `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "validate"
npm test -- --test-name-pattern "dream"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- The shared detector itself — **WP-122** (this WP consumes the `scanAndRedact` `findings`
  array; `hasHardFinding` is the export the other EP gates use, not EP2).
- The durable **log/stderr/alert/email** sanitizing — **WP-124** (incl. any durable "secret
  caught in output" banner the DECISION NEEDED defers there).
- The **digest section** gate — **WP-125**.
- **0700/0600 private modes** — **WP-126**. A5 **docs** — **WP-127**.
- Any change to the Tier gates, the ledger/skill validators, or the single-commit step.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/123-staged-output-secret-gate`; conventional commits; PR titled
   `feat(dream): scan staged brain output, revert on a secret finding (WP-123)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
