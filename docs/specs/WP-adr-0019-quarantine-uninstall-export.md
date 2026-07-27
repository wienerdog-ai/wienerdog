---
id: WP-adr-0019-quarantine-uninstall-export
title: Offer the secret quarantine's contents before uninstall disposes them — ADR-0019 amendment plus an uninstall export/warn step
status: Draft
model: opus
size: M
depends_on: [WP-secret-fence-ep2-redact-arm]
adrs: [ADR-0004, ADR-0019, ADR-0024, ADR-0034, ADR-0035]
epic: secret-lifecycle
---

# WP-adr-0019-quarantine-uninstall-export: stop uninstall silently destroying the only copy of the user's own text

**This is a DRAFT STUB.** It records a decided mandate and its scope so that the
follow-on is not lost; it is **not implementable as written** and carries no
Deliverables table, no contract tables, no acceptance criteria and no
verification steps yet. The architect writes those in a later pass. **Do not
dispatch this WP.**

## Why this exists — the owner's ruling, not an architect's proposal

Round 1 of the design gate on `WP-secret-fence-ep2-redact-arm` raised a conflict
between that WP's recovery design and **ADR-0019** (`Status: Accepted`). The
architect laid out three options and recommended one; the owner chose. Recorded
in the established form:

> **OWNER-DECIDED IN SESSION — 2026-07-27 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the architect,
> not by him. It records that the decision was taken — it is **not** his
> signature and must never be treated as one, and **no gate keys on it**.
> Verbatim: *"ADR-0019: C now + B as follow-on."*

**Option C landed in `WP-secret-fence-ep2-redact-arm`** (its Table Q rows Q4 and
Q6, its dream-report line, and its accepted residual 11): the product now *tells*
the user that the recovery copies are disposable and that `wienerdog uninstall`
removes them. **This WP is option B** — the part that changes what uninstall
actually does, and the ADR that currently forbids the change.

## The problem, stated once

`WP-secret-fence-ep2-redact-arm` writes **the only pre-scrub copy of a user's own
note** into `state/quarantine/redacted/`, and its dream report tells the user to
restore from that copy if the redaction was wrong. The shipped withhold path has
done the same thing for withheld notes in `state/quarantine/` since WP-123.

**ADR-0019 disposes both.** `disposeCoreMechanics` removes `paths.state` with
`fs.rmSync(dir, { recursive: true, force: true })`, so a user who uninstalls
before reviewing loses that text with no warning naming it. ADR-0019 also states
an invariant this content sits on the wrong side of — reproduced verbatim from
`docs/adr/0019-uninstall-disposes-core-mechanics.md`, lines 52–54:

```text
The invariant this rests on — **nothing user-authored is ever written under the
canonical core; the vault is always outside it** — is binding on all future
code. No WP may write user knowledge under `~/.wienerdog`.
```

A pre-scrub copy of the user's own note **is** user-authored content, so the
invariant is already crossed on `main` by the withhold path and is extended by
the redact arm.

**Deleting the bytes on uninstall is not obviously wrong** — it is the argument
ADR-0019 itself makes for `secrets/`, and leaving raw credential material on disk
after an uninstall would be its own finding. **What is wrong is deleting them
without offering them first.**

## Scope

**Both quarantine trees together, and that is deliberate.** `state/quarantine/`
and `state/quarantine/redacted/` have identical exposure; the first predates this
epic. Splitting them would fix half a problem twice and leave the ADR amendment
straddling two WPs.

1. **An ADR-0019 amendment.** Either a carve-out from blind recursive disposal
   for `state/quarantine/**`, or a "preserved kind" registration in the install
   manifest — ADR-0019's own Consequences already name the second route ("or be
   added to the manifest as a preserved kind"). The amendment must say what the
   core-holds-only-mechanics invariant means once a directory under the core
   knowingly holds user text. **Whether this is an amendment to ADR-0019 or a new
   superseding ADR is the first thing the real spec decides.**
2. **An uninstall export-or-warn step**, in `src/cli/uninstall.js` (and whatever
   `src/core/manifest.js` needs): before disposal, if either tree is non-empty,
   either copy its contents somewhere the user keeps or refuse-and-report, with
   the count and the destination named.
3. **`--dry-run` must disclose it plainly**, preserving ADR-0019's own
   M1 dry-run-exactness guarantee.
4. **The user-facing copy that option C wrote** — the runbook bullet, the
   glossary's *disposable*, the dream-report line's "while it is there" — is
   **re-derived** once this lands, because it will no longer be true as written.
   That is a Table Q pass on the predecessor's surfaces, not a rewrite.

## Out of scope

- **The detector and the EP2 gate.** Both legs of the secret fence are done by
  the time this runs; this WP changes neither.
- **Retention.** `state/quarantine/redacted/`'s cap and `state/quarantine/`'s
  unboundedness are the predecessor's Table B rows B12/B13 and stay as they are.
  **Note the coupling the predecessor records**: its fall-through byte-identity
  guard is sound only while `state/quarantine/` is never pruned, so a cap there
  is not a local change.
- **Anything that writes user content into the vault.** The vault is a git
  repository that may be synced; keeping raw bytes out of it is the gate's whole
  job. This was option A and the owner did not choose it.

## Open questions for the real spec

1. Export **where**? A user-chosen path, the home directory, or refuse-and-report
   with no copy at all.
2. Amend ADR-0019 or supersede it?
3. Does `uninstall` ever proceed **without** the user acknowledging the export —
   i.e. is this a prompt, and what does the unattended path do? **ADR-0035's
   attended-execution boundary is likely to govern the answer.**
4. Does the same treatment extend to `secrets/`? ADR-0019 disposes the Google
   OAuth token on the same reasoning, and the answer there is probably "no,
   because it is re-obtainable" — which is exactly the property quarantined user
   text does not have, and saying so is worth one paragraph.

## Definition of done

**Not yet written.** This stub is complete when the architect replaces it with a
full spec: a Deliverables table, the ADR decision, contract tables for the export
behaviour, acceptance criteria, mutation rows and verification steps.

**This spec stays `status: Draft`** and does not move to `Ready` until it is a
real spec and has been through the double gate
(`docs/runbooks/codex-review.md` plus wd-reviewer). Only the architect or the
owner flips it.
