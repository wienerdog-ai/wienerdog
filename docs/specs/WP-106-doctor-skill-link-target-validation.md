---
id: WP-106
title: doctor validates skill-link targets (Claude + Codex), not just presence
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004]
branch: wp/106-doctor-skill-link-target-validation
---

# WP-106: doctor validates skill-link targets (Claude + Codex), not just presence

## Context (read this, nothing else)

`wienerdog doctor` (`src/cli/doctor.js`) prints one `[ok]`/`[warn]`/`[fail]` line per
health check and exits 1 only if a check **fails** (warnings never fail). It reads the
filesystem and prints lines — it never mutates. The honest remediation for a broken
install is `wienerdog sync`, which re-links skills and re-writes hooks idempotently.
Wienerdog is just files; it never starts a process that outlives its job (ADR-0004).

**How skills get registered.** `sync` stages the shipped `skills/wienerdog-*` folders
into the canonical core at `<core>/skills/` (`<core>` = `$WIENERDOG_HOME || ~/.wienerdog`),
then each present harness adapter links each `<core>/skills/wienerdog-*` folder into that
harness's skills dir:
- Claude Code → `<claudeDir>/skills/wienerdog-*` (`<claudeDir>` = `$CLAUDE_CONFIG_DIR ||
  ~/.claude`), created as a **symlink** whose target is `<core>/skills/<name>` (or, where
  symlink creation is unpermitted — Windows without privilege — a **copied directory**,
  WP-050).
- Codex CLI → `<codexDir>/skills/wienerdog-*` (`<codexDir>` = `$CODEX_HOME || ~/.codex`),
  same symlink-or-copy scheme (WP-078).

**Why this WP exists — a real dogfooding incident (2026-07-12 → 07-16).** A marketing
demo re-record ran the real installer with `WIENERDOG_HOME` pointed at a `mktemp -d`
sandbox (`/var/folders/.../tmp.XXXX/wd`) but did **not** redirect the Claude config dir.
`wienerdog init` therefore mutated the user's real `~/.claude`: it **repointed all seven
`~/.claude/skills/wienerdog-*` symlinks** from `~/.wienerdog/skills/` to the temp core
(the "symlink with wrong target → unlink + relink" branch of `applySkillLinks` in
`src/adapters/shared.js`). The temp dir survived ~3 days, then macOS's periodic temp
purge emptied it. All `/wienerdog-*` slash commands silently vanished ("Unknown command:
/wienerdog-setup"), and the nightly dream job failed with "Unknown command:
/wienerdog-dream". **Throughout all of this, `wienerdog doctor` reported all-green.**

The reason `doctor` stayed green: its only skill-link check (`codexSkillChecks`, added by
WP-079) verifies **presence + resolvability** of each link — `fs.existsSync(linkPath)`.
It does **not** inspect a symlink's **target**. A link pointing at a foreign core (the
temp dir) still passes `existsSync` for as long as that dir exists, and it silently
became `[warn]` only *after* the purge made it dangling — too late, and Claude was never
checked at all (there is no Claude-side skill-link check).

**What this WP does.** Upgrade the skill-link check from "the link exists" to "the link
points at THIS install's skill and that skill is intact", and run it for **both**
harnesses:
1. For a **symlink**: it must resolve, its resolved target must be the matching skill dir
   inside the **current** core (`<core>/skills/<name>`), and that dir must contain
   `SKILL.md`. A target that resolves somewhere else (the incident) is **foreign**; a
   symlink that no longer resolves is **broken**; a resolved dir with no `SKILL.md` is
   **broken**.
2. For a **copied directory** (Windows fallback): it must contain `SKILL.md`.
3. Anything else at the expected path (absent, a plain file) → **not registered**.

Every problem is a `[warn]` with the `wienerdog sync` remediation, never a `[fail]`
(a Codex-less or just-installed machine is normal). This supersedes WP-079's
presence-only Codex check with a target-validating one, and adds the Claude-side check
WP-079 explicitly deferred.

## Current state

**`src/cli/doctor.js`** currently holds `codexSkillChecks(paths, harnesses)` (WP-079),
a presence-only check invoked once in `run(_argv)`:

