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
  session-start **digest** (`~/.wienerdog/state/digest.md`) injects an identity
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
bounded, code-owned; **treat as potentially sensitive — see below**):
- `~/.wienerdog/state/run-evidence.jsonl` — the bounded per-run record (Claude
  version, executable, profile, argv, settings/MCP digests, managed-policy
  state, containment self-check result). Free-text is reduced to `sha256`.
- `~/.wienerdog/state/alerts.jsonl` — durable fail-loud alerts.
- `~/.wienerdog/logs/<job>/*.log` — per-run job logs (redacted stream).

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
- **The canonical way to reach zero running Wienerdog processes is to REBOOT
  after removing every per-job schedule AND the catch-up entry — not per-platform
  process forensics.** After a reboot, with nothing left to fire, zero Wienerdog
  processes run, platform-independently, with no forensic guesswork. A
  per-platform live-process check is kept **only** as an OPTIONAL confirmation for
  users who genuinely cannot reboot; credential rotation begins only after proven
  quiescence (a reboot, or two consecutive clean optional checks).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | docs/runbooks/incident.md | The general incident-drill runbook (house numbered-checklist format), covering the seven ordered A9 steps: (1) snapshot `state/schedule.json`, remove every per-job schedule **and** the shared catch-up entry, then reach proven quiescence by REBOOT (optional live-checks only if reboot is impossible); (2) preserve-evidence-privately; (3) revoke+rotate; (4) purge digest+managed-block; (5) clean git; (6) fail-closed byte-level acceptance drill; (7) re-authorize. |
| modify | docs/runbooks/secret-incident.md | Add one cross-link near the top: the secret leak is the credential-specific case of the general incident drill (link `incident.md`); for a general or suspected-compromise incident, start there. Do NOT rewrite its steps. |

### Exact contract — what `docs/runbooks/incident.md` must state

