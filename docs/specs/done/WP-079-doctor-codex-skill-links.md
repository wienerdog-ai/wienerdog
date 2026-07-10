---
id: WP-079
title: doctor check — Codex skill links exist under $CODEX_HOME/skills when Codex is detected
status: Done
model: sonnet
size: S
depends_on: [WP-078]
adrs: [ADR-0004]
branch: wp/079-doctor-codex-skill-links
---

# WP-079: doctor check — Codex skill links exist under $CODEX_HOME/skills when Codex is detected

## Context (read this, nothing else)

`wienerdog doctor` (`src/cli/doctor.js`) prints one `[ok]`/`[warn]`/`[fail]` line per
health check and exits 1 if any check **fails** (warnings never fail). It already
checks: core dir, manifest parses, config non-empty, vault, secrets perms, a harness
detection summary, and — via a read-only probe — whether each registered scheduler
entry is loaded.

**Why this WP exists.** WP-078 fixed a bug where the Codex adapter linked its skills
into `~/.agents/skills/`, which current Codex CLI (0.144.x) does **not** scan — its
skill-discovery root is `$CODEX_HOME/skills/` (default `~/.codex/skills/`). That bug
was silent: `sync` reported success while the Codex half of the product was dead, and
nothing in `doctor` flagged it. OpenAI has now moved this discovery root **once**, so
a `doctor` check that the expected skill links actually exist under the directory
Codex scans is worth having as defense-in-depth — it converts the next silent
discovery-root move (or a user who deleted a link) into a visible, actionable warning.

**What "registered" means here.** When Codex is present, `sync` links each shipped
`<core>/skills/wienerdog-*` folder into `<codexDir>/skills/` — as a **symlink** on
POSIX, or (where symlink creation is unpermitted, e.g. Windows without privilege) as a
**copied directory** (WP-050). Either form counts as correctly registered. Codex's own
`~/.codex/skills/.system/` is unrelated and must be ignored.

**Scope discipline.** This is a **read-only** check — `doctor` never mutates (the
honest remediation is `wienerdog sync`, which re-links). A missing/broken link is a
**warn**, not a fail (a Codex-less machine, or a just-installed one, is normal). This
WP adds one focused check and its tests; it changes no adapter, no `sync`, no manifest.

**Product invariant.** Wienerdog is just files; it never starts a process that
outlives its job (ADR-0004). This WP only reads the filesystem and prints lines.

## Current state

**`src/cli/doctor.js`** `run(_argv)` builds a `check(status, msg)` closure that logs
`[status] msg` and sets `failed = true` only on `'fail'`. Near the end it does the
harness summary and the scheduler check:

```js
const harnesses = detectHarnesses();
check(
  'ok',
  `AI tools — Claude Code: ${harnesses.claude.present ? 'found' : 'not found'}, ` +
    `Codex CLI: ${harnesses.codex.present ? 'found' : 'not found'}`
);

const { doctorSchedulerChecks } = require('../scheduler/status');
for (const c of doctorSchedulerChecks(paths)) check(c.status, c.msg);
```

- `detectHarnesses()` (`src/core/detect.js`) returns `{ claude: {present, dir}, codex:
  {present, dir} }` where `codex.dir === paths.codexDir` and `present` is
  `dirExists(paths.codexDir)`.
- `paths.codexDir` = `$CODEX_HOME || ~/.codex`; `<core>/skills/` is staged by every
  `sync` (vault-independent, WP-028), so the shipped `wienerdog-*` folders exist there
  after any install.
- `doctorSchedulerChecks(paths)` returns an array of `{status, msg}` — the pattern
  this WP mirrors: a small pure helper that returns lines, invoked by `run` in a loop.

**`tests/unit/doctor.test.js`** drives `doctor` as a subprocess
(`run(['doctor'], env)`) against an isolated temp `HOME`/`WIENERDOG_HOME` and asserts
on stdout / exit code. `tempEnv()` sets `CODEX_HOME` to a **non-existent**
`path.join(root, 'absent-codex')` (so Codex is "not found" by default). To exercise a
Codex-present machine, a test can set `CODEX_HOME` to a real dir before `init` so the
adapter links the skills, exactly as `codex-adapter.test.js` and
`bootstrap-seam.test.js` already do.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/doctor.js | add a `codexSkillChecks(paths, harnesses)` helper returning `{status,msg}[]`; call it in `run`, one `check(...)` per returned line |
| modify | tests/unit/doctor.test.js | add cases: Codex present + links intact → `[ok]`; Codex present + one link deleted → `[warn]`, exit 0; Codex absent → no Codex-skill line |

### Exact contracts

**1. `codexSkillChecks(paths, harnesses)` — new helper in `doctor.js`.** Pure and
read-only; returns an array of `{status:'ok'|'warn', msg:string}` (never `'fail'`).

```js
/** Verify each shipped wienerdog-* skill is registered under <codexDir>/skills/
 *  (a symlink OR a copied dir — both count; WP-050). Read-only; a missing/broken
 *  link is a WARN (remediation: 'wienerdog sync'), never a fail. Empty array when
 *  Codex is not detected. Codex's own <codexDir>/skills/.system/ is ignored.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{codex:{present:boolean}}} harnesses
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function codexSkillChecks(paths, harnesses) { /* … */ }
```

Behavior:
- If `!harnesses.codex.present` → return `[]` (no line at all; the harness summary
  already reports "Codex CLI: not found").
- Read `<core>/skills` (`path.join(paths.core, 'skills')`) for entries whose name
  starts with `wienerdog-` (`readdirSync(..., {withFileTypes:true})`, keep
  `isDirectory() || isSymbolicLink()`). If that read fails or yields none, return `[]`
  (nothing to check — a broken core is already covered by other checks).
