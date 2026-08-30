---
id: WP-digest-stable-volatile-split
title: Split the digest into a stable half safe to copy and a volatile half that is only ever referenced
status: Draft
model: opus
size: M
depends_on: [WP-managed-block-by-reference]
adrs: [ADR-0004, ADR-0021, ADR-0024, ADR-0031, ADR-0032, ADR-0039]
epic: digest-delivery
---

# WP-digest-stable-volatile-split: two renders, one chokepoint

## Context (read this, nothing else)

Wienerdog renders a **digest** — `~/.wienerdog/state/digest.md`, produced by
`renderDigest` in `src/core/digest.js` — and delivers it into every AI session. After
`WP-managed-block-by-reference`, Claude Code gets it by **reference**: the managed
block in `~/.claude/CLAUDE.md` holds a fixed preamble plus **two** `@<abs path>` import
lines — the digest, then the refusal banner — and nothing else. Codex, which has **no** include syntax in `AGENTS.md`, still
gets the whole digest copied into its block.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP changes how one file's
content is apportioned between two files. It adds no process.

**Why split at all, now that the freshness problem is solved.** The remaining reason
is not freshness — it is **which trust channel each kind of content lands in**, and it
is the strongest argument in ADR-0039 (§4).

The digest mixes content from two genuinely different trust classes:

- The injected **identity** notes pass ADR-0021's **identity trust registry** gate:
  `renderDigest` injects one only when its current exact bytes hash-match a value a
  human ratified, either seeded at a first attended `sync` or approved through the
  TTY-only `wienerdog memory approve`. A mismatch fails closed and raises a banner.
  This content is **human-ratified byte-for-byte** and, by construction, frozen to the
  last attended human action — it cannot go stale in a harmful direction.
- Everything else is not. The `## Latest daily log` section is a **mixed-provenance
  aggregate by construction** (ADR-0032): the dream consolidates transcripts
  containing external `tool_result` content, and the digest / inbox-triage /
  weekly-review routines summarize email into the vault. ADR-0032 wraps it in a
  code-owned `[!untrusted]` fence and states the residual plainly: *"A fence is a
  **soft** boundary."* `## Active projects` is derived from directory names, and the
  banners are state-derived control-plane text.

**The gap ADR-0032 did not consider — stated in its corrected, narrower form.**
Copying the whole digest into the managed block made untrusted-derived, softly-fenced
content a **durable copied artifact** inside a file the user owns, at 0644, outside
`scanPrivateModes`' in-core scope — while the same bytes sat at 0600 in
`state/digest.md`. ADR-0024 separately names the managed block as one of four durable
**secret sinks**. Removing the copy removes that sink and that 0644 exposure.

