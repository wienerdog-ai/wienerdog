---
date: 2026-08-16
title: "WP-frontmatter-recognition-failopen round 1 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 1 — adversarial design review (raw)

**Backend:** gptsol (the runbook's preferred backend where available).
**Reviewer instructions:** the frozen vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, placeholders filled, plus focus
text naming the eight files in scope and the seven decisions to challenge.
**Revision reviewed:** `4c5cb1d` on `wp/frontmatter-recognition-failopen`.
**Read-only property:** verified mechanically — `git status --porcelain` was
empty before and after and byte-identical (the reviewer independently reports
the same, with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
the well-known digest of the empty input).
**Committed BEFORE adjudication.** No finding below was judged, paraphrased,
softened or acted on before this file's commit existed.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the design leaves an attacker-selectable one-character bypass, newly admits malformed Tier-3 frontmatter, and does not account for tolerated-shape migration false positives. The proposed uniqueness sentinel is also bypassed by ordinary JavaScript syntax. Executed on branch wp/frontmatter-recognition-failopen at 4c5cb1d860a2a3435dc3a96695fecce83fa6e5d5: checkout/status verification (exit 0); `grep -rn \"'---'\" src/core/` (exit 0, two matches); a double-quoted lexer probe against that sentinel (`grep` exit 1, demonstrating the miss); Node parser/consumer matrices, CRLF heading-regex probe, daily-summary render probe, malformed-floor probe, and thematic-break reinterpretation probe (all exit 0); scoped bytewise corpus scan (exit 0: 455 files, zero hits, so the stated 453-file count was not reproduced); V2 `node --test` command (exit 0: 251 passed); `npm test` (exit 0: 2015 total, 2006 passed, 9 skipped); `npm run lint` (exit 0, but shellcheck and PSScriptAnalyzer were unavailable and skipped); `git diff --stat -- tests/golden/` (exit 0, no output). All other read-only grep/find/git inspection commands exited 0. Final `git status --porcelain` remained empty and its SHA-256 remained e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855, byte-identical to the initial status.",
  "findings": [
    {
      "severity": "high",
      "title": "R1 preserves a cheaper bypass than either shape this work package closes",
      "body": "A4/A5/A6 are selectable output formatting, not environmental encoding artifacts: a writer need only place one blank, space, or tab before the delimiter. The repository's dream-writing instructions require the model itself to emit the provenance block and to set `derived_from_untrusted` from tool-result provenance, so the same untrusted material that necessitates the flag can influence that model-authored formatting. The executed parser matrix confirmed that all three shapes return `delimited:false`, hide the explicit true flag, and produce `exclusion:null` at the digest gate. The digest and snapshot therefore continue admitting bytes that the writer explicitly marked untrusted, while the revision raise-only guard still loses HEAD's true value. Closing BOM and CRLF does improve accidental editor compatibility, but it does not close the adversarial recognition failure: an attacker or compromised writer moves one keystroke sideways.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 196,
      "line_end": 209,
      "confidence": 0.99,
      "recommendation": "Do not accept A4/A5/A6 as unconditional no-frontmatter cases. Define a narrow fail-closed near-opener rule: when one of these shapes is followed by a closing delimiter and a candidate block containing `derived_from_untrusted` or another provenance field, classify it as malformed or parse it for gating. Leave unrelated thematic-break Markdown alone. Add red/green coverage for that rule at the parser, digest, snapshot, and revision-guard paths."
    },
    {
      "severity": "high",
      "title": "Widening recognition newly lets malformed BOM/CRLF Tier-3 blocks pass the floor",
      "body": "`parseFrontmatter` discards neither `fm.malformed` nor the fields collected before the malformed line; it simply iterates `fm.fields`. A direct probe with an exact-LF block containing all passing floor values plus a junk line produced `parse.malformed === true`, a complete validator record, and a passing Tier-3 decision. AC1 requires tolerated BOM/CRLF blocks to produce the same fields and malformed value as that baseline. Consequently, a malformed A2/A3 Tier-3 write that is rejected today as missing frontmatter will be accepted after widening whenever its recognized fields meet the numeric floor. The same omission weakens preservation and revision checks because malformed or duplicate lines can disappear from the validator's object view. This contradicts the claimed unchanged malformed semantics and the ADR's fail-closed block-structure rule, so the declared no-consumer-change boundary is incomplete.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js",
      "line_start": 161,
      "line_end": 178,
      "confidence": 0.99,
      "recommendation": "Add `src/core/dream/validate.js` to the deliverables and make its shared frontmatter view fail closed when `parse()` reports `malformed`—for example, return an empty record before exposing any fields, preserving the existing missing-frontmatter reason. Add A2/A3 tests with otherwise passing floor values plus junk, indentation, and duplicate keys, and assert rejection at the Tier-3, registry/preservation, and raise-only paths."
    },
    {
      "severity": "high",
      "title": "BOM and CRLF do not remove the thematic-break interpretation claimed by Table A",
      "body": "The assertion that A2/A3 have no competing Markdown reading is false: `---` is a thematic break whether the file starts with a UTF-8 BOM or uses CRLF. Under the specified widened contract, an existing Windows note shaped as `---\\r\\nordinary prose\\r\\n---\\r\\nrest` changes from no frontmatter to a malformed block and is visibly excluded by the digest or snapshot. A probe implementing the exact disposition demonstrated that reinterpretation; a comment/heading-only region can instead be silently removed from the parsed body. This is precisely the innocent-note collision used to decline A4. The shipped-repository scan does not discharge the user-vault migration: the scoped rerun found zero hits but counted 455 files on the reviewed HEAD, not the claimed 453, and says nothing about pre-existing user vaults.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 182,
      "line_end": 189,
      "confidence": 0.97,
      "recommendation": "Correct Table A's rationale and explicitly rule on first-line thematic-break false positives. Before widening existing user content, either require a provenance-shaped candidate block, provide a pre-upgrade vault scan with a visible warning for files whose interpretation will change, or explicitly accept and test the resulting exclusions. Re-run the corpus measurement on the frozen target and record its reproducible scope and count."
    },
    {
      "severity": "medium",
      "title": "The replacement one-lexer sentinel is quote-style dependent, not shape-independent",
      "body": "V1 searches only the exact single-quoted token `'---'`. A second lexer using `\"---\"`, a template literal, or `/^---$/` does not trip it. The executed double-quoted probe returned grep exit 1. Because the ADR's security invariant is that no second frontmatter lexer exists, this sentinel can report success after an ordinary formatting choice introduces exactly the duplication it claims to prevent.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 144,
      "line_end": 158,
      "confidence": 1,
      "recommendation": "Replace the literal grep with a CI-enforced, quote-independent source check that rejects delimiter recognition outside `src/core/frontmatter.js`, covering string literals, template literals, and delimiter regexes. Include positive controls showing that representative duplicate lexers make the check fail."
    }
  ]
}
```
