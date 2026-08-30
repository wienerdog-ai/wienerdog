---
date: 2026-08-19
title: "WP-validator-decided-bytes round 1 — architect's ruling on the seven findings"
related_wps: [WP-validator-decided-bytes]
---

# Round 1 — architect's ruling

**Why this record exists.** The runbook is explicit that findings are fixed by
**wd-architect**, never by the orchestrator inline
(`docs/runbooks/codex-review.md`, "Rules"). One session had drafted this spec,
relayed the gate, and then proposed its own design resolution to the owner —
the exact conflict the role separation exists to prevent. The owner caught it.
The design question was routed to the architect with the relay's measurements
marked as **claims to re-run, not facts**, and with the relay's two probe
scripts handed over so the instrument could be audited rather than trusted.

**Reviewed at:** `ced70d4`, branch `wp/validator-decided-bytes`. Nothing was
edited; the working tree was clean before and after.

**Owner ruling: all three acceptances granted** (2026-08-19) — the Q1
narrowing, the re-pinned round-2 fallback, and the id divergence disposed as a
noted defect plus a successor charter.

## Re-run report — the relay's seven claims

| # | Relay's claim | Verdict |
|---|---|---|
| 1 | No skill-id shape pattern anywhere in `src/` | HELD, with a correction that matters |
| 2 | The real id corpus is clean through `scanAndRedact` — 12 ids | HELD (conclusion); the instrument is not a measurement |
| 3 | Redacted **iff** an unbroken alphanumeric run ≥ 24 | **FAILED as stated** |
| 4 | `PATTERN_KEY_RE` is insufficient as an id constraint | HELD; wrong artifact cited |
| 5 | The other Tier-3 floor fields scan clean | HELD |
| 6 | The registry/commit id divergence is PRE-EXISTING | HELD — and now EXECUTED, not read |
| 7 | The divergence fails CLOSED in every direction | HELD — executed, both directions |

### Claim 3 — the one that came out differently

The relay stated an `iff` on length alone. The predicate is length **and**
entropy: `entropyPass` (`src/core/secret-scan.js:246`) gates on
`bitsPerChar(sub) >= ENTROPY_MIN_BITS_PER_CHAR` (3.5, `:24`) in addition to
`ENTROPY_MIN_LEN` (24, `:23`).

```text
clean     "id: abcabcabcabcabcabcabcabc"     24-char unbroken run
clean     "id: aaaabbbbccccddddeeeeffff"     24-char unbroken run
REDACTED  "id: a1b2c3d4e5f6a7b8c9d0e1f2"     24-char unbroken run
```

The relay's probe never tests a long *low*-entropy run, so the instrument could
not have found this. The relay's "the line contains a run" framing is also
wrong in kind: the predicate is on the run, not the line. **The error works
against the relay's own proposal** — the constraint (D) would need is a
function of two constants owned by `secret-scan.js`, not one.

### Claim 1 — the correction

No shape pattern is applied to a *skill id*, but `src/` carries four kebab-slug
grammars, one of them a genuine skill-name grammar the relay never found:

```text
src/core/transcripts/claude.js:73   SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
src/cli/schedule.js:968, :1060      /^[a-z0-9][a-z0-9-]*$/
src/core/dream/validate.js:364,:422 /^[a-z0-9][a-z0-9.-]{0,63}$/
src/scheduler/generators.js:308,:528,:534,:535
```

Every one admits `onboardingredesignproject`, which is redacted. So claim 4
generalizes: **no existing pattern in `src/` is sufficient**, because none
carries a max-unbroken-run bound. Claim 4 also cited the wrong artifact —
`PATTERN_KEY_RE` validates a ledger Pattern-Key heading (`:426`) and a
`revision_pattern_key` (`:364`), not an id. The conclusion survives; the search
did not.

### Claim 2 — the instrument

The corpus was re-derived rather than trusted. It is larger and messier than
12 — it includes `WP-example` (uppercase) and the placeholders `<unique-id>`
and `<name>-learnings`. No genuine frontmatter id trips the scanner, so the
conclusion holds. But a hand-curated 12-id shipped corpus is not a measurement
of the population that matters, and this package's own predecessor says so at
`docs/specs/done/WP-frontmatter-recognition-failopen.md:321`.

### Claims 6 and 7 — executed, on a real `validateAndCommit` run

