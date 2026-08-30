# PR gate — wd-reviewer, round 2, after the four gate findings were closed

WP: WP-snapshot-read-path-hardening
Gate: wd-reviewer (the merge gate), second pass
PR: felho/wienerdog#9, branch `wp/snapshot-read-path-hardening` @ `4b85cbe`,
base `main` @ `79ba77f`. The only commit since the first pass is `4b85cbe`,
which touches `tests/unit/vault-snapshot.test.js` alone — the reviewer verified
`src/core/vault-snapshot.js` is byte-identical by HASH rather than by trusting
the claim.
Read-only check: `git status --porcelain` empty before and after, byte-identical;
all mutation work ran in a tar copy outside the repo, since deleted.

Raw output, byte-unchanged inside the fence, committed **before its findings
were acted on**. Transport artifacts decoded and nothing else touched: the
notification channel delivered `&lt;`/`&gt;` for `<`/`>`, `&amp;&amp;` for `&&`,
and `2&gt;&amp;1` for `2>&1`.

Verdict: **APPROVE**. All four findings across both gates verified genuinely
fixed by old-green/new-red mutation, each applied to both the pre-fix and
post-fix test files. One `[convention]` finding remains (the PR body's
verification numbers are stale against this HEAD), plus two optional
`[quality]` notes, and a reasoned non-blocking disposition of the external
gate's unreproduced `exit 1`.

