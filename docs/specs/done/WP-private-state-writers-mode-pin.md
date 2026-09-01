---
id: WP-private-state-writers-mode-pin
title: Write every private-listed state file through the private writer, so no rewrite can loosen it
status: Done
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

**A dated owner decision stood against two of the three fixes, and has been
lifted.** `WP-a9-private-modes-repair` recorded a Codex round-1 owner decision
of 2026-07-19
(`docs/specs/done/WP-a9-private-modes-repair.md:149-156` and `:885-887`;
`docs/specs/logbook/2026-07-19-codex-round-1-a9-a10-spec-review.md:49-53`): the
four metadata files `config.yaml` / `install-manifest.json` / `schedule.json` /
`watermarks.json` enter the predicate/repair set **while their writers stay
unchanged**, on the stated basis that "fresh-write privacy relies on the 0700
parent dirs + sync-time repair (dated accepted residual)". Issue #168 is the
field falsification of that residual's premise for `schedule.json`: sync-time
repair cannot hold a file that a scheduled job rewrites nightly.

> **DATED OWNER DECISION 2026-09-01 — the 2026-07-19 waiver is lifted for this
> WP family.** In the working session of 2026-09-01 the owner ruled, in his own
> words, "#168's waiver is hereby lifted", and instructed the agent to record
> the ruling here. It lifts the repair-only constraint for the
> **`state/schedule.json` and `state/watermarks.json` writers only**, which is
> exactly what this WP changes. The 2026-07-19 decision **stays in force** for
> `config.yaml` and `install-manifest.json` (Table A rows 13-14), whose writers
> this WP does not touch. The residual set named through the design-gate rounds
> was presented to the owner in the same session and merge-authorized with it.
>
> *Provenance (ADR-0035 discipline):* this paragraph is an **agent-written
> record of a verbal in-session ruling**, not an owner signature. No agent wrote
> or may write a signature line; where this repo requires a hand-written owner
> signature, that remains the owner's own act and none is claimed here.

`alerts.jsonl` was never covered by that decision and needed no waiver.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js:44-54: this
     spec file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/jobs.js | `writeScheduleState` only — replace the hand-rolled temp+rename at lines 236-239 per Table B; thread `{ core: paths.core }` |