```text
=== CLAIM 6 ===
reverted: []
secretRedactions: 1   secretReverts: 0
registry entry: {"created":"2026-07-11","id":"q7PmXz4KvR9tWc2LbN8dYfGh"}
committed blob id line: id: [REDACTED:high-entropy]
DIVERGENCE: true

=== CLAIM 7 ===
run2 reverted: [{"path":"05-Skills/hotid/SKILL.md",
  "reason":"skill id does not match the ownership registry (path reuse)"}]
run3 reverted: [{"path":"05-Skills/hotid/LEARNINGS.md",
  "reason":"learnings ledger parent skill id does not match the registry (path reuse)"}]
```

Both directions fail closed, executed, at `ced70d4` with no WP change. The
reported reason is also **false**: there was no path reuse.

`precommitSessionEdits` (`validate.js:122`) does an unconditional `git add -A`
plus commit of any dirty tree, called at `src/cli/dream.js:493` before the
brain; the last `restoreVaultToHead` is at `:550`, before `validateAndCommit`
at `:558`. **F1's exposure already exists** for the shipped secret-gate abort
at `validate.js:1286` — it is not a defect this spec introduces. `layout.js`
enforces no disjointness between `reports_dir` and the Tier-3 dirs (F3),
verified independently.

## Q1 — C3: NARROW, hard

**The seven findings are not seven. They are one, and it is C3's quantifier.**
C3 quantified over the commit's contents; the WP's actual authority is the
paths its own Tier-3 decision accepted. Everything between those two sets
belongs to someone else — the Step-4 report writer (F3), the ledger validator
(F4), git's content filters (F2), the CLI's abort recovery (F1), the EP2
gate's transaction (F5), and the residue bucket R3 was invented to name (F6).
The runbook's "two consecutive rounds of the same kind → a design question,
never another textual patch" is satisfied a round early and by a wider margin
than it was written for.

> **C3′.** For every path on which this run made an **accepting Tier-3
> decision**, the file's bytes immediately before the run stages for commit are
> byte-identical to the bytes that decision read. Otherwise the path is
> preserved with `quarantinePreserve(…, 'withheld')`, reverted, and reported
> with R2.
>
> **One carve-out:** the EP2 redact arm's in-place scrub (`:1250`) is the
> single authorized rewrite. A path the arm scrubbed keeps today's behaviour
> and is exempt. **No re-decision.**
>
> **Three named residuals**, in the Security checklist: the comparison is
> working-tree-to-working-tree and claims nothing about blob identity;
> `LEARNINGS.md` is `isTier3` but its acceptance comes from `ledgerViolation`,
> so it is outside C3′ and its TOCTOU exposure is disclosed unchanged; a
> `reports_dir` nested under a Tier-3 directory remains an unvalidated Tier-3
> write, pre-existing.

**Why narrow rather than drop.** The intent brief requires the ordering in
scope, and C3′ *is* the ordering — the decide-once doctrine stated over the set
the validator actually owns. **Why not keep and patch.** Keeping C3 whole
requires `src/cli/dream.js`, `src/core/layout.js`, a ledger-bytes contract, a
blob-level index-binding algorithm with `.gitattributes` tests, and a
cross-gate transaction: an L package assembled by review pressure, and L is
forbidden.

**The abort is deleted.** On a C3′ violation: preserve, then revert; if
preservation fails, revert anyway and append the already-shipped
`' (quarantine copy failed)'` suffix (`:1301`). Consistency with what the
product already does in the identical situation, and it disposes F1 without
touching `src/cli/dream.js`. **R3 is deleted** with its bucket. Table C stays
at three literals; the surface does not grow.

## Q2 — NEITHER (A) nor (D)

**The value question, answered.** The harm is durability plus a lying report,
not an authorization bypass — and it is reachable today with one missing
hyphen (`id: personalfinanceautomationroutine` produces a dead skill). Claim 6
is executed: the divergence exists at `ced70d4` with no WP change, and C2 does
not move it. **CLAUDE.md's rule applies exactly: a discovered pre-existing
defect is noted, not fixed.** It is also outside the intent brief.

**Not (A).** It works — simulated, durability restored — but it is
doctrinally self-contradictory inside a package whose thesis is *decide once,
no second read*. And its weakness is worse than the relay stated: measured,
two distinct skills both register as `[REDACTED:high-entropy]`, so (A) makes
distinct skills **share an id** — a new invariant break introduced to fix a
durability break.

