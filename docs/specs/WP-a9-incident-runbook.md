---
id: WP-a9-incident-runbook
title: Add the general incident-drill runbook — stop schedules, preserve evidence, rotate credentials, purge injected digest/managed block, clean git history, re-authorize
status: Draft
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
(R7-1).** The shipped path layer resolves the **core** dir to `$WIENERDOG_HOME`
when that variable is set, otherwise the platform default `~/.wienerdog`
(`src/core/paths.js:55` — `core = $WIENERDOG_HOME || ~/.wienerdog`). A runbook that
hardcodes `~/.wienerdog` (or Windows `$env:USERPROFILE\.wienerdog`) is **wrong on a
custom-`WIENERDOG_HOME` install**: it would unregister the OS task while leaving the
REAL `<core>/schedules/wienerdog-catchup.xml` and its manifest entry intact — every
check passes, then step 4's `wienerdog sync` `reloadMissing` resurrects catch-up
before the drill. So the runbook must, **before step 1 (a step 0 preamble)**,
resolve ONE authoritative core, display it, have the user confirm it, and use that
SAME resolved core for **every** path it later names (the catch-up XML/plist, the
install manifest, the evidence copy, the digest grep, the SessionStart hook, and all
verifications). The one path that is NOT under the core is the macOS catch-up
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
- **`wienerdog sync` RE-REGISTERS a merely-unregistered catch-up entry — so
  unregister-only is not enough; the scheduler FILE and manifest entry must go
  too (R5-1).** `sync` calls `status.reloadMissing` (verified: `sync.js:197`),
  which walks **`install-manifest.json`** (`<core>/install-manifest.json`) and,
  for any `scheduler-entry` whose OS registration probes as **missing** but whose
  manifest entry **and scheduler file survive**, re-registers it via the platform
  reload command — `launchctl bootstrap` / `systemctl enable --now` /
  `schtasks /create /xml` (verified: `status.js:31/40/49`). The catch-up entry's
  file (`entry.path`: macOS `~/Library/LaunchAgents/ai.wienerdog.catchup.plist`,
  Windows `<core>/schedules/wienerdog-catchup.xml`) and its manifest record both
  survive an unregister-only stop, so the **next `wienerdog sync`** (step 4 and
  again in the step-6 drill) would **resurrect** the catch-up job — re-arming the
  machine *before* the acceptance drill and re-authorization. This is
  **cross-platform** (all three reload commands exist), not Windows-only, though
  the Windows stop text is the weakest today. The fix (contract step 1): the
  catch-up stop must **delete the scheduler file AND remove the catch-up entry
  from `install-manifest.json`** — not merely unregister — so `reloadMissing` has
  nothing to resurrect. (Named `schedule remove` already deletes a job's own file
  within the scheduler roots and drops its manifest entry, so a per-job-removed
  job cannot be resurrected; the catch-up is the one gap, because per-job `remove`
  deliberately leaves it.)
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
| create | docs/runbooks/incident.md | The general incident-drill runbook (house numbered-checklist format), opening with a **step 0 preamble** that resolves the ONE authoritative core = `$WIENERDOG_HOME` if set else the platform default (POSIX `${WIENERDOG_HOME:-$HOME/.wienerdog}`, Windows `$env:WIENERDOG_HOME` else `$env:USERPROFILE\.wienerdog`), DISPLAYS it, has the user CONFIRM it, and requires every later path (the catch-up XML/plist, the install manifest, the evidence copy, the digest grep, the SessionStart hook, and all verifications) to use that SAME `<core>` — never a hardcoded `~/.wienerdog` (R7-1); then the seven ordered A9 steps: (1) snapshot the `<core>/config.yaml` `jobs:` definitions (the restore source; `schedule.json` holds only watermarks), remove every per-job schedule **and** the shared catch-up entry — the catch-up removal deleting its scheduler FILE **and** its `install-manifest.json` entry, not merely unregistering it, so `sync`'s `reloadMissing` cannot resurrect it — then reach proven quiescence by REBOOT (the **sole** authoritative proof — a pre-reboot process grep is a non-proof hint that can only *reveal* a live job; if you cannot reboot you **stop-and-escalate**, never grep-certify clean); (2) preserve-evidence-privately; (3) revoke+rotate; (4) purge digest+managed-block; (5) clean git; (6) fail-closed acceptance drill (SessionStart-hook `additionalContext` byte-compare against the raw `state/digest.md`, plus a three-check managed-block proof — clean `sync` notice + whole-file marker grep + one-sentinel-pair check per installed harness file; **no** region-vs-raw-digest byte-compare, which would falsely fail because `sync` trims+neutralizes); (7) re-authorize by reconstructing `schedule add --job` for **builtin** jobs from the `jobs:` snapshot — a `skill:*` routine is frozen by the A0 pre-use gate (audit A1) and is NOT re-addable this release (do not promise a failing `--skill` command; only its snapshot definition is preserved for later). |
| modify | docs/runbooks/secret-incident.md | Add one cross-link near the top: the secret leak is the credential-specific case of the general incident drill (link `incident.md`); for a general or suspected-compromise incident, start there. Do NOT rewrite its steps. |

