# ADR-0042: RED evidence for an acceptance criterion is machine-run from a committed declaration, in its own lane, against a disposable copy

Status: Proposed — awaiting owner signature
Date: 2026-09-02

> **Proposed by the architect, unsigned.** Nothing in this ADR is in force until
> the owner signs it. `WP-criterion-red-harness` ships the runner as an opt-in
> `npm run` tool and does **not** depend on this signature; what the signature
> unlocks is the doctrine — a spec being allowed to *require* that a criterion's
> RED evidence be machine-run, and a CI job that fails a PR when a declared proof
> stops proving. Extends ADR-0005 (spec-driven development); constrained by
> ADR-0004 (Wienerdog is just files).

## Context

The repo's evidence rule is already both-directions: a new verification step is
trusted only after a real green on the compliant state **and** a real red on a
deliberately broken one (`docs/runbooks/spec-authoring.md`). That rule is sound
and it has been kept by hand. Keeping it by hand is what failed.

Across the promote-in family's review rounds, **more than ten vacuous
(false-green) assertions** were found — tests that pass whether or not the thing
they claim to check is true. Every one was found by mutation or by value-dumping;
**none** by an existence or a criterion→test-name mapping check, which is
structurally blind to the class (a vacuous test exists and passes, which is
exactly what a mapping certifies). Six distinct shapes were measured, each at
least once, and they are recorded in `WP-criterion-red-harness`'s Table C. Three
of them are failures of the *evidence-gathering* rather than of the test:

- **mutations that were never applied.** Shell escaping mangled the injected
  code three times and the unapplied runs were read as greens
  (`memory/lessons/inbox.md`, `WP-dream-promote-in-workspace`).
- **instrumentation that borrowed the production seam.** A probe that
  located the git index *through* the seam it was measuring reddened three
  exploit cells for its own reason rather than the cell's. A red whose reason is
  not the cell's is not a measurement.
- **infrastructure that died silently.** A decoupled guard sat at 3 pass / 0 fail
  while enforcing nothing; a `--test-name-pattern` that matches nothing exits 0
  with a pass count.

By hand, each of these is a judgment call made under fatigue at the end of a
round. Mechanically, each is a precondition a runner can check before it believes
a result.

## Decision

1. **RED evidence may be machine-run from a committed declaration, and the
   declaration is INERT DATA.** A *RED proof* is a declared exact-substring
   mutation plus the named assertions it must redden, committed beside the suite
   it proves **as JSON that is parsed and validated, never executed**. Running it
   follows ONE phase order — **BASELINE in a pristine copy, APPLY into a fresh
   copy, RED in that copy, CONTROL in a further fresh pristine copy after RED** —
   proving the mutation landed and requiring the declared assertions, and only
   those, to fail **as assertion failures of their own test bodies**, with the
   post-RED control green. **Nothing is restored, because nothing is mutated in
   place.** A criterion is `PROVEN` only when **every** declaration for it was
   selected, ran and passed; a filtered run reports the criterion as filtered,
   never proven. Anything else exits non-zero.

   The format is data rather than code because declarations are read *before*
   the disposable copy exists: an executable declaration could exit the process
   successfully before any proof is counted, or write to the checkout before
   confinement. That is a property of the phase order, not of any author's
   discipline, and JSON removes it.

2. **Proofs run in their own lane, never in `npm test`.** `npm test` stays a
   fast, side-effect-free regression signal; a proof run re-executes a whole
   suite once per declared mutation (the first adopted suite is ~15 s per run,
   measured at `49d3d467`). Once this ADR is signed the lane also gets its own CI
   job, so a proof that stops proving fails the PR.

3. **The runner never writes into a tree in which suite code has already run.**
   Each phase needing a tree gets its own fresh copy of the repository, and the
   run deletes them: the baseline runs in a pristine copy the runner never writes
   to; the mutation is written into a **fresh** copy before any child has started
   in it, and the red is then observed there; nothing is restored, because
   nothing was mutated in place. A declared mutation path that canonicalises
   outside its fresh copy is refused, and that check cannot be raced because no
   code has executed in that tree.

   **This is the second attempt at containment, and the change is a design move
   rather than another patch.** The first version copied once, validated the
   mutation path, then executed the suite before writing — so the suite could
   replace the target, or a parent of it, with a symlink into the real checkout,
   and the later write followed it out and back, leaving every check green.
   Hardening that (revalidate before each write, no-follow descriptors, reject
   changed inodes) is possible but keeps the design in the business of
   enumerating race windows. **Deleting the step that has to be right is the
   fixed point.**

   **Fresh directories are not on their own isolation, and that was the third
   round's finding.** Phases must share no writable path at all: each child's
   temp directory lives inside its own copy and dies with it, a copy carries no
   installed-dependency tree and no symlink of any kind, and every copy derives
   from one verified snapshot taken before any suite code runs. Otherwise the
   copies stay distinct while the state the suites observe does not — one temp
   root handed to every phase, one real dependency tree writable by all of them,
   and symlinks that a recursive copy faithfully recreates as symlinks. **A single "nothing outside the sandbox is written" claim
   would be unsatisfiable, and stating it would only guarantee that every
   implementation silently enforced something narrower.**