House format: a short intro paragraph, then a **numbered, ordered** imperative
checklist in plain language (define "revoke", "rotate", "managed block", "git
history" in one clause each — the audience is a knowledge worker). The steps are
ordered so nothing reads/commits/injects the compromised state while you clean
up, and so the machine is **proven clean before it is re-authorized**. It must
cover, **in this order**: (1) stop schedules + prove quiescence, (2) preserve
evidence into a private folder, (3) revoke+rotate credentials, (4) purge the
compromised digest + managed block, (5) clean git history, (6) run the
byte-level acceptance drill, (7) re-authorize only after a recorded drill pass.
The detail of each:

1. **Stop everything that can fire, then reach proven quiescence — before
   anything else.** In order:
   - **First, snapshot the schedule definitions — before you remove anything.**
     Copy `state/schedule.json` into the private incident folder (step 2) NOW.
     `schedule list` does **not** show each job's `timeoutMinutes`, and `schedule
     remove` deletes the job's config entry — so a later plain re-add cannot
     losslessly restore the exact `time` / `type` / `timeoutMinutes`. This
     snapshot is what step 7 re-authorizes from. (Handle it with the same private
     folder discipline as the rest of the evidence in step 2 — it is why the
     snapshot goes into that folder.)
   - **Unregister every per-job schedule.** `wienerdog schedule list`, then
     `wienerdog schedule remove <name>` for every job (the nightly dream and any
     catalog routine). State plainly that `remove` only stops **future** fires
     and its OS-unregister is best-effort — it does **not** stop a job running
     **right now** (you prove that separately below), and you re-add in step 7.
   - **Remove the shared catch-up entry (macOS / Windows) and re-verify it is
     gone.** Per-job `remove` deliberately leaves it, so remove it by hand:
     - macOS: `launchctl bootout gui/$(id -u)/ai.wienerdog.catchup` (fall back to
       `launchctl remove ai.wienerdog.catchup`), then delete its LaunchAgent
       plist; re-verify `launchctl list | grep -c ai.wienerdog.catchup` prints
       `0`.
     - Windows (PowerShell): `Unregister-ScheduledTask -TaskPath '\Wienerdog\'
       -TaskName 'catchup' -Confirm:$false`; re-verify `Get-ScheduledTask
       -TaskPath '\Wienerdog\' -ErrorAction SilentlyContinue` lists nothing.
     - Linux/systemd: nothing to do — there is no catch-up entry on this
       platform.
   - **Reach proven quiescence — the canonical path is to REBOOT.** With every
     per-job schedule and the catch-up entry removed, reboot the machine. After
     the reboot nothing can have re-fired, so **zero** Wienerdog processes run —
     platform-independently, with no process forensics. **Credential rotation
     (step 3) begins only after this reboot.**
   - **OPTIONAL — only if you genuinely cannot reboot:** confirm quiescence by
     live-process check instead, and treat the machine as quiescent only after
     **two consecutive clean checks**. Match on the process **command line /
     tree**, not an executable path (the brain runs as `node …/wienerdog.js` and
     as `claude` / `codex` — matching a `node`/`node.exe` binary path misses
     them), and check **both** the Claude and the Codex brain plus the whole
     descendant tree:
     - macOS / Linux: `pgrep -fl 'wienerdog|claude|codex'` must print nothing;
       for a live one, `pkill -f 'wienerdog'` (repeat until empty), then `kill -9
       <pid>` for a straggler and its children (`pgrep -P <pid>`). macOS: also
       confirm `launchctl list | grep -i wienerdog` is empty; Linux: also confirm
       `systemctl --user list-timers | grep -i wienerdog` shows nothing active.
     - Windows (PowerShell), match on **CommandLine**, not Path: `Get-CimInstance
       Win32_Process | Where-Object { $_.CommandLine -match 'wienerdog|claude|codex' }`
       must be empty; `Stop-Process -Id <pid> -Force` for any straggler.
     - **Hard gate:** do not proceed to credential rotation until you have either
       rebooted or seen two consecutive clean checks. If a check keeps finding a
       live job, treat the machine as still-compromised and escalate rather than
       continuing.

2. **Preserve the evidence — into a folder that is private AND excluded from
   sync/backup FIRST, then copy.** Order matters: create and secure the
   destination *before* any sensitive bytes land in it. **Treat every copy as
   potentially sensitive** — redaction is best-effort (a boundary-split or encoded
   secret can survive in a log; ADR-0024), so these are your incident timeline but
   are **not** guaranteed secret-free.
   - **Create the incident folder, make it private, and exclude it from cloud
     sync / backup — all BEFORE copying anything in.** Put it OUTSIDE
     `~/.wienerdog` and outside any synced/backed-up path (not under iCloud Drive
     / Dropbox / OneDrive / Google Drive):
     - macOS / Linux: `mkdir -m 700 ~/wienerdog-incident-<date>`, and add that
       folder to your backup exclusions *before* the copy (Time Machine: System
       Settings → Time Machine → Options → add the folder).
     - Windows (PowerShell): create the folder, then strip inherited access and
       grant only your account — `icacls <folder> /inheritance:r /grant:r
       "$($env:USERNAME):(OI)(CI)F"` — and exclude it from File History / OneDrive
       backup, all before copying.
   - **Copy the evidence in:** `state/schedule.json` (the step-1 snapshot),
     `state/run-evidence.jsonl`, `state/alerts.jsonl`, and the relevant
     `logs/<job>/` files.
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
   holds: Google broker tokens (`~/.wienerdog/secrets/google-token-*.json` — re-
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
     **`<core>/bin/session-start.sh`** (`<core>` = `~/.wienerdog`; the adapter
     installs it there — do **not** rely on `doctor` to print the path, it does
     not). Run it with `WIENERDOG_HOME` set to your core and `WIENERDOG_JOB`
     **cleared** (an inherited `WIENERDOG_JOB` makes the hook exit `0` with no
     output — a false "clean"):
     `WIENERDOG_JOB= WIENERDOG_HOME="$HOME/.wienerdog" "$HOME/.wienerdog/bin/session-start.sh"`
   - **Verify fail-closed.** Pipe that stdout through a tiny `node -e` that parses
     the JSON envelope and BLOCKS (drill FAILS — do not re-authorize) on any of:
     empty stdout, a JSON-parse failure, `hookSpecificOutput.hookEventName !==
     'SessionStart'`, or a non-string `additionalContext`. When it parses,
     **byte-compare** `additionalContext` to the bytes of `state/digest.md` — they
     must be **identical** (the hook injects exactly those bytes) — AND confirm a
     `grep -F` for the poisoned marker over `additionalContext` finds nothing. A
     marker match, a mismatch against the digest, or any block condition means
     STOP.
   - **Grep the regenerated `state/digest.md`** for the poisoned marker directly
     (belt-and-suspenders against the decoded bytes above).
   - **Check BOTH managed blocks via `sync`'s own output PLUS an explicit sentinel
     check — not `doctor`.** Re-run `wienerdog sync` and read its output: if it
     prints any managed-block out-of-sync / adapter notice for `CLAUDE.md` or
     `AGENTS.md`, the drill **fails** (the block is not in a known-clean rendered
     state). Then, independently of any tool, check the sentinel region in
     **`CLAUDE.md` AND `AGENTS.md`**: confirm each file contains exactly one
     `<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->` pair (a missing or
     duplicated sentinel is a failure), and confirm a `grep -F` for the poisoned
     marker between the sentinels finds nothing in either file. (`doctor` does
     **not** verify managed-block / sentinel integrity — do not treat a clean
     `doctor` as proof here.)
   - *(Optional extra sanity check, NOT the proof.)* You may also start a **new**
     Claude Code / Codex session and confirm it does not surface the poisoned
     fact — but this observation is a nicety, not the acceptance: the byte-level
     checks above are the proof (the injection is byte-gated, ADR-0021).
   Record the drill result (all checks above, clean). A9's acceptance is met only
   when the drill passes and is recorded — that recorded pass is the precondition
   for step 7.

7. **Re-authorize — only after a successful, recorded drill (step 6) and steps
   1–5.** Re-add the schedules you removed (`wienerdog schedule add …` or the
   routine menu `/wienerdog-routines`), then run `wienerdog doctor` and confirm
   nothing is flagged (permissions, scheduler load). Schedules come back **only**
   after the acceptance drill has passed and been recorded — never before.

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

- [ ] `docs/runbooks/incident.md` exists in the house numbered-checklist format
      and covers, **in order**: (1) snapshot `state/schedule.json` before removal,
      remove every per-job schedule **and** the shared catch-up entry, then reach
      proven quiescence by **reboot** (optional live-checks only if reboot is
      impossible); (2) preserve evidence into a **private, sync/backup-excluded**
      folder before any cleanup; (3) revoke+rotate credentials; (4) purge the
      compromised digest **and** managed block (fix source → `memory approve
      <note>` → `sync`); (5) clean git history; (6) the fail-closed byte-level
      acceptance drill proving the old digest/managed block is no longer injected;
      (7) re-authorize **only** after a recorded drill pass.
- [ ] Step order puts "stop all jobs" strictly before credential rotation, and
      puts the acceptance drill strictly **before** re-authorization (A9
      acceptance): schedules are re-added only after a recorded drill pass.
- [ ] The stop step states that `schedule remove` does **not** stop an
      already-running job **and leaves the shared catch-up entry**; it removes and
      re-verifies the catch-up entry (macOS `ai.wienerdog.catchup`, Windows
      `\Wienerdog\catchup`; Linux has none); it makes **reboot** the canonical
      quiescence proof and keeps an optional live-check (two consecutive clean,
      matching the **command line / tree** for `claude` **and** `codex`, not a
      binary path) that gates credential rotation.
- [ ] The evidence-preservation step snapshots `state/schedule.json` **before**
      removal and names `state/run-evidence.jsonl`, `state/alerts.jsonl`, and
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
      checks **both** managed blocks via `sync`'s notice **plus** an explicit
      sentinel/marker check in `CLAUDE.md` **and** `AGENTS.md` (**not** `doctor`).
      The new-session observation is an optional extra, not the proof; the proof
      is tied to the ADR-0021 byte-gated injection.
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
# each required mechanism is referenced:
grep -nE "schedule (list|remove)|schedule\.json|run-evidence\.jsonl|memory approve|wienerdog sync|managed block" docs/runbooks/incident.md
# the catch-up removal + reboot-canonical quiescence + fixed optional live-check:
grep -nE "ai\.wienerdog\.catchup|\\\\Wienerdog\\\\catchup|reboot|CommandLine|claude\|codex" docs/runbooks/incident.md
# private evidence handling: pre-copy exclusion + recursive perms + windows ACL:
grep -nE "find .*-type d.*chmod 700|find .*-type f.*chmod 600|icacls|Time Machine|OneDrive" docs/runbooks/incident.md
# the fail-closed byte-level drill: installed hook path + env + block conditions:
grep -nE "bin/session-start\.sh|WIENERDOG_HOME|WIENERDOG_JOB|additionalContext|hookEventName|AGENTS\.md" docs/runbooks/incident.md
# memory approve uses a short name, not a path:
grep -nE "memory approve (profile|preferences|goals|instructions|<note>)" docs/runbooks/incident.md
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
