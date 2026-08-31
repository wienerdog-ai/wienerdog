---
id: WP-codex-block-pointer-line
title: Give the Codex block a constant pointer line to the live digest, and document the Claude/Codex staleness asymmetry
status: Superseded
model: sonnet
size: S
depends_on: [WP-digest-stable-volatile-split]
adrs: [ADR-0004, ADR-0031, ADR-0040]
epic: digest-delivery
---

# WP-codex-block-pointer-line: the degraded tier, stated honestly

> **SUPERSEDED 2026-08-31 — never implemented; kept as the record of the design.**
> This package belonged to the digest-delivery chain implementing ADR-0040
> ("the managed block is a reference, not a copy"), which the owner withdrew on
> 2026-08-31 in favor of the fork's ADR-0039 (session-start dedup) — implemented,
> tested and adopted with the fork's tree as the mainline base (PR #177 and the
> follow-up integration). See the logbook entry
> `2026-08-31-two-adr-0039s-and-the-chain-stands-down.md` and ADR-0040's
> withdrawal header (which names what remains live: the write rule and the
> launcher refusal-banner problem).

## Context (read this, nothing else)

Wienerdog compiles the user's **digest** into each harness it detects.
`src/adapters/codex.js` owns the Codex CLI side: a **managed block** inside
`~/.codex/AGENTS.md`, hook scripts registered in `~/.codex/hooks.json`, and skill
symlinks into `~/.codex/skills/`.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP adds two fixed lines of
text to one generated block. It adds no process.

**Where the chain has got to.** `WP-managed-block-by-reference` made Claude Code's
block a **reference**: a preamble plus one `@<abs path>` memory import, so the block's
bytes change only at an attended `wienerdog sync` while the content follows the
digest file. `WP-digest-stable-volatile-split` then split the render in two — the
**stable digest** (the ADR-0021 hash-gated identity notes, human-ratified byte-for-byte)
and the **volatile digest** (banners, `## Active projects`, and the ADR-0032
untrusted-fenced latest daily log) — and established that only the stable half is ever
**copied** into a file the user owns.

**What that leaves Codex with, and why.** Codex has **no** include or import syntax in
`AGENTS.md` — official docs checked 2026-08-30; `openai/codex#17401` is an open
feature request. Its hooks engine is merged in `codex-rs` (TOML config, per-hook
`trusted_hash`, a `SessionStart` event exists) but has **no documentation page** and is
not a stable surface, and Codex requires the user to trust new hooks interactively via
`/hooks` before they run at all. So on Codex:

- the **stable** half is copied into the block, exactly as `AGENTS.md` can carry it;
- the **volatile** half arrives only if the user has trusted the hook, and otherwise is
  **absent** — not stale, absent.

That asymmetry is an owner ruling (D2, D3), recorded in ADR-0040 §3, and this WP does
**not** try to close it. What it does is stop the absence from being *silent*: the
block gains a constant line naming the live digest path, so a Codex session can be
told where the current context is and can read it if the user asks.

**Why a constant line and not a timestamp.** ADR-0040's Alternatives rejects a
`rendered: <ISO>` stamp explicitly: it would make every `sync` produce different block
bytes, so `applyManagedBlock` would report `changed` on every run and the repo's
idempotence invariant ("running twice = zero changes") would be false. Day granularity
only defers the flip. The line must be a pure function of the digest's **path**, with
no time in it.

**Be honest about what this is.** A pointer line is **not** a guaranteed channel. It
depends on the model choosing to read the file, and it costs a tool call when it does.
It is strictly better than a four-week-old frozen copy and strictly worse than an
import. It is the degraded tier, and the spec says so rather than dressing it up.

## Current state

`src/adapters/codex.js`, Step 1 — after `WP-digest-stable-volatile-split` it copies the
**stable** text into the block and pushes the override notice on success:

```js
if (digest !== null) {
  try {
    shared.applyManagedBlock(agentsMd, digest, dryRun, manifest, out);
    // Success-only by design (spec implementation note): the override notice
    // need not fire when the block could not be updated.
    if (fs.existsSync(overridePath)) {
      out.notices.push(
        "~/.codex/AGENTS.override.md exists — it shadows Wienerdog's AGENTS.md; merge the managed block manually or remove the override"
      );
    }
  } catch (err) {
    if (err instanceof WienerdogError) {
      out.notices.push(
        `managed block not updated in ${agentsMd} — ${err.message}; hooks + skills still installed. Resolve the markers by hand, then re-run 'wienerdog sync'.`
      );
    } else {
      throw err;
    }
  }
} else {
  out.notices.push(
    `digest not found at ${digestPath}; managed block skipped (hooks + skills still installed)`
  );
}
```

