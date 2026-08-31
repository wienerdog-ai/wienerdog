---
id: WP-private-state-writers-mode-pin
title: Pin 0600 on every private-listed state file whose writer replaces it by temp+rename
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0024]
---

# WP-private-state-writers-mode-pin: make the writers agree with the private-file policy

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004) — no daemon, no server, nothing that outlives
its job. Its machine state therefore lives in plain files under the **mechanics
root** `~/.wienerdog` (`paths.core`), whose privacy is a **policy** enforced by
one module: `src/core/private-fs.js` declares the private set — directories that
must be `0700`, files that must be `0600` — and exposes a single read predicate
(`insecureEntries`) plus a repair (`repairPrivateModes`). Three surfaces consume
that one predicate so they can never disagree: `wienerdog doctor` warns per
offending path (`src/cli/doctor.js:641-656`), `wienerdog sync` repairs
(`repairPrivateModes` at `src/cli/sync.js:263`; the dry-run branch only counts,
at `:260`), and the injected digest carries an `insecureModes`
count (`src/cli/dream.js:643`, `src/cli/sync.js:289`).

The policy names the files; it does not write them. Each file has its own writer,
and a writer that produces the wrong mode is not corrected until the next
attended `wienerdog sync`. Where a writer runs on **every scheduled job run**,
repair is structurally unable to hold: the job re-loosens the file hours after
sync tightened it. That is upstream **issue #168**, observed on 0.13.0 —
`state/schedule.json` sits at `0644`, doctor warns, the warning is rendered into
the digest injected at every session start, `wienerdog sync` fixes it, and the
next nightly dream undoes the fix.

The mechanism is a property of the **write shape**, not of any one file. An
in-place `fs.writeFileSync(file, data)` opens an existing file `O_TRUNC` and
leaves its mode alone, so a file that is already `0600` stays `0600`. A
**temp+rename** writer instead creates a brand-new inode — at the process
default mode, `0666 & ~umask` — and renames it over the destination, so the new
inode's loose mode replaces the correct one. Every writer in this repo that
already gets this right does the same two things: pass `{ mode: 0o600 }` at
create *and* `chmod` the temp before the rename, because the create mode is
masked by umask while the chmod is not (`src/core/identity-approvals.js:98-102`,
`src/core/dream/ledger.js:131-134`, `src/gws/client.js:139-142`,
`src/core/dream/validate.js:667-669`). This WP applies that established shape to
the writers that lack it.

Scope is one claim, stated once and checked once: **every private-listed file is
`0600` on disk immediately after its own writer runs, under any umask.** Table A
is the measured audit that defines which writers that claim touches.

## Current state

Measured on HEAD `a6e0803`; nothing below is inferred.

**The reported writer.** `writeScheduleState` — `src/scheduler/jobs.js:232-240` —
is byte-for-byte the shape issue #168 quotes: `fs.writeFileSync(tmp, …)` at
line 238 with no `mode`, then `fs.renameSync(tmp, file)` at line 239.

**The policy disagrees with it.** `schedule.json` and `watermarks.json` are
listed in `A9_PRIVATE_STATE_FILES` (`src/core/private-fs.js:135-141`), and
`alerts.jsonl` in `A5_PRIVATE_FILE_BASENAMES` (`:116-122`); all three are
enumerated as `0600` files by `listPrivateEntries` (`:640-646`) and flagged by
`insecureEntries` (`:906-921`) when their mode is anything but `0600`.

**What doctor emits.** `src/cli/doctor.js:655` — `` `${p} has wrong permissions
(expected 0700 for folders, 0600 for files) — run 'wienerdog sync' to repair it`
`` — matching the issue's quoted warning exactly.

**Measured behavior.** Running the three writers under `umask 000` against a
temp core (the Table A gate under Verification steps) on HEAD:

```text
alerts.jsonl after appendAlert : 0600
schedule.json     -> 0666
watermarks.json   -> 0666
alerts.jsonl      -> 0666
```

