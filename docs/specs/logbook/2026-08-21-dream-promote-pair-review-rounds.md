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
