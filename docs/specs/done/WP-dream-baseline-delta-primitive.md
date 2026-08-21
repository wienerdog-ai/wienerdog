---
id: WP-dream-baseline-delta-primitive
title: Add a baseline-capture and delta primitive, git-free and consumed by nothing yet
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: audit-2026-07-29
---

# WP-dream-baseline-delta-primitive: the capture and delta primitive

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

**Dispatch precondition.** This spec is written against the tree at
`e648284046dc86ac4bf8cb1cdf3a985134485393` (`e648284`), which was `main` and
`origin/main` at authoring time. `main` has since advanced with a docs-only process
landing that does not touch any file this spec cites; re-verify against whatever the
implementer's `main` actually is, and do not assume the two are still equal. Before dispatch, re-run every `file:line` citation and every
measurement below against the tree the implementer will find
(`docs/specs/README.md` → Dispatch-time re-verification). A citation that does not
resolve blocks the dispatch. **Range citations are checked at BOTH ends** — that a
cited range ends where its construct ends, not merely that its first line resolves.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Its nightly **dream** spawns a headless AI brain,
lets it write notes, and then runs a code validator that classifies every write,
reverts what fails policy, and makes one commit.

That validator is moving off vault git state and onto a **constructed baseline**: the
system will know the exact bytes that existed before the brain ran, so every later
difference is attributable. The full reasoning, the measurements and the owner's
rulings live in the war-room decision log (newest on top) and are **not repeated
here**.

One attempt at this already failed and is recorded, not hidden:
`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md` swapped the validator's gate
inputs onto a captured baseline **while the brain still wrote into the live vault**.
Two external adversarial rounds measured that this cannot be behaviour-preserving.
Every live read it replaced was also a **freshness** check — `git status` told the
classifier what was true *now*, `git diff --cached` read after `git add -A` described
the bytes about to be committed — and a snapshot structurally cannot carry liveness.

**This work package therefore builds the primitive and stops there.** It computes the
difference between a captured baseline and a directory as that directory stands at
call time. It touches no gate, no pipeline step, and no existing file: nothing calls
it when this package merges. Its consumer is the successor package, which moves the
brain's write target into a system-built workspace and swaps the gates **there** —
where the snapshot is authoritative by construction, because the brain is the only
writer of that workspace and there is no concurrent user to race.

That ordering is the whole point, and the primitive must not undo it: **this module
makes no freshness claim.** Whether a delta is still true when its consumer acts on it
is the consumer's problem, and the successor solves it by construction rather than by
checking.

## Current state

Nothing exists; you are creating both files.

Two neighbouring patterns already in the tree, for shape only — neither is edited
here:

- `src/cli/dream.js:44-55` `hashScratch` / `:66-78` `scratchIntact`: the pipeline
  already takes a pre-brain baseline of its *input* files and verifies them after the
  run. That baseline stores hashes, which is enough for a yes/no integrity answer and
  **not** enough here: a consumer that must show what changed needs the bytes.
- `src/core/private-fs.js` `listPrivateEntries` (`:619-669`) returns `{ dirs, files, anomalies }` — the
  established idiom for a walk that surfaces what it refused to treat as a normal
  file instead of silently dropping it. This module follows it.

Today's validator derives its own evidence from git (`src/core/dream/validate.js`
`changedPaths` `:1020-1034`, and the `git diff --cached` family in Step 3). **None of
that changes in this package.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/delta.js | `captureBaseline` + `computeDelta` (Tables A and B). Zero git, zero new dependencies |
| create | tests/unit/dream-delta.test.js | the module's own coverage plus the git-agreement differential (Table C) |

No existing file is modified. If wiring appears necessary, that is a finding, not a
fix: this package is additive by ruling.

### Exact contracts

```js
/** Capture a directory's content as a baseline. Pure read; the caller must not
 *  mutate what it gets back (Table A — the representation cannot enforce it).
 *  @param {string} rootDir  absolute path to an existing real directory
 *  @param {(rel:string) => boolean} [include]  optional filter over relative paths;
 *    omitted means every regular file under rootDir
 *  @returns {Baseline} — `{files, anomalies, include}`, Table A; throws
 *    WienerdogError on an unreadable root, an unenumerable directory at any depth,
 *    or an unreadable file */
function captureBaseline(rootDir, include)

/** Difference the SAME root, as it stands at call time, against a baseline.
 *  Makes no freshness claim (Table A).
 *  Re-applies the baseline's OWN scope predicate — it is not a parameter here, so a
 *  caller cannot pass a mismatched one (Table A).
 *  @param {string} rootDir @param {Baseline} baseline
 *  @returns {{records: DeltaRecord[], anomalies: Array<{rel:string, kind:string}>}} */
function computeDelta(rootDir, baseline)
```

