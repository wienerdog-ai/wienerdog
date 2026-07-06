---
id: WP-066
title: Dream catch-up reassurance across CLI summaries + README
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0014]
branch: wp/066-dream-catchup-reassurance
---

# WP-066: Dream catch-up reassurance across CLI summaries + README

## Context (read this, nothing else)

When a Wienerdog vault is first created, Wienerdog **silently schedules a nightly
memory pass ("dreaming") at 03:30 local time** (ADR-0014). Dreaming is the
mechanism that folds each day's sessions into the user's markdown memory vault —
it is the product's core value, so it is scheduled by default and the schedule is
**plainly disclosed** in the install/adopt summary.

Field feedback from a full setup on Windows: disclosing "dreaming is scheduled
for 03:30" is correct but **anxiety-inducing** — users conclude they must leave
their machine on overnight for memory to work. They do not. The catch-up logic
(WP-020) already guarantees that a dream missed while the machine was off or
asleep runs automatically on the next login / next timer tick. This flexibility
is a cornerstone of Wienerdog's philosophy and should read that way: plain,
reassuring, no jargon.

**This WP adds a frozen, one-sentence catch-up reassurance to every code/doc
surface that discloses the 03:30 dream schedule.** The disclosure surfaces were
enumerated by grepping `03:30`, `scheduled`, and `nightly` across `src/cli/`,
`skills/`, `templates/`, and `README.md`. The three surfaces that disclose the
schedule to a user are: `src/cli/init.js` (fresh-vault summary), `src/cli/adopt.js`
(adopt summary), and `README.md` (the Dreaming feature bullet). The `03:30`
occurrences in `src/cli/schedule.js` are code internals (a comment and the `at`
constant), not user-facing text — out of scope. `skills/wienerdog-routines/SKILL.md`
has **no** dream/03:30 mention, so it is not a disclosure surface. The
`skills/wienerdog-setup/SKILL.md` disclosure is handled by **WP-065** (parallel
WP that owns that file) — this WP shares no files with it.

**Product invariant (ADR-0014, must not be weakened):** the schedule stays
**plainly disclosed** — the reassurance *extends* the disclosure, it never
replaces or softens "we scheduled a nightly job at 03:30." **Iron rule
(ADR-0004): Wienerdog is just files** — this WP adds console lines and a doc
sentence; it starts nothing.

## Current state

**`src/cli/init.js`** — the fresh-vault summary block (currently lines ~163–172):

```js
  if (vaultStep) {
    const { ensureDreamSchedule } = require('./schedule');
    const d = ensureDreamSchedule(paths);
    console.log('\nwienerdog: installed with a fresh vault.');
    if (d.scheduled) {
      console.log(`Nightly memory (dreaming) is scheduled for ${d.at} to consolidate each day into your vault.`);
      console.log('Change or turn it off anytime: `wienerdog schedule remove dream`, or the routine menu (/wienerdog-routines).');
    } else if (d.reason === 'unsupported') {
      console.log('Nightly dreaming could not be auto-scheduled on this system yet; run `wienerdog dream` manually, or schedule it once supported.');
    }
    console.log('Run `wienerdog doctor` to check the setup.');
```

**`src/cli/adopt.js`** — the adopt summary block (currently lines ~299–303):

```js
  if (dream.scheduled) {
    console.log(`  Nightly dreaming: scheduled for ${dream.at} (change/disable: \`wienerdog schedule remove dream\` or /wienerdog-routines).`);
  } else if (dream.reason === 'unsupported') {
    console.log('  Nightly dreaming: could not be auto-scheduled on this system yet — run `wienerdog dream` manually.');
  }
