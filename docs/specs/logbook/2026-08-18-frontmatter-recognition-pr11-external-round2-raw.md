---
date: 2026-08-18
title: "WP-frontmatter-recognition-failopen PR #11 round 2 — external PR-review gate, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# PR #11 round 2 — external PR-review gate (raw)

**Backend:** gptsol.
**Reviewer instructions:** the frozen vendored PR rubric verbatim, **with no
focus text and no list of prior findings**. The runbook attaches the
"list the prior findings on round ≥ 2" clause to *design* review input; the
PR-review input is the diff alone. This round therefore re-reviewed the whole
diff fresh rather than checking a list.
**Diff reviewed:** `4f0ad0d...0526e1f`, `src/` and `tests/` — 209 insertions,
2 deletions.
**Read-only property:** verified byte-identical, across both round-2 gates
running concurrently.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "findings": [
    {
      "title": "[P1] Skip the unreadable-file case on Windows",
      "body": "On Windows, `process.getuid` is absent, so this condition does not skip the test, while `chmodSync(..., 0o000)` only makes the file read-only rather than unreadable. `readNoteBounded` therefore opens the note, `renderDigest` emits its summary, and the following assertion fails on a supported platform; include `process.platform === 'win32'` in the skip condition, as the repository's other permission-enforcement tests do.",
      "confidence_score": 0.99,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js",
        "line_range": {
          "start": 1202,
          "end": 1202
        }
      }
    },
    {
      "title": "[P2] Drive the byte-cap assertion past MAX_BYTES",
      "body": "These 400 short lines total only about 6.7 KiB, and the line cap reduces them further before the byte-cap assertion runs, leaving the result well below `MAX_BYTES` (32 KiB). Replacing `bodyByteBudget` with `Number.MAX_SAFE_INTEGER` still leaves this test green, so it does not exercise the byte-cap path required by the spec-driven AC4 contract (`/Users/felho/dev/repos-to-learn-from/wienerdog/CLAUDE.md:13-17`; `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md:226-229`); use content that exceeds 32 KiB without first being reduced below it by the line cap.",
      "confidence_score": 0.99,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js",
        "line_range": {
          "start": 1327,
          "end": 1329
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "The production change implements the intended daily-note warning, but the added suite fails on supported Windows systems and does not actually verify the required byte-cap path. Locally, `npm test` exited 0 and `npm run lint` exited 0; the repository status remained byte-identical.",
  "overall_confidence_score": 0.99
}
```
