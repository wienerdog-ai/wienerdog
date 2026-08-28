---
title: Review rounds — WP-dream-denied-object-disposal
date: 2026-08-20
---

# Review rounds — WP-dream-denied-object-disposal

Spec: `docs/specs/WP-dream-denied-object-disposal.md`. Base: `main` @ `1d4c092`.

**Round counter starts at ZERO.** No round history is inherited from the superseded
parent, `docs/specs/done/WP-dream-control-file-fence.md`. Its record —
`docs/specs/logbook/2026-08-20-dream-control-file-fence-review-rounds.md` — is cited
as EVIDENCE for the measurements this spec carries, never as review credit: no finding
there counts as reviewed here, and this package's own rounds must re-find anything
that still applies.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the PRODUCT —
  nothing that changes what the implementer builds in `src/`.
- **THE FAMILY ESCALATION, inherited verbatim from the parent's split ruling:** if a
  round lands again on the **preservation/visibility family**, it returns to the owner
  as a ruling request, **and rethinking the package itself is on the table** — not
  merely its mechanism. Two designs have already failed that family.
- **Otherwise:** two consecutive rounds on any other same contract family → contract
  extraction, not another patch. Two consecutive rounds on an owner ruling → owner
  ruling request.
- **Surface frozen:** ZERO new source-level assertions — the parent measured twice why
  a source grep cannot assert these contracts. The behavioural both-directions
  requirement stands and does not grow.
- **Scope frozen:** this package is one half of a two-package pair. A finding
  belonging to the sibling, to C2 (the git-execution seam) or to C3 (the layout dot
  rule) is routed, never folded in.

## Rounds

| Round | Kind | Raw record | Commit that introduced the raw | Verdict |
|---|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-20-dream-denied-object-disposal-r0-template-conformance-raw.md` | `5a59b89` | 1 blocking item |
| 0b | Internal coherence + runnable criteria | (in this record) | `5a59b89` | 2 findings |
| 1 | External adversarial (design), gptsol | `docs/specs/logbook/2026-08-20-dream-denied-object-disposal-round-1-raw.md` | `dfa2f47` | NO-SHIP — 5 findings, routed section empty |
| 2 | External adversarial (design), gptsol, fresh round after HEAVY fixes | `docs/specs/logbook/2026-08-20-dream-denied-object-disposal-round-2-raw.md` | `163bde1` | NO-SHIP — 1 not fixed, 3 partial, 7 new |

## Round 0 dispositions

**0a — template conformance.** Both halves were read by independent clean-context
executors that took no part in drafting. Verdicts and the two findings below are
recorded in the raw files cited above.

**0b — internal coherence. Run by the orchestrator session itself**, not by a
separate executor, and therefore with **no separate raw file** — the C1 precedent had
one because a distinct pass produced it. The measurements below ARE the record; a
later reader re-runs them from here. Every `file:line` citation in both specs was re-run
against the tree, not re-read. Both specs' verification patterns were executed:
`npm test -- --test-name-pattern "dream|private-fs"` and
`npm test -- --test-name-pattern "dream"` both exit 0 with zero failures, and
`npm run lint` passes. As both specs already state in their own Verification steps,
**that greenness proves nothing on a spec-only branch** — the behavioural
both-directions requirement is the real gate.

| # | Finding | Weight | Disposition |
|---|---|---|---|
| R0-1 | The template's `### Contract table(s)` heading was silently absent from BOTH specs — the three named tables sat in its slot at `###` level with no heading and no `N/A` line. One executor called it BLOCKING, the other a heading-text deviation; the stricter reading is the correct one under `docs/runbooks/spec-authoring.md` ("a template section is never deleted silently") | LIGHT | **fix** — the template heading is restored in both specs with a one-line lead, and the named tables become `####` beneath it, which is the shape the template actually describes |
| R0-2 | `WP-dream-denied-object-disposal` cited `src/core/private-fs.js:105-113` for the A5 private-directory list; the list is `:106-113` (`:105` is the JSDoc tail) | LIGHT | **fix** — corrected in both places it appeared |

**A third finding, on the orchestrator's own record rather than the specs:** the two
conformance raw files were written citing commit `45c34a5` for the tree the executors
read — a hash that does not exist. The split commit is `4221a62`. Caught by running
`git log` instead of trusting the recollection, and corrected in place before the
round closed. It is recorded here because the whole point of a raw record is that a
later reader can re-run it, and a wrong SHA silently destroys that.

**Machinery surface after round zero: ZERO new source-level assertions**, in both
halves. Nothing to grow.

## Round 1 — verdicts, dispositions and rulings

All five findings accepted; the orchestrator re-ran the two decisive ones and both
reproduced. The scope rule held — the routed section was explicitly empty for C2/C3,
and the one EYE-adjacent finding was argued as the HAND's own deployment claim rather
than smuggled across the boundary.

