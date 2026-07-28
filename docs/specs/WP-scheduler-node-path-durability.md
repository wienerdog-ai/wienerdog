---
id: WP-scheduler-node-path-durability
title: Register scheduler entries against an upgrade-durable node path, not a version-pinned Cellar path
status: Draft
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0027, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-scheduler-node-path-durability: the entry's execution position survives `brew upgrade node`

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler: a launchd `.plist` on macOS, a systemd `.timer`/`.service` on Linux, a
Task Scheduler XML on Windows. The registered entry never invokes the app
directly. It invokes the **independent launcher** at `<core>/launcher/launch.js`
— a file outside the mutable `app/current` tree — which verifies containment, the
**app release digest** and the **descriptor digest** before spawning
`run-job` (ADR-0028, WP-157). Any verification failure is a durable alert in
`state/alerts.jsonl` plus **zero** spawn.

**IRON RULE (ADR-0004): Wienerdog is just files.** The launcher runs and exits
with each fire. This WP adds no daemon, no watcher, no poller, no telemetry, and
no background process of any kind. Everything it writes to a user machine stays
idempotent (a second `wienerdog sync` produces byte-identical files and zero OS
calls) and reversible through the install manifest.

Every OS entry names, as its **execution position** (the program the OS will
actually start — `ProgramArguments[0]` in a plist, the `ExecStart` head in a
systemd unit, the node token inside the cmd.exe argline on Windows), an absolute
node path produced by `generators.nodePath()`, which returns `process.execPath`.
On a Homebrew macOS install `process.execPath` is a **version-pinned Cellar
path**: `/opt/homebrew/Cellar/node/25.9.0_2/bin/node`. An ordinary
`brew upgrade node` deletes that directory. The `.plist` stays correct, the
loaded launchd record stays correct, `launchctl print` still exits 0 — and every
scheduled fire dies in `posix_spawn` with `ENOENT` **before a single line of
Wienerdog code runs**: no refusal, no `alerts.jsonl` record, no product log.

That is the exact signature of the 2026-07 incident class — a scheduled job
failing *outside* the product's own observability — and it has been named three
times without being closed at the source. `WP-scheduler-entry-identity` (PR #114,
merged) closed the **detection** half: `defaultProbe` step 8b now grades an entry
whose execution position no longer exists as `mismatched`, which fails `doctor`
and enters the sync heal set. Detection is attended, though: it only speaks when
the user runs `wienerdog sync` or `wienerdog doctor`. Nothing prevents the entry
from being registered against a path that a routine package upgrade is *expected*
to delete. This WP closes that: the entry is registered against the most
upgrade-durable absolute path that **provably resolves to the very interpreter
that is running**, so the ordinary upgrade stops breaking the entry at all.

## Current state

Everything below was read and executed at commit `5f0ffc0` on macOS 26 (Apple
Silicon, Homebrew prefix `/opt/homebrew`). Line numbers are that commit's.

### 1. `generators.nodePath()` — `src/scheduler/generators.js:16-22`

```js
/**
 * Absolute path to the node binary that will run wienerdog under the scheduler.
 * @returns {string} process.execPath (already absolute).
 */
function nodePath() {
  return process.execPath;
}
```

It is exported (`generators.js:997`). The claim in the task brief that the
pin lives at `generators.js:20` is **confirmed**: line 20 is the `function
nodePath() {` line and line 21 is `return process.execPath;`.

### 2. `nodePath()` has TWO roles, and only one of them is the hazard

```
$ grep -rn "gen\.nodePath()" src/
src/cli/schedule.js:303      ensureCatchup           → catchupPlist({node})            ENTRY
src/cli/schedule.js:342      ensureWindowsCatchup    → windowsCmdArguments({node})     ENTRY
src/cli/schedule.js:417      registerPlatformEntries → launchdPlist/systemdService/…   ENTRY
src/cli/schedule.js:638      repairCatchup (darwin)  → catchupPlist({node})            ENTRY
src/cli/schedule.js:667      repairCatchup (win32)   → windowsCmdArguments({node})     ENTRY
src/cli/schedule.js:752      reloadJob               → launchd/systemd/schtasks        ENTRY
src/cli/run-job.js:408       resolveCommand          → spawnSync THIS process's child  RUNTIME
src/cli/run-job.js:529       defaultSendAlert        → spawnSync THIS process's child  RUNTIME
src/core/routine-runtime.js:92  broker MCP config    → spawned by THIS run             RUNTIME
```

The six **ENTRY** sites write a string into a file that the OS keeps and re-reads
days later; a path that dies between writes is fatal there. The three **RUNTIME**
sites spawn a child from a process that is *already* running under
`process.execPath` at that instant; the path cannot go stale between the read and
the spawn, and WP-154's exec-identity discipline deliberately wants
`process.execPath` there (never a PATH lookup, never an interpreter chosen by a
symlink). **This WP separates the two roles and changes only the ENTRY one.**

### 3. The renderers write `o.node` verbatim — no escaping question is opened

`launchdPlist` (`generators.js:364`, and `catchupPlist` at `:407`) emits
`<string>${xmlEscape(o.node)}</string>`; `systemdService` (`generators.js:482`)
emits `ExecStart=${systemdQuote(o.node)} …`; `windowsCmdArguments`
(`generators.js:606`) emits `"${cmdQuotedToken(o.node)}"`.
Each already escapes for its own format. **This WP does not touch a renderer.**

### 4. The measured Homebrew layout (executed 2026-07-28)

```
$ node -p 'process.execPath'
/opt/homebrew/Cellar/node/25.9.0_2/bin/node

$ ls -l /opt/homebrew/opt/node
lrwxr-xr-x  /opt/homebrew/opt/node -> ../Cellar/node/25.9.0_2

$ /opt/homebrew/opt/node/bin/node -p 'process.execPath'
/opt/homebrew/Cellar/node/25.9.0_2/bin/node        # ← node realpath-resolves execPath

$ /opt/homebrew/opt/node/bin/node -e \
    'console.log(require("fs").realpathSync("/opt/homebrew/opt/node/bin/node"))'
/opt/homebrew/Cellar/node/25.9.0_2/bin/node        # ← same file as execPath
```

