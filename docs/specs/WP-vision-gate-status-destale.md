---
id: WP-vision-gate-status-destale
title: De-stale the pre-use-security-review claims in VISION and GLOSSARY — the capability gates were opened in 0.10.0
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0026]
---

# WP-vision-gate-status-destale: three sentences that still say the product is switched off

## Context (read this, nothing else)

Wienerdog ships a **safety profile** (`src/core/safety-profile.js`): five named
**capability gates** covering the powerful things it can do — connecting a Google
account, reading or sending Gmail/Calendar/Drive, scheduling routines that read
external content, injecting the daily note summary into the session digest, and
automatic dream edits to identity notes. Each gate is either `allowed` or
`blocked`, and its value changes **only** through a reviewed code change to a
frozen constant — never at runtime, never by an environment variable, never by a
CLI flag. `wienerdog safety` prints the current status of all five.

The 2026-07-15 security audit (action **A0**) shipped every gate **blocked**
pending a pre-use security review. **That review completed and release 0.10.0
opened all five** (`WP-flip-frozen-profile-allowed`). `docs/THREAT-MODEL.md`'s
T0 section and the README were rewritten for launch and are correct today.
**`docs/VISION.md` was not**, and it still tells a reader — twice — that the
Google Workspace layer and the routine catalog are switched off. That is false,
and false in the direction that makes the product look less capable than it is.
`docs/GLOSSARY.md`'s **safety profile** entry reads the same way (see Decisions
below for why it is in scope).

This WP changes prose only. It adds no behavior, no file, no flag and no process
(**IRON RULE, ADR-0004: Wienerdog is just files** — nothing here starts
anything). It is the sibling of `WP-help-text-safety-gates`, which fixes the
same staleness class in the CLI help block.

## Current state

Read first-hand against the working tree at commit **`e7c845e`** on
**2026-08-01**.

### 1. The gates are all `allowed` — `src/core/safety-profile.js:34-40`

```js
const FROZEN_PROFILE = Object.freeze({
  'google-setup': 'allowed',
  'gws-use': 'allowed',
  'external-content-routine': 'allowed',
  'daily-summary-injection': 'allowed',
  'identity-auto-activation': 'allowed',
});
```

Its comment (`safety-profile.js:29-33`) says: *"THE RELEASED PROFILE. In 0.10.0
every gate is ALLOWED — the A0 pre-use freeze was lifted after its blocker fixes
cleared review (WP-flip-frozen-profile-allowed)."*

### 2. `docs/VISION.md:22` — stale claim #1

The last sentence of the paragraph ends with this parenthetical, byte-exact:

```text
(in this build, Google senses and the routine catalog are off pending the pre-use security review — see "What we will not do")
```

Both halves are false. The `gws-use` and `external-content-routine` gates are
`allowed`.

### 3. `docs/VISION.md:51` — stale claim #2

The last sentence of the "No sending without a grant" bullet, byte-exact:

```text
In the current security-hardened build the Google Workspace layer is disabled entirely behind a pre-use safety gate — see the threat model's T0 and run `wienerdog safety`.
```

False. It also mis-points the reader: T0 now says the opposite.

### 4. `docs/GLOSSARY.md:43-47` — stale claim #3

The complete five-line bullet, byte-exact at `e7c845e`
(`sed -n '43,47p' docs/GLOSSARY.md`):

```text
- **safety profile** — the code-owned, fail-closed record of which powerful
  capabilities are cleared for use (`src/core/safety-profile.js`). Every
  capability is BLOCKED until its security gate is opened by a reviewed release;
  there is no runtime/env/flag override. Inspect it with `wienerdog safety`. (Not
  a "sandbox" — that word means the unrelated `WIENERDOG_HOME` redirect guard.)
```

The sentence states a *rule* and 0.10.0 was that reviewed release, so it is
defensible as written — but `Every capability is BLOCKED` in capitals reads as a
current-state claim, in the file `CLAUDE.md` names as canonical. See Decisions.

### 5. What is already correct and must NOT be touched

- **`docs/THREAT-MODEL.md:24-30`** already carries the post-flip wording, and
  `:32-35` states it explicitly: *"The 2026-07-15 audit (action A0) initially
  shipped every gate **frozen (blocked)** until its P0 hardening landed. In
  **0.10.0** all five were opened after that hardening cleared review — each
  capability is now **allowed** …"*. This is the **canonical source** for the
  facts this WP restates. Do not edit it; defer to it.
