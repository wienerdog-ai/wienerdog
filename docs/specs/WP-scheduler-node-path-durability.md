---
id: WP-scheduler-node-path-durability
title: Register scheduler entries against an upgrade-durable node path, not a version-pinned Cellar path
status: Ready
model: sonnet
size: M
depends_on: [WP-scheduler-register-replaces-loaded-record]
adrs: [ADR-0004, ADR-0027, ADR-0028, ADR-0031]
epic: audit-a7
---

# WP-scheduler-node-path-durability: the entry's execution position survives `brew upgrade node`

> **DISPATCH BLOCKER — LIFTED 2026-07-28. History retained; do not delete.**
>
> **What the blocker said:** this WP must not be implemented or merged before
> `WP-scheduler-register-replaces-loaded-record` (the sibling that lets the macOS
> registration path replace an already-loaded launchd record). The reason was
> **Table D**: on an existing macOS install this WP changes the rendered bytes of
> every entry, the first `sync` is refused by launchd, and **every later `sync`
> then reports success while launchd still holds the pinned path** — turning a
> loud failure into a silent one for exactly the population this WP is meant to
> protect.
>
> **What lifted it (2026-07-28):**
> - **0a** — the sibling **spec exists** and its scope covers **both** of this
>   spec's Table C rows. Verified against `main`'s copy of that spec, not branch
>   history: its banner maps *"row 5 (macOS) — **both** bare-`bootstrap` sites"* to
>   its Table A rows 1 **and** 2, and *"row 4 (linux, degraded reload)"* to its
>   Table A row 3.
>   **CORRECTED 2026-08-02:** this sub-item previously read *"the sibling **merged
>   to `main` in PR #125 (`fbc9d80`)**"*, which invited — and received — the
>   reading that the fix had shipped. **It had not.** `git show --stat fbc9d80`:
>   that PR merged exactly **three files** — `docs/adr/0037-…md`,
>   `docs/adr/README.md`, and the sibling **spec document** — with **zero `src/`
>   and zero `tests/`**. What merged was the *design*, not the implementation. The
>   scope claim above is true and stands; the shipped claim is deleted.
> - **0b** — its id is now in this spec's `depends_on`, so the dependency is
>   **mechanically enforced** from here on: `scripts/check-frontmatter.js` rejects
>   an id that fails to resolve, and this one resolves against the merged spec.
>   That was the single point at which a tooling gate became reachable, and it is
>   taken.
> - **0c** — with 0a and 0b satisfied, `status:` moves `Draft` → `Ready`.
>
> **The enforcement caveat is now historical, and its resolution is the point.**
> While the blocker stood, nothing mechanical held it: the banner was prose and
> `status: Draft` a convention, because `check-frontmatter.js` never objects to an
> **empty** `depends_on`. That gap closed the moment 0b was taken — which is why
> 0b was specified as the lift's required step rather than a courtesy.
>
> **DISPATCH PRECONDITION — separate from the blocker above, and NOT discharged by
> it (added 2026-08-02, SATISFIED later the same day — both records retained).**
> `depends_on` resolving is **not** the dependency being
> done: `scripts/check-frontmatter.js` resolves an id to an existing spec **file**
> and never reads that spec's `status`. **Dispatch of this WP additionally requires
> `WP-scheduler-register-replaces-loaded-record` to be `Done` — merged and
> verified.** *(As written earlier on 2026-08-02: "it is `Draft` and absent from
> `docs/specs/done/`, i.e. **specced but unimplemented** … this WP is **not
> dispatchable today**". That statement was true when written and is retained as
> history; it is superseded by the record immediately below.)* This mirrors the
> completion-aware clause in `WP-adr-0028-entry-node-path-amendment` (AC5b): the
> ADR signature and this precondition are independent gates, and neither
> discharges the other.
>
> > **SATISFIED 2026-08-02.** `WP-scheduler-register-replaces-loaded-record` is
> > **`Done`** — implemented and merged as **PR #140** (merge commit **`7b22d71`**,
> > "fix(scheduler): verify what the OS holds before reporting a register
> > success"), which landed **266 lines into `src/cli/schedule.js`**, **132 into
> > `src/scheduler/generators.js`** and **1197 into
> > `tests/unit/scheduler-schedule.test.js`** — i.e. the *implementation*, not only
> > the design. It was then flipped `In-Review` → `Done` by **PR #143** and now
> > lives at `docs/specs/done/WP-scheduler-register-replaces-loaded-record.md`
> > (`status: Done`, verified in this worktree at `1093e51`). Post-merge suite on
> > `main` @ `1093e51`: **`ℹ tests 1897 / ℹ pass 1888 / ℹ fail 0 / ℹ skipped 9`**.
> > **Both dispatch gates are therefore closed** — this one, and Definition of done
> > item 8's ADR gate (see its own dated satisfaction record).
> >
> > **This is not a formality: it changed this spec's contract.** The landed
> > machinery replaced the bare-`bootstrap` sites this spec's Tables C/D were
> > written against. **Table C row 5 now converges**, **Table D's "false success"
> > rows are gone on both platforms**, and Current state §8 has been rewritten
> > against `ensureDarwinEntryRegistered`. Every one of those changes carries its
> > own dated reconciliation note citing PR #140. Read Tables C, D and G before
> > implementing — do **not** work from a memory of this spec's pre-#140 shape.
>
> **On `status: Ready` — the open question is now MOOT (recorded, not deleted).**
> The `Draft` → `Ready` flip was made in an owner-directed session, partly on 0a's
> **now-corrected sub-item — corrected in BOTH of its copies**, this banner and
> Definition of done item 0a, which no longer claim the sibling "has shipped" —
> so the flip is **not silently reverted**. The question posed on 2026-08-02 —
> *keep `Ready` with this explicit precondition, or return to `Draft` until the
> sibling ships?* — **no longer needs an answer: the sibling shipped.** `Ready`
> stands on the discharged precondition above, not on the flip's original
> reasoning. The question is retained so the record shows it was answered by
> events rather than dropped.

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

**TESTED SHA: `1093e51`.** Everything below was re-read and re-executed at commit
`1093e51` on macOS 26 (Apple Silicon, Homebrew prefix `/opt/homebrew`) on
**2026-08-02**. **Line numbers are `1093e51`'s.**

**Why this section was re-derived (2026-08-02, PR #140).** It was originally
written at `5f0ffc0`. **PR #140** (`WP-scheduler-register-replaces-loaded-record`,
merge `7b22d71`) then rewrote the exact register machinery this WP touches — +266
lines in `src/cli/schedule.js`, +132 in `src/scheduler/generators.js`, +1197 in
`tests/unit/scheduler-schedule.test.js`. Every executable claim below was re-run
against `1093e51`; the outcome per subsection is recorded inline as **HOLDS**
(fact and line number unchanged), **MOVED** (fact unchanged, line number
re-anchored) or **REWRITTEN** (the code the claim described no longer exists).
`5f0ffc0`'s numbers are retained in parentheses where they moved, so the
provenance is auditable rather than silently overwritten.

### 1. `generators.nodePath()` — `src/scheduler/generators.js:16-22` (HOLDS)

```js
/**
 * Absolute path to the node binary that will run wienerdog under the scheduler.
 * @returns {string} process.execPath (already absolute).
 */
function nodePath() {
  return process.execPath;
}
```

It is exported at **`generators.js:1125`** (MOVED — was `:997` at `5f0ffc0`;
PR #140 added 132 lines to this file, all of them *below* `nodePath`, so the
function itself did not move). The claim that the pin lives at `generators.js:20` is
**re-confirmed at `1093e51`**: line 20 is the `function nodePath() {` line and
line 21 is `return process.execPath;`.

### 2. `nodePath()` has TWO roles, and only one of them is the hazard (MOVED — all nine line numbers)

Re-executed at `1093e51`. **The count is unchanged — six ENTRY, three RUNTIME —
and so is every function these sites sit in; only the line numbers moved.**

```
$ grep -rn "gen\.nodePath()" src/
src/cli/schedule.js:477      ensureCatchup           → catchupPlist({node})            ENTRY
src/cli/schedule.js:536      ensureWindowsCatchup    → windowsCmdArguments({node})     ENTRY
src/cli/schedule.js:611      registerPlatformEntries → launchdPlist/systemdService/…   ENTRY
src/cli/schedule.js:856      repairCatchup (darwin)  → catchupPlist({node})            ENTRY
src/cli/schedule.js:885      repairCatchup (win32)   → windowsCmdArguments({node})     ENTRY
src/cli/schedule.js:970      reloadJob               → launchd/systemd/schtasks        ENTRY
src/cli/run-job.js:439       resolveCommand          → spawnSync THIS process's child  RUNTIME
src/cli/run-job.js:579       defaultSendAlert        → spawnSync THIS process's child  RUNTIME
src/core/routine-runtime.js:92  broker MCP config    → spawned by THIS run             RUNTIME
```

`5f0ffc0`'s numbers, retained for provenance: `:303 :342 :417 :638 :667 :752`
(schedule.js), `:408 :529` (run-job.js), `:92` (routine-runtime.js — unmoved).

The six **ENTRY** sites write a string into a file that the OS keeps and re-reads
days later; a path that dies between writes is fatal there. The three **RUNTIME**
sites spawn a child from a process that is *already* running under
`process.execPath` at that instant; the path cannot go stale between the read and
the spawn, and WP-154's exec-identity discipline deliberately wants
`process.execPath` there (never a PATH lookup, never an interpreter chosen by a
symlink). **This WP separates the two roles and changes only the ENTRY one.**

**NEW at `1093e51` — three of the six ENTRY sites are now HOISTED `const node`,
and two of those also feed a READBACK EXPECTATION.** This is the single most
important structural change PR #140 made to this WP's surface, and Implementation
notes §D2 states the rule it creates:

| Site | Form | What the value feeds |
|------|------|----------------------|
| `:477` `ensureCatchup` | `const node = gen.nodePath();` | `gen.catchupPlist({node, …})` (`:481`) **and** `expect.argv[0]` (`:500`) |
| `:536` `ensureWindowsCatchup` | inline `node: gen.nodePath(),` | `gen.windowsCmdArguments` only |
| `:611` `registerPlatformEntries` | `const node = gen.nodePath();` | `gen.launchdPlist` (`:621`) **and** `expect.argv[0]` (`:633`); also `gen.systemdService` (`:661`) and the win32 `argline` (`:716`) |
| `:856` `repairCatchup` (darwin) | inline `node: gen.nodePath(),` | `gen.catchupPlist` only (this leg calls `darwinReplaceEntry`, which builds no `expect`) |
| `:885` `repairCatchup` (win32) | inline `node: gen.nodePath(),` | `gen.windowsCmdArguments` only |
| `:970` `reloadJob` | `const node = gen.nodePath();` | `gen.launchdPlist` (`:979`) and `gen.systemdService` (`:991`); this leg calls `darwinReplaceEntry` (`:982`), which builds no `expect` |

At `5f0ffc0` only **two** sites were `const node = …` (`:417`, `:752`) and **no**
site fed a readback expectation, because no readback existed. Both facts changed.

### 3. The renderers write `o.node` verbatim — no escaping question is opened (HOLDS)

