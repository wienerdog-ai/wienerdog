---
id: WP-help-text-safety-gates
title: Fix the stale `safety` line in `wienerdog help` — the gates are no longer all disabled
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
---

# WP-help-text-safety-gates: one stale sentence in the CLI help text

## Context (read this, nothing else)

`wienerdog` is a command-line tool. Running `wienerdog help` (or `--help`, or
`-h`) prints a fixed block of text called `USAGE`, defined as a template literal
at the top of `bin/wienerdog.js`. It lists every command with a one-line
description written in plain language for knowledge workers, not developers.

One of those commands is `wienerdog safety`. It prints the current status of
Wienerdog's five **capability gates** — the code-owned on/off switches that
decide whether powerful actions (connecting a Google account, reading or sending
Gmail/Calendar/Drive, scheduling routines that read external content, injecting
the daily note summary into the session digest, automatic dream edits to identity
files) are permitted. Each gate is either `allowed` or `blocked`, and its status
can only change through a reviewed code change — never a flag, an environment
variable, or a runtime toggle.

**Until release 0.10.0 every gate was `blocked`**, pending a pre-use security
review. That review completed and the gates were flipped to `allowed`
(`WP-flip-frozen-profile-allowed`). The README and the user-facing docs were
brought up to date for launch. **The one-line description in `bin/wienerdog.js`
was flagged before launch and missed**, so `wienerdog help` still tells every
user that the gates are "all disabled until reviewed" — which is false, and
false in the direction that makes the product look less capable than it is.

This WP changes exactly one line of text. It adds no behavior, no flag, no file,
and no process (**IRON RULE, ADR-0004: Wienerdog is just files** — nothing here
starts anything).

## Current state

Read first-hand against the working tree at commit **`e7c845e`** on
**2026-08-01**.

### 1. The stale line — `bin/wienerdog.js:24`

Byte-exact, including the two leading spaces:

```text
  safety      Show the pre-use security gates (all disabled until reviewed)
```

It is one line inside the `USAGE` template literal that begins at
`bin/wienerdog.js:6` and ends at `:29`. Its neighbours, for column alignment:

```text
  memory      Approve identity-note changes so they inject into your session (typed confirmation)
  safety      Show the pre-use security gates (all disabled until reviewed)
```

Every command in the block is padded to a fixed column: **two leading spaces,
then the command name, then enough spaces that the description starts at column
15** (i.e. 14 characters precede every description). `safety` is 6 characters, so
it is followed by exactly 6 spaces.

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

Its own comment (`safety-profile.js:29-33`) states: *"THE RELEASED PROFILE. In
0.10.0 every gate is ALLOWED — the A0 pre-use freeze was lifted after its blocker
fixes cleared review (WP-flip-frozen-profile-allowed)."*

### 3. What `wienerdog safety` actually prints today — `src/cli/safety.js`

The whole file is 16 lines. Without `--json` it writes:

```text
Wienerdog capability status (code-owned safety gates).

  [allowed] google-setup — connecting a Google account
  [allowed] gws-use — reading or sending Gmail, Calendar, and Drive
  [allowed] external-content-routine — scheduling skill-based routines that read external content
  [allowed] daily-summary-injection — injecting the daily note summary into the session digest
  [allowed] identity-auto-activation — automatic dream edits to your identity files

These gates are set in code (no environment or CLI-flag override).
```

The bracketed token is the **per-gate status**, and its two possible values are
`allowed` and `blocked` (`safety-profile.js`'s `statusOf` throws on anything
else). `wienerdog safety --json` prints the same five rows as a JSON array. So
the command is a **per-gate status report**, not a notice that everything is off
— which is what the help line should say.

### 4. There is no test asserting this line

Checked at `e7c845e`:

- `grep -rn "pre-use security" tests/` — **no match**.
- The only test that runs `wienerdog help` at all is
  `tests/unit/broker-server.test.js:263-271`, whose name is
  *"broker-server: gws \_broker stays hidden — absent from wienerdog help
  output"*. It asserts only that the output does **not** contain the string
  `_broker`. It reads no command description and is unaffected by this change.
