---
id: WP-dream-gate-inputs-baseline-delta
title: Feed the dream's four gates from a captured pre-brain baseline, not vault git state
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0020, ADR-0024, ADR-0025, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-gate-inputs-baseline-delta: gate inputs move to a captured baseline

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Dispatch precondition.** This spec is written against `main` @
`e648284046dc86ac4bf8cb1cdf3a985134485393` (`e648284`), = `origin/main` at
authoring time. Before dispatch, re-run every `file:line` citation and every
measurement below against the tree the implementer will find
(`docs/specs/README.md` → Dispatch-time re-verification). A citation that does
not resolve blocks the dispatch.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** spawns a headless AI
brain under a hermetic runtime profile (ADR-0025), lets it write notes into the
user's Obsidian vault, and then runs a code **validator**
(`src/core/dream/validate.js` `validateAndCommit`) that classifies every write,
reverts what fails policy, and makes exactly one commit. Four checks in that
validator carry the safety of the whole pass: the **Tier-3 numeric floor** (the
confidence/recurrence/provenance bar for identity and skills notes), the
**skill-body revision guard** (ADR-0020 — a skill body may change only when a
committed learning authorizes it), the **learnings-ledger validator** (ADR-0020 —
the ledger is append-only and its counters may not be forged), and the **EP2
staged-output secret gate** (ADR-0024/ADR-0034 — the bytes this run added are
scanned, and a finding is withheld or redacted).

All four are wired to **vault git state**. Three of them read `git show HEAD:<path>`
to obtain "the state before this run wrote"; the fourth reads `git diff --cached`
to obtain "the lines this run added". That works today only because of a coincidence
the pipeline manufactures three lines before the brain starts:
`precommitSessionEdits` commits any uncommitted user edit and `assertCleanTree`
refuses to continue otherwise (`src/cli/dream.js:493-494`), so at the moment the
brain is spawned **the worktree equals HEAD**. Every `HEAD` read in those gates is
therefore a *pre-brain baseline* read, inferred through git rather than captured.

The dream write fence is moving to direction **(A)**: the brain will write into a
system-built workspace with a known baseline, and only approved content will be
promoted into the vault. The reasoning, the measurements and the ruled promotion
policy live in the war-room decision log (newest on top) and are **not repeated
here**. What matters for this work package is one architectural result measured
before the split: **none of the four gates needs vault git state** — each needs the
pre-brain baseline and the brain's writes, which git is merely a proxy for today.

This WP is the first of two and is deliberately **behaviour-preserving**. The brain
still writes into the live vault; the workspace as a write target is the second
package. Here the pipeline starts **capturing** the baseline it currently infers,
a small primitive computes the baseline→after delta, and the four gates read that
delta instead of git. Nothing a user observes changes. What changes is that the
gates stop depending on a coincidence, which is exactly what the second package
must be free to break.

## Current state

`src/core/dream/validate.js` (1469 lines). Its full git vocabulary is `status`,
`show HEAD:`, `diff --cached`, `cat-file -e HEAD:`, `ls-files --stage`,
`hash-object`, `update-index`, `add`, `checkout`, `reset`, `clean`, `rev-parse` —
**no `log`, `rev-list`, `merge-base` or `blame`**. The deepest state any gate reads
is HEAD (one revision) plus the index; no gate consumes commit history.

- `changedPaths` (`:1020-1021`) runs `git status --porcelain -z -uall` and is the
  classification loop's only candidate source. It has exactly **one caller**
  (`:1145`) and is not exported.
- The loop (`:1144-1209`) checks containment (`resolveContainment`, `:1147-1153`),
  then routes to the ledger validator, the Tier-3 block, or a catch-all keep
  (`:1208`).
- **Tier-3 floor** — `tier3Decision` (`:208-238`): reads the worktree file
  (`:211`) and nothing else; **zero git calls inside the function**. Its git
  dependence is entirely its caller's: the candidate list and `revertPath`.
- **Skill-body guard** — `skillBodyViolation` (`:320-415`): worktree bytes
  (`:350`), `git show HEAD:<rel>` (`:340`), `git show HEAD:<dir>/LEARNINGS.md`
  (`:398`), `change.untracked` (`:333`), and the ownership registry
  (`:337`; `state/skill-registry.json` via `readRegistry`, **not git**, keyed by
  vault-relative path).
