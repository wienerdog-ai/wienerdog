---
id: WP-083
title: Skill ownership registry — tamper-proof write-origin marker for dream-created skills
status: In-Review
model: opus
size: S
depends_on: []
adrs: [ADR-0020, ADR-0004, ADR-0012, ADR-0019]
branch: wp/083-skill-ownership-registry
---

# WP-083: Skill ownership registry — tamper-proof write-origin marker for dream-created skills

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent sessions into the user's
markdown **vault**. A sandboxed headless brain (`claude -p`, tools
Read/Write/Edit/Glob/Grep, no Bash/network) writes into the vault; then the
**orchestrator** (`src/core/dream/validate.js`, `validateAndCommit`) re-checks
every write in code, reverts violations per-item, and makes exactly ONE git
commit (ADR-0012: one dream = one commit). The dream already **creates** skills
from recurring patterns: a multi-step procedure seen in ≥ 3 distinct sessions
becomes a draft `<skills_dir>/<name>/SKILL.md` (`status: incubating` → `active`),
kept by the orchestrator's **Tier-3 floor** (`confidence ≥ 0.85`,
`recurrence ≥ 3`, `derived_from_untrusted === false`).

ADR-0020 ("Skill revision lifecycle") lets a later dream **revise** those skills.
Its hard invariant is **dream-created-only scope**: only a skill the dream itself
created may be revised — never a user-authored, imported, or shipped
`wienerdog-*` skill. The original design authenticated this from the skill's own
`origin: dream` frontmatter, re-checked against `HEAD`. An adversarial review
found that **forgeable**: ADR-0012 commits interactive-session edits BEFORE the
brain runs, so `HEAD` at validate time already contains anything a session (or an
injected assistant turn) wrote — including a hand-added `origin: dream` label on a
skill the dream never created. HEAD frontmatter cannot prove creation provenance.

**This WP builds the fix: a tamper-proof ownership registry.** A new
orchestrator-maintained file `state/skill-registry.json` records the path of every
skill *at the moment the orchestrator accepts it as a new draft from the brain*.
A later revision is authorized (WP-082) only if the skill's path is in the
registry. The registry is tamper-proof because it lives in the **core** (`state/`),
outside the vault: the dream brain's sandbox grants tool access to the vault and
the scratch dir ONLY (`--add-dir vaultDir scratchDir`; the registry is a sibling
of the scratch dir, not under it), so the brain cannot write it — and interactive
sessions only ever write the vault. `origin: dream` frontmatter stays as a
human-readable provenance convention but no longer authorizes anything.

Two product invariants bound this WP. **Wienerdog is just files (ADR-0004):** the
registry is a JSON state file written by the already-scheduled dream — no new
process, daemon, server, or telemetry. **One dream = one commit (ADR-0012):** the
registry write happens AFTER the single dream commit, alongside the existing
`state/` writes (watermark, digest) — it is NOT committed to the vault and adds no
second commit. This WP writes and reads the registry only; nothing yet *consumes*
it for authorization — that is WP-081 (ledger validator) and WP-082 (revision).

## Current state

**`src/core/dream/validate.js`** — `validateAndCommit(o)` (module already
requires `fs`, `path`; `parseFrontmatter` is module-scope). Its options are
`{ vaultDir, scratchDir, date, expectedScratch, scratchBaseline?, layout? }`.
The relevant pieces:

- `layout` is in scope in `validateAndCommit` (`layout.skills_dir` defaults to
  `'05-Skills'`); `tier3Prefixes`/`isTier3(rel)` classify Tier-3 paths.
- `tier3Decision(vaultDir, rel)` — the numeric floor.
- The **Step-2 classification loop** today (base version, before WP-081/082):

```js
for (const change of changedPaths(vaultDir)) {   // change = { code, path, untracked }
  const rel = change.path;
  const { inside } = resolveContainment(vaultReal, vaultDir, rel);
  if (!inside) { revertPath(vaultDir, rel, change.untracked); outOfVaultDetailed.push({/*…*/}); continue; }
  if (isTier3(rel)) {
    const decision = tier3Decision(vaultDir, rel);
    if (!decision.ok) { revertPath(vaultDir, rel, change.untracked); reverted.push({ path: rel, reason: decision.reason }); }
    continue;
  }
  // Tier-1/2 note, daily log, or report → keep.
}
```

- **Step 5** stages everything and makes exactly one commit; `validateAndCommit`
  returns `{ committed, reverted, outOfVault, sha, counts }`.
- `change.untracked` is `true` for a newly-added file (git `??`), `false` for a
  modification of a tracked file.

