# ADR-0023: Bounded streaming transcript intake and a per-file quarantine ledger

Status: Proposed
Date: 2026-07-17

> **Draft pending the owner walkthrough.** This ADR records the design the audit-A6
> specs (WP-118 + WP-119) implement. Several concrete limits are still
> `OWNER-DECISION (pending)` in those specs; the owner walkthrough resolves them into
> dated `OWNER-APPROVED` entries and flips this ADR to Accepted. Do not treat any
> number here as final until then.

## Context

The nightly **dreaming** job (ADR-0012) consolidates the user's AI-session history
into the **vault**. Its input is the set of on-disk **transcripts** — Claude Code
JSONL files under `~/.claude/projects/**/*.jsonl` and Codex CLI rollout files under
`~/.codex/sessions/**/rollout-*.jsonl`. Transcript content is **fully
attacker-influenceable**: a single oversized `tool_result` (a malicious MCP server, a
`WebFetch` of a huge page) is written verbatim into the JSONL as one line.

The 2026-07-15 security audit (action **A6**, deep-dive `07-parsing-dos.md`) found two
structural problems in this intake path, both still present on `main`:

1. **Whole-file read + parse-all-into-memory before any size cap (finding F1, HIGH —
   availability).** `src/core/transcripts/claude.js` and `codex.js` do
   `fs.readFileSync(filePath, 'utf8')` (whole file into one string), then
   `raw.split('\n')` (a second full copy), then `JSON.parse` each line into live
   objects. `src/core/dream/scratch.js` `collectExtracts` calls
   `transcripts.parse(entry)` for **every** discovered fresh file up front
   (`fresh.map(...)`), holding **all** parsed extracts resident at once — *before* the
   `dream_max_input_bytes` budget is applied. The byte/message caps
   (`MAX_MSG_CHARS`, `MAX_MESSAGES`, the water-fill budget) all run *downstream* of the
   OOM-capable work. Several near-limit files, or one large file beside a normal
   backlog, drive resident memory past Node's heap and OOM-kill the job. Because the
   scalar watermark advances only after a successful commit, the same poisoned file is
   re-selected every night — a **permanent nightly wedge**. (A file above Node's
   ~512 MB max string length instead throws `ERR_STRING_TOO_LONG`, is caught as
   `raw = ''`, and is **silently dropped** — finding F6, a robustness gap.)

2. **A scalar per-harness watermark loses or starves valid sessions.** State is one
   `mtimeMs` per harness in `state/watermarks.json`: "everything with `mtime <= wm` is
   done." This coarse marker cannot distinguish *processed* from *deferred-for-capacity*
   from *permanently-unprocessable*. Real incidents (WP-048, WP-069) showed the
   watermark advancing past sessions no dream ever consolidated — silent permanent
   data loss. And a single permanently-unprocessable file (over any read ceiling)
   either wedges the run forever (if it blocks the watermark) or is silently skipped
   forever (if the watermark jumps it) — there is no "quarantine this one file, keep
   dreaming over the rest, tell the human, and retry only if it changes."

**IRON RULE (ADR-0004): Wienerdog is just files.** The fix adds no process, no daemon,
no telemetry — only bounded reads and a JSON state file.

## Decision

Transcript intake becomes **bounded and streaming**, and the scalar watermark is
replaced by a **per-file quarantine ledger**.

### 1. Bounded, streaming intake (WP-118)

- **Discovery records more than mtime.** For every discovered transcript, record
  `{ path, mtimeMs, size, dev, ino }` (`size` from `fs.Stats.size`; `dev`/`ino` for a
  content-independent identity that survives rename/rotation checks).
- **A hard pre-read file ceiling.** A file whose `size` exceeds a fixed byte ceiling is
  **never read** — it is **quarantined** (see §2), not opened. This replaces the
  accidental, silent ~512 MB `ERR_STRING_TOO_LONG` drop (F6) with an explicit,
  surfaced outcome.
- **Streaming, line-bounded parse.** Under the ceiling, a file is read through a
  synchronous fixed-chunk line reader (never `readFileSync` the whole file, never a
  second `split('\n')` copy). Enforced *during* the read: a **per-line byte cap**, a
  **per-file line-count cap**, and a **per-run aggregate byte cap** across all files.
  `JSON.parse` runs only on a line within the per-line cap, guarded by a cheap
  **nesting-depth** pre-check; a `SyntaxError`/`RangeError` skips that one line.
- **Oversized records become fixed markers; oversized *files* are quarantined.** A
  single line over the per-line cap is replaced by a fixed, code-owned untrusted marker
  (e.g. `[oversized record omitted]`) and the **session is still parsed** — one hostile
  tool_result does not cost the whole session. A **file** over the pre-read ceiling, or
  one that hits the line-count / aggregate caps, is **quarantined** (the file is
  skipped). **Raw oversized bytes never enter scratch, the log, or the brain.**