`<prefix>/opt/<formula>` is Homebrew's **stable alias** for the currently-linked
keg: `brew upgrade` repoints it and deletes the old Cellar version directory. So
`<prefix>/opt/node/bin/node` names the same binary as `process.execPath` **and**
keeps naming a working node after the upgrade. That symmetry — same file now,
still a file later — is the whole mechanism of this WP.

The fourth command also establishes a fact the implementer must not trip over:
**launching node through the alias does not change `process.execPath`**, which
Node resolves through symlinks on POSIX. Anything computed from
`process.execPath` at fire time is therefore unaffected by this change.

### 5. The live entry on this machine, and the live launchd PATH

```
$ grep -A4 ProgramArguments ~/Library/LaunchAgents/ai.wienerdog.dream.plist
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/Cellar/node/25.9.0_2/bin/node</string>
    <string>/Users/gyulafeher/.wienerdog/launcher/launch.js</string>
    <string>dream</string>

$ launchctl getenv PATH
                                    # empty output, exit 0 — NO user PATH is set
$ ls /usr/bin/node /usr/local/bin/node
ls: /usr/bin/node: No such file or directory
ls: /usr/local/bin/node: No such file or directory
```

The live entry is pinned exactly as described. And with no `launchctl`-set PATH,
a launchd job inherits launchd's minimal default (`/usr/bin:/bin:/usr/sbin:/sbin`)
— which on this machine contains **no node at all**. That is the executed
evidence behind rejecting design (c); see "Design space".

### 6. What already exists downstream — detection, and the heal set

`src/scheduler/status.js:125-133` (`defaultProbe` step 8b, shipped by
`WP-scheduler-entry-identity`):

```js
  // 8b — a `match` proves only that OUR launcher sits in the launcher position.
  // The program the OS will actually START is `exec`; when it no longer exists
  // (a `brew upgrade node && brew cleanup` deletes the version-pinned execPath
  // the entry was registered with) every fire dies in posix_spawn before a line
  // of Wienerdog code runs. […]
  if (typeof exec === 'string' && exec !== '' && fs.existsSync(exec)) return 'loaded';
  return 'mismatched';
```

`HEAL_SET` is `{missing, mismatched, unverified}` (`status.js:80`), and
`reloadMissing` (`status.js:354-392`, called from `src/cli/sync.js:240`) heals
those by calling `schedule.reloadJob`, which on darwin uses `darwinReplaceEntry`
(`schedule.js:51-55`: bootstrap first, `bootout` + bootstrap only after launchd
refuses). So the *detection and repair* machinery for a dead execution position
is already shipped and is not re-implemented here.

### 7. The descriptor's `node` field — NOT touched by this WP

`src/scheduler/descriptor.js:215` writes `node: process.execPath` into the job
descriptor, and that field is digest-covered (`docs/GLOSSARY.md:25` lists "the
running `node` path" among the digest-covered fields; the dev reduction excludes
only `appRelease.treeDigest`/`version`). The **descriptor digest** is bound into
the entry argv as `--expect-digest` and re-derived by the launcher at fire time.
Changing what goes in that field would change every existing descriptor digest.
**Table A row 5 forbids touching it, and Implementation notes §"Why the
descriptor field stays" gives the executed reason.**

### 8. The registration path cannot replace an already-loaded macOS record

`registerPlatformEntries` (`schedule.js:428-431`) writes the plist and then calls
a **bare** `launchctl bootstrap`:

```js
    let changed = ensureEntry(manifest, plistPath, content, unload);
    if (changed) loaded = loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
```

`ensureCatchup` (`schedule.js:315`) does the same. Bare `bootstrap` fails on an
already-loaded label — ADR-0018's 2026-07-25 amendment says so in those words,
and it is why `darwinReplaceEntry` exists for the *heal* path. **Consequence for
this WP:** on a macOS install whose job is already loaded, the new plist bytes
land on disk but launchd keeps serving the old record until something calls
`reloadJob`. This is a pre-existing defect, it is **not fixed here**, and the
acceptance criteria are written to be honest about it — see
"Convergence, stated exactly" and Discovered issues.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing (recorded, not left implicit).** One new pure function plus its export in
`generators.js`; six one-token call-site swaps in `schedule.js`; one test file
extended. No renderer, no descriptor, no ADR, no glossary, no runbook. **M** — one
session. It is not split further: the function and its six call sites are
meaningless apart, and splitting them would ship an exported function nothing
calls.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | **D1** — add `entryNodePath(execPath?, opts?)` per Table A and export it. `nodePath()` keeps its body **byte-for-byte** (Table A row 5). No renderer, no other function. |
| modify | src/cli/schedule.js | **D2** — replace `gen.nodePath()` with `gen.entryNodePath()` at exactly the six ENTRY sites (`:303`, `:342`, `:417`, `:638`, `:667`, `:752` — Current state §2). Nothing else in this file changes: no bootstrap/bootout change, no probe change, no notice change. |
| modify | tests/unit/scheduler-generators.test.js | **T1–T4** (Test index). The existing test at `:421` (`nodePath/wienerdogBin are absolute`) must pass **unmodified**. |

Not deliverables, deliberately: `src/scheduler/descriptor.js`,
`src/scheduler/status.js`, `src/scheduler/launcher.js`, `src/cli/run-job.js`,
`src/core/routine-runtime.js`, `docs/GLOSSARY.md`,
`docs/adr/0028-scheduler-app-executable-integrity.md`,
`docs/adr/0018-windows-scheduled-dreaming.md`,
`docs/runbooks/scheduler-and-executable-integrity.md`,
`tests/unit/scheduler-schedule.test.js`, `tests/unit/sync-repoint.test.js`,
`tests/unit/descriptor.test.js`. Several of those contain assertions that must
pass **unmodified** — that is this WP's proof that nothing else moved. See "Out of
scope" for why each is untouched.

