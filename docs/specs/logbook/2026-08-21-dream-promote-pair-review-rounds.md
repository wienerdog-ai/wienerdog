---
title: Review rounds — the promote-in stacked pair
date: 2026-08-21
---

# Review rounds — WP-dream-workspace-retarget + WP-dream-promote-in-workspace

Specs: `docs/specs/WP-dream-workspace-retarget.md` (Part i),
`docs/specs/WP-dream-promote-in-workspace.md` (Part ii). Base:
`wp/dream-promote-in-workspace` @ `4dfd1e8` (src/ byte-identical to the pinned
`025021f`). Round zero: see
`2026-08-21-dream-promote-pair-round-zero.md` — closed GREEN after fixes;
nothing from it carries review credit here.

**Round counter starts at ONE.** The external reviewer is the other model
family (Codex side), per the 1a precedent. Rounds run on the Draft specs on
this branch; `Ready` comes after the loop closes.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the
  PRODUCT — nothing that changes what the implementer builds in `src/` or
  `tests/`.
- **THE FAMILY ESCALATION for this package:** its characteristic failure is
  **a vault write that bypasses the promotion decision** — the whole inversion
  exists so the vault is reachable only through promotion, so any path that
  reaches it otherwise (a spawn-seam leak, a merge writing in place, a
  publish outside the compare-window guard, an abort path touching the vault)
  is the family to watch. If a round lands twice on that family, it returns to
  the owner as a ruling request with the split seam itself on the table.
- **Otherwise:** two consecutive rounds on any other same contract family →
  contract extraction, not another patch. Two consecutive rounds on an owner
  ruling → owner.

## Round log (append per round)

<!-- Round N: date, reviewer, findings count by severity, dispositions,
     commit that applies the fixes. -->

### Round 1 — 2026-08-21 — reviewer: Codex (gpt-5.6-sol), external

**Does NOT close.** 10 capability findings constructed, 0 questions. The
reviewer's negative controls held (the six re-target sites, the git-free walk
vs `.gitignore`, `git merge-file` conflict-in-place, `precommitSessionEdits` /
`restoreVaultToHead` behaviour, the Part i transitional line, the byte-identical
src/ tree). Five load-bearing claims re-verified here against the code before
dispositioning: F2 (`cli/dream.js:237` clean-tree guard for the unknown-command
path, comment relies on the pre-spawn clean assert), F6 (reap verdict sits
inside `if (pidfile)`, `pidfile` null on tokenless runs — `:149-152`, `:256`,
`:272`), F1 (`delta.js` `lstat`s and treats a hardlink as a regular file, no
`nlink` check), F5 (`adapters/codex.js:24-76` handles `AGENTS.override.md` as a
real shadowing convention), F10 (`layout.js` imposes no cross-key distinctness).
All confirmed.

**FAMILY LANDING (per the stop criterion):** the round lands on the package's
characteristic family — a vault write that bypasses the promotion decision —
via F1, F3, F5, F10. This is the FIRST landing; a second lands the split seam
on the owner's table.

**Dispositions:**

Owner-ruling required (escalated; fixes held until ruled — they reshape the
mechanical ones):
- **F1 — hardlink through the Codex workspace shell writes the vault inode
  DURING the run.** Neither reap nor promotion sees it (damage precedes
  classification). Not closable by promotion-side text alone. Candidate cures
  are structural (Part i): place the workspace on a different filesystem from
  the vault so `ln` across it fails `EXDEV`; or a Codex-arm containment change;
  or accept as a named residual. Owner call.
- **F4 — a concurrent user secret enters the dream commit via a clean C6
  merge, past the pre-merge EP2 scan.** The spec's stated rationale for
  pre-merge scanning ("scanning merged would force discarding the user edit")
  is false — C7 already leaves the user's live version on refusal. Owner call
  on EP2's scope: scan brain-added bytes only (status quo, accepts the hole) vs
  scan every newly-durable byte in the staged candidate (refuses a note for the
  user's own secret) vs stage only brain-attributable bytes.

In-scope spec fixes (Part ii unless noted; applied after the two rulings, since
F1 may move Table A and F4 reshapes F7/F9):
- **F5** — C9 deny-list extended to current instruction-file shapes and control
  namespaces (`CLAUDE.local.md`, `AGENTS.override.md`, any `.md` under
  `.claude/`/`.codex/`), and Part i copy-in exclusions matched; M7 criterion
  broadened past the two exact basenames.
- **F6** — Table G requires an UNCONDITIONAL post-settle reap verdict covering
  tokenless manual runs; acceptance tests both run types.
- **F7** — EP2 gate gains an outcome taxonomy (redact → sanitized candidate
  bytes + artifact + separate counter) per binding ADR-0034, replacing the
  `reason|null` shape for that gate.
- **F9** — `promote()` return gains a typed EP2 disposition summary; Table G
  states how the pipeline's transcript-deferral consumes it (today's
  `secretReverts` signal, `cli/dream.js:568-596`).
- **F2** — Part ii replaces the removed clean-tree non-vacuity signal (the
  unknown-command guard, `cli/dream.js:237`) with workspace/brain evidence.
- **F10** — C9 gains an explicit `reports_dir` negative check; layout overlap
  semantics named (Part i or a noted layout obligation).
