---
id: WP-scheduler-replay-manifest-independent
title: Derive uninstall's scheduler reversal from the schedule files on disk, not from the manifest alone
status: In-Review
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
| modify | src/core/manifest.js | add and export `discoverSchedulesOnDisk` (Table D rows D1, **D9**, **D11**, **D12**, **D14**, **D15**; it reads no manifest entry to decide an unload — **D10**); add the **two-phase** widened pass to `reverse()` — unload before the entry loop, removal after (Table D row **D5**) — and its `discoveredSchedules` option + return field (Table D rows D4/D6); the disposition of Table R row **R4**. `withinSchedulerRoot`, `withinAllowedRoot`, `validateEntry`, `disposeCoreMechanics` **and `contains`** stay byte-unchanged (Table D row **D15** adds a second resolution beside `contains`, never inside it) |
| modify | src/cli/uninstall.js | discover once before the plan, **abort on an unreadable root** (Table D row **D9**), and disclose the block (Table D rows D2/D3, including D11's `keep` lines and D12's vault lines); pass the same snapshot to both `reverse()` calls (Table D rows D4/D7). `requireDeletionClearance`, the byte-compare and the `vaultPath` read at `:309` stay byte-unchanged |
| modify | tests/unit/manifest.test.js | the recognition rule, the discovery set, the widened pass, phase D5b's removal re-check (**D6**), the unreadable-root and coverage rows (Table D rows **D9**–**D12**), and the security rows of Table S |
| modify | tests/unit/uninstall.test.js | disclosure-before-consent for the disk-derived set (Table D rows D2/D3/D7), the D9 abort and its `--dry-run` non-abort, and the `--dry-run` surface |
| modify | tests/unit/scheduler-generators.test.js | `recognizeScheduleBasename` over Table R rows R1–R3, and its agreement with the three existing derive functions on a shared corpus |
| modify | tests/integration/uninstall-core-e2e.test.js | **Round 4, and it must land even though the code fix makes it redundant.** `tempEnv()` (`:18-42`) spreads `...process.env` (`:27`) and then overrides `HOME` (`:28`), so a developer's real `XDG_CONFIG_HOME` is **inherited** and `systemdUserDir` resolves outside the sandbox. The literal edit: add `XDG_CONFIG_HOME: path.join(root, '.config'),` to that object literal, beside the existing `CLAUDE_CONFIG_DIR` / `CODEX_HOME` overrides, with a comment naming Table D row **D14**. Add the regression of acceptance criteria 15 and 16 here |
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
 * Schedule files present in this install's own scheduler roots (Table D rows D1,
 * D12). It reads NO manifest entry to decide what to unload (D10); it reads them
 * only to set each item's `remove` permission (D11). Read-only: a non-recursive
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
function discoverSchedulesOnDisk(paths, manifest, opts)

// src/core/manifest.js — CHANGED.
/** @param {{dryRun?: boolean, discoveredSchedules?: Array<{path:string, remove:boolean}>}} [opts]
 *  `discoveredSchedules` defaults to `[]` — every caller that does not pass it
 *  behaves exactly as today. Each item carries the path AND the deletion
 *  permission Table D row D11 decided at discovery time, so `reverse()` never
 *  re-decides it.
 *  @returns {{removed: string[], skipped: string[], preserved: string[],
 *             deferredConfig: string|null, deferredConfigHash: string|null,
 *             discoveredSchedules: string[]}} the new field is the subset of the
 *             passed list's paths whose UNLOAD this call performed in phase D5a
 *             (Table D row D6). Anything phase D5b deleted also appears in
 *             `removed`. */
function reverse(paths, manifest, opts)
```

Worked example, macOS, `HOME=/tmp/h`, core `/tmp/h/.wienerdog`, no nested vault,
manifest holding a `scheduler-entry` for `ai.wienerdog.dream.plist` and a
schema-valid `{kind:'file'}` entry for `ai.wienerdog.digest.plist`, with
`/tmp/h/Library/LaunchAgents/` containing `ai.wienerdog.dream.plist`,
`ai.wienerdog.catchup.plist`, `ai.wienerdog.digest.plist`,
`com.apple.something.plist` and `ai.wienerdog...plist`:

```
discoverSchedulesOnDisk(...)  →  {
  schedules: [
    { path: '/tmp/h/Library/LaunchAgents/ai.wienerdog.catchup.plist', remove: true  },
    { path: '/tmp/h/Library/LaunchAgents/ai.wienerdog.digest.plist',  remove: false },
    { path: '/tmp/h/Library/LaunchAgents/ai.wienerdog.dream.plist',   remove: false },
  ],
  unreadable: [], skippedForVault: [],
}
```

All three recognized files are discovered — **discovery reads no manifest**
(D10). `catchup` is unowned, so `remove: true`. `digest` and `dream` are each
named by a validated entry, so their deletion is withheld for their own reverser
(D11) while D5a still unloads them. `com.apple.something.plist` and
`ai.wienerdog...plist` fail R2. The pre-confirm plan then gains exactly one block
(Table D row D3):

```
Scheduled jobs found on disk:
  would run: launchctl bootout gui/501/ai.wienerdog.catchup
  remove /tmp/h/Library/LaunchAgents/ai.wienerdog.catchup.plist
  would run: launchctl bootout gui/501/ai.wienerdog.digest
  keep /tmp/h/Library/LaunchAgents/ai.wienerdog.digest.plist (another manifest entry owns this file)
  would run: launchctl bootout gui/501/ai.wienerdog.dream
  keep /tmp/h/Library/LaunchAgents/ai.wienerdog.dream.plist (another manifest entry owns this file)
