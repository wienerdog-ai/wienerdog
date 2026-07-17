# Wienerdog Security Audit — Scheduler & Background-Job Execution Safety

> **Consensus status (2026-07-15): F3 is the primary P0; F1/F2/F4 are a
> correlated control-plane cluster.** Bare `claude -p` means Wienerdog supplies
> no routine sandbox, but actual Bash/network execution is conditional on the
> user's and project's permission posture; call it conditional HIGH, not
> guaranteed full capability. The fix cannot simply copy the dream's no-Bash
> profile because GWS routines need a usable narrow capability: use a dedicated
> per-routine profile and local credential-holding broker. Config/app hashes in
> a same-user-writable manifest detect accidental or scoped drift only; do not
> claim they authenticate against arbitrary same-user code. Dispatch should
> also reject arbitrary skill names and mutable run-action changes.

**Dimension:** Scheduler & background-job execution safety (OS-native scheduling, job generation/dispatch, vendored bin, lock/watchdog/catch-up, run-job dispatch, job env/privileges)
**Date:** 2026-07-15
**Scope:** `src/scheduler/*`, `src/cli/{run-job,schedule,sync,dream}.js`, `src/core/vendor.js`, `src/core/dream/{lock,config,brain}.js`, `src/core/paths.js`, ADR-0004/0013/0014
**Method:** Read-only source review. No files in the repo were modified.

---

## Executive summary

The scheduler is the most security-critical subsystem in Wienerdog: it is the one place where files-on-disk turn into **code that runs unattended, nightly, as the user, with subscription credentials in the environment**. The *string-generation* side (plist/systemd/schtasks emission) is genuinely well-hardened — argv arrays everywhere, careful XML escaping, a validated task-name regex, no shell concatenation. The `run` field is constrained to a two-entry allowlist (`builtin:dream` / `skill:<x>`), so a poisoned config cannot inject a raw shell one-liner.