**`src/cli/dream.js`** (the orchestrator's `run()`) calls `validateAndCommit` at
step 13:

```js
const res = validateAndCommit({
  vaultDir,
  scratchDir: sel.scratchDir,
  date,
  expectedScratch: sel.wrote,
  scratchBaseline,
  layout,
});
```

`paths.state` (the core's `state/` dir; `require('../core/paths')` → `getPaths`)
is in scope in `run()` — steps 14/15 already write `state/watermarks.json` and
`state/digest.md` there, AFTER the commit. `disposeCoreMechanics`
(`src/core/manifest.js`, ADR-0019) recursively removes `state/` on uninstall, so
anything written there is uninstall-clean with no manifest entry.

**The brain sandbox** (`src/core/dream/brain.js`) grants
`--add-dir vaultDir` (write) and `--add-dir scratchDir` (read the extracts).
`state/skill-registry.json` is a sibling of the scratch dir inside `state/`, under
neither added dir — the brain has no tool access to it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/skill-registry.js | registry read/write/lookup module (atomic JSON in `state/`) |
| modify | src/core/dream/validate.js | add optional `stateDir`; collect accepted new skill drafts; Step-6 registry write after commit |
| modify | src/cli/dream.js | pass `stateDir: paths.state` to `validateAndCommit` |
| create | tests/unit/skill-registry.test.js | module unit tests (read missing/corrupt, record, lookup, atomic) |
| modify | tests/unit/dream-validate.test.js | registry written for a new dream skill; not for modify / below-floor / wienerdog-* / no-stateDir |

### Exact contracts

#### 1. `src/core/dream/skill-registry.js` — new module

The registry file `state/skill-registry.json` maps a **vault-relative** SKILL.md
path to the accepted skill's `{created, id}` (both read from its frontmatter at
acceptance):

```json
{
  "version": 1,
  "skills": {
    "05-Skills/meeting-notes/SKILL.md": { "created": "2026-07-11", "id": "meeting-notes" }
  }
}
```

Exact exports (zero deps, plain Node ≥ 18, JSDoc types):

```js
/** @param {string} stateDir @returns {string} absolute path to skill-registry.json */
function registryPath(stateDir)

/** Read the registry. Missing/corrupt/malformed → { version:1, skills:{} }.
 *  @param {string} stateDir
 *  @returns {{version:number, skills:Record<string,{created:string,id:string}>}} */
function readRegistry(stateDir)

/** Record NEW dream-created skills, merging into the existing registry and
 *  writing ATOMICALLY (temp file + rename, mirroring watermarks.js). Idempotent:
 *  re-recording an existing key overwrites it with the same value. No-op on an
 *  empty entries array.
 *  @param {string} stateDir
 *  @param {Array<{rel:string, created:string, id:string}>} entries */
function recordSkills(stateDir, entries)

/** @param {{skills:Record<string,{created:string,id:string}>}} registry @param {string} rel
 *  @returns {{created:string, id:string}|null} the entry, or null if unregistered */
function registeredEntry(registry, rel)

module.exports = { registryPath, readRegistry, recordSkills, registeredEntry };
```

- `readRegistry`: `JSON.parse` the file; if it is a non-object, or `skills` is
  missing/not an object, or the read/parse throws → return `{ version: 1, skills: {} }`.
  Never throw. (Same defensive posture as `watermarks.js`'s `readWatermarks`.)
- `recordSkills`: `fs.mkdirSync(stateDir, { recursive: true })`, write to
  `${file}.tmp-${process.pid}`, then `fs.renameSync` over the target. Always write
  `{ version: 1, skills }`.

#### 2. `src/core/dream/validate.js` — write the registry after the commit

At the top, require the module:

```js
const { recordSkills } = require('./skill-registry');
```

Add a module-scope helper near `tier3Decision`:

```js
/**
 * A NEW skill draft eligible for the ownership registry: an untracked SKILL.md
 * under the skills dir whose folder is NOT a shipped `wienerdog-*` skill.
 * @param {string} rel  vault-relative path
 * @param {import('../layout').VaultLayout} layout
 * @returns {boolean}
 */
function isNewSkillDraft(rel, layout) {
  const skillsPrefix = layout.skills_dir + '/';
  if (!rel.startsWith(skillsPrefix) || path.basename(rel) !== 'SKILL.md') return false;
  const folder = rel.slice(skillsPrefix.length).split('/')[0] || '';
  return !/^wienerdog-/.test(folder);
}
```

Destructure the new optional `stateDir` and declare the collector:

```js
const { vaultDir, scratchDir, date, expectedScratch, scratchBaseline, stateDir } = o;
```

```js
/** @type {Array<{rel:string, created:string, id:string}>} */
const newSkills = [];
```

In the Step-2 `isTier3` branch, collect accepted new drafts (the base branch,
before WP-081/082 land):

```js
if (isTier3(rel)) {
  const decision = tier3Decision(vaultDir, rel);
  if (!decision.ok) {
    revertPath(vaultDir, rel, change.untracked);
    reverted.push({ path: rel, reason: decision.reason });
    continue;
  }
  // Accepted. If it is a NEW (untracked) dream-created skill draft, remember it
  // for the ownership registry (written after the commit — Step 6).
  if (change.untracked && isNewSkillDraft(rel, layout)) {
    const fm = parseFrontmatter(fs.readFileSync(path.join(vaultDir, rel), 'utf8'));
    newSkills.push({ rel, id: String(fm.id || ''), created: String(fm.created || date) });
  }
  continue;
}
```

After Step 5 (the commit), add Step 6:

```js
// ── Step 6: record newly-accepted dream-created skills in the ownership registry
//     (ADR-0020). AFTER the commit so the registry only ever references committed
//     skills. A crash between the commit and here leaves a committed-but-
//     unregistered (never-revisable) skill — fail closed, no backfill. Skipped
//     when no stateDir is provided (older direct callers / integration tests).
if (stateDir && newSkills.length > 0) recordSkills(stateDir, newSkills);
```

Update `validateAndCommit`'s options `@typedef` to document `stateDir?:string`
("core `state/` dir; when provided, newly-accepted dream-created skills are
recorded in `state/skill-registry.json` after the commit — ADR-0020. Omitted →
no registry write."). No change to the return shape, the commit, the counts, or
any other branch.

#### 3. `src/cli/dream.js` — pass the state dir

Add `stateDir: paths.state` to the step-13 `validateAndCommit` call (one line;
`paths` is already in scope):

```js
const res = validateAndCommit({
  vaultDir,
  scratchDir: sel.scratchDir,
  date,
  expectedScratch: sel.wrote,
  scratchBaseline,
  layout,
  stateDir: paths.state,
});
```

#### 4. `tests/unit/skill-registry.test.js` — module unit tests

Use `node:test` + `node:assert`, a `mkdtempSync` temp dir. Cover:

```js
test('readRegistry: missing file → empty registry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  assert.deepEqual(readRegistry(dir), { version: 1, skills: {} });
});

test('readRegistry: corrupt JSON → empty registry (never throws)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  fs.writeFileSync(path.join(dir, 'skill-registry.json'), '{not json');
  assert.deepEqual(readRegistry(dir), { version: 1, skills: {} });
});

test('recordSkills: writes atomically and is idempotent + additive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  recordSkills(dir, [{ rel: '05-Skills/a/SKILL.md', created: '2026-07-11', id: 'a' }]);
  recordSkills(dir, [{ rel: '05-Skills/a/SKILL.md', created: '2026-07-11', id: 'a' }]); // idempotent
  recordSkills(dir, [{ rel: '05-Skills/b/SKILL.md', created: '2026-07-12', id: 'b' }]); // additive
  const reg = readRegistry(dir);
  assert.equal(Object.keys(reg.skills).length, 2);
  assert.deepEqual(reg.skills['05-Skills/a/SKILL.md'], { created: '2026-07-11', id: 'a' });
  assert.equal(registeredEntry(reg, '05-Skills/b/SKILL.md').id, 'b');
  assert.equal(registeredEntry(reg, '05-Skills/missing/SKILL.md'), null);
});

test('recordSkills: empty entries is a no-op (no file created)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reg-'));
  recordSkills(dir, []);
  assert.equal(fs.existsSync(path.join(dir, 'skill-registry.json')), false);
});
```

#### 5. `tests/unit/dream-validate.test.js` — registry integration

`tempVault()` returns `{ root, vault, scratch }`; seed a `stateDir` under `root`.
A dream-created skill kept by the floor needs `confidence ≥ 0.85`,
`recurrence ≥ 3`, `derived_from_untrusted: false`, plus `id`/`created` for the
registry entry. Use the file's `FM`/`writeVault` helpers.

```js
const { readRegistry } = require('../../src/core/dream/skill-registry');

const OK_SKILL = { type: 'skill', id: 'newone', created: '2026-07-11',
  origin: 'dream', confidence: '0.9', recurrence: '3', derived_from_untrusted: 'false' };

test('dream-validate: a NEW dream-created skill is recorded in the registry', () => {
  const { root, vault, scratch } = tempVault();
  const stateDir = path.join(root, 'state');
  writeVault(vault, '05-Skills/newone/SKILL.md', FM(OK_SKILL));
  validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-11', expectedScratch: [], stateDir });
  const reg = readRegistry(stateDir);
  assert.deepEqual(reg.skills['05-Skills/newone/SKILL.md'], { created: '2026-07-11', id: 'newone' });
});

test('dream-validate: a below-floor new skill is reverted and NOT registered', () => {
  const { root, vault, scratch } = tempVault();
  const stateDir = path.join(root, 'state');
  writeVault(vault, '05-Skills/weak/SKILL.md',
    FM({ ...OK_SKILL, id: 'weak', confidence: '0.4', recurrence: '1' }));
  validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-11', expectedScratch: [], stateDir });
  assert.equal(readRegistry(stateDir).skills['05-Skills/weak/SKILL.md'], undefined);
});

test('dream-validate: a shipped wienerdog-* new skill is NOT registered', () => {
  const { root, vault, scratch } = tempVault();
  const stateDir = path.join(root, 'state');
  writeVault(vault, '05-Skills/wienerdog-foo/SKILL.md', FM({ ...OK_SKILL, id: 'wienerdog-foo' }));
  validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-11', expectedScratch: [], stateDir });
  assert.equal(readRegistry(stateDir).skills['05-Skills/wienerdog-foo/SKILL.md'], undefined);
});

test('dream-validate: omitting stateDir writes no registry (no crash)', () => {
  const { vault, scratch } = tempVault();
  writeVault(vault, '05-Skills/newone/SKILL.md', FM(OK_SKILL));
  // No stateDir — must not throw; behavior otherwise unchanged.
  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-11', expectedScratch: [] });
  assert.ok(fs.existsSync(path.join(vault, '05-Skills/newone/SKILL.md')));
  assert.ok(res.sha);
});
```

(A *modification* of an existing tracked skill is `change.untracked === false`, so
`isNewSkillDraft`'s untracked guard already excludes it — the WP-082 revision path
governs modifications; no separate test is needed here.)

## Implementation notes & constraints

- **Zero new dependencies**; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- **Ordering / crash behavior (ADR-0012):** the registry write MUST happen after
  the commit (Step 6). Do not move it before Step 5 — a pre-commit registry write
  could reference a skill the commit never persisted (e.g. if a later revert
  removed it), creating a dangling entry that would wrongly authorize a future
  hand-authored skill at that path. Post-commit means every registry entry
  corresponds to a real committed skill. The unrecoverable-but-safe window (crash
  between commit and registry write) is accepted and recorded in ADR-0020.
- **No new commit:** the registry lives in `state/` (core mechanics), not the
  vault; writing it must not stage or commit anything (one dream = one commit).
- `parseFrontmatter` coerces unquoted `true`/`false` to booleans and leaves other
  scalars as strings, so `fm.id`/`fm.created` are strings; `String(... || '')`
  guards a missing key.
- When uncertain, choose the simpler option and record it under "Decisions made";
  do NOT expand scope (no consumer of the registry here — WP-081/082 read it).

## Security checklist

- [ ] The registry lives in the core's `state/` dir, outside the vault and outside
      the brain's `--add-dir` sandbox (vault + scratch only), so the dream brain
      cannot write it; interactive sessions only ever write the vault. Neither
      forgery pathway (a poisoned brain, an injected session turn adding
      `origin: dream`) can manufacture a registry entry.
- [ ] Registry keys are vault-relative paths produced by `changedPaths` and
      already containment-checked (`resolveContainment` rejects `..`/symlink
      escapes) before a change reaches the Tier-3 branch — no attacker-chosen
      absolute/escaping path is ever recorded.
- [ ] The write is atomic (temp + rename); a crash mid-write leaves either the old
      registry or the new one, never a torn file (`readRegistry` also tolerates a
      corrupt file by returning empty).

## Acceptance criteria

- [ ] `state/skill-registry.json` gains a `{created, id}` entry (keyed by the
      vault-relative SKILL.md path) for each NEW dream-created skill draft the
      orchestrator accepts and commits — written AFTER the commit.
- [ ] No entry is written for a below-floor (reverted) skill, a shipped
      `wienerdog-*` skill, or a modification of an existing tracked skill.
- [ ] `validateAndCommit` with no `stateDir` writes no registry and does not throw
      (existing callers/tests unaffected).
- [ ] `readRegistry` returns `{version:1, skills:{}}` on a missing or corrupt file
      and never throws; `recordSkills` is atomic, additive, and idempotent.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'skill-registry'
npm test -- --test-name-pattern 'dream-validate'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any *consumer* of the registry — the ledger validator's registered-parent check
  (**WP-081**) and the revision eligibility/authorization gate (**WP-082**).
- The `LEARNINGS.md` ledger and its validation — **WP-081**.
- Any skill-body revision logic or `revision_pattern_key` handling — **WP-082**.
- A manifest entry or uninstall change for the registry — it is a `state/` file
  swept by `disposeCoreMechanics` (ADR-0019); no manifest change is needed.
- Backfilling a registry for skills created before this ships — there are none in
  the field (ADR-0020 revision); a pre-registry skill is simply un-revisable.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/083-skill-ownership-registry`; conventional commits;
   PR titled `feat(dream): skill ownership registry (WP-083)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
