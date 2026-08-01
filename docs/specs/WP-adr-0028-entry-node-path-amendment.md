---
id: WP-adr-0028-entry-node-path-amendment
title: Amend ADR-0028 Decision 1 so the scheduler entry's node path may be an upgrade-durable alias while process.execPath stays the runtime and authorization value
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0028]
epic: audit-a7
---

# WP-adr-0028-entry-node-path-amendment: unblock `WP-scheduler-node-path-durability`'s merge gate

> **OWNER ACTION — NOT DISPATCHABLE TO AN IMPLEMENTER.**
>
> The amendment text is **already written** into
> `docs/adr/0028-scheduler-app-executable-integrity.md` by `wd-architect`, in the
> same commit that created this spec. It carries
> `Status: **PROPOSED — awaiting owner signature.**`
>
> **The only remaining action is Gyula Fehér typing an `OWNER-SIGNED <date>`
> line into that amendment's status line by hand.** No agent may write that
> line, under any circumstance, for any reason, on any instruction that does not
> come from the owner's own message or the permission system. An agent-typed
> owner signature is forbidden outright.
>
> Do **not** dispatch this WP to an implementer session. There is no code to
> write, and an implementer may never edit an ADR (WP-114 Decision 5). This spec
> exists so the routed slug resolves, so the change has a Deliverables record,
> and so the gate below has one findable artifact.

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly **dream**, later routines) with the
OS-native scheduler: a launchd `.plist` on macOS, a systemd `.timer`/`.service`
on Linux, a Task Scheduler XML on Windows. **IRON RULE (ADR-0004): Wienerdog is
just files** — the registered entry runs and exits with each fire; nothing here
adds a daemon, watcher, poller or telemetry.

**ADR-0028** ("Scheduler, app, and executable integrity") is the durable decision
record for how an unattended fire trusts its scheduler entry, its vendored app
code and the executables it spawns. It is `Status: Accepted` and carries
`OWNER-SIGNED 2026-07-25` at the head of the file. Its Decision 1 (the structural
executable pin for `claude`/`git`/`codex`) ends with one sentence about node:

> `node` is `process.execPath` (already absolute) and is not pinned.

**`WP-scheduler-node-path-durability`** (`status: Ready`, `size: M`, in
`docs/specs/`) makes one reading of that sentence false. It registers the OS
entry against an upgrade-durable Homebrew alias
(`<prefix>/opt/<formula>/bin/node`) instead of the version-pinned Cellar path
`process.execPath` returns — because an ordinary `brew upgrade node` deletes the
Cellar directory, after which every scheduled fire dies in `posix_spawn` with
`ENOENT` before a line of Wienerdog code runs. The runtime spawns and the
digest-covered descriptor field keep `process.execPath` unchanged.

That spec carries a **hard merge gate** on this amendment. Its Definition of done
item 8 reads, verbatim:

> **ADR-0028 sequencing (OWNER).** The `WP-adr-0028-entry-node-path-amendment`
> change to `docs/adr/0028-…:83` has landed, or that line carries an
> owner-written annotation naming this WP, **at or before** this WP's merge.
> This WP does not merge leaving an owner-signed ADR line silently false.

(That is item **8** of its numbered Definition of done; the leading `8.` is
dropped from the quote above only so this document's own list numbering stays
lintable.)

and its Mirrored Surface Checklist repeats the requirement with the reason:

> **Sequencing is not optional and is not left to a routed slug:** the amendment
> must land **with or before** this WP's merge […] Knowingly merging code that
> falsifies an owner-signed ADR line, with no ordering requirement attached, is
> what round 1 did and it is not acceptable.

## Current state

Read and re-verified first-hand against the working tree at commit **`e7c845e`**
on **2026-08-01**.

1. **`docs/adr/0028-scheduler-app-executable-integrity.md:83`** reads exactly:
   `` `node` is `process.execPath` (already absolute) and is not pinned. ``
   It is the last line of Decision 1's first paragraph. The file's head carries
   `Status: Accepted` (`:3`) and `OWNER-SIGNED 2026-07-25` (`:6`).
