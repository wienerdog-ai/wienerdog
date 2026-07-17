---
id: WP-113
title: Document the A0 pre-use safety freeze (threat-boundary docs)
status: Ready
model: sonnet
size: M
depends_on: [WP-109, WP-110, WP-111, WP-112]
adrs: [ADR-0004, ADR-0007]
branch: wp/113-a0-threat-boundary-docs
---

# WP-113: Document the A0 pre-use safety freeze (threat-boundary docs)

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). A 2026-07-15 security audit's first action
("A0 — ship a fail-closed pre-use safety profile") is now enforced in code:

- **WP-109** added a code-owned **safety profile** (`src/core/safety-profile.js`)
  with five **capability gates**, all BLOCKED, no runtime/env/flag override, and a
  `wienerdog safety` preflight that reports each gate.
- **WP-110** froze **Google setup** (`gws auth`) and **GWS credential use** (all
  `gws` verbs) — they fail closed before a token is loaded or the browser opens.
- **WP-111** froze **external-content skill routines** — `schedule add --skill`
  and the `run-job` skill-dispatch path fail closed before a model is spawned.
- **WP-112** froze **daily-Summary injection** (removed from the digest) and
  **automatic identity activation** (the dream may not change the four injected
  identity files).

The docs still describe these features as available and make security claims that
are now broader than what is enforced. The audit's "required documentation
changes" say to **keep every README/VISION/THREAT-MODEL claim mechanically
traceable to a real gate**. This WP updates the user- and threat-facing docs to
state the freeze honestly and point to `wienerdog safety`. It is a **docs-only**
WP — no code changes.

The claims to scope (audit "Required documentation changes", A0-relevant subset):
- "AI can never self-authorize a send / never widen its own permissions" → scope
  to the enforced grant/CLI path AND note that GWS is currently **frozen off**
  entirely (a stronger, temporary statement).
- Google Workspace, scheduled routines, and automatic identity evolution are
  presented as available → mark them **disabled pending the pre-use security
  review**, discoverable via `wienerdog safety`.
- Do **not** rewrite claims for audit actions beyond A0 (the broader
  secret-detection, broker, and parser docs belong to A2–A6 WPs).

## Current state

- **`README.md`** — the "What you get" list presents **Google Workspace senses**
  (*optional*) and **Laptop-friendly routines** (*optional, pick from a catalog*)
  as working features; the dreaming bullet says dream-created skills "keep
  learning". No mention of a pre-use freeze.
- **`docs/VISION.md`** — "What we will not do" includes: *"No sending without a
  grant … The AI can never widen its own permissions."* The product paragraph
  lists Google Workspace senses and the routine catalog as part of the stack.