The real exposure is **integrity of the two mutable inputs the already-registered OS entry consults at fire time**: `~/.wienerdog/config.yaml` (the job's `run` action) and `~/.wienerdog/app/current` (the vendored code the entry executes). Neither is integrity-checked. Any process running as the user — including an agent session or a limited file-write primitive — that can write either one converts them into **persistent nightly code execution** without ever registering its own scheduler entry. This is exactly the "memory-poison → config/file write → scheduled execution" exfil leg of the lethal trifecta, delivered through a pre-installed, pre-authorized channel.

No finding is a remote/unauthenticated RCE; all require local user-level write access, which is Wienerdog's stated trust boundary. The severity comes from **privilege/persistence escalation**: turning a one-shot write primitive into durable, credentialed, unattended execution.

---

## Findings (most severe first)

### F1 — Config-poisoning reroutes the already-registered nightly fire to arbitrary agentic execution
**Severity: HIGH**
**Files:** `src/cli/run-job.js:204-222` (`resolveCommand`), `src/scheduler/jobs.js:43-76` (`parseJobs`), `src/cli/run-job.js:635-641` (`run` dispatch)
**Confidence: High**

The OS scheduler entry is static: launchd/systemd/schtasks all run `node <currentBin> run-job dream` (`generators.js:110-116`, `:218`, `:336`). What that fire *does* is resolved at runtime by reading the job's `run` field out of `config.yaml`:

```js
// run-job.js:208-220
const sep = job.run.indexOf(':');
const kind = sep === -1 ? job.run : job.run.slice(0, sep);
const rest = sep === -1 ? '' : job.run.slice(sep + 1);
if (kind === 'builtin') { if (rest === 'dream') return {…'dream','--yes'…}; … }
if (kind === 'skill')   { return { command: 'claude', args: ['-p', `/${rest}`], shell: false }; }
```

`config.yaml` lives in `~/.wienerdog` and is created with the default umask (see F8) — writable by the user and by **any agent/session or process running as the user**. `parseJobs` will accept whatever sits between the managed sentinels; it does not verify the block was written by `schedule`. An attacker who can write config.yaml changes the `dream` job's `run` from `builtin:dream` to `skill:<attacker-prompt>`. **No re-registration of any OS entry is required** — the next 03:30 fire (or the hourly catch-up) executes `claude -p /<attacker-prompt>` in the vault directory, under the clean env that passes through `ANTHROPIC_API_KEY` / `CLAUDE_CONFIG_DIR` (subscription credentials).

Exploit scenario (trifecta exfil leg): a session poisons vault memory → a later dream or the user's own edit lands attacker text → attacker (or the poisoned agent) writes one line into config.yaml → every subsequent night, an attacker-chosen Claude prompt runs unattended with the user's credentials and can read the vault / exfiltrate via any tool Claude will run headlessly.

**Exploitable-or-mitigated:** Partially mitigated. `resolveCommand`'s `kind` allowlist (only `builtin`/`skill`; everything else throws) **prevents a raw `run: exec:/bin/sh -c …` shell injection** — a solid control. But `skill:` still yields arbitrary *unsandboxed* `claude -p` (see F3), which for an agentic brain is effectively arbitrary action. The cap is "arbitrary headless Claude run," not "no execution."

**Recommendation:** Treat the `jobs:` block as trusted-only by binding it to the manifest hash the way `resyncConfigHash` already does for installer writes — on read, if config.yaml's hash diverges from the manifest-recorded hash, refuse to dispatch `skill:` jobs (or refuse any job whose `run` was not installer-written) and fail loud. At minimum, re-validate `rest` for `skill:` against `^[a-z0-9][a-z0-9-]*$` at dispatch time.

---

### F2 — Vendored app is executed nightly with no integrity check (persistence via `~/.wienerdog/app`)
**Severity: HIGH**
**Files:** `src/core/vendor.js:23` (`currentBin`), `:121-146` (`vendorSelf`), `:68-108` (`repointCurrent`), `src/cli/run-job.js:213`/`:286`, `src/scheduler/generators.js:31-33`
**Confidence: High**

`sync` vendors the running package into `~/.wienerdog/app/<version>/` and points `app/current` at it (`vendorSelf`). Every long-lived reference — the OS scheduler entries, the PATH shim, and run-job's self-invocations (`gen.wienerdogBin` → `currentBin` → `app/current/bin/wienerdog.js`) — targets that stable path. The scheduled entry therefore runs, nightly and as the user, whatever Node code currently sits under `app/current`.

There is **no signature, hash, or ownership verification** of the vendored tree before it is executed. `vendorSelf` records only `{ kind: 'vendored-tree', path: app }` in the manifest (`vendor.js:128`) — a path, not per-file hashes. `doctor` and `uninstall` do not verify it either (grep for `sha256`/`integrity` over `vendor.js`/`doctor.js`/`run-job.js` returns nothing).

Exploit scenario: an agent/process that can write `~/.wienerdog/app/<version>/bin/wienerdog.js` (or `src/**`), or that can repoint `app/current` (`repointCurrent` is a plain symlink swap under a single-writer assumption), replaces the code the scheduler runs. Result: **persistent nightly arbitrary Node execution as the user**, surviving version bumps (only `current`'s target changes; ADR-0013 explicitly makes the entry version-independent, which also makes the payload location stable for an attacker). Unlike dropping one's own launchd plist, this needs no scheduler-registration privilege — only a file write under `~/.wienerdog`.

**Exploitable-or-mitigated:** Not mitigated. This is a clean persistence/priv-persistence vector for any user-level write primitive scoped to `~/.wienerdog/app`.

**Recommendation:** Record a per-file (or whole-tree) hash of the vendored version dir in the manifest at vendor time; verify it in `run-job` before dispatch (fail loud on mismatch) and in `doctor`. Consider making the version dir read-only (`chmod -R a-w`) after the atomic publish rename, and validating that `app/current` resolves inside `app/` and is owned by the user.

---

### F3 — `skill:` jobs run `claude -p` with none of the dream brain's sandboxing
**Severity: MEDIUM**
**Files:** `src/cli/run-job.js:217-220` (`resolveCommand` skill branch), contrast `src/core/dream/brain.js:46-72` (`buildClaudeArgs`), `src/cli/schedule.js:342-347` (`--skill` unvalidated)
**Confidence: High**

The `builtin:dream` path spawns Claude through `buildClaudeArgs`, which is a carefully fenced invocation: `--tools Read,Write,Edit,Glob,Grep` (no Bash, no WebFetch/WebSearch), `--permission-mode acceptEdits`, `--add-dir` limited to vault+scratch, `--strict-mcp-config` (zero MCP), `--setting-sources user` (a repo under cwd cannot widen tools). This is the audited security surface.

The `skill:` path gets **none of it**:

```js
// run-job.js:219
return { command: 'claude', args: ['-p', `/${rest}`], shell: false };
```

Bare `claude -p /<skill>`, cwd = the vault, inheriting the user's default tool permissions and (absent `--setting-sources user`) potentially project/local settings from the vault directory. `schedule add` also does **not validate** `flags.skill` (`schedule.js:347` interpolates it straight into `skill:${flags.skill}`), unlike the strict regex applied to the job *name*.

Combined with F1, a poisoned `skill:` job is the sharpest exec channel in the system: an attacker-controlled skill/prompt runs nightly without the "no Bash / no network / vault-only" guarantees that make the dream safe to schedule by default.

**Exploitable-or-mitigated:** Partially mitigated by Claude's own headless permission behavior (tools needing interactive approval are denied in `-p`), but that depends on the user's `~/.claude` settings and any project settings reachable from the vault cwd — an unreliable fence compared to `buildClaudeArgs`.

**Recommendation:** Route `skill:` jobs through the same restricted flag set as the dream brain (explicit `--tools`, `--strict-mcp-config`, `--setting-sources user`, scoped `--add-dir`). Validate the skill name against `^[a-z0-9][a-z0-9-]*$` in `schedule add` and at dispatch.

---

### F4 — Clean-env PATH front-loads `~/.local/bin`; nightly jobs spawn bare `claude`/`git`/`codex`
**Severity: MEDIUM**
**Files:** `src/cli/run-job.js:152` (POSIX PATH), `:116` (win PATH), bare commands at `run-job.js:219`/`:286`, `dream/brain.js:139`; shim dir at `src/core/vendor.js:170-181`
**Confidence: High**

`buildCleanEnv` constructs PATH as `node-dir : ~/.local/bin : /opt/homebrew/bin : /usr/local/bin : /usr/bin : …` — i.e. `~/.local/bin` is placed **ahead of all system directories**. The nightly jobs resolve several binaries *by name* through this PATH: `claude` (skill jobs and the dream brain), `git` (dream's commit path), `codex`, and the alert sender. `~/.local/bin` is user/agent-writable and is the very directory Wienerdog writes its own shim into (`writeShim`, `vendor.js:170`).

Exploit scenario: an attacker plants a malicious `claude` (or `git`) executable in `~/.local/bin`. Because that dir precedes `/usr/bin`, every nightly job invokes the attacker's binary instead of the real one — a persistence/priv-persistence vector that needs only a single file write and no scheduler access.

**Exploitable-or-mitigated:** Not mitigated. The ordering is deliberate (to prefer the native `curl | bash` Claude install per ADR-0009), but it means a planted binary in a commonly-writable dir wins for all scheduled jobs.

**Recommendation:** Resolve `claude`/`git`/`codex` to absolute paths at install/sync time and store them, or at least document/verify ownership+mode of `~/.local/bin`. For the dream brain specifically, prefer an absolute resolved path over a bare command.

---

### F5 — Production dispatch honors test-only exec seams (`WIENERDOG_RUNJOB_CMD` runs with `shell:true`)
**Severity: LOW**
**Files:** `src/cli/run-job.js:205-206`, `src/core/dream/brain.js:128-134`
**Confidence: High**

`resolveCommand` short-circuits on an env var and runs it **with a shell**:

```js
// run-job.js:205-206
const fake = process.env.WIENERDOG_RUNJOB_CMD;
if (fake) return { command: fake, args: [], shell: true };
```

`spawnBrain` has an analogous `WIENERDOG_DREAM_CMD` seam (no shell, but arbitrary command). These are test hooks living in the production dispatch path. Anyone who can set `WIENERDOG_RUNJOB_CMD` in the environment the scheduled `run-job` inherits gets **arbitrary shell command execution** at 03:30.

**Exploitable-or-mitigated:** Largely mitigated. Neither var is in `ENV_PASSTHROUGH`/`WIN_ENV_PASSTHROUGH`, and `buildCleanEnv` rebuilds the child env from scratch, so the *child* dream never sees them. Exploitation requires injecting the var into the environment of the `run-job` process itself — i.e. the launchd/systemd/login environment (`launchctl setenv`, a systemd user env drop-in, or a shell profile the scheduler reads). That is a real but constrained local-persistence path, and `shell:true` on the run-job seam is a defense-in-depth smell.

**Recommendation:** Gate these seams behind a test-only flag (e.g. `NODE_ENV==='test'` or a dedicated `WIENERDOG_TEST=1`) so they are inert in a production install, and drop `shell:true` in favor of an argv split.

---

### F6 — `WIENERDOG_JOB` is environment-derived and trusted for routine resolution
**Severity: LOW**
**Files:** `src/cli/run-job.js:135`/`:166` (set), `src/gws/index.js:91` (consumed)
**Confidence: Medium**

`buildCleanEnv` stamps `WIENERDOG_JOB=<name>` into the job child env; `gws` resolves which routine/subscription to act as from `flags.routine ?? process.env.WIENERDOG_JOB ?? null`. A normal interactive session that happens to have `WIENERDOG_JOB` exported would be treated as that job for send-routing, and a job could be made to look like a different job by editing config. This does not gate a destructive confirmation (the dream's `--yes` is passed explicitly in argv, not derived from this var), so impact is limited to *which* routine's config/subscription is used for outbound sends.

**Exploitable-or-mitigated:** Low impact; no safety check is bypassed. Worth noting as a trust-of-environment issue if `WIENERDOG_JOB` ever comes to gate a real decision.

**Recommendation:** Keep `WIENERDOG_JOB` out of any authorization/confirmation logic; if job identity ever matters for a security decision, derive it from a trusted argv token, not the environment.

---

### F7 — Watchdog is a best-effort tree-kill; a double-forked grandchild can outlive the job
**Severity: INFO**
**Files:** `src/cli/run-job.js:183-195` (`killProcessTree`), `:503-508` (watchdog), `src/cli/dream.js:112-123`
**Confidence: Medium**

On timeout the watchdog kills the process **group** (POSIX negative-PID SIGKILL) or `taskkill /T /F` (Windows). A child that deliberately `setsid()`s / double-forks out of its process group on POSIX escapes the group-kill and survives — weakly contradicting ADR-0004's "no process may outlive its job." For the fenced dream brain (no Bash) this is near-impossible; for unsandboxed `skill:` jobs (F3) it is plausible.

**Exploitable-or-mitigated:** Mitigated in practice for `builtin:dream`; residual risk concentrated in `skill:` jobs, which is another reason to fence them (F3).

---

### F8 — `~/.wienerdog` and `config.yaml` created with default umask (only `secrets/` is 0700)
**Severity: INFO**
**Files:** `src/cli/init.js:129` (dir modes), `:140`/`:150` (config write), `src/core/paths.js:26-47`
**Confidence: High**

`init` creates directories with `mode: d === paths.secrets ? 0o700 : undefined` — i.e. only `secrets/` is locked down; the core dir and `config.yaml` inherit the process umask (typically world-readable, user-writable). On a single-user machine this is fine. On a shared/multi-user host, or if `$HOME` itself is group/other-writable, another local account could write `config.yaml` (F1) or the vendored app (F2) and gain the same nightly execution. This is a precondition-amplifier for F1/F2, not an independent RCE.

**Recommendation:** Create the core dir `0700` (it holds config, state, logs, the vendored executable code, and the manifest — all security-relevant). Consider verifying home-dir perms in `doctor`.

---

## Solid controls observed

These are genuinely well-done and should be preserved:

- **No shell in the real dispatch paths.** Every production spawn uses an argv array with `shell:false` (`run-job.js:483`, `brain.js:144`, `spawn.js:31`, `schedulerSpawn` for launchctl/systemctl/schtasks). There is no string concatenation of user/config values into a shell command line anywhere in the scheduler.
- **`run` field is a closed allowlist.** `resolveCommand` accepts only `builtin:dream` and `skill:<x>`; any other kind throws. A poisoned `run: exec:…` cannot inject a raw command — the reason F1 is capped at "arbitrary Claude" rather than "arbitrary shell."
- **Thorough, correct escaping in every emitter.** `xmlEscape` (plist), `windowsXmlEscape` (Task XML, incl. `"`/`'`), and `systemdQuote` (escapes `\`, `%`→`%%`, `"` in the correct order) are all applied to every interpolated path/userId. Paths are absolute (launchd/systemd don't expand `~`/`$HOME`), and the bin path is additionally double-quoted inside the schtasks `<Arguments>`.
- **Defense-in-depth name validation before any side effect.** `windowsTaskName` enforces `^[a-z0-9][a-z0-9-]*$` and throws *before* any XML is rendered or file written (`schedule.js:219-225` comment documents this explicitly), so `/`, `\`, `..`, spaces, and quotes can never reach the task path or argv. `schedule add` validates the job name with the same regex; `parseAt` strictly validates `HH:MM`.
- **The TCC-guard is exemplary.** `safeResolvePath` walks paths component-by-component, guarding each candidate *lexically before any `lstat`*, so a symlinked ancestor or trailing-slash final symlink can never traverse the OS into a protected dir before the check runs. `normalizeForCompare` folds Unicode-NFC, case, and APFS firmlink spellings at one choke point. It fails **closed** (over-refuse) on symlink cycles and ambiguity. This is careful, adversarially-minded code.
- **Dream lock is robust.** Atomic `wx` create (acquired, not stolen), deadline-based steal only when the prior holder is provably dead/hung, pid-checked release, and an `ownsLock` teardown guard so a superseded process touches neither the lock nor the shared scratch (the documented 2026-07-07 TOCTOU incident). Combined with run-job's watchdog and macOS `MultipleInstancesPolicy IgnoreNew`, concurrent dream + catch-up cannot corrupt inputs or double-run.
- **Catch-up re-runs with identical settings.** `catchUp` calls `runJob(paths, job, opts)` with the same job definition, same timeout, same TCC-guard, and same clean env — there is **no weaker re-run path**.
- **Clean environment is constructed, not inherited.** `buildCleanEnv` builds PATH/HOME/USER from scratch and passes through only a small allowlist, rather than inheriting the scheduler's (or an attacker-influenced) environment — which is what neutralizes the F5 seams for the child.
- **Single scheduler-mutation chokepoint with a hard test guard.** `schedulerSpawn` centralizes all launchctl/systemctl/schtasks mutations and refuses to touch the real per-user-global scheduler in tests (`WIENERDOG_TEST_NO_REAL_SCHEDULER`), acknowledging these identifiers are not HOME-scoped.
- **Atomic state writes** (temp + rename) for `schedule.json`, the digest, and the vendored version dir publish.

---

## Priority recommendations

1. **F1/F2 together — bind config `jobs:` and the vendored app to the manifest hash and verify at dispatch.** This closes the two "write one file → nightly execution" escalations with a single mechanism Wienerdog already has (`resyncConfigHash` / manifest hashing). Fail loud on mismatch.
2. **F3 — fence `skill:` jobs with the same restricted `claude` flag set as the dream brain**, and validate the skill name.
3. **F8 — create `~/.wienerdog` as `0700`** (it stores executable code + credentials-adjacent state).
4. **F4 — resolve `claude`/`git`/`codex` to absolute paths** for scheduled jobs, or verify `~/.local/bin` ownership/mode.
5. **F5 — make the exec seams inert outside tests** and drop `shell:true`.
