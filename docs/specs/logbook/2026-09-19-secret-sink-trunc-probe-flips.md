---
title: Three WD-SINK-TRUNC-* probes flip from DEFECT to CORRECT — recorded here, not in the done spec
date: 2026-09-19
related_wps: [WP-secret-sink-redact-before-truncate, WP-secret-sink-wiring-probes, WP-secret-sink-chunk-fix]
---

# Table P status flips — WP-secret-sink-redact-before-truncate

`WP-secret-sink-wiring-probes` (Done, PR #261) is not edited by this WP — see
its "Out of scope" list. Its Table P rows for P2, P4 and P6 are now stale;
this entry records the flip so the fact survives review without touching the
done spec. `WP-secret-sink-chunk-fix` corrects Table P itself, in one dated
block, once all seven originally-DEFECT rows have moved.

## Table P flips

| # | Test name (old, in the done spec) | Old Status | New Status | Fixed by |
|---|---|---|---|---|
| P2 | `sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is NOT redacted in alerts.jsonl (KNOWN DEFECT WD-SINK-TRUNC-ALERTS)` → renamed `sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is redacted in alerts.jsonl` | DEFECT `WD-SINK-TRUNC-ALERTS` | CORRECT | `WP-secret-sink-redact-before-truncate`, Table A site A1 (`src/core/alerts.js`) |
| P4 | `sink-probe: run-evidence — a labelled secret straddling the argv cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-ARGV)` → renamed `sink-probe: run-evidence — a labelled secret straddling the argv cap is redacted in run-evidence.jsonl` | DEFECT `WD-SINK-TRUNC-RUNEV-ARGV` | CORRECT | same WP, Table A site A2 (`src/core/run-evidence.js`, `sanitizeArgv`) |
| P6 | `sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-FIELD)` → renamed `sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is redacted in run-evidence.jsonl` | DEFECT `WD-SINK-TRUNC-RUNEV-FIELD` | CORRECT | same WP, Table A site A3 (`src/core/run-evidence.js`, `sanitizeRecord`'s `scrub`) |

All three sites now scan the whole field value through `redactOnly` before the
2000-character cap is applied, closing the leak each probe pinned.

## Table R → Table C declaration replacement

The done spec's Table R rows R1–R3 declared the RED proofs that this WP's fix
would falsify by design — landing the fix makes their `find` strings stop
matching, since the fix is what they mutate *toward*. `WP-secret-sink-redact-
before-truncate`'s Table C replaces them with the inverse (declarations that
mutate the shipped fix back to the pre-fix order, reddening the now-CORRECT
probes above):

| Old declaration (deleted) | id | Replaced by | id |
|---|---|---|---|
| `tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json` (Table R row R1) | `alerts-redact-before-truncate` | `tests/red-proofs/secret-sink-redact-before-truncate-alerts.proofs.json` (Table C row C1) | `alerts-truncate-before-redact` |
| `tests/red-proofs/secret-sink-wiring-probes-run-evidence.proofs.json` (Table R row R2) | `run-evidence-redact-before-truncate-argv` | `tests/red-proofs/secret-sink-redact-before-truncate-run-evidence.proofs.json` (Table C row C2) | `run-evidence-argv-truncate-before-redact` |
| same file, Table R row R3 | `run-evidence-redact-before-truncate-field` | same file, Table C row C3 | `run-evidence-field-truncate-before-redact` |

The three ids the deleted files carried are freed by the same commit that
lands the new pair. The bare unfiltered `npm run red-proofs` reports
`PROVEN` for `WP-secret-sink-redact-before-truncate` criterion AC4 with all
three of the new ids, on the branch that lands this flip.

## What is still open

The four `WD-SINK-CHUNK-*` ids — `WD-SINK-CHUNK-BRAIN-STDOUT`,
`WD-SINK-CHUNK-BRAIN-STDERR`, `WD-SINK-CHUNK-RUNJOB-STDOUT`,
`WD-SINK-CHUNK-RUNJOB-STDERR` (Table P rows P8, P11, P13, P15 in the done
spec) — **remain Status DEFECT**. Nothing in `WP-secret-sink-redact-before-
truncate` touches them; their probes stay green-because-broken until
`WP-secret-sink-chunk-fix` lands. A green suite after this WP's merge must not
be read as "the sinks are safe" for those four.
