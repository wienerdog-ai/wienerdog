---
date: 2026-08-19
title: "WP-validator-decided-bytes round 1 — adversarial design review, raw output"
related_wps: [WP-validator-decided-bytes]
---

# Round 1 — adversarial design review (raw)

**Backend:** gptsol (the runbook's preferred backend where available).
**Prompt:** the vendored `docs/runbooks/review-prompts/adversarial.md`, its
placeholders filled; nothing of ours in the prompt body — the focus text
carries it, per the contract in `docs/runbooks/codex-review.md`.
**Revision reviewed:** `8667b42`, branch `wp/validator-decided-bytes`.
**Scope instruction given:** review only
`docs/specs/WP-validator-decided-bytes.md`; read anything to check its claims;
attack the composition of C1/C2/C3, the redact re-decision, the abort, the
Table C vocabulary, the Tier-3 scope, and the acceptance/verification
machinery. Do NOT re-report the two owner-ruled residuals (the recognition
fail-open, the banner remedy) unless the disclosure itself is dishonest.
Classify every finding DESIGN-LEVEL or MECHANICAL **and** HEAVY or LIGHT,
because both classifications decide what happens next.
**Read-only property:** the reviewer captured `git status --porcelain` at both
ends and reports them byte-identical (both zero-byte). Verified independently
on the relay side: the tree was clean before the round and clean after.
**Tests:** the reviewer reports it RAN them — focused
`npm test -- --test-name-pattern "dream-validate|frontmatter"` (186 passed) and
two full `npm test` runs (2030 tests, 2021 passed, 0 failed, 9 skipped), plus
`npm run lint`. This is a verdict whose tests ran, not a reading.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.
Markdownlint is disabled below it so the bytes stay unedited — the same
device `docs/runbooks/review-prompts/adversarial.md` uses for vendored text
that may not be touched.

---

<!-- markdownlint-disable -->

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the abort can cause undecided Tier-3 bytes to be precommitted on the next run; C3 is not defined against Git's actual staged bytes; supported layout and LEARNINGS.md paths contradict C3's scope; and the redact re-decision lacks an atomic state transition. Commands executed through Bash, with invocation exit status: initial `git status --porcelain` [0]; target-spec `git show ... | nl -ba` [0]; revision/branch `git rev-parse` and `git branch --show-current` [0]; four `git show` slices of `validate.js` [0 each]; combined `git show` of `frontmatter.js` and `digest.js` [0]; two `git show` slices of `src/cli/dream.js` [0 each]; ADR/predecessor looped `git show` [0]; combined frontmatter/validator test `git show` [0]; package/test-inventory command [0]; `git show` of `secret-scan.js` [0]; validator-test coverage `grep` [0]; redact-test excerpt `git show` [0]; `tests/run.js` `git show` [0]; attempted `docs/adr/0022-frontmatter-parser.md` pipeline [0, but its inner `git show` emitted fatal because that path does not exist]; ADR-0020 excerpt command [0]; predecessor-charter excerpt command [0]; `validateAndCommit` call-site `git grep` [0]; ADR-0022 locator [0]; correct ADR-0022 `git show` [0]; Git-normalization `git grep` [0]; LEARNINGS-scope `git grep` [0]; abort-flow `git grep` [0]; abort/late-mutation test excerpts [0]; focused `npm test -- --test-name-pattern \"dream-validate|frontmatter\"` [0, 186 passed]; `npm run lint` [0, markdown/frontmatter checks passed, shellcheck and PSScriptAnalyzer skipped because their binaries were absent]; `/tmp` Git-normalization reproduction compound command [0, working bytes 74/hash c86cf2..., staged blob 73/hash 58b885...]; first full `npm test` [0]; `scanAndRedact` Node probe [0]; second full `npm test` with captured totals [0, 2030 tests, 2021 passed, 0 failed, 9 skipped]; skill-id `git grep` [0]; skill-schema/registry `git show` [0]; core-contract spec reread [0]; abort-test `git show` [0]; differential-test `git show` [0]; final `git status --porcelain` [0]. The initial and final status outputs were both zero-byte empty and therefore byte-identical.",
  "findings": [
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "The prescribed abort lets the next dream commit the undecided bytes without validation",
      "body": "Table B requires a `WienerdogError` when preserving a C3 violation fails. By then Step 3 has already run `git add -A`, so the offending bytes can remain both in the working tree and index. The existing abort tests explicitly assert that no commit/report is made and that the index entry is retained. The caller at `src/cli/dream.js:558-566` does not catch errors from `validateAndCommit`; its restore catches cover brain failure and scratch-integrity failure only. On the next eligible run, `precommitSessionEdits` runs at `dream.js:493` before the brain and validator, stages all dirty bytes, and commits them as session edits. Therefore malformed or otherwise undecided Tier-3 bytes retained by this abort can become HEAD on the next run without ever receiving an accepting decision. This defeats the package's claimed containment and leaves the vault/index partially processed, quarantine copies potentially created, no report, and no per-file outcome or watermark advance.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 190,
      "line_end": 191,
      "confidence": 0.99,
      "recommendation": "Specify a durable recovery protocol and expand the deliverables to include `src/cli/dream.js`. At minimum, record an external validation-aborted marker and refuse every later dream before `precommitSessionEdits` until the retained dirty bytes are resolved. Add an end-to-end test that forces C3 preservation failure, starts another dream, and proves the retained Tier-3 bytes cannot be precommitted."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "C3 equates working-tree decision bytes with Git blobs even though Git may transform them",
      "body": "`tier3Decision` reads working-tree bytes, while the commit receives the blob produced by `git add -A`. `.gitattributes`, `core.autocrlf`, and clean filters can transform those bytes. I reproduced this outside the repository with `*.md text eol=lf`: a parser-valid file with LF frontmatter and a CRLF body ending was 74 bytes in the working tree (SHA-256 `c86cf22d...`) but its staged blob was 73 bytes (SHA-256 `58b885db...`). Thus an unchanged accepted file cannot simultaneously satisfy C3's literal byte identity and AC5's requirement to commit exactly as today. An implementation comparing only working-tree snapshots can pass while committing different bytes; one comparing the actual blob will falsely classify an unchanged file as R2.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 143,
      "line_end": 153,
      "confidence": 0.99,
      "recommendation": "Define the authoritative decision input as the post-clean-filter Git blob, not the pre-filter working-tree buffer. Specify an index-binding algorithm that parses the exact candidate blob and commits that object ID, then add `.gitattributes` EOL-normalization and clean-filter tests. Alternatively, explicitly prohibit transformations and enforce that prohibition before validation."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "A supported reports layout can create a new Tier-3 file after the invariant check",
      "body": "Table B asserts that reports are Tier-1/2 and that C3 is scoped by `isTier3`, but `readVaultLayout` accepts any safe relative `reports_dir` without requiring it to be disjoint from `identity_dir` or `skills_dir`. For example, `reports_dir: 05-Skills/reports` makes the code-owned Step-4 report satisfy `isTier3`. The report is written after the location where the spec says the C3 check must land and is then swept into the commit by Step 5's `git add -A`. It has no Tier-3 provenance frontmatter and no accepting decision. Moving C3 after the report does not resolve the design: the normal floor would reject the report, and the resulting revert cannot be included in that same report without another defined pass. The universal C3 claim is therefore unsatisfiable for a configuration the product currently accepts.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 188,
      "line_end": 193,
      "confidence": 0.97,
      "recommendation": "Choose and specify one policy: enforce layout disjointness before the dream runs and add `src/core/layout.js` to the deliverables, or define a separate code-owned report decision and include report creation in the final index-bound validation pass. Add a test with `reports_dir` nested under each Tier-3 directory."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "The stated Tier-3 scope accidentally includes LEARNINGS.md, which never receives the decision Table B requires",
      "body": "`isTier3` returns true for every path below the skills directory, including `LEARNINGS.md`. However, Step 2 handles a learnings ledger before the `isTier3` branch and intentionally exempts it from the numeric floor under ADR-0020. Its acceptance comes from `ledgerViolation`, not the decision at `:195`, and its accepted bytes are not carried forward. This contradicts Table B's claims that every accepted Tier-3 path is read exactly once by `:195` and that every Tier-3 commit blob matches such an acceptance. A literal implementation will classify every valid ledger write as R3 and disable learning accumulation; an implicit ledger exemption leaves a security-bearing authorization file outside C3 while the spec and named residual deny that hole.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 186,
      "line_end": 192,
      "confidence": 0.99,
      "recommendation": "Add an explicit LEARNINGS.md row to Table B. Prefer generalizing C3 to every policy-gated path and make the ledger validator return the exact accepted ledger bytes, while preserving its exemption from the numeric floor. If ledgers are intentionally excluded, narrow C3 accordingly and disclose the remaining ledger TOCTOU exposure in the Security checklist."
    },
    {
      "severity": "high",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "Redaction re-decision is not defined as an atomic replacement of registration and gate bookkeeping",
      "body": "The redact arm can rewrite security metadata while leaving the Tier-3 floor valid. I executed `scanAndRedact` on `id: q7PmXz4KvR9tWc2LbN8dYfGh`; it returned `id: [REDACTED:high-entropy]` with redact severity. A new skill carrying that id and valid floor fields is first added to `newSkills` from the original decision, then redacted, re-decided successfully, and committed with a different id. Table B still says registration records the first decision's `id` and `created`, so the registry can immediately disagree with the committed skill and make every later revision or ledger write fail closed. The failure transition is also unspecified: the current arm adds `secretRedacted`, increments `secretRedactions`, and adds `redactedCreated` before the proposed re-decision point. If re-decision then fails, Table B merely says to revert with its own reason; it does not retract the redaction report/count, remove pending registration, decide retention of the original copy, or define the caller's `secretReverts`/transcript outcome. A path can consequently be reported and counted as both committed-redacted and reverted.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 186,
      "line_end": 193,
      "confidence": 0.98,
      "recommendation": "Define one authoritative per-path decision record containing accepted bytes and registration metadata. A successful re-decision must replace that record and recompute `id`/`created`; a failed re-decision must atomically remove pending registration and reconcile `secretRedacted`, `secretRedactions`, `redactedCreated`, quarantine ownership, report output, and transcript disposition. Add tests for a redacted `id` and for a re-decision failure after the scrub has completed."
    },
    {
      "severity": "medium",
      "classification": "DESIGN-LEVEL",
      "weight": "HEAVY",
      "title": "R1 and R3 make false claims on reachable paths",
      "body": "R1 is emitted from the ledger-parent check while the reverted/report path is `LEARNINGS.md`, even though the malformed bytes are in the sibling `SKILL.md`; the report therefore points at the wrong file. At the skill revision guard, the same R1 also hides whether committed HEAD or the proposed revision is malformed, although their remedies differ. R3 is assigned to every path with no accepting decision but says the path appeared after the change scan. A path can be present in the initial scan, rejected and reverted by the freeze or revision guard, and then be recreated by a concurrent save before C3; it has no acceptance but did not appear after the scan. These fixed reasons would obscure the actual recovery action precisely on race/failure paths.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 195,
      "line_end": 210,
      "confidence": 0.98,
      "recommendation": "Revise Table C to use truthful, site-aware code-owned reasons: distinguish malformed current bytes, malformed committed HEAD, and malformed parent `SKILL.md`, and make the no-acceptance reason say only that the path was never accepted unless post-scan appearance is independently proven."
    },
    {
      "severity": "medium",
      "classification": "MECHANICAL",
      "weight": "LIGHT",
      "title": "AC4 requires the opposite final outcome from AC5, and the C2 grep cannot resolve it",
      "body": "AC4 says that replacing an accepted new skill between decision and registration changes neither the registry entry nor the commit, which implies the original accepted skill remains committed and registered. Table B and AC5 require that exact changed-after-acceptance shape to be preserved, reverted with R2, omitted from the commit, and omitted from the registry. No implementation can satisfy both outcomes for the stated timing. The C2 shell assertion is also only `grep` against the exact old expression `parseFrontmatter(fs.readFileSync`; a second read through a variable, helper, Buffer read, or differently formatted call passes it. The acceptance machinery can therefore reject a correct C3 implementation while allowing a syntactically disguised C2 violation.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-validator-decided-bytes.md",
      "line_start": 288,
      "line_end": 299,
      "confidence": 0.99,
      "recommendation": "Rewrite AC4 as two non-conflicting cases: an unchanged accepted draft is registered from the final accepted bytes, while a replacement receives R2 and no registry entry. Replace the source grep with a runtime read-count seam for the exact path and assert the final committed blob and registry metadata against the authoritative decision record."
    }
  ]
}
```
