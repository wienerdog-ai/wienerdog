---
id: WP-quarantine-disposal-durability
title: Decide whether a disposed quarantine artifact must be durably gone, and enforce whatever is decided
status: Draft
model: opus
size: S
depends_on: [WP-quarantine-preserve-durability]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-disposal-durability: Decide whether a disposed quarantine artifact must be durably gone, and enforce whatever is decided

> **Draft stub, split out 2026-09-05 from `WP-quarantine-preserve-durability`
> while that spec was being matured.** The split is recorded as that spec's
> Dispatch-precondition **item 4**, with the recommendation and the cost of
> overruling it. It has NOT been through spec review — mature it to Ready before
> implementing, and re-measure every claim.

## Context (read this, nothing else)

The dream's EP2 secret gate (ADR-0034) preserves the bytes it is judging into
`state/quarantine/` or `state/quarantine/redacted/` before refusing to promote
them. `WP-quarantine-preserve-durability` makes a SUCCESSFUL preservation durable:
its **Table F** requires the platform's flush to have completed for the artifact
and for every directory entry it depends on before success is reported.

**Table F row F7(a) is what this stub owns.** A REMOVAL is not made durable there,
so a quarantine artifact this product deleted can reappear after a crash. Three
call sites remove such a file, all in `src/core/dream/validate.js`:

1. `removeOwnedQuarantinePath` — `WP-preservation-abort-widening` Table D rows
   **D1** and **D2**, the disposal of the one path a failed preservation owns. This
   one is **fail-loud** already: row **D3** raises a `WienerdogError` when the
   removal cannot be completed. **Its narrowest reachable case, routed here by the
   round-1 shadow channel of the predecessor's design gate (2026-09-05):** a crash
   after D2 removes `dest` but before `quarantinePreserve` returns lets the removed
   artifact reappear, because the unlink is not directory-flushed. It cannot make
   that call report success and it cannot destroy an only copy — the call has
   already decided to fail — so what it leaves is an orphaned extra artifact under
   a name no preservation record, no cleanup pass and no abort message reaches.
2. `pruneRedactedOriginals` — the `REDACTED_RETENTION_CAP = 50` eviction loop.
   Shipped contract: *"Best-effort: a failed prune is ignored and the arm still
   completes."*
3. The identity-gated delete inside the gate's refusal arm, which removes the
   `redacted/` copy when a byte-identical withheld copy demonstrably exists.
   Shipped contract: *"best-effort: a stale duplicate, not a hazard."*

**Wienerdog is just files (ADR-0004).** Whatever this package decides, it is a
synchronous call that has returned before the function containing it does.

## What done means

1. **The value question FIRST, and it may answer "no".** What a non-durable
   removal costs is a secret-bearing file reappearing under a name no preservation
   record, no cleanup pass and no abort message reaches — inside a 0700 directory
   under the user's own core, which `docs/THREAT-MODEL.md` puts on the same-user
   boundary. Weigh that against the maintenance of a second flush protocol before
   specifying one. *"Not worth solving"* is a legitimate outcome
   (`docs/runbooks/codex-review.md`), and if it is the outcome, this spec takes
   `Superseded` and Table F row F7(a) gains a dated clause saying so.
2. **If it IS worth solving: the disposition, which is a genuinely open product
   question.** A flush that does not complete on the SUCCESS path is a preservation
   failure — there is a failure to report and an abort to take. On the DISPOSAL
   path there is not: the preservation has already failed, `null` has already been
   decided, and there is no weaker outcome left. So each of the three call sites
   needs an answer of its own, and two of them would be changing a shipped
   `best-effort` posture — which is a contract change and the owner's act, not a
   fold-in.
3. **One canonical table**, whatever the answer, with a Mirrored Surface Checklist
   (ADR-0031), and no second Table D or Table F: those letters are taken by
   `WP-preservation-abort-widening` and `WP-quarantine-preserve-durability`
   respectively.

## Watch out

- **Do not re-open the success path.** `WP-quarantine-preserve-durability`'s Table
  F owns the flush protocol, its order, its **fixed directory chain ending at the
  core anchor**, its POSIX-only scope, the no-clobber commit, the descriptor-bound
  identity check and the byte-exact guarantee sentence. Cite it; restate none of it. In
  particular the guarantee sentence is spec-owned there and pinned by that
  package's V1 — a second copy of it in this file would fail that check.
- **Do not re-litigate the abort.** `WP-preservation-abort-widening`'s Table P and
  Table D own the trigger class, the message taxonomy and artifact ownership.
- **The evidence problem is the same one, and its answer is the same.** A crash
  cannot be staged in `npm test`; a call-order assertion proves the calls, not the
  guarantee. Say what the evidence reaches rather than asserting a proxy —
  `WP-quarantine-preserve-durability`'s Implementation notes state the form.
- **Measure the surface before sizing.** Its predecessor was re-cut once already;
  `S` here is a guess until the three call sites and their tests are measured.
