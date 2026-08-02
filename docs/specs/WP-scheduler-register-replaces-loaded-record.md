---
id: WP-scheduler-register-replaces-loaded-record
title: A register that cannot verify what the OS now holds must not report success
status: In-Review
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0018, ADR-0027, ADR-0028, ADR-0031, ADR-0037]
epic: audit-a7
---

# WP-scheduler-register-replaces-loaded-record: verified registration on every platform

> **This WP is the prerequisite named by `WP-scheduler-node-path-durability`'s
> DISPATCH BLOCKER.** That spec's Definition of done item 0a requires this WP's
> scope to cover **both** its Table C row 4 (linux, degraded `daemon-reload`) and
> its Table C row 5 (macOS, already-loaded record). It does:
>
> | that spec's Table C row | covered here by |
> |---|---|
> | row 5 (macOS) — **both** bare-`bootstrap` sites | Table A rows 1 **and** 2 — per-job (`schedule.js:429-431`, the primary path its Table D-a traces via `:584`) **and** catch-up (`:314-317`) |
> | row 4 (linux, degraded reload) | Table A row 3 |
>
> Row 5 covers **two** call sites and both are mapped; an earlier draft mapped only
> the catch-up site, which would have made that spec's blocker-lift verify the
> wrong row. When this WP merges, that spec's item 0b adds this id to its
> `depends_on`. **Do not edit that spec from this branch.**

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler: a launchd `.plist` on macOS, a systemd `.timer`/`.service` on Linux, a
Task Scheduler XML on Windows. `wienerdog sync` and `wienerdog schedule add` write
those files and then call the OS to register them. **IRON RULE (ADR-0004):
Wienerdog is just files.** This WP adds no daemon, no watcher, no poller and no
telemetry — every check it adds is an in-band step of the attended register call
that already runs, and it exits with it.

Registration idempotency is keyed off the **file bytes**: `ensureEntry`
(`schedule.js:170-191`) returns `false` when the on-disk bytes already match and a
manifest entry exists, and the caller then makes **no OS call at all**. On two of
the three platforms the register step also reports success from a call that did
not, and could not, change what the OS holds. The result is a register that says
everything is fine while the OS runs the previous registration — the
failing-outside-our-own-observability signature this project has now hit four
times.

**The rule this WP implements:** *a register that cannot verify what the OS now
holds must not report success — and must not skip the OS call without evidence.*
That is ADR-0037 (Accepted, OWNER-SIGNED 2026-07-28), which amends
ADR-0018 decision 2.

**The evidence must be a LIVE READBACK, not a durable cache.** A round-1 draft of
this spec used the cached `state/scheduler-status.json` as the evidence. Three
independent review findings converged on that being wrong, and the reasoning is
recorded in Current state §9 because it *is* the design: Windows — the one leg
that already obeys the rule — is idempotent precisely because it **re-reads the
live loaded task**. Every leg here now does the same, or does not skip at all.

## Current state

Everything below was **executed** against the live tree at commit `5f0ffc0`
before being written. Line numbers are that commit's.

### 1. `ensureEntry` — byte-keyed idempotency (`schedule.js:170-191`)

Reflowed excerpt, the elided middle writes the file and records the manifest
entry. **This block is a paraphrase for orientation, not a byte-exact quote** —
the only byte-exact literals in this spec are §4's warning and §8's notice, each
marked as such:

```js
function ensureEntry(manifest, filePath, content, unload) {
  … onDiskMatches = fs.readFileSync(filePath).equals(buf) …
  const hasEntry = manifest.entries.some((e) => e.kind === 'scheduler-entry' && e.path === filePath);
  if (onDiskMatches && hasEntry) return false;
  …
  return true;
}
```

Its return value is the `changed` flag every register site gates its OS call on.
It is a statement about **files**, and every defect below is a place where it was
read as a statement about the **OS**.

### 2. macOS — the bare `bootstrap`, at two sites

Per-job (`schedule.js:429-431`):

```js
    let loaded = true;
    let changed = ensureEntry(manifest, plistPath, content, unload);
    if (changed) loaded = loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
```

Catch-up, inside `ensureCatchup` (`schedule.js:314-317`):

```js
  if (ensureEntry(manifest, plistPath, content, unload)) {
    return { loaded: loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0 };
  }
  return { loaded: true };
```

`launchctl bootstrap` fails for an already-loaded label — ADR-0018's 2026-07-25
amendment (decision 2) states it directly, and `darwinReplaceEntry` exists
**because** of it.

### 3. macOS — the replace primitive, and the teardown it cannot justify

`schedule.js:51-55`:

```js
function darwinReplaceEntry(loader, uid, label, plistPath) {
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return true;
  loader(['launchctl', 'bootout', `gui/${uid}/${label}`]);
  return loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
}
```

Bootstrap-first, which is right. But the teardown fires on **any** non-zero
bootstrap: a transient failure, a permissions error, or an invalid replacement
plist is indistinguishable here from "already loaded". On the heal path that was
tolerable — the record had already been graded broken. On the **register** path it
is not: a working schedule can be destroyed and not restored. Its only callers
today are `reloadJob` and `repairCatchup`, both heal-gated — though
`repairCatchup` is *reached from* the register path via `repointSchedules`
(`schedule.js:591`), so "heal path" is imprecise for it: say **heal-gated but
reached from the register path**.

### 4. Linux — `daemon-reload` is ungated (`schedule.js:457-466`)

The whole block sits inside `if (changed) {` (`:456`). The reload is at `:458`,
its warning `if` at `:462-465`, and `enable --now` — the only thing that gates
`loaded` — at **`:466`**:

```js
      const reload = loader(['systemctl', '--user', 'daemon-reload']);        // :458
      if (!reload || reload.status == null || reload.status !== 0) {          // :462
        …
      }                                                                        // :465
      loaded = loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]).status === 0;  // :466
```

The warning string, **byte-exact**:

```
wienerdog: warning — 'systemctl --user daemon-reload' returned ${s}; the timer may load from stale units. Run 'wienerdog doctor'.
```

So a degraded reload plus a successful `enable --now` yields `loaded = true` over
stale units, one stderr warning, and — because the next register's bytes are
identical — **no reload attempt ever again**.

### 5. Linux — what heals, and what does not

`deriveIdentityArgv` returns `{kind:'systemd', argv:null}` for a `.timer` basename
(`generators.js:178-180`), so `defaultProbe` **step 6** returns `'unknown'`
(`status.js:119` — `:114` is the `WIENERDOG_LOADER_NOOP` step, not this one),
which is not in `HEAL_SET` (`status.js:80`). The shipped test
`entry-identity: a systemd entry yields unknown, not a health claim`
(`tests/unit/scheduler-entry-identity.test.js:423-430`) pins it.

**Linux is not heal-less.** An **absent or inactive** timer makes the step-3 probe
(`systemctl --user is-active …`) exit non-zero, so step 4 returns `'missing'`,
which **is** in `HEAL_SET`, and `reloadJob` runs. What has no heal path is an
**active** timer running from stale units: `is-active` exits 0, step 4 does not
apply, and the entry short-circuits at step 6. That — stale-but-running — is
exactly the case §4 produces, which is why §4 must be fixed at the register step.

### 6. Windows — already conforming (`schedule.js:240-245`)

```js
function ensureWindowsTaskRegistered(loader, taskName, xmlPath, o) {
  if (!o.changed && windowsLoadedTaskMatches(loader, taskName, o.command, o.argline)) {
    return true; // loaded task verifiably equals canonical → idempotent skip
  }
  return loader(['schtasks', '/create', '/tn', taskName, '/xml', xmlPath, '/f']).status === 0;
}
```

It skips the OS call **only** after re-reading the LOADED task and verifying it
equals canonical; every other state — including unreadable and unverifiable —
force-registers **on the two fields it reads**. Both other legs are shaped to that
*pattern* — skip only on a live readback — but Windows is **not** the reference
implementation of the rule, because its readback covers only `<Command>` and
`<Arguments>`: see Table A row 4's residual. A round-2 draft called it "the
reference leg"; that overstated what it verifies. Note what its verified skip costs: one read-only `schtasks /query`.
It is not a zero-call path, and it never was.

### 7. The readback machinery already exists for launchd

`generators.launchdLoadedArgs(stdout)` (`generators.js:679-689`) returns the
`arguments = { … }` block as an array of **trimmed** argument strings, or `null`
when the block never opened or never closed. Pure string work, never throws,
already used internally by `loadedEntryTargets` (`:787`) — but **not currently
exported**, which is D0's one-line change.

`launchctl print`'s **exit status** is itself a cheap loaded/not-loaded answer.
Measured on the authoring host (macOS 26, uid 501), executed:

```
$ launchctl print gui/501/ai.wienerdog.dream    ; echo $?
0        # loaded
$ launchctl print gui/501/ai.wienerdog.nonesuch ; echo $?
113      # absent
```

One invocation therefore answers both questions this WP needs on macOS: whether a
verified skip is allowed, and whether a teardown is justified. Only `=== 0` is
treated as loaded — `113` and every other non-zero value mean "not loaded", and
the code must not special-case 113.

### 7b. What ELSE `launchctl print` exposes — executed, and it decides CX-1

The round-4 comparison covered the argv only. A loaded record differing solely in
**firing time** passed it, so a stale schedule persisted — reachable by the same
pre-WP transition family as the stale digest. The question is whether `print`
exposes the other behavior-bearing fields. **It does.** Executed on the authoring
host against `gui/501/ai.wienerdog.dream`:

```
        environment = {
                OSLogRateLimit => 64
                WIENERDOG_HOME => /Users/gyulafeher/.wienerdog
                NODE_PATH =>
                ANTHROPIC_API_KEY =>
                CLAUDE_CONFIG_DIR =>
                NODE_OPTIONS =>
                HOME => /Users/gyulafeher
                CODEX_HOME =>
                XPC_SERVICE_NAME => ai.wienerdog.dream
        }

        event triggers = {
                ai.wienerdog.dream.268435561 => {
                        …
                        stream = com.apple.launchd.calendarinterval
                        descriptor = {
                                "Minute" => 30
                                "Hour" => 3
                        }
                }
        }
```

Three parse facts, each executed, each load-bearing — and each a reason the
comparison must be written carefully rather than by analogy to the argv block:

1. **The env block is NOT a mirror of our `EnvironmentVariables`.** launchd injects
   keys we never set — `OSLogRateLimit` and `XPC_SERVICE_NAME` are both present
   above. A set-equality comparison would therefore **always** fail and no skip
   would ever be granted. The comparison must be **containment**: every canonical
   pair must appear with its expected value; unrecognized extra keys are ignored.
2. **`environment = {` is not uniquely anchored by a suffix match.** The output
   contains `inherited environment = {` and `default environment = {` **before**
   it, and both end with the same characters. The block must be found by a
   **trimmed exact-line equality** on `environment = {`, exactly the way
   `launchdLoadedArgs` anchors on `arguments = {`.
3. **The calendar fields are nested two levels deep** — `event triggers` → a
   generated `<label>.<id>` key → `descriptor = {` — with **quoted keys and
   unquoted values** (`"Minute" => 30`). The parser reads the `descriptor` block
   under the trigger whose `stream` is `com.apple.launchd.calendarinterval`.

4. **Five of the seven canonical env pairs render with EMPTY values.** In the
   block above, `NODE_PATH`, `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`,
   `NODE_OPTIONS` and `CODEX_HOME` all appear with nothing after the arrow — they
   are `scheduledEnvPairs`' ambient-scrub bindings, and the empty string is their
   *intended* value. A parser treating a valueless line as absent would drop five
   of seven bindings, and containment would then pass for a record carrying **no
   scrub at all** — certifying the removal of the control it was reading.

### 7c. What else the live record exposes — executed, and it decides CX10-1

Round-9's Table A2 argued its exclusions **renderer-side** ("a constant cannot vary
between two canonical renders"). That is the wrong side: the comparison certifies
the **loaded record**, where a field can differ through manual `launchctl` edits or
a partial/foreign write even though our renderer would never emit it differently.
So the exclusions had to be re-decided from what `print` actually shows. Dumped in
full on the authoring host (96 lines); the fields that matter:

```
gui/501/ai.wienerdog.dream = {
        path = /Users/gyulafeher/Library/LaunchAgents/ai.wienerdog.dream.plist
        type = LaunchAgent
        program = /opt/homebrew/Cellar/node/25.9.0_2/bin/node
        arguments = { … }
        stdout path = /Users/…/logs/dream/launchd.out.log
        stderr path = /Users/…/logs/dream/launchd.err.log
        environment = { … }
        event triggers = { … }
        spawn type = background (5)
        properties = inferred program
}
```

**Exposed and therefore comparable** (each a single trimmed `key = value` line,
the same parse shape as `arguments`): `path` — *the plist file launchd actually
loaded from*, a check the spec had no equivalent of; `program`; `stdout path`;
`stderr path`; `spawn type` (this is `ProcessType: Background` reflected back);
and the **full `event triggers` list**, which makes trigger *uniqueness* checkable.

**NOT verifiable here: `RunAtLoad`.** It appears in no field of this record — and
this record has no `RunAtLoad`, since only `catchupPlist` renders it. The catch-up
label is **not loaded on the authoring host** (`doctor` reports it as not loaded),
so what `print` shows for a `RunAtLoad` entry could not be executed. `properties =
inferred program` is the likeliest carrier, but that is a guess and this spec does
not specify unexecuted parse shapes. It is handled by the darwin honesty clause in
Table A2, not by a guessed parser.

### 8. The notice the user sees (`schedule.js:583-585`)

**Byte-exact**, including the trailing period:

```
"<job>" schedule file written but the OS scheduler did not accept it — run 'wienerdog doctor'.
```

This WP does not change the string; it makes it fire when it should.

### 9. Why a durable cache cannot be the evidence — three executed facts

A round-1 draft skipped the OS call when `state/scheduler-status.json` recorded
`'loaded'`. That is unsound, for reasons that are facts about this tree:

1. **The `add` path never writes the cache.** Every `refreshSchedulerStatus` call
   site: `status.js:383` (the heal), `run-job.js:1236`, `sync.js:247`,
   `schedule.js:650` and `:675`. `wienerdog schedule add` reaches none of them, so
   a fresh add leaves `{entries: []}` — and a cache-gated skip would then attempt
   on every re-add, breaking the shipped invariant at
   `tests/unit/scheduler-schedule.test.js:389-397` on all supported platforms and
   contradicting CLAUDE.md's idempotence convention.
2. **On Linux the cache can never say `'loaded'`.** Every `.timer` short-circuits
   to `'unknown'` at step 6 (§5). The predicate would be dead code on the very
   platform it was meant to serve, and every register would re-register.
3. **The cache can say `'loaded'` while the OS holds nothing.** The macOS replace
   refreshes the cache *before* the teardown (ADR-0018's pre-destructive marker),
   so a crash between `bootout` and the final `bootstrap` leaves `'loaded'`
   recorded with the job absent. An external `launchctl bootout` after a
   successful probe reaches the same state.

The conclusion is the design: **evidence must be read live, at the moment of the
decision, from the OS.** Windows already does exactly that.

### 10. The `sync` refresh chain that keeps the cache warm (context only)

`sync.js:222` calls `repointSchedules`, `:240` calls `reloadMissing`, `:247` calls
`refreshSchedulerStatus`. That ordering is why the cache is usually populated
*after* a sync and never after an `add`. It is recorded because it is load-bearing
for understanding §9; `src/cli/sync.js` is **not a deliverable** and this WP does
not change the chain.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing.** Two new non-exported helpers plus four edited call sites in one file,
one new Proposed ADR, one test file extended, plus **one existing assertion in a
second test file** (D6, the 2026-08-02 boundary amendment below). **M** — one session.

| Action | Path | Notes |
|--------|------|-------|
| create | docs/adr/0037-verified-registration-postcondition.md | The rule + the ADR-0018 decision-2 amendment. **Accepted, OWNER-SIGNED 2026-07-28.** Written by the architect, together with its `docs/adr/README.md` index row; the implementer edits neither. **0036 is deliberately skipped** — reserved by the in-flight ADR amending ADR-0031. |
| modify | docs/adr/README.md | **D0b** — the ADR index row for 0037. Written already by the architect alongside the ADR; the implementer does not touch it. Listed because it **is** in this branch's diff, and a Deliverables table that omits a changed file is exactly the boundary-gate failure this row fixes. |
| modify | src/scheduler/generators.js | **D0** — add **four** names to `module.exports`, and add **two** new pure parsers (`launchdLoadedCalendar`, `launchdLoadedEnv` — D1b). Existing names exported unchanged:: `launchdLoadedArgs` (`:679-689`, used internally at `:787`) and `jobLaunchArgs` (`:208`, used internally at `:355`); the two new parsers are exported with them. Structural, not an API promise — the WP-114 precedent for `repairCatchup`. Audited, not assumed (see "Export audit" in Implementation notes): `catchupLaunchArgs` (`:1030`) and `loadedEntryTargets` (`:1007`) are **already** exported and need no change. |
| modify | src/cli/schedule.js | **D1, D2, D3, D4 and D5** — the complete set, reconciled against the Implementation notes and the ACs: **D1** `darwinLoadedVerdict` + `ensureDarwinEntryRegistered` (new, non-exported, incl. the `plutil` preflight, the tri-state verdict, `verifyLoaded` and the rollback); **D2** the darwin per-job arm (`:429-431`, Table A row 1); **D3** `ensureCatchup` (`:314-317`, row 2); **D4** the linux arm (`:456-466`, row 3); **D5** `add()`'s guard at `:882` — drop the `changed &&` conjunct so it throws on ANY unloaded outcome (**required by AC11**; a cell that stopped at D4 would leave the user-facing false-success shipped). Nothing beyond those five — no probe, no heal, no notice string, no Windows path, and **`darwinReplaceEntry` itself is not edited** (it stays the heal path's primitive). |
| modify | tests/unit/scheduler-schedule.test.js | **T1, T2, T2b, T2c, T2d, T2e, T2f, T2g, T3, T4, T5, T6, T7** — the complete Test index, enumerated rather than range-abbreviated because `T3-T7` silently excluded T2c/T2d/T2e (the `plutil` preflight, its existence gate, and the post-bootstrap verify). Plus, **and only**, what **Table E** enumerates (amended 2026-08-02, round-1 finding 3): its **five** existing-assertion rows and its authorized setup-only `fakeLaunchd` loader swap at the ten sites it lists. The new `fakeLaunchd` helper itself is part of the T-test scaffolding. **Table E is the authority — this cell deliberately carries no site list of its own**, because the earlier "four existing assertions" wording here was one of the mirrors that stayed stale while the branch carried five. T3 case (xxii) and T5 additionally carry **Table N**'s two notice assertions. |
| modify | tests/unit/init.test.js | **D6 / T8 — architect boundary amendment, 2026-08-02.** ONE existing assertion in the single test `init --fresh-vault schedules the nightly dream and surfaces it (ADR-0014)`: its `/catches up automatically/i` match becomes platform-aware, because under `WIENERDOG_LOADER_NOOP=1` the darwin leg now correctly reports `loaded: false`. Added post-hoc — the collision was discovered at `npm test` time, not at spec time; the full record, the decision and the rejected alternative are in Implementation notes → **D6**. Nothing else in this file: no other test, no helper, no `tempEnv`/`run` change. |

