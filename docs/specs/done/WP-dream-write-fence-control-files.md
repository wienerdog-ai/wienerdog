---
id: WP-dream-write-fence-control-files
title: Deny the dream every write to a control file, over the set the run actually commits
status: Superseded
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0025]
epic: audit-2026-07-29
---

# WP-dream-write-fence-control-files: structural denial of control-file writes

> **SUPERSEDED 2026-08-20 — never implemented; kept as the record of why.**
> Two adversarial rounds established that this package holds three independent
> mechanisms, and that each got only partial attention in both rounds. The owner
> split it along the contract-table seams into three packages, run strictly in
> order (WIP = 1), each with its own round counter starting from zero:
>
> | Successor | Inherits | Closes |
> |---|---|---|
> | `WP-dream-control-file-fence` (C1) | Tables A + D, plus `src/cli/dream.js` | M7, and M10 as far as a status-based fence reaches |
> | `WP-dream-git-seam-hardening` (C2) | Tables B + E | M9's own-defense half |
> | `WP-layout-dot-rejection-notice` (C3) | Table C | the migration hazard this package introduced |
>
> Why, in full, with every round's raw output and the owner's rulings:
> `docs/specs/logbook/2026-08-20-dream-write-fence-control-files-review-rounds.md`.
> **Nothing below this banner was implemented.** It is retained because the two
> rounds' findings — the same-run ignore bypass, the destroyed user data, the
> cross-run precommit promotion — are the reasons the successors are shaped as they
> are, and because a reader who reaches for the naive fence needs to find the
> measurement that says it is worse than doing nothing.

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** spawns a headless AI
brain under a code-owned hermetic runtime profile (ADR-0025), lets it write into
the user's Obsidian **vault** — which is a git repository — and then runs a
code-owned **validator** (`src/core/dream/validate.js` `validateAndCommit`) that
classifies every change the run produced, reverts what policy forbids, and
commits the rest as one revertible commit with a report. The validator is the
dream's **write fence**: the brain proposes, code disposes.

The brain's input is untrusted by construction — it consolidates session
transcripts carrying external `tool_result` content — so a **steered dream**
(threat class T2) is the design's standing assumption, not an edge case. The
profile denies it Bash, network, MCP and every escalation tool
(`src/core/runtime-profile.js:58`, `:81`); what it has is Write and Edit inside
the vault.

**The fence has no notion of files that control machinery.** Its classification
knows three special cases — a containment escape, the learnings ledger, and
Tier-3 (identity and skills) — and everything else falls through to "keep and
commit". A vault-root `CLAUDE.md`, an `AGENTS.md` at any depth, or a `.gitignore`
is none of those. The 2026-07-29 audit reproduced this on a live dream-profile run
as three findings in `docs/security-audit/2026-07-29/CURRENT-IMPLEMENTATION-REVIEW.md`:
**M7** (`:676`, Major — a planted instruction file re-steers later runs and any
session the user starts in the vault), **M9** (`:841`, Minor — git control state
sits inside the fence, and the validator's own `git add` / `git commit` then
execute what was planted there), and **M10** (`:931`, Major — the dream can write
the ignore file, and an ignored path never enters the classification loop at all).

One root cause covers all three, so one work package closes them. The fix is
**structural denial**, ruled by the owner on 2026-08-05: remove whole shapes of
path from the writable surface — a class, never a maintained list of known-bad
names.

**The fence is defined over the set the run actually commits, not over one
snapshot.** This is the load-bearing correction of 2026-08-20, and it exists
because the naive form was reproduced as an attack. `git status` output depends on
the repository's ignore state, which the dream can change *in the same run*: it
writes a `.gitignore` hiding `CLAUDE.md` plus the `CLAUDE.md` itself, the loop sees
only the `.gitignore`, denying it **un-hides** the instruction file, and the later
`git add -A` stages and commits it. Measured on the pinned tree — and measured
against today's behaviour too, where that same chain leaves `CLAUDE.md` *out* of
the committed tree: a snapshot-only fence would be **actively worse than doing
nothing**, not at parity with it. (The file today instead sits on disk, untracked
and ignored, surviving `git clean -fd` — which is M10, and which is also the
reminder that **disk, not git history, is the real attack surface**: the harness
reads the file, not the tree.)

## Current state

`src/core/dream/validate.js` (1469 lines). All line numbers verified at `1d4c092`:

