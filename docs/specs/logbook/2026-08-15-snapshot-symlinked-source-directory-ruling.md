---
date: 2026-08-15
title: "Ruling: a symlinked SOURCE DIRECTORY under the vault snapshot is accepted, not refused"
related_wps: [WP-snapshot-read-path-hardening, WP-gate-vault-snapshot]
---

# Ruling: the snapshot's symlinked source directory (2026-08-15)

**Provenance.** The owner ruled this on 2026-08-15, and the ruling was relayed in
the dispatch brief that commissioned `WP-snapshot-read-path-hardening`. It is
written down here by that spec's author, at the owner's instruction, so the
decision has a record of its own in the repo: until this entry existed, the
ruling lived only inside the spec it governs, which left that spec citing itself
as the input discharging another package's residual. Nothing below is the
author's own decision — the wording is the author's, the decision is not.

## The question this answers

The 2026-08-14 split ruling
(`docs/specs/logbook/2026-08-14-snapshot-read-hardening-scope-question.md`,
Resolution point 4) sent this behaviour to the read-path package as "the open
product question inside it (refuse, resolve-and-bound, or accept)". The gate
package named it as Residual 7 and stated plainly that it was "fixed by neither
package until ruled" (`docs/specs/done/WP-gate-vault-snapshot.md:271`, `:412`).

## The behaviour in question

`makeVaultSnapshot` enumerates each source slice with `readdirSync`
(`src/core/vault-snapshot.js:141`), which resolves symlinks. A user whose
`07-Daily` or `reports/dreams` is a symlink to a directory outside the vault
therefore gets files from outside the vault copied into the snapshot, and
`skipped[]` stays empty — there is nothing to report, because from the code's
point of view nothing was skipped. Re-measured on 2026-08-15 at `e3c7474`, after
the content gates landed: unchanged by them, as expected — the gates decide on a
file's CONTENT and never on where enumeration found it.

The file-LEVEL refusal is a different mechanism and is not in question here: a
symlink in the *leaf* position is refused and skipped visibly
(`src/core/vault-snapshot.js:161-164`).

## The ruling

**A symlinked SOURCE DIRECTORY is ACCEPTED — followed, as the user's own
configuration choice.**

## Considered and rejected

- **Refuse.** It would break an ordinary layout. A user who symlinks their
  daily-notes folder into the vault — from a cloud-synced directory, say —
  would lose their routine's input overnight, with no error that explains why.
- **Resolve and bound** (resolve the real path and require it under the vault
  root). It adds a new mechanism and a new error class — mount points, case
  sensitivity, path normalization — and it still breaks the cloud-folder user,
  whose target is outside the vault root by definition.

## Grounds

Planting such a symlink requires write access to the vault directory on the
user's own machine. That is outside the threat model's remote attacker, who
reaches Wienerdog through content; a local writer has far shorter paths
available than redirecting a bounded, gated snapshot.

## Value line

The user keeps their notes where their life has them — the product adapts to
their layout, not the other way around. The security weight stays where code can
actually enforce it: the caps, the gates, and the capability box.

## The obligation the ruling carries

The accepted behaviour must be STATED, so it is a named decision rather than a
silent gap: in `WP-snapshot-read-path-hardening` (as an accepted-behaviour row
carrying this rationale), and in the code's own prose, whose `Symlink-safe:`
JSDoc claim currently reads as a whole-path property. That WP owns both.

## What this resolves

Residual 7 of `docs/specs/done/WP-gate-vault-snapshot.md` is now ruled on this
point. The Done spec is not edited — it is a record of what shipped, and its
residual predates the ruling; the read-path WP notes the resolution instead.
