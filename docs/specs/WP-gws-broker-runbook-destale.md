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
so both are fixed here, in the one file, by the same rule.

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
- **`docs/THREAT-MODEL.md:146`** already carries the honest wording: *"(The live
  end-to-end poisoned-email harness that exercises this is being re-fitted to the
  current Claude runtime — WP-scenario-harness-auth-repair; the containment itself
  is enforced by the argv + broker design, unit-verified and design-reviewed.)"*

**This is the same failure mode as the banner**, one class up: prose asserting a
status that a later change can falsify. The fix is the same rule — name the
mechanism and the harness, assert no current execution status.

**Consequence: this WP has TWO edit regions in the one file** — `:7-9` and
`:121-124`. Everything else is out of scope.

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
- **`docs/THREAT-MODEL.md:146` is the canonical source for E2's substance** and is
  already correct (Current state §3). Like the banner deferring to T0, E2 defers
  to `:146`; do not edit it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/runbooks/gws-broker.md | **Two regions, both specified byte-exactly below.** **E1** — replace the three-line blockquote at `:7-9` (the gate-status banner). **E2** — replace the four-line paragraph at `:121-124` (the live-proof assertion about the poisoned-email harness) with the five-line text below. Change nothing else in the file — not `:108`, not `:70`/`:72`/`:76`, not any heading, not the table at `:114-119`, not the intro at `:3-5`. |

Not deliverables under any reading: `docs/THREAT-MODEL.md`, `docs/VISION.md`,
`docs/GLOSSARY.md`, `README.md`, `docs/adr/`, any other file in `docs/runbooks/`,
`tests/scenarios/broker-e2e/`, and every file under `src/`, `bin/`, `tests/`,
`skills/` and `templates/`.

### Exact contract

Two edits, both in `docs/runbooks/gws-broker.md`. **E1** is the gate-status
banner; **E2** is the live-proof assertion. Both follow the same rule: name the
thing, point at where the live answer lives, assert no current status.

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

## Contract reference

N/A — two prose paragraphs in one document. No interface, taxonomy, parser, error
path, authority boundary or downstream consumer changes; fewer than two of
ADR-0031's seven activation triggers fire.

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
- [ ] **AC5 (nothing else moved)** — `git diff --stat` shows exactly one file
      changed, `8 insertions(+), 7 deletions(-)`, and `git diff` shows the change
      confined to lines 7-9 and 121-124.
- [ ] **AC6** — line `:108` (*"which v1 does not do"*) is unchanged, and the file
      is 125 lines after the edit (124 + E2's one added line).
- [ ] `npm run lint` is green.

## Verification steps (run these; paste output in the PR)

```bash
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

# V6 (AC5, AC6) — the blast radius.
git diff --stat -- docs/runbooks/gws-broker.md
git diff -- docs/runbooks/gws-broker.md
wc -l docs/runbooks/gws-broker.md                           # expect 125
grep -n "which v1 does not do" docs/runbooks/gws-broker.md  # expect line 108

# V7 — lint (markdownlint runs over docs/**/*.md).
npm run lint

# V8 — the permission boundary (CI runs this too).
node scripts/boundary-check.js docs/specs/WP-gws-broker-runbook-destale.md \
  docs/runbooks/gws-broker.md
```

## Out of scope (do NOT do these)

- **`docs/THREAT-MODEL.md`** — it holds the one permitted live-state assertion
  (Current state §4) and the honest harness wording E2 mirrors (`:146`). Already
  correct. Do not edit it; defer to it.
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
   `docs(runbooks): de-stale the Google access banner and the harness claim (WP-gws-broker-runbook-destale)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
