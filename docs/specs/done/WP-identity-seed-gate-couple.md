---
id: WP-identity-seed-gate-couple
title: Couple seedApprovals to the identity gate; case-insensitive write-side freeze (un-gate identity-auto-activation)
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0021]
epic: p0-ungate
---

# WP-identity-seed-gate-couple: Couple seedApprovals to the identity gate + case-insensitive write-side freeze

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). The injected **digest** bootstraps every
session from the four injected **identity** files
(`{identity_dir}/{profile,preferences,goals,instructions}.md`, default
`06-Identity/`). Per ADR-0021, the digest injects an identity file ONLY when its
current exact bytes match a human-approved `sha256` in the **identity trust
registry** (`state/identity-approvals.json`, 0600). Two — and only two — ways a hash
enters the registry: **(a)** `seedApprovals` first-time at attended `sync`
(`source:'setup'`), and **(b)** `wienerdog memory approve <file>` (TTY-confirmed,
`recordApproval`, `source:'approved'`).

The `identity-auto-activation` **capability gate** is BLOCKED (A0). It means
"automatic dream edits to your identity files." While BLOCKED, `validate.js` REVERTS
any dream add/modify/delete of the four injected files. This WP is part of the
0.10.0 un-freeze, which OPENS this gate — so the dream may then edit identity files
(`validate.js` no longer reverts them; the read-side hash gate still requires human
ratification to inject).

**Opening the gate breaks the premise of `seedApprovals`' first-time seed.**
`seedApprovals` records `source:'setup'` bytes for ANY injected identity file
lacking a record — with **no TTY, no bytes shown**. This was sound ONLY because the
WP-112 freeze guaranteed the dream could never author these files. With the gate
open, the pre-takeover double-gate review **PoC-proved** the escalation
(finding I-1): **(a)** the dream writes a *first-appearance* identity file setup
never created → the next `sync` auto-seeds the dream's bytes trusted; **(b)**
*registry loss* (`readRegistry` → `{approvals:{}}`) makes the next `sync` re-seed
ALL FOUR from current (possibly dream-modified) bytes — the documented "fail closed"
becomes fail-OPEN.

**ADR-0021 amendment 1 decides the fix:** `seedApprovals`' no-TTY auto-seed is
coupled to the gate — it seeds ONLY while `identity-auto-activation` is BLOCKED.
When ALLOWED, it writes nothing; every first-appearance / post-loss / changed
identity file is ratified through the TTY `wienerdog memory approve` path
(`recordApproval` — NOT gate-coupled; the human ratification path works regardless
of the gate). This also fixes a defense-in-depth write-side gap: `validate.js`'s
`isTier3` is case-sensitive, so a dream write to a case-variant identity path
(`06-identity/profile.md` on a case-insensitive FS) bypasses the freeze revert.

**Accepted residual (ADR-0021 amendment 1):** with the gate open, a fresh/adopting
user's four identity notes are not auto-seeded at first sync; the digest's
identity-exclusion banner guides the user to `memory approve` each.

## Current state

`src/core/identity-approvals.js` `seedApprovals(stateDir, vaultDir, layout)`
(l.240-253):

```js
function seedApprovals(stateDir, vaultDir, layout) {
  const registry = readRegistry(stateDir);
  const seeded = [];
  for (const rel of injectedIdentityRels(layout)) {
    const key = foldKey(rel);
    if (registry.approvals[key]) continue;          // already has a record → never re-seed
    const h = fileHash(vaultDir, rel);
    if (!h) continue;
    registry.approvals[key] = { approved_blob_hash: h, approved_at: new Date().toISOString(), source: 'setup' };
    seeded.push(key);
  }
  if (seeded.length > 0) writeRegistry(stateDir, registry);
  return { seeded };
}
```

Called by the sole non-dry-run caller `src/cli/sync.js:273`
(`identityApprovals.seedApprovals(paths.state, vaultPath, layout)`, no profile).
`recordApproval` (WP-117, the TTY path) is separate and unchanged.

`src/core/dream/validate.js`:
- `INJECTED_IDENTITY_FILES` (l.21) + `isInjectedIdentity(rel, layout)` (l.32-41),
  which is ALREADY case-insensitive (lowercases both prefix and rel).
- `validateAndCommit(o)` reads `const profile = o.profile;` (l.765) and computes
  `isTier3` (l.769-770):
  ```js
  const tier3Prefixes = [layout.identity_dir + '/', layout.skills_dir + '/'];
  const isTier3 = (rel) => tier3Prefixes.some((p) => rel.startsWith(p)); // ← case-SENSITIVE
  ```
- The identity freeze revert is the FIRST check inside `if (isTier3(rel)) { … }`
  (l.855): `if (isInjectedIdentity(rel, layout) && !isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, profile)) { revertPath(...); continue; }`.
  Because a case-variant identity write never enters the `isTier3` block, the
  (case-insensitive) `isInjectedIdentity` freeze is never consulted for it.

