---
date: 2026-08-19
title: "WP-validator-decided-bytes round 3 — adversarial design review, raw output"
related_wps: [WP-validator-decided-bytes]
---

# Round 3 — adversarial design review (raw)

**Backend:** gptsol.
**Prompt:** the vendored `docs/runbooks/review-prompts/adversarial.md`.
**Revision reviewed:** `5c826a9`, branch `wp/validator-decided-bytes` — the
SPLIT package: C1 + C2 only, size S, C3′ chartered out.
**Scope instruction given:** two parts. Part 1 — verify round 2's dispositions,
which were disposed by the SPLIT rather than by patching, under an explicit
rule: *a defect disposed by chartering it out is only disposed if the spec no
longer claims to handle it AND the charter states it accurately enough that a
successor can act on it; an understated charter is worse than no charter.*
Part 2 — attack what remains, RUN the charter's two repros, and check whether
C2 is worth anything or is a no-op dressed as a contract. The reviewer was also
handed its own round-2 defect — a finding that rested on a value already `NaN`
before redaction — and told to hold itself to that standard.
**Read-only property:** verified mechanically on both sides — initial and final
`git status --porcelain=v1` both empty, SHA-256
`e3b0c44298fc1c149afbf4c8996fb934ca495991b7852b855…`, `cmp` exit 0. Confirmed
independently on the relay side.
**Tests:** RAN — `npm test` (2021 passed, 0 failed, 9 skipped), the focused
pattern (186 passed), `npm run lint`. Baseline runs: `5c826a9` changes only the
spec.

Everything below the line is the reviewer's final message, verbatim.
Markdownlint is disabled below it so the bytes stay unedited — the same
device `docs/runbooks/review-prompts/adversarial.md` uses for vendored text
that may not be touched.

---

<!-- markdownlint-disable -->