The `0666` measured here and the `0644` issue #168 reports are the **same
defect at two umasks**, not a discrepancy: the temp file is created at the
process default `0666 & ~umask`, so the reporter's default `umask 022` yields
`0644` while this gate runs under `umask 000` to show the raw `0666`. Fixing
the mode makes the umask irrelevant, which is why Table B pins with `chmod`
rather than relying on the create mode.

The `appendAlert` line is the control: the append path already pins `0600` via
`chmodAlerts` (`src/core/alerts.js:90`), so `alerts.jsonl`'s loose mode is
produced by `clearAlerts` alone, not by the module generally.

**The audit.** Table A enumerates every writer of every private-listed `0600`
file and classifies it. Three writers are mode-dropping; every other writer of a
private-listed file is already correct.

**One measured caveat, carried into Table A.** `writeWatermarks` has **no
production caller** on HEAD — `src/core/dream/ledger.js:11` imports only
`readWatermarks` (for the one-time ledger migration at `:153`), and the sole
callers of `writeWatermarks` are `tests/unit/dream-collect.test.js` and
`tests/unit/ledger.test.js`. It is fixed here because it is a mode-dropping
writer of a private-listed file and the fix is two lines, not because it is
reachable in production today. Do not delete it; that is a separate question.

**A dated owner decision stands against two of the three fixes.** `WP-a9-private-modes-repair`
recorded a Codex round-1 owner decision of 2026-07-19
(`docs/specs/done/WP-a9-private-modes-repair.md:149-156` and `:885-887`;
`docs/specs/logbook/2026-07-19-codex-round-1-a9-a10-spec-review.md:49-53`): the
four metadata files `config.yaml` / `install-manifest.json` / `schedule.json` /
`watermarks.json` enter the predicate/repair set **while their writers stay
unchanged**, on the stated basis that "fresh-write privacy relies on the 0700
parent dirs + sync-time repair (dated accepted residual)". Issue #168 is the
field falsification of that residual's premise for `schedule.json`: sync-time
repair cannot hold a file that a scheduled job rewrites nightly. This WP
reverses that decision **for `schedule.json` and `watermarks.json` only**; see
Definition of done item 0. `alerts.jsonl` was never covered by it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js:44-54: this
     spec file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/jobs.js | `writeScheduleState` only — apply Table B at lines 238-239 |
| modify | src/core/dream/watermarks.js | `writeWatermarks` only — apply Table B at lines 39-40 |
| modify | src/core/alerts.js | `clearAlerts` only — apply Table B at lines 207-208. Do NOT touch `appendAlert`, its compaction branch, or `chmodAlerts` (Table A rows 2-3: already correct) |
| modify | src/core/private-fs.js | **comment text only, zero code change** — correct the two now-false mirrors of the 2026-07-19 decision at lines 20-22 and 129-134 (the `A9_PRIVATE_STATE_FILES` JSDoc) so they no longer claim these writers are unchanged. The array literal it documents, lines 135-141, is CODE and is NOT edited — its membership is correct and 3 of its 5 entries were never part of that decision. The `A9_PRIVATE_CORE_FILES` comment at lines 143-148 also stays TRUE and is NOT edited (config.yaml / install-manifest.json writers really are unchanged here) |
| create | tests/unit/private-writer-modes.test.js | cover the acceptance criteria below; the implementer designs the cases |

### Exact contracts

No exported signature changes. `writeScheduleState(paths, name, patch)`,
`writeWatermarks(stateDir, {claude, codex})` and `clearAlerts(paths, job)` keep
their parameters, return values, file contents, atomicity (temp+rename) and
error behavior exactly as they are on HEAD. The only observable change is the
POSIX mode of the file each leaves on disk.

## Contract reference

Activation (ADR-0031, 2-of-7): **(v)** the writers emit the mode but
`private-fs.js` owns the policy that judges it — the authority split *is* the
bug; and **(vi)/(vii)** three surfaces (doctor, sync, digest) consume that one
predicate, and the same per-writer facts appear in the audit, the Deliverables
cells, the acceptance criteria and the verification gate.

### Table A — every writer of a private-listed `0600` file (measured on HEAD a6e0803)