- `git(vaultDir, args, opts)` (`:67-84`) is the single spawn seam for every
  validator git call: `spawnPinnedSync('git', …, {args: ['-C', vaultDir, ...args],
  env: process.env, …})`. **Nothing sets `core.hooksPath`, no call passes
  `--no-verify`, and neither string appears anywhere in `src/`.** The only `-c`
  overrides are `user.name` / `user.email`.
- Pipeline order: `precommitSessionEdits` (`src/cli/dream.js:493`) → brain (`:510`)
  → `validateAndCommit` (`:558`). The precommit call (`validate.js:122-137`)
  commits the user's pending vault edits **before** the brain runs — but only
  those `git status --porcelain -uall` can see, which is the limit this WP must
  respect: it proves nothing about ignored paths, and nothing about what the user
  saves *while* the brain runs.
- `changedPaths(vaultDir)` (`:1020-1021`): `git status --porcelain -z -uall`. No
  `--ignored`, so an ignored path produces no entry (M10).
- The classification loop (`:1145-1209`) runs in order: (a) containment escape
  (`:1148`) → revert + `outOfVaultDetailed`; the learnings ledger (`:1154`);
  Tier-3 (`:1170`), where `isTier3` (`:1087-1090`) matches only the layout's
  identity-dir prefix (case-insensitively) and skills-dir prefix; and (c) the
  fall-through at `:1208` — "keep". `.gitignore`, `CLAUDE.md`, `AGENTS.md` land on (c).
- `git add -A` runs again at `:1223` (before the EP2 secret gate) and `:1412`
  (before the commit). **Neither re-consults the classification.**
- Denials record `{path, reason}` on `reverted[]` (`:1100-1101`), rendered into the
  committed report's `## Reverted by orchestrator (policy enforcement)` section
  (`:1384-1391`) and counted at `src/cli/dream.js:617`. Transcript deferral keys on
  `secretReverts`, **not** on `reverted[]` (`:1062-1072`, `dream.js:578`).
- `revertPath(vaultDir, rel, untracked)` (`:660-667`): `fs.rmSync` when untracked,
  else `git checkout HEAD -- rel`. **Both destroy the working-tree bytes.**
- `quarantinePreserve(stateDir, vaultDir, rel, date, kind='withheld')` (`:703-738`)
  already exists: copies the working-tree bytes into `<stateDir>/quarantine/`
  (dir 0700, file 0600, atomic, name `<date>-<sanitized-basename>` with a numeric
  collision suffix), returns `{name, bytes}` or `null` on any failure. The EP2
  secret gate uses it, and at `:1296-1312` refuses to destroy a file when no
  durable copy was saved — naming the mid-dream-save case explicitly. That is the
  precedent this WP follows.
- `restoreVaultToHead` (`:146-149`): `git reset --hard HEAD` + `git clean -fd`,
  deliberately not `-x` (`:141-143`); `src/core/adopt-git.js:15-21` is why — the
  project's own default ignore set covers Obsidian plugin binaries,
  `.obsidian/workspace*`, `.DS_Store`, `.trash/`: real user data.
- Other worktree-touching verbs: `checkout` (`:665`), `clean` (`:148`),
  `reset --hard` (`:147`), `add` (`:125`, `:1223`, `:1331`, `:1412`),
  `hash-object -w --path` (`:874`), `commit` (`:131`, `:1437`).
- Zero `.git` handling anywhere in `validate.js` or `brain.js` (grep, 0 hits).

`src/core/layout.js` (174 lines): `defaultLayout()` (`:33-42`) returns the seven
built-ins — `06-Identity`, `07-Daily`, `YYYY-MM-DD.md`, `01-Projects`, `05-Skills`,
`reports/dreams`, `00-Inbox` — none with a dot-prefixed segment.
`isSafeRelativePath` (`:65-71`) rejects empty, absolute, backslash-bearing and
`..`-bearing values and nothing else; `readVaultLayout` falls back per key,
**silently**, when it returns false (`:115-118`). `src/core/layout-infer.js:40-46`
holds a **copy** of that function (its JSDoc says so) used by `inferLayout` for
`wienerdog adopt`; `topLevelDirs` (`:21-31`) does not filter dot-directories.
Measured at `1d4c092`: a vault containing `.skills/` makes `inferLayout` propose
`skills_dir: ".skills"`, and `readVaultLayout` accepts `skills_dir: .skills`.

