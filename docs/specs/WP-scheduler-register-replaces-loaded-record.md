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
> row 5 (macOS, already-loaded record). It does — Table A rows 2 and 3 below are
> exactly those two cases. When this WP merges, that spec's item 0b adds this id
> to its `depends_on`. **Do not edit that spec from this branch**; the coupling is
> recorded here and actioned there.

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler: a launchd `.plist` on macOS, a systemd `.timer`/`.service` on Linux, a
Task Scheduler XML on Windows. `wienerdog sync` writes those files and then calls
the OS to register them. **IRON RULE (ADR-0004): Wienerdog is just files.** This
WP adds no daemon, no watcher, no poller and no telemetry — every check it adds is
an in-band step of the attended `sync`/register call that already runs, and it
exits with it. Everything written to a user machine stays idempotent and
reversible through the install manifest.

Registration idempotency is keyed off the **file bytes**: `ensureEntry`
(`schedule.js:170-191`) returns `false` when the on-disk bytes already match and a
manifest entry exists, and the caller then makes **no OS call at all**. On two of
the three platforms the register step also reports success from a call that did
not, and could not, change what the OS holds. The result is a `sync` that says
everything is fine while the OS runs the previous registration — the
failing-outside-our-own-observability signature this project has now hit four
times.

**The rule this WP implements, and the one sentence to keep in mind while
reading it:** *a register that cannot verify what the OS now holds must not report
success — and must not skip the OS call on the next run.* Windows already obeys
it; macOS and Linux do not. That rule is ADR-0037 (Proposed — see "ADR-0037 is not
signed" below), which amends ADR-0018 decision 2.

## Current state

Everything below was **executed** against the live tree at commit `5f0ffc0`
before being written. Line numbers are that commit's.

### 1. `ensureEntry` — byte-keyed idempotency (`schedule.js:170-191`)

```js
function ensureEntry(manifest, filePath, content, unload) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let onDiskMatches = false;
  try { onDiskMatches = fs.readFileSync(filePath).equals(buf); } catch { onDiskMatches = false; }
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

Catch-up (`schedule.js:314-317`):

```js
  if (ensureEntry(manifest, plistPath, content, unload)) {
    return { loaded: loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0 };
  }
  return { loaded: true };
```

`launchctl bootstrap` fails for an already-loaded label. That is not this spec's
inference: ADR-0018's 2026-07-25 amendment (decision 2) states it directly, and
`darwinReplaceEntry` exists **because** of it.

### 3. macOS — the replace primitive already exists, wired only to the heal path

`schedule.js:51-55`:

```js
function darwinReplaceEntry(loader, uid, label, plistPath) {
  if (loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0) return true;
  loader(['launchctl', 'bootout', `gui/${uid}/${label}`]);
  return loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
}
```

Bootstrap-first: it tears down only after launchd has proven the bootstrap
blocked. Its only callers today are `reloadJob` and `repairCatchup` — both heal
paths. ADR-0018 decision 2 granted the capability to the heal path; this WP
extends it to register, which is what ADR-0037 amends.

### 4. Linux — `daemon-reload` is ungated (`schedule.js:457-465`)

```js
      // Best-effort daemon-reload/linger are not gated; only `enable --now` counts.
      const reload = loader(['systemctl', '--user', 'daemon-reload']);
      if (!reload || reload.status == null || reload.status !== 0) {
        const s = reload && reload.status != null ? reload.status : 'no result';
        process.stderr.write(`wienerdog: warning — 'systemctl --user daemon-reload' returned ${s}; the timer may load from stale units. Run 'wienerdog doctor'.\n`);
      }
      loaded = loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]).status === 0;
