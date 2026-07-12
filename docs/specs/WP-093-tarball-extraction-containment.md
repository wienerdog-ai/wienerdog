---
id: WP-093
title: Tarball install hardening — secure temp file, member-name preflight, trustworthy completeness marker
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0016]
branch: wp/093-tarball-extraction-containment
---

# WP-093: Tarball install containment (JS core)

## Context (read this, nothing else)

Wienerdog's npm-less install/update channel (ADR-0016) fetches the published
registry **tarball** over HTTPS, verifies its **sha512 SRI** integrity, and
unpacks it into the vendored layout `~/.wienerdog/app/<version>/`. The core module
is `src/core/tarball.js` (used by `wienerdog update` and the install.sh fallback).
sha512 verification proves the **bytes** match the registry-provided checksum — it
does **not** prove the archive's internal **layout** is safe.

Three verified gaps (ADR-0016 integrity):

1. **Predictable world-readable temp tarball → verify-to-extract TOCTOU (P1):**
   the verified bytes are written to
   `os.tmpdir()/wd-tarball-<pid>-<Date.now()>.tgz` via a plain `fs.writeFileSync`
   (predictable name, default mode, no exclusive create). A local attacker who
   predicts/observes the name can pre-create a symlink or swap the file between the
   write and `tar` opening it, so unverified bytes get extracted and executed. (The
   install.sh/ps1 bootstrap paths use private `mktemp -d` dirs and don't share this
   defect.)

2. **No member-NAME preflight → name-based path escape (P1):** the verified `.tgz`
   is handed straight to system `tar` with no rejection of members whose names are
   absolute (`/etc/...`) or contain `..` path segments. A compromised registry
   release can ship a byte-valid archive whose members write **outside** the staging
   dir by name. **Scope of the fix (do not over-claim):** this WP adds a
   **name-based** preflight only. It does NOT establish full extraction containment —
   a symlink/hardlink member with a SAFE name but an escaping target (followed by a
   file written through that link) is a distinct vector `tar -tzf` cannot reliably
   detect across tar variants. That link-member defense is an explicit **documented
   residual** with a `wd-researcher` follow-up spike (see Out of scope); it is not
   closed here.

3. **A lone `bin/wienerdog.js` marks a version "complete" (P1):** `installVersion`
   short-circuits (skips download+verify entirely) when
   `app/<version>/bin/wienerdog.js` exists. A poisoned partial dir — a crash
   leftover or another process's partial write containing just that one file — is
   trusted and executed. This WP replaces that with a `.wienerdog-complete` marker
   Wienerdog writes only after a fully verified publish. **Scope of the claim (do not
   over-claim):** the marker gives **crash-completeness** — it proves *Wienerdog
   finished a verified publish into this dir*, assuming the local app tree is
   trusted. It is NOT a cryptographic proof: any local process that can write the
   version dir can also write the marker (its content is not verified on read). It
   raises the bar above "one file exists"; it does not defend a fully attacker-
   controlled local filesystem (that would need a different, signed design).

**Product invariants that bound this WP:** Wienerdog is just files (ADR-0004); no
runtime deps (CLAUDE.md) — the preflight uses system `tar`, no tar library. Update
only on explicit command (ADR-0004/0015).

## Current state

`src/core/tarball.js` imports `fs, os, path, https, crypto, { spawnSync }`,
`WienerdogError`, `isSemver`, `appDir`. Relevant functions:

```js
function extractTarball(tgzFile, destDir, opts = {}) {
  const spawn = opts.spawn || spawnSync;
  const r = spawn('tar', ['-xzf', tgzFile, '--strip-components=1', '-C', destDir]);
  if (r.error || r.status !== 0) throw new WienerdogError('could not unpack the download (is `tar` installed?)');
}

async function installVersion(paths, args) {
  const { version, integrity } = args;
  if (!isSemver(version)) throw new WienerdogError('registry returned an invalid version');
  const app = appDir(paths);
  const target = path.join(app, version);
  if (fs.existsSync(path.join(target, 'bin', 'wienerdog.js'))) {   // ← (3) lone-file shortcut
    return { version, target, alreadyPresent: true };
  }
  const buf = await downloadVerified(version, integrity, { downloadBuffer: args.downloadBuffer });
  const staging = `${target}.staging.${process.pid}`;
  const tgzFile = path.join(os.tmpdir(), `wd-tarball-${process.pid}-${Date.now()}.tgz`);  // ← (1) predictable temp
  try {
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(tgzFile, buf);                               // ← (1) non-exclusive write
    extractTarball(tgzFile, staging, { spawn: args.spawn });      // ← (2) no member preflight
    fs.mkdirSync(app, { recursive: true });
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true }); // recovery: remove partial
    try { fs.renameSync(staging, target); } catch { throw new WienerdogError('could not finish unpacking …'); }
  } finally {
    try { fs.rmSync(tgzFile, { force: true }); } catch {}
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch {}
  }
  return { version, target, alreadyPresent: false };
}
```

