---
date: 2026-08-16
title: "WP-frontmatter-recognition-failopen round 3 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 3 — adversarial design review (raw)

**Backend:** gptsol.
**Reviewer instructions:** the frozen vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, placeholders filled, plus focus
text in two parts — verify round 2's four findings are genuinely fixed rather
than re-worded, and attack the four mechanisms that did not exist in round 2.
**Revision reviewed:** `cb3bf02` on `wp/frontmatter-recognition-failopen`.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Disclosed non-execution:** the reviewer states `npm run lint` was NOT run.
Recorded here because a verdict is a reading to the extent its checks did not
execute, and the runbook requires that to be visible rather than assumed.
**Committed BEFORE adjudication.** No finding below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: Table A does not define an exhaustive, mutually exclusive byte-level partition, so an implementation can satisfy AC1–AC3 while leaving delimiter-like one-character bypasses trusted. Separately, A7 deliberately creates a new silent daily-summary omission despite ADR-0022 requiring anomalous malformed exclusions to be visible; an unordered successor does not protect users during the interim. Round-2 G3 is fixed: AC9 requires all four negative controls. The revised corpus measurements reproduced: 48 files, zero artifact-openers, zero delimiter-shaped openers without a later closer, and zero near-openers with a closer. All seven Table B reproduction commands executed with exit 0 and supported their stated current-state observations: B1 A1 excluded while A2/A4 injected; B2 A2 summary found while CRLF A3 was masked; B3 A2/A4 produced null gate input and the copied mapping; B4 A1 passed while A3 lacked fields; B5 fired for A1 but not A3; B6 showed one A1 evidence line and zero for A2; B7 exposed three fields and passed the floor despite parse.malformed=true. Additional seam probes exited 0 and confirmed trailing-space, four-hyphen, and blank-plus-BOM openers currently remain delimited=false, malformed=false with the flag invisible. The protected-path V2 command exited 0 with 251/251 tests passing. `npm test` exited 0 with 2015 tests: 2006 passed, 9 skipped, 0 failed. `npm run lint` was not run. Branch/HEAD remained wp/frontmatter-recognition-failopen at cb3bf0203030c5566b0373d6da4663c0eabee803. Initial and final `git status --porcelain` were both empty (0 bytes), hence byte-identical.",
  "findings": [
    {
      "severity": "high",
      "title": "Table A leaves the security boundary implementer-defined",
      "body": "The claim that every input falls into exactly one class is not implementable from this table. Neither `delimiter-shaped` nor `tolerated closer` has a byte-level definition or precedence rule. For example, an opener line `--- ` followed by an exact closer is not A1–A7; treating it as non-delimiter-shaped puts it in A8 and preserves the same explicit-flag bypass. The executed probe confirms that this form currently returns delimited=false, malformed=false with `derived_from_untrusted` invisible. A blank line followed by BOM+`---` also fits A2's wording (BOM immediately before `---`) and A4's wording (blank first line before `---`) but those rows demand opposite outcomes unless an unstated byte-zero precedence is invented. An all-blank input has no first non-blank line and therefore matches no row. AC2 tests only named A4–A7 forms and AC3 preserves whatever is assigned to A8, so a parser can pass the acceptance criteria while retaining a one-character digest, snapshot, and validator bypass.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 238,
      "line_end": 255,
      "confidence": 0.99,
      "recommendation": "Define the opener-candidate and tolerated-closer predicates byte-for-byte, including anchoring and precedence for combinations of BOM, blank lines, indentation, CRLF, and trailing delimiter whitespace. Explicitly classify empty/all-blank input and delimiter-like forms such as `--- ` and `----`. Add parser and protected-path tests proving every boundary and combination lands in exactly one class; delimiter-like forms not deliberately recognized should fail closed rather than fall through to A8."
    },
    {
      "severity": "high",
      "title": "A7 ships a new anomalous exclusion that users cannot observe",
      "body": "The spec knowingly activates A7 before its visibility fix. A legitimate daily note beginning with an exact `---` thematic break and containing no later tolerated closer is trusted today, so its later `## Summary` can be rendered; after A7 it becomes malformed and the daily path silently drops the summary because `renderDigest` discards `r.exclusion`. The 48-file zero count says nothing about existing user vaults, and no migration scan or warning protects them. This is not merely deferred polish: ADR-0022 requires malformed exclusions to be surfaced and states that an anomalous exclusion can never be silent. `WP-digest-exclusion-visibility` is neither implemented here nor a dependency, so users can upgrade into an indefinitely hidden session-context regression. The nine-deliverable sizing heuristic does not reduce that impact.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 473,
      "line_end": 480,
      "confidence": 1,
      "recommendation": "Do not activate A7 on the daily path before visibility exists. Either add `src/core/digest.js` and an actual render-level warning test to this package, or make the visibility package a completed prerequisite. If implementation must remain split, add an upgrade-time user-vault scan with a visible warning and defer A7 classification until that protection ships."
    }
  ]
}
```