- **F3** — the compare→promote window relabelled "narrowed", not "closed", with
  the residual stated (matches the cited precedent's real TOCTOU).
- **F8** — the atomicity claim narrowed to DECISION atomicity; partial-publish
  recovery routed to the residue-lifecycle successor, or a publish-failure
  acceptance arm added.

Editorial (fold into the fix commit): "rejects `/` before any path is joined" →
"rejects separators within each validated segment"; "closed" → "narrowed" for
the millisecond race wherever it appears.

**Owner rulings (2026-08-21):**
- **F1 → different-filesystem placement (EXDEV).** The workspace sits on a
  different filesystem from the vault; `createWorkspace` asserts distinct
  devices before copy-in. A hard link cannot cross a filesystem, so the Codex
  shell's `ln`-into-workspace vector fails `EXDEV` at creation — closed
  structurally in Part i, unconditionally and on every platform, not by the
  reap and not by promotion policy. Cost accepted: cross-device copy has no
  reflink; the copy-in cost is re-measured against the boundary.
- **F4 → status quo + named residual.** EP2 stays pre-merge and brain-scoped;
  a secret the USER writes into their own note during the run can enter the
  dream commit via a clean C6 merge. Recorded as a named residual (it is the
  user's own content in their own vault; refusing/redacting a user's own note
  was ruled the worse trade). The spec's false "scanning merged forces
  discarding the user edit" rationale is corrected in place.

**All ten applied.** F1 (Part i Table A placement + hardlink-vector row +
Table F Codex-shell row + contract + acceptance); F5 (C9 deny broadened to
current instruction-file shapes and control namespaces; Part i baseline
exclusions matched; M7 criterion widened); F6 (Table G unconditional reap,
tokenless-run caveat + criterion); F7 (EP2 taxonomy: redact arm, per ADR-0034);
F9 (`promote()` returns `secretDisposition`; Table G pipeline-consumes row);
F2 (Table G non-vacuity signal moved to workspace-delta evidence; Table E and
Current state note the second `assertCleanTree` consumer); F10 (C9 explicit
`reports_dir` negative check); F3 ("narrowed" not "closed" + stated TOCTOU
residual); F8 (decision-atomicity only; partial-publish routed to the
successor). Editorial folded in. New mirror lines registered in both
checklists.

Fix commit: applied in the commit that carries this update.

**Round 1 does not close the loop.** Per the stop criterion, the next external
round runs on the fixed specs; the family (vault-write-bypasses-promotion) took
its FIRST landing here — a second lands the split seam on the owner's table.

### Round 2 — 2026-08-22 — reviewer: Codex (gpt-5.6-sol), external

**Does NOT close. 9 capability findings, 0 questions — and the FAMILY LANDS A
SECOND TIME, so the stop criterion fires: this round returns to the owner as a
ruling request with the split seam itself on the table.** All nine re-verified
here against the code before dispositioning; all nine hold. Two are BLOCKERS
against round 1's own fixes, and one is a defect this author INTRODUCED in the
round-1 fix pass.

**The two blockers, both against round 1's applied ruling:**

- **F1' — the EXDEV placement, as specified, cannot run on a default install.**
  Measured: `vault`, `state`, `core` and `tmpdir` are all `dev=16777230` on the
  primary platform — one device. `createWorkspace` would fail closed on every
  dream run. Provisioning a dedicated volume or tmpfs has no deliverable
  surface and contradicts Part i's "spawns nothing at all" and ADR-0004's
  files-only rule. **The owner's F1 ruling is sound as a MECHANISM (cross-device
  hardlinks do fail `EXDEV`) and unimplementable as a PLACEMENT within this
  package's boundary.**
- **F2' — the unconditional reap verdict cannot be "just surfaced" on win32.**
  Measured (`src/core/reap.js:25-33`, `:503-519`): `taskkill /PID <dead-pid> /T
  /F` fails once the leader has exited, so the verdict is `{reaped:false}` on a
  NORMAL Windows run — Table G would refuse every such run — and the primitive
  states it gives "NO leaderless-member guarantee" there, so it cannot supply
  the "verifiably empty" verdict the row demands. `src/core/reap.js` is in
  neither half's Deliverables.

