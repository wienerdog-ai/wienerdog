---
id: WP-112
title: Freeze daily-Summary injection and automatic identity activation
status: Draft
model: sonnet
size: M
depends_on: [WP-109]
adrs: [ADR-0004, ADR-0012]
branch: wp/112-freeze-daily-summary-and-identity
---

# WP-112: Freeze daily-Summary injection and automatic identity activation

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Every new AI session is bootstrapped with an
injected **digest** (`~/.wienerdog/state/digest.md`, rendered by
`src/core/digest.js`) built from the vault's four injected **identity** files —
`{identity_dir}/{profile,preferences,goals,instructions}.md` (default dir
`06-Identity/`) — plus the newest daily note's `## Summary` section. The nightly
**dream** (`src/core/dream/validate.js`) may auto-write vault memory, and today a
dream write to an injected identity file is accepted if it clears the Tier-3 code
floor (confidence ≥ 0.85, recurrence ≥ 3, `derived_from_untrusted: false`).

A 2026-07-15 security audit found two fail-open provenance paths into that
instruction-adjacent context:
- **Daily Summary (audit A4/R5):** mixed/untrusted daily-note content reaches the
  digest through a single file-level flag — too weak for a mixed-provenance
  aggregate. Until entry-level provenance exists, the daily Summary must **not** be
  injected at all.
- **Identity activation (audit A3/R4):** a hijacked dream can attach real-looking
  provenance numbers to attacker text and have it auto-activated into every future
  session. Until a human-ratified, exact-byte trust registry exists, the dream
  must **not** auto-change the injected identity files; identity stays
  human-authored (the setup interview, unaffected).

WP-109 shipped the mechanism: a code-owned **safety profile** with **capability
gates**, all BLOCKED, no runtime/env/flag override. This WP wires the two gates
that protect the injected context:

- `daily-summary-injection` — the digest's daily `## Summary` block.
- `identity-auto-activation` — dream (model) changes to the four injected identity
  files.

This is a blunt freeze; the real fixes (strict shared frontmatter parser; the
approval CLI + exact-byte registry) are later WPs (A3/A4). The dream still runs
and writes Tier-1/2 notes, skills, and its report (proposal/report mode) — only
its identity writes are frozen.

## Current state

**`src/core/digest.js`** — `renderDigest(vaultDir, layout = defaultLayout(), opts
= {})` builds `parts` from the four identity files and active projects, then:

```js
  const daily = newestDaily(path.join(vaultDir, layout.daily_dir));
  if (daily) {
    const note = readNote(daily.path);
    const summary = note && extractSection(note.body, 'Summary');
    if (summary) parts.push(`## Latest daily log (${daily.date})\n${summary}`);
  }
  const body = `${parts.join('\n\n')}\n`;
  // … alert/scheduler/update prefix …
```

Production callers (`dream.js` step 15, `sync.js`) pass no capability info.
The golden `tests/golden/digest-default.md` ends with the daily block:

```
## Active projects
- onboarding-redesign

## Latest daily log (2026-07-01)
Kicked off the onboarding redesign and aligned with design on the new flow.
```

`digest.test.js` asserts `renderDigest(FIXTURE)` equals that golden byte-for-byte
and has three prefix tests that reuse the golden as the trailing body.

**`src/core/dream/validate.js`** — `validateAndCommit(o)` classifies each vault
change. In the Tier-3 branch (`isTier3(rel)`), it runs `skillBodyViolation`, then
`tier3Decision` (the numeric floor); a passing identity note is kept. Existing
`dream-validate.test.js` cases write `06-Identity/valid-identity.md`,
`06-Identity/injected.md`, `06-Identity/existing.md`, `06-Identity/note.md` —
**none of them the four injected basenames** — so those cases are unaffected by an
injected-identity freeze. `validateAndCommit` is called by `dream.js` with an
object `o` (no capability info today).

**`src/core/safety-profile.js`** (WP-109) exports `isCapabilityAllowed(name,
profile?)`, `CAPABILITY.{DAILY_SUMMARY_INJECTION,IDENTITY_AUTO_ACTIVATION}`, and
`allowAll()`. No `profile` → frozen (blocked); `profile` is a code seam for tests
only, never env/argv.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | gate the daily `## Summary` block on `daily-summary-injection` (non-throwing); read `opts.profile` |
| modify | src/core/dream/validate.js | revert dream changes to the four injected identity files when `identity-auto-activation` is blocked; read `o.profile` |
| modify | tests/golden/digest-default.md | drop the daily-log section (freeze removes it from production output) |
| modify | tests/unit/digest.test.js | add an allow-all test proving the daily block renders when allowed |
| modify | tests/unit/dream-validate.test.js | add frozen (reverted) + allow-all (Tier-3-governed) identity cases |

