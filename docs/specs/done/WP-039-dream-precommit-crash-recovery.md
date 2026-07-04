---
id: WP-039
title: Dream pre-commit of session edits + crashed-brain vault recovery
status: In-Review
model: opus
size: M
depends_on: [WP-017, WP-038]
adrs: [ADR-0004]
branch: wp/039-dream-precommit-crash-recovery
---

# WP-039: Dream pre-commit of session edits + crashed-brain vault recovery

## Context (read this, nothing else)

The nightly **dream** is Wienerdog's memory-consolidation job: an orchestrator
(code, `src/cli/dream.js`) launches a tool-restricted "brain" (`claude -p`) that
reads recent-session extracts and writes vault notes; the orchestrator then
validates the brain's git diff and makes **exactly one commit per dream** so
`git revert <sha>` cleanly undoes a night (this one-commit revertibility is a
core promise — threat model T1). **Iron rule (ADR-0004): Wienerdog is just files;
nothing it starts outlives its job.** This WP adds git commits and a git
restore; it starts no process and no timer.

To make the post-brain diff be *exactly* the brain's writes, the orchestrator
currently requires a **clean vault working tree** before dreaming
(`assertCleanTree`), refusing otherwise. On the first real scheduled night
(2026-07-04) that precondition produced two production failures:

1. **Dirty-vault starvation.** Ordinary interactive sessions leave the vault
   dirty (setup notes, edits to a hand-curated `current-state.md`). Nothing in
   the product ever commits those edits, so the clean-tree gate refused the
   03:30 dream and all 7 hourly catch-up retries: `vault has uncommitted
   changes; dream skipped`. The dream starves **indefinitely** until a human
   commits by hand.

2. **Crashed-brain self-starvation.** When the brain later ran, the API
   connection dropped mid-run: the brain exited nonzero, so the orchestrator made
   no commit and advanced no watermark — correct — **but the brain's partial,
   unvalidated writes stayed in the working tree.** The next run's clean-tree
   gate then refuses *those*, so a single crashed dream starves every future
   dream until manual cleanup.

**The design is decided; encode it exactly:**

- **(a) Pre-commit.** After acquiring the dream lock and *before* the brain runs,
  the orchestrator commits any uncommitted vault changes as its own commit with
  the frozen message `vault: session edits before dream`. This is versioning the
  user's *own* working-tree files; it adds no model-authored content and it
  preserves one-commit-per-dream revertibility of the brain's writes (the brain's
  commit lands on top; `git revert` of the dream sha still undoes only the
  brain's night).

- **(b) Crash recovery.** With (a) in place, ANY dirt present after a nonzero
  brain exit is brain-authored *by construction*. So on brain failure/timeout the
  orchestrator restores the vault to the pre-commit HEAD (`git reset --hard HEAD`
  plus `git clean -fd`, vault-scoped) before releasing the lock. Crashed dreams no
  longer starve future ones. The clean-tree **refusal** path survives only for
  the pathological case where dirt appears *while the lock is held* (a race, not
  session edits).

This WP also completes the **brain-stderr surfacing** started in WP-038: WP-038
made `spawnBrain`'s completion result carry a bounded `stderrTail`; here the
orchestrator includes that tail in its `dream brain exited N` error so the actual
brain error (e.g. the API drop) reaches the per-run log and the fail-loud alert.

Threat-model note (inline; THREAT-MODEL.md update is a separate follow-up): the
pre-commit contains only user-authored working-tree state — no model output — so
it introduces no new injection surface (T1/T2). The crash restore discards
unvalidated brain writes before any future session can read them (they never
reach a commit, a watermark, or the digest).

## Current state

### `src/cli/dream.js` — `run(argv)` (the sequence to change)

```js
// 2. Vault must be a git repo with a clean working tree.
assertGitRepo(vaultDir);
assertCleanTree(vaultDir);          // ← refuses on ANY dirt (the starvation gate)

// 3. Collect the fresh transcripts into scratch.
const wm = readWatermarks(paths.state);
const sel = collectExtracts(paths, wm, cfg.maxInputBytes);
if (sel.entries.length === 0) { cleanScratch(paths.state); console.log('wienerdog: nothing new to dream.'); return; }
if (dryRun) { printPlan(...); cleanScratch(paths.state); return; }

const scratchBaseline = hashScratch(sel.wrote);

// 6. Acquire the single-run lock.
const lock = acquireLock(paths.state, cfg.timeoutMs);
if (!lock.acquired) { cleanScratch(paths.state); console.log('wienerdog: another dream is in progress.'); return; }
if (lock.stolen) { console.warn('wienerdog: warning — stole a stale dream lock …'); }

// 7. Run the brain under the watchdog, then validate + commit.
try {
  // … mkdir logs/dream, open logStream = logs/dream/<date>.log …
  try {
    await runBrainWithWatchdog({ vaultDir, scratchDir: sel.scratchDir, date, model: cfg.model, layout, timeoutMs: cfg.timeoutMs, logStream });
  } finally { logStream.end(); }

  // 8. Validate + one commit.
  const res = validateAndCommit({ vaultDir, scratchDir: sel.scratchDir, date, expectedScratch: sel.wrote, scratchBaseline, layout });
  // 9. Advance watermarks ONLY after a successful commit.
  writeWatermarks(paths.state, { claude: sel.maxMtime.claude, codex: sel.maxMtime.codex });
  // 10. Regenerate digest.md (atomic temp+rename).
  // 11. Summary.
} finally {
  // 12. Always release the lock and wipe scratch.
  releaseLock(paths.state);
  cleanScratch(paths.state);
}
```