### Exact contract — what `docs/runbooks/incident.md` must state

House format: a short intro paragraph, then a **numbered, ordered** imperative
checklist in plain language (define "revoke", "rotate", "managed block", "git
history" in one clause each — the audience is a knowledge worker). The steps are
ordered so nothing reads/commits/injects the compromised state while you clean
up, and so the machine is **proven clean before it is re-authorized**. It opens
with a **step 0 preamble** that resolves the one authoritative **core** path
(below) and requires every later path to use it, then covers, **in this order**:
(1) stop schedules + prove quiescence, (2) preserve
evidence into a private folder, (3) revoke+rotate credentials, (4) purge the
compromised digest + managed block, (5) clean git history, (6) run the
byte-level acceptance drill, (7) re-authorize only after a recorded drill pass.
The detail of each:

0. **Resolve the one authoritative core path — do this FIRST, before any other
   step, and use it everywhere below (R7-1).** Wienerdog's files do NOT always live
   in `~/.wienerdog`: the path layer resolves the **core** directory to
   `$WIENERDOG_HOME` when that variable is set, otherwise the platform default
   `~/.wienerdog`. If you assume the default on a custom-`WIENERDOG_HOME` install,
   every path in this runbook points at the WRONG directory — you would unregister
   the OS task while leaving the REAL `<core>/schedules/wienerdog-catchup.xml` and
   its manifest entry intact, all your checks would pass, and step 4's `wienerdog
   sync` would then RESURRECT catch-up before the drill. So resolve `<core>` once,
   now, DISPLAY it, and CONFIRM it is the directory that actually holds your
   Wienerdog install (it must contain `config.yaml`, `state/`, and
   `install-manifest.json`) before continuing:
   - macOS / Linux: `CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"; echo "$CORE"`,
     then confirm it — `ls "$CORE/config.yaml" "$CORE/install-manifest.json"`.
   - Windows (PowerShell): `$core = if ($env:WIENERDOG_HOME) { $env:WIENERDOG_HOME }
     else { "$env:USERPROFILE\.wienerdog" }; $core`, then confirm
     `Test-Path "$core\config.yaml"` and `Test-Path "$core\install-manifest.json"`
     both return `True`.
   Everywhere this runbook writes `<core>` (POSIX `$CORE`, Windows `$core`) — the
   catch-up scheduler XML, the install manifest, the evidence you copy, the digest
   you grep, the installed SessionStart hook, and every verification — it means
   THIS resolved directory, **never** a hardcoded `~/.wienerdog` /
   `$env:USERPROFILE\.wienerdog`. The **one** path that is NOT under the core is the
   macOS catch-up LaunchAgent plist (`~/Library/LaunchAgents/ai.wienerdog.catchup.plist`),
   which is always home-based regardless of `WIENERDOG_HOME` — see step 1.

1. **Stop everything that can fire, then reach proven quiescence — before
   anything else.** In order:
   - **First, snapshot the job DEFINITIONS — before you remove anything.** The
     recoverable job definitions (each job's `name`, `at` time, `run` type, and
     `timeout_minutes`) live in the managed `jobs:` section of **`config.yaml`**
     (at the core root, `<core>/config.yaml` — the core you resolved in step 0, not
     necessarily `~/.wienerdog`) — **not** in
     `state/schedule.json`, which holds only run **watermarks** (`last_success` /
     `last_status` / `last_error_at`) and cannot restore a schedule. `wienerdog
     schedule remove` **mutates `config.yaml`** (it strips the job from the `jobs:`
     section), and `schedule list` does **not** print `timeout_minutes` — so a
     later plain re-add cannot losslessly restore the exact `at` / `run` /
     `timeout_minutes`. Copy the **`config.yaml` `jobs:` section** into the private
     incident folder (step 2) NOW; this snapshot is what step 7 re-authorizes from.
     Copy **every** job's definition, including any `run: skill:<name>` routine:
     a `skill:*` routine cannot be re-added this release (the A0 gate, step 7), so
     this snapshot is the **only** record of its definition to re-add later.
     (You MAY also capture `state/schedule.json` as separate **watermark evidence**
     — but it is **not** the restore source.) Handle both with the same private
     folder discipline as the rest of the evidence in step 2 — it is why the
     snapshot goes into that folder.
   - **Unregister every per-job schedule.** `wienerdog schedule list`, then
     `wienerdog schedule remove <name>` for every job (the nightly dream and any
     catalog routine). State plainly that `remove` only stops **future** fires
     and its OS-unregister is best-effort — it does **not** stop a job running
     **right now** (you prove that separately below), and you re-add in step 7.
   - **Remove the shared catch-up entry (macOS / Windows) — unregister it, delete
     its scheduler FILE, AND drop its `install-manifest.json` entry, then block on
     a dual re-verify.** Per-job `remove` deliberately leaves it, so remove it by
     hand. **Unregister-only is NOT enough:** the next `wienerdog sync` (step 4,
     and again in the step-6 drill) calls `reloadMissing`, which re-registers any
     manifest `scheduler-entry` whose OS registration is gone but whose manifest
     entry **and** scheduler file survive — so you must delete **all three**: the
     OS registration, the scheduler file, and the manifest entry.
     - macOS: `launchctl bootout gui/$(id -u)/ai.wienerdog.catchup` (fall back to
       `launchctl remove ai.wienerdog.catchup`), then delete its LaunchAgent plist
       (`~/Library/LaunchAgents/ai.wienerdog.catchup.plist` — this is the exact
       file `reloadMissing` would reload from, so it MUST go).
     - Windows (PowerShell): `Unregister-ScheduledTask -TaskPath '\Wienerdog\'
       -TaskName 'catchup' -Confirm:$false`, then delete its scheduler XML file
       (`<core>\schedules\wienerdog-catchup.xml`, where `<core>` is the `$core` you
       resolved in **step 0** — `$env:WIENERDOG_HOME` if set, else
       `$env:USERPROFILE\.wienerdog`; do NOT assume the default here — this is the
       file `reloadMissing` would reload from, so it MUST go too).
     - **Both platforms: remove the catch-up entry from
       `install-manifest.json`.** Open `<core>/install-manifest.json` (the `<core>`
       resolved in step 0) and delete
       the `entries[]` object whose `kind` is `scheduler-entry` and whose `path`
       is the catch-up plist/XML above (its `unload` argv names
       `ai.wienerdog.catchup` / `\Wienerdog\catchup`). With no manifest record,
       `reloadMissing` has nothing to iterate for the catch-up job. (Do NOT delete
       unrelated entries; edit only the catch-up object.)
     - **Blocking dual re-verify — do not proceed until BOTH are true:** (a) the
       OS registration is gone — macOS `launchctl list | grep -c
       ai.wienerdog.catchup` prints `0`; Windows `Get-ScheduledTask -TaskPath
       '\Wienerdog\' -ErrorAction SilentlyContinue` lists nothing; AND (b) the
       scheduler file is gone — macOS `test ! -e
       ~/Library/LaunchAgents/ai.wienerdog.catchup.plist`; Windows
       `Test-Path "$core\schedules\wienerdog-catchup.xml"` (the step-0 `$core`)
       returns `False` — and `<core>/install-manifest.json` no longer contains a
       catch-up `scheduler-entry`. If either the file or the manifest entry
       remains, STOP and fix it: a surviving file+entry means `sync` will
       re-arm the machine.
     - Linux/systemd: nothing to do — there is no catch-up entry on this
       platform.
   - **Reach proven quiescence — the ONLY authoritative path is to REBOOT.** With
     every per-job schedule and the catch-up entry removed, reboot the machine.
     After the reboot nothing can have re-fired, so **zero** Wienerdog processes
     run — platform-independently, with no process forensics. **Credential rotation
     (step 3) begins only after this reboot. A reboot is the sole proof of
     quiescence this runbook accepts.**
   - **A live-process grep is NOT proof — it can only catch a live job, never
     certify a clean one (R4-C).** You MAY run a quick check *before* rebooting to
     see whether an obvious Wienerdog process is still up — macOS / Linux `pgrep
     -fl 'wienerdog|claude|codex'`, or Windows (PowerShell) `Get-CimInstance
     Win32_Process | Where-Object { $_.CommandLine -match 'wienerdog|claude|codex' }`.
     If it finds **anything**, the machine is **definitely still compromised**:
     stop and escalate. But a **clean** result proves nothing and must **never** be
     read as quiescence — a prompt-injected run can have spawned a
     **differently-named** helper (a `git`, a shell, an arbitrary binary) with no
     `wienerdog`/`claude`/`codex` in its name and no direct Wienerdog parent, which
     this grep (and any one-level `pgrep -P` / name-substring scan) will miss. So
     the grep is a non-authoritative hint only; **you still must reboot to be
     sure.**
   - **If you genuinely CANNOT reboot: STOP and escalate — do NOT certify clean.**
     There is no grep-based substitute for the reboot. Treat the machine as
     still-compromised (assume a stale-privilege child may still be running) and
     escalate — do **not** proceed to credential rotation on a still-running
     machine on the strength of a "nothing found" grep.

2. **Preserve the evidence — into a folder that is private AND excluded from
   sync/backup FIRST, then copy.** Order matters: create and secure the
   destination *before* any sensitive bytes land in it. **Treat every copy as
   potentially sensitive** — redaction is best-effort (a boundary-split or encoded
   secret can survive in a log; ADR-0024), so these are your incident timeline but
   are **not** guaranteed secret-free.
   - **Create the incident folder, make it private, and exclude it from cloud
     sync / backup — all BEFORE copying anything in.** Put it OUTSIDE
     the step-0 `<core>` and outside any synced/backed-up path (not under iCloud Drive
     / Dropbox / OneDrive / Google Drive):
     - macOS / Linux: `mkdir -m 700 ~/wienerdog-incident-<date>`, and add that
       folder to your backup exclusions *before* the copy (Time Machine: System
       Settings → Time Machine → Options → add the folder).
     - Windows (PowerShell): create the folder, then strip inherited access and
       grant only your account — `icacls <folder> /inheritance:r /grant:r
       "$($env:USERNAME):(OI)(CI)F"` — and exclude it from File History / OneDrive
       backup, all before copying.
   - **Copy the evidence in** — all read from the step-0 `<core>`: the
     **`<core>/config.yaml` `jobs:` snapshot** (the step-1 restore source),
     `<core>/state/run-evidence.jsonl`, `<core>/state/alerts.jsonl`, and the
     relevant `<core>/logs/<job>/` files; optionally `<core>/state/schedule.json`
     too (watermark evidence, not the restore source).
   - **Re-apply private modes recursively, then re-verify (blocking).** The copies
     leave Wienerdog's own `0700`/`0600` protection when they land elsewhere, so
     restore it over the **whole tree** — a plain `chmod 600 …/*` is wrong (it
     strips directory traversal and misses nested files):
     - macOS / Linux: `find ~/wienerdog-incident-<date> -type d -exec chmod 700
       {} +` then `find ~/wienerdog-incident-<date> -type f -exec chmod 600 {} +`;
       then re-verify nothing is looser — `find ~/wienerdog-incident-<date> \(
       -type d ! -perm 700 -o -type f ! -perm 600 \) -print` must print
       **nothing**. If it prints anything, STOP and fix it before continuing (do
       not run cleanup over unverified-private evidence).
     - Windows: confirm the `icacls` grant applied recursively (`(OI)(CI)`) and
       that no inherited ACE remains (`icacls <folder>` shows only your account).
   - *(Optional, your judgment.)* Record an integrity hash of each copied file
     (`shasum -a 256 …`) so you can later prove the timeline was not altered.
   - Do not run any cleanup step until this private, verified snapshot exists.

3. **Revoke, then rotate, the affected credentials — at the provider.** Point at
   `secret-incident.md` step 2 for the exact revoke-then-rotate discipline (a
   rotated-but-not-revoked key is still live). Cover the credentials Wienerdog
   holds: Google broker tokens (`<core>/secrets/google-token-*.json` — re-
   run the Google setup to re-mint) and any provider API key the machine used.
   For a suspected *machine* compromise, treat every credential the machine
   touched as exposed.

4. **Remove the compromised injected context — the digest AND the managed
   block.** This is the step that stops the poisoned identity/context from
   entering new sessions:
   - Delete `state/digest.md` (it is regenerated).
   - Fix the source: if an **identity note** (in the vault's identity folder, by
     default `06-Identity/`) was poisoned, correct it in the vault. Because digest
     injection is byte-gated by the identity trust registry (ADR-0021), a changed
     identity note will **not** be re-injected until you re-ratify it — run
     `wienerdog memory approve <note>` on the corrected note, where `<note>` is one
     of the **fixed short names** `profile` / `preferences` / `goals` /
     `instructions` (or its `.md` basename, e.g. `profile.md`). It is interactive
     and shows the exact bytes; it accepts **no** arbitrary file path (not a
     `06-Identity/…` path) and has no headless bypass — so only the bytes you just
     reviewed can ever be injected again.
   - Run `wienerdog sync` — it re-renders a clean `state/digest.md` and re-writes
     the CLAUDE.md / AGENTS.md **managed block** (the sentinel-delimited region
     Wienerdog owns) from the current, corrected identity. If you suspect the
     managed block itself was hand-tampered, note that `sync` overwrites only
     inside the sentinels and re-derives the block, so a clean sync restores it.
   - **Before you run `sync`, confirm step 1's catch-up removal is complete.**
     `wienerdog sync` also runs `reloadMissing`, which **re-registers any manifest
     `scheduler-entry` whose OS registration is missing but whose scheduler file
     survives** (`sync.js:197` → `status.reloadMissing`). So `sync` must **not be
     able to reactivate ANY schedule before step 7**: if step 1 left the catch-up
     file or its `install-manifest.json` entry in place, this `sync` will resurrect
     the catch-up job here — re-arming the machine before the acceptance drill.
     Do not run `sync` until step 1's dual re-verify (OS registration gone AND
     scheduler file gone AND no catch-up manifest entry) passed.
   - Also review `state/quarantine/` (cross-link `secret-incident.md` step 3 for
     the true-positive/false-positive handling).