## Contract reference

Activation (ADR-0031, 2-of-7 — three are true): (i) a new module interface appears;
(iii) a structured record its consumer parses is introduced; (vi) the successor
package inherits this contract unchanged.

### Table A — the baseline and the walk

| Fact / rule | Value |
|-------------|-------|
| **The baseline is caller-immutable by CONTRACT, not by construction** | the returned bytes and containers must not be mutated between capture and delta; if they are, `computeDelta` compares against the caller's edit rather than what was on disk, and the false attribution this module exists to prevent returns without any filesystem race. This is a NAMED caller invariant, like `include`'s purity, because the representation cannot enforce it: measured, `Object.freeze` on a non-empty Buffer THROWS (`TypeError: Cannot freeze array buffer views with elements`) and the bytes stay writable, and a frozen `Map` still accepts `set`. An acceptance case pins the behaviour when the invariant is violated |
| What a baseline holds | `{files, anomalies, include}`: `files` maps relative path → the file's exact **bytes**; `anomalies` is what the capture walk refused to treat as a regular file (row below); `include` is the scope predicate the capture ran under, or a sentinel meaning "everything". Nothing else: a content hash was considered and cut, because `computeDelta` must read the current bytes anyway, so no consumer would ever read the hash |
| **Scope travels with the baseline** | `computeDelta` re-applies `baseline.include` and does NOT take a filter of its own. Without this, a path absent from `files` is ambiguous — excluded at capture, or genuinely new — and the primitive would report a pre-existing excluded file as `added`, which is exactly the false accusation the completeness rule exists to prevent. Carrying the predicate rather than re-passing it removes one failure mode — a caller cannot hand the second walk a DIFFERENT function. It does **not** make scope mismatch impossible, and this contract does not claim it does: measured, one and the same function object can answer `false` at capture and `true` at delta by reading mutable closure state, and the excluded pre-existing file is then reported `added` anyway. **Named caller invariant, since it cannot be enforced from inside:** `include` must be a pure function of the path — same input, same answer, for the lifetime of the baseline. A caller that violates it gets the false attribution, and an acceptance case pins whatever the chosen behaviour is |
| Path shape | relative to `rootDir`, POSIX separators (`/`) on every platform — the same shape `git status` yields, so the successor's registry and prefix tests keep working unchanged |
| Scope | every regular file under `rootDir`, filtered by `include` when the caller supplies one. **The module owns no policy about which files matter** — no ignore rules, no git notion of tracked, no dot-prefix rule. Scope is the caller's, and in the successor it is the workspace's copy-in scope |
| Symlinks and other non-regular entries | not captured as content: a symlink (to a file or a directory), a device, a socket or a FIFO is reported as `{rel, kind}` in the `anomalies` list that BOTH walks return — the baseline carries the anomalies seen at capture, `computeDelta` returns the anomalies seen now — and appears in no baseline and no record |
| **Classification and read are bound to ONE opened object** | a path is not `lstat`ed and then read by name. It is opened with `O_NONBLOCK` and, **where the platform provides it, `O_NOFOLLOW` — which is a real if narrow defense, not hygiene**: it atomically refuses a FINAL-COMPONENT symlink before the target is opened, and the `(dev, ino)` comparison cannot reproduce that, because a symlink pointing at the SAME relocated inode passes the identity check. Measured: with the flag the open fails `ELOOP`; without it the open succeeds, `fstat` reports a regular file, `(dev, ino)` matches and the bytes are read. The bounded property is stated exactly — final-component refusal on platforms that supply the flag — and is explicitly NOT whole-path containment. The descriptor is then `fstat`ed to confirm it is a regular file, its `(dev, ino)` is compared against the pair captured when the walk classified that path, and only then are the bytes read from that descriptor. **This is an ACCURACY mechanism, not a containment guarantee** (row below): its purpose is that the bytes recorded under `rel` are the bytes of the object this walk enumerated at `rel`, so the baseline describes what it says it describes. `O_NONBLOCK` is load-bearing independently — `O_NOFOLLOW` refuses a final symlink but not a FIFO, and a regular file replaced by a FIFO in the classify/open gap makes a blocking open wait forever: measured, it never returns and never reaches `fstat`, so the run HANGS instead of failing loudly |
| **CONTAINMENT IS THE CALLER'S, NOT THIS MODULE'S — owner-ruled 2026-08-21** | this module makes **no containment guarantee**. It does not establish, and its caller may not assume, that every byte it returns came from an object inside `rootDir`. Five consecutive review rounds failed to make that guarantee hold — the last of them measured an attacker moving the CLASSIFIED FILE ITSELF outside the root and symlinking its old path to it, which preserves `(dev, ino)` and defeats the identity check. **Corrected against the built module (2026-08-21), because this cell stated as universal something that is platform-bounded: that case is REFUSED wherever the platform supplies `O_NOFOLLOW`** — the open fails `ELOOP` before the target is reached, exactly as the row above already says and as a green acceptance test now pins. It survives only where the flag is absent, since the module's `O_NOFOLLOW \|\| 0` fallback then makes it a no-op; which platforms lack it is a code-level fact about that fallback, not something measured here. The class is not closed by that, and portable Node still cannot close it without per-component `openat`, which no `fs` API exposes and which a native module (barred by the zero-dependency rule) would be needed to reach. The deciding reason is not the difficulty: **this primitive has no consumer, so its exposure cannot be measured.** **The obligation handed to the caller is stated as a checkable invariant, because "establish containment" restates the goal instead of defining a duty.** For the duration of each call the caller must either (i) prevent an untrusted actor from replacing the ROOT ENTRY ITSELF, or any ancestor or directory entry used to reach an enumerated path — not merely entries BENEATH the tree — or (ii) supply a platform mechanism that demonstrably binds every returned object beneath the intended root. Why the narrower reading is wrong — restated against the built module (2026-08-21), because the measurement this cell carried is false of it. A root that is ALREADY a symlink when the call begins is **REFUSED**: the module normalises the path and `lstat`s it, and a trailing separator does not evade that (it would have — POSIX makes a trailing separator force directory resolution, so `lstat(p)` and `lstat(p + '/')` disagree about whether `p` is a symlink, and without normalisation the second spelling walked the target). **What is not refused is a replacement that happens DURING the call:** the root and every intermediate directory are classified by `lstat` and then enumerated BY PATH, and `readdirSync` follows a symlink-to-directory while `lstat` on the same path reports a symlink — measured. The window between an entry's classifying `lstat` and its enumerating `readdir` is therefore open, and the entry in that window is the root or an ancestor, never something beneath the tree. A caller who guarded only the subtree would believe the hand-off discharged and would be wrong. The mechanisms in the row above are retained as cheap accuracy hygiene and are explicitly NOT offered as a defense to rely on |
| Path construction | paths are built only from directory entries, never from file content, so the module itself introduces no `..` or absolute segment |
| Ordering | `records` are sorted by `rel`, byte-wise ascending, so two runs over the same state produce identical output and a report built from them is stable |
| Failure at capture | an unreadable root, **a directory that cannot be ENUMERATED at any depth**, or a file that cannot be read, throws `WienerdogError`. The directory case is called out because the cited walk idiom gets it wrong: `listNames` (`src/core/private-fs.js:382-390`) swallows a `readdirSync` failure and returns `[]`, so an implementer following it would silently omit every file beneath an unreadable nested directory — measured, `readdirSync` on a mode-`000` nested directory fails `EACCES` — and each of those pre-existing files is then reported `added` once the directory becomes readable. That is precisely the false attribution this module exists to prevent, arriving through its own precedent. There is no partial baseline: a baseline that silently omits a file would report that file as `added` later, which is a false accusation against whoever wrote it |
| Failure at delta time | a file present in the baseline and gone now is `deleted` — that is the normal case. Any other read failure throws |
| **No freshness claim** | `computeDelta` describes `rootDir` **at the moment it read it**, and nothing more. It does not lock, re-check, or promise that the answer still holds when the caller acts. Consumers that need liveness must obtain it themselves. This row exists because the superseded predecessor assumed the opposite and two adversarial rounds measured the consequence (`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`, banner) |

