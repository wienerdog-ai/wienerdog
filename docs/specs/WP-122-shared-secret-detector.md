---
id: WP-122
title: Shared scanAndRedact secret detector + regression corpus + pre-brain input hardening (audit A5)
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0024]
branch: wp/122-shared-secret-detector
---

# WP-122: Shared `scanAndRedact` secret detector + regression corpus + pre-brain input hardening (audit A5)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills,
hooks, scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons,
no servers, no telemetry. Installer/CLI code is plain Node ≥ 18, **zero runtime
dependencies**, JSDoc types only, no TypeScript, no build step.

The nightly **dreaming** job reads the user's AI-session **transcripts** (Claude Code
JSONL / Codex rollout files) and consolidates them into the vault. **Transcript content
is fully attacker-influenceable and routinely contains real secrets**: a developer
pastes an API key into a chat, a `tool_result` echoes a `.env` file, an OAuth
`refresh_token` shows up in a captured debug log.

Today there is **one** best-effort scrubber — `redact(text)` in
`src/core/transcripts/index.js`: a fixed array of `String.replace` regexes, applied once
inside `capMessage` to each message before it is written to a scratch **extract** (the
redacted JSON the dream brain reads). It returns **only sanitized text** — no signal of
what matched, or whether anything did — and it has **no failure mode** (a scanner error
or an oversized record silently degrades to "emit the raw text"). A 2026-07-15 security
audit (action **A5**, deep-dive `05-secret-lifecycle.md`) found that treating this one
ingest pass as if it were airtight is the structural bug: any pattern it misses becomes a
committed note, a durable log line, a digest banner, a managed block, or an email.

This WP builds the **one shared detector** that every A5 enforcement point (WP-123..125)
will call, and upgrades the existing pre-brain redaction to use it. It does exactly three
things:

1. A new pure module `src/core/secret-scan.js` exporting **`scanAndRedact(text)` →
   `{ text, findings }`** — sanitized text plus **metadata-only** findings (never the raw
   matched secret). Bounded input, linear-time patterns, **total/fail-closed** (an internal
   error withholds content rather than emitting raw text or throwing). This is the intake
   half of **ADR-0024**.
2. Migrate the transcripts `redact` onto it (`redact(text)` becomes
   `scanAndRedact(text).text`, byte-compatible) so the pre-brain pass inherits the upgraded
   coverage — the **pre-brain input enforcement point (EP1)**.
3. Bound/pseudonymize the extract's raw `source_path` and `cwd` before they are written to
   scratch and exposed to the brain (audit A5 item 3, second clause).