### Exact contracts

**1. `src/core/digest.js`.** Import the non-throwing query; gate the daily block on
the (frozen → blocked) `daily-summary-injection` gate; thread an `opts.profile`
code seam:

```js
const { isCapabilityAllowed, CAPABILITY } = require('./safety-profile');
// … inside renderDigest(vaultDir, layout = defaultLayout(), opts = {}) …
  const daily = newestDaily(path.join(vaultDir, layout.daily_dir));
  // A0 pre-use freeze (WP-109): the daily-note Summary is NOT injected until
  // entry-level provenance exists (audit A4). opts.profile is a code seam for tests
  // only (never env/argv); production callers pass none → blocked → omitted.
  if (daily && isCapabilityAllowed(CAPABILITY.DAILY_SUMMARY_INJECTION, opts.profile)) {
    const note = readNote(daily.path);
    const summary = note && extractSection(note.body, 'Summary');
    if (summary) parts.push(`## Latest daily log (${daily.date})\n${summary}`);
  }
```

Use `isCapabilityAllowed` (NOT `requireCapability`) — `renderDigest` is pure and
must not throw; a blocked gate silently omits the block. Everything else in
`renderDigest` (identity, projects, alert/scheduler/update prefix) is unchanged.
The existing `opts` (`alerts`, `schedulerLine`, `updateLine`) keep working;
`opts.profile` is additive.

**2. `src/core/dream/validate.js`.** Add the injected-identity set + a predicate,
and, in the Tier-3 branch, revert an injected-identity change when the gate is
blocked, BEFORE `skillBodyViolation`/`tier3Decision`:

```js
const { isCapabilityAllowed, CAPABILITY } = require('../safety-profile');

// The four identity files the digest injects (direct children of identity_dir).
const INJECTED_IDENTITY_FILES = ['profile.md', 'preferences.md', 'goals.md', 'instructions.md'];

/** @param {string} rel @param {import('../layout').VaultLayout} layout @returns {boolean} */
function isInjectedIdentity(rel, layout) {
  const prefix = layout.identity_dir + '/';
  if (!rel.startsWith(prefix)) return false;
  return INJECTED_IDENTITY_FILES.includes(rel.slice(prefix.length)); // direct child only
}
```

In `validateAndCommit(o)`, read `const profile = o.profile;` near the top (with the
other `o.*` reads), and in the per-change loop's `if (isTier3(rel)) { … }` block,
as the FIRST check inside it:

```js
    if (isTier3(rel)) {
      // A0 pre-use freeze (WP-109): the dream may not auto-change the injected
      // identity files until a human-ratified exact-byte registry exists (audit A3).
      // Revert any add/modify/delete of profile/preferences/goals/instructions.md.
      // The human setup interview writes these OUTSIDE this path, so it is unaffected.
      if (isInjectedIdentity(rel, layout) && !isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, profile)) {
        revertPath(vaultDir, rel, change.untracked);
        reverted.push({ path: rel, reason: 'automatic identity activation is frozen (safety profile); the dream may not change the injected identity files — run `wienerdog safety`' });
        continue;
      }
      // … existing skillBodyViolation → tier3Decision → accept …
    }
```

`revertPath(vaultDir, rel, change.untracked)` already handles both untracked adds
(remove) and tracked modifications/deletions (checkout HEAD), so a dream that
*deletes* a human identity file is restored too. `dream.js` calls
`validateAndCommit` without `o.profile` → frozen → identity writes reverted. Keep
`module.exports` unchanged.

**3. `tests/golden/digest-default.md`.** Remove the trailing daily-log section so
the file ends at the projects block:

```
…
## Active projects
- onboarding-redesign
```

(i.e. delete the blank line + `## Latest daily log (2026-07-01)` + its body line;
keep the single trailing newline the renderer emits). The three prefix tests reuse
GOLDEN as the trailing body, so they follow automatically.

**4. `tests/unit/digest.test.js`.** Add a test proving the gate (not a permanent
removal): with the allow-all profile the daily block renders again —
`const { allowAll } = require('../../src/core/safety-profile');` then
`const out = renderDigest(FIXTURE, undefined, { profile: allowAll() });`
`assert.match(out, /## Latest daily log \(2026-07-01\)/)`. The existing
byte-identity test now proves the FROZEN output (no daily block).

