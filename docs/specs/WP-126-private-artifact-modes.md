---
id: WP-126
title: Private-by-default artifact modes — 0700 dirs / 0600 sensitive files on create + sync/doctor repair (audit A5)
status: Ready
model: opus
size: M
depends_on: [WP-124, WP-125]
adrs: [ADR-0004, ADR-0024]
branch: wp/126-private-artifact-modes
---

# WP-126: Private-by-default artifact modes — 0700 dirs / 0600 sensitive files on create + sync/doctor repair (audit A5)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Everything the installer writes must be **idempotent** (running twice = zero
changes) and **reversible**. Plain Node ≥ 18, **zero runtime deps**, JSDoc types only.

The secret lifecycle (WP-122..125) makes several **durable artifacts** that can hold a
transcript-derived secret: the **digest** (`state/digest.md`), the failure **alerts**
(`state/alerts.jsonl`), the per-run **logs** (`logs/<job>/*.log`), the dream **scratch**
extracts (`state/dream-scratch/*.json`), and the **transcript ledger**
(`state/transcript-ledger.json`). A 2026-07-15 security audit (action **A5**, deep-dive
`05-secret-lifecycle.md`, item 8) found these are created with **default permissions** — under
a permissive `umask` they land world-readable (`0755` dirs / `0644` files), so a leaked secret
in a digest or log is readable by every local user, defeating the point of scanning for it.

This WP makes the secret-lifecycle dirs/files **private by default, independent of `umask`,
with an explicit final `chmod`**: `core`/`state`/`logs`/scratch dirs at `0700` and the
sensitive files at `0600` — on **create**, and **repaired** on `sync`/`doctor` for older
`0755`/`0644` installs. It introduces one shared helper and routes the not-yet-private writers
through it. This is the private-modes pillar of **ADR-0024**.

**Scope boundary vs A9 (do not cross it).** A5 scopes ONLY the secret-lifecycle dirs/files
listed here. The full mechanics-root policy, the `secrets/` OAuth-token/grant/client-JSON
hardening, and **log rotation/bounding** are **A9** — this WP does NOT touch `secrets/`
(already `0700` since init/WP-092), the GWS grant/token files, or log rotation. `state`'s two
already-private files (`transcript-ledger.json` and `identity-approvals.json`) already write
`0600` via their own atomic writers (mirrored below) — this WP only ensures the **repair** pass
also covers them and does not regress them.

