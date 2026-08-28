---
title: Round 2 — external adversarial review (raw), the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. The reviewer's own
     bold pseudo-headings trip MD036; the repo's standing device for verbatim
     evidence is to disable the linter for the file rather than edit the text,
     exactly as the vendored prompts and every prior raw record do. -->

# Round 2 — external adversarial review (raw)

Reviewer: gptsol (Codex side), external, FRESH agent (not a continuation of
round 1 — a reviewer degrades as its context grows). Reviewer instructions: the
vendored `docs/runbooks/review-prompts/adversarial.md`, unedited. Targets: both
specs, **whole settled text** at `fc7d9fb`, base `main` @ `36c2ce5`. Authorised
by the owner under the runbook's HEAVY rule after round 1's fix changed
`promote()`'s return type.

**Committed BEFORE adjudication, verbatim.** Dispositions live in the round
record. The only alteration is this header. `&lt;` `&gt;` `&amp;` in the body are
transport escaping from the agent channel.

**Read-only, verified independently by this author**: `git status --porcelain`
empty before dispatch and after.

## Raw output

# External adversarial design review — round 2

Target: the promote split pair — `WP-dream-promote-module` + `WP-dream-promote-in-workspace`, whole settled text at `fc7d9fb`
Base: `main` at `36c2ce5`

## PRIOR-FINDINGS VERDICT TABLE

| Prior finding | Verdict | Current evidence |
|---|---|---|
| **R1-1** | **Genuinely fixed for ordinary promoted and redacted notes.** A sibling defect remains for the report; see Finding 2. | `docs/specs/WP-dream-promote-module.md:210-226` now makes `promoted` and `redacted` carry `{rel, bytes}` and binds those bytes to H6. Table E names all three staging fields at `:376`. Pipeline G8 names `promoted[].bytes`, `redacted[].bytes`, and `report.bytes` at `docs/specs/WP-dream-promote-in-workspace.md:260`; its ordinary/redacted race criterion is at `:415-422`. |
| **Z1** | **Genuinely fixed.** | `docs/specs/WP-dream-promote-in-workspace.md:33-41` now quantifies over entry points, not modules, and explicitly names `brain.js:18` and `workspace.js:63` as the existing module-level requirers. |
| **Z2** | **Genuinely fixed.** | `docs/specs/WP-dream-promote-module.md:241-245` explicitly distinguishes the naming order C, D, E, R from the document reading order C, D, R, E and explains the dependency. |
| **Z3** | **Genuinely fixed.** | `docs/specs/WP-dream-promote-module.md:34-40` limits the comparison to each dependency's own merge and names the consumer `delta.js` later gained. |

A mechanical check of all four fixes exited 0.

## VERDICT

`needs-attention`

## SHIP / NO-SHIP

**NO-SHIP.** The pipeline drops the shipped post-commit ownership registration for newly accepted skills, and the round-1 decided-bytes fix still leaves a conforming successful report result able to omit the bytes G8 must stage.

## FINDINGS

### Finding 1 — Accepted new skills can become permanently unregistered

- **Materiality band:** B
- **Affected file:** `docs/specs/WP-dream-promote-in-workspace.md`
- **line_start:** 249
- **line_end:** 261
- **Confidence:** 0.99

**What can go wrong**

The rewired pipeline can accept, publish, and commit a new dream-created `SKILL.md` without adding it to `state/skill-registry.json`. That skill is then treated as not dream-owned, so later autonomous revisions fail closed even though the dream created and committed it.

**Why this path is vulnerable**

The current validator has a two-part durable side effect:

- it collects accepted new skill drafts at `src/core/dream/validate.js:1200-1205`;
- after the commit, it calls `recordSkills` at `:1443-1448`.

The shipped ownership-registry contract requires an entry for every new dream-created skill the orchestrator accepts and commits:

- `docs/specs/done/WP-083-skill-ownership-registry.md:389-397`.

The pipeline spec acknowledges Step 6 in Current state at `:148-152`, but Table G replaces the validator's classification, report, and commit responsibilities without assigning the registration side effect to any row. Table G, the acceptance criteria, and Out of scope contain no `recordSkills`, newly-accepted-skill, or ownership-registry obligation. G7 preserves only four gate semantics; G8 owns only the commit and staged bytes.

A conforming implementation can therefore leave the old `validateAndCommit` registry code and its existing unit test intact while no longer calling that function from the running pipeline. The old test still passes, but production registration is dead.

**Likely impact**

New skills appear successfully promoted and committed, but cannot participate in the documented revision lifecycle later. This is a missing product build likely to be caught during implementation or a downstream review, so it is band B.

**Concrete recommendation**

Add an explicit Table G obligation and acceptance criterion preserving post-commit ownership registration:

1. derive accepted new non-`wienerdog-*` `SKILL.md` entries from the shared delta plus the successful `promoted`/`redacted` dispositions;
2. derive `id` and `created` from the decided bytes returned by `promote()`, not by re-reading the vault path;
3. call `recordSkills` only after the commit succeeds;
4. register both ordinary and redacted accepted new skills;
5. never register refused, existing, or shipped skills;
6. add a production-shaped pipeline test proving the registry entry is written, plus negative cases.

### Finding 2 — `report.bytes` remains optional on successful report outcomes

- **Materiality band:** B
- **Affected file:** `docs/specs/WP-dream-promote-module.md`
- **line_start:** 210
- **line_end:** 230
- **Confidence:** 0.98

**What can go wrong**