5. **Clean the git history (vault).** Cross-link `secret-incident.md` step 4 for
   the concrete commands (`git commit --amend` / `git rebase -i` for a recent
   commit; `git filter-repo` or BFG for older/many). State the same safety note:
   the vault is local and not auto-pushed, so this rewrites only your machine's
   history; if you ever pushed a fork/remote, force-push there too and treat the
   credential/content as compromised regardless.

6. **Run the acceptance drill FIRST — prove the old digest/managed block is gone
   BEFORE you re-authorize.** The drill is the gate, not an afterthought: you do
   **not** re-add schedules until it passes. Because the SessionStart hook is
   deliberately **fail-open** (it prints nothing and exits `0` on a
   missing/unreadable digest, a missing `node`, or when `WIENERDOG_JOB` is set —
   so empty output is **NOT** proof of a clean digest), the drill must be run
   **fail-closed**: drive the installed hook with the right environment and treat
   any empty/malformed output as a FAILURE, then byte-compare what it *would*
   inject against the digest.
   - **Run the installed SessionStart hook directly, with the environment set so
     it actually injects.** The installed hook is the copy at
     **`<core>/bin/session-start.sh`** (`<core>` = the step-0 `$CORE`, not
     necessarily `~/.wienerdog`; the adapter installs it under the core — do **not**
     rely on `doctor` to print the path, it does not). Run it with `WIENERDOG_HOME`
     set to that same resolved core and `WIENERDOG_JOB` **cleared** (an inherited
     `WIENERDOG_JOB` makes the hook exit `0` with no output — a false "clean"):
     `WIENERDOG_JOB= WIENERDOG_HOME="$CORE" "$CORE/bin/session-start.sh"`
   - **Verify fail-closed.** Pipe that stdout through a tiny `node -e` that parses
     the JSON envelope and BLOCKS (drill FAILS — do not re-authorize) on any of:
     empty stdout, a JSON-parse failure, `hookSpecificOutput.hookEventName !==
     'SessionStart'`, or a non-string `additionalContext`. When it parses,
     **byte-compare** `additionalContext` to the bytes of `<core>/state/digest.md`
     (the step-0 core) — they
     must be **identical** (the hook injects exactly those bytes) — AND confirm a
     `grep -F` for the poisoned marker over `additionalContext` finds nothing. A
     marker match, a mismatch against the digest, or any block condition means
     STOP.
   - **Grep the regenerated `<core>/state/digest.md`** for the poisoned marker
     directly (belt-and-suspenders against the decoded bytes above).
   - **Check the managed block in every INSTALLED harness file with a THREE-CHECK
     conjunction — a clean `sync` (no notice) AND a WHOLE-FILE marker grep AND a
     single-sentinel-pair check — not `doctor`, and NOT a region-vs-raw-digest
     byte-compare (see the third check for why that would falsely fail).** `sync`
     runs only the **detected** harness's adapter, and a
     single-harness (Claude-only **or** Codex-only) install is supported and
     tested — so exactly one of `CLAUDE.md` / `AGENTS.md` may legitimately be
     **absent**. Run this check on **each file that a detected harness owns**: both
     `CLAUDE.md` **and** `AGENTS.md` when both harnesses are installed, or only the
     single present file on a single-harness install. (An installed harness's file
     being **missing** is a failure; an *un-installed* harness's absent file is
     not — do not let a legitimately absent file block re-authorization.) For each
     such file, all three of:
     - **Re-run `wienerdog sync` and read its output.** Any managed-block
       out-of-sync / adapter notice for an installed file means the drill **fails**
       (the block is not in a known-clean rendered state).
     - **`grep -F` the poisoned marker over the ENTIRE file — the whole `CLAUDE.md`
       / `AGENTS.md`, NOT only the region between the sentinels.** This is the
       load-bearing check. If an attacker deleted **both** sentinels and left the
       poisoned prose in place, `sync` finds no sentinel and **appends a fresh
       clean block at end-of-file**, leaving the old poisoned text **outside** the
       sentinels — and the harness reads the **whole file**, so it is **still
       injected**. A grep scoped to only the sentinel region would falsely pass.
       The marker must be found **nowhere** in the file. `sync` alone does **not**
       prove cleanup when the sentinels were missing.
     - **Confirm exactly one sentinel pair — no orphaned out-of-sentinel
       remnant.** Confirm the file contains exactly one `<!-- wienerdog:begin -->` …
       `<!-- wienerdog:end -->` pair. A **duplicated** pair is a failure. A
       **missing** pair is also a failure — and specifically means `sync` appended
       a new block while your pre-existing (possibly poisoned) content sits
       orphaned **outside** it: you must **manually remove or quarantine that
       orphaned content**, re-run `sync`, and re-run this drill.
     - **Do NOT byte-compare the sentinel region against the raw
       `state/digest.md`.** `sync` writes the managed block as a *transform* of the
       digest — it trims trailing newlines and neutralizes any full-line sentinel in
       the digest — so the region is **never byte-identical** to the raw digest, and
       such a compare would **falsely fail on a clean install** and wrongly block
       re-authorization. Do not reproduce that transform by hand. The three checks
       above already prove the block is clean **by construction**: the whole-file
       marker grep proves the poison is nowhere in the file; the single-pair check
       proves no poisoned remnant sits orphaned outside the block; and a clean
       `sync` with no notice proves the block is exactly what `sync` renders from
       the current, clean digest. If the digest source is clean and `sync`
       succeeded with no warning/notice, the block is clean by construction — the
       raw-digest byte-equality would add no security property, only false failures.
     (`doctor` does **not** verify managed-block / sentinel integrity — do not
     treat a clean `doctor` as proof here.)
   - *(Optional extra sanity check, NOT the proof.)* You may also start a **new**
     Claude Code / Codex session and confirm it does not surface the poisoned
     fact — but this observation is a nicety, not the acceptance: the byte-level
     checks above are the proof (the injection is byte-gated, ADR-0021).
   Record the drill result (all checks above, clean). A9's acceptance is met only
   when the drill passes and is recorded — that recorded pass is the precondition
   for step 7.