### Table B — the delta record

| Field | Value |
|-------|-------|
| `rel` | the relative path, as Table A defines it |
| `status` | `added` (absent from the baseline) \| `modified` (present in both, bytes differ) \| `deleted` (in the baseline, absent now). A path whose bytes are unchanged produces **no record** |
| `baselineBytes` | the captured bytes; `null` iff `status === 'added'` |
| `afterBytes` | the current bytes; `null` iff `status === 'deleted'` |
| `binary` | **a verdict about the PAIR, not about `afterBytes` alone.** Measured: git answers `-\t-` when EITHER side is binary — binary-before/text-after, text-before/binary-after, and a binary deletion against `/dev/null` all return it. Defining this field from the after content alone therefore could not equal the reference judgment for the mandatory `modified` and `deleted` categories, and Tables B and C would demand different things for the same corpus member. It must agree with the reference judgment (Table C) on the whole corpus; where agreement cannot be shown it must be **more** conservative, never less, and each such input is named in the PR. Erring toward `binary` fails closed, because a consumer withholds what it cannot scan |
| `addedLineNumbers` | 1-based line numbers **in `afterBytes`** that this delta adds. `[]` when `status === 'deleted'` or `binary` is true; every line when `status === 'added'` and not binary. Lines are LF-delimited and a trailing newline does not create a final empty line — a CR is ordinary content, exactly as git's diff treats it |
| Not a field | anything derivable. `isNew` is `status === 'added'` and the scan text is `afterBytes`' lines at `addedLineNumbers` joined with LF — both are the consumer's one-line derivations, and neither is stored. **The predecessor carried a derived `isNew` as if it were a fact, and that naming is what let an index question and a content question be confused for one** |

