---
title: Round (d) — undirected confirming round (raw), the promote family
date: 2026-08-29
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. Condensation declared:
     the 14-row prior-findings table is carried by its verdicts; the single
     finding and the execution report are verbatim. Full table in the transcript. -->

# Round (d) — undirected confirming round (raw)

Reviewer: gptsol, external, FRESH agent. Vendored prompt, unedited. Targets: all
three specs at `56a1669`. **Read-only verified independently.**

## Prior findings — 13 of 14 genuinely fixed

Every prior confirmed **genuinely fixed**, including the B-band `@returns`
restoration, with current lines cited. **The A-band ordering fix is ruled
"genuinely fixed for the specific ordering defect"** — with a broader invariant
still false through a different channel (the finding below), and with one
supporting sentence that did not reproduce:

> One supporting sentence did not reproduce literally: `[REDACTED:generic-secret]`
> does not survive the sanitizer unchanged; it becomes `_REDACTED_generic-secret_`.
> This does not restore the removed secret, so it does not reopen the original
> order defect.

It also independently re-verified a prior by execution: it compiled the shipped
`scratchIntact` body in memory, fed it an intact expected extract plus an
`EVIL.json`, and got `true` with the extra file still present — **confirming G12
is behaviourally distinct from the existing check rather than a restatement.**

## Verdict

`needs-attention`. **NO-SHIP.** "The newly ordered report neutralization still
leaves an attacker-influenceable redaction path outside its explicitly named
value set and outside its acceptance test. A conforming implementation can
therefore persist secret bytes in the durable report while correctly redacting
the note itself."

## F1 — A-band: redaction accounting can persist the secret that EP2 removed from the note

- **Affected file:** `docs/specs/WP-dream-promote-report.md`
- **line_start:** `197` **line_end:** `200` **Confidence:** `0.99`

**What can go wrong:** A brain can create an admitted note whose path contains a context-dependent credential, such as `04-Atomic/token=abcdefghijkl.md`, while its content triggers the EP2 redaction arm. EP2 removes the content secret and promotes sanitized note bytes, but the redaction report line can interpolate the raw path and commit `token=abcdefghijkl` into the durable report.

**Why vulnerable:** Line `197` begins with a universal — every interpolated value is neutralized — but then calls its value set "NAMED" and enumerates only `r.path` and `r.reason` for refusal/accounting records. The separately defined redaction line at line `200` carries a path, line count, labels, and artifact, but does not say that its path is transformed. The acceptance criterion at lines `301-320` exercises only a "brain-chosen refused path" and refusal reason. It never exercises a `redacted[].rel` containing a context-dependent secret. An implementation that neutralizes only the explicitly named refusal-record fields therefore satisfies the stated criterion while leaking through the redaction subsection.

**Executed evidence:** I ran the shipped validator with a note named `04-Atomic/token=abcdefghijkl.md` whose content triggers a context-free entropy redaction. The run reported `secretRedactions: 1`, but its generated report contained the literal path and returned `"rawCredentialInReport": true`. I separately ran `scanAndRedact` over that report line: it detected and redacted the path credential, proving the raw line contains bytes EP2 would refuse. Running redact-first then `sanitizeProjectName` on the path removed those bytes and left no scanner finding.

**Likely impact:** A credential that the secret fence appeared to handle safely becomes durable in the report and then in the vault's dream commit. This is silent security failure: the note is reported as successfully redacted while another file persists the secret, and the current required tests can remain green.

**Concrete recommendation:** Extend Table R's explicit interpolation-value set to include `redacted[].rel`, and require redact-first-then-sanitize before composing every redaction line on both the normal second write and fallback. State which remaining redaction metadata fields are code-owned or already sanitizer-bounded rather than leaving them implicit. Add an acceptance case where a redacted note's `rel` contains at least `token=abcdefghijkl` and `client_secret: abcdefghijkl`; assert that the raw secret occurs nowhere in either published report branch. The criterion must go RED when refusal records are neutralized but redaction paths are not.

## Scope objections

**None.**

## Execution report — this round ran a great deal

| Check | Exit | Result |
|---|---:|---|
| `node --test tests/unit/dream-vault-write.test.js` | 0 | 27/27 |
| `node --test tests/unit/dream-delta.test.js` | 0 | 24/24 |
| `node --test tests/unit/dream-workspace.test.js` | 0 | 44/44 |
| `node --test tests/unit/reap.test.js` | 0 | 26/26 (test-injected win32 branches; not a native Windows run) |
| `scanAndRedact` × `sanitizeProjectName` in both orders | 0 | sanitizer-first: no finding. redact-first: both secrets removed. **Placeholder is punctuation-normalized by the sanitizer, not byte-unchanged** |
| scan of a redaction line containing `01-Projects/token=abcdefghijkl.md` | 0 | raw line → `generic-secret` finding; redact-first/sanitize → none |
| **shipped `validateAndCommit` with `04-Atomic/token=abcdefghijkl.md`** | 0 | `secretRedactions: 1`; report still contained the credential; `rawCredentialInReport: true`. **F1's direct reproduction** |
| shipped `validateAndCommit`, hard secret + unwritable quarantine | 0 | note removed, `quarantine copy failed` reason. Run to verify the lifecycle Table Q replaces; **not reported as a defect, because Q4/G5 explicitly change it** |
| `require('./src/cli/dream').scratchIntact` | 2 | expected: it is private and not exported. No file changed |
| in-memory compile of the shipped `scratchIntact` body + `EVIL.json` | 0 | returned `true`, extra file present — **G12 is behaviourally distinct** |
| git repo probe: publish approved bytes, user save, `git add -- note.md` | 0 | git staged the user's later bytes. **Confirms Table S/G8's returned-byte requirement** |
| shipped `writeIntoVault` twice: publish, user save, guarded accounting write | 0 | second returned `written:false`; user's bytes remained. **Confirms the report's guarded second-write premise** |
| `git diff --check 36c2ce5..56a1669` over the three specs | 0 | no whitespace errors |

**Two incidental nonzero exits, disclosed and corrected without changing files:**
a zsh glob with no match (`1`, replaced by `find`), and a `grep` for a local
`displayName` that is imported from `ledger.js` (`1`, located directly instead).

**Not run, and stated as such:** the full `npm test` and `npm run lint` (four
directly relevant shipped test files were run instead); a native Windows host; a
real process-group survivor; a mid-rename crash; and the future `promote()`,
report extension and rewired pipeline — **their absence was explicitly not
treated as a finding.**

## Lessons/gotchas

- `WP-dream-promote-report`: An "every interpolated value" rule plus an explicit
  named list is only as strong as the list; redaction accounting remains
  attacker-influenceable through the redacted note's path even after refusal
  records are correctly neutralized.

## Author's verification, before adjudication

- **`sanitizeProjectName('[REDACTED:generic-secret]')` → `REDACTED_generic-secret_`.**
  **This author's "the placeholder is sanitizer-neutral" sentence is FALSE**, and
  it was written as a reason in the same pass that told the reviewer a claim
  about a function is a claim to be RUN. It was not run. The order ruling stands
  — the reviewer is right that this does not restore the secret — but the stated
  reason must be corrected to what actually holds.
- **`sanitizeProjectName('04-Atomic/token=abcdefghijkl.md')` → `04-Atomic_token_abcdefghijkl.md`** —
  the separator is flattened and the credential remains legible. F1's channel is real.
