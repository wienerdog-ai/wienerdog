---
id: WP-096
title: Bound alerts.jsonl growth and cap alert field sizes so the durable-failure log can't grow or corrupt unboundedly
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0012]
branch: wp/096-alerts-bounded-schema-capped
---

# WP-096: Bound + schema-cap the durable alerts log

## Context (read this, nothing else)

Wienerdog's scheduled jobs are **fail-loud** (THREAT-MODEL T6, ADR-0012): a failed
run appends a durable record to `~/.wienerdog/state/alerts.jsonl`, which the
session digest renders until the job next succeeds (then the record is cleared).
The alert fields are Wienerdog-authored job-status facts (`job`, `at`, `reason`,
`log_hint`) — mechanics, not vault content, and never transcript/tool-result text
(so no injection surface; T1).

Two verified robustness gaps in `src/core/alerts.js` (scheduler #10):

1. **Unbounded growth, and count-gated compaction misses oversized/malformed
   lines:** every repeated failure appends another line; nothing compacts the file.
   Worse, compaction can only ever be gated on the count of *successfully parsed*
   records — so a single ENORMOUS malformed line (which parses to nothing and is
   skipped) inflates the file forever and is never compacted away. The bound must be
   on total BYTES too, independent of the valid-record count. And `readAlerts`
   `readFileSync`s the WHOLE file up front, so an oversized file is fully loaded into
   memory before any line is skipped — the read itself must be byte-bounded.

2. **No field bound + primitive-JSON crash:** `readAlerts` returns arbitrary parsed
   fields with no type/length cap. A corrupted or oversized record (e.g. a huge
   `reason`) is rendered into the digest verbatim. Additionally, a line that is valid
   JSON but NOT an object — `null`, a number, a string, an array — parses successfully
   and then makes `sanitizeAlert(r)` throw on `r.job` (deref of a primitive). The
   sanitizer must first require a non-null, non-array object (substitute `{}`
   otherwise) so no valid-JSON primitive can crash the reader.

This WP bounds the log's length and caps each rendered field's size. (The
clear/append concurrency race — scheduler #2 — is left as an accepted residual;
see Out of scope.)

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004); the
alerts log is plain mechanics. Alert content stays Wienerdog-authored control-plane
text (no transcript content — unchanged).

## Current state

`src/core/alerts.js`:

```js
function appendAlert(paths, record) {
  fs.mkdirSync(paths.state, { recursive: true });
  fs.appendFileSync(alertsPath(paths), `${JSON.stringify(record)}\n`);  // ← unbounded
}

function readAlerts(paths) {
  // read file; for each non-blank line: try JSON.parse(line) → push; skip malformed
  // returns Array<{job, at, reason, log_hint}>                          // ← no field caps
}

function clearAlerts(paths, job) {
  const remaining = readAlerts(paths).filter((a) => a.job !== job);
  // rm the file if empty else temp+rename with remaining
}
```

