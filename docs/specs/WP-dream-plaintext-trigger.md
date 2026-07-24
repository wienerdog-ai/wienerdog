---
id: WP-dream-plaintext-trigger
title: Dream trigger is plain text (not a leading slash command) + a dream non-vacuity guard
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0025]
branch: wp/dream-plaintext-trigger
---

# WP-dream-plaintext-trigger: plain-text dream trigger + non-vacuity guard

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent Claude/Codex sessions into the
user's markdown vault. It runs headlessly: the scheduler fires `wienerdog dream
--yes`, which spawns the **brain** — `claude -p "<prompt>"` under a hermetic
runtime profile (ADR-0025): no Bash, no network, no ambient setting source
(`--setting-sources ""`), tool access to the vault + a read-only scratch dir
only, and the dream skill's instructions delivered via
`--append-system-prompt` (the integrity-checked vendored skill body). **IRON
RULE (ADR-0004): Wienerdog is just files.** This WP adds no daemon, server, or
telemetry — it changes one prompt string and one failure check.

Because the hermetic run passes `--setting-sources ""`, **no skill is registered
as a slash command**. The `-p` prompt is meant to be a *trigger* — the actual
work comes from the appended skill body. But `src/core/dream/brain.js`'s
`DREAM_PROMPT()` still builds a prompt whose **first line is the bare slash
command `/wienerdog-dream`** (followed by context lines). A sibling WP already
fixed exactly this class for skill *routines* — **WP-routine-plaintext-trigger**
(commit `8d6b186`, shipped 0.10.0): its finding was that **Claude Code ≥2.1.216
parses a `-p` prompt that is *only* a slash command as a command lookup and
hard-errors `Unknown command`**, and its fix replaced the bare-slash trigger
with a plain-text directive. That WP explicitly left the dream unchanged,
believing the dream's *multi-line* prompt was treated as regular text.

**The 2026-07-24 production incident disproves that belief for claude 2.1.217.**
The first run of the 0.10.0 hermetic dream path failed: the brain's stdout was
exactly `Unknown command: /wienerdog-dream` (captured in
`~/.wienerdog/logs/dream/2026-07-24.log`). Auth was fine and the containment
probe passed. **New fact: claude 2.1.217 rejects a prompt whose *first line* is a
slash command even when more lines follow.** The unregistered command lookup
fails, the brain does nothing, and — because `claude -p` still exits `0` — the
dream orchestrator **certified the empty run as success**: it committed a
vacuous `dream: 2026-07-24 — 0 notes, 0 skills` (vault commit `96b2037`), wrote
a clean report, and **advanced the per-file transcript ledger** (recording every
fed session as processed), so those sessions would be silently skipped forever.

This WP does two surgical things:

1. **Trigger fix** — make `DREAM_PROMPT()`'s trigger plain text (no leading
   slash anywhere in the `-p` prompt), mirroring `8d6b186`.
2. **Non-vacuity guard** — make the orchestrator FAIL LOUD (nonzero exit,
   durable alert, no commit, no ledger advance) when the brain demonstrably did
   no work, using the concrete `Unknown command:` stdout signal.

The incident's recovery step (verifying/reverting the wrongly-advanced ledger)
is a **maintainer-run verification step** in this spec, not new product code.

### Two invariants that matter here

- **Watermark-safety (WP-069, per-file since ADR-0023):** the dream advances a
  session's state ONLY after the brain exited 0, its inputs were intact, AND the
  commit succeeded. A brain that consolidated nothing must not advance state.
- **Fail-closed:** a hermetic-runtime failure halts the dream loudly (`run-job`
  records a durable alert + `last_status:'error'`); it never silently "succeeds".

## Current state

**`src/core/dream/brain.js`**

- `DREAM_PROMPT(scratchDir, vaultDir, date, layout)` (~line 31) returns a
  `\n`-joined array whose **first element is the literal `'/wienerdog-dream'`**
  (line 34), followed by a blank line and the path/layout context lines. This
  one function feeds BOTH the Claude prompt (`buildClaudeArgs` → `-p`) and the
  Codex positional prompt (`buildCodexArgs`).
- `spawnBrain(o)` spawns the pinned brain and returns `{ child, done }`. `done`
  resolves `{ code, durationMs, stderrTail }`. Today it captures a bounded
  **stderr** tail (redacted) but **does not surface anything from stdout** to the
  caller; stdout is only teed to `logStream` (lines ~271–275) when a `logStream`
  is provided. `STDERR_TAIL_MAX = 4096` (line 17).
- The `"Unknown command: /wienerdog-dream"` text is written by `claude -p` to
  **stdout**, so it never reaches `stderrTail`.

**`grep -rn "'/wienerdog" src/`** returns exactly ONE hit: `brain.js:34`. The
routine trigger was already de-slashed in `8d6b186`. `resolveCommand`
(`src/cli/run-job.js`) maps only `builtin:dream` (→ `wienerdog dream --yes`) and
`skill:<id>`; there is **no other builtin (catchup/weekly) that builds a
leading-slash `-p` prompt**. Scope is the dream alone.

**`src/cli/dream.js`** — the orchestrator `run(argv, opts)`:

- Step 11 (~line 467): `await runBrainWithWatchdog({...})` inside a `try/catch`
  whose `catch` calls `restoreVaultToHead(vaultDir)` then rethrows (lines
  491–494). `runBrainWithWatchdog` throws `dream brain exited N` on a nonzero
  brain exit.
- Step 12 (~line 507): `scratchIntact(...)` gate — on failure it
  `restoreVaultToHead` + throws (no ledger advance).
- Step 13 (~line 516): `validateAndCommit(...)` — always creates the report file
  and makes exactly one commit (notes/skills counted; the report dir is excluded
  from `notes`, so a do-nothing run commits `0 notes, 0 skills`).
- Step 14 (~line 531): `for (const d of sel.processed) ledger =
  recordProcessed(ledger, d); writeLedger(...)` — **this is the state advance.**

In the incident: brain exited 0 → `scratchIntact` true (inputs untouched) →
`validateAndCommit` committed `0 notes` → `recordProcessed` advanced the ledger.
Placing the guard so it throws **before** step 12 makes `dream.js`'s existing
`catch` restore the vault and rethrow, and steps 13–14 never run — so **no
commit, no report, no ledger advance**, and `run-job` fails loud.

**`src/core/dream/watermarks.js`** — `watermarks.json` is **legacy**: it is only
*read once* by `ledger.migrateFromWatermarks` to seed a baseline. `writeWatermarks`
has **no caller in the dream pipeline**. The real per-session state store is
`state/transcript-ledger.json` (`src/core/dream/ledger.js`). (See "changes to the
incident analysis" — item 3 addresses the ledger, not `watermarks.json`.)

**`src/scheduler/descriptor.js`** (lines ~100–103) pins the dream's `promptHash`
as `sha256(sha256(DREAM_PROMPT('<scratch>','<vault>','<date>')) +
sha256(vendored dream skill body))`. **Changing `DREAM_PROMPT` changes this
hash**, so the descriptor drifts until `wienerdog sync` regenerates it (item 4).

**Tests today:** `tests/unit/dream-brain.test.js:61` asserts the prompt
`includes('/wienerdog-dream')`; the `spawnBrain` `done` tests assert only
`stderrTail`. `tests/integration/dream.test.js` drives the full pipeline through
`tests/fixtures/dream/fake-brain.js` (a node fixture with `WIENERDOG_FAKE_BRAIN_MODE`
branches: `crash`, `hang`, `vanish-scratch`); the `vanish-scratch` test
(~line 568) is the exact template for a "no commit, no ledger record, fails loud"
assertion. No test pins a *literal* dream `promptHash` (`descriptor.test.js:196`
only asserts the `^sha256:` shape), and no golden fixture contains the prompt —
so no golden updates are needed.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip) and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/brain.js | (a) `DREAM_PROMPT`: replace the leading `'/wienerdog-dream'` element with the plain-text trigger (Table A, row *Trigger*) — no leading slash anywhere. (b) `spawnBrain`: capture a bounded stdout head and add `sawUnknownCommand` to the `done` resolve (Table A, rows *Marker*, *Signal field*). |
| modify | src/cli/dream.js | In `runBrainWithWatchdog`, after the `result.code !== 0` throw, throw a `WienerdogError` when `result.sawUnknownCommand` is true (Table A, row *Abort behavior*). No other change — the existing `catch` restores the vault and steps 13–14 are skipped. |
| modify | tests/unit/dream-brain.test.js | Flip the `includes('/wienerdog-dream')` assertion to: the `-p` prompt is NOT a bare slash command and names `wienerdog-dream` (mirror `8d6b186`'s routine test). Add a `spawnBrain` test: a fake brain that prints `Unknown command: /wienerdog-dream` to stdout and exits 0 resolves `done` with `sawUnknownCommand === true`; a normal brain resolves `false`. |
| modify | tests/fixtures/dream/fake-brain.js | Add a `WIENERDOG_FAKE_BRAIN_MODE === 'unknown-command'` branch: `process.stdout.write('Unknown command: /wienerdog-dream\n')` then `process.exit(0)`, writing NOTHING to the vault (models the real failure). |
| modify | tests/integration/dream.test.js | Add a test (mirror the `vanish-scratch` test ~line 568): running the dream with `WIENERDOG_FAKE_BRAIN_MODE: 'unknown-command'` throws (fails loud), makes NO commit (commit count unchanged), writes NO ledger record for the fed transcript, and leaves the vault clean. |
| modify | tests/unit/codex-adapter.test.js | one-line assertion update — the Codex positional prompt shares DREAM_PROMPT; expect the Table A plain-text trigger, not the retired '/wienerdog-dream' (added by maintainer amendment after implementation surfaced the literal-match) |

### Exact contracts

`DREAM_PROMPT` keeps its signature and all context lines; only the first array
element changes:

```js
// BEFORE:  '/wienerdog-dream',
// AFTER (no leading slash anywhere in the prompt):
'Run the wienerdog-dream memory-consolidation routine now. Follow the instructions in your system prompt and use only your available tools.',
```

`spawnBrain` stdout capture + signal (keep it bounded and fail-closed):

```js
/** Cap on the brain-stdout HEAD retained to detect the non-vacuity marker. */
const STDOUT_HEAD_MAX = 4096;
// (maintainer amendment, 2026-07-24 Codex review — whole-output discriminator)
// ...inside spawnBrain: attach a child.stdout 'data' handler UNCONDITIONALLY
// (today it is attached only when logStream is set). Per chunk, redact, then:
//   stdoutTotalLen += redacted.length;                              // cheap counter
//   stdoutHead = (stdoutHead + redacted).slice(0, STDOUT_HEAD_MAX); // keep the HEAD
//   if (logStream) logStream.write(redacted);                       // unchanged tee
// isBareUnknownCommand(text): strip ANSI (/\x1b\[[0-9;]*[A-Za-z]/g), trim, then
// test the ENTIRE remaining text against /^Unknown command: \/\S+$/ — i.e. the
// whole output is exactly one CLI diagnostic line, nothing else.
// done resolves the existing fields PLUS (round 2 — stderr branch normalized):
//   sawUnknownCommand:
//     stdoutTotalLen <= STDOUT_HEAD_MAX &&
//     (isBareUnknownCommand(stdoutHead) ||
//       (stdoutHead.replace(ANSI_RE, '').trim() === '' && isBareUnknownCommand(stderrTail)))
// Accepted residual (JSDoc-documented): a >STDOUT_HEAD_MAX startup banner
// preceding the rejection is not detected — the plaintext trigger is the
// primary defense; the residual failure mode is the pre-fix vacuous run.
```

`done` result shape becomes `{ code, durationMs, stderrTail, sawUnknownCommand }`.

`runBrainWithWatchdog` abort (in `dream.js`, immediately after the existing
`result.code !== 0` branch) — COMPOUND per Table A row *Abort behavior*: the
text signal AND an untouched vault (probed by reusing the already-imported
`assertCleanTree`, i.e. pinned-git `status --porcelain` emptiness; round 3 —
its throws are DISCRIMINATED: dirty tree suppresses the abort, a git EXECUTION
failure rethrows loudly because a probe that cannot run yields no evidence):

```js
if (result.sawUnknownCommand) {
  let vaultUntouched = true;
  try {
    assertCleanTree(vaultDir);
  } catch (probeErr) {
    if (probeErr instanceof WienerdogError && probeErr.message.startsWith('vault has uncommitted changes')) {
      vaultUntouched = false; // dirty tree — the brain performed writes
    } else {
      throw probeErr; // probe could not run — no evidence; fail loud
    }
  }
  if (vaultUntouched) {
    throw new WienerdogError(
      'dream aborted: the brain did not run — Claude rejected the trigger prompt as an ' +
        'unknown slash command (no sessions were consolidated; nothing was committed and the ' +
        'transcript ledger was not advanced, so these sessions are retried next run). ' +
        'Update/repair Claude Code and re-run `wienerdog sync`.'
    );
  }
}
```

## Contract reference (this WP IS contract-dense)

Activation trigger (ADR-0031 2-of-7): **(iv)** a new error/abort behavior is
introduced, and **(vii)** the same two facts (the plain-text trigger; the
`Unknown command:` marker + resulting abort) must appear in multiple mirrored
surfaces (source, tests, fixture, and the descriptor's hashed template). Table A
is the single source of truth; every other mention defers to it.

### Contract table — Table A: dream trigger + non-vacuity signal

| Contract | Fact / rule | Value (canonical) |
|----------|-------------|-------------------|
| Trigger | The dream `-p` prompt's first line | `Run the wienerdog-dream memory-consolidation routine now. Follow the instructions in your system prompt and use only your available tools.` |
| Trigger | Leading slash anywhere in the `-p` prompt | FORBIDDEN — no line may start with `/` (regex reference: the whole prompt must not match `/^\s*\/\S+\s*$/` and its first line must not start with `/`) |
| Marker | Non-vacuity failure signal — TEXT half of a compound signal (maintainer amendments, 2026-07-24 Codex rounds 1+2) | the run's ENTIRE output is a single bare CLI diagnostic: `isBareUnknownCommand(text)` = ANSI-strip (`/\x1b\[[0-9;]*[A-Za-z]/g`) + trim, then whole-text match `/^Unknown command: \/\S+$/`. `sawUnknownCommand` = `stdoutTotalLen <= STDOUT_HEAD_MAX` AND (`isBareUnknownCommand(stdoutHead)` OR (stdoutHead ANSI-stripped trims to `''` AND `isBareUnknownCommand(stderrTail)`)). The stderr branch is normalized-empty: it requires the ENTIRE stdout captured AND trimming to empty, so whitespace-only stdout (e.g. `"\n"`) does not defeat it. A marker-shaped line amid real output can never match (a real dream emits substantial stdout). |
| Signal field | `spawnBrain` `done` result | gains `sawUnknownCommand: boolean` (alongside `code`, `durationMs`, `stderrTail`) |
| Capture bound | stdout retained for the match | first `STDOUT_HEAD_MAX = 4096` bytes (redacted), kept as a HEAD, plus a cheap `stdoutTotalLen` counter of total redacted bytes seen |
| Accepted residual | marker preceded by a >`STDOUT_HEAD_MAX` startup banner | NOT detected (documented in the guard's JSDoc) — the PRIMARY defense is the plain-text trigger; this guard is defense-in-depth for a reintroduced-slash regression, and the residual failure mode is the pre-fix status quo (a vacuous run), not a new risk |
| Abort behavior | COMPOUND: when `sawUnknownCommand` is true AND the vault is untouched since run start; probe failures DISCRIMINATED (maintainer amendments, 2026-07-24 Codex rounds 2+3) | `runBrainWithWatchdog` re-checks the vault tree (pinned-git `status --porcelain` emptiness via the already-imported `assertCleanTree`; the tree was asserted clean immediately before the brain spawned). Probe outcomes: **CLEAN** → throw the abort `WienerdogError` (a genuine CLI rejection performs no work, so this can never miss it). **DIRTY tree** (assertCleanTree's semantic failure — matched by the stable `vault has uncommitted changes` message prefix on a `WienerdogError`; both failure classes are `WienerdogError` with no code field, so message-prefix matching is the only discriminator) → suppress the abort; a writes-performing run that merely emits the marker (injection-steered — transcripts are untrusted) proceeds into `validateAndCommit`'s validation/revert machinery instead (kills the nightly retry-DoS). **GIT EXECUTION failure** (spawn/pin/repo error — any other throw) → RETHROW loudly: a probe that cannot run yields NO evidence either way — fail closed, don't guess; a transient git error costs one loud failed run (self-healing retry next night), never a silent certification of a do-nothing run. On abort/rethrow: `dream.js` `catch` restores the vault → **no `validateAndCommit`, no `recordProcessed`, no ledger advance** → `run-job` fails loud (durable alert + `last_status:'error'`, nonzero exit) |
| Non-goal | broader "zero tool activity" detection | OUT of scope (fragile, false-positive-prone); the marker is the only signal this WP adds |

### Mirrored Surface Checklist

Every surface that mirrors Table A defers to it; a review finding updates Table A
and all rows below in one pass:

- [ ] Deliverables cells — `brain.js` (trigger + signal), `dream.js` (abort),
      the three test/fixture rows.
- [ ] Acceptance criteria that assert the trigger is not a bare slash and that
      the `unknown-command` run fails loud with no commit/no ledger advance.
- [ ] Verification greps — `grep -rn "'/wienerdog" src/` returns nothing; the
      new tests exercise the marker.
- [ ] Current-state description of `DREAM_PROMPT`, `spawnBrain.done`, and
      `descriptor.js`'s `promptHash`.
- [ ] Operative prose: the `## Exact contracts` code block (trigger string,
      `STDOUT_HEAD_MAX`, marker regex, abort message).