"Shape" is what determines the mode: *in-place* preserves an existing file's
mode, *temp+rename* replaces the inode and carries the temp's mode.

| # | Private-listed file | Writer (file:line) | Shape | Mode it leaves | This WP |
|---|---------------------|--------------------|-------|----------------|---------|
| 1 | `state/digest.md` | `src/cli/sync.js:293`, `src/cli/dream.js:646` | `writeFilePrivate` | 0600 | unchanged |
| 2 | `state/alerts.jsonl` | `src/core/alerts.js:89-90` (`appendAlert` append) | append + `chmodAlerts` | 0600 | unchanged |
| 3 | `state/alerts.jsonl` | `src/core/alerts.js:117-120` (`appendAlert` compaction) | temp `{mode:0600}` + rename + `chmodAlerts` | 0600 | unchanged |
| 4 | `state/alerts.jsonl` | `src/core/alerts.js:207-208` (`clearAlerts`) | temp+rename, **no mode, no chmod** | **0666** | **FIX (Table B)** |
| 5 | `state/alerts-ack.json` | `src/core/alert-ack.js:88,113` | `writeFilePrivate` | 0600 | unchanged |
| 6 | `state/transcript-ledger.json` | `src/core/dream/ledger.js:131-134` | temp `{mode:0600}` + chmod + rename + chmod | 0600 | unchanged |
| 7 | `state/identity-approvals.json` | `src/core/identity-approvals.js:98-102` | temp `{mode:0600}` + chmod + rename + chmod | 0600 | unchanged |
| 8 | `state/broker-grants.json` | `src/gws/broker/grant-store.js:168` | `writeFilePrivate` | 0600 | unchanged |
| 9 | `state/exec-pins.json` | `src/core/exec-identity.js:410` | `writeFilePrivate` | 0600 | unchanged |
| 10 | `state/run-evidence.jsonl` | `src/core/run-evidence.js:131` | `writeFilePrivate` | 0600 | unchanged |
| 11 | `state/schedule.json` | `src/scheduler/jobs.js:238-239` (`writeScheduleState`) | temp+rename, **no mode** | **0666** | **FIX (Table B)** |
| 12 | `state/watermarks.json` | `src/core/dream/watermarks.js:39-40` (`writeWatermarks`) | temp+rename, **no mode** | **0666** | **FIX (Table B)** — no production caller; see Current state |
| 13 | `<core>/config.yaml` | `src/cli/init.js:158,168`, `src/cli/adopt.js:382`, `src/scheduler/jobs.js:164,180` | **in-place** `writeFileSync`, no temp | preserves the existing file's mode; umask default only at first create (init) | out of scope — see below |
| 14 | `<core>/install-manifest.json` | `src/core/manifest.js:687` (`save`) | **in-place** `writeFileSync`, no temp | as row 13 | out of scope — see below |
| 15 | `logs/<job>/*.log` | `createLogStreamPrivate`, `src/core/private-fs.js:951-987` | `O_CREAT` 0600 + `fchmod` on the fd | 0600 | unchanged |
| 16 | `state/dream-scratch/*.json` | `src/core/dream/scratch.js:215` | `writeFilePrivate` | 0600 | unchanged |
| 17 | `state/quarantine/*`, `state/quarantine/redacted/*` | `src/core/dream/validate.js:667-669` (`quarantinePreserve`) | temp `{mode:0600}` + chmod + rename | 0600 | unchanged |
| 18 | `secrets/*` | `src/gws/client.js:139-142` (`writeSecretJson`) | temp `{mode:0600}` + chmod + rename + chmod | 0600 | unchanged |
| 19 | `secrets/*.retired` | `src/gws/token-migration.js:36` | `renameSync` of an existing file | preserves its 0600 | unchanged |