### Table C — the git-agreement obligation

The primitive replaces evidence that git produces today, so its equivalence to git is
the contract, not an implementation detail. The differential is a test-side use of git
against a repository the test builds; the module itself contains no git.

**THE REFERENCE JUDGMENT — this definition IS the standard, not a description of
one.** Git is used here as a **pure function over bytes the test hands it**, never as
a source of state. The reference judgment for a before/after pair is what git returns
when invoked:

- **outside any repository** — the invoking process's CWD must not be inside one.
  Measured: a CWD inside a repo applies that repo's `.gitattributes` even to operands
  that live OUTSIDE the repo, so `--no-index` alone does not isolate;
- in a **CONSTRUCTED environment, not a sanitized one** — see the row below. Git is
  spawned with an environment the test BUILDS (nothing inherited), in which every
  config and attribute root points at a directory this run created empty;
- as a **verified absolute executable**, never as the name `git` resolved through a
  PATH. A constructed environment must still carry a PATH, and that PATH is a channel:
  measured, `env -i` with empty `HOME`/`XDG_CONFIG_HOME` and `GIT_CONFIG_NOSYSTEM=1`
  still returned a forged `-\t-` when a directory holding an executable named `git`
  came first on PATH. The repo already solves exactly this for its product git calls
  (`src/core/dream/validate.js:68` spawns through `spawnPinnedSync`, a pinned absolute
  realpath), and the reference helper takes the same discipline;
- with **`--no-ext-diff`**;
- over two plain files, via `--no-index`.

**CONSTRUCT THE ENVIRONMENT; DO NOT SANITIZE IT.** A blocklist of channels to disable
is the wrong shape here, and the measurements say so twice over.

First, the ruled switches do not isolate. With `GIT_CONFIG_NOSYSTEM=1` and
`GIT_CONFIG_GLOBAL=/dev/null` set exactly as ruled, plain ASCII still flips from
`1\t1` to `-\t-` through **`XDG_CONFIG_HOME/git/attributes`** and, independently,
through **`GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_0=core.attributesFile`**. Adding
`GIT_ATTR_NOSYSTEM=1` alone closes neither; overriding `HOME` alone closes neither —
each fails on the channel it looks like it should cover. That is the **fourth**
hidden-influence channel this program has failed to enumerate, after the self-hiding
`.gitignore`, the fake `.git` marker and `diff.external`: **0 for 4.** A fifth list
would be a fifth guess.

Second, and this is the shape that works — it is the same logic that makes direction
(A) work at all, applied one level down. **A constructed thing's contents are known
by construction, so channels nobody enumerated are closed without being named.**
Measured, with BOTH hostile channels armed in the parent environment:

| Invocation | Result |
|---|---|
| inherited environment, ruled switches only | `-\t-` — contaminated |
| inherit, then subtract the full blocklist | `1\t1` — works, but only because the list happened to be complete |
| **environment BUILT from nothing (`env -i`), roots pointed at empty dirs, `GIT_CONFIG_*` never even mentioned** | **`1\t1`** — the injection variables cannot reach git at all |
| constructed environment, but one root pointed at a hostile directory | `-\t-` — the honest residual |

