---
id: WP-150
title: Validate path-defining environment overrides — require absolute, normalized paths and reject ".."
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/150-env-override-path-validation
---

# WP-150: Environment-override path validation (audit A13)

## Context (read this, nothing else)

Every Wienerdog filesystem location is computed once by `getPaths(env)` in
`src/core/paths.js` from a handful of environment variables. Several of those
roots are **destructive**: `uninstall` recursively removes `paths.core` and its
`state/`, `logs/`, `schedules/`, `secrets/` subtrees (`disposeCoreMechanics`
does `rmSync(..., {recursive:true})`). If a path-defining override is a
**relative** path or contains **`..`**, the resolved root can silently point at
an unrelated tree, turning a normal uninstall/sweep into a delete of the wrong
directory. **IRON RULE (ADR-0004): Wienerdog is just files** — those files must
live at an unambiguous, absolute, contained location.

Audit finding **A13** (environment overrides): require **absolute normalized
paths, reject `..` and containment ambiguity** for the override variables, and
show the resolved destructive roots before use. This WP does the validation in
`getPaths` (fail closed on a bad override). The "show the resolved roots before a
destructive action" half is already handled by the uninstall plan display
(WP-145 shows every derived path before confirmation) — this WP cross-references
it, and `getPaths` itself stays silent because it is called on nearly every
command.

## Current state

`src/core/paths.js`:
```js
function getPaths(env = process.env) {
  const home = env.HOME || os.homedir();
  const core = env.WIENERDOG_HOME || path.join(home, '.wienerdog');
  const claudeDir = env.WIENERDOG_CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const codexDir = env.CODEX_HOME || path.join(home, '.codex');
  const vault = env.WIENERDOG_VAULT || path.join(home, 'wienerdog');
  return { home, core, config: path.join(core, 'config.yaml'), state: path.join(core, 'state'),
           secrets: path.join(core, 'secrets'), logs: path.join(core, 'logs'),
           manifest: path.join(core, 'install-manifest.json'), claudeDir, codexDir, vault };
}
```
No validation: a `WIENERDOG_HOME=../evil` or `WIENERDOG_VAULT=notes/../../x`
flows straight into `path.join` and then into recursive deletes / writes.
`getPaths` is imported and called across the CLI; it must stay synchronous and
cheap, and it must NOT break legitimate absolute overrides (the scenario harness
sets `WIENERDOG_CLAUDE_DIR`/`WIENERDOG_HOME` to absolute tmp dirs).

`WienerdogError` is available from `src/core/errors.js`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/paths.js | Add `assertSafeOverride(name, value)` and call it for each SET path-defining override before use; throw `WienerdogError` on a bad value. Export the helper for tests. |
| modify | tests/unit/paths.test.js | Cover: relative override rejected, `..`-containing override rejected, absolute clean override accepted, unset var uses default with no validation. |

### Exact contracts

Add to `paths.js`:
```js
const { WienerdogError } = require('./errors');

/** The env vars whose value becomes a destructive/write root and must be a safe
 *  absolute path. HOME is intentionally NOT included — it is the OS-standard home
 *  and validating it would reject exotic-but-valid setups; the DERIVED roots below
 *  are what Wienerdog deletes/writes. */
const OVERRIDE_VARS = ['WIENERDOG_HOME', 'WIENERDOG_VAULT', 'WIENERDOG_CLAUDE_DIR', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];

/**
 * Fail closed on an unsafe path-defining override. A SET value MUST be an absolute
 * path with no `.` or `..` segment (containment ambiguity). Unset → caller uses the
 * default (not validated). Cross-platform: uses path.isAbsolute + a segment scan on
 * BOTH separators so a Windows value is checked too.
 * @param {string} name @param {string|undefined} value
 * @returns {string|undefined} the value unchanged when safe/unset; throws otherwise
 */
function assertSafeOverride(name, value) {
  if (value === undefined || value === '') return value;
  const segs = value.split(/[\\/]+/);
  if (!path.isAbsolute(value) || segs.includes('..') || segs.includes('.')) {
    throw new WienerdogError(
      `${name} must be an absolute path with no '..' segment (got ${JSON.stringify(value)}) — ` +
      'this variable defines where Wienerdog reads and (on uninstall) recursively removes files.'
    );
  }
  return value;
}
```
Then in `getPaths`, validate each override BEFORE it is used:
```js
function getPaths(env = process.env) {
  const home = env.HOME || os.homedir();
  const core = assertSafeOverride('WIENERDOG_HOME', env.WIENERDOG_HOME) || path.join(home, '.wienerdog');
  const claudeDir = assertSafeOverride('WIENERDOG_CLAUDE_DIR', env.WIENERDOG_CLAUDE_DIR)
    || assertSafeOverride('CLAUDE_CONFIG_DIR', env.CLAUDE_CONFIG_DIR) || path.join(home, '.claude');
  const codexDir = assertSafeOverride('CODEX_HOME', env.CODEX_HOME) || path.join(home, '.codex');
  const vault = assertSafeOverride('WIENERDOG_VAULT', env.WIENERDOG_VAULT) || path.join(home, 'wienerdog');
  // …unchanged return…
}
```
- Only SET (non-empty) overrides are validated. Unset falls through to the
  home-relative default, which is inherently absolute+clean.
