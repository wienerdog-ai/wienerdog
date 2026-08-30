---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen round 5 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 5 — adversarial design review (raw)

**Backend:** gptsol, on the **retry** after the abort recorded in
`2026-08-17-frontmatter-recognition-round-5-aborted-raw.md`. The abort
produced no verdict; this run is round 5.
**Reviewer instructions:** the frozen vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, placeholders filled, plus focus
text in two parts — verify round 4's three findings are genuinely fixed, and
attack the five mechanisms that did not exist in round 4.
**Revision reviewed:** `29fc701`; the spec itself is unchanged since
`285a7af` (the intervening commit is the aborted-round logbook record).
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Committed BEFORE adjudication.** No finding below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the revised contract still permits two concrete provenance bypasses: its deliberate ZWSP exception is invisible on the actual daily path, and its trim-tolerant closer can terminate a recognized block before the security field. The generated sweep also neither fails its process when its properties are violated nor constrains false-positive classification. Executed: extracted and ran the Table A block verbatim (exit 0: 23/23 worked cases; 50,000 generated inputs; 0 unclassified and 0 reported leaks); extracted and ran all seven Table B commands verbatim (each exit 0 and reproduced its stated current behavior); custom separator, trim, invisible-prefix, premature-closer, and classifier-mutant probes (corrected wrappers exit 0; one initial wrapper exited 1 only because zsh reserves `status`); V2 protected-path tests (exit 0: 251/251 passed); `npm test` (exit 0: 2,015 tests, 2,006 passed, 9 skipped, 0 failed); `npm run lint` (exit 0, with shellcheck and PSScriptAnalyzer skipped because their binaries are absent); and `git diff --stat -- tests/golden/` (exit 0, empty). Initial and final `git status --porcelain` were byte-identical and empty; branch remained `wp/frontmatter-recognition-failopen`, HEAD remained `29fc7014b4ee0a7d2f9eaeb5a533d76b409db81e`.",
  "findings": [
    {
      "severity": "high",
      "title": "The deliberate ZWSP R3 exception remains a full provenance bypass",
      "body": "The spec deliberately classifies `U+200B + ---` as no frontmatter because `DAILY_INVISIBLE` would supposedly render the prefix visibly. That encoding runs only after `extractSection` has selected the daily Summary; the opener and provenance lines are not part of the emitted summary and are therefore never encoded. The executed reference classifier returned R3 for the ZWSP-prefixed block, and an actual `renderDigest` probe returned `exclusion=null`, injected `INJECTED`, and emitted neither the opener nor an `<U+...>` token. The claim that ZWSP is the one surviving invisible is also false: U+2800 BRAILLE PATTERN BLANK is neither trimmed, split, nor encoded and produced the same trusted/injected result. Thus a daily note can visibly appear to carry `derived_from_untrusted: true` while its Summary still enters session context.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 318,
      "line_end": 327,
      "confidence": 0.99,
      "recommendation": "Remove the ZWSP R3 exception and replace the renderer-based rationale with a conservative, explicitly defined delimiter-attempt predicate that covers invisible or blank prefixes without relying only on `trim()`. Add protected-path tests for at least U+200B and U+2800 proving `parseNoteResult` returns `malformed`, the daily Summary is omitted with a warning, and the snapshot is skipped."
    },
    {
      "severity": "high",
      "title": "A trimmed near-closer can hide the security field in trusted body text",
      "body": "R1 accepts the first later line whose `trim()` is `---`, following the existing parser and reference probe's first-closer scan. For `---\\nid: d\\n--- \\nderived_from_untrusted: true\\n---\\n## Summary\\nINJECTED`, the executed reference classifier returned RECOGNIZED. Applying the specified closer semantics ends the block at `--- `, yields a well-formed field map without `derived_from_untrusted`, and leaves the explicit flag in trusted body text. The current parser instead scans through the near-closer to the later exact closer, marks `--- ` as junk, exposes the flag, and returns the `malformed` exclusion. The proposed tolerance therefore converts a currently excluded note into an admitted one, contradicting the claim that every changed classification moves toward gating except B4.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 290,
      "line_end": 303,
      "confidence": 0.98,
      "recommendation": "Keep closer recognition narrower than `trim()`: after splitting LF/CRLF, require an exact `---` closer and treat a delimiter-like near-closer encountered before it as malformed. Add a regression containing an early `--- `, a subsequent provenance flag, and a later exact closer, asserting exclusion at the parser, both digest paths, and snapshot gate."
    },
    {
      "severity": "medium",
      "title": "The generated sweep is non-enforcing and cannot prove correct classification",
      "body": "The probe increments `bad` and `leak` but only prints them; it never asserts or sets a failing exit status. Executed missing-branch and R2-leak mutants printed 39,619 unclassified inputs and 9,352 leaks respectively, yet both scripts exited 0, so the required deliberately-broken run does not go red. Even with those counters asserted, the two properties are one-sided: a mutant preserving all 23 worked cases but returning FAIL-CLOSED for every unseen input had zero worked mismatches, zero unclassified values, and zero leaks while classifying plain `x` contrary to R3. An overbroad `^-{3,}` mutant likewise passed both reported properties while misclassifying `---title`. The generated alphabet also contains only space, tab, NBSP, and BOM from the claimed trim set, rather than the full named set. This proof can therefore approve both missing enforcement and user-visible false-positive exclusions.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 332,
      "line_end": 418,
      "confidence": 0.99,
      "recommendation": "Turn every counter into a hard assertion so each required mutant exits nonzero. For every generated input, compare the implementation against an independent declarative oracle for all three classes, or add bidirectional properties that positively constrain R1, R2, and R3 rather than only preventing R2-to-R3 leaks. Generate the complete named trim character set, and retain explicit mutation controls for a missing branch, a leak to R3, and an overbroad fail-closed classifier."
    }
  ]
}
```
