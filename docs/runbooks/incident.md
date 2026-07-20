# Runbook: general incident drill (machine, credential, or injected-context compromise)

Use this runbook when you suspect the **machine**, a **credential**, or your
**injected identity/context** has been compromised — a poisoned identity note, a
tampered managed block, or a machine you no longer trust. A leaked credential
that reached the vault is one specific case of this — see
[`secret-incident.md`](secret-incident.md) for that narrower checklist; start
here for anything broader.

A few words this runbook uses precisely: **revoke** means telling a provider "this
credential no longer works, starting now"; **rotate** means issuing a brand-new
credential to replace it; the **managed block** is the sentinel-delimited region
Wienerdog owns inside `CLAUDE.md`/`AGENTS.md`; **git history** means every past
commit in the vault's local git repository, not just the current files.

Work through the steps **in order**. They are ordered so nothing keeps
reading, committing, or re-injecting the compromised state while you clean up,
and so the machine is **proven clean before it is re-authorized** — you do not
re-add schedules until the step-6 drill has passed.

## Step 0 — resolve the one authoritative core, first

Wienerdog's files do **not** always live in `~/.wienerdog`. Every later step in
this runbook names a path under "the core" — Wienerdog's install directory —
and every one of those paths must use the SAME resolved core. Getting this
wrong on a custom-`WIENERDOG_HOME` or `HOME`-set install means you would
unregister the wrong machine's schedule while the real install's `config.yaml`
still lists every job: every check would appear to pass, and a later
`wienerdog sync` (which heals schedules from `config.yaml`) would then re-arm
the catch-up entry before the drill. See **Table A**.

1. **Read the core from `wienerdog doctor`** — the code-authoritative source:
   - macOS / Linux:
     ```
     CORE="$(wienerdog doctor 2>/dev/null | sed -n 's/.*core directory exists (\(.*\)).*/\1/p')"; echo "$CORE"
     ```
   - Windows (PowerShell):
     ```
     $core = (wienerdog doctor 2>$null | Select-String 'core directory exists \((.*)\)').Matches.Groups[1].Value; $core
     ```
2. **Cross-check** that value against the Table A resolution order —
   `WIENERDOG_HOME`, else `HOME`, else the platform account home directory, then
   `.wienerdog` (never jump straight to `USERPROFILE`/`~` when `HOME` is set):
   - macOS / Linux: `echo "${WIENERDOG_HOME:-${HOME:-$HOME}/.wienerdog}"`
   - Windows (PowerShell):
     ```
     if ($env:WIENERDOG_HOME) { $env:WIENERDOG_HOME } elseif ($env:HOME) { "$env:HOME\.wienerdog" } else { "$env:USERPROFILE\.wienerdog" }
     ```
   If `doctor` and the cross-check disagree, **STOP and reconcile** — your
   interactive shell's environment differs from the install's.
3. **Display it and confirm it holds the real install** — it must contain
   `config.yaml`, `state/`, and `install-manifest.json` (Table A):
   - macOS / Linux: `ls "$CORE/config.yaml" "$CORE/state" "$CORE/install-manifest.json"`
   - Windows (PowerShell): `Test-Path "$core\config.yaml"`, `Test-Path "$core\state"`,
     `Test-Path "$core\install-manifest.json"` — all must return `True`.
4. **Persist it durably now — it must survive the step-1 reboot.** Your `$CORE`/
   `$core` shell variable and a one-shot `WIENERDOG_HOME` export do **not**
   survive a reboot, yet every post-reboot command in this runbook must run
   against this same core. Record it outside the core (Table A) and note it
   off-machine too (paper / phone):
   - macOS / Linux: `echo "$CORE" > "$HOME/wienerdog-incident-<date>-CORE-PATH.txt"`
   - Windows (PowerShell): `$core | Out-File "$env:USERPROFILE\wienerdog-incident-<date>-CORE-PATH.txt"`

From here on, `<core>` (POSIX `$CORE`, Windows `$core`) always means THIS
resolved directory — never a hardcoded `~/.wienerdog` / `$env:USERPROFILE\.wienerdog`,
and never a bare relative `state/…`. The one path that is **not** under the core is
the macOS catch-up LaunchAgent plist (Table A, "Outside the core").

## Contract-reference tables

The rest of this runbook refers back to these five tables instead of restating
paths, labels, or commands inline.

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

## The ordered steps

### 1. Stop everything that can fire, then reach proven quiescence