Not deliverables, deliberately: `src/scheduler/status.js`,
`src/scheduler/spawn.js` (**D6's rejected alternative** — the NOOP seam is never
taught to fabricate a readback; see Implementation notes → D6),
`src/scheduler/launcher.js`, `src/cli/sync.js` (§10), `src/cli/doctor.js`,
`docs/adr/0018-windows-scheduled-dreaming.md` (owner-signed; ADR-0037 amends it
from a new file — never edit it),
`docs/specs/WP-scheduler-node-path-durability.md` (see the banner),
`docs/GLOSSARY.md`.

### Exact contracts

```js
/**
 * What does the LOADED launchd record say, relative to what we would register
 * right now? Returns a TRI-STATE verdict, never a boolean. Pure
 * string work over `launchctl print` stdout — no spawn, no fs, never throws.
 * Compares EVERY canonical field that can vary between two renders, not just
 * the argv (Table A2): the complete ProgramArguments element by element, the
 * StartCalendarInterval Hour/Minute, and the EnvironmentVariables bindings by
 * CONTAINMENT (launchd injects keys of its own — Current state §7b fact 1).
 * The verdict vocabulary is **adopted verbatim from `loadedEntryTargets`**
 * (`generators.js:784`) and **extended by one member** for Table A2b's fatality
 * tiering — `'match' | 'mismatch-fatal' | 'mismatch-benign' | 'indeterminate'`.
 * The bare `'mismatch'` is NOT a value this function can return; it survives in
 * this spec only as narration of the pre-tiering contract.
 *   'match'         — every block parsed AND every compared value equal.
 *   'mismatch-fatal'  — everything parsed AND a FATAL-tier field differs
 *                     (Table A2b). THE ONLY VERDICT THAT MAY AUTHORIZE A TEARDOWN.
 *   'mismatch-benign' — everything parsed, every FATAL field equal, and only a
 *                     BENIGN-tier field differs. No skip AND no teardown: the
 *                     loaded record is still doing its authorized job, so
 *                     destroying it could leave no working schedule at all.
 *   'indeterminate' — any block failed to parse. The ABSENCE of evidence, not
 *                     evidence of divergence: it permits the non-destructive
 *                     bootstrap attempt and NOTHING further.
 * @param {string} stdout  `launchctl print` output (untrusted display text)
 * @param {{argv:string[], hour:number|null, minute:number, env:Array<[string,string]>,
 *          path:string, stdoutPath:string, stderrPath:string, spawnType:string}} expect
 *   the canonical values just rendered
 * @returns {'match'|'mismatch-fatal'|'mismatch-benign'|'indeterminate'}
 */
function darwinLoadedVerdict(stdout, expect)

/**
 * Register one launchd entry, reporting success only from evidence about what
 * launchd now holds (ADR-0037). Mirrors ensureWindowsTaskRegistered. ONE
 * `launchctl print` serves both decisions: whether a verified skip is allowed,
 * and whether a teardown is justified.
 * @param {(argv:string[])=>{status:number,stdout?:string}} loader
 * @param {number} uid @param {string} label @param {string} plistPath
 * @param {{changed:boolean, expect:{argv:string[],hour:number|null,minute:number,env:Array<[string,string]>,
 *          path:string,stdoutPath:string,stderrPath:string,spawnType:string},
 *          priorBytes:Buffer|null, canonicalBytes:Buffer, onBeforeTeardown:()=>void}} o
 *   `canonicalBytes` is the rendered plist this invocation wrote — the SAME value
 *   handed to `ensureEntry`. It is REQUIRED: the staleness guard reads it, and a
 *   missing binding is a ReferenceError on the post-teardown failure path, i.e. a
 *   crash with the schedule already removed.
 * @returns {boolean} true only when launchd verifiably holds this entry
 */
function ensureDarwinEntryRegistered(loader, uid, label, plistPath, o)
```

`ensureDarwinEntryRegistered`'s body, stated as the contract (Table A rows 1-2):

```js
  const printed = loader(['launchctl', 'print', `gui/${uid}/${label}`]);
  const isLoaded = !!printed && printed.status === 0;
  //     `verdict` is FOUR-STATE plus the caller's 'absent': 'absent' |
  //     'indeterminate' | 'mismatch-benign' | 'mismatch-fatal' | 'match'.
  const verdict = isLoaded ? darwinLoadedVerdict(printed.stdout || '', o.expect) : 'absent';
  // (a) THE LIVE MATCH WINS — regardless of o.changed. The readback is the
  //     evidence; `changed` is a statement about a FILE and must not force the
  //     teardown of a record that already is what we would register.
  if (verdict === 'match') return true;
  // POST-BOOTSTRAP VERIFY — applied after EVERY successful bootstrap, not only
  // the post-teardown one. launchd loads whatever is on disk at that moment, not
  // the bytes we rendered/linted, so a bootstrap exit 0 is NOT evidence about
  // what got loaded. DETECTION only, never a repair (see "The file race").
  const verifyLoaded = () => {
    const after = loader(['launchctl', 'print', `gui/${uid}/${label}`]);
    return !!after && after.status === 0
      && darwinLoadedVerdict(after.stdout || '', o.expect) === 'match';
  };
  // (b) non-destructive attempt first (ADR-0018 ordering, preserved)
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return verifyLoaded();
  // (c0) PREFLIGHT — never destroy a loaded record for a known-bad replacement.
  //      Gated on EXISTENCE, not on the loader's result shape: schedulerSpawn
  //      normalizes a spawn error (incl. ENOENT) to {status:1} and discards the
  //      error, so "absent plutil" and "lint rejected the file" are the SAME
  //      value to a caller. Existence is what distinguishes them.
  if (fs.existsSync(PLUTIL)) {
    if (loader([PLUTIL, '-lint', plistPath]).status !== 0) return false;
  }
  // (c) TEARDOWN ONLY ON A POSITIVELY ESTABLISHED MISMATCH. 'absent' means
  //     nothing to tear down; 'indeterminate' is the ABSENCE of evidence, not
  //     evidence of divergence — destroying a record we could not read would be
  //     the exact opposite of this WP's rule.
  if (verdict !== 'mismatch-fatal') return false;   // benign / indeterminate / absent
  o.onBeforeTeardown();                       // ADR-0018 marker (advisory — see below)
  loader(['launchctl', 'bootout', `gui/${uid}/${label}`]);
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return verifyLoaded();
  // (d) ROLLBACK — the replacement is unbootstrappable; restore the prior
  //     registration so no destruction window ships. Never returns true.
  //     BEST-EFFORT STALENESS CHECK (not atomic — see the residual): restore ONLY
  //     if the file still holds the bytes THIS invocation wrote. If another
  //     invocation has written since, its bytes are newer than ours and
  //     overwriting them would destroy a registration we never inspected.
  if (o.priorBytes !== null) {
    let current = null;
    try { current = fs.readFileSync(plistPath); } catch { current = null; }
    if (current !== null && current.equals(o.canonicalBytes)) {
      try { fs.writeFileSync(plistPath, o.priorBytes); } catch { return false; }
      loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
    }
  }
  return false;
```

## Contract reference

**Activation (ADR-0031, 2-of-7): three triggers fire.** (iv) fallback/precedence
behavior changes — what gates a reported success, and when an OS call may be
skipped; (v) the task crosses an authority boundary — the register emits a success
verdict whose subject is state the OS owns; (vii) the same rule is mirrored across
three platform legs, the Deliverables cells, the acceptance criteria and the ADR.

Per the A1 rule set (ADR-0036, **Accepted, OWNER-SIGNED 2026-07-28**) — each table row is one
gate with one fixture and one mutation, and Table B keeps trigger separate from
patch with no ordinals.

### Table A — the verified-registration postcondition, per platform (canonical)

`changed` is `ensureEntry`'s byte verdict. "Reports success" is the `loaded` value
reaching `repointSchedules` (`schedule.js:583`). **"Verified skip" means zero
MUTATING calls and one read-only readback** — the cost Windows has always paid.

**Table A is an INDEX, not a second decision authority.** It says which platform
is governed by what; it deliberately carries **no** skip/teardown rule text of its
own. A round-5 draft did restate those rules here, and they then survived
un-updated through three rounds of amendments while Table A1 and Table A2 moved —
two canonical tables silently disagreeing. **A canonical that restates another
canonical is how that happens.** If you find yourself wanting to spell a rule out
in this table, put it in A1 or A2 and point at it.

| # | Platform / site | Decision authority | Comparison authority |
|---|-----------------|--------------------|----------------------|
| 1 | darwin per-job (`:429-431`) | **Table A1** | **Table A2** |
| 2 | darwin catch-up (`:314-317`) | **Table A1** (label `ai.wienerdog.catchup`; canonical argv from `catchupLaunchArgs`, `hour: null`) | **Table A2** |
| 3 | linux (`:456-466`) | **no verified skip ever** — always attempt; `loaded` gated on `reloadOk && enableOk`, reload hoisted OUT of `if (changed)`; no teardown on this leg | n/a — nothing is compared |
| 4 | win32 (`:240-245`) | unchanged code — `ensureWindowsTaskRegistered` | **partial: `<Command>`/`<Arguments>` only** — see row 4's residual below |

**Row 4 — Windows is an argv-conforming leg, NOT the reference leg (CX-2).**
`windowsLoadedTaskMatches` reads a loaded task's `<Command>` and `<Arguments>` and
nothing else. So a loaded task whose **trigger or settings** were altered — a
changed firing time, a disabled task — while its command and argline stay canonical
**passes** its verified skip. That is file-bytes-as-evidence for every field the
readback never reads: precisely the invariant ADR-0037 states, violated on the leg
this spec had been calling exemplary.

- **What its readback covers:** the executed command and the full argument line.
- **What it does not:** triggers (`<CalendarTrigger>`/`<TimeTrigger>`), settings,
  enabled state — the Windows analogue of the `StartCalendarInterval` and
  `EnvironmentVariables` fields Table A2 added on darwin.
- **Why it is not fixed here:** extending the parser would mean specifying XML
  readback shapes for `schtasks /query /xml` output that **cannot be executed on
  the authoring host** (macOS). That is this spec's own no-unexecutable-parsers
  rule — the same rule that denied Linux a verified skip — and it binds here too.
- **Bounded exposure:** a Windows entry whose trigger drifted without its argline
  drifting keeps firing on the old schedule (or not at all) until something forces
  a re-register. It is not silent at fire time the way the macOS stale-digest case
  was — the launcher still runs and still verifies the descriptor — but the
  *schedule* is stale and `sync` reports success.
- **Routed:** **`WP-windows-task-trigger-readback`** (new slug). Checked against the
  existing candidate `WP-windows-task-exec-pairing`
  (`WP-scheduler-entry-identity.md:1993`) and kept **separate**: that one is about
  `parseWindowsTaskExec` mis-pairing `<Command>` with another `<Exec>`'s
  `<Arguments>` — a defect in reading the fields it *already* reads. This one is
  about reading fields it never reads at all. Adjacent, not the same; folding them
  would hide one behind the other.

**Row 3 permits no verified skip, and that is a deliberate, recorded choice.**
There is no readback of a loaded systemd unit that this spec can specify *and
verify*: `is-active` proves activity, not content, and a content readback
(`systemctl --user cat` / `show -p ExecStart`) needs output parsing that could not
be executed on the authoring host (macOS). Specifying an unexecuted parser is how
this chain's earlier rounds shipped fixtures that tested nothing. So Linux
**always attempts**, which is sound under the rule (no evidence ⇒ no skip) and
cheap: `daemon-reload` and `enable --now` are both idempotent no-ops against an
already-correct unit. The real readback is routed as
**`WP-systemd-loaded-unit-readback`**; when it lands, row 3 gains a skip clause.

**Row 3 also moves the reload out of `if (changed)`** — that is what ends the
permanent silence: a degraded reload then produces the notice on **every**
register until it succeeds, not once. `reloadOk` reuses the predicate the existing
warning already computes (`:462`), hoisted to a `const` so the message and the
verdict cannot drift apart. **Unambiguously: on linux the reload, its warning and
`enable --now` all run on every register — there is no `if (changed)` around any
of them and no skip predicate on this leg.**

**What "idempotent" means after this WP, per CLAUDE.md.** "Running twice = zero
changes" is a statement about **effects**, and it still holds everywhere: a second
register changes no file and leaves the OS in the same state. What changes is the
*call count* of a re-register. Table A's third column is the honest statement of
that, and AC5 pins it per platform.

### Table A1 — the skip decision, and why `changed` is not part of it (canonical)

