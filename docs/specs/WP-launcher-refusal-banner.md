---
id: WP-launcher-refusal-banner
title: Give a launcher-stage refusal its own delivery channel — a code-owned banner file the launcher writes without app-tree code
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0024, ADR-0028, ADR-0039]
epic: digest-delivery
---

# WP-launcher-refusal-banner: a refusal banner the launcher can actually write

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, plus routines) with the OS-native
scheduler. The OS entry never invokes the app directly. It invokes the **independent
launcher** at `<core>/launcher/launch.js` — a file that lives **outside** the mutable
app tree — which verifies integrity (app release digest, descriptor digest,
containment, stance) and only then spawns `node <app>/bin/wienerdog.js run-job <name>`.
Any verification failure is a durable alert plus **zero** spawn (ADR-0028).

**IRON RULE (ADR-0004): Wienerdog is just files.** The launcher runs and exits with
each fire. This WP adds no daemon, watcher or poller — it adds one file write.

**The defect.** When the launcher refuses, it writes a durable record to
`state/alerts.jsonl` and a line to stderr, and the refusal text promises the user,
verbatim: *"This alert will appear in your next digest."* **That promise cannot be
kept.** The digest is rendered by `renderDigest` in `src/core/digest.js`, which lives
in the app tree, and the launcher **must not require code from the tree it is
verifying** — that is precisely why `appendRefuseAlert` is a hand-written duplicate of
the app-side alert writer instead of an import. Only `wienerdog sync` and
`wienerdog dream` ever write `state/digest.md`, and a refusing launcher never reaches
either.

Measured consequence on the maintainer's machine: `app/current` pointed at a purged
worktree from 2026-08-02; every hourly `--catch-up` refused; `state/digest.md` was
never rewritten for **four weeks**; the banner rendered **zero** times. The email leg
of fail-loud was dead too — it spawns the CLI shim, which is unusable when
`app/current` is exactly what failed. See
`docs/specs/logbook/2026-08-30-the-banner-channel-inverted-and-nobody-noticed.md`.

**The fix (ADR-0039 §5, as corrected by its Amendment 1).** The launcher writes a
**refusal banner**: code-owned, fixed text under `<core>/state/`, using the same
self-contained, no-app-tree-require discipline `appendRefuseAlert` already uses.
Per-job entries live in `<core>/state/refusal-banner/`, and the launcher rebuilds a
single concatenated `<core>/state/refusal-banner.md` from them — that concatenated file
is what every reader points at, because an `@import` cannot glob a directory. Later WPs
(`WP-refusal-banner-delivery`, `WP-managed-block-by-reference`) make the SessionStart
hook, `renderDigest` and the Claude Code managed block read it. **This WP writes,
clears and rebuilds; it does not yet display.** That is deliberate: the file format and
its lifecycle are one contract, and the readers are another.

**The clearing rule, and the round-1 premise that was false.** Round 1 of this spec
made clearing **unconditional** — any successful job, plus any attended `sync`, wiped
the banner — and justified it like this: *"the banner exists only to cover the case
where the app tree is broken. When the app tree is broken, no job succeeds and no sync
completes, so nothing clears it."*

**That premise does not hold, and the Codex round-2 review (finding F5) caught it.**
The launcher does not only refuse on whole-tree faults. Look at what it verifies:

```js
const verdict = isCatchup
  ? verifyCatchup(p, flags['expect-digest'], env, platform, flags['job-digests'])
  : verifyAndResolve(p, name, {
      descriptorPath: flags.descriptor,
      expectDigest: flags['expect-digest'],
      env, platform,
    });

if (!verdict.ok) return refuse(name, verdict.reason, remedyOf(verdict));
```

`verifyAndResolve(p, name, …)` is **per job**. A descriptor drift on the `dream` job —
a changed `config.yaml`, schedule, model or timeout — refuses `dream` while
`daily-digest` verifies and runs perfectly. Under the round-1 rule, `daily-digest`
succeeding would silently erase `dream`'s warning, and the user would never learn that
their nightly memory consolidation had stopped. That is the same class of defect this
whole chain exists to fix, reintroduced by the fix.

**The corrected design (owner-accepted, F5).** Banner state is **per job**:

- One entry per job under a launcher-owned directory, plus a single **concatenated
  file rebuilt from those entries** — so the readers, including the Claude Code
  managed-block import, have exactly **one** path to point at (an `@import` cannot
  glob a directory).
- The **launcher** clears a job's **own** entry when **that job's** verification
  passes, immediately before spawn. This is launcher-owned state needing no app-tree
  code, and it is what makes the mechanism correct: a job's banner is cleared by the
  only thing that actually knows that job is healthy again.
- An attended `sync` clears the whole directory, **after** the manifest save.
- `run-job` clears **nothing**. Its unconditional clear was precisely the defect.

**This also dissolves the 2026-08-01 arithmetic trap rather than working around it.**
That entry recorded a candidate fix that *"survived the threat model and failed the
arithmetic"*: `clearAlerts` fires only for real job names, and `--catch-up` is a
pseudo-job that never reports success, so nothing would ever clear a catch-up alert.
Round 1 answered that by clearing unconditionally — which traded one bug for another.
Per-job launcher-side clearing answers it properly: `--catch-up` clears its own entry
the next time catch-up **verifies**, which does not require it to *succeed* at
anything. The trap came from keying on job success; the fix is to key on job
verification, which the launcher performs for every job on every fire.

## Current state

`src/scheduler/launcher.js` — the refusal path. `refuse()` is a closure inside
`main()`:

```js
const refuse = (jobName, why, remedy) => {
  const reason = refusalText(jobName, why, remedy);
  appendRefuseAlert(p, jobName, reason);
  process.stderr.write(`${reason}\n`);
  exit(1);
  return 1;
};
```

`refusalText(jobName, why, remedy)` composes the full sentence, including the
`REMEDY_TAIL` for the class (`sync` or the fail-closed default `reinstall`):

```js
function refusalText(jobName, why, remedy) {
  const tail = REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall'];
  return (
    `wienerdog: refusing to run "${jobName}" — ${why} (integrity mismatch); no job was run. ` +
    `This alert will appear in your next digest. ${tail}`
  );
}
```

`appendRefuseAlert(p, job, reason)` is the self-contained durable writer, ~35 lines,
whose header comment states the constraint this WP must also honour: *"Minimal
durable alert append (code-owned reason — no secrets, so no redaction/compaction
machinery from `src/core/alerts.js` is needed; this must work even when the app tree
is the thing being refused)."* It `mkdirSync(p.state, {recursive:true, mode:0o700})`,
appends one JSON line, then best-effort `fs.chmodSync(file, 0o600)` on non-win32, and
swallows every error (`/* the alert is best-effort — the refusal (non-zero exit, zero
spawn) stands regardless */`).

`p` is `corePathsFrom(core)`; `p.state` is the absolute `<core>/state` directory.
The launcher's only `require`s are Node built-ins plus files under `<core>/launcher/`.
**It requires nothing from `src/`.**

`src/core/private-fs.js` — the A5 private-file set (0600, repaired by
`repairPrivateModes`, reported by `scanPrivateModes`):

```js
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md',
  'alerts.jsonl',
  'alerts-ack.json',
  'transcript-ledger.json',
  'identity-approvals.json',
];
```

`src/cli/run-job.js` — clears alerts on success via `clearAlerts(paths, name)` from
`src/core/alerts.js`. `src/cli/sync.js` — the attended reconciler; its `run()` ends
with the manifest save and the `changed/unchanged` summary console lines.

