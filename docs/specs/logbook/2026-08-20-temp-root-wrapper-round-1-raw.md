# WP-temp-root-wrapper — round 1 external adversarial review, raw output

Backend: gptsol (codex/gpt-5.6-sol) · vendored prompt: `docs/runbooks/review-prompts/adversarial.md` ·
Reviewed at spec commit `5eaa897` · 2026-08-20 · relayed verbatim below, unedited.
Read-only check: `git status --porcelain` byte-identical before and after the run (empty both times).

## Findings JSON (verbatim)

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship this spec yet. A conforming synchronous wrapper can leak its entire run root when the wrapper itself is interrupted, the symlink rule does not close a path-swap escape, and the verification block can miss environment preservation, argument forwarding, and earlier command failures.",
  "findings": [
    {
      "file": "docs/specs/WP-temp-root-wrapper.md",
      "line_start": 259,
      "line_end": 271,
      "confidence": 0.99,
      "what_can_go_wrong": "SIGINT, SIGTERM, or CI cancellation delivered to the wrapper while it is blocked in spawnSync terminates the wrapper without running its finally block. The run root survives, and the child can continue after the wrapper has exited.",
      "why_vulnerable": "The contract guarantees teardown only after spawnSync returns and does not define handling for signals delivered to the wrapper itself. A local probe of the specified synchronous shape produced wrapper_signal=SIGTERM, finally_ran=false, root_survived=true, and child_finished_after_wrapper_exit=true. This also contradicts the stated invariant that nothing outlives the wrapper.",
      "likely_impact": "The common developer action of interrupting a long test run recreates the unbounded temp-directory leak this WP exists to eliminate. Cancellation can also leave test or scenario descendants running after the invoking process is gone.",
      "recommendation": "Make wrapper interruption part of Table A. Use an asynchronous child lifecycle that can receive wrapper signals, forward termination to the child or process group, wait for shutdown, perform teardown, and then preserve the interruption outcome. Add a verification that signals the wrapper while its child is running and asserts that the child stops and the run root disappears."
    },
    {
      "file": "docs/specs/WP-temp-root-wrapper.md",
      "line_start": 260,
      "line_end": 265,
      "confidence": 0.86,
      "what_can_go_wrong": "A still-running descendant can replace a directory with a symlink between the required lstat and chmod operations, causing chmod to follow the replacement symlink and change permissions outside the run root.",
      "why_vulnerable": "The rule prevents following a path that is already a symlink when lstat runs, but a path-based lstat-then-chmod sequence is a time-of-check/time-of-use race. The spec itself acknowledges that a test may leave a still-running process, so assuming the tree is immutable during teardown is not justified. The fresh root prevents pre-existing entries but does not prevent a child-created symlink from targeting a pre-existing external path.",
      "likely_impact": "A buggy or hostile test descendant could modify permissions on user-owned files or directories outside the isolated temp root, violating the security checklist's absolute no-escape claim.",
      "recommendation": "Replace the path-based no-follow claim with a race-safe contract: prevent surviving writers before traversal and use descriptor-based directory opening and chmod with no-follow semantics where supported. If that cannot be implemented portably in the allowed scope, explicitly narrow the security claim and obtain an owner decision rather than claiming lstat alone closes the escape."
    },
    {
      "file": "docs/specs/WP-temp-root-wrapper.md",
      "line_start": 256,
      "line_end": 258,
      "confidence": 0.98,
      "what_can_go_wrong": "A wrapper that deletes WIENERDOG_RUN_SCENARIOS or WIENERDOG_TEST_NO_REAL_SCHEDULER from an environment where the caller supplied them can pass the specified safe verification. In particular, deleting WIENERDOG_RUN_SCENARIOS makes the manual scenario workflow print its skip message and exit 0 instead of running.",
      "why_vulnerable": "Table A requires the rest of process.env to pass through unchanged, but verification step 8 tests only the caller-unset case. Step 5 also runs with WIENERDOG_RUN_SCENARIOS unset. No verification command proves that caller-supplied values survive the wrapper.",
      "likely_impact": "The quota-spending scenario gate can become a silent false green: CI or a maintainer asks for live scenarios, but all scenarios are skipped successfully. Loss of the scheduler guard can likewise expose direct children that depend on caller-provided protection.",
      "recommendation": "Extend the synthetic environment verification with a second invocation that supplies distinct non-empty values for both variables and asserts that the child receives those exact values unchanged. Keep this separate from any live scenario invocation."
    },
    {
      "file": "docs/specs/WP-temp-root-wrapper.md",
      "line_start": 458,
      "line_end": 460,
      "confidence": 0.96,
      "what_can_go_wrong": "A wrapper that drops every argument after the script path can still make both argument-forwarding commands exit successfully.",
      "why_vulnerable": "Both commands run a suite that is expected to be green even when the requested path or name pattern never reaches tests/run.js. The spec explicitly warns that the name pattern does not scope the run, but step 4 asserts no output marker, selected-test side effect, or received argv. Therefore successful exit does not discriminate correct forwarding from dropped arguments.",
      "likely_impact": "npm test -- <file> and npm test -- --test-name-pattern <pattern> can silently stop honoring developer input while the declared verification remains green.",
      "recommendation": "Use a canary whose observable result depends on the forwarded argument. For example, capture output and assert a unique selected test marker, and add a synthetic child that prints JSON.stringify(process.argv.slice(2)) so exact ordering and byte-preserving forwarding are mechanically checked."
    },
    {
      "file": "docs/specs/WP-temp-root-wrapper.md",
      "line_start": 421,
      "line_end": 537,
      "confidence": 0.98,
      "what_can_go_wrong": "Failures in npm test, the forwarding checks, assertions, or lint can be masked because the required one-session shell block continues and ends with a successful cleanup command.",
      "why_vulnerable": "The block does not enable fail-fast behavior and many commands lack explicit || exit handling. A shell probe confirmed that an intermediate false followed by true returns success. Step 12's final rm -rf can therefore make the aggregate block exit 0 even when an earlier command was red.",
      "likely_impact": "A broken implementation can be reported as having passed the prescribed verification, especially when only the block's final status is recorded by automation or copied into PR evidence.",
      "recommendation": "Make the verification fail closed. Enable set -e at the start, place cleanup in an EXIT trap, and explicitly capture only the child exits that are expected to be non-zero before re-enabling fail-fast behavior. Alternatively, add || exit 1 to every ordinary command and assertion and preserve a cumulative failure status through cleanup."
    }
  ]
}
```

## Execution report (verbatim)

- Verified `HEAD` before review with `git rev-parse HEAD`: `5eaa89759d5643502110ac3d2bbef8aecf777081`.
- Initial `git status --porcelain=v1` output: empty.
- Verified `HEAD` again after review: unchanged. Final status output: empty; before/after byte-identical. No file modified.
- Files read: the vendored prompt, the spec, the round record, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/scenarios.yml`, relevant sections of the two scenario entry files.
- Read-only commands: `git rev-parse` / `git status` checks; `rg` searches in the permitted scope; `git log`/`git show` on the spec; a temporary `node -e` probe reproducing termination of a synchronous wrapper during `spawnSync` (result: `{"wrapper_exit_code":null,"wrapper_signal":"SIGTERM","finally_ran":false,"root_survived":true,"child_finished_after_wrapper_exit":true}`; its temp directory removed, verified gone); `sh -c 'false; true'` exit-masking probe. One proposed npm comment-key probe was rejected by the worktree-isolation guard before execution; no changes, no evidence from it.
- Test suite: NOT run — no suite exit status exists. `WIENERDOG_RUN_SCENARIOS=1` never set; no live scenario; `bin/wienerdog.js` never invoked.
