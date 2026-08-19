---
date: 2026-08-18
title: "WP-frontmatter-recognition-failopen PR #11 — external PR-review gate, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# PR #11 — external PR-review gate (raw)

**Backend:** gptsol.
**Reviewer instructions:** the frozen vendored PR rubric
`docs/runbooks/review-prompts/pr-rubric.md`, reproduced verbatim, **with no
focus text** — the runbook's PR-review contract, unlike design review.
**Diff reviewed:** `4f0ad0d...48e7da7` limited to `src/` and `tests/` — two
files, 156 added lines.
**Read-only property:** verified byte-identical before and after, across both
gates running concurrently.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "findings": [
    {
      "title": "[P2] Make row 3 actually reach the failed read",
      "body": "Creating a directory named `2026-07-01.md` does not exercise this case: `newestDaily` accepts only entries for which `entry.isFile()` is true, so it returns no candidate and `readNoteBounded` is never called. This test therefore duplicates row 1 and would stay green if handling of an `absent` read regressed; use a real candidate and force its open to fail. The repository requires implementation against the work-package contract ([`CLAUDE.md` lines 13–17](/Users/felho/dev/repos-to-learn-from/wienerdog/CLAUDE.md#L13-L17)), whose AC1 requires every table row to be asserted ([spec lines 203–208](/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md#L203-L208)).",
      "confidence_score": 0.99,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js",
        "line_range": {
          "start": 1186,
          "end": 1189
        }
      }
    },
    {
      "title": "[P2] Exercise the full AC4 cap contract",
      "body": "This AC4 test samples two banner substrings, entry order, and `MAX_LINES`, but never creates line- or byte-cap pressure, checks `MAX_BYTES` or the truncation marker, or pins the banner template byte-for-byte. It can therefore pass while the new warning's displacement behavior or most of the declared template/cap contract drifts; add the separate line-cap and byte-cap assertions explicitly required by AC4 ([spec lines 220–223](/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md#L220-L223)), under the repository's spec-driven rule ([`CLAUDE.md` lines 13–17](/Users/felho/dev/repos-to-learn-from/wienerdog/CLAUDE.md#L13-L17)).",
      "confidence_score": 0.98,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js",
        "line_range": {
          "start": 1287,
          "end": 1293
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "The production change adds the intended two warning entries, but the added tests leave two explicit work-package acceptance requirements unsatisfied. `npm test` and `npm run lint` both exited 0; lint reported that shellcheck and PSScriptAnalyzer were unavailable, and repository status remained byte-identical.",
  "overall_confidence_score": 0.98
}
```
