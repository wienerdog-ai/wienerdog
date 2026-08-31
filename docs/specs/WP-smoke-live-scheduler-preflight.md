---
id: WP-smoke-live-scheduler-preflight
title: Refuse to run the install smoke script while this user has live Wienerdog scheduler registrations
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0018]
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
(`docs/adr/0018-windows-scheduled-dreaming.md:165-179`) states this invariant and
records the 2026-07 incident where a temp-`HOME` test boot-out'd a real agent.

`scripts/smoke-install.sh` is the end-to-end install gate: it runs the real CLI
lifecycle (`init` → `sync` → `doctor` → `safety` → a managed-block drill →
catch-up teardown → `uninstall`) against a real install in a throwaway `HOME`.
Its header states the assumption it depends on — *"against a REAL install in a
throwaway HOME on a clean CI runner, where nothing collides"* (`:8-10`) — and
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
- `.github/workflows/install-smoke.yml:42` runs `bash scripts/smoke-install.sh`
  on a `[ubuntu-latest, macos-latest]` matrix (`:22-23`). GitHub Actions sets
  `CI=true` in every job.
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
| create | scripts/live-scheduler-probe.sh | the read-only probe; exit codes and prefix argument per Table A |
| modify | scripts/smoke-install.sh | one preflight block per Table B, placed before the sandbox exports at `:28`; no other change |

### Exact contracts

`scripts/live-scheduler-probe.sh [prefix]` is a standalone, read-only,
side-effect-free probe. It takes one optional argument, the identifier prefix to
look for, and reports whether this OS user currently has any **live** (loaded /
registered) scheduler entry whose identifier carries that prefix. It reads the
scheduler; it never writes one, never spawns the Wienerdog CLI, and creates no
files. Its whole contract is Table A.

The prefix argument exists so the check is observable on **both** sides on any
machine: the default finds the real registrations, and a deliberately absent
prefix exercises the clean path. It is a maintainer-supplied literal that is
matched as a **fixed string** (`grep -F`), never as a regular expression, and it
never reaches a filesystem path.

The smoke script's preflight is Table B.

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** the probe introduces a result taxonomy
(clean / live / not-probeable) carried on exit codes, and **(vii)** those same
facts are mirrored in the smoke script's abort condition, the acceptance criteria
and the verification commands.

### Table A — `scripts/live-scheduler-probe.sh` contract

| Fact / rule | Value |
|-------------|-------|
| Invocation | `scripts/live-scheduler-probe.sh [prefix]`; `prefix` defaults to `ai.wienerdog.` |
| Exit 0 | **Clean** — no live registration carries the prefix, *or* this platform's scheduler client is not present/answerable. Prints one short line saying which of the two it was |
| Exit 1 | **Live** — at least one registration carries the prefix. Prints the matching identifier line(s) so a reader can see what would have been hit |
| macOS source of truth | the LOADED domain, read as `/bin/launchctl print "gui/$(id -u)"`, matched with `grep -F "$prefix"`. The **loaded** domain, not `~/Library/LaunchAgents` — the issue's whole point is that a plist on disk and a loaded service are different things |
| Linux source of truth | `systemctl --user list-units --all --no-legend`, matched with `grep -F "$prefix"`. The default prefix `ai.wienerdog.` does not match systemd's `wienerdog-<job>.timer` names, so a Linux caller passes its own prefix (Table B) |
| Other platforms (incl. Windows) | not probed; exit 0 with the "not probeable" line. Windows is named, not silently covered |
| Scheduler client path | **absolute** on macOS (`/bin/launchctl`), never a bare-name `PATH` lookup — a shimmed `PATH` must not be able to make the probe report a false clean (the `tests/scenarios/scheduler-guard.js:42` rule) |
| Absent client | not an error: `systemctl` missing, or the client exiting non-zero, is the "not probeable" case → exit 0. Under `set -e` this branch must not kill the script |
| Side effects | none. No file is created or removed, no Wienerdog CLI is invoked, no scheduler entry is loaded, unloaded or modified |
| Prefix handling | matched as a fixed string (`grep -F`); never interpolated into a path or an `eval` |

### Table B — the smoke-install preflight

