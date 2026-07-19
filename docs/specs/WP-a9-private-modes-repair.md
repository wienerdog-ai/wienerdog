---
id: WP-a9-private-modes-repair
title: Extend the private-modes predicate to the whole mechanics root — secrets/, grants, tokens, client JSON, exec pins — so a permissive-umask install and a legacy 0755/0644 upgrade both end private
status: Draft
model: opus
size: M
depends_on: [WP-154]
adrs: [ADR-0004, ADR-0024]
epic: audit-a9
---

# WP-a9-private-modes-repair: Full-root private modes + upgrade repair (audit A9, code part)

## Context (read this, nothing else)

Wienerdog's **canonical core** is `~/.wienerdog/` — config, state, secrets,
logs, and the install manifest. **IRON RULE (ADR-0004): Wienerdog is just
files.** Everything it writes to a user's machine must be private to the owner:
directories `0700`, sensitive files `0600`, **independent of the user's umask**
(a permissive `umask 022` or `000` must not leak a token as world-readable), and
**repairable** — a machine that predates a hardening must be fixed on the next
`sync`/`doctor`, not left insecure.

The 2026-07-15 audit action **A5** (ADR-0024) shipped the private-modes
machinery in `src/core/private-fs.js`: `0700` dirs / `0600` files via an explicit
`chmod` that defeats a permissive umask, plus a single read-only predicate
(`insecureEntries`) that three surfaces share so they can never disagree —
`doctor` WARNs, `sync --dry-run`'s would-repair count, and the digest's
insecure-modes banner. But A5 was **deliberately scoped narrow**: its own module
header records that it covers **only** an explicit set (core, state, logs, dream
scratch, quarantine; and the files `digest.md`, `alerts.jsonl`,
`transcript-ledger.json`, `identity-approvals.json`) and **"never walks into
`secrets/`, GWS token/grant/client files, config.yaml, the manifest, or scheduler
state — those are audit action A9's scope."**

This WP closes that A9 scope. Audit action **A9** (P1) requires:

