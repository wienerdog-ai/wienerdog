'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { redactOnly } = require('./secret-scan');
const { mkdirPrivate } = require('./private-fs');

/** Best-effort 0600 on the alerts file (audit A5, WP-126): a first append
 *  otherwise inherits umask; win32/vanished-file is a silent no-op.
 *  @param {string} file */
function chmodAlerts(file) {
  try {
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
  } catch {
    /* best-effort — never mask the append/compaction result */
  }
}

// Append-only durable failure log under state/alerts.jsonl. Replaces the
// transient digest banner (WP-020) whose regeneration erased it. One JSON object
// per line; every recorded entry is "unresolved" by construction. ADR-0012 part 3:
// mechanics, not vault — plain job-status facts, no transcript/tool-result content.

const ALERTS_FILE = 'alerts.jsonl';

const MAX_ALERTS = 200; // keep only the most-recent N records
const MAX_FIELD_CHARS = 2000; // cap each string field (control-plane text, not prose)
const MAX_FILE_BYTES = 512 * 1024; // hard byte bound on the log file / the read

/** @param {import('./paths').WienerdogPaths} paths @returns {string} */
function alertsPath(paths) {
  return path.join(paths.state, ALERTS_FILE);
}

/** Coerce a record to the known string fields, each length-capped and then
 *  secret-scrubbed (EP3, audit A5 / ADR-0024 / WP-124): the cap bounds the scan
 *  input, then `redactOnly` guarantees no secret persists to alerts.jsonl or
 *  reaches the digest — `at`/`job`/`log_hint` are code-owned no-ops, but
 *  scanning uniformly is the fail-closed choice. Requires a non-null,
 *  non-array OBJECT — any other value (null, number, string, array) is
 *  treated as an empty object, so a valid-JSON primitive can't crash the deref.
 *  Drops unknown keys; missing fields become ''.
 *  @param {*} r @returns {{job:string, at:string, reason:string, log_hint:string}} */
function sanitizeAlert(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS));
  return { job: scrub(o.job), at: scrub(o.at), reason: scrub(o.reason), log_hint: scrub(o.log_hint) };
}

/** Append one unresolved failure alert (atomic append; creates state/ if needed).
 *  Compacts to `MAX_ALERTS` records / `MAX_FILE_BYTES` bytes when either bound
 *  is exceeded after the append.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{job:string, at:string, reason:string, log_hint:string}} record */
