---
id: WP-codex-block-pointer-line
title: Give the Codex block a constant pointer line to the live digest, and document the Claude/Codex staleness asymmetry
status: Draft
model: sonnet
size: S
depends_on: [WP-digest-stable-volatile-split, WP-refusal-banner-delivery]
adrs: [ADR-0004, ADR-0031, ADR-0039]
epic: digest-delivery
---

# WP-codex-block-pointer-line: the degraded tier, stated honestly

## Context (read this, nothing else)

Wienerdog compiles the user's **digest** into each harness it detects.
`src/adapters/codex.js` owns the Codex CLI side: a **managed block** inside
`~/.codex/AGENTS.md`, hook scripts registered in `~/.codex/hooks.json`, and skill
symlinks into `~/.codex/skills/`.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP adds two fixed lines of
text to one generated block. It adds no process.

**Where the chain has got to.** `WP-managed-block-by-reference` made Claude Code's
block a **reference**: a preamble plus two `@<abs path>` memory imports (the volatile
digest, then the refusal banner), so the block's bytes change only at an attended
`wienerdog sync` while the content follows those files. `WP-digest-stable-volatile-split` then split the render in two — the
**stable digest** (the ADR-0021 hash-gated identity notes, human-ratified byte-for-byte)
and the **volatile digest** (banners, `## Active projects`, and the ADR-0032
untrusted-fenced latest daily log) — and established that only the stable half is ever
**copied** into a file the user owns.

**What that leaves Codex with, and why.** Codex has **no** include or import syntax in
`AGENTS.md` — official docs checked 2026-08-30; `openai/codex#17401` is an open
feature request. Its hooks engine is merged in `codex-rs` (TOML config, per-hook
`trusted_hash`, a `SessionStart` event exists) but has **no documentation page** and is
not a stable surface, and Codex requires the user to trust new hooks interactively via
`/hooks` before they run at all.

**Round-2 finding F7 amended ruling D3 on 2026-08-30, and it changes this WP's
premise.** Round 1 made *all* volatile content absent on a hook-less Codex install,
reasoning that absent is fail-safe where stale is not. That reasoning holds for the
untrusted-derived daily log and **fails for the banners**: an absent alert or refusal
banner is not fail-safe, it is a fail-loud *regression* — and this whole chain exists
because a warning went undelivered for four weeks. So on Codex:

- the **stable** identity is copied into the block;
- the **code-owned state-derived banners** (alerts, refusal, quarantines, scheduler,
  update, insecure modes) are **also** copied, as of the last sync;
- the **enumerated projects list** and the **untrusted-derived daily log** are absent —
  not stale, absent;
- anything fresher than the last sync arrives only if the user has trusted the hook.

Codex therefore keeps fail-loud at **exactly today's level** — last-sync banners, no
better and no worse — while receiving no untrusted-derived bytes. That residual
asymmetry against Claude Code is an owner ruling (D2, D3-as-amended) recorded in
ADR-0039 §3 and its Amendment 1, and this WP does **not** try to close it. What this WP
adds is a constant line naming the live digest path, so the gap between the last sync
and now is *named* rather than silent.

**Why a constant line and not a timestamp.** ADR-0039's Alternatives rejects a
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
block carries the stable identity plus the last-sync banners, so context does **not**
"work regardless" — anything fresher than the last sync genuinely requires the hook.

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
| modify | tests/unit/codex-adapter.test.js | pointer content, E7a order, the E7b adaptive budget, idempotence, notice wording |
| modify | tests/unit/refusal-banner-delivery.test.js | un-skip and complete the chain end-to-end assertion (AC-11) |

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
Your live working memory — today's activity, active projects, and the current state of
any Wienerdog warnings — is kept current at `<DIGEST_ABS_PATH>`. Read that file when you
need it; the text above this line is only as fresh as the last `wienerdog sync`.
```

The block body becomes: the stable digest text, one blank line, then this paragraph.

**The corrected Step-2 notice** replaces the existing one verbatim:

```text
Codex requires trusting new hooks via `/hooks` before they run. Until you do, your
AGENTS.md carries who you are plus any Wienerdog warnings as of your last sync; today's
activity is not injected automatically — the block names the file to read instead.
```

### Table F — the pointer-line contract

| Row | Fact | Value |
|-----|------|-------|
| F1 | Applies to | Harnesses with **no** import mechanism. Today: Codex only. Never emitted into the Claude Code block, which imports instead |
| F2 | Position | The composed block order is fixed by `WP-digest-stable-volatile-split` **Table E row E7a**: preamble, banners, **pointer paragraph**, then the stable identity. The pointer line sits **before** the identity, not last — round 3 (finding R9) made the order a priority order, because identity is the only component allowed to truncate under the E7b budget and a pointer that truncates away is worse than useless |
| F2a | Block budget | The composed Codex block fits an **adaptive** allowance — `32 KiB − the user's own AGENTS.md bytes − 2 KiB reserve`, floored at the minimal critical block (`WP-digest-stable-volatile-split` Table E rows **E7b/E7c**). The pointer paragraph is part of that critical block and is **never** the component that truncates |
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
  ADR-0039 rejected the timestamp explicitly; the reason is recorded there.
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
- [ ] This WP must not reintroduce **untrusted-derived** content into `AGENTS.md`. The
      state-derived banners are code-owned fixed-template text with no untrusted bytes
      (the rule `formatAlerts` and the quarantine banner already follow), which is
      exactly why they are safe to copy where the daily log is not. Verify by grepping
      the golden for daily-log and projects content.
- [ ] The pointer text must not instruct the model to *act* on the file's contents —
      it says the file is memory to read, which keeps ADR-0032's untrusted-fenced daily
      log inside the fence when it is eventually read, rather than pre-authorizing it.