```

The whole block is inside `if (changed)`. So a degraded reload plus a successful
`enable --now` yields `loaded = true` over stale units, one stderr warning, and —
because the next sync's bytes are identical — **no reload attempt ever again**.

### 5. Linux — what heals, and what does not

`deriveIdentityArgv` returns `{kind:'systemd', argv:null}` for a `.timer` basename
(`generators.js:178-180`), so `defaultProbe` step 6 returns `'unknown'`
(`status.js:114`), which is not in `HEAL_SET` (`status.js:80`). The shipped test
`entry-identity: a systemd entry yields unknown, not a health claim`
(`tests/unit/scheduler-entry-identity.test.js:423-430`) pins it.

**Be precise here — Linux is not heal-less.** An **absent or inactive** timer makes
the step-3 probe (`systemctl --user is-active …`) exit non-zero, so `defaultProbe`
step 4 returns `'missing'`, which **is** in `HEAL_SET`, and `reloadJob` runs
(reaching the second best-effort `daemon-reload` at `schedule.js:777`). What has
no heal path is an **active** timer running from stale units: `is-active` exits 0,
step 4 does not apply, and the entry short-circuits at step 6 to `'unknown'`.
That — stale-but-running — is exactly the case §4 produces, which is why §4 must
be fixed at the register step rather than left to the healer.

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
force-registers. This is the reference implementation the other two legs are
modelled on, and it is why Windows is an in-scope **no-op** leg (Table A row 4).

### 7. The durable status cache is already readable

`status.readSchedulerStatus(paths)` (`status.js:210-215`) returns
`{checked_at?, entries: [{name, scheduler, status}]}`, and returns `{entries: []}`
on a missing or corrupt file — it never throws. It is already exported
(`status.js:394-398`). This WP reads it; it does not change it.

### 8. The notice the user sees (`schedule.js:583-585`)

```js
      if (!res.loaded) {
        notices.push(`"${job.name}" schedule file written but the OS scheduler did not accept it — run 'wienerdog doctor'.`);
      }
```

Byte-exact, including the trailing period. This WP does not change the string; it
makes it fire when it should.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

**Sizing (recorded, not left implicit).** One new non-exported helper plus four
edited call sites in one file, one new Proposed ADR, one test file extended. **M**
— one session. It is not split further: the three legs share one rule and one
helper, and splitting by platform would ship the rule half-applied, which is the
state this WP exists to end.

| Action | Path | Notes |
|--------|------|-------|
| create | docs/adr/0037-verified-registration-postcondition.md | The rule + the ADR-0018 decision-2 amendment. **Proposed, unsigned** — see "ADR-0037 is not signed". Written already by the architect, together with its `docs/adr/README.md` index row; the implementer does **not** edit either, and neither is part of the implementation diff. **0036 is deliberately skipped** — that number is reserved by the in-flight ADR amending ADR-0031; taking it here would collide on merge. |
| modify | src/cli/schedule.js | **D1-D4** (Implementation notes): the `mustAttemptRegister` helper; the darwin per-job arm (`:429-431`); `ensureCatchup` (`:314-317`); the linux arm (`:456-465`). Nothing else in this file changes — no probe, no heal, no notice string, no Windows path. |
| modify | tests/unit/scheduler-schedule.test.js | **T1-T5** (Test index). Existing assertions in this file must pass **unmodified** except the three named in AC6, which change because the behavior they pin is the defect. |

Not deliverables, deliberately: `src/scheduler/status.js` (read-only consumer —
`readSchedulerStatus` is already exported), `src/scheduler/generators.js`,
`src/scheduler/launcher.js`, `src/cli/sync.js`, `src/cli/doctor.js`,
`docs/adr/0018-windows-scheduled-dreaming.md` (owner-signed; ADR-0037 amends it
from a new file — never edit it), `docs/specs/WP-scheduler-node-path-durability.md`
(the dependent spec — see the banner), `docs/GLOSSARY.md`.

### Exact contracts

```js
/**
 * May the OS registration call be SKIPPED because the file bytes are unchanged?
 * Only when the last DURABLE status for this entry is exactly 'loaded' — i.e.
 * when we have positive recorded evidence the OS holds it. Absent, unreadable,
 * or any other status ⇒ attempt the registration again (ADR-0037 obligation 3).
 * The fail-safe direction is redundant work, NEVER silence. Never throws.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name  the entry name as `describeEntry` derives it ('dream', 'catchup')
 * @param {boolean} changed  ensureEntry's byte verdict
 * @returns {boolean} true ⇒ make the OS call
 */