**Why rows 13-14 are out of scope, not overlooked.** Their writers are in-place
`writeFileSync` with no temp file, so they never replace the inode and never
reset an already-correct mode — verified: an in-place rewrite of a `0600` file
under `umask 000` leaves it `0600`, where a temp+rename leaves it `0666`. They
are loose only if created loose, which happens once at `init`, before any
scheduled job — exactly the init/sync-time window the 2026-07-19 residual
covers, and which `wienerdog sync` repairs **durably** because nothing rewrites
them at job end. They therefore fall outside this WP's claim, and the
2026-07-19 decision continues to hold for them unmodified.

### Table B — the canonical private temp+rename write shape

The single shape the three fixed writers adopt. It is not new: it is the shape
already used at `src/core/identity-approvals.js:98-102`,
`src/core/dream/ledger.js:131-134`, `src/gws/client.js:139-142` and
`src/core/dream/validate.js:667-669`.

| Fact / rule | Value |
|-------------|-------|
| Shape | `fs.writeFileSync(tmp, body, { mode: 0o600 })` → `fs.chmodSync(tmp, 0o600)` → `fs.renameSync(tmp, dest)` |
| Why both the mode and the chmod | the create mode is masked by umask (`0600 & ~umask` can be `0400` or less); `chmod` sets it exactly, umask-independently |
| Why the temp and not the destination | the mode must be right *before* the rename, so no window exists in which `dest` is the new inode at a loose mode |
| Ordering | the chmod goes between the write and the rename; the rename stays last, so atomicity is unchanged |
| What must NOT change | the temp naming, the JSON/JSONL body bytes, the trailing newline, the `mkdirSync` calls, the return values, and which errors propagate |
| Not adopted here | `writeFilePrivate` (`src/core/private-fs.js:280`) — see Implementation notes for the measured reason |
| win32 | `chmodSync` is a POSIX-mode no-op there, matching `private-fs.js`'s stated win32 posture (`:23-25`); no platform branch is added |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Table A / Table B — a finding updates the
table and every surface below in one pass:

- [ ] Deliverables-table cells (the three writer rows cite Table B; the
      `private-fs.js` row cites the two comment mirrors)
- [ ] Acceptance criteria that assert Table A's three FIX rows and its
      "unchanged" rows
- [ ] The Table A verification gate under Verification steps
- [ ] Current-state (the measured probe output, the three mechanism citations,
      and the `writeWatermarks`-has-no-production-caller caveat)
- [ ] The out-of-scope justification for Table A rows 13-14
- [ ] **`src/core/private-fs.js:20-22` and `:129-134`** — prose in the product
      tree asserting these writers are unchanged. It goes false the moment the
      code changes, so it moves in the same PR (it is a Deliverable for exactly
      this reason). Neither `:135-141` (the array literal `:129-134` documents,
      whose membership stays correct) nor `:143-148` is a mirror of a changed
      fact; both stay

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **`writeFilePrivate` was considered and rejected, with a measured reason.**
  `src/core/private-fs.js` exports it, 11 production call sites across 10 files
  use it, and it is
  strictly stronger (crypto-random `O_EXCL|O_NOFOLLOW` temp, `fchmod` on the fd,
  post-rename inode check). But it **throws** where these three writers do not:
  on a pre-existing symlink at the destination (F16, `:297-303`), on a symlinked
  in-core ancestor (`assertInCoreAncestry`), and on a post-rename inode mismatch
  (F10, `:358-366`). Three of `writeScheduleState`'s four production call sites
  — `src/cli/run-job.js:797`, `:872` and `:1096` — run it **immediately before
  `failLoud`**, and the fourth (`:1060`) sits on the success path. A new throw on
  any of the first three would suppress the
  durable alert that is the whole point of that path, converting a reported job
  failure into a silent one. Adopting it is therefore a behavior change beyond
  this WP's claim. It is also already named as separate work in the tree:
  `private-fs.js:38-45` records "fold those core writers onto the
  ancestry-validated private writer" as a cross-cutting follow-up WP. Use
  Table B; do not import `writeFilePrivate` in this WP.
- The three fixes are independent one-to-three-line edits. Do not refactor them
  into a shared helper — three call sites of a four-line shape that already
  recurs verbatim elsewhere in the tree do not earn an abstraction, and a new
  helper would widen the diff past the claim.
