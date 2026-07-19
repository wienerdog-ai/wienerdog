---
id: WP-159
title: A7 documentation — honest scheduler/app/executable integrity claims, threat model, glossary, runbook
status: In-Review
model: sonnet
size: M
depends_on: [WP-154, WP-155, WP-156, WP-157, WP-160]
adrs: [ADR-0004, ADR-0013, ADR-0028]
branch: wp/159-a7-integrity-docs
---

# WP-159: A7 documentation (audit A7, part 6 of 6)

## Context (read this, nothing else)

A7 hardens the integrity of Wienerdog's unattended nightly run: external
executables are **pinned** to verified absolute paths (WP-154), the production
dispatch code carries **no test-exec seams at all** (WP-155 deletes them — test
substitution happens only via JS-only injected dependencies and pin-store-installed
fakes, and every dispatch is `shell:false`), each scheduled job has a **canonical
digest-bound descriptor** (WP-156), and an **out-of-tree launcher** verifies the
app + descriptor before spawning (WP-157). This WP writes the honest, traceable
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
`~/.local/bin` but can neither re-register the OS scheduler entry nor overwrite the
independent launcher at `<core>/launcher/launch.js` — a core-wide write that reaches
the launcher defeats this layer alone, A12) and **detects
drift**; it is **NOT** a claim against arbitrary same-user native malware — that
is A12's territory. The docs must say this in plain language and must not let any
sentence overreach it (no "your scheduled AI can never be tampered with").

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027. This docs WP references the
> decision by that number; the ADR-0028 file is written as the A7 walkthrough
> concludes.

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
- The shipped A7 mechanisms (WP-154..WP-157) are the only source of truth for what
  the docs may claim.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/THREAT-MODEL.md | Add the scheduler/app/executable-integrity threat entry: the F1–F5 threats, what A7 enforces (pins, descriptor+digest, out-of-tree launcher, prod/dev stance, no test-exec seams), and the honest scoped-write-vs-A12 residual. |
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
  capability profile, prompt/skill hash, timeout, configured model, vault root, the
  absolute executable identities, and the app release digest), reduced to a **descriptor
  digest** that is **bound into the OS scheduler entry**. Runtime edits to
  `config.yaml` or the app tree do **not** change what runs until an explicit
  `wienerdog sync` re-binds — a mismatch **fails closed** (a fixed alert, zero
  model spawn).
- A **minimal launcher outside the mutable app tree** verifies `current`
  containment + ownership, the app content address, the descriptor digest against
  the entry-bound value, and the **production-vs-dev stance** before it spawns.
- Claude/Git/Codex are **resolved and structurally pinned at install/sync** (by
  command path + install dir, with structural verification at spawn); a fake
  planted earlier on `PATH` (e.g. in the user-writable `~/.local/bin` that the
  clean job `PATH` front-loads) is refused on command-path/install-dir drift. A
  routine auto-update (new version file under the same install dir) passes
  silently; an install-method change (e.g. → Homebrew) **fails safe** until
  re-pinned.
- The dispatch code carries **no test-exec seams**: WP-155 **deletes**
  `WIENERDOG_RUNJOB_CMD`, `WIENERDOG_DREAM_CMD`, and the probe env seams
  (`WIENERDOG_SKIP_CONTAINMENT_PROBE`, `WIENERDOG_CONTAINMENT_PROBE_CMD`). No
  `WIENERDOG_TEST` gate exists. Test substitution happens only through JS-only
  injected dependencies and pin-store-installed fakes; every dispatch is
  **`shell:false`**, and **no environment variable** can substitute an executable or
  skip the containment probe.
- **Honest residual (A12):** this protects **scoped core writes** and **detects
  drift** between attended `sync`s; it is **not an OS boundary**. The independent
  launcher is itself a core file (`<core>/launcher/launch.js`), so a same-user
  *native* actor with a **core-wide write** — e.g. one that overwrites the
  launcher itself — defeats this layer **alone**, without even touching the OS
  scheduler entry; that is A12's territory, a different design (root-/
  publisher-anchored launcher, OS user-presence), not a local-file tweak. Do not
  imply the scheduled run is tamper-proof against same-user native code, and do
  not imply the launcher is protected against a write that reaches the launcher
  file.

**GLOSSARY additions (canonical names — never invent synonyms elsewhere):**
- **job descriptor** — the code-owned, deterministic record of exactly what a
  scheduled job is authorized to run (run action, capability profile,
  prompt/skill hash, timeout, configured model, vault root, absolute executable
  identities, app release digest); written at schedule/sync and re-derivable to
  detect drift (WP-156).
- **descriptor digest** — the sha256 of the canonicalized job descriptor, bound
  into the OS scheduler entry as the independent anchor a scoped `config.yaml`/app
  rewrite cannot change.
