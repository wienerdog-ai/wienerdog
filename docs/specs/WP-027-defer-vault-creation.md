---
id: WP-027
title: Defer vault creation until the vault path is chosen
status: Ready
model: opus
size: M
depends_on: [WP-026]
adrs: [ADR-0010]
branch: wp/027-defer-vault-creation
---

# WP-027: Defer vault creation until the vault path is chosen

## Context (read this, nothing else)

Wienerdog installs files and never starts anything that outlives its job
(ADR-0004). The **vault** is the user's markdown memory — by default at
`~/wienerdog/`, or an existing folder the user adopts. It is the only long-term
memory store. Per ADR-0010 there are **three** ways a user gets a vault, and the
user picks one:

1. **Fresh vault** — a new empty `~/wienerdog/` scaffolded from templates.
2. **Guided import** — a fresh vault, seeded read-only from the user's old notes.
3. **Full adoption** — Wienerdog uses the user's *existing* folder in place as
   THE vault (`wienerdog adopt <path>`; WP-026), never creating a default one.

The three-way choice lives **downstream** of install: in the `/wienerdog-setup`
skill's Step 3 and in `wienerdog adopt`. But today `wienerdog init` **eagerly
scaffolds the default `~/wienerdog` vault** as part of install — before the user
has reached that choice. So a user who chooses **adopt** ends up with a stray,
empty `~/wienerdog` the installer created for nothing; `wienerdog adopt` even has
to apologize for it ("The default vault at … is now unused — you can delete it").
A user who chose adopt should never get a phantom fresh vault first.

**This WP fixes the ordering.** Plain `wienerdog init` stops creating the vault.
It creates the canonical core (`~/.wienerdog`) and writes `config.yaml` with
`vault: null`, then tells the user the next step. Vault creation for the *fresh*
and *import* paths moves to an explicit, opt-in code path — a new
`wienerdog init --fresh-vault` flag that scaffolds the default vault on demand —
which the setup skill's Step 3 invokes. The *adopt* path already creates its own
vault config and now runs against a machine with no phantom vault to clean up.

Two product invariants bound this work:
- Wienerdog is just files; nothing here starts a daemon or process (ADR-0004).
- Everything the installer writes is **idempotent** (running twice = zero
  changes) and **reversible** via the install manifest. Vault files are recorded
  under manifest kind `vault-file`, which `uninstall` deliberately **skips**
  (preserves) — a user's memory is never deleted on uninstall (M7: "leaves only
  the vault"). This WP does not change that; it reuses the existing
  `scaffoldVault` verbatim, so manifest/uninstall semantics are untouched.

## Current state

`node bin/wienerdog.js init` today (see `src/cli/init.js`):
- Ensures core dirs, writes `config.yaml` from `renderConfig()` with the line
  `vault: null            # set by vault setup (WP-004)`.
- Then, if `config.yaml` has `vault: null` (or config was just created), it
  **unconditionally scaffolds the default vault** at `paths.vault` via
  `scaffoldVault(paths.vault, { manifest })`, rewrites the `vault: null` line to
  `vault: <abs path>`, and resyncs the manifest config hash.
- Prints a plan (with a `Vault:` section) and, on success,
  `wienerdog: installed. Run \`wienerdog doctor\` to check the setup.`

Relevant helpers already in `src/cli/init.js`: `dirExists`, `fileExists`,
`sha256`, `isVaultNull(configContent)`, `readConfigVaultPath(configContent)`,
`renderConfig(harnesses)`, `confirm(prompt)`.

`src/core/vault.js` exports `scaffoldVault(targetDir, { dryRun, manifest })`
(copies `templates/vault/**`, never overwrites, git-inits with one commit,
records each created path as `kind: 'vault-file'`) and `scaffoldMappedDirs`
(used by adopt). **`scaffoldVault` is NOT changed by this WP.**