- **Test-file placement.** All three writers are covered by ONE new file rather
  than by edits to `tests/unit/scheduler-schedule.test.js`,
  `tests/unit/dream-collect.test.js` and `tests/unit/alerts.test.js`. Two
  reasons: the claim is one claim and reads best in one place, and the draft
  `WP-secret-sink-wiring-probes` already lists `tests/unit/alerts.test.js` and
  `tests/unit/dream-collect.test.js` in its own Deliverables — a new file avoids
  a merge conflict between two open work packages.
- `umask` is process-global. Any test that sets it must restore it, or a later
  test in the same `node:test` process inherits it.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted
      identifier reaches a filesystem path or a shell command here.** Every path
      this WP touches is built by existing code from `paths.state`; the WP adds
      no path construction, no filename interpolation and no shell command.
- [ ] The surface this WP actually touches is **the confidentiality of the
      mechanics root's state files.** `schedule.json` carries job names and run
      timestamps; `alerts.jsonl` carries failure reasons and log hints;
      `watermarks.json` carries transcript processing markers. On a multi-user
      machine a `0644` file is readable by every local account. The containment
      is Table B, applied so the file is never observable at a loose mode: the
      mode is pinned on the temp inode *before* the rename publishes it.
- [ ] Residual, named: the parent directory is out of scope. `state/` is created
      `0700` by `src/cli/init.js:135` before any job runs, so the mode-less
      `fs.mkdirSync(…, { recursive: true })` inside `writeScheduleState`
      (`jobs.js:237`) and `writeWatermarks` (`watermarks.js:35`) is a no-op in
      production; it could only create a loose `state/` on an install where
      `init` never ran. This WP's claim is over the private-listed **file** set;
      the directory case is left as stated work below, not silently fixed.

## Acceptance criteria

- [ ] Under `umask 000`, `state/schedule.json` is `0600` immediately after
      `writeScheduleState` returns (Table A row 11).
- [ ] Under `umask 000`, `state/watermarks.json` is `0600` immediately after
      `writeWatermarks` returns (Table A row 12).
- [ ] Under `umask 000`, `state/alerts.jsonl` is `0600` immediately after a
      `clearAlerts` call that rewrites the file — i.e. one that leaves at least
      one other job's record, since a `clearAlerts` that empties the file
      removes it instead (Table A row 4).
- [ ] Each of the three holds on the **second** consecutive call as well: a
      writer that runs twice leaves the file `0600`, and a file already `0600`
      is still `0600` afterwards.
- [ ] `insecureEntries(paths)` reports none of these three files after its
      writer has run under `umask 000` — the writer and the policy now agree,
      which is the issue's root cause closed at the source.
- [ ] Behavior preserved: each writer's file contents, its return value, and its
      error propagation are unchanged; `appendAlert` and its compaction branch
      are untouched (Table A rows 2-3) and `clearAlerts` still deletes the file
      when no records remain.
- [ ] `src/core/private-fs.js` has **no code change** — only the two comment
      mirrors at `:20-22` and `:129-134` are edited, and both `:135-141` (the
      array literal) and `:143-148` are untouched.
- [ ] Idempotence: this WP ships no new command. The surface it writes outside
      the repo is the three state files, and the criterion above covers it —
      running a writer twice produces the same mode and the same contents for
      the same input.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "private-writer-modes"