`appendAlert`'s `record` is `{job, at, reason, log_hint}`, all built by
`run-job.js` from job status (`reason` can include a vault path or a failure
message). The digest renderer consumes `readAlerts`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/alerts.js | `sanitizeAlert` coerces a non-object (null/number/string/array) to `{}` before field-capping; `appendAlert` prefixes a `\n` separator when the existing file lacks a final newline (so an append can't fuse onto a malformed tail), then compacts on record-count OR file-BYTE bound; `readAlerts` byte-bounds its read (tail) and sanitizes each parsed line |
| modify | tests/unit/alerts.test.js | tests: append past the count bound keeps only the newest N; over-long fields truncated; a valid-JSON primitive (`null`/number/string/array) line does NOT crash and reads back as an empty-fields record; a huge malformed line is compacted away on the next append (byte bound), not retained; appending onto an oversized, malformed, UNTERMINATED (no trailing newline) line → the new alert survives and is the single retained record; many large-field records drive serialized bytes over `MAX_FILE_BYTES` so compaction keeps fewer than `MAX_ALERTS` and the file ends ≤ `MAX_FILE_BYTES`; a `readAlerts` tail window beginning exactly on a line boundary keeps the first complete record |

### Exact contracts

Add three fixed constants and a null-safe sanitizer:

```js
const MAX_ALERTS = 200;              // keep only the most-recent N records
const MAX_FIELD_CHARS = 2000;        // cap each string field (control-plane text, not prose)
const MAX_FILE_BYTES = 512 * 1024;   // hard byte bound on the log file / the read

/** Coerce a record to the known string fields, each length-capped. Requires a
 *  non-null, non-array OBJECT — any other value (null, number, string, array) is
 *  treated as an empty object, so a valid-JSON primitive can't crash the deref.
 *  Drops unknown keys; missing fields become ''.
 *  @param {*} r @returns {{job:string, at:string, reason:string, log_hint:string}} */
function sanitizeAlert(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const cap = (v) => String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS);
  return { job: cap(o.job), at: cap(o.at), reason: cap(o.reason), log_hint: cap(o.log_hint) };
}
```

**`appendAlert`** sanitizes, appends, then compacts when the record count OR the raw
file size exceeds its bound. Compaction retains the newest records subject to BOTH a
count budget AND a serialized-byte budget: take the newest `MAX_ALERTS`, then keep
dropping the OLDEST until the serialized bytes are also within `MAX_FILE_BYTES`. The
byte gate is what both purges an oversized/malformed line the count gate can never
reach AND guarantees the rewritten file never exceeds `MAX_FILE_BYTES`:

```js
function appendAlert(paths, record) {
  fs.mkdirSync(paths.state, { recursive: true });
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
      } finally { fs.closeSync(fd); }
    }
  } catch { /* no existing file (or unreadable) → no separator needed */ }
  fs.appendFileSync(file, `${sep}${JSON.stringify(sanitizeAlert(record))}\n`);
  let size = 0;
  try { size = fs.statSync(file).size; } catch { size = 0; }
  const all = readAlerts(paths);                       // sanitized, byte-bounded read
  if (all.length > MAX_ALERTS || size > MAX_FILE_BYTES) {
    // Count budget first, then byte budget: drop the oldest until BOTH hold.
    let kept = all.slice(Math.max(0, all.length - MAX_ALERTS));   // newest N (append order = chronological)
    const serialize = (rows) => rows.map((a) => JSON.stringify(a)).join('\n') + '\n';
    let text = serialize(kept);
    // Keep at least the just-appended newest record; one sanitized record is always
    // well under MAX_FILE_BYTES (4 fields × MAX_FIELD_CHARS ≈ 8 KiB + JSON overhead).
    while (kept.length > 1 && Buffer.byteLength(text) > MAX_FILE_BYTES) {
      kept = kept.slice(1);                            // drop oldest
      text = serialize(kept);
    }
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);                          // atomic replace (mirrors clearAlerts)
  }
}
```

(The just-appended record is a valid sanitized object on its OWN line — the
separator guard above guarantees it is never fused onto a pre-existing unterminated
malformed tail — so `readAlerts` always parses it back and `kept` is never empty
after an append; malformed lines are dropped by `readAlerts` and thus by the rewrite.
Because a single record is far under `MAX_FILE_BYTES`, the byte loop always terminates
with the newest record retained and the file within the byte bound.)

**`readAlerts`** byte-bounds its read (so a pathological file can't blow up memory)
and sanitizes every parsed line:

Open the file ONCE and `fstat` the descriptor (never `statSync` then `readFileSync`
— a concurrent append/replacement between the two calls would defeat the bound). Read
into a fixed-size buffer:

```js
function readAlerts(paths) {
  const file = alertsPath(paths);
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return []; }
  let text;
  try {
    const st = fs.fstatSync(fd);                       // stat the OPEN fd — no stat→read TOCTOU
    if (st.size > MAX_FILE_BYTES) {
      // Read the trailing MAX_FILE_BYTES (newest records) PLUS one preceding byte, so
      // we can tell whether the window began exactly on a line boundary. Bounds memory
      // even for a pathologically oversized file (fixed buffer).
      const readStart = st.size - MAX_FILE_BYTES - 1;  // >= 0 since st.size > MAX_FILE_BYTES
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
  } finally { fs.closeSync(fd); }
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try { out.push(sanitizeAlert(JSON.parse(line))); } catch { /* skip malformed */ }
  }
  return out;
}
```

`clearAlerts` is unchanged (it already temp+renames and calls `readAlerts`, which
now returns sanitized records).

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- The bound + caps must not change the fields' names or the digest's rendering
  contract — only their maximum size/count.
- `MAX_ALERTS`/`MAX_FIELD_CHARS`/`MAX_FILE_BYTES` are fixed constants (no config
  surface — ADR-0004 no new knobs unless asked). NOTE — the two budgets are NOT
  redundant and neither dominates: `MAX_ALERTS × 4 fields × MAX_FIELD_CHARS` ≈ 1.6M
  characters (before JSON escaping / UTF-8 expansion), which is ~3× `MAX_FILE_BYTES`
  (512 KiB). So a full 200-record log of large fields would EXCEED the byte bound —
  which is exactly why compaction must enforce BOTH: the byte budget can bite before
  the count budget, and normal small alerts stay well under both. (The earlier draft's
  claim that 512 KiB "comfortably exceeds" 200×4×2000 chars was arithmetically false
  and is removed.)
- The atomic bound-rewrite mirrors `clearAlerts`'s temp+rename; keep them
  consistent.
- `appendAlert`'s `statSync` is only a compaction TRIGGER (a size heuristic); the
  actual read is `readAlerts`, which fstats its own open descriptor and is memory-
  bounded — so a concurrent append between the trigger stat and the read cannot cause
  an unbounded read.

## Security checklist (untrusted-input note)

- [ ] Alert fields remain Wienerdog-authored control-plane text (job status); this
      WP adds only length/count bounds — it does NOT newly admit transcript or
      tool-result text into the digest, so the T1 no-injection property is unchanged.
- [ ] Each field is length-capped on both append and read, and the log file + the
      read are byte-bounded (`MAX_FILE_BYTES`) independently of the valid-record
      count, so neither a pathological failure message nor a huge malformed line can
      render an unbounded line into the digest, grow the file without limit, or blow
      up memory on read.
- [ ] A valid-JSON primitive line (`null`, a number, a string, an array) is read as
      an empty-fields record and never throws — the sanitizer requires a real object.

## Acceptance criteria

- [ ] Appending more than `MAX_ALERTS` records leaves exactly the newest
      `MAX_ALERTS` in the file, in chronological order.
- [ ] A record with a field longer than `MAX_FIELD_CHARS` is stored/returned
      truncated to `MAX_FIELD_CHARS`.
- [ ] Unknown keys in a record are dropped; missing fields read back as `''`.
- [ ] A line that is valid JSON but not an object (`null`, `42`, `"x"`, `[]`) reads
      back as `{job:'',at:'',reason:'',log_hint:''}` without throwing.
- [ ] A single oversized/malformed line that pushes the file past `MAX_FILE_BYTES` is
      removed on the next `appendAlert` (byte-gated compaction), even though the
      valid-record count is below `MAX_ALERTS`.
- [ ] Appending onto a file whose sole existing content is an oversized, malformed,
      UNTERMINATED line (no trailing newline, size > `MAX_FILE_BYTES`) does NOT lose
      the new alert: the separator guard puts it on its own line, compaction purges the
      malformed tail, and the just-appended record is the single retained alert (`all`
      is not empty).
- [ ] After compaction, the rewritten file is never larger than `MAX_FILE_BYTES`:
      appending many valid records with large (near-`MAX_FIELD_CHARS`) fields drives
      the serialized size over the byte budget, and compaction keeps FEWER than
      `MAX_ALERTS` records (dropping oldest) so the file ends at/under `MAX_FILE_BYTES`,
      always retaining the newest record.
- [ ] `readAlerts` on an oversized file whose trailing window begins EXACTLY on a line
      boundary keeps that first complete record (does not discard a valid alert); on a
      window beginning mid-line, the leading partial line is dropped.
- [ ] `clearAlerts` still removes a job's alerts and deletes the file when none
      remain (unchanged).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern alerts
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The concurrent clear/append race (scheduler #2) — a true cross-process lock is
  heavier than warranted; in practice the dream lock serializes the dream and each
  job clears only its own alerts. Note it as an accepted residual under "Decisions
  made".
- **Compaction concurrent-writer residual (accepted):** the compaction step's
  read-rewrite-rename shares the accepted concurrent-writer residual — a compaction
  rewrite by one `run-job` can drop a record a DIFFERENT `run-job` appended in the
  same window (once `MAX_ALERTS`/`MAX_FILE_BYTES` is reached, every append takes this
  path). Full cross-process locking is deliberately OUT OF SCOPE for a files-only /
  no-daemon product (ADR-0004), and `run-job` overlap is rare. Mitigation: each writer
  appends its OWN record ATOMICALLY (`fs.appendFileSync`, O_APPEND — atomic for a
  single small line) BEFORE the compaction rewrite, so the appending process never
  loses its own fail-loud alert; only a concurrently-appended OTHER record can be lost.
  This matches the wd-reviewer's note that concurrency is spec-accepted.
- Changing the digest alert renderer (a different module) or the alert record shape
  produced by `run-job.js`.

## Round-2 dispositions

- **Codex round-2 P1 (valid JSON primitives crash the sanitizer):** RESOLVED.
  `sanitizeAlert` now requires a non-null, non-array object and substitutes `{}`
  otherwise, so `null`/number/string/array lines read back as empty-fields records
  instead of throwing on `.job`.
- **Codex round-2 P1 (huge malformed lines remain unbounded / never compact):**
  RESOLVED. Compaction is now gated on file BYTES (`MAX_FILE_BYTES`) as well as
  record count, and `readAlerts` byte-bounds its read via a trailing-tail read — so a
  single enormous malformed line is purged on the next append and can never blow up
  memory or the file, independent of the valid-record count.
- **Codex round-3 P1 (false byte-cap arithmetic — 200 records could exceed
  `MAX_FILE_BYTES`):** RESOLVED. The claim that 512 KiB "comfortably exceeds"
  200×4×2000 chars was arithmetically false (that is ~1.6M chars ≈ 3× the byte cap).
  Compaction now retains the newest records subject to BOTH a count budget AND a
  serialized-byte budget (drop oldest until under both), so the rewritten file is
  provably ≤ `MAX_FILE_BYTES` even with full large-field records. The false note is
  removed and the honest arithmetic recorded.
- **Codex round-3 P1 (stat→read TOCTOU could still trigger an unbounded read):**
  RESOLVED. `readAlerts` now opens the file ONCE, `fstat`s the descriptor, and reads
  into a fixed-size buffer — never `statSync` then `readFileSync` — so a concurrent
  append/replacement between the two cannot make the read unbounded.
- **Codex round-3 P2 (tail read could discard a complete valid alert):** RESOLVED.
  The oversized-file tail now reads ONE preceding byte and drops the first line only
  when that raw preceding byte is not `\n` (a byte compare, safe against multi-byte
  splits); a window that begins exactly on a line boundary keeps its first complete
  record.
- **Codex round-5 P1 (append after an oversized UNTERMINATED malformed line loses the
  newest alert):** RESOLVED. When the pre-existing file lacked a final newline, the
  bare append fused the new record onto the malformed tail; the oversized-tail reader
  then dropped through the first newline — the terminator appended after the new
  record — yielding `all=[]` and silently losing the newest fail-loud alert
  (falsifying "kept is never empty after an append"). `appendAlert` now checks the
  file's last byte and prefixes a `\n` separator when it is not already a newline, so
  the new record is always its own complete line — it survives the tail read and is
  retained by compaction. An AC exercises the oversized/malformed/unterminated case.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/096-alerts-bounded-schema-capped`; conventional commits; PR titled
   `fix(alerts): bound growth and cap field sizes (WP-096)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
