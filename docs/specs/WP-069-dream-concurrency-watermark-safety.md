---
id: WP-069
title: Dream concurrency + watermark-consolidation safety (lock-first scratch, no-op loser, consumed-only watermark)
status: Draft
model: opus
size: M
depends_on: [WP-048]
adrs: [ADR-0012, ADR-0004]
branch: wp/069-dream-concurrency-watermark-safety
---

# WP-069: Dream concurrency + watermark-consolidation safety

## Context (read this, nothing else)

Wienerdog's **dream** is a nightly headless job. It selects the user's fresh
`claude`/`codex` transcripts, writes redacted **extracts** into a scratch dir,
spawns a sandboxed **brain** (`claude -p …`) that reads the extracts and writes
consolidated notes into the user's **vault** (a git repo), validates + commits
those writes as exactly one commit, then advances a per-harness **watermark** so
the next run only sees newer sessions. It is scheduled by default at 03:30, with
an **hourly catch-up** that runs the dream when the machine was asleep at 03:30.
Because the daily 03:30 run can still be running when the hourly catch-up fires
(the catch-up keys off `last_success`, which the long run has not yet written),
**two dreams can genuinely overlap on a real user machine** — this is not a
manual-invocation-only edge case.

**IRON RULE (ADR-0004): Wienerdog is just files.** No daemons, no servers, no
process that outlives its job. This WP changes only file/lock ordering inside the
short-lived `dream` process; it starts nothing new.

A real dogfooding incident on **2026-07-07** exposed two related, reliability-
critical defects. They produce the same outcome as the WP-048 capacity
starvation — **silent, permanent loss of sessions that were never consolidated** —
via a new cause. Sessions dropped this way are gone from memory: their content
survived only as same-session vault logging; they never passed through a dream.

### The incident (confirmed, not hypothetical)

Two dreams overlapped. Dream **A** (a catch-up run) had written 5 extracts to
`state/dream-scratch`, **acquired the lock**, and its brain was mid-read. Dream
**B** started ~26 s later and:

1. B's `collectExtracts` (called **before** B tried the lock) rebuilt the shared
   scratch dir: `fs.rmSync(state/dream-scratch, {recursive}) then mkdir` — this
   alone destroyed A's live extracts.
2. B then failed to acquire the lock (A held it) and, on the lock-loss backoff
   path, called `cleanScratch(paths.state)` — a **second** deletion of the same
   shared dir.

Brain A found its scratch gone mid-read, aborted, and (gracefully) wrote only
failure-documentation notes, then exited **0**. Because the brain exited 0,
orchestrator A committed those failure-doc notes ("dream: … — 2 notes") **and
advanced the watermark past all 5 extracts — including 3 sessions no dream had
ever consolidated.** Silent, permanent drop.

### Defect 1 — scratch is shared state not protected by the lock (concurrency)

`state/dream-scratch` is a single shared directory, but the lock is acquired
**after** `collectExtracts` has already rebuilt it, and the lock-loss backoff
path deletes it. Two overlapping dreams corrupt each other.

### Defect 2 — the watermark advances on a run that consolidated nothing (silent drop)