A conforming `promote()` implementation can return a successful `report.outcome` of `promoted` or `fallback` without `report.bytes`. The pipeline then cannot satisfy G8's requirement to stage the decided report bytes. It must either omit the report, violate the interface, invent a side channel, or stage by path and re-read potentially changed bytes.

If it stages by path, a user save landing after report publication can become the committed report content even though those bytes were never judged by promotion.

**Why this path is vulnerable**

The round-1 fix correctly makes bytes mandatory on every `promoted[]` and `redacted[]` entry, but the canonical report type remains:

`report:{outcome:'promoted'|'fallback'|'refused', reason?:string, bytes?:Buffer, ...}`

Because `bytes` is optional for the whole union, omitting it on a successful report outcome conforms to the exact interface.

That contradicts:

- Table E at `:376`, which says the module supplies `report.bytes`;
- pipeline G8 at `docs/specs/WP-dream-promote-in-workspace.md:260`, which requires staging from `report.bytes`;
- the pipeline checklist at `:293-299`, which claims G8 stays aligned with the return shape.

The decided-bytes acceptance criterion at pipeline lines `415-422` was widened for ordinary and redacted notes but does not exercise the report path. Thus the remaining optionality can survive the stated criteria.

**Likely impact**

The implementation can reintroduce the exact decision-bytes versus committed-bytes race the round-1 fix was intended to close, this time through the report. This should be caught during implementation or downstream review, so it is band B.

**Concrete recommendation**

Make `report` a discriminated union that requires bytes on every published outcome, for example:

- `{outcome:'promoted'|'fallback', bytes:Buffer, record:string[]}`
- `{outcome:'refused', reason:string, record:string[]}`

Then extend the G8 acceptance criterion with a report-specific race case: mutate the report between publish and staging and assert that the commit contains `report.bytes`, while the user's later save remains uncommitted and intact.

## SCOPE OBJECTIONS

None.

## EXECUTION REPORT

### Commands run as checks

| Command | Exit | Result |
|---|---:|---|
| `git status --porcelain && git rev-parse HEAD && git rev-parse main` | 0 | Initial status empty; HEAD `fc7d9fbe7303529f3dc6a759d1255a55185ae285`; main `36c2ce51562aadb3eea83ccfe51a40bc728d9680`. |
| `git diff --stat main...HEAD && git diff --name-only main...HEAD` | 0 | Confirmed the review branch's changed-file set. |
| Python assertions checking R1-1, Z1, Z2, and Z3 against the current text | 0 | All seven assertions printed `True`. |
| Python search of Table G, Acceptance criteria, and Out of scope for `recordSkills`, `newly-accepted dream-created skill`, and `skill ownership registry` | 0 | No registry obligation found on any of the three contract surfaces. |
| `npm test -- --test-name-pattern 'dream-validate: a NEW dream-created skill is recorded'` | 0 | 108 test/file subtests reported, 108 passed, 0 failed; the shipped registry behavior is live in the existing validator test. |
| Python comparison of the report return type, G8, and its acceptance criterion | 0 | Confirmed `report.bytes` is optional, G8 requires it, and the decided-bytes criterion does not exercise it. |
| `npm run lint` | 0 | Markdownlint: 0 errors; frontmatter: 231 specs passed; shellcheck and PSScriptAnalyzer skipped because their local binaries are absent. |
| `git diff --check main...HEAD` | 0 | No whitespace errors. |
| Final `git status --porcelain` | 0 | Empty. |

### Content read through Bash

All content inspection was read-only and used `cat`, `sed`, `nl`, `grep`, `git show`, and short Python readers. The inspected inputs were:

- both target specs, in full and with numbered line ranges;
- `docs/runbooks/review-prompts/adversarial.md`;
- all `2026-08-28-promote-split*.md` logbook entries, including round zero, round 1 raw output, and dispositions;
- the shipped workspace, vault-write, baseline-delta, and skill-ownership-registry specs;
- `src/core/dream/validate.js`, `src/cli/dream.js`, `src/core/dream/delta.js`, `src/core/dream/vault-write.js`, `src/core/dream/workspace.js`, `src/core/reap.js`, `src/core/layout.js`, `src/core/digest.js`, `src/core/safety-profile.js`, and the cited skill/report text;
- relevant unit and integration tests, including dream validation, registry, transcript deferral, scratch integrity, and fake-brain fixtures;
- the pre-split spec from `main` via `git show`.

Two exploratory glob commands exited 1 because zsh found no files matching `docs/specs/done/WP-dream-promote*`; no conclusion relied on those failed probes. The relevant pre-split text was subsequently read directly with `git show main:docs/specs/WP-dream-promote-in-workspace.md`.

### Not run

- Full unfiltered `npm test`.
- The target specs' implementation verification commands, because their implementation deliverables do not exist yet and this was a read-only design review.
- Any destructive, staging, commit, checkout, or file-writing command.

No file in the checkout was created, edited, deleted, staged, or committed.

## LESSONS / GOTCHAS

- `WP-dream-promote-in-workspace`: replacing a monolithic validator requires enumerating its durable post-commit side effects, not only its gates and commit; acknowledging Step 6 in Current state does not assign it to the new pipeline.
- `WP-dream-promote-module`: carrying decided bytes must be outcome-sensitive; an optional field on a mixed success/refusal result does not guarantee bytes on the successful branches that enter the commit.

## FINAL READ-ONLY PROOF

Command `git status --porcelain` — exit 0, output empty.
