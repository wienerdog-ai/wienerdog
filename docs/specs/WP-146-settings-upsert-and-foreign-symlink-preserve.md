---
id: WP-146
title: Upsert the recorded hook command set on every sync, and preserve a foreign namespaced symlink instead of clobbering it
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/146-settings-upsert-and-foreign-symlink-preserve
---

# WP-146: Settings-command upsert + foreign-symlink preservation (audit A13)

## Context (read this, nothing else)

`wienerdog sync` is the idempotent "compiler pass" that installs Wienerdog's hook
commands and skill links into each detected AI-CLI harness (Claude Code, Codex
CLI). It records what it created in the install manifest so `uninstall` can
reverse exactly that. **IRON RULE (ADR-0004): Wienerdog is just files** — sync
must never clobber a user's own files, and uninstall must remove the *current*
Wienerdog artifacts, not a stale first-version snapshot.

The shared adapter helpers live in `src/adapters/shared.js`. This WP fixes two
lower-severity audit findings (**A13**) that both live there:

1. **Settings command upsert.** `applySettings` merges Wienerdog's hook commands
   into a harness JSON settings file and records a `settings-entry` manifest
   entry carrying the exact `commands` array uninstall will later remove. But it
   records via `recordOnce`, which **no-ops when a `settings-entry` for that path
   already exists**. So if a later Wienerdog version changes the hook command set
   (adds a hook, changes a script path), the manifest still holds the FIRST
   version's `commands`; `uninstall` then removes only the old command and leaves
   the *current* hook behind. Fix: upsert the recorded `commands` on every apply
   (mirroring how `recordCopiedSkill` refreshes a copied skill's `hash`).

2. **Foreign namespaced symlink.** `applySkillLinks` registers each core skill as
   a `wienerdog-*` symlink under the harness skills dir. When it finds an existing
   **symlink** at that path whose target is NOT our expected source, it currently
   `unlinkSync`s it and recreates our link — **silently clobbering** a symlink the
   user (or another tool) placed there in the `wienerdog-*` namespace. Fix:
   preserve/report a symlink whose target is not a known Wienerdog source instead
   of clobbering it.

## Current state

`src/adapters/shared.js`, `applySettings(settingsPath, events, dryRun, manifest, out)`
ends with:
```js
recordOnce(manifest, {
  kind: 'settings-entry',
  path: settingsPath,
  createdFile,
  commands: events.map(([, c]) => shellQuoteCommand(c)),
});
```
where `recordOnce(manifest, entry)` does nothing if an entry with the same
`kind`+`path` already exists (so `commands`/`createdFile` are never refreshed on a
re-sync). The reverser `reverseSettingsEntry` in `manifest.js` reads
`entry.commands` to know which hook commands to strip — so a stale `commands`
array means uninstall strips the wrong (old) set.

An existing upsert pattern to mirror (same file):
```js
function recordCopiedSkill(manifest, linkPath, hash) {
  const existing = manifest.entries.find((e) => e.kind === 'copied-skill' && e.path === linkPath);
  const entry = existing || { kind: 'copied-skill', path: linkPath };
  if (typeof hash === 'string') entry.hash = hash; else delete entry.hash;
  if (!existing) manifest.entries.push(entry);
}
```

`applySkillLinks(...)`, the existing-symlink branch:
```js
if (stat !== null && stat.isSymbolicLink()) {
  let currentTarget = null;
  try { currentTarget = fs.readlinkSync(linkPath); } catch { currentTarget = null; }
  if (currentTarget === target) {
    out.unchanged.push(linkPath);
    recordOnce(manifest, { kind: 'symlink', path: linkPath });
  } else {
    if (!dryRun) { fs.unlinkSync(linkPath); symlink(target, linkPath); }   // ← silent clobber
    recordOnce(manifest, { kind: 'symlink', path: linkPath });
    out.changed.push(linkPath);
  }
}
```
Here `target = path.join(skillsDir, name)` is the ONE known Wienerdog source for
this `name` (the core skills dir). The `else` branch fires for any other target,
including a user's foreign symlink. Note the loop already only iterates
`wienerdog-*` names, and other branches already handle a real directory
(fingerprint-gated) and a real file (`left user file untouched` notice) safely —
this WP only tightens the symlink `else`.

`out` is `{changed:string[], unchanged:string[], notices:string[]}`. A `notices`
entry is the established "we left something alone" channel (see the existing
`left user file untouched:` and `left skill directory untouched` notices).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | Add `recordSettingsEntry` upsert (or inline upsert in `applySettings`); tighten the `applySkillLinks` symlink `else` branch to preserve a foreign target. |
| modify | tests/unit/claude-adapter.test.js | Add the settings-upsert case (re-apply with a changed command set → manifest `commands` reflects the NEW set). |
| modify | tests/unit/shared-skill-links.test.js | Add the foreign-symlink-preserve case. |

### Exact contracts

**1. Settings-entry upsert.** Replace the closing `recordOnce({kind:'settings-entry',…})`
in `applySettings` with an upsert that refreshes `commands` AND `createdFile` on an
existing entry (create if absent). Behavior:
```js
// Upsert: refresh commands + createdFile so uninstall always removes the CURRENT
// hook set, not the first version recorded (audit A13).
function recordSettingsEntry(manifest, settingsPath, createdFile, commands) {
  if (!manifest) return;
  if (!Array.isArray(manifest.entries)) manifest.entries = [];
  const existing = manifest.entries.find((e) => e.kind === 'settings-entry' && e.path === settingsPath);
  const entry = existing || { kind: 'settings-entry', path: settingsPath };
  entry.createdFile = createdFile;
  entry.commands = commands;
  if (!existing) manifest.entries.push(entry);
}
```
Call it as `recordSettingsEntry(manifest, settingsPath, createdFile, events.map(([, c]) => shellQuoteCommand(c)))`.
- **`createdFile` semantics on re-apply:** an existing entry keeps the ORIGINAL
  `createdFile` truth (did WE create the file?). On the very first apply
  `createdFile` reflects reality; a later re-sync sees the file present so its
  local `createdFile` is `false`. To avoid flipping a genuine `createdFile:true`
  to `false` on re-sync, **only overwrite `createdFile` when there is no existing
  entry, OR when the existing value is not already `true`**. Concretely: set
  `entry.createdFile = existing ? (existing.createdFile === true ? true : createdFile) : createdFile`.
  (Record this decision in the PR "Decisions made".) `commands` is always refreshed.

**2. Foreign-symlink preservation.** In `applySkillLinks`, change the symlink
`else` branch (current target ≠ our `target`) so it does NOT unlink/recreate.
Instead:
```js
} else {
  // A wienerdog-* symlink whose target is NOT our core skill source — a user's
  // own link, or a stale one from another install root. Never silently clobber
  // it (audit A13): report and leave it exactly as found. Do NOT record a
  // manifest symlink entry for it (we do not own it).
  out.notices.push(
    `left foreign symlink untouched (points at ${currentTarget || 'an unreadable target'}, not the Wienerdog skill source): ${linkPath}`
  );
}
```
- The "known Wienerdog source" for this iteration is exactly `target`
  (`path.join(skillsDir, name)`). Equality already routes the good case to the
  `if (currentTarget === target)` branch above, so the `else` is by definition a
  foreign target.
- Do not add a manifest entry in this branch (uninstall must not later remove a
  link we did not create).
- The dry-run path must behave the same (no write either way; still push the
  notice so `--dry-run` discloses it).

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Additive export only if you extract `recordSettingsEntry` (append to
  `module.exports`); existing exports unchanged.
- Idempotence must hold: a re-sync with an UNCHANGED command set must still report
  the `settings-entry` as unchanged and produce a byte-identical manifest entry
  (the upsert writes the same `commands`); a re-sync with a CHANGED set updates
  `commands` in place without duplicating the entry.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The upsert only ever refreshes `commands`/`createdFile` for the SAME
      `kind`+`path`; it never widens the removal set to a path Wienerdog did not
      write.
- [ ] A foreign `wienerdog-*` symlink is preserved and reported, never unlinked;
      no manifest entry is recorded for it (so uninstall never removes it).

## Acceptance criteria

- [ ] Apply settings with `[['SessionStart',A]]`, then re-apply with
      `[['SessionStart',A],['Stop',B]]`: the single `settings-entry` for that path
      has `commands` equal to the quoted `[A,B]` (the NEW set), not `[A]`, and is
      not duplicated.
- [ ] A genuine `createdFile:true` recorded on first apply stays `true` after a
      re-sync where the file now exists.
- [ ] `applySkillLinks` finds a pre-existing `wienerdog-foo` symlink pointing at
      `/somewhere/else`: it is left byte-identical (still points at
      `/somewhere/else`), a `left foreign symlink untouched` notice is emitted,
      and no `symlink` manifest entry is recorded for it.
- [ ] A `wienerdog-foo` symlink already pointing at our core source is still
      reported unchanged and recorded (unchanged behavior).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "adapter|skill-links|settings"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The managed-block separator round-trip bug — **WP-147** (also touches
  `shared.js`; it depends on THIS WP to avoid a merge collision).
- Any change to `manifest.js` reversers (`reverseSettingsEntry` already reads
  `entry.commands` correctly).
- The sentinel-ambiguity isolation in the adapters — **WP-148**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/146-settings-upsert-and-foreign-symlink-preserve`; conventional commits;
   PR titled `fix(sync): upsert recorded hook commands + preserve foreign wienerdog-* symlinks (WP-146)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
