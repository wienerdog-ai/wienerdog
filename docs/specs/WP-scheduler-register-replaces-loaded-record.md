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
| modify | docs/adr/README.md | **D0b** — the ADR index row for 0037. Written already by the architect alongside the ADR; the implementer does not touch it. Listed because it **is** in this branch's diff, and a Deliverables table that omits a changed file is exactly the boundary-gate failure this row fixes. |
| modify | src/scheduler/generators.js | **D0** — add **four** names to `module.exports`, and add **two** new pure parsers (`launchdLoadedCalendar`, `launchdLoadedEnv` — D1b). Existing names exported unchanged:: `launchdLoadedArgs` (`:679-689`, used internally at `:787`) and `jobLaunchArgs` (`:208`, used internally at `:355`); the two new parsers are exported with them. Structural, not an API promise — the WP-114 precedent for `repairCatchup`. Audited, not assumed (see "Export audit" in Implementation notes): `catchupLaunchArgs` (`:1030`) and `loadedEntryTargets` (`:1007`) are **already** exported and need no change. |
| modify | src/cli/schedule.js | **D1-D4**: `darwinLoadedVerdict` + `ensureDarwinEntryRegistered` (new, non-exported); the darwin per-job arm (`:429-431`, Table A row 1); `ensureCatchup` (`:314-317`, row 2); the linux arm (`:456-466`, row 3). Nothing else — no probe, no heal, no notice string, no Windows path, and **`darwinReplaceEntry` itself is not edited** (it stays the heal path's primitive). |
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
 * What does the LOADED launchd record say, relative to what we would register
 * right now? Returns a TRI-STATE verdict, never a boolean. Pure
 * string work over `launchctl print` stdout — no spawn, no fs, never throws.
 * Compares EVERY canonical field that can vary between two renders, not just
 * the argv (Table A2): the complete ProgramArguments element by element, the
 * StartCalendarInterval Hour/Minute, and the EnvironmentVariables bindings by
 * CONTAINMENT (launchd injects keys of its own — Current state §7b fact 1).
 * The verdict vocabulary is **adopted verbatim from `loadedEntryTargets`**
 * (`generators.js:784`) — `'match' | 'mismatch' | 'indeterminate'` — so the two
 * readback consumers speak one language rather than two.
 *   'match'         — every block parsed AND every compared value equal.
 *   'mismatch'      — every block parsed AND some compared value differs.
 *                     THIS IS THE ONLY VERDICT THAT MAY AUTHORIZE A TEARDOWN.
 *   'indeterminate' — any block failed to parse. The ABSENCE of evidence, not
 *                     evidence of divergence: it permits the non-destructive
 *                     bootstrap attempt and NOTHING further.
 * @param {string} stdout  `launchctl print` output (untrusted display text)
 * @param {{argv:string[], hour:number|null, minute:number, env:Array<[string,string]>}} expect
 *   the canonical values just rendered
 * @returns {'match'|'mismatch'|'indeterminate'}
 */
function darwinLoadedVerdict(stdout, expect)

/**
 * Register one launchd entry, reporting success only from evidence about what
 * launchd now holds (ADR-0037). Mirrors ensureWindowsTaskRegistered. ONE
 * `launchctl print` serves both decisions: whether a verified skip is allowed,
 * and whether a teardown is justified.
 * @param {(argv:string[])=>{status:number,stdout?:string}} loader
 * @param {number} uid @param {string} label @param {string} plistPath
 * @param {{changed:boolean, expect:{argv:string[],hour:number|null,minute:number,env:Array<[string,string]>}, priorBytes:Buffer|null, onBeforeTeardown:()=>void}} o
 * @returns {boolean} true only when launchd verifiably holds this entry
 */
function ensureDarwinEntryRegistered(loader, uid, label, plistPath, o)
```

`ensureDarwinEntryRegistered`'s body, stated as the contract (Table A rows 1-2):

```js
  const printed = loader(['launchctl', 'print', `gui/${uid}/${label}`]);
  const isLoaded = !!printed && printed.status === 0;
  //     `verdict` is TRI-STATE: 'absent' | 'indeterminate' | 'mismatch' | 'match'.
  const verdict = isLoaded ? darwinLoadedVerdict(printed.stdout || '', o.expect) : 'absent';
  // (a) THE LIVE MATCH WINS — regardless of o.changed. The readback is the
  //     evidence; `changed` is a statement about a FILE and must not force the
  //     teardown of a record that already is what we would register.
  if (verdict === 'match') return true;
  // (b) non-destructive attempt first (ADR-0018 ordering, preserved)
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return true;
  // (c) TEARDOWN ONLY ON A POSITIVELY ESTABLISHED MISMATCH. 'absent' means
  //     nothing to tear down; 'indeterminate' is the ABSENCE of evidence, not
  //     evidence of divergence — destroying a record we could not read would be
  //     the exact opposite of this WP's rule.
  if (verdict !== 'mismatch') return false;
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
| `'mismatch'` | attempt (step b); on failure, teardown + replace + rollback (steps c-d) |
| `'indeterminate'` | attempt (step b) only; on failure report `loaded:false` with **NO teardown** |
| `'absent'` | attempt (step b) only; on failure report `loaded:false` — there is nothing to tear down |

**Only `'mismatch'` authorizes destruction, and that is the fix for the round-6
contradiction.** The round-6 bound claimed "anything reaching a teardown is already
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
| `StartCalendarInterval` Minute | **yes** | from the `descriptor` block of the trigger whose `stream` is `com.apple.launchd.calendarinterval` (`launchdLoadedCalendar`) |
| `StartCalendarInterval` Hour — **OPTIONAL by entry kind** | **yes**, as `hour: number\|null` | The per-job plist renders `Hour`; **`catchupPlist` renders `Minute` only, with no `Hour` key** (`generators.js:410-416`, and the live record shows `"Minute" => 0` alone). So `hour: null` means "the `Hour` key must be **ABSENT**" — it **matches** an absent key and **REFUSES** a present one. `null` is **not** a wildcard: `Hour 0` + `Minute 0` is *daily at midnight*, `Minute 0` alone is *hourly at :00* — two different schedules, and a present `"Hour" => 0` on a catch-up record must fail the match |
| `EnvironmentVariables` (the 7 `scheduledEnvPairs`) | **yes, by CONTAINMENT, with the EMPTY STRING as a real value** | every canonical pair must be present with its value; launchd-injected keys (`OSLogRateLimit`, `XPC_SERVICE_NAME` — §7b) are ignored. Set-equality would never match. **Five of the seven canonical pairs are the ambient-scrub bindings and render as a `KEY =>` line with nothing after the arrow** (§7b fact 4) — a parser that skipped valueless lines would drop `NODE_OPTIONS`, `NODE_PATH`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `ANTHROPIC_API_KEY`, and would then grant a skip to a record **missing the entire scrub**. such a line parses to `[KEY, '']` and `''` is compared as a value |
| `Label` | not compared | it is the *lookup key* — the record was fetched by it |
| `ProcessType`, `RunAtLoad` | not compared | renderer **constants** (`Background`; `true` on catch-up) — cannot vary between two canonical renders. **The "constant" claim is executed, not asserted:** `git log -S "ProcessType" -- src/scheduler/generators.js` and the same for `RunAtLoad` each return exactly one commit, `ae7720e` (WP-013, where the renderers were introduced) — neither literal has changed since, so no plist Wienerdog has ever written carries a different value |
| `StandardOutPath` / `StandardErrorPath` | not compared | derived from `<core>/logs/<name>`; a moved core changes the launcher and descriptor paths, which **are** in the argv, so divergence is caught transitively |

**Any block that fails to parse ⇒ no skip.** Same fail-safe direction as the argv:
attempt, never skip. And per RC2, all three comparisons are over **normalized**
readback text, not byte-fidelity — a value that cannot round-trip through the
parser mismatches, which means attempt.

### Table B — Mutation checks

One behavior per row; **Trigger** names the guarantee destroyed, **Patch** is the
edit. No ordinals. Assert the pattern selected exactly one named subtest.

The darwin rows were **re-derived as one unit** — five times: after the full-argv
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
| rollback does not restore the prior plist | delete the `fs.writeFileSync(plistPath, o.priorBytes)` line from step (d) | T2b |
| rollback restores the file but not the record | delete the trailing `bootstrap` from step (d) | T2b |
| rollback reports the failed replacement as success | make step (d) `return true` after a successful restore-bootstrap | T2b |
| the prior bytes are captured after the overwrite | move the `priorBytes` read below `ensureEntry` | T2b (the restored bytes become the new plist, so the prior argv is never re-bootstrapped) |
| `add()` reports success for an unloaded unchanged entry | restore the `changed &&` conjunct at `schedule.js:882` | T7 |
| **`'indeterminate'` authorizes a teardown** — the CX-1 defect | change the teardown guard to `if (verdict === 'absent') return false;`, i.e. let an unreadable record through | **T3 case (xiv)** — print exits 0 with unparseable stdout ⇒ a `bootout` appears |
| the verdict collapses back to a boolean | make `darwinLoadedVerdict` return `'mismatch'` for any non-match, folding `'indeterminate'` into it | T3 case (xiv) |
| darwin compares only the head of the argv — the round-2 defect | make `darwinLoadedVerdict` compare only `argv[0]` and `argv[1]` | **T3 case (v)** — the stale-tail fixture |
| darwin compares the argv only — the round-4 defect (CX-1) | drop the calendar and env comparisons, keeping the argv | **T3 case (vii)** — the stale-`Hour` fixture |
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

### Mirrored Surface Checklist

Tables A and B are the single place these facts are decided. Registered mirrors —
**including all three Deliverables cells**, which are the permission boundary the
implementer reads first (the lesson from `WP-scheduler-node-path-durability`
rounds 2-3, where an unregistered Deliverables cell shipped a wrong test set):

- [ ] **(+r3/r5)** Deliverables cell for `src/scheduler/generators.js` — D0 exports **four** names (`launchdLoadedArgs`, `jobLaunchArgs`, and the two new parsers `launchdLoadedCalendar`/`launchdLoadedEnv`) and adds the two parser bodies (D1b). Mirrors **Table A2**.
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
- [ ] Table B rows, each naming its Table A / A2 row
- [ ] **(+r5)** Current state §7b (the executed readback evidence behind Table A2 — four facts) and Table A2 itself
- [ ] **(+r6)** **Table A1** (the skip decision tree and the allowed bookkeeping) — mirrored by the contract body's step (a), D1b, AC1's Table A1 fixture, AC5's recount, and the Table B live-match rows
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
  the **outer** `null` means "malformed, or `Minute` missing" and `hour: null` means
  "the `Hour` key was validly **absent**" (the catch-up shape). The two nulls are
  different and must never be collapsed. Find the
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

Both non-exported, defined near `darwinReplaceEntry`. `darwinLoadedVerdict` calls
`gen.launchdLoadedArgs(stdout)` (exported by D0) and returns true only when the
result is non-null, has the same length as `expect.argv`, and is equal
element-by-element — **and then applies the calendar and env comparisons of
Table A2 (D1b); all three must pass.** `null` (an unparseable `arguments = { … }` block), a length
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
      expect: {
        argv: [node, ...gen.jobLaunchArgs({ launcher: b.launcher, name: o.name, descriptor: b.descriptor, expectDigest: b.expectDigest })],
        hour: o.hour, minute: o.minute,
        env: gen.scheduledEnvPairs(paths.home, paths.core),   // already exported (:1035)
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
}
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
   `priorBytes` is the bytes on disk when the register began. That is the
   previously-**registered** plist **only in the `changed = true` case**, where the
   disk represents a known prior registration. In the divergence case
   (`changed = false`, disk already canonical, loaded record older) `priorBytes`
   **equals canonical**, so a rollback would re-write and re-bootstrap the very
   plist that just failed. It cannot restore what the `bootout` destroyed, because
   no artifact of that record exists on disk — this spec's own
   "disk is not evidence" premise, applied to its own rollback.

   **The bound is what makes that acceptable, and it depends on Table A2.** Once
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
      `path.join`, a `require`, an `fs` call, or a write. `darwinLoadedVerdict`
      performs no filesystem access and never throws.
- [ ] The comparison is **allowlist-shaped**: it returns true only when the parsed
      argv is non-null, the same length as `expect.argv`, and equal element for
      element, **and** the calendar and env comparisons of Table A2 also pass. `null`, a length difference and any mismatched element all return
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
      `loaded: true`. **`print`'s stdout MUST be pinned to a record that does NOT
      match canonical** (an OLD argv), so the replace path is genuinely reached.
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
      replacement a success;
      (e) with `priorBytes === null` (no plist existed) there is no restore attempt
      and the result is still `loaded: false`;
      (f) **the divergence case (CX-2)** — `changed === false` with the disk already
      canonical and the loaded record older: assert that the teardown still happens
      (the record is divergent and must be replaced), that the restore re-writes
      canonical (because `priorBytes === canonical` here), that the result is
      `loaded: false`, and that §8's notice fires. This fixture exists to pin the
      **bound**, not a recovery: it is the case where rollback provably cannot
      restore the destroyed record;
      (g) the restore's `bootstrap` itself fails ⇒ still `loaded: false`, no throw.
      **Every fixture in this set pins `verdict === 'mismatch'`** — that is now the
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
      A's third column, **recounted from the Table A1 decision tree**: darwin ⇒
      **two** read-only `print`s (per-job + catch-up, per AC3's call-count scoping)
      and **zero** mutating calls — and this now holds whether `changed` is false
      **or** true, since the live match wins either way, which is the property
      Codex's missing-manifest-entry fixture pins; linux ⇒ exactly
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
# Feed boundary-check the REAL diff, never a hand-maintained list. A list typed
# into a verification command drifts from the branch and hides exactly the file
# the gate exists to catch (that is how docs/adr/README.md went unlisted).
node scripts/boundary-check.js docs/specs/WP-scheduler-register-replaces-loaded-record.md \
  $(git diff --name-only origin/main...HEAD)
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