- A rejected value throws `WienerdogError` (→ the CLI's normal exit-1 error path),
  NOT a raw exception, so the message reaches the user cleanly.
- Do NOT `realpath` or touch the filesystem here — this is a pure lexical check
  (getPaths is called constantly and must stay cheap and side-effect-free).
- Export `assertSafeOverride` and `OVERRIDE_VARS` additively for tests.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- The segment scan splits on BOTH `/` and `\` so a Windows-style override
  (`C:\Users\me\..\x`) is also rejected; `path.isAbsolute` already handles the
  drive-letter/UNC cases per platform.
- This is a **fully-anchored, cross-engine** path check per the CLAUDE.md security
  checklist: the override is rejected if it is not absolute OR contains a `..`/`.`
  segment on either separator, so `1.2.3/../../x`-style escapes cannot survive.
- Do NOT validate `HOME` (OS-standard; validating it risks breaking valid exotic
  homes). If a follow-up wants HOME hardening, it is a separate decision.
- When uncertain, choose the simpler option and record it under "Decisions made".

**Owner walkthrough (2026-07-18): Ready.** Owner ratified: reject (fail closed
with `WienerdogError`) rather than silently normalize a bad override; validate
only the five destructive/write-root vars (`WIENERDOG_HOME`, `WIENERDOG_VAULT`,
`WIENERDOG_CLAUDE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`), with `HOME`
deliberately excluded; and keep the stricter check that rejects BOTH `.` and `..`
segments (not just `..`) to enforce clean absolute paths — harmless in practice
(no real absolute override uses `.` segments). Independent WP (paths.js only) —
no A8/A13 dependency.

## Security checklist

- [ ] Each path-defining override (`WIENERDOG_HOME`, `WIENERDOG_VAULT`,
      `WIENERDOG_CLAUDE_DIR`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`) is validated to be
      absolute with no `..`/`.` segment before it becomes a read/delete root.
- [ ] The check rejects `..` on BOTH `/` and `\` separators (cross-engine).
- [ ] Unset overrides keep the safe home-relative default; no filesystem access
      in the validator.

## Acceptance criteria

- [ ] `getPaths({HOME:'/h', WIENERDOG_HOME:'../evil'})` throws a `WienerdogError`
      naming `WIENERDOG_HOME`.
- [ ] `getPaths({HOME:'/h', WIENERDOG_VAULT:'notes/../../x'})` throws.
- [ ] `getPaths({HOME:'/h', WIENERDOG_HOME:'/tmp/wd'})` returns `core:'/tmp/wd'`
      with no throw (legitimate absolute override still works).
- [ ] `getPaths({HOME:'/h'})` (no overrides) returns the home-relative defaults
      unchanged.
- [ ] `npm test` and `npm run lint` are green (existing paths/scenario tests that
      set absolute overrides still pass).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "paths"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Validating non-path env vars (test seams like `WIENERDOG_RUNJOB_CMD`,
  `WIENERDOG_FAKE_TODAY`) — they are not delete/write roots.
- Showing the resolved roots before a destructive action — already covered by the
  uninstall plan display (WP-145).
- Realpath/symlink containment of the roots (that is uninstall's job, WP-144/145).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/150-env-override-path-validation`; conventional commits;
   PR titled `fix(paths): reject non-absolute / '..' path-defining env overrides (WP-150)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