> - "Make the whole Wienerdog mechanics root private by default where compatible;
>   explicitly protect state, logs, digest, alerts, scratch, **grants, tokens,
>   and client JSON**."
> - "Repair existing modes on doctor/sync rather than relying on `mkdir(mode)`
>   for pre-existing directories."
>
> A9 acceptance (this WP's half): "Fresh install under permissive umask **and**
> an upgrade from 0755/0644 state both end with the declared private modes."

**Gap analysis (verified against the live code — do this, don't rediscover it).**
The **write** paths for the *credential* artifacts are already umask-independent
`0600`: GWS tokens/client JSON via `src/gws/client.js`'s temp+rename+chmod-`0600`
writer; the broker grant store, the executable pins (WP-154), and run evidence
via `private-fs.writeFilePrivate` (`0600`). So the **fresh-install-under-
permissive-umask** half is already satisfied *for those files at write time*.

Two gaps remain, and this WP closes both:

1. **The shared predicate/repair set does not enumerate the A9 artifacts.**
   `insecureEntries` / `repairPrivateModes` / `scanPrivateModes` do **not** list
   `secrets/`, the tokens/client JSON, or the grants/pins — so a machine
   installed **before** those writers were `0600` (a legacy `0644` token, a
   `0755` `secrets/`, a legacy grant store) is **never detected by doctor, never
   repaired by sync, never bannered in the digest**. The **upgrade-repair** half
   of the acceptance is unmet for the entire `secrets/` + grants/pins set.
2. **The per-run log writers are NOT umask-independent `0600` (Codex round-1
   finding).** Unlike the credential writers, the two log-stream creators use a
   **bare** `fs.createWriteStream` with no `mode`, so under a permissive umask
   they land world-readable (`0666 & ~umask`): `src/cli/run-job.js:552`
   (`fs.createWriteStream(logFile)`) and `src/cli/dream.js:340`
   (`fs.createWriteStream(<date>.log, { flags: 'a' })`). Logs **are** a declared
   private artifact (they are in the A5 dir/`*.log` walk), so the A9 acceptance
   "fresh install under permissive umask ends with the declared private modes"
   is **violated for logs at write time** — the earlier "no writer changes"
   framing was wrong for logs. This WP fixes both log writers to write `0600`
   directly (so a fresh install is private the instant the log is opened, not
   only after the next `sync` repairs it) via a shared private log-stream helper.

This WP therefore (a) extends the shared predicate to cover the A9 set — the same
three surfaces that already handle the A5 set now repair, warn, and banner the A9
set for free — **and** (b) makes the log writers private at write time.

**Iron-rule/no-scope-creep note.** The core directory is *already* `0700` (it is
in the A5 dir set), so every file under it is protected from **other users** by
directory traversal today; this WP adds the explicit per-file `0600` guarantee
and its **repair** for the credential-bearing files, which is defense-in-depth
and the literal A9 requirement, not the whole-disk privacy claim.

## Current state

**`src/core/private-fs.js`** (the A5 module). Key shapes to extend:

```js
const A5_PRIVATE_DIRS = (paths) => [
  paths.core, paths.state, paths.logs,
  path.join(paths.state, 'dream-scratch'),
  path.join(paths.state, 'quarantine'),
];
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md', 'alerts.jsonl', 'transcript-ledger.json', 'identity-approvals.json',
];

// internal, NOT exported — the single enumerator behind all three surfaces:
function listA5Entries(paths) { /* returns {dirs, files}; walks logs/<job>/*.log,
  dream-scratch/*.json, quarantine/*; NEVER walks secrets/ */ }

function repairPrivateModes(paths) { /* dirs→0700, files→0600 for the enumerated
  set; returns {changed} */ }
function insecureEntries(paths) { /* READ-ONLY list of enumerated entries with
  (mode & 0o077) !== 0; win32→[]; the shared predicate */ }
function scanPrivateModes(paths) { /* {insecure: insecureEntries().length} */ }

module.exports = { mkdirPrivate, writeFilePrivate, repairPrivateModes,
  scanPrivateModes, insecureEntries, A5_PRIVATE_DIRS, A5_PRIVATE_FILE_BASENAMES };
```
`chmodIfNeeded(p, mode)` (best-effort, win32 no-op, returns true iff changed),
`listFiles(dir, keep)`, and the `WIN32` const already exist in the module.

**Where the A9-scoped artifacts live** (verified):
- `paths.secrets` = `<core>/secrets/` — created `0700` by `src/cli/init.js`
  (mkdir+chmod) and by `src/gws/client.js` `ensureSecretsDir` (`mkdir …mode
  0o700`). Files inside (all written `0600` at write time):
  - `google-token-read.json`, `google-token-draft.json`, `google-token-send.json`,
    `google-token-calendar.json`, `google-token.json` (**tokens**),
  - `google-client.json` (**client JSON**).
- `paths.state` = `<core>/state/`. Sensitive files there **not** in the A5 set:
  - `broker-grants.json` (**grants**; written `0600` via `writeFilePrivate` —
    `src/gws/broker/grant-store.js`),
  - `exec-pins.json` (**executable pins**; written `0600` via `writeFilePrivate`
    — `src/core/exec-identity.js`, **introduced by WP-154**),
  - `run-evidence.jsonl` (written `0600` via `writeFilePrivate`).
- The four **metadata** files — `paths.config` (`<core>/config.yaml`),
  `paths.manifest` (`<core>/install-manifest.json`), `state/schedule.json`, and
  `state/watermarks.json` — are **not** credential-bearing (vault path / model /
  file list / processing markers), but per the Codex round-1 owner decision they
  are now **in** the predicate/repair/scan set (doctor detects, sync repairs to
  `0600`) while their **writers stay unchanged**; see the dated decision in
  Implementation notes. `config.yaml` and `install-manifest.json` live at the
  **core root**; `schedule.json`/`watermarks.json` live under `state/`.

**The per-run log writers (the round-1 finding).** Both create their stream with
a bare `fs.createWriteStream` (no `mode`), so a permissive umask leaks the log
world-readable:
- `src/cli/run-job.js:552` — `const logStream = fs.createWriteStream(logFile);`
  (`logFile` = `logs/<name>/<runStamp>.log`).
- `src/cli/dream.js:340` — `const logStream = fs.createWriteStream(path.join(
  logDir, \`${date}.log\`), { flags: 'a' });` (append — a **pre-existing** log
  file keeps its old mode unless explicitly re-chmodded).

**`src/core/private-fs.js` internals available to reuse:** `chmodIfNeeded(p,
mode)` (best-effort, win32 no-op, returns true iff changed) and the module-level
`WIN32` const already exist (they are **not** currently exported).

**`src/cli/sync.js`** already calls `scanPrivateModes(paths)` and
`repairPrivateModes(paths)` on a real (non-dry-run) sync, and reports
`insecureModes: scanPrivateModes(paths).insecure` — extending the predicate flows
through this **unchanged**.

**`src/cli/dream.js`** already reports `insecureModes: scanPrivateModes(paths)
.insecure` in the digest render — the banner extends **unchanged**.

**`src/cli/doctor.js`** has TWO relevant blocks:
1. A **dedicated `secrets/` directory check** (POSIX): warns if
   `fs.statSync(paths.secrets).mode & 0o777 !== 0o700`, and a hard `fail` if the
   dir is missing. It does **not** check the token/client **files** inside.
2. The **shared A5 predicate loop**: `for (const p of insecureEntries(paths))
   check('warn', \`${p} is readable by other users — run 'wienerdog sync' …\`)`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/private-fs.js | (a) Extend the single internal enumerator to the union of the A5 set **and** the A9 set: `secrets/` dir (`0700`), every regular file directly under `secrets/` (`0600`), the sensitive `state/` files `broker-grants.json`/`exec-pins.json`/`run-evidence.jsonl` (`0600`), **and** the four metadata files `config.yaml`/`install-manifest.json` (core root) + `state/schedule.json`/`state/watermarks.json` (`0600`, repair-only per the dated decision below). Add the A9 constants and export them alongside the A5 ones. `repairPrivateModes`/`insecureEntries`/`scanPrivateModes` keep their names/signatures and now cover the union. (b) Add and export `createLogStreamPrivate(file, opts)` — the shared `0600` log-stream helper the two log writers call. |
| modify | src/cli/run-job.js | **ONLY** line 552's log-stream creation: replace the bare `fs.createWriteStream(logFile)` with `createLogStreamPrivate(logFile)` so the per-run log is `0600` under any umask. Touch nothing else in this file. |
| modify | src/cli/dream.js | **ONLY** line 340's log-stream creation: replace the bare `fs.createWriteStream(<date>.log, { flags: 'a' })` with `createLogStreamPrivate(<date>.log, { flags: 'a' })`. Touch nothing else in this file. |
| modify | src/cli/doctor.js | Fold the dedicated `secrets/`-dir `0700` check into the shared predicate: the `insecureEntries` loop now covers the `secrets/` dir **and** its files, so remove the redundant mode-comparison warn (keep the **"secrets directory missing"** hard `fail`). Single predicate, three surfaces — the module's stated invariant. |
| modify | tests/unit/private-fs.test.js | Add the A9 cases below (secrets dir+files, grants/pins repair, the four metadata files repaired, permissive-umask, upgrade from 0755/0644, win32 no-op) **and** `createLogStreamPrivate` cases: fresh file under `umask 000` → `0600`; a pre-existing `0666` append target → chmod'd to `0600`; win32 chmod no-op. |
| modify | tests/unit/scheduler-runjob.test.js | Assert the per-run log written by run-job's real writer path ends `0600` under a permissive umask (fresh-install acceptance runs the **actual** writer, not just the predicate). |
| modify | tests/integration/dream.test.js | Assert the dream's `<date>.log` written by dream's real writer path ends `0600` under a permissive umask, including the append-into-a-legacy-`0666`-file case. |
| modify | tests/unit/doctor.test.js | Assert a group/other-readable `secrets/` dir, token file, or metadata file is WARNed via the unified predicate; assert the missing-secrets `fail` still fires. |

### Exact contracts

**`src/core/private-fs.js` — the extension.** Keep the A5 exports and the
single-predicate architecture; add the A9 set and union it into the one internal
enumerator (rename it if you like — it is not exported — but keep it the sole
source for all three surfaces so they can never disagree):

```js
/** A9-scoped private DIRECTORIES (0700): the credential store. `secrets/` is
 *  where GWS OAuth tokens + client JSON live (A9). Repaired, never created here.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_DIRS = (paths) => [paths.secrets];

/** A9-scoped private FILES directly under state/ (0600): grants, exec pins, run
 *  evidence, plus the two metadata files schedule.json/watermarks.json
 *  (repair-only, see the dated decision — their writers are NOT changed).
 *  (Tokens/client JSON are matched by walking secrets/ for every regular file —
 *  no fixed basename list, so a new google-token-*.json is covered
 *  automatically.) */
const A9_PRIVATE_STATE_FILES = [
  'broker-grants.json',
  'exec-pins.json',
  'run-evidence.jsonl',
  'schedule.json',
  'watermarks.json',
];

/** A9-scoped private FILES at the CORE ROOT (0600): the two non-credential
 *  metadata files (repair-only — writers unchanged). Their absolute paths are
 *  `paths.config` and `paths.manifest`; enumerate by those, not by joining a
 *  basename onto state/. */
const A9_PRIVATE_CORE_FILES = (paths) => [paths.config, paths.manifest];
```

The enumerator, extended, returns `{dirs, files}` = **union of**:
- dirs: the A5 dirs **plus** every existing `A9_PRIVATE_DIRS` entry (`secrets/`);
- files: the A5 files **plus** every existing `A9_PRIVATE_STATE_FILES` file under
  `state/` **plus** every existing `A9_PRIVATE_CORE_FILES` entry (`config.yaml`,
  `install-manifest.json` at the core root) **plus every regular file directly
  under `secrets/`** (one level, matched by `listFiles(paths.secrets, () =>
  true)` — this is how the tokens + client JSON are covered without hard-coding
  their names).

Export the A9 constants (`A9_PRIVATE_DIRS`, `A9_PRIVATE_STATE_FILES`,
`A9_PRIVATE_CORE_FILES`) alongside the A5 ones. (Naming is the implementer's
call; keep the single-enumerator invariant.)

**The shared private log-stream helper `createLogStreamPrivate` (the round-1 log
fix).** The two log writers must open their stream `0600` regardless of umask,
including when appending into a **pre-existing** file (whose mode a fresh
`createWriteStream(mode)` would not change). One helper owns both concerns so the
writers change by one call each:

```js
/** Open a per-run log stream that is ALWAYS owner-only (0600), independent of
 *  umask and independent of a pre-existing file's mode. Creates with mode 0600,
 *  then best-effort re-chmods (covers the append-into-a-legacy-0666-file case).
 *  win32: no mode/chmod semantics — plain stream (POSIX-only guarantee, matching
 *  the rest of this module). Never throws on the chmod (best-effort).
 *  @param {string} file  absolute log path (its dir already exists — mkdir is
 *    the caller's job, unchanged)
 *  @param {{flags?: string}} [opts]  e.g. { flags: 'a' } for append (dream)
 *  @returns {import('fs').WriteStream} */
function createLogStreamPrivate(file, opts = {}) {
  const flags = opts.flags || 'w';
  const stream = fs.createWriteStream(file, { flags, mode: 0o600 });
  chmodIfNeeded(file, 0o600); // WIN32 no-op; fixes a pre-existing 0666 append target
  return stream;
}
```

`run-job.js:552` becomes `const logStream = createLogStreamPrivate(logFile);` and
`dream.js:340` becomes `const logStream = createLogStreamPrivate(path.join(logDir,
\`${date}.log\`), { flags: 'a' });`. Nothing else in those two files changes.

Every entry is best-effort and existence-guarded exactly like the A5 set (a
missing `secrets/` or a missing pin file is simply skipped — this WP **repairs**,
it never **creates**; `init.js`/`gws/client.js` own creation). `win32` stays a
no-op (POSIX-only guarantee, owner-approved). Deduplicate if a path could appear
in both sets (it cannot today, but the union must not double-report).

Resulting behavior (all three surfaces, for free):
- `repairPrivateModes(paths)` → chmods a legacy `0755` `secrets/`→`0700` and a
  legacy `0644` token/grant/pin/metadata file→`0600`, counting each change.
- `insecureEntries(paths)` / `scanPrivateModes(paths)` → now report a
  group/other-accessible `secrets/` dir or token/grant/pin/metadata file (the
  four metadata files included per the dated decision below).

**`src/cli/doctor.js` — fold the secrets check.** After the extension,
`insecureEntries` already covers `secrets/` and its files, so the dedicated
`mode === 0o700 ? ok : warn` comparison is redundant with (and would
double-report against) the shared loop. Remove that comparison; **keep** the
`dirExists(paths.secrets)` → `fail` "secrets directory missing" check and the
win32 skip. The shared `insecureEntries` loop remains the single warn source.

### Example (POSIX)

```
# legacy machine, permissive umask, pre-hardening modes:
secrets/                       0755   secrets/google-token-read.json   0644
state/broker-grants.json       0644   state/exec-pins.json             0644
config.yaml                    0644   state/watermarks.json            0644

wienerdog doctor      # WARNs each as "readable by other users" (secrets dir + files
                      #   + grants/pins + config.yaml + watermarks.json)
wienerdog sync        # repairPrivateModes → secrets/ 0700, every listed file 0600
wienerdog doctor      # clean; scanPrivateModes → {insecure: 0}

# separately, a FRESH log under a permissive umask is private at write time:
umask 000; wienerdog run-job dream   # logs/dream/<stamp>.log is 0600, not 0666
```

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step.
- **DATED OWNER DECISION (2026-07-19, Codex round-1 middle path) — the four
  metadata files are IN the predicate/repair/scan set, but their WRITERS are NOT
  changed.** `config.yaml`, `install-manifest.json`, `state/schedule.json`, and
  `state/watermarks.json` carry no credential (vault path / model / file list /
  processing markers), so an earlier draft left them entirely out of scope. The
  owner's ruling: **include them in the shared enumerator** so `doctor` detects a
  group/other-readable one and `sync` repairs it to `0600` — this closes WP-126's
  explicit "left to A9 on purpose" deferral and ADR-0024's "full mechanics-root
  policy" hand-off. But **do not touch their writers** (`jobs.js`/`watermarks.js`
  atomic-rename writers, `config`/`manifest` writers): for these non-credential
  metadata files, **fresh-write privacy relies on the `0700` parent dirs +
  sync-time repair — an explicitly accepted residual.** (Contrast the *credential*
  writers, which are already `0600` at write time, and the *log* writers, which
  this WP DOES fix — logs are attacker-influenceable content, metadata is not.)
  Do not expand scope to their writers; if a reviewer argues a metadata writer
  should also be `0600` at write time, that is a separate WP — note it under
  "Discovered issues".
- **This WP does NOT modify `src/cli/sync.js`.** Verified: sync already calls
  `repairPrivateModes`/`scanPrivateModes` by their unchanged names, so the
  extension flows through with no sync edit. The `depends_on: [WP-154]` is
  because the A9 set includes `exec-pins.json`, which **WP-154 introduces** —
  enumerating a not-yet-existing artifact before WP-154 lands would be premature
  — and because WP-154 concurrently edits the private-modes/sync surface (do not
  race it). (The 2026-07-19 migration logbook anticipated a shared `sync.js`
  edit; gap analysis shows the shared predicate makes it unnecessary — verify the
  live `sync.js` before assuming otherwise.)
- **Repair, never create.** `repairPrivateModes` must not `mkdir` `secrets/` or
  `touch` a token — a machine with no Google setup has no `secrets/` and that is
  correct (existence-guarded skip). Creation stays with `init.js` /
  `gws/client.js`.
- **Keep the single-predicate invariant.** All three surfaces (doctor warn, sync
  repair/scan, digest banner) must read the **same** enumerator — do not add a
  parallel secrets scan anywhere. The whole point of the A5 design is that the
  three surfaces cannot disagree; the A9 extension must preserve that.
- **Shared-surface coordination with the A10 WPs.** `WP-a10-reap-mechanism` also
  edits `src/cli/run-job.js` and `src/cli/dream.js` (the watchdog/reap wiring).
  This WP's edit to those two files is a **one-line stream-open swap** at the log
  sites (`:552` / `:340`) and touches nothing near the watchdog — so the two WPs
  edit disjoint regions, but they must not land on the same branch. Rebase on
  whichever merges first and re-verify the exact line before editing (do not
  assume line 552/340 is unchanged — locate the `fs.createWriteStream` log call).
- `never mock process.platform` — inject `platform` where a test needs a specific
  OS (the module already gates on the module-level `WIN32`; for tests that must
  assert win32 behavior, follow the module's existing pattern).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] After the extension, a group- or other-accessible `secrets/` directory, a
      `google-token-*.json`, `google-client.json`, `broker-grants.json`,
      `exec-pins.json`, `config.yaml`, `install-manifest.json`, `schedule.json`,
      or `watermarks.json` is (a) reported by `insecureEntries`/
      `scanPrivateModes`, (b) WARNed by `doctor`, (c) counted by the digest
      banner, and (d) repaired to `0700`/`0600` by `repairPrivateModes` — all
      from the one shared enumerator.
- [ ] A **freshly-created** per-run log (both `run-job` and `dream` writer paths)
      is `0600` under `umask 000` — not `0666` — and a `dream` append into a
      pre-existing `0666` log ends `0600` (the `createLogStreamPrivate` chmod).
- [ ] `repairPrivateModes` never creates `secrets/` or any file; a machine with
      no Google setup produces zero changes and zero warnings for the A9 set.
- [ ] The private-modes guarantee stays `0700`/`0600` under a permissive umask
      (fresh write) and is repaired from legacy `0755`/`0644` (upgrade).
- [ ] `win32` remains a no-op for the A9 set and for `createLogStreamPrivate`'s
      chmod (POSIX-only, owner-approved posture).

## Acceptance criteria (mapped to the A9 acceptance bullet)

- [ ] **[A9 — "Fresh install under permissive umask … ends with the declared
      private modes."]** Under a permissive umask, a freshly-written token
      (`gws/client.js`) and grant/pin (`writeFilePrivate`) are `0600` and
      `secrets/` is `0700`; **and a freshly-written per-run log is `0600`** —
      asserted by tests that set a permissive umask and (i) inspect the credential
      writers' resulting modes and (ii) run the **actual** `run-job` and `dream`
      log-writer paths (not just the predicate) and inspect the log file's mode.
- [ ] **[A9 — "… an upgrade from 0755/0644 state ends with the declared private
      modes."]** Given a pre-seeded `secrets/` at `0755` with a `0644` token, a
      `0644` `broker-grants.json`, a `0644` `exec-pins.json`, and a `0644`
      `config.yaml`/`watermarks.json`, `repairPrivateModes` changes each to
      `0700`/`0600` and returns the correct `{changed}` count; a second call
      returns `{changed: 0}` (idempotent).
- [ ] `insecureEntries`/`scanPrivateModes` report exactly those insecure A9
      entries (secrets + grants/pins + the four metadata files) before repair and
      none after; `doctor` WARNs them via the unified loop (no duplicate secrets
      warn), and still `fail`s when `secrets/` is missing.
- [ ] The A5 set's behavior is unchanged (existing `private-fs`/`doctor` tests
      still pass).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "private-fs|doctor|scheduler-runjob|dream"
npm test
npm run lint
# the predicate now names the A9 artifacts + metadata files + the log helper:
grep -nE "secrets|broker-grants|exec-pins|schedule\.json|watermarks|A9_PRIVATE|createLogStreamPrivate" src/core/private-fs.js
# the two log writers call the private helper (no bare createWriteStream remains):
grep -n "createLogStreamPrivate" src/cli/run-job.js src/cli/dream.js
```

## Out of scope (do NOT do these)

- The **incident-drill runbook** — **WP-a9-incident-runbook** (docs).
- The **alert-body raw-tail exclusion** (A9 logging item) — belongs to WP-151,
  not here (per the A9 gap analysis).
- **Log bounding/rotation** — already shipped (`rotateLogs`, WP-038) and the
  self-email tail exclusion (WP-124/EP3); do not re-implement (this WP only
  changes the log-stream **mode**, not its content or rotation).
- Changing the **metadata writers** (`config`/`manifest` writers, `jobs.js`
  `schedule.json`, `watermarks.js`) to write `0600` at write time — the dated
  decision keeps them repair-only (predicate + sync repair), writers unchanged.
- Changing any **credential writer** (`gws/client.js`, `grant-store.js`,
  `exec-identity.js`) — they already write `0600`; this WP only extends the
  **predicate/repair** set for them. (The two **log** writers ARE changed — that
  is this WP's round-1 fix — but only their stream-open call, nothing else.)
- Creating `secrets/` or seeding tokens — creation stays with `init`/`gws`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(security): extend private-modes repair to secrets/grants/tokens/pins (WP-a9-private-modes-repair)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