### Exact contracts

```js
/**
 * The absolute node path written into an OS scheduler ENTRY (plist / systemd
 * unit / Task Scheduler XML) — a string the OS keeps and re-reads days later.
 * Prefers an upgrade-DURABLE alias over the version-pinned `process.execPath`,
 * but ONLY when that alias provably resolves to the very interpreter that is
 * running right now. Every other input, and every failure, returns `execPath`
 * unchanged (Table A). PURE apart from one `realpath` stat; NEVER throws.
 *
 * NOT for spawning a child of the current process — use `nodePath()` there.
 *
 * @param {string} [execPath=process.execPath]  absolute path of the running node
 * @param {{realpath?: (p:string) => string}} [opts]  test seam; default fs.realpathSync
 * @returns {string} an absolute node path
 */
function entryNodePath(execPath = process.execPath, opts = {})
```

Example input → output pairs (all from Table A):

```
/opt/homebrew/Cellar/node/25.9.0_2/bin/node   → /opt/homebrew/opt/node/bin/node
/usr/local/Cellar/node@22/22.14.0/bin/node    → /usr/local/opt/node@22/bin/node
/home/linuxbrew/.linuxbrew/Cellar/node/24.0.1/bin/node
                                              → /home/linuxbrew/.linuxbrew/opt/node/bin/node
/home/u/.nvm/versions/node/v22.1.0/bin/node   → (unchanged — no Cellar shape)
/usr/bin/node                                 → (unchanged)
C:\Program Files\nodejs\node.exe               → (unchanged — Windows, see Table A row 1)
```

A literal expected `.plist` fragment after this WP, on the machine measured in
Current state §5 (only the first `<string>` changes):

```xml
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/opt/node/bin/node</string>
    <string>/Users/gyulafeher/.wienerdog/launcher/launch.js</string>
    <string>dream</string>
    <string>--descriptor</string>
    <string>/Users/gyulafeher/.wienerdog/state/descriptors/dream.json</string>
    <string>--expect-digest</string>
    <string>sha256:…</string>
  </array>
```

The `--expect-digest` value is **unchanged** by this WP. That is the single most
important property of the whole change; Table A row 5 and AC5 pin it.

## Contract reference

**Activation (ADR-0031, 2-of-7): three triggers fire, so the discipline is on.**
(i) an interface **shape** changes — a new exported function joins the generator
surface and one of two now-distinct node-path roles is re-pointed at it;
(iv) **fallback/precedence** behavior is introduced — four distinct conditions
decide whether the alias or `execPath` wins, and the fail-safe direction must be
identical in all three failure conditions; (vii) the same rule is restated across
Deliverables cells, acceptance criteria, verification greps, Current-state and
the operative prose. One canonical table below; every mirror is registered under
it.

### Table A — what `entryNodePath(exec)` returns (canonical)

Conditions are evaluated **in order**; the first that holds decides. `exec` is
the argument (default `process.execPath`); `RP` is `opts.realpath` (default
`fs.realpathSync`). `ALIAS` is defined by row 4's derivation.

| # | Condition | Returns | Why this is the fail-safe answer |
|---|-----------|---------|----------------------------------|
| 1 | `exec` is not a string, or does not start with `/` | `exec` | A non-POSIX or non-absolute value has no Homebrew shape. This is also the **Windows** answer by construction: a `C:\…\node.exe` never starts with `/`. |
| 2 | `exec.split('/')` does not have the literal segment `Cellar` at index `len - 5` (i.e. the tail is not `Cellar/<formula>/<version>/bin/node`) | `exec` | Not a Homebrew keg layout. nvm, fnm, volta, nodenv, distro packages and the official installer all land here. |
| 3 | the `<formula>` segment does not match `/^node(@[0-9]+(\.[0-9]+)*)?$/`, **or** the `<version>` segment does not match `/^[0-9][0-9A-Za-z._+-]*$/` | `exec` | Rejects `.`, `..`, empty, and anything not a Homebrew node keg, before either value is used to build a path. |
| 4 | `RP(ALIAS)` throws, **or** `RP(ALIAS) !== RP(exec)` | `exec` | The alias is absent, or it currently names a **different** binary. Registering a path that is not this interpreter would be worse than the pin. |
| 5 | otherwise | `ALIAS` | The alias exists and is the same file as the running interpreter, and Homebrew repoints it on upgrade. |

`ALIAS` derivation, from the same `split('/')`: with `i = len - 5` (the `Cellar`
index), `prefix = parts.slice(0, i).join('/')`, `formula = parts[i+1]`, then
`ALIAS = prefix + '/opt/' + formula + '/bin/node'`.

**Row 5 has a second, non-obvious half that is part of this contract:**
`nodePath()` still returns `process.execPath`, unchanged, and
`src/scheduler/descriptor.js:215` still writes `node: process.execPath`. No
descriptor digest changes, so no `--expect-digest` changes, so nothing already
registered has to be re-minted for this WP.

### Table B — role split (canonical)

| Role | Function | Call sites | Value | Rule |
|------|----------|-----------|-------|------|
| Entry (written into a file the OS keeps) | `entryNodePath()` | `schedule.js` `:303 :342 :417 :638 :667 :752` | Table A | must survive a package upgrade |
| Runtime (spawn a child of this process) | `nodePath()` | `run-job.js:408`, `run-job.js:529`, `routine-runtime.js:92` | `process.execPath` | must be the exact running interpreter (WP-154) |
| Authorization record (digest-covered) | *(inline)* `process.execPath` | `descriptor.js:215` | `process.execPath` | **unchanged** — see Table A row 5 |

