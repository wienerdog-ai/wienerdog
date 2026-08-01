# ADR-0028: Scheduler, app, and executable integrity — structural executable pins, digest-bound job descriptors, and an out-of-tree launcher

Status: Accepted
Date: 2026-07-19

OWNER-SIGNED 2026-07-25

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
executable, so the real pinned dispatch (`spawnPinned*`, internally
`loadPins → verifyPin → bind → spawn`) runs unmodified. The scheduler's only `shell:true` dispatch dies with the seam:
after this WP, **every** dispatch is `shell:false`, and no shipped file reads an
environment variable to decide what binary to run or whether the containment
self-check runs. The A7 acceptance "production test command overrides are inert
without an explicit test build and remain `shell:false`" is satisfied by
**nonexistence**, which is strictly stronger than inertness.

### 3. Canonical digest-bound job descriptor plus fail-closed sync authorization (WP-156)

Each scheduled job gets a **canonical job descriptor** — a code-owned,
deterministic record of exactly what the job is authorized to run — written at
schedule/sync time and re-derivable from live inputs so a later comparison reveals
drift. **[R15] The single authoritative schema is WP-156's "Descriptor object"**;
this block mirrors its complete field set (canonicalize sorts keys, so order is
non-normative):

```jsonc
{
  "schema": 1,
  "job": "dream",
  "run": "builtin:dream",          // exact config `run` action
  "profileId": "dream",            // code-owned capability profile id
  "promptHash": "sha256:…",        // builtin prompt template (rendered w/ effective vaultLayout) ⊕ skill body hash
  "model": "sonnet",               // config `dream_model` → `--model`; null when unset
  "timeoutMs": 1200000,            // int ms — EFFECTIVE INNER dream watchdog + lock deadline (cfg.timeoutMs)
  "outerTimeoutMs": 1200000,       // int ms — EFFECTIVE OUTER run-job watchdog (resolved job.timeoutMinutes)
  "maxInputBytes": 8000000,        // int — config `dream_max_input_bytes`
  "vaultLayout": { },              // object — effective readVaultLayout(config), canonicalized
  "vaultRoot": "/Users/me/wienerdog",
  "home": "/Users/me",             // string abs — BOUND authorized home
  "schedule": { "at": "03:30", "timezone": "local" },  // effective schedule + timezone (from job.at)
  "node": "/…/bin/node",           // process.execPath
  "exec": {                        // WP-154 pins — STABLE identity fields ONLY
    "claude": { "commandPath": "…", "installDir": "…" },  // REQUIRED
    "git":    { "commandPath": "…", "installDir": "…" },  // REQUIRED
    "codex":  { "commandPath": "…", "installDir": "…" }   // OPTIONAL (only if a codex job is authorized)
    // `version`/realpath EXCLUDED so the digest survives auto-updates
  },
  "appRelease": {
    "version": "0.4.1",
    "treeDigest": "sha256:…",      // content address of app/current (injective encoding)
    "stance": "prod"               // "prod" | "dev"
    // DEV reduction: stance:"dev" ⇒ appRelease reduces to {stance,root}, EXCLUDING
    // treeDigest+version; all config-shaped fields above stay in the dev digest.
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

## Amendment (2026-07-19) — fix-pass corrections from the double-gate review

The In-Review WP-154..WP-159 implementations were reviewed (wd-reviewer + per-spec
Codex) and found to have a critical + several high defects, all in the recurring
**fail-open** class. The decisions below refine — not reverse — this ADR. They are
implemented as dated amendments in the six specs and detailed in `FIX-PLAN.md`.

1. **Executable pin is fail-CLOSED on tamper (Decision 1 refinement).** A
   missing/unreadable/corrupt/foreign `exec-pins.json` no longer degrades to a bare
   live PATH resolve. The resolver distinguishes *absent* (ENOENT — genuine
   first-run self-heal only) from *tampered* (unreadable/corrupt/foreign schema —
   **refuse**). Deletion-after-sync on the **unattended** path is caught by the
   descriptor digest (the pins are folded into it; a deleted store ⇒ empty `exec`
   ⇒ digest mismatch ⇒ launcher refuses), because the OS-entry-bound digest is the
   one anchor an in-scope (scoped-write) attacker cannot forge. The attended manual
   `dream` self-heal on a genuinely-absent store is retained and stated as an
   honest residual (attended, out of the unattended threat model).
   **Round-2 refinement:** a *present* store missing the *requested* pin also fails
   closed (a valid **partial** store — e.g. git pinned, claude absent — otherwise
   let a later-planted `~/.local/bin/claude` digest-match and live-resolve, keeping
   the bare-PATH bypass). Descriptor binding for the dream job **requires both
   claude and git pins** present, not merely a non-empty `exec` map; codex stays
   optional until a codex job is authorized.

2. **The interpreter is verified, not just the script (Decision 1 refinement).**
   Structural verification of a pinned `#!/usr/bin/env node` script (the shape of
   `claude`/`codex`) did not cover the interpreter, which `env` re-resolves from the
   job PATH. The supported interpreter set is: **native binary** (no shebang) →
   spawn the verified realpath directly; **node shebang** (`env node`, `-S node`,
   `<abs>/node`) → spawn `process.execPath <script>`; **absolute non-node
   interpreter** (`#!/abs/interp`) → `verifyExecutable(abs)` then spawn it, else
   THROW. **[R10] A PATH-resolving non-node env shebang (`#!/usr/bin/env
   <non-node>`) FAILS CLOSED (THROW)** — it is **not** resolved through the job
   PATH, because the job PATH front-loads attacker-writable `~/.local/bin` and
   structural verification would pass a statically-planted fake interpreter there,
   re-introducing the static F4 PATH hijack. claude/codex are node and git is
   native, so this branch is unexercised today; failing closed costs nothing now
   and removes the hijack surface if an upstream wrapper ever changes. No PATH
   re-resolution of any interpreter. **[R11→R13] This four-case rule lives in ONE
   module-internal helper (`bindInterpreter`) invoked only inside the encapsulated
   `spawnPinnedSync`/`spawnPinned` API**, which every consumer site uses — fire
   (brain/validate/probe), pin creation (`buildPin`/`probeVersion`, incl.
   `createPins`, its dry-run, and adopt's preflight), and `captureClaudeVersion`.
   No consumer holds a raw path; the `--version` probe runs
   `process.execPath <script> --version` for node shebangs, and an unsupported
   PATH-resolving interpreter is REFUSED at pin creation **without executing the
   target** (closing the hijack class at pin-creation time, not only at fire time).
   **[R13] The interpreter must itself be NATIVE** — an absolute non-node
   interpreter that has its OWN shebang fails closed (else it recursively
   PATH-resolves its own `#!/usr/bin/env x`).
   **[R13/R15] Terminal invariant — EXECUTION-only encapsulation (structural, not a
   textual scan, and not overclaimed):** *a pinned target is EXECUTED only through
   `spawnPinnedSync`/`spawnPinned`, which resolve → verify → bind-interpreter →
   spawn.* **[R16] SANITIZED-BY-CONSTRUCTION return surface — no raw child, event,
   or error (sync or async) reaches a caller; a pinned target's realpath never
   leaves `exec-identity.js`.** `spawnPinnedSync` returns `{status, signal, stdout,
   stderr}` (no `spawnfile`/`spawnargs`; error text sanitized to the exec `name`).
   `spawnPinned` returns a facade that **never forwards a raw Node child, native
   emitter, event, or error**: `stdout`/`stderr` byte streams; `on`/`once` re-emit
   only freshly-constructed `exit`→`{code,signal}` and `error`→a NEW `Error` with an
   approved code + a `name`-only message and **no `.path`/`.spawnargs`/`.spawnfile`/
   `.syscall`/`.cmd`/`.cause`** (closes the async-error leak: an invalid `cwd`
   otherwise surfaces the realpath via the raw child `error`, acute for node-shebang
   targets whose `spawnargs[0]` is the pinned realpath). The exec-path helpers
   (`resolvePinnedSpawn`, `bindInterpreter`,
   `resolveExecutable`, `verifyExecutable`, `verifyPin`, `buildPin`, `probeVersion`)
   are **module-internal** (verified: no external importers). `loadPins`/`createPins`
   stay exported because they return path-bearing pin state as **DATA** (for the
   descriptor digest + doctor/status) that no consumer spawns — so the honest
   invariant is "executed only via `spawnPinned*`," NOT "no function returns a path"
   (that overclaim was corrected in R15). A fixed-file textual scan could never
   cover future modules or evasions — **encapsulation is the guarantee**; a sound
   **boundary** canary + zero-execution site tests enforce it: (a) the exec surface's
   public exports equal an EXACT path-free, **seam-free** list; (b) no module outside
   `exec-identity.js` imports an internal exec-path helper; (c) no module feeds a
   pin-state return into a `spawn*`/`exec*`; (d) **[R15] no public exec-surface
   function accepts a spawn/exec callback param** (an injected callback would receive
   the bound command+args and leak the path — the real spawn is module-private);
   (e) **[R16] the async facade proxies no raw child event and its `error` payload
   exposes no `path`/`spawnargs`/`spawnfile`/`syscall`/`cause`** (forced via an
   invalid `cwd`/ENOENT target). (Manual site enumeration had kept
   missing sites — `captureClaudeVersion` was the 5th, found
   after R11 claimed "every site"; encapsulation removes the need to enumerate.)

3. **Everything shaping the spawn is digest-covered — now including `vault_layout`
   and the other mutable inputs (Decision 3 refinement).** `vault_layout` (which
   changes the model's authorized write locations via the dream prompt +
   `WIENERDOG_DREAM_LAYOUT` env) was omitted; it is added as a first-class field
   `vaultLayout`. **Round-2 refinement:** an audit found more uncovered mutable
   inputs — `dream_max_input_bytes` (corpus size), the effective **outer**
   watchdog timeout, and **[R3] the job's schedule (`at` + timezone semantics)**
   (previously omitted, so a schedule rewrite re-timed or suppressed a job with no
   drift) — are added to the digest too; and the test time/timeout ENV seams
   `WIENERDOG_FAKE_TODAY` and `WIENERDOG_RUNJOB_TIMEOUT_MS` (a test seam in the
   production dispatch path — same class as Decision 2) are **deleted** from
   production (folded into WP-155), after which the date derives from the system
   clock (not attacker-settable via env). **[R3] The scheduled execution
   *environment* is likewise a defined allowlist:** the ambient credential/config
   vars `CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`ANTHROPIC_API_KEY` are no longer
   inherited (an `environment.d`/`launchctl` write is in-scope) — the config roots
   are reconstructed deterministically to the canonical wienerdog-owned paths
   (bind the SOURCE in the descriptor if a custom root is honored, never the secret
   value) and the scheduled dream does not depend on an inherited API key
   (subscription auth, ADR-0009). **[R4] The absolute home** (the parent those
   roots hang off, previously `env.HOME||os.homedir()`) is itself bound — a
   digest-covered descriptor field set in the loaded OS entry — so a hostile
   ambient `HOME` cannot relocate the credential account with no drift. To keep
   dependency ordering sound, **WP-156 `depends_on: WP-155`** so the launcher
   (WP-157) cannot enforce before the seam deletions land. The app-tree digest encoding is made
   injective (canonical-JSON of sorted `[relpath, hash]` pairs; the prior
   `relpath\nhash\n` concat was collidable via newline filenames) — and, because
   the launcher keeps its **own** copy of the digest, **both** `descriptor.js` and
   `launcher.js` are changed in lockstep with a cross-implementation equality test.

4. **Pins are created before descriptors are written/bound (Decision 3/4
   interaction).** `sync` created pins *after* writing + digest-binding descriptors,
   so the first descriptor on a fresh install bound `exec:{}` and drifted once pins
   landed (nightly fail-closed until a 2nd sync). Ordering invariant: no descriptor
   is written and no entry digest bound before the current environment's pins exist.

5. **The scheduled node's environment is sanitized (Decision 4 refinement).**
   Inherited `NODE_OPTIONS`/`NODE_PATH` (code-loading vars an in-scope env write can
   set — e.g. `environment.d`, `launchctl setenv`) executed attacker code in the
   launcher's own node process before `launch.js` ran. The OS scheduler entries now
   clear these vars for the node they launch (launchd `EnvironmentVariables`,
   systemd `Environment=`), and the launcher passes a scrubbed env to its child
   spawn. **Round-2 refinement:** on Windows the env-clear must use a non-shell or
   fully-controlled bootstrap (a generated wrapper file, or PowerShell/absolute
   `cmd` with a proven token encoder) — inline `cmd /c` with only XML escaping was
   unsafe (`%VAR%` expansion / AutoRun in hostile paths).

6. **Catch-up per-job authorization — PENDING until WP-catchup-per-job-authorization (Decision 3/4
   refinement).** Catch-up verified only the app-tree digest and then ran jobs
   from mutable `config.yaml`, so a config change a normal fire refused was
   executed by the next catch-up. The fix binds an **authorized per-job digest map
   into the catch-up OS registration itself** (the loaded/registered args, or a
   live-registration query) — **never re-read from the editable per-job entry
   file**, which is a user-writable source artifact an in-scope attacker can forge
   without reloading the scheduler. **[R3] This is delivered by the materialized
   `WP-catchup-per-job-authorization` (Draft); WP-157 ships the normal per-job fire enforcement but leaves
   catch-up authorization PENDING, so catch-up is NOT yet fail-closed until WP-catchup-per-job-authorization
   lands** (WP-158/WP-159 `depends_on: WP-catchup-per-job-authorization`). Every verification exception (on
   both paths) becomes a durable alert + zero spawn (never a bare throw with no
   alert). **[R4] WP-catchup-per-job-authorization authorizes the union of bound ∪ configured jobs BEFORE
   deciding due-ness** (so an `at`-rewrite-to-future or a removal alerts rather
   than silently suppressing), and transports the per-job digest map as
   **base64url(canonical JSON)** with a bounded decoder (raw JSON argv is not
   platform-safe on Windows `CommandLineToArgvW` / systemd quoting). **[R8:#2]
   Platform contract:** the map + `run-job --catch-up` dispatch exist on **macOS**
   (`catchupPlist`) and **Windows** (schtasks ONLOGON+hourly) only — the platforms
   with a *separate* catch-up registration. **Linux has no catch-up map**: its
   per-job `.timer Persistent=true` replays the NORMAL per-job `.service`, already
   authorized by that job's own `--expect-digest` (WP-157); no all-job map, no
   duplicate dispatch. **[R5] Attended-authorization boundary:** only attended,
   user-invoked registration may mint or replace the catch-up authorization
   map/registration; **no nightly/runtime path may derive authorization from
   `config.yaml`.** In particular the post-success
   runtime backstop (`run-job.js` `ensureCatchup`) is removed — a nightly success
   must not re-bind the loaded map from a since-mutated config (else a statically
   added job B gets authorized after unrelated job A succeeds, with no
   scheduler-registration capability). **[R6/R7/R9:#3] Canonical ownership
   invariant (stated verbatim in ADR-0028, WP-catchup-per-job-authorization, and FIX-PLAN C8):** *All four
   attended, user-invoked callers — `sync`/`repointSchedules`, `schedule add`,
   `init`, `adopt` — may MINT/register the catch-up map from freshly-validated
   descriptors; `repointSchedules` ALONE owns repair + teardown; `schedule remove`
   delegates teardown to `repointSchedules`.* `reloadMissing` and `doctor` never
   mint or touch the catch-up entry (adopt does not call `sync`, so it is a
   first-class mint caller, never a retained source file or stale map). This gives
   the missing-registration case a coherent home without violating the
   attended-only-mint or the regenerate-don't-trust-source rules — so a missing
   catch-up registration is restored by one attended `sync` rather than staying
   unavailable and masking missed execution.

7. **Dev is a separate, runnable descriptor (Decision 3/4 refinement).** "Skip the
   tree digest but still compare the full descriptor digest" is self-contradictory
   (the full digest includes the tree digest) and, with dev's out-of-`<core>/app`
   vendoring and `.git`-as-a-file worktrees, made dev permanently non-runnable. Dev
   now binds a **dev digest = the COMPLETE descriptor with `appRelease` replaced by
   `{stance:'dev', root}` — excluding ONLY `treeDigest`+`version`; EVERY other field
   (incl. `schedule`, `home`, `node`, `profileId`) is RETAINED** (there is no
   "config-fields-only subset" — an omitted `schedule`/`home` would let a static
   `at`/home edit stay digest-equivalent on dev machines). Fire-time dev verifies
   that dev digest + a dev-specific containment (live `current` == bound root) +
   `.git`-dir-or-gitfile liveness. Dev stance is bound at registration, not read
   from a live `WIENERDOG_DEV` env at fire time.

### Residuals added to the Honest boundary (deferred to A12)

- **Verify-to-use (hash-then-reopen) race.** The launcher hashes the app tree,
  then reopens the same on-disk tree to `require` its verifiers and to spawn
  `bin/wienerdog.js`. Spawning `node` against an on-disk tree is intrinsically
  reopen-based; a TOCTOU-free design requires the deferred **"2b" in-memory
  bootstrap**. The in-scope A7 model (static scoped write, caught at fire) does not
  include an active concurrent writer racing at fire time — that is A12. Stated
  plainly in docs; not claimed as TOCTOU-free.
- **[R3] Heal verify→register race (WP-145).** The sync-time heal regenerates a
  canonical scheduler file, byte-verifies it, then `launchctl`/`schtasks`/`systemd`
  **reopen the pathname** to register it — a concurrent writer can swap the file
  between verify and register. Same class as the verify-to-use race above: a
  *static* planted file is defeated (regenerate-from-config, configured-jobs-only),
  but an active concurrent writer at heal time is A12. The heal does not claim the
  scheduler receives the exact verified bytes; the window is minimized.
- **[R9] Uninstall ancestor-replacement race (WP-144).** The uninstall reverser
  `fs.realpathSync`es a target and re-validates containment, but the subsequent
  path-based `fs` ops re-walk the pathname; an attacker who **renames an ancestor
  and replaces it with a symlink to an external tree between realpath and the op**
  redirects `rmSync`/`openSync` (Node has no `openat`/`unlinkat`; a native addon
  would violate ADR-0004). Same class as the two races above: the **static**
  in-place symlink swap is closed by realpath (+ `O_NOFOLLOW` on the final
  component), but an **active concurrent ancestor-rename at uninstall time** is
  A12. Not claimed as closed.
- The `makeTreeFilesReadOnly` control is **files-only** (best-effort friction,
  defeated by a same-user `chmod`); the app-tree digest is the real guard.
- **[A7 hardening pass] Catch-up token-absent — a pre-WP registration never
  re-synced is a BOUNDED residual, not blanket-A12.** The token-absent catch-up
  disposition splits: *stripping* the bound `--job-digests` from an already-
  registered entry, a *manual* `run-job --catch-up`, or a *direct* launcher call
  each need scheduler-registration privilege or a local shell — A12. BUT a
  **pre-WP catch-up registration whose code was upgraded out-of-band and never ran
  an attended `sync`** carries no token, so a scoped `config.yaml` writer reaches
  the token-less legacy path. This is bounded: the normal update→sync path re-mints
  the token and closes it; the residual is only an install that upgrades code yet
  never runs `sync`. Stated identically in `docs/THREAT-MODEL.md` and the
  `run-job.js` `catchUp` doc-comment.

### Refuse-surface decision

The launcher refuse text pointed to `wienerdog doctor`, which reads no A7 state.
The durable alert surfaces in the **digest banner** (`alerts.jsonl`); the refuse
text and runbook point there + to `wienerdog sync`. Wiring `doctor` to A7 state is
a deferred follow-up (candidate WP-162), not built in this pass.

## Amendment (2026-07-20) — A7 hardening pass (final Codex adversarial sweep)

The cumulative A7 implementation was swept once more; three integration/platform
defects were fixed on top of the green clusters. These refine — not reverse — the
decisions above.

1. **[R16] The Windows loaded-registration trust anchor is the REGISTERED
   `<Arguments>`, never a mutable wrapper file.** Amendment #5 (2026-07-19)
   permitted a generated `.cmd`/`.ps1` wrapper as one option for the Windows
   env-scrub. That option is **withdrawn**: the wrapper is a REOPENED file at the
   same scoped-write surface as `config.yaml`, so it carried ALL the authorization
   data (the `NODE_OPTIONS`/`NODE_PATH` scrub, `--descriptor`, `--expect-digest`,
   and the catch-up `--job-digests` map) in a place an attacker with a scoped
   schedule-file write could edit **without registration privilege** — stripping
   `--job-digests` (legacy catch-up bypass), changing `--expect-digest`, or
   replacing the body with arbitrary code before the launcher. **Corrected
   contract:** the Task Scheduler task registers absolute `%SystemRoot%\System32\
   cmd.exe` as `<Command>` and binds the COMPLETE command into `<Arguments>`
   (`/d /s /v:off /c "set "NODE_OPTIONS=" && … && set "WIENERDOG_HOME=<core>" && …
   && "<node>" "<launcher>" <name> --descriptor "<p>" --expect-digest <d>
   [--job-digests <b64>]"`). `<Arguments>` is stored in the Task Scheduler DB at
   `/create`; changing it needs registration privilege — the same anchor class as
   launchd's loaded `ProgramArguments`/systemd's `ExecStart`. Every embedded
   path/value goes through a cmd-token encoder (double-quote → throw; trailing
   backslashes doubled; `& | < > ( ) ^` literal inside quotes; the digest/map are
   base64url/hex, already safe). The wrapper file — and its `file` manifest entry
   — is removed. The `%`-in-core-path residual is unchanged and accepted.

2. **[A10/R4 extension] The registration-time core is bound + re-anchored.** The
   launcher picked its core (and thus its verification state, locks, logs, and the
   durable refuse alert) from ambient `WIENERDOG_HOME`, which scheduler entries did
   not bind — an `environment.d`/`launchctl setenv` write could point verification
   and the refusal alert at an attacker-selected core, a copied byte-identical tree
   could relocate the child's state with no descriptor drift, and a legit non-default
   `WIENERDOG_HOME` install failed when the scheduler did not inherit the shell
   override. **Corrected contract:** every OS entry binds `WIENERDOG_HOME=<core>`
   (launchd `EnvironmentVariables` / systemd `Environment=` / the Windows cmd
   arguments), AND the launcher re-anchors the core from its **own on-disk
   location** (`path.dirname(path.dirname(<launcher file>))`, since it is vendored
   at `<core>/launcher/launch.js` and invoked by absolute path) rather than
   trusting the ambient env value — so it targets the refuse alert at the anchored
   state dir, re-derives the descriptor from the anchored core, and re-asserts the
   anchored `WIENERDOG_HOME` into the child spawn. The legit non-default core flows
   through the binding without the shell override.

3. **[R7 extension] `adopt` re-binds an existing dream schedule.** `adopt` mutates
   the descriptor-covered vault root/layout then called create-only
   `ensureDreamSchedule`, which no-ops when a dream job already exists — leaving the
   OS entry/descriptor/catch-up map bound to the PRE-adoption vault (normal AND
   catch-up fires refuse on descriptor drift until a separate `sync`). **Corrected
   contract:** after mutating config, adopt routes through `repointSchedules` (the
   sole repair/mint owner) to re-derive + re-register EVERY existing job, so the
   loaded per-job digest and the catch-up map reflect the adopted vault with no
   follow-up `sync`.

4. **Catch-up HOME asymmetry (intentional).** Catch-up has no per-job descriptor,
   so — unlike a normal fire, which re-asserts the digest-covered `home` — its child
   keeps the HOME the OS entry bound at registration. Catch-up intentionally relies
   on that OS-entry HOME binding and does not re-assert a per-job bound HOME (the
   WP-157-review asymmetry). The `WIENERDOG_HOME` core is re-anchored for both paths
   (fix #2).

5. **Orphan removed.** `generators.ensureCatchup` (the token-LESS catch-up backstop
   whose sole production caller the catch-up WP removed) is deleted with its export
   and test — a future caller would have re-opened the no-`--job-digests` bypass.

## Amendment (2026-07-20) — A7 hardening 2 (Codex re-verification residuals)

The re-verification sweep after the first hardening found two failure-path
residuals. Both refine — not reverse — the decisions above.

1. **[R16 completion] Windows registration is a VERIFIED postcondition keyed off
   the LOADED task, not the source XML file.** Fix #1 (2026-07-20) bound the
   authorization command into the registered `<Arguments>`, but the register call
   was still fire-and-forget and the idempotency skip keyed off the SOURCE XML file
   plus a manifest entry, NOT the loaded task's Command/Arguments. So a first
   `schtasks /create` that FAILED while an OLD task stayed loaded (a legacy
   `.cmd`-wrapper task, or any prior registration) left the canonical XML written and
   the manifest entry recorded — and a later `sync`, seeing the matching source XML
   and entry, SKIPPED `/create`, leaving the stale mutable-wrapper task loaded. A
   scoped schedule-file writer could then edit that still-loaded wrapper → arbitrary
   scheduled execution without registration privilege. **Corrected contract:** on an
   unchanged source XML, the register path QUERIES the loaded task
   (`schtasks /query /tn <name> /xml`) and compares the bound `<Command>`/`<Arguments>`
   (XML-unescaped, via `generators.parseWindowsTaskExec`) to canonical; it skips
   `/create` ONLY on a verified match. Any other state — a real mismatch, a stripped
   `--job-digests` catch-up task, a missing/failed query, or output it cannot parse —
   force-replaces with `/create /f` (fail-safe: an unverifiable loaded task is never
   trusted). A subsequent sync that still cannot verify a match re-issues `/create /f`
   again, so the retry is simply the next sync and a stale loaded task is never
   silently left in place. Applies to BOTH the per-job dream and the catch-up task
   (the map-stripping bypass). The `schedulerSpawn` chokepoint now surfaces `stdout`
   so the query is readable; mutation callers ignore it.

2. **[R16 companion] Legacy `.cmd`/`.ps1` wrapper cleanup.** The inline-`<Arguments>`
   switch (fix #1) made any pre-existing Windows scheduler wrapper file dead, but a
   wrapper is a REOPENED mutable file at the scoped schedule-write surface (it carried
   the env scrub + `--descriptor`/`--expect-digest`/`--job-digests`). Every Windows
   (re)register now sweeps `<core>/schedules/wienerdog-*.cmd|ps1` — deleting both the
   FILE and its manifest `file` entry — so the dead wrapper is not a live
   arbitrary-execution surface.

3. **[R7 completion] `adopt`'s existing-schedule rebind is a CHECKED postcondition.**
   Fix #3 routed adopt through `repointSchedules`, but adopt DISCARDED its result
   (`notices`/`descriptorFailures`) and swallowed thrown errors — so a scheduler
   reload failure left the loaded entry bound to the OLD digest/map while adoption
   still printed completion, and because the canonical file was already written,
   idempotency could suppress a later silent retry. **Corrected contract:** adopt
   inspects `repointSchedules`' result; any failed re-register/reload
   (`notices.length > 0` or `descriptorFailures > 0`) or a thrown rebind is surfaced
   LOUDLY at completion with the `wienerdog sync` remediation (sync's heal reloads any
   entry the OS has not accepted, so idempotency does not suppress the retry) — never
   an unqualified success. adopt takes an injected `loader` seam so the rebind is
   tested without touching the real OS scheduler.

## Amendment (2026-07-25) — dev stops content-addressing a live tree, and stance is never selected from inside the tree

Status: **Accepted. OWNER-SIGNED 2026-07-26.**

**Architect note (2026-07-26, architect-authored — this is NOT an owner
signature and confers no approval).** This heading ended with the word
`(proposed)` until 2026-07-26, contradicting the owner-typed status line
directly beneath it. The trailing `(proposed)` was removed from the **heading
text only**. **The authoritative ratification marker for this amendment is the
status line above**; nothing may key on the heading. The status line, the
`OWNER-SIGNED 2026-07-25` line at the head of the file, and every Decision and
amendment body in this ADR are untouched by this note.

This amendment records four things: a small correction to the dev descriptor, a
**rejection** of the change that was proposed alongside it, the durable rule the
rejection establishes, and — as an **unresolved violation of that rule** — the
per-job dev path as it ships today. It refines, in one part explicitly
**reaffirms**, and in one part **corrects an earlier claim of** the decisions
above.

### 1. The dev descriptor no longer computes an app release digest

Amendment #7 (2026-07-19) ruled that a dev-stance install binds a **reduced**
descriptor digest: `appRelease` collapses to `{stance:'dev', root}`, excluding
`treeDigest` and `version`. `buildDescriptor` nevertheless *computed*
`appTreeDigest` for the dev `appRelease` and recorded it, even though
`reduceForDigest` rebuilds `{stance, root}` from scratch and therefore never
digests it — and no dev code path reads it either.

Hashing a **live** checkout is not free and not safe. Measured on the
maintainer's install at `efd1489`: **8,922** regular files — 3,341 under `.git/`,
4,905 under `node_modules/`, 676 of product source and docs, i.e. **92.4%** of the
work on files that are not product code — at 0.35–0.57 s per warm pass, once per
job on every dev derivation. Worse than the cost: the walk stats a directory
entry and then reads it, so a concurrent `git`/`npm`/editor write that unlinks
the file in between raises `ENOENT` inside `appTreeDigestOf`, which propagates out
of `buildDescriptor` and surfaces as a **refusal** — `integrity check errored: …`
for the nightly dream, and inside `catchUp` the misleading *"it is authorized but
no longer in your config"*. It also made `writeDescriptor`'s documented
idempotency ("unchanged inputs ⇒ byte-identical file") false on dev.

**Corrected contract.** The dev `appRelease` records `{version, stance, root}` and
computes **no** `treeDigest`. The prod `appRelease` is unchanged
(`{version, treeDigest, stance}`), and the prod fire still compares the live tree
to it. The dev **digest** is provably unchanged: `reduceForDigest` constructs
`{stance, root}` from scratch, so the presence or absence of `treeDigest` cannot
reach it — **no dev per-job entry needs re-minting, and no user action is
required.**

### 2. WP-157's catch-up refusal on a dev install STANDS

A change proposed alongside §1 — make the catch-up `--expect-digest` stance-shaped
(`dev:<checkout root>`) and give `verifyCatchup` a dev branch that verifies dev
liveness, the bound root and the presence of the `--job-digests` token instead of
hashing the tree — is **rejected**. Catch-up keeps refusing on a dev-stance
install: `app/current` legitimately resolves outside `<core>/app`, containment
refuses, and that is the disposition WP-157 shipped and `launcher.js`'s own doc
comment records. This paragraph reverses nothing; it declines to reverse
something.

The rejection is on security grounds, demonstrated against real code by two
independent review legs, in two orderings:

**Ordering A — the env-var door.** `isDevCheckout(root)` honours
`env.WIENERDOG_DEV === '1'` (`src/core/vendor.js:31`). Setting that variable is a
**scoped write** (a shell profile, `~/.config/environment.d/*.conf`, `launchctl
setenv`) — A7's adversary, not A12's. On a **prod** install: set the variable →
the next attended `wienerdog sync` mints `dev:<core>/app/<version>` for a tree
that is a real prod tree → a scoped write plants a `.git` into that app tree → at
fire time dev liveness passes and the bound-root comparison passes **trivially**,
because the bound root *is* the live target → catch-up spawns with **no tree hash
at all**. The launcher already refuses to read `WIENERDOG_DEV` for its fire-time
probe and says why in its own words (`src/scheduler/launcher.js:143-146`).

**Ordering B — the `.git` door, which closing ordering A does not close.** The
proposed fix was to mint with `isDevCheckout(root, {})` — on-disk `.git` only.
But a `.git` file is **also** an A7-scoped write, and it need only be planted
*before* the attended sync. On a **prod** install: plant `.git` in the prod app
tree → the next `sync` derives the descriptor **and** mints the anchor through
that same oracle, so both classify prod as dev → the sync registers
`dev:<prod app root>` together with a valid dev-reduced per-job map → every
fire-time check thereafter passes. Verified directly against
`src/core/vendor.js`, with no environment variable set: `isDevCheckout(root, {})`
returns `false` on a clean prod tree and `true` once `<root>/.git` exists as a
regular file, and the resulting anchor is `dev:<core>/app/<version>` — a path
contained inside `<core>/app`.

Ordering B is reachable, not theoretical. `makeTreeFilesReadOnly`
(`src/core/vendor.js:127-150`) chmods **files** only, so the published version
directories keep their write bit and a new file can be created inside them; the
A7 tamper matrix's own `3-stance` case plants exactly this file; and `vendorSelf`
does not clean it up — it skips the re-copy when the version dir already exists
(`vendor.js:178`) and its `isDevCheckout` call (`vendor.js:167`) tests the
*installer's* package root, never `app/current`.

**The per-job digest map cannot backstop either ordering.** The map's enforcement
(`decodeJobDigests` + union authorization) runs inside `run-job.js` — i.e. inside
the very app tree whose integrity the dropped hash was the only remaining
statement about. An attacker who has already written into that tree controls the
code that would check the map.

**And the shipped code is safe today, which is what makes this a regression
rather than a restatement.** Under ordering B on unmodified `main`, plant-then-sync
re-mints a `sha256:` anchor that **covers** the planted `.git`; the tree is pinned
from that moment, and any further tamper refuses on the tree-digest comparison.
After the proposed change the dev-classified tree would never be content-addressed
again. Two claims made for the proposal collapse with it and are withdrawn: that
"a planted `.git` is a new file, so the tree hash already refuses" (true only
while the anchor stays `sha256:`) and that "no legitimate prod value can reach the
dev branch" (the `dev:` value *is* legitimately minted — from a tampered tree).

### 3. The durable rule — stance is never selected by a signal inside the A7-writable tree

This is the part worth ratifying, and it generalizes Decision 4(d):

> **No mechanism may choose between the enforced (prod) and reduced (dev)
> verification paths on the basis of a signal that an A7-scoped write can
> produce.** `env.WIENERDOG_DEV` and an on-disk `.git` are both such signals. This
> holds at **mint** time as well as at fire time: binding the decision into a
> registration only moves the attack one attended `sync` earlier, it does not
> remove it, because the mint reads the same tree the attacker can write.

Amendment #7's "dev stance is bound at registration, not read from a live
`WIENERDOG_DEV` env at fire time" is the fire-time half of this rule. This
amendment adds the mint-time half, which the two orderings above show is the
half that was missing.

#### The shipped per-job dev path VIOLATES this rule — unresolved, not survivable

An earlier draft of this amendment claimed the rule is already respected on the
per-job path, because the dev branch's `reDeriveDigest(...) === expectDigest`
check (`launcher.js:294-297`) supplies a second, independent enforcement. **That
claim is withdrawn as false**, for two reasons verified against `efd1489`:

1. **`reDeriveDigest` is not independent — it executes from the tree in
   question.** It `require`s `src/core/paths`, `src/scheduler/jobs` and
   `src/scheduler/descriptor` **from `target`**, the live dev-classified app tree
   (`launcher.js:240-248`). An attacker who has written into that tree controls
   the code that would check him. The **prod** branch makes the same call only
   *after* `appTreeDigestOf(target) === descriptor.appRelease.treeDigest` passes,
   and says why in its own comment (`launcher.js:314-316`: *"Tree verified
   byte-identical … ⇒ it is now SAFE to require the descriptor-derivation code
   from the verified tree"*). That safety predicate does not hold on dev.
2. **The dev branch deliberately never hashes the tree.** It checks `liveDev`,
   bound-root equality and `reDeriveDigest` — **config fields only**, as its own
   comment states (*"the reduction excludes only treeDigest+version, so a
   tracked-source edit stays runnable"*). `appTreeDigestOf` is called on the prod
   branch alone (`launcher.js:308`). "Every config-shaped field stays
   digest-covered" is true and beside the point: **no** statement about app code
   is enforced on a dev fire.

The launcher's stance cross-check does refuse in **both** directions — a dev
descriptor over a `.git`-less tree (`launcher.js:288`) and a prod descriptor over
a `.git`-bearing tree (`:302`) — which kills the env-var-only variant of ordering
A: `WIENERDOG_DEV=1` alone mints a dev descriptor the fire-time liveness probe
then rejects. **But planting `.git` satisfies the mint and the liveness probe
alike.** `makeTreeFilesReadOnly` (`vendor.js:127-150`) chmods **files** only, so a
published version directory keeps its write bit; plant `.git` there, wait for one
attended `wienerdog sync`, and the install is classified dev with its app code
never content-addressed again.

**This is a different registration from ordering B above, and that difference is
why the false claim survived review.** Ordering B concerns the **catch-up
anchor**, which binds the raw `appTreeDigest` — so plant-then-sync re-mints a
`sha256:` anchor *covering* the planted file, the tree is pinned from that moment,
and further tamper refuses. The **per-job** path has no such pin: `reduceForDigest`
strips `treeDigest` for dev, so the per-job digest pins nothing about app code.
Both statements are true, about different registrations. §2's rejection of dev
catch-up rests on ordering B and stands unaffected.

**Disposition: an unresolved violation of §3's rule, not an accepted risk.** The
prerequisite is **`WP-stance-authority-containment`** (in drafting), which binds
stance to the discriminator an attacker cannot forge by writing *into* the tree:
realpath containment inside `<core>/app` (`src/core/vendor.js:200-206`). Until it
lands, a scoped write into a prod app tree can obtain a permanently un-hashed
per-job execution path. Two constraints hold meanwhile: no new reduced path may be
built on the `.git`/`WIENERDOG_DEV` oracle (§2), and `buildDescriptor`'s
`isDevCheckout(appRoot, env)` — which additionally honours the ambient env — is
left exactly as it is for that WP to replace wholesale, not patched piecemeal.

**`WP-dev-descriptor-no-tree-hash` does not create this exposure.** The
`treeDigest` §1 stops recording was already **write-only** on dev: `reduceForDigest`
never digested it and no dev code path ever read it (its sole reader,
`launcher.js:309`, is the prod branch). The set of things a dev fire enforces is
identical before and after §1. Read this section as a correction to an earlier
claim, not as a regression introduced by §1.

### 4. Containment is the stance authority — specced, not deferred

The discriminator this codebase actually relies on to tell the two stances apart
is **containment**, not `.git`: a prod `app/current` realpaths **inside**
`<core>/app` and a dev one legitimately does not (`src/core/vendor.js:200-206`
states this in its own words; the prod-path use of it is `verifyContainment` at
`src/scheduler/launcher.js:305`). Unlike `.git` and `WIENERDOG_DEV`, that property
cannot be forged by writing *into* the app tree, which is why it is the authority
§3's violation must be resolved against. **`WP-stance-authority-containment`** (in
drafting) owns that work. **Dev catch-up stays rejected regardless** (§2):
resolving stance authority removes the mint forgery, not containment's legitimate
failure on a genuine dev tree, and reopening dev catch-up needs its own WP and its
own owner ruling.

Consequences, stated plainly:

- **A7 is not closed.** §3 records the shipped per-job dev path as an open
  violation of this amendment's own durable rule: a `.git` planted in a prod app
  tree before an attended `sync` yields a dev-classified install whose app code is
  never content-addressed again. `WP-stance-authority-containment` is the fix; §1
  neither causes nor worsens it.
- **Nothing is re-minted and no user action is required.** §1 cannot change any
  digest; §2 changes no behaviour at all. A dev install's stale descriptor keeps a
  `treeDigest` nobody reads until the next attended `sync` rewrites the file.
- **Catch-up remains structurally unavailable on a dev install**, with a durable
  alert naming `wienerdog sync` that will not make it available. That is a known,
  accepted cost of the fail-closed posture, not an oversight — and after two
  review rounds it is the *deliberate* disposition rather than an inherited one.
  A dev install's missed jobs are recovered by running them attended.
- **The `appTreeDigestOf` scope is deliberately NOT changed** (no `.git`
  exclusion, no `node_modules` exclusion, no git-derived file selection). It stays
  a git-agnostic content address of whatever is under `app/current`. Deriving its
  scope from git state would make prod integrity depend on
  `.gitignore`/`.git/info/exclude` — writable at exactly the scoped-write surface
  A7 defends against — and would require the self-contained launcher to consult
  `git`, which it cannot do without loading pin code from the very tree it is
  verifying. The instability that scoping was meant to cure exists only on dev,
  and §1 removes it by dev not content-addressing its tree at all.

## Amendment (2026-08-01) — a correct, permanent refusal may be acknowledged by the user; it may never be softened by the install

Status: **ACCEPTED — OWNER-SIGNED 2026-08-01**

This amendment resolves the disposition the 2026-07-25 amendment left standing as
an accepted cost — *"catch-up remains structurally unavailable on a dev install,
with a durable alert naming `wienerdog sync` that will not make it available"* —
now that the cost has been observed in practice. It **reverses nothing**. §2's
rejection of a dev catch-up branch and §3's durable rule are reaffirmed verbatim
and are the grounds on which two candidate repairs are rejected below.

### 1. What was observed

On the maintainer's dev-stance install (`<core>/app/current` → the live checkout),
the hourly catch-up entry fires, `verifyContainment` refuses because `app/current`
legitimately resolves outside `<core>/app`, and `appendRefuseAlert` appends one
record per hour. Measured 2026-08-01: **119** records in
`<core>/state/alerts.jsonl`, all for the pseudo-job `--catch-up`, collapsing to
exactly **two** distinct `(job, reason)` pairs — one legacy record from
2026-07-25T19:12:34.322Z and **118** identical records from
2026-07-27T13:53:42.303Z to 2026-08-01T10:00:05.159Z.

The refusal is correct and is the disposition this ADR ratified. Three
consequences of it were not anticipated:

1. Nothing ever clears the record. `clearAlerts(paths, job)` runs when a job
   **succeeds**; `--catch-up` is a pseudo-job that never reports success, so its
   alerts are durable **forever** by construction.
2. `formatAlerts` re-renders the newest reason into **every** session digest, so a
   single permanent, already-understood condition presents as a fresh incident on
   every session start.
3. The rendered advice is the `reinstall` class from
   `WP-refusal-remedy-discriminator` — *"Do not run `wienerdog sync` … Reinstall
   Wienerdog from a trusted source, then investigate."* That class assignment is
   **correct** under that WP's rule R-P (containment failed, so nothing was
   confirmed) and must not be changed; but on this machine the condition is a
   legitimate, owner-chosen dev link, so the correct-in-general advice is wrong in
   this instance and is repeated indefinitely.

### 2. Two candidate repairs, both rejected under §3

**(a) A dev-aware refusal alert.** Rejected. On the catch-up path the live "this
is a dev install" observation **is** the containment failure — there is no other
signal available to that code. `<core>/app/current` is a symlink, and repointing
one symlink is an **A7-scoped write**: on a *production* install an attacker who
repoints it produces exactly that observation, and the banner would then tell the
user *"this is just a dev install, nothing to see"* at the precise moment a
repoint attack is in progress. That is the advice-downgrade shape §3 forbids,
applied one level up from verification to the notification the user acts on.
Binding a stance token into the catch-up registration does not help: §3's
mint-time half already rules that binding the decision into a registration *"only
moves the attack one attended `sync` earlier"*. `WP-refusal-remedy-discriminator`
independently forbids the same move in its own words (*"do **not** add an
`isDev(target)` test to `verifyCatchup` to pick a gentler tail … it would carve
the first real exception into R-P"*). Rejected.

**(b) Stop registering `ai.wienerdog.catchup` on a dev-stance install.** Rejected,
though not on §3 grounds alone. It is *narrowly* rule-compatible: it selects
between an **enforced** catch-up and **no** catch-up, never between enforced and
**reduced** verification, so no execution path with weaker checking is created.
It is rejected on three other grounds:

1. **It does not solve the observed problem.** The 119 records are already
   durable and nothing clears them (§1.1), so the digest banner would persist
   unchanged after the registration disappeared.
2. **It puts an availability guarantee behind a forgeable oracle.** The mint-time
   decision reads containment at attended `sync`; a pre-`sync` repoint on a
   production install would silently leave catch-up unregistered — the missed-job
   safety net disabled with **no refusal ever firing**, i.e. an availability loss
   that produces no signal at all. A refusal that fires and is loud is strictly
   preferable to a capability that quietly never exists.
3. **It edits the wrong contract at the wrong time.** The four-caller
   mint/teardown ownership invariant of Amendment #6 (R6/R7/R9 —
   `sync`/`repointSchedules`, `schedule add`, `init`, `adopt` mint;
   `repointSchedules` alone repairs and tears down) is the most delicate
   contract in this ADR, and this would add a conditional to it.

**Catch-up therefore stays registered and stays refusing on a dev install.**
Nothing in §2 or §4 of the 2026-07-25 amendment moves.

### 3. The ratified door: an attended acknowledgement of the *rendering*

The user may silence a **specific, already-seen** alert **in the session digest
only**, by an owner-attended act. The act is a typed confirmation read from a real
controlling terminal — the boundary `wienerdog grant` (ADR-0007) and
`wienerdog memory approve` (ADR-0021) already use. **A typed terminal
confirmation is not a file write, so it is not something the A7 adversary can
perform**, which is why this door is open where (a) and (b) are shut.

The scope limits are the decision, and they are exhaustive:

- It changes **rendering only**. Verification, the refusal, the zero spawn, the
  non-zero exit, the stderr line, and the durable record in `alerts.jsonl` are all
  untouched. No verification is weakened, skipped, or made conditional.
- It is keyed on the **exact `(job, reason)` pair**, hashed together. One changed
  byte in the reason, or the same reason under a different job, is a different key
  and renders normally. There is no prefix, substring, pattern or class match.
- Only a pair **present in `alerts.jsonl` at the moment of the command**, and only
  after it has been printed in full to the user, may be acknowledged.
- The acknowledgement is **dropped when that job next succeeds** (`clearAlerts`
  prunes it), so it can never outlive the alert it silenced and silently
  pre-suppress a later, different failure that happens to reuse the wording.
- Acknowledged alerts remain listed by `wienerdog alerts`. Nothing becomes
  invisible; it becomes un-repeated.
- The mechanism reads **nothing** about the install — not the stance, not
  containment, not `.git`, not `WIENERDOG_DEV`, not the job name. §3's rule is not
  engaged, because no path selection of any kind occurs.

Delivered by **`WP-attended-alert-acknowledgement`**.

### 4. Honest boundary of the acknowledgement store

The store is `<core>/state/alerts-ack.json`, at the **same** A7-scoped write
surface as `<core>/state/alerts.jsonl` itself. Stated plainly, and not claimed
away:

- An attacker who can forge an acknowledgement record can already **truncate or
  delete `alerts.jsonl` outright**, which suppresses the same banner without
  needing to predict a reason string. The store therefore adds **no capability**
  to the in-scope adversary.
- The launcher's `appendRefuseAlert` already documents itself as best-effort —
  *"the alert is best-effort — the refusal (non-zero exit, zero spawn) stands
  regardless"*. The **security** guarantee of a refusal has never been the alert;
  it is the zero spawn and the non-zero exit, and both are untouched.
- The store fails **open** on every malformed input: a missing, unreadable,
  non-JSON, wrong-schema or wrong-shaped record suppresses nothing. A suppression
  mechanism that failed closed would hide warnings, which is the wrong direction
  for this file.

What this amendment does **not** claim: that the notification channel is
tamper-resistant against a writer who reaches `<core>/state`. It never was, and
this changes neither direction of that.

### 5. Consequences

- **Catch-up remains structurally unavailable on a dev install**, exactly as the
  2026-07-25 amendment ratified. What changes is only that its correct, permanent
  refusal stops presenting as an unread incident in every session once the owner
  has read it and said so at a terminal.
- **No new stance-dependent code exists anywhere**, and the two candidate designs
  that would have introduced some are recorded as rejected above rather than left
  as open ideas to be re-proposed.
- **A discovered, unfixed defect is recorded, not repaired here:** the launcher's
  `appendRefuseAlert` is the only writer of `alerts.jsonl` that applies no record
  or byte bound, so the file grows without limit on the launcher path, and the
  app-side newest-200 compaction lets a repeating refusal crowd older alerts for
  other jobs out of the history. The obvious repair — collapsing consecutive
  identical records — is **rejected**, because it would make the digest report
  *"has failed"* for a job that genuinely failed 118 consecutive times,
  understating a real recurring failure. A correct repair gives the launcher the
  same bound the app-side writer has, or extends the record schema with a count;
  either needs its own work package and its own review, and neither is a launch-day
  change.

### 6. Codex design-review dispositions (2026-08-01, owner-accepted)

This amendment and `WP-attended-alert-acknowledgement` were put through the
adversarial design-review loop. Five findings came back; the owner accepted every
disposition below on 2026-08-01 and **rejected none**. Sections 1–5 above are
owner-signed and are not rewritten by this subsection — finding 1 is recorded here
as a **correction of emphasis** to §4, and §6.1 is the authoritative reading of
§4's capability claim wherever the two are read together.

#### 6.1 Finding 1 — "adds no capability" is too categorical (ACCEPTED, corrects the emphasis of §4)

**What the review found.** §4 argues that a forged acknowledgement record grants
the `<core>/state`-writing adversary nothing, because that adversary "can already
truncate or delete `alerts.jsonl` outright". The two are not equivalent, and the
difference runs in the attacker's favour. A forged acknowledgement is
**persistent** — it survives every subsequent append and lasts until the job
succeeds, which for a pseudo-job like `--catch-up` is never; it is **selective** —
it silences one chosen `(job, reason)` key and leaves every other alert rendering
normally, so the channel keeps looking healthy; and it is **unauthenticated** —
the record carries no proof that a human at a terminal produced it, while
`alerts.jsonl` itself remains intact and unsuspicious. One-time truncation gives
an attacker none of those three: it destroys history once, leaves a visible gap,
and suppresses nothing that is appended afterwards. Writing that the store "adds
no capability" therefore overstates the case as a flat claim.

**The disposition, and the counter-argument that bounds it.** The finding is
accepted as stated. What it does **not** establish is a new *reachable outcome*,
and that is the sharper argument, which stands: the same adversary — anything able
to write under `<core>/state` — can rewrite **`state/digest.md` itself**, the very
artifact the alert banner is rendered into, and can do so persistently and
selectively too. The digest notification channel was therefore **never**
integrity-protected against this adversary, before or after this amendment. What
the acknowledgement store changes is the **shape** of the tampering available —
from "destroy or rewrite the rendered output" to "suppress one key at the source"
— not the set of outcomes the adversary can reach. §4's honest-boundary framing
stands with that qualification, and its closing sentence (*"What this amendment
does not claim: that the notification channel is tamper-resistant against a writer
who reaches `<core>/state`"*) was already the correct statement; §4's bullet
overstated it in the attacker's disfavour and should be read through this
paragraph. **The security guarantee is untouched in every reading: zero spawn,
non-zero exit, and no weakening of any verification.**

#### 6.2 Findings 2–5 — the four spec-side dispositions

- **Finding 2 — the anti-minting claim was unqualified.** The spec asserted that
  "no skill, hook, dream, or headless job can mint one"; an actor able to execute
  arbitrary code under the user's account defeats it by driving `defaultPrompt`
  through a pseudoterminal or by importing `addAcks` directly. **Accepted as an
  A12-precedent residual** — identical to the already-accepted boundary of
  `wienerdog grant` (ADR-0007) and `wienerdog memory approve` (ADR-0021), neither
  strengthened nor weakened here. **Landed:** the WP's Security checklist bullet 4,
  scoped to Wienerdog's contained runtimes with the A12 hand-off stated.
- **Finding 3 — "a single byte of change" overstated the key's precision.** The
  key is computed over the **stored** reason, which `sanitizeAlert` has already
  capped at 2,000 characters and secret-redacted, so two raw messages differing
  only past the cap, or only in redacted bytes, share a key. **Accepted.**
  **Landed:** Table B's Reason sensitivity row, and the user-facing G1 bullet
  mirrored byte-identically into `docs/GLOSSARY.md`.
- **Finding 4 — two defects in the match contract.** (a) A record whose stored
  `job` disagreed with its `key` suppressed another job's alert while only the
  stored job's success could ever prune it; (b) the fail-open prose contradicted
  the `[]` returned for a non-array input. **Accepted.** **Landed:** the match
  predicate strengthened to require **both** `record.job === alert.job` and
  `record.key === ackKey(job, reason)` in the WP (PR #127), with the non-array
  return ruled an upstream programming-error guard rather than a suppression path
  in Table B; the code follows the tables.
- **Finding 5 — the lifecycle pairing is bounded, not absolute.** Alert-log
  compaction can **orphan** an acknowledgement (which then pre-suppresses only an
  exact recurrence of already-acknowledged wording), and `MAX_ACKS` eviction can
  **resurface** an acknowledged alert. **Accepted as fail-safe residuals.**
  **Landed:** Table A's Lifecycle row, which now carries both bounds and forbids
  the unqualified "never outlives" phrasing.

#### 6.3 Process note

The review was run per `docs/runbooks/codex-review.md`. **The design-review leg
ran late** — after the spec had reached `Ready` and been dispatched, rather than
before, which is a deviation from the runbook's ordering and is recorded here
rather than smoothed over; the cost was that findings 4 and 5 landed as amendments
to a spec an implementer was already working from. Verdict: **REQUEST CHANGES**.
All five findings were dispositioned by the owner on 2026-08-01; **none was
rejected**.

## Amendment (2026-08-01) — the scheduler ENTRY's node path is an upgrade-durable alias; `process.execPath` stays the runtime and the authorization value

Status: **PROPOSED — awaiting owner signature.**

**Architect note (2026-08-01, architect-authored — this is NOT an owner
signature, confers no approval, and no gate may key on it).** This amendment was
drafted by `wd-architect` because a `Ready` work package
(`WP-scheduler-node-path-durability`) makes one sentence of Decision 1 false, and
that spec's own Definition of done item 8 forbids merging the code while an
owner-signed ADR line is left silently false. The status line above is the
**only** ratification marker for this amendment; it stays `PROPOSED` until Gyula
Fehér types an `OWNER-SIGNED <date>` line into it by hand. Nothing above this
heading — not the `OWNER-SIGNED 2026-07-25` line at the head of the file, not
Decision 1's text, not any earlier amendment — is edited by this note or by the
sections below. Until signature, **Decision 1 stands exactly as written and this
amendment is a proposal, not the record**.

### 1. The sentence this amends, and why it needs amending

Decision 1 ("Structural executable pin") ends with:

> `node` is `process.execPath` (already absolute) and is not pinned.

That sentence was written when `process.execPath` was the value used in **every**
node-path role A7 touches, so one clause covered all of them. It has since become
ambiguous rather than wrong, and `WP-scheduler-node-path-durability` makes one
reading of it false. That WP registers the OS scheduler entry against an
upgrade-durable Homebrew alias (`<prefix>/opt/<formula>/bin/node`) instead of the
version-pinned Cellar path `process.execPath` returns, because an ordinary
`brew upgrade node` deletes the Cellar directory and every scheduled fire then
dies in `posix_spawn` with `ENOENT` **before a line of Wienerdog code runs** — a
failure outside the product's own observability, which is the exact class A7
exists to move inside it.

### 2. The three roles the sentence conflates (canonical)

| Role | Where the value lands | Value after this amendment | Why |
|------|----------------------|----------------------------|-----|
| **Entry** — the program the OS starts | `ProgramArguments[0]` (launchd), the `ExecStart` head (systemd), the node token in the Windows `<Arguments>` | an upgrade-durable absolute alias **when, and only when, it provably resolves to the running interpreter**; otherwise `process.execPath` unchanged | a string the OS keeps and re-reads days later. A path that dies between writes is fatal here. |
| **Runtime** — spawning a child of the process that is already running | `run-job.js`, `routine-runtime.js` | `process.execPath`, **unchanged** | must be the exact running interpreter. The path cannot go stale between the read and the spawn, and the exec-identity discipline requires it (never a PATH lookup, never an interpreter chosen by a symlink). |
| **Authorization record** — the digest-covered descriptor field | `descriptor.js`'s `node` field (Decision 3's schema, `"node": "/…/bin/node"`) | `process.execPath`, **unchanged** | see §4. |

### 3. Corrected contract

Decision 1's closing sentence is replaced, in effect, by:

> `node` is **not pinned** in the WP-154 sense — there is no command-path +
> install-dir pin store entry for it, and no structural verification of it. The
> node path Wienerdog *writes* depends on the role: the **runtime** and
> **authorization-record** roles are `process.execPath` verbatim; the **OS entry**
> role is the most upgrade-durable absolute path that **provably resolves, via
> `realpath`, to the very interpreter that is running at registration time**,
> falling back to `process.execPath` in every other case and on every error.

The realpath identity check is the whole of the security argument, and it is
stated here rather than left in the spec: a candidate alias is never written
anywhere until `realpath(alias) === realpath(process.execPath)` has proven it
names the **same inode** as the running interpreter. Any alias that survives that
check names the correct binary by construction, whatever its lexical shape; any
alias that does not is discarded and the pinned path is used. The derivation is
therefore fail-safe in one direction only — toward `process.execPath`.

### 4. Why the descriptor's `node` field does **not** move

Decision 3's rule — *"everything that shapes the 03:30 spawn argv is
digest-covered, no exceptions"* — is untouched, and the field stays
`process.execPath` for two reasons that are consequences of decisions already in
this ADR, not new policy:

1. The field is digest-covered, so changing its value changes every existing
   job's **descriptor digest**, and therefore the `--expect-digest` token bound
   into every registered entry's argv.
2. The macOS registration path cannot replace an already-loaded launchd record
   with a bare `launchctl bootstrap`. The rewritten plist would sit on disk
   carrying the new digest while launchd kept serving the old record carrying the
   old one; at the next fire the launcher would re-derive the new digest, compare
   it against the stale entry-bound old one, and **refuse** — breaking the nightly
   job on every already-installed macOS machine.

**The honest consequence, stated rather than smoothed over.** After a
`brew upgrade node`, an entry registered against the durable alias *fires*, the
launcher *runs*, re-derives `node: process.execPath` as the new Cellar path,
finds it differs from the descriptor on disk, and **refuses loudly** — durable
`alerts.jsonl` record, digest callout, remedy `run 'wienerdog sync'`. That is the
point: the failure moves from **outside** the product's observability to
**inside** it. Making a node upgrade cost nothing at all requires the descriptor
field to move too, which is a separate change that must land after the
verified-registration postcondition (ADR-0037) is in force everywhere.

### 5. Honest boundary — this adds no substitution resistance

The alias is a **third-party path Wienerdog does not own**. A same-user actor who
can repoint `<prefix>/opt/node` is the same actor who can replace the Cellar
binary it points at, and both are the arbitrary-same-user-native-code class this
ADR's "Honest boundary" already hands to A12. This amendment therefore closes the
**accidental** half of the dead-execution-position problem (a binary that ceases
to exist because the user upgraded a package) and closes **none** of the
**substituted** half (a real-but-hostile binary in the execution position, which
still grades `loaded` today). No sentence anywhere may read this amendment as
strengthening the executable trust anchor; it strengthens *availability* of a
correct entry, nothing else.

Two residuals are recorded rather than claimed closed:

- **nvm / fnm / volta / nodenv layouts** maintain no stable alias, so they keep
  the version-pinned path, where `defaultProbe`'s attended
  execution-position-exists check remains the only safety net.
- **Windows** is a no-op by construction (a Windows `process.execPath` has no
  POSIX-absolute shape), on the basis that the known Windows layouts are already
  stable. That layout claim is **specified, not observed** — no Windows host was
  available.

### 6. Sequencing, and what remains for the owner

This amendment must be **signed at or before** the merge of
`WP-scheduler-node-path-durability`; that spec's Definition of done item 8 is the
gate, and it is deliberately an owner action because an ADR is never edited from
a work package. Until the status line above carries a hand-typed
`OWNER-SIGNED <date>`, the gate is **not** satisfied and the code must not merge.
The only remaining step is the signature — the amendment text is written and
needs no further architect pass.
