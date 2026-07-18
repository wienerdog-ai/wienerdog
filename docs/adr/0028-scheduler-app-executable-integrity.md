# ADR-0028: Scheduler, app, and executable integrity — structural executable pins, digest-bound job descriptors, and an out-of-tree launcher

Status: Accepted
Date: 2026-07-19

> **OWNER-APPROVED (2026-07-19).** The owner ratified the A7 architectural
> decision — how the unattended nightly run trusts its scheduler entry, its
> vendored app code, and the external executables it spawns. The four decisions
> below (structural executable pin; delete the test-exec seams rather than gate
> them; a canonical digest-bound job descriptor with fail-closed `sync`
> authorization; an out-of-tree launcher with an honest trust anchor) were each
> resolved as dated `OWNER-APPROVED` markers across the WP-154..WP-159
> walkthrough (2026-07-18, with the docs claim-wording and this ADR's number
> reconfirmed 2026-07-19). This ADR is the durable decision record the six specs
> cite; the specs remain the per-file design-of-record. Where a WP ruling later
> changes a detail here, it lands as a dated amendment to this ADR (the ADR-0024
> convention).

## Context

Wienerdog schedules its nightly **dream** (memory consolidation; later, routines)
with the OS-native scheduler (launchd / systemd user timers / Task Scheduler). The
registered OS entry is **static** — historically `node <core>/app/current/bin/
wienerdog.js run-job <name>`. What that fire actually *does* is resolved at run
time from two mutable inputs and one set of external executables, **none of which
was integrity-checked**. The 2026-07-15 security audit (action **A7**) enumerated
five findings, all reachable by a **scoped file write** under the user's own
account and **none requiring scheduler-registration privilege**:

- **F1 — static entry trusts mutable config.** The nightly slot reads the job's
  `run` action out of `~/.wienerdog/config.yaml`. Any process that can write
  `config.yaml` reroutes a pre-authorized nightly slot into persistent execution.
- **F2 / F3 — static entry trusts the mutable app tree.** The entry runs whatever
  Node code currently sits under `app/current`. A write under `app/<version>/**`
  or a repoint of the `app/current` symlink replaces the code the scheduler runs.
- **F4 — PATH-winnable bare-name spawns.** The dream spawns `claude`/`git`
  (later `codex`) **by bare name** through a clean job PATH that front-loads
  `~/.local/bin` (deliberately, so a native `curl | bash` Claude install stays
  authoritative for subscription auth, ADR-0009). `~/.local/bin` is commonly
  user/agent-writable; a planted fake `claude`/`git` wins resolution for every
  nightly job.
- **F5 — shelled test seams in the production dispatch path.** Four test-only
  environment seams (`WIENERDOG_RUNJOB_CMD`, `WIENERDOG_DREAM_CMD`,
  `WIENERDOG_SKIP_CONTAINMENT_PROBE`, `WIENERDOG_CONTAINMENT_PROBE_CMD`) let a set
  env var choose or disable what a job runs — one of them (`WIENERDOG_RUNJOB_CMD`)
  through the scheduler's only `shell:true` dispatch.