function mustAttemptRegister(paths, name, changed)
```

`changed === true` ⇒ always `true`. `changed === false` ⇒ `true` unless
`readSchedulerStatus(paths).entries` contains an entry whose `name === name` and
whose `status === 'loaded'`.

## Contract reference

**Activation (ADR-0031, 2-of-7): three triggers fire.** (iv) **fallback /
precedence** behavior changes — what gates a reported success, and when an OS call
may be skipped, is redefined on two platforms; (v) the task **crosses an authority
boundary** — `sync` emits a success verdict whose subject is state the OS owns;
(vii) the same rule is mirrored across three platform legs, the Deliverables
cells, the acceptance criteria and the ADR. Two canonical tables below.

Per the A1 rule set — cited here as **proposed, not in force** — each table row is
one gate with one fixture and one mutation, and Table B keeps trigger separate
from patch with no ordinals.

### Table A — the verified-registration postcondition, per platform (canonical)

`changed` is `ensureEntry`'s byte verdict. "Reports success" is the `loaded` value
that reaches `repointSchedules` (`schedule.js:583`).

| # | Platform | OS call is made when | `loaded` is gated on | Change from today |
|---|----------|----------------------|----------------------|-------------------|
| 1 | darwin, per-job (`:429-431`) | `mustAttemptRegister(paths, o.name, changed)` | `darwinReplaceEntry(...)` — bootstrap-first, teardown only after launchd proves it blocked | was: `if (changed)` + bare `bootstrap`, which cannot replace a loaded label |
| 2 | darwin, catch-up (`:314-317`) | `mustAttemptRegister(paths, 'catchup', changed)` | `darwinReplaceEntry(...)` | same as row 1 — this row is `WP-scheduler-node-path-durability` Table C **row 5** |
| 3 | linux (`:456-465`) | `mustAttemptRegister(paths, o.name, changed)` | `reloadOk && enableOk`, where `reloadOk` is the SAME status test the existing warning already computes | was: reload ungated and inside `if (changed)`; `loaded = enableOk` alone — this row is that spec's Table C **row 4** |
| 4 | win32 (`:240-245`) | unchanged — `ensureWindowsTaskRegistered` already skips only on a verified loaded-task match | unchanged | **none**: already conforming (Current state §6). In scope as the reference leg, and as a preservation requirement (AC5) |

**Row 3's `reloadOk` reuses the existing predicate, it does not restate it.** The
warning at `:461-464` already computes exactly "the reload did not verifiably
succeed" (`!reload || reload.status == null || reload.status !== 0`). Hoist that
into a `const reloadOk = …` and use the one value for both the warning and the
gate, so the message and the verdict cannot drift apart.

**Row 3 also moves the reload OUT of `if (changed)`.** That is the half that ends
the permanent silence: with the reload attempted on every linux register, a
degraded reload produces the notice on **every** sync until it succeeds, instead
of once.

### Table B — Mutation checks

One behavior per row; the **Trigger** column names the guarantee destroyed and the
**Patch** column is the edit. No ordinals — rows are identified by their trigger.
Assert the test-name pattern selected exactly one named subtest.

| Trigger (guarantee destroyed) | Patch | Test that must go RED |
|-------------------------------|-------|-----------------------|
| darwin register can no longer replace a loaded record | revert the per-job arm to `loader(['launchctl','bootstrap',…])` | T1 |
| darwin catch-up register can no longer replace a loaded record | revert `ensureCatchup` to the bare `bootstrap` | T2 |
| a degraded linux reload is reported as success | revert `loaded = reloadOk && enableOk` to `loaded = enableOk` | T3 |
| a degraded linux reload is never retried | move the `daemon-reload` block back inside `if (changed)` | T4 |
| a byte-identical entry is skipped without positive evidence | make `mustAttemptRegister` `return changed;` | T5 |
| the skip predicate accepts any recorded status | change the `mustAttemptRegister` status test to `e.status !== 'missing'` | T5 |
| windows stops verifying the loaded task before skipping | delete the `windowsLoadedTaskMatches` call from `ensureWindowsTaskRegistered` | AC5's preservation assertion |

### Mirrored Surface Checklist

Tables A and B are the single place these facts are decided. Registered mirrors —
**including the Deliverables cells**, which are the permission boundary the
implementer reads first (the lesson from `WP-scheduler-node-path-durability`
rounds 2-3, where an unregistered Deliverables cell shipped a wrong test set):

- [ ] Deliverables cell for `src/cli/schedule.js` (the four D-sites — Table A rows 1-3)
- [ ] Deliverables cell for `tests/unit/scheduler-schedule.test.js` (the T1-T5 set and AC6's three changed assertions)
- [ ] Deliverables cell for `docs/adr/0037-…` (the rule — Table A's spine)
- [ ] "Exact contracts" `mustAttemptRegister` JSDoc and its two-clause rule
- [ ] Current state §2 (row 1-2 mechanism), §4 (row 3 mechanism), §6 (row 4, already-conforming)
- [ ] Implementation notes D1-D4
- [ ] Acceptance criteria AC1 (row 1), AC2 (row 2), AC3 (row 3), AC4 (the skip predicate), AC5 (row 4 preservation), AC7 (the marker)
- [ ] Verification commands V2-V5
- [ ] Table B rows, each naming its Table A row
- [ ] Test index rows T1-T5
- [ ] The banner's cross-spec coupling claim (Table A rows 2 and 3 = the dependent spec's Table C rows 5 and 4)
- [ ] Definition of done items 5 (the dependent spec's 0a) and 6 (the ADR signature gate)

Out of this spec, not deliverables:

- [ ] `docs/adr/0018-windows-scheduled-dreaming.md` decision 2 — amended by ADR-0037 from a new file, never edited. Owner-signed (`:204`).
- [ ] `docs/specs/WP-scheduler-node-path-durability.md` DoD 0a/0b — actioned **there**, after this merges.

## Implementation notes & constraints

### D1 — `mustAttemptRegister` in `src/cli/schedule.js`

Non-exported, defined near `ensureEntry`. Lazily
`require('../scheduler/status')` inside the function body, matching the existing
idiom at `schedule.js:650` and `:675` — `status.js` and `schedule.js` already
require each other lazily to avoid a load-time cycle, and a top-level require here
would create one. Wrap the read in `try`/`catch` returning `true`: an unreadable
cache must mean "attempt", never "skip".

### D2 — darwin per-job arm (`schedule.js:429-431`)

```js
    let loaded = true;
    const changed = ensureEntry(manifest, plistPath, content, unload);
    if (mustAttemptRegister(paths, o.name, changed)) {
      require('../scheduler/status').refreshSchedulerStatus(paths); // pre-destructive marker
      loaded = darwinReplaceEntry(loader, uid, label, plistPath);
    }
