---
id: WP-gws-broker-runbook-destale
title: De-stale the "Google Workspace access is off" banner in the capability-broker runbook
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0026]
---

# WP-gws-broker-runbook-destale: three lines that still say Google access is switched off

## Context (read this, nothing else)

Wienerdog ships a **safety profile** (`src/core/safety-profile.js`): five named
**capability gates** covering the powerful things it can do — connecting a Google
account, reading or sending Gmail/Calendar/Drive, scheduling routines that read
external content, injecting the daily note summary into the session digest, and
automatic dream edits to identity notes. Each gate is either `allowed` or
`blocked`, and its value changes **only** through a reviewed code change to a
frozen constant — never at runtime, never by an environment variable, never by a
CLI flag. `wienerdog safety` prints the current status of all five. (Glossary
terms, used exactly: **safety profile**, **capability gate**, **capability
broker**, **broker verb**, **routine**.)

The 2026-07-15 security audit (action **A0**) shipped every gate **blocked**
pending a pre-use security review. **That review completed and release 0.10.0
opened all five** (`WP-flip-frozen-profile-allowed`). Several user-facing surfaces
were rewritten for launch and are correct today; a few were missed, and each miss
tells a reader the product is switched off when it is not — false in the direction
that makes Wienerdog look less capable than it is. Two of those misses have
already been fixed: the CLI help line (`WP-help-text-safety-gates`, PR #132) and
`docs/VISION.md` + `docs/GLOSSARY.md` (`WP-vision-gate-status-destale`, PR #133).

**This WP is the third sibling of that staleness class.**
`docs/runbooks/gws-broker.md` — the operator's guide to the **capability broker**,
the local per-job process that alone holds the Google credentials and exposes only
fixed **broker verbs** to a routine (ADR-0026) — opens with a banner telling the
reader that Google Workspace access is *off*, behind a *pre-use safety gate*. That
is false.

This WP changes prose in one file. It adds no behavior, no file, no flag and no
process (**IRON RULE, ADR-0004: Wienerdog is just files** — nothing here starts
anything). It is user-facing text for knowledge workers, not developers: plain
language, no jargon without explanation.

### The rule the two sibling WPs established, and this one must follow

Copied from `WP-vision-gate-status-destale`'s ratified contract, because it is the
whole design of this edit:

> A dated *historical* fact cannot go stale (0.10.0 shipped). A *live per-gate
> verdict* in prose goes stale the moment a reviewed release blocks a gate —
> which is precisely how the sentences being removed came to be wrong. **So:
> exactly one live-state assertion exists in the repo, in `docs/THREAT-MODEL.md`
> T0. Every other surface points at `wienerdog safety` and asserts nothing.**

Concretely, for this WP: the replacement must **not** say the gate is open, must
**not** say it is closed, must keep the `wienerdog safety` pointer, and must not
contain the phrase "pre-use safety gate" or "pre-use security review".

## Current state

Every claim below was verified first-hand against the worktree at commit
**`0f9ee08`** (`git rev-parse HEAD` → `0f9ee088117671d9ce0b6f013329f8673ef5c131`)
on 2026-08-02. Line numbers are that commit's.

### 1. The stale banner — `docs/runbooks/gws-broker.md:7-9`

Byte-exact, including the leading blockquote markers
(`awk 'NR>=7 && NR<=9' docs/runbooks/gws-broker.md`):

```text
> Google Workspace access is **off** in this security-hardened build, behind a
> pre-use safety gate. Run `wienerdog safety` to see what is enabled. This
> runbook describes how the broker behaves once that gate is opened.
```

It is the third paragraph of the file: `:1` is the `#` heading, `:3-5` is the
one-paragraph intro (*"This is the operator's guide to how Wienerdog reaches
Google…"*), `:6` is blank, `:7-9` is this blockquote, `:10` is blank, and `:11` is
the first `##` heading (`## What the broker is`). The file is 124 lines.

**Three false or misleading claims in three lines:**

1. *"access is **off**"* — a live per-gate verdict, and the wrong one.
2. *"behind a pre-use safety gate"* — the pre-use freeze was lifted in 0.10.0.
3. *"once that gate is opened"* — presupposes it is currently closed.

The middle sentence, *"Run `wienerdog safety` to see what is enabled"*, is the one
correct part and its intent must survive.

### 2. Why it is false — `src/core/safety-profile.js:34-40`

```js
const FROZEN_PROFILE = Object.freeze({
  'google-setup': 'allowed',
  'gws-use': 'allowed',
  'external-content-routine': 'allowed',
  'daily-summary-injection': 'allowed',
  'identity-auto-activation': 'allowed',
});
```

Its own comment (`safety-profile.js:29-33`) reads: *"THE RELEASED PROFILE. In
0.10.0 every gate is ALLOWED — the A0 pre-use freeze was lifted after its blocker
fixes cleared review (WP-flip-frozen-profile-allowed)."* The two gates this
runbook is about, `google-setup` and `gws-use`, are both `allowed`.

### 3. The whole rest of the runbook was checked, and it is clean

A same-class scan of all 124 lines at `0f9ee08`:

```bash
grep -niE "not yet|planned|coming|future|disabled|switched off|currently|for now|once .* (opened|enabled)|when .* enabled|freeze|frozen|audit" docs/runbooks/gws-broker.md
```

returns **exactly one line: `:9`** — part of the banner above. And:

```bash
grep -niE "frozen|disabled|off in this|hardened|safety gate|gate is|not (yet )?enabled|pre-use|opened" docs/runbooks/gws-broker.md
```

returns **`:7`, `:8`, `:9` and `:108`** — the banner, plus one line that is a
different kind of claim entirely.

**`:108` is NOT in this class and must not be touched.** It reads: *"(Per-group
revocation would require setting up separate Google apps, which v1 does not do.)"*
That is a product-scope statement about how many OAuth clients v1 uses, not a
capability-gate status, and it is still true —
`docs/THREAT-MODEL.md:431` states the same thing: *"Revocation is
**all-or-nothing per OAuth client** (v1 uses one client with per-capability
tokens…)"*.

**Consequence: `:7-9` is the complete scope of this WP.** There is no second stale
assertion in the file.

### 4. The canonical source this banner must defer to — `docs/THREAT-MODEL.md:32-35`

Already correct, already carrying the one permitted live-state assertion, and
**not a deliverable**:

```text
The 2026-07-15 audit (action A0) initially shipped every gate **frozen (blocked)**
until its P0 hardening landed. In **0.10.0** all five were opened after that
hardening cleared review — each capability is now **allowed**, protected by the
mechanism named beside it (which fails closed if it ever fails):
```

`docs/THREAT-MODEL.md:429` already links **to** this runbook, so the two documents
are a pair; the runbook points at the command, the threat model owns the verdict.

### 5. The register to match — how the corrected siblings phrase it

- `README.md:70` — *"run `wienerdog safety` to see the status of every gated
  capability."*
- `docs/VISION.md:51` — *"The Google Workspace layer is one of Wienerdog's gated
  capabilities — see the threat model's T0, and run `wienerdog safety` to see its
  status on your machine."*
- `docs/GLOSSARY.md:43-48` (**safety profile**) — *"A capability stays blocked
  until a reviewed release opens its gate; there is no runtime/env/flag override.
  All five gates were opened in 0.10.0."*

Note the split: VISION and the README carry **no verdict**; only the GLOSSARY (a
definitions file) carries the one **dated historical fact**. A runbook is an
operator's guide, not a definitions file, so it follows the VISION/README pattern:
**no verdict at all**.

### 6. No test or link depends on this text

Verified at `0f9ee08`:

- `grep -rn "gws-broker" docs/ README.md tests/ src/ bin/` (excluding
  `docs/specs/done/`) returns four matches: `docs/THREAT-MODEL.md:429` and
  `docs/adr/0026-gws-capability-broker.md:305`, which link to the **file**, not to
  any heading inside it; `tests/unit/gws-broker.test.js:12` and
  `bin/wienerdog.js:46`, which are about `src/cli/gws-broker.js`, an unrelated
  **code** module that happens to share the name.
- No test asserts any string from this runbook. **No test file is a deliverable**,
  and adding one is out of scope.
- The edit touches no heading, so no in-repo anchor can break.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/runbooks/gws-broker.md | Replace the three-line blockquote at `:7-9` with the exact text below. Change nothing else in the file — not `:108`, not any heading, not the table at `:114-119`, not the intro at `:3-5`. |

Not deliverables under any reading: `docs/THREAT-MODEL.md`, `docs/VISION.md`,
`docs/GLOSSARY.md`, `README.md`, `docs/adr/`, any other file in `docs/runbooks/`,
and every file under `src/`, `bin/`, `tests/`, `skills/` and `templates/`.

### Exact contract

**Remove**, byte-exact (three lines, `:7-9`, including the leading blockquote markers):

```text
> Google Workspace access is **off** in this security-hardened build, behind a
> pre-use safety gate. Run `wienerdog safety` to see what is enabled. This
> runbook describes how the broker behaves once that gate is opened.
```

**Insert in its place**, byte-exact (three lines, same blockquote form):

```text
> Google Workspace access is one of Wienerdog's gated capabilities. Run
> `wienerdog safety` to see its status on your machine. This runbook describes
> how the broker behaves whenever that access is switched on.
```

**Why this wording** (recorded so it is not re-litigated in review):

- **It asserts no verdict.** It does not say the gate is open and does not say it
  is closed. A future reviewed release that blocks `gws-use` cannot re-stale it —
  which is the entire point, since asserting a verdict is how the removed banner
  became wrong.
- **It keeps the `wienerdog safety` pointer**, now phrased as "its status on your
  machine", matching `docs/VISION.md:51` and `README.md:70` (Current state §5)
  rather than the vaguer "what is enabled".
- **It contains neither "pre-use safety gate" nor "security-hardened build".**
  Both are the stale framing; both are also jargon a knowledge worker does not
  need. "Gated capabilities" is used once and immediately cashed out by the
  command that shows them.
- **"whenever that access is switched on"** replaces "once that gate is opened":
  same meaning for the reader (this runbook applies when Google access is
  available), minus the presupposition that it is currently off.
- **It does not restate the 0.10.0 history.** `docs/THREAT-MODEL.md:32-35` owns
  that (Current state §4); a runbook points, it does not duplicate.

## Contract reference

N/A — one prose paragraph in one document. No interface, taxonomy, parser, error
path, authority boundary or downstream consumer changes; fewer than two of
ADR-0031's seven activation triggers fire.

## Implementation notes & constraints

- **Do not "improve" adjacent prose while you are in the file.** Every changed
  line must trace to this spec. The runbook's later sections (the 7-day expiry,
  the grant flow, the revocation section, the contains/does-not-contain table) are
  correct and out of scope.
- **Do not add a "gates were opened in 0.10.0" sentence.** That is the GLOSSARY's
  job, and it already does it (Current state §5). A runbook that carries a dated
  release fact acquires a second thing to maintain.
- Keep it three lines in a blockquote. Do not convert it to a callout, a bold
  paragraph, or a bullet list; do not reflow the rest of the file.
- No new heading, no new link. The edit must leave every anchor in the file intact.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

Deleted — this WP touches no untrusted input, no path construction, no shell
command, and no code. It changes three lines of documentation prose.

## Acceptance criteria

- [ ] **AC1 (red → green)** — `grep -n "pre-use safety gate" docs/runbooks/gws-broker.md`
      and `grep -n "security-hardened build" docs/runbooks/gws-broker.md` each
      match **before** the change and match **nothing after**. All four runs pasted
      into the PR.
- [ ] **AC2** — the replacement text is present byte-exactly, and the file still
      contains the string `wienerdog safety` exactly once.
- [ ] **AC3 (no verdict)** — the new blockquote contains none of the words
      `off`, `on` (as a status), `blocked`, `allowed`, `enabled` or `disabled`
      applied to the gate. Verified by reading it; the three-line text in "Exact
      contract" already satisfies this and must be used verbatim.
- [ ] **AC4 (nothing else moved)** — `git diff --stat` shows exactly one file
      changed, `3 insertions(+), 3 deletions(-)`, and `git diff` shows the change
      confined to lines 7-9.
- [ ] **AC5** — line `:108` (*"which v1 does not do"*) is unchanged, and the file
      is still 124 lines.
- [ ] `npm run lint` is green.

## Verification steps (run these; paste output in the PR)

```bash
# V1 (AC1, before) — both stale phrases present. Run BEFORE editing.
grep -n "pre-use safety gate" docs/runbooks/gws-broker.md
grep -n "security-hardened build" docs/runbooks/gws-broker.md

# V2 (AC1, after) — both gone. `grep` exits 1 on no match; that exit code is the
# expected result here, not a failure.
grep -n "pre-use safety gate" docs/runbooks/gws-broker.md
grep -n "security-hardened build" docs/runbooks/gws-broker.md

# V3 (AC2) — the replacement landed, and the pointer survives exactly once.
grep -n "one of Wienerdog's gated capabilities" docs/runbooks/gws-broker.md
grep -c "wienerdog safety" docs/runbooks/gws-broker.md   # expect 1

# V4 (AC4, AC5) — the blast radius.
git diff --stat -- docs/runbooks/gws-broker.md
git diff -- docs/runbooks/gws-broker.md
wc -l docs/runbooks/gws-broker.md                        # expect 124
grep -n "which v1 does not do" docs/runbooks/gws-broker.md  # expect line 108

# V5 — lint (markdownlint runs over docs/**/*.md).
npm run lint

# V6 — the permission boundary (CI runs this too).
node scripts/boundary-check.js docs/specs/WP-gws-broker-runbook-destale.md \
  docs/runbooks/gws-broker.md
```

## Out of scope (do NOT do these)

- **`docs/THREAT-MODEL.md`** — it holds the one permitted live-state assertion
  (Current state §4) and is already correct. Do not edit it; defer to it.
- **`docs/VISION.md`, `docs/GLOSSARY.md`, `README.md`, `bin/wienerdog.js`** —
  already de-staled by `WP-vision-gate-status-destale` and
  `WP-help-text-safety-gates`.
- **Line `:108`'s "which v1 does not do"** — a product-scope statement, still
  true, a different class (Current state §3).
- **The other seven files in `docs/runbooks/`.** If you notice the same class of
  stale claim in one of them, note it under "Discovered issues" in the PR body;
  do not fix it here.
- **Any test.** No test asserts this text and none should be added for it
  (Current state §6).
- **Any `CHANGELOG.md` entry, ADR, or code change.** This is a documentation
  correction with no user-visible behavior change.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of AC1.
2. Branch `wp/gws-broker-runbook-destale`; conventional commits; PR titled
   `docs(runbooks): de-stale the Google access banner in the broker runbook (WP-gws-broker-runbook-destale)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
