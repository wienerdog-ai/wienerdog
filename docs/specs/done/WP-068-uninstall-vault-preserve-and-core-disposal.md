---
id: WP-068
title: Uninstall vault-preserve handler + machine-generated core disposal
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0019, ADR-0010, ADR-0004]
branch: wp/068-uninstall-vault-preserve-and-core-disposal
---

# WP-068: Uninstall vault-preserve handler + machine-generated core disposal

## Context (read this, nothing else)

Wienerdog installs files, never a daemon (ADR-0004). `wienerdog uninstall`
replays the install manifest (`~/.wienerdog/install-manifest.json`) in reverse,
removing exactly what the installer wrote. The **canonical core** is
`~/.wienerdog/` (config, skills, prompts, scripts, **state**, **secrets**,
**logs**, **schedules**, manifest) — vendor-neutral mechanics. The **vault** is
the user's markdown memory at `~/wienerdog/` (or an adopted vault at a path the
user chose) — the sole long-term store and the one thing uninstall must **never**
touch. The vault is kept outside the core (default core `~/.wienerdog` vs default
vault `~/wienerdog`); **as of this WP** `adopt` refuses a vault inside the core
(realpath-canonicalized check), and the core-disposal sweep independently guards
against a nested vault (defense in depth — see the Review amendment below; the
original claim that adopt already refused this was false). This preservation is
by design and is **never** to be weakened — the M7 release criterion is
*"install → use → uninstall leaves only the vault."*

A real Windows uninstall (v0.6.0) surfaced **two broken mechanics around** that
correct preservation:

**Finding A — vault files surface as errors (13×).** The vault stub files
Wienerdog seeds (`init --fresh-vault`, `adopt`) are recorded in the manifest
under kind **`vault-file`** (and mapped dirs under **`vault-dir`**). These kinds
have **no handler** in `manifest.reverse()`, so each one falls through to the
generic *unknown-kind* branch: it emits
`wienerdog: skipping unknown manifest entry kind 'vault-file' (<path>)` to stderr
and lands in the `skipped` list, which `uninstall` then prints one-per-line.
Correct preservation is being reported as a wall of errors. The fix is an
explicit **preserve** handler: no filesystem action, counted, and the uninstall
summary prints **one** plain-language line —
`Your memory vault at <path> was left untouched (N files) — your notes are yours.`
— with **no** per-file noise and **no** "unknown kind" wording for a known kind.
The generic unknown-kind fall-through **stays** (forward-compat safety for kinds
a later WP adds — do not remove it).

**Finding B — generated files orphan the core.** The manifest tracks only files
the installer *authored at install/sync time*. It does **not** track the runtime
artifacts Wienerdog generates while running:

- `state/digest.md`, `state/watermarks.json`, `state/alerts.jsonl`,
  `state/update-check.json`, `state/schedule.json`, `state/scratch/**`
- `logs/**` (run-job logs)
- `schedules/*.xml` (Windows Task Scheduler artifacts — the `.xml` files are
  themselves `scheduler-entry` tracked and removed, but the `schedules/` dir is
  never recorded, so it lingers empty on Windows)
- `secrets/google-token.json`, `secrets/google-client.json` — OAuth credentials
  written by `src/gws/client.js` with **no** manifest record (verified 2026-07-06:
  zero `manifestLib.record`/`recordOnce` calls anywhere in `src/gws/`)

`manifest.reverse()`'s `dir` handler only removes **empty** directories, so each
non-empty subdir above is left behind, which keeps the core dir itself alive.
Result: after a synced / used install, `uninstall` leaves `~/.wienerdog`
orphaned — the M7 criterion fails.

