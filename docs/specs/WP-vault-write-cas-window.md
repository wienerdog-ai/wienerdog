---
id: WP-vault-write-cas-window
title: Close or re-disclose the compare-and-swap window in the vault-write primitive's conditional publish
status: Draft
model: opus
size: M
depends_on: [WP-dream-vault-write-primitive]
adrs: [ADR-0004, ADR-0031]
epic: dream-promotion
---

# WP-vault-write-cas-window: the conditional publish compares, then renames

> **NOT DISPATCHABLE. This is a backlog entry, filed 2026-09-18, and it is not a
> design.** It records **one measured window**, **three disclosure sites** and
> **two candidate closures**, and it **takes no decision** between them. It has
> no Deliverables table, no contract tables, no acceptance criteria and no
> verification commands, and it has been through **no design round** — none was
> run and none was commissioned in the pass that filed it. **An implementer who
> reaches this file must stop and hand it back.** Only the architect or the
> owner matures it to `Ready`, and doing so means a design round first.
>
> **Why it was filed rather than folded into an existing package.** It is the
> residue left after `docs/specs/WP-ep2-atomic-withhold-handoff.md` was
> superseded on the same date: that stub's own subject — a withhold arm that
> reads a vault file and then destroys it — no longer exists in the tree, but
> **a different loss window does**, on a different arm and in a different file.
> Re-aiming that stub onto this window would have kept its file name and
> falsified every claim in it, so this is a new package.
> Narrative: `docs/specs/logbook/2026-09-18-ep2-atomic-withhold-handoff-superseded.md`.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process or
outlives its call. The nightly **dream** consolidates recent sessions into the
user's **vault**. Since `WP-dream-promote-in-workspace` the dream builds its
changes in a disposable **workspace** and then **promotes** what passes the
gates into the vault; it no longer edits the vault in order to un-do itself.

**Every vault content write goes through one primitive.**
`WP-dream-vault-write-primitive` (Done, `epic: audit-2026-07-29`) made
`writeFile` in `src/core/dream/vault-write.js` the single chokepoint, and states
its contract as rows **H1–H9**. Two of those rows matter here:

- **H5 — the publish is CONDITIONAL on the caller's premise still holding.**
  Quoted from that spec, row H5: *"with `expect` present the write is abandoned
  unless the target still holds exactly those bytes; with `expect` absent it is
  abandoned unless the target does not exist. Abandonment is a refusal (H7),
  never a silent overwrite. **NARROWED, not closed:** a write landing between
  the check and the publish is still lost — a residual this row states rather
  than hides"*.
- **H4 — no half-written file is ever visible.** The bytes are written to a
  temp object and the **rename is the publish**, so a reader sees the old
  content or the whole new content, never a prefix.

**The user's own editor is a live vault writer throughout.** That is not an
edge case this package invents; it is the stated premise of the primitive — it
is *why* the conditional publish exists at all — and it is carried as an
owner-ruled platform limit in the same family (`src/core/dream/delta.js:22-40`,
owner-ruled 2026-08-21: portable Node cannot bind a path's component chain
against concurrent replacement).

**`WP-dream-vault-write-primitive` explicitly declined to close this.** Its "Out
of scope" reads, verbatim: *"**Closing the compare→publish window** — H5 narrows
it and names the residual. A content-conditional replace does not exist at this
layer."* This package is where that declined work is parked.

## Current state — the window, measured

Read from `main` at `c05a575b`. `src/core/dream/vault-write.js`, inside
`writeFile`, the conditional branch:

- **`:437-442` — the CHECK.** `fs.readFileSync(targetLexical)` into `onDisk`,
  then `Buffer.compare(onDisk, opts.expect) !== 0` → refuse
  (`"<rel> no longer holds the bytes this write was decided against"`).
- **`:444-446` — the non-conditional arm's check.** With `expect` absent:
  `else if (targetNow) return refuse("<rel> already exists and this write
  asserted it would not")`.
