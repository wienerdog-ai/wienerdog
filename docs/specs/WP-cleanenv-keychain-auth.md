---
id: WP-cleanenv-keychain-auth
title: buildCleanEnv must not suppress claude's Keychain auth on an unredirected home
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0025, ADR-0009, ADR-0004]
epic: p0-ungate
---

# WP-cleanenv-keychain-auth: stop buildCleanEnv from suppressing claude's Keychain auth

## Context (read this, nothing else)

`wienerdog run-job <name>` (`src/cli/run-job.js`) is the short-lived **run-job**
wrapper the OS scheduler (launchd on macOS) launches for every headless model job —
the nightly **dream** and every routine. It builds a deliberately MINIMAL **clean
env** for the child via `buildCleanEnv(paths, name, platform)`: launchd/systemd
children inherit almost nothing, so the wrapper constructs `HOME`, a fixed `PATH`,
`USER`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and a couple of `WIENERDOG_*` passthroughs
from scratch (ADR-0025 hermetic runtime; the parent env cannot influence the child).
That clean env flows to the actual `claude -p` brain: for the dream, run-job spawns
`wienerdog dream --yes` under this env, and `runBrainWithWatchdog` calls
`spawnBrain({ env: process.env })` — so the brain's `process.env` **is** this clean
env; for a routine, run-job spawns `claude -p` directly under it; the pre-routine
containment probe reuses the same `env`. There is exactly ONE place `CLAUDE_CONFIG_DIR`
is put INTO that env: `buildCleanEnv`.

**Iron rule (ADR-0004): Wienerdog is just files.** This WP changes one env-building
function and its tests. It starts no process, server, or telemetry.

**Auth model (ADR-0009): subscription auth only.** The dream/routines authenticate
with the user's logged-in Claude subscription; `ANTHROPIC_API_KEY` is stripped from
every child. There is no inherited API key to fall back on — the brain MUST reach the
subscription credential store to authenticate.

**The incident (2026-07-24, production-confirmed).** The 0.10.0 hermetic dream/routine
path cannot authenticate on claude 2.1.217 under BOTH terminal and launchd. A
launchd-kickstarted dream failed with `Failed to authenticate: OAuth session expired
and could not be refreshed`. Root cause, established by a 16-experiment spike
(WP-broker-e2e-terminal-auth) and reproduced in production: **claude ≥ 2.1.216
migrated its OAuth token into the macOS login Keychain (item `Claude Code-credentials`)
and deleted `~/.claude/.credentials.json`. When `CLAUDE_CONFIG_DIR` is explicitly set
in the child env — even to the exact default `~/.claude` — claude ignores the Keychain
entirely and looks only for file credentials, which no longer exist → 401.**
`buildCleanEnv` (POSIX branch) ALWAYS sets `CLAUDE_CONFIG_DIR`, so it always suppresses
the Keychain. Spike experiments D1 (terminal) and L1 (launchd): the identical minimal
env WITHOUT the var authenticates fine in both contexts. Prior nights the failure was
masked — a pre-auth "Unknown command" slash rejection swallowed the run before the auth
error surfaced; the 0.10.0 non-vacuity guard now makes it fail loudly.

This WP is the **approach-3** fix that WP-broker-e2e-terminal-auth gated behind its own
review (its "3. `buildCleanEnv` env-passthrough" paragraph and Security checklist govern
here): a scoped, security-argued change to the clean-env boundary so the brain reaches
its own default credential resolution — including the Keychain — exactly as production
did before 0.10.0.

## Current state

`src/cli/run-job.js`, `buildCleanEnv(paths, name, platform = process.platform)`:

