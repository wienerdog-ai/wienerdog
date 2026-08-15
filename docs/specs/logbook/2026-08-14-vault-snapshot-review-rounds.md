---
date: 2026-08-14
title: "WP-gate-vault-snapshot review rounds — the record, and an honest note on when the raw output was committed"
related_wps: [WP-gate-vault-snapshot]
---

# WP-gate-vault-snapshot review rounds (2026-08-13 → 2026-08-14)

Twelve review rounds ran on this package across three design generations. Each
one's raw final output is committed alongside this entry, one file per round.

## A process defect this entry exists to record

`docs/runbooks/codex-review.md` ("Rules") requires that **the reviewer's raw
output is committed BEFORE anyone reads or judges it** — that is what makes an
after-the-fact ruling possible, because the record cannot have been shaped by
the adjudicator.

**That did not happen here.** Every round was read and adjudicated first, and
the raw outputs were recovered and committed afterwards, at the owner's
instruction, immediately before the `Ready` flip. The evidence is intact and
verbatim — it was recovered from the session's own subagent transcripts, not
retyped — but it was committed **after** adjudication, not before. Anyone
weighing these findings later should know that the ordering guarantee the rule
buys was not in force for this package.

Two things follow, recorded so they are not rediscovered:

- The raw text is trustworthy as text: each file is the reviewer's final message
  extracted programmatically from `agent-<id>.jsonl`, byte-unchanged inside the
  fence. Nothing was reconstructed from memory.
- The ordering property is not recoverable retroactively. It is either done at
  the time or it is not, and for this package it was not.

## The rounds

Filenames carry the **UTC** date the round ran, taken from its transcript, so
two rounds that ran late on 2026-08-13 UTC belong to the 2026-08-14 local
working session.

| # | Round | Backend | Outcome | Raw file |
|---|---|---|---|---|
| 1 | Template conformance (round zero) | clean-context executor | CONFORMANT | `2026-08-13-vault-snapshot-r0-template-conformance-raw.md` |
| 2 | Internal coherence | internal executor | 23 findings, all fixed | `2026-08-13-vault-snapshot-r0-internal-coherence-raw.md` |
| 3 | Adversarial round 1 | gptsol | NO-SHIP, 8 findings | `2026-08-13-vault-snapshot-codex-round-1-raw.md` |
| 4 | Adversarial round 2 | gptsol | NO-SHIP, 6 findings | `2026-08-13-vault-snapshot-codex-round-2-raw.md` |
| 5 | Adversarial round 3 | gptsol | NO-SHIP, 5 findings | `2026-08-13-vault-snapshot-codex-round-3-raw.md` |
| — | *Owner ruling: no stamp; label + inherit always-on* | — | — | `2026-08-05-parked-report-provenance-product-decision.md` (Resolution) |
| 6 | Template conformance, revised spec | clean-context executor | CONFORMANT | `2026-08-13-vault-snapshot-revised-r0-template-conformance-raw.md` |
| 7 | Internal coherence, revised spec | internal executor | 15 findings, all fixed | `2026-08-13-vault-snapshot-revised-r0-internal-coherence-raw.md` |
| 8 | Adversarial round 1, revised spec | gptsol | NO-SHIP, 4 findings | `2026-08-13-vault-snapshot-revised-codex-round-1-raw.md` |
| 9 | Adversarial round 2, revised spec | gptsol | NO-SHIP, 3 findings | `2026-08-14-vault-snapshot-revised-codex-round-2-raw.md` |
| — | *Owner ruling: read-path hardening split out* | — | — | `2026-08-14-snapshot-read-hardening-scope-question.md` (Resolution) |
| 10 | Internal coherence, after the split | internal executor | 17 findings, all fixed | `2026-08-14-vault-snapshot-split-internal-coherence-raw.md` |
| 11 | Adversarial, after the split | gptsol | **ABORTED** — infrastructure error, no verdict | `2026-08-14-vault-snapshot-split-codex-round-aborted-raw.md` |
| 12 | Adversarial, on the owner-signed tree | gptsol | NO-SHIP, 2 findings, both fixed | `2026-08-14-vault-snapshot-split-codex-round-final-raw.md` |

Round 11 produced no verdict: the backend returned a 403 from the request
translator. Its file contains that error and nothing else — the run is recorded
as a run that did not happen, not as a clean round. Round 12 is a fresh dispatch
against the signed tree, not a continuation of it.

## Backend note

Every adversarial round used the `gptsol` backend, the primary one in the
owner's environment per the runbook's "How to run it". No round used the Codex
plugin, so no cross-backend validation is claimed. The Codex CLI (0.146.0) and
the plugin were confirmed installed when round 11 failed, but the retry on
`gptsol` succeeded and the fallback was not exercised.

## Convergence

The adversarial finding counts across the final design generation were **4 → 3 →
2**, and the last round's two findings were both spec overclaims corrected by
narrowing a sentence, with no mechanism change. The loop was closed on that
basis under the runbook's weighted-closure rule (LIGHT findings: fixes land and
are verified by re-measurement, without another full round), and the owner
accepted the closure.

Two earlier stopping points were themselves owner decisions rather than clean
rounds, and both are recorded in their own entries: the loop was stopped at
three design blockers on 2026-08-13, and stopped again at the runbook's
same-kind-findings rule on 2026-08-14 when two consecutive rounds landed
findings about the file-read contract rather than the gates.
