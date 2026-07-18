---
id: WP-152
title: Pin the Codex protocol/CLI version the transcript parser is verified against, and make the re-verify-on-bump discipline actionable
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/152-codex-protocol-pin-and-rerun-discipline
---

# WP-152: Codex protocol-version pin + golden-fixture rerun discipline (audit A13)

## Context (read this, nothing else)

Wienerdog reads AI-CLI **transcripts** and marks tool/external output as
untrusted (`role:'tool_result'` → `derived_from_untrusted:true`), fencing it from
the highest-trust memory. For Codex this depends on the parser recognizing the
harness's *current* tool-output item types and classifying `message` roles by an
explicit trusted allowlist. **WP-100 already shipped the security behavior**:
tool-output recognition, fail-closed on unknown roles, and a trusted allowlist
of EXACTLY `{user, developer}` (verified against `codex-cli 0.144.1`), plus a
THREAT-MODEL residual note that a Codex version bump "must be re-verified on the
next Codex pin bump."

Audit finding **A13** (Codex transcript roles) asks to "**pin the protocol
version**, keep unknown roles fail-closed, and **rerun live golden fixtures at
every Codex pin update** before trusting `developer` as user-authored context."
The fail-closed half is done (WP-100). What is NOT yet in place: there is **no
Codex version pin** to hang "on the next pin bump" on (the version lives only in
scattered code comments), and **no actionable runbook** for the golden-fixture
rerun + `developer`-role re-affirmation. This WP closes that residual with a
single source-of-truth pin and a runbook — deliberately a **record/discipline
change, not a runtime gate** (mirroring `src/core/supported-claude.js`, which is
an advisory record precisely because a deployed user never rebuilds the repo and
the CLI auto-updates).

**IRON RULE (ADR-0004): Wienerdog is just files** — this WP adds a pure constant
module and docs; it starts nothing and changes no runtime behavior.

## Current state

- `src/core/supported-claude.js` — the precedent to mirror: a maintainer-set
  `SUPPORTED_CLAUDE = '2.1.214'` constant with `parseClaudeVersion(raw)` and
  `checkClaudeVersion(actual)` (advisory `{ok, actual, supported, parsed}`),
  pure (no fs/child_process/env), documented as "record, NOT a production gate."
- `src/core/transcripts/codex.js` — `mapCodexItem` (shipped by WP-100) has
  comments citing "real codex-cli 0.144.1 rollout data" and the trusted allowlist
  `TRUSTED_MESSAGE_ROLES = {user, developer}`, but no reference to a single pin
  constant or a rerun runbook.
- `docs/THREAT-MODEL.md` (T1 Mitigations) — the "Parser-level provenance
  dependency (Codex)" bullet ends with: "a genuinely new type must be re-verified
  on the next Codex pin bump." No pin or runbook is named.
- `docs/runbooks/` contains `codex-review.md`, `release.md`, `secret-incident.md`,
  `triage.md` — the place operational disciplines live.
- There is currently **no** `src/core/supported-codex.js`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/supported-codex.js | Pin constant + `parseCodexVersion` + `checkCodexVersion`, mirroring `supported-claude.js`; pure; advisory record-not-gate. |
| create | docs/runbooks/codex-pin-bump.md | The actionable rerun discipline: when Codex updates, re-verify tool-output item types, rerun the Codex golden fixtures, and re-affirm the `developer`-role trust decision before bumping the pin. |
| modify | src/core/transcripts/codex.js | Update the header/allowlist comments to cite `supported-codex.js` (the pin) and `docs/runbooks/codex-pin-bump.md` (the discipline). NO logic change to `mapCodexItem` or any parser function. |
| modify | docs/THREAT-MODEL.md | Point the existing residual sentence at the pin constant + the runbook. |
| create | tests/unit/supported-codex.test.js | Exercise the new module (parse + check), matching `supported-claude`'s test shape. |

### Exact contracts

**`src/core/supported-codex.js`** (pure; mirror `supported-claude.js` exactly in
shape and philosophy):
```js
'use strict';
/**
 * The codex-cli version the Codex transcript parser (src/core/transcripts/codex.js)
 * was last VERIFIED against — a maintainer record, NOT a production gate. A
 * deployed user never rebuilds the repo and codex-cli updates independently, so a
 * runtime version comparison would be noise; the security property is the parser's
 * fail-closed role classification (WP-100), which holds regardless of version.
 * This constant is the single source of truth the re-verify runbook
 * (docs/runbooks/codex-pin-bump.md) and the parser comments reference.
 * Pure: no fs, no child_process, no env.
 */
/** Maintainer-set at the last full Codex-parser verification; advisory only. */
const SUPPORTED_CODEX = '0.144.1';

/** Parse the leading dotted-numeric version from raw `codex --version` output. */
function parseCodexVersion(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/** Advisory compare of the installed codex version to the last-verified one. */
function checkCodexVersion(actual) {
  const parsed = parseCodexVersion(actual);
  return {
    ok: parsed === SUPPORTED_CODEX,
    actual: typeof actual === 'string' ? actual.trim() : String(actual),
    supported: SUPPORTED_CODEX,
    parsed,
  };
}

module.exports = { SUPPORTED_CODEX, checkCodexVersion, parseCodexVersion };
```

