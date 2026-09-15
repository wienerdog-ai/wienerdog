---
date: 2026-09-15
related_wps: [WP-dream-live-owner-lock, WP-dream-filtered-input-budget]
---

# Dream live-owner lock: approval, review and verification

## Approved scope

The owner accepted a separate prerequisite for design finding R2-1: deadline
expiry alone must not displace a living local dream owner. Retain automatic
recovery for an expired lock whose local owner is proven gone. Unknown
ownership cannot authorize takeover. The owner explicitly accepted the existing
race between simultaneous stale claimants for this narrow correction; do not
silently reinterpret this as a complete lock/recovery redesign.

The new WP's Table L is the implementation contract. This evidence record is
kept separately so its implementation PR can carry the relevant approval and
review without importing the successor's unrelated proposed content settings.
P1–P4 of that successor remain unapproved.

## Design gate

R2-1 was B/HEAVY: the old model-only deadline permits a second dream to replace
shared scratch while an earlier dream is legitimately preprocessing. A
committed two-process reproduction and independent relay rerun confirmed that
existing behavior. They did not execute a future implementation.

Fresh template conformance at `190eec5e` read only the lock WP and template.
Raw output is `2026-09-15-dream-live-owner-lock-template-r0-raw.txt`, committed
at `5a962662` before inspection. All required sections/examples/repeatability
were present. TC-01 C/LIGHT concerned missing mirror registrations. A full
existing-section ownership pass across both specs mechanically closed it at
`350050cf`, without new product behavior or verification machinery.

Joint independent native Codex review at
`350050cfb71a25f1fb6b25980f561688c96c9f82` returned **approve**, no findings and
no scope objections; R2-1 is resolved in design, implementation pending. Raw
output and full focus/vendored input were committed at `cfb15861` before
inspection as `2026-09-15-dream-preprocessing-design-r3-raw.txt` and
`2026-09-15-dream-preprocessing-design-r3-input.txt`. The reviewer checked both
literal boundary commands and the lock JSON timestamp/encoding; it ran no
tests. Its checkout was clean and HEAD/status identical before and after.
The relay checked the cited Table L and successor A11/dependency/ADR boundary.

The approved scope and accepted residual already have owner authorization.
After the clean design verdict the architect may mark the lock WP Ready.
The content WP remains Draft until its own owner choices are settled and the
prerequisite lands. No implementation or PR verdict is implied by this gate.

## Baseline and runtime-path diagnosis

Unchanged source base: `91668da62822c73be6115a3e6d06c6ec51462509`.
Existing lock/pipeline tests passed 62/62; dream integration tests passed 47/47.
Full lint passed; PowerShell analysis was skipped because `pwsh` is unavailable.

The earlier ordinary full-suite run had 2,699 tests: 2,686 passed, one failed,
12 skipped. `adopt-e2e` pinned the installed Claude command rather than its
fixture. Source tracing found `buildCleanEnv` puts `dirname(process.execPath)`
first. This machine's Node and installed Claude share the fnm binary directory,
so that directory wins over the fixture's temporary `~/.local/bin` when pinning.
The in-process dream later resolves the fixture on its separately prepended
PATH and correctly rejects the mismatch.

To check that diagnosis without changing code or identity enforcement, the
relay copied the exact running Node binary into a private temporary runtime-only
bin directory and prepended it to the test command's PATH. Node remained
v24.18.0, byte-identical SHA-256
`ee6fb0e015284d83a91e8ec5213f43a157f8a392b58555301682892ba928c04a`.
`npm test -- tests/integration/adopt-e2e.test.js` then passed all six tests.
Raw output: `2026-09-15-dream-live-owner-lock-runtime-check.txt`.

This is a test-environment correction, not a source fix, skipped assertion,
waiver, or installed-app sync. The original co-located-runtime failure remains
reproducible under that original environment. Full-suite verification will
state the runtime-only PATH explicitly rather than claim the original command
environment became green.

## Implementation route

An isolated `wp/dream-live-owner-lock` worktree is prepared from the verified
main/upstream-main source base. Only the approved lock spec and its evidence
will enter that branch; the successor proposal remains on its existing branch.
Before implementation, re-verify the exact spec claims on the dispatch SHA and
record that SHA. Both PR review gates remain required after implementation.

## Lesson

- WP-dream-live-owner-lock: expiry is a retry threshold, not evidence that a
  live process has stopped; retain the owner through the actual job lifecycle.

## Dispatch and implementation baseline

The isolated implementation branch starts from the verified main/upstream
source base, with the approved spec/evidence staged in commit
`1045e5b8022459cc13f113541c447b30c683f8b1`. The orchestrator executed C1–C4,
current lock payload shape and completed WP-069 dependency checks against that
exact commit immediately before delegating implementation: four tests passed.
The source and output are retained as the `dispatch-source` and
`dispatch-output` text artifacts beside this record. These are one-off historical
dispatch evidence, not a new verification tool or future-behavior acceptance gate.