`src/cli/sync.js` calls `readVaultLayout(paths.config)` at `:270` and already owns
a code-owned notice surface: `summary.notices`, printed with a `note:` prefix at
`:345`. This WP reuses it; it adds no channel.

**Consumer status of a planted instruction file, stated as it is.** The brain is
spawned with no `harness` argument (`src/cli/dream.js:144-146`), so it always takes
the Claude branch and a neutral staging cwd (`brain.js:198`). The Codex branch,
whose `cwd = vaultDir` would load a vault-root instruction file, exists at
`brain.js:187-189` but is unreachable today: the only `harness: 'codex'` producers
are transcript-source sites (`src/core/transcripts/codex.js:132`, `:208`,
`src/core/transcripts/index.js:87`), none of which reaches the brain. The file is
written and left on disk today regardless — M7's live run reproduced that — and any
session the user starts in their own vault is already a consumer. **The rationale
is structural denial at the write, not the reachability of one consumer.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the control-file fence per Table A, evaluated to fixpoint over the committed set; preservation-before-destruction per Table D; the git-seam neutralization per Table B |
| modify | src/core/layout.js | `isSafeRelativePath` gains the dot-segment condition, and the module reports which keys that condition rejected (Table C) |
| modify | src/core/layout-infer.js | its copied `isSafeRelativePath` gains the same condition (Table C) — the copy stays a copy |
| modify | src/cli/sync.js | one code-owned notice on the existing `summary.notices` surface when Table C rejected a key (Table C) |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/layout.test.js | as above |
| modify | tests/unit/layout-infer.test.js | as above |
| create | tests/unit/sync-layout-notice.test.js | as above |

### Exact contracts

The denial reason strings are code-owned literals — this is the single place their
bytes are decided. Each is a **base** plus exactly one **outcome suffix**. All are
NEW strings; no existing reason string in the validator's vocabulary changes.

```text
base-dotseg:  control-file fence: a path segment starting with "." is outside the dream's writable surface
base-instr:   control-file fence: an AI-instruction filename is outside the dream's writable surface at any depth
suffix-ok:    ; reverted. The working-tree copy is state/quarantine/<name>.
suffix-nopreserve: ; NOT reverted and NOT committed — no durable copy could be saved, so the file was left on disk untouched.
```

Worked example — the reproduced attack. A dream run writes `.gitignore`
(containing `CLAUDE.md`), `CLAUDE.md`, and a legitimate `07-Daily/2026-08-20.md`.
Pass 1 sees only `.gitignore` and the daily note; the `.gitignore` denial runs
first (Table A), which un-hides `CLAUDE.md`; pass 2 denies it. The daily note is
committed; the report's enforcement section reads:

```markdown
## Reverted by orchestrator (policy enforcement)
- `.gitignore` — control-file fence: a path segment starting with "." is outside the dream's writable surface; reverted. The working-tree copy is state/quarantine/2026-08-20-gitignore.
- `CLAUDE.md` — control-file fence: an AI-instruction filename is outside the dream's writable surface at any depth; reverted. The working-tree copy is state/quarantine/2026-08-20-CLAUDE.md.
```

## Contract reference

Activation (ADR-0031, 2-of-7): **(ii)** the denial-reason taxonomy gains entries;
**(iv)** reason-code, revert and fallback behavior changes; **(v)** the fence emits
a quarantine copy whose lifecycle the secret-quarantine surface owns; **(vi)** the
dream report, the CLI summary, `sync` and the successor disclosure WP inherit the
contract. Four of seven — the discipline is on.

### Table A — the control-file fence

