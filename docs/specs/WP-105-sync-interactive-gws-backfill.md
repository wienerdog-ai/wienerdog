---
id: WP-105
title: sync interactive backfill of the on-demand googleapis install (headless-only users)
status: In-Review
model: sonnet
size: S
depends_on: [WP-102]
adrs: [ADR-0004, ADR-0011, ADR-0013]
branch: wp/105-sync-interactive-gws-backfill
---

# WP-105: sync interactive backfill of the on-demand googleapis install

## Context (read this, nothing else)

`googleapis` (Google's client library) is not bundled: per ADR-0013 the vendored
app copy carries no `node_modules`, so `googleapis` is installed **on demand,
once, with consent** into a per-install deps dir `~/.wienerdog/app/deps/`
(WP-047). `userreports/BUG-gws-deps-missing-after-upgrade.md` documents a
dead-end: a user who connected Google **before** that scheme has a **valid token**
but an **absent** `app/deps`, so every `gws` read fails.

**WP-102** fixed the interactive read path: a `gws` read with a valid token but
absent deps now **self-heals** — `ensureGoogleReady(paths)` runs the same
consented `ensureGoogleapis` install on first read (interactive: a consent prompt;
non-TTY: fails with the accurate npm remedy, no worse than today).

**Why this WP exists (Codex Finding 2, owner disposition: ADD BACKFILL).** WP-102
alone does not help a **headless-only (routines-only) user** — exactly the profile
this bug hits. Their Google access is used only by scheduled routines (morning
digest, inbox triage), which run **non-TTY**, where the self-heal **declines the
consented install by design** (a scheduled job must never block on a prompt). So
those users never reach an interactive read and their `app/deps` is **never
populated** — the routines fail indefinitely. The original WP-102 "update-time
backfill is redundant" rationale was therefore wrong for them.

This WP reinstates a **consented, interactive-only backfill** on the `sync` flow.
When `sync` runs **with a terminal** (a person typed `wienerdog sync`, or
`wienerdog init` / `wienerdog update` handed off with the terminal attached) and
a valid token exists but `app/deps` is absent, it offers the same consented
install — so a headless-only user's *interactive* maintenance command
(`sync`/`update`) populates the deps dir that their non-interactive routines then
use. A **non-TTY** `sync` (CI, a scripted invocation) stays **mutation-free**: no
prompt, no install.

**Where `sync` sits in the flows.** `wienerdog update` (`src/cli/update.js`)
downloads + unpacks the new version, then **hands off to the NEW version's `sync`**
via `spawnSync(node, [newBin, 'sync'], { stdio: 'inherit' })` — so the child
`sync` inherits the parent's terminal, and an interactive `update` reaches this
backfill. `wienerdog init` also runs `sync` at the end. `sync` is **never** run by
the OS scheduler or `run-job` (those run `run-job <name>`), so the interactive gate
cleanly separates "a person is maintaining the install" (backfill) from "a routine
is running" (never).

**Product invariants.** Wienerdog is just files (ADR-0004): the backfill runs
`npm install` synchronously and returns; it starts nothing that outlives the
command. The install is **consented** (ADR-0011/0013): `ensureGoogleapis` shows
the exact command and prompts (default yes); a decline fails to a printed remedy.
The backfill is **best-effort**: a decline or install failure must **never** fail
`sync`. Zero new runtime dependencies; plain Node ≥ 18; JSDoc types only.

## Current state

**`src/cli/sync.js`** — `run(argv, opts = {})` is the compiler pass. It already
takes an `opts.loader` scheduler seam. Early on it computes `dryRun` and `paths`,
does all disk mutations (vendor + shim + schedules), renders the digest, stages
skills, applies adapters, and **finally persists the manifest** as the last
statement (`if (!dryRun) manifestMod.save(paths, manifest);`) followed by the
summary `console.log`s.

The backfill MUST go **after** `manifestMod.save` — the very last thing `run()`
does (Codex round-2 Finding 1). The backfill awaits a consent prompt + `npm
install`; if it sat between the disk mutations and `manifestMod.save`, a Ctrl-C at
the prompt or a kill during npm would leave vendor/shim/schedule changes applied
with their newly recorded manifest entries **unpersisted** — breaking uninstall
reversibility at a long interactive boundary. The googleapis install is **not**
manifest-tracked (`app/` is a single `vendored-tree` entry recorded by
`vendorSelf`), so running it last has zero manifest interaction: an interruption
then leaves a fully persisted, consistent sync.

```js
async function run(argv, opts = {}) {
  const dryRun = argv.includes('--dry-run');
  const paths = getPaths();
  // ... vault check, manifest load, vendor+shim+schedules, digest, skills, adapters ...
  if (!dryRun) manifestMod.save(paths, manifest);      // <-- manifest persisted here
  console.log(`wienerdog: ${summary.changed.length} changed, ${summary.unchanged.length} unchanged.`);
  for (const n of summary.notices) console.log(`  note: ${n}`);
  // <<< INSERT THE BACKFILL HERE — the FINAL statement of run(), AFTER manifestMod.save >>>
}
```

**`ensureGoogleReady(paths, opts)`** (added by WP-102, exported from
`src/gws/deps.js`): `if (isInstalled(paths)) return; if (!hasToken(paths)) return;
await ensureGoogleapis(paths, opts);`. It is a **no-op** when already installed or
when no token exists, and only acts on the exact bug state (valid-token-present +
deps-absent). With no `opts`, `ensureGoogleapis` uses the real `confirm`
(`src/core/prompt.js`) and the real npm installer. On a decline / non-TTY it
throws a `WienerdogError` whose message names the exact `npm install` command.

**`tests/unit/sync-repoint.test.js`** shows the sync test harness: an isolated
temp core (`mkdirSync` core/state/logs, write `config.yaml`, save a manifest),
`WIENERDOG_LOADER_NOOP=1` so the default scheduler loaders never spawn, harness
dirs pointed at absent paths, vault **unset** (so the digest/managed-block steps
are skipped), and `sync.run(argv)` invoked with `process.env` pointed at the temp
core (stdout silenced). Reuse this exact setup.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/sync.js | add two `opts` seams (`interactive`, `ensureGoogleReady`) and the interactive, best-effort backfill call as the **final statement of `run()`, after `manifestMod.save`**. |
| create | tests/unit/sync-gws-backfill.test.js | new test file covering: non-TTY → not called; interactive → called with paths; throw → sync still resolves; dry-run → not called. |

### Exact contracts

**1. Two new `opts` seams on `sync.run(argv, opts)`.** Keep the existing
`opts.loader`. Add:
- `opts.interactive` — when provided, overrides the terminal detection (for
  tests); default is `!!process.stdin.isTTY`.
- `opts.ensureGoogleReady` — inject the self-heal fn (for tests); default is the
  real `require('../gws/deps').ensureGoogleReady`.

Update the `run` JSDoc `@param opts` to document both alongside `loader`.

**2. The backfill — the FINAL statement of `run()`, after `manifestMod.save`**
(after the summary `console.log`s; gate on `!dryRun` explicitly, since this is no
longer inside the earlier `if (!dryRun)` block):

```js
  // Interactive backfill of the on-demand googleapis install (BUG-gws-deps-missing).
  // A routines-only (headless) user who connected Google before WP-047 never
  // reaches an interactive read to self-heal — their non-TTY routines decline the
  // consented install by design, so app/deps is never populated. When a PERSON runs
  // sync (or update/init hands off with the terminal attached) and a token exists
  // but the deps dir is absent, offer the same consented install here so their
  // routines then work. No-op when already installed or unauthed (ensureGoogleReady
  // handles both). RUN LAST — after manifestMod.save — so a Ctrl-C at the prompt or
  // a kill during npm leaves a fully persisted, consistent sync (the install is not
  // manifest-tracked). Best-effort: a decline/failure prints a note and NEVER fails
  // sync. A non-TTY (or dry-run) sync stays mutation-free (no prompt, no install). WP-105.
  const interactive = opts.interactive !== undefined ? opts.interactive : !!process.stdin.isTTY;
  if (!dryRun && interactive) {
    const ensureGoogleReady = opts.ensureGoogleReady || require('../gws/deps').ensureGoogleReady;
    try {
      await ensureGoogleReady(paths);
    } catch (e) {
      console.log(`wienerdog: Google's client library was not installed — ${e.message}`);
    }
  }