`downloadVerified` already verifies sha512 before returning `buf`; `spawn`/
`downloadBuffer` are injectable seams for tests.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/tarball.js | private-temp-dir tgz (0600, exclusive); `preflightMembers` name check before extract; `.wienerdog-complete` completeness marker replaces the lone-file shortcut |
| modify | tests/unit/tarball.test.js | tests: unsafe member (`../`, absolute) rejected via stubbed `spawn` `tar -tzf`; completeness gated on the `.wienerdog-complete` marker; secure-temp asserted through the injected `spawn` (tgz path/mode observed during the call; temp dir gone after) — NOT via a new fs seam |

### Exact contracts

**(1) Secure temp file.** Create a per-run private directory with
`fs.mkdtempSync(path.join(os.tmpdir(), 'wd-tarball-'))` (mode 0700), and write the
tgz inside it with an exclusive, owner-only create:

```js
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-tarball-'));
const tgzFile = path.join(tmpDir, 'pkg.tgz');
fs.writeFileSync(tgzFile, buf, { mode: 0o600, flag: 'wx' }); // exclusive create, owner-only
// …finally: fs.rmSync(tmpDir, { recursive: true, force: true });
```

The unpredictable `mkdtemp` name + `wx` (fail if exists) + `0600` closes the
symlink/pre-create TOCTOU. Clean up the whole `tmpDir` in `finally`.

**(2) Member-name preflight.** Before extracting, list the archive members with
`tar -tzf` and reject any absolute or `..`-escaping name; fail closed:

```js
/** Reject an archive that contains an absolute member or a `..` path segment.
 *  Name-based containment (portable across tar variants via `tar -tzf`). Throws
 *  WienerdogError on any unsafe member. @param {string} tgzFile @param {typeof spawnSync} spawn */
function preflightMembers(tgzFile, spawn) {
  const r = spawn('tar', ['-tzf', tgzFile]);
  if (r.error || r.status !== 0) throw new WienerdogError('could not read the download archive (is `tar` installed?)');
  const names = String(r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
  for (const name of names) {
    if (path.isAbsolute(name) || name.startsWith('/') || name.startsWith('\\')) {
      throw new WienerdogError(`refusing to unpack: archive member has an absolute path (${name})`);
    }
    if (name.split(/[\\/]/).some((seg) => seg === '..')) {
      throw new WienerdogError(`refusing to unpack: archive member escapes staging (${name})`);
    }
  }
}
```

Call `preflightMembers(tgzFile, args.spawn || spawnSync)` immediately before
`extractTarball`. (`--strip-components=1` still applies at extract; the preflight
checks the raw member names, which is the conservative choice.)

**(3) Trustworthy completeness marker.** Replace the `bin/wienerdog.js`-exists
short-circuit with a marker Wienerdog writes into the version dir only after a
verified publish:

```js
const COMPLETE_MARKER = '.wienerdog-complete';
// short-circuit:
if (fs.existsSync(path.join(target, COMPLETE_MARKER))) {
  return { version, target, alreadyPresent: true };
}
// …after a successful renameSync(staging, target):
fs.writeFileSync(path.join(target, COMPLETE_MARKER), `${version}\n`);
```

Write the marker into `staging` BEFORE the atomic `renameSync` (so the published
tree is complete-with-marker atomically), OR into `target` immediately after the
rename — choose the former (keeps publish atomic) and note it. A pre-existing
`target` WITHOUT the marker now falls through to download+verify+extract, and the
existing recovery (`if (fs.existsSync(target)) rmSync`) removes the partial before
the fresh publish. A hand-placed `bin/wienerdog.js` alone no longer counts as
complete.

The marker sits inside `app/<version>/` (already a `vendored-tree` manifest entry —
uninstall-swept; ADR-0016 layout unchanged). It does not affect `current`
repointing or `sync`.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md). Use system
  `tar` (already required) via the injected `spawn` seam so tests stay hermetic.
- Keep `extractTarball`'s signature/behavior; only add the preflight call before it
  and change the temp-file + completeness handling in `installVersion`.
- The completeness marker must be consistent between the short-circuit read and the
  post-publish write — same constant, same path.
