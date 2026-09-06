---
id: WP-dream-git-env-pinning
title: Build the dream run's git environment from a named allowlist at the pipeline seam
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0028, ADR-0031, ADR-0042]
epic: dream-promotion
---

# WP-dream-git-env-pinning: build the dream run's git environment from a named allowlist

> **Errata, 2026-09-06 (post-merge) — two, plus one informational record. None is a defect in what shipped.**
>
> **Erratum 1 — the Mirrored Surface Checklist did not register `WIN32_CARRIED` as a mirror of Table U row U4.** *What is wrong:* the checklist registered `src/core/dream/git-env.js`'s **comments** as the code's mirror of Table U; the shipped module also carries row U4's nine win32 keys as a data constant (`WIN32_CARRIED`, `src/core/dream/git-env.js:6-9`), an executable mirror on the one path AC1's fixture cannot run, so a later row-U4 edit could move the table and every registered mirror while the array silently disagreed. *What is true:* the array's contents are correct (nine keys, the row's order). *Found:* wd-reviewer, PR #234 gate round 1 (band C). *Routing:* **fixed in this pass** — the checklist bullet below now names the constant. **Class: an unregistered mirror.**
>
> **Erratum 2 — `env.PATH` is assigned unguarded while the win32 keys are guarded.** *What is wrong:* `src/core/dream/git-env.js:29` writes `env.PATH = process.env.PATH` without the `!== undefined` guard the win32 loop applies, so a launching environment with no `PATH` yields an own key whose value is `undefined`. *What is true:* no behavioural consequence — Node's `child_process` omits `undefined` values, and a `PATH`-less run fails loudly at `resolveExecutable`/`verifyPin` regardless. *Found:* wd-reviewer, PR #234 gate round 1 (band C, no change requested). *Routing:* **residual, fix on the next touch of the file** — the tip was not edited after three verdicts on it, so "both gates on the same tip" holds exactly. **Class: cosmetic asymmetry.**
>
> **Recorded, not an erratum — the re-targeted `dream-private-index-dropped` declaration gained a `testNamePattern`.** The spec froze that declaration's `id`, `wp`, `criterion`, `why` and `expectRed`; all five are unchanged. The implementer's new AC1 test also observes the private-index property and therefore reddened under the same mutation, and the runner's set-equality rule refuses an undeclared red — the spec forbade adding AC1 to `expectRed`, so the precedented selection facility (used by five other declaration files) is the only reachable option. The runner refuses a proof whose declared identity the pattern excludes, so `PROVEN` remains evidence that all three declared row-G8 tests ran and reddened (wd-reviewer, PR #234 round 1, band C informational; implementer's Decision 2).

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): it writes configuration into a user's setup
and starts nothing that outlives its job. The **dream** is its nightly run —
`wienerdog dream`, scheduled by the OS or typed by hand — which reads recent
session transcripts, has a headless model consolidate them in a workspace
outside the vault, promotes the approved notes into the user's markdown vault,
and publishes **one git commit** in that vault.