- `os` is already imported (`const os = require('node:os');`).
- POSIX branch (lines ~167-199) builds `env` with `HOME: paths.home`, the fixed `PATH`,
  `WIENERDOG_JOB`, `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, then **unconditionally**:

  ```js
  // A7/A10 (WP-157): config roots reconstructed deterministically beneath the
  // BOUND home (never an inherited CLAUDE_CONFIG_DIR/CODEX_HOME).
  env.CLAUDE_CONFIG_DIR = path.join(paths.home, '.claude');
  env.CODEX_HOME = path.join(paths.home, '.codex');
  const user = resolveUsername();
  if (user) env.USER = user;
  for (const k of ENV_PASSTHROUGH) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
  ```

- The win32 branch (lines ~117-166) also sets both vars unconditionally. `CLAUDE_CONFIG_DIR`
  is **NOT** in `ENV_PASSTHROUGH` — the only way it enters the child env is these explicit
  `env.CLAUDE_CONFIG_DIR = …` assignments (grep proof: `grep -rn '\.CLAUDE_CONFIG_DIR *=' src/`
  returns only run-job.js lines 154 and 192).
- `paths.home` comes from `getPaths()` = `env.HOME || os.homedir()`. In production run-job
  always calls `getPaths(process.env)`, so `paths.home === os.homedir()` (both derive from
  `$HOME`; empirically verified: `os.homedir()` reads `process.env.HOME` live). A test/harness
  that constructs a `paths` object with a temp `home` (while the process's real `$HOME` is
  unchanged) has `paths.home !== os.homedir()`.
- Inheritance chain confirmed (no other product change needed):
  `run-job buildCleanEnv → env → wienerdog dream (process.env) → spawnBrain({env: process.env})
  → childEnv (spread, no CLAUDE_CONFIG_DIR re-set)`; and for routines `run-job buildCleanEnv →
  claude -p` directly; and the containment probe uses `opts.env || process.env` = this env.
  None of `src/core/dream/brain.js`, `src/cli/dream.js`, `src/core/routine-runtime.js`, or the
  gws broker spawn sets `CLAUDE_CONFIG_DIR`; `src/scheduler/generators.js` and
  `src/scheduler/launcher.js` only SCRUB it (`''` / `delete`) from the launcher's own env;
  `src/core/paths.js` only READS it for config-dir resolution. So `buildCleanEnv` is the sole
  fix point.

Existing tests:
- `tests/unit/scheduler-runjob.test.js` — the "buildCleanEnv (pure)" section. NO test currently
  asserts `CLAUDE_CONFIG_DIR` here. The byte-identical POSIX test and the "no leaks" test use a
  temp `paths.home` (redirected branch) and assert nothing about the var — unaffected.
- `tests/unit/sync-repoint.test.js` lines ~242 and ~271 — two A10 tests that assert
  `clean.CLAUDE_CONFIG_DIR === path.join(paths.home, '.claude')`. Their `paths.home` is a temp
  dir (`getPaths({ HOME: root, … })`) and `process.env.HOME` is NOT mutated, so
  `paths.home !== os.homedir()` → they land in the KEEP branch and **still pass unchanged**.
  Only their explanatory comment (lines ~235-241) becomes stale/misleading after the fix and
  must be corrected.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip) and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | In `buildCleanEnv` POSIX branch ONLY: set `CLAUDE_CONFIG_DIR` **iff `paths.home !== os.homedir()`** (Table A); `CODEX_HOME` stays unconditional; update the two comment blocks (top-of-file `ENV_PASSTHROUGH` note ~lines 35-43 and the in-branch note ~lines 190-193) to state the conditional + Amendment 5. Win32 branch UNCHANGED. |
| modify | tests/unit/scheduler-runjob.test.js | Add three pure `buildCleanEnv` tests: unredirected→var ABSENT, redirected→var PRESENT+correct, and unredirected + hostile ambient `CLAUDE_CONFIG_DIR`→still ABSENT (omission ≠ inheritance). |
| modify | tests/unit/sync-repoint.test.js | Correct the stale A10 comment (~lines 235-241) to state the conditional; add one inline assertion in the existing POSIX A10 test documenting it exercises the **redirected** branch (`paths.home !== os.homedir()`). Do NOT change its pass/fail assertions. |
| modify | docs/adr/0025-hermetic-runtime-profiles.md | Append **Amendment 5** (text in this spec) correcting Amendment 4's diagnosis and recording the fix + its hermetic argument. |

## Exact contracts

Resolve the emission rule from **Table A** (below). Operative change in
`buildCleanEnv`, POSIX branch — replace the unconditional `CLAUDE_CONFIG_DIR`
assignment:

```js
// A7/A10 + Keychain (WP-cleanenv-keychain-auth, ADR-0025 Amendment 5): config
// roots are reconstructed deterministically beneath the BOUND home and are NEVER
// inherited — this env is built FROM SCRATCH, so an ambient CLAUDE_CONFIG_DIR/
// CODEX_HOME can never leak in (CLAUDE_CONFIG_DIR is absent from ENV_PASSTHROUGH).
// CLAUDE_CONFIG_DIR is OMITTED when the home is unredirected (paths.home ===
// os.homedir()): with it set, claude >=2.1.216 ignores the macOS login Keychain
// — its ONLY credential store since it migrated ~/.claude/.credentials.json out
// of existence — and 401s. Omitting it lets claude use its own default resolution
// (HOME/.claude, where HOME is code-set to paths.home, PLUS the Keychain),
// restoring production subscription auth in BOTH terminal and launchd. When the
// home IS redirected (a harness/sandbox: paths.home !== os.homedir()), KEEP it
// explicit so the brain stays strictly confined to the redirected config and can
// never fall through to the real user's Keychain.
if (paths.home !== os.homedir()) {
  env.CLAUDE_CONFIG_DIR = path.join(paths.home, '.claude');
}
env.CODEX_HOME = path.join(paths.home, '.codex');
```

Behavior:
- Production dream/routine (terminal AND launchd), unredirected home →
  `CLAUDE_CONFIG_DIR` **absent** → claude resolves `HOME/.claude` + Keychain → authenticates.
- Harness/sandbox with a redirected `paths.home` → `CLAUDE_CONFIG_DIR` = `<paths.home>/.claude`
  → Keychain suppressed, config confined to the redirect (unchanged from today).
- `CODEX_HOME`, `HOME`, `USER`, `PATH`, `WIENERDOG_JOB`, passthroughs → unchanged.
- Win32 branch → unchanged (Table A row).

## Contract reference (activation trigger fires: (v) authority boundary + (vii) mirrored surfaces)

Wienerdog EMITS the child env but claude OWNS credential resolution and lifecycle
(v); and the emission rule is mirrored across code, ADR, tests, acceptance, and
verification (vii). Canonical facts live in **Table A**; all prose/tests/greps below
DEFER to it.

### Table A — `buildCleanEnv` credential-root env emission (canonical)

| Var | Branch / condition | Emitted value | Why |
|-----|--------------------|---------------|-----|
| `CLAUDE_CONFIG_DIR` | POSIX, home **unredirected** (`paths.home === os.userInfo().homedir`) | **ABSENT (omitted)** | claude falls back to its own default resolution: `HOME/.claude` (HOME is code-set to `paths.home`) **plus** the macOS login Keychain — the only credential store on claude ≥ 2.1.216. Setting it suppresses the Keychain → 401. |
| `CLAUDE_CONFIG_DIR` | POSIX, home **redirected** (`paths.home !== os.userInfo().homedir`), or `os.userInfo()` **throws** (fail closed) | `path.join(paths.home, '.claude')` | Confinement to the redirected config; Keychain deliberately suppressed so a harness/sandbox does not reach the real user's live credentials. Residual: this relies on claude continuing to honor the var as a Keychain-suppressing signal (ADR-0025 Amendment 5, owner-accepted). |
| `CLAUDE_CONFIG_DIR` | **win32** (any home) | `path.join(paths.home, '.claude')` (unchanged) | Windows auth is file-based under `USERPROFILE`; no Keychain; not in incident scope. Claude-only, POSIX-only fix. |
| `CODEX_HOME` | **all** branches (unchanged) | `path.join(paths.home, '.codex')` | Codex auth is file-based (`~/.codex/auth.json`); no evidence any codex version stores auth outside `CODEX_HOME`, so no Keychain-suppression defect. Codex question recorded as a follow-up (Out of scope). |
| `HOME` | POSIX (unchanged) | `paths.home` | The deterministic bound home from which claude derives `~/.claude`; keeps the config root pinned to `paths.home` even when `CLAUDE_CONFIG_DIR` is omitted. |
| Never-inherited invariant | all | `CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`ANTHROPIC_API_KEY` are NOT in `ENV_PASSTHROUGH` | Env is built from scratch; omitting a var does not admit any ambient value. |

