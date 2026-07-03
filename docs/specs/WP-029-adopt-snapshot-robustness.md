---
id: WP-029
title: Harden `wienerdog adopt` initial-snapshot (surfaced git errors, stale-lock recovery, starter .gitignore)
status: In-Review
model: opus
size: M
depends_on: [WP-026]
adrs: [ADR-0004, ADR-0010]
branch: wp/029-adopt-snapshot-robustness
---

# WP-029: Harden `wienerdog adopt` initial-snapshot

## Context (read this, nothing else)

`wienerdog adopt <path>` (built in WP-026) lets a power user turn their existing
markdown vault into THE Wienerdog vault **in place**, instead of the fresh
`~/wienerdog/` that `wienerdog init` scaffolds. Adoption's whole safety story is
git: "one dream run = one commit, so `git revert <sha>` undoes a night"
(ADR-0010, THREAT-MODEL T1). So when `adopt` runs on a folder that is **not yet a
git repo**, it offers to `git init` the folder and take an **initial snapshot
commit** — that snapshot is the `HEAD` the first dream's revert unwinds against.

**Product invariant (ADR-0004): Wienerdog is just files.** This WP starts no
process that outlives its job, adds no daemon, no telemetry. Everything it does
to a user's machine must be idempotent (running twice changes nothing) and
reversible (`wienerdog uninstall` already leaves an adopted vault untouched
because adoption records only `vault-file`/`vault-dir` manifest kinds the reverse
pass skips — this WP does not change that).

This WP fixes three real failures a maintainer hit adopting a large, mature
Obsidian vault, all in the initial-snapshot step:

1. **Silent snapshot failure.** `adopt`'s `git add -A` result is discarded, and
   the commit-failure path throws a generic `failed to take the initial git
   snapshot.` that swallows git's stderr. When git dies, the user sees no cause.
2. **`git add` killed by the OS.** On the maintainer's machine `git add -A` was
   `SIGKILL`ed (exit 137) while staging a **60 MB running binary**
   (`.obsidian/plugins/mcp-tools/bin/mcp-server`). The killed `git add` left a
   `.git/index.lock`. Because the error was swallowed and the discarded exit code
   never checked, `adopt` marched on to `git commit`, which then failed on the
   leftover lock with git's confusing "Another git process seems to be running"
   text — also swallowed.
3. **Re-run wedged on a stale lock.** Re-running `adopt` after that crash does not
   recover: the folder is now a git repo (the first run's `git init` succeeded) but
   has **no commit**, so the snapshot is incomplete AND a stale `.git/index.lock`
   remains. Nothing detects or clears it.

The maintainer's own fix was a hand-written vault `.gitignore` (plugin `bin/`,
`.smart-env/`, `workspace*.json`, `.DS_Store`) that kept the churny/hazardous
paths out of the snapshot entirely. This WP makes `adopt` **offer** that
`.gitignore` before staging, surface every git failure with full diagnostics, and
detect + clear a stale lock so a re-run heals itself.

## Current state

`src/cli/adopt.js` exists and works (WP-026). The relevant region is the
git-prerequisite step (currently lines ~161–198). Its private helpers:

```js
/** @param {string} dir @param {string[]} args @returns {import('child_process').SpawnSyncReturns<Buffer>} */
function git(dir, args) {
  return spawnSync('git', ['-C', dir, ...args]);   // NOTE: Buffers, no encoding
}
/** @returns {boolean} true if dir is inside a git work tree. */
function isGitRepo(dir) {
  const r = git(dir, ['rev-parse', '--git-dir']);
  return !r.error && r.status === 0;
}
/** Ask a yes/no question on stdin. @returns {Promise<boolean>} */
function confirm(prompt)   // returns true ONLY for /^y(es)?$/i; empty answer => false
```

The current snapshot block (the code this WP replaces), verbatim:

