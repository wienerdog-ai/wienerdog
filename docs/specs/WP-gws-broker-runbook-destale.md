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

**It also carries a second, adjacent defect of the same shape**, found by the
Codex design gate (round 1, 2026-08-02) and confirmed first-hand: the closing
paragraph says the broker's containment "is proven end-to-end" by the
poisoned-email test harness — a claim about the harness's **current execution
status**, which a `Ready` WP (`WP-broker-e2e-terminal-auth`) and the harness's own
`AUTH-BLOCKED` short-circuit contradict today (Current state §3). Both defects are
the same failure mode — **prose asserting a status a later change can falsify** —
so both are fixed here, by the same rule.

**And the same defect turned out to be in the document the runbook defers to.**
Round 2 of the design gate found `docs/THREAT-MODEL.md:146` asserting that the
harness "is being re-fitted" and naming a WP that is already `Done`. That clause
is **E3**. The scope is therefore **three regions across two files** — resolve it
from **Table S**, never from prose.

This WP changes prose only. It adds no behavior, no file, no flag and no process
(**IRON RULE, ADR-0004: Wienerdog is just files** — nothing here starts
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

Concretely, for **E1**: the replacement must **not** say the gate is open, must
**not** say it is closed, must keep the `wienerdog safety` pointer, and must not
contain the phrase "pre-use safety gate" or "pre-use security review".

**The same rule, generalized for E2.** The sibling WPs stated it for *gate
verdicts*; the underlying principle is wider and E2 is its second instance: **a
runbook may name a mechanism and name where the live answer lives, but may not
assert a status that something outside the runbook decides.** A gate's status is
decided by a reviewed release; a harness's pass/fail is decided by whether it can
run today. Neither belongs in prose that nobody re-reads when it changes. So E2
must name the harness and what actually enforces the containment, and assert
**neither** that the harness currently passes **nor** that it currently cannot
run.

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

### 3. The rest of the runbook — one more stale assertion, of a SECOND class

**The gate-status class.** A scan of all 124 lines at `0f9ee08`:

```bash
grep -niE "not yet|planned|coming|future|disabled|switched off|currently|for now|once .* (opened|enabled)|when .* enabled|freeze|frozen|audit" docs/runbooks/gws-broker.md
```

returns **exactly one line: `:9`** — part of the banner above. And:

```bash
grep -niE "frozen|disabled|off in this|hardened|safety gate|gate is|not (yet )?enabled|pre-use|opened" docs/runbooks/gws-broker.md
```

returns **`:7`, `:8`, `:9` and `:108`**. So `:7-9` is the complete gate-status
scope.

**`:108` is NOT in that class and must not be touched.** It reads: *"(Per-group
revocation would require setting up separate Google apps, which v1 does not do.)"*
That is a product-scope statement about how many OAuth clients v1 uses, not a
capability-gate status, and it is still true —
`docs/THREAT-MODEL.md:431` states the same thing: *"Revocation is
**all-or-nothing per OAuth client** (v1 uses one client with per-capability
tokens…)"*.

**A SECOND stale class the gate-status scan does not catch: a live-proof
assertion.** Found by the Codex design gate (round 1, 2026-08-02) and confirmed
first-hand. A scan for it:

```bash
grep -niE "proven|proves|verified|guaranteed|tested|ensures|is enforced|harness|end-to-end" docs/runbooks/gws-broker.md
```

returns `:70`, `:72`, `:76` (all about Google's *app verification* status — a
different subject, correct, out of scope) and **`:121-122`**, which is the hit
that matters. Byte-exact at `:121-124`:

```text
The broker's containment of a hijacked AI is proven end-to-end by the
poisoned-email test harness (`tests/scenarios/broker-e2e/`). The protection of
the underlying files is your OS account and disk encryption, exactly as it is
for every other app you run.
```

*"is proven end-to-end by …"* asserts a **current execution status** for a
harness that cannot currently execute that proof from a documented terminal
invocation. Two sources, both checked at `0f9ee08`:

- **`tests/scenarios/broker-e2e/run-broker-e2e.js`** short-circuits with an
  explicit `AUTH-BLOCKED` result. At `:238-241`:
  *"AUTH-BLOCKED — the brain could not reach the macOS Keychain under
  buildCleanEnv from a terminal"* / *"(terminal-Keychain limitation, ADR-0025
  Amendment 4) — not a containment breach"*, and at `:383` the summary says
  outright that an AUTH-BLOCKED line is *"NOT a containment result"*.
