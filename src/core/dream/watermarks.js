'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @param {string} stateDir @returns {string} */
function watermarksPath(stateDir) {
  return path.join(stateDir, 'watermarks.json');
}

/**
 * Read the per-harness watermarks. Missing/corrupt file → all nulls.
 * @param {string} stateDir
 * @returns {{claude:number|null, codex:number|null}}
 */
function readWatermarks(stateDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(watermarksPath(stateDir), 'utf8'));
    return {
      claude: typeof parsed.claude === 'number' ? parsed.claude : null,
      codex: typeof parsed.codex === 'number' ? parsed.codex : null,
    };
  } catch {
    return { claude: null, codex: null };
  }
}

/**
 * Atomically write watermarks (temp file + rename). Callers advance ONLY after a
 * successful commit (that decision belongs to WP-017's pipeline, not here).
 * @param {string} stateDir
 * @param {{claude:number|null, codex:number|null}} watermarks
 */
function writeWatermarks(stateDir, { claude, codex }) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = watermarksPath(stateDir);
  const tmp = `${file}.tmp-${process.pid}`;
  const body = JSON.stringify({ version: 1, claude: claude ?? null, codex: codex ?? null }, null, 2);
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

module.exports = { readWatermarks, writeWatermarks };