**5. `tests/unit/dream-validate.test.js`.** Add three cases (reuse the file's
`tempVault`/`writeVault`/`FM` helpers):
- **frozen add reverted:** brain writes `06-Identity/profile.md` with a PASSING
  Tier-3 frontmatter (`confidence: 0.9, recurrence: 3, derived_from_untrusted:
  false`); call `validateAndCommit` with no `profile`; assert the file is NOT in
  the committed tree (reverted) and the report/`res.reverted` names it with the
  identity-frozen reason. This proves the freeze overrides even a floor-passing
  write.
- **frozen modify reverted:** seed a committed human `06-Identity/preferences.md`;
  brain modifies it; frozen `validateAndCommit`; assert it is restored to the
  original bytes and recorded as reverted.
- **allow-all keeps a floor-passing write:** same as the first case but pass
  `{ …existing o fields…, profile: allowAll() }`; assert `06-Identity/profile.md`
  survives (governed by the Tier-3 floor again). This proves the gate, not a
  blanket ban.

Do NOT modify the existing `06-Identity/valid-identity.md` etc. cases — those files
are not injected identity files, so the frozen default leaves them Tier-3-governed
and their assertions unchanged.

## Implementation notes & constraints

- **Digest: non-throwing gate.** `renderDigest` must stay pure and total — use
  `isCapabilityAllowed`, never `requireCapability`. A blocked gate omits the daily
  block; it never throws.
- **Identity freeze targets the FOUR injected basenames only**, as direct children
  of `layout.identity_dir`. Other Tier-3 identity notes (e.g.
  `06-Identity/valid-identity.md`) remain governed by the numeric floor — matching
  the digest, which injects only those four files, and keeping existing tests
  green.
- **Human setup is untouched.** The interview/renderer writes identity files
  outside `validateAndCommit`; only the dream's own diff passes through this gate.
- **Freeze covers delete/modify/add.** `revertPath` restores a tracked
  deletion/modification from HEAD and removes an untracked add, so the dream can
  neither introduce, rewrite, nor remove an injected identity file.
- **No env/flag override** (A0): the only "allowed" path is the `profile`/
  `o.profile` code seam passed by tests. Production callers pass none → frozen.
- **Golden update is authorized by THIS spec** (CLAUDE.md rule) — update only
  `digest-default.md`, only to drop the daily section.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Untrusted daily-note and dream-authored identity bytes can no longer reach
      the injected digest without explicit allowance: the frozen digest omits the
      daily Summary (golden updated + byte-identity test), and the frozen validator
      reverts any dream add/modify/delete of the four injected identity files even
      when the Tier-3 numeric floor passes (asserted). The gates read only the
      code-seam profile (tests) or the frozen constant (production) — no env/`--yes`
      opens them. The human setup path (outside `validateAndCommit`) is unaffected.

## Acceptance criteria

- [ ] `renderDigest(FIXTURE)` (frozen) contains NO `## Latest daily log` section
      and equals the updated golden byte-for-byte; with `{ profile: allowAll() }`
      the daily section renders again.
- [ ] A dream write to `06-Identity/profile.md` (or `preferences/goals/
      instructions.md`) that passes the Tier-3 floor is REVERTED under the frozen
      profile and recorded with the identity-frozen reason; the same write is KEPT
      under `allowAll()` (Tier-3-governed).
- [ ] A dream modification or deletion of an existing human identity file is
      restored to HEAD under the frozen profile.
- [ ] Existing `dream-validate` identity-note cases (non-injected files) and the
      digest prefix tests still pass unchanged.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "digest"
npm test -- --test-name-pattern "dream-validate"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The strict shared flat-frontmatter parser / entry-level daily provenance (audit
  A4) and the `wienerdog memory approve` CLI + exact-byte trust registry (audit
  A3) — separate future WPs.
- Disabling the dream itself, or gating Tier-1/2 notes, skills, or the dream report
  (the dream keeps running in proposal/report mode).
- Changing `dream.js` / `sync.js` — they call `renderDigest`/`validateAndCommit`
  with no profile and correctly inherit the frozen behavior.
- Removing daily notes from the vault — they remain readable; only the automatic
  digest injection is frozen.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/112-freeze-daily-summary-and-identity`; conventional commits; PR titled
   `feat(digest,dream): freeze daily-Summary injection + identity auto-activation (WP-112)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main`
> per `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields
> are kept for template/upstream-porting fidelity.