- **`docs/specs/WP-broker-e2e-terminal-auth.md`** (status: **Ready**, i.e. not yet
  done) exists precisely to fix this: *"LP2's positive read-path is currently
  unprovable from a normal `npm run scenarios:broker-e2e` invocation."*
- **`docs/THREAT-MODEL.md:146` — which round 1 of this spec wrongly blessed as
  "already correct". It is not.** Its parenthetical reads: *"(The live end-to-end
  poisoned-email harness that exercises this is being re-fitted to the current
  Claude runtime — WP-scenario-harness-auth-repair; the containment itself is
  enforced by the argv + broker design, unit-verified and design-reviewed.)"*
  **That is the same defect class, one document further in**, and it is stale
  twice over: *"is being re-fitted"* is a live-status assertion, and the WP it
  names as the ongoing repair —
  `docs/specs/done/WP-scenario-harness-auth-repair.md` — has `status: Done`,
  while the repair that actually remains is the still-`Ready`
  `WP-broker-e2e-terminal-auth`. Found by the Codex design gate (round 2). It is
  therefore **E3 of this WP**, not a source to defer to; only its second half (the
  design-enforcement clause) is sound, and that half survives byte-identically.

**This is the same failure mode as the banner**, one class up: prose asserting a
status that a later change can falsify. The fix is the same rule — name the
mechanism and the harness, assert no current execution status.

**Consequence: this WP has THREE edit regions across TWO files** — the runbook's
`:7-9` (**E1**) and `:121-124` (**E2**), and one clause of
`docs/THREAT-MODEL.md:146` (**E3**). Everything else in both files is out of
scope.

**On adding a second file to a docs-only WP.** The alternative was a companion WP
for one sentence, which is process overhead for a one-clause fix of the *same*
defect class found in the *same* review. The repo has direct precedent for a
**clause-scoped** `docs/THREAT-MODEL.md` Deliverables row:
`docs/specs/done/WP-stance-authority-containment.md:585` reads
*"\| modify \| docs/THREAT-MODEL.md \| **D7** — the stance clause at `:277-279`
only; exact wording in Implementation notes."* E3 follows that shape exactly.

