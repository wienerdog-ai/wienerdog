---
id: WP-broker-e2e-terminal-auth
title: Make the LP2 broker-e2e proof runnable from a terminal (reach Claude Code's macOS Keychain)
status: Ready
model: opus
size: M
depends_on: [WP-scenario-harness-auth-repair]
adrs: [ADR-0009, ADR-0025]
epic: p0-ungate
---

# WP-broker-e2e-terminal-auth: get LP2 to authenticate off a terminal

## Context (read this, nothing else)

`tests/scenarios/broker-e2e/run-broker-e2e.js` (LP2, WP-142) is the POSITIVE
containment proof: it runs the REAL production routine path — `runJob → clean env
→ per-run broker MCP config → claude -p → the routine model calling broker verbs`
— against a poisoned email and asserts, from the fake-Google call log, that no
disallowed Google effect occurs. It complements LP1 (`scenarios:negative`), which
proves the hostile CONFIG (rogue MCP / hooks / Bash) is excluded but does not
exercise a routine actually reading a poisoned email.

During the 0.10.0 un-freeze (WP-scenario-harness-auth-repair, 2026-07-22) LP2 was
repaired to run an authenticated brain + working broker, and its machinery is
proven working (the broker launches, the `_alert` self-send is excluded, real
broker calls are recorded). But it **cannot authenticate when run from a terminal**,
for a reason entirely outside Wienerdog:

- **Claude Code 2.1.216 stores its OAuth token in the macOS login Keychain** (item
  `Claude Code-credentials`) and has **migrated `~/.claude/.credentials.json` out of
  existence** — so the older "copy the creds file in" approach no longer applies.
- The dream/routine production path runs the brain under `buildCleanEnv`
  (`src/cli/run-job.js`), a deliberately MINIMAL env (ADR-0025 hermetic runtime).
  A `buildCleanEnv`-spawned brain reaches the Keychain **under launchd** (verified:
  the scheduled dream committed under `buildCleanEnv` at 03:30 2026-07-22) but
  **NOT from a terminal** — it 401s (`OAuth session expired and could not be
  refreshed`) even with a freshly-refreshed session.
- LP1 authenticates only because it spawns `claude -p` under the FULL `process.env`,
  where the Keychain is reachable.

So the gap is narrow and specific: **terminal + `buildCleanEnv` cannot reach the
Keychain.** This is NOT a product bug (production auth works) and NOT a containment
gap (LP1 proves containment live). It just means LP2's positive read-path is
currently unprovable from a normal `npm run scenarios:broker-e2e` invocation.

Invariant to respect: LP2 must remain **production-faithful** — it exists to prove
the REAL `runJob → buildCleanEnv` path, so any fix must not silently give the brain
a fuller env than production would (that would make the proof vacuous). ADR-0009:
subscription auth only, `ANTHROPIC_API_KEY` stripped from every child.

## Current state

- `tests/scenarios/broker-e2e/run-broker-e2e.js` — repaired; runs the brain under
  the real home, symlinks `<core>/app/current` at the repo checkout, excludes the
  `_alert` self-send, and **short-circuits with an explicit `AUTH-BLOCKED` message**
  when the transcript shows the terminal Keychain 401 (so it fails informatively,
  not as a false containment failure).
- `docs/adr/0025-hermetic-runtime-profiles.md` — Amendment 4 documents the
  Keychain-only reality and the terminal limitation.
- `src/cli/run-job.js` — `buildCleanEnv(paths, name, platform)` builds the minimal
  child env (POSIX branch sets `HOME`, a fixed `PATH`, `CLAUDE_CONFIG_DIR`,
  `CODEX_HOME`, `USER`, and passes through only `WIENERDOG_HOME`/`WIENERDOG_VAULT`).
- Keychain item confirmed present: `security find-generic-password -s
  "Claude Code-credentials"` succeeds; `~/.claude/.credentials.json` is absent.

## The decision this WP must make (spike, then implement)

Three candidate approaches. **Spike the cheapest-viable first, in order, and stop at
the first that authenticates a `buildCleanEnv`-spawned brain from a terminal.**
Record the choice + the spike evidence in the PR "Decisions made".

1. **File-credential path (cheapest — try first).** Export the token from the
   Keychain (`security find-generic-password -w -s "Claude Code-credentials"`) and
   seed it as a `.credentials.json` in the config dir the brain reads, then test
   whether `claude -p` under `buildCleanEnv` honors that file instead of the
   Keychain. If it authenticates, LP2 seeds the file per run (a redirected temp
   `HOME` + seeded `<home>/.claude/.credentials.json`, so nothing touches the real
   config). **Risk:** 2.1.216 just migrated files OUT, so it may ignore a
   manually-created one — the spike must confirm before building on it. This keeps
   the production env faithful (only the credential source differs, and only in the
   harness).

2. **Transient launchd wrapper (most production-faithful — fall back here).** Drive
   the routine spawn through a real, short-lived user launchd job so it inherits the
   gui-session Keychain exactly as production does. Most faithful to what LP2
   proves; macOS-only; needs plist write + `launchctl bootstrap`/`kickstart`/`bootout`
   scaffolding + result collection in the harness. No `src` change.

3. **`buildCleanEnv` env-passthrough (LAST resort — discouraged).** Identify the
   specific env var(s) that carry terminal Keychain access and pass them through in
   `buildCleanEnv`. This is a PRODUCT change to a security-relevant clean-env
   boundary; only pursue if 1 and 2 both fail, and only after proving the added
   passthrough cannot widen the hermetic env's real-world attack surface (it must be
   scoped so production behavior is unchanged). Requires its own review + an
   ADR-0025 amendment.

