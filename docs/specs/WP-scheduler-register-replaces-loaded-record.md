---
id: WP-scheduler-register-replaces-loaded-record
title: A register that cannot verify what the OS now holds must not report success
status: Draft
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
That is ADR-0037 (Proposed, unsigned — see "ADR-0037 is not signed"), which amends
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
force-registers. **This is the reference implementation both other legs are now
shaped to.** Note what its verified skip costs: one read-only `schtasks /query`.
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
one new Proposed ADR, one test file extended. **M** — one session.

| Action | Path | Notes |
|--------|------|-------|
| create | docs/adr/0037-verified-registration-postcondition.md | The rule + the ADR-0018 decision-2 amendment. **Proposed, unsigned.** Written already by the architect, together with its `docs/adr/README.md` index row; the implementer edits neither. **0036 is deliberately skipped** — reserved by the in-flight ADR amending ADR-0031. |
| modify | src/scheduler/generators.js | **D0** — add **two** names to `module.exports`: `launchdLoadedArgs` (`:679-689`, used internally at `:787`) **and** `jobLaunchArgs` (`:208`, used internally at `:355`). **Those two lines are the entire change**; neither function body is touched. Structural, not an API promise — the WP-114 precedent for `repairCatchup`. Audited, not assumed (see "Export audit" in Implementation notes): `catchupLaunchArgs` (`:1030`) and `loadedEntryTargets` (`:1007`) are **already** exported and need no change. |
| modify | src/cli/schedule.js | **D1-D4**: `darwinLoadedMatches` + `ensureDarwinEntryRegistered` (new, non-exported); the darwin per-job arm (`:429-431`, Table A row 1); `ensureCatchup` (`:314-317`, row 2); the linux arm (`:456-466`, row 3). Nothing else — no probe, no heal, no notice string, no Windows path, and **`darwinReplaceEntry` itself is not edited** (it stays the heal path's primitive). |
| modify | tests/unit/scheduler-schedule.test.js | **T1, T2, T2b, T3-T7** (Test index) plus the **four** existing assertions enumerated in AC6 — no others. |

Not deliverables, deliberately: `src/scheduler/status.js`,
`src/scheduler/generators.js` (`loadedEntryTargets` is consumed, not changed),
`src/scheduler/launcher.js`, `src/cli/sync.js` (§10), `src/cli/doctor.js`,
`docs/adr/0018-windows-scheduled-dreaming.md` (owner-signed; ADR-0037 amends it
from a new file — never edit it),
`docs/specs/WP-scheduler-node-path-durability.md` (see the banner),
`docs/GLOSSARY.md`.

### Exact contracts

```js
/**
 * Does a LOADED launchd record match what we would register right now? Pure
 * string work over `launchctl print` stdout — no spawn, no fs, never throws.
 * Compares the COMPLETE argv, element by element, against the canonical
 * ProgramArguments we just rendered — not merely the node and launcher
 * positions. A null (unparseable) block, a length difference, or any element
 * mismatch returns FALSE: an unparseable readback is not evidence, and a
 * partial match is not a match.
 * @param {string} stdout  `launchctl print` output (untrusted display text)
 * @param {string[]} expectArgv  the canonical ProgramArguments just rendered
 * @returns {boolean}
 */
function darwinLoadedMatches(stdout, expectArgv)

/**
 * Register one launchd entry, reporting success only from evidence about what
 * launchd now holds (ADR-0037). Mirrors ensureWindowsTaskRegistered. ONE
 * `launchctl print` serves both decisions: whether a verified skip is allowed,
 * and whether a teardown is justified.
 * @param {(argv:string[])=>{status:number,stdout?:string}} loader
 * @param {number} uid @param {string} label @param {string} plistPath
 * @param {{changed:boolean, expectArgv:string[], priorBytes:Buffer|null, onBeforeTeardown:()=>void}} o
 * @returns {boolean} true only when launchd verifiably holds this entry
 */
function ensureDarwinEntryRegistered(loader, uid, label, plistPath, o)
```

`ensureDarwinEntryRegistered`'s body, stated as the contract (Table A rows 1-2):

```js
  const printed = loader(['launchctl', 'print', `gui/${uid}/${label}`]);
  const isLoaded = !!printed && printed.status === 0;
  // (a) verified skip — unchanged bytes AND the live record matches canonical
  if (!o.changed && isLoaded && darwinLoadedMatches(printed.stdout || '', o.expectArgv)) return true;
  // (b) non-destructive attempt first (ADR-0018 ordering, preserved)
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return true;
  // (c) TEARDOWN ONLY WITH INDEPENDENT EVIDENCE THE LABEL IS LOADED
  if (!isLoaded) return false;
  o.onBeforeTeardown();                       // ADR-0018 marker (advisory — see below)
  loader(['launchctl', 'bootout', `gui/${uid}/${label}`]);
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return true;
  // (d) ROLLBACK — the replacement is unbootstrappable; restore the prior
  //     registration so no destruction window ships. Never returns true.
  if (o.priorBytes !== null) {
    try { fs.writeFileSync(plistPath, o.priorBytes); } catch { return false; }
    loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
  }
  return false;
```

## Contract reference

**Activation (ADR-0031, 2-of-7): three triggers fire.** (iv) fallback/precedence
behavior changes — what gates a reported success, and when an OS call may be
skipped; (v) the task crosses an authority boundary — the register emits a success
verdict whose subject is state the OS owns; (vii) the same rule is mirrored across
three platform legs, the Deliverables cells, the acceptance criteria and the ADR.

Per the A1 rule set — cited as **proposed, not in force** — each table row is one
gate with one fixture and one mutation, and Table B keeps trigger separate from
patch with no ordinals.

### Table A — the verified-registration postcondition, per platform (canonical)

`changed` is `ensureEntry`'s byte verdict. "Reports success" is the `loaded` value
reaching `repointSchedules` (`schedule.js:583`). **"Verified skip" means zero
MUTATING calls and one read-only readback** — the cost Windows has always paid.

| # | Platform / site | Verified skip allowed when | Mutating call gated on | Teardown allowed when |
|---|-----------------|----------------------------|------------------------|-----------------------|
| 1 | darwin per-job (`:429-431`) | `!changed` **and** `print` exits 0 **and** the loaded record's **COMPLETE argv** equals the canonical `ProgramArguments` (element-by-element) | `ensureDarwinEntryRegistered` — the final `bootstrap` | **only** when that same `print` exited 0 — independent evidence the label is loaded |
| 2 | darwin catch-up (`:314-317`) | same, label `ai.wienerdog.catchup`, canonical argv from `catchupLaunchArgs` | same | same |
| 3 | linux (`:456-466`) | **never** — see below | `reloadOk && enableOk`, reload hoisted OUT of `if (changed)` | n/a — no teardown on this leg |
| 4 | win32 (`:240-245`) | unchanged — `windowsLoadedTaskMatches` | unchanged | n/a |

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

### Table B — Mutation checks

One behavior per row; **Trigger** names the guarantee destroyed, **Patch** is the
edit. No ordinals. Assert the pattern selected exactly one named subtest.

The darwin rows were **re-derived as one unit** — twice: after the full-argv
comparison landed, and again after the owner-directed rollback amendment. Not
adjusted row by row. The skip gate is three independent conditions, each with its
own row so no mutation removes two at once; step (d)'s four properties each have
their own row; and each row names the fixture that provably executes the mutated
branch (the recurring failure mode in this chain — see the gate-3 row).

| Trigger (guarantee destroyed) | Patch | Test that must go RED |
|-------------------------------|-------|-----------------------|
| darwin register cannot replace a loaded record | drop the teardown branch from `ensureDarwinEntryRegistered` | T1 |
| darwin tears down without evidence the label is loaded | change the teardown guard to `if (false) return false;` — always tear down after a failed bootstrap | T2 |
| the pre-destructive marker stops preceding the teardown | move `onBeforeTeardown()` below the `bootout` | **T1** — it is the only fixture that reaches a teardown |
| darwin skips regardless of what is loaded (gate 1: `isLoaded`) | change the skip clause to `if (!o.changed && darwinLoadedMatches(…)) return true;` — drop the `isLoaded` conjunct | T3 case (iv) |
| darwin skips regardless of the record's content (gate 2: the comparison) | change the skip clause to `if (!o.changed && isLoaded) return true;` — drop the comparison | T3 cases (ii), (iii), (v) |
| darwin skips a changed file (gate 3: `!o.changed`) | drop the `!o.changed` conjunct | **T1** — **only because AC1 pins T1's `print` stdout to a record whose argv equals the NEW canonical** (see AC1). With an unpinned or stale stdout the comparison fails anyway and the mutated clause is false regardless, so the row would be vacuous — the RB1 finding |
| rollback does not restore the prior plist | delete the `fs.writeFileSync(plistPath, o.priorBytes)` line from step (d) | T2b |
| rollback restores the file but not the record | delete the trailing `bootstrap` from step (d) | T2b |
| rollback reports the failed replacement as success | make step (d) `return true` after a successful restore-bootstrap | T2b |
| the prior bytes are captured after the overwrite | move the `priorBytes` read below `ensureEntry` | T2b (the restored bytes become the new plist, so the prior argv is never re-bootstrapped) |
| `add()` reports success for an unloaded unchanged entry | restore the `changed &&` conjunct at `schedule.js:882` | T7 |
| darwin compares only the head of the argv — the round-2 defect | make `darwinLoadedMatches` compare only `argv[0]` and `argv[1]` | **T3 case (v)** — the stale-tail fixture |
| darwin trusts an unparseable readback | make `darwinLoadedMatches` return `true` when `launchdLoadedArgs` returns `null` | T3 case (iii) |
| darwin accepts a length-mismatched argv | drop the length check, comparing only the elements `expectArgv` indexes | T3 case (vi) |
| darwin catch-up keeps the bare bootstrap | revert `ensureCatchup` to the `loader([… 'bootstrap' …])` call | T4 |
| a degraded linux reload is reported as success | revert to `loaded = enableOk` | T5 |
| a degraded linux reload is never retried | move the reload block back inside `if (changed)` | T6 |
| windows stops verifying before skipping | delete the `windowsLoadedTaskMatches` call | AC7's preservation assertion |

### Mirrored Surface Checklist

Tables A and B are the single place these facts are decided. Registered mirrors —
**including all three Deliverables cells**, which are the permission boundary the
implementer reads first (the lesson from `WP-scheduler-node-path-durability`
rounds 2-3, where an unregistered Deliverables cell shipped a wrong test set):

- [ ] **(+r3)** Deliverables cell for `src/scheduler/generators.js` (D0 — the `launchdLoadedArgs` export the full-argv comparison rests on)
- [ ] Deliverables cell for `src/cli/schedule.js` (the four D-sites — Table A rows 1-3)
- [ ] Deliverables cell for `tests/unit/scheduler-schedule.test.js` (T1-T6 + AC6's four assertions)
- [ ] Deliverables cell for `docs/adr/0037-…` (the rule — Table A's spine)
- [ ] "Exact contracts" — both JSDoc blocks and the `ensureDarwinEntryRegistered` body
- [ ] Current state §2 (rows 1-2), §3 (the teardown guard), §4 (row 3), §6 (row 4), §7 (the readback machinery + the measured exit codes), §9 (why not a cache)
- [ ] **(+r4)** Implementation notes → D5 (`add()`'s guard) and AC11 — the CLI-surface mirror of ADR-0037's postcondition
- [ ] **(+r4)** ADR-0037's Consequences — the rollback consequence and the withdrawn crash-marker promise both mirror this spec's rollback section
- [ ] Implementation notes → Export audit, D0-D5, and **"Rollback — OWNER-DIRECTED"** (its four contract properties + the crash-window table)
- [ ] Acceptance criteria AC1-AC5 (rows 1-3), AC2's rollback set, AC6 (the four changed assertions), AC7 (row 4 preservation), AC8 (the marker), AC11 (D5)
- [ ] Verification commands V2-V6
- [ ] Table B rows, each naming its Table A row
- [ ] Test index rows T1, T2, T2b, T3-T7
- [ ] The banner's cross-spec mapping table — **both** macOS sites map to that spec's Table C row 5
- [ ] Definition of done items 5 (that spec's 0a) and 6 (the ADR signature gate)

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

`launchdLoadedArgs` and `jobLaunchArgs` are **absent** — both are defined and used
internally but never exported, so both would be `undefined` at the call site D2
specifies. That is what D0 fixes, and why D0 exports **two** names rather than one.
"The function exists" is not "the function is reachable".

### D1 — the two new helpers in `src/cli/schedule.js`

Both non-exported, defined near `darwinReplaceEntry`. `darwinLoadedMatches` calls
`gen.launchdLoadedArgs(stdout)` (exported by D0) and returns true only when the
result is non-null, has the same length as `expectArgv`, and is equal
element-by-element. `null` (an unparseable `arguments = { … }` block), a length
difference, or any mismatched element returns **false** — the fail-safe direction
is to attempt, never to skip.

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
changes, `expectArgv` must change with it — they are one contract. Build `expectArgv`
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
      expectArgv: [node, ...gen.jobLaunchArgs({ launcher: b.launcher, name: o.name, descriptor: b.descriptor, expectDigest: b.expectDigest })],
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
expectArgv: [node, ...gen.catchupLaunchArgs({ launcher, expectDigest, jobDigests })]
```

Return `{ loaded: … }` as today.

**Reuse the values already computed for `gen.catchupPlist(…)` a few lines above —
do not re-call `gen.nodePath()` or `launcherPathFor(paths)`.** D2 already does this
correctly with its local `node`. Hoist the catch-up node/launcher/digest values
into `const`s and pass the same ones to both the renderer and `expectArgv`, so the
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
postcondition violated at the one surface a human reads directly, and after D2-D4
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
   back to `plistPath`, then `bootstrap` that restored file. Restoring only the
   file would leave the label absent; restoring only the record is impossible.
2. **The register still reports `loaded: false` and fires §8's notice.** Rollback
   restores *scheduling*; it does not make the new registration a success. Step (d)
   can never `return true` — that is the point of its placement after the final
   `bootstrap` check, and Table B has a mutation row for it.
3. **Convergence.** After a rollback the disk holds the **prior** plist, so the
   next register renders canonical bytes that differ from it, `ensureEntry` returns
   `changed = true`, no verified skip is possible, and the replacement is retried.
   The loop terminates when either the replacement becomes bootstrappable or the
   user acts on the notice. It does not spin silently: the notice fires on every
   attempt.
4. **Crash windows under the NEW protocol, enumerated — every one recovers via the
   readback, none via the marker.** Each was traced against the measured exit codes
   (§7: `0` loaded, `113` absent):

   | Crash point | Disk holds | Label | Next register sees | Outcome |
   |---|---|---|---|---|
   | after `bootout`, before the final `bootstrap` | NEW plist | absent | `changed=false`; `print` → 113 ⇒ `isLoaded` false ⇒ **no skip** (gate 1) ⇒ `bootstrap` | recovered |
   | **after restore-file, before re-`bootstrap`** | PRIOR plist | absent | canonical ≠ prior ⇒ `changed=true` ⇒ no skip ⇒ `print` → 113 ⇒ `bootstrap` of the freshly written canonical | recovered |
   | after `ensureEntry`'s write, before `print` | NEW plist | OLD record | `changed=false`; `print` → 0 but the loaded argv is the OLD one ⇒ comparison fails ⇒ attempt | recovered |

   **The one irreducible window**, stated rather than hidden: if `priorBytes` is
   `null` — the plist did not exist when the register began — there is nothing to
   restore, so a teardown followed by a failed bootstrap leaves the job
   unscheduled. Reaching it requires the plist to have been deleted out from under
   a *loaded* label by something other than Wienerdog. This WP never creates that
   state, and the following register recovers it (`changed=true`, `print` → 113,
   `bootstrap`).

The slug `WP-scheduler-register-rollback` is **retired** — absorbed here. It must
not appear in this spec or be routed from it.

### ADR-0037 is not signed, and this WP cannot merge before it is

`docs/adr/0037-verified-registration-postcondition.md` is **Proposed**. It amends
ADR-0018 decision 2, which is owner-signed. Per `docs/adr/README.md`, accepted ADRs
are superseded by a new ADR rather than edited — the form used here, deliberately,
and **not** an in-file appendix to 0018.

The signature slot is ADR-0037's `Status:` line. **No ratification token is in
that file and none may be added by the implementer, by any agent, or by a
reviewer.** Definition of done item 6 gates merge on the owner's ratification.
Stated as a negative: this ADR has **not** been signed, it is **not** accepted, and
nothing in this branch should be read as owner approval of it.

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
      `path.join`, a `require`, an `fs` call, or a write. `darwinLoadedMatches`
      performs no filesystem access and never throws.
- [ ] The comparison is **allowlist-shaped**: it returns true only when the parsed
      argv is non-null, the same length as `expectArgv`, and equal element for
      element. `null`, a length difference and any mismatched element all return
      false, so an attacker who can make the readback unparseable — or who can
      alter any single argument of the loaded record — causes an extra
      registration, never a skip. Comparing the **complete** argv (rather than the
      node and launcher positions) is what makes altering the
      `--descriptor`/`--expect-digest` tail insufficient to buy a skip.
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
      `changed` true, loader: `print` exits 0, first `bootstrap` non-zero, rest 0.
      Calls in order: `print` → `bootstrap` → `bootout` → `bootstrap`; result
      `loaded: true`. **`print`'s stdout MUST be pinned to a record whose
      `arguments` block equals the NEW canonical argv** — the real state it models
      is a plist deleted or corrupted on disk and rewritten while launchd still
      held the correct record. Without that pin the gate-3 mutation row (drop
      `!o.changed`) is vacuous: with `changed` true the loaded record would hold
      the OLD argv, `darwinLoadedMatches` would be false, and the mutated clause
      would be false anyway, so T1 would stay green (RB1).
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
      replacement a success;
      (e) with `priorBytes === null` (no plist existed) there is no restore attempt
      and the result is still `loaded: false` — the irreducible window, asserted so
      it stays bounded.
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
      attempted.
      **Call-count scoping (do not over-claim):** case (i) asserts zero *mutating*
      calls and exactly one `print` **from the per-job helper**. It is **not** one
      `print` per `registerPlatform` call — `registerPlatformEntries` registers the
      per-job entry and then calls `ensureCatchup` (`schedule.js:435`), which
      performs its **own** readback under D3. A full darwin `registerPlatform` on
      an unchanged healthy install therefore issues **two** read-only `print`s and
      zero mutating calls. Assert per helper, or assert two through the full path —
      never "exactly one" through the full path. (T3)
- [ ] **AC4 (Table A row 2).** The catch-up entry goes through the same helper:
      AC1's replace ordering and AC2's teardown guard both hold for
      `ai.wienerdog.catchup`. (T4)
- [ ] **AC5 (Table A row 3 + the per-platform idempotence contract).**
      (i) linux, degraded reload (`{status:1}`) with a successful `enable --now` ⇒
      `loaded: false` (on `main`: `true`), and `repointSchedules` pushes §8's
      byte-exact notice; `{status:null}` and a missing result also count as
      failure. (T5)
      (ii) linux, `changed` false ⇒ the reload **and** `enable --now` still run —
      exactly those two `systemctl` calls and no others. (T6)
      (iii) the shipped invariant test at `:389-397` stays green under its
      rewritten contract (AC6 item 4), and is the per-platform statement of Table
      A's third column: darwin ⇒ **two** read-only `print`s (per-job + catch-up,
      per AC3's call-count scoping) and **zero** mutating calls; linux ⇒ exactly
      `daemon-reload` + `enable --now`, both idempotent.
- [ ] **AC6 (exactly FOUR existing assertions change, each enumerated).** No other
      existing assertion in `tests/unit/scheduler-schedule.test.js` may be edited.
      Each changed one is **renamed** to state the new contract and cites ADR-0037
      in a comment:
      1. `:365` — `assert.deepEqual(calls[0], ['launchctl','bootstrap',…])`. The
         readback now precedes it, so `calls[0]` is the `print` and the `bootstrap`
         moves to `calls[1]`. **This one changes because of the readback design; an
         earlier draft of this spec asserted it would not.**
      2. `:500` — the `assert.equal(res.loaded, true, …)` whose message says the
         verdict stays gated only on `enable --now` ⇒ must become `false`.
      3. `:524` — the same assertion in the sibling `{status:null}` test ⇒ `false`.
      4. `:389-397` — "a second identical add is idempotent (no OS call)" ⇒
         rewritten per AC5(iii) and **renamed** to say "no MUTATING OS call".
      `:982` (the heal path) is **not** in this set and must not be touched.
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

### Test index

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/scheduler-schedule.test.js | darwin replace ordering + `loaded` (AC1) |
| T2 | tests/unit/scheduler-schedule.test.js | teardown guard — no `bootout` when nothing is loaded; marker ordering and non-firing (AC2, AC8) |
| T3 | tests/unit/scheduler-schedule.test.js | the verified skip, **six** cases incl. the stale-tail and length-mismatch fixtures and the crash-recovery case (iv); marker non-firing (AC3, AC8) |
| T2b | tests/unit/scheduler-schedule.test.js | the rollback set — restore file + re-bootstrap prior argv + `loaded:false` + notice + the `priorBytes === null` bound (AC2) |
| T4 | tests/unit/scheduler-schedule.test.js | catch-up through the same helper (AC4) |
| T5 | tests/unit/scheduler-schedule.test.js | linux degraded reload ⇒ `loaded:false` + notice; null/missing results (AC5 i) |
| T6 | tests/unit/scheduler-schedule.test.js | linux unchanged bytes still reload + enable, exactly two calls (AC5 ii) |
| T7 | tests/unit/scheduler-schedule.test.js | **CLI path** — `add()` throws on an unloaded outcome for an UNCHANGED entry, on both legs: unchanged-darwin readback-mismatch-then-failure, and unchanged-linux degraded reload (AC11) |

Name every subtest with the prefix `verified-register:` followed by one space.

**Every T-test drives `registerPlatform` / `ensureCatchup` behaviorally with an
injected loader.** The two new helpers are non-exported and must **not** be
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

# V3 (AC6 — MECHANICAL, because it greps the assertion BODY. A count of changed
#     `test(` declaration lines cannot see an edited body under an unchanged
#     name, which is why that form was dropped.)
grep -c "stays gated only on" tests/unit/scheduler-schedule.test.js
# on main: 2 (the two linux `loaded === true` assertions). REQUIRED after: 0.
#
# Then paste the FULL diff of the file and confirm BY READING that it touches
# only AC6's four enumerated sites plus the new T1-T6 blocks. There is no grep
# that proves "nothing else moved" in a JS file — this repo has no parser. The
# enumeration in AC6 is the contract; the full diff is the evidence.
git diff origin/main...HEAD -- tests/unit/scheduler-schedule.test.js

# V4 (AC9 — no daemon, no new top-level require; judged by reading).
git diff origin/main...HEAD -- src/cli/schedule.js | grep -E "^\+" \
  | grep -nE "setInterval|setTimeout|^\+const .* = require\(" \
  || echo "OK: no timer and no new top-level require"

# V5 (AC7 — Windows leg untouched; judged by reading).
git diff origin/main...HEAD -- src/cli/schedule.js \
  | grep -nE "ensureWindowsTaskRegistered|windowsLoadedTaskMatches" \
  || echo "OK: the Windows registration path is not in the diff"

# V6 (Current state §9 — the register must not read the durable status cache).
git diff origin/main...HEAD -- src/cli/schedule.js | grep -nE "^\+.*readSchedulerStatus" \
  || echo "OK: the register path does not read the durable status cache"

# V6b (CX-1 — the verified skip must compare the COMPLETE argv, not the head).
grep -n "launchdLoadedArgs" src/scheduler/generators.js src/cli/schedule.js
# REQUIRED after: the definition + its internal use + the new module.exports line
# in generators.js, AND at least one use in schedule.js. If schedule.js instead
# references `loadedEntryTargets`, the head-only comparison was reintroduced:
grep -n "loadedEntryTargets" src/cli/schedule.js \
  && echo "FAIL: the register path is comparing positions, not the full argv" \
  || echo "OK: the register path does not use the two-position comparison"
# on main, executed: command 1 prints TWO lines from generators.js —
#   679:function launchdLoadedArgs(stdout) {
#   787:      const args = launchdLoadedArgs(stdout);
# and NOTHING from schedule.js (the symbol is absent there, and unexported).
# Command 2 prints nothing and takes the `||` branch, so the OK line is the
# baseline and the FAIL branch is reachable only by regression.

# V7 — the boundary gate and the pipeline.
node scripts/boundary-check.js docs/specs/WP-scheduler-register-replaces-loaded-record.md \
  docs/adr/0037-verified-registration-postcondition.md src/cli/schedule.js \
  tests/unit/scheduler-schedule.test.js
npm run lint
npm test
```

## Out of scope (do NOT do these)

- **A systemd loaded-unit readback.** Table A row 3 explains why it is not
  specified here. Routed as **`WP-systemd-loaded-unit-readback`**; it would also
  close `WP-scheduler-entry-identity`'s Residual 1 and would let row 3 gain a skip
  clause.
- **Comparing the launcher argument tail** (`--descriptor`, `--expect-digest`) —
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