```js
  // 6. Git prerequisite — the whole revert-safety guarantee rests on it.
  const alreadyRepo = isGitRepo(adoptedPath);
  if (!alreadyRepo) {
    console.log(
      '\nThis folder is not yet tracked by git.\n' +
        'Wienerdog needs git so a night of auto-written memory is one commit you can undo\n' +
        'with a single `git revert`. Without it, adopted memory would not be recoverable.'
    );
    if (dryRun) {
      console.log('(--dry-run: would initialize a git repository and take an initial snapshot here.)');
    } else {
      const okGit = yes || (await confirm('Initialize a git repository here and take an initial snapshot? [y/N] '));
      if (!okGit) {
        throw new WienerdogError('adoption needs a git repo; aborted.');
      }
      const init = git(adoptedPath, ['init']);
      if (init.error || init.status !== 0) {
        throw new WienerdogError('failed to run `git init` — is git installed?');
      }
      git(adoptedPath, ['add', '-A']);                       // <-- result DISCARDED (bug 1)
      const commit = git(adoptedPath, [
        '-c', 'user.name=wienerdog', '-c', 'user.email=wienerdog@localhost',
        'commit', '--allow-empty', '-m', 'wienerdog: adopt — initial snapshot',
      ]);
      if (commit.error || commit.status !== 0) {
        throw new WienerdogError('failed to take the initial git snapshot.');   // <-- stderr SWALLOWED (bug 1)
      }
    }
  }
```

`bin/wienerdog.js` prints a `WienerdogError` as `wienerdog: <message>\n` then
exits 1; multi-line messages render fine (only the first line gets the prefix).

The e2e test `tests/integration/adopt-e2e.test.js` already drives
`init → adopt(--yes) → sync → dream → git revert` on the non-git
`tests/fixtures/poweruser-vault` copied to a temp dir (so the git-init offer path
runs under `--yes`). There is **no** unit test for adopt today.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/adopt-git.js | testable git-snapshot seam: `runGitStep`, `inspectIndexLock`, `removeIndexLock`, `planGitignore`, `applyGitignore`, `DEFAULT_GITIGNORE_LINES`, `STALE_LOCK_AGE_MS`. Injectable `spawn`. |
| modify | src/cli/adopt.js | replace the snapshot block (step 6) with calls into `adopt-git.js`: gitignore offer, stale-lock recovery, idempotent snapshot, surfaced git errors. |
| create | tests/unit/adopt-git.test.js | unit tests: stderr/code/signal surfacing (fake spawn incl. SIGKILL), stale-lock both branches, gitignore append + decline + idempotency. |
| modify | tests/integration/adopt-e2e.test.js | extend the first test to assert the `.gitignore` offer wrote the default lines (append-not-overwrite) under `--yes`. |

Do **not** modify `bin/wienerdog.js`, `src/core/vault.js`, `scaffoldMappedDirs`,
the manifest, or any golden. No new npm dependency.

### Exact contracts

#### `src/core/adopt-git.js`

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('./errors');

/**
 * @typedef {(cmd: string, args: string[], opts?: object)
 *   => { status: number|null, signal: string|null, error?: Error,
 *        stdout?: Buffer, stderr?: Buffer }} SpawnFn
 */

/** Default lines `adopt` offers to append to the vault's .gitignore. Order-stable. */
const DEFAULT_GITIGNORE_LINES = [
  '.obsidian/plugins/*/bin/',
  '.smart-env/',
  '.obsidian/workspace*',
  '.DS_Store',
  '.trash/',
];

/** A .git/index.lock older than this (ms) is treated as a crash orphan, not a live op. */
const STALE_LOCK_AGE_MS = 10_000;

/**
 * Run ONE git step under `-C dir`. On ANY failure (spawn error, non-zero exit,
 * or termination by signal) throw a WienerdogError carrying the full cause:
 * how it failed (signal name, or exit code, or spawn error code), git's stderr,
 * and — when the child was SIGKILLed / exit 137 or stderr smells of size/memory —
 * a hint that a very large or locked file is the likely cause. NEVER swallows stderr.
 * @param {string} dir @param {string[]} args @param {string} label human step name, e.g. "git add -A"
 * @param {{spawn?: SpawnFn}} [opts]
 * @returns {import('child_process').SpawnSyncReturns<Buffer>} the (successful) spawn result
 */
function runGitStep(dir, args, label, opts = {}) { /* … */ }

/**
 * Inspect `<dir>/.git/index.lock`. Absent => not present. Present => stale iff its
 * mtime age >= STALE_LOCK_AGE_MS (a crashed `git add` leaves an aged lock; a live
 * op holds a fresh one). `now` is injectable for tests.
 * @param {string} dir @param {{now?: number}} [opts]
 * @returns {{present: boolean, stale: boolean, lockPath: string, ageMs: number|null}}
 */
function inspectIndexLock(dir, opts = {}) { /* … */ }

