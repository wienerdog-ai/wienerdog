---
id: WP-dream-git-env-pinning
title: Build the dream run's git environment from a named allowlist at the pipeline seam
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0028, ADR-0031, ADR-0042]
epic: dream-promotion
---

# WP-dream-git-env-pinning: build the dream run's git environment from a named allowlist

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
   and by acceptance criteria AC2–AC5, which name three separate channels.

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
and `XDG_CONFIG_HOME` (Table U rows U2, U3), so global and repository-local
config still apply, and no hook is suppressed, relocated or disabled. The
**launching process's environment** is a different thing: it redirects or
injects into **our own act's target** — where our write lands, which repository
our call reads, which configuration our call obeys — and it is not a
configuration surface for a run that is also a scheduled job. The scheduled
dream already behaves this way; the pin makes a manual `wienerdog dream`
identical to the nightly one instead of environment-dependent.

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
ACCEPTED for rows U6–U20 (the stub's item 3 shape — the residual named, not
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
change carries that clause's standing trigger. Its materiality with O1 landed
is low: the pipeline's own calls no longer follow the redirection, so the
consequence is a late, loud failure at `rev-parse HEAD` in the vault instead of
an early, friendly refusal — never a commit into the wrong repository.
*Overrule cost:* folding it in adds `src/core/dream/validate.js` and
`tests/unit/dream-validate.test.js` to Deliverables plus a second
`tests/red-proofs/*.proofs.json` (one declaration file per suite), taking the
package to nine files and S → M against `docs/specs/README.md`'s ≤8-files
sizing heuristic.

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
  `WIENERDOG_VAULT` on POSIX plus `WIN_ENV_PASSTHROUGH` (`:58-78`) on win32. A
  scheduled dream therefore already inherits no `GIT_*`.
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
| create | src/core/dream/git-env.js | exports `buildGitEnv(indexFile?)` — the single site that decides the run's git environment, built from Table U's CARRIED rows and nothing else. No dependency outside `node:path` |
| modify | src/cli/dream.js | `gitIn` builds the child environment with `buildGitEnv` and takes `opts.indexFile` in place of `opts.env`; `commitNamedSet` passes `{ indexFile: tmpIndex }` where it built `indexEnv`. Nothing else changes — not the nine shapes, not their arguments, not their dispositions |
| modify | tests/unit/dream-pipeline.test.js | assertions covering AC1–AC4 (the implementer designs the cases) |
| modify | tests/red-proofs/dream-pipeline.proofs.json | re-target the existing `dream-private-index-dropped` declaration's `find`, `replace` and `marker` onto the new private-index site so the same mutation still drops the run's own `GIT_INDEX_FILE`. Its `id`, `wp`, `criterion`, `why` and `expectRed` set are UNCHANGED |
| create | tests/red-proofs/dream-git-env-pinning.proofs.json | this WP's three RED declarations (Exact contracts below); `suite` is `tests/unit/dream-pipeline.test.js` |
| modify | docs/adr/0012-dream-run-lifecycle.md | one new dated Amendment section at the end of the file, per the Mirrored Surface Checklist. Nothing existing in the file is rewritten or renumbered |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | a dated amendment INSIDE Table W row W1 and nowhere else, per the Mirrored Surface Checklist. Row W1's hook-residual sentences stay intact; W1's existing line citations are NOT re-numbered |

### Exact contracts

**The constructed environment.**

```js
/**
 * The dream run's git environment: Table U's CARRIED rows and nothing else.
 * @param {string} [indexFile] absolute path for GIT_INDEX_FILE (Table U row U5).
 *   Omitted for every shape whose declared disposition is `unset`.
 * @returns {Record<string,string>} a FRESH object, built key by key — never
 *   `process.env`, and never a spread or a filtered copy of it.
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

**The three RED declarations**, ids fixed here so acceptance criterion AC5 can
name them without a repo-wide count. Each is one exact-substring mutation of
`src/core/dream/git-env.js` that **reintroduces inheritance of exactly one
channel** and declares the assertions it must redden:

| id | reintroduces | must redden |
|----|--------------|-------------|
| `git-env-inherits-git-dir` | `GIT_DIR` from `process.env` (Table U row U6) | the AC1 and AC2 assertions |
| `git-env-inherits-object-directory` | `GIT_OBJECT_DIRECTORY` (row U7) | the AC1 and AC3 assertions |
| `git-env-inherits-config-count` | the `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0` / `GIT_CONFIG_VALUE_0` triple (row U10) | the AC1 and AC4 assertions |

`wp` is `WP-dream-git-env-pinning` on all three; `criterion` is the acceptance
criterion's number.

## Contract reference

**ADR-0031's activation trigger fires: three of the seven are true.** (iv)
precedence and fallback behaviour changes — which environment a spawned call
obeys, and which inherited value wins; (v) the task crosses an authority
boundary — the user's launching environment versus the run's own act, which is
exactly the line O1 draws; (vii) the same contract must appear in mirrored
surfaces — this spec, ADR-0012, and Table W row W1 in a `Done` spec.

### Table U — the dream run's constructed git environment

**Canonical for what the run's own git calls inherit, what they are given, and
what each dropped channel demonstrably reached.** Every other statement of
these facts — in `git-env.js`'s comments, in the tests, in ADR-0012, in Table W
row W1 — is a mirrored summary that defers here.

**Read the table in one direction only.** Rows **U1–U5 are the mechanism**: the
environment is BUILT from them, key by key. Rows **U6–U20 are evidence**, not a
filter: they record what the construction happens to close and how far each
channel was measured to reach. **Row U21 is what makes the enumeration
closable** — a `GIT_*` denylist could never be, because git's grammar is not
ours, so nothing below is enumerated in order to be excluded.

**Provenance of the "Measured reach" column.** Every cell marked MEASURED was
produced on git 2.50.1 by issuing the pinned shape's own argv
(`git -C <repo> …`) under the named variable in two scratch repositories; the
runs are in
`docs/specs/logbook/2026-09-05-git-env-pinning-design-gate-rounds.md`. A cell
that says NOT MEASURED says so and names what it rests on instead.

| # | Variable | Class | Measured reach into the nine pinned shapes | Disposition |
|---|----------|-------|--------------------------------------------|-------------|
| U1 | `PATH` | resolution | — | **CARRIED, inherited verbatim.** The pinned front door resolves `git` on `env.PATH` (`src/core/exec-identity.js:93-118`) and refuses unless the result equals the pinned command path (`:451-461`); a `PATH` this code chose would compare the pin against itself and retire that drift check for the manual run. Residual, inherited from WP-154 and not new here: PATH selection is closed by the pinned absolute spawn and its verification, never by the PATH's contents |
| U2 | `HOME` | config location | — | **CARRIED when set.** The user's global git config is their standing instruction and stays honoured — the half of O1's principle that distinguishes it from hook suppression. MEASURED: with `HOME` and `XDG_CONFIG_HOME` both absent git resolves no global config (a global key's `config --get` exits 1); with `HOME` carried, `~/.gitconfig` applies |
| U3 | `XDG_CONFIG_HOME` | config location | — | **CARRIED when set.** The XDG relocation of that same file. MEASURED: `$XDG_CONFIG_HOME/git/config` applies when the home holds no `.gitconfig` |
| U4 | win32 only: `SystemRoot`, `windir`, `SystemDrive`, `ComSpec`, `PATHEXT`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP` | platform essentials | **NOT MEASURED** — no win32 host in this WP's measurements, and the cell says so rather than implying a run | **CARRIED when set, on win32 only.** Provenance: `src/cli/run-job.js:58-78`, the list the scheduled job child already carries for the same `git` spawn, plus `USERPROFILE`/`HOMEDRIVE`/`HOMEPATH` because Git for Windows resolves the user's config through them when `HOME` is unset, and `PATHEXT` because `resolveExecutable` reads it on win32 |
| U5 | `GIT_INDEX_FILE`, the run's own | index selection | see U13 | **SET BY THE RUN**, on the environment of the three shapes whose declared disposition is `private` and on no other — exactly as today. Its value and the two clauses it must satisfy are Table W row W1(c)'s, cited not restated |
| U6 | `GIT_DIR` | write target + repository selection | **MEASURED, reaches four shapes**: `rev-parse HEAD` returned the OTHER repository's head; `hash-object -w --stdin` stored the blob in the other repository and not the vault; `commit-tree` + `update-ref` advanced the other repository's HEAD while the vault's stayed unchanged | **ABSENT** |
| U7 | `GIT_OBJECT_DIRECTORY` | object-store write target | **MEASURED with `GIT_DIR` unset**: `hash-object -w --stdin` wrote under the other repository's object store and not the vault's | **ABSENT** |
| U8 | `GIT_COMMON_DIR` | object store + refs | **MEASURED**: with `GIT_DIR` at the vault, `hash-object -w --stdin` still wrote under the other repository's object store | **ABSENT** |
| U9 | `GIT_ALTERNATE_OBJECT_DIRECTORIES` | read scope | **MEASURED**: `read-tree «tree»` for a tree existing only in another repository exits 128 without it and 0 with it, entering that repository's content into the run's private index | **ABSENT** |
| U10 | `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n` | config injection — **and a CODE channel** | **MEASURED, twice**: `core.fsmonitor=<script>` **executed that script** during `write-tree` and during `update-index`; `core.hooksPath=<dir>` fired a `reference-transaction` hook — one the user never configured — on `update-ref` | **ABSENT** |
| U11 | `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM` | config file selection — **the same CODE channel** | **MEASURED for `GIT_CONFIG_GLOBAL`**: a relocated global config carrying `core.fsmonitor` executed the script during `write-tree`. The other two are NOT MEASURED separately — same family, same resolution step | **ABSENT, with a NAMED COST**: a user who relocates their global git config *only* by exporting `GIT_CONFIG_GLOBAL` loses it for the run's own calls. Accepted rather than excepted, because the same variable is a measured code channel; the `HOME` and XDG relocations (U2, U3) still work |
| U12 | `GIT_WORK_TREE` | working-tree location | **MEASURED, no reach**: set alone, `rev-parse HEAD`, `read-tree` and `write-tree` behaved exactly as without it — the nine shapes are index and object plumbing | **ABSENT** |
| U13 | `GIT_INDEX_FILE`, INHERITED | index selection | **Code fact today**: `gitIn` (`src/cli/dream.js:166-175`) passes `opts.env \|\| process.env`, so an exported value reaches the six `unset`-disposition shapes and **W1(c)'s declared `unset` disposition is today a property of the launching environment rather than of the code**. MEASURED: on `rev-parse HEAD` and `ls-tree` the pointed-at index's bytes were unchanged, so the exposure is a contract defect, not a measured index write | **ABSENT as an inherited value**; set by the run per U5. This row is what makes W1(c)'s `unset` disposition true by construction |
| U14 | `GIT_NAMESPACE` | ref namespace | **MEASURED, no reach**: under `GIT_NAMESPACE=evil` the run's own `update-ref … HEAD` moved the repository's real HEAD, so `HEAD` is not namespaced | **ABSENT** |
| U15 | `GIT_CEILING_DIRECTORIES` | repository discovery | **MEASURED, no reach**: `rev-parse HEAD` exited 0 with the ceiling at the vault and again at its parent. Scope of the claim: a vault that is its own repository root, which is what `assertGitRepo` and adopt require | **ABSENT** |
| U16 | `GIT_EXEC_PATH` | code — git dispatches non-builtin subcommands from it | **MEASURED, no reach, with a live-channel control**: a planted `git-hash-object` was NOT executed by `hash-object -w --stdin` (it is a builtin), while a planted `git-wdprobe` WAS executed by `git wdprobe` — so the probe proves absence of reach, not absence of a channel | **ABSENT** |
| U17 | `GIT_ATTR_NOSYSTEM`, `GIT_ATTR_SOURCE` | attribute lookup — a filter-driver code channel | **MEASURED, no reach**: with `filter.wd.clean`/`.smudge` injected and `a.txt filter=wd` committed, no driver ran for `show HEAD:a.txt` or for `hash-object -w --stdin` — which carries no `--path`, by Table W row W1's own contract | **ABSENT** |
| U18 | `GIT_TEMPLATE_DIR` | new-repository template | **NOT MEASURED** — `git help git` scopes it to `init` and `clone`, neither of which is a pinned shape | **ABSENT** |
| U19 | `GIT_TRACE` and the other `GIT_TRACE*` variables | diagnostics, with a file sink | **NOT MEASURED** — `git help git` documents an absolute-path value as a file git appends to | **ABSENT, with a NAMED COST**: `GIT_TRACE=1 wienerdog dream` no longer traces the run's own git calls. Accepted: a debugging convenience, against carrying a variable whose value git treats as a write target |
| U20 | `GIT_SSH`, `GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_TERMINAL_PROMPT`, `GIT_PROXY_COMMAND` | transport and credential helpers | **NOT MEASURED** — none of the nine shapes contacts a remote; Table W row W1(c)'s set contains no `fetch`, `push`, `clone` or `ls-remote` | **ABSENT**, no cost |
| U21 | **every other variable, `GIT_*` or not** | — | — | **ABSENT — and this row is the mechanism.** The environment is built from U1–U5; U6–U20 are evidence about channels that were measured, never a list of things filtered out. Adding a key is a change to this table, and therefore owner-visible by construction |

### Mirrored Surface Checklist

Every surface that mirrors **Table U**, so a review finding updates the table
and all its mirrors **in one pass and in the same commit** — no commit exists
in which the table and a registered mirror disagree — and any new mirror found
in review is added here on the spot.

**In this spec:**

- [ ] **Deliverables-table cells** — the `git-env.js` row ("built from Table U's
      CARRIED rows and nothing else") and the `dream.js` row.
- [ ] **Acceptance criteria** — AC1 quantifies over U1–U5; AC2, AC3 and AC4
      assert U6, U7 and U10.
- [ ] **Verification commands / greps** — V1–V5 below.
- [ ] **Current state** — the `gitIn`, `indexEnv`, `buildCleanEnv`,
      `constructMergeEnv` and `resolveExecutable` bullets.
- [ ] **Operative prose** — O1's principle paragraph (which names `HOME` and
      `XDG_CONFIG_HOME`, i.e. rows U2 and U3) and O1's overrule costs (a) and
      (b), which name rows U6–U20, U11 and U13.
- [ ] **Exact contracts** — `buildGitEnv`'s JSDoc and the three RED rows, which
      name rows U5, U6, U7 and U10.

**Outside this spec — these move in the SAME commit as any change to Table U:**

- [ ] **`docs/adr/0012-dream-run-lifecycle.md`** — one new dated Amendment
      section at the end of the file, headed exactly:
      `## Amendment (2026-09-05): the run's git calls run under a constructed environment — WP-dream-git-env-pinning`
      It must state, and nothing more is required of it: the decision (an
      environment built from a named allowlist at the seam, every inherited
      `GIT_*` thereby absent); the principle (config files and hooks are the
      user's standing instructions and stay honoured — `HOME`/`XDG_CONFIG_HOME`
      are carried; the launching process's environment is not a configuration
      surface); the distinction from the rejected hook suppression **naming
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
      config file the user configured. **The hook-residual sentences stay
      byte-intact**, and W1's existing line citations into `src/cli/dream.js`
      are NOT re-numbered: they are pinned to the SHAs at which they were
      measured, and chasing them is the rot this row already ruled against.
- [ ] **`src/core/dream/git-env.js`'s own comments** — the run's first-read
      statement of Table U. It may summarise; it may not decide.
- [ ] **`tests/unit/dream-pipeline.test.js`'s AC1 assertion** — it names the
      CARRIED key set, so it is an executable mirror of rows U1–U5 and moves
      with them. A row added to or removed from U1–U5 that does not move this
      assertion is a table and a mirror disagreeing inside one commit.

## Implementation notes & constraints

- **No new environment seam.** `buildGitEnv` must read `process.env` directly.
  WP-155 deleted every test-exec env seam and `docs/THREAT-MODEL.md` states
  that **no environment variable can substitute an executable or skip the
  containment self-check** (ADR-0028); adding one here to make a test
  convenient would regress that. The tests exercise the pin by exporting the
  real variable around the run, which the pipeline fixture's existing
  save/overwrite/restore of a named `ENV_KEYS` list already does.
- **Zero new dependencies** (CLAUDE.md). `git-env.js` needs `node:path` at
  most.
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
  (`docs/specs/done/WP-criterion-red-harness.md:95`,
  `docs/specs/done/WP-audit-c-close-disposition.md:130`). Neither is amended by
  this WP, and that is deliberate: each is a dated record of what the tree said
  then, neither states a rule this WP changes, and the property
  `WP-criterion-red-harness` rests on — *exactly one site builds the private
  index environment* — is preserved by the new site.
- When uncertain: choose the simpler option and note it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The one untrusted input this WP consumes is **the launching process's
      environment**, and it is handled by **construction, not by filtering**: no
      code path may build the child environment by copying `process.env` and
      deleting keys, because a delete-list over git's variable grammar cannot be
      closed (Table U row U21). Every key present in the child environment must
      be there because a row of Table U put it there by name.
- [ ] `indexFile` reaches a child process's environment as `GIT_INDEX_FILE`.
      Its value is code-derived — `<stateDir>/dream-index.<pid>.tmp` — and never
      user-supplied; the clauses it must satisfy are Table W row W1(c)'s, which
      this WP does not change. No other untrusted identifier flows into a path
      or a command line here.
- [ ] `N/A — no untrusted identifier crosses a language boundary in this WP`
      (the template's anchored-pattern bullet): the WP adds no shell, no
      PowerShell and no regex over a user-supplied name.

## Acceptance criteria

- [ ] **AC1 — every invocation the seam makes carries a constructed
      environment.** Across a full run, every invocation the substituted
      `spawnGit` observes has an `env` whose key set is exactly Table U's
      CARRIED keys present on the host (rows U1–U4), plus `GIT_INDEX_FILE` for
      exactly the shapes whose declared disposition is `private` and for no
      other. **Non-vacuity:** the run invoked git at least once.
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
- [ ] **AC5 — the three RED declarations are PROVEN**, identified by this WP's
      own `wp` field and by the three ids named under Exact contracts, never as
      a repo-wide count (a repo-wide total goes stale the moment any other WP
      declares a proof). The whole-tree run `node scripts/red-proofs.js` exits 0
      with `RUN: PROVEN`, and within it each of those three ids has a `PROVEN`
      per-proof line and every roll-up line whose WP is
      `WP-dream-git-env-pinning` reads `PROVEN`.
- [ ] **AC6 — the re-targeted declaration still proves its own thing**: in that
      same whole-tree run, `dream-private-index-dropped` is `PROVEN`, so
      dropping the run's own `GIT_INDEX_FILE` still reddens the index guard from
      the new private-index site.
- [ ] **AC7 — the registered mirrors moved in the same commit**: ADR-0012
      carries the amendment with the exact heading, and Table W row W1 carries
      the amendment with the exact opening sentence, with the hook-residual
      sentence still present.
- [ ] **AC8 — idempotence:** `N/A — this WP ships no command and writes nothing
      outside the repo; a dream run is deliberately not idempotent (ADR-0012),
      and this WP changes only the environment of an existing run's children.`

## Verification steps (run these; paste output in the PR)

```bash
# V1 — AC1-AC4 and the whole suite
npm test

# V2 — AC5 and AC6, THE GATE. Whole tree, every declaration selected.
# Exit 0 and `RUN: PROVEN` are required.
node scripts/red-proofs.js

# V3 — AC5, this WP's own three, read by id. A `--wp` SELECTION exits 1 with
# `RUN: FILTERED` whenever other WPs' declarations are left out — that is the
# runner's design (measured on `4b629ec6`), NOT a failure, and it is why V2 and
# not this step is the gate. What this step asserts: three `PROVEN` per-proof
# lines and `PROVEN` on every roll-up line for this WP.
node scripts/red-proofs.js --wp WP-dream-git-env-pinning

# V4 — AC5's identity check: exactly the three declared ids, from this WP's own
# `wp` field. Never a repo-wide count.
node -e 'const d=require("./tests/red-proofs/dream-git-env-pinning.proofs.json");
const ids=d.proofs.filter(p=>p.wp==="WP-dream-git-env-pinning").map(p=>p.id).sort();
const want=["git-env-inherits-config-count","git-env-inherits-git-dir","git-env-inherits-object-directory"];
console.log(ids.join(",")); process.exit(JSON.stringify(ids)===JSON.stringify(want)?0:1)'

# V5 — AC7, the two out-of-spec mirrors, guarded so an absent file is RED
A=docs/adr/0012-dream-run-lifecycle.md
W=docs/specs/done/WP-dream-promote-in-workspace.md
test -f "$A" && grep -qF "## Amendment (2026-09-05): the run's git calls run under a constructed environment — WP-dream-git-env-pinning" "$A" || { echo "FAIL: ADR-0012 amendment missing"; exit 1; }
test -f "$W" && grep -qF "**AMENDED 2026-09-05 — THE ENVIRONMENT OF THE RUN'S OWN GIT CALLS IS CONSTRUCTED, NOT INHERITED.**" "$W" || { echo "FAIL: Table W row W1 amendment missing"; exit 1; }
test -f "$W" && grep -qF "NEITHER SUPPRESSED NOR DETECTED" "$W" || { echo "FAIL: row W1's hook residual was not left intact"; exit 1; }
echo "V5 OK"

# V6 — the repo gates. The boundary check takes the spec and the changed set,
# exactly as `.github/workflows/ci.yml` invokes it.
npm run lint
mapfile -t CHANGED < <(git diff --name-only origin/main...HEAD)
node scripts/boundary-check.js docs/specs/WP-dream-git-env-pinning.md "${CHANGED[@]}"
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