**A5 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/core/transcripts/index.js`** holds the whole redaction surface:

```js
const REDACTIONS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED:private-key]'],
  [/\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g, '[REDACTED:anthropic-key]'],
  [/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED:openai-key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:aws-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, '[REDACTED:github-token]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED:slack-token]'],
  [/\bya29\.[A-Za-z0-9\-_]+/g, '[REDACTED:google-oauth]'],
  [/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, '[REDACTED:jwt]'],
  [/\b(bearer)\s+([A-Za-z0-9_\-.~+/]{12,}=*)/gi, (_m, kw) => `${kw} [REDACTED:bearer-token]`],
  [/\b(api[_-]?key|secret|token|password|passwd|bearer)(["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-]{12,}/gi,
    (_m, key, sep) => `${key}${sep}[REDACTED:generic-secret]`],
];
function redact(text) {
  let result = text;
  for (const [pattern, replacement] of REDACTIONS) result = result.replace(pattern, replacement);
  return result;
}
```

`redact` is called in exactly one place — `capMessage(message)` — which redacts BEFORE
truncating and is applied to every message by `parseWithOutcome`. `redact` is also exported
and re-used by the dream orchestrator per its JSDoc. **Known weaknesses the audit named:**
the `\b` anchors miss a token glued to a preceding word character (`xsk-...`); the
assignment key list is short and misses `client_secret`/`refresh_token`/`access_token`/AWS
variants and uppercase names; there is no metadata signal; and there is no fail-closed path.

**`parseWithOutcome(entry, budget)`** post-processes the harness parser's `raw` extract
(`capMessage` each message, then `MAX_MESSAGES`) and returns `{ extract, parse }`. The
`Extract` typedef carries `source_path` (absolute transcript path) and `cwd` (the session's
working dir) verbatim — both get written into the scratch JSON the brain reads, so a home
path (username, directory structure) is exposed to the brain and can be echoed into a
committed note. `session_id` is already filename-sanitized by `scratch.js`'s `sanitize`.

The transcript unit tests are `tests/unit/transcripts.test.js`; the redaction is asserted
there and in the golden expected extracts `tests/fixtures/transcripts/claude-session.expected.json`
and `codex-rollout.expected.json` (each currently carries exactly one `[REDACTED:...]`).

There is **no** `src/core/secret-scan.js` and **no** `scanAndRedact` anywhere in `src/`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/secret-scan.js | the ONE detector: `scanAndRedact`, `redactOnly`, `hasHardFinding`, `ScanLimits`, `SEVERITY` |
| modify | src/core/transcripts/index.js | `redact` delegates to `scanAndRedact().text` (drop the local `REDACTIONS`); cap/pseudonymize `source_path`/`cwd` in `parseWithOutcome` |
| create | tests/unit/secret-scan.test.js | the regression corpus + property/perf bound + fail-closed + metadata-only findings |
| modify | tests/unit/transcripts.test.js | redaction parity + the upgraded-coverage cases + source_path/cwd capping |
| modify | tests/fixtures/transcripts/claude-session.expected.json | ONLY if the upgraded detector changes this fixture's redacted output (reconcile intentionally; see Fixtures note) |
| modify | tests/fixtures/transcripts/codex-rollout.expected.json | same |

### Exact contracts

**1. `src/core/secret-scan.js`.** Pure. No `fs`, no env, no argv, no network. Never throws.

```js
'use strict';

/**
 * Bounded-scan limits (audit A5, ADR-0024). Values OWNER-APPROVED — see the spec's
 * OWNER-APPROVED block. Named so the tests import ONE definition.
 */
const ScanLimits = {
  SCAN_MAX_BYTES: 256 * 1024,   // a text longer than this is NOT regex-scanned (see below)
  ENTROPY_MIN_LEN: 24,          // a contextual high-entropy candidate must be at least this long
  ENTROPY_MIN_BITS_PER_CHAR: 3.5, // Shannon bits/char over the candidate to count as high-entropy
};

/** @typedef {'redact'|'quarantine'} Severity
 *  redact     — the match is replaced inline by [REDACTED:<label>]; surrounding text kept.
 *  quarantine — a HARD finding (private key, known-credential exact match, high-entropy blob):
 *               a persistence gate withholds/reverts the WHOLE artifact, never commits the
 *               [REDACTED]-mutated prose. */
const SEVERITY = { REDACT: 'redact', QUARANTINE: 'quarantine' };

/** @typedef {{label:string, severity:Severity, count:number}} Finding
 *  Metadata ONLY — the raw matched secret is NEVER stored on a finding. */

/**
 * Scan `text` for secret-looking substrings, returning a sanitized copy plus
 * metadata-only findings. TOTAL and FAIL-CLOSED:
 *  - Non-string input → treated as '' → { text:'', findings:[] }.
 *  - text longer than SCAN_MAX_BYTES → NOT scanned; returns a fixed withheld marker
 *    `[wienerdog: oversized content withheld from secret scan]` and one finding
 *    {label:'oversized', severity:'quarantine', count:1}. (Callers already bound
 *    record size upstream — WP-118; this is the detector's own last-resort bound so
 *    no regex ever runs on an unbounded string.)
 *  - Any internal error → returns { text:'[wienerdog: secret scan failed — content withheld]',
 *    findings:[{label:'scan-error', severity:'quarantine', count:1}] }. Never the raw text,
 *    never a throw.
 * Coverage (audit A5 item 2), each a LINEAR-time pattern (no nested quantifiers that can
 * backtrack catastrophically — property-tested):
 *  - private-key blocks (PEM) → 'private-key', QUARANTINE.
 *  - current provider prefixes without brittle exact lengths: Anthropic `sk-ant-…`,
 *    OpenAI `sk-…`/`sk-proj-…`, AWS `AKIA…`, GitHub `gh[pousr]_…`, Slack `xox[baprs]-…`,
 *    Google OAuth `ya29.…`, Google API key `AIza…`, Stripe `sk_live_`/`rk_live_`/`pk_live_…`,
 *    JWT `eyJ….….…` → each its own label, REDACT (except a Stripe/AWS *secret* form →
 *    QUARANTINE, consistent with the OWNER-APPROVED quarantine posture above).
 *  - sensitive ASSIGNMENT keys, CASE-INSENSITIVE, uppercase names included:
 *    `client_secret`, `refresh_token`, `access_token`, `api[_-]?key`, `secret`, `token`,
 *    `password`, `passwd`, `credentials?`, `aws_secret_access_key`, `aws_session_token`,
 *    with a value that may be quoted / base64 / URL-charactered (`/ + = . ~ -`) → keep the
 *    key + separator, replace the VALUE with [REDACTED:<label>], REDACT. The value match must
 *    NOT depend on a leading `\b` (a token glued to a preceding word char must still match —
 *    the audit's explicit bypass case).
 *  - HTTP `Authorization: Bearer <token>` → 'bearer-token', REDACT.
 *  - structured JSON string values whose KEY is one of the sensitive keys above
 *    (`"client_secret":"…"`) → REDACT the value.
 *  - contextual high-entropy candidate (Shannon bits/char >= ENTROPY_MIN_BITS_PER_CHAR over a
 *    run of >= ENTROPY_MIN_LEN base64/hex chars) that did NOT already match a labelled pattern
 *    → 'high-entropy', QUARANTINE.
 *  - (NOT in this WP — OWNER-APPROVED 2026-07-17: exact values of Wienerdog-known
 *    OAuth/client credentials are matched by the A2 GWS broker on its own output path,
 *    not by this pure module.)
 * @param {string} text
 * @returns {{text:string, findings:Finding[]}}
 */
function scanAndRedact(text) { /* implement per the rules */ }

/** Sanitized text only (back-compat for callers that don't consume findings).
 *  redactOnly(text) === scanAndRedact(text).text
 *  @param {string} text @returns {string} */
function redactOnly(text) { return scanAndRedact(text).text; }

/** True iff any finding is QUARANTINE severity — the signal a persistence gate uses to
 *  withhold/revert the whole artifact. @param {Finding[]} findings @returns {boolean} */
function hasHardFinding(findings) { return (findings || []).some((f) => f.severity === SEVERITY.QUARANTINE); }

module.exports = { scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY };
```

**2. `src/core/transcripts/index.js`.**

- Delete the local `REDACTIONS` array and the loop body; `require('../secret-scan')` and make
  `redact(text)` return `scanAndRedact(text).text` (== `redactOnly(text)`). Keep the `redact`
  export and its signature verbatim — `capMessage`, the dream orchestrator, and existing tests
  all call it. This upgrades EP1 coverage with no API change.
- In `parseWithOutcome`, after building `out = { ...raw, truncated, messages }`, **bound the
  metadata paths before they reach scratch/brain**: replace `out.source_path` and `out.cwd`
  per the OWNER-APPROVED ruling below (cap length and/or pseudonymize the home prefix). Do NOT
  change `session_id` (already filename-sanitized downstream). Record the exact rule you
  implemented under "Decisions made".

### Worked examples (assert in `secret-scan.test.js`)

```
scanAndRedact('export CLIENT_SECRET=GOCSPX-abcd1234efgh5678ijkl')
  → text contains 'CLIENT_SECRET=' and '[REDACTED:' , NOT 'GOCSPX-abcd1234…'
  → findings includes {label:'client_secret'|'generic-secret', severity:'redact', count:1}

scanAndRedact('noise xsk-ant-0123456789abcdef0123 tail')   // glued to a preceding word char
  → the token is redacted (the fix must not require a leading \b)

scanAndRedact('{"refresh_token":"1//0abcDEF-_ghiJKL=="}')
  → the JSON value is redacted; findings has a 'refresh_token' redact finding

scanAndRedact('-----BEGIN RSA PRIVATE KEY-----\nAAAA...\n-----END RSA PRIVATE KEY-----')
  → text has [REDACTED:private-key]; findings has {label:'private-key', severity:'quarantine'}

scanAndRedact('the weather is nice today, nothing secret here')
  → { text: <unchanged>, findings: [] }   // no false positive on ordinary prose

scanAndRedact('x'.repeat(300*1024))
  → { text:'[wienerdog: oversized content withheld from secret scan]',
      findings:[{label:'oversized', severity:'quarantine', count:1}] }
```

## OWNER-APPROVED (2026-07-17) — DECISION NEEDED, resolve in the walkthrough

> These are open until the owner walkthrough; each becomes a dated OWNER-APPROVED
> line before this spec moves to `Ready`.

- **OWNER-APPROVED (2026-07-17) — Wienerdog-known-credential seeding: option (c), defer
  entirely to A2.** Item 2's "exact values of Wienerdog-known OAuth/client credentials" clause
  is NOT implemented in this WP. The detector stays a pure module (no `fs`, no secrets-read
  surface, no unwired `{known}` opt) and ships only the pattern-based coverage — which already
  catches the typical Google credential shapes (`GOCSPX-…`, `1//…`, `ya29.…`). Exact-value
  matching becomes a MANDATORY item of the A2 (GWS broker) specs: the broker is the one
  component that legitimately holds those bytes and applies the match on its own output path.
  Rationale: no dead API surface now, no pre-committing A2's design. ADR-0024's coverage list
  carries a dated amendment for this.
- **OWNER-APPROVED (2026-07-17) — source_path/cwd handling: pseudonymize the home prefix
  to `~` AND cap the remainder to a fixed length**, applied to both `source_path` and `cwd`
  in `parseWithOutcome` before the extract reaches scratch/brain. The username and absolute
  home structure never reach the brain (and thus cannot be echoed into committed notes or
  the digest), while project-relative context (`~/dev/foo`) — the reason these fields
  exist — is preserved. `session_id` is unchanged (already filename-sanitized downstream).
  The implementer picks the exact cap length, records it under "Decisions made".
- **OWNER-APPROVED (2026-07-17) — high-entropy thresholds and severity: keep the seeded
  values (`ENTROPY_MIN_LEN=24`, `ENTROPY_MIN_BITS_PER_CHAR=3.5`) and QUARANTINE severity.**
  An unstructured high-entropy blob has no safe partial redaction, so a hit withholds the
  artifact at whichever gate caught it — a false positive is a visible withhold/revert the
  user re-authors, never a silent mutation (the audit's stated posture). The thresholds
  live in the single named `ScanLimits` constant; if real-world false positives (e.g. long
  hex hashes near the 3.5 line) prove noisy, retuning is a cheap, test-backed follow-up.

## Implementation notes & constraints

- **This is the ONE detector (ADR-0024).** After this WP, `secret-scan.js` is the only place
  secret-matching regexes live. A `grep -rn "REDACTED" src/core/transcripts/` must show the
  redaction now comes from `secret-scan`, not a local list.
- **Fail-closed, never raw, never throw.** Every degraded path (oversized, internal error,
  non-string) returns a fixed withheld marker + a quarantine finding — never the input text.
  This is what the downstream gates rely on to treat "the scanner couldn't vouch for this" as
  "withhold it."
- **Metadata-only findings.** A finding carries `{label, severity, count}` and NOTHING else.
  Never attach the matched substring, an offset that could reconstruct it, or the surrounding
  context — a finding is inspected by alerting/logging code that must stay secret-free.
- **Linear-time patterns.** No regex with nested unbounded quantifiers (`(a+)+`) — the
  property test feeds pathological inputs (long runs of `=`, alternating classes) and asserts
  the scan completes within a wall-clock bound. Bound the input at `SCAN_MAX_BYTES` before any
  `.replace`/`.match`.
- **Redaction parity.** `redact` keeps its exact signature and remains byte-compatible for
  inputs the old list already covered; the changes are strictly additive coverage. If an
  existing golden fixture's redacted output changes, it is because the upgraded detector caught
  a token the old list missed — reconcile the fixture intentionally (Fixtures note), do not
  loosen the detector to preserve a stale golden.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] The detector is total and fail-closed: non-string, oversized, and internal-error inputs
      all yield a fixed withheld marker + a `quarantine` finding, never the raw text and never
      a throw. Findings are metadata-only (no raw secret, no reconstructable offset). Patterns
      are linear-time and the input is byte-bounded before scanning, so a fully
      attacker-controlled string cannot ReDoS or unbounded-buffer the scan. The pre-brain pass
      now redacts with the upgraded coverage (uppercase keys, glued tokens, refresh/access/
      client_secret, provider prefixes) before any transcript byte reaches a scratch extract;
      `source_path`/`cwd` are bounded before brain exposure.

## Acceptance criteria

- [ ] Regression corpus (`secret-scan.test.js`) covers, each asserting the secret is gone from
      `text` AND a metadata finding is present: **uppercase** assignment names
      (`CLIENT_SECRET=`, `REFRESH_TOKEN=`), Google **refresh-token** variants (`1//0…`),
      OpenAI (`sk-…`/`sk-proj-…`), GitHub (`ghp_…`), Google (`ya29.…`, `AIza…`), Stripe
      (`sk_live_…`), AWS (`AKIA…`, `aws_secret_access_key=`), **JSON** (`"token":"…"`),
      **quoted** values, values containing `/ + =`, and a token **directly following a word
      character** (no leading `\b`).
- [ ] `scanAndRedact` on ordinary prose returns the text unchanged and `findings: []` (no
      false positive on non-secret text).
- [ ] Oversized input (`> SCAN_MAX_BYTES`) is NOT scanned and returns the withheld marker + an
      `oversized` quarantine finding; a forced internal error returns the `scan-error` withheld
      marker (fail-closed), proven by a test seam or a pathological input.
- [ ] A property/perf test feeds catastrophic-backtracking bait and asserts the scan completes
      within a fixed time bound (bounded/near-linear scanning).
- [ ] `redact(text) === scanAndRedact(text).text`; the existing transcript redaction tests
      pass (parity), and `capMessage` still redacts before truncating.
- [ ] `parseWithOutcome` bounds `source_path`/`cwd` per the OWNER-APPROVED ruling; a scratch
      extract no longer exposes the raw home path (assert the transformed value).
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "secret"
npm test -- --test-name-pattern "transcript"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
grep -rn "REDACTED" src/core/transcripts/ || echo "redaction now sourced from secret-scan — OK"
```

## Out of scope (do NOT do these)

- Scanning **staged brain output** before the commit — **WP-123** (consumes `scanAndRedact` +
  `hasHardFinding`).
- The **durable log/stderr/alert/email** sanitizing transform — **WP-124**.
- The **per-section digest** scan gate — **WP-125**.
- **0700/0600 private modes** on the artifacts — **WP-126**.
- A5 **documentation** (limits, incident runbook) — **WP-127**.
- Wiring the `{known}` known-credential opt into the GWS broker — deferred to **A2**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/122-shared-secret-detector`; conventional commits; PR titled
   `feat(secrets): shared scanAndRedact detector + upgraded pre-brain redaction (WP-122)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are kept for
> template/upstream-porting fidelity.

## Fixtures note

`tests/fixtures/transcripts/{claude-session,codex-rollout}.expected.json` are golden extracts
that currently carry one `[REDACTED:...]` each. The upgraded detector is strictly
additive — if these fixtures contain NO token the old list missed, they stay **byte-unchanged**
and you must not edit them (per CLAUDE.md: update goldens only when the spec says so). They are
listed as `modify` **only** to unblock the CI file-touch gate in case the upgraded coverage
legitimately catches a new token in the fixture input; if a diff appears, confirm it is a
genuine new catch (a real secret-shaped string in the fixture) and reconcile it intentionally —
never loosen the detector to preserve a stale golden.