- **app release digest** — the content address (sha256 over the sorted per-file
  hashes) of the vendored `app/current` tree, recorded in the descriptor and
  re-verified at fire time.
- **independent launcher** — the minimal Node launcher at `<core>/launcher/
  launch.js`, **outside** the mutable `app/current` tree, that verifies integrity
  before spawning `run-job` (WP-157); it is not a daemon (ADR-0004) — it runs and
  exits with each fire.
- **executable pin** — the recorded structural identity (stable command path +
  install dir; `version` informational only, no content hash) of
  `claude`/`git`/`codex`, captured at install/sync; the nightly job spawns the
  live verified absolute path and fails safe on command-path/install-dir drift
  (WP-154).
- **production/dev stance** — whether an install runs the vendored `app/<version>`
  (prod, integrity-enforced) or a dev checkout (dev, mutable-by-design); the
  launcher refuses a prod entry that resolves to a dev-looking tree, so a planted
  `.git` cannot downgrade verification.

## Decisions resolved in the walkthrough

- **D-A7-CLAIM-WORDING — RESOLVED (OWNER-APPROVED 2026-07-19, A7 walkthrough): scoped
  "verified before they run" claim + boundary footnote.** README carries the claim
  **verbatim** (the implementer pastes it); VISION gets the **same substance adapted to
  its voice** — that adaptation license is granted here, but the mechanism claims and
  the non-goal must survive the adaptation unchanged. Verbatim README text:

  > **Scheduled runs are verified before they run.** At every nightly fire, an
  > independent launcher first checks that the app's code matches its recorded content
  > address and that the job still matches its digest-bound authorization descriptor;
  > Claude and Git are only spawned from their pinned, structurally verified install
  > locations. Edits to `config.yaml` or the app tree made outside `wienerdog sync`
  > don't change what runs — the job refuses with an alert instead (fail closed; the
  > fix is one `wienerdog sync`).

  Plus the boundary footnote (verbatim, both files):

  > *Boundary, stated plainly: this protects against scoped file writes and detects
  > drift between syncs. It is not a defense against arbitrary same-user native
  > malware — that requires OS-level anchoring (see THREAT-MODEL).*

  **Rationale:** leads with the capability claim ("verified before they run"), states
  fail-closed plus the one-command remedy in user language, and names the non-goal
  without publishing an attack recipe — mirroring WP-143's D-CLAIM-WORDING pattern
  (name the enforced path, add the honest same-user-native footnote, do not
  full-retreat).

