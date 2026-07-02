'use strict';

const fs = require('node:fs');
const path = require('node:path');

const transcripts = require('../transcripts');

/** @param {string} stateDir @returns {string} */
function scratchDirOf(stateDir) {
  return path.join(stateDir, 'dream-scratch');
}

/** Make a session_id safe to use as a filename. @param {string} id @returns {string} */
function sanitize(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

/**
 * Select the transcripts to dream over (per-harness watermarks + a TOTAL input
 * cap) and write redacted extracts to scratch.
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {{claude:number|null, codex:number|null}} watermarks
 * @param {number} maxInputBytes
 * @returns {{ entries: Array<{harness:'claude'|'codex', session_id:string, mtimeMs:number, scratchFile:string}>,
 *             scratchDir:string,
 *             maxMtime:{claude:number|null, codex:number|null},
 *             droppedForSize:number,
 *             wrote:string[] }}
 */
function collectExtracts(paths, watermarks, maxInputBytes) {
  // 1. discover applies ONE `since`. Use the minimum non-null watermark; if
  //    EITHER harness is null (never dreamed), we must see all of that harness's
  //    files, so `since` = null.
  const since =
    watermarks.claude == null || watermarks.codex == null
      ? null
      : Math.min(watermarks.claude, watermarks.codex);
  const discovered = transcripts.discover(paths, { since });

  // 2. Post-filter per harness to restore per-harness precision.
  const fresh = discovered.filter(
    (entry) => entry.mtimeMs > (watermarks[entry.harness] ?? -Infinity)
  );

  // 3. Parse each kept entry (redacted, capped by WP-007), keeping its mtime.
  const parsed = fresh.map((entry) => ({
    harness: entry.harness,
    mtimeMs: entry.mtimeMs,
    extract: transcripts.parse(entry),
  }));

  // 4. TOTAL cap: newest-first; drop the oldest overflow sessions (naive
  //    drop-oldest — chunk-and-summarize is deferred to a later WP).
  parsed.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const kept = [];
  let droppedForSize = 0;
  let total = 0;
  for (let i = 0; i < parsed.length; i++) {
    const size = Buffer.byteLength(JSON.stringify(parsed[i].extract));
    if (total + size > maxInputBytes) {
      droppedForSize = parsed.length - i; // the oldest remaining are all dropped
      break;
    }
    total += size;
    kept.push(parsed[i]);
  }

  // 5. (Re)create an empty scratch dir, then write one file per kept extract.
  const scratchDir = scratchDirOf(paths.state);
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });

  const entries = [];
  const wrote = [];
  for (const item of kept) {
    const scratchFile = path.join(scratchDir, `${item.harness}-${sanitize(item.extract.session_id)}.json`);
    fs.writeFileSync(scratchFile, JSON.stringify(item.extract, null, 2));
    entries.push({
      harness: item.harness,
      session_id: item.extract.session_id,
      mtimeMs: item.mtimeMs,
      scratchFile,
    });
    wrote.push(scratchFile);
  }

  // 6. Per-harness max mtime among KEPT entries, else the incoming watermark
  //    (a harness with nothing new — or everything dropped — is unchanged).
  const maxMtime = { claude: watermarks.claude ?? null, codex: watermarks.codex ?? null };
  for (const item of kept) {
    if (item.mtimeMs > (maxMtime[item.harness] ?? -Infinity)) {
      maxMtime[item.harness] = item.mtimeMs;
    }
  }

  return { entries, scratchDir, maxMtime, droppedForSize, wrote };
}

/**
 * rm -rf the scratch dir. WP-017 calls this in a finally block — always.
 * @param {string} stateDir
 */
function cleanScratch(stateDir) {
  fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true });
}

module.exports = { collectExtracts, cleanScratch };