| Fact / rule | Value |
|-------------|-------|
| Placement | at the top of `scripts/smoke-install.sh`, **before** the sandbox `export HOME=…` block currently at `:28` — so the probe sees the real environment and nothing has been created when it aborts |
| Bypass conditions | skip the whole preflight when `${CI:-}` is non-empty **or** `${WIENERDOG_SMOKE_I_KNOW:-}` is non-empty. Both are documented in the script's header |
| Probe calls | the macOS prefix `ai.wienerdog.` and the Linux prefix `wienerdog-`, both delegated to `scripts/live-scheduler-probe.sh` (Table A). A single call per platform is enough; a caller may pass both prefixes as separate calls |
| On live (probe exit 1) | abort with exit 1 before creating `$SB`, printing the probe's matched lines plus a message that names **issue #169**, says this run would remove those live services, and names `WIENERDOG_SMOKE_I_KNOW=1` as the deliberate override |
| On clean (probe exit 0) | proceed unchanged. Every existing step, check and `ok`/`die` message in the script is untouched |
| Check count | the preflight does **not** call `ok()`; the script's final `SMOKE PASS — $pass checks.` count is unchanged from today |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (both rows cite Table A / Table B)
- [ ] Acceptance criteria that assert the exit codes and the bypass conditions
- [ ] Verification commands (they exercise Table A's exit 0 and exit 1 arms)
- [ ] Current-state description (the measured `launchctl` exit codes and the
      absent `systemctl`)
- [ ] The "Exact contracts" prose describing the prefix argument
- [ ] Implementation notes' `set -e` trap

## Implementation notes & constraints

- Bash, `shellcheck`-clean at `--severity=warning`, formatted with `shfmt -i 2`
  (CLAUDE.md). Zero new dependencies. The new script needs the executable bit.
- **`set -e` trap:** a `cmd && var=$(…)` line whose left side fails (the absent
  `systemctl` case) exits the whole script under `set -euo pipefail`. Every
  "client absent / client failed" branch must be written so it cannot kill the
  probe — that branch is Table A's exit 0, not a crash.
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

- [ ] `scripts/live-scheduler-probe.sh` with the default prefix exits **1** on a
      machine that has a live `ai.wienerdog.*` registration, and prints the
      matching identifier line(s).
- [ ] The same script exits **0** for a prefix that matches nothing, and exits
      **0** on a platform whose scheduler client is absent, in both cases without
      the surrounding `set -e` killing it.
- [ ] Running the probe leaves the live scheduler domain byte-for-byte as it was:
      the same registrations are loaded before and after.
- [ ] `scripts/smoke-install.sh` run with a live registration present, `CI` unset
      and `WIENERDOG_SMOKE_I_KNOW` unset, exits non-zero **before** creating its
      sandbox, and its message names issue #169 and the override variable.
- [ ] With `WIENERDOG_SMOKE_I_KNOW=1` (or `CI` non-empty) the preflight is
      skipped and the script's behavior is exactly today's.
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
# and name the services. Assertion, not a number to eyeball.
! bash scripts/live-scheduler-probe.sh

# Table A, CLEAN arm (green side): a prefix that matches nothing must exit 0.
bash scripts/live-scheduler-probe.sh ai.definitely-absent.

# Table A, no-side-effect arm: the loaded domain is identical before and after.
# (macOS; on Linux substitute the systemctl listing.)
/bin/launchctl print "gui/$(id -u)" | grep -F ai.wienerdog. | sort > /tmp/wd-before.txt
bash scripts/live-scheduler-probe.sh || true
/bin/launchctl print "gui/$(id -u)" | grep -F ai.wienerdog. | sort > /tmp/wd-after.txt
diff /tmp/wd-before.txt /tmp/wd-after.txt

# Table B: on a machine with a live registration, the smoke script aborts at the
# preflight and creates nothing. Run with CI and the override BOTH unset.
env -u CI -u WIENERDOG_SMOKE_I_KNOW bash scripts/smoke-install.sh; echo "exit=$?"
```

- The last command must exit non-zero with the issue-#169 message and **must not**
  print the `== 1. init …` banner. Paste its full output.
- Both arms of the probe were observed on this tree before this spec was written
  (Current state); observe them again on the finished script and paste both, plus
  a red run of the Table B abort with a deliberately broken preflight (e.g. the
  bypass condition inverted) so a check that cannot fail is caught.
- **Do not run `bash scripts/smoke-install.sh` with `WIENERDOG_SMOKE_I_KNOW=1` or
  `CI` set on a machine with a live install.** That is the run that caused issue
  #169. The full lifecycle is exercised by CI.

## Out of scope (do NOT do these)

- Inverting the `schedulerSpawn` default, adding `WIENERDOG_ALLOW_REAL_SCHEDULER`,
  or any change under `src/` — that is `WP-scheduler-mutation-home-authority`
  (ADR-0041), which also wires this script's CI opt-in.
- Changing any existing smoke-install step, assertion, helper or message.
- Making the smoke script assert live scheduler registration. Registration stays
  best-effort and unasserted (`.github/workflows/install-smoke.yml:9-10`).
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
