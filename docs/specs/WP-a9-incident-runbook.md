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
- `wienerdog memory approve <file>` — interactive, terminal-only; ratifies the
  current exact bytes of an injected identity note into the identity trust
  registry (ADR-0021). No headless/`--yes` bypass.
- `wienerdog doctor` — read-only health check (permissions, scheduler load,
  skill links).

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

**A `schedule remove` does not stop a job that is already running (do not assume
quiescence).** Per ADR-0027 / WP-145, `schedule remove` re-derives and runs a
best-effort OS **unregister** and then deletes the schedule file; the OS
unregister is **best-effort** (a poisoned or already-unloaded entry is ignored —
`manifest.js reverseSchedulerEntry` swallows the error), and, critically,
unregistering only stops **future** fires. **A dream/routine job that is running
*right now* keeps running** — reading, committing, and injecting — after
`remove` returns. The runbook must therefore add a **proven-quiescence** gate
(contract step 1 below): after removal, verify no Wienerdog job process is live
and stop any that is, and begin credential rotation only once zero jobs are
active.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | docs/runbooks/incident.md | The general incident-drill runbook (house numbered-checklist format), covering the seven ordered A9 steps: stop+prove-quiescence, preserve-evidence-privately, revoke+rotate, purge digest+managed-block, clean git, byte-level acceptance drill, then re-authorize. |
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

1. **Stop all schedules AND prove no job is still running — before anything
   else.** Two parts, in order:
   - **Unregister every schedule.** `wienerdog schedule list`, then `wienerdog
     schedule remove <name>` for every job (the nightly dream and any catalog
     routine). State plainly that `remove` only stops **future** fires and that
     its OS-unregister is best-effort — it does **not** stop a job that is
     running **right now**, and you re-add in the re-authorize step.
   - **Prove quiescence — zero active Wienerdog jobs — and stop any that is
     live.** Because a dream/routine already in flight keeps reading, committing,
     and injecting after `remove` returns, you must confirm none is running
     before you rotate anything. Give platform-appropriate, do-it-yourself
     checks and an explicit stop:
     - macOS / Linux: `pgrep -fl wienerdog` (and `pgrep -fl 'claude -p'` for a
       live brain). If anything is listed, stop it: `pkill -f wienerdog` (repeat
       until `pgrep` is empty); for a stubborn process, `kill -9 <pid>`.
     - macOS additionally: `launchctl list | grep -i wienerdog` should show no
       loaded label after `remove`.
     - Linux additionally: `systemctl --user list-timers | grep -i wienerdog`
       and `systemctl --user list-units 'wienerdog-*'` should show nothing
       active.
     - Windows: `Get-ScheduledTask -TaskPath '\\Wienerdog\\' -ErrorAction
       SilentlyContinue` should list nothing, and
       `Get-Process | Where-Object { $_.Path -like '*wienerdog*' }` (plus any
       `claude` process) should be empty; `Stop-Process -Id <pid> -Force` for
       any straggler.
     - **Do not proceed to credential rotation until every one of these is empty
       (proven zero active jobs).** State this as a hard gate: rotation begins
       only at proven quiescence, and if a check keeps finding a live job, treat
       the machine as still-compromised and escalate rather than continuing.

