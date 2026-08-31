---
id: WP-smoke-live-scheduler-preflight
title: Refuse to run the install smoke script while this user has live Wienerdog scheduler registrations
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0018, ADR-0031]
epic: scheduler-domain-safety
---

# WP-smoke-live-scheduler-preflight: stop the smoke script before it reaches a live launchd domain

## Context (read this, nothing else)

**IRON RULE (ADR-0004): Wienerdog is just files.** Nothing in this work package
starts a process, opens a socket, or outlives its invocation. Everything it adds
is a read-only probe that runs once and exits.

Wienerdog schedules its nightly **dream** and its **catch-up** entry with the
user's OS scheduler: `launchd` on macOS (labels `ai.wienerdog.dream`,
`ai.wienerdog.catchup` in the `gui/$UID` domain), `systemd --user` on Linux
(units named `wienerdog-<job>.timer` / `.service`), Task Scheduler on Windows.

**Those identifiers are per-user-global, not `$HOME`-scoped.** Every Wienerdog
*file* path is derived from `$HOME` (`src/core/paths.js:54-55`: the core is
`$WIENERDOG_HOME || <$HOME>/.wienerdog`), so redirecting `HOME` sandboxes the
entire file namespace — and none of the scheduler namespace. A process running
against a throwaway core still resolves `launchctl bootout
gui/501/ai.wienerdog.dream` to the *live* user's service. ADR-0018 Decision 2
(`docs/adr/0018-windows-scheduled-dreaming.md:166-180`) states this invariant and
records the 2026-07 incident where a temp-`HOME` test boot-out'd a real agent.

`scripts/smoke-install.sh` is the end-to-end install gate: it runs the real CLI
lifecycle (`init` → `sync` → `doctor` → `safety` → a managed-block drill →
catch-up teardown → `uninstall`) against a real install in a throwaway `HOME`.
Its header states the assumption it depends on — *"against a REAL install in a
throwaway HOME on a clean CI runner, where nothing collides"* (`:10-11`) — and
**nothing enforces it**. Issue #169: run locally on a maintainer machine with a
live install, its catch-up teardown loop (`:117-121`) and its `uninstall`
(`:128`) removed the maintainer's live `ai.wienerdog.dream` and
`ai.wienerdog.catchup` from launchd. The plists stayed on disk, so nothing looked
broken; the nightly dream simply stopped firing, and the catch-up safety net that
would have covered it was removed by the same run.

This work package enforces the header's assumption at the top of the script,
before anything is created: probe the user's real scheduler domain read-only, and
refuse to proceed when a live Wienerdog registration exists. It is the cheap,
immediate half of issue #169 and it needs no product change. The structural half
— inverting the default at the `schedulerSpawn` chokepoint so *every* path fails
safe — is `WP-scheduler-mutation-home-authority` and is **out of scope here**.

## Current state

- `scripts/smoke-install.sh` (143 lines). `:18` is `set -euo pipefail`. `:20-21`
  resolve `$REPO` and define `WD() { node "$REPO/bin/wienerdog.js" "$@"; }`.
  `:23-24` create the sandbox root `$SB` under `${TMPDIR:-/tmp}` with an `EXIT`
  trap that removes it. `:28-32` export `HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`
  into `$SB/home` and unset `WIENERDOG_HOME`/`WIENERDOG_VAULT`. `:40-48` define
  the `ok()` / `die()` helpers (`die` prints a two-space-indented
  `[FAIL] <msg>` to stderr and exits 1). The first lifecycle step is `== 1. init ... ==` at `:65-66`. **There is no
  preflight of any kind.**
- `.github/workflows/install-smoke.yml` runs the script from a step named
  "Install lifecycle smoke" (`:41-42`, `run: bash scripts/smoke-install.sh`) on a
  `[ubuntu-latest, macos-latest]` matrix (`:22-23`). That step carries **no
  `env:` block today**. GitHub Actions sets `CI=true` in every job — a fact this
  WP deliberately does **not** use (Table B).