| modify | src/core/dream/watermarks.js | `writeWatermarks` only — replace lines 37-40 per Table B; no core to thread (Table B's no-override row) |
| modify | src/core/alerts.js | two functions: (a) `clearAlerts` — replace lines 206-208 per Table B, thread `{ core: paths.core }`; (b) `appendAlert`'s **compaction branch** — replace lines 117-120 per Table D (migrate + local try/catch, must not throw). Do NOT touch the atomic append at `:89-90`, the empty-read guard at `:105`, the compaction trigger at `:106`, or `chmodAlerts` itself |
| modify | src/core/private-fs.js | **comment text PLUS one tagged throw** (this row was "comment-only" in earlier rounds; it is not any more). (a) Correct the two now-false mirrors of the 2026-07-19 decision at lines 20-22 and 129-134 (the `A9_PRIVATE_STATE_FILES` JSDoc) so they no longer claim these writers are unchanged. The array literal it documents, lines 135-141, is CODE and is NOT edited — its membership is correct and 3 of its 5 entries were never part of that decision. The `A9_PRIVATE_CORE_FILES` comment at lines 143-148 also stays TRUE and is NOT edited. (b) Add `code = 'WD_F10_POST_RENAME'` to the single throw at lines 361-365, per Table D2 — the ONLY code change permitted in this file |
| create | tests/unit/private-writer-modes.test.js | cover the acceptance criteria below; the implementer designs the cases |
| modify | tests/unit/scheduler-runjob.test.js | **ONLY the `:2661` fixture**, whose failure-injection technique — a directory pre-created at the predictable temp path `${alertsFile}.${process.pid}.tmp` (`:2674`) — this WP's own fix retires, so it no longer intercepts anything and `clearAlerts` succeeds. Replace it with a post-mode-pin refusal trigger (e.g. symlink `alertsFile` itself, per the `:2739` sibling). **No other change to the file** — see "A test that the fix retired" below |

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
atomically (`:89`) *before* it reaches compaction, so compaction is housekeeping
that runs after the durable write and its failure need not propagate at all.
Wrapping the migrated call in a local `try`/`catch` that returns rather than
throws means nothing new propagates — so `:840`'s documented "WARN loudly +
durably and PROCEED — no throw" contract (`:827-831`) is preserved unchanged,
and `failLoud`'s caller at `:615` keeps its existing best-effort behavior. The
hazard closes inside the frozen surface, with no `appendFilePrivate` primitive
and no new guard at `:840`.

**Not propagating is not the same as nothing being lost.** Most refusals happen
before the rename and leave the appended record untouched, but the post-rename
F10 case installs a substituted entry over `alerts.jsonl` and destroys it. A
catch that swallowed both identically would let `failLoud` report the alert as
persisted and let `run-job.js:1106-1107` delete the reap breadcrumb. Table D
therefore splits the two cases and gives the second one a return-value signal.

**Three residuals remain on `alerts.jsonl`, all owned by the same follow-up**
(*move `appendAlert`'s own append onto a never-follow private append
primitive*), because all three live in the append at `:89-90`, not in
compaction:

1. **The create window** (Table A row 2): an absent `alerts.jsonl` is created by
   `appendFileSync` at the umask default and pinned only on the next line —
   measured `0666` at the create under `umask 000`.
2. **The destination-symlink append** (new, round-4): when `alerts.jsonl` is
   itself a symlink, `appendFileSync` writes the record through it and
   `chmodAlerts` chmods the outside target — both measured on HEAD. This is
   **pre-existing** behavior that neither this WP nor Table D changes, and no
   claim is made that it is contained. A leaf symlink is not caught by
   `mechanicsRootUntrusted` (directories only), so nothing upstream stops it.
3. **Unbounded growth under persistent compaction refusal** (new, round-4):
   `alerts.js`'s `MAX_ALERTS` / `MAX_FILE_BYTES` are a hard bound **only while
   compaction can run**. A directory that permits appending to an existing
   `alerts.jsonl` but denies creating the private temp — or any persistent
   ancestry/destination refusal — makes every append succeed and every
   compaction fail, so the file grows without bound. Operator visibility is the
   repeated per-failure diagnostic and nothing else: **measured, `wienerdog
   doctor` never inspects `alerts.jsonl` at all** (zero references in
   `src/cli/doctor.js`; its only size check is the `MAX_INSPECT_BYTES` ceiling
   on `<claudeDir>/CLAUDE.md` and `<codexDir>/AGENTS.md` at `:300-328`), and
   `readAlerts` byte-bounds its read to a tail window, so the digest shows no
   growth either. Recovery is manual: repair whatever refuses the temp
   creation, or truncate/remove `state/alerts.jsonl`. Bounding this is the
   follow-up's job, not this WP's.

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
| Core threading | pass `{ core: paths.core }` where the writer has `paths` (`writeScheduleState`, `clearAlerts`, and `appendAlert`'s compaction branch — Table D) so the ancestry check uses the caller's verified core. This row governs **every** `writeFilePrivate` call this WP adds; Table D's Change cell shows the same argument rather than a different instruction |
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
| Change | `src/core/alerts.js:117-120` — replace the predictable-temp `writeFileSync`/`renameSync`/`chmodAlerts` sequence with `writeFilePrivate(file, text, { core: paths.core })`, wrapped in a **local `try`/`catch`**. The `core` is threaded per Table B's core-threading row: `appendAlert` has `paths`, so it passes it like the other two `paths`-carrying writers |
| Must not throw | compaction failure never propagates out of `appendAlert` — in **either** case below. On catch: emit one non-alert diagnostic and return. Refusals split into two cases with **different durability outcomes**, and the return value distinguishes them |
| **Case 1 — PRE-rename refusal** (temp creation/write/`fchmod`, symlinked ancestor, symlinked dest) | nothing was installed. `alerts.jsonl` is untouched and still holds the record appended at `:89`. The record **is** durable; `appendAlert` returns as it does on success |
| **Case 2 — POST-rename F10 integrity failure** (`private-fs.js:358-366`) | the `renameSync` at `:354` **already completed**, and what it installed is the entry a concurrent process substituted — not the file we wrote. So the compacted content is NOT at `dest` (its inode was unlinked), **and** the rename replaced the pre-compaction `alerts.jsonl` that held the `:89` record. **The record is LOST.** Make no claim about `dest`'s contents: they are whatever was installed. `appendAlert` must therefore signal **not-persisted** (next row) so no downstream consumer treats the alert as recorded |
| Size-bound consequence | while compaction keeps failing the file stays over budget and **keeps growing** — see the unbounded-growth residual below. This WP does not add a degraded-state policy |
| Caller contracts preserved | `:840`'s "WARN loudly + durably and PROCEED — no throw" (`:827-831`) is unchanged, and `failLoud`'s `:615` call keeps its existing best-effort behavior. This WP adds **no** guard at `:840` and needs none |
| **The hazard this closes (and its exact scope)** | the **predictable-TEMP-path** symlink. Observable: with a symlink planted at the old `${file}.${process.pid}.tmp` path and `alerts.jsonl` a **regular file**, compaction succeeds, the symlink's target is byte-identical and its mode unchanged, and `alerts.jsonl` holds the compacted content at `0600`. The primitive's temp name is crypto-random and `O_EXCL\|O_NOFOLLOW`, so the planted name is never opened |
| **What it does NOT close** | a **destination**-symlinked `alerts.jsonl`. The append at `:89` and `chmodAlerts` at `:90` run *before* compaction and both follow that symlink, so by the time compaction is reached the outside target has already received the record and may already have been chmodded. No claim is made that a destination symlink's target is unchanged — that would be unpassable. This is a pre-existing, distinct hazard: see the destination-symlink residual below |
| **How the two cases are told apart** | by a **stable machine-readable code on the F10 throw**, never by message text. On HEAD both cases throw an untagged `WienerdogError` whose only distinguishing feature is mutable prose, which is not a contract: matching on it would silently start misclassifying the day someone rewords the message. So this WP tags the one throw (Table D2) and the catch discriminates as `err && err.code === 'WD_F10_POST_RENAME'` |
| Discrimination rule | that code → **Case 2**. **Any** other refusal — tagged with nothing, or carrying a Node errno such as `EXDEV`/`ENOSPC` from `renameSync` itself — is **Case 1**. Fail-safe direction: an unrecognized refusal is treated as "nothing was installed", which is true for every other throw site in `writeFilePrivate` (temp-create `:321-323`, write/`fchmod` `:347`, F16 dest `:299-302`, `mkdirPrivate` ancestry) and for a failed `renameSync`, none of which replaces `dest` |
| **The not-persisted signal (a NEW wire — see Implementation notes)** | on Case 2 only, `appendAlert` returns `false`. On success and on Case 1 it returns what it returns today (`undefined`). It still **never throws**, so `run-job.js:840` — a bare expression statement that ignores the return value (verified `:840-849`) — keeps its "WARN and PROCEED" contract untouched. `failLoud` consuming that `false` is contracted by `WP-failloud-survives-state-write-failure`, this WP's `depends_on` |
| Why the signal is required | without it, Case 2 is indistinguishable from success: `failLoud` would set `persisted = true` (it infers persistence from the absence of a throw, `run-job.js:621`) and `run-job.js:1106-1107` would **delete the reap token pidfiles** — discarding the last recovery breadcrumb for an un-reapable process group at the exact moment the durable alert was lost too |
| Not changed | the compaction trigger conditions (`:106`), the `MAX_ALERTS`/`MAX_FILE_BYTES` budgets, the serialization at `:109`, the empty-read guard at `:105`, the append at `:89-90`, and `chmodAlerts` itself (still used by the append path) |

### Table D2 — tagging the F10 throw (`src/core/private-fs.js`)

The discriminator Table D depends on does not exist on HEAD, so this WP adds it.
It is the **only** code change this WP makes to `private-fs.js`.

| Fact / rule | Value |
|-------------|-------|
| Change | the `WienerdogError` thrown by the post-rename detection block (`src/core/private-fs.js:361-365`) carries `code = 'WD_F10_POST_RENAME'`. Nothing else about it changes — same class, same message, same throw site, same control flow |
| Why a property and not a subclass | measured: `WienerdogError` (`src/core/errors.js`) sets only `name` and no error in the tree carries a `code`; but `err && err.code === '...'` is the tree's **universal** discrimination idiom — `reap.js:544`, `private-fs.js:320`/`:492`/`:493`/`:726`, `manifest.js:959`, `policy-hooks.js:89`, `doctor.js:254` and ~10 more. Setting `.code` matches that convention exactly and needs no new class, no new constructor signature, and no change to `errors.js` |
| Value shape | `WD_F10_POST_RENAME` — deliberately not an errno string, so it can never collide with a Node code arriving on the same property, and it carries the `F10` label `private-fs.js` already uses throughout its own comments |
| Purely additive | adding a property does not change what any existing `catch` sees: every current handler either rethrows, matches `instanceof WienerdogError`, or ignores it. No caller behavior changes |
| Scope discipline | **only** the post-rename block is tagged. The other throw sites stay untagged on purpose — that is what makes "no code ⇒ Case 1" correct rather than merely convenient |
| Not changed | `src/core/errors.js`, the `WienerdogError` class, every other throw in `private-fs.js`, and all of that module's logic |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Tables A/B/C — a finding updates the table and
every surface below in one pass:

- [ ] Deliverables-table cells (the three writer rows cite Table B; the
      `private-fs.js` row cites the two comment mirrors)
- [ ] Acceptance criteria that assert Table C's facts and Table A's rows
- [ ] The Table C verification gate under Verification steps
- [ ] Current-state (the measured probe output, the mode-argument measurements,
      the three mechanism citations, and the `writeWatermarks` caveat)
- [ ] The out-of-scope justification for Table A rows 13-14, and the **five**
      named residuals — (1) row 2's create window, (2) the destination-symlink
      append, (3) unbounded growth under persistent compaction refusal,
      (4) deletion-recreation of the in-place-written files and `state/` itself,
      (5) the parent directory. The **total of five** appears in the Security
      checklist and must agree with this bullet. A **subset count of three** also
      appears deliberately — the three that sit on `alerts.jsonl` (residuals 1-3),
      in the residual prose and Out of scope; that is a subset, not a stale
      total, and must not be "corrected" to five. Row 3's compaction rewrite is a
      FIX (Table D), not a residual, on every surface
- [ ] The **applicable-cell count (10)** — it appears in Table C's two rows, the
      acceptance criteria, the gate script's comment header, its `cells !== 10`
      assertion and its success message; all five must agree. The count covers
      the three mode-dropping writers only; Table D's compaction observables are
      not mode cells and must not inflate it
- [ ] **The `appendAlert` → `failLoud` not-persisted wire** — it spans both
      specs: the producer is Table D Case 2 here, the consumer is Table E in
      `WP-failloud-survives-state-write-failure`, and the backward-compatibility
      rule (`undefined` keeps HEAD semantics, only explicit `false` signals) is
      stated in both. All three surfaces move together
- [ ] **KNOWN-STALE (registered, not fixed here): `src/cli/run-job.js`'s
      `failLoud` JSDoc, `:655-658` and `:681-683`.** Both restate this wire from
      the consumer side and both went stale the moment the producer landed in
      this WP. `:655-658` says "a throw from the post-append compaction rewrite
      also yields `false`" — compaction no longer throws (Table D wraps it in a
      local `try`/`catch`), so the stated mechanism is gone even though a `false`
      still arrives, by a different route and only for Case 2. `:681-683` says
      the real `appendAlert` "returns `undefined` on every path today, so this is
      a no-op" in production — no longer true: it returns `false` on Case 2
      (`src/core/alerts.js:140`). **Disposition:** outside this WP's Deliverables
      boundary, so it is NOT corrected here; fix it via a comment-only follow-up
      or in the next WP that legitimately touches `run-job.js`. Registered so the
      drift is on the books rather than silent, and so the next editor of that
      JSDoc knows what it must end up saying
- [ ] **The 2026-07-19 waiver's status** — its lift (DATED OWNER DECISION
      2026-09-01) is recorded under Current state and mirrored in
      Definition-of-done item 0(b) and the design-gate round record's Outcome;
      the three move together, and none may re-describe the waiver as
      outstanding
