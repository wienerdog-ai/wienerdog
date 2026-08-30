---
id: WP-launcher-refusal-banner
title: Give a launcher-stage refusal its own delivery channel — a code-owned banner file the launcher writes without app-tree code
status: Draft
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

**The fix (ADR-0039 §5, as corrected by its Amendment 1).** The launcher writes a
**refusal banner**: code-owned, fixed text under `<core>/state/`, using the same
self-contained, no-app-tree-require discipline `appendRefuseAlert` already uses.
Per-job entries live in `<core>/state/refusal-banner/`, and the launcher rebuilds a
single concatenated `<core>/state/refusal-banner.md` from them — that concatenated file
is what every reader points at, because an `@import` cannot glob a directory. Later WPs
(`WP-refusal-banner-delivery`, `WP-managed-block-by-reference`) make the SessionStart
hook, `renderDigest` and the Claude Code managed block read it. **This WP writes,
clears and rebuilds; it does not yet display.** That is deliberate: the file format and
its lifecycle are one contract, and the readers are another.

**The clearing rule, and the round-1 premise that was false.** Round 1 of this spec
made clearing **unconditional** — any successful job, plus any attended `sync`, wiped
the banner — and justified it like this: *"the banner exists only to cover the case
where the app tree is broken. When the app tree is broken, no job succeeds and no sync
completes, so nothing clears it."*

**That premise does not hold, and the Codex round-2 review (finding F5) caught it.**
The launcher does not only refuse on whole-tree faults. Look at what it verifies:

```js
const verdict = isCatchup
  ? verifyCatchup(p, flags['expect-digest'], env, platform, flags['job-digests'])
  : verifyAndResolve(p, name, {
      descriptorPath: flags.descriptor,
      expectDigest: flags['expect-digest'],
      env, platform,
    });

if (!verdict.ok) return refuse(name, verdict.reason, remedyOf(verdict));
```

`verifyAndResolve(p, name, …)` is **per job**. A descriptor drift on the `dream` job —
a changed `config.yaml`, schedule, model or timeout — refuses `dream` while
`daily-digest` verifies and runs perfectly. Under the round-1 rule, `daily-digest`
succeeding would silently erase `dream`'s warning, and the user would never learn that
their nightly memory consolidation had stopped. That is the same class of defect this
whole chain exists to fix, reintroduced by the fix.

**The corrected design (owner-accepted, F5).** Banner state is **per job**:

- One entry per job under a launcher-owned directory, plus a single **concatenated
  file rebuilt from those entries** — so the readers, including the Claude Code
  managed-block import, have exactly **one** path to point at (an `@import` cannot
  glob a directory).
- The **launcher** clears a job's **own** entry when **that job's** verification
  passes, immediately before spawn. This is launcher-owned state needing no app-tree
  code, and it is what makes the mechanism correct: a job's banner is cleared by the
  only thing that actually knows that job is healthy again.
- An attended `sync` clears the whole directory, **after** the manifest save.
- `run-job` clears **nothing**. Its unconditional clear was precisely the defect.

**This also dissolves the 2026-08-01 arithmetic trap rather than working around it.**
That entry recorded a candidate fix that *"survived the threat model and failed the
arithmetic"*: `clearAlerts` fires only for real job names, and `--catch-up` is a
pseudo-job that never reports success, so nothing would ever clear a catch-up alert.
Round 1 answered that by clearing unconditionally — which traded one bug for another.
Per-job launcher-side clearing answers it properly: `--catch-up` clears its own entry
the next time catch-up **verifies**, which does not require it to *succeed* at
anything. The trap came from keying on job success; the fix is to key on job
verification, which the launcher performs for every job on every fire.

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