- `scripts/` currently contains no standalone scheduler probe.
- `tests/scenarios/scheduler-guard.js:42` sets `const LAUNCHCTL_PATH =
  '/bin/launchctl'` and documents why it is absolute by contract: the harness
  prepends a fail-closed loader-shim dir to `PATH`, so a bare-name lookup could
  resolve to that shim and the guard would observe its own machinery and report a
  false clean. The same reasoning applies to this work package's probe.
- Measured on this tree (HEAD `a6e0803`), on the maintainer's machine:
  `/bin/launchctl print "gui/$(id -u)"` exits 0 and its output contains the lines
  `ai.wienerdog.dream` and `ai.wienerdog.catchup`; `launchctl print
  gui/$(id -u)/ai.wienerdog.definitely-absent` exits 113. `systemctl` is not
  installed on this host, which is the absent-client case the probe must survive.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | scripts/live-scheduler-probe.sh | the read-only probe; the three exit codes and the prefix argument per Table A |
| modify | scripts/smoke-install.sh | **one** contiguous block per Table B — the preflight plus the comment lines documenting its two override variables — inserted at the placement Table B fixes. Nothing else in the file changes; in particular the existing header comment (`:1-17`) is **not** edited |
| modify | .github/workflows/install-smoke.yml | one `env:` block on the existing "Install lifecycle smoke" step (`:41-42`) whose **value** is Linux-conditional, per Table B. The step gains no `if:` and keeps running on both matrix legs. Nothing else in the workflow changes — no new job, no new step, no matrix change, no `CI` reference |

### Exact contracts

`scripts/live-scheduler-probe.sh [prefix]` is a standalone, read-only,
side-effect-free probe. It takes one optional argument, the identifier prefix to
look for, and reports whether this OS user currently has any **live** (loaded /
registered) scheduler entry whose identifier carries that prefix. It reads the
scheduler; it never writes one, never spawns the Wienerdog CLI, and creates no
files. Its whole contract is Table A.

The prefix argument exists so the check is observable on **both** sides on any
machine: the default finds the real registrations, and a deliberately absent
prefix exercises the CLEAN path. It is a maintainer-supplied literal that is
matched as a **fixed string** (`grep -F`), never as a regular expression, and it
never reaches a filesystem path.

The third outcome, NOT-PROBEABLE, has no argument that reaches it on a machine
whose client works; it is observed on Linux CI (no user D-Bus session), on
Windows, and locally by temporarily pointing the probe's client constant at a
non-existent path — see the verification steps.

The smoke script's preflight is Table B.

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** the probe introduces a result taxonomy
(clean / live / not-probeable) carried on exit codes, and **(vii)** those same
facts are mirrored in the smoke script's abort condition, the acceptance criteria
and the verification commands.

### Table A — `scripts/live-scheduler-probe.sh` contract

**Three outcomes, three exit codes.** The probe never reports "clean" on the
strength of a question it could not ask: *clean* means the scheduler client
answered and returned nothing matching. A client that is absent, that failed, or
that does not exist on this platform is its own outcome, and the caller — not the
probe — decides what to do about it.

| Fact / rule | Value |
|-------------|-------|
| Invocation | `scripts/live-scheduler-probe.sh [prefix]`; `prefix` defaults to `ai.wienerdog.` |
| **Exit 0 — CLEAN** | the scheduler client was invoked, **exited successfully**, and its output carries no line matching the prefix. This is the only outcome that asserts the domain is safe |
| **Exit 1 — LIVE** | the client answered and at least one line matches the prefix. Prints the matching identifier line(s) so a reader can see what would have been hit |
| **Exit 2 — NOT-PROBEABLE** | the client is absent, the client exited non-zero, or this platform has no supported query. Prints one line naming which. **Never collapsed into exit 0** — an unanswerable scheduler is an absence of evidence, not evidence of absence |
| macOS source of truth | the LOADED domain, read as `/bin/launchctl print "gui/$(id -u)"`, matched with `grep -F "$prefix"`. The **loaded** domain, not `~/Library/LaunchAgents` — the issue's whole point is that a plist on disk and a loaded service are different things |
| Linux source of truth | `systemctl --user list-units --all --no-legend`, matched with `grep -F "$prefix"`. The default prefix `ai.wienerdog.` does not match systemd's `wienerdog-<job>.timer` names, so a Linux caller passes its own prefix (Table B). A runner with no user D-Bus session makes this command fail → exit 2, not exit 0 |
| Other platforms (incl. Windows) | no supported query → **exit 2**. Windows is named and fails safe, not silently passed |
| Scheduler client path | **absolute** on macOS (`/bin/launchctl`), never a bare-name `PATH` lookup — a shimmed `PATH` must not be able to make the probe report a false clean (the `tests/scenarios/scheduler-guard.js:42` rule) |
| `set -e` handling | the absent-client and failed-client branches must reach the exit-2 return rather than killing the script under `set -euo pipefail`; likewise `grep`'s exit 1 on no-match is a CLEAN result, not a failure |
| Side effects | none. No file is created or removed, no Wienerdog CLI is invoked, no scheduler entry is loaded, unloaded or modified |
| Prefix handling | matched as a fixed string (`grep -F`); never interpolated into a path or an `eval` |