- [ ] Indirect mirror (NOT edited, but registered): `descriptor.js` hashes
      `DREAM_PROMPT(...)`; the trigger change flows through it automatically —
      hence the mandatory `wienerdog sync` in item 4 / verification.

## Implementation notes & constraints

- **No new npm deps; zero-runtime-dep rule holds.** Pure Node.
- **Minimal, fail-closed detection only.** Do not add a "counted tool reads /
  transcript activity" detector — it is out of scope and error-prone. The
  `Unknown command:` marker is deterministic for this failure class and can
  never be a legitimate dream output. Its wording-dependence is an accepted
  limitation; the **trigger fix is the primary defense**, the guard is
  defense-in-depth against a future parser change.
- **Chunk-boundary robustness:** capture a bounded stdout HEAD (accumulate then
  `slice(0, STDOUT_HEAD_MAX)`) rather than testing each raw chunk, so a marker
  split across the first pipe boundary is still matched. (Mirrors brain.js's
  existing bounded-buffer idiom for `stderrTail`.)
- **Do not touch the Codex path's structure.** `DREAM_PROMPT` is shared;
  changing its first line updates the Codex positional prompt too, which is
  correct and desirable (plain text is fine for `codex exec`). No separate Codex
  change.
- **Descriptor drift is expected and load-bearing.** Do NOT try to keep the old
  `promptHash`. After merge the maintainer runs `wienerdog sync` (item 4) to
  re-pin it; the descriptor test asserts only the `^sha256:` shape, so `npm
  test` stays green without a golden update.
