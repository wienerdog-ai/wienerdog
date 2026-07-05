# ADR-0016: npm-less install & update via the registry tarball (`wienerdog update`)

Status: Accepted (amends ADR-0003, ADR-0006, ADR-0013)
Date: 2026-07-05

## Context

Live 0.3.x testing surfaced a real class of user: **Node ≥ 18 is present, but
`npx`/`npm` is missing or broken.** Node is the one irreducible runtime
requirement (the CLI is Node), but npm is not — Wienerdog has **zero runtime
dependencies** (`googleapis` is on-demand, ADR-0013/WP-047), so the published npm
tarball IS the complete application. ADR-0013 already vendors that application
into `~/.wienerdog/app/<version>/` behind a stable `app/current` symlink, and
frames "install/update" as *put the published files at `app/<version>/`, repoint
`current`, re-sync*. For a machine with no npm, that operation reduces to **"fetch
the tarball, verify it, unpack it there"** — no npm needed.

Three facts make this safe and cheap:

1. The npm registry serves version tarballs over plain HTTPS GET at a
   deterministic URL, `https://registry.npmjs.org/wienerdog/-/wienerdog-<v>.tgz`,
   and serves the matching integrity as plain JSON. A single GET of
   `https://registry.npmjs.org/wienerdog/latest` returns the `latest`-tag manifest
   including `version` and `dist.integrity` (an SRI `sha512-<base64>` string). The
   update-availability check (ADR-0015) already GETs this registry.
2. An npm tarball is a gzipped tar whose entries are all under a `package/`
   prefix containing exactly the published `files` list plus `package.json`.
   Extracting it with `--strip-components=1` into `app/<v>/` yields precisely the
   tree `vendorSelf` would have copied (a harmless superset — also README/LICENSE).
3. `tar` and Node's `crypto` are always available on macOS/Linux (and `tar.exe`
   on Windows 10+); neither is an npm dependency.

The owner has decided (2026-07-05) to build this for **0.4.0**: npm-less users get
a working install and easy updates; **npm/npx remains the happy path where
present.**

## Decision

Wienerdog gains a **second, npm-independent distribution channel** that fetches,
integrity-verifies, and unpacks the published registry tarball into the existing
vendored layout. npm/npx stays primary.

1. **Registry tarball as the source of truth.** Both new mechanisms fetch from
   `registry.npmjs.org` — the same origin `npx` installs from. GitHub remains a
   human-readable mirror only; no GitHub-release asset discipline is introduced.
2. **Integrity is verified before any bytes are unpacked.** The verifier computes
   the **sha512** of the downloaded tarball and compares it to the registry's SRI
   `dist.integrity` field. sha512 is required; the legacy sha1 `dist.shasum` is
   **not** used (sha1 is cryptographically broken and this whole path is a trust
   surface). A missing/malformed `integrity`, or a mismatch, aborts and prints the
   `npx` fallback (fail-to-print, ADR-0011 posture). The tarball **URL is
   constructed locally** from the validated semver version, never taken verbatim
   from the (untrusted) registry JSON.
3. **`wienerdog update` — a new, explicit CLI verb.** It fetches the latest
   version from the registry, compares to the running version (reusing the
   update-check module's semver validation and release comparison), and, if newer,
   downloads + verifies + unpacks into `app/<new>/`, then hands off to
   `node app/<new>/bin/wienerdog.js sync` — the **new version re-vendors, repoints
   `current`, and refreshes managed blocks / digest / schedules**. It works with
   or without npm. It **never runs without the user typing the command** (ADR-0004
   / ADR-0015: no auto-update).
4. **`install.sh` gains a consented tarball fallback.** When Node ≥ 18 is present
   but `npx` does not resolve, the bootstrapper shows exactly what it will
   download and where it will land, prompts on `/dev/tty` ([Y/n], default yes),
   fetches the tarball with `curl`, verifies the sha512 (computed with the
   guaranteed-present `node`), extracts with `tar` into `~/.wienerdog/app/<v>/`,
   and execs `node .../app/<v>/bin/wienerdog.js init`. On decline / no-tty / any
   failure it prints the exact `npx wienerdog@latest init` command plus "install
   npm" guidance and exits non-zero. npx-present machines are unchanged.
5. **The update NOTICE names the right command.** ADR-0015's "update available"
   line (in the digest and in `doctor`) quotes `npx wienerdog@latest sync` when
   `npx` resolves on PATH and `wienerdog update` when it does not — a pure,
   spawn-free PATH scan performed at render time and frozen into the rendered line.
6. **`googleapis` stays npm-only, documented, not built.** The on-demand
   `googleapis` install (WP-047) still shells to `npm install`. On an npm-less
   machine that step is unavailable; the Google-setup flow must say so in plain
   language ("Google features need npm — here's how to add it"), never emit a raw
   failure. **No npm-less googleapis path is built.** All other features (memory,
   dreaming, routines, scheduling) work fully without npm.

Windows bootstrap (`install.ps1`) remains **out of scope** (M6–M7); the
`wienerdog update` verb, being pure Node + `tar`, works on Windows already.

## Consequences

- **Trust posture: curl-from-registry vs npx — same origin, now stronger.** Both
  fetch the same bytes from `registry.npmjs.org` over HTTPS. `npx` verifies the
  package integrity internally; the tarball path makes that verification
  **explicit and visible** (sha512 SRI checked before unpack) and refuses to
  unpack unverified bytes. It uses no sudo and no package manager — it writes only
  under `~/.wienerdog/`, exactly what the user asked for by running the installer.
  This is documented as an honest extension of THREAT-MODEL (a second outbound
  registry call, and a checksum-gated local unpack).
- **The iron rule (ADR-0004) holds.** Both mechanisms fetch files, unpack files,
  and repoint a symlink, then exit. Nothing is spawned that outlives its job; no
  daemon, no telemetry, no polling.
- **No-auto-update invariant (ADR-0004/0015) unchanged.** `update` only ever runs
  when the user types it; the notice only *tells*. The 24h opt-out check is
  untouched.
- **`app/<version>/` accretes** as before (each dir is tiny, published files
  only); pruning stays a future nicety. `uninstall` already removes the whole
  `app/` subtree via the single `vendored-tree` manifest entry, so tarball-created
  version dirs are reversible with no new manifest kind.
- **"Just files" fit is exact:** the vendored layout ADR-0013 chose specifically
  *because* it is "unpack a tarball here" now literally is.
- **A published crash-free npm-less path** removes the "print homework and exit"
  dead end for Node-without-npm users, matching the ADR-0011 goal of a real
  one-line install for everyone with the runtime.
- **Hermeticity is binding:** no test may touch the live registry or network. The
  Node fetch/download are behind injectable seams (opts + a
  `WIENERDOG_TARBALL_*` env idiom mirroring `WIENERDOG_UPDATE_FETCH_CMD`); tar
  extraction is tested against a locally-built fixture tarball (built offline with
  `tar`, no `npm pack`, no network); `install.sh` uses its existing consent-harness
  and stub-PATH seams.