```

**`README.md`** — the Dreaming feature bullet (currently line 54):

```markdown
- **Dreaming** — a nightly job reviews the day's conversations, promotes what matters into long-term memory through quality gates, and turns your repeated workflows into reusable skills. Every night is one git commit; anything can be reverted.
```

(Note: the adjacent routines bullet at line 56 already says "Laptop was closed at
run time? It catches up." — the Dreaming bullet is the one missing that promise.)

**`tests/unit/init.test.js`** — the ADR-0014 test (currently line 115) asserts
`assert.match(r.stdout, /dreaming/i)` after `init --fresh-vault --yes`, and the
config gets `at: "03:30"`. The test env sets `WIENERDOG_LOADER_NOOP=1`, so on the
CI platforms (macOS + ubuntu — both scheduling-supported) `d.scheduled` is
**true** and the scheduled branch (where the new line prints) is taken. The
no-vault test (line 131) asserts `assert.doesNotMatch(r.stdout, /dreaming/i)`.

There is **no** end-to-end stdout test for `adopt` (`tests/unit/adopt-git.test.js`
only unit-tests git helpers), so there is no adopt-stdout assertion to update.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/init.js | add the reassurance line inside the `if (d.scheduled)` branch |
| modify | src/cli/adopt.js | add the reassurance line inside the `if (dream.scheduled)` branch (2-space indent to match) |
| modify | README.md | append the reassurance sentence to the Dreaming bullet (line 54) |
| modify | tests/unit/init.test.js | assert the reassurance line prints on the scheduled path |

### Exact contracts

The canonical reassurance sentence, frozen — reproduce **verbatim** (em-dash `—`,
apostrophes in `don't` / `you're`) everywhere:

> If your computer is off or asleep at that time, don't worry — Wienerdog catches up automatically the next time you're back.

**1. `src/cli/init.js`** — inside the `if (d.scheduled) {` branch, insert one
line immediately **after** the "is scheduled for" line and **before** the
"Change or turn it off anytime" line:

```js
      console.log('If your computer is off or asleep at that time, don\'t worry — Wienerdog catches up automatically the next time you\'re back.');
```

**2. `src/cli/adopt.js`** — inside the `if (dream.scheduled) {` branch, insert
one line immediately **after** the "Nightly dreaming: scheduled for" line (note
the two leading spaces inside the string, matching the adopt summary indent):

```js
    console.log('  If your computer is off or asleep at that time, don\'t worry — Wienerdog catches up automatically the next time you\'re back.');
```

**3. `README.md`** line 54 — append the sentence to the end of the Dreaming
bullet (after "anything can be reverted."), so the bullet ends:

```markdown
… Every night is one git commit; anything can be reverted. If your computer is off or asleep at that time, don't worry — Wienerdog catches up automatically the next time you're back.
```

**4. `tests/unit/init.test.js`** — in the existing test
`'init --fresh-vault schedules the nightly dream and surfaces it (ADR-0014)'`
(line 115), add after the existing `assert.match(r.stdout, /dreaming/i);`:

```js
  // The catch-up reassurance is surfaced alongside the schedule (WP-066): users
  // must never think they have to leave the machine on overnight. Both CI OSes
  // (macOS, ubuntu) support scheduling, so d.scheduled is true and this prints.
  assert.match(r.stdout, /catches up automatically/i);
```

## Implementation notes & constraints

- **Durable posture (record here, no ADR needed):** every surface that discloses
  the 03:30 dream schedule must ALSO state the catch-up reassurance. This
  *extends* ADR-0014's "the summary states plainly that dreaming was scheduled"
  requirement — do NOT remove or weaken the disclosure of the time itself; only
  add the reassurance after it.
- Add the reassurance only on the **scheduled** branch. The `unsupported` branch
  already tells the user to run `wienerdog dream` manually — catch-up does not
  apply when nothing was scheduled, so do not add the sentence there.
- Match the surrounding string style: single-quoted JS strings with `\'`
  escaping (as shown). Do not reformat adjacent lines.
- No new npm deps; no logic changes; console output only.
- `skills/wienerdog-setup/SKILL.md` is owned by WP-065 — do not touch it here
  (that is how these two WPs stay parallel-safe).

## Security checklist

Deleted — this WP adds fixed console strings and a doc sentence; it touches no
untrusted input, no filesystem paths, and no shell commands.

## Acceptance criteria

- [ ] `init --fresh-vault` scheduled-summary prints the schedule line AND the
      catch-up reassurance sentence, verbatim.
- [ ] `adopt` scheduled-summary prints the schedule line AND the catch-up
      reassurance sentence, verbatim (2-space indent).
- [ ] README Dreaming bullet ends with the reassurance sentence.
- [ ] The three surfaces use byte-identical reassurance wording.
- [ ] `init.test.js` asserts `/catches up automatically/i` on the scheduled path;
      the no-vault test still asserts no `dreaming` output.
- [ ] Re-running `init`/`adopt` is unchanged in behavior (output-only change; the
      second-run idempotency tests still pass).

## Verification steps (run these; paste output in the PR)

```bash
node --test tests/unit/init.test.js
npm run lint
```

## Out of scope (do NOT do these)

- `skills/wienerdog-setup/SKILL.md` disclosure — **WP-065** owns it.
- `src/cli/schedule.js` (the `03:30` constant/comment) — code internals, not a
  disclosure surface.
- `skills/wienerdog-routines/SKILL.md` — no dream/03:30 mention; not a surface.
- A new adopt-stdout e2e test — none exists and creating the harness is out of
  scope for an S; the reassurance is byte-identical frozen text verified through
  `init.test.js`. If a reviewer wants adopt coverage, that is a follow-up.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/066-dream-catchup-reassurance`; conventional commits; PR titled
   `feat(cli): dream schedule catch-up reassurance in summaries + README (WP-066)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
