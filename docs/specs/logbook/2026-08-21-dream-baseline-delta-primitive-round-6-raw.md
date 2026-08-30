---
title: Round 6 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Declared: empty-output fences rendered as
     (empty); the execution table condensed with every result preserved. -->

# Round 6 — external adversarial design review (raw)

Backend: `gptsol`, English-pinned. Spec at `a6b80cb` (478 lines). Branch base
`e648284`; `main` `0d7de7c`. Dispatch carried the frozen-surface and REPEAT-KIND
constraints, the required (a)/(b) classification, permission to state plainly that no
type (a) could be constructed — and, for the first time, **the evidence-reach rule
landed on `main` that morning, quoted verbatim and made a review criterion**, since
this spec was written before it existed.

## Verbatim reviewer output

---

# NO-SHIP — the byte-preservation fix is complete, but the platform ruling overclaims that win32 gains no capability; same-inode leaf relocation passes every specified check and exposes out-of-root bytes.

Five prior rounds produced thirteen findings: eleven type **(b)** and two type **(a)**. This round constructs one additional type **(a)** finding.

## PART A — Round-5 fixes and owner ruling

| Item | Verdict | Evidence |
|---|---|---|
| Byte-preserving reference output | **FIXED** | `:240` requires raw-byte comparison, adds a non-NUL invalid-UTF-8 corpus member, and explicitly forbids round-tripping reference output through a string. The differential remains conditioned correctly for pairwise `binary`, `addedLineNumbers` and derived scan text. I reproduced the motivating case: git retained `0xff`; UTF-8 decoding produced `efbfbd`; the round trip did not equal the raw output. No remaining reference-output surface permits string decoding for the byte-identity comparison. |
| Platform ruling | **NOT FIXED** | The explicit branch and zero-fallback prohibition are present at `:132`, but the substantive claim is false for the full contract. On the no-`O_NOFOLLOW` branch, relocating the already-classified leaf outside the root and replacing its old path with a symlink preserves `(dev, ino)`. Both a pre-open and a post-open realpath check can be raced. In both executed reproductions, all specified checks passed and the descriptor returned the relocated out-of-root bytes. **This is not inode reuse.** Several registered mirrors also still imply unconditional leaf no-follow (`:129-131`, `:354-365`); they do not carry the win32 residual required by `:254-261`. The security mirror at `:310-325` repeats the false "no capability is gained" conclusion. No read occurs *before* identity validation; rather, identity validation SUCCEEDS because relocation preserves identity, and the read then occurs. |

## PART B — Fresh adversarial round

### Finding 1 — The win32 fallback permits a same-inode leaf relocation to return out-of-root bytes
**`:129-132` · confidence 0.99 · (a) changes what an ATTACKER CAN DO · repeat-kind: fifth containment-family finding, therefore a DESIGN QUESTION, not another patch recommendation**

1. On a platform without `O_NOFOLLOW`, an attacker can move the classified leaf itself outside `rootDir`, put a symlink at the original path, and cause the primitive to read the relocated file through that symlink. The opened object is the same inode captured during classification, so `(dev, ino)` validation succeeds. The resulting bytes came from an object now outside the claimed root.

2. **The round-5 measurement changed two relevant facts at once:** it replaced the leaf symlink with a *different file*, then concluded that `(dev, ino)` always refuses the fallback. That evidence reaches only different-inode substitution. It does not reach the broader claim that no capability is gained. **The newly landed evidence rule on `main` catches exactly this gap: if the conclusion were false, that measurement would not have shown it.**

   I executed both possible realpath orderings:
   - **Realpath before open:** verify the original leaf inside the root, then relocate that leaf and replace it with a symlink. The open follows the symlink; `(dev, ino)` matches; the descriptor reads the relocated bytes.
   - **Realpath after open:** open through the symlink, then replace the pathname with an ordinary in-root file before realpath validation. Realpath reports inside; `(dev, ino)` still matches the opened relocated object; the descriptor reads different bytes from those currently at the validated pathname.

   In both runs the moved path was outside the root, the opened and classified identities were equal, and the read returned the classified-but-relocated bytes. No inode reuse was involved.

3. The primitive can include bytes from outside `rootDir` while reporting them under an internal relative path. This breaks the containment and attribution properties the baseline exists to provide, and invalidates `:129` (leaf symlinks never followed, target bytes appear nowhere), `:130` (a path becoming a symlink never yields bytes), `:131` (no symlink followed at the leaf), `:132` (no capability gained on win32; only residual is inode reuse), `:319-320` (`(dev, ino)` refuses before any read) and `:354-365` (the leaf no-follow acceptance contract holds across the classify/read gap).