### Table B — the smoke-install preflight

| Fact / rule | Value |
|-------------|-------|
| Placement | **after `set -euo pipefail` (`:18`) and before the `SB="$(mktemp -d …)"` line currently at `:23`.** This is the single window both this row and the "On live" row below refer to: at abort time no sandbox root exists, no `EXIT` trap is installed (`:24`), and the real `HOME` is still in effect (`:28` has not run). Inserting it anywhere at or after `:23` fails this row even though the `HOME` exports are still ahead |
| **`$CI` is not read** | the preflight consults **no** CI-detection variable. `CI` describes an execution context, not scheduler isolation: `CI=false` is non-empty, and a self-hosted runner sharing a developer's user account has a live domain like any workstation. A clean CI runner needs no exemption — its probe returns CLEAN on its own merits |
| Probe calls | the macOS prefix `ai.wienerdog.` and the Linux prefix `wienerdog-`, both delegated to `scripts/live-scheduler-probe.sh` (Table A). A single call per platform is enough; a caller may pass both prefixes as separate calls |
| Outcome × override (the complete matrix) | **each override applies to its own outcome and to no other.** An implementation that tests "either override is set" passes half these cells and fails the other half, so all six are stated: |

| Probe outcome | neither set | `WIENERDOG_SMOKE_I_KNOW=1` only | `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` only | both set |
|---|---|---|---|---|
| **CLEAN** (0) | proceed | proceed | proceed | proceed |
| **LIVE** (1) | **abort** | proceed | **abort** — this override does not apply to LIVE | proceed |
| **NOT-PROBEABLE** (2) | **abort** | **abort** — this override does not apply to NOT-PROBEABLE | proceed | proceed |

| Fact / rule | Value |
|-------------|-------|
| On CLEAN (exit 0) | proceed unchanged. Every existing step, check and `ok`/`die` message in the script is untouched |
| On LIVE (exit 1) | abort with exit 1 inside the window this table's Placement row fixes — i.e. before `mktemp -d` runs, so no `$SB` and no `EXIT` trap exist — printing the probe's matched lines plus a message that names **issue #169**, says this run would remove those live services, and names `WIENERDOG_SMOKE_I_KNOW=1` |
| On NOT-PROBEABLE (exit 2) | abort in the same window, with a message saying the live domain could not be queried and naming `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` |
| Override values | both are **exact-value**: the string `1` and nothing else. `=0`, `=false`, `=no` and `''` bypass nothing. Both are documented in comment lines **inside this same block**, not in the script's header — the header at `:1-17` is not edited, which keeps the file's diff to one contiguous insertion (Deliverables) |
| Who sets `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE`, and how | `.github/workflows/install-smoke.yml`, as an `env:` block on the **shared** "Install lifecycle smoke" step (`:41-42`), whose **value** is conditional: `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE: ${{ runner.os == 'Linux' && '1' \|\| '' }}`. On macOS it evaluates to the empty string, which Table B's exact-value rule treats as unset. The runner's inability to answer becomes an explicit statement a human wrote in a reviewable file, not an ambient variable the script sniffs |
| Why a conditional VALUE and not `if:` | GitHub Actions cannot attach `if:` to a single `env:` entry, and putting `if:` on the step would **skip the whole smoke step on macOS** — deleting the very leg whose CLEAN probe is the guarantee below. The conditional value is the only shape that varies the variable while keeping one step that runs on both legs |
| What it guarantees | `macos-latest` gets an empty value, i.e. **no** override, so if its launchd domain ever stops being queryable its preflight aborts and the job goes **red**. That makes "at least one matrix leg actually probed CLEAN" a hard CI failure rather than a silent gap — implemented by the value, with no cross-job machinery. Registration itself stays best-effort and unasserted (`.github/workflows/install-smoke.yml:11`) |
| Both legs must still RUN | the smoke step carries no `if:` of its own and the matrix keeps both entries, so the step executes on `ubuntu-latest` **and** `macos-latest`. A change that skips it on either leg defeats the guarantee above and is a regression, not an optimization |
| Point-in-time contract (named residual **R-probe-race**, owner-accepted) | the probe answers for the instant it ran. A process that registers this user's real Wienerdog jobs *after* a CLEAN result — during the lifecycle that follows — is not seen, and that run may then unload them. Serializing every mutator behind a per-user lock would close it; the machinery is not worth it for a maintainer-run smoke script, and no lock is introduced. What the preflight promises is "the domain was clean when this run started", and nothing more. **This residual covers two windows, not one** — the other is `WP-scheduler-mutation-home-authority`'s uninstall clearance; ADR-0041's residual table holds both, so a change to the contract moves them together |
| Check count | the preflight does **not** call `ok()`; the script's final `SMOKE PASS — $pass checks.` count is unchanged from today |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (all three rows cite Table A / Table B)
- [ ] Acceptance criteria that assert the three exit codes, the three preflight
      arms, the placement window and the two exact-value overrides