### `src/cli/dream.js` — `runBrainWithWatchdog(o)` (the message to enrich)

```js
const result = await Promise.race([done, watchdog]);
if (result.code !== 0) {
  throw new WienerdogError(`dream brain exited ${result.code}`);
}
```

After WP-038, `done` resolves `{ code, durationMs, stderrTail }`.

### `src/core/dream/validate.js` — existing git helpers you extend

```js
function git(vaultDir, args, opts = {}) {           // spawnSync('git', ['-C', vaultDir, ...args])
  // throws WienerdogError on error / (unless allowFail) nonzero exit; returns the SpawnSync result
}
function assertGitRepo(vaultDir) { /* throws if not a repo */ }
function assertCleanTree(vaultDir) {                 // `git status --porcelain -uall`
  // throws WienerdogError('vault has uncommitted changes; dream skipped …') if non-empty
}
module.exports = { validateAndCommit, parseFrontmatter, assertGitRepo, assertCleanTree };
```

`validateAndCommit` already makes the dream commit with the identity
`-c user.name=wienerdog -c user.email=wienerdog@localhost`.

### `tests/integration/dream.test.js` — the e2e harness (yours to extend)

`runDream(ctx, argv, extraEnv)` sets `WIENERDOG_DREAM_CMD=<fake-brain.js>` and
runs `dream.run` in-process. `setup()` builds a temp home + core + a **clean**
vault git repo (`git init` + seed commit) + `config.yaml`. `commitCount(vault)`
returns `git rev-list --count HEAD`. The fake brain
(`tests/fixtures/dream/fake-brain.js`) supports `WIENERDOG_FAKE_BRAIN_MODE`
(`hang` today). One existing test **must change** (see Deliverables):

```js
test('dream-integration: a dirty vault working tree aborts before the brain, with no commit', …)
```

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | add + export `precommitSessionEdits`, `restoreVaultToHead` |
| modify | src/cli/dream.js | wire pre-commit + crash restore into `run()`; enrich brain-exit message |
| modify | tests/fixtures/dream/fake-brain.js | add `crash` mode (write to vault + stderr, exit nonzero) |
| modify | tests/integration/dream.test.js | replace dirty-abort test with starvation e2e; add crash-recovery e2e |
| modify | tests/unit/dream-validate.test.js | unit tests for the two new helpers |

### Exact contracts

**`precommitSessionEdits(vaultDir)` in `validate.js`.** No-op when the tree is
clean (never make an empty commit — keeps a no-edit night idempotent). When
dirty, stage everything and commit with the frozen message, using the same
committer identity as the dream commit:

```js
/** If the vault working tree is dirty, commit ALL uncommitted changes (the user's
 *  own session edits) as a single commit so the subsequent dream diff is exactly
 *  the brain's writes. No-op on a clean tree. The message is frozen — do not vary it.
 *  @param {string} vaultDir @returns {{committed:boolean, sha:string|null}} */
function precommitSessionEdits(vaultDir) {
  const status = git(vaultDir, ['status', '--porcelain', '-uall']);
  if (status.stdout.trim() === '') return { committed: false, sha: null };
  git(vaultDir, ['add', '-A']);
  git(vaultDir, [
    '-c', 'user.name=wienerdog', '-c', 'user.email=wienerdog@localhost',
    'commit', '-m', 'vault: session edits before dream',
  ]);
  const sha = git(vaultDir, ['rev-parse', 'HEAD']).stdout.trim();
  return { committed: true, sha };
}
```

**`restoreVaultToHead(vaultDir)` in `validate.js`.** Discard all working-tree and
untracked (non-ignored) changes, restoring to HEAD (which, after
`precommitSessionEdits`, is the pre-brain state):

```js
/** Restore the vault working tree to HEAD: drop tracked modifications and remove
 *  untracked non-ignored files (the brain's unvalidated writes). Uses `git clean
 *  -fd` (NOT -x) so .gitignore'd files — e.g. the adopt starter-ignore's plugin
 *  binaries — are preserved. Vault-scoped by construction (the vault IS the repo).
 *  @param {string} vaultDir */
function restoreVaultToHead(vaultDir) {
  git(vaultDir, ['reset', '--hard', 'HEAD']);
  git(vaultDir, ['clean', '-fd']);
}
```

Add both to `module.exports`.

**`src/cli/dream.js` — new `run()` sequence.** Precise changes:

1. Remove the pre-lock `assertCleanTree(vaultDir)` call (step 2). Keep
   `assertGitRepo(vaultDir)`.
