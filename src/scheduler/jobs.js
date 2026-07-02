'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const manifestLib = require('../core/manifest');

/**
 * Job definitions live in a managed `jobs:` section of config.yaml (stable
 * config). Job run watermarks (last_success/last_status) live in
 * state/schedule.json (frequently-changing machine state) so config.yaml's
 * manifest hash does not churn on every run.
 */

const BEGIN =
  '# --- wienerdog:jobs (managed by `wienerdog schedule`; do not edit by hand) ---';
const END = '# --- end wienerdog:jobs ---';

/** @param {string} content @returns {string} sha256 hex. */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** @param {string} v @returns {string} value with one layer of surrounding quotes stripped. */
function unquote(v) {
  const t = v.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse the jobs managed-section. Absent → []. Tolerant of the exact block this
 * module writes; never parses arbitrary YAML.
 * @param {string} configText
 * @returns {Array<{name:string, at:string, run:string, timeoutMinutes:number}>}
 */
function parseJobs(configText) {
  const begin = configText.indexOf(BEGIN);
  if (begin === -1) return [];
  const end = configText.indexOf(END, begin);
  if (end === -1) return [];
  const section = configText.slice(begin, end);
  const lines = section.split('\n');
  /** @type {Array<{name:string, at:string, run:string, timeoutMinutes:number}>} */
  const jobs = [];
  let cur = null;
  for (const line of lines) {
    const nameM = line.match(/^\s*-\s*name:\s*(.+)$/);
    if (nameM) {
      if (cur) jobs.push(cur);
      cur = { name: unquote(nameM[1]), at: '', run: '', timeoutMinutes: 0 };
      continue;
    }
    if (!cur) continue;
    const atM = line.match(/^\s*at:\s*(.+)$/);
    if (atM) {
      cur.at = unquote(atM[1]);
      continue;
    }
    const runM = line.match(/^\s*run:\s*(.+)$/);
    if (runM) {
      cur.run = unquote(runM[1]);
      continue;
    }
    const toM = line.match(/^\s*timeout_minutes:\s*(\d+)\s*$/);
    if (toM) cur.timeoutMinutes = Number(toM[1]);
  }
  if (cur) jobs.push(cur);
  return jobs;
}

/**
 * Render one job's YAML block (4-space nested under the `jobs:` list).
 * @param {{name:string, at:string, run:string, timeoutMinutes:number}} job
 * @returns {string}
 */
function renderJob(job) {
  return (
    `  - name: ${job.name}\n` +
    `    at: "${job.at}"\n` +
    `    run: ${job.run}\n` +
    `    timeout_minutes: ${job.timeoutMinutes}\n`
  );
}

/**
 * Strip the jobs managed-section (and its one leading blank-line separator) from
 * configText, preserving everything else byte-for-byte. Absent → unchanged.
 * @param {string} configText
 * @returns {string}
 */
function stripSection(configText) {
  const begin = configText.indexOf(BEGIN);
  if (begin === -1) return configText;
  const end = configText.indexOf(END, begin);
  if (end === -1) return configText;
  // Advance past the end sentinel line (through its trailing newline).
  let lineEnd = configText.indexOf('\n', end);
  lineEnd = lineEnd === -1 ? configText.length : lineEnd + 1;
  let before = configText.slice(0, begin);
  const after = configText.slice(lineEnd);
  // Remove the single blank-line separator our writer inserted before the block.
  if (before.endsWith('\n')) before = before.slice(0, -1);
  return before + after;
}

/**
 * Return configText with the jobs section replaced by `jobs` (removed entirely
 * if empty). Everything OUTSIDE the sentinels is preserved byte-for-byte; the
 * section is (re)written just before EOF with exactly one blank line before it.
 * @param {string} configText
 * @param {Array<{name:string, at:string, run:string, timeoutMinutes:number}>} jobs
 * @returns {string}
 */
function renderConfigWithJobs(configText, jobs) {
  let base = stripSection(configText);
  if (!jobs || jobs.length === 0) return base;
  if (!base.endsWith('\n')) base += '\n';
  const body = jobs.map(renderJob).join('');
  const section = `${BEGIN}\njobs:\n${body}${END}\n`;
  return `${base}\n${section}`;
}

/** @param {import('../core/paths').WienerdogPaths} paths @returns {string} */
function readConfig(paths) {
  return fs.readFileSync(paths.config, 'utf8');
}

/**
 * Re-sync the manifest's recorded config.yaml hash to the freshly written
 * content, so uninstall doesn't mistake our own edit for a user edit. Mirrors
 * init.js. No-op if the manifest has no config entry.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} content
 */
function resyncConfigHash(paths, content) {
  const manifest = manifestLib.load(paths);
  const entry = manifest.entries.find((e) => e.kind === 'file' && e.path === paths.config);
  if (entry) {
    entry.hash = sha256(content);
    manifestLib.save(paths, manifest);
  }
}

/**
 * Upsert one job (add, or replace the job with the same name) and persist
 * config.yaml, then re-sync the manifest hash.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, at:string, run:string, timeoutMinutes:number}} job
 */
function saveJob(paths, job) {
  const configText = readConfig(paths);
  const jobs = parseJobs(configText);
  const idx = jobs.findIndex((j) => j.name === job.name);
  if (idx === -1) jobs.push(job);
  else jobs[idx] = job;
  const next = renderConfigWithJobs(configText, jobs);
  fs.writeFileSync(paths.config, next);
  resyncConfigHash(paths, next);
}

/**
 * Remove the job with this name from config.yaml (+ re-sync manifest hash).
 * No-op if absent.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name
 */
function removeJob(paths, name) {
  const configText = readConfig(paths);
  const jobs = parseJobs(configText);
  const next = jobs.filter((j) => j.name !== name);
  if (next.length === jobs.length) return; // absent → no-op
  const rendered = renderConfigWithJobs(configText, next);
  fs.writeFileSync(paths.config, rendered);
  resyncConfigHash(paths, rendered);
}

/**
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name
 * @returns {{name:string, at:string, run:string, timeoutMinutes:number}|null}
 */
function findJob(paths, name) {
  return listJobs(paths).find((j) => j.name === name) || null;
}

/**
 * All defined jobs.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {Array<{name:string, at:string, run:string, timeoutMinutes:number}>}
 */
function listJobs(paths) {
  let configText;
  try {
    configText = readConfig(paths);
  } catch {
    return [];
  }
  return parseJobs(configText);
}

/** @param {import('../core/paths').WienerdogPaths} paths @returns {string} */
function scheduleStatePath(paths) {
  return path.join(paths.state, 'schedule.json');
}

/**
 * Read state/schedule.json. Missing/corrupt → {}.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {Record<string,{last_success?:string,last_status?:string,last_error_at?:string}>}
 */
function readScheduleState(paths) {
  try {
    return JSON.parse(fs.readFileSync(scheduleStatePath(paths), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Merge one job's watermark and write state/schedule.json atomically (temp+rename).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name
 * @param {{last_success?:string,last_status?:string,last_error_at?:string}} patch
 */
function writeScheduleState(paths, name, patch) {
  const state = readScheduleState(paths);
  state[name] = { ...state[name], ...patch };
  const file = scheduleStatePath(paths);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

module.exports = {
  parseJobs,
  renderConfigWithJobs,
  saveJob,
  removeJob,
  findJob,
  listJobs,
  readScheduleState,
  writeScheduleState,
};
