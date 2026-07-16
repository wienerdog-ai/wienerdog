---
id: WP-108
title: half-sandbox guard — warn when WIENERDOG_HOME is redirected but harness configs are not
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004]
branch: wp/108-half-sandbox-guard
---

# WP-108: half-sandbox guard — warn when WIENERDOG_HOME is redirected but harness configs are not

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): `init`/`sync` write skill links and session hooks
into each detected harness's config dir, all pointing back at the canonical core
(`<core>/skills/…`, `<core>/bin/…`). `getPaths()` (`src/core/paths.js`) resolves the
locations from env, independently:
- `core` = `$WIENERDOG_HOME || ~/.wienerdog`
- `claudeDir` = `$WIENERDOG_CLAUDE_DIR || $CLAUDE_CONFIG_DIR || ~/.claude`
  (`WIENERDOG_CLAUDE_DIR` is a harness-internal test seam)
- `codexDir` = `$CODEX_HOME || ~/.codex`

Because these are independent, a user can redirect the **core** without redirecting the
**harness config dirs**. That combination is a foot-gun: `init`/`sync` then write links +
hooks into the user's **real** `~/.claude` / `~/.codex` that point at the redirected —
and possibly **ephemeral** — core.

**Why this WP exists — the 2026-07-12 → 07-16 dogfooding incident (root cause).** A demo
re-record ran the real installer with `WIENERDOG_HOME` pointed at a `mktemp -d` sandbox
(`/var/folders/.../tmp.XXXX/wd`) but did **not** redirect the Claude config dir. `init`
therefore mutated the real `~/.claude`: it repointed all seven skill symlinks at the temp
core and merged a second SessionStart/SessionEnd hook pair pointing at the temp
`bin/session-*.sh`. Three days later macOS purged the temp dir; every `/wienerdog-*`
command vanished, the nightly dream failed, and every session logged "SessionEnd hook
failed". WP-106 (skill-link target validation) and WP-107 (stale-hook detection) make
`doctor` *catch* the aftermath; **this WP prevents it at the source** by warning at
`init`/`sync` time, before the damaging writes, whenever the core is redirected but a
detected harness's config dir is not co-redirected.

**A persistent custom `WIENERDOG_HOME` is legitimate** (some users deliberately keep the
core elsewhere), so this must **not hard-block**. Decision (recorded here per the
local-decision rule):

- **Warn, do not prompt.** A separate blocking prompt would nag every legitimate
  custom-home user on every `init`/`sync`, and — critically — `sync` runs
  **non-interactively** inside `wienerdog update`'s handoff (`stdio: 'inherit'` but no
  guaranteed TTY) and on scheduled paths; a prompt there reintroduces the Windows
  `irm|iex` init-handoff hang class (WP-072). A loud, explicit **warning** is always safe
  to emit and blocks nothing.
- **`init` still gives a real abort point** without a new prompt: it prints the warning as
  part of its **plan**, *before* its existing `Proceed? [Y/n]` confirmation — so the user
  who is surprised can decline at the prompt they already answer. `sync` (which has no
  confirm) warns-only.
- **Temp-path escalation is worth it.** The incident's core was under `/var/folders`
  (a `mktemp -d`). Detecting that the core lives under a temp dir (`os.tmpdir()`,
  `/var/folders`, `/tmp`, `$TMPDIR`) is a cheap, high-signal discriminator that separates
  the actual failure mode (ephemeral core) from a legitimate permanent custom home, so the
  warning escalates its wording when the core looks temporary. It never changes the
  warn-not-block behavior.

The guard changes no file layout and starts no process — it only prints. It is inert in
the common case (no `WIENERDOG_HOME`, or a fully co-redirected sandbox such as the test
harnesses and the scenario harness, which set `CLAUDE_CONFIG_DIR`/`CODEX_HOME` alongside
`WIENERDOG_HOME`).

## Current state

**`src/cli/init.js`** `run(argv)`: computes `paths = getPaths()` and `harnesses =
detectHarnesses()`, prints a plan (directories, files, vault, then a "Detected AI tools"
block listing Claude Code / Codex CLI found/not-found), then:

```js
if (dryRun) { console.log('\n--dry-run: no changes made.'); return; }
if (!yes) {
  const ok = await confirm('\nProceed? [Y/n] ', { defaultYes: true });
  if (!ok) { console.log('Aborted.'); return; }
}
// … create dirs/config/vault, then:
await require('./sync').run(argv);
```

**`src/cli/sync.js`** `run(argv, opts = {})`: computes `dryRun`, `paths = getPaths()`,
reads the vault path, then does vendor/shim/schedules (inside `if (!dryRun)`), digest,
skills, adapters. It already detects harnesses inline via `detectHarnesses(process.env)`
(twice) and already accepts an `opts` object (with `loader`, `interactive`,
`ensureGoogleReady` seams, WP-105). It is `wienerdog update`'s handoff target
(`spawnSync(node, [newBin, 'sync'], { stdio: 'inherit' })`) and `init`'s final step.

**`src/core/paths.js`** `getPaths(env)` returns `WienerdogPaths` (`home`, `core`,
`claudeDir`, `codexDir`, …). It does not expose *which* env vars were set — the guard must
read `env` directly to know whether a config dir is co-redirected.

**`src/core/detect.js`** `detectHarnesses(env = process.env)` returns
`{ claude:{present,dir}, codex:{present,dir} }`; `present` = the config dir exists,
`dir` = the resolved config dir.

