---
date: 2026-08-19
title: "WP-validator-decided-bytes round 4 — adversarial design review, raw output"
related_wps: [WP-validator-decided-bytes]
---

# Round 4 — adversarial design review (raw)

**Backend:** gptsol.
**Prompt:** the vendored `docs/runbooks/review-prompts/adversarial.md`.
**Revision reviewed:** `0f32c13` — the pure-C1 package.
**This is the last round** under the hard cap of four.
**Scope instruction given:** C1's coherence and the charter's accuracy only.
The criterion was pinned in the round record BEFORE this round ran: a charter
finding is LIGHT **by construction** (its severity belongs in `severity`, not
in `weight`), the surface freeze holds at two verification steps, and a HEAVY
on C1 goes to the owner as a ruling rather than to a round 5.
**Read-only property:** verified mechanically on both sides — three
`git status --porcelain=v1` captures, all empty and byte-identical, `cmp`
exit 0. Confirmed independently on the relay side.
**Tests:** RAN — `npm test` (2030 tests, 2021 passed, 0 failed, 9 skipped),
the focused pattern (186 passed), `npm run lint`.

Everything below the line is the reviewer's final message, verbatim.
Markdownlint is disabled below it so the bytes stay unedited — the same
device `docs/runbooks/review-prompts/adversarial.md` uses for vendored text
that may not be touched.

---

<!-- markdownlint-disable -->