- `tests/unit/safety-cli.test.js` subprocess-tests `wienerdog safety` itself
  (all five gates print as `[allowed]`, the `--json` shape, no env/flag
  override). It never reads the `USAGE` block.

**Consequence for this WP: no test file is a deliverable.** Adding one is
explicitly out of scope (see below).

### 5. The only other occurrence of this wording is a historical record

`grep -rn "disabled until reviewed" .` (excluding `node_modules/` and `.git/`) at
`e7c845e` returns exactly two lines:

```text
bin/wienerdog.js:24
docs/specs/done/WP-109-safety-profile-and-preflight.md:208
```

The second is a **shipped spec in `done/`**, which is the project's changelog and
is never retro-edited. It is not a deliverable and must not be touched.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | bin/wienerdog.js | Replace **the single `safety` line inside `USAGE`** — currently line 24, and matched byte-exact by the removal block below; locate it by that text, not by the number. Change nothing else in the file — not another description, not the padding of any other line, not `USAGE`'s surrounding text, not the dispatch table (`:65` also mentions `safety` and is **not** this line). |

No test file is listed, deliberately: none asserts this text (Current state §4).

### Exact contract

**Remove this line, byte-exact:**

```text
  safety      Show the pre-use security gates (all disabled until reviewed)
```

**Insert this line in its place, byte-exact:**

```text
  safety      Show which sensitive actions Wienerdog allows or blocks
```

The two leading spaces and the six spaces after `safety` are unchanged, so the
description still starts at column 15 and the block stays aligned (Current state
§1). Nothing else on the line, and no other line, changes.

**This block is canonical.** The replacement line appears in exactly three places
in this spec: here, in **AC2**, and in **V3**'s grep pattern. This block decides;
those two are mirrors and must be updated with it in the same pass.

**Why this wording** (recorded so it is not re-litigated): it says what the
command shows — a per-gate verdict that can come back either way — without
asserting *which* verdict, so it cannot go stale again if a future reviewed
release blocks a gate. It uses no jargon: not "capability gate", not "safety
profile", not "code-owned", not "pre-use". "Sensitive actions" is the
plain-language stand-in for the five gated capabilities, and "allows or blocks"
mirrors the `[allowed]` / `[blocked]` token the command actually prints.

**"Sensitive", not "powerful" — a considered choice, recorded so it is not
re-proposed.** Gate round 1 offered `Show which powerful actions Wienerdog allows
or blocks`, borrowing `docs/GLOSSARY.md:43`'s own adjective, and explicitly did
not require it. **Declined.** The GLOSSARY says "powerful" while defining the
*mechanism's scope* for a developer reading a glossary; this line is read by a
knowledge worker scanning `wienerdog help`, where "powerful" reads as a boast
about capability and "sensitive" reads as the caution it actually is. The five
gated things — reading your mail, sending as you, editing your identity notes —
are sensitive first and powerful second. Consistency with the GLOSSARY is not
lost: neither text asserts a verdict, which is the property that matters.

## Contract reference

N/A — one line of user-facing help text; no interface, taxonomy, parser,
error-path, authority boundary or downstream consumer changes. Fewer than two of
ADR-0031's seven activation triggers fire.

## Implementation notes & constraints

- `USAGE` is a plain template literal. Do **not** convert it to a generated
  string, a table, or anything data-driven. That would be a different WP with a
  different risk profile.
- Do not "improve" any neighbouring description while you are in the file. Every
  changed line must trace to this spec, and the boundary check compares the diff
  against the Deliverables table.
- Do not add a test. See "Out of scope" for why, and for where the follow-up is
  routed.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made".

## Acceptance criteria

- [ ] **AC1 (red → green)** — `grep -n "disabled until reviewed" bin/wienerdog.js`
      exits **0 with a match before** the change and **1 with no output after**.
      Both runs pasted into the PR.
- [ ] **AC2** — `node bin/wienerdog.js help` prints the new line verbatim,
      including its leading whitespace.