```js
/** Verify each shipped wienerdog-* skill is registered under <codexDir>/skills/
 *  (a symlink OR a copied dir — both count; WP-050). Read-only; a missing/broken
 *  link is a WARN (remediation: 'wienerdog sync'), never a fail. Empty array when
 *  Codex is not detected. Codex's own <codexDir>/skills/.system/ is ignored. */
function codexSkillChecks(paths, harnesses) {
  if (!harnesses.codex.present) return [];
  const coreSkillsDir = path.join(paths.core, 'skills');
  let entries;
  try { entries = fs.readdirSync(coreSkillsDir, { withFileTypes: true }); } catch { return []; }
  const names = entries
    .filter((e) => e.name.startsWith('wienerdog-') && (e.isDirectory() || e.isSymbolicLink()))
    .map((e) => e.name);
  if (names.length === 0) return [];
  const codexSkillsDir = path.join(paths.codexDir, 'skills');
  const missing = names.filter((name) => !fs.existsSync(path.join(codexSkillsDir, name)));
  if (missing.length === 0) {
    return [{ status: 'ok', msg: `Codex skills registered (${names.length}) under ${codexSkillsDir}` }];
  }
  return [{ status: 'warn', msg: `Codex skills NOT registered under ${codexSkillsDir}: ${missing.join(', ')} — run 'wienerdog sync' to (re)link them` }];
}
```

It is wired in `run` right after the harness-detection summary line and the scheduler
checks:

```js
const harnesses = detectHarnesses();
check('ok', `AI tools — Claude Code: … Codex CLI: …`);
// … scheduler checks …
for (const c of codexSkillChecks(paths, harnesses)) check(c.status, c.msg);
// … googleReadinessChecks, then the update notice (stays last) …
```

- `detectHarnesses()` (`src/core/detect.js`) returns `{ claude: {present, dir}, codex:
  {present, dir} }`. `present` is "does the config dir exist"; `dir` is the resolved
  config dir (`claudeDir` / `codexDir`).
- `paths.core`, `paths.claudeDir`, `paths.codexDir` come from `getPaths()`
  (`src/core/paths.js`). `<core>/skills/` is staged by every `sync`.
- Each shipped skill folder contains a top-level `SKILL.md` (the seven shipped skills are
  `wienerdog-setup`, `wienerdog-dream`, `wienerdog-google-setup`, `wienerdog-routines`,
  `wienerdog-daily-digest`, `wienerdog-inbox-triage`, `wienerdog-weekly-review`).

**`tests/unit/doctor.test.js`** drives `doctor` as a subprocess (`run(['doctor'], env)`)
against an isolated temp `HOME`/`WIENERDOG_HOME`, asserting on stdout / exit code. Its
`tempEnv()` sets `CLAUDE_CONFIG_DIR` and `CODEX_HOME` to **non-existent** dirs
(`absent-claude` / `absent-codex`) so both harnesses are "not found" by default. Two
existing WP-079 tests exercise a Codex-present machine by creating a real `codexHome` and
setting `env.CODEX_HOME` before `init`:

```js
test('doctor reports [ok] Codex skills registered when Codex is present and links intact', () => {
  const { root, env } = tempEnv();
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome, { recursive: true });
  env.CODEX_HOME = codexHome;
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\] Codex skills registered \(\d+\)/);
});

test('doctor warns (exit 0) when a Codex skill link is removed', () => {
  // … same setup …
  fs.rmSync(path.join(codexHome, 'skills', 'wienerdog-setup'), { recursive: true, force: true });
  // … assert.match(r.stdout, /\[warn\] Codex skills NOT registered .*wienerdog-setup/);
});

test('doctor prints no Codex-skill line when Codex is not detected', () => { … });
```

The `[ok]` assertion (`/\[ok\] Codex skills registered \(\d+\)/`) stays valid under this
WP (the ok string is unchanged). The `[warn]` assertion's wording changes (see below).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/doctor.js | replace `codexSkillChecks` with a shared, target-validating `skillLinkChecks(paths, harnessSkillsDir, label)`; call it for Claude (when present) AND Codex (when present) in `run` |
| modify | tests/unit/doctor.test.js | update the one WP-079 `[warn]` Codex assertion to the new wording; add Claude-side cases: links intact → `[ok]`; a repointed (foreign-target) link → `[warn]`; a dangling link → `[warn]`; a resolved-but-empty target (no `SKILL.md`) → `[warn]`; Claude absent → no Claude-skill line |

