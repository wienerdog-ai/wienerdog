---
id: WP-a9-incident-runbook
title: Add the general incident-drill runbook — stop schedules, preserve evidence, rotate credentials, purge injected digest/managed block, clean git history, re-authorize
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0021, ADR-0024, ADR-0027]
epic: audit-a9
---

# WP-a9-incident-runbook: General incident-drill runbook (audit A9, docs part)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a markdown memory
**vault**, skills, hooks, and OS-native **scheduled jobs**. **IRON RULE
(ADR-0004): Wienerdog is just files** — no daemons, no servers, no telemetry.
User-facing text is plain language for knowledge workers, not developers.

The 2026-07-15 security audit, action **A9** ("private artifact and logging
policy"), has four parts. Three are code/already shipped; the fourth is a
**documentation** deliverable this WP writes:

> A9 item 4 — "Add a safe incident runbook: stop schedules, preserve evidence
> metadata, rotate/revoke credentials, remove compromised digest/managed
> blocks, clean git history, then re-authorize."
>
> A9 acceptance (the drill this runbook must make possible): "Incident drill
> stops all jobs before credential rotation and proves the old digest/managed
> block is no longer injected."

There is already **one** runbook, `docs/runbooks/secret-incident.md`, but it
covers **only** the narrow case of a leaked *credential* reaching the vault
(revoke/rotate the key, purge the secret, clean git history). A9 asks for the
**general** incident drill — what to do when you suspect the machine, a
credential, or your **injected identity/context** has been compromised (e.g. a
poisoned identity note, a tampered managed block, or a machine you no longer
trust) — of which the secret leak is one specific case. The distinguishing
requirement over the secret runbook is the **evidence-preservation** step
(before you clean anything, snapshot the code-owned run evidence so you can see
what actually ran) and the **acceptance drill** (a concrete verification that
the *old, compromised* digest/managed block is no longer being injected into new
sessions).

Two product invariants this runbook must respect and can rely on:

- **Digest injection is byte-gated (ADR-0021, identity trust registry).** The
  session-start **digest** (`<core>/state/digest.md`) injects an identity
  file only when its current bytes match the `sha256` a human ratified via
  `wienerdog memory approve`. A tampered/unapproved identity note is **not**
  re-injected — this is *why* the drill can prove "the old digest is no longer
  injected": fix the source note, re-approve the clean bytes, re-render.
- **The vault is local and never auto-pushed** (ADR-0024 / T4 privacy posture) —
  a committed artifact stays on the machine until the user chooses otherwise, so
  git-history cleanup is a purely local rewrite.

This WP touches **only documentation** — no `src/`, no tests. It opens no
capability gate and changes no code.

## Current state

**`docs/runbooks/secret-incident.md`** exists (the secret-leak case). Its house
format is a numbered, imperative, plain-language checklist ordered so nothing
keeps writing/re-injecting while you clean up:
1. Stop the schedules (`wienerdog schedule list` / `wienerdog schedule remove
   <name>`).
2. Revoke, then rotate, the leaked credential at the provider.
3. Purge the injected copies (fix the vault note → `wienerdog sync` re-renders
   `state/digest.md`; also review `state/quarantine/`).
4. Clean the git history (vault is a local git repo; `git commit --amend` /
   `git rebase -i` / `git filter-repo` / BFG).
5. Re-authorize (re-add schedules, `wienerdog doctor`, confirm the digest is
   clean).

Other runbooks in `docs/runbooks/` (`codex-review.md`, `release.md`,
`triage.md`, `secret-incident.md`, …) share that numbered-checklist format.

**The core directory is NOT always `~/.wienerdog` — resolve it once, up front
(R7-1/R8-4).** The shipped path layer resolves the **core** dir to `$WIENERDOG_HOME`
when that variable is set, otherwise `<home>/.wienerdog`, where `<home>` is `$HOME`
if set, else the platform account home directory (`src/core/paths.js:54–55` —
`home = HOME || os.homedir()`, `core = $WIENERDOG_HOME || <home>/.wienerdog`). On
Windows this means `HOME` is honored **before** `USERPROFILE` — so a runbook that
hardcodes `~/.wienerdog`, or that jumps straight to Windows
`$env:USERPROFILE\.wienerdog` when `HOME` is set, is **wrong on a
custom-`WIENERDOG_HOME` or HOME-set install**: it would unregister the OS task while
leaving the REAL `<core>/schedules/wienerdog-catchup.xml` and its manifest entry
intact — every check passes, then step 4's `wienerdog sync` (healing from the
REAL install's `config.yaml`, which still lists every job) re-arms catch-up
before the drill. The **code-authoritative** way to learn the
core is `wienerdog doctor`, which prints a `core directory exists (<path>)` line
where `<path>` is exactly `getPaths().core` (`src/cli/doctor.js:322`) — reading it
from `doctor` is guaranteed to match what `sync`/`schedule`/`memory approve` act on.
So the runbook must, **before step 1 (a step 0 preamble)**, read that ONE
authoritative core from `doctor`, cross-check it against the code order
(`WIENERDOG_HOME` → `HOME` → platform homedir → `.wienerdog`), display it, have the
user confirm it, **persist it durably so it survives the step-1 reboot**, and use
that SAME resolved core for **every** path it later names (the catch-up XML/plist,
the install manifest, the evidence copy, the digest grep, the SessionStart hook, and
all verifications). The one path that is NOT under the core is the macOS catch-up
LaunchAgent plist (`~/Library/LaunchAgents/ai.wienerdog.catchup.plist`, always
home-based, independent of `WIENERDOG_HOME`).

**Commands the drill relies on (all already shipped):**
- `wienerdog schedule list` / `wienerdog schedule remove <name>` — enumerate and
  unregister scheduled jobs.
- `wienerdog sync` — re-renders `state/digest.md` and the CLAUDE.md/AGENTS.md
  **managed block** from the current (clean) identity notes.
- `wienerdog memory approve <note>` — interactive, terminal-only; ratifies the
  current exact bytes of an injected identity note into the identity trust
  registry (ADR-0021). `<note>` is one of the **fixed short names**
  `profile` / `preferences` / `goals` / `instructions` (or its `.md` basename,
  e.g. `profile.md`) — verified against `src/cli/memory.js`'s `KNOWN` allowlist.
  It does **not** accept an arbitrary file path (no `06-Identity/…` path, no
  `..`, no `/`) and has no headless/`--yes` bypass.
- `wienerdog doctor` — read-only health check (permissions, scheduler load,
  skill links). **It does NOT print the installed hook path and does NOT verify
  managed-block / sentinel integrity** — so the acceptance drill (step 6) must
  not lean on `doctor` for either.

**Code-owned evidence artifacts the "preserve evidence" step snapshots** (all
bounded, code-owned; **treat as potentially sensitive — see below**; all live under
the step-0-resolved `<core>`, NOT necessarily `~/.wienerdog`):
- `<core>/state/run-evidence.jsonl` — the bounded per-run record (Claude
  version, executable, profile, argv, settings/MCP digests, managed-policy
  state, containment self-check result). Free-text is reduced to `sha256`.
- `<core>/state/alerts.jsonl` — durable fail-loud alerts.
- `<core>/logs/<job>/*.log` — per-run job logs (redacted stream).

**Redaction is best-effort, so evidence is NOT guaranteed secret-free (do not
claim it is).** Per ADR-0024 and the `run-job.js` EP3 comment, the log stream is
scanned per-chunk before it is written, but a **boundary-split** secret (one that
straddles two stream chunks) is only **partially** redacted, and an unknown or
encoded secret is **not** redacted at all. The runbook must therefore treat all
three artifacts as **potentially sensitive** and handle the incident snapshot with
private modes and no off-machine sync (contract step 2 below), never as "safe to
keep because it has no secrets."

**Neither `schedule remove` nor a per-job unregister proves quiescence, and both
deliberately LEAVE the shared catch-up entry (do not assume quiescence).** Per
ADR-0027 / WP-145, `schedule remove` re-derives and runs a best-effort OS
**unregister** of that one job, then deletes its schedule file; the OS unregister
is **best-effort** (a poisoned or already-unloaded entry is ignored —
`manifest.js reverseSchedulerEntry` swallows the error) and only stops **future**
fires — **a dream/routine job running *right now* keeps running** (reading,
committing, injecting) after `remove` returns. Two further facts the runbook must
state and act on:

- **The shared catch-up entry survives per-job removal.** On macOS and Windows,
  `schedule` also installs ONE shared missed-run **catch-up** entry — macOS
  launchd label `ai.wienerdog.catchup` (verified: `schedule.js ensureCatchup`),
  Windows Task Scheduler task `\Wienerdog\catchup` — that fires `run-job
  --catch-up` on logon/hourly. `schedule remove <job>` removes only that job; it
  does **not** touch the catch-up entry, so a machine can still fire Wienerdog
  work after every per-job schedule is gone. (Linux/systemd has **no** catch-up
  entry — catch-up is launchd/schtasks only, per `schedule.js`.) The runbook must
  **remove and re-verify** the catch-up entry explicitly (contract step 1).
- **`wienerdog sync` re-arms schedules from `config.yaml` — so deleting files or
  manifest entries alone is NOT enough; the `jobs:` list must be EMPTY before any
  later `sync` (R5-1; mechanism amended 2026-07-20, see note below).** `sync`
  heals **from validated config, regenerating canonical content** — it never
  trusts (or needs) a surviving scheduler file or manifest entry:
  `status.reloadMissing` (verified: `sync.js:239` → `status.js:238`) walks the
  **`config.yaml` `jobs:` list** and, for any job whose canonical OS registration
  probes as **missing**, re-registers it via `schedule.reloadJob` (regenerated
  bytes — a deleted file/manifest entry does not stop it); and `repointSchedules`
  → `repairCatchup` (verified: `sync.js:221`, `schedule.js:588`) **regenerates +
  re-registers the shared catch-up entry whenever at least one job remains** in
  `config.yaml` (macOS/Windows; `reloadMissing` itself never touches catch-up),
  and tears the catch-up entry + map down cleanly when **zero** jobs remain. So
  the **next `wienerdog sync`** (step 4 and again in the step-6 drill) re-arms
  the machine *before* the acceptance drill and re-authorization unless the
  `jobs:` list is empty. The fix (contract step 1): remove **every** job with
  `schedule remove <name>` — it deletes that job's scheduler file + manifest
  entry AND drops the job from `config.yaml`; removing the FINAL job also tears
  down catch-up via the delegated best-effort `repointSchedules` — then remove
  the catch-up entry **by hand** anyway (unregister + delete FILE + drop manifest
  entry: the immediate disarm, and defense-in-depth for a failed best-effort
  auto-teardown), and **block on `config.yaml` listing ZERO jobs** before any
  later `sync`.

  > **Fix-pass amendment (2026-07-20):** the original R5-1 text described the
  > pre-`WP-catchup-per-job-authorization` heal — `reloadMissing` (then
  > `sync.js:197`, `status.js:31/40/49`) re-registering any surviving manifest
  > `scheduler-entry`, catch-up included. The A7/A8 blocker-fix pass (this
  > branch) moved catch-up repair/teardown to `repointSchedules`/`repairCatchup`
  > and made every heal regenerate-from-config. The operative steps are
  > unchanged; the resurrection mechanism, its code citations, and the blocking
  > re-verify (which now includes the empty-`jobs:` check) are updated in this
  > spec and the runbook to match the code this WP ships on.
  >
  > **Fix-pass amendment 2 (2026-07-20, adversarial-review round):** four review
  > findings changed what this spec prescribes. **F1** — the per-job OS unregister
  > is best-effort (a Windows imported task survives XML deletion), so the Table B
  > blocking re-verify gains a FIFTH check: an independent per-platform enumeration
  > of Wienerdog OS registrations (launchd `ai.wienerdog.*` labels, systemd
  > `wienerdog-*` units, `\Wienerdog\` tasks — names verified against
  > `generators.js` `launchdLabel`/`systemdUnitBase`/`windowsTaskName`) must return
  > nothing. **F2** — the post-reboot sub-step order was a dead end on a custom
  > core (`doctor` reads the CURRENT env, so running it before the re-export
  > reports the DEFAULT core and the equality check fails unrecoverably); the
  > order is now read-record → validate → export `WIENERDOG_HOME` → then `doctor`
  > equality. **F4** — the step-1 `jobs:` snapshot targeted the step-2 evidence
  > folder before it existed; the folder's creation + permissioning +
  > backup-exclusion now open step 1, and step 2 copies into the already-secured
  > folder. Also **F5** (step 4 no longer claims `sync` "overwrites only inside
  > the sentinels" — with both sentinels deleted it APPENDS, and the orphaned
  > poison must be removed by hand) and **F7** (`repointSchedules` citation
  > `sync.js:214` → `sync.js:221`).
  >
  > **Fix-pass amendment 3 (2026-07-20, adversarial-review round 2):** two
  > execution-reproduced findings on the step-6 drill blocks. **F1** — a
  > zero-harness false PASS: `CLAUDE_CONFIG_DIR`/`CODEX_HOME` steer BOTH the
  > script's file loop AND `sync`'s `detectHarnesses`, so redirecting them hid
  > every real harness file while the loop silently skipped absent files and
  > still printed PASS. The drill contract now requires an explicit operator
  > declaration of the installed harness set, a manifest cross-check listing
  > (`managed-block` entries via `node -e`), env pinning (unset both variables
  > before `sync` and the file checks), treating `sync`'s exact adapter-skip
  > messages as BLOCK for a declared harness, and a checked==declared (≥1)
  > count gate — the former "judgment call" prose is superseded by these
  > script-enforced checks. **F2** — the PowerShell block interpolated the
  > core path into single-quoted bash source, so an apostrophe in the path
  > (C:/Users/O'Brien/…) broke parsing; the hook path now travels as a bash
  > positional argument (`bash -c '… "$1" …' _ "$coreFwd"`), and both blocks
  > were audited to pass every path as a quoted variable/argument, never
  > rebuilt into nested shell source.
- **The ONLY authoritative way to reach zero running Wienerdog processes is to
  REBOOT after removing every per-job schedule AND the catch-up entry — not
  per-platform process forensics (R4-C, round-4).** After a reboot, with nothing
  left to fire, zero Wienerdog processes run, platform-independently, with no
  forensic guesswork. A per-platform live-process grep is **NOT proof of
  quiescence** and must never certify the machine clean: a prompt-injected run can
  have spawned a **differently-named** helper (a `git`, a shell, an arbitrary
  binary) that no `wienerdog|claude|codex` name-match and no one-level parent scan
  will find, so a "nothing found" grep can be a **false clean** while a
  stale-privilege child keeps writing/committing. Such a grep can only ever
  *reveal* a still-live job (in which case the machine is definitely still
  compromised — escalate), never *certify* a clean one. **Credential rotation
  (step 3) begins only after a reboot.** A user who genuinely **cannot** reboot
  must **stop and escalate** — treat the machine as still-compromised — rather than
  grep-certify it clean. (This runbook is a human procedure; it does **not** ship a
  recursive process-tree reaper — that is A10's mechanism work, out of scope here.)

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | docs/runbooks/incident.md | The general incident-drill runbook (house numbered-checklist format), opening with a **step 0 preamble** that resolves the ONE authoritative core by reading `wienerdog doctor`'s `core directory exists (<path>)` line (the code-authoritative `getPaths().core`), cross-checked against the exact code-mirrored order — `WIENERDOG_HOME`, else `HOME`, else the platform account homedir, then `.wienerdog` (mirroring `paths.js:54–55`; `HOME` is tried **before** `USERPROFILE` on Windows, R8-4) — DISPLAYS it, has the user CONFIRM it (`config.yaml`, `state/`, `install-manifest.json`), **persists it durably OUTSIDE the core so it survives the step-1 reboot** and, after the reboot, RE-READS the persisted record + RE-EXPORTS `WIENERDOG_HOME` from it + only THEN re-confirms via `doctor` (in that order — `doctor` reads the current env, R8-2/F2) for every later command, and requires every later path (the catch-up XML/plist, the install manifest, the evidence copy, the digest grep, the SessionStart hook, and all verifications) to use that SAME `<core>` — never a hardcoded `~/.wienerdog` / `$env:USERPROFILE\.wienerdog`, and never a bare relative `state/…` (R7-1/R8-3); then the seven ordered A9 steps: (1) create+secure the private evidence folder FIRST (F4), snapshot the `<core>/config.yaml` `jobs:` definitions into it (the restore source; `schedule.json` holds only watermarks), remove every per-job schedule (`schedule remove`, which also drops each job from `config.yaml`) **and** the shared catch-up entry — the catch-up removal deleting its scheduler FILE **and** its `install-manifest.json` entry, not merely unregistering it, and blocking on `config.yaml` listing **zero** `jobs:` entries AND a zero-result independent per-platform enumeration of Wienerdog OS registrations (F1) so `sync`'s config-driven heal (`reloadMissing`/`repairCatchup`) cannot re-arm anything and no best-effort-unregister failure survives unseen — then reach proven quiescence by REBOOT (the **sole** authoritative proof — a pre-reboot process grep is a non-proof hint that can only *reveal* a live job; if you cannot reboot you **stop-and-escalate**, never grep-certify clean); (2) preserve-evidence-privately; (3) revoke+rotate; (4) purge digest+managed-block; (5) clean git; (6) fail-closed acceptance drill (SessionStart-hook `additionalContext` byte-compare against the raw `state/digest.md`, plus a three-check managed-block proof — clean `sync` (notice-tolerant: the two constant Codex info notices are allowed; only concrete integrity failures block, R8-5) + whole-file marker grep + one-sentinel-pair check per installed harness file; **no** region-vs-raw-digest byte-compare, which would falsely fail because `sync` trims+neutralizes); (7) re-authorize by reconstructing `schedule add --job` for **builtin** jobs from the `jobs:` snapshot — a `skill:*` routine is frozen by the A0 pre-use gate (audit A1) and is NOT re-addable this release (do not promise a failing `--skill` command; only its snapshot definition is preserved for later). |
| modify | docs/runbooks/secret-incident.md | Add one cross-link near the top: the secret leak is the credential-specific case of the general incident drill (link `incident.md`); for a general or suspected-compromise incident, start there. Do NOT rewrite its steps. |

### Exact contract — what `docs/runbooks/incident.md` must state

House format: a short intro paragraph, then a **numbered, ordered** imperative
checklist in plain language (define "revoke", "rotate", "managed block", "git
history" in one clause each — the audience is a knowledge worker). The steps are
ordered so nothing reads/commits/injects the compromised state while you clean
up, and so the machine is **proven clean before it is re-authorized**. It opens
with a **step 0 preamble** that resolves the one authoritative **core** path
(Table A) and requires every later path to use it, then covers, **in this order**:
(1) stop schedules + prove quiescence, (2) preserve evidence into a private
folder, (3) revoke+rotate credentials, (4) purge the compromised digest +
managed block, (5) clean git history, (6) run the byte-level acceptance drill,
(7) re-authorize only after a recorded drill pass.

**The runbook MUST embed the five Contract-reference tables below verbatim** —
they are the single authoritative source for the recurring
path/scheduler/restore/gate/approve contracts, and every operative step
**references the relevant table** instead of restating paths, labels, or commands
inline. (This concentration is deliberate: a future contract fix changes one table
cell, not N scattered prose sentences, and the endgame dry-run gate validates the
tables against a real install.)

#### Contract-reference tables (the runbook MUST contain these)

**Table A — Core & path resolution.** The **core** directory is resolved once, up
front, as: **`WIENERDOG_HOME` (if set) → else `<home>/.wienerdog`, where `<home>` =
`HOME` (if set) → else the platform account homedir** (`paths.js:54–55`:
`home = HOME || os.homedir()`, `core = $WIENERDOG_HOME || <home>/.wienerdog`; on
Windows `HOME` is honored **before** `USERPROFILE`). Read it **authoritatively** from
`wienerdog doctor`'s `core directory exists (<path>)` line (`<path>` is exactly
`getPaths().core`, `doctor.js:322`), then cross-check against that order. Everywhere
the runbook writes `<core>` it means POSIX `$CORE` / Windows `$core` — **never** a
hardcoded `~/.wienerdog` / `$env:USERPROFILE\.wienerdog`, and **never** a bare
relative `state/…`.

| Artifact | Path under the core (POSIX `$CORE/…` / Windows `$core\…`) | Note |
|---|---|---|
| config.yaml (`jobs:` = restore source) | `$CORE/config.yaml` | step-1 snapshot / step-7 restore source |
| digest | `$CORE/state/digest.md` | deleted in step 4, regenerated by `sync` |
| quarantine | `$CORE/state/quarantine/` | reviewed in step 4 |
| schedule watermarks | `$CORE/state/schedule.json` | watermark evidence only — **NOT** a restore source |
| run evidence | `$CORE/state/run-evidence.jsonl` | snapshot in step 2 |
| alerts | `$CORE/state/alerts.jsonl` | snapshot in step 2 |
| job logs | `$CORE/logs/<job>/` | snapshot in step 2 |
| Google broker tokens | `$CORE/secrets/google-token-*.json` | re-minted in step 3 |
| install manifest | `$CORE/install-manifest.json` | catch-up entry removed in step 1 |
| SessionStart hook | `$CORE/bin/session-start.sh` | driven in the step-6 drill (`doctor` does **not** print it) |
| Windows catch-up file | `$core\schedules\wienerdog-catchup.xml` | deleted in step 1 (Windows) |

**Outside the core** (do NOT prefix with `$CORE`):

| Artifact | Path | Note |
|---|---|---|
| macOS catch-up plist | `~/Library/LaunchAgents/ai.wienerdog.catchup.plist` | always home-based, independent of `WIENERDOG_HOME` |
| incident evidence folder | `~/wienerdog-incident-<date>/` | private, sync/backup-excluded (step 2) |
| persisted CORE-PATH record | `~/wienerdog-incident-<date>-CORE-PATH.txt` | survives the step-1 reboot; also noted off-machine |

**Table B — Scheduler artifacts per platform.** `schedule remove <job>` unregisters
(best-effort) and deletes only **that job's own** file + manifest entry, **drops the
job from `config.yaml`**, and stops only **future** fires (a job running *right now*
keeps running). It **leaves the shared catch-up entry** (removing the FINAL job also
tears catch-up down, but only best-effort). **Resurrection rule:** `wienerdog sync`
re-arms schedules **from `config.yaml`**, regenerating canonical content:
`reloadMissing` (`sync.js:239`) re-registers a missing per-job registration for
every job still listed in `config.yaml`, and `repairCatchup` (`schedule.js:588`)
regenerates + re-registers the shared catch-up entry whenever **at least one job
remains** (tearing it down when zero remain) — deleted files or manifest entries do
not stop either heal. So the block that matters is an **empty `jobs:` list**; the
catch-up stop below still deletes the **FILE and the manifest entry** (immediate
disarm + defense-in-depth for the best-effort auto-teardown), not merely
unregisters.

| Platform | Per-job registration | Catch-up label / file | Stop-the-catch-up (all three: unregister + delete file + drop manifest entry) |
|---|---|---|---|
| macOS | launchd LaunchAgent | `ai.wienerdog.catchup` / `~/Library/LaunchAgents/ai.wienerdog.catchup.plist` | `launchctl bootout gui/$(id -u)/ai.wienerdog.catchup` (fallback `launchctl remove ai.wienerdog.catchup`); delete the plist; delete its `scheduler-entry` from `$CORE/install-manifest.json` |
| Windows | Task Scheduler `\Wienerdog\<job>` | `\Wienerdog\catchup` / `$core\schedules\wienerdog-catchup.xml` | `Unregister-ScheduledTask -TaskPath '\Wienerdog\' -TaskName 'catchup' -Confirm:$false`; delete the XML; delete its `scheduler-entry` from `$core\install-manifest.json` |
| Linux | systemd `--user` | **none** (no catch-up on Linux) | nothing to do |

**Blocking re-verify** (do not proceed until ALL FIVE hold): the OS registration is
gone AND the scheduler file is gone AND `install-manifest.json` has no catch-up
`scheduler-entry` AND `$CORE/config.yaml` lists **zero** `jobs:` entries (the heal
source — a surviving job re-arms itself and catch-up on the next `sync`) AND an
**independent enumeration of Wienerdog OS registrations returns nothing** — the
per-job OS unregister is best-effort, so a failed one (on Windows, an imported
Task Scheduler task survives XML deletion) can leave an armed registration that
none of the other four checks see once `config.yaml` and the manifest are clean:

- macOS: `launchctl list | grep ai.wienerdog` must print **nothing** (per-job
  labels are `ai.wienerdog.<job>`; catch-up is `ai.wienerdog.catchup`).
- Linux: `systemctl --user list-timers 'wienerdog-*' --all` and
  `systemctl --user list-units 'wienerdog-*' --all` must list **no** units
  (units are `wienerdog-<job>.timer` / `wienerdog-<job>.service`).
- Windows (PowerShell): `Get-ScheduledTask -TaskPath '\Wienerdog\'
  -ErrorAction SilentlyContinue` must return **nothing** (every Wienerdog task,
  catch-up included, lives under `\Wienerdog\`).

A hit in any of these means an armed registration survived — unregister it with
the platform's own command (the Table B "Stop-the-catch-up" column shows the
shapes) and re-run the enumeration until it is empty.

**Table C — Restore rules (step 7).** Restore **source** = the `config.yaml` `jobs:`
section (each job's `name` / `at` / `run` / `timeout_minutes`), snapshotted in step 1.
**Not** `schedule.json` (watermark-only: `last_success` / `last_status` /
`last_error_at`).

| `run:` type | Re-addable this release? | How |
|---|---|---|
| `builtin:<name>` (today `builtin:dream`) | **Yes** | `wienerdog schedule add <name> --at <HH:MM> --job <builtin> --timeout <minutes>` (rebuilt from the snapshot) |
| `skill:<name>` | **No** — frozen by the A0 pre-use gate (audit A1); `--skill` fails closed | preserve-only: keep the snapshot definition, re-add later when the gate opens |

**Table D — Managed-block drill gate (step 6).** Prove the block via a **three-check
conjunction** on **each installed harness file** (`CLAUDE.md` and/or `AGENTS.md`; a
single-harness install legitimately has only one): (1) a **notice-tolerant** clean
`sync`, (2) a `grep -F` of the poisoned marker over the **ENTIRE** file (a
both-sentinels-deleted attack leaves poison that `sync` appends around — a region-only
grep would falsely pass), (3) **exactly one** `<!-- wienerdog:begin -->` …
`<!-- wienerdog:end -->` pair (duplicated = failure; missing = `sync` appended a fresh
block and the old content is orphaned outside it → manually remove/quarantine,
re-`sync`, re-drill). **Do NOT** byte-compare the sentinel region against the raw
`$CORE/state/digest.md` — `sync` trims + neutralizes, so the region is never
byte-identical and such a compare falsely fails on a clean install. `doctor` does
**not** verify managed-block / sentinel integrity — never treat a clean `doctor` as
proof here.

| Signal from `sync` | Verdict |
|---|---|
| non-zero `sync` exit | **BLOCK** |
| "managed block not updated" / out-of-sync for an installed file | **BLOCK** |
| missing digest | **BLOCK** |
| skipped installed adapter (installed harness whose adapter did not run) | **BLOCK** |
| shadowing `AGENTS.override` displacing the block | **BLOCK** |
| `/hooks` hook-trust notice (Codex, every clean sync) | **ALLOW** (informational) |
| "skills aren't slash commands" notice (Codex, every clean sync) | **ALLOW** (informational) |

**Table E — `wienerdog memory approve <note>` arguments.** `<note>` is one of these
**fixed short names** only (verified against `memory.js`'s `KNOWN` allowlist); it
accepts **no** arbitrary file path (no `06-Identity/…`, no `..`, no `/`) and has no
headless/`--yes` bypass — it is interactive and shows the exact bytes.

| Allowed `<note>` | Or its `.md` basename |
|---|---|
| `profile` | `profile.md` |
| `preferences` | `preferences.md` |
| `goals` | `goals.md` |
| `instructions` | `instructions.md` |

#### The ordered steps (each references the tables above)

0. **Resolve the one authoritative core (Table A) — FIRST, before any other step, and
   use it everywhere below (R7-1/R8-4).** Wienerdog's files do NOT always live in
   `~/.wienerdog`; assuming the default on a custom-`WIENERDOG_HOME` or `HOME`-set
   install points every later path at the WRONG directory — you would unregister the OS
   task while the REAL catch-up file (`$core\schedules\wienerdog-catchup.xml`, Table A)
   and its manifest entry survive, every check would pass, and step 4's `wienerdog sync`
   would then RESURRECT catch-up before the drill.
   - **Read the core from `wienerdog doctor`** (the code-authoritative source, Table A)
     and set your core variable to that `core directory exists (<path>)` value:
     - macOS / Linux: `CORE="$(wienerdog doctor 2>/dev/null | sed -n 's/.*core
       directory exists (\(.*\)).*/\1/p')"; echo "$CORE"`.
     - Windows (PowerShell): `$core = (wienerdog doctor 2>$null | Select-String
       'core directory exists \((.*)\)').Matches.Groups[1].Value; $core`.
   - **Cross-check** that value against the Table A resolution order — `WIENERDOG_HOME`,
     else `HOME`, else the platform account home directory, then `.wienerdog` (do **not**
     jump straight to `USERPROFILE`/`~` when `HOME` is set):
     - macOS / Linux: `echo "${WIENERDOG_HOME:-${HOME:-$HOME}/.wienerdog}"` (on POSIX
       `HOME` is effectively always set; if it somehow is not, use the account's home dir).
     - Windows (PowerShell): `if ($env:WIENERDOG_HOME) { $env:WIENERDOG_HOME }
       elseif ($env:HOME) { "$env:HOME\.wienerdog" } else { "$env:USERPROFILE\.wienerdog" }`
       — `HOME` before `USERPROFILE`, matching the code. If `doctor` and the cross-check
       disagree, STOP and reconcile — your interactive environment differs from the install.
   - **DISPLAY** the resolved core and **CONFIRM** it holds the real install — it must
     contain `config.yaml`, `state/`, and `install-manifest.json` (Table A):
     - macOS / Linux: `ls "$CORE/config.yaml" "$CORE/state" "$CORE/install-manifest.json"`.
     - Windows (PowerShell): `Test-Path "$core\config.yaml"`, `Test-Path "$core\state"`,
       and `Test-Path "$core\install-manifest.json"` must all return `True`.
   - **Persist it durably NOW — it must survive the step-1 reboot (R8-2).** The
     `$CORE`/`$core` shell variable and a one-shot `WIENERDOG_HOME` export do **NOT**
     survive a reboot, yet every post-reboot step (sync, memory approve, schedule add,
     doctor, all verifications) must run against THIS core. Record it to the CORE-PATH
     record **outside** the core (Table A) AND note it off-machine (paper / phone):
     - macOS / Linux: `echo "$CORE" > "$HOME/wienerdog-incident-<date>-CORE-PATH.txt"`.
     - Windows (PowerShell): `$core | Out-File "$env:USERPROFILE\wienerdog-incident-<date>-CORE-PATH.txt"`.
     In step 2 this record joins the private incident evidence folder.

   Everywhere this runbook writes `<core>` (POSIX `$CORE`, Windows `$core`) it means
   THIS resolved directory (Table A), **never** a hardcoded `~/.wienerdog` /
   `$env:USERPROFILE\.wienerdog`, and never a bare relative `state/…`. The macOS
   catch-up LaunchAgent plist is the one path NOT under the core (Table A, "Outside the
   core") — see step 1.

1. **Stop everything that can fire, then reach proven quiescence — before anything
   else.** In order:
   - **Create the private evidence folder FIRST — before anything is removed.** The
     snapshot below needs a safe destination that exists BEFORE `schedule remove`
     mutates the source, so the incident evidence folder is created, permissioned, and
     backup-excluded now, at the start of step 1 (step 2 then copies the remaining
     evidence into the same folder). Put it at the Table A evidence-folder path
     (`~/wienerdog-incident-<date>/`, outside the core) and outside any synced/backed-up
     path (not under iCloud Drive / Dropbox / OneDrive / Google Drive):
     - macOS / Linux: `mkdir -m 700 ~/wienerdog-incident-<date>`, and add that folder to
       your backup exclusions *before* anything is copied in (Time Machine: System
       Settings → Time Machine → Options → add the folder).
     - Windows (PowerShell): create the folder, then strip inherited access and grant only
       your account — `icacls <folder> /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F"`
       — and exclude it from File History / OneDrive backup, all before copying.
   - **Snapshot the job DEFINITIONS next (Table A / Table C restore source).** Copy the
     `config.yaml` `jobs:` section (Table A: `$CORE/config.yaml`) into that folder
     NOW — **every** job, including each `run: skill:<name>` routine (its
     only record for later, Table C). `schedule remove` mutates `config.yaml` and
     `schedule list` omits `timeout_minutes`, so this snapshot — **not** `schedule.json`
     (watermark-only, Table A/C) — is what step 7 restores from. You MAY also copy
     `$CORE/state/schedule.json` as watermark evidence. Handle both with the step-2
     private-folder discipline.
   - **Unregister every per-job schedule (Table B).** `wienerdog schedule list`, then
     `wienerdog schedule remove <name>` for every job. State plainly that `remove` only
     stops **future** fires (best-effort OS unregister) and does **not** stop a job
     running **right now** (proven separately below); you re-add in step 7.
   - **Remove the shared catch-up entry (Table B) — unregister + delete its scheduler
     FILE + drop its `install-manifest.json` entry, then the Table B blocking
     re-verify.** Removing the FINAL job auto-tears catch-up down only best-effort, so
     remove it by hand using the Table B "Stop-the-catch-up" commands for your platform.
     **Unregister-only is NOT enough** (Table B resurrection rule: the next `wienerdog
     sync` — step 4 and again in the step-6 drill — regenerates + re-registers catch-up
     from `config.yaml` whenever any job remains listed there). When editing
     `install-manifest.json`, delete **only** the catch-up `scheduler-entry` (the object
     whose `unload` argv names `ai.wienerdog.catchup` / `\Wienerdog\catchup`), no
     unrelated entries. **Linux: nothing to do.** Do not proceed until the Table B
     blocking re-verify passes — all FIVE checks: OS registration gone AND scheduler
     file gone AND no catch-up manifest entry AND `config.yaml` lists zero `jobs:`
     entries AND the Table B **independent per-platform enumeration** of Wienerdog OS
     registrations (launchd labels / systemd units / `\Wienerdog\` tasks) returns
     **nothing** — the per-job unregister is best-effort, so a failed one leaves an
     armed registration the config/manifest checks cannot see. A surviving `jobs:`
     entry or a surviving OS registration means the machine can still fire — STOP and
     fix it.
   - **Reach proven quiescence — the ONLY authoritative path is to REBOOT.** With every
     per-job schedule and the catch-up entry removed, reboot the machine. After the reboot
     nothing can have re-fired, so **zero** Wienerdog processes run — platform-
     independently, with no process forensics. **Credential rotation (step 3) begins only
     after this reboot. A reboot is the sole proof of quiescence this runbook accepts.**
   - **After the reboot: RE-READ the persisted record, RE-EXPORT the core, THEN
     re-confirm via `doctor` — in that order, before ANY further command (R8-2).** The
     reboot wiped your `$CORE`/`$core` shell variable and any one-shot `WIENERDOG_HOME`
     export, so a fresh shell would silently re-default the core — re-introducing
     exactly the wrong-directory bug step 0 guards against. The order matters:
     `doctor` reports the core from the CURRENT environment, so running it before the
     re-export would report the DEFAULT core on a custom-core install and the equality
     check would fail with no way forward. In the new post-reboot session, before
     running anything else:
     1. **Read the persisted record** (`wienerdog-incident-<date>-CORE-PATH.txt`,
        Table A) and validate it: an absolute path to an existing directory that holds
        the `config.yaml` / `state/` / `install-manifest.json` triple (Table A). If
        not → STOP and reconcile.
     2. **Re-export it for the whole session:** macOS / Linux `export
        WIENERDOG_HOME="$CORE"`; Windows (PowerShell) `$env:WIENERDOG_HOME = "$core"`.
     3. **THEN run `wienerdog doctor`** and require its `core directory exists
        (<path>)` line to EQUAL the persisted value. A mismatch means your session is
        not acting on the confirmed core — STOP and reconcile.
     From here on, **every** post-reboot Wienerdog command — `wienerdog sync`, `wienerdog
     memory approve`, `wienerdog schedule add`, `wienerdog doctor`, and the drill hook run
     in step 6 — MUST run with `WIENERDOG_HOME` set to this `$CORE` (the export above does
     that for the session), so none can act on a re-defaulted core.
   - **A live-process grep is NOT proof — it can only catch a live job, never certify a
     clean one (R4-C).** You MAY grep *before* rebooting — macOS / Linux `pgrep -fl
     'wienerdog|claude|codex'`, or Windows (PowerShell) `Get-CimInstance Win32_Process |
     Where-Object { $_.CommandLine -match 'wienerdog|claude|codex' }`. If it finds
     **anything**, the machine is **definitely still compromised** — stop and escalate.
     But a **clean** result proves nothing and must **never** be read as quiescence — a
     prompt-injected run can have spawned a **differently-named** helper (a `git`, a shell,
     an arbitrary binary) with no `wienerdog`/`claude`/`codex` in its name and no direct
     Wienerdog parent, which this grep (and any one-level `pgrep -P` / name-substring scan)
     will miss. The grep is a non-authoritative hint only; **you still must reboot.**
   - **If you genuinely CANNOT reboot: STOP and escalate — do NOT certify clean.** There
     is no grep-based substitute for the reboot. Treat the machine as still-compromised
     (assume a stale-privilege child may still be running) and escalate — do **not**
     proceed to credential rotation on the strength of a "nothing found" grep.

2. **Preserve the evidence — into the already-secured folder from step 1.** The private,
   sync/backup-excluded folder was created, permissioned, and backup-excluded at the
   START of step 1 (so the `jobs:` snapshot had a safe destination); re-check it is still
   private and still outside every synced path before copying more into it. **Treat every
   copy as potentially sensitive** — redaction is best-effort (a boundary-split or
   encoded secret can survive in a log; ADR-0024), so this is your incident timeline but
   is **not** guaranteed secret-free.
   - **Copy the evidence in** — all Table A paths: the `$CORE/config.yaml` `jobs:` snapshot
     (already there from step 1), `$CORE/state/run-evidence.jsonl`,
     `$CORE/state/alerts.jsonl`, and the relevant `$CORE/logs/<job>/` files; optionally
     `$CORE/state/schedule.json` too (watermark evidence, not the restore source). Also
     move the step-0 `wienerdog-incident-<date>-CORE-PATH.txt` record (Table A) into this
     folder so the confirmed core path is filed alongside the timeline.
   - **Re-apply private modes recursively, then re-verify (blocking).** The copies leave
     Wienerdog's own `0700`/`0600` protection when they land elsewhere, so restore it over
     the **whole tree** — a plain `chmod 600 …/*` is wrong (it strips directory traversal
     and misses nested files):
     - macOS / Linux: `find ~/wienerdog-incident-<date> -type d -exec chmod 700 {} +` then
       `find ~/wienerdog-incident-<date> -type f -exec chmod 600 {} +`; then re-verify
       nothing is looser — `find ~/wienerdog-incident-<date> \( -type d ! -perm 700 -o
       -type f ! -perm 600 \) -print` must print **nothing**. If it prints anything, STOP
       and fix it before continuing (do not run cleanup over unverified-private evidence).
     - Windows: confirm the `icacls` grant applied recursively (`(OI)(CI)`) and that no
       inherited ACE remains (`icacls <folder>` shows only your account).
   - *(Optional, your judgment.)* Record an integrity hash of each copied file
     (`shasum -a 256 …`) so you can later prove the timeline was not altered.
   - Do not run any cleanup step until this private, verified snapshot exists.

3. **Revoke, then rotate, the affected credentials — at the provider.** Point at
   `secret-incident.md` step 2 for the exact revoke-then-rotate discipline (a
   rotated-but-not-revoked key is still live). Cover the credentials Wienerdog holds:
   Google broker tokens (`$CORE/secrets/google-token-*.json`, Table A — re-run the Google
   setup to re-mint) and any provider API key the machine used. For a suspected *machine*
   compromise, treat every credential the machine touched as exposed.

4. **Remove the compromised injected context — the digest AND the managed block.** This
   stops the poisoned identity/context from entering new sessions:
   - Delete `$CORE/state/digest.md` (Windows `$core\state\digest.md`; Table A) — it is
     regenerated. Use the explicit resolved path, never a bare relative `state/…` (that
     resolves against your CWD and could delete the wrong file while the real compromised
     one survives).
   - **Fix the source, then re-ratify.** If an **identity note** (vault identity folder,
     default `06-Identity/`) was poisoned, correct it in the vault. Digest injection is
     byte-gated by the identity trust registry (ADR-0021), so the changed note is **not**
     re-injected until you re-ratify it: run `wienerdog memory approve <note>` on the
     corrected note with a **Table E** short name (never a file path) — only the bytes you
     just reviewed can ever be injected again.
   - **Before you run `sync`, confirm step 1's stop is complete (Table B resurrection
     rule).** `wienerdog sync` heals schedules from `config.yaml` (`reloadMissing` +
     `repairCatchup`); if step 1 left ANY job in the `jobs:` list, this `sync` will
     re-register that job's schedule AND regenerate + re-register the catch-up entry
     here — re-arming the machine before the drill. `sync` must **not** be able to
     reactivate ANY schedule before step 7: do not run it until step 1's Table B
     blocking re-verify (including the zero-`jobs:` check) passed.
   - Run `wienerdog sync` — it re-renders a clean `$CORE/state/digest.md` and re-writes
     the CLAUDE.md / AGENTS.md **managed block** (the sentinel-delimited region Wienerdog
     owns) from the current, corrected identity. When the file holds exactly one valid
     sentinel pair, `sync` replaces only the content between the sentinels — so a block
     whose TEXT was tampered is restored. But when BOTH sentinel markers were deleted,
     `sync` cannot find the block and **APPENDS a fresh one — the poisoned text survives
     elsewhere in the file** (Table D's whole-file grep exists for exactly this case):
     locate and remove/quarantine the orphaned text by hand, re-run `sync`, and re-run
     the step-6 drill. (One sentinel missing, or duplicated sentinels, makes `sync`
     refuse with a "managed block not updated" message — resolve the markers by hand,
     then re-run `sync`.)
   - Also review `$CORE/state/quarantine/` (Windows `$core\state\quarantine\`; Table A;
     cross-link `secret-incident.md` step 3 for the true-positive/false-positive handling)
     — again the explicit resolved path, never a bare relative `state/…`.

5. **Clean the git history (vault).** Cross-link `secret-incident.md` step 4 for
   the concrete commands (`git commit --amend` / `git rebase -i` for a recent
   commit; `git filter-repo` or BFG for older/many). State the same safety note:
   the vault is local and not auto-pushed, so this rewrites only your machine's
   history; if you ever pushed a fork/remote, force-push there too and treat the
   credential/content as compromised regardless.

6. **Run the acceptance drill FIRST — prove the old digest/managed block is gone BEFORE
   you re-authorize (the drill is the gate, not an afterthought — you do **not** re-add
   schedules until it passes).** Because the SessionStart hook is deliberately
   **fail-open** (it prints nothing and exits `0` on a missing/unreadable digest, a
   missing `node`, or when `WIENERDOG_JOB` is set — so empty output is **NOT** proof of a
   clean digest), run it **fail-closed**: drive the installed hook with the right
   environment and treat any empty/malformed output as a FAILURE, then byte-compare what
   it *would* inject against the digest. The runbook ships the drill as complete
   copy-paste blocks (bash + PowerShell) that stop at the first failure; a printed
   "DRILL PASS" is the pass.
   - **The operator DECLARES the installed harness set, and the script enforces it
     (round-2 F1).** The block's first operator input (`HARNESSES` / `$Harnesses`)
     lists every harness Wienerdog was installed into (`claude`, `codex`, or both),
     cross-checkable against the `managed-block` entries the block prints from
     `$CORE/install-manifest.json` (via a dependency-free `node -e` — node is
     guaranteed). The script FAILS (exit nonzero, no PASS) when the declared list is
     empty, when any declared harness's file is missing, when `sync` printed one of
     its exact adapter-skip messages ("not detected; skipping adapter" / "config is
     no longer present; skipping adapter", `sync.js:317–329`) for a DECLARED harness,
     or when the count of checked files differs from the declared count. It also
     **pins the harness-detection environment** — unsetting `CLAUDE_CONFIG_DIR` and
     `CODEX_HOME` BEFORE `sync` and the file checks (both variables steer
     `detectHarnesses` AND the file paths, so an ambient redirect would hide the real
     files from every check at once); a custom-dir installer consciously sets the
     matching variable inside the block instead.
   - **Drive the installed SessionStart hook with the injecting environment.** Run the
     installed hook at `$CORE/bin/session-start.sh` (Table A; the adapter installs it under
     the core — `doctor` does **not** print the path) with `WIENERDOG_HOME` set to the
     step-0 core and `WIENERDOG_JOB` **cleared** (an inherited `WIENERDOG_JOB` makes the
     hook exit `0` with no output — a false "clean"):
     `WIENERDOG_JOB= WIENERDOG_HOME="$CORE" "$CORE/bin/session-start.sh"`
   - **Verify fail-closed.** Pipe that stdout through a tiny `node -e` that parses the JSON
     envelope and BLOCKS (drill FAILS — do not re-authorize) on any of: empty stdout, a
     JSON-parse failure, `hookSpecificOutput.hookEventName !== 'SessionStart'`, or a
     non-string `additionalContext`. When it parses, **byte-compare** `additionalContext`
     to the bytes of `$CORE/state/digest.md` (Table A) — they must be **identical** (the
     hook injects exactly those bytes) — AND confirm a `grep -F` for the poisoned marker
     over `additionalContext` finds nothing. A marker match, a mismatch against the
     digest, or any block condition means STOP.
   - **Grep the regenerated `$CORE/state/digest.md`** for the poisoned marker directly
     (belt-and-suspenders against the decoded bytes above).
   - **Check the managed block of every DECLARED harness file via the Table D three-check
     conjunction.** `sync` runs only the **detected** harness's adapter, and a
     single-harness (Claude-only **or** Codex-only) install is supported and tested — so
     apply the Table D checks to `CLAUDE.md` **and/or** `AGENTS.md` exactly as declared:
     both files when both harnesses are installed, or only the single present file on a
     single-harness install. (A DECLARED harness's file being **missing** is a
     script-enforced failure — installed-but-missing; an *un-declared*, un-installed
     harness's absent file never blocks — do not let a legitimately absent file block
     re-authorization.) For each such file run all three Table D checks — the
     **notice-tolerant** clean `sync` (block only on the Table D **BLOCK** signals; the two
     constant Codex info notices are **ALLOWed**), the **whole-file** marker grep, and the
     **exactly-one-sentinel-pair** check — and do **NOT** byte-compare the region against
     the raw `$CORE/state/digest.md` (Table D: `sync`'s trim+neutralize transform means the
     region is never byte-identical, so that compare would falsely fail; the three checks
     prove the block clean by construction). `doctor` is **not** proof here (Table D).
   - *(Optional extra sanity check, NOT the proof.)* You may also start a **new** Claude
     Code / Codex session and confirm it does not surface the poisoned fact — a nicety, not
     the acceptance: the byte-level checks above are the proof (the injection is byte-gated,
     ADR-0021).
   Record the drill result (all checks above, clean). A9's acceptance is met only when the
   drill passes and is recorded — that recorded pass is the precondition for step 7.

7. **Re-authorize — only after a successful, recorded drill (step 6) and steps 1–5.**
   Re-add each removed schedule per **Table C**, reconstructing its exact command from the
   step-1 `config.yaml` `jobs:` snapshot: for every job whose snapshot `run:` is
   `builtin:<name>` (today `builtin:dream`) run `wienerdog schedule add <name> --at
   <HH:MM> --job <builtin> --timeout <minutes>` — `at` / `timeout_minutes` supply the
   other two flags. (The routine menu `/wienerdog-routines` is fine for the standard
   nightly dream.) A `skill:*` routine **CANNOT** be re-added this release (Table C:
   frozen by the A0 pre-use gate, audit A1 — `schedule add … --skill <name>` fails closed
   on a normal install, so this runbook will not promise a command that cannot work);
   **preserve its snapshot definition** (already in your step-1 snapshot) and re-add it
   later once the gate opens. Do **not** run the failing `--skill` re-add now. Then run
   `wienerdog doctor` and confirm nothing is flagged (permissions, scheduler load).
   Schedules come back **only** after the acceptance drill has passed and been recorded —
   never before.

Keep every command exact and every claim traceable to a shipped mechanism (do
not describe a "remove managed block" command — there is none; the mechanism is
fix-source → `memory approve` → `sync`). No jargon without a one-clause gloss.

**Every operative path under the core MUST be written with the step-0 resolved
prefix — `$CORE/state/…` (POSIX) or `$core\state\…` (Windows) — never a bare
relative `state/…` (R8-3).** A bare `state/digest.md` / `state/quarantine/` /
`state/schedule.json` resolves against the current working directory, so a precise
follower could delete or inspect the wrong file while the real compromised core
artifact is untouched. This binds the `digest.md` delete, the `quarantine/` review,
the `schedule.json`/`run-evidence.jsonl`/`alerts.jsonl` snapshots, and the `sync`
description — all get the explicit `<core>` prefix. When you must caution against
the relative form, write it as `state/…` (an ellipsis, not a concrete filename) so
the runbook never contains a bare operative `state/<file>` token.

## Implementation notes & constraints

- **Docs-only.** The Deliverables table is exhaustive; do not edit `src/` or
  `tests/` (CI rejects unlisted touches).
- **Do not duplicate `secret-incident.md`.** For the revoke/rotate and
  git-history mechanics, *cross-link* it rather than re-explaining; `incident.md`
  owns the general drill and the two steps unique to it (evidence preservation,
  digest/managed-block purge, acceptance drill). The secret leak is one branch of
  the general drill — say so in both files.
- **Traceability.** Every documented behavior must map to a shipped mechanism
  (`schedule`, `sync`, `memory approve`, `doctor`, the run-evidence artifacts,
  ADR-0021 byte-gating). Do not overclaim (e.g. do not imply Wienerdog can detect
  a compromise for you — the runbook is a human procedure).
- Markdown must pass the lint pipeline (markdownlint + frontmatter checks over
  docs). When uncertain, choose the simpler wording and record it under
  "Decisions made".

## Acceptance criteria

- [ ] **[R7-1/R8-4]** The runbook opens with a **step 0 preamble** (before step 1)
      that resolves the ONE authoritative **core** by **reading `wienerdog doctor`'s
      `core directory exists (<path>)` line** (the code-authoritative
      `getPaths().core`), and cross-checks it against the exact code-mirrored order —
      `WIENERDOG_HOME`, else `HOME`, else the platform account homedir, then
      `.wienerdog` (mirroring `paths.js:54–55`), with `HOME` tried **before**
      `USERPROFILE` on Windows (a Windows box with `HOME` set but `WIENERDOG_HOME`
      empty resolves under `HOME`, NOT `USERPROFILE`). It DISPLAYS the resolved core
      and has the user CONFIRM it holds the real install (`config.yaml`, `state/`,
      `install-manifest.json`). Every later path in the runbook — the catch-up
      scheduler XML, `install-manifest.json`, the evidence copy,
      `$CORE/state/digest.md`, the SessionStart hook, and every verification —
      references that same resolved `<core>` (`$CORE` / `$core`), **never** a
      hardcoded `~/.wienerdog` / `$env:USERPROFILE\.wienerdog`; the one documented
      exception is the macOS catch-up LaunchAgent plist
      (`~/Library/LaunchAgents/ai.wienerdog.catchup.plist`, always home-based).
- [ ] **[R8-2]** Step 0 **persists** the confirmed absolute core path durably
      OUTSIDE the core (a home-dir `wienerdog-incident-<date>-CORE-PATH.txt` record
      that survives the reboot, plus an off-machine note) BEFORE the step-1 reboot;
      and step 1, **after** the reboot, has a mandatory sub-step that — in this
      order — READS the persisted CORE-PATH record and validates it (absolute
      existing directory holding the `config.yaml`/`state/`/`install-manifest.json`
      triple), RE-EXPORTS `WIENERDOG_HOME` from it for the session
      (`export WIENERDOG_HOME="$CORE"` / `$env:WIENERDOG_HOME="$core"`), and only
      THEN runs `doctor`, requiring its reported core to EQUAL the persisted value
      (mismatch → STOP and reconcile) — never `doctor` first, which on a custom-core
      install would report the DEFAULT core and dead-end the equality check — so
      every post-reboot command (`sync`, `memory approve`, `schedule add`, `doctor`,
      the drill hook) runs against the SAME core, never a re-defaulted one. It
      states that the `$CORE`/`$core` shell variable and a one-shot
      `WIENERDOG_HOME` export do **not** survive a reboot.
- [ ] **[R8-3]** Every operative path under the core in the runbook uses the
      resolved prefix (`$CORE/state/…` / `$core\state\…`), never a bare relative
      `state/…`: the `digest.md` delete, the `quarantine/` review, the
      `schedule.json`/`run-evidence.jsonl`/`alerts.jsonl` snapshots, the `sync`
      description, and the drill's digest references all carry the explicit `<core>`
      prefix. `docs/runbooks/incident.md` contains **no** bare operative
      `state/<file>` token (cautions against the relative form use an ellipsis
      `state/…`, not a concrete filename).
- [ ] `docs/runbooks/incident.md` exists in the house numbered-checklist format
      and covers, **in order**: (1) snapshot the **`config.yaml` `jobs:`
      definitions** before removal (the restore source — `state/schedule.json`
      holds only watermarks, not job definitions), remove every per-job schedule
      **and** the shared catch-up entry (deleting the catch-up scheduler FILE
      **and** its `install-manifest.json` entry, not merely unregistering, and
      blocking on zero `config.yaml` `jobs:` entries so `sync`'s config-driven
      heal cannot re-arm anything), then reach proven quiescence
      by **reboot**
      (the **sole** authoritative proof — a pre-reboot process grep is a non-proof
      hint, and a user who cannot reboot **stops and escalates**, never
      grep-certifies clean); (2) preserve evidence
      into a **private, sync/backup-excluded** folder before any cleanup; (3)
      revoke+rotate credentials; (4) purge the compromised digest **and** managed
      block (fix source → `memory approve <note>` → `sync`); (5) clean git history;
      (6) the fail-closed byte-level acceptance drill proving the old
      digest/managed block is no longer injected; (7) re-authorize **only** after a
      recorded drill pass, reconstructing each **builtin** `schedule add --job` from
      the `jobs:` snapshot — a `skill:*` routine is NOT re-addable this release (A0
      gate), only its snapshot definition is preserved.
- [ ] Step order puts "stop all jobs" strictly before credential rotation, and
      puts the acceptance drill strictly **before** re-authorization (A9
      acceptance): schedules are re-added only after a recorded drill pass.
- [ ] The stop step states that `schedule remove` does **not** stop an
      already-running job **and leaves the shared catch-up entry**; it removes the
      catch-up entry (macOS `ai.wienerdog.catchup`, Windows `\Wienerdog\catchup`;
      Linux has none) by deleting its **scheduler FILE** (macOS LaunchAgents plist,
      Windows `<core>\schedules\wienerdog-catchup.xml`) **and** its
      `install-manifest.json` entry — not merely unregistering — and **blocks on a
      five-check re-verify that the OS registration AND the scheduler file are gone,
      no catch-up manifest entry remains, `config.yaml` lists zero `jobs:`
      entries, AND an independent per-platform enumeration of Wienerdog OS
      registrations (macOS `launchctl list | grep ai.wienerdog`; Linux
      `systemctl --user list-timers/list-units 'wienerdog-*' --all`; Windows
      `Get-ScheduledTask -TaskPath '\Wienerdog\'`) returns nothing** — the per-job
      unregister is best-effort, so a failed one (a Windows imported task surviving
      XML deletion) is invisible to the config/manifest checks — so `sync`'s
      config-driven heal has nothing to re-arm catch-up from and no armed
      registration survives unseen; it
      makes **reboot** the **sole authoritative** quiescence proof
      and states plainly that a pre-reboot live-process grep is **NOT proof** (it
      can only *reveal* a still-live job — a differently-named injected helper
      escapes it — never *certify* a clean one); credential rotation begins **only
      after a reboot**, and a user who cannot reboot **stops and escalates** rather
      than grep-certifying clean.
- [ ] **[R5-1]** The purge step (step 4) warns that `wienerdog sync` heals
      schedules from `config.yaml` (`reloadMissing` re-registers a missing per-job
      registration for any job still listed; `repairCatchup` regenerates +
      re-registers catch-up while any job remains); it states plainly that `sync`
      must **not** be able to reactivate ANY schedule before step 7, so step 1's
      blocking re-verify — including the zero-`jobs:` check — must have passed
      before any `sync`.
- [ ] The evidence-preservation step snapshots the **`config.yaml` `jobs:`
      definitions** (the restore source) **before** removal — optionally also
      `state/schedule.json` as watermark evidence — and names
      `state/run-evidence.jsonl`, `state/alerts.jsonl`, and
      `logs/<job>/`; treats them as **potentially sensitive** (best-effort
      redaction, not secret-free); creates+verifies the private, sync/backup-excluded
      folder at the **START of step 1** (before any `schedule remove` mutates the
      snapshot source) so every copy — the step-1 `jobs:` snapshot included — lands
      in an already-secured destination; and re-applies modes **recursively** (every dir
      `0700`, every file `0600`) with a blocking re-verify (macOS/Linux `find`
      forms; Windows `icacls`).
- [ ] The acceptance-drill step is **fail-closed**: it runs the installed
      **`<core>/bin/session-start.sh`** with `WIENERDOG_HOME` set and
      `WIENERDOG_JOB` cleared, BLOCKS on empty stdout / JSON-parse failure / wrong
      `hookEventName` / non-string `additionalContext`, byte-compares
      `additionalContext` to `$CORE/state/digest.md`, greps the regenerated digest,
      and checks the managed block of **every installed harness file** (both
      `CLAUDE.md` and `AGENTS.md` when both harnesses are installed, only the single
      present file on a single-harness install) via a **notice-tolerant** `sync`
      check **plus** an explicit check that (a) `grep -F`s the poisoned marker over
      the **ENTIRE** file (not only the sentinel region — a both-sentinels-deleted
      attack leaves poisoned text that `sync` appends around, still injected), and
      (b) confirms exactly one sentinel pair (no orphaned out-of-sentinel remnant),
      treating a **missing** pair as "`sync` appended a fresh block and the old
      content is orphaned outside it — manually remove/quarantine it" (**not**
      `doctor`); it does **NOT** byte-compare the sentinel region against the raw
      `$CORE/state/digest.md` (`sync`'s trim+neutralize transform means the region
      never equals the raw digest, so that compare would falsely fail on a clean
      install — the three checks prove the block clean by construction). The
      new-session observation is an optional extra, not the proof; the proof is tied
      to the ADR-0021 byte-gated injection.
- [ ] **[Round-2 F1]** The drill's harness coverage is **machine-enforced, not a
      judgment call**: the copy-paste blocks take an explicit operator declaration
      of the installed harness set (`HARNESSES` / `$Harnesses`), print the
      `managed-block` entries from `$CORE/install-manifest.json` (dependency-free
      `node -e`) so the declaration can be verified, **pin the harness-detection
      environment by unsetting `CLAUDE_CONFIG_DIR` and `CODEX_HOME` before `sync`
      and the file checks** (custom-dir installs consciously set the matching
      variable inside the block), and FAIL — printing no PASS — on an empty
      declaration, a missing declared harness file, a `sync` adapter-skip message
      ("not detected; skipping adapter" / "config is no longer present; skipping
      adapter") naming a declared harness, or a checked-file count that differs
      from the declared count. A zero-harness or hidden-harness environment can
      therefore never print DRILL PASS.
- [ ] **[Round-2 F2]** The PowerShell block passes the core path to `bash` as a
      **positional argument** (`bash -c '… "$1" …' _ "$coreFwd"`), never
      interpolated into the bash source, so a path containing an apostrophe,
      spaces, or hostile text cannot break or inject into the hook invocation;
      the bash block references `$CORE` only as a quoted variable and neither
      block rebuilds a path into nested shell source anywhere.
- [ ] **[R8-5]** The managed-block `sync` check is **notice-tolerant**: it blocks
      the drill **only** on a concrete integrity failure — a non-zero `sync` exit, a
      "managed block not updated" / out-of-sync message for an installed file, a
      missing digest, a skipped installed adapter, or a shadowing `AGENTS.override` —
      and **explicitly allows** the two constant Codex informational notices (the
      `/hooks` hook-trust notice and the skills-aren't-slash-commands notice) that
      `codex.js` emits on **every** successful sync. It does **not** require the
      absence of ALL notices (which could never pass on a Codex install).
- [ ] **[R4-D]** The re-authorize step re-adds **only builtin** jobs via
      `wienerdog schedule add … --job <builtin> …` reconstructed from the snapshot;
      it explicitly states a `skill:*` routine is **frozen by the A0 pre-use gate
      (audit A1)** and CANNOT be re-added this release (no `--skill` command
      promised — it would fail closed), directing the user to **preserve the
      snapshot definition** for later instead.
- [ ] `docs/runbooks/secret-incident.md` gains a cross-link naming `incident.md`
      as the general drill (its existing steps are unchanged).
- [ ] Every documented command/mechanism is one that already ships (no invented
      command); `memory approve` is shown with a short name, never a file path.
- [ ] **[Endgame dry-run gate]** Before this WP can leave Draft, the runbook is
      **DRY-RUN validated end-to-end** against **three** configurations, and the
      implementer/verifier **pastes the evidence** of each into the PR: (1) a **clean
      Claude-only** install, (2) a **clean Codex-only** install, and (3) a
      **custom-`WIENERDOG_HOME`** install (with `HOME` also set — on Windows this is
      the R8-4 case). For each, walk the runbook **step 0 → step 1 (stop + catch-up
      removal + reboot + post-reboot re-resolve/re-export) → step 4 `sync` → step 6
      drill → step 7 re-authorize** and confirm: (a) step 0 resolves the **correct**
      core (matching `wienerdog doctor`), and the persisted CORE-PATH survives the
      reboot and re-resolves identically; (b) no **false catch-up resurrection** —
      after step 1 the step-4 `sync` does not re-arm catch-up; and (c) the
      managed-block gate **passes** notice-tolerantly (the Codex-only run in
      particular passes **despite** the two constant Codex info notices). This is a
      literal validation the implementer/verifier performs; its pasted output is the
      evidence.
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
test -f docs/runbooks/incident.md && echo "runbook present — OK"
grep -n "incident.md" docs/runbooks/secret-incident.md && echo "cross-link present — OK"
# R7-1: a step-0 preamble resolves the ONE authoritative core, displays+confirms it,
# and every later path uses <core> rather than a hardcoded ~/.wienerdog:
grep -nE "env:WIENERDOG_HOME|step 0|resolve.*core|<core>|\\\$CORE" docs/runbooks/incident.md
# R8-4: step 0 reads the core from `wienerdog doctor` (code-authoritative) and the
# code-mirrored order tries HOME before USERPROFILE (never straight to USERPROFILE):
grep -nE "doctor|core directory exists|HOME.*USERPROFILE|WIENERDOG_HOME.*HOME|env:HOME" docs/runbooks/incident.md
# R8-2: step 0 persists the core path durably before the reboot, and step 1
# re-resolves + re-confirms + re-exports WIENERDOG_HOME after the reboot:
grep -nE "CORE-PATH|survive.*reboot|after the reboot|RE-RESOLVE|re-resolve|export WIENERDOG_HOME|env:WIENERDOG_HOME =" docs/runbooks/incident.md
# R8-3: no bare relative operative state/<file> path anywhere in the runbook. Every
# POSIX reference must be slash-prefixed ($CORE/state/… , <core>/state/…); Windows uses
# `$core\state\…` (backslash separator — never matches `state/`); cautions use an
# ellipsis (state/…). Stage 1 finds every `state/<file>`, stage 2 drops the prefixed
# `/state/` ones — anything the pipe still PRINTS is a bare relative path to fix
# (expect NO output):
grep -nE "state/(digest|quarantine|schedule|run-evidence|alerts)" docs/runbooks/incident.md | grep -vE "/state/"
# each required mechanism is referenced (config.yaml jobs: is the restore source):
grep -nE "schedule (list|remove)|config\.yaml|jobs:|run-evidence\.jsonl|memory approve|wienerdog sync|managed block" docs/runbooks/incident.md
# the restore snapshot is config.yaml jobs:, and schedule.json is only watermark evidence:
grep -nE "config\.yaml.*jobs:|jobs:.*definition|watermark" docs/runbooks/incident.md
# the catch-up removal + reboot-as-SOLE-proof + the grep-is-not-proof / escalate wording:
grep -nE "ai\.wienerdog\.catchup|\\\\Wienerdog\\\\catchup|reboot|CommandLine|claude\|codex" docs/runbooks/incident.md
# R5-1: catch-up removal deletes the scheduler FILE + install-manifest.json entry
# (not just unregister), and the config-driven heal (reloadMissing/repairCatchup)
# has nothing to re-arm once config.yaml lists zero jobs:
grep -nE "install-manifest\.json|reloadMissing|resurrect|re-register|scheduler file|catchup\.plist|wienerdog-catchup\.xml" docs/runbooks/incident.md
grep -niE "not proof|non-proof|cannot reboot|escalate|sole" docs/runbooks/incident.md
# F1: the blocking re-verify's FIFTH check independently enumerates remaining
# Wienerdog OS registrations per platform (zero results required):
grep -nE "launchctl list \| grep ai\.wienerdog|list-timers 'wienerdog-\*'|list-units 'wienerdog-\*'|Get-ScheduledTask -TaskPath" docs/runbooks/incident.md
# Round-2 F1: the drill declares the installed harness set, pins the detection env,
# cross-checks the manifest, blocks on a declared harness's adapter-skip, and
# enforces checked==declared; round-2 F2: the PS->bash core path is positional:
grep -nE "HARNESSES=|\\\$Harnesses|managed-block|unset CLAUDE_CONFIG_DIR CODEX_HOME|Remove-Item Env:|skipping adapter|checked.*declared|bash -c '.*\"\\\$1\"" docs/runbooks/incident.md
# private evidence handling: pre-copy exclusion + recursive perms + windows ACL:
grep -nE "find .*-type d.*chmod 700|find .*-type f.*chmod 600|icacls|Time Machine|OneDrive" docs/runbooks/incident.md
# the fail-closed byte-level drill: installed hook path + env + block conditions:
grep -nE "bin/session-start\.sh|WIENERDOG_HOME|WIENERDOG_JOB|additionalContext|hookEventName|AGENTS\.md" docs/runbooks/incident.md
# the managed-block check greps the WHOLE file, handles a missing sentinel pair
# (orphaned poison) and a single-harness (Claude-only / Codex-only) install:
grep -niE "entire file|whole .*file|orphan|installed harness|single-harness" docs/runbooks/incident.md
# R6-1: the managed-block check is the three-check conjunction (clean sync + whole-file
# marker grep + exactly one sentinel pair), NOT a fragile region-vs-raw-digest
# byte-compare (buildBlock trims+neutralizes, so the region never equals the raw digest):
grep -niE "by construction|never byte-identical|falsely fail|one sentinel pair|three-check" docs/runbooks/incident.md
# R8-5: the managed-block sync check is NOTICE-TOLERANT — it blocks only on concrete
# integrity failures and explicitly allows the two constant Codex info notices, so a
# Codex-only install can pass (it does NOT require the absence of all notices):
grep -niE "notice-tolerant|info notice|constant.*notice|integrity failure|not updated|skipped.*adapter|AGENTS.override|allowed" docs/runbooks/incident.md
# memory approve uses a short name, not a path:
grep -nE "memory approve (profile|preferences|goals|instructions|<note>)" docs/runbooks/incident.md
# R4-D: re-authorize re-adds only builtin --job; skill:* is frozen (A0/A1) and not
# re-addable, only its snapshot definition preserved:
grep -nE "schedule add.*--job|frozen|A0|A1|not.*re-add|cannot be re-added" docs/runbooks/incident.md
# the drill precedes re-authorization (drill line number < re-add line number):
awk '/acceptance drill/{d=NR} /schedule add|routine menu|Re-authorize/{if(d){print "drill@"d" before re-auth@"NR; exit}}' docs/runbooks/incident.md
```

## Out of scope (do NOT do these)

- Any `src/` or `tests/` change — this WP is docs-only.
- The **private-modes / permissive-umask / upgrade-repair** half of A9 —
  **WP-a9-private-modes-repair** (code).
- The **alert-body raw-tail exclusion** — that belongs to the self-alert work
  (WP-151), not here (per the A9 gap analysis).
- Rewriting `secret-incident.md`'s steps — only add the cross-link.
- Marketing/article copy — the docs series is a separate wd-docs track.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `docs(security): general incident-drill runbook (WP-a9-incident-runbook)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