| Fact / rule | Value |
|-------------|-------|
| **What the fence is defined over** | the set of paths the run **commits**, not the first `git status` snapshot. A path may become visible only *because* a denial changed the repository's ignore state, so one pass is not a fence — measured, see Context |
| Rule 1 — scope | any `rel` having at least one `/`-separated segment whose first character is `.` |
| Rule 2 — scope | any `rel` whose `path.basename(rel)` equals a member of the instruction-name set, compared **case-insensitively** (a case-insensitive filesystem makes `claude.md` the same file — the same reason `isTier3` lowercases its identity prefix, `:1087`) |
| Instruction-name set (code-owned constant) | `AGENTS.md`, `AGENT.md`, `CLAUDE.md`, `CLAUDE.local.md` |
| Why those four, and no more | `AGENTS.md` and `CLAUDE.md` are the two names **this repository itself installs managed instruction blocks into** (`src/adapters/codex.js:50`, `src/adapters/claude.js:39`) — in-repo evidence, not a claim about a tool this project cannot test. The other two are near-variants, included because a false denial costs nothing the dream needs while a miss is a persistence hole. Extending the set is not how this rule grows — see the residual |
| Precedence between the rules | rule 1 first; a path matching both records rule 1's base. Deterministic, so the reason for e.g. `.claude/CLAUDE.md` is fixed |
| **Ordering within a pass (load-bearing)** | denials of paths that can change ignore visibility — a `.gitignore` at any depth — are applied **first**, and visibility is recomputed only after them. Without this, a user's until-now-ignored file is judged by the fence in the same pass that un-hid it. Measured: reverting the dream's edit to a tracked `.gitignore` re-hides such a file, so it is never denied and never touched |
| **Un-staging after a revert** | a path that became ignored again as a result of a revert is removed from the index with `git rm --cached` **before** the fence recomputes. Measured on git 2.50.1: restoring the ignore rule does **not** unstage an already-staged file, and a further `git add -A` does not either — `git status` keeps reporting it `A`. `--cached` leaves the file on disk, which is the wanted outcome |
| **Termination** | iterate until the visible-and-staged set stops changing. Bounded by construction: a `.gitignore` revert restores that path to its HEAD state, which is not a change, so the number of visibility-affecting reverts cannot exceed the number of such paths the run touched. The implementer additionally caps the iteration count and **fails closed** (restore to HEAD, commit nothing, record the reason) if the cap is reached |
| **Postcondition (the actual contract)** | at the moment of the commit, no path in the staged set violates rule 1 or rule 2 |
| Where it runs | the classification loop (`validate.js:1145`), evaluated after the containment case (`:1148`) and before the ledger case (`:1154`), so ledger, Tier-3 and the `:1208` keep are unreachable for a denied path whatever the layout maps |
| Action on match | preserve, then revert, then record — per **Table D**, which owns the destruction rules |
| Reason strings | the base + suffix literals under "Exact contracts", byte-exact |
| Reason vocabulary | all NEW strings. No existing reason string is edited, reworded or reused |
| Report and CLI | denied paths appear in the report's enforcement section (`:1384-1391`) and in `reverted.length` on the CLI summary line, by the existing plumbing — no new surface |
| Transcript deferral | unchanged: deferral keys on `secretReverts`, never on `reverted[]` |
| What rule 1 covers for free | `.git/`, `.gitignore`, `.gitattributes`, `.claude/`, `.codex/`, `.mcp.json`, `.obsidian/`, `.smart-env/`, `.cursorrules` and every future dot-prefixed control convention — the point of a class over a list |
| **The bound of this whole mechanism** | it closes **tree-based** hiding only. Measured: `.git/info/exclude` and `core.excludesFile` hide a path from `git status --porcelain -uall` exactly as `.gitignore` does, and neither is stageable, so re-checking the staged set structurally cannot see them. This is not a new gap — the fence never sees under `.git/` because git reports no status there — but it is the honest limit of the fixpoint, and it belongs to the residual class in Table E |

### Table B — the git seam

| Fact / rule | Value |
|-------------|-------|
| Neutralization site | the shared `git()` helper (`validate.js:67-84`), so **every** validator git invocation carries it — `add`, `checkout`, `clean`, `reset`, `status`, `rm`, `hash-object` and `commit` are all spawned through this one function |
| Flag | `-c core.hooksPath=/dev/null`, prepended to the spawn args ahead of `-C` |
| Portability of that value | measured on git 2.50.1 (Apple Git-155): with the flag an executable `.git/hooks/pre-commit` does not run and every verb still exits 0. A `core.hooksPath` naming a **nonexistent** directory suppresses hooks identically (measured) — the Windows answer: `/dev/null` there is simply a path with no hooks under it |
| Commit flag | `--no-verify` on both commit invocations (`:126-134`, `:1432-1440`) |
| Preserved | the `-c user.name` / `-c user.email` overrides, both commit messages, and `env: process.env` are unchanged |
| **What this CLOSES — precisely** | the **hook** surface, and only that. Measured: a planted `.git/hooks/pre-commit` runs on the validator's exact commit shape and does not run with these two flags |
| What it does NOT close | every other repo-local execution surface — Table E's class. Measured with both flags set: a `clean` filter from `.git/config` + `.git/info/attributes` still runs on `git add -A`, on `git hash-object -w --path` (`:874`) and, as `smudge`, on `git checkout HEAD -- rel` (`:665`) — the fence's own revert path; `core.fsmonitor` runs an external program on `git status`; a repo-local `gpg.program` under `commit.gpgSign` runs on the commit |