### Exact contracts

**1. Replace `codexSkillChecks` with `skillLinkChecks(paths, harnessSkillsDir, label)`.**
Pure and read-only; returns an array of `{status:'ok'|'warn', msg:string}` (never
`'fail'`). One summary line, not one line per skill.

```js
/** Validate that each SHIPPED wienerdog-* skill is CORRECTLY registered under a
 *  harness's skills dir — not merely present (WP-079 checked only existence, which
 *  let a symlink repointed at a foreign/ephemeral core read as healthy until it went
 *  dangling; the 2026-07-12 demo-sandbox incident). The shipped inventory is read from
 *  the PACKAGED source (path.resolve(__dirname,'..','..','skills')), NOT the mutable
 *  <core>/skills, so a deleted staged skill is a reported problem, never a smaller count.
 *  For each shipped name:
 *    - staged core copy <core>/skills/<name> absent / no SKILL.md → 'core copy missing'
 *      (and the harness sub-check is skipped — sync re-stages).
 *    - else the harness entry:
 *      · SYMLINK: fs.realpathSync(linkPath) must resolve (else 'broken link') AND
 *        equal fs.realpathSync(<core>/skills/<name>) (else 'points outside this install')
 *        AND the resolved dir must contain SKILL.md (else 'no SKILL.md').
 *      · real DIRECTORY (copied skill, WP-050): DISCOVERABILITY only — must contain
 *        SKILL.md (else 'no SKILL.md'); NOT an ownership check (a user-modified/unrecorded
 *        dir with SKILL.md reads as discoverable; ownership is WP-088/089's job).
 *      · absent / a plain file: 'missing' / 'a file is in the way'.
 *  Read-only; every problem is a WARN with the `wienerdog sync` remediation, never a
 *  fail. Returns [] when the packaged source is unreadable or ships no wienerdog-* skills.
 *  Callers gate on harness presence.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {string} harnessSkillsDir  e.g. path.join(paths.claudeDir, 'skills')
 *  @param {string} label             e.g. 'Claude Code' | 'Codex'
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function skillLinkChecks(paths, harnessSkillsDir, label) { /* … */ }
```

Behavior, step by step:

1. **Shipped inventory (authoritative, from the PACKAGED source — Finding 2).** Read the
   package's own skills dir, NOT the mutable `<core>/skills`:
   `const pkgSkillsRoot = path.resolve(__dirname, '..', '..', 'skills')` (from
   `src/cli/doctor.js`: `..` → `src`, `..` → package root, `skills`) — the exact source
   `sync`'s `stageSkills` copies from. In a vendored install this resolves to
   `<core>/app/<version>/skills`; in a dev checkout `<repo>/skills`. It **ships with the
   app and is not user-mutable**, so it is the ground truth of what SHOULD be installed.
   `readdirSync(pkgSkillsRoot, {withFileTypes:true})` inside a try; on failure or zero
   `wienerdog-*` entries return `[]` (a corrupt/absent app tree is not this check's
   concern). Keep `isDirectory()` entries whose `name.startsWith('wienerdog-')`. Call this
   fixed set `shippedNames`; `N = shippedNames.length` is the authoritative count — a
   deleted STAGED core skill becomes a reported *problem* below, never a silently smaller
   `N`.