There is no existing "sandbox guard" module. Test harnesses that set `WIENERDOG_HOME`
(e.g. `tests/unit/doctor.test.js` `tempEnv()`) also set `CLAUDE_CONFIG_DIR` and
`CODEX_HOME` to temp dirs — a fully co-redirected sandbox — so the guard is silent there.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/sandbox-guard.js | pure `sandboxMismatchWarning(paths, env, harnesses)` → `string\|null` |
| modify | src/cli/init.js | print the warning in the plan (before the `Proceed?` confirm); pass `{ suppressSandboxWarning: true, harnesses }` (init's snapshot) to its `sync` call |
| modify | src/cli/sync.js | compute ONE harness snapshot per run (`opts.harnesses \|\| detectHarnesses(process.env)`); print the warning near the top of `run` unless `opts.suppressSandboxWarning`; gate each adapter on `snapshot.present ∧ isDir(dir)` — snapshot upper bound + pre-write revalidation (replace the two inline `detectHarnesses` calls); document `opts.suppressSandboxWarning` + `opts.harnesses` |
| create | tests/unit/sandbox-guard.test.js | unit-test the pure function across all branches, plus subprocess integration for `init --dry-run` (warns / silent) and `sync` (warns), and the snapshot-consistency race test |

### Exact contracts

**1. `src/core/sandbox-guard.js` — `sandboxMismatchWarning(paths, env, harnesses)`.**
Pure; reads `env` + the passed harness flags; returns a warning string, or `null` when
there is no mismatch.

```js
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Detect the "half-sandbox" foot-gun: WIENERDOG_HOME redirects the core to a
 *  non-default (possibly ephemeral) location, but one or more DETECTED harness config
 *  dirs are NOT co-redirected — so init/sync will write skill links + session hooks into
 *  the user's REAL ~/.claude / ~/.codex pointing at that core. If the core is later
 *  removed (e.g. a temp dir the OS purges), every /wienerdog-* command and hook there
 *  breaks (the 2026-07-12 demo-sandbox incident). Returns a loud multi-line warning, or
 *  null when there is no mismatch: WIENERDOG_HOME unset, or set to the default core path,
 *  or every DETECTED harness config dir is co-redirected. Reads the disk ONLY via realpath
 *  (to resolve symlink/case aliases when comparing dirs); never writes, never spawns,
 *  never prompts.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {NodeJS.ProcessEnv} env
 *  @param {{claude:{present:boolean,dir:string}, codex:{present:boolean,dir:string}}} harnesses
 *  @returns {string|null} */
function sandboxMismatchWarning(paths, env, harnesses) {
  if (!env.WIENERDOG_HOME) return null;

  const home = env.HOME || os.homedir();
  const defaultCore = path.join(home, '.wienerdog');
  // Redirected only if the core is not the default location. sameDir ALWAYS compares by
  // physicalPath (canonicalize the longest EXISTING ancestor via realpath, re-append the
  // absent suffix) — so a not-yet-created core at init plan time still compares by its
  // existing parent's physical identity (e.g. a symlinked HOME), never a lexical whole-path
  // compare that would false-flag a fresh default core as redirected (round-4).
  if (sameDir(paths.core, defaultCore)) return null;

  // A detected harness is "exposed" when its config dir is the SAME DIRECTORY as the real
  // default — compared by physicalPath IDENTITY, never a lexical string compare. Two ways a
  // string compare fails: (1) env PRESENCE is not co-redirection — CLAUDE_CONFIG_DIR=$HOME/
  // .claude / CODEX_HOME=$HOME/.codex point at the real config; (2) a SYMLINK or a
  // differently-CASED alias (macOS case-insensitive APFS) of ~/.claude mutates the real dir
  // but differs as a string. harnesses.<h>.dir is getPaths()'s resolved dir and a DETECTED
  // harness's dir necessarily EXISTS, so physicalPath fully realpaths it; the default side
  // is canonicalized the same way, so both are physical.
  const claudeDefault = path.join(home, '.claude');
  const codexDefault = path.join(home, '.codex');
  const exposed = [];
  if (harnesses.claude.present && sameDir(harnesses.claude.dir, claudeDefault)) {
    exposed.push({ name: 'Claude Code', dir: harnesses.claude.dir });
  }
  if (harnesses.codex.present && sameDir(harnesses.codex.dir, codexDefault)) {
    exposed.push({ name: 'Codex CLI', dir: harnesses.codex.dir });
  }
  if (exposed.length === 0) return null;

  const temp = looksTemporary(paths.core, env);
  const where = temp
    ? `${paths.core}, which looks like a TEMPORARY directory your system may delete.`
    : `${paths.core}, a non-default location.`;
  const targets = exposed.map((e) => `${e.name} (${e.dir})`).join(', ');
  return [
    `wienerdog: WARNING — WIENERDOG_HOME points the core at ${where}`,
    `But these AI tool config dir(s) are NOT redirected and will receive skill links + session hooks pointing back at that core: ${targets}.`,
    `If that core is ever removed, the /wienerdog-* commands and session hooks written there will break.`,
    `If this is a permanent custom location, you can ignore this. Otherwise co-redirect the config dir (set CLAUDE_CONFIG_DIR / CODEX_HOME to a matching sandbox) or unset WIENERDOG_HOME before continuing.`,
  ].join('\n');
}

/** True iff `a` and `b` are the SAME directory, by PHYSICAL identity via physicalPath
 *  (below). physicalPath canonicalizes the longest EXISTING ancestor of each path (realpath
 *  — resolving symlinks AND case on macOS APFS) and re-appends the not-yet-created suffix,
 *  so: (1) a config dir aliased by a symlink or a differently-cased name is caught; and
 *  (2) a not-yet-created core under a SYMLINKED parent (e.g. a symlinked HOME on a fresh
 *  install) still compares by its parent's physical identity — never a false "redirected"
 *  (round-4 P3). The compare is CASE-SENSITIVE on every platform: for EXISTING dirs realpath
 *  already canonicalizes case on a case-insensitive filesystem; for an ABSENT
 *  differently-cased suffix the compare treats the two names as distinct, which errs toward
 *  a (cautious, non-blocking) WARNING — the safe direction, never hiding a real half-sandbox
 *  (round-6; the case-insensitive-FS false-positive is an accepted residual — see
 *  Implementation notes). @param {string} a @param {string} b @returns {boolean} */
function sameDir(a, b) {
  return physicalPath(a) === physicalPath(b);
}

/** Canonicalize as much of `p` as exists: realpath the longest existing ancestor, then
 *  re-append the unresolved leaf suffix. A whole-path realpath is NOT enough — an absent
 *  leaf beneath a symlinked/case-aliased parent must still compare by that parent's
 *  physical identity (a bare path.resolve fallback would compare divergent lexical parents
 *  and mis-classify a fresh default core as redirected). If nothing up to the filesystem
 *  root resolves (never, in practice — the root always exists), degrade to path.resolve(p).
 *  @param {string} p @returns {string} */
function physicalPath(p) {
  let cur = path.resolve(p);
  const suffix = [];
  for (;;) {
    try {
      const real = fs.realpathSync.native(cur);
      return suffix.length ? path.join(real, ...suffix) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p); // reached the root; nothing resolved
      suffix.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/** True when `p` resolves under a known temp root ($TMPDIR / os.tmpdir() / /var/folders
 *  / /tmp). Best-effort heuristic — only escalates warning wording, never gates — so it
 *  stays lexical (a symlinked temp core merely gets the milder wording, still warns).
 *  @param {string} p @param {NodeJS.ProcessEnv} env @returns {boolean} */
function looksTemporary(p, env) {
  const rp = path.resolve(p);
  const roots = [os.tmpdir(), env.TMPDIR, '/tmp', '/var/folders', '/private/var/folders']
    .filter(Boolean)
    .map((r) => path.resolve(r));
  return roots.some((r) => rp === r || rp.startsWith(r + path.sep));
}

module.exports = { sandboxMismatchWarning };
```

Contract notes:
- **Trigger** = `WIENERDOG_HOME` set **AND** the resolved core ≠ default core **AND** at
  least one **detected** harness's config dir is still at its default location. Undetected
  harnesses never contribute (we would write nothing into them, so no false alarm).
- **Exposure** is judged by **`sameDir` physical identity** — `harnesses.<h>.dir` vs
  `<home>/.<h>` — NOT lexical string compare (Finding 4 + round-3 alias finding).
  `harnesses.<h>.dir` is `getPaths()`'s resolved dir (already honoring
  `WIENERDOG_CLAUDE_DIR`/`CLAUDE_CONFIG_DIR`/`CODEX_HOME`), so this covers every seam AND,
  because `sameDir` realpaths both sides, correctly still warns when the config dir is the
  real one via a **symlink** or a **differently-cased alias** (macOS APFS) — or when a var
  is set to the default path (`CLAUDE_CONFIG_DIR=$HOME/.claude`). A detected harness dir
  necessarily exists, so realpath resolves it.
- **`sameDir` compares by `physicalPath` on both sides** — it realpaths the longest
  EXISTING ancestor of each path and re-appends the not-yet-created suffix, so an absent
  leaf beneath a symlinked/case-aliased parent still compares physically (never a bare
  whole-path lexical fallback). The core-redirect trigger uses `sameDir` too: physical when
  the core exists (sync, an existing install), and — via the ancestor canonicalization —
  still physical through a symlinked `HOME` when the core does not yet exist (init plan
  time), so a fresh default core is never a false "redirected". `looksTemporary`
  deliberately stays lexical (wording-only, never gates).
- The message is fixed-template control-plane text with only trusted, env-derived paths
  interpolated; nothing is executed.

**2. `src/cli/init.js` wiring.** After the "Detected AI tools" plan block and **before**
`if (dryRun)`, print the warning if present, so it shows in both `--dry-run` and the
interactive plan preceding the `Proceed?` confirm:

```js
const { sandboxMismatchWarning } = require('../core/sandbox-guard');
const sandboxWarning = sandboxMismatchWarning(paths, process.env, harnesses);
if (sandboxWarning) console.log(`\n${sandboxWarning}`);
```

Then change init's own `sync` call to (a) suppress the duplicate warning (init already
printed it) AND (b) hand `sync` init's **own harness snapshot**, so the harnesses `sync`'s
adapters write are bounded by the ones init's guard evaluated (a subset — the snapshot
intersected with the still-present dirs at revalidation) — closing the TOCTOU where a harness
appears during init's `Proceed?` wait and `sync` would otherwise re-detect and write it
unwarned (round-7):