That commit is assembled without `git add` and without `git commit`. The run
builds a tree in a **private index** outside the vault's `.git`, hashes each
approved buffer straight into the object store, and publishes with
`commit-tree` + `update-ref` — so the user's own index and working tree are
never read, never staged and never touched (`WP-dream-promote-in-workspace`
Table W row W1, canonical for that property). The invocations this uses are a
fixed, owner-visible set of **nine pinned shapes** — `rev-parse HEAD`,
`read-tree`, `ls-tree`, `hash-object -w --stdin`, `update-index --add
--cacheinfo`, `write-tree`, `commit-tree`, `update-ref`, and
`show HEAD:reports/warnings.md` — matched by strict shape-equality under
default-deny: a shape nobody pinned is a violation. Each shape also declares a
**disposition**: `private` (it must carry the run's own `GIT_INDEX_FILE`) or
`unset` (it must carry none). All nine, their slots and their dispositions are
decided in Table W row W1(c) and are cited here, never restated.

**What is not decided anywhere is the ENVIRONMENT those nine invocations run
under, and today it is the launching shell's.** The seam passes
`opts.env || process.env` into every call, and the private-index calls get
`{ ...process.env, GIT_INDEX_FILE: tmpIndex }`. A **scheduled** dream is
unaffected: `run-job` builds its child's environment from scratch and carries
through only `WIENERDOG_HOME` and `WIENERDOG_VAULT`, so no `GIT_*` variable can
reach it. A **manual** `wienerdog dream` inherits whatever the user's shell
exports. So the run's own act — where its write lands, which repository it
reads, which configuration its call obeys — is decided by the environment it
happened to be launched from, and the two ways of running the same job do not
behave the same way.

This is a **ruled-open residual**, not a hypothesis. The 2026-09-02 group-C
disposition (`docs/specs/logbook/2026-09-02-audit-group-c-disposition.md`,
Table D rows D2 (b) and D4) measured it live and named this WP its owner: with
an inherited `GIT_DIR`, the pinned `hash-object -w --stdin` write landed in
another repository and the pinned `commit-tree` + `update-ref` pair advanced
**that** repository's HEAD while the vault's stayed put; with `GIT_DIR` unset,
an inherited `GIT_OBJECT_DIRECTORY` alone redirected the same write. Row D4
withdrew its earlier "nothing new is owed" verdict in as many words: *the seam
still owes an independent, constructed environment.*

### Provenance, and the obligation this WP inherits

This spec matures a Draft stub from the 2026-08-31 handover. Two things in that
stub are binding and are discharged here rather than repeated:

1. **The stub's item 1 is an owner product decision** — pin, don't pin, or
   pin-with-exceptions, *"with the hook-suppression rejection distinguished by
   name"*. It is answered in **Dispatch precondition — owner items** below,
   recorded as a recommendation adopted under standing authorization.
2. **The stub's dated 2026-09-02 amendment makes the CHANNEL SET part of
   "done"**, because a `GIT_DIR`-only pin would have reported green while the
   ruled mechanism — the unfiltered parent environment — stayed live. Its
   words: *"every outcome must ENUMERATE ITS CHANNEL SET"*, and **"a pin
   outcome may not go green from `GIT_DIR` alone."** Discharged by **Table U**
   and by acceptance criteria AC2–AC4, which name three separate channels,
   with AC5 proving the other direction.

## Dispatch precondition — owner items

Two calls below are the owner's. Each is **adopted under the standing
authorization of 2026-09-05**
(`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`: the
maturing architect records a recommendation with the cost of overruling it, and
the session may dispatch under it) — **never as a direct owner ruling.** The
owner may reverse either by dated amendment, at the cost enumerated with it.

**O1 — PIN, BY CONSTRUCTION, AT THE SEAM. Recommendation adopted.** The run's
own git calls get an environment **built from the named allowlist in Table U**;
every inherited `GIT_*` variable is thereby absent, and the run's own
`GIT_INDEX_FILE` is added on top for the `private` shapes exactly as today.

*The principle, and the line it draws.* Git's **configuration files and hooks
are the user's standing instructions**, bound to the repository or to the home
directory, and they stay honoured: the constructed environment carries `HOME`
(Table U row U2), so the global and repository-local config still apply —
measured, a `core.fsmonitor` in that home's `~/.gitconfig` runs during the run's
own pinned `update-index` and `write-tree` — and no hook is suppressed,
relocated or disabled. **Honoured means the hook RUNS; it does not mean the hook
runs under the launching shell's environment.** A hook fires below the seam, as
a child of git, so it inherits the environment the run gave git — measured, the
user's `reference-transaction` hook still fires on the pinned `update-ref` and
its environment is the constructed map. That is a cost and row U20 names it.
The **launching process's environment** is the other thing: it redirects or
injects into **our own act's target** — where our write lands, which repository
our call reads, which configuration our call obeys — and it is not a
configuration surface for a run that is also a scheduled job.

*And `HOME` is taken THROUGH THE RUN'S SINGLE AUTHORITY, `getPaths().home`* —
a claim about where the value comes from, not about what it says. **`HOME` is
trusted BY DECISION**, as the location of the user's own configuration files —
the same trust a manual run already extends to the shell that launched it, and
the same value the scheduled child gets. It is **not** a security boundary, and
two earlier over-claims in this paragraph that said otherwise are **withdrawn**,
each with the measurement that falsified it, in **"Why Table U is what it is"**
— which this paragraph CITES and does not restate. That section also owns what
*"a manual dream behaves like the scheduled one"* narrows to: three properties
(no inherited `GIT_*`, `HOME` from `getPaths().home`, no `XDG_CONFIG_HOME`), and
not a general equivalence — `PATH` differs between the two modes by design.

*Why this is not the rejected hook suppression, by name.* Table W row W1
rejects suppressing the user's hooks (`core.hooksPath` **or any equivalent**)
on two independent grounds, and **neither reaches this decision**: (i) *a
product change may not be taken under gate pressure* — this one is taken as its
own work package, with an owner decision recorded, not inside a review round;
(ii) *suppressing hooks would switch off the user's own guardrails — a
ref-protecting hook among them — on exactly the operation that moves their
HEAD*, and **a just-files product does not silently override the user's git
configuration (ADR-0004)**. The pin switches off nothing the user configured:
it removes what the *launching shell* injected. The measured asymmetry the stub
called the crux: an environment-injected `core.hooksPath` **fires a
`reference-transaction` hook that the user never configured** (Table U row
U10) — dropping that is not suppression, it is refusing an injection. **Row
W1's hook residual is untouched by this WP** and stays exactly as recorded: a
user hook that writes the index during publish is neither suppressed nor
detected.

*Overrule cost.* **(a) To DON'T-PIN**: Deliverables collapse to the two
documentation rows; Table U's disposition column changes from ABSENT to
ACCEPTED for every ABSENT row (the stub's item 3 shape — the residual named, not
retired); `src/core/dream/git-env.js` and all three RED declarations are
dropped; `tests/red-proofs/dream-pipeline.proofs.json` needs no re-target; the
ADR-0012 amendment records an accepted residual instead of a decision, and the
Table W amendment likewise; and W1(c)'s declared `unset` disposition stays a
property of the launching environment rather than of the code (row U13).
Whether group C's D2 (b) then closes is E2's judgement, not this WP's.
**(b) To PIN-WITH-EXCEPTIONS carrying `GIT_CONFIG_GLOBAL`** — the only dropped
channel with a measured user cost (row U11): one Table U row moves ABSENT →
CARRIED with its reason, `buildGitEnv` gains one conditional key, AC4 narrows
to the `GIT_CONFIG_COUNT` triple alone, no `GIT_CONFIG_GLOBAL` RED proof is
possible any more, and the ADR amendment must state the exception **together
with its measured code-execution reach** (row U11), because the exception
re-opens a channel that ran an arbitrary script during `write-tree`.
**(c) To a WIDER SCOPE** — see O2.

**O3 — `XDG_CONFIG_HOME` is NOT carried. Recommendation adopted.** The
constructed environment carries `HOME` and not `XDG_CONFIG_HOME` (Table U rows
U2 and U3). **The reasoning and the cost are "Why Table U is what it is"'s and
are not restated here** — that section is the one prose mirror of the table, and
this item states the decision and its overrule cost only. *Overrule cost* — the
reversal is *"carry it in BOTH surfaces"*, never in this one alone, because
carrying it here only would recreate the manual/scheduled divergence this
decision removes: `src/cli/run-job.js` joins Deliverables with a new
`ENV_PASSTHROUGH` entry, Table U row U3 flips to CARRIED, AC1's key→value map
and its unset fixture change, and the ADR amendment and this record follow.

**O2 — the second git spawn point on the dream path stays with a successor.
Recommendation adopted.** `assertGitRepo` (`src/cli/dream.js:587`) runs
`git -C <vault> rev-parse --git-dir` through `validate.js`'s own module-private
`git()` (`src/core/dream/validate.js:64-81`), which never passes through this
WP's seam and inherits `process.env` too. **Measured:** with `GIT_DIR` exported
to another repository, that invocation exits 0 for a vault directory that is
not a repository at all, so the guard's verdict is the environment's. It is a
**named residual of this WP**, owned by the Draft stub
`docs/specs/WP-dream-git-env-validate-seam.md`, because it is a separate spawn
point that Table W row W1(c)(i) deliberately elected to leave alone and whose
change carries that clause's standing trigger.

**The bound O1 buys here, stated as what it actually is:** with O1 landed **no
inherited environment variable decides which repository the run's own calls
reach** — the guard may still be answered by an inherited `GIT_DIR`, but the
pipeline's calls no longer follow it, so the failure is at `rev-parse HEAD` in
the vault, late and loud. **What it does NOT buy, and an earlier draft claimed
it did:** repository DISCOVERY from the vault directory is unchanged by this WP.
Measured — from a directory that is not a repository but lies inside one, both
`rev-parse --git-dir` and `rev-parse HEAD` exit 0 and resolve the **ancestor**
repository, today, with or without this WP and with no environment variable
involved. So *"never a commit into the wrong repository"* was an overclaim and is
**withdrawn**: a nested non-repository vault is targeted at its ancestor by
discovery alone. That is routed to the successor as its second item, not fixed
here — and **a run-set `GIT_CEILING_DIRECTORIES` is NOT the answer this WP may
reach for**: it is a hardening proposal with a user-visible cost (a vault
legitimately adopted inside a larger repository, which the guard accepts today,
would stop dreaming), and a hardening proposal becomes text only on an explicit
owner yes.
*Overrule cost:* folding it in adds `src/core/dream/validate.js` and
`tests/unit/dream-validate.test.js` to Deliverables plus a second
`tests/red-proofs/*.proofs.json` (one declaration file per suite) — three rows
on top of this WP's seven, so **ten files with the spec itself** — and S → M
against `docs/specs/README.md`'s ≤8-files sizing heuristic.

## Current state

Measured on `4b629ec6` (`origin/main`); the branch this spec is drafted on adds
documentation only.

- **`src/cli/dream.js:166-175` — `gitIn`, the pipeline's git seam.** Every git
  invocation this file makes goes through it. Its body today:
  `const res = spawnGit({ args, cwd, env: opts.env || process.env, input: opts.input });`
  Its `opts` are `{allowFail?, input?, env?}`.
- **`src/cli/dream.js:178-186` — `spawnGitPinned`**, the production `spawnGit`,
  which forwards `env: o.env` into `spawnPinnedSync`
  (`src/core/exec-identity.js:553`) as `-C <cwd> <args…>`.
- **`src/cli/dream.js:562` — `const spawnGit = opts.spawnGit || spawnGitPinned;`**
  The seam is a JS-only injected dependency: production passes no `opts`, and
  **no environment variable can substitute it** (WP-155, ADR-0028).
- **`src/cli/dream.js:226-231` — the private-index environment.**
  `const indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };` and
  `const withIndex = (args, opts) => g(args, { ...opts, env: indexEnv });`
  This is the **only** site that builds a git environment in this file, and it
  is the site an existing RED proof mutates (below).
- **`src/cli/dream.js:1007`** — the ninth shape: a `gitIn` call whose argument
  list is `['show', <the HEAD:WARNINGS_REL template literal>]` with
  `{ allowFail: true }`. It is issued outside `commitNamedSet` and therefore
  runs on `process.env` today.
- **`tests/red-proofs/dream-pipeline.proofs.json:10-11`** — the
  `dream-private-index-dropped` proof (`wp: WP-show-slot-own-value-kind`) whose
  `find` is the **exact literal** of the `indexEnv` line above. Changing that line
  without re-targeting the declaration makes `node scripts/red-proofs.js` fail
  to apply the mutation. This is why that file is in Deliverables.
- **`tests/unit/dream-pipeline.test.js`** — `watchIndexWrites(vault)` (`:185`)
  is the shipped harness that substitutes `spawnGit` and receives every
  invocation as `{args, cwd, env, input}`; the pipeline fixture already saves,
  overwrites and restores a named list of `process.env` keys (`ENV_KEYS`), so a
  test can export a variable for the duration of a run without any new seam.
- **`src/cli/run-job.js:150` — `buildCleanEnv`**, the scheduled job child's
  environment: built from scratch, carrying through only `WIENERDOG_HOME` and
  `WIENERDOG_VAULT` (`ENV_PASSTHROUGH`, `:47-50`) on POSIX plus
  `WIN_ENV_PASSTHROUGH` (`:58-78`) on win32. A scheduled dream therefore already
  inherits no `GIT_*`. **Two details this WP's environment mirrors rather than
  invents:** `HOME` is **set** to `paths.home`, not carried; and
  `XDG_CONFIG_HOME` is **not** carried at all.
- **`src/core/paths.js:54` — `const home = env.HOME || os.homedir();`** inside
  `getPaths()`. This is the run's **bound home**. The core dir, the state dir,
  the config roots and the vault each default to a path under it **and each has
  its own override** (`WIENERDOG_HOME`, `WIENERDOG_VAULT`, `CLAUDE_CONFIG_DIR`,
  `CODEX_HOME`): measured, with all four set, changing `HOME` moves `home` and
  nothing else. So "everything derives from `home`" is true only where an
  override is absent, and row U2 does not rest on it. `spawnGitPinned` already
  calls `getPaths()` (`src/cli/dream.js:179`), so the constructed environment
  has this value in hand without a new argument.
- **`src/core/dream/promote.js:387-418` — `constructMergeEnv`**, the precedent:
  the three-way merge already runs under an environment **built from nothing**,
  with a comment that states the direction — *"nothing is inherited, so
  `GIT_CONFIG_COUNT` and friends cannot arrive even though this list never
  names them."* It is deliberately **stricter** than this WP's environment
  (empty `HOME`/`XDG_CONFIG_HOME`, `GIT_CONFIG_NOSYSTEM`, a ceiling) because it
  operates on temp copies outside any repository, where the user's config has
  no standing; this WP's calls operate **inside the user's own vault**, where it
  does. Two constructions, two reasons — see Out of scope.
- **Pin resolution reads the environment's `PATH`.**
  `resolveExecutable(name, env, platform)`
  (`src/core/exec-identity.js:93-118`) walks `env.PATH` (and `env.PATHEXT` on
  win32), and `verifyPin` refuses unless the result equals the pinned command
  path (`:451-461`). A constructed environment must therefore carry a `PATH`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/git-env.js | exports `buildGitEnv(indexFile?)` — the single site that decides the run's git environment, built from Table U's CARRIED rows and nothing else. Dependencies: `node:path` and **`require('../paths')` for `getPaths`**, which row U2's source contract requires and which `spawnGitPinned` already calls (`src/cli/dream.js:179`). Nothing else |
| modify | src/cli/dream.js | `gitIn` builds the child environment with `buildGitEnv` and takes `opts.indexFile` in place of `opts.env`; `commitNamedSet` passes `{ indexFile: tmpIndex }` where it built `indexEnv`. Nothing else changes — not the nine shapes, not their arguments, not their dispositions |
| modify | tests/unit/dream-pipeline.test.js | assertions covering AC1–AC5 (the implementer designs the cases) |
| modify | tests/red-proofs/dream-pipeline.proofs.json | re-target the existing `dream-private-index-dropped` declaration's `find`, `replace` and `marker` onto the new private-index site so the same mutation still drops the run's own `GIT_INDEX_FILE`. Its `id`, `wp`, `criterion`, `why` and `expectRed` set are UNCHANGED |
| create | tests/red-proofs/dream-git-env-pinning.proofs.json | this WP's three RED declarations (Exact contracts below); `suite` is `tests/unit/dream-pipeline.test.js` |
| modify | docs/adr/0012-dream-run-lifecycle.md | one new dated Amendment section at the end of the file, per the Mirrored Surface Checklist. Nothing existing in the file is rewritten or renumbered |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | a dated amendment INSIDE Table W row W1 and nowhere else, per the Mirrored Surface Checklist. Row W1's hook-residual sentences stay intact; W1's existing line citations are NOT re-numbered |

### Exact contracts

**The constructed environment.**

```js
/**
 * The dream run's git environment: Table U's CARRIED rows and nothing else.
 * Values come from Table U, not from the launching environment: `HOME` is taken
 * from `getPaths().home` AT CALL TIME — this module calls `getPaths()` itself,
 * which is why it may `require('../paths')` and why neither this signature nor
 * `gitIn`'s grows a paths parameter (row U2) — `PATH` is inherited (row U1),
 * and `XDG_CONFIG_HOME` is NOT carried (row U3, owner item O3).
 * @param {string} [indexFile] absolute path for GIT_INDEX_FILE (Table U row U5).
 *   Omitted for every shape whose declared disposition is `unset`.
 * @returns {Record<string,string>} a FRESH object, built KEY BY KEY — never
 *   `process.env` itself, never a spread of it, and never a DENYLIST over it
 *   (spread, then delete named keys). Key-by-key construction is the required
 *   SOURCE FORM, not merely a way of reaching the right map: see AC1's canary
 *   paragraph for what a runtime check can and cannot tell apart.
 */
function buildGitEnv(indexFile)
```

**The seam.**

```js
/** @param {(o:{args:string[], cwd:string, env:NodeJS.ProcessEnv}) => object} spawnGit
 *  @param {string} cwd @param {string[]} args
 *  @param {{allowFail?:boolean, input?:Buffer, indexFile?:string}} [opts] */
function gitIn(spawnGit, cwd, args, opts = {})
```

`gitIn` passes `env: buildGitEnv(opts.indexFile)`. **The `opts.env` option is
removed**: after this WP no caller can hand the seam an environment, which is
the same "enumerate your own good" direction applied to the seam's own API.
`spawnGitPinned` is unchanged — it still forwards whatever `env` it is given.

**The three RED declarations**, ids fixed here so acceptance criterion AC6 can
name them without a repo-wide count. Each is one exact-substring mutation of
`src/core/dream/git-env.js` that **reintroduces inheritance of exactly one
channel** and declares the assertions it must redden:

| id | reintroduces | must redden |
|----|--------------|-------------|
| `git-env-inherits-git-dir` | `GIT_DIR` from `process.env` (Table U row U6) | the **AC2** assertions |
| `git-env-inherits-object-directory` | `GIT_OBJECT_DIRECTORY` (row U7) | the **AC3** assertions |
| `git-env-inherits-config-count` | the `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` triple (row U10) | the **AC4 and AC5(b)** assertions |

`wp` is `WP-dream-git-env-pinning` on all three; `criterion` is the acceptance
criterion's number.

**AC1 IS DELIBERATELY NOT IN ANY OF THE THREE SETS, and that is a contract
statement rather than an omission.** `scripts/red-proofs.js` requires the
observed own-body failing set to EQUAL the declared set, so a criterion that
*might* redden cannot be declared. AC1 is the **structural** assertion — the
complete key→value map and the canary — and it runs in its own fixture, which
exports the canary and `XDG_CONFIG_HOME` and not the three channels; under a
single-channel reintroduction that fixture's map and canary both stay green.
**The behavioural criteria are the mutation-sensitive ones**: AC2, AC3 and
AC4/AC5(b) each export their own channel for the whole run, so each mutation
reddens them deterministically. Declaring AC1 anyway would have forced the
implementer either to invent extra fixture rules or to filter the run — the
failure mode the next paragraph describes from the other direction.

**AC5(b) is in the third declaration's set BY NECESSITY, not by choice**, and
leaving it out would have been unbuildable: that mutation restores the very
`GIT_CONFIG_COUNT` triple AC5(b) uses to inject `core.hooksPath`, so the hook
AC5(b) requires NOT to fire will fire. `scripts/red-proofs.js` requires the
observed own-body failing set to EQUAL the declared set, so an undeclared AC5
failure is a rejected proof — and the only way to reach PROVEN without this row
would be to filter AC5 out of the run, which would leave the positive control
with no mutation evidence at all.

## Contract reference

**ADR-0031's activation trigger fires: three of the seven are true.** (iv)
precedence and fallback behaviour changes — which environment a spawned call
obeys, and which inherited value wins; (v) the task crosses an authority
boundary — the user's launching environment versus the run's own act, which is
the line O1 draws; (vii) the same contract must appear in mirrored surfaces —
this spec, ADR-0012, and Table W row W1 in a `Done` spec.

**This section was RE-CUT by ADR-0031's circuit-breaker after design-gate round
2** (`docs/runbooks/codex-review.md`, "Loop circuit-breaker"), because two
consecutive rounds landed findings on Table U rows. What kept drawing them was
never a decision: it was the PROSE inside the cells — rationales, equivalence
claims and restated counts, three kinds of content sharing one surface, where a
correction to any one of them is a change to a table row. Each kind now has one
owner:

- **Table U carries DECIDED FACTS only** — variable, class, source or
  disposition, and a probe id with a one-word result. No rationale, no counts,
  no equivalence claims.
- **"Why Table U is what it is"**, immediately below, carries **all** the
  reasoning, per row group. It is the ONE prose mirror of the table and is
  registered as such. O1's principle paragraph cites it rather than re-arguing.
- **The design-gate record owns every measurement**, under the stable probe ids
  (`P…`) the table's Reach column cites.

After this cut, a finding about a sentence is a rationale finding, a finding
about a fact is a row or a disposition, and a finding about a number is a probe.

### Table U — the dream run's constructed git environment

**Canonical for what the run's own git calls inherit, what they are given, and
what each channel was measured to reach.** Every other statement of these facts
defers here.

**Rows U1–U5 are the MECHANISM**: the environment is built from them, key by
key. Every other row is **evidence** about a channel the construction closes —
never a filter list. **Row U21 is the closure rule** and is placed last for
reading order; its id is unchanged, because a `GIT_*` denylist could never be
closed and nothing here is enumerated in order to be excluded.

**Reach** cites a probe id owned by
`docs/specs/logbook/2026-09-05-git-env-pinning-design-gate-rounds.md`; shape
numbers are Table W row W1(c)'s nine. Every `P…` result was produced by issuing
the pinned argv on a fresh copy of one template repository under a fixed
identity and fixed dates, and comparing the channel's transcript with the
baseline's mechanically. `not measured` says so and the rationale names what it
rests on instead.

| # | Variable | Class | Source / Disposition | Reach |
|---|----------|-------|----------------------|-------|
| U1 | `PATH` | resolution | **CARRIED** from `process.env.PATH` | n/a — not a git channel; see rationale |
| U2 | `HOME` | config location | **CARRIED** from `getPaths().home` | **R2P1** — runs a configured program on shapes (3) and (7) |
| U3 | `XDG_CONFIG_HOME` | config location | **NOT CARRIED** | **R2P2** — would reach (3) and (7); **R2P2n** — does not, unset |
| U4 | win32 only: `SystemRoot`, `windir`, `SystemDrive`, `ComSpec`, `PATHEXT`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` | platform | **CARRIED** from the launch environment | not measured |
| U4b | win32 only: `USERPROFILE` | platform | **SET BY THE RUN** to `getPaths().home` | not measured |
| U5 | `GIT_INDEX_FILE` | index selection | **SET BY THE RUN** to `<paths.state>/dream-index.<pid>.tmp`, on the three `private` shapes only | n/a — the run's own; see U13 for the inherited form |
| U6 | `GIT_DIR` | write target + repository selection | **ABSENT** | **R2P3** — reaches (1)(2)(4)(5)(6)(7)(8)(9); **R2P3c** — chained, the decoy's HEAD moves |
| U7 | `GIT_OBJECT_DIRECTORY` | object-store write target | **ABSENT** | **R2P4** — reaches (1)(2)(4)(6)(7)(8)(9); **R2P4c** — chained, the run aborts at (6) |
| U8 | `GIT_COMMON_DIR` | object store + refs | **ABSENT** | **R2P5**, **R2P5c** — as U7 |
| U9 | `GIT_ALTERNATE_OBJECT_DIRECTORIES` | object store + read scope | **ABSENT** | **R3P6** — reaches (2); **R2P6b** — reaches (6) |
| U10 | `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n` | config injection; code | **ABSENT** | **R2P7** — runs a configured program on (3) and (7); **R2P7h** — fires a hook on (9) |
| U11 | `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM` | config file selection; code | **ABSENT** | **R2P8** — runs a configured program on (3) and (7) |
| U12 | `GIT_WORK_TREE` | working-tree location | **ABSENT** | **R2P9** — no reach |
| U13 | `GIT_INDEX_FILE`, inherited | index selection | **ABSENT** as an inherited value | **R2P10** — no reach |
| U14 | `GIT_NAMESPACE` | ref namespace | **ABSENT** | **R2P11** — no reach |
| U15 | `GIT_CEILING_DIRECTORIES` | repository discovery | **ABSENT** | **R2P12** — no reach; **R2P12n** — discovery reaches the ancestor |
| U16 | `GIT_EXEC_PATH` | code — subcommand dispatch | **ABSENT** | **R2P13** — no reach |
| U17 | `GIT_ATTR_NOSYSTEM`, `GIT_ATTR_SOURCE` | attribute lookup; filter drivers | **ABSENT** | **R2P14** — no reach |
| U18 | `GIT_TEMPLATE_DIR` | new-repository template | **ABSENT** | not measured |
| U19 | `GIT_TRACE` and the other `GIT_TRACE*` | diagnostics, with a file sink | **ABSENT** | not measured |
| U20 | `GIT_SSH`, `GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_TERMINAL_PROMPT`, `GIT_PROXY_COMMAND`, `GNUPGHOME`, `GPG_TTY`, `SSH_AUTH_SOCK` | transport, credential and signing helpers | **ABSENT** | **R2P15** — no reach; **R2P16** — reaches (9)'s hook environment; transport not measured |
| U22 | `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_AUTHOR_DATE`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`, `GIT_COMMITTER_DATE` | commit identity and dates | **ABSENT** | **R2P17**, **R2P17d**, **R2P22** — reaches (8) |
| U23 | `GIT_NO_REPLACE_OBJECTS`, `GIT_REPLACE_REF_BASE` | object interpretation | **ABSENT** | **R3P18** — reaches (1)(4)(6); not (5) or (8) |
| U21 | **every other variable, `GIT_*` or not** | closure rule | **ABSENT** | n/a |

### Why Table U is what it is

**The ONE prose mirror of the table.** Every rationale, cost and equivalence
claim about the constructed environment lives here and nowhere else; the table
above decides the facts, the record owns the measurements, and O1's principle
paragraph cites this section instead of re-arguing it.

**U1 — `PATH` is carried, and the reason is a check, not a preference.** The
pinned front door resolves `git` on `env.PATH` (`src/core/exec-identity.js:93-118`)
and refuses unless the result equals the pinned command path (`:451-461`); a
`PATH` this code chose would compare the pin against itself and retire that
drift check for the manual run. PATH selection is closed by the pinned absolute
spawn and its verification, not by the PATH's contents — a residual inherited
from WP-154 and not new here. **The cost is in the DESCENDANTS, and it is
named:** `buildCleanEnv` reconstructs `PATH` for the scheduled child while this
row carries the manual one (measured, **R2P19**), so a user hook or a lazy-fetch
helper invoked by a pinned shape resolves bare command names differently in the
two launch modes.

**U2 — `HOME` is carried, and it is a TRUST DECISION, not a security boundary.**
It is the location of the user's own git configuration files, and O1's principle
is that those stay honoured; the value is taken through `getPaths()`, the one
function that decides it, and is the same value `buildCleanEnv` gives the
scheduled child. **THREE over-claims are withdrawn here rather than softened,
each with the measurement that falsified it.** *"Never the launching shell's
string"* — false: `getPaths()` is `env.HOME || os.homedir()`
(`src/core/paths.js:53-54`) and on POSIX `os.homedir()` reads `$HOME` first, so
with `HOME` set the value IS that string. *"An environment that lies about
`HOME` relocates the whole product"* — false, measured (**R2P20**): with
`WIENERDOG_HOME`, `WIENERDOG_VAULT`, `CLAUDE_CONFIG_DIR` and `CODEX_HOME` set,
changing `HOME` moves `home` and nothing else, so a different `~/.gitconfig` can
be selected while the run still targets the same vault. *"The same home the
vault, the state directory and the config roots come from"* — the same claim in
a milder costume, and **conditionally** true only: each of those roots defaults
to a path under `home` **and each has its own override**, so where an override
is set the root does not follow `HOME` at all. **What taking the value through
`getPaths()` actually buys, and it is not an authority claim:** one function
decides it, the manual run and the scheduled child agree on it, and the run
carries a `HOME` even when the launching shell has none. **So the honest
statement is the narrow one:** `HOME` is trusted **by decision**, as the same trust a manual run
already extends to the shell that launched it, and the run inherits whatever
configuration that home selects — including, measured (**R2P1**), a
`core.fsmonitor` program that the pinned `update-index` and `write-tree` will
execute. It is not claimed to be safe against a hostile `HOME`; it is claimed to
be the user's own configuration, which O1 declines to override.

**U3 — `XDG_CONFIG_HOME` is not carried (owner item O3).** `run-job`'s
`ENV_PASSTHROUGH` (`src/cli/run-job.js:47-50`) does not carry it, so a scheduled
dream never had it; carrying it only in the manual path would recreate the
divergence this WP exists to remove. **The cost:** a global git config relocated
*only* by that variable does not apply to the run's own calls, in either mode.
Measured in both directions — **R2P2** (carried: the same two shapes run the
configured program) and **R2P2n** (not carried: none of the seven does).

**U4 / U4b — the win32 keys.** Unmeasured here, no win32 host. Provenance is
`src/cli/run-job.js:58-78`, the list the scheduled job child already carries for
the same `git` spawn; `PATHEXT` is additionally read by `resolveExecutable` on
win32. `USERPROFILE` is SET from the bound home for U2's reason and exactly as
`buildCleanEnv` does (`src/cli/run-job.js:155`); `HOMEDRIVE`/`HOMEPATH` are
deliberately absent, because Git for Windows would resolve the user's config
through them and contradict the bound home.

**U5 / U13 — the index.** The run's own `GIT_INDEX_FILE` is set on the three
`private` shapes and nowhere else, exactly as today; the two clauses its path
must satisfy are Table W row W1(c)'s, cited not restated. The INHERITED form is
what row U13 drops, and dropping it is what makes W1(c)'s `unset` disposition a
property of the code rather than of the launching environment: today `gitIn`
passes `opts.env || process.env`, so an exported value reaches the six `unset`
shapes. Measured (**R2P10**), it changes nothing those six do — the exposure is a
contract defect, not a data-loss one.

**What "the manual run becomes identical to the scheduled one" means, narrowed
to what is actually equalized.** Three properties, and no others: **no inherited
`GIT_*` reaches either**; **`HOME` is `getPaths().home` in both**; **neither
carries `XDG_CONFIG_HOME`**. It is NOT a general equivalence: `PATH` differs
(measured, **R2P19** — the scheduled child gets a reconstructed PATH, a manual run
carries the shell's), and so does everything else `buildCleanEnv` sets or omits
for its own reasons.

**The ABSENT rows that carry a cost, each stated once.**

- **U9 alternates — the one ABSENT row whose channel corrupts the vault's own
  history, and it took two probes to state correctly.** An earlier cell claimed
  the pinned `hash-object -w --stdin` WRITES into the alternate. **Withdrawn**:
  measured on a pristine pair with the blob absent from both stores (**R3P6**
  arm (i)), the write lands in the **vault**, exactly as without the variable.
  **The real reach is deduplication, and it is worse.** With the blob present
  ONLY in the alternate (arm (ii)), `hash-object -w` stores **nothing** — the
  object is already reachable, so the vault never gets its own copy — and the run
  then builds a tree from it, commits it and advances `HEAD`. Once the alternate
  is gone, which under the pin it always is, the vault cannot read its own
  committed content: `cat-file` fails and `fsck --connectivity-only` reports
  *broken link from tree … to blob …*. **So the cost of this row is borne by the
  channel, not by the pin**: an inherited alternate makes the run publish a
  commit the vault does not own, and the pin is what prevents it.
- **U15 discovery, and why the row says only "reaches the ancestor".** Git
  discovers the repository upward from the `-C <vault>` directory, so a vault
  directory that is not itself a repository but lies inside one resolves that
  ancestor — measured (**R2P12n**), present today, unchanged by this WP and
  independent of the environment. Owner item **O2** owns the consequence and
  `WP-dream-git-env-validate-seam` owns the question.
- **U11 `GIT_CONFIG_GLOBAL`** — a user who relocates their global git config
  *only* by exporting it loses it for the run's own calls. Accepted rather than
  excepted, because the same variable is a measured code channel (**R2P8**); the
  `HOME`-resolved `~/.gitconfig` still applies.
- **U19 `GIT_TRACE*`** — `GIT_TRACE=1 wienerdog dream` no longer traces the
  run's own git calls. A debugging convenience, against carrying a variable
  whose value git treats as a write target.
- **U20 transport, credential and signing helpers** — two costs, both about
  DESCENDANTS rather than the shapes themselves. **(i)** The user's own hook,
  configured through their config files, still fires on the pinned `update-ref`
  — **honoured means it RUNS** — but it runs under the constructed environment
  and so no longer sees `SSH_AUTH_SOCK`, `GNUPGHOME`, `GPG_TTY` or askpass
  variables (measured, **R2P16**; its environment is dumped in the record).
  **(ii)** In a partial-clone vault a pinned read can trigger a lazy fetch
  through a `git fetch` subprocess, which loses agent-only authentication — not
  measured, provenance `git help partial-clone`. Signing itself is not a
  channel: the pinned `commit-tree` does not sign from `commit.gpgsign`
  (**R2P15**, with a live-config control).
- **U22 identity and dates** — the inherited identity currently WINS over the
  run's own `-c user.name` / `-c user.email` (measured, **R2P17d**: the recorded
  author and committer become the exported ones). Dropping it makes every dream
  commit carry `wienerdog <wienerdog@localhost>` and the run's own clock. **The
  cost:** a user who tags dream commits by exporting `GIT_COMMITTER_*` in their
  shell loses that. This is a behaviour change with a user-visible effect and it
  is named rather than absorbed.
- **U23 replacement objects** — `refs/replace/` refs are FILES in the user's own
  repository and remain honoured. Measured with the EXACT pinned argv
  (**R3P18**), which is what the row rests on: the literal
  `show HEAD:reports/warnings.md` returns the REPLACED content,
  `ls-tree HEAD -- reports/warnings.md` and `read-tree HEAD` carry the
  replacement's blob, and `GIT_NO_REPLACE_OBJECTS=1` or a redirected
  `GIT_REPLACE_REF_BASE` reverts all three. `rev-parse HEAD` and `commit-tree`'s
  recorded parent are **unaffected** in every arm — the row's Reach cell says
  (1)(4)(6) and not (5) or (8) for that reason. What the user loses is the
  ability to switch the replacement off *for this run* from the shell, since
  both variables that do so are absent.

**U21 — why the enumeration is closable.** The environment is BUILT from rows
U1–U5; every other row records what that construction happens to close. A
denylist over git's variable grammar could not be closed — the grammar is not
ours — so nothing above is enumerated in order to be excluded, and adding a key
is a change to this table and therefore owner-visible by construction.

### Mirrored Surface Checklist

Every surface that mirrors **Table U**, so a review finding updates the table
and all its mirrors **in one pass and in the same commit** — no commit exists
in which the table and a registered mirror disagree — and any new mirror found
in review is added here on the spot.

**In this spec:**

- [ ] **Deliverables-table cells** — the `git-env.js` row ("built from Table U's
      CARRIED rows and nothing else") and the `dream.js` row.
- [ ] **THE ONE PROSE MIRROR — "Why Table U is what it is"**, the section
      directly under the table. Every rationale, cost and equivalence claim about
      the constructed environment lives there; nothing else in this spec argues
      them. **This entry is the extraction's load-bearing one**: a finding about
      a sentence goes there, a finding about a fact goes to a row, and the two
      can no longer be the same edit.
- [ ] **Acceptance criteria** — AC1 asserts the complete key→VALUE map of rows
      **U1–U4b** and of **U5** through its private-shape clause, including U3's
      NOT-CARRIED disposition and U2's `getPaths().home` source; its CANARY
      clause is what makes the ABSENT rows assertable on a host that exports none
      of them. AC2, AC3 and AC4 assert U6, U7 and U10; **AC5 asserts U2's other
      direction** — that a hook reached through the carried home's config files
      still fires, while the same hook injected through U10's channel does not.
- [ ] **Verification commands / greps** — V1–V6 below.
- [ ] **Current state** — the `gitIn`, `indexEnv`, `buildCleanEnv`,
      `constructMergeEnv`, `resolveExecutable` and `paths.js` bullets.
- [ ] **Operative prose** — O1's principle paragraph (which CITES the rationale
      section rather than restating it) and O1's overrule costs (a) and (b),
      which name the ABSENT rows, U11 and U13.
- [ ] **Exact contracts** — `buildGitEnv`'s JSDoc and the three RED rows, which
      name rows U5, U6, U7 and U10.

**Elsewhere in this spec — surfaces that carry a Table U fact and are NOT the
prose mirror, registered so they move with it:**

- [ ] **Owner item O3** — states the DECISION and its overrule cost only; its
      reasoning and cost are the rationale section's and are cited, not
      restated. A change to row U3 moves O3's decision sentence and the
      rationale's `U3` paragraph together.
- [ ] **The Security checklist's first bullet** — names `HOME` as the one
      deliberate exception (row U2) and cites the rationale section for why that
      is a trust decision rather than a safety claim.

**Outside this spec — these move in the SAME commit as any change to Table U:**

- [ ] **`docs/adr/0012-dream-run-lifecycle.md`** — one new dated Amendment
      section at the end of the file, headed exactly:
      `## Amendment (2026-09-05): the run's git calls run under a constructed environment — WP-dream-git-env-pinning`
      It must state, and nothing more is required of it: the decision (an
      environment built from a named allowlist at the seam, every inherited
      `GIT_*` thereby absent); the principle (config files and hooks are the
      user's standing instructions and stay honoured — `HOME` is carried **as
      the run's bound `paths.home`**, `XDG_CONFIG_HOME` is not carried, and a
      hook still RUNS but runs under the run's environment; `HOME` is a TRUST
      DECISION and not a security boundary; the launching process's environment
      is otherwise not a configuration surface); the distinction
      from the rejected hook suppression **naming
      Table W row W1**, and that W1's hook residual is not reopened; that
      Table U in this spec is canonical for the channel set and this section
      does not restate it; the provenance (*adopted under the standing
      authorization of 2026-09-05, not a direct owner ruling; reversible by
      dated amendment*); and the overrule cost, by citing O1 rather than
      re-enumerating it. **Nothing existing in ADR-0012 is rewritten**, and the
      bullet that points at row W1 in the 2026-08-30 Consequences is left as it
      is.
- [ ] **`docs/specs/done/WP-dream-promote-in-workspace.md`, Table W row W1 and
      nowhere else** — a dated amendment placed **beside** the hook-residual
      clause, opening with the exact sentence:
      `**AMENDED 2026-09-05 — THE ENVIRONMENT OF THE RUN'S OWN GIT CALLS IS CONSTRUCTED, NOT INHERITED.**`
      It must state: that the run's git invocations now carry an environment
      built from a named allowlist (`WP-dream-git-env-pinning` Table U,
      canonical, not restated); that **W1(c)'s `unset` and `private`
      dispositions are unchanged in text and are now properties of the code
      rather than of the launching environment** (row U13); and that **the hook
      residual and both named rejections in this row are NOT reopened** — the
      pin removes an injection from the launching shell, never a hook or a
      config file the user configured. **It must also state the one thing that
      DID change for that residual**: the user's hook still fires on the pinned
      `update-ref` (measured) but now runs under the run's constructed
      environment rather than the launching shell's, which is row U20's named
      cost and not a narrowing of the residual. **The hook-residual sentences stay
      byte-intact**, and W1's existing line citations into `src/cli/dream.js`
      are NOT re-numbered: they are pinned to the SHAs at which they were
      measured, and chasing them is the rot this row already ruled against.
- [ ] **`src/core/dream/git-env.js`'s own comments, and its `WIN32_CARRIED`
      constant — the executable mirror of row U4's key list (erratum 1,
      2026-09-06)** — the run's first-read
      statement of Table U. It may summarise; it may not decide. Its `HOME`
      sentence must say the value is taken from `getPaths().home` at call time
      (row U2), which is what licenses the module's one non-`node:` dependency.