2. For each `name` in `shippedNames`:
   - `coreSkill = path.join(paths.core, 'skills', name)` — where `sync` stages it and what
     the harness link must target. Verify the staged core copy first: if `coreSkill` is
     not a directory (`fs.statSync(coreSkill).isDirectory()` inside a try) OR it lacks
     `SKILL.md` (`!fs.existsSync(path.join(coreSkill,'SKILL.md'))`) → problem
     `core copy missing — run 'wienerdog sync'`, then **continue to the next name** (the
     harness link cannot be valid without a good staged core copy; re-staging via `sync`
     is the single fix, so a second reason would be noise).
   - Else validate the harness registration at `linkPath = path.join(harnessSkillsDir,
     name)`, with `expected = coreSkill`:
     - `lstatSync(linkPath)` inside a try. If it throws (absent) → problem `missing`.
     - Else if `lstat.isSymbolicLink()` — **strong** validation (this is the incident
       vector):
       - `let real; try { real = fs.realpathSync(linkPath); } catch { real = null; }`. If
         `real === null` → problem `broken link (target is gone)`.
       - Else compute `expectedReal` via `fs.realpathSync(expected)` inside a try
         (fallback to `expected` if it throws). If `real !== expectedReal` → problem
         `points outside this install → ${real}`.
       - Else if **not** `fs.existsSync(path.join(real, 'SKILL.md'))` → problem
         `no SKILL.md at ${real}`.
       - Else → registered (no problem).
     - Else if `lstat.isDirectory()` (a real dir — a copied skill, Windows fallback) —
       **discoverability only** (see the note below): if **not**
       `fs.existsSync(path.join(linkPath, 'SKILL.md'))` → problem `no SKILL.md` else
       registered.
     - Else (a plain file at the expected path) → problem `a file is in the way`.
3. Collect `problems` as `{name, reason}`. If empty:
   `[{status:'ok', msg:\`${label} skills registered (${N}) under ${harnessSkillsDir}\`}]`.
   Else:
   `[{status:'warn', msg:\`${label} skills need attention under ${harnessSkillsDir}: ${problems.map(p => \`${p.name} (${p.reason})\`).join(', ')} — run 'wienerdog sync' to re-link them\`}]`.

**Copied-directory semantics — discoverability, NOT ownership (Finding 1).** For a
**symlink** the check is strong: it must resolve, its target must equal THIS install's
`<core>/skills/<name>`, and that dir must hold `SKILL.md` — this is what catches the
incident (a link repointed at a foreign/ephemeral core), and no user-owned real directory
is silently accepted as ours. For a **real directory** at the harness path (the Windows
copy fallback, WP-050) there is no target to compare, so the check verifies only that it
is **discoverable** by the harness — i.e. it contains `SKILL.md`. Doctor deliberately does
**not** assert a real directory is a pristine, Wienerdog-managed copy: a user-modified or
unrecorded `wienerdog-*` directory with a `SKILL.md` reads as *discoverable*, which is the
correct answer to "does the `/wienerdog-*` command work". `applySkillLinks` already
*preserves* (never adopts or refreshes) such a directory, and copied-skill
ownership/refresh integrity is the job of WP-089's forward fingerprint and WP-088's reverse
delete-guard — not of a read-only `doctor` line. The `N`-of-`N` "registered" count is
therefore a discoverability claim for real-dir installs and a target-validated claim for
symlink installs; the `[ok]` message wording ("registered") is accurate for both.

Notes on the contract:
- Use **realpath equality** (canonicalize both sides) for the foreign-target test, so a
  symlinked HOME or `/var → /private/var` on macOS does not cause a false "foreign".
- The `SKILL.md` check catches a core whose skill dir was emptied (the incident's endgame
  where the temp core was purged of contents) even when the symlink path itself still
  resolves.
- The `[ok]` message string is **byte-identical** to WP-079's for `label === 'Codex'`
  (`Codex skills registered (N) under <dir>`), so the existing `[ok]` test still passes.

**2. Wire into `run`.** Replace the single `codexSkillChecks(...)` loop with two gated
calls, immediately after the scheduler-check loop (before `googleReadinessChecks`):

```js
// Skill-link health: each shipped wienerdog-* skill is registered — and its symlink
// points at THIS install's core (not a stale/foreign one) — under each present
// harness's skills dir. Read-only; problems are warns (remediation: 'wienerdog sync').
if (harnesses.claude.present) {
  for (const c of skillLinkChecks(paths, path.join(paths.claudeDir, 'skills'), 'Claude Code')) check(c.status, c.msg);
}
if (harnesses.codex.present) {
  for (const c of skillLinkChecks(paths, path.join(paths.codexDir, 'skills'), 'Codex')) check(c.status, c.msg);
}
```

`harnesses` and `paths` are already in scope. The update-notice block stays last. Delete
the old `codexSkillChecks` function.

**3. Tests (`tests/unit/doctor.test.js`).** Keep the WP-079 `[ok]` and "Codex not
detected" tests as-is. Change the one `[warn]` assertion and add Claude cases. To
exercise a Claude-present machine, set `env.CLAUDE_CONFIG_DIR` to a **real** dir before
`init` (mirroring the Codex pattern):

