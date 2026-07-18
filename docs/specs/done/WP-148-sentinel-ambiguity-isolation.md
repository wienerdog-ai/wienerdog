---
id: WP-148
title: An ambiguous managed block must not abort the independent skill and hook reconciliation
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/148-sentinel-ambiguity-isolation
---

# WP-148: Sentinel-failure isolation in the harness adapters (audit A13)

## Context (read this, nothing else)

`wienerdog sync` applies a per-harness adapter that does three INDEPENDENT
things: (1) writes the digest into a sentinel-delimited **managed block** inside
`CLAUDE.md` / `AGENTS.md`, (2) installs hook scripts + registers hook commands in
the harness settings file, (3) registers skill symlinks. Steps 2 and 3 carry no
user knowledge and must ALWAYS run — the adapter JSDoc explicitly states
"Steps 2-3 carry no user knowledge and ALWAYS run; only Step 1 is gated on a
vault/digest." **IRON RULE (ADR-0004): Wienerdog is just files** — a problem with
one file must not block Wienerdog from correctly maintaining the others.

Audit finding **A13** (sentinel failure isolation): when the managed block's
sentinels are **ambiguous** (duplicated, mismatched, or only one of the pair —
e.g. the user hand-edited `CLAUDE.md` and left a stray marker),
`shared.applyManagedBlock` **throws** `WienerdogError("ambiguous wienerdog
managed-block markers …")`. That throw propagates out of the adapter and aborts
the whole `sync` — including the provably-safe hook and skill reconciliation that
has nothing to do with the ambiguous markdown file. The fix: catch the
ambiguity at the adapter's Step 1, surface it as a NOTICE, and continue with
Steps 2 and 3.

## Current state

`src/adapters/shared.js`, `applyManagedBlock(mdPath, digest, dryRun, manifest, out)`
calls `locateManagedBlock(current, mdPath)` which throws `WienerdogError` on
ambiguous markers. That is the ONLY expected/handled error class from Step 1
(a missing file is already caught and treated as "create").

`src/adapters/claude.js`, `applyClaudeAdapter(...)`, Step 1:
```js
if (!skipManagedBlock) {
  let digest = null;
  try { digest = fs.readFileSync(digestPath, 'utf8'); } catch { digest = null; }
  if (digest !== null) {
    shared.applyManagedBlock(claudeMd, digest, dryRun, manifest, out);   // ← throws on ambiguity → aborts sync
  } else {
    out.notices.push(`digest not found at ${digestPath}; managed block skipped (hooks + skills still installed)`);
  }
}
// Step 2 (hooks) + Step 3 (skills) follow — never reached if Step 1 threw.
```
`src/adapters/codex.js`, `applyCodexAdapter(...)`, Step 1 is the same shape
(`shared.applyManagedBlock(agentsMd, …)` plus an `AGENTS.override.md` notice).
`out` is `{changed, unchanged, notices}`; `notices` is the established
"we-left-something-alone / user-action-needed" channel.

`WienerdogError` is exported from `src/core/errors.js` (already required by
`shared.js`; the adapters can require it too).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/claude.js | Wrap the Step 1 `applyManagedBlock` call in a try/catch that converts a `WienerdogError` (ambiguous markers) into an `out.notices` entry and continues to Steps 2-3. |
| modify | src/adapters/codex.js | Same isolation for the AGENTS.md managed-block step (keep the existing override notice behavior). |
| modify | tests/unit/claude-adapter.test.js | Assert an ambiguous CLAUDE.md yields a notice AND still installs hooks + skills, and does not throw. |
| modify | tests/unit/codex-adapter.test.js | Same assertion for AGENTS.md. |

### Exact contracts

In BOTH adapters, replace the direct Step 1 call with:
```js
if (digest !== null) {
  try {
    shared.applyManagedBlock(<mdPath>, digest, dryRun, manifest, out);
  } catch (err) {
    if (err instanceof WienerdogError) {
      // Ambiguous / hand-broken sentinels in the user's markdown. Do NOT abort the
      // whole sync — the hook + skill reconciliation below is independent and
      // provably safe. Surface the problem and continue (audit A13).
      out.notices.push(
        `managed block not updated in <mdPath> — ${err.message}; hooks + skills still installed. Resolve the markers by hand, then re-run 'wienerdog sync'.`
      );
    } else {
      throw err; // a non-ambiguity error (e.g. an unexpected I/O fault) is NOT swallowed
    }
  }
  // (Codex only) keep the existing AGENTS.override.md existence notice AFTER this block.
}
```
- Add `const { WienerdogError } = require('../core/errors');` at the top of each
  adapter (claude.js / codex.js) if not already present.
- Only `WienerdogError` (the ambiguity signal) is converted to a notice. Any other
  thrown error is re-thrown unchanged — this WP narrows the blast radius of the
  KNOWN, expected ambiguity error only; it does not blanket-swallow Step 1.
- `dryRun` behavior is unchanged (the ambiguity throw fires in dry-run too, since
  `locateManagedBlock` runs before any write; the catch handles both).
- Steps 2 (hooks) and 3 (skills) already run after Step 1 in both adapters — no
  change beyond ensuring they are now reached.

**Owner walkthrough (2026-07-18): Ready.** Mechanical, no open fork. The owner
ratified converting ONLY the known `WienerdogError` (ambiguity signal) into a
notice and re-throwing any other error unchanged (no blanket-swallow), for both
the Claude and Codex adapters. Independent (touches only the adapters — no
manifest.js/shared.js), so no A8/A13 dependency.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Do NOT change `shared.applyManagedBlock` or `locateManagedBlock` — the throw
  stays the contract; only the adapter's handling of it changes. (This keeps the
  fix out of `shared.js`, so it never collides with WP-146/WP-147.)
- The Codex override notice (`AGENTS.override.md exists …`) currently runs only
  after a SUCCESSFUL `applyManagedBlock`; keep that ordering (it need not fire
  when the block could not be updated — record the choice in the PR).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Only `WienerdogError` from Step 1 is converted to a notice; every other
      error still propagates (no silent-swallow of unexpected faults).
- [ ] Hook + skill reconciliation is unchanged and now always runs even when the
      managed-block markers are ambiguous.

## Acceptance criteria

- [ ] `applyClaudeAdapter` on a `CLAUDE.md` containing two BEGIN sentinels does
      NOT throw, pushes a `managed block not updated … ambiguous …` notice, and
      still records/installs the hook scripts, settings entry, and skill links.
- [ ] `applyCodexAdapter` behaves the same for an ambiguous `AGENTS.md`.
- [ ] A clean `CLAUDE.md` / `AGENTS.md` still updates the managed block exactly as
      before (no behavior change on the happy path).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "adapter"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Auto-repairing ambiguous sentinels — the safe policy is to leave them for the
  user; this WP only stops them from aborting the rest of sync.
- Any change to `shared.js` or `manifest.js` (managed-block WPs are WP-146/WP-147).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/148-sentinel-ambiguity-isolation`; conventional commits;
   PR titled `fix(sync): isolate ambiguous managed-block markers from hook/skill reconciliation (WP-148)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
