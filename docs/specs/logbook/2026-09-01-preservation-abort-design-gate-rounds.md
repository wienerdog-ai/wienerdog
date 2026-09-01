---
title: Design-gate round record — WP-preservation-abort-widening
date: 2026-09-01
related_wps: [WP-preservation-abort-widening]
---

# 2026-09-01 — design-gate rounds, WP-preservation-abort-widening

Doc under review: `docs/specs/WP-preservation-abort-widening.md`, matured from
the 2026-08-31 handover stub (HANDOVER queue item 3a) by wd-architect on
`docs/wp-preservation-abort-widening` (base `fc506110`), tip `ade024b0` at
round zero. Runs in parallel with the `WP-index-guard-residuals` loop (its own
record, same date); the two touch disjoint files.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material product finding on either channel; machinery or
wording findings at that point are fixed within the frozen surface or accepted
as named residuals. **Escalations, pinned in advance:** (i) two consecutive
rounds landing findings of the same kind → a design question per ADR-0031,
never a third textual patch; (ii) a finding whose only honest fix changes a
shipped canonical row's CONTRACT beyond Table P's stated amendments (Q4's
invariant, Q18's other three fields, G5 beyond its only-copy sentence) is
PARKED as an owner ruling in the spec's Dispatch precondition, never folded.
**The spec already parks ONE owner question** (blast radius: whole-run
fail-loud on the two new arms vs refuse-and-continue; recommendation:
fail-loud) — it blocks dispatch, not the loop.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round via `/new`). Raw outputs are committed
BEFORE adjudication, one file per channel per round
(`2026-09-01-preservation-abort-gate-raw-round<N>-<channel>.txt`).

## Round zero (`ade024b0` → fixes in `220de093`)

Template conformance (clean-context executor, sonnet): **CONFORMANT**.
Coherence pass (second clean-context executor, sonnet): every citation,
quoted fragment and count reproduced, the three-arm A/B/C measurement
re-driven byte-for-byte, V2/V3/V4 red on the untouched tree as predicted,
`npm test` 2444/0, lint green, the 209-test selection green; V5's mutations
COULD-NOT-RUN pre-implementation (they target code the WP adds). **8 findings
(2 B, 6 C), all FIX, applied in `220de093`:**

1. **B** — the "Discovered issues" claim that row V1 contradicts row G12 is
   FALSE on the current tree (V1 `:506` already states G12 keeps half (b)
   fail-loud and cites the fixing round; code agrees) — dropped, no
   replacement; G12's own cell re-read: no defect.
2. **B** — checklist shorthand `G5 → P5` (G5 cites Table P, the class, not
   row P5) and the P5 criterion bundling the two Done-spec amendment clauses
   — fixed and split.
