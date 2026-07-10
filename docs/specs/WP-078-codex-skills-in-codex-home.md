---
id: WP-078
title: Link Codex skills into $CODEX_HOME/skills (0.144.x discovery root), not ~/.agents/skills
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/078-codex-skills-in-codex-home
---

# WP-078: Link Codex skills into $CODEX_HOME/skills (0.144.x discovery root), not ~/.agents/skills

## Context (read this, nothing else)

Wienerdog installs a small set of shipped **skills** (SKILL.md folders named
`wienerdog-*`) so that a Claude Code or Codex CLI session exposes the
`/wienerdog-setup`, `/wienerdog-dream`, etc. commands. For each harness, the
`sync` step "registers" these skills by symlinking each `<core>/skills/wienerdog-*`
folder into the directory that harness scans for user-scope skills. The Claude
adapter links into `~/.claude/skills/`; the **Codex adapter** (`src/adapters/codex.js`,
WP-010) currently links into **`~/.agents/skills/`**.

**Second, subtler wall (field-confirmed).** Even once discovery works, a user
migrating from Claude Code predictably thinks the skills are still broken: **Codex
does not expose skills as `/`-slash commands.** There is no `/wienerdog-setup` in
Codex — its skills are *listed* with `/skills` and *invoked* by `$skill-name` mention
syntax (`$wienerdog-setup`) or plain-language request. So the adapter must also say
this once, in plain words, right after it links the skills — otherwise the Codex leg
looks dead to a Claude-Code muscle-memory user even after WP-078's fix. (Codex already
emits a similar one-line notice for the `/hooks` trust step; this is the same pattern.)

**The bug (verified on macOS, Codex CLI 0.144.1, wienerdog 0.6.6).** Current Codex
does **not** scan `~/.agents/skills/` for skills at all. Its user-scope
skill-discovery root is **`$CODEX_HOME/skills/` (default `~/.codex/skills/`)**.
Evidence from the 0.144.1 binary: strings say *"Installs into
`$CODEX_HOME/skills/<skill-name>` (defaults to `~/.codex/skills`)"* and *"Installed
annotations come from `$CODEX_HOME/skills`"*; there are **zero** `.agents/skills`
references — the only `.agents` use is the plugin marketplace
(`~/.agents/plugins/marketplace.json`). Codex's own built-in skills live at
`~/.codex/skills/.system/`, confirming the root in practice. So on current Codex,
`wienerdog sync` reports success, the `~/.agents/skills/wienerdog-*` symlinks exist
and resolve, yet **none of the `wienerdog-*` skills ever appear in a Codex session**
— the Codex half of the product is silently dead, and nothing in `sync` or `doctor`
flags it. The WP-010 research memo that chose `~/.agents/skills/` is stale.

**The fix (verified).** After manually symlinking `<core>/skills/wienerdog-*` into
`~/.codex/skills/`, `codex debug prompt-input` lists all seven `wienerdog-*` skills
in the model-visible `## Skills` section — so **symlinks in `~/.codex/skills/` ARE
followed** by Codex discovery; no copy fallback is needed on macOS (Windows
skill-linking uses the existing copy fallback, unchanged by this WP). This WP
changes the Codex adapter's skill-link target from `~/.agents/skills/` to
`$CODEX_HOME/skills/` (which `paths.codexDir` already computes, honoring
`$CODEX_HOME`).

**Two invariants this WP must not break.**
- **Never touch Codex's own `.system/`.** `~/.codex/skills/` already contains Codex's
  built-in `~/.codex/skills/.system/`. The adapter must only ever create/adopt
  `wienerdog-*` entries there and must never remove or record the `~/.codex/skills/`
  directory itself. (This already holds by construction — see "Current state".)
- **Uninstall stays exact.** Every symlink Wienerdog creates is recorded in the
  install manifest and removed by `wienerdog uninstall`. That must remain true for
  the new location, AND for a correct symlink a user created by hand (the field
  machine had manually-made links in `~/.codex/skills/` not yet in the manifest).

**Product invariant.** Wienerdog is just files; it never starts a process that
outlives its job (ADR-0004). This WP only changes which directory a symlink is
written into and updates tests — no daemon, no dependency, no new runtime file.

## Current state

**`src/adapters/codex.js`** builds the skill-link target and calls the shared
registrar (lines 47 and 90):

