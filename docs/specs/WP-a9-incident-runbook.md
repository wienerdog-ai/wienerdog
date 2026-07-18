---
id: WP-a9-incident-runbook
title: Add the general incident-drill runbook — stop schedules, preserve evidence, rotate credentials, purge injected digest/managed block, clean git history, re-authorize
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0021, ADR-0024]
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
already written, secret-free, 0600):
- `~/.wienerdog/state/run-evidence.jsonl` — the bounded per-run record (Claude
  version, executable, profile, argv, settings/MCP digests, managed-policy
  state, containment self-check result). Free-text is reduced to `sha256`.
- `~/.wienerdog/state/alerts.jsonl` — durable fail-loud alerts.
- `~/.wienerdog/logs/<job>/*.log` — per-run job logs (secret-redacted stream).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | docs/runbooks/incident.md | The general incident-drill runbook (house numbered-checklist format), covering the six A9 steps + the acceptance drill. |
| modify | docs/runbooks/secret-incident.md | Add one cross-link near the top: the secret leak is the credential-specific case of the general incident drill (link `incident.md`); for a general or suspected-compromise incident, start there. Do NOT rewrite its steps. |

### Exact contract — what `docs/runbooks/incident.md` must state

House format: a short intro paragraph, then a **numbered, ordered** imperative
checklist in plain language (define "revoke", "rotate", "managed block", "git
history" in one clause each — the audience is a knowledge worker). The steps are
ordered so nothing reads/commits/injects the compromised state while you clean
up. It must cover, **in this order**:

1. **Stop all schedules first — before anything else.** `wienerdog schedule
   list`, then `wienerdog schedule remove <name>` for every job (the nightly
   dream and any catalog routine). This satisfies the A9 acceptance "stops all
   jobs *before* credential rotation": no dream/routine can run, read, commit,
   or inject while you investigate. State that `remove` only unregisters — you
   re-add in step 6.

2. **Preserve the evidence metadata — copy it aside, do NOT delete it yet.**
   Before you change anything, snapshot the code-owned, secret-free run record
   so you can see what actually ran and when: copy `state/run-evidence.jsonl`,
   `state/alerts.jsonl`, and the relevant `logs/<job>/` files to a folder
   *outside* `~/.wienerdog` (e.g. `~/wienerdog-incident-<date>/`). Explain that
   these are bounded, redacted, code-owned records (no raw secrets, no raw brain
   output — ADR-0024), so they are safe to keep as your incident timeline. Do
   not run cleanup steps until this snapshot exists.

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

6. **Re-authorize — only after steps 1–5.** Re-add the schedules you removed
   (`wienerdog schedule add …` or the routine menu `/wienerdog-routines`), then
   run `wienerdog doctor` and confirm nothing is flagged (permissions, scheduler
   load).

7. **Run the acceptance drill — prove the old digest/managed block is gone.**
   A concrete, do-it-yourself verification that the compromised context is no
   longer injected:
   - Confirm the freshly-rendered `state/digest.md` no longer contains the
     compromised marker (a plain `grep` for the poisoned text finds nothing).
   - Confirm the CLAUDE.md / AGENTS.md managed block no longer contains it.
   - Start a **new** Claude Code / Codex session and confirm it does not surface
     the poisoned fact/instruction — the session-start digest is clean, and any
     unapproved identity change is byte-gated out (ADR-0021).
   Frame this as the drill A9 requires: if all three are clean, the old digest
   and managed block are provably no longer being injected.

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
      and covers, **in order**: (1) stop all schedules first, (2) preserve
      evidence metadata before any cleanup, (3) revoke+rotate credentials,
      (4) purge the compromised digest **and** managed block (fix source →
      `memory approve` → `sync`), (5) clean git history, (6) re-authorize,
      (7) the acceptance drill proving the old digest/managed block is no longer
      injected.
- [ ] Step order puts "stop all jobs" strictly before credential rotation
      (A9 acceptance).
- [ ] The evidence-preservation step names `state/run-evidence.jsonl`,
      `state/alerts.jsonl`, and `logs/<job>/`, and says to copy them aside before
      cleanup.
- [ ] The acceptance-drill step gives a concrete check (grep the fresh digest +
      managed block, start a new session) that the compromised marker is gone,
      and ties it to the ADR-0021 byte-gated injection.
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