- For each such `name`, let `linkPath = path.join(paths.codexDir, 'skills', name)`.
  Consider it **registered** iff `fs.existsSync(linkPath)` is true AND, when
  `fs.lstatSync(linkPath).isSymbolicLink()`, the link resolves (`fs.existsSync`
  following the link is already true, so a dangling symlink — `lstat` ok but
  `existsSync` false — is **not** registered). A real directory (copied skill) with the
  name present counts as registered. (You do not need to verify the symlink target
  byte-for-byte; presence + resolvability is the health signal.)
- Collect the `name`s that are **not** registered.
  - none missing → return a single `{status:'ok', msg:\`Codex skills registered
    (${count}) under ${path.join(paths.codexDir, 'skills')}\`}`.
  - some missing → return a single `{status:'warn', msg:\`Codex skills NOT registered
    under ${path.join(paths.codexDir, 'skills')}: ${missing.join(', ')} — run
    'wienerdog sync' to (re)link them\`}`.

Return **one** summary line (ok or warn), not one line per skill, to keep `doctor`
output compact and match the scheduler-check density.

**2. Wire into `run`.** Immediately after the existing scheduler-check loop, add:

```js
for (const c of codexSkillChecks(paths, harnesses)) check(c.status, c.msg);
```

`harnesses` is already in scope from the summary line above. No other change to `run`;
the update-notice block stays last.

**3. Tests (`tests/unit/doctor.test.js`).** Add three cases using the existing
`run`/`tempEnv` helpers:

- **Codex present, links intact → `[ok]`, exit 0.** Build `env` from `tempEnv()`, then
  set `env.CODEX_HOME = path.join(env.root??…, 'codex')` — since `tempEnv` does not
  expose a codex dir, create one: `const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome, {recursive:true}); env.CODEX_HOME = codexHome;` **before**
  `run(['init','--yes'], env)` so the Codex adapter links skills. On win32 the links
  are copies; both count. Assert `r.status === 0` and
  `r.stdout` matches `/\[ok\] Codex skills registered \(\d+\)/`.
- **Codex present, one link removed → `[warn]`, exit 0.** Same setup + `init`; then
  delete one link: `fs.rmSync(path.join(codexHome, 'skills', 'wienerdog-setup'),
  {recursive:true, force:true})`. Run `doctor`; assert `r.status === 0` (warn, not
  fail) and `r.stdout` matches `/\[warn\] Codex skills NOT registered .*wienerdog-setup/`.
- **Codex absent → no Codex-skill line.** Default `tempEnv()` (CODEX_HOME points at a
  non-existent `absent-codex`); `init` + `doctor`; assert `r.stdout` does **not** match
  `/Codex skills/` and `r.status === 0`.

(Use `wienerdog-setup` as the probe skill name — it is always shipped and is the name
the other adapter tests use.)

## Implementation notes & constraints

- **Read-only, warn-not-fail.** `doctor` must never create or repair a link; the only
  remediation it prints is `wienerdog sync`. A missing link is a `warn`.
- **Ignore `.system/`.** Never enumerate `<codexDir>/skills/` to decide health — drive
  the check from the shipped `<core>/skills/wienerdog-*` set, so Codex's own `.system/`
  (and any unrelated user skill) is structurally out of scope.
- **Both link forms count.** A symlink (POSIX) and a copied dir (Windows fallback,
  WP-050) are equally "registered". Test on POSIX exercises symlinks; the copied-dir
  path is covered on win32 CI-less but the `existsSync`-based predicate treats both
  identically.
- Zero new dependencies; no build step. Do not touch the adapters, `sync`, `detect`,
  or the manifest.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input. Skill names come from a `readdirSync` of Wienerdog's own
      shipped `<core>/skills/` filtered to the `wienerdog-*` prefix; paths are built
      with `path.join` from `paths.core`/`paths.codexDir` (env-derived, already
      trusted). The check only `stat`s/`existsSync`es paths and prints strings — no
      value flows into a shell command or a mutation.

## Acceptance criteria

- [ ] When Codex is detected and all shipped skills are linked under
      `<codexDir>/skills/`, `doctor` prints one `[ok] Codex skills registered (N) …`
      line and exits 0.
- [ ] When Codex is detected but a shipped skill is missing/broken under
      `<codexDir>/skills/`, `doctor` prints one `[warn] Codex skills NOT registered …
      run 'wienerdog sync' …` line naming the missing skill(s) and **still exits 0**.
- [ ] When Codex is not detected, `doctor` prints **no** Codex-skill line.
- [ ] `doctor` performs no filesystem mutation in any of these paths.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern doctor
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The adapter retarget itself — **WP-078** (this WP depends on it).
- Any auto-repair from `doctor` (remediation is `sync`, which already heals via the
  adapter's idempotent re-link).
- A Claude-side skill-link doctor check — not requested; if wanted, a separate WP.
- Surfacing this in the session digest — the digest's cache-then-render split is a
  separate concern; not scoped here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch from frontmatter; conventional commits; PR titled
   `feat(doctor): flag missing Codex skill links under $CODEX_HOME/skills (WP-079)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-10)

Merged to main as `48d9f51` (PR #79, squash). Reviewer verdict: approve —
message strings byte-match the spec literals; warn-never-fail semantics
verified (missing skill cannot flip doctor's exit code); silent when Codex is
absent. The implementer's `existsSync` simplification (dropping the spec's
separate lstat branch) was empirically proven equivalent across all four
registration states (valid link / dangling link / copied dir / absent) — the
dangling state correctly reads as not-registered. Non-blocking residual: the
"link removed" test covers the absent state, not the dangling state; dangling
behavior verified out of band only — future test-hardening candidate. Ships to
users with the next release (0.6.7).