- [ ] **`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`** —
      the owner-rulings record restates O1's and O3's dispositions for the owner.
      It is **append-only**: a Table U change that falsifies something there is
      corrected by a dated amendment naming the primary spec as governing, never
      by editing the entry in place.
- [ ] **`tests/unit/dream-pipeline.test.js`'s AC1 assertion, and the unit-level
      `buildGitEnv` assertion beside it** — together they name the CARRIED
      key→value map, so they are an executable mirror of rows U1–U5 and move
      with them. **The split is part of the mirror**: the set-`HOME` case belongs
      to the pipeline fixture and the unset-`HOME` case to the direct
      `buildGitEnv` call, because only the second can discriminate row U2's
      source claim. A row added to or removed from U1–U5 that does not move this
      assertion is a table and a mirror disagreeing inside one commit. **Its
      CANARY half mirrors row U21 rather than any one key**: the canary name
      must stay a name no Table U row carries, so a row that happened to name it
      would silently retire the check.

## Implementation notes & constraints

- **No new environment seam.** `buildGitEnv` must read `process.env` directly.
  WP-155 deleted every test-exec env seam and `docs/THREAT-MODEL.md` states
  that **no environment variable can substitute an executable or skip the
  containment self-check** (ADR-0028); adding one here to make a test
  convenient would regress that. The tests exercise the pin by exporting the
  real variable around the run, which the pipeline fixture's existing
  save/overwrite/restore of a named `ENV_KEYS` list already does.
