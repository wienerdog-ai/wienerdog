---
id: WP-dream-vault-write-primitive
title: Add the single identity-anchored primitive through which this family writes vault content
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: audit-2026-07-29
---

# WP-dream-vault-write-primitive: one chokepoint, anchored on identity rather than on names

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — why this package exists at all.** It was extracted by owner
ruling (round 2 of the promote-in pair, logbook:
`2026-08-21-dream-promote-pair-review-rounds.md`) after two consecutive
external review rounds landed on the same failure family. The rounds' findings
shared one shape: **the write barrier was specified in PATHS, while every
successful attack reached the vault by IDENTITY** — one name and another inode,
one lexical path and another resolved destination, one approved path and other
bytes. Each round was answered with another lexical rule and the next round
found the next identity vector. This package stops adding rules and adds a
single place where the question is asked correctly: *what object am I actually
about to write, and is THAT object allowed?*

It is deliberately small, has no dependency, and ships consumed by nothing —
`WP-dream-promote-in-workspace` is its first consumer. Contract table letters
are shared across the promote-in family; this spec owns **Table H**.

**Dispatch precondition.** Written against the tree at
`025021fc0fa8f871f1eb960a8ad57a14d223360e` (`025021f`), verified as
`origin/main` at authoring time. Before dispatch, re-run every `file:line`
citation and every measurement below against the tree the implementer will find
(`docs/specs/README.md` → Dispatch-time re-verification). A citation that does
not resolve blocks the dispatch. **Range citations are checked at BOTH ends.**

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its vault is the user's markdown memory —
their own data, edited by their own editor while our code runs. Several code
paths write into it, and a redesign in progress (`WP-dream-promote-in-workspace`)
adds one more: **promotion**, which copies approved content from a workspace
into the vault. Promotion runs in our own process with full filesystem rights,
so no harness sandbox constrains it; whatever discipline it has, it has because
this repo gave it.

Three defects measured on the tree show what "path-shaped" discipline misses,
and all three are in code that reads correct:

- **A path admitted by policy can resolve somewhere else.** A pre-existing
  symlink in the live vault — say `01-Projects/alias` pointing at
  `../reports/dreams`, or at `../.claude` — makes a lexically admitted
  `01-Projects/alias/evil.md` land in a directory policy denies. The existing
  containment check asks only whether the resolved object stays inside the
  vault (`src/core/dream/validate.js:624-650`), which it does.
- **A temp file written beside the target can BE a symlink.** The repo's
  publish precedent builds a predictable temp name and writes it with a
  following write (`validate.js:855-863`:
  `.${basename}.wienerdog-scrub.${process.pid}.tmp`, then `writeFileSync`), so
  a planted symlink at that path is followed and the victim is overwritten
  before the `rename` ever happens.
- **Approved bytes and committed bytes can differ.** Staging reads the working
  tree (`validate.js:1412`, `git add -A`), so a save landing between the write
  and the staging is what gets committed — content no gate ever saw.

The repo already solves this class in a different subsystem
(`src/core/private-fs.js:259-317`), and its own comment states the honest bound:
"pure Node cannot prevent" a post-creation substitution (`:270-277`). **This
package makes one vault-facing primitive the only way this family writes a vault
CONTENT file.** It is cited as PRECEDENT that the class is solvable to a stated
bound, not as a shape to copy: **round-4 CUT ruling (owner, 2026-08-27), how
this primitive achieves Table H's properties is the implementer's.** An earlier
draft said this package "adopts that precedent verbatim in shape" and thereby
imported the precedent's fail-open — a post-`rename` `lstat` failure it treats
as "best-effort detection — do not fail a legit write" (`:354-370`, round 4,
F5'').

**The enumeration that claim requires** (an unquantified "only way" is a hope,
not a contract): the vault content writers this family owns are (i) each
promoted note and (ii) the dream report — whose BODY the brain authors and to
which code appends its own accounting section (owner ruling on F2'', 2026-08-27;
`skills/wienerdog-dream/SKILL.md:409-425`), so it is two writes through this
primitive rather than one. Both go through
`writeIntoVault`; the report's own policy is the consumer's, not this module's
(`WP-dream-promote-in-workspace`, Tables D and E). Git's writes to the vault's
`.git` directory are not content files and are outside this contract.