- **`docs/THREAT-MODEL.md`** — sections T1–T7 exist; **T4a** ("Outbound sending as
  an exfiltration channel", ADR-0007) states sending executes only under a grant.
  There is **no** section describing the pre-use capability freeze. The header says
  "Status: v1 baseline … Finalized against the real implementation in M7."

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/THREAT-MODEL.md | add a new **T0 — Pre-use safety profile (fail-closed freeze)** section; add a one-line freeze note to T4a |
| modify | docs/VISION.md | scope the "never widen its own permissions" claim; note GWS/routines/identity-auto are frozen pending review |
| modify | README.md | mark Google/routines/identity-auto as disabled pending the pre-use safety review; mention `wienerdog safety` |

### Exact contracts

**1. `docs/THREAT-MODEL.md` — add a new top section T0** (place it immediately
after "Trust boundaries", before "T1"), worded ~as:

> ## T0 — Pre-use safety profile (fail-closed freeze)
>
> Wienerdog ships a **code-owned safety profile** (`src/core/safety-profile.js`):
> the powerful capabilities below are **BLOCKED by default** and can be opened only
> by a reviewed code change in a future release — never at runtime, and never by an
> environment variable or CLI flag. This exists so a partially configured machine
> can never be mistaken for an approved one (2026-07-15 audit, action A0). Inspect
> the gates with `wienerdog safety`.
>
> Currently frozen (each fails closed before any side effect):
> - **`google-setup`** — connecting a Google account (`gws auth`) fails before the
>   OAuth browser opens.
> - **`gws-use`** — every `gws` read/draft/send/calendar/drive verb fails before a
>   credential is loaded.
> - **`external-content-routine`** — scheduling or running a `skill:` routine fails
>   before a model is spawned (`builtin:dream` is unaffected).
> - **`daily-summary-injection`** — the daily note Summary is not injected into the
>   session digest.
> - **`identity-auto-activation`** — the nightly dream may not change the four
>   injected identity files (`06-Identity/{profile,preferences,goals,instructions}.md`);
>   identity stays human-authored.
>
> These gates open only after the corresponding P0 hardening lands and a human
> go decision (audit actions A1–A6). Until then the permitted profile is a local,
> Google-disabled, dream-only evaluation.

Then add ONE sentence to **T4a**'s mitigations, e.g.: *"As of the A0 pre-use
freeze (T0), the entire `gws` path — including any send — is disabled behind the
`gws-use` capability gate, so no outbound send is reachable at all until the gate
is opened."*

**2. `docs/VISION.md` — "What we will not do".** Scope the permissions bullet;
keep the grant claim but tie it to the enforced path and the current freeze, e.g.
replace *"The AI can never widen its own permissions."* with wording like:
*"The AI can never widen its own permissions along the enforced grant/CLI path
(ADR-0007). In the current security-hardened build the Google Workspace layer is
disabled entirely behind a pre-use safety gate — see the threat model's T0 and run
`wienerdog safety`."* Add a short parenthetical to the product paragraph noting
Google senses and the routine catalog are **off pending the pre-use security
review** in this build.

**3. `README.md`.** In "What you get", append a plain-language note to the
**Google Workspace senses** and **Laptop-friendly routines** bullets that in this
security-hardened build they are **turned off pending a one-time pre-use safety
review** (run `wienerdog safety` to see what is enabled), and that automatic
identity edits by the dream are likewise paused (the dream still writes ordinary
memory notes and skills). Keep it brief, non-alarming, and knowledge-worker plain
(no jargon). Do not remove the feature descriptions — say they are *coming back
once the safety gates are cleared*.

## Implementation notes & constraints

- **Docs only.** No code, no tests, no golden files. If a claim seems to need a
  code change to be true, it does not belong here — the code freeze already landed
  in WP-109–112; this WP only describes it.
- **A0 scope only.** Do not touch claims that belong to later audit actions
  (secret detection limits, the GWS broker, strict frontmatter, scheduler
  integrity). Keep edits surgical and traceable to the five A0 gates.
- **Plain language** for README/VISION (knowledge workers, not developers);
  THREAT-MODEL may be more technical, matching its existing register.
- **Name things canonically** (GLOSSARY, updated by WP-109): "safety profile",
  "capability gate" — never "sandbox".
- Match each doc's existing voice and markdown style; do not reflow unrelated
  paragraphs.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] This WP touches no untrusted input and no code path — it edits three docs to
      make security claims match the enforced A0 gates. No filesystem/shell/identifier
      handling is involved.

## Acceptance criteria

- [ ] `docs/THREAT-MODEL.md` has a **T0** section listing all five frozen gates and
      stating the no-runtime/env/flag-override property and the `wienerdog safety`
      command; **T4a** notes the whole `gws` path is currently frozen.
- [ ] `docs/VISION.md`'s "never widen its own permissions" claim is scoped to the
      enforced grant/CLI path and notes the current GWS freeze.
- [ ] `README.md` marks Google Workspace, the routine catalog, and automatic
      identity edits as disabled pending the pre-use safety review and points to
      `wienerdog safety`.
- [ ] No code, test, or golden file is modified; `npm run lint` passes (markdown
      lint + frontmatter schema).

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
grep -n "T0 — Pre-use safety profile" docs/THREAT-MODEL.md
grep -n "wienerdog safety" README.md docs/VISION.md docs/THREAT-MODEL.md
git diff --name-only            # expect ONLY the three docs (+ this spec, ROADMAP)
```

## Out of scope (do NOT do these)

- Any code, test, or golden change (WP-109–112 own the enforcement).
- Documentation for audit actions A1–A6 (broker, secret detection, strict parser,
  scheduler integrity) — later WPs.
- Rewriting ADRs or adding a new ADR — this describes an enforced state; the
  fail-closed convention is recorded in WP-109's spec/GLOSSARY.
- Editing `docs/GLOSSARY.md` (WP-109 already adds the canonical terms) or any
  audit-package file under `docs/security-audit/`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/113-a0-threat-boundary-docs`; conventional commits; PR titled
   `docs(security): document the A0 pre-use safety freeze (WP-113)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main`
> per `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields
> are kept for template/upstream-porting fidelity.