- **`:452` — the ACT.** `fs.renameSync(tmp, targetLexical)`.

**Between the compare at `:442` and the rename at `:452` the primitive holds no
binding on the target.** A write that lands in that interval is overwritten by
the rename and is not recoverable from any artifact this call produces:
the call preserved nothing of the target, because its whole premise was that the
target still held `expect`. **This is check-then-act — a compare-and-swap whose
compare and swap are two separate syscalls with no atomicity between them.**

**It is narrowed, and the narrowing is real.** A vault change that is already
visible at the re-read abandons the write, so the window is bounded by the
instructions between the two calls rather than by the length of the run. It is
**not closed**, and no second read closes it: a second read only moves the
compare later.

### The three disclosure sites — the tree says so in its own words

These are the surfaces that currently state the residual. A package that closes
the window must retire all three in the same pass; a package that re-discloses
it must keep all three true.

| # | Site | What it says |
|---|------|--------------|
| 1 | `src/core/dream/vault-write.js:48-50` | the file's own limits block, limit **B**, `CHECK-TO-PUBLISH WINDOW`: *"The conditional publish compares immediately before the rename, so the window is small; a write landing inside it is still lost. Narrowed, not closed."* (the block header is `:48`; some earlier notes cite `:49`, which is the second line of the same three) |
| 2 | `src/core/dream/promote.js:1601` | *"The compare→promote window is NARROWED, not closed: a vault change visible at the re-read abandons the write and the path is refused, and a save landing between the re-read and the `rename` is the primitive's stated residual, inherited here unchanged."* |
| 3 | `src/core/dream/promote.js:1757-1761` | row **R4**: *"the file mutated between the read and the publish, or the primitive refused for any other reason. The vault object is left untouched … In this narrow window an overwrite would be the worse failure: it would clobber the user's edit."* |

A fourth surface states it as a contract row rather than as code: **row H5** of
`docs/specs/done/WP-dream-vault-write-primitive.md:217`, and its acceptance
checklist line at `:295`.

## The two candidate closures — recorded, NOT chosen

**No decision is taken here, deliberately.** Both candidates below are written
with what they reach **and what they do not**, because a candidate that only
looks windowless is worse than one that is honest about its width — the lesson
the superseded predecessor recorded against its own `O_CREAT|O_EXCL`
placeholder. Which of these to take, whether to take both on different arms, or
whether to re-disclose and close nothing, is the design round's first question.

**Candidate 1 — hold a descriptor across compare→rename.** Open the target
once, read the bytes for the comparison **through that descriptor**, and keep it
open until after the rename. *What it reaches:* the bytes compared are provably
the bytes of the object the call held, so an in-place editor's write is visible
to a post-rename check and the call can tell which object it compared. *What it
does NOT reach:* `rename(2)` resolves its destination **by path**, and portable
Node offers no rename-if-target-is-this-inode. An editor that saves by
atomic-rename puts a **new** object at the path, and the publish still overwrites
it. **So this narrows and re-shapes the window; on the evidence available when
this stub was filed it does not close it**, and any spec proposing it must say
so where it proposes it.

**Candidate 2 — publish by `linkat`/`O_EXCL` instead of by rename.** *Named
that way because that is how the closure is described elsewhere; what portable
Node actually exposes is `fs.linkSync` and `O_CREAT|O_EXCL`, and there is no
`linkat` binding in `fs` — a design round proposing this must say which call it
means.* `fs.linkSync(tmp, targetLexical)` fails `EEXIST` if anything is at the
destination, and `fs.openSync(path, 'wx')` (`O_CREAT|O_EXCL`) fails the same way
— both are **atomic create-or-fail** at the filesystem, with no separate check.
*What it reaches:* it closes the window **completely on the create arm** — the
`expect`-absent case at `:444-446`, whose premise is exactly *"the target does
not exist"*. Check and act become one syscall. *What it does NOT reach:* the
**overwrite arm** (`expect` present) still needs the old object to go away
first, and an unlink-then-link sequence reopens a window that is **wider** than
today's, with the target absent inside it. *Open sub-questions the design round
owns:* whether `link(2)` is available and atomic on the platforms this product
installs to (darwin, linux, win32 — `fs.linkSync` on win32 is a hard link and
its behaviour on the relevant filesystems is **unmeasured**); and whether H4's
no-half-written-file guarantee survives a publish that is not a rename.