`````text
## APPROVE

**Read-only proof.** `git status --porcelain` at start: empty (exit 0). At end: empty (exit 0). Byte-identical. HEAD unchanged at `4b85cbe`. All mutation work ran in `/tmp/wd-mut` (a tar copy outside the repo, `node_modules` symlinked), now deleted. No file in the repo was written, edited, or deleted.

**Commands I actually ran (not read):**

| Command | Exit | Result |
|---|---|---|
| `node scripts/boundary-check.js <spec> $(git diff --name-only origin/main...HEAD)` | 0 | 13 changed files, all allowed |
| `node scripts/boundary-check.js <spec> $(git show --name-only --format= 4b85cbe)` | 0 | new commit touches only `tests/unit/vault-snapshot.test.js` |
| `npm test -- --test-name-pattern "vault-snapshot"` | 0 | 133 tests, 133 pass, **0 skipped** (FIFO case ran, 27ms) |
| `npm test` | 0 | 2015 / 2006 pass / 0 fail / 9 skipped (all 9 pre-existing win32-only) |
| `npm run lint` | 0 | markdownlint 0 errors, frontmatter 218/4; shellcheck + pwsh absent locally |
| `npm test` × 3 concurrent with `npm run lint` | 0,0,0 | see the exit-1 note below |
| `node --test tests/unit/vault-snapshot.test.js` × 5 | 0 | 30/30 each run, no flakiness |
| 5 mutations + 2 controls in `/tmp/wd-mut` | — | table below |
| `gh pr view 9 --repo felho/wienerdog` | 0 | CI green on **both** legs at `4b85cbe`; ubuntu log line `ok 1973 - vault-snapshot: a FIFO swapped in…` (ran, not skipped) |

`src/core/vault-snapshot.js` is byte-identical between `6e8e145` and `4b85cbe` — verified by hash (`e8b767bb…` both), not by trusting the claim.

---

## PART 1 — prior findings, verified by mutation

Every mutation was applied to a copy outside the repo and run against **both** the pre-fix test file (`6e8e145`, 728 lines) and the post-fix one (`4b85cbe`, 800 lines). "old green / new red" is the honest proof that the fix is a fix and not a re-wording.

| # | Finding | Mutation applied | Old tests | New tests | Verdict |
|---|---|---|---|---|---|
| 1 | dormant `-file cap` guard (mine #1 / ext P3) | `` `exceeds the ${MAX_FILES}-file cap` `` → `` `too many files` `` | 29 pass, 0 fail | **1 fail** (`the file-count reason is VOCABULARY only`) | **genuinely fixed** |
| 2 | `O_NONBLOCK` uncovered (mine #2 / ext P2) | `O_NONBLOCK` term deleted from `OPEN_FLAGS` (`src:61`) | 29 pass, 0 fail | **1 fail** at 10005ms — the child blocked, `execFileSync` timeout killed it, the test went red | **genuinely fixed** |
| 3 | boundedness read `buf.length` (ext P2) | `readBounded` allocates `Buffer.alloc(4MiB)` and passes `big.subarray(0, MAX+1)`; still returns a copy | 29 pass, 0 fail | **1 fail** (`the read is bounded at the primitive`, on `r.backing`) | **genuinely fixed** |
| 4 | descriptor leak on read failure (ext P2) | `finally` closes only when the try did **not** throw — leaks on exactly the read/`fstat`-throw path | 29 pass, 0 fail | **1 fail** (`a failed bounded read outranks a cap reason too`, on `closes`/`leaked`) | **genuinely fixed** |

Answers to your specific sub-questions on #2:

- **Does striking `O_NONBLOCK` fail the suite?** Yes — red at 10005ms.
- **Is the child-process shape sound / does it exercise the swapped FIFO?** Yes, proven two ways. (a) The M2 mutation only reaches red if the open actually lands on a FIFO. (b) I ran a **vacuity control** — replaced the child's `unlinkSync` + `mkfifo` with a no-op; the test went red with `actual: undefined` (nothing skipped, file copied). So the child's path plumbing (`getPaths` reconstruction from `root`) is correct in both directions, and the test cannot pass without the swap. Note the swap is also correctly ordered: the hook returns the stat captured **before** `mkfifo`, so `lstat` still sees a regular file and Table C row 2 cannot fire in row 5's place.
- **Does a hang become red rather than a wedged run?** Yes — that is exactly what M2 demonstrated.
- **Timeout adequate?** 10000ms against an observed 27ms end-to-end — ~370× margin. Ubuntu CI ran it at `12:02:52` inside a 2-minute job with no trouble.
- **Child cleaned up?** Yes. `ps -ax | grep fifo-probe` after the timed-out M2 run: no orphan. `execFileSync`'s SIGTERM reaches a process blocked in a synchronous `open` because Node installs no default SIGTERM handler.

---

## PART 2 — attacking the new test surface

I could not find a test that passes for the wrong reason, an assertion that cannot fail, or a leak of a process. Specifically checked and cleared:

- **`fs` instrumentation restores on every path.** Proven empirically, not read: I loaded `instrumented`/`tempPaths`/`writeVault` out of the test file with `node:test` stubbed and ran three shapes — clean run, run-under-test throws (staged `writeFileSync`), and the *hook itself* throws. All five patched members (`openSync`, `closeSync`, `readSync`, `lstatSync`, `writeFileSync`) compared `===` to the originals afterwards in all three. The `finally { Object.assign(fs, real) }` at `tests/unit/vault-snapshot.test.js:483-485` covers it.
- **Parallelism.** `tests/run.js` shells out to `node --test`, which forks one process per file; top-level tests inside a file run serially. The global `fs` patching is therefore process-isolated and cannot interleave. Confirmed by 5 clean repeats and by 4 clean full-suite runs.
- **`vaultFds` scoping** (`:443-457`) counts only descriptors whose path starts with `paths.vault`, so the staging-side opens (`mkdirPrivate`, the copy) cannot inflate `opens`/`closes`. `log.leaked` is computed after restore, from set residue — a genuine leak detector, as M4 proved.
- **ubuntu vs darwin.** The only platform-sensitive new code is the FIFO case. `mkfifo` is coreutils on ubuntu; `open(fifo, O_RDONLY|O_NONBLOCK)` returning immediately is POSIX-mandated; `O_NOFOLLOW` does not fire on a non-symlink. Rather than argue it, I read the ubuntu CI log: the case ran and passed (`ok 1973`, no `# SKIP`).
- **The FIFO test does not patch the parent's `fs` at all** — the monkeypatch lives in the child. That is structurally the cleanest of the race cases and worth keeping.
- **`r.backing === MAX_FILE_BYTES + 1`** is deterministic: `Buffer.alloc(262145)` is always non-pooled (pool is 8 KiB), so the equality is exact, not incidental.

Three non-blocking notes, none of which needs a re-review round:

