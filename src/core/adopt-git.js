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

/** Header line prepended to the appended .gitignore block. */
const GITIGNORE_HEADER = '# Added by wienerdog adopt — churny / hazardous paths not worth tracking.';

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
function runGitStep(dir, args, label, opts = {}) {
  const spawn = opts.spawn || spawnSync;
  const r = spawn('git', ['-C', dir, ...args]);

  if (!r.error && !r.signal && r.status === 0) return r;

  const stderr = r.stderr ? r.stderr.toString() : '';
  let how;
  if (r.error) {
    how = `could not start git (${r.error.code || r.error.message})`;
  } else if (r.signal) {
    how = `git was killed by signal ${r.signal}`;
  } else {
    how = `git exited with code ${r.status}`;
  }

  const lines = [`${label} failed: ${how}.`, `  git said: ${stderr.trim() || '(no output)'}`];

  if (r.error) {
    lines.push('  Is git installed and on your PATH?');
  } else if (
    r.signal === 'SIGKILL' ||
    r.status === 137 ||
    /large|too big|out of memory|cannot allocate|pack/i.test(stderr)
  ) {
    lines.push('  This usually means git choked on a very large or locked file (e.g. a running');
    lines.push('  binary or a multi-hundred-MB file). Exclude such paths via .gitignore and retry.');
  }

  throw new WienerdogError(lines.join('\n'));
}

/**
 * Inspect `<dir>/.git/index.lock`. Absent => not present. Present => stale iff its
 * mtime age >= STALE_LOCK_AGE_MS (a crashed `git add` leaves an aged lock; a live
 * op holds a fresh one). `now` is injectable for tests.
 * @param {string} dir @param {{now?: number}} [opts]
 * @returns {{present: boolean, stale: boolean, lockPath: string, ageMs: number|null}}
 */
function inspectIndexLock(dir, opts = {}) {
  const now = opts.now !== undefined ? opts.now : Date.now();
  const lockPath = path.join(dir, '.git', 'index.lock');
  let st;
  try {
    st = fs.statSync(lockPath);
  } catch {
    return { present: false, stale: false, lockPath, ageMs: null };
  }
  const ageMs = now - st.mtimeMs;
  return { present: true, stale: ageMs >= STALE_LOCK_AGE_MS, lockPath, ageMs };
}

/**
 * Delete the lock file (force; missing is fine).
 * @param {string} lockPath
 */
function removeIndexLock(lockPath) {
  fs.rmSync(lockPath, { force: true });
}

/**
 * Which DEFAULT_GITIGNORE_LINES are MISSING from `<dir>/.gitignore` (exact,
 * trimmed line match). `existing` reports whether a .gitignore already exists.
 * @param {string} dir
 * @returns {{path: string, existing: boolean, missing: string[]}}
 */
function planGitignore(dir) {
  const p = path.join(dir, '.gitignore');
  let content = '';
  let existing = false;
  try {
    content = fs.readFileSync(p, 'utf8');
    existing = true;
  } catch {
    existing = false;
  }
  const present = new Set(content.split('\n').map((l) => l.trim()));
  const missing = DEFAULT_GITIGNORE_LINES.filter((l) => !present.has(l));
  return { path: p, existing, missing };
}

/**
 * Append the plan's missing lines under a one-line header comment. APPEND-ONLY:
 * never rewrites, reorders, or removes existing content. No-op when nothing is
 * missing (so re-running adopt never duplicates lines — idempotent).
 * @param {{path: string, existing: boolean, missing: string[]}} plan
 */
function applyGitignore(plan) {
  if (plan.missing.length === 0) return;
  const block = [GITIGNORE_HEADER, ...plan.missing].join('\n') + '\n';
  if (!plan.existing) {
    fs.writeFileSync(plan.path, block);
    return;
  }
  let content = fs.readFileSync(plan.path, 'utf8');
  if (content.length > 0 && !content.endsWith('\n')) content += '\n';
  content += '\n' + block;
  fs.writeFileSync(plan.path, content);
}

module.exports = {
  DEFAULT_GITIGNORE_LINES,
  STALE_LOCK_AGE_MS,
  runGitStep,
  inspectIndexLock,
  removeIndexLock,
  planGitignore,
  applyGitignore,
};