**What this primitive does NOT establish, stated here because the repo has
already ruled on this exact class:** portable Node cannot bind a path's
component chain against concurrent replacement — `delta.js:22-40` (owner-ruled
2026-08-21) says it "cannot close that class without per-component `openat`,
which no `fs` API exposes", and hands its caller a checkable ordering
obligation instead. Row H3 inherits that shape: it narrows and it detects, and
it says so.

**The obligation is NOT discharged, and an earlier draft of this spec claimed it
was (round 4, corrected here).** The claim was that ordering discharges it —
that after the brain's process group is reaped no live actor holds vault write
access. Measured, that is false: the reap is scoped to the brain's process group
(`cli/dream.js:254-280`), and the run lock excludes another dream process, not
an editor. **The user's own editor is a live vault writer throughout, and the
whole three-way compare exists because it is** — a spec cannot rely on the
user's concurrency in one table and deny it in another. The truthful narrower
statement: the reap removes the BRAIN as a concurrent writer, and says nothing
about the user's editor or a file synchroniser. **So the component-swap race is
a family-level NAMED RESIDUAL, unclosed**, in the same class the delta
primitive already carries — bounded by requiring physical access to the user's
own account, which is not a boundary this project's threat model claims to
hold.

## Current state

- `src/core/dream/validate.js:624-650` — the containment helper: `realpath` of
  the target compared against `realpath` of the vault root, admitting anything
  that stays inside. Measured: it answers "inside the vault?", never "inside
  the ALLOWED part of the vault?".
- `src/core/dream/validate.js:855-863` — the publish precedent: predictable
  temp name, `writeFileSync`, `chmodSync`, then (`:890`) `renameSync`. The
  compare-then-write guard at `:884-890` re-reads the target and compares
  before renaming.
- `src/core/private-fs.js:259-317` — the hardened temp-create shape this
  package adopts: crypto-random name, `O_EXCL\|O_NOFOLLOW`, mode 0600.
  Private-core-facing; it does not write the vault and is not modified here.
- `src/core/dream/validate.js:1412` — `git add -A`, the staging call whose
  bytes are read from the working tree.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`; `:32-42` the defaults.
  Measured: `layout.js` validates each key's value independently and imposes
  **no cross-key distinctness**, so two keys may name the same directory.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/vault-write.js | the primitive and its policy hook (Table H) |
| create | tests/unit/dream-vault-write.test.js | Table H, including the three measured defects as red-side cases |
| modify | docs/GLOSSARY.md | one canonical name: **vault write** |

Nothing else. In particular this package does **not** re-point existing
writers: it ships consumed by nothing, exactly as the delta primitive did, and
its first consumer is `WP-dream-promote-in-workspace`. Retiring the old publish
path is that package's work, under its own boundary.

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
/** Write one file into the vault, deciding on the object rather than the name.
 *  The ONLY sanctioned way for this family to write a vault CONTENT file —
 *  promoted notes and the dream report alike. (Git writes the
 *  vault's own `.git` internals; that is not a content file and not this
 *  module's subject.) Refuses a symlink it can see, refuses a destination its
 *  caller's policy denies, and returns the bytes it published (Table H).
 *  @param {{vaultDir:string, rel:string, bytes:Buffer,
 *           admit:(resolvedRel:string)=>string|null,
 *           expect?:Buffer|null}} o
 *    rel     vault-relative candidate path, segment-validated before use
 *    admit   the caller's policy, applied to the RESOLVED vault-relative path,
 *            not to `rel`; returns a refusal reason or null. Injected so this
 *            module owns no policy and the caller owns no filesystem
 *    expect  the bytes the caller's decision was made against; when present the
 *            write is abandoned unless the target still holds exactly these at
 *            publish time (absent = the caller asserts the target must not
 *            exist)
 *  @returns {{written:true, bytes:Buffer, sha256:string}
 *           |{written:false, reason:string}}
 *    bytes  the exact buffer published — the caller stages FROM these, never by
 *           re-reading the path (Table H, row H6)
 *    sha256 a verification digest over them. NOT a git object id: the caller
 *           derives the repository-native blob id from `bytes` itself
 *    throws WienerdogError when the temp was SUBSTITUTED between creation and
 *    publish (H4) — detection, not prevention, and the state is already wrong */
function writeIntoVault(o)
```

