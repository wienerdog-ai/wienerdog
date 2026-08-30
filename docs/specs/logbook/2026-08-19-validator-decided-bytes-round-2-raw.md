---
date: 2026-08-19
title: "WP-validator-decided-bytes round 2 — adversarial design review, raw output"
related_wps: [WP-validator-decided-bytes]
---

# Round 2 — adversarial design review (raw)

**Backend:** gptsol.
**Prompt:** the vendored `docs/runbooks/review-prompts/adversarial.md`.
**Revision reviewed:** `9925e2b`, branch `wp/validator-decided-bytes`.
**Scope instruction given:** two parts, per the runbook's round-≥2 rule.
Part 1 — verify each of round 1's ten dispositions is GENUINELY fixed, not
re-worded, with the explicit warning that a fix "by deletion" only counts if
the thing is gone AND its removal did not move the problem elsewhere. Part 2 —
attack the new mechanisms: C3′'s narrowed quantifier, the redact-arm
carve-out, the four named residuals, Table C's three literals, the discovered-
defect section and the charter, and the acceptance/verification machinery. The
two owner-ruled residuals stayed out of scope, as did the id divergence itself
(its DESCRIPTION was in scope). The reviewer was told that a round finding
nothing about the product is the expected way this loop ends and not to
manufacture findings to avoid it.
**Read-only property:** verified mechanically on both sides — three `cmp -s`
comparisons of `git status --porcelain=v1`, all zero-byte, SHA-256
`e3b0c44298fc1c149afbf4c8996fb934ca495991b7852b855…` (the empty-input digest).
Confirmed independently on the relay side: clean before, clean after.
**Tests:** RAN — `npm test` (2021 passed, 0 failed, 9 skipped), the focused
`dream-validate|frontmatter` pattern (186 passed), and `npm run lint`. These
are baseline runs: `9925e2b` changes only the spec, so there is no proposed
implementation to validate.

Everything below the line is the reviewer's final message, verbatim.
Markdownlint is disabled below it so the bytes stay unedited — the same
device `docs/runbooks/review-prompts/adversarial.md` uses for vendored text
that may not be touched.

---

<!-- markdownlint-disable -->

