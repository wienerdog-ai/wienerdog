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

1. **RED evidence may be machine-run from a committed declaration.** A *RED
   proof* is a declared exact-substring mutation plus the set of named
   assertions it must redden, committed beside the suite it proves. Running it
   applies the mutation, proves it landed, requires the declared assertions —
   and only those — to fail for their own stated reason, restores, and requires
   green again. A criterion whose proofs all pass is `PROVEN`; anything else
   exits non-zero.

2. **Proofs run in their own lane, never in `npm test`.** `npm test` stays a
   fast, side-effect-free regression signal; a proof run re-executes a whole
   suite once per declared mutation (the first adopted suite is ~15 s per run,
   measured at `49d3d467`). Once this ADR is signed the lane also gets its own CI
   job, so a proof that stops proving fails the PR.

3. **A proof run never modifies the working tree.** Mutations are applied inside
   a disposable copy of the repository, which the run deletes. This removes the
   whole class of crash residue, dirty-tree false reds, and "the tool edited my
   checkout" — and it is why no clean-tree precondition or restore-by-`git
   checkout` is needed.

4. **The runner borrows no production seam.** It imports nothing from `src/` and
   depends on nothing outside Node's standard library, so a red it reports can
   only be the cell's. It runs and exits — no daemon, no server, no telemetry
   (ADR-0004).

5. **A green proves the declared mutation reddens the named assertion, and
   nothing more.** It does not establish that the declared set is complete, that
   a criterion has any proof at all, or that a test is non-vacuous in ways nobody
   declared. Completeness stays a review judgment, and the runner's report says
   so in its own output rather than leaving a reader to infer it.

## Consequences

- A new committed artifact class (`tests/red-proofs/*.proofs.js`) that must be
  maintained with the code it mutates: a `find` string that stops matching is a
  loud error, by design.
- Review rounds can stop re-deriving mutation evidence by hand for criteria that
  carry a declaration; what they must still judge is whether the declared set is
  the right one.
- A spec may cite a proof id as its RED evidence only once decision 1 is signed;
  until then a spec still pastes the pair by hand.
- Runtime is paid per declared proof, in a lane developers opt into.

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
  rounds in `WP-show-slot-own-value-kind`. Give the artifact a file of its own.
- **Applying mutations with `sed`/shell string surgery.** The measured cause of
  three false greens. Node-side exact-substring replacement with an
  occurrence-count check and a post-write marker grep has no escaping layer.