```js
const claudeHome = path.join(root, 'claude');
fs.mkdirSync(claudeHome, { recursive: true });
env.CLAUDE_CONFIG_DIR = claudeHome;
run(['init', '--yes'], env);          // links skills into claudeHome/skills
```

- **Update the existing Codex `[warn]` test** — the deleted link is now reported by the
  new helper: change its assertion to
  `assert.match(r.stdout, /\[warn\] Codex skills need attention .*wienerdog-setup/)`.
- **Claude present, links intact → `[ok]`, exit 0.** After the claudeHome setup + `init`,
  `run(['doctor'], env)`; assert `r.status === 0` and
  `r.stdout` matches `/\[ok\] Claude Code skills registered \(\d+\)/`.
- **Claude present, one link repointed at a foreign core → `[warn]`, exit 0.** After
  setup + `init`, simulate the incident: build a throwaway "foreign" skill dir with a
  `SKILL.md` (`const foreign = path.join(root, 'foreign', 'wienerdog-setup');
  fs.mkdirSync(foreign, {recursive:true}); fs.writeFileSync(path.join(foreign,'SKILL.md'),'x');`),
  then `const link = path.join(claudeHome,'skills','wienerdog-setup'); fs.rmSync(link,
  {recursive:true, force:true}); fs.symlinkSync(foreign, link);`. Run `doctor`; assert
  `r.status === 0` and `r.stdout` matches
  `/\[warn\] Claude Code skills need attention .*wienerdog-setup \(points outside this install/`.
  (On win32 the intact links are copies, not symlinks — guard this test with
  `{ skip: process.platform === 'win32' ? 'symlink-target test is POSIX-only' : false }`.)
- **Claude present, one link dangling → `[warn]`, exit 0.** After setup + `init`, replace
  a link with a symlink to a non-existent path: `fs.rmSync(link,{recursive:true,
  force:true}); fs.symlinkSync(path.join(root,'gone','wienerdog-dream'), link);` (target
  never created). Assert `r.status === 0` and `r.stdout` matches
  `/\[warn\] Claude Code skills need attention .*wienerdog-dream \(broken link/`. Guard
  win32-skip as above.
- **Claude present, symlink resolves but the core copy lost its `SKILL.md` → `[warn]`,
  exit 0 (POSIX-only).** After setup + `init`, delete the `SKILL.md` from a *core* skill so
  the (intact) symlink resolves to a dir lacking it:
  `fs.rmSync(path.join(core,'skills','wienerdog-routines','SKILL.md'), {force:true});`
  (`core` from `tempEnv()`). Assert `r.status === 0` and `r.stdout` matches
  `/\[warn\] Claude Code skills need attention .*wienerdog-routines/`.
  **Guard with a win32 skip** (`{ skip: process.platform === 'win32' ? 'symlink SKILL.md
  test is POSIX-only' : false }`): on Windows the harness entry is a **copy** with its own
  independent `SKILL.md`, so deleting the core's does not affect it — the copied-dir branch
  is exercised by the dedicated test below instead.
- **Copied-directory branch — real dir without `SKILL.md` → `[warn]`; with `SKILL.md` →
  registered (platform-agnostic).** This exercises the real-dir branch directly on every
  platform (no reliance on Windows). After setup + `init`, replace one harness entry with a
  real directory: `const link = path.join(claudeHome,'skills','wienerdog-dream');
  fs.rmSync(link,{recursive:true,force:true}); fs.mkdirSync(link,{recursive:true});`. Run
  `doctor`; assert `r.status === 0` and `r.stdout` matches
  `/\[warn\] Claude Code skills need attention .*wienerdog-dream \(no SKILL\.md/`. Then
  write `fs.writeFileSync(path.join(link,'SKILL.md'),'x');`, run `doctor` again, and assert
  `r.stdout` does **not** match `/wienerdog-dream \(no SKILL\.md/` and matches
  `/\[ok\] Claude Code skills registered/` (a real dir with `SKILL.md` reads as
  *discoverable* — the documented copied-dir semantics; Finding 1).
