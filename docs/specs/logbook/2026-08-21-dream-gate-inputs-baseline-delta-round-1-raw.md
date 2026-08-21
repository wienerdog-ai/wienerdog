---
title: Round 1 — external adversarial design review (raw), WP-dream-gate-inputs-baseline-delta
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. ONE deviation, declared:
     the reviewer quoted `git status -z` output containing a raw NUL byte; a NUL
     cannot be carried in a markdown record, so it is rendered as the literal text
     <NUL> in Finding 1's reproduction block. Nothing else was altered. -->

# Round 1 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, placeholders filled.
Spec at commit `3a7679a`. Base: `main` @ `e648284`.

Backend adaptation, recorded: the vendored prompt's `<structured_output_contract>`
requires JSON against a schema the plugin supplies. No schema reaches this backend,
so the dispatch asked for markdown carrying every field that contract requires
(file, `line_start`, `line_end`, confidence, the four numbered questions). The
contract's substance is unchanged and the prompt was not edited.

The dispatch carried the two-part split as a scope rule with four routed classes,
and named two focus targets: the decision-versus-enforcement boundary
(`isNew` vs `untracked`) and whether the mandated divergence proof discriminates
for all four gates. Read-only verified by the reviewer: `git status --porcelain`
empty before and after.

## Verbatim reviewer output

---

NO-SHIP — the spec's baseline/HEAD invariant is not guaranteed in production, and its divergence proof can pass while the Tier-3 substitution remains unimplemented.

## Finding 1 — A concurrent commit breaks the decision/enforcement invariant and can admit a skill rewrite that is currently reverted

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 164
- **line_end:** 201
- **Confidence:** 0.98

1. **What can go wrong?**
   A path absent from the captured baseline can be committed by the user while the brain is running, then modified by the brain before validation. The proposed decision side sees `isNew === true`, so the skill-body guard treats the path as synthesis and skips ownership and revision authorization. Git sees the path as tracked, and the current validator would run the revision guard and revert it. A floor-passing brain rewrite can therefore overwrite and commit over the user's concurrently committed skill even though today it is rejected.

2. **Why is this path vulnerable?**
   The assertion at line 201 that baseline and HEAD "coincide in production" is not enforced. `assertCleanTree` runs before the brain, but no contract pins HEAD for the rest of the run. The current source has a large interval between `assertCleanTree` at `src/cli/dream.js:494` and validation at `:558`. Git commits by the user or another process are not prevented during that interval.

   I reproduced the relevant current-validator state in a temporary repository outside the checkout:

   ```text
   headHasPath=true
   status=" M 05-Skills/newone/SKILL.md<NUL>"
   reverted=[{"path":"05-Skills/newone/SKILL.md","reason":"skill-body change on a skill not in the ownership registry (fail closed)"}]
   finalBody="user committed body"
   ```

   Under Table B's proposed semantics, a baseline captured before that concurrent commit has no entry for the skill, so `isNew` is true. The proposed replacement for the current `if (change.untracked) return null` therefore bypasses the guard.

3. **What is the likely impact?**
   A user-authored, concurrently committed skill body can be replaced by autonomous brain output and committed without ownership-registry or qualifying-learning authorization. This directly disproves the package's behavior-preservation claim and is a user-data integrity failure.

4. **What concrete change would reduce the risk?**
   Make baseline/HEAD agreement an enforced invariant rather than an assertion. Capture the expected HEAD identity with the baseline and fail closed, without destructive restoration, if HEAD changes before or during validation. If that cannot be made race-safe, the split must be revised so decision classification and restoration consume the same immutable baseline generation instead of mixing baseline decisions with live HEAD enforcement.

---

## Finding 2 — The required divergence proof cannot detect an unsubstituted Tier-3 floor

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 193
- **line_end:** 270
- **Confidence:** 0.99

1. **What can go wrong?**
   An implementation can replace the candidate list with the baseline delta but leave `tier3Decision` reading the live filesystem through `fs.readFileSync`. The mandated baseline-versus-HEAD fixture can still pass both its positive and negative halves, falsely claiming that all four substitutions were proved.

2. **Why is this path vulnerable?**
   The Tier-3 substitution is not baseline versus HEAD. It is:

   ```text
   live filesystem bytes -> DeltaRecord.afterBytes
   ```

   In the mandated fixture, `afterBytes` and the live file normally contain identical bytes. Diverging baseline from HEAD only changes whether the delta contains the path. Therefore:

   - the baseline-driven candidate list invokes the unchanged Tier-3 function;
   - the HEAD-driven negative omits the candidate;
   - the outcome flips even though `tier3Decision` still reads the filesystem.

   The negative instruction at lines 267-269 does not define a discriminating source for this gate: pointing the input back at HEAD tests candidate discovery, not the Tier-3 byte source.

3. **What is the likely impact?**
   The central proof can report all four gates migrated while one gate still has its old dependency. That is exactly the silent partial-substitution failure this package says its proof exists to prevent. The second package could then change write-target timing while relying on a migration that never actually happened.

4. **What concrete change would reduce the risk?**
   Require an independent Tier-3 discriminator in which `DeltaRecord.afterBytes` differs from the live file at decision time, or provide an equivalent injected decision seam. The required negative must demonstrate that restoring the filesystem read changes the result. Apply the same input-level standard to every multi-input gate: each named Table C replacement must discriminate independently, rather than accepting one gate-level outcome flip as proof of all substitutions in that gate.

---

## Finding 3 — Two function-range citations cross into the next declaration

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 81
- **line_end:** 91
- **Confidence:** 1.0

1. **What can go wrong?**
   The spec gives incorrect exact ranges for two cited functions.

