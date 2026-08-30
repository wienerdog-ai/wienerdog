# PR gate — external second opinion, round 2, after the four gate findings were closed

WP: WP-snapshot-read-path-hardening
Gate: gptsol, the vendored PR rubric, second pass
PR: felho/wienerdog#9, branch `wp/snapshot-read-path-hardening` @ `4b85cbe`,
base `main` @ `79ba77f`.
Read-only check: `git status --porcelain` empty before and after, byte-identical;
all mutation work ran in archive copies outside the repository.

Raw output, byte-unchanged inside the fence, committed **before it was acted
on**. Transport artifacts decoded and nothing else touched: `&amp;&amp;` for `&&`.

Verdict: **patch is correct**, ZERO findings. All four of its prior findings
verified genuinely-fixed by mutation. Two items in `executed` are worth a
reader's attention rather than being buried: the reviewer first queried PR #9 in
the UPSTREAM repo `wienerdog-ai/wienerdog`, got an unrelated merged PR, caught
its own mistake and re-queried `felho/wienerdog`; and it confirmed the new FIFO
case ran and passed on the exact-head Ubuntu AND macOS CI legs by reading the
job logs rather than inferring it.

`````text
{
  "executed": [
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog status --porcelain (initial) — exit 0; stdout empty",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse --abbrev-ref HEAD && git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse HEAD && git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse main && git -C /Users/felho/dev/repos-to-learn-from/wienerdog merge-base main HEAD — exit 0; confirmed branch wp/snapshot-read-path-hardening, HEAD 4b85cbeebb99aeecaa6a3062c844858857eb7b82, and base/merge-base 79ba77f37394d3157cef6beb7d844ca518b55c19",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --name-status main...HEAD && git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --stat main...HEAD && git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --check main...HEAD — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog ls-files '*AGENTS.md' '*AGENTS.override.md' 'CLAUDE.md' — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog show --stat --oneline --decorate --no-renames 4b85cbe && git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --name-only 6e8e145..4b85cbe — exit 0; the commit changed the two raw gate reports and tests/unit/vault-snapshot.test.js",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --no-ext-diff --text --unified=60 6e8e145..HEAD -- tests/unit/vault-snapshot.test.js — exit 0",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --no-ext-diff --text --unified=20 main...HEAD -- tests/unit/vault-snapshot.test.js — exit 0",
    "command grep -a -R -n 'testConcurrency\\|concurrency\\|--test-concurrency\\|node --test' tests package.json .github/workflows/ci.yml — exit 0; no in-file concurrent vault-snapshot tests found",
    "node --version && uname -s && command -v mkfifo && command -v shellcheck || true && command -v pwsh || true — exit 0; Node v24.18.0 on Darwin, /usr/bin/mkfifo present, shellcheck and pwsh absent",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --no-ext-diff --unified=80 main...HEAD -- src/core/vault-snapshot.js — exit 0",
    "first archive-copy mutation harness — exit 1 before reporting results because zsh reserves the variable name status; its trap removed the outside-repository copy",
    "corrected archive-copy mutation harness — exit 0; backing-allocation mutant test exit 1, read-failure-close mutant test exit 1, file-count-literal mutant test exit 1, O_NONBLOCK-removal mutant test exit 1 after about 10 seconds with ETIMEDOUT, and the clean FIFO case exit 0",
    "npm test -- --test-name-pattern \"vault-snapshot\" — exit 0; 133 tests passed, 0 failed, 0 skipped",
    "node --test --test-concurrency=1 --test-name-pattern \"vault-snapshot\" tests/unit/vault-snapshot.test.js — exit 0; 30 tests passed, 0 failed",
    "node --test --test-concurrency=8 --test-name-pattern \"vault-snapshot\" tests/unit/vault-snapshot.test.js — exit 0; 30 tests passed, 0 failed",
    "npm test and npm run lint concurrently, first fresh reproduction attempt — both exit 0; full suite 2015 tests, 2006 passed, 9 skipped, 0 failed",
    "gh pr checks 9 --repo wienerdog-ai/wienerdog — exit 1; this addressed an unrelated upstream PR #9 and was discarded",
    "Docker/Podman/Colima/Lima and fnm runtime probe — exit 0; Docker CLI present, no alternate container runtime, only Node v24.18.0 installed",
    "gh run view 28625689067 --repo wienerdog-ai/wienerdog --job 84891527807 --log-failed — exit 0; confirmed it was an unrelated upstream run and was discarded",
    "command grep -a -n checks for the file-count literal, instrumentation, FIFO, mkfifo, and execFileSync — exit 0; the source literal has one production occurrence and the FIFO case has one child-process probe",
    "git show 6e8e145:src/core/vault-snapshot.js | shasum -a 256 && shasum -a 256 src/core/vault-snapshot.js — exit 0; both hashes 4274c3aec0f676c498774043aa1ddb6dcb23e5da67337828ff036d6291f0cffd",
    "gh api queries for the unrelated upstream test jobs — exit 0; discarded after repository mismatch was identified",
    "gh pr view 9 --repo wienerdog-ai/wienerdog — exit 0; revealed the queried PR was an unrelated merged PR",
    "git remote -v && git rev-parse origin/wp/snapshot-read-path-hardening origin/main — exit 0; confirmed the target repository is felho/wienerdog and the remote refs are 4b85cbe and 79ba77f",
    "docker info --format '{{.ServerVersion}}' — exit 1; Docker daemon unavailable, so no local Linux container run was possible",
    "global ps/find FIFO-probe resource scan — exit 0 but noisy because it included unrelated temporary artifacts; superseded by the isolated TMPDIR probe",
    "gh pr view 9 --repo felho/wienerdog --json ... — exit 0; confirmed open PR #9 at exact head 4b85cbe with all current checks successful",
    "gh pr checks 9 --repo felho/wienerdog — exit 0; boundary, lint, title, smoke on macOS/Ubuntu, and tests on macOS/Ubuntu all passed",
    "command grep -a -n -E 'rmSync|rm -rf|afterEach|after\\(' tests/unit/vault-snapshot.test.js — exit 1; no cleanup hook exists in this test file",
    "isolated archive-copy FIFO cleanup measurement under a dedicated TMPDIR — exit 0; clean FIFO test passed, left two temporary roots containing one FIFO and one fifo-probe.js, and left zero child processes",
    "npm test (fresh sequential full run) — exit 0; 2015 tests, 2006 passed, 9 skipped, 0 failed",
    "gh run view 31945897847 --repo felho/wienerdog --job 95161667730 --log | grep FIFO summary — exit 0; exact-head Ubuntu CI ran and passed the FIFO test",
    "gh run view 31945897847 --repo felho/wienerdog --job 95161667776 --log | grep FIFO summary — exit 0; exact-head macOS CI ran and passed the FIFO test",
    "node scripts/boundary-check.js with an absolute spec path — exit 1 because the checker expects the repository-relative spec path",
    "command grep -a -E '^ℹ ...' on the retained sequential npm-test output — exit 0; confirmed 2015 tests, 2006 passed, 9 skipped, 0 failed",
    "node scripts/boundary-check.js docs/specs/WP-snapshot-read-path-hardening.md $(git diff --name-only main...HEAD) — exit 0",
    "npm run lint — exit 0; markdownlint and frontmatter passed; locally unavailable shellcheck and PSScriptAnalyzer were skipped, while exact-head CI lint passed all configured layers",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog diff --check main...HEAD — exit 0",
    "archive-copy fs-restoration mutation probe — exit 0 as a harness; removing Object.assign(fs, real) made the selected tests exit 1 after the staged write throw",
    "archive-copy fs-method identity probe with an after hook — exit 0; openSync, closeSync, readSync, lstatSync, and writeFileSync all matched their original identities after the throwing path",
    "20 archive-copy focused runs with --test-concurrency=8, launched five at a time — exit 0; 20 runs, 0 failures",
    "archive-copy O_NONBLOCK-removal timeout probe — exit 0 as a harness; the test exited 1 after about 11 seconds with ETIMEDOUT/SIGTERM and zero fifo-probe child processes remained after one second",
    "npm test and npm run lint concurrently, second fresh reproduction attempt — both exit 0; 2015 tests, 2006 passed, 9 skipped, 0 failed",
    "npm test and npm run lint concurrently, third fresh reproduction attempt — both exit 0; 2015 tests, 2006 passed, 9 skipped, 0 failed",
    "git -C /Users/felho/dev/repos-to-learn-from/wienerdog status --porcelain (final) — exit 0; stdout empty and byte-identical to the initial status"
  ],
  "prior_findings_verification": [
    {
      "id": "[P2] Inspect the backing allocation, not only the Buffer view",
      "status": "genuinely-fixed",
      "evidence": "In an archive copy outside the repository, replaced the bound-sized allocation with a source-sized Buffer followed by a MAX_FILE_BYTES+1 subarray. The focused bounded-read test exited 1 because the new backing-byte-length assertion observed the oversized allocation."
    },
    {
      "id": "[P2] Exercise descriptor closure after a read failure",
      "status": "genuinely-fixed",
      "evidence": "In an archive copy, changed the finally path to skip closeSync when the staged read produced unreadable. The focused failed-bounded-read test exited 1 with actual closes 0 versus expected 1; the unmodified test also asserted leaked === 0."
    },
    {
      "id": "[P2] Cover the nonblocking FIFO refusal path",
      "status": "genuinely-fixed",
      "evidence": "In an archive copy, removed O_NONBLOCK from OPEN_FLAGS. The FIFO test became red after its 10-second execFileSync timeout with ETIMEDOUT/SIGTERM, rather than wedging the runner, and no child process remained. The clean case passed locally and on the exact-head Ubuntu and macOS CI legs."
    },
    {
      "id": "[P3] Match the dormant file-count literal exactly",
      "status": "genuinely-fixed",
      "evidence": "In an archive copy, replaced the `${MAX_FILES}-file cap` reason with different text. The focused vocabulary test exited 1 because source.includes('${MAX_FILES}-file cap') became false."
    }
  ],
  "findings": [],
  "overall_correctness": "patch is correct",
  "overall_explanation": "All four prior coverage defects are now enforced by assertions that went red under targeted mutations, and no fresh qualifying defect was found in the new test surface. The FIFO case times out a missing-O_NONBLOCK regression, leaves no process, and behaves the same on the exact-head Ubuntu and macOS CI legs; it does leave two temporary roots containing one FIFO and one probe script, consistent with this test file's existing no-cleanup fixture convention and not a blocking defect. The earlier unexplained full-suite exit 1 did not reproduce in four fresh full runs—one sequential and three concurrent with lint—so it is not established as real and does not block this verdict.",
  "overall_confidence_score": 0.99
}
`````
