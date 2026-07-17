---
id: WP-118
title: Bounded streaming transcript parsing + pre-read file ceiling + oversized-record markers (audit A6)
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0023]
branch: wp/118-bounded-streaming-transcript-parse
---

# WP-118: Bounded streaming transcript parsing + pre-read file ceiling + oversized-record markers (audit A6)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills,
hooks, scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons,
no servers, no telemetry. Installer/CLI code is plain Node ≥ 18, **zero runtime
dependencies**, JSDoc types only, no TypeScript, no build step.

The nightly **dreaming** job reads the user's AI-session **transcripts** and
consolidates them into the vault. A **transcript** is a harness's on-disk session log:
a Claude Code JSONL file (`~/.claude/projects/<dir>/<uuid>.jsonl`) or a Codex CLI
rollout file (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`), one JSON object per line.
**Transcript content is fully attacker-influenceable**: a single oversized `tool_result`
(a malicious MCP server, a `WebFetch` of a huge page) is written verbatim into the JSONL
as one line.

A 2026-07-15 security audit (action **A6**, deep-dive `07-parsing-dos.md`, finding
**F1/F6**) found the transcript parsers read the **whole file into memory** with
`fs.readFileSync(filePath, 'utf8')`, then `raw.split('\n')` (a second full copy), then
`JSON.parse` each line — with **no size guard before the read**. A ~400 MB single line
becomes ~1 GB of live objects; several near-limit files held at once OOM-kill the nightly
job, which then re-selects the same poisoned file every night (a permanent wedge). A file
above Node's ~512 MB max string length instead throws `ERR_STRING_TOO_LONG`, is caught as
`raw = ''`, and is **silently dropped** (F6).

This WP makes transcript **parsing** bounded and streaming, and makes **discovery**
record the metadata a later ledger needs. It does exactly three things and nothing else:

1. A new shared **bounded synchronous line reader** — fixed read chunks, a per-line byte
   cap, a per-file line-count cap, a per-run aggregate byte cap — that never holds the
   whole file in memory.
2. Both transcript parsers (Claude, Codex) use it: a single line over the per-line cap is
   replaced by a fixed, code-owned untrusted marker and the **session is still parsed**;
   a file over a hard **pre-read byte ceiling** is not opened at all and is reported as
   quarantined; `JSON.parse` runs only on a bounded line, guarded by a cheap nesting-depth
   pre-check.
3. **Discovery records `{ path, mtimeMs, size, dev, ino }`** (today only `path` +
   `mtimeMs`), so the per-file quarantine ledger (WP-119, WP-120) can fingerprint a file
   and enforce the pre-read ceiling before opening it.

The **per-file quarantine ledger** that consumes these outcomes and replaces the scalar
watermark is **WP-119** (this WP leaves `scratch.js`, `dream.js`, and
`watermarks.js` untouched — it only produces the richer discovery metadata and the
quarantine *signal*). This WP implements the intake half of **ADR-0023**.

**A6 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/core/transcripts/claude.js`** exports `discoverClaude(projectsDir, {since})` →
`Array<{path, mtimeMs}>` (statSync per file, mtime filter) and
`parseClaudeTranscript(filePath)` → `Extract`. The parser body:

```js
let raw = '';
try { raw = fs.readFileSync(filePath, 'utf8'); } catch { raw = ''; }   // ← whole file, F1/F6
const lines = raw.split('\n');                                         // ← second full copy
for (const line of lines) {
  if (line.trim() === '') continue;
  let obj; try { obj = JSON.parse(line); } catch { continue; }         // ← unbounded line
  // … maps obj.type user/assistant → messages[], skill_invocations[] …
}
```

It returns an `Extract` (see `src/core/transcripts/index.js` typedef): `{ harness:'claude',
session_id, started, cwd, source_path, truncated:boolean, messages:[{role,text,ts}],
skill_invocations:[{skill,index,resultIndex,errored}] }`. `truncated` is set true when a
size cap is applied (today only by the downstream message caps). The skill-invocation
`index`/`resultIndex` are message-array positions that WP-080/084/087 keep exactly aligned
to the emitted `messages` array — **any change to which messages are emitted must keep that
alignment** (the same invariant `rebaseInvocations` in `index.js` maintains).

**`src/core/transcripts/codex.js`** exports `discoverCodex(sessionsDir, {since})` →
`Array<{path, mtimeMs}>` (recursive walk, `lstat`-based `isDirectory`, no symlink follow)
and `parseCodexTranscript(filePath)` → `Extract` (no `skill_invocations`). Same
`readFileSync` + `split('\n')` + per-line `JSON.parse` shape. `mapCodexItem(payload)` maps
one `response_item` to a message or null (fail-closed on unknown roles, WP-100).

**`src/core/transcripts/index.js`** exports `discover(paths, {since})` → merges both
harnesses into `Array<{harness, path, mtimeMs}>` sorted by mtime; `parse(entry)` →
dispatches to the harness parser, then applies `capMessage` (redact + 4000-char cap) and
`MAX_MESSAGES` (2000) with `rebaseInvocations`; `redact(text)`; `rebaseInvocations`;
constants `MAX_MSG_CHARS`, `MAX_MESSAGES`. The `Extract` typedef lives here.

**Nothing enforces a file-size ceiling or streams the read.** No `stat.size` is consulted
before the read. The scenario/dream fixtures live in `tests/fixtures/transcripts/*.jsonl`
and `tests/fixtures/dream/transcripts/*.jsonl`; transcript unit tests are
`tests/unit/transcripts.test.js`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/transcripts/stream.js | the ONE bounded synchronous line reader + `Limits` constants |
| modify | src/core/transcripts/claude.js | discovery records size/dev/ino; parse via `streamLines`; oversized-record marker; pre-read ceiling → quarantine signal |
| modify | src/core/transcripts/codex.js | same (no skill_invocations) |
| modify | src/core/transcripts/index.js | `discover` propagates size/dev/ino; keep `parse(entry)` back-compat (→ Extract); add `parseWithOutcome(entry, budget)`; export `Limits`/`newRunBudget`/`OVERSIZED_RECORD_MARKER`; extend `Extract` typedef |
| create | tests/unit/transcript-stream.test.js | unit-test `streamLines` (chunk boundaries, per-line cap, line-count cap, aggregate cap, no-trailing-newline) |
| modify | tests/unit/transcripts.test.js | add: oversized-record→marker+session kept; over-ceiling file→quarantine signal, not read; deep-JSON line skipped; invalid-UTF-8 line handled; discovery exposes size/dev/ino |
| create | tests/fixtures/transcripts/claude-oversized-record.jsonl | a valid small session with ONE line whose text exceeds the per-line cap (see fixtures note) |

### Exact contracts

**1. `src/core/transcripts/stream.js`.** Pure except for one `fs` file handle; no env, no
argv, no network. Synchronous (the dream path is synchronous under a single-run lock).

```js
'use strict';
const fs = require('node:fs');

/**
 * Bounded-intake limits (audit A6, ADR-0023). All values OWNER-APPROVED 2026-07-17
 * — see the spec's OWNER-APPROVED block. Keep them here as named
 * constants so the ledger (WP-119) and the tests import ONE definition.
 */
const Limits = {
  PRE_READ_CEILING_BYTES: 50 * 1024 * 1024, // a file larger than this is NOT opened → quarantined
  MAX_LINE_BYTES: 1 * 1024 * 1024,          // a single line over this → oversized-record marker
  MAX_LINES: 500_000,                       // per-file line-count cap → quarantine when exceeded
  MAX_RUN_BYTES: 200 * 1024 * 1024,         // aggregate bytes read across ALL files in one run
  READ_CHUNK_BYTES: 64 * 1024,              // fixed read buffer size
  MAX_JSON_DEPTH: 64,                       // nesting-depth pre-check before JSON.parse
};

/**
 * A shared run-scoped byte budget so MAX_RUN_BYTES bounds the WHOLE run, not each file.
 * The caller creates one per collectExtracts run and threads it through every streamLines
 * call. When the run budget is exhausted mid-file, streaming stops and the file is
 * reported truncated-by-run (its already-emitted lines are kept; it is NOT quarantined —
 * it is capacity-deferred, retried next run).
 */
function newRunBudget() { return { remaining: Limits.MAX_RUN_BYTES }; }

/**
 * @typedef {'ok'|'over-ceiling'|'too-many-lines'|'read-error'} StreamOutcome
 *   ok            — file streamed within all per-file caps (some lines may be marked).
 *   over-ceiling  — file size > PRE_READ_CEILING_BYTES; NOT opened; zero lines delivered.
 *   too-many-lines— MAX_LINES exceeded; streaming stopped; file is quarantine-worthy.
 *   read-error    — open/read threw after the ceiling check (I/O error); quarantine-worthy.
 * @typedef {{outcome: StreamOutcome, lines: number, oversizedRecords: number,
 *            runExhausted: boolean}} StreamResult
 */

/**
 * Stream `filePath` line by line, calling `onLine(text)` for each complete line within
 * MAX_LINE_BYTES. NEVER reads the whole file into memory: a fixed READ_CHUNK_BYTES buffer
 * accumulates bytes until a newline. Enforces, in order:
 *  - size > PRE_READ_CEILING_BYTES  → return { outcome:'over-ceiling' } WITHOUT opening.
 *  - a line whose byte length would exceed MAX_LINE_BYTES → the overflow bytes are
 *    discarded up to the next newline (never buffered); `onLine(OVERSIZED_RECORD_MARKER)`
 *    is called exactly once for that line; oversizedRecords++ . The session keeps going.
 *  - lines delivered/skipped count toward `lines`; when `lines` would exceed MAX_LINES →
 *    stop and return { outcome:'too-many-lines' }.
 *  - each chunk's bytes are subtracted from `budget.remaining`; when it reaches 0 mid-file,
 *    stop, set runExhausted:true, return { outcome:'ok', runExhausted:true } (deferred).
 * A trailing line with no final newline is delivered. `\r\n` is handled (the `\r` is left
 * on the line; callers already `JSON.parse`/`trim`). Bytes are decoded as UTF-8 per line
 * with `Buffer.toString('utf8')` (invalid sequences → U+FFFD, never a throw).
 * @param {string} filePath
 * @param {number} sizeBytes  the discovery-recorded fs size (avoids a second stat)
 * @param {{remaining:number}} budget  shared run budget from newRunBudget()
 * @param {(text:string)=>void} onLine
 * @returns {StreamResult}
 */
function streamLines(filePath, sizeBytes, budget, onLine) { /* implement per the rules */ }

/** The fixed, code-owned marker a caller emits in place of an over-cap line's text.
 *  It is a COMPLETE, valid standalone token — NOT valid JSON — so a parser that
 *  JSON.parses it fails and skips it (an oversized JSON record contributes no message);
 *  a parser that treats a line as already-extracted text substitutes this literal. */
const OVERSIZED_RECORD_MARKER = '[wienerdog: oversized record omitted]';

/** Cheap structural nesting-depth check WITHOUT parsing: scan the string counting the
 *  running depth of `{`/`[` minus `}`/`]`, ignoring bracket chars inside a JSON string
 *  (track an in-string flag + `\`-escape). Returns the max depth seen. A caller rejects
 *  the line (skips JSON.parse) when this exceeds MAX_JSON_DEPTH, so a pathologically deep
 *  line never reaches V8's recursive parser (which would throw RangeError anyway, but the
 *  guard makes the bound explicit and cheap).
 *  @param {string} line @returns {number} */
function maxJsonDepth(line) { /* implement */ }

module.exports = { Limits, newRunBudget, streamLines, maxJsonDepth, OVERSIZED_RECORD_MARKER };
```

**2. `src/core/transcripts/claude.js`.**

- `discoverClaude` — return `{ path, mtimeMs, size, dev, ino }` per file. `size =
  stat.size`, `dev = stat.dev`, `ino = stat.ino`. All are already on the `fs.Stats` the
  code `statSync`s today; just add them to the pushed object. The mtime filter/sort are
  unchanged.
- `parseClaudeTranscript(filePath, sizeBytes, budget)` — new signature. It no longer
  `readFileSync`es. It calls `streamLines(filePath, sizeBytes, budget, onLine)` where
  `onLine(text)` does exactly what the old per-line loop body did:
  - if `text === OVERSIZED_RECORD_MARKER`: the line was an oversized record. Do NOT
    `JSON.parse` it. It contributes no message and sets `truncated = true` (a real message
    was dropped). Continue.
  - else `if (text.trim() === '') return;` then a depth guard
    `if (maxJsonDepth(text) > Limits.MAX_JSON_DEPTH) return;` then
    `try { obj = JSON.parse(text); } catch { return; }` and the **unchanged** user/assistant
    mapping into `messages`/`skill_invocations`.
  - The skill-invocation `index`/`resultIndex` alignment to `messages` is byte-for-byte
    the SAME as today — the streaming change does not alter *which* objects are emitted or
    their order (an oversized record emits no message, exactly as a `JSON.parse` failure
    emits none today), so no rebasing is introduced here.
- **Return shape:** `parseClaudeTranscript(filePath, sizeBytes, budget)` returns
  `{ extract, parse }` where `extract` is the same `Extract` as today and `parse` is
  `{ outcome: StreamOutcome, oversizedRecords: number }` (from the `StreamResult`). When
  `streamLines` returned `over-ceiling` / `too-many-lines` / `read-error`, `extract` is a
  **valid but empty** extract (no messages, `session_id` = the file basename,
  `truncated:true`) and `parse.outcome` carries the quarantine reason. `truncated` becomes
  true whenever any oversized record was marked OR the message/line caps fired.

**3. `src/core/transcripts/codex.js`.** Identical treatment: `discoverCodex` returns
`{path,mtimeMs,size,dev,ino}`; `parseCodexTranscript(filePath, sizeBytes, budget)` streams,
maps `session_meta`/`response_item` exactly as today, and returns `{ extract, parse }`. An
oversized record marker → no message (skip the `mapCodexItem`), `truncated:true`. Codex has
no `skill_invocations`, so nothing else changes.

**4. `src/core/transcripts/index.js`.**

- Extend the `Extract` typedef comment: `dev`/`ino`/`size` are NOT on the extract — they
  ride the discovery record. Add a `@typedef ParseOutcome` mirroring `StreamOutcome`.
- `discover(paths, {since})` → `Array<{harness, path, mtimeMs, size, dev, ino}>` (propagate
  the new fields from both harness discoverers; the merge/sort is unchanged).
- **`parse(entry)` stays BACKWARD-COMPATIBLE — signature and return unchanged (→ `Extract`).**
  This is load-bearing: `src/core/dream/scratch.js` (NOT in this WP's deliverables) calls
  `transcripts.parse(entry)` and must keep working, and the whole suite must stay green when
  this WP lands. Internally `parse` now delegates to `parseWithOutcome` and returns only its
  `.extract`. It uses `entry.size` (now provided by `discover`) and a **fresh**
  `newRunBudget()` per call.
- **Add `parseWithOutcome(entry, budget)` → `{ extract, parse }`** — the new export WP-119
  uses. It calls the harness parser with `entry.size` and the shared run `budget`, applies
  the **unchanged** `capMessage` / `MAX_MESSAGES` / `rebaseInvocations` post-processing to
  `extract.messages`, and returns `{ extract: <post-capped extract>, parse: <the outcome> }`.
  `parse(entry)` === `parseWithOutcome(entry, newRunBudget()).extract`.
- Re-export `Limits`, `OVERSIZED_RECORD_MARKER`, `newRunBudget` from `./stream` for the
  ledger + tests.

### Worked example (assert in `transcript-stream.test.js`)

Given a file of three lines where line 2 is `MAX_LINE_BYTES + 100` bytes with no interior
newline, and a fresh `newRunBudget()`:

```
onLine calls: [<line1 text>, OVERSIZED_RECORD_MARKER, <line3 text>]
result: { outcome:'ok', lines:3, oversizedRecords:1, runExhausted:false }
```

Given a file whose `size` is `PRE_READ_CEILING_BYTES + 1`:

```
onLine calls: []   (file never opened)
result: { outcome:'over-ceiling', lines:0, oversizedRecords:0, runExhausted:false }
```

## OWNER-APPROVED (2026-07-17) — the bounded-intake limit values

The owner walkthrough ratified **all five recommended values as seeded** (50 MB /
1 MB / 500 000 / 200 MB / 64). On `MAX_RUN_BYTES` the fixed `200 MB` was explicitly
chosen over the tie-to-`dream_max_input_bytes` alternative: the two caps bound
different pipeline stages (raw intake I/O vs. bytes fed to the brain), so coupling
them would let a brain-input tuning silently move the nightly I/O plafond. These
numbers anchor ADR-0023. The original recommendations + rationale are kept below
for the implementer.

- **PRE_READ_CEILING_BYTES — recommend `50 MB`.** Real transcripts are typically well under
  a few MB; 50 MB is far above any legitimate single session yet bounded. *Alt:* `25 MB`
  (tighter, small risk of quarantining a genuinely huge coding day) or `100 MB` (looser).
- **MAX_LINE_BYTES — recommend `1 MB`.** One line = one JSON message; a >1 MB message is a
  pathological/hostile `tool_result`, marked and dropped without losing the session. *Alt:*
  `256 KB` (tighter) / `4 MB` (matches nothing else; looser).
- **MAX_LINES — recommend `500 000`.** A well-bounded session-length ceiling; above it the
  file is quarantine-worthy. *Alt:* `100 000` / `1 000 000`.
- **MAX_RUN_BYTES — recommend `200 MB`.** Aggregate bytes *read* in one run, independent of
  the smaller `dream_max_input_bytes` (8 MB) which caps bytes *fed to the brain*. This
  bounds total intake I/O so a huge backlog cannot be scanned unboundedly in one night.
  *Alt:* tie it to a multiple of `dream_max_input_bytes` (e.g. `10×`) so one knob moves both.
- **MAX_JSON_DEPTH — recommend `64`.** Deep enough for any real transcript object, shallow
  enough to reject a nesting bomb before V8's parser. *Alt:* `32`.

## Implementation notes & constraints

- **This implements the intake half of ADR-0023** (reference it in `stream.js`'s header).
  The ledger/quarantine half is WP-119 (`scratch.js` + `dream.js` + a new ledger module);
  the digest caps are WP-120. Do NOT touch `scratch.js`, `dream.js`, or `watermarks.js` here — this WP
  only produces the richer discovery metadata (`size`/`dev`/`ino`) and the per-file
  `parse.outcome` those WPs consume.
- **Never `readFileSync` a transcript again.** After this WP a `grep` for `readFileSync`
  over `src/core/transcripts/` must return **zero** matches. Streaming is the whole point.
- **Preserve the skill-invocation index alignment.** The Claude parser's `index` /
  `resultIndex` must still point at the exact emitted `messages` positions (WP-080/084/087).
  An oversized record emits no message just like a `JSON.parse` failure does today, so the
  emission order is unchanged — verify the existing skill-invocation tests still pass.
- **Fail-safe, never throw on bad bytes.** A `read-error`, invalid UTF-8, a `JSON.parse`
  failure, or a depth-bomb line must each degrade to "skip that line / quarantine that
  file", never throw out of `parse`. The dream job must stay robust exactly as today.
- **Zero deps, JSDoc only, no build step.** Synchronous `fs.openSync`/`readSync`/`closeSync`.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted identifier flows into a path or shell (transcript *paths* come from
      `discover`, not from content; content is only ever parsed/streamed as text). The
      per-line cap, line-count cap, pre-read ceiling, aggregate run cap, and depth guard
      together bound memory and CPU on fully attacker-controlled input; **raw oversized
      bytes never enter an extract** (the marker replaces them). Invalid UTF-8 and
      malformed/deep JSON degrade to a skipped line, never a throw or an unbounded buffer.

## Acceptance criteria

- [ ] `grep -rn "readFileSync" src/core/transcripts/` returns nothing (streaming only).
- [ ] `streamLines` on a file with an over-`MAX_LINE_BYTES` line calls `onLine` with
      `OVERSIZED_RECORD_MARKER` exactly once for that line, delivers the other lines
      normally, and returns `oversizedRecords:1` — the overflow bytes are never buffered
      whole (proven by running under a constrained heap, see verification).
- [ ] `streamLines` on a file with `size > PRE_READ_CEILING_BYTES` returns
      `{outcome:'over-ceiling', lines:0}` and **never opens the file** (assert via a
      spy/`openSync` counter or an unreadable-but-large stat seam).
- [ ] `streamLines` stops and returns `too-many-lines` after `MAX_LINES` lines, and returns
      `runExhausted:true` when the shared `budget` is drained mid-file (deferred, not
      quarantined).
- [ ] `parseWithOutcome(entry, budget)` returns `{extract, parse}`; a session with one
      oversized record is **still parsed** (its other messages present, `truncated:true`),
      and an over-ceiling file yields an empty extract with `parse.outcome:'over-ceiling'`.
      `parse(entry)` still returns a bare `Extract` (back-compat; scratch.js unchanged and
      the full suite green when this WP lands).
- [ ] `discover` records `size`, `dev`, `ino` on every entry for both harnesses.
- [ ] A deeply-nested single line (`[[[…` past `MAX_JSON_DEPTH`) and an invalid-UTF-8 line
      are each skipped with no throw; the surrounding valid lines still parse.
- [ ] `wienerdog safety` shows all five gates BLOCKED (unchanged; `safety-profile.js` not
      touched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "transcript"
# OOM/streaming proof: parse a synthesized near-limit file under a small heap and assert
# it completes (test spawns a child with --max-old-space-size). If the test itself needs
# the flag, it is set inside the test via child_process; running the suite is enough:
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
grep -rn "readFileSync" src/core/transcripts/ || echo "no readFileSync — OK"
```

## Out of scope (do NOT do these)

- The per-file quarantine **ledger**, the `collectExtracts` rewrite, the retirement of the
  scalar watermark, the `dream.js` wiring, and the durable quarantine banner — **WP-119**
  (which consumes `parseWithOutcome` + the richer discovery metadata this WP emits).
- Any change to `scratch.js`, `dream.js`, `watermarks.js`, redaction (`redact`), or the
  message caps (`MAX_MSG_CHARS`, `MAX_MESSAGES`). **Keep `parse(entry)` back-compat** so
  scratch.js is untouched here.
- Digest line/byte caps — **WP-120**. Hook fail-open — **WP-121**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/118-bounded-streaming-transcript-parse`; conventional commits; PR titled
   `feat(transcripts): bounded streaming parse + pre-read ceiling (WP-118)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are kept for
> template/upstream-porting fidelity.

## Fixtures note

`tests/fixtures/transcripts/claude-oversized-record.jsonl` — three lines: (1) a normal
`user` message object, (2) a `user`/`tool_result` object whose inner text is padded past
`MAX_LINE_BYTES` (generate the padding **in the test at write time** so the checked-in
fixture stays small — write a tiny fixture that the test expands, OR check in a
multi-hundred-KB fixture only if unavoidable; prefer test-time synthesis to keep the repo
lean), (3) a normal `assistant` message. The test asserts the session yields messages 1 and
3 plus the marker in place of 2.