### Mirrored Surface Checklist

Tables A and B are the single place these facts are decided. Every surface in
this spec that restates them is registered below, so one review finding updates
the table **and** all its mirrors in one pass, and any new mirror found in review
is added here on the spot.

In this spec:

- [ ] Deliverables cell for `src/scheduler/generators.js` (D1 — "per Table A", `nodePath()` byte-for-byte)
- [ ] Deliverables cell for `src/cli/schedule.js` (D2 — the six site list, Table B row 1)
- [ ] "Exact contracts" JSDoc block and its input → output pairs
- [ ] "Exact contracts" literal `.plist` fragment (the `--expect-digest`-unchanged claim, Table A row 5)
- [ ] Current state §2 (the ENTRY/RUNTIME site classification — Table B)
- [ ] Current state §7 (the descriptor field — Table A row 5)
- [ ] Implementation notes §D1 (the derivation), §"Why the descriptor field stays" (row 5), §"Windows" (row 1), §"Convergence, stated exactly"
- [ ] Design space → option (a) (the alias mechanism is row 4/5)
- [ ] Security checklist bullets 1 and 2 (rows 2 and 3 are the anchoring argument)
- [ ] Acceptance criteria AC1 (rows 4–5), AC2 (rows 1–3), AC3 (Table B row 1), AC4 (Table B row 2), AC5 (Table A row 5), AC6 (idempotence)
- [ ] Verification commands V3 (Table B row 1 count), V4 (Table B row 2 preservation), V5 (Table A row 5 preservation)
- [ ] Table E mutation rows 1, 2, 3, 4, 5, 6

Out of this spec, registered so a later Table A change updates them too — **none
of these is a deliverable**, and none may be edited by the implementer:

- [ ] `docs/adr/0028-scheduler-app-executable-integrity.md:83` — "`node` is `process.execPath` (already absolute) and is not pinned." After this WP that sentence is true of the descriptor field and of runtime spawns, and **false of the registered entry**. An ADR amendment is an OWNER action (WP-114's Decision 5 precedent: an ADR gloss is never edited from a WP). Proposed slug: `WP-adr-0028-entry-node-path-amendment`.
- [ ] `docs/GLOSSARY.md:25` — "the running `node` path" in the **job descriptor** field list. Unchanged by this WP *because* Table A row 5 leaves `descriptor.js:215` alone; registered because a later WP that moves the descriptor field must edit it.

Not registered, and why: `src/scheduler/status.js` step 8b **reads** an execution
position out of a loaded record but never derives one, so it is a consumer, not a
mirror. The three renderers (`launchdPlist`, `systemdService`,
`windowsCmdArguments`) interpolate `o.node` verbatim and state no rule about its
value.

## Design space (the three options, and the recorded tradeoff)

**(a) Resolve at sync time through Homebrew's stable alias — CHOSEN.** The entry
is registered against `<prefix>/opt/<formula>/bin/node` when, and only when, that
alias currently realpaths to the running `process.execPath` (Table A rows 4–5).
Cost: one `realpath` stat per registration. It is a pure path transform with a
fail-safe default, it opens no new escaping question (the renderers already
escape `o.node`), it changes no digest, and it needs no new state, no new file
and no new process. It is the simplest option that survives the integrity model.

**(b) Keep the pin, add fire-time drift detection with a durable alert —
REJECTED, and the reason is structural, not aesthetic.** For the failure this WP
addresses there is no fire time. The execution position *is* the missing file, so
`posix_spawn` fails and no Wienerdog code runs — there is nothing to detect
from, and no process of ours in which to detect it. Detecting it from *another*
process requires something that is alive when the job is not, which is a daemon
and is forbidden by ADR-0004. The only legitimate remaining form is **attended**
detection, and that is already shipped: `defaultProbe` step 8b + the heal set
(Current state §6). So (b) is either impossible, forbidden, or already done.
There is one genuine bonus worth recording: once (a) lands, the surviving job's
own nightly `run-job` refreshes `state/scheduler-status.json`
(`run-job.js:1236`), which re-probes **every** entry with step 8b — so a *still*
pinned sibling entry (an nvm install, say) gets reported through the existing
digest callout rather than staying silent. Fixing the exec position is what makes
the already-shipped detector reachable.

**(c) `/usr/bin/env node` — REJECTED, with executed evidence.** `launchctl getenv
PATH` on the measured machine is **empty** (Current state §5), so a launchd job
gets launchd's minimal default `/usr/bin:/bin:/usr/sbin:/sbin`, and that machine
has **no node** on it (`/usr/bin/node` and `/usr/local/bin/node` both absent). A
`/usr/bin/env node` entry would fail on essentially every Homebrew macOS install
— trading a failure that occurs after an upgrade for one that occurs immediately.
It is also directly contrary to the exec-identity rule the repo already enforces
(`src/core/exec-identity.js:203`: "never PATH-resolve node"), because it hands the
choice of interpreter to whatever PATH the OS happens to supply. Rejected on both
counts; do not reopen it.

### Relationship to `WP-scheduler-stable-exec-position` — neither adopts nor supersedes

PR #114's discovered-issues list routes `WP-scheduler-stable-exec-position` for
"make the execution position **comparable** via a `<core>`-owned trampoline". That
is a different problem with a different threat: it targets the **substituted**
half of Residual 9 (a real-but-hostile binary in the execution position, which
still grades `loaded` today), and its mechanism is a Wienerdog-owned file whose
path this install controls. This WP targets the **accidental** half (a binary that
ceases to exist because the user upgraded a package), and its mechanism is a
third-party alias that Wienerdog does **not** own — so it provides **no**
substitution resistance whatsoever: a same-user actor who can repoint
`/opt/homebrew/opt/node` is the same actor who can replace the Cellar binary, and
both are PR #114's out-of-scope Residual 6 actor.

**Therefore: this WP keeps its own slug and does not claim the sibling's.** If the
trampoline WP later lands, it subsumes this function's *role* (the entry would
name the trampoline, and the trampoline would resolve node) but not its
*derivation*, which the trampoline would need. Neither blocks the other, and this
WP is `depends_on: []` by argument: nothing it touches is under revision by any
open spec (checked across `docs/specs/` — `WP-dev-descriptor-no-tree-hash` names
`src/cli/schedule.js` only under *its* "not deliverables" list).