A round-5 draft gated the skip on `!o.changed`. **That was backwards**, and the
round-5 bound exposed it: the bound ("anything reaching a teardown is already
divergent") is a claim about the **readback**, while the gate consulted the
**file**. `ensureEntry` returns `changed = true` for file-side reasons as mild as a
**missing manifest entry** — with the disk plist canonical and the loaded record a
complete live match. Such a healthy record went on to bootstrap-fail → `bootout` →
replace, and a transient replacement failure then destroyed a working schedule.

`verdict` is `'absent'` when `print` exits non-zero, otherwise the tri-state
`darwinLoadedVerdict` result.

| `verdict` | Decision |
|---|---|
| `'match'` | **skip the OS call — regardless of `changed`** |
| `'mismatch-fatal'` | attempt (step b); on failure, teardown + replace + rollback (steps c-d) |
| `'mismatch-benign'` | attempt (step b) only; on failure report `loaded:false` with **NO teardown** — the record still performs its authorized job (Table A2b) |
| `'indeterminate'` | attempt (step b) only; on failure report `loaded:false` with **NO teardown** |
| `'absent'` | attempt (step b) only; on failure report `loaded:false` — there is nothing to tear down |

**Only `'mismatch-fatal'` authorizes destruction — and that is what keeps the
round-8 bound TRUE AS DERIVED after round 11's widening (Table A2b).** The bound is
"every record reaching a teardown is already failing"; once the comparison covered
fields on which a loaded job still works, plain `'mismatch'` stopped implying
"failing", and the bound became an assertion rather than a derivation. Tiering
restores the derivation instead of restating the claim.

**`'indeterminate'` also never authorizes destruction, which was the round-6 fix.** The round-6 bound claimed "anything reaching a teardown is already
divergent", but the code reached teardown whenever the comparison was not a match —
and a **degraded, truncated or format-skewed** `print` is exactly that: the
**absence of evidence**, not evidence of divergence. Destroying a record we could
not read is the precise opposite of this WP's rule. `'indeterminate'` therefore
buys the non-destructive bootstrap attempt and nothing more, and the bound is now
literally true: teardown requires a **positively established** mismatch.

**What bookkeeping is still allowed on the skip path, exactly.** `ensureEntry` has
already run before the helper is called, so its two **non-OS-mutating** side
effects stand and are intended: the canonical bytes are written to disk, and the
manifest gains its `scheduler-entry` record. Nothing else may happen on that path
— no `launchctl` call of any kind, no status-cache write, no `onBeforeTeardown`.
That is precisely what makes a `changed = true` + live-match register safe: the
file and manifest converge to canonical while the OS is left alone, because the OS
already holds what we would register.

**Gate 3 (`!o.changed`) is DELETED**, along with its mutation row. The RB1 fixture
(a `changed = true` register whose loaded record matches the NEW canonical argv)
**flips from must-attempt to must-skip** — see AC1.

### Table A2 — what the verified skip compares (canonical)

The round-4 contract compared the argv alone; CX-1 showed that proves **argv
identity, not registration identity**. ADR-0037's obligation is that the OS holds
what we *would register* — the whole record's semantics.

**The comparison covers every canonical field that can VARY between two renders.**
Renderer **constants** are excluded by argument, not by omission: a value the
renderer always emits identically cannot differ between the loaded record and
canonical, because every plist Wienerdog has ever written carried the same one.

| Canonical field | Compared? | How / why |
|---|---|---|
| `ProgramArguments` | **yes** | full array equality (`launchdLoadedArgs`) |
| `event triggers` — **exactly one trigger TOTAL, and it is the canonical calendar one** | **yes** | `launchdLoadedCalendar` counts **every** entry in the `event triggers` block, not only those whose `stream` is `com.apple.launchd.calendarinterval`, and returns the outer `null` unless the total is **exactly 1** *and* that one trigger's `stream` is the calendarinterval stream. **Stream-filtered counting is not enough (CX11-2):** a record with our canonical calendar trigger **plus** a foreign-stream trigger still counts 1 under a filtered count and would be granted a skip while firing on a condition we never registered. Justified **loaded-side**, per §7c: the executed dump's `event triggers` block contains **exactly one** entry for our label — launchd injects **nothing** into it (its own `event channels`, `resource coalition` and `jetsam coalition` are *separate top-level blocks*, not trigger entries), so "exactly one total" is what a healthy record actually looks like rather than what our renderer intends. A round-9 draft said "the trigger whose stream is …", selecting *a* trigger without requiring uniqueness — so a record carrying a **second** firing trigger (an extra schedule added by hand) matched on the first and was granted a skip while firing at times we never registered. Zero ⇒ unparseable; two or more ⇒ unparseable; both ⇒ attempt |
| `StartCalendarInterval` Minute | **yes** | from the `descriptor` block of the trigger whose `stream` is `com.apple.launchd.calendarinterval` (`launchdLoadedCalendar`) |
| `StartCalendarInterval` Hour — **OPTIONAL by entry kind** | **yes**, as `hour: number\|null` | The per-job plist renders `Hour`; **`catchupPlist` renders `Minute` only, with no `Hour` key** (`generators.js:410-416`, and the live record shows `"Minute" => 0` alone). So `hour: null` means "the `Hour` key must be **ABSENT**" — it **matches** an absent key and **REFUSES** a present one. `null` is **not** a wildcard: `Hour 0` + `Minute 0` is *daily at midnight*, `Minute 0` alone is *hourly at :00* — two different schedules, and a present `"Hour" => 0` on a catch-up record must fail the match |
| `EnvironmentVariables` (the 7 `scheduledEnvPairs`) | **yes, by CONTAINMENT, with the EMPTY STRING as a real value** | every canonical pair must be present with its value; launchd-injected keys (`OSLogRateLimit`, `XPC_SERVICE_NAME` — §7b) are ignored. Set-equality would never match. **Five of the seven canonical pairs are the ambient-scrub bindings and render as a `KEY =>` line with nothing after the arrow** (§7b fact 4) — a parser that skipped valueless lines would drop `NODE_OPTIONS`, `NODE_PATH`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `ANTHROPIC_API_KEY`, and would then grant a skip to a record **missing the entire scrub**. such a line parses to `[KEY, '']` and `''` is compared as a value |
| `path` (the plist launchd loaded from) | **yes** | exposed as a single `path = …` line (§7c). Must equal `plistPath`. This catches a record loaded from a *different file* under our label — the cheapest check in the table and one nothing else covers |
| `program` | **yes** | exposed as `program = …`; must equal `expect.argv[0]`. Redundant with the argv head **by construction**, and kept precisely because "by construction" is a renderer-side argument and this table certifies the loaded side |
| `stdout path` / `stderr path` | **yes** | exposed as two `… path = …` lines; must equal the canonical `<core>/logs/<name>/launchd.{out,err}.log`. A round-9 draft excluded these as "derived from `<core>`, caught transitively via the argv" — a renderer-side argument that says nothing about a manually edited record |
| `spawn type` | **yes** | exposed as `spawn type = background (5)` — `ProcessType: Background` reflected. Compare the **word** (`background`), not the numeric code, which is undocumented |
| `Label` | not compared | it is the *lookup key* — the record was fetched by it |
| `RunAtLoad` (catch-up only) | **NOT compared — darwin's honesty-clause residual** | It appears in **no field** of the executed record, and the catch-up label is not loaded on the authoring host, so what `print` shows for it could not be executed (§7c). Specifying a guessed parse shape is forbidden by this spec's own no-unexecutable-parsers rule — the same rule that denied Linux a skip and Windows a trigger readback. **Bounded exposure:** a catch-up record with `RunAtLoad` removed passes every compared field and is granted a verified skip, so catch-up would silently stop running at login while still firing hourly. Routed as **`WP-launchd-runatload-readback`**, and carried into ADR-0037's ratification surface so the owner signs it. |
| ~~`ProcessType`~~ (now compared as `spawn type`), `RunAtLoad` | see above | the round-9 renderer-side rationale is superseded for every field `print` exposes (`Background`; `true` on catch-up) — cannot vary between two canonical renders. **The "constant" claim is executed, not asserted:** `git log -S "ProcessType" -- src/scheduler/generators.js` and the same for `RunAtLoad` each return exactly one commit, `ae7720e` (WP-013, where the renderers were introduced) — neither literal has changed since, so no plist Wienerdog has ever written carries a different value |

### Table A2b — FATALITY TIER per field (canonical; CX13-1)

Round 11 widened the comparison and **broke the round-8 bound's derivation**.
Pre-widening every mismatch meant argv/calendar divergence — a record already
failing or misfiring — so "anything reaching a teardown is already failing" was
true and the teardown lost nothing. After round 11, a mismatch can mean a field on
which the loaded job **still performs its authorized work**, and tearing that down
can leave the machine with **no** functioning schedule. Divergence ≠ failure.

Each field is tiered by exactly one question, decided **loaded-side**: *does this
field's divergence prevent the loaded record from performing its authorized job
NOW?*

| Field | Tier | Reasoning (loaded-side) |
|---|---|---|
| `arguments` (full argv) | **FATAL** | a stale `--expect-digest` makes the launcher refuse **every** fire; a wrong descriptor path or job name is the same class. The record is already dead |
| `program` | **FATAL** | a different interpreter in the execution position is the `WP-scheduler-node-path-durability` hazard — the fire dies before any of our code runs |
| calendar `Hour`/`Minute` | **FATAL** | the job does not run when it was authorized to run |
| trigger count / stream | **FATAL** | the record fires on a condition we never registered |
| `environment` bindings | **FATAL** | `WIENERDOG_HOME` selects the core the launcher verifies against, and the scrub (`NODE_OPTIONS`, `NODE_PATH`, the credential roots) is a security control — a job running without it is not doing its authorized work |
| `stdout path` / `stderr path` | **BENIGN** | the job runs and does its work; it writes its logs somewhere else |
| `spawn type` | **BENIGN** | a record not marked `background` still executes. It may miss the throttling posture ADR-0028 expects, which is a real but non-preventing defect — **recorded as the second-closest call in this table** |
| `path` (the plist launchd loaded from) | **BENIGN — and this is the closest call, so it is argued rather than asserted** | The record is functional **now**: it is running our argv, our calendar and our env. What it will not do is **track future syncs** — we write `plistPath`, launchd loaded elsewhere, so later updates never reach it. That is a *latent* fatality, not a present one, and the tiering question is deliberately about **now**, because the cost of getting it wrong is destroying a working schedule. Benign handling is also the right handling here: no skip (so it is never certified), a non-destructive attempt, and a notice — the divergence stays visible without a teardown |

**Decision, and the bound restored:**

- **any FATAL mismatch ⇒ the replace path.** The teardown is authorized, and the
  round-8 bound is true again *as derived*: only records that are already failing
  reach a destructive step.
- **BENIGN-only mismatch ⇒ no skip AND no teardown.** The non-destructive
  `bootstrap` is attempted (it fails while the label is loaded), the register
  reports `loaded: false`, and §8's notice fires.

**Convergence for benign-only drift, stated honestly: it does not self-heal.**
The attempt cannot replace a loaded label without a teardown, and a teardown is
exactly what this tier withholds. So the entry keeps working, keeps logging to the
old path, and keeps producing the notice on every register until a human acts. The
existing notice text already says *"schedule file written but the OS scheduler did
not accept it — run 'wienerdog doctor'"*, which is true here and is the right
instruction; it does not distinguish benign drift from a hard failure, and that
refinement is routed as **`WP-scheduler-benign-drift-heal`** rather than smuggled
into a string this WP is not allowed to change.

**The adversarial boundary is unchanged, and this round does not reopen it.** What
Table A2 now covers is the **accidental / manual** class — a field edited by hand,
a partially written record, an extra trigger. A *foreign writer who can forge a
complete record under our label* remains out of scope and routed
(`WP-scheduler-stable-exec-position` for binary substitution); widening the field
list narrows what an accident can hide, not what a forger can.

**Any block that fails to parse ⇒ no skip.** Same fail-safe direction as the argv:
attempt, never skip. And per RC2, all three comparisons are over **normalized**
readback text, not byte-fidelity — a value that cannot round-trip through the
parser mismatches, which means attempt.

### Table B — Mutation checks

One behavior per row; **Trigger** names the guarantee destroyed, **Patch** is the
edit. No ordinals. Assert the pattern selected exactly one named subtest.

The darwin rows were **re-derived as one unit** — eight times. The eighth is
**semantic, not propagation**: Table A2b tiered the compared fields by fatality, so
the verdict gained a fourth value and the teardown authorization narrowed from
"mismatch" to "fatal mismatch". (The sixth after
Table A2 was re-decided from the loaded side rather than the renderer side; the
seventh after its new fields were propagated into the exact-contract layer and
trigger counting was widened to the whole block): after the full-argv
comparison landed, after the owner-directed rollback amendment, after Table A2
widened the comparison to the calendar and env blocks, after Table A1 made the
live match win over `changed`, and again after the verdict became tri-state and
only a positively established `'mismatch'` could authorize a teardown. Not
adjusted row by row. The skip gate is three independent conditions, each with its
own row so no mutation removes two at once; step (d)'s four properties each have
their own row; and each row names the fixture that provably executes the mutated
branch (the recurring failure mode in this chain — see the gate-3 row).

| Trigger (guarantee destroyed) | Patch | Test that must go RED |
|-------------------------------|-------|-----------------------|
| darwin register cannot replace a loaded record | drop the teardown branch from `ensureDarwinEntryRegistered` | T1 |
| darwin tears down without evidence the label is loaded | change the teardown guard to `if (false) return false;` — always tear down after a failed bootstrap | T2 |
| the pre-destructive marker stops preceding the teardown | move `onBeforeTeardown()` below the `bootout` | **T1** — it is the only fixture that reaches a teardown |
| darwin skips regardless of what is loaded (gate 1) | compute `verdict` without the `isLoaded` guard, so an absent label is parsed as text and can reach `'match'` | T3 case (iv) |
| darwin skips regardless of the record's content (gate 2: the comparison) | change the skip clause to `if (isLoaded) return true;` — drop the comparison | T3 cases (ii), (iii), (v) |
| **the live match stops winning over `changed`** (Table A1) | re-add the `!o.changed` conjunct to the skip clause | **T1** — its loaded record matches canonical while `changed` is true, so the mutated gate forces it to a teardown |
| a healthy record is torn down over file-side bookkeeping | make the skip path also call `onBeforeTeardown()` or any `launchctl` verb | T1 (asserts exactly one call, the `print`) |
| the catch-up `Hour` expectation becomes a wildcard | treat `expect.hour === null` as matching any loaded `Hour` | **T3 case (xii)** — a catch-up record carrying `"Hour" => 0` must REFUSE |
| the catch-up shape loses its skip | expect `hour: 0` for catch-up instead of `hour: null` | **T3 case (xi)** — the healthy catch-up record would be attempted, not skipped |
| the env parser drops valueless lines | skip `KEY =>` lines with nothing after the arrow | **T3 case (xiii)** — a record missing the whole ambient scrub would be skipped |
| **`canonicalBytes` is unbound** — the CX15-1 crash | remove `canonicalBytes` from the options passed at either call site | **T2f/T2g** — the rollback path throws `ReferenceError` **after** the `bootout`, i.e. the CLI dies with the schedule already removed. Any rollback fixture reaching the guard must assert the call **does not throw** |
| **the rollback restore is unconditional** — the CX14-2 race defect | delete the staleness guard, restoring `priorBytes` without re-reading the file | **T2f** — write A, a concurrent write of B, then a teardown: the rollback must NOT restore A over B |
| rollback does not restore the prior plist | delete the `fs.writeFileSync(plistPath, o.priorBytes)` line from step (d) | T2b |
| rollback restores the file but not the record | delete the trailing `bootstrap` from step (d) | T2b |
| rollback reports the failed replacement as success | make step (d) `return true` after a successful restore-bootstrap | T2b |
| the prior bytes are captured after the overwrite | move the `priorBytes` read below `ensureEntry` | T2b (the restored bytes become the new plist, so the prior argv is never re-bootstrapped) |
| `add()` reports success for an unloaded unchanged entry | restore the `changed &&` conjunct at `schedule.js:882` | T7 |
| the initial-bootstrap path skips the post-verify — the CX9-1 defect | change the step (b) success branch to `return true;` instead of `return verifyLoaded();` | **T2e** (AC2 case k) — the absent-label register reports success for foreign bytes |
| the verify accepts a non-match | make `verifyLoaded` return `true` for any verdict, or for a non-zero `print` | T2e |
| a known-bad replacement still gets a teardown | delete the `plutil -lint` preflight (c0) | **T2c** — `existsSync` true + lint non-zero + loaded record ⇒ a `bootout` appears |
| the preflight is gated on the loader's result instead of existence | replace the `fs.existsSync(PLUTIL)` guard with a result-shape test (`if (lint && typeof lint.status === 'number')`) | **T2d** — with `existsSync` stubbed false and the loader still answering `{status:1}` (the shape `schedulerSpawn` produces for ENOENT), the register must still proceed; the mutated form refuses forever |
| the linter is resolved off PATH | change `PLUTIL` to the bare name `'plutil'` | **T2c** — the argv assertion pins the absolute `/usr/bin/plutil` |
| **the fatality tiers are collapsed** — the CX13-1 defect | make `darwinLoadedVerdict` return `'mismatch-fatal'` for any difference, dropping the Table A2b tiering | **T3 case (xxii)** — benign-only drift plus a failed replacement bootstrap must leave the existing record LOADED; the collapsed form boots it out |
| a FATAL field is tiered benign | move `environment` (or the calendar) to the BENIGN tier | T3 case (xxii)'s sibling — a stale-env record must still reach the replace path |
| **`'indeterminate'` authorizes a teardown** — the CX-1 defect | change the teardown guard to `if (verdict === 'absent') return false;`, i.e. let an unreadable record through | **T3 case (xiv)** — print exits 0 with unparseable stdout ⇒ a `bootout` appears |
| the verdict collapses back to a boolean | make `darwinLoadedVerdict` return `'mismatch-fatal'` for any non-match, folding `'indeterminate'` into it | T3 case (xiv) |
| darwin compares only the head of the argv — the round-2 defect | make `darwinLoadedVerdict` compare only `argv[0]` and `argv[1]` | **T3 case (v)** — the stale-tail fixture |
| darwin compares the argv only — the round-4 defect (CX-1) | drop the calendar and env comparisons, keeping the argv | **T3 case (vii)** — the stale-`Hour` fixture |
| the `path` gate is dropped — a record loaded from a foreign file passes | drop the `path = …` comparison | **T3 case (xv)** |
| the `program` gate is dropped | drop the `program = …` comparison | T3 case (xvi) |
| the log-path gates are dropped | drop the `stdout path`/`stderr path` comparisons | T3 case (xvii) |
| the `spawn type` gate is dropped, or compares the numeric code | drop it, or compare `(5)` instead of the word `background` | T3 case (xviii) |
| **trigger uniqueness is not required** — the CX10-1 extra-trigger defect | select the first calendarinterval trigger instead of requiring exactly one | **T3 case (xix)** — a record with a second calendarinterval trigger must NOT skip |
| **uniqueness counts only calendarinterval triggers** — the CX11-2 foreign-stream defect | revert to a stream-filtered count (`triggers.filter(t => t.stream === CAL).length === 1`) instead of counting the whole block | **T3 case (xx)** — one canonical calendar trigger PLUS a foreign-stream trigger must NOT skip |
| a new field is missing and is treated as a mismatch | make an absent `path`/`program`/log-path/`spawn type` line yield `'mismatch-fatal'` instead of `'indeterminate'` | **T3 case (xxi)** — an absent line must not authorize a teardown |
| the calendar gate is dropped alone | drop only the `launchdLoadedCalendar` comparison | T3 case (vii) |
| the env gate is dropped alone | drop only the env containment comparison | T3 case (viii) |
| env comparison becomes set-equality instead of containment | require the loaded env to have exactly the canonical key set | **T3 case (ix)** — it would reject a healthy record over launchd's injected keys |
| the env block is anchored by suffix instead of exact line | find the block with `line.endsWith('environment = {')` | T3 case (viii) — it binds to `inherited environment` and the canonical pairs are absent |
| darwin trusts an unparseable readback | make `darwinLoadedVerdict` return `'match'` when `launchdLoadedArgs` returns `null` | T3 case (iii) |
| darwin accepts a length-mismatched argv | drop the length check, comparing only the elements `expect.argv` indexes | T3 case (vi) |
| darwin catch-up keeps the bare bootstrap | revert `ensureCatchup` to the `loader([… 'bootstrap' …])` call | T4 |
| a degraded linux reload is reported as success | revert to `loaded = enableOk` | T5 |
| a degraded linux reload is never retried | move the reload block back inside `if (changed)` | T6 |
| windows stops verifying before skipping | delete the `windowsLoadedTaskMatches` call | AC7's preservation assertion |

### Table E — the existing-assertion change set in `tests/unit/scheduler-schedule.test.js` (canonical; +2026-08-02)

**This table is the single place the existing-test blast radius is decided.** AC6,
V3 and the `tests/unit/scheduler-schedule.test.js` Deliverables cell all defer to
it; none of them restates a site. It was extracted here on 2026-08-02 because the
same reconciliation D6 got for `tests/unit/init.test.js` was owed to this file:
the round-1 review found a **fifth** forced assertion change and a ten-site
setup-loader swap that AC6's "exactly FOUR" contradicted. Verified against the
branch diff (`git diff origin/main...HEAD -- tests/unit/scheduler-schedule.test.js`),
not against the enumeration it replaces.

Line numbers are **`origin/main`'s** — the pre-change file, the anchor AC6 has
always used — with the branch line second for navigation. Each changed assertion
is **renamed** to state the new contract and cites ADR-0037 in a comment.

| # | main | branch | Existing test (main line of its `test(` line) | What changes |
|---|---|---|---|---|
| 1 | `:365` | `:547-550` | `add registers the platform entry, records manifest, saves the job` (`:333`) | `assert.deepEqual(calls[0], ['launchctl','bootstrap',…])` — the readback now precedes it, so `calls[0]` is the `print` and a second assertion pins the `bootstrap` at `calls[1]`. **This one changes because of the readback design; an earlier draft of this spec asserted it would not.** |
| 2 | `:500` | `:696` | `registerPlatform warns on a NONZERO daemon-reload …` (`:474`) | the `assert.equal(res.loaded, true, …)` whose message says the verdict "stays gated only on `enable --now`" ⇒ **`false`**, message rewritten to `reloadOk && enableOk` |
| 3 | `:524` | `:722` | `registerPlatform warns on a MISSING ({status:null}) daemon-reload …` (`:504`) | the same assertion in the sibling test ⇒ **`false`** |
| 4 | `:389-397` | `:580-593` | `a second identical add is idempotent (no OS call)` (`:389`) | **renamed** to `(no MUTATING OS call)`; `assert.equal(calls2.length, 0, …)` ⇒ `2`; **one new** assertion that every recorded call is non-mutating. Rewritten per AC5(iii) |
| 5 | `:1019-1030` | `:1226-1243` | `repointSchedules after add is a no-op (changed:0, no OS call)` (`:1019`) | **(+2026-08-02)** **renamed** to `(changed:0, no MUTATING OS call)`; `assert.equal(calls.length, 0, 'no OS reload on an unchanged repoint')` ⇒ `2`; **one new** non-mutating assertion |

**Row 5 is not a discovery, it is the consequence AC5(iii) already stated, at the
site AC6 forgot.** `repointSchedules` is the **second** unchanged-register surface
in this file — structurally identical to row 4's `add()` surface, reached by the
same Table A third-column recount (darwin ⇒ two read-only `print`s, zero mutating
calls). A verified skip costs one readback per site *wherever* it is driven from,
so any assertion pinning "zero OS calls on an unchanged register" had to move.
Row 4 and row 5 are one class with two members; enumerating one and not the other
is exactly the range-abbreviation failure this spec greps for, in prose form.

**`:982` (the heal path) is NOT in this table and must not be touched.** No
existing assertion outside Table E's five rows may be edited.

#### Table E authorization — the setup-only `fakeLaunchd` loader swap (+2026-08-02)

`fakeLaunchd(paths)` is a **new helper this WP adds** (branch `:265`): a stateful
launchd double that remembers what a `bootstrap` loaded and answers a later
`print` from it, returning `{status:113}` for an absent label. Ten pre-existing
tests have their **setup** loader swapped from the blind `() => ({ status: 0 })`
to it.

**The swap is FORCED, not stylistic, and it is the same NOOP-collision class as
D6 — one file over.** A blind `{status:0}` carries no `stdout`, so
`darwinLoadedVerdict` returns `'indeterminate'`, `ensureDarwinEntryRegistered`
returns `false`, and after D5 `add()` **throws during the test's own setup** —
the test dies before it reaches the subject it was written to check. These tests
are not about registration; they are about manifests, descriptors, `remove`, and
`list --json`, and they need a loader that is merely *honest* rather than blind.

**It changes NO assertion.** Every assertion in these ten tests other than Table E
rows 1, 4 and 5 stays byte-identical. Exhaustive site list, main line numbers:

| main line(s) | Enclosing test (main line of its `test(` line) |
|---|---|
| `:338` | `add registers the platform entry, records manifest, saves the job` (`:333`) — also Table E row 1 |
| `:392`, `:395` | `a second identical add is idempotent` (`:389`) — also Table E row 4 |
| `:401` | `add then manifest.reverse DEFERS config.yaml … (WP-088)` (`:399`) |
| `:420` | `remove runs the unload, deletes files, drops entries and the job` (`:418`) |
| `:1021`, `:1025` | `repointSchedules after add is a no-op` (`:1019`) — also Table E row 5 |
| `:1035` | `repointSchedules rewrites a stale embedded node path (changed:1)` (`:1033`) |
| `:1084` | `ensureDreamSchedule schedules dream once at 03:30` (`:1081`) |
| `:1131`, `:1132` | `list --json reports jobs with watermarks` (`:1129`) |
| `:1185`, `:1199` | `add writes a 0600 job descriptor … (WP-156)` (`:1181`) |
| `:1228` | `repointSchedules refreshes the descriptor … (WP-156)` (`:1224`) |

**Every other `{ status: 0 }` loader in the file stays unchanged, and that is the
boundary.** The list below is **complete, and its completeness is arithmetic
rather than assertion** (corrected 2026-08-02, round-2 review note 1 — an earlier
form said "every other" over a 16-entry list that was actually partial, which is
the prose form of the range-abbreviation failure this table warns about):

```bash
git show origin/main:tests/unit/scheduler-schedule.test.js | grep -c "{ status: 0 }"
```

**49** on `main`. **14** of them are the swapped sites in the table above
(`:338`; `:392`, `:395`; `:401`; `:420`; `:1021`, `:1025`; `:1035`; `:1084`;
`:1131`, `:1132`; `:1185`, `:1199`; `:1228`). The remaining **35 stay unchanged**,
and here they all are — `:106`, `:302`, `:321`, `:443`, `:461`, `:493`, `:495`,
`:517`, `:519`, `:540`, `:579`, `:620`, `:643`, `:665`, `:729`, `:752`, `:773`,
`:792`, `:827`, `:840`, `:855`, `:888`, `:899`, `:935`, `:953`, `:980`, `:993`,
`:1050`, `:1066`, `:1104`, `:1106`, `:1118`, `:1139`, `:1216`, `:1238`.
14 + 35 = 49, so the two lists together account for every site and neither can
quietly lose a member.

A swap at any site not in the table above is out of boundary. Note in particular
`:461` (`remove nope` — no register runs) and `:1139` (`list --json`'s own
invocation): adjacent to swapped sites in the same tests, and deliberately left
alone, because the swap is owed only where a register actually executes.

### Table N — where §8's notice is asserted, and where it is inherited (canonical; +2026-08-02)

**Extracted on 2026-08-02 under the round-1 review's finding 1.** Five acceptance
criteria said a fixture "pushes §8's byte-exact notice" and no new test asserted
it; two new test titles claimed it while asserting `res.loaded === false` only.
The obligation was scattered across five AC clauses with no canonical owner —
exactly the contract-density shape ADR-0031 names. This table is now that owner.

**§8's notice has exactly ONE push site.** `repointSchedules`, `schedule.js:583`
(main; `:802` on the branch), inside an unconditional `if (!res.loaded)` — no
platform branch, no second emitter of that string. Audited: the other two
`did not accept it` strings in `schedule.js` (`:870`, `:895` on the branch) are
**different** catch-up sentences, not §8's, and both sit inside **`repairCatchup`**
(branch `:832`) — the heal-gated primitive, not `ensureCatchup` (attribution
corrected 2026-08-02, round-2 review note 2; the substantive claim is unchanged).
This WP does not change any of the three. **Consequence, and the reason this table exists:** a
fixture proves the notice **only if it drives `repointSchedules`**. A fixture that
calls `registerPlatform` directly can prove `loaded === false` and nothing more —
which is what all five clauses were resting on.

| # | Leg | Fixture | Notice obligation |
|---|---|---|---|
| 1 | win32 | `tests/unit/scheduler-schedule.test.js:1112` — **pre-existing, unchanged by this WP** | **ASSERTED.** `r.notices.some((n) => /"dream".*did not accept it/.test(n))`, driven through `schedule.repointSchedules(…, { platform: 'win32' })`. It is the shape rows 2 and 3 copy |
| 2 | darwin | **T3 case (xxii)** — benign-only drift (AC3 case (xxii)) | **MUST ASSERT.** After its `registerPlatform` leg, drive `schedule.repointSchedules` over the same `paths`/`manifest`/loader and assert row 1's regex. This is the **only** proof that the darwin leg's `loaded:false` reaches a human |
| 3 | linux | **T5** — degraded reload (AC5 (i)) | **MUST ASSERT.** Same shape, `platform: 'linux'`, the degraded-reload loader |
| 4 | darwin | **T2b** (AC2 d), **T2f** (AC2 g2), **T2e** (AC2 k) | **INHERITED — assert `res.loaded === false` only, and add NO notice assertion.** The notice follows from row 2 plus the single unconditional push site: these fixtures reach it through the *same* `!res.loaded` gate row 2 exercises, so re-driving a repoint in each would re-test one line of `schedule.js` three more times while tripling three already-intricate rollback fixtures |

**RULING (2026-08-02, architect) — the five AC clauses are KEPT, not struck.**
§8's notice **is** the user-facing half of ADR-0037's postcondition: "must not
report success" is only observable because something is said out loud. Striking
the clauses would leave this WP shipping a changed `loaded` return value whose
only asserted user-visible consequence sits on **win32 — the one leg this WP does
not touch** — which is the failing-outside-our-own-observability signature named
in Context, reproduced inside the fix for it. The remedy is therefore the
reviewer's preferred one, bounded by rows 2 and 3: **two** new notice assertions,
one per fixed leg, driving `repointSchedules` and mirroring `:1112`. The
remaining three clauses keep their notice text as a stated consequence and are
discharged by row 4's inheritance argument — recorded here so it is an argued
disposition, not a silent gap.

**Test titles must match what they assert.** T3 case (xxii)'s and T5's titles
already say "+ notice"; rows 2 and 3 are what make those titles true. Do **not**
resolve this by editing the titles.

### Mirrored Surface Checklist

Tables A and B — and, since 2026-08-02, **Table E** (the existing-assertion change
set) and **Table N** (where §8's notice is asserted) — are the single place these
facts are decided. Registered mirrors —
**including all three Deliverables cells**, which are the permission boundary the
implementer reads first (the lesson from `WP-scheduler-node-path-durability`
rounds 2-3, where an unregistered Deliverables cell shipped a wrong test set):

- [ ] **(+r3/r5)** Deliverables cell for `src/scheduler/generators.js` — D0 exports **four** names (`launchdLoadedArgs`, `jobLaunchArgs`, and the two new parsers `launchdLoadedCalendar`/`launchdLoadedEnv`) and adds the two parser bodies (D1b). Mirrors **Table A2**.
- [ ] Deliverables cell for `src/cli/schedule.js` (the four D-sites — Table A rows 1-3)
- [ ] Deliverables cell for `tests/unit/scheduler-schedule.test.js` (T1, T2, T2b, T2c, T2d, T2e, T3, T4, T5, T6, T7 + whatever **Table E** enumerates — the cell carries no site list of its own)
- [ ] **(+2026-08-02)** **Table E** — the existing-assertion change set (five rows) and its authorized setup-only `fakeLaunchd` swap. Its registered mirrors are **AC6**, **AC5(iii)**, **V3**'s read-and-confirm instruction, and the `tests/unit/scheduler-schedule.test.js` Deliverables cell. Each of those defers to the table and restates no site
- [ ] **(+2026-08-02)** **Table N** — where §8's notice is asserted (rows 2-3) and where it is inherited (row 4). Its registered mirrors are **AC2(d)**, **AC2(g2)**, **AC2(k)**, **AC3 case (xxii)**, **AC5(i)**, Test index rows **T3** and **T5**, the `tests/unit/scheduler-schedule.test.js` Deliverables cell, and **V9**
- [ ] **(+2026-08-02)** Deliverables cell for `tests/unit/init.test.js` (D6 / T8 — the one platform-aware assertion). Mirrors **Table A** rows 1 and 3: darwin verifies and so can report `loaded:false` under a blind seam, linux does not verify and so still reports `loaded:true`. Its other registered mirrors are Implementation notes → **D6**, **AC12**, Test index **T8**, and **V8**.
- [ ] Deliverables cell for `docs/adr/0037-…` (the rule — Table A's spine)
- [ ] "Exact contracts" — both JSDoc blocks and the `ensureDarwinEntryRegistered` body
- [ ] Current state §2 (rows 1-2), §3 (the teardown guard), §4 (row 3), §6 (row 4), §7 (the readback machinery + the measured exit codes), §9 (why not a cache)
- [ ] **(+r4)** Implementation notes → D5 (`add()`'s guard) and AC11 — the CLI-surface mirror of ADR-0037's postcondition
- [ ] **(+r4)** ADR-0037's Consequences — the rollback consequence and the withdrawn crash-marker promise both mirror this spec's rollback section
- [ ] Implementation notes → Export audit, D0, D0b, D1, D1b, D2, D3, D4, D5, and **"Rollback — OWNER-DIRECTED"** (its four contract properties + the crash-window table)
- [ ] Acceptance criteria AC1, AC2 (incl. its rollback set), AC3, AC4, AC5 (rows 1-3), AC6 (**defers to Table E**), AC7 (row 4 preservation), AC8 (the marker), AC9, AC10, AC11 (D5)
- [ ] Verification commands V2, V3, V4, V5, V6, V6b, V9 (enumerated, not range-abbreviated — the same insertion growth that produced V6b and V9)
- [ ] Table B rows, each naming its Table A / A2 row
- [ ] **(+r5)** Current state §7b (the executed readback evidence behind Table A2 — four facts) and Table A2 itself
- [ ] **(+r6)** **Table A1** (the skip decision tree and the allowed bookkeeping) — mirrored by the contract body's step (a), D1b, AC1's Table A1 fixture, AC5's recount, and the Table B live-match rows
- [ ] Test index rows T1, T2, T2b, T2c, T2d, T2e, **T2f**, **T2g**, T3, T4, T5, T6, T7, **T8** (**+2026-08-02** — T2f/T2g/T8 were absent from this line while the Deliverables cell listed all three: the same enumeration drift, in the mirror registry itself)
- [ ] The banner's cross-spec mapping table — **both** macOS sites map to that spec's Table C row 5
- [ ] Definition of done items 5 (that spec's 0a) and 6 (the ADR signature gate)

**Coherence layers this spec is checked across** (each pass runs all of them;
the layer that first caught a defect is named): canonical↔canonical (round 8),
notes↔canonical (round 9), contract-body↔canonical, security-checklist↔canonical,
AC↔Test-index (round 10), **range-abbreviation (round 14 — carries its own grep,
below)**, and — added in round 13 — **boundary↔ACs**: every `Dn`
and `Tn` an acceptance criterion references must appear in **exactly one**
Deliverables cell, and no file may appear in both the Deliverables table and the
not-deliverables list. That layer exists because the permission boundary is what an
implementer reads **first**, so a stale cell outranks every correct table beneath
it. Round 13's run found three defects: the `schedule.js` cell stopped at D4 while
AC11 requires D5; the test cell's `T3-T7` range silently excluded T2c/T2d/T2e; and
`src/scheduler/generators.js` was listed as **both** a deliverable and a
not-deliverable.

**Added 2026-08-02 after the round-1 review — the two layers a pre-implementation
pass structurally cannot run, and which therefore run on every post-implementation
revision instead:**

- **diff↔enumeration.** Every counted claim about existing code ("exactly FOUR
  existing assertions change") is re-derived from
  `git diff origin/main...HEAD -- <file>` and never from the previous draft.
  Finding 3 was a count written before the code existed and never re-derived; the
  branch carried five assertion sites and a ten-site setup-loader swap. Counts
  about a tree you have not diffed are estimates wearing a contract's clothes.
  **Table E** is where this layer's output now lives.
- **verification↔contract.** Every grep in "Verification steps" is executed
  against a tree that satisfies the spec's *other* mandates — in particular the
  JSDoc in "Exact contracts". Finding 2 was two greps that a spec-conforming
  branch fails **because** it conformed: the mandated JSDoc names
  `ensureWindowsTaskRegistered` and `loadedEntryTargets`, and the greps matched
  prose. A verification command that a correct implementation fails is worse than
  no command, because it teaches the implementer to reword the contract.

**The range-abbreviation check, with its grep.** Round 13 enumerated the two
Deliverables cells and wrote the lesson — and left the *same* abbreviation standing
at four other sites, including the checklist line that is the **registered mirror**
of the cell it had just fixed, and a line twelve lines above where the checklist
narrates the lesson. That is the lesson applied to the site that revealed it rather
than to every site of its kind. So the check now carries its own command, run on
every pass:

```bash
grep -nE "T[0-9][a-z]?-T[0-9]|D[0-9][a-z]?-D[0-9]|AC[0-9]+[a-z]?-AC[0-9]" docs/specs/WP-scheduler-register-replaces-loaded-record.md
```

**Expected output: only narration** — lines that *quote* a deleted abbreviation to
explain why it was deleted. The pattern covers `AC` ids too (round 15): the same
insertion growth applies there, and `AC1-AC5` would exclude AC11 exactly as
`T3-T7` excluded T2c. **At the round-15 push this returns 5 hits, every one
narration** (this paragraph accounts for three of them). Any hit that is a live
reference to a set is a defect:
these id sets grow by insertion (T2b/T2c/T2d/T2e were inserted *before* T3, and
D0b/D1b are lettered members inside a `D0-D5` span), so a range silently excludes
new members the moment one is added. Enumerate; never abbreviate.

Out of this spec, not deliverables:

- [ ] `docs/adr/0018-…` decision 2 — amended by ADR-0037 from a new file, never edited. Owner-signed.
- [ ] `docs/specs/WP-scheduler-node-path-durability.md` DoD 0a/0b — actioned **there**, after this merges.

## Implementation notes & constraints

### Export audit — run this before naming any `gen.*` symbol

**Standing authoring step, adopted after this chain produced three
named-but-unreachable-symbol blockers.** For every `gen.*` symbol a spec names,
record a grep over `module.exports`, not over the file. Executed for this spec:

```
$ grep -nE "^  (launchdLoadedArgs|jobLaunchArgs|catchupLaunchArgs|loadedEntryTargets),$" \
    src/scheduler/generators.js
1007:  loadedEntryTargets,
1030:  catchupLaunchArgs,
```

Re-run in round 5 for the symbols Table A2 added:

```
$ grep -nE "^  (scheduledEnvPairs|launchdLoadedCalendar|launchdLoadedEnv),$" \
    src/scheduler/generators.js
1035:  scheduledEnvPairs,
```

`scheduledEnvPairs` is already exported and needs no D0 entry.
`launchdLoadedCalendar` and `launchdLoadedEnv` do not exist yet — D1b creates and
exports them.

`launchdLoadedArgs` and `jobLaunchArgs` are **absent** — both are defined and used
internally but never exported, so both would be `undefined` at the call site D2
specifies. That is what D0 fixes, and why D0 exports **two** names rather than one.
"The function exists" is not "the function is reachable".

### D1b — the two new readback parsers in `src/scheduler/generators.js`

Both **pure**, both alongside `launchdLoadedArgs`, both exported by D0, both
returning a fail-safe empty/null on anything they cannot parse. Neither performs
filesystem access, a spawn or a `require`, and neither throws — the same contract
`launchdLoadedArgs` already carries.

- `launchdLoadedCalendar(stdout)` → `{hour:number|null, minute:number}|null`, where
  the **outer** `null` means "malformed, `Minute` missing, **or the trigger block
  did not hold exactly one entry**" and `hour: null` means "the `Hour` key was
  validly **absent**" (the catch-up shape). The two nulls are different and must
  never be collapsed.

  **Parse the COMPLETE `event triggers` block and count ALL of its immediate
  entries — do not search for a calendarinterval entry (Table A2, CX11-2).** Return
  the outer `null` unless the total is **exactly 1** *and* that sole entry's
  `stream` is `com.apple.launchd.calendarinterval`. A find-the-calendarinterval
  instruction, implemented literally, ships the defect round 12 closed: our
  canonical calendar trigger **plus** a foreign-stream trigger passes a search and
  fails a count. The executed dump (§7c) shows launchd injects nothing into that
  block, so "exactly one" is what a healthy record looks like. Then read the
  `event triggers` entry whose `stream` is `com.apple.launchd.calendarinterval`,
  read its nested `descriptor = {` block, and parse the **quoted-key, unquoted-value**
  `"Hour" => 3` / `"Minute" => 30` lines (Current state §7b fact 3). A missing
  block, a missing `Minute`, or a non-numeric value ⇒ outer `null`. A missing
  `Hour` key ⇒ `hour: null` — not an error, it is the catch-up shape.
  The comparison then uses **strict equality** on `hour`, so `null` matches only
  `null`: an absent expectation **refuses** a present `"Hour"`, and a present
  expectation refuses an absent one.
- `launchdLoadedEnv(stdout)` → `Map<string,string>|null`. Find the block whose
  **trimmed line is exactly** `environment = {` — never a suffix match, because
  `inherited environment = {` and `default environment = {` precede it (§7b fact 2)
  — and parse its `KEY => value` lines. **a `KEY =>` line with nothing after the arrow is a
  valid pair whose value is the empty string** — never a skipped line (§7b fact 4).
  Unparseable ⇒ `null`.

`darwinLoadedVerdict` then applies Table A2: argv equality, calendar equality, and
env **containment** (§7b fact 1). Any `null` ⇒ false ⇒ attempt.

### D1 — the two new helpers in `src/cli/schedule.js`

Both non-exported, defined near `darwinReplaceEntry`. **`darwinLoadedVerdict`
returns one of three strings and NEVER a boolean** — a round-7 rename made the
function tri-state but left this paragraph describing true/false, which read
literally would either disable every teardown or reintroduce destroy-on-unreadable.
It calls `gen.launchdLoadedArgs(stdout)` plus the two D1b parsers and maps the
result exactly as Table A1 requires:

| Observation | Verdict |
|---|---|
| **any** source returns its unparseable value — `launchdLoadedArgs` → `null`; `launchdLoadedCalendar` → outer `null`; `launchdLoadedEnv` → `null`; **or any of the four single-line fields is absent from the record** | **`'indeterminate'`** — the absence of evidence. Attempt the non-destructive bootstrap; **never** a teardown |
| everything parsed; every **FATAL**-tier field equal (Table A2b); only a **BENIGN**-tier field differs — either log path, `spawn type`, or `path` | **`'mismatch-benign'`** — no skip **and no teardown**. The record still does its authorized job |
| everything parsed; a **FATAL**-tier field differs — argv length or element, `program`, calendar, trigger count/stream, or a canonical env pair | **`'mismatch-fatal'`** — the ONLY verdict that may authorize a teardown |
| everything parsed and every Table A2 value equal | **`'match'`** — skip |

**The four fields added in round 11 need no new parser family.** `path`, `program`,
`stdout path` and `stderr path` are each a single top-level `key = value` line in
the record (§7c), so one small reader — trim the line, split on the first ` = ` —
serves all four; `spawn type` uses the same reader and then compares only the
**first word** of its value (`background`, from `background (5)`), because the
numeric code is undocumented. **A field the reader cannot find is `'indeterminate'`,
never either `'mismatch-*'`**: an absent line is a readback we could not complete, and the
round-9 rule that the absence of evidence must not authorize destruction applies to
these fields exactly as it does to the three block parsers.

Both fail-safe directions follow from that table and neither is a boolean: an
unreadable record is never skipped **and** never destroyed.

**"Element by element" is not byte-fidelity, and that is safe here.**
`launchdLoadedArgs` **normalizes**: it trims each line (`generators.js:685`) and
terminates on a trimmed `}` (`:686`). So an argument carrying leading/trailing
whitespace, an embedded newline, or a lone `}` line cannot round-trip through the
readback. Every such case yields a **mismatch**, which means **attempt** — the
fail-safe direction — and none is reachable from a code-owned argv anyway: the
elements are an absolute node path, an absolute launcher path, a
`/^[a-z0-9][a-z0-9-]*$/` job name, the literal flags, an absolute descriptor path,
and a `sha256:`+hex digest. Do not "fix" this by reaching for the raw stdout.

**Compare against the UNESCAPED canonical argv, not the plist's XML.** The plist
renders each argument through `xmlEscape`, but `launchctl print` reports the
actual argument values. Executed against the live record on the authoring host:

```
        arguments = {
                /opt/homebrew/Cellar/node/25.9.0_2/bin/node
                /Users/gyulafeher/.wienerdog/launcher/launch.js
                dream
                --descriptor
                /Users/gyulafeher/.wienerdog/state/descriptors/dream.json
                --expect-digest
                sha256:5ab9a409…
        }
```

That is exactly `[node, ...gen.jobLaunchArgs({launcher, name, descriptor,
expectDigest})]` — the array the register site already holds. **The order
guarantee has render sites, cited the way §7 cites the parser:** `launchdPlist`
emits `o.node` first (`generators.js:364`) and then `jobLaunchArgs(o)` in order
(`:355` + the `args.map` immediately after it); `catchupPlist` does the same with
`catchupLaunchArgs` (`:398`, `:407-408`). If either renderer's argument order ever
changes, `expect.argv` must change with it — they are one contract. Build `expect.argv`
from those same values; never re-read it from the rendered plist string.

**Why the COMPLETE argv, and not just node + launcher.** A round-2 draft compared
only those two positions and routed the tail to
`WP-scheduler-argument-tail-identity`. That routing is right for the *adversarial*
case (a record whose argv matches canonical but whose binary was substituted) and
wrong for the **accidental** one, which this WP ships directly into:

> a pre-WP `sync` already rewrote the on-disk plist with a new
> `--expect-digest` while launchd kept the old record — precisely
> `WP-scheduler-node-path-durability`'s Table D-a state. On the first post-WP
> `sync`, canonical bytes equal on-disk bytes so `changed` is **false**, `print`
> exits 0, and node + launcher **match** — so a two-position comparison grants a
> verified skip and the stale-digest record persists **indefinitely**, while the
> launcher refuses every fire. The defect this WP exists to close would survive
> the WP, on every already-installed macOS machine.

Full-argv equality closes it with no new machinery: the parser exists, it is pure,
and the expectation is data the caller already has. What stays routed to
`WP-scheduler-argument-tail-identity` is only what a byte-equal argv cannot
detect — a substituted binary behind a matching path.

**Do not edit `darwinReplaceEntry`.** It stays exactly as it is, as the heal
path's primitive; `ensureDarwinEntryRegistered` is a separate function for the
register path. Changing the shared one would alter heal behavior, which is not in
scope and whose ADR-0018 reasoning still applies unchanged there.

### D2 — darwin per-job arm (`schedule.js:429-431`)

```js
    // Captured BEFORE ensureEntry overwrites — the narrowest possible capture
    // point, and the reason ensureEntry's contract does not change.
    let priorBytes = null;
    try { priorBytes = fs.readFileSync(plistPath); } catch { priorBytes = null; }
    const changed = ensureEntry(manifest, plistPath, content, unload);
    const loaded = ensureDarwinEntryRegistered(loader, uid, label, plistPath, {
      changed,
      priorBytes,
      canonicalBytes: Buffer.from(content),   // the same bytes handed to ensureEntry
      expect: {
        argv: [node, ...gen.jobLaunchArgs({ launcher: b.launcher, name: o.name, descriptor: b.descriptor, expectDigest: b.expectDigest })],
        hour: o.hour, minute: o.minute,
        env: gen.scheduledEnvPairs(paths.home, paths.core),   // already exported (:1035)
        path: plistPath,                                      // in scope; the file we just wrote
        stdoutPath: path.join(logDir, 'launchd.out.log'),     // logDir is in scope
        stderrPath: path.join(logDir, 'launchd.err.log'),
        spawnType: 'background',                              // ProcessType literal
      },
      onBeforeTeardown: () => require('../scheduler/status').refreshSchedulerStatus(paths),
    });
```

`changed` keeps its meaning — "the file bytes changed" — and is still what
`repointSchedules` counts. Do not redefine it.

The `onBeforeTeardown` callback is ADR-0018 decision 2's pre-destructive durable
marker, and passing it as a callback is what makes it fire **only** when a teardown
is actually about to happen. The round-1 draft refreshed the cache on every
attempt, which is both wasteful and — per Current state §9 fact 3 — part of how a
stale `'loaded'` gets recorded in the first place. Lazily
`require('../scheduler/status')` inside the callback, matching `schedule.js:650`
and `:675`; a top-level require would create a load-time cycle.

It stays best-effort — `refreshSchedulerStatus` swallows every write error and
returns `void` — so the marker is *attempted*, never known to have landed. That
residual is ADR-0018's and is not re-litigated here.

### D3 — `ensureCatchup` (`schedule.js:314-317`)

The same call, with the label `'ai.wienerdog.catchup'` (already in scope as
`label`) and

```js
expect: {
  argv: [node, ...gen.catchupLaunchArgs({ launcher, expectDigest, jobDigests })],
  hour: null, minute: 0,  // catchupPlist renders Minute 0 and NO Hour key
                          // (generators.js:410-416) — null REFUSES a present Hour
  env: gen.scheduledEnvPairs(paths.home, paths.core),
  path: plistPath,
  stdoutPath: path.join(logDir, 'launchd.out.log'),   // logDir = <core>/logs/catchup
  stderrPath: path.join(logDir, 'launchd.err.log'),
  spawnType: 'background',
}
```

and, alongside `priorBytes`, **`canonicalBytes: Buffer.from(content)`** — the same
`content` handed to `ensureEntry` a few lines above. Both call sites must pass it;
it is not optional (see the JSDoc).

```js
```

Return `{ loaded: … }` as today.

**Reuse the values already computed for `gen.catchupPlist(…)` a few lines above —
do not re-call `gen.nodePath()` or `launcherPathFor(paths)`.** D2 already does this
correctly with its local `node`. Hoist the catch-up node/launcher/digest values
into `const`s and pass the same ones to both the renderer and `expect`, so the
registered plist and the expectation are provably the same values. This matters
concretely once `WP-scheduler-node-path-durability` lands and `:303` becomes
`gen.entryNodePath()`: two independent calls could otherwise diverge, and the skip
would compare against something we never wrote.

### D4 — linux arm (`schedule.js:456-466`)

Three edits, one behavior:

1. Hoist the `daemon-reload` + warning block **out** of `if (changed)` so it runs
   on every linux register (Table A row 3).
2. Bind the existing status test to `const reloadOk = …` and use that one value for
   both the warning and the gate.
3. `loaded = reloadOk && enableOk`, where `enableOk` is today's `:466` test.
   `enable --now` also runs on every register.

Do not change the warning string (byte-exact in §4). Leave the second
`daemon-reload` at `:777` (the heal path) alone.

**`loginctl enable-linger` stays exactly where it is: still inside
`if (changed)`, still best-effort, still NOT gating `loaded`.** Only the
`daemon-reload` block moves out. Linger is about letting timers fire while the
user is logged out — it is not evidence about what systemd holds, so ADR-0037's
obligation 1 does not reach it, and moving it would be unrequested scope.

### D5 — `add()` must fail on ANY unloaded outcome (`schedule.js:882`)

```js
  if (changed && !loaded) { throw new WienerdogError(…); }
  if (!changed) { process.stdout.write(`wienerdog: "${name}" already scheduled at ${flags.at} — unchanged.\n`); return; }
```

The `changed &&` conjunct makes the **user-facing entry point** report success for
an unchanged entry whose forced registration failed — it prints *"already
scheduled … unchanged"* over a `loaded: false`. That is ADR-0037's central
postcondition violated at the one surface a human reads directly, and after D2, D3 and D4
it is reachable on both fixed legs (darwin: an unchanged entry whose readback
mismatches, then fails to register; linux: an unchanged entry whose hoisted
`daemon-reload` is degraded).

**Fix: drop the conjunct — throw whenever `loaded` is false, regardless of
`changed`.** Keep the message text; only its guard changes.

**This is not a new rule, it is the rule the other two callers already follow** —
which is also the evidence that `add()` is the outlier:

- `ensureDreamSchedule` (`schedule.js:823`) already does
  `if (!res.loaded) return { scheduled: false, reason: 'load-failed', at };`
  unconditionally, and its comment states the principle in the repo's own words:
  *"Any load failure (incl. a forced re-registration with unchanged source XML)
  must fail loud — the loaded task is the trust anchor, not the source bytes."*
- `repointSchedules` (`schedule.js:583`) already pushes §8's notice on
  `!res.loaded`, unconditionally.
- `add()` (`schedule.js:882`) is the **only** `registerPlatform` caller gated on
  `changed`. Audited: those are all four call sites (`:380` definition, `:575`,
  `:813`, `:879`).

### D6 — the `WIENERDOG_LOADER_NOOP` collision (architect boundary amendment, 2026-08-02)

**This section was added after the implementer finished.** It is a spec bug being
paid for, not a scope change the implementer chose: the collision below was
invisible at spec time and surfaced only at full-`npm test` time, in a file this
table did not list. Recorded here in full so the next reader does not have to
reconstruct it from a PR body.

**The collision, verified firsthand.** `tests/unit/init.test.js:115` runs a REAL
subprocess of `bin/wienerdog.js init --fresh-vault --yes` with
`WIENERDOG_LOADER_NOOP=1`. That seam (`src/scheduler/spawn.js:25`) answers EVERY
scheduler spawn with a blind `{status:0}` and **no `stdout`**:

```js
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
```

Under Table A row 1 the darwin per-job register now reads the entry back with
`launchctl print` and requires a `'match'` verdict. A `{status:0}` with no
`stdout` parses to `'indeterminate'` — never `'match'` — so
`ensureDarwinEntryRegistered` returns `false`, `ensureDreamSchedule` returns
`{scheduled:false, reason:'load-failed'}` (`schedule.js:823`), and `init`'s
summary takes the `load-failed` branch (`src/cli/init.js:199`) instead of the
`scheduled` branch (`:192-195`). The test's `/catches up automatically/i`
assertion is in that `scheduled` branch. Executed on this branch, the ONLY
delta in `init --fresh-vault`'s entire stdout against `origin/main` is that
three-line success block collapsing to the one-line degraded notice — nothing
else in the run moved.

**This is the postcondition working exactly as designed.** Nothing was verified,
so nothing may claim success. The notice the user now sees under a blind seam is
the correct output, and the WP-066 catch-up reassurance would be a false promise
there: `init` cannot promise launchd will catch up on an entry it has no
evidence launchd holds. Read the other way round, the pre-amendment assertion was
never testing real scheduling — it was resting on the seam's blindness being
indistinguishable from success, which is precisely the
failing-outside-our-own-observability signature named in Context.

**The fix is PLATFORM-AWARE, and that is not incidental.** Only the legs that
verify can report `loaded:false` under a blind seam:

| leg | under `WIENERDOG_LOADER_NOOP=1` | why | `init` summary |
|---|---|---|---|
| darwin (Table A rows 1-2) | `loaded:false` | the readback runs and yields `'indeterminate'` | the `load-failed` notice |
| linux (Table A row 3) | `loaded:true` | Table A row 3 specifies **no** readback — `reloadOk && enableOk` are both `{status:0}` | the `scheduled` block |
| win32 (Table A row 4) | `loaded:true` on a fresh install | `changed` is true, so `ensureWindowsTaskRegistered` skips its readback and returns from `/create` | the `scheduled` block |

CI runs `ubuntu-latest` **and** `macos-latest` (`.github/workflows/ci.yml:33`), so
a single unconditional assertion cannot be correct on both. The assertion branches
on `process.platform === 'darwin'`.

**The darwin leg asserts the NEGATIVE too** (`doesNotMatch(/catches up
automatically/i)`) deliberately: that turns this test into a tripwire against the
rejected alternative below. If anyone later teaches the seam to fabricate a
matching readback, this assertion goes red and forces the conversation.

**REJECTED ALTERNATIVE — extending `WIENERDOG_LOADER_NOOP` in
`src/scheduler/spawn.js` so a NOOP `launchctl print` returns canonical-matching
stdout.** Rejected, and rejected in this WP's own terms:

1. **It fabricates the exact evidence the postcondition exists to require.**
   ADR-0037's rule is *a register that cannot verify what the OS now holds must
   not report success*. A seam that manufactures a `'match'` readback makes the
   register report success from evidence it invented about an OS call that never
   happened. That is the anti-pattern this WP kills, reintroduced one layer down
   and harder to see, because it would then be baked into the chokepoint rather
   than into any one call site.
2. **It would make the postcondition untestable-by-construction on every NOOP
   path.** All ~15 NOOP-using test files would permanently observe "verified",
   so no subprocess-driven test could ever again detect a genuine regression in
   the readback. One honest assertion change is strictly cheaper than blinding
   the whole seam.
3. **It contradicts the seam's documented contract and an existing in-tree
   precedent.** `spawn.js`'s own JSDoc calls NOOP "the existing neutralizer; a
   test that has deliberately opted out of real scheduling" — a *neutralizer*,
   not a simulator. And `tests/unit/scheduler-entry-identity.test.js:396-407`
   already pins the read side of exactly this question: under
   `WIENERDOG_LOADER_NOOP=1` it asserts `defaultProbe(…) === 'unknown'`. NOOP
   already means *you learn nothing*. Option (b) would put the two read paths in
   direct contradiction.
4. **It is not small.** To fabricate a matching `launchctl print`, the seam would
   have to know the label→plist mapping, the live config and the rendered
   canonical bytes — i.e. reimplement the generator inside the ONE scheduler
   chokepoint that ADR-0028 hardened, in service of one assertion.

**Blast radius, confirmed by grep, not by assumption.** The ~15 other
NOOP-using files were checked for register-success assertions
(`catches up automatically|is scheduled for|did not accept|loaded: *true|\.loaded`).
Two files hit and neither is affected: `tests/integration/adopt-e2e.test.js:422`
is a comment, and `tests/unit/scheduler-entry-identity.test.js`'s hits are
unit-level `loadedEntryTargets` calls over explicit stdout fixtures (no seam
involved) plus one assertion on a *failure* notice (`:815`). `init.test.js` is
the only file whose meaning depends on the seam implying success — which is why
it is the only one in this table.

### Rollback — OWNER-DIRECTED, and it is the contract, not a residual

**This section supersedes a round-3 draft that declared the destruction window an
accepted residual. The owner ruled on 2026-07-28: rollback is required, no
destruction window ships.** Codex's position prevails; the "self-authored plist,
loud failure, rollback complexity not paid" argument is **withdrawn**, not
weakened, and must not be re-proposed from this spec's history.

`launchctl print` exiting 0 proves the label is loaded; it does **not** prove the
`bootstrap` failed *because* of that. So a healthy record plus an unbootstrappable
replacement (invalid content, or a permission rejection on the LaunchAgents path)
reaches the teardown. Step (d) of the contract restores the prior registration.

**Blast radius stayed narrow, as directed.** `priorBytes` is read in the darwin
arm **immediately before** `ensureEntry` overwrites (D2), so `ensureEntry`'s
contract, return value and every other platform are untouched, and the whole
rollback lives in `src/cli/schedule.js` — already a deliverable. `fs` is already
required there.

Four contract properties, all binding:

1. **Rollback restores BOTH the file and the loaded record** — write `priorBytes`
   back to `plistPath`, then `bootstrap` that restored file.
2. **The register still reports `loaded: false` and fires §8's notice.** Step (d)
   can never `return true`. And it **restores the PRIOR state, healthy or not** —
   in D1's transition case the prior record is exactly the stale registration being
   replaced, which refuses every fire. Do not say rollback "restores scheduling":
   it restores *what was there*, and property 3 is what carries the user forward.
3. **Convergence.** After a rollback the disk holds the **prior** plist, so the
   next register renders differing bytes, `changed = true`, no skip is possible,
   and the replacement is retried — with §8's notice on every attempt, so it never
   spins silently.

4. **What rollback protects, and its bound — stated honestly (CX-2).**
   `priorBytes` is **the previous DISK state, and nothing more**. A round-4 draft
   claimed it is "the previously-registered plist when `changed = true`; that is
   **false**, and the counterexample is reachable through pre-WP history: OS holds
   record **A**, disk holds plist **B**, we render **C**. That state is exactly what
   an earlier failed register leaves behind (`ensureEntry` writes B, the OS call
   fails, A stays loaded). Then `changed = true`, `priorBytes = B`, the verdict on
   A is `mismatch`, C fails to bootstrap, and the rollback restores **B — never
   A**. A is gone, and B may itself be unbootstrappable.
   **The disk coincides with the previous registration only when the last register
   SUCCEEDED**, which is precisely the assumption this WP exists because we cannot
   make. In the divergence case
   (`changed = false`, disk already canonical, loaded record older) `priorBytes`
   **equals canonical**, so a rollback would re-write and re-bootstrap the very
   plist that just failed. It cannot restore what the `bootout` destroyed, because
   no artifact of that record exists on disk — this spec's own
   "disk is not evidence" premise, applied to its own rollback.

   **The restore is guarded by a BEST-EFFORT STALENESS CHECK, not an unconditional
   write (CX14-2) — and deliberately not called a compare-and-swap (CX15-2).**
   "Compare-and-swap" names an *atomic* primitive; this is a plain read followed by
   a write, and calling it CAS would overclaim exactly the property it lacks.
   Declaring registration single-invocation does not *enforce* it, and two attended
   CLIs can overlap. Before restoring, re-read `plistPath` and restore **only if it
   still equals the canonical bytes this invocation wrote**. If they differ, another
   invocation has written since — its bytes are **newer** and describe a
   registration we never inspected — so we **do not restore**, report
   `loaded: false`, and fire §8's notice. No lock is introduced; serialization
   stays routed as `WP-scheduler-register-serialization`.

   **The guard's own residual, stated exactly — it is not atomic and cannot be
   made so here.** Two windows survive, both bounded by the single-invocation
   precondition:
   1. **Read-then-write.** A concurrent write landing *between* the guard's read
      and our restore write is still overwritten. Cost: that invocation's file is
      replaced by `priorBytes`; its own post-bootstrap verify then fails, it
      reports `loaded:false` with the notice, and the next attended register
      converges it. Loud, never silent.
   2. **Identical bytes.** A concurrent writer producing bytes *equal* to our
      canonical is undetectable by a byte comparison — but it is also, by
      definition, writing the same registration we would, so overwriting it with
      `priorBytes` costs only the same loud non-convergence as case 1, never a
      different registration.

   **There is no lock-free fixed point for this**, and chasing one would be
   inventing the serialization that is already declared out of scope. Closure path:
   the **single-invocation precondition** plus **`WP-scheduler-register-serialization`**,
   which owns atomicity. The guard's value proposition is unchanged and modest: at
   four lines it removes the *likely* destructive interleaving; the remainder is
   named, bounded, preconditioned and routed.

   **ADR-0037 needs no new text for this — checked, not assumed.** Its precondition
   already reads: *"Two concurrent registrations racing the same scheduler entry are
   outside this decision: the OS loads whatever is on disk when it is asked, so a
   concurrent writer can invalidate any readback taken moments earlier."* Both
   windows above are instances of exactly that sentence, so the ADR is not grown.

   **Fixtures for the two windows: NOT written here, and recorded as the routed
   WP's acceptance criteria instead.** Both require observing a write that lands
   inside a specific instruction interval of another process; a unit test can only
   fake that with scaffolding that proves the scaffolding, not the code. Writing
   them would violate this spec's own no-unexecutable-evidence rule — the same rule
   that denied Linux a verified skip and Windows a trigger readback. They belong to
   `WP-scheduler-register-serialization`, whose mechanism can actually make them
   deterministic. T2f (the *observable* interleaving — a concurrent write already
   present when the guard reads) stays here, because it is honestly executable.

   **What the guard does NOT close beyond its own windows, traced rather than glossed.** It removes the
   destructive half of the race — we can no longer overwrite a newer file. It does
   **not** undo the `bootout`: the losing invocation may already have removed the
   loaded entry, so the winner's newly written plist can be left on disk with no
   loaded record. **Convergence:** the winner is still inside its own
   `ensureDarwinEntryRegistered`. Its `print` finds the label absent (`verdict =
   'absent'`), which forbids a teardown and takes the non-destructive attempt;
   its `bootstrap` now succeeds precisely *because* the label was freed; and its
   post-bootstrap verify confirms its own bytes. The race therefore ends with the
   **newer** registration loaded and verified. If the winner had already passed its
   bootstrap when the loser's `bootout` landed, its verify fails, it reports
   `loaded: false` with the notice, and the next attended register converges it —
   loud, never silent.

   **What rollback therefore guarantees, stated honestly:** it restores *the disk
   state that preceded this register*, and re-bootstraps it. When the last register
   succeeded (the common case) that **is** the prior registration and the guarantee
   is complete. When it did not, rollback returns the machine to the same
   already-broken state it was in before this attempt — it never makes things
   worse, and it never claims to have restored a working schedule.

   **Narrowing the window cheaply — a `plutil -lint` preflight before ANY
   teardown.** The most likely reason a self-authored replacement fails to
   bootstrap is that it is malformed, and that is detectable **before** anything is
   destroyed, at zero risk. Verified present and working on the authoring host:

   ```
   $ which plutil
   /usr/bin/plutil
   $ plutil -lint ~/Library/LaunchAgents/ai.wienerdog.dream.plist ; echo $?
   /Users/gyulafeher/Library/LaunchAgents/ai.wienerdog.dream.plist: OK
   0
   ```

   **Contract, and the reason it is gated on `fs.existsSync` rather than on the
   loader's result.** `schedulerSpawn` (`src/scheduler/spawn.js:33-35`) returns
   `{status: r.status == null ? 1 : r.status}` and **discards `r.error`**. A spawn
   failure — including `ENOENT` for a missing binary — therefore arrives as
   `{status: 1}`, **byte-identical to "the linter rejected this file"**. A
   fail-open written as "absent or erroring ⇒ pass" is consequently
   **unreachable** with the production loader, and its real effect would be the
   opposite of the intent: a machine without `plutil` would read every preflight as
   a lint failure and **permanently refuse to replace any mismatched record**.
   So the branch is decided by **existence**, which the loader cannot flatten:

   - `PLUTIL = '/usr/bin/plutil'` — an absolute path, never a PATH lookup
     (WP-154's exec-identity rule).
   - `fs.existsSync(PLUTIL)` **false** ⇒ **skip the preflight entirely** and
     proceed. This is the true fail-open, and it is now reachable and
     distinguishable from a lint rejection.
   - exists **and** `status !== 0` ⇒ return `loaded:false`, **no teardown**. The
     replacement is known-bad; destroying a loaded record for it is indefensible.
     Conservative and loud.
   - exists **and** `status === 0` ⇒ proceed. Exit 0 does not promise the bootstrap
     will succeed (permissions, launchd state), so this narrows the window rather
     than closing it.

   `plutil` is a **macOS system binary present by default** (`/usr/bin/plutil`,
   verified on the authoring host), so the skip branch is near-unreachable in
   practice — it exists to make the failure mode safe, not because it is expected.

   **The bound is what makes the remainder acceptable, and it depends on Table A2.** Once
   the skip compares every varying field, **any** record that reaches a teardown is
   already divergent from canonical: a stale argv (refusing every fire on the
   `--expect-digest` mismatch), a stale firing time, or a stale env binding. So the
   residual destruction window contains **only already-divergent registrations** —
   never a healthy one — it is loud (`loaded:false` + §8's notice), and property 3
   converges. It is bounded, not absent, and it is not called a residual-that-was-
   argued-away: it is the honest remainder of a contract the owner required.

   Codex's stricter form — never `bootout` without an artifact proven to represent
   the loaded record — is **rejected** on the ground that it would forbid teardown
   in exactly the transition case this WP exists to fix, leaving the stale record
   permanently loaded. The owner has been notified of this refinement.

5. **Crash and failure windows — every one converges to a loud, bounded state.**
   Traced against the measured exit codes (§7: `0` loaded, `113` absent):

   | Point | Disk | Label | Next register | Outcome |
   |---|---|---|---|---|
   | after `bootout`, before the final `bootstrap` | NEW | absent | `changed=false`; `print`→113 ⇒ no skip ⇒ `bootstrap` | **recovered** |
   | after `ensureEntry`'s write, before `print` | NEW | OLD record | `changed=false`; `print`→0, compared fields differ ⇒ attempt | **recovered** |
   | after restore-file, before re-`bootstrap` | PRIOR | absent | `changed=true`; `print`→113 ⇒ `bootstrap` of canonical — **which is unbootstrappable, since that is how this state was reached** ⇒ fails ⇒ step (d) unreachable | **converges to loud failure; the prior registration is lost** |

   **The third row is not "recovered", and a round-4 draft said it was.** Reaching
   restore-file requires the replacement to be unbootstrappable, so the next
   register hits the same failure and never returns to step (d). Final state: disk
   holds the unbootstrappable canonical plist, label absent, notice on every sync.
   That is the same converges-to-loud-failure semantics property 3 already states —
   the table simply disagreed with the prose above it.

   **Two bounded windows of the same kind, therefore, not one.** (i) that row, and
   (ii) `priorBytes === null` — the plist did not exist when the register began, so
   there is nothing to restore; reaching it needs the plist deleted out from under
   a *loaded* label by something other than Wienerdog. Both end loudly, both are
   covered by property 3's retry loop, and both are asserted (AC2 fixtures e, f).

That routed follow-up slug is **retired** — absorbed here — and must not be routed
from this spec again.

### The file race, the precondition, and the post-bootstrap verify (CX8-1)

launchd loads whatever is on disk **at bootstrap time**, not the bytes we linted or
computed `expect` from. A concurrent writer between those points makes the helper
report success for bytes it never verified; and a concurrent rollback can overwrite
another invocation's canonical file with stale `priorBytes`.

**What serialization this repo actually has — grepped, not assumed.** The only lock
is `src/core/dream/lock.js` (`state/dream.lock`, `acquireLock`/`lockPath`), which
serializes **dream runs** under ADR-0012. There is **no** per-label, per-entry or
registration-wide lock: `wienerdog sync` and `wienerdog schedule add` do not
serialize with each other or with themselves. `state/locks` (which the launcher's
env re-assert mentions) has no owner in `src/` — nothing reads or writes it.

**Precondition, stated rather than invented around.** *Registration is an attended,
single-invocation operation. Two concurrent `sync`/`add` processes racing the same
label are **out of scope** for this WP.* This spec does **not** introduce a lock —
inventing cross-process serialization from a docs WP, in a subsystem whose only
existing lock belongs to a different lifecycle, is exactly the kind of speculative
machinery CLAUDE.md forbids. Routed as **`WP-scheduler-register-serialization`**,
which is also where the rollback-overwrite half belongs.

**What IS added, because it is cheap: a post-bootstrap verify — after EVERY
successful bootstrap.** Issue **one** read-only `print` and re-run
`darwinLoadedVerdict` against the same `expect`. Only `'match'` returns `true`;
anything else returns `false` (with §8's notice).

**Both bootstrap sites, not just the post-teardown one.** A round-9 draft verified
only the replacement bootstrap and let the **initial** (absent-label) bootstrap
return `true` bare. That is the *same* race on the branch where nothing was loaded
— the file can change between render/lint and bootstrap, launchd loads the foreign
bytes, and we report them as canonical — and it contradicted both ADR-0037's
re-read-after-the-mutating-call obligation and this section's own claim to close
the report-wrong-registration race. The verify is therefore a single closure
(`verifyLoaded`) applied at both sites, so the two paths cannot drift apart again.
Cost: one read-only call per **successful** register, on either path.

**State its failure mode honestly — it is a DETECTION, not a repair.** If the
bootstrap succeeded but the verify does not match, the record **is** loaded, with
bytes we did not authorize, and we report `loaded: false`. We do not tear it down:
that would be destroying a record on a verdict we have just shown can be produced
by a racing writer rather than by divergence. So the outcome is *"something else
won the race; a human is told"* — which is strictly better than *"we reported
success for bytes we never verified"*, and strictly weaker than a repair.

It closes the **report-wrong-registration** half of the race. The
**rollback-overwrite** half is covered by the precondition and the route above.

### ADR-0037 ratification gate — SATISFIED 2026-07-28 (kept as the pre-merge record)

`docs/adr/0037-verified-registration-postcondition.md` is **Accepted — OWNER-SIGNED
2026-07-28** (the gate below was satisfied by that signature). It amends
ADR-0018 decision 2, which is owner-signed. Per `docs/adr/README.md`, accepted ADRs
are superseded by a new ADR rather than edited — the form used here, deliberately,
and **not** an in-file appendix to 0018.

The signature slot is ADR-0037's `Status:` line. **No ratification token is in
that file and none may be added by the implementer, by any agent, or by a
reviewer.** Definition of done item 6 gates merge on the owner's ratification.
Pre-ratification, this section stated the negative — not signed, not accepted,
nothing in the branch readable as approval. The owner's ratification pass on
2026-07-28 is what changed it, and only that.

### General

- No new npm dependency. No new top-level `require` in `schedule.js`.
- ADR-0004: every added check is an in-band step of the attended register call and
  exits with it. No daemon, no watcher, no poller.
- Reversibility untouched: manifest entries and `deriveUnloadArgv`'s
  basename-derived unregister argv (ADR-0027) are unchanged.
- When uncertain: choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `launchctl print` stdout is **untrusted display text** and is handled the way
      `defaultProbe` step 8 handles it: string comparison only, through the
      existing `loadedEntryTargets`. No value parsed out of it reaches a `spawn`, a
      `path.join`, a `require`, an `fs` call, or a write. `darwinLoadedVerdict`
      performs no filesystem access and never throws.
- [ ] The comparison is **allowlist-shaped and TRI-STATE**: `'match'` only when
      every parser succeeded **and** every Table A2 value is equal. An attacker who
      can alter any single argument, calendar field or canonical env pair gets
      `'mismatch-fatal'` or `'mismatch-benign'` per Table A2b — an extra
      registration, never a skip, and only a FATAL-tier alteration can reach a
      teardown, so a cosmetic edit cannot be used to make us destroy a working
      record. An attacker who can make
      the readback **unparseable** gets `'indeterminate'`, which buys **neither** a
      skip **nor** a teardown: degrading the readback can therefore neither
      certify a hostile record nor weaponize this code into destroying a healthy
      one. Comparing the **complete** argv (rather than the node and launcher
      positions) is what makes altering the `--descriptor`/`--expect-digest` tail
      insufficient to buy a skip.
- [ ] D0 exports an existing **pure** string function. It performs no filesystem
      access, no spawn and no `require`, it never throws, and exporting it widens
      no capability — `package.json` declares `bin` only (no `main`, no `exports`),
      so nothing outside this repo can reach it.
- [ ] The teardown is reachable only after (i) a non-destructive `bootstrap` was
      attempted and refused **and** (ii) an independent `launchctl print` exited 0.
      A failure for any other reason returns false **without** touching the loaded
      record — the defect this WP closes. Bootout-first stays rejected (ADR-0018).
- [ ] Every argv is built from `process.getuid()` and a code-derived label, exactly
      as the heal path builds them today, and goes through the same `loader` seam →
      `schedulerSpawn`. No new argv shape, no new escaping site.
- [ ] The register no longer reads `state/scheduler-status.json` at all (Current
      state §9), so a user-editable plaintext file can no longer influence whether
      a registration is skipped.

## Acceptance criteria

**Preamble — a test that passes against unmodified `main` is not evidence.** Every
new test must be red before the fix and green after; every Table B row must be
demonstrated red. Every test injects `opts.loader` and `opts.platform` — **never**
mock `process.platform` — and no test may touch a real OS scheduler
(`WIENERDOG_TEST_NO_REAL_SCHEDULER` stays armed).

- [ ] **AC1 (Table A row 1 — replace, AND the marker ordering).** darwin,
      `changed` true, loader: the FIRST `print` exits 0, first `bootstrap`
      non-zero, rest 0, and the **trailing** `print` returns a record matching
      `expect`. Calls in order: `print` → `bootstrap` → `bootout` → `bootstrap` →
      **`print`** — the post-bootstrap verify, which is new in round 10, so every
      **successful** register now costs one extra read-only call on either path.
      Result `loaded: true`. **The FIRST `print`'s stdout MUST be pinned to a
      record that does NOT match canonical** (an OLD argv), so the replace path is
      genuinely reached, while the trailing one MUST match or the register would
      correctly report failure.
      **T1 additionally carries the Table A1 fixture, which flips a round-5
      assertion:** the same register with `changed = true` but a `print` stdout
      matching canonical **completely** (argv + calendar + env) must now
      **SKIP** — exactly one call, the `print`, zero mutating calls, `loaded:
      true`. A round-5 draft asserted the opposite ("must attempt") because the
      skip was gated on `!o.changed`; Table A1 deletes that gate, and this is the
      assertion that pins it. Add **Codex's fixture** alongside it: a register
      whose `changed` is true only because the **manifest entry is missing**, with
      the disk plist canonical and the loaded record a complete match ⇒ **zero
      mutating calls**, and the manifest entry is still recorded.
      **Additionally assert that `state/scheduler-status.json`
      already existed at the moment of the `bootout` call** (a loader that stats
      the file at every call and records the observation), which is ADR-0018
      decision 2's pre-destructive marker rule. **This assertion lives here and
      only here**: T1 is the *only* fixture in this WP that reaches a teardown, so
      an earlier draft that pointed the marker-ordering mutation at T2 could never
      have gone red — T2 asserts no `bootout` happens at all. (T1)
- [ ] **AC2 (Table A row 1 — the teardown guard).** darwin, `changed` true,
      loader: `print` **non-zero** (nothing loaded) and `bootstrap` non-zero (a
      transient / permissions / invalid-plist failure). Assert **no `bootout`
      appears in the call list at all**, and the result is `loaded: false`. This is
      the assertion that separates "already loaded" from "failed for another
      reason", and it is the one a register-path teardown was previously unable to
      make.
      **Second fixture — the ROLLBACK set (T2b), owner-directed.** `print` exits
      **0** (a healthy record IS loaded), `changed` is true, and **both** the first
      and the replacement `bootstrap` fail — an unbootstrappable replacement.
      Assert **all five** properties, not merely the loudness:
      (a) call order `print` → `bootstrap` → `bootout` → `bootstrap` →
      **`bootstrap` again** (the restore);
      (b) the file at `plistPath` holds the **prior** bytes after the call, byte
      for byte;
      (c) the restoring `bootstrap` targets that restored file, so the **prior**
      argv is what launchd is asked to load again;
      (d) the result is **`loaded: false`** and `repointSchedules` pushes §8's
      byte-exact notice — rollback restores scheduling, it does **not** make the
      replacement a success. **Table N row 4 — INHERITED (+2026-08-02): assert
      `loaded: false` only and add NO notice assertion to this fixture;** the
      notice is proved once per leg, at Table N rows 2 and 3;
      (e) with `priorBytes === null` (no plist existed) there is no restore attempt
      and the result is still `loaded: false`;
      (f) **the divergence case (CX-2)** — `changed === false` with the disk already
      canonical and the loaded record older: assert that the teardown still happens
      (the record is divergent and must be replaced), that the restore re-writes
      canonical (because `priorBytes === canonical` here), that the result is
      `loaded: false`, and that §8's notice fires. This fixture exists to pin the
      **bound**, not a recovery: it is the case where rollback provably cannot
      restore the destroyed record;
      (g) the restore's `bootstrap` itself fails ⇒ still `loaded: false`, no throw;
      (g1) **the binding fixture (T2g, CX15-1)** — any fixture that reaches the
      staleness guard must assert the helper call **does not throw**. The guard
      reads `o.canonicalBytes`, and an unbound reference raises `ReferenceError`
      **after** the `bootout` has already removed the schedule — the worst possible
      moment. Assert a normal `loaded: false` return, not an exception;
      (g2) **the interleaved fixture (T2f, CX14-2)** — this invocation writes its
      canonical bytes, a concurrent invocation then writes different bytes to the
      same path, and the teardown proceeds. Assert the staleness guard **declines**
      to restore (the file still holds the concurrent bytes, byte for byte), no
      restoring `bootstrap` is issued, the result is `loaded: false`, and §8's
      notice fires (**Table N row 4 — INHERITED (+2026-08-02)**: assert
      `loaded: false` only; add NO notice assertion to this fixture);
      (h) **the preflight rejects (T2c)** — `existsSync(PLUTIL)` true and the
      loader answers `{status: 1}` for `[PLUTIL,'-lint',plistPath]`, with a loaded
      mismatched record present ⇒ `loaded: false` and **no `bootout` anywhere**.
      Assert the argv carries the **absolute** `/usr/bin/plutil`;
      (i) **the linter is absent (T2d)** — `existsSync(PLUTIL)` stubbed **false**
      ⇒ **no `plutil` argv is issued at all** and the register proceeds to the
      normal replace path. Note the fixture must NOT model absence as a loader
      result: `schedulerSpawn` renders ENOENT as `{status:1}`, which is
      indistinguishable from a lint rejection, and modelling it that way is what
      made a round-8 draft's fail-open unreachable;
      (j) **the preflight passes (T2c)** — `existsSync` true, `{status: 0}` ⇒ the
      replace path proceeds exactly as AC1;
      (k) **the absent-label verify (T2e, CX9-1)** — `print` exits **non-zero**
      (nothing loaded), the initial `bootstrap` **succeeds**, and the trailing
      `print` returns a record that does **not** match `expect` (foreign bytes, or
      an unparseable readback) ⇒ **`loaded: false`** with §8's notice and **no
      `bootout`**. This is the branch a round-9 draft returned `true` from without
      any readback at all. Run it twice, once with a mismatching record and once
      with an unparseable one, since both must fail closed. **Table N row 4 —
      INHERITED (+2026-08-02): assert `loaded: false` only; add NO notice
      assertion to this fixture;**
      (l) the same shape but the trailing `print` **matches** ⇒ `loaded: true`,
      call order `print` → `bootstrap` → `print`.
      **Every fixture in this set pins `verdict === 'mismatch-fatal'`** — that is now the
      only verdict that reaches a teardown at all (Table A1), so a rollback fixture
      whose readback is unparseable would be testing an unreachable path.
      Fixtures (e), (f) and (g) are the executable form of the two bounded windows
      in Implementation notes property 5.
      A round-3 draft asserted only loudness here, because it accepted the
      destruction. The owner ruled otherwise; this fixture set is that ruling made
      executable. (T2, T2b)
- [ ] **AC3 (Table A row 1 — the verified skip).** darwin, `changed` false, six
      cases, each asserted on the recorded call list:
      (i) `print` exits 0 and the loaded argv equals canonical **element for
      element** ⇒ **zero mutating calls** and `loaded: true`;
      (ii) the record names a foreign launcher ⇒ attempted;
      (iii) the `arguments` block is unparseable, so `launchdLoadedArgs` returns
      `null` ⇒ attempted;
      (iv) `print` exits non-zero (nothing loaded) ⇒ attempted — **this case is
      also the crash-recovery criterion**: it is the state Current state §9 fact 3
      describes (a crash between a `bootout` and its replacement leaves the label
      absent), and it is what proves the new design recovers where the deleted
      cache-based one would have skipped forever;
      (v) **the stale-tail fixture** — same node and same launcher, but a different
      `--expect-digest` (the transition-era state D1 describes) ⇒ **attempted, not
      skipped**. This is the case a head-only comparison would skip forever;
      (vi) the loaded argv is a strict prefix of canonical (fewer elements) ⇒
      attempted;
      (vii) **the CX-1 regression fixture** — the argv matches **exactly** but the
      loaded `descriptor` block carries a different `Hour`/`Minute` ⇒ **attempted,
      not skipped**. This is the case a round-4 argv-only comparison skipped
      forever;
      (viii) the argv and calendar match but a canonical env pair is missing or
      differs ⇒ attempted;
      (ix) the argv and calendar match and every canonical env pair is present
      **alongside launchd's injected `OSLogRateLimit`/`XPC_SERVICE_NAME`** ⇒
      **skipped** — the containment semantics of Table A2, which set-equality
      would have broken;
      (x) any one of the three blocks is unparseable ⇒ attempted;
      (xi) **the catch-up shape (CX-2)** — a healthy unchanged catch-up entry whose
      loaded record carries `"Minute" => 0` and **no `Hour` key**, matched against
      `hour: null` ⇒ **skipped**: one `print`, zero mutating calls. Without this the
      catch-up leg loses its skip permanently and bootstraps on every sync;
      (xii) the same catch-up record but carrying `"Hour" => 0` ⇒ **attempted** —
      `hour: null` refuses a present key, because `Hour 0 + Minute 0` is daily at
      midnight while `Minute 0` alone is hourly at :00;
      (xiii) **the empty-value fixture (C2)** — a loaded record whose env carries
      `WIENERDOG_HOME` and `HOME` but **omits the five ambient-scrub keys** ⇒
      **attempted**. A parser that skipped valueless lines would have skipped here,
      granting a verified skip to a record with no scrub at all;
      (xv) `path` drift — the loaded record was read from a different plist file
      ⇒ attempted; (xvi) `program` drift ⇒ attempted; (xvii) either log path drifts
      ⇒ attempted; (xviii) `spawn type` is not `background` ⇒ attempted;
      (xix) **the extra-trigger fixture (CX10-1)** — argv, env, and the *first*
      calendarinterval trigger all match, but the record carries a **second**
      calendarinterval trigger ⇒ **attempted, not skipped**. Each of (xv)-(xix) is
      a **drift-only** test: every other compared field matches, so it fails for
      exactly the field named;
      (xx) **the foreign-stream fixture (CX11-2)** — the record carries our one
      canonical calendarinterval trigger **plus** a second trigger on a different
      stream ⇒ **attempted, not skipped**. A stream-filtered count sees 1 and would
      skip while the record fires on a condition we never registered;
      (xxi) any one of `path`/`program`/`stdout path`/`stderr path`/`spawn type` is
      **absent** from the record ⇒ verdict `'indeterminate'` ⇒ attempted, and
      **no `bootout`** — an unreadable field is not a divergent one;
      (xxii) **the benign-drift fixture (CX13-1)** — every FATAL field matches and
      only a BENIGN one differs (the loaded record's `stdout path` is the old one),
      `changed` is true, and the `bootstrap` fails because the label is loaded.
      Assert: verdict `'mismatch-benign'`, **no `bootout` anywhere in the call
      list**, the pre-existing record therefore still loaded, `loaded: false`, and
      §8's notice. **Table N row 2 — MUST ASSERT (+2026-08-02): this is the
      darwin leg's ONLY notice proof.** After the `registerPlatform` leg, drive
      `schedule.repointSchedules` over the same `paths`/`manifest`/loader and
      assert `r.notices.some((n) => /"dream".*did not accept it/.test(n))`,
      mirroring the pre-existing win32 fixture at `:1112`. A `registerPlatform`-
      only fixture proves `loaded: false` and nothing about the notice, because
      the notice's single push site is inside `repointSchedules` (Table N).
      Run the sibling too — the same shape with a **FATAL** field
      differing (a stale env binding) ⇒ verdict `'mismatch-fatal'` and the replace
      path IS taken — so the pair pins the tier boundary from both sides;
      (xiv) **the indeterminate fixture (CX-1)** — `print` exits **0** (a record IS
      loaded) but its stdout is degraded/truncated so a block fails to parse, and
      `changed` is true so the bootstrap is attempted and fails. Assert the verdict
      is `'indeterminate'`, the result is `loaded: false`, and **no `bootout`
      appears anywhere in the call list**. Parse degradation must never destroy a
      possibly-healthy record.
      **Call-count scoping (do not over-claim):** case (i) asserts zero *mutating*
      calls and exactly one `print` **from the per-job helper**. It is **not** one
      `print` per `registerPlatform` call — `registerPlatformEntries` registers the
      per-job entry and then calls `ensureCatchup` (`schedule.js:435`), which
      performs its **own** readback under D3. A full darwin `registerPlatform` on
      an unchanged healthy install therefore issues **two** read-only `print`s and
      zero mutating calls. Assert per helper, or assert two through the full path —
      never "exactly one" through the full path.
      **These two counts are NOT affected by round 10's post-bootstrap verify**, and
      the reason is worth stating rather than leaving to inference: the verify fires
      only after a **successful bootstrap**, and the verified-skip path never
      reaches a bootstrap at all. Counts that move are the *register* paths (AC1,
      AC2 case l), each of which gains one trailing `print`. (T3)
- [ ] **AC4 (Table A row 2).** The catch-up entry goes through the same helper:
      AC1's replace ordering and AC2's teardown guard both hold for
      `ai.wienerdog.catchup`. (T4)
- [ ] **AC5 (Table A row 3 + the per-platform idempotence contract).**
      (i) linux, degraded reload (`{status:1}`) with a successful `enable --now` ⇒
      `loaded: false` (on `main`: `true`), and `repointSchedules` pushes §8's
      byte-exact notice; `{status:null}` and a missing result also count as
      failure. **Table N row 3 — MUST ASSERT (+2026-08-02): T5 must DRIVE
      `schedule.repointSchedules(…, { platform: 'linux' })` with the degraded-
      reload loader and assert the notice regex**, mirroring the pre-existing
      win32 fixture at `:1112`. This is the linux leg's only notice proof; the
      `registerPlatform`-only form asserts `loaded: false` and nothing more. (T5)
      (ii) linux, `changed` false ⇒ the reload **and** `enable --now` still run —
      exactly those two `systemctl` calls and no others. (T6)
      (iii) the shipped invariant tests at `:389-397` **and `:1019-1030`** stay
      green under their rewritten contracts (**Table E rows 4 and 5** — the second
      of those was added 2026-08-02; `repointSchedules` is the second unchanged-
      register surface and the recount below applies to it identically), and are
      the per-platform statement of Table
      A's third column, **recounted from the Table A1 decision tree**: darwin ⇒
      **two** read-only `print`s (per-job + catch-up, per AC3's call-count scoping)
      and **zero** mutating calls — and this now holds whether `changed` is false
      **or** true, since the live match wins either way, which is the property
      Codex's missing-manifest-entry fixture pins; linux ⇒ exactly
      `daemon-reload` + `enable --now`, both idempotent.
- [ ] **AC6 (the existing-assertion change set — FIVE sites, plus one authorized
      setup-only swap; amended 2026-08-02). Canonical: Table E.** Every changed
      site and every authorized setup-loader swap in
      `tests/unit/scheduler-schedule.test.js` is enumerated in **Table E** and in
      no other place; this criterion does not restate them, because a restated
      canonical is how the earlier "exactly FOUR" survived un-updated while the
      branch carried five. Assert against Table E:
      1. **exactly the five rows of Table E** change an assertion — no existing
         assertion outside them may be edited, and `:982` (the heal path) is not
         among them;
      2. **exactly the sites listed in Table E's authorization block** have their
         setup loader swapped from `() => ({ status: 0 })` to `fakeLaunchd(paths)`,
         and **no assertion changes at any of them** beyond Table E rows 1, 4 and 5;
      3. every other `{ status: 0 }` loader named in that block's
         stays-unchanged list is untouched.
      **The round-1 review's finding 3 is what this criterion now records:** the
      fifth site (Table E row 5, the `repointSchedules` no-op) and the ten-site
      swap were **forced** — the swap is a setup-time collision of the same class
      as D6, and row 5 is the direct consequence AC5(iii) already documented at
      the second unchanged-register surface. They were reported honestly by the
      implementer; the spec, not the implementation, was wrong.
- [ ] **AC7 (Table A row 4 — Windows preservation).** `ensureWindowsTaskRegistered`
      and `windowsLoadedTaskMatches` are unchanged and absent from the diff (V5);
      the existing Windows registration assertions pass unmodified.
- [ ] **AC8 (the pre-destructive marker, ADR-0018 decision 2).** Two halves, each
      with the fixture that can actually detect it:
      **ordering** — the status file exists at the moment of the `bootout`, in
      **T1**, the only fixture that reaches a teardown (asserted as part of AC1);
      **non-firing** — it is **not** written on a verified skip (**T3** case (i))
      or on a path where no teardown occurs (**T2**).
      An earlier draft assigned the ordering half to T2 + T3, neither of which ever
      calls `onBeforeTeardown` — so that half had no detector at all.
- [ ] **AC9 (no daemon, no new dependency).** The diff introduces no
      `setInterval`, no `setTimeout`, no new top-level `require`, and no
      `package.json` change (V4).
- [ ] **AC11 (D5 — the CLI entry point obeys the postcondition).** `add()` throws
      whenever `loaded` is false, **regardless of `changed`**, and must never print
      `"<name>" already scheduled at <at> — unchanged.` over an unloaded outcome.
      Two CLI-path fixtures, one per fixed leg, both with `changed === false`:
      (i) darwin — the readback mismatches, the register is attempted and fails;
      (ii) linux — the hoisted `daemon-reload` is degraded so `loaded` is false.
      Assert the throw in both, and assert the "already scheduled" string is
      **absent** from stdout. (T7)
      The other two `registerPlatform` callers are already conforming and must stay
      unmodified: `ensureDreamSchedule` (`:823`) and `repointSchedules` (`:583`)
      both branch on `!res.loaded` unconditionally.
- [ ] **AC10 (mutation matrix).** Every Table B row demonstrated red; output pasted.
- [ ] **AC12 (D6 — the NOOP boundary collision, added 2026-08-02).** In
      `tests/unit/init.test.js`, the single test
      `init --fresh-vault schedules the nightly dream and surfaces it (ADR-0014)`
      branches on `process.platform === 'darwin'`: darwin asserts the
      `load-failed` notice is present **and** that `/catches up automatically/i`
      is **absent**; every other platform asserts the reassurance as before. The
      unconditional `/dreaming/i` and the three config assertions are unchanged,
      and no other test in the file is touched. `src/scheduler/spawn.js` is
      **not** in the diff — the seam is never taught to fabricate a readback
      (D6's rejected alternative). Full `npm test` is green (V8).

### Test index

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/scheduler-schedule.test.js | darwin replace ordering + `loaded` (AC1) |
| T2 | tests/unit/scheduler-schedule.test.js | teardown guard — no `bootout` when nothing is loaded; marker ordering and non-firing (AC2, AC8) |
| T3 | tests/unit/scheduler-schedule.test.js | the verified skip, **cases (i)-(xxi)** — the stale-tail, length-mismatch and crash-recovery fixtures; the catch-up `hour:null` shape and its present-`Hour` refusal; the empty-env fixture; the indeterminate fixture; the five round-11 drift-only fixtures (`path`, `program`, log paths, `spawn type`); the extra-trigger and foreign-stream trigger fixtures; and the absent-field ⇒ `'indeterminate'` fixture. Marker non-firing (AC3, AC8). **Case (xxii) additionally carries Table N row 2 — the darwin leg's §8-notice assertion, driven through `repointSchedules` (+2026-08-02)** |
| T2b | tests/unit/scheduler-schedule.test.js | the rollback set — restore file + re-bootstrap prior argv + `loaded:false` + notice + the `priorBytes === null` bound (AC2) |
| T2c | tests/unit/scheduler-schedule.test.js | the `plutil` preflight — rejects (no `bootout`, absolute argv) and passes (AC2 h, j) |
| T2d | tests/unit/scheduler-schedule.test.js | `existsSync(PLUTIL)` false ⇒ no `plutil` argv issued, register proceeds (AC2 i) |
| T2f | tests/unit/scheduler-schedule.test.js | the interleaved-write fixture — the rollback's staleness guard declines to overwrite a concurrent invocation's newer bytes (AC2 g2) |
| T2g | tests/unit/scheduler-schedule.test.js | the binding fixture — a rollback reaching the staleness guard must NOT throw (`o.canonicalBytes` is bound at both call sites); asserts a normal `loaded:false` (AC2 g1) |
| T2e | tests/unit/scheduler-schedule.test.js | **the post-bootstrap verify on the ABSENT-label path (CX9-1)** — bootstrap succeeds, trailing `print` mismatched or unparseable ⇒ `loaded:false`, no `bootout`; and the matching case ⇒ `loaded:true` (AC2 k, l) |
| T4 | tests/unit/scheduler-schedule.test.js | catch-up through the same helper (AC4) |
| T5 | tests/unit/scheduler-schedule.test.js | linux degraded reload ⇒ `loaded:false` + notice; null/missing results (AC5 i). **The "+ notice" half is Table N row 3 and must be DRIVEN through `repointSchedules`, not inferred from `registerPlatform` (+2026-08-02)** |
| T6 | tests/unit/scheduler-schedule.test.js | linux unchanged bytes still reload + enable, exactly two calls (AC5 ii) |
| T7 | tests/unit/scheduler-schedule.test.js | **CLI path** — `add()` throws on an unloaded outcome for an UNCHANGED entry, on both legs: unchanged-darwin readback-mismatch-then-failure, and unchanged-linux degraded reload (AC11) |
| T8 | tests/unit/init.test.js | **(+2026-08-02)** the D6 boundary collision — a REAL `init --fresh-vault` subprocess under `WIENERDOG_LOADER_NOOP=1` must not claim catch-up on the darwin leg, where nothing was verified (AC12). **Not a new test and not a `verified-register:` subtest** — one existing assertion in an existing test, so the naming rule below does not apply to it. |

Name every subtest with the prefix `verified-register:` followed by one space.
(T8 is exempt — see its row.)

**Every T-test in `tests/unit/scheduler-schedule.test.js` drives `registerPlatform`
/ `ensureCatchup` behaviorally with an
injected loader** (T8 is in a different file and drives a real subprocess — see its
row). The two new helpers are non-exported and must **not** be
exported to make them testable — that would widen the module surface to serve a
test. Each assertion reads the recorded loader call list, which is the artifact
that says what the OS was actually asked to do.

## Verification steps (run these; paste output in the PR)

```bash
git fetch origin main --quiet

# V1 (PRESERVATION of `fail 0`; its `pass` count feeds V2).
npm test -- tests/unit/scheduler-schedule.test.js tests/unit/scheduler-status.test.js \
            tests/unit/scheduler-entry-identity.test.js
# Record the `ℹ tests`, `ℹ pass` and `ℹ fail` lines. `ℹ fail` must be 0.

# V2 (CHANGE — anti-vacuity; judged by reading). REQUIRED: >= 6.
npm test --silent -- --test-reporter=tap tests/unit/scheduler-schedule.test.js \
  | grep -cE "^ok [0-9]+ - verified-register: "
# on main: 0.

# V3 (AC6 / Table E — MECHANICAL, because it greps the assertion BODY. A count of
#     changed `test(` declaration lines cannot see an edited body under an
#     unchanged name, which is why that form was dropped.)
grep -c "stays gated only on" tests/unit/scheduler-schedule.test.js
# on main: 2 (the two linux `loaded === true` assertions, Table E rows 2 and 3).
# REQUIRED after: 0.
#
# Table E rows 4 and 5 are the two renames; both must have landed:
grep -c "no MUTATING OS call" tests/unit/scheduler-schedule.test.js
# on main: 0. REQUIRED after: >= 4 — each of the two renamed test titles plus
# each row's new non-mutating assertion message.
#
# Then paste the FULL diff of the file and confirm BY READING that it touches
# only (a) **Table E's five assertion rows**, (b) **Table E's authorized
# setup-only `fakeLaunchd` swap at exactly the sites its authorization block
# lists** — with no assertion changed at any of them beyond rows 1, 4 and 5 —
# and (c) the new T1/T2/T2b/T2c/T2d/T2e/T2f/T2g/T3/T4/T5/T6/T7 blocks and the
# helpers they add. There is no grep that proves "nothing else moved" in a JS
# file — this repo has no parser. **Table E is the contract**; the full diff is
# the evidence. (Amended 2026-08-02: this instruction previously said "AC6's
# four enumerated sites", which the branch contradicted at five.)
git diff origin/main...HEAD -- tests/unit/scheduler-schedule.test.js

# V4 (AC9 — no daemon, no new top-level require; judged by reading).
git diff origin/main...HEAD -- src/cli/schedule.js | grep -E "^\+" \
  | grep -nE "setInterval|setTimeout|^\+const .* = require\(" \
  || echo "OK: no timer and no new top-level require"

# V5 (AC7 — Windows leg untouched; judged by reading). COMMENT-TOLERANT, and
#     that is required, not a convenience (amended 2026-08-02, round-1 finding 2):
#     the JSDoc this spec MANDATES for `ensureDarwinEntryRegistered` contains the
#     literal "Mirrors ensureWindowsTaskRegistered" (see "Exact contracts"), so
#     the bare form failed on a branch that followed the spec exactly. The fix is
#     to narrow the grep to FUNCTIONAL references; the contract JSDoc must NOT be
#     reworded to dodge a grep.
git diff origin/main...HEAD -- src/cli/schedule.js \
  | grep -E "^[-+]" \
  | grep -vE "^[-+][[:space:]]*(\*|//|/\*)" \
  | grep -nE "ensureWindowsTaskRegistered|windowsLoadedTaskMatches" \
  || echo "OK: no functional reference to the Windows registration path is in the diff"
# The middle filter drops added/removed lines whose first non-blank character
# starts a comment (` * `, `//`, `/*`) — i.e. prose. A real edit to the Windows
# leg is a code line and still fails the check.

# V6 (Current state §9 — the register must not read the durable status cache).
git diff origin/main...HEAD -- src/cli/schedule.js | grep -nE "^\+.*readSchedulerStatus" \
  || echo "OK: the register path does not read the durable status cache"

# V6b (CX-1 — the verified skip must compare the COMPLETE argv, not the head).
grep -n "launchdLoadedArgs" src/scheduler/generators.js src/cli/schedule.js
# REQUIRED after: the definition + its internal use + the new module.exports line
# in generators.js, AND at least one FUNCTIONAL use (`gen.launchdLoadedArgs(`) in
# schedule.js. If schedule.js instead CALLS `loadedEntryTargets`, the head-only
# comparison was reintroduced. COMMENT-TOLERANT, and required to be (amended
# 2026-08-02, round-1 finding 2): this spec's own mandated JSDoc for
# `darwinLoadedVerdict` says the verdict vocabulary is "adopted verbatim from
# `loadedEntryTargets`" (see "Exact contracts"), so the bare form drove the FAIL
# branch on a branch that followed the spec exactly. Narrow the grep; do NOT
# reword the contract JSDoc to dodge it.
grep -nE "loadedEntryTargets" src/cli/schedule.js \
  | grep -vE "^[0-9]+:[[:space:]]*(\*|//|/\*)" \
  && echo "FAIL: the register path is comparing positions, not the full argv" \
  || echo "OK: the register path does not use the two-position comparison"
# The filter drops lines whose first non-blank character starts a comment. Any
# real reference — `gen.loadedEntryTargets(…)`, or a destructuring import — is a
# code line and still trips the FAIL branch. `schedule.js` reaches generators
# only through `const gen = require('../scheduler/generators')` (`:11`), so a
# functional use cannot be written without a code line naming the symbol.
# on main, executed: command 1 prints TWO lines from generators.js —
#   679:function launchdLoadedArgs(stdout) {
#   787:      const args = launchdLoadedArgs(stdout);
# and NOTHING from schedule.js (the symbol is absent there, and unexported).
# Command 2 prints nothing and takes the `||` branch, so the OK line is the
# baseline and the FAIL branch is reachable only by regression.

# V8 (AC12 / D6 — the NOOP boundary collision, added 2026-08-02).
node tests/run.js tests/unit/init.test.js
# REQUIRED: `ℹ fail 0`. On this branch BEFORE the D6 fix: fail 1, at
# tests/unit/init.test.js:125 — /catches up automatically/i did not match.
#
# The seam is never taught to fabricate a readback — spawn.js must stay out of
# the diff (D6's rejected alternative):
git diff --name-only origin/main...HEAD | grep -x "src/scheduler/spawn.js" \
  && echo "FAIL: the NOOP seam was edited — see Implementation notes D6" \
  || echo "OK: src/scheduler/spawn.js is not in the diff"
#
# The assertion is platform-aware, and the darwin leg asserts the NEGATIVE (the
# tripwire against option (b)). Both must be present:
grep -n "did not accept it yet" tests/unit/init.test.js
grep -n "doesNotMatch(r.stdout, /catches up automatically/i)" tests/unit/init.test.js
# REQUIRED: one hit each, both inside the `process.platform === 'darwin'` branch
# of `init --fresh-vault schedules the nightly dream and surfaces it (ADR-0014)`.
# on main: 0 hits each.

# V9 (Table N rows 2-3 — §8's notice is asserted on BOTH fixed legs; the
#     round-1 finding-1 ruling, added 2026-08-02).
grep -n "did not accept it" tests/unit/scheduler-schedule.test.js
# on main, executed: exactly ONE hit — `:1112`, the pre-existing win32 fixture
# (Table N row 1), which is the only leg this WP does not change.
# REQUIRED after: exactly THREE hits — row 1, plus one inside T3 case (xxii)
# (darwin) and one inside T5 (linux). Then confirm BY READING that each of the
# two new hits sits in a block that calls `schedule.repointSchedules(`: §8's
# notice has exactly one push site (`schedule.js:583`), inside repointSchedules,
# so a `registerPlatform`-only fixture cannot reach it and a notice assertion
# placed anywhere else is testing a string it never produced.

# V7 — the boundary gate and the pipeline.
# Feed boundary-check the REAL diff, never a hand-maintained list. A list typed
# into a verification command drifts from the branch and hides exactly the file
# the gate exists to catch (that is how docs/adr/README.md went unlisted).
node scripts/boundary-check.js docs/specs/WP-scheduler-register-replaces-loaded-record.md \
  $(git diff --name-only origin/main...HEAD)
npm run lint
npm test
```

## Discovered issues (reported, not fixed)

- **`state/locks` is named but ownerless.** `src/scheduler/launcher.js:533` re-asserts
  the bound home so nothing can "relocate its state/locks/logs", yet **nothing in
  `src/` reads or writes a `state/locks` path** — grepped in round 9: the only lock
  in the tree is `src/core/dream/lock.js` (`state/dream.lock`), which serializes
  dream runs under ADR-0012 and is a different lifecycle. So the launcher defends a
  directory no component owns. This is recorded **as its own entry**, independent of
  `WP-scheduler-register-serialization`: if that WP is never written, or is written
  without touching `state/locks`, this fact must still survive. It is either a
  vestigial reference to be removed or an unimplemented concept to be built, and
  deciding which is out of scope here.

## Out of scope (do NOT do these)

- **A systemd loaded-unit readback.** Table A row 3 explains why it is not
  specified here. Routed as **`WP-systemd-loaded-unit-readback`**; it would also
  close `WP-scheduler-entry-identity`'s Residual 1 and would let row 3 gain a skip
  clause.
- **Substitution-resistance of the executed BINARY** — a record whose argv is
  byte-equal to canonical but whose node/launcher *file* was replaced. The argv
  tail (`--descriptor`, `--expect-digest`) **is** compared and has been since
  round 3, so the round-2 phrasing of this entry was stale; what remains for that
  sibling is binary identity, not argv identity —
  `WP-scheduler-argument-tail-identity`.
- **Making the execution position *comparable*** against substitution —
  `WP-scheduler-stable-exec-position`.
- **Editing `darwinReplaceEntry`, `reloadJob`, `repairCatchup`, the heal path,
  `schedule.js:777`, or any notice string.**
- **Editing `docs/adr/0018-…`** (owner-signed; ADR-0037 amends it) or
  **`docs/specs/WP-scheduler-node-path-durability.md`** (its DoD 0b is actioned
  there).
- **`refreshSchedulerStatus` returning a persistence result** —
  `WP-scheduler-status-write-observable`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Every Table B row demonstrated red (with the "selected exactly one named
   subtest" assertion) and the tree restored afterwards.
3. Conventional commits; PR titled
   `fix(scheduler): verify what the OS holds before reporting a register success (WP-scheduler-register-replaces-loaded-record)`.
4. PR template filled, including "Decisions made" and `Generated-by:`.
5. **Cross-spec obligation.** The PR body states that Table A rows 1, 2 and 3 are
   `WP-scheduler-node-path-durability`'s Table C row 5 (**both** macOS sites) and
   row 4, satisfying that spec's Definition of done item **0a**, so its item **0b**
   becomes actionable — in that spec's own PR, never from this branch.
6. **OWNER GATE — ADR-0037 ratification.** ADR-0037 amends owner-signed ADR-0018
   decision 2 and is `Proposed` with no signature. The owner ratifies it at or
   before this WP's merge. The implementer must not add the token.
7. This spec's `status:` flipped to `In-Review` in the same PR.
