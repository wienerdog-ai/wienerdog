---
id: WP-158
title: A7 documentation — honest scheduler/app/executable integrity claims, threat model, glossary, runbook
status: Draft
model: sonnet
size: M
depends_on: [WP-153, WP-154, WP-155, WP-156]
adrs: [ADR-0004, ADR-0013, ADR-00XX-a7-executable-integrity]
branch: wp/158-a7-integrity-docs
---

# WP-158: A7 documentation (audit A7, part 6 of 6)

## Context (read this, nothing else)

A7 hardens the integrity of Wienerdog's unattended nightly run: external
executables are **pinned** to verified absolute paths (WP-153), the test-exec
seams are **inert in production** (WP-154), each scheduled job has a **canonical
digest-bound descriptor** (WP-155), and an **out-of-tree launcher** verifies the
app + descriptor before spawning (WP-156). This WP writes the honest, traceable
documentation for that work, closing the audit's "Required documentation changes"
for the scheduler/app/executable boundary: **every claim must trace to a shipped
mechanism**, and the arbitrary-same-user-malware non-goal must be stated plainly.
**IRON RULE (ADR-0004): Wienerdog is just files.**

This is a docs-only WP (mirroring WP-143 for the A2 broker): no product code, no
golden fixtures, no CLI-string pins. If a claim needs a code change to be true,
that is a spec-gap back to wd-architect — do not soften the docs to match, or the
code to match aspirational docs.

**Honest boundary (this is the central message of the docs, not a footnote to
hide).** Same-user control of BOTH the core and the OS scheduler can still
replace both anchors. A7 protects **scoped core writes** (a limited file-write
primitive or an agent session that can write `config.yaml`, `app/current`, or
`~/.local/bin` but cannot re-register the OS scheduler entry) and **detects
drift**; it is **NOT** a claim against arbitrary same-user native malware — that
is A12's territory. The docs must say this in plain language and must not let any
sentence overreach it (no "your scheduled AI can never be tampered with").

> **ADR note:** `ADR-00XX-a7-executable-integrity` is a **placeholder — PENDING
> owner number assignment.** The owner assigns the number (or extends ADR-0027)
> before this spec goes Ready; this docs WP references the decision by its final
> number once assigned, and must NOT invent one.

## Current state

- `docs/THREAT-MODEL.md` — the security boundary document; has threat entries per
  audit area (e.g. T4/T4a for the A2 broker, per WP-143). No entry yet frames the
  scheduler/app/executable integrity boundary (the F1–F5 findings).
- `docs/ARCHITECTURE.md` — describes the scheduler, vendored install (ADR-0013),
  and run-job lifecycle; does not describe the descriptor, launcher, or pins.
- `docs/GLOSSARY.md` — canonical names (vault, dream, routine, digest, managed
  block, work package, core, …); no A7 terms.
- `README.md` / `docs/VISION.md` — user-facing claims about unattended dreaming;
  no scoped statement of the integrity boundary.
- `docs/runbooks/` — holds operator runbooks (e.g. the WP-143 `gws-broker.md`,
  `codex-review.md`); no executable/scheduler-integrity runbook.
- The shipped A7 mechanisms (WP-153..WP-156) are the only source of truth for what
  the docs may claim.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/THREAT-MODEL.md | Add the scheduler/app/executable-integrity threat entry: the F1–F5 threats, what A7 enforces (pins, descriptor+digest, out-of-tree launcher, prod/dev stance, inert seams), and the honest scoped-write-vs-A12 residual. |