## Contract reference

Activation (ADR-0031, 2-of-7 — five are true): (i) a new module interface
appears; (ii) a written/refused outcome taxonomy is introduced; (iv) refusal
behaviour is the module's whole subject; (v) the caller owns the policy whose
result this module records and enforces; (vi) at least one successor package
inherits this contract as its only write path.

### Table H — the vault-write primitive

| # | Fact / rule | Value |
|---|---|---|
| H1 | **Decide on the RESOLVED path, not the given one** | `rel` is first segment-validated (no segment equal to `.` or `..`, none containing a separator, none empty). The target's parent directory is then resolved (`realpath`), the resolved absolute path is expressed relative to the vault's own resolved root, and **`admit` is called with THAT** — so a caller's policy judges where the write actually lands. Measured motivation: a pre-existing vault symlink makes an admitted lexical path resolve into a denied directory, and the repo's existing containment check (`validate.js:624-650`) cannot see it because the resolved target is still inside the vault |
| H2 | **Containment is necessary but never sufficient** | the resolved path must remain inside the vault's resolved root — and passing that check decides nothing on its own; H1's `admit` on the resolved path is what admits. **No surface may describe containment as the barrier**: it rejects escapes from the vault, not writes into a denied part of it |
| H3 | **No write lands on or through a symlink** | if the target, or any component of the path from the vault root down to it, is a symlink, the call refuses. **NAMED RESIDUAL, not closed:** portable Node cannot bind a path's component chain against concurrent replacement — `delta.js:22-40` (owner-ruled 2026-08-21) says so and hands its caller an ordering obligation instead. This row DETECTS and NARROWS; it does not prevent. The reap removes the BRAIN as a concurrent writer and says nothing about the user's editor, which this whole design expects to be writing the vault (round 4, F3''). **How the refusal is achieved is the implementer's** — this row states only that it must happen |
| H4 | **The target is never observed holding a partial write** | a reader looking at the target at any instant sees either its previous content or the complete new content, never a prefix. **The mechanism is the implementer's** (round-4 CUT ruling): an earlier draft prescribed the temp's flags, its naming and its identity carry-through, and manufactured three contradictions doing so |
| H5 | **The publish is CONDITIONAL on the caller's premise still holding** | with `expect` present the write is abandoned unless the target still holds exactly those bytes; with `expect` absent it is abandoned unless the target does not exist. Abandonment is a refusal (H7), never a silent overwrite. **NARROWED, not closed:** a write landing between the check and the publish is still lost — a residual this row states rather than hides |
| H6 | **The caller never re-reads the path to learn what was published** | on success the return carries the exact bytes published, so a consumer that must act on them (staging, hashing, appending) acts on the returned value and not on a fresh read of a path another writer may since have changed |
| H9 | **Missing parent directories are created by this call, under H3's rule** | a promoted note may be the first file in a new tier subdirectory, and a caller that pre-creates parents would be writing the vault outside the primitive, which H8's enumeration forbids. A refusal leaves no partially-created chain behind |
| H10 | **A newly created file gets the process's ordinary default permissions, and the spec states ONE rule** | nothing here widens or narrows them. **The two-rule form this row carried is withdrawn (round 4, F8''):** "match the vault root" and "never wider than the umask" were measured mutually unsatisfiable — under umask `0077`, `mkdir 0755` yields `0700` and `open 0644` yields `0600`, so no implementation could satisfy both. A note the dream creates is no more sensitive than one the user creates in the same directory, and it should not be more surprising either |
| H7 | **Refusal is total and reported** | every failure path returns `{written:false, reason}`; nothing is partially written, and the temp is removed on every exit. The module throws only on a caller-contract violation (a `rel` that is not segment-valid, a missing `admit`), never on a policy refusal |
| H8 | **No policy lives here** | this module knows nothing about tiers, extensions, instruction files or report directories. It owns the filesystem discipline; `admit` owns the rules. That separation is the point of the extraction: the rules can be argued about and changed in one place, and none of those arguments can weaken the filesystem discipline by accident |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells
- [ ] `### Exact contracts`' signature and its return shape (H1's `admit`
      argument, H5's `expect`, H6's `sha256`)
