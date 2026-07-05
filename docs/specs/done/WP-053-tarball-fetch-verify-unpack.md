---
id: WP-053
title: Registry-tarball fetch, sha512 verify, and unpack into the vendored layout
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0016, ADR-0013, ADR-0004]
branch: wp/053-tarball-fetch-verify-unpack
---

# WP-053: Registry-tarball fetch, sha512 verify, and unpack into the vendored layout

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" installed as plain files under `~/.wienerdog/`
(the **canonical core**). **IRON RULE (ADR-0004): Wienerdog is just files** — no
daemons, no servers, no background process that outlives its job, no telemetry.

Wienerdog has **zero runtime npm dependencies**, so the published npm tarball IS
the complete application. ADR-0013 already vendors that application into
`~/.wienerdog/app/<version>/` behind a stable `app/current` symlink. The owner has
decided (ADR-0016) to add an **npm-independent** way to obtain a version: fetch
the published tarball straight from the npm registry over HTTPS, verify its
checksum, and unpack it into `app/<version>/`. This WP builds **only the reusable
core mechanism**. It is consumed by:

- **WP-054** — the `wienerdog update` CLI verb (not in this WP).
- (`install.sh`'s bash fallback is WP-055 and does NOT import this module — it is
  pure bash. This WP is the Node path only.)

Three registry facts this module relies on (all standard npm-registry behavior):

1. A single HTTPS GET of `https://registry.npmjs.org/wienerdog/latest` returns the
   `latest`-dist-tag **version manifest** as JSON, including `version` (semver) and
   `dist.integrity` (an SRI string of the form `sha512-<base64>`), and
   `dist.shasum` (legacy sha1 hex — **we do NOT use it**).
2. The tarball for a version lives at the **deterministic** URL
   `https://registry.npmjs.org/wienerdog/-/wienerdog-<version>.tgz`. We CONSTRUCT
   this URL ourselves from the validated semver version; we never trust the
   `dist.tarball` string in the (untrusted) registry JSON.
3. An npm tarball is a gzipped tar whose entries are all under a `package/`
   prefix. Extracting with `tar --strip-components=1` drops that prefix, yielding
   `bin/ src/ skills/ templates/ package.json …` — exactly the tree `vendorSelf`
   copies (a harmless superset).

**Binding invariants for this WP:**

- **Integrity is verified before any byte is unpacked.** Compute the **sha512** of
  the downloaded tarball and compare to the manifest's `dist.integrity`. sha512
  only; sha1 `dist.shasum` is never used (it is cryptographically broken). A
  missing/malformed integrity or any mismatch → **throw `WienerdogError`** (the
  caller prints the `npx` fallback; ADR-0011 fail-to-print posture).
- **Untrusted registry input, validated.** The version string must pass the strict
  semver shape gate (reuse `isSemver` from `src/core/update-check.js`). The
  tarball URL is constructed locally from that version — never read from the JSON.
- **Atomic publish.** Unpack into a per-pid staging dir, then `rename` it into
  `app/<version>/` — mirror `vendorSelf`'s staging→rename so a partial extract is
  never visible as a version dir. Idempotent: if `app/<version>/bin/wienerdog.js`
  already exists, do nothing and report it.
- **No manifest write.** WP-042/WP-013's `vendored-tree` manifest entry
  (`{kind:'vendored-tree', path:<core>/app}`) already covers the whole `app/`
  subtree; `uninstall` removes it wholesale. New version dirs under it need no new
  entry and no new manifest kind. Do NOT record anything.
- **Hermeticity (institutional rule — no live registry in tests, ever).** Every
  network touch is behind an injectable seam AND an env seam. `tar` extraction is
  tested against a **locally-built fixture tarball** (built offline with `tar`; no
  `npm pack`, no network).

## Current state

### `src/core/vendor.js` (WP-042/049/051 — DONE; do NOT edit here)

Exports you will reuse (via `require('./vendor')`):

```js
function appDir(paths)      // → <core>/app
function currentLink(paths) // → <core>/app/current
function currentBin(paths)  // → <core>/app/current/bin/wienerdog.js
function repointCurrent(paths, targetDir, opts)  // atomic, Windows-safe, no-op if already correct
function vendorSelf(paths, opts) // copies running pkg → app/<v>, repoints current
```

`vendorSelf`'s prod path stages into `app/<v>.staging.<pid>` then `fs.renameSync`s
onto `app/<v>`, guarded by `if (!fs.existsSync(target))`. Mirror that shape.

### `src/core/update-check.js` (WP-045/046 — DONE; do NOT edit here)

Reuse these exports (via `require('./update-check')`):

```js
function isSemver(v)         // strict semver shape gate; length-guarded
function cmpRelease(a, b)    // -1|0|1 on major.minor.patch
function currentVersion()    // this build's package.json version
```