*Round-2 correction (Codex finding F2, owner: narrow the claim).* An earlier draft
argued the split also moves this content out of the harness's **instruction** channel
into a *data* channel. **It does not.** An `@import` is inlined into Claude Code **user
memory** — the same channel `CLAUDE.md` occupies. The instruction-versus-context
distinction is real (a hook's `additionalContext` genuinely is presented as context)
but it applies **only** to the hook channel, and this WP does not move anything there.
Do not restate the stronger claim anywhere in the implementation, the tests, or the PR
body. The durable-copy and 0644 results are sufficient justification on their own.

**The decision (ADR-0039 §4).** Only content that has passed ADR-0021's
human-ratification gate is ever **copied** into a file the user owns. Everything else
is delivered by reference, or not at all. Concretely:

- **stable digest** — the injected identity notes. Copyable.
- **volatile digest** — the latest daily log (ADR-0032), `## Active projects`, and all
  banners: refusal, identity-exclusion, alerts, transcript quarantine, secret
  quarantine, insecure modes, scheduler, update. Never copied.

**The accepted cost (owner rulings D2 and D3, D3 amended 2026-08-30 by finding F7).**
A Codex session without trusted hooks — and a Cowork session, which skips user-scope
imports resolving outside the session `cwd` — sees the stable half and no *fresh*
volatile content.

Round 1 made **all** volatile content absent there, reasoning that absent is fail-safe
where stale is not. **That reasoning holds for the untrusted-derived daily log and
fails for the banners.** An absent alert or refusal banner is not fail-safe — it is a
fail-loud *regression*, and this entire chain exists because a warning went undelivered
for four weeks. The amended split for the **copied** (Codex) block is therefore:

| Content | Copied into the Codex block? |
|---------|------------------------------|
| stable identity (ADR-0021 hash-gated) | yes |
| code-owned state-derived banners (alerts, refusal, quarantines, scheduler, update, insecure modes) | **yes** — as of the last sync |
| `## Active projects` (enumerated) | no |
| `## Latest daily log` (ADR-0032, untrusted-derived) | **no** |

This keeps Codex's fail-loud at **exactly today's level** — last-sync banners, no
better and no worse — while still keeping every untrusted-derived byte out of a durable
user-owned file. The banners are code-owned, fixed-template control-plane text with no
untrusted bytes (the same rule `formatAlerts` and the quarantine banner already
follow), which is precisely why they are safe to copy when the daily log is not.

## Current state

`renderDigest(vaultDir, layout, opts)` builds `parts[]` in this order — identity
sections (each gated by the ADR-0021 hash check, then the provenance gate, then the
EP4 secret scan), then `## Active projects`, then the fenced `## Latest daily log` —
and assembles. **Read the order carefully: it is `prefix` → identity → projects →
daily.** Round 1 of this spec specified a volatile-then-stable composition, which
contradicts this and would have broken its own E3 byte-identity guarantee; finding F3
corrected it to the three-component form in E11.

```js
const body = `${parts.join('\n\n')}\n`;
...
const prefix = [opts.refusalBanner || '', identityWarn, formatAlerts(opts.alerts || []),
  opts.quarantineLine || '', secretQuarantineWarn, insecureModesWarn,
  opts.schedulerLine || '', opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
const assembled = prefix ? `${prefix}\n\n${body}` : body;
return capDigest(assembled, prefix);
```

(The `refusalBanner` element is added by `WP-refusal-banner-delivery`; if that WP has
not landed, the array starts at `identityWarn` and this WP must not add it.)

`capDigest(assembled, prefix)` enforces both caps with the prefix protected:

```js
const prefixLineCount = prefix ? prefix.split('\n').length + 1 : 0;
const lineBudget = Math.max(0, DigestCaps.MAX_LINES - prefixLineCount);
...
const prefixBytes = Buffer.byteLength(prefixPart, 'utf8');
const bodyByteBudget = Math.max(0, DigestCaps.MAX_BYTES - prefixBytes - markerBytes);
```

```js
const DigestCaps = {
  MAX_LINES: 120,
  MAX_BYTES: 32 * 1024,
  MAX_NOTE_BYTES: 8 * 1024,
  MAX_PROJECTS: 50,
  MAX_DAILY_READ_BYTES: 64 * 1024,
  TRUNCATION_MARKER: '> [wienerdog: digest truncated to fit the session-context cap]',
};
```

Callers: `src/cli/sync.js` and the `regenerateDigest` closure in `src/cli/dream.js`,
each calling `renderDigest` once and writing the result with `writeFilePrivate` to
`state/digest.md` (atomic, 0600). `'digest.md'` is in `A5_PRIVATE_FILE_BASENAMES`.

`src/adapters/claude.js` (after its predecessor WP) writes a block of preamble + one
import of `state/digest.md`. `src/adapters/codex.js` still copies the whole digest.

`tests/golden/digest-default.md` is byte-frozen for the default fixture.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | `renderDigestParts`; `renderDigest` keeps its signature and composes from it |
| modify | src/cli/sync.js | write both files; pass the stable text to the adapters |
| modify | src/cli/dream.js | `regenerateDigest` writes both files |
| modify | src/core/private-fs.js | add **all three** of `'digest-stable.md'`, `'digest-volatile.md'`, `'digest-prefix.md'` to `A5_PRIVATE_FILE_BASENAMES` (E5) |
| modify | tests/unit/private-fs.test.js | **required** — it pins A5 membership by value; the boundary check rejects the PR without it (precedent: `docs/specs/done/WP-attended-alert-acknowledgement.md`) |
| modify | src/adapters/claude.js | import the **volatile** file; inline the stable text (Table E) |
| modify | src/adapters/codex.js | `buildCodexBlock({prefix, stable, pointerLine})` reading `digest-prefix.md` + `digest-stable.md`; E7a order and 24 KiB cap |
| modify | tests/unit/digest.test.js | apportionment, caps, part membership |
| modify | tests/unit/claude-adapter.test.js | block shape |
| modify | tests/unit/codex-adapter.test.js | `buildCodexBlock` order, the 24 KiB cap, the maximum-size fixture |
| modify | tests/golden/claude-adapter/CLAUDE.md | new block shape |
| modify | tests/golden/codex-adapter/AGENTS.md | stable-only content |

**Golden files:** you **DO** have permission to update
`tests/golden/claude-adapter/CLAUDE.md` and `tests/golden/codex-adapter/AGENTS.md`.
`tests/golden/digest-default.md` must **NOT** change — `digest.md` keeps its exact
current content (Table E, E3). If it changes, you have a bug.

### Exact contracts

```js
/** Render the digest's THREE components in one pass. Same inputs as renderDigest,
 *  same gates, same order — refactored out of it, not reimplemented (Table E, E11).
 *  @returns {{prefix: string, stable: string, volatile: string}}
 *  prefix   — the banner block, in its existing urgency order. UNCAPPED here; the
 *             cap is applied by the composing render, which passes it as capDigest's
 *             reserved `prefix` argument.
 *  stable   — the ADR-0021 hash-gated identity sections only.
 *  volatile — `## Active projects` + the fenced `## Latest daily log`.
 *  Any of the three may be ''. */
function renderDigestParts(vaultDir, layout, opts)

/** UNCHANGED SIGNATURE AND UNCHANGED OUTPUT. Composed from renderDigestParts as
 *  prefix + stable + volatile (E11) — today's exact byte order (prefix, identity,
 *  projects, daily), so the frozen golden still matches byte-for-byte. */
function renderDigest(vaultDir, layout, opts)
```

### Table E — the stable/volatile apportionment contract

The single place these facts are decided.

| Row | Fact | Value |
|-----|------|-------|
| E1 | Stable membership | The four injected identity sections (`profile.md`, `preferences.md`, `goals.md`, `instructions.md`) that pass the ADR-0021 hash gate, the provenance gate and the EP4 secret scan. Nothing else, ever |
| E2 | Volatile membership | Every banner in the prefix (refusal, identity-exclusion, alerts, transcript quarantine, secret quarantine, insecure modes, scheduler, update), `## Active projects`, and the fenced `## Latest daily log` |
| E3 | `digest.md` | **Unchanged** — still the full render (`prefix` + `stable` + `volatile`, E11), still `writeFilePrivate` 0600, still byte-identical to today for a given input. `tests/golden/digest-default.md` is frozen |
| E4 | New files | **Three**, all `writeFilePrivate` 0600, all written by the same two callers that write `digest.md`: `<core>/state/digest-stable.md` = the `stable` body alone (no prefix); `<core>/state/digest-volatile.md` = `prefix` + `volatile` body (the banners ride with the volatile half, because they are the part that must stay fresh); `<core>/state/digest-prefix.md` = the `prefix` alone |
| E4a | Why `digest-prefix.md` exists | The Codex compositor (E7) needs the banners **without** the projects list and daily log, and Codex cannot import — so it must read them from a file. Deriving them by parsing `digest-volatile.md` would mean re-implementing the prefix/body boundary in a second place. Writing the prefix once, as its own artifact, keeps `renderDigestParts` the single decider. The prefix bytes therefore appear in both `digest-volatile.md` and `digest-prefix.md`; both are 0600 in-core derived artifacts, so the duplication costs nothing and removes a parser |
| E5 | Privacy | `'digest-stable.md'`, `'digest-volatile.md'` **and** `'digest-prefix.md'` all join `A5_PRIVATE_FILE_BASENAMES`. Adding any of them **requires** updating `tests/unit/private-fs.test.js`, which pins membership by value |
| E6 | Claude block | Preamble + the **stable** text inline + one blank line + **two** import lines: `@<abs path to digest-volatile.md>` then `@<abs path to refusal-banner.md>`. The banner keeps its own import (Table D, D2a) because it must stay fresh precisely when nothing is re-rendering the digest |
| E7 | Codex block | Composed by `buildCodexBlock({prefix, stable, pointerLine})` in `src/adapters/codex.js`, which reads **`digest-prefix.md`** and **`digest-stable.md`** (never `digest-volatile.md`, which carries the projects list and daily log). Order and budget are fixed by E7a. No import line — Codex has none. Amended in round 2 by finding F7 (D3 amended 2026-08-30): making *all* volatile content absent removed Codex's proactive warnings, which is a fail-loud regression, not a fail-safe one |
| E7a | Codex block order and cap | **Order:** preamble, then the banners (`prefix`), then the pointer line, then the **stable** identity truncated into whatever remains, with the standard `DigestCaps.TRUNCATION_MARKER`. **Cap: 24 KiB for the whole composed block.** Codex's `project_doc_max_bytes` default is 32 KiB **combined across documents**, and the user's own `AGENTS.md` content shares that budget — so Wienerdog takes at most three quarters and leaves ~8 KiB for the user. The order is the priority order: a warning the user must see outranks identity they mostly already know, and identity is the only component allowed to truncate |
| E8 | Line cap | `MAX_LINES` 120 applies to **each** rendered file independently. The volatile render reserves its prefix lines exactly as `capDigest` does today; the stable render has no prefix, so its whole budget is body |
| E9 | Byte cap | `MAX_BYTES` 32 KiB applies to **each** rendered file independently, with the same prefix reservation rule as E8 |
| E10 | Truncation marker | Unchanged text, appended independently to whichever half truncates |
| E11 | Composition order | **Three components**: `prefix`, `stable` body (identity), `volatile` body (projects + daily). `renderDigest` = `prefix` + `stable` + `volatile`, which is today's exact byte order (prefix → identity → projects → daily), so E3 holds |
| E12 | Empty halves | Either half may render as `''`. An empty stable half means no identity note passed its gate; an empty volatile half means no banners and no vault activity. Neither is an error, and an empty file is still written (so a stale previous file is never left behind) |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Table E — a review finding updates the table and
every box below in one pass, and any new mirror found in review is registered here:

- [ ] Deliverables-table cells for `digest.js`, both CLI callers, `private-fs.js` and
      both adapters (mirror E4, E5, E6, E7)
- [ ] `renderDigestParts` / `renderDigest` JSDoc in Exact contracts (mirror E1, E2, E11)
- [ ] Acceptance criteria AC-1 … AC-14 (mirror E1 … E12)
- [ ] Verification greps and the frozen-golden diff check (mirror E3)
- [ ] Current-state quotation of `capDigest` and `DigestCaps` (mirrors E8, E9, E10)
- [ ] The Context paragraphs defining stable vs volatile (mirror E1, E2)
- [ ] The golden-file permission note under Deliverables (mirrors E3)

## Contract reference

Activation trigger (ADR-0031): **(i)** `renderDigest` gains a sibling with a new
result shape; **(v)** the renderer decides an apportionment whose lifecycle two
adapters and two CLI callers own — an authority boundary; **(vi)**
`WP-codex-block-pointer-line` inherits it; **(vii)** the apportionment is mirrored in
`digest.js`, both adapters, both goldens and `private-fs.js`. Four of seven — the
discipline is on, and Table E above is the canonical table.

## Implementation notes & constraints

- **E3 is the safety rail for the whole WP.** `renderDigest` must keep its exact
  current output. Refactor by extraction: build the same `parts[]` and the same
  `prefix`, then return them apportioned *and* joined. If
  `tests/golden/digest-default.md` moves by one byte, the refactor is wrong —
  do not update that golden to make it pass.
- **Caps are the subtle part (E8, E9), and there are THREE capped renders, not two.**
  `capDigest(assembled, prefix)` reserves the prefix's lines and bytes so the banner
  prefix can never be squeezed out by the body. With the three-component split (E11)
  the calls are:

  | Output | `assembled` | `prefix` argument |
  |--------|-------------|-------------------|
  | `digest.md` (E3, frozen) | `prefix` + `stable` + `volatile` | `prefix` |
  | `digest-volatile.md` (E4) | `prefix` + `volatile` | `prefix` |
  | `digest-stable.md` (E4) | `stable` | `''` |
  | `digest-prefix.md` (E4) | `prefix` | `''` |

  Never call `capDigest` on a concatenation and then split the result — that apportions
  the budget by accident and silently changes `digest.md`'s bytes, breaking E3.
- **A consequence worth stating: each half gets the full 120-line / 32 KiB budget**, so
  the two files together may exceed what `digest.md` alone would have carried. That is
  intended — they are delivered through different channels and are never concatenated
  into one context by any consumer. `digest.md` itself keeps the single budget (E3).
- **Do not re-order or re-gate anything.** The ADR-0021 hash gate, the WP-114
  provenance gate, the EP4 per-section secret scan, the ADR-0032 fence and bounded
  read, and `MAX_PROJECTS` all stay exactly where they are and run exactly once. This
  is an apportionment change, not a policy change. In particular, do **not** relax the
  secret scan for the stable half on the grounds that it is human-ratified.
- **Write all three files from the same call site**, in both `sync.js` and
  `dream.js`'s `regenerateDigest`, so they can never disagree. Render once with
  `renderDigestParts`, compose `digest.md` from the parts, and write all three.
- **E12 — always write, even when empty.** If a half renders `''` and the file is
  skipped, a previous run's content stays on disk and gets imported into a session as
  though current. Write the empty file.
- **The adapters read the files they need, not the full digest.** After this WP,
  `claude.js` reads `digest-stable.md` for the inline half and points its two imports at
  `digest-volatile.md` and `refusal-banner.md`; `codex.js` reads **`digest-prefix.md`
  and `digest-stable.md`** and composes them through `buildCodexBlock` (E7, E7a). The
  existing "digest not found → skip the block with a notice" precondition applies to
  `digest-stable.md` for both.
- **`buildCodexBlock` is a real compositor, not a concatenation (round-3 R8).** Round 2
  left E7/AC-9 saying the Codex block carries stable identity *plus* banners while the
  Deliverables and notes still said `codex.js` copies `digest-stable.md` only — the
  table and its own mirrors disagreed. Give it an explicit signature, an explicit pair
  of input files, and the E7a order, so there is one answer.
- **The 24 KiB cap is on the FINAL block, after composition (round-3 R9, E7a).** Each
  rendered component already has its own 32 KiB budget (E9), so concatenating three of
  them can exceed Codex's 32 KiB *combined* `project_doc_max_bytes` on its own — before
  the user's `AGENTS.md` content is counted at all. Cap the composed block, and truncate
  **only** the stable identity tail; the banners and the pointer line are never dropped
  to make room.
- When uncertain: choose the simpler option and record it under "Decisions made" in the
  PR body. Do NOT expand scope.

## Security checklist

- [ ] **The whole point is that untrusted-derived content stops being copied into a
      user-owned file.** Verify positively: render a fixture whose daily note contains
      a distinctive token, then grep the produced `CLAUDE.md` **and** `AGENTS.md` for
      that token and find nothing. A test that only checks the stable half is present
      would pass while the bug ships.
- [ ] The stable half must contain **only** sections that passed the ADR-0021 exact-byte
      gate. Assert with a fixture whose `profile.md` bytes differ from the approved
      hash: it must be absent from the stable half and its exclusion banner must appear
      in the **volatile** half (E1, E2).
- [ ] The EP4 secret scan still runs per section on both halves. Assert that a planted
      secret in an approved identity note still omits that section from the stable half
      and still raises the exclusion banner.
- [ ] `digest-stable.md` and `digest-volatile.md` are written with `writeFilePrivate`
      (atomic, 0600) and registered in `A5_PRIVATE_FILE_BASENAMES` (E4, E5). A
      0644 volatile file would reintroduce the confidentiality downgrade this chain
      exists to remove.
- [ ] The volatile import path is built from `paths.state`, absolute, forward-slashed,
      exactly as `WP-managed-block-by-reference` established (Table D, D2–D4).
- [ ] Both new files must be disposed by `wienerdog uninstall` along with the rest of
      `state/`. Confirm no manifest change is needed; if one is, that is a finding for
      the PR body, not a silent addition.

## Acceptance criteria

- [ ] AC-1 — `renderDigest`'s output is byte-identical to before this WP for the default
      fixture; `tests/golden/digest-default.md` is unchanged with no golden update (E3,
      E11).
- [ ] AC-2 — `renderDigestParts` returns three components: `prefix` (banners only),
      `stable` (identity sections only), and `volatile` (`## Active projects` + the
      fenced daily log). `renderDigest` composes them as prefix + stable + volatile
      (E1, E2, E11).
- [ ] AC-3 — An identity note failing the ADR-0021 hash gate is absent from `stable`,
      and its exclusion banner appears in `volatile` (E1, E2).
- [ ] AC-4 — A distinctive token in the fixture's daily note appears in
      `digest-volatile.md` and in **neither** `CLAUDE.md` nor `AGENTS.md`.
- [ ] AC-5 — All **three** new files are written on every `sync` and every `dream`
      `regenerateDigest`, with mode 0600 on POSIX (E4).
- [ ] AC-6 — **All three** of `'digest-stable.md'`, `'digest-volatile.md'` and
      `'digest-prefix.md'` are members of `A5_PRIVATE_FILE_BASENAMES`, pinned by
      `tests/unit/private-fs.test.js` (E5).
- [ ] AC-7 — An empty half still produces a written, empty file (E12).
- [ ] AC-8 — The Claude block is preamble + stable text + **two** import lines, in
      order: `digest-volatile.md` then `refusal-banner.md`; the updated golden matches
      (E6, and Table D rows D2/D2a in `WP-managed-block-by-reference`).
- [ ] AC-9 — The Codex block is produced by `buildCodexBlock({prefix, stable,
      pointerLine})` reading `digest-prefix.md` and `digest-stable.md`, in the E7a order
      — preamble, banners, pointer line, stable identity — with **no** import line and
      **no** projects list or daily log; the updated golden matches (E7, E7a).
- [ ] AC-9a — A fixture with an active alert renders that alert's banner **into** the
      Codex golden (F7: Codex keeps proactive warnings), while the same fixture's daily
      log token appears in neither user-owned file (AC-4).
- [ ] AC-10 — Each half is independently capped at 120 lines and 32 KiB, with the
      volatile half's prefix protected exactly as today (E8, E9).
- [ ] AC-11 — A half that truncates carries the unchanged truncation marker; the other
      half is unaffected (E10).
- [ ] AC-12 — With `digest-stable.md` absent, both adapters skip the block with the
      existing notice and still install hooks and skills.
- [ ] AC-13 — A planted secret in an approved identity note omits that section and
      raises the exclusion banner, exactly as today.
- [ ] AC-14 — Running `wienerdog sync` twice is idempotent (second run: zero changes).
- [ ] AC-15 — **Maximum-size fixture (round-3 R9).** With a `prefix` and a `stable` half
      each near their own 32 KiB budget, the composed Codex block is **≤ 24 KiB**, the
      banners and the pointer line are **fully present**, and only the stable identity is
      truncated — carrying `DigestCaps.TRUNCATION_MARKER` (E7a).
- [ ] AC-16 — `digest-prefix.md` contains the banner prefix alone: no `## Active
      projects`, no `## Latest daily log`, no identity sections (E4, E4a).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern digest
npm test -- --test-name-pattern adapter
npm test
npm run lint
# AC-1/E3 — the digest golden is frozen (expect NO output):
git diff --stat -- tests/golden/digest-default.md
# AC-4 — no daily-log content in either user-owned file (expect NO output):
grep -rn "Latest daily log" tests/golden/claude-adapter tests/golden/codex-adapter
# E5 — all three basenames registered and pinned:
grep -n "digest-stable.md\|digest-volatile.md\|digest-prefix.md" src/core/private-fs.js tests/unit/private-fs.test.js
# E7/E7a — the Codex compositor reads prefix+stable, never the volatile file:
grep -n "buildCodexBlock\|digest-prefix.md\|digest-volatile.md" src/adapters/codex.js
# E6/E7 — two import lines for Claude, none for Codex:
grep -c "^@" tests/golden/claude-adapter/CLAUDE.md   # expect 2
grep -c "^@" tests/golden/codex-adapter/AGENTS.md    # expect 0
# F7 — Codex keeps the state-derived banners but not the daily log:
grep -n "\[!warning\]" tests/golden/codex-adapter/AGENTS.md
```

## Out of scope (do NOT do these)

- The Codex pointer line naming the live digest path — `WP-codex-block-pointer-line`.
- Changing any gate: the ADR-0021 hash registry, the provenance gate, the EP4 secret
  scan, the ADR-0032 fence or bounded read, `MAX_PROJECTS`, or the capability gate on
  daily-summary injection.
- Changing `DigestCaps`' values. Only *where* the caps are applied changes.
- Entry-level daily provenance (ADR-0032's named future WP).
- Removing `digest.md`. It stays, unchanged, as the single full render (E3) — other
  consumers and the SessionStart hook still read it.
- User-facing documentation. Note what needs updating under "Discovered issues";
  `wd-docs` owns those files.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(digest): stable/volatile split (WP-digest-stable-volatile-split)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 findings F2, F3 and F7, plus the wd-reviewer pass on
  PR #174 (owner: ACCEPTED).**
  - **F3 (the one that broke the spec's own guarantee).** Round 1's Table E11 specified
    a **volatile-then-stable** composition. Today's actual render order is
    `prefix` → identity → projects → daily, so E11 contradicted **E3/AC-1** — the
    byte-identity safety rail this WP leans on — inside the same table. An implementer
    following E11 would have produced a `digest.md` that failed its own frozen golden,
    with no way to satisfy both rows. Corrected to a **three-component** render:
    `prefix`, `stable` (identity), `volatile` (projects + daily); `digest.md` =
    prefix + stable + volatile; `digest-volatile.md` = prefix + volatile;
    `digest-stable.md` = stable alone. E3, E4, E11, `renderDigestParts`' return shape,
    AC-2, and the capDigest apportionment note (now an explicit three-row table) all
    updated, and the Current-state excerpt now calls the real order out in words so the
    contradiction cannot recur silently.
  - **F7 (D3 amended 2026-08-30).** Round 1 made *all* volatile content absent on a
    hook-less Codex install, reasoning that absent beats stale. That holds for the
    untrusted-derived daily log and **fails for the banners**: an absent alert is a
    fail-loud regression, which is the exact failure mode this chain exists to fix.
    E7 now copies the stable identity **plus the code-owned state-derived banners** into
    the Codex block; only the daily log and the enumerated projects list are absent.
    Codex keeps fail-loud at today's level — last-sync banners, no better. New AC-9a
    asserts an alert reaches the Codex golden while the daily-log token reaches neither
    user-owned file.
  - **F2.** The motivation section's claim that the split moves content out of the
    harness's *instruction* channel was **false** — an `@import` is inlined into user
    memory, the same channel. Narrowed to what is actually true and sufficient: no
    durable copied bytes, no 0644 exposure, ADR-0024 sink removed. The instruction-vs-
    context distinction is now claimed only for the hook channel.
  - **E5 mirror drift + required test (wd-reviewer note 10).** Table E5 named two new
    A5 basenames while the Deliverables row named only one — a mirror that had already
    drifted from its own canonical table. Both now name both, and
    `tests/unit/private-fs.test.js` is a **required** Deliverable because it pins A5
    membership by value and the boundary check rejects the PR without it.
  - **E6.** The Claude block now carries **two** import lines (volatile digest, refusal
    banner) per the F1 resolution in `WP-managed-block-by-reference`.
- **2026-08-30 — Codex round-2 findings R7, R8, R9 (owner: ACCEPTED).**
  - **R7.** AC-8 still described **one** import line, contradicting round 2's own F1
    resolution (two: volatile digest, then refusal banner). Fixed here and in the Context
    paragraph; the chain-wide grep for `@` lines and `buildReferenceBody(` is in the PR
    body.
  - **R8 — the round-2 F7 fix contradicted its own mirrors.** E7 and AC-9 said the Codex
    block carries stable identity **plus** banners, while the Deliverables row and the
    implementation notes still said `codex.js` copies `digest-stable.md` **only**, and
    the GLOSSARY and ADR-0039 still said volatile banners are absent on Codex. Resolved
    with an explicit compositor: **`buildCodexBlock({prefix, stable, pointerLine})`** in
    `src/adapters/codex.js`, reading **`digest-prefix.md`** and **`digest-stable.md`**.
    That required a **third** rendered file (new **E4**, rationale in **E4a**): the
    compositor needs the banners without the projects list and daily log, and parsing
    them back out of `digest-volatile.md` would re-implement the prefix/body boundary in
    a second place. `A5_PRIVATE_FILE_BASENAMES` gains all three (E5); AC-5, AC-6, AC-9
    and the capDigest table updated; new AC-16.
  - **R9 — the Codex block could exceed Codex's own limit.** Each component carries its
    own 32 KiB budget (E9), so concatenating three of them can pass Codex's 32 KiB
    *combined* `project_doc_max_bytes` before the user's own `AGENTS.md` content is
    counted. New **E7a**: the composed block is capped at **24 KiB** — three quarters of
    the combined budget, leaving ~8 KiB for the user — in the priority order preamble,
    banners, pointer line, stable identity, with only the identity tail allowed to
    truncate and the standard truncation marker applied. New AC-15 is a maximum-size
    fixture asserting the banners survive.
