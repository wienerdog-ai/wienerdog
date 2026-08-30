---
id: WP-launcher-refusal-banner
title: Give a launcher-stage refusal its own delivery channel — a code-owned banner file the launcher writes without app-tree code
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0024, ADR-0028, ADR-0039]
epic: digest-delivery
---

# WP-launcher-refusal-banner: a refusal banner the launcher can actually write

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, plus routines) with the OS-native
scheduler. The OS entry never invokes the app directly. It invokes the **independent
launcher** at `<core>/launcher/launch.js` — a file that lives **outside** the mutable
app tree — which verifies integrity (app release digest, descriptor digest,
containment, stance) and only then spawns `node <app>/bin/wienerdog.js run-job <name>`.
Any verification failure is a durable alert plus **zero** spawn (ADR-0028).

**IRON RULE (ADR-0004): Wienerdog is just files.** The launcher runs and exits with
each fire. This WP adds no daemon, watcher or poller — it adds one file write.

**The defect.** When the launcher refuses, it writes a durable record to
`state/alerts.jsonl` and a line to stderr, and the refusal text promises the user,
verbatim: *"This alert will appear in your next digest."* **That promise cannot be
kept.** The digest is rendered by `renderDigest` in `src/core/digest.js`, which lives
in the app tree, and the launcher **must not require code from the tree it is
verifying** — that is precisely why `appendRefuseAlert` is a hand-written duplicate of
the app-side alert writer instead of an import. Only `wienerdog sync` and
`wienerdog dream` ever write `state/digest.md`, and a refusing launcher never reaches
either.

Measured consequence on the maintainer's machine: `app/current` pointed at a purged
worktree from 2026-08-02; every hourly `--catch-up` refused; `state/digest.md` was
never rewritten for **four weeks**; the banner rendered **zero** times. The email leg
of fail-loud was dead too — it spawns the CLI shim, which is unusable when
`app/current` is exactly what failed. See
`docs/specs/logbook/2026-08-30-the-banner-channel-inverted-and-nobody-noticed.md`.

**The fix (ADR-0039 §5).** The launcher writes a **refusal banner**: a code-owned,
fixed-text markdown file at `<core>/state/refusal-banner.md`, using the same
self-contained, no-app-tree-require discipline `appendRefuseAlert` already uses. A
later WP (`WP-refusal-banner-delivery`) makes the SessionStart hook and `renderDigest`
read it. **This WP writes and clears the file; it does not yet display it.** That is
deliberate: the file format and its lifecycle are one contract, and the two readers
are another.

**The clearing rule and why it is what it is.** The banner clears on **any job
success** and on a **successful attended `wienerdog sync`** (owner ruling D4). Both
are required. `clearAlerts(paths, job)` fires only for real job names, and
`--catch-up` is a pseudo-job that never reports success — so a catch-up refusal
banner keyed to its own job would never self-clear. That is the exact arithmetic trap
recorded in `docs/specs/logbook/2026-08-01-a-correct-refusal-that-repeats-is-a-different-defect.md`,
where a candidate fix "survived the threat model and failed the arithmetic".

Clearing is therefore **unconditional** — any successful job clears the banner
regardless of which job wrote it. This looks lossy and is not, for a reason worth
stating: the banner exists **only** to cover the case where the app tree is broken.
When the app tree is broken, no job succeeds and no sync completes, so nothing clears
it. When the app tree works, `formatAlerts` renders the same refusal from
`alerts.jsonl` through the normal channel, which is richer (it counts occurrences and
honours `wienerdog alerts ack`). So the banner clears exactly when the channel that
supersedes it comes back. A refusal that recurs after a success is re-banner-ed at the
next fire, at most one scheduler interval later.

## Current state

`src/scheduler/launcher.js` — the refusal path. `refuse()` is a closure inside
`main()`:

```js
const refuse = (jobName, why, remedy) => {
  const reason = refusalText(jobName, why, remedy);
  appendRefuseAlert(p, jobName, reason);
  process.stderr.write(`${reason}\n`);
  exit(1);
  return 1;
};
```

`refusalText(jobName, why, remedy)` composes the full sentence, including the
`REMEDY_TAIL` for the class (`sync` or the fail-closed default `reinstall`):

```js
function refusalText(jobName, why, remedy) {
  const tail = REMEDY_TAIL[remedy === 'sync' ? 'sync' : 'reinstall'];
  return (
    `wienerdog: refusing to run "${jobName}" — ${why} (integrity mismatch); no job was run. ` +
    `This alert will appear in your next digest. ${tail}`
  );
}
```