- **Zero new PACKAGE dependencies** (CLAUDE.md). `git-env.js` may require
  `node:path` and the existing `../paths` module (`getPaths`), exactly as its
  Deliverables row specifies — nothing else.
- **Do not "fix" the merge path.** `promote.js`'s `spawnGitForMerge` builds its
  own, stricter environment for its own reasons; unifying the two is
  prohibited — see Out of scope.
- **Do not widen the pinned call set.** This WP changes no shape, no argument
  and no disposition. If an assertion goes red because a call's *shape* changed,
  that is a defect in the change, not a reason to touch
  `tests/unit/dream-pipeline.known-calls.js` (which is not in Deliverables).
- **`scripts/red-proofs.js` refuses a `node_modules` SYMLINK** at its SNAPSHOT
  phase (`ERROR: SNAPSHOT — unsupported entry type: symbolic link at
  node_modules`), which is what a git worktree sharing the main checkout's
  dependencies has. If yours does, run V2 and V3 with `--root` pointed at a
  plain copy — `git archive HEAD | tar -x -C <dir>` — which is how this spec's
  own both-directions runs were made. A normal clone is unaffected: the runner
  excludes a `node_modules` DIRECTORY from its domain.
- **Two `Done` specs quote today's `indexEnv` literal as a record**
  (`docs/specs/done/WP-criterion-red-harness.md:95-96`,
  `docs/specs/done/WP-audit-c-close-disposition.md:130`). Neither is amended by
  this WP, and that is deliberate: each is a dated record of what the tree said
  then, neither states a rule this WP changes, and the property
  `WP-criterion-red-harness` rests on — *exactly one site builds the private
  index environment* — is preserved by the new site.
