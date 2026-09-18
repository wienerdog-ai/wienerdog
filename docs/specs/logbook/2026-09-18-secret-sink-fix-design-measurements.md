---
date: 2026-09-18
related_wps: [WP-secret-sink-redact-before-truncate, WP-secret-stream-safe-cut-redactor, WP-secret-sink-chunk-fix, WP-secret-sink-wiring-probes]
---

# Secret-sink fix — design measurements (2026-09-18)

Provenance for every "measured 2026-09-18" claim in the three fix specs and in
ADR-0043. All measurements were run against `main` at `08de2bc3`, through the
shipped `src/core/secret-scan.js`, with the repo's own synthetic probe value.
Nothing was executed against a real credential.

The owner ruling that started this is recorded verbatim in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: *"3) spec
the fix pls"*, for the seven `WD-SINK-*` defects `WP-secret-sink-wiring-probes`
pinned (its owner item O2).

## 1. The truncation leak and the swap that closes it

Input `'F'.repeat(2000 - 24) + PROBE` where `PROBE` is
`sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff` (48 characters).

| Order | Last 30 characters of the result | Length |
|-------|----------------------------------|--------|
| `redactOnly(v.slice(0, 2000))` — shipped | `FFFFFFsk-ant-api03-PROBE-aaaa-` | 2000 |
| `redactOnly(v).slice(0, 2000)` — the fix | `FFFFFF[REDACTED:anthropic-key]` | 2000 |

So the swap closes it, and the field still fills its cap exactly.

## 2. The detector's oversized cliff, which the swap exposes

`redactOnly('x'.repeat(300 * 1024))` returns
`[wienerdog: oversized content withheld from secret scan]` — 56 characters —
because `Buffer.byteLength > ScanLimits.SCAN_MAX_BYTES` (262144) skips the scan
entirely. Applying `.slice(0, 2000)` to that keeps all 55. This is why
`WP-secret-sink-redact-before-truncate` carries an owner item: after the swap, a
field over 262144 bytes becomes that marker rather than its first 2000
characters.

## 3. The chunk leak

`redactOnly(PROBE.slice(0, 24)) + redactOnly(PROBE.slice(24))` returns the whole
48-character key unchanged. `redactOnly(PROBE)` returns
`[REDACTED:anthropic-key]`. This reproduces, at the function level, what
`WP-secret-sink-wiring-probes` round zero measured through real subprocess pipes:
neither per-chunk call redacts anything and the two writes land contiguous.

## 4. Which rule families match across a line break

This is the measurement that decides ADR-0043's Table S, and it is the reason a
cut at *every* newline would be a regression rather than a fix. Each input below
is one would-be match with a `\n` inserted inside it; `SPANS` means `redactOnly`
still redacted it.

| Rule family | Verdict |
|-------------|---------|
| `private-key` (`-----BEGIN … PRIVATE KEY-----` … `-----END …`) | **SPANS** |
| `Bearer <token>` (`\s+` between) | **SPANS** |
| legacy `key=value` assignment (`\s*` around the separator) | **SPANS** |
| JSON `"client_secret":` … `"value"` (`\s*:\s*`) | **SPANS** |
| extended assignment (`AWS_SECRET_ACCESS_KEY =` … value) | **SPANS** |
| keyword-bound entropy tier, reached through those separators | **SPANS** |
| `anthropic-key` (`sk-ant-…`) | line-bounded |
| `basic-auth` (`[ \t]` only) | line-bounded |
| `jwt`, and every other labelled provider-prefix rule | line-bounded |
| entropy `hasBoundContext` lookback | line-bounded by construction (`secret-scan.js:228`, "the search never crosses a `\n`") |

Two worked cases, in full:

- `redactOnly('password:\n  hunter2hunter2hunter2\n')` →
  `'password:\n  [REDACTED:generic-secret]\n'`, but
  `redactOnly('password:\n') + redactOnly('  hunter2hunter2hunter2\n')` →
  the input unchanged. A newline cut between them loses the match.
- A three-line PEM scanned whole → `'[REDACTED:private-key]\n'`; the same PEM
  scanned line by line → `'-----BEGIN RSA PRIVATE KEY-----\n[REDACTED:high-entropy]\n-----END RSA PRIVATE KEY-----\n'`.
  The body happened to be caught by the entropy tier here; a base64 body
  containing `/` fragments into sub-runs shorter than `ENTROPY_MIN_LEN` and would
  not be.

Note also that the `Bearer` rule's replacement rewrites the separator
(`'Authorization: Bearer\n  <token>'` → `'Authorization: Bearer [REDACTED:bearer-token]'`),
so the transform's output is not byte-preserving. That is existing behaviour and
is why the region contract is stated over regions, not over bytes.

## 5. Why the package was filed as three, not one

The orchestrator's brief named one work package,
`WP-secret-sink-chunk-and-truncation-fix`, with leave to change the shape. It was
filed as a chain of three because one package would have been an L by
`docs/specs/README.md`'s heuristic (≤ ~400 lines of new non-test content, ≤ 8
files, **zero "and also" clauses**): a new bounded transform with a non-obvious
cut predicate, *and* four stream call sites, *and* three truncation sites, *and*
seven probe conversions, *and* seven RED declarations across four files, *and*
two code-comment corrections, *and* an ADR. The split is
`WP-secret-sink-redact-before-truncate` (S) → `WP-secret-stream-safe-cut-redactor`
(M, and ADR-0043) → `WP-secret-sink-chunk-fix` (M, depends on both).

The two open design questions carried into the drafts are
`WP-secret-sink-redact-before-truncate` owner item 1 (what a field over 262144
bytes becomes) and `WP-secret-stream-safe-cut-redactor` owner item 1 (whether
ADR-0043 may proceed under standing authorization while it reverses a decision
recorded only as a code comment).
