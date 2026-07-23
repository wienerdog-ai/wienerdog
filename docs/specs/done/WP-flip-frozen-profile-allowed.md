---
id: WP-flip-frozen-profile-allowed
title: Flip FROZEN_PROFILE all→allowed (0.10.0 un-freeze — terminal, human-go step)
status: Done
model: opus
size: S
depends_on: [WP-daily-summary-untrusted-fence, WP-identity-seed-gate-couple, WP-identity-digest-hashgate-toctou, WP-routine-containment-probe, WP-negative-harness-broker-verbs, WP-gws-retire-dead-send-path, WP-broker-verb-allowlist-and-gws-gate]
adrs: [ADR-0004]
epic: p0-ungate
---

# WP-flip-frozen-profile-allowed: Flip FROZEN_PROFILE all→allowed

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). `src/core/safety-profile.js` defines the
code-owned **safety profile** with five **capability gates**. `FROZEN_PROFILE` (the
A0 freeze) has every gate `'blocked'`; opening a gate is "a REVIEWED CODE CHANGE to
this constant in a future release — never a runtime toggle, env var, or CLI flag."

This is that reviewed change: the **terminal** step of the 0.10.0 un-freeze. Every
blocker that backed the three withheld gates has been closed by the sibling WPs
(daily-summary fence; identity seed-gate-couple + TOCTOU/banner; routine containment
probe + fixed negative harness), and the two cleared gates (`google-setup`,
`gws-use`) are joined by the folded cluster-N hardening (broker allowlist + dual-gate;
dead-send-path retired). This WP flips all five gates to `'allowed'`.

**This WP MUST NOT be started until ALL of the following hold** (FIX-PLAN §6):
- every `depends_on` WP is Done and double-gate-reviewed (wd-reviewer + Codex) clean;
- **LP1** `scenarios:negative` GREEN live on the current Claude;
- **LP2** `scenarios:broker-e2e` GREEN live on the current Claude;
- **LP3** routine + dream containment probes `pass` live on the current Claude;
- **ST1** the `getProfile`-under-send-scope smoke test passes (or its scope-set
  contingency landed) — the daily digest actually sends and the fail-loud email works;
- an explicit human go is recorded.

## Current state

`src/core/safety-profile.js`:

```js
const FROZEN_PROFILE = Object.freeze({
  'google-setup': 'blocked',
  'gws-use': 'blocked',
  'external-content-routine': 'blocked',
  'daily-summary-injection': 'blocked',
  'identity-auto-activation': 'blocked',
});
```

`statusOf`/`isCapabilityAllowed`/`requireCapability`/`capabilityStatus` default to
this profile; `allowAll()` is the code seam that returns an all-allowed profile.
Tests assert the preflight / `wienerdog safety` show all five BLOCKED.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/safety-profile.js | set every `FROZEN_PROFILE` value to `'allowed'` (keep the constant name/shape/`Object.freeze`; it is now the released profile); make the DESCRIPTION strings state-neutral (drop "…is disabled"); correct the constant's stale "Every gate BLOCKED" JSDoc |
| modify | src/cli/safety.js | reframe the `wienerdog safety` header/footer: they hardcoded "pre-use freeze / stays BLOCKED / no override for a **blocked** gate", all false once gates are allowed — now "Wienerdog capability status … no environment or CLI-flag override". State-coupled to the flip. |
| modify | tests covering `capabilityStatus` / preflight / `safety` | assert all five `'allowed'` |

### Exact contract

Flip the five values only — do NOT rename `FROZEN_PROFILE`, change its shape, add a
runtime/env/flag path, or alter `statusOf`/`requireCapability`/`allowAll`:

```js
const FROZEN_PROFILE = Object.freeze({
  'google-setup': 'allowed',
  'gws-use': 'allowed',
  'external-content-routine': 'allowed',
  'daily-summary-injection': 'allowed',
  'identity-auto-activation': 'allowed',
});
```

Update every test that asserts a blocked gate / all-blocked preflight to the allowed
state. Grep for `'blocked'` and `all five gates BLOCKED` across `tests/` and the
`safety`/preflight tests and reconcile each to allowed.

## Implementation notes & constraints

- **No mechanism change.** The gate machinery (`statusOf`, `requireCapability`,
  `allowAll`, the "no override" message) is unchanged; only the constant's values
  flip. The message text in `requireCapability` (naming there is "no override") stays
  — it is unreachable for an allowed gate.
- **This is a wide behavioral change** surfaced only after the sibling WPs + live
  proofs. Do not start it early; its `depends_on` and the §6 preconditions are the
  gate.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, STOP and ask — this WP has no ambiguity to resolve silently.

## Security checklist

- [ ] Every gate is `'allowed'` and every closed-blocker WP is Done + double-gate
      reviewed; the flip is a reviewed code change to the constant (no runtime/env/flag
      path added); the live proofs (LP1-3) and ST1 passed on the current Claude before
      this landed.

## Acceptance criteria

- [ ] `node bin/wienerdog.js safety` shows all five gates `allowed`.
- [ ] `capabilityStatus()` returns all five `'allowed'`; the preflight/`safety` tests
      assert the allowed state.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
node bin/wienerdog.js safety   # all five gates allowed
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any behavioral code change beyond flipping the constant + reconciling the tests.
- Adding a runtime/env/CLI override (forbidden — A0).
- Re-opening any blocker WP's work here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, INCLUDING the
   evidence that LP1-3 + ST1 passed live and the human go is recorded.
2. Conventional commits; PR titled
   `feat(safety): flip FROZEN_PROFILE all→allowed for the 0.10.0 un-freeze (WP-flip-frozen-profile-allowed)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