**`docs/runbooks/codex-pin-bump.md`** — a short, imperative runbook. Required
sections (plain language, knowledge-worker-adjacent but this one is maintainer-
facing):
1. **When to run:** codex-cli updated on your machine, or `checkCodexVersion`
   reports a mismatch, or before trusting a new Codex release.
2. **Re-verify tool-output item types:** sample a real recent rollout file; confirm
   every tool/exec output item type the current codex-cli emits is in
   `TOOL_OUTPUT_TYPES` (`custom_tool_call_output` + the legacy variants). A NEW
   type that is not listed would be silently dropped — add it (as `tool_result`,
   untrusted) and extend the golden fixture.
3. **Rerun the Codex golden fixtures live:** run the Codex transcript tests
   (`tests/fixtures/transcripts/codex-rollout.*`, `tests/unit/transcripts.test.js`)
   and confirm developer→user, tool-output→tool_result, `system`→dropped still hold.
4. **Re-affirm the `developer`-role trust decision:** confirm codex-cli still emits
   `developer`-role messages as its own control/sandbox scaffolding (NOT
   tool-derived) before continuing to trust it as user-authored context. If that
   changes, drop `developer` from `TRUSTED_MESSAGE_ROLES` (fail closed).
5. **Bump the pin:** set `SUPPORTED_CODEX` to the newly-verified version and commit
   with a note of what was re-verified.

**`src/core/transcripts/codex.js` comment updates (no logic change):**
- In the file/`mapCodexItem` header comment, add a line: "Verified against the
  version pinned in `src/core/supported-codex.js` (`SUPPORTED_CODEX`); re-verify
  per `docs/runbooks/codex-pin-bump.md` on every codex-cli update."
- On the `TRUSTED_MESSAGE_ROLES` and `TOOL_OUTPUT_TYPES` definitions, add: "revisit
  this list at each Codex pin bump — see docs/runbooks/codex-pin-bump.md."

**`docs/THREAT-MODEL.md` update:** change the closing residual sentence of the
"Parser-level provenance dependency (Codex)" bullet from
"…re-verified on the next Codex pin bump." to reference the concrete mechanism,
e.g.: "…re-verified on the next Codex pin bump — the version is pinned in
`src/core/supported-codex.js` and the re-verification steps (rerun the golden
fixtures, confirm tool-output types, re-affirm the `developer`-role trust) are in
`docs/runbooks/codex-pin-bump.md`." Keep the rest of the bullet unchanged.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- `supported-codex.js` is **advisory record-not-gate** by design — do NOT wire it
  into a runtime path that would fail a user's dream/parse on a version mismatch
  (that would be noise, per the supported-claude precedent). Its consumers are the
  runbook (human) and its unit test; a future optional advisory surface (e.g. a
  `doctor` line) is out of scope here.
- Do NOT change `mapCodexItem` or any parser logic — WP-100 owns that; this WP is
  purely the pin + discipline + comment cross-references.
- Keep `SUPPORTED_CODEX = '0.144.1'` (the version WP-100 verified against) — this
  WP records the existing truth, it does not claim a new verification.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No parser logic changes; the fail-closed role classification (WP-100) is
      untouched (recheck: `mapCodexItem` byte-identical except comments).
- [ ] The pin is advisory only — no runtime gate that could fail-open or fail a
      user's run on a version mismatch.

## Acceptance criteria

- [ ] `require('../../src/core/supported-codex')` exposes `SUPPORTED_CODEX` (a
      dotted version string), `parseCodexVersion('codex-cli 0.144.1 …') === '0.144.1'`,
      and `checkCodexVersion('… 0.144.1 …').ok === true`.
- [ ] `docs/runbooks/codex-pin-bump.md` exists with the five sections above and is
      referenced from `codex.js` comments and the THREAT-MODEL residual bullet.
- [ ] `mapCodexItem` behavior is unchanged (existing Codex transcript golden +
      unit tests still pass byte-identically).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "supported-codex|Codex|transcript"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `mapCodexItem` / parser logic (WP-100 already shipped it).
- Wiring the pin into a runtime gate, `doctor`, or the dream path (advisory only).
- Adding new tool-output item types speculatively — only the runbook instructs
  re-verification; the current `{user, developer}` allowlist and type set stay.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/152-codex-protocol-pin-and-rerun-discipline`; conventional commits;
   PR titled `docs(transcripts): pin the Codex parser version + add the re-verify-on-bump runbook (WP-152)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
