# ADR-0027: Re-derive scheduler unload from platform + validated identity — never execute manifest-stored argv

Status: Accepted
Date: 2026-07-18

> **OWNER-APPROVED (2026-07-18).** The owner ratified reversing the store-then-execute
> scheduler-unload design as part of audit action A8: `wienerdog uninstall` must never
> run an argv read out of the install manifest. The unregister command is re-derived at
> uninstall time from the OS platform plus the validated schedule-entry identity, and the
> stored `unload` argv is treated as untrusted (ignored for execution). This is a durable
> reversal of the WP-013/WP-071 manifest design and is implemented by WP-145.

## Context

Wienerdog schedules its nightly jobs with the OS-native scheduler (launchd on macOS,
systemd user timers on Linux, Task Scheduler on Windows). At schedule time it records a
`scheduler-entry` in the install manifest so `wienerdog uninstall` can later unregister
the job and remove the schedule file.

Today (`src/core/manifest.js` `reverseSchedulerEntry`, tied to WP-013/WP-071) the manifest
entry carries a pre-computed `unload` argv — the exact platform-specific unregister command
line, computed at add time in `schedule.js` and stored on the entry. On reverse, the
reverser runs that stored argv verbatim through the single scheduler mutation chokepoint
(`src/scheduler/spawn.js` `schedulerSpawn`), best-effort, then removes the file. The
original rationale was separation of concerns: keep `manifest.js` free of any
launchd/systemd/schtasks knowledge by letting the platform layer pre-bake the command.

Audit action **A8** ("treat manifest replay as untrusted input") identifies this as a
code-execution sink. The manifest is a plain on-disk file writable by any same-shell actor;
`git`, an errant editor, or a malicious script can rewrite the `unload` field to an
arbitrary command, and `uninstall` — a routine the user runs with their own privileges —
would execute it. Storing an executable argv in an untrusted file and running it back is
exactly the replay vector A8 exists to close. **IRON RULE (ADR-0004): Wienerdog is just
files** — the reverser's job is to undo declared artifacts, not to be a general command
runner driven by file contents.

## Decision

The uninstall reverser MUST NOT execute any argv sourced from the manifest. Instead:

1. The `scheduler-entry` manifest kind carries only **declarative identity** the reverser
   can validate — the schedule-file path (already present) and the job identity needed to
   name the OS-scheduler registration (e.g. the canonical label/basename). Any `unload`
   argv still present on an entry is ignored for execution (kept only, if at all, for a
   human-readable dry-run hint) and is never passed to `schedulerSpawn`.
2. At uninstall time the reverser **re-derives** the unregister command from the current
   OS platform plus that validated identity, using the platform generator layer
   (`src/scheduler/generators.js`) — the same code path that produced the registration —
   rather than trusting a stored string. The derivation is code-owned and takes no
   free-form input from the manifest.
3. The re-derived plan (the exact command that will run and the file that will be removed)
   is shown before the interactive confirm, so the effect is inspectable and `--yes` never
   widens what is valid — it only skips the prompt.
4. Schedule-file removal stays bounded to known roots (realpath/lstat-guarded), consistent
   with the rest of A8 (WP-144).

`manifest.js` gains no static scheduler dependency: the re-derivation is delegated to the
platform generator layer (required lazily / injected), preserving the original
separation-of-concerns intent while removing the execution-of-stored-argv sink.

## Consequences

- **Positive.** A tampered manifest can no longer cause `uninstall` to execute an arbitrary
  command; the worst a rewritten `scheduler-entry` can do is name a bogus identity, which
  re-derivation either resolves to a well-formed (harmless) unregister call or rejects. The
  uninstall plan is now inspectable before it runs.
- **Cost.** The reverser (via the generator layer) must know how to re-derive the unregister
  command per platform — a small, code-owned addition versus reading a stored string. Add
  time and reverse time must agree on the identity→command derivation; a divergence is a
  code bug caught by tests, not a silent mismatch.
- **Migration.** Existing manifests that still carry an `unload` argv remain uninstallable —
  the field is simply ignored for execution; identity is re-derived from the entry path /
  label. No manifest rewrite or re-schedule is required.
- **Boundary.** This closes the *stored-argv* replay vector. It does not claim protection
  against an actor who controls both the core code and the OS scheduler (A7/A12 territory);
  same-user native control can still replace both anchors.

## Alternatives considered

- **Sign/MAC the `unload` field.** A manifest MAC readable and writable by the same
  shell-capable actor is not a security boundary (the same reasoning the audit applies to
  grant MACs under A2). Rejected — re-derivation removes the sink entirely rather than
  guarding a value that should not be executed at all.
- **Allowlist-validate the stored argv** (e.g. require `argv[0]` ∈ {launchctl, systemctl,
  schtasks}). Brittle and still executes attacker-influenced arguments (target labels,
  flags). Rejected in favor of taking no executable input from the file.
- **Keep the stored argv, only bound the file removal.** Bounds the delete but leaves the
  command-execution sink open — does not satisfy A8. Rejected.

## Amendment (2026-07-19) — the decision covers ALL scheduler-mutation paths

The WP-145 review found the decision as implemented was scoped too narrowly: it
closed only the **uninstall reverser** (`manifest.js reverseSchedulerEntry` via
`deriveUnloadArgv`), while two other callers still executed stored `entry.unload`:

1. **`schedule remove`** (`src/cli/schedule.js`) — a second production caller of the
   shared reverser.
2. **The sync-time self-heal** (`src/scheduler/status.js` `describeEntry` →
   `reloadMissing`/`probeAll`, invoked from `sync`) — read `entry.unload` straight
   into a launchd `bootstrap` / systemd `enable` / schtasks `/create` argv and
   spawned it via `schedulerSpawn`.

**Clarified decision:** "never execute an argv sourced from the manifest; re-derive
from platform + validated identity" applies to **every** scheduler-mutation path —
uninstall reverse, `schedule remove`, and the sync-time heal (probe **and**
reload). `generators.js` gains `deriveProbeArgv` and `deriveReloadArgv` alongside
`deriveUnloadArgv` (same fully-anchored basename+platform derivation); any file-path
argument a re-register command needs (e.g. `launchctl bootstrap <plist>`,
`schtasks /xml <xml>`) is `withinSchedulerRoot`-gated before use. Also: the
unregister spawn must occur **after** the root/basename validation, not before
(the implementation had spawned first). Implemented as WP-145 fix-pass amendments.