A7 is part of the **P1** hardening required before unattended/general use (the
audit's ordering: A7–A10 before unattended use). **IRON RULE (ADR-0004):
Wienerdog is just files** — no daemons, no process that outlives its job. Every
mechanism below is pure modules, on-disk artifacts, and verify-then-spawn logic
at existing spawn sites; it starts nothing that keeps running.

The audit's own boundary is inherited unchanged and stated in every WP: same-user
control of **both** the core and the OS scheduler can still replace both anchors.
A7 protects **scoped core writes** and **detects drift**; it is **not** a claim
against arbitrary same-user native malware — that is A12's territory. The precise,
honest form of that boundary is stated under **Honest boundary** below, after the
decisions it depends on.

## Decision

Wienerdog makes the scheduled fire trust only the **authorized, unmodified** app,
config, and executables, via four independently-reviewable mechanisms.

### 1. Structural executable pin — command path plus install dir, no content hash (WP-154)

At install/sync time Wienerdog resolves `claude`/`git`/`codex` against the clean
job PATH and records a **structural pin** in a code-owned 0600 store
(`<core>/state/exec-pins.json`): the PATH-resolved **command path** (e.g.
`~/.local/bin/claude`) and the **install dir** (the parent directory of the
command's resolved realpath, e.g. `~/.local/share/claude/versions`). Every nightly
spawn re-resolves the executable **live** and requires: (a) the live command path
equals the pinned command path; (b) the live realpath still resolves *into* the
pinned install dir (exact `dirname` string equality); (c) the live target passes
**structural verification** — regular file, execute bit, owner uid ∈ {current, 0},
and no group/other-writable ancestor dir (unless root-owned) from the file up to
`/`. Only then does it spawn — using the **live verified absolute realpath**, never
a stored path. Any check failing **fails safe**: the job refuses to spawn and tells
the user to re-pin via `wienerdog sync` after confirming the change is legitimate.
`node` is `process.execPath` (already absolute) and is not pinned.

**There is deliberately NO content hash / size / exact-realpath gate.** Claude Code
self-updates several times a day by writing a **new** version-named file under a
stable install dir and repointing the command symlink (observed live:
`~/.local/bin/claude → ~/.local/share/claude/versions/2.1.214`; four version files
in three days). A size/sha256 or exact-realpath gate would alarm on **every**
legitimate auto-update, training the user to ignore or disable the check — the
worst failure mode for a security control. The structural pin stays **silent across
auto-updates** (new file, same install dir) while still refusing the F4 plant (a
fake sits at a different command path, or resolves outside the pinned install dir).
The `version` field is recorded for human/debug context only and is **never
compared**.

The F4 spawn surface is closed everywhere it exists: the brain (`claude`/`codex`),
the vault commit (`git`), **and** the pre-dream **containment probe** — a
walkthrough gap fix, since `containment-probe.js` fell back to a bare `'claude'`
for its probe spawn, an identical F4 surface.

### 2. Delete the test-exec seams — do not gate them (WP-155)

The four F5 env seams are **removed from production code entirely**. A production
dispatch path contains **zero** branches that read a test env var to choose, skip,
or redirect what is executed. The earlier plan — gate the seams behind an explicit
`WIENERDOG_TEST=1` flag so they are inert in a real install — was **rejected as
circular**: the gate variable and the attack variable live in the **same write
surface** (a single `~/.config/environment.d/*.conf` write sets both), so gating an
env-var attack behind another env var is not a boundary. Tests keep working through
two *non-attacker-reachable* mechanisms: (1) **dependency injection** — the run-job
fake becomes a JS-only `opts.resolveCommand` (like the existing `opts.profile`),
and the dream/probe gate becomes a JS-only `dream.run(argv, opts)` argument the CLI
entry never passes; (2) the **WP-154 pinned front door** — subprocess dream tests
install their fake brain *legitimately* as a pin-store entry pointing at the fake
executable, so the real `loadPins → verifyPin → resolvePinnedSpawn → spawn` path
runs unmodified. The scheduler's only `shell:true` dispatch dies with the seam:
after this WP, **every** dispatch is `shell:false`, and no shipped file reads an
environment variable to decide what binary to run or whether the containment
self-check runs. The A7 acceptance "production test command overrides are inert
without an explicit test build and remain `shell:false`" is satisfied by
**nonexistence**, which is strictly stronger than inertness.

### 3. Canonical digest-bound job descriptor plus fail-closed sync authorization (WP-156)

Each scheduled job gets a **canonical job descriptor** — a code-owned,
deterministic record of exactly what the job is authorized to run — written at
schedule/sync time and re-derivable from live inputs so a later comparison reveals
drift. Its fields (canonical field order; `canonicalize` sorts keys, so document
order is non-normative):

```jsonc
{
  "schema": 1,
  "job": "dream",
  "run": "builtin:dream",          // exact config `run` action
  "profileId": "dream",            // code-owned capability profile id
  "promptHash": "sha256:…",        // builtin prompt template ⊕ vendored skill body hash
  "timeoutMs": 1200000,            // EFFECTIVE dream watchdog + lock deadline (cfg.timeoutMs)
  "model": "sonnet",               // exact config `dream_model` put into `--model`; null when unset
  "vaultRoot": "/Users/me/wienerdog",
  "node": "/…/bin/node",           // process.execPath
  "exec": {                        // WP-154 pins — STABLE identity fields ONLY
    "claude": { "commandPath": "…", "installDir": "…" },
    "git":    { "commandPath": "…", "installDir": "…" }
    // `version` and any realpath are EXCLUDED so the digest survives auto-updates
  },
  "appRelease": {
    "version": "0.4.1",
    "treeDigest": "sha256:…",      // content address of app/current (sorted per-file hashes)
    "stance": "prod"               // "prod" | "dev"
  }
}
```

The descriptor is serialized canonically (recursively key-sorted, no whitespace
variance) and reduced to a **descriptor digest** (sha256). The ratified rule is
**"everything that shapes the 03:30 spawn argv is digest-covered, no exceptions."**
Two fields were added during the walkthrough to honor that rule exactly: `model`
(it flows into the brain `--model` argv *and* the containment probe, yet was absent
from an earlier draft — a `dream_model` edit would have taken effect silently) and
the **effective** `timeoutMs` (an earlier draft mis-sourced the timeout from
`job.timeoutMinutes`, the fixed registration constant governing only the *outer*
run-job watchdog; the value that actually bounds the nightly brain and the run lock
is `cfg.timeoutMs` from `readDreamConfig`, the top-level `dream_timeout_minutes`
key — so the field had been protecting a constant while the real timeout drifted
freely). The pin's `version`/realpath are deliberately **excluded** from `exec` so
a Claude auto-update does not drift the digest; the pin's structural verification
still runs at spawn time.

**Fail-closed `sync` authorization.** A runtime edit to `config.yaml` or the app
tree does **not** change what the nightly job executes until an explicit
`wienerdog sync` re-derives and re-binds the digest. At fire time, **any**
descriptor-digest mismatch ⇒ a durable alert + **zero model spawn**. There is **no
soft fallback** to the stored descriptor and **no "run anyway"** path; the single
remedy is always `wienerdog sync`. The UX cost is accepted and stated plainly: a
legitimate hand-edit of `config.yaml` **without** a follow-up `sync` makes the next
scheduled dream refuse with a clear mismatch alert — **one skipped, alerted night,
not silent degradation.** WP-156 builds the descriptor + drift primitive; the
enforcement (§4) lives in the launcher.

### 4. Out-of-tree launcher plus an honest trust anchor (WP-157)

A **minimal launcher lives OUTSIDE the mutable app tree** at
`<core>/launcher/launch.js`, placed at vendor time like the PATH shim. Every OS
scheduler entry is rewritten to invoke the launcher with the descriptor path and
its expected digest bound into the entry arguments
(`node <launcher> <name> --descriptor <path> --expect-digest <digest>`). Before it
spawns Node or the model, the launcher **verifies**: (a) `app/current`
**containment and ownership** — resolves inside `<core>/app`, user-owned, not a
symlink out of root; (b) **app content address** — the live `app/current` tree hashes to the
descriptor's `appRelease.treeDigest`; (c) **descriptor digest** — the re-derived
descriptor digest equals the entry-bound `--expect-digest` (catches a `config.yaml`
`run`/`model`/`timeout` rewrite); (d) **prod/dev stance** — a `prod` entry must
resolve to a prod app tree and a `dev` entry to a dev checkout, so a planted `.git`
cannot downgrade a prod install to the unverified `dev` path. Any mismatch ⇒ a
fixed durable alert, **zero** model/Node-app spawn, non-zero exit. The vendored
update is hardened alongside: the published version dir is made **read-only** after
the atomic publish, and an interrupted update leaves the **previous valid**
`current` intact. Consistent with ADR-0004, the launcher **runs and exits with each
fire** — it is not a daemon.

The version-dir **layout** is unchanged: verification is content-addressed at fire
time (treeDigest vs descriptor), so the dir *name* decides nothing. Renaming to
hash-named `app/<hash>/` dirs was **rejected** (see Alternatives).

## Honest boundary (the A7 residual)

The launcher is itself a **core file** at the same write surface as the app tree it
guards. An earlier draft claimed an attacker would need to rewrite "the OS entry
file AND the launcher/app" — that was **wrong** and is corrected here: because the
entry-bound `--expect-digest` is interpreted *by* the launcher, **rewriting the
launcher alone defeats this layer**, with no OS-entry write required. The precise,
honest claim:

- A **core-wide write primitive** — anything that can overwrite
  `<core>/launcher/launch.js` (arbitrary same-user write anywhere under `<core>`) —
  defeats this layer **alone**. That adversary class is **A12's** territory
  (arbitrary same-user native malware), not A7's.
- What A7 protects is the **strictly narrower** class of **scoped writes that reach
  `config.yaml`, the app tree, and/or the install manifest but NOT the launcher
  file** — an agent session with vault/config write access, a subverted routine, a
  config-only primitive. Against that class the guarantee is precise and holds:
  because the launcher (a *different* file from both the app tree and `config.yaml`)
  re-derives and checks the descriptor digest against the value bound into the OS
  entry, a **`config.yaml` + manifest rewrite alone can never make a drifted state
  verify** — the launcher catches the drift and refuses.
- For the **executable** anchor, the same shape holds: the pin, captured from the
  legitimate install environment, records the real executable's command path +
  install dir; a later-planted fake sits at a different command path or resolves
  outside the pinned install dir and is refused. **In-place substitution** —
  overwriting the real, user-owned target file at its unchanged path — is **not
  detected** (no content hash, by design); an attacker with that write power could
  equally rewrite the pin store itself, so a hash would add alarm noise, not
  protection. That attacker class is A12's.

No sentence anywhere (docs, README, VISION) may overreach this: the scheduled run
is **not** tamper-proof against same-user native code, and the launcher is **not**
protected against a write that reaches the launcher file.

## Consequences

- The nightly fire trusts only the **authorized, unmodified** app + config +
  executables. A scoped `config.yaml`/app/`~/.local/bin` write is **caught and
  refused** rather than silently executed — the defining P1 gap for unattended use.
- The dispatch code is now literally "just files" (ADR-0004) down to the seam
  level: no shipped file turns an environment variable into a chosen executable or
  a skipped security check, and no `shell:true` dispatch remains in the scheduler.
- **Silent-across-auto-update is a deliberate property, not an omission.** Claude's
  multi-daily auto-update passes with no alert; only an install-*method* change (a
  moved install dir, e.g. native → Homebrew) fails safe. Accepted consequence:
  Homebrew keeps binaries in version-named Cellar dirs, so an explicit
  `brew upgrade git` moves the install dir and the next dream fails safe until
  `wienerdog sync` — acceptable, because brew upgrades are explicit user actions.
- **Fail-closed has a stated UX cost:** a hand-edit of `config.yaml` without a
  follow-up `sync` costs one skipped, alerted night. This is chosen over any soft
  fallback, which would split the source of truth inside the security layer.
- **A Claude-version bump is safe by construction** for the digest (version/realpath
  excluded from `exec`) while still structurally verified at spawn; the descriptor
  digest changes only on the things that actually shape the spawn (`run`, `model`,
  effective timeout, pin identity, app bytes).
- **The launcher is a secondary anchor, not a root of trust.** Its value is that a
  scoped write *to the app tree* is *caught* rather than executed; it does not
  defend itself against a write that reaches the launcher file. That residual is the
  explicit hand-off to A12, and the documented next increment ("2b") below.

## Documented strengthening path ("2b") — considered, deferred to A12

The residual above (a core-wide write to `launch.js` defeats this layer without
touching the OS entry) has a known, deliberately deferred hardening. Move the trust
anchor off the on-disk launcher file and into the OS entry the scheduler already
treats as authoritative: inline a **~10-line bootstrap** into the OS entry argv
itself (`node -e '<bootstrap>'`) that reads `<core>/launcher/launch.js` **once**
into memory, computes `sha256` over that buffer, compares it to a **launcher-digest
embedded in the entry**, and on match executes the launcher **from that same
in-memory buffer** — no second disk read, so it is **TOCTOU-free**; on mismatch it
writes to stderr and exits non-zero with **zero spawn**. This raises the bar so
overwriting `launch.js` alone no longer suffices — an attacker would then *also*
have to rewrite the OS entry (which, unlike the old wrong sentence, this design
legitimately requires).

**Costs, recorded so the deferral is honest:**

1. every launcher change requires an OS-entry rewrite + scheduler reload (entry
   churn on each `sync` that touches the launcher);
2. the refuse path **cannot** append the durable alert (the alert code lives in the
   unverified launcher/app files it is refusing to trust) — stderr + non-zero exit
   only, no `appendAlert`;
3. the run-from-buffer pattern (executing a module from an in-memory buffer without
   re-reading disk) needs careful review;
4. the inline code must be escaped per-platform (launchd plist array vs systemd
   `ExecStart` vs Windows XML `<Arguments>`) — small but real.

**Revisit trigger: A12** — the audit item that owns arbitrary same-user
native-malware defenses. This path is **not** built now; it is recorded here as the
documented next increment.

## Alternatives considered

- **Content-hash / size pin for executables.** Rejected: Claude Code auto-updates
  several times daily by writing a new version file, so any content/size gate alarms
  on every legitimate update and trains the user to disable the check. The structural
  pin (command path + install dir) stays silent across auto-updates yet refuses the
  F4 plant.
- **Exact-realpath pin.** Rejected for the same reason: the realpath changes on every
  auto-update (`…/versions/2.1.213` → `…/versions/2.1.214`), so pinning it turns
  updates into alarms. The install *dir* is the stable structural anchor.
- **Gate the test-exec seams behind `WIENERDOG_TEST=1`.** Rejected as circular: the
  gate variable and the attack variable share the same write surface (one
  `environment.d` file sets both), and it leaves a live `shell:true` code path.
  Deletion removes the sink entirely.
- **Full inline entry verifier** (inline the *entire* verification logic into the OS
  entry argv, not just a launcher-digest bootstrap). Rejected: Windows caps a command
  line at ~8191 chars; the logic would be untestable/unlintable code embedded in
  platform templates; the per-platform escaping diverges (plist vs systemd vs XML);
  and every verification fix would churn the OS entry and force a scheduler reload.
  The out-of-tree launcher file keeps the logic testable and lintable; the *bootstrap*
  variant ("2b") inlines only a fixed ~10-line digest check, and even that is deferred.
- **Hash-named version dirs (`app/<hash>/`).** Rejected: verification is already
  content-addressed at fire time (treeDigest vs descriptor — the dir name decides
  nothing at verify time); renaming would churn uninstall/manifest paths and destroy
  at-a-glance debuggability ("which version am I running") for no meaningful attacker
  cost. ADR-0013's version-named layout stays.
- **Soft fallback on a descriptor mismatch** (run the stored descriptor, or "run
  anyway" with a warning). Rejected: it splits the source of truth inside the very
  security layer meant to be authoritative. A mismatch is fail-closed; `sync` is the
  one remedy.

## Relations to prior ADRs

- **Distinct from ADR-0027 (A8 scheduler *unload*).** ADR-0027 re-derives the
  *uninstall* unregister command from platform + validated identity and never
  executes a manifest-stored argv (backward integrity, at uninstall). ADR-0028 is
  *forward* integrity at fire time (what the scheduled job runs). The owner rejected
  "extend ADR-0027"; A7 gets its own ADR (this one).
- **Keeps ADR-0009's PATH ordering.** The job clean PATH still front-loads
  `~/.local/bin` ahead of system dirs (so a native Claude install stays authoritative
  for subscription auth). The fix for F4 is the **pin**, not a PATH reorder.
- **Keeps ADR-0013's vendored-install layout.** Version-named `app/<version>/` dirs +
  the atomic `current` symlink are unchanged; A7 adds a read-only version dir after
  publish and content-addresses the tree, but does not rename dirs.
- **Honors ADR-0004 (no-daemon invariant).** The launcher and the pins are files and
  verify-then-spawn logic; the launcher runs and exits with each fire. Nothing added
  here outlives its job.

## Deviations from the 2026-07-15 ACTION-LIST A7 wording

The ACTION-LIST snapshot (`docs/security-audit/2026-07-15/ACTION-LIST.md`) stays
**unedited**; the deliberate deviations decided in the walkthrough live here and in
the specs:

- **"verify … version/hash. Spawn absolute paths." → structural pin, no content
  hash.** The pin is command path + install dir + structural checks (regular file,
  owner, mode, ancestor-writable); `version` is informational only. Rationale: silent
  across Claude's multi-daily auto-updates (see Decision 1 / Alternatives).
- **"Legitimate executable updates fail safe and require an explicit repin/sync" →
  auto-updates pass silently; only install-method changes fail safe.** A new version
  file under the same install dir passes with no prompt; a moved install dir
  (install-method change, e.g. → Homebrew) fails safe and requires `wienerdog sync`.
- **"Production test command overrides are inert without an explicit test build" →
  deleted, not merely inert.** There is no test build flag; the seams do not exist in
  production code. Nonexistence is strictly stronger than inertness (see Decision 2).
- **"release/tree signature or independently anchored digest" / "Valid signed
  update…" → digest-anchored update.** A7 takes the **independently-anchored-digest**
  branch the ACTION-LIST itself offered as the alternative, not code signing: the
  descriptor digest bound into the OS entry is the independent anchor; no signing key
  or PKI is introduced.

## Implementation mapping (WP-154..WP-159)

- **WP-154** — `src/core/exec-identity.js`: resolve/verify/pin `claude`/`git`/`codex`
  by command path + install dir; fail-safe spawn of the live verified absolute
  realpath at the brain, the git commit, and the containment probe.
- **WP-155** — delete the four test-exec/probe env seams from production dispatch;
  DI (`opts.resolveCommand`, `dream.run(argv, opts)`) + pinned-fake substitution;
  `shell:false` across the scheduler path.
- **WP-156** — `src/scheduler/descriptor.js`: build/canonicalize/digest/write/
  re-derive the canonical job descriptor (run, profile, prompt/skill hash, effective
  `timeoutMs`, `model`, vault root, pin identities, app `treeDigest` + stance) at
  schedule/sync; the drift primitive for fail-closed authorization.
- **WP-157** — `src/scheduler/launcher.js` at `<core>/launcher/launch.js`: fire-time
  verify of containment/ownership, app treeDigest, entry-bound descriptor digest, and
  prod/dev stance before any spawn; read-only version dir after atomic publish; OS
  entries rewritten to invoke the launcher with the descriptor path + `--expect-digest`.
- **WP-158** — `tests/scenarios/a7-integrity/`: end-to-end negative harness driving
  the real launcher/pin path against the tamper matrix (config `run`/`model`/`timeout`
  rewrite, app mutation/repoint/out-of-root, prod→dev stance downgrade, manifest+config
  rewrite, PATH-fake, pin structural failure, update atomicity, seam-nonexistence) with
  a recording fake-spawn + a non-vacuity baseline.
- **WP-159** — honest A7 docs: THREAT-MODEL, ARCHITECTURE, GLOSSARY, README, VISION,
  and the integrity runbook; every claim traces to a shipped mechanism and the A12
  same-user-native residual is stated plainly.
