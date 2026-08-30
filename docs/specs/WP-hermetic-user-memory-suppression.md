---
id: WP-hermetic-user-memory-suppression
title: Stop a hermetic run from inheriting user-level CLAUDE.md — conditional successor to the memory canary
status: Draft
model: opus
size: S
depends_on: [WP-memory-import-hermetic-canary]
adrs: [ADR-0004, ADR-0025, ADR-0039]
epic: digest-delivery
---

# WP-hermetic-user-memory-suppression: close the ambient-memory inheritance, if it exists

> **STUB — conditional.** This WP exists because ADR-0039 Amendment 1 (round-2 finding
> F4) made the hermetic canary's adverse verdict **blocking** rather than merely
> reported. It is written and scheduled **only if**
> `WP-memory-import-hermetic-canary` measures that user-level `CLAUDE.md` **is** loaded
> under the production hermetic argv. If the canary measures "not loaded", this spec is
> closed as `Superseded` with a one-line note pointing at the canary's logbook entry,
> and nothing else happens.
>
> **Do not implement this WP until its Current state is filled in with the measured
> fact.** A stub whose premise has not been measured is a guess.

## Context (read this, nothing else)

Wienerdog's unattended jobs — the nightly **dream** and the scheduled **routines** —
spawn `claude -p` under a **hermetic runtime profile** (ADR-0025): an explicit
`--tools` allowlist, `--strict-mcp-config`, a hook-free `--settings` file, and
`--setting-sources ''` whose in-code comment claims it "loads NOTHING ambient".

**IRON RULE (ADR-0004): Wienerdog is just files.** Whatever this WP does, it changes
flags and files. It adds no process.

**Why this might be needed.** ADR-0025's central claim is that a hermetic run inherits
**no ambient authority**. That claim was measured against **settings sources**. Memory
files (`CLAUDE.md`) are a *separate* loading mechanism, and the researcher pass of
2026-08-30 established that `claude -p` loads `CLAUDE.md` unless `--bare` is passed,
while leaving the interaction between `--setting-sources ''` and memory loading
**undocumented**.

If user-level `CLAUDE.md` **is** loaded hermetically, then three things are true at
once and all of them matter:

1. The managed block **already** carries the whole digest into the dream's own brain
   today — a pre-existing condition ADR-0025 does not describe.
2. The `WIENERDOG_JOB` guard in `templates/hooks/session-start.sh` — *"Skip during
   Wienerdog's own scheduled jobs (dream/digest) so unattended runs start context-free
   and never re-read state mid-job"* — was written to prevent exactly this for the
   **hook** channel, and is therefore only half a guard: the block channel walks around
   it.
3. The dream's brain reads the user's own transcripts, which contain external
   `tool_result` content. What else is in that brain's context is a security question,
   not a cosmetic one.

`WP-managed-block-by-reference` would change *which* digest reaches that brain
(last-sync bytes → current bytes). That is not a regression, but it is not something to
ship while the underlying condition is unrecorded and unaddressed.

## Current state

**PLACEHOLDER — to be filled in by `WP-memory-import-hermetic-canary`.**

The canary's PR must replace this section with the measured facts before this WP is
scheduled:

- `claude --version` measured against, and the date.
- The exact argv, as emitted by the real `getProfile('dream')` + `composeClaudeArgs`.
- Case A's verdict (user `CLAUDE.md` inline token) and the raw evidence.
- Cases B, C, D verdicts (absolute import, `~` import, missing target).
- The non-vacuity control's verdict.
- Whether `--bare`, or any other flag, was observed to suppress memory loading.

Until this section is real, the Deliverables below are a sketch and **must not** be
implemented.

## Deliverables (permission boundary — touch ONLY these)

**To be finalized once Current state is filled in.** The likely shape, for scoping only:

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/runtime-profile.js | add the suppressing flag to `composeClaudeArgs`; correct the `--setting-sources` comment, which currently overclaims |
| modify | tests/unit/runtime-profile.test.js | pin the emitted argv |
| modify | docs/adr/0025-hermetic-runtime-profiles.md | an amendment recording the measured fact and the correction |

The ADR-0025 amendment is **not optional** on the adverse branch: that ADR's "loads
NOTHING ambient" comment and its containment claim would both be, on the measured
evidence, wrong as written. Correcting the record is the point of the gate.

## Contract reference

N/A — scope unknown until Current state is measured. Re-evaluate the ADR-0031 trigger
when this spec is finalized.

## Implementation notes & constraints

- **Do not guess the mechanism.** `--bare` is documented to suppress `CLAUDE.md` for
  `claude -p`, but it may suppress more than intended (it is a broad flag) and may
  interact with `--append-system-prompt`, which the dream profile uses to load the
  vendored skill body. Whatever is chosen must be re-measured with the canary harness,
  not assumed from the docs — that is the lesson ADR-0025 Amendment 2 already recorded
  when it replaced version pinning with a live probe.
- Prefer the **narrowest** flag that suppresses memory inheritance while leaving the
  rest of the hermetic composition byte-identical. A broad flag that also disables
  something the dream depends on trades one unmeasured risk for another.
- `src/core/runtime-profile.js` is a **pure** module (no fs, no `child_process`, no
  env, no network). Keep it that way.

## Security checklist

- [ ] Re-run the canary harness after the change and assert the token is **no longer**
      returned — the fix must be measured, not assumed.
- [ ] Re-assert the non-vacuity control after the change: a probe that stops reaching
      the model would report "suppressed" for a change that did nothing.
- [ ] Confirm the dream's `--append-system-prompt` skill body still loads, and that the
      broker/MCP allowlist composition is unchanged, by diffing the emitted argv.

## Acceptance criteria

**To be written once Current state is filled in.** At minimum: the canary reports the
token is no longer inherited; the non-vacuity control still passes; the emitted argv is
otherwise byte-identical; and ADR-0025 carries an amendment stating the measured fact
and the correction.

## Verification steps (run these; paste output in the PR)

```bash
npm run scenarios:memory-canary
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Anything at all, until Current state carries a real measurement.
- Changing the managed block or the adapters — `WP-managed-block-by-reference`.
- Broadening or narrowing the hermetic profile's `--tools`, `--disallowedTools`, MCP
  allowlist, or permission mode. This WP touches memory inheritance only.

## Definition of done

1. Current state carries the measured fact from `WP-memory-import-hermetic-canary`.
2. All verification steps pass locally; output pasted into the PR body.
3. Conventional commits; PR titled
   `fix(runtime): suppress ambient user memory (WP-hermetic-user-memory-suppression)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created as a conditional stub** by ADR-0039 Amendment 1 (round-2
  Codex finding F4, owner: ACCEPTED). The canary was a measurement with no consequence
  attached to an adverse verdict; making it blocking requires a named successor for the
  adverse branch, which is this spec. It is deliberately unfinished: its Current state
  is a placeholder the canary fills in, and its Deliverables cannot be finalized before
  then.