The refreshed full baseline under the runtime-only PATH passed at unchanged
source `91668da62822c73be6115a3e6d06c6ec51462509`: exit 0, 2,699 total,
2,687 passed, zero failed, 12 skipped. Actual summary excerpt:

```text
ℹ tests 2699
ℹ suites 0
ℹ pass 2687
ℹ fail 0
ℹ cancelled 0
ℹ skipped 12
ℹ todo 0
ℹ duration_ms 51541.546375
```

Runtime setup used for this machine's verification (the binary is not checked in):
copy `process.execPath` into a private temporary `runtime-bin/node`, preserving
executable mode, verify identical SHA-256, and prepend that directory to PATH
for `npm test`. Keep the original PATH after it. This preserves Node contents
and the repository's test wrapper while removing the unrelated co-located
Claude from the runtime-first directory. No installed configuration is changed.

Implementation was delegated at the exact checked SHA to a fresh native agent,
limited to the lock WP Deliverables. The orchestrator owns this evidence record;
the implementer owns code, tests and the specified ADR amendment. Both PR gates
will review one fixed implementation tip with an unchanged checkout.

## Implementation handoff

The implementer changed only the six Deliverables and the WP's status/checklists.
Expired-lock recovery now follows L2–L6. The payload, timeout argument,
`ownsLock`/`releaseLock` and existing stale-overwrite mechanism remain unchanged.
ADR-0012 received only the scoped dated amendment. The spec is In-Review; both
PR gates are pending, not waived.

Regression tests were run against the original product code first: 144 tests,
106 passed and 38 failed, exit 1. The output is retained with trailing whitespace normalized as
`2026-09-15-dream-live-owner-lock-red.txt`. After implementation, the literal
targeted command passed 144/144, and the full suite passed 2,734 tests with
2,722 passes and 12 skips, exit 0, under the documented runtime-only PATH.
Final lint, boundary and diff checks passed; PowerShell analysis was unavailable.
Actual output excerpts are in `2026-09-15-dream-live-owner-lock-verification.txt`.

The regression includes a real separate live owner and a reaped dead owner,
plus a real contender at collection, brain, finalization and cleanup points.
The existing cleanup-order check was made non-vacuous within its owned test:
filesystem events must contain the full expected cleanup-before-release sequence.

**PR review criterion:** both gates read the same fixed tip and unchanged
checkout. Preserve raw verdicts/execution records before inspection. Fix genuine
implementation defects within the approved contract; any new policy or residual
requires owner disposition. A changed product diff needs both gates on its new
tip. Two failed rounds route back to the architect under the existing repo rule.
The already accepted stale-claimant residual is not silently reopened.

## PR review round 1 — closed

Implementation PR: [#66](https://github.com/felho/wienerdog/pull/66), branch
`wp/dream-live-owner-lock`. Both fresh native gates reviewed the same commit
`2b98bb17ca1c4270316bbc81ae5c3c4c0558c660` against merge base
`91668da62822c73be6115a3e6d06c6ec51462509`. Both recorded identical empty
checkout status and unchanged HEAD before and after review.

The four raw verdict/execution files named
`2026-09-15-dream-live-owner-lock-pr-{spec,independent}-r1-*` were committed at
`644b9a2084b0b7034ca4d4e233d21cf643a9a40b` before the orchestrator read them.
The text verdict is **APPROVE**, no findings; the frozen JSON verdict is
**patch is correct**, findings empty. Both reviewers independently ran the
full suite: 2,734 total, 2,722 passed, 12 skipped, exit 0. The spec gate also
ran the targeted 144-test command. All specified lint/boundary/diff checks passed.
No finding requires disposition or a further product revision.

The relay checked both execution records, unchanged canonical contract and the
reviewed commit. GitHub checks on that implementation tip all passed: Linux and
macOS tests and install smoke, lint including the CI PowerShell checks, boundary
and PR title. Local PowerShell omission therefore did not leave that CI gate
unexecuted. Evidence-only commits after this tip add the reports and handoff;
product code, tests, ADR and WP are byte-identical to the reviewed tip. The
execution-record readable copies normalize trailing whitespace, with exact raw
bytes retained in the raw-evidence commit above. Verdict files remain verbatim.

The PR remains unmerged for maintainer review. The implementation lives in the
isolated `dream-live-owner-lock` worktree; the original content branch retains
its Draft successor and pending P1–P4 decisions. Next: land this prerequisite,
then settle those content-policy defaults before dispatching the successor.