**Not (D).** It is a numeric cross-module coupling, not an invariant: the
grammar would need a max-unbroken-run bound of `ENTROPY_MIN_LEN - 1` = 23 plus
awareness of the 3.5-bit floor, both owned by `secret-scan.js`. The relay's
"pin it with one test" asserts a property of `secret-scan.js` from
`validate.js`'s test file — machinery guarding a coupling, not a product
behaviour, which is the growth the runbook's convergence rule forbids. And the
predecessor already ruled on this rule class in this epic (`:321`): a shape
rule validated against a shipped corpus with an unmeasured user-vault
population. A rejected id is a *reverted* skill — a hard user-visible loss — so
(D)'s false-positive class costs more than the defect it fixes.

**The candidate the binary framing excluded — (E).** Make the EP2 redact arm
**decline Tier-3 paths**: a Tier-3 note with a redact-severity finding goes to
the withhold arm instead of being scrubbed. The divergence disappears at its
source, with no grammar, no second read, no new constant, no cross-module
invariant — one branch in one arm. Out of scope here (the queued EP2 packages
own it), which is why it belongs in the successor charter.

**Ruling: neither.** The spec gains a short *Discovered pre-existing defect*
note carrying the executed reproduction, and a successor charter weighing (A),
(D) and (E). Zero code, zero deliverables, zero verification steps.

## Q3 — scope

No new mechanism, so no new deliverable. All three stay `modify`. Two
reviewer-recommended additions are **explicitly refused**, with the reason
recorded in the spec: `src/cli/dream.js` (F1 is fixed by deleting the abort,
not by building a recovery protocol for it) and `src/core/layout.js` (F3 is
fixed by narrowing the quantifier; layout disjointness is a separate product
decision with its own value question). `src/core/frontmatter.js` stays out.

C3′'s comparison is a **verification** read (`Buffer.compare` against the
decided buffer), not a deciding read: it does not violate C2 and does not trip
the C2 grep. The residual window between that compare and `git add -A` is named
honestly — it shrinks from the whole run to the staging step, and closing it
further needs index plumbing that costs more than it buys.

## Disposition of round 1's seven findings

| # | Finding | Disposition |
|---|---|---|
| F1 | Abort lets the next dream precommit undecided bytes | **fix (by deletion)**; the pre-existing exposure on `:1286` → noted, not fixed |
| F2 | C3 equates working-tree bytes with git blobs | **fix + residual** |
| F3 | `reports_dir` under a Tier-3 dir | **fix (by narrowing) + residual** |
| F4 | `LEARNINGS.md` never gets the `:195` decision | **fix (by narrowing) + residual** |
| F5 | Redact re-decision is not atomic | **fix (by deletion)** — no re-decision |
| F6a | R3 false on reachable paths | **fix (by deletion)** |
| F6b | R1 fires on `LEARNINGS.md` while the malformed bytes are in the sibling `SKILL.md` | **fix** — the ledger site gets its own literal |
| F6c | R1 hides whether HEAD or the revision is malformed | **residual** |
| F7a | AC4 demands the opposite outcome from AC5 | **fix** |
| F7b | The C2 grep is defeatable | **residual** — a runtime read-count seam is machinery guarding machinery |

**Net:** 7 fixes, 5 named residuals, 0 drops, 0 new deliverables, 0 growth in
Table C, one fewer verification step. Size stays M, content materially smaller.

Splitting C1 out as an S package was considered and rejected: C1 and C3′ now
share Tables A and C, and splitting would mirror the reason-string contract
across two specs — the exact ADR-0031 problem the Contract reference exists to
prevent. The split is instead pinned as round 2's fallback.

## Where the architect disagreed with the relay

1. **The Q2 framing was wrong at the root.** (A) vs (D) is a binary over a
   defect that is pre-existing and fail-closed; the answer is neither, in this
   package. The binary also hid (E), which is smaller than both. A drafter
   proposing a resolution to their own draft is what the role separation
   guards against, and this is what it looks like: a question arriving
   pre-narrowed to two answers that both grow the package.
2. **Claim 3 was stated as measured and is wrong** — run partially, generalized
   fully.
3. **Claim 4 cited the wrong artifact**; the real precedent was never found.
4. **"C1 and C2 drew zero findings" is not accurate.** C1's *guard placement*
   drew zero; C1's *reason string* drew F6b and C2's *verification* drew F7b.
   That distinction is what says where Table C may grow (the ledger literal)
   and where it may not (the read-count seam).
5. **"Seven findings" is the wrong unit.** Six are one defect seen six times.
   Counting seven makes "patch all seven" look like a plan; counting one makes
   the narrowing obvious.
6. **A 12-id hand-curated corpus is not a measurement** — the predecessor's own
   closing lesson says why it cannot carry the weight (D) put on it.
