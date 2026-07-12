'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @param {string} stateDir @returns {string} absolute path to skill-registry.json */
function registryPath(stateDir) {
  return path.join(stateDir, 'skill-registry.json');
}

/**
 * Read the registry. Missing/corrupt/malformed → { version:1, skills:{} }.
 * Never throws (same defensive posture as watermarks.js's readWatermarks).
 * @param {string} stateDir
 * @returns {{version:number, skills:Record<string,{created:string,id:string}>}}
 */
function readRegistry(stateDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(stateDir), 'utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.skills !== 'object' ||
      parsed.skills === null ||
      Array.isArray(parsed.skills)
    ) {
      return { version: 1, skills: {} };
    }
    return { version: 1, skills: parsed.skills };
  } catch {
    return { version: 1, skills: {} };
  }
}

/**
 * Record NEW dream-created skills, merging into the existing registry and
 * writing ATOMICALLY (temp file + rename, mirroring watermarks.js). Idempotent:
 * re-recording an existing key overwrites it with the same value. No-op on an
 * empty entries array.
 * @param {string} stateDir
 * @param {Array<{rel:string, created:string, id:string}>} entries
 */
function recordSkills(stateDir, entries) {
  if (!entries || entries.length === 0) return;
  const { skills } = readRegistry(stateDir);
  for (const e of entries) skills[e.rel] = { created: e.created, id: e.id };
  fs.mkdirSync(stateDir, { recursive: true });
  const file = registryPath(stateDir);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, skills }, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * @param {{skills:Record<string,{created:string,id:string}>}} registry
 * @param {string} rel
 * @returns {{created:string, id:string}|null} the entry, or null if unregistered
 */
function registeredEntry(registry, rel) {
  return Object.prototype.hasOwnProperty.call(registry.skills, rel) ? registry.skills[rel] : null;
}

module.exports = { registryPath, readRegistry, recordSkills, registeredEntry };