`src/core/safety-profile.js` exports `isCapabilityAllowed(name, profile?)`,
`CAPABILITY.IDENTITY_AUTO_ACTIVATION`, `allowAll()`. No profile → the production
(currently frozen) profile.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/identity-approvals.js | `seedApprovals(stateDir, vaultDir, layout, profile)` — no-op (returns `{seeded:[]}`, writes nothing) when `identity-auto-activation` is allowed; default profile = production |
| modify | src/core/dream/validate.js | make `isTier3`'s `identity_dir` prefix match case-insensitively (mirror `isInjectedIdentity`) |
| modify | tests/unit/identity-approvals.test.js | seeds under blocked profile (unchanged); NO seed under `allowAll()`; registry-loss + allowAll re-seeds nothing |
| modify | tests/unit/dream-validate.test.js | a case-variant lowercase-dir dream identity write is reverted under the frozen profile |

`src/cli/sync.js` is intentionally NOT modified — it calls `seedApprovals` with no
profile, so the gate check reads the production profile.

### Exact contracts

**1. `seedApprovals` — gate-couple the auto-seed.** Add an optional `profile`
parameter (code seam, like the rest of the codebase) and no-op when the gate is
allowed:

```js
const { isCapabilityAllowed, CAPABILITY } = require('./safety-profile');

/**
 * FIRST-TIME seed only, and ONLY while identity-auto-activation is BLOCKED
 * (ADR-0021 amendment 1). When the gate is ALLOWED the dream may author these files,
 * so a no-TTY "trust current bytes" seed would auto-trust dream output — refused.
 * Ratification then goes through `memory approve` (recordApproval, TTY). Never
 * re-seeds an existing record. `profile` defaults to the production profile (a code
 * seam for tests only).
 * @returns {{seeded:string[]}}
 */
function seedApprovals(stateDir, vaultDir, layout, profile) {
  if (isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, profile)) return { seeded: [] };
  // … existing first-time seed body unchanged …
}
```

`isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, undefined)` reads the
production profile (frozen → blocked → seeds today; flipped → allowed → no-op).
Export signature unchanged otherwise.

**2. `validate.js` — case-insensitive `isTier3` identity prefix.** Mirror
`isInjectedIdentity`'s folding so a case-variant identity write still enters the
Tier-3 block (and thus the freeze revert while blocked):

```js
  const idPrefix = (layout.identity_dir + '/').toLowerCase();
  const skillsPrefix = layout.skills_dir + '/';
  const isTier3 = (rel) =>
    String(rel).toLowerCase().startsWith(idPrefix) || rel.startsWith(skillsPrefix);
```

Only the identity-dir prefix is folded (the finding names the identity case-variant;
skills classification is unchanged, out of scope). Nothing else in `validate.js`
changes.

## Implementation notes & constraints

- **Frozen-era behavior is unchanged.** All current tests exercise the blocked
  profile → `seedApprovals` seeds as before, and existing `dream-validate` cases are
  unaffected. The new behavior appears only under `allowAll()` (this WP's new tests)
  and post-flip production.
- **`recordApproval` is NOT gate-coupled** — it is the TTY human ratification path
  and must keep working with the gate open (that is how identity notes get approved
  once the auto-seed is off). Do not touch it.
- **`sync.js` untouched** — passing no profile is correct (production profile).
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] `seedApprovals` records a `source:'setup'` hash ⟺ the file has no record AND
      `identity-auto-activation` is blocked in the active profile; under `allowAll()`
      it writes NOTHING (asserted for both first-appearance and registry-loss). The
      only way a hash enters the registry with the gate open is TTY `memory approve`.
      A case-variant dream identity write hits the freeze revert while blocked
      (asserted). No untrusted identifier flows into a path/shell.

## Acceptance criteria

- [ ] Under the frozen (default) profile, `seedApprovals` seeds an unrecorded
      present file once and never re-seeds — unchanged from today.
- [ ] Under `allowAll()`, `seedApprovals` writes nothing and returns `{seeded:[]}`
      even when the registry is empty (registry-loss simulation) and even for a
      first-appearance file with no record.
- [ ] A dream add of `06-identity/profile.md` (lowercase dir) with a floor-passing
      frontmatter is REVERTED under the frozen profile (case-insensitive `isTier3`).
- [ ] Existing `identity-approvals` and `dream-validate` cases still pass unchanged.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "identity-approvals"
npm test -- --test-name-pattern "dream-validate"
npm test
npm run lint
node bin/wienerdog.js safety   # gates unchanged (still blocked at this WP)
```

## Out of scope (do NOT do these)

- Opening `identity-auto-activation` — that is `WP-flip-frozen-profile-allowed`.
- The digest read-side TOCTOU + banner-reason fixes — `WP-identity-digest-hashgate-toctou`.
- `recordApproval` / `memory approve` / `sync.js` changes.
- A `memory approve --all` convenience or setup-time seeding (deferred enhancement,
  ADR-0021 amendment 1) — not this WP.
- Case-folding the skills-dir classification.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(identity): gate-couple seedApprovals + case-insensitive write-side freeze (WP-identity-seed-gate-couple)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
