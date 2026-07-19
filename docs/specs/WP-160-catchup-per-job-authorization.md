---
id: WP-160
title: Catch-up per-job authorization — bind an authorized per-job digest map into the catch-up OS registration; verify each due job before it runs
status: Draft
model: opus
size: M
depends_on: [WP-156, WP-157]
adrs: [ADR-0004, ADR-0013, ADR-0028]
branch: wp/160-catchup-per-job-authorization
---

# WP-160: Catch-up per-job authorization (audit A7 — catch-up hardening)

## Context (read this, nothing else)

Wienerdog runs missed scheduled jobs via a **catch-up** entry (launchd
`RunAtLoad` / systemd `Persistent=true` / a Windows catch-up task) so a job the
machine slept through still runs within an hour of wake (M6). **IRON RULE
(ADR-0004): Wienerdog is just files** — no daemons; the launcher/catch-up runner
runs and exits with each fire.

WP-157 built the out-of-tree launcher and fire-time integrity for **normal**
per-job fires: each per-job OS entry carries `--expect-digest <d>` and the
launcher refuses if the re-derived descriptor digest ≠ that entry-bound value.
**Catch-up was left incomplete on purpose (WP-157 is an explicitly-incomplete
intermediate for this path).** Today the catch-up launcher path verifies only the
app-tree digest and then spawns `node bin/wienerdog.js run-job --catch-up`, whose
catch-up logic reads the jobs to run out of the **mutable** `config.yaml` and
calls `runJob` directly. So a `config.yaml` edit that a normal fire *refuses*
(digest mismatch) is *executed* by the next catch-up — a full bypass of A7's
fail-closed authorization (audit finding, WP-159 review HIGH).

The naive fix — read each job's `--expect-digest` back out of its per-job entry
**file** (LaunchAgents plist / systemd user unit / retained Windows XML) — is
**wrong**: those files are user-writable **source** artifacts, not the loaded
scheduler registration. An in-scope attacker edits `config.yaml` **and** the
per-job source file to carry the newly-derived digest **without reloading** the
scheduler; normal fires stay bound to the old *loaded* registration and refuse,
but catch-up reads the forged file and runs. (Reloading/re-registering requires
scheduler-registration capability = **outside A7's scope** = A12 — which is
exactly why the loaded/registered state is the only trustworthy anchor.)

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH the
core and the OS scheduler can still replace both anchors (A12). A7 protects
**scoped core writes** and **detects drift**; this WP closes the catch-up bypass
for the scoped-write class only.

> **ADR note:** `ADR-0028` records the A7 architectural decision (owner-approved
> 2026-07-19), amended 2026-07-19 (fix-pass round 3): catch-up authorization is
> **PENDING until this WP** and is delivered here.

## Current state

- `src/scheduler/launcher.js` `verifyCatchup(p, expectDigest, env, platform)`
  (WP-157) verifies containment + app-tree digest against a single
  `--expect-digest`, then `main` spawns `node currentBin run-job --catch-up`. No
  per-job descriptor is consulted.
- `src/scheduler/generators.js` renders the catch-up entry
  (`catchupPlist` / `windowsCatchupTaskXml` / the systemd persistent timer) with
  argv `[node, launcher, '--catch-up', '--expect-digest', <appTreeDigest>]`
  (post-WP-157). Per-job entries carry the per-job `--expect-digest` (WP-157).
- `src/scheduler/descriptor.js` (WP-156, incl. its fix-pass amendments):
  `buildDescriptor`, `deriveDescriptorDigest`, and the digest now cover
  `run`/`model`/`timeoutMs`/`vaultLayout`/`maxInputBytes`/outer-timeout/`schedule`
  (`at`+tz)/exec pins/prompt hash/app release. The digest is the per-job
  authorization anchor.
- `src/cli/run-job.js` catch-up runner reads jobs from `config.yaml` and calls
  `runJob` directly (the bypass).