**You are reworking an existing branch, not starting fresh.** Round 1 of this spec was
implemented on `origin/wp/launcher-refusal-banner` (PR #174, HEAD `e17d638`), which is
**open and held**. Start from that branch. What it contains, and what survives:

| Existing on #174 | Verdict |
|------------------|---------|
| `writeRefusalBanner(p, text)` in `launcher.js` — folding, `mkdirSync(state, 0700)`, temp+rename, best-effort 0600 chmod, everything swallowed, exported for tests | **Keep the body.** Retarget it to write a per-job entry and then rebuild the concatenated file. Its fold/cap/atomicity/failure semantics are all still correct (Table B, B4–B8) |
| `BANNER_MAX_CHARS = 2000` with the "deliberate duplicate of `MAX_FIELD_CHARS`" comment | **Keep verbatim** (B4) |
| The `writeRefusalBanner(p, reason)` call in `refuse()`, before `appendRefuseAlert` | **Keep** (B2) |
| `src/core/refusal-banner.js` — `REFUSAL_BANNER_FILE`, `refusalBannerPath`, `readRefusalBanner`, `clearRefusalBanner`, and its "direction of the dependency" header | **Keep the module and the header.** `readRefusalBanner` now reads the concatenated file (unchanged behaviour); `clearRefusalBanner` becomes a whole-directory clear used only by `sync` (B10) |
| `'refusal-banner.md'` added to `A5_PRIVATE_FILE_BASENAMES` | **Keep**, and add the per-job directory to the A5 **dirs** set (B13) |
| `tests/unit/private-fs.test.js` membership assertion | **Keep** — the boundary check requires this file whenever an A5 basename is added |
| The `clearRefusalBanner(paths)` call in `src/cli/run-job.js`, with its "UNCONDITIONAL … Table B row B11" comment | **DELETE, including the `require`.** This is the F5 defect. `run-job` clears nothing |
| The `clearRefusalBanner(paths)` call at step `0b` of `src/cli/sync.js`, before `renderDigest` | **MOVE** to after `manifestMod.save(paths, manifest)` (Codex P1: never mutate state ahead of its manifest). Its digest must still render banner-free — see B10/B12 |
| `tests/unit/launcher.test.js` and `tests/unit/refusal-banner.test.js` | **Keep and extend.** The per-job cases in the acceptance criteria are new |

`refuse()`'s existing call site is unchanged by this rework; what changes is where
`writeRefusalBanner` puts its bytes, plus a new clear-on-verify call before spawn.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/launcher.js | per-job `writeRefusalBanner`; `clearRefusalBannerFor(p, job)` on a passing verdict before spawn; `rebuildRefusalBanner(p)` |
| create | src/core/refusal-banner.js | app-side read + whole-directory clear. The launcher NEVER requires this |
| modify | src/core/private-fs.js | `'refusal-banner.md'` in `A5_PRIVATE_FILE_BASENAMES`; the `refusal-banner/` dir in the A5 dirs set |
| modify | tests/unit/private-fs.test.js | **required** — it pins A5 membership by value; the boundary check rejects the PR without it |
| modify | src/cli/sync.js | clear the whole directory **after** `manifestMod.save`; render this sync's digest banner-free |
| create | tests/unit/refusal-banner.test.js | app-side reader/clearer |
| modify | tests/unit/launcher.test.js | per-job write, clear-on-verify, rebuild, cross-job isolation, failure swallowing |

**Removed from round 1:** `src/cli/run-job.js` is **no longer a deliverable**. If your
branch carries the round-1 `clearRefusalBanner` call there, delete it and its `require`
as part of this rework.

### Exact contracts

```js
// src/core/refusal-banner.js — app-side ONLY. The launcher writes its own copy.
/** Basename of the CONCATENATED banner inside <core>/state (Table B, B1a). */
const REFUSAL_BANNER_FILE = 'refusal-banner.md';
/** Directory of per-job entries inside <core>/state (Table B, B1). */
const REFUSAL_BANNER_DIR = 'refusal-banner';

/** Absolute path to the concatenated banner.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function refusalBannerPath(paths)

/** The concatenated banner text, or '' when absent/unreadable/empty. NEVER throws —
 *  a missing banner is the normal case. Trailing newlines trimmed.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function readRefusalBanner(paths)

/** Remove EVERY per-job entry and the concatenated file (Table B, B10b). Used only by
 *  attended `sync`, and only AFTER the manifest save. Idempotent; never throws.
 *  @param {import('./paths').WienerdogPaths} paths @returns {void} */
function clearRefusalBanner(paths)
```

```js
// src/scheduler/launcher.js — self-contained; Node built-ins only (Table B, B9).

/** Sanitize a job name into one safe path component (Table B, B14). Strip leading
 *  '-', replace every char outside [A-Za-z0-9._-] with '_', cut to 64 chars; an
 *  empty, '.' or '..' result becomes 'unknown'. '--catch-up' -> 'catch-up'.
 *  @param {string} job @returns {string} */
function safeJobFile(job)

/** Write THIS job's banner entry, then rebuild the concatenated file. Overwrites only
 *  this job's entry (B7); other jobs' entries are untouched. Atomic (temp + rename,
 *  with rmSync of the temp on rename failure — B5). Best-effort in EVERY step: a
 *  failure here must never affect the refusal, which stands on its non-zero exit and
 *  zero spawn (B8).
 *  @param {{state:string}} p @param {string} job @param {string} text refusalText() output */
function writeRefusalBanner(p, job, text)

/** Remove THIS job's entry (if any), then rebuild the concatenated file. Called
 *  immediately before spawn, once the job's verdict is ok (B10a). Best-effort.
 *  @param {{state:string}} p @param {string} job */
function clearRefusalBannerFor(p, job)

/** Rebuild <core>/state/refusal-banner.md from the entries in
 *  <core>/state/refusal-banner/, joined by a blank line in SORTED FILENAME ORDER
 *  (B1a). With no entries, REMOVE the concatenated file rather than writing it empty
 *  (B1b). Best-effort; 0600 (B6).
 *  @param {{state:string}} p */
function rebuildRefusalBanner(p)
```

**Literal expected content.** A catch-up refusal whose verdict reason is
`cannot resolve app/current` writes `<core>/state/refusal-banner/catch-up.md`
containing exactly one line plus a trailing newline:

```text
> [!warning] wienerdog: refusing to run "--catch-up" — cannot resolve app/current (integrity mismatch); no job was run. This alert will appear in your next digest. Do not run `wienerdog sync` — this check could not confirm the app files are the ones you installed, so syncing is not the safe next step. Reinstall Wienerdog from a trusted source, then investigate.
```

That is `> [!warning]`, one space, then the **folded** `refusalText()` output. Folding
(Table B, B4) is the only transformation applied. With `catch-up.md` the sole entry,
`<core>/state/refusal-banner.md` contains those same bytes. With a second entry
`dream.md`, the concatenated file is `catch-up.md`'s line, a blank line, then
`dream.md`'s line — sorted by filename, so `catch-up` precedes `dream`.

## Contract reference

Activation trigger (ADR-0031): **(ii)** a new artifact class with its own lifecycle
states; **(v)** the launcher emits the artifact but the app tree owns its
interpretation and disposal — an authority boundary; **(vi)** two successor specs
(`WP-refusal-banner-delivery`, and `WP-digest-stable-volatile-split` via the prefix
order) inherit it; **(vii)** the same facts are mirrored in the launcher, the app-side
module, the private-file set and the tests. Four of seven — the discipline is on.

### Table B — the refusal banner contract

This table is the single place these facts are decided. Every other statement in this
spec, in the code, and in successor specs defers to it. **Rewritten in round 2** by
Codex finding F5; rows B10–B12 replace an unconditional clearing rule that let one
job's success erase another job's warning.

| Row | Fact | Value |
|-----|------|-------|
| B1 | Per-job entry | `<core>/state/refusal-banner/<safe-job>.md` — one file per job, the source of truth |
| B1a | Concatenated file | `<core>/state/refusal-banner.md` — a **derived** artifact: every entry, joined by a blank line, in **sorted filename order**. Rebuilt by whoever mutates the directory, immediately after the mutation. This is the single path every reader and the Claude Code import point at, because an `@import` cannot glob a directory |
| B1b | Empty directory | No entries → the concatenated file is **removed**, not written empty. A missing import target is skipped silently, which is the healthy state |
| B2 | Sole writer | `writeRefusalBanner` in `src/scheduler/launcher.js`, called from `refuse()` only |
| B3 | Entry content | Exactly one line: `> [!warning]`, one space, then the folded `refusalText()` output, then one `\n`. Nothing else — no frontmatter, no second line |
| B4 | Folding | Replace every run of `\s+` with a single space, then trim. Then hard-cut to **2000** characters (matching `MAX_FIELD_CHARS` in `src/core/alerts.js`). Applied to the `refusalText()` output before the `> [!warning]` prefix (with its trailing space) is added |
| B5 | Write mode | Atomic: write `<path>.<pid>.tmp` then `renameSync` onto the target. `mkdirSync` the directory `recursive:true, mode:0o700` first. **On a rename failure, `fs.rmSync(tmp, {force:true})`** so a failed write leaves no orphan temp beside the artifact (Codex P2) |
| B6 | Permissions | `0600` on each entry and on the concatenated file, best-effort `fs.chmodSync` after rename, skipped on `win32` — identical to `appendRefuseAlert`'s handling |
| B7 | Multiplicity | One entry **per job**. A new refusal for the same job **overwrites** that job's entry; entries for other jobs are untouched. Entries never accumulate within a job |
| B8 | Failure policy | Every step wrapped so nothing throws. A failed banner write or rebuild is silent and changes nothing about the refusal (non-zero exit, zero spawn) |
| B9 | Dependencies | The launcher's writer, clearer and rebuilder use Node built-ins only. They must NOT require `src/core/refusal-banner.js` or any other `src/` module |
| B10 | Clearers | **(a)** the launcher removes `<safe-job>.md` for the job it just verified, immediately **before spawn**, then rebuilds; **(b)** attended `sync` removes the whole directory and the concatenated file, **after** `manifestMod.save`. `run-job` clears **nothing** |
| B11 | Clearing scope | **Per job.** A job's entry is cleared only by that job verifying, or by an attended `sync` clearing everything. A *different* job succeeding clears nothing — the launcher refuses on per-job verdicts, so one job's health is no evidence about another's |
| B12 | Dry-run and sync's own digest | `wienerdog sync --dry-run` never clears. A real `sync` renders its own digest **banner-free** (pass `''`), even though the clear itself happens later at B10(b) — the digest must not carry a banner the sync is about to invalidate |
| B13 | Privacy | `'refusal-banner.md'` joins `A5_PRIVATE_FILE_BASENAMES` and `<core>/state/refusal-banner/` joins the A5 private **dirs** set, so `repairPrivateModes` and `scanPrivateModes` cover both. Adding either **requires** updating `tests/unit/private-fs.test.js`, which pins membership by value |
| B14 | Job-name sanitization | Strip leading `-` (so `--catch-up` → `catch-up`), then replace every character outside `[A-Za-z0-9._-]` with `_`, then cut to 64 characters. If the result is empty, `.`, or `..`, use `unknown`. Applied to **every** path component derived from a job name, in the writer and the clearer alike |
| B15 | Readers | The SessionStart hook, `renderDigest`, and the Claude Code managed-block import — all of them read the **concatenated** file (B1a), never the directory. Implemented in `WP-refusal-banner-delivery` and `WP-managed-block-by-reference` |

### Mirrored Surface Checklist

Surfaces that mirror Table B — a review finding updates the table and every box below
in one pass, and any new mirror found in review is added here on the spot:

- [ ] Deliverables-table cells naming `src/core/refusal-banner.js`, the `private-fs.js`
      edit, `tests/unit/private-fs.test.js`, and the `sync` clearer site
      (mirror B1, B1a, B10, B13)
- [ ] The "Literal expected file content" block under Exact contracts (mirrors B3, B4)
- [ ] The `writeRefusalBanner` / `clearRefusalBannerFor` / `rebuildRefusalBanner` JSDoc
      in Exact contracts (mirrors B5, B7, B8, B9, B14)
- [ ] Acceptance criteria AC-1 … AC-17 (mirror B1 … B14)
- [ ] Verification greps for the directory, the sanitizer, the absence of a `src/`
      require in the launcher, and the absence of any clear in `run-job.js`
      (mirror B1, B9, B10, B14)
- [ ] Current-state rework table's "what survives" verdicts (mirror B2, B4–B8, B10, B13)
- [ ] The clearing-rationale section in Context (mirrors B10, B11)
- [ ] **`docs/GLOSSARY.md`'s `refusal banner` entry** (mirrors B1, B1a, B10, B11, B15) —
      registered in round 2; it states the clearing rule in user-facing words and must
      move whenever B10/B11 move
- [ ] ADR-0039 §5 and its Amendment 1 F5 paragraph (mirror B10, B11)

## Implementation notes & constraints

- **B9 is the load-bearing constraint of this WP.** The launcher's whole purpose is to
  verify the app tree before trusting it. A `require` from `src/` inside `launcher.js`
  would execute the code under suspicion. Put `safeJobFile`, `writeRefusalBanner`,
  `clearRefusalBannerFor` and `rebuildRefusalBanner` physically inside `launcher.js`,
  next to `appendRefuseAlert`, and keep the `BANNER_MAX_CHARS` duplication comment
  naming `MAX_FIELD_CHARS` as its twin. That duplication is deliberate (B4).
- **Where the clear-on-verify call goes (B10a).** In `main()`, after
  `if (!verdict.ok) return refuse(...)` and **before** the spawn. Use the same `name`
  the verdict was computed for, so the entry cleared is provably the entry that job
  would have written. Do not clear before verification, and do not clear on a refusal
  path.
- **`sync` ordering is two separate facts, and both matter (B10b, B12).** The clear
  moves to **after** `manifestMod.save(paths, manifest)` — Codex P1: a Ctrl-C between a
  state mutation and its manifest save strands the mutation, which is the same
  reversibility rule `WP-105` already had to learn. Independently, the digest that sync
  renders earlier in the same run must pass `''` for the banner, so it does not carry a
  banner the sync is about to invalidate. Round 1 achieved the second by clearing
  early; that is no longer available, so pass `''` explicitly.
- **Sanitize every path component (B14), in both the writer and the clearer.** A job
  name reaches `safeJobFile` from argv. An unsanitized `..` or `/` would let the entry
  path escape `state/refusal-banner/` — a write primitive in the one process that runs
  before integrity verification completes. The rule is fully specified in B14; implement
  it once and call it from both sites.
- **Fold before prefixing (B4), never after.** `refusalText()` output is a single
  logical sentence today, but `why` comes from a verdict and may grow a newline. An
  unfolded newline would end the markdown blockquote and let the tail of the reason
  render as ordinary prose. Folding is the whole defence; it is not cosmetic.
- **Do not sanitize the text beyond B4.** The reason is code-owned control-plane text
  composed by the launcher itself, exactly like `appendRefuseAlert`'s record, which
  already reaches the digest through `formatAlerts` un-sanitized. A second, different
  sanitizer here would create two answers to one question.
- **Atomic write, not append; clean up the temp on failure (B5).** A reader may open
  these files at any instant, so temp-plus-rename means a reader sees either the old
  content or the new, never a partial line. `renameSync` can fail (a full disk, a
  cross-device edge); wrap it so the temp is `rmSync`'d rather than left beside the
  artifact it failed to replace (Codex P2).
- **Rebuild after every mutation, and remove-on-empty (B1a, B1b).** The concatenated
  file is derived state; if a write or clear can leave it disagreeing with the
  directory, a reader shows a refusal that no longer exists. Removing it when the
  directory is empty is what makes the import's silent-skip semantics do the right
  thing — an empty file would render an empty banner block instead of nothing.
- Do not use `writeFilePrivate` in the launcher — it lives in `src/core/private-fs.js`
  (violates B9). Use plain `fs` plus the B6 chmod.
- Adding to the A5 sets (B13) automatically widens `insecureEntries`, the `insecureModes`
  digest banner and `wienerdog doctor`. That is intended, and it means an existing
  install with a 0644 banner self-heals at the next `sync` — no migration.
  `tests/unit/private-fs.test.js` pins A5 membership **by value**, so it is a required
  Deliverable, not an optional one; the boundary check rejects the PR without it.
- When uncertain: choose the simpler option and record it under "Decisions made" in the
  PR body. Do NOT expand scope.

## Security checklist

- [ ] `safeJobFile` (B14) is applied to **every** path component derived from a job
      name, in the writer and the clearer. It must reject `.`, `..` and empty results.
      Test `--catch-up`, `../../etc/passwd`, `a/b`, `..`, `.`, `''`, a 300-character
      name, and a name with a NUL or newline.
- [ ] The banner text is code-owned control-plane text composed by `refusalText()` from
      a verdict reason the launcher itself produced. No vault content, no transcript
      content, no user-supplied string reaches it. If a future verdict reason ever
      embeds an untrusted value, that is a defect at the verdict site, not here.
- [ ] `p.state` is derived from `anchoredCore(opts.launcherFile)` — the launcher's own
      on-disk location — never from `WIENERDOG_HOME` or any other environment value.
- [ ] Temp filenames embed `process.pid` and are created inside the banner directory,
      which is `mkdir`ed at `0o700`.
- [ ] The banner write happens **before** `exit(1)` and must not delay or bypass it. A
      thrown error inside the writer, clearer or rebuilder must not escape `refuse()`
      or the pre-spawn path (B8).
- [ ] `clearRefusalBannerFor` must remove **only** the named job's entry. Assert with
      two entries present that the other survives.

## Acceptance criteria

- [ ] AC-1 — A refusal for job `dream` writes
      `<core>/state/refusal-banner/dream.md` containing exactly one line matching
      `^> \[!warning\] wienerdog: refusing to run` plus a trailing newline (B1, B3).
- [ ] AC-2 — The entry content equals `> [!warning]`, one space, then the folded
      `refusalText()` output for that refusal, byte-for-byte (B3, B4).
- [ ] AC-3 — A reason containing `\n` or runs of spaces/tabs folds to single spaces, so
      the entry is still exactly one line (B4).
- [ ] AC-4 — A reason longer than 2000 characters is cut to 2000 before prefixing (B4).
- [ ] AC-5 — A `--catch-up` refusal writes `catch-up.md` (B14).
- [ ] AC-6 — `safeJobFile` maps every hostile input in the Security checklist to a
      single safe component, and never to `.`, `..` or `''` (B14).
- [ ] AC-7 — A second refusal for the **same** job overwrites that job's entry; the
      directory still holds exactly one entry for it (B7).
- [ ] AC-8 — **Cross-job isolation (the F5 regression test).** Job A refuses on a
      descriptor drift; job B then verifies and spawns. A's entry **survives** and the
      concatenated file still carries A's line (B11).
- [ ] AC-9 — **Self-clearing.** After AC-8, job A verifies. A's entry is gone, and with
      no entries left the concatenated file is **removed**, not left empty (B10a, B1b).
- [ ] AC-10 — With entries `dream.md` and `catch-up.md`, the concatenated file contains
      `catch-up`'s line, a blank line, then `dream`'s line — sorted filename order
      (B1a).
- [ ] AC-11 — On POSIX both an entry and the concatenated file are `0600` after a
      refusal (B6).
- [ ] AC-12 — Making the banner write fail (unwritable `state`) still produces the
      refusal: non-zero exit, zero spawn, and the `alerts.jsonl` record is still
      appended (B8).
- [ ] AC-13 — A `renameSync` failure leaves **no** `*.tmp` file behind (B5).
- [ ] AC-14 — `clearRefusalBanner` (app-side) removes every entry and the concatenated
      file, and is a no-op — no throw — when the directory is already absent (B10b).
- [ ] AC-15 — `'refusal-banner.md'` is a member of `A5_PRIVATE_FILE_BASENAMES` and the
      `refusal-banner/` directory is in the A5 dirs set, both pinned by
      `tests/unit/private-fs.test.js` (B13).
- [ ] AC-16 — `grep -n "require(.*\.\./src" src/scheduler/launcher.js` returns nothing
      (B9), and `src/cli/run-job.js` contains no reference to the refusal banner (B10).
- [ ] AC-17 — `wienerdog sync --dry-run` with entries present leaves them in place; a
      real `sync` clears them **after** the manifest save and renders its own digest
      banner-free (B12, B10b).
- [ ] AC-18 — Running `wienerdog sync` twice is idempotent: the second run reports zero
      changes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern refusal-banner
npm test -- --test-name-pattern launcher
npm test -- --test-name-pattern private-fs
npm test
npm run lint
# B9 — the launcher still requires no app-tree code (expect NO output):
grep -n "require(['\"]\.\./src\|require(['\"]\.\./\.\./src" src/scheduler/launcher.js
# B10 — run-job clears NOTHING (expect NO output):
grep -n "refusal-banner\|clearRefusalBanner" src/cli/run-job.js
# B10b — sync's clear is AFTER the manifest save (the clear line must come second):
grep -n "manifestMod.save\|clearRefusalBanner" src/cli/sync.js
# B13 — both A5 memberships are registered and pinned:
grep -n "refusal-banner" src/core/private-fs.js tests/unit/private-fs.test.js
```

## Out of scope (do NOT do these)

- Reading or displaying the banner — `WP-refusal-banner-delivery` (SessionStart hook
  prepend + `renderDigest` fold) and `WP-managed-block-by-reference` (the Claude Code
  import line).
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

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 finding F5 (owner: ACCEPTED), plus the wd-reviewer pass
  on PR #174.** Round 1's clearing rule was unconditional — any job success, plus any
  attended `sync`, wiped the banner — resting on the premise that *"the banner exists
  only to cover the case where the app tree is broken … no job succeeds and no sync
  completes, so nothing clears it."* **The premise is false.** `launcher.js` refuses on
  **per-job** verdicts (`verifyAndResolve(p, name, …)`), so a descriptor drift on
  `dream` refuses `dream` while `daily-digest` verifies and runs — and the round-1 rule
  would have let `daily-digest`'s success silently erase `dream`'s warning. The spec
  shipped a fresh instance of the defect the whole chain exists to fix. Changes:
  - **Table B rewritten.** New rows B1 (per-job entries under
    `state/refusal-banner/`), B1a (the concatenated file, rebuilt from the entries in
    sorted filename order — chosen over a bare directory because an `@import` cannot
    glob), B1b (remove-on-empty, so the import's silent skip means "no refusal"), B14
    (job-name sanitization: `--catch-up` → `catch-up`), B15 (readers). B7, B10, B11 and
    B13 rewritten; B5 gained the `rmSync(tmp)` on rename failure (Codex P2).
  - **The clearer moved into the launcher.** A job's entry is cleared when **that job**
    verifies, before spawn. This dissolves the 2026-08-01 logbook's arithmetic trap at
    its source rather than working around it: the trap came from keying on job
    *success*, which `--catch-up` never reports; keying on *verification*, which the
    launcher performs for every job on every fire, makes catch-up self-clearing.
  - **`src/cli/run-job.js` removed from the Deliverables entirely** — its unconditional
    clear was the defect. Round-1 implementations must delete that call and its
    `require`.
  - **`sync`'s clear moved to after `manifestMod.save`** (Codex P1 on #174: never
    mutate state ahead of its manifest — the reversibility rule WP-105 already learned),
    with the digest now rendered banner-free by passing `''` explicitly rather than by
    clearing early.
  - **`tests/unit/private-fs.test.js` recorded as a required Deliverable** (wd-reviewer
    note 10): it pins A5 membership by value, so the boundary check rejects the PR
    without it. Precedent: `docs/specs/done/WP-attended-alert-acknowledgement.md`.
  - **`docs/GLOSSARY.md`'s `refusal banner` entry registered in the Mirrored Surface
    Checklist** and rewritten to the new clearing rule.
  - **Current state reworked against `origin/wp/launcher-refusal-banner` (PR #174, HEAD
    `e17d638`)**, which is open and held: the implementer reworks that branch rather
    than starting fresh, so the section now says explicitly what survives and what is
    deleted.