- Do not touch `downloadVerified`/`verifyIntegrity`/`parseManifest`/`fetch*` — the
  byte-integrity path is already correct.

## Security checklist

- [ ] The verified tarball bytes are written to an unpredictable private directory
      (`mkdtemp`, 0700) with an exclusive, owner-only create (`{mode:0o600, flag:'wx'}`)
      — no predictable-name symlink/swap TOCTOU between verify and extract.
- [ ] Every archive member NAME is preflighted (via `tar -tzf`) and any absolute or
      `..`-escaping name FAILS CLOSED before extraction — a byte-valid archive cannot
      write outside staging **via member names**. (Explicit residual, NOT closed
      here: a symlink/hardlink member with a safe name but an escaping target — a
      `wd-researcher` spike follow-up; see Out of scope.)
- [ ] A version dir is treated as complete ONLY when it carries the
      `.wienerdog-complete` marker Wienerdog wrote after a verified publish — a lone
      pre-existing `bin/wienerdog.js` no longer bypasses download+verify. (This is
      crash-completeness assuming a trusted local app tree, NOT a cryptographic proof
      that Wienerdog wrote the marker.)

## Acceptance criteria

- [ ] An archive whose `tar -tzf` output contains `../evil` or `/etc/x` is rejected
      with a `WienerdogError` and nothing is extracted (proved with a stubbed `spawn`).
- [ ] `installVersion` short-circuits only when `target/.wienerdog-complete` exists;
      a `target` with `bin/wienerdog.js` but no marker proceeds to download+verify.
- [ ] After a successful install, `target/.wienerdog-complete` exists and contains
      the version; a re-run is a no-op via the marker.
- [ ] The temp tarball is created under an `os.tmpdir()/wd-tarball-*` mkdtemp dir
      with mode 0600, and the whole temp dir is removed afterward. Assert **without a
      new fs seam**, using the existing injected `spawn`: the stub `spawn` records the
      tgz path from its argv (`tar -tzf <tgz>` / `tar -xzf <tgz> …`) and `statSync`s
      it *during* the call (proving it exists, mode `0o600`, under a `wd-tarball-*`
      dir in `os.tmpdir()`), then simulates extraction; after `installVersion`
      returns, assert no `wd-tarball-*` dir remains in `os.tmpdir()` (cleanup ran).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern tarball
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The same member-preflight + completeness fixes in `install.sh do_tarball_install`
  and `install.ps1 Invoke-TarballInstall` (installers #1/#3) — a chained shell/PS
  follow-up, not this JS-core WP.
- **Symlink/hardlink archive member defense (NAMED RESIDUAL — not closed by this
  WP)** — `tar -tzf` lists names, not link types, and reliable link-member rejection
  differs across GNU tar / bsdtar / Windows tar (the owner already parked link
  defense as cross-tar-fragile). A member with a safe name but a target that escapes
  staging, followed by a write through that link, is NOT stopped by the name
  preflight. Follow-up: a `wd-researcher` spike to determine a portable link-member
  rejection (e.g. `tar -tvf` type parsing, or a post-extract `lstat` sweep of the
  staging tree rejecting any symlink/hardlink before publish). The implementer must
  record this residual under "Discovered issues" in the PR; NOT attempted here.
- Wall-clock (vs inactivity) bounding of the tarball/manifest HTTPS timeouts
  (installers #6) — separate minor item.

## Round-2 dispositions

- **Codex round-2 P1 (name-only preflight does not establish extraction
  containment):** RESOLVED by NARROWING the claim, not by adding link defense. The
  WP now states it hardens name-based `../`/absolute escapes + the temp-file TOCTOU
  only; the symlink/hardlink link-member vector is an explicit named residual with a
  `wd-researcher` follow-up spike. (Chosen over attempting cross-tar-fragile link
  rejection now, per the owner's earlier parking of that defense.)
- **Codex round-2 P1 (marker proves presence, not a verified publish):** RESOLVED by
  narrowing the claim to crash-completeness (assuming a trusted local app tree), not
  cryptographic proof. A signed/verified marker is a separate design, out of scope.
- **Codex round-2 P2 (secure-temp acceptance criterion cites a nonexistent fs
  seam):** RESOLVED. `installVersion` injects `downloadBuffer` + `spawn`, not `fs`.
  The criterion is rewritten to observe the temp path/mode through the injected
  `spawn` (which receives the tgz path in its argv) and to inspect `os.tmpdir()`
  after the run — no new injection seam is added.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/093-tarball-extraction-containment`; conventional commits; PR titled
   `fix(tarball): secure temp, member preflight, completeness marker (WP-093)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