- [ ] **The `WD_F10_POST_RENAME` code** — it appears in Table D's discrimination
      rows, Table D2, the `private-fs.js` Deliverables cell, and the acceptance
      criteria; renaming it moves all four. The Deliverables row must stay
      "comment + one tagged throw", never revert to "comment-only"
- [ ] **The two Table D refusal cases** — Case 1 (record durable) and Case 2
      (record may be LOST, no claim on destination contents) are distinct in the
      table, the acceptance criteria and the withdrawal paragraph; no surface may
      state a blanket "the record survives any compaction refusal"
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

### A test that this WP's fix retired (why `scheduler-runjob.test.js` is a Deliverable)

`tests/unit/scheduler-runjob.test.js` is not a file this WP set out to touch. It
is in the Deliverables because an **intervening dependency's test used the very
hazard this WP closes as its failure-injection fixture**, and closing the hazard
disarmed the fixture.

`WP-failloud-survives-state-write-failure` landed first (this WP's `depends_on`).
Its Table B2 test at `:2661` needed `clearAlerts` to throw, and at the time the
cheapest way to force that was to pre-create a **directory** at `clearAlerts`'
deterministic temp path — `` fs.mkdirSync(`${alertsFile}.${process.pid}.tmp`) ``
(`:2674`), with a comment noting the filename is predictable because
`clearAlerts` runs in-process. That predictability **is** the hazard Table B
retires: `writeFilePrivate` uses a crypto-random `O_EXCL|O_NOFOLLOW` temp, so the
planted directory is never opened, the rewrite succeeds, and the test's premise
evaporates. Measured on this branch: `:2661` is the **only** failing test in the
suite (2405 tests, 2392 pass, 1 fail).

The fix is to re-arm the test against the post-mode-pin refusal shape rather than
to weaken it. Its sibling at `:2739` already shows the shape and still passes —
note **why**: `:2739` symlinks `alertsFile` itself, so its refusal comes from
`writeFilePrivate`'s destination check (F16), not from the temp fixture. Its own
`` fs.mkdirSync(`${alertsFile}.${process.pid}.tmp`) `` at `:2750` is now
vestigial but harmless, and is **out of scope** — do not tidy it up; this row
permits the `:2661` fixture and nothing else.

**The class was predicted.** `WP-failloud-survives-state-write-failure`'s own
lessons flagged that a test injecting failure through a mechanism a *later* WP is
chartered to remove will go green-then-stale exactly when that WP lands. This is
that prediction arriving. The general rule it argues for — inject failure through
a seam the roadmap is not about to close, or expect to re-arm the test — belongs
in the dogfood lessons, not in this spec; report it in the PR body.

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
- **`appendAlert`'s `false` return is a NEW wire, not an existing one.** Measured
  on HEAD: `appendAlert` has no value-returning `return` at all (its only
  `return` is the bare guard at `alerts.js:105`), so it always yields
  `undefined`; and `failLoud` sets `persisted = true` from the **absence of a
  throw** (`run-job.js:621`), never from a return value. Table D's signal
  therefore adds a return value here, and
  `WP-failloud-survives-state-write-failure` adds the consumer. The pairing is
  deliberately backward-compatible: while only the consumer has landed,
  `appendAlert` still returns `undefined`, which must keep exactly today's
  semantics — only an explicit `false` means not-persisted.
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
      reaches those four writers only — **not** `alerts.jsonl` at large. Its
      append at `:89-90` still follows a *destination* symlink and still creates
      an absent file at the umask default; both are named residuals, and this WP
      makes no containment claim about either.
- [ ] Five residuals, all named and none silently fixed. Three sit in
      `appendAlert`'s append at `:89-90` and share one follow-up owner — the
      **create** window (Table A row 2), the **destination-symlink append**
      (measured: the record and the chmod land on the outside target), and
      **unbounded growth** under persistent compaction refusal (with the
      measured finding that doctor never inspects `alerts.jsonl`, so the only
      visibility is the repeated diagnostic). Then:
      (4) deletion-recreation
      of the in-place-written files and of `state/` itself (Table A rows 13-14),
      which doctor reports and sync repairs durably; (5) the parent directory —
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
      than written through: **the refused call itself makes no modification** to
      the symlink's target — neither content nor mode — and the destination is
      still a symlink afterwards. For `alerts.jsonl` the assertion is bounded to
      the `clearAlerts` call under test; it must NOT assert the target is
      pristine overall, since any `appendAlert` used to seed records writes
      through the symlink first (`alerts.js:89-90`, the named residual).
- [ ] Each of the three holds on the **second** consecutive call: same `0600`,
      same contents for the same input (Table C repeat-runs row).
- [ ] `insecureEntries(paths)` reports none of these three files after its
      writer has run under either umask — the writer and the policy now agree,
      which is the issue's root cause closed at the source.
- [ ] Behavior preserved: each writer's file contents and return value are
      unchanged; `appendAlert`'s atomic append at `:89-90` is untouched (Table A
      row 2); `clearAlerts` still deletes the file when no records remain.
