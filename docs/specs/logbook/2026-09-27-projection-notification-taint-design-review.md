---
date: 2026-09-27
related_wps: [WP-dream-projection-notification-taint, WP-dream-primary-dialogue-projection, WP-dream-projection-harness-user-records, WP-dream-projection-done-spec-errata]
---

# WP-dream-projection-notification-taint — design round record

The design round for the package the owner commissioned on 2026-09-27
(`2026-09-27-owner-ruling-harness-records-option-iii.md`: "option 3, and
commission the flag-not-decline design"). Written by wd-architect on branch
`docs/wp-projection-notification-taint`, based on `main` at `67359a5e`. This
section — the STOP CRITERION — is committed **before the spec exists**. Each
external round's raw file is committed before it is adjudicated; the rounds
table is filled in by the orchestrator.

## 0. STOP CRITERION — pinned before the spec and before round 1

Pinned per `docs/runbooks/codex-review.md` ("Finding disposition", the STOP
CRITERION bullet), in the shape of
`2026-09-26-projection-harness-user-records-design-review.md` §0, and written
after reading that round's §7.

**What that round teaches, and why this criterion is shaped the way it is.**
The harness-records round ended by circuit-breaker because its rule
*declined* records on an undocumented field: a renamed field would silently
consume every request, so the rule needed a safety net, and each net opened
the next hole (a run-level halt defeated by one recognised session; a
per-session quarantine blind to array-content requests). The design
commissioned here has **no net, because it needs none**: it only ever
*raises* a flag on records the harness positively labels, so an absent or
renamed field degrades it to exactly today's projection. That property is
the design's premise. This criterion therefore treats any finding that asks
for a net as a refutation of the premise, not as a patch to apply.

**Bands.** **A** — silent wrong behaviour with a security or data
consequence. For this package: (1) a record the design claims to flag
reaching the dream flagged `false`; (2) any projected message removed, added,
reordered or re-worded, any `ts` changed, any flag lowered, or `gateExtract`,
`intakeBytes` or `parse` changed; (3) a learnings-ledger or Tier-3 gate
verdict lowered; (4) an absent, malformed or renamed field producing anything
other than today's projection — the fail-open property falsified. **B** —
wrong behaviour caught downstream or costing quality rather than safety: a
person's own words flagged `true` (barred from Tier 3), a mirror that
disagrees with the canonical table. **C** — hygiene.

**HEAVY** means the fix changes what the implementer builds: `src/`
behaviour, a Table N row's outcome or the fields it reads, the Deliverables
set, Erratum 10's claims, or an owner item's recommendation. **LIGHT** means
the fix touches only this spec's verification machinery (a test, a check, a
RED row, a citation, the measurement script, wording).

Evaluated in this order; the first rule that matches decides.

0. **Band gate.** A band-A finding is HEAVY, whatever it touches.
1. **ESCALATES to the pre-pinned FALLBACK — the no-net rule.** Two triggers:
   (a) any finding, at any round, whose honest fix is a **net** — a detector,
   counter, diagnostic, quarantine, halt, set-aside, retry, version check or
   any other mechanism that watches for the label disappearing; (b) a HEAVY
   finding on Table N at round 3 or later. Either stops patching, and the
   package re-cuts to the fallback:
   - **Fallback level 1 — flag the message only.** Applies when every
     finding that fired the rule lands on row N2 (the taint raise) alone.
     Drop N2: the labelled record's own user message is flagged `true` and
     the taint state is untouched. Measured basis (to be recorded in §2
     before round 1): if every labelled record on the owner's corpus already
     arrives with the taint state set, dropping N2 changes no assistant flag
     there. Its RED proof and its acceptance assertion go with it.
   - **Fallback level 0 — build nothing.** Applies in every other case. No
     `src/` change. The provenance path is recorded as a named residual: a
     dated erratum to `docs/specs/done/WP-dream-primary-dialogue-projection.md`
     stating that a record Claude Code labels as a task notification reaches
     the dream flagged `false`, with the measured count — carried by
     `WP-dream-projection-done-spec-errata` if it has not landed, or as its
     own S docs package otherwise — and the owner is told that the
     commissioned design did not close, and why.
2. **ESCALATES to a DESIGN QUESTION.** Two consecutive rounds land findings
   on Table N — the ADR-0031 circuit-breaker. Do not patch a third time; the
   next step is a re-decision of the class or the taint rule, recorded here
   before any edit.
3. **ESCALATES to the OWNER.** (a) A finding whose honest fix needs a
   measurement this repository cannot make — another machine's transcripts,
   a Claude Code build not installed here, Anthropic's intent for the
   `origin` field — or (b) a finding that argues against an owner item's
   recommendation. Each becomes an owner item or input to an existing one,
   and neither counts as unresolved for closure. Nothing in the loop ratifies
   an owner item.
4. **HEAVY → FRESH ROUND.** Any other HEAVY finding: fix, re-run the
   mechanical checks, then one fresh external round, with this criterion
   re-stated at its head.
5. **LIGHT → CLOSES.** A round whose findings are all LIGHT (band B or C):
   fix in place, re-verify mechanically — `npm test` on the simulated tree,
   the package's RED lane and `WP-dream-primary-dialogue-projection`'s lane,
   the measurement script on the shipped tree, the simulated tree and the
   simulated tree with `--strip-origin`, the erratum applied from the spec's
   own text and linted, the boundary check, `npm run lint` — and the loop
   **closes with no further external round**. A band-C finding may instead
   be dropped with a one-line reason recorded here.
6. **DONE** when a round finds nothing about the product. Machinery findings
   at that point are fixed or accepted as named residuals and do not extend
   the loop. The verification surface is **frozen** at three new tests
   (`[NT-AC1]`–`[NT-AC3]`), seven RED proofs (P1–P7) in one declaration file,
   and the commands in the spec's Verification steps: a machinery finding is
   fixed within that surface or accepted, never answered with more
   machinery.