```

`dream`'s `would run:` line appears **twice** in the whole plan — once here and
once from its `scheduler-entry` — which D3 and D13 cover.

## Contract reference

**Activation trigger (ADR-0031's 2-of-7 test) — four of seven fire**, so the
discipline is on: (i) `reverse()`'s option and return **shape** change; (iv) the
precedence between the disclosed snapshot and phase D5b's removal re-check is new
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
| **R9** | **Named residual — `R-preserved-reloadable-plist`** | *Design gate round 8.* **A recognized launchd plist that a manifest entry of a NON-scheduler kind names is unloaded but never removed — by D11, because that record owns the file — and the file reverser does not remove it either, because `~/Library/LaunchAgents` is outside `withinAllowedRoot`'s root set (`manifest.js:742`, gate `:872-883`). The core is then disposed, and under R5's login-reload behaviour the next GUI login re-registers the surviving plist against a core that no longer exists.** The unload **succeeded**, so `R-failed-unload` does not cover this; it is its own residual. **Reachability:** only through a **hand-edited or corrupted manifest** that records a plist as `kind:'file'` (or another non-scheduler kind) — no Wienerdog code path writes such an entry, since `schedule.js:358` records schedule files as `scheduler-entry`. **Strictly narrower than today:** on `c05a575b` that same install gets **no unload at all** and the same surviving plist, so this package still strictly improves the state it leaves. **Mitigation, and it is required rather than optional:** the disclosed plan carries a plain-language warning line for every such item — the user is told, before consenting, that the job will come back at the next login until they remove the named file by hand. `wienerdog doctor` also still probes live registrations. **The alternative — a retryable refusal before core teardown — is owner item 3**, not the default |

### Table D — discovery, disclosure and ordering (canonical)

| Row | Fact | Value |
|---|---|---|
| **D1** | **The candidate gate** | Each **discovery root** (**D14** — not every root `reverse()` computes) listed **non-recursively**. A candidate is kept only when **all** of: its basename is recognized (R2); it resolves **inside one of those roots**, established by **D15**'s resolver rather than by `withinSchedulerRoot`; `fs.lstatSync` reports a **regular file** (not a symlink, not a directory); and it is not vault-resident (**D12**). **The gate consults the manifest for nothing** — see **D10**. Enumeration failure is not part of it either — see **D9** |
| **D2** | **When discovery runs** | **Exactly once per `uninstall` invocation, before anything is printed** — and therefore before D9's abort, which is the first thing the result is examined for. The returned `schedules` array is the *accepted snapshot* of the disk-derived set, and it is the only such list the run ever uses. It is built with the vault path already read (`uninstall.js:309`) so D12 can apply |
| **D3** | **How it is disclosed** | As its own labeled block in **both** the `--dry-run` output and the pre-confirm plan (`uninstall.js:353-358`), after the manifest-derived lines: a header line naming the block, then per item the re-derived `would run: <argv>` line (omitted when R6 yields `null`) and **one** of — a `remove <path>` line when R4's cell is `unload-and-remove` **and** the item's `remove` is true, or a `keep <path> (another manifest entry owns this file)` line when D11 withheld it, or nothing when R4's cell is `unload-only`. **Every `keep` line for a launchd plist is followed by a plain-language warning** that the job will start again at the next login until the named file is removed by hand (Table R row **R9**) — plain language for knowledge workers, per CLAUDE.md, not a code or a residual id. D12's `skippedForVault` entries get their own line naming the vault, in the shape `disposeCoreMechanics`'s caller already uses for `skippedForVault` (`uninstall.js:332`). **The `--dry-run` headline count at `:328` is left unchanged** — it already disclaims equality with the live total (`:324-326`), and leaving it alone keeps the headline independent of R4's cell. **The plan may show the same unregister command twice** — once from the ledger's `scheduler-entry` and once from this block — because since round 3 discovery no longer excludes recorded paths (D10). The block's header says these were **found on disk**, so the two lines are distinguishable, and D13 is why the duplicate is harmless. Deduplicating them would mean consulting the manifest to decide what to print, which is the channel D10 closed |
| **D4** | **How it reaches `reverse()`** | Passed as `opts.discoveredSchedules` — the `{path, remove}` items of the Exact contracts — to **both** the plan call and the live call. The default is `[]`: `reverse()` **never discovers on its own**, so every other caller and every existing test is unchanged, and the post-confirm run cannot widen past what was disclosed. Carrying `remove` on the item is what keeps D11's decision at discovery time: `reverse()` applies it, never re-derives it |
| **D5** | **Where in `reverse()` — TWO phases, and the unload one goes FIRST** | *Design gate round 2, finding 1.* **D5a, the unload phase, runs BEFORE the manifest entry loop** (`manifest.js:765`) and attempts **every disclosed item's** unload (R6/R7) **unconditionally** — no existence test, no containment re-check, no filesystem contact of any kind (**D6**). **D5b, the removal phase, runs after the loop and before the return**, so recorded entries keep priority over the widened deletion; it acts **only on the items phase D5a passed** (**D6**), never re-admitting one by its own check; it skips any path in `removedSet` and applies R4's cell — removing an item only when the cell is `unload-and-remove` **and** that item's `remove` is true. **Why the split is not cosmetic:** on win32 the XML lives at `<core>/schedules/…`, which **is** inside `withinAllowedRoot`'s root set (`manifest.js:742`), so a schema-valid `{kind:'file'}` record for `wienerdog-dream.xml` is *discovered* under D10 but is **deleted by the file reverser during the loop**. A single post-loop pass then finds nothing to act on — D6 rejects the now-missing file — and the Task Scheduler entry stays registered while the core is swept. One pass cannot be both "after the trusted entries" and "before they destroy the evidence"; two phases can. **Since round 3 D5a runs over every candidate D1 yields, recorded or not** (D10), which is what makes the phase order sufficient rather than merely necessary: no reverser can starve an unload, because no reverser's record was ever consulted |
| **D6** | **Act-time re-check — it governs REMOVAL only; the unload phase touches the filesystem not at all** | *Rewritten at design gate round 9, which removed the last act-time exception rather than adding one.* **Phase D5a performs NO filesystem check.** Its whole input is the disclosed list; for each item it re-derives the unregister argv purely from `path.basename(item.path)` via `deriveUnloadArgv` (`generators.js:140`, which reads no filesystem — verified, zero `fs.` uses in its body) and spawns it through the chokepoint. A spawn failure is discarded exactly as **D13** describes. **Why the file's presence was never the right precondition:** the registration does not live in the file. On **win32** the XML is an *import source* — `schtasks /create /tn <task> /xml <path> /f` (`schedule.js:416`) copies it into the Task Scheduler store, so deleting the XML leaves the task registered. On **launchd** a booted job stays loaded in the domain until it is booted out or the session ends, plist or no plist. On **systemd** the enablement is a symlink in `timers.target.wants/` plus the manager's loaded state, neither of which is the unit file. So a vanished file proved nothing, and dropping the unload on `ENOENT` recreated the orphan with **no spawn attempted** — outside `R-failed-unload` again. **Phase D5b** is where the act-time re-check now lives, and it governs **removal** only: it acts solely on items D5a processed, never re-admitting or adding one, and applies **D15**'s uniform rule with **absence = skip** (nothing to remove) and any other failure = **skip, with a notice**. **Skipping is now genuinely safe, and for a different reason than the one round 7 falsified:** a D5b skip forgoes a *deletion*, never an *unload*, because the unload already happened unconditionally. What it can leave behind is a STANDALONE artifact — and where that artifact is a launchd plist, it is exactly Table R row **R9**'s class, so D5b prints R9's plain-language warning at that moment |
| **D7** | **Consent integrity** | The existing byte-exact manifest comparison (`uninstall.js:379-391`) is **unchanged and insufficient on its own** for this set — it compares the manifest, and the disk-derived set is not in the manifest. What makes that set consent-safe is D2 + D4 + D6 together: discovered once before disclosure, passed by value into both `reverse()` calls, and only ever shrunk at act time. **Round 3 did not weaken this and slightly strengthens it:** the set no longer depends on the manifest's contents at all, so a concurrent manifest edit during the prompt cannot change which files are acted on. **Round 9 strengthens it again, and the two halves are now stated separately:** for the **unload**, the acted set **equals** the disclosed set exactly — D5a acts on the disclosed list and nothing else, in either direction; for the **removal**, the acted set is a **subset** of the disclosed set, because D5b can only skip. Nothing outside the disclosed list is ever unloaded or deleted — only the byte-compare's own abort, and D11's already-fixed `remove` flags, depend on the ledger. This is the property acceptance criterion 3 asserts |
| **D8** | **Dry-run** | In dry-run the widened pass prints and removes nothing, exactly as `reverseSchedulerEntry:526-527` behaves |
| **D9** | **An unreadable root is NOT an empty root** | *Design gate round 1, finding 1.* A root that **does not exist** (`ENOENT`/`ENOTDIR` from `readdir`) contributes nothing and is not an error — a root Wienerdog never wrote to is genuinely empty. **Any other enumeration failure** (`EACCES`, `EPERM`, `EIO`, `ELOOP`, `EMFILE`, …), any candidate `lstat` that fails for a reason other than `ENOENT`, and **any resolution failure anywhere in discovery** — root, candidate or vault path (**D15**) — marks the relevant **root** unreadable. The act-time sibling of this abort is **D6**'s, on the same rule. Discovery therefore returns `{schedules, unreadable}` (Exact contracts), and `uninstall` **aborts before printing the plan, having deleted nothing**, when `unreadable` is non-empty; the message names each directory and its `code`. `--dry-run` does not abort — it prints the unreadable roots as a warning block and continues, because it deletes nothing. **Why this is not the deferred residual:** with scheduler authority present the live probe is short-circuited (`uninstall.js:208`), so a silent empty result would let `reverse()` and then `disposeCoreMechanics` run **without anything ever having looked** at the directory holding an unrecorded live job — no unload *attempted*, which is R-stripped-manifest-orphan itself, not `R-failed-unload`'s *attempted-and-failed* |
| **D10** | **Coverage never suppresses an unload — discovery does not read the manifest at all** | *Design gate round 3, the convergence move.* Three rounds found three distinct ways for a record to look like coverage while no unload ever ran: a record of the **wrong kind** (round 1 — `validateEntry`, `manifest.js:1044`, checks shape, and a `{kind:'file'}` entry under `~/Library/LaunchAgents` is preserved untouched because `withinAllowedRoot`'s roots are `[core, claudeDir, codexDir, ~/.local/bin]`, `:742`, gate `:872-883`); an **in-root symlink alias** whose lexical basename derives no argv (round 2 — `reverseSchedulerEntry` resolves at `:512` but derives from the lexical basename at `:524`, while `withinSchedulerRoot`'s basename test is loose, `:558`); and — round 3, executed against mocked I/O — an alias record satisfying **every** condition the first two rounds added, whose own filesystem evidence a **later** `file` record deletes during replay, after which its reverser fails realpath containment and `schedulerSpawn` receives **zero** calls. **The predicate is not refined again.** `docs/runbooks/codex-review.md`'s convergence rule is that the loop converges by freezing surface, not by patience, and a suppression rule that must anticipate what the rest of the replay will do to its own evidence has no closed form. **So there is no coverage predicate:** phase D5a unloads every candidate D1 yields, recorded or not, before any manifest reverser runs. The manifest's only remaining influence on this package is **D11**, which narrows a removal. **The names follow the design:** the discovery function is `discoverSchedulesOnDisk` and `reverse()`'s option is `discoveredSchedules`, because after round 3 neither is about what the ledger does or does not record |
| **D11** | **What a manifest record still does: narrow the REMOVAL** | When **any** entry accepted by `validateEntry` (`manifest.js:1044`) names a discovered path after realpath resolution, that item carries `remove: false`: phase D5a still unloads it and phase D5b prints `keep <path> (another manifest entry owns this file)` instead of removing it, whatever Table R row R4's cell says. That entry's own reverser owns the file's lifecycle — a `scheduler-entry` removes it itself (`:543`), and a `file` entry may hold a proof-before-delete this pass cannot evaluate (its `hash` gate, `:890`). **This rule is safe in a way a coverage rule is not:** it only ever makes uninstall delete *less*, so a forged, stale or evidence-losing record cannot use it to leave a job running — the unload has already happened. Unload and removal were always separate questions; three rounds are what established that only the removal side may be answered from the ledger. **Where this narrowing has a cost, it is named:** Table R row **R9**, `R-preserved-reloadable-plist` |
| **D12** | **Vault exclusion** | *Design gate round 1, finding 3.* Discovery takes the **accepted vault path** — the same value `uninstall.js:309` reads from `config.yaml` before the confirm and already hands to `disposeCoreMechanics` (`:320`, `:410`) — as `opts.vaultPath`, and excludes any candidate that equals or resolves inside it — resolved through **D15**'s rule, **not** `contains`, so an unresolvable vault path is *unreadable* and aborts rather than quietly excluding nothing — reporting each exclusion in a `skippedForVault` list the caller discloses. **Why this is load-bearing:** `disposeCoreMechanics` deliberately protects a legacy or hand-edited install whose vault sits inside a mechanics dir (`manifest.js:1123-1127`, `:1144-1147`). With the vault at `<core>/schedules`, a user-authored `wienerdog-notes.xml` satisfies every other D1 clause, and the widened pass would delete it **before** the protected sweep ever ran — a user file that survives today. **The act-time re-check does not re-derive it**, and does not need to: the value is read once pre-confirm and is the same value `disposeCoreMechanics` acts on, so re-deriving it could only disagree with the disclosed plan |
| **D13** | **The DOUBLE UNLOAD D10 buys, and why it is tolerated** | Because D5a no longer excludes recorded paths, a normal install's every job is unloaded twice: once in D5a, once by its own `scheduler-entry` reverser. **The second attempt cannot fail the uninstall, and this is a property of the shipped code rather than of the tools:** `reverseSchedulerEntry` wraps the spawn in `try/catch` and **discards the result** (`manifest.js:532-536`), under a comment that already anticipates exactly this — *"Best-effort: the entry may already be unloaded. Ignore non-zero/errors"* (`:529`). Nothing reads the status, so no exit code reaches a decision; this package adds no propagation, which is `R-failed-unload`'s work package, not this one. Per platform, the second attempt's expected outcome — and in every case it is discarded at the same line: **launchd** `launchctl bootout gui/<uid>/<label>` on an already-booted-out label exits **non-zero** (no such process); **systemd** `systemctl --user disable --now <unit>.timer` on an already-disabled unit exits **0**, and non-zero only if the unit file is gone; **schtasks** `/delete /tn \Wienerdog\<name> /f` on a missing task exits **non-zero**. **Two costs, stated rather than hidden:** one extra `schedulerSpawn` per recorded scheduler entry, and — on a run without scheduler authority — one extra refusal line per entry on stderr (ADR-0041 Decision 1). Neither changes an outcome. **What this rules out:** any design in which D5a's unload is skipped because a record exists. Recording what D5a unloaded in order to suppress the *recorded* reverser's attempt was weighed and **not taken** — it re-introduces a suppression channel to save a spawn whose result is already discarded |
| **D14** | **The DISCOVERY root set — narrower than `reverse()`'s, and derived from this run's own paths** | *Design gate round 4; the classification below is round 5.* `reverse()` computes three roots at `manifest.js:753-757`; **discovery accepts only those resolving inside `paths.home` or `paths.core`** — see **D15** for how that resolution is performed, because doing it with `contains`'s bare boolean is itself a defect. Per root: **LaunchAgents** is `path.join(home,'Library','LaunchAgents')` (`generators.js:89`) — inside `paths.home` by construction, always accepted. **The Windows XML root** is `path.join(paths.core,'schedules')` (`manifest.js:756`, matching `windowsTasksDir`, `generators.js:546`) — inside `paths.core` by construction, **never `APPDATA`-derived or otherwise ambient**, always accepted. **The systemd user dir** is `(env.XDG_CONFIG_HOME \|\| home/.config) + /systemd/user` (`generators.js:99-103`) — the one root an **ambient environment variable can move outside the home this run is reversing**, and the one this rule exists for. **Why a test fix alone is not the fix:** the escape is a property of the root derivation, not of any caller. `realSchedulerAuthority` (`spawn.js`, ADR-0041 Decision 1) does **not** cover it — it compares `getPaths().core` to `<os.userInfo().homedir>/.wienerdog` and gates the **mutation chokepoint**, whereas the damage here is an `fs.rmSync` on a file outside the sandbox, which no spawn guard can reach. **Named residual — `R-external-xdg-root-undiscovered`:** on an install whose `XDG_CONFIG_HOME` genuinely points outside `$HOME`, unrecorded systemd units there are **not discovered**. Recorded ones still reverse normally, because `reverse()`'s own `schedulerRoots` and `withinSchedulerRoot` are unchanged. That is strictly narrower than today's behaviour and is the direction ADR-0038 permits |
| **D15** | **ONE resolution rule, over EVERY path this package resolves — in discovery, and at act time for REMOVAL** | *Design gate round 5 for roots; generalized in round 6, which found the identical defect one level down.* `contains` (`manifest.js:1097-1108`) catches **every** `realpathSync` error and returns `false` (`:1103-1104`), and `withinSchedulerRoot` (`:555`) is built on it — so an `EACCES`/`EIO` anywhere reads as *not contained*, which for a **recorded** entry means *preserve* (correct) but for **discovery** means *silently drop a live job*. Round 5 closed it for roots; round 6 injected a fault at the **candidate** and reproduced it exactly — roots resolve, `lstat` reports a regular file, the candidate's own `realpath` throws, `D9` sees nothing, nothing is unloaded, the core is removed around the live registration. **The rule is therefore stated once, over every path this package resolves — each root, each candidate, D12's vault path, and D5b's removal re-check — rather than per site:** `ENOENT`/`ENOTDIR` = **absent** (contributes nothing, excludes nothing, not an error); **any other code = unreadable**, reported as `{root, code}` and aborting a non-dry-run `uninstall` through **D9** before any mutation; and **only a SUCCESSFUL resolution may classify a path as external or contained**. Failing to resolve `paths.home` or `paths.core` is unreadable for **every** root, not a silent exclusion of all of them; an unresolvable **vault** path is unreadable too, never "nothing to exclude" (D12). **Discovery therefore calls neither `withinSchedulerRoot` nor `contains`** — it uses its own error-surfacing resolver for containment, and it needs nothing else from `withinSchedulerRoot`, whose loose basename half (`:558`) R2 already supersedes (Table R row R3). **Neither helper is changed:** their fail-closed boolean stays correct for `reverseSchedulerEntry` (`:512`), the vault guard in `disposeCoreMechanics` (`:1144`) and every other caller, where an unresolvable side should mean *preserve*. **There is no exception.** Round 7 falsified the one this row used to carry — that an act-time failure "can only preserve" — by measuring the whole uninstall rather than the one path: the core came off around a live job that was never unloaded. **Absence is the single special case, at every site:** `ENOENT`/`ENOTDIR` means the path is not there, which excludes nothing and aborts nothing. Everything else stops the run before it mutates — which after round 9 means **D9**, in discovery, and **only** D9: phase D5a resolves nothing, and phase D5b's re-check can only ever **skip a removal** (**D6**). The rule now has exactly one abort site, and the unload can no longer be conditioned on anything a filesystem error could answer |

### Table S — security rows (canonical)

| Row | Threat | What holds |
|---|---|---|
| **S1** | An attacker plants `~/Library/LaunchAgents/ai.wienerdog.evil.plist` — a name that **does** match R2 | It is unloaded and (under R4) removed. **That is the intended blast radius and it is bounded by the roots, not by the name.** the realpath containment stays the boundary — for recorded entries `withinSchedulerRoot` (`manifest.js:556`), and for discovery **D15**'s error-surfacing resolver with the same semantics plus an explicit failure outcome: nothing outside the three roots of `manifest.js:753-757` is ever touched by this path. An actor who can write into `~/Library/LaunchAgents` can already register a job as this user; deleting a file they planted there is not an escalation |
| **S2** | A symlink at a recognized name pointing outside the roots | Rejected by D1's `lstat` regular-file requirement before any derivation. This mirrors ADR-0027's round-2 amendment, which requires a **regular non-symlink** file in-root for the same reason |
| **S3** | A poisoned basename reaching an argv or a shell | Impossible by R2: fully anchored, matched on a basename, JS `$` without `m`, and the charset excludes `/`, `\`, `.` (beyond the literal prefix), and whitespace. The argv itself is built by `deriveUnloadArgv`, whose own regexes are equally anchored (`generators.js:145, :151, :156`) |
| **S4** | The manifest is used to *widen* | It is not. The manifest only **subtracts** from the discovered set (D1's last clause) and can therefore only make this package do less. An attacker who strips an entry gets the file *discovered*, which is the residual's closure, not a widening |
| **S5** | A root that is a symlink to somewhere else | `contains` realpaths both sides and fails closed on an unresolvable side (`manifest.js:1097-1108`), so a redirected root either contains the candidate after resolution or the candidate is rejected |
| **S6** | A root made unreadable to hide a live job — the **fail-open** direction | Closed by Table D row **D9**: an enumeration failure is not an empty directory, and a non-dry-run uninstall aborts having deleted nothing. Chmod-ing a root is a same-user act and not an adversary this package defends against; what matters is that the *accident* — a permission-damaged `~/Library/LaunchAgents`, an `EIO` — cannot read as "nothing to unload" while the core is disposed |
| **S7** | A hand-edited manifest used to **suppress** an unload | Closed by Table D row **D10**: discovery reads no manifest entry, so no record of any kind, shape or provenance can prevent an unload. The manifest's remaining influence is D11's, which only ever withholds a **deletion** — still the ADR-0038 direction. Three rounds of trying to make a suppression predicate safe are recorded in the row itself |
| **S8** | The widened deletion reaching a user's notes | Closed by Table D row **D12**: a candidate inside the accepted vault path is excluded from both unload and removal, preserving the protection `disposeCoreMechanics` already gives a nested vault (`manifest.js:1123-1127`, `:1144-1147`). Without it, a vault at `<core>/schedules` puts every user file whose name happens to match R2 inside this package's blast radius |
| **S9** | Another reverser destroying the evidence the unload needs — the **ordering** failure | Closed by Table D row **D5**'s two phases: every discovered unload is attempted **before** the manifest entry loop can delete its file. The win32 case is the live one — `<core>/schedules` is inside `withinAllowedRoot`'s root set (`manifest.js:742`), so a `file` record there really is deletable — and a hand-edited manifest could otherwise convert "covered by a record that unloads" into "deleted by a record that does not" |
| **S10** | A symlink alias, or any record whose own evidence disappears mid-replay, used as fake coverage | Closed by the same removal of the predicate (**D10**). Round 2 raised the alias that derives `null`; round 3 raised the alias that derives the *right* argv and is then stranded when a later `file` record deletes the symlink, so its reverser fails realpath containment and spawns nothing. Neither reaches a suppression decision any more, because there is none to reach |
| **S11** | Discovery running against a scheduler root **outside** the home this run is reversing | Closed by Table D row **D14**: a discovery root must be `contains`-inside `paths.home` or `paths.core`. This is the incident class ADR-0041 was written for, one level down — a sandbox that redirects `HOME` and forgets that `XDG_CONFIG_HOME` is not a file it moved. **ADR-0041's authority predicate does not cover it:** that guard gates the mutation chokepoint, and the damage here is an `fs.rmSync` no spawn guard sees. Measured on this tree: `tests/integration/uninstall-core-e2e.test.js` `tempEnv()` spreads `...process.env` (`:27`) and overrides only `HOME` (`:28`), while granting `WIENERDOG_ALLOW_REAL_SCHEDULER=1` (`:39`) — so clearance is granted and `WIENERDOG_LOADER_NOOP` (`:33`) suppresses spawns but not deletions. Under R4's `unload-and-remove` and without D14, `npm test` would delete a developer's real `~/.config/systemd/user/wienerdog-*.timer`. **Both fixes ship:** D14 in the root derivation, and the test's own `XDG_CONFIG_HOME` override |
| **S12** | **Any** path this package resolves — in discovery, or at act time for a **removal** — made **unresolvable** rather than unreadable | Closed by Table D row **D15**, stated once over roots, candidates and the vault path. `contains`'s fail-closed boolean (`manifest.js:1103-1104`) is safe for its other callers, where an unresolvable side means *preserve*; inside discovery it means *exclude*, which is the opposite direction. The gate measured it twice — an injected `EACCES` at root canonicalization (round 5) and an `EIO` at candidate canonicalization with roots and `lstat` both succeeding (round 6) — which is why the rule is uniform rather than per site. **Round 7 extended it past discovery:** an act-time `EIO` used to drop one path and let the uninstall proceed, removing the core around a job nothing had unloaded — measured as R-stripped-manifest-orphan recreated, with **no spawn**, so it is not `R-failed-unload` |
| **S13** | A schedule **file** removed to make its **registration** invisible | Closed by Table D row **D6**: the unload phase never consults the filesystem, so deleting the file between disclosure and the act changes nothing about what is unloaded. The registration was never in the file — the win32 XML is an import source (`schedule.js:416`), a booted launchd job outlives its plist, and a systemd timer's enablement is a `timers.target.wants/` symlink plus manager state. Measured by the gate at round 9 on the win32 path. Reachable by accident (a cleanup script, a sync) as easily as on purpose, which is why it is closed rather than named |

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
| `srm-act-time-recheck-dropped` | 3 | `src/core/manifest.js` | remove phase **D5b**'s removal re-check, so every disclosed item is **removed** unconditionally | `const schedulerOpts = {` — **1** | the criterion observes the removal set's narrowing direction, not just the happy path. **Scoped to removal since round 9:** the unload is unconditional by contract (**D6**), so a mutation that made *it* unconditional would change nothing and prove nothing |
| `srm-disposition-flipped` | 4 | `src/core/manifest.js` | apply the opposite arm of Table R row R4 at the D5 site | *new — authored by this package* | criterion 4 observes the disposition itself rather than the unload; it is the proof that keeps R4 a measurable cell under either ruling |
| `srm-unreadable-root-read-as-empty` | 9 | `src/core/manifest.js` | make the D9 enumeration `catch` return no `unreadable` entry, restoring the round-1 defect exactly | `const schedulerOpts = {` — **1** | *Round 1, finding 1.* Criterion 9 asserts an **abort**, and an abort assertion goes green whenever the run fails for any reason — or red-free whenever the mechanism never ran. Without this declaration nothing distinguishes "aborted because a root was unreadable" from "the fixture never made a root unreadable" |
| `srm-vault-exclusion-removed` | 11 | `src/core/manifest.js` | drop the D12 vault test from the candidate gate | `contains(dir, vaultPath)` in `disposeCoreMechanics` — **1** (the adjacent, unchanged use of the same predicate) | *Round 1, finding 3.* Criterion 11 asserts a user file **survives**, which is the most vacuity-prone shape in the repo's measured catalogue: a file also survives when discovery never found it, when the fixture's vault path was wrong, and when the widened pass never ran at all |

| `srm-unload-moved-after-loop` | 12 | `src/core/manifest.js` | move phase **D5a** back to after the manifest entry loop, restoring the single-pass shape | `for (const entry of [...manifest.entries].reverse()) {` — **1** | *Round 2, finding 1.* Criterion 12 asserts an unload **happened** for a file another reverser deletes during the loop. Without the declaration a suite that only ever fixtures files **no** manifest entry touches stays green under the mutation, because the ordering is unobservable unless the corpus contains the overlapping win32 case |
| `srm-record-suppresses-unload` | 13 | `src/core/manifest.js` | re-introduce a coverage exclusion into discovery: skip any candidate named by a validated manifest entry | `const removedSet = new Set([paths.manifest]);` — **1** (the adjacent, unchanged pre-loop region phase D5a is inserted before) | *Round 3, the convergence move.* Criterion 13 asserts that a candidate **covered** by a record — including the round-3 shape, a same-basename in-root symlink `scheduler-entry` whose own file a later `file` record deletes — is still unloaded. Under the mutation it is silently excluded and nothing unloads it, which is what three review rounds each measured. **This declaration replaces `srm-alias-counts-as-coverage`**, which pinned the old five-condition predicate that no longer exists |
| `srm-external-root-discovered` | 15 | `src/core/manifest.js` | remove Table D row **D14**'s containment filter, so discovery enumerates every root `reverse()` computes | `gen.systemdUserDir(paths.home, process.env), // $XDG_CONFIG_HOME||~/.config + /systemd/user` — **1** (the unchanged root the filter is applied to) | *Round 4.* Criterion 15 asserts that files under an external XDG root **survive**. A survival assertion goes green whenever the fixture's external root was never populated, never reached, or silently mis-pathed — and the thing it guards against is `npm test` deleting a developer's real timer, which is the one failure nobody gets to discover twice |
| `srm-resolution-failure-read-as-external` | 17 | `src/core/manifest.js` | collapse Table D row **D15**'s three outcomes to two at **any** of its resolution sites — root, candidate, vault path, or **D5b**'s removal re-check — i.e. treat a resolution error as *not contained*, which is what `contains`'s bare boolean already does | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is D15's classification, like `srm-disposition-flipped`'s | *Round 5.* Criterion 17 asserts an **abort with zero files removed** when a root cannot be canonicalized. Under the mutation the root is dropped silently and the run completes 'successfully' having unloaded nothing — green for any suite whose corpus never makes a root unresolvable, which is what the gate measured by injecting `EACCES` |

**Why round 1's finding 2 carries no declaration of its own.** Its criterion (10) asserts a
**positive** effect — the unload argv for the uncovered file reaching the
chokepoint — which cannot pass while the behavior is absent. Round 1's findings
1 and 3, round 2's finding 1 and round 3's all assert *absence* — an abort, a survival, an
ordering, a non-suppression — and absence assertions are the shape ADR-0042
exists for. The judgment of whether this declared set is complete
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
      → Table R rows R1/R2; `manifest.js` → Table D rows D1/D4/**D5**/D6 and
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
      **11** asserts Table D row **D12** and Table S row S8; criterion **12**
      asserts Table D row **D5** and Table S row S9; criterion **13** asserts
      Table D rows **D10**/**D11** and Table S rows S7/S10; criterion **14**
      asserts Table D row **D13**; criterion **15** asserts Table D row **D14**
      and Table S row S11; criterion **16** asserts the Deliverables row for the
      integration test; criterion **10** asserts Table D rows **D10**/**D11** and Table R row **R9**;
      criterion **18** asserts Table D rows **D6**/**D5** and Table S row S13;
      criterion **17** asserts Table D rows **D15**, **D12** and **D5b** and
      Table S row S12, at every resolution site including act time
- [ ] **Verification commands / greps** — the two `recognizeScheduleBasename`
      greps mirror Table R row R1's single-source requirement; the
      `/^ai\.wienerdog\..*\.plist$/` grep mirrors Table R row R3; the
      `discoveredSchedules = []` grep mirrors Table D row **D4**'s default; the
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
owner approving, accepting, ratifying or signing any of them, and this spec
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
  table above is therefore **CLOSED except for `R-preserved-reloadable-plist`**,
  which is added to that table as its own row below. Its row is kept and marked
  closed rather than removed, so the record of what was accepted between
  2026-09-01 and this date survives.

  | Residual | What stays open | Why it is not closed here |
  |---|---|---|
  | **R-preserved-reloadable-plist** | a recognized launchd plist named by a manifest entry of a **non-scheduler** kind is unloaded but preserved — the widened pass defers to that record and the file reverser does not remove it either, `~/Library/LaunchAgents` being outside its allowed roots — so the next GUI login re-registers it against a deleted core. The unload **succeeded**, so this is not `R-failed-unload` | reachable only through a hand-edited or corrupted manifest, and **strictly narrower than the behaviour it replaces**: the same install previously got no unload at all and the same surviving file. Removing it anyway would override another record's lifecycle, which is the deletion-widening question the work package already carries as an owner item. The uninstall plan warns the user in plain language, before consent, that the job returns at the next login until the named file is removed by hand |

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

**3. Should a preserved-but-reloadable plist refuse the uninstall instead?**

- *Recommendation:* **no — accept `R-preserved-reloadable-plist` (Table R row
  **R9**) with its mandatory disclosure**, and do not add a refusal.
- *The alternative, stated fully:* before the core teardown, `uninstall` detects
  that a discovered launchd plist is being preserved under D11 and **refuses
  retryably** — aborting with the manifest, core and files intact and a message
  naming the file and the offending record, so the user removes or corrects it
  and reruns. It is a real option: it is the same abort shape D9 and D6 already
  use, and it would leave no reloadable artifact behind.
- *Why it is not the default:* the only way out of the refusal, for a user who
  does not want to hand-edit their manifest, is for Wienerdog to delete a file
  another record owns — which **re-opens the deletion-widening question owner
  item 1 already carries**, one level deeper and without a ruling. A refusal that
  can only be cleared by taking the option the owner has not yet ruled on is not
  a neutral default.
- *Overrule cost:* an uninstall that **cannot complete** on a corrupted manifest
  until the user edits that file by hand — on a command whose whole purpose is to
  leave cleanly — in exchange for closing a residual reachable only by that same
  corruption. If overruled, R9's mitigation line becomes the refusal message and
  acceptance criterion 10 flips to asserting the abort.

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
- **Nine rows exist because the design gate found them, not because they were
  foreseen.** D9, D11 and D12 come from round 1; **D5**'s two phases from round 2; **D10**'s
  removal of the coverage predicate, and **D13**, from round 3; **D14** from
  round 4; **D15** from rounds 5, 6 and 7 — one rule, not one row per
  resolution site, and **D6** rewritten by round 7 and again by round 9; **R9** from round 8 (dispositions in
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
| Linux / systemd | **Discovery and the widened pass: yes, with one caveat.** Table D row **D14** means a test must place `XDG_CONFIG_HOME` inside its temporary `HOME` or the systemd root is not a discovery root at all. `reverse()` builds all three roots on every host (`manifest.js:753-757`), so the systemd user dir exists under a redirected `HOME` on darwin too and files planted in it are discovered and acted on identically. **The derived argv: assertion-by-fixture** — `deriveUnloadArgv` takes `platform` as a parameter (`generators.js:140`, "injected — never mock `process.platform`"), so the linux argv is asserted by injection, not by running on linux |
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
      — Table S row S4 — and it can no longer subtract an **unload** at all, only a
      deletion: Table D rows D10/D11, Table S row S7.
- [x] A failure to read a scheduler root cannot be mistaken for an empty one, so
      the safety decision never fails open — Table D row **D9**, Table S row S6.
- [x] The widened deletion never reaches a user's notes: the nested-vault
      exclusion `disposeCoreMechanics` already applies is carried into discovery —
      Table D row **D12**, Table S row S8.
- [x] The unload cannot be starved by another reverser deleting its evidence
      first — Table D row **D5**'s two phases, Table S row S9.
- [x] **The unload never depends on the filesystem** — phase D5a acts on the
      disclosed list and a basename-derived argv alone (Table D row **D6**, Table
      S row S13), so no file state, race or error can prevent an unload the user
      consented to.
- [x] **No resolution error is swallowed anywhere — in discovery or at act
      time** — roots, candidates, D12's vault path and D6's re-check all follow
      Table D row **D15**'s single rule, with absence (`ENOENT`/`ENOTDIR`) as its
      only special case; discovery calls neither `withinSchedulerRoot` nor
      `contains` (Table S row S12). Exclusion and failure must stay distinguishable, because
      those helpers' fail-closed boolean points the safe way for their own callers
      and the unsafe way here.
- [x] **Discovery never runs against a scheduler root outside the home this run
      is reversing** — Table D row **D14**, Table S row S11. The guard is the
      `contains` containment on `paths.home`/`paths.core`, **not** ADR-0041's
      authority predicate: that one gates the mutation chokepoint and cannot see
      an `fs.rmSync`. LaunchAgents and the Windows XML root are inside by
      construction; the systemd user dir is the only ambient-movable one.
- [x] **Where the ledger's removal-narrowing leaves a reloadable artifact, it is
      named and disclosed rather than silently accepted** — Table R row **R9**,
      `R-preserved-reloadable-plist`, reachable only through a hand-edited
      manifest and strictly narrower than `c05a575b`.
- [x] **No manifest record can suppress an unload at all** — the coverage
      predicate is gone, not refined (Table D row **D10**, Table S rows S7/S10).
      The ledger may only withhold a *removal* (Table D row **D11**), which is the
      one direction ADR-0038 permits an untrusted file to move a deletion in.
- [x] No new execution sink: the only argv is the re-derived one, through the
      existing chokepoint — Table R rows R6 and R7.

## Acceptance criteria

- [ ] **1.** On a manifest holding no `scheduler-entry` for a recognized schedule
      file that exists in a scheduler root, a non-dry-run `reverse()` given that
      path in `discoveredSchedules` reaches `schedulerSpawn` with the argv
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
      that stops qualifying before the act is **still unloaded** and is dropped
      **from the removal** with a notice (**D6** — the re-check is removal-only).
      The **unload** set (`reverse()`'s returned `discoveredSchedules`) **equals**
      the disclosed set; the **removal** set is a subset of it. Neither is ever a
      superset.
- [ ] **4.** The disposition of Table R row **R4** is observable and exclusive:
      under `unload-and-remove` the file is gone after the run; under
      `unload-only` the file is still present after the run. Exactly one arm is
      asserted, matching R4's cell; the other arm's observable is asserted **not**
      to occur.
- [ ] **5.** Security rows hold (Table S): a symlink at a recognized name inside a
      root is never acted on; a recognized name **outside** every root is never
      acted on; a foreign basename inside a root is never acted on.
- [ ] **6.** Backward compatibility: `reverse(paths, manifest, {dryRun})` with no
      `discoveredSchedules` behaves byte-identically to `c05a575b` — no
      discovery, no listing, no new I/O (Table D row D4).
- [ ] **7.** Idempotence. The template's "running the command twice" criterion is
      `N/A` for `uninstall` itself — the first run removes the manifest
      (`uninstall.js:424`) and the second refuses with "no install manifest
      found" (`:285-288`), which is today's behavior and is unchanged by this
      package. What this package must show instead: `discoverSchedulesOnDisk`
      run twice against an unchanged tree returns the identical array, and the
      widened pass run twice over the same list performs **zero repeated
      deletions** — every path was disposed of or skipped the first time. It
      **does** re-attempt each unload, because phase D5a is unconditional
      (**D6**); repeated unload attempts are the contract, not a defect, and
      Table D row **D13** is why they cost nothing.
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
- [ ] **10.** *(Round 1, finding 2, rewritten at round 8 — Table D rows
      **D10**/**D11**, Table R row **R9**, Table S row S7.)* A recognized schedule
      file named **only** by a schema-valid **non-`scheduler-entry`** record is
      **discovered and unloaded** — its derived argv reaches the chokepoint — and
      is **not removed**: the plan carries both the `keep … (another manifest
      entry owns this file)` line and **R9's plain-language warning** that the job
      will come back at the next login until the file is removed by hand. **A file
      named by a validated `scheduler-entry` is likewise still discovered**, with
      `remove: false`, and phase D5a attempts its unload **independently of** that
      entry's own reverser (D10, D13) — recording a file never excludes it from
      discovery.
- [ ] **11.** *(Round 1, finding 3 — Table D row **D12**, Table S row S8.)* With
      the accepted vault path at `<core>/schedules`, an unrecorded file there
      whose basename satisfies R2 is neither unloaded nor removed; it is reported
      as vault-skipped and is **still on disk after the run**, exactly as it is on
      `c05a575b`.
- [ ] **12.** *(Round 2, finding 1 — Table D row **D5**, Table S row S9.)* On
      win32, a `<core>/schedules/wienerdog-dream.xml` covered **only** by a
      schema-valid, deletable `{kind:'file'}` record is **unloaded** — its derived
      `schtasks /delete` argv reaches the chokepoint — even though the file
      reverser deletes that same file during the manifest entry loop. Asserted by
      observing the unload, not merely the file's absence, which the file reverser
      produces on its own.
- [ ] **13.** *(Round 3 — Table D rows **D10**/**D11**, Table S rows S7/S10.)*
      **No manifest record prevents an unload.** Asserted over at least the three
      shapes the gate measured: a record of another kind; a `scheduler-entry`
      naming an in-root same-basename symlink that derives **no** argv; and the
      round-3 combination — a `scheduler-entry` for an in-root same-basename
      symlink resolving to an unrecorded `schedules/wienerdog-dream.xml`, with a
      **later deletable `file` record for the XML itself**. In every one the
      candidate is discovered and its derived argv reaches the chokepoint. Each
      record that names a discovered path still yields `remove: false`.
- [ ] **14.** *(Table D row **D13**.)* A recorded job's unload is attempted
      **twice** — once by phase D5a, once by its own `scheduler-entry` reverser —
      and a **non-zero second attempt does not fail the uninstall**: the run exits
      0 and every other reversal completes. Asserted by counting chokepoint calls,
      so the duplicate is observed rather than assumed.
- [ ] **15.** *(Round 4 — Table D row **D14**, Table S row S11.)* With
      `XDG_CONFIG_HOME` pointing at a directory **outside** the run's `HOME` and
      `paths.core`, and recognized schedule files planted there, a non-dry-run
      `uninstall` leaves **every one of them on disk and unloaded-untouched**: the
      external root contributes no candidate, appears in no disclosed plan, and
      produces no chokepoint call. The same files placed under an XDG root
      **inside** the run's `HOME` **are** discovered — so the criterion measures
      the containment rule, not merely that discovery found nothing.
- [ ] **16.** `tests/integration/uninstall-core-e2e.test.js` sets
      `XDG_CONFIG_HOME` inside its temporary `HOME` (Deliverables). Asserted by
      the test's own environment, not by inspection: the value it passes resolves
      under its `root`.
- [ ] **17.** *(Round 5 — Table D row **D15**, Table S row S12.)* When a
      scheduler root cannot be canonicalized for a reason other than absence —
      asserted for at least `EACCES` and `EIO` — a non-dry-run `uninstall`
      **aborts naming that root and its code, with zero files removed and zero
      chokepoint calls**. `ENOENT`/`ENOTDIR` on the same root does **not** abort,
      and a root that resolves **outside** `paths.home`/`paths.core` is excluded
      **without** aborting. **Fourth outcome, round 6:** with every root resolving
      and `lstat` reporting a regular file, a **candidate** whose own `realpath`
      throws `EIO` also aborts with zero files removed — the resolution rule is
      asserted at more than one site, which is the whole point of stating it once.
      An unresolvable **vault** path (D12) aborts on the same rule. **Fifth
      outcome, rounds 7 and 9 as the contract now stands:** the act-time site is
      phase **D5b** and it governs **removal only**. With discovery and
      disclosure both succeeding, an `EIO` from D5b's re-check leaves that
      **file on disk with a notice** — and, for a launchd plist, Table R row
      **R9**'s plain-language warning — while its **unload has already been
      attempted** in phase D5a, which performs no filesystem check at all
      (**D6**). It does **not** abort: the run completes, because a skip there
      forgoes a deletion, never an unload. `ENOENT` at D5b is the same skip with
      nothing to notice.
- [ ] **18.** *(Round 9 — Table D rows **D6**/**D5**, Table S row S13.)* When a
      disclosed candidate is **deleted after discovery and before phase D5a** —
      the confirmation-prompt window — its unregister argv **still reaches the
      chokepoint**, and the run completes. Asserted by counting chokepoint calls
      with the file absent, on the win32 XML path the gate measured and on at
      least one POSIX path. Conversely, phase **D5b** removes nothing for that
      item and prints no removal line. **No RED declaration is attached:** this
      criterion asserts a *positive* effect that cannot pass while the behaviour
      is absent, the same reason round 1's finding 2 carries none.
- [ ] **19.** The declared RED proofs of Table B are `PROVEN` in an **UNFILTERED**
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
test -f src/core/manifest.js && grep -n 'discoveredSchedules = \[\]' src/core/manifest.js

# ADR-0041: the amendment landed (criterion 8).
test -f docs/adr/0041-real-scheduler-mutation-is-opt-in.md \
  && grep -n 'R-stripped-manifest-orphan is closed' docs/adr/0041-real-scheduler-mutation-is-opt-in.md
test -f docs/adr/0041-real-scheduler-mutation-is-opt-in.md \
  && grep -n 'ACCEPTED under standing authorization 2026-09-18' docs/adr/0041-real-scheduler-mutation-is-opt-in.md

# ...and its owner signature header did not move or change (criterion 8, ADR-0035).
# Both must print, at lines 3 and 4 respectively, exactly as at c05a575b.
grep -n '^Status: Accepted$' docs/adr/0041-real-scheduler-mutation-is-opt-in.md
grep -n '^OWNER-SIGNED 2026-08-31$' docs/adr/0041-real-scheduler-mutation-is-opt-in.md

# The declared RED proofs (criterion 19) — UNFILTERED.
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
6. **DISPATCH PRECONDITION.** (a) **The design gate is CLOSED — 2026-09-18, at
   round 10** (`docs/runbooks/codex-review.md`, "Weighted closure"). Rounds 1–9
   each carried band-A HEAVY findings; **round 10 returned LIGHT only** —
   machinery, not product: acceptance criteria stale against the round-9
   contract, fixed in the same pass with no external round needed. Each round's
   raw and focus were committed **before adjudication**: `4b800517` (r1),
   `244d0cfc` (r2), `dcf46033` (r3), `b78ccba7` (r4), `868f578e` (r5),
   `07d2df2a` (r6), `c3f9557a` (r7), `a6734862` (r8), `9a32963b` (r9),
   `befb29b5` (r10); the dispositions table is
   `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-review.md`.
   **This is a review gate, not owner approval:** nothing in this repository
   records the owner approving, accepting, ratifying or signing this package, and
   the ADR-0041 amendment it drafts carries **"owner signature pending"**. **Round 1 (Astra) returned `needs-attention`
   with three band-A HEAVY findings, all accepted and applied** — raw and focus
   committed before adjudication at `4b800517`, dispositions in
   `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-review.md`.
   **Round 2 returned `needs-attention` with two further band-A HEAVY findings**
   (raw at `244d0cfc`) and **round 3 with one more** (raw at `dcf46033`), all
   accepted and applied. **Round 4 confirmed the simplified design held** — D1,
   D5, D10, D11 and D13 were not re-opened — and returned one further band-A
   HEAVY finding (raw at `b78ccba7`), also accepted and applied as **D14**.
   **Round 5 held D14 as a design** and found one more, inside the candidate
   gate (raw at `868f578e`), applied as **D15**; **round 6 found the same defect
   one level down** (raw at `07d2df2a`) and D15 was **generalized** into a single
   resolution rule rather than duplicated per site; **round 7 falsified that
   rule's one stated exception** (raw at `c3f9557a`) and **D6** was rewritten so
   the rule holds at act time too. **Round 8 held D6/D15** (raw at `a6734862`)
   and produced one band-A HEAVY finding, closed as the **named residual**
   `R-preserved-reloadable-plist` (Table R row **R9**) with owner item 3 as its
   overrule path, plus one band-B LIGHT mirror-drift fix in acceptance
   criterion 10. **Round 9 held R9, the amendment and D3** (raw at `9a32963b`)
   and produced one band-A HEAVY finding, closed by making the unload phase
   filesystem-free (**D6**). Round 3 froze the surface: D5a unloads everything
   recognized, and further findings are fixed within that shape or accepted as
   named residuals. The gate is therefore **open**, and at least one further
   round is required. **A review gate is not owner approval:** nothing
   in this repository records the owner approving, accepting, ratifying or
   signing this package. (b) **Owner items 1, 2 and 3 remain OPEN**, travelling with this package as
   recommendations in the standing form; the owner reverses either by dated
   amendment, applied by a committed revision.