2. **Preserve the evidence — copy it aside into a private folder, do NOT delete
   it yet.** Before you change anything, snapshot the code-owned run record so you
   can see what actually ran and when: copy `state/run-evidence.jsonl`,
   `state/alerts.jsonl`, and the relevant `logs/<job>/` files to a folder
   *outside* `~/.wienerdog`. **Treat every copy as potentially sensitive** —
   redaction is best-effort (a boundary-split or encoded secret can survive in a
   log; ADR-0024), so these are your incident timeline but they are **not**
   guaranteed secret-free. Handle them privately:
   - Create the incident folder **private to you before copying anything into
     it**: `mkdir -m 700 ~/wienerdog-incident-<date>` (macOS/Linux); on Windows
     create the folder and remove inherited access so only your account can read
     it. Do not use a world- or group-readable location.
   - After copying, tighten the copies to owner-only: `chmod 600
     ~/wienerdog-incident-<date>/*` (POSIX). State that the copies leave
     Wienerdog's own `0700`/`0600` protection when they land elsewhere, so you
     re-apply it by hand.
   - **Keep the folder off any cloud sync or backup.** Explicitly do not place it
     under iCloud Drive / Dropbox / OneDrive / Google Drive or any auto-backup
     path, and exclude it from Time Machine / file-history backups — an incident
     snapshot must not be silently copied off the machine.
   - *(Optional, your judgment.)* Record an integrity hash of each copied file
     (e.g. `shasum -a 256 …`) so you can later prove the timeline was not altered.
   - Do not run any cleanup step until this private snapshot exists.

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
   - Fix the source: if an **identity note** (`06-Identity/*`) was poisoned,
     correct it in the vault. Because digest injection is byte-gated by the
     identity trust registry (ADR-0021), a changed identity note will **not** be
     re-injected until you re-ratify it — run `wienerdog memory approve <file>`
     on the corrected note (interactive, shows the exact bytes; no headless
     bypass) so only the bytes you just reviewed can ever be injected again.
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
   **not** re-add schedules until it passes. Verify at the **byte level** that the
   compromised context can no longer be injected — not by watching how a session
   behaves, but by inspecting the exact bytes the injection machinery would use:
   - **Run the installed SessionStart hook directly and inspect the bytes it
     would inject.** Wienerdog's hook (`templates/hooks/session-start.sh`, its
     installed copy — `wienerdog doctor` reports the hook path) reads
     `state/digest.md` and emits a JSON envelope
     `{ "hookSpecificOutput": { "hookEventName": "SessionStart",
     "additionalContext": "<digest bytes>" } }`. Run that installed hook,
     decode `hookSpecificOutput.additionalContext` from its stdout, and confirm a
     `grep -F` for the poisoned marker over those **exact injected bytes** finds
     nothing. (Give the literal one-liner: run the hook, pipe its stdout through a
     tiny `node -e` that parses the JSON and prints `additionalContext`, then
     `grep -F "<marker>"`; a match means STOP — do not re-authorize.)
   - **Grep the regenerated `state/digest.md`** for the poisoned marker directly
     (belt-and-suspenders against the decoded bytes above).
   - **Check BOTH managed blocks** — the sentinel-delimited region
     (`<!-- wienerdog:begin --> … <!-- wienerdog:end -->`) in **`CLAUDE.md` AND
     in `AGENTS.md`** — and confirm neither contains the marker.
   - **Treat any sync sentinel / adapter notice as blocking.** If `wienerdog
     sync` (or `doctor`) reports a managed-block out-of-sync sentinel, a missing
     or duplicated sentinel, or an adapter warning about either file, the drill
     **fails**: the managed block is not in a known-clean rendered state, so stop
     and fix the source before continuing — do not re-authorize on a warning.
   - *(Optional extra sanity check, NOT the proof.)* You may also start a **new**
     Claude Code / Codex session and confirm it does not surface the poisoned
     fact — but this observation is a nicety, not the acceptance: the byte-level
     checks above are the proof (the injection is byte-gated, ADR-0021).
   Record the drill result (the four checks above, all clean). A9's acceptance is
   met only when the drill passes and is recorded — that recorded pass is the
   precondition for step 7.

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
      and covers, **in order**: (1) stop all schedules **and prove quiescence**
      (zero active jobs, stop any live one), (2) preserve evidence into a
      **private** folder before any cleanup, (3) revoke+rotate credentials,
      (4) purge the compromised digest **and** managed block (fix source →
      `memory approve` → `sync`), (5) clean git history, (6) the byte-level
      acceptance drill proving the old digest/managed block is no longer injected,
      (7) re-authorize **only** after a recorded drill pass.
- [ ] Step order puts "stop all jobs" strictly before credential rotation, and
      puts the acceptance drill strictly **before** re-authorization (A9
      acceptance): schedules are re-added only after a recorded drill pass.
- [ ] The stop-schedules step states that `schedule remove` does **not** stop an
      already-running job and gives platform-appropriate live-process checks
      (`pgrep`/`launchctl`/`systemctl`/`Get-ScheduledTask`) plus an explicit stop,
      gating credential rotation on proven zero active jobs.
- [ ] The evidence-preservation step names `state/run-evidence.jsonl`,
      `state/alerts.jsonl`, and `logs/<job>/`; treats them as **potentially
      sensitive** (best-effort redaction, not secret-free); and requires a `0700`
      incident folder, `0600` copies, and explicit exclusion from cloud sync /
      backup.
- [ ] The acceptance-drill step verifies at the **byte level**: run the installed
      SessionStart hook and grep its decoded `additionalContext`, grep the
      regenerated `state/digest.md`, and grep **both** managed blocks (`CLAUDE.md`
      **and** `AGENTS.md`); any sync sentinel / adapter notice is blocking; the
      new-session observation is an optional extra, not the proof. It ties the
      proof to the ADR-0021 byte-gated injection.
- [ ] `docs/runbooks/secret-incident.md` gains a cross-link naming `incident.md`
      as the general drill (its existing steps are unchanged).
- [ ] Every documented command/mechanism is one that already ships (no invented
      command).
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
test -f docs/runbooks/incident.md && echo "runbook present — OK"
grep -n "incident.md" docs/runbooks/secret-incident.md && echo "cross-link present — OK"
# each required mechanism is referenced:
grep -nE "schedule (list|remove)|run-evidence\.jsonl|memory approve|wienerdog sync|managed block" docs/runbooks/incident.md
# the quiescence gate, private evidence handling, and byte-level drill are present:
grep -nE "pgrep|launchctl|systemctl|Get-ScheduledTask" docs/runbooks/incident.md
grep -nE "0700|chmod 600|mkdir -m 700|cloud|backup|Time Machine" docs/runbooks/incident.md
grep -nE "additionalContext|SessionStart|AGENTS\.md" docs/runbooks/incident.md
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
