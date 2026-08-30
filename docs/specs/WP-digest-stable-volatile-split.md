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
block in `~/.claude/CLAUDE.md` holds a fixed preamble plus one `@<abs path>` import
line, and nothing else. Codex, which has **no** include syntax in `AGENTS.md`, still
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

**The gap ADR-0032 did not consider.** A fence's strength depends on the **channel**
the fenced text arrives in. A harness presents `CLAUDE.md` / `AGENTS.md` to the model
as *instructions* — Claude Code's own preamble says those instructions **override**
default behavior — while a SessionStart hook's `additionalContext` is presented as
*context*. Copying the whole digest into the managed block therefore placed
untrusted-derived, softly-fenced content into the **instruction** channel, and into a
durable 0644 file the user owns and may commit to their own git. ADR-0024 separately
names the managed block as one of four durable **secret sinks**.

**The decision (ADR-0039 §4).** Only content that has passed ADR-0021's
human-ratification gate is ever **copied** into a file the user owns. Everything else
is delivered by reference, or not at all. Concretely:

- **stable digest** — the injected identity notes. Copyable.
- **volatile digest** — the latest daily log (ADR-0032), `## Active projects`, and all
  banners: refusal, identity-exclusion, alerts, transcript quarantine, secret
  quarantine, insecure modes, scheduler, update. Never copied.

**The accepted cost (owner rulings D2, D3).** A Codex session without trusted hooks —
and a Cowork session, which skips user-scope imports resolving outside the session
`cwd` — sees the stable half and **no volatile content at all**. Not stale content:
**absent** content. That is the fail-safe direction and it is documented rather than
engineered around.

## Current state

`renderDigest(vaultDir, layout, opts)` builds `parts[]` in this order — identity
sections (each gated by the ADR-0021 hash check, then the provenance gate, then the
EP4 secret scan), then `## Active projects`, then the fenced `## Latest daily log` —
and assembles:

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
| modify | src/core/private-fs.js | add `'digest-stable.md'` to `A5_PRIVATE_FILE_BASENAMES` |
| modify | src/adapters/claude.js | import the **volatile** file; inline the stable text (Table E) |
| modify | src/adapters/codex.js | copy the **stable** text only |
| modify | tests/unit/digest.test.js | apportionment, caps, part membership |
| modify | tests/unit/claude-adapter.test.js | block shape |
| modify | tests/unit/codex-adapter.test.js | stable-only copy |
| modify | tests/golden/claude-adapter/CLAUDE.md | new block shape |
| modify | tests/golden/codex-adapter/AGENTS.md | stable-only content |

**Golden files:** you **DO** have permission to update
`tests/golden/claude-adapter/CLAUDE.md` and `tests/golden/codex-adapter/AGENTS.md`.
`tests/golden/digest-default.md` must **NOT** change — `digest.md` keeps its exact
current content (Table E, E3). If it changes, you have a bug.

### Exact contracts

```js
/** Render the digest's two halves in one pass. Same inputs as renderDigest, same
 *  gates, same order — it is refactored out of it, not reimplemented.
 *  @returns {{stable: string, volatile: string}}
 *  stable   — the ADR-0021 hash-gated identity sections only, capped per Table E.
 *  volatile — the banner prefix, `## Active projects`, and the fenced
 *             `## Latest daily log`, capped per Table E.
 *  Either may be ''. */
function renderDigestParts(vaultDir, layout, opts)

/** UNCHANGED SIGNATURE AND UNCHANGED OUTPUT. Now composed from renderDigestParts:
 *  prefix-and-volatile first, then the stable sections — preserving today's exact
 *  byte order and the frozen golden. */
