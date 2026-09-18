---
id: WP-scheduler-replay-manifest-independent
title: Derive uninstall's scheduler reversal from the schedule files on disk, not from the manifest alone
status: Draft
model: opus
size: M
depends_on: [WP-scheduler-mutation-home-authority]
adrs: [ADR-0004, ADR-0019, ADR-0027, ADR-0031, ADR-0035, ADR-0038, ADR-0041, ADR-0042]
epic: scheduler-domain-safety
---

# WP-scheduler-replay-manifest-independent: replay the scheduler from disk, not from the ledger

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Every code citation in this spec is pinned to `c05a575b` and was read
construct by construct at that commit.** Neither `src/core/manifest.js` nor
`src/cli/uninstall.js` has been touched since 2026-09-01 (`git log --since` over
both files at `c05a575b` returns nothing), so the tree this was measured against
is the tree the implementer will open.

## Context (read this, nothing else)

Wienerdog schedules its nightly jobs with the OS-native scheduler — launchd on
macOS, systemd user timers on Linux, Task Scheduler on Windows — by **writing a
schedule file** and then registering it. **IRON RULE (ADR-0004): Wienerdog is
just files.** Nothing in this package starts a process that outlives its job;
the only new I/O it adds is a directory listing and a stat.

`wienerdog uninstall` undoes an install by replaying
`~/.wienerdog/install-manifest.json` **in reverse**. For each `scheduler-entry`
it re-derives the unregister command from the schedule file's basename plus the
platform and runs it, then removes the file. **ADR-0027** is why the command is
re-derived rather than read: the manifest is a plaintext, user-editable,
attacker-writable file, so an argv stored in it is never executed. **ADR-0038**
(owner-signed 2026-08-03) sets the direction every manifest-driven deletion moves
in: a field the reverser reads may make uninstall delete **less**, never more.
Its **D** clause qualifies that — among the behaviors the narrowing rule permits,
never choose one that leaves an **EMBEDDED** artifact (our bytes inside a file
the user keeps editing); a **STANDALONE** artifact (a whole `wienerdog-*` file
the user can see and `rm`) may be left behind, and that posture is already
shipped and owner-ratified for legacy symlink entries.

**ADR-0041** (owner-signed 2026-08-31) added the gate this package builds on.
Its Decision 2 gives `uninstall` a **deletion clearance** predicate: scheduler
authority, **or** a read-only probe of this user's live scheduler domain that
positively answered CLEAN. Authority **short-circuits** the probe
(`src/cli/uninstall.js:208`), and that short-circuit is deliberate — it is what
lets subprocess test callers reach the gate hermetically through the environment
channel, because a subprocess cannot be handed a probe seam and the scheduler
domain is per-user-global with no sandboxed equivalent.

Round 6 of that ADR's design gate found the cost, from both review channels
independently, and the owner ruled on it on 2026-09-01 (ruling **D4**): an
authority-present uninstall — which, through the coherence arm, is **every normal
default-home user** — replays only what the manifest holds. If a live job's
`scheduler-entry` record is missing (stripped, hand-edited, written by an older
format, or lost to a partial earlier run), **no unload is attempted for it at
all**, and `disposeCoreMechanics` then removes the core around it. That is
residual **R-stripped-manifest-orphan**, recorded at
`docs/adr/0041-real-scheduler-mutation-is-opt-in.md:196`, accepted as an interim
posture with `WP-scheduler-replay-manifest-independent` — this package — filed
as **Option C**, the closure. M7's release gate is *"install→use→uninstall leaves
only the vault"* (`docs/specs/MILESTONES.md`); an orphaned live registration is
the sharpest counterexample to it still open.

**Two designs this package must NOT collapse into.** Both were refuted by
measurement at round 6 and are recorded in ADR-0041's rejected-options table
(`:226` and `:227`). Do not re-derive either:

1. **Probing the live domain on every uninstall** (dropping the authority
   short-circuit). Measured: it breaks the subprocess-test hermeticity Decision
   2b depends on. Of the 15 subprocess uninstall call sites, 13 run `init` first
   and 2 plant a hand-built manifest, so results would diverge between a clean
   runner and a machine with live registrations — machine-dependent `npm test`.
2. **Self-unloading live identifiers the manifest does not cover.** Measured:
   coverage can only be evaluated *by identifier*, and identifiers are
   per-user-global while manifest paths are `HOME`-scoped — the premise of issue
   #169. A throwaway-`HOME` `init` mints `scheduler-entry` records for
   `ai.wienerdog.dream` and `ai.wienerdog.catchup`, byte-identical to the labels
   live on a maintainer machine, so a sandbox uninstall would read the real jobs
   as "covered by my own records" and derive bootout argv for them. That rule
   licenses the original incident rather than closing it.

**The distinction that keeps this package out of both traps, and it is the
package's whole design premise:** what to unload is derived from **files inside
roots this install owns**, recognized by the basename shapes **our own
generators write** — never from identifiers observed in a namespace we do not
own, and never by enumerating shapes we consider bad. A forbidden-set
enumeration over launchd/systemd/schtasks naming cannot be closed; an
enumeration of our own good can. Nothing here changes *when* clearance is
granted.

## Current state

Everything below was read at `c05a575b`.

1. **`reverseSchedulerEntry`** — `src/core/manifest.js:501`. Signature
   `(entry, dryRun, removed, skipped, removedSet, opts = {})`, `opts` carrying
   `{platform, schedulerRoots}`. It gates **first** on
   `withinSchedulerRoot(entry.path, schedulerRoots)` (`:512`) — out of root or
   an unrecognized basename ⇒ a `preserving …` stderr line, `skipped`, derive
   nothing, spawn nothing. Only then does it call
   `require('../scheduler/generators').deriveUnloadArgv(entry.path, platform)`
   (`:524`), print `would run: …` in dry-run (`:527`) or spawn through
   `require('../scheduler/spawn').schedulerSpawn(argv)` in a `try/catch` whose
   result is discarded (`:532-536`), and finally `fs.rmSync(entry.path, {force:
   true})` (`:543`) if the path is a file.
2. **`withinSchedulerRoot`** — `src/core/manifest.js:555`. `roots.some((root) =>
   contains(root, p))` (realpath-aware containment, `contains` at `:1097`) **and**
   a basename test (`:558`):
   `/^ai\.wienerdog\..*\.plist$/` or `/^wienerdog-.*\.(timer|service|xml)$/`.
   Note the `.*`: these are **looser** than the generators' own patterns. That
   looseness is safe for a manifest-recorded path — the record already asserts we
   created it — and is **not** safe as the sole evidence for a file nobody
   recorded. Table R row R1 is why.
3. **`reverse()`** — `src/core/manifest.js:717`, signature
   `(paths, manifest, {dryRun = false} = {})`, returns
   `{removed, skipped, preserved, deferredConfig, deferredConfigHash}`. It
   computes `schedulerOpts` at `:751-758` —
   `platform: process.platform` and `schedulerRoots: [gen.launchAgentsDir(paths.home),
   gen.systemdUserDir(paths.home, process.env), path.join(paths.core, 'schedules')]`
   — then loops `for (const entry of [...manifest.entries].reverse())` (`:765`).
   **It consults nothing but `manifest.entries`.** `paths.home` is
   `env.HOME || os.homedir()` (`src/core/paths.js:54`), so a redirected `HOME`
   sandboxes all three roots.