- [ ] **Table D, the hazard closed:** with a **symlink at the old predictable
      temp path** `${file}.${process.pid}.tmp` and `alerts.jsonl` a regular
      file, an `appendAlert` call that triggers compaction succeeds — the
      symlink's target is byte-identical and its mode unchanged, and
      `alerts.jsonl` holds the compacted content at `0600`. (This is the
      reachable form of the test; a *destination*-symlink case must NOT assert
      an unchanged target — the append at `:89` already wrote through it.)
- [ ] **Table D Case 1, pre-rename refusal:** the caller proceeds normally,
      exactly one non-alert diagnostic is emitted, `alerts.jsonl` is untouched,
      and the record appended at `:89` is still readable afterwards.
- [ ] **Table D Case 2, post-rename F10 temp substitution:** `appendAlert`
      returns `false` and does **not** throw; the caller at `run-job.js:840`
      still proceeds (no abort); exactly one non-alert diagnostic is emitted;
      and **no assertion is made about `alerts.jsonl`'s contents** — the
      substituted entry is whatever was installed, and the `:89` record may be
      gone. Asserting the record survives here would be asserting something
      false.
- [ ] **The discrimination is on the code, not on prose (Tables D and D2):** a
      refusal carrying `code === 'WD_F10_POST_RENAME'` yields `false`; **every**
      other refusal yields `undefined`. Both directions are asserted, because
      each failure mode is its own bug: a missed F10 recreates the lost-alert /
      deleted-pidfile defect, and a `false` on an ordinary Case 1 refusal
      misreports a durable alert as lost and needlessly retains pidfiles.