**Candidate 0, which must stay on the table — re-disclose and close nothing.**
The three sites above already state the residual honestly. If the design round
finds neither candidate closes the arm that matters at a cost the product should
pay, **keeping the window and saying so is a legitimate outcome**, and the
package then becomes a documentation-and-test package rather than a code one.

## Open questions for the real spec

1. **Which arm is the subject?** The create arm and the overwrite arm have
   different premises, different candidates and possibly different answers. A
   spec that closes one and re-discloses the other is a valid shape; a spec that
   silently addresses one and speaks of "the window" is not.
2. **What does the closed form do when it refuses?** H7 owns the refusal
   taxonomy and H9 owns the empty-directory unwind. Any new failure mode
   (`EEXIST` from a link, a descriptor that cannot be held) needs its own
   outcome row inside that taxonomy, not beside it.
3. **How is the race tested deterministically?** The predecessor's correction
   applies unchanged: anchor the test to an **injection barrier at a point any
   implementation must have** — after the premise is established and before the
   publish — and not to `fs.renameSync` or `fs.readFileSync`, which a closure
   may remove. A test anchored to a call the design deletes fails for the wrong
   reason and proves nothing.
4. **Do the three disclosure sites retire, or get rewritten?** Whichever, they
   move **together and in the same pass**, and so do row H5 and its acceptance
   line in `docs/specs/done/WP-dream-vault-write-primitive.md` — as a dated
   erratum in that Done file, never as a silent edit.
5. **Is `promote.js`'s R4 outcome still reachable** once the window changes, or
   does it become machinery whose reason has gone? *Prefer the smaller design.*

## Out of scope

- **The EP2 withhold arm.** It neither reads nor destroys a vault path; see the
  superseded `docs/specs/WP-ep2-atomic-withhold-handoff.md` for the measurement.
  This package is about the **publish**, not the refusal.
- **The component-swap and unwind-identity residuals** (`vault-write.js:40-47`
  limit A, `:51-57` limit C). Different limits, owner-carried, and each one's
  disposition is `WP-dream-vault-write-primitive`'s.
- **Anything that starts a process, takes a lock daemon, or watches the vault.**
  ADR-0004 — Wienerdog is just files.

## Sizing — **M**, and provisionally

**M, for three reasons stated so the next reader can challenge them.** (1) The
change lands inside the **single chokepoint every vault content write goes
through**, so it must leave H3's symlink refusal, H4's no-half-written-file,
H7's refusal taxonomy and H9's unwind intact — four contract rows of a shipped
`Done` package, each of which has to be re-argued against the new publish. (2)
Both candidates behave differently on the two arms H5 distinguishes **and**
differently per platform, so the outcome matrix is a matrix, not a row. (3)
Whatever is not closed must be re-disclosed at **three registered code sites
plus a Done-spec erratum**, in one pass, under ADR-0031.

**Provisional.** If the design round finds the subject is the create arm alone
and candidate 2 is a one-call substitution with no new outcome rows, this splits
into an **S**. The architect re-derives the size when the design is taken; a
size on an undesigned package is an estimate, and this one says so.

## Definition of done

**Not yet written.** This stub is complete when the architect replaces it with a
full spec: a design round first, then a Deliverables table, contract tables for
the publish ordering and its failure modes, acceptance criteria, mutation rows
and literal verification commands.

**This spec stays `status: Draft`** and does not move to `Ready` until it is a
real spec and has been through the double gate
(`docs/runbooks/codex-review.md` plus wd-reviewer). Only the architect or the
owner flips it.