```json
{
  "verdict": "needs-attention",
  "round3_disposition_check": [
    {
      "finding": "C2 does not establish a valid ownership record",
      "status": "VERIFIED-DISPOSED",
      "evidence": "`git diff 5c826a9 0f32c13 -- docs/specs/WP-validator-decided-bytes.md` confirms that operative C2, Table B, old AC4, and the registration guarantee were deleted. Searches found C2 and byte-reuse wording only as historical charter or Out-of-scope evidence, not as a shipped promise. The spec explicitly says the `:1170` reread stays at lines 84-87 and 182, while Out of scope at lines 338-343 forbids removing or altering it. Inspection of `validate.js:1170` confirmed that the reread remains."
    },
    {
      "finding": "the charter's hexadecimal-only boundary is false",
      "status": "RE-WORDED-ONLY",
      "evidence": "The hexadecimal-only boundary is gone, and executed probes verified the replacement's measured examples: `10293847561029384756E+12` is redacted at 3.522055 bits/character while `102938475610293847561E12` remains clean at 3.386842 bits/character; upper- and lower-case 24-character hexadecimal examples are redacted. However, lines 406-437 introduce new universals: `no syntactic class is uniformly redacted or uniformly clean`, `any class-based characterization ... [is] unsound`, and `the per-literal predicate is the only sound statement`. Those claims contradict the immediately following proven classes. Executed valid binary and octal literal probes remained clean, and the 23-character hexadecimal example remained clean because it was below the scanner's length threshold."
    },
    {
      "finding": "AC4 forbids reads that Table B explicitly preserves",
      "status": "VERIFIED-DISPOSED",
      "evidence": "The old C2 AC4 was deleted. A mechanical extraction found the current criteria sequentially numbered AC1 through AC7 with no dangling Table B, AC8, or old no-post-decision-read reference. Current AC4 is the malformed digest/validator parity criterion. Inspection confirmed `quarantinePreserve` still reads at `validate.js:679`, but no surviving acceptance criterion conflicts with that read."
    }
  ],
  "summary": "NO-SHIP: C1's placement is coherent and the five guarded parse inputs cover the validator's security-bearing frontmatter decisions, but AC2 specifies an impossible floor-passing fixture and therefore fails to pin the exact regression C1 is meant to prevent. The charter also replaced its old false boundary with a new false universal, classified LIGHT by instruction. Executed at revision `0f32c13` on `wp/validator-decided-bytes`: start/end/end2 `git status --porcelain=v1` captures, Python SHA-256 checks, and `cmp` all exited 0; every capture was empty, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, and byte-identical. `git rev-parse`, `branch --show-current`, `git show` inspections of the spec, validator, parser, scanner, tests, ADR-0031, registry, predecessor, and round logbooks; `git diff`, `git log`, `git ls-tree`, and the successful grep/Python call-site, field-access, criterion, mirror, and deleted-contract sweeps exited 0. One initially malformed shell-quoted field-access grep failed before producing evidence and was replaced by the successful `git show` plus Python enumeration; one wildcard ADR lookup found no match and was replaced by successful `git ls-tree` and `git show` commands. All Node probes exited 0: the Context fixture and all three malformed grammar classes; AC2's literal floor calculation; forbidden empty-view and corrected regression mutants; existing malformed-side outcomes; Tier-3 early-rejection paths; digest malformed classification; scanner entropy, hexadecimal, scientific, binary, octal, short-length, and plain-English-id boundaries; malformed-key and confidence/recurrence redaction unit and end-to-end commits; absent-metadata registration; registration ENOENT; redacted-id divergence; late-arriving Tier-3 commit; inter-decision authorization swap; and direct-validator repeated-run behavior. The first authorization-swap seam exited 0 but did not trigger at the intended point; the corrected `fs.readFileSync` seam exited 0 and reproduced `reads:2`, `reverted:[]`, committed `id: bar`, registry `id: foo`. `npm test -- --test-name-pattern \"dream-validate|frontmatter\"` exited 0 with 186 passed; `npm test` exited 0 with 2,030 tests, 2,021 passed, 0 failed, 9 skipped; `npm run lint` exited 0 with markdown and frontmatter checks green, while shellcheck and PSScriptAnalyzer were explicitly skipped because their binaries were unavailable. Nothing inside the repository was created, modified, or deleted; scratch mutants and extracted source lived under `/tmp`.",
  "findings": [
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "AC2's floor-passing regression fixture cannot exist as written",
      "body": "AC2 requires a floor-passing revision that omits `id`, `origin`, `created`, and `derived_from_untrusted`, but the floor at `validate.js:196-206` requires `derived_from_untrusted` to be present and exactly `false`. An executed probe of the stated field set reported `currentOmitsAllFour:true` and `floorPasses:false`. Consequently, a literal AC2 test is rejected for missing provenance independently of C1 and can stay green under the forbidden empty-record design. An executed empty-view mutant confirmed that the closest literal fixture was reverted by an unrelated authorization reason, not by a malformed guard. A corrected state is demonstrably discriminating: a clean revision omitting only `id`, `origin`, and `created`, carrying `derived_from_untrusted:false`, floor-passing numbers, and a qualifying `revision_pattern_key` was committed by the empty-view mutant against malformed HEAD and a registry entry without `id`. C1's decision-level guard would reject that same malformed HEAD with R1. As written, the central anti-regression criterion is contradictory and permits an implementation to miss the absence-as-agreement defect while claiming AC2 coverage.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 285,
      "line_end": 288,
      "confidence": 1.0,
      "recommendation": "Fix AC2 inside the existing acceptance-test surface: require the revision to omit `id`, `origin`, and `created` but explicitly carry `derived_from_untrusted: false`, `confidence: 0.9`, and `recurrence: 3`. Pin a qualifying committed learning and `revision_pattern_key` so no unrelated authorization branch rejects it. Require the test to demonstrate that the forbidden empty-record mutant admits the revision while the C1 implementation rejects it with R1."
    },
    {
      "severity": "low",
      "classification": "DESIGN-LEVEL",
      "weight": "LIGHT",
      "title": "The charter replaces the hexadecimal boundary with an equally universal anti-boundary",
      "body": "The measured evidence is accurate, but the conclusion is not. Lines 406-437 say no syntactic class is uniformly redacted or clean, any class-based characterization is unsound, and only a per-literal statement can be sound. The same section then proves uniformly clean constrained classes: ordinary digit runs cannot reach the entropy floor, valid binary and octal literals have similarly bounded alphabets, and candidates shorter than 24 characters cannot be redacted by this pass. Executed probes confirmed valid long binary and octal literals remained clean and a 23-character hexadecimal literal remained clean. The real lesson is that the measured positive syntax classes are not exhaustive and broad syntax labels do not predict redaction without character-level constraints; it is not that no class can ever be characterized. Leaving the universal in the charter gives the successor contradictory guidance and repeats the exact boundary-making pattern this rewrite was meant to remove.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 406,
      "line_end": 437,
      "confidence": 0.99,
      "recommendation": "Delete the three universal formulations. State instead that the listed positive classes are evidence, not an inventory, and that a broad syntax label alone does not determine scanner behavior. Preserve explicitly proven constrained negative classes, and tell the successor to use the character-level predicate unless it supplies a proof for a narrower class."
    }
  ]
}
```
