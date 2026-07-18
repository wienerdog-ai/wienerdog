---
id: WP-153
title: Make the manifest symlink reverser target-aware so uninstall never deletes a user's replacement link
status: Draft
model: opus
size: S
depends_on: [WP-144]
adrs: [ADR-0004]
branch: wp/153-target-aware-symlink-reverser
---

# WP-153: Target-aware symlink reverser (audit A13 follow-up — Codex-found)

## Context (read this, nothing else)

`wienerdog uninstall` reverses each install-manifest entry. For a
`{kind:'symlink', path}` entry, `reverseSymlink` in `src/core/manifest.js`
currently unlinks **whatever symlink now sits at `path`**, checking only that
the path is *still a symlink* — never that it still points at a Wienerdog
source. **IRON RULE (ADR-0004): Wienerdog is just files** — uninstall must
remove only what Wienerdog created, and **never delete a user's file**.

Audit finding **A13** (foreign-symlink preservation, WP-146) fixed the SYNC
side: `applySkillLinks` now preserves a `wienerdog-*` symlink whose target is
not our core skill source, and drops the stale ownership entry when it observes
the replacement. But that drop only happens on a **re-sync**. The uninstall
side is still target-blind, so two paths remain where a user's replacement link
is deleted:

1. **Direct uninstall (no healing re-sync).** We created the link (manifest has
   the entry); the user replaces it with their own `wienerdog-*` symlink; they
   uninstall without ever re-running sync. `reverseSymlink` sees a symlink at
   the recorded path and unlinks the user's link.
2. **Re-sync that fails before `manifest.save`.** The in-memory drop never
   persists, so the stale entry survives to uninstall.

This was found by the WP-146 Codex adversarial review. `reverseCopiedSkill`
already models the correct defense for the directory case (lstat + `hashDir`
ownership proof); the symlink reverser needs the analogous check.

## Current state

`src/core/manifest.js`, `reverseSymlink`:
```js
function reverseSymlink(entry, dryRun, removed, skipped, removedSet) {
  if (!isSymlink(entry.path)) {
    skipped.push(entry.path);
    return;
  }
  if (!dryRun) fs.unlinkSync(entry.path);   // ← deletes ANY symlink here, foreign or ours
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```
Symlink entries are written by `applySkillLinks` in `src/adapters/shared.js`
(three sites) as `recordOnce(manifest, { kind: 'symlink', path: linkPath })` —
**no recorded target**. So existing installs have target-less entries; the fix
must treat those as *legacy/unverifiable* (preserve, do not delete) rather than
break their uninstall.

**Interaction with WP-144 (A8):** WP-144 hardens the manifest reversers but is
scoped NOT to change existing ownership proofs and defines the symlink entry as
`{path}` only. This WP adds the `target` field and the target-match check — so
it must land AFTER WP-144 and its schema must accept the new optional `target`
key. Coordinate the schema addition with WP-144's per-kind schema.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | Record the expected `target` on each `{kind:'symlink'}` entry we create (all three `applySkillLinks` sites). |
| modify | src/core/manifest.js | `reverseSymlink`: unlink only when the current link target resolves to the recorded `target`; a target-less (legacy) entry or a mismatch is preserved + skipped. Extend the symlink schema (coordinate with WP-144) to allow the optional `target`. |
| modify | tests/unit/manifest*.test.js | Direct-uninstall-without-resync: a user's replacement link survives; our own unchanged link is still removed; a legacy target-less entry is preserved. |
| modify | tests/unit/shared-skill-links.test.js | Assert the recorded symlink entry now carries the expected `target`. |

### Exact contracts (proposed — owner to ratify at walkthrough)

- On create: `recordOnce(manifest, { kind: 'symlink', path: linkPath, target })`
  where `target = path.join(skillsDir, name)` (the core source we point at).
- `reverseSymlink`: after the `isSymlink` guard, read the current link target;
  unlink ONLY when it resolves-equal to `entry.target`. When `entry.target` is
  absent (legacy) OR the current target differs, **skip** (preserve) and record
  it as skipped — never unlink. Use realpath-aware equality like the other
  reversers (`sameResolvedDir`), with a lexical fallback.
- Reuse WP-146's `dropOwnedEntry` posture: sync still drops the stale entry on
  observation; this WP makes uninstall safe even when that never happened.

## Security checklist

- [ ] A user's replacement `wienerdog-*` symlink survives a DIRECT uninstall
      (no intervening sync) and a re-sync-that-failed-before-save.
- [ ] Our own unmodified link is still removed on uninstall (no regression).
- [ ] A legacy target-less symlink entry is preserved, not deleted (no uninstall
      breakage for installs created before this WP).

## Acceptance criteria

- [ ] New tests reproduce the direct-uninstall data-loss path against the OLD
      reverser and prove it is closed by the new one.
- [ ] `npm test` and `npm run lint` green.

## Out of scope

- The SYNC-side preserve + `dropOwnedEntry` (already shipped in WP-146).
- Any other reverser (`reverseCopiedSkill` already has its ownership proof).

## Definition of done

1. Verification output pasted into the PR.
2. Branch `wp/153-target-aware-symlink-reverser`; conventional commits.
3. Spec `status:` → `In-Review` in the same PR.

> **Provenance:** raised by the Codex adversarial review of the A13 batch
> (Gyula side, 2026-07-18) as the complete fix for the WP-146 F1 residual.
> **Needs an owner walkthrough** before Ready (schema coordination with WP-144,
> legacy-entry policy). Draft only.