- **Staged core skill deleted → reported, not silently dropped (authoritative inventory;
  Finding 2).** After setup + `init`, delete a whole *staged core* skill dir:
  `fs.rmSync(path.join(core,'skills','wienerdog-routines'),{recursive:true,force:true});`.
  Run `doctor`; assert `r.status === 0` and `r.stdout` matches
  `/\[warn\] Claude Code skills need attention .*wienerdog-routines \(core copy missing/`.
  (Proves the shipped inventory comes from the packaged source, so a deleted staged skill
  becomes a problem instead of shrinking `N` to an all-green `N-1`.)
- **Claude absent → no Claude-skill line.** Default `tempEnv()` (CLAUDE_CONFIG_DIR points
  at a non-existent `absent-claude`); `init` + `doctor`; assert `r.stdout` does **not**
  match `/Claude Code skills/` and `r.status === 0`.

Use `wienerdog-setup` / `wienerdog-dream` / `wienerdog-routines` as probe skills — all are
shipped. In the deleted-core test, `wienerdog-routines`'s staged core dir is removed but it
is still in the packaged inventory, so it must appear as a `core copy missing` problem.

## Implementation notes & constraints

- **Read-only, warn-not-fail.** `doctor` must never create or repair a link; the only
  remediation it prints is `wienerdog sync`. A problem is a `warn`. A skill-link problem
  must never flip `doctor`'s exit code.
- **Shipped inventory from the PACKAGED source (decision, Finding 2).** Derive the
  expected skill names from `path.resolve(__dirname, '..', '..', 'skills')` — the package's
  own `skills/` dir (ships with the app, not user-mutable), the same source
  `stageSkills` copies from — **not** from the mutable `<core>/skills`. Chosen over a
  hardcoded shipped-skill list because it is self-maintaining (a new shipped skill needs no
  spec/code edit) and is the authoritative "what should be installed" set, so a deleted
  *staged* core skill surfaces as a `core copy missing` problem instead of silently
  shrinking the registered count. The check never enumerates the harness skills dir to
  decide health, so Codex's own `<codexDir>/skills/.system/` (and any unrelated user skill)
  is structurally out of scope.
- **Realpath both sides** for the foreign-target comparison; fall back to the literal
  `expected` string only when `realpathSync(expected)` throws (a broken core, already
  reported as `core copy missing` — the mismatch will still warn, which is acceptable).
- **Both link forms are checked, with different strength.** A symlink (POSIX) gets
  target-equality validation (the incident vector); a copied dir (Windows fallback, WP-050)
  gets a **discoverability** check (`SKILL.md` present) only — NOT an ownership assertion.
  A user-modified or unrecorded `wienerdog-*` real dir with a `SKILL.md` reads as
  discoverable by design; copied-skill ownership/refresh is WP-088/089's concern, not
  doctor's (see the copied-directory-semantics note in Exact contracts).
- This WP **supersedes WP-079's presence-only `codexSkillChecks`** (Done). Deleting that
  function and updating its one `[warn]` test is intended and in scope. Do not touch
  `src/adapters/shared.js`, `sync`, `detect`, or the manifest.
- Zero new dependencies; no build step; JSDoc types only.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input. Skill names come from a `readdirSync` of the package's own
      shipped `skills/` source (`path.resolve(__dirname,'..','..','skills')`) filtered to
      the `wienerdog-*` prefix; every other path is built with `path.join` from
      `paths.core`/`paths.claudeDir`/`paths.codexDir` (env-derived, already trusted). The
      check only `stat`/`lstat`/`realpath`/`existsSync`es paths and prints strings — no
      value flows into a shell command or any mutation. `realpathSync` on a symlink target
      reads (never writes) the target; a resolved foreign path is printed verbatim in a
      warn line, not executed.

## Acceptance criteria

- [ ] When a harness is detected and every shipped skill is registered with a correct,
      intact link, `doctor` prints one `[ok] <label> skills registered (N) under …` line
      and exits 0.
- [ ] When a shipped skill's symlink resolves to a target **outside** the current core,
      `doctor` prints a `[warn] … (points outside this install → …)` line naming the
      skill and **still exits 0** (the incident case).
