---
id: WP-098
title: Surface failures of best-effort systemd calls and report schedule-removal truthfully
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0018]
branch: wp/098-scheduler-secondary-call-fail-loud
---

# WP-098: Scheduler secondary-call visibility + truthful remove

## Context (read this, nothing else)

Wienerdog registers OS-native schedule entries (THREAT-MODEL T6). WP-075 already
makes the **primary** mutations fail loud: `registerPlatform`'s `launchctl
bootstrap` / `systemctl enable --now` / `schtasks /create` all check `.status===0`
and surface a rejection. Two **secondary** paths remain silent (scheduler #6/#7),
and are lower-severity (the brief notes this WP may be treated as optional
hardening):

1. **Best-effort systemd calls swallow failures:** in the Linux branch of
   `registerPlatform`, `systemctl --user daemon-reload` and
   `loginctl enable-linger <user>` are called with their results **discarded**. A
   failed `daemon-reload` can leave `enable --now` operating on stale units; a
   failed `enable-linger` silently means the timer won't fire while the user is
   logged out. These are best-effort by design, but a failure should be **visible**
   (a warning), not invisible.

2. **`schedule remove` claims more than it knows:** `remove()` runs
   `reverseSchedulerEntry` for each matched manifest entry but never inspects the
   `removed`/`skipped` results, then unconditionally prints *"removed … (unloaded
   and deleted its schedule entry)."*. Two untruths: it claims the OS entry was
   **"unloaded"** — but `reverseSchedulerEntry` runs the unload argv **best-effort
   and discards its status**, so success is unknown — and it implies a file was
   deleted even when the entry was already gone. The message must be limited to what
   is actually known: which schedule FILES were deleted vs. already absent, and that
   the OS-unregister command was RUN best-effort (not that it succeeded). Do NOT
   claim "unloaded" or "OS entry was already gone" without evidence.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004).
This WP does not add throws to best-effort paths (that would break hosts where
linger is unavailable) — it makes failures **visible**.

## Current state

`src/cli/schedule.js` `registerPlatform`, Linux branch (lines ~192–200):

```js
let loaded = true;
if (changed) {
  // Best-effort daemon-reload/linger are not gated; only `enable --now` counts.
  loader(['systemctl', '--user', 'daemon-reload']);                       // ← status discarded
  loaded = loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]).status === 0;
  const user = process.env.USER || process.env.LOGNAME || '';
  if (user) loader(['loginctl', 'enable-linger', user]);                  // ← status discarded
}
```

`remove()` (lines ~396–406):

```js
const removed = []; const skipped = []; const removedSet = new Set();
for (const entry of matched) {
  manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, removedSet);
}
manifest.entries = manifest.entries.filter((e) => !matched.includes(e));
manifestLib.save(paths, manifest);
jobsLib.removeJob(paths, name);
process.stdout.write(`wienerdog: removed "${name}" (unloaded and deleted its schedule entry).\n`);  // ← always success
```

`reverseSchedulerEntry` runs the stored `unload` argv (best-effort, errors
ignored) then removes the file; it pushes to `removed` when the file was deleted
and to `skipped` when the file was already absent.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/schedule.js | warn (stderr) when `daemon-reload`/`enable-linger` return nonzero OR no result; make `remove()` report truthfully from `removed`/`skipped` (file deletions + best-effort unregister — never "unloaded"/"already gone") |
| modify | tests/unit/scheduler-schedule.test.js | tests: a nonzero AND an `undefined`/`{status:null}` secondary loader result each emit a warning; when nothing was removed, `remove` prints the zero-count variant "deleted 0 schedule files and ran any recorded OS-unregister command(s) best-effort (no schedule file was present to delete)" (asserting the "0 schedule files" count and the best-effort unregister phrase, never "unloaded"/"already gone"); a normal removal prints the "deleted N schedule files … any recorded OS-unregister command(s)" variant (asserting the count N, e.g. 2 for a Linux timer+service pair, not singular) |

### Exact contracts

**(1) Surface secondary systemd failures** (warn, do not throw):

```js
if (changed) {
  const reload = loader(['systemctl', '--user', 'daemon-reload']);
  // Treat a MISSING result (undefined / null status) as a failure too — absence of a
  // result is not success. Warn on anything that is not an explicit status 0.
  if (!reload || reload.status !== 0) {
    const s = reload ? reload.status : 'no result';
    process.stderr.write(`wienerdog: warning — 'systemctl --user daemon-reload' returned ${s}; the timer may load from stale units. Run 'wienerdog doctor'.\n`);
  }
  loaded = loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]).status === 0;
  const user = process.env.USER || process.env.LOGNAME || '';
  if (user) {
    const linger = loader(['loginctl', 'enable-linger', user]);
    if (!linger || linger.status !== 0) {
      const s = linger ? linger.status : 'no result';
      process.stderr.write(`wienerdog: warning — 'loginctl enable-linger ${user}' returned ${s}; scheduled jobs may not run while you are logged out.\n`);
    }
  }
}
```

`loaded` still gates ONLY on the primary `enable --now` (unchanged — a warning is
not a failure; `sync` stays exit 0, and WP-070's doctor/digest health probe is the
authoritative after-the-fact "is it loaded?" surface).

**(2) Truthful `remove()` reporting** — derive the message from what actually
happened:

Wording is limited to what `remove()` actually knows — schedule FILE deletions
(`removed`) vs. files already absent (`skipped`) — and states that any recorded
OS-unregister command(s) were RUN best-effort (their success is unknown because
`reverseSchedulerEntry` discards the unload status). It NEVER claims "unloaded" or
"already gone", and it reports `removed.length` in EVERY non-empty branch (Linux
records TWO scheduler entries — a `.timer` with an unload argv and a `.service` with
`unload: null` — so "its schedule file" singular would misreport the normal case):

```js
if (removed.length === 0) {
  // No schedule FILE was present to delete (already removed, or never registered).
  // But reverseSchedulerEntry runs any recorded `unload` argv BEFORE checking the
  // file (manifest.js:193 — unload, then the isFile() guard), so a best-effort
  // OS-unregister command may still have RUN even with zero file deletions. Report
  // the count (0) AND the same best-effort qualifier as the non-empty branch; do NOT
  // assert the OS entry was "already gone" — that is not known here.
  process.stdout.write(`wienerdog: removed "${name}" from Wienerdog's schedule — deleted 0 schedule files and ran any recorded OS-unregister command(s) best-effort (no schedule file was present to delete).\n`);
} else {
  const fileWord = removed.length === 1 ? 'file' : 'files';
  const absentTail = skipped.length > 0
    ? `; ${skipped.length} file${skipped.length === 1 ? ' was' : 's were'} already absent`
    : '';
  process.stdout.write(`wienerdog: removed "${name}" from Wienerdog's schedule — deleted ${removed.length} schedule ${fileWord} and ran any recorded OS-unregister command(s) best-effort${absentTail}.\n`);
}
```

("any recorded OS-unregister command(s)" is truthful for the Linux two-entry case:
the `.timer` entry carries an unload argv, the `.service` entry carries `unload:null`
(nothing to run) — so the phrasing covers both without claiming a specific command
succeeded.)

The job definition + manifest entries are still removed in all cases (a removed
job should not linger in config just because its OS file was already gone) — only
the printed message becomes accurate about what is actually known.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Warnings go to **stderr** (they are advisory; stdout stays clean for the primary
  result line). Do NOT throw on a secondary-call failure — hosts without linger
  support must still complete registration.
- Do not change `ensureEntry`, the primary-mutation `loaded` gating, the manifest
  reversal, or `jobsLib.removeJob`.
- The loader is injected in tests (`opts.loader`); assert warnings via a captured
  stderr and a loader spy that returns a nonzero status for the secondary argv.

## Acceptance criteria

- [ ] When the injected loader returns `{status:1}`, `undefined`, OR `{status:null}`
      for `daemon-reload` (or `enable-linger`), `registerPlatform` writes the
      corresponding warning to stderr and still returns `{loaded}` gated only on
      `enable --now`.
- [ ] `schedule remove` on a job whose scheduler files are already gone prints the
      zero-count variant "deleted 0 schedule files and ran any recorded OS-unregister
      command(s) best-effort (no schedule file was present to delete)" — reporting the
      `0` count AND the best-effort unregister phrase (because a recorded `unload` argv
      may have run before the file check), never claiming "unloaded" or "already gone";
      a normal removal that deletes N schedule files prints "deleted N schedule file(s)
      and ran any recorded OS-unregister command(s) best-effort" — reporting
      `removed.length` (N=2 for the Linux timer+service case, not the singular "its
      schedule file"), never claiming "unloaded".
- [ ] The job definition and manifest scheduler entries are removed in all cases.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "schedule|scheduler"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The non-dream job double-start / catch-up lock (scheduler #1/#12) and the
  schedule-state read-modify-write race (scheduler #13) — the dream is already
  lock-protected (WP-069); digest/triage/weekly-review are read+draft and do not
  destructively mutate shared vault state, so a cross-job lock is deferred. Note this
  under "Decisions made".
- Watchdog-kill liveness verification (scheduler #4) — separate.
- Surfacing the actual OS unload result (changing `reverseSchedulerEntry`'s
  signature to RETURN the unload status) — a larger change to a shared reverser used
  by uninstall too. This WP takes the cheaper, truthful-wording path instead (it no
  longer claims "unloaded"). If the owner wants the unload result reported, that is a
  follow-up on `reverseSchedulerEntry`.

## Round-2 dispositions

- **Codex round-2 P1 (removal reporting cannot truthfully claim the OS entry was
  unloaded):** RESOLVED by truthful wording (the trivial fix the brief preferred over
  WONTFIX). `reverseSchedulerEntry` discards the unload status, so `remove()` now
  reports only what it knows — schedule file deletions vs. already-absent files, and
  that the OS-unregister command was RUN best-effort — and never claims "unloaded"
  or "OS entry was already gone." Surfacing the real unload status is a deferred
  follow-up (Out of scope) since it changes the shared `reverseSchedulerEntry`.
- **Codex round-2 P2 (missing loader results remain silent):** RESOLVED. The
  secondary-call guards now warn on a MISSING result (`undefined`/`null` status) as
  well as a nonzero status — absence of a result is not treated as success. Tests
  cover `undefined` and `{status:null}`.
- **Codex round-3 P2 (normal Linux removal misreports count and unregister
  execution):** RESOLVED. Linux records TWO scheduler entries (a `.timer` with an
  unload argv and a `.service` with `unload:null`), so the previous singular "deleted
  its schedule file … ran the OS-unregister command" both under-counted (should be
  2 files) and over-claimed a specific command ran. The removal branch now reports
  `removed.length` in every non-empty case and says "ran any recorded OS-unregister
  command(s) best-effort" — truthful for the mixed unload/`null` pair without asserting
  any command succeeded.
- **Codex round-5 P2 (zero-removal branch still silent on count + best-effort
  unregister):** RESOLVED. `reverseSchedulerEntry` runs the recorded `unload` argv
  BEFORE checking whether the schedule file exists (manifest.js:193 — unload, then the
  `isFile()` guard at :209), so an OS-unregister command may have run even when
  `removed.length === 0`. The zero-removal branch previously reported neither the count
  nor that any command ran. It now reports the `0` count AND the same qualified
  "ran any recorded OS-unregister command(s) best-effort" statement as the non-empty
  branch (still without asserting success or claiming the entry was "already gone"), so
  EVERY matched-entry outcome states the numeric deletion count and the best-effort
  unregister fact. The AC and the test note assert the zero-removal wording.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/098-scheduler-secondary-call-fail-loud`; conventional commits; PR
   titled `fix(scheduler): surface best-effort systemd failures and report remove truthfully (WP-098)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