```js
await require('./sync').run(argv, { suppressSandboxWarning: true, harnesses });
```

(The only existing call site is the single `await require('./sync').run(argv);` near the
end of `run`; `harnesses` is already computed at the top of init's `run`.)

**3. `src/cli/sync.js` wiring — ONE harness snapshot per run.** Add `suppressSandboxWarning`
AND `harnesses` to the `opts` JSDoc. Compute a single snapshot near the top of `run` and use
it for **both** the guard and the two adapter gates, so no adapter runs for a harness absent
from the fixed snapshot (round-7 TOCTOU); the adapters write a subset of that snapshot (those
still present at revalidation). Print the warning **immediately
after `const vaultPath = readVaultPath(paths.config);`** (right after `const paths =
getPaths();`), i.e. **before** the vault-existence check that can `throw`:

```js
const paths = getPaths();
const vaultPath = readVaultPath(paths.config);
// One harness snapshot for the whole run: the guard warns about the harnesses the adapters
// below MAY write into (they write a subset — those still present at revalidation). From init
// this is init's snapshot (opts.harnesses); a standalone sync detects once here. A harness
// that appears mid-run is not in the snapshot → not written unwarned (round-7).
const harnesses = opts.harnesses || detectHarnesses(process.env);
if (!opts.suppressSandboxWarning) {
  const { sandboxMismatchWarning } = require('../core/sandbox-guard');
  const w = sandboxMismatchWarning(paths, process.env, harnesses);
  if (w) console.log(w);
}
// … existing vault-existence check, manifest load, vendor block, digest, stageSkills …
```

Then, in the adapter phase (Step 3), gate each adapter on the snapshot **intersected with a
just-before-write revalidation that the config dir still exists** — the closed-form fixed
point of this race family (see below). Replace the two inline `detectHarnesses(process.env)`
calls with:

```js
// The initial snapshot is an AUTHORIZATION UPPER BOUND, not a promise the dir still exists.
// Adapter set = { snapshot.present harnesses whose dir is STILL a directory at this check } —
// the intersection of the snapshot and on-disk state at revalidation time. It does not grow
// past the snapshot: a harness that APPEARED mid-run is not in the snapshot → not written
// unwarned (round-7); a harness whose disappearance is OBSERVABLE here fails revalidation →
// skipped (round-8). A removal/symlink-retarget in the window AFTER this check and before the
// adapter's write is an inherent non-atomic-fs micro-race (accepted residual — see
// Implementation notes). fs is already required at the top of sync.js.
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

if (harnesses.claude.present && isDir(harnesses.claude.dir)) {
  const res = applyClaudeAdapter(paths, { dryRun, manifest, skipManagedBlock });
  summary.changed.push(...res.changed); summary.unchanged.push(...res.unchanged); summary.notices.push(...res.notices);
} else if (harnesses.claude.present) {
  console.log('Claude Code config is no longer present; skipping adapter (it will be applied on the next `wienerdog sync`).');
} else {
  console.log('Claude Code not detected; skipping adapter.');
}
if (harnesses.codex.present && isDir(harnesses.codex.dir)) {
  const res = applyCodexAdapter(paths, { dryRun, manifest, skipManagedBlock });
  summary.changed.push(...res.changed); summary.unchanged.push(...res.unchanged); summary.notices.push(...res.notices);
} else if (harnesses.codex.present) {
  console.log('Codex CLI config is no longer present; skipping adapter (it will be applied on the next `wienerdog sync`).');
} else {
  console.log('Codex CLI not detected; skipping adapter.');
}
```

The revalidation is necessary because `applySettings` (`src/adapters/shared.js`)
`fs.writeFileSync`s `settings.json` / `hooks.json` **without** `mkdir`-ing the config dir, so
a snapshot-`present` harness whose dir vanished mid-run would throw `ENOENT` **after** hook
scripts were copied into `core/bin` but **before** `manifestMod.save` — a partial, untracked
write. Skipping the vanished harness avoids that crash entirely.

Print the warning unconditionally w.r.t. `dryRun` (a `sync --dry-run` should still warn).
`detectHarnesses` is already imported at the top of `sync.js`. Placing the guard before the
vault-existence check ensures the warning shows even when a set-but-missing vault makes that
check throw. **Behavior change (call out in the PR):** `sync` now detects harnesses **once**
per run instead of re-detecting at adapter time; a harness whose config dir first appears
*during* a single `init`/`sync` run is configured on the **next** `sync` (idempotent), not
mid-run. This is the supported **appearance** invariant: no adapter runs for a harness absent
from the fixed snapshot. Post-check removal or retarget of a snapshot-present harness remains
subject to the documented residual (the fixed snapshot protects harness appearance, not
physical target identity). The normal case (harness present at run start) is unchanged.

**4. Tests (`tests/unit/sandbox-guard.test.js`).**

Pure-function cases — exposure is decided by the **resolved config dir vs its default**, so
construct `paths`/`env`/`harnesses` literally with explicit dirs (no disk needed). Use a
`home` such as `/home/u`; a `mkHarnesses({claude, codex})` where each value is `false`
(absent) or a resolved dir string (present with that dir); `paths = { core }` (only `core`
is read); and `env = { HOME: home, WIENERDOG_HOME: core }` (or omit `WIENERDOG_HOME`). The
guard reads `env.HOME`/`env.WIENERDOG_HOME` and `harnesses.<h>.dir`/`present` only.

- `WIENERDOG_HOME` unset → `null`.
- `WIENERDOG_HOME` set to the default (`<home>/.wienerdog`) → `null`.
- redirected core + Claude present at the **default** `<home>/.claude` + Codex absent →
  non-null; string contains `Claude Code`, the core path, and `WARNING`.
- redirected core + Claude present at a **non-default** dir (`<sandbox>/.claude`) + Codex
  absent → `null` (co-redirected).
- redirected core + Codex present at the **default** `<home>/.codex` → non-null; contains
  `Codex CLI`.
- redirected core + Codex present at a **non-default** dir → `null`.
- redirected core + **both** present at their defaults → string names both `Claude Code`
  and `Codex CLI`.
- harness **absent** (present:false) though its dir equals the default → `null`.
- **Finding 4 — env var set to the default path does not suppress.** Pass
  `env.CLAUDE_CONFIG_DIR = path.join(home, '.claude')` AND `harnesses.claude.dir =
  path.join(home, '.claude')` (as `getPaths` would resolve it) + redirected core → non-null
  (the guard ignores env presence and sees the dir is the default). Same for
  `CODEX_HOME = <home>/.codex`.
- core under `os.tmpdir()` (redirected + Claude at default) → string contains `TEMPORARY`.
- core at a normal non-temp path (e.g. `/opt/custom/wd`) → string does **not** contain
  `TEMPORARY`.

(The cases above use fake, fully-non-existent dirs: `physicalPath` finds no existing
ancestor except the filesystem root and re-appends the whole lexical suffix, so the result
equals `path.resolve(p)` — the intended behavior for wholly-absent paths, and why these
cases still pass. The alias cases below use **real** dirs so `physicalPath` exercises the
physical `realpath` path — they prove the round-3/round-4 fixes.)

**Physical-identity (alias) cases — create REAL dirs under a temp `HOME`:**

- **Symlink alias of the real config dir → warns (round-3 fix).** `root = mkdtemp`; create
  the real default `const realClaude = path.join(root,'.claude'); fs.mkdirSync(realClaude,{recursive:true});`
  and a symlink alias `const aliasClaude = path.join(root,'claude-link'); fs.symlinkSync(realClaude, aliasClaude);`.
  Call `sandboxMismatchWarning({core: path.join(root,'wd')}, {HOME: root, WIENERDOG_HOME: path.join(root,'wd')},
  mkHarnesses({claude: aliasClaude}))` and assert the result is **non-null** and contains
  `Claude Code` — a lexical compare would have missed it (`claude-link` ≠ `.claude`), but
  `realpath` resolves both to `realClaude`.
- **Case alias of the real config dir → warns (case-insensitive FS only).** Under the same
  `root`, after creating `realClaude`, probe case-insensitivity:
  `const caseInsensitive = fs.existsSync(path.join(root, '.CLAUDE'));`. Guard the test with
  `{ skip: caseInsensitive ? false : 'case-insensitive filesystem only' }`. Call the guard
  with `mkHarnesses({claude: path.join(root, '.Claude')})` (differently-cased) + redirected
  core, and assert **non-null** / contains `Claude Code` — `realpath` canonicalizes the case
  to the on-disk `.claude`. (On a case-sensitive FS the differently-cased leaf does not
  exist, so `physicalPath` canonicalizes the real parent `root` and re-appends `.Claude`,
  which is `≠ root/.claude` → correctly NOT exposed; that is why the test is skipped there,
  not inverted.)
- **Inverse alias must not false-warn.** Real config **co-redirected** to a genuine sandbox:
  create `const sandboxClaude = path.join(root,'sandbox','.claude'); fs.mkdirSync(sandboxClaude,{recursive:true});`
  and call with `mkHarnesses({claude: sandboxClaude})` + redirected core → assert **null**
  (a real, non-default, non-aliased config dir is correctly silent).

**Core-side alias cases (round-4) — the trigger must use physical identity too:**

- **Symlinked `WIENERDOG_HOME` alias of `~/.wienerdog` → `null` (Finding A test gap).**
  `root = mkdtemp`; create the real default core `const realCore = path.join(root,'.wienerdog');
  fs.mkdirSync(realCore,{recursive:true});` and a symlink alias
  `const aliasCore = path.join(root,'wd-link'); fs.symlinkSync(realCore, aliasCore);`. Call
  `sandboxMismatchWarning({core: aliasCore}, {HOME: root, WIENERDOG_HOME: aliasCore},
  mkHarnesses({claude: path.join(root,'.claude')}))` (create `root/.claude` so Claude is
  present at its default). Assert the result is **null** — the core is the real default via
  a symlink, so it is NOT a half-sandbox; a lexical trigger (`wd-link` ≠ `.wienerdog`) would
  have produced a **false** warning.
- **Differently-cased `WIENERDOG_HOME` of `~/.wienerdog` → `null` (case-insensitive FS
  only).** Same `root` + real `.wienerdog` + `root/.claude`; guard with the same
  `caseInsensitive` probe. Pass `WIENERDOG_HOME = path.join(root, '.WIENERDOG')` and
  `paths.core` = the same; assert **null** (realpath canonicalizes the case to the on-disk
  `.wienerdog`).
- **Fresh (not-yet-created) core under a SYMLINKED `HOME` → `null` (Finding B).** Create a
  physical home and a symlink to it: `const physHome = path.join(root,'phys'); fs.mkdirSync(physHome,{recursive:true});
  const linkHome = path.join(root,'link'); fs.symlinkSync(physHome, linkHome);`, and a real
  default harness dir under the physical home: `fs.mkdirSync(path.join(physHome,'.claude'),{recursive:true});`.
  Call `sandboxMismatchWarning({core: path.join(physHome, '.wienerdog')}, {HOME: linkHome,
  WIENERDOG_HOME: path.join(physHome, '.wienerdog')}, mkHarnesses({claude: path.join(linkHome,'.claude')}))`
  — the core does **not** exist yet, `HOME` is the symlink (`linkHome`) while
  `WIENERDOG_HOME` names the same core through the physical parent (`physHome`). Assert
  **null**: `physicalPath` canonicalizes the existing parent on each side (`linkHome →
  physHome` for the default, `physHome` for `WIENERDOG_HOME`) and both re-append
  `.wienerdog`, so the core is recognized as the default and NOT flagged redirected. A
  whole-path `path.resolve` fallback (the pre-round-4 code) would compare `link/.wienerdog`
  vs `phys/.wienerdog` and emit a **false** warning.
- **Absent differently-cased suffix → WARNS (pins the no-fold behavior; round-6).** `root =
  mkdtemp`; do **NOT** create `.wienerdog` (default core absent); create `root/.claude`
  (Claude present at its default). Call `sandboxMismatchWarning({core: path.join(root,'.WIENERDOG')},
  {HOME: root, WIENERDOG_HOME: path.join(root,'.WIENERDOG')}, mkHarnesses({claude: path.join(root,'.claude')}))`
  and assert the result is **non-null** and contains `Claude Code`. Because `sameDir`
  compares case-sensitively on every platform (no win32 case-fold), the absent `.WIENERDOG`
  suffix is distinct from the default `.wienerdog`, so the trigger does not suppress and the
  guard warns. **This pins the intended direction:** the guard must NEVER silently suppress
  here — a suppression would be the dangerous false NEGATIVE (hiding a real half-sandbox on
  case-sensitive NTFS) that the removed round-5 win32 fold caused. On a case-insensitive FS
  this warning is the accepted benign residual; on a case-sensitive FS it is correct. The
  assertion is platform-agnostic (no `process.platform` branch exists to gate), so a future
  re-introduction of a case-fold would flip this to `null` — the test fails, flagging the
  regression. (A win32-only re-fold would additionally need manual Windows verification,
  since the repo has no Windows CI runner — WP-058/064 precedent.)

Integration (subprocess, mirroring `doctor.test.js`'s `run(args, env)` + isolated temp
`HOME`; do **not** set `CLAUDE_CONFIG_DIR`/`CODEX_HOME` for the exposed cases, so the
harness config dirs sit at their real default relative to the temp `HOME`):

**Assertion note (important):** the warning is **multi-line** — "WIENERDOG_HOME points
the core at …" and "… Claude Code (…)" are on **different lines**. A single regex
`/WIENERDOG_HOME points the core at .*Claude Code/` would **fail** (JS `.` does not cross
`\n` without the `s` flag). Assert the two lines separately, e.g.
`assert.match(r.stdout, /WIENERDOG_HOME points the core at/)` **and**
`assert.match(r.stdout, /Claude Code \(/)`.

- **`init --dry-run` warns on a half-sandbox.** temp `root`; create `root/.claude` (so
  Claude is detected); `env = { ...process.env, HOME: root, WIENERDOG_HOME:
  path.join(root, 'wd'), WIENERDOG_VAULT: path.join(root,'vault'),
  WIENERDOG_LOADER_NOOP:'1' }` with **no** `CLAUDE_CONFIG_DIR`/`CODEX_HOME` (delete both
  from the cloned env if present). Run `init --dry-run`; assert
  `r.stdout` matches `/WIENERDOG_HOME points the core at/` **and** `/Claude Code \(/`.
  (A `mktemp` `root` under the OS temp dir also triggers the `TEMPORARY` wording — do not
  assert on temp-vs-not; the two substrings above are stable.)
- **`init --dry-run` is silent when co-redirected.** Same, but create AND point the
  config dirs elsewhere so both harnesses are present yet co-redirected:
  `const claudeCfg = path.join(root,'claude-cfg'); const codexCfg = path.join(root,'codex-cfg');
  fs.mkdirSync(claudeCfg,{recursive:true}); fs.mkdirSync(codexCfg,{recursive:true});
  env.CLAUDE_CONFIG_DIR = claudeCfg; env.CODEX_HOME = codexCfg;` (creating them makes the
  harnesses *detected*, so this asserts co-redirection — not mere absence — suppresses the
  warning). Assert `r.stdout` does **not** match `/WIENERDOG_HOME points the core/`.
- **`sync` warns on a half-sandbox.** Same exposed env as the first case. `sync` needs a
  config, so `run(['init','--yes'], env)` first (its own internal sync call suppresses the
  warning), then `run(['sync'], env)` and assert its stdout matches
  `/WIENERDOG_HOME points the core at/` **and** `/Claude Code \(/`. This proves the
  standalone-sync wiring emits it even though init's internal sync call suppressed it.
- **`init --yes` prints the warning EXACTLY ONCE (no double-print; Finding 5).** Same
  exposed env as the first case; run `const r = run(['init','--yes'], env)` (a single,
  non-dry-run command that both prints the plan AND calls its internal `sync`). Assert the
  warning's first-line prefix occurs exactly once:
  `assert.equal(r.stdout.split('WIENERDOG_HOME points the core at').length - 1, 1)`. This
  fails if init forgets to pass `{ suppressSandboxWarning: true }` to its `sync` call (the
  internal sync would then print a second copy). Keep this test **separate** from the
  standalone-`sync` test above.
- **Env var set to the DEFAULT path still warns (Finding 4).** Same as the first case but
  set `env.CLAUDE_CONFIG_DIR = path.join(root, '.claude')` explicitly (equal to the default
  relative to `HOME=root`, with `root/.claude` created). Run `init --dry-run`; assert
  `r.stdout` matches `/WIENERDOG_HOME points the core at/` **and** `/Claude Code \(/` — env
  *presence* pointing at the real config does not suppress the warning.

Guard none of these subprocess cases with a platform skip — they use plainly-distinct
redirected paths (no aliasing), so they behave identically on POSIX + win32 CI. (The
alias-specific cases above carry their own skips where a case-insensitive filesystem is
required.)

**Snapshot-consistency (rounds 7–8) — in-process `sync.run` with an injected snapshot.**
These must call `sync.run(argv, opts)` **in process** (only that can inject `opts.harnesses`),
so use the hermetic sync harness from `tests/unit/sync-repoint.test.js` (temp core +
`config.yaml` with vault **unset** + saved manifest + `WIENERDOG_LOADER_NOOP=1` +
`process.env` pointed at the temp core, stdout silenced, env restored in `finally`).

**Critical env fix (round-8 Finding 1):** that harness points `CLAUDE_CONFIG_DIR` at an
**absent** path, and `getPaths()` gives `CLAUDE_CONFIG_DIR` precedence over `~/.claude` — so
merely `mkdir`-ing `root/.claude` does NOT make a fresh `detectHarnesses` see Claude, and the
adapter would skip under BOTH old and new code, proving nothing. Each case below must:
`const claudeDir = path.join(root, '.claude');` then set `process.env.CLAUDE_CONFIG_DIR =
claudeDir` and **delete** `process.env.WIENERDOG_CLAUDE_DIR` (restore both in `finally`), so
the resolved Claude dir IS `claudeDir`. Point Codex at an absent dir throughout.

- **(a) Upper bound — `present:false` snapshot skips even when a fresh detect WOULD be present
  (round-7).** `fs.mkdirSync(claudeDir, {recursive:true})`; assert the fresh detect is present
  first: `assert.equal(require('../../src/core/detect').detectHarnesses(process.env).claude.present, true)`.
  Then drive `await sync.run(['sync'], { loader: noop, interactive: false, suppressSandboxWarning: true,
  harnesses: { claude: { present: false, dir: claudeDir }, codex: { present: false, dir: path.join(root,'.codex') } } })`.
  Assert the Claude adapter was **skipped despite the dir existing and fresh-detect being
  present**: `assert.equal(fs.existsSync(path.join(claudeDir,'settings.json')), false)` and
  `assert.equal(fs.existsSync(path.join(claudeDir,'skills')), false)`. This now genuinely
  proves the snapshot (not a fresh detect) governs.
- **(b) Revalidation — `present:true` snapshot with the dir GONE succeeds without writing
  (round-8 Finding 2).** Do **not** create `claudeDir` (or create then `fs.rmSync` it), so a
  snapshot can claim `present:true` for a dir that no longer exists. Drive
  `await assert.doesNotReject(() => sync.run(['sync'], { loader: noop, interactive: false, suppressSandboxWarning: true,
  harnesses: { claude: { present: true, dir: claudeDir }, codex: { present: false, dir: path.join(root,'.codex') } } }))`.
  Assert `sync` **did not throw** and wrote nothing into the missing harness:
  `assert.equal(fs.existsSync(claudeDir), false)` (not recreated) and `assert.equal(fs.existsSync(path.join(claudeDir,'settings.json')), false)`.
  Without the `isDir` revalidation, `applySettings` would `ENOENT` here after copying hook
  scripts — a partial, untracked write.
- **(c) Intersection allows a genuinely present harness.** `fs.mkdirSync(claudeDir,{recursive:true})`;
  drive `sync.run` with `harnesses: { claude: { present: true, dir: claudeDir }, codex: { present:false, dir: … } }`.
  Assert the Claude adapter **ran**: `assert.equal(fs.existsSync(path.join(claudeDir,'settings.json')), true)`.
  This proves the gate is the intersection (not over-restrictive): `present:true ∧ isDir` →
  written.

## Implementation notes & constraints

- **Warn, never block, never prompt.** No new `confirm()` call anywhere. `init`'s
  existing `Proceed?` is the abort point; `sync` warns and proceeds. This keeps the
  `update`-handoff and any non-TTY `sync` hang-free (WP-072 class).
- **Silent in the common + co-redirected cases.** No `WIENERDOG_HOME` → null. Fully
  co-redirected sandbox (config dirs also redirected, as every test/scenario harness does)
  → null. So this adds zero noise to normal installs and to CI.
- **Detected harnesses only.** Never warn about a harness config dir Wienerdog will not
  write into (present:false).
- **Snapshot as a monotonic authorization upper bound (rounds 7–9).** The set of harnesses
  `sync` writes is bounded above by the guard's snapshot and refined by a pre-write
  revalidation; it does not grow past the snapshot:
  - **Upper bound (round-7, appearance) — watertight.** The gate is `snapshot.present ∧ …`
    and the snapshot is a **fixed value** captured once (`opts.harnesses ||
    detectHarnesses(process.env)`; init passes its plan-time snapshot, a standalone `sync`
    detects once) used for BOTH the guard and the adapter gates. A harness that *appears*
    mid-run is not in the snapshot, so it is **not** written this run (deferred to the next
    `sync`) — no filesystem race can change a fixed snapshot value, so this direction has no
    TOCTOU.
  - **Revalidation (rounds 8–9, disappearance) — reduces, does not eliminate, the crash
    window.** The snapshot is not a promise the dir still exists, so each snapshot-`present`
    harness is re-checked (`isDir(harnesses.<h>.dir)`) immediately before its adapter runs; a
    disappearance **observable at that check** skips the adapter, avoiding the `applySettings`
    `ENOENT` (hooks copied, manifest not yet saved) that a stale `present:true` gate would
    hit. **Accepted residual (round-9):** filesystem ops are not atomic, so a removal or
    symlink-retarget in the window **after** `isDir` returns and before/during the adapter's
    writes is an inherent micro-race — `applyManagedBlock` may recreate the dir, or
    `applySettings` may still `ENOENT` after copying hooks. Revalidation shrinks the exposure
    to that sub-operation window. A later `sync` reconverges the then-current target where
    artifacts remain discoverable, but ownership metadata or writes through a transient
    symlink target can remain orphaned: on retry `applySettings`/`applyManagedBlock` classify
    files created by the failed run as pre-existing (`createdFile:false`), losing deletion
    provenance; unrecorded copied-skill directories are explicitly preserved rather than
    adopted; and a transient symlink target that is subsequently restored is not visited by
    the next `sync` at all, leaving its hooks or managed files orphaned. Adapter-level atomic
    writes (`mkdir -p` + temp-file rename inside each adapter) would reduce torn-file risk but
    would not by themselves bind writes to the checked physical directory or transactionally
    commit manifest ownership — partial hardening, not a complete closure, and out of scope
    for a warning/guard WP (a candidate for the separate adapter-atomicity hardening WP noted
    in Out of scope). This is not the incident this WP addresses.
  - **Net:** the adapter set is `⊆ snapshot.present` (watertight) and, evaluated at
    revalidation time, `= { h : snapshot[h].present ∧ isDir(h.dir) }` — a subset of both the
    snapshot the guard warned about and what old adapter-time detection would write. Do
    **not** re-`detectHarnesses` in the adapter phase (reopens the appearance false-negative)
    and do **not** drop the revalidation (widens the disappearance crash window back to the
    whole adapter phase).
- **Physical identity via `sameDir`/`physicalPath` for BOTH compares** (the trigger
  core-vs-default AND each exposure harness-dir-vs-default). Never a bare lexical
  `path.resolve` for these — a symlinked or differently-cased alias (macOS APFS) of the
  real config dir or of `~/.wienerdog` would slip past a string compare while the adapter
  still writes the real dir (round-3/round-4 findings). `physicalPath` handles the
  not-yet-created core at `init` plan time by canonicalizing the longest **existing
  ancestor** (e.g. a symlinked `HOME`) and re-appending the absent leaf, so a fresh default
  core is never mis-flagged as redirected. Only `looksTemporary` stays lexical (it affects
  wording, never the warn/suppress decision).
- **Accepted residual — absent differently-cased suffix on a case-insensitive filesystem
  (rounds 5–6).** `sameDir` compares `physicalPath` results **case-sensitively on every
  platform** (no win32 case-fold). Consequence, in ONE exotic config: on a case-insensitive
  filesystem (default Windows OR macOS APFS), if the default core does **not** yet exist AND
  the user has deliberately set `WIENERDOG_HOME` to a *differently-cased* alias of that
  not-yet-created default (e.g. `~/.WIENERDOG` vs `~/.wienerdog`), `physicalPath` re-appends
  the absent suffix with its original case, so the trigger sees two distinct names and emits
  one **spurious, cautious, non-blocking** half-sandbox warning. **Why accepted, not fixed:**
  a correct fix needs runtime detection of the target path's case behavior (a probe write) —
  disproportionate complexity for a warning-only feature under an exotic, self-inflicted
  config; and once the default core exists (the normal case) `realpath` canonicalizes the
  leaf, so the warning is correct. **Why this direction:** an earlier win32 `toLowerCase`
  fold (round 5) was **removed** in round 6 because it introduced the opposite, *dangerous*
  error — on case-sensitive NTFS (per-directory case sensitivity, an explicit `fsutil`/WSL
  opt-in; https://learn.microsoft.com/en-us/windows/wsl/case-sensitivity) it would have
  *hidden a real half-sandbox* (a false NEGATIVE, silently letting init/sync mutate real
  harness configs). A case-sensitive compare keeps the only residual a benign false
  **positive** (an extra cautious warning), never a false negative — consistent with the
  guard's warn-not-block posture. One symmetric residual across both case-insensitive
  platforms beats two asymmetric per-platform residuals. Documented, bounded, low-impact
  (THREAT-MODEL/residual conventions).
- **No double-print during `init`.** `init` prints once (pre-confirm) and passes
  `{ suppressSandboxWarning: true }` to its `sync` call; standalone `sync` and the
  `update` handoff print once. Do not remove the suppress flag "to be safe" — it prevents
  the plan warning and the sync warning stacking in one `init` run.
- **Codex coverage is included** (not just Claude, which the incident hit) because the
  same foot-gun applies via `CODEX_HOME`; the check is symmetric and cheap.
- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input, no mutation, no shell. `sandboxMismatchWarning` reads
      `process.env` values (already-trusted, user-controlled configuration) and builds a
      fixed-template string with env-derived paths interpolated for display only. It reads
      the filesystem only via `fs.realpathSync.native` (to compare directory identity) —
      it never **writes** the filesystem, never spawns a process, and never prompts. The
      temp-path heuristic only affects wording. The guard **function** cannot change what
      `init`/`sync` write — it only prints. The WP's `sync` change writes into at most
      `{ h : snapshot[h].present ∧ isDir(h.dir) }` (evaluated at revalidation) — a subset of
      BOTH the guard's snapshot AND what old adapter-time detection would write, so it never
      writes into **more** harnesses than before, only fewer. The appearance direction is
      watertight (a harness absent from the fixed snapshot is never written unwarned); the
      pre-write `isDir` revalidation closes the disappearance `ENOENT`/partial-write window
      **observable before adapter entry**. A removal or symlink-retarget in the window AFTER
      the `isDir` check remains an inherent non-atomic-filesystem micro-race (accepted
      residual — see Implementation notes). A later `sync` reconverges the then-current target
      where artifacts remain discoverable, but ownership metadata or writes through a transient
      symlink target can remain orphaned; adapter-level atomic writes would be partial
      hardening, not a complete closure.

## Acceptance criteria

- [ ] With `WIENERDOG_HOME` set to a non-default path and a detected harness whose config
      dir is not co-redirected, `wienerdog init` prints the warning **in its plan, before
      the `Proceed?` confirm**, and `wienerdog sync` prints it near the start — both
      **without blocking** (init still confirms; sync still proceeds; exit 0).
- [ ] When the core is redirected under a temp dir, the warning escalates its wording to
      call the location TEMPORARY.
- [ ] The guard is **silent** when `WIENERDOG_HOME` is unset, set to the default core
      path, or every detected harness's **resolved** config dir is a **non-default**
      location. It still **warns** when a seam var is set to the default path
      (`CLAUDE_CONFIG_DIR=$HOME/.claude`, `CODEX_HOME=$HOME/.codex`) — exposure is judged
      from the resolved dir, not env-var presence (Finding 4).
- [ ] The guard still **warns** when a config dir reaches the real default via a **symlink**
      or a **differently-cased alias** (macOS case-insensitive APFS) — exposure is judged by
      physical `realpath` identity, not a lexical string compare (round-3 fix); a genuinely
      non-default sandbox dir stays silent.
- [ ] The **core-redirect trigger** also uses physical identity (round-4): a symlinked
      `WIENERDOG_HOME` alias of `~/.wienerdog` — or an **existing** differently-cased one on
      a case-insensitive FS — is recognized as the default (→ **silent**), and a fresh,
      not-yet-created default core under a **symlinked HOME** does **not** produce a false
      warning (`physicalPath` canonicalizes the existing parent, not just the whole path).
- [ ] `sameDir` compares **case-sensitively on every platform** (no win32 case-fold), so it
      never hides a real half-sandbox on case-sensitive NTFS. The only residual is a benign
      false **positive**: an *absent* differently-cased `WIENERDOG_HOME` suffix on a
      case-insensitive FS produces one spurious cautious warning (pinned by a test); it is
      never suppressed (round-6).
- [ ] A single `wienerdog init --yes` on a half-sandbox prints the warning **exactly once**
      (init prints once, pre-confirm; the internal sync call is suppressed) — asserted in a
      single-command test (Finding 5).
- [ ] `sync` writes into at most `{ h : snapshot[h].present ∧ isDir(h.dir) }` (evaluated at
      revalidation) — bounded above by the guard's one snapshot (`opts.harnesses ||
      detectHarnesses`, with `init` passing its plan-time snapshot) and refined by a pre-write
      `isDir` revalidation, never growing past the snapshot. A harness that **appears** mid-run
      is deferred to the next `sync`, never written unwarned (watertight; round-7); a harness
      whose **disappearance is observable at revalidation** is skipped, so `sync` does not
      `ENOENT`-crash for it (round-8). A removal in the window after the `isDir` check is an
      accepted non-atomic-fs micro-race residual (round-9). Asserted by the three-case
      snapshot-consistency test (present-false-skips, present-true-gone-succeeds-without-writing,
      present-true-there-writes).
- [ ] No prompt is added; no path is blocked; nothing that outlives the command is
      started (ADR-0004).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "sandbox-guard"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Blocking or prompting when the mismatch is detected — warn only (recorded decision).
- Auto-co-redirecting the config dirs, or refusing to write links/hooks — the warning itself
  neither blocks nor suppresses adapters; adapters are attempted only for snapshot-present
  harnesses that pass revalidation (a passing revalidation is not a promise the write succeeds
  — an adapter may still fail per the documented residual). The guard only warns first.
- Adapter-level atomic writes (`mkdir -p` + temp-file rename inside each adapter) to close the
  post-`isDir` micro-race — the residual is bounded and inherent to non-atomic fs ops; atomic
  writes would be partial hardening (reducing torn-file risk) but would not bind writes to the
  checked physical directory or transactionally commit manifest ownership, so a complete fix is
  a separate adapter-atomicity hardening WP, not this warning/guard WP. **Motivation for that
  WP:** a crashed `sync` orphans manifest provenance (a failed run's files reclassify
  `createdFile:false` on retry, unrecorded copied-skill dirs are preserved rather than adopted,
  and writes through a since-restored transient symlink target are not re-visited).
- Any broader `sync` refactor beyond the round-7 snapshot threading. Touch **only** what the
  single-snapshot fix needs: compute the snapshot once, reuse it for the guard + the two
  adapter gates, and accept `opts.harnesses` from `init`. Do not restructure the vendor /
  scheduler / digest phases or add other detection seams.
- The `doctor`-side detection of the *aftermath* (repointed skill links / stale hooks) —
  those are **WP-106** and **WP-107**.
- Changing `getPaths()` semantics or adding a `WIENERDOG_CODEX_DIR` seam — not needed.
- A new ADR — the warn-not-block choice is a local `init`/`sync` UX decision recorded in
  this spec's Context; it implements, not amends, ADR-0004's reversibility/no-process
  posture.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/108-half-sandbox-guard`; conventional commits; PR titled
   `feat(init,sync): warn on a half-sandbox WIENERDOG_HOME redirect (WP-108)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Design-review record

- **Round 1 (2026-07-16, wd-architect self-review — Codex plugin unavailable).** Verified
  the trigger against `getPaths()`'s env seams, init's single `require('./sync').run(argv)`
  call site, and sync's existing `opts` + `detectHarnesses` import. Applied: **P2** — two
  integration assertions matched `/…points the core at .*Claude Code/` across a `\n`
  boundary of the multi-line warning (would fail without the `s` flag) → split into
  per-line asserts; **P3** — sync.js wiring anchor pinned to immediately after
  `readVaultPath` (before the vault-existence check that can `throw`); **P3** — co-redirect
  negative test now creates the redirected config dirs so the harnesses are detected.
- **Round 2 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Two
  findings, both verified accurate and applied:
  - **P2** — the guard suppressed on env-var **presence** (`CLAUDE_CONFIG_DIR` /
    `WIENERDOG_CLAUDE_DIR` / `CODEX_HOME` set) without checking where it pointed, so
    `CLAUDE_CONFIG_DIR=$HOME/.claude` (valid, realistic) silenced the warning while the
    real config stayed exposed — recreating the incident. Fixed: exposure is now judged
    from the **resolved config dir vs its default** (`path.resolve(harnesses.<h>.dir) ===
    path.resolve(<home>/.<h>)`), covering every seam; added a pure case and an integration
    test where the seam var is set to the default path and the guard still warns.
  - **P2** — the no-double-print acceptance criterion was untested: the sync test ran
    `init --yes` only as setup and discarded its output, so a double-print in init would
    pass. Fixed: added a single-command `init --yes` integration test asserting the warning
    prefix occurs **exactly once**.
- **Round 3 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Four
  round-2 fixes confirmed against source; one new finding, verified accurate and applied:
  - **P2** — `path.resolve` is purely lexical, so a **symlink** or **differently-cased**
    (macOS APFS) alias of the real `~/.claude` / `~/.codex` evaded the string compare while
    the adapter still mutated the real dir — recreating the incident; inverse aliases could
    also false-warn. Fixed: a new `sameDir(a,b)` helper compares by **physical identity**
    (`fs.realpathSync.native`, resolving symlinks + case), falling back to lexical
    `path.resolve` only when a side is unresolvable (a not-yet-created core at init plan
    time). Applied to BOTH the exposure compare (both sides realpath'd, per the coordinator
    note) and the core-redirect trigger. `looksTemporary` stays lexical (wording-only).
    Added symlink-alias, case-alias (case-insensitive-FS-guarded), and inverse-alias tests;
    updated the JSDoc + security note (the function now reads disk via realpath, never
    writes).
- **Round 4 (2026-07-16, genuine Codex adversarial review, orchestrator session).** The
  exposure-side `sameDir` fix (incl. the case-insensitive-FS guard) confirmed sound. Two new
  findings, both verified accurate and applied:
  - **P2** — an Implementation-notes bullet still mandated `path.resolve` for the
    core-redirect trigger and called it sufficient, contradicting the round-3 contract that
    applies `sameDir` there; and no test proved a symlinked/case-aliased `WIENERDOG_HOME`
    returns `null`. Fixed: rewrote the stale note to require physical identity, and added
    core-side symlink-alias + case-alias tests asserting `null`.
  - **P3** — `sameDir`'s whole-path lexical fallback lost aliases in existing *parent*
    components: on a fresh install a symlinked `HOME` with a not-yet-created
    `~/.wienerdog` made both realpath calls fail, then `path.resolve` compared divergent
    lexical parents and mis-flagged the default core as redirected (false warning). Fixed:
    replaced the fallback with a `physicalPath` helper that canonicalizes the longest
    EXISTING ancestor and re-appends the absent suffix; added a fresh-core symlinked-HOME
    test asserting `null`.
- **Round 5 (2026-07-16, genuine Codex adversarial review, orchestrator session).**
  `physicalPath` mechanics confirmed sound (root termination, intermediate existing
  symlinks, relative paths, trailing separators, drive roots, UNC fixed-point). Two
  findings:
  - **P2 (applied)** — the live code-block comments still described a lexical `path.resolve`
    fallback for an absent side, contradicting the `physicalPath` contract and inviting a
    reintroduction of the round-4 bug. Swept the ENTIRE spec: rewrote the trigger and
    exposure comments to state that `sameDir` always compares `physicalPath` results
    (longest-existing-ancestor canonicalization), and reworded the integration-test
    platform-skip justification. Lexical `path.resolve` is now referenced only for
    `looksTemporary` and `physicalPath`'s unreachable-root degradation. (The dated
    Design-review entries below are a historical changelog of what each round did and are
    left as-is.)
  - **P3 (disposition: minimal fix + accepted residual)** — an absent differently-cased
    suffix compared unequal on case-insensitive filesystems (a not-yet-created `.WIENERDOG`
    vs `.wienerdog`). Applied the reviewer's "at minimum": `sameDir` case-folds on `win32`
    (deterministically case-insensitive, no probe). The case-insensitive-**macOS** variant
    (absent default core + differently-cased `WIENERDOG_HOME` alias) is recorded as an
    **accepted residual** — warning-only, exotic self-inflicted config, and a correct macOS
    fix needs runtime filesystem-case detection disproportionate to the impact (reason in
    Implementation notes). Spec-owner call under the repo's simplicity-first ethos, per the
    latitude granted.
- **Round 6 (2026-07-16, genuine Codex adversarial review, orchestrator session).** The P2
  sweep verified complete; the macOS residual accurately described; `toLowerCase` confirmed
  free of a Turkish-locale issue. One finding, applied via the coordinator-endorsed
  symmetric trade:
  - **P2 (applied — removed the win32 fold)** — the unconditional win32 `toLowerCase` could
    **hide a real half-sandbox** on case-sensitive NTFS (per-directory case sensitivity via
    `fsutil`/WSL) — a false NEGATIVE letting init/sync mutate real harness configs unwarned.
    Spec-owner call (latitude granted): **dropped the win32 fold** so `sameDir` is a plain
    case-sensitive `physicalPath` compare on every platform. This collapses the round-5
    two-asymmetric-residuals (macOS false-positive + NTFS false-negative) into **one
    symmetric residual** — a benign false **positive** (an extra cautious, non-blocking
    warning) for an *absent* differently-cased suffix on any case-insensitive FS, never a
    false negative. One consistent residual, in the safe direction, aligned with the guard's
    warn-not-block posture; simpler code (no `process.platform`). Added a **platform-agnostic
    pinning test** (absent differently-cased suffix → WARNS) so a future re-fold regresses
    the test. Residual documented in Implementation notes (the two prior residuals now cite
    each other via this unified note).
- **Round 7 (2026-07-16, genuine Codex adversarial review, orchestrator session).** The
  fold removal, unified residual, pinning test, and both acceptance criteria verified
  internally coherent. One new finding, applied:
  - **P2 (applied — disposition (a): thread one snapshot)** — a TOCTOU: the guard warned off
    one harness snapshot, but `sync` re-detected harnesses at adapter-write time (two
    `detectHarnesses(process.env)` calls) and `init` suppressed `sync`'s warning
    unconditionally — so a config dir appearing during `init`'s `Proceed?` wait (potentially
    long) or `sync`'s vendor/scheduler work would be written **unwarned**, falsifying the
    no-false-negatives guarantee. The double-detection is pre-existing `sync` behavior, but
    the guarantee is WP-108's, so the fix is in scope. Chose disposition (a) over accepting
    the race because the fix is genuinely small (one snapshot param) and lives in files
    already in Deliverables: `sync` now computes ONE snapshot (`opts.harnesses ||
    detectHarnesses(process.env)`) and uses it for the guard AND both adapter gates; `init`
    passes its plan-time snapshot in. **Called-out behavior change:** a harness appearing
    mid-run is deferred to the next (idempotent) `sync`, never written mid-run — the safe
    direction. Added a snapshot-consistency test (adapter phase honors the injected snapshot,
    not a fresh detect) + an acceptance criterion; bounded the sync change in Out of scope.
  - **WP-106/107 cross-check (per the coordinator):** `doctor` is **read-only** and already
    uses a **single** `harnesses = detectHarnesses()` snapshot for the summary, scheduler,
    skill-link (WP-106), and hook (WP-107) checks — it never writes, so a mid-run harness
    appearance is immaterial (it would at most print/omit a check line). No change needed to
    WP-106/107; recorded so round 8 cannot reopen them.
- **Round 8 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Two
  findings on the round-7 snapshot threading, both applied:
  - **P2 (test env)** — the round-7 snapshot-consistency test inherited `sync-repoint`'s
    `CLAUDE_CONFIG_DIR` pointed at an *absent* path, which `getPaths()` prefers over
    `~/.claude`, so creating `root/.claude` never made a fresh detect present and the test
    passed even if `sync` still re-detected. Fixed: each case now sets
    `CLAUDE_CONFIG_DIR=claudeDir`, clears/restores `WIENERDOG_CLAUDE_DIR`, and asserts
    `detectHarnesses(process.env).claude.present === true` before invoking `sync` with the
    injected `present:false` snapshot.
  - **P2 (inverse race — the substantive one)** — round-7 handled only harness *appearance*.
    A harness present at snapshot time but **removed** during init's confirm wait / sync's
    vendor work left a stale `present:true` gate that called the adapter → `applySettings`
    `ENOENT` (hooks already copied, manifest not saved) — a partial untracked write, and it
    falsified the "only ever fewer writes" claim. Fixed with the **closed-form fixed point**:
    the snapshot is a monotonic **authorization upper bound**, and each `present:true` dir is
    **revalidated** (`isDir`) immediately before its adapter runs. Effective write set =
    `snapshot.present ∩ isDir(dir)` — can only shrink vs the snapshot, covering BOTH races
    (appearance not in snapshot; disappearance fails revalidation). Stated as a closed-form
    property in the contract + Implementation notes + security claim so it is verifiable as
    one invariant, not an enumerable case list. Added the inverse (disappearance) test and a
    positive intersection test.
- **Round 9 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Design
  confirmed sound and the three tests adequate; the single finding was **overclaiming**, not
  a defect. The `isDir` revalidation closes the disappearance `ENOENT`/partial-write window
  only when the disappearance is **observable before adapter entry**; a removal or
  symlink-retarget in the window AFTER `isDir` and before/during the adapter's write is an
  inherent non-atomic-filesystem micro-race. Applied exactly as recommended: **qualified the
  invariant language** in the wiring contract, Implementation notes, security checklist, and
  acceptance criteria (the appearance upper bound stays watertight — a fixed snapshot has no
  TOCTOU; only the disappearance/crash claim is softened); **recorded the post-check
  micro-race as an accepted residual** (inherent to non-atomic fs; a stronger guarantee needs
  adapter-level atomic writes — a separate hardening WP, added to Out of scope); **fixed the
  contradictory Out-of-scope line** (now "every snapshot-present harness that remains a
  directory at revalidation is written"); and did a one-pass **absolute-language sweep**
  (`exactly`/`never`/`always`) — softened two "exactly the harnesses" claims in the wiring
  prose to the subset relation. The three tests are unchanged (Codex confirmed they correctly
  pin upper-bound, pre-check disappearance, and positive intersection; they do not — and now
  do not claim to — prove the concurrent post-check race).
- **Round 10 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Three
  residual wording defects, all applied close to Codex's recommended language (verbatim-ish,
  to stop paraphrase drift):
  - **Residual overclaimed automatic recovery** — replaced "the next idempotent `sync`
    repairs" (Implementation notes + security checklist) with: a later `sync` reconverges the
    then-current target where artifacts remain discoverable, but ownership metadata or writes
    through a transient symlink target can remain orphaned (`createdFile:false` reclassification
    on retry losing deletion provenance; unrecorded copied-skill dirs preserved not adopted; a
    since-restored transient symlink target not re-visited). Adapter-level atomic writes
    reframed as **partial hardening**, not a complete closure.
  - **Absolute ignoring the symlink-retarget residual** — replaced "`sync` never writes
    links/hooks into a real config the guard did not evaluate" with the supported appearance
    invariant: no adapter runs for a harness absent from the fixed snapshot; post-check removal
    or retarget remains subject to the documented residual (the fixed snapshot protects harness
    appearance, not physical target identity). Also aligned the sync-wiring intro line.
  - **Out-of-scope line promised equality** — replaced "writes into every harness … that
    remains a directory at revalidation" with: the warning itself neither blocks nor suppresses
    adapters, and adapters are attempted only for snapshot-present harnesses that pass
    revalidation (a passing revalidation is not a promise the write succeeds).
  Carried the crashed-`sync` manifest-provenance observation forward as **motivation** for the
  separate adapter-atomicity hardening WP (referenced in Out of scope; WP-108 not expanded).
  Redid the absolute-language sweep (`always`/`never`/`exactly`/`every`/`cannot`/`watertight`)
  — remaining absolutes are all supported (guard function `never writes/spawns/prompts`; the
  *appearance* upper bound is watertight per round-9; `looksTemporary never gates`). Three
  tests unchanged.
- **Round 11 (2026-07-16, genuine Codex adversarial review, orchestrator session) — APPROVE.**
  Verdict verbatim: *"Approve. WP-108 is clean to ship. All three round-10 language swaps are
  present, accurate, and consistent with the surrounding document. No material findings."*
- **Status:** **Ready** (owner sign-off, 2026-07-16). Cleared an eleven-round Codex
  adversarial design-review loop: rounds 1–2 shaped the guard; rounds 3–4 hardened path
  aliasing (symlink/case, physical `sameDir`/`physicalPath`); rounds 5–6 resolved the
  case-fold trade (removed the win32 fold → one benign false-positive residual); rounds 7–8
  closed the harness-detection TOCTOU (single snapshot + `isDir` revalidation, upper-bound
  ∩ current); rounds 9–10 qualified the invariant language and the non-atomic-fs residual;
  round 11 approved. Three accepted residuals recorded: case-insensitive-FS absent-suffix
  false-positive (rounds 5–6), post-`isDir` micro-race (rounds 9–10), and manifest-provenance
  orphaning on a crashed `sync` (round-10, motivating a separate adapter-atomicity WP).
