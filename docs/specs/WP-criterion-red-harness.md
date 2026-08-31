---
id: WP-criterion-red-harness
title: Build the criterion RED harness — machine-run mutation proofs for acceptance criteria
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004]
epic: test-quality
---

# WP-criterion-red-harness: Build the criterion RED harness — machine-run mutation proofs for acceptance criteria

> **Draft stub from the 2026-08-31 handover.** This is the
> highest-leverage protective item in the queue. Mature to Ready before
> implementing.

## Context (read this, nothing else)

Across the promote-in family's review rounds, **more than ten vacuous
(false-green) assertions** were found — tests that pass whether or not the
thing they claim to check is true. Every one was found by MUTATION (break the
code deliberately, watch whether the test goes red) or by value-dumping;
**none** by existence checks. A criterion→test-name mapping tool was
considered first and is structurally blind to this class: a vacuous test
exists and passes, which is exactly what a mapping check certifies. The
owner ruled the harness, not the mapping, the load-bearing piece.

The measured failure shapes the harness must catch (each occurred at least
once):

- a guard that cannot fail because the test itself established the condition
  it certifies;
- a non-vacuity guard whose pattern matches an unrelated fixture line;
- a probe whose infrastructure dies silently (wrong git version, mangled
  shell escaping) leaving every cell green — **the guard did not notice its
  own death**;
- a mutation "matrix" whose mutations were never applied (shell escaping
  mangled the injection) — three false greens;
- a canary differing from the exploit by ARITY, dying before the slot under
  test;
- endpoint comparisons blind to transient (write-then-restore) effects.

## What done means

1. A repo-native way (script under `scripts/`, zero runtime deps, ADR-0004:
   just files — it runs and exits) to declare, per acceptance criterion, a
   mutation and the assertion expected to go red — and to RUN that proof:
   apply mutation (verify application by grepping the injected marker),
   expect red, restore, expect green.
2. The harness itself carries a vacuity guard: a run that read/mutated
   nothing is a failure, never a pass.
3. Adopted on at least one existing suite as the worked example (the
   dream-pipeline guard tests are the natural candidate — they carry the
   family's mutation matrix already).
4. Documented in the spec template/runbook so future WPs can require "RED
   proofs are harness-run, not hand-run".

## Watch out

- Do not let the harness borrow production seams for its probes — measured
  lesson: instrumentation through the production seam is itself an
  unrecognized call under default-deny guards. Route harness plumbing around
  the surface under test.
- Runtime discipline: `npm test` must stay fast; harness runs may be a
  separate script/CI lane rather than part of every test run — that is a
  design decision to record, not to default silently.