| modify | docs/ARCHITECTURE.md | Describe the descriptor → digest → OS-entry binding → launcher verify → run-job flow, executable pinning, and the read-only version dir; cross-reference ADR-0013 and the A7 ADR (by final number once assigned). |
| modify | docs/GLOSSARY.md | Add `job descriptor`, `descriptor digest`, `app release digest` (app tree content address), `independent launcher`, `executable pin`, `production/dev stance`. |
| modify | README.md | Scope the unattended-dreaming claim to the enforced launcher/pin path; add the one-line same-user-native (A12) non-goal. |
| modify | docs/VISION.md | Align the unattended-integrity language with the enforced mechanisms; no absolute "cannot be tampered" overclaim. |
| create | docs/runbooks/scheduler-and-executable-integrity.md | Operator runbook: what a drift/mismatch alert means, how to re-pin (`wienerdog sync`), how to legitimately update Claude/Git/the app, what `doctor` reports, and what the boundary does/does not cover. |

### Content requirements (traceable claims only)

**THREAT-MODEL entry — the honesty core.** State plainly:

- The registered OS scheduler entry is **static**; what it runs is (a) the code
  under `app/current` and (b) the `run` action in `config.yaml`. A7 makes both
  **integrity-checked at fire time** rather than trusted.
- Each scheduled job has a **canonical, code-owned descriptor** (its `run` action,
  capability profile, prompt/skill hash, timeout, vault root, the absolute
  executable identities, and the app release digest), reduced to a **descriptor
  digest** that is **bound into the OS scheduler entry**. Runtime edits to
  `config.yaml` or the app tree do **not** change what runs until an explicit
  `wienerdog sync` re-binds — a mismatch **fails closed** (a fixed alert, zero
  model spawn).
- A **minimal launcher outside the mutable app tree** verifies `current`
  containment + ownership, the app content address, the descriptor digest against
  the entry-bound value, and the **production-vs-dev stance** before it spawns.
- Claude/Git/Codex are **resolved to verified absolute paths at install/sync and
  pinned**; a fake planted earlier on `PATH` (e.g. in the user-writable
  `~/.local/bin` that the clean job `PATH` front-loads) is refused on realpath
  drift, and a legitimate update **fails safe** until re-pinned.
- The production test-exec seams (`WIENERDOG_RUNJOB_CMD`, `WIENERDOG_DREAM_CMD`)
  are **inert without `WIENERDOG_TEST=1`** and every dispatch is **`shell:false`**.
- **Honest residual (A12):** this protects **scoped core writes** and **detects
  drift** between attended `sync`s; it is **not an OS boundary**. A same-user
  *native* actor who can rewrite the OS scheduler entry AND the launcher/app can
  replace both anchors — that is A12's territory, a different design (root-/
  publisher-anchored launcher, OS user-presence), not a local-file tweak. Do not
  imply the scheduled run is tamper-proof against same-user native code.

**GLOSSARY additions (canonical names — never invent synonyms elsewhere):**
- **job descriptor** — the code-owned, deterministic record of exactly what a
  scheduled job is authorized to run (run action, capability profile,
  prompt/skill hash, timeout, vault root, absolute executable identities, app
  release digest); written at schedule/sync and re-derivable to detect drift
  (WP-155).
- **descriptor digest** — the sha256 of the canonicalized job descriptor, bound
  into the OS scheduler entry as the independent anchor a scoped `config.yaml`/app
  rewrite cannot change.
- **app release digest** — the content address (sha256 over the sorted per-file
  hashes) of the vendored `app/current` tree, recorded in the descriptor and
  re-verified at fire time.
- **independent launcher** — the minimal Node launcher at `<core>/launcher/
  launch.js`, **outside** the mutable `app/current` tree, that verifies integrity
  before spawning `run-job` (WP-156); it is not a daemon (ADR-0004) — it runs and
  exits with each fire.
- **executable pin** — the recorded verified identity (absolute realpath, version,
  size, content hash) of `claude`/`git`/`codex`, captured at install/sync; the
  nightly job spawns the pinned absolute path and fails safe on drift (WP-153).