## Deliverables (permission boundary — touch ONLY these)

<!-- The spike picks the approach; not every row is used. Record which in the PR. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/scenarios/broker-e2e/run-broker-e2e.js | implement the chosen approach (1 or 2); on success the AUTH-BLOCKED short-circuit no longer fires |
| create | tests/scenarios/broker-e2e/launchd-run.js | ONLY if approach 2 — the transient-launchd wrapper helper |
| modify | src/cli/run-job.js | ONLY if approach 3 (discouraged) — scoped Keychain env passthrough |
| modify | docs/adr/0025-hermetic-runtime-profiles.md | Amendment 5: how LP2 reaches the Keychain from a terminal, and why it stays production-faithful |

## Implementation notes & constraints

- **No fuller env than production.** Do not "fix" LP2 by spawning the brain under
  the full `process.env` — that is what LP1 does and would make LP2's production
  fidelity vacuous. The brain must run under `buildCleanEnv`; only the credential
  REACH may differ, and only in the harness.
- **No real-config mutation.** If approach 1, seed the exported token into a
  disposable temp `HOME`/`.claude`, never the maintainer's real `~/.claude`.
- Approach 2: launchd plists do not expand `~`/`$HOME` — absolute paths only; always
  `bootout` the transient job in a `finally`, even on failure.
- The token exported in approach 1 is a live credential — keep it in the temp tree
  (removed in `finally`), never log it.
- macOS-only proof; on non-macOS the harness already skips unless
  `WIENERDOG_RUN_SCENARIOS=1` and should degrade cleanly.

## Security checklist

- [ ] Approach 3 only: the passthrough is a fixed allowlist of named vars, fully
      anchored, and cannot let an attacker-controlled env value widen the child's
      capability or path resolution (the clean env's whole point, WP-157/ADR-0025).
- [ ] The exported OAuth token (approach 1) is written only under the disposable
      temp tree and removed with it; it never reaches a log, the vault, or the fake
      call log.

## Acceptance criteria

- [ ] `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:broker-e2e` authenticates every
      routine from a normal terminal invocation (no `AUTH-BLOCKED`), reads the
      poisoned email (`messages.get` logged), reports `CONTAINED`, non-vacuity passes.
- [ ] The brain still runs under `buildCleanEnv` (grep/inspection confirms LP2 did
      not switch to the full `process.env`).
- [ ] `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative` still GREEN (no
      regression).
- [ ] `npm test` + `npm run lint` still pass.

## Verification steps (run these; paste output in the PR)

```bash
WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:broker-e2e   # maintainer-run
WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative     # maintainer-run
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to routine/broker CONTAINMENT behavior — a real containment gap is a
  spec-gap back to wd-architect (WP-136..WP-141), never a harness patch.
- The separate `buildCleanEnv` PATH-ordering concern (it lists `/opt/homebrew/bin`
  ahead of `/usr/bin`, so a group-writable Homebrew git is refused for the dream) —
  related run-job/environment territory, but its own follow-up.

## Definition of done

1. LP2 authenticates + proves containment from a terminal; output pasted.
2. Conventional commits; PR titled `test(scenarios): title (WP-broker-e2e-terminal-auth)`.
3. PR "Decisions made" records the chosen approach + the spike evidence for why the
   earlier approaches were or weren't viable.
4. This spec's `status:` flipped to `In-Review` in the same PR.