- **Ledger validator** — `ledgerViolation` (`:516-615`): the sibling `SKILL.md`
  (`:526`), the ledger (`:539`), `git show HEAD:<rel>` (`:555`), and this run's
  extracts (`:1136-1142` — not git, already baseline-verified by Step 1's
  `hashScratch`/`scratchIntact`). `change.untracked` (`:554`) does not merely pick
  a revert shape here: it **gates whether the append-only family (c)–(g) runs at
  all**.
- **EP2 secret gate** — Step 3 (`:1211-1345`). Its decision inputs are
  `git diff --cached --name-status -z` (`:1232`, the file list),
  `git diff --cached --numstat -z` (`:1245`, git's own binary signal `-\t-\t`),
  and `git diff --cached -U0` (`:1257`, the added lines), whose hunk headers
  `addedLineNumbersFromDiff` (`:752-764`) parses into 1-based new-file line
  numbers. Its **enforcement** half — the tracked test (`:1296`), the two revert
  shapes (`:1325`, `:1327-1331`), `quarantinePreserve`, the abort path
  (`:1298-1323`) and `scrubAddedLines`' index surgery (`:867`, `:874`, `:878`) —
  is a separate concern and is **not touched by this WP**.
- `src/cli/dream.js`: `hashScratch` (`:44-56`) baselines the scratch inputs at
  `:489`; `precommitSessionEdits` + `assertCleanTree` run at `:493-494`; the brain
  runs at `:496` (step 11); `validateAndCommit` is called at `:558` and already accepts
  a `scratchBaseline`.
- Tests: `tests/unit/dream-validate.test.js` (2798 lines) drives
  `validateAndCommit` through `tempVault()` / `writeVault()` / `run()`
  (`:39-63`, `:468-469`); `tests/integration/dream.test.js` (1495 lines) drives the
  whole pipeline with `tests/fixtures/dream/fake-brain.js` via
  `WIENERDOG_DREAM_CMD`. **Nothing `npm test` runs spawns a real brain** — it is
  `node --test` over the `*.test.js` files (`tests/run.js`), and the harnesses that
  do spawn a real `claude` (`tests/scenarios/rubric.js`,
  `tests/scenarios/negative/run-negative.js`, the two broker harnesses) run only
  under the separate `npm run scenarios` script and are not in this WP's
  verification steps.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/delta.js | the baseline capture + delta primitive (Tables A and B) |
| modify | src/cli/dream.js | capture the baseline between `assertCleanTree` and the brain spawn; pass it to `validateAndCommit` (Table A) |
| modify | src/core/dream/validate.js | substitute the four gates' decision inputs per Table C; the EP2 enforcement half stays byte-unchanged |
| create | tests/unit/dream-delta.test.js | the primitive's own coverage, including the git-agreement differential (Table B) |
| modify | tests/unit/dream-validate.test.js | the divergence proof and the gate coverage (the implementer designs the cases); threading `vaultBaseline` through the existing `run()` helper is wiring, not an assertion edit |
| modify | tests/integration/dream.test.js | wiring only, and only if the pipeline change requires it — no existing assertion may be edited and no behaviour change asserted |

### Exact contracts

```js
/** Capture the pre-brain baseline. Called ONCE, after assertCleanTree and before
 *  the brain spawn. Pure read; writes nothing.
 *  @param {string} vaultDir
 *  @returns {VaultBaseline} — throws WienerdogError on an unreadable vault */
function captureBaseline(vaultDir)

/** Compute the baseline→after delta for the vault as it stands now.
 *  @param {string} vaultDir @param {VaultBaseline} baseline
 *  @returns {DeltaRecord[]} — one record per changed path, Table B */
function computeDelta(vaultDir, baseline)
```

`validateAndCommit`'s options object gains one required-in-production field,
`vaultBaseline`, alongside the existing `scratchBaseline`. Callers that omit it
are direct-call/integration tests; the spec's acceptance criteria decide what
omission means (Table A, last row).

## Contract reference

Activation (ADR-0031, 2-of-7 — four are true): (i) `validateAndCommit`'s options
shape changes and a new module interface appears; (iii) a structured record the
gates parse is introduced; (v) `src/cli/dream.js` produces the baseline while
`src/core/dream/validate.js` owns its interpretation; (vi) the second (A) package
inherits this primitive unchanged.

### Table A — the baseline object and its capture

| Fact / rule | Value |
|-------------|-------|
| What it is | for every path in the vault's **tracked-or-untracked-but-not-ignored** set at capture time — the same set `git status --porcelain -uall` reports against — that path's exact bytes and a content hash |
| Where it is held | **in memory**, for the lifetime of one `runDream` call. It is never written to disk in this WP: capture and consumption are the same process (`dream.js:558`), so no storage, no teardown, no `private-fs.js` interaction, and no new path under `state/` exists |
| When it is captured | exactly once, **after** `assertCleanTree` (`dream.js:494`) and **before** the brain spawn. Not earlier: the pre-commit step is what makes the captured bytes equal HEAD, which is the property that makes this WP behaviour-preserving |
| Ignored content | excluded, matching today's blind spot exactly — `changedPaths` passes no `--ignored` (`validate.js:1021`), so no gate has ever seen an ignored path. This WP does not widen that; widening it is a product decision belonging elsewhere |
| Symlinks | enumeration never follows a symlink out of the vault; a symlinked entry is recorded as the link, not its target. The existing containment check (`validate.js:1147-1153`) is unchanged and now consumes the delta's path list |
| Failure | an unreadable vault at capture time fails the run **loudly** before the brain spawns; the dream does not proceed with a partial baseline. No silent degradation to a git-derived baseline is permitted — that would restore the very dependency this WP removes |
| Resource bound | capture size ≈ the vault's non-ignored content, held once in memory. Named residual: a very large vault makes this proportionally expensive; the second (A) package already owns a copy-in I/O-cost measurement and inherits this question with it |
| Absent baseline | `validateAndCommit` called without `vaultBaseline` is a test-only path. It must **fail closed or be explicitly refused** — never fall back to reading HEAD. Whichever the implementer picks is recorded under "Decisions made" |

### Table B — the delta record

One record per path that differs between baseline and the vault as it stands after
the brain. This is the single canonical description of what the gates consume.

| Fact / rule | Value |
|-------------|-------|
| `rel` | vault-relative path, POSIX separators — the same string shape today's `changedPaths` yields, because `registry.skills[rel]` (`validate.js:337`, `:522`) and every layout prefix test are keyed by it |
| `status` | `added` (no baseline entry) \| `modified` \| `deleted` (no after content) |
| `baselineBytes` | the captured bytes; `null` iff `status === 'added'` |
| `afterBytes` | the current bytes; `null` iff `status === 'deleted'` |
| `binary` | true when the after content is unscannable. Must agree with today's git signal (`--numstat` reporting `-\t-\t`, `validate.js:1245-1246`) on every input the acceptance corpus exercises; where agreement cannot be shown it must be **more** conservative, never less — an unscannable file is withheld, so erring toward `binary` fails closed |
| `addedLineNumbers` | 1-based line numbers **in the after content** that this delta adds — the same set today's `addedLineNumbersFromDiff` (`validate.js:752-764`) derives from `git diff --cached -U0`'s hunk headers. `[]` when `status === 'deleted'`; every line when `status === 'added'` |
| Scan text | derived, not stored: the after content's lines at `addedLineNumbers`, joined with LF — byte-identical to today's `+`-line join (`validate.js:1258-1262`). The two must not both be carried; one fact, one owner |
| `isNew` | `status === 'added'` — the **decision-side** replacement for `change.untracked`. It is NOT the same fact: `untracked` is git's index state, `isNew` is "absent from the baseline". They coincide in production and diverge in the discriminator fixture (Table C, last row) |
| Not in the record | anything no gate consumes. A field with no named consumer in Table C is cut |

### Table C — the four gates' input substitution

For each gate: what it reads today, what it reads after this WP, and what is
deliberately left alone.

| Gate | Today's decision input | After this WP | Untouched |
|------|------------------------|---------------|-----------|
| Candidate list + containment (`:1145-1153`) | `changedPaths` → `git status --porcelain -z -uall` (`:1021`) | the delta's path list (Table B). `changedPaths` loses its only caller | `resolveContainment` and its revert, unchanged |
| **Tier-3 floor** (`tier3Decision`, `:208-238`) | worktree bytes only; no git inside | `afterBytes` from the record — no filesystem read of its own | the floor constants, the reason strings, the A0 identity freeze (`:1175-1184`), the ordering behind the skill-body guard (`:1185-1187`) |
| **Skill-body guard** (`skillBodyViolation`, `:320-415`) | `git show HEAD:<rel>` (`:340`); `git show HEAD:<dir>/LEARNINGS.md` (`:398`); `change.untracked` (`:333`) | the record's `baselineBytes`; **the baseline bytes of the sibling ledger**; `isNew` | the ownership registry, every reason string, the promotion allowlist, the ≥ 3 distinct-Claude-session rule |
| **Ledger validator** (`ledgerViolation`, `:516-615`) | `git show HEAD:<rel>` (`:555`); `change.untracked` gating the append-only family (`:554`) | `baselineBytes`; `isNew` gating the same family, with the same fail-closed behaviour when a baseline version exists but cannot be parsed | the extract binding (h), the schema checks, the sibling-`SKILL.md` read (which is after-content by design, both today and after) |
| **EP2 secret gate — decision half** (`:1232`, `:1245`, `:1257`) | three `git diff --cached` calls | the record's path list, `binary`, `addedLineNumbers` and derived scan text | **the entire enforcement half**: `git add -A` (`:1223`), the tracked test (`:1296`), both revert shapes, `quarantinePreserve`, the abort path (`:1298-1323`), `pruneRedactedOriginals`, and `scrubAddedLines` (`:821-903`) including its index surgery — byte-unchanged |
| **The inherited subtlety** (ADR-0020) | HEAD structurally forbids self-authorisation | the skill-body guard's ledger input is the **baseline** ledger, never the after content. `skills/wienerdog-dream/SKILL.md:352-353` requires the authorising learning to have recurred across **prior** dreams, "not counting a bump you are making this same run"; reading the after-content ledger would let one run bump a counter and authorise a body rewrite against it in the same pass | — |
| **Enforcement restores to HEAD, decisions follow the baseline** | the two are the same thing | they remain distinct concerns: this WP changes **what the gates decide on**, not **what enforcement restores to**. `revertPath` still runs `git checkout HEAD -- <path>` (`:665`). In production the two coincide; in the discriminator fixture they do not, and the criteria there assert the **decision**, never the restore target | `revertPath`, unchanged |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the `delta.js` row cites Tables A and B; the
      `validate.js` row cites Table C)