4. **The runner borrows no production seam** — it imports nothing from `src/`
   and depends on nothing outside Node's standard library. **This removes the
   measured production-seam contamination class; it does not by itself make a
   red the cell's.** Attribution rests on the whole chain: a baseline in which
   each named identity ran and passed exactly once, an apply step that proves the
   exact expected bytes were written, a red that is an assertion failure of the
   named test rather than a parse, load or hook failure, **a fresh pristine
   control run after RED that is green** — and, beyond any of it, a reviewed
   judgment that the mutation is relevant to what the assertion observes
   (decision 5). Evidence resting on the baseline's earlier green alone is
   uncontrolled and does not prove a criterion: it cannot separate the mutation
   from drift between the two runs. The runner
   runs and exits — no daemon, no server, no telemetry (ADR-0004).

5. **A green proves the selected declared mutations redden the named assertions,
   and nothing more.** It does not establish that the declared set is complete,
   that a criterion has any proof at all, that a test is non-vacuous in ways
   nobody declared, or that a declared mutation is **semantically relevant** —
   that it changes the condition the assertion observes rather than something
   merely upstream of the same failure. Mechanical rules reject the direct form
   of an irrelevant mutation (a proof may not edit the assertion, its host suite,
   the runner or a declaration); the general property is not machine-decidable.
   Completeness and relevance stay review judgments, and the runner's report says
   so in its own output rather than leaving a reader to infer it.

## Consequences

- A new committed artifact class (`tests/red-proofs/*.proofs.json`) that must be
  maintained with the code it mutates: a `find` string that stops matching is a
  loud error, by design. Being JSON, it carries no comments — the `why` field
  exists so a proof can still say what it is for.
- Review rounds can stop re-deriving mutation evidence by hand for criteria that
  carry a declaration; what they must still judge is whether the declared set is
  the right one.
- A spec may cite a proof id as its RED evidence only once decision 1 is signed;
  until then a spec still pastes the pair by hand.
- Runtime and disk are paid per declared proof — one fresh repository copy per
  proof on top of a shared pristine one — in a lane developers opt into.
- The lane requires a newer Node than the package as a whole (the TAP reporter
  flag), so it **refuses below its own floor** instead of failing obscurely.
  Raising the package's floor stays a separate product decision for the owner.

## Alternatives rejected

- **A criterion→test-name mapping tool.** Structurally blind to the entire class
  this exists for: a vacuous test exists and passes. Considered first, and the
  owner ruled the mutation proof, not the mapping, the load-bearing piece.
- **Running proofs inside `npm test`.** Multiplies the suite's runtime by the
  number of declarations and puts a mutating tool on the path every developer and
  every CI matrix leg runs on every edit.
- **Mutating the working tree under a clean-tree precondition.** Simpler to
  write, but it makes every crash a residue and every dirty checkout a refusal,
  and it asks the owner to accept a tool that rewrites tracked files. The
  disposable copy costs one directory copy and removes the question.
- **Declaring mutations in the spec's own markdown and parsing them out.** A
  checker that must locate its subject inside a large prose file enumerates the
  ways the host format can hide it, and that never closes — measured over four
  rounds in `WP-show-slot-own-value-kind`. Give the artifact a file of its own;
  decision 1 does exactly that, and settles the file's format separately.
- **An executable (CommonJS) declaration file**, which was the first draft.
  Convenient — comments, computed values, shared constants — but declarations
  are loaded before the disposable copy exists, so the file's own top-level code
  runs unconfined: `process.exit(0)` reports success over zero proofs and
  defeats every vacuity guard at once, and a top-level write reaches the real
  checkout. A "no dependencies, no side effects" convention cannot enforce
  either. A restricted child loader could police premature exit and output but
  **still could not enforce the filesystem boundary**, so the closable answer is
  a format with no execution semantics.
- **Hardening the single-copy design instead of replacing it** — revalidating
  canonical containment immediately before every write, refusing symlink
  components and changed inode/type, and using no-follow descriptors. It can be
  made correct, and it was the obvious repair when the race was found. Rejected
  because it keeps a check whose correctness depends on enumerating the windows
  in which suite code can act, and this project has twice paid for designs that
  enumerate an adversary's options rather than removing them. The fresh-copy rule
  has no window to enumerate.
- **Applying mutations with `sed`/shell string surgery.** The measured cause of
  three false greens. Node-side exact-substring replacement with an
  occurrence-count check and a post-write marker grep has no escaping layer.
