---
id: WP-134
title: A1 documentation — hermetic runtime profile threat model, glossary terms, honest containment claims (audit A1)
status: Done
model: sonnet
size: S
depends_on: [WP-128, WP-129, WP-130, WP-131, WP-132, WP-133, WP-135]
adrs: [ADR-0004, ADR-0025]
branch: wp/134-a1-runtime-containment-docs
---

# WP-134: A1 documentation — hermetic runtime profile threat model, glossary terms, honest containment claims (audit A1)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons/servers/telemetry. Docs are
plain language for knowledge workers (CLAUDE.md); markdownlint must pass.

Audit action **A1** (ADR-0025) made every headless `claude -p` job hermetic: a
**code-owned hermetic runtime profile** — no ambient setting source, a hook-free
`--settings` profile with `disableAllHooks`, an empty or single-broker MCP, a staging
cwd, a vendored integrity-checked skill, a managed-policy preflight **warning** (WP-132),
run evidence, a dev-time **live** negative containment harness (WP-133), and a **runtime
containment self-check** that verifies the actually-installed Claude before each dream and
fails closed (WP-135, ADR-0025 Amendment 2). This WP makes the docs tell the truth about
that boundary, closing the audit's "required documentation changes": *describe
built-in/MCP containment separately from full process containment*, and *keep all
README/VISION/THREAT-MODEL claims mechanically traceable to the enforced boundary*.

Two hard terminology facts (ADR-0025):

1. **"Sandbox" is reserved** for `src/core/sandbox-guard.js` (the advisory
   `WIENERDOG_HOME`-redirect warning). The A1 boundary is a **hermetic runtime profile**
   / **capability profile** — the docs must stop calling the dream containment a
   "sandbox."
2. The claim is **agent containment, not native-malware protection** (00-SYNTHESIS
   boundary; ACTION-LIST A12) — and it is **verified at runtime before each dream** by a
   bounded live canary probe of the real hermetic composition that fails closed if the
   installed Claude no longer honors the flags (WP-135), not asserted only by argv strings
   or against a repo-pinned version.

This is the A1 analog of WP-127 (the A5 docs WP). It touches only docs.

## Current state

**`docs/THREAT-MODEL.md`** (226 lines) describes the dream containment as a "sandbox":

- **Line ~85 (T1 mitigations):** "the headless run is **tool-restricted — writes limited
  to the vault and the run's scratch directory, no Bash, no network** — so a fully
  hijacked dream can at worst write gated markdown…" — accurate on tools but silent on the
  now-closed hooks/plugins/settings hole and still calls it tool-restriction only.
- **Line ~108 & ~226:** already forward-reference "the runtime profile (A1)" and "the dream
  brain's sandboxed runtime" as the containment for a missed secret — the term "sandboxed"
  must become "hermetic runtime profile," and the claim must match what A1 actually enforces.
- **Line ~220 (residual):** "the sandbox denies Bash/network" — same rename + honesty pass.
- **T1** (line 50) and **T2** (line 81, "Dream job as confused deputy") are the sections
  whose containment prose this WP rewrites.

**`docs/GLOSSARY.md`** defines **routine**, **safety profile**, **capability gate**, and a
note reserving "sandbox" for the redirect guard — but has **no** entry for **hermetic
runtime profile** / **capability profile** / **staging directory** / **run evidence**.