**Mirror check, done before widening scope (ADR-0031).** `:146` is **not** a
registered mirrored surface of any other spec. The clause-scoped
`docs/THREAT-MODEL.md` rows that exist elsewhere name `:130`, `:132`, `:134`,
`:277-279` and `:427` (`WP-secret-fence-ep2-redact-arm`'s Table Q rows Q10–Q13
and `WP-stance-authority-containment`'s D7) — **none is `:146`**. And
`grep -rln "being re-fitted\|re-fitted to the current" docs/` returns only
`docs/THREAT-MODEL.md` and this spec, so the sentence has no copies to keep in
lockstep. `WP-143-a2-broker-docs` (Done) is the WP that originally wrote the T4a
residual; it registers no live mirror obligation.

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
- `grep -rn "proven end-to-end" tests/ src/ docs/` returns **only**
  `docs/runbooks/gws-broker.md:121` — the E2 sentence itself. Nothing quotes it.
- Neither edit touches a heading, so no in-repo anchor can break.
- **`docs/THREAT-MODEL.md:146` is NOT a source to defer to — it is E3** (Table S),
  because it carries the same defect (Current state §3). Only its **second half**
  — *"the containment itself is enforced by the argv + broker design,
  unit-verified and design-reviewed"* — is sound, and E2 mirrors that half. **An
  earlier revision of this bullet said `:146` was "already correct … do not edit
  it", which directly contradicted E3 and would have let an implementer skip it;
  Codex round 3 caught it.** That is why the scope now lives in one table.
- **Every OTHER line of `docs/THREAT-MODEL.md` is still defer-only**, T0 at
  `:32-35` above all.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/runbooks/gws-broker.md | **E1 and E2** — two of the three regions in **Table S**, which is canonical; the byte-exact text for each is under "Exact contract". Change nothing else in the file — not `:108`, not `:70`/`:72`/`:76`, not any heading, not the table at `:114-119`, not the intro at `:3-5`. |

| modify | docs/THREAT-MODEL.md | **E3** — the third region in **Table S**. **ONE CLAUSE at `:146` and nothing else in the file.** The parenthetical beginning `(The live end-to-end poisoned-email harness` and ending `unit-verified and design-reviewed.)` — the same live-status defect as E2 (Current state §3). **The content is the boundary, not the line number.** Every other sentence of `:146`, and every other line of the file — T0 (`:32-35`), the gates (`:130`, `:132`, `:134`), the stance clause (`:277-279`), the residuals (`:427`, `:429`, `:431`) — stays byte-identical. Several of those are clause-scoped deliverables of OTHER specs; touching them is a permission-boundary violation, not a favour. |

Not deliverables under any reading: `docs/VISION.md`, `docs/GLOSSARY.md`,
`README.md`, `docs/adr/`, any other file in `docs/runbooks/`,
`tests/scenarios/broker-e2e/`, every OTHER line of `docs/THREAT-MODEL.md`, and
every file under `src/`, `bin/`, `tests/`, `skills/` and `templates/`.

### Exact contract

The three regions of **Table S**, in order. All three follow the same rule: name
the thing, point at where the live answer lives, assert no current status.

#### E1 — the banner, `:7-9`

**Remove**, byte-exact (three lines, including the leading blockquote markers):

```text
> Google Workspace access is **off** in this security-hardened build, behind a
> pre-use safety gate. Run `wienerdog safety` to see what is enabled. This
> runbook describes how the broker behaves once that gate is opened.
```

**Insert in its place**, byte-exact (three lines, same blockquote form):

```text
> Google Workspace access is one of Wienerdog's gated capabilities. Run
> `wienerdog safety` to see its status on your machine. Everything below
> describes how the broker behaves when that capability is available to you.
```

**Why this wording** (recorded so it is not re-litigated in review):

- **It asserts no verdict, conditional or otherwise.** It does not say the gate is
  open and does not say it is closed. A future reviewed release that blocks
  `gws-use` cannot re-stale it — which is the entire point, since asserting a
  verdict is how the removed banner became wrong.
- **It contains no status word applied to the gate.** No "off", "on", "open",
  "closed", "enabled", "disabled", "allowed", "blocked". This is deliberate and
  it is what AC3 checks. An earlier draft ended *"whenever that access is
  switched on"*, which was a status word and made AC3 self-contradictory; the
  conditional clause is now "when that capability is available to you".
- **It keeps the `wienerdog safety` pointer**, phrased as "its status on your
  machine", matching `docs/VISION.md:51` and `README.md:70` (Current state §5)
  rather than the vaguer "what is enabled".
- **It contains neither "pre-use safety gate" nor "security-hardened build".**
  Both are the stale framing; both are also jargon a knowledge worker does not
  need. "Gated capabilities" is used once and immediately cashed out by the
  command that shows them.
- **It does not restate the 0.10.0 history.** `docs/THREAT-MODEL.md:32-35` owns
  that (Current state §4); a runbook points, it does not duplicate.

#### E2 — the live-proof assertion, `:121-124`

**Remove**, byte-exact (four lines):

```text
The broker's containment of a hijacked AI is proven end-to-end by the
poisoned-email test harness (`tests/scenarios/broker-e2e/`). The protection of
the underlying files is your OS account and disk encryption, exactly as it is
for every other app you run.
```

**Insert in its place**, byte-exact (five lines — the paragraph grows by one
line; do not compress it back to four):

```text
The broker's containment of a hijacked AI comes from its fixed menu of actions
and from the restricted environment the routine runs in; the poisoned-email test
harness (`tests/scenarios/broker-e2e/`) is the end-to-end check written to
exercise it. The protection of the underlying files is your OS account and disk
encryption, exactly as it is for every other app you run.
```

**Why this wording:**

- **It names what actually enforces the containment**, which is the accurate and
  stable fact: the fixed verb menu and the restricted routine environment. This
  matches `docs/THREAT-MODEL.md:146` verbatim in substance — *"the containment
  itself is enforced by the argv + broker design"* — so the two documents agree.
- **It still names the harness**, so a reader who wants the check can find it.
  A knowledge worker is not misled about where the evidence lives.
- **It asserts no execution status.** "is the end-to-end check written to
  exercise it" is true whether the harness passes today, is AUTH-BLOCKED today
  (Current state §3), or is green again after `WP-broker-e2e-terminal-auth`
  lands. That is the whole point: the sentence cannot go stale again.
- **It does not say the harness is broken, blocked, or being repaired either.**
  That would be the same mistake in the other direction — a status claim with a
  short shelf life. The runbook is not the place to track harness health.
- **Plain language.** "comes from" rather than "is enforced by"; no "LP2", no
  "argv", no "hermetic runtime profile".

#### E3 — the same defect in the threat model, `docs/THREAT-MODEL.md:146`

**Remove**, byte-exact — the parenthetical **only**, mid-paragraph. Inside that
one long line it sits between the sentence ending
`…and A2’s fixed broker verbs.` and the sentence starting
`This is the same single-user-machine file-permission boundary…` (one space on
each side of the parenthetical, unchanged):

```text
(The live end-to-end poisoned-email harness that exercises this is being re-fitted to the current Claude runtime — WP-scenario-harness-auth-repair; the containment itself is enforced by the argv + broker design, unit-verified and design-reviewed.)
```

**Insert in its place**, byte-exact:

```text
(The end-to-end poisoned-email harness written to exercise this is `tests/scenarios/broker-e2e/`; the containment itself is enforced by the argv + broker design, unit-verified and design-reviewed.)
```

`:146` is one very long line; the surrounding sentences on it do not change.

**Why this wording:**

- **The second half survives byte-identically** — *"the containment itself is
  enforced by the argv + broker design, unit-verified and design-reviewed"* is the
  sound half, and it is the sentence E2 was written to mirror. Only the stale
  first half moves.
- **It drops two stale claims at once**: *"is being re-fitted"* (a live status)
  and *"— WP-scenario-harness-auth-repair"* (a WP that is `Done`, so naming it as
  the ongoing repair is simply wrong today).
- **It names the harness by path**, which is stable, instead of by the state it is
  in, which is not.
- **It drops the word "live" and the present-tense "that exercises this".** Both
  assert a current execution capability — the identical defect one notch quieter,
  and Codex round 3 caught the first revision of E3 keeping them. The replacement
  uses E2's neutral construction, *"written to exercise this"*, so the two
  documents now say the same thing in the same voice and neither claims the
  harness runs today.
- **It does not name `WP-broker-e2e-terminal-auth` either.** Pointing at the
  *next* repair WP is the identical failure mode with a later expiry date — that
  WP will also be `Done` one day. Spec ids belong in specs, not in the threat
  model's prose.

## Contract reference

The ADR-0031 activation trigger fires on **two** of the seven: (vi) a successor
spec inherits the contract — this is the third WP applying the sibling
"one-live-state-assertion" rule, and it **generalizes** that rule from gate
verdicts to any externally-decided status (see Context); and (vii) the same
contract must appear in multiple mirrored surfaces. Trigger (vii) is not
theoretical here: **the scope statement drifted in exactly that way.** Round 2
added E3 while six prose restatements still said "one file", one of which
positively instructed the implementer *not* to edit E3's target. Codex round 3
called it, correctly, a mirrored-surface failure.

So the scope is now a table, and prose defers to it.

### Table S — the edit regions (canonical)

Every statement of *what this WP changes* resolves here. Prose that restates a
row is a mirror and is listed in the checklist below.

| # | File | Region | Anchor (content is the boundary) | Defect | Byte-exact text |
|---|------|--------|----------------------------------|--------|-----------------|
| **E1** | `docs/runbooks/gws-broker.md` | the 3-line blockquote at `:7-9` | opens `> Google Workspace access is **off**` | gate-status verdict, false since 0.10.0 | "Exact contract" → E1 |
| **E2** | `docs/runbooks/gws-broker.md` | the 4-line paragraph at `:121-124` | opens `The broker's containment of a hijacked AI is proven end-to-end` | live-proof assertion | "Exact contract" → E2 |
| **E3** | `docs/THREAT-MODEL.md` | ONE clause inside `:146` | the parenthetical from `(The live end-to-end poisoned-email harness` to `unit-verified and design-reviewed.)` | live-proof assertion + names a `Done` WP as the ongoing repair | "Exact contract" → E3 |

**Three regions, two files. Nothing else in either file moves.** In particular
`docs/THREAT-MODEL.md` T0 (`:32-35`) and the clause-scoped regions owned by other
specs (`:130`, `:132`, `:134`, `:277-279`, `:427`) are defer-only.

### Mirrored Surface Checklist

Every surface that restates Table S, registered so a scope change moves them
together or not at all. **The first two are the ones that drifted in round 2 and
were caught in round 3** — they are listed first deliberately:

- [ ] **Context** (`"three regions across two files"`) — restates the row count
      and the two-file fact.
- [ ] **Current state §6's `docs/THREAT-MODEL.md:146` bullet** — must say `:146`
      is **E3**, never "already correct" or "do not edit it". This bullet is the
      one that actively contradicted Table S.
- [ ] **Deliverables table** — one row per file, each pointing at Table S rather
      than re-listing the regions.
- [ ] **"Exact contract" preamble and its `#### E1 / #### E2 / #### E3`
      subsections** — one subsection per Table S row, same ids, same order.
- [ ] **Current state §3's "Consequence" paragraph** — states the region and file
      count.
- [ ] **Acceptance criteria AC0–AC8** — each names the E-id it gates. **AC6
      counts the changed files, so it moves whenever Table S gains or loses a
      file** — and it must also count this spec itself, whose status flip every
      implementation commit carries (round 6).
- [ ] **Verification commands V1–V8** — including **V8's `boundary-check`
      invocation, which must list every file in Table S**; a missing path there
      makes CI reject the very edit this spec mandates.
- [ ] **Out of scope** — its "every OTHER line of `docs/THREAT-MODEL.md`" bullet
      is the negative image of Table S row E3.
- [ ] **Definition of done** — the PR-title prefix depends on how many files
      Table S spans (`docs:` while it spans more than `docs/runbooks/`).

## Implementation notes & constraints

- **Do not "improve" adjacent prose while you are in the file.** Every changed
  line must trace to E1 or E2. The runbook's other sections (the 7-day expiry,
  the grant flow, the revocation section, the contains/does-not-contain table at
  `:114-119`) are correct and out of scope.