- [ ] Acceptance criteria that assert Table A's capture point, Table B's record
      facts and Table C's per-gate substitution
- [ ] Verification commands (the `git show HEAD:` count gate asserts Table C's
      first three gate rows; the enforcement-diff gate asserts its "Untouched"
      column)
- [ ] Current-state description (every line number Table C cites)
- [ ] Implementation notes: the binary-predicate trap and the capture-point
      rationale
- [ ] Out of scope: the two named second-package obligations
- [ ] `### Exact contracts`' two signatures and the `vaultBaseline` field

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing started may outlive its job — the baseline is an
  in-memory value inside one call, not a store.
- **The binary-predicate trap, measured on git 2.50.1 at the pin:** git's binary
  test inspects a bounded prefix, not the whole file. A file with a NUL at byte
  100 stages as `-\t-\t` (binary); the same file with the NUL at byte 9000 stages
  as `1\t0` (text). A naive "any NUL anywhere" predicate therefore disagrees with
  git on the second file. That direction is fail-closed and permitted by Table B,
  but it is a behaviour change on a real input — measure it rather than discover
  it in review.
- **Why the capture point is load-bearing.** Captured before `precommitSessionEdits`,
  the baseline would include the user's uncommitted edits and would no longer equal
  HEAD, so this WP would silently change behaviour instead of preserving it.
  Captured after the brain, it would not be a baseline at all.