- `src/scheduler/launcher.js parseArgv` (WP-157) is schema-aware: `--catch-up`
  boolean; `--descriptor`/`--expect-digest` value-taking. This WP adds one more
  value-taking flag (`--job-digests`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | At registration, bind the canonical per-job digest map into the **catch-up entry's registered arguments** (`--job-digests <canonical map>`), populated under registration privilege — the loaded/DB state, never re-read from an editable file per fire. Escape per platform as today. |
| modify | src/cli/schedule.js | Compute the per-job digest map (`{jobName: deriveDescriptorDigest(paths, job)}` over all configured jobs) at register/repoint time and pass it to the catch-up renderer. |
| modify | src/scheduler/launcher.js | `parseArgv` recognizes `--job-digests` (value-taking); `verifyCatchup` accepts + forwards the map; `main` passes it through to the catch-up runner argv. The launcher NEVER reads a per-job entry file to obtain a digest. |
| modify | src/cli/run-job.js | The catch-up runner, per due job, re-derives `deriveDescriptorDigest(paths, job)` and compares it to the **argv-supplied** map entry; mismatch / job absent from the map ⇒ refuse that job, `appendAlert`, **zero spawn**; match ⇒ run. Never execute a job's `run`/`at` straight from mutable config without this check. |
| create | tests/unit/catchup-authorization.test.js | The negatives below. |
| modify | tests/unit/scheduler-generators.test.js | Assert the catch-up entry carries `--job-digests` with a canonical map. |

### Exact contracts

**Canonical per-job digest map** (bound into the catch-up entry argv at
registration): a canonical-JSON object `{ "<jobName>": "sha256:…", … }` over
**every configured job**, each value = `deriveDescriptorDigest(paths, job)` (the
same digest the per-job entry binds). Canonical = key-sorted, no whitespace
variance — deterministic. Small (one entry per job).

**Anchor rule (the whole point).** The authorized digest for a job on the
catch-up path is read **only** from:
1. the `--job-digests` map delivered via the launcher's argv (which the OS passes
   from the **loaded/registered** catch-up entry), OR
2. (implementer's choice, recorded) a **live-registration query** —
   `launchctl print gui/<uid>/<label>` / `systemctl --user show` /
   `schtasks /query /xml` — which reads the loaded state / task DB.

It is **never** read from the per-job entry **file** on disk, nor from
`config.yaml`. A forged per-job source file (edited without reload) must not
affect the decision.

**Catch-up runner algorithm** (`run-job.js`, per due job `j`):
```
authorized = map[j.name]                 // from argv (loaded state)
if (authorized === undefined) → refuse j (alert, zero spawn)
live = deriveDescriptorDigest(paths, j)  // j from validated config
if (live !== authorized) → refuse j (alert, zero spawn)
else → runJob(j)
```
`j.at` (its schedule) is part of the descriptor digest (WP-156), so an `at`
rewrite drifts `live` ≠ `authorized` ⇒ refuse — the due-time decision is
authorized, not just the content.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only.
- **Loaded-state, not source-file, is the anchor** — the single load-bearing
  invariant. If you find yourself reading a `.plist`/`.service`/`.xml` file to
  get a digest, STOP: that is the vulnerability this WP exists to close.
- **Verify-to-use residual (inherited, A12).** As with the launcher's normal
  path, the catch-up runner spawns `node` against the on-disk app tree after
  verification — the reopen race is the documented A12 residual (ADR-0028), not
  closed here.
- macOS/Windows catch-up negatives are required (the platforms where catch-up is
  most exercised).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The authorized per-job digest on the catch-up path comes ONLY from the
      loaded/registered catch-up entry (argv map or live-registration query),
      never from a per-job entry file or `config.yaml`.
- [ ] A `config.yaml` `run`/`model`/`at`/… rewrite ⇒ the catch-up runner refuses
      that job (alert, zero spawn), matching the normal-fire refusal.
- [ ] Editing a per-job entry **source file** (without reloading the scheduler)
      does NOT let catch-up run a drifted job.
- [ ] A job absent from the bound map is refused, not run from config.

## Acceptance criteria

- [ ] **[bypass closed]** With the catch-up map bound, rewriting `config.yaml`
      `run` for the dream job ⇒ the catch-up runner refuses it (zero recorded
      spawn, durable alert).
- [ ] **[file-forge]** Rewriting `config.yaml` `run` AND the per-job source entry
      file to carry the newly-derived digest, WITHOUT reloading the scheduler ⇒
      still refused (the loaded map is the anchor).
- [ ] **[due-time]** An `at`-only rewrite of an authorized job ⇒ refused (not run,
      not silently suppressed).
- [ ] macOS and Windows catch-up negatives execute (not just POSIX).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "catchup-authorization|scheduler-generators"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The normal per-job fire path — **WP-157** (this WP mirrors its anchor for
  catch-up).
- The descriptor fields / digest content — **WP-156** (this WP consumes
  `deriveDescriptorDigest`).
- The verify-to-use reopen race — documented A12 residual (ADR-0028).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/160-catchup-per-job-authorization`; conventional commits; PR titled
   `feat(security): catch-up per-job authorization via loaded registration (WP-160)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
