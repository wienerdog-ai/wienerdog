# PR gate — external second opinion, PR #9

WP: WP-snapshot-read-path-hardening
Gate: gptsol, the vendored PR rubric (`docs/runbooks/review-prompts/pr-rubric.md`),
no focus text — the runbook's PR-review input contract.
PR: felho/wienerdog#9, branch `wp/snapshot-read-path-hardening` @ `6e8e145`,
base `main` @ `79ba77f` (the reviewer confirmed the merge base itself).
Read-only check: `git status --porcelain` empty before and after, byte-identical
(the reviewer ran and reported both, twice).

Raw output, byte-unchanged inside the fence, committed **before its findings
were acted on**. Transport artifacts decoded and nothing else touched: the
notification channel delivered `&amp;&amp;` where the reviewer ran `&&`, and
`2&gt;&amp;1` where it ran `2>&1`.

Verdict: **patch is incorrect**, four findings — one P3 and three P2, all
test-coverage rather than code. Two of them (the `-file cap` substring and the
uncovered FIFO/`O_NONBLOCK` path) are the same defects the wd-reviewer gate
found independently; two are new. Note one line in `executed`: an early full
`npm test` run exited 1 while running concurrently with `npm run lint`, with the
failure detail truncated, and two later sequential runs exited 0. That is
followed up separately rather than assumed benign.