- When uncertain: choose the simpler option and record it under "Decisions
  made" in the PR. Do NOT expand scope.

## Security checklist

- The plain-text trigger contains no untrusted input — it is a fixed code
  constant. The `Unknown command:` marker is matched with an anchored
  (`/^Unknown command:/m`) pattern against a **bounded** (`STDOUT_HEAD_MAX`)
  redacted head; it is used only as a boolean and never flows into a path or
  shell. No filesystem/shell path is constructed from any value this WP adds.
- The stdout head is redacted (`redactOnly`) before the marker test, consistent
  with the existing EP3 handling (WP-124); the boolean signal carries no brain
  bytes into logs, alerts, or email.

## Acceptance criteria

- [ ] `grep -rn "'/wienerdog" src/` returns **no results** (the dream trigger no
      longer leads with a slash; the routine site was already fixed).
- [ ] `DREAM_PROMPT(...)`'s `-p` value does **not** match `/^\s*\/\S+\s*$/`, no
      line starts with `/`, and it contains `wienerdog-dream`.
- [ ] `spawnBrain` `done` resolves `sawUnknownCommand === true` for a fake brain
      that prints `Unknown command: /wienerdog-dream` (exit 0), and `false` for a
      normal brain.
- [ ] A dream run with `WIENERDOG_FAKE_BRAIN_MODE: 'unknown-command'`: **throws**
      (fails loud), makes **no new vault commit**, writes **no ledger record**
      for the fed transcript, and leaves the vault working tree clean.