```js
const agentsSkillsDir = path.join(paths.home, '.agents', 'skills'); // NOT codexDir-relative
// …
// Step 3 — skill symlinks.
shared.applySkillLinks(skillsDir, agentsSkillsDir, dryRun, manifest, out);
```

Its top-of-function JSDoc (lines 29–31) documents Step 3 as linking into
`<home>/.agents/skills/`.

**`paths.codexDir`** (`src/core/paths.js:34`) is already `$CODEX_HOME || ~/.codex` —
Windows-safe and env-overridable. `path.join(paths.codexDir, 'skills')` is exactly
the discovery root.

**`src/adapters/shared.js` `applySkillLinks(skillsDir, targetSkillsDir, dryRun,
manifest, out, opts)`** (lines 258–341) is unchanged by this WP but you must rely on
its existing behavior — read it. Per `wienerdog-*` folder in `skillsDir` it computes
`linkPath = <targetSkillsDir>/<name>` and:
- **the target skills dir is only recorded as a `dir` manifest entry if the registrar
  had to create it** (line 273: `if (!fs.existsSync(targetSkillsDir))`). On a real
  Codex machine `~/.codex/skills/` already exists (it holds `.system/`), so **no
  `dir` entry is recorded → uninstall never tries to remove `~/.codex/skills/`** and
  `.system/` is safe. (Even if it were recorded, `reverse` only `rmdir`s an empty dir,
  and `.system/` keeps it non-empty.)