## Implementation notes & constraints

### D1 — `src/scheduler/generators.js`

Add `entryNodePath` immediately after `nodePath` and export it alphabetically
adjacent to `nodePath` in `module.exports`. Implement Table A **by array
segments, not by one regex**:

```js
const parts = execPath.split('/');
const i = parts.length - 5;            // index the literal 'Cellar' must occupy
if (i < 1 || parts[i] !== 'Cellar') return execPath;
```

This is anchored **by construction** — every segment is guaranteed separator-free
because it came out of a `split('/')`, so no `/` and no `\` can hide inside
`formula` or `version`, and the two charset tests of Table A row 3 are then the
only remaining gate (they reject `.`, `..` and the empty string). Do **not**
replace it with a single greedy regex over the whole path: a lazy/greedy prefix
group is exactly where a `Cellar` that is not the fifth-from-last segment slips
through, and T2's row-2 fixtures exist to catch that.

Wrap the whole body in one `try { … } catch { return execPath; }`. The function
is contracted **never to throw**: it is called on the registration path, and a
throw there would abort `wienerdog sync` for every job.

`opts.realpath` is the **only** seam, and it exists so T1/T2 can drive Table A
rows 4 and 5 without a Homebrew install. Default it with
`typeof opts.realpath === 'function' ? opts.realpath : fs.realpathSync` — never
`opts.realpath || fs.realpathSync`, and never `'realpath' in opts`; production
callers pass no `opts` at all, and the truthiness form has bitten this repo before
(WP-114's dogfooding lesson about `opts.run`). `generators.js` already requires
`node:fs` at line 3; add no new require.

Apply `RP` to **both** sides in row 4 (`RP(ALIAS) !== RP(exec)`), not just the
alias. `process.execPath` is already realpath-resolved on POSIX (Current state §4
proves it), so on production inputs the two forms agree — but a caller passing a
symlinked `exec` must not silently get a false negative, and symmetry is cheaper
to reason about than an asymmetry that happens to be safe.

### D2 — `src/cli/schedule.js`

Six mechanical substitutions, listed by line in the Deliverables cell. `:417` and
`:752` are `const node = gen.nodePath();` — change the right-hand side only; the
local variable keeps its name and every downstream `{ …, node, … }` is untouched.
Change **nothing else in this file**. In particular: do not touch the bare
`launchctl bootstrap` calls at `:315` and `:431`, do not touch `darwinReplaceEntry`,
do not touch any probe, notice or heal. Those are Discovered issue #1's territory.

### Why the descriptor field stays `process.execPath` — the decisive reason

It is tempting to change `descriptor.js:215` to `gen.entryNodePath()` in the same
pass, so a node upgrade drifts nothing at all. **Do not.** Two facts, both
executed, make it unsafe *today*:

1. The descriptor's `node` is digest-covered, so changing its value changes every
   existing job's **descriptor digest**, and therefore the `--expect-digest`
   token inside every registered entry's argv.
2. The macOS registration path cannot replace an already-loaded record (Current
   state §8: bare `launchctl bootstrap` fails on a loaded label). The rewritten
   plist would sit on disk carrying the new digest while launchd kept serving the
   old record carrying the old one. At the next fire the launcher would re-derive
   the new digest, compare it against the stale entry-bound old one, and **refuse**
   — `verifyAndResolve` returns `{remedy:'sync'}` (`launcher.js:348`). That
   would break the nightly job on every already-installed macOS machine.

So the descriptor field is left alone, and this WP changes **no digest at all**.
The consequence is stated honestly rather than hidden: after a `brew upgrade
node`, an entry fixed by this WP *fires*, the launcher *runs*, re-derives
`node: process.execPath` as the new Cellar path, finds it differs from the
descriptor on disk, and **refuses loudly** — durable `alerts.jsonl` record, digest
callout, remedy `run 'wienerdog sync'`. That is the point of this WP: the failure
moves from **outside** the product's observability to **inside** it. Making the
node upgrade cost nothing at all requires the descriptor field to move too, which
is routed as `WP-descriptor-node-field-stability` and must land **after**
Discovered issue #1.

### Convergence, stated exactly (do not overclaim this in the PR body)

| Install situation | When the durable path reaches the OS |
|---|---|
| New install, or any job registered for the first time after this ships | immediately, at that registration |
| Linux (systemd) and Windows (schtasks): existing job, next `wienerdog sync` | immediately — both re-register unconditionally on a content change (`systemctl --user enable --now`, `schtasks /create /f`) |
| macOS: existing job whose loaded record is still healthy | **not yet** — the plist bytes update, launchd keeps the old record (Current state §8) |
| macOS: existing job after the Cellar path is deleted | at the next `wienerdog sync`: step 8b grades it `mismatched` → heal set → `reloadJob` → `darwinReplaceEntry` → the durable path is loaded and the entry never breaks again |

So on macOS this WP is fully preventive for new registrations and self-healing
(one upgrade late) for existing ones, until Discovered issue #1 is fixed. Say
exactly this in the PR body; do not write "closes the class".

### Windows — scoped OUT, with the reason recorded

The same `nodePath()` value flows into `windowsCmdArguments` (Current state §2,
sites `:342` and `:667`), so the Windows generator **does** carry the identical
pin, and `entryNodePath` is wired into both Windows sites — but Table A row 1
makes it a **no-op** there, because a Windows `process.execPath` never starts with
`/`. That is deliberate, and the exclusion rests on the Windows node layouts
being stable already: the official MSI and Chocolatey install to
`C:\Program Files\nodejs\node.exe`, and nvm-windows keeps that same path as a
directory symlink it repoints (on win32 `process.execPath` comes from
`GetModuleFileNameW`, which does **not** resolve symlinks, so execPath is the
stable path). No Windows-shaped version-pinned analogue of the Cellar layout is
known to this spec.

**This was not verified on a Windows host** — none was available. It is specified,
not observed, exactly as WP-114's Residual 2 was. AC2's Windows fixture makes the
*no-op* executable; the *layout claim* is an owner checklist item (Definition of
done 6). If a Windows layout is later found that pins a version into the path, it
is a new WP, not an edit to `entryNodePath`'s POSIX rule.

Linux Homebrew (`/home/linuxbrew/.linuxbrew/Cellar/…`) **is** covered, because the
prefix is derived from the input rather than hardcoded (T2 asserts it). Linux
`nvm` is **not** covered — `~/.nvm/versions/node/vX/bin/node` has no stable alias
that nvm maintains — and falls through Table A row 2 to the unchanged pin, where
step 8b's attended detection remains the safety net. Recorded as a residual, not
closed.

### General

- No new npm dependency; no new `require` in either deliverable file.
- No daemon, no watcher, no poller, no telemetry, no background process (ADR-0004).
- Idempotence: `entryNodePath` is deterministic for a fixed filesystem, so a
  second `wienerdog sync` renders byte-identical entry files, `ensureEntry`
  returns `false`, and **zero** OS scheduler calls are made (AC6). Reversibility
  is untouched: the manifest still records the same entry paths, and
  `deriveUnloadArgv` derives the unregister argv from the **basename**
  (`generators.js:101-122`, ADR-0027) — it never reads the execution position.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] `formula` and `version` are untrusted only in the weak sense that they come
      from a filesystem path, but they **flow into a constructed filesystem path**
      and are therefore validated: both come out of `execPath.split('/')` (so
      neither can contain `/`), and both are matched against a **fully anchored**
      pattern with no `m` flag — `/^node(@[0-9]+(\.[0-9]+)*)?$/` and
      `/^[0-9][0-9A-Za-z._+-]*$/`. A start-anchored-only check would accept a
      `version` of `..`, turning `prefix + '/opt/' + formula + '/bin/node'` into a
      path-traversal primitive; the end anchor plus the leading-digit requirement
      rejects `.`, `..` and the empty string outright. There is no second language
      to mirror here — no bash or PowerShell copy of this rule exists.
- [ ] The derived `ALIAS` is **never executed and never written anywhere** until
      Table A row 4 has passed, i.e. until `realpath` has proven it is the same
      inode as the running interpreter. A path that merely *looks* right is never
      registered.
- [ ] The only filesystem touch is `fs.realpathSync`, twice, on absolute paths. It
      is a resolve, never an `open`, never a spawn, never a `require`, never a
      write; its result is used only for a string equality. A throw (ENOENT,
      ELOOP, EACCES, ENAMETOOLONG) is caught and returns `execPath` — the
      fail-safe direction, which preserves exactly today's behavior.
- [ ] The value reaches three renderers that each already escape it for their own
      format (`xmlEscape`, `systemdQuote`, `cmdQuotedToken` — Current state §3).
      This WP adds no interpolation site and changes no escaping, and the alias it
      can produce is a subset of the charset the pin already produced.
- [ ] No new attack surface at fire time: the OS entry is still `node <launcher>
      …`, the launcher still verifies containment + app release digest +
      descriptor digest before any spawn, and this WP changes none of those
      values.

## Acceptance criteria

**Preamble — a test that passes against unmodified `main` is not evidence.** Every
new test must be demonstrated **red before the fix and green after**, and every
row of Table E must be demonstrated red. Paste both sets of output into the PR
body. A new verification command that cannot fail is a defect in this WP, not a
pass. (Preservation checks are the deliberate exception — see the Verification
preamble.)

- [ ] **AC1 (Table A rows 4–5 — the alias is taken, but only when proven).** With
      an injected `realpath` that maps both `/opt/homebrew/opt/node/bin/node` and
      `/opt/homebrew/Cellar/node/25.9.0_2/bin/node` to the same string,
      `entryNodePath('/opt/homebrew/Cellar/node/25.9.0_2/bin/node', {realpath})`
      returns `'/opt/homebrew/opt/node/bin/node'`. With a `realpath` that maps the
      alias to a **different** string, it returns the input unchanged. With a
      `realpath` that **throws**, it returns the input unchanged. All three are
      asserted; the two negatives are the fail-safe direction. (T1)
- [ ] **AC2 (Table A rows 1–3 — everything else is unchanged).** `entryNodePath`
      returns its input verbatim, with an injected `realpath` that would
      `assert.fail()` if called, for each of: `/usr/bin/node`;
      `/home/u/.nvm/versions/node/v22.1.0/bin/node`;
      `C:\Program Files\nodejs\node.exe`;
      `/opt/homebrew/Cellar/node/25.9.0_2/bin/x/node` (Cellar not fifth-from-last);
      `/opt/homebrew/Cellar/pnpm/9.0.0/bin/node` (formula not node);
      `/opt/homebrew/Cellar/node/../../evil/bin/node` (version rejected by row 3);
      `''`; and a non-string. The `assert.fail()` realpath is what proves rows 1–3
      short-circuit **before** any filesystem touch. (T2)
- [ ] **AC3 (Table B row 1 — every entry site uses the durable path).**
      `src/cli/schedule.js` contains **zero** occurrences of `gen.nodePath()` and
      exactly **six** of `gen.entryNodePath()`. Asserted by V3, whose `main`
      output is the inverse (6 and 0).
- [ ] **AC4 (Table B row 2 — the runtime role is untouched).** `nodePath()` still
      returns `process.execPath`: the existing test at
      `tests/unit/scheduler-generators.test.js:421` passes **unmodified**, and V4
      shows `run-job.js` and `routine-runtime.js` still calling `gen.nodePath()`
      at all three sites.
- [ ] **AC5 (Table A row 5 — no digest moved).** `src/scheduler/descriptor.js`
      still contains `node: process.execPath` and is not in the diff at all (V5 +
      `git diff --name-only`). Additionally, in a unit test, the descriptor digest
      for a fixture job is byte-identical before and after `entryNodePath` is
      introduced — asserted structurally by driving `deriveDescriptorDigest` twice
      across a stubbed `gen.entryNodePath` that returns a different value, and
      requiring the two digests to be equal. (T3)
- [ ] **AC6 (idempotence).** Rendering the same job twice through
      `gen.launchdPlist({…, node: gen.entryNodePath()})` produces byte-identical
      strings, and `gen.entryNodePath()` called twice in one process returns the
      same value. (T4)
- [ ] **AC7 (mutation matrix).** Every row of Table E was demonstrated red; output
      pasted in the PR.
- [ ] **AC8 (no daemon, no new dependency).** The diff introduces no `spawn`, no
      `setInterval`, no `setTimeout`, no new `require`, and no `package.json`
      change. Asserted by reading the diff and by V6.

### Table E — Mutation checks

Each row: apply exactly **one** mutation to the finished tree, run the named test,
confirm it turns RED, then restore the file byte-for-byte. The **trigger** column
says what the mutation breaks; the **patch** column is the literal edit. Assert
that the test-name pattern selected exactly **one** named subtest — a pattern that
matches nothing exits 0 and proves nothing (WP-114's dogfooding lesson).

| # | Trigger (what must be caught) | Patch (the one-line mutation) | Test that must go RED |
|---|-------------------------------|-------------------------------|-----------------------|
| 1 | the alias is never preferred — the fix silently does nothing | `generators.js entryNodePath`: insert `return execPath;` as the first statement of the body | T1 (AC1 positive) |
| 2 | the alias is taken **without** proving it is the same binary | `generators.js entryNodePath`: delete the `RP(ALIAS) !== RP(exec)` comparison, keeping only the `try`/`catch` around `RP(ALIAS)` | T1 (AC1 second negative) |
| 3 | the shape test is loosened to a prefix/substring match | `generators.js entryNodePath`: replace the `parts[i] !== 'Cellar'` index test with `!execPath.includes('/Cellar/')` and derive `prefix` by `split('/Cellar/')[0]` | T2 (the `bin/x/node` and `pnpm` fixtures) |
| 4 | the `version` charset gate is dropped, re-opening traversal | `generators.js entryNodePath`: delete the `version` regex test | T2 (the `../../evil` fixture) |
| 5 | one entry site is left on the pinned path | `schedule.js`: revert `:417` to `const node = gen.nodePath();` | V3 (count becomes 5 / 1) — judged by reading the printed counts, not by exit status |
| 6 | the runtime role is dragged along with the entry role | `generators.js`: change `nodePath()`'s body to `return entryNodePath();` | existing `scheduler-generators.test.js:421` is **not** enough (an alias is still absolute) — T3 (AC5) goes red, because the descriptor digest then moves |

Row 6 is the subtle one and it is why T3 exists. `nodePath/wienerdogBin are
absolute` passes happily against an alias, so the existing suite does **not**
protect the role split. T3's digest-invariance assertion is what does.

### Test index (what to write, and where)

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/scheduler-generators.test.js | Table A rows 4–5 with an injected `realpath` — the positive, the different-inode negative, the throwing negative (AC1) |
| T2 | tests/unit/scheduler-generators.test.js | Table A rows 1–3, table-driven over the eight fixtures, with an `assert.fail()` realpath (AC2); plus the `node@22` / `/usr/local` / linuxbrew prefix-derivation positives |
| T3 | tests/unit/scheduler-generators.test.js | descriptor-digest invariance to `entryNodePath` (AC5, mutation row 6) |
| T4 | tests/unit/scheduler-generators.test.js | double-render byte-identity and repeat-call stability (AC6) |

Name every subtest with the prefix `node-path-durability:` **followed by one
space** so the verification commands can count them with one anchored grep,
exactly as `tests/unit/scheduler-entry-identity.test.js` does with its
`entry-identity:` prefix.

T2 must be **table-driven** over an array of `[input, why]` pairs, not eight
copy-pasted asserts — the array is the executable form of Table A rows 1–3 and a
new row is then one line.

For T3, build the fixture with the dev-install idiom already used in
`tests/unit/descriptor.test.js` and stub `gen.entryNodePath` by assigning to the
module object's property inside a `try`/`finally` that restores it. Do **not** add
a seam to `descriptor.js` — it is not a deliverable.

## Verification steps (run these; paste output in the PR)

Run everything from the repo root. **Every command below was executed against
unmodified `main` at `5f0ffc0` while this spec was written; the "on `main`" line
under each one is its real output there.**

**Three rules, and they are not the same rule.**

1. **Change checks** must print something different after the fix than on `main`.
   **V2, V3 and V6 are change checks.** V2's `main` count of `ℹ pass 79` is a
   **FAILURE** after implementation — T1–T4 add tests, so a run still reporting 79
   means no new direct evidence was written.
2. **Preservation checks** assert something did *not* move and are supposed to
   print the same thing before and after. The carve-out covers **exactly three
   results: V1's `ℹ fail 0` line, V4, and V5** — nothing else. V1's `ℹ pass` count
   is emphatically not covered; it is V2's input.
3. **Exit status is the verdict for V1 only.** V3, V4, V5 and V6 are judged by
   **reading the printed output** — `grep` exits 0 whether it prints six lines or
   one. Never report an exit 0 from those as a pass.

```bash
# V1 (PRESERVATION of `fail 0`; its `pass` count feeds V2). Must go through
#     `npm test --`, never a bare `node --test`: tests/run.js sets
#     WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the whole suite, and without it
#     scheduler-schedule.test.js drives the real OS scheduler.
npm test -- tests/unit/scheduler-generators.test.js \
            tests/unit/scheduler-schedule.test.js \
            tests/unit/sync-repoint.test.js
