---
id: WP-087
title: Rebase skill-invocation indices when a dream extract is byte-budget truncated
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0012, ADR-0020]
branch: wp/087-dream-truncation-index-rebase
---

# WP-087: Rebase skill-invocation indices under byte-budget truncation

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent session **transcripts** into the
markdown **vault**. Before the brain runs, `collectExtracts`
(`src/core/dream/scratch.js`) selects transcripts under a TOTAL input-byte budget
and writes one redacted **extract** JSON per session into the shared scratch dir.
Each Claude extract carries a `skill_invocations` array
(`[{skill, index, resultIndex, errored}]`, added by WP-080), where `index` is the
0-based position of a `Skill` invocation in the extract's `messages` array and
`resultIndex` is the `messages` position of its id-paired `tool_result`.

These indices are **security-load-bearing**. ADR-0020's skill-revision path uses
`invocationWindowTainted(extract, parentSkill)`
(`src/core/dream/validate.js`) to decide whether a session's use of a skill is
"clean" (no EXTERNAL tool result in the invocation's window). It reads
`skill_invocations[].index`/`.resultIndex` **against the extract's `messages`
array**. If those indices do not match the messages actually written, the window
is computed on the wrong messages — an external `tool_result` can fall outside the
window, so an untrusted learning is mis-judged trusted and can authorize a skill
revision (T1 / ADR-0020 bypass).

The **verified defect:** when an extract is too big for its byte share,
`collectExtracts` calls `truncateExtractToFit`, which keeps the **newest** `k`
messages (`msgs.slice(msgs.length - k)`, dropping the oldest `msgs.length - k`)
but **spreads the original extract** — so `skill_invocations` keeps its original,
now-stale `index`/`resultIndex`. The truncated extract is written to scratch,
reloaded, and fed to `invocationWindowTainted` with indices that no longer point
at the right messages. WP-080 already solved the identical problem for the
per-message **count cap** (`src/core/transcripts/index.js` `parse()` rebases via
the exported `rebaseInvocations`); the WP-048 **byte-budget** truncation path never
got the same treatment. This WP applies the existing, exported helper here.

**Product invariants that bound this WP:** Wienerdog is just files (ADR-0004) —
pure parsing/selection code a short-lived job runs. The transcript is untrusted
data; indices are mechanical positions, not instructions.

## Current state

`src/core/dream/scratch.js` already `require`s the transcripts module:
`const transcripts = require('../transcripts');`. `truncateExtractToFit(extract,
targetBytes)` (lines ~34–51) binary-searches the largest newest-message suffix
that fits, building candidates with:

```js
function truncateExtractToFit(extract, targetBytes) {
  const msgs = extract.messages;
  const build = (k) => {
    const keptMsgs = k === 0 ? [] : msgs.slice(msgs.length - k);
    return { ...extract, truncated: true, started: keptMsgs.length ? keptMsgs[0].ts : null, messages: keptMsgs };
  };
  // …binary search over k, returns build(best)…
}
```

`{ ...extract }` copies `skill_invocations` verbatim — the bug. The kept messages
are the newest suffix, so exactly `dropped = msgs.length - k` **leading** messages
are removed — the same "front-truncation" shape WP-080's helper handles.

`src/core/transcripts/index.js` exports (verbatim, lines ~90–102, 146):

```js
function rebaseInvocations(invocations, dropped) {
  return invocations
    .map((si) => ({ ...si, index: si.index - dropped, resultIndex: si.resultIndex == null ? null : si.resultIndex - dropped }))
    .filter((si) => si.index >= 0 && (si.resultIndex === null || si.resultIndex >= 0));
}
module.exports = { discover, parse, redact, rebaseInvocations, MAX_MSG_CHARS, MAX_MESSAGES };
```

`rebaseInvocations` on its own subtracts `dropped` and filters ONLY the lower
bound (`index >= 0 && (resultIndex === null || resultIndex >= 0)`). It does **not**
apply the upper-bound filter — that is applied SEPARATELY at
`transcripts/index.js:135-136` on the count-cap path. **The right-edge case is
therefore real here:** the parser can emit a trailing `Skill` invocation whose raw
`index === extract.messages.length` (a tool_use with no later emitted message). An
extract that did NOT hit the message-count cap in `parse()` carries that raw
invocation unfiltered (parse only rebases/filters when the count cap fires; other-
wise `...raw` passes the array through verbatim). Byte-truncation then keeps `k`
newest messages, and that trailing invocation rebases to `index = k = keptMsgs.length`
— exactly ONE past the last valid position (valid indices are `0 … k-1`). Because
`rebaseInvocations` only checks `>= 0`, that out-of-range `k` **survives**. So the
byte-truncation path must ALSO apply the same upper-bound filter the count-cap path
uses (`index < keptMsgs.length` and, for a non-null result, `resultIndex <
keptMsgs.length`) — rebasing alone is insufficient.

`invocationWindowTainted` (`validate.js` lines ~442–459) is the consumer; it is
NOT modified by this WP — it already reads the indices correctly, it just needs
correct indices in the extract it is given.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | in `truncateExtractToFit`'s `build(k)`, rebase `skill_invocations` by the dropped-leading count using `transcripts.rebaseInvocations` |
| modify | tests/unit/dream-collect.test.js | tests: (a) a truncated extract's `skill_invocations` are rebased to the kept suffix (fallen-off invocations dropped; survivors' `index`/`resultIndex` in range); (b) a trailing invocation at `index === messages.length` is dropped by the upper-bound filter after byte truncation; (c) a combined case that first triggers the `MAX_MESSAGES` count cap in `parse()` and THEN byte truncation still leaves every index/resultIndex in range and paired |

### Exact contracts