1. **[quality] `tests/unit/vault-snapshot.test.js:733-736` — the dormant literal's guard now covers the tail but not the frozen prefix.** Measured: mutating `src/core/vault-snapshot.js:285` to `` `WRONGLY REWORDED: ${MAX_FILES}-file cap` `` leaves all 30 tests green. Table C `:248` freezes the whole form `exceeds the ${MAX_FILES}-file cap`, and this is the only one of the ten literals with no runtime assertion behind it, so the source-text match is its sole guard. This is my own fault — I handed the implementer the exact needle `'${MAX_FILES}-file cap'` in round 1 and it was applied verbatim. One-line tightening: `source.includes('exceeds the ${MAX_FILES}-file cap')`. Deletion (the original defect) *is* now caught; only re-wording slips through.
2. **[quality] `tests/unit/vault-snapshot.test.js:752-800` — the FIFO case asserts the reason only.** Not `!copied(...)`, not `opens`/`closes`, because the child returns only `skipped`. Row 5's close pairing is covered through the identical code path by the directory case at `:532-557` (`opens === 1`, `closes === 1`, `leaked === 0`, `reads.length === 0`), so nothing is uncovered — but the child could cheaply also return `fs.existsSync(stage + '/vault-snapshot/' + rel)`. Optional.
3. **[quality] `tests/unit/vault-snapshot.test.js:763, 782` — the case leaves `fifo-probe.js` and a named pipe in the temp dir.** Confirmed on disk. This matches the file's pre-existing pattern (no `tempPaths()`/`staging()` call anywhere in this file is ever cleaned up), so it is not a new class of leak and nothing holds the pipe open. Also: if `mkfifo` were absent the child would throw and the test would go red with a confusing message rather than skip — acceptable given both CI legs have it.

---

## PART 3 — the rest of the diff, and the PR body

`src/` is unchanged from what I approved, and re-reading it against Tables A/B/C at `4b85cbe` I judge nothing differently. Boundary is clean. One finding:

1. **[convention] PR #9 body, "Verification output" block — stale against the HEAD under review.** It shows `tests 132 / pass 132` for the focused run and `tests 2014 / pass 2005` for the full run; at `4b85cbe` the actual numbers are **133 / 133** and **2015 / 2006 / 0 fail / 9 skipped**. The prose "Twelve tests were added and all twelve were red before the implementation commit" is now thirteen. The spec's Definition of done item 1 and CLAUDE.md both require the verification output pasted into the PR body, and a maintainer reading it before merge would see numbers that do not match the diff. The correct output is in the `4b85cbe` commit message already — it just needs to reach the body. **This is a body edit, not a code change: it needs no re-verification and no further review round.**

---

## ADR-0031 — contract-density and closed-contract drift check

No action, no routing to wd-architect. This round changed only test code, so no canonical table moved and no mirror could drift; the registered test-comment mirror at `:407-410` is untouched. The four findings did not recur as a contract family — they were the *same* four findings from round 1, now each closed by mutation-proven coverage, which is convergence, not the repetition ADR-0031's circuit-breaker watches for. The settled contracts (the ten-literal vocabulary, the three cap values, `SNAPSHOT_PLANS`, the Done gate chain, Table C's owner-ruled row-3 crossover) all come through byte-unchanged, and no mirror was promoted to primary. Table C's extraction continues to do its job. **The spec is not at fault here** — nothing in this round was caused by ambiguity, so the "two failed rounds means the spec is the bug" escalation does not apply.

---

## The external gate's one `npm test` exit 1

**I cannot reproduce it, and I do not consider it a blocker.** I ran three full suites concurrently with `npm run lint` (both processes racing, three times): `npm test` exit 0 / 0 / 0, `npm run lint` exit 0 / 0 / 0, 2015 tests each. Plus one sequential full run (exit 0), five repeats of the vault-snapshot file (30/30 each), and both CI legs green at HEAD. That is 4 concurrent + 4 sequential clean runs here on top of your 4, against one truncated report with no retained failure detail, from a run whose *own* two later sequential runs exited 0 — including one that grepped explicitly for `✖|not ok|AssertionError|ERR_ASSERTION` and found nothing.

The likeliest explanation is transport, not product: the external gate's own logbook records that its output channel mangled `&&` and `2>&1`, so a truncated stdout capture that lost the exit status is in character. There is also no plausible product mechanism — `npm run lint` is read-only (markdownlint + a frontmatter reader), the suite writes only into fresh `mkdtemp` directories, and nothing in this WP's diff shares state between the two. Recording it as unreproduced rather than dismissing it, as the implementer did, is the right disposition. If it ever recurs, capture with `npm test 2>&1 | tee` rather than a truncating channel.

---

## Bottom line

**The diff is sound.** All four findings across both gates are genuinely fixed, each proven by a mutation that was green before the fix and red after. The new test surface holds up under attack: the instrumentation restores cleanly on every path including throws, there is no cross-test interference or parallel-execution hazard, the child process is killed and leaves no orphan, and the ubuntu leg is confirmed green by log, not by inference. Ship it once the PR body's verification block is refreshed to the `4b85cbe` numbers; the two `[quality]` test notes are optional drive-bys the implementer may fold in without another gate round.

Files of record:
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/vault-snapshot.js` (unchanged, hash `e8b767bb…`)
- `/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js` (the whole diff, lines 404-800)
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-snapshot-read-path-hardening.md`
`````
