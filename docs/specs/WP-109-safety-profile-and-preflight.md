---
id: WP-109
title: Fail-closed safety-profile capability state + `wienerdog safety` preflight
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0005]
branch: wp/109-safety-profile-and-preflight
---

# WP-109: Fail-closed safety-profile capability state + `wienerdog safety` preflight

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory vault, skills,
hooks, and OS-native scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just
files** — no daemons, no servers, no telemetry, nothing that outlives its job.

A 2026-07-15 security audit found that several powerful features are enabled the
moment a file happens to exist (a Google token, a `skill:` job line in
config.yaml, a daily note with a `## Summary`), with **no explicit record of
whether that feature has actually been cleared as safe to use**. The audit's
first required action ("A0 — ship a fail-closed pre-use safety profile") is to
stop *inferring* safety from file presence and instead introduce an **explicit,
code-owned capability state** that is **BLOCKED by default** and can only be
opened by a reviewed code change in a future release — never at runtime, never by
an environment variable or CLI flag. The point: a half-configured machine must
never be mistaken for an approved one.

This WP builds ONLY that foundation: a small, pure module that declares the gates
and answers "is capability X allowed?" (it is not, yet), plus a read-only
`wienerdog safety` command that reports each gate. It changes **no feature
behavior** — later WPs (WP-110, WP-111, WP-112) wire the individual features to
these gates. Shipping the module first, unused-by-features, is deliberate (the
same pattern as WP-083's ownership registry, which shipped before its consumers).

**Naming (important, from the fork's security working notes).** This repo already
has a `src/core/sandbox-guard.js` that is an *unrelated* advisory `WIENERDOG_HOME`
redirect check. **Do NOT call this new thing a "sandbox."** Its canonical name is
the **safety profile**, and each on/off switch is a **capability gate** (both
added to `docs/GLOSSARY.md` by this WP).

**The five capability gates** this profile declares (each maps to a P0 security
action that is not yet implemented + human-ratified, so all five are BLOCKED):

| Gate name | What it will guard | Wired by |
|-----------|--------------------|----------|
| `google-setup` | Connecting a Google account (`wienerdog gws auth`) | WP-110 |
| `gws-use` | Using Google credentials (`gws` read/draft/send/cal/drive/_alert) | WP-110 |
| `external-content-routine` | Scheduling `skill:` routines that read external content | WP-111 |
| `daily-summary-injection` | Injecting the daily note's `## Summary` into the digest | WP-112 |
| `identity-auto-activation` | The dream auto-editing the injected identity files | WP-112 |

## Current state

- **Nothing exists** for a capability state. Safety is inferred from file
  presence throughout the code.
- `src/core/errors.js` exports `WienerdogError` (expected user-facing failure; the
  CLI prints `wienerdog: <message>` and exits 1). Use it for the fail-closed throw.
- `bin/wienerdog.js` dispatches subcommands via a `commands` map
  (`init`, `sync`, `dream`, `schedule`, `run-job`, `doctor`, `uninstall`, `gws`,
  `grant`, …) and a `USAGE` string; each module exports `run(rest)`.
- CLI convention: read-only commands support `--json` for agent use (see
  `schedule list --json`); expected failures throw `WienerdogError`.
- Tests are `node:test` files under `tests/unit/`. There is an existing
  `tests/unit/sandbox-guard.test.js` (the UNRELATED redirect guard) — do not
  touch it or conflate names.
- `docs/GLOSSARY.md` lists canonical terms (e.g. **routine**, **digest**,
  **dreaming**); it has **no** entry for the safety profile yet.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/safety-profile.js | pure module: gate registry (all BLOCKED) + `requireCapability` / `isCapabilityAllowed` / `capabilityStatus` / `allowAll` |
| create | src/cli/safety.js | `wienerdog safety [--json]` read-only preflight |
| modify | bin/wienerdog.js | register the `safety` command + one USAGE line |
| modify | docs/GLOSSARY.md | add **safety profile** and **capability gate** canonical entries |
| create | tests/unit/safety-profile.test.js | unit-test the module (all branches) |
| create | tests/unit/safety-cli.test.js | subprocess-test `wienerdog safety` (text + `--json`) |

### Exact contracts

**1. `src/core/safety-profile.js`.** Pure; no filesystem, no env, no argv reads.

```js
'use strict';
const { WienerdogError } = require('./errors');

/** Canonical capability-gate names (GLOSSARY: capability gate). */
const CAPABILITY = {
  GOOGLE_SETUP: 'google-setup',
  GWS_USE: 'gws-use',
  EXTERNAL_CONTENT_ROUTINE: 'external-content-routine',
  DAILY_SUMMARY_INJECTION: 'daily-summary-injection',
  IDENTITY_AUTO_ACTIVATION: 'identity-auto-activation',
};

/** Fixed, plain-language description per gate (control-plane text; used by the
 *  preflight and the fail-closed message). */
const DESCRIPTION = {
  'google-setup': 'connecting a Google account is disabled',
  'gws-use': 'reading or sending Gmail, Calendar, and Drive is disabled',
  'external-content-routine': 'scheduling skill-based routines that read external content is disabled',
  'daily-summary-injection': 'injecting the daily note summary into the session digest is disabled',
  'identity-auto-activation': 'automatic dream edits to your identity files are disabled',
};

/** Deterministic gate order for the preflight + JSON. */
const ORDER = [
  'google-setup', 'gws-use', 'external-content-routine',
  'daily-summary-injection', 'identity-auto-activation',
];

/** THE FROZEN PROFILE (A0). Every gate BLOCKED. Opening a gate is a REVIEWED
 *  CODE CHANGE to this constant in a future release — never a runtime toggle,
 *  env var, or CLI flag. Object.freeze prevents same-process mutation. */
const FROZEN_PROFILE = Object.freeze({
  'google-setup': 'blocked',
  'gws-use': 'blocked',
  'external-content-routine': 'blocked',
  'daily-summary-injection': 'blocked',
  'identity-auto-activation': 'blocked',
});

/** @param {string} name @param {Record<string,string>} [profile]
 *  @returns {'blocked'|'allowed'} — throws on an unknown gate name (fail closed). */
function statusOf(name, profile = FROZEN_PROFILE) {
  const s = profile[name];
  if (s !== 'blocked' && s !== 'allowed') {
    throw new WienerdogError(`unknown or malformed capability gate: ${String(name)}`);
  }
  return s;
}

/** Non-throwing query. `profile` is a CODE-LEVEL test seam ONLY (see notes); a
 *  production caller passes nothing → the FROZEN_PROFILE.
 *  @param {string} name @param {Record<string,string>} [profile] @returns {boolean} */
function isCapabilityAllowed(name, profile = FROZEN_PROFILE) {
  return statusOf(name, profile) === 'allowed';
}

/** Throwing gate: no-op when allowed, else throws WienerdogError with a fixed
 *  fail-closed message that names the gate and the `wienerdog safety` command and
 *  states there is NO override.
 *  @param {string} name @param {Record<string,string>} [profile] */
function requireCapability(name, profile = FROZEN_PROFILE) {
  if (isCapabilityAllowed(name, profile)) return;
  throw new WienerdogError(
    `"${name}" is disabled in this release — ${DESCRIPTION[name] || 'this capability is not available'}. ` +
    'It stays off until Wienerdog’s pre-use security gates are cleared; ' +
    'run `wienerdog safety` to see the status. There is no flag or environment override.'
  );
}

/** @param {Record<string,string>} [profile]
 *  @returns {Array<{name:string, status:string, description:string}>} fixed order. */
function capabilityStatus(profile = FROZEN_PROFILE) {
  return ORDER.map((name) => ({ name, status: statusOf(name, profile), description: DESCRIPTION[name] }));
}

/** CODE SEAM for tests (and a future all-clear release): a frozen profile with
 *  every gate 'allowed'. Reachable only by a JS caller that imports and passes it;
 *  it is NEVER derived from env or argv, so it cannot open a gate in production. */
function allowAll() {
  const p = {};
  for (const name of ORDER) p[name] = 'allowed';
  return Object.freeze(p);
}

module.exports = {
  CAPABILITY, requireCapability, isCapabilityAllowed, capabilityStatus, allowAll,
};
```

**2. `src/cli/safety.js` — `wienerdog safety [--json]`.** Read-only; exit 0.

```js
'use strict';
const { capabilityStatus } = require('../core/safety-profile');

/** @param {string[]} argv @returns {Promise<void>} */
async function run(argv) {
  const rows = capabilityStatus();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  process.stdout.write('Wienerdog safety profile — pre-use freeze (P0 security gates not cleared).\n');
  process.stdout.write('Each capability stays BLOCKED until its gate is cleared in a reviewed release.\n\n');
  for (const r of rows) process.stdout.write(`  [${r.status}] ${r.name} — ${r.description}\n`);
  process.stdout.write('\nThere is no flag or environment override for a blocked gate.\n');
}

module.exports = { run };
```

Example (text): first data line is the two-space-indented
`[blocked] google-setup — connecting a Google account is disabled`.
Example (`--json`): an array of five `{name,status,description}` objects, every
`status` == `"blocked"`, in the `ORDER` above.

**3. `bin/wienerdog.js`.** Add `safety: () => require('../src/cli/safety'),` to the
`commands` map and a USAGE line under the command list, e.g. (two-space indent):
`safety      Show the pre-use security gates (all disabled until reviewed)`.

**4. `docs/GLOSSARY.md`.** Add two canonical entries (alphabetical-ish, near the
other mechanics terms), worded to match this module:

- **safety profile** — the code-owned, fail-closed record of which powerful
  capabilities are cleared for use (`src/core/safety-profile.js`). Every
  capability is BLOCKED until its security gate is opened by a reviewed release;
  there is no runtime/env/flag override. Inspect it with `wienerdog safety`. (Not
  a "sandbox" — that word means the unrelated `WIENERDOG_HOME` redirect guard.)
- **capability gate** — one named on/off switch in the safety profile
  (e.g. `gws-use`, `external-content-routine`). A blocked gate makes its feature
  fail closed before any side effect (no model spawn, no credential load).

## Implementation notes & constraints

- **Fail closed, no override (the whole point).** The profile is a frozen code
  constant. `requireCapability`/`isCapabilityAllowed` read ONLY that constant
  unless a caller *passes* a profile object. The `profile` parameter is a
  **code-level seam** for tests and a future all-clear release — exactly the
  precedent of `grant.js`'s `openTty` seam ("code-level test seam only … There is
  NO environment override"). **Never** read `process.env`, `process.argv`, or a
  config file to decide a gate. A future WP that opens a gate does so by editing
  `FROZEN_PROFILE` in a reviewed commit.
- **Pure + zero deps.** Plain Node ≥ 18, JSDoc types only, no new npm deps, no
  build step. No I/O in `safety-profile.js`.
- **Do not touch `sandbox-guard.js` or its test.** Different concern, colliding
  word — keep them separate (fork working-notes rule).
- **No feature is wired here.** If you find yourself editing `gws/`, `schedule.js`,
  `run-job.js`, `digest.js`, or `dream/` — stop; that is WP-110/111/112.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The gate decision derives ONLY from the frozen in-code constant (or a
      profile object a JS caller explicitly passes). No `process.env`,
      `process.argv`, config file, or file-presence check influences it — so no
      `--yes`, env var, or partially-configured file state can open a blocked gate.
      The fail-closed path (unknown/blocked gate) throws `WienerdogError`; it never
      returns "allowed" by default.

## Acceptance criteria

- [ ] `requireCapability(name)` with the default (frozen) profile throws
      `WienerdogError` for every one of the five gates; the message names the gate,
      names `wienerdog safety`, and states there is no override.
- [ ] `isCapabilityAllowed(name)` returns `false` for all five gates with the
      default profile, and `true` for all five when passed `allowAll()`.
- [ ] `statusOf`/`isCapabilityAllowed`/`requireCapability` throw on an unknown gate
      name (fail closed), never treat it as allowed.
- [ ] `capabilityStatus()` returns exactly the five gates in the fixed `ORDER`,
      each `status: 'blocked'`, each with its description.
- [ ] `wienerdog safety` prints all five gates as `[blocked]` and the
      "no … override" footer, exit 0; `wienerdog safety --json` prints a five-element
      array with every `status` == `"blocked"`, exit 0.
- [ ] No environment variable or CLI flag flips any gate to allowed (assert
      `requireCapability` still throws with e.g. `WIENERDOG_YES=1`/`--yes` present in
      the process env/argv — the module never reads them).
- [ ] `npm test` and `npm run lint` pass; no existing test changes behavior.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "safety-profile"
npm test -- --test-name-pattern "safety-cli"
node bin/wienerdog.js safety
node bin/wienerdog.js safety --json
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Wiring any feature to the gates (WP-110 gws; WP-111 scheduling; WP-112
  digest/identity). This WP only ships the module + preflight.
- Surfacing the gates inside `wienerdog doctor` (`doctor.js` is contended by
  WP-106/107; a standalone `safety` command already satisfies "reports each gate").
- Any runtime/env/flag mechanism to open a gate — forbidden by A0.
- A new ADR — this implements the audit's A0 within ADR-0004/0005; it introduces
  no durable architectural decision beyond the recorded fail-closed convention.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/109-safety-profile-and-preflight`; conventional commits; PR titled
   `feat(safety): fail-closed capability profile + preflight (WP-109)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main`
> (no PR ceremony) per `docs/security-audit/2026-07-15/WORKING-NOTES.md`. The
> `branch:` field and PR steps above are kept for template/upstream-porting
> fidelity; the maintainer reviews the commit on `main`.