/** Delete the lock file (force; missing is fine). @param {string} lockPath */
function removeIndexLock(lockPath) { /* fs.rmSync(lockPath, { force: true }) */ }

/**
 * Which DEFAULT_GITIGNORE_LINES are MISSING from `<dir>/.gitignore` (exact,
 * trimmed line match). `existing` reports whether a .gitignore already exists.
 * @param {string} dir
 * @returns {{path: string, existing: boolean, missing: string[]}}
 */
function planGitignore(dir) { /* … */ }

/**
 * Append the plan's missing lines under a one-line header comment. APPEND-ONLY:
 * never rewrites, reorders, or removes existing content. No-op when nothing is
 * missing (so re-running adopt never duplicates lines — idempotent).
 * @param {{path: string, existing: boolean, missing: string[]}} plan
 */
function applyGitignore(plan) { /* … */ }

module.exports = {
  DEFAULT_GITIGNORE_LINES, STALE_LOCK_AGE_MS,
  runGitStep, inspectIndexLock, removeIndexLock, planGitignore, applyGitignore,
};
```

**`runGitStep` message shape (binding).** Build a `WienerdogError` whose message
is these lines joined with `\n`:

1. `` `${label} failed: ${how}.` `` where `how` is:
   - spawn error → `` `could not start git (${r.error.code || r.error.message})` `` ;
   - `r.signal` set → `` `git was killed by signal ${r.signal}` `` ;
   - else → `` `git exited with code ${r.status}` `` .
2. `` `  git said: ${stderr.trim() || '(no output)'}` `` where `stderr` is
   `r.stderr ? r.stderr.toString() : ''`.
3. **Only when** `r.signal === 'SIGKILL' || r.status === 137 ||
   /large|too big|out of memory|cannot allocate|pack/i.test(stderr)`, append the
   two hint lines:
   - `  This usually means git choked on a very large or locked file (e.g. a running`
   - `  binary or a multi-hundred-MB file). Exclude such paths via .gitignore and retry.`
4. When the failure is a spawn error (git missing), append instead of the size
   hint: `  Is git installed and on your PATH?`

`applyGitignore` output format: if the file did not exist, write exactly the
header line, then each missing line, then a trailing `\n`. If it existed, first
ensure the current content ends with a newline, add ONE blank separator line,
then the header + missing lines + trailing `\n`. Header line, verbatim:
`# Added by wienerdog adopt — churny / hazardous paths not worth tracking.`

#### `src/cli/adopt.js` — the replacement snapshot region

Keep the existing private `git`, `isGitRepo`, and `confirm` helpers. Add
`const adoptGit = require('../core/adopt-git');` near the top requires. Replace
the whole `// 6. Git prerequisite …` block with the sequence below. The rest of
`run()` (steps 7–12) is unchanged.