- When uncertain: choose the simpler option and note it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The one untrusted input this WP consumes is **the launching process's
      environment — untrusted AS A SELECTOR FOR THE RUN'S OWN GIT ACT**, and the
      qualifier is load-bearing rather than decorative. What it may not choose:
      the repository, the object store, the index, the commit identity, object
      interpretation, and — with ONE named exception — which configuration the
      call obeys. **The exception is `HOME` (row U2), and it is deliberate:** it
      selects the user's own configuration files, which O1 declines to override,
      and it is taken through `getPaths().home` so the run and its scheduled twin
      agree on it. That is a TRUST DECISION, not a safety claim — "Why Table U is
      what it is" states plainly, and measures, that a hostile `HOME` selects a
      config the pinned shapes will obey. It is handled by **construction, and
      what that forbids is precise: a DENYLIST** — spreading `process.env` and
      deleting the keys someone thought to name — because a denylist over git's
      variable grammar cannot be closed (Table U row U21), and because it leaks
      every key nobody listed. Every key present in the child environment must be
      there because a row of Table U put it there by name. **An allowlist-driven
      filter reaches the same map** (measured) and is therefore not a safety
      question; key-by-key construction is nonetheless the exact contract's
      required source form, and the reviewer's read is what enforces it.
- [ ] `indexFile` reaches a child process's environment as `GIT_INDEX_FILE`.
      Its value is code-derived — `<stateDir>/dream-index.<pid>.tmp` — and never
      user-supplied; the clauses it must satisfy are Table W row W1(c)'s, which
      this WP does not change. No other untrusted identifier flows into a path
      or a command line here.