**You are reworking an existing branch, not starting fresh.** Round 1 of this spec was
implemented on `origin/wp/launcher-refusal-banner` (PR #174, HEAD `e17d638`), which is
**open and held**. Start from that branch. What it contains, and what survives:

| Existing on #174 | Verdict |
|------------------|---------|
| `writeRefusalBanner(p, text)` in `launcher.js` — folding, `mkdirSync(state, 0700)`, temp+rename, best-effort 0600 chmod, everything swallowed, exported for tests | **Keep the body.** Retarget it to write a per-job entry and then rebuild the concatenated file. Its fold/cap/atomicity/failure semantics are all still correct (Table B, B4–B8) |
| `BANNER_MAX_CHARS = 2000` with the "deliberate duplicate of `MAX_FIELD_CHARS`" comment | **Keep verbatim** (B4) |
| The `writeRefusalBanner(p, reason)` call in `refuse()`, before `appendRefuseAlert` | **Keep** (B2) |
| `src/core/refusal-banner.js` — `REFUSAL_BANNER_FILE`, `refusalBannerPath`, `readRefusalBanner`, `clearRefusalBanner`, and its "direction of the dependency" header | **Keep the module and the header.** `readRefusalBanner` now reads the concatenated file (unchanged behaviour); `clearRefusalBanner` becomes a whole-directory clear used only by `sync` (B10) |
| `'refusal-banner.md'` added to `A5_PRIVATE_FILE_BASENAMES` | **Keep**, and add the per-job directory to the A5 **dirs** set (B13) |
| `tests/unit/private-fs.test.js` membership assertion | **Keep** — the boundary check requires this file whenever an A5 basename is added |
| The `clearRefusalBanner(paths)` call in `src/cli/run-job.js`, with its "UNCONDITIONAL … Table B row B11" comment | **DELETE, including the `require`.** This is the F5 defect. `run-job` clears nothing |
| The `clearRefusalBanner(paths)` call at step `0b` of `src/cli/sync.js`, before `renderDigest` | **MOVE** to after `manifestMod.save(paths, manifest)` (Codex P1: never mutate state ahead of its manifest). Its digest must still render banner-free — see B10/B12 |
| `tests/unit/launcher.test.js` and `tests/unit/refusal-banner.test.js` | **Keep and extend.** The per-job cases in the acceptance criteria are new |

`refuse()`'s existing call site is unchanged by this rework; what changes is where
`writeRefusalBanner` puts its bytes, plus the post-spawn clear (B15) and the
spawn-failure write (B16).

**The spawn site (`src/scheduler/launcher.js`), which B15/B16 replace:**

```js
const r = spawn(verdict.command, verdict.args, { stdio: 'inherit', env: childEnv });
const code = r && typeof r.status === 'number' ? r.status : 1;
exit(code);
```

**`launcher.js` is require-safe** — its exports come first and execution is guarded:

```js
module.exports = { verifyAndResolve, verifyCatchup, appTreeDigestOf, verifyContainment, liveStance, parseArgv, refusalText, remedyOf, main };

// When the vendored copy at <core>/launcher/launch.js is executed by the OS
// scheduler, run main with the real argv.
if (require.main === module) {
  main(process.argv.slice(2));
}
```

so the app side may `require` it (Table L, L11). The dependency runs **app → launcher**
only; the launcher still requires nothing from `src/` (B9).

**The reconciliation signals `sync` already has, and the one it is missing (B17a).**
`src/cli/sync.js` calls `repointSchedules`, warns, and **continues**:

```js
const r = repointSchedules(paths, manifest, { loader: opts.loader });
if (r.changed > 0) console.log(`wienerdog: repointed ${r.changed} schedule(s) to the vendored app.`);
if (r.descriptorFailures > 0) { console.log(`wienerdog: WARNING — ${r.descriptorFailures} job descriptor(s) could not be written; …`); }
for (const n of r.notices) console.log(`  note: ${n}`);
…
const heal = status.reloadMissing(paths, { loader: opts.loader });
if (heal.failed.length > 0) { console.log(`wienerdog: WARNING — could not reload ${heal.failed.length} scheduled job(s): …`); }
```

`repointSchedules` returns `{ repointed, changed, descriptorFailures, notices }` — and
its catch-up repair is folded into `notices` **as a string only**:

```js
const cu = repairCatchup(paths, manifest, { loader, platform, probe: opts.probe });
…
return { repointed, changed, descriptorFailures, notices };
```

`repairCatchup` itself is `@returns {{notice?:string}}` and reports every failure that
way, e.g. `{ notice: "catch-up entry rewritten but the OS scheduler did not accept it —
run 'wienerdog doctor'." }`. It also has early `return {}` paths and can throw. **So a
failed catch-up repair is a console line no code tests**, which is exactly why B17a adds
the structured `catchup: {ok, reason?}`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/launcher.js | `entryFileName` (B14); `writeRefusalBanner`; `clearRefusalBannerFor`; `rebuildRefusalBanner`; the spawn-failure banner path (B16); the launcher lock (Table L) |
| create | src/core/refusal-banner.js | app-side read + whole-directory clear. The launcher NEVER requires this |
| modify | src/core/private-fs.js | `'refusal-banner.md'` in `A5_PRIVATE_FILE_BASENAMES`; `refusal-banner/` **and** `launcher.lock/` in the A5 dirs set (B13) |
| modify | tests/unit/private-fs.test.js | **required** — it pins A5 membership by value; the boundary check rejects the PR without it |
| modify | src/cli/sync.js | clear the whole directory **after** `manifestMod.save`, **only on a clean reconciliation** (B17, incl. catch-up); render the digest banner-free only in that same case |
| modify | src/cli/schedule.js | `repairCatchup` returns `{ok, reason?}`; `repointSchedules` propagates it as `catchup` (B17a) |
| modify | tests/unit/catchup-authorization.test.js | the new structured `catchup` result, including the caught-throw shape |
| create | tests/unit/refusal-banner.test.js | app-side reader/clearer |
| modify | tests/unit/launcher.test.js | per-job write, clear-after-spawn, rebuild, cross-job isolation, filename collisions, spawn-failure paths, lock contention + stale takeover |
| modify | tests/unit/sync-repoint.test.js | B17: a failed descriptor write leaves entries in place and the digest carries the banner |

**Removed from round 1:** `src/cli/run-job.js` is **no longer a deliverable**. If your
branch carries the round-1 `clearRefusalBanner` call there, delete it and its `require`
as part of this rework.

### Exact contracts

```js
// src/core/refusal-banner.js — app-side ONLY. The launcher writes its own copy.
/** Basename of the CONCATENATED banner inside <core>/state (Table B, B1a). */
const REFUSAL_BANNER_FILE = 'refusal-banner.md';
/** Directory of per-job entries inside <core>/state (Table B, B1). */
const REFUSAL_BANNER_DIR = 'refusal-banner';

/** Absolute path to the concatenated banner.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function refusalBannerPath(paths)

/** The concatenated banner text, or '' when absent/unreadable/empty. NEVER throws —
 *  a missing banner is the normal case. Trailing newlines trimmed.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function readRefusalBanner(paths)

/** Remove EVERY per-job entry and the concatenated file (Table B, B10b). Used only by
 *  attended `sync`, and only AFTER the manifest save. Idempotent; never throws.
 *  @param {import('./paths').WienerdogPaths} paths @returns {void} */
function clearRefusalBanner(paths)

/** Compose the banner from the ENTRY DIRECTORY (Table B, B18a) — every entry joined by a
 *  blank line in sorted filename order — or '' when the directory is absent or empty.
 *  This is what `renderDigest`'s app-side callers read; the hook and the Claude import
 *  read the concatenated file instead. Never throws.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function readRefusalBannerFromDir(paths)

/** Self-heal the derived artifact (Table L, L8a): if the concatenated file disagrees with
 *  the directory, rewrite it to match WHILE HOLDING the launcher lock (required via
 *  `src/scheduler/launcher.js` — app -> launcher, the safe direction). No drift, or no
 *  lock available, means no write. Never throws.
 *  @param {import('./paths').WienerdogPaths} paths @returns {{rewrote: boolean}} */
function rebuildConcatenatedIfDrifted(paths)
```

```js
// src/scheduler/launcher.js — self-contained; Node built-ins only (Table B, B9).

/** The per-job entry filename (Table B, B14). INJECTIVE in practice: the hash is
 *  taken over the RAW job name, so '--catch-up' and a job named 'catch-up' land in
 *  different files, and two names sharing a 48-char prefix do not collide.
 *    '--catch-up'  -> '_catch-up-9f2a1c3d.md'
 *    'catch-up'    -> 'catch-up-4b7e0a15.md'
 *  @param {string} job the RAW job name, exactly as it arrived in argv
 *  @returns {string} */
function entryFileName(job)

/** Acquire the launcher lock (Table L). On success writes <lock>/owner with a fresh
 *  16-hex token and returns a release function closed over it; callers never handle
 *  the token themselves. Returns null when the 35 s bounded wait expired — callers
 *  MUST then take the L6 fallback, never skip their write.
 *  EXPORTED: `src/core/alerts.js` requires this (app -> launcher, the safe direction;
 *  launcher.js is require-safe via its `if (require.main === module)` guard). The
 *  launcher never requires app code (B9).
 *  @param {{state:string}} p @returns {(() => void)|null} */
function acquireLauncherLock(p)

/** Release IFF we still own it (Table L, L3): read <lock>/owner, compare `token`, and
 *  only on a match unlink `owner` then rmdir the directory. A mismatch, an unreadable
 *  owner, or ENOENT is a NO-OP — a holder broken mid-work must never delete its
 *  successor's lock. Exported alongside the acquirer for the app side.
 *  @param {{state:string}} p @param {string} token */
function releaseLauncherLock(p, token)

/** Write THIS job's banner entry, then rebuild the concatenated file. Overwrites only
 *  this job's entry (B7). Atomic (B5). Takes the lock around the mutation + rebuild
 *  (B1c); without the lock, still writes the entry and skips ONLY the rebuild (L6).
 *  Best-effort throughout (B8).
 *  @param {{state:string}} p @param {string} job @param {string} text */
function writeRefusalBanner(p, job, text)

/** Remove THIS job's entry (if any), then rebuild. Called only AFTER a spawn returns
 *  a numeric status (B10a/B15). Same lock discipline as the writer.
 *  @param {{state:string}} p @param {string} job */
function clearRefusalBannerFor(p, job)

/** Rebuild <core>/state/refusal-banner.md from the entries in
 *  <core>/state/refusal-banner/, joined by a blank line in SORTED FILENAME ORDER
 *  (B1a). With no entries, REMOVE the concatenated file rather than writing it empty
 *  (B1b). Caller holds the lock. Best-effort; 0600 (B6).
 *  @param {{state:string}} p */
function rebuildRefusalBanner(p)

/** The code-owned sentence for a spawn that never produced an exit status (B16).
 *  Deliberately NOT refusalText(): verification PASSED here, so "integrity mismatch"
 *  and the reinstall/sync remedies would all be false. Names no remedy — and, like
 *  every launcher message, never names `wienerdog doctor` (F27).
 *  @param {string} jobName @param {string} why 'spawn failed' | 'terminated by signal <sig>'
 *  @returns {string} */
function spawnFailureText(jobName, why)
```

**`spawnFailureText` output**, for a job killed by SIGKILL:

```text
wienerdog: "dream" passed its integrity checks but could not be started — terminated by signal SIGKILL. No job ran. This alert will appear in your next digest.
```

**The spawn site after this WP** (B15, B16). Today it is three lines that collapse every
non-numeric outcome into a silent `exit(1)`:

```js
const r = spawn(verdict.command, verdict.args, { stdio: 'inherit', env: childEnv });
const code = r && typeof r.status === 'number' ? r.status : 1;
exit(code);
```

It becomes: wrap the spawn in `try/catch`; on a throw, or on `r.status === null`, call
`writeRefusalBanner(p, name, spawnFailureText(name, why))` and `appendRefuseAlert(p,
name, …)` with the same sentence, write it to stderr, and `exit(1)`. Only on a numeric
`r.status` — **any** number, including non-zero — call `clearRefusalBannerFor(p, name)`
and `exit(r.status)`.

**Literal expected content.** A catch-up refusal whose verdict reason is
`cannot resolve app/current` writes `<core>/state/refusal-banner/_catch-up-9f2a1c3d.md`
containing exactly one line plus a trailing newline (the filename carries the B14
hash — `9f2a1c3d` below is illustrative, compute the real one):

```text
> [!warning] wienerdog: refusing to run "--catch-up" — cannot resolve app/current (integrity mismatch); no job was run. This alert will appear in your next digest. Do not run `wienerdog sync` — this check could not confirm the app files are the ones you installed, so syncing is not the safe next step. Reinstall Wienerdog from a trusted source, then investigate.
```

That is `> [!warning]`, one space, then the **folded** `refusalText()` output. Folding
(Table B, B4) is the only transformation applied. With that entry alone,
`<core>/state/refusal-banner.md` contains those same bytes. With a second entry
`dream-4b7e0a15.md`, the concatenated file is the `_catch-up-…` line, a blank line, then
the `dream-…` line — **sorted by filename**, and `_` sorts before `d` in the byte order
`Array.prototype.sort()` uses by default, so the pseudo-job namespace groups first.

## Contract reference

Activation trigger (ADR-0031): **(ii)** a new artifact class with its own lifecycle
states; **(v)** the launcher emits the artifact but the app tree owns its
interpretation and disposal — an authority boundary; **(vi)** two successor specs
(`WP-refusal-banner-delivery`, and `WP-digest-stable-volatile-split` via the prefix
order) inherit it; **(vii)** the same facts are mirrored in the launcher, the app-side
module, the private-file set and the tests. Four of seven — the discipline is on.

### Table B — the refusal banner contract

This table is the single place these facts are decided. Every other statement in this
spec, in the code, and in successor specs defers to it. **Rewritten in round 2** (Codex
F5: per-job state) and **revised again in round 3** (Codex R1, R2/R5, R3, R4). Rows are
internally consistent by construction: B10 names *when* each clearer runs, B10a/B10b
name *what* each one requires first, and B11 states the scope rule they both obey.

| Row | Fact | Value |
|-----|------|-------|
| B1 | Per-job entry | `<core>/state/refusal-banner/<entry-name>.md` — one file per job, the source of truth |
| B1a | Concatenated file | `<core>/state/refusal-banner.md` — a **derived** artifact: every entry, joined by a blank line, in **sorted filename order**. Rebuilt from the directory after every mutation. This is the single path every reader and the Claude Code import point at, because an `@import` cannot glob a directory |
| B1b | Empty directory | No entries → the concatenated file is **removed**, not written empty. A missing import target is skipped silently, which is the healthy state |
| B1c | Mutation lock | Every banner-directory mutation **and** its rebuild happen while holding the launcher lock (Table L). A writer that cannot acquire still writes its own entry **and still rebuilds, unlocked** (Table L, L6) — the rebuild is idempotent and lands by atomic rename, so an unlocked one can lose a race but never corrupt |
| B2 | Sole writer | `writeRefusalBanner` in `src/scheduler/launcher.js`, called from `refuse()` and from the spawn-failure path (B16) |
| B3 | Entry content | Exactly one line: `> [!warning]`, one space, then the folded reason, then one `\n`. Nothing else — no frontmatter, no second line |
| B4 | Folding | Replace every run of `\s+` with a single space, then trim. Then hard-cut to **2000** characters (matching `MAX_FIELD_CHARS` in `src/core/alerts.js`). Applied before the `> [!warning]` prefix (with its trailing space) is added |
| B5 | Write mode | Atomic: write `<path>.<pid>.tmp` then `renameSync` onto the target. `mkdirSync` the directory `recursive:true, mode:0o700` first. **On a rename failure, `fs.rmSync(tmp, {force:true})`** so a failed write leaves no orphan temp (Codex P2) |
| B6 | Permissions | `0600` on each entry and on the concatenated file, best-effort `fs.chmodSync` after rename, skipped on `win32` — identical to `appendRefuseAlert`'s handling |
| B7 | Multiplicity | One entry **per job**. A new refusal for the same job **overwrites** that job's entry; entries for other jobs are untouched |
| B8 | Failure policy | Every step wrapped so nothing throws. A failed write, clear or rebuild is silent and changes nothing about the refusal (non-zero exit, zero spawn) |
| B9 | Dependencies | The launcher's writer, clearer, rebuilder and lock use Node built-ins only (`node:fs`, `node:path`, `node:crypto`). They must NOT require `src/core/refusal-banner.js` or any other `src/` module |
| B10 | Clearers | **(a)** the launcher removes the job's entry **after** its spawn returns a numeric status (B15); **(b)** attended `sync` removes the whole directory, after `manifestMod.save`, **only on a fully clean reconciliation** (B17). `run-job` clears **nothing** |
| B11 | Clearing scope | **Per job.** A job's entry is cleared only by that job completing a spawn, or by a clean attended `sync` clearing everything. A *different* job succeeding clears nothing — the launcher refuses on per-job verdicts, so one job's health is no evidence about another's |
| B12 | Dry-run | `wienerdog sync --dry-run` never clears and never rebuilds |
| B13 | Privacy | `'refusal-banner.md'` joins `A5_PRIVATE_FILE_BASENAMES`; `<core>/state/refusal-banner/` and `<core>/state/launcher.lock/` join the A5 private **dirs** set. Adding any of them **requires** updating `tests/unit/private-fs.test.js`, which pins membership by value |
| B14 | Entry filename | `<readable>-<hash>.md`, where `<hash>` is the **first 8 lowercase hex characters of `sha256(raw job name)`** and `<readable>` is the sanitized form cut to **48** characters. Sanitize by replacing every character outside `[A-Za-z0-9._-]` with `_`. A **pseudo-job** — any raw name beginning with `--` — is namespaced with a leading `_` after its dashes are stripped, so `--catch-up` → `_catch-up-<hash>.md` and a real job named `catch-up` → `catch-up-<hash>.md`. An empty `<readable>` becomes `job`. The hash makes the mapping **injective in practice**, which the round-2 sanitizer was not: it collided `--catch-up` with a job named `catch-up`, and collided any two names sharing a 64-character prefix |
| B15 | Clear timing | The launcher clears a job's entry **only after `spawnSync` returns an object with a numeric `status`** — any number. A non-zero child exit is a job-level failure and is `run-job`'s fail-loud to report, so it still clears the *launcher's* banner. Clearing **before** the spawn (round 2) lost the banner whenever the spawn itself failed |
| B16 | Spawn-failure banner | If the spawn **throws**, or returns `status === null` (killed by a signal, or never started), the launcher **writes** a banner entry for that job with a code-owned reason — `spawn failed` or `terminated by signal <sig>` — appends a refuse-class alert, writes stderr, and exits 1. It does **not** clear |
| B17 | Sync's clean-reconciliation precondition | `sync` clears (B10b) **only** when `descriptorFailures === 0`, `heal.failed` is empty, **and** the catch-up repair reported `ok` (B17a). Otherwise it clears **nothing** and renders its digest **with** the banner. A sync that just warned "job descriptor(s) could not be written" has not fixed the machine, and must not silence the warning that says so |
| B17a | Catch-up must be in the signal | `repointSchedules` currently returns `{repointed, changed, descriptorFailures, notices}` and folds `repairCatchup`'s result into `notices` only — `repairCatchup` returns `{notice?:string}`, so a failed catch-up repair is a *string* nobody tests. It gains a structured `catchup: {ok: boolean, reason?: string}` (with a caught throw reported as `{ok:false, reason:'threw: …'}`), `repointSchedules` propagates it, and `sync` folds `!r.catchup.ok` into `reconciliationClean`. Round 3's B17 missed this: the catch-up entry is the *only* thing that delivers a missed nightly dream, so a sync that failed to repair it is exactly a sync that must not clear the banner (finding S4) |
| B18 | Readers — hook and import | The SessionStart hook and the Claude Code managed-block import read the **concatenated** file (B1a). Neither can enumerate a directory: the hook must stay a single-file read with no computation, and an `@import` cannot glob |
| B18a | Reader — `renderDigest` callers | `sync` and `dream` read the **directory** and compose the banner from its entries in sorted filename order, then **rebuild the concatenated file under the lock whenever it disagrees** with what they just read (Table L, L8a). They are app-side, already doing real work, and already hold a natural place to self-heal — so the derived artifact is repaired on every render rather than drifting until the next launcher mutation. Added in round 4 (finding S2c) |

### Table L — the launcher lock contract

A single lock serialises every mutation of the two launcher-owned state files. Round 3
adopted it after the owner reversed compare-and-retry; **round 4 rewrote the protocol**
after Codex finding S1 showed the round-3 version could produce **two simultaneous
owners** (a stale takeover raced with another taker) and could **release a lock it did
not own** (`rmdirSync` with no ownership check).

| Row | Fact | Value |
|-----|------|-------|
| L1 | Path | `<core>/state/launcher.lock/` — a **directory** |
| L2 | Acquire | `fs.mkdirSync(lockPath)`. Success = acquired; `EEXIST` = held or stale. Directory creation is atomic on every supported filesystem, which is what makes this a lock |
| L2a | Owner stamp | **Immediately** after a successful `mkdirSync`, write `<lock>/owner` = `{"pid": <pid>, "token": <16 lowercase hex from crypto.randomBytes(8)>, "at": <ISO>}`. The **token**, not the pid, is the identity: a pid can be reused, and after a stale break the same pid may legitimately hold a *different* lock instance |
| L2b | Return value | `acquireLauncherLock` returns a **release function** closed over the token it wrote, or `null` when the bounded wait expired. Callers never see or pass the token |
| L3 | Release | Read `<lock>/owner`, parse it, and compare its `token` to ours. **On match only**: unlink `owner`, then `rmdirSync` the directory. On any mismatch, unreadable owner, or `ENOENT` — **no-op**. A holder that was broken while it worked must never delete its successor's lock |
| L4 | Staleness authority | The **lock directory's own `mtime`**, never the owner file's. A directory whose `mtime` is older than **30 000 ms** is stale. A lock directory with **no readable `owner` file is NOT stale** on that basis alone — it is almost certainly a taker in the microseconds between L2 and L2a. Only the directory mtime decides |
| L4a | Stale break | `fs.renameSync(lockPath, <core>/state/launcher.lock.stale-<pid>-<8 hex>)`. Rename is atomic on one source: **exactly one** contender wins, and every loser gets `ENOENT` and simply falls back to retrying `mkdirSync`. The winner then `fs.rmSync(renamed, {recursive:true, force:true})` and retries `mkdirSync` once. This replaces round 3's `rmdirSync`-then-`mkdirSync`, which let two stealers both proceed |
| L4b | Threshold rationale | 30 s, raised from round 3's 10 s. The **maximum expected hold is milliseconds** — a `readdir` of a handful of small files plus one `renameSync`, or one append plus a bounded compaction. 30 s is therefore ~4 orders of magnitude of headroom, so a break implies a genuinely dead or pathologically stalled holder |
| L5 | Bounded wait | **140 attempts, 250 ms apart — 35 s worst case**, which **exceeds** the 30 s staleness threshold by design (finding S2a): a crashed holder is *always* broken before the wait expires, so the L6 fallback is reachable only against a live holder stalled past 30 s. The launcher is synchronous and fires hourly, so a 35 s worst case is acceptable. Sleep with `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)` — a real blocking sleep on Node's main thread, no busy spin, no timer, no async |
| L6 | Fallback when the wait expires | **Fail-loud is never sacrificed to the lock, and neither is the derived artifact.** The caller still (a) appends its `alerts.jsonl` record atomically, skipping **compaction**; and (b) writes its banner entry atomically **and rebuilds the concatenated file without the lock**. Round 3 skipped the rebuild here; finding S2b corrected it — a possibly-stale derived file is strictly better than a guaranteed-stale one, and the rebuild is idempotent and atomic, so an unlocked one can only lose a race, never corrupt |
| L7 | Accepted residuals | (i) A holder broken under L4a loses only **derived** work — its entry write and its alert append are already durable — so a legitimately slow holder that gets broken costs a rebuild, not a record. (ii) Two concurrent rebuilds each produce a complete valid file and the later `renameSync` wins, so the concatenated file may momentarily lag the directory by one entry; L8a's self-heal repairs it. (iii) After an L6 fallback, `alerts.jsonl` may exceed its bound until the next lock-holding append |
| L8 | Guarded regions | (i) `appendRefuseAlert`'s append **plus** compaction; (ii) every banner-directory mutation **plus** its rebuild; (iii) the app-side `alerts.jsonl` writers (Table C, C8d). Nothing else. Hold for the shortest possible span |
| L8a | Reader self-heal | `renderDigest`'s callers read the **directory** and rebuild the concatenated file under the lock whenever it disagrees with the directory (finding S2c). Every `dream` and every `sync` therefore repairs the derived artifact, so an L6-fallback rebuild that lost a race is corrected on the next render rather than persisting |
| L9 | Scope | **Every writer of the guarded files**, not just the launcher. Round 3 scoped it to the launcher only, which left the app-side `alerts.jsonl` writers racing the launcher (finding S3). See Table C rows C8d–C8g |
| L10 | Not a daemon | The lock directory is a file, created and removed within one synchronous call. Nothing outlives the process. **ADR-0004 is preserved** |
| L11 | Single implementation | Implemented **once**, in `src/scheduler/launcher.js`, and exported as `acquireLauncherLock` / `releaseLauncherLock`. The app side **requires** it (`src/core/alerts.js` → `src/scheduler/launcher.js`); the launcher **never** requires app code. That direction is safe because `launcher.js` is require-safe: it guards execution with `if (require.main === module)` after its `module.exports`. The vendored `<core>/launcher/launch.js` is a **byte copy** of this same file (`writeLauncher` in `src/core/vendor.js` copies "the self-contained `src/scheduler/launcher.js` bytes OUT of the app tree"), covered by the app release digest — so the two processes cannot run different protocols. **One implementation, no twin literals** (ADR-0031) |

### The lock state machine — the argument this protocol is correct

Written out because three consecutive rounds shipped fix-induced defects, and the two in
round 3 (S1) were both in this mechanism. Four scenarios; the invariant to preserve is
**at most one live owner of `launcher.lock/` at any instant, and no process ever removes
a lock it does not own.**

**A — two contenders, no holder.** P1 and P2 both call `mkdirSync`. `mkdir` is atomic, so
exactly one succeeds — say P1. P2 gets `EEXIST`, reads the directory `mtime`, finds it
fresh, sleeps 250 ms, retries. P1 stamps `owner` with token `T1`, does its
milliseconds of work, then releases: reads `owner`, sees `T1`, unlinks and `rmdir`s. P2's
next `mkdirSync` succeeds. **One owner throughout.**

*The window this closes.* Between P1's `mkdirSync` (L2) and its `owner` write (L2a) the
directory exists with no owner file. A protocol that judged staleness by a missing or
unreadable owner file would declare that infant lock stale and break it, producing two
owners. **L4 makes the directory `mtime` the sole staleness authority** and states
explicitly that a missing `owner` file is not evidence of staleness.

**B — crashed holder, two simultaneous stealers.** The lock directory is 60 s old; P2 and
P3 both judge it stale. Both attempt L4a's `renameSync(lock, lock.stale-<pid>-<rand>)`.
Their target names differ, but their **source is the same single directory**: the first
rename to land moves it, and the second fails `ENOENT`. So exactly one process breaks the
lock and exactly one is responsible for `rmSync`-ing the renamed corpse — no orphan, no
double-delete. Both then race `mkdirSync`, which is atomic, so exactly one becomes the new
owner and the other returns to waiting. **One owner.** Round 3's `rmdirSync`-then-`mkdirSync`
had no such funnel: both stealers could `rmdirSync` (the second failing harmlessly) and
both could then `mkdirSync` in an interleaving where each believed it had won.

**C — a live holder that exceeds the threshold.** P1 holds and stalls past 30 s. P2 breaks
the lock per B and becomes owner with token `T2`. P1 eventually finishes and calls release:
it reads `owner`, finds `T2` (or `ENOENT`), and **no-ops** — L3's token comparison is
exactly what prevents P1 from deleting P2's lock and admitting a third owner. Meanwhile P1
and P2 may both run `rebuildRefusalBanner` concurrently. Each does its own `readdir`,
builds a complete file, and lands it by atomic `renameSync`; a reader therefore always sees
one whole valid rebuild, never a torn one, and the later rename wins. If the winner's
`readdir` snapshot was the older one, the concatenated file lags the directory by one
entry — repaired at the next render by L8a. **P1 loses only derived work: its banner entry
and its alert record were durable before the rebuild began.** That is residual L7(i), and
it is the price of a bounded threshold; the alternative — waiting forever on a possibly
dead holder — is the failure mode this whole chain exists to prevent.

**D — the bounded wait expires (L6).** Because the wait (35 s) **exceeds** the staleness
threshold (30 s), a crashed holder is always broken with ~5 s of margin to spare, so this
path is unreachable for a dead holder. It is reachable only when a *live* holder keeps the
lock past 30 s — four orders of magnitude beyond the expected hold, i.e. a pathologically
stalled machine. On that path the caller writes its banner entry, rebuilds unlocked, and
appends its alert record append-only. **No record is lost in any branch.** The unlocked
rebuild is safe for the same reason as C: atomic rename, so the worst case is losing a
race, which L8a then repairs.

**What is deliberately not defended.** Two processes on different hosts sharing
`<core>` over a network filesystem whose `mkdir` is not atomic. That is outside
`docs/THREAT-MODEL.md`'s single-machine scope, and `src/core/dream/lock.js` (WP-008) makes
the same assumption for the dream lock.

### Mirrored Surface Checklist

Surfaces that mirror Table B — a review finding updates the table and every box below
in one pass, and any new mirror found in review is added here on the spot:

- [ ] Deliverables-table cells naming `src/core/refusal-banner.js`, the `private-fs.js`
      edit, `tests/unit/private-fs.test.js`, and the `sync` clearer site
      (mirror B1, B1a, B10, B13)
- [ ] The "Literal expected file content" block under Exact contracts (mirrors B3, B4)
- [ ] The `writeRefusalBanner` / `clearRefusalBannerFor` / `rebuildRefusalBanner` JSDoc
      in Exact contracts (mirrors B5, B7, B8, B9, B14)
- [ ] Acceptance criteria AC-1 … AC-17 (mirror B1 … B14)
- [ ] Verification greps for the directory, the sanitizer, the absence of a `src/`
      require in the launcher, and the absence of any clear in `run-job.js`
      (mirror B1, B9, B10, B14)
- [ ] Current-state rework table's "what survives" verdicts (mirror B2, B4–B8, B10, B13)
- [ ] The clearing-rationale section in Context (mirrors B10, B11)
- [ ] **`docs/GLOSSARY.md`'s `refusal banner` entry** (mirrors B1, B1a, B10, B11, B15) —
      registered in round 2; it states the clearing rule in user-facing words and must
      move whenever B10/B11 move
- [ ] ADR-0039 §5 and its Amendment 1 F5/R1–R4 paragraphs (mirror B10, B11, B14–B17)
- [ ] Table L's L8 "guarded regions" row and `WP-launcher-alert-bound`'s Table C row
      C8d (mirror L1–L11 — the lock is one contract used by two specs; a change to
      Table L must move C8d in the same pass)

## Implementation notes & constraints

- **B9 is the load-bearing constraint of this WP.** The launcher's whole purpose is to
  verify the app tree before trusting it. A `require` from `src/` inside `launcher.js`
  would execute the code under suspicion. Put `safeJobFile`, `writeRefusalBanner`,
  `clearRefusalBannerFor` and `rebuildRefusalBanner` physically inside `launcher.js`,
  next to `appendRefuseAlert`, and keep the `BANNER_MAX_CHARS` duplication comment
  naming `MAX_FIELD_CHARS` as its twin. That duplication is deliberate (B4).
- **Where the clear call goes (B10a/B15) — round 3 moved it.** Round 2 cleared
  *before* the spawn, which silently threw the banner away in exactly the cases worth
  banner-ing: `spawnSync` throwing, or returning `status === null` because the child was
  killed by a signal or never started. The current code collapses both into
  `const code = r && typeof r.status === 'number' ? r.status : 1` — a bare `exit(1)`
  with no alert and no banner. Clear **after** the spawn returns a numeric status, and
  take the B16 write path when it does not.
- **A non-zero child exit still clears (B15).** The launcher's banner answers "did this
  job get to run?", not "did it succeed?". A job that ran and failed is `run-job`'s
  fail-loud, which has the richer `alerts.jsonl` channel. Keeping the launcher banner
  alive for a job-level failure would double-report it and never self-clear.
- **`sync` clearing is now conditional, and the condition is computed before the
  digest render (B17).** `src/cli/sync.js` already warns and **continues** on two
  reconciliation failures: `descriptorFailures > 0` (":  job descriptor(s) could not be
  written … the affected job(s) will fail closed at fire time") and a non-empty
  `heal.failed` ("could not reload N scheduled job(s)"). Both are computed in the
  scheduler block, which runs **before** the digest render, so hoist one flag:

  ```js
  let reconciliationClean = true; // no scheduler block ran → nothing observed to be broken
  // …inside the scheduler block, after each warning:
  if (r.descriptorFailures > 0) reconciliationClean = false;
  if (heal.failed.length > 0) reconciliationClean = false;
  ```

  Then the digest passes `reconciliationClean ? '' : readRefusalBanner(paths)`, and
  **after** `manifestMod.save(paths, manifest)`:
  `if (!dryRun && reconciliationClean) clearRefusalBanner(paths);`

  Two independent facts, both load-bearing. **Ordering** (after the manifest save) is
  Codex P1: a Ctrl-C between a state mutation and its save strands the mutation — the
  reversibility rule `WP-105` already learned. **Conditionality** is R4: a sync that
  just told the user a descriptor could not be written has not fixed the machine, and
  must not silence the banner that says the same thing.
- **B14 must be injective, not merely safe.** Round 2's sanitizer was safe — it could
  not escape the directory — but it was **not injective**: `--catch-up` and a real job
  named `catch-up` both produced `catch-up.md`, so one job's refusal overwrote the
  other's and one job's clear erased the other's. Any two names sharing a 64-character
  prefix collided the same way. The `-<8 hex of sha256(raw name)>` suffix fixes the
  collision and the `_` pseudo-job namespace makes the two `catch-up` cases visibly
  distinct. Both properties still hold on the safety side: the result can never contain
  `/`, `\` or `..`, and can never be `.` or `..` because it always ends `-<hash>.md`.
  Implement `entryFileName` **once** and call it from the writer and the clearer —
  two implementations that drift is precisely how a clear stops matching its write.
- **Read "The lock state machine" above before writing a line of it.** Round 3's version
  of this lock had two defects that the four-scenario walkthrough is designed to make
  impossible to reproduce: a stale takeover that could admit **two owners**, and a
  release that removed the directory **without checking ownership**. The token in
  `<lock>/owner` (L2a) is the identity, not the pid — pids are reused, and after a break
  the same pid may hold a different lock instance.
- **Staleness is judged by the lock DIRECTORY's mtime, never by the owner file (L4).**
  There is a real window between `mkdirSync` and the `owner` write in which the directory
  is empty; a protocol that read "no owner file" as "stale" would break infant locks and
  produce two owners. Explicitly test that case (AC-20b).
- **The stale break is a rename, not an unlink (L4a).** `renameSync` on a single source
  is the funnel that makes exactly one stealer win; every loser gets `ENOENT` and simply
  retries `mkdirSync`. Round 3's `rmdirSync`-then-`mkdirSync` had no funnel.
- **The wait budget must exceed the staleness threshold (L5, L4b).** 140 × 250 ms = 35 s
  against a 30 s threshold. That ordering is what makes the L6 fallback unreachable for a
  *crashed* holder — it is always broken first, with margin. Assert the constants in a
  test (AC-22a) rather than trusting a comment, because a later tuning edit that lowers
  the wait or raises the threshold silently re-opens the gap.
- **L6 keeps the lock from becoming the new failure mode.** If the lock cannot be
  acquired, the writer still writes its alert record and its banner entry, **and still
  rebuilds unlocked** — round 3 skipped that rebuild, which meant a fallback left the
  derived file guaranteed-stale rather than possibly-stale. The rebuild is idempotent and
  lands by atomic rename, so unlocked it can lose a race but never corrupt. A lock that
  can swallow a fail-loud record, or freeze the artifact readers depend on, would be a
  worse bug than the race it closes.
- **Hold the lock for milliseconds (L4b).** A `readdir` of a few small files plus one
  `renameSync`. Do not hold it across the spawn, the console output, or the exit — the
  30 s threshold is only safe because the real hold is four orders of magnitude below it.
- **Export the lock; do not re-implement it (L11).** `src/core/alerts.js` requires
  `acquireLauncherLock`/`releaseLauncherLock` from `src/scheduler/launcher.js`. That is
  the safe direction — `launcher.js` is require-safe (`module.exports` precedes its
  `if (require.main === module)` guard) and the launcher still requires nothing from
  `src/`. The vendored `<core>/launcher/launch.js` is a byte copy of the same file, so
  the two processes cannot run different protocols.
- **Fold before prefixing (B4), never after.** `refusalText()` output is a single
  logical sentence today, but `why` comes from a verdict and may grow a newline. An
  unfolded newline would end the markdown blockquote and let the tail of the reason
  render as ordinary prose. Folding is the whole defence; it is not cosmetic.
- **Do not sanitize the text beyond B4.** The reason is code-owned control-plane text
  composed by the launcher itself, exactly like `appendRefuseAlert`'s record, which
  already reaches the digest through `formatAlerts` un-sanitized. A second, different
  sanitizer here would create two answers to one question.
- **Atomic write, not append; clean up the temp on failure (B5).** A reader may open
  these files at any instant, so temp-plus-rename means a reader sees either the old
  content or the new, never a partial line. `renameSync` can fail (a full disk, a
  cross-device edge); wrap it so the temp is `rmSync`'d rather than left beside the
  artifact it failed to replace (Codex P2).
- **Rebuild after every mutation, and remove-on-empty (B1a, B1b).** The concatenated
  file is derived state; if a write or clear can leave it disagreeing with the
  directory, a reader shows a refusal that no longer exists. Removing it when the
  directory is empty is what makes the import's silent-skip semantics do the right
  thing — an empty file would render an empty banner block instead of nothing.
- Do not use `writeFilePrivate` in the launcher — it lives in `src/core/private-fs.js`
  (violates B9). Use plain `fs` plus the B6 chmod.
- Adding to the A5 sets (B13) automatically widens `insecureEntries`, the `insecureModes`
  digest banner and `wienerdog doctor`. That is intended, and it means an existing
  install with a 0644 banner self-heals at the next `sync` — no migration.
  `tests/unit/private-fs.test.js` pins A5 membership **by value**, so it is a required
  Deliverable, not an optional one; the boundary check rejects the PR without it.
- When uncertain: choose the simpler option and record it under "Decisions made" in the
  PR body. Do NOT expand scope.

## Security checklist

- [ ] `safeJobFile` (B14) is applied to **every** path component derived from a job
      name, in the writer and the clearer. It must reject `.`, `..` and empty results.
      Test `--catch-up`, `../../etc/passwd`, `a/b`, `..`, `.`, `''`, a 300-character
      name, and a name with a NUL or newline.
- [ ] The banner text is code-owned control-plane text composed by `refusalText()` from
      a verdict reason the launcher itself produced. No vault content, no transcript
      content, no user-supplied string reaches it. If a future verdict reason ever
      embeds an untrusted value, that is a defect at the verdict site, not here.
- [ ] `p.state` is derived from `anchoredCore(opts.launcherFile)` — the launcher's own
      on-disk location — never from `WIENERDOG_HOME` or any other environment value.
- [ ] Temp filenames embed `process.pid` and are created inside the banner directory,
      which is `mkdir`ed at `0o700`.
- [ ] The banner write happens **before** `exit(1)` and must not delay or bypass it. A
      thrown error inside the writer, clearer or rebuilder must not escape `refuse()`
      or the pre-spawn path (B8).
- [ ] `clearRefusalBannerFor` must remove **only** the named job's entry. Assert with
      two entries present that the other survives.

## Acceptance criteria

Every criterion names the Table B / Table L row it enforces, and every one is satisfied
by a Deliverables row (see the AC-to-Deliverables map in the PR body).

- [ ] AC-1 — A refusal for job `dream` writes an entry under
      `<core>/state/refusal-banner/` whose name is `dream-<8 hex>.md`, containing
      exactly one line matching `^> \[!warning\] wienerdog: refusing to run` plus a
      trailing newline (B1, B3, B14).
- [ ] AC-2 — The entry content equals `> [!warning]`, one space, then the folded reason,
      byte-for-byte (B3, B4).
- [ ] AC-3 — A reason containing `\n` or runs of spaces/tabs folds to single spaces, so
      the entry is still exactly one line (B4).
- [ ] AC-4 — A reason longer than 2000 characters is cut to 2000 before prefixing (B4).
- [ ] AC-5 — `--catch-up` writes `_catch-up-<hash>.md` (B14).
- [ ] AC-6 — **Injectivity (round-3 R1).** `--catch-up` and a job literally named
      `catch-up` produce **different** filenames; refusing both leaves **two** entries;
      clearing one leaves the other intact. Two job names sharing a 48-character prefix
      but differing later likewise produce different filenames (B14).
- [ ] AC-7 — `entryFileName` never emits `/`, `\`, `..`, `.` or an empty name. Test
      `../../etc/passwd`, `a/b`, `..`, `.`, `''`, a 300-character name, and a name
      containing a newline (B14).
- [ ] AC-8 — A second refusal for the **same** job overwrites that job's entry; the
      directory still holds exactly one entry for it (B7).
- [ ] AC-9 — **Cross-job isolation.** Job A refuses on a descriptor drift; job B then
      verifies and spawns. A's entry **survives** and the concatenated file still
      carries A's line (B11).
- [ ] AC-10 — **Self-clearing after a completed spawn.** After AC-9, job A verifies and
      its spawn returns status `0`. A's entry is gone, and with no entries left the
      concatenated file is **removed**, not left empty (B10a, B15, B1b).
- [ ] AC-11 — **A non-zero child exit still clears** the launcher's banner for that job,
      and the launcher exits with the child's code (B15).
- [ ] AC-12 — **Spawn threw (round-3 R3).** `spawnSync` throwing produces a banner entry
      for that job whose text is `spawnFailureText(name, 'spawn failed')`, a
      refuse-class `alerts.jsonl` record with the same sentence, stderr output, and
      `exit(1)`. The entry is **not** cleared (B16).
- [ ] AC-13 — **Null status (round-3 R3).** `spawnSync` returning `{status: null,
      signal: 'SIGKILL'}` produces a banner entry reading `terminated by signal SIGKILL`,
      the matching alert, and `exit(1)` (B16).
- [ ] AC-14 — `spawnFailureText` contains neither "integrity mismatch" nor any remedy
      sentence, and never names `wienerdog doctor` or `wienerdog sync` (B16, F27).
- [ ] AC-15 — With entries `_catch-up-<h>.md` and `dream-<h>.md`, the concatenated file
      contains the `_catch-up` line, a blank line, then the `dream` line — sorted
      filename order (B1a).
- [ ] AC-16 — On POSIX both an entry and the concatenated file are `0600` after a
      refusal (B6).
- [ ] AC-17 — Making the banner write fail (unwritable `state`) still produces the
      refusal: non-zero exit, zero spawn, and the `alerts.jsonl` record is still
      appended (B8).
- [ ] AC-18 — A `renameSync` failure leaves **no** `*.tmp` file behind (B5).
- [ ] AC-19 — **Contended fallback (L6, revised in round 4).** With a **fresh**
      `<core>/state/launcher.lock/` held for the whole bounded wait, a refusal still
      writes its banner entry, **still rebuilds the concatenated file unlocked**, and
      still appends its alert record; only the alerts **compaction** is skipped. Nothing
      throws (L2, L5, L6, L7).
- [ ] AC-20 — **Stale takeover.** A lock directory whose `mtime` is older than **30 s**
      is broken by rename-then-remove and re-acquired once, and the guarded work then
      runs normally (L4, L4a).
- [ ] AC-20a — **Two simultaneous stealers, exactly one owner (round-4 S1).** Two
      acquirers both observing the same stale lock produce **exactly one** successful
      `renameSync` (the loser sees `ENOENT`), exactly one `launcher.lock.stale-*`
      directory, which is then removed, and **exactly one** new owner — assert the
      surviving `owner` file carries a single token (L4a).
- [ ] AC-20b — **A lock with no `owner` file is not stale.** A freshly `mkdir`ed lock
      directory containing no `owner` file is **not** broken by a contender; only the
      directory `mtime` decides staleness (L4).
- [ ] AC-21 — The lock is released even when the guarded work throws — assert the
      directory is gone after an injected failure (L3).
- [ ] AC-21a — **Release with a wrong token is a no-op (round-4 S1).** A holder whose
      lock was broken and re-acquired by another process calls release: the directory
      and the **successor's** `owner` file both survive untouched (L3).
- [ ] AC-21b — **Broken slow holder causes no corruption (round-4 S1).** A live holder
      broken past the threshold, whose rebuild then races the breaker's rebuild, leaves
      a **valid, completely-formed** concatenated file — never a torn one — and the
      holder's own banner entry and alert record are both intact (L7 i–ii).
- [ ] AC-22 — **Write/clear interleaving under the lock.** A write for job A and a clear
      for job B, serialised through the lock, leave exactly A's entry and a concatenated
      file matching it (L8, B11).
- [ ] AC-22a — **The bounded wait exceeds the staleness threshold (round-4 S2a).** Assert
      the constants directly: wait budget (140 × 250 ms = 35 000 ms) **>** staleness
      threshold (30 000 ms). A crashed holder is therefore always broken before the
      fallback can trigger (L4b, L5).
- [ ] AC-22b — **Reader self-heal (round-4 S2c).** After an L6 fallback rebuild loses a
      race — the directory holds an entry the concatenated file lacks, with no further
      launcher mutation — the **next `renderDigest` call site** (`sync` or `dream`) shows
      the entry and rewrites the concatenated file to match (B18a, L8a).
- [ ] AC-23 — `clearRefusalBanner` (app-side) removes every entry and the concatenated
      file, and is a no-op — no throw — when the directory is already absent (B10b).
- [ ] AC-24 — `'refusal-banner.md'` is in `A5_PRIVATE_FILE_BASENAMES`, and
      `refusal-banner/` and `launcher.lock/` are in the A5 dirs set, all pinned by
      `tests/unit/private-fs.test.js` (B13).
- [ ] AC-25 — `grep -n "require(.*\.\./src" src/scheduler/launcher.js` returns nothing
      (B9, L11), and `src/cli/run-job.js` contains no reference to the refusal banner
      (B10).
- [ ] AC-26 — **Sync's clean-reconciliation gate (round-3 R4).** A `sync` run in which
      one descriptor write fails leaves every banner entry **in place** and renders its
      digest **with** the banner. A run in which `heal.failed` is non-empty behaves the
      same way (B17).
- [ ] AC-26a — **Catch-up failure counts as unclean (round-4 S4).** `repointSchedules`
      returns `catchup: {ok:false, reason}` when the catch-up reload is rejected, and
      when `repairCatchup` **throws** (reported as `{ok:false, reason:'threw: …'}`). In
      both cases `sync` leaves every banner entry in place and renders the digest **with**
      the banner (B17, B17a).
- [ ] AC-26b — A successful catch-up repair returns `catchup: {ok:true}` and does not by
      itself make the run unclean (B17a).
- [ ] AC-27 — A fully clean `sync` clears the directory **after** `manifestMod.save`,
      and renders its own digest banner-free (B10b, B12, B17).
- [ ] AC-28 — `wienerdog sync --dry-run` with entries present leaves them in place and
      rebuilds nothing (B12).
- [ ] AC-29 — Running `wienerdog sync` twice is idempotent: the second run reports zero
      changes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern refusal-banner
npm test -- --test-name-pattern launcher
npm test -- --test-name-pattern private-fs
npm test -- --test-name-pattern sync
npm test
npm run lint
# B9/L11 — the launcher still requires no app-tree code (expect NO output):
grep -n "require(['\"]\.\./src\|require(['\"]\.\./\.\./src" src/scheduler/launcher.js
# B10 — run-job clears NOTHING (expect NO output):
grep -n "refusal-banner\|clearRefusalBanner" src/cli/run-job.js
# B10b/B17 — sync's clear is AFTER the manifest save AND gated on a clean run:
grep -n "manifestMod.save\|clearRefusalBanner\|reconciliationClean" src/cli/sync.js
# B13 — all three A5 memberships are registered and pinned:
grep -n "refusal-banner\|launcher.lock" src/core/private-fs.js tests/unit/private-fs.test.js
# B14 — one implementation of the filename rule, used by writer and clearer:
grep -n "entryFileName" src/scheduler/launcher.js
# L5/L4b — the wait budget must EXCEED the staleness threshold (35000 > 30000):
grep -n "30000\|30_000\|250\|140\|Atomics.wait\|SharedArrayBuffer" src/scheduler/launcher.js
# L2a/L3 — ownership is by token, and release is guarded by it:
grep -n "token\|owner" src/scheduler/launcher.js | head -20
# L11 — the lock is exported once and required app -> launcher (never the reverse):
grep -n "acquireLauncherLock\|releaseLauncherLock" src/scheduler/launcher.js src/core/alerts.js
# B17a — the catch-up result is structured, not a notice string:
grep -n "catchup" src/cli/schedule.js src/cli/sync.js
```

## Out of scope (do NOT do these)

- Reading or displaying the banner — `WP-refusal-banner-delivery` (SessionStart hook
  prepend + `renderDigest` fold) and `WP-managed-block-by-reference` (the Claude Code
  import line).
- Bounding or restructuring `alerts.jsonl` / `appendRefuseAlert` — that is
  `WP-launcher-alert-bound`.
- Making the CLI shim fail with a human message — that is `WP-shim-recovery-message`.
- Rendering alerts live inside the hook from `alerts.jsonl` (option E1). ADR-0039 §6
  retains it as a **documented fallback that is not built**.
- Changing `refusalText`, `REMEDY_TAIL`, the remedy discriminator, or any verification
  logic in the launcher.
- Changing the managed block, the digest's shape, or any adapter.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(launcher): refusal banner file (WP-launcher-refusal-banner)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 finding F5 (owner: ACCEPTED), plus the wd-reviewer pass
  on PR #174.** Round 1's clearing rule was unconditional — any job success, plus any
  attended `sync`, wiped the banner — resting on the premise that *"the banner exists
  only to cover the case where the app tree is broken … no job succeeds and no sync
  completes, so nothing clears it."* **The premise is false.** `launcher.js` refuses on
  **per-job** verdicts (`verifyAndResolve(p, name, …)`), so a descriptor drift on
  `dream` refuses `dream` while `daily-digest` verifies and runs — and the round-1 rule
  would have let `daily-digest`'s success silently erase `dream`'s warning. The spec
  shipped a fresh instance of the defect the whole chain exists to fix. Changes:
  - **Table B rewritten.** New rows B1 (per-job entries under
    `state/refusal-banner/`), B1a (the concatenated file, rebuilt from the entries in
    sorted filename order — chosen over a bare directory because an `@import` cannot
    glob), B1b (remove-on-empty, so the import's silent skip means "no refusal"), B14
    (job-name sanitization: `--catch-up` → `catch-up`), B15 (readers). B7, B10, B11 and
    B13 rewritten; B5 gained the `rmSync(tmp)` on rename failure (Codex P2).
  - **The clearer moved into the launcher.** A job's entry is cleared when **that job**
    verifies, before spawn. This dissolves the 2026-08-01 logbook's arithmetic trap at
    its source rather than working around it: the trap came from keying on job
    *success*, which `--catch-up` never reports; keying on *verification*, which the
    launcher performs for every job on every fire, makes catch-up self-clearing.
  - **`src/cli/run-job.js` removed from the Deliverables entirely** — its unconditional
    clear was the defect. Round-1 implementations must delete that call and its
    `require`.
  - **`sync`'s clear moved to after `manifestMod.save`** (Codex P1 on #174: never
    mutate state ahead of its manifest — the reversibility rule WP-105 already learned),
    with the digest now rendered banner-free by passing `''` explicitly rather than by
    clearing early.
  - **`tests/unit/private-fs.test.js` recorded as a required Deliverable** (wd-reviewer
    note 10): it pins A5 membership by value, so the boundary check rejects the PR
    without it. Precedent: `docs/specs/done/WP-attended-alert-acknowledgement.md`.
  - **`docs/GLOSSARY.md`'s `refusal banner` entry registered in the Mirrored Surface
    Checklist** and rewritten to the new clearing rule.
  - **Current state reworked against `origin/wp/launcher-refusal-banner` (PR #174, HEAD
    `e17d638`)**, which is open and held: the implementer reworks that branch rather
    than starting fresh, so the section now says explicitly what survives and what is
    deleted.
- **2026-08-30 — Codex round-2 review, findings R1–R5 (owner: ACCEPTED; the Q3 ruling
  REVERSED).** Round 2 fixed the per-job premise but introduced defects of its own.
  - **R1 — the sanitizer was safe but not injective.** `--catch-up` and a job literally
    named `catch-up` both mapped to `catch-up.md`, so one job's refusal overwrote the
    other's entry and one job's clear erased the other's warning — the same
    cross-contamination F5 had just been fixed for. Any two names sharing the 64-char
    prefix collided identically. **B14 rewritten**: `<readable>-<8 hex of sha256(raw
    name)>.md`, readable cut to 48 chars, pseudo-jobs namespaced with a leading `_`
    (`_catch-up-<hash>.md`). New AC-6 and AC-7.
  - **R2 + R5 — the owner REVERSED round 2's compare-and-retry (Q3).** Compare-and-retry
    narrowed the lost-update window on `alerts.jsonl` but left an identical, unclosed
    window on the banner rebuild (another writer between the final `readdir` and the
    rename). Two differently-shaped half-guards are worse than one shared real one.
    **New Table L**: a single launcher-owned lock at `<core>/state/launcher.lock/`,
    acquired by atomic `fs.mkdirSync` (`EEXIST` = held), released by `rmdirSync` in a
    `finally`, 10 s mtime staleness with a single takeover — the same shape as the dream
    lock in `src/core/dream/lock.js` (**WP-008**, not WP-029 as the round-3 brief cited;
    WP-029 is adopt-snapshot-robustness). Bounded wait of 5 × 200 ms via `Atomics.wait`
    on a `SharedArrayBuffer`, because the launcher is synchronous. **L6 is the important
    row**: a writer that cannot acquire still writes its alert record and its banner
    entry, skipping only compaction and rebuild — a lock that could swallow a fail-loud
    record would be a worse bug than the race it closes. New B1c, AC-19 … AC-22.
  - **R3 — clearing before spawn lost the banner exactly when it mattered.** The spawn
    site collapses a thrown `spawnSync` and a `status === null` (signal-killed, or never
    started) into a bare `exit(1)` with no refusal path — so a pre-spawn clear deleted
    the banner and nothing replaced it. **B15**: clear only after a **numeric** status
    (any number — a non-zero child exit is `run-job`'s fail-loud, not the launcher's).
    **B16**: on a throw or null status, *write* an entry with a code-owned
    `spawnFailureText` — deliberately not `refusalText`, whose "integrity mismatch" and
    remedy tails would both be false here — plus a refuse-class alert, then exit 1. New
    AC-11 … AC-14.
  - **R4 — `sync` cleared even after reporting its own failures.** `src/cli/sync.js`
    warns and **continues** on `descriptorFailures > 0` and on a non-empty `heal.failed`,
    then reached the unconditional clear: a sync that had just told the user a job
    descriptor could not be written would silence the banner saying so. **B17**: clear
    only on a fully clean reconciliation; otherwise clear nothing and render the digest
    **with** the banner. New AC-26, AC-27, and `tests/unit/sync-repoint.test.js` added
    to the Deliverables.
  - Table B rows renumbered and made internally consistent (B10 names *when*, B15/B16/B17
    name *what each clearer requires first*, B11 states the shared scope rule).
- **2026-08-30 — Codex round-3 findings S1, S2, S4 (owner: ACCEPTED).** Both round-3
  defects were in the lock this spec introduced, which is why Table L now ships with a
  written four-scenario state-machine argument.
  - **S1 — the lock could admit two owners and free a lock it did not hold.** The stale
    takeover was `rmdirSync`-then-`mkdirSync`, with no funnel: two stealers observing the
    same stale lock could both proceed. And `release` was a bare `rmdirSync` with **no
    ownership check**, so a holder broken mid-work would delete its *successor's* lock and
    admit a third owner. Rewritten: an `owner` file stamped with a 16-hex **token**
    immediately after `mkdirSync` (L2a); release reads it and acts **only on a token
    match** (L3); the stale break is an atomic `renameSync` of the single source directory,
    so exactly one contender wins and every loser gets `ENOENT` (L4a). Staleness is judged
    by the **directory mtime**, never the owner file, because a lock is legitimately
    owner-less for the microseconds between L2 and L2a (L4). Threshold raised 10 s → 30 s
    against a stated **millisecond** expected hold (L4b). New AC-20a, AC-20b, AC-21a,
    AC-21b.
  - **S2a/S2b — the contended fallback could hide a banner indefinitely.** The bounded
    wait (10 s) was *shorter* than the staleness threshold, so a crashed holder could push
    a writer onto the fallback path before anyone broke the lock; and the fallback skipped
    the rebuild, leaving the derived file **guaranteed** stale. Now the wait (140 × 250 ms
    = 35 s) **exceeds** the 30 s threshold by design, so the fallback is unreachable for a
    dead holder (L5, AC-22a); and the fallback **still rebuilds, unlocked** — idempotent
    and atomic, so it can lose a race but never corrupt (L6).
  - **S2c — readers now self-heal.** `renderDigest`'s callers read the **directory** and
    rebuild the concatenated file under the lock on drift (B18a, L8a); only the hook and
    the Claude import stay on the concatenated file. New AC-22b.
  - **S4 — `sync` cleared after a catch-up reconciliation failure.** `repairCatchup`
    returns `{notice?:string}` and `repointSchedules` folds it into `notices` only, so a
    failed catch-up repair was a console line no code tested — and B17's gate never saw
    it. The catch-up entry is the only thing that delivers a missed nightly dream, so this
    was precisely the case that must not clear. New **B17a**: `repairCatchup` returns
    `{ok, reason?}` (a caught throw reported as `{ok:false, reason:'threw: …'}`),
    `repointSchedules` propagates it as `catchup`, and `sync` folds `!r.catchup.ok` into
    `reconciliationClean`. `src/cli/schedule.js` and `tests/unit/catchup-authorization.test.js`
    added to the Deliverables; new AC-26a, AC-26b. The real shapes are now quoted in
    Current state.