3. **C** — `dream.js:947-963` → `:940-963` (catch at `:953`). 4. **C** — a
   backticked catch "literal" that exists nowhere → structural description
   with real lines. 5. **C** — Dispatch precondition moved after the title
   (four precedents). 6. **C** — `depends_on` gains the two amended Done
   specs; ADR-0012 dropped as partly superseded. 7. **C** — logbook citation
   `:83` → `:79-83`. 8. **C** — checklist category renamed to say every item
   is inside the Deliverables boundary.
   The architect's post-move re-read fixed three sentences the move
   falsified ("three code sites" → the gate, the module, the pipeline's
   record).

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
| 1 (`798f8617`) | needs-attention / needs-attention | `…round1-codex-plugin.txt` (`3e24bb64`), `…round1-herdr-shadow.txt` (`e538be49`) | Plugin 1 A + 2 B, shadow 1 A + 2 B + 1 C, zero scope objections (neither re-argued fail-loud), two converged. **Converged (R1-A, A, HEAVY):** a CLASS MEMBER the spec missed — `quarantinePreserve` returns the INPUT buffer without reading the artifact back (`validate.js:667-670`); both reviewers fault-injected a write that stored different bytes: the redact arm returned a non-empty record over a non-identical file, and the recoverable escape compared against the in-memory alias, so a corrupt artifact counted as recovery; P0 and P4 accept the record and teardown destroys the sole correct copy → FIX: Table P gains the "reported success, artifact missing or not byte-identical" member; success is established from the artifact (read-back after rename); the escape uses the verified result; P4's reach against an injected gate stated honestly. **Shadow (R1-B):** the frozen `secretGateAbortMessage(rel, redactedName, identity)` signature cannot express Table P — P1/P2 and P3-both-failed arrive with identical inputs and must produce different values → FIX: a closed discriminant in the helper contract. **Shadow (R1-C):** Q4 names row B3b of the secret-fence spec as the abort CONDITION's owner and B3b still scopes it to the fall-through arm; Q18's "all three arms" universals go false under an append-only value → FIX: B3b joins the amendment boundary; byte-exact pointer-only Q18 text delegating the taxonomy to Table P. **Converged (R1-D, B/C):** V2–V5 certify the wrong change — `grep -Fc` counts lines; V4's `ROW G5` anchor is satisfied with the catch comment deleted (executed); phrase-shaped where the criterion is claim-shaped; V5's name pattern skips a legitimately named test → FIX. **Converged (R1-E):** over-prescription (fixture, "one added branch", helper as mirror, exact mutations) → PRUNE. Channel notes: the plugin's sandbox denied `mkdtemp` (runtime reading, disclosed; degraded drive with `stateDir=/dev/null` reproduced A/B/C); the shadow was granted two temp-dir reproductions and one `npm test` (2444/2432/0). All FIX, applied in `e95632fb`. R1-A is HEAVY → full round 2. |
| 2 (`f962c9ca`) | needs-attention / needs-attention | `…round2-codex-plugin.txt` (`fb08352c`), `…round2-herdr-shadow.txt` (`7156a5c3`) | Both channels verified R1-B and R1-C genuinely fixed. Plugin 1 A + 3 B, shadow 1 A + 2 B + 2 C, zero scope objections, three converged. (The first plugin job of this round died with an orchestrator background-task kill at 21:39Z and was re-run fresh; disclosed in the raw's header.) **Converged (R2-A, A):** Q4 demands a DURABLE artifact; P0b's post-rename read-back can be served from cache before the file or its directory entry is durable, so a crash after workspace deletion loses both copies — and the spec's own "no fsync, same invocation" out-of-scope note silently weakened a shipped invariant → FIX: durability joins P0b (fsync file before rename, fsync the quarantine directory after); the read-back-to-teardown mutation window is a same-user native actor (THREAT-MODEL A12) — grounded as a cited residual or parked, never a teardown re-verification in `dream.js` (comment-only boundary). **Plugin (R2-B, B):** under P0b + the P3 escape the discriminant value `only-withheld-failed` looks UNREACHABLE (tests already record the R0b arms unreachable at `dream-validate.test.js:1970-1978`) while P6 demands evidence for three values → FIX: measure reachability; if unreachable, retire the value to Q18 legacy and reconcile P6; represent the (discriminant, basename) pair so inconsistent combinations cannot be passed. **Converged (R2-C, B):** the rejected-artifact lifecycle is undefined — the mismatch is detected AFTER rename, the catch removes only `tmp`, a null return leaves `dest` unrecorded and unpruned; on fall-through + successful withheld preserve it bypasses cleanup and record → FIX: verified removal of the final destination on failed verification, fail-loud if removal cannot complete, evidence that no unrecorded `redacted/` artifact remains. **Converged (R2-D, B/C):** V4 still recognizes only `both fail` (a stale synonym with the citation passed on both channels); the `>2444` floor is vacuous/false-red; the five-item mutation list persists → FIX: byte-exact catch comment verified exactly (spec-owned prose IS the contract); floor dropped for baseline-green + full-suite REDs; behaviours needing counterfactual evidence named, mutation design left to the implementer. **Shadow (R2-E, C):** security checklist's "only output is a boolean" false under P0b; stale test commentary (`:1970-1978`, `:2040-2049`) missing from the mirrors → FIX. All FIX, applied in `ec2b6021`. Durability is a new contract obligation → full round 3. |
| 3 (`ea5c5d00`) | needs-attention / needs-attention | `…round3-codex-plugin.txt` (`d7459e30`), `…round3-herdr-shadow.txt` (`c48831dc`) | R2-A/B/D/E verified genuinely fixed by both (the plugin measured on APFS that libuv's fsync path attempts `F_FULLFSYNC`; both re-derived the `only-withheld-failed` unreachability; the A12 citation judged honest; V4's extraction unambiguous). Plugin 1 B, shadow 1 A + 1 B, zero scope objections. **Converged (B):** the cleanup omits the PRE-rename state — if the file fsync or the rename fails only `tmp` exists while P0b asserted `dest` exists and required removing it; the catch suppresses `tmp`-removal failure; deleting `dest` before a completed rename could hit a collision candidate this invocation never owned; post-rename disposal needs a directory fsync. **Shadow (A):** first-use durability — `quarantinePreserve` creates the directories recursively and fsyncing only the new `qdir` does not persist its entry in the parent; libuv silently degrades `F_FULLFSYNC` → `fsync`, so "survives a crash" over-claims; an unavailable flush should be a failure. **CIRCUIT-BREAKER (criterion (i)) — durability took findings two rounds running.** Design move, not a third patch: **Table D (D0–D4), the artifact ownership and disposal state machine**, extracted as a canonical table in this spec (owned state → what is removed and confirmed; `dest` never touched unless this invocation completed the rename; removal failure is a `WienerdogError`; `null` means the owned path is absent); P0b scoped to read-back verification and cites it. **Crash durability SPLIT to a Draft successor `WP-quarantine-preserve-durability`** — the architect's three measurements: no literal verification command exists for a crash (the repo's own split rule); the product has ZERO fsync calls today, so the exposure is pre-existing and this WP strictly reduces it (more aborts, workspace retained); two rounds each enlarged the surface. The orchestrator had leaned to an in-spec table and accepted the split on those measurements. `size` S → M; the successor's sequencing disclosed to the owner (recommend after the banner WP). All FIX, applied in `5a1d61b4`. Structural change → round 4 runs as the closing confirmation. |
| 4 (`4ee0a7c0`) | needs-attention / needs-attention | `…round4-codex-plugin.txt` (`59f15972`), `…round4-herdr-shadow.txt` (`cbce61d8`) | **The closing confirmation.** Both channels accepted Table D's state machine and the durability split as a design and re-argued neither owner item; zero scope objections; no A-band, no product finding. **Converged (R4-A, B):** the parent still overstated Q4 — "P0–P5 make the implementation agree with Q4" while Table P defines success as read-back verification, NOT durability — and the prescribed B3b clause said the byte-identity condition was "unchanged", leaving B3b's DURABLE-copy conjunct active and the amended canonical cell false until the successor lands → FIX: the parent enforces Q4's verified-byte-identity SUBSET and explicitly DEFERS the durability conjunct pending `WP-quarantine-preserve-durability`, in the Context paragraph, P0, the Dispatch precondition and the byte-exact B3b clause. **Converged (R4-B, B):** criterion D4 quantified over the ENTIRE quarantine tree — unsatisfiable on any non-empty quarantine, since pre-existing artifacts and the D1 collision candidate legitimately persist; could encourage destructive cleanup → FIX: scoped to paths this invocation owns, plus byte-identity of every pre-existing file after every failure path. **Plugin (R4-C, C):** the successor stub called durability "not a repair" → a repair of a pre-existing Q4 gap needing a new mechanism. **Shadow (R4-D, C):** the split rule quoted as CLAUDE.md's is in `.claude/agents/wd-architect.md:17` (the round-3 row above inherits the correction: "the repo's own split rule" = the architect definition's). All FIX, applied in `52d51125`. **LOOP CLOSED** per the pinned stop criterion: round 3's design move was confirmed by both channels; round 4 returned wording/coherence findings only, fixed within the frozen surface and verified mechanically by the orchestrator on committed bytes. |

## Outcome

- **Loop closed 2026-09-02 after round zero + 4 double-channel rounds** (8 gate
  runs; the round-2 plugin job was lost to an orchestrator background-task kill
  and re-run fresh, disclosed in its raw's header). The spec is `Ready` at
  `52d51125`, 749 lines, `size: M` (flipped from S in round 3 with the second
  canonical table); a Draft successor `WP-quarantine-preserve-durability.md`
  (84 lines) was created by the round-3 design move.
- **Dispatch is blocked on ONE owner question** in the spec's Dispatch
  precondition (blast radius: rows P0–P3 make the WHOLE RUN fail loud on the two
  newly guarded arms that today refuse one note; recommendation: confirm
  fail-loud) and carries ONE owner disclosure (the successor's place in the
  owner-sequenced chain; recommendation: after `WP-quarantine-banner-location`).
  The stub's cited owner ruling ("widened to the whole class") was found
  recorded nowhere in the tree and is stated as such rather than invented.
- **Design lineage:** three withhold arms, one guarded (round 0, measured) →
  the missed class member "reported success, wrong bytes" (round 1, converged
  A) → row P0b read-back rule, which also fixed the alias at the recoverable
  escape (`Buffer.compare(afterBytes, redactCopy.bytes)` compared a buffer with
  itself) and made `only-withheld-failed` measurably unreachable → durability
  demanded (round 2, converged A) → durability protocol incomplete (round 3) →
  **circuit-breaker: Table D owns artifact ownership/disposal; crash durability
  split to a successor** with the honest delta (zero fsync in the product today;
  this WP strictly reduces the exposure) → Q4 read as two conjuncts, the
  parent enforcing byte-identity and deferring durability (round 4).
- **Channel comparison, 8 head-to-head runs:** converged on every major family
  in the same round (the wrong-bytes member, durability, the cleanup protocol,
  the over-prescription, the Q4 over-claim, the D4 scoping). Unique real
  findings: plugin — the unreachable `only-withheld-failed` arm, the successor's
  "not a repair" contradiction; shadow — the frozen helper signature's
  impossibility, the B3b ownership gap, first-use directory durability, the
  CLAUDE.md misattribution. **Zero false findings on either channel.**
