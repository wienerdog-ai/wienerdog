---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen round 6 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 6 — adversarial design review (raw)

**Backend:** gptsol.
**Reviewer instructions:** the frozen vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, placeholders filled, plus focus
text in two parts — verify round 5's three findings are closed by the
**re-ruled** contract rather than re-worded, and attack the new ruling itself
(the relay's own trigger-2 addition first).
**Revision reviewed:** `3671ad7` on `wp/frontmatter-recognition-failopen`.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Committed BEFORE adjudication.** No finding below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the round-5 near-closer bypass is closed, immediate U+200B/U+2800 cases fail closed, P4 catches the prior over-broad classifier, and the four required classifier mutations exit non-zero. However, the reference classifier's undefined-in-spec 12-line region still lets a canonical security flag behind U+2800 reach the trusted class; Trigger 2 also excludes delimiter-free prose based solely on content; and P1-P4 do not enforce frozen recognition. Executed: captured initial and final `git status --porcelain=v1` (exit 0, empty and byte-identical), branch and HEAD remained `wp/frontmatter-recognition-failopen` at `3671ad716000e6356c90011b68df5142406be88f`; extracted and ran all seven Table B commands verbatim (each exit 0); extracted and ran the committed reference classifier (exit 0: 26/26 cases, 19 trusted-to-gated, 0 toward trust) and enforcing sweep (exit 0: correct green, all four built-in mutants RED); ran the four built-in mutant modes separately (each exit 0 because that meta-harness expects mutants to be RED), then mutated the classifier-under-test for missing-branch, leak, overbroad, and nonclass (each exit 1); ran focused U+200B, U+2800, line-13, near-closer, Trigger-2, recognition-equivalence, false-positive, shared-oracle, and property-gap probes (probe commands exit 0; the gap-mutant detector exited 1 as expected after both wrong mutants stayed green); reran the 48-file product-corpus measurement (exit 0: 0 newly fail-closed); protected-path V1 tests (exit 0: 251/251); `npm test` (exit 0: 2,015 tests, 2,006 passed, 9 skipped); `npm run lint` (exit 0, shellcheck and PSScriptAnalyzer skipped because their binaries are absent); and `git diff --stat -- tests/golden/` (exit 0, empty).",
  "findings": [
    {
      "severity": "high",
      "title": "The 12-line field window leaves a U+2800 provenance bypass",
      "body": "The spec says Trigger 2 closes the unbounded invisible-character space but never defines the extent of its \"leading region.\" The required committed reference classifier silently supplies a 12-line bound with `slice(0, ci + 12)`. An executed probe containing `U+2800 + ---` on line 1, eleven ordinary metadata lines, the exact canonical `derived_from_untrusted: true` on line 13, an exact closer, and body text classified as `no frontmatter`; today's real gate returned `exclusion=null` and `bodyInjected=true`. U+2800 prevents Trigger 1 from seeing a hyphen-only line, while the arbitrary window prevents Trigger 2 from seeing the flag. An implementation following the required reference therefore still admits the provenance-bearing note into digest and snapshot paths.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 171,
      "line_end": 193,
      "confidence": 0.99,
      "recommendation": "Define the leading region explicitly and remove the silent 12-line escape. Tie Trigger 2 to a structural delimiter candidate and inspect through its first exact closer; if a byte/line safety cap is reached before the candidate is resolved, classify it fail-closed. Add the exact U+2800 plus line-13 canonical-flag probe to the case corpus and protected consumer tests."
    },
    {
      "severity": "medium",
      "title": "Trigger 2 turns delimiter-free quoted prose into malformed frontmatter",
      "body": "Trigger 2 requires no delimiter evidence at all and permits arbitrary non-letter/non-number punctuation around the field name. Executed delimiter-free notes beginning with `> derived_from_untrusted: means the trust marker.`, `` `derived_from_untrusted`: means the trust marker. ``, and `- derived_from_untrusted: false is required.` all matched and classified FAIL-CLOSED. This makes a structural parser's decision depend solely on prose content, contrary to ADR-0022's strict-on-block-structure model. A user or attacker-influenced daily note that merely documents the field near its top can therefore lose its digest summary and snapshot presence. The measured zero false positives in 48 shipped files does not bound existing user vaults.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 187,
      "line_end": 196,
      "confidence": 0.98,
      "recommendation": "Do not let the field name alone create a delimiter attempt. Require an independent structural delimiter signal in the same candidate region, then use the normalized field match only as supporting evidence. Add delimiter-free blockquote, inline-code, and bullet examples that must remain in the no-frontmatter class."
    },
    {
      "severity": "medium",
      "title": "P1-P4 allow recognition to widen or disappear while staying green",
      "body": "P3 only forbids attempts from becoming `no frontmatter`; it permits them to become RECOGNIZED. P2 permits an input recognized today to become FAIL-CLOSED, and P4 excludes both recognized inputs and attempts from its conservation check. Executed mutants mapping every attempt to RECOGNIZED and mapping every recognized input to FAIL-CLOSED both passed all four properties with every counter at zero. P4 did correctly make the previous over-broad fail-closed mutant exit 1, and each of the four named classifier mutations also exited 1, but the properties still do not assert this ruling's central invariant that recognition is byte-for-byte unchanged. A selective recognition mutant outside the enumerated cases can therefore pass the advertised proof while reintroducing the unsafe closer/opener tolerance class.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 264,
      "line_end": 277,
      "confidence": 0.99,
      "recommendation": "Add an independently computed biconditional property: `class === RECOGNIZED` if and only if today's exact recognition predicate is true. Also require every non-recognized attempt to be exactly FAIL-CLOSED, not merely anything other than no-frontmatter. Add recognition-to-failclosed and attempt-to-recognized mutants, including selective variants outside the fixed case corpus."
    }
  ]
}
```
