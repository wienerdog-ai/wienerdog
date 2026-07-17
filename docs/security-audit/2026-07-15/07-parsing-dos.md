# Wienerdog Security Audit — Input Parsing, Resource/DoS Safety & Digest/Managed-Block Injection

> **Consensus status (2026-07-15): F1/F2/F3/F4 are confirmed.** F1 is MEDIUM
> security impact (availability) but P0 engineering priority because the attack
> is cheap and creates a persistent nightly wedge. The fix is a bounded,
> streaming parser plus a per-file fingerprinted quarantine ledger and durable
> alert; blindly advancing a global watermark can skip unrelated valid input.
> F2 is raised to P0/HIGH-impact-but-transient because it injects into every
> session with a low precondition. F3 requires both line and byte caps. The
> fail-open audit must cover every shipped hook, not only SessionStart.

**Dimension:** Input parsing robustness, resource/DoS safety, and digest/managed-block injection
**Date:** 2026-07-15
**Scope:** the parse → normalize → redact → render → inject path — transcript JSONL parsing
(`src/core/transcripts/*`), size-cap/chunking (`src/core/dream/scratch.js`), redaction
(`src/core/transcripts/index.js`), digest render (`src/core/digest.js`), managed-block compile
(`src/adapters/*`), and the shell hooks (`templates/hooks/*`).
**Method:** read-only source review. No files in the repo were modified.

---

## Executive summary

The parsing pipeline has one **structural DoS**: every transcript is read **whole into memory**
(`fs.readFileSync`) and **every discovered transcript is parsed into memory simultaneously** before
any size cap is applied. All the byte/message caps (`MAX_MSG_CHARS`, `MAX_MESSAGES`,
`dream_max_input_bytes`) are enforced *after* the OOM-capable work has already happened. A single
poisoned transcript (attacker-influenced content) can wedge the nightly dream job persistently.

The redaction regexes are **not** a ReDoS vector (no nested quantifiers — a genuinely solid design),
and the shell hooks JSON-encode content correctly (no envelope breakout, no command injection). The
frontmatter parsers avoid a full YAML engine, side-stepping the classic YAML DoS/deserialization
surface — but the **digest-render trust gate that excludes untrusted-derived notes is a brittle,
quote-blind, case-sensitive string match** that diverges from the stricter boolean-aware parser used
at commit time, and for **daily notes there is no commit-time backstop** — making it a real
prompt-injection path into the injected session context.

The claimed **"digest ≤ 120 lines" cap is not enforced anywhere** in code.

Ranked findings, most severe first.

---

## Findings

### F1 — Whole-file read + parse-all-into-memory before any size cap (unbounded memory / nightly-job DoS)
**Severity:** HIGH
**Files:**
- `src/core/transcripts/claude.js:80` — `raw = fs.readFileSync(filePath, 'utf8')`
- `src/core/transcripts/codex.js:128` — `raw = fs.readFileSync(filePath, 'utf8')`
- both then `raw.split('\n')` (`claude.js:85`, `codex.js:133`) — a second full copy
- `src/core/dream/scratch.js:100-104` — `const parsed = fresh.map((entry) => ({ …, extract: transcripts.parse(entry) }))` holds **every** parsed extract in memory at once
- caps live *downstream*: `src/core/transcripts/index.js:80-88` (`capMessage`, 4000 chars), `index.js:125-139` (2000 messages), `scratch.js:120-140` (`dream_max_input_bytes` water-filling)

**Scenario (DoS / hang / persistent wedge):**
`discover()` filters transcripts by **mtime only** — there is no size guard before the read. The
transcript directories (`~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/rollout-*.jsonl`) hold
*fully attacker-influenced* content: a single oversized `tool_result` (e.g. a malicious MCP server or
a `WebFetch` of a huge page) is written verbatim into the JSONL as one line. Because:
1. the whole file is `readFileSync`'d into a string, then `split('\n')` duplicates it,
2. each line is `JSON.parse`'d (a 400 MB line → ~1 GB of live objects),
3. `capMessage` then **redacts the full untruncated message text** before truncating to 4000 chars, and
4. `collectExtracts` parses **all** fresh files into `parsed[]` *before* the byte budget is applied,