```js
  // 6. Git prerequisite + initial snapshot — the revert-safety guarantee rests on it.
  //    Idempotent: take the snapshot whenever the repo has no HEAD commit yet, so a
  //    re-run after a crash mid-snapshot heals itself instead of skipping the block.
  const alreadyRepo = isGitRepo(adoptedPath);
  const hasHead = alreadyRepo && git(adoptedPath, ['rev-parse', '--verify', 'HEAD']).status === 0;

  if (!hasHead) {
    if (!alreadyRepo) {
      console.log(
        '\nThis folder is not yet tracked by git.\n' +
          'Wienerdog needs git so a night of auto-written memory is one commit you can undo\n' +
          'with a single `git revert`. Without it, adopted memory would not be recoverable.'
      );
    }

    if (dryRun) {
      console.log(
        alreadyRepo
          ? '(--dry-run: this repo has no initial commit; would offer a starter .gitignore, clear any stale index.lock, and take an initial snapshot.)'
          : '(--dry-run: would init git, offer a starter .gitignore, clear any stale index.lock, and take an initial snapshot here.)'
      );
    } else {
      // 6a. Consent to git init only when the folder is not a repo yet.
      if (!alreadyRepo) {
        const okGit = yes || (await confirm('Initialize a git repository here and take an initial snapshot? [y/N] '));
        if (!okGit) throw new WienerdogError('adoption needs a git repo; aborted.');
        adoptGit.runGitStep(adoptedPath, ['init'], 'git init');
      }

      // 6b. Offer a starter .gitignore BEFORE staging, so churny/hazardous files
      //     (running plugin binaries, huge caches) never enter the snapshot.
      const plan = adoptGit.planGitignore(adoptedPath);
      if (plan.missing.length > 0) {
        console.log('\nWienerdog can add a starter .gitignore so git skips churny or hazardous files:');
        for (const l of plan.missing) console.log(`  ${l}`);
        console.log('(Appended to any existing .gitignore; nothing you wrote is overwritten.)');
        const okIgnore = yes || (await confirm('Add these lines to .gitignore? [y/N] '));
        if (okIgnore) adoptGit.applyGitignore(plan);
        else console.log('Proceeding without them — a very large or locked file may make git fail.');
      }

      // 6c. Recover from a stale index.lock left by an interrupted earlier run.
      const lock = adoptGit.inspectIndexLock(adoptedPath);
      if (lock.present && lock.stale) {
        console.log(
          `\nFound a leftover git lock (${lock.lockPath}), about ${Math.round(lock.ageMs / 1000)}s old,\n` +
            'likely from an interrupted earlier run. No git process appears to be using it.'
        );
        const okRm = yes || (await confirm('Remove the stale lock and continue? [y/N] '));
        if (!okRm) throw new WienerdogError('git index is locked; remove `.git/index.lock` and retry.');
        adoptGit.removeIndexLock(lock.lockPath);
      } else if (lock.present && !lock.stale) {
        throw new WienerdogError(
          'another git process seems to be using this repo right now (a fresh `.git/index.lock`); ' +
            'finish or stop it, then retry.'
        );
      }

      // 6d. Snapshot. Every step surfaces stderr + code/signal on failure.
      adoptGit.runGitStep(adoptedPath, ['add', '-A'], 'git add -A (staging the vault)');
      adoptGit.runGitStep(
        adoptedPath,
        ['-c', 'user.name=wienerdog', '-c', 'user.email=wienerdog@localhost',
         'commit', '--allow-empty', '-m', 'wienerdog: adopt — initial snapshot'],
        'git commit (initial snapshot)'
      );
    }
  }
```

**Before / after (bug 1, `git add` SIGKILLed on a 60 MB running binary):**

Before — the discarded `git add` exit code let control reach `git commit`, which
failed on the leftover lock; both stderrs were swallowed:

```
wienerdog: failed to take the initial git snapshot.
```

After — the `git add` failure is caught and fully surfaced:

```
wienerdog: git add -A (staging the vault) failed: git was killed by signal SIGKILL.
  git said: (no output)
  This usually means git choked on a very large or locked file (e.g. a running
  binary or a multi-hundred-MB file). Exclude such paths via .gitignore and retry.
```

**Before / after (bug 3, re-run after crash):**

Before — the folder is now a repo, so the whole block is skipped: no snapshot is
ever taken and the stale `.git/index.lock` survives to break the first dream.

After — `hasHead` is false (no commit), so the block runs; `inspectIndexLock`
finds the aged lock and offers removal, then the snapshot completes:

```
Found a leftover git lock (/Users/…/vault/.git/index.lock), about 42s old,
likely from an interrupted earlier run. No git process appears to be using it.
Remove the stale lock and continue? [y/N] y
```

## Implementation notes & constraints

- **Why mtime-age, not a `ps` process scan, for staleness.** The task frames
  staleness as "lock exists AND no live git process." I pick a **lock mtime age
  ≥ 10 s** heuristic as the single deterministic mechanism, and deliberately do
  NOT shell out to `ps`: (a) a `ps` scan for "any git process" gives false
  "busy" positives when the user has an unrelated git running in another repo,
  and false negatives on a lock held by a non-`git`-named tool; (b) `ps` output
  parsing is not portable across macOS/Linux; (c) `adopt` is a foreground,
  one-shot command that has taken no git write of its own before this check, so a
  pre-existing lock is by construction not ours. The age gate distinguishes a
  crash orphan (aged) from a genuinely concurrent op (fresh, < 10 s) — and every
  removal is still gated on interactive consent (or `--yes`), so a wrong guess is
  never silently destructive. This is my call as architect; record it under
  "Decisions made" if you refine it.
- **`--yes` semantics.** `--yes` auto-accepts every prompt here, exactly as it
  already does for the git-init offer: it adds the `.gitignore` and removes a
  stale lock without asking. Do not change the shared `confirm()` helper (it
  returns true only for `y`/`yes`, default-no); the offers are opt-in with a
  `[y/N]` label, which is fine — declining the `.gitignore` just proceeds without
  it, and declining stale-lock removal aborts with a clear message.