The fix (ADR-0019, this WP): after replaying the manifest, `uninstall`
**recursively removes the core's machine-generated-mechanics subdirs** —
`state/`, `logs/`, `schedules/`, `secrets/` — and then removes the now-empty
core. This is safe because these four subdirs hold only Wienerdog-authored
disposable mechanics (GLOSSARY: the core is the "source of truth for
*mechanics* (not user knowledge)") **and** the sweep is doubly guarded: `adopt`
now refuses a vault inside the core, and `disposeCoreMechanics` itself skips
any swept dir that equals or contains the resolved vault path (see the Review
amendment) — the deleter never trusts the outside-the-core invariant alone. Removing `secrets/`
deletes the Google OAuth token on uninstall — intended: it is a Wienerdog-created
disposable credential re-obtainable via `/wienerdog-google-setup`, and leaving it
orphaned would both violate leave-only-the-vault and strand a live credential.

**The sole exception** to "leaves only the vault" is a **user-modified
`config.yaml`**: `reverse()` already keeps it (recorded-hash mismatch = "user
edited this") — when kept, the core dir is left alive to hold it. Do not change
that behavior. `config.yaml` sits directly in the core root (not in a swept
subdir), so the subdir sweep never touches it.

**Scope note (correction to the field report's premise).** The report named
`state/` and `schedules/`, and assumed `secrets/` was "already manifest-handled."
Verification shows `secrets/` and `logs/` are **not** manifest-handled — same
lingering class. Excluding them would reproduce the exact bug for any user who
connected Google or ran a routine, and would make the "core is gone" acceptance
fail. All four are therefore swept. This decision is recorded in ADR-0019.

This WP subsumes the old backlog item *"'vault-file' uninstall warning wording"*
(Finding A here). It shares **no files** with WP-067 (the `.cmd` shim fix) and
lands in parallel.

## Current state

`src/core/manifest.js#reverse(paths, manifest, {dryRun})` returns
`{removed: string[], skipped: string[]}`. Its entry loop dispatches on
`entry.kind`: `file`, `dir`, `symlink`, `managed-block`, `settings-entry`,
`scheduler-entry`, `vendored-tree`, `copied-skill`, else a stderr *unknown-kind*
warning + `skipped.push`. It seeds `removedSet` with `paths.manifest` and deletes
the manifest first (so the core counts as empty). `config.yaml` with a modified
hash is kept (stderr notice + `skipped.push`). Helpers `isDir(p)`, `isFile(p)`,
`sha256File(p)` exist; `fs` and `path` are required. `module.exports` is
`{ load, record, save, reverse, reverseSchedulerEntry, reverseVendoredTree,
reverseCopiedSkill }`.

`src/cli/uninstall.js#run(argv)` today:

```js
async function run(argv) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const paths = getPaths();

  if (!fileExists(paths.manifest)) {
    throw new WienerdogError(`no install manifest found at ${paths.manifest} — nothing to uninstall`);
  }

  let manifest;
  try { manifest = manifestLib.load(paths); }
  catch { throw new WienerdogError(`install manifest is corrupted (${paths.manifest})`); }

  console.log('wienerdog uninstall — the following will be removed:\n');
  for (const entry of manifest.entries) console.log(`  [${entry.kind}] ${entry.path}`);

  if (dryRun) {
    const { removed, skipped } = manifestLib.reverse(paths, manifest, { dryRun: true });
    console.log(`\n--dry-run: ${removed.length} item(s) would be removed, ${skipped.length} skipped.`);
    return;
  }

  if (!yes) {
    const ok = await confirm('\nProceed with removal? [y/N] ');
    if (!ok) { console.log('Aborted.'); return; }
  }

  const { removed, skipped } = manifestLib.reverse(paths, manifest, { dryRun: false });
  console.log(`\nRemoved ${removed.length} item(s).`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} item(s) (already gone or preserved):`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}
```

`uninstall.js` imports `fs`, `getPaths`, `manifestLib`, `WienerdogError`,
`confirm`, and defines `fileExists(p)`. `getPaths()` returns `paths.state`,
`paths.secrets`, `paths.logs`, `paths.core`, `paths.config`, `paths.vault`.

`src/core/vault.js` records seeded files as `{kind:'vault-file', path}` and
adopted mapped dirs as `{kind:'vault-dir', path}`. `readVaultPath` exists in
`sync.js` but is **not exported** — inline the read here (contract below).

Existing tests: `tests/unit/manifest.test.js` (reverse round-trips, config-kept,
already-gone, vendored-tree, copied-skill, unknown-kind), `tests/unit/uninstall.test.js`
(dry-run lists + no change, `--yes` removes the entire core [`init --yes` only, no
sync → `state/` empty, which is why it passes today], PATH shim removed, config
kept, already-gone exit 0, no-install exit 1), with a `tempEnv()` helper isolating
`HOME`/`WIENERDOG_HOME`/`WIENERDOG_VAULT`. `tests/integration/` holds e2e tests
(`adopt-e2e.test.js`, `bootstrap-seam.test.js`, `dream.test.js`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | `reverse()` gains a `preserved` array + a `vault-file`/`vault-dir` preserve branch (no fs action, no `removedSet` add, no stderr); return `{removed, skipped, preserved}`. Add `disposeCoreMechanics(paths, opts)` and export it. Unknown-kind fall-through unchanged. |
| modify | src/cli/uninstall.js | inline `readVaultPath`; capture vault path before reverse; render the one-line vault-preserve summary from `preserved`; call `disposeCoreMechanics` after reverse; dry-run lists the recursive core cleanup; final "core fully removed / kept" line. |
| modify | tests/unit/manifest.test.js | `vault-file`/`vault-dir` → `preserved` (not removed, not skipped, no warning, file left on disk); `disposeCoreMechanics` recursive removal of the four subdirs + core rmdir when empty + core kept when `config.yaml` remains + dry-run makes no changes. |
| modify | tests/unit/uninstall.test.js | seeded-vault uninstall prints the one vault line + does NOT list each vault file + core gone + vault dir present; planted untracked `state`/`logs`/`secrets`/`schedules` files are all swept; dry-run lists the recursive cleanup. |
| create | tests/integration/uninstall-core-e2e.test.js | init `--fresh-vault` → sync → plant secrets/logs/schedules artifacts → sha the vault tree → `uninstall --yes` → assert `~/.wienerdog` GONE and the vault tree byte-identical (the treasure invariant). |
| create | docs/adr/0019-uninstall-disposes-core-mechanics.md | ALREADY CREATED by the architect in this spec's commit — do not author it; it is listed so the boundary check permits its presence. Do not modify it. |
| modify | src/cli/adopt.js | *(review amendment)* reject a vault path equal to or inside `paths.core` with a plain-language `WienerdogError`; realpath-canonicalized comparison. |
| modify | tests/unit/adopt-git.test.js | *(review amendment)* adopt vault-inside-core rejection test (direct path + symlink-into-core, zero writes). |

> The ADR row is bookkeeping: `docs/adr/0019-*.md` is committed alongside this
> spec. It appears here only so CI's touched-files boundary allows it. Do not
> edit it.

## Review amendment (2026-07-06, owner-authorized)

wd-reviewer reproduced a blocking data-loss regression: the sweep's original
"provably safe — the vault is always outside the core" premise was **false**
(`adopt` had no vault-inside-core rejection). Adopting a vault under
`~/.wienerdog/state/…` then uninstalling recursively deleted the vault while
printing the reassurance line. Amended contracts (all three, defense in depth):

1. **Containment guard in the deleter.** `disposeCoreMechanics(paths, {dryRun,
   vaultPath})` takes the vault path the caller captured before `reverse()`.
   Before sweeping each mechanics dir it skips any dir that equals or contains
   the resolved vault (`path.relative` on **realpaths of both sides** —
   symlinked tmpdirs/homes false-negative otherwise; an unresolvable vault path
   means no guard needed). Returns `{removed, skippedForVault}`.
2. **Honest summary in the guarded case.** When a mechanics dir was skipped for
   the vault, uninstall prints the truthful variant (frozen), never the plain
   reassurance alone: `Your memory vault at <path> was left untouched (N files)
   — your notes are yours. Note: it sits inside Wienerdog's own folder (<dir>),
   which was therefore left in place — consider moving it somewhere of your
   own.` The final line becomes `Kept <core> (your memory vault still lives
   inside it).`
3. **Front door closed.** `adopt` rejects a vault path equal to or inside
   `paths.core` (realpath-canonicalized): *"Your vault can't live inside
   Wienerdog's own folder (~/.wienerdog) — pick a location of your own, like
   ~/wienerdog or your Documents."*

Also (reviewer non-blocking): the final core removal is best-effort and
symlink-aware — a core that is itself a symlink is `unlinkSync`'d (the emptied
target dir remains the user's), and the step never makes uninstall exit
nonzero. Tests: nested-vault-under-state regression (survives + honest note +
no false plain reassurance), adopt rejection, symlinked-core uninstall exit 0.

### Exact contract — `src/core/manifest.js`

**1. `reverse()` — add the `preserved` bucket and the vault preserve branch.**
Declare `const preserved = [];` alongside `removed`/`skipped`. Insert this branch
**before** the final `else` (unknown-kind), keeping every other branch identical:

```js
    } else if (entry.kind === 'vault-file' || entry.kind === 'vault-dir') {
      // The vault is the user's treasure — always preserved (ADR-0010, ADR-0019).
      // No filesystem action; NOT added to removedSet (it lives outside the core).
      // Counted so uninstall can print ONE plain-language reassurance line
      // instead of the former per-file 'unknown kind' stderr warnings.
      preserved.push(entry.path);
    } else {
      process.stderr.write(
        `wienerdog: skipping unknown manifest entry kind '${entry.kind}' (${entry.path})\n`
      );
      skipped.push(entry.path);
    }
```

Change the return to `return { removed, skipped, preserved };`. No other change to
`reverse()`.

**2. `disposeCoreMechanics(paths, opts)` — new function, exported.** Add
verbatim:

```js
/**
 * Dispose the canonical core's machine-generated-mechanics subdirs after a
 * manifest replay, then remove the now-empty core (ADR-0019). state/, logs/,
 * schedules/, secrets/ hold only Wienerdog-authored runtime artifacts (digest,
 * watermarks, alerts, update-check, schedule.json, scratch, run-job logs,
 * Windows Task Scheduler XML, OAuth tokens) — none manifest-tracked, none
 * user-authored (the vault is always OUTSIDE the core). Remove each recursively,
 * then remove the core dir itself iff it is now empty. A user-modified
 * config.yaml (kept by reverse) keeps the core alive — the sole exception to
 * "uninstall leaves only the vault". Idempotent: subdirs already gone are
 * skipped. In dry-run nothing is removed (the caller lists what it reports).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{dryRun?: boolean}} [opts]
 * @returns {{removed: string[]}} dirs recursively removed (+ the core if removed)
 */
function disposeCoreMechanics(paths, { dryRun = false } = {}) {
  /** @type {string[]} */ const removed = [];
  const mechanics = [
    paths.state,
    paths.logs,
    path.join(paths.core, 'schedules'),
    paths.secrets,
  ];
  for (const dir of mechanics) {
    if (!isDir(dir)) continue;
    if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });
    removed.push(dir);
  }
  if (isDir(paths.core)) {
    let children = [];
    try { children = fs.readdirSync(paths.core); } catch { children = []; }
    if (children.length === 0) {
      if (!dryRun) fs.rmdirSync(paths.core);
      removed.push(paths.core);
    }
  }
  return { removed };
}
```

Add `disposeCoreMechanics` to `module.exports`.

*Dry-run note:* because the sweep does not actually delete in dry-run,
`readdirSync(core)` is still non-empty, so the core is not reported as removed in
dry-run — the caller prints a conditional prose line for it. That is intentional:
we do not predict emptiness we did not create.

### Exact contract — `src/cli/uninstall.js`

Add this reader near the top (below `fileExists`):

```js
/** Read the configured vault path from config.yaml, or null. `[ \t]*` (not
 *  `\s*`) so a bare `vault:` line cannot let the match run onto the next line.
 *  @param {string} configPath @returns {string|null} */
