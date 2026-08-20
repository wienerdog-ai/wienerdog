#!/usr/bin/env node
/**
 * Run-scoped temp root wrapper (WP-temp-root-wrapper).
 *
 * Fronts every test entry point (`npm test` and the five scenario scripts —
 * see package.json). Test files across the suite create scratch directories
 * with `fs.mkdtempSync(path.join(os.tmpdir(), 'wd-<name>-'))` and mostly
 * never remove them, which leaks thousands of directories per run into the
 * developer's ambient temp directory. Rather than migrating every test file
 * to per-test cleanup, this wrapper creates ONE temp root per run, points
 * the child's temp directory at it via TMPDIR/TMP/TEMP, waits for the
 * child, and deletes the whole root afterward. Test files keep calling
 * `os.tmpdir()` exactly as they do today; only where it resolves changes.
 *
 * Usage: node tests/with-temp-root.js <script.js> [args...]
 *
 * What it runs: `process.execPath` with [<script.js>, ...args] — a Node
 * script path plus its arguments, never an arbitrary command string. No
 * shell, no PATH resolution — this keeps the wrapper from becoming a
 * general command-execution surface.
 *
 * `tests/run.js` is NOT modified by this wrapper (and is not even required
 * by this file): it is invoked exactly like any other entry script, and its
 * own `{ ...process.env, WIENERDOG_TEST_NO_REAL_SCHEDULER: '1' }` spread is
 * what carries this wrapper's injected TMPDIR/TMP/TEMP through to the
 * `node --test` grandchild.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAX_SURVIVOR_PATHS = 10;

/**
 * Recursively restore permissions on a leaked tree so it can be removed —
 * required because a directory left at mode 0o000 (e.g. by
 * tests/unit/private-fs.test.js's private-mode repair setup) makes
 * `fs.rmSync` throw ENOTEMPTY even with `force: true`, since the failure is
 * the parent's unreadability, not a missing file.
 *
 * Every entry is classified with `lstat` (never `stat`) so a symbolic link
 * is never followed and never chmod'ed — it is left in place for `rmSync`
 * to unlink. A directory is chmod'd to owner rwx BEFORE it is read: the
 * reverse order silently skips the contents of an unreadable directory,
 * which is exactly the case this walk exists for.
 *
 * Every filesystem call here is individually best-effort: this function
 * must never throw, so a permission-restore failure cannot turn a run's
 * outcome into a crash. Removal itself happens later, in `fs.rmSync`.
 *
 * @param {string} entryPath
 * @returns {void}
 */
function restorePermissions(entryPath) {
  let stat;
  try {
    stat = fs.lstatSync(entryPath);
  } catch {
    return;
  }
  if (!stat.isDirectory()) return; // files and symlinks: nothing to restore

  try {
    fs.chmodSync(entryPath, 0o700);
  } catch {
    // best effort — proceed to try reading it anyway
  }

  let entries;
  try {
    entries = fs.readdirSync(entryPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    restorePermissions(path.join(entryPath, entry));
  }
}

/**
 * Collect up to `limit` paths still present under `dirPath`, for a
 * diagnostic message when teardown fails to remove the root. Best-effort:
 * an unreadable entry is simply not descended into.
 *
 * @param {string} dirPath
 * @param {string[]} out
 * @param {number} limit
 * @returns {void}
 */
function collectSurvivors(dirPath, out, limit) {
  if (out.length >= limit) return;
  out.push(dirPath);
  let entries;
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= limit) return;
    collectSurvivors(path.join(dirPath, entry), out, limit);
  }
}

/**
 * Tear the run root down: restore permissions, then remove it. Never
 * throws — every step is individually best-effort, and the result is
 * reported by re-checking existence afterward rather than by trusting
 * `rmSync` not to have thrown.
 *
 * @param {string} root
 * @returns {{ removed: boolean, survivors: string[] }}
 */
function teardown(root) {
  try {
    restorePermissions(root);
  } catch {
    // best effort
  }
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // best effort — judged below by existence, not by this throwing
  }
  if (!fs.existsSync(root)) {
    return { removed: true, survivors: [] };
  }
  const survivors = [];
  collectSurvivors(root, survivors, MAX_SURVIVOR_PATHS);
  return { removed: false, survivors };
}

function main() {
  const argv = process.argv.slice(2);
  const scriptPath = argv[0];
  if (!scriptPath) {
    process.stderr.write(
      'usage: node tests/with-temp-root.js <script.js> [args...]\n'
    );
    process.exit(1);
    return;
  }
  const scriptArgs = argv.slice(1);

  // os.tmpdir() here resolves against the AMBIENT temp directory, so a
  // caller who already redirects TMPDIR keeps control of where the run
  // root lands.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-testrun-'));

  let status = null;
  let teardownResult = { removed: true, survivors: [] };
  try {
    // Inject ONLY TMPDIR/TMP/TEMP, all three set to the root, on every
    // platform (Node resolves os.tmpdir() from TMPDIR->TMP->TEMP->/tmp on
    // POSIX and from TEMP->TMP->SystemRoot\temp on win32). The rest of
    // process.env — including WIENERDOG_TEST_NO_REAL_SCHEDULER and
    // WIENERDOG_RUN_SCENARIOS, if the caller's own environment already set
    // them — passes through unchanged. Nothing else is injected or removed.
    const env = { ...process.env, TMPDIR: root, TMP: root, TEMP: root };

    let result;
    try {
      result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
        stdio: 'inherit',
        env,
      });
    } catch {
      // A throw from spawnSync itself: no status to propagate.
      result = { status: null };
    }
    status = result.status;
  } finally {
    // Teardown runs on every path out of the spawn: normal exit, signal
    // death, or a throw from spawnSync — covered by this finally. It does
    // NOT cover a signal delivered to the wrapper itself (see the spec's
    // named residual): spawnSync blocks the wrapper, so a SIGINT/SIGTERM
    // delivered to the wrapper terminates it without running this block.
    teardownResult = teardown(root);
    if (!teardownResult.removed) {
      process.stderr.write(
        `wienerdog: temp root survived teardown: ${root}\n` +
          teardownResult.survivors.map((p) => `  ${p}\n`).join('')
      );
    }
  }

  // Exit status (Table A): a teardown problem never overrides a failure.
  let exitCode;
  if (status == null) {
    // Signal death or spawn failure: no status to propagate, mirroring
    // tests/run.js's own `r.status == null ? 1 : r.status` convention.
    exitCode = 1;
  } else if (status !== 0) {
    // Non-zero numeric child status: propagate unchanged.
    exitCode = status;
  } else {
    // Child passed: 0 only if the root is actually gone afterward. A run
    // that passes while leaving an unremovable temp root is the
    // regression this wrapper exists to prevent.
    exitCode = teardownResult.removed ? 0 : 1;
  }
  process.exit(exitCode);
}

main();