```

`changed` stays in the returned object exactly as today — it still means "the file
bytes changed", and `repointSchedules` still counts it. Do not redefine it.

**The marker is not optional and it is not decoration.** ADR-0018 decision 2
requires the durable status cache to be refreshed from the live probe *before* any
destructive replacement, so a process killed mid-replacement leaves a pessimistic
record rather than a stale `loaded` one. Register is now a destructive path, so
the rule applies to it. It is best-effort by construction — `refreshSchedulerStatus`
swallows every write error and returns `void` — so this is *attempted*, never
known to have landed; that residual is ADR-0018's, not this WP's, and is not
re-litigated here.

Cost, stated rather than hidden: one extra read-only probe per attempted register.
Jobs are single-digit in every real install (`dream` plus a small number of
routines), so this is bounded and cheap. Do **not** try to hoist it to once per
`repointSchedules` run — that needs cross-function state and buys nothing at this
job count.

### D3 — `ensureCatchup` (`schedule.js:314-317`)

Same shape. The entry name for the cache lookup is the literal `'catchup'` —
that is what `describeEntry` derives from `ai.wienerdog.catchup.plist` and what
`refreshSchedulerStatus` writes. `label` is already in scope.

### D4 — linux arm (`schedule.js:456-465`)

Three edits, one behavior:

1. Hoist the `daemon-reload` + warning block **out** of `if (changed)` so it runs
   on every linux register.
2. Bind the existing status test to `const reloadOk = …` and use it for both the
   warning and the gate — one predicate, two consumers.
3. `loaded = reloadOk && enableOk`, where `enableOk` is today's `enable --now`
   test. Keep `enable --now` inside the attempt branch.

Do not change the warning string. It is byte-exact in Current state §4 and users
have seen it.

Also unchanged: the best-effort `loginctl enable-linger` below, and the second
`daemon-reload` at `:777` inside `reloadJob` — that is the heal path, it is out of
this WP's Deliverables, and Current state §5 records precisely when it is
reachable.

### ADR-0037 is not signed, and this WP cannot merge before it is

`docs/adr/0037-verified-registration-postcondition.md` is **Proposed**. It amends
ADR-0018 decision 2, which is owner-signed (`0018:204`). Per
`docs/adr/README.md`, accepted ADRs are immutable and are superseded by a new ADR
rather than edited — which is the form used here, deliberately, and **not** an
in-file appendix to 0018.

The signature slot is ADR-0037's `Status:` line. **No ratification token is in that
file and none may be added by the implementer, by any agent, or by a reviewer.**
Definition of done item 6 gates merge on the owner's ratification. Stated as a
negative so it cannot be pattern-matched into satisfaction: this ADR has **not**
been signed, it is **not** accepted, and nothing in this branch should be read as
owner approval of it.

### General

- No new npm dependency. No new top-level `require` in `schedule.js`.
- ADR-0004: every check added here runs inside the attended `sync`/register call
  and exits with it. No daemon, no watcher, no poller, no background process.
- Idempotence and reversibility are preserved and are asserted (AC8): a second
  `sync` against a healthy install writes byte-identical files, and — because the
  cache then says `loaded` — makes **zero** OS calls, exactly as today. The
  manifest entries and `deriveUnloadArgv`'s basename-derived unregister argv
  (ADR-0027) are untouched.
- When uncertain: choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `mustAttemptRegister` reads `state/scheduler-status.json` through the
      existing `readSchedulerStatus`, which is a **cache-only** read that never
      throws and returns `{entries: []}` on missing or corrupt input. The file is
      user-editable plaintext, so its contents are **untrusted** — and this WP
      uses them in exactly one direction: a recorded `'loaded'` may cause a call
      to be **skipped**. An attacker who can write that file can therefore only
      suppress a re-registration they could equally suppress by editing the
      schedule file itself, and cannot cause any command, path or argv to be
      constructed from its contents. No value read from the cache reaches a
      `spawn`, a `path.join`, a `require`, or a filesystem write.
- [ ] The entry `name` compared against the cache is code-derived
      (`describeEntry`'s `[a-z0-9-]` job names, or the literal `'catchup'`), never
      taken from the cache and never used to build a path.
- [ ] `darwinReplaceEntry`'s argv is built from `process.getuid()` and a
      code-derived label exactly as it is on the heal path today, and it goes
      through the same `loader` seam → `schedulerSpawn`. This WP adds no new argv
      shape and no new escaping site.
- [ ] The destructive `bootout` is still reached **only** after launchd has
      refused the non-destructive `bootstrap`. Bootout-first stays rejected
      (ADR-0018 decision 2's original reasoning), so a working-but-unverifiable
      entry is never torn down speculatively.

## Acceptance criteria

**Preamble — a test that passes against unmodified `main` is not evidence.** Every
new test must be red before the fix and green after; every Table B row must be
demonstrated red. Paste both into the PR. Every test drives the `loader` seam —
**no test in this WP may touch a real OS scheduler**; `tests/run.js` sets
`WIENERDOG_TEST_NO_REAL_SCHEDULER=1` and `schedulerSpawn` throws without an
injected loader, and this WP keeps that backstop armed.

- [ ] **AC1 (Table A row 1).** On darwin, with a recording loader whose first
      `bootstrap` returns non-zero and whose subsequent calls return 0: a per-job
      register over a `changed` plist issues `bootstrap` → `bootout` → `bootstrap`
      in that order and returns `loaded: true`. On `main` it issues one
      `bootstrap` and returns `loaded: false`. (T1)
- [ ] **AC2 (Table A row 2).** The same, for the catch-up entry via
      `ensureCatchup`. (T2)
- [ ] **AC3 (Table A row 3).** On linux, with a loader whose `daemon-reload`
      returns non-zero and whose `enable --now` returns 0, the register reports
      `loaded: false` (on `main`: `true`), and `repointSchedules` pushes the
      byte-exact notice from Current state §8. Additionally: a `{status: null}`
      and a missing (`undefined`) reload result both count as failure — the
      existing predicate already treats them so, and AC3 pins that it still does.
      (T3)
- [ ] **AC4 (the skip predicate, Table A rows 1-3).** With byte-identical files
      (`changed === false`): a cache recording `status: 'loaded'` for the entry
      ⇒ **zero** loader calls; a cache with no entry, an absent cache file, a
      corrupt cache file, and a cache recording `'missing'`/`'mismatched'`/
      `'unverified'`/`'unknown'` ⇒ the register is attempted. Table-driven over
      those seven cases. (T5)
- [ ] **AC5 (Table A row 4 — Windows preservation).** `ensureWindowsTaskRegistered`
      is **unchanged**, and the existing Windows registration assertions in
      `tests/unit/scheduler-schedule.test.js` pass **unmodified**. V5 shows the
      function body is not in the diff.
- [ ] **AC6 (the three assertions that legitimately change).** Exactly three
      existing assertions in `tests/unit/scheduler-schedule.test.js` change,
      because each pins the defect: the two that assert a single `bootstrap` call
      on a changed darwin entry, and the one that asserts `loaded` is true after a
      failed linux `daemon-reload`. Each must be **renamed** to state the new
      contract and must cite ADR-0037 in a comment. **No other existing assertion
      in that file may be edited** — that is this WP's proof nothing else moved,
      and V3 is its count.
- [ ] **AC7 (the pre-destructive marker, ADR-0018 decision 2).** On darwin, the
      recording loader observes that `state/scheduler-status.json` was written
      **before** the first `bootout` of an attempted register. Asserted the way
      `WP-scheduler-entry-identity` asserts it on the heal path: a loader that
      reads the file at every call and records whether it existed. (T4)
- [ ] **AC8 (idempotence and no daemon).** A second register against a healthy
      install (cache says `loaded`, bytes identical) makes **zero** loader calls
      and writes no file. The diff introduces no `setInterval`, no `setTimeout`,
      no new top-level `require`, and no `package.json` change. (T5 + V4)
- [ ] **AC9 (mutation matrix).** Every Table B row demonstrated red; output pasted.

### Test index

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/scheduler-schedule.test.js | darwin per-job replace order + `loaded` (AC1) |
| T2 | tests/unit/scheduler-schedule.test.js | darwin catch-up replace order + `loaded` (AC2) |
| T3 | tests/unit/scheduler-schedule.test.js | linux degraded reload ⇒ `loaded:false` + the notice; `null`/missing reload results (AC3) |
| T4 | tests/unit/scheduler-schedule.test.js | the status file is written before the first `bootout` (AC7) |
| T5 | tests/unit/scheduler-schedule.test.js | `mustAttemptRegister` table-driven over the seven cache cases; zero-call idempotence (AC4, AC8) |

Name every subtest with the prefix `verified-register:` followed by one space, so
the verification commands can count them with one anchored grep. Every test injects
`opts.loader` and `opts.platform` — **never** mock `process.platform` (the
WP-049/051/038 rule).

## Verification steps (run these; paste output in the PR)

```bash
git fetch origin main --quiet