| # | Finding | Disposition |
|---|---|---|
| H-R1-1 | `wienerdog uninstall` recursively deletes `state/`, so relocated user data is destroyed — and `manifest.js:1113-1116` states the very invariant relocation breaks ("none user-authored") | **fix** (ruled) — minimal guard |
| H-R1-2 | `restoreVaultToHead` is a SECOND destructive primitive (`reset --hard` + `clean -fd`), named by the spec as its own fail-closed action | **fix** (ruled) — own path made preservation-aware; the CLI's sites routed |
| H-R1-3 | The absolute safety criteria were true only if the named race never fired | **fix** (ruled) — and a real guarantee was found |
| H-R1-4 | "Ships first and alone" contradicted the merge discipline, and a HAND-only interval lets a hostile `CLAUDE.md` reach tracked-and-clean, which the narrowed assert then trusts forever | **fix** (ruled) |
| H-R1-5 | Still larger than one session; 14 criteria, not the 13 the orchestrator reported | **successor charter** (ruled) |

### The rulings, as landed

1. **Uninstall: a MINIMAL guard inside the HAND.** `manifest.js` and its tests join
   the deliverables, narrowly: a destructive uninstall **loudly refuses** while
   `state/residue/` is non-empty, naming the entries and the ways to resolve them, and
   proceeds only on explicit confirmation. Return-to-original-path and any recovery
   surface belong to the lifecycle successor. Today's data-lie ends; the package does
   not become an uninstall refactor.
2. **"Ships FIRST" is build/review order; "and alone" is deleted.** The stacked merge
   is the only deployment truth. The new honest residual is recorded in BOTH specs: a
   vault may already carry a pre-fence hostile instruction file sitting
   tracked-and-clean, indistinguishable from the user's own — the EYE denies future
   writes but does not un-commit history. **Carried to the disclosure WP's detector
   list**, and recorded here so that WP's spec picks it up.
3. **The honest wording was the fallback — the real guarantee was reachable.**
   Measured: `fs.linkSync` refuses `EEXIST` against an occupied regular file, a
   **non-empty directory** and a symlink alike, leaving the occupant's bytes intact in
   every case. So the restore now **claims** its pathname atomically rather than
   checking-then-destroying, using HEAD bytes the validator already reads
   (`git show HEAD:<rel>` at `:340`, `:398`, `:555`) — no scope growth, roughly five
   lines. The residual narrows to what the claim genuinely does not cover: the
   temporary file's placement, and shapes with no exclusive-create primitive. **No
   whole-operation atomicity is claimed.**
4. **`restoreVaultToHead`:** the HAND makes its OWN total-failure path
   preservation-aware — best-effort relocation before any reset. The CLI's two
   existing call sites (`src/cli/dream.js:535`, `:550`) are today's behaviour and are
   a **named residual routed to the lifecycle successor**, not folded in.
5. **CHARTER — the residue-lifecycle successor WP:** journal schema, crash replay,
   uninstall return-to-original-path, the user-facing list/recover surface, and
   preservation-aware CLI abort paths. Queues behind group C beside the disclosure WP;
   final order decided when group C closes. **The HAND does not grow further — every
   new lifecycle requirement routes there.**

### Stop criterion — unchanged, restated because HEAVY fixes landed

Unchanged in substance, including the inherited family escalation verbatim: if a round
lands again on the **preservation/visibility family**, it returns to the owner as a
ruling request and **rethinking the package itself is on the table**. Surface stays at
ZERO new source-level assertions; scope stays frozen at the eye/hand boundary.

## Round 2 — THE FAMILY ESCALATION FIRES

Seven new findings; R1-1 NOT FIXED, R1-2/3/4 PARTIALLY FIXED. The scope rule held —
the routed section correctly separated the lifecycle successor, the EYE, C2 and C3.
The orchestrator re-ran the two decisive new measurements and **both reproduced**:

```text
exclusive alloc -> unlink -> occupant created -> renameSync
  dest afterwards: "source"          <- the occupant was overwritten

hard link: vault/denied.md == vault/alias.md
  mv vault/denied.md residue/entry.md ; write through vault/alias.md
  residue bytes: "WRITTEN THROUGH THE VAULT ALIAS"   nlink=2
```

So "Relocation never replaces" is false — `O_EXCL` allocation does not bind a later
pathname-based `renameSync`, and Node exposes no `RENAME_NOREPLACE`. And relocating a
hard-linked object moves a *pathname*, not the object: the vault alias keeps writing
into the residue inode, so residue is not isolated evidence.

**The pinned escalation fires.** This package's stop criterion, written before round 1
and inherited verbatim from the split ruling: *"if a round lands again on the
preservation/visibility family, it returns to the owner as a ruling request, and
rethinking the package itself is on the table."* Round 1 hit preservation (uninstall
destruction, `restoreVaultToHead`, the restore race). Round 2 hits it again on the
revised design (partial-relocation-then-reset, rename clobber, hard-link aliasing,
lost file mode). **No revision is made.**

Two findings are worth carrying into the owner's decision as design facts rather than
patches:

- **The journal schema cannot be deferred.** This package is its FIRST WRITER — it
  writes journal and index bytes, and Table C reads residue-index membership. A
  successor can own replay, migration and recovery UI; it cannot retroactively define
  bytes already on disk. The split of that one contract was wrong.
- **The uninstall guard cannot be enforced from where it was scoped.** Confirmation
  lives in `src/cli/uninstall.js` (`--yes` at `:40`, prompt at `:93-112`), and
  `manifestLib.reverse()` runs at `:114-118` **before** the guarded sweep at `:124-127`
  — so a guard inside `disposeCoreMechanics` refuses only after a partial uninstall,
  and `--yes` bypasses the only existing confirmation.