`src/cli/doctor.js` — checks core dir, manifest parse, config non-empty, secrets
0700, harness detection. It has **no vault check at all** today.

`src/cli/sync.js` — `readVaultPath(configPath)` returns the vault path or `null`;
if `null`, sync throws `WienerdogError('no vault configured in config.yaml — run
\`npx wienerdog init\` first.')` (exit 1). If the path is set but the folder is
missing, it throws `vault not found at <path> — run \`npx wienerdog init\`
first.` (exit 1). This exit-1-on-unset behavior is correct and is kept; only the
message changes (init no longer creates the vault, so pointing at bare `init` is
now wrong).

`src/cli/adopt.js` (WP-026) — after adopting, prints
`The default vault at ${paths.vault} is now unused — you can delete it if you
like.` With deferral there is usually **no** default vault, so this line becomes
misleading and must be guarded.

`skills/wienerdog-setup/SKILL.md` — Step 1 tells the user to run
`npx wienerdog init` if the `vault:` line is empty; Step 3 forks fresh / import /
adopt. Neither step creates the vault (it assumes init already did).

Tests that touch this area:
- `tests/unit/init.test.js` — asserts init writes core/config/manifest, harness
  reflection, idempotency, dry-run. It does **NOT** currently assert the default
  vault directory is created, so it does not break; but it must gain coverage of
  the new deferred behavior and the `--fresh-vault` flag.
- `tests/unit/vault.test.js` + `tests/golden/vault-default/` — drive
  `scaffoldVault` **directly**, not through init. Because `scaffoldVault` is
  unchanged, these pass untouched. **Do not modify them.**
- `tests/unit/uninstall.test.js`, `tests/integration/adopt-e2e.test.js`,
  `tests/integration/dream.test.js` — none assert the default vault exists after
  `init`; they build their own vaults or only check `config.yaml`. They keep
  passing.
- `tests/unit/setup-skill-structure.test.js` — string-presence checks on the
  setup skill; must keep passing (all asserted substrings are preserved) plus a
  new assertion for the `--fresh-vault` command.
- There is **no** `tests/unit/doctor.test.js` today; create one.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/init.js | gate vault scaffold behind `--fresh-vault`; deferred-state plan + next-step output; update the `renderConfig` comment |
| modify | src/cli/doctor.js | add a vault check: warn when unset, ok when present, fail when set-but-missing |
| modify | src/cli/sync.js | reword the two "no vault"/"vault not found" messages (behavior unchanged, still exit 1) |
| modify | src/cli/adopt.js | guard the "default vault … is now unused" line behind `dirExists(paths.vault)` |
| modify | skills/wienerdog-setup/SKILL.md | Step 0/1: treat unset/missing vault as normal first-time state; Step 3 fresh + import paths run `wienerdog init --fresh-vault`; adopt path unchanged |
| modify | tests/unit/init.test.js | add deferred-vault + `--fresh-vault` coverage |
| create | tests/unit/doctor.test.js | cover the three vault-check states |
| modify | tests/unit/setup-skill-structure.test.js | assert the skill references `wienerdog init --fresh-vault` |

**Explicitly NOT touched (and why):** `src/core/vault.js` (`scaffoldVault`
unchanged), `tests/unit/vault.test.js`, `tests/golden/vault-default/**` (golden
fixture unchanged — it tests `scaffoldVault` directly, which is byte-for-byte
identical), `src/core/manifest.js` / `src/cli/uninstall.js` (manifest semantics
unchanged), `bin/wienerdog.js` (no new subcommand; `--fresh-vault` is an init
flag), `install.sh` (still runs `npx wienerdog@latest init`, which now defers —
the intended new flow).

### Exact contracts

#### 1. `src/cli/init.js` — plain `init` defers; `--fresh-vault` creates

Parse the flag near the top of `run(argv)`:

```js
const freshVault = argv.includes('--fresh-vault');
```