- **Create the private evidence folder FIRST — before anything is removed.**
  The snapshot below needs a safe destination that exists BEFORE `schedule
  remove` mutates the source, so the incident evidence folder is created,
  permissioned, and backup-excluded now, at the start of step 1 (step 2 then
  copies the remaining evidence into the same folder). Put it at the Table A
  evidence-folder path (`~/wienerdog-incident-<date>/`, outside the core) and
  outside any synced/backed-up path (not under iCloud Drive / Dropbox /
  OneDrive / Google Drive):
  - macOS / Linux: `mkdir -m 700 ~/wienerdog-incident-<date>`, and add that
    folder to your backup exclusions *before* anything is copied in (Time
    Machine: System Settings → Time Machine → Options → add the folder).
  - Windows (PowerShell): create the folder, then strip inherited access and
    grant only your account —
    `icacls <folder> /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F"` —
    and exclude it from File History / OneDrive backup, all before copying.
- **Snapshot the job DEFINITIONS next (Table A / Table C restore source).**
  Copy the `config.yaml` `jobs:` section (`$CORE/config.yaml`) into that
  folder NOW — **every** job, including each `run: skill:<name>` routine (its
  only record for later, Table C). `schedule remove` mutates `config.yaml` and
  `schedule list` omits `timeout_minutes`, so this snapshot — **not**
  `$CORE/state/schedule.json` (watermark-only, Table A/C) — is what step 7
  restores from. You MAY also copy `$CORE/state/schedule.json` as watermark
  evidence. Handle both with the step-2 private-folder discipline.
- **Unregister every per-job schedule (Table B).** Run `wienerdog schedule
  list`, then `wienerdog schedule remove <name>` for every job. `remove` only
  stops **future** fires (best-effort OS unregister) and does **not** stop a
  job running **right now** (proven separately below); you re-add jobs in
  step 7.