`defaultFetchLatest(timeoutMs)` there GETs the dist-tags endpoint and honors the
env seam `WIENERDOG_UPDATE_FETCH_CMD` (single-token exec whose stdout is the
version). This WP introduces its **own** parallel seams (below) — do NOT reuse
`WIENERDOG_UPDATE_FETCH_CMD` for the tarball paths.

### `src/core/paths.js` — `getPaths(env)` → `{ home, core, state, ... }`

`paths.core` = `$WIENERDOG_HOME || ~/.wienerdog`. There is NO `paths.app`; use
`vendor.appDir(paths)`.

### `src/core/errors.js` — `class WienerdogError extends Error`

Throw this for all expected failures (bin/wienerdog.js turns it into `wienerdog:
<message>` + exit 1, no stack).

### `tests/unit/vendor.test.js` — isolation helper to copy

```js
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-tarball-'));
  const core = path.join(root, 'wd');
  fs.mkdirSync(core, { recursive: true });
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}
```

Isolate **both** `HOME` and `WIENERDOG_HOME` (WP-042 lesson: overriding only
`WIENERDOG_HOME` splits `paths.core` from `paths.home` and pollutes the real home).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/tarball.js | fetch manifest, download+verify, extract, `installVersion` |
| create | tests/unit/tarball.test.js | fully hermetic; injected seams; fixture tgz built with `tar` |

### Exact contracts

**`src/core/tarball.js`** — implement exactly this shape and behavior:

```js
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('./errors');
const { isSemver } = require('./update-check');
const { appDir } = require('./vendor');

const REGISTRY = 'https://registry.npmjs.org';
const PKG = 'wienerdog';
const META_TIMEOUT_MS = 5000;              // manifest JSON GET
const TARBALL_TIMEOUT_MS = 30000;          // tarball GET (larger, bounded)
const MAX_META_BYTES = 1 * 1024 * 1024;    // 1 MiB manifest cap
const MAX_TARBALL_BYTES = 64 * 1024 * 1024; // 64 MiB tarball cap

/** Manifest URL for the `latest` dist-tag. @returns {string} */
function latestManifestUrl() { return `${REGISTRY}/${PKG}/latest`; }

/** Deterministic tarball URL for a version — CONSTRUCTED locally, never taken
 *  from registry JSON. @param {string} version @returns {string} */
function tarballUrl(version) { return `${REGISTRY}/${PKG}/-/${PKG}-${version}.tgz`; }

/** Parse & validate a `latest` manifest JSON string into the fields we use.
 *  @param {string} jsonText
 *  @returns {{version:string, integrity:string}}
 *  @throws WienerdogError on bad shape / non-semver / missing|malformed integrity */
function parseManifest(jsonText) { /* ... see rules below ... */ }

/**
 * Fetch & validate the latest version manifest.
 * Order of resolution (first that applies):
 *   1. opts.fetchManifest(timeoutMs) → Promise<string(JSON)>  (unit-test seam)
 *   2. env WIENERDOG_TARBALL_META_CMD — single-token exec whose stdout is the
 *      manifest JSON (integration seam; mirrors WIENERDOG_UPDATE_FETCH_CMD)
 *   3. HTTPS GET latestManifestUrl(), bounded META_TIMEOUT_MS, MAX_META_BYTES cap
 * Then parseManifest() the text.
 * @param {{fetchManifest?:(t:number)=>Promise<string>}} [opts]
 * @returns {Promise<{version:string, integrity:string}>}
 */
async function fetchLatestManifest(opts = {}) { /* ... */ }

/**
 * Download the tarball bytes for a version and VERIFY sha512 BEFORE returning.
 * Resolution order:
 *   1. opts.downloadBuffer(version, timeoutMs) → Promise<Buffer>  (unit-test seam)
 *   2. env WIENERDOG_TARBALL_CMD — single-token exec whose stdout is the raw
 *      tarball bytes (spawned with encoding:'buffer')
 *   3. HTTPS GET tarballUrl(version), bounded, MAX_TARBALL_BYTES cap
 * Verify: verifyIntegrity(buf, integrity) must be true, else throw WienerdogError.
 * @param {string} version @param {string} integrity  (sha512-<base64>)
 * @param {{downloadBuffer?:(v:string,t:number)=>Promise<Buffer>}} [opts]
 * @returns {Promise<Buffer>}  the verified tarball bytes
 */
async function downloadVerified(version, integrity, opts = {}) { /* ... */ }

/** True iff sha512(buf) base64 equals the payload of `sha512-<base64>`.
 *  Rejects (returns false) any non-sha512 / malformed integrity.
 *  @param {Buffer} buf @param {string} integrity @returns {boolean} */
function verifyIntegrity(buf, integrity) {
  if (typeof integrity !== 'string') return false;
  const m = integrity.match(/^sha512-([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return false;
  const got = crypto.createHash('sha512').update(buf).digest('base64');
  return got === m[1];
}

/**
 * Extract a verified .tgz into destDir, stripping the leading `package/`
 * component. Shells out to system `tar` (present on macOS/Linux; tar.exe on
 * Win10+). Throws WienerdogError with a plain message if `tar` is missing or
 * exits non-zero. destDir must already exist.
 * @param {string} tgzFile @param {string} destDir
 * @param {{spawn?: typeof spawnSync}} [opts]  seam for the tar-missing test
 */
function extractTarball(tgzFile, destDir, opts = {}) { /* tar -xzf <tgz> --strip-components=1 -C <destDir> */ }

/**
 * Ensure app/<version>/ exists by fetching+verifying+unpacking the tarball.
 * Idempotent: if app/<version>/bin/wienerdog.js already exists, do NOTHING and
 * return {version, target, alreadyPresent:true}. Otherwise: download+verify,
 * write the bytes to a temp .tgz, extract into a per-pid STAGING dir
 * (app/<version>.staging.<pid>), then fs.renameSync it onto app/<version>
 * (atomic publish; mirror vendorSelf). Cleans up the temp .tgz and any leftover
 * staging dir. Does NOT repoint `current` and does NOT touch the manifest.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{version:string, integrity:string,
 *          fetchManifest?:Function, downloadBuffer?:Function, spawn?:Function}} args
 *   version+integrity are REQUIRED here (the caller obtained them via
 *   fetchLatestManifest); this keeps installVersion decoupled from the network.
 * @returns {Promise<{version:string, target:string, alreadyPresent:boolean}>}
 */
async function installVersion(paths, args) { /* ... */ }

module.exports = {
  REGISTRY, PKG, latestManifestUrl, tarballUrl, parseManifest,
  fetchLatestManifest, downloadVerified, verifyIntegrity, extractTarball,
  installVersion,
};
```