### Table C — the layout dot rule and its notice

| Fact / rule | Value |
|-------------|-------|
| Sites (two, deliberately duplicated) | `isSafeRelativePath` in `src/core/layout.js:65-71`, and its copy in `src/core/layout-infer.js:40-46`. Both change; the copy stays a copy and its comment names the added rule |
| Added condition | a value is unsafe when any `/`-separated segment's first character is `.` |
| Why both | otherwise `wienerdog adopt` proposes a value `readVaultLayout` then drops — measured at `1d4c092`: a vault containing `.skills/` yields `skills_dir: ".skills"` from `inferLayout`, and `readVaultLayout` accepts `skills_dir: .skills` |
| The seven defaults | all pass unchanged, including `reports/dreams` and both `daily_filename` forms, `YYYY-MM-DD.md` and `YYYY/MM/YYYY-MM-DD.md` — a dot inside a segment is not a dot-prefixed segment. Measured on a hand-built tree: the full default set round-trips byte-identically |
| **Silence — what changes and what does not** | the pre-existing rejection classes (empty, absolute, backslash, `..`) stay **silent**, unchanged. The NEW dot class does **not**: it makes a value that was valid yesterday invalid today, which is a different class from rejecting a traversal attempt, and a silent repoint would split the vault into two structures with no diagnosis |
| The notice (code-owned, existing surface) | `layout.js` exposes which keys the **dot condition** rejected for a given config; `src/cli/sync.js` — which already calls `readVaultLayout` at `:270` — pushes ONE notice onto its existing `summary.notices` array, printed with a `note:` prefix at `:345`. Attended, code-owned, no new channel. `readVaultLayout`'s own signature and return value are unchanged, so the other three callers (`dream.js:329`, `memory.js:87`, `scheduler/descriptor.js:188`) are untouched |
| Notice content | names the rejected key(s) and the built-in default now in force, and states the rule. It never echoes the rejected value — that value is config the user controls, but the notice is a code-owned string and stays one |
| Why `sync` and not `doctor` | `doctor` deliberately does not parse config **content** today (`src/cli/doctor.js:337-338` defers it to a later WP); `sync` already reads the layout at the exact point this matters and already owns a notice surface |

### Table D — preservation before destruction (the house rule)

| Fact / rule | Value |
|-------------|-------|
| **The rule** | rule 1 converts a former "keep" into a "destroy" on a path class that **can contain user data**. Every destruction this WP introduces is therefore paired with a preservation. This is the safety net, not the main path — Table A's ordering and un-staging are what keep user data out of the fence's way in the first place |
| Why it is needed, measured | (i) a user who saves a new `CLAUDE.md` while the brain runs appears as `?? CLAUDE.md` and is indistinguishable from brain output; (ii) if the dream drops a rule from a tracked `.gitignore`, a previously-ignored user file such as `.obsidian/workspace.json` becomes visible in the same snapshot. Both were reproduced deleting real user data with no commit and no copy |
| Mechanism | the existing `quarantinePreserve(stateDir, vaultDir, rel, date)` (`:703-738`) — `<stateDir>/quarantine/`, dir 0700, file 0600, atomic, `<date>-<sanitized-basename>` with a collision suffix. No new machinery, no new directory, no new lifecycle |
| Applies to | **both** revert shapes: `fs.rmSync` on an untracked path and `git checkout HEAD -- rel` on a tracked one. The second also destroys working-tree bytes the user may have just written |
| On preservation failure (`null`, including no `stateDir`) | **do not destroy.** The path is left on disk untouched, is un-staged so it cannot be committed, and is recorded with `suffix-nopreserve`. This mirrors the EP2 gate's own abort at `:1296-1312`, which refuses to revert when no durable artefact holds the bytes that are there now |
| Pairing record | the reason string carries the quarantine basename and the report line carries the vault-relative path, so the report pairs original path ↔ preserved copy. `quarantinePreserve` flattens the path to a sanitized basename, so the report line is the only place that pairing exists — this is why the suffix names it |
| Not changed | the secret gate's own use of the same function, the retention cap, `state/quarantine/`'s modes, and the existing pending-review banner that lists what is in there |