function appendAlert(paths, record) {
  mkdirPrivate(paths.state); // 0700 independent of umask (audit A5, WP-126)
  const file = alertsPath(paths);
  // Separator guard: if the existing file does NOT end in a newline (e.g. a
  // truncated/oversized malformed tail with no terminator), a bare append would FUSE
  // the new record onto that malformed line. The oversized-tail reader then drops
  // through the first newline — which would be the one appended AFTER the new record —
  // discarding the newest fail-loud alert. Prefix a '\n' so the new record is always
  // its own complete line and survives the tail read + compaction.
  let sep = '';
  try {
    const st = fs.statSync(file);
    if (st.size > 0) {
      const fd = fs.openSync(file, 'r');
      try {
        const last = Buffer.alloc(1);
        const n = fs.readSync(fd, last, 0, 1, st.size - 1);
        if (n === 1 && last[0] !== 0x0a) sep = '\n'; // 0x0A = '\n'
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    /* no existing file (or unreadable) → no separator needed */
  }
  // Concurrency mitigation (see spec Residuals): append the new record ATOMICALLY
  // (O_APPEND, atomic for a single small line) BEFORE the read-rewrite-rename
  // compaction below. This guarantees THIS process's own alert is durably on disk
  // even if a concurrent run-job's compaction rewrites the file in the same window —
  // the appending writer never loses its own fail-loud record. (A compaction by one
  // run-job can still drop a record a DIFFERENT run-job appended in the same window;
  // that residual is accepted — full cross-process locking is out of scope per ADR-0004.)
  fs.appendFileSync(file, `${sep}${JSON.stringify(sanitizeAlert(record))}\n`);
  chmodAlerts(file); // the atomic first append may have CREATED the file under umask
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    size = 0;
  }
  const all = readAlerts(paths); // sanitized, byte-bounded read
  // Empty-read guard: we JUST appended a valid record atomically, so a correct read
  // back can never be empty. `all.length === 0` therefore means the read FAILED
  // (readAlerts now returns [] on any fstat/read error — e.g. an appendable-but-
  // unreadable mode-0200 file, or a transient I/O error). Rewriting the file from an
  // empty snapshot would serialize "\n" and rename it over the log, SILENTLY DELETING
  // the alert we just appended (and any prior ones). Skip compaction and leave the
  // atomically-appended file intact — fail-loud durability is preserved.
  if (all.length === 0) return;
  if (all.length > MAX_ALERTS || size > MAX_FILE_BYTES) {
    // Count budget first, then byte budget: drop the oldest until BOTH hold.
    let kept = all.slice(Math.max(0, all.length - MAX_ALERTS)); // newest N (append order = chronological)
    const serialize = (rows) => rows.map((a) => JSON.stringify(a)).join('\n') + '\n';
    let text = serialize(kept);
    // Keep at least the just-appended newest record; one sanitized record is always
    // well under MAX_FILE_BYTES (4 fields × MAX_FIELD_CHARS ≈ 8 KiB + JSON overhead).
    while (kept.length > 1 && Buffer.byteLength(text) > MAX_FILE_BYTES) {
      kept = kept.slice(1); // drop oldest
      text = serialize(kept);
    }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    fs.renameSync(tmp, file); // atomic replace (mirrors clearAlerts)
    chmodAlerts(file);
  }
}

/** All unresolved alerts, oldest first. Missing file → []; malformed lines skipped.
 *  Byte-bounds its read (tail window of `MAX_FILE_BYTES` for oversized files) and
 *  sanitizes every parsed line so no unbounded/primitive record reaches callers.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {Array<{job:string, at:string, reason:string, log_hint:string}>} */
function readAlerts(paths) {
  const file = alertsPath(paths);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return [];
  }
  let text;
  try {
    // fstat/read can still fail AFTER a successful open (e.g. alerts.jsonl is a
    // directory → EISDIR on read, or a transient I/O error). Treat any such failure
    // like a missing/unreadable file: return [] rather than crash digest generation.
    const st = fs.fstatSync(fd); // stat the OPEN fd — no stat→read TOCTOU
    if (st.size > MAX_FILE_BYTES) {
      // Read the trailing MAX_FILE_BYTES (newest records) PLUS one preceding byte, so
      // we can tell whether the window began exactly on a line boundary. Bounds memory
      // even for a pathologically oversized file (fixed buffer).
      const readStart = st.size - MAX_FILE_BYTES - 1; // >= 0 since st.size > MAX_FILE_BYTES
      const len = st.size - readStart;
      const buf = Buffer.alloc(len);
      let off = 0;
      while (off < len) {
        const n = fs.readSync(fd, buf, off, len - off, readStart + off);
        if (n === 0) break;
        off += n;
      }
      // Compare the RAW preceding byte (0x0A = '\n'); '\n' never appears inside a
      // multi-byte UTF-8 sequence, so a byte compare is safe even if the window split
      // a character. If the preceding byte is a newline, the window starts on a line
      // boundary → the first line is COMPLETE, keep it. Otherwise it is a partial →
      // drop through the first newline.
      const precedingIsNewline = buf[0] === 0x0a;
      let raw = buf.subarray(1, off).toString('utf8'); // decode from after the preceding byte
      if (!precedingIsNewline) {
        const nl = raw.indexOf('\n');
        raw = nl === -1 ? '' : raw.slice(nl + 1);
      }
      text = raw;
    } else {
      const buf = Buffer.alloc(st.size);
      let off = 0;
      while (off < st.size) {
        const n = fs.readSync(fd, buf, off, st.size - off, off);
        if (n === 0) break;
        off += n;
      }
      text = buf.subarray(0, off).toString('utf8');
    }
  } catch {
    return []; // fstat/read error after open → resilient empty result (finally still closes fd)
  } finally {
    fs.closeSync(fd);
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(sanitizeAlert(JSON.parse(line)));
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/** Remove all alerts for `job` (called when that job next succeeds). Atomic
 *  temp+rename. Removes the file when no alerts remain.
 *  @param {import('./paths').WienerdogPaths} paths @param {string} job */
function clearAlerts(paths, job) {
  const remaining = readAlerts(paths).filter((a) => a.job !== job);
  const file = alertsPath(paths);
  if (remaining.length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, remaining.map((a) => JSON.stringify(a)).join('\n') + '\n');
  fs.renameSync(tmp, file);
}

module.exports = {
  appendAlert,
  readAlerts,
  clearAlerts,
  ALERTS_FILE,
  MAX_ALERTS,
  MAX_FIELD_CHARS,
  MAX_FILE_BYTES,
};