`appendRefuseAlert(p, job, reason)` is the self-contained durable writer, ~35 lines,
whose header comment states the constraint this WP must also honour: *"Minimal
durable alert append (code-owned reason — no secrets, so no redaction/compaction
machinery from `src/core/alerts.js` is needed; this must work even when the app tree
is the thing being refused)."* It `mkdirSync(p.state, {recursive:true, mode:0o700})`,
appends one JSON line, then best-effort `fs.chmodSync(file, 0o600)` on non-win32, and
swallows every error (`/* the alert is best-effort — the refusal (non-zero exit, zero
spawn) stands regardless */`).

`p` is `corePathsFrom(core)`; `p.state` is the absolute `<core>/state` directory.
The launcher's only `require`s are Node built-ins plus files under `<core>/launcher/`.
**It requires nothing from `src/`.**

`src/core/private-fs.js` — the A5 private-file set (0600, repaired by
`repairPrivateModes`, reported by `scanPrivateModes`):

```js
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md',
  'alerts.jsonl',
  'alerts-ack.json',
  'transcript-ledger.json',
  'identity-approvals.json',
];
```

`src/cli/run-job.js` — clears alerts on success via `clearAlerts(paths, name)` from
`src/core/alerts.js`. `src/cli/sync.js` — the attended reconciler; its `run()` ends
with the manifest save and the `changed/unchanged` summary console lines.

`<core>/state/refusal-banner.md` does not exist. Nothing reads it yet.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/launcher.js | add `writeRefusalBanner(p, text)`; call it from `refuse()` before `appendRefuseAlert` |
| create | src/core/refusal-banner.js | app-side read/clear helpers — the launcher NEVER requires this |
| modify | src/core/private-fs.js | add `'refusal-banner.md'` to `A5_PRIVATE_FILE_BASENAMES` |
| modify | src/cli/run-job.js | clear the banner wherever `clearAlerts` is called on job success |
| modify | src/cli/sync.js | clear the banner at the end of a successful non-dry-run sync |
| create | tests/unit/refusal-banner.test.js | app-side helpers + the A5 membership |
| modify | tests/unit/launcher.test.js | banner written on refuse; content shape; failure is swallowed |

### Exact contracts

```js
// src/core/refusal-banner.js — app-side ONLY. The launcher writes its own copy.
/** Basename of the refusal banner inside <core>/state. */
const REFUSAL_BANNER_FILE = 'refusal-banner.md';

/** Absolute path to the banner. @param {import('./paths').WienerdogPaths} paths
 *  @returns {string} */
function refusalBannerPath(paths)

/** The banner text, or '' when absent/unreadable/empty. NEVER throws — a missing
 *  banner is the normal case. Trailing newline trimmed.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function readRefusalBanner(paths)

/** Remove the banner. Idempotent; never throws (a missing file is success).
 *  @param {import('./paths').WienerdogPaths} paths @returns {void} */
function clearRefusalBanner(paths)

module.exports = { REFUSAL_BANNER_FILE, refusalBannerPath, readRefusalBanner, clearRefusalBanner };
```

```js
// src/scheduler/launcher.js — self-contained; Node built-ins only.
/** Write the single-line refusal banner (Table B). Overwrites any previous banner:
 *  the newest refusal is the one worth showing. Atomic (temp + rename) so a hook
 *  reading concurrently never sees a partial line. Best-effort in EVERY step —
 *  a failure here must never affect the refusal, which stands on its non-zero exit
 *  and zero spawn.
 *  @param {{state:string}} p @param {string} text the refusalText() output */
function writeRefusalBanner(p, text)
```

**Literal expected file content.** For a catch-up refusal whose verdict reason is
`cannot resolve app/current`, `<core>/state/refusal-banner.md` contains exactly one
line plus a trailing newline:

```text
> [!warning] wienerdog: refusing to run "--catch-up" — cannot resolve app/current (integrity mismatch); no job was run. This alert will appear in your next digest. Do not run `wienerdog sync` — this check could not confirm the app files are the ones you installed, so syncing is not the safe next step. Reinstall Wienerdog from a trusted source, then investigate.
```

That is `> [!warning]` plus one space, followed by the **folded** `refusalText()` output. Folding is
defined in Table B row B4 and is the only transformation applied.

## Contract reference

Activation trigger (ADR-0031): **(ii)** a new artifact class with its own lifecycle
states; **(v)** the launcher emits the artifact but the app tree owns its
interpretation and disposal — an authority boundary; **(vi)** two successor specs
(`WP-refusal-banner-delivery`, and `WP-digest-stable-volatile-split` via the prefix
order) inherit it; **(vii)** the same facts are mirrored in the launcher, the app-side
module, the private-file set and the tests. Four of seven — the discipline is on.