- **a pre-existing symlink already pointing at the core skill is ADOPTED into the
  manifest** — lines 288–297, the `currentTarget === target` branch, does
  `out.unchanged.push(linkPath); recordOnce(manifest, { kind: 'symlink', path:
  linkPath })`. So the field machine's hand-made `~/.codex/skills/wienerdog-*` links
  are recorded on the next `sync` and removed on a later uninstall. **This satisfies
  requirement "adopt an already-correct link into the manifest" with NO change to
  `shared.js`** — it is already implemented; this WP only adds a regression test to
  lock it (and confirms it applies to both adapters, since both route through this one
  function; the Claude adapter's behavior is unchanged).

**`src/cli/sync.js`** loads the existing manifest and extends it
(`const manifest = manifestMod.load(paths);`, line 147; saved at line 235). So entries
recorded by a **previous** install (including the old `~/.agents/skills/wienerdog-*`
symlink entries and the `~/.agents/skills` `dir` entry) **survive across a `sync`** and
are still reversed by a later uninstall. This is why the conservative migration below
needs zero code (see "Migration" and the resolved decision).

**Tests that pin the old path** (all in this WP's Deliverables):
- `tests/unit/codex-adapter.test.js` — comment at line 25; the test
  `'skills symlink into .agents/skills points at the core skill dir'` (lines 157–169,
  `linkPath = path.join(paths.home, '.agents', 'skills', 'wienerdog-setup')`); the
  uninstall test (line 210, same old `linkPath`); the integration test's skill-link
  assertion (line 325, `skillLink = path.join(home, '.agents', 'skills',
  'wienerdog-setup')`).
- `tests/integration/bootstrap-seam.test.js` — the test
  `'Codex present, plain init: skills + hooks under .agents, NO memory'`
  (lines 123–159), which asserts `path.join(root, '.agents', 'skills',
  'wienerdog-setup')` is a symlink (lines 155–158).

**No golden fixture encodes this path.** `tests/golden/codex-adapter/` holds only
`AGENTS.md` (managed-block content); no golden pins any skill path. No golden update
is in scope.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/codex.js | change the skill-link target to `path.join(paths.codexDir, 'skills')`; update the local var name + inline comment + the Step-3 JSDoc; push ONE plain-language notice after skill linking on how Codex skills are invoked |
| modify | tests/unit/codex-adapter.test.js | repoint the three `.agents/skills` references to `<codexDir>/skills`; retitle the skills test; assert the Codex skill-invocation notice is present |
| modify | tests/integration/bootstrap-seam.test.js | repoint the Codex skill-link assertion to `<CODEX_HOME>/skills`; retitle the test |
| modify | tests/unit/shared-skill-links.test.js | ADD one regression test: a pre-existing correct symlink is adopted into a fresh manifest (recorded `symlink`, reported `unchanged`) |

### Exact contracts

**1. `src/adapters/codex.js` — retarget.** Replace the Step-3 target and its use:

```js
// was: const agentsSkillsDir = path.join(paths.home, '.agents', 'skills'); // NOT codexDir-relative
const codexSkillsDir = path.join(paths.codexDir, 'skills'); // Codex user-scope skill-discovery root ($CODEX_HOME/skills, default ~/.codex/skills)
// …
// Step 3 — skill symlinks + Codex skill-invocation notice.
shared.applySkillLinks(skillsDir, codexSkillsDir, dryRun, manifest, out);
out.notices.push(
  "In Codex, skills aren't slash commands — type /skills to see them, then start one by typing $wienerdog-setup or just asking in plain words (there is no /wienerdog-setup command)."
);
```

The notice must be pushed **unconditionally** whenever Step 3 runs (skills always
register — Step 3 carries no user knowledge and is not gated on a vault/digest), so it
appears on both `init` and every `sync`, in dry-run and live runs alike, mirroring the
existing `/hooks`-trust notice one block above it. Exact wording above is preferred;
minor phrasing latitude is fine **provided** the line stays one sentence, plain
(no jargon per CLAUDE.md), and contains the literal substrings `/skills` and
`$wienerdog-setup` (the test asserts those).

Update the Step-3 JSDoc (currently lines 29–31) to read (wording exact enough; keep
the surrounding numbered-list style):

```
 *    3. Symlink each <core>/skills/wienerdog-* into <codexDir>/skills/ (Codex's
 *       user-scope skill-discovery root — $CODEX_HOME/skills, default
 *       ~/.codex/skills; NOT ~/.agents/skills, which current Codex uses only for
 *       the plugin marketplace — WP-078). Only wienerdog-* entries are created or
 *       adopted; Codex's own ~/.codex/skills/.system/ is never read or modified.
 *       Then push a NOTICE that Codex skills are not slash commands: /skills to
 *       list them, $wienerdog-setup (or plain language) to start one.
```

No other line in `codex.js` changes. Do **not** touch Steps 1–2, `claude.js`, or
`shared.js`.

**1b. Assert the notice (`tests/unit/codex-adapter.test.js`).** No existing test pins
the `notices` array exactly — the two current assertions use
`res.notices.some((n) => n.includes(...))` (the override-shadow and `/hooks` notices),
so adding a notice breaks nothing. Add a single assertion (fold it into the existing
`'hooks.json merge …'` test, which already captures `res`, or add a tiny dedicated
test) of the form:

```js
assert.ok(
  res.notices.some((n) => n.includes('/skills') && n.includes('$wienerdog-setup')),
  'expected the Codex skill-invocation notice'
);
```

No other test file asserts the Codex `notices` array (verified: only `.some(...)`
substring checks exist for this adapter), so `codex-adapter.test.js` is the only file
this sub-item touches — it is already in the Deliverables table.

**2. `tests/unit/codex-adapter.test.js` — repoint three references.**
- Line ~25 comment: change "or ~/.codex or ~/.agents" wording to reflect that skills
  now live under `~/.codex/skills` (cosmetic; keep the "never touches real dirs"
  intent).
- Retitle `'skills symlink into .agents/skills points at the core skill dir'` →
  `'skills symlink into <codexDir>/skills points at the core skill dir'` and set
  `const linkPath = path.join(paths.codexDir, 'skills', 'wienerdog-setup');`
  (the existing win32 early-return and the `isSymbolicLink()` /
  `readlinkSync === coreSkill` assertions stay).
- Uninstall test (line ~210): `const linkPath = path.join(paths.codexDir, 'skills',
  'wienerdog-setup');` (the non-win32 `existsSync(linkPath) === false` assertion
  stays — it now proves the new-location link is reversed).
- Integration test (line ~325): `const skillLink = path.join(codexHome, 'skills',
  'wienerdog-setup');` (`codexHome` is already the test's `CODEX_HOME`); the non-win32
  `isSymbolicLink()` assertion stays.

**3. `tests/integration/bootstrap-seam.test.js` — repoint the Codex assertion.**
Retitle `'Codex present, plain init: skills + hooks under .agents, NO memory'` →
`'Codex present, plain init: skills + hooks under <CODEX_HOME>/skills, NO memory'`
and change the link path (lines 155–158) to
`const link = path.join(codexDir, 'skills', 'wienerdog-setup');`
(`codexDir` is already the test's `CODEX_HOME = path.join(root, 'codex')`), keeping the
non-win32 `isSymbolicLink()` assertion. Nothing else in that test changes.

**4. `tests/unit/shared-skill-links.test.js` — adoption regression (new test).**
Add a test named `'a pre-existing correct symlink is adopted into the manifest
(recorded, reported unchanged)'` that:
- runs `setup()` to get `{ skillsDir, targetSkillsDir, coreSkill }`;
- creates the target dir and a **hand-made correct** symlink:
  `fs.mkdirSync(targetSkillsDir, { recursive: true });`
  `const linkPath = path.join(targetSkillsDir, 'wienerdog-setup');`
  `fs.symlinkSync(coreSkill, linkPath);` (skip on `process.platform === 'win32'` with
  an early `return`, mirroring the POSIX-symlink test at line 40);
- runs `shared.applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out)` with
  a **fresh** manifest (simulating a link Wienerdog never recorded);
- asserts the link is reported **unchanged** (`out.unchanged.includes(linkPath)`,
  `out.changed` does not include it), and the fresh manifest now records exactly
  `[{ kind: 'symlink', path: linkPath }]` for that path — i.e. the pre-existing link
  was adopted so a later uninstall reverses it.

This locks the shared behavior that makes the field machine's manual
`~/.codex/skills/wienerdog-*` links uninstall-clean after one `sync`. Do **not**
change `shared.js` to make this pass — it already passes against current `shared.js`;
if it does not, that is a discovery bug, not a licence to edit `shared.js` (report it
under "Discovered issues").

## Implementation notes & constraints

- **This is a retarget, not a refactor.** The only production change is the one
  directory the Codex adapter passes to `applySkillLinks`. Do not rename exports,
  reorder steps, or "improve" adjacent code.
- **Migration is intentionally code-free (conservative default).** On an already-
  installed machine, the old `~/.agents/skills/wienerdog-*` symlinks and the
  `~/.agents/skills` `dir` entry remain in the manifest (`sync` loads-and-extends,
  never rebuilds — `sync.js:147`). After this ships, the next `sync`:
  1. stops writing to `~/.agents/skills/` (target changed) — the old links become
     inert (Codex 0.144.x ignores them) but stay manifest-tracked;
  2. creates/adopts the new `~/.codex/skills/wienerdog-*` links and records them.
  A later `wienerdog uninstall` removes **both** old and new links from the manifest,
  so uninstall stays exact with zero migration code. Do **not** add code to delete the
  old `~/.agents/skills/` links in this WP — see the resolved decision below.
- **Idempotency.** A second `sync`/`applyCodexAdapter` after this change must report
  the new links `unchanged` and grow neither the manifest nor mtimes (the existing
  `'idempotency'` codex test already asserts this shape and must still pass).
- Zero new dependencies; no build step (CLAUDE.md).
- When uncertain, choose the simpler option and record it under "Decisions made".

### Resolved decision (RESOLVED 2026-07-10 — implement exactly this)

The migration question — should the next `sync` actively remove the stale
`~/.agents/skills/` links, or dual-write both locations — is **resolved in favor of
the conservative default**: **write ONLY to `$CODEX_HOME/skills/`; do NOT add
`~/.agents/skills/` links; do NOT prune the existing ones (leave them inert but
manifest-tracked).**

Basis: the parallel wd-researcher investigation,
`memory/research/2026-07-10-codex-cli-skills-discovery.md`. Key findings:
- Codex CLI launched (2025-12-02) with `$CODEX_HOME/skills` **only**;
  `~/.agents/skills` discovery was **added in source Feb 2026** (upstream PRs
  #10317/#10437), and current source even comments `$CODEX_HOME/skills` as
  "deprecated, kept for backward compatibility" with `~/.agents/skills` as primary.
- **But shipped 0.144.1 (released 2026-07-09) empirically does NOT scan
  `~/.agents/skills`** — corroborated by open upstream issues (#28505, #19719) and a
  community thread (2026-04-22); the upstream root cause is unknown. So there is **no
  confirmed shipped version range where `~/.agents/skills` reliably works**, while
  `$CODEX_HOME/skills` is **verified-current**.
- Researcher recommendation (adopted): write only to `$CODEX_HOME/skills/`; add no
  speculative `~/.agents/skills` links; re-scope WP-010's "`~/.agents/skills`" fact as
  *documented direction, not verified-current*.

Consequence for this WP: retarget to `$CODEX_HOME/skills/`; existing
`~/.agents/skills/wienerdog-*` links on already-installed machines stay
**inert-but-manifest-tracked** (uninstall still reverses them — see "Migration"). No
active pruning, no dual-write. This makes current Codex work and forecloses nothing.

**Watch item (a known FUTURE risk this WP does NOT handle).** Official Codex docs and
source point toward `~/.agents/skills` becoming the **primary** discovery root again
once OpenAI fixes discovery. On a machine that still carries the legacy
`~/.agents/skills/wienerdog-*` links from a pre-WP-078 install, a future Codex that
scans **both** roots would then find each `wienerdog-*` skill **twice** → possible
**duplicate skill listings**. This is a re-check item for future Codex upgrades (would
be handled by the deferred old-location pruning follow-up if it materializes), **not**
something WP-078 implements. Do not add pruning or dual-write here.

### Deferred to WP-079 (do NOT do here)

A `doctor` check that the expected `wienerdog-*` skill links exist under
`~/.codex/skills/` when Codex is detected — so the next silent discovery-root move is
caught — is scoped as the follow-up **WP-079** (depends on this WP). Do not add any
doctor logic in WP-078.

## Security checklist

- [ ] No new untrusted identifier. The link target is built from `paths.codexDir`
      (env-derived, already trusted) plus the fixed literal `'skills'`; skill folder
      names come from a `readdirSync` filtered to the `wienerdog-*` prefix that
      Wienerdog itself ships. No value flows into a shell command or a newly-derived
      filesystem path beyond the existing `path.join`.

## Acceptance criteria

- [ ] The Codex adapter writes/adopts skill symlinks under `<codexDir>/skills/`
      (`$CODEX_HOME/skills`, default `~/.codex/skills`), not `~/.agents/skills/`.
- [ ] A pre-existing correct symlink at `<codexDir>/skills/wienerdog-*` (user-made,
      not yet in the manifest) is adopted into the manifest on apply and reported
      `unchanged` (regression test passes against unmodified `shared.js`).
- [ ] `~/.codex/skills/` is never recorded as a removable `dir` when it pre-exists, so
      uninstall never removes it and `.system/` is untouched.
- [ ] The uninstall test proves a `<codexDir>/skills/wienerdog-*` link is reversed.
- [ ] `applyCodexAdapter` returns a one-line, plain-language notice (containing
      `/skills` and `$wienerdog-setup`) telling the user Codex skills are not slash
      commands and how to invoke them; a test asserts its presence.
- [ ] Running `applyCodexAdapter` twice is idempotent (second run: zero changes, no
      mtime churn).
- [ ] `npm test` and `npm run lint` pass; no `shared.js`/`claude.js` changes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'skill|codex|adapter|bootstrap|adopt'
npm test
npm run lint
```

### Manual macOS verification (optional but recommended — owner/tester gate)

On a machine with Codex CLI ≥ 0.144 installed, from a build of this branch, after
`wienerdog sync`:

```sh
ls -la ~/.codex/skills/            # wienerdog-* symlinks present alongside .system/
codex debug prompt-input | sed -n '/## Skills/,/^## /p'   # lists the wienerdog-* skills
```

Confirm all shipped `wienerdog-*` skills appear in the model-visible `## Skills`
section and that `~/.codex/skills/.system/` is intact. Paste the output (or defer to
the owner/tester, WP-073/077 precedent).

## Out of scope (do NOT do these)

- Active removal / pruning of the old `~/.agents/skills/` links or a dual-write to
  both locations — resolved against for this WP (see the resolved decision); a
  possible future follow-up only, not this WP.
- The `doctor` Codex-skill-link check — **WP-079**.
- Any change to `src/adapters/shared.js`, `src/adapters/claude.js`, `src/cli/sync.js`,
  or the manifest/uninstall subsystem.
- Golden fixtures (none pin skill paths).
- Windows skill copy-fallback behavior (unchanged; already handled by WP-050).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. The manual
   macOS check is completed or explicitly deferred to the owner/tester.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(adapters): link Codex skills into $CODEX_HOME/skills (WP-078)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
