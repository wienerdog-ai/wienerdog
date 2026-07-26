---
date: 2026-07-25
title: A leaked test fixture hijacked the loaded catchup record for 76 hourly runs while every health check reported it loaded
related_wps: [WP-070, WP-071, WP-161, WP-scheduler-entry-identity, WP-scheduler-loaded-record-tripwire, WP-dev-descriptor-no-tree-hash]
---

# A leaked test fixture hijacked the loaded catchup record for 76 hourly runs while every health check reported it loaded (2026-07-25)

**A leaked test fixture hijacked the loaded catchup record for 76 hourly runs
while every health check reported it loaded (2026-07-22 → 2026-07-25).** The
plist file on disk was correct the whole time. `launchctl print
gui/501/ai.wienerdog.catchup` was not: it reported argv
`/var/folders/…/T/wd-negative-UezlJP/core/launcher/launch.js`, `WIENERDOG_HOME`
and both log paths under that same temp core, `runs = 76`, `last exit code = 1`.
`wd-negative-` is the mkdtemp prefix at
`tests/scenarios/negative/run-negative.js:470` — a negative-scenario run
bootstrapped a catchup agent from its temp core and, because **launchd labels
are per-user-global** (the ADR-0018 invariant), *overwrote* the real
`ai.wienerdog.catchup` record; the run's `finally` then `rmSync`'d the launcher
it had just registered. Every hourly fire since died with `MODULE_NOT_FOUND` at
node module load — **before any Wienerdog code ran**, so there was no refusal,
no durable alert and no product log. Its stderr went to the temp path, which
launchd kept recreating (59 KB of stack traces), while
`~/.wienerdog/logs/catchup/launchd.err.log` sat at 0 bytes with an mtime of
2026-07-07.

**This is the third recurrence of one class, and it survived the WP built to
stop it.** After the 2026-07-07 silent-unload incident, **WP-070/WP-071** added
the `scheduler-status.json` probe; **WP-161** added the scenario leak guard
after the 07-21 `wd-gates.FIVyz2` and 07-22 `wd-negative-UezlJP` leaks, and
merged only after a five-round double gate. Both fixes check the wrong artifact.
`src/scheduler/status.js:85` is `return r.status === 0 ? 'loaded' : 'missing';`
— `launchctl print` exits 0 for a hijacked entry, so `scheduler-status.json` and
`wienerdog doctor` reported `catchup: "loaded"` through all 76 failures; it tests
**presence, never identity**. `tests/scenarios/scheduler-guard.js:282`
(`assertNoRealSchedulerLeak`) scans `~/Library/LaunchAgents` for stray plist
**files**, but a registration that clobbers an existing *label* leaves no new
file behind, so the guard passed clean on the very run that did the damage. A
human made the same substitution: on 07-23 a repair session inspected the plist
files, found them clean, and recorded *"catchup plist clean"* while the loaded
record was already poisoned. **Identity, not presence, is the invariant**, and
all three observers — two automated, one human — read the artifact that was fine.

**It was also diagnosed wrong twice, the same way both times.** The 07-24
investigation concluded "the scheduler is down — both jobs" and that the broken
digest was "accidentally protecting the vault"; the 07-25 04:00 correction
narrowed it to "catchup genuinely fails on the app-tree digest hourly, exit 1,
no log, since ~07-21." Both were coherent, both were written into project
memory, both were acted on, and both were false — nobody had run `launchctl
print`. The standing lesson from 07-25 ("verify the effect, not just the
mechanism") was restated by the very next diagnosis that broke it. And the
substitute diagnosis was wrong in its *substance* too, not merely in being the
wrong cause: hashing `.git` was recorded as "the `.git`-in-digest defect", but on
a prod install hashing `.git` is precisely what **pins** a planted `.git`, so
excluding it would have removed protection rather than restoring any. What is
real is narrower and lives on the dev path only — content-addressing a **live**
checkout means a concurrent `git`/`npm` write can vanish a file mid-walk, and
that `ENOENT` surfaces as a *refusal* on the nightly dream
(`src/scheduler/launcher.js:326-328`), which `catchUp` then mislabels as "it is
authorized but no longer in your config" (`src/cli/run-job.js:1136-1145`).
**WP-dev-descriptor-no-tree-hash** owns exactly that and nothing more: the dev
descriptor stops hashing the tree. The larger design it began as — teaching
catch-up to run on a dev install — was **rejected** after two adversarial rounds
showed it relocating the same A7 downgrade twice (first an inherited
`WIENERDOG_DEV`, then a `.git` planted before the attended sync), and after the
observation that the shipped code is safe today precisely because plant-then-sync
re-mints a `sha256:` over the planted file. WP-157's catch-up refusal on a dev
install therefore **stands**, and the durable rule drawn from it is that no
mechanism may select between the enforced and reduced verification paths on a
signal an A7-scoped write can produce — at mint time as much as at fire time.

**Two work packages close the class, and neither closes it alone** —
`WP-scheduler-entry-identity` (the product probe and the darwin heal) and
`WP-scheduler-loaded-record-tripwire` (the harness observer); each carries an
explicit statement that it is insufficient by itself, because a fix on either
side alone leaves the other blind. The probe reads the loaded record back and
compares `argv[1]` (the Windows `<Arguments>` token) against
`<core>/launcher/launch.js`, growing the taxonomy from `loaded | missing |
unknown` to add **`mismatched`** (a doctor hard fail) and **`unverified`** (a
warn), with all three of `{missing, mismatched, unverified}` healed by `sync`.
The tripwire's `assertNoLoadedSchedulerLeak` enumerates *loaded* records and
fails the run on any argument under a temp prefix — with the whole OS temp dir
as its prefix set, not just the current run's root, which is precisely why the
07-22 record slipped past WP-161's gate. Because the guard runs inside the
harness that does the leaking, it takes no `env` parameter, reads no file,
invokes `/bin/launchctl` by absolute path, and deliberately ignores
`WIENERDOG_LOADER_NOOP` / `WIENERDOG_TEST_NO_REAL_SCHEDULER` — honoring them
would let the leaking configuration switch off its own detector. One capability
had to ship alongside the advice: on darwin the heal must be able to *replace* a
loaded record at all, because `bootstrap` alone fails on an already-loaded label
— which means that until now the alert text *"run `wienerdog sync`"* was a lie
against exactly this failure. The ordering took a round to get right: an initial
`bootout`-then-`bootstrap` was rejected because `unverified` sits in the heal set
and can describe a perfectly healthy entry whose program merely could not be read
back, so tearing it down first risked leaving the user with **no** scheduled job
— strictly worse than a hijacked one. The shipped order is **`bootstrap` first,
`bootout` only after launchd refuses**, which touches nothing until there is
evidence the replacement is blocked. The live entry was repaired by hand on
2026-07-25 with `bootout` + `bootstrap`; it now refuses loudly and correctly on
the dev-stance containment check, with a durable `state/alerts.jsonl` entry.
Amends ADR-0018 (both the "exit 0 = loaded" rule and the "a missing entry is
never a hard fail" scope).