### Table B — the refusal banner contract

This table is the single place these facts are decided. Every other statement in this
spec, in the code, and in successor specs defers to it.

| Row | Fact | Value |
|-----|------|-------|
| B1 | Path | `<core>/state/refusal-banner.md` (basename `refusal-banner.md`) |
| B2 | Sole writer | `writeRefusalBanner` in `src/scheduler/launcher.js`, called from `refuse()` only |
| B3 | Content | Exactly one line: `> [!warning]`, one space, then the folded `refusalText()` output, then one `\n`. Nothing else — no frontmatter, no second line |
| B4 | Folding | Replace every run of `\s+` with a single space, then trim. Then hard-cut to **2000** characters (matching `MAX_FIELD_CHARS` in `src/core/alerts.js`). Applied to the `refusalText()` output before the `> [!warning]` prefix (with its trailing space) is added |
| B5 | Write mode | Atomic: write `<path>.<pid>.tmp` then `renameSync` onto the target. `mkdirSync(p.state, {recursive:true, mode:0o700})` first |
| B6 | Permissions | `0600`, best-effort `fs.chmodSync` after rename, skipped on `win32` — identical to `appendRefuseAlert`'s handling |
| B7 | Multiplicity | Exactly one banner. A new refusal **overwrites**; banners never accumulate |
| B8 | Failure policy | Every step wrapped so nothing throws. A failed banner write is silent and changes nothing about the refusal (non-zero exit, zero spawn) |
| B9 | Dependencies | The launcher's writer uses Node built-ins only. It must NOT require `src/core/refusal-banner.js` or any other `src/` module |
| B10 | Clearers | `run-job` on job success (beside every existing `clearAlerts` call), and `sync` at the end of a successful non-dry-run run |
| B11 | Clearing scope | **Unconditional** — the clearer does not check which job wrote the banner |
| B12 | Dry-run | `wienerdog sync --dry-run` never clears the banner |
| B13 | Privacy | `'refusal-banner.md'` joins `A5_PRIVATE_FILE_BASENAMES` in `src/core/private-fs.js`, so `repairPrivateModes` and `scanPrivateModes` cover it |
| B14 | Readers | None in this WP. `WP-refusal-banner-delivery` adds the hook and `renderDigest` |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Table B — a review finding updates the table and
every box below in one pass, and any new mirror found in review is added here:

- [ ] Deliverables-table cells naming `src/core/refusal-banner.js`, the
      `private-fs.js` edit, and the two clearer sites (mirror B1, B10, B13)
- [ ] The "Literal expected file content" block under Exact contracts (mirrors B3, B4)
- [ ] `writeRefusalBanner`'s JSDoc in Exact contracts (mirrors B5, B7, B8, B9)
- [ ] Acceptance criteria AC-1 … AC-9 (mirror B2 … B13)
- [ ] Verification greps for `refusal-banner.md` and for the absence of a `src/`
      require in the launcher (mirror B1, B9)
- [ ] Current-state description of `appendRefuseAlert`'s self-containment (mirrors B9)
- [ ] The clearing-rationale paragraph in Context (mirrors B10, B11)

## Implementation notes & constraints

- **B9 is the load-bearing constraint of this WP.** The launcher's whole purpose is
  to verify the app tree before trusting it. A `require` from `src/` inside
  `launcher.js` would execute the code under suspicion. Put `writeRefusalBanner`
  physically inside `launcher.js`, next to `appendRefuseAlert`, and duplicate the
  2000-character constant with a comment naming `MAX_FIELD_CHARS` as its twin. The
  duplication is deliberate and is registered as Table B row B4.
- **Fold before prefixing (B4), never after.** `refusalText()` output is a single
  logical sentence today, but `why` comes from a verdict and may grow a newline. An
  unfolded newline would end the markdown blockquote and let the tail of the reason
  render as ordinary prose — or, in a digest that still reaches a managed block, as
  text outside the banner. Folding is the whole defence; it is not cosmetic.
- **Do not sanitize beyond B4.** The reason is code-owned control-plane text composed
  by the launcher itself, exactly like `appendRefuseAlert`'s record, which already
  reaches the digest through `formatAlerts` un-sanitized. Adding a second, different
  sanitizer here would create two answers to one question.
- **Atomic write, not append.** B5/B7: a hook may read this file at any instant. A
  temp-plus-rename means a reader sees either the old banner or the new one, never a
  partial line. Do not use `appendFileSync`.
- Do not use `writeFilePrivate` in the launcher — it lives in `src/core/private-fs.js`
  (violates B9). Use plain `fs` plus the B6 chmod. The app-side module may use
  whatever it likes, but `clearRefusalBanner` only needs `fs.rmSync(p, {force:true})`.