Replace the current vault-need computation. The vault is scaffolded **only**
when `--fresh-vault` is passed AND no vault is configured yet:

```js
// Scaffold the default vault ONLY under --fresh-vault, and only if the config
// does not already point at a vault (fresh machine, or config still `vault: null`).
const vaultStep = freshVault && (needConfig || isVaultNull(existingConfigContent));
const vaultConfigured = !needConfig && !isVaultNull(existingConfigContent);
```

Short-circuit "nothing to do" (replaces the current `!vaultNeeded` term):

```js
if (missingDirs.length === 0 && !needConfig && !vaultStep) {
  console.log('wienerdog: already installed, nothing to do.');
  return;
}
```

Plan output — the `Vault:` section becomes (exact strings):

```js
console.log('\nVault:');
if (vaultStep) {
  console.log(`  [create] ${paths.vault}`);
} else if (vaultConfigured) {
  console.log(`  [configured] ${readConfigVaultPath(existingConfigContent)}`);
} else {
  console.log('  [deferred] choose or create your vault with /wienerdog-setup');
  console.log("             (or run 'wienerdog init --fresh-vault' for the default ~/wienerdog)");
}
```

The vault-scaffold block stays exactly as today but keyed on `vaultStep` instead
of `vaultNeeded` (scaffold → rewrite `vault: null` → resync manifest hash). The
current `else if (!dirExists(configuredVaultPath))` branch is removed (only
relevant to the old always-scaffold flow).

Final message (replaces the single `wienerdog: installed.` line):

```js
if (vaultStep) {
  console.log('\nwienerdog: installed with a fresh vault. Run `wienerdog doctor` to check the setup.');
} else if (vaultConfigured) {
  console.log('\nwienerdog: installed. Run `wienerdog doctor` to check the setup.');
} else {
  console.log('\nwienerdog: core installed — no vault yet.');
  console.log('Next: run /wienerdog-setup in Claude Code to create or choose your vault,');
  console.log("or run 'wienerdog init --fresh-vault' for the default ~/wienerdog vault.");
  console.log('Then run `wienerdog doctor` to check the setup.');
}
```

Update the `renderConfig` comment (stale WP-004 reference):

```js
vault: null            # set by /wienerdog-setup or `wienerdog adopt`
```

**Before → after, plain `init --yes` on a fresh machine:**

Before (today):
```
Vault:
  [create] /Users/me/wienerdog
...
Vault: scaffolding /Users/me/wienerdog
  created N file(s), skipped 0 existing file(s)

wienerdog: installed. Run `wienerdog doctor` to check the setup.
```
config.yaml → `vault: /Users/me/wienerdog`; `~/wienerdog/` exists (git repo).

After (this WP):
```
Vault:
  [deferred] choose or create your vault with /wienerdog-setup
             (or run 'wienerdog init --fresh-vault' for the default ~/wienerdog)
...
wienerdog: core installed — no vault yet.
Next: run /wienerdog-setup in Claude Code to create or choose your vault,
or run 'wienerdog init --fresh-vault' for the default ~/wienerdog vault.
Then run `wienerdog doctor` to check the setup.
```
config.yaml → `vault: null`; `~/wienerdog/` does **not** exist.

**`init --fresh-vault --yes`** (fresh machine, or after a plain `init`): scaffolds
`~/wienerdog`, sets `vault: <abs path>`, one git commit — identical end state to
today's eager behavior. Running it a second time hits "already installed, nothing
to do" (idempotent). If a vault is already configured (e.g. after `adopt`),
`--fresh-vault` does **not** clobber it — the plan shows `[configured] <path>`
and the vault step is skipped.

#### 2. `src/cli/doctor.js` — vault check

Add a local vault-path parser (same flat-YAML approach as sync.js — the copies
are an accepted pattern here; init/adopt/sync each carry their own):