4. This requires an owner-level design decision because it is the fifth containment-family result. Current portable-Node mechanisms cannot establish the stated guarantee when `O_NOFOLLOW` is absent. The owner must choose between **accepting and naming the win32 same-inode leaf-relocation residual** — removing every "no capability gained" and unconditional leaf-no-follow claim and carrying the weaker contract through all registered mirrors — **or selecting a mechanism that binds traversal to verified directory descriptors** (per-component `openat` through native support), which conflicts with the zero-dependency constraint. After that ruling, extend the existing classify/read-gap criterion rather than adding a new gate. The product behaviour guarded is: **a classified leaf relocated outside the root must not contribute bytes under the original internal path.**

## Routed

**Empty.** I found no issue requiring a consumer, wiring, freshness/locking/generation mechanism, file-selection policy, validator gate, git-execution seam, layout rule, gate-policy tuning, or audit-closure claim.

## What I executed (condensed; every result preserved)

Initial status/branch/HEAD/`main` capture — exit 0 (HEAD `a6b80cb`, `main` `0d7de7c`, status empty). Read `CLAUDE.md`, the complete 478-line spec, all round 0-5 raw logs and the full disposition ledger, all cited sources, the template and both runbooks **from `main`** — exit 0. Every cited source range checked at both endpoints — exit 0, all resolve. Source drift `e648284..main` — exit 0, no cited source changed. Swept all `O_NOFOLLOW` and containment mirrors — exit 0. Reproductions, all exit 0: invalid-UTF-8 reference-output loss (raw `ff`, decoded U+FFFD, round trip false); `Object.freeze` on non-empty Buffer threw and bytes stayed writable, frozen `Map` accepted `set`; git binary prefix boundary (NUL at 7999 binary, 8000 and 9000 text); pairwise binary judgment both directions `-\t-`; nested-directory enumeration `EACCES`; invalid-UTF-8 filename refused `EILSEQ` on this filesystem; no-`O_NOFOLLOW` leaf case with a DIFFERENT target — identity mismatch refused before read; **same-inode leaf relocation with realpath before open — identity matched, relocated out-of-root bytes read**; **same-inode leaf relocation with realpath after open — realpath reported inside, identity matched the opened relocated object, out-of-root bytes read**. All `/tmp/wienerdog-r6-*` scratch verified deleted, exit 0, zero leftovers. Full test and lint suites NOT run — this was a read-only design review with focused behavioural reproductions instead.

## Read-only proof

Before and after `git status --porcelain` byte-identical and empty.

---

## Orchestrator spot-check (not the reviewer's words)

**CONFIRMED by independent reproduction, and it refutes MY round-5 measurement.**
Running the contract's full sequence on the no-`O_NOFOLLOW` branch after moving the
classified leaf out and symlinking its old path to it:

```
openSucceeded:                 true
isRegularFile:                 true
devInoMatchesEnumerated:       true      <-- the identity check PASSES
realpathNowResolvesInsideRoot: false
bytesReturned:                 "CLASSIFIED-INSIDE"
bytesCameFrom:                 .../outside/leaf.txt
CONTRACT_VERDICT:              ALL CHECKS PASS -> bytes accepted
```

Every specified check passes and the bytes come from outside the root. No inode reuse.
The only thing that catches it is the realpath check, which this spec itself calls racy
defense in depth and explicitly not a guarantee — and the reviewer raced both orderings.

**The classification reverts from (b) to (a), and my round-5 downgrade was wrong.** That
reverses the distinction I myself drew when arguing the downgrade mattered: a (b) can
close as a named residual, an (a) cannot. The fourth containment finding therefore did
not legitimately close, and the owner's platform ruling was made on a basis I supplied
and which is false.

**The error mechanism, named by the rule that landed the same morning.** My round-5
measurement moved two things at once — it changed the leaf to a DIFFERENT FILE while
testing the NO-FLAG branch — so it attributed nothing about the branch, only about
different-inode substitution. *If my conclusion were false, would that measurement have
shown it?* No. It could not have. **Seventh instance of the family, and the first that
reached the owner AND was ruled on.**

**On the rule's own evidence, with its caveat.** I argued before this round that a clean
round 6 must not be read as "the rule works". This round is not clean: the rule was
cited by name to diagnose a real defect in a real measurement, in its first round in
force. That is a stronger data point than anything previously available — with the
honest qualification that the reviewer was TOLD about the rule in the dispatch, so it is
salience-assisted, not a cold catch. Recorded as evidence with that attached, never as
vindication.
