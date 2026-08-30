---
title: Round 7 — external adversarial design review (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE. Declared: empty-output fences rendered as
     (empty); the execution table condensed with every result preserved. -->

# Round 7 — external adversarial design review (raw), the REMOVAL-verification round

Backend: `gptsol`, English-pinned. Spec at `43162c7` (466 lines). Base `e648284`;
`main` `0d7de7c`. **The dispatch INVERTED the hunt**: six rounds had chased the spec
promising MORE than it delivers, and the change under review DELETED safety language by
owner ruling, so the reviewer was told the likely defect is now a removal that went one
row too far or a hand-off that cannot be discharged. Containment was declared out of
scope (it left the package by ruling). Both findings landed on the two predicted risks.

## Verbatim reviewer output

---

# NO-SHIP — the containment claim was removed, but the caller hand-off is not dischargeable and `O_NOFOLLOW` is now misclassified as mere accuracy hygiene.

## PART A — Was the removal executed correctly?

| # | Review item | Verdict | Evidence |
|---|---|---|---|
| 1 | No surviving surface claims containment, promises out-of-root exclusion, or implies universal `O_NOFOLLOW` | **FIXED** | The aggregate containment guarantee is consistently disclaimed. `O_NOFOLLOW` is conditioned on platform availability. The remaining symlink acceptance cases describe bounded behaviour for entries present during enumeration, not whole-walk containment. |
| 2 | Accuracy mechanisms retained, correctly re-justified, adequately specified/tested | **PARTIAL** | `O_NONBLOCK`, descriptor `fstat` and `(dev, ino)` retain clear purposes and coverage. `O_NOFOLLOW` does not fit the new rationale: on supported platforms it changes whether a final-component symlink can be opened at all. The executed same-inode relocation discriminator produced `ELOOP` with the flag; without it the descriptor remained regular, identity matched, and bytes were read. Calling this only "accuracy hygiene" UNDER-claims a real bounded defense, while the acceptance criterion no longer discriminates its presence. |
| 3 | Caller obligation stated in a dischargeable form | **NOT FIXED** | "Establish containment" is circular. The only concrete mirror says the tree must not be mutated "under it". That does not cover replacement of the ROOT ENTRY in its parent, or mutation of an ancestor used to reach the root. The executed root-entry relocation changed no descendant entry, yet all descriptor accuracy checks passed and bytes resolved outside the original lexical root. |
| 4 | No removal debris | **FIXED** | The containment checklist, acceptance criterion, security checklist and successor hand-off all point at current content. No criterion or cross-reference still depends on a deleted row. |
| 5 | Every citation resolves at both ends | **FIXED** | All ten cited ranges resolved at both endpoints. No cited source changed between `e648284` and `main`. |

## PART B — Fresh adversarial findings

**I could not construct a type (a) finding:** the current defects change what the specification claims is proven or tells a future caller to establish, not what an attacker can do in this unconsumed package.

### Finding 1 — The caller can satisfy the only concrete hand-off instruction without establishing containment
**`:131`, mirror `:313-320` · confidence 0.98 · (b)**

1. A successor can ensure no untrusted writer mutates entries BENEATH the tree, satisfy the security checklist's only concrete instruction, and still receive bytes from outside the intended root: the root entry itself can be moved from its parent and replaced by a symlink to the moved directory.
2. Table A says only that the caller "establishes containment", restating the desired outcome rather than defining a checkable obligation; the security mirror narrows it to "not being mutated under it", which excludes the root entry and its ancestors. Executed: after classifying `root/leaf.txt`, moving the entire root directory and replacing the original root entry with a symlink to it left every descendant unchanged, and the open still yielded a regular descriptor with `(dev, ino)` matching and the original bytes, while the resolved path lay outside the original lexical root — `{"rootEntryIsSymlink": true, "openedRegular": true, "devInoMatches": true, "bytes": "classified-bytes", "realpathInsideOriginalLexicalRoot": false}`.
3. The transferred obligation cannot be objectively discharged: a successor can implement the stated condition, believe the hand-off complete, and retain an exposure through the root or an ancestor. The disclaimer is honest but operationally ineffective.
4. Define the caller obligation as a checkable invariant over the ENTIRE RESOLUTION CHAIN, not just descendants: for the duration of each call the caller must either prevent an untrusted actor from replacing the root entry or any ancestor/directory entry used to reach enumerated paths, or provide a platform-specific mechanism demonstrating that returned objects remain bound beneath the intended root. This changes the hand-off wording; it does not require this primitive to implement containment.

### Finding 2 — The removal misclassifies and stops proving the bounded protection `O_NOFOLLOW` still provides
**`:130-131`, mirrors `:317-320`, `:350-356` · confidence 0.93 · (b)**

1. An implementer can treat `O_NOFOLLOW` as optional hygiene, or later remove it without an acceptance failure. A future caller can also build redundant final-component protection because the spec says none of these mechanisms is offered as a defense.
2. Its observable effect differs from the identity checks: on platforms that provide it, it atomically refuses a final-component symlink BEFORE opening the target, and `(dev, ino)` cannot reproduce that when the symlink points to the same relocated inode. Executed: `{"oNofollow": {"opened": false, "code": "ELOOP"}, "withoutNofollow": {"opened": true, "regular": true, "devInoMatches": true, "bytes": "same-inode"}}`. The current criterion tests an up-front symlink, FIFO non-blocking and identity mismatch — none fails if an implementation silently drops the flag.
3. The specification UNDER-claims what the module provides and leaves the retained flag without a discriminator, inviting duplicate caller machinery and permitting a future regression to remove a real protection while still passing.
4. State the smaller exact property — where the platform supplies `O_NOFOLLOW`, the open atomically refuses a final-component symlink; a bounded defense, not whole-path containment — and EXTEND the existing accuracy criterion with the named product behaviour: on a supported platform, a same-inode final-component symlink substitution must fail at open instead of yielding a descriptor. Preserve the no-whole-containment disclaimer.

## Routed

- **Aggregate containment**: the executed root-entry and leaf-relocation cases also show this module does not establish whole-path containment. Per the owner ruling that is routed to the successor and not counted.
- **Freshness / coherent snapshot**: concurrent creation, removal or anomaly-to-regular transitions can prevent one walk from representing a coherent instant; fixing it needs locking, generation tracking or revalidation. Routed.
- No further issue requiring a consumer, validator wiring, gate policy, git-execution seam, layout rule or audit-closure claim.

## What I executed (condensed; every result preserved)

Initial and final `git status --porcelain` — exit 0, empty, byte-identical. Read `CLAUDE.md`, all 466 lines of the spec, every round 0-6 raw and the full ledger, all permitted cited sources, the template and both runbooks **from `main`** — exit 0. Verified `HEAD=43162c7`, `main=0d7de7c`; inspected the exact `43162c7^..43162c7` removal patch; `git diff --check` clean; cited-source drift `e648284..main` none — all exit 0. Swept containment, `O_NOFOLLOW`, accuracy, caller, completeness, anomaly, `include`, binary and reference-judgment surfaces — exit 0. First citation checker exited 1 on my own Python quoting error; the corrected one passed all ten ranges at both endpoints. Reproductions all exit 0: root-entry relocation; same-inode final-symlink with and without `O_NOFOLLOW`; FIFO with `O_NONBLOCK` returning promptly and classified non-regular; `Object.freeze` throwing on a non-empty Buffer with a frozen `Map` still accepting `set`; pairwise binary in both directions; prefix boundary NUL@7999 binary and NUL@8000 text. Scratch outside the repository, deleted with absence checks. Full `npm test` and `npm run lint` NOT run — a read-only design review of an unimplemented specification.

---

## Orchestrator spot-check (not the reviewer's words)

Both findings reproduced independently. **Both CONFIRMED.**

| Claim | Measured | Verdict |
|---|---|---|
| Root-entry relocation defeats the narrow hand-off | `rootEntryIsSymlink: true`, nothing beneath changed, `openedRegular: true`, `devInoMatches: true`, bytes read, `realpathInsideOriginalLexicalRoot: false` | **CONFIRMED** |
| `O_NOFOLLOW` provides a bounded defense `(dev, ino)` cannot | with the flag `ELOOP`; without it opened, regular, identity matched, bytes read | **CONFIRMED — and finding 2 is MY error**, the inverse of every prior one in this package: six rounds removed over-claims, and my removal then dropped a real if narrow defense into a category that made it optional |

**This is the first round in which a reviewer, explicitly permitted to say so, reported
that no type (a) finding could be constructed.** That is the closure signal designed two
rounds earlier, and it arrived on its own terms rather than by exhaustion.