**`parseManifest(jsonText)` rules (exact):**

1. `JSON.parse`; any parse error → `throw new WienerdogError('could not read the
   registry response')`.
2. `version` must satisfy `isSemver(version)`; else
   `throw new WienerdogError('registry returned an invalid version')`.
3. `integrity = obj.dist && obj.dist.integrity`; must be a string matching
   `/^sha512-[A-Za-z0-9+/]+={0,2}$/`; else `throw new WienerdogError('registry
   response has no usable sha512 checksum')`.
4. Return `{ version, integrity }` — nothing else (ignore `dist.tarball`,
   `dist.shasum`, and all other fields).

**HTTPS GET helper (for the default network paths):** mirror
`update-check.js`'s `defaultFetchLatest` https shape — bounded `timeout`,
`res.statusCode !== 200 → reject`, destroy on exceeding the byte cap, reject on
`'timeout'`/`'error'`. For the tarball, collect into a Buffer (not a string):
`const chunks = []; res.on('data', c => { chunks.push(c); total += c.length; if
(total > MAX_TARBALL_BYTES) req.destroy(new Error('tarball too large')); });` then
`resolve(Buffer.concat(chunks))`.

**Env-seam exec:** for `WIENERDOG_TARBALL_META_CMD`, `spawnSync(cmd, [], {timeout,
encoding:'utf8'})` and use `stdout`. For `WIENERDOG_TARBALL_CMD`, `spawnSync(cmd,
[], {timeout, maxBuffer: MAX_TARBALL_BYTES})` with **no `encoding`** so `stdout`
is a Buffer. Non-zero status or `.error` → throw.

### Example (evidence-shaped)

`fetchLatestManifest` over a stub returning:

```json
{ "name": "wienerdog", "version": "0.4.0",
  "dist": { "integrity": "sha512-abc…==", "shasum": "deadbeef…", "tarball": "https://ignored" } }
```

→ resolves `{ version: '0.4.0', integrity: 'sha512-abc…==' }` (tarball URL ignored).

`installVersion(paths, {version:'0.4.0', integrity, downloadBuffer})` on a fresh
core → creates `<core>/app/0.4.0/bin/wienerdog.js` (and `src/`, `package.json`,
etc.), returns `{version:'0.4.0', target:'<core>/app/0.4.0', alreadyPresent:false}`.
A second identical call → `{..., alreadyPresent:true}` and makes no writes.

## Implementation notes & constraints

- **No new npm dependencies** (`node:https`, `node:crypto`, `node:child_process`
  are built-in). JSDoc types only; no TypeScript; no build step.