```json
{
  "verdict": "needs-attention",
  "round2_disposition_check": [
    {
      "finding": "F1",
      "status": "VERIFIED-DISPOSED",
      "evidence": "C3′ and its preserve-then-revert obligation are absent from the surviving contracts. The charter at lines 470-477 accurately retains both sides of the hazard: reverting after quarantinePreserve returns null can destroy the user's only copy, while aborting leaves dirty bytes exposed to the next precommit. Inspection of validate.js:670-704 confirmed preservation is best-effort and can return null. The charter requires a third design rather than presenting either unsafe branch as solved."
    },
    {
      "finding": "F2",
      "status": "VERIFIED-DISPOSED",
      "evidence": "A git-grep sweep found no surviving package promise that decided working-tree bytes equal a committed blob. The title, H1, C1/C2, Security checklist and acceptance criteria make no blob-identity claim. Blob wording occurs only in charter evidence and the explicit warning at lines 466-469 that filters and autocrlf make such an invariant false."
    },
    {
      "finding": "F5",
      "status": "NOT-DISPOSED",
      "evidence": "The spec correctly removes the redact exemption from this WP and charters both malformed-key and below-floor-value limbs, and both supplied probes plus end-to-end validateAndCommit probes reproduced committed invalid Tier-3 skills with reverted:[]. However, the charter understates limb B at lines 423-432 by saying only hexadecimal reaches it. I produced the finite, non-hex Number-parsable value 10293847561029384756E+12: it is 24 characters, has 3.522055 bits/character, passes the floor before scanning, is redacted as high-entropy, remains well formed, and fails the floor afterward. Under the stated disposition rule, an understated charter does not dispose the finding."
    },
    {
      "finding": "F6a",
      "status": "VERIFIED-DISPOSED",
      "evidence": "The surviving contracts expressly disclaim every commit-side invariant. The charter accurately states that a malformed 05-Skills/late/SKILL.md appearing during Step 4 is absent from Step 2's changedPaths snapshot and is nevertheless included by Step 5's git add -A. Direct inspection confirmed changedPaths runs at validate.js:1112 and unrestricted final staging at :1379."
    },
    {
      "finding": "C3′-binds-only-the-floor-read",
      "status": "VERIFIED-DISPOSED",
      "evidence": "C3′ is gone from the package. Charter hole 2 identifies the authorization gap between skillBodyViolation's current-file read and tier3Decision's later read and gives the required single-buffer direction. I ran an independent fs seam repro: the first read received a compliant foo promotion, the file was then replaced by floor-passing id:bar bytes, and the result was reads:2, reverted:[], committedIdBar:true, registryId:'foo'."
    },
    {
      "finding": "F6c",
      "status": "VERIFIED-DISPOSED",
      "evidence": "Lines 274-279 now justify the shared R1 precision cost without claiming malformed Tier-3 commits are impossible; they explicitly say round 2 proved the opposite. The two end-to-end redact probes independently confirmed that premise: one committed parse().malformed=true and the other committed a well-formed floor failure, both with reverted:[]."
    }
  ],
  "summary": "NO-SHIP: C1 is coherent, but C2 leaves ownership-record edge cases unspecified and the successor charter falsely limits its below-floor redaction limb to hexadecimal. Commands executed: initial status capture, shasum, rev-parse and branch-containment checks exited 0; all git status/log/show/diff/diff-tree/grep/ls-tree and find-based inspections exited 0 except one initial combined parser-call git-grep probe, which exited 1 and was rerun successfully as separate git-show/grep commands; the first wrong ADR-filename pipeline exited 0 with no output, after which ls-tree located and git-show read the correct ADR files. All Node probes exited 0: the three malformed grammar classes; both charter hole-1 unit repros; both hole-1 end-to-end commits; the hole-2 authorization swap; plain-decimal, binary, octal, hexadecimal and scientific-notation scanner boundaries; missing id/created registration; the AC2 baseline; direct-validator idempotence; and scratch-only in-memory C2 mutants for replacement, disappearance and path movement. The current-code path-movement probe caught the expected ENOENT internally and exited 0. `npm test -- --test-name-pattern \"dream-validate|frontmatter\"` exited 0 with 186 passed; `npm test` exited 0 with 2021 passed, 0 failed and 9 skipped; `npm run lint` exited 0, with markdown/frontmatter green and shellcheck/PSScriptAnalyzer explicitly skipped because their binaries were unavailable. The initial and final `git status --porcelain=v1` files were both empty with SHA-256 e3b0c44298fc1c149afbf4c8996fb934ca495991b7852b855; cmp exited 0, so repository status was byte-identical and the read-only run is valid.",
  "findings": [
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "C2 does not establish a valid ownership record",
      "body": "Byte reuse alone is insufficient for Table B's registry guarantee. First, the floor requires only confidence, recurrence and derived_from_untrusted; id and created may be absent. An executed current-code probe committed such a new skill and registered {id:'', created:'2026-08-19'}, so the synthesized created value was never present in the bytes the decision read. Second, removing the registration read also removes its ENOENT fail-stop. I compiled a scratch-only in-memory mutant implementing the prescribed carry-forward literally. When the accepted foo path disappeared after the floor, Step 5 committed only the report but Step 6 still registered foo. When it moved to bar, bar was committed unchecked while the registry recorded foo. Current code instead throws on the missing registration reread. The spec disclaims commit-byte identity but never names this new behavior, and a stale entry is material because the registry is the tamper-resistant write-origin marker used to authorize later revisions.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 163,
      "line_end": 173,
      "confidence": 0.99,
      "recommendation": "Complete Table B's registration contract. Define the captured-buffer behavior for absent or empty id/created, and require Step 6 to register an entry only when its original accepted rel is present as an added/modified path in the completed commit. Add acceptance cases for missing metadata, disappearance and movement after the floor. If those outcomes remain outside this WP, narrow C2's guarantee and add the stale-ownership-marker behavior to the charter explicitly."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "The charter's hexadecimal-only boundary is false",
      "body": "Lines 423-432 claim that only hexadecimal Number() forms can be redacted into a well-formed floor failure and that eight measured Number-parsable forms yielded exactly two hexadecimal cases. The scanner alphabet also admits decimal digits, E/e and '+'. The finite scientific-notation value 10293847561029384756E+12 is 24 characters at 3.522055 bits/character, Number() parses it to approximately 1.029e31, and scanAndRedact replaces it with [REDACTED:high-entropy]. Before scanning the block is well formed and floor-passing; afterward it remains well formed and fails the floor. The narrower proof that ordinary decimal digit runs cannot exceed log2(10) remains valid, but the surrounding universal is not. A successor guided by the stated boundary can test or constrain only radix-prefixed values and leave the same invalid-commit limb open for exponent notation.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 423,
      "line_end": 432,
      "confidence": 1.0,
      "recommendation": "Delete the hexadecimal-only universal and add the scientific-notation repro. Keep the digits-only decimal entropy proof explicitly scoped to ordinary decimal runs. Either characterize all intersections between Number()-accepted syntax and the scanner candidate grammar, or state only the measured classes without claiming exhaustiveness."
    },
    {
      "severity": "low",
      "classification": "MECHANICAL",
      "weight": "LIGHT",
      "title": "AC4 forbids reads that Table B explicitly preserves",
      "body": "Table B says C2 removes only the :1170 registration reread, but AC4 requires that no read of an accepted new-skill path happen after the Tier-3 decision. That is false on preserved EP2 paths: quarantinePreserve reads the path as a Buffer at validate.js:679 after the decision, and the end-to-end malformed-key repro exercised that read before scrubbing and committing the accepted draft. The criterion is therefore broader than C2 and conflicts with the preserved secret-gate behavior; an implementer could satisfy its literal wording only by changing out-of-scope code.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 303,
      "line_end": 307,
      "confidence": 0.99,
      "recommendation": "Restore the narrow wording: registration performs no content reread and derives id/created from the buffer returned by the Tier-3 decision. Do not assert that no later component reads the path."
    }
  ]
}
```