- **Remove the shared catch-up entry (Table B).** Removing the final job
  tears catch-up down only best-effort, so remove it by hand using the Table B
  "Stop-the-catch-up" commands for your platform: unregister + delete its
  scheduler FILE + drop its `install-manifest.json` entry. **Unregister-only
  is NOT enough** — Table B's resurrection rule means the next `wienerdog
  sync` (step 4, and again in the step-6 drill) regenerates + re-registers
  the catch-up entry from `config.yaml` whenever any job remains listed
  there. When editing `install-manifest.json`, delete **only** the catch-up
  `scheduler-entry` (the object whose `unload` argv names
  `ai.wienerdog.catchup` / `\Wienerdog\catchup`), no unrelated entries.
  **Linux: nothing to do.** Do not proceed until the Table B **blocking
  re-verify** passes — all FIVE checks: OS registration gone AND scheduler
  file gone AND no catch-up manifest entry AND `config.yaml` lists zero
  `jobs:` entries AND the Table B **independent per-platform enumeration** of
  Wienerdog OS registrations (launchd labels / systemd units / `\Wienerdog\`
  tasks) returns **nothing** — the per-job unregister is best-effort, so a
  failed one leaves an armed registration the config/manifest checks cannot
  see. A surviving `jobs:` entry or a surviving OS registration means the
  machine can still fire — STOP and fix it.
- **Reach proven quiescence — the ONLY authoritative path is to REBOOT.** With
  every per-job schedule and the catch-up entry removed, reboot the machine.
  After the reboot nothing can have re-fired, so **zero** Wienerdog processes
  run — platform-independently, with no process forensics needed.
  **Credential rotation (step 3) begins only after this reboot.** A reboot is
  the **sole** proof of quiescence this runbook accepts.
- **After the reboot: re-read the persisted record, re-export the core, THEN
  re-confirm via `doctor` — in that order, before ANY further command.** The
  reboot wiped your `$CORE`/`$core` shell variable and any one-shot
  `WIENERDOG_HOME` export, so a fresh shell would silently re-default the
  core — re-introducing the wrong-directory risk step 0 guards against. The
  order matters: `doctor` reports the core from the CURRENT environment, so
  running it before the re-export would report the DEFAULT core on a
  custom-core install and the equality check would fail with no way forward.
  In the new post-reboot session, before running anything else:
  1. **Read the persisted record** (`wienerdog-incident-<date>-CORE-PATH.txt`,
     Table A) and validate it: an absolute path to an existing directory that
     holds the `config.yaml` / `state/` / `install-manifest.json` triple
     (Table A, as checked in step 0). If not → STOP and reconcile.
     - macOS / Linux: `CORE="$(cat "$HOME/wienerdog-incident-<date>-CORE-PATH.txt")"; ls "$CORE/config.yaml" "$CORE/state" "$CORE/install-manifest.json"`
     - Windows (PowerShell): `$core = (Get-Content "$env:USERPROFILE\wienerdog-incident-<date>-CORE-PATH.txt").Trim()`,
       then the three `Test-Path` checks from step 0.
  2. **Re-export it for the whole session:** macOS / Linux `export
     WIENERDOG_HOME="$CORE"`; Windows (PowerShell) `$env:WIENERDOG_HOME =
     "$core"`.
  3. **THEN run `wienerdog doctor`** and require its `core directory exists
     (<path>)` line to EQUAL the persisted value. A mismatch means your
     session is not acting on the confirmed core — STOP and reconcile.

  From here on, **every** post-reboot Wienerdog command — `wienerdog sync`,
  `wienerdog memory approve`, `wienerdog schedule add`, `wienerdog doctor`,
  and the drill hook run in step 6 — MUST run with `WIENERDOG_HOME` set to
  this `$CORE` (the export above does that for the session), so none can act
  on a re-defaulted core.
- **A live-process grep is NOT proof — it can only catch a live job, never
  certify a clean one.** You MAY grep *before* rebooting — macOS / Linux
  `pgrep -fl 'wienerdog|claude|codex'`, or Windows (PowerShell)
  `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match
  'wienerdog|claude|codex' }`. If it finds **anything**, the machine is
  **definitely still compromised** — stop and escalate. But a **clean**
  result proves nothing and must **never** be read as quiescence — a
  prompt-injected run can have spawned a **differently-named** helper (a
  `git`, a shell, an arbitrary binary) with no `wienerdog`/`claude`/`codex` in
  its name and no direct Wienerdog parent, which this grep (and any
  one-level `pgrep -P` / name-substring scan) will miss. The grep is a
  non-authoritative hint only; **you still must reboot.**
- **If you genuinely CANNOT reboot: STOP and escalate — do NOT certify
  clean.** There is no grep-based substitute for the reboot. Treat the
  machine as still-compromised (assume a stale-privilege child may still be
  running) and escalate — do **not** proceed to credential rotation on the
  strength of a "nothing found" grep.

### 2. Preserve the evidence

The private, sync/backup-excluded folder was created, permissioned, and
backup-excluded at the START of step 1 (so the `jobs:` snapshot had a safe
destination); re-check it is still private and still outside every synced path
before copying more into it. **Treat every copy as potentially sensitive** —
redaction is best-effort (a boundary-split or encoded secret can survive in a
log), so this is your incident timeline but is **not** guaranteed secret-free.

- **Copy the evidence in** — all Table A paths: the `$CORE/config.yaml`
  `jobs:` snapshot (already there from step 1), `$CORE/state/run-evidence.jsonl`,
  `$CORE/state/alerts.jsonl`, and the relevant `$CORE/logs/<job>/` files;
  optionally `$CORE/state/schedule.json` too (watermark evidence, not the
  restore source). Also move the step-0
  `wienerdog-incident-<date>-CORE-PATH.txt` record into this folder so the
  confirmed core path is filed alongside the timeline — do this only AFTER
  the step-1 post-reboot re-resolve has used it.
- **Re-apply private modes recursively, then re-verify (blocking).** The
  copies leave Wienerdog's own `0700`/`0600` protection when they land
  elsewhere, so restore it over the **whole tree** — a plain `chmod 600 …/*`
  is wrong (it strips directory traversal and misses nested files):
  - macOS / Linux:
    `find ~/wienerdog-incident-<date> -type d -exec chmod 700 {} +` then
    `find ~/wienerdog-incident-<date> -type f -exec chmod 600 {} +`; then
    re-verify nothing is looser —
    `find ~/wienerdog-incident-<date> \( -type d ! -perm 700 -o -type f ! -perm 600 \) -print`
    must print **nothing**. If it prints anything, STOP and fix it before
    continuing (do not run cleanup over unverified-private evidence).
  - Windows: confirm the `icacls` grant applied recursively (`(OI)(CI)`) and
    that no inherited ACE remains (`icacls <folder>` shows only your
    account).
- *(Optional, your judgment.)* Record an integrity hash of each copied file
  (`shasum -a 256 …`) so you can later prove the timeline was not altered.
- Do not run any cleanup step until this private, verified snapshot exists.

### 3. Revoke, then rotate, the affected credentials — at the provider

See [`secret-incident.md`](secret-incident.md) step 2 for the exact
revoke-then-rotate discipline (a rotated-but-not-revoked key is still live).
Cover the credentials Wienerdog holds: Google broker tokens
(`$CORE/secrets/google-token-*.json`, Table A — re-run the Google setup to
re-mint) and any provider API key the machine used. For a suspected *machine*
compromise, treat every credential the machine touched as exposed.

### 4. Remove the compromised injected context — digest AND managed block

This stops the poisoned identity/context from entering new sessions:

- Delete `$CORE/state/digest.md` (Windows `$core\state\digest.md`; Table A) —
  it is regenerated. Use the explicit resolved path, never a bare relative
  `state/…` (that resolves against your CWD and could delete the wrong file
  while the real compromised one survives).
- **Fix the source, then re-ratify.** If an **identity note** (vault identity
  folder, default `06-Identity/`) was poisoned, correct it in the vault.
  Digest injection is byte-gated by the identity trust registry, so the
  changed note is **not** re-injected until you re-ratify it: run `wienerdog
  memory approve <note>` on the corrected note with a **Table E** short name
  (never a file path) — only the bytes you just reviewed can ever be injected
  again.
- **Before you run `sync`, confirm step 1's stop is complete (Table B
  resurrection rule).** `wienerdog sync` heals schedules from `config.yaml`
  (`reloadMissing` + `repairCatchup`); if step 1 left ANY job in the `jobs:`
  list, this `sync` will re-register that job's schedule AND regenerate +
  re-register the catch-up entry here — re-arming the machine before the
  drill. `sync` must **not** be able to reactivate ANY schedule before
  step 7: do not run it until step 1's Table B blocking re-verify (all five
  checks, including the zero-`jobs:` check and the independent OS-registration
  enumeration) passed.
- Run `wienerdog sync` — it re-renders a clean `$CORE/state/digest.md` and
  re-writes the CLAUDE.md / AGENTS.md **managed block** (the
  sentinel-delimited region Wienerdog owns) from the current, corrected
  identity. When the file holds exactly one valid sentinel pair, `sync`
  replaces only the content between the sentinels — so a block whose TEXT was
  tampered is restored. But when BOTH sentinel markers were deleted, `sync`
  cannot find the block and **APPENDS a fresh one — the poisoned text survives
  elsewhere in the file** (Table D's whole-file grep exists for exactly this
  case): locate and remove/quarantine the orphaned text by hand, re-run
  `sync`, and re-run the step-6 drill. (One sentinel missing, or duplicated
  sentinels, makes `sync` refuse with a "managed block not updated" message —
  resolve the markers by hand, then re-run `sync`.)
- Also review `$CORE/state/quarantine/` (Windows `$core\state\quarantine\`;
  Table A; see [`secret-incident.md`](secret-incident.md) step 3 for the
  true-positive/false-positive handling) — again the explicit resolved path,
  never a bare relative `state/…`.

### 5. Clean the git history (vault)

See [`secret-incident.md`](secret-incident.md) step 4 for the concrete
commands (`git commit --amend` / `git rebase -i` for a recent commit; `git
filter-repo` or BFG for older/many). Same safety note applies: the vault is
local and not auto-pushed, so this rewrites only your machine's history; if
you ever pushed a fork/remote, force-push there too and treat the
credential/content as compromised regardless.

### 6. Run the acceptance drill — prove the old digest/managed block is gone

**This is the gate, not an afterthought.** You do **not** re-authorize
(step 7) until every check below passes. Because the SessionStart hook is
deliberately **fail-open** (it prints nothing and exits `0` on a
missing/unreadable digest, a missing `node`, or when `WIENERDOG_JOB` is set —
so empty output is **NOT** proof of a clean digest), run it **fail-closed**:
drive the installed hook with the right environment and treat any
empty/malformed output as a FAILURE, then byte-compare what it *would* inject
against the digest.

The two blocks below run the whole drill and stop at the first failure — a
"DRILL PASS" line at the end is a real pass. Each check maps to a bullet
explained after the blocks. Before running, set the two operator inputs at the
top of the block:

- `MARKER` / `$marker` — the exact poisoned text you are hunting (plain text,
  not a regular expression).
- `HARNESSES` / `$Harnesses` — a **cross-check** declaration of every harness
  Wienerdog was installed into (`claude`, `codex`, or both). It is NOT what
  drives coverage — the drill runs `sync` first and then checks **every**
  `managed-block` file the **post-sync** `$CORE/install-manifest.json` lists,
  whatever you typed (see the coverage bullet after the blocks) — but the drill
  FAILS if your declared set does not match that post-sync manifest set, so a
  mis-declaration is surfaced. A duplicate name is rejected outright. You cannot
  under-declare to dodge a harness: `sync` re-records a missing managed-block
  entry, so the omitted harness reappears in the driving set and is checked
  anyway.

The block also **pins the harness-detection environment**: it unsets
`CLAUDE_CONFIG_DIR` and `CODEX_HOME` before `sync` and the file checks, so
`sync`'s adapter detection and manifest write use the real default
directories — an ambient redirect of either variable would otherwise make
your real `CLAUDE.md`/`AGENTS.md` invisible. If (and only if) you INSTALLED
Wienerdog into a custom Claude/Codex directory, edit the block to set the
matching variable to that directory instead of unsetting it — `sync` then
records the manifest with those custom paths, and the post-sync
manifest-driven checks follow them.

Run in a session where the step-1 re-export already set `WIENERDOG_HOME`.

macOS / Linux (bash — paste as one block):

```bash
HARNESSES='claude codex'   # DECLARE every installed harness: 'claude', 'codex', or 'claude codex'
MARKER='<the exact poisoned text you are hunting>'
CORE="$WIENERDOG_HOME"     # the step-0 core, re-exported after the reboot

fail() { printf 'DRILL FAIL: %s\n' "$1"; exit 1; }

# pin the harness-detection env BEFORE sync and the file checks (see prose above);
# set the matching variable here instead ONLY for a custom-dir install
unset CLAUDE_CONFIG_DIR CODEX_HOME
case "$HARNESSES" in *[a-z]*) ;; *) fail "HARNESSES is empty — declare every installed harness";; esac

# resolve the DECLARED harness files (reject duplicates); this is the operator
# CROSS-CHECK — the post-sync manifest (below) is the authoritative driver
seen=' '; declared_files=""
for h in $HARNESSES; do
  case "$seen" in *" $h "*) fail "harness '$h' declared more than once";; esac
  seen="$seen$h "
  case "$h" in
    claude) declared_files="$declared_files${CLAUDE_CONFIG_DIR:-$HOME/.claude}/CLAUDE.md
" ;;
    codex)  declared_files="$declared_files${CODEX_HOME:-$HOME/.codex}/AGENTS.md
" ;;
    *) fail "unknown harness '$h' (declare: claude codex)" ;;
  esac
done

# (a) drive the installed hook fail-closed; byte-compare against the digest
OUT="$(WIENERDOG_JOB= WIENERDOG_HOME="$CORE" "$CORE/bin/session-start.sh")" \
  || fail "hook exited non-zero"
[ -n "$OUT" ] || fail "hook printed nothing (fail-open output is NOT proof of clean)"
printf '%s' "$OUT" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => {
    let j; try { j = JSON.parse(s); } catch { console.error("malformed JSON"); process.exit(1); }
    const h = (j && j.hookSpecificOutput) || {};
    if (h.hookEventName !== "SessionStart") { console.error("wrong hookEventName"); process.exit(1); }
    if (typeof h.additionalContext !== "string") { console.error("additionalContext is not a string"); process.exit(1); }
    const digest = require("fs").readFileSync(process.argv[1], "utf8");
    if (h.additionalContext !== digest) { console.error("injected bytes differ from the digest"); process.exit(1); }
    if (h.additionalContext.includes(process.argv[2])) { console.error("poisoned marker is still injected"); process.exit(1); }
  });' "$CORE/state/digest.md" "$MARKER" || fail "hook envelope check"

# regenerated digest, checked directly (belt-and-suspenders)
grep -qF -- "$MARKER" "$CORE/state/digest.md" && fail "marker still in the digest"

# (b) run sync FIRST — idempotent; it REPAIRS the managed blocks AND re-records any
# managed-block manifest entry a prior interrupted sync (or tampering) dropped
SYNC_OUT="$(WIENERDOG_HOME="$CORE" wienerdog sync 2>&1)" \
  || { printf '%s\n' "$SYNC_OUT"; fail "sync exited non-zero"; }
printf '%s\n' "$SYNC_OUT" | grep -qiE 'managed block not updated|digest not found|AGENTS\.override' \
  && { printf '%s\n' "$SYNC_OUT"; fail "sync reported a Table D BLOCK signal"; }

# (c) the POST-SYNC manifest is the AUTHORITATIVE must-check set: sync just re-recorded
# every managed-block file it owns, so a harness whose entry was missing is now listed
# and cannot be skipped by under-declaring. Read the managed-block PATHS post-sync.
echo "post-sync manifest managed-block files:"
manifest_files="$(node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const e of m.entries || []) if (e.kind === "managed-block") console.log(e.path);
' "$CORE/install-manifest.json")" || fail "could not read $CORE/install-manifest.json"
manifest_files="$(printf '%s\n' "$manifest_files" | sed '/^$/d' | sort -u)"
[ -n "$manifest_files" ] || fail "post-sync manifest has no managed-block entries — nothing to prove"
printf '%s\n' "$manifest_files" | sed 's/^/  /'

# check EVERY post-sync managed-block file (the DRIVER — runs regardless of the
# declaration, so a repaired-but-undeclared harness is still checked)
checked_files=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in
    */CLAUDE.md) skip='Claude Code (not detected|config is no longer present); skipping adapter' ;;
    */AGENTS.md) skip='Codex CLI (not detected|config is no longer present); skipping adapter' ;;
    *) fail "unexpected managed-block file in the manifest: $f" ;;
  esac
  printf '%s\n' "$SYNC_OUT" | grep -qE "$skip" \
    && { printf '%s\n' "$SYNC_OUT"; fail "sync skipped the adapter for managed-block file $f"; }
  [ -f "$f" ] || fail "managed-block file missing on disk: $f"
  grep -qF -- "$MARKER" "$f" && fail "marker found in $f (whole-file grep)"
  b=$(grep -cF -- '<!-- wienerdog:begin -->' "$f")
  e=$(grep -cF -- '<!-- wienerdog:end -->' "$f")
  { [ "$b" -eq 1 ] && [ "$e" -eq 1 ]; } || fail "$f has $b begin / $e end sentinels (need exactly one pair)"
  checked_files="$checked_files$f