- The reason-string vocabulary of the validator is a **preserved contract**. This
  WP introduces no new reason string and changes no existing one; a gate that
  reverts today must revert with the same string after.
- `changedPaths` becomes callerless. Deleting it or leaving it is the implementer's
  call, recorded under "Decisions made"; either way it must have no caller in the
  classification path.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item applies: the primitive enumerates
      **attacker-influenceable paths** (the brain's writes are untrusted by
      definition — threat class T2, a steered dream) and those `rel` strings flow
      into filesystem reads. Containment is by the existing check
      (`validate.js:1147-1153`), which now consumes the delta's list, plus Table A's
      no-follow enumeration rule. No `rel` reaches a shell command: every git call
      in this file goes through `git()` (`:67`) with an argv array, never a shell.
- [ ] The surface this WP actually touches is **the four gates' evidence source**.
      The failure mode that matters is a substitution that silently weakens a gate —
      most sharply the ADR-0020 ledger input (Table C's "inherited subtlety" row),
      where reading the after content instead of the baseline converts an
      authorisation gate into a no-op. The acceptance criteria below exist to make
      that failure impossible to pass silently.
- [ ] Named residual: this WP does not close, widen or narrow the ignored-content
      blind spot (Table A). It is inherited exactly as it stands.

## Acceptance criteria

- [ ] **The divergence proof (this WP is not Ready without it).** A fixture puts
      the captured baseline and HEAD in **different states** — a state the
      production pipeline cannot reach, constructed solely to tell the two sources
      apart — and for **each** of the four gates the outcome demonstrably follows
      the **baseline**. Each of the four also has its negative: with the gate's
      input pointed back at HEAD (or at the after content, for the ledger input),
      the outcome flips. A criterion that passes under both sources has proven
      nothing.
- [ ] The skill-body guard's authorising ledger is the baseline ledger: a run in
      which the brain bumps a learning's counters to a qualifying value and
      rewrites the same skill's body in the **same** pass is reverted, and the
      revert reason is today's unchanged string.
- [ ] The ledger validator's append-only family (c)–(g) runs whenever a baseline
      version exists, and a ledger whose baseline version exists but cannot be
      parsed fails closed — the mapping from `change.untracked` to `isNew` does not
      silently disable the family.
- [ ] The primitive agrees with the git-derived values it replaces: for a corpus
      covering added / modified / deleted / binary / empty-added / CRLF /
      no-trailing-newline content, its `addedLineNumbers` equal
      `addedLineNumbersFromDiff`'s output on the corresponding `git diff --cached
      -U0`, and its `binary` equals git's `--numstat` signal — or is conservatively
      `true` where it differs, with each such input named.
- [ ] The derived scan text is byte-identical to today's `+`-line join for every
      corpus member.
- [ ] Behaviour preservation: the complete existing test suite passes **unchanged**
      — no existing assertion is edited to accommodate this WP. An existing test
      that must change is a finding, not a fix.
- [ ] `src/core/dream/validate.js` contains **zero** `git show HEAD:` occurrences,
      and `changedPaths` has no caller in the classification path.
- [ ] The EP2 enforcement half is byte-unchanged: `scrubAddedLines` and the revert
      / quarantine / abort block show no diff against the pinned base.
- [ ] Capturing the baseline writes nothing: after a full dream run, the mechanics
      root gains no new path (Table A).
- [ ] Idempotence: `N/A — this WP ships no command and writes nothing outside the
      repo; the baseline is an in-memory value and the pipeline's existing
      idempotence is covered by its own tests.`
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm test -- --test-name-pattern "dream-validate"
npm test -- --test-name-pattern "dream-delta"
# No gate reads HEAD any more (Table C, gate rows 2-4)
test "$(grep -c 'show..*HEAD:' src/core/dream/validate.js)" = 0
# changedPaths has no caller in the classification path
! grep -q 'of changedPaths(' src/core/dream/validate.js
# The EP2 enforcement half is untouched (Table C, "Untouched" column)
! git diff main -- src/core/dream/validate.js | grep -qE '^[-+].*(hash-object|update-index|ls-files --stage)'
```

- The last three are NEW steps and each is an ASSERTION: it exits non-zero on
  failure rather than printing a number a reader must judge. Paste a real green on
  the finished state AND a real red from a deliberately broken state (one
  `git show HEAD:` left in place; the `changedPaths` call left in the loop; one
  character changed inside `scrubAddedLines`), so a check that cannot fail is
  caught before anyone believes it.

## Out of scope (do NOT do these)

- **The workspace as the brain's write target, and the whole promotion policy** —
  the second (A) package. The brain still writes into the live vault here.
- **Two contracts this WP does not build, named now so they cannot arrive later as
  an acceptance criterion.** They are the second package's obligations:
  (a) the secret gate runs **before** the merge — a secret already merged into the
  candidate bytes can only be answered by dropping the whole file, including the
  user's diverging edits, which is the destructive outcome the ruled policy exists
  to avoid; (b) the skill-body guard and the ledger validator concern a **pair**
  that must be promoted atomically — the guard authorises the skill from the
  ledger and the validator validates the ledger from the skill, so promoting one
  while refusing the other leaves the vault holding either an unauthorised skill or
  a ledger beside a stale one.
- **The EP2 enforcement half.** Its index surgery exists so a staged blob is
  byte-identical to what `git add` produces under the vault's own attributes; the
  second package removes most of its reason to exist. Not here.
- Rewriting, retuning or renaming any gate's policy: no threshold, no reason
  string, no allowlist, no ADR-0020 or ADR-0024 rule changes in this WP.
- The ignored-content blind spot, `restoreVaultToHead`'s two CLI abort paths,
  whether `precommitSessionEdits` survives under (A), and workspace placement —
  all second-package or later questions.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken red;
   output pasted into the PR body.
2. Conventional commits; PR titled
   `refactor(dream): feed the four gates from a captured baseline (WP-dream-gate-inputs-baseline-delta)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