- **Do not add a "gates were opened in 0.10.0" sentence.** That is the GLOSSARY's
  job, and it already does it (Current state §5). A runbook that carries a dated
  release fact acquires a second thing to maintain.
- **Do not add a note about the harness being AUTH-BLOCKED or under repair.** See
  E2's rationale — that is a status claim too.
- Keep E1 three lines in a blockquote and E2 an ordinary paragraph. Do not convert
  either to a callout or a bullet list; do not reflow the rest of the file.
- No new heading, no new link. The edits must leave every anchor in the file
  intact.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

Deleted — this WP touches no untrusted input, no path construction, no shell
command, and no code. It changes eight lines of documentation prose.

## Acceptance criteria

- [ ] **AC0 (trust root — check this first)** — **V0** passes: this spec is
      byte-identical to its branch-base copy apart from the single frontmatter
      `status: Ready` → `status: In-Review` flip. V5b reconstructs
      `docs/THREAT-MODEL.md` using clause strings that live in **this** file, so if
      V0 is red nothing below it means anything. **The implementation commit may
      not change one other byte of this spec.** Found something wrong here? Say so
      under "Discovered issues"; do not fix it.
- [ ] **AC1 (E1, red → green)** — `grep -n "pre-use safety gate" docs/runbooks/gws-broker.md`
      and `grep -n "security-hardened build" docs/runbooks/gws-broker.md` each
      match **before** the change and match **nothing after**. All four runs
      pasted into the PR.