several ~400 MB transcripts (or one large one plus a normal backlog) drive resident memory well past
Node's default heap and OOM-kill the nightly `wienerdog dream` job. The watermark is only advanced
*after* a successful commit (`src/cli/dream.js:277`), so the same poisoned file is re-selected every
night → **permanent denial of the memory-consolidation system** until a human intervenes. This
directly violates the "the dream never wedges" intent asserted in `scratch.js:8-13`.

**Exploitable-or-mitigated:** Partially mitigated by accident, not by design:
- Node's max string length is ~512 MB (`buffer.constants.MAX_STRING_LENGTH` = 536 870 888). A file
  **> ~512 MB** makes `readFileSync('utf8')` throw; it is caught (`catch { raw = ''; }`) and the file
  yields an empty extract. So a single multi-GB file is *silently skipped* (see F6) rather than OOM.
- But files **under** the string limit (up to ~512 MB each) are read fully, and **N** of them are held
  simultaneously — that is the OOM path, and it is not mitigated.
No `stat.size` cap, no streaming/line-by-line reader, no per-file byte ceiling exists anywhere in the
read path.
**Confidence:** High.

**Suggested direction (non-binding):** add a `stat.size` ceiling in `discover`/`parse` (skip-with-alert
above e.g. a few MB), or stream the file line-by-line with a per-line length guard, and cap the
per-message text length *before* redaction rather than after.

---

### F2 — Digest-render untrusted-note exclusion is a brittle string match with no daily-note backstop (prompt injection into every session)
**Severity:** HIGH
**Files:**
- `src/core/digest.js:57` — `if (note.data.derived_from_untrusted === 'true') return null;`
- `src/core/digest.js:32-39` — `splitFrontmatter` value handling (trims, strips from first `#`, **does not strip quotes**, does not coerce booleans, key regex `^([A-Za-z0-9_]+):` is column-0 anchored)
- contrast: `src/core/dream/validate.js:139-160` — the *other* frontmatter parser strips quotes **and** coerces `true`/`false` to booleans
- `src/core/dream/validate.js:702-807` — Tier-3 commit gate (`derived_from_untrusted === false`) applies **only** to `identity_dir/` and `skills_dir/`; daily logs / Tier-1-2 notes are `→ keep` (line 807), with no untrusted floor

**Scenario (injection):** The digest is rendered from vault notes and injected into every new session
as `additionalContext` (instructions-adjacent) *and* compiled into `CLAUDE.md`/`AGENTS.md`. The design
claim is that notes flagged `derived_from_untrusted: true` never reach the digest. The render-time gate
that enforces this (`digest.js:57`) is an **exact, case-sensitive, quote-blind string comparison** to
the literal `'true'`. It fails to exclude a note whose flag is written in any non-canonical form:
- `derived_from_untrusted: "true"` → value is `"true"` (quotes intact — this parser doesn't strip them) → `!== 'true'` → **rendered**
- `derived_from_untrusted: True` / `TRUE` / `yes` → **rendered**
- an indented/nested flag (` derived_from_untrusted: true`) → key regex is column-0 anchored → parsed as absent → **rendered**

Crucially, `renderDigest` injects the **Summary section of the newest daily note** (`digest.js:266-271`),
and daily notes are **not** subject to the Tier-3 commit gate (`validate.js:807`). So for daily-derived
content, `digest.js:57` is the *sole* backstop — there is no boolean-aware commit-time re-check to catch
a mis-formatted flag. If the dream brain (writing a daily summary distilled from untrusted session/tool
content) emits the flag in a quoted or capitalized form — or a future skill/adopt path does — the
untrusted-derived text is injected into every subsequent session as trusted context. The two parsers
disagreeing on the exact same field (`===false` boolean vs `==='true'` string) is the smell:
the security-load-bearing exclusion uses the weaker of the two.

**Exploitable-or-mitigated:** For **identity/skills** notes, the boolean-aware Tier-3 commit gate
(`untrustedFalse = fm.derived_from_untrusted === false`, `validate.js:189`) is a compensating control —
an identity note that isn't provably `false` is reverted before commit, so it can't reach the digest.
For **daily notes there is no such backstop**; exploitability then depends only on the flag ever being
written non-canonically. Confidence that the gate is brittle: High. Confidence it is reachable in
practice: Medium (depends on brain/adopt frontmatter-writing conventions).
**Confidence:** High (defect) / Medium (live reachability).

**Suggested direction:** reuse `validate.js`'s boolean-aware parser (or normalize: strip quotes,
lowercase, trim) in `readNote`, and fail *closed* — exclude the note whenever the flag is present and
not exactly boolean `false` / absent-and-provably-trusted, rather than only excluding the exact string
`'true'`.