- [ ] Acceptance criteria that assert Table H row by row
- [ ] Verification steps
- [ ] Current-state description (the three measured defects and the hardened
      precedent)
- [ ] Out of scope (what the consumer owns)
- [ ] **Every surface that says what this primitive guarantees** — the package
      note, the Context, rows H2, H3, H4 and H5, and the acceptance criteria.
      **No surface may call the compare→publish window "closed", describe
      vault-containment as sufficient, claim the component-swap race is closed,
      or claim substitution is prevented rather than detected. And no surface
      may say "the only way anything writes the vault" without the Context's
      enumeration of the content writers this family owns.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). No process is spawned: this module is filesystem calls only.
- **`O_NOFOLLOW` does not exist on win32.** State the platform condition where
  it bites rather than hiding it behind the `fs.constants.X || 0` idiom, which
  makes a missing flag look like a present one; `src/core/vault-snapshot.js:45-61`
  is the precedent that does this correctly and names what is lost. On win32 the
  H3 walk is what carries the weight, and the spec claims no cross-platform
  equivalence.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] `rel` is attacker-influenceable and flows into a filesystem write. It is
      validated **per segment** — no segment equal to `.` or `..`, none
      containing `/` or `\`, none empty — before any join, and the resolved
      result is re-checked against the vault's realpath at write time (H1, H2).
- [ ] The three defects this module exists to prevent are each a measured
      property of shipped code, not a hypothesis: the resolved-destination gap
      (`validate.js:624-650`), the followable temp (`:855-863`), and the
      working-tree staging (`:1412`).
- [ ] Named residual: the compare→publish window is narrowed, not closed (H5).
- [ ] Named residual, inherited from the ruling at `delta.js:22-40`: a parent
      component replaced between the walk and the open is followed, and
      portable Node cannot close that class (H3). **NOT discharged by ordering**
      — the reap removes the brain, not the user's editor, which the design
      explicitly expects to be writing the vault concurrently. Carried as an
      unclosed family residual.
- [ ] Named residual: substitution of the object between its creation and its
      publish is not prevented; H4 requires only that no partial content is ever
      observable at the target. Whether an implementation additionally detects
      such a substitution is its own choice and is not a contract here.
- [ ] Named residual: platform support for atomic no-follow opens is not
      uniform (win32 has no `O_NOFOLLOW`), so H3's refusal is stronger on some
      platforms than others; no cross-platform guarantee is claimed.

## Acceptance criteria

Every criterion below is a VISIBLE-BEHAVIOUR criterion. **Round-4 CUT ruling
(owner, 2026-08-27):** the mechanism-level criteria this section carried —
temp-name pre-emption, the post-`rename` `(dev, ino)` throw, the
`update-index --cacheinfo` rejection, the mode-versus-vault-root comparison —
are WITHDRAWN with the rows that prescribed them. They tested how, not what,
and five of round 4's nine findings existed only because they did.

- [ ] **H1 — the resolved path is what policy judges.** With a pre-existing
      vault symlink (`01-Projects/alias` → a directory the caller's `admit`
      denies), a write to `01-Projects/alias/x.md` calls `admit` with the
      RESOLVED path, and the write refuses. Proven RED against an
      implementation that passes `rel`.
- [ ] **H2 — containment alone admits nothing.** A resolved path inside the
      vault but denied by `admit` is refused.
- [ ] **H3 — nothing is written on or through a symlink.** A symlink anywhere
      in the parent chain, and a symlink at the target itself, each refuse with
      a reason, and the symlink's target is byte-unchanged. **No criterion
      asserts that a component swapped concurrently is caught** — measured, it
      is not, and the residual is H3's; a test claiming otherwise asserts
      something portable Node cannot deliver.
- [ ] **H4 — no partial content is ever observable at the target.** A reader
      sampling the target across a write sees either the old complete content
      or the new complete content. Proven RED against an implementation that
      writes the target in place.
- [ ] **H5 — the conditional publish.** With `expect` given and the target
      changed after the decision, the write is abandoned, `{written:false}` is
      returned, and the target keeps the changed bytes. With `expect` absent
      and the target existing, the write is refused.
- [ ] **H6 — the return carries the published bytes.** `bytes` equals the
      buffer passed in and `sha256` is over it; a target mutated immediately
      after the publish changes neither, so a caller acting on the return is
      never acting on another writer's content.
- [ ] **H9 — a missing parent chain is created.** Promoting
      `01-Projects/new-project/note.md` into a vault holding only
      `01-Projects/` creates the missing directory and publishes the note. With
      a symlink planted as one of the segments, the write refuses and follows
      nothing. A chain created for a write later refused is left in place, and
      the refusal names it.
- [ ] **H10 — a new note is no more restricted and no more exposed than one the
      user creates in the same directory**, compared against a file the test
      creates there by ordinary means under the same umask.
- [ ] **H7 — refusal leaves nothing behind and is total.** After every refusal
      path, the target directory contains no leftover file of this call's
      making and the target is unchanged. There is no exception: the
      throw-with-target-already-replaced case that H7 previously had to carve
      out was a consequence of the withdrawn mechanism (round 4, F9'').
- [ ] **This module has no policy and no process.** It requires no
      `child_process`, and no tier, extension or filename rule appears in it —
      asserted mechanically.
- [ ] Idempotence: `N/A — a vault write is not a repeatable command; H5's
      expect-guard is the property shipped in its place (a second identical
      write with the same expect is refused, because the target no longer
      holds the expected bytes).`
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24),
# so the pattern run is guarded by the deliverable's existence — the guard is
# what makes the deliverable-ABSENT state red instead of vacuously green.
test -f tests/unit/dream-vault-write.test.js && npm test -- --test-name-pattern "dream-vault-write"
npm test
npm run lint
test -f docs/GLOSSARY.md && grep -q "\*\*vault write\*\*" docs/GLOSSARY.md
```

- The pattern run and the glossary grep are NEW steps and each is an ASSERTION.
  Paste a real green on the finished state AND a real red from a deliberately
  broken state — `admit` called with `rel` instead of the resolved path; the
  temp created with a predictable name and a following write; the glossary
  entry removed. Verify each **also** goes red when its deliverable is ABSENT.

## Out of scope (do NOT do these)

- **Re-pointing existing writers.** `validate.js`'s publish path keeps working
  and is not touched here. `WP-dream-promote-in-workspace` is the first
  consumer and owns its own migration under its own boundary.
- **Any policy** — which directories, which extensions, which filenames. That
  is the consumer's `admit` (H8). This package may not grow a rule.
- **Staging or committing.** H6 returns the BYTES that make correct staging
  possible; deriving the repository-native blob id from them and the `git` call
  itself belong to the consumer.
- **The layout's cross-key overlap** (`layout.js` permits two keys naming one
  directory). Measured and recorded here because it is why a consumer's
  `admit` needs an explicit negative check, but changing `layout.js` is not
  this package's subject.
- **Closing the compare→publish window** — H5 narrows it and names the
  residual. A content-conditional replace does not exist at this layer.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): add the identity-anchored vault-write primitive (WP-dream-vault-write-primitive)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