- [ ] Verification commands (they exercise all three of Table A's arms)
- [ ] The Deliverables note on the one-contiguous-block boundary (it mirrors
      Table B's Placement and Override rows)
- [ ] Current-state description (the measured `launchctl` exit codes and the
      absent `systemctl`)
- [ ] The "Exact contracts" prose describing the prefix argument and how
      NOT-PROBEABLE is reached
- [ ] Implementation notes' `set -e` trap and the no-`$CI` rule
- [ ] **`WP-scheduler-mutation-home-authority`'s Table C**, which grants
      real-scheduler authority only on this probe's CLEAN result — a change to
      this table's exit-code meanings changes that table too, and the two move
      in the same pass

## Implementation notes & constraints

- Bash, `shellcheck`-clean at `--severity=warning`, formatted with `shfmt -i 2`
  (CLAUDE.md). Zero new dependencies. The new script needs the executable bit.
- **`set -e` trap:** a `cmd && var=$(…)` line whose left side fails (the absent
  `systemctl` case) exits the whole script under `set -euo pipefail`. Every
  "client absent / client failed" branch must be written so it cannot kill the
  probe — that branch is Table A's **exit 2**, not a crash and not exit 0. The
  same applies in the other direction to `grep`, whose exit 1 on no-match is
  Table A's CLEAN result.
- **Nothing here reads `$CI`, and nothing may be added that does** (Table B). The
  three variables this WP introduces or uses are all exact-value and all named in
  Table B; a generic environment sniff is what finding 1 of the round-1 gate
  rejected.
- **Do not read `~/Library/LaunchAgents`** as the source of truth. Issue #169's
  observed end state was *plists intact on disk, services gone from launchd*; a
  file listing sees the opposite of what matters.
- The probe is a **coherence check for a maintainer's machine, not a security
  control.** It makes no claim in `docs/THREAT-MODEL.md` and must not be
  described as protecting against anything adversarial.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier
      reaches a filesystem path or a shell command here.** The one input is the
      optional `prefix` argument, supplied by the maintainer on the command line;
      it is matched as a fixed string with `grep -F` (Table A) and never becomes a
      path segment, a scheduler identifier, or an `eval`.
- [ ] The probe performs no mutation of any kind: no scheduler mutation, no file
      write, no CLI invocation (Table A's side-effects row is the assertion).

## Acceptance criteria

- [ ] `scripts/live-scheduler-probe.sh` with the default prefix exits **1**
      (LIVE) on a machine that has a live `ai.wienerdog.*` registration, and
      prints the matching identifier line(s).
- [ ] It exits **0** (CLEAN) for a prefix that matches nothing, with the client
      having answered successfully.
- [ ] It exits **2** (NOT-PROBEABLE) when the scheduler client is absent, exits
      non-zero, or the platform has no supported query — never **0** — and in
      none of the three cases does the surrounding `set -e` kill it.
- [ ] Running the probe leaves the live scheduler domain byte-for-byte as it was:
      the same registrations are loaded before and after.
- [ ] `scripts/smoke-install.sh` run with a live registration present and neither
      override set, exits non-zero within Table B's Placement window — no
      `wd-smoke.*` directory is left in `${TMPDIR:-/tmp}` and no `== 1. init …`
      banner is printed — and its message names issue #169 and
      `WIENERDOG_SMOKE_I_KNOW=1`.
- [ ] The same script aborts identically on a NOT-PROBEABLE result with neither
      override set, naming `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` instead.
- [ ] All six cells of Table B's outcome × override matrix hold. In particular
      both wrong-variable cells: `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` does
      **not** proceed past LIVE, and `WIENERDOG_SMOKE_I_KNOW=1` does **not**
      proceed past NOT-PROBEABLE. With both set, each still applies only to its
      own outcome.
- [ ] Both overrides are **exact-value**: with either set to `0`, `false`, `no`
      or the empty string, the corresponding abort still happens.
- [ ] `.github/workflows/install-smoke.yml` sets `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE`
      by a **conditional value** that yields `1` on Linux and the empty string on
      macOS, so a `macos-latest` runner whose probe is not CLEAN fails the job.
- [ ] The smoke step still **runs on both matrix legs** — it carries no `if:`,
      and the matrix still lists `ubuntu-latest` and `macos-latest`. (An `if:` on
      the step would skip macOS entirely and silently delete the CLEAN leg.)
      Nothing else is added — no new job, no new step, no matrix change.
- [ ] The script reads no `CI` variable — no `$CI` / `${CI…}` expansion anywhere
      in it, asserted by the guarded grep in the verification steps.
- [ ] The inserted block sits after `set -euo pipefail` and before the `mktemp -d`
      line (Table B, Placement), and both override variables are named in comment
      lines inside that same block; the script's header comment is unmodified.
- [ ] The preflight adds no `ok()` call: the script's `SMOKE PASS — N checks.`
      total is unchanged.
- [ ] `npm run lint` passes (markdownlint + shellcheck + shfmt).
- [ ] Idempotence: **N/A — this WP ships a read-only probe and an abort branch;
      it writes nothing outside the repo.**

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
bash -n scripts/smoke-install.sh scripts/live-scheduler-probe.sh
test -x scripts/live-scheduler-probe.sh

# Table A, LIVE arm (red side): on a machine with a live install this must exit 1
# and name the services. NOT written as `! bash …` — a missing or broken script
# exits 127 and the negation would turn that into a pass, which is exactly the
# deliverable-absent state this check must catch. Capture rc, assert it is 1.
bash scripts/live-scheduler-probe.sh; rc=$?; test "$rc" -eq 1

# Table A, CLEAN arm (green side): a prefix that matches nothing must exit 0 —
# asserted explicitly, symmetrical with the LIVE arm.
bash scripts/live-scheduler-probe.sh ai.definitely-absent.; rc=$?; test "$rc" -eq 0

# Table A, NOT-PROBEABLE arm: must be 2, never 0. Reached on this machine by
# temporarily pointing the probe's client constant at a path that does not exist
# (a one-line local edit, reverted after the observation); reached for free on
# Linux CI, which has no user D-Bus session. Paste the rc from whichever you used.
bash scripts/live-scheduler-probe.sh; rc=$?; test "$rc" -eq 2

# Table A, no-side-effect arm: the loaded domain is identical before and after.
# (macOS; on Linux substitute the systemctl listing.)
/bin/launchctl print "gui/$(id -u)" | grep -F ai.wienerdog. | sort > /tmp/wd-before.txt
bash scripts/live-scheduler-probe.sh || true
/bin/launchctl print "gui/$(id -u)" | grep -F ai.wienerdog. | sort > /tmp/wd-after.txt
diff /tmp/wd-before.txt /tmp/wd-after.txt

# Table B, LIVE abort: on a machine with a live registration, the smoke script
# aborts at the preflight and creates nothing. Neither override set.
# SAFE ONLY ONCE THE PREFLIGHT EXISTS — see the warning below.
env -u WIENERDOG_SMOKE_I_KNOW -u WIENERDOG_SMOKE_ALLOW_UNPROBEABLE \
  bash scripts/smoke-install.sh
rc=$?; test "$rc" -ne 0
# …and it aborted before creating its sandbox root.
test -z "$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'wd-smoke.*' -print -quit)"

# Table B, exact-value rule: a falsy-looking value must NOT bypass the abort.
WIENERDOG_SMOKE_I_KNOW=0 bash scripts/smoke-install.sh
rc=$?; test "$rc" -ne 0

# Table B, wrong-variable cell (LIVE row): the NOT-PROBEABLE override must not
# bypass a LIVE domain. On a machine with live registrations this must still abort.
WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1 bash scripts/smoke-install.sh
rc=$?; test "$rc" -ne 0

# Table B, no generic CI: neither the preflight nor its overrides consult $CI.
# Guarded on the file existing — a bare negated grep passes hardest when the
# file is missing (grep exits 2, the negation turns that into success).
test -f scripts/smoke-install.sh && ! grep -qE '\$\{?CI[:}]' scripts/smoke-install.sh
```

- **Every arm above captures its exit code as its own statement (`rc=$?`)
  immediately after the command, and asserts it before anything else runs.** A
  trailing `echo "exit=$?"` consumes the status and makes the sequence succeed
  whatever the command did; do not reintroduce one.
- **The matrix cells a live machine cannot reach must still be observed.** A
  machine with live registrations can run the whole LIVE row directly (the three
  arms above). The NOT-PROBEABLE row's cells — `WIENERDOG_SMOKE_I_KNOW=1` must
  still abort, `WIENERDOG_SMOKE_ALLOW_UNPROBEABLE=1` must proceed, both-set must
  proceed — are reached the same way as Table A's exit-2 arm: with the probe's
  client constant temporarily pointed at a path that does not exist. Paste the
  outcome of each of the six cells, naming how it was reached; a matrix asserted
  in only one direction is exactly the half-passing implementation this table
  exists to exclude.
- The two `smoke-install.sh` commands must exit non-zero with the issue-#169
  message and **must not** print the `== 1. init …` banner. Paste both outputs.
- **Those two commands are destructive on the pre-implementation tree.** With no
  preflight present they are exactly the run that caused issue #169: they proceed
  into the full lifecycle and remove this user's live `ai.wienerdog.*` services.
  Run them only *after* the preflight block is in place, never as a "before"
  measurement.
- The LIVE and CLEAN arms were observed on this tree before this spec was written
  (Current state); observe all three arms on the finished script and paste them,
  plus a red run of the Table B abort with a deliberately broken preflight (e.g.
  the override comparison loosened to a truthiness test, or NOT-PROBEABLE folded
  back into CLEAN) so a check that cannot fail is caught.
- **Do not run `bash scripts/smoke-install.sh` with `WIENERDOG_SMOKE_I_KNOW=1` on
  a machine with a live install.** That is the run that caused issue #169. The
  full lifecycle is exercised by CI.

## Out of scope (do NOT do these)

- Inverting the `schedulerSpawn` default, adding `WIENERDOG_ALLOW_REAL_SCHEDULER`,
  or any change under `src/` — that is `WP-scheduler-mutation-home-authority`
  (ADR-0041), which is also what makes this script export that variable on a
  CLEAN probe result.
- Changing any existing smoke-install step, assertion, helper or message.
- Adding any `$CI`-derived branch, to either the script or the workflow (Table B).
- Making the smoke script assert live scheduler registration. Registration stays
  best-effort and unasserted (`.github/workflows/install-smoke.yml:11`).
- Any change to `tests/scenarios/scheduler-guard.js`, the unit-suite guard, or
  `tests/run.js`.
- Teaching `wienerdog doctor` about this. It already probes live registrations.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(scripts): refuse the install smoke run against a live scheduler domain (WP-smoke-live-scheduler-preflight)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