- **production/dev stance** — whether an install runs the vendored `app/<version>`
  (prod, integrity-enforced) or a dev checkout (dev, mutable-by-design); the
  launcher refuses a prod entry that resolves to a dev-looking tree, so a planted
  `.git` cannot downgrade verification.

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-A7-CLAIM-WORDING** — the exact README/VISION sentence scoping the
  unattended-integrity claim to the enforced launcher/pin path, with the one-line
  A12 non-goal footnote (mirror the WP-143 D-CLAIM-WORDING resolution: name the
  enforced path, add the honest same-user-native footnote, do not full-retreat).
- **D-A7-ADR-REF** — whether the docs reference a **new** A7 ADR or an **extended
  ADR-0027**; the docs cite the final number the owner assigns (this WP must not
  bake in a guessed number).

## Implementation notes & constraints

- **Prose only.** No product code, no golden fixtures, no CLI-string pins. A claim
  that needs a code change is a spec-gap back to wd-architect.
- **Every claim traces to a mechanism** in WP-153..WP-156. Where the boundary is
  scoped-write-detection (not an OS boundary), say so — do not imply cryptographic
  or OS-level unforgeability.
- **Keep "sandbox" reserved** for `sandbox-guard.js`; the launcher is an
  "independent launcher," never a "sandbox."
- **User-facing plain language (CLAUDE.md):** the runbook is for a knowledge
  worker — explain "re-pin after updating Claude" and "why a drift alert fired" in
  plain terms.
- Use GLOSSARY names exactly; do not introduce synonyms for descriptor / launcher /
  pin / app release digest.
- When uncertain, choose the simpler wording and record it under "Decisions made".

## Security checklist (docs)

- [ ] No doc claims a protection the shipped A7 code does not enforce. The
      unattended-integrity claim is scoped to the enforced launcher/pin path; the
      A12 same-user-native residual, the "detects drift between attended syncs, not
      an OS boundary" framing, the prod/dev stance guard, and the inert-seam /
      `shell:false` facts are all stated. "Sandbox" is not used for the launcher.

## Acceptance criteria

- [ ] `docs/THREAT-MODEL.md` describes the scheduler/app/executable integrity
      threat + what A7 enforces + the honest A12 residual (no "tamper-proof against
      same-user code" claim). (read)
- [ ] `docs/GLOSSARY.md` defines all six A7 terms; no synonym for them appears in
      the changed docs. (read/grep)
- [ ] README/VISION unattended-dreaming claims are scoped to the enforced
      launcher/pin path with the A12 non-goal one-liner (no absolute "cannot be
      tampered"). (read)
- [ ] `docs/ARCHITECTURE.md` describes the descriptor→digest→entry→launcher→run-job
      flow and executable pinning. (read)
- [ ] `docs/runbooks/scheduler-and-executable-integrity.md` covers drift/mismatch
      alerts, re-pinning via `wienerdog sync`, legitimate Claude/Git/app updates,
      and the boundary. (read)
- [ ] `wienerdog safety` shows all five P0 gates BLOCKED (untouched). `npm run
      lint` (markdown + frontmatter) passes.

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
grep -n "job descriptor\|descriptor digest\|independent launcher\|executable pin\|app release digest\|production/dev stance" docs/GLOSSARY.md
grep -n "descriptor\|launcher\|pin" docs/THREAT-MODEL.md docs/ARCHITECTURE.md
grep -n "enforced\|A12\|same-user" README.md docs/VISION.md
test -f docs/runbooks/scheduler-and-executable-integrity.md && echo "runbook present"
node bin/wienerdog.js safety      # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- Any product code, CLI message, or golden fixture — docs only (a needed code
  change is a spec-gap back to wd-architect).
- Writing the A7 ADR itself — the owner assigns its number/scope; this WP only
  references it once numbered.
- The A8/A13 uninstall/manifest docs (WP-144..WP-152 areas) and the A2 broker docs
  (WP-143).
- Opening any P0 capability gate — never in A7.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/158-a7-integrity-docs`; conventional commits; PR titled
   `docs(security): honest A7 scheduler/app/executable integrity claims + runbook (WP-158)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