function readVaultPath(configPath) {
  try {
    const m = fs.readFileSync(configPath, 'utf8').match(/^vault:[ \t]*(.*)$/m);
    const v = m && m[1].trim();
    return v && v !== 'null' ? v : null;
  } catch {
    return null;
  }
}
```

Replace the body of `run` from the first `console.log('wienerdog uninstall …')`
onward with:

```js
  // Capture the vault path BEFORE reverse removes config.yaml (for the summary).
  const vaultPath = readVaultPath(paths.config) || paths.vault;

  console.log('wienerdog uninstall — the following will be removed:\n');
  for (const entry of manifest.entries) console.log(`  [${entry.kind}] ${entry.path}`);

  if (dryRun) {
    const { removed, skipped, preserved } = manifestLib.reverse(paths, manifest, { dryRun: true });
    const { removed: mech } = manifestLib.disposeCoreMechanics(paths, { dryRun: true });
    console.log(`\n--dry-run: ${removed.length} item(s) would be removed, ${skipped.length} skipped.`);
    if (preserved.length > 0) {
      const vaultFiles = manifest.entries.filter((e) => e.kind === 'vault-file').length;
      console.log(`\nYour memory vault at ${vaultPath} would be left untouched (${vaultFiles} files) — your notes are yours.`);
    }
    if (mech.length > 0) {
      console.log('\nMachine-generated state (removed recursively, not manifest-tracked):');
      for (const d of mech) console.log(`  ${d}`);
    }
    console.log(`  ${paths.core}  (the canonical core — removed once empty)`);
    return;
  }

  if (!yes) {
    const ok = await confirm('\nProceed with removal? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const { removed, skipped, preserved } = manifestLib.reverse(paths, manifest, { dryRun: false });
  const { removed: mech } = manifestLib.disposeCoreMechanics(paths, { dryRun: false });
  console.log(`\nRemoved ${removed.length + mech.length} item(s).`);
  if (preserved.length > 0) {
    const vaultFiles = manifest.entries.filter((e) => e.kind === 'vault-file').length;
    console.log(`\nYour memory vault at ${vaultPath} was left untouched (${vaultFiles} files) — your notes are yours.`);
  }
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} item(s) (already gone or a customized config kept):`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  if (!fs.existsSync(paths.core)) {
    console.log(`\nWienerdog is fully removed — the canonical core (${paths.core}) is gone.`);
  } else {
    console.log(`\nKept ${paths.core} (a customized config.yaml remains).`);
  }
```

Behavior summary:

- **Vault entries** (`vault-file`/`vault-dir`) → one plain-language line, never a
  per-file list, never an "unknown kind" warning. `N` = count of `vault-file`
  entries (the seeded notes). An adopted vault with only `vault-dir` entries
  prints `(0 files)` — truthful (we seeded no notes, only ensured dirs); accept it.
- **Core disposal** runs after `reverse()`. If `config.yaml` was kept, the core
  survives with just `config.yaml` and the final line says so; otherwise the core
  is gone and the final line confirms full removal (whether the empty core was
  rmdir'd by `reverse()`'s own `dir` entry or by `disposeCoreMechanics`).
- **Dry-run** changes nothing on disk and additionally lists the recursive core
  cleanup plainly (the four mechanics subdirs that exist + the core line).

## Implementation notes & constraints

- No new npm dependencies. Plain Node ≥ 18, JSDoc types only, no build step.
- Do NOT weaken vault preservation, and do NOT remove the unknown-kind
  fall-through — it is forward-compat safety for future manifest kinds.
- Do NOT change `reverse()`'s existing `config.yaml`-kept behavior; the sweep
  never touches `config.yaml` (it is in the core root, not a swept subdir).
- `disposeCoreMechanics` must be **idempotent** — a subdir already removed by
  `reverse()` (e.g. an empty `state/`) is skipped via `isDir`. Prove this by
  running it twice in a test.
- The e2e is the load-bearing proof of the **treasure invariant**: sha every file
  under the vault before uninstall and after, and assert the maps are equal AND
  the vault dir still exists. Isolate `HOME`/`WIENERDOG_HOME`/`WIENERDOG_VAULT`
  exactly as `uninstall.test.js#tempEnv` does (the vault lives outside the core).
  To exercise the sweep without a real Google connection / scheduler, **plant**
  synthetic artifacts after sync: e.g. `secrets/google-token.json`,
  `logs/dream/2026-07-06.log`, `schedules/wienerdog-dream.xml`, and rely on
  sync's real `state/digest.md`. Assert each is gone with the core.
- When adding the regression test for Finding A, assert the stderr no longer
  contains `unknown manifest entry kind 'vault-file'` and stdout contains the one
  vault line but NOT a `[vault-file]`-per-line dump under a "Skipped" heading.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Security checklist

- [ ] `disposeCoreMechanics` deletes recursively under fixed, code-derived paths
      (`paths.state`, `paths.logs`, `path.join(paths.core, 'schedules')`,
      `paths.secrets`, `paths.core`) — **no untrusted input** flows into any of
      them (they come from `getPaths`, computed from `HOME`/`WIENERDOG_HOME`, not
      from the manifest or config). The vault path read for the *summary line* is
      display-only and never used as a delete target. Confirm no manifest-supplied
      path reaches a recursive delete here.

## Acceptance criteria

- [ ] `reverse()` returns `preserved` containing every `vault-file`/`vault-dir`
      path; those files are left on disk; no stderr `unknown manifest entry kind`
      line is emitted for them; they are NOT in `removed` or `skipped`.
- [ ] `disposeCoreMechanics` recursively removes `state/`, `logs/`, `schedules/`,
      `secrets/` when present, then rmdir's the core when it is empty; running it
      twice is a no-op; in dry-run it changes nothing on disk.
- [ ] With a user-modified `config.yaml`, `disposeCoreMechanics` leaves the core
      alive (it still contains `config.yaml`), and `uninstall` prints the
      "Kept … config.yaml remains" line.
- [ ] `uninstall --yes` on a seeded-vault install prints exactly one
      `Your memory vault at … was left untouched (N files) — your notes are yours.`
      line, does NOT list vault files individually, removes the entire core, and
      leaves the vault directory present.
- [ ] `uninstall --yes` sweeps planted untracked `state`/`logs`/`secrets`/`schedules`
      files and leaves `~/.wienerdog` gone.
- [ ] `uninstall --dry-run` changes nothing on disk and lists the recursive core
      cleanup (the mechanics subdirs + the core line).
- [ ] The e2e (init `--fresh-vault` → sync → plant artifacts → `uninstall --yes`)
      asserts `~/.wienerdog` is gone and the vault tree's per-file sha map is
      byte-identical before and after.
- [ ] All existing `manifest`/`uninstall` tests still pass unchanged.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern manifest
npm test -- --test-name-pattern uninstall
npm test -- --test-name-pattern vault
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `.cmd` shim self-deletion fix — that is **WP-067** (`src/core/vendor.js`).
- Recording `state`/`logs`/`secrets` artifacts in the manifest — they are
  disposed, not tracked (ADR-0019); do not add manifest records for them.
- Changing `reverse()`'s `config.yaml`-kept behavior or the vault-preservation
  design itself (both are correct and load-bearing).
- Pruning old `app/<version>/` dirs, or any change to `src/gws/`, `sync.js`,
  `init.js`, `adopt.js`, or the scheduler.
- Editing `docs/adr/0019-*.md` (committed with this spec, listed only for the
  boundary check).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/068-uninstall-vault-preserve-and-core-disposal`; conventional
   commits; PR titled
   `fix(uninstall): preserve vault with one line + dispose machine-generated core (WP-068)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. Credit the field report:
   `Reported-by: external user (Windows v0.6.0 uninstall field report)`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