Rebase inside `build(k)` so both the byte-size measurement (during the binary
search) and the returned extract carry the correct, rebased array:

```js
function truncateExtractToFit(extract, targetBytes) {
  const msgs = extract.messages;
  const build = (k) => {
    const keptMsgs = k === 0 ? [] : msgs.slice(msgs.length - k);
    const dropped = msgs.length - keptMsgs.length; // leading messages removed
    const out = { ...extract, truncated: true, started: keptMsgs.length ? keptMsgs[0].ts : null, messages: keptMsgs };
    if (Array.isArray(extract.skill_invocations)) {
      // Front-truncation: subtract the dropped-leading count from index/resultIndex
      // and drop any invocation whose window fell into the removed prefix. Same
      // helper WP-080 uses under the message COUNT cap — keeping the two truncation
      // paths consistent so security-load-bearing indices always match `messages`.
      // Then apply the SAME right-edge (upper-bound) filter the count-cap path uses
      // at transcripts/index.js:135-136: a trailing invocation whose raw index ===
      // messages.length rebases to keptMsgs.length (one past the end) and must be
      // dropped — rebaseInvocations only checks the lower bound (>= 0).
      out.skill_invocations = transcripts
        .rebaseInvocations(extract.skill_invocations, dropped)
        .filter(
          (si) => si.index < keptMsgs.length && (si.resultIndex === null || si.resultIndex < keptMsgs.length),
        );
    }
    return out;
  };
  // …unchanged binary search…
}
```

Notes on correctness:
- The `.filter(...)` upper bound is not optional: without it a trailing invocation
  (raw `index === messages.length`) rebases to `keptMsgs.length` and would be
  written to scratch pointing one past the last message, exactly the mis-index this
  WP exists to prevent. The lower bound (`>= 0`) is already applied inside
  `rebaseInvocations`; this filter adds the matching upper bound.
- Rebasing inside `build` (not only on the final result) keeps the byte-budget
  accounting honest: a truncated extract that dropped some invocations serializes
  slightly smaller, and the search measures the exact bytes that will be written.
- Codex extracts have no `skill_invocations` key → the `Array.isArray` guard skips
  them (unchanged).
- A non-truncated (whole-fit) extract never enters `truncateExtractToFit`, so its
  invocations are untouched.

Worked example (a session with 6 messages, invocations at `index/resultIndex` 2/2
and 4/4; truncation keeps the newest 3 messages, `dropped = 3`): the first
invocation (2/2) falls into the dropped prefix and is removed; the second (4/4)
rebases to `index 1 / resultIndex 1`, still pointing at the same `tool_result`
message now at position 1 of the 3-message suffix.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Reuse the **already-exported** `transcripts.rebaseInvocations` — do NOT
  reimplement the rebase in `scratch.js`, and do NOT change the helper. The
  upper-bound `.filter(...)` is applied at the `scratch.js` call site (mirroring
  `transcripts/index.js:135-136`), keeping the helper unchanged.
- Do not touch `invocationWindowTainted`, `validate.js`, the water-filling budget
  loop, watermark advancement, or the scratch-write/read paths — only
  `truncateExtractToFit`'s per-candidate object construction.
- Keep the change surgical: no refactor of the binary search or the size loop.

## Security checklist

- [ ] After byte-budget truncation, every `skill_invocations[].index` and
      `.resultIndex` refers to the exact `messages` array written to scratch (the
      dropped-leading count is subtracted; invocations whose window fell into the
      removed prefix are dropped) — so `invocationWindowTainted` can never compute a
      window over the wrong messages and mis-classify an untrusted learning as
      trusted (ADR-0020 revision gate).
- [ ] The byte-budget path reuses the exact WP-080 `rebaseInvocations` helper AND
      the same upper-bound filter (`index < keptMsgs.length`, `resultIndex <
      keptMsgs.length`) the count-cap path applies at `transcripts/index.js:135-136`,
      so both truncation paths enforce the identical lower- AND upper-bound invariant
      and can never leave an out-of-range index in scratch.

## Acceptance criteria

- [ ] A truncated Claude extract's `skill_invocations` are rebased: invocations in
      the dropped prefix are removed; survivors have `index`/`resultIndex` shifted by
      the dropped count and in range for the kept suffix (each `resultIndex` still
      lands on its original paired `tool_result` message).
- [ ] A trailing invocation whose (un-count-capped) raw `index === messages.length`
      is DROPPED by the upper-bound filter after byte truncation (it does not survive
      as `index === keptMsgs.length`).
- [ ] A combined case that first hits the `MAX_MESSAGES` count cap in `parse()` and
      then byte truncation in `truncateExtractToFit` leaves every retained
      `index`/`resultIndex` strictly `< keptMsgs.length` and still pointing at its
      paired message (indices rebased once at each stage, never out of range).
- [ ] A Codex extract (no `skill_invocations`) is unaffected; a whole-fit extract is
      unaffected.
- [ ] `invocationWindowTainted` computed on a rebased truncated extract sees the
      external tool result inside the window (proved by a test extract where, before
      the fix, the stale index would have excluded it).
- [ ] `collectExtracts`'s existing behavior (which sessions are kept/dropped, the
      watermark, the scratch files) is otherwise unchanged.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "collect|dream"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `invocationWindowTainted` / `validate.js` / the ledger or revision
  gates (WP-081/082/084 territory).
- The "truncated session is watermarked as fully consumed" behavior (dream #7) —
  that is by design under ADR-0012 (parts 4–5, WP-048) and is not a defect this WP
  addresses.
- Codex provenance-role defaulting (dream #6) — separate, pending a schema check.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/087-dream-truncation-index-rebase`; conventional commits; PR titled
   `fix(dream): rebase skill-invocation indices under byte-budget truncation (WP-087)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