**A5 opens NO capability gate.** `wienerdog safety` must still show all five gates BLOCKED
after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/core/paths.js`** `getPaths(env)` returns `{ core, state, secrets, logs, … }` (all under
`~/.wienerdog`). Only `secrets` is documented as mode `0700`.

**`src/cli/init.js`** creates the dirs `[paths.core, paths.state, paths.secrets, paths.logs]`
with `fs.mkdirSync(d, { recursive:true, mode: d === paths.secrets ? 0o700 : undefined })` and
only chmods `secrets` afterward (`if (createdSecrets) fs.chmodSync(paths.secrets, 0o700)`). So
**`core`/`state`/`logs` inherit the umask** (typically `0755`).

**`src/core/alerts.js`** `appendAlert` does `fs.mkdirSync(paths.state, { recursive:true })` (no
mode) then `fs.appendFileSync(file, …)` and, on compaction, `writeFileSync(tmp)` + `rename`.
**No `chmod` → `alerts.jsonl` is `0644`.**

**`src/cli/dream.js`** `regenerateDigest()` and **`src/cli/sync.js`** both write `digest.md`
via `writeFileSync(tmp)` + `renameSync(tmp, dest)` with **no `chmod` → `digest.md` is `0644`**.

**`src/core/dream/scratch.js`** `collectExtracts` does `fs.mkdirSync(scratchDir, {recursive})`
(no mode) and `fs.writeFileSync(scratchFile, …)` (no mode). **scratch dir `0755`, extracts
`0644`.**

**Proven private-write pattern to MIRROR** (do not import their internals; generalize into the
new helper): `src/core/identity-approvals.js` `writeRegistry` and `src/core/dream/ledger.js`
`writeLedger` both do `mkdirSync(stateDir, {mode:0o700})` → `writeFileSync(tmp, …, {mode:0o600})`
→ `chmodSync(tmp, 0o600)` → `renameSync(tmp, dest)` → `chmodSync(dest, 0o600)`. That is exactly
the "independent of umask, atomic rename + final chmod" shape the audit asks for.

**`src/cli/sync.js`** is the compiler pass (`sync` regenerates the digest + heals scheduler
state); **`src/cli/doctor.js`** is the read-only health check (every problem a WARN with a
`wienerdog sync` remediation). Both are the natural homes for a repair sweep.

WP-124 modified `src/core/alerts.js` (`sanitizeAlert` scan) and `src/core/dream/brain.js` /
`src/cli/run-job.js`. This WP depends on WP-124 to serialize the shared `alerts.js` edit (a
disjoint region: WP-124 scans field values; this WP chmods the file).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/private-fs.js | `mkdirPrivate(dir)` (0700), `writeFilePrivate(dest, data)` (atomic temp+rename+chmod 0600), `repairPrivateModes(paths)` over the A5-scoped set, read-only `scanPrivateModes(paths)` + `A5_PRIVATE_DIRS`/`A5_PRIVATE_FILE_BASENAMES` |
| modify | src/core/digest.js | render the fixed insecure-modes banner line in the prefix from `opts` (count + `wienerdog sync` remediation; state-driven, adjacent to the quarantine banner) |
| modify | src/cli/init.js | create `core`/`state`/`logs` at 0700 (not umask); keep the existing `secrets` handling |
| modify | src/core/alerts.js | ensure `state` (0700) + `alerts.jsonl` (0600) via a chmod after create/compaction (mirrors the atomic writers) |
| modify | src/cli/dream.js | write `digest.md` via `writeFilePrivate` (0600); pass the `scanPrivateModes` count into the `renderDigest` opts; scratch handled in scratch.js |
| modify | src/core/dream/scratch.js | create the scratch dir 0700; write each extract 0600 |
| modify | src/cli/sync.js | write `digest.md` 0600; call `repairPrivateModes(paths)` (non-dry-run; dry-run reports the `scanPrivateModes` count); pass the post-repair scan count into the `renderDigest` opts |
| modify | src/cli/doctor.js | report any A5-scoped dir/file that is group/world-accessible as a WARN with `wienerdog sync` remediation |
| create | tests/unit/private-fs.test.js | `mkdirPrivate`/`writeFilePrivate` produce 0700/0600 under a permissive umask; `repairPrivateModes` fixes 0755/0644 → 0700/0600; idempotent |
| modify | tests/unit/init.test.js | core/state/logs end 0700 under a permissive umask |
| modify | tests/unit/alerts.test.js | alerts.jsonl ends 0600; file-bounding/compaction unchanged |
| modify | tests/unit/doctor.test.js | doctor WARNs a world-readable digest/alerts and passes when private |
| modify | tests/unit/digest.test.js | insecure-modes count > 0 → fixed banner line in the prefix; 0/absent → no banner (golden unchanged) |
| modify | tests/integration/dream.test.js | after a dream, digest.md/scratch extracts are 0600 and the scratch dir 0700 |

### Exact contracts

**1. `src/core/private-fs.js`.** Pure `fs` I/O; no env beyond the passed paths; no network.

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** Create `dir` (recursive) private to the owner (0700), independent of umask:
 *  mkdir with mode then chmod (mkdir's mode is umask-masked on some platforms; the
 *  explicit chmod defeats a permissive umask). Idempotent; a POSIX no-op guard on
 *  win32 (Windows ignores POSIX modes — chmod is best-effort, never throws there).
 *  @param {string} dir */
function mkdirPrivate(dir) { /* mkdirSync(dir,{recursive:true,mode:0o700}); chmodSync(dir,0o700) best-effort */ }

/** Atomically write `data` to `dest` as a 0600 file (temp+rename+final chmod), mirroring
 *  identity-approvals.writeRegistry / ledger.writeLedger. Ensures the parent dir is 0700.
 *  @param {string} dest @param {string|Buffer} data */
function writeFilePrivate(dest, data) { /* mkdirPrivate(dirname); write tmp {mode:0o600}; chmod tmp; rename; chmod dest */ }

/** The A5-scoped private set (NOT the whole core — secrets/tokens/grants are A9).
 *  state/quarantine is the staged-output secret quarantine (WP-123, OWNER-APPROVED
 *  2026-07-17) — it can hold raw secret bytes, so it MUST be in the repair set. */
const A5_PRIVATE_DIRS = (paths) => [paths.core, paths.state, paths.logs, path.join(paths.state, 'dream-scratch'), path.join(paths.state, 'quarantine')];
const A5_PRIVATE_FILE_BASENAMES = ['digest.md', 'alerts.jsonl', 'transcript-ledger.json', 'identity-approvals.json'];

/** Repair legacy modes: chmod every existing A5-scoped dir to 0700 and every existing
 *  A5-scoped file (state/<basename> + every logs/**/*.log + every dream-scratch/*.json +
 *  every quarantine/* file) to
 *  0600. Idempotent; best-effort per entry (a missing/odd entry is skipped, never throws);
 *  win32 chmod is a no-op. Returns the count of entries changed for a truthful doctor/sync line.
 *  Does NOT touch `secrets/` or any GWS grant/token/client file (A9).
 *  @param {import('./paths').WienerdogPaths} paths @returns {{changed:number}} */
function repairPrivateModes(paths) { /* implement per the rules */ }

/** READ-ONLY scan of the same A5-scoped set: count entries whose mode grants any
 *  group/world bit ((mode & 0o077) !== 0). Never chmods. POSIX only (win32 → {insecure:0}).
 *  Consumers: doctor's WARN, sync --dry-run's would-repair count, and the digest
 *  insecure-modes banner (OWNER-APPROVED 2026-07-17).
 *  @param {import('./paths').WienerdogPaths} paths @returns {{insecure:number}} */
function scanPrivateModes(paths) { /* implement per the rules */ }

module.exports = { mkdirPrivate, writeFilePrivate, repairPrivateModes, scanPrivateModes, A5_PRIVATE_DIRS, A5_PRIVATE_FILE_BASENAMES };
```

