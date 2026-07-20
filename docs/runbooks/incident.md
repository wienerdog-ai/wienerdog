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
  not a regular expression; **may be multi-line** — it is matched whole-file,
  byte-exact, so a contiguous multi-line marker is found).
- `DECLARED_PATHS` / `$DeclaredPaths` — the **complete list of managed-block
  file PATHS** your **trusted inventory** knows are installed (one absolute path
  per line/entry) — from your own install notes or the persisted incident
  evidence, **not** the possibly-tampered manifest. It is a **path list, not a
  harness-name list**, so it can express **multiple installed roots for one
  harness** (e.g. Codex at two custom roots) that a single `CODEX_HOME` can never
  point at once. The declared paths are **unioned into** the must-check set: the
  drill checks **every** managed-block file in the machine-authoritative set —
  the post-sync manifest UNION an independent default-location probe UNION your
  declared paths — so a root that only your inventory knows is still inspected.
  A **duplicate** path is rejected outright (ordinal-exact); a declared path
  whose harness `sync` **cannot detect** (its env var unset/wrong) is a
  **BLOCK**, not a silent omission; a declared path **missing on disk** FAILS;
  and every element of the union must be present and clean. The one case no
  on-machine source can close — a root absent from the manifest AND from a
  default location AND from your trusted inventory — is a **blocking residual:
  STOP and escalate** (see the residual bullet after the blocks).

The block also **pins the harness-detection environment**: it unsets
`CLAUDE_CONFIG_DIR` and `CODEX_HOME` before `sync`, so `sync`'s adapter
detection and manifest write use the real default directories — an ambient
redirect of either would otherwise hide your real `CLAUDE.md`/`AGENTS.md`. The
env steers which single root `sync` detects and re-records per harness; the
declared paths cover every OTHER installed root. If (and only if) you INSTALLED
Wienerdog into a custom Claude/Codex directory, set the matching variable to the
root `sync` should record, and list **all** roots (including it) in the declared
paths — a declared path whose harness `sync` skipped BLOCKs the drill.

Run in a session where the step-1 re-export already set `WIENERDOG_HOME`.

macOS / Linux (bash — paste as one block):