- [ ] **AC2 (E1 + E2 byte-exact)** — the extracted three-line blockquote and the
      extracted five-line paragraph are **byte-identical** to the text in "Exact
      contract", proven by the two `diff` commands in V3 exiting 0 with no output.
      Not "contains the right words" — byte-identical.
- [ ] **AC3 (E1 asserts no verdict)** — the extracted blockquote contains **no
      unconditional present-tense claim about the gate's status**. Operationally:
      V4's status-**predication** scan finds nothing — no
      `<access|gate|capability|layer> is <off|on|open|closed|enabled|disabled|allowed|blocked>`,
      no `is switched/turned on|off`, and no `pre-use` or `security-hardened`.
      The only status reference in those three lines is the `wienerdog safety`
      pointer, and the one conditional clause ("when that capability is available
      to you") asserts nothing about today. *(Round 1 note: an earlier draft's
      mandated text ended "switched on" while AC3 forbade the bare word `on` —
      the criterion contradicted its own text, and a bare-word check also
      false-positives on "status **on** your machine". Both are fixed: the text
      no longer uses a status word, and V4 matches predications, not tokens.)*
- [ ] **AC4 (E2, red → green)** — `grep -n "is proven end-to-end by" docs/runbooks/gws-broker.md`
      matches **before** the change and matches **nothing after**, and the file
      still names `tests/scenarios/broker-e2e/` exactly once.
- [ ] **AC5 (E3, byte-enforced)** — V5b passes: `docs/THREAT-MODEL.md` is
      **byte-identical** to the branch-base file with **only** the E3 clause
      substituted. This is one check, not a set of greps, and it subsumes the old
      before/after sentinels: if the stale clause were still there, or the
      replacement differed by a word, or anything else in the file moved, the
      reconstruction diff fails and names the line and column.