- **`README.md:69`, `:70`, `:73`** already point at the command with no claim
  about which status. **The three are NOT byte-identical** — only `:70` reads
  *"run `wienerdog safety` to see the status of every gated capability"*; `:69`
  and `:73` insert "any time" (`:69` also capitalises: *"Run `wienerdog safety`
  any time to see the status of every gated capability."*). Match the
  **register**, not any one string.
- `grep -n -i "disabled\|blocked\|frozen\|off pending\|gated\|gate" docs/VISION.md`
  at `e7c845e` returns lines 22, 28, 49, 51 only. **Lines 28 and 49 are about
  daemons/servers, not capability gates** — they are unrelated and out of scope.
  So `docs/VISION.md` has exactly the two stale sentences named above.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/VISION.md | Replace **line 22's trailing parenthetical** and **line 51's trailing sentence** with the exact text below. Change nothing else in the file — not lines 28 or 49, not any other paragraph, not the footnote at `:37`. |
| modify | docs/GLOSSARY.md | Replace the whole `safety profile` bullet (`:43-47`) with the exact six-line text below — only its middle sentence changes; the `wienerdog safety` pointer and the "(Not a 'sandbox' …)" parenthetical are preserved verbatim. Change nothing else — not the `capability gate` bullet at `:48-50`, not any other term, and do not reorder the list. |

Not deliverables under any reading: `docs/THREAT-MODEL.md`, `README.md`,
`bin/wienerdog.js`, and every file under `src/`, `tests/`, `skills/`,
`templates/`.

### Exact contract

**The rule both edits follow, and it is not optional.** A dated *historical* fact
cannot go stale (0.10.0 shipped; `package.json` is already `0.12.0`). A *live
per-gate verdict* in prose goes stale the moment a reviewed release blocks a
gate — which is precisely how the two sentences being removed here came to be
wrong. **So: exactly one live-state assertion exists in the repo, in
`docs/THREAT-MODEL.md` T0. Every other surface points at `wienerdog safety` and
asserts nothing.** VISION carries no verdict at all; the GLOSSARY carries one
dated historical fact and no verdict.

**Edit 1 — `docs/VISION.md:22`.** Remove, byte-exact (note the leading space; the
sentence's final `.` sits *outside* the closing bracket and **stays exactly where
it is**):

```text
 (in this build, Google senses and the routine catalog are off pending the pre-use security review — see "What we will not do")
```

Insert in its place, byte-exact:

```text
 (Google senses and routines are both gated capabilities — run `wienerdog safety` to see what is allowed on your machine)
```

The subject is named explicitly rather than left as "both", because the sentence
contains an em-dash aside (*"— designed to deliver a spectacular first win within
a day —"*) whose noun is the nearer antecedent.

**Edit 2 — `docs/VISION.md:51`.** Remove, byte-exact:

```text
In the current security-hardened build the Google Workspace layer is disabled entirely behind a pre-use safety gate — see the threat model's T0 and run `wienerdog safety`.
```

Insert in its place, byte-exact:

```text
The Google Workspace layer is one of Wienerdog's gated capabilities — see the threat model's T0, and run `wienerdog safety` to see its status on your machine.
```

**Two things this replacement deliberately does NOT do**, both of which an
earlier draft of this spec got wrong and gate round 1 caught:

1. **It asserts no verdict.** A draft said *"…it was switched off until the
   pre-use security review finished, and it is on now"*. That re-arms the exact
   trap this WP exists to disarm: the next reviewed release that blocks
   `gws-use` makes VISION wrong again, in the same file, for the same reason.
2. **It contains no occurrence of the phrase `pre-use security review`.** That
   same draft did — which made **AC1 unsatisfiable by construction**, since AC1
   requires that phrase to be absent from `docs/VISION.md` after the edit
   (verified on scratch copies: the post-edit grep matched `:51` and exited 0).
   Fixing (1) fixes (2); if you reword this text, keep both properties.

**Edit 3 — `docs/GLOSSARY.md:43-47`.** This is a **whole-bullet replacement** —
replace all five lines at once, so there is no question about where the reflow
lands. Remove, byte-exact:

```text
- **safety profile** — the code-owned, fail-closed record of which powerful
  capabilities are cleared for use (`src/core/safety-profile.js`). Every
  capability is BLOCKED until its security gate is opened by a reviewed release;
  there is no runtime/env/flag override. Inspect it with `wienerdog safety`. (Not
  a "sandbox" — that word means the unrelated `WIENERDOG_HOME` redirect guard.)
```

Insert in its place, byte-exact (five lines; the parenthetical and the
`wienerdog safety` pointer are preserved verbatim, only the middle sentence
changes):

```text
- **safety profile** — the code-owned, fail-closed record of which powerful
  capabilities are cleared for use (`src/core/safety-profile.js`). A capability
  stays blocked until a reviewed release opens its gate; there is no
  runtime/env/flag override. All five gates were opened in 0.10.0. Inspect it
  with `wienerdog safety`. (Not a "sandbox" — that word means the unrelated
  `WIENERDOG_HOME` redirect guard.)
```

Note the replacement is **six** lines to the original's five — that is expected
(the sentence grew); do not compress it back to five.

**Why this wording** (recorded so it is not re-litigated):

- **It never asserts a per-gate verdict in prose.** VISION points at
  `wienerdog safety` for the live answer, exactly as the README already does, so
  a future reviewed release that blocks a gate cannot re-stale these sentences.
  Only the GLOSSARY carries the one dated fact (`opened in 0.10.0`), because a
  definitions entry should say *when* the rule last fired.
- **It keeps the rule, which is the load-bearing part.** "Stays blocked until a
  reviewed release opens its gate; no runtime/env/flag override" is the actual
  guarantee, and it survives verbatim.
- **Plain language.** No "frozen profile", no "A0", no "pre-use safety gate" as a
  noun. "Gated capabilities" is used once and immediately cashed out by the
  command that shows them.
- **It defers to `docs/THREAT-MODEL.md` T0** (Current state §5) rather than
  restating its detail, so there is one canonical source for the flip and two
  pointers to it.

## Contract reference

N/A — three prose sentences in two documents. No interface, taxonomy, parser,
error path, authority boundary or downstream consumer changes; fewer than two of
ADR-0031's seven activation triggers fire.

## Implementation notes & constraints

- Do not restate the audit history in VISION. `docs/THREAT-MODEL.md:32-35` owns
  it; VISION points there.
- Do not "improve" adjacent VISION or GLOSSARY prose while you are in the files.
  Every changed line must trace to this spec.
- **On the frontmatter `adrs:` list.** Gate round 1 suggested naming "the
  safety-profile / capability-gate ADR"; **there is no such ADR** — the safety
  profile shipped in `WP-109-safety-profile-and-preflight` without one
  (`grep -rl "safety profile\|FROZEN_PROFILE\|capability gate" docs/adr/` returns
  only 0021, 0025, 0026 and 0032, all of which *consume* a gate rather than
  define the mechanism). `ADR-0026` is added because it owns the `gws-use` gate's
  substance — the broker both VISION `:51` sentences describe. `ADR-0004` stays
  because this WP asserts it adds no process. **Do not invent a
  safety-profile ADR to satisfy this bullet**; if one is ever wanted, it is its
  own work.
- Do not renumber, reorder or reflow the GLOSSARY bullet list.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made".

## Acceptance criteria

- [ ] **AC1 (red → green)** — `grep -rn "pre-use security review" docs/VISION.md`
      and `grep -rn "disabled entirely behind a pre-use safety gate" docs/VISION.md`
      each match **before** the change and match **nothing after**. All four runs
      pasted into the PR.
- [ ] **AC2** — `grep -n "BLOCKED" docs/GLOSSARY.md` matches nothing after the
      change.
- [ ] **AC3** — the three replacement strings are present byte-exact.
- [ ] **AC4** — an **unscoped** `git diff --stat` shows exactly **three** files
      changed: `docs/VISION.md`, `docs/GLOSSARY.md`, and this spec (its `status:`
      flip). **`docs/THREAT-MODEL.md` and `README.md` are not among them** — and
      the diff must be unscoped, because a `-- docs/` pathspec cannot show
      `README.md` at all and would make this criterion vacuous.
- [ ] **AC5** — `npm run lint` is green (markdownlint over `docs/**/*.md`).
- [ ] **AC6** — `npm test` is green. Nothing should depend on this prose; if a
      golden fixture does, that is a discovered issue for the PR body, not a
      reason to edit the fixture.

## Verification steps (run these; paste output in the PR)

```bash
# V1 (AC1) — BEFORE. Expect one matching line each, exit 0.
grep -n "pre-use security review" docs/VISION.md
grep -n "disabled entirely behind a pre-use safety gate" docs/VISION.md

# V2 (AC2) — BEFORE. Expect one matching line, exit 0.
grep -n "BLOCKED" docs/GLOSSARY.md

# --- make the three edits ---

# V3 (AC1, AC2) — AFTER. Expect no output, exit 1, for all three.
grep -n "pre-use security review" docs/VISION.md
grep -n "disabled entirely behind a pre-use safety gate" docs/VISION.md
grep -n "BLOCKED" docs/GLOSSARY.md

# V4 (AC3) — the replacements are present. Expect one line each.
grep -n "run \`wienerdog safety\` to see what is allowed on your machine" docs/VISION.md
grep -n "one of Wienerdog's gated capabilities — see the threat model" docs/VISION.md
grep -n "All five gates were opened in 0.10.0" docs/GLOSSARY.md

# V5 (AC4) — NO pathspec. AC4 asserts README.md and THREAT-MODEL.md are
# unchanged, and a `-- docs/` pathspec would hide README.md (and bin/, src/)
# from the output entirely, making the assertion unfalsifiable.
git diff --stat

# V6 (AC5, AC6)
npm run lint
npm test
```

**Baseline on the untouched tree at `e7c845e`**, so a red V1/V2 is recognisable
as "the work is not done" rather than "the command is wrong": V1 prints
`22:` and `51:`; V2 prints `45:`.

**All three edits were simulated on scratch copies at `e7c845e`, and this spec's
own criteria were run against the result.** The simulation asserts each removal
block matches **byte-exact** before replacing it (it throws otherwise), so this
also proves the three "Remove, byte-exact" blocks above are correct:

```text
--- AC1 / V3 (must be ABSENT from VISION) ---
PASS  pre-use security review (found=false, want=false)
PASS  disabled entirely behind a pre-use safety gate (found=false, want=false)
--- AC2 / V3 (must be ABSENT from GLOSSARY) ---
PASS  BLOCKED (found=false, want=false)
--- AC3 / V4 (must be PRESENT) ---
PASS  V4a (found=true, want=true)
PASS  V4b (found=true, want=true)
PASS  V4c (found=true, want=true)

resulting VISION:22 = "…he stack (Google senses and routines are both gated
  capabilities — run `wienerdog safety` to see what is allowed on your machine)."
resulting VISION:51 = "…T4a). The Google Workspace layer is one of Wienerdog's
  gated capabilities — see the threat model's T0, and run `wienerdog safety` to
  see its status on your machine."
```

The `VISION:22` line also confirms the point Edit 1 makes: the sentence's final
`.` is **outside** the closing bracket before and after, and does not move.

**Note on `docs/VISION.md:51`'s apostrophe.** The removal block uses a **straight
apostrophe** in `model's` (`0x27`, verified with `od -c`), not a typographic
`’`. Copy it from this spec or from the file; retyping it in an editor with smart
quotes enabled will silently break the byte-exact match.

## Out of scope (do NOT do these)

- **`src/core/safety-profile.js:65-69`**, whose refusal message says a blocked
  capability *"stays off until Wienerdog's pre-use security gates are cleared"*.
  That branch is **unreachable today** — `requireCapability` throws only when a
  gate is `blocked`, and none is — so it is a latent wording bug, not a live
  one. Fixing it means editing `src/`, which this docs-only WP must not do. Left
  as a recorded residual; if it is ever worth fixing it belongs with whatever
  change next blocks a gate.
- **`bin/wienerdog.js:24`**, the stale `safety` help line. That is
  `WP-help-text-safety-gates`, which has its own Deliverables table listing only
  that file. Do not fix it here — two WPs editing the same launch-day staleness
  in one PR is exactly the boundary violation the Deliverables table exists to
  stop.
- **`docs/THREAT-MODEL.md`** and **`README.md`** — already correct (Current
  state §5), and this WP's whole design is to defer to them.
- `docs/VISION.md:28` and `:49`, which match a `gate`/`daemon` grep but are about
  the no-daemon invariant, not capability gates.
- Any change to what `wienerdog safety` prints, or to the gate values.
- Any other GLOSSARY term, including `capability gate` (`:48-50`), which is
  already correct: *"A blocked gate makes its feature fail closed …"* states the
  rule without claiming any gate is blocked.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of V1/V2 → V3 (AC1, AC2).
2. Branch `wp/vision-gate-status-destale`; conventional commits; PR titled
   `docs(vision): the capability gates were opened in 0.10.0 (WP-vision-gate-status-destale)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Provenance.** Found by the architect's post-launch pass on 2026-08-01 while
> specifying `WP-help-text-safety-gates`: a repo-wide grep for the 0.10.0
> gate-flip staleness class turned up the CLI help line (routed there) plus these
> three sentences. The task brief for that pass stated VISION had already been
> de-staled for launch; **it had not been**, and that is the reason this WP
> exists. All claims above were read first-hand at `e7c845e`.
>
> **Decision — `docs/GLOSSARY.md` is IN the Deliverables table.** The
> counter-argument was considered and is recorded rather than dropped: the
> sentence states a *rule* ("blocked until a reviewed release opens its gate")
> and 0.10.0 *was* that release, so unlike the two VISION sentences it is not
> literally false, and a strict reading of the sizing discipline would leave it
> out. It is included anyway, for three reasons. **(1)** It is the same staleness
> class from the same event, and splitting one de-staling pass across two WPs is
> precisely how the CLI help line survived launch — the failure mode is
> documented and recent. **(2)** `CLAUDE.md` names `docs/GLOSSARY.md` canonical,
> so a reader resolving "safety profile" there meets `Every capability is
> BLOCKED` in capitals in the highest-authority place the product has to be
> wrong. **(3)** The edit is one sentence in one bullet; the WP stays **S**.
> If the owner disagrees, dropping it is a two-line edit: remove the
> `docs/GLOSSARY.md` row and Edit 3, and delete AC2 and its greps.
>
> **Gate round 1 UPHELD that decision on the merits**, and sharpened the reason
> into a rule this spec now states in Exact contracts: *a dated historical fact
> ("opened in 0.10.0") cannot re-stale — `package.json` is already `0.12.0` — but
> a live per-gate verdict can.* The GLOSSARY row stays because it carries the
> first kind and none of the second.
>
> **2026-08-01 — gate round 1 corrections (verdict: REQUEST CHANGES).**
>
> - **(a) AC1 could never go green.** Edit 2's own replacement text contained the
>   phrase `pre-use security review`, which AC1/V3 require **absent** from
>   `docs/VISION.md` after the edit (verified on scratch copies: the post-edit
>   grep matched `:51` and exited 0).
> - **(a) Edit 2 violated this spec's own invariant.** It asserted a live verdict
>   (*"and it is on now"*) about `gws-use` — re-arming exactly the trap this WP
>   disarms, in the same file, for the same reason. Both findings are closed by
>   one rewrite: Edit 2 now asserts **no** verdict and points at
>   `wienerdog safety`, which also removes the offending phrase. The
>   dated-fact-yes / live-verdict-no rule is stated explicitly so a future
>   reword cannot re-break it.
> - **(a) V5's `-- docs/` pathspec blinded AC4.** AC4 asserts `README.md` and
>   `docs/THREAT-MODEL.md` are unchanged, but the pathspec excluded `README.md`
>   (and `bin/`, `src/`) from the output entirely, so the criterion could not
>   fail. Pathspec dropped.
> - **(b) Current state §4's evidence block was a four-line abridgment** labelled
>   `:43-47` — it truncated `:46` after *"wienerdog safety."* and omitted `:47`.
>   Replaced with the full five-line bullet and a `sed` command to re-derive it.
> - **(b) Edit 1's parenthetical was factually wrong** — it said the sentence's
>   final `.` "moves after the closing bracket"; the period is already outside the
>   paren at `:22` and stays put (simulated). Corrected.
> - **(b) §5 presented a paraphrase as a quote** — only `README.md:70` is
>   byte-exact; `:69` and `:73` insert "any time", and `:69` capitalises "Run".
>   Now marked as a register to match, not a string to copy.
> - **(adv, taken)** Edit 1 names its subject (*"Google senses and routines"*)
>   rather than saying "both", because the sentence's em-dash aside supplies a
>   competing nearest antecedent.
> - **(adv, taken with a correction)** The suggestion to cite "the
>   safety-profile / capability-gate ADR" rests on a false premise — **no such
>   ADR exists**. `ADR-0026` (the GWS capability broker) is added instead, since
>   it owns the substance of the `gws-use` gate that VISION `:51` describes; the
>   reasoning is recorded in Implementation notes so it is not re-proposed.