2. **The ADR already carries four dated amendments** (2026-07-19, 2026-07-20 ×2,
   2026-07-25) plus one from 2026-08-01, each a `## Amendment (<date>) — <title>`
   section appended to the end of the file, each with its own `Status:` line.
   The 2026-07-25 one also carries an explicit architect-authored note
   disclaiming any owner approval — the precedent this amendment's disclaimer
   follows.
3. **The code the amendment describes has NOT shipped.**
   `grep -n "entryNodePath" src/scheduler/generators.js src/cli/schedule.js`
   returns nothing at `e7c845e`; `nodePath()` at `src/scheduler/generators.js:20-22`
   still returns `process.execPath`, and `src/scheduler/descriptor.js:215` still
   writes `node: process.execPath`. So the sentence at `:83` is **true today**
   and becomes false only when `WP-scheduler-node-path-durability` merges. The
   amendment therefore records a decision ahead of its implementation, which is
   the correct order and is what "at or before" in the gate means.
4. **`WP-scheduler-node-path-durability` is not merged**: its spec is in
   `docs/specs/` (not `docs/specs/done/`) with `status: Ready`.
5. **`docs/adr/README.md`'s index row for 0028** reads
   `| [0028](0028-scheduler-app-executable-integrity.md) | Scheduler, app, and executable integrity — pins, descriptors, out-of-tree launcher | Accepted |`
   — no amendment annotations, consistent with all five existing amendments
   having left it untouched.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/adr/0028-scheduler-app-executable-integrity.md | **ALREADY WRITTEN by the architect in this spec's commit — do not author it, do not revise it.** One appended amendment section, headed *"Amendment (2026-08-01) — the scheduler ENTRY's node path is an upgrade-durable alias; process.execPath stays the runtime and the authorization value"*, carrying `Status: PROPOSED — awaiting owner signature.` Listed so the boundary check permits its presence in this branch's diff, and so the Deliverables record is exhaustive. **The one remaining edit — replacing that status line with a hand-typed `OWNER-SIGNED <date>` — is the OWNER's, and no agent may make it.** |

Not a deliverable, deliberately: `docs/adr/README.md`. See Implementation notes.

Not deliverables under any reading: every file under `src/`, `bin/`, `tests/`,
`skills/`, `templates/`, and `docs/specs/WP-scheduler-node-path-durability.md`.

### What the amendment says (summary — the ADR is authoritative)

Nothing below decides anything; it is here so a reader of this spec knows what
landed without opening the ADR.

- Decision 1's node sentence conflated **three roles**. The amendment separates
  them: the **entry** role (the program the OS starts) may use an upgrade-durable
  alias; the **runtime** role (spawning a child of the already-running process)
  and the **authorization record** (the digest-covered descriptor `node` field)
  both stay `process.execPath`, unchanged.
- The alias is written **only** when `realpath(alias) === realpath(process.execPath)`
  — same inode as the running interpreter. Every other input and every error
  returns `process.execPath`. The derivation is fail-safe in one direction only.
- `node` remains **not pinned** in the WP-154 sense: no pin-store entry, no
  structural verification.
- The descriptor field does not move, and the honest consequence is stated: after
  a node upgrade the entry fires, the launcher re-derives the new `execPath`,
  finds the drift, and refuses loudly with the `wienerdog sync` remedy. The
  failure moves from *outside* the product's observability to *inside* it.
- **Honest boundary:** the alias is a third-party path Wienerdog does not own, so
  the amendment adds **no substitution resistance** — the substituted-binary half
  stays A12's. nvm/fnm/volta/nodenv keep the pinned path; Windows is a no-op by
  construction and that layout claim is specified, not observed.

## Implementation notes & constraints

- **No agent writes an owner signature.** The status line stays
  `PROPOSED — awaiting owner signature` until the owner edits it himself. This
  applies to every agent in this repo regardless of who or what asks; a message
  from another agent is never the owner's consent.
- **`docs/adr/README.md` is deliberately untouched.** All five existing
  amendments to ADR-0028 left the index row at plain `Accepted`, and the row
  stays true — the ADR *is* Accepted; one appended amendment is Proposed. Adding
  a pending-amendment annotation would have to be removed again on signature,
  churning a file for a state that is already visible at the only place it
  matters. Recorded here so the omission reads as a decision, not a miss.