**`README.md`** / **`docs/VISION.md`** may contain containment claims ("no Bash", "no
network", "sandboxed") that must be reconciled to the enforced hermetic profile and the
native-malware non-goal. Grep them; only change claims that are now inaccurate.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/THREAT-MODEL.md | rewrite T1/T2 containment prose + the "sandbox"→"hermetic runtime profile" renames + the residual bullets; add the native-malware honesty + the runtime-self-verified (WP-135) + managed-hook-WARNING framing; add an A1 boundary paragraph |
| modify | docs/GLOSSARY.md | add **hermetic runtime profile**, **capability profile**, **staging directory**, **run evidence**, **containment self-check**; cross-link the reserved-"sandbox" note |
| modify | README.md | reconcile any containment claim to the enforced hermetic profile (only if inaccurate) |
| modify | docs/VISION.md | same reconciliation (only if a claim is now inaccurate) |

> If a grep shows README.md / VISION.md carry **no** containment claim needing change,
> leave them untouched and note that under "Decisions made" (do not edit for its own sake).

### Exact content requirements

**1. `docs/THREAT-MODEL.md`.**

- Replace every "sandbox"/"sandboxed" used for the **dream/routine execution containment**
  with **hermetic runtime profile** (leave any reference to `sandbox-guard.js`'s redirect
  warning as "sandbox" — distinguish the two explicitly once).
- Rewrite the T1/T2 containment mitigation to state, precisely and traceably:
  - the run loads **no ambient user/project/local settings** (no inherited hooks or
    plugins) and uses a **dedicated hook-free settings profile** (`disableAllHooks`);
  - built-ins are an **explicit non-empty allowlist** — the primary restriction (dream:
    Read/Write/Edit/Glob/Grep; a routine: a minimal set such as Read) — with a redundant
    deny list naming the known escalation tools (Bash, WebFetch, WebSearch, Task, Agent,
    Skill, Workflow, NotebookEdit); **MCP is empty** (dream) or **a single local broker**
    (a routine, via A2);
  - the brain runs from a **fresh staging directory**, writes only the vault (dream) /
    staging (routine), and reads inputs only via bounded snapshots;
  - the skill body is **vendored and integrity-checked**;
  - an enterprise/admin **managed-policy hook** (which a user/project/local `disableAllHooks`
    cannot disable) is **detected read-only, warned about loudly on the durable channel, and
    recorded in run evidence — and the run PROCEEDS**. It does **not** STOP: a managed hook is
    the administrator's own deliberate config, **not reachable by attacker transcript/email
    content**, so it is a **documented trusted-computing-base residual** (same shelf as A12
    same-user native code and A7 executable integrity), not an A1 attacker vector. The
    requirement is that the non-hermetic state be *visible*, not that the run be refused (WP-132);
  - **run evidence** records the version/executable/profile/argv/digests (and the
    managed-policy state and the containment self-check result);
  - containment is **verified at runtime before each dream**: a bounded live canary probe of
    the real hermetic composition runs and **fails closed** (the dream halts, durable alert)
    if the actually-installed Claude no longer honors the containment flags (WP-135).
- **Separate built-in/MCP containment from full process containment** and state the proof
  honestly: containment is **runtime-self-verified** — the pre-dream self-check (WP-135)
  validates the *actually-installed* Claude before each run and halts fail-closed on a break,
  rather than being certified only against a repo-pinned version (a deployed user never
  rebuilds the repo, and Claude auto-updates fast, so a pinned constant goes stale immediately
  — ADR-0025 Amendment 2). The **dev-time** comprehensive hostile-fixture proof (WP-133,
  including the config-mutating inherited-hook test) complements it; `supported-claude.js` is
  only a dev-time "last tested version" record, not a production pin. Containment contains the
  **agent** (a hijacked brain gets no Bash/network/MCP/hook/secret-read), and it is **not** a
  boundary against arbitrary same-user native code (A12) or against a swapped/mutated `claude`
  executable (**A7**). The self-check is a live tripwire on the same flags the real dream
  depends on — a canary, not an exhaustive proof.
- Update the T1 residual bullet (line ~220) and the A5 secret-residual bullet (line ~226)
  wording that references "the sandbox denies Bash/network" / "the runtime profile (A1)" to
  match the enforced hermetic profile.

**2. `docs/GLOSSARY.md`.** Add, in the existing style (term — definition, "(Not: …)"):

- **hermetic runtime profile** — the code-owned set of capabilities a headless model job
  runs under (built-in tools, deny list, MCP posture, hook-free settings, staging cwd,
  filesystem roots), composed by Wienerdog and never inherited from ambient config
  (ADR-0025). (Not a "sandbox" — that word means the `WIENERDOG_HOME`-redirect guard,
  `sandbox-guard.js`.)
- **capability profile** — a synonym for a specific hermetic runtime profile
  (`dream`, `daily-digest`, …) as defined in `src/core/runtime-profile.js`.
- **staging directory** — the fresh, empty, Wienerdog-owned working directory a hermetic
  job runs in (and, for a routine, its only writable output), so no project/local settings
  are discovered under the cwd.
- **run evidence** — the bounded, secret-free per-run record (Claude version, executable,
  profile, argv, settings/MCP digests, managed-policy state, containment self-check result)
  written to `state/run-evidence.jsonl` (ADR-0025).
- **containment self-check** — the bounded live canary probe of the real hermetic
  composition that runs before each dream and fails closed (halts + durable alert) if the
  installed Claude no longer honors the containment flags (WP-135, ADR-0025). Verifies the
  actual local runtime, not a repo-pinned version.

**3. README.md / VISION.md.** Only where a claim is now inaccurate: reword "sandboxed dream
/ no Bash / no network" to the honest enforced statement — "each nightly/scheduled run has
a code-owned capability profile: no shell, no arbitrary network, no inherited hooks or
plugins; it is agent containment, not protection from software already running as you."
Keep it plain-language.

## Implementation notes & constraints

- **Docs must match the SHIPPED bytes** (WP-127 lesson). Every claim you write must be
  traceable to what WP-128..WP-133 actually enforce — read those specs' final state / the
  merged code before writing; do not describe an intended-but-unbuilt behavior (e.g. if a
  routine broker is A2-deferred, say routines are *contained but not yet functional*, not
  "routines securely email you").
- **Do not overclaim.** The live-proof + native-malware-non-goal + A7-executable-integrity
  caveats are load-bearing — the audit's whole posture is honesty about the boundary.
- **No new ADR** — ADR-0025 is the decision; this WP documents it for users.
- Plain language, markdownlint clean, GLOSSARY terms used exactly.

## Acceptance criteria

- [ ] `docs/THREAT-MODEL.md` no longer calls the dream/routine execution containment a
      "sandbox"; T1/T2 describe the hermetic runtime profile precisely (no ambient
      settings, hook-free profile, explicit non-empty tool allowlist as the primary
      restriction + redundant deny list (Bash/WebFetch/WebSearch/Task/Agent/Skill/Workflow/
      NotebookEdit), empty/single-broker MCP, staging cwd, vendored integrity-checked skill,
      the **managed-policy hook WARNING + documented-residual** posture (detect + warn +
      record + proceed, NOT a STOP), run evidence, and the **pre-dream runtime containment
      self-check that fails closed**); built-in/MCP containment is stated separately from full
      process containment; the proof is described as **runtime-self-verified** (WP-135), NOT a
      pinned-version certification; the native-malware (A12) + executable-integrity (A7)
      caveats are present.
- [ ] The docs contain **no** claim that a managed/admin-policy hook STOPs or refuses a run
      (it warns + records + proceeds), and **no** claim that containment is certified against
      a pinned Claude version (it is verified at runtime before each dream).
- [ ] `docs/GLOSSARY.md` defines **hermetic runtime profile**, **capability profile**,
      **staging directory**, **run evidence**, and **containment self-check**, and preserves
      the reserved-"sandbox" note.
- [ ] README.md / VISION.md contain no inaccurate containment claim (either reconciled or
      confirmed-unaffected and noted).
- [ ] A grep for "sandbox" in THREAT-MODEL.md returns only the intentional
      `sandbox-guard.js`-redirect reference(s), each clearly distinguished from the hermetic
      runtime profile.
- [ ] `wienerdog safety` shows all five gates BLOCKED (docs-only WP; no code touched).
- [ ] `npm run lint` passes (markdownlint).

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
grep -n "sandbox" docs/THREAT-MODEL.md          # only the sandbox-guard redirect reference(s)
grep -n "hermetic runtime profile\|capability profile" docs/GLOSSARY.md
node bin/wienerdog.js safety                     # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- Any code change (this is docs-only) — the machinery is WP-128..WP-133 + WP-135.
- Documenting the A2 GWS broker's user-facing behavior — **A2's** docs WP.
- Rewriting A5/A6/A3/A4/A0 sections beyond the "sandbox"→"hermetic runtime profile" rename
  where those sections reference the dream containment.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/134-a1-runtime-containment-docs`; conventional commits; PR titled
   `docs(security): A1 hermetic runtime profile threat model + glossary (WP-134)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