`````text
{
  "executed": [
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog status --porcelain (initial) — exit 0; stdout empty",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse --abbrev-ref HEAD && git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse HEAD && git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse origin/main && git -C /Users/felho/dev/repos-to-learn-from/wienerdog merge-base origin/main HEAD — exit 0; confirmed branch wp/snapshot-read-path-hardening, HEAD 6e8e145b60ba86a5119eaa939562d879f5957169, and base/merge-base 79ba77f37394d3157cef6beb7d844ca518b55c19",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --name-status origin/main...HEAD — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --stat origin/main...HEAD — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog ls-files '*AGENTS.md' '*AGENTS.override.md' 'CLAUDE.md' — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --no-ext-diff --unified=80 origin/main...HEAD -- src/core/vault-snapshot.js — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --no-ext-diff --text --unified=40 origin/main...HEAD -- tests/unit/vault-snapshot.test.js — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --check origin/main...HEAD — exit 0",
    "npm test -- --test-name-pattern \"vault-snapshot\" — exit 0; 132 tests passed, 0 failed",
    "npm test (first full run, concurrent with lint) — exit 1; displayed output was truncated before a failure detail",
    "npm run lint — exit 0; markdown and frontmatter checks passed, while unavailable shellcheck and PSScriptAnalyzer layers were skipped",
    "set -o pipefail; npm test 2>&1 | command grep -a -E -C 8 '(^✖|^not ok|ℹ fail|AssertionError|ERR_ASSERTION|test failed|FAIL)' — exit 0; underlying full suite reported 2014 tests, 2005 passed, 9 skipped, 0 failed",
    "npm test >/dev/null — exit 0; sequential full-suite confirmation",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --numstat origin/main...HEAD — exit 0",
    "command grep -a -n -E 'FIFO|mkfifo|O_NONBLOCK|read failure|file-count reason|source\\.includes' /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js — exit 0",
    "command grep -a -n -E 'fstatSync|closeSync.*throw|staged close|hooks\\.readSync|hooks\\.fstat' /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/broker-wiring.test.js — exit 0",
    "command grep -a -n -E 'symlinked source|source directory|07-Daily.*symlink|reports/dreams.*symlink|symlinkSync' /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/broker-wiring.test.js — exit 0",
    "node symlinked-source-directory behavior probe — exit 0; copied the file through the directory symlink with skipped=[] as designed",
    "node swapped-FIFO behavior probe — exit 0; returned the non-regular-file reason without blocking",
    "command grep -a -n -E 'MAX_FILE_BYTES|262144|per-file cap|total cap' /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/broker-wiring.test.js /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog status --porcelain (first final check) — exit 0; stdout empty",
    "node bounded-view backing-allocation probe — exit 0; a 262145-byte view retained a 4194304-byte backing store",
    "node file-count-vocabulary assertion probe — exit 0; source.includes('-file cap') remained true after replacing the file-count reason",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog status --porcelain (final) — exit 0; stdout empty and byte-identical to the initial status"
  ],
  "findings": [
    {
      "title": "[P2] Inspect the backing allocation, not only the Buffer view",
      "body": "If the reader allocates a source-sized Buffer, passes a `subarray(0, MAX_FILE_BYTES + 1)` to `readSync`, and copies the filled prefix before returning, this assertion still sees `bufferLength === MAX_FILE_BYTES + 1`; the executed probe showed a 262145-byte view retaining a 4194304-byte backing store. Both this test and the downstream-copy test would pass while source-proportional allocation—and therefore the resource-exhaustion defect—returns. Because `AGENTS.md:14-18` makes the WP spec controlling, record and assert the read Buffer's backing allocation (or intercept its allocation) as required by `docs/specs/WP-snapshot-read-path-hardening.md:392-404`.",
      "confidence_score": 0.99,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js",
        "line_range": {
          "start": 593,
          "end": 593
        }
      }
    },
    {
      "title": "[P2] Exercise descriptor closure after a read failure",
      "body": "This lifecycle test claims to include a read failure but creates only a successful copy, a gate skip, and a cap skip; the separate staged-read-failure test checks the reason and copy result but never checks `closes` or `leaked`. A regression that leaks the successfully opened descriptor only when `readSync` throws would therefore pass the suite. Because `AGENTS.md:14-18` makes the WP spec controlling, stage that failure while asserting one close per open and zero leaked descriptors as required by `docs/specs/WP-snapshot-read-path-hardening.md:405-409`.",
      "confidence_score": 0.99,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js",
        "line_range": {
          "start": 624,
          "end": 628
        }
      }
    },
    {
      "title": "[P2] Cover the nonblocking FIFO refusal path",
      "body": "The only post-`lstat` non-regular fixture swaps in a directory, so removing `O_NONBLOCK` would leave this test green even though opening a swapped-in FIFO can block the routine indefinitely before `fstat` runs. No FIFO is created elsewhere in either snapshot test file. Because `AGENTS.md:14-18` makes the WP spec controlling, exercise a POSIX FIFO with a bounded subprocess and verify the non-regular skip and non-hanging outcome required by `docs/specs/WP-snapshot-read-path-hardening.md:369-372`.",
      "confidence_score": 0.97,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js",
        "line_range": {
          "start": 531,
          "end": 534
        }
      }
    },
    {
      "title": "[P3] Match the dormant file-count literal exactly",
      "body": "Deleting or changing the `${MAX_FILES}` reason would not fail this assertion because the per-file-cap literal also contains `-file cap`; the executed mutation probe confirmed that `source.includes('-file cap')` remains true after replacing the file-count reason. This does not enforce the dormant vocabulary entry the test claims to preserve. Because `AGENTS.md:14-18` makes the WP spec controlling, match the full file-count reason form required by `docs/specs/WP-snapshot-read-path-hardening.md:380-386`.",
      "confidence_score": 1.0,
      "priority": 3,
      "code_location": {
        "absolute_file_path": "/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js",
        "line_range": {
          "start": 711,
          "end": 713
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "The production implementation behaved correctly in the exercised cases, and the focused suite plus two subsequent full-suite executions exited 0; one earlier concurrent full run exited 1 without retained failure detail. However, several newly added tests do not actually enforce explicit bounded-allocation, descriptor-lifecycle, FIFO, and reason-vocabulary acceptance contracts, so the patch does not yet satisfy its stated verification boundary.",
  "overall_confidence_score": 0.98
}
`````