---

### F3 — Claimed "digest ≤ 120 lines" cap is not enforced (unbounded injected context)
**Severity:** MEDIUM
**Files:** `src/core/digest.js:227` (JSDoc claims "Output is <=120 lines"), `renderDigest` body
`digest.js:240-282` (no line count / length truncation anywhere)

**Scenario (resource / context bloat):** `renderDigest` concatenates identity notes, project dir names,
and the daily Summary via `compact()` and `extractSection()`, neither of which caps length. There is no
`.slice(0, 120)` or byte limit. A large `profile.md`/`preferences.md`/`goals.md`/`instructions.md`, or a
large daily Summary, produces an arbitrarily large digest, which is (a) written to
`~/.wienerdog/state/digest.md`, (b) injected on **every** SessionStart as `additionalContext`, and
(c) compiled into the `CLAUDE.md`/`AGENTS.md` managed block. This inflates every session's context
(cost/latency) and undermines the hook's "<200 ms, no computation" claim (F5). It is a contract/robustness
gap; content is user/brain-authored so it's not a strong injection vector on its own, but it compounds F1
(the hook then `readFileSync`s and `JSON.stringify`s a huge string) and F2 (more untrusted-derived body
reaches the session).
**Exploitable-or-mitigated:** Not attacker-controlled directly; unmitigated as a size cap.
**Confidence:** High (the cap is simply absent).

---

### F4 — SessionStart hook is not strictly fail-open under `set -e`
**Severity:** LOW
**File:** `templates/hooks/session-start.sh:5,17-18`

**Scenario:** The hook opens with `set -euo pipefail` and comments assert "fail-open (always exit 0)".
The final work is a single `node -e '…' "$DIGEST"` followed by `exit 0`. Under `set -e`, if the
`node` invocation exits non-zero — digest deleted in the race between the `[ -f "$DIGEST" ]` check
(line 13) and the read, an OOM on a pathologically large digest (see F3), a Node runtime error — the
script exits with that non-zero code and **never reaches `exit 0`**. The "always exit 0" invariant is
therefore not guaranteed by the code. In practice SessionStart is a non-blocking hook in the harness,
so a non-zero exit surfaces a warning rather than blocking the session, keeping the *user-visible*
behavior fail-open; but the stated guarantee is stronger than what the script enforces.
**Exploitable-or-mitigated:** Mitigated by harness non-blocking semantics; the guarantee is nonetheless
not code-enforced. No command injection: `"$DIGEST"` is passed as an argv element and read via `fs`,
never interpolated into a shell command, and digest bytes reach `stdout` only through `JSON.stringify`.
**Confidence:** Medium.

**Suggested direction:** run the node step with `|| true` (or wrap in `if … ; then`) so the trailing
`exit 0` is always reached; alternatively drop `set -e` for this leaf hook.

---

### F5 — SessionStart "<200 ms, no computation" is contingent on digest size
**Severity:** LOW / INFO
**File:** `templates/hooks/session-start.sh:17`

The hook `readFileSync`s the whole digest and `JSON.stringify`s it. With F3 unbounded, a large
`digest.md` makes the "fast, no computation" claim false and adds latency to every session start. Tie-in
with F3; on its own, informational.
**Confidence:** High (follows directly from F3).

---

### F6 — Transcripts larger than Node's max string length are silently dropped
**Severity:** LOW / INFO
**Files:** `src/core/transcripts/claude.js:79-83`, `src/core/transcripts/codex.js:127-131`

`readFileSync(filePath, 'utf8')` on a file > ~512 MB throws
(`ERR_STRING_TOO_LONG`); the `catch { raw = ''; }` turns that into an **empty extract** with no error,
warning, or alert. The session is treated as consumed (its mtime can advance the watermark) but **its
content was never parsed or consolidated** — silent data loss for oversized sessions, and a
size-based way to make a specific session invisible to the memory system. This is the accidental
mitigation for F1's single-giant-file case, but the silence is itself a robustness gap.
**Confidence:** High.

---

### F7 — Two divergent frontmatter parsers create an ongoing trust-consistency hazard
**Severity:** LOW (design)
**Files:** `src/core/digest.js:19-41` vs `src/core/dream/validate.js:130-163` (and a third minimal
reader in `src/core/dream/config.js:16-43`)