7. **Re-authorize — only after a successful, recorded drill (step 6) and steps
   1–5.** Re-add each **builtin** schedule you removed by **reconstructing its
   exact command from the `config.yaml` `jobs:` snapshot** you took in step 1: for
   every job whose snapshot `run:` value is `builtin:<name>` (today that is
   `builtin:dream`) run `wienerdog schedule add <name> --at <HH:MM> --job <builtin>
   --timeout <minutes>` — `at` / `timeout_minutes` supply the other two flags. (The
   routine menu `/wienerdog-routines` is fine for the standard nightly dream.)
   - **A `skill:*` (external-content) routine CANNOT be re-added in this release —
     do NOT run `wienerdog schedule add … --skill …` for it.** Skill-based routines
     are frozen at the source by the A0 pre-use capability gate (audit A1):
     `schedule add … --skill <name>` **fails closed** on a normal install with no
     flag or environment override, so that command is simply rejected — this
     runbook will not promise a command that cannot work. Instead, **preserve the
     job's definition** (it is already in your step-1 `config.yaml` `jobs:`
     snapshot — keep that snapshot) and re-add the routine **later**, once the
     external-content-routine capability gate opens (tracked under audit A1). Do
     not attempt the failing re-add now.
   Then run `wienerdog doctor` and confirm nothing is flagged (permissions,
   scheduler load). Schedules come back **only** after the acceptance drill has
   passed and been recorded — never before.

