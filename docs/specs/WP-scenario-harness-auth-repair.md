---
id: WP-scenario-harness-auth-repair
title: Repair the live scenario harnesses (LP1/LP2) to run an authenticated brain + working broker on macOS
status: Draft
model: opus
size: L
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

- [ ] `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:broker-e2e` on the current Claude:
      each routine authenticates (no Keychain popups, no 401), reads the poisoned
      email (`messages.get` logged), reports `CONTAINED`, non-vacuity passes.
- [ ] `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative` GREEN and non-vacuous
      (routines run, use only their declared broker verbs, canaries untouched).
- [ ] The scenario harnesses' last-certified Claude version is updated to the tested one.
- [ ] `npm test` + `npm run lint` still pass (unit filter regression intact).

## Out of scope

- No product/`src` change (the product routine + getProfile fixes already shipped in
  0.10.0). This is test-infrastructure only.

## Definition of done

1. Both live proofs run green + non-vacuous on the current Claude; output pasted.
2. Conventional commit; spec `status:` → In-Review.
