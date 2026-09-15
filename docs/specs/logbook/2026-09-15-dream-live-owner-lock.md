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