- [ ] A dangling symlink → `[warn] … (broken link …)`; a resolved target with no
      `SKILL.md` → `[warn] … (no SKILL.md …)`; an absent link → `[warn] … (missing)`.
      All exit 0.
- [ ] The check runs for **both** Claude Code and Codex when detected; when a harness is
      not detected, no line for it is printed.
- [ ] A deleted **staged core** skill is reported as `(core copy missing)` — the expected
      set comes from the packaged source, so it is never silently dropped to an all-green
      `N-1` count.
- [ ] A copied **real directory** with `SKILL.md` reads as registered (discoverability);
      one without `SKILL.md` → `[warn] … (no SKILL.md)`. Doctor makes no ownership claim on
      a real directory.
- [ ] `doctor` performs no filesystem mutation.
- [ ] Running the check twice on an unchanged install is stable (idempotent read).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern doctor
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any auto-repair from `doctor` — remediation is `wienerdog sync`, which re-links via the
  idempotent adapter. Do not have `doctor` unlink/relink.
- Fixing the *root cause* of the incident (init/sync writing links into real harness
  configs while the core is redirected to an ephemeral sandbox) — that is **WP-108**.
- Stale/foreign session-hook detection — that is **WP-107** (this WP touches the same
  file; WP-107 depends on this WP).
- Surfacing skill-link health in the session digest — the digest cache-then-render split
  is a separate concern, not scoped here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/106-doctor-skill-link-target-validation`; conventional commits; PR titled
   `feat(doctor): validate skill-link targets for Claude + Codex (WP-106)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Design-review record

- **Round 1 (2026-07-16, wd-architect self-review — Codex plugin unavailable).** The Codex
  design-loop invocation died silently; per the runbook fallback wd-architect ran the pass
  itself. No findings on this spec at that point.
- **Round 2 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Codex
  returned needs-attention with two findings on this spec, both verified accurate and
  applied (maintainer standing direction: accept all):
  - **P1** — the "missing SKILL.md" test deleted the *core* copy's SKILL.md and claimed it
    also covered the Windows copied-dir branch. It does not: `applySkillLinks` copies the
    tree into the harness dir, so the copy keeps its own SKILL.md, and the unskipped
    Windows test would fail while fallback-copy installs falsely read `[ok]`. Fixed: the
    symlink-SKILL.md test is now POSIX-only (win32-skip); a dedicated **platform-agnostic
    copied-dir test** constructs a real dir (without → `[warn]`, with SKILL.md →
    registered). Also narrowed the copied-dir claim to **discoverability, not ownership**
    (a user-modified/unrecorded real dir with SKILL.md reads as discoverable by design;
    ownership is WP-088/089's job), documented in Exact contracts + Implementation notes.
  - **P2** — the expected-skill set was derived from the mutable `<core>/skills`, so a
    deleted staged skill shrank the count to an all-green `N-1` (or emitted no line if all
    gone). Fixed: the inventory now comes from the **packaged source**
    (`path.resolve(__dirname,'..','..','skills')` — decision recorded in Implementation
    notes; chosen over a hardcoded list for self-maintenance), and a missing staged core
    copy is reported as `core copy missing`.
- **Round 3 (2026-07-16, genuine Codex adversarial review, orchestrator session).** Both
  round-2 fixes confirmed against source — Codex explicitly verified the packaged skills
  path (`path.resolve(__dirname,'..','..','skills')`) matches `stageSkills` in BOTH the
  vendored `app/<version>` and dev-checkout layouts (clearing the residual risk this spec
  flagged), and that the copied-dir/discoverability semantics hold. No new findings on this
  spec.
- **Round 7 cross-check (2026-07-16).** A round-7 finding on the sibling WP-108 (harness
  detected for the guard vs. re-detected at adapter-write time) prompted a check of this
  spec. `doctor` is **read-only** and already uses a **single** `harnesses = detectHarnesses()`
  snapshot for all its checks (summary, scheduler, and this spec's skill-link checks); it
  never writes, so the double-detection write race does not apply here. No change.
- **Status:** **Ready** (owner sign-off, 2026-07-16). Codex-clean since round 3, re-confirmed
  by the round-7 cross-check; held at Draft only while the sibling WP-108 completed its
  eleven-round review loop (round 11: APPROVE). Flipped to Ready alongside WP-107/108.