"
done <<EOF
$manifest_files
EOF

# (d) operator cross-check: the DECLARED set must equal the post-sync manifest set
# (catches a mis-declaration — the manifest already drove the checks above regardless)
declared_sorted="$(printf '%s\n' "$declared_files" | sed '/^$/d' | sort -u)"
if [ "$declared_sorted" != "$manifest_files" ]; then
  echo "declared:"; printf '%s\n' "$declared_sorted" | sed 's/^/  /'
  echo "post-sync manifest:"; printf '%s\n' "$manifest_files" | sed 's/^/  /'
  fail "declared harness set does not match the post-sync manifest managed-block set"
fi
# net gate: the set of files actually checked equals the manifest driver set (>=1)
checked_sorted="$(printf '%s\n' "$checked_files" | sed '/^$/d' | sort -u)"
[ "$checked_sorted" = "$manifest_files" ] || fail "coverage gate: checked set != post-sync manifest set"
count=$(printf '%s\n' "$manifest_files" | grep -c .)
echo "DRILL PASS — $count managed-block file(s) checked (manifest-driven); record this output with the date"
```

Windows (PowerShell — paste as one block; the hook is a bash script, and
Git Bash ships with Git for Windows, which Claude Code requires):

```powershell
$Harnesses = @('claude','codex')   # DECLARE every installed harness: 'claude', 'codex', or both
$marker = '<the exact poisoned text you are hunting>'
$core   = $env:WIENERDOG_HOME      # the step-0 core, re-exported after the reboot

