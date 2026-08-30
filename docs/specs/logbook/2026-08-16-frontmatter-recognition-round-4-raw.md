---
date: 2026-08-16
title: "WP-frontmatter-recognition-failopen round 4 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 4 — adversarial design review (raw)

**Backend:** gptsol.
**Reviewer instructions:** the frozen vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, placeholders filled, plus focus
text in two parts — verify round 3's two findings are genuinely fixed rather
than re-worded, and attack the five mechanisms that did not exist in round 3.
The reviewer was asked to extract and run both embedded probe blocks verbatim
out of the spec, and to close round 3's disclosed lint gap.
**Revision reviewed:** `94266e9` on `wp/frontmatter-recognition-failopen`.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Committed BEFORE adjudication.** No finding below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: Table A remains fail-open for two concrete delimiter families: whitespace/BOM combinations that its own one-pass candidate normalization sends to R3, and blocks separated by CR, U+2028, or U+2029 that the LF-only split never sees as lines. Both allow an explicit derived_from_untrusted:true to remain trusted; mixed-separator probes confirmed that the daily Summary is then found and injectable. The B2 push fixes literal silence and keeps the label/reasons code-owned, but knowingly renders a false identity-note warning with an inapplicable approval remedy for a daily note. Executed: the Table A boundary probe (exit 0; all 15 enumerated cases classified 4 RECOGNIZED, 7 FAIL-CLOSED, 4 no-frontmatter); all seven Table B commands verbatim (each exit 0 and each reproduced its stated current behavior); custom whitespace/BOM/Unicode/line-separator probes (exit 0); the corpus measurement (exit 0: 48 files, 27 proper openers, and zero files in each changed population); V2 protected-path tests (exit 0, 251/251 passed); npm test (exit 0, 2015 tests: 2006 passed, 9 skipped, 0 failed); npm run lint (exit 0, though shellcheck and PSScriptAnalyzer were skipped because their local binaries are absent); and git diff --stat -- tests/golden/ (exit 0, empty). Initial and final git status --porcelain were both empty (0 bytes), branch remained wp/frontmatter-recognition-failopen, and HEAD remained 94266e9ab9129af29b57fda9b5a1f8bc02daed03.",
  "findings": [
    {
      "severity": "high",
      "title": "R2 still trusts whitespace/BOM delimiter attempts",
      "body": "R2 chooses the first LF-delimited line whose bytes are non-empty before removing [ \\t], then applies normalization in a single fixed order: trailing CR, leading BOMs, surrounding spaces/tabs. The executed reference classifier therefore sent a space-only line followed by `---`, a tab-only line followed by `---`, ` \\uFEFF---`, and `\\uFEFF \\uFEFF---` to R3. NBSP followed by `---` also lands in R3 even though JavaScript trim-based readers normalize it to `---`. The current parser consequently reports delimited=false, malformed=false and parseNoteResult returns exclusion=null. These are visually blank or invisible-prefix variants of the exact delimiter attempt the spec says it closes, so an explicit untrusted flag can still be injected by the digest or copied into a snapshot.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 248,
      "line_end": 302,
      "confidence": 0.99,
      "recommendation": "Define candidate selection after normalizing whether a line is blank, and define BOM/allowed-whitespace handling as one anchored character-set operation or a fixed-point normalization rather than ordered replacements. Delimiter-like candidates containing other invisible spacing should either be explicitly fail-closed or explicitly justified as trusted. Add boundary and protected-path cases for whitespace-only lines, whitespace before an embedded BOM, interleaved BOM/whitespace, NBSP, and multi-BOM inputs."
    },
    {
      "severity": "high",
      "title": "Non-LF visual line separators preserve a full provenance bypass",
      "body": "The contract and reference classifier inherit parse's text.split('\\n') boundary. A CR-only, U+2028-separated, or U+2029-separated apparent `---` / flag / `---` block is therefore one parser line and falls into R3. This is not merely cosmetic: executed mixed-separator probes using each separator for the apparent frontmatter block and LF before `## Summary` returned exclusion=null and summaryFound=true for all three. Wienerdog's own digest renderer already treats CR, U+2028, and U+2029 as visual line breaks, so the product can visually interpret boundaries that its security lexer ignores. An attacker-influenced writer can retain trusted treatment of an explicit true flag while the daily content remains injectable.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 244,
      "line_end": 256,
      "confidence": 0.99,
      "recommendation": "Make Table A explicitly classify CR, U+2028, and U+2029 separators. They need not become recognized frontmatter, but a delimiter-shaped leading visual line using them must fail closed. Implement leading-region line scanning that distinguishes CRLF from lone CR without normalizing body bytes, and add parser, daily-digest, snapshot, and validator tests for CR-only, U+2028, U+2029, and mixed-separator forms."
    },
    {
      "severity": "medium",
      "title": "The B2 warning gives daily-note users a false diagnosis and unusable remedy",
      "body": "Pushing the daily exclusion onto identityExclusions does make the anomaly non-silent, and the fixed `daily-summary` label and reason prevent note content from reaching the banner. At render level, however, the existing banner says that identity notes were omitted and recommends `wienerdog memory approve <note>`. That command accepts only the four fixed identity notes, never a daily note. The spec explicitly acknowledges this inaccurate noun but defers it while activating newly malformed daily omissions now. A user losing the newest daily summary is therefore directed toward the wrong files and an impossible approval operation, weakening the warning's recovery value.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 197,
      "line_end": 204,
      "confidence": 0.98,
      "recommendation": "In this package, make the existing fixed banner accurate for heterogeneous exclusions—for example, use a generic note/section noun and conditionally include identity approval guidance only when an identity entry is present. Keep the daily label and all wording code-owned, and add a render-level assertion for the complete malformed-daily warning and its applicable remediation."
    }
  ]
}
```