Step 2 already pushes the hook-trust notice:

```js
out.notices.push(
  "Codex requires trusting new hooks via `/hooks` before they run; the AGENTS.md block already carries the digest so context works regardless"
);
```

**That notice is now false in its second clause** and is a deliverable of this WP: the
block carries the *stable* half, so context does **not** "work regardless" — the
volatile half genuinely requires the hook.

`AGENTS.override.md` **replaces** `AGENTS.md` rather than merging (researcher fact,
2026-08-30), which is why the existing override notice tells the user to merge by hand.
Codex's `project_doc_max_bytes` default is **32 KiB combined**, which the stable half
comfortably fits (`DigestCaps.MAX_BYTES` is 32 KiB for the whole render, and the stable
half is a subset).

`src/adapters/shared.js` exports `buildReferenceBody` (added by
`WP-managed-block-by-reference`) and `toPosixCommand`, the forward-slash path
normalizer used for Windows-safe paths.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/codex.js | append the pointer lines to the block body; fix the false hook-trust notice |
| modify | src/adapters/shared.js | `buildPointerLines(digestAbsPath)` |
| modify | tests/golden/codex-adapter/AGENTS.md | block with the pointer lines |
| modify | tests/unit/codex-adapter.test.js | pointer content, idempotence, notice wording |

**Golden files:** you **DO** have permission to update
`tests/golden/codex-adapter/AGENTS.md`, and only that one.
`tests/golden/claude-adapter/CLAUDE.md` and `tests/golden/digest-default.md` must
**not** change.

### Exact contracts

```js
/** The constant pointer paragraph appended to a managed block on a harness with no
 *  import mechanism (Table F). Pure — no fs, no clock. The output depends ONLY on the
 *  path, so a re-sync produces identical bytes.
 *  @param {string} digestAbsPath absolute path to <core>/state/digest.md
 *  @returns {string} */
function buildPointerLines(digestAbsPath)
```

**The literal appended paragraph** (with `<DIGEST_ABS_PATH>` substituted):

```markdown
Your live working memory — today's activity, active projects, and any Wienerdog
warnings — is kept current at `<DIGEST_ABS_PATH>`. Read that file when you need it;
the text above this line is only the part that changes rarely.
```

The block body becomes: the stable digest text, one blank line, then this paragraph.

**The corrected Step-2 notice** replaces the existing one verbatim:

```text
Codex requires trusting new hooks via `/hooks` before they run. Until you do, your
AGENTS.md carries only the stable part of your memory (who you are); today's activity
and any Wienerdog warnings are not injected automatically — the block names the file
to read instead.
```

### Table F — the pointer-line contract

| Row | Fact | Value |
|-----|------|-------|
| F1 | Applies to | Harnesses with **no** import mechanism. Today: Codex only. Never emitted into the Claude Code block, which imports instead |
| F2 | Position | Last element of the block body: stable text, one blank line, then the pointer paragraph |
| F3 | Path | The **absolute** path to `<core>/state/digest.md` — the full render, not `digest-volatile.md`, because a human or model reading one file should get the whole picture |
| F4 | Path separators | Forward slashes on every platform, via `toPosixCommand` |
| F5 | Path rendering | Inside backticks, so a path with spaces reads correctly and markdown does not mangle it |
| F6 | Time | **None.** No timestamp, no date, no "as of". The output is a pure function of the path (idempotence) |
| F7 | Precondition | Emitted only when the block is written at all — i.e. when the stable digest exists. The existing "digest not found → skip with a notice" path is unchanged |
| F8 | Guarantee level | **Not** a guaranteed channel: it depends on the model choosing to read the file. Stated as such in the ADR and in this spec; never described as equivalent to the hook or the import |
| F9 | Hook-trust notice | Replaced with the corrected wording in Exact contracts — the old text's "context works regardless" is false after the split |
| F10 | Override notice | Unchanged. `AGENTS.override.md` replaces rather than merges, so the existing manual-merge notice still applies |

## Contract reference

N/A — a small local contract, decided once in Table F and mirrored only by the literal
paragraph under Exact contracts, the acceptance criteria and the golden. Fewer than two
of ADR-0031's seven triggers fire; the apportionment it depends on is decided in
`WP-digest-stable-volatile-split` Table E.

## Implementation notes & constraints

- **F6 is the one that will bite.** Any instinct to add "as of \<date\>" must be
  resisted — it breaks idempotence, which CI and the acceptance criteria both check.
  ADR-0040 rejected the timestamp explicitly; the reason is recorded there.