4. **`disposeCoreMechanics`** — `src/core/manifest.js:1133`. Sweeps
   `paths.state`, `paths.logs`, `path.join(paths.core, 'schedules')`,
   `paths.secrets`, then the emptied core. **It never touches
   `~/Library/LaunchAgents` or the systemd user dir** — which is why an orphaned
   plist or timer survives an uninstall today, and why recovery is by hand.
   It *does* sweep `<core>/schedules`, so the Windows XML root is already
   disposed regardless of this package (Table R row R5).
5. **The disclosed plan (Table U surface)** — `src/cli/uninstall.js`. The raw
   manifest bytes are read at `:296` and the parsed manifest at `:303`. The
   headline enumeration prints `[kind] path` per entry at `:312`. `--dry-run`
   calls `reverse(…, {dryRun:true})` at `:315` and prints a headline that
   **already disclaims equality with the live total** (`:324-326`). The
   pre-confirm plan is built at **`:353-354`** — `manifestLib.reverse(paths,
   manifest, {dryRun:true})` and `disposeCoreMechanics(paths, {dryRun:true,
   vaultPath})` — printed at `:355-358`, then `confirm()` at `:359`. After the
   confirm: a byte-exact re-read comparison against `disclosedBytes`
   (`:379-391`), `requireDeletionClearance(paths, opts)` (`:394`), then the live
   `reverse()` on the **accepted snapshot** (`:398-402`), then
   `disposeCoreMechanics` (`:408`).
6. **`requireDeletionClearance`** — `src/cli/uninstall.js:207`. `if
   (realSchedulerAuthority().ok) return;` at `:208` is the short-circuit
   R-stripped-manifest-orphan names.
7. **The generators' own patterns** — `src/scheduler/generators.js`, fully
   anchored, all three with the same job-name charset `[a-z0-9][a-z0-9-]*`
   (which `windowsTaskName` validates and throws on, `:534`, and
   `src/cli/schedule.js:1060` enforces for job names):
   `deriveUnloadArgv` (`:140`) matches `/^(ai\.wienerdog\.[a-z0-9][a-z0-9-]*)\.plist$/`
   (`:145`), `/^(wienerdog-[a-z0-9][a-z0-9-]*)\.timer$/` (`:151`),
   `/^wienerdog-([a-z0-9][a-z0-9-]*)\.xml$/` (`:156`); `deriveProbeArgv` (`:179`)
   and `deriveIdentityArgv` (`:210`) repeat the same three shapes. `.service`
   deliberately has **no** unload argv — `deriveUnloadArgv` returns `null` for it
   (`:136` JSDoc, `:152`), and the caller still removes the file.
8. **What the generators actually write**, `src/cli/schedule.js`
   `registerPlatformEntries` (`:610`): darwin
   `<launchAgentsDir>/${gen.launchdLabel(name)}.plist` (`:619-620`, label
   `ai.wienerdog.<name>`, `generators.js:110`) plus the catch-up plist
   `ai.wienerdog.catchup.plist` (`:849`); linux
   `<systemdUserDir>/${gen.systemdUnitBase(name)}.timer` **and** `.service`
   (`:656-659`, unit base `wienerdog-<name>`, `generators.js:120`); win32
   `<core>/schedules/wienerdog-<name>.xml` (`generators.js:555, :546`).