Keep every command exact and every claim traceable to a shipped mechanism (do
not describe a "remove managed block" command — there is none; the mechanism is
fix-source → `memory approve` → `sync`). No jargon without a one-clause gloss.

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

- [ ] **[R7-1]** The runbook opens with a **step 0 preamble** (before step 1) that
      resolves the ONE authoritative **core** = `$WIENERDOG_HOME` if set else the
      platform default, gives both the POSIX (`${WIENERDOG_HOME:-$HOME/.wienerdog}`)
      and Windows (`$env:WIENERDOG_HOME` else `$env:USERPROFILE\.wienerdog`)
      resolution, DISPLAYS the resolved core, and has the user CONFIRM it holds the
      real install (`config.yaml`, `state/`, `install-manifest.json`). Every later
      path in the runbook — the catch-up scheduler XML, `install-manifest.json`, the
      evidence copy, `state/digest.md`, the SessionStart hook, and every
      verification — references that same resolved `<core>` (`$CORE` / `$core`),
      **never** a hardcoded `~/.wienerdog` / `$env:USERPROFILE\.wienerdog`; the one
      documented exception is the macOS catch-up LaunchAgent plist
      (`~/Library/LaunchAgents/ai.wienerdog.catchup.plist`, always home-based).
- [ ] `docs/runbooks/incident.md` exists in the house numbered-checklist format
      and covers, **in order**: (1) snapshot the **`config.yaml` `jobs:`
      definitions** before removal (the restore source — `state/schedule.json`
      holds only watermarks, not job definitions), remove every per-job schedule
      **and** the shared catch-up entry (deleting the catch-up scheduler FILE
      **and** its `install-manifest.json` entry, not merely unregistering, so
      `sync`'s `reloadMissing` cannot resurrect it), then reach proven quiescence
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
      dual re-verify that BOTH the OS registration AND the scheduler file are gone
      (plus no catch-up manifest entry)** so `sync`'s `reloadMissing` cannot
      resurrect it; it makes **reboot** the **sole authoritative** quiescence proof
      and states plainly that a pre-reboot live-process grep is **NOT proof** (it
      can only *reveal* a still-live job — a differently-named injected helper
      escapes it — never *certify* a clean one); credential rotation begins **only
      after a reboot**, and a user who cannot reboot **stops and escalates** rather
      than grep-certifying clean.
- [ ] **[R5-1]** The purge step (step 4) warns that `wienerdog sync` runs
      `reloadMissing`, which re-registers any manifest `scheduler-entry` whose OS
      registration is missing but whose scheduler file survives; it states plainly
      that `sync` must **not** be able to reactivate ANY schedule before step 7, so
      the step-1 catch-up removal (file **and** manifest entry) must be complete and
      dual-verified before any `sync`.
- [ ] The evidence-preservation step snapshots the **`config.yaml` `jobs:`
      definitions** (the restore source) **before** removal — optionally also
      `state/schedule.json` as watermark evidence — and names
      `state/run-evidence.jsonl`, `state/alerts.jsonl`, and
      `logs/<job>/`; treats them as **potentially sensitive** (best-effort
      redaction, not secret-free); creates+verifies a private, sync/backup-excluded
      folder **before** copying; and re-applies modes **recursively** (every dir
      `0700`, every file `0600`) with a blocking re-verify (macOS/Linux `find`
      forms; Windows `icacls`).
- [ ] The acceptance-drill step is **fail-closed**: it runs the installed
      **`<core>/bin/session-start.sh`** with `WIENERDOG_HOME` set and
      `WIENERDOG_JOB` cleared, BLOCKS on empty stdout / JSON-parse failure / wrong
      `hookEventName` / non-string `additionalContext`, byte-compares
      `additionalContext` to `state/digest.md`, greps the regenerated digest, and
      checks the managed block of **every installed harness file** (both `CLAUDE.md`
      and `AGENTS.md` when both harnesses are installed, only the single present
      file on a single-harness install) via `sync`'s notice **plus** an explicit
      check that (a) `grep -F`s the poisoned marker over the **ENTIRE** file (not
      only the sentinel region — a both-sentinels-deleted attack leaves poisoned
      text that `sync` appends around, still injected), and (b) confirms exactly
      one sentinel pair (no orphaned out-of-sentinel remnant), treating a **missing**
      pair as "`sync` appended a fresh block and the old content is orphaned outside
      it — manually remove/quarantine it" (**not** `doctor`); it does **NOT**
      byte-compare the sentinel region against the raw `state/digest.md` (`sync`'s
      trim+neutralize transform means the region never equals the raw digest, so
      that compare would falsely fail on a clean install — the three checks prove the
      block clean by construction). The new-session
      observation is an optional extra, not the proof; the proof is tied to the
      ADR-0021 byte-gated injection.
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
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
test -f docs/runbooks/incident.md && echo "runbook present — OK"
grep -n "incident.md" docs/runbooks/secret-incident.md && echo "cross-link present — OK"
# R7-1: a step-0 preamble resolves the ONE authoritative core (WIENERDOG_HOME else
# default) with both POSIX and Windows resolution, displays+confirms it, and every
# later path uses <core> rather than a hardcoded ~/.wienerdog:
grep -nE "WIENERDOG_HOME:-\\\$HOME/\.wienerdog|env:WIENERDOG_HOME|step 0|resolve.*core|<core>" docs/runbooks/incident.md
# each required mechanism is referenced (config.yaml jobs: is the restore source):
grep -nE "schedule (list|remove)|config\.yaml|jobs:|run-evidence\.jsonl|memory approve|wienerdog sync|managed block" docs/runbooks/incident.md
# the restore snapshot is config.yaml jobs:, and schedule.json is only watermark evidence:
grep -nE "config\.yaml.*jobs:|jobs:.*definition|watermark" docs/runbooks/incident.md
# the catch-up removal + reboot-as-SOLE-proof + the grep-is-not-proof / escalate wording:
grep -nE "ai\.wienerdog\.catchup|\\\\Wienerdog\\\\catchup|reboot|CommandLine|claude\|codex" docs/runbooks/incident.md
# R5-1: catch-up removal deletes the scheduler FILE + install-manifest.json entry
# (not just unregister), and sync's reloadMissing cannot resurrect a surviving entry:
grep -nE "install-manifest\.json|reloadMissing|resurrect|re-register|scheduler file|catchup\.plist|wienerdog-catchup\.xml" docs/runbooks/incident.md
grep -niE "not proof|non-proof|cannot reboot|escalate|sole" docs/runbooks/incident.md
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