### Table E — the residual class

| Fact / rule | Value |
|-------------|-------|
| **The class (one, not a list of unrelated gaps)** | **repo-local state outside the tree that the validator cannot see but git obeys.** Members measured on git 2.50.1: `clean`/`smudge` filters (`.git/config` + `.git/info/attributes`), `core.fsmonitor`, `gpg.program` under `commit.gpgSign`, `.git/info/exclude`, and `core.excludesFile` |
| Two properties that define it | (1) none of it appears in `git status`, so no fence built on status output — including this WP's fixpoint — can ever see it; (2) all of it lives under `.git/` or in config git reads from there |
| Measured: the exposure starts before the brain does | `core.fsmonitor` runs its program on the **first** `git status` the validator makes — inside `precommitSessionEdits`, before the brain is spawned. The window is not "during the commit" |
| Measured: what stands between this and a live vault today | **only the borrowed harness refusal.** Every channel needs a write under `.git/`, which both harnesses currently refuse — third-party product behaviour this project neither owns nor tests, on versions that change. It is a dependency, not a defence, and this WP does not rely on it |
| What this WP does about it | states it. Table B closes the hook surface with the project's own defense; the rest is disclosed here and carried by the successor |
| Successor charter (named, not built here) | read-only detectors in `wienerdog doctor` covering the whole class, plus a **pre-flight check**: before a dream runs, read the repository config and **halt loudly** when a key names an external program. Measured and consistent: reading the config does **not** itself trigger `core.fsmonitor`, so the check cannot fire the thing it is checking for. Not built here because the legitimate case — a user who signs their commits — opens a permissions question this WP has no mandate to answer |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it)
- [ ] Acceptance criteria that assert each table's facts
- [ ] Verification commands / greps
- [ ] The "Current state" description of what each table replaces
- [ ] The reason literals and the worked example under "Exact contracts"
- [ ] Implementation notes (rule ordering, the declined `--ignored` option, the declined de-duplication)
- [ ] Security checklist (the residual class in Table E and the unknown-name residual)
- [ ] **The two `isSafeRelativePath` copies** (`layout.js:65-71`, `layout-infer.js:40-46`) — Table C's rule must land in both or the two disagree about the same vault
- [ ] **Table A's bound and Table E's class** — the exclude channels appear in both and move together

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step
  (CLAUDE.md). ADR-0004: nothing this WP adds starts anything.
- **The protected consumer of rule 2 is outside this repository** — the user's own
  vault and any coding-agent session started in it. There is no `file:line` caller
  chain to cite for it, unlike every other gate in this validator, and none is
  expected in review.
- **Do not argue that a denied file "would be committed today anyway."** Measured
  on the untouched tree: with the hostile `.gitignore` in force at `git add -A`,
  `CLAUDE.md` does **not** enter the committed tree — it stays on disk, untracked
  and ignored, and survives `git clean -fd`. A snapshot-only fence is worse than
  today with respect to the tree, not at parity. The reason the fence is still
  worth building is the disk, which is what the harness reads.
- **The ruled-optional `--ignored` detection stays declined.** Feeding ignored
  paths into the classification loop would put `.obsidian/plugins/*/bin/`,
  `.smart-env/` and `.trash/` in front of rule 1 — the exact user data the ruling's
  fifth point protects by refusing `git clean -x`. A separate report-only status
  call duplicates the successor's charter.
- **A pre/post filesystem inventory independent of git is out of scope** and is the
  successor's charter, as the real closure of M10. Aborting the run on any denial
  is rejected: it would throw away a night's useful work over one forbidden path
  and hand an attacker a cheap off-switch for the dream.
- **De-duplicating `isSafeRelativePath` is considered and declined.** `layout.js`
  could export it and `layout-infer.js` import it, but the ruling puts the dot
  condition at the existing site as "one more line there", and an export-surface
  refactor is the wrong trade here. The pair is registered as a mirror above; a
  later WP may collapse them.
