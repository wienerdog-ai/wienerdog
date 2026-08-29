---
id: WP-dream-promote-module
title: Build the promotion module — decide, gate, merge and publish, consumed by nothing
status: Ready
model: opus
size: M
depends_on: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive]
adrs: [ADR-0004, ADR-0012, ADR-0020, ADR-0031, ADR-0034]
epic: audit-2026-07-29
---

# WP-dream-promote-module: the promotion decision, shipped consumed by nothing

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Package note — the module half of the promote split.** This WP and
`WP-dream-promote-in-workspace` are one design, split along the seam the owner
ruled at the PR-review gate (logbook:
`2026-08-21-dream-promote-pair-review-rounds.md`, "Owner ruling on the
verdicts"): **Tables C, D, E and R become this `promote.js` package, shipped
consumed by nothing; Table G becomes the pipeline package.** The split's input
record is `2026-08-28-promote-split-inputs.md` and the split's own decisions are
recorded in `2026-08-28-promote-split.md`.

**Contract table letters are family-wide. The canonical map lives in ONE surface
— `docs/specs/logbook/2026-08-28-promote-split.md`, "THE CANONICAL TABLE-LETTER
MAP" — and this spec CITES it rather than restating it.** It was restated in three
specs until the PR gate found two of them stale; a cut that moves a table now
updates that one table and nothing else. Every cross-package reference cites its
owner and never restates it.

**This package ships consumed by nothing**, exactly as `delta.js` and
`vault-write.js` each did at their own merge (`delta.js` has since gained one:
`workspace.js:63` consumes `captureBaseline`, while `computeDelta` is still
called by nobody). It creates one module and its test; it changes
no call site, retires no code path, and leaves the running dream byte-identical.
Its first and only consumer is `WP-dream-promote-in-workspace`, which wires it
into the run under its own boundary.

**This spec owns the DECISIONS and owns no filesystem discipline**: every vault
byte it publishes goes through the primitive's `writeIntoVault` (Table H), and
its policy reaches that primitive as the injected `admit` callback.

## Dispatch precondition

**Written against the tree at `36c2ce51562aadb3eea83ccfe51a40bc728d9680`
(`36c2ce5`), verified as both `main` and `origin/main` at authoring time.** All
three dependencies are `Done` on that tree. Before dispatch, re-run every
`file:line` citation and every measurement below against the tree the
implementer will find (`docs/specs/README.md` → Dispatch-time re-verification).
A citation that does not resolve blocks the dispatch. **Range citations are
checked at BOTH ends.**

**Containment semantics are stated by CITATION, and no surface here paraphrases
a path-containment rule (owner ruling, 2026-08-28).** The shipped truth is
kernel-faithful resolution plus `(dev, ino)` identity. It is owned by **Table H**
(`docs/specs/done/WP-dream-vault-write-primitive.md`, rows H1 and H2) and
implemented in `src/core/dream/vault-write.js` and `src/core/dream/workspace.js`
(`isAtOrBeneath`, exported). The reason this is a ruling rather than a
preference is recorded in `memory/lessons/inbox.md` under
`WP-dream-workspace-retarget`: **every string answer to "is this path inside
that directory" is wrong** — substring, separator-splitting, case-folding and
both of Node's own path resolvers each failed, in both directions — and eleven
review rounds went into the answer that holds. Re-deriving it in prose is how
those eleven rounds get paid for twice.

Note for the re-verifier: the superseded filter-out design
(`WP-dream-fence-candidate-set`, `WP-dream-denied-object-disposal`, and their
two parent specs) is filed in `docs/specs/done/` as `Superseded`, with its round
records in the logbook. Nothing here depends on it and nothing here may build on
it.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** (ADR-0012) spawns a
headless AI brain, lets it write notes, and then runs a code validator that
classifies every write, reverts what fails policy, and makes one commit in the
vault. Today that classification derives its evidence from git in the vault — a
namespace that already holds the user's data, written by the brain itself.

Two packages have already inverted the write direction. `WP-dream-workspace-retarget`
built the **workspace**: the system copies the vault's readable content into a
private directory, captures the exact bytes it just wrote as a **constructed
baseline**, and `spawnBrain` takes the workspace as its write target. What it
deliberately did NOT do is flip the running pipeline — its transitional call-site
argument still passes the vault, because a brain writing into a workspace nothing
promotes is an inert product. `WP-dream-vault-write-primitive` then built the one
sanctioned way to put a content file into the vault (`writeIntoVault`, Table H):
it decides on the resolved object rather than the given name, never writes on or
through a symlink, never lets a reader see a partial write, publishes only while
the caller's premise still holds, and returns the bytes it published.

**This package builds the decision layer between them.** Given the run's
constructed baseline, the delta of what the brain wrote, and the live vault, it
decides per path what happens — promote, promote a merged version, or
refuse-and-report — runs the four policy gates on the bytes that would actually
be published, publishes what survives through the primitive, and composes the
dream report's enforcement record. **Filtering out becomes promoting in.** It
ships with no caller: `WP-dream-promote-in-workspace` is the package that makes
it true of the running product.

One audit finding closes with this module's mechanism, and the closure names the
mechanism that prevents it rather than the policy that catches it. **M7** (a
hostile `CLAUDE.md` persists in the vault and re-steers later runs,
`docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md:676-752`): the
brain cannot write the vault at all, and promotion admits paths by a positive
allowlist (Table C, row C9) rather than denying two known filenames — the file
never comes into existence in the vault. **M10** (the dream writes `.gitignore`
and blinds every gate, `:931-989`) closes with the git-free classification the
pipeline package runs, and is that package's to claim: no surface here may claim
it, and none may attribute it to any repository-status property of the workspace
(sibling Table F measures the latter unestablishable).

## Current state

- **Nothing of this module exists.** `src/core/dream/promote.js` and
  `tests/unit/dream-promote.test.js` are created here.
- `src/core/dream/vault-write.js` (481 lines) — `writeIntoVault`, this module's
  only route into the vault. **Its signature is read from the code by path at
  dispatch, and from its spec's `### Exact contracts` block, rather than
  restated here** (`docs/specs/done/WP-dream-vault-write-primitive.md`).
- `src/core/dream/workspace.js` — `createWorkspace`, `destroyWorkspace` and the
  exported containment helper `isAtOrBeneath`. This module calls none of them;
  the containment helper is named only as the implementation of the rule the
  Dispatch precondition cites.
- `src/core/dream/delta.js` — `captureBaseline` and `computeDelta`, git-free,
  spawns nothing. **`computeDelta` still has no consumer**; this module is the
  first code to read its records, and the pipeline package is the first to call
  it. A binary record deliberately carries no line numbers, so the consumer
  "withholds what it cannot scan" (`delta.js:517-520`) — Table D turns that into
  a refusal.
- `src/core/dream/validate.js` (1469 lines) — the four gates as they exist
  today, all deriving their evidence from git in the vault: ledger validation
  (`ledgerViolation`, `:1156`), the ADR-0020 skill-body guard
  (`skillBodyViolation`, `:1187`) and the Tier-3 floor (`tier3Decision`,
  `:1194`) inside Step 2's per-path classification (`:1144`); the EP2 secret
  gate as Step 3 (`:1211`), whose shipped redact arm is at `:1269-1291`, whose
  separate counters are at `:1064-1072`, whose unscannable-binary refusal is at
  `:1239-1255`, and whose revert core is at `:1324-1364`. **None of these is
  modified here** — Table D states the input and order this module applies to
  the gates it is HANDED, and extracting the real gate functions into that shape
  is the pipeline package's work. Step 4 appends the enforcement section to the
  dream report (`:1374`), interpolating two brain-influenceable values per line
  (`:1385-1386`). The repo already reasons about case-insensitive
  instruction-file matching at `:1083-1086`.
- `src/core/digest.js` — `sanitizeProjectName` (`:414-418`), exported at `:867`.
  **Named here only because the T1 cut moved its consumer**: the sanitizer
  neutralises the report's code-authored section, which is
  `WP-dream-promote-report`'s. This package uses it nowhere.
- `src/core/layout.js:21-29` — the seven `LAYOUT_KEYS`. `:32-42` — the defaults.
- `skills/wienerdog-dream/SKILL.md:409-425` — the shipped skill requires the
  BRAIN to author the dream report body, including a `## Gated out (and why)`
  section naming candidates the brain did not write.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/promote.js | three-way decide + gates + merge + publish, for ordinary notes (Tables C, D, E, Q and S). **NOT the report — `WP-dream-promote-report` adds it** |
| create | tests/unit/dream-promote.test.js | Tables C, D, E, Q and S |
| modify | docs/GLOSSARY.md | one canonical name: **promotion** |

**Nothing else, and the exclusions are load-bearing.** This package does not
modify `src/core/dream/validate.js` and does not modify `src/cli/dream.js`: it
ships consumed by nothing, so the running dream is byte-identical after it
merges. Retiring the git-derived gate evidence, removing the EP2 enforcement
half, and wiring the run are all `WP-dream-promote-in-workspace`'s work under
its own boundary.

If a further file appears necessary, that is a finding, not a fix: record it
under "Discovered issues" in the PR body.

### Exact contracts

```js
/** Decide, per changed path, what happens to it — and promote what survives.
 *  Pure decision first, writes second: **every POLICY decision** in the run —
 *  allowlist, merge, all four gates — is made before any vault byte is written
 *  (Table E). **NOT every decision**: the primitive's `expect` guard is
 *  necessarily per-path at publish time, so a path can still become
 *  refuse-and-report during the write phase, after earlier paths are published.
 *  @param {{vaultDir:string, workspaceDir:string, date:string,
 *           baseline:import('./delta').Baseline,
 *           delta:ReturnType<import('./delta').computeDelta>,
 *           layout:import('../layout').VaultLayout,
 *           gates}} o
 *    delta  the run's classified changes, computed by the CALLER. Passed in
 *           rather than computed here because the caller needs the same result
 *           for its own non-vacuity decision (`WP-dream-promote-in-workspace`,
 *           Table G) and computing it twice
 *           would let the two answers disagree
 *    date   the run's date, which names the report `<reports_dir>/<date>.md`
 *           (Tables D and R). Supplied rather than derived so the module reads
 *           no clock
 *    gates  the four decision functions of Table D, injected rather than
 *           imported so `promote.js` does not depend on `validate.js`. Their
 *           inputs differ BY GATE, and Table D owns them: the EP2 secret gate
 *           judges the delta's added lines against the baseline BEFORE the
 *           merge; the other three judge the MERGED candidate bytes, and the
 *           skill-body guard additionally takes the BASELINE ledger as its
 *           authorizing input. The three post-merge gates return a refusal
 *           reason or null; the EP2 gate returns the ADR-0034 taxonomy, and
 *           **each arm carries the metadata the report needs — Table Q owns
 *           the shape and this block does not restate it.**
 *           **Preserving the unredacted copy to quarantine is the EP2 GATE's
 *           own act, not this module's** — the module consumes the disposition
 *           and knows nothing about the state directory, but it DOES consume
 *           what the preservation produced, because the report line is the
 *           user's only route back to their copy (Table Q)
 *  @returns {{promoted:Array<{rel:string, bytes:Buffer}>,
 *             redacted:Array<{rel:string, bytes:Buffer,
 *                             lines:number, labels:string, artifact:string}>,
 *             refused:Array<{rel:string, reason:string}>,
 *             secretDisposition:{withheld:number, redactions:number}}}
 *    **Every published entry carries BOTH halves — `rel` AND `bytes`.** Table S
 *    owns why the bytes are required and this block does not restate it; the
 *    PATH half is required here because a consumer that has bytes without a path
 *    cannot stage, count or register them, and prose saying "per path" does not
 *    make a type carry one. **Pass (c)'s finding: the T1 cut removed this whole
 *    `@returns` block along with the report field, and Table S alone required
 *    `bytes` without ever requiring `rel`** — the path half of round 1's fix was
 *    unenforced for one round.
 *    `redacted[]` additionally carries the EP2 accounting Table Q row Q1 defines
 *    — the scrubbed-line count, the detector labels, and the artifact name the
 *    gate returned — because those reach the report and cannot be recomputed.
 *    **`report` is NOT in this package's return — `WP-dream-promote-report`
 *    adds it.** This module publishes ordinary notes and composes no report
 *    secretDisposition is the typed signal the pipeline's transcript-advance
 *    consumes (`WP-dream-promote-in-workspace`, Table G) — never a parsed
 *    refusal reason. ONLY `withheld`
 *    defers a transcript; `redactions` is accounting (the sanitized note WAS
 *    promoted, so its transcript was consumed — `validate.js:1064-1072`).
 *    Named `withheld`, not `reverts`: promotion never wrote the bytes, so
 *    there is nothing to revert */
function promote(o)
```

## Contract reference

**Reading order, and one name that is no longer here.** The owner's seam ruling
named four tables "C, D, E and R"; **Table R has since been cut to
`WP-dream-promote-report` by the T1 tripwire**, so this spec owns C, D, E, Q and
S. Q and S were added later — S by the ADR-0031 circuit-breaker (round 2), Q in
pass (b) — and each sits after the table it generalises. A "Table R" reference
in this spec is a CITATION of the report package.

Activation (ADR-0031, 2-of-7 — five are true): (i) a new module interface
appears; (ii) a promotion outcome taxonomy is introduced; (iv) refusal and
fallback behaviour changes across four gates; (vi) the pipeline package inherits
this contract; (vii) the gate order is mirrored in the tests and the dream
report.

### Table C — the promotion decision

The three-way state triple per relative path: **baseline** (what the sibling's
copy-in wrote), **after** (the workspace now), **vault-now** (the live vault at
decision time). **Rows C1–C8 are the evaluated conditions**, top to bottom,
first match decides. C9 is the definition C1 refers to, and M1–M3 are mechanics
that apply to whichever row selected them; none of those four is itself a
condition.

| # | Condition | Outcome |
|---|---|---|
| C1 | the path is not admitted by the promotion allowlist (row C9) | **refuse-and-report.** No content is PUBLISHED to the vault. **What a refusal may leave behind is bounded by the primitive on BOTH sides, and this row cites both rather than restating either (corrected 2026-08-28; the pre-split form cited H9 alone and its "no CONTENT is written" clause was arguable):** the DIRECTORY side is H9's — empty directories the call created are unwound, one that acquired content or failed removal for a platform reason is left and NAMED; the STAGING-OBJECT side is H7's — at most one object of that call's making, in the target's own parent directory, may survive an unwritable-parent refusal, holding the REFUSED payload, and the refusal NAMES it. **The H7 acceptance criterion in the primitive's spec is the single surface that enumerates and counts those cases; this row defers to it and states no number.** The consequence this package must carry is in Table E's staged-bytes row: a refused staging object sits where a wholesale `git add -A` would sweep it into the commit, which is one more reason the commit is built from the primitive's returned bytes and named paths |
| C2 | delta status is `deleted` (present in baseline, gone from the workspace) | **refuse-and-report — promotion never deletes.** The vault keeps the note. Named rather than traded off: a deletion is unrecoverable and the brain has no business making one |
| C3 | delta status is `added` and `vault-now` has no such path | **promote** the workspace bytes (Table E's write) |
| C4 | delta status is `added` and `vault-now` HAS the path | **refuse-and-report.** The user created a note at that path during the run; the brain's version does not displace it |
| C5 | delta status is `modified` and `vault-now` bytes equal `baseline` bytes | **promote** — the user did not touch it, so there is nothing to merge |
| C6 | delta status is `modified` and `vault-now` differs from `baseline`, and the three-way merge exits clean | **promote the MERGED bytes** |
| C7 | delta status is `modified`, `vault-now` differs, and the merge conflicts | **refuse-and-report. The note stays in the USER's live version** |
| C8 | delta status is `modified` and the path is gone from `vault-now` (the user deleted it during the run) | **refuse-and-report** — modify/delete is a conflict, and the user's deletion wins |
| C9 | **the promotion allowlist — this spec's `admit`, applied by the primitive to the RESOLVED path** | **Where it is applied is part of the rule.** C9 is handed to `writeIntoVault` as its `admit` callback, and the primitive calls it with the path the write actually resolves to, never the candidate path (Table H, row H1). Measured motivation: a pre-existing vault symlink — `01-Projects/alias` → `../reports/dreams`, or → `../.claude` — makes a lexically admitted `01-Projects/alias/evil.md` land in a denied directory, and vault containment alone cannot see it because the resolved target is still inside the vault. **Matching is CANONICALISED then CASE-FOLDED, in that order:** the primary filesystem is case-insensitive — measured, a file created as `claude.md` answers to `CLAUDE.md` — so a literal comparison admits `agents.override.md` while the harness still loads it as an instruction file (the repo reasons this way already at `validate.js:1083-1086`). Case folding alone is not enough either: macOS enumerates decomposed names while accepting composed ones, and measured, `nfc.toLowerCase() === nfd.toLowerCase()` is FALSE for the same directory inode — so an instruction-file basename spelled composed and the same name spelled decomposed are one file that rule (c)'s deny-list would match in one form and miss in the other. **Every comparison in this row — the tier prefixes, the ADMITTED `reports_dir` prefix, the basenames and the segment names — normalises to NFC first**, and so does every layout value it compares against. With that settled, a path is admitted when ALL hold: (a) it is under one of the layout's writable tier directories — `identity_dir`, `daily_dir`, `projects_dir`, `skills_dir`, `inbox_dir` (`layout.js:21-29`; `daily_filename` is not a directory) — or under `02-Areas/` or `03-Resources/`; **or under the layout's `reports_dir` — which is ADMITTED, not denied (owner ruling, 2026-08-27). The shipped skill requires the brain to author the report (`skills/wienerdog-dream/SKILL.md:409-425`), so the report is brain content and must be admitted here;** (b) its final component ends in `.md`; (c) its basename is not one of the current harness instruction-file shapes — `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `AGENTS.override.md` — at any depth, AND no path segment is `.claude` or `.codex`, AND the basename is not `.mcp.json`. (a) and (b) are a positive allowlist and close the class M7's remediation asks for — a vault-root `CLAUDE.md`, a `.gitignore`, a `.claude/settings.json` and an Obsidian plugin binary are all outside it without anyone enumerating them. (c) is a **named deny-list of the CURRENT conventions: the product itself already treats `AGENTS.override.md` as a live shadowing convention (`src/adapters/codex.js`), and `CLAUDE.local.md` / recursively-discovered `.claude/**` are current Claude conventions — so `.md` is not a safe content-only extension, and this list is stated as one that will not cover the NEXT convention.** It exists because (a) and (b) cannot reach an instruction file written inside a tier directory |
| M1 | Merge mechanics | **Merge on a COPY; promote only on a clean merge.** Measured on git 2.50.1: `git merge-file` exits 1 and writes conflict markers **INTO the target** — for a divergent edit and for modify/delete alike — so merging on the user's live note would violate the very guarantee refuse-and-report exists to keep. Clean divergent edits exit 0 with correct merged bytes |
| M2 | The merge's git invocation | The merge exit code is a security decision (clean → promote), so the invocation takes the dependency's **constructed-environment** discipline verbatim (`WP-dream-baseline-delta-primitive`, its own Table C — a different spec's letter-space, not row C1-C9 here): an environment BUILT from nothing rather than filtered, config and attribute roots pointed at directories this run created empty, a cwd outside any repository, and the verified absolute executable via `spawnPinnedSync` (`src/core/exec-identity.js`). **This spec does not restate that recipe — the dependency owns it, and its spec is a Done record on main: `docs/specs/done/WP-dream-baseline-delta-primitive.md`, Table C.** Measured here as corroboration, not as the guarantee: an armed `merge=` driver via `core.attributesFile` does not reach `merge-file`, and a hostile global config did not move an exit code. That enumeration is not trusted — this program's record at enumerating git's influence channels is 0 for 4, which is precisely why the answer is construction rather than a blocklist. **Named residual, inherited:** absolute verified invocation prevents PATH selection of an impostor; it does not freeze the executable's bytes. **The cwd rule is also this module's share of CLAIM 2b** (sibling Table F, row 2b) — the merge is the only git this module runs, and it never runs it with a cwd at or beneath the workspace root. The product-wide form of that claim is the pipeline package's |
| M3 | Repository attribute sensitivity | **DISCHARGED here, as the dependency required.** The dependency named this as the successor's obligation. Discharged structurally: classification is `computeDelta`, which is git-free and reads no attributes; the workspace contains no `.git` (sibling Table A, Postcondition 1); and the only git this package runs against workspace content is the merge, under the constructed roots above. There is no path by which a repository attribute reaches a promotion decision |

### Table D — the four gates: input and order

Today all four derive their evidence from git in the vault (`validate.js`
Steps 2 and 3). Under this design none of them consults git: the secret gate
judges the brain's added lines against the baseline, and the other three judge
the MERGED candidate bytes — which include the user's diverging edits, and are
therefore exactly what would be promoted. The **order inverts** relative to
today: today the secret gate runs LAST (`:1211`, after Step 2's three); here it
runs FIRST.

**This table states what `promote()` does with the gates it is HANDED.** The
gates are injected (`### Exact contracts`), so this package proves the order and
the input routing against injected gates, and never touches `validate.js`.
Extracting the real four into this input shape, and deleting the enforcement
half that reverts and re-stages (`:1324-1364`), is
`WP-dream-promote-in-workspace`'s work under its own boundary — **a named
handoff, not an omission.**

The EP2 gate is not a two-value gate. Per binding ADR-0034 its disposition is a
**taxonomy**, not `reason|null`: a context-free high-entropy hit is REDACTED,
not refused — the unredacted copy is preserved to quarantine, the added lines
are scrubbed, the sanitized candidate is promoted, the redaction is reported,
and it is counted separately from a hard refusal (`validate.js:1269-1291` is the
shipped redact arm, `:1064-1072` its separate counters). So EP2 returns one of
{pass, refuse-with-reason, redact-with-sanitized-bytes}; the other three gates
stay `reason|null`.

**Unscannable content is a REFUSAL, never a pass.** The delta primitive returns
no line numbers for a binary record — deliberately, so the consumer "withholds
what it cannot scan" (`delta.js:517-520`) — and an EP2 gate defined only over
added lines would see an empty scan and pass it, after which nothing else stops
an ordinary `.md` and it is promoted raw. Today's validator does the missing
work explicitly (`validate.js:1239-1255`: binary staged content "cannot be
secret-scanned; not committed"), so passing it would be a regression against
shipped behaviour. **A delta record marked binary, or carrying bytes that are
not lossless UTF-8, is refused by EP2 with that reason** — the empty scan is
never evidence of safety.

| Gate | Today | Decision input here | Position | Refusal remedy |
|---|---|---|---|---|
| EP2 secret gate (ADR-0034) | `validate.js:1211` — `git add -A` then `git diff --cached --numstat` per path | the delta's `addedLineNumbers` and derived scan text over the workspace's after-bytes vs the baseline — exactly the bytes this run is responsible for, which is the same property the staged-diff form had | **BEFORE the merge** | **per ADR-0034's taxonomy:** a hard secret → withhold from promotion + preserve to quarantine; a context-free high-entropy hit → **redact** (scrub the added lines, preserve the unredacted copy to quarantine, promote the sanitized candidate, report it, count it separately). Both quarantine writes are the GATE's own act, not this module's — **and what they PRODUCE (the artifact's actual name, the scrubbed-line count, the labels) travels back in the gate's result: Table Q owns that shape, and the only-copy invariant Q4 binds every party that could destroy a working copy.** **There is nothing to revert**, because nothing was written to the vault: the enforcement half that reverts, re-stages and drops index entries (`:1324-1364` is its revert core) has no subject and goes — in the pipeline package. **No line count is stated here** |
| Skill-body guard (ADR-0020) | `validate.js:1187` `skillBodyViolation(vaultDir, rel, change, layout, registry, date)`, which additionally reads `HEAD:<rel>` (`:340`) and `HEAD:<ledgerRel>` (`:398`) | **the merged candidate skill bytes, the BASELINE skill bytes, the BASELINE ledger bytes, the ownership-registry snapshot, `rel`, `layout`, and the run date.** **Its authorizing input is the BASELINE ledger, never the post-brain one** — otherwise the brain authorizes its own skill rewrite within a single run. The two `HEAD:` reads become baseline reads; nothing else about the gate changes | AFTER the merge | refuse-and-report; the note stays in the user's live version |
| Tier-3 floor | `validate.js:1194` `tier3Decision(vaultDir, rel)`, which reads the file | **the merged candidate bytes, plus `rel` and `layout`** — enough to establish whether the gate applies at all. The frozen A0 profile it consults is process state, not run evidence, and is unchanged | AFTER the merge | refuse-and-report |
| Ledger validation | `validate.js:1156` `ledgerViolation(vaultDir, rel, change, layout, registry, extractsBySession)`, which additionally reads `HEAD:<rel>` (`:555`) and this run's extracts (`:600`) | **the merged candidate ledger bytes, the BASELINE ledger bytes, the paired SKILL.md bytes selected by the atomicity row's pair decision, the ownership-registry snapshot, THIS RUN'S EXTRACTS keyed by session, `rel`, and `layout`** | AFTER the merge | refuse-and-report |
| **The gates' evidence is enumerated, not summarised — and WHY (round 3, F2)** | — | — | — | an earlier form of the three rows above said "the merged candidate bytes" and stopped. **Measured, that is false of all three:** the skill guard takes a registry snapshot and the run date, the ledger validator takes a registry snapshot and `extractsBySession`, and both read committed baselines. **Their verdicts are therefore NOT functions of the candidate bytes** — identical ledger bytes must be refused or admitted depending on whether the named session appears in this run's extracts and invoked the parent skill (`validate.js:589-606`). A spec that understated this would let an extraction preserve the byte checks and silently drop ADR-0020's ownership, history and invocation-binding controls, while passing every case the spec listed. **Two rules follow: (a) each gate receives every value its row names, and (b) NO gate may substitute a vault re-read or a git query for any of them** — G7 forbids the git route and Table S row S4 forbids the re-read route, so the values must arrive as inputs or the gate cannot be built |
| **Why this order** | — | — | — | EP2 runs first and scans the BRAIN's added bytes because those are what the run authored and is responsible for (ADR-0034 is about the AI's accidental persistence); the other three gates run after the merge because a Tier-3/skill/ledger judgment must be made on the MERGED bytes, which are exactly what would be promoted — a gate judging pre-merge bytes would not be judging what is promoted, and that is a data-loss contract, not an implementation detail. **Owner-ruled correction:** the earlier rationale — "scanning the merged bytes would force discarding the user's diverging edits" — is FALSE, because refuse-and-report (C7) already leaves the user's live version untouched. EP2 is pre-merge and brain-scoped by CHOICE, not by that false necessity, and the consequence is a named residual (Security checklist): a secret the USER writes into their own note during the run rides a clean C6 merge into the dream commit unscanned. That is the user's own content in their own vault — the dream commits it but did not author it — and making the secret gate refuse or redact a user's own note was ruled the worse trade |
| **Atomicity: the skill-guard ↔ ledger pair** | — | — | — | the pair promotes **atomically at the DECISION**: both outcomes are decided before either is written, so a policy failure on one refuses BOTH — the guard authorizes the skill from the ledger and the ledger is validated from the skill, and promoting one while refusing the other would leave the vault inconsistent. Enforced by Table E's decide-then-write ordering. **This does NOT claim write-atomicity across the two paths**: if the first `rename` succeeds and the second fails (ENOSPC/EIO/kill), the vault holds a half-applied pair. Same-directory `rename` is atomic for ONE path, not across two, and rollback/crash-replay of a partial publish is the residue-lifecycle successor's subject, named in Out of scope — this row claims decision-atomicity and says so |
| The dream report | `validate.js:1374-1408` | **MOVED — `WP-dream-promote-report` owns the report row and Table R.** What stays true here and matters to the gates: the brain writes `<reports_dir>/<date>.md` in the WORKSPACE, C9 admits `reports_dir`, and **three of the four gates above do not match a path under `reports_dir` and pass it through** — the gate rows are what say which gate applies where. Everything else about the report, including the second write and the fallback, is that package's | judged with the rest | that package's |

### Table R — MOVED to `WP-dream-promote-report`

**Cut by the T1 tripwire** (`2026-08-28-promote-split-review-rounds.md`, "T1 HAS
FIRED"). The report's publish decision, its preserve-and-extend fallback, its
gate rules and its four cases are owned by `WP-dream-promote-report` and are
**cited here, never restated**. This spec's surfaces refer to "Table R" by that
name; the name did not move, the ownership did.

### Table E — the promotion write, and the one new window

| Fact / rule | Value |
|-------------|-------|
| Decide, then write — **narrowed (owner ruling, 2026-08-27)** | every path's POLICY outcome — allowlist, merge, all four gates — is decided before **any** vault byte is written, and that is what makes Table D's decision-atomicity row enforceable. **It does NOT mean every outcome is decided first.** The premise-still-holds check is the primitive's `expect` guard and necessarily runs per path at publish time (Table H, H5), so a path can turn into refuse-and-report during the write phase, after earlier paths are already published. **Decision recorded (the simpler of the two options the ruling offered):** the claim is narrowed rather than the primitive's API split into prepare/commit — a two-phase API buys write-atomicity across paths, which this package already disclaims as the residue-lifecycle successor's subject, at the cost of a second contract surface |
| The same-date second run | two runs on one date share `<reports_dir>/<date>.md`, and under the report ruling that path is an ordinary promotion candidate, so nothing special is needed: run 1 promotes it with `expect` absent (absent from baseline, absent from the vault); run 2 finds it in the baseline because `reports_dir` is copied in, the brain rewrites it, and it promotes as a `modified` with `expect` set to the vault's current bytes. **The append-based workaround is not needed and is forbidden** — it was what re-opened the symlink-following defect |
| **The publish goes through the primitive — this spec writes no vault byte itself** | every promoted path is published by `writeIntoVault` (Table H): the resolved path is what policy judges, nothing is written on or through a symlink, no partial content is ever observable at the target, the publish is conditional on the caller's premise still holding, and the published bytes come back. **Those are the primitive's OBSERVABLE properties, which is all a consumer may restate.** **This spec does not restate that discipline — the primitive owns it.** What this spec supplies is the two caller-side arguments: `admit` (Table C's policy, applied by the primitive to the RESOLVED path) and `expect` (the `vault-now` bytes the decision was made against). A promotion that writes the vault by any other route is a defect, and the acceptance criteria assert the seam |
| **The compare→promote window** | the only genuinely new window this direction introduces, and it is **NARROWED, not closed**, to milliseconds against today's minutes-long silent window. The narrowing is the primitive's `expect` guard (Table H, row H5); this spec's obligation is to PASS the right bytes — the `vault-now` bytes the decision used — and to turn `{written:false}` into refuse-and-report. **The residual is the primitive's and is inherited here unchanged:** a user save landing between the re-read and the `rename` is still lost |
| Promotion accounting | every path gets exactly one recorded outcome: `promoted`, `redacted` (EP2 sanitized-and-promoted, Table D), or `refused` with a reason. **The report has no outcome in this package's accounting** — `WP-dream-promote-report` adds it, and its fallback publish is never recorded as a normal promotion. The dream report's enforcement section is written from that record. A path with no outcome is a bug, and the acceptance criteria assert the partition |
| **The staged bytes — a HANDOFF to `WP-dream-promote-in-workspace`, stated here because this table owns the rule** | the dream commit must contain **only promoted paths, and the DECIDED bytes**. The second half is the one a path-shaped implementation misses: staging re-reads the working tree, so a user save landing between the publish and the staging call is what enters the commit, ungated. Measured: with a save in that gap, `git add -- <path>` stages the user's post-publish bytes. **The committed content must therefore be the bytes the primitive returned (Table H, H6), not a fresh read of the path** — which is also what keeps a refused staging object surviving under H7 (Table C, C1) out of the commit that a wholesale `git add -A` would have swept it into. **Which bytes those are, which outcomes carry them, and what a consumer may derive from them is TABLE S — extracted after two consecutive rounds landed here, and cited rather than restated.** **How that is achieved is the implementer's — round-4 CUT ruling:** an earlier draft prescribed `git hash-object -w --stdin` and `git update-index --cacheinfo`, and manufactured two contradictions doing so. Those findings dissolve with the prescription. ADR-0012's "one dream run = one git commit in the vault" is unchanged. **This module makes no commit and asserts nothing about one; it supplies the decided bytes per Table S so the pipeline package can satisfy this rule, and that package's acceptance criteria assert it** |

### Table Q — the EP2 gate's result, and the quarantine lifecycle behind it

**Extracted in pass (b)** from the step-(a) inventory
(`2026-08-28-promote-split-inventory.md`, items I063–I072), after round 4's F2
and all four of the measurement's GAP-INTERFACE items landed on one contract:
**what the EP2 gate produces besides a verdict.** Table D owns each gate's
INPUT; this table owns the EP2 gate's OUTPUT and the durable lifecycle it drives.
Table D's EP2 row and Table R's report rules cite it.

**Why it is a table and not a sentence in Table D:** the shipped arm produces a
durable artifact, a name that is not predictable, a retention schedule and a
report line, and four rounds plus one blind measurement found the same thing —
a verdict-only interface silently drops all of it.

| # | Fact / rule | Value |
|---|---|---|
| Q1 | **The taxonomy, with its payload** | `{ok}` \| `{refuse, reason}` \| `{redact, sanitizedBytes, lines, labels, artifact}`. The redact arm's three extra fields are not decoration: `lines` is how many of the run's added lines were scrubbed, `labels` is what the detectors matched (never the matched bytes), and `artifact` is the **actual basename** of the preserved unredacted copy |
| Q2 | **`artifact` is REPORTED, never PREDICTED** | the preserving call resolves collisions itself and returns the name it actually used (`validate.js:669-738`). A caller that reconstructs the name from the date and path will point the user at a file that does not exist on exactly the runs where two notes collide. **This row exists because the pre-pass-(b) interface had no field for it at all**, so the only available implementation was to guess |
| Q3 | **The report line is the user's ONLY route back to their copy** | `state/quarantine/redacted/` deliberately carries no digest banner, so nothing else announces the file. Table R's report therefore carries one line per redaction naming the path, the scrubbed-line count, the labels and the artifact, with restore-or-delete guidance — the shape shipped today at `validate.js:1392-1409`. **Losing the line loses the copy in practice, which is why this is a data-loss row and not a reporting nicety** |
| Q4 | **THE ONLY-COPY INVARIANT — the highest-damage item the measurement found (I067)** | **nothing may destroy the working copy of a note unless some durable artifact byte-identically holds THE BYTES THAT ARE THERE NOW.** Not an earlier version: the note's owner can have saved it mid-run, and a copy of what it used to be is not a copy of what they wrote. Shipped, this is a fail-loud abort before the report and the commit (`validate.js:1293-1323`), and its error distinguishes "no copy was saved", "a copy exists and matches" and "a copy exists and does NOT match". **Under promotion the destruction risk moves but does not vanish** — the workspace, not the vault, is what teardown removes — so **the invariant binds the pipeline's teardown too, and `WP-dream-promote-in-workspace` row G5 cites this row.** No surface may weaken it to "a copy was attempted" |
| Q5 | **A redundant copy is deleted only on proven identity (I070)** | when both a redacted-arm copy and a withheld copy exist, the redacted one is removed ONLY when it is byte-identical to the withheld one; a comparison that fails, or cannot be made, RETAINS it. Deleting on assumed duplication is how the one non-identical recovery artifact disappears |
| Q6 | **Retention is bounded, once per run, and never eats this run's own output (I072)** | after at least one completed redaction, `redacted/` is pruned toward **50** files, oldest first, **excluding every copy this run created** — otherwise the run can prune the very artifact the report has just told the user to restore. Best-effort: a cap that cannot be met without deleting this run's copies yields instead. **Measured scope: `state/quarantine/` itself is unbounded and stays so; this row is about `redacted/` only**, and says so rather than implying a bound it does not provide |
| Q7 | **Where the preservation happens, and where it does not** | the GATE preserves (Table D), because it is the party holding the pre-change bytes. This module never touches the state directory. What this module does is CARRY Q1's fields into the accounting and the report, and refuse to publish when Q4 is unsatisfied |

### Table S — the decided bytes, and what may be derived from them

**Extracted by the ADR-0031 loop circuit-breaker**, after two consecutive
external rounds landed a finding on this one contract: round 1's R1-1 (the
interface typed paths where the prose promised bytes) and round 2's F2 (the same
defect surviving on the report's arm of the same interface). The breaker's rule
is to stop patching finding-by-finding and pull the contract into ONE canonical
table with registered mirrors. **This table is now the single place the contract
is decided;** `### Exact contracts`, Table E's staged-bytes row, and
`WP-dream-promote-in-workspace`'s rows G8 and G10 cite it and do not restate it.

| # | Fact / rule | Value |
|---|---|---|
| S1 | **What "the decided bytes" ARE** | for any path this module publishes and REPORTS in its return (row S5's scope), the exact buffer `writeIntoVault` returned for it (Table H, row H6). Not the candidate this module composed, not a read of the target afterwards, and not a digest of either. They are the only bytes any gate judged and the only bytes the vault is known to hold at publish time |
| S2 | **Every published outcome carries them, and the SHAPE is what guarantees it — not the prose** | **published entries are `{rel, bytes}` — BOTH halves required, not the bytes alone (pass (c)).** A consumer that receives bytes without a path cannot stage, count or register them, and this row said "`.bytes` is required" for one round while nothing required `rel`, which is the same defect one field over. `promoted[].bytes` and `redacted[].bytes` are required fields, and `report` is a DISCRIMINATED UNION whose published arms (`promoted`, `fallback`) require `bytes` while the refused arm cannot carry them. **Stated as a shape rule because twice now the prose was right and the type was not:** a return of paths alone (round 1), then an OPTIONAL `bytes` spanning success and refusal (round 2) — the second conforms to its own interface while omitting the bytes on exactly the branch that enters the commit. A rule the type cannot express is a rule an implementation can satisfy and still break |
| S3 | **A refused outcome carries no bytes, and must not** | nothing was published, so there is nothing to carry, and a field that could hold the candidate would invite a consumer to commit bytes the vault never took. `refused[]` is `{rel, reason}`; the report's refused arm is `{outcome:'refused', reason, record}` |
| S4 | **EVERY fact a consumer derives about a published path is derived FROM these bytes** | and this is deliberately broader than "the staged content". A frontmatter field, a length, a digest, a registry entry — each is derived from the returned buffer, never from a fresh read of the vault path. **Re-reading re-opens the window the publish closed:** a user save landing after the publish would decide what gets committed, hashed or registered, and none of it was gated. **This generalisation is what round 2's F1 needed** — its registry entry reads `id` and `created` out of a promoted `SKILL.md`, and today's code reads them from the vault path (`validate.js:1203`), which is correct only because today the brain wrote that path directly |
| S5 | **SCOPE, stated before the list, because round 3's F4 showed the list without it was false** | this table governs the bytes `promote()` RETURNS to its caller — the downstream consumers of its result. **It does NOT govern this module's own internal use of a `writeIntoVault` return**, of which there is exactly one: the report's second write, whose `expect` is the buffer the first report publish returned. That handoff is owned by Table D's report row and by Table R, which state it operatively; naming it here as well would be the restatement this family's citation rule forbids. **An earlier form of this row listed two consumers while S1 quantified over "any path this module publishes", which the internal report handoff falsified** — the scope sentence is what makes the list true rather than the list being widened |
| S6 | **The downstream consumers, named — S4's universal quantifies over THIS list** | two, both in `WP-dream-promote-in-workspace`: the dream commit (row G8) and the skill-ownership registry (row G10). **A downstream consumer that needs a byte, a field or a digest of a published path and is not in this list is a finding, not a fix** — it means an obligation this family owns has no owner, which is exactly how round 2's R2-1 arose |

### Mirrored Surface Checklist

- [ ] Deliverables-table `Notes` cells (each cites its owning table)
- [ ] `### Exact contracts`' signature and its return shape
- [ ] Acceptance criteria that assert Tables C, D, E, Q and S
- [ ] Verification steps (the assertions mirror Tables C, D, E, Q and S)
- [ ] Current-state description (the validator's four gates, the delta
      primitive's binary record, the shipped sanitizer, the skill's report
      requirement)
- [ ] Implementation notes (the merge-on-a-copy trap, the injected gates)
- [ ] Out of scope (what the pipeline package, the residue-lifecycle successor
      and audit finding C2 own)
- [ ] **The package note and the dispatch-precondition block** — the note
      mirrors the citation of the canonical table-letter map and the consumed-by-nothing
      rule; the dispatch block mirrors the pinned base and the containment
      citation. A finding that changes either updates this section too
- [ ] **The containment-by-citation rule** — the dispatch block, Table C rows C1
      and C9, Table E's publish row, and the Security checklist. **No surface
      here may paraphrase a path-containment rule; each cites Table H.**
- [ ] **Every surface that states what a claim establishes** — the Context
      paragraph, rows M2 and M3, the Security checklist, and the acceptance
      criteria. **No surface may say the workspace is not a git repository
      without qualification, none may claim M10's closure (it is the pipeline
      package's), and none may restate Table F's content instead of citing it.**
- [ ] **The EP2 disposition taxonomy** — the `promote()` return shape, Table D's
      EP2 row and its preamble, the promotion-accounting row, and the
      redact acceptance criterion. **No surface may reduce EP2 to `reason|null`
      or drop the `redacted` outcome or `secretDisposition`.**
- [ ] **What the T1 cut removed** — Table R, Table D's report row and the seven
      report criteria are `WP-dream-promote-report`'s. **Their placeholders here
      cite that package; no surface may restate a report rule, and none may
      claim a report outcome in this package's accounting.**
- [ ] **Table Q — the EP2 result and the quarantine lifecycle.** Its mirrors are
      the `gates` paragraph in `### Exact contracts`, Table D's EP2 row, Table
      R's redaction-lines row, and `WP-dream-promote-in-workspace`'s row G5
      (which cites Q4). **Prohibitions, each earned: no surface may reduce the
      redact arm to a verdict plus bytes; no surface may PREDICT the artifact
      name instead of reporting the one returned; and no surface may weaken Q4's
      only-copy invariant to "a copy was attempted".**
- [ ] **Table S — the decided bytes.** Its mirrors are the `@returns` shape
      Table E's staged-bytes handoff row, and
      `WP-dream-promote-in-workspace`'s rows G8 and G10. **The `report` union's
      arms are `WP-dream-promote-report`'s and are governed by Table S from
      there — this spec's `@returns` has no `report` arm.** **Two prohibitions,
      both earned by a round: no surface may state a decided-bytes rule that the
      TYPE does not enforce; and no surface may add a consumer of published
      bytes without adding it to row S5's list.**
- [ ] **The primitive seam** — the package note, Table E's publish row, C9's
      application clause, the staged-bytes handoff row, and their acceptance
      criteria. **No surface may describe filesystem discipline as this spec's
      (it is Table H's), and none may show a vault write that does not go
      through `writeIntoVault`.**
- [ ] **The refusal-leftover bound** — Table C's C1 row and the Security
      checklist. **Both sides are cited (H9 for directories, H7 for the staging
      object) and NEITHER is counted here: the primitive's own H7 acceptance
      criterion is the single counting surface.**
- [ ] **The two HANDOFFS** — the gate-extraction handoff in Table D's preamble
      and Table E's staged-bytes row. Both name `WP-dream-promote-in-workspace`
      as the package that discharges them, both are repeated in Out of scope's
      first bullet, and neither has an acceptance criterion HERE — by design,
      since this package ships neither the extraction nor a commit
- [ ] **The narrowed window and the decision-atomicity** — Table D's "Why this
      order" and atomicity rows, Table E's window row, the Security checklist's
      named residual, Out of scope's partial-publish line, and their acceptance
      criteria. **No surface may call the window "closed" or claim cross-path
      write-atomicity, and none may re-assert the withdrawn "scanning merged
      forces discarding the user edit" rationale.**

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing outlives the job.
- **Merge on a copy — the trap, measured.** `git merge-file` mutates its first
  operand in place on conflict. The obvious shape (merge the vault note against
  the workspace note) leaves conflict markers in the user's live file on exactly
  the path where refuse-and-report promised not to touch it.
- **The gates are injected, so this module's tests use fakes.** That is the
  point of the injection: the order, the input routing and the taxonomy are
  provable here without `validate.js` in the picture, and the module carries no
  dependency on it.
- **Do not build a containment check.** The one rule the family has is the
  primitive's, and it took eleven review rounds — see the Dispatch precondition.
  A second implementation of it in this module is a defect, not a defence.
- **Measure `promote.js` and report the number in the PR body.** A pinned
  tripwire (logbook: `2026-08-28-promote-split-owner-ruling.md`) fires at **600
  lines of non-test content. **T1 has already fired once**, on the criteria
  count, and cut Table R and the report's criteria into
  `WP-dream-promote-report`; T3 is the remaining arm and it is measured at
  implementation time. Reporting the measurement is the implementer's only
  obligation here; a cut, if one comes, is not theirs to make
  mid-implementation.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item applies twice over. Relative
      paths from the delta are attacker-influenceable and flow into filesystem
      writes **into the vault** — and this module hands every one of them to
      `writeIntoVault` rather than joining it to a vault root itself.
      **Segment validation, resolution and containment are ALL the primitive's
      (Table H, rows H1–H3), applied by it, cited here and not reimplemented:**
      it segment-validates `rel` and throws on a violation, resolves the target,
      and calls this module's `admit` with the RESOLVED path. **Table C's row C9
      is a POLICY, not a path validator** — it decides which resolved paths are
      allowed, and a second segment check written here would be the duplicated
      containment rule the Dispatch precondition forbids.
- [ ] **Named residual: a secret the USER writes into their own note during the
      run can enter the dream commit.** EP2 scans the brain's added bytes before
      the merge (Table D); a user credential added to the live note during the
      run rides a clean C6 merge into the committed bytes unscanned.
      Owner-ruled acceptable: it is the user's own content in their own vault —
      the dream commits it but did not author it — and making the secret gate
      refuse or redact a user's own note was ruled the worse trade.
- [ ] **What a refusal may leave behind is the primitive's bound, on both sides,
      and this package inherits it rather than closing it** (Table C, C1): H9's
      directory side and H7's staging-object side, each named in the refusal by
      the primitive. The consequence this package must handle is that a
      surviving staging object holds the REFUSED payload; Table E's staged-bytes
      row is what keeps it out of the commit.
- [ ] The merge's git invocation is a security decision and takes the
      dependency's constructed-environment discipline (Table C, row M2). Named
      residual, inherited and not closed: executable-identity influence at a
      verified absolute path.
- [ ] **The findings this package closes are not the brain's routes at all —
      they are OUR OWN process writing the vault, which no harness sandbox
      constrains (Table H's primitive).** What the Codex arm's shell can reach
      inside the workspace is measured and bounded in sibling Table F, and is
      not this package's subject.

## Acceptance criteria

- [ ] **Table C's decision matrix**, one case per row C1–C8, each asserting both
      the outcome and the vault's resulting bytes.
- [ ] **M7's mechanism, current conventions.** A brain that writes
      `<workspace>/CLAUDE.md`, `<workspace>/AGENTS.md`,
      `<workspace>/01-Projects/x/AGENTS.md`,
      `<workspace>/01-Projects/x/CLAUDE.local.md`,
      `<workspace>/01-Projects/x/AGENTS.override.md`,
      `<workspace>/.gitignore`,
      `<workspace>/01-Projects/x/.claude/rules/evil.md` and
      `<workspace>/01-Projects/x/.claude/settings.json`
      promotes **none** of them, each with a recorded reason, and the vault
      contains none of them afterwards.
- [ ] **Spelling does not decide admission, in BOTH directions.** RED: an
      instruction-file basename in either normal form is refused —
      `01-Projects/x/agents.override.md`, `claude.local.md`, and a path with a
      `.CLAUDE` segment are each refused. GREEN: with an admitted directory
      spelled composed in the layout and decomposed on disk (or vice versa) —
      `reports_dir` is the worked example, since it is admitted — both spellings
      name ONE directory and both ADMIT. No false refusal, and no
      implementation may derive two directories from one name.
- [ ] **Policy is judged on the RESOLVED path.** With a pre-existing vault
      symlink `01-Projects/alias` → a directory C9 denies (`../.claude`, and a
      vault-root target), a brain-written `01-Projects/alias/evil.md` is
      refused and the victim directory gains nothing. Proven RED against an
      implementation that hands the primitive the candidate path.
- [ ] **The merge never touches the user's live note.** On a conflicting
      three-way state the vault file is byte-identical to its `vault-now`
      version afterwards and contains no conflict marker.
- [ ] **This module's git seam is never given a workspace cwd (CLAIM 2b, this
      module's share).** Asserted by a test that substitutes the git seam and
      fails if the merge is ever invoked with a cwd at or beneath the workspace
      root. Proven RED by a deliberate merge call from the workspace. **A test
      asserting the workspace "is not a git repository" is asserting something
      sibling Table F measures to be unestablishable — the criterion is the cwd
      assertion, not a repository probe.** The product-wide form of the claim is
      `WP-dream-promote-in-workspace`'s.
- [ ] **Gate order and input (Table D).** A secret in the brain's added lines is
      withheld before the merge and never appears in a merged candidate; and a
      Tier-3 / skill-guard / ledger refusal is shown to have judged the
      **merged** bytes, demonstrated by a case whose pre-merge bytes would pass
      and whose merged bytes must not.
- [ ] **ADR-0020's authorizing input.** A brain that rewrites both a skill and
      the ledger in the same run is refused, because the guard is handed the
      **baseline** ledger.
- [ ] **EP2's redact disposition (ADR-0034).** A brain-added line that triggers
      only a context-free high-entropy hit is REDACTED: the sanitized candidate
      is promoted, the path is recorded `redacted`, and
      `secretDisposition.redactions` counts it separately from a hard refusal.
      Asserted through the injected gate's returned taxonomy.
- [ ] **Unscannable content is refused.** A brain-written `.md` whose delta
      record is binary is refused by EP2 with that reason and does not reach the
      vault. Proven RED against a gate that treats the empty scan as a pass.
- [ ] **Atomicity — at the DECISION.** A run where the skill passes and the
      ledger fails-policy promotes **neither**. The criterion covers the
      decision, not a mid-write crash: a partial publish (first `rename`
      succeeds, second fails) is the residue-lifecycle successor's subject
      (Out of scope) and is not asserted against here.
- [ ] **Every vault content write goes through the primitive.** Asserted by
      substituting the primitive's seam and failing if any vault content write
      bypasses it. **The report's own writes are `WP-dream-promote-report`'s to
      assert; this criterion covers every write this package makes.** Proven RED
      with a promoted note published by a direct `writeFileSync`.
- [ ] **The compare→promote window is narrowed.** With the vault target changed
      between the decision and the re-read, the write is abandoned and the path
      is reported refused; the vault keeps the changed bytes. The criterion
      asserts the NARROWED window (a change visible at the re-read), not a
      closed one — a save landing between the re-read and the `rename` is the
      stated residual and is not asserted against.
- [ ] **Promotion accounting partitions the delta**: every record is exactly one
      of `promoted`, `redacted`, or `refused` with a reason, and the counts sum
      to the record count.
- [ ] **The gates are judged on the evidence Table D enumerates, not on bytes
      alone (round 3, F2).** Two cases, each RED against a gate given candidate
      bytes only: **identical** candidate ledger bytes are refused or admitted
      solely because the named session is absent from, or present in, this run's
      extracts; and a skill revision is refused solely because the ownership
      registry does not name it. A paired skill-plus-ledger change is judged from
      the pair's candidate and BASELINE bytes, never from the live vault.
- [ ] **A redaction reports its recovery copy (Table Q, rows Q1–Q3).** A
      redacted note's report line carries the path, the scrubbed-line count, the
      detector labels, and **the artifact name the gate actually returned** —
      asserted with a deliberate basename COLLISION, so a line built by
      predicting the name from the date and path names a file that does not
      exist. Proven RED against a gate result that carries only
      `{redact, sanitizedBytes}`.
- [ ] **The only-copy invariant holds (Table Q, row Q4).** With the redaction
      arm failing AND the withheld preservation failing, the run refuses
      fail-loud and the working copy is byte-unchanged; the refusal names which
      of the three states it found. Asserted separately for the case that makes
      it non-obvious: a copy exists but does NOT match the current bytes,
      because the user saved the note mid-run — the copy is not a copy of what
      they wrote, and the criterion goes RED against an implementation that
      treats any saved copy as sufficient.
- [ ] **Retention is bounded and never eats this run's own copies (Table Q, row
      Q6).** With more than the cap present, the prune runs once, oldest first,
      and every artifact this run created survives it — including the one the
      report just told the user to restore. A redundant copy is deleted only on
      proven byte-identity (Q5); a failed or impossible comparison retains it.
- [ ] **Every published outcome carries its decided bytes (Table S).** Asserted
      per outcome: an ordinary promotion and a redacted promotion each return
      **both `rel` and** the exact buffer the primitive published, byte-equal to
      what the vault then holds; a refused path returns no bytes at all.
      **Proven RED against a return carrying bytes without `rel`**, which the
      pre-pass shape permitted. **Proven RED against a
      return that carries paths without bytes** — round 1's finding. **The
      report's arms are `WP-dream-promote-report`'s to assert**, under the same
      Table S rule, which is why row S2 states it as a shape rule rather than
      per-outcome prose.
- [ ] **The module ships consumed by nothing.** No file outside the Deliverables
      table changes, and no production code requires `promote.js`. Asserted by
      the boundary check and by a grep whose red side is a planted require.
- [ ] **The glossary carries the name.** `docs/GLOSSARY.md` defines
      **promotion** as a canonical name (the grep below is the anchor; the
      wording is the implementer's).
- [ ] Idempotence: `N/A — this package ships a module, not a command, and writes
      nothing outside the repo.` What it ships in its place is the promotion
      partition above: a run in which the brain writes nothing promotes nothing
      and changes no vault note.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# A --test-name-pattern with ZERO matching tests exits 0 (measured, Node 24),
# so pattern runs against a CREATED file are guarded by its existence — the
# guard is what makes the deliverable-ABSENT state red instead of vacuously
# green.
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "dream-promote"
npm test
npm run lint
# The module's own git-seam claim lives in the deliverable test file; the spec
# fixes only the test NAME, because a verification command must be runnable.
test -f tests/unit/dream-promote.test.js && npm test -- --test-name-pattern "claim-2b-merge-cwd"
# Consumed by nothing: no production code requires the new module. This is a
# grep over a directory that MUST exist, so guard the absence case first — grep
# on a missing path exits 2, which `!` would turn into a false green. The module
# itself is excluded, since a JSDoc line in it would otherwise redden this.
test -d src && ! grep -rqn "require(.*promote" src/ --include='*.js' --exclude='promote.js'
test -f docs/GLOSSARY.md && grep -q "\*\*promotion\*\*" docs/GLOSSARY.md
```

- The `claim-2b-merge-cwd` run, the consumed-by-nothing grep and the glossary
  grep are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing something a reader must judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state — a merge call
  added with the workspace as cwd (reddens `claim-2b-merge-cwd`); a
  `require('./promote')` planted in another `src/` file (reddens the
  consumed-by-nothing grep); the glossary text reverted (reddens the docs grep) — so a check that
  cannot fail is caught before anyone believes it. Verify each **also** goes red
  when its deliverable is ABSENT — for the pattern run that is the
  file-existence guard's job.
- **The git-seam claim is asserted through the seam, never through a grep.** A
  source grep for a workspace-rooted cwd cannot discriminate: it is green today,
  green on a correct implementation, and green on a broken one that passes the
  path through a variable.

## Out of scope (do NOT do these)

- **The pipeline** — `WP-dream-promote-in-workspace` owns Table G: the workspace
  lifecycle in the run, replacing the sibling's transitional `spawnBrain`
  argument, calling `computeDelta` and this module, the reap precondition, the
  unknown-command non-vacuity signal, the transcript-advance, the abort paths
  and the dream commit. **Both of this spec's HANDOFF rows are discharged there
  and nowhere else:** Table D's extraction of the four real gates into their new
  input shape (and the removal of the EP2 enforcement half from
  `validate.js`), and Table E's staged-bytes rule for the commit.
- **`src/core/dream/validate.js` and `src/cli/dream.js`** — not in this
  package's Deliverables and not modified. This module is not wired to anything.
- **Audit finding M9** — repo-local git configuration naming executable
  programs. Owner-ruled open on 2026-08-05, audit finding C2's package.
- **Audit finding C3** — the layout dot-rule and its notice. Table C9's
  allowlist is a directory-and-extension rule, deliberately **not** a dot-rule,
  so it does not step on audit C3.
- **The residue-lifecycle successor** (not yet drafted — it has no WP id yet) —
  the journal schema, crash replay, uninstall restore, a workspace surviving a
  crash, and **the rollback/replay of a PARTIAL PUBLISH** (first promoted
  `rename` succeeds, a later one fails — Table D's atomicity row claims
  decision-atomicity only).
- **An ADR for the promote-in inversion.** The war-room decision log owns the
  reasoning and this spec cites the rulings; whether the inversion also needs an
  indexed ADR is an owner call. `docs/adr/0012` is amended by the pipeline
  package, where the lifecycle actually changes.
- **`skills/wienerdog-dream/SKILL.md`** — the sibling's Out of scope owns the
  bounded claim and the reason; nothing here changes it.
- **The siblings' contracts** — the workspace module, the constructed baseline,
  the seven re-target sites and Table F (`WP-dream-workspace-retarget`); and the
  vault-write primitive's filesystem discipline, Table H
  (`WP-dream-vault-write-primitive`) — its resolved-path application, symlink
  refusal, temp creation, conditional publish and published-bytes return. This
  WP CONSUMES both and cites them; restating a proved property is how it becomes
  a drifting copy. In particular this WP may not re-implement a publish path or
  a containment check of its own.
- **The dependency's own contract** — the delta primitive, its binary/text
  equivalence, its `addedLineNumbers` property. This package CONSUMES
  `computeDelta`'s fields and does not re-derive them.
- **The superseded predecessor's Tables C, D and E**
  (`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`). Tables C, D and E
  here are this package's own, recomputed against the tree at `36c2ce5`.
  Copying a table out of a superseded record is how a dead contract comes back
  to life.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken
   red; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): build the promotion module (WP-dream-promote-module)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
