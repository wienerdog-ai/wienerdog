# ADR-0041: A real OS-scheduler mutation is permitted only from the home it belongs to; the default is refuse

Status: Proposed
Date: 2026-08-31

> **Unsigned.** No agent may write, move or reformat an owner signature line
> (ADR-0035's discipline). Ratifying this ADR is the owner's act; until then
> `WP-scheduler-mutation-home-authority` is not dispatched.

## Context

`launchd`'s `gui/$UID` domain, `systemd --user`, and per-user Task Scheduler
tasks are **per-user-global**: their identifiers are keyed by the OS user, not by
`$HOME`. Every Wienerdog *file* path is `$HOME`-derived — `getPaths()` computes
the core as `$WIENERDOG_HOME || <$HOME>/.wienerdog`
(`src/core/paths.js:54-55`). So redirecting `HOME` sandboxes the whole file
namespace and **none** of the scheduler namespace. A process running against a
throwaway core therefore registers, replaces and boots out the *live* user's
`ai.wienerdog.*` services.

This is the second recorded instance of that exact class. The first is ADR-0018
Decision 2 (`docs/adr/0018-windows-scheduled-dreaming.md:165-179`), which stated
the invariant — *"launchd/systemd/schtasks identifiers are per-user-global, NOT
HOME-scoped"* — and closed it **for the unit suite only**, with one chokepoint
(`schedulerSpawn`, `src/scheduler/spawn.js:24-36`) plus an **opt-out** env var
that only the test runner sets (`tests/run.js:7`).

The second instance is issue #169. `scripts/smoke-install.sh` runs the real CLI
lifecycle under a redirected `HOME` (`:28-31`) and is not the test runner, so it
sets nothing. Run locally on a machine with a live install, its catch-up teardown
loop (`:117-121`) and its `uninstall` (`:128`) resolved to the maintainer's live
`ai.wienerdog.dream` and `ai.wienerdog.catchup` and removed both from launchd.
The script's own header states the assumption that was violated — *"on a clean CI
runner, where nothing collides"* (`:8-10`) — and nothing enforced it.

Measured on this tree (HEAD `a6e0803`), from a `mktemp -d` `HOME` with neither
guard variable set, `schedulerSpawn(['true'])` returns `{status:0}` having really
spawned. That is the defect in one line: **the chokepoint's default is to
mutate.**

Three facts bound the fix, all verified on this tree:

1. `schedulerSpawn` has exactly **three** call sites in `src/`
   (`src/cli/schedule.js:22`, `src/scheduler/generators.js:1107`,
   `src/core/manifest.js:533`) — the chokepoint really is one.
2. Every path that reaches those call sites originates in an **attended CLI
   command**: `init`, `adopt`, `sync`, `schedule`, `uninstall`, and `update`
   (which re-enters through `sync`). Nothing the OS scheduler spawns mutates the
   scheduler: `src/scheduler/launcher.js` and `src/cli/run-job.js` contain no
   call to `schedulerSpawn`, `repointSchedules` or `teardownCatchup`, and
   `run-job`'s only scheduler contact is the read-only probe in
   `src/scheduler/status.js`. **There is no unattended legitimate mutation path
   that would need an opt-in marker threaded into it.**
3. `os.userInfo().homedir` does **not** follow `$HOME` on POSIX — measured on
   darwin: with `HOME=/tmp/fake-home`, `os.homedir()` returns `/tmp/fake-home`
   and `os.userInfo().homedir` returns the passwd home. It is the one home value
   a `HOME` redirect cannot move, and it identifies the same user whose
   per-user-global scheduler domain the mutation would land in.

## Decision

**A real OS-scheduler mutation is performed only when the Wienerdog core it is
being performed for is the core that this user's scheduler namespace belongs
to.** Concretely, `schedulerSpawn` refuses unless the resolved core
(`getPaths().core`) is the same directory as `<os.userInfo().homedir>/.wienerdog`
— or the explicit opt-in `WIENERDOG_ALLOW_REAL_SCHEDULER=1` is set. A refusal
spawns nothing, writes one line naming the skipped argv and the opt-in to stderr,
and returns a non-zero `status` through the existing return shape. The two test
variables keep their current precedence ahead of it.

The rule this establishes, in one sentence:

> **The file namespace and the scheduler namespace must belong to the same user
> before anything mutates the scheduler. A redirected `HOME` sandboxes the files,
> so it must also stop the mutation — the default is refuse, and reaching the
> real scheduler from anywhere else is an explicit, single-variable opt-in.**

This is a **coherence** check, not a trust check. It is not a security control
and must never be described as one: the same user can set the variable, and any
code that could plant a fake home could set it too. Its threat model is the
developer accident — the sandbox that isolates every file and forgets that
`gui/501` is not a file.

### Why not the alternatives

| Option | Why not adopted |
|---|---|
| **Guard the script only** (issue #169 fix 1) | Closes the entry point that bit, not the class. The measured leak surface is wider — 16 real mutation attempts from the suite without the guard variable. Adopted **as well**, as `WP-smoke-live-scheduler-preflight`, because it is cheap, needs no ADR, and covers the window before this one ships |
| **Marker set by `bin/wienerdog.js`** | Vacuous. The smoke script's entry point *is* `node <repo>/bin/wienerdog.js` — the same file the real CLI uses |
| **Marker set only by interactive/TTY runs** | The incident ran `WD init --yes --fresh-vault </dev/null`; TTY state is an accident of redirection, not of intent, and it makes CI and `--yes` legitimacy indistinguishable |
| **Refuse on a dev checkout** (`isDevCheckout(packageRoot())`) | Measured fail-broken: the maintainer's own install is dev-stance (`~/.wienerdog/app/current` → the git checkout), so this refuses his `wienerdog sync` — the very command issue #169 names as the repair. He would set the variable permanently and re-open the hole for exactly the person it bit |
| **`installStance(paths) === 'prod'`** | Wrong polarity. `installStance` fails **closed to `'prod'`** by design (`src/core/vendor.js:281-292`), because `'prod'` is the more-enforced verification arm. Read as an allow-list it fails **open**: a sandbox with no `app/current` yet reads `'prod'` and is allowed |

## Reconciliation with the two ADRs this sits between

- **ADR-0028 amendment §3 / Table D — "no environment variable may select a
  verification path."** Honored, and the direction is what makes it so. Today
  every value of every variable results in a real mutation; the variables this
  decision reads can only move an outcome from *mutate* to *refuse*, except the
  single opt-in, which restores today's behavior and can never produce a state
  weaker than today's. No verification arm is selected, no check is skipped, and
  nothing here reads a signal from inside the app tree.
- **ADR-0035 — "an app-tree write is code execution at the next attended run; do
  not add guard number seven."** Honored by claiming nothing. This decision makes
  **no** security claim, defends against **no** adversary, and does not appear in
  `docs/THREAT-MODEL.md`. It removes a default, which is the subtractive shape
  ADR-0035 found to be the only one that held; and unlike the six relocating
  guards it inspects no value the tree supplies — `os.userInfo()` is the process's
  own credential.
- **ADR-0004 — Wienerdog is just files.** Nothing starts, nothing persists. The
  refusal branch spawns strictly less than the current code.

## Consequences

- **The class closes at the chokepoint, not per entry point.** Every dev
  checkout, test wrapper, scenario harness and CI script that redirects `HOME`
  now fails safe by construction. `WIENERDOG_TEST_NO_REAL_SCHEDULER` stops being
  load-bearing and becomes what it should have been: a loud failure for a test
  that reached the chokepoint at all.
- **Two legitimate flows must now opt in, and both are attended.** A
  `WIENERDOG_HOME`-relocated install (core outside the passwd home) and
  `scripts/smoke-install.sh` on a clean CI runner. The smoke script sets the
  variable only when `$CI` is non-empty, so a local run of it still refuses even
  past its own preflight — two independent stops for the same accident.
- **A refusal is a silent-until-read stderr line, not an abort.** Wienerdog
  writes the schedule *file* either way; only the OS registration is skipped.
  That keeps `uninstall` reversible and `init` completable, and it matches how
  the codebase already treats a non-zero loader result. The cost is honest: on a
  `WIENERDOG_HOME` install that ignores the line, jobs never fire until
  `wienerdog sync` runs with the variable set. `wienerdog doctor` already probes
  live registrations and reports this.
- **Windows is weaker and is not claimed otherwise.** `os.userInfo().homedir` is
  measured here on darwin only. If some platform derives it from the
  environment, the predicate degrades to today's behavior — allow — never to a
  new refusal, so the failure direction is the safe one.
- **What is given up:** one more variable in the vocabulary, and a
  `WIENERDOG_HOME` user's first `init` needing a second command. Weighed against
  a nightly dream that stops firing with no error anywhere, that is the cheaper
  side.

## Relations to prior ADRs

- **ADR-0018** (Decision 2) established the chokepoint and the opt-out guard.
  This ADR **inverts that guard's default** and does not otherwise amend
  ADR-0018: the identity check, the heal ordering and the catch-up design are
  untouched.
- **ADR-0027** (re-derive unload, never execute stored argv) is unaffected — the
  argv still arrives at the chokepoint already re-derived; this only decides
  whether it is spawned.
- **ADR-0037** (a register that cannot verify what the OS holds must not report
  success) composes cleanly: a refusal returns non-zero, which is already the
  "not loaded" input that postcondition consumes.
