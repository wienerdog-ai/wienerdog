---
date: 2026-08-19
title: "WP-validator-decided-bytes round 3 — architect's ruling: C2 does not ship"
related_wps: [WP-validator-decided-bytes]
---

# Round 3 — architect's ruling

**Why this record exists.** The criterion pinned before round 1 said: *if
rounds 1, 2 and 3 each land a HEAVY finding, the next step is the design
question, not a fourth patch.* All three did. The question went to the
architect rather than being answered by the relay — the separation the owner
enforced after round 1.

**Ruled at:** `c575605`, tree clean before and after. No file edited.
**Owner ruling, 2026-08-19:** accepted in full. Plus: the `id` stays, the title
is corrected to the actual scope, and one line records that the `id` is
historical.

## Q1 — C2 does not ship; the package is pure C1

**The measurement that decides it, and it is not the one the relay brought.**
The relay's case was "C2 drew findings in two rounds, and what it buys was
measured fail-closed." True but weak. The architect measured the windows
instead:

| Window | Subprocess call sites inside it |
|---|---|
| `:190` → `:1170` — **the one C2 closes** | **0.** The only I/O is the `:1170` read itself |
| `:321` → `:190` — left open | a `git show HEAD:<rel>` subprocess |
| `:190` → Step 5's `git add -A` — left open | 6 git subprocess call sites, plus quarantine writes and in-place scrubs |

C2 closes the only window in the pipeline with **no scheduling point in it**,
and leaves open both that span subprocess execution. For the registry to record
bytes the decision never saw, a writer would have to land inside a few lines of
straight-line synchronous JavaScript containing no I/O. The *reachable* version
of that same defect — the id divergence — comes from the redact arm, which C2
does not touch and which is already chartered. This converts "arguably not
worth it" into "measurably not worth it", which is the standard the runbook
asks for. Verified independently by the relay: the accepting path `:1161`→
`:1170` contains no `git` and no `spawn`.

Three further grounds:

- **C2 removes a guard nobody inventoried.** The `:1170` read's ENOENT throw is
  the only fail-stop against a path that vanishes after acceptance. Neither the
  reviewer's round-1/2 passes, nor the relay's inventory, nor the architect's
  had it. A contract whose cost was invisible to three consecutive reviews is
  not understood well enough to ship in a package being closed.
- **Completing it honestly is (A).** The reviewer's own recommendation — register
  only when the accepted rel is present in the completed commit — is
  bind-the-output, rejected in round 1 as doctrinally self-contradictory inside
  a byte-reuse package. Round 3 rediscovered that independently from the other
  end. When the honest completion of a contract is a mechanism already ruled
  out, the contract is in the wrong package.
- **Rounds 2 and 3 both landed on it** — ADR-0031's circuit-breaker condition.
  Extraction is for a contract worth keeping; a contract with measured
  near-zero value that keeps generating findings gets the runbook's other
  disposition: *"not worth solving" is a legitimate disposition.*

C1 drew zero findings and the reviewer calls it coherent. **The brief stays
satisfied:** C1 *is* the charter's part-A defect, and the ordering was
chartered out with the owner's approval in round 2 — C2 was its last splinter.

**Cost, stated plainly:** the registry keeps a re-read that can in principle
disagree with the decision, and `{id:'', created:<run date>}` ships as-is. Both
become named residuals pointing at the charter.

## Q2 — delete the universal; exhaustiveness by syntax class is impossible

Not merely unproven — impossible in principle, and provable in one line:

> Redaction is a predicate on the literal's **characters** — an unbroken run of
> ≥ 24 over `[A-Za-z0-9+=/]` at ≥ 3.5 bits/char. `Number()` acceptance is a
> predicate on the literal's **syntax**. The two are independent, so no
> syntactic class is uniformly redacted or uniformly clean.

The decisive pair, measured by the architect and re-run by the relay:

```text
10293847561029384756E+12   len 24   3.522 bits/char   REDACTED
102938475610293847561E12   len 24   3.387 bits/char   clean
```

Same syntax class, opposite outcome — the `+` is what lifts the entropy over
the floor. A successor told "hex and scientific notation" would test two
classes and still miss, because membership is per-literal.

**This paragraph produced two false universals in two rounds** — first "decimal
only, cannot" (architect, broken by the relay with hex), then "hex only"
(architect, broken by the reviewer with `E+`). The remedy is not a third
boundary but deletion: measured positive classes as evidence, the decimal
negative correctly scoped to ordinary decimal runs, the principle above, and an
explicit statement that the intersection was **not enumerated**. Surface
shrinkage, which the freeze allows — and the third false universal becomes
unwritable rather than merely unwritten.

## Q3 — moot, disposed by deletion

AC4 is C2's criterion and goes with it. The disposal is genuine rather than
moved: the `:1170` read stays, so no behaviour shifts and no new claim appears.

## Convergence

| | Contract | Verification steps |
|---|---|---|
| Round 1 | C1 + C2 + C3 | 4 |
| Round 2 (split) | C1 + C2 | 3 |
| Round 3 (this ruling) | **C1** | **2** |

The surface froze and then shrank, three rounds running. That is what the
runbook's convergence clause describes.

## Round 4's criterion — pinned before the round

Round 4 is the last under the hard cap. **It reviews C1's coherence and the
charter's accuracy only.** A HEAVY finding on C1 goes to the owner as a ruling,
not to a round 5. A finding on the charter is LIGHT by construction — the
charter is evidence for a future package, not a contract this implementer
builds — and is fixed inside the existing surface or accepted as a named
residual.