## Acceptance criteria

- [ ] AC-1 — The composed Codex block carries the literal paragraph from Exact
      contracts in the E7a order — preamble, banners, **pointer paragraph**, stable
      identity — and the updated golden matches (F2).
- [ ] AC-1a — **Within the adaptive allowance (round-3 R9, round-4 S5).** With oversized
      inputs **and** a non-trivial pre-existing user `AGENTS.md`, the composed block fits
      `32 KiB − user bytes − 2 KiB`, the pointer paragraph and the banners are fully
      present, and only the stable identity is truncated (F2a, Table E E7a/E7b).
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
- [ ] AC-8 — The golden `AGENTS.md` contains **no** daily-log content and **no**
      projects list, but **does** carry the state-derived banners when the fixture has
      any (F7, Table E E7).
- [ ] AC-9 — `buildPointerLines` throws on a relative path.
- [ ] AC-10 — Running `wienerdog sync` twice is idempotent (second run: zero changes).
- [ ] AC-11 — **The chain's end-to-end test, NOT skipped (round-3 R7).** This is the
      last WP in the digest-delivery chain, so it owns the assertion that the whole
      thing works: with `app/current` unresolvable, the launcher having refused, and the
      Claude Code SessionStart hook **de-registered**, the refusal banner reaches a
      Claude Code session through the block's **second import line**. Assert on the
      resolved artifacts — the block's banner import line points at a concatenated
      banner file whose content is the refusal. `WP-refusal-banner-delivery`'s AC-12 was
      allowed to land `skip`ped pending the block work; **this one may not be skipped**,
      and if it cannot pass, the chain is not finished.

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
# AC-8 — no untrusted-derived content copied into AGENTS.md (expect NO output):
grep -n "Latest daily log\|Active projects" tests/golden/codex-adapter/AGENTS.md
# F7 — but the state-derived banners ARE carried when the fixture has any:
grep -n "\[!warning\]" tests/golden/codex-adapter/AGENTS.md
```

## Out of scope (do NOT do these)

- Building anything on Codex's undocumented `codex-rs` hooks engine, or changing how
  `hooks.json` is written. It is not a stable surface (ADR-0039 §3).
- Closing the Claude/Codex asymmetry. It is an accepted, documented outcome (owner
  rulings D2, D3).
- Adding a timestamp or freshness stamp anywhere in any block (ADR-0039 Alternatives).
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

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 finding F7 (owner: ACCEPTED — ruling D3 amended
  2026-08-30).** Round 1 built this WP on the premise that a hook-less Codex install
  receives **no** volatile content, with the pointer line as the consolation. The owner
  amended D3 because that premise silently removed Codex's proactive warnings: an absent
  alert or refusal banner is a **fail-loud regression**, not the fail-safe outcome round
  1 claimed, and the four-week silent failure behind this whole chain is exactly what an
  undelivered warning costs. The Codex block now copies the stable identity **plus the
  code-owned state-derived banners** as of the last sync; only the untrusted-derived
  daily log and the enumerated projects list stay absent. Codex keeps fail-loud at
  today's level — last-sync banners, no better. Context, Table F row F2, the pointer
  paragraph's wording ("only as fresh as the last `wienerdog sync`"), the corrected
  hook-trust notice, AC-8, the security checklist and the verification greps all follow.
  The constant pointer line and the no-timestamp rule (F6) are unchanged.
- **2026-08-30 — Codex round-2 findings R7, R8 and R9 (owner: ACCEPTED).**
  - **R9 — the block could exceed Codex's own limit, and the pointer could truncate
    away.** Each rendered component carries its own 32 KiB budget, so the composed block
    could pass Codex's 32 KiB *combined* `project_doc_max_bytes` before the user's own
    `AGENTS.md` content is counted. New **F2a**: a 24 KiB cap on the composed block
    (~8 KiB left for the user) *(⚠ superseded in round 4 by S5 — the budget is now
    adaptive to the user's actual `AGENTS.md` bytes)*, and **F2 reordered** to the E7a priority order —
    preamble, banners, **pointer**, identity — because identity is the only component
    allowed to truncate and a pointer line that truncates away is worse than no pointer
    at all. New AC-1a with an oversized fixture.
  - **R8.** The block is now assembled by `buildCodexBlock({prefix, stable,
    pointerLine})` (defined in `WP-digest-stable-volatile-split` Table E E7); this spec
    supplies the `pointerLine` argument rather than appending text itself. Every
    superseded "all volatile content is absent on Codex" statement was purged from the
    GLOSSARY and ADR-0039 §3/Consequences in the same pass.
  - **R7.** As the **last** WP in the chain, this spec now owns the **non-skipped**
    end-to-end assertion (new AC-11): unresolvable `app/current` + hook de-registered →
    the banner reaches the session through the block's second import.
    `WP-refusal-banner-delivery`'s AC-12 remains the earlier, skip-permitted placeholder;
    this one is the real gate, and un-skipping that test is a Deliverable here.
- **2026-08-30 — Codex round-3 findings S5 and S6 (owner: ACCEPTED).** **S5:** F2a's flat
  24 KiB cap became the adaptive allowance defined in `WP-digest-stable-volatile-split`
  Table E rows E7b/E7c; the pointer paragraph is part of the minimal critical block and is
  never the component that truncates. AC-1a now requires a fixture with non-trivial
  pre-existing user `AGENTS.md` content. **S6:** `depends_on` gained
  `WP-refusal-banner-delivery` — this spec's AC-11 un-skips the end-to-end test that spec
  creates, which is not orderable without the dependency being declared.
