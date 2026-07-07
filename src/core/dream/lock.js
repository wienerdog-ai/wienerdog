'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** @param {string} stateDir @returns {string} */
function lockPath(stateDir) {
  return path.join(stateDir, 'dream.lock');
}

/**
 * Atomically create state/dream.lock so two dreams never overlap.
 * Contents (JSON): { pid, host, startedAt:<ISO>, deadline:<epoch ms> }.
 * - Create with fs open flag 'wx' (fails if the file exists) → acquired, not stolen.
 * - If it exists: read it. If now > deadline (or unparseable) the previous run is
 *   dead/hung → STEAL (overwrite) and return stolen:true. Otherwise another dream
 *   is genuinely running → acquired:false.
 * @param {string} stateDir
 * @param {number} timeoutMs  deadline = now + timeoutMs
 * @returns {{acquired:boolean, stolen:boolean}}
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

  // Lock exists — decide whether the prior holder is dead/hung.
  let live = false;
  try {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    live = typeof existing.deadline === 'number' && now <= existing.deadline;
  } catch {
    live = false; // unparseable → treat as dead
  }

  if (live) return { acquired: false, stolen: false };

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