# on main (executed at 5f0ffc0):
#   ℹ tests 82 / ℹ suites 0 / ℹ pass 79 / ℹ fail 0 / ℹ skipped 3
# `ℹ fail 0` is the preservation result and must stay 0.

# V2 (CHANGE — anti-vacuity; judged by reading). Paste V1's three summary lines
#     verbatim. REQUIRED: `pass` strictly greater than 79 and `fail` exactly 0.
#     Then the anchored count of this WP's own named subtests:
npm test --silent -- --test-reporter=tap tests/unit/scheduler-generators.test.js \
  | grep -cE "^ok [0-9]+ - node-path-durability: "
# on main: 0.  REQUIRED after: >= 4 (one per T1–T4, more is fine).

# V3 (CHANGE — Table B row 1 / AC3; judged by reading the two counts).
echo "gen.nodePath():      $(grep -c 'gen\.nodePath()' src/cli/schedule.js)"
echo "gen.entryNodePath(): $(grep -c 'gen\.entryNodePath()' src/cli/schedule.js)"
# on main (executed):  gen.nodePath(): 6   /   gen.entryNodePath(): 0
# REQUIRED after:      gen.nodePath(): 0   /   gen.entryNodePath(): 6

# V4 (PRESERVATION — Table B row 2 / AC4; judged by reading).
grep -n "gen\.nodePath()" src/cli/run-job.js src/core/routine-runtime.js
# on main (executed), and REQUIRED to be IDENTICAL after:
#   src/cli/run-job.js:408:      return { command: gen.nodePath(), args: [...
#   src/cli/run-job.js:529:    gen.nodePath(),
#   src/core/routine-runtime.js:92:        command: gen.nodePath(),

