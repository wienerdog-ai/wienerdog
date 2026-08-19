---
date: 2026-08-18
title: "WP-frontmatter-recognition-failopen round 10 — adversarial design review of the digest half, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 10 — adversarial design review (raw)

**Backend:** gptsol.
**Revision reviewed:** `788077b` — two deliverables, both in the digest.
**Scope instruction given:** the recognition fail-open and the validator half
are both owner-ruled disclosures; do not re-report them, but do report them if
the disclosure is dishonest. Classify every finding DESIGN-LEVEL or MECHANICAL.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: round 9's three findings are substantively resolved—the validator work is removed and accurately chartered with byte reuse as its starting hypothesis, the degraded-registry precondition and four-invariants/one-reason correction survived, and the residual now correctly separates unrecognized current bytes from unrecognized HEAD. However, the remaining digest contract contains an impossible acceptance criterion and still permits user-facing remediation that cannot fix the listed exclusion. Its ADR-0031 N/A count is also false. Executed commands: checkout identity and initial `git status --porcelain=v1` capture (exit 0); `wc -l`, `nl`, `sed -n`, `grep`, and `find` sweeps over the scoped spec, round-9 output, implementation, tests, ADR, and goldens (all exit 0); the spec's two current-state `node -e` measurements (both exit 0); scratch-only probes for the four recognition shapes across digest identity, digest daily, snapshot, current-revision floor, unrecognized-HEAD raise-only, mixed exclusions, duplication, prefix ordering, cap displacement, AC2 outcomes, and candidate banner wording (all completed successfully; one initial mutant wrapper exited 1 only because its zsh postlude assigned the readonly variable `status`, and clean reruns exited 0); `node --test tests/unit/digest.test.js` (exit 0: 63/63 passed); `npm test` (exit 0: 2,015 tests, 2,006 passed, 9 skipped); `npm run lint` (exit 0: markdownlint and frontmatter passed; shellcheck and PSScriptAnalyzer skipped because their binaries were absent); `git diff --stat -- tests/golden/` (exit 0, no output); final status comparison (exit 0): before and after were byte-identical at zero bytes, branch remained `wp/frontmatter-recognition-failopen`, and HEAD remained `788077b`.",
  "findings": [
    {
      "severity": "high",
      "title": "AC2 contradicts both AC1 and the preserved daily-path behavior",
      "body": "DESIGN-LEVEL — AC2 requires the summary to be absent exactly when AC1 emits a banner and present otherwise, but AC1 explicitly keeps `untrusted-exact` silent while `parseNoteResult` returns `note: null`, so that summary is absent without a banner. The equivalence also fails for a trusted note with no or an empty `## Summary`, a blocked daily-summary capability, and a summary rejected by the existing secret gate. An executed scratch implementation of the specified push produced: malformed and invalid inputs absent with the new banner; exact `true`, missing summary, empty summary, and blocked capability absent without it; and a secret summary absent with the existing secret reason. An implementation can only make AC2 pass by testing a narrowed fixture universe rather than satisfying its literal contract.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 151,
      "line_end": 153,
      "confidence": 1,
      "recommendation": "Replace AC2 with an explicit outcome matrix under stated preconditions. At minimum distinguish: malformed/invalid → summary absent plus anomaly banner; exact `true` → absent silently; absent/exact-false flag with a non-empty Summary and allowed capability → provenance admits it; and independent missing/empty-section, capability, secret-gate, and cap outcomes retain their existing behavior."
    },
    {
      "severity": "high",
      "title": "The wording contract still allows remedies that cannot fix the listed exclusion",
      "body": "DESIGN-LEVEL — requiring a noun that covers identity and daily entries, plus conditionally hiding `memory approve`, is insufficient to make the heterogeneous banner accurate. The existing list also accepts `active-projects`, and it accepts secret findings for identity, project, and daily entries. A scratch candidate using “some notes,” retaining “Fix their frontmatter,” and showing `memory approve` only when an identity entry exists satisfies AC3's identity-only/daily-only/mixed assertions, yet tells an `active-projects (appears to contain a secret)` user to fix nonexistent frontmatter and gives the same false remedy for a daily secret. Even for an identity entry, `memory approve` only resolves hash-approval reasons; it does not make malformed, invalid, or secret-bearing bytes pass the later gates. This preserves the same impossible-remedy class that the WP claims to fix.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 106,
      "line_end": 110,
      "confidence": 0.99,
      "recommendation": "Define remediation by existing label/reason class, or use one genuinely generic fixed remedy that is valid for every list member. Expand AC3 to cover `active-projects`-only, daily-secret-only, identity secret/provenance/hash reasons, and mixed lists; assert that `memory approve` appears only for identity hash-approval reasons it can actually resolve."
    },
    {
      "severity": "medium",
      "title": "The ADR-0031 activation count incorrectly omits the mirrored-surface trigger",
      "body": "MECHANICAL — the N/A rationale says only criterion (iv) fires, but this contract's label, reason mapping, silence behavior, wording, and remedy conditions necessarily appear in the Deliverables cell, Current-state prose, Exact contracts, Security checklist, and AC1–AC4. That is criterion (vii), “the same contract must appear in multiple mirrored surfaces,” in addition to the acknowledged criterion (iv), so ADR-0031's 2-of-7 threshold is met. The AC2 contradiction and incomplete wording assertions demonstrate the exact mirror drift the discipline is intended to prevent.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 112,
      "line_end": 120,
      "confidence": 0.99,
      "recommendation": "Activate the Contract reference section. Add one canonical outcome table covering daily classification, summary admission, emitted label/reason, and applicable remediation, then register the Deliverables cell, Current state, Exact contracts, Security checklist, acceptance criteria, and verification steps in a Mirrored Surface Checklist."
    }
  ]
}
```