**The author's own injected defect (F6', fixed immediately — it does not touch
the seam question):** round 1's F9 text said a transcript whose note was
"withheld or redacted" does not advance. Canonical semantics are the opposite
for redactions (`validate.js:1065-1072`: redacted files "consumed their
transcripts normally and MUST NOT defer"). Left standing it would re-do
consumed work and mint a second quarantine artifact every redacted run.
Corrected in Table G, the contract and the criterion; the field is renamed
`reverts` → `withheld`, since promotion never wrote the bytes.

**The other six, HELD pending the ruling:** F3' binary `.md` passes the new EP2
gate unscanned (`delta.js:517-520` returns no line numbers for binary; today's
`validate.js:1239-1255` withholds it explicitly) and C3 promotes it raw —
a regression against shipped behaviour. F4' a PRE-EXISTING vault symlink
(`01-Projects/alias -> ../reports/dreams`, or `-> ../.claude`) makes a lexically
admitted path resolve into a denied destination; C9 validates the lexical delta
path while containment only asks "inside the vault". F5' the dream commit stages
working-tree bytes, so a user save landing between publish and `git add` enters
the commit ungated — later and distinct from the accepted F4 residual. F7' the
deny-list is case-sensitive while the primary filesystem is not
(`agents.override.md` measured resolvable as `AGENTS.override.md`; the repo
already handles this rule at `validate.js:1083-1086`). F8' `spawnBrain` spreads
the ambient env (`brain.js:169-173` with `env: process.env`), so an inherited
`WIENERDOG_VAULT` keeps the vault path in the child env and CLAIM 1's structural
criterion cannot pass. F9' the publish temp uses a predictable name and a
following write (the cited precedent, `validate.js:855-863`), so a planted
symlink at the temp path is overwritten before `rename`; the hardened
crypto-random `O_EXCL|O_NOFOLLOW` pattern already exists at
`private-fs.js:259-317`.

**THE DIAGNOSIS THE ESCALATION CARRIES (author's, offered as the ruling's
input, not as a ruling):** both rounds' family findings share one shape — **the
promotion boundary is specified in PATHS, while every successful attack reaches
the vault by IDENTITY.** Round 1's hardlink: two paths, one inode. Round 2's
F4': one lexical path, another resolved destination. F9': one temp path,
another object. F5': one approved path, other bytes. F8': the path arrives by
another route entirely. Each patch so far has added another lexical rule, and
each round has found the next identity vector. That is the plateau shape this
program reset itself to escape, and it is why the stop criterion's remedy for a
repeat family landing is a CONTRACT EXTRACTION or a re-cut seam rather than an
eleventh rule.

Fix commit for F6' only: applied in the commit that carries this record.
Everything else: **HELD — owner ruling requested.**

### Author's measurement — round 1's F1 does not reproduce at a realistic vault location

Run 2026-08-22 before the owner re-rules, because F1's severity was the input
to the ruling that F1' then blocked. **Result: the hardlink vector is ABSENT
when the vault sits where a real vault sits, and round 1's measurement was
taken inside the sandbox's own granted area.**

Probe: `codex exec --sandbox workspace-write --cd <ws>` with
`approval_policy=never`, the product's shape (`brain.js` `buildCodexArgs`);
`codex-cli 0.146.0`, macOS 26.5.2. Seven operations in ONE script so the raw
output is the evidence, then the filesystem verified from OUTSIDE the sandbox
(the agent's own report is not evidence). Vault under `$HOME`, workspace under
`$HOME`.

| Operation attempted from inside the workspace | Result |
|---|---|
| `ln <vault>/note.md ./alias.md` (alias a vault inode into the workspace) | **DENIED** — `Operation not permitted` |
| write to `./alias.md` | allowed — but `alias.md` is an INDEPENDENT inode (`nlink=1`), a plain workspace file |
| `ln ./payload.md <vault>/CLAUDE.md` (plant a new vault entry) | **DENIED** |
| `printf ... > <vault>/direct.md` (direct vault write) | **DENIED** |
| `mv ./payload.md <vault>/moved.md` | **DENIED** |
| `ln -s <vault-dir> ./symdir` (symlink INTO the workspace) | allowed |
| write through `./symdir/sym.md` (resolves into the vault) | **DENIED** — the sandbox denies by RESOLVED destination, not by lexical path |

Verified from outside afterwards: the vault note is byte-unchanged, its inode
is unchanged, **`nlink=1`** — no link was ever created — and the vault
directory holds nothing new.

**Why round 1 measured the opposite.** The sandbox banner states its writable
roots: `workspace-write [workdir, /tmp, $TMPDIR]`. A first probe run with the
fake vault under `/tmp` reproduced round 1's "success" exactly — all five
operations succeeded and the vault inode was mutated — because `/tmp` is a
GRANTED root, not because the fence is weak. Round 1's reported command used a
relative source (`ln ../live.md linked.md`), which is consistent with the same
granted-area case. **The measurement was correct about what it measured and
wrong about what it established** — the same evidence-reach family this arc
keeps meeting, and this time the author carried it into a ruling without
re-measuring at a realistic location.

**Consequences, offered to the owner as the ruling's input:**

- Round 1's **F1 falls**, and with it the different-filesystem placement it
  produced. Round 2's **F1' becomes moot** — there is nothing to implement.
  Part i's placement row, hardlink-vector row, cost caveat, contract clause,
  Table F row and the two acceptance criteria all trace to that ruling and
  should come out together (HELD — the ruling that put them in was the
  owner's).
- The Codex-arm write fence gains real, bounded evidence in their place:
  measured, the sandbox refuses every attempted route from the workspace into
  a vault outside its granted roots, **including through a symlink**.
- **Bounds this claim must carry and may not exceed:** macOS 26.5.2 seatbelt,
  `codex-cli 0.146.0`, and a vault OUTSIDE `/tmp` and `$TMPDIR` (a vault inside
  them is writable). It is a HARNESS guarantee, so it is defense in depth, not
  the primary barrier — the primary barrier stays "the vault path is not handed
  to the brain, and promotion is the only writer".
- **The family's twice-landed status is UNCHANGED and the escalation stands.**
  Round 1's landing rests on F5 and F10 (a hostile instruction file, and the
  report tree, reached THROUGH promotion) independently of F1; round 2's F4',
  F9' and F5' are promotion-side, in this repo's own process, which no harness
  sandbox constrains.
- **The diagnosis is strengthened, not weakened.** The one place in the whole
  probe that behaved correctly is the row where the OS sandbox denied a write
  by RESOLVED destination while the name looked innocent. Our promotion policy
  is still the lexical one. That is the argument for extracting a single
  identity-anchored write contract rather than adding rules.

### Owner rulings on round 2 (2026-08-22) — and the resulting three-package family

- **The seam: CONTRACT EXTRACTION.** A single identity-anchored vault-write
  primitive, extracted into its own package —
  `WP-dream-vault-write-primitive` (`size: S`, no dependency, ships consumed by
  nothing, exactly as the delta primitive did). It owns **Table H**: policy is
  applied to the RESOLVED path rather than the candidate one (closes F4'), no
  component of the parent chain may be a symlink, the temp is CREATED with a
  crypto-random name and `O_EXCL`/`O_NOFOLLOW` rather than opened (closes F9'),
  the publish is a conditional `rename`, and the returned hash is over the bytes
  actually published so the caller stages from it (closes F5'). **It owns no
  policy**: the rules arrive as the caller's injected `admit`. Extraction rather
  than inlining because Part ii already sits AT the 8-file boundary cap — a
  module plus its test would have taken it to ten — and because the whole point
  of the ruling is that the discipline must be arguable in one place and
  unweakenable from the policy side.
- **F1's placement rows: WITHDRAWN**, the different-filesystem requirement and
  everything that traced to it. Part i's Table F now carries the measured
  sandbox result in their place, with its three bounds, marked defense in depth.

**All of round 2 is now applied.** F1'/F4'/F9'/F5' by the extraction above;
F3' unscannable content is an EP2 REFUSAL, never a pass (the empty scan a
binary record yields is not evidence of safety — today's validator withholds it
explicitly); F7' the deny-list matches CASE-FOLDED on both the baseline and the
promotion side; F8' the child environment is CONSTRUCTED rather than inherited,
which makes the re-target a **seven**-site change and is propagated to every
surface that stated six; F2' the reap precondition is PLATFORM-SCOPED using the
repo's own scope (`reap.js:25-33`), with the win32 leaderless-member residual
named and routed to `WP-a10-windows-reap`; F6' was fixed at record time.

**Family shape after the extraction:**

| Package | Owns | Depends on |
|---|---|---|
| `WP-dream-workspace-retarget` | workspace, constructed baseline, seven-site re-target — Tables A, B, F | the delta primitive |
| `WP-dream-vault-write-primitive` | the one vault-write chokepoint — Table H | nothing |
| `WP-dream-promote-in-workspace` | the decisions and the pipeline — Tables C, D, E, G | both of the above + the delta primitive |

Fix commit: applied in the commit that carries this update.

**Round 3 is owed**, on all three specs: two of them changed substantially and
one is new, and this program's measured fix-injection rate is why the round
after a fix pass is not optional — round 2 found a defect this author had
introduced in round 1's pass.

### Round 3 — 2026-08-22 — reviewer: Codex (gpt-5.6-sol), external

**Does NOT close. 6 findings + 2 questions — but the SHAPE changed, and that is
the result worth reading.** Counts across the arc: 10 → 9 → 6. More important
than the count: **round 3 found not one instance of "another lexical rule is
missing".** The extraction did its job — every finding is now either the
primitive's own contract detail, an author error inside the extraction, or the
known portable-Node limit — and all of them are in ONE module instead of
scattered across a policy table.

All six re-verified against the code before dispositioning; all hold.

**Four were this author's errors in the extraction, and are fixed:**

- **F3' — the dream report was left outside the chokepoint.** Measured: the
  report step does four direct `fs` writes (`validate.js:1374-1408`,
  `mkdirSync`/`writeFileSync`/`appendFileSync`), and an `appendFileSync` onto a
  symlinked report path follows it. The spec meanwhile claimed the primitive was
  "the only way anything writes the vault" — **an unquantified universal, which
  is exactly what the authoring runbook forbids.** Fixed: the report is composed
  in full and published through `writeIntoVault` under a CODE-OWNED report
  policy (C9 denies `reports_dir` and could never authorise it), and the claim
  is narrowed to vault CONTENT files with the writers enumerated in place.
- **F4' — a promoted note whose parent directory does not yet exist could not be
  published.** C3 promotes an added note; `computeDelta` emits no directory
  records; the primitive required the parent to resolve. Nothing created it —
  the brain could never open a new project folder again. Fixed by a new row H9:
  the primitive creates the missing chain segment by segment, `lstat`-verifying
  each before descending, refusing on any symlink, with modes and
  refusal-cleanup stated.
- **F5' — `sha256` is not a stageable object id.** Table E said the index entry
  is built "from its `sha256`". Measured: this repo's object format is `sha1`,
  and for `abc\n` the blob id is `8baef1b4…` against a raw digest of
  `edeaaff3…`. Fixed: the primitive returns the published BYTES, the consumer
  derives a repository-native blob with `hash-object -w --stdin` under the
  constructed git environment and stages it with `update-index --cacheinfo`;
  the digest stays as an independent verification value, and the spec now says
  so in three places because two of them had merged the identities.
- **H3/H4's over-claims.** H3 said the `lstat` walk handled "a
  resolved-then-swapped component"; H4 implied the random `O_EXCL` temp could
  not be defeated. Both were stronger than portable Node permits.

**Two were the known portable-Node limit, and the repo had ALREADY ruled on the
class** — the fix is to adopt the ruled shape rather than invent a new one:

- **F1' (parent component swapped between the walk and the open)**:
  `delta.js:22-40`, owner-ruled 2026-08-21, states it "cannot close that class
  without per-component `openat`, which no `fs` API exposes" and hands the
  caller an ordering obligation. H3 now says the same and names the residual;
  **this family discharges the obligation by ordering — every vault write runs
  after a verified reap, with no live actor holding vault write access.**
- **F2' (temp unlinked and replaced after creation)**: `private-fs.js:270-277`
  already says "pure Node cannot prevent this … but this DETECTS it" and carries
  the opened fd's `(dev, ino)` to a post-`rename` check. H4 now adopts that
  verbatim in shape and says **detection, not prevention** — including the one
  case where H7's leaves-nothing-behind property cannot hold.

**One refinement:** F6' case-folding alone does not close Unicode aliases —
measured here, macOS enumerates decomposed names while accepting composed ones
and `nfc.toLowerCase() === nfd.toLowerCase()` is false for the same inode, so a
composed `projects_dir` and a decomposed `reports_dir` name one directory that
the positive test admits and the negative test misses. Every comparison now
normalises to NFC before folding, layout values included.

**Both questions answered rather than parked:** the constructed child env keeps
a SANITISED `PATH` (dropping it breaks `spawnPinned`'s re-resolution,
`exec-identity.js:451-472`; copying it verbatim can carry a vault-rooted
component), with a new criterion that both harnesses must actually START under
the constructed env — an env that passes the assertion but cannot launch a
harness is a broken product, not a fence. And a new note's mode is now stated
(H10).

Fix commit: applied in the commit that carries this update.

**Round 4 is owed** on the same grounds as round 3 was.

### Round 4 — 2026-08-22 — reviewer: Codex (gpt-5.6-sol), external

**Does NOT close. 9 findings + 1 question — and the count went UP: 10 → 9 → 6 →
9. That reversal is the round's most important output and it goes to the owner
with the findings.** All verified; all hold. Two blockers, both this author's
design errors. One falsehood in a security argument, fixed on the spot. And
**five findings that exist BECAUSE the specs crossed from contract into
implementation** — which is a diagnosis about the spec, not about the reviewer.

**Fixed immediately (a false claim may not stand while a ruling is pending):**

- **F3'' — the ordering discharge was FALSE, and this author wrote it.** Rounds
  3's fix claimed the component-swap residual was discharged "by ordering —
  every vault write runs after a verified reap, with no live actor holding vault
  write access". Measured: the reap is scoped to the BRAIN's process group
  (`cli/dream.js:254-280`) and the run lock excludes another dream process, not
  an editor. **The user's editor is a live vault writer throughout — the entire
  three-way compare exists because it is.** A spec cannot rely on the user's
  concurrency in Table C and deny it in Table H. Corrected in both surfaces: the
  reap removes the brain and says nothing about the user's editor, so the
  component-swap race is an **unclosed family-level named residual**. The
  suspicion was raised in the round's own brief and confirmed — which is the
  cheap way to find this class, and the reason to keep asking reviewers to
  attack a specific claim rather than only to look around.

**Contract-level and genuine — HELD for the ruling below:**

- **F1'' [BLOCKER] — decide-then-write cannot be implemented through the current
  API.** Table E requires every path's outcome decided before ANY vault byte is
  written; C9's admission now happens on the RESOLVED path, which only
  `writeIntoVault` can compute — and that same call publishes. So either a
  refusal is discovered after an earlier path was already written, or the
  "pure decision" phase writes. H9 sharpens it: a missing parent cannot be
  resolved until H9 creates it, and a later refusal leaves the chain behind.
  The family needs a prepare/commit split, or the all-path atomicity claim must
  narrow. **This is a seam defect created by the round-2 extraction** — the
  extraction was right and its API was drawn one call too coarse.
- **F2'' [BLOCKER] — the "code-owned report" design destroys content the shipped
  product produces.** Measured: `skills/wienerdog-dream/SKILL.md:409-425`
  REQUIRES the brain to write the report, including a `## Gated out (and why)`
  section listing every candidate it did NOT write and why — candidate-level
  accounting that **no filesystem outcome can reconstruct**, because those
  candidates never became files. Today's code appends its enforcement section to
  the brain's body (`validate.js:1374-1408`). The specs' report row instead
  composes the report from promotion records and denies brain content under
  `reports_dir`, silently discarding the accounting. **And the fix needs
  `SKILL.md`, which is outside all three packages' boundaries** — Part i's Out
  of scope keeps it out deliberately, because editing it churns the WP-129
  vendored-skill digest. Owner scope call.
- **F4'' — the report's `expect` and its same-day second run are undefined.**
  Two runs on one date share `<reports_dir>/<date>.md`; H5 with no `expect`
  requires the target to be absent, so the second run's report refuses, and any
  append-based workaround re-opens the symlink-following defect F3' closed.
  Follows from F2'' and is held with it.

**Five findings that the SPEC created by over-specifying — the remedy is to CUT,
not to patch:**

F5'' the cited `private-fs` precedent swallows a post-rename `lstat` failure
("best-effort detection — do not fail a legit write", `:354-370`), so "adopts
that precedent verbatim in shape" imported a fail-open. F6'' `git hash-object -w`
from M2's neutral cwd exits 128 — measured — because nothing binds it to a
repository. F7'' `update-index --cacheinfo` needs an index MODE, unspecified,
and the repo has nine `100755` entries. F8'' H9 and H10's mode rules are
mutually unsatisfiable — measured, `mkdir 0755` under umask `0077` yields `0700`
and `open 0644` yields `0600`, so "match the vault root" and "never wider than
umask" cannot both hold. F9'' H7 forbids the throw H4 requires.

**Every one of those five is a mechanism detail, and the authoring runbook
already rules on whether a spec states mechanism:** *"A spec states the contract
and stops there … never how. Test designs, fixture shapes, mutation lists and
code structure belong to the implementer … **A spec that prescribes the tests
has taken the implementer's job and doubled the surface that can rot.**"* By
writing `lstat`-failure semantics, git flag mechanics, `cacheinfo` modes and
umask arithmetic into contract tables, this author manufactured five surfaces
for a reviewer to find contradictions in — and a sixth round would find the
next five. **The count going 6 → 9 is that mechanism at work, not new risk
appearing in the design.**

**THE CONVERGENCE SIGNAL, stated for the owner.** This program reset itself
because a review loop plateaued at 6–9 findings per round and never reached
zero (24 → 15 → 16 → 9 → 10 → 6 → 9 → 7 → 9 → 4 → 6 → 7). This loop now reads
10 → 9 → 6 → 9. **It is the same curve.** The stop criterion's remedy for a
repeated contract family is extraction, and extraction has already been spent
once — correctly, and it worked for what it addressed. The remaining divergence
is not a design problem that another extraction fixes; it is a spec that
prescribes mechanism. Recommended to the owner, and NOT applied unilaterally:
cut rows H3–H10 back to observable properties with the mechanism left to the
implementer, fix F1''/F2''/F4'' as contract defects, and re-run one round on the
cut text. If that round still returns mechanism findings, the loop is telling us
something about the size of the artifact rather than about its content.

Fix commit for F3'' only: applied in the commit that carries this record.
Everything else: **HELD — owner ruling requested**, on two questions: the
`SKILL.md` scope for the report, and whether to CUT the mechanism-level rows
rather than patch them.

### Owner rulings on round 4 (2026-08-27) — and the cut

Both questions round 4 escalated came back ruled. Relayed from the war-room
session; applied here in one edit pass, before the next round.

**RULING 1 — F2'' (report scope): Option A. The report stays BRAIN-AUTHORED.**
The specs align to the shipped skill contract; `skills/wienerdog-dream/SKILL.md`
is NOT edited and stays outside all three boundaries, so there is no WP-129
digest churn. Verified against the tree before applying: `SKILL.md:409-425`
does require the brain to write `<reports_dir>/<today>.md` including a
`## Gated out (and why)` section, and does say "the orchestrator appends its own
… section to this same report … you write the candidate-level accounting above
it". The code-owned-report design is dropped everywhere it appeared.

What changed, and where:

- **Part i, Table A copy-in exclusions** — `reports_dir` LEAVES the exclusion
  list. It has to: the brain's report must be written inside its write root,
  and a same-date second run's existing report must be in the BASELINE, or
  Part ii's C4 refuses it as an `added` path that already exists in the vault.
  A new acceptance criterion goes red if `reports_dir` is treated as an
  exclusion.
- **Part ii, C9** — `reports_dir` moves from DENIED to ADMITTED. **Round 4's
  F10 dissolves with it**: the overlap check existed to keep brain content out
  of a code-owned report tree, and there is no such tree now.
- **Part ii, Table D report row** — rewritten. The body is an ordinary
  promotion candidate (delta sees it, four gates judge it, the primitive
  publishes it); code then APPENDS its accounting as a SECOND write through the
  primitive with `expect` set to the bytes the first publish returned — never an
  in-place append, which is what re-opened F3'. Fallback stated: if a gate
  refuses the brain's body, code publishes its section alone, so the
  enforcement record always reaches the user.
- **F4'' is RESOLVED by this ruling, not left open.** Two runs on one date need
  nothing special once the report is an ordinary candidate: run 1 promotes with
  `expect` absent, run 2 finds the first report in the baseline and promotes a
  `modified` with `expect` set to the vault's current bytes.

**RULING 2 — CUT, not PATCH.** Rows H3–H10 of the primitive and Table E's git
mechanics are cut back to OBSERVABLE PROPERTIES: what must be true of the end
state, what must be refused, what must never happen. Mechanism — syscall
choices, git flags, index modes, umask arithmetic, error-handling internals —
returns to the implementer, and acceptance criteria test visible behaviour only.
The five round-4 findings that the specs manufactured are NOT patched; they
dissolve with the rows that carried them:

| Round-4 finding | Disposition |
|---|---|
| F5'' — the cited `private-fs` precedent swallows a post-rename `lstat` failure | DISSOLVED. The precedent is now cited as proof the class is solvable to a stated bound, not as a shape to copy. The withdrawn "verbatim in shape" wording is named in place so the import cannot return silently |
| F6'' — `git hash-object -w` exits 128 from the neutral cwd | DISSOLVED with Table E's prescription |
| F7'' — `update-index --cacheinfo` needs an unspecified index mode | DISSOLVED with the same row |
| F8'' — H9/H10's two mode rules are mutually unsatisfiable | DISSOLVED. H10 now states ONE rule: a new note is neither more restricted nor more exposed than one the user creates in the same directory |
| F9'' — H7 forbids the throw H4 requires | DISSOLVED. H4 no longer prescribes a throw, so H7's carve-out goes with it |

**F1'' fixed as a contract defect, by the simpler of the two options the ruling
offered: the CLAIM is narrowed, the API is not split.** Measured statement of
the defect: `writeIntoVault` performs its premise-still-holds check inside the
call, at publish time, so "every path's outcome is decided before any vault byte
is written" could not be true of the `expect` guard. Table E now says what is
true — every POLICY outcome (allowlist, merge, all four gates) is decided first,
and a path may still turn into refuse-and-report during the write phase. A
prepare/commit split would buy write-atomicity across paths, which this package
already disclaims as the residue-lifecycle successor's subject, at the cost of a
second contract surface. Recorded here and to be repeated under "Decisions made"
in the PR body.

**F3'' stands as fixed in the previous commit** (the ordering discharge was
false); nothing here reopens it.

**NEXT — pre-agreed interpretation, recorded before the round runs.** Exactly
ONE external adversarial round on the cut text. If that round still returns
mechanism-level findings, the loop is signalling artifact SIZE rather than
content: **stop and escalate to the owner rather than patching further.** The
round counter continues at 5.

### Round 5 — 2026-08-27 — reviewer: gptsol (Codex side), external

**Does NOT close. 4 findings — 3 CONTRACT defects, 1 MECHANISM. All four
verified on the tree by this author; all hold. Raw output:
`2026-08-27-promote-pair-round-5-gptsol-raw.txt` (relayed verbatim, uncut).**

Gate hygiene, recorded because a verdict whose checks did not run is a reading:
the vendored prompt body hashed `f3b28a6c…`, equal to the pinned value; the
reviewer reported what it EXECUTED, including one command that exited 1 and was
rerun; `git status --porcelain` was byte-identical and empty before and after —
the run is VALID.

The count reads 10 → 9 → 6 → 9 → **4**, and for the first time in this loop it
fell rather than rebounded.

**THE PRE-AGREED TRIGGER FIRED, AND IT IS BEING FOLLOWED: nothing is patched
here, this goes to the owner.** But the trigger's PREMISE does not survive
measurement, and that is this round's most important output.

The pre-agreed reading was: a mechanism finding means the artifact is too LARGE.
Measured, all four findings — the mechanism one included — are the same defect
class, and it is not size:

| Round-5 finding | What it actually is |
|---|---|
| F1 (report fallback undefined) | the Option A edit added a fallback branch and never gave it bytes or an `expect` premise |
| F2 (throw vs `{written:false}`) | H4 was cut; the JSDoc at `:178-179` still prescribes the throw H4 used to require, and the new security-checklist item calls the same detection optional |
| F3 (H9 row vs its criterion) | the H9 ROW was rewritten to "a refusal leaves no partially-created chain behind"; its criterion at `:296-301` still says the chain "is left in place" |
| F4 (mechanism residue) | Current state `:125` still names the adopted `O_EXCL\|O_NOFOLLOW` shape, and the consumer's Table E restates it |

**Every one is a canonical row edited without its registered mirrors.** The
Mirrored Surface Checklist exists precisely to make that impossible, and this
author did not run it after the cut. That is a diagnosis about the EDIT PASS,
not about the artifact's size — and the remedy is a mirror sweep, which is
mechanical and bounded, not another extraction and not a split.

**Recorded honestly: three of the four defects were introduced by the 2026-08-27
edit pass itself**, i.e. by the very commit that applied the rulings. The round
earned its keep by catching them before an implementer did.

**HELD for the owner**, per the pre-agreed escalation:

1. Whether the size interpretation still applies, given that the mechanism
   finding is a stale mirror rather than over-specification. This author's
   measured recommendation is that it does NOT, and that the correct next step
   is one mirror sweep plus the F1 fallback matrix — but the interpretation was
   pre-agreed with the owner and is not this author's to revise.
2. The F1 fallback matrix is a genuine design gap with real user-visible
   consequences (a lost report or a lost enforcement record), and needs a
   ruling on what the refused-body case must preserve.
3. F3's substantive question — must a refusal leave the vault byte-unchanged,
   including directories the call created? That is a contract decision, not a
   mechanism one.

### Owner ruling on the round-5 escalation (2026-08-27) — and the mirror sweep

**RULING — question 1: the SIZE interpretation does NOT apply; the mirror sweep
is APPROVED.** Basis, as relayed: all four round-5 findings are one class — a
canonical row edited without its registered mirrors — and three of the four were
introduced by the `af85247` ruling edit itself. A skipped mechanical step, not
over-specification; the count's first real fall (9 → 4) reads the same way.

Scope as ruled: a MECHANICAL pass bounded by the Mirrored Surface Checklist, no
free editing. **F1 excluded** (a genuine contract defect, under owner ruling).
**F3's H9 pair excluded** until the substantive ruling lands.

**A contradiction inside the ruling, reported rather than resolved by this
author.** Its first bullet says the sweep "closes F2, F3, F4"; its third says to
leave the H9 row and its criterion untouched and flag them if the sweep reaches
them before the F3 ruling. F3 *is* that pair, so the sweep cannot close it. The
narrower, conservative bullet was followed: **H9's row and criterion are
byte-untouched**, verified mechanically in the sweep commit's own diff.
**F3 therefore remains OPEN.**

**What the sweep changed — five stale mirrors, each brought to its canonical
row, none re-decided:**

| Mirror | Canonical row it now follows |
|---|---|
| the signature's substitution-throw clause | H7 — refusal is by RETURN; the only throw is a caller-contract violation. Closes **F2** |
| the signature's `sha256` cell, which told the consumer to derive a blob id from it | Table E of the consumer, as CUT — how bytes reach a commit is the consumer's, and naming it here mirrored a withdrawn row. **Found by the sweep itself**, on the same surface F2 sits on; the round did not name it |
| Current state's "the hardened temp-create shape this package adopts" | H4 as CUT — the precedent proves the class is solvable to a stated bound; the shape is the implementer's. Part of **F4** |
| the verification block's deliberate-red ("a predictable temp name") | H4 as CUT — the red now names a BEHAVIOUR to break (the target written in place, so partial content is observable). Part of **F4** |
| the consumer's publish row, restating `O_EXCL\|O_NOFOLLOW` and `rename` | Table H's observable properties, which is all a consumer may restate. Part of **F4** |

One Implementation note was corrected rather than removed: the `O_NOFOLLOW`
win32 warning stays — it is a real repo-established trap and the template
sanctions trap notes — but its claim that "the H3 walk carries the weight" is
withdrawn, because H3 now states a refusal and not a walk.

**Verified after the sweep:** lint green; frontmatter 226 specs; 73 `file:line`
citations resolve with ranges checked at both ends; `{written:false, reason}` is
now the only failure shape named anywhere in the primitive's contract surfaces.

**Still OPEN, awaiting the owner:**

1. **F1** — the refused-body report fallback matrix. The genuine design gap:
   candidate bytes, `expect` premise, gates and accounting are undefined for the
   absent / unchanged-existing / diverged-existing / concurrently-changed cases,
   so an implementer can lose either the previous report or the enforcement
   record while conforming to the stated happy path.
2. **F3** — must a refusal leave the vault byte-unchanged, including directories
   the call itself created? Until this lands, the H9 row and its criterion
   contradict each other in the shipped text, deliberately and on the record.

### Owner ruling on F1 (2026-08-27) — PRESERVE-AND-EXTEND

**RULING: the refused-body report fallback preserves BOTH values at stake — the
report already in the vault AND this run's enforcement record — and never
chooses between them.** Applied to `WP-dream-promote-in-workspace` as a new
canonical table, **Table R**, registered in the Mirrored Surface Checklist on
the spot. Table D's report row now CITES it and no longer describes the
fallback; the promotion-accounting row and the primitive-seam criterion were
swept in the same pass.

The shape, as ruled: the normal path's second write generalised — read the
vault's current report bytes, compose in memory, publish the whole as ONE
primitive write with `expect` set to the bytes just read. No new mechanism, no
new naming; the only difference is that the base is what the vault currently
holds rather than what this run just published. Four cases (absent /
unchanged-existing / diverged-existing / concurrently-changed), one acceptance
criterion per case, plus one asserting the fallback is accounted as itself.
**R3 is the case that carries the ruling's weight** — the fallback preserves the
user's diverged bytes verbatim and never reconstructs or "corrects" them; its
criterion goes red against any implementation that repairs. **R4 is a named,
accepted residual**: the `expect` guard refuses, the enforcement record goes to
the run's output rather than the vault, because an overwrite in that window
would clobber the user's live edit.

Rejected alternatives recorded in the table so they are not re-proposed:
overwrite, a distinct fallback filename, silent refusal.

**ONE MEASURED COLLISION, FLAGGED IN PLACE AND HELD FOR THE OWNER — the ruling
could not have seen it.** The ruling says the composed fallback passes the gates
like any candidate. Measured against the tree, that can destroy the value the
table exists to protect:

- the enforcement section interpolates `r.path` (`validate.js:1385-1386`), a
  vault-relative path the BRAIN chose — so the section's content is
  attacker-influenceable;
- today's code appends the report **after** the EP2 gate deliberately, and says
  why in as many words: "Runs AFTER the EP2 gate so a secret-revert reason lands
  in the report" (`:1375-1377`).

So a secret-shaped path in an enforcement line can get the composed report
withheld or redacted, losing the enforcement record on exactly the branch that
exists to deliver it. Nothing is decided on this; the flag sits in Table R and
names the two narrowest resolutions for the owner to choose between — scan only
the preserved region and exempt the code-authored section, or sanitize the
interpolated path (the repo already ships that sanitizer,
`WP-sanitize-project-display-names`).

**F3 remains the only other open item**; H9's row and criterion are untouched,
verified mechanically against `11ab732` — this pass did not modify the primitive
spec at all.

### Owner ruling on F3 (2026-08-27) — empty-only unwind; round 5 is now fully dispositioned

**RULING: a refusal removes the directories THIS CALL created that are STILL
EMPTY at removal time. Anything it created that has meanwhile acquired content
is LEFT IN PLACE and NAMED in the refusal. Two hard prohibitions: the call never
removes anything it did not create, and never removes anything non-empty.**

Applied to `WP-dream-vault-write-primitive`'s H9 row and its criterion, which
**ends the deliberate contradiction round 5 found (F3) and closes it.** H7's row
and criterion were swept in the same pass — H7's "nothing is partially written"
now points at H9 for the directory bound instead of implying an absolute, and
its criterion no longer says "there is no exception" when H9 names one. The new
residual is registered in the Security checklist beside the others. On the
consumer side, C1's "Nothing is written to the vault" was bounded to "no
CONTENT", citing H9 — it was the one mirror that would otherwise have gone
quietly false.

**The ruling's load-bearing claim was measured before being written down, not
after.** It rests on removal-of-non-empty failing by construction; measured on
Node 24.18, `rmdirSync` on a directory holding one file fails `ENOTEMPTY` and
the file survives. "Protected by shape, not by care" is therefore a property of
the platform here, and the row carries that as one provenance line. Had it
failed, the ruling's rationale would have needed the owner again.

Also verified in this pass: the two remaining `byte-identical` claims in the
consumer (the pipeline-level CLAIM 1 criterion and the abort-paths criterion)
are NOT mirrors of H9 — both describe paths on which no `writeIntoVault` call is
made at all, so no directory is created and the residual cannot arise. Left
unchanged deliberately, recorded so a later round does not re-open them.

**ROUND 5 IS NOW FULLY DISPOSITIONED: F1 ruled and applied (Table R), F2 and F4
closed by the mirror sweep, F3 ruled and applied here.**

**Still open, and it is the only thing open:** the gate-ordering question inside
Table R — whether the composed fallback report passes the EP2 gate, given that
its enforcement section interpolates a brain-chosen path and that today's code
deliberately appends the report AFTER that gate so a secret-revert reason can
land in it. Acknowledged by the owner as a genuine question; ruling to follow;
nothing in Table R touched pending it.

**The loop's state, stated plainly because no ruling changes it.** Rounds 1-5
ran 10 → 9 → 6 → 9 → 4. The stop criterion — one external round returning no
finding about the PRODUCT — has never been met. Every finding from round 5 is
now dispositioned, which is the precondition for another round, not a
substitute for one.

### Owner ruling on the Table R gate-ordering question (2026-08-27) — round 5's last open item closes

**RULING: two rules, neither of the flagged options alone.** (1) The PRESERVED
REGION is not re-gated — gates guard content ENTERING the vault, not content
residing in it, and re-scanning bytes that are already vault content protects
nothing while it can destroy the enforcement record or mutate the user-edited
bytes R3 forbids. (2) The CODE-AUTHORED SECTION is neutralised at COMPOSITION
time — every interpolated value passes through BOTH the shipped sanitizer and
EP2's redact arm before entering the section.

Stated as the observable property, which is how it went into Table R: **the
code-authored section can never carry bytes any gate would refuse, so no gate
exemption exists and none is needed.** Gate refusal on this branch is impossible
by construction, and the record's only remaining refusal path is the `expect`
guard — R4, already a named residual.

**Scope widened where the ruling's logic reaches, and said so explicitly:** the
neutralisation rule governs the code-authored enforcement section WHEREVER it is
composed — the normal second write as well as the fallback — because the same
interpolation happens in both. Table D's report row now cites Table R for it
rather than restating; the acceptance criterion covers both branches in one
case. Leaving the normal path ungoverned would have left the unscanned
brain-influenced channel open on the common path while closing it on the rare
one.

Both flagged options are recorded in the rejected-alternatives row as
insufficient ALONE, with the ruling's reasons: exempting the section opens an
unscanned brain-influenced channel (`r.path` is attacker-influenceable, so a
secret in a filename rides through); sanitizing alone still lets a secret-shaped
path or user-edited preserved bytes get the whole report withheld.

**One measured cost of rule (2), named rather than absorbed.** The shipped
sanitizer is `sanitizeProjectName` (`digest.js:414-418`, exported at `:867`),
built for display NAMES: it replaces every character outside
`[\p{L}\p{N}\p{M} ._-]` with `_`, **path separators included**. Measured:
`01-Projects/customer/note.md` → `01-Projects_customer_note.md`. The refused note
stays identifiable, which is what the record is for, but the line stops being a
copy-pasteable path. Recorded in Table R as an accepted, stated cost — a
path-preserving sanitizer would be a new product surface and the ruling chose the
shipped one.

The author's flag that opened this question is kept in Table R as the record of
how it was found; both of its measurements still hold. What the ruling changed is
that the question DISSOLVES rather than being traded off.

**ROUND 5 IS CLOSED — every finding ruled and applied, no open items.**

Verified after this pass: lint green, frontmatter 226 specs, 75 `file:line`
citations resolve with ranges checked at both ends (one was corrected in this
pass — `digest.js:413-418` began on the JSDoc's closing line rather than on the
function, and is now `:414-418`).

### Round 6 — APPROVED by the owner, to run on the WHOLE SETTLED TEXT

Not on any single ruling's diff. Rationale accepted from this author's report:
four consecutive substantive edit commits with no review pass over the result,
and round 5's own lesson is that an edit pass introduces defects of its own —
three of its four findings came from the ruling edit that preceded it. The round
runs on all three specs at the post-ruling tip.