```

Behavior:
- Non-TTY (`interactive` false) or `--dry-run` → the block is skipped: no prompt,
  no install, no `ensureGoogleReady` call. `sync` is mutation-free w.r.t.
  `app/deps`, and the manifest is already fully persisted regardless.
- Interactive + already installed, or interactive + no token → `ensureGoogleReady`
  is called but no-ops silently (its own guards).
- Interactive + valid token + deps absent → `ensureGoogleapis` shows the exact
  command and prompts (default yes). On yes it installs; on decline/failure it
  throws, which is **caught** and printed as a note — `sync` continues to a normal
  exit 0.
- **Crash-safety:** because the manifest was saved *before* this call, an
  interruption at the consent prompt or during `npm install` leaves every
  manifest-tracked mutation (vendor/shim/schedules/skills/hooks) already persisted
  — uninstall stays reversible. The googleapis install itself is covered by the
  single `vendored-tree` (`app/`) manifest entry, so nothing new needs recording.

Do NOT pass any consent `opts` to `ensureGoogleReady` in production — the real
`confirm` reads the terminal (we already gated on `process.stdin.isTTY`, so
`confirm`'s `process.stdin.isTTY` branch reads from stdin).

**3. Tests (`tests/unit/sync-gws-backfill.test.js`).** Mirror
`sync-repoint.test.js`'s hermetic setup (temp core + `config.yaml` with vault
unset + saved manifest + `WIENERDOG_LOADER_NOOP=1` + absent harness dirs +
stdout silenced + `process.env` pointed at the temp core and restored in
`finally`). Drive `sync.run` with the new seams:

- **non-TTY → backfill not called.** `let called = false; await runSync(env,
  ['sync'], { interactive: false, ensureGoogleReady: async () => { called = true;
  } }); assert.equal(called, false);`
- **interactive → backfill called once with `paths`.** `let seen; await
  runSync(env, ['sync'], { interactive: true, ensureGoogleReady: async (p) => {
  seen = p; } }); assert.equal(seen.core, paths.core);` (assert on a stable field
  like `core`).
- **interactive + backfill throws → `sync` still resolves (exit 0) AND the
  manifest is fully persisted (Finding 1 crash-safety).** `await
  assert.doesNotReject(() => runSync(env, ['sync'], { interactive: true,
  ensureGoogleReady: async () => { throw new WienerdogError('declined — run this
  yourself'); } }));` (a decline must not fail sync). Import `WienerdogError` from
  `../../src/core/errors`. Then assert the manifest was saved **before** the
  throwing backfill: `assert.ok(fs.existsSync(paths.manifest));` and
  `const m = manifestLib.load(paths); assert.ok(m.entries.some((e) => e.kind ===
  'vendored-tree'));` (proves `manifestMod.save` ran, with the vendor mutation
  recorded, ahead of the backfill). `manifestLib` = `require('../../src/core/manifest')`.
- **dry-run → backfill not called even when interactive.** `let called = false;
  await runSync(env, ['sync', '--dry-run'], { interactive: true, ensureGoogleReady:
  async () => { called = true; } }); assert.equal(called, false);`

Extend the local `runSync` helper (copied from `sync-repoint.test.js`) to forward
an `opts` argument to `sync.run(argv, opts)` (merge in `WIENERDOG_LOADER_NOOP`
env, silence stdout, restore env in `finally`).

## Implementation notes & constraints

- **Best-effort, never fails sync.** The `try/catch` around `ensureGoogleReady` is
  load-bearing: a user who declines the install, or a transient npm failure, must
  still get a successful `sync` (the rest of sync already ran). Print a note; do
  not rethrow.
- **Interactive-only is the whole point.** Gate strictly on `process.stdin.isTTY`
  (overridable by `opts.interactive` for tests). Never prompt or install in a
  non-TTY `sync`. Do not try to make routines self-heal — they are the consumers
  of the deps dir this backfill populates, not the installers.
- **No change to `update.js` or `vendor.js`.** `update` already hands off to the
  new version's `sync` with `stdio: 'inherit'`, so the terminal reaches this code
  through `sync`. Do not add a second install site.
- **Reuse `ensureGoogleReady` (WP-102) as-is.** Do not re-implement the
  token/installed checks — they live in `ensureGoogleReady`. This WP only decides
  *when* (interactive) to call it and swallows its throw.
- Zero new dependencies; no build step. `require('../gws/deps')` lazily inside the
  block (do not add a top-level gws require to `sync.js`).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input. The backfill calls the pre-existing, consented
      `ensureGoogleReady`/`ensureGoogleapis` (pinned `GOOGLEAPIS_SPEC`,
      `--ignore-scripts`); no user value is interpolated into the install command.
      Consent (ADR-0011) is preserved — the terminal prompt still gates the
      install, and a non-TTY `sync` installs nothing. No process outlives the
      command (ADR-0004).

## Acceptance criteria

- [ ] An interactive `wienerdog sync` (or `update`/`init` handoff with a terminal)
      with a valid token but absent `app/deps` prompts to install `googleapis` and,
      on consent, populates the deps dir — so the user's headless routines then
      work.
- [ ] A non-TTY `sync` makes no prompt and no install (mutation-free w.r.t.
      `app/deps`).
- [ ] A decline or install failure prints a note and `sync` still exits 0.
- [ ] `--dry-run` never prompts or installs.
- [ ] Running `sync` twice after a successful backfill is idempotent (second run:
      `ensureGoogleReady` no-ops because `isInstalled` is true).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "sync-gws-backfill|sync"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any `app/deps` install in `src/cli/update.js` or `src/core/vendor.js` — the
  handoff to `sync` covers `update`.
- Making non-TTY routines self-heal (they decline the consented install by design;
  this backfill is what populates the deps dir for them).
- The read-path self-heal / disambiguated error (WP-102) and the `doctor` probe
  (WP-103) — separate WPs.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/105-sync-interactive-gws-backfill`; conventional commits; PR titled
   `feat(sync): interactive consented backfill of the googleapis deps dir (WP-105)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-07-13 — created** from Codex round-1 Finding 2 (owner disposition: ADD
  BACKFILL) on the WP-102/103/104 spec set. Reverses WP-102's original fix-3 "skip":
  a headless-only user's routines run non-TTY and decline the consented install, so
  the read-path self-heal never populates their deps dir — an *interactive*
  `sync`/`update` backfill is the missing piece. Split as its own WP (not folded
  into WP-102) because it touches `src/cli/sync.js`, a file outside WP-102's
  already-implemented Deliverables.
- **2026-07-13 — Codex round-2 Finding 1 (high).** Moved the backfill from the end
  of the `if (!dryRun)` block (between the disk mutations and `manifestMod.save`)
  to the **final statement of `run()`, after `manifestMod.save`**. Sitting before
  the save meant a Ctrl-C at the consent prompt or a kill during `npm install`
  would strand vendor/shim/schedule mutations with their manifest entries
  unpersisted — breaking uninstall reversibility. Running last (the install is not
  manifest-tracked) leaves a fully persisted, consistent sync on interruption.
  Gate changed to an explicit `if (!dryRun && interactive)`; added a test asserting
  the manifest is saved (with the `vendored-tree` entry) even when the backfill
  throws.
