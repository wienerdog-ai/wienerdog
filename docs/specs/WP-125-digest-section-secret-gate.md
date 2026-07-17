---
id: WP-125
title: Per-section digest secret gate — omit a section that would inject a secret, keep the rest (audit A5)
status: Draft
model: sonnet
size: S
depends_on: [WP-122]
adrs: [ADR-0004, ADR-0024]
branch: wp/125-digest-section-secret-gate
---

# WP-125: Per-section digest secret gate — omit a section that would inject a secret, keep the rest (audit A5)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Plain Node ≥ 18, **zero runtime deps**, JSDoc types only, no build step.

The **digest** (`~/.wienerdog/state/digest.md`, rendered by `src/core/digest.js`
`renderDigest`) is the pre-rendered session context **injected at every SessionStart** and
compiled into the `CLAUDE.md`/`AGENTS.md` **managed block**. Its body sections are built from
the four **identity notes** (`profile/preferences/goals/instructions.md`), the active-project
directory names, and (when unfrozen) a daily summary.

A 2026-07-15 security audit (action **A5**, deep-dive `05-secret-lifecycle.md`, item 4 point 4
+ item 6) found the digest has **no secret gate**. Identity notes are trust-gated (A3 exact-byte
hash, A4 provenance) and size-capped (A6/WP-120), but **a human can approve an identity note
that happens to contain a secret** (a `preferences.md` that pastes an API key into a "my tools"
note), and that section is then injected into every session and written into the managed block —
a durable, cross-session secret leak. The other three A5 gates (WP-122..124) do not cover this
path: the identity note bytes come straight from the vault, not from a brain output or a log.

This WP adds the **fourth A5 enforcement point (EP4): scan each digest section before it joins
the output**; a section with a **hard finding** is **omitted** (fail closed) and surfaced by a
fixed control-plane banner, so the rest of the digest (and the last known-good context) still
renders. It touches only `src/core/digest.js` and its test. This is the last of the four
persistence gates of **ADR-0024**.

**A5 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

`src/core/digest.js` `renderDigest(vaultDir, layout, opts)` builds a `parts[]` array of body
**sections**, in this fixed order, then assembles them:

- for each identity file that passes the A3 hash gate + A4 provenance gate: the compacted,
  byte-capped body is pushed as `parts.push(`${header}\n${content}`)` (header e.g.
  `## Preferences`);
- the `## Active projects` block (capped to `MAX_PROJECTS`);
- (frozen in production) the daily `## Summary`.

Then `const body = `${parts.join('\n\n')}\n`;`, a control-plane **`prefix`** is assembled from
the fixed banner lines (identity-exclusion, alerts, quarantine, scheduler, update — all
code-owned, secret-free), `const assembled = prefix ? `${prefix}\n\n${body}` : body;` and
`return capDigest(assembled, prefix);` (WP-120's line/byte cap, which always preserves the
`prefix`). `renderDigest` is **pure and total** (never throws). The identity-exclusion
**banner** pattern (`identityWarn`) is the established way to surface a fail-closed omission:

```js
const identityWarn = identityExclusions.length > 0
  ? `> [!warning] Wienerdog: some identity notes were left out of your session context — ${identityExclusions.map((e) => `${e.file} (${e.reason})`).join(', ')}. Fix their frontmatter and run \`wienerdog sync\`, …`
  : '';
```

The golden `tests/golden/digest-default.md` is produced from clean fixtures containing no
secret, so adding the gate must leave it **byte-unchanged**. WP-122 shipped
`src/core/secret-scan.js` exporting `scanAndRedact(text) → {text, findings}` and
`hasHardFinding(findings)`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | scan each identity/project/daily section before it joins `parts[]`; omit a section with a hard finding; add a fixed secret-exclusion banner to the prefix; render the staged-output quarantine pending-review banner from `opts` |
| modify | src/cli/dream.js | one-line call-site: list `state/quarantine/` basenames into the `renderDigest` opts (see contract 5) |
| modify | src/cli/sync.js | same one-line call-site as dream.js |
| modify | tests/unit/digest.test.js | identity note containing a secret → its section omitted + banner present + secret absent from output; clean fixtures → golden byte-unchanged; a false positive is an omission, not a `[REDACTED]` injection; non-empty quarantine list → pending-review banner, empty → no banner |

### Exact contracts

**1. Scan each section before it is pushed to `parts[]`.** For each candidate section string
(the identity `` `${header}\n${content}` ``, the `## Active projects` block, and the daily
`## Summary` block if unfrozen), call `scanAndRedact(section)`; if `hasHardFinding(findings)`,
**do NOT push the section** (omit it) and instead record a fixed exclusion entry naming the
section by its **fixed, code-owned identity** (the identity FILE name for an identity section,
or the literal `active-projects` / `daily-summary` for the other two) — never the section
content, never the matched bytes.

