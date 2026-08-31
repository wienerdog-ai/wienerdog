# 2026-08-31 — PR #55, round 1: both gates, and the verification of their findings

**Tip reviewed:** `42056d6569f713af9d10936ac728027d9f357ba9`
**Merge base:** `152ae3a` — both gates ran on the SAME tip, as required.
**Read-only check:** `git status --porcelain` byte-identical (empty) before and
after BOTH runs. Both runs are valid.

## Verdicts

| Gate | Backend | Verdict |
|---|---|---|
| Spec-fidelity (merge gate) | wd-reviewer | **REQUEST-CHANGES** — 6 blockers, 8 residual/contract |
| Independent second opinion | gptsol / `pr-rubric.md` | **"patch is incorrect"** — 2×P1, 2×P2 |

Both gates executed the suite. Neither verdict is a reading.

## Gate 2's four findings — ALL FOUR VERIFIED BY THE IMPLEMENTER

Verified by measurement, not by reading, because a gate finding accepted on
prose is a finding nobody checked.

### 1. `hash-object --path` mutates the decided bytes — CONFIRMED (P1)

`src/cli/dream.js:234`. Measured in a throwaway repo carrying `* text=auto`:

```
decided bytes (CRLF) sha256 : 6612d9c9…
blob WITH    --path         : content sha256 e9024f1a…   <- MUTATED (CRLF -> LF)
blob WITHOUT --path         : content sha256 6612d9c9…   <- byte-equal
```

This is exactly the property row G8 and Table S require, defeated by the flag
added to satisfy a *different* property. `--path` buys nothing here: the mode is
already looked up separately via `ls-tree`.

**INDEPENDENT CONVERGENCE:** gate 1 found this too (its finding 10), from a
different starting point. Two gates reaching one defect by different routes is
the strongest signal this pipeline produces.

### 2. The index refresh DESTROYS the user's staged work — CONFIRMED (P1)

`src/cli/dream.js:259-260`. Measured:

```
user's staged blob before : "v2 THE USER STAGED THIS"
index after the refresh   : "v3 the dream promoted this"   <- OVERWRITTEN
```

**And the code comment beside it asserts the opposite** — "anything the user had
staged before the run stays staged" — which is false for precisely the paths in
the named set. A false comment on a data-loss path is worse than no comment.

**The irony is the lesson:** this refresh was ADDED to fix a real defect (without
it the run leaves every committed file showing as a staged deletion), and gate 1
called it "a genuinely good call". The fix introduced a data-loss regression on
the same row it was serving. A fix that is not itself adversarially reviewed is
just an untested change.

### 3. The refresh's failure is silent — CONFIRMED by reading (P2)

`allowFail: true` on the refresh, AFTER `update-ref` has already moved HEAD. A
held `index.lock` therefore leaves the run reporting success with the index
describing the old HEAD — the exact state finding 2's fix exists to prevent.

### 4. Non-regular scratch entries are enumerated by nobody — CONFIRMED (P2)

`src/cli/dream.js:79-82`. The RETIRED enumerator ended `else out.push(full)` —
every non-directory entry. Mine narrowed it to `else if (e.isFile())`. So a
brain-planted symlink, FIFO or socket in the read-only scratch dir is now seen by
no enumerator, deleted by `cleanScratch` at teardown, and produces **no
out-of-vault record at all**.

That is precisely the observability loss row G12 exists to prevent — "a
sandbox-policy breach that survives only in transient output" — arriving instead
as a breach that survives nowhere. It is also a silent narrowing of a durable
behaviour, the class Table V row V3 was extracted to catch.

## Gate 1's six blockers are ONE family

Criterion exists, code exists, assertion does not: rows G11 (both arms), G10,
G8's partial-publish clause, G5's only-copy teardown exception, G4's REDACTED
case, and the counts criterion's discriminating input.

**The gate reached the same conclusion independently:** if a second round lands
on this family again, the acceptance-criteria list needs a machine-checkable
criterion→test-name mapping, the way the mirror lists got
`scripts/mirror-walk.js` — not a third round of patching.

## The stop criterion, pinned

**Pinned AFTER reading gate 1, which is itself a process miss** — the PR #42
lesson says pin it BEFORE reading any gate (two rounds of patching produced four
product defects; one round of contract produced zero). Recorded rather than
quietly corrected.

> Patch the criteria family ONCE. If a second round lands on it again, extract
> the criterion→test-name mapping instead of patching a third time.

Gate 2's four findings are a DIFFERENT family — product defects, not missing
assertions — and are fixed regardless of that criterion.

## Routed to wd-architect (not fixable in this boundary)

- `neutralise()` duplicated in `dream.js` and `promote.js` with no single owner —
  one security contract, two code carriers.
- Table V row V1 contradicts row G12 on the changed-extract record. The code
  follows G12; V1's "Inherited by" cell is the stale mirror.
- Binary / non-lossless content used to reach a durable quarantine artifact and
  now reaches none, because `promote()` refuses before the gate. Same class as
  V3, and the TOCTOU logbook's own rule — "when a contract narrows a trigger,
  the record states the cause and names where the protection now lives" — was
  not applied to it.