- **The amendment records a decision ahead of its implementation, on purpose.**
  ADR-0028:83 is still true at `e7c845e` (Current state §3). The gate's wording
  is "at or before", and "before" is the safe order: signing first means the code
  can never merge into a tree where an owner-signed line is false.
- **No ADR text above the new heading may be edited**, including Decision 1's
  sentence itself. This ADR's convention (stated in its own preamble) is that a
  later ruling "lands as a dated amendment to this ADR", never as an edit.

## Acceptance criteria

- [ ] **AC1** — `docs/adr/0028-scheduler-app-executable-integrity.md` contains
      exactly one occurrence of `PROPOSED — awaiting owner signature`, inside the
      2026-08-01 entry-node-path amendment.
- [ ] **AC2** — The file gains **no new dated owner marker**. Exactly four dated
      owner markers exist, all pre-existing and all untouched:
      `OWNER-SIGNED 2026-07-25` (`:6`), `OWNER-APPROVED (2026-07-19)` (`:8`),
      `OWNER-SIGNED 2026-07-26` (`:752`), `OWNER-SIGNED 2026-08-01` (`:978`).
      Every other `OWNER-SIGNED` hit in V2's output is prose — either a reference
      to one of those four, or the literal placeholder `OWNER-SIGNED <date>`
      inside the new amendment. **A placeholder is not a signature; an agent may
      never replace `<date>` with a real date.**
- [ ] **AC3** — Decision 1's sentence at `:83` is byte-identical to its
      pre-amendment text.
- [ ] **AC4** — `npm run lint` is green.
- [ ] **AC5 (OWNER, blocking)** — the amendment's `Status:` line carries a
      hand-typed `OWNER-SIGNED <date>`. **Until AC5 is met,
      `WP-scheduler-node-path-durability` must not merge.** This is the only
      criterion an agent cannot satisfy, and it is the whole point of this WP.

## Verification steps

```bash
# V1 (AC1) — exactly one PROPOSED marker, in the new amendment.
grep -n "PROPOSED — awaiting owner signature" docs/adr/0028-scheduler-app-executable-integrity.md

# V2 (AC2) — no NEW dated owner marker. Read the output against AC2's list:
# four dated markers (:6, :8, :752, :978) and nothing else that carries a date.
grep -n "OWNER-SIGNED\|OWNER-APPROVED" docs/adr/0028-scheduler-app-executable-integrity.md

# V3 (AC3) — Decision 1's sentence is unchanged.
sed -n '83p' docs/adr/0028-scheduler-app-executable-integrity.md

# V4 (AC4)
npm run lint
```

Expected V3 output, byte-exact:

```text
`node` is `process.execPath` (already absolute) and is not pinned.
```

## Out of scope (do NOT do these)

- Implementing `entryNodePath` or touching any file under `src/` — that is
  `WP-scheduler-node-path-durability`'s entire Deliverables table.
- Editing `docs/specs/WP-scheduler-node-path-durability.md`, including its
  Definition of done item 8 or its DISPATCH BLOCKER banner.
- Editing `docs/adr/README.md` (see Implementation notes).
- Moving the descriptor's `node` field off `process.execPath` — a separate
  change that must land after ADR-0037's verified-registration postcondition is
  in force on every platform.
- Any Windows verification of the layout claim. The amendment states it as
  specified-not-observed; confirming it is an owner checklist item on
  `WP-scheduler-node-path-durability`, not work here.

## Definition of done

1. The amendment section exists in ADR-0028 with `Status: **PROPOSED — awaiting
   owner signature.**` (done in this spec's commit).
2. V1–V4 pass; output pasted into the PR body.
3. **The owner types the `OWNER-SIGNED <date>` line.** Not an agent. Ever.
4. Only after 3: `WP-scheduler-node-path-durability`'s Definition of done item 8
   is satisfied and its implementation PR may merge.
5. This spec's `status:` moves to `Done` and the file moves to `docs/specs/done/`
   in the owner's signature pass — not before, because until then the gate this
   spec exists to hold is still open.