```js
/** @param {string} configPath @returns {string|null} configured vault path, or null. */
function readVaultPath(configPath) {
  let content;
  try { content = fs.readFileSync(configPath, 'utf8'); } catch { return null; }
  const m = content.match(/^vault:[ \t]*(.*)$/m);
  if (!m) return null;
  const value = m[1].split('#')[0].trim();
  return value === '' || value === 'null' ? null : value;
}
```

Insert a vault check after the config.yaml check and before the secrets check.
Plain language for an anxious non-developer; unset is **warn (not fail)** because
a just-installed machine with no vault yet is a valid, expected state:

```js
const vaultPath = readVaultPath(paths.config);
if (vaultPath === null) {
  check('warn', 'no memory vault yet — run /wienerdog-setup to create or choose one (this is normal right after install)');
} else if (dirExists(vaultPath)) {
  check('ok', `vault ready (${vaultPath})`);
} else {
  check('fail', `vault is set to ${vaultPath} but that folder is missing — run /wienerdog-setup, or 'wienerdog init --fresh-vault' for the default`);
}
```

`warn` must not set `failed` (it does not today — only `fail` does). So after a
plain `init`, `doctor` exits 0 with a single `[warn]` vault line.

#### 3. `src/cli/sync.js` — reword the two throws (behavior unchanged)

```js
// unset vault:
throw new WienerdogError(
  'no vault set up yet — run /wienerdog-setup to create or choose your vault ' +
    "(or 'wienerdog init --fresh-vault' for the default)."
);
// configured but folder missing:
throw new WienerdogError(
  `vault not found at ${vaultPath} — run /wienerdog-setup, or 'wienerdog init --fresh-vault' for the default.`
);
```

Still thrown → still exit 1. Only the wording changes.

#### 4. `src/cli/adopt.js` — guard the stray-vault notice

Wrap the existing line so it only prints when a default vault actually exists:

```js
if (dirExists(paths.vault)) {
  console.log(`\nThe default vault at ${paths.vault} is now unused — you can delete it if you like.`);
}
```

`dirExists` is already defined in adopt.js. Change nothing else in adopt.

#### 5. `skills/wienerdog-setup/SKILL.md` — Step 0/1/3

Keep every substring the structure test asserts intact. Before editing, open
`tests/unit/setup-skill-structure.test.js` and confirm each asserted string still
appears verbatim after your edits — it checks (among others): the two top-of-file
hard rules, the Step 3 option labels "start fresh" / "import from it" / "adopt it
in place", the "wienerdog adopt" command, the "read-only" guarantee and the
"move, copy wholesale, edit, or delete" clause, the "origin: import" provenance
marker, the "exactly what was taken" summary and "import is never silent" framing,
the four identity note filenames, "01-Projects/", and "wienerdog sync". Make these
edits without removing any of them:

**Step 0** — add, right after "First, find the vault path (see Step 1)…": a
sentence that if there is no vault yet (the `vault:` line is empty/`null` or the
folder does not exist), this is always a first-time setup — skip the profile.md
peek and go to Step 1, then Step 3, where the vault gets created or chosen.

**Step 1** — replace the current "If it does not (or the `vault:` line is empty),
stop and tell them to run `npx wienerdog init` first" instruction with:
- If `config.yaml` itself is missing → stop; tell them to run `npx wienerdog
  init` first, then restart the skill.
- If the `vault:` line is empty/`null`, or the folder does not exist yet → this
  is normal right after install; they have not chosen a vault yet. Treat as a
  first-time setup and continue to Step 3, where you create or choose the vault
  **before** writing any notes.
- If it points at an existing folder with real identity content → settings-panel
  case (Step 0 menu).

**Step 3** — the vault choice now owns vault creation for the fresh and import
paths (code does the scaffolding; the skill only shells out):
- **Start fresh** option text: keep "Start fresh" and the default-if-unsure
  framing, and add that to create it you run `wienerdog init --fresh-vault` in
  the terminal — this scaffolds the default vault at `~/wienerdog`, records it in
  `config.yaml`, and puts it under git.