- [ ] **AC6 (nothing else moved)** — `git diff --stat` shows exactly **three**
      files changed, and the third is the mandatory status flip:
      `docs/runbooks/gws-broker.md` with `8 insertions(+), 7 deletions(-)`;
      `docs/THREAT-MODEL.md` with `1 insertion(+), 1 deletion(-)` (E3 edits one
      clause inside one long line, so it is a one-line diff); and
      `docs/specs/WP-gws-broker-runbook-destale.md` with
      `1 insertion(+), 1 deletion(-)` — the `status:` line and nothing else,
      byte-proven by **V0**. `git diff` shows the runbook change confined to lines
      7-9 and 121-124, and the threat-model change confined to `:146`. (The two
      product-document counts were measured while drafting; the third is the
      repo's standard implementation-commit spec flip — see
      `8ecf7f0`, numstat `1 1`.)
- [ ] **AC7** — runbook line `:108` (*"which v1 does not do"*) is unchanged, the
      runbook is 125 lines after the edit (124 + E2's one added line), and
      `docs/THREAT-MODEL.md` is still **431** lines.
- [ ] **AC8 (E3 stayed in its lane) — proven by V5b, not asserted.** No other
      byte of `docs/THREAT-MODEL.md` moved, including the rest of `:146` itself.
      T0 (`:32-35`) and the clause-scoped regions owned by other specs (`:130`,
      `:132`, `:134`, `:277-279`, `:427`) are byte-identical by construction. A
      "helpful" consistency edit anywhere in this file is a permission-boundary
      violation and V5b will fail on it. **Round-4 note:** the previous checks
      could not see this — `:146` is one line carrying several security claims,
      and negating a neighbouring one passed every single check.
- [ ] `npm run lint` is green.

## Verification steps (run these; paste output in the PR)

```bash
# ── V0 — THE TRUST ROOT. Run this FIRST, before anything below. ───────────────
# V5b reconstructs docs/THREAT-MODEL.md using the OLD and NEW clause strings that
# live in THIS spec, and V3 diffs the runbook against text that lives here too. So
# this spec is the root of trust — and the implementation commit is REQUIRED to
# touch it (the status flip, DoD item 4). Without this gate a commit could edit
# the NEW string here and write that same text into THREAT-MODEL, and V5b would
# pass: consistent with itself, and wrong.
#
# This is the same gate WP-symlink-lexical-fallback-removal carries, deliberately
# identical so the two specs' conventions match. Reconstruct this spec from the
# branch base and license EXACTLY ONE change — the frontmatter status flip.
#
# The licensed substitution is `status: Ready` -> `status: In-Review`. Verified
# against a real merged implementation commit: `8ecf7f0` changed exactly one line
# of its spec, `-status: Ready` / `+status: In-Review`, numstat `1 1`. The
# Draft->Ready move is the architect's or owner's, in its own earlier commit on
# main — so if this gate reports the base spec is not `Ready`, the lifecycle was
# skipped.
BASE=$(git merge-base main HEAD)
node -e '
const fs = require("node:fs");
const { execSync } = require("node:child_process");
const SPEC = "docs/specs/WP-gws-broker-runbook-destale.md";
const base = execSync(`git show ${process.argv[1]}:${SPEC}`, { maxBuffer: 1e8 }).toString();
const lines = base.split("\n");
const fmEnd = lines.indexOf("---", 1);
if (fmEnd === -1) { console.error("FAIL: no frontmatter terminator in the base spec"); process.exit(1); }
const hits = [];
for (let i = 0; i < fmEnd; i++) if (lines[i] === "status: Ready") hits.push(i);
if (hits.length !== 1) {
  console.error(`FAIL: the base spec frontmatter has ${hits.length} \`status: Ready\` lines, expected exactly 1.`);
  console.error("  This spec must be at `status: Ready` on the branch base before implementation starts.");
  process.exit(1);
}
lines[hits[0]] = "status: In-Review";
const expected = lines.join("\n");
const actual = fs.readFileSync(SPEC, "utf8");
if (actual === expected) { console.log("V0 ok — this spec is the base spec with ONLY the Ready->In-Review flip"); process.exit(0); }
const a = actual.split("\n"), b = expected.split("\n");
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) continue;
  const x = a[i] ?? "<missing line>", y = b[i] ?? "<missing line>";
  let c = 0; while (c < x.length && c < y.length && x[c] === y[c]) c++;
  const from = Math.max(0, c - 60), to = c + 60;
  console.error(`REGRESSED: this spec diverges from base+status-flip at line ${i + 1}, column ${c + 1}`);
  console.error("  actual  : …" + x.slice(from, to) + "…");
  console.error("  expected: …" + y.slice(from, to) + "…");
  console.error("  The implementation commit may change ONE line of this spec: the status flip.");
  console.error("  Everything else here — V5bs clause strings above all — is the trust root.");
  process.exit(1);
}
console.error("REGRESSED: this spec differs from base+status-flip in trailing content");
process.exit(1);
' "$BASE"

