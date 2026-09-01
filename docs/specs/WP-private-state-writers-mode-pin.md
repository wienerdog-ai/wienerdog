---
id: WP-private-state-writers-mode-pin
title: Write every private-listed state file through the private writer, so no rewrite can loosen it
status: Draft
model: sonnet
size: S
depends_on: [WP-failloud-survives-state-write-failure]
adrs: [ADR-0004, ADR-0024]
epic: issue-168
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
at `:260`), and the injected digest carries an `insecureModes` count
(`src/cli/dream.js:643`, `src/cli/sync.js:289`).

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
inode's loose mode replaces the correct one. Three writers do exactly that.

The tree already has the right tool. `writeFilePrivate`
(`src/core/private-fs.js:280-371`) is the audited private-write primitive that 11
production call sites across 10 files already use: it creates a **crypto-random**
temp with `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW`, writes and `fchmod`s **through
that fd**, then renames. Because the mode is set on the descriptor rather than
requested at creation, it is umask-independent; because the temp name is random
and `O_EXCL`, no stale or symlinked temp can be written through; and because the
mode is fixed before the rename, the bytes are never observable at a loose mode.
This WP moves the three outliers onto it, so the private set has one writer
shape instead of four.

Scope is one claim over the **four** writers this WP changes: **each writes its
private-listed file through `writeFilePrivate`, so the result is `0600` under
any umask with no loose-mode window and no stale-or-symlinked temp to write
through.** It has two halves, because the writers fail differently:

- **Three mode-dropping writers** (`writeScheduleState`, `writeWatermarks`,
  `clearAlerts`) land the wrong mode today. Table C is their mode contract and
  its applicable states — two have both an absent and a present state,
  `clearAlerts` has only a present one — and the 10-cell gate measures exactly
  these three.
