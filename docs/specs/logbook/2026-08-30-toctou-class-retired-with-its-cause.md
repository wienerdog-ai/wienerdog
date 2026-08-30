# 2026-08-30 — a TOCTOU class retired with its cause, and where its protection went

**Subject:** `WP-dream-promote-in-workspace`, row G7's gate extraction.
**Status:** owner ruling. Recorded so a future reader does not read a narrowing
as a silent weakening.

## What narrowed

The EP2 gate's **preservation-failure abort** refuses the run fail-loud unless
some durable artefact holds the bytes being judged. Its DECISION is unchanged by
the extraction. Its **trigger set is smaller**, and two arms are now unreachable:

- "a durable copy exists but is of the **wrong bytes**"
- "the **identity read** cannot be performed"

## Why — the cause retired with the class

The shipped abort established recoverability by **RE-READING THE VAULT** and
comparing that read against the preserved copy. Two reads of a mutable path,
with a window between them, is a TOCTOU — and both arms above are that window's
outcomes: the file changed between the preserve and the compare, or the second
read failed.

The extracted gate is **HANDED** the bytes it preserves (`quarantinePreserve`
takes a buffer instead of a path to read), so the copy holds them **by
construction**. There is no second read to race and none that can fail.

**The class did not become unlikely. It became unrepresentable, because the act
that created it — the vault re-read — is gone.**

## Where the protection went

The thing those arms protected against — **a user save landing between the
judgment and the publish** — is real and still needs a guard. It is not this
package's:

| | |
|---|---|
| **Owner** | Table H row **H5**, `docs/specs/done/WP-dream-vault-write-primitive.md` |
| **Rule** | "the publish is CONDITIONAL on the caller's premise still holding — with `expect` present the write is abandoned unless the target still holds exactly those bytes" |
| **Asserted** | `tests/unit/dream-vault-write.test.js` — "H5 — with `expect` present the publish is abandoned unless the target still holds those bytes", and the `expect`-omitted arm beside it |
| **Residual** | H5 names its own: a write landing between the check and the publish is still lost. Stated, not hidden |

So the "did the package get the work?" test passes: the protection is **owned,
specified and asserted** one package over. `WP-dream-promote-in-workspace`
**CITES** it and does not re-assert it — a second copy of that assertion in
`tests/unit/dream-validate.test.js` would be a drifting duplicate of a contract
this package does not own.

## What is asserted here instead

The trigger that REMAINS, in **both directions**:

1. **both preserves failed → fail-loud refuse** (FI-12, FI-14), with the note's
   bytes intact and no commit — and row G5 then extends it to the workspace: a
   run that aborts here does NOT tear down.
2. **a durable copy exists → recoverable, no abort** — the redact copy written,
   the scrub falling through, the withheld preserve failing. The run refuses the
   note, and the surviving copy is announced on the **preservation record**
   rather than in a refusal reason, which is row G7's one authorized carrier
   change.

## The rule this entry is an instance of

**When a contract narrows a trigger, the record states the CAUSE that retired
with it and NAMES where the protection now lives.** A narrowing recorded only as
"these cases no longer fire" is indistinguishable, six months later, from a
weakening nobody caught.