```json
{
  "verdict": "needs-attention",
  "round1_disposition_check": [
    {
      "finding": "F1",
      "status": "NOT-FIXED",
      "evidence": "The round-1 diff genuinely deletes the proposed C3 abort, but Table B lines 200-201 now require a revert even when quarantinePreserve returns null. Line 200 explicitly recognizes that the on-disk bytes may be the only copy of a user's mid-dream save; tracked reverts restore HEAD and untracked reverts remove the path. The suffix reports the preservation failure after those bytes have been destroyed. The next-run precommit exposure is gone only by moving the failure to immediate, irreversible data loss."
    },
    {
      "finding": "F2",
      "status": "NOT-FIXED",
      "evidence": "Table B line 197 honestly limits C3′ to pre-filter working-tree comparison and disclaims committed-blob identity, but the title and Security checklist lines 275-278 still say the bytes committed for an accepted path are the bytes acceptance read. A grep over the target spec found both the no-blob disclaimer and these blob-identity implications, so the canonical row and its mirror still contradict each other."
    },
    {
      "finding": "F3",
      "status": "VERIFIED-FIXED",
      "evidence": "Table B line 199 excludes the Step-4 report from C3′, and Security checklist lines 288-292 accurately disclose that a reports_dir nested beneath identity_dir or skills_dir creates an undecided Tier-3 report. src/core/layout.js lines 85-119 validate only safe relative paths and impose no directory-disjointness rule."
    },
    {
      "finding": "F4",
      "status": "VERIFIED-FIXED",
      "evidence": "Table B line 199 expressly excludes LEARNINGS.md because it is accepted through ledgerViolation rather than tier3Decision, and Security checklist lines 284-287 disclose its remaining ledgerViolation-to-commit mutation window. src/core/dream/validate.js lines 1121-1135 confirm that this path bypasses the Tier-3 floor."
    },
    {
      "finding": "F5",
      "status": "NOT-FIXED",
      "evidence": "The re-decision is genuinely deleted, but Table B line 198 replaces it with an unconditional exemption. Executed probes showed the existing redact arm changes a floor-passing Tier-3 block into both (a) malformed frontmatter via `[REDACTED:high-entropy]: harmless` and (b) a below-floor block via `confidence: [REDACTED:high-entropy]`; both were committed with reverted=[] and secretRedactions=2. The atomicity problem was moved into an unchecked rewrite rather than closed."
    },
    {
      "finding": "F6a",
      "status": "NOT-FIXED",
      "evidence": "R3 and its checking bucket are deleted, but Table B line 199 now places every Tier-3 path appearing after changedPaths outside C3′. A deterministic probe created a malformed `05-Skills/late/SKILL.md` during Step 4; Step 5 committed it, with reverted=[] and committed=true. The false R3 text is gone, but the underlying unchecked path moved outside the contract and is not named in the Security checklist."
    },
    {
      "finding": "F6b",
      "status": "VERIFIED-FIXED",
      "evidence": "Table A line 183 and Table C line 213 introduce the byte-exact R1L literal for ledgerViolation. src/core/dream/validate.js lines 491-501 confirm that this site parses sibling SKILL.md while its caller reverts LEARNINGS.md, so naming the parent SKILL.md is accurate."
    },
    {
      "finding": "F6c",
      "status": "NOT-FIXED",
      "evidence": "Security checklist lines 293-296 now disclose that R1 does not identify whether HEAD or the revision is malformed, but justify it by claiming the product can no longer create malformed Tier-3 commits. The executed redact-carve-out and late-path probes both produced malformed Tier-3 commits, so the residual's scope rationale is false."
    },
    {
      "finding": "F7a",
      "status": "VERIFIED-FIXED",
      "evidence": "AC4 lines 318-321 is now limited to byte reuse and absence of a later deciding read; it explicitly delegates replacement behavior to AC5. AC5 lines 322-328 requires changed bytes to be preserved and reverted, so the two criteria no longer demand opposite outcomes."
    },
    {
      "finding": "F7b",
      "status": "VERIFIED-FIXED",
      "evidence": "Verification lines 355-358 explicitly label the grep a tripwire rather than proof and defer the behavioral guarantee to AC4. On revision 9925e2b the tripwire failed with the expected existing registration expression at validate.js:1170, while the targeted baseline suite exited 0 with 186 passing tests."
    }
  ],
  "summary": "NO-SHIP: four heavy design defects remain. Commands executed, all read-only against revision 9925e2b unless noted: initial and final `git status --porcelain=v1` snapshots exited 0; three `cmp -s` comparisons exited 0 and all snapshots had SHA-256 e3b0c44298fc1c149afbf4c8996fb934ca495991b7852b855, confirming byte-identical clean status. `git rev-parse`, `git show -s`, numbered `git show` reads of the target spec, validator, parser, scanner, layout, CLI, tests, predecessor spec and ADRs, `git diff` for 9925e2b^..9925e2b and 29bb661..9925e2b, `git log`, `git ls-tree`, `wc`, `grep`, and `sed` inspection commands all exited 0; the first ADR filename probe found no matches but exited 0, and the corrected ls-tree probe located docs/adr/*. The preimplementation C2 tripwire's inner assertion exited 1 as expected because validate.js:1170 still contains the old read. Node probes for numeric entropy, frontmatter redaction, scanner triggers, redacted-id divergence, revision-check/floor-check replacement, and late Tier-3 creation all exited 0; they reproduced the failures reported below. The redacted-id probe reproduced registry/blob divergence and later revision and ledger reverts, confirming that section's pre-existing/fail-closed description. `npm test -- --test-name-pattern \"dream-validate|frontmatter\"` exited 0: 186 passed, 0 failed. `npm test` exited 0: 2021 passed, 0 failed, 9 skipped. `npm run lint` exited 0; markdownlint and frontmatter checks passed, while shellcheck and PSScriptAnalyzer were unavailable and explicitly skipped. These are baseline tests because revision 9925e2b changes only the design spec; no proposed implementation exists to validate.",
  "findings": [
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "A failed preservation now destroys the only copy of a user's bytes",
      "body": "C3′ requires quarantinePreserve followed by a revert, and line 201 requires that revert even when preservation fails. The adjacent rule already identifies the dangerous case: a user can save during validation and those working-tree bytes may exist nowhere else. For a tracked path the revert restores HEAD; for an untracked path it removes the file. Appending ` (quarantine copy failed)` reports irreversible loss but does not prevent it. This removes the old dirty-tree abort by choosing immediate data destruction, contradicting the stated requirement that reverting without preserving is forbidden.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 200,
      "line_end": 201,
      "confidence": 0.99,
      "recommendation": "Do not revert when no durable copy exists. Expand the design and deliverables to add a recovery state that blocks the next precommit from accepting the dirty bytes, or otherwise guarantee durable preservation before any checkout/removal. Specify and test tracked and untracked preservation-failure paths."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "The redact exemption permits malformed and below-floor Tier-3 commits",
      "body": "The secret gate rewrites arbitrary added lines, including frontmatter, but Table B exempts the rewritten path and forbids re-decision. Executed against current scanner/scrubber semantics, a valid Tier-3 skill containing a high-entropy frontmatter key became `[REDACTED:high-entropy]: harmless`, which parse reports as malformed, while a valid numeric value became `confidence: [REDACTED:high-entropy]`, which no longer meets the floor. Both paths were committed and neither was reverted. Thus the exemption directly violates ADR-0022's unconditional malformed exclusion and the Tier-3 floor; it also falsifies the Security checklist's claim that malformed blocks are refused.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 196,
      "line_end": 199,
      "confidence": 1.0,
      "recommendation": "Remove the exemption. Either run every scrubbed Tier-3 result through the Tier-3 and revision checks using the exact scrubbed bytes, with an atomic binding to staging, or route every Tier-3 redact-severity finding to the withhold arm so no Tier-3 rewrite can bypass the decisions."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "The narrowed accepting-decision set deliberately leaves late Tier-3 files unchecked",
      "body": "Table B excludes any Tier-3 path that appears after the one changedPaths scan, yet Step 5 still stages everything with `git add -A`. A deterministic probe created malformed `05-Skills/late/SKILL.md` during Step 4; it was committed with no revert because Step 2 never saw it. This is exactly an undecided, malformed standing-context file, so narrowing the quantifier moved the ordering hole rather than closing it. The problem is also under-disclosed: line 199 says every exception is covered by the Security checklist, but that checklist names LEARNINGS.md and nested reports, not late-arriving Tier-3 paths.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 196,
      "line_end": 201,
      "confidence": 1.0,
      "recommendation": "Before final staging, recompute the changed-path set or stage only an explicit approved-path set. Preserve, revert and report every newly appeared Tier-3 path, with behavior that remains accurate for paths created by concurrent user saves. Restore this case to Table B, the Security checklist and behavioral acceptance tests."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "C3′ binds the floor read but not the earlier skill-revision decisions",
      "body": "A tracked SKILL.md is read by skillBodyViolation before tier3Decision reads it again. C3′ records only the latter floor read, so bytes can change after immutable-field, raise-only and authorization checks but before the floor. An executed probe presented a compliant promotion to skillBodyViolation, replaced it with a floor-passing version whose id changed from `foo` to `bar`, and observed reverted=[], committed id `bar`, while the ownership registry remained `foo`. The proposed C3′ comparison would accept this result because the committed working-tree bytes equal the later floor read. Therefore the package still commits bytes that did not pass all security decisions, despite its decide-once claim.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 148,
      "line_end": 162,
      "confidence": 0.99,
      "recommendation": "Capture the current Tier-3 bytes once before any current-version security check and pass that same buffer to skillBodyViolation, tier3Decision, registration and the final comparison. Add a behavioral test that replaces a tracked skill between revision validation and the floor and asserts that immutable, raise-only and authorization violations cannot commit."
    },
    {
      "severity": "low",
      "classification": "MECHANICAL",
      "weight": "LIGHT",
      "title": "The no-blob disclaimer still conflicts with a registered Security mirror",
      "body": "Table B correctly says C3′ compares pre-filter working-tree bytes and makes no committed-blob claim. The Security checklist nevertheless states that `the bytes committed for a path this run accepted are the bytes that acceptance read`, and the title retains the same unqualified promise. Clean filters, attributes or autocrlf can make that statement false. This is the exact mirror drift ADR-0031's checklist is intended to prevent.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 274,
      "line_end": 283,
      "confidence": 0.98,
      "recommendation": "Rewrite every mirror, including the title and Security checklist, to say that the working-tree bytes immediately before staging equal the decision bytes, with no committed-blob identity claim."
    }
  ]
}
```