- For an identity section: reuse/extend the existing `identityExclusions` list (add a
  `reason: 'appears to contain a secret'` entry keyed by the file name), so the SAME
  identity-exclusion banner surfaces it — the user already understands that banner.
- For the projects/daily sections (rare, but a project dir name or a summary line could trip
  the detector): add them to the SAME or a parallel exclusion list with a code-owned label.
  Keeping one banner is simpler; record the choice.

**2. Never inject the `[REDACTED]`-mutated section.** As in WP-123, a hard finding **omits the
whole section** — do NOT push `scanAndRedact(section).text` (the redacted form). A false
positive is a **visible omission with a metadata banner**, not a silently-`[REDACTED]`
identity note injected into every session. (Discard the `.text`; use only the `findings`.)

**3. The banner.** When any section was omitted for a secret, the prefix carries a fixed,
code-owned line — either the existing `identityWarn` (with the new reason) or a dedicated
`secretExclusionLine`. It names the excluded section identifiers + a code-owned reason only,
exactly like `formatAlerts`/`identityWarn` — **no untrusted bytes reach the injected digest**.
Place it in the prefix (never truncated by `capDigest`), adjacent to `identityWarn`.

**4. `renderDigest` stays pure and total.** The gate is a pure filter over `parts[]`; the
byte/line caps (`capDigest`), the prefix preservation, and the golden output for clean input
are unchanged. The daily-summary freeze, the A3 hash gate, and the A4 provenance gate are
untouched — the secret gate runs AFTER them (a note must already be approved+trusted to reach
the scan).

**5. Staged-output quarantine pending-review banner (OWNER-APPROVED 2026-07-17, ruled in
the WP-124 walkthrough).** WP-123's secret gate preserves withheld dream notes into
`state/quarantine/` for owner review; the owner must be able to notice them without reading
dream reports. Contract: `renderDigest` accepts `opts.secretQuarantine` — an array of
**sanitized basenames** (the caller applies the shared `displayName` sanitizer) of files
currently in `state/quarantine/`. When non-empty, the prefix carries one fixed, code-owned
banner line (adjacent to the other quarantine/alert lines, never truncated by `capDigest`)
naming the count + sanitized basenames and pointing at `state/quarantine/` for review —
file CONTENT is never read or rendered (the quarantined files hold raw secrets). When empty
or absent, no banner — the surface is **state-driven**: it clears itself once the owner
empties the directory (restore or purge), unlike an `alerts.jsonl` entry whose
cleared-on-next-success lifecycle would not track the review state. The dream.js/sync.js
call sites each add one line: read the `state/quarantine/` dir listing (missing dir → empty
array; never read file contents) and pass it in.

### Worked example (assert in digest.test.js)

Given an approved+trusted `preferences.md` whose body contains
`my Stripe key is sk_live_51ABCDEF0123456789abcdefXYZ`:

```
renderDigest(vault, layout, { identityApprovals:<approved> })
  → the '## Preferences' section is ABSENT from the output (not injected, not [REDACTED]-ed)
  → the prefix carries a banner naming preferences.md with a 'appears to contain a secret' reason
  → the output contains NONE of the key bytes
  → the other identity sections + projects still render
```

Given the clean default fixtures: `renderDigest` is **byte-identical** to
`tests/golden/digest-default.md` (no section trips the detector → golden unchanged).

## OWNER-APPROVED (2026-07-17) — DECISION NEEDED, resolve in the walkthrough

- **DECISION NEEDED — one banner or two.** Fold secret-omitted identity sections into the
  existing `identityWarn` banner (with a new reason string), or add a dedicated
  `secretExclusionLine` for all secret-omitted sections (identity + projects + daily)?
  **Recommendation: extend `identityWarn` for identity sections** (the user knows that banner)
  and add the projects/daily cases to the same list with code-owned labels — one banner, one
  code path. Confirm.