# V1 (PRESERVATION of `fail 0`; its `pass` count feeds V2).
npm test -- tests/unit/scheduler-schedule.test.js tests/unit/scheduler-status.test.js \
            tests/unit/scheduler-entry-identity.test.js
# Record the `ℹ tests`, `ℹ pass` and `ℹ fail` lines. `ℹ fail` must be 0.

# V2 (CHANGE — anti-vacuity; judged by reading). REQUIRED: >= 5.
npm test --silent -- --test-reporter=tap tests/unit/scheduler-schedule.test.js \
  | grep -cE "^ok [0-9]+ - verified-register: "
# on main: 0.

# V3 (AC6 — exactly three existing assertions changed; judged by reading).
git diff origin/main...HEAD -- tests/unit/scheduler-schedule.test.js \
  | grep -cE "^-test\("
# REQUIRED: exactly 3 (the three renamed tests). More means an unrelated edit.

# V4 (AC8 — no daemon, no new top-level require; judged by reading).
git diff origin/main...HEAD -- src/cli/schedule.js | grep -E "^\+" \
  | grep -nE "setInterval|setTimeout|^\+const .* = require\(" \
  || echo "OK: no timer and no new top-level require"

# V5 (AC5 — Windows leg untouched; judged by reading).
git diff origin/main...HEAD -- src/cli/schedule.js | grep -nE "ensureWindowsTaskRegistered|windowsLoadedTaskMatches" \
  || echo "OK: the Windows registration path is not in the diff"