- [ ] **AC3** — the help block stays aligned: in
      `node bin/wienerdog.js help`, the `safety` description starts at the same
      column as every other command's description.
- [ ] **AC4** — `git diff --stat -- bin/wienerdog.js` shows **one** file,
      **1 insertion, 1 deletion**; the only other changed file in the PR is this
      spec's `status:` flip. (Stated with the pathspec because an unscoped
      `--stat` necessarily shows two files, which contradicted the earlier
      "exactly one file changed" wording. V5 already scopes correctly.)
- [ ] **AC5** — `npm test` and `npm run lint` are green, with
      `tests/unit/broker-server.test.js` and `tests/unit/safety-cli.test.js`
      passing **unmodified**.

## Verification steps (run these; paste output in the PR)

```bash
# V1 (AC1) — BEFORE the edit. Expect one matching line, exit 0.
grep -n "disabled until reviewed" bin/wienerdog.js

# --- make the edit ---

# V2 (AC1) — AFTER the edit. Expect no output, exit 1.
grep -n "disabled until reviewed" bin/wienerdog.js

# V3 (AC2) — the new line is present, byte-exact with its indentation.
node bin/wienerdog.js help | grep -n "^  safety      Show which sensitive actions Wienerdog allows or blocks$"

# V4 (AC3) — every command description starts at column 15. Expect exactly one
# line of output: 15. (Verified to produce `15` on the untouched tree at e7c845e,
# so a change that misaligns the block is the only way this can print anything
# else.)
node bin/wienerdog.js help | sed -n '/^Commands:$/,/^$/p' | grep '^  [a-z]' \
  | awk '{ match($0, /^  [a-z-]+ +/); print RLENGTH+1 }' | sort -u

# V5 (AC4) — one file, one insertion, one deletion (ignoring this spec).
git diff --stat -- bin/wienerdog.js

# V6 (AC5)
npm test
npm run lint
```

## Out of scope (do NOT do these)

- **Adding a regression test for the help text.** None exists (Current state §4),
  and adding one would grow the Deliverables table past the single line this WP
  is scoped to. The residual is recorded honestly: **nothing mechanically
  prevents this line going stale again**, and closing that is routed as
  `WP-help-text-golden` (a golden-file check over the whole `USAGE` block, which
  guards every command description at once rather than this one). Do not build it
  here.
- **`docs/VISION.md`.** At `e7c845e` it still carries two claims of the same
  stale class — `:22` (*"in this build, Google senses and the routine catalog are
  off pending the pre-use security review"*) and `:51` (*"In the current
  security-hardened build the Google Workspace layer is disabled entirely behind
  a pre-use safety gate"*). Both are false since 0.10.0. They are **not** in this
  WP's Deliverables and must not be touched here; routed as
  `WP-vision-gate-status-destale`, which is a docs WP with its own reviewer.
- **`docs/GLOSSARY.md:43-47`**, whose **safety profile** entry reads *"Every
  capability is BLOCKED until its security gate is opened by a reviewed
  release"*. That sentence states the *rule* (and 0.10.0 was that reviewed
  release), so it is defensible as written — but it reads as a current-state
  claim and belongs in the same de-staling pass. Same routing, same prohibition:
  not here.
- **`src/core/safety-profile.js:65-69`**, whose refusal message says a blocked
  capability *"stays off until Wienerdog's pre-use security gates are cleared"*.
  That branch is unreachable today (no gate is `blocked`), so it is a latent
  wording bug, not a live one. Do not touch it.
- **`docs/specs/done/WP-109-safety-profile-and-preflight.md`.** `done/` is the
  project's changelog and records what shipped at the time. Never retro-edited.
- Any change to what `wienerdog safety` prints, to `src/cli/safety.js`, or to the
  gate values in `src/core/safety-profile.js`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of V1/V2 (AC1).
2. Branch `wp/help-text-safety-gates`; conventional commits; PR titled
   `docs(cli): describe what \`wienerdog safety\` shows (WP-help-text-safety-gates)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