- **DECISION NEEDED — "last known-good digest remains" (item 6), strong vs weak reading.**
  **Weak (recommended, this WP):** the offending section is omitted and the rest renders, so
  the injected context is always the safe subset — the digest is never blocked wholesale, and
  the previous session's context minus the bad section remains. **Strong:** if a section that
  was present last render would now be dropped, the *writer* (dream.js/sync.js) keeps the prior
  `digest.md` on disk rather than replacing it. The strong reading requires touching the digest
  **writers** (out of this WP's `digest.js`-only footprint) and risks pinning a stale digest
  forever. Recommendation: ship the weak reading here; if the owner wants the strong guard, spec
  it as a follow-up touching the writers. Confirm.

## Implementation notes & constraints

- **This is EP4 of ADR-0024.** Reference it where the section scan is wired.
- **Omit, never inject the redacted form.** The single invariant: a hard finding drops the
  whole section; the `.text` (redacted) is discarded. A false positive is a visible banner, not
  a silently-mutated injected identity.
- **Golden byte-unchanged.** The clean fixtures contain no secret, so
  `tests/golden/digest-default.md` MUST NOT change. If it would, the detector is firing on
  in-cap clean content — that is a bug in the wiring, not a golden update.
- **`renderDigest` stays pure and total** (never throws; deterministic). The scan is a pure
  filter; `scanAndRedact` is itself total/fail-closed (WP-122), so a scan error omits the
  section (fail closed) rather than injecting it.
- **Runs after the trust gates.** The secret scan is the LAST filter before a section joins
  `parts[]` — it never overrides the A3 hash gate or A4 provenance (those already excluded
  their failures); it only removes an approved+trusted section that nonetheless carries a
  secret.
- Reuse `scanAndRedact`/`hasHardFinding` from `secret-scan`. Zero deps, JSDoc only. When
  uncertain, choose simpler + record it.

## Security checklist

- [ ] Every digest section (identity notes, projects, daily summary) is scanned with the shared
      detector before it is injected; a `quarantine`-severity finding **omits the whole
      section** (the `[REDACTED]` form is never injected) and is surfaced by a fixed,
      code-owned banner naming only the section identifier + reason — no matched bytes, no
      content reach the injected digest / managed block. The scan runs after the A3/A4 trust
      gates and is fail-closed (a scan error omits). No untrusted identifier flows into a path
      or shell (pure text filtering).

## Acceptance criteria

- [ ] An approved+trusted identity note containing a secret (Stripe/OpenAI key, private-key
      block, `refresh_token=`) has its section **omitted** from `renderDigest`'s output — the
      secret bytes appear nowhere in the output — and a banner names the note with a code-owned
      "appears to contain a secret" reason.
- [ ] The other (clean) identity sections and the projects block still render in the same
      output.
- [ ] A false positive is an **omission + banner**, not an injected `[REDACTED]` section
      (assert the section is absent, not present-with-`[REDACTED]`).
- [ ] Clean fixtures → `renderDigest` is byte-identical to `tests/golden/digest-default.md`
      (golden unchanged, not edited).
- [ ] `renderDigest` never throws (a forced scan error omits the section, does not blow up
      rendering).
- [ ] A non-empty `opts.secretQuarantine` renders the fixed pending-review banner in the
      prefix (count + sanitized basenames, no file content, survives `capDigest`); an empty or
      absent list renders no banner (golden unchanged); the dream/sync call sites pass the
      `state/quarantine/` listing (missing dir → empty array).
- [ ] `wienerdog safety` shows all five gates BLOCKED; `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "digest"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
git diff --exit-code tests/golden/digest-default.md && echo "golden unchanged — OK"
```

## Out of scope (do NOT do these)

- The shared detector — **WP-122**. The staged-commit gate — **WP-123**. The log/alert/email
  sanitizing — **WP-124**.
- The "strong" last-known-good writer guard (keeping the prior `digest.md` on disk) — a deferred
  follow-up, if the owner wants it (touches the digest writers, not `digest.js`).
- The digest line/byte caps (WP-120, already shipped) — do not change `capDigest` or
  `DigestCaps`. **0700/0600 modes** on `digest.md` — **WP-126**.
- Re-enabling or changing the frozen daily-summary injection; any change to
  `tests/golden/digest-default.md`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/125-digest-section-secret-gate`; conventional commits; PR titled
   `feat(digest): omit a section that would inject a secret, banner the exclusion (WP-125)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