Three separate hand-rolled frontmatter/scalar parsers exist, each with different rules for quote
stripping, boolean coercion, and comment handling. F2 is the concrete security consequence of this
divergence, but the broader hazard is that a security-relevant field (`derived_from_untrusted`,
`confidence`, `recurrence`) is interpreted differently depending on which code path reads it. Consolidating
to a single audited parser would remove the class of bug F2 belongs to.
**Confidence:** High (the divergence is factual).

---

## Solid controls worth crediting

- **Redaction regexes are not a ReDoS vector.** `src/core/transcripts/index.js:23-39` — every pattern
  is linear/near-linear: no nested quantifiers (no `(a+)+`-style constructs). The private-key pattern
  `-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END …` uses a lazy `[\s\S]*?` and a single `[A-Z ]*`
  bounded by fixed literal anchors, giving linear backtracking per `-----BEGIN ` occurrence — not
  catastrophic. The `\s*[:=]\s*` and `{12,}=*` fragments have no overlapping-quantifier ambiguity.
  Crafted input cannot hang the nightly job via these regexes. (Caveat noted in F1: redaction still
  runs over *untruncated* message text, so it is a CPU cost that scales with F1's unbounded input, not
  a hang in itself.)

- **Managed-block sentinel self-wedge is defended.** `src/adapters/shared.js:84-95` (`buildBlock`)
  neutralizes any digest line that trims exactly to `<!-- wienerdog:begin -->` / `<!-- wienerdog:end -->`
  (colon → space) before emitting the block, and `locateManagedBlock` (`shared.js:20-39`) fails closed
  (throws, refuses to edit) on ambiguous/duplicate/inverted markers rather than guessing. Note content
  therefore cannot inject a second sentinel pair or break out of the managed block.

- **SessionStart JSON envelope is injection-safe.** `templates/hooks/session-start.sh:17` builds the
  `additionalContext` envelope with `JSON.stringify` over the raw digest bytes — quotes, backslashes,
  control chars, and invalid-UTF-8 (→ U+FFFD) are all safely escaped. Digest content cannot break the
  JSON or inject sibling fields, and it is never interpolated into a shell command.

- **queue.jsonl append is safe and (currently) unread.** `templates/hooks/session-end.sh:18` and
  `codex-session-end.sh:23` build each record with `JSON.stringify`, so an attacker-influenced `cwd` /
  `transcript_path` (a session run from a crafted directory) cannot break the JSONL line or inject
  fields. Additionally, no code in `src/` consumes `state/queue.jsonl` — ground-truth capture is
  transcript scanning — so even a malformed line has no downstream parser to poison.

- **Frontmatter/config parsing avoids a real YAML engine.** `digest.js`, `validate.js`, and
  `config.js` use minimal line-based readers instead of a YAML library, side-stepping the classic YAML
  attack surface entirely: no anchors/aliases (no billion-laughs expansion), no `!!`-tag
  deserialization, no type-coercion tricks. (The cost of this choice is the divergence hazard in F7 /
  the brittleness in F2 — but the DoS/deserialization surface is genuinely closed.)

- **JSONL parse is per-line and exception-safe.** Both parsers wrap `JSON.parse(line)` in a
  `try/catch` and `continue` on failure (`claude.js:95-99`, `codex.js:142-146`), so malformed lines,
  and even the `RangeError` from pathologically deep JSON nesting, are swallowed and skipped rather than
  crashing the job. JSON has no entity-expansion, so billion-laughs does not apply to the JSONL surface.

- **Directory walks do not follow symlinks.** `discoverCodex` (`codex.js:19-42`), `newestDaily`
  (`digest.js:161-187`), and the adapter tree walks use `Dirent.isDirectory()` (lstat-based), so a
  symlink-to-directory is not recursed into — no symlink-cycle infinite recursion in the discovery/render
  walks.

- **Final scratch extracts are hard-capped.** After parse, `capMessage` (4000 chars/message),
  `MAX_MESSAGES` (2000), and the `dream_max_input_bytes` water-filling in `scratch.js` bound the bytes
  actually written to scratch and fed to the brain. The caps are correctly enforced on the *output*;
  the F1 gap is strictly that they don't protect the *transient* parse-time memory.