- **Do not emit the pointer into the Claude block (F1).** Claude Code imports the
  volatile half; a pointer line there would be noise telling the model to read a file
  it has already been given.
- **Keep it two sentences.** Codex's `project_doc_max_bytes` is 32 KiB combined across
  documents, and the block is already carrying the stable digest. This is a signpost,
  not a second explanation of Wienerdog.
- **Fix the notice in the same PR (F9).** Leaving "the AGENTS.md block already carries
  the digest so context works regardless" in place after the split ships is a
  user-facing false statement, and it is printed on every `sync`.
- **Use backticks around the path (F5)** but keep the paragraph itself outside any
  fence. A fenced paragraph would be inert-looking to a reader and, on a harness that
  ever gains imports, would silently disable one.
- Existing installs pick this up at the next `wienerdog sync`; the block is replaced
  between its existing sentinels. No migration code.
- When uncertain: choose the simpler option and record it under "Decisions made" in the
  PR body. Do NOT expand scope.

## Security checklist

- [ ] The path is built from `paths.state`, never from an environment variable or user
      input. A user-influenced path here would direct the model to read an
      attacker-chosen file on every Codex session.
- [ ] `buildPointerLines` must reject a relative path (assert `path.isAbsolute`) rather
      than emit one whose resolution depends on the harness's cwd (F3).
- [ ] The paragraph is fixed, code-owned text with exactly one interpolation — the path.
      No digest content, no vault content, no user string enters it.
- [ ] This WP must not reintroduce volatile content into `AGENTS.md`. It names a file;
      it does not inline it. Verify by grepping the golden for daily-log content.
- [ ] The pointer text must not instruct the model to *act* on the file's contents —
      it says the file is memory to read, which keeps ADR-0032's untrusted-fenced daily
      log inside the fence when it is eventually read, rather than pre-authorizing it.

## Acceptance criteria

- [ ] AC-1 — The Codex block ends with the literal paragraph from Exact contracts,
      preceded by one blank line after the stable text; the updated golden matches
      (F2).
- [ ] AC-2 — The path in the paragraph is the absolute path to `state/digest.md`,
      backtick-wrapped, forward-slashed (F3, F4, F5).
- [ ] AC-3 — The block contains **no** date, time, or "as of" text; two consecutive
      adapter runs produce identical bytes and the second reports `unchanged` (F6).
- [ ] AC-4 — The Claude Code block does **not** contain the pointer paragraph;
      `tests/golden/claude-adapter/CLAUDE.md` is unchanged (F1).
- [ ] AC-5 — With the stable digest absent, no block is written, the existing notice is
      pushed, and hooks and skills still install (F7).
- [ ] AC-6 — The Step-2 hook-trust notice matches the corrected wording verbatim and
      no longer contains "context works regardless" (F9).
- [ ] AC-7 — The `AGENTS.override.md` notice is unchanged and still fires only on a
      successful block write (F10).
- [ ] AC-8 — The golden `AGENTS.md` contains no daily-log content and no banner text.
- [ ] AC-9 — `buildPointerLines` throws on a relative path.
- [ ] AC-10 — Running `wienerdog sync` twice is idempotent (second run: zero changes).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern codex-adapter
npm test -- --test-name-pattern adapter
npm test
npm run lint
# AC-4 — the Claude golden and the digest golden are untouched (expect NO output):
git diff --stat -- tests/golden/claude-adapter/CLAUDE.md tests/golden/digest-default.md
# AC-3 — no time in the Codex block (expect NO output):
grep -nE "20[0-9]{2}-[0-9]{2}-[0-9]{2}|as of" tests/golden/codex-adapter/AGENTS.md
# AC-6 — the false clause is gone (expect NO output):
grep -n "context works regardless" src/adapters/codex.js
# AC-8 — no volatile content copied into AGENTS.md (expect NO output):
grep -n "Latest daily log\|\[!warning\]" tests/golden/codex-adapter/AGENTS.md
```

## Out of scope (do NOT do these)

- Building anything on Codex's undocumented `codex-rs` hooks engine, or changing how
  `hooks.json` is written. It is not a stable surface (ADR-0040 §3).
- Closing the Claude/Codex asymmetry. It is an accepted, documented outcome (owner
  rulings D2, D3).
- Adding a timestamp or freshness stamp anywhere in any block (ADR-0040 Alternatives).
- Changing `renderDigest`, the apportionment, or `DigestCaps` —
  `WP-digest-stable-volatile-split` owns those.
- Merging `AGENTS.override.md` automatically. The manual-merge notice stands.
- User-facing documentation. Note what needs updating under "Discovered issues";
  `wd-docs` owns those files.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(adapters): Codex pointer line (WP-codex-block-pointer-line)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