- [ ] Nothing in the delivered code matches on the F10 **message text** — the
      message is not a contract and may be reworded without breaking anything.
- [ ] The `:840` managed-policy warning path still proceeds — a job whose
      `appendAlert` warning hits a refusing compaction is not aborted, and
      `src/cli/run-job.js` is not edited by this WP at all.
- [ ] `src/core/private-fs.js` carries **exactly one** code change — the
      `code = 'WD_F10_POST_RENAME'` tag on the throw at `:361-365` (Table D2) —
      plus the two comment mirrors at `:20-22` and `:129-134`. Both `:135-141`
      (the array literal) and `:143-148` are untouched, `src/core/errors.js` is
      not edited, and no other throw in the module is tagged.
- [ ] The tag is purely additive: every existing test and caller that catches a
      `WienerdogError` from `writeFilePrivate` behaves exactly as before.
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
- **`appendAlert`'s own append at `:89-90`** — all three of its residuals: the
  absent-destination create window, the destination-symlink write-through, and
  the unbounded growth a persistent compaction refusal allows. One follow-up
  owns them (*a never-follow private append primitive, plus a bound for the
  degraded state*); note it under "Discovered issues". The **compaction** branch
  is not part of this — Table D fixes that here.
- **A degraded-state policy for repeated compaction failure.** This WP names the
  unbounded-growth residual; it does not add rate-limiting, a fallback sink, or
  a size circuit-breaker.
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
   at an unguarded failure-path call site and suppress a durable alert. **Still
   open; this is now the only thing gating dispatch.** (b) The 2026-07-19
   repair-only waiver must be lifted for `state/schedule.json` and
   `state/watermarks.json` — **SATISFIED by the DATED OWNER DECISION 2026-09-01
   recorded under Current state**, on the ground that issue #168 measured its
   premise ("sync-time repair suffices") to be false for a file rewritten at
   every job run. The decision stays in force for `config.yaml` and
   `install-manifest.json` (Table A rows 13-14), whose writers this WP does not
   touch. No ADR is required: the decision lives in a `done` spec and a logbook
   entry, not in an ADR, so its narrowing is recorded the same way — in this
   spec and in the design-gate round record. `alerts.jsonl` (Table A row 4) was
   never covered by that decision and needed no waiver. **Table D2's error tag
   is also outside that waiver, verified:** the decision's subject is the four
   metadata files' *writers*
   (`src/core/private-fs.js:19-21`; `docs/specs/done/WP-a9-private-modes-repair.md:149-156`),
   and tagging a throw inside `writeFilePrivate` neither writes those files nor
   changes any writer's behavior — it adds a property to an error object. No
   extension of the waiver was requested for it. The dispatch message records
   that precondition (a) was observed.
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