2. **Why is this path vulnerable?**
   Verification against the pinned source showed:

   - `skillBodyViolation` is `src/core/dream/validate.js:320-413`; line 415 starts the next function's JSDoc, not `skillBodyViolation`.
   - `ledgerViolation` is `src/core/dream/validate.js:516-613`; line 615 starts the next function's JSDoc, not `ledgerViolation`.

   The spec cites `:320-415` and `:516-615`.

3. **What is the likely impact?**
   The spec's dispatch precondition explicitly says an unresolved citation blocks dispatch. These ranges also blur the exact boundaries an implementer is told to modify.

4. **What concrete change would reduce the risk?**
   Correct the ranges to `:320-413` and `:516-613`, then rerun the complete citation check against the dispatch tree.

## Routed (out of this package's scope)

### Routed citation finding — the cited EP2 Step 3 range ends before Step 3 does

- **Affected file:** `docs/specs/WP-dream-gate-inputs-baseline-delta.md`
- **line_start:** 92
- **line_end:** 100
- **Confidence:** 1.0
- **Not counted toward the ship/no-ship verdict.**

1. **What can go wrong?**
   The spec cites EP2 Step 3 as `src/core/dream/validate.js:1211-1345`, but the step continues through line 1364.
2. **Why is this path vulnerable?**
   Lines 1346-1364 still perform quarantine-copy comparison and disposal, append the revert record, update `secretReverted`, and increment `secretReverts`.
3. **What is the likely impact?**
   A review following the cited range can miss the tail of EP2 enforcement and bookkeeping.
4. **What concrete change would reduce the risk?**
   Correct the current-state citation to `:1211-1364`. Any behavioral changes in that enforcement tail remain routed to part 2.

No other routed issues were found.

## What I executed

All commands were run from the reviewed checkout.

- Read the target spec, all supplied round-zero records, all six cited source/test files, and the three process documents using `cat`, `nl`, `sed`, and `grep` — **exit 0**.
- Enumerated and manually checked the spec's `file:line` citations against numbered source — **exit 0**.
- `git diff --stat main...HEAD` and `git diff --name-only main...HEAD` — **exit 0**; only the target spec and three related logbook files differ.
- `npm test` — **exit 0**: tests 2048, passed 2039, failed 0, skipped 9.
- `npm run lint` — **exit 0**: markdownlint 0 issues; frontmatter passed; local shellcheck and PSScriptAnalyzer layers skipped because those binaries are unavailable.
- Ran a temporary-repository reproduction of current handling for a concurrently committed then brain-modified skill — **exit 0**; current code reverted it to the user-committed body.
- Ran a temporary-repository reproduction of staged-new decision/enforcement disagreement — **exit 0**; current enforcement attempted `git checkout HEAD` for a path absent from HEAD, threw, and stranded the staged file.
- Ran a temporary-repository check showing a clean `git status --porcelain` does not describe the tracked-path set — **exit 0**.
- Temporary repositories were created under the system temp directory and deleted.
- `npm run scenarios` was **not run**.

## `git status --porcelain` proof

Before — exit 0, output length 0 bytes. After — exit 0, output length 0 bytes.
The before and after outputs are byte-identical.

---

## Orchestrator spot-check (not the reviewer's words)

Per `docs/runbooks/codex-review.md` → Rules, every citation was re-run against the
tree before anyone acts on a finding.

| Reviewer claim | Measured | Verdict |
|---|---|---|
| `skillBodyViolation` ends `:413`, `:415` starts the next JSDoc | `:413` is its closing brace; `:415` opens `parseLedgerEntries`' JSDoc | **CONFIRMED** |
| `ledgerViolation` ends `:613`, `:615` starts the next JSDoc | `:613` is its closing brace; `:615` opens `resolveContainment`' JSDoc | **CONFIRMED** |
| `if (change.untracked) return null` at `:333` skips the guard | same; the fall-through reaches `tier3Decision` at `:1194` | **CONFIRMED** |
| HEAD is not pinned between `assertCleanTree` (`dream.js:494`) and `validateAndCommit` (`:558`) | no `rev-parse`, no HEAD capture, no re-assert in that interval; `validateAndCommit` re-asserts only `assertGitRepo` (`:1092`) | **CONFIRMED** |
| Routed: EP2 Step 3 runs past the cited `:1345` | **CONFIRMED, and the reviewer's own endpoint is also short.** The loop closes at `:1364`, but Step 3 continues to `:1372` (`pruneRedactedOriginals` `:1366`, the registry cleanup `:1368-1372`); Step 4's comment is `:1374`. Correct range: **`:1211-1372`** — not `:1345`, and not `:1364` |

**Orchestrator addition to Finding 1 (found during the spot-check, not reported by
the reviewer).** `change.untracked` has **seven** consumers in this file, and
Table C maps only two of them:

| Site | Role | Mapped in Table C? |
|---|---|---|
| `:333` skill-body guard synthesis-skip | decision | yes, to `isNew` |
| `:554` ledger append-only family gate | decision | yes, to `isNew` |
| `:1150` containment revert shape | enforcement | no |
| `:1176` A0 freeze revert shape | enforcement | no |
| `:1189` guard revert shape | enforcement | no |
| `:1196` floor revert shape | enforcement | no |
| `:1202` `change.untracked && isNewSkillDraft(...)` — **ownership-registry admission** | **neither: it decides durable state** | **no** |

The seventh is the sharp one. It gates whether a skill enters the tamper-proof
ownership registry (Step 6). Under Finding 1's race it flips the same way, so the
user's concurrently committed skill would be recorded as **dream-created** — which
authorises every FUTURE dream to revise it. That is a durable escalation of
Finding 1's one-run overwrite, and the spec's central contract row does not mention
the site at all.