npm test
npm run lint
```

Plus the **Table A gate** — it runs the three REAL writers under `umask 000` in
a throwaway core and asserts each file is `0600`, exiting non-zero and naming
every violation. The script goes through a quoted heredoc, not inline quotes, so
what it asserts cannot be changed by a quoting accident. Run it from the repo
root:

```bash
cat > /tmp/wd-private-writer-modes.js <<'LITERAL'
// Table A gate: run each private-listed file's REAL writer under umask 000 and
// assert the file it produces is 0600. Exits non-zero naming every violation.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = process.cwd();
const { getPaths } = require(R + '/src/core/paths');
process.umask(0o000);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-modes-'));
const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
require(R + '/src/scheduler/jobs').writeScheduleState(paths, 'dream', { last_status: 'ok' });
require(R + '/src/core/dream/watermarks').writeWatermarks(paths.state, { claude: 1, codex: 2 });
const A = require(R + '/src/core/alerts');
const rec = (job) => ({ job, at: '2026-01-01T00:00:00Z', reason: 'r', log_hint: 'h' });
A.appendAlert(paths, rec('a'));
A.appendAlert(paths, rec('b'));
A.clearAlerts(paths, 'a'); // leaves b's record → rewrites the file
const bad = [];
for (const f of ['schedule.json', 'watermarks.json', 'alerts.jsonl']) {
  const p = path.join(paths.state, f);
  const m = fs.statSync(p).mode & 0o777;
  if (m !== 0o600) bad.push(`${f} is ${m.toString(8).padStart(4, '0')}, expected 0600`);
}
if (bad.length) { console.error('FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('OK: schedule.json, watermarks.json, alerts.jsonl all 0600 under umask 000');
LITERAL
node /tmp/wd-private-writer-modes.js
```

- The gate is a NEW step and is an ASSERTION, not a number to eyeball. Its RED
  side is already observed: on HEAD `a6e0803` it exits **1** with
  `schedule.json is 0666` / `watermarks.json is 0666` / `alerts.jsonl is 0666`.
  Paste that red run alongside the green one from the finished branch, so a
  check that cannot fail is caught before anyone believes it.
- The gate deliberately calls `appendAlert` twice before `clearAlerts`: with one
  record, `clearAlerts` removes the file (`src/core/alerts.js:202-205`) and the
  `statSync` would throw rather than measure a mode.

## Out of scope (do NOT do these)

- **Table A rows 13-14** — the `config.yaml` and `install-manifest.json`
  writers. Their in-place shape does not drop the mode (justified under Table
  A), and the 2026-07-19 decision continues to hold for them.
- **The parent-directory mode.** The mode-less `mkdirSync` calls in
  `writeScheduleState` and `writeWatermarks` are named under Security checklist
  as a latent, production-unreachable residual. Fixing them is a different claim
  (the `0700` directory set, not the `0600` file set); note it under "Discovered
  issues" in the PR body if you want it filed.
- **Folding these writers onto `writeFilePrivate`**, or hardening any other
  mutating CLI entry point against an untrusted mechanics root. That is the
  cross-cutting follow-up WP that `src/core/private-fs.js:38-45` already names.
- Any change to the private set itself, to `insecureEntries`,
  `repairPrivateModes`, `scanPrivateModes`, or to doctor's/sync's/the digest's
  handling of them — the predicate is correct; it is the writers that were wrong.
- Removing the caller-less `writeWatermarks`, or any other dead-code cleanup.
- Fixing the stale ADR cross-references in `src/core/private-fs.js` (its
  never-follow comments cite "ADR-0027", which is
  `0027-scheduler-unload-rederived-not-stored.md`, not a never-follow ADR).
  Real, but a different claim — note it under "Discovered issues".

## Definition of done

0. **DISPATCH PRECONDITION.** This WP is not dispatched until the owner
   confirms that the dated 2026-07-19 decision — "the four metadata files enter
   the predicate/repair set while their writers stay unchanged" — is **lifted
   for `state/schedule.json` and `state/watermarks.json`**, on the ground that
   issue #168 measured its premise ("sync-time repair suffices") to be false for
   a file rewritten at every job run. The decision stays in force for
   `config.yaml` and `install-manifest.json` (Table A rows 13-14), whose writers
   this WP does not touch. No ADR is required: the decision lives in a `done`
   spec and a logbook entry, not in an ADR, so its narrowing is recorded the
   same way — in this spec and in the PR's logbook entry. `alerts.jsonl` (Table
   A row 4) was never covered by that decision and needs no waiver. The dispatch
   message records that the confirmation was observed.
1. All verification steps pass locally, including the Table A gate's green run
   and its red run; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(state): pin 0600 on the temp+rename private-state writers (WP-private-state-writers-mode-pin)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