function renderDigest(vaultDir, layout, opts)
```

### Table E — the stable/volatile apportionment contract

The single place these facts are decided.

| Row | Fact | Value |
|-----|------|-------|
| E1 | Stable membership | The four injected identity sections (`profile.md`, `preferences.md`, `goals.md`, `instructions.md`) that pass the ADR-0021 hash gate, the provenance gate and the EP4 secret scan. Nothing else, ever |
| E2 | Volatile membership | Every banner in the prefix (refusal, identity-exclusion, alerts, transcript quarantine, secret quarantine, insecure modes, scheduler, update), `## Active projects`, and the fenced `## Latest daily log` |
| E3 | `digest.md` | **Unchanged** — still the full render, still `writeFilePrivate` 0600, still byte-identical to today for a given input. `tests/golden/digest-default.md` is frozen |
| E4 | New files | `<core>/state/digest-stable.md` and `<core>/state/digest-volatile.md`, both `writeFilePrivate` 0600, both written by the same two callers that write `digest.md` |
| E5 | Privacy | `'digest-stable.md'` and `'digest-volatile.md'` both join `A5_PRIVATE_FILE_BASENAMES` |
| E6 | Claude block | Preamble + the **stable** text inline + one blank line + `@<abs path to digest-volatile.md>` |
| E7 | Codex block | Preamble + the **stable** text inline. No import line (Codex has none). The pointer line is added by `WP-codex-block-pointer-line` |
| E8 | Line cap | `MAX_LINES` 120 applies to **each** rendered file independently. The volatile render reserves its prefix lines exactly as `capDigest` does today; the stable render has no prefix, so its whole budget is body |
| E9 | Byte cap | `MAX_BYTES` 32 KiB applies to **each** rendered file independently, with the same prefix reservation rule as E8 |
| E10 | Truncation marker | Unchanged text, appended independently to whichever half truncates |
| E11 | Composition order | `renderDigest` = volatile (prefix + its body) then stable body — matching today's byte order exactly, so E3 holds |
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
- **Caps are the subtle part (E8, E9).** `capDigest` today reserves the prefix's lines
  and bytes so the banner prefix can never be squeezed out by the body. Applying it
  twice, once per half, is correct but must not be done by calling `capDigest` on the
  concatenation and then splitting — that would apportion the budget by accident.
  Give each half its own `capDigest(assembled, prefix)` call, with the stable half
  passing `prefix = ''`.
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
  `claude.js` reads `digest-stable.md` for the inline half and points its import at
  `digest-volatile.md`; `codex.js` reads `digest-stable.md` only. The existing
  "digest not found → skip the block with a notice" precondition applies to
  `digest-stable.md` for both.
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
- [ ] AC-2 — `renderDigestParts` returns a `stable` containing only identity sections
      and a `volatile` containing the prefix banners, `## Active projects` and the
      fenced daily log (E1, E2).
- [ ] AC-3 — An identity note failing the ADR-0021 hash gate is absent from `stable`,
      and its exclusion banner appears in `volatile` (E1, E2).
- [ ] AC-4 — A distinctive token in the fixture's daily note appears in
      `digest-volatile.md` and in **neither** `CLAUDE.md` nor `AGENTS.md`.
- [ ] AC-5 — Both new files are written on every `sync` and every `dream`
      `regenerateDigest`, with mode 0600 on POSIX (E4).
- [ ] AC-6 — Both basenames are members of `A5_PRIVATE_FILE_BASENAMES` (E5).
- [ ] AC-7 — An empty half still produces a written, empty file (E12).
- [ ] AC-8 — The Claude block is preamble + stable text + one import line pointing at
      `digest-volatile.md`; the updated golden matches (E6).
- [ ] AC-9 — The Codex block is preamble + stable text with **no** import line; the
      updated golden matches (E7).
- [ ] AC-10 — Each half is independently capped at 120 lines and 32 KiB, with the
      volatile half's prefix protected exactly as today (E8, E9).
- [ ] AC-11 — A half that truncates carries the unchanged truncation marker; the other
      half is unaffected (E10).
- [ ] AC-12 — With `digest-stable.md` absent, both adapters skip the block with the
      existing notice and still install hooks and skills.
- [ ] AC-13 — A planted secret in an approved identity note omits that section and
      raises the exclusion banner, exactly as today.
- [ ] AC-14 — Running `wienerdog sync` twice is idempotent (second run: zero changes).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern digest
npm test -- --test-name-pattern adapter
npm test
npm run lint
# AC-1/E3 — the digest golden is frozen (expect NO output):
git diff --stat -- tests/golden/digest-default.md
# AC-4 — no daily-log content in either user-owned file:
grep -rn "Latest daily log" tests/golden/claude-adapter tests/golden/codex-adapter
# E5 — both basenames registered:
grep -n "digest-stable.md\|digest-volatile.md" src/core/private-fs.js
# E6/E7 — exactly one import line for Claude, none for Codex:
grep -c "^@" tests/golden/claude-adapter/CLAUDE.md   # expect 1
grep -c "^@" tests/golden/codex-adapter/AGENTS.md    # expect 0
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