# V1 (AC1/AC4, BEFORE) — the three stale phrases are present. Run before editing.
grep -n "pre-use safety gate" docs/runbooks/gws-broker.md
grep -n "security-hardened build" docs/runbooks/gws-broker.md
grep -n "is proven end-to-end by" docs/runbooks/gws-broker.md

# V2 (AC1/AC4, AFTER) — all three gone. `grep` exits 1 on no match; that exit
# code is the expected result here, not a failure.
grep -n "pre-use safety gate" docs/runbooks/gws-broker.md
grep -n "security-hardened build" docs/runbooks/gws-broker.md
grep -n "is proven end-to-end by" docs/runbooks/gws-broker.md

# V3 (AC2) — BYTE-EXACT comparison of both edited regions against this spec's
# mandated text. Each diff must print nothing and exit 0. This is the gate; the
# greps above are only sentinels. (bash required — process substitution.)
diff <(sed -n '7,9p' docs/runbooks/gws-broker.md) - <<'EOF'
> Google Workspace access is one of Wienerdog's gated capabilities. Run
> `wienerdog safety` to see its status on your machine. Everything below
> describes how the broker behaves when that capability is available to you.
EOF
echo "E1 byte-exact: exit $?"

diff <(sed -n '121,125p' docs/runbooks/gws-broker.md) - <<'EOF'
The broker's containment of a hijacked AI comes from its fixed menu of actions
and from the restricted environment the routine runs in; the poisoned-email test
harness (`tests/scenarios/broker-e2e/`) is the end-to-end check written to
exercise it. The protection of the underlying files is your OS account and disk
encryption, exactly as it is for every other app you run.
EOF
echo "E2 byte-exact: exit $?"

# V4 (AC3) — no unconditional gate VERDICT survives in the blockquote. This
# matches status PREDICATIONS ("<subject> is <status>"), not bare status words:
# a bare-word check false-positives on "status on your machine" (measured — an
# earlier draft of this gate did exactly that). Must print the ok line.
VERDICT='(access|gate|capability|layer) is (currently )?\*{0,2}(off|on|open|closed|enabled|disabled|allowed|blocked)\b|\b(is|are) (currently )?(switched|turned) (on|off)\b|pre-use|security-hardened'
if sed -n '7,9p' docs/runbooks/gws-broker.md | grep -niE "$VERDICT"; then
  echo "FAIL (AC3): the blockquote asserts a gate status"; exit 1
fi
echo "AC3 ok — no unconditional gate verdict in the blockquote"
# This regex was measured in four directions while drafting: GREEN on the
# mandated text above; RED on the removed banner (`access is **off**`,
# `security-hardened`, `pre-use`); RED on an earlier draft ending
# "whenever that access is switched on"; RED on a hypothetical
# "The gws-use gate is allowed in this release."

# V5 (AC2 positive, AC4) — the replacements landed and the pointers survive.
grep -c "wienerdog safety" docs/runbooks/gws-broker.md          # expect 1
grep -c "tests/scenarios/broker-e2e/" docs/runbooks/gws-broker.md  # expect 1

# V5b (AC5 + AC8) — E3 byte-enforced, and the clause-only permission boundary
# with it. Greps cannot do this job: `:146` is ONE long line holding several
# security claims, so a check that only looks for the replacement clause passes
# while the rest of the line is rewritten. Measured — with E3 applied correctly
# and the neighbouring keyed-MAC claim silently negated (its `**not**` deleted),
# every round-3 check still passed: stale phrase 0, replacement 1, changed lines
# 2, line count 431. The gate below caught it at line 146, column 1238.
#
# So: reconstruct the ENTIRE expected file from the branch base by applying ONLY
# the mandated substitution, and diff. Any other byte anywhere in the file is red.
BASE=$(git merge-base main HEAD)
node -e '
const fs = require("node:fs");
const { execSync } = require("node:child_process");
const base = execSync(`git show ${process.argv[1]}:docs/THREAT-MODEL.md`, { maxBuffer: 1e8 }).toString();
const OLD = "(The live end-to-end poisoned-email harness that exercises this is being re-fitted to the current Claude runtime — WP-scenario-harness-auth-repair; the containment itself is enforced by the argv + broker design, unit-verified and design-reviewed.)";
const NEW = "(The end-to-end poisoned-email harness written to exercise this is `tests/scenarios/broker-e2e/`; the containment itself is enforced by the argv + broker design, unit-verified and design-reviewed.)";
const n = base.split(OLD).length - 1;
if (n !== 1) { console.error(`FAIL: the BASE file contains the E3 clause ${n} times, expected exactly 1`); process.exit(1); }
const expected = base.replace(OLD, NEW);
const actual = fs.readFileSync("docs/THREAT-MODEL.md", "utf8");
if (actual === expected) { console.log("V5b ok — THREAT-MODEL is the base file with ONLY the E3 clause replaced"); process.exit(0); }
const a = actual.split("\n"), b = expected.split("\n");
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) continue;
  const x = a[i] ?? "<missing line>", y = b[i] ?? "<missing line>";
  let c = 0; while (c < x.length && c < y.length && x[c] === y[c]) c++;
  const from = Math.max(0, c - 60), to = c + 60;
  console.error(`REGRESSED: docs/THREAT-MODEL.md diverges from base+E3 at line ${i + 1}, column ${c + 1}`);
  console.error("  actual  : …" + x.slice(from, to) + "…");
  console.error("  expected: …" + y.slice(from, to) + "…");
  console.error("  Only the E3 clause may change. Nothing else in this file is yours.");
  process.exit(1);
}
console.error("REGRESSED: files differ only in trailing content");
process.exit(1);
' "$BASE"