# V6 — the boundary gate and the pipeline.
node scripts/boundary-check.js docs/specs/WP-scheduler-register-replaces-loaded-record.md \
  docs/adr/0037-verified-registration-postcondition.md src/cli/schedule.js \
  tests/unit/scheduler-schedule.test.js
npm run lint
npm test
```

## Out of scope (do NOT do these)

- **Making the loaded execution position *comparable*** (an adversarial substituted
  binary). That is `WP-scheduler-stable-exec-position`. This WP is about the
  honesty of the register step, not about authenticating what is registered.
- **Implementing the systemd identity query** (`deriveIdentityArgv`'s
  `{kind:'systemd', argv:null}`). Row 3 is fixed by gating and retrying the
  reload, which needs no identity read. A real systemd `ExecStart` read-back is a
  separate WP and would also close `WP-scheduler-entry-identity`'s Residual 1.
- **Editing `docs/adr/0018-…`.** Owner-signed and immutable; ADR-0037 amends it.
- **Editing `docs/specs/WP-scheduler-node-path-durability.md`.** Its DoD 0b adds
  this id to its `depends_on` — actioned there, after this merges.
- **`refreshSchedulerStatus` returning a persistence result.** The marker stays
  best-effort; that residual belongs to `WP-scheduler-status-write-observable`.
- **Any change to the notice strings, the heal path, `reloadJob`, `repairCatchup`,
  or `schedule.js:777`.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Every Table B row demonstrated red (with the "selected exactly one named
   subtest" assertion) and the tree restored afterwards.
3. Conventional commits; PR titled
   `fix(scheduler): verify what the OS holds before reporting a register success (WP-scheduler-register-replaces-loaded-record)`.
4. PR template filled, including "Decisions made" and `Generated-by:`.
5. **Cross-spec obligation.** The PR body states that this WP's Table A rows 2 and
   3 are `WP-scheduler-node-path-durability`'s Table C rows 5 and 4, satisfying
   that spec's Definition of done item **0a**, so that its item **0b** (add this
   id to its `depends_on`) becomes actionable. That edit happens in that spec's
   own PR, never from this branch.
6. **OWNER GATE — ADR-0037 ratification.** ADR-0037 amends owner-signed ADR-0018
   decision 2 and is `Proposed` with no signature. The owner ratifies it — by
   replacing its `Status:` line in an explicit ratification pass — at or before
   this WP's merge. The implementer must not add the token.
7. This spec's `status:` flipped to `In-Review` in the same PR.