- `git clean -fd` and its missing `-x` are not touched.
- When uncertain: choose the simpler option and note it in the PR under "Decisions
  made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item **applies and is satisfied by the
      surrounding code**: the only untrusted identifiers are the vault paths in
      `git status --porcelain -z` output, which reach the filesystem through the
      loop's existing `resolveContainment` check (`:1147`) — evaluated before this
      WP's case — and through `revertPath` and `quarantinePreserve`, both unchanged
      and both already hardened (`displayName` sanitizes the quarantine basename).
      This WP adds no new path construction and no new spawn beyond `git rm --cached`
      on paths that already passed containment.
- [ ] The surface is **an untrusted-by-construction agent's writes into a git
      repository whose control state is executable**. Containment after this WP: no
      dot-prefixed path and no named instruction filename is in the set the run
      commits (Table A, to fixpoint); no layout value can move a Wienerdog directory
      under a dot prefix (Table C); the validator's git no longer runs
      repository-local hooks (Table B); and nothing is destroyed without a durable
      copy (Table D).
- [ ] **Named residual — the repo-local-state class (M9, and the bound of M10's
      closure).** Table E states it in full: filters, `core.fsmonitor`,
      `gpg.program`, `.git/info/exclude`, `core.excludesFile`. None of it is visible
      to any status-based fence; all of it needs a `.git/` write that only the
      borrowed harness refusal currently prevents. Disclosed, not closed.
- [ ] **Named residual — pre-existing user ignore entries (M10).** Rule 1 stops the
      dream creating an invisible region, and the fixpoint stops it exploiting one
      it created mid-run. A region the **user** ignored independently produces no
      status entry at any pass and is never seen. Open; the successor's
      git-independent inventory is its closure.
- [ ] **Named residual — nested repositories.** A file written inside a git
      repository nested in the vault is invisible to the outer `git status` or
      collapsed to one directory record, and `git clean -fd` refuses nested repos.
      The dream cannot CREATE one (no Bash, so no `git init` —
      `runtime-profile.js:58`, `:81`); it can write into one an adopted vault had.
- [ ] **Named residual — unknown instruction filenames (ruled).** A tool Table A's
      set does not name passes rule 2. Accepted: no structural marker like the dot
      prefix exists for this class, and dot-prefixed conventions are already covered
      by rule 1.
- [ ] **The named successor for the inherited-state residuals.** They share one
      property: the dream cannot CREATE the hazardous state, but a vault can INHERIT
      it. A fence cannot see inherited state; disclosure can. **One** successor WP
      covers them — read-only `doctor` detectors for (a) the whole Table E class,
      (b) ignored regions the validator never sees, **including both non-tree
      channels, `.git/info/exclude` and `core.excludesFile`**, (c) a nested git
      repository (marker: `lstat` existence of `<dir>/.git` whatever the file type —
      directory, a regular file starting `gitdir:`, or a symlink; warn-only, bounded
      walk), plus the git-independent pre/post vault inventory that actually closes
      M10, plus the pre-flight config check from Table E. Whether a scheduled doctor
      run should exist, and which alert channel carries the warnings, are that WP's
      spec-phase questions. **Detectors are disclosure, not defense: they close
      nothing and must never be cited as closing M9 or M10.**

## Acceptance criteria

- [ ] A dream-produced change at a path with any dot-prefixed segment is denied and
      recorded with `base-dotseg` — at the vault root, at depth, tracked and
      untracked, and whatever the layout maps.
- [ ] A dream-produced change whose basename is any member of Table A's
      instruction-name set, in any letter case, at any depth, is denied and recorded
      with `base-instr`.
- [ ] A path matching both rules records rule 1's base, per Table A's precedence.
- [ ] **The reproduced attack fails**: a run that writes a `.gitignore` hiding an
      instruction file *and* that instruction file commits neither, denies both, and
      names both in the enforcement section.
- [ ] **No path violating rule 1 or rule 2 is in the staged set at commit time**,
      including one that became visible only because a denial changed the ignore
      state.
- [ ] **A user's previously-ignored file is not touched** when the dream drops its
      ignore rule: the `.gitignore` denial is applied first, the file is hidden
      again, and it is neither denied, reverted, un-staged nor reported.