- **Clear before render in `sync`.** `sync` clears the banner (B10) and separately
  renders the digest. Order the clear **before** the `renderDigest` call so a
  successful sync's own digest does not carry a banner it just invalidated. The
  refusal's `alerts.jsonl` record is untouched and still renders through
  `formatAlerts`, so nothing is lost.
- Adding a basename to `A5_PRIVATE_FILE_BASENAMES` (B13) automatically widens
  `insecureEntries`, and therefore the `insecureModes` digest banner and
  `wienerdog doctor`. That is intended. It also means an existing install with a
  0644 banner self-heals at the next `sync` — no migration needed.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] The banner text is code-owned control-plane text composed by `refusalText()`
      from a verdict reason the launcher itself produced. No vault content, no
      transcript content, no user-supplied string reaches it. If a future verdict
      reason ever embeds an untrusted value, that is a defect at the verdict site,
      not here — do not add a sanitizer here to compensate.
- [ ] `p.state` is derived from `anchoredCore(opts.launcherFile)` — the launcher's own
      on-disk location — never from `WIENERDOG_HOME` or any other environment value.
      Do not introduce an env-derived path for the banner.
- [ ] The temp filename embeds `process.pid` and is created inside `p.state`, which is
      `mkdir`ed at `0o700`. No untrusted identifier flows into the path.
- [ ] The banner is written **before** `exit(1)` and must not delay or bypass it. A
      thrown error inside the writer must not escape `refuse()` (B8).

## Acceptance criteria

- [ ] AC-1 — A refusal writes `<core>/state/refusal-banner.md` containing exactly one
      line matching `^> \[!warning\] wienerdog: refusing to run` plus a trailing
      newline (Table B, B1/B3).
- [ ] AC-2 — The banner content equals `> [!warning]`, one space, then the folded `refusalText()`
      output for that refusal, byte-for-byte (B3/B4).
- [ ] AC-3 — A reason containing `\n` or a run of spaces/tabs is folded to single
      spaces, so the file still contains exactly one line (B4).
- [ ] AC-4 — A reason longer than 2000 characters is cut to 2000 characters before
      prefixing (B4).
- [ ] AC-5 — A second refusal overwrites the file; the file never contains two
      banner lines (B7).
- [ ] AC-6 — On POSIX the file's mode is `0600` after a refusal (B6).
- [ ] AC-7 — Making the banner write fail (unwritable `state`) still produces the
      refusal: non-zero exit, zero spawn, and the `alerts.jsonl` record is still
      appended (B8).
- [ ] AC-8 — `clearRefusalBanner` removes the file, and is a no-op (no throw) when it
      is already absent (B10).
- [ ] AC-9 — `'refusal-banner.md'` is a member of `A5_PRIVATE_FILE_BASENAMES` (B13).
- [ ] AC-10 — `grep -n "require(.*\.\./src" src/scheduler/launcher.js` returns
      nothing: the launcher still requires no app-tree code (B9).
- [ ] AC-11 — `wienerdog sync --dry-run` with a banner present leaves the banner in
      place (B12).
- [ ] AC-12 — Running `wienerdog sync` twice is idempotent: the second run reports
      zero changes and the banner remains absent.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern refusal-banner
npm test -- --test-name-pattern launcher
npm test
npm run lint
# B9 — the launcher still requires no app-tree code (expect NO output):
grep -n "require(['\"]\.\./src\|require(['\"]\.\./\.\./src" src/scheduler/launcher.js
# B1/B13 — the basename is registered exactly once in the A5 set:
grep -n "refusal-banner.md" src/core/private-fs.js
# B10 — both clearer sites exist:
grep -n "clearRefusalBanner" src/cli/run-job.js src/cli/sync.js
```

## Out of scope (do NOT do these)

- Reading or displaying the banner — that is `WP-refusal-banner-delivery`
  (SessionStart hook prepend + `renderDigest` fold).
- Bounding or restructuring `alerts.jsonl` / `appendRefuseAlert` — that is
  `WP-launcher-alert-bound`.
- Making the CLI shim fail with a human message — that is `WP-shim-recovery-message`.
- Rendering alerts live inside the hook from `alerts.jsonl` (option E1). ADR-0039 §6
  retains it as a **documented fallback that is not built**.
- Changing `refusalText`, `REMEDY_TAIL`, the remedy discriminator, or any verification
  logic in the launcher.
- Changing the managed block, the digest's shape, or any adapter.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(launcher): refusal banner file (WP-launcher-refusal-banner)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
