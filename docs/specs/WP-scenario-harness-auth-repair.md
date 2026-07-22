---
id: WP-scenario-harness-auth-repair
title: Repair the live scenario harnesses (LP1/LP2) to run an authenticated brain + working broker on macOS
status: Done
model: opus
size: M
depends_on: [WP-routine-plaintext-trigger, WP-gws-getprofile-via-read]
adrs: [ADR-0009, ADR-0025]
epic: p0-ungate
---

# WP-scenario-harness-auth-repair: make the live proofs actually run

## Context (read this, nothing else)

The two live-proof scenario harnesses — `tests/scenarios/negative/run-negative.js`
(LP1, WP-133) and `tests/scenarios/broker-e2e/run-broker-e2e.js` (LP2, WP-142) —
were discovered (2026-07-21/22, during the 0.10.0 un-freeze) to be **fundamentally
non-functional**: they never ran an authenticated `claude -p` brain with a working
broker, so every prior "PASS" was VACUOUS (the routines no-op'd and the containment
assertions held trivially). They are gated behind `WIENERDOG_RUN_SCENARIOS=1`, not
in `npm test`/CI, so this went unnoticed.

Root causes found, in the order they surfaced (each masked the next):

1. **Bare-slash trigger** — routines spawned with `-p "/<skill>"`; Claude ≥2.1.216
   errors `Unknown command`. FIXED in product (WP-routine-plaintext-trigger).
2. **Stale keychain-auth assumption** — both harnesses assumed Claude subscription
   creds come from the macOS keychain and a redirected config dir "still
   authenticates". FALSE: creds are file-based in
   `CLAUDE_CONFIG_DIR/.credentials.json`. With a fresh temp config dir the brain is
   "not logged in". (Verified: `CLAUDE_CONFIG_DIR=$(mktemp -d) claude -p` → not
   logged in; copying only `.credentials.json` in → OK.)
3. **Broker command points at a non-existent launcher** — the broker MCP command is
   `node <core>/app/current/bin/wienerdog.js gws _broker` (`vendor.currentBin`, the
   WP-157 out-of-tree launcher). The harnesses publish no vendored app, so the MCP
   server can't launch → the routine sees "No such tool available". Fix (validated):
   symlink `<core>/app/current` → the repo checkout; the broker then runs the real
   code while `WIENERDOG_HOME=<core>` keeps the seeded fake-Google deps + creds.
4. **`buildCleanEnv` redirects HOME to a temp dir** (run-job.js:54,77 — sets
   `HOME`+`CLAUDE_CONFIG_DIR` under `paths.home`). broker-e2e uses `runJob`, so the
   brain runs with `HOME=<temp>`, which breaks Claude's macOS **Keychain** access →
   `401 Invalid authentication credentials` + repeated Keychain-access POPUPS on the
   maintainer's machine. (negative spawns claude directly with the real HOME, so it
   avoids this — but shares causes 1–3.)
5. **used-tools check omits broker verbs** — `run-negative.js` built its used-tools
   `declared` set from `profile.tools` (`Read`) only, flagging a routine's own
   declared `mcp__<broker>__<verb>` calls as "undeclared". (The inventory check via
   `undeclaredMcpFailures` was already fixed; the used-tools loop was missed.)
6. **`_alert` watchdog miscounted** — when a routine fails (e.g. the auth 401), the
   run-job watchdog fires a self-only `_alert` email (`getProfile`+`messages.send`);
   the harness counted those against the routine's allowlist / grant-flip test as
   containment breaches. They are the legitimate fail-loud alert (structurally
   self-only), not the routine.

**No real product containment breach was ever observed** — every "failure" traced to
a harness defect or to the routine failing to authenticate.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/scenarios/broker-e2e/run-broker-e2e.js | (a) do NOT override HOME in `seedCore` (`getPaths({WIENERDOG_HOME, WIENERDOG_VAULT})` — let `paths.home`=real so `buildCleanEnv` gives the brain the real HOME/Keychain; isolation stays via `--setting-sources ''`); (b) symlink `<core>/app/current` → REPO_ROOT so the broker launcher resolves; (c) exclude the `_alert` self-send from the out-of-allowlist + grant-flip checks (it is not a routine call); (d) NO leftover WD-DIAG diagnostic |
| modify | tests/scenarios/negative/run-negative.js | include the profile's `mcp__<broker>__<verb>` in the used-tools `declared` set; apply the same auth approach (real HOME) so the brain authenticates; refresh the stale keychain comment |
| modify | docs/adr/0025-hermetic-runtime-profiles.md | amendment: the scenario harnesses run the brain under the REAL HOME + `--setting-sources ''` isolation (production-faithful), NOT a redirected HOME (which breaks macOS Keychain auth); the vendored-launcher symlink; the `_alert`-vs-routine distinction |

## Acceptance criteria

- [x] `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative` GREEN and non-vacuous
      (routines run live, use only their declared broker verbs, canaries untouched) —
      **verified 2026-07-22 on claude 2.1.216.**
- [~] `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:broker-e2e` — **AUTH-BLOCKED from a
      terminal, by design of the environment, not a harness defect** (see Outcome).
      The machinery is proven working (broker launches, `_alert` excluded, 2 real
      calls recorded); the brain cannot reach the macOS Keychain under
      `buildCleanEnv` from a terminal.
- [x] `npm test` + `npm run lint` still pass (unit filter regression intact).

## Outcome (2026-07-22)

The live-proofing surfaced an **external Claude Code change that invalidates the
spec's premise**: Claude Code 2.1.216 stores its OAuth token in the macOS **login
Keychain** (item `Claude Code-credentials`) and has **migrated
`~/.claude/.credentials.json` out of existence**. Auth is therefore Keychain-backed,
and what matters is whether the spawned brain can reach the Keychain:

- **`scenarios:negative` (LP1) — PASS, live, non-vacuous.** It spawns `claude -p`
  under the full `process.env`, so the brain reaches the Keychain; the hostile rogue
  MCP + SessionStart hook + Bash rule are excluded, canaries untouched, inventory ⊆
  declared. This is the terminal-runnable live containment proof.
- **`scenarios:broker-e2e` (LP2) — AUTH-BLOCKED from a terminal.** It runs the
  production `runJob → buildCleanEnv` path, whose minimal env cannot reach the
  Keychain from a terminal (401, even with a freshly-refreshed session). The SAME
  path authenticates under **launchd** — verified by the scheduled dream committing
  under `buildCleanEnv` at 03:30 2026-07-22. So this is an **environment limitation,
  not a product bug and not a containment gap.** LP2 needs a launchd/gui session (or
  a future `run-job` change to reach the Keychain under `buildCleanEnv`); the harness
  now short-circuits with an explicit `AUTH-BLOCKED` message and both it and ADR-0025
  Amendment 4 document the limitation.

**Maintainer decision (Gyula, 2026-07-22): close on the LP1 live proof + the
production-dream evidence + wd-reviewer's APPROVE.** Follow-up (separate spec): let a
`buildCleanEnv`-spawned brain reach the Keychain (or ship a file-credential path) so
LP2 is terminal-runnable — OR wire LP2 through a transient launchd job.

## Out of scope

- No product/`src` change (the product routine + getProfile fixes already shipped in
  0.10.0). This is test-infrastructure only.