Watermark advancement is keyed on the **collected-extract mtimes** (`sel.maxMtime`),
gated only on "the commit succeeded" — **not** on whether the brain actually
consumed the extracts. So any degraded run whose brain exits 0 but consolidated
nothing (because its inputs disappeared) still advances the watermark and drops
its sessions. WP-039 already handles the *crash* path (nonzero exit → revert vault,
don't advance); the gap is the **"brain exited 0 but consolidated nothing because
its inputs vanished"** path.

### Product invariants that matter here

- ADR-0012 part 2 (WP-039): a crashed brain (nonzero/timeout) → revert the vault,
  advance no watermark.
- ADR-0012 part 5 (WP-048): a run that discarded input must **fail loud** (throw →
  `run-job` records a durable `state/alerts.jsonl` entry the digest surfaces),
  never report a false success. An exit-0 path must never be reachable when input
  was discarded.
- The dream makes **exactly one commit** and is **`git revert`-able** (M3).

## Current state

All paths below exist and were read for this spec.

### `src/cli/dream.js` — the `run(argv)` flow (the defect site)

The current ordering (abridged, real line numbers):

```
L133  assertGitRepo(vaultDir);
L136  const wm = readWatermarks(paths.state);
L137  const sel = collectExtracts(paths, wm, cfg.maxInputBytes);  // ← rebuilds scratch BEFORE the lock (Defect 1a)
L140-152  surface truncation / capacity-drop logs
L157-171  capacity-wedge → cleanScratch + (dry-run return | throw)
L174-178  nothing-new → cleanScratch + return
L181-185  dry-run → printPlan + cleanScratch + return
L188  const scratchBaseline = hashScratch(sel.wrote);
L191  const lock = acquireLock(paths.state, cfg.timeoutMs);       // ← lock acquired AFTER collect
L192-196  if (!lock.acquired) { cleanScratch(paths.state); ... return; }  // ← Defect 1b: SECOND deletion
L197-199  if (lock.stolen) console.warn(...);
L202  try {
L205    precommitSessionEdits(vaultDir); assertCleanTree(vaultDir);
L213-231  runBrainWithWatchdog(...) — catch → restoreVaultToHead + throw; finally logStream.end()
L234    const res = validateAndCommit({ ..., expectedScratch: sel.wrote, scratchBaseline, layout });
L244    writeWatermarks(paths.state, { claude: sel.maxMtime.claude, codex: sel.maxMtime.codex });  // ← Defect 2: unconditional after commit
L247-252  regenerate digest (atomic temp+rename)
L255-259  summary
L260  } finally { releaseLock(paths.state); cleanScratch(paths.state); }
```

Helpers already present in this file: `hashScratch(files)` → `{absPath: sha256}`
(line 37), `printPlan(...)`, `runBrainWithWatchdog(...)`. Imports already include
`fs`, `path`, `crypto`, `acquireLock`, `releaseLock`, `readWatermarks`,
`writeWatermarks`, `collectExtracts`, `cleanScratch`, `MIN_TRUNCATE_BYTES`,
`WienerdogError`, `restoreVaultToHead`, `precommitSessionEdits`, `assertCleanTree`,
`validateAndCommit`.

### `src/core/dream/lock.js`

```js
function acquireLock(stateDir, timeoutMs) → { acquired:boolean, stolen:boolean }
  // wx-create; if exists and now > deadline (or unparseable) → steal (overwrite), stolen:true.
function releaseLock(stateDir) → void  // deletes the lock IFF its pid === process.pid; else no-op.
```

There is **no** `ownsLock`. The lock payload is `{ pid, host, startedAt, deadline }`.
`deadline = now + timeoutMs`, and the brain watchdog in `dream.js` uses the same
`cfg.timeoutMs` — so a lock is only stealable **after** the point at which the
prior holder's own watchdog has already killed its brain.

### `src/core/dream/scratch.js` (read; **NOT** modified by this WP)

`collectExtracts(paths, watermarks, maxInputBytes)` internally computes
`scratchDir = state/dream-scratch`, does `fs.rmSync(scratchDir, {recursive,force})`
then `mkdir`, writes one file per kept extract, and returns `{ entries, scratchDir,
maxMtime, dropped, truncated, wrote, ... }`. `cleanScratch(stateDir)` rm's
`state/dream-scratch`. **The single shared scratch dir is deliberate and stays** —
this WP fixes *when* these are called (in `dream.js`), not scratch.js itself.

### `src/core/dream/validate.js` (read; **NOT** modified)

`validateAndCommit({ vaultDir, scratchDir, expectedScratch, scratchBaseline, ... })`
is already parameterized on `scratchDir`. Its Step-1 scratch-integrity check
iterates the files that **exist** in scratch (`listFilesRecursive`) — so it detects
a brain *writing into* scratch and *content-mutating* an expected extract, but has
a **blind spot for total scratch deletion**: if the whole dir is gone,
`listFilesRecursive` returns `[]` and it commits whatever the brain wrote. That
blind spot is why Defect 2 must be closed in `dream.js`, not here.

### `src/core/dream/watermarks.js` (read; **NOT** modified)

`writeWatermarks(stateDir, {claude, codex})` — atomic temp+rename. Its JSDoc
already states "callers advance ONLY after a successful commit"; this WP tightens
what "successful" means, in the caller.

### Tests

- `tests/integration/dream.test.js` — full `run()` integration via the
  `WIENERDOG_DREAM_CMD` fake-brain seam and `WIENERDOG_FAKE_BRAIN_MODE`
  (`hang`, `crash`). Includes the existing "live concurrent lock", "stale lock
  stolen", "dry-run", "crash", "hang", "capacity" cases.
- `tests/fixtures/dream/fake-brain.js` — the fake brain (reads
  `WIENERDOG_FAKE_BRAIN_MODE`).
- `tests/unit/dream-lock.test.js` — 7 unit tests for `acquireLock`/`releaseLock`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | Reorder `run()`: acquire lock **before** any collect; lock-loss backoff is a **pure no-op**; move all early-return branches under the lock; add `scratchIntact()` gate before the watermark advance; pid-guard the teardown. |
| modify | src/core/dream/lock.js | Add + export `ownsLock(stateDir)`. `releaseLock` unchanged (already pid-guarded). |
| modify | tests/integration/dream.test.js | Add two tests: (1) lock-losing dream is a pure no-op that preserves the winner's live scratch; (2) a brain whose inputs vanish mid-run advances no watermark and fails loud. |
| modify | tests/fixtures/dream/fake-brain.js | Add a `vanish-scratch` mode (deletes its own scratch, writes a failure-doc note, exits 0). |
| modify | tests/unit/dream-lock.test.js | Add unit tests for `ownsLock`. |
| modify | docs/adr/0012-dream-run-lifecycle.md | Amend: add parts 6 (scratch is lock-protected) + 7 (watermark ⟺ consumed). |

**Do NOT modify** `scratch.js`, `validate.js`, `watermarks.js`, `brain.js`, or
`run-job.js`. If you believe one needs changing, that is a spec bug — stop and say
so.

### Exact contract — `ownsLock` (new, in `lock.js`)

```js
/**
 * True IFF state/dream.lock currently exists and its pid is THIS process — i.e.
 * we still hold the lock and were not superseded by a stale-lock steal. Used by
 * the dream teardown to decide whether cleaning scratch / releasing the lock is
 * safe: a superseded process must touch NEITHER (the stealer now owns both).
 * Never throws.
 * @param {string} stateDir
 * @returns {boolean}
 */
function ownsLock(stateDir) {
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath(stateDir), 'utf8'));
    return existing.pid === process.pid;
  } catch {
    return false; // absent or unparseable → we do not own it
  }
}
```

Add `ownsLock` to `module.exports`.

### Exact contract — `scratchIntact` (new, private helper in `dream.js`)

```js
/**
 * True IFF every expected extract still exists AND byte-matches its pre-brain
 * baseline — proof the brain's inputs were present and unchanged for the whole
 * run. A false result means the inputs vanished or changed mid-run (the
 * 2026-07-07 concurrency incident): the brain could not have consolidated them.
 * @param {string[]} wrote  the extract paths collectExtracts wrote (sel.wrote)
 * @param {Record<string,string>} baseline  {absPath: sha256} from hashScratch()
 * @returns {boolean}
 */
function scratchIntact(wrote, baseline) {
  for (const f of wrote) {
    const abs = path.resolve(f);
    let h;
    try {
      h = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    } catch {
      return false; // missing → vanished
    }
    if (baseline[abs] !== h) return false; // present but changed
  }
  return true;
}
```

### Exact contract — the rewritten `run(argv)` (authoritative; implement verbatim modulo comments)

The new ordering. Every existing sub-behavior (truncation logs, capacity messages,
`printPlan`, `precommitSessionEdits`/`assertCleanTree`, the watchdog block, digest
regen, summary) is preserved; only the ordering and the two new guards change.

```js
async function run(argv) {
  const dryRun = argv.includes('--dry-run');

  // 1. Resolve config + date.
  const paths = getPaths();
  const cfg = readDreamConfig(paths.config); // throws WienerdogError when no vault
  const vaultDir = cfg.vault;
  const layout = readVaultLayout(paths.config);
  const date = resolveDate();

  // 2. Vault must be a git repo (read-only check; fail fast without the lock).
  assertGitRepo(vaultDir);

  // 3. Acquire the single-run lock BEFORE any scratch collect/write. state/
  //    dream-scratch is shared mutable state; collectExtracts rebuilds it
  //    (rm + mkdir + write). Locking first is what guarantees a concurrent dream
  //    can never destroy the holder's live inputs (2026-07-07 incident). A dream
  //    that does NOT get the lock touches NOTHING and returns — a pure no-op.
  const lock = acquireLock(paths.state, cfg.timeoutMs);
  if (!lock.acquired) {
    console.log('wienerdog: another dream is in progress.');
    return; // no collect, no cleanScratch, no lock write.
  }
  if (lock.stolen) {
    console.warn('wienerdog: warning — stole a stale dream lock from a prior run that never released it.');
  }

  try {
    // 4. Collect the fresh transcripts into scratch (now safely under the lock).
    const wm = readWatermarks(paths.state);
    const sel = collectExtracts(paths, wm, cfg.maxInputBytes);

    // 5. Surface capacity events plainly — a size event must NEVER be silent.
    for (const t of sel.truncated) {
      console.log(
        `wienerdog: dream — truncated ${t.harness}/${t.session_id} to fit the input budget ` +
          `(kept the newest ${t.keptBytes} of ${t.originalBytes} bytes).`
      );
    }
    if (sel.dropped.length > 0) {
      const names = sel.dropped.map((d) => `${d.harness}/${d.session_id} (${d.bytes}B)`).join(', ');
      console.log(
        `wienerdog: dream — capacity: dropped ${sel.dropped.length} session(s) over ` +
          `dream_max_input_bytes (${cfg.maxInputBytes}): ${names}.`
      );
    }

    // 6. Fresh sessions existed but NONE could be fed → capacity WEDGE: fail loud
    //    (run-job records a durable alert). Dry-run only diagnoses.
    if (sel.entries.length === 0 && sel.dropped.length > 0) {
      if (dryRun) {
        console.log(
          'wienerdog: dream plan (dry-run) — capacity exhausted: no fresh session fits ' +
            `dream_max_input_bytes (${cfg.maxInputBytes}); raise it in config.yaml.`
        );
        return;
      }
      throw new WienerdogError(
        `dream capacity exhausted: ${sel.dropped.length} fresh session(s) exceed ` +
          `dream_max_input_bytes (${cfg.maxInputBytes}) and none fit even after truncation ` +
          `(per-session floor ${MIN_TRUNCATE_BYTES} bytes) — raise dream_max_input_bytes in config.yaml.`
      );
    }

    // 7. Genuinely nothing new → no brain, no commit.
    if (sel.entries.length === 0) {
      console.log('wienerdog: nothing new to dream.');
      return;
    }

    // 8. Dry-run → print the plan and stop.
    if (dryRun) {
      printPlan(sel, cfg, vaultDir, date, layout);
      return;
    }

    // 9. Baseline the scratch files while they are still pristine (before brain).
    const scratchBaseline = hashScratch(sel.wrote);

    // 10. Pre-commit the user's own uncommitted session edits so the post-brain
    //     diff is exactly the brain's writes; after it the tree MUST be clean.
    precommitSessionEdits(vaultDir);
    assertCleanTree(vaultDir);

    // 11. Run the brain under the watchdog.
    const logDir = path.join(paths.logs, 'dream');
    fs.mkdirSync(logDir, { recursive: true });
    const logStream = fs.createWriteStream(path.join(logDir, `${date}.log`), { flags: 'a' });
    try {
      await runBrainWithWatchdog({
        vaultDir,
        scratchDir: sel.scratchDir,
        date,
        model: cfg.model,
        layout,
        timeoutMs: cfg.timeoutMs,
        logStream,
      });
    } catch (err) {
      // Brain failed/timed out: discard its partial, unvalidated writes, then fail.
      restoreVaultToHead(vaultDir);
      throw err;
    } finally {
      logStream.end();
    }

    // 12. WATERMARK-SAFETY GATE. The brain exited 0 — but only trust that as a
    //     consolidation if its inputs were AVAILABLE and UNCHANGED for the whole
    //     run. If any expected extract vanished or changed (2026-07-07: a second
    //     dream deleted this run's live scratch, so the brain wrote only
    //     failure-doc notes on empty inputs), the brain consolidated NOTHING:
    //     restore the vault, advance NO watermark, and fail loud so run-job
    //     records a durable alert. The sessions are retried next run.
    if (!scratchIntact(sel.wrote, scratchBaseline)) {
      restoreVaultToHead(vaultDir);
      throw new WienerdogError(
        'dream aborted: the input extracts vanished or changed mid-run — no session ' +
          'was consolidated, so the watermark is not advanced (these sessions will be retried next run).'
      );
    }

    // 13. Validate the writes and make exactly one commit.
    const res = validateAndCommit({
      vaultDir,
      scratchDir: sel.scratchDir,
      date,
      expectedScratch: sel.wrote,
      scratchBaseline,
      layout,
    });

    // 14. Advance the watermarks — only now: brain 0 + inputs intact + commit ok.
    writeWatermarks(paths.state, { claude: sel.maxMtime.claude, codex: sel.maxMtime.codex });

    // 15. Regenerate the injected session digest (atomic temp + rename).
    fs.mkdirSync(paths.state, { recursive: true });
    const digest = renderDigest(vaultDir, layout, { alerts: readAlerts(paths), updateLine: renderUpdateLine(paths) });
    const digestDest = path.join(paths.state, 'digest.md');
    const digestTmp = path.join(paths.state, `.digest.md.${process.pid}.tmp`);
    fs.writeFileSync(digestTmp, digest);
    fs.renameSync(digestTmp, digestDest);

    // 16. Summary.
    const shaShort = res.sha ? res.sha.slice(0, 7) : '(none)';
    console.log(
      `wienerdog: dream committed ${shaShort} — ${res.counts.notes} notes, ${res.counts.skills} skills; ` +
        `${res.reverted.length} reverted, ${res.outOfVault.length} out-of-vault.`
    );
  } finally {
    // 17. Teardown: clean scratch + release the lock ONLY if we still hold it. If
    //     we were superseded by a stale-lock steal, the stealer now owns both the
    //     lock and the rebuilt scratch — touch NEITHER. Clean before release so no
    //     newly-starting dream can acquire the freed lock and have its fresh
    //     scratch wiped by our cleanup (TOCTOU).
    if (ownsLock(paths.state)) {
      cleanScratch(paths.state);
      releaseLock(paths.state);
    }
  }
}
```

Add `ownsLock` to the `require('../core/dream/lock')` destructure at the top of
`dream.js`. `crypto` is already imported.

## Implementation notes & constraints

- **Frozen concurrency invariant.** The dream lock is acquired before any scratch
  collect/write, and `state/dream-scratch` is mutated only while the lock is held.
  A dream that does not acquire the lock performs **no filesystem mutation
  whatsoever** — pure no-op. Therefore a second concurrent dream can never delete
  or overwrite the inputs of the dream that holds the lock.
- **Frozen watermark invariant.** The per-harness watermark advances **iff**
  (a) the brain exited 0, (b) every input extract defining the new watermark was
  still present and byte-identical to its pre-brain baseline when the brain
  finished, and (c) the validating commit succeeded. Any run that aborts
  (nonzero/timeout) or whose inputs vanished/changed restores the vault, advances
  no watermark, and fails loud.
- **Design fork resolved: shared scratch + strict lock ordering (NOT per-run
  scratch).** Keeping the single `state/dream-scratch` dir and making the lock the
  sole gate on it is the surgical fix: with lock-first ordering the loser never
  touches scratch at all, so per-run isolation would only matter for the rarer
  stale-lock *steal* case — which the pid-guarded teardown (step 17) already
  covers. Per-run dirs (`dream-scratch-<pid>`) would additionally require an
  orphan-sweep for hard-crash leftovers and would spread the scratch contract
  across `scratch.js` + `validate.js`. We decline that complexity. (See ADR-0012
  amendment; the owner may revisit.)
- **Steal path re-audit (do not change `lock.js`'s steal logic).** A lock becomes
  stealable only after `deadline = now + timeoutMs`, and the brain watchdog uses
  the same `cfg.timeoutMs` — so by the time a stealer can proceed, the superseded
  holder's brain has already been killed and is no longer reading scratch. The
  residual: a superseded holder still finishing its post-brain git work past the
  deadline could, in a microsecond window between its `ownsLock` check and
  `cleanScratch`, race a steal. This is minutes-vs-microseconds and strictly better
  than today; accepted (mirrors the WP-029 "mtime staleness can misjudge a live
  long git op — accepted tradeoff" precedent). `releaseLock` is already
  pid-guarded, so a superseded holder never deletes the stealer's lock.
- **`scratchIntact` uses presence AND hash** (same primitive as `validate.js`'s
  Step 1). Presence alone would suffice for the reported incident (deletion), but
  the hash-match makes the invariant hold regardless of Defect 1 — the point of
  Defect 2 being an independent structural guard. A well-behaved brain never
  writes/deletes an expected extract, so there are no false positives on legit
  runs (verified against the default fake brain, which writes to the vault and to
  a *non-expected* scratch file only).
- **Do not add scratch cleanup back into the early-return branches** (capacity
  wedge / nothing-new / dry-run). The single `finally` (step 17) is now the only
  place that cleans scratch and releases the lock — moving those branches under the
  lock is what makes that correct.
- Plain Node ≥ 18, zero runtime deps. No new imports beyond `ownsLock`.

## Security checklist

- [ ] No new untrusted identifier flows into a filesystem path or shell command.
      Scratch/lock paths derive from `paths.state` (trusted config), not from
      transcript content. The watermark values are numeric mtimes. `scratchIntact`
      reads only paths from `sel.wrote` (produced by `collectExtracts`, not the
      brain). No change to the brain sandbox, redaction, or the Tier-3 gate.
- [ ] The fail-loud `reason` string added in step 12 is a fixed control-plane
      string (no brain stderr, no session content) — it may surface in the injected
      digest via `alerts.jsonl`; keep it free of untrusted input (ADR-0012 part 3 /
      WP-041 separation).

## Acceptance criteria

- [ ] `acquireLock` is called before `collectExtracts` in `run()`; no `collectExtracts`
      or `cleanScratch` call executes on the lock-loss path.
- [ ] A dream that fails to acquire a live lock prints "another dream is in
      progress", returns without throwing, makes no commit, advances no watermark,
      and leaves the pre-existing scratch dir and its files **byte-for-byte
      untouched** (new integration test).
- [ ] A brain that exits 0 but whose input extracts vanished or changed mid-run
      causes `run()` to **throw** (fail loud), restore the vault (no dream commit,
      no failure-doc note left), and **not** write `watermarks.json` (new
      integration test).
- [ ] The teardown cleans scratch + releases the lock only when `ownsLock` is true.
- [ ] `ownsLock` returns true for our own live lock, false for a foreign-pid lock,
      false when the lock is absent/unparseable (new unit tests).
- [ ] All pre-existing dream tests still pass unchanged (happy path, crash, hang,
      live-lock, stale-lock-stolen, dry-run, capacity-wedge, capacity-truncation,
      adopt-e2e mapped-tiers).
- [ ] Running the dream twice with no new transcripts remains idempotent (second
      run: "nothing new", no commit, no watermark change).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Per-run scratch directories / orphan sweeps (design fork declined above).
- Any change to `scratch.js`, `validate.js`, `watermarks.js`, `brain.js`,
  `run-job.js`, or the lock steal/deadline semantics.
- Changing `dream_max_input_bytes`, truncation, or the Tier gate (WP-048 / WP-017 /
  WP-024 territory).
- Advancing the watermark for *partially*-consumed (whole-dropped-but-older)
  sessions — the scalar-mtime limitation noted in ADR-0012 part-5 consequences is
  unchanged and out of scope here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/069-dream-concurrency-watermark-safety`; conventional commits;
   PR titled `fix(dream): concurrency + watermark-consolidation safety (WP-069)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
</invoke>
