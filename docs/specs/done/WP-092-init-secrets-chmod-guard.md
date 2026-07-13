---
id: WP-092
title: init only chmods the secrets dir it created — never a pre-existing user path
status: Done
model: sonnet
size: S
depends_on: []
adrs: []
branch: wp/092-init-secrets-chmod-guard
---

# WP-092: init secrets-dir chmod guard

## Context (read this, nothing else)

`wienerdog init` creates the core directory layout under `~/.wienerdog/`,
including `secrets/` (which later holds Google OAuth tokens and must be mode
`0700`). Wienerdog's install invariant (THREAT-MODEL T5, ADR-0019) is that the
installer records and only touches what it creates, and every mutation is
reversible.

The **verified defect (installer #15, robustness/ownership):** after the
directory-creation loop, `init` runs `fs.chmodSync(paths.secrets, 0o700)`
**unconditionally** — even when `secrets/` already existed before this install
(the loop skipped creating it because `dirExists` was true). If a user (or a
symlink) already occupies `$WIENERDOG_HOME/secrets`, `init` changes the mode of a
path it did not create and records no reversible permission change. The chmod
should apply only to a `secrets/` directory `init` created **this run**.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
`init` is synchronous filesystem code. Touch only what you create.

## Current state

`src/cli/init.js` (lines ~124–133):

```js
const manifest = manifestLib.load(paths);

for (const d of dirs) {
  if (!dirExists(d)) {
    fs.mkdirSync(d, { recursive: true, mode: d === paths.secrets ? 0o700 : undefined });
    manifestLib.record(manifest, { kind: 'dir', path: d });
  }
}
// Enforce 0700 on secrets even if umask reduced the create-time mode.
fs.chmodSync(paths.secrets, 0o700);   // ← runs even when secrets/ pre-existed
```

`dirExists(d)` returns true for an existing directory (and follows symlinks). The
loop records a `{kind:'dir'}` manifest entry ONLY for directories it creates. The
`chmodSync` exists to defeat a restrictive umask on the freshly-created dir, which
is only relevant when `init` actually created it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/init.js | chmod `secrets/` to 0700 ONLY when init created it this run |
| modify | tests/unit/init.test.js | test: a pre-existing `secrets/` with a different mode is NOT chmod'd; a freshly-created one IS 0700 |

### Exact contracts

Track whether `secrets/` was created this run and gate the chmod on it:

```js
let createdSecrets = false;
for (const d of dirs) {
  if (!dirExists(d)) {
    fs.mkdirSync(d, { recursive: true, mode: d === paths.secrets ? 0o700 : undefined });
    manifestLib.record(manifest, { kind: 'dir', path: d });
    if (d === paths.secrets) createdSecrets = true;
  }
}
// Enforce 0700 only on a secrets dir WE created (defeats a restrictive umask on the
// fresh dir). A pre-existing user path is never re-permissioned by init.
if (createdSecrets) fs.chmodSync(paths.secrets, 0o700);
```

Behavior:
- Fresh install (no `secrets/`): created with mode 0700 and chmod'd 0700 (unchanged
  outcome; still robust against umask).
- Re-run / pre-existing `secrets/` (any mode, or a symlink): left exactly as found;
  no chmod.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Keep the change surgical: only the loop's tracking flag and the guarded chmod.
- Do not add a chmod-reversal manifest entry — the fix is precisely to not mutate a
  path `init` did not create, so there is nothing to reverse.

## Security checklist

- [ ] `init` changes the mode of `secrets/` ONLY when it created that directory this
      run — a pre-existing user directory (or symlink) at the secrets path is never
      re-permissioned, and no unrecorded permission change is made.

## Acceptance criteria

- [ ] With no pre-existing `secrets/`, after `init` the directory exists at mode
      0700 (create + chmod path).
- [ ] With a pre-existing `secrets/` at mode 0755, after `init` its mode is still
      0755 (no chmod).
- [ ] The freshly-created case still records a `{kind:'dir'}` manifest entry for
      `secrets/` (unchanged).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern init
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Repairing permissions of an existing `secrets/` (gws #7) — deliberately NOT done;
  init must not mutate a path it did not create.
- Symlink/TOCTOU hardening of the directory creation loop — separate.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/092-init-secrets-chmod-guard`; conventional commits; PR titled
   `fix(init): only chmod a secrets dir we created (WP-092)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-13)

Merged to main as `df1f5c1` (PR #89, squash). `init` chmods the `secrets/` directory only when it created it, never a pre-existing user path. Double gate: wd-reviewer APPROVE + Codex clean; CI green. Shipped in v0.8.0.