- **Scope of the `.gitignore` / stale-lock offers.** They run ONLY inside the
  no-HEAD snapshot region — i.e. for a freshly `git init`ed vault or a
  crashed-mid-adopt one. An already-established repo (has a HEAD commit) takes no
  git writes from `adopt`, so it gets neither offer; the user manages their own
  `.gitignore` there. Do not widen this.
- **The `.gitignore` default list is a local decision, not an ADR.** It is narrow
  (one command), append-only, shown before consent, and reversible; it does not
  establish a cross-cutting pattern. Keep it in this WP.
- **Idempotency (CLAUDE.md).** `planGitignore` must return `missing: []` when all
  default lines are already present, so `applyGitignore` is a no-op on re-run and
  never duplicates lines. The whole step-6 region must be safe to run twice: once
  a HEAD commit exists, the block is skipped entirely.
- **Read probes stay on the private `git()` helper.** `isGitRepo` and the
  `rev-parse --verify HEAD` check are read-only and may fail benignly; keep them
  on `git()`, NOT `runGitStep` (which throws on non-zero — wrong for a probe).
- When uncertain: choose the simpler option and note it under "Decisions made".
  Do NOT expand scope.

## Acceptance criteria

- [ ] Every git-failure path in `adopt`'s snapshot throws a `WienerdogError`
      whose message includes git's stderr AND the exit code or signal; a
      `SIGKILL`/137 failure names the signal and prints the large/locked-file hint.
- [ ] `git add -A`'s result is checked (no longer discarded); a failing
      `git add` never proceeds to `git commit`.
- [ ] Before staging, `adopt` offers a `.gitignore` containing exactly
      `.obsidian/plugins/*/bin/`, `.smart-env/`, `.obsidian/workspace*`,
      `.DS_Store`, `.trash/`; accepting appends (never overwrites) and shows the
      lines first; declining proceeds; `--yes` accepts.
- [ ] A stale `.git/index.lock` (mtime ≥ 10 s) is detected and, on consent or
      `--yes`, removed before staging; a fresh lock (< 10 s) aborts with a clear
      "another git process" message.
- [ ] Re-running `adopt` after a snapshot crash completes the snapshot (no-HEAD
      repo is not skipped) and does not duplicate `.gitignore` lines.
- [ ] `npm test` and `npm run lint` pass; no golden changes.

## Verification steps (run these; paste output in the PR)

```bash
node --test tests/unit/adopt-git.test.js
node --test tests/integration/adopt-e2e.test.js
npm test
npm run lint
git status --porcelain tests/golden        # MUST be empty — no golden changed
```

The unit test must cover, with an injected fake `spawn`:
- non-zero exit surfaces `git said: <stderr>` + `exited with code <n>`;
- `{ signal: 'SIGKILL', status: null }` surfaces the signal name + the size/lock hint;
- `{ error: { code: 'ENOENT' } }` surfaces "could not start git" + the git-installed hint;
- `inspectIndexLock` on an aged lock (`fs.utimesSync` the file into the past) → `stale: true`; on a just-created lock → `stale: false`; absent → `present: false`;
- `planGitignore`/`applyGitignore`: fresh file gets all five lines + header; a file already holding two defaults + a custom line gets only the three missing appended with the custom line preserved; a second `applyGitignore` is a no-op.

The e2e extension (in the existing first test, after `adopt.run([adopted, '--yes'])`):
- assert `<adopted>/.gitignore` exists and contains all five default lines;
- (append proof) before adopting, write `<adopted>/.gitignore` with one custom
  line + one default line, then after adopt assert the custom line survives and
  the four missing defaults were appended. Confirm the existing `git ls-files`
  and revert assertions still pass unchanged.

## Out of scope (do NOT do these)

- Changing digest rendering or the setup skill wording — that is WP-030.
- Generalizing the `.gitignore`/stale-lock offers to already-established repos.
- Adding a `--gitignore`/`--no-gitignore` flag or making the default list
  configurable — not requested.
- Touching `scaffoldMappedDirs`, the manifest, or `bin/wienerdog.js`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/029-adopt-snapshot-robustness`; conventional commits; PR titled
   `fix(adopt): harden initial-snapshot git errors, stale-lock, .gitignore (WP-029)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
</invoke>