9. **No other consumer of `reverse()`'s return shape exists.** Measured at
   `c05a575b`: `manifestLib.reverse(` appears at exactly three sites, all in
   `src/cli/uninstall.js` (`:315`, `:353`, `:398`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | add and export **one** recognizer, `recognizeScheduleBasename` — Table R rows R1/R2. Do **not** refactor `deriveUnloadArgv` / `deriveProbeArgv` / `deriveIdentityArgv`; their regexes stay byte-unchanged (Out of scope) |
| modify | src/core/manifest.js | add and export `discoverUnrecordedSchedules` (Table D rows D1, **D9**, **D10**, **D11**, **D12**); add the widened pass to `reverse()` and its `unrecordedSchedules` option + return field (Table D rows D4–D6); the disposition of Table R row **R4**. `withinSchedulerRoot`, `withinAllowedRoot`, `validateEntry` and `disposeCoreMechanics` stay byte-unchanged |
| modify | src/cli/uninstall.js | discover once before the plan, **abort on an unreadable root** (Table D row **D9**), and disclose the block (Table D rows D2/D3, including D11's `keep` lines and D12's vault lines); pass the same snapshot to both `reverse()` calls (Table D rows D4/D7). `requireDeletionClearance`, the byte-compare and the `vaultPath` read at `:309` stay byte-unchanged |
| modify | tests/unit/manifest.test.js | the recognition rule, the discovery set, the widened pass, the act-time re-check, the unreadable-root and coverage rows (Table D rows **D9**–**D12**), and the security rows of Table S |
| modify | tests/unit/uninstall.test.js | disclosure-before-consent for the widened set (Table D rows D2/D3/D7), the D9 abort and its `--dry-run` non-abort, and the `--dry-run` surface |
| modify | tests/unit/scheduler-generators.test.js | `recognizeScheduleBasename` over Table R rows R1–R3, and its agreement with the three existing derive functions on a shared corpus |
| create | tests/red-proofs/scheduler-replay-manifest-independent.proofs.json | the declared RED proofs of Table B (ADR-0042) |
| modify | docs/adr/0041-real-scheduler-mutation-is-opt-in.md | **owner item 2 only** — the dated amendment drafted under owner item 2, verbatim. The `Status:` and `OWNER-SIGNED` header lines (`:3-4`) are **never** touched, moved or reformatted (ADR-0035) |

### Exact contracts

```js
// src/scheduler/generators.js — NEW export.
/**
 * Recognize a schedule-file basename as one OUR OWN generators write. Fully
 * anchored, host-agnostic (the three shapes are disjoint across schedulers), and
 * enumerating only shapes we produce — never shapes we reject.
 * @param {string} basename  a basename, never a path
 * @returns {'launchd'|'systemd-timer'|'systemd-service'|'schtasks'|null}
 */
function recognizeScheduleBasename(basename)

// src/core/manifest.js — NEW export.
/**
 * Schedule files present in this install's own scheduler roots whose UNLOAD no
 * manifest record covers (Table D rows D1, D10, D12). Read-only: a non-recursive
 * listing of each root plus one lstat per candidate. It never throws; an
 * enumeration failure is REPORTED in `unreadable` rather than swallowed (D9).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {Manifest} manifest
 * @param {{platform?:NodeJS.Platform, schedulerRoots?:string[],
 *          vaultPath?:string|null}} [opts]
 * @returns {{schedules: string[], unreadable: Array<{root:string, code:string}>,
 *            skippedForVault: string[]}}
 *   `schedules` — absolute paths, sorted lexicographically, deduplicated.
 *   `unreadable` — roots that exist but could not be enumerated (D9); a
 *     non-empty array MUST abort a non-dry-run uninstall before any disclosure.
 *   `skippedForVault` — candidates excluded by D12, disclosed not deleted.
 */
function discoverUnrecordedSchedules(paths, manifest, opts)

// src/core/manifest.js — CHANGED.
/** @param {{dryRun?: boolean, unrecordedSchedules?: Array<{path:string, remove:boolean}>}} [opts]
 *  `unrecordedSchedules` defaults to `[]` — every caller that does not pass it
 *  behaves exactly as today. Each item carries the path AND the deletion
 *  permission Table D row D11 decided at discovery time, so `reverse()` never
 *  re-decides it.
 *  @returns {{removed: string[], skipped: string[], preserved: string[],
 *             deferredConfig: string|null, deferredConfigHash: string|null,
 *             unrecordedSchedules: string[]}} the new field is the subset of the
 *             passed list's paths this call ACTED ON (Table D row D6) */
function reverse(paths, manifest, opts)
```

Worked example, macOS, `HOME=/tmp/h`, core `/tmp/h/.wienerdog`, no nested vault,
manifest holding a `scheduler-entry` for `ai.wienerdog.dream.plist` and a
schema-valid `{kind:'file'}` entry for `ai.wienerdog.digest.plist`, with
`/tmp/h/Library/LaunchAgents/` containing `ai.wienerdog.dream.plist`,
`ai.wienerdog.catchup.plist`, `ai.wienerdog.digest.plist`,
`com.apple.something.plist` and `ai.wienerdog...plist`:

```
discoverUnrecordedSchedules(...)  →  {
  schedules: [
    { path: '/tmp/h/Library/LaunchAgents/ai.wienerdog.catchup.plist', remove: true  },
    { path: '/tmp/h/Library/LaunchAgents/ai.wienerdog.digest.plist',  remove: false },
  ],
  unreadable: [], skippedForVault: [],
}
```

`dream` is covered (D10). `catchup` is uncovered and unowned. `digest` is
uncovered — a `file` entry is not an unload (D10) — but another record owns the
file, so its deletion is withheld (D11). `com.apple.something.plist` and
`ai.wienerdog...plist` fail R2. The pre-confirm plan then gains exactly one block
(Table D row D3):

```
Scheduled jobs found on disk with no install record:
  would run: launchctl bootout gui/501/ai.wienerdog.catchup
  remove /tmp/h/Library/LaunchAgents/ai.wienerdog.catchup.plist
  would run: launchctl bootout gui/501/ai.wienerdog.digest
  keep /tmp/h/Library/LaunchAgents/ai.wienerdog.digest.plist (another manifest entry owns this file)
```

## Contract reference

**Activation trigger (ADR-0031's 2-of-7 test) — four of seven fire**, so the
discipline is on: (i) `reverse()`'s option and return **shape** change; (iv) the
precedence between the disclosed snapshot and the act-time re-check is new
behavior; (v) an **authority boundary** is crossed — the disk supplies the
evidence, `reverse()` owns the lifecycle, and `uninstall` owns consent; (vii) the
same recognition and disposition facts appear in the Deliverables notes, the
acceptance criteria, the verification greps and the operative prose.

### Table R — the recognition rule and the disposition (canonical)

Every fact about *what we accept* and *what happens to it* is decided here.

| Row | Fact | Value |
|---|---|---|
| **R1** | **Shape of the rule** | An **enumeration of our own good**. The accepted set is exactly the basenames the three generators write; nothing enumerates rejected shapes, and a basename not on this list is simply not recognized. A denylist over launchd/systemd/schtasks naming cannot be closed — we do not own those grammars — and this package would be the third place in the repo to learn that (ADR-0035; ADR-0041 `:186-188`) |
| **R2** | **The accepted basenames** | `launchd`: `/^ai\.wienerdog\.[a-z0-9][a-z0-9-]*\.plist$/` · `systemd-timer`: `/^wienerdog-[a-z0-9][a-z0-9-]*\.timer$/` · `systemd-service`: `/^wienerdog-[a-z0-9][a-z0-9-]*\.service$/` · `schtasks`: `/^wienerdog-[a-z0-9][a-z0-9-]*\.xml$/`. Fully anchored, JS `$` with no `m` flag, matched against a **basename** never a path, so `/`, `\`, `..` and whitespace cannot appear in a match. The charset is the generators' own job-name charset (`generators.js:534`, `schedule.js:1060`) |
| **R3** | **Why not `withinSchedulerRoot`'s patterns** | `withinSchedulerRoot` (`manifest.js:558`) uses `.*` where R2 uses the job-name charset, so `ai.wienerdog...plist`, `ai.wienerdog. .plist` and `wienerdog-../x.timer`'s basename shapes pass it. For a **recorded** path that looseness is harmless — the manifest entry already asserts we created the file, and the record is the evidence. For an **unrecorded** file the basename is the *only* evidence, so it must be a name a generator can actually produce. `withinSchedulerRoot` is **not** replaced: it stays the containment boundary and both gates must pass (Table S row S1) |
| **R4** | **Disposition of a recognized-but-unrecorded file** | **`unload-and-remove`.** The file is unloaded through the re-derived argv (R6) and then removed. **This is owner item 1** — it widens deletion past the manifest's list. If the owner overrules to `unload-only`, this cell becomes `unload-only`, acceptance criterion 4 flips to its stated other arm, and **nothing else in this package changes** (Table D row D5 applies the cell at one site). **The cell is a ceiling, not a floor:** two rules override it toward preservation regardless of its value — **D11** (another manifest record owns the file) and **D12** (the file is vault-resident). Neither is owner-item territory, because both only ever delete *less* |
| **R5** | **Per-platform weight of R4** | The disposition is load-bearing on **darwin only**. macOS launchd loads `~/Library/LaunchAgents` at each GUI login, so a booted-out plist left on disk is re-registered at the user's next login and then fails forever against a deleted core — `unload-only` would close the residual until the next login and no further. On **linux**, `systemctl --user disable --now` removes the `timers.target.wants` symlink, so a leftover unit file is inert. On **win32** the XML lives in `<core>/schedules`, which `disposeCoreMechanics` (`manifest.js:1139`) already sweeps, so `remove` adds nothing there. **The login-reload behavior is platform documentation, not a measurement on this tree** — reproducing it means registering against the real domain, which ADR-0041 exists to stop. Owner item 1 names it as the load-bearing uncertainty rather than burying it |
| **R6** | **The unload argv** | Re-derived by `deriveUnloadArgv(path, platform)` (`generators.js:140`) from the basename and platform — **never** read from anywhere (ADR-0027). `null` (a `.service`, or a uid-less darwin) means nothing is unregistered; the disposition of R4 still applies to the file |
| **R7** | **The mutation chokepoint** | The unload spawns through `schedulerSpawn` (`src/scheduler/spawn.js`), exactly as `reverseSchedulerEntry` does (`manifest.js:533`). **No new gate and no new variable.** Under ADR-0041 Decision 1 an unauthorized run's spawn refuses and writes its own stderr line; that is coherent — clearance reached here either by authority (spawn proceeds) or by a probe that answered CLEAN (there is nothing live to unload) |
| **R8** | **ADR-0038 classification** | A leftover schedule file is a **STANDALONE** artifact — a whole `wienerdog-*` / `ai.wienerdog.*` file in a directory the user can see, recovered by one `rm`. It is never EMBEDDED, so **D** does not force either arm of R4, and the choice is genuinely the owner's |

### Table D — discovery, disclosure and ordering (canonical)

| Row | Fact | Value |
|---|---|---|
| **D1** | **The candidate gate** | Each root of `schedulerOpts.schedulerRoots` (`manifest.js:753-757`) listed **non-recursively**. A candidate is kept only when **all** of: its basename is recognized (R2); `withinSchedulerRoot(candidate, roots)` is true; `fs.lstatSync` reports a **regular file** (not a symlink, not a directory); it is not vault-resident (**D12**); and no record covers its unload (**D10**). Enumeration failure is **not** part of this gate — see **D9** |
| **D2** | **When discovery runs** | **Exactly once per `uninstall` invocation, before anything is printed** — and therefore before D9's abort, which is the first thing the result is examined for. The returned `schedules` array is the *accepted snapshot* of the widened set, and it is the only such list the run ever uses. It is built with the vault path already read (`uninstall.js:309`) so D12 can apply |
| **D3** | **How it is disclosed** | As its own labeled block in **both** the `--dry-run` output and the pre-confirm plan (`uninstall.js:353-358`), after the manifest-derived lines: a header line naming the block, then per item the re-derived `would run: <argv>` line (omitted when R6 yields `null`) and **one** of — a `remove <path>` line when R4's cell is `unload-and-remove` **and** the item's `remove` is true, or a `keep <path> (another manifest entry owns this file)` line when D11 withheld it, or nothing when R4's cell is `unload-only`. D12's `skippedForVault` entries get their own line naming the vault, in the shape `disposeCoreMechanics`'s caller already uses for `skippedForVault` (`uninstall.js:332`). **The `--dry-run` headline count at `:328` is left unchanged** — it already disclaims equality with the live total (`:324-326`), and leaving it alone keeps the headline independent of R4's cell |
| **D4** | **How it reaches `reverse()`** | Passed as `opts.unrecordedSchedules` — the `{path, remove}` items of the Exact contracts — to **both** the plan call and the live call. The default is `[]`: `reverse()` **never discovers on its own**, so every other caller and every existing test is unchanged, and the post-confirm run cannot widen past what was disclosed. Carrying `remove` on the item is what keeps D11's decision at discovery time: `reverse()` applies it, never re-derives it |
| **D5** | **Where in `reverse()`** | One pass **after** the manifest entry loop and **before** the return, so recorded entries (the trusted ones) are handled first. A path already in `removedSet` is skipped. This pass is the single site R4's cell is applied at, and it removes an item only when R4's cell is `unload-and-remove` **and** that item's `remove` is true |
| **D6** | **Act-time re-check — narrowing only** | Immediately before acting on each passed path, the D1 gate is re-evaluated. A path that no longer qualifies is dropped with a `preserving …` stderr line in the shape `reverseSchedulerEntry:513` already uses. An `lstat` that throws at act time also drops the path — a late failure here can only ever **preserve**, because D9's abort has already happened before anything was disclosed. **Nothing is ever added at act time.** The returned `unrecordedSchedules` is therefore always a **subset** of the disclosed list — the ADR-0038 direction, and the reason a file planted during the prompt cannot be deleted |
| **D7** | **Consent integrity** | The existing byte-exact manifest comparison (`uninstall.js:379-391`) is **unchanged and insufficient on its own** for this set — it compares the manifest, and the widened set is not in the manifest. What makes the widened set consent-safe is D2 + D4 + D6 together: disclosed once, passed by value, and only ever shrunk. This is the property acceptance criterion 3 asserts |
| **D8** | **Dry-run** | In dry-run the widened pass prints and removes nothing, exactly as `reverseSchedulerEntry:526-527` behaves |
| **D9** | **An unreadable root is NOT an empty root** | *Design gate round 1, finding 1.* A root that **does not exist** (`ENOENT`/`ENOTDIR` from `readdir`) contributes nothing and is not an error — a root Wienerdog never wrote to is genuinely empty. **Any other enumeration failure** (`EACCES`, `EPERM`, `EIO`, `ELOOP`, `EMFILE`, …), and any candidate `lstat` that fails for a reason other than `ENOENT`, marks that **root** unreadable. Discovery therefore returns `{schedules, unreadable}` (Exact contracts), and `uninstall` **aborts before printing the plan, having deleted nothing**, when `unreadable` is non-empty; the message names each directory and its `code`. `--dry-run` does not abort — it prints the unreadable roots as a warning block and continues, because it deletes nothing. **Why this is not the deferred residual:** with scheduler authority present the live probe is short-circuited (`uninstall.js:208`), so a silent empty result would let `reverse()` and then `disposeCoreMechanics` run **without anything ever having looked** at the directory holding an unrecorded live job — no unload *attempted*, which is R-stripped-manifest-orphan itself, not `R-failed-unload`'s *attempted-and-failed* |
| **D10** | **What suppresses UNLOAD discovery** | *Design gate round 1, finding 2.* **Only** a manifest entry that is (a) accepted by `validateEntry` (`manifest.js:1044`), (b) of kind **`scheduler-entry`**, (c) naming this same path after realpath resolution, and (d) itself passing `withinSchedulerRoot` — i.e. a record that actually reaches the unload at `manifest.js:524-538` rather than the `preserving …` return at `:512-516`. A record failing any of the four does **not** suppress discovery. `validateEntry` checks **shape, not scheduler coverage**: a schema-valid `{kind:'file', path:'…/Library/LaunchAgents/ai.wienerdog.dream.plist'}` is preserved untouched by the file reverser, because `withinAllowedRoot`'s root set is `[core, claudeDir, codexDir, ~/.local/bin]` (`manifest.js:742`, gate at `:872-883`) and `~/Library/LaunchAgents` is in none of them. Treating that record as coverage would let a hand-edited manifest reproduce the very orphan this package closes |
| **D11** | **What a non-covering record still does: narrow the DELETION** | *Design gate round 1, finding 2.* When a **validated entry of any other kind** names a discovered path, the widened pass **unloads it but does not remove it**, whatever Table R row R4's cell says, and prints a `preserving <path> — another manifest entry owns this file` notice. That entry's own reverser owns the file's lifecycle and may hold a proof-before-delete the widened pass cannot evaluate (a `file` entry's `hash` gate, `manifest.js:890`). Unload coverage and deletion permission are **separate questions**: closing the orphan needs the first, and ADR-0038's direction forbids the second from overriding another record |
| **D12** | **Vault exclusion** | *Design gate round 1, finding 3.* Discovery takes the **accepted vault path** — the same value `uninstall.js:309` reads from `config.yaml` before the confirm and already hands to `disposeCoreMechanics` (`:320`, `:410`) — as `opts.vaultPath`, and excludes any candidate that equals or resolves inside it (`contains(vaultPath, candidate)`, `manifest.js:1097`), reporting it in a `skippedForVault` list the caller discloses. **Why this is load-bearing:** `disposeCoreMechanics` deliberately protects a legacy or hand-edited install whose vault sits inside a mechanics dir (`manifest.js:1123-1127`, `:1144-1147`). With the vault at `<core>/schedules`, a user-authored `wienerdog-notes.xml` satisfies every other D1 clause, and the widened pass would delete it **before** the protected sweep ever ran — a user file that survives today. **The act-time re-check does not re-derive it**, and does not need to: the value is read once pre-confirm and is the same value `disposeCoreMechanics` acts on, so re-deriving it could only disagree with the disclosed plan |

### Table S — security rows (canonical)

| Row | Threat | What holds |
|---|---|---|
| **S1** | An attacker plants `~/Library/LaunchAgents/ai.wienerdog.evil.plist` — a name that **does** match R2 | It is unloaded and (under R4) removed. **That is the intended blast radius and it is bounded by the roots, not by the name.** `withinSchedulerRoot`'s realpath containment (`manifest.js:556`, `contains` at `:1097`) stays the boundary: nothing outside the three roots of `manifest.js:753-757` is ever touched by this path. An actor who can write into `~/Library/LaunchAgents` can already register a job as this user; deleting a file they planted there is not an escalation |
| **S2** | A symlink at a recognized name pointing outside the roots | Rejected by D1's `lstat` regular-file requirement before any derivation. This mirrors ADR-0027's round-2 amendment, which requires a **regular non-symlink** file in-root for the same reason |
| **S3** | A poisoned basename reaching an argv or a shell | Impossible by R2: fully anchored, matched on a basename, JS `$` without `m`, and the charset excludes `/`, `\`, `.` (beyond the literal prefix), and whitespace. The argv itself is built by `deriveUnloadArgv`, whose own regexes are equally anchored (`generators.js:145, :151, :156`) |
| **S4** | The manifest is used to *widen* | It is not. The manifest only **subtracts** from the discovered set (D1's last clause) and can therefore only make this package do less. An attacker who strips an entry gets the file *discovered*, which is the residual's closure, not a widening |
| **S5** | A root that is a symlink to somewhere else | `contains` realpaths both sides and fails closed on an unresolvable side (`manifest.js:1097-1108`), so a redirected root either contains the candidate after resolution or the candidate is rejected |
| **S6** | A root made unreadable to hide a live job — the **fail-open** direction | Closed by Table D row **D9**: an enumeration failure is not an empty directory, and a non-dry-run uninstall aborts having deleted nothing. Chmod-ing a root is a same-user act and not an adversary this package defends against; what matters is that the *accident* — a permission-damaged `~/Library/LaunchAgents`, an `EIO` — cannot read as "nothing to unload" while the core is disposed |
| **S7** | A hand-edited manifest used to **suppress** an unload | Closed by Table D row **D10**: only a `scheduler-entry` that actually reaches the unload counts as coverage. A schema-valid entry of another kind neither unloads (`withinAllowedRoot` preserves it, `manifest.js:872-883`) nor suppresses. The manifest's remaining influence is D11's, which only ever withholds a **deletion** — still the ADR-0038 direction |
| **S8** | The widened deletion reaching a user's notes | Closed by Table D row **D12**: a candidate inside the accepted vault path is excluded from both unload and removal, preserving the protection `disposeCoreMechanics` already gives a nested vault (`manifest.js:1123-1127`, `:1144-1147`). Without it, a vault at `<core>/schedules` puts every user file whose name happens to match R2 inside this package's blast radius |

### Table B — the declared RED proofs (ADR-0042)

One file, `tests/red-proofs/scheduler-replay-manifest-independent.proofs.json`.
**`expectRed` sets are MEASURED at implementation time, never predicted** — hand
-apply each mutation, run the suite under the declaration's own
`testNamePattern`, and confirm against the unfiltered run.

The **anchor** column is what is measurable *before* the implementation exists:
each count is `grep -Fc` over the named file at `c05a575b`, and a count of `1`
means a find-string built around that anchor is unique today. New code authored
by this package carries no pre-measurable anchor and says so.

| Proof id | Criterion | File | Mutation | Anchor at `c05a575b` (occurrences) | What it proves |
|---|---|---|---|---|---|
| `srm-widened-set-never-passed` | 1 | `src/cli/uninstall.js` | pass `[]` instead of the discovered snapshot to the **live** `reverse()` call | adjacent to `requireDeletionClearance(paths, opts);` — **1** | the criterion observes the orphan actually being unloaded, not merely that discovery returned something |
| `srm-not-disclosed` | 3 | `src/cli/uninstall.js` | pass `[]` to the **plan** `reverse()` call while the live call keeps the snapshot | `const plan = manifestLib.reverse(paths, manifest, { dryRun: true });` — **1** | the criterion observes disclosure, not just deletion — this is the exact shape that would delete undisclosed |
| `srm-recognition-widened` | 2 | `src/core/manifest.js` | replace the R2 recognizer call in the discovery gate with `withinSchedulerRoot` alone | `function withinSchedulerRoot(` — **1** | the criterion's corpus contains a basename that passes `withinSchedulerRoot` and fails R2 (Table R row R3), so the strict rule is what is being tested |
| `srm-act-time-recheck-dropped` | 3 | `src/core/manifest.js` | remove the D6 re-check so the passed list is acted on unconditionally | `const schedulerOpts = {` — **1** | the criterion observes the narrowing direction, not just the happy path |
| `srm-disposition-flipped` | 4 | `src/core/manifest.js` | apply the opposite arm of Table R row R4 at the D5 site | *new — authored by this package* | criterion 4 observes the disposition itself rather than the unload; it is the proof that keeps R4 a measurable cell under either ruling |
| `srm-unreadable-root-read-as-empty` | 9 | `src/core/manifest.js` | make the D9 enumeration `catch` return no `unreadable` entry, restoring the round-1 defect exactly | `const schedulerOpts = {` — **1** | *Round 1, finding 1.* Criterion 9 asserts an **abort**, and an abort assertion goes green whenever the run fails for any reason — or red-free whenever the mechanism never ran. Without this declaration nothing distinguishes "aborted because a root was unreadable" from "the fixture never made a root unreadable" |
| `srm-vault-exclusion-removed` | 11 | `src/core/manifest.js` | drop the D12 vault test from the candidate gate | `contains(dir, vaultPath)` in `disposeCoreMechanics` — **1** (the adjacent, unchanged use of the same predicate) | *Round 1, finding 3.* Criterion 11 asserts a user file **survives**, which is the most vacuity-prone shape in the repo's measured catalogue: a file also survives when discovery never found it, when the fixture's vault path was wrong, and when the widened pass never ran at all |

**Why finding 2 carries no declaration of its own.** Its criterion (10) asserts a
**positive** effect — the unload argv for the uncovered file reaching the
chokepoint — which cannot pass while the behavior is absent. Findings 1 and 3
both assert *absence* (an abort, a survival), and absence assertions are the
shape ADR-0042 exists for. The judgment of whether this declared set is complete
stays a review judgment (ADR-0042 decision 5).

**Binding:** `scripts/red-proofs.js` refuses any red whose failure `code` is not
`ERR_ASSERTION`, and requires each `expectRed` entry's non-empty `signal` to
appear in the failing assertion message.

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
canonical table and a registered mirror disagree (update-all-mirrors) — and any
new mirror found in review is added here on the spot (register-new-mirrors):

- [ ] **Deliverables-table cells that restate a path or rule** — `generators.js`
      → Table R rows R1/R2; `manifest.js` → Table D rows D1/D4/D5/D6 and
      **D9–D12**, and Table R row R4; `uninstall.js` → Table D rows
      D2/D3/D4/D7 and **D9**; the three test files → the acceptance criteria;
      the proofs file → Table B; the ADR row → owner item 2
- [ ] **Acceptance criteria that assert its facts** — criterion 1 asserts Table
      D rows D1/D5 and Table R rows R6/R7; criterion 2 asserts Table R rows
      R2/R3; criterion 3 asserts Table D rows D2/D3/D6/D7; criterion 4 asserts
      Table R row **R4**; criterion 5 asserts Table S rows S1/S2/S5; criterion 6
      asserts Table D row D4's default; criterion 8 asserts owner item 2's text;
      criterion **10** asserts Table D rows **D10/D11** and Table S row S7;
      criterion **10** asserts Table D row **D9** and Table S row S6; criterion
      **11** asserts Table D row **D12** and Table S row S8
- [ ] **Verification commands / greps** — the two `recognizeScheduleBasename`
      greps mirror Table R row R1's single-source requirement; the
      `/^ai\.wienerdog\..*\.plist$/` grep mirrors Table R row R3; the
      `unrecordedSchedules = []` grep mirrors Table D row **D4**'s default; the
      two amendment greps mirror owner item 2; the two header greps mirror
      ADR-0035's signature-line rule (criterion 8)
- [ ] **Current-state description** — items 2, 3, 5 and 7 are the measured basis
      of Table R rows R3/R6 and Table D rows D1/D3/D4; item 4 is the basis of
      Table R row R5's win32 clause
- [ ] **Operative prose steps that apply it** — the Context paragraph naming the
      two refuted designs mirrors Table R row R1; the worked example under Exact
      contracts mirrors Table D rows D1/D3

## Dispatch precondition — owner items

The items below are **recommendations with the cost of overruling them, not
direct rulings**. The standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the
architect records a recommendation with its overrule cost, the session may
dispatch under it, and **the owner reverses it by dated amendment**, applied by a
committed revision rather than by a dispatch message, because
`scripts/boundary-check.js` reads the Deliverables table in this file and nothing
a message says changes what CI sees. **Nothing in this repository records the
owner approving, accepting, ratifying or signing either item, and this spec
asserts no such acceptance.**

**1. Does a recognized-but-unrecorded schedule file get unloaded only, or
unloaded and removed?**

- *Recommendation:* **unloaded and removed** — Table R row **R4**.
- *Why it is an owner item at all:* it widens deletion past the manifest's entry
  list. ADR-0038 is owner-signed and its whole direction is that manifest
  evidence narrows a deletion; this package deletes a file no manifest names.
  ADR-0038's letter does not forbid it — the rule is scoped to *evidence-field
  groups on manifest entry kinds*, and disk evidence is not a manifest field —
  but the **direction** is the owner's to set, not the architect's, and Table R
  row R8 shows **D** does not decide it either (a leftover schedule file is
  STANDALONE, which D permits leaving).
- *Overrule cost:* under `unload-only` the residual closes on linux and win32
  and closes on **darwin only until the user's next login**, because launchd
  loads `~/Library/LaunchAgents` at each GUI login and would re-register the
  boot-out'ed plist against a core that no longer exists (Table R row R5). The
  amendment of owner item 2 would then have to say that — it could no longer
  claim the class is closed on macOS, only that the orphan is unloaded once per
  uninstall. **That platform behavior is documentation, not a measurement on
  this tree**, and it is the load-bearing uncertainty in this recommendation: if
  it is wrong, `unload-only` is the better answer, because it keeps every
  deletion inside the manifest's list.
- *Cost of adopting it:* one `fs.rmSync` on a path no ledger recorded, bounded
  to the three roots by Table S row S1.
- *Either answer ships from this package unchanged.* R4 is a table cell applied
  at one site (Table D row D5), not a code shape: reversing it edits that cell,
  the other arm of acceptance criterion 4, and nothing else.

**2. Striking `R-stripped-manifest-orphan` from owner-signed ADR-0041.**

- *Recommendation:* **a dated amendment appended to
  `docs/adr/0041-real-scheduler-mutation-is-opt-in.md`, with the residual row at
  `:196` marked closed in place rather than deleted.** ADR-0041 is owner-signed
  (`:3-4`), so this is the owner's document; the amendment is drafted here and
  carries its own standing-authorization status line.
- *Overrule cost:* the ADR keeps a residual row describing behavior the tree no
  longer has — a ratified sentence contradicted by the implementation, which is
  the drift the repo's errata practice exists to catch. If overruled, say so in
  this spec by dated amendment so the contradiction is recorded where the next
  reader meets it.
- *The row is amended, never deleted.* Deleting it would remove the record of
  what was accepted between 2026-09-01 and the closure, and the stub this spec
  matures says the striking must be "by a dated amendment, not by a silent edit".
- *The amendment text, verbatim* — appended at the end of the ADR; the
  implementer fills `<DATE>` with the date the PR is opened, in both places:

  ```markdown
  ## Amendment (<DATE>) — R-stripped-manifest-orphan is closed

  Status: **ACCEPTED under standing authorization 2026-09-18 — owner signature pending.**

  `WP-scheduler-replay-manifest-independent` has shipped Option C. `uninstall`'s
  scheduler reversal no longer derives solely from the manifest's entry list: it
  also derives, from the schedule files present in this install's own scheduler
  roots, the jobs whose `scheduler-entry` record is missing, and disposes of them
  before the core is disposed. The residual **R-stripped-manifest-orphan** in the
  table above is therefore **CLOSED**. Its row is kept and marked closed rather
  than removed, so the record of what was accepted between 2026-09-01 and this
  date survives.

  Ruling **D4** is unchanged and is not reopened: Option A was the interim
  posture and Option C was filed alongside it as the closure. The two designs
  refuted at round 6 stay refuted and this amendment adopts neither. The
  derivation reads **files inside roots this install owns**, recognized by the
  basename shapes our own generators write, and never reasons over the
  per-user-global identifier namespace — which is exactly the distinction that
  separates it from "code-recognized self-unload of live identifiers the manifest
  does not cover".

  **R-failed-unload is NOT closed by this amendment.** A widened unload whose
  result is ignored is still a possible orphan; transactional uninstall remains
  its own work package.
  ```

- *And the row edit, verbatim* — in the residual table at `:196`, the first cell
  becomes:

  ```markdown
  | **R-stripped-manifest-orphan** — owner-ruled 2026-09-01; **CLOSED <DATE>**, see the amendment at the end of this file |
  ```

## Implementation notes & constraints

- **Sizing, and why this is not merged with R-failed-unload.** The stub left the
  merge open. It stays **separate**. R-failed-unload's fix is transactional
  uninstall — propagate the unload result, reorder `reverse()` so scheduler
  entries go first, and define what a partially-reversed install looks like on
  abort — which ADR-0041 `:225` already declares its own work package and which
  rewrites the same two functions this package extends. Merged, the result is
  well past M and would have to be a chain anyway; separate, each has literal
  verification commands, which is the repo's split test. **This package does not
  make uninstall transactional and must not try**: its widened unload's result is
  ignored exactly as `reverseSchedulerEntry:532-536` ignores its own.
- **This package is not split further either.** The obvious cut —
  recognizer + discovery as an S, the reversal + disclosure as an M — would ship
  a function nothing calls, with no observable behavior and therefore no
  acceptance criterion that is not a unit test of a private helper. The
  dependency chain would buy nothing.
- **No new environment variable, no new gate, no new seam.** Table R row R7. If
  the implementation finds itself wanting one, that is a spec bug — say so.
- **D9's abort is a `WienerdogError`**, thrown from `src/cli/uninstall.js` before
  the first `console.log`, in the shape the file's other refusals already use
  (`:286-288`, `:386-390`). It is a refusal, not a crash: the message names each
  unreadable directory and its `code`, and says nothing was removed.
- **Three rows exist because the design gate found them, not because they were
  foreseen.** D9, D10/D11 and D12 come from round 1 (dispositions in
  `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-review.md`).
  Each closes a way the package could have *claimed* to close
  R-stripped-manifest-orphan while leaving it open, or could have deleted
  something no previous uninstall deleted. Do not simplify any of them away.
- **Zero new dependencies**; `node:fs` and `node:path` only.
- **`generators.js` is required lazily from `manifest.js`** — it statically
  requires `manifest.js`, so a top-level import cycles. Follow the existing
  pattern at `manifest.js:524` and `:750`.
- **Do not refactor the three derive functions** to use the new recognizer. They
  are cited by ADR-0027 and by three shipped work packages; a shared-regex
  refactor is a larger blast radius than this package's own change. The
  agreement **test** in `tests/unit/scheduler.test.js` is what keeps them from
  drifting apart.
- **Ordering trap:** the widened pass must run inside `reverse()` (Table D row
  D5), not in `uninstall.js` after it. `disposeCoreMechanics` runs immediately
  after `reverse()` returns (`uninstall.js:408`) and removes the core the
  launcher lives in; an unload attempted after that point is racing the deletion
  of the thing it is unloading.
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Platform scope — what the tests can execute, and what is fixture

All three platforms the generators cover are in scope. What differs is how each
is evidenced, and the spec says which is which rather than letting a reader
assume the suite exercised them all.

| Platform | What the suite can execute on this machine (darwin), and what is assertion-by-fixture |
|---|---|
| macOS / launchd | **Yes, end to end, with no real-domain contact.** `paths.home` is `env.HOME \|\| os.homedir()` (`paths.js:54`), so a redirected `HOME` puts `launchAgentsDir` inside a temp dir; planting files there and running discovery + the widened pass is ordinary filesystem work. The **unload spawn** is not executed: `schedulerSpawn` is the chokepoint and the suite's guard covers it (ADR-0041 Decision 1; `tests/run.js:7`), so what is asserted is the **derived argv and the fact that it reached the chokepoint**, never a real `launchctl` call |
| Linux / systemd | **Discovery and the widened pass: yes.** `reverse()` builds all three roots on every host (`manifest.js:753-757`), so the systemd user dir exists under a redirected `HOME` on darwin too and files planted in it are discovered and acted on identically. **The derived argv: assertion-by-fixture** — `deriveUnloadArgv` takes `platform` as a parameter (`generators.js:140`, "injected — never mock `process.platform`"), so the linux argv is asserted by injection, not by running on linux |
| Windows / schtasks | **Assertion-by-fixture, plus one executable part.** The XML root is `<core>/schedules` (`manifest.js:756`), which exists on darwin, so discovery of a `wienerdog-*.xml` there is executable. The `schtasks` argv and the win32 basename flavor (`path.win32.basename`) are asserted by injecting `platform: 'win32'`. **`recognizeScheduleBasename` takes a basename, not a path, so it is host-agnostic by construction** and needs no injection at all |

Nothing in this package runs a scheduler client, on any platform, in any test.

## Security checklist

- [x] Any untrusted identifier that flows into a filesystem path or a shell
      command is validated with a **fully anchored** pattern — Table R row R2 and
      Table S row S3. The patterns are JS-only here (no bash or PowerShell arm),
      matched against a **basename** rather than a path, and JS `$` without the
      `m` flag is end-of-string, so a value containing a newline cannot match on
      one of its lines. The derived argv is built by `deriveUnloadArgv`, whose own
      regexes carry the same anchoring (`generators.js:145, :151, :156`).
- [x] The deletion boundary is unchanged: `withinSchedulerRoot`'s realpath
      containment stays the gate and is not relaxed — Table S rows S1 and S5.
- [x] Symlinks at a recognized name are rejected before any derivation — Table S
      row S2.
- [x] The untrusted manifest can only **subtract** from what this package acts on
      — Table S row S4 — and it can no longer subtract an **unload**, only a
      deletion: Table D rows D10/D11, Table S row S7.
- [x] A failure to read a scheduler root cannot be mistaken for an empty one, so
      the safety decision never fails open — Table D row **D9**, Table S row S6.
- [x] The widened deletion never reaches a user's notes: the nested-vault
      exclusion `disposeCoreMechanics` already applies is carried into discovery —
      Table D row **D12**, Table S row S8.
- [x] No new execution sink: the only argv is the re-derived one, through the
      existing chokepoint — Table R rows R6 and R7.

## Acceptance criteria

- [ ] **1.** On a manifest holding no `scheduler-entry` for a recognized schedule
      file that exists in a scheduler root, a non-dry-run `reverse()` given that
      path in `unrecordedSchedules` reaches `schedulerSpawn` with the argv
      `deriveUnloadArgv` derives for it, and disposes of the file per Table R row
      **R4**. Asserted on all three platforms per the Platform-scope table.
- [ ] **2.** `recognizeScheduleBasename` accepts exactly the four shapes of Table
      R row R2 and nothing else, and agrees with `deriveUnloadArgv`,
      `deriveProbeArgv` and `deriveIdentityArgv` on a shared basename corpus that
      includes at least one basename which passes `withinSchedulerRoot` and fails
      R2 (Table R row R3).
- [ ] **3.** Consent integrity (Table D rows D2/D3/D6/D7): the widened block
      appears in the pre-confirm plan **and** in `--dry-run`; a recognized file
      created **after** the plan is printed is **not** acted on; a disclosed file
      that stops qualifying before the act is dropped with a `preserving …`
      notice. The acted-on set (`reverse()`'s returned `unrecordedSchedules`) is
      always a subset of the disclosed set, never a superset.
- [ ] **4.** The disposition of Table R row **R4** is observable and exclusive:
      under `unload-and-remove` the file is gone after the run; under
      `unload-only` the file is still present after the run. Exactly one arm is
      asserted, matching R4's cell; the other arm's observable is asserted **not**
      to occur.
- [ ] **5.** Security rows hold (Table S): a symlink at a recognized name inside a
      root is never acted on; a recognized name **outside** every root is never
      acted on; a foreign basename inside a root is never acted on.
- [ ] **6.** Backward compatibility: `reverse(paths, manifest, {dryRun})` with no
      `unrecordedSchedules` behaves byte-identically to `c05a575b` — no
      discovery, no listing, no new I/O (Table D row D4).
- [ ] **7.** Idempotence. The template's "running the command twice" criterion is
      `N/A` for `uninstall` itself — the first run removes the manifest
      (`uninstall.js:424`) and the second refuses with "no install manifest
      found" (`:285-288`), which is today's behavior and is unchanged by this
      package. What this package must show instead: `discoverUnrecordedSchedules`
      run twice against an unchanged tree returns the identical array, and the
      widened pass run twice over the same list performs zero actions the second
      time (every path has been disposed of or dropped by Table D row D6).
- [ ] **8.** ADR-0041 carries the amendment of owner item 2 verbatim, its residual
      row is marked closed in place, and its `Status:` / `OWNER-SIGNED` header
      lines are byte-unchanged.
- [ ] **9.** *(Round 1, finding 1 — Table D row **D9**, Table S row S6.)* A
      scheduler root that exists but cannot be enumerated makes a non-dry-run
      `uninstall` **abort with a message naming that directory**, before the plan
      is printed and with the manifest, the core and every schedule file still
      present. A root that merely **does not exist** does not abort and does not
      appear in `unreadable`. `--dry-run` against the same unreadable root does
      **not** abort and reports it.
- [ ] **10.** *(Round 1, finding 2 — Table D rows **D10/D11**, Table S row S7.)*
      A recognized schedule file named **only** by a schema-valid
      **non-`scheduler-entry`** record is still **discovered and unloaded** — its
      derived argv reaches the chokepoint — and is **not removed**, with the
      `keep … (another manifest entry owns this file)` notice. A file named by a
      validated `scheduler-entry` that passes `withinSchedulerRoot` is **not**
      discovered at all, because the existing reverser already unloads it.
- [ ] **11.** *(Round 1, finding 3 — Table D row **D12**, Table S row S8.)* With
      the accepted vault path at `<core>/schedules`, an unrecorded file there
      whose basename satisfies R2 is neither unloaded nor removed; it is reported
      as vault-skipped and is **still on disk after the run**, exactly as it is on
      `c05a575b`.
- [ ] **12.** The declared RED proofs of Table B are `PROVEN` in an **UNFILTERED**
      `npm run red-proofs` run, with no `FILTERED`, `VACUOUS`, `UNCONTROLLED` or
      `FAILED` verdict.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint

# The recognizer is defined once and CALLED from the manifest, never re-implemented
# there (Table R row R1). Both must print a hit.
test -f src/scheduler/generators.js && grep -n 'function recognizeScheduleBasename' src/scheduler/generators.js
test -f src/core/manifest.js && grep -n 'recognizeScheduleBasename' src/core/manifest.js

# withinSchedulerRoot is still the containment gate and still carries its own
# loose patterns — it was not replaced or tightened (Table R row R3).
test -f src/core/manifest.js && grep -Fn '/^ai\.wienerdog\..*\.plist$/' src/core/manifest.js

# reverse() does not discover on its own: the default is the empty list (Table D row D4).
test -f src/core/manifest.js && grep -n 'unrecordedSchedules = \[\]' src/core/manifest.js

# ADR-0041: the amendment landed (criterion 8).
test -f docs/adr/0041-real-scheduler-mutation-is-opt-in.md \
  && grep -n 'R-stripped-manifest-orphan is closed' docs/adr/0041-real-scheduler-mutation-is-opt-in.md
test -f docs/adr/0041-real-scheduler-mutation-is-opt-in.md \
  && grep -n 'ACCEPTED under standing authorization 2026-09-18' docs/adr/0041-real-scheduler-mutation-is-opt-in.md

# ...and its owner signature header did not move or change (criterion 8, ADR-0035).
# Both must print, at lines 3 and 4 respectively, exactly as at c05a575b.
grep -n '^Status: Accepted$' docs/adr/0041-real-scheduler-mutation-is-opt-in.md
grep -n '^OWNER-SIGNED 2026-08-31$' docs/adr/0041-real-scheduler-mutation-is-opt-in.md

# The declared RED proofs (criterion 12) — UNFILTERED.
npm run red-proofs
```

Every `grep` above is a **positive** match, and each one targeting a file this
package edits is guarded with `test -f`, so the deliverable-absent case reddens
rather than passing on grep's exit 2 (`docs/runbooks/spec-authoring.md`). Observe
each new check in all three states — absent, compliant, violating — and paste all
of them. **"The three derive functions are unchanged" is deliberately NOT a grep:**
a fixed-string count over their regexes changes the moment the recognizer adds
the same shapes, so the check would be false on arrival. That claim is carried by
the Out-of-scope list and by criterion 2's agreement test.

## Out of scope (do NOT do these)

- **Transactional uninstall / residual `R-failed-unload`** — propagating the
  unload result, reordering `reverse()`, aborting mid-reversal with recovery
  metadata retained. ADR-0041 `:195` and `:225`; its own work package.
- **Dropping ADR-0041's authority short-circuit** or probing the live domain on
  every uninstall. Refuted by measurement, ADR-0041 `:226`.
- **Any coverage rule evaluated by identifier** rather than by file-in-our-root.
  Refuted by measurement, ADR-0041 `:227`.
- **Refactoring `deriveUnloadArgv` / `deriveProbeArgv` / `deriveIdentityArgv`**
  onto the new recognizer.
- **Changing `withinSchedulerRoot`**, `requireDeletionClearance`, the byte-exact
  manifest comparison, or `schedulerSpawn`'s authority predicate.
- **Documenting the `WIENERDOG_HOME`-relocated install's marker requirement** —
  ADR-0041 ruling D3's follow-up, a separate documentation package.
- **`wienerdog doctor`'s orphan reporting.** It already probes live
  registrations and is what surfaces these today; it is untouched here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(uninstall): replay the scheduler from disk, not the ledger (WP-scheduler-replay-manifest-independent)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
6. **DISPATCH PRECONDITION.** (a) The design gate must be CLOSED on this spec
   before dispatch (`docs/runbooks/codex-review.md`, "Weighted closure"); this
   spec is `Draft` until it is. **Round 1 (Astra) returned `needs-attention`
   with three band-A HEAVY findings, all accepted and applied** — raw and focus
   committed before adjudication at `4b800517`, dispositions in
   `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-review.md`.
   The gate is therefore **open**, and at least one further round is required. **A review gate is not owner approval:** nothing
   in this repository records the owner approving, accepting, ratifying or
   signing this package. (b) Owner items 1 and 2 travel with this package as
   recommendations in the standing form; the owner reverses either by dated
   amendment, applied by a committed revision.
