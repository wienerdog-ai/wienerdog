'use strict';

const fs = require('node:fs');
const path = require('node:path');

const transcripts = require('../transcripts');

/** Minimum bytes a *truncated* extract must be granted to be worth feeding. A
 *  session that cannot be given at least this much is dropped whole (and retried
 *  next run) rather than fed a sub-useful sliver. FIXED. Whole-fit sessions
 *  smaller than this are unaffected — the floor gates truncation size, not
 *  whole-session size. With the 8 MB default budget the newest session is always
 *  either kept whole or truncated to >= this floor, so the dream never wedges. */
const MIN_TRUNCATE_BYTES = 32_768;

/** @param {string} stateDir @returns {string} */
function scratchDirOf(stateDir) {
  return path.join(stateDir, 'dream-scratch');
}

/** Make a session_id safe to use as a filename. @param {string} id @returns {string} */
function sanitize(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

/** Keep the NEWEST messages of `extract` whose serialized form fits `targetBytes`
 *  (drop oldest). Sets truncated=true and recomputes `started` to the new first
 *  (oldest-remaining) message. Binary-searches the largest newest-message suffix
 *  that fits — byteLength is monotonic in suffix length. Redaction already ran in
 *  parse(), so no re-redaction is needed here.
 *  @param {import('../transcripts').Extract} extract
 *  @param {number} targetBytes  guaranteed >= MIN_TRUNCATE_BYTES by the caller
 *  @returns {import('../transcripts').Extract} */
function truncateExtractToFit(extract, targetBytes) {
  const msgs = extract.messages;
  const build = (k) => {
    const keptMsgs = k === 0 ? [] : msgs.slice(msgs.length - k);
    return { ...extract, truncated: true, started: keptMsgs.length ? keptMsgs[0].ts : null, messages: keptMsgs };
  };
  let lo = 0,
    hi = msgs.length,
    best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Buffer.byteLength(JSON.stringify(build(mid))) <= targetBytes) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return build(best);
}

/**
 * Select the transcripts to dream over (per-harness watermarks + a TOTAL input
 * cap) and write redacted extracts to scratch.
 * @param {ReturnType<import('../paths').getPaths>} paths
 * @param {{claude:number|null, codex:number|null}} watermarks
 * @param {number} maxInputBytes
 * @returns {{ entries: Array<{harness:'claude'|'codex', session_id:string, mtimeMs:number, scratchFile:string, truncatedToFit:boolean}>,
 *             scratchDir:string,
 *             maxMtime:{claude:number|null, codex:number|null},
 *             droppedForSize:number,
 *             dropped:Array<{harness:'claude'|'codex', session_id:string, bytes:number}>,
 *             truncated:Array<{harness:'claude'|'codex', session_id:string, originalBytes:number, keptBytes:number}>,
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

  // 4. TOTAL byte budget via water-filling (replaces the newest-first break).
  //    Sessions that fit their equal share are kept whole; the boundary sessions
  //    are truncated to their share (>= the floor) or dropped whole (sub-floor).
  parsed.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  const sizeOf = (extract) => Buffer.byteLength(JSON.stringify(extract));
  const sizes = parsed.map((p) => sizeOf(p.extract));

  let active = parsed.map((_, i) => i); // indices, newest-first
  let remaining = maxInputBytes;
  /** @type {Map<number, number>} idx -> bytes granted (absent = dropped whole) */
  const alloc = new Map();
  /** @type {number[]} indices dropped whole (oldest-first shed order) */
  const droppedIdx = [];

  while (active.length > 0) {
    const share = Math.floor(remaining / active.length);
    const satisfied = active.filter((i) => sizes[i] <= share);
    if (satisfied.length > 0) {
      const set = new Set(satisfied);
      for (const i of satisfied) {
        alloc.set(i, sizes[i]);
        remaining -= sizes[i];
      }
      active = active.filter((i) => !set.has(i));
      continue;
    }
    if (share >= MIN_TRUNCATE_BYTES) {
      for (const i of active) alloc.set(i, share); // all get an equal, useful share
      active = [];
      break;
    }
    // Share too small to be useful → drop the OLDEST active session, retry.
    droppedIdx.push(active[active.length - 1]); // active preserves newest-first
    active = active.slice(0, -1);
  }

  // Materialize kept extracts in newest-first order; truncate where under-granted.
  const kept = [];
  /** @type {Array<{harness:'claude'|'codex', session_id:string, originalBytes:number, keptBytes:number}>} */
  const truncated = [];
  for (let i = 0; i < parsed.length; i++) {
    if (!alloc.has(i)) continue;
    const grant = alloc.get(i);
    let extract = parsed[i].extract;
    let truncatedToFit = false;
    if (grant < sizes[i]) {
      extract = truncateExtractToFit(extract, grant);
      truncatedToFit = true;
      truncated.push({
        harness: parsed[i].harness,
        session_id: extract.session_id,
        originalBytes: sizes[i],
        keptBytes: sizeOf(extract),
      });
    }
    kept.push({ harness: parsed[i].harness, mtimeMs: parsed[i].mtimeMs, extract, truncatedToFit });
  }

  const dropped = droppedIdx.map((i) => ({
    harness: parsed[i].harness,
    session_id: parsed[i].extract.session_id,
    bytes: sizes[i],
  }));
  const droppedForSize = dropped.length;

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
      truncatedToFit: item.truncatedToFit,
    });
    wrote.push(scratchFile);
  }

  // 6. Per-harness max mtime among KEPT entries (INCLUDING truncated ones — a
  //    truncated session counts as consumed), else the incoming watermark (a
  //    harness with nothing new — or everything whole-dropped — is unchanged).
  const maxMtime = { claude: watermarks.claude ?? null, codex: watermarks.codex ?? null };
  for (const item of kept) {
    if (item.mtimeMs > (maxMtime[item.harness] ?? -Infinity)) {
      maxMtime[item.harness] = item.mtimeMs;
    }
  }

  return { entries, scratchDir, maxMtime, droppedForSize, dropped, truncated, wrote };
}

/**
 * rm -rf the scratch dir. WP-017 calls this in a finally block — always.
 * @param {string} stateDir
 */
function cleanScratch(stateDir) {
  fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true });
}

module.exports = { collectExtracts, cleanScratch, MIN_TRUNCATE_BYTES };
