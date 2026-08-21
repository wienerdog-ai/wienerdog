---
id: WP-dream-vault-write-primitive
title: Add the single identity-anchored primitive through which anything writes the vault
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

The repo already contains the hardened shape for the second of these, in a
different subsystem: `src/core/private-fs.js:259-317` creates temps with a
crypto-random name and `O_WRONLY\|O_CREAT\|O_EXCL\|O_NOFOLLOW`. **This package
generalises that discipline into one vault-facing primitive and makes it the
only way anything writes the vault.**

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
 *  The ONLY sanctioned way to write the vault. Never follows a symlink, never
 *  writes outside the admitted region, and never publishes bytes it did not
 *  receive (Table H).
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
 *  @returns {{written:true, sha256:string}
 *           |{written:false, reason:string}}
 *    sha256 is over the bytes actually published — the caller stages FROM this,
 *    never from the working tree (Table H, row H6) */
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
| H3 | **No component may be a symlink at write time** | the parent chain from the vault root down to the target's directory is walked with `lstat`, and any symlink component fails the write closed with a reason — resolving is not enough on its own, because a resolved-then-swapped component is a race. A symlink AT the target itself is likewise refused: promotion replaces a note, never whatever a note points at |
| H4 | **The temp is created, never opened** | crypto-random basename in the target's own directory, `O_WRONLY\|O_CREAT\|O_EXCL\|O_NOFOLLOW`, mode taken from the target when it exists. The repo's own hardened shape (`private-fs.js:259-317`) is the model. **A predictable name with a following write is the measured defect this row exists to prevent** (`validate.js:855-863`): a symlink planted at that path is followed, and the victim is overwritten before any `rename` |
| H5 | **Publish is `rename`, after a conditional re-read — NARROWED, not closed** | when `expect` is given, the target is re-read immediately before the `rename` and compared byte-for-byte; a difference abandons the write and returns `{written:false}`. When `expect` is absent the target must not exist. **The residual is stated because POSIX offers no content-conditional replace:** a save landing between the re-read and the `rename` is still lost. The repo's precedent (`validate.js:884-890`) has exactly this window and shipped with it; this row narrows the same window and does not claim to close it |
| H6 | **The bytes published are the bytes returned** | `sha256` is computed over the buffer actually written, and the caller stages from that hash rather than re-reading the path. Measured motivation: staging that reads the working tree (`validate.js:1412`, `git add -A`) commits whatever the file holds at staging time, so a save between publish and stage enters the commit ungated. **This module does not stage** — it returns the value that makes correct staging possible, and the consumer's spec owns the staging call |
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
      note, the Context, rows H2 and H5, and the acceptance criteria. **No
      surface may call the compare→publish window "closed", and none may
      describe vault-containment as sufficient.**

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
- [ ] Named residual: `O_NOFOLLOW`'s absence on win32 moves the weight onto the
      H3 component walk; no cross-platform guarantee is claimed.

## Acceptance criteria

- [ ] **H1 — the resolved path is what policy judges.** With a pre-existing
      vault symlink (`01-Projects/alias` → `../reports/dreams`), a write to
      `01-Projects/alias/x.md` calls `admit` with the RESOLVED
      `reports/dreams/x.md`, and an `admit` that denies that directory refuses
      the write. Proven RED against an implementation that passes `rel`.
- [ ] **H2 — containment alone admits nothing.** A resolved path inside the
      vault but denied by `admit` is refused.
- [ ] **H3 — a symlink component fails closed.** A symlink anywhere in the
      parent chain, and a symlink at the target itself, each refuse with a
      reason; the symlink's target is byte-unchanged.
- [ ] **H4 — the temp cannot be pre-empted.** With a symlink planted at every
      name the implementation could choose, the write still refuses or creates
      its own file, and the planted symlink's target is byte-unchanged. Proven
      RED against a predictable-name-plus-`writeFileSync` implementation, which
      overwrites the victim.
- [ ] **H5 — the conditional publish.** With `expect` given and the target
      changed after the decision, the write is abandoned, `{written:false}` is
      returned, and the target keeps the changed bytes. With `expect` absent and
      the target existing, the write is refused.
- [ ] **H6 — the returned hash is over the published bytes.** The `sha256`
      matches the buffer passed in, and a target mutated immediately after the
      `rename` does not change it.
- [ ] **H7 — refusal leaves nothing behind.** After every refusal path, the
      target directory contains no temp file and the target is unchanged.
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
- **Staging or committing.** H6 returns the hash that makes correct staging
  possible; the `git` call belongs to the consumer.
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