# V5 (PRESERVATION — Table A row 5 / AC5; judged by reading).
grep -n "node: process.execPath" src/scheduler/descriptor.js
git diff --name-only main...HEAD
# on main (executed): src/scheduler/descriptor.js:215:    node: process.execPath,
# REQUIRED after: the same single line, AND descriptor.js absent from the
# name-only diff, which must list exactly the three Deliverables files plus this
# spec.

# V6 (CHANGE — AC8; judged by reading). The new function must add no process,
#     no timer and no require.
git diff main...HEAD -- src/scheduler/generators.js src/cli/schedule.js \
  | grep -E "^\+" | grep -nE "require\(|spawn|setInterval|setTimeout|exec\(" || \
  echo "OK: no new require/spawn/timer in the production diff"
# on main: n/a (empty diff). REQUIRED after: the OK line, with no matches above it.

# V7 — the boundary gate and the lint pipeline.
node scripts/boundary-check.js docs/specs/WP-scheduler-node-path-durability.md \
  src/scheduler/generators.js src/cli/schedule.js \
  tests/unit/scheduler-generators.test.js
npm run lint
npm test
```

## Out of scope (do NOT do these)

- **`src/scheduler/descriptor.js`.** Moving the descriptor's `node` field to the
  durable path would break every already-loaded macOS job — see Implementation
  notes, "Why the descriptor field stays". Routed as
  `WP-descriptor-node-field-stability`, which must land **after** the registration
  fix below.
- **The registration path's bare `launchctl bootstrap`** (`schedule.js:315`,
  `:431`). Making `sync` able to replace an already-loaded record is a real,
  separate defect with its own blast radius and an ADR-0018 amendment attached
  (that ADR's decision 2 grants the replace capability to the *heal* path only).
  Routed as `WP-scheduler-register-replaces-loaded-record`. Do not touch
  `darwinReplaceEntry` or either bootstrap call in this WP.
- **`docs/adr/0028-…:83`** ("`node` is `process.execPath` … and is not pinned").
  This WP makes that sentence false for the registered entry. An ADR is never
  edited from a WP (WP-114 Decision 5). Owner action; proposed slug
  `WP-adr-0028-entry-node-path-amendment`. Report it in the PR, do not edit it.
- **`WP-scheduler-stable-exec-position`** (the `<core>`-owned trampoline that makes
  the execution position *comparable*) and **`WP-scheduler-argument-tail-identity`**
  (authenticating `args[2..]`). Both are PR #114 follow-ups against the
  *substituted* half of the threat; this WP closes none of it and claims none of
  it.
- **nvm / fnm / volta / nodenv support.** Those layouts have no maintained stable
  alias, so Table A row 2 leaves them on the pin, where step 8b's attended
  detection is the safety net. Do not invent a Wienerdog-owned symlink for them —
  that is the trampoline WP's design space, not this one's.
- **Any change to `status.js`, `launcher.js`, `run-job.js` or the renderers.**
- **Windows-specific handling.** Table A row 1 makes the change a no-op there by
  construction; that is the whole Windows story for this WP.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, with V2's
   pass count strictly above 79 and V3's two counts flipped to 0 / 6.
2. Every Table E row demonstrated red (with the "selected exactly one named
   subtest" assertion) and the file restored byte-for-byte afterwards.
3. Conventional commits; PR titled
   `fix(scheduler): register entries against an upgrade-durable node path (WP-scheduler-node-path-durability)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. **Owner checklist (NOT performed by the implementer).** On a real Windows
   install, confirm `wienerdog doctor` still reports the scheduled tasks as
   `loaded` after a `wienerdog sync`, i.e. that Table A row 1's no-op leaves the
   Windows argline byte-identical. No Windows host was available while this spec
   was written; the Windows layout claim in Implementation notes is specified, not
   observed.
7. The PR body states the convergence limitation verbatim from "Convergence,
   stated exactly" and does **not** claim the incident class is closed.