2. Import `precommitSessionEdits`, `restoreVaultToHead`, and (still)
   `assertCleanTree` from `../core/dream/validate`.
3. After `acquireLock` succeeds and before opening the brain log stream, insert:

   ```js
   // Commit the user's own uncommitted session edits so the post-brain diff is
   // exactly the brain's writes (fixes dirty-vault starvation).
   precommitSessionEdits(vaultDir);
   // After the pre-commit the tree MUST be clean. If it is not, dirt appeared
   // while the lock was held (a race, not session edits) — refuse (pathological).
   assertCleanTree(vaultDir);
   ```

4. Wrap the brain run + validate so a brain failure/timeout restores the vault
   *before* the lock is released and *before* the error propagates:

   ```js
   try {
     await runBrainWithWatchdog({ … });
   } catch (err) {
     restoreVaultToHead(vaultDir);   // discard the crashed brain's unvalidated writes
     throw err;                      // still fail: run-job records error + fails loud
   } finally {
     logStream.end();
   }
   ```

   The outer `finally` (releaseLock + cleanScratch) is unchanged and still runs
   after the restore. Do NOT swallow the error — the job must exit nonzero.

5. In `runBrainWithWatchdog`, enrich the nonzero-exit message with the tail
   captured by WP-038:

   ```js
   if (result.code !== 0) {
     const tail = (result.stderrTail || '').trim();
     throw new WienerdogError(`dream brain exited ${result.code}${tail ? `: ${tail}` : ''}`);
   }
   ```

**Fake brain `crash` mode** (`tests/fixtures/dream/fake-brain.js`). Before the
existing valid/invalid writes, add — near the `hang` branch — a mode that writes
one vault file, emits a recognizable stderr line, and exits nonzero:

```js
if (process.env.WIENERDOG_FAKE_BRAIN_MODE === 'crash') {
  // Simulate a brain that died mid-write (transient API drop): a partial,
  // unvalidated vault write, an error on stderr, then a nonzero exit.
  write('00-Inbox/partial-note.md', '---\ntype: note\n---\n\nhalf-written\n');
  process.stderr.write('brain error: API connection dropped mid-run\n');
  process.exit(1);
}
```

(`write(rel, content)` already exists in the fixture.)

## Implementation notes & constraints

- No new npm dependencies; plain Node ≥ 18; JSDoc types only (CLAUDE.md).
- The pre-commit is a **durable, user-visible behavior change** (Wienerdog now
  auto-commits the user's own vault edits). It is decided (encode it), but note in
  the PR that an ADR may be warranted — do not author one here.
- `git clean -fd` must NOT use `-x` (would delete `.gitignore`'d files such as the
  adopt starter-ignore's plugin binaries / `.smart-env/`). If you need to justify
  a variant, record it under "Decisions made".
- The pre-commit uses the `wienerdog` committer identity (matching the dream
  commit) rather than the user's git identity, so it works even when the vault has
  no `user.name`/`user.email` configured. Record this if you deviate.
- Do NOT change `validateAndCommit`, the alert/fail-loud mechanism (WP-041), or
  `brain.js` (WP-038). This WP consumes `brain.js`'s `stderrTail`; it does not
  define it.

## Acceptance criteria

- [ ] `precommitSessionEdits` on a clean tree returns `{committed:false}` and adds
      no commit; on a dirty tree it makes exactly one commit whose subject is
      `vault: session edits before dream`.
- [ ] `restoreVaultToHead` removes untracked brain writes and reverts tracked
      modifications back to HEAD; a `.gitignore`'d untracked file survives it.
- [ ] Starvation e2e: a dirty vault + fresh transcripts → the dream proceeds; the
      pre-commit (`vault: session edits before dream`) and the dream commit both
      land (commit count +2 vs the clean-baseline +1); the previously-uncommitted
      file is now tracked.
- [ ] Crash-recovery e2e: a `crash`-mode brain → `dream.run` throws, no dream
      commit is made, the brain's partial write is gone, the working tree is clean,
      and the lock file is released. The thrown message includes the brain's
      stderr tail (`API connection dropped`).
- [ ] The old "dirty vault aborts before the brain" behavior is replaced (that
      test now asserts the starvation fix).
- [ ] `git revert` of the dream commit still cleanly undoes the brain's writes
      (existing revert test still passes).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'dream-integration'
npm test -- --test-name-pattern 'dream-validate'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Clean-env, PATH/USER, `rotateLogs`, and `spawnBrain`'s `stderrTail` capture —
  **WP-038** (this WP depends on it).
- Persistent failure alerts / `alerts.jsonl` / digest alert block — **WP-041**.
- Note-update provenance preservation in the dream skill — **WP-040**.
- Authoring the ADR for the pre-commit behavior — flag it in the PR; owner/
  architect decides.
- A session-end hook that commits edits (an alternative to the pre-commit that
  was considered and rejected in favor of this design).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/039-dream-precommit-crash-recovery`; conventional commits;
   PR titled `fix(dream): pre-commit session edits + crash recovery (WP-039)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