- **D-A7-ADR-REF — RESOLVED (OWNER-APPROVED 2026-07-19, A7 walkthrough): the docs cite
  the new ADR-0028.** The A7 architectural decision lives in a **new** ADR-0028
  (owner-assigned 2026-07-18, reconfirmed at the 2026-07-19 walkthrough close),
  distinct from ADR-0027 (A8's re-derived scheduler *unload*); the "extend ADR-0027"
  alternative was rejected. This WP cites **ADR-0028** (see the ADR note above and the
  `adrs:` frontmatter); the ADR-0028 file is written as the A7 walkthrough concludes.

## Implementation notes & constraints

- **Prose only.** No product code, no golden fixtures, no CLI-string pins. A claim
  that needs a code change is a spec-gap back to wd-architect.
- **Every claim traces to a mechanism** in WP-154..WP-157. Where the boundary is
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
      an OS boundary" framing, the prod/dev stance guard, and the seam-deletion /
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
2. Branch `wp/159-a7-integrity-docs`; conventional commits; PR titled
   `docs(security): honest A7 scheduler/app/executable integrity claims + runbook (WP-159)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.

## Fix-pass amendments (2026-07-19)

Review found the docs overclaim relative to the code; several claims traced back
to code gaps now fixed in WP-154..WP-158. This WP lands **last** and must
describe the **fixed** code. Full context: `FIX-PLAN.md` cluster **C5**.

- **A1 — catch-up config drift [Codex HIGH → fixed in WP-157 A5].** After the
  WP-157 catch-up per-job-descriptor fix, "config drift ⇒ zero model spawn" holds
  on catch-up too — but the docs must state that catch-up is verified **per job**
  (not app-tree-only). If WP-157 A5 is split to WP-160 and not yet landed, scope
  the claim to the normal fire and name catch-up as a pending gap. Do not
  overclaim.
- **A2 — "every scheduled spawn is pinned" is false [Codex HIGH].** Scope the pin
  claim to the **dream brain (claude/codex), the vault commit (git), and the
  containment probe**. Do NOT claim routines are pinned — `routine-runtime.js`
  returns bare `command:'claude'` and routine pinning is explicitly deferred
  (WP-154 out-of-scope; frozen routines). Add: "routine-runtime pinning is a
  documented follow-up."
- **A3 — re-pin recovery [= WP-156 A1].** The "one `wienerdog sync` recovers"
  claim is true only after the WP-156 ordering fix; safe to keep once it lands.
- **A4 — doctor↔A7 gap + refuse-text surface [wd/Codex P2]. DECISION.** `doctor`
  reads no A7 state (`alerts.jsonl`/pins/descriptor — confirmed). The durable
  alert surfaces in the **digest banner** (`digest.js` reads `alerts.jsonl`).
  **Owner-ethos decision (simplest):** the runbook and the WP-157 refuse text
  point to the **digest banner + `wienerdog sync`**, NOT `wienerdog doctor`. A
  `doctor` A7 reader is **not** built in this pass; it is a follow-up (candidate
  **WP-162: doctor reads A7 alert/pin/descriptor state**). Record this decision
  and the follow-up here. Add a verification grep asserting the runbook does not
  name `wienerdog doctor` as the A7 alert surface.
- **A5 — enforcement reductions [Codex MED].** State them where guarantees are
  made: **dev** stance skips the app-tree byte digest (but still verifies the
  descriptor digest + containment, per WP-157 A3); **Windows** has reduced POSIX
  guarantees (`verifyExecutable` win32 returns early — no owner/mode/ancestor).
- **A6 — verify-to-use race [Codex MED, = WP-157 A7].** Add the hash-then-reopen
  / verify-to-use TOCTOU to the THREAT-MODEL residuals, alongside the
  launcher-file-write (2b) residual — an honest, deferred A12 item.
- **A7 — GLOSSARY.** Add `vault layout` to the digest-covered field list in the
  `job descriptor` definition (WP-156 A2).

### Round-2 follow-through (2026-07-19)

- **[R2:F12] Catch-up hardening is split to WP-160.** Until WP-160 lands, the docs
  must state plainly that **catch-up is not yet fail-closed per job** — do not
  claim the config-drift guarantee for the catch-up path. Once WP-160 lands,
  update to "catch-up verifies each due job against a digest bound into the
  catch-up registration (not the editable entry file)."
- **[R2:F5] Digest-covered knobs.** The `job descriptor` glossary/threat-model
  list of digest-covered inputs is `run`, `model`, effective timeout (inner +
  outer), `vault_layout`, `dream_max_input_bytes`, prompt/skill hash, exec pins,
  app release digest — state this set. Also state that `WIENERDOG_FAKE_TODAY` /
  `WIENERDOG_RUNJOB_TIMEOUT_MS` are **deleted** from production (no env can shift
  the scheduled date/timeout), and the date derives from the system clock.
- **[R2:F10] Dev.** State that a dev-stance install is verified by a
  **config-fields-only** digest (tracked-source edits do not refuse) + a
  bound-checkout-root containment, and supports git worktrees (`.git` as a file).

### Round-3 follow-through (2026-07-19)

- **[R3:#3] Schedule coverage.** Add the job's **schedule (`at` + timezone)** to
  the stated digest-covered set; a schedule rewrite now requires `wienerdog sync`
  (an `at` edit is refused, not silently re-timed/suppressed).
- **[R3:#4] Scheduled-environment allowlist.** State that the scheduled dream runs
  in a **defined environment**: config roots (`CLAUDE_CONFIG_DIR`/`CODEX_HOME`)
  are reconstructed to the canonical wienerdog-owned paths, not inherited; the
  scheduled run does not depend on an inherited `ANTHROPIC_API_KEY` (subscription
  auth, ADR-0009). An `environment.d`/`launchctl` write cannot change the model
  account, credential root, or config root.
- **[R3:#1] Heal verify→register race** — add to THREAT-MODEL residuals alongside
  the launcher verify-to-use race: the sync-time heal regenerates + verifies a
  canonical scheduler file, but registration reopens the path; an active
  concurrent writer at heal time (A12) could swap it. A *static* planted file is
  defeated. Do not claim the scheduler receives the exact verified bytes.
- **[R3:#2] Catch-up.** Because WP-159 now `depends_on: WP-160`, the docs may
  state catch-up is fail-closed per job only if WP-160 has landed; otherwise name
  it as a pending gap (see the round-2 A1 note).
- **[R4:#2] Bound home.** The scheduled-environment claim must include that the
  **home directory** (parent of the credential/config roots) is bound at
  registration + digest-covered, so a hostile ambient `HOME` cannot relocate the
  model's credential/config account.
- **[R4:#1] Catch-up alerts, not silent suppression.** State (once WP-160 lands)
  that catch-up authorizes the full job set before deciding due-ness, so an `at`
  rewrite or a job removal produces an alert rather than a silent skip.