- [ ] The existing `crash` / `hang` / `vanish-scratch` and normal-run
      integration tests still pass unchanged.
- [ ] `npm test` and `npm run lint` pass.
- [ ] Idempotent: re-running the fixed dream over the same (unconsolidated)
      sessions after the guard aborts re-selects them (no state was advanced).

## Verification steps (run these; paste output in the PR)

```bash
# 1. The trigger no longer leads with a slash anywhere in src/.
grep -rn "'/wienerdog" src/ ; echo "exit=$?  (expect: no matches, exit=1)"

# 2. Unit: trigger shape + the new stdout signal.
npm test -- --test-name-pattern 'dream-brain'

# 3. Integration: the non-vacuity guard fails loud with no commit / no ledger advance.
npm test -- --test-name-pattern 'dream-integration'

# 4. Full suite + lint.
npm test
npm run lint
```

### Maintainer-run steps AFTER merge (not implementer CI — production is live)

These are ops steps the maintainer performs on his machine; they are listed here
so the fix is not considered shipped until they pass. They are NOT product code.

1. **Descriptor coherence — re-pin the changed dream prompt:**
   ```bash
   wienerdog sync
   # Confirm the dream descriptor's promptHash changed vs the pre-merge value,
   # and the scheduler/launcher expect-digest matches the new descriptor.
   ```