**2. `init.js`.** Create `core`/`state`/`logs` at `0700` (independent of umask) — either pass
`mode:0o700` to the existing `mkdirSync` AND chmod afterward, or route those three through
`mkdirPrivate`. Keep the `secrets` create/chmod and the manifest `record` for every dir exactly
as today. A pre-existing user path is still never re-permissioned by `init` (the existing
`if (!dirExists(d))` guard stays — repair of pre-existing dirs is `sync`/`doctor`'s job).

**3. `alerts.js`.** `appendAlert` must leave `state` at `0700` and `alerts.jsonl` at `0600`
independent of umask, without changing the append/compaction/guard logic:
- replace the bare `fs.mkdirSync(paths.state, { recursive:true })` with `mkdirPrivate(paths.state)`;
- after the atomic append creates the file (and after the compaction `renameSync`), `chmodSync`
  the file to `0600` (best-effort; a first-append create otherwise inherits umask). Do NOT
  change the separator guard, the atomic-append-before-compaction ordering, the empty-read
  guard, or the byte/count bounds.

**4. `dream.js` + `sync.js` digest write.** Replace the `writeFileSync(tmp)` + `renameSync` +
(implicit umask) digest write in BOTH `regenerateDigest()` (dream.js) and the sync digest block
with `writeFilePrivate(dest, digest)` (0600, atomic). Preserve every surrounding behavior (the
identity approvals read, the quarantine banner, the dry-run guard in dream.js — `writeFilePrivate`
is only reached on the non-dry-run path, exactly where `writeFileSync` is today).

**5. `scratch.js`.** `collectExtracts` creates `state/dream-scratch/` via `mkdirPrivate` (0700)
and writes each extract via `writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2))`
(0600). The `rm -rf` + recreate ordering, the water-fill, and the one-file-at-a-time
materialization are unchanged — only the create mode + the write helper change.

**6. `sync.js` repair.** After the digest write (non-dry-run), call
`repairPrivateModes(paths)` and print a truthful line (`wienerdog: hardened N artifact
permission(s).` when `changed > 0`, silent otherwise). On `--dry-run`, do NOT chmod — report
what WOULD be repaired (a count from a read-only mode scan), mirroring sync's other dry-run
diagnostics.

**7. `doctor.js` report.** Add a read-only check: for each existing A5-scoped dir/file, if its
mode grants any group/world bit (`(mode & 0o077) !== 0` on POSIX; skip on win32), emit a WARN
`wienerdog: <path> is readable by other users — run \`wienerdog sync\` to harden it.` doctor
NEVER mutates (WP-070 invariant); `sync` is the fixer. Build it on `scanPrivateModes`/the same
per-entry predicate so doctor, sync --dry-run, and the banner can never disagree.

**8. Insecure-modes digest banner (OWNER-APPROVED 2026-07-17).** `renderDigest` accepts an
insecure-modes count in `opts` (e.g. `opts.insecureModes`); when `> 0`, the prefix carries ONE
fixed, code-owned line — the count + the `wienerdog sync` remediation, no paths, no content —
adjacent to the WP-125 quarantine banner and never truncated by `capDigest`. When `0`/absent:
no banner (golden unchanged). The dream.js and sync.js digest call sites obtain the count via
`scanPrivateModes(paths)` (sync: AFTER its repair ran, so a successful sync renders no banner)
and pass it in. The nightly path only *reads* modes — it never chmods (the ruling above).

### Worked example (assert in private-fs.test.js under a permissive umask)

```
process.umask(0o022);
mkdirPrivate(`${tmp}/state`)             → (statSync.mode & 0o777) === 0o700
writeFilePrivate(`${tmp}/state/x`, 'hi') → 0o600, content 'hi', parent 0o700
// legacy install:
fs.mkdirSync(`${tmp}/state`, {mode:0o755}); fs.writeFileSync(`${tmp}/state/digest.md`,'d',{mode:0o644});
repairPrivateModes(pathsFor(tmp))        → state 0o700, digest.md 0o600; second call {changed:0}
```

## OWNER-APPROVED (2026-07-17) — DECISION NEEDED, resolve in the walkthrough

- **OWNER-APPROVED (2026-07-17) — A5-scoped set membership confirmed.** Dirs (`0700`):
  `core`, `state`, `logs`, `state/dream-scratch`, `state/quarantine` (per the WP-123
  quarantine-preserve ruling). Files (`0600`): `digest.md`, `alerts.jsonl`,
  `transcript-ledger.json`, `identity-approvals.json`, every `logs/**/*.log`, every scratch
  extract, every `state/quarantine/*` file. Explicitly EXCLUDED (A9): `secrets/` and its
  contents, GWS grant/token/client JSON, `scheduler-status.json`, `watermarks.json`
  (retired), `config.yaml`, the manifest, and log rotation. The narrow explicit set is
  deliberate: `repairPrivateModes` is a permission-rewriting sweep, and the A5/A9 boundary
  keeps it auditable (a reviewer checks it never walks into `secrets/`). Non-secret-bearing
  files like `config.yaml` were considered and left to A9 on purpose.
- **OWNER-APPROVED (2026-07-17) — repair on `sync` only, PLUS a state-driven digest banner.**
  Mutation stays attended: `sync` fixes, `doctor` reports details, and a nightly
  `run-job`/dream NEVER silently re-chmods. But because `doctor` is never run automatically
  (verified: nothing in src/ invokes it — it is only suggested in error messages), the owner
  asked for awareness without automation: the digest control-plane prefix gains a fixed,
  code-owned **insecure-modes banner** — when the read-only mode scan finds any A5-scoped
  dir/file with group/world bits, the prefix carries one line with the COUNT and the
  `wienerdog sync` remediation (no paths, no content — details live in `doctor`). State-driven
  like the WP-125 quarantine banner: it renders while the condition holds and clears itself
  after the fixing `sync`. Implementation: `private-fs.js` also exports a read-only
  `scanPrivateModes(paths) → {insecure:number}` (the same scan the sync `--dry-run` count and
  `doctor` use); the dream.js/sync.js digest call sites pass the count into `renderDigest`
  opts; `digest.js` renders the fixed line. This WP therefore also touches `digest.js` and
  depends on WP-125 to serialize that file's edits (the WP-119/120 precedent).
- **OWNER-APPROVED (2026-07-17) — win32 posture: A5 private-modes is a POSIX guarantee.**
  On Windows the `chmod` calls are best-effort no-ops (never throw), the doctor mode check,
  the sync repair count, and the insecure-modes digest banner are skipped
  (`scanPrivateModes` → `{insecure:0}`), and WP-127 documents that Windows protection relies
  on the per-user profile ACLs, not on Wienerdog. Native ACL handling (icacls / an ACL
  library) is rejected: it would break the zero-dependency rule for marginal gain over the
  default per-user ACL, and the audit does not ask for it. An honest documented limit, not a
  silent one.

## Implementation notes & constraints

- **This is the private-modes pillar of ADR-0024; the A5/A9 boundary is load-bearing.** Touch
  ONLY the A5-scoped set. Do NOT chmod `secrets/`, tokens, grants, or add log rotation — those
  are A9. A reviewer will check that `repairPrivateModes` never walks into `secrets/`.
- **Independent of umask.** `mkdir(mode)` is masked by umask on some platforms, so the explicit
  final `chmod` is mandatory (that is the whole point). Mirror the identity-approvals/ledger
  pattern exactly.
- **Idempotent + reversible.** Re-running `sync` changes nothing when modes are already private
  (`repairPrivateModes` returns `{changed:0}`). Modes are not manifest-tracked (a chmod is not a
  created artifact); uninstall already removes these files. Do not add manifest entries for
  chmods.
- **Best-effort, never crash.** A chmod on a vanished/odd path is swallowed per entry; a win32
  chmod no-ops. The dream/sync/doctor flows must never fail because a mode could not be set.
- **No behavior change beyond modes.** Digest/alerts/scratch content, atomicity, the dry-run
  guards, and the file-bounding logic are all unchanged. Only the permission bits (and the
  new sync/doctor repair line) change.
- Reuse the proven atomic-write shape; zero deps, JSDoc only. When uncertain, choose simpler +
  record it.

## Security checklist

- [ ] Under a permissive umask, a fresh install and a subsequent `sync` both leave `core`,
      `state`, `logs`, and `state/dream-scratch` at `0700` and `digest.md`, `alerts.jsonl`,
      `transcript-ledger.json`, `identity-approvals.json`, and every `logs/**/*.log` /
      scratch extract at `0600`. An upgrade from a `0755`/`0644` install is repaired by `sync`;
      `doctor` WARNs while it is still world-readable. The repair NEVER touches `secrets/`,
      tokens, or grants (A9 boundary). All writes are atomic (temp+rename+final chmod). Windows
      is best-effort (no POSIX modes) and documented as such.

## Acceptance criteria

- [ ] `mkdirPrivate`/`writeFilePrivate` produce `0700`/`0600` under `umask 0o022` (POSIX).
- [ ] Fresh `init` under a permissive umask → `core`/`state`/`logs` are `0700`.
- [ ] After a dream run, `digest.md` and the scratch extracts are `0600` and the scratch dir is
      `0700`; `alerts.jsonl` (when a failure wrote one) is `0600`.
- [ ] `repairPrivateModes` turns a hand-made `0755`/`0644` state/logs/digest/alerts into
      `0700`/`0600` and is idempotent (`{changed:0}` on the second call); it does NOT alter
      anything under `secrets/`.
- [ ] `doctor` WARNs on a world-readable digest/alerts and is clean once private; it never
      mutates.
- [ ] With any A5-scoped entry group/world-accessible, the rendered digest prefix carries the
      fixed insecure-modes banner (count + `wienerdog sync`, no paths); after a repairing
      `sync`, the banner is gone; a clean install never renders it (golden unchanged). The
      nightly dream path never chmods — it only passes the read-only scan count.
- [ ] The alerts file-bounding/compaction/guards and the digest/scratch content are unchanged;
      a clean run's artifacts differ from before ONLY in their permission bits.
- [ ] `wienerdog safety` shows all five gates BLOCKED; `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "private-fs"
npm test -- --test-name-pattern "init"
npm test -- --test-name-pattern "alert"
npm test -- --test-name-pattern "doctor"
npm test -- --test-name-pattern "dream"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- `secrets/` OAuth-token/grant/client-JSON modes, the full mechanics-root policy, and **log
  rotation/bounding** — **A9** (this WP hardens only the A5 secret-lifecycle set).
- The shared detector / staged gate / output sanitizing / digest section gate — **WP-122..125**.
- A5 documentation — **WP-127**.
- Any change to the atomic-write internals of `identity-approvals.js` / `ledger.js` (already
  0600 — leave them; the repair pass merely covers them).
- Manifest-tracking chmods, or repairing modes on every `run-job` (repair is `sync`-time).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/126-private-artifact-modes`; conventional commits; PR titled
   `feat(core): private-by-default artifact modes + sync/doctor repair (WP-126)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