The third row is the load-bearing one: it never names the injection variables, and
they still cannot arrive, because the child's environment was **built rather than
filtered**. So the guarantee decomposes into **three** constructed things: the environment, the
config/attribute roots, and the executable — and the third is weaker than the other
two, which this row states rather than glossing. Absolute verified invocation prevents
PATH SELECTION of an impostor; it does **not** construct or freeze the executable's
BYTES. Measured against the cited precedent itself: `spawnPinnedSync` fails closed on a
forged `git` earlier in PATH, and ACCEPTS rewritten content at the same verified
absolute path, returning forged output. The precedent's own source says so. This
package's product module never executes git, so that is not a new product primitive —
it means the differential's oracle is protected from PATH-selected impostors and not
from all executable-identity influence, and the proof claims exactly that much. Each closes every channel arriving through
ITS OWN class, named or not — and that quantifier is the whole claim. **It is NOT a
claim that every channel is closed.** An earlier draft of this row said "named or not"
without naming the classes, and the executable channel walked straight through the
gap: it is neither an environment variable nor a file under a controlled root, so no
amount of constructing those two could reach it. Constructing closes exactly the
classes you construct. The fourth row of the table names what none of the three
covers: **the guarantee is not the flag, it is where the flag points.**

The switch list stays in this spec as the RECIPE. The constructed environment and the
constructed roots are the GUARANTEE. **The hostile-environment control in the corpus
is the PROOF** — required RED without the construction and GREEN with it; without it,
all of this is still just a claim.

Under exactly those conditions git yields the bounded-prefix byte heuristic and
nothing else — measured identical to the in-repo staged form (`NUL@100` → `-\t-`,
`NUL@9000` → `1\t0`), and a `.gitattributes` file merely PRESENT in a
non-repository directory is ignored.

| Obligation | Reference |
|------------|-----------|
| `binary` | equals the reference judgment's `--numstat` signal — the `-\t-\t` form the validator tests at `src/core/dream/validate.js:1245-1246` |
| `addedLineNumbers`, **when `binary === false`** | equals what today's `addedLineNumbersFromDiff` (`src/core/dream/validate.js:752-764`) derives from the reference judgment's `-U0` hunk headers for the same pair |
| Derived scan text, **when `binary === false`** | byte-identical to today's `+`-line join (`src/core/dream/validate.js:1258-1262`) |
| Records classified `binary` | exempt from the two rows above by construction (Table B fixes `addedLineNumbers` to `[]`), because a consumer withholds what it cannot scan. This is what makes the conservative exception coherent instead of self-contradicting |
| Corpus | at minimum: added, modified, deleted, empty file, empty→content, binary, CRLF content, content with no trailing newline, a file whose only change is appended lines, one whose change is interior, a directory containing a `.gitattributes` that WOULD flip the judgment if a repository were in scope, and the two boundary cases below |
| **Byte-preserving reference output** | the reference judgment's output is compared as BYTES. Measured: a regular file containing invalid UTF-8 and no NUL is TEXT to git (`1\t0`), its raw diff retains the `0xff`, and a `utf8` decode turns it into U+FFFD — so a helper that decodes git's output as text can claim byte identity while having silently replaced bytes. The production helper already decodes as `utf8` (`src/core/dream/validate.js:68-73`), which makes that the plausible implementation shape rather than a hypothetical one. The corpus therefore includes **one non-NUL invalid-UTF-8 text member**, and the comparison never round-trips through a string |
| **Boundary fixtures (F5)** | one NUL just inside git's prefix window and one just outside it. Measured on git 2.50.1: `NUL@7999` → `-\t-`, `NUL@8000` → `1\t0`, so the window is exactly 8000 bytes **today**. Do NOT hardcode 8000 as the contract: the fixtures are located by a bounded search against the REFERENCE JUDGMENT itself, so the test follows git if git moves the boundary. A single far-beyond fixture is insufficient — it passes an implementation using any shorter cutoff |
| **Hostile-environment control** | a mandatory case that arms every measured channel — a `git/attributes` file under a hostile `XDG_CONFIG_HOME`, `GIT_CONFIG_COUNT`/`core.attributesFile`, **and a directory holding a forged executable named `git` placed first on PATH** — and asserts the reference judgment is unchanged. Each arm must be shown RED without its construction and GREEN with it, or it proves nothing. The PATH arm is not optional: it is the channel that survived the first two constructions |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the `delta.js` row cites Tables A and B; the test row cites Table C)
- [ ] `### Exact contracts`' two signatures and the `anomalies` return
- [ ] Acceptance criteria that assert Tables A, B and C — including the scope
      round-trip and the classify/read-gap discriminator