```bash
# DECLARED_PATHS: the COMPLETE list of managed-block files your TRUSTED INVENTORY knows
# are installed — ONE absolute path per line, MULTIPLE roots per harness allowed. The
# default two lines fit a standard install — replace/extend them from your inventory.
DECLARED_PATHS="$HOME/.claude/CLAUDE.md
$HOME/.codex/AGENTS.md"
MARKER='<the exact poisoned text you are hunting>'   # may be MULTI-LINE; matched whole-file, byte-exact
CORE="$WIENERDOG_HOME"     # the step-0 core, re-exported after the reboot

fail() { printf 'DRILL FAIL: %s\n' "$1"; exit 1; }
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# pin the harness-detection env BEFORE sync (see prose). It steers which single root sync
# DETECTS and re-records; the declared paths cover every OTHER installed root. Custom-dir:
# set CLAUDE_CONFIG_DIR / CODEX_HOME to the root sync should record, and list ALL roots in
# DECLARED_PATHS.
unset CLAUDE_CONFIG_DIR CODEX_HOME

# The SHARED byte-exact verifier (identical bytes in both blocks) does ALL identity-critical
# work in ONE cross-platform node script: path validation (fully-qualified, canonical,
# exact-case basename), manifest read, default probe, the manifest∪probe∪declared union, and
# every per-file whole-file byte-exact marker + sentinel check, plus the hook/digest
# byte-compare. NO managed-block path is ever compared / globbed / re-encoded by the shell,
# so PowerShell's case-/glob-/codepage-/rootedness footguns cannot apply (round-10).
cat > "$WORK/verify.js" <<'VERIFY'
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var core = process.env.WIENERDOG_HOME || '';
var marker = process.env.WD_MARKER || '';
var syncOut = process.env.WD_SYNC || '';
var home = process.env.HOME || os.homedir();
var hookFile = process.env.WD_HOOK_FILE || '';
var declared = (process.env.WD_DECLARED || '').split(/\r?\n/).filter(function (s) { return s.length; });
var SENT_B = '<!-- wienerdog:begin -->', SENT_E = '<!-- wienerdog:end -->';
var isWin = process.platform === 'win32';
function fail(m) { process.stdout.write('DRILL FAIL: ' + m + '\n'); process.exit(1); }
// path identity: FULLY QUALIFIED (drive+sep or UNC on win; leading / on posix), CANONICAL
// (no . / .. segment), EXACT-case basename — all byte-exact, platform-correct.
function fq(p) { return isWin ? (/^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p)) : p.charAt(0) === '/'; }
function dotseg(p) { return p.split(/[\\/]+/).some(function (s) { return s === '.' || s === '..'; }); }
function base(p) { var a = p.split(/[\\/]/); return a[a.length - 1]; }
function rd(p) { try { return fs.readFileSync(p); } catch (e) { return null; } }        // literal read, no glob
function occ(b, s) { var t = Buffer.from(s), n = 0, i = 0; while ((i = b.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; }
function idx(b, s) { return b.indexOf(Buffer.from(s)); }
function has(b, s) { return s.length > 0 && b.indexOf(Buffer.from(s)) >= 0; }            // whole-file, byte-exact, multi-line-safe
// notice-tolerant: block only on a concrete Table D signal (the two Codex info notices pass)
if (/managed block not updated|digest not found|AGENTS\.override/i.test(syncOut)) fail('sync reported a Table D BLOCK signal');
// validate + collect DECLARED paths (dedup-with-reject, ordinal exact-string keys)
if (declared.length < 1) fail('DECLARED_PATHS is empty - list every managed-block file your trusted inventory knows is installed');
var must = new Set();
declared.forEach(function (dp) {
  if (!fq(dp)) fail('declared path is not FULLY QUALIFIED (drive-relative / current-drive-rooted rejected): ' + dp);
  if (dotseg(dp)) fail('declared path has a "." or ".." segment (must be canonical): ' + dp);
  var b = base(dp);
  if (b !== 'CLAUDE.md' && b !== 'AGENTS.md') fail('not a managed-block file: basename must be exactly CLAUDE.md or AGENTS.md: ' + dp);
  if (must.has(dp)) fail('a declared path is listed more than once (ordinal-exact): ' + dp);
  must.add(dp);
});
// validate + read POST-SYNC manifest managed-block paths
var mtxt; try { mtxt = fs.readFileSync(path.join(core, 'install-manifest.json'), 'utf8'); } catch (e) { fail('cannot read install-manifest.json'); }
var m; try { m = JSON.parse(mtxt); } catch (e) { fail('manifest is not valid JSON'); }
if (!m || !Array.isArray(m.entries)) fail('manifest has no entries array');
var mseen = new Set();
m.entries.forEach(function (e) {
  if (!e || e.kind !== 'managed-block') return;
  var p = e.path;
  if (typeof p !== 'string' || !fq(p)) fail('manifest managed-block path is not fully qualified: ' + JSON.stringify(p));
  if (/[\r\n\0]/.test(p)) fail('manifest managed-block path contains CR/LF/NUL');
  var b = base(p);
  if (b !== 'CLAUDE.md' && b !== 'AGENTS.md') fail('manifest managed-block basename unexpected: ' + b);
  if (mseen.has(p)) fail('duplicate managed-block path in manifest: ' + p);
  mseen.add(p); must.add(p);
});
// independent default-location probe (byte-exact buffer sentinel; HOME per paths.js)
[path.join(home, '.claude', 'CLAUDE.md'), path.join(home, '.codex', 'AGENTS.md')].forEach(function (pf) {
  var b = rd(pf);
  if (b && occ(b, SENT_B) >= 1 && occ(b, SENT_E) >= 1) must.add(pf);
});
if (must.size < 1) fail('no managed block in the manifest, at a default location, or declared - nothing to prove (a zero-harness machine cannot be certified by this drill)');
// check EVERY must file: adapter-not-skipped (by basename) + present + whole-file byte marker
// (multi-line safe) + exactly one begin AND one end sentinel OCCURRENCE + begin before end
var claudeSkip = /Claude Code (not detected|config is no longer present); skipping adapter/;
var codexSkip = /Codex CLI (not detected|config is no longer present); skipping adapter/;
must.forEach(function (f) {
  var skip = base(f) === 'CLAUDE.md' ? claudeSkip : codexSkip;
  if (skip.test(syncOut)) fail('sync skipped the adapter for managed-block file ' + f + ' (set its CLAUDE_CONFIG_DIR/CODEX_HOME to this root and re-run)');
  var buf = rd(f);
  if (buf === null) fail('managed-block file missing on disk: ' + f);
  if (has(buf, marker)) fail('marker found in ' + f + ' (whole-file, byte-exact, multi-line-safe)');
  var bc = occ(buf, SENT_B), ec = occ(buf, SENT_E);
  if (bc !== 1 || ec !== 1) fail(f + ': ' + bc + ' begin / ' + ec + ' end sentinel occurrence(s) (need exactly one each)');
  if (idx(buf, SENT_B) >= idx(buf, SENT_E)) fail(f + ': begin sentinel must precede end sentinel');
});
// POST-SYNC digest proof: hook envelope (TRUE byte compare) + digest marker (whole-file byte)
var digestBuf = rd(path.join(core, 'state', 'digest.md'));
if (digestBuf === null) fail('post-sync digest missing');
var hookBuf = hookFile ? rd(hookFile) : null;
if (hookBuf === null || hookBuf.length === 0) fail('hook printed nothing (fail-open output is NOT proof of clean)');
var j; try { j = JSON.parse(hookBuf.toString('utf8')); } catch (e) { fail('hook output is malformed JSON'); }
var h = (j && j.hookSpecificOutput) || {};
if (h.hookEventName !== 'SessionStart') fail('hook wrong hookEventName');
if (typeof h.additionalContext !== 'string') fail('hook additionalContext is not a string');
if (!digestBuf.equals(Buffer.from(h.additionalContext, 'utf8'))) fail('injected bytes differ from the digest (true byte compare)');
if (marker.length && h.additionalContext.indexOf(marker) >= 0) fail('poisoned marker is still injected');
if (has(digestBuf, marker)) fail('marker present in the post-sync digest');
process.stdout.write('DRILL PASS - ' + must.size + ' managed-block file(s) checked (post-sync manifest UNION default-probe UNION declared), byte-exact; record this output with the date\n');
VERIFY

# (1) run sync FIRST — every digest/hook/marker/managed-block assertion runs AFTER this (F1);
# the verifier reads only the post-sync state.
SYNC_OUT="$(WIENERDOG_HOME="$CORE" wienerdog sync 2>&1)" \
  || { printf '%s\n' "$SYNC_OUT"; fail "sync exited non-zero"; }

# (2) drive the installed hook (post-sync) — WIENERDOG_JOB cleared so it injects — writing
# its RAW stdout BYTES to a file the verifier reads (never through a console codepage).
WIENERDOG_JOB= WIENERDOG_HOME="$CORE" "$CORE/bin/session-start.sh" > "$WORK/hook.out" 2>/dev/null || true

# (3) run the shared verifier with the post-sync inputs. Paths reach node only via env
# (declared list) or are read by node from disk (manifest/probe/harness files) — node
# decides, and prints DRILL PASS / DRILL FAIL with the right exit code.
WIENERDOG_HOME="$CORE" HOME="$HOME" WD_MARKER="$MARKER" WD_DECLARED="$DECLARED_PATHS" \
  WD_SYNC="$SYNC_OUT" WD_HOOK_FILE="$WORK/hook.out" node "$WORK/verify.js"
```