function Fail($msg) { Write-Host "DRILL FAIL: $msg"; exit 1 }

# pin the harness-detection env BEFORE sync and the file checks (see prose above);
# set the matching variable here instead ONLY for a custom-dir install
Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue
if (-not $Harnesses -or $Harnesses.Count -eq 0) { Fail "Harnesses list is empty - declare every installed harness" }

# resolve the DECLARED harness files (reject duplicates); this is the operator
# CROSS-CHECK - the post-sync manifest (below) is the authoritative driver
$homeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }  # HOME before USERPROFILE, matching the code
$seen = @(); $declaredFiles = @()
foreach ($h in $Harnesses) {
  if ($seen -contains $h) { Fail "harness '$h' declared more than once" }
  $seen += $h
  switch ($h) {
    'claude' { $declaredFiles += if ($env:CLAUDE_CONFIG_DIR) { "$($env:CLAUDE_CONFIG_DIR)\CLAUDE.md" } else { "$homeDir\.claude\CLAUDE.md" } }
    'codex'  { $declaredFiles += if ($env:CODEX_HOME) { "$($env:CODEX_HOME)\AGENTS.md" } else { "$homeDir\.codex\AGENTS.md" } }
    default  { Fail "unknown harness '$h' (declare: claude, codex)" }
  }
}

