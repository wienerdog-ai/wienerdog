---
date: 2026-08-16
title: "WP-frontmatter-recognition-failopen round 2 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 2 — adversarial design review (raw)

**Backend:** gptsol.
**Reviewer instructions:** the frozen vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, placeholders filled, plus focus
text in two parts — verify round 1's four findings are genuinely fixed rather
than re-worded, and attack the five mechanisms that did not exist in round 1.
Residual R2 was handed to the reviewer as the explicit hardest target by the
relay, not discovered by it.
**Revision reviewed:** `3212104` on `wp/frontmatter-recognition-failopen`.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Committed BEFORE adjudication.** No finding below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: R2 preserves the same attacker-selectable recognition bypass the package claims to close, the daily-summary path cannot provide AC4's promised malformed-exclusion banner without an unlisted digest.js edit, AC9 omits a negative control for the template-literal bypass the spec itself acknowledges, and the claimed zero thematic-break corpus result does not reproduce. Round-1 F2's proposed malformed guard does close the validator field leak without an observed vacuous acceptance; the baseline thematic-break collision and revised 48-file corpus count also reproduced. Executed on branch wp/frontmatter-recognition-failopen at 3212104949b6d9a1ad6977a47a680e830f710116: checkout and initial-status verification (exit 0; empty); parser/gate matrix including A1-A6, R2, mixed closer and baseline collision (exit 0); scoped corpus scan (exit 0: 48 files, zero BOM/empty-first-line/indented-opener/CR hits, but 27 first-nonblank thematic-break hits); delimiter false-positive scan (exit 0: 27 exact openers, zero without a later closer, zero A4-A6-with-closer candidates); consumer/call-site and delimiter-source searches (exit 0); in-memory daily malformed-visibility probe (exit 0: daily omitted, no warning); V2 `node --test` command (exit 0: 251 passed); `npm test` (exit 0: 2015 total, 2006 passed, 9 skipped); `npm run lint` (exit 0, with shellcheck and PSScriptAnalyzer unavailable and skipped); `git diff --stat -- tests/golden/` (exit 0, no output). Final `git status --porcelain=v1 -z` remained empty and byte-identical to the initial status.",
  "findings": [
    {
      "severity": "high",
      "title": "R2 leaves the central gate bypass one deletion away",
      "body": "The rationale used to close A4-A6 applies equally to R2: the writer or attacker can omit the closing delimiter just as cheaply as choosing leading whitespace. The executed probe confirmed that `---\\nderived_from_untrusted: true\\nno closing delimiter here` produces `delimited:false, malformed:false` and digest `exclusion:null`, so digest identity/daily reads and the snapshot still treat explicitly flagged bytes as trusted. Calling this behavior pre-existing does not distinguish it from the pre-existing A4-A6 failures or reduce its exploitability. A general missing-closer fail-closed rule would newly exclude legitimate Markdown that begins with an ordinary `---` thematic break and has no later exact `---`; that class needs only one delimiter-like line, whereas the accepted A4-A6 false-positive class needs leading blank/indent formatting plus a later delimiter-like line, so it is structurally broader and likely larger, although the spec has no user-vault data to quantify either. The scoped scan found zero examples of both classes among the 48 shipped/pinned files, so repository evidence supplies no cost-based reason to leave R2 open.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 274,
      "line_end": 283,
      "confidence": 0.99,
      "recommendation": "Rule on R2 in this package. Prefer classifying every supported opener or near-opener without a tolerated closer as malformed, paired with a pre-upgrade user-vault scan/warning for the broader thematic-break collision. If that migration cost is rejected, define a narrower fail-closed rule at least for an unclosed candidate region containing a provenance-shaped `derived_from_untrusted` field. Add red/green parser, digest and snapshot tests for exact, BOM, CRLF and whitespace-prefixed unclosed candidates."
    },
    {
      "severity": "high",
      "title": "The daily-summary exclusion is silent, making AC4 impossible inside the deliverable boundary",
      "body": "Table B promises A4-A6 daily-summary exclusions \"with the banner\", but `renderDigest` only turns malformed identity-note exclusions into `identityExclusions`; its daily path computes `r.note && extractSection(...)` and discards `r.exclusion`. An in-memory probe forcing the shared parser to return `malformed:true` on the daily read omitted the summary but produced no warning. The parser change alone cannot append a digest banner. Snapshot skips remain observable through `skipped`, and dream reverts are recorded in the enforcement report, but this digest path loses content silently. Satisfying AC4 therefore requires changing `src/core/digest.js`, which is absent from Deliverables and contradicts \"Consumer edits: exactly one.\"",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 290,
      "line_end": 298,
      "confidence": 1,
      "recommendation": "Add `src/core/digest.js` to Deliverables, revise the consumer-edit count, and require the daily path to surface anomalous `malformed` and `untrusted-invalid` exclusions through an accurate existing-style warning while keeping exact-true policy exclusions silent. Add a test proving A4-A6 daily notes both disappear and emit the banner; alternatively remove the visibility claim and explicitly accept silent daily-note loss."
    },
    {
      "severity": "medium",
      "title": "AC9 still permits a known template-literal second lexer",
      "body": "The revised prose correctly states the universal property and explicitly identifies a duplicate lexer written as a template literal as a bypass. Its enforceable acceptance criterion, however, requires negative controls only for single-quoted, double-quoted and regex forms. A checker that handles exactly those three forms but misses ``line === `---` `` satisfies AC9 while violating the stated property and reproducing one of the known round-1 bypasses. Thus the prior finding has been reworded into a property but not completely closed by the verification contract.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 193,
      "line_end": 210,
      "confidence": 0.98,
      "recommendation": "Add a template-literal duplicate lexer to AC9 and V1's mandatory negative controls, alongside the single-quoted, double-quoted and regex forms. Require the same source check to pass on the real tree and fail on each acknowledged mutant."
    },
    {
      "severity": "medium",
      "title": "The pinned corpus's zero thematic-break measurement is false as written",
      "body": "The 48-file scope and the zero counts for BOM, empty-first-line, whitespace-indented opener and CR bytes reproduced. The stated scan for \"any first non-blank line that is a thematic break\" did not: a bytewise CommonMark thematic-break predicate found 27 files whose first nonblank line is `---`, including shipped skills, identity templates, golden files and fixtures. Those lines may be intended as frontmatter delimiters, but the spec itself correctly says the bytes also collide with Markdown thematic breaks; intention cannot make the claimed bytewise category zero. This makes the measured migration evidence non-reproducible and obscures the actual false-positive populations relevant to A4-A6 and R2.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 102,
      "line_end": 110,
      "confidence": 1,
      "recommendation": "Replace the ambiguous thematic-break category with reproducible predicates that directly measure changed classifications, such as exact/BOM/CRLF opener without a tolerated closer and A4-A6 near-opener with a tolerated closer. Pin the scan command and report each count separately; retain the reproduced total of 48 files."
    }
  ]
}
```