2. **Live one-shot dream** on the current Claude, proving the plain-text trigger
   runs the brain (non-vacuous) and the guard would fire otherwise:
   ```bash
   wienerdog dream --yes
   # Expect: a real "dream committed <sha> — N notes, M skills" (N or M > 0 for a
   # non-empty window), NOT "0 notes, 0 skills"; and logs/dream/<date>.log has NO
   # "Unknown command:" line.
   ```
3. **Ledger recovery for the 2026-07-24 vacuous run** — verify whether that run
   wrongly advanced state, and recover if so. The real store is
   `~/.wienerdog/state/transcript-ledger.json` (NOT `watermarks.json`):
   ```bash
   # Inspect the records the 03:30 vacuous run wrote (its updated_at ~= 2026-07-24T…):
   cat ~/.wienerdog/state/transcript-ledger.json
   ```
   - If the 2026-07-23 sessions' transcript files **changed since** (their
     `size:mtimeMs:dev:ino` fingerprint differs from the ledger's), the dream
     re-selects them automatically — no action needed.
   - If their fingerprints still MATCH the ledger (sessions unchanged), those
     entries are stuck as `skip-processed` and would be lost. Recover by
     **removing exactly the `files[...]` entries whose `outcome:"processed"` and
     `updated_at` correspond to the 03:30 run** (leave all older, legitimately-
     consolidated entries intact), then re-run `wienerdog dream --yes` and
     confirm the 07-23 window is consolidated into the vault. (Prefer surgical
     entry removal over deleting the whole ledger, which would re-dream older
     already-consolidated sessions down to `baseline_mtime`.)