# (a) drive the installed hook fail-closed; byte-compare against the digest
# (positional argument passing - the path is NEVER interpolated into the bash source)
$coreFwd = $core -replace '\\', '/'
$out = bash -c 'WIENERDOG_JOB= WIENERDOG_HOME="$1" "$1/bin/session-start.sh"' _ "$coreFwd"
if ($LASTEXITCODE -ne 0) { Fail "hook exited non-zero" }
if ([string]::IsNullOrEmpty($out)) { Fail "hook printed nothing (fail-open output is NOT proof of clean)" }
$out | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => {
    let j; try { j = JSON.parse(s); } catch { console.error("malformed JSON"); process.exit(1); }
    const h = (j && j.hookSpecificOutput) || {};
    if (h.hookEventName !== "SessionStart") { console.error("wrong hookEventName"); process.exit(1); }
    if (typeof h.additionalContext !== "string") { console.error("additionalContext is not a string"); process.exit(1); }
    const digest = require("fs").readFileSync(process.argv[1], "utf8");
    if (h.additionalContext !== digest) { console.error("injected bytes differ from the digest"); process.exit(1); }
    if (h.additionalContext.includes(process.argv[2])) { console.error("poisoned marker is still injected"); process.exit(1); }
  });' "$core\state\digest.md" $marker