- [ ] A path that became ignored again as a result of a revert is not in the staged
      set and is still on disk (Table A's un-staging row).
- [ ] The fixpoint terminates on every input, and reaching the iteration cap fails
      closed: the vault is restored to HEAD, nothing is committed, and the reason is
      recorded.
- [ ] **Nothing is destroyed without a durable copy** (Table D): every denied path
      that is reverted has a byte-identical copy in `state/quarantine/` named by the
      reason string; when preservation fails, the file is left on disk untouched,
      is not committed, and is recorded with `suffix-nopreserve`.
- [ ] Denial precedes the ledger and Tier-3 cases: a denied path is never treated as
      a ledger, identity or skill change.
- [ ] A user's own pre-existing `.gitignore` / `CLAUDE.md`, unchanged by the run, is
      neither denied nor reported.
- [ ] No existing denial reason string changes, and every change the validator
      accepts today at a dot-free, non-instruction path is still accepted and
      committed — daily note, report, ledger, skill draft.
- [ ] Every validator git invocation carries `-c core.hooksPath=/dev/null` and both
      commits carry `--no-verify`; a repository-local `pre-commit` hook does not run
      during a dream, and both commits still succeed with the wienerdog identity.
- [ ] `isSafeRelativePath` rejects a dot-prefixed segment in **both** `layout.js` and
      `layout-infer.js`: such a config value falls back to its built-in default,
      `inferLayout` proposes the default instead of a dot-directory it finds, and the
      two agree on the same vault.
- [ ] All seven built-in defaults, and both `daily_filename` forms, still pass
      `isSafeRelativePath` in both files.
- [ ] **`wienerdog sync` emits one notice** naming the key(s) the dot rule rejected
      and the default now in force; a config rejected by a pre-existing class
      (empty, absolute, backslash, `..`) emits **no** notice, and a config with no
      rejection emits none. `readVaultLayout`'s signature and return value are
      unchanged and its other three callers are untouched.
- [ ] Idempotence (the template's criterion; this WP changes a command that writes
      outside the repo), scoped to what this WP owns: a second dream run reproducing
      the same denied write produces a byte-identical enforcement line and leaves no
      denied-path residue in the worktree. The dream report's per-run append is
      pre-existing behaviour and is explicitly NOT part of this criterion.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream|layout|sync"
npm test
npm run lint
# Table B — both code-owned git-seam literals are present in the validator.
# -F: fixed string. An unescaped `.` here is a wildcard and makes the gate vacuous
# (measured at round zero: `grep -q "startsWith('.')"` matched `startsWith('#')`).
grep -qF -- 'core.hooksPath=/dev/null' src/core/dream/validate.js
grep -qF -- '--no-verify' src/core/dream/validate.js
```

- The last two are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing something a reader must judge. Per
  `docs/runbooks/spec-authoring.md`, paste a real green on the finished state **and**
  a real red from a deliberately broken state (the `-c` pair removed from `git()`;
  `--no-verify` dropped from both commits).
- **Both pin a literal this spec itself decides (Table B), never a code shape.**
  Round zero measured why: a gate asserting `startsWith('.')` and a gate asserting
  `--no-verify` appears exactly twice both went RED against a hand-built, equally
  correct implementation. Tables A, C, D and E are asserted by the acceptance
  criteria and the implementer's tests, which are shape-independent — not by a grep.

## Out of scope (do NOT do these)

- **A git-independent filesystem inventory of the vault** — the successor's charter
  and the real closure of M10.
- **The pre-flight repository-config check** and every `doctor` detector in Table E.
- **`--ignored` on the status call**, in either shape; **`git clean -x`**; and
  **aborting the run on any denial** — all three rejected, reasons in Implementation
  notes.
- **`src/core/dream/brain.js`**: the unreachable Codex branch (`:187-189`) stays as
  it is.
- **`src/core/adopt-git.js`**: its ignore set is user data and the ruling keeps it.
- **`src/core/frontmatter.js`**: its recognition fail-open is a named residual of a
  finished package.
- **Narrowing `git()`'s `env: process.env`**, isolating the repository's git config,
  and the harness-side sensitive-path behaviour.
- **The silence of the pre-existing layout rejection classes** (empty, absolute,
  backslash, `..`) — unchanged by Table C.
- **`state/quarantine/`'s retention, modes and banner** — reused, not redesigned.
- Every other finding in the 2026-07-29 audit; each is queued separately.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   the both-directions runs for the two new assertions.
2. Conventional commits; PR titled
   `fix(dream): deny control-file writes over the committed set (WP-dream-write-fence-control-files)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
   `In-Review` marks the START of review: this list is complete only when review is.