- [ ] `N/A — no untrusted identifier crosses a language boundary in this WP`
      (the template's anchored-pattern bullet): the WP adds no shell, no
      PowerShell and no regex over a user-supplied name.

## Acceptance criteria

- [ ] **AC1 — every invocation the seam makes carries the constructed
      environment, KEY AND VALUE.** Across a full run, every invocation the
      substituted `spawnGit` observes has an `env` that is exactly the complete
      **key → value map** Table U's CARRIED rows decide — not merely the right
      key set:
      - `PATH` equals the inherited `process.env.PATH` (row U1);
      - `HOME` equals `getPaths().home` (row U2). **Copying and deriving
        COINCIDE whenever the launching environment sets `HOME`**, so no fixture
        can tell them apart there: `getPaths()` is `env.HOME || os.homedir()`
        (`src/core/paths.js:53-54`) and on POSIX `os.homedir()` itself reads
        `$HOME` first — measured, with `HOME` set to an arbitrary path,
        `getPaths().home` tracks it exactly. **The discriminating case is `HOME`
        UNSET in the launching environment**: a copy carries no `HOME` key at
        all, while the derivation still carries one, equal to `getPaths().home`
        (= `os.homedir()`, the passwd home) — measured. Assert **both**: the set
        case in the pipeline fixture, and the unset case directly against
        `buildGitEnv` with `process.env.HOME` deleted around the call. The
        unit-level form for the unset case is deliberate — it keeps a run that
        falls back to the developer's real home out of the pipeline fixture,
        which overrides `WIENERDOG_HOME`, `WIENERDOG_VAULT`, `CLAUDE_CONFIG_DIR`
        and `CODEX_HOME` (`tests/unit/dream-pipeline.test.js:411-414`) but would
        leave `home` itself to fall back;
      - no `XDG_CONFIG_HOME` key is present, asserted with the fixture exporting
        one (row U3);
      - `GIT_INDEX_FILE` equals exactly `<paths.state>/dream-index.<pid>.tmp` on
        the three `private`-disposition shapes and is **absent** from the six
        `unset` ones (rows U5, U13);
      - no other key at all.
      Every optional key is asserted in **both** a set and an unset fixture, so
      nothing is left to what the host happens to export.
      **Non-vacuity:** the run invoked git at least once.
      **AND A CANARY, because even a complete key→value map is host-dependent
      on the ABSENCE side:** an implementation that spreads `process.env` and
      deletes the **named bad keys** — a DENYLIST — satisfies every clause above
      on a host that exports none of them, which is most hosts. That shape is
      what row U21 and the Security checklist forbid, and it is what the canary
      catches: for the whole run the test exports one variable **no Table U row
      names** (`WIENERDOG_ENV_CANARY`, a name the pipeline fixture's `ENV_KEYS`
      list can carry through its existing save/overwrite/restore) and asserts it
      appears in **no** observed `env`. A denylist leaks it on every host,
      whatever the ambient environment holds.
      **WHAT THE CANARY DOES NOT DO, stated because an earlier draft claimed it
      did.** It does not distinguish key-by-key construction from a spread
      followed by deleting every key NOT in the allowlist: measured, that
      allowlist-driven filter produces a map deeply equal to the constructed one,
      canary absent and `GIT_DIR` absent, so **no runtime criterion can tell the
      two apart** — they are the same map. The PRODUCT property is unaffected and
      is fully asserted above: the child environment IS exactly the allowlist
      map. Key-by-key construction is the **required source form** of the exact
      contract, and the surface that checks a source form is the reviewer's read
      of `git-env.js`, not a test. No structural gate is added for it: that would
      be machinery guarding no product behaviour.
- [ ] **AC2 — an exported `GIT_DIR` does not redirect the run** (row U6). With
      `GIT_DIR` exported to a decoy repository for the whole run, the vault's
      HEAD advances by the run's commit and the decoy repository's HEAD and
      object store are unchanged.
- [ ] **AC3 — nor does an exported `GIT_OBJECT_DIRECTORY`** (row U7), with
      `GIT_DIR` unset: the objects the run writes are readable in the vault and
      the decoy's object store gains nothing.
- [ ] **AC4 — nor does an injected config** (row U10). With
      `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` exporting
      `core.fsmonitor` pointed at a script that records that it ran, the run
      completes and the script did not run.
- [ ] **AC5 — THE POSITIVE CONTROL: the user's own configuration still
      governs the run, and only their FILES do.** This is the executable
      statement of O1's principle, and without it AC2–AC4 only prove that
      injections are refused — never that anything survives. Two halves, one
      test: **(a)** a hook the user configured through their config FILES — a
      `core.hooksPath` in the bound home's `~/.gitconfig`, holding a
      `reference-transaction` hook that records that it ran — **still fires** on
      the run's pinned `update-ref`; **(b)** the same hook offered through the
      launching environment instead (`GIT_CONFIG_COUNT` + `core.hooksPath`, the
      AC4 family) **does not fire**. A pin that suppressed the user's
      configuration would fail (a); a pin that leaked the launching environment
      would fail (b); only the decided behaviour passes both.
- [ ] **AC6 — the three RED declarations are PROVEN**, identified by this WP's
      own `wp` field and by the three ids named under Exact contracts, never as
      a repo-wide count (a repo-wide total goes stale the moment any other WP
      declares a proof). The whole-tree run `node scripts/red-proofs.js` exits 0
      with `RUN: PROVEN`, and within it each of those three ids has a `PROVEN`
      per-proof line and every roll-up line whose WP is
      `WP-dream-git-env-pinning` reads `PROVEN`.
- [ ] **AC7 — the re-targeted declaration still proves its own thing**: in that
      same whole-tree run, `dream-private-index-dropped` is `PROVEN`, so
      dropping the run's own `GIT_INDEX_FILE` still reddens the index guard from
      the new private-index site.
- [ ] **AC8 — the registered mirrors moved in the same commit**: ADR-0012
      carries the amendment with the exact heading, and Table W row W1 carries
      the amendment with the exact opening sentence, with the hook-residual
      sentence still present. **NAMED RESIDUAL, stated rather than closed:** V5
      is a presence grep on three exact strings, so a copied heading over a
      wrong body passes it — the greps prove PRESENCE, and the CONTENT
      obligations the Mirrored Surface Checklist spells out for each amendment
      are the reviewer's read, judged over the whole cell and never over the
      grep window.
- [ ] **AC9 — idempotence:** `N/A — this WP ships no command and writes nothing
      outside the repo; a dream run is deliberately not idempotent (ADR-0012),
      and this WP changes only the environment of an existing run's children.`

## Verification steps (run these; paste output in the PR)

```bash
# V1 — AC1-AC5 and the whole suite
npm test

# V2 — AC6 and AC7, THE GATE. Whole tree, every declaration selected.
# Exit 0 and `RUN: PROVEN` are required.
node scripts/red-proofs.js

# V3 — AC6, this WP's own three, read by id. A `--wp` SELECTION never exits 0
# while any other WP has declarations, and that is the runner's design, not a
# failure — which is why V2 and not this step is the gate. TWO exit shapes,
# both measured on `4b629ec6`: BEFORE this WP's declaration file exists the
# selection matches nothing and the run is `VACUOUS: V2 — the selection matched
# no proof` (rc 1); with `--wp WP-show-slot-own-value-kind`, whose declarations
# DO exist, the same command reports those proofs `PROVEN` and the run
# `FILTERED` (rc 1) because every other WP's declarations were left out. Once
# this WP's file exists the implementer sees the second shape. What this step
# asserts is the CONTENT, not the exit code: three `PROVEN` per-proof lines and
# `PROVEN` on every roll-up line for this WP.
node scripts/red-proofs.js --wp WP-dream-git-env-pinning

# V4 — AC6's identity check: exactly the three declared ids, from this WP's own
# `wp` field. Never a repo-wide count.
node -e 'const d=require("./tests/red-proofs/dream-git-env-pinning.proofs.json");
const ids=d.proofs.filter(p=>p.wp==="WP-dream-git-env-pinning").map(p=>p.id).sort();
const want=["git-env-inherits-config-count","git-env-inherits-git-dir","git-env-inherits-object-directory"];
console.log(ids.join(",")); process.exit(JSON.stringify(ids)===JSON.stringify(want)?0:1)'

# V5 — AC8, the two out-of-spec mirrors, guarded so an absent file is RED
A=docs/adr/0012-dream-run-lifecycle.md
W=docs/specs/done/WP-dream-promote-in-workspace.md
test -f "$A" && grep -qF "## Amendment (2026-09-05): the run's git calls run under a constructed environment — WP-dream-git-env-pinning" "$A" || { echo "FAIL: ADR-0012 amendment missing"; exit 1; }
test -f "$W" && grep -qF "**AMENDED 2026-09-05 — THE ENVIRONMENT OF THE RUN'S OWN GIT CALLS IS CONSTRUCTED, NOT INHERITED.**" "$W" || { echo "FAIL: Table W row W1 amendment missing"; exit 1; }
test -f "$W" && grep -qF "NEITHER SUPPRESSED NOR DETECTED" "$W" || { echo "FAIL: row W1's hook residual was not left intact"; exit 1; }
echo "V5 OK"

# V6 — the repo gates. The boundary check takes the spec and the changed set,
# as `.github/workflows/ci.yml` invokes it — but WITHOUT `mapfile`, which macOS
# `/bin/bash` 3.2.57 does not have (measured: `type mapfile` -> not found). No
# tracked path in this repo carries a space, so word splitting is safe here.
# NOTE: on the DESIGN branch this check is RED by design — the successor stub
# `docs/specs/WP-dream-git-env-validate-seam.md` is not in Deliverables and must
# not be. It is the IMPLEMENTATION branch's gate, and it is there that exit 0 is
# required.
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-git-env-pinning.md $(git diff --name-only origin/main...HEAD)
```

## Out of scope (do NOT do these)

- **`src/core/dream/validate.js`'s `git()`, and therefore `assertGitRepo`** —
  the second git spawn point on the dream path. Named residual, owner item O2,
  successor `WP-dream-git-env-validate-seam`.
- **`src/core/dream/promote.js`'s `spawnGitForMerge` and `constructMergeEnv`** —
  already constructed, deliberately stricter, and outside this WP's
  Deliverables. Table W row W1(c)(ii) prohibits forwarding the pipeline's seam
  into `promote()` (the two have incompatible `cwd` conventions and it would
  surface an unpinned tenth shape); the same reasoning applies to unifying
  their environments, and no measurement here shows one construction is total
  over both.
- **`src/core/vault.js`'s `git init`/`add -A`/`commit`** — the init and adopt
  path, not the dream path; out of scope on Table W row W6's finding.
- **Widening or narrowing the nine pinned shapes, their slots, their
  dispositions or `tests/unit/dream-pipeline.known-calls.js`.** Any of those is
  a change to Table W row W1(c) and an owner-visible act of its own.
- **Reopening either remedy Table W row W1 rejects by name** — suppressing the
  user's hooks, or retreating to a state-total index compare.
- **`docs/HANDOVER.md`, `docs/THREAT-MODEL.md` and `docs/ARCHITECTURE.md`.**
  Swept for the claim rather than a phrase (`inherits`, `process.env`,
  `environment`, `GIT_`): neither THREAT-MODEL nor ARCHITECTURE states anything
  about the dream's git environment that this decision falsifies, so neither is
  a Deliverable. HANDOVER is the orchestrator's.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): build the run's git environment from a named allowlist (WP-dream-git-env-pinning)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
