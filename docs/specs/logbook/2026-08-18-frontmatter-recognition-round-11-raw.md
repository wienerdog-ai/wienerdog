---
date: 2026-08-18
title: "WP-frontmatter-recognition-failopen round 11 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 11 — adversarial design review (raw)

**Backend:** gptsol.
**Revision reviewed:** `e733423` — two deliverables; the package does one
thing: the daily path emits a banner entry instead of dropping a note
silently.
**Scope instruction given:** three owner-ruled disclosures (the recognition
residual, and the two successor charters) must not be re-reported as findings
unless the disclosure itself is dishonest. Classify every finding
DESIGN-LEVEL or MECHANICAL.
**Read-only property:** verified mechanically on both sides — byte-identical.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: round 10's impossible equivalence was replaced, but the two canonical tables still overlap, contradict each other, and omit reachable daily-read outcomes, so AC1 and AC2 remain satisfiable only through narrowed fixtures. The cap-preservation language also denies measured displacement of previously emitted body content, and the remedy-successor disclosure's four-of-six count contradicts its own per-site evidence. The wording redesign itself is gone (`digest.js:784` is only frozen as a preservation guard); the six existing push sites, new seventh writer, and hash-only scope of `memory approve` were verified. Exact-true silence is directly required by ADR-0022 §4, and a scratch implementation confirmed provenance and secret handling cannot produce duplicate `daily-summary` entries and preserves identity → active-projects → daily ordering. Executed commands: initial/final `git status --porcelain=v1`, `git branch --show-current`, `git rev-parse --short HEAD`, and `cmp` (all exit 0; status remained byte-identical at zero bytes, branch `wp/frontmatter-recognition-failopen`, HEAD `e733423`); scoped `wc`, `nl`/`sed`, `grep`, `find`, and `tail` read sweeps (exit 0 except two mistaken searches under nonexistent `tests/fixtures/vault`, exit 1; the corrected `tests/fixtures/identity-filled` searches exited 0, with one non-fatal inner `printf` diagnostic); the spec's `node -e` and `grep` measurements (exit 0); scratch-only candidate probes for missing/unreadable/oversized/truncated/alternate-newest notes, overlapping exclusions, ordering, duplication, and cap displacement (exit 0); `node --test tests/unit/digest.test.js` (exit 0: 63/63 passed); `npm test` (exit 0: 2,015 tests, 2,006 passed, 9 skipped); `npm run lint` (exit 0: markdownlint and frontmatter passed; shellcheck and PSScriptAnalyzer skipped because their binaries were absent); and `git diff --stat -- tests/golden/` (exit 0, no output).",
  "findings": [
    {
      "severity": "high",
      "title": "The canonical tables are neither mutually exclusive nor exhaustive",
      "body": "DESIGN-LEVEL — Table A unconditionally requires a banner for `malformed` and `untrusted-invalid`, while Table B says a missing/empty Summary or blocked capability emits no new entry; one note can satisfy both tables. A malformed note with no Summary produced the new banner in an executed candidate implementation, whereas the same malformed note under a blocked capability was never read and stayed silent, so AC1 and AC2 cannot both hold literally without an unstated precedence rule. The tables also omit reachable states explicitly exercised in review: no matching daily candidate, a selected but unreadable candidate (`readNoteBounded` returns the fifth class `absent`), a Summary beyond `MAX_DAILY_READ_BYTES`, a UTF-8-safe truncation at that boundary, and `newestDaily` selecting a different dated file. An implementer can therefore pass AC1/AC2 by choosing disjoint fixtures while leaving degraded and overlapping behavior unspecified.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 119,
      "line_end": 188,
      "confidence": 1,
      "recommendation": "Replace Tables A and B with an ordered, mutually exclusive decision table: candidate selection → capability gate → bounded-read result (including `absent`) → provenance class → section extraction → secret gate → overall cap. State outcomes for no candidate, unreadable candidate, bounded-prefix truncation, and alternate-newest selection, then make AC1/AC2 assert every ordered row and the material intersections rather than treating independent predicates as disjoint."
    },
    {
      "severity": "medium",
      "title": "The no-new-omission claim is false when the digest is capped",
      "body": "MECHANICAL — the Security checklist says nothing that reaches the digest today stops reaching it, and AC4 says there is no cap change, but the existing cap always reserves the prefix before body content. In an executed scratch implementation, adding the specified malformed-daily banner to a digest already at the 120-line cap displaced two previously emitted identity lines (`goals-line-34` and `goals-line-35`) while retaining the existing truncation marker. The constants and cap algorithm remain unchanged, but the new prefix entry necessarily reduces the body budget; the current wording hides that user-visible consequence and gives AC4 no unambiguous expected result.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 166,
      "line_end": 198,
      "confidence": 1,
      "recommendation": "Limit the preservation claim to admission decisions before `capDigest`, explicitly authorize the existing prefix-first policy to displace additional body content when the new warning is present, and define AC4 as preserving cap constants, algorithm, marker, and list ordering. Add line-cap and byte-cap assertions that pin the expected displacement; if body displacement is not acceptable, the implementation needs a different cap design."
    },
    {
      "severity": "medium",
      "title": "The remedy successor's four-of-six count contradicts its own table",
      "body": "MECHANICAL — no interpretation of “wrong for four” matches the six existing rows that follow. If a template is inaccurate whenever either offered remedy is false, all six rows are inaccurate: the hash-gate row falsely offers frontmatter repair, the malformed and invalid rows falsely offer approval, and all three secret rows offer no valid remedy. If “wrong” means neither offered remedy works, exactly the three secret rows qualify. The disclosed table accurately records what `memory approve` can resolve, but its aggregate claim uses a different, unstated counting unit and can misstate the successor's starting bound.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 346,
      "line_end": 367,
      "confidence": 0.99,
      "recommendation": "Delete the unsupported aggregate or define its unit explicitly. The table supports the precise statement that every existing row receives at least one inaccurate offered remedy, while the three secret rows receive no valid offered remedy at all."
    }
  ]
}
```