- **Import** block: as its first step, run `wienerdog init --fresh-vault` to
  create the fresh vault the import will write into; then read the old vault
  read-only and mine into it (rest of the import instructions unchanged).
- **Adopt** option: unchanged — tell them to run
  `wienerdog adopt <path-to-their-vault>`; the skill never creates a default
  vault on this path.
- Add a one-line note that shelling out to `wienerdog init --fresh-vault` (like
  `wienerdog sync` in Step 6) is consistent with the "only write inside the vault
  and `config.yaml`" rule, since that command writes only to the vault and
  `config.yaml`.

Keep Steps 4–6 as they are (Step 6 still runs `wienerdog sync`; the vault now
exists by the time it runs).

#### 6. Tests

`tests/unit/init.test.js` — add:
- `init --yes` on a fresh temp HOME leaves `config.yaml` with `vault: null`, does
  **not** create the `WIENERDOG_VAULT` directory, and stdout matches
  `/no vault yet/i` and `/wienerdog-setup/`.
- `init --fresh-vault --yes` creates the vault dir, sets `vault: <path>` in
  config, and the vault is a git repo with exactly one commit
  (`git -C <vault> rev-list --count HEAD` === `1`).
- A second `init --fresh-vault --yes` prints `/already installed/i` and makes
  zero changes (reuse the existing `snapshot` helper).

`tests/unit/doctor.test.js` (new) — using the same temp-HOME/`execFileSync`
pattern as init.test.js:
- After `init --yes`: `doctor` exits 0, stdout contains `[warn]` and
  `/wienerdog-setup/`, and stdout does **not** contain `[fail]`.
- After `init --fresh-vault --yes`: stdout contains `[ok]` and `vault ready`,
  exit 0.
- With `config.yaml` hand-edited to `vault: /definitely/missing/dir` (keep the
  manifest/core intact from a prior `init`): `doctor` exits 1 and stdout contains
  `[fail]` on the vault line.

`tests/unit/setup-skill-structure.test.js` — add one test asserting
`text.includes('wienerdog init --fresh-vault')`.

## Implementation notes & constraints

- No new npm dependencies; plain Node ≥ 18; JSDoc types only; no TypeScript.
- Reuse `scaffoldVault` **unchanged**. Do not add a new `src/core` function and
  do not add a new top-level CLI subcommand — `--fresh-vault` is an `init` flag,
  so `bin/wienerdog.js` dispatch is untouched.
- The `--fresh-vault` flag must be idempotent and reversible exactly like the old
  eager path: it records `vault-file` manifest entries (via `scaffoldVault`) and
  resyncs the config hash the same way the current code does. Do **not** attempt
  to make `uninstall` delete the fresh vault — `vault-file`/`vault-dir` are
  intentionally preserved on uninstall (M7). State this under "Decisions made".
- Keep the small `init.js` helpers (`readConfigVaultPath`, `isVaultNull`,
  `sha256`) — they are still used by the new plan/output branches and the
  scaffold block; do not delete them (avoid orphan-cleanup lint failures).
- Markdown edits to the skill must pass markdownlint and preserve every substring
  the structure test asserts (listed above). Verify by running the structure
  test after editing.
- When uncertain, choose the simpler option and record it under "Decisions made"
  in the PR body. Do not expand scope.

## Acceptance criteria

- [ ] `init --yes` (no flag) creates the core + `config.yaml` (`vault: null`) and
      does **not** create the default vault directory; stdout shows the deferred
      next-step pointing at `/wienerdog-setup` and `wienerdog init --fresh-vault`.
- [ ] `init --fresh-vault --yes` scaffolds the default vault, sets `vault: <abs
      path>` in config, and the vault is a git repo with exactly one commit.