- [ ] Verification steps (the no-child-process assertion mirrors Table A's git-free scope row and the Deliverables note)
- [ ] Current-state description (the two neighbouring patterns and why the hash-only shape is insufficient)
- [ ] Implementation notes: the binary-prefix trap, the guard-asymmetry measurement,
      the neutral-CWD requirement, and the ordering rationale
- [ ] **The containment DISCLAIMER — every mirror of Table A's containment row**,
      registered here because five consecutive rounds landed on this contract and a
      sixth landed on its unregistered mirrors: the `Symlinks and other non-regular
      entries` row, the accuracy-mechanism row, the Security checklist's first item,
      the acceptance criterion above, and the successor handoff in Out of scope. **No
      surface may claim containment, promise that out-of-root bytes are excluded, or
      imply `O_NOFOLLOW` is available everywhere.** Each states that establishing
      containment is the caller's
- [ ] Out of scope: everything the successor owns

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step (CLAUDE.md).
  ADR-0004: the module starts nothing and holds nothing beyond its call.
- **This module must not import or spawn git, and must not spawn anything.** That is
  what makes it additive and independently verifiable, and it is asserted mechanically
  below. The division is deliberate and owner-ruled: **the product code is a ~10-line
  byte check** (a NUL within git's bounded prefix window), while **the TEST proves its
  equivalence by calling git as a pure function** under Table C's isolation. Spawning
  git from the product code would re-open the very class direction (A) exists to
  escape — git configuration as a hidden influence channel — and this program's record
  at enumerating that class is 0 for 3 (the self-hiding `.gitignore`, the fake `.git`
  marker, `diff.external`): three times it believed the list was complete. A ten-line
  byte check has no channel. The residual risk — git changing its heuristic — is
  caught RED by the equivalence test, which is bounded and loud.
- **The binary-prefix trap, measured on git 2.50.1 at the pin.** Git's binary test
  inspects a bounded prefix, not the whole file: a file with a NUL at byte 100 stages
  as `-\t-\t` (binary), and the same file with the NUL at byte 9000 stages as `1\t0`
  (text). A naive "any NUL anywhere" predicate therefore disagrees with git on the
  second file. That direction is fail-closed and permitted by Table B, but measure it
  rather than discover it in review.
- **The no-follow rule is a per-read property, not a per-walk one.** The obvious
  shape — `lstatSync(path)` to classify, `readFileSync(path)` to read — passes every
  test that places symlinks before the walk starts and still follows one substituted
  in between. Bind both to the same descriptor; `src/core/private-fs.js:687-751` (`applyModeSecure`) is
  the in-repo precedent.
- **Which isolation switch guards which shape — measured, because the answer is not
  uniform.** `diff.external` from a hostile GLOBAL config DOES fire on the textual
  `git diff --no-index` shape, in a clean directory, with no repository anywhere
  (reproduced; `--no-ext-diff` silences it). It does NOT fire on `--numstat` at all,
  with or without guards — that path never invokes the external driver. So the
  external-diff guard is load-bearing for the **`-U0` added-lines** invocation, not
  for the binary one. Apply the full guard set to BOTH invocations regardless:
  uniform is cheaper than remembering which shape needs what, and the shape that
  needs it is the one that is easy to forget.
- **Do not rely on this repository having no `.gitattributes` today.** It does not
  (`git check-attr diff -- README.md` → unspecified), but leaning on that would be a
  borrowed defense of exactly the kind this project rejects. The neutral-CWD
  requirement is the guarantee; the repo's current cleanliness is not.
- Cost of the reference judgment, measured: ~6.4 ms per invocation (200 runs in
  1.28 s). Test-side only, and irrelevant at that scale.
- Sorted output is not cosmetic: it is what lets a consumer's report and a test's
  expectation be compared byte-for-byte without re-sorting at every call site.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item applies: the walk enumerates
      **attacker-influenceable paths** and those relative paths flow into filesystem
      reads. **This module does NOT establish containment, and that is owner-ruled
      (Table A).** It states the fact rather than a guarantee: whoever calls it must
      discharge Table A's caller invariant, per platform and where the threat is
      measurable. Note what that invariant does NOT say: guarding only the subtree is
      insufficient, because the root entry itself and every ancestor used to reach an
      enumerated path are part of the resolution chain. The accuracy
      mechanisms it does apply — `O_NOFOLLOW` where available, `O_NONBLOCK`, the
      regular-file `fstat`, the `(dev, ino)` comparison — exist so the bytes recorded
      under `rel` are the bytes of the object enumerated at `rel`, and are explicitly
      not offered as a defense to rely on. No path reaches a shell: this module spawns
      nothing, asserted in the verification steps.
- [ ] The failure mode that matters is a **silently incomplete baseline**: a file
      omitted at capture is later reported as `added`, which attributes a user's
      existing content to the brain. Table A therefore forbids a partial baseline
      outright — capture throws rather than skipping.
- [ ] Named residual: holding a directory's bytes in memory is proportional to that
      directory's size. This package sets no bound because it has no caller; the
      successor owns the scope decision and inherits the cost with it.

## Acceptance criteria

- [ ] A round trip over an unchanged directory produces **zero records**, and every
      capture of the same unchanged state produces an identical baseline.
- [ ] `status`, `baselineBytes` and `afterBytes` follow Table B for added, modified and
      deleted paths, including a file that becomes empty and one that starts empty.
- [ ] `records` are sorted by `rel` byte-wise ascending, demonstrated on a set whose
      insertion order differs from its sorted order.
- [ ] A symlink to a file, a symlink to a directory, and a symlink pointing outside
      `rootDir` are each reported in `anomalies` with their path, are absent from
      `records` and from any baseline, and their targets' bytes appear nowhere in the
      output.
- [ ] Capture throws `WienerdogError` on an unreadable root, on an unreadable file,
      **and on a nested directory that cannot be enumerated**; no partial baseline is
      ever returned, and no file beneath an unenumerable directory is ever silently
      omitted.
- [ ] Scope survives the round trip: with an `include` that excludes some paths, a
      **pre-existing excluded** file produces no record, a **newly created excluded**
      file produces no record, and a **newly created included** file is reported
      `added`. No excluded pre-existing file is ever reported `added`.
- [ ] The accuracy mechanisms behave as Table A states, and **no criterion asserts
      containment**: a regular file replaced by a FIFO between classification and open
      completes in bounded time rather than hanging; a path whose `(dev, ino)` no longer
      matches the pair captured at enumeration yields a throw or an anomaly rather than
      bytes; and a symlink present at enumeration is reported in `anomalies` and
      captured nowhere. **And on a platform that supplies `O_NOFOLLOW`, substituting a
      SAME-INODE final-component symlink must fail at open rather than yield a
      descriptor** — the product behaviour guarded is the bounded final-component
      refusal named in Table A, which no other retained check can detect, so without
      this an implementation could silently drop the flag and still pass. A test that
      claims this module keeps out-of-root bytes out is asserting something the contract
      deliberately does not promise.
- [ ] A stateful `include` — one function object answering differently on the two
      walks — produces the behaviour Table A's caller invariant names, and that
      behaviour is pinned by a test rather than assumed.
- [ ] The **hostile-environment control** is present and both-directions proven for
      **each** armed channel — hostile `XDG_CONFIG_HOME` attributes, `GIT_CONFIG_COUNT`
      injection, **and a forged `git` first on PATH**: with its construction the
      reference judgment is unchanged, without it the channel moves the judgment. A
      control that is green either way proves nothing, and one that omits the PATH arm
      omits the channel that survived the other two constructions.
- [ ] A regular file replaced by a **FIFO** between classification and open completes
      in bounded time with a throw or an anomaly, and never hangs. A test whose
      timeout is the only thing that ends the run does not satisfy this.
- [ ] Mutating the returned baseline between capture and delta produces the behaviour
      Table A's caller invariant names, pinned by a test rather than assumed.
- [ ] The boundary fixtures locate git's prefix window by search against the reference
      judgment and the module agrees on both sides of it — an implementation using a
      shorter cutoff fails.
- [ ] **The git-agreement differential (Table C).** Over the whole corpus, this
      module's `binary` equals the **reference judgment**'s pairwise `--numstat` signal
      — pairwise, so a binary BEFORE side counts even when the after side is text
      (Table C
      — no repository in scope, no system or global config, `--no-ext-diff`) or is
      conservatively `true` with each divergent input named in the PR; and for every
      member where `binary === false`, its `addedLineNumbers` equal
      `addedLineNumbersFromDiff`'s output on that judgment's `-U0` hunk headers and the
      derived scan text is byte-identical to the `+`-line join.
      **The corpus is built and judged by the test; the module is never given git.**
      The test's own git invocations run from a CWD outside any repository — a CWD
      inside one applies that repo's attributes even to operands outside it, so a test
      that runs from this checkout would be measuring the wrong thing.
- [ ] `src/core/dream/delta.js` neither requires `node:child_process` nor spawns any
      process.
- [ ] Idempotence: `N/A — this WP ships no command and writes nothing outside the
      repo; both functions are pure reads.`
- [ ] `npm test` and `npm run lint` pass, and the existing suite is untouched: no
      existing test file is edited by this package.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream-delta"
npm test
npm run lint
# The module is git-free and spawns nothing (Table A's scope row).
# `test -f` FIRST: grep on a missing file exits 2, which `!` would turn into a
# false green — measured during round zero, on this very gate.
test -f src/core/dream/delta.js && ! grep -qE "child_process|spawnSync|execFile" src/core/dream/delta.js
# This package edits nothing that already existed
test "$(git diff --name-only --diff-filter=M main -- src tests | wc -l)" -eq 0
```

- The last two are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing a number a reader must judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state (a
  `require('node:child_process')` added to the module; one character changed in an
  existing file under `src/`), so a check that cannot fail is caught before anyone
  believes it. The first assertion additionally goes red when the deliverable is
  ABSENT — verify that too: its unguarded form (`! grep …` with no `test -f`) went
  green on a missing file, measured during this spec's round zero.

## Out of scope (do NOT do these)

- **Every consumer.** No gate, no pipeline step and no existing file is wired to this
  module here. Nothing calls it when this package merges, by ruling.
- **The successor's whole subject** — moving the brain's write target into the
  workspace, swapping the four gates' decision inputs there, the promotion policy, and
  the `change.untracked` fact map. The superseded predecessor's Tables C, D and E are
  that package's inheritance, to be recomputed there, not carried here.
- **Containment itself — owner-ruled 2026-08-21 to leave this package entirely.** The
  successor specifies it where the threat is measurable, PER PLATFORM, because that is
  where a consumer exists and an exposure can be measured at all. Two observations
  travel with it, explicitly UNVERIFIED, so the successor neither rediscovers them nor
  leans on them: (1) the successor's writer is a headless brain whose tools are
  `Read`/`Write`/`Edit`/`Glob`/`Grep` with no `Bash`, so it may be unable to rename a
  directory or create a symlink at all — **weak**, because tool capability is a
  fast-moving harness detail rather than a contract, and this repository already carries
  a stale version pin for exactly that reason; (2) under direction (A) the capture runs
  BEFORE the brain is spawned, so during capture the brain is not an actor —
  **stronger**, because that is an ordering property of the design rather than a
  borrowed defense from a consumer that does not yet exist. **The successor MEASURES
  both and states the real exposure per platform**; neither is credit any package may
  draw on unmeasured.
- **Repository attribute sensitivity, named as the successor's obligation.** Git's
  judgment changes when a repository is in scope: `.gitattributes` overrides the byte
  heuristic in both directions (reproduced — `*.forced-binary` makes plain ASCII
  binary, `*.forced-text` makes an early-NUL file text). This package escapes that by
  construction, since its reference judgment is taken with no repository in scope. The
  SUCCESSOR must show that repository attributes cannot alter the relevant paths in
  its workspace, or handle it there. Not this package's to solve, and stated so it
  cannot arrive later as an acceptance criterion.
- **Any freshness, locking or generation mechanism.** Table A's no-freshness-claim row
  is deliberate; adding a check here would rebuild the failure the predecessor was
  superseded for.
- Ignore rules, git-tracked-ness, dot-prefix rules and every other policy about which
  files deserve attention — Table A's scope row leaves all of it to the caller.
- The EP2 enforcement half, the git-execution seam, the layout dot rule, and any gate's
  policy values.

## Definition of done

1. All verification steps pass locally, both green and the deliberately-broken red;
   output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): add the baseline-capture and delta primitive (WP-dream-baseline-delta-primitive)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