if ($LASTEXITCODE -ne 0) { Fail "hook envelope check" }

# regenerated digest, checked directly (belt-and-suspenders)
if (Select-String -Path "$core\state\digest.md" -SimpleMatch $marker -Quiet) { Fail "marker still in the digest" }

# (b) run sync FIRST - idempotent; it REPAIRS the managed blocks AND re-records any
# managed-block manifest entry a prior interrupted sync (or tampering) dropped
$sync = wienerdog sync 2>&1
if ($LASTEXITCODE -ne 0) { $sync; Fail "sync exited non-zero" }
if ($sync | Select-String -Pattern 'managed block not updated|digest not found|AGENTS\.override' -Quiet) { $sync; Fail "sync reported a Table D BLOCK signal" }

# (c) the POST-SYNC manifest is the AUTHORITATIVE must-check set: sync just re-recorded
# every managed-block file it owns, so a harness whose entry was missing is now listed
# and cannot be skipped by under-declaring. Read the managed-block PATHS post-sync.
Write-Host "post-sync manifest managed-block files:"
$manifestFiles = @(node -e 'const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); for (const e of m.entries || []) if (e.kind === "managed-block") console.log(e.path);' "$core\install-manifest.json")
if ($LASTEXITCODE -ne 0) { Fail "could not read $core\install-manifest.json" }
$manifestFiles = @($manifestFiles | Where-Object { $_ -ne '' } | Sort-Object -Unique)
if ($manifestFiles.Count -lt 1) { Fail "post-sync manifest has no managed-block entries - nothing to prove" }
$manifestFiles | ForEach-Object { Write-Host "  $_" }

# check EVERY post-sync managed-block file (the DRIVER - runs regardless of the
# declaration, so a repaired-but-undeclared harness is still checked)
$checkedPaths = @()
foreach ($f in $manifestFiles) {
  switch ([System.IO.Path]::GetFileName($f)) {
    'CLAUDE.md' { $skip = 'Claude Code (not detected|config is no longer present); skipping adapter' }
    'AGENTS.md' { $skip = 'Codex CLI (not detected|config is no longer present); skipping adapter' }
    default     { Fail "unexpected managed-block file in the manifest: $f" }
  }
  if ($sync | Select-String -Pattern $skip -Quiet) { $sync; Fail "sync skipped the adapter for managed-block file $f" }
  if (-not (Test-Path $f)) { Fail "managed-block file missing on disk: $f" }
  if (Select-String -Path $f -SimpleMatch $marker -Quiet) { Fail "marker found in $f (whole-file grep)" }
  $b = @(Select-String -Path $f -SimpleMatch '<!-- wienerdog:begin -->').Count
  $e = @(Select-String -Path $f -SimpleMatch '<!-- wienerdog:end -->').Count
  if ($b -ne 1 -or $e -ne 1) { Fail "$f has $b begin / $e end sentinels (need exactly one pair)" }
  $checkedPaths += $f
}