- **One temp-hazard writer** (`appendAlert`'s compaction branch) already lands
  `0600` but reaches it through a predictable temp that a symlink can hijack.
  Table D is its contract, including the rule that it must never throw.

The claim is deliberately about *those writers*, not about their files at large:
`alerts.jsonl`'s remaining append-create path is a named residual below.

**Dependency.** `writeFilePrivate` refuses anomalies the current writers wrote
through silently, so it can throw where they did not — and every one of
`runJob`'s state writes sits at an unguarded call site. On three failure paths a
throw escapes before the durable alert is written (a **pre-existing** defect); on
the success path at `:1060-1061` a refusal would abort *after* the job's work
ran, leaving no record and — because `last_success` is the catch-up replay guard
(`:1244-1245`, measured) — letting the job be replayed. Both are fixed by
`WP-failloud-survives-state-write-failure`, which covers all five sites and is
this WP's `depends_on`. Do not start this WP until that one is `Done`.

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

**Measured behavior.** Running the three mode-dropping writers under `umask 000`
against a temp core (the Table C gate under Verification steps) on HEAD:

```text
alerts.jsonl after appendAlert : 0600
schedule.json     -> 0666
watermarks.json   -> 0666
alerts.jsonl      -> 0666
```

The `0666` measured here and the `0644` issue #168 reports are the **same defect
at two umasks**, not a discrepancy: the temp file is created at the process
default `0666 & ~umask`, so the reporter's default `umask 022` yields `0644`
while this gate runs under `umask 000` to show the raw `0666`. Both were
reproduced — running `writeScheduleState` under `umask 022` yields exactly the
`0644` the issue reports.

**Why a mode argument alone is not the fix.** `fs.writeFileSync(tmp, body,
{ mode: 0o600 })` is masked by umask and ignored entirely when the path already
exists. Measured:

```text
writeFileSync {mode:0600} under umask 0777 -> 0000     (mode is masked)
stale temp starts at 0666
after writeFileSync {mode:0600} onto it    -> 0666     (mode ignored; private bytes on disk at 0666)
symlinked temp -> the OUTSIDE target received the bytes, mode 0666
```

The last line is the sharpest: the current writers build a **predictable** temp
name (`${file}.${process.pid}.tmp`), and `writeFileSync` follows a symlink at
that name, writing the private body outside the core. `writeFilePrivate`'s
random `O_EXCL|O_NOFOLLOW` temp closes all three cases at once, which is why
this WP adopts the primitive instead of adding a `chmod`.

**The audit.** Table A enumerates every writer of every private-listed `0600`
file, classifies it, and — per the round-1 finding — states which
destination states each row was measured in. Three writers are mode-dropping;
every other writer of a private-listed file already lands `0600`.

**One measured caveat, carried into Table A.** `writeWatermarks` has **no
production caller** on HEAD — `src/core/dream/ledger.js:11` imports only
`readWatermarks` (for the one-time ledger migration at `:153`), and the sole
callers of `writeWatermarks` are `tests/unit/dream-collect.test.js` and
`tests/unit/ledger.test.js`. It is fixed here because it is a mode-dropping
writer of a private-listed file and the fix is a one-line swap, not because it is
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
| modify | src/scheduler/jobs.js | `writeScheduleState` only — replace the hand-rolled temp+rename at lines 236-239 per Table B; thread `{ core: paths.core }` |
| modify | src/core/dream/watermarks.js | `writeWatermarks` only — replace lines 37-40 per Table B; no core to thread (Table B's no-override row) |
| modify | src/core/alerts.js | two functions: (a) `clearAlerts` — replace lines 206-208 per Table B, thread `{ core: paths.core }`; (b) `appendAlert`'s **compaction branch** — replace lines 117-120 per Table D (migrate + local try/catch, must not throw). Do NOT touch the atomic append at `:89-90`, the empty-read guard at `:105`, the compaction trigger at `:106`, or `chmodAlerts` itself |
| modify | src/core/private-fs.js | **comment text only, zero code change** — correct the two now-false mirrors of the 2026-07-19 decision at lines 20-22 and 129-134 (the `A9_PRIVATE_STATE_FILES` JSDoc) so they no longer claim these writers are unchanged. The array literal it documents, lines 135-141, is CODE and is NOT edited — its membership is correct and 3 of its 5 entries were never part of that decision. The `A9_PRIVATE_CORE_FILES` comment at lines 143-148 also stays TRUE and is NOT edited (config.yaml / install-manifest.json writers really are unchanged here) |
| create | tests/unit/private-writer-modes.test.js | cover the acceptance criteria below; the implementer designs the cases |

### Exact contracts

No exported signature changes. `writeScheduleState(paths, name, patch)`,
`writeWatermarks(stateDir, {claude, codex})` and `clearAlerts(paths, job)` keep
their parameters, return values, file contents and atomicity. Two observable
changes: the POSIX mode of the file each leaves on disk (Table C), and the
anomaly refusals `writeFilePrivate` adds (Table B).

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** the writers gain `writeFilePrivate`'s
refusal behavior; **(v)** the writers emit the mode but `private-fs.js` owns the
policy that judges it — the authority split *is* the bug; and **(vi)/(vii)**
three surfaces (doctor, sync, digest) consume that one predicate, and the same
per-writer facts appear in the audit, the Deliverables cells, the acceptance
criteria and the verification gate.

### Table A — every writer of a private-listed `0600` file (measured on HEAD a6e0803)

"Shape" is what determines the mode: *in-place* preserves an existing file's
mode, *temp+rename* replaces the inode and carries the temp's mode. "States
measured" records which destination states the row was checked in — **absent**
(the writer creates the file) and **present** (it replaces an existing one),
because a writer can be correct in one and wrong in the other.

| # | Private-listed file | Writer (file:line) | Shape | States measured | Mode it leaves | This WP |
|---|---------------------|--------------------|-------|-----------------|----------------|---------|
| 1 | `state/digest.md` | `src/cli/sync.js:293`, `src/cli/dream.js:646` | `writeFilePrivate` | absent + present | 0600 | unchanged |
| 2 | `state/alerts.jsonl` | `src/core/alerts.js:89-90` (`appendAlert` append) | append, then `chmodAlerts` | absent + present | 0600 **final**; on **absent** the create is `0666` until `:90` runs — see the named residual below | unchanged |
| 3 | `state/alerts.jsonl` | `src/core/alerts.js:117-120` (`appendAlert` compaction) | **predictable** temp `${file}.${pid}.tmp`, `{mode:0600}` + rename + `chmodAlerts` | present (compaction implies the file exists) | 0600 **final**, but it carries the SAME stale-temp and symlink write-through hazards this spec establishes | **FIX (Table B + Table D)** — migrated inside a local try/catch so it cannot throw |
| 4 | `state/alerts.jsonl` | `src/core/alerts.js:206-208` (`clearAlerts`) | temp+rename, **no mode, no chmod** | **present only** — the rewrite branch needs surviving records, and an empty result deletes the file (`:202-205`) instead of writing one, so this writer has no mode-producing absent state | **0666** | **FIX (Table B)** |
| 5 | `state/alerts-ack.json` | `src/core/alert-ack.js:88,113` | `writeFilePrivate` | absent + present | 0600 | unchanged |
| 6 | `state/transcript-ledger.json` | `src/core/dream/ledger.js:131-134` | temp `{mode:0600}` + chmod + rename + chmod | absent + present | 0600 | unchanged |
| 7 | `state/identity-approvals.json` | `src/core/identity-approvals.js:98-102` | temp `{mode:0600}` + chmod + rename + chmod | absent + present | 0600 | unchanged |
| 8 | `state/broker-grants.json` | `src/gws/broker/grant-store.js:168` | `writeFilePrivate` | absent + present | 0600 | unchanged |
| 9 | `state/exec-pins.json` | `src/core/exec-identity.js:410` | `writeFilePrivate` | absent + present | 0600 | unchanged |
| 10 | `state/run-evidence.jsonl` | `src/core/run-evidence.js:131` | `writeFilePrivate` | absent + present | 0600 | unchanged |
| 11 | `state/schedule.json` | `src/scheduler/jobs.js:238-239` (`writeScheduleState`) | temp+rename, **no mode** | absent + present | **0666** | **FIX (Table B)** |
| 12 | `state/watermarks.json` | `src/core/dream/watermarks.js:39-40` (`writeWatermarks`) | temp+rename, **no mode** | absent + present | **0666** | **FIX (Table B)** — no production caller; see Current state |
| 13 | `<core>/config.yaml` | `src/cli/init.js:158,168`, `src/cli/adopt.js:382`, `src/scheduler/jobs.js:164,180` | **in-place** `writeFileSync`, no temp | absent + present | present → preserves the existing mode; **absent → umask default (measured `0644` at umask 022)** | out of scope — see below |
| 14 | `<core>/install-manifest.json` | `src/core/manifest.js:687` (`save`) | **in-place** `writeFileSync`, no temp | absent + present | as row 13 | out of scope — see below |
| 15 | `logs/<job>/*.log` | `createLogStreamPrivate`, `src/core/private-fs.js:951-987` | `O_CREAT` 0600 + `fchmod` on the fd | absent + present | 0600 | unchanged |
| 16 | `state/dream-scratch/*.json` | `src/core/dream/scratch.js:215` | `writeFilePrivate` | absent (fresh scratch each run) | 0600 | unchanged |
| 17 | `state/quarantine/*`, `state/quarantine/redacted/*` | `src/core/dream/validate.js:667-669` (`quarantinePreserve`) | temp `{mode:0600}` + chmod + rename | absent (names are uniquified at `:662-665`) | 0600 | unchanged |
| 18 | `secrets/*` | `src/gws/client.js:139-142` (`writeSecretJson`) | temp `{mode:0600}` + chmod + rename + chmod | absent + present | 0600 | unchanged |
| 19 | `secrets/*.retired` | `src/gws/token-migration.js:36` | `renameSync` of an existing file | present | preserves its 0600 | unchanged |

**Why rows 13-14 are out of scope, and the narrowed claim.** Their writers are
in-place `writeFileSync` with no temp file, so on a **present** destination they
never replace the inode and never reset a correct mode — verified: an in-place
rewrite of a `0600` file under `umask 000` leaves it `0600`, where a temp+rename
leaves it `0666`. They are therefore not part of this WP's temp+rename claim.
But the round-1 review was right that "loose only if created loose at init" was
too strong: on an **absent** destination they mint the umask mode, and a
destination can go absent after init through partial recovery, corruption or
manual cleanup. Measured at `umask 022` — `config.yaml` recreated in place →
`0644`; `state/` recreated by a mode-less `mkdirSync` → `0755`. So the honest
claim is the narrower one: **this WP fixes the temp+rename writers; it does not
make every private-listed path creation-safe.** Deletion-recreation is a
**named accepted residual** — `wienerdog doctor` still reports it and
`wienerdog sync` still repairs it durably, because unlike `schedule.json`
nothing rewrites these at job end. Closing it belongs to the creation-path WP
named under Out of scope.

**Named residual, Table A row 2 — the append create window.** `appendAlert`
creates an absent `alerts.jsonl` with `fs.appendFileSync` (`:89`) at the umask
default and pins it with `chmodAlerts` only on the next line (`:90`) — measured
`0666` at the create under `umask 000`. Its *final* mode is correct, so it is
not a mode-dropping writer and is not fixed here, but the first alert's bytes
are briefly on disk at a loose mode. Closing it needs an `appendFilePrivate`
primitive that `private-fs.js` does not expose.

**Table A row 3 — the compaction rewrite, now fixed rather than routed.**
`appendAlert`'s compaction branch (`:117-120`) is a whole-file temp+rename
rewrite using the **predictable** name `${file}.${process.pid}.tmp`, so it
carries exactly the two hazards this spec measures under "Why a mode argument
alone is not the fix": a stale temp keeps its loose mode while the alert bodies
are written into it, and a symlink planted at that name receives those bodies
outside the core. Its *final* mode is 0600, which is why the round-1 audit
classified it correct — that classification was final-mode-only and is corrected
here.

**A previous round of this spec routed it to a follow-up on the ground that
migrating would add a throw at the unguarded `:840` caller. That reasoning was
wrong and is withdrawn.** `appendAlert` has already appended the new record
atomically (`:89`) *before* it reaches compaction, so compaction is pure
housekeeping over an already-durable record and its failure need not propagate
at all. Wrapping the migrated call in a local `try`/`catch` that retains the
uncompacted file and returns normally means nothing new throws — so `:840`'s
documented "WARN loudly + durably and PROCEED — no throw" contract
(`:827-831`) is preserved unchanged, and `failLoud`'s caller at `:615` keeps its
existing best-effort behavior. The hazard closes inside the frozen surface, with
no `appendFilePrivate` primitive and no new guard at `:840`. Table D is the
contract.

What remains a residual is only the **create** window on an *absent*
`alerts.jsonl` (Table A row 2), which is the append itself and does need a
primitive `private-fs.js` does not expose.

### Table B — the private write primitive

The three fixed writers stop hand-rolling temp+rename and call the audited
primitive instead. It is not new: 11 production call sites across 10 files
already use it (`cli/dream.js:646`, `cli/sync.js:293`, `core/alert-ack.js:88`
and `:113`, `core/dream/scratch.js:215`, `core/exec-identity.js:410`,
`core/routine-runtime.js:117`, `core/run-evidence.js:131`,
`core/runtime-settings.js:72`, `gws/broker/grant-store.js:168`,
`scheduler/descriptor.js:296`).

| Fact / rule | Value |
|-------------|-------|
| Call | `writeFilePrivate(dest, data, opts)` — `src/core/private-fs.js:280` |
| Why not `{mode:0o600}` + `chmod` | the create mode is umask-masked (measured `0000` under `umask 0777`) and is **ignored on an existing path**, so a stale temp keeps its loose mode while private bytes are written into it; and a symlink at the predictable temp name is followed out of the core (both measured, Current state) |
| How it avoids all three | crypto-random temp name + `O_WRONLY\|O_CREAT\|O_EXCL\|O_NOFOLLOW`, so a pre-existing file or symlink at the temp name cannot be written through; `fchmod(fd, 0o600)` on the descriptor, so the mode is umask-independent and fixed **before** the rename |
| Core threading | pass `{ core: paths.core }` where the writer has `paths` (`writeScheduleState`, `clearAlerts`) so the ancestry check uses the caller's verified core |
| No-override case | `writeWatermarks(stateDir, …)` has no `paths`; call it without `opts` and `assertInCoreAncestry` resolves the core via `getPaths()` (`:193-196`). Verified: writing to a state dir outside the resolved core is out of that guard's scope and proceeds, so the existing `stateDir`-based callers keep working |
| Added refusals (the behavior change) | a pre-existing symlink or non-regular file at `dest` (F16, `:297-303`); a symlinked in-core ancestor or a symlink/non-dir at the parent (`mkdirPrivate`); a post-rename inode mismatch (F10, `:358-366`). Each throws `WienerdogError` instead of silently writing through — fail-closed, and the reason this WP depends on `WP-failloud-survives-state-write-failure`. A symlinked **leaf** is not caught by the `mechanicsRootUntrusted` entry gate, which classifies directories only (`:1001-1007`, measured), so these refusals are reachable on the success path as well as the failure paths — which is why that dependency covers all five sites |
| Directory creation | `writeFilePrivate` calls `mkdirPrivate` itself, so the writers' own `fs.mkdirSync` calls are removed rather than kept alongside |
| What must NOT change | the JSON/JSONL body bytes, the trailing newline, the return values, the read paths, and the `remaining.length === 0` delete branch in `clearAlerts` (`:202-205`) |
| win32 | `writeFilePrivate` keeps a plain `{mode:0o600}` temp+rename there (`:283-288`), matching `private-fs.js`'s stated POSIX-only posture (`:23-25`); no platform branch is added at the call sites |

### Table C — the mode contract every fixed writer must satisfy

| Fact / rule | Value |
|-------------|-------|
| Mode | exactly `0600` — `(mode & 0o777) === 0o600`, not "at most 0600" |
| Umasks | verified under **both** `umask 000` (catches a mode-less create → `0666`) **and** `umask 0777` (catches a create-mode-only fix → `0000`). One umask alone cannot distinguish the required fix from an incomplete one |
| Destination states | **applicable** states only: `writeScheduleState` and `writeWatermarks` are verified **absent** (the writer creates) and **present** (it replaces); `clearAlerts` is **present-only** (Table A row 4 — its rewrite branch needs surviving records, and an empty result deletes the file instead of writing one) |
| Applicable-cell count | **10**: (2 writers × 2 umasks × 2 states) + (1 writer × 2 umasks × 1 state). Plus 2 predicate checks, one per umask. There is no 12th and 11th cell to run — an absent-destination `clearAlerts` cell does not exist, and the gate must not claim one |
| Loose-mode window | none **for the four writers this WP changes**: the mode is set on the descriptor before the rename publishes the inode, so those destinations are never observable at a mode other than `0600`. This claim is scoped to Table A rows 3, 4, 11 and 12 — it does NOT extend to `alerts.jsonl` at large, whose **append-create** path (row 2) is still the named residual |
| Repeat runs | a second consecutive call leaves the same `0600` and the same contents for the same input |
| Predicate agreement | `insecureEntries(paths)` reports none of the three files after its writer has run under either umask |
| umask discipline | any check that changes the process umask restores it in a `finally` — it is process-global and leaks into later tests |

### Table D — the compaction migration (Table A row 3)

| Fact / rule | Value |
|-------------|-------|
| Change | `src/core/alerts.js:117-120` — replace the predictable-temp `writeFileSync`/`renameSync`/`chmodAlerts` sequence with `writeFilePrivate(file, text)`, wrapped in a **local `try`/`catch`** |
| Must not throw | compaction failure never propagates out of `appendAlert`. On catch: keep the uncompacted file exactly as the atomic append at `:89` left it, emit one non-alert diagnostic, and return normally |
| Why that is safe | the new record is already durably appended at `:89` before compaction runs; compaction only trims. Retaining an uncompacted file is strictly better than losing the record, and the file stays over-budget until the next successful compaction |
| Caller contracts preserved | `:840`'s "WARN loudly + durably and PROCEED — no throw" (`:827-831`) is unchanged, and `failLoud`'s `:615` call keeps its existing best-effort behavior. This WP adds **no** guard at `:840` and needs none |
| Observable on a symlinked `alerts.jsonl` | compaction refuses; the outside target is byte-identical and its mode unchanged; the just-appended record is still present through the link; the caller proceeds normally; exactly one non-alert diagnostic |
| Observable on a stale predictable temp | a file left at `${file}.${process.pid}.tmp` has no effect on the result — the primitive's temp name is crypto-random |
| Not changed | the compaction trigger conditions (`:106`), the `MAX_ALERTS`/`MAX_FILE_BYTES` budgets, the serialization at `:109`, the empty-read guard at `:105`, the append at `:89-90`, and `chmodAlerts` itself (still used by the append path) |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Tables A/B/C — a finding updates the table and
every surface below in one pass:

- [ ] Deliverables-table cells (the three writer rows cite Table B; the
      `private-fs.js` row cites the two comment mirrors)
- [ ] Acceptance criteria that assert Table C's facts and Table A's rows
- [ ] The Table C verification gate under Verification steps
- [ ] Current-state (the measured probe output, the mode-argument measurements,
      the three mechanism citations, and the `writeWatermarks` caveat)
- [ ] The out-of-scope justification for Table A rows 13-14, and the **three**
      named residuals (row 2's create window; deletion-recreation; the parent
      directory) — the count appears in the Security checklist, the residual
      prose and Out of scope, and the three move together. Row 3 is a FIX
      (Table D), not a residual, on every surface
- [ ] The **applicable-cell count (10)** — it appears in Table C's two rows, the
      acceptance criteria, the gate script's comment header, its `cells !== 10`
      assertion and its success message; all five must agree. The count covers
      the three mode-dropping writers only; Table D's compaction observables are
      not mode cells and must not inflate it
- [ ] The **writer count** — "four writers changed" (Context, Security
      containment) versus "three mode-dropping writers" (Table C, the gate,
      the mode acceptance criterion). Both appear deliberately; a change to
      either set must keep the two consistent
- [ ] The **scoped** no-loose-window claim — Table C, the Security checklist and
      the Context claim sentence each bound it to the three changed writers, NOT
      to `alerts.jsonl` at large
- [ ] Implementation notes: the umask/fixture trap and the core-threading rule
- [ ] The `depends_on` on `WP-failloud-survives-state-write-failure`, its
      Context paragraph, and Table B's added-refusals row — the dependency
      exists because of that row and the three move together
- [ ] **`src/core/private-fs.js:20-22` and `:129-134`** — prose in the product
      tree asserting these writers are unchanged. It goes false the moment the
      code changes, so it moves in the same PR (it is a Deliverable for exactly
      this reason). Neither `:135-141` (the array literal `:129-134` documents,
      whose membership stays correct) nor `:143-148` is a mirror of a changed
      fact; both stay

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- Each of the three edits is a **replacement, not an addition**: delete the
  writer's `mkdirSync` + temp construction + `writeFileSync` + `renameSync` and
  call `writeFilePrivate` in their place. Leaving the old temp logic beside the
  new call would keep the stale-temp hazard the swap exists to remove.
- Do not add a `chmod` after `writeFilePrivate` — the `fchmod` already ran on the
  descriptor, and a path-based `chmod` afterwards would reintroduce a
  path-following call the primitive deliberately avoids.
- **Known trap (cost me a failed measurement).** `fs.mkdtempSync` creates its
  directory with mode `0700`, which under `umask 0777` becomes `0000` — the
  fixture locks the test out of its own tree with `EACCES` before the writer is
  ever called. Create every fixture directory **before** lowering the umask, and
  restore the umask in a `finally`.
- `writeFilePrivate` is imported as
  `const { writeFilePrivate } = require('../core/private-fs')` — mind the
  relative depth from each of the three files.
- `clearAlerts` keeps its early `rmSync` branch when no records remain
  (`:202-205`); only the rewrite branch changes.
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
      machine a `0644` file is readable by every local account.
- [ ] Containment, and its exact reach: for the four writers this WP changes,
      the destination is never observable at a loose mode (Table C) and the
      private bytes can no longer be written into a stale or symlinked temp —
      both hazards measured on the current shape and both closed by
      `writeFilePrivate`'s `O_EXCL|O_NOFOLLOW` random temp and pre-rename
      `fchmod`. Migrating the compaction branch (Table D) closes a measured
      **exfiltration** path specifically: a symlink planted at the predictable
      temp name received the alert bodies outside the mechanics root. The claim
      reaches those four writers only — **not** `alerts.jsonl` at large, whose
      append-create path is residual (1).
- [ ] Three residuals, all named and none silently fixed: (1) `appendAlert`'s
      absent-destination **create** window (Table A row 2), which needs an
      `appendFilePrivate` this tree does not have — note that the compaction
      hazard formerly listed beside it is now FIXED by Table D, not routed;
      (2) deletion-recreation
      of the in-place-written files and of `state/` itself (Table A rows 13-14),
      which doctor reports and sync repairs durably; (3) the parent directory —
      `state/` is created `0700` by `src/cli/init.js:135` before any job runs,
      and `writeFilePrivate`'s `mkdirPrivate` now creates it `0700` rather than
      at the umask default, which narrows but does not own the directory claim.

## Acceptance criteria

- [ ] Each of the three **mode-dropping** writers (Table A rows 4, 11, 12 — the
      compaction branch is covered by Table D instead, its mode already being
      correct) leaves its file at exactly `0600` under **both**
      `umask 000` and `umask 0777`, across all **10 applicable** destination-state
      cells (Table C: absent + present for `writeScheduleState` and
      `writeWatermarks`; present-only for `clearAlerts`). A change that only
      passes `{ mode: 0o600 }` at create fails the `0777` case, and this must be
      true of the delivered tests too.
- [ ] `clearAlerts` on a destination that ends up absent still takes its delete
      branch (`:202-205`) and writes no file — the behavior that makes its
      absent cell inapplicable rather than untested.
- [ ] `state/schedule.json`, `state/watermarks.json` and `state/alerts.jsonl`
      each satisfy the above via `writeScheduleState`, `writeWatermarks` and a
      `clearAlerts` call that rewrites the file — i.e. one leaving at least one
      other job's record, since a `clearAlerts` that empties the file removes it
      instead (Table A row 4).
- [ ] A stale file left at the old predictable temp path
      (`${file}.${process.pid}.tmp`) does not affect the result, and no private
      body is ever written through a symlink at a temp path.
- [ ] A pre-existing symlink at one of the three destinations is refused rather
      than written through, and the symlink's target is left untouched.
- [ ] Each of the three holds on the **second** consecutive call: same `0600`,
      same contents for the same input (Table C repeat-runs row).
- [ ] `insecureEntries(paths)` reports none of these three files after its
      writer has run under either umask — the writer and the policy now agree,
      which is the issue's root cause closed at the source.
- [ ] Behavior preserved: each writer's file contents and return value are
      unchanged; `appendAlert`'s atomic append at `:89-90` is untouched (Table A
      row 2); `clearAlerts` still deletes the file when no records remain.
- [ ] **Table D:** compaction never throws. With `alerts.jsonl` a symlink, an
      `appendAlert` call that triggers compaction leaves the outside target
      byte-identical and its mode unchanged, keeps the just-appended record,
      returns normally to its caller, and emits exactly one non-alert
      diagnostic. A stale file at `${file}.${process.pid}.tmp` changes nothing.
- [ ] The `:840` managed-policy warning path still proceeds — a job whose
      `appendAlert` warning hits a refusing compaction is not aborted, and
      `src/cli/run-job.js` is not edited by this WP at all.
- [ ] `src/core/private-fs.js` has **no code change** — only the two comment
      mirrors at `:20-22` and `:129-134` are edited, and both `:135-141` (the
      array literal) and `:143-148` are untouched.
- [ ] Idempotence: this WP ships no new command. The surface it writes outside
      the repo is the three state files, and the repeat-run criterion covers it.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "private-writer-modes"
npm test
npm run lint
```

Plus the **Table C gate** — it runs the three REAL writers under both umasks and
both destination states, and asserts each file is exactly `0600`, exiting
non-zero and naming every violation. The script goes through a quoted heredoc,
not inline quotes, so what it asserts cannot be changed by a quoting accident.
Run it from the repo root:

```bash
cat > /tmp/wd-private-writer-modes.js <<'LITERAL'
// Table C gate: run each private-listed file's REAL writer under umask 000 AND
// umask 0777, across the 10 APPLICABLE destination-state cells, and assert
// exactly 0600. Exits non-zero naming every violation.
//   schedule.json  : 2 umasks x {absent, present} = 4
//   watermarks.json: 2 umasks x {absent, present} = 4
//   alerts.jsonl   : 2 umasks x {present}         = 2   <- clearAlerts has no
//     mode-producing absent state: its rewrite branch needs surviving records,
//     and an empty result deletes the file (alerts.js:202-205). The delete
//     branch is asserted separately rather than counted as a mode cell.
// Fixtures are created BEFORE the umask is lowered: mkdtempSync uses mode 0700,
// which under umask 0777 would be 0000 and lock the probe out with EACCES.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = process.cwd();
const { getPaths } = require(R + '/src/core/paths');
const { insecureEntries } = require(R + '/src/core/private-fs');
const prevUmask = process.umask();
const bad = [];
let cells = 0; // applicable mode cells actually asserted
try {
  for (const um of [0o000, 0o777]) {
    process.umask(0o022);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-modes-'));
    const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
    const jobs = require(R + '/src/scheduler/jobs');
    const wm = require(R + '/src/core/dream/watermarks');
    const A = require(R + '/src/core/alerts');
    const rec = (job) => ({ job, at: '2026-01-01T00:00:00Z', reason: 'r', log_hint: 'h' });
    process.umask(um);
    const tag = um.toString(8).padStart(4, '0');
    const check = (f, state) => {
      cells += 1;
      const p = path.join(paths.state, f);
      const m = fs.statSync(p).mode & 0o777;
      if (m !== 0o600) bad.push(`umask ${tag} ${state}: ${f} is ${m.toString(8).padStart(4, '0')}, expected 0600`);
    };
    jobs.writeScheduleState(paths, 'dream', { last_status: 'ok' });   // absent
    check('schedule.json', 'absent');
    jobs.writeScheduleState(paths, 'dream', { last_status: 'ok' });   // present
    check('schedule.json', 'present');
    wm.writeWatermarks(paths.state, { claude: 1, codex: 2 });
    check('watermarks.json', 'absent');
    wm.writeWatermarks(paths.state, { claude: 3, codex: 4 });
    check('watermarks.json', 'present');
    A.appendAlert(paths, rec('a'));
    A.appendAlert(paths, rec('b'));
    A.clearAlerts(paths, 'a'); // leaves b's record -> rewrites the file (present)
    check('alerts.jsonl', 'present');
    const flagged = insecureEntries(paths).filter((p) =>
      ['schedule.json', 'watermarks.json', 'alerts.jsonl'].includes(path.basename(p)));
    if (flagged.length) bad.push(`umask ${tag}: insecureEntries still flags ${flagged.join(', ')}`);
    // clearAlerts' inapplicable absent cell, asserted as the delete branch it
    // actually takes (alerts.js:202-205) rather than counted as a mode cell.
    A.clearAlerts(paths, 'b');
    if (fs.existsSync(path.join(paths.state, 'alerts.jsonl')))
      bad.push(`umask ${tag}: clearAlerts left alerts.jsonl in place when no records remained`);
  }
} finally { process.umask(prevUmask); }
if (cells !== 10) bad.push(`asserted ${cells} mode cells, expected the 10 applicable ones`);
if (bad.length) { console.error('FAIL:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('OK: 10/10 applicable mode cells exactly 0600 (umask 000 + 0777; absent+present for');
console.log('    schedule.json and watermarks.json, present-only for alerts.jsonl), predicate clean,');
console.log('    and clearAlerts deletes the file when no records remain.');
LITERAL
node /tmp/wd-private-writer-modes.js
```

- The gate is a NEW step and is an ASSERTION, not a number to eyeball. Its RED
  side is already observed: on HEAD `a6e0803` the earlier single-umask form
  exits **1** with `schedule.json is 0666` / `watermarks.json is 0666` /
  `alerts.jsonl is 0666`. Paste a red run AND the green run from the finished
  branch. Also paste a red run from a deliberately incomplete fix — a writer
  changed to pass only `{ mode: 0o600 }` — which must fail the `umask 0777`
  case at `0000`; that is the case a single-umask gate could not see.
- The gate deliberately calls `appendAlert` twice before `clearAlerts`: with one
  record, `clearAlerts` removes the file (`src/core/alerts.js:202-205`) and the
  `statSync` would throw rather than measure a mode.

## Out of scope (do NOT do these)

- **Table A rows 13-14** — the `config.yaml` and `install-manifest.json`
  writers, and the creation-path/deletion-recreation residual generally
  (justified under Table A). A WP that pins modes on every *creation* path —
  those two files, `state/` itself, and the mode-less `mkdirSync` calls — is
  separate work; note it under "Discovered issues".
- **`appendAlert`'s absent-destination create window** (Table A row 2) — the
  `appendFileSync` at `:89` that creates a missing `alerts.jsonl` at the umask
  default before `chmodAlerts` pins it. Closing it needs an `appendFilePrivate`
  primitive `private-fs.js` does not expose; note the follow-up under
  "Discovered issues". The compaction branch is NOT part of this residual any
  more — Table D fixes it here.
- **Adding any guard at the `:840` caller.** Table D's local try/catch means
  compaction cannot throw, so `:840` needs no change and must not get one.
- **The failure-path alert sequencing** — that is
  `WP-failloud-survives-state-write-failure`, this WP's `depends_on`, and its
  call sites are not touched here.
- Hardening any other mutating CLI entry point against an untrusted mechanics
  root — the cross-cutting follow-up `src/core/private-fs.js:38-45` already names.
- Any change to the private set itself, to `insecureEntries`,
  `repairPrivateModes`, `scanPrivateModes`, or to doctor's/sync's/the digest's
  handling of them — the predicate is correct; it is the writers that were wrong.
- Removing the caller-less `writeWatermarks`, or any other dead-code cleanup.
- Fixing the stale ADR cross-references in `src/core/private-fs.js` (its
  never-follow comments cite "ADR-0027", which is
  `0027-scheduler-unload-rederived-not-stored.md`, not a never-follow ADR).
  Real, but a different claim — note it under "Discovered issues".

## Definition of done

0. **DISPATCH PRECONDITIONS.** (a) `WP-failloud-survives-state-write-failure` is
   `Done` — until then, `writeFilePrivate`'s added refusals (Table B) can throw
   at an unguarded failure-path call site and suppress a durable alert. (b) The
   owner confirms that the dated 2026-07-19 decision — "the four metadata files
   enter the predicate/repair set while their writers stay unchanged" — is
   **lifted for `state/schedule.json` and `state/watermarks.json`**, on the
   ground that issue #168 measured its premise ("sync-time repair suffices") to
   be false for a file rewritten at every job run. The decision stays in force
   for `config.yaml` and `install-manifest.json` (Table A rows 13-14), whose
   writers this WP does not touch. No ADR is required: the decision lives in a
   `done` spec and a logbook entry, not in an ADR, so its narrowing is recorded
   the same way — in this spec and in the PR's logbook entry. `alerts.jsonl`
   (Table A row 4) was never covered by that decision and needs no waiver. The
   dispatch message records that both preconditions were observed.
1. All verification steps pass locally, including the Table C gate's green run,
   a red run on the unfixed state, and a red run on a mode-argument-only fix;
   output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(state): write the private state files through writeFilePrivate (WP-private-state-writers-mode-pin)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