## Out of scope (do NOT do these)

- The broader launch-hardening questions — LP2 broker-e2e, terminal-auth,
  `CLAUDE_CONFIG_DIR` handling — belong to **WP-broker-e2e-terminal-auth** and
  its siblings. Do not fold them in.
- Any "zero tool activity / counted staged-extract reads" vacuity detector
  beyond the `Unknown command:` marker (see Table A non-goal). A separate WP may
  add richer run-contract assertions later.
- Retiring `watermarks.json` / `writeWatermarks` (dead in the dream path) — a
  cleanup for another WP; do not delete it here.
- Any change to `descriptor.js`, the scheduler, or the launcher. The descriptor
  re-pins itself via `wienerdog sync`; no code edit is needed or permitted here.
- Editing docs: `docs/ARCHITECTURE.md`'s dream description and
  `skills/wienerdog-dream/SKILL.md` refer to the *skill name* `wienerdog-dream`,
  not to a slash-command trigger in the `-p` prompt, so they are accurate as-is —
  **no docs change is required** and none is in the Deliverables table.

## Definition of done

1. All Verification steps pass locally; output pasted into the PR body.
2. Conventional commit: `fix(dream): plain-text trigger + non-vacuity guard (WP-dream-plaintext-trigger)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. PR body notes the two maintainer-run post-merge steps (sync re-pin + ledger
   recovery) so they are not forgotten on the live machine.