- `extractTarball` command: `spawn('tar', ['-xzf', tgzFile, '--strip-components=1',
  '-C', destDir])`. Use the injectable `opts.spawn` (default `spawnSync`) so the
  "tar missing / fails" branch is testable by injecting a spawn that returns
  `{status:1}` or `{error:new Error('ENOENT')}`. On failure throw
  `new WienerdogError('could not unpack the download (is \`tar\` installed?)')`.
- **Staging + idempotency ordering in `installVersion`:** check
  `fs.existsSync(path.join(target,'bin','wienerdog.js'))` FIRST (return
  alreadyPresent). Only then download. Write bytes to
  `os.tmpdir()`/a per-pid temp `.tgz` (or under the staging dir); `mkdirSync`
  the staging dir `${target}.staging.${process.pid}` (rm it first, force); extract
  into it; `fs.mkdirSync(appDir(paths), {recursive:true})`; `fs.renameSync(staging,
  target)`. Wrap in try/finally that removes the temp `.tgz` and any surviving
  staging dir.
- **Never repoint `current` here** and **never write the manifest** — those belong
  to the spawned `sync` in WP-054. Keeping `installVersion` side-effect-limited to
  "create app/<v>/" is what makes the WP-054 orchestration safe.
- **Hermeticity is binding.** `tarball.test.js` MUST NOT reach the network:
  - Build a fixture tarball IN the test with `tar` (offline, no `npm pack`):
    make a temp `pkg/` with `pkg/package/bin/wienerdog.js`, `pkg/package/src/x.js`,
    `pkg/package/package.json`; `spawnSync('tar', ['-czf', tgz, '-C', pkg,
    'package'])`. Compute its real integrity: `'sha512-' +
    crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64')`.
  - Test `installVersion` by injecting `downloadBuffer` → `fs.readFileSync(tgz)`
    and passing the computed integrity; assert `app/<v>/bin/wienerdog.js` exists
    and content matches; assert the leading `package/` was stripped.
  - Prove hermeticity: re-run the suite (or a dedicated case) with
    `require('node:https').get` monkey-patched to `throw` and confirm the seam
    paths never call it (WP-045 precedent).
- **Untrusted-input tests (required):** feed `parseManifest` a non-semver version,
  a missing `dist`, a `sha1-…` integrity, a `sha512-` with illegal base64 chars,
  and non-JSON — each must `throw WienerdogError`, nothing returned. Feed
  `verifyIntegrity` a buffer whose sha512 does NOT match → `false`; a `sha256-…`
  integrity → `false`.
- **Mismatch test (the security-critical case):** `downloadVerified` with a
  `downloadBuffer` returning bytes whose sha512 ≠ the passed integrity → throws;
  assert nothing is unpacked.
- When uncertain: choose the simpler option; record it in the PR under "Decisions
  made". Do NOT expand scope.

## Acceptance criteria

- [ ] `parseManifest` returns `{version, integrity}` for a well-formed manifest and
      throws `WienerdogError` for: non-JSON, non-semver version, absent
      `dist.integrity`, non-sha512 or malformed integrity.
- [ ] `tarballUrl('0.4.0')` === `https://registry.npmjs.org/wienerdog/-/wienerdog-0.4.0.tgz`;
      `dist.tarball` in the manifest is ignored.
- [ ] `verifyIntegrity(buf, 'sha512-<correct b64>')` is `true`; wrong bytes,
      `sha256-…`, `sha1-…`, and malformed strings are `false`.
- [ ] `downloadVerified` throws when the bytes' sha512 ≠ the integrity, and returns
      the buffer when they match.
- [ ] `installVersion` on a fresh temp core creates `app/<v>/bin/wienerdog.js`
      (leading `package/` stripped) and returns `alreadyPresent:false`; a second
      call returns `alreadyPresent:true` and makes zero new writes.
- [ ] `installVersion` never repoints `current` (no `app/current` symlink is
      created by it) and never writes `install-manifest.json`.
- [ ] `extractTarball` throws a plain `WienerdogError` (not a raw stack) when the
      injected `spawn` reports `tar` missing/failed.
- [ ] `npm test` and `npm run lint` pass; no test performs real network I/O
      (proven by a https-throws run).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'tarball'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `wienerdog update` CLI verb, the notice command switch, and repointing
  `current` after install — **WP-054**.
- Any change to `install.sh` — **WP-055**.
- Any change to `vendor.js`, `update-check.js`, `sync.js`, `doctor.js`,
  `bin/wienerdog.js`, or the manifest — this WP is a self-contained new module.
- Pruning old `app/<version>/` dirs (future nicety, ADR-0013).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/053-tarball-fetch-verify-unpack`; conventional commits; PR titled
   `feat(tarball): registry fetch + sha512 verify + unpack into vendored layout (WP-053)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