### 2. Per-file quarantine ledger replaces the scalar watermark (WP-119)

- **`state/transcript-ledger.json`** records, per transcript file (keyed by a
  case-folded absolute path — case-folded for APFS/Windows path identity, exactly like
  the identity trust registry ADR-0021), a content-independent **fingerprint**
  (`size:mtimeMs:dev:ino`) and an **outcome**: `processed` (fully consumed into a dream
  commit) or `quarantined` (permanently unprocessable *as-is*, with a code-owned reason
  class and the fingerprint at quarantine time). It also keeps a per-harness
  `baseline_mtime`, migrated **once** from the retired `watermarks.json`, as the floor
  for files that predate the ledger.
- **Selection rule.** A file is dreamed over iff it is **not** quarantined with a
  matching fingerprint, **and** either (a) its `mtimeMs` is above its harness
  `baseline_mtime` with no `processed` record, or (b) it has a `processed`/`quarantined`
  record whose fingerprint **differs** from the file's current fingerprint (the file
  changed — reprocess).
- **Three outcomes, distinctly:**
  - *processed* → recorded, not reprocessed unless the fingerprint changes.
  - *quarantined* → **not retried while the fingerprint is unchanged**; **retried when
    it changes** (a rotated/replaced file gets a fresh chance).
  - *capacity-deferred* → **no negative record at all.** A valid file that did not fit
    this run's byte budget simply has no `processed` entry, so it is naturally retried
    next run. This is the structural fix for the WP-048/WP-069 starvation class: only a
    file actually consumed is marked `processed`.
- **Continue beside a quarantine + durable, secret-free alert.** A quarantine never
  aborts the run; valid files are processed alongside it. Active quarantines are
  surfaced to the human through a **fixed, code-owned, secret-free digest banner**
  derived from the ledger (file basenames + reason class only — never transcript
  content), re-rendered every digest as long as the quarantine is active. (Channel
  choice is an `OWNER-DECISION` in WP-119.)

### 3. One file at a time, metadata-resident (WP-119)

`collectExtracts` allocates the byte budget from discovery `size` (available without
parsing), then **parses and materializes one file at a time** to its grant, keeping
per-file **metadata** (not every parsed extract) resident. The whole-corpus
`fresh.map(parse)` that held all extracts at once (F1) is removed.

## Boundary statement

The ledger is an **availability / robustness** mechanism, not a trust anchor. A
quarantine is a **fail-safe skip**, never a deletion — the transcript file on disk is
untouched; only Wienerdog's decision to read it changes. The intake caps bound
*memory and time*, not *trust*: a within-cap line is still redacted (A5) and
provenance-gated (A3/A4) downstream. Same-user fabrication of transcript bytes remains
an OS-boundary residual (ACTION-LIST A13), out of scope here.

## Consequences

- The nightly job cannot be OOM-wedged by a crafted transcript: memory is bounded by
  the per-line cap and the per-run aggregate cap regardless of any single file's size.
- No valid session is silently lost to a watermark jump; no permanently-unprocessable
  file wedges the run or is silently dropped; capacity-deferred work is always retried.
- One new durable state file (`transcript-ledger.json`) and one retired one
  (`watermarks.json`, migrated once then ignored). The migration is idempotent.
- Any future transcript source MUST go through the bounded reader and be recorded in
  the ledger; adding a `readFileSync` on a transcript path is a defect.

## Alternatives considered

- **Just add a `stat.size` skip in discovery.** Rejected as insufficient: it fixes the
  single-giant-file case (F6) but not N near-limit files held at once (the real F1 OOM),
  and it does nothing for the watermark starvation/wedge class. Streaming + the ledger
  are the structural fixes the audit asked for.
- **Keep the scalar watermark, add a side-list of quarantined files.** Rejected: two
  overlapping state models (a scalar floor plus a file list) re-create the
  processed-vs-deferred ambiguity that caused WP-048/069. One per-file ledger with a
  migrated baseline is the single source of truth.
- **Quarantine the whole file on any oversized record.** Rejected: a single hostile
  tool_result would cost the entire session's legitimate content. An oversized *record*
  is marked; only an oversized *file* (or cap-exhausting file) is quarantined.
- **Surface quarantines only via `wienerdog doctor`.** Rejected as the sole channel: a
  quarantine must be visible in the injected session digest (where the user actually
  looks), like the identity (ADR-0021) and scheduler (ADR-0018) banners. `doctor` may
  additionally surface it (a deferred follow-up).
- **An async streaming reader (`readline`).** Rejected for now: `collectExtracts` is
  synchronous and single-writer under the dream lock; a synchronous fixed-chunk
  `readSync` loop keeps the call path and tests simple with zero new dependencies.