# (d) operator cross-check: the DECLARED set must equal the post-sync manifest set
# (catches a mis-declaration - the manifest already drove the checks above regardless)
$declaredSorted = @($declaredFiles | Sort-Object -Unique)
if (($declaredSorted -join "`n") -ne ($manifestFiles -join "`n")) {
  Write-Host "declared:"; $declaredSorted | ForEach-Object { Write-Host "  $_" }
  Write-Host "post-sync manifest:"; $manifestFiles | ForEach-Object { Write-Host "  $_" }
  Fail "declared harness set does not match the post-sync manifest managed-block set"
}
# net gate: the set of files actually checked equals the manifest driver set (>=1)
$checkedSorted = @($checkedPaths | Sort-Object -Unique)
if (($checkedSorted -join "`n") -ne ($manifestFiles -join "`n")) { Fail "coverage gate: checked set != post-sync manifest set" }
Write-Host "DRILL PASS — $($manifestFiles.Count) managed-block file(s) checked (manifest-driven); record this output with the date"
```

What each part proves:

- **Drive the installed SessionStart hook with the injecting environment.**
  The block runs the installed hook at `$CORE/bin/session-start.sh` (Table A;
  `doctor` does **not** print the path) with `WIENERDOG_HOME` set to the
  step-0 core and `WIENERDOG_JOB` **cleared** (an inherited `WIENERDOG_JOB`
  makes the hook exit `0` with no output — a false "clean").
- **Verify fail-closed.** The `node -e` script parses the JSON envelope and
  BLOCKS (drill FAILS — do not re-authorize) on any of: empty stdout, a
  JSON-parse failure, `hookSpecificOutput.hookEventName !== 'SessionStart'`,
  or a non-string `additionalContext`. When it parses, it **byte-compares**
  `additionalContext` to the bytes of `$CORE/state/digest.md` (Table A) —
  they must be **identical** (the hook injects exactly those bytes) — AND
  confirms the poisoned marker does not appear in `additionalContext`. It
  then greps the regenerated digest file directly, belt-and-suspenders.
- **Check the managed block of every managed-block file the POST-SYNC manifest
  lists — the manifest drives coverage, not your declaration.** This is the
  structural closure of the coverage question: the drill runs its `wienerdog
  sync` **first** (idempotent — it repairs the managed blocks and, crucially,
  **re-records any `managed-block` manifest entry a prior interrupted sync or
  tampering had dropped**), then reads the `managed-block` PATHS from the
  **post-sync** `$CORE/install-manifest.json` and checks **every one** with the
  Table D three-check conjunction (whole-file marker grep + exactly-one
  sentinel pair, and a FAIL if `sync` skipped that file's adapter or the file
  is missing on disk). Because the set comes from the manifest *after* sync
  re-recorded it, a harness whose entry was missing pre-sync — the case where
  an operator could previously under-declare and dodge it — is now in the
  must-check set and gets checked regardless of what you typed. This is
  **env-consistent** on a custom-dir install for a subtle but solid reason: the
  drill pins the harness-detection environment (unset `CLAUDE_CONFIG_DIR` /
  `CODEX_HOME`, or the custom-dir user sets them), and `sync` writes the
  manifest with the **currently-resolved** paths — so post-sync the manifest
  paths *are* the drill-time paths, and comparing/deriving files from them can
  never point off-machine. (This is why a **post-sync** path comparison is
  safe where an install-time / pre-sync one was not — do not "simplify" it back
  to a pre-sync count or an operator-count anchor; that reintroduces the exact
  hole this closes.) Your `HARNESSES` declaration remains as a **cross-check**:
  a duplicate is rejected outright, and the drill FAILS if your declared set
  does not equal the post-sync manifest set (catching a mis-declaration — e.g.
  you thought only Claude was installed but the machine also has Codex). The
  `sync` check stays **notice-tolerant**
  by construction: it fails only on a non-zero exit or a concrete Table D
  BLOCK message ("managed block not updated", missing digest, a shadowing
  `AGENTS.override`) and lets the two constant Codex info notices pass.
  Still skim the `sync` output once yourself — anything unexpected beyond
  the two constant notices deserves a look before you trust the pass. Do
  **NOT** add a byte-compare of the sentinel region against the raw
  `$CORE/state/digest.md` (Table D: `sync`'s trim+neutralize transform means
  the region is never byte-identical, so that compare would falsely fail;
  the three checks prove the block clean by construction). `doctor` is
  **not** proof here (Table D).
- *(Optional extra sanity check, NOT the proof.)* You may also start a
  **new** Claude Code / Codex session and confirm it does not surface the
  poisoned fact — a nicety, not the acceptance: the byte-level checks above
  are the proof (the injection is byte-gated).

Record the drill result (the full "DRILL PASS" output, the sync output you
reviewed, and the date). This is met only when the drill passes and is
recorded — that recorded pass is the precondition for step 7.

### 7. Re-authorize — only after a successful, recorded drill (step 6)

Re-add each removed schedule per **Table C**, reconstructing its exact
command from the step-1 `config.yaml` `jobs:` snapshot: for every job whose
snapshot `run:` is `builtin:<name>` (today `builtin:dream`) run `wienerdog
schedule add <name> --at <HH:MM> --job <builtin> --timeout <minutes>` — `at`
/ `timeout_minutes` supply the other two flags. (The routine menu
`/wienerdog-routines` is fine for the standard nightly dream.) A `skill:*`
routine **CANNOT** be re-added this release (Table C: frozen by the A0
pre-use gate, audit A1 — `schedule add … --skill <name>` fails closed on a
normal install, so this runbook will not promise a command that cannot
work); **preserve its snapshot definition** (already in your step-1
snapshot) and re-add it later once the gate opens. Do **not** run the failing
`--skill` re-add now. Then run `wienerdog doctor` and confirm nothing is
flagged (permissions, scheduler load). Schedules come back **only** after the
acceptance drill has passed and been recorded — never before.