Windows (PowerShell — paste as one block; the hook is a bash script, and
Git Bash ships with Git for Windows, which Claude Code requires):

```powershell
$DeclaredPaths = @(
  "$env:USERPROFILE\.claude\CLAUDE.md"     # DECLARE the COMPLETE list of managed-block files your
  "$env:USERPROFILE\.codex\AGENTS.md"      # TRUSTED INVENTORY knows is installed — one absolute path
)                                          # per entry, MULTIPLE roots per harness allowed. Replace/extend.
$marker = '<the exact poisoned text you are hunting>'   # may be MULTI-LINE; matched whole-file, byte-exact
$core   = $env:WIENERDOG_HOME      # the step-0 core, re-exported after the reboot

function Fail($msg) { Write-Host "DRILL FAIL: $msg"; exit 1 }
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("wd-drill-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  # pin the harness-detection env BEFORE sync (see prose). It steers which single root sync
  # DETECTS and re-records; the declared paths cover every OTHER installed root. Custom-dir:
  # set CLAUDE_CONFIG_DIR / CODEX_HOME to the root sync should record, and list ALL roots in
  # $DeclaredPaths.
  Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue
  $homeDir = if ($env:HOME) { $env:HOME } else { $env:USERPROFILE }  # HOME before USERPROFILE, matching the code

  # The SHARED byte-exact verifier — the SAME node script as the bash block (identical bytes)
  # does ALL identity-critical work in ONE cross-platform program: PowerShell never compares,
  # globs, re-encodes, or reads a managed-block path, so its case-/glob-/codepage-/rootedness
  # footguns cannot apply (round-10). It is pure ASCII on the wire; declared paths reach node
  # via env (wide, no console codepage) and node reads every file itself.
  $verify = @'
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var core = process.env.WIENERDOG_HOME || '';
var marker = process.env.WD_MARKER || '';
var syncOut = process.env.WD_SYNC || '';
var home = process.env.HOME || os.homedir();
var hookFile = process.env.WD_HOOK_FILE || '';
var declared = (process.env.WD_DECLARED || '').split(/\r?\n/).filter(function (s) { return s.length; });
var SENT_B = '<!-- wienerdog:begin -->', SENT_E = '<!-- wienerdog:end -->';
var isWin = process.platform === 'win32';
function fail(m) { process.stdout.write('DRILL FAIL: ' + m + '\n'); process.exit(1); }
// path identity: FULLY QUALIFIED (drive+sep or UNC on win; leading / on posix), CANONICAL
// (no . / .. segment), EXACT-case basename — all byte-exact, platform-correct.
function fq(p) { return isWin ? (/^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p)) : p.charAt(0) === '/'; }
function dotseg(p) { return p.split(/[\\/]+/).some(function (s) { return s === '.' || s === '..'; }); }
function base(p) { var a = p.split(/[\\/]/); return a[a.length - 1]; }
function rd(p) { try { return fs.readFileSync(p); } catch (e) { return null; } }        // literal read, no glob
function occ(b, s) { var t = Buffer.from(s), n = 0, i = 0; while ((i = b.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; }
function idx(b, s) { return b.indexOf(Buffer.from(s)); }
function has(b, s) { return s.length > 0 && b.indexOf(Buffer.from(s)) >= 0; }            // whole-file, byte-exact, multi-line-safe
// notice-tolerant: block only on a concrete Table D signal (the two Codex info notices pass)
if (/managed block not updated|digest not found|AGENTS\.override/i.test(syncOut)) fail('sync reported a Table D BLOCK signal');
// validate + collect DECLARED paths (dedup-with-reject, ordinal exact-string keys)
if (declared.length < 1) fail('DECLARED_PATHS is empty - list every managed-block file your trusted inventory knows is installed');
var must = new Set();
declared.forEach(function (dp) {
  if (!fq(dp)) fail('declared path is not FULLY QUALIFIED (drive-relative / current-drive-rooted rejected): ' + dp);
  if (dotseg(dp)) fail('declared path has a "." or ".." segment (must be canonical): ' + dp);
  var b = base(dp);
  if (b !== 'CLAUDE.md' && b !== 'AGENTS.md') fail('not a managed-block file: basename must be exactly CLAUDE.md or AGENTS.md: ' + dp);
  if (must.has(dp)) fail('a declared path is listed more than once (ordinal-exact): ' + dp);
  must.add(dp);
});
// validate + read POST-SYNC manifest managed-block paths
var mtxt; try { mtxt = fs.readFileSync(path.join(core, 'install-manifest.json'), 'utf8'); } catch (e) { fail('cannot read install-manifest.json'); }
var m; try { m = JSON.parse(mtxt); } catch (e) { fail('manifest is not valid JSON'); }
if (!m || !Array.isArray(m.entries)) fail('manifest has no entries array');
var mseen = new Set();
m.entries.forEach(function (e) {
  if (!e || e.kind !== 'managed-block') return;
  var p = e.path;
  if (typeof p !== 'string' || !fq(p)) fail('manifest managed-block path is not fully qualified: ' + JSON.stringify(p));
  if (/[\r\n\0]/.test(p)) fail('manifest managed-block path contains CR/LF/NUL');
  var b = base(p);
  if (b !== 'CLAUDE.md' && b !== 'AGENTS.md') fail('manifest managed-block basename unexpected: ' + b);
  if (mseen.has(p)) fail('duplicate managed-block path in manifest: ' + p);
  mseen.add(p); must.add(p);
});
// independent default-location probe (byte-exact buffer sentinel; HOME per paths.js)
[path.join(home, '.claude', 'CLAUDE.md'), path.join(home, '.codex', 'AGENTS.md')].forEach(function (pf) {
  var b = rd(pf);
  if (b && occ(b, SENT_B) >= 1 && occ(b, SENT_E) >= 1) must.add(pf);
});
if (must.size < 1) fail('no managed block in the manifest, at a default location, or declared - nothing to prove (a zero-harness machine cannot be certified by this drill)');
// check EVERY must file: adapter-not-skipped (by basename) + present + whole-file byte marker
// (multi-line safe) + exactly one begin AND one end sentinel OCCURRENCE + begin before end
var claudeSkip = /Claude Code (not detected|config is no longer present); skipping adapter/;
var codexSkip = /Codex CLI (not detected|config is no longer present); skipping adapter/;
must.forEach(function (f) {
  var skip = base(f) === 'CLAUDE.md' ? claudeSkip : codexSkip;
  if (skip.test(syncOut)) fail('sync skipped the adapter for managed-block file ' + f + ' (set its CLAUDE_CONFIG_DIR/CODEX_HOME to this root and re-run)');
  var buf = rd(f);
  if (buf === null) fail('managed-block file missing on disk: ' + f);
  if (has(buf, marker)) fail('marker found in ' + f + ' (whole-file, byte-exact, multi-line-safe)');
  var bc = occ(buf, SENT_B), ec = occ(buf, SENT_E);
  if (bc !== 1 || ec !== 1) fail(f + ': ' + bc + ' begin / ' + ec + ' end sentinel occurrence(s) (need exactly one each)');
  if (idx(buf, SENT_B) >= idx(buf, SENT_E)) fail(f + ': begin sentinel must precede end sentinel');
});
// POST-SYNC digest proof: hook envelope (TRUE byte compare) + digest marker (whole-file byte)
var digestBuf = rd(path.join(core, 'state', 'digest.md'));
if (digestBuf === null) fail('post-sync digest missing');
var hookBuf = hookFile ? rd(hookFile) : null;
if (hookBuf === null || hookBuf.length === 0) fail('hook printed nothing (fail-open output is NOT proof of clean)');
var j; try { j = JSON.parse(hookBuf.toString('utf8')); } catch (e) { fail('hook output is malformed JSON'); }
var h = (j && j.hookSpecificOutput) || {};
if (h.hookEventName !== 'SessionStart') fail('hook wrong hookEventName');
if (typeof h.additionalContext !== 'string') fail('hook additionalContext is not a string');
if (!digestBuf.equals(Buffer.from(h.additionalContext, 'utf8'))) fail('injected bytes differ from the digest (true byte compare)');
if (marker.length && h.additionalContext.indexOf(marker) >= 0) fail('poisoned marker is still injected');
if (has(digestBuf, marker)) fail('marker present in the post-sync digest');
process.stdout.write('DRILL PASS - ' + must.size + ' managed-block file(s) checked (post-sync manifest UNION default-probe UNION declared), byte-exact; record this output with the date\n');
'@
  # write the verifier as ASCII bytes (the script is pure ASCII; the declared paths / marker
  # travel via env, never inside the script)
  [System.IO.File]::WriteAllText("$work\verify.js", $verify, [System.Text.Encoding]::ASCII)

  # (1) run sync FIRST (F1) — the verifier reads only the post-sync state.
  $sync = wienerdog sync 2>&1
  if ($LASTEXITCODE -ne 0) { $sync; Fail "sync exited non-zero" }

  # (2) drive the installed hook (post-sync) via bash; bash writes the RAW stdout BYTES to a
  # file the verifier reads — never captured through the PS console codepage (round-10 G1).
  $coreFwd = $core -replace '\\', '/'
  $hookOut = "$work\hook.out"; $hookFwd = $hookOut -replace '\\', '/'
  bash -c 'WIENERDOG_JOB= WIENERDOG_HOME="$1" "$1/bin/session-start.sh" > "$2"' _ $coreFwd $hookFwd

  # (3) run the shared verifier. Paths cross to node ONLY via env (wide, no console codepage);
  # node reads every file itself and decides — PS handles no path identity.
  $env:WIENERDOG_HOME = $core
  $env:HOME = $homeDir
  $env:WD_MARKER = $marker
  $env:WD_DECLARED = ($DeclaredPaths -join "`n")
  $env:WD_SYNC = ($sync | Out-String)
  $env:WD_HOOK_FILE = $hookOut
  node "$work\verify.js"
  exit $LASTEXITCODE
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
```

What each part proves (note the whole sequence is **sync-first**: `wienerdog
sync` runs before ANY digest / hook / marker / managed-block assertion, so every
check verifies the CURRENT post-sync state, never a stale pre-sync digest that
sync then regenerated):

- **One shared byte-exact verifier does all the identity-critical work.** Both
  blocks are thin platform shims — env pinning, `wienerdog sync`, and the hook
  invocation — around the **same** node script (byte-identical in both). That
  verifier reads the manifest, validates the declared paths, runs the
  default-location probe, computes the manifest∪probe∪declared union, checks every
  file, and does the hook/digest byte-compare — **in node, cross-platform,
  byte-exact**. This is deliberate: path identity is compared, searched, and
  read only by node (ordinal string keys, `Buffer.indexOf`, `fs.readFileSync`),
  so PowerShell/Windows footguns — case-insensitive comparison, filename globbing
  (`[ ] * ?`), console-codepage re-encoding of non-ASCII paths, drive-relative
  "rooted" paths, and line-oriented content search — **cannot apply**: PS never
  compares, globs, re-encodes, or reads a managed-block path. Managed-block paths
  reach node only via env (declared list — wide, no console codepage) or are read
  by node directly from disk (manifest / probe / harness files); nothing crosses
  back to the shell as a path it must act on. bash was already byte-exact; the
  shared verifier keeps bash and PS provably identical.
- **Drive the installed hook AFTER sync, fail-closed, TRUE byte compare.** The
  shims run the installed hook at `$CORE/bin/session-start.sh` (Table A) with
  `WIENERDOG_HOME` set and `WIENERDOG_JOB` **cleared** (an inherited
  `WIENERDOG_JOB` makes the hook exit `0` with no output — a false "clean"),
  writing its **raw stdout bytes** to a file the verifier reads (bash directly;
  PS via `bash` so the bytes never pass through the console codepage). The
  verifier BLOCKS on empty output / JSON-parse failure / wrong `hookEventName` /
  non-string `additionalContext`, then reads `$CORE/state/digest.md` as **raw
  bytes** and compares `digest.equals(Buffer.from(additionalContext, "utf8"))` —
  a genuine byte compare (a lossy `utf8`-string compare would map invalid UTF-8 to
  U+FFFD and read EQUAL where the raw bytes differ), confirms the marker is absent
  from `additionalContext` (**ordinal `indexOf`, multi-line-safe**), and greps the
  post-sync digest bytes directly. It runs after `sync`, so it verifies the digest
  `sync` just (re)generated.
- **Check every managed-block file in the machine-authoritative set — the
  post-sync manifest UNION an independent default-location probe UNION your
  declared paths.** The verifier runs after `wienerdog sync` (idempotent — it
  repairs the managed blocks and **re-records any `managed-block` manifest entry
  a prior interrupted sync or tampering had dropped**), then builds the
  must-check set from **three** independent sources and checks **every** file in it
  with the Table D three-check conjunction (a **whole-file, byte-exact,
  multi-line-safe** marker search — `Buffer.indexOf`, so a contiguous multi-line
  poison marker matches — plus a sentinel check that counts literal begin/end
  **occurrences** across the whole file, requiring **exactly one begin AND exactly
  one end AND begin before end** by byte offset, plus a FAIL if `sync` skipped that
  file's adapter or the file is missing):
  - **The post-sync manifest** (`$CORE/install-manifest.json`): read
    identity-preserving after `node` **validates** it — a manifest with no
    entries array, a non-absolute/non-string managed-block path, a path with a
    CR/LF/NUL or a basename other than `CLAUDE.md`/`AGENTS.md`, or a **duplicate**
    managed-block path is a DRILL FAIL (a malformed or duplicate manifest must
    never normalize-then-pass).
  - **An independent default-location probe** of `${HOME}/.claude/CLAUDE.md` and
    `${HOME}/.codex/AGENTS.md` (HOME resolved as in Table A): any Wienerdog
    managed block (a sentinel pair) found there is a must-check root **even if
    the manifest, the env, or your declaration omits it** — closing the
    default-directory omission independent of the mutable manifest.
  - **Your declared paths** (`DECLARED_PATHS` / `$DeclaredPaths`): the complete
    set of managed-block files your trusted inventory knows — **path-keyed, so it
    covers multiple roots for one harness and any non-default, non-current-env
    root** that neither the manifest nor the probe can see. Each is validated
    (**fully qualified** — a drive-relative `C:foo` or current-drive-rooted `\foo`
    is rejected; **canonical** — no `.`/`..` segment; **exact-case** basename
    `CLAUDE.md`/`AGENTS.md`), deduped ordinal-exact, then checked; one missing on
    disk FAILS, one whose harness `sync` skipped BLOCKs. Byte-distinct forms of the
    same file (NFC vs NFD, `/` vs `\`, UNC vs drive) are treated as **distinct
    entries, each verified** against the file the OS resolves it to — redundant,
    never omitting.
  A harness whose manifest entry was missing pre-sync is re-recorded by sync and
  thus checked; a managed block at a default location is caught by the probe; a
  root only your inventory knows is caught by the declared paths. This is
  **env-consistent**: the drill pins the detection env and `sync` writes the
  manifest with the **currently-resolved** paths, so the post-sync manifest paths
  *are* the drill-time paths (do not "simplify" it back to a pre-sync count or a
  pre-sync read, nor back to a coarse harness-NAME declaration — the path list is
  the coverage model's final form). The declaration is a **path list** (not
  harness names): a duplicate path FAILS outright (ordinal-exact); a declared path
  whose harness `sync` could not detect is a **BLOCK** (its basename `CLAUDE.md`→
  claude / `AGENTS.md`→codex classifies which adapter-skip to watch); and the
  drill FAILS unless the checked set equals the must-check set (manifest ∪ probe ∪
  declared). The `sync` check stays **notice-tolerant**
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
- **Blocking residual — a root no trusted record knows (honest boundary).** The
  three-source union closes every case where an installed managed-block file is
  *knowable* on-machine: it is in the post-sync manifest (every current-env root
  `sync` re-records), OR at a default location (the independent probe), OR in your
  declared paths (every root your trusted inventory knows — **including multiple
  roots per harness and non-default, non-current-env roots**). By construction the
  ONLY way a genuinely-installed managed-block file escapes the checked set is if
  it is in **none** of the three: not in the manifest, not at a default location,
  and not in your trusted inventory. Such a root is **unknowable on-machine** — no
  source knows it exists — so the drill **cannot certify the machine**. If you
  cannot establish your **complete** inventory from trusted evidence (your own
  install notes / the persisted incident evidence — **not** the possibly-tampered
  manifest), treat it exactly like step 1's "cannot reboot": **STOP and
  escalate** — do not read a DRILL PASS as proof. This is a principled, documented
  boundary, gated by the same stop-and-escalate discipline (cf. ADR-0028's
  honest-boundary posture and the A12 hand-off), not an open hole: the drill
  enforces everything machine-checkable and this residual names precisely the part
  that is not.
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