- [ ] `init --fresh-vault --yes` run twice is idempotent (second run: "already
      installed, nothing to do"; zero file changes).
- [ ] `doctor` after a plain `init` exits 0 and shows a `[warn]` vault line (not
      `[fail]`); after `--fresh-vault` shows `[ok] vault ready`; with a set-but-
      missing vault shows `[fail]` and exits 1.
- [ ] `sync` with `vault: null` still exits 1, now with a message pointing at
      `/wienerdog-setup` / `wienerdog init --fresh-vault` (no bare `init`).
- [ ] `adopt` on a machine with no default vault does **not** print the
      "default vault … is now unused" line.
- [ ] Setup skill Step 3 fresh + import paths instruct running
      `wienerdog init --fresh-vault`; adopt path still routes to `wienerdog adopt`.
- [ ] `npm test` and `npm run lint` pass; `tests/unit/vault.test.js` and the
      `tests/golden/vault-default/` fixture are unchanged and green.

## Verification steps (run these; paste output in the PR)

```bash
# Unit + lint (golden fixture must stay green, untouched).
npm test
npm run lint

# 1. Plain init defers the vault — no phantom ~/wienerdog.
WD=$(mktemp -d)
export WIENERDOG_HOME=$WD/core WIENERDOG_VAULT=$WD/vault \
       CLAUDE_CONFIG_DIR=$WD/absent-claude CODEX_HOME=$WD/absent-codex
node bin/wienerdog.js init --yes
grep -q '^vault: null' "$WIENERDOG_HOME/config.yaml" && echo "OK: vault deferred"
test ! -e "$WIENERDOG_VAULT" && echo "OK: no phantom vault"
node bin/wienerdog.js doctor; echo "doctor exit: $?"      # expect 0, a [warn] vault line

# 2. --fresh-vault creates it; idempotent.
node bin/wienerdog.js init --fresh-vault --yes
grep -q "^vault: $WIENERDOG_VAULT\$" "$WIENERDOG_HOME/config.yaml" && echo "OK: vault set"
git -C "$WIENERDOG_VAULT" rev-list --count HEAD          # expect 1
node bin/wienerdog.js init --fresh-vault --yes           # expect: already installed, nothing to do
node bin/wienerdog.js doctor | grep -q 'vault ready' && echo "OK: doctor ok"

# 3. adopt after a plain init leaves no phantom-vault notice.
WD2=$(mktemp -d)
export WIENERDOG_HOME=$WD2/core WIENERDOG_VAULT=$WD2/vault \
       CLAUDE_CONFIG_DIR=$WD2/absent-claude CODEX_HOME=$WD2/absent-codex
node bin/wienerdog.js init --yes
mkdir -p "$WD2/adoptme" && (cd "$WD2/adoptme" && git init -q)
node bin/wienerdog.js adopt "$WD2/adoptme" --yes | grep -c 'now unused' # expect 0
```

## Out of scope (do NOT do these)

- Any change to `scaffoldVault` / `scaffoldMappedDirs` (`src/core/vault.js`) or
  the `tests/golden/vault-default/` fixture (WP-004 territory; unchanged here).
- Any change to `wienerdog adopt`'s prerequisite/layout logic (WP-026) beyond
  guarding the one "unused default vault" print line.
- Guided-import mining logic itself (WP-025) — this WP only ensures the fresh
  vault exists before import writes into it, by having Step 3 run
  `wienerdog init --fresh-vault`.
- Adding a new top-level CLI subcommand, or changing `bin/wienerdog.js` /
  `install.sh`.
- Changing `uninstall`/manifest reverse semantics (vault preservation on
  uninstall is intentional and stays).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/027-defer-vault-creation`; conventional commits; PR titled
   `feat(install): defer vault creation until path is chosen (WP-027)`.
3. PR template filled, including "Decisions made" (note the reused-`scaffoldVault`
   and preserved-on-uninstall choices) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
