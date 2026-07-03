---
id: WP-028
title: Register skills + hooks on bootstrap so a fresh init leaves /wienerdog-setup usable
status: Ready
model: opus
size: M
depends_on: [WP-027]
adrs: [ADR-0004]
branch: wp/028-bootstrap-skill-registration
---

# WP-028: Register skills + hooks on bootstrap so a fresh init leaves /wienerdog-setup usable

## Context (read this, nothing else)

Wienerdog installs files and never starts anything that outlives its job
(ADR-0004). Its mechanics live in the **canonical core** (`~/.wienerdog/`); the
user's markdown memory lives in a separate **vault** (default `~/wienerdog/`).
A **skill** is a `SKILL.md` folder both harnesses understand; skills are staged
into `<core>/skills/` and then **symlinked** into each harness's skills dir so
the harness can see them (e.g. Claude Code's `/wienerdog-setup` slash command).
`wienerdog sync` is the compiler pass that stages skills, symlinks them,
registers SessionStart/SessionEnd hooks, renders the **digest** (the pre-rendered
session-context file `<core>/state/digest.md`), and writes the **managed block**
(the `<!-- wienerdog:begin/end -->` region Wienerdog owns inside CLAUDE.md /
AGENTS.md) from that digest.

**The bug this WP fixes (reproduced on the maintainer's machine, first real
install).** Skills become visible to a harness ONLY via `wienerdog sync` (skill
symlinks + hook registration + managed block all live there). But WP-027 made
plain `wienerdog init` **defer** vault creation (`config.yaml` gets `vault: null`
until the user chooses a vault), and `sync` currently **throws** `WienerdogError`
the moment `vault:` is null — before it stages or symlinks anything. Worse, that
error tells the user to run `/wienerdog-setup`, which is itself a skill that only
`sync` could have registered. So a fresh `wienerdog init` (which never runs sync)
leaves the user with a promised `/wienerdog-setup` slash-command that exists
nowhere the harness can find it — a bootstrap deadlock. No test covers the seam
"fresh machine → init → skill visible to the harness".

**The fix has two moving parts.** (1) `sync` becomes *partially* vault-independent:
skill staging + skill symlinks + hook registration carry **no user knowledge** and
must ALWAYS run for detected harnesses; only the **digest render + managed block**
require a vault, and those are skipped with a one-line notice when `vault:` is
null. In that state `sync` did useful work, so it **exits 0**. The existing exit-1
behavior is kept **only** when a vault *is* configured but its folder is missing on
disk. (2) `init` runs `sync` automatically at the end of a successful install
(both plain and `--fresh-vault`), so the closing message's promise
("run /wienerdog-setup") is true the moment `init` finishes.

Two product invariants bound this work:
- Wienerdog is just files; nothing here starts a daemon or process (ADR-0004).
- Everything is **idempotent** (running twice = zero changes) and **reversible**
  via the install manifest. `sync` is already idempotent and manifest-tracked;
  this WP must keep the `init` + `sync` combination idempotent.

## Current state

### `src/cli/sync.js` — `run(argv)` (the file you restructure)
Today it does, in order:
1. `const vaultPath = readVaultPath(paths.config)` (local flat-YAML parser
   returning the path or `null`).
2. **If `!vaultPath` → `throw new WienerdogError('no vault set up yet — run
   /wienerdog-setup …')`** (exit 1). ← this is the deadlock.
3. `statSync(vaultPath).isDirectory()`; if not a dir →
   `throw new WienerdogError('vault not found at <path> — run /wienerdog-setup …')`
   (exit 1).
4. Renders the digest and writes `<state>/digest.md` atomically; logs
   `wienerdog: wrote <path> (<n> bytes).`
5. `const manifest = manifestMod.load(paths)`.
6. `stageSkills(paths, dryRun, manifest, summary)` — copies packaged
   `skills/wienerdog-*` into `<core>/skills/` (this carries no user knowledge).
7. If Claude present → `applyClaudeAdapter(paths, { dryRun, manifest })`; if Codex
   present → `applyCodexAdapter(paths, { dryRun, manifest })`; else logs
   `<harness> not detected; skipping adapter.`
8. `manifestMod.save(paths, manifest)` (unless dry-run).
9. Logs `wienerdog: <c> changed, <u> unchanged.` then each notice.

`readVaultPath(configPath)` returns `null` when the file is unreadable, the
`vault:` key is absent, or the value is `''`/`null`. Keep it verbatim.

### `src/adapters/claude.js` — `applyClaudeAdapter(paths, opts)`
Returns `{changed, unchanged, notices}`. It reads `<state>/digest.md`; **if the
digest is absent it returns early with a notice `digest not found at <path>;
skipping Claude adapter` — doing NOTHING (no skills, no hooks).** Otherwise:
Step 1 `shared.applyManagedBlock(claudeMd, digest, …)`; Step 2 copies
`session-start.sh` + `session-end.sh` into `<core>/bin/` and registers
`SessionStart` + `SessionEnd` in `<claudeDir>/settings.json` via
`shared.applySettings`; Step 3 symlinks each `<core>/skills/wienerdog-*` into
`<claudeDir>/skills/` via `shared.applySkillLinks`. `paths.claudeDir` =
`$WIENERDOG_CLAUDE_DIR || $CLAUDE_CONFIG_DIR || ~/.claude`.

### `src/adapters/codex.js` — `applyCodexAdapter(paths, opts)`
Same shape: reads the digest and **returns early doing nothing if absent**. Step 1
managed block in `<codexDir>/AGENTS.md` (plus an `AGENTS.override.md`-shadowing
notice if that file exists); Step 2 copies `session-start.sh` +
`codex-session-end.sh` into `<core>/bin/`, registers `SessionStart` + `Stop` in
`<codexDir>/hooks.json`, then pushes a `/hooks`-trust notice; Step 3 symlinks each
core skill into **`<paths.home>/.agents/skills/`** (`paths.home = env.HOME ||
os.homedir()` — NOT `codexDir`-relative). `paths.codexDir` = `$CODEX_HOME ||
~/.codex`.

### `src/adapters/shared.js` (do NOT modify)
`applyManagedBlock`, `copyHookScript`, `applySettings`, `applySkillLinks`,
`recordOnce`, `buildBlock`. All correct as-is; you call them from the adapters.

### `src/cli/init.js` — `run(argv)` (WP-027 deferred flow)
Parses `--dry-run`, `--yes`, `--fresh-vault`. Fast-path: if all core dirs exist,
config exists, and no vault step is needed → prints
`wienerdog: already installed, nothing to do.` and **returns** (line ~101). Else
prints a plan; on `--dry-run` prints `--dry-run: no changes made.` and returns;
else (after optional confirm) creates dirs + `config.yaml`, optionally scaffolds
the vault under `--fresh-vault`, `manifestLib.save(paths, manifest)`, then prints
one of three closing blocks:
- vault scaffolded: `wienerdog: installed with a fresh vault. Run \`wienerdog
  doctor\` …`
- vault already configured: `wienerdog: installed. Run \`wienerdog doctor\` …`
- deferred (no vault): `wienerdog: core installed — no vault yet.` + `Next: run
  /wienerdog-setup …` + `or run 'wienerdog init --fresh-vault' …` + `Then run
  \`wienerdog doctor\` …`

`init` today does **not** invoke `sync`, so a fresh install never registers the
skills — the bug.

### `templates/hooks/session-start.sh` (do NOT modify — verified safe)
Already guards a missing digest: `DIGEST="$CORE/state/digest.md"; [ -f "$DIGEST" ]
|| exit 0`. On a no-vault machine (no digest yet) the SessionStart hook is silent
and harmless. **No guard change is needed; do not touch this file.**

### Test census — every test that invokes `init`/`sync` (this is the WP-027 gap we must not repeat)
Grepped with `grep -rl "'init'" tests` and `grep -rln "'sync'\|cli/sync" tests`.
Each is classified **TOUCH** (must change) or **VERIFIED-UNAFFECTED** (reasoned
below; do NOT change).

- **TOUCH** `tests/unit/claude-adapter.test.js` — its test `'missing digest:
  returns early with a notice, no throw'` asserts `res.changed` is `[]` and the
  notice `digest not found`. After this WP a missing digest no longer returns
  early: hooks + skills still register. This test must be updated (see contracts).
- **TOUCH** `tests/scenarios/run-scenarios.js` — line ~331 seeds with plain
  `init --yes`, but the scenario then calls `commitCount(vault)` /
  `git(vault, rev-parse HEAD)` (lines ~368-369), which require an existing git
  vault. Since WP-027, plain `init` defers the vault, so the scenario needs a
  vault: change its seed to `init --fresh-vault --yes` (a WP-027 census miss;
  `run-scenarios.js` is run by `npm run scenarios`, not `npm test`).
- **TOUCH (create)** `tests/integration/bootstrap-seam.test.js` — the new seam
  test (contracts below).
- **VERIFIED-UNAFFECTED** `tests/unit/init.test.js` — uses absent harness dirs
  (`absent-claude`/`absent-codex`), so `init`-runs-`sync` stages skills into the
  core but registers nothing into a harness. All asserts use `match`/`existsSync`;
  `init --dry-run` returns before `sync`; the two idempotency tests take their
  snapshot *after* the first `init` (which already ran sync) and the second `init`
  hits the "already installed" fast path (which does NOT run sync — see decision
  D3), so `snapshot(core)` is unchanged. No edit.
- **VERIFIED-UNAFFECTED** `tests/unit/doctor.test.js` — asserts on `doctor`
  output, not `init`; `doctor` is untouched by this WP. No edit.
- **VERIFIED-UNAFFECTED** `tests/unit/uninstall.test.js` — `init`-runs-`sync` adds
  `<core>/skills/**` files + manifest entries, all inside the core; harnesses are
  absent so no out-of-core writes. `uninstall` reverses the manifest and removes
  the whole core; asserts (`config.yaml` listed, `[dir]`, core removed, user-edited
  config kept) still hold. No edit.
- **VERIFIED-UNAFFECTED** `tests/unit/gws-dispatch.test.js`,
  `tests/unit/gws-grant.test.js`, `tests/unit/gws-send.test.js` — each runs plain
  `init --yes` with absent harnesses and `stdio: 'ignore'`, only to obtain a
  `config.yaml`/manifest for grants. `sync` adds core-local skill files; exit stays
  0; grants are unaffected. No edit.
- **VERIFIED-UNAFFECTED** `tests/integration/adopt-e2e.test.js` — calls
  `init.run(['--yes'])` in-process with `console.log` muted; `CLAUDE_CONFIG_DIR`
  points at an existing dir, so `init`-runs-`sync` now registers skills/hooks there
  during init (no vault yet → managed block skipped). No assertion inspects that
  dir after `init`; assertions check `config.yaml`, the adopted vault, digest, and
  the dream commit, all downstream of the later explicit `adopt`/`sync`. No edit.
  (Its stale `// 3. init → default vault` comment is a pre-existing WP-027 relic —
  out of scope; leave it.)
- **VERIFIED-UNAFFECTED** `tests/unit/codex-adapter.test.js` — its unit tests write
  a digest in `setup()` and call `applyCodexAdapter(paths, {manifest})` directly
  with default opts, so `skipManagedBlock` defaults false and behavior is
  identical (golden byte-for-byte unchanged). Its integration test already uses
  `init --fresh-vault --yes` (a vault exists), so `init`-runs-`sync` and its own
  later explicit `sync` are both idempotent and its asserts hold. No edit.
- **NOT init/sync** `tests/integration/dream.test.js`,
  `tests/unit/dream-validate.test.js` — their `init` matches are `git init`, not
  `wienerdog init`. No edit.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/sync.js | make skill staging + adapters run without a vault; skip digest render only when `vault:` null; print the no-vault notice; keep exit-1 ONLY for configured-but-missing vault; pass `skipManagedBlock` to adapters |
| modify | src/adapters/claude.js | add `opts.skipManagedBlock`; run Steps 2+3 (hooks + skills) ALWAYS; do Step 1 (managed block) only with a vault/digest; remove the digest early-return |
| modify | src/adapters/codex.js | same restructure as claude.js (Steps 2+3 always; Step 1 gated; keep the `/hooks`-trust notice unconditional; keep the override-shadow notice inside Step 1) |
| modify | src/cli/init.js | after a successful install, `await require('./sync').run(argv)` so skills/hooks register; add a `wienerdog sync` hint to the "already installed" fast-path message; verify the closing message still reads true |
| create | tests/integration/bootstrap-seam.test.js | the seam test: fresh env → `init` (plain, Claude present) and a Codex leg → skills/hooks registered, NO vault/digest/managed block; then `init --fresh-vault` → everything incl. block + digest |
| modify | tests/unit/claude-adapter.test.js | rewrite the `missing digest` test to the new behavior (block skipped, hooks + skills still registered) |
| modify | tests/scenarios/run-scenarios.js | change the seed `init --yes` → `init --fresh-vault --yes` (needs a vault; WP-027 census gap); update the adjacent log/comment string to match |

**Explicitly NOT touched (and why):** `src/adapters/shared.js` (its helpers are
correct; you only change how the adapters call them), `templates/hooks/*.sh`
(session-start.sh already guards a missing digest), `src/cli/doctor.js` /
`src/cli/adopt.js` / `skills/wienerdog-setup/SKILL.md` (WP-027 already fixed their
messaging), `src/core/**` (no core changes), `bin/wienerdog.js` (no new
subcommand/flag), and every VERIFIED-UNAFFECTED test above.

### Exact contracts

#### 1. `src/adapters/claude.js` — `skipManagedBlock`, hooks + skills always run

Add `skipManagedBlock` to the options and restructure so Steps 2 and 3 are
unconditional. Replace the current digest read + early-return with:

```js
/** @param {{dryRun?: boolean, manifest?: object, skipManagedBlock?: boolean}} [opts] */
function applyClaudeAdapter(paths, opts = {}) {
  const dryRun = opts.dryRun === true;
  const skipManagedBlock = opts.skipManagedBlock === true;
  const manifest = opts.manifest;
  /** @type {{changed: string[], unchanged: string[], notices: string[]}} */
  const out = { changed: [], unchanged: [], notices: [] };

  const binDir = path.join(paths.core, 'bin');
  const skillsDir = path.join(paths.core, 'skills');
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  const settingsPath = path.join(paths.claudeDir, 'settings.json');
  const claudeSkillsDir = path.join(paths.claudeDir, 'skills');
  const digestPath = path.join(paths.state, 'digest.md');

  // Step 1 — managed block. Requires a vault/digest; skipped on a no-vault
  // machine. Skills + hooks (Steps 2-3) carry no user knowledge and ALWAYS run.
  if (!skipManagedBlock) {
    let digest = null;
    try {
      digest = fs.readFileSync(digestPath, 'utf8');
    } catch {
      digest = null;
    }
    if (digest !== null) {
      shared.applyManagedBlock(claudeMd, digest, dryRun, manifest, out);
    } else {
      out.notices.push(
        `digest not found at ${digestPath}; managed block skipped (hooks + skills still installed)`
      );
    }
  }

  // Step 2 — hook scripts + settings.json.  (unchanged body)
  // Step 3 — skill symlinks.               (unchanged body)
  return out;
}
```

Keep the Step 2 and Step 3 bodies exactly as they are today. Update the function's
JSDoc to state Steps 2-3 always run and Step 1 is gated on a vault/digest.

#### 2. `src/adapters/codex.js` — identical restructure

Same `skipManagedBlock` option and the same Step-1 gating. Keep the override
notice **inside** the `if (!skipManagedBlock)` block (right after
`applyManagedBlock`, guarded by `fs.existsSync(overridePath)`), since it is about
the AGENTS.md block. Keep Steps 2-3 (hooks.json + `.agents/skills` symlinks) and
the unconditional `/hooks`-trust notice exactly as today.

#### 3. `src/cli/sync.js` — vault-independent registration

Rewrite `run(argv)` so it never throws on a null vault, prints a one-line notice,
and always stages skills + applies adapters. Exit 1 stays **only** for a
configured-but-missing vault.

```js
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const paths = getPaths();
  const vaultPath = readVaultPath(paths.config);

  // A configured vault MUST exist on disk. An UNSET vault is a valid first-time
  // state (WP-027): we still install skills + hooks, we just defer memory.
  if (vaultPath) {
    let isDir = false;
    try {
      isDir = fs.statSync(vaultPath).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      throw new WienerdogError(
        `vault not found at ${vaultPath} — run /wienerdog-setup, or 'wienerdog init --fresh-vault' for the default.`
      );
    }
  }

  const manifest = manifestMod.load(paths);
  /** @type {{changed: string[], unchanged: string[], notices: string[]}} */
  const summary = { changed: [], unchanged: [], notices: [] };

  // 1. Digest + managed block need a vault. Skip both when unset (exit 0).
  const skipManagedBlock = !vaultPath;
  if (vaultPath) {
    const layout = readVaultLayout(paths.config);
    const digest = renderDigest(vaultPath, layout);
    const dest = path.join(paths.state, 'digest.md');
    if (!dryRun) {
      fs.mkdirSync(paths.state, { recursive: true });
      const tmp = path.join(paths.state, `.digest.md.${process.pid}.tmp`);
      fs.writeFileSync(tmp, digest);
      fs.renameSync(tmp, dest);
    }
    console.log(
      `wienerdog: ${dryRun ? 'would write' : 'wrote'} ${dest} (${Buffer.byteLength(digest)} bytes).`
    );
  } else {
    console.log(
      'wienerdog: no vault yet — memory features (digest + managed block) activate after /wienerdog-setup; skills and hooks are installed.'
    );
  }

  // 2. Stage shipped skills into the core (vendor-neutral) — ALWAYS.
  stageSkills(paths, dryRun, manifest, summary);

  // 3. Apply each present harness adapter — ALWAYS. They install skills + hooks
  //    and only skip the managed block when skipManagedBlock is true.
  if (detectHarnesses(process.env).claude.present) {
    const res = applyClaudeAdapter(paths, { dryRun, manifest, skipManagedBlock });
    summary.changed.push(...res.changed);
    summary.unchanged.push(...res.unchanged);
    summary.notices.push(...res.notices);
  } else {
    console.log('Claude Code not detected; skipping adapter.');
  }
  if (detectHarnesses(process.env).codex.present) {
    const res = applyCodexAdapter(paths, { dryRun, manifest, skipManagedBlock });
    summary.changed.push(...res.changed);
    summary.unchanged.push(...res.unchanged);
    summary.notices.push(...res.notices);
  } else {
    console.log('Codex CLI not detected; skipping adapter.');
  }

  if (!dryRun) manifestMod.save(paths, manifest);

  console.log(`wienerdog: ${summary.changed.length} changed, ${summary.unchanged.length} unchanged.`);
  for (const n of summary.notices) console.log(`  note: ${n}`);
}
```

**Exact no-vault `sync` output** (Claude present, Codex absent, first run) — the
literal contract:

```
wienerdog: no vault yet — memory features (digest + managed block) activate after /wienerdog-setup; skills and hooks are installed.
Codex CLI not detected; skipping adapter.
wienerdog: 4 changed, 0 unchanged.
```

(The `changed` count is whatever the adapter + skill staging report; do not assert
an exact number in code — assert on the notice line and that exit is 0. The
`Claude Code not detected` line is absent because Claude IS present here.)

Keep `readVaultPath`, `stageDir`, `stageSkills`, and `recordOnce` in sync.js
verbatim. Do not delete the `WienerdogError` import — the configured-but-missing
throw still uses it.

#### 4. `src/cli/init.js` — run sync at the end of a successful install

Two edits, nothing else.

(a) In the "already installed" fast-path, add a hint so an upgrader whose core
predates this fix can self-heal (their re-run hits this path and does NOT run
sync — see decision D3):

```js
if (missingDirs.length === 0 && !needConfig && !vaultStep) {
  console.log('wienerdog: already installed, nothing to do.');
  console.log("Tip: run 'wienerdog sync' to refresh skills, hooks, and memory.");
  return;
}
```

(b) After `manifestLib.save(paths, manifest);` and **before** the closing-message
`if (vaultStep) … else …` block, register into the harnesses by running sync:

```js
// Register skills + hooks into every detected harness (and, when a vault is
// configured, the digest + managed block) so the promised /wienerdog-setup skill
// is live the moment init finishes. sync is idempotent; with no vault it installs
// skills + hooks and defers memory features (exit 0). Passing our argv is safe —
// sync only reads --dry-run from it, and we never reach here on a dry-run.
await require('./sync').run(argv);
```

The three closing-message blocks stay verbatim (WP-027 wording). With sync having
run, the deferred block's "Next: run /wienerdog-setup …" is now literally true.
Do not run sync on the `--dry-run` path (that path returns earlier) or the abort
path.

#### 5. `tests/unit/claude-adapter.test.js` — rewrite the `missing digest` test

Replace the existing test body (lines ~170-176) with one asserting the new
behavior: with no digest and `skipManagedBlock` unset, no CLAUDE.md is written but
hooks + skills ARE registered.

```js
test('missing digest: skips the managed block but still installs hooks + skills', () => {
  const paths = setup();
  fs.rmSync(path.join(paths.state, 'digest.md'));
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');

  const res = applyClaudeAdapter(paths, { manifest: freshManifest() });

  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  assert.equal(fs.existsSync(claudeMd), false, 'no managed block without a digest');
  assert.ok(res.notices.some((n) => n.includes('managed block skipped')));
  assert.ok(fs.existsSync(path.join(paths.core, 'bin', 'session-start.sh')), 'hook script installed');
  if (process.platform !== 'win32') {
    const link = path.join(paths.claudeDir, 'skills', 'wienerdog-setup');
    assert.ok(fs.lstatSync(link).isSymbolicLink(), 'skill symlinked');
  }
});
```

#### 6. `tests/integration/bootstrap-seam.test.js` (new) — the seam

Use the subprocess `execFileSync('node', [bin, …])` pattern from
`tests/unit/init.test.js`. **Trap:** the Codex adapter symlinks into
`$HOME/.agents/skills` (`paths.home = env.HOME || os.homedir()`), so the Codex leg
MUST set `HOME` to the temp root or it would write into the real home. Set `HOME`
in every leg for safety. Guard symlink assertions with
`if (process.platform !== 'win32')`.

Three subtests, each with its own temp root:

1. **Claude present, plain `init` → skills + hooks, NO memory.**
   Env: `HOME=<root>`, `WIENERDOG_HOME=<root>/wd`, `WIENERDOG_VAULT=<root>/vault`,
   `CLAUDE_CONFIG_DIR=<root>/claude` (mkdir it so Claude is detected),
   `CODEX_HOME=<root>/absent-codex` (do NOT create → Codex absent). Run
   `init --yes`; assert exit 0. Then:
   - `config.yaml` contains `vault: null`; `!existsSync(WIENERDOG_VAULT)`.
   - `!existsSync(<wd>/state/digest.md)` — no digest.
   - `!existsSync(<claude>/CLAUDE.md)` — no managed block written.
   - `settings.json` exists and some `SessionStart` group's hooks include the
     command `<wd>/bin/session-start.sh`.
   - (non-win32) `<claude>/skills/wienerdog-setup` is a symlink.

2. **Claude present, `init --fresh-vault` → everything.**
   Same env, fresh root. Run `init --fresh-vault --yes`; assert exit 0. Then:
   - `statSync(WIENERDOG_VAULT).isDirectory()` and it is a git repo
     (`git -C <vault> rev-list --count HEAD` === `'1'`).
   - `existsSync(<wd>/state/digest.md)` — digest rendered.
   - `readFileSync(<claude>/CLAUDE.md)` includes `<!-- wienerdog:begin -->`.
   - (non-win32) `<claude>/skills/wienerdog-setup` is a symlink; and
     `settings.json` `SessionStart` includes `<wd>/bin/session-start.sh`.

3. **Codex present, plain `init` → skills + hooks under `.agents`, NO memory.**
   Env: `HOME=<root>`, `WIENERDOG_HOME=<root>/wd`,
   `WIENERDOG_VAULT=<root>/vault`, `CODEX_HOME=<root>/codex` (mkdir it → Codex
   detected), `CLAUDE_CONFIG_DIR=<root>/absent-claude` (do NOT create → Claude
   absent). Run `init --yes`; assert exit 0. Then:
   - `!existsSync(WIENERDOG_VAULT)`; `!existsSync(<wd>/state/digest.md)`.
   - `!existsSync(<codex>/AGENTS.md)` — no managed block.
   - `hooks.json` exists and some `SessionStart` group's hooks include
     `<wd>/bin/session-start.sh`.
   - (non-win32) `<root>/.agents/skills/wienerdog-setup` is a symlink.

Reuse a `run(args, env)` helper returning `{status, stdout, stderr}` (as in
init.test.js). The packaged `skills/` folder contains `wienerdog-setup`, so that
symlink name is stable.

#### 7. `tests/scenarios/run-scenarios.js` — seed with a vault

Change the seed invocation (line ~331) from `['init', '--yes']` to
`['init', '--fresh-vault', '--yes']`, and update the adjacent log string
(line ~330, `'scenarios: seeding harness (wienerdog init --yes)...'`) and the
`// 3. Seed:` comment to say `wienerdog init --fresh-vault --yes`. Nothing else in
this file changes.

## Implementation notes & constraints

- No new npm dependencies; plain Node ≥ 18; JSDoc types only; no TypeScript; no
  build step.
- Idempotency is the invariant to protect. Verify by hand: `init --yes` then
  `init --yes` again (fast path, "already installed", zero core changes);
  `init --fresh-vault --yes` twice (second: "already installed", zero changes);
  `sync` twice in each of the two vault states (zero changes on the second).
- **The `.agents` trap** (seam test): the Codex adapter links into
  `$HOME/.agents/skills`. Always set `HOME` to the temp root in the seam test.
- When the digest exists but you pass `skipManagedBlock: true` (only happens if a
  stale digest lingers on a now-unset vault), the block is deliberately NOT
  written — the config's `vault: null` is the source of truth, not a leftover
  file. This is intentional; do not "helpfully" render it.
- Do not add per-adapter user-facing prose for the skipped block — `sync` prints
  the single no-vault notice; the adapter stays quiet on that path.
- When uncertain, choose the simpler option and record it under "Decisions made"
  in the PR body. Do not expand scope.

### Decisions already made (do not re-litigate)
- **D1.** `sync` stays exit-1 ONLY for a configured-but-missing vault; a null
  `vault:` is a valid state that exits 0 after installing skills + hooks.
- **D2.** Skill staging, skill symlinks, and hook registration always run;
  digest + managed block are the only vault-dependent steps.
- **D3.** `init` runs `sync` on the successful-install path only, NOT on the
  "already installed" fast path — running it there would rewrite `digest.md`
  (atomic write, fresh mtime) and churn the manifest, breaking the "second run =
  zero changes" contract. Upgraders whose core predates this fix are covered by
  the fast-path `Tip: run 'wienerdog sync'` hint and by standalone `sync` now
  working on a null vault.
- **D4.** `session-start.sh` needs no change; its `[ -f "$DIGEST" ] || exit 0`
  guard already makes a no-digest SessionStart silent.

## Acceptance criteria

- [ ] `sync` with `vault: null` exits 0, prints the no-vault notice, and installs
      skills + hooks for detected harnesses (no digest, no managed block written).
- [ ] `sync` with `vault:` set to a missing folder still exits 1 with the
      "vault not found at <path>" message.
- [ ] `sync` with a valid vault behaves as before (digest + managed block + hooks
      + skills); the claude/codex adapter golden files are unchanged and green.
- [ ] Fresh machine, Claude present: `wienerdog init` (plain) leaves
      `<claudeDir>/skills/wienerdog-setup` a symlink and `session-start.sh`
      registered in `settings.json`, with NO vault, NO digest, NO managed block.
- [ ] Fresh machine, Claude present: `wienerdog init --fresh-vault` additionally
      produces the vault (git repo), the digest, and the CLAUDE.md managed block.
- [ ] Codex present, plain `init`: `$HOME/.agents/skills/wienerdog-setup` is a
      symlink and `session-start.sh` is registered in `hooks.json`; no AGENTS.md
      block, no vault, no digest.
- [ ] `init --yes` twice = zero core changes; `init --fresh-vault --yes` twice =
      zero changes; the `init`/`sync` combination is idempotent.
- [ ] `npm test` and `npm run lint` pass; the updated `claude-adapter` test and
      the new `bootstrap-seam` test pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
node --test tests/integration/bootstrap-seam.test.js

# Manual seam repro — plain init with Claude "present" registers the skill.
WD=$(mktemp -d)
export HOME=$WD/home WIENERDOG_HOME=$WD/core WIENERDOG_VAULT=$WD/vault \
       CLAUDE_CONFIG_DIR=$WD/claude CODEX_HOME=$WD/absent-codex
mkdir -p "$HOME" "$CLAUDE_CONFIG_DIR"
node bin/wienerdog.js init --yes
test -L "$CLAUDE_CONFIG_DIR/skills/wienerdog-setup" && echo "OK: setup skill registered"
grep -q 'session-start.sh' "$CLAUDE_CONFIG_DIR/settings.json" && echo "OK: hook registered"
test ! -e "$WIENERDOG_HOME/state/digest.md" && echo "OK: no digest (deferred vault)"
test ! -e "$CLAUDE_CONFIG_DIR/CLAUDE.md" && echo "OK: no managed block"
grep -q '^vault: null' "$WIENERDOG_HOME/config.yaml" && echo "OK: vault deferred"

# sync alone on a null vault exits 0 and installs skills + hooks.
node bin/wienerdog.js sync; echo "sync exit: $?"    # expect 0, "no vault yet …" notice

# --fresh-vault then brings memory online.
node bin/wienerdog.js init --fresh-vault --yes
test -e "$WIENERDOG_HOME/state/digest.md" && echo "OK: digest rendered"
grep -q 'wienerdog:begin' "$CLAUDE_CONFIG_DIR/CLAUDE.md" && echo "OK: managed block present"

# Idempotent.
node bin/wienerdog.js init --yes | grep -q 'already installed' && echo "OK: idempotent"
```

## Out of scope (do NOT do these)

- Any change to `src/cli/doctor.js`, `src/cli/adopt.js`, or
  `skills/wienerdog-setup/SKILL.md` — WP-027 already fixed their vault messaging.
- Any change to `src/adapters/shared.js` or `templates/hooks/*.sh`.
- Any change to `scaffoldVault`, the manifest/uninstall reverse semantics, or the
  vault-preservation-on-uninstall rule (M7).
- Making `init` run `sync` on the "already installed" fast path (decision D3).
- Adding a new CLI subcommand or `bin/wienerdog.js` dispatch change.
- Editing any test marked VERIFIED-UNAFFECTED in the census above.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/028-bootstrap-skill-registration`; conventional commits; PR titled
   `fix(sync): register skills + hooks on bootstrap so init leaves /wienerdog-setup usable (WP-028)`.
3. PR template filled, including "Decisions made" (note D1-D4) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