# V6 (AC6, AC7, AC8) — the blast radius, both files.
git diff --stat
git diff -- docs/runbooks/gws-broker.md
git diff -- docs/THREAT-MODEL.md            # expect ONE changed line, at :146
wc -l docs/runbooks/gws-broker.md                           # expect 125
wc -l docs/THREAT-MODEL.md                                  # expect 431
grep -n "which v1 does not do" docs/runbooks/gws-broker.md  # expect line 108
# AC8 — the clauses that belong to OTHER specs must not appear in the diff at all.
git diff -U0 -- docs/THREAT-MODEL.md | grep -cE "^[+-][^+-]"   # expect 2 (one - and one +)

# V7 — lint (markdownlint runs over docs/**/*.md).
npm run lint

# V8 — the permission boundary (CI runs this too). EVERY file in Table S must be
# listed here; a missing path makes CI reject the very edit this spec mandates.
node scripts/boundary-check.js docs/specs/WP-gws-broker-runbook-destale.md \
  docs/runbooks/gws-broker.md docs/THREAT-MODEL.md
```

## Out of scope (do NOT do these)

- **Every line of `docs/THREAT-MODEL.md` except the `:146` parenthetical (E3).**
  T0 at `:32-35` still holds the one permitted live-state gate assertion
  (Current state §4) and must not move. `:130`, `:132`, `:134`, `:277-279` and
  `:427` are clause-scoped deliverables of other specs. E3 is a one-clause edit;
  keep it that way.
- **Naming `WP-broker-e2e-terminal-auth` in either document.** It is the WP that
  still owes the repair, and pointing prose at it is the same expiring-status
  mistake one WP later. Spec ids stay in specs.
- **`docs/VISION.md`, `docs/GLOSSARY.md`, `README.md`, `bin/wienerdog.js`** —
  already de-staled by `WP-vision-gate-status-destale` and
  `WP-help-text-safety-gates`.
- **`tests/scenarios/broker-e2e/` and `WP-broker-e2e-terminal-auth`.** E2 changes
  how the runbook *describes* the harness. It does not touch, fix, re-enable or
  comment on the harness itself; that WP is `Ready` and owns the repair.
- **Line `:108`'s "which v1 does not do"** — a product-scope statement, still
  true, a different class (Current state §3).
- **Lines `:70`, `:72`, `:76`** — Google's *app verification* status, a different
  subject entirely, correct as written.
- **The other seven files in `docs/runbooks/`.** If you notice either stale class
  in one of them, note it under "Discovered issues" in the PR body; do not fix it
  here.
- **Any test.** No test asserts this text and none should be added for it
  (Current state §6).
- **Any `CHANGELOG.md` entry, ADR, or code change.** This is a documentation
  correction with no behavior change.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of AC1 and AC4 and both byte-exact diffs from V3.
2. Branch `wp/gws-broker-runbook-destale`; conventional commits; PR titled
   `docs: de-stale the Google access banner and the harness-proof claims (WP-gws-broker-runbook-destale)`.
   **`docs:`, not `docs(runbooks):`** — E3 lands in `docs/THREAT-MODEL.md`, which
   is not a runbook.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR — **that flip is
   the only change this PR may make to this file**, and V0 proves it. It is the
   third file in AC6's `git diff --stat`.
