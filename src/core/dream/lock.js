'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** @param {string} stateDir @returns {string} */
function lockPath(stateDir) {
  return path.join(stateDir, 'dream.lock');
}

/**
 * Create state/dream.lock before touching shared scratch.
 * Contents (JSON): { pid, host, startedAt:<ISO>, deadline:<epoch ms> }.
 * Existing locks are retained until expired AND their valid local PID is absent.
 * Unknown ownership cannot authorize takeover. Process existence is not a health
 * check; PID reuse can conservatively delay recovery (Table L, WP-dream-live-owner-lock).
 * @param {string} stateDir
 * @param {number} timeoutMs  deadline = now + timeoutMs
 * @returns {{acquired:true, stolen:boolean}|{acquired:false, stolen:false, reason:'busy'|'owner-unknown'}}
 */
function acquireLock(stateDir, timeoutMs) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = lockPath(stateDir);
  const now = Date.now();
  const payload = JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    startedAt: new Date(now).toISOString(),
    deadline: now + timeoutMs,
  });

  try {
    fs.writeFileSync(file, payload, { flag: 'wx' });
    return { acquired: true, stolen: false };
  } catch (err) {
    if (err && err.code !== 'EEXIST') throw err;
  }

  const busy = { acquired: false, stolen: false, reason: 'busy' };
  const unknown = { acquired: false, stolen: false, reason: 'owner-unknown' };
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return unknown;
  }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing) ||
      typeof existing.deadline !== 'number' || !Number.isFinite(existing.deadline)) {
    return unknown;
  }
  // The deadline is a not-before threshold for recovery, not proof of death.
  if (now <= existing.deadline) return busy;
  if (typeof existing.host !== 'string' || existing.host !== os.hostname() ||
      !Number.isInteger(existing.pid) || existing.pid < 1 || existing.pid > 2147483647) {
    return unknown;
  }
  try {
    process.kill(existing.pid, 0); // Existence probe only; sends no terminating signal.
    return busy;
  } catch (err) {
    if (err && err.code === 'EPERM') return busy;
    if (!err || err.code !== 'ESRCH') return unknown;
  }

  // Retained recovery: this read/probe-to-overwrite sequence is not atomic.
  // Simultaneous stale claimants may overwrite one another (accepted L5 residual).
  fs.writeFileSync(file, payload); // steal: overwrite
  return { acquired: true, stolen: true };
}

/**
 * Delete the lock IFF its pid matches process.pid (never delete someone else's).
 * No-op if absent. Never throws.
 * @param {string} stateDir
 */
function releaseLock(stateDir) {
  const file = lockPath(stateDir);
  try {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (existing.pid === process.pid) fs.rmSync(file, { force: true });
  } catch {
    // absent or unparseable → nothing safe to remove
  }
}

/**
 * True IFF state/dream.lock currently exists and its pid is THIS process — i.e.
 * we still hold the lock and were not superseded by a stale-lock steal. Used by
 * the dream teardown to decide whether cleaning scratch / releasing the lock is
 * safe: a superseded process must touch NEITHER (the stealer now owns both).
 * Never throws.
 * @param {string} stateDir
 * @returns {boolean}
 */
function ownsLock(stateDir) {
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath(stateDir), 'utf8'));
    return existing.pid === process.pid;
  } catch {
    return false; // absent or unparseable → we do not own it
  }
}

module.exports = { acquireLock, releaseLock, ownsLock };