The comparison is a literal string `===`; no canonicalization is added
(realpath'ing here would be unrequested scope).

> **Amendment (2026-07-24, Codex adversarial review — maintainer-directed).** The
> unredirected baseline is `os.userInfo().homedir` (passwd/getpwuid — env-
> independent), NOT `os.homedir()` as this spec originally said: `os.homedir()`
> on POSIX reads `process.env.HOME` live, so a HOME-redirected harness/sandbox
> (the real redirection mechanism) would move BOTH sides of the comparison,
> wrongly take the omit branch, and expose the real login Keychain to a
> sandboxed brain. If `os.userInfo()` throws (no passwd entry), the guard fails
> CLOSED (the var is kept — loud 401, never silent exposure). References to
> `os.homedir()` as the baseline elsewhere in this spec (Current state, Exact
> contracts, Security analysis, Acceptance criteria, Verification steps, the
> original ADR Amendment 5 text) predate this amendment and are superseded by
> this table. Additionally, the redirected branch's confinement is an
> owner-accepted fail-open residual (it relies on claude honoring
> `CLAUDE_CONFIG_DIR` as a Keychain-suppressing signal), and the three new
> scheduler-runjob tests pass `'darwin'` explicitly (they would otherwise hit
> the win32 branch on Windows), plus a fourth entrypoint-shaped test proves the
> HOME-redirected `getPaths(process.env)` path KEEPS the var.

### Mirrored Surface Checklist (each defers to Table A)

- [x] Deliverables-table cells — the run-job.js row states the conditional; the test/ADR rows point here.
- [x] Acceptance criteria — the two-branch outcomes + never-inherited invariant.
- [x] Verification commands / greps — the node two-branch one-liner + `--test-name-pattern buildCleanEnv` + the `grep '\.CLAUDE_CONFIG_DIR *='` sole-site check.
- [x] Current-state description — the unconditional-set-sites + inheritance chain.
- [x] Operative prose — Exact contracts, Security analysis, ADR Amendment 5 text.
- [x] Tests — the four new scheduler-runjob tests (three per the original spec, `'darwin'`-pinned, plus the entrypoint-shaped HOME-redirect test per the Amendment) + the sync-repoint redirected-branch annotation.

## Security analysis (this WP touches the A7/A10 / ADR-0025 clean-env boundary)

The clean-env boundary's guarantee: **the parent env cannot influence the child** —
a hostile ambient value (via `environment.d`, `launchctl setenv`, an inherited shell)
must not relocate the model's credential root, config root, or account. Argue each
point precisely:

1. **Omitting ≠ inheriting.** `buildCleanEnv` builds `env` FROM SCRATCH and never
   copies `process.env.CLAUDE_CONFIG_DIR` (it is absent from `ENV_PASSTHROUGH`). The
   fix only *stops writing* the var in the unredirected branch; the child still
   receives NO attacker-controllable value for it. A hostile `CLAUDE_CONFIG_DIR=/evil`
   does not appear in the child either before or after this change (asserted by the
   new unredirected + hostile-ambient test). The hermetic guarantee is preserved.
2. **The config root stays code-bound.** `HOME` is set explicitly to `paths.home`
   (never inherited), and claude derives `~/.claude` from `HOME`. So even with
   `CLAUDE_CONFIG_DIR` omitted, the config root is deterministically `paths.home/.claude`
   — the same directory the explicit value named. The only added behavior is claude's
   own internal default resolution gaining Keychain access, identical to what production
   had **before 0.10.0** (when the dream authenticated nightly).
3. **No widened attack surface / no path-resolution influence.** `ENV_PASSTHROUGH` is
   unchanged — still the fixed 2-var allowlist (`WIENERDOG_HOME`, `WIENERDOG_VAULT`),
   fully code-owned. `ANTHROPIC_API_KEY` remains stripped (ADR-0009). No env value flows
   from parent to child that did not before. An in-scope scheduler-env writer still
   cannot move the credential/config root without a descriptor-digest drift (A7/A10),
   because the root is pinned by the code-set `HOME`, not by an inheritable var.
4. **WP-broker-e2e-terminal-auth approach-3 checklist item, addressed:** "the passthrough
   is a fixed allowlist of named vars … and cannot let an attacker-controlled env value
   widen the child's capability or path resolution." This WP adds **no** passthrough — it
   *removes* an emission in one branch — so the allowlist is literally unchanged and no
   attacker-controlled value is admitted. Production behavior for the redirected/sandbox
   branch is unchanged; the unredirected branch returns to pre-0.10.0 default resolution.
5. **Redirect fidelity is a security feature here, not a regression:** a redirected home
   (harness/sandbox) KEEPS the explicit `CLAUDE_CONFIG_DIR` precisely so a sandboxed brain
   is confined to the redirected config and can NEVER fall through to the real user's
   Keychain credentials. The asymmetry is deliberate and tested.

## ADR-0025 Amendment 5 (append verbatim under `## Amendments`, after Amendment 4)

```markdown
### Amendment 5 (2026-07-24) — CLAUDE_CONFIG_DIR, not launchd-vs-terminal, is what suppressed Keychain auth; buildCleanEnv omits it on an unredirected home

Amendment 4 diagnosed the auth failure as an environment limitation — "launchd
reaches the gui-session Keychain, a terminal `buildCleanEnv` does not." **That
diagnosis was wrong.** A 16-experiment spike (WP-broker-e2e-terminal-auth) and a
production-confirmed incident (2026-07-24, claude 2.1.217) established the true
mechanism:

- claude ≥ 2.1.216 **migrated its OAuth token into the macOS login Keychain**
  (`security` item `Claude Code-credentials`) and **deleted
  `~/.claude/.credentials.json`**. The Keychain is now its only credential store.
- When `CLAUDE_CONFIG_DIR` is set in the child env — **even to the exact default
  `~/.claude`** — claude looks ONLY for file credentials and ignores the Keychain,
  so it 401s (`OAuth session expired and could not be refreshed`). This is true in
  **both** launchd and terminal contexts; it is NOT launchd-vs-terminal.
  `buildCleanEnv`'s POSIX branch always set `CLAUDE_CONFIG_DIR`, so it always
  suppressed the Keychain. Amendment 4's earlier "launchd works" observation was a
  transient artifact (a not-yet-expired file/session and a pre-auth "Unknown
  command" slash rejection that masked the error); once the file cred was gone and
  expired, launchd 401'd too, surfaced by the 0.10.0 non-vacuity guard.
- Spike experiments D1 (terminal) and L1 (launchd): the identical minimal env
  **without** `CLAUDE_CONFIG_DIR` authenticates in both contexts.

**The fix (WP-cleanenv-keychain-auth):** `buildCleanEnv` (POSIX) OMITS
`CLAUDE_CONFIG_DIR` when the home is unredirected (`paths.home === os.homedir()`),
so claude uses its own default resolution — `HOME/.claude` (HOME is code-set to
`paths.home`) plus the Keychain — restoring the pre-0.10.0 production auth path in
terminal and launchd alike. When the home IS redirected (a harness/sandbox:
`paths.home !== os.homedir()`), the var is KEPT explicit so the brain stays confined
to the redirected config and never reaches the real user's Keychain.

**Hermetic argument:** omitting a var from an env built FROM SCRATCH is not
inheritance — `CLAUDE_CONFIG_DIR` is absent from `ENV_PASSTHROUGH`, so no ambient
value ever reaches the child; the config root stays code-bound via the explicit
`HOME`; `ANTHROPIC_API_KEY` remains stripped (ADR-0009). The only behavior change is
claude's internal default resolution regaining Keychain access — identical to what
production had before 0.10.0. `CODEX_HOME` is unchanged (codex auth is file-based
under `~/.codex`; no Keychain-suppression defect observed). Win32 is unchanged
(file-based auth under `USERPROFILE`).

**Consequence for the harnesses:** WP-133 `negative` (terminal, full `process.env`)
is unaffected. WP-142 `broker-e2e`, which goes through `runJob → buildCleanEnv` under
the real (unredirected) home, now reaches the Keychain from a terminal — the LP2
unblock. Its `AUTH-BLOCKED` short-circuit removal is WP-broker-e2e-terminal-auth's
own follow-up, not this WP.
```

## Implementation notes & constraints

- **POSIX-only, claude-only.** Change the POSIX branch's `CLAUDE_CONFIG_DIR` set only.
  Leave `CODEX_HOME` unconditional and the entire win32 branch untouched (Table A).
  Rationale is in Table A + the ADR amendment; do not extend scope to win32/codex.
- **Use `os.homedir()` directly** (already imported). Do not add a seam or mock `os` —
  the tests control the branch by passing an explicit `paths.home` (equal to
  `os.homedir()` for unredirected, a temp dir for redirected). `buildCleanEnv`'s POSIX
  branch reads only `paths.home` from `paths`, so a bare `{ home: <x> }` object is a
  valid argument in the pure tests.
- **Do not re-order or re-touch** the `USER`/`PATH`/passthrough logic; the edit is the
  single `if`-guard around one assignment plus the two comment blocks.
- **sync-repoint.test.js** edit is comment-accuracy + one documenting assertion only —
  its `paths.home` is a temp dir so it stays in the KEEP branch and its existing
  assertions must remain green. Do NOT convert it to the unredirected branch.
- When uncertain: choose the simpler option and record it under "Decisions made" in the
  PR. Do NOT expand scope.

## Security checklist

- [x] No new untrusted identifier flows into a filesystem path or shell command: the
      fix REMOVES an emission in one branch. `path.join(paths.home, '.claude')` already
      existed; `paths.home` is code-derived (`getPaths`), and a redirected home value is
      validated for `WIENERDOG_*` overrides by `assertSafeOverride`. `HOME` is
      intentionally unvalidated (OS-standard) and is not newly consumed here.
- [x] The clean-env boundary is argued precisely in the Security analysis section above
      (omission ≠ inheritance; `ENV_PASSTHROUGH` unchanged; `ANTHROPIC_API_KEY` still
      stripped; config root stays code-bound via `HOME`).

## Acceptance criteria

- [ ] POSIX, unredirected home (`paths.home === os.homedir()`): `buildCleanEnv` output has
      NO `CLAUDE_CONFIG_DIR` key, and `CODEX_HOME === path.join(os.homedir(), '.codex')`,
      `HOME === os.homedir()` (Table A rows 1, 4, 5).
- [ ] POSIX, redirected home (`paths.home !== os.homedir()`): `CLAUDE_CONFIG_DIR ===
      path.join(paths.home, '.claude')` (Table A row 2).
- [ ] Unredirected home + hostile ambient `process.env.CLAUDE_CONFIG_DIR='/evil/claude'`:
      the var is still ABSENT from the output (omission ≠ inheritance; never `/evil/claude`).
- [ ] Win32 branch output unchanged (`sync-repoint` win32 A10 test still green).
- [ ] `tests/unit/sync-repoint.test.js` A10 tests still pass; their comment reflects the
      conditional and the POSIX test documents it exercises the redirected branch.
- [ ] `npm test` and `npm run lint` pass.
- [ ] `buildCleanEnv` is a pure function; calling it twice with the same args yields
      identical output (no side effects — inherent, but do not regress it).

## Verification steps (run these; paste output in the PR)

```bash
# Both branches + never-inherited invariant, deterministic:
node -e "
const rj=require('./src/cli/run-job'); const os=require('node:os');
const p=require('node:path'); const assert=require('node:assert/strict');
const saved=process.env.CLAUDE_CONFIG_DIR; process.env.CLAUDE_CONFIG_DIR='/evil/claude';
const u=rj.buildCleanEnv({home:os.homedir()},'dream');
const r=rj.buildCleanEnv({home:'/tmp/wd-redir'},'dream');
if(saved===undefined)delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR=saved;
assert.ok(!('CLAUDE_CONFIG_DIR' in u),'unredirected: CLAUDE_CONFIG_DIR absent');
assert.equal(u.CODEX_HOME, p.join(os.homedir(),'.codex'));
assert.equal(u.HOME, os.homedir());
assert.equal(r.CLAUDE_CONFIG_DIR, p.join('/tmp/wd-redir','.claude'),'redirected: present');
console.log('OK: unredirected omits (even vs hostile ambient), redirected keeps');
"

# Sole set-site proof (should print only run-job.js):
grep -rn '\.CLAUDE_CONFIG_DIR *=' src/

npm test -- --test-name-pattern buildCleanEnv
npm test -- --test-name-pattern "sync-repoint: buildCleanEnv"
npm test
npm run lint
```

Follow-up verification (maintainer-run; NOT an acceptance gate for this P0 — recorded
so the fix is confirmed end-to-end):
- launchd kickstart of the real dream job authenticating and committing a real dream.
- `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:broker-e2e` becoming runnable from a
  terminal (D1 shows terminal now works) — the LP2 unblock, completed by
  WP-broker-e2e-terminal-auth.

## Out of scope (do NOT do these)

- **WP-broker-e2e-terminal-auth** (Ready): removing its `AUTH-BLOCKED` short-circuit,
  its harness change, and flipping its status/decisions to reflect that approach-3 landed
  here — its own follow-up. Do not edit `tests/scenarios/broker-e2e/run-broker-e2e.js`.
- **LP2 harness re-enablement** and any `scenarios:*` change.
- **`CODEX_HOME` behavior** — left unconditional. Follow-up question to record, do NOT
  resolve here: does any codex version store auth outside `CODEX_HOME` (e.g. a Keychain)
  such that an explicit `CODEX_HOME` suppresses it? No evidence today (codex auth is
  `~/.codex/auth.json`); if a future codex migrates auth to the Keychain, mirror this fix.
- **Win32 `CLAUDE_CONFIG_DIR`** — unchanged (no Keychain on Windows; unverified change avoided).
- **The `buildCleanEnv` PATH-ordering concern** (Homebrew-before-/usr/bin) — separate follow-up.
- Any change to routine/dream CONTAINMENT behavior or the `ENV_PASSTHROUGH` allowlist.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled `fix(run-job): don't suppress claude Keychain auth on an unredirected home (WP-cleanenv-keychain-auth)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