`launchdPlist` (interpolation at `generators.js:364`, function at `:354`; and
`catchupPlist`'s at `:407`, function at `:397`) emits
`<string>${xmlEscape(o.node)}</string>`; `systemdService` (`generators.js:482`,
function at `:474`) emits `ExecStart=${systemdQuote(o.node)} …`;
`windowsCmdArguments` (`generators.js:606`, function at `:598`) emits
`"${cmdQuotedToken(o.node)}"`.
Each already escapes for its own format. **This WP does not touch a renderer.**
Re-verified at `1093e51`: **all four interpolation line numbers are unchanged** —
PR #140's additions to this file land below them.

### 4. The measured Homebrew layout (executed 2026-07-28; RE-EXECUTED 2026-08-02 at `1093e51` — byte-identical output)

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

### 5. The live entry on this machine, and the live launchd PATH (RE-EXECUTED 2026-08-02 — byte-identical output)

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

The live entry is **still pinned to the Cellar path at `1093e51`** — PR #140
changed how a register is *verified*, not what node path is *rendered*, so the
hazard this WP addresses is untouched by it and remains live on this machine.

### 6. What already exists downstream — detection, and the heal set (HOLDS, one MOVED cite)

`src/scheduler/status.js:125-133` (`defaultProbe` step 8b, shipped by
`WP-scheduler-entry-identity`) — **line numbers unchanged at `1093e51`**:

```js
  // 8b — a `match` proves only that OUR launcher sits in the launcher position.
  // The program the OS will actually START is `exec`; when it no longer exists
  // (a `brew upgrade node && brew cleanup` deletes the version-pinned execPath
  // the entry was registered with) every fire dies in posix_spawn before a line
  // of Wienerdog code runs. […]
  if (typeof exec === 'string' && exec !== '' && fs.existsSync(exec)) return 'loaded';
  return 'mismatched';
```

`HEAL_SET` is `{missing, mismatched, unverified}` (`status.js:80` — unchanged),
and `reloadMissing` (`status.js:354-392` — unchanged; called from
**`src/cli/sync.js:241`**, MOVED from `:240`) heals
those by calling `schedule.reloadJob`, which on darwin uses `darwinReplaceEntry`
(`schedule.js:51-55` — **unchanged, and NOT superseded by PR #140**: bootstrap
first, `bootout` + bootstrap only after launchd refuses). So the *detection and
repair* machinery for a dead execution position is already shipped and is not
re-implemented here.

**Note the two-helper split PR #140 created, because it is easy to conflate them.**
`darwinReplaceEntry` (`:51-55`) is the **heal** path's unconditional replace and is
still what `reloadJob` (`:982`) and `repairCatchup` (`:869`) call.
`ensureDarwinEntryRegistered` (`:175-227`) is the **register** path's new
evidence-driven helper and is what `ensureCatchup` (`:495`) and
`registerPlatformEntries` (`:628`) call. They are different functions with
different rules; §8 below governs the register path only.

### 7. The descriptor's `node` field — NOT touched by this WP (HOLDS, one MOVED cite)

`src/scheduler/descriptor.js:215` writes `node: process.execPath` into the job
descriptor (**line unchanged at `1093e51`**), and that field is digest-covered
(**`docs/GLOSSARY.md:26`**, MOVED from `:25`, lists "the
running `node` path" among the digest-covered fields of the **job descriptor**
entry; the dev reduction excludes only `appRelease.treeDigest`/`version`). The
**descriptor digest** is bound into
the entry argv as `--expect-digest` and re-derived by the launcher at fire time.
Changing what goes in that field would change every existing descriptor digest.
**Table A row 6 forbids touching it, and Implementation notes §"Why the
descriptor field stays" gives the executed reason.**

### 8. The registration path CAN now replace an already-loaded macOS record — **REWRITTEN 2026-08-02 (PR #140)**

> **What this section said before, retained so the change is auditable and not a
> silent rewrite.** At `5f0ffc0` it read: *"The registration path cannot replace an
> already-loaded macOS record."* `registerPlatformEntries` (`schedule.js:430-431`)
> and `ensureCatchup` (`:315`) each wrote the file and then called a **bare**
> `launchctl bootstrap` gated on `if (changed)`; bare `bootstrap` fails on an
> already-loaded label, so *"the new plist bytes land on disk but launchd keeps
> serving the old record until something calls `reloadJob`"*. That was called a
> pre-existing defect, **explicitly not fixed here**, and it is the entire reason
> this WP carried a DISPATCH BLOCKER.
>
> **Both of those code sites no longer exist.** PR #140 (merge `7b22d71`) deleted
> them. The defect they described is **fixed**, by the very sibling this spec's
> `depends_on` names. Everything below describes `1093e51`.

**The register path is now evidence-driven.** `ensureCatchup` (`:495`) and
`registerPlatformEntries` (`:628`) both call one helper:

```js
    const changed = ensureEntry(manifest, plistPath, content, unload);
    const loaded = ensureDarwinEntryRegistered(loader, uid, label, plistPath, {
      changed, priorBytes, canonicalBytes: Buffer.from(content),
      expect: {
        argv: [node, ...gen.jobLaunchArgs({ launcher: b.launcher, name: o.name, … })],
        hour: o.hour, minute: o.minute,
        env: gen.scheduledEnvPairs(paths.home, paths.core),
        path: plistPath,
        stdoutPath: …, stderrPath: …, spawnType: 'background',
      },
      onBeforeTeardown: () => require('../scheduler/status').refreshSchedulerStatus(paths),
    });
```

**`ensureDarwinEntryRegistered` (`schedule.js:175-227`)**, in the order it runs:

1. `launchctl print gui/<uid>/<label>` — **one** read-only readback, ungated by
   `changed`. Not loaded ⇒ `verdict = 'absent'`.
2. `darwinLoadedVerdict(stdout, expect)` (`schedule.js:112-157`) — pure string work
   over that stdout, returning **`'match' | 'mismatch-fatal' | 'mismatch-benign' |
   'indeterminate'`**.
3. `verdict === 'match'` ⇒ **return true, zero OS mutations, regardless of
   `changed`** (`:184`).
4. Otherwise a **non-destructive `bootstrap`** is attempted (`:195`); on exit 0 a
   **post-bootstrap `verifyLoaded()`** re-prints and requires `'match'` (`:189-193`).
5. On bootstrap failure: `plutil -lint` preflight (`:201-203`), then **teardown
   ONLY on `'mismatch-fatal'`** (`:208`) — `bootout` + `bootstrap` + `verifyLoaded()`.
6. On a failed replacement: **rollback** to `priorBytes` and re-bootstrap (`:218-225`).
   Never returns true.

**The two comparisons that decide this WP's fate are both FATAL-tier**
(`schedule.js:134-139`):

```js
  let fatal =
    argv.length !== expect.argv.length ||
    !argv.every((a, i) => a === expect.argv[i]) ||   // ← argv[0] IS the node path
    program !== expect.argv[0] ||                    // ← and so is `program`
    cal.hour !== expect.hour || cal.minute !== expect.minute;
```

The sibling's own canonical Table A2b tiers `program` **FATAL** with this
justification, quoted verbatim from
`docs/specs/done/WP-scheduler-register-replaces-loaded-record.md:667`:

> *"a different interpreter in the execution position is the
> `WP-scheduler-node-path-durability` hazard — the fire dies before any of our code
> runs"*

**So the sibling was designed with this WP in mind, and the interlock is exact:**
changing the entry's node path changes `expect.argv[0]`, which changes **both**
FATAL comparisons, which yields **`'mismatch-fatal'`** — the **one** verdict that
authorizes teardown-and-replace (sibling Table A1, `:576-624`). This WP's change is
therefore not merely *tolerated* by the new machinery; it lands on precisely the
decision row that converges it. **Tables C and D are re-derived from this.**

**The linux arm was restructured too** (`schedule.js:666-681`). `daemon-reload` and
`enable --now` are now **hoisted out of `if (changed)`** — they run on every
register — and `loaded` is gated on **both**:

```js
    const reloadOk = !!reload && reload.status != null && reload.status === 0;
    if (!reloadOk) { /* warn on stderr, every register */ }
    const enableOk = loader(['systemctl','--user','enable','--now',`${unitBase}.timer`]).status === 0;
    const loaded = reloadOk && enableOk;
```

At `5f0ffc0` `loaded` was `enableOk` alone and the reload was best-effort and
ungated, which is exactly what made old Table C row 4 silent. **That is fixed.**

### 9. **NEW (2026-08-02) — the premise §8's convergence rests on, and the experiment that SETTLED it**

§8's convergence argument assumes launchd's `launchctl print` **echoes
`ProgramArguments[0]` verbatim** into both the `arguments` block and the `program`
line — i.e. that it does **not** realpath-resolve the program path at load. This
WP registers a **symlinked** node path for the first time, so it is the first
change that can tell the difference, and the assumption was never load-bearing
before it. **Table G is canonical; this section records what was run.**

> **SETTLED 2026-08-02 — P is TRUE, by direct experiment.** Executed at the
> **orchestrator** layer on the owner's machine (macOS 26, launchd, uid 501), not
> by the spec-authoring pass — see "what could not be run here" below for why the
> split matters.
>
> **Method.** A throwaway plist with `Label ai.wienerdog.premise-check` and
> `ProgramArguments = ["/opt/homebrew/opt/node/bin/node", "-e", "process.exit(0)"]`.
> **The discriminating feature is the program path**: `/opt/homebrew/opt/node` is a
> **symlinked directory** (→ `../Cellar/node/25.9.0_2`), so the literal path
> `/opt/homebrew/opt/node/bin/node` and its realpath
> `/opt/homebrew/Cellar/node/25.9.0_2/bin/node` **differ**. A verbatim echo and a
> resolving echo predict different strings; the live `dream` record could not
> distinguish them because its `ProgramArguments[0]` is already its own realpath.
> `plutil -lint` OK; `launchctl bootstrap gui/501 <plist>` exit 0.
>
> **Readback** — `launchctl print gui/501/ai.wienerdog.premise-check`:
>
> ```
> path = <the scratch plist path>
> program = /opt/homebrew/opt/node/bin/node
> arguments = { /opt/homebrew/opt/node/bin/node, -e, process.exit(0) }
> ```
>
> **Result: BOTH `program` and the `arguments` block echo the alias VERBATIM.**
> launchd does **not** realpath-resolve the program path at load. **P is TRUE**,
> and Table C row 5 / Table D-a hold exactly as written.
>
> **Teardown — zero residue.** `launchctl bootout` exit 0; post-`bootout`
> `launchctl print` exit **113** (absent); the scratch plist deleted. **The real
> `ai.wienerdog.dream` label was untouched throughout** — the experiment used its
> own label and never went near it.

**What could NOT be run here, and why that is still the right boundary.** A
spec-authoring pass may read the machine but not mutate it: bootstrapping even a
throwaway label changes the user's launchd state, and an architect does not do that
unilaterally. That constraint is unchanged and is why this section originally
recorded an *unverified premise* instead of guessing. It was lifted by escalating
the experiment to the layer that could authorize it, with a scratch label and full
teardown — **not** by relaxing the rule.

**The corroborating evidence that was already executed**, and which the experiment
promoted from suggestive to confirmed. The sibling captured a real `launchctl print`
dump on this same host
(`docs/specs/done/WP-scheduler-register-replaces-loaded-record.md:280-293`):

```
gui/501/ai.wienerdog.dream = {
        path = /Users/gyulafeher/Library/LaunchAgents/ai.wienerdog.dream.plist
        program = /opt/homebrew/Cellar/node/25.9.0_2/bin/node
        …
        properties = inferred program
}
```

`properties = inferred program` says launchd **derived** `program` from
`ProgramArguments[0]` (the plist carries no `Program` key). Combined with this
spec's Context paragraph — after `brew upgrade node` deletes the Cellar directory
the loaded record *"stays correct"* and `launchctl print` *"still exits 0"*, while
the fire dies in `posix_spawn` — the evidence points strongly at **store-verbatim,
resolve-at-spawn**.

**Why this dump alone was not enough** *(the reasoning that motivated the
experiment, retained)*. The live entry's
`ProgramArguments[0]` is already the realpath, so this dump cannot distinguish
"echoed verbatim" from "resolved, and the two happen to be equal". Settling it
required either a loaded job whose program path is a symlink, or bootstrapping a
throwaway label. **The scratch-label experiment above supplied exactly that missing
discrimination**, which is why the premise moved from *specified, not observed* to
**observed and true** rather than staying a residual like the Windows layout claim
(Implementation notes §"Windows", WP-114 Residual 2 precedent — **that one is still
unverified; only this premise was settled**).

**Table G is canonical** for the premise, its executed result, and the retained
history of the branch that did not occur. Definition of done item 9 is now a
**live smoke test**, not a premise gate.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing (recorded, not left implicit).** One new pure function plus its export in
`generators.js`; six one-token call-site swaps in `schedule.js`; one test file
extended. No renderer, no descriptor, no ADR, no glossary, no runbook. **M** — one
session. It is not split further: the function and its six call sites are
meaningless apart, and splitting them would ship an exported function nothing
calls.

**Re-confirmed 2026-08-02 against `1093e51` (PR #140).** The sizing is
**unchanged**: still six sites, still one-token swaps, still no new file. PR #140
grew `schedule.js` by 266 lines but added **zero** new `gen.nodePath()` call sites
(V3's `main` count is still exactly 6 — re-executed). Three of the six are now
hoisted `const node` rather than two, which *shrinks* the edit if anything, and
adds the D2 consistency rule rather than a new deliverable.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | **D1** — add `entryNodePath(execPath?, opts?)` per Table A and export it. `nodePath()` keeps its body **byte-for-byte** (Table A row 6, Table B row 2). No renderer, no other function. |
| modify | src/cli/schedule.js | **D2** — replace `gen.nodePath()` with `gen.entryNodePath()` at exactly the six ENTRY sites, **re-anchored to `1093e51`: `:477`, `:536`, `:611`, `:856`, `:885`, `:970`** (Current state §2; `5f0ffc0`'s `:303 :342 :417 :638 :667 :752` are dead line numbers — do not use them). Nothing else in this file changes: **no change to `ensureDarwinEntryRegistered`, `darwinLoadedVerdict`, `darwinReplaceEntry`, the `plutil` preflight, the linux `reloadOk`/`enableOk` gate**, no probe change, no notice change. |
| modify | tests/unit/scheduler-generators.test.js | **T1, T2, T4 and T5** — the exact set in the Test index. **There is no T3** (round 1's descriptor-digest test was vacuous and is deleted — see AC5), and **T5 is not optional**: it is the ONLY detector for Table E row 7, the role split. Building T1/T2/T4 without T5 reproduces the round-1 test set that shipped an undetectable mutation. The existing test at `:421` (`nodePath/wienerdogBin are absolute`) must pass **unmodified** — and note it does **not** protect the role split, which is exactly why T5 exists. |

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
 * @returns {*} the durable alias (always a string), OR `execPath` returned
 *   **verbatim** — including when `execPath` is not a string at all, which is a
 *   caller bug this function passes through rather than masks (Table A row 1).
 *   The type is deliberately `*` and not `string`: an earlier draft wrote
 *   `{string}`, which contradicted row 1.
 */
function entryNodePath(execPath = process.execPath, opts = {})
```

**The default parameter and row 1 do not overlap.** `undefined` never reaches
row 1's type test — the default fires first and substitutes `process.execPath`.
Row 1 therefore governs `null`, numbers, objects and non-absolute strings only,
and every test fixture for it must be a **literal** such value (`null`, `42`),
never `undefined`.

Example input → output pairs (all from Table A; every arithmetic claim below was
executed with `p.split('/')` before being written):

```
/opt/homebrew/Cellar/node/25.9.0_2/bin/node    → /opt/homebrew/opt/node/bin/node
/usr/local/Cellar/node@22/22.14.0/bin/node     → /usr/local/opt/node@22/bin/node
/home/linuxbrew/.linuxbrew/Cellar/node/24.0.1/bin/node
                                               → /home/linuxbrew/.linuxbrew/opt/node/bin/node
/home/u/.nvm/versions/node/v22.1.0/bin/node    → (unchanged — row 2, parts[i]='versions')
/usr/bin/node                                  → (unchanged — row 2, length 4 < 6)
/opt/homebrew/Cellar/node/25.9.0_2/bin/x/node  → (unchanged — row 2, parts[i]='node')
/opt/homebrew/Cellar/pnpm/9.0.0/bin/node       → (unchanged — row 3, formula 'pnpm')
/opt/homebrew/Cellar/../1.0.0/bin/node         → (unchanged — row 3, formula '..')
/opt/homebrew/Cellar/node/../bin/node          → (unchanged — row 4, version '..')
/opt/homebrew/Cellar/node/beta/bin/node        → (unchanged — row 4, version 'beta')
C:\Program Files\nodejs\node.exe                → (unchanged — row 1, no leading '/')
null                                           → null (unchanged — row 1)
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
important property of the whole change; Table A row 6 and AC5 pin it.

## Contract reference

**Activation (ADR-0031, 2-of-7): three triggers fire, so the discipline is on.**
(i) an interface **shape** changes — a new exported function joins the generator
surface and one of two now-distinct node-path roles is re-pointed at it;
(iv) **fallback/precedence** behavior is introduced — six ordered conditions
decide whether the alias or `execPath` wins, and the fail-safe direction must be
identical in all **five** failure conditions; (vii) the same rule is restated
across Deliverables cells, acceptance criteria, verification greps, Current-state
and the operative prose. **Six canonical tables** below (A: the return rule; B:
the role split; C: post-`sync` convergence; D: what `sync` reports; F: the fixture
arithmetic; **G (added 2026-08-02): the macOS readback-echo premise**); every
mirror is registered under them.

Round 1 shipped only A and B, and the review found the consequences in exactly the
places the missing tables would have covered: the convergence limitation lived in
prose while the acceptance criteria implied the opposite (→ C and D), and the
fixture arithmetic was never written down, so four fixtures did not reach the gate
they claimed to test (→ F).

### Table A — what `entryNodePath(exec)` returns (canonical)

Conditions are evaluated **in order**; the first that holds decides. `exec` is
the argument (default `process.execPath`, so `undefined` never reaches row 1);
`parts = exec.split('/')`, `i = parts.length - 5`; `RP` is `opts.realpath`
(default `fs.realpathSync`). `ALIAS` is defined under the table.

**Rows 3 and 4 are separate rows on purpose.** A round-1 draft fused the formula
and version gates into one row, and the consequence was that neither gate had a
mutation that could isolate it and one of them had no fixture that reached it at
all. One gate per row, one fixture per row, one mutation per row.

| # | Condition | Returns | Why this is the fail-safe answer |
|---|-----------|---------|----------------------------------|
| 1 | `typeof exec !== 'string'`, or `exec[0] !== '/'` | `exec` **verbatim** | A non-POSIX or non-absolute value has no Homebrew shape. This is also the **Windows** answer by construction: a `C:\…\node.exe` never starts with `/`. `undefined` is out of scope here — the default parameter consumed it. |
| 2 | `parts.length < 6`, or `parts[i] !== 'Cellar'` | `exec` | The tail is not `Cellar/<formula>/<version>/bin/node`. nvm, fnm, volta, nodenv, distro packages and the official installer all land here — as does a Cellar path with `Cellar` at any *other* depth. `parts.length < 6` is the same condition as `i < 1`, written once, in the table, in the form the code uses. |
| 3 | `formula` (= `parts[i+1]`) fails `/^node(@[0-9]+(\.[0-9]+)*)?$/` | `exec` | Not a node keg. **This is the only one of the two identifier gates that is security-relevant** — `formula`, not `version`, is what gets concatenated into `ALIAS`. |
| 4 | `version` (= `parts[i+2]`) fails `/^[0-9][0-9A-Za-z._+-]*$/` | `exec` | Keg-shape narrowing: a real Homebrew version segment starts with a digit (`25.9.0_2`, `22.14.0`). `version` never enters `ALIAS`; this row exists to keep the match tight, not to stop traversal. |
| 5 | `RP(ALIAS)` throws, **or** `RP(ALIAS) !== RP(exec)` | `exec` | The alias is absent, or it currently names a **different** binary. **This row, not rows 2-4, is the security boundary** — see below. |
| 6 | otherwise | `ALIAS` | The alias exists and is provably the same file as the running interpreter, and Homebrew repoints it on upgrade. |

`ALIAS` derivation, from the same `parts`:
`prefix = parts.slice(0, i).join('/')`, `formula = parts[i+1]`, then
`ALIAS = prefix + '/opt/' + formula + '/bin/node'`.
Note what is **absent**: `version` appears nowhere in `ALIAS`. A round-1 draft's
security rationale claimed otherwise and was wrong; row 4's justification above is
the corrected one.

**Why row 5 is the security boundary.** `RP(ALIAS) === RP(exec)` means `ALIAS`
resolves to the *same inode* as the interpreter that is running. Any `ALIAS` that
passes therefore names the correct binary **by construction**, whatever
lexical shape it has — so no traversal or oddity in rows 2-4 can produce a *wrong*
execution position, only an ugly one. Rows 2-4 are cheap narrowing that keep the
derived path canonical and keep the common case from touching the filesystem at
all; row 5 is what makes the result correct. This is the corrected version of the
round-1 rationale.

**Row 6 has a second, non-obvious half that is part of this contract:**
`nodePath()` still returns `process.execPath`, unchanged, and
`src/scheduler/descriptor.js:215` still writes `node: process.execPath`. No
descriptor digest changes, so no `--expect-digest` changes, so nothing already
registered has to be re-minted for this WP.

### Table B — role split (canonical)

| Role | Function | Call sites | Value | Rule |
|------|----------|-----------|-------|------|
| Entry (written into a file the OS keeps) | `entryNodePath()` | `schedule.js` `:303 :342 :417 :638 :667 :752` | Table A | must survive a package upgrade |
| Runtime (spawn a child of this process) | `nodePath()` | `run-job.js:408`, `run-job.js:529`, `routine-runtime.js:92` | `process.execPath` | must be the exact running interpreter (WP-154) |
| Authorization record (digest-covered) | *(inline)* `process.execPath` | `descriptor.js:215` | `process.execPath` | **unchanged** — see Table A row 6 |

### Table C — post-`sync` convergence, by platform and starting state (canonical)

This table was prose in round 1. It is now a canonical contract table, because the
round-1 acceptance criteria asserted file idempotence and let a reader infer
scheduler-state convergence from it — which rows 4 and 5 showed is false.

**Rows 2 and 3 were one fused "linux / windows" row until round 3.** They are
split because the two platforms behave *differently*. Do not re-fuse them.

> **RECONCILED 2026-08-02 against `1093e51` (PR #140, merge `7b22d71`) — read this
> before the table.** The prerequisite
> `WP-scheduler-register-replaces-loaded-record` **landed**, and it changed the
> mechanism behind three of these rows. The verdicts below are **re-derived from
> the code at `1093e51`**, not carried forward. Two rows changed outcome:
>
> | Row | Verdict at `5f0ffc0` | Verdict at `1093e51` | Why it changed |
> |---|---|---|---|
> | 4 (linux, degraded reload) | **NO**, and *silently* reported as success | **NO**, but **LOUD and retried on every `sync`** | `loaded = reloadOk && enableOk` (`:681`); reload hoisted out of `if (changed)` (`:671`) |
> | 5 (macOS, healthy loaded record) | **NO**, and silently reported as success | **YES — converges on the FIRST `sync`** | `ensureDarwinEntryRegistered` replaces on `'mismatch-fatal'`, and this WP's change *is* a FATAL-tier change (Current state §8) |
>
> **Row 5 flipping is a settled contract row changing outcome, so it is recorded
> as a reconciliation and not rewritten in place.** The old row-5 text is retained
> verbatim in the row's own cell. Nothing about `entryNodePath` or the six swaps
> changed; only what the OS does with the bytes afterwards.
>
> **Row 5 rests on Table G, and Table G is SETTLED.** Row 5's convergence requires
> launchd to echo the symlinked `ProgramArguments[0]` verbatim into `program`
> rather than realpath-resolving it. That premise was **executed and confirmed
> TRUE on 2026-08-02** (Current state §9 — scratch label with a discriminating
> literal ≠ realpath path; full teardown). **Row 5 is therefore an observed
> outcome, not a conditional one.**
>
> **Row 7 is NEW.** It is the residual that survives the sibling's landing.

| # | Platform + starting state | Unit/plist/XML on disk | What the OS actually holds afterwards | Converged? |
|---|---------------------------|------------------------|---------------------------------------|-----------|
| 1 | any platform, job registered for the first time after this ships | durable path | durable path | **yes** |
| 2 | **windows (schtasks)**, existing job, first `sync` | durable path | durable path — `ensureWindowsTaskRegistered` (**`schedule.js:412-417`**, MOVED from `:240-245`; body unchanged by PR #140) forces `schtasks /create /f` whenever `o.changed`, and even when unchanged it re-reads the LOADED task and force-creates on any mismatch | **yes** |
| 3 | **linux (systemd)**, existing job, first `sync`, `daemon-reload` **succeeds** | durable path | durable path — systemd re-reads the unit files, then `systemctl --user enable --now` (**`schedule.js:680`**, MOVED from `:466`) starts the reloaded timer | **yes** |
| 4 | **linux (systemd)**, existing job, first `sync`, `daemon-reload` **degraded** | durable path | **possibly still the pinned Cellar path** — systemd may be serving stale units. *(At `5f0ffc0`: "`daemon-reload` is explicitly best-effort and **not gated**; only `enable --now` counts … while `loaded` is reported `true`". **That is no longer the code.** At `1093e51` `loaded = reloadOk && enableOk` (`:681`), so a degraded reload reports `loaded:false`, and reload+enable are **hoisted out of `if (changed)`** (`:666-681`) so both are **retried on every later `sync`** until the reload succeeds.)* | **NO** — but no longer silent, and self-retrying (Table D-b) |
| 5 | **macOS, existing job whose loaded record is healthy** | durable path | **the durable path, on the first `sync`** — `ensureEntry` reports `changed`, the readback grades the loaded record `'mismatch-fatal'` (this WP changes `expect.argv[0]`, which is compared **twice** at FATAL tier: as `arguments[0]` and as `program` — Current state §8), the non-destructive `bootstrap` is refused, `plutil -lint` passes, and `bootout` + `bootstrap` + `verifyLoaded()` replace the record. *(At `5f0ffc0` this row read: "**still the pinned Cellar path** — the bare `launchctl bootstrap` is refused because the label is already loaded". The bare bootstrap no longer exists.)* | **YES** (changed 2026-08-02, PR #140) |
| 6 | macOS, existing job, after the Cellar path is deleted | durable path | durable path — step 8b grades the entry `mismatched`, it enters the heal set, `reloadJob` → `darwinReplaceEntry` boots out and re-bootstraps | **yes**, one upgrade late — **now a backstop rather than the primary path**, since row 5 converges at the first `sync` |
| 7 | **NEW (2026-08-02) — macOS, existing job whose `launchctl print` readback is `'indeterminate'`** (degraded, truncated or format-skewed output: any of `arguments`, calendar, `environment`, `path`, `program`, either log path or `spawn type` fails to parse — `schedule.js:124-130`) | durable path | **still the pinned Cellar path** — `'indeterminate'` is the *absence of evidence*, so it buys the non-destructive `bootstrap` attempt (refused on a loaded label) and **explicitly never authorizes a teardown** (`:208`, sibling Table A1) | **NO** — but reported `loaded:false` and **re-attempted on every `sync`** (the readback is ungated by `changed`), so it is loud and never falsely converged |

**Row 6 has NO Linux analogue.** `deriveIdentityArgv` returns
`{kind:'systemd', argv:null}` for a `.timer` basename — the identity query is
*declared unimplemented* (`generators.js:178-180` — **unchanged at `1093e51`**) —
so `defaultProbe` step 6 returns `'unknown'`, which is **not** in `HEAL_SET`
(`status.js:80`). The shipped test
`entry-identity: a systemd entry yields unknown, not a health claim`
(`tests/unit/scheduler-entry-identity.test.js:423-430` — unchanged) pins exactly
that. A Linux entry therefore never enters the heal set, never reaches step 8b's
execution-position existence check, and never self-repairs the way row 6 does.

**Be precise about that — `reloadJob`'s linux `daemon-reload`
(`schedule.js:995`, MOVED from `:777`) IS reachable on Linux, just never for row
4.** A timer that is absent or inactive makes the step-3 probe
(`systemctl --user is-active …`) exit non-zero, so `defaultProbe` step 4 returns
`'missing'`, which **is** in `HEAL_SET`, and `reloadJob` runs. What row 4 describes
is an **active** timer running from stale units: `is-active` exits 0, so step 4
does not apply, and the entry short-circuits at step 6 to `'unknown'` before any
identity or execution-position check. So Linux has a heal path for *absent*
timers and **no** heal path for *stale-but-running* ones. **What PR #140 added is
not a heal path but a `register` path that keeps retrying and keeps reporting** —
which is why row 4 is no longer the silent failure it was.

### Table D — what `wienerdog sync` REPORTS in Table C rows 4, 5 and 7 (canonical)

> **RECONCILED 2026-08-02 (PR #140). This table's central finding is DISCHARGED.**
> At `5f0ffc0` both sub-tables ended in a **false success**: a later `sync` made
> **zero** OS calls, told the user **nothing**, and left the pinned path in place.
> That row — *"the last row of each sub-table is the false success"* — was the
> substance of the round-1 and round-2 blocking findings and **the entire reason
> this WP carried a dispatch blocker**.
>
> **Both false-success rows are gone at `1093e51`**, by two independent
> mechanisms, neither of which is in this WP's Deliverables:
> - **macOS:** the readback runs on **every** register, ungated by `changed`, so
>   there is no "bytes now identical ⇒ zero OS calls" path any more. A later `sync`
>   makes **two** read-only `print`s (per-job + catch-up — see D-a's call-count
>   scoping), grades both `'match'`, and is correct to be silent.
> - **linux:** `daemon-reload` + `enable --now` are **hoisted out of
>   `if (changed)`**, so a degraded reload re-warns and re-reports **on every
>   `sync`**, never once.
>
> The old rows are retained below, struck through in prose rather than deleted, so
> the record shows what was fixed rather than implying it was never true.

Every literal below is quoted **byte-exact from source at `1093e51`** (round 2
shipped two that were not, and AC9 copies this table into the merge artifact).

**D-a — macOS (Table C row 5), at `1093e51`.**

**Call-count scoping — read before reproducing this table (CORRECTED 2026-08-02).**
The **OS calls** column below is scoped to the **per-job helper**
(`ensureDarwinEntryRegistered`, one invocation), **not** to a whole `sync` run.
That is deliberate, and it follows the landed sibling's own canonical rule
(`docs/specs/done/WP-scheduler-register-replaces-loaded-record.md:1881-1883`),
quoted verbatim:

> *"A full darwin `registerPlatform` on an unchanged healthy install therefore
> issues **two** read-only `print`s and zero mutating calls. Assert per helper, or
> assert two through the full path — never 'exactly one' through the full path."*

The multiplier is `registerPlatformEntries`, which registers the per-job entry and
then calls `ensureCatchup` (**`schedule.js:646`**; `loaded: loaded && cu.loaded` at
`:647`), and `ensureCatchup` performs its **own** readback via its own
`ensureDarwinEntryRegistered` call (`:495`). **So multiply every row's call list by
the two darwin entries — per-job and catch-up — to get the full-`sync` figure.**
For the steady state that is **two read-only `print`s and zero mutating calls**.

| Run | Readback verdict | OS calls (**per-job helper only** — see scoping above) | What the user is told | Reality |
|-----|------------------|--------------------------------------------------------|-----------------------|---------|
| first `sync` after this ships | `'mismatch-fatal'` (`program` **and** `arguments[0]` both differ) | `print`; `bootstrap` (refused); `/usr/bin/plutil -lint` (passes); `bootout`; `bootstrap` (exit 0); `print` again to verify | **nothing** — `loaded` is `true`, so no notice fires | **launchd holds the DURABLE path** |
| `doctor`, immediately after | — | read-only probe | `[ok] scheduled job 'dream' is loaded (launchd)` (`status.js:283` message + `doctor.js:317` `[${status}] ${msg}` wrapper — **including the `(launchd)` suffix**; both lines unchanged at `1093e51`) | true, and now for the right reason |
| **every later `sync`** | `'match'` | **one read-only `print`, zero mutations** (`:184`) — **two `print`s through the full `sync` path** (per-job + catch-up), still zero mutations | **nothing** | **launchd holds the durable path** |

*(Corrected 2026-08-02: the "every later `sync`" cell previously read "**one
read-only `print`, zero mutations**" with no scoping note, which under-counts a
`sync` run and is exactly the "'exactly one' through the full path" claim the
sibling forbids. The zero-mutations half was and is correct.)*

*Superseded `5f0ffc0` row, retained:* ~~"every later `sync`: `changed = false`,
**zero** OS calls, **nothing** told, **launchd still holds the pinned path**."~~

**D-b — Linux, degraded `daemon-reload` (Table C row 4), at `1093e51`.**

| Run | OS calls | What the user is told | Reality |
|-----|----------|-----------------------|---------|
| first `sync` after this ships | `daemon-reload` (degraded) then `enable --now` | stderr line `wienerdog: warning — 'systemctl --user daemon-reload' returned <status>; the timer may load from stale units. Run 'wienerdog doctor'.` (**`schedule.js:678`**, MOVED from `:464`) **AND** the `repointSchedules` notice `"<job>" schedule file written but the OS scheduler did not accept it — run 'wienerdog doctor'.` (**`schedule.js:802`**, MOVED from `:584`, **including the trailing period**), because `loaded` is now `false` (`:681`, `:801-803`) | systemd may hold stale units |
| `doctor`, immediately after | read-only probe | **nothing about this entry** — a systemd entry probes `unknown`, which `doctorSchedulerChecks` does not report as a health claim. **This gap is unchanged by PR #140 and is a recorded residual** | same |
| **every later `sync`** | `daemon-reload` **and** `enable --now`, **again** — both hoisted out of `if (changed)` (`:666-681`) | **the same warning and the same notice, every time**, until the reload succeeds | same, and visibly so |

*Superseded `5f0ffc0` row, retained:* ~~"every later `sync`: `changed = false`,
**zero** OS calls, **nothing** told … and **no** `repointSchedules` notice, because
`loaded` is `true`."~~

**D-c — macOS, `'indeterminate'` readback (Table C row 7), at `1093e51`. NEW.**
Same per-job-helper call-count scoping as D-a.

| Run | Readback verdict | OS calls (**per-job helper only**) | What the user is told | Reality |
|-----|------------------|-------------------------------------|-----------------------|---------|
| **every `sync`**, first and later alike | `'indeterminate'` | `print`; `bootstrap` (refused); `/usr/bin/plutil -lint` (**runs** — the preflight at `:201-203` precedes the teardown guard; skipped only when `/usr/bin/plutil` is absent, since it is gated on `fs.existsSync(PLUTIL)`). **No `bootout`** — `:208` returns before it | the `repointSchedules` notice, byte-exact as quoted in D-b, **on every run** | launchd holds the pinned path |

*(Corrected 2026-08-02: this cell previously read "**No `plutil`, no `bootout`** —
`:208` returns before them". **The `plutil` half was false.** The preflight is at
`:201-203` and the teardown guard at `:208`, so on a real macOS host the lint
**does** run on the `'indeterminate'` path — only the `bootout` half was right.
This also reconciles D-c with D-a's own first-`sync` row, which sequences the lint
correctly.)*

**What this WP may now claim, and what it still may not.** It **may** say the
macOS non-convergence of Table C row 5 is closed, and that no `sync` reports a
false success on either platform. It **may not** say the incident class is closed:
Table C rows 4 and 7 still do not converge — they are merely loud now — and AC9's
prohibition on "closes the class" stands unchanged.

**Scope decision for row 4 — DISCHARGED 2026-08-02 (recorded, not deleted).** The
Linux degraded-reload case was folded into the prerequisite
`WP-scheduler-register-replaces-loaded-record` rather than fixed inside this WP,
on the reasoning that it is the *same* defect family ("a register that reports
success from a call that did not replace the loaded state"), that a Linux fix
needs a `daemon-reload` gating decision belonging with that WP's ADR-0018
amendment, and that it keeps this WP S/M-sized. **That routing was taken and it
worked**: PR #140 shipped the Linux leg (`loaded = reloadOk && enableOk`, reload
hoisted) alongside the macOS one, closing the family in one WP exactly as
predicted. No part of it returns to this WP's scope.

### Table G — the macOS readback-echo premise (canonical; **EXECUTED — P is TRUE, 2026-08-02**)

Table C row 5's convergence and Table D-a's whole sub-table rest on one premise
about launchd that this WP is the **first** change able to falsify, because it is
the first to register a **symlinked** program path. It was added on 2026-08-02 as
an explicitly-unverified premise and **settled by direct experiment the same day**.
Current state §9 records the run.

| | |
|---|---|
| **Premise (P)** | `launchctl print gui/<uid>/<label>` echoes the plist's `ProgramArguments[0]` **verbatim** into both the `arguments` block and the `program` line — it does **not** realpath-resolve the program path at load. |
| **Status** | **EXECUTED 2026-08-02 — P is TRUE.** Observed directly on the owner's machine (macOS 26, launchd, uid 501) via an orchestrator-run scratch-label experiment; method and readback in Current state §9. *(Superseded status, retained: "**NOT EXECUTED.** Specified, not observed — the same standing as this spec's Windows layout claim … bootstrapping a throwaway label is a mutation of the user's launchd state that a spec-authoring pass may not make." That constraint was real and is why the architect did not run it; it was lifted by running the experiment at the orchestrator layer, with full teardown.)* |
| **What makes the evidence CONCLUSIVE** | The scratch job's `ProgramArguments[0]` was `/opt/homebrew/opt/node/bin/node` — a path **through a symlinked directory** (`/opt/homebrew/opt/node` → `../Cellar/node/25.9.0_2`) whose realpath is `/opt/homebrew/Cellar/node/25.9.0_2/bin/node`. **The literal and the resolved path therefore DIFFER**, which is precisely the discriminating case the live `dream` record could not supply. A verbatim echo and a resolving echo predict *different* strings here, and only one was observed. |
| **Result** | Both `program = /opt/homebrew/opt/node/bin/node` **and** the `arguments` block's first element echoed the **alias, verbatim**. No realpath resolution at load. |
| **Evidence FOR (corroborating, now secondary)** | `properties = inferred program` in the live dump — launchd derived `program` from `ProgramArguments[0]`. Plus the incident signature this WP exists to fix: after the Cellar directory is deleted the record still prints clean and `launchctl print` exits 0. |
| **Evidence AGAINST** | **None — and the gap that previously blocked a verdict is closed.** *(Retained: "the executed dump cannot distinguish 'echoed verbatim' from 'resolved, and equal by coincidence', because the live entry's `ProgramArguments[0]` is already its own realpath." The scratch-label experiment removed exactly that coincidence.)* |
| **If P is TRUE** — **CONFIRMED** | Tables C row 5 and D-a hold **exactly as written**. Steady state after one `sync`: verdict `'match'`, **two** read-only `print`s through the full `sync` path (per-job + catch-up; **one** per helper invocation — D-a's call-count scoping), zero mutations, forever. |
| **If P is FALSE** — **DID NOT OCCUR; retained as history** | `program` would read back as the resolved Cellar path while `expect.argv[0]` is the alias ⇒ **permanent `'mismatch-fatal'`**: `bootout` + `bootstrap` on every `sync`, `verifyLoaded()` failing every time ⇒ `loaded:false` and the notice forever. Loud, never silent, schedule still working — but permanent churn plus a permanent false failure report would **not** have been shippable. |
| **Consequence if P is false** — **MOOT; retained as history** | This WP would **not** have been obsoleted and `entryNodePath` would **not** have been wrong. The follow-up would have been on the **comparison** side (realpath `program` before comparing, or drop it as redundant with `arguments[0]`) — `darwinLoadedVerdict`, **the sibling's code, out of this WP's Deliverables** — routed as a new WP, never a widened diff here. **No such WP is needed.** |
| **How it was settled** | Not by the originally-specified post-implementation command, which needed D1/D2 in place. A **scratch label** carrying the discriminating path settled it **before** implementation — see Current state §9. The post-`sync` command survives as a **live smoke test**, not a premise gate: Definition of done item 9. |

**The premise gate is discharged pre-implementation.** What remains in Definition
of done item 9 is a smoke test, not a gate on an open question.

**This is still a claim a green `npm test` cannot reach, and that has not changed.**
`tests/run.js` sets `WIENERDOG_TEST_NO_REAL_SCHEDULER=1`, and the sibling's
`fakeLaunchd` double renders `program: argv[0] || ''` from the plist it stored at
`bootstrap` — so it models P as true **by construction** and could never have
falsified it. A fake cannot test an assumption about the real system it stands in
for. **P is now known true from the real system, not from the fake** — cite
Current state §9 in the PR, never the suite.

### Mirrored Surface Checklist

Tables A, B, C, D, F **and G** are the single place these facts are decided. Every
surface in this spec that restates them is registered below, so one review finding
updates the table **and** all its mirrors in one pass, and any new mirror found in
review is added here on the spot. **The five entries marked (+r2) were
unregistered in round 1 and were found by review — they are registered here under
the register-new-mirrors rule rather than fixed in place and forgotten.**

**(+r5, 2026-08-02) — the mirrors PR #140 created or moved.** The pre-dispatch
reconciliation pass added Table G and re-derived Tables C and D. Every surface
those touch is registered below with a `(+r5)` marker, in the same pass, so the
sibling's landing cannot leave a stale mirror behind. **`(+r5)` entries carrying a
line number are mirrors of Current state's re-anchoring, not of a rule** — they
move whenever `schedule.js` moves, which is why they are registered.

In this spec:

- [ ] Deliverables cell for `src/scheduler/generators.js` (D1 — "per Table A", `nodePath()` byte-for-byte)
- [ ] Deliverables cell for `src/cli/schedule.js` (D2 — the six site list, Table B row 1)
- [ ] **(+r3)** Deliverables cell for `tests/unit/scheduler-generators.test.js` — it mirrors the **Test index** row set (T1/T2/T4/T5) and the "no T3" fact. **This is the mirror whose absence caused a round-2 defect**: the T3→T5 renumbering updated five registered surfaces and missed this unregistered one, leaving the permission-boundary table telling the implementer to build the round-1-failing test set. Registered so the Test index and this cell can never diverge again.
- [ ] **(+r2)** Deliverables → the **Sizing** paragraph (it restates Table B row 1's "six call sites" count)
- [ ] "Exact contracts" JSDoc block, its default-parameter note (Table A row 1) and its input → output pairs (Table F)
- [ ] "Exact contracts" literal `.plist` fragment (the `--expect-digest`-unchanged claim, Table A row 6)
- [ ] Current state §2 (the ENTRY/RUNTIME site classification — Table B) — **(+r5)** and its NEW hoisted-`const node` sub-table, which is the mirror of Implementation notes §D2's dual-consumer rule
- [ ] Current state §7 (the descriptor field — Table A row 6)
- [ ] **(+r5)** Current state §8 — **REWRITTEN against `ensureDarwinEntryRegistered`**; it is the mechanism behind Tables C and D and must be re-read whenever either moves. Its `5f0ffc0` text is retained in a quote block, not deleted
- [ ] **(+r5)** Current state §9 — **the executed record of the scratch-label experiment that settled Table G's premise (P is TRUE, 2026-08-02)**. Table G decides; §9 records what was run, by whom, and the teardown. **Registered because Table G's Status row and §9 must move together**: if the premise is ever re-opened (a launchd behavior change), both flip, plus every mirror below
- [ ] **(+r5, updated 2026-08-02)** **AC6**'s non-claim bullet — it cited Table G's premise as unverified and now must not; and the **Convergence** section heading paragraph, which states the premise's settled status
- [ ] **(+r6, 2026-08-02, from the light gate)** **Table D's OS-call lists** — D-a's call-count scoping paragraph, D-a's steady-state cell, D-c's `plutil` cell, Table D's RECONCILED preamble bullet ("a later `sync` makes two read-only `print`s"), **Table G's "If P is TRUE" row**, and **AC9's reproduction requirement**. All six state the same two facts — *the `plutil` preflight (`:201-203`) runs before the teardown guard (`:208`)*, and *a full darwin `sync` issues **two** read-only `print`s, one per helper*. Registered because the gate found **two** of them wrong while the others were right: a call list is a contract here, since AC9 makes the implementer copy it into the merge artifact verbatim. The full-path count is the **landed sibling's** canonical property (`done/WP-scheduler-register-replaces-loaded-record.md:1881-1883`) — derive from it, never restate it independently
- [ ] **(+r5)** Table C's reconciliation preamble (the row-4 / row-5 verdict-change table) and Table D's reconciliation preamble — these are the dated records of the two settled rows that changed outcome; neither may be silently folded into the tables they precede
- [ ] Implementation notes §D1 (the derivation, the `parts.length < 6` spelling of row 2, the anti-`indexOf` rule from Table E row 4), §"Why the descriptor field stays" (row 6), §"Windows" (row 1), §"Convergence — governed by Table C" (which now cites C and D instead of restating them)
- [ ] Design space → option (a) (the alias mechanism is rows 5–6)
- [ ] Security checklist bullets 1 and 2 (rows 3, 4 and 5 — which of them is the security boundary)
- [ ] Acceptance criteria AC1 (rows 5–6), AC2 (rows 1–4 via Table F), AC3 (Table B row 1), AC4 (Table B row 2 **and**, as the spec's only seam-free assertion of them, Table A rows 5-6), AC5 (Table A row 6), AC6 (idempotence, and its explicit non-claim about Tables C/D), AC9 (Tables C and D reproduced in the PR) — **(+r5)** AC9 now also mirrors Table C row 5's flipped verdict, Table D's discharged false-success finding and **Table G**'s premise — **which is SETTLED TRUE as of 2026-08-02, so AC9 sub-item (iv) reports it as executed, never as unverified**
- [ ] Verification commands V3 (Table B row 1 count), V4 (Table B row 2 preservation), V5 + V5b (Table A row 6 preservation and AC5's zero-coupling argument)
- [ ] **(+r2)** Verification command V2 (its `>= 4` threshold mirrors the Test index row count — note T5 is **skipped** on win32, so a win32 run legitimately reports one fewer)
- [ ] **(+r4)** T5's POSIX-only platform gate — stated in **AC4**, the **Test index** T5 cell, and **Table E row 7**'s scope column; all three must move together
- [ ] Table E mutation rows 1–8; the Table F fixture references belong to **rows 4-6 only** (rows 1, 2, 3, 7 and 8 are driven by T1/T5/V3 and cite no Table F fixture)
- [ ] **(+r2)** Test index — T1's and T2's cells are the only place Table F rows 13–15 (the alias positives) and rows 1–12 (the negatives) carry a *requirement* rather than an arithmetic fact
- [ ] **(+r2)** The whole **Out of scope** section — every bullet applies Table A row 6 (descriptor), row 2 (nvm et al.) or row 1 (Windows), and the first bullet applies Tables C/D
- [ ] **(+r2)** Definition of done items 0 (the Tables C/D blocker **and** the `depends_on` obligation), 1 (V2/V3 thresholds), 6 (the Windows owner check, Table A row 1), 7 (AC9's no-overclaim rule) and 8 (the ADR-0028 sequencing gate) — **(+r5)** and item **9**, which mirrors Table G's Status row: it began as a **premise gate** and is now a **live smoke test**, the premise having been discharged pre-implementation on 2026-08-02. **Item 9 and Table G's Status row may never disagree about whether the premise is open**
- [ ] **(+r5)** Definition of done item 1's **V2 pass-count threshold**, which mirrors the V1 baseline measured at a specific SHA. It was `79` at `5f0ffc0` and is **`120` at `1093e51`**; it moves whenever the suite grows, so it is registered rather than left as a literal in two places
- [ ] **(+r5)** Implementation notes §D2's "do not touch" list — it names the register machinery by function, and PR #140 replaced those functions
- [ ] **(+r5)** Out of scope, the registration-path bullet — it described the defect as *routed and unfixed*; it now records it as *fixed by PR #140*
- [ ] The DISPATCH BLOCKER banner at the top of this spec (Tables C and D) — **(+r5)** including its **DISPATCH PRECONDITION satisfaction record**, which mirrors Definition of done item 0c

Out of this spec, registered so a later Table A change updates them too — **none
of these is a deliverable**, and none may be edited by the implementer:

- [ ] `docs/adr/0028-scheduler-app-executable-integrity.md:83` — "`node` is `process.execPath` (already absolute) and is not pinned." After this WP that sentence is true of the descriptor field and of runtime spawns, and **false of the registered entry**. An ADR amendment is an OWNER action (WP-114's Decision 5 precedent: an ADR gloss is never edited from a WP). The routed slug `WP-adr-0028-entry-node-path-amendment` **now exists as a spec, and its amendment text is already appended to ADR-0028 carrying `Status: PROPOSED — awaiting owner signature`**. **Sequencing is not optional:** that amendment must land **with or before** this WP's merge, **owner-signed**. Definition of done item 8 is the gate. **Corrected 2026-08-01 (gate round 1):** this cell previously offered an alternative — *"or ADR-0028:83 must carry an owner-written annotation naming this WP"* — which is **withdrawn**, because ADR-0028's own preamble (`:18-20` — re-verified at `1093e51`) rules that a later decision lands as a dated amendment and never as an edit to the text it refines; none of its five prior amendments annotated superseded text. Knowingly merging code that falsifies an owner-signed ADR line, with no ordering requirement attached, is what round 1 did and it is not acceptable.
  **SATISFIED 2026-08-02 — verified, not assumed.** The dated amendment has landed and is **owner-signed**. `docs/adr/0028-scheduler-app-executable-integrity.md:1213` is the heading *"## Amendment (2026-08-01) — the scheduler ENTRY's node path is an upgrade-durable alias; `process.execPath` stays the runtime and the authorization value"*, and **`:1215`** reads, byte-exact:
  `Status: **ACCEPTED - OWNER-SIGNED 2026-08-02**`
  It landed via **PR #138** (`wp/adr-0028-owner-signature`, merge `b124efc`), and its routing spec `WP-adr-0028-entry-node-path-amendment` is now `status: Done` at `docs/specs/done/`. **`:83` is deliberately unedited** and still reads *"`node` is `process.execPath` (already absolute) and is not pinned."* — which is exactly what the ADR's own convention requires. **This spec CITES that signature; it did not and may not write one.** Definition of done item 8 carries the same record.
- [ ] `docs/GLOSSARY.md:26` (**MOVED 2026-08-02** from `:25`) — "the running `node` path" in the **job descriptor** field list. Unchanged by this WP *because* Table A row 6 leaves `descriptor.js:215` alone; registered because a later WP that moves the descriptor field must edit it.
- [ ] **(+r5)** `docs/specs/done/WP-scheduler-register-replaces-loaded-record.md` — Tables **A1** (`:576-624`, the verdict → decision mapping) and **A2b** (`:651-690`, the fatality tier that grades `program` FATAL **and names this WP by slug** as its justification). Tables C, D and G here are *derived from* those two; they are the sibling's canonical property, **never edited from this WP**. If they ever move, this spec's Tables C/D must be re-derived, not patched.

Not registered, and why: `src/scheduler/status.js` step 8b **reads** an execution
position out of a loaded record but never derives one, so it is a consumer, not a
mirror. The three renderers (`launchdPlist`, `systemdService`,
`windowsCmdArguments`) interpolate `o.node` verbatim and state no rule about its
value.

## Design space (the three options, and the recorded tradeoff)

**(a) Resolve at sync time through Homebrew's stable alias — CHOSEN.** The entry
is registered against `<prefix>/opt/<formula>/bin/node` when, and only when, that
alias currently realpaths to the running `process.execPath` (Table A rows 5–6).
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
(**`run-job.js:1318`**, MOVED 2026-08-02 from `:1236`), which re-probes **every** entry with step 8b — so a *still*
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
*derivation*, which the trampoline would need. Neither blocks the other.

**On `depends_on: []` — what it does and does not mean here.** No **open spec's
Deliverables table** lists any of this WP's three files, so there is no
file-collision ordering. `WP-dev-descriptor-no-tree-hash` mentions
`src/cli/schedule.js` twice — once in its "not deliverables" list (`:198`) and once
in prose about `appTreeDigest` consumers (`:302`) — and neither is a Deliverables
entry, so the conclusion stands. (Round 1 said "only under its not-deliverables
list", which missed `:302`; the conclusion was right, the survey was not.)

**`depends_on` — history, and its current state (updated 2026-08-02).** It was
empty for a
mechanical reason: `scripts/check-frontmatter.js` rejects an id that does not
resolve to an existing spec, and `WP-scheduler-register-replaces-loaded-record` was
not yet written, so the real ordering constraint lived only in the DISPATCH BLOCKER
banner and Definition of done item 0. **That sibling's SPEC merged to `main` in
PR #125 (`fbc9d80`) — the document, not the implementation (see 0a's 2026-08-02
correction) — and its id is now recorded in this spec's `depends_on`**, so the
*ordering* that was prose is now mechanically enforced by the frontmatter
resolver. **What the resolver does NOT enforce is completion**: it checks that
the id names a spec file, never that the spec is `Done`.

**Both halves are now closed (2026-08-02).** The sibling's **implementation**
merged as **PR #140** (`7b22d71`) and it was Done-flipped by **PR #143**, so the
completion gate the resolver cannot see is satisfied by the record in Definition of
done item 0d. The id now resolves against
**`docs/specs/done/WP-scheduler-register-replaces-loaded-record.md`** rather than
`docs/specs/` — re-verified in this worktree at `1093e51`:
`node scripts/check-frontmatter.js` → `frontmatter check passed: 209 spec(s), 4
agent(s)`. **The resolver searches both locations, so moving a dependency to
`done/` does not break a dependent spec's frontmatter** — worth stating, because it
is the mechanism this WP's only `depends_on` entry now relies on.

## Implementation notes & constraints

### D1 — `src/scheduler/generators.js`

Define `entryNodePath` **immediately after `nodePath`**, and add it to
`module.exports` immediately after the existing `nodePath` entry. (That export
block is **definition-ordered**, not alphabetical — a round-1 draft said
"alphabetically adjacent", which was a false premise about this file.)

Implement Table A **by array segments, not by one regex**:

```js
const parts = execPath.split('/');
if (parts.length < 6) return execPath;            // Table A row 2, first clause
const i = parts.length - 5;                       // index 'Cellar' must occupy
if (parts[i] !== 'Cellar') return execPath;       // Table A row 2, second clause
```

`parts.length < 6` **is** Table A row 2's first clause — it is exactly the old
`i < 1` guard, written in the form the table states so the code and the canonical
table cannot drift. Do not reintroduce an `i < 1` spelling that appears only here.

This is anchored **by construction**: every segment came out of a `split('/')`, so
no `/` can hide inside `formula` or `version`. Do **not** replace it with a single
regex over the whole path, and in particular do **not** derive `i` with
`parts.indexOf('Cellar')` or the prefix with `execPath.split('/Cellar/')[0]` — a
first-match derivation accepts a `Cellar` at the wrong depth, which is precisely
what Table E row 4's mutation does and what T2's
`/opt/homebrew/Cellar/node/25.9.0_2/bin/x/node` fixture exists to catch.

Wrap the whole body in one `try { … } catch { return execPath; }`. The function
is contracted **never to throw**: it is called on the registration path, and a
throw there would abort `wienerdog sync` for every job. The `catch` must return
`execPath`, never `ALIAS` — Table E row 3 mutates exactly that.

`opts.realpath` is the **only** seam, and it exists so T1 can drive Table A rows 5
and 6 without a Homebrew install (T5 additionally drives them against a **real**
fabricated filesystem with no seam at all). Default it with
`typeof opts.realpath === 'function' ? opts.realpath : fs.realpathSync` — never
`opts.realpath || fs.realpathSync`, and never `'realpath' in opts`; production
callers pass no `opts` at all, and the truthiness form has bitten this repo before
(WP-114's dogfooding lesson about `opts.run`). `generators.js` already requires
`node:fs` at line 3; add no new require.

Apply `RP` to **both** sides in row 5 (`RP(ALIAS) !== RP(exec)`), not just the
alias. `process.execPath` is already realpath-resolved on POSIX (Current state §4
proves it), so on production inputs the two forms agree — but a caller passing a
symlinked `exec` must not silently get a false negative, and symmetry is cheaper
to reason about than an asymmetry that happens to be safe.

### D2 — `src/cli/schedule.js` (**re-anchored and re-derived 2026-08-02, PR #140**)

Six mechanical substitutions, listed by line in the Deliverables cell:
**`:477`, `:536`, `:611`, `:856`, `:885`, `:970`** at `1093e51`.
**Three** of them — `:477`, `:611`, `:970` — are `const node = gen.nodePath();`
(at `5f0ffc0` only two were, `:417` and `:752`, and those line numbers are now
dead). Change the right-hand side only; the local variable keeps its name and
every downstream `{ …, node, … }` is untouched.

**THE ONE NEW RULE PR #140 CREATES — read this before touching `:477` or `:611`.**
At those two sites the hoisted `node` now feeds **two** consumers, not one:

- the **renderer** — `gen.catchupPlist({node, …})` (`:481`) / `gen.launchdPlist({…, node, …})` (`:621`); and
- the **readback expectation** — `expect.argv: [node, …]` (`:500` / `:633`), which
  `ensureDarwinEntryRegistered` compares against what `launchctl print` reports,
  at FATAL tier, **twice** (as `arguments[0]` and as `program` — `schedule.js:134-139`).

Because both consumers read the **same** hoisted `const`, the single-token swap
keeps them consistent **automatically**. That is the whole reason the sites were
hoisted (PR #140's own comment at `:474-476`: *"Hoisted so the renderer and
`expect` are provably built from the SAME values"*), and it is why this WP stays a
six-token edit rather than a nine-token one.

**Do NOT "helpfully" split them.** Writing `gen.entryNodePath()` into the renderer
while leaving `gen.nodePath()` in `expect.argv[0]` (or vice versa) makes the
expectation permanently disagree with the bytes just written: every register would
grade `'mismatch-fatal'`, `bootout` + `bootstrap` on **every** `sync`, and
`verifyLoaded()` would fail every time — a permanent teardown churn plus a
permanent false failure report. There is **no test in this WP's Deliverables that
would catch that**, because T1/T2/T4/T5 all test `generators.js` in isolation. The
hoisted `const` is the only thing preventing it. Leave it hoisted.

Change **nothing else in this file.** In particular, do not touch — these are the
landed sibling's code and are named at `1093e51`:
`ensureDarwinEntryRegistered` (`:175-227`), `darwinLoadedVerdict` (`:112-157`),
`readTopLevelField` (`:72-81`), `darwinReplaceEntry` (`:51-55`), the `PLUTIL`
preflight (`:63`, `:201-203`), the rollback block (`:218-225`), the linux
`reloadOk`/`enableOk` gate (`:671-681`), `ensureWindowsTaskRegistered` (`:412-417`),
or any probe, notice or heal. *(At `5f0ffc0` this paragraph said "do not touch the
bare `launchctl bootstrap` calls at `:315` and `:431`". **Those calls no longer
exist** — PR #140 deleted them. The instruction is unchanged in spirit: the
register machinery is not this WP's to edit.)*

### Why the descriptor field stays `process.execPath` — the decisive reason

It is tempting to change `descriptor.js:215` to `gen.entryNodePath()` in the same
pass, so a node upgrade drifts nothing at all. **Do not.** Two facts, both
executed, make it unsafe *today*:

1. The descriptor's `node` is digest-covered, so changing its value changes every
   existing job's **descriptor digest**, and therefore the `--expect-digest`
   token inside every registered entry's argv. **Unaffected by PR #140 — this
   reason stands in full.**
2. **A registered entry can still be left holding a stale `--expect-digest`.** If
   the entry's argv carries the *old* digest while the descriptor on disk yields
   the *new* one, the launcher re-derives at fire time, compares, and **refuses** —
   `verifyAndResolve` returns `{remedy:'sync'}` (`launcher.js:348` — line
   re-verified unchanged at `1093e51`). The nightly job then does not run.

   > **RECONCILED 2026-08-02 (PR #140) — this reason is NARROWER than it was, and
   > the honest statement is that it no longer covers macOS.** At `5f0ffc0` it read:
   > *"The macOS registration path cannot replace an already-loaded record … That
   > would break the nightly job on every already-installed macOS machine."* **That
   > is no longer true.** `ensureDarwinEntryRegistered` now replaces the loaded
   > record whenever a FATAL-tier field differs, and a changed `--expect-digest` is
   > a change to `arguments`, which Table A2b grades **FATAL** — so on macOS the
   > entry and the descriptor would now re-converge on the same `sync` (Table C
   > row 5).
   >
   > **The conclusion is unchanged anyway, on the rows that did not converge:**
   > Table C row **4** (linux, degraded `daemon-reload`) leaves systemd on a stale
   > unit carrying the old digest, and row **7** (macOS, `'indeterminate'` readback)
   > leaves launchd on the old record — in both, the descriptor on disk has already
   > moved. Reason 1 alone is also independently sufficient. So the decision holds;
   > only its blast radius shrank, from "every already-installed macOS machine" to
   > "every machine in Table C row 4 or 7". Recorded rather than left overstated.

So the descriptor field is left alone, and this WP changes **no digest at all**.
The consequence is stated honestly rather than hidden: after a `brew upgrade
node`, an entry fixed by this WP *fires*, the launcher *runs*, re-derives
`node: process.execPath` as the new Cellar path, finds it differs from the
descriptor on disk, and **refuses loudly** — durable `alerts.jsonl` record, digest
callout, remedy `run 'wienerdog sync'`. That is the point of this WP: the failure
moves from **outside** the product's observability to **inside** it. Making the
node upgrade cost nothing at all requires the descriptor field to move too, which
is routed as `WP-descriptor-node-field-stability` and must land **after**
`WP-scheduler-register-replaces-loaded-record` — **an ordering constraint now
satisfied (PR #140 merged 2026-08-02), so that follow-up is unblocked. It is still
not this WP.**

### Convergence — governed by Table C, reported by Table D, premised on Table G

The convergence facts live in **Table C**; what `sync` tells the user about them
lives in **Table D**; the launchd premise both rest on lives in **Table G**, and it
is **settled TRUE** as of 2026-08-02 (executed — Current state §9). None is
restated here. Three things follow that the implementer and the PR author
must both honor — **all three were re-derived on 2026-08-02 against `1093e51`**:

1. This WP is fully preventive for **new** registrations on every platform (Table
   C row 1), fully converged on Windows (row 2), on Linux with a healthy
   `daemon-reload` (row 3), and — **as of PR #140** — on **macOS with a healthy
   loaded record (row 5), which now converges on the first `sync`**, with row 6 as
   a backstop. Table C rows **4** (linux, degraded reload) and **7** (macOS,
   `'indeterminate'` readback) still do **not** converge. **Do not write "closes
   the class" anywhere** — two rows remain open, and AC9 forbids the phrase.
2. **Table D's false-success finding is discharged.** Neither platform reports a
   silent success any more: macOS re-reads the loaded record on every register
   (ungated by `changed`), and Linux re-runs and re-warns on every register. So the
   PR **may** say non-convergence is now always visible; it **may not** say it
   never happens. *(Superseded text, retained: "Table D's last row in each
   sub-table reports that non-convergence as success.")*
3. Because of Table D, this WP **was blocked** behind
   `WP-scheduler-register-replaces-loaded-record`. The blocker was **lifted
   2026-07-28** on the sibling *spec*'s existence, and the separate **dispatch
   precondition** — that the sibling be `Done` — was **satisfied 2026-08-02** when
   its implementation merged as **PR #140** (`7b22d71`) and was Done-flipped by
   **PR #143**. Both gates are closed. See the banner and Definition of done item 0.

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

- [ ] **Exactly one of the two identifier segments reaches the constructed path,
      and it is `formula`.** `ALIAS = prefix + '/opt/' + formula + '/bin/node'`
      (Table A) — `version` appears nowhere in it. A round-1 draft justified the
      `version` gate as the path-traversal defence; that was **factually wrong**
      and is corrected here. `formula` is the segment that could carry `..` into
      the constructed path, so its pattern
      `/^node(@[0-9]+(\.[0-9]+)*)?$/` is **fully anchored** with no `m` flag
      (a start-anchored-only form would accept `node/../..`); it comes out of
      `execPath.split('/')`, so it cannot contain `/` in the first place. Table A
      row 4's `version` pattern `/^[0-9][0-9A-Za-z._+-]*$/` is **keg-shape
      narrowing, not a traversal gate** — it is kept because it costs nothing and
      keeps the match tight, and it is stated as such rather than oversold. There
      is no second language to mirror here — no bash or PowerShell copy of this
      rule exists.
- [ ] **The actual security boundary is Table A row 5 (the realpath identity check), not the regexes.** The
      derived `ALIAS` is never executed, never spawned and never written anywhere
      until `RP(ALIAS) === RP(exec)` has passed — i.e. until `realpath` has proven
      it is the **same inode** as the interpreter that is running. Any `ALIAS`
      surviving that check names the correct binary by construction, whatever its
      lexical shape; a path that merely *looks* right, or that resolves anywhere
      else, is never registered. This is why a hypothetical traversal escaping the
      regexes could at worst produce an ugly-but-correct path, never a wrong
      execution position.
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

**Every fixture path below was executed through `p.split('/')` before being
written into this spec** (round 1 shipped four fixtures that never reached the
gate they claimed to test). Table F records the arithmetic; do not add or change a
fixture without adding its row there.

- [ ] **AC1 (Table A rows 5–6 — the alias is taken, but only when proven).** With
      an injected `realpath` that maps both `/opt/homebrew/opt/node/bin/node` and
      `/opt/homebrew/Cellar/node/25.9.0_2/bin/node` to the same string,
      `entryNodePath('/opt/homebrew/Cellar/node/25.9.0_2/bin/node', {realpath})`
      returns `'/opt/homebrew/opt/node/bin/node'`. With a `realpath` that maps the
      alias to a **different** string, it returns the input unchanged. With a
      `realpath` that **throws**, it returns the input unchanged. All three are
      asserted; the two negatives are the fail-safe direction. The positive is
      additionally asserted for `/usr/local/Cellar/node@22/22.14.0/bin/node` →
      `/usr/local/opt/node@22/bin/node` and
      `/home/linuxbrew/.linuxbrew/Cellar/node/24.0.1/bin/node` →
      `/home/linuxbrew/.linuxbrew/opt/node/bin/node`, which is the only place the
      prefix-derivation and the `node@NN` formula are required. (T1)
- [ ] **AC2 (Table A rows 1–4 — everything else is returned unchanged).**
      `entryNodePath` returns its input **verbatim**, with an injected `realpath`
      that calls `assert.fail()` if reached, for every fixture in Table F rows
      1–12. The `assert.fail()` realpath is what proves rows 1–4 short-circuit
      **before** any filesystem touch, and it is what makes Table E rows 4–6 red.
      The non-string fixtures are the **literals** `null` and `42` — never
      `undefined`, which the default parameter consumes before row 1 can see it
      (and which on a Homebrew host would reach row 5 and trip the `assert.fail()`,
      making the test machine-dependently red). (T2)
- [ ] **AC3 (Table B row 1 — every entry site uses the durable path).**
      `src/cli/schedule.js` contains **zero** occurrences of `gen.nodePath()` and
      exactly **six** of `gen.entryNodePath()`. Asserted by V3, whose `main`
      output is the inverse (6 and 0).
- [ ] **AC4 (Table B row 2 — the runtime role is untouched — AND the spec's only
      seam-free assertion of Table A rows 5-6), asserted against a fabricated
      Homebrew layout so it is host-independent **across POSIX hosts**.** T5 is
      the one place the alias derivation is exercised through the **real**
      `fs.realpathSync` against a **real** symlink rather than an injected seam,
      so it cross-checks AC1's seam-driven positives; if the two ever disagree,
      the seam is lying.
      **T5 is POSIX-only and MUST carry an explicit platform gate** —
      `const posixOnly = { skip: process.platform === 'win32' };` passed as the
      test's options argument, the idiom already used at
      `tests/unit/exec-identity.test.js:26`. On win32 the fabricated `TMP`
      realpaths to a drive-letter path (`C:\Users\…`), which Table A **row 1**
      returns unchanged — so the alias assertion would fail against a
      **correct** implementation. That is a defect in the test, not in the code,
      and the gate is the fix. Windows' row-1 no-op is already covered by AC2
      (Table F row 4), so gating T5 loses no coverage.
      **CI note (executed):** `.github/workflows/ci.yml:32-34` runs the unit
      matrix on `[ubuntu-latest, macos-latest]` only — there is no
      `windows-latest` leg — so an ungated T5 would not break CI today. The gate
      is required anyway: it protects a Windows developer running `npm test`
      locally, and it keeps the test honest the day a Windows leg is added. In a temp dir
      `TMP` (**`fs.realpathSync`'d first** — on macOS `/tmp` is a symlink to
      `/private/tmp`), create the real files `TMP/Cellar/node/9.9.9/bin/node` and
      the symlink `TMP/opt/node -> ../Cellar/node/9.9.9`. Then, inside a
      `try`/`finally` that restores it, set
      `process.execPath = TMP + '/Cellar/node/9.9.9/bin/node'` (it is a writable,
      configurable property — verified) and assert, with **no seam at all** and the
      real `fs.realpathSync`:
      `gen.nodePath() === process.execPath` **and**
      `gen.entryNodePath() === TMP + '/opt/node/bin/node'` **and** the two differ.
      This is what makes Table E row 7 red on **every** host, Homebrew or not.
      V4 additionally shows the three runtime call sites unmoved. (T5)
- [ ] **AC5 (Table A row 6 — no digest moved), asserted statically, because there
      is nothing runtime to assert.** `src/scheduler/descriptor.js` contains
      `node: process.execPath` and **does not appear in the diff at all** (V5).
      That is the whole proof, and it is a complete one: `descriptor.js` has **zero
      coupling** to `generators.js` — it neither requires it nor references
      `nodePath`/`entryNodePath` anywhere (V5b greps for exactly that) — so an
      untouched `descriptor.js` provably cannot change its digest no matter what
      `generators.js` does. Round 1 specified a runtime test here (stub the
      exported `gen.entryNodePath`, assert digest invariance); it was **vacuous by
      construction** for that same reason and is deleted rather than repaired. A
      criterion whose evidence cannot fail is a defect in the WP, and the honest
      form of this one is static.
- [ ] **AC6 (idempotence — a preservation criterion).** Rendering the same job
      twice through `gen.launchdPlist({…, node: gen.entryNodePath()})` produces
      byte-identical strings, and `gen.entryNodePath()` called twice in one process
      returns the same value. **AC6 asserts idempotence at the rendered-bytes level
      ONLY. It does NOT assert that the OS scheduler state converged** — Table C
      rows **4** (linux, degraded reload) and **7** (macOS, `'indeterminate'`
      readback) record that it does not. *(Updated again 2026-08-02: this bullet
      also said "and Table G records that even row 5's convergence rests on an
      unverified premise" — Table G's premise is now **settled TRUE**, so row 5's
      convergence is no longer conditional. AC6 asserts nothing about convergence
      either way; that is the point of the bullet.)* Do not read AC6 as convergence.
      *(Updated 2026-08-02: this bullet used to name "rows 4 and 5 … on
      linux-degraded and macOS" and to add "and Table D records that `sync`
      nonetheless reports success". Row 5 converges as of PR #140, and Table D no
      longer records a false success on either platform — but AC6 still asserts
      nothing about convergence either way, which is the point of the bullet.)*
      (T4)
- [ ] **AC7 (mutation matrix).** Every row of Table E was demonstrated red; output
      pasted in the PR.
- [ ] **AC8 (no daemon, no new dependency).** The diff introduces no `spawn`, no
      `setInterval`, no `setTimeout`, no new `require`, and no `package.json`
      change. Asserted by reading the diff and by V6.
- [ ] **AC9 (the PR does not overclaim) — RESTATED 2026-08-02 against the
      reconciled tables.** The PR body reproduces **Table C and Table D (all three
      sub-tables, D-a/D-b/D-c) verbatim** — **including D-a's call-count scoping
      paragraph and the dated correction notes under D-a and D-c**, which are part
      of those tables, not commentary on them. Reproducing the call lists **without**
      the scoping paragraph restates the *"'exactly one' through the full path"*
      claim the landed sibling explicitly forbids
      (`docs/specs/done/WP-scheduler-register-replaces-loaded-record.md:1881-1883`),
      so dropping it turns a correct table into an incorrect one. The PR states
      **all four** of:
      (i) Table C rows **4** (linux, degraded reload) and **7** (macOS,
      `'indeterminate'` readback) do **not** converge;
      (ii) Table C row **5 now DOES converge**, on the first `sync`, because of
      PR #140 — and that this is the sibling's fix, **not** this WP's achievement;
      (iii) Table D's false-success rows are **gone on both platforms**, so no
      `sync` reports a silent success — while rows 4 and 7 remain non-convergent,
      merely loud; and
      (iv) **Table G's premise is SETTLED — P is TRUE**, executed 2026-08-02
      pre-implementation (Current state §9), so row 5's convergence rests on an
      observed fact rather than an assumption; and Definition of done item 9's
      **smoke-test** result is reported, or its absence stated.
      *(Superseded sub-item, retained: "(iv) **Table G's premise is unverified**,
      with Definition of done item 9's observed branch reported." Reporting it as
      unverified would now be inaccurate.)*
      The PR must **not** contain the phrase "closes the class" or any equivalent.
      This is an acceptance criterion, not etiquette: round 1's disclosure lived
      only in prose and the review found it invisible at the contract layer.
      *(Superseded wording, retained: "states that Table C rows 4 and 5 do not
      converge and that Table D's final row in each sub-table reports that as
      success". Row 5 converges as of PR #140; repeating the old sentence would now
      be an UNDERclaim, and an inaccurate one.)*

### Table F — fixture arithmetic (canonical; every AC2/Table E fixture)

`len` = `p.split('/').length`; `i` = `len - 5`; the **Gate** column is the Table A
row that actually decides the fixture. Every row here was produced by executing
`split('/')`, not by inspection.

| # | Fixture | len | i | `parts[i]` | formula | version | Gate |
|---|---------|-----|---|-----------|---------|---------|------|
| 1 | `null` | — | — | — | — | — | row 1 (not a string) |
| 2 | `42` | — | — | — | — | — | row 1 (not a string) |
| 3 | `''` | — | — | — | — | — | row 1 (no leading `/`) |
| 4 | `C:\Program Files\nodejs\node.exe` | — | — | — | — | — | row 1 (no leading `/`) |
| 5 | `/usr/bin/node` | 4 | -1 | — | — | — | row 2 (`len < 6`) |
| 6 | `/opt/homebrew/Cellar/node/bin/node` | 7 | 2 | `homebrew` | — | — | row 2 |
| 7 | `/home/u/.nvm/versions/node/v22.1.0/bin/node` | 9 | 4 | `versions` | — | — | row 2 |
| 8 | `/opt/homebrew/Cellar/node/25.9.0_2/bin/x/node` | 9 | 4 | `node` | — | — | row 2 (`Cellar` at the wrong depth) |
| 9 | `/opt/homebrew/Cellar/pnpm/9.0.0/bin/node` | 8 | 3 | `Cellar` | `pnpm` | — | **row 3** |
| 10 | `/opt/homebrew/Cellar/../1.0.0/bin/node` | 8 | 3 | `Cellar` | `..` | — | **row 3** (the traversal fixture) |
| 11 | `/opt/homebrew/Cellar/node/../bin/node` | 8 | 3 | `Cellar` | `node` | `..` | **row 4** |
| 12 | `/opt/homebrew/Cellar/node/beta/bin/node` | 8 | 3 | `Cellar` | `node` | `beta` | **row 4** |
| 13 | `/opt/homebrew/Cellar/node/25.9.0_2/bin/node` | 8 | 3 | `Cellar` | `node` | `25.9.0_2` | rows 5–6 |
| 14 | `/usr/local/Cellar/node@22/22.14.0/bin/node` | 8 | 3 | `Cellar` | `node@22` | `22.14.0` | rows 5–6 |
| 15 | `/home/linuxbrew/.linuxbrew/Cellar/node/24.0.1/bin/node` | 9 | 4 | `Cellar` | `node` | `24.0.1` | rows 5–6 |

**Round 1's deleted fixture, recorded so it is not reintroduced.**
`/opt/homebrew/Cellar/node/../../evil/bin/node` has `len` 10, `i` 5,
`parts[5] === '..'` — it exits at **row 2** and never reaches any identifier gate,
so it could not detect the deletion of either regex. Rows 10 and 11 replace it:
row 10 puts `..` in the **formula** position (the segment that actually enters
`ALIAS`) and row 11 puts it in the **version** position, each with `Cellar` at
exactly `len - 5`.

### Table E — Mutation checks

Each row: apply the mutation to the finished tree, run the named test, confirm it
turns RED, then restore the file byte-for-byte. The **Trigger** column says which
guarantee the mutation destroys; the **Patch** column is the literal edit — it is
**one behavior per row, which is not always one line** (row 4 is two edits, and
that is deliberate: a first-match derivation is only reachable if both halves
change together). Assert that the test-name pattern selected exactly **one** named
subtest — a pattern that matches nothing exits 0 and proves nothing (WP-114's
dogfooding lesson).

| # | Trigger (the guarantee destroyed) | Patch (the mutation) | Test that must go RED | Why it goes red |
|---|-----------------------------------|----------------------|-----------------------|-----------------|
| 1 | the alias is never preferred — the fix silently does nothing | insert `return execPath;` as the first statement of `entryNodePath` | T1 (AC1 positives) | all three positives return the pinned path |
| 2 | the alias is taken **without** proving it is the same binary | delete the `RP(ALIAS) !== RP(exec)` comparison, keeping `RP(ALIAS)` inside the `try` | T1 (AC1 different-inode negative) | the differing-inode case now returns `ALIAS` |
| 3 | the `realpath`-throws path stops being fail-safe | change the `catch` to `return ALIAS;` (hoisting `ALIAS` if needed) | T1 (AC1 throwing negative) | a throwing `realpath` now yields `ALIAS` |
| 4 | the `Cellar` shape test is loosened to a first-match/substring derivation | replace `parts[i] !== 'Cellar'` with `!execPath.includes('/Cellar/')` **and** derive `i` as `parts.indexOf('Cellar')` | T2 (Table F row 8) | with `i = 3`, formula `node` and version `25.9.0_2` both pass, so the fixture reaches row 5 and trips `assert.fail()` |
| 5 | the **formula** gate is dropped — the one segment that enters `ALIAS` | delete the `formula` regex test | T2 (Table F rows 9 **and** 10) | both fixtures have a passing `version`, so both reach row 5 and trip `assert.fail()` |
| 6 | the **version** gate is dropped — keg-shape narrowing lost | delete the `version` regex test | T2 (Table F rows 11 **and** 12) | both have formula `node`, so both reach row 5 and trip `assert.fail()` |
| 7 | the role split collapses — `nodePath()` is dragged to the entry value | change `nodePath()`'s body to `return entryNodePath();` | **T5** (AC4) — **on any POSIX host; T5 is skipped on win32, so this row cannot be demonstrated there** | under the fabricated layout `process.execPath` is a Cellar path whose alias exists, so `gen.nodePath()` returns the alias and the `=== process.execPath` assertion fails. The redness claim is **POSIX-scoped, not universal** — an earlier draft said "on every host", which was false for win32, where T5's fabricated path is a drive-letter path that Table A row 1 returns unchanged. Demonstrate this row on macOS or Linux and say which. |
| 8 | one entry site is left on the pinned path | revert **`schedule.js:611`** (re-anchored 2026-08-02; was `:417` at `5f0ffc0`) to `const node = gen.nodePath();` | V3 (counts become 5 / 1) | judged by reading the printed counts, not by exit status |

**Row 7 is the row round 1 got wrong, and the correction is the point.** Round 1
pointed it at a `descriptor.js` digest test that could never fail, because
`descriptor.js` uses an **inline** `process.execPath` and has no coupling to
`generators.js` — and because reassigning an exported property does not rebind a
lexical call inside the module anyway. The obvious repair,
`assert.strictEqual(gen.nodePath(), process.execPath)`, is **host-dependent**: on a
non-Homebrew machine `entryNodePath()` returns `process.execPath` and the mutation
stays green. T5's fabricated layout removes the host from the equation entirely by
making `process.execPath` itself a controlled Cellar path — which is why AC4 is
specified down to the `fs.realpathSync(TMP)` call and not left to the implementer.

**AC6 deliberately has no Table E row.** Any mutation that makes `entryNodePath`
non-deterministic (a module-level cache, a memo keyed on nothing) is caught by T2,
which sweeps twelve fixtures through the function **in one process** and would
return the first answer for all of them. Stating that is more honest than
inventing a contrived row for a preservation criterion.

### Test index (what to write, and where)

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/scheduler-generators.test.js | Table A rows 5–6 with an injected `realpath` — three positives (Table F rows 13–15, incl. the `node@22` and linuxbrew prefix derivations), the different-inode negative, the throwing negative (AC1) |
| T2 | tests/unit/scheduler-generators.test.js | Table A rows 1–4, table-driven over Table F rows 1–12, with an `assert.fail()` realpath (AC2) |
| T4 | tests/unit/scheduler-generators.test.js | double-render byte-identity and repeat-call stability (AC6) |
| T5 | tests/unit/scheduler-generators.test.js | the fabricated-Homebrew-layout role-split detector: `nodePath()` vs `entryNodePath()` under a controlled `process.execPath`, real `fs.realpathSync`, no seam (AC4, Table E row 7). **POSIX-only — must be declared with `{ skip: process.platform === 'win32' }`** (the `posixOnly` idiom at `tests/unit/exec-identity.test.js:26`); see AC4 for why an ungated T5 fails against a correct implementation on win32 |

There is no T3. Round 1's T3 (descriptor-digest invariance) was vacuous by
construction and its criterion (AC5) is now static — see AC5.

Name every subtest with the prefix `node-path-durability:` **followed by one
space** so the verification commands can count them with one anchored grep,
exactly as `tests/unit/scheduler-entry-identity.test.js` does with its
`entry-identity:` prefix.

T1 and T2 must be **table-driven** over arrays of `[input, expected, why]` — the
arrays are the executable form of Table F, and adding a fixture is then one line
in each of Table F and the test.

**T5 traps, in the order you will hit them.** (i) `fs.realpathSync` the temp root
*before* building any path from it, or on macOS `TMP` is `/tmp/...` while
`realpath` returns `/private/tmp/...` and the alias comparison compares two
different strings. (ii) Restore `process.execPath` in a `finally`; leaking a fake
`execPath` into the rest of the suite would corrupt every later test in the file.
(iii) The fabricated `Cellar/.../bin/node` must be a **real regular file** (any
content — it is never executed, only `realpath`'d), and `TMP/opt/node` must be a
**directory** symlink to `../Cellar/node/9.9.9`, mirroring the live layout measured
in Current state §4 — which means `TMP/opt` must be **created as a directory
first**: `fs.symlinkSync` does not create missing parents, so building the link
before `mkdir -p TMP/opt` fails with `ENOENT` and the test dies before it asserts
anything. (iv) Clean the temp dir in the same `finally`.

## Verification steps (run these; paste output in the PR)

Run everything from the repo root. **Every command below was RE-EXECUTED against
unmodified `main` at `1093e51` on 2026-08-02; the "on `main`" line under each one
is its real output there.** `5f0ffc0`'s outputs are retained in parentheses where
they moved.

> **RE-BASELINED 2026-08-02 (PR #140) — V1 and V2 only.** PR #140 added 1197 lines
> to `tests/unit/scheduler-schedule.test.js`, so **V1's counts moved**:
> `ℹ tests 82 / pass 79 / fail 0 / skipped 3` → **`ℹ tests 127 / pass 120 /
> fail 0 / skipped 7`**. **V2's threshold moves with it: "strictly greater than
> 79" is now "strictly greater than 120".** A run reporting 120 after
> implementation is a FAILURE, not a pass. **V3, V4, V5, V5b and V6 were
> re-executed and are unchanged** — their `main` outputs are byte-identical to
> `5f0ffc0`'s, which is itself the evidence that PR #140 added no `gen.nodePath()`
> call site and did not touch `descriptor.js`.

**Three rules, and they are not the same rule.**

1. **Change checks** must print something different after the fix than on `main`.
   **V2, V3 and V6 are change checks.** V2's `main` count of **`ℹ pass 120`** is a
   **FAILURE** after implementation — T1, T2, T4 and T5 add tests, so a run still
   reporting 120 means no new direct evidence was written.
2. **Preservation checks** assert something did *not* move and are supposed to
   print the same thing before and after. The carve-out covers **exactly four
   results: V1's `ℹ fail 0` line, V4, V5 and V5b** — nothing else. V1's `ℹ pass`
   count is emphatically not covered; it is V2's input.
3. **Exit status is the verdict for V1 and V5b only** (V5b is a negative grep, so
   its exit status *is* its answer). V3, V4, V5 and V6 are judged by **reading the
   printed output** — `grep` exits 0 whether it prints six lines or one. Never
   report an exit 0 from those as a pass.

Two commands need a `main` ref that exists in the implementer's worktree. Fetch it
once up front rather than assuming a local branch: `git fetch origin main --quiet`,
then use `origin/main`. V5 and V6 below are written that way.

```bash
git fetch origin main --quiet     # prerequisite for V5 and V6

# V1 (PRESERVATION of `fail 0`; its `pass` count feeds V2). Must go through
#     `npm test --`, never a bare `node --test`: tests/run.js sets
#     WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the whole suite, and without it
#     scheduler-schedule.test.js drives the real OS scheduler.
npm test -- tests/unit/scheduler-generators.test.js \
            tests/unit/scheduler-schedule.test.js \
            tests/unit/sync-repoint.test.js
# on main (RE-EXECUTED at 1093e51, 2026-08-02):
#   ℹ tests 127 / ℹ suites 0 / ℹ pass 120 / ℹ fail 0 / ℹ skipped 7
#   (was, at 5f0ffc0: tests 82 / pass 79 / fail 0 / skipped 3 — PR #140 added
#    1197 lines to scheduler-schedule.test.js. Use the 1093e51 numbers.)
# `ℹ fail 0` is the preservation result and must stay 0.

# V2 (CHANGE — anti-vacuity; judged by reading). Paste exactly these three lines
#     from V1's output, verbatim and by name: the `ℹ tests` line, the `ℹ pass`
#     line and the `ℹ fail` line. (`ℹ suites` and `ℹ skipped` are not part of the
#     judgement.) REQUIRED: `pass` strictly greater than 120 and `fail` exactly 0.
#     Then the anchored count of this WP's own named subtests:
npm test --silent -- --test-reporter=tap tests/unit/scheduler-generators.test.js \
  | grep -cE "^ok [0-9]+ - node-path-durability: "
# on main: 0.  REQUIRED after: >= 4 (one each for T1, T2, T4, T5; more is fine).

# V3 (CHANGE — Table B row 1 / AC3; judged by reading the two counts).
echo "gen.nodePath():      $(grep -c 'gen\.nodePath()' src/cli/schedule.js)"
echo "gen.entryNodePath(): $(grep -c 'gen\.entryNodePath()' src/cli/schedule.js)"
# on main (RE-EXECUTED at 1093e51): gen.nodePath(): 6 / gen.entryNodePath(): 0
# REQUIRED after:      gen.nodePath(): 0   /   gen.entryNodePath(): 6

# V4 (PRESERVATION — Table B row 2 / AC4; judged by reading the two counts).
#     Counts, not a multi-file `grep -n` listing: a multi-file grep's line ORDER
#     is not contracted, so an order-sensitive transcript comparison is a false
#     signal. Counts are order-free.
echo "run-job.js:         $(grep -c 'gen\.nodePath()' src/cli/run-job.js)"
echo "routine-runtime.js: $(grep -c 'gen\.nodePath()' src/core/routine-runtime.js)"
# on main (RE-EXECUTED at 1093e51), and REQUIRED to be IDENTICAL after:
#   run-job.js: 2   /   routine-runtime.js: 1

# V5 (PRESERVATION — Table A row 6 / AC5; judged by reading).
grep -n "node: process.execPath" src/scheduler/descriptor.js
git diff --name-only origin/main...HEAD
# on main (RE-EXECUTED at 1093e51): src/scheduler/descriptor.js:215:    node: process.execPath,
# REQUIRED after: the same single line, AND descriptor.js absent from the
# name-only diff, which must list exactly the three Deliverables files plus this
# spec.

# V5b (PRESERVATION — AC5's zero-coupling argument, made executable. This is the
#      command that replaces round 1's vacuous descriptor-digest test: it shows
#      descriptor.js cannot be affected by generators.js at all. EXIT STATUS IS
#      THE VERDICT — it must be 1 (no matches).
grep -nE "generators|nodePath|entryNodePath" src/scheduler/descriptor.js \
  && echo "FAIL: descriptor.js now references the generator surface" \
  || echo "OK: descriptor.js has zero coupling to generators.js (grep exit 1)"
# on main (RE-EXECUTED at 1093e51): no output, grep exit 1 → the OK line.
# REQUIRED after: IDENTICAL.

# V6 (CHANGE — AC8; judged by reading). The new function must add no process,
#     no timer and no require.
git diff origin/main...HEAD -- src/scheduler/generators.js src/cli/schedule.js \
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
- **The registration path reporting success from a call that did not replace the
  loaded state — on BOTH platforms. FIXED 2026-08-02 by PR #140; still out of
  scope here, now because it is DONE rather than because it is deferred.**
  *(As written at `5f0ffc0`, retained: two members of one family — (i) macOS, the
  bare `launchctl bootstrap` at `schedule.js:315`/`:431`, refused on an
  already-loaded label; (ii) Linux, the ungated best-effort `daemon-reload` at
  `:457-466`, where only `enable --now` gated `loaded`. Both were routed to the
  single prerequisite `WP-scheduler-register-replaces-loaded-record`, whose scope
  **had to cover both** — the fix is one rule, "a register that cannot verify what
  the OS now holds must not report success", and splitting it by platform would
  have closed half a family.)*
  **That routing was taken and both legs shipped together**, as predicted:
  `ensureDarwinEntryRegistered` + `darwinLoadedVerdict` on macOS, and
  `loaded = reloadOk && enableOk` with the reload hoisted on Linux. The ADR-0018
  amendment it carried landed as **ADR-0037**.
  In **this** WP: do not touch the landed machinery — `ensureDarwinEntryRegistered`
  (`:175-227`), `darwinLoadedVerdict` (`:112-157`), `darwinReplaceEntry` (`:51-55`),
  the `plutil` preflight, the `daemon-reload` calls at **`:671`** or **`:995`**, or
  the `reloadOk`/`enableOk` gate (`:681`). The old line numbers `:315`, `:431`,
  `:458`, `:777` are **dead** — do not go looking for them.
  **It was out of this WP's scope but never out of its way:** Tables C and D showed
  this WP was unsafe to merge ahead of it, which is what Definition of done item 0
  enforced. That gate is now discharged, and the residual non-convergence it did
  **not** close is recorded as Table C rows 4 and 7 — still "not our problem to fix
  here", still our problem to disclose.
- **`docs/adr/0028-…:83`** ("`node` is `process.execPath` … and is not pinned").
  This WP makes that sentence false for the registered entry. An ADR is never
  edited from a WP (WP-114 Decision 5). Owner action; slug
  `WP-adr-0028-entry-node-path-amendment`. Report it in the PR, do not edit it.
  **SATISFIED 2026-08-02:** the dated amendment landed via **PR #138** and is
  **owner-signed** at `docs/adr/0028-…:1215`
  (`Status: **ACCEPTED - OWNER-SIGNED 2026-08-02**`); `:83` is correctly left
  unedited. **The implementer still edits nothing under `docs/adr/` — the gate is
  satisfied by CITING that line, and writing an owner marker is never an
  implementer action.** See Definition of done item 8.
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

0. **BLOCKER — checked by the architect before dispatch, not by the implementer.**
   **SATISFIED 2026-07-28 — all three sub-items. Retained as the record of what
   was required and what discharged it.**
   - **(0a) DONE — as a SCOPE claim only.** The
     `WP-scheduler-register-replaces-loaded-record` **spec** exists, and its scope
     covers Table C row 4 (linux, degraded `daemon-reload`) **as well as** row 5
     (macOS). Verified against `main`'s copy of that spec rather than branch
     history: its banner maps *"row 5 (macOS) — **both** bare-`bootstrap` sites"*
     to its Table A rows 1 and 2, and *"row 4 (linux, degraded reload)"* to its
     Table A row 3. Both of this spec's non-converging rows therefore have an
     **owner**.
     **CORRECTED 2026-08-02 — this sub-item used to end "and it has shipped".**
     It had not, and that clause is deleted. `git show --stat fbc9d80`: PR #125
     merged **three docs files** — `docs/adr/0037-…md`, `docs/adr/README.md` and
     that **spec document** — with **zero `src/` and zero `tests/`**. What merged
     was the *design*; the registration-replacement **implementation has not
     shipped**, and as of 2026-08-02 that spec is `status: Draft`, absent from
     `docs/specs/done/`. **Having an owner is not the same as being fixed** — the
     silent-nonconvergence hazard is live in production. This is the same
     correction already applied to the DISPATCH BLOCKER banner at the head of this
     spec; the two copies now agree.
   - **(0b) DONE.** Its id is recorded in this spec's `depends_on`. This was the one
     step that converts the blocker from prose into a machine check:
     `scripts/check-frontmatter.js` rejects a `depends_on` id that does not
     resolve, but **never** complains about a *missing* one — so an empty
     `depends_on` was invisible to tooling. It is no longer empty, and the resolver
     now enforces the ordering.
   - **(0c) DISCHARGED — for the BLOCKER only.** With 0a and 0b satisfied,
     `status:` moves `Draft` → `Ready`.
     **`Ready` was NOT clearance to dispatch.** See the **DISPATCH PRECONDITION**
     in the banner at the head of this spec: dispatch additionally requires
     `WP-scheduler-register-replaces-loaded-record` to be **`Done`** — merged
     **and** verified. *(As written on 2026-08-02 and retained: "which as of
     2026-08-02 it is not (`Draft`, absent from `docs/specs/done/`)".)*
     `scripts/check-frontmatter.js` resolves a
     `depends_on` id to an existing spec **file** and never reads its `status`, so
     **nothing mechanical enforces this** and 0b's machine check does not cover
     it. The blocker and the precondition are independent gates; discharging one
     discharges nothing about the other.
   - **(0d) DISPATCH PRECONDITION — SATISFIED 2026-08-02.**
     `WP-scheduler-register-replaces-loaded-record` is **`Done`**: implemented and
     merged as **PR #140** (merge **`7b22d71`**, +266 `src/cli/schedule.js`, +132
     `src/scheduler/generators.js`, +1197 `tests/unit/scheduler-schedule.test.js`),
     Done-flipped by **PR #143**, and now at
     `docs/specs/done/WP-scheduler-register-replaces-loaded-record.md` with
     `status: Done`. Post-merge suite on `main` @ **`1093e51`**:
     **`ℹ tests 1897 / ℹ pass 1888 / ℹ fail 0 / ℹ skipped 9`**.
     `node scripts/check-frontmatter.js` still resolves this spec's `depends_on`
     against the `done/` location (`frontmatter check passed: 209 spec(s)`).
     **This WP is dispatchable.** All four sub-items 0a-0d are closed.

   The reason the blocker existed was **Table D**: without that sibling, this WP
   converted a loud failure into a silent one on every already-installed macOS
   machine (D-a) and on every Linux machine with a degraded `daemon-reload` (D-b).
   **Both of those tables have been re-derived against `1093e51` and both
   false-success rows are gone** — that is precisely what the sibling fixed, and it
   is why the gate existed rather than being ceremony. Read the reconciled Tables
   C, D and G, not a memory of their pre-#140 shape.
1. All verification steps pass locally; output pasted into the PR body, with V2's
   pass count **strictly above 120** (RE-BASELINED 2026-08-02 at `1093e51`; it was
   79 at `5f0ffc0` — do **not** use the old number), V2's subtest count `>= 4`, and
   V3's two counts flipped to 0 / 6.
2. Every Table E row (1–8) demonstrated red (with the "selected exactly one named
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
7. **AC9 (RESTATED 2026-08-02 — see AC9 for the full four-part wording).** The PR
   body reproduces **Table C and all three sub-tables of Table D verbatim**, states
   that Table C rows **4 and 7** do not converge, that row **5 now does** (PR #140,
   the sibling's fix and not this WP's), that Table D's false-success rows are
   **gone**, and that **Table G's premise is settled TRUE** (executed 2026-08-02,
   Current state §9) with item 9's **smoke-test** result reported — and does
   **not** claim the incident class is closed.
   *(Superseded: "that **Table G's premise is unverified** with item 9's observed
   branch reported".)*
   *(Superseded: "states that Table C rows 4 and 5 do not converge and that Table
   D's final row in each sub-table reports that non-convergence as success.")*
8. **ADR-0028 sequencing (OWNER). — SATISFIED 2026-08-02.**
   `WP-adr-0028-entry-node-path-amendment`'s
   dated amendment has landed in `docs/adr/0028-scheduler-app-executable-integrity.md`
   **and carries the owner's hand-typed signature**, at or before this WP's
   merge. This WP does not merge leaving an owner-signed ADR line silently false.

   **SATISFACTION RECORD (2026-08-02) — a CITATION of an existing owner marker,
   never the creation of one.** Verified in-tree at `1093e51`:
   - `docs/adr/0028-scheduler-app-executable-integrity.md:1213` — the amendment
     heading, *"## Amendment (2026-08-01) — the scheduler ENTRY's node path is an
     upgrade-durable alias; `process.execPath` stays the runtime and the
     authorization value"*.
   - **`:1215`** — byte-exact: `Status: **ACCEPTED - OWNER-SIGNED 2026-08-02**`.
     This supersedes the `PROPOSED — awaiting owner signature` status the
     amendment carried when this spec was last revised.
   - Landed via **PR #138** (`wp/adr-0028-owner-signature`, merge `b124efc`); the
     routing spec `WP-adr-0028-entry-node-path-amendment` is `status: Done` at
     `docs/specs/done/`.
   - `:83` is **correctly still unedited**, per ADR-0028's own preamble convention
     (`:18-20`).

   **Neither the architect nor the implementer wrote that signature, and neither
   may.** An `OWNER-SIGNED` line is typed by Gyula Fehér by hand; this item is
   discharged by pointing at his, not by producing one. The implementer touches
   **no** file under `docs/adr/` — it is not in the Deliverables table.
9. **Table G — live smoke test on macOS + Homebrew. NEW 2026-08-02; the PREMISE
   GATE it started as is DISCHARGED.**

   > **The gate is closed and did not need the implementer.** Table G's premise —
   > that `launchctl print` echoes `ProgramArguments[0]` verbatim into `program`
   > rather than realpath-resolving it — was **settled by experiment on
   > 2026-08-02, pre-implementation: P is TRUE** (Current state §9; scratch label
   > `ai.wienerdog.premise-check` carrying a symlinked program path, so literal ≠
   > realpath; both `program` and `arguments` echoed the alias verbatim; full
   > teardown, zero residue).
   >
   > *(Superseded framing, retained: this item read "**SETTLE BEFORE MERGE** …
   > **Cellar path printed** ⇒ premise **FALSE**. **Do not merge.**" That
   > do-not-merge branch **did not occur**. It stays on the record because the
   > routed follow-up it names — realpath `program` before comparing, or drop it
   > as redundant with `arguments[0]`, inside `darwinLoadedVerdict`, **the
   > sibling's code and out of this WP's Deliverables** — remains the correct
   > response if the behavior ever changes. **No such WP is needed today.**)*

   **What remains is a smoke test, and it is still worth running.** It confirms the
   *whole path* end to end — that `entryNodePath` actually produced the alias, that
   the renderer wrote it, that `expect.argv[0]` matched it, and that the second
   register is a verified skip. After D1/D2 are implemented, on a real Homebrew
   macOS install, run `wienerdog sync` and then:

   ```bash
   launchctl print gui/$(id -u)/ai.wienerdog.dream | grep -E '^[[:space:]]+program ='
   ```

   - **Expected** (`/opt/homebrew/opt/node/bin/node`, the alias) ⇒ consistent with
     the settled premise and with Tables C row 5 / D-a. Then run `wienerdog sync` a
     **second** time and confirm it makes **no** `launchctl` mutation and reports
     nothing — the `'match'` verdict path.
   - **Unexpected** (a `/opt/homebrew/Cellar/node/<version>/bin/node`, or a second
     `sync` that mutates) ⇒ **stop and report; do not merge.** This would
     contradict an executed result, so treat it as new evidence about launchd
     rather than a defect in `entryNodePath`, and route it to the
     `darwinLoadedVerdict` follow-up named above.

   Paste the command's output into the PR body and state which branch was observed.
   **`npm test` still cannot substitute for this** — `tests/run.js` sets
   `WIENERDOG_TEST_NO_REAL_SCHEDULER=1`, and `fakeLaunchd` renders
   `program: argv[0] || ''` from the plist it stored, so it models P true by
   construction. If no Homebrew macOS host is available, say so explicitly rather
   than marking this item done. **Note the difference from the old framing: an
   unrunnable smoke test is no longer an open risk about the premise** — that is
   settled — **only unconfirmed end-to-end wiring.**

   **Corrected 2026-08-01 (gate round 1).** This item previously offered a second
   branch — *"or that line carries an owner-written annotation"* on
   `docs/adr/0028-…:83` itself. That branch is **withdrawn**: it contradicts
   ADR-0028's own convention, stated in its preamble (`:18-20`), that a later
   ruling *"lands as a dated amendment to this ADR"* — never as an edit to the
   superseded text. None of that ADR's five prior amendments annotated the text
   it refined, and the amendment spec forbids it explicitly. The dated amendment
   plus its owner signature is the **only** way this item is satisfied.
