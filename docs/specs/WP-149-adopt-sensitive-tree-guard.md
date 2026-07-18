---
id: WP-149
title: Guard adopt against the home directory, secret dirs, and unexpectedly large trees before git init/add
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0010]
branch: wp/149-adopt-sensitive-tree-guard
---

# WP-149: Adopt guard for home/secret/huge trees (audit A13)

## Context (read this, nothing else)

`wienerdog adopt <path>` turns an EXISTING folder into the Wienerdog memory
**vault**. To make every night's auto-written memory a single revertible commit,
adopt runs `git init` (if needed) and `git add -A` + an initial snapshot over the
folder. **IRON RULE (ADR-0004): Wienerdog is just files** — but `git add -A` over
the WRONG folder is destructive-ish: it can slurp private keys, cloud
credentials, or a multi-gigabyte tree into a git repo the user did not intend.

Audit finding **A13** (adopt guard): adopt currently git-inits and stages
whatever directory it is pointed at, with no check that the target is a sane
vault. It must **refuse or require a high-friction confirmation** when the target
is the user's **home directory**, contains **secret material** (`.ssh`, `.aws`,
GnuPG, private keys, `.env`), or is an **unexpectedly large tree**, BEFORE any
`git init` / `git add -A` runs.

## Current state

`src/cli/adopt.js`, `run(argv)` — the relevant ordering:
1. parse args; require an existing install (`config.yaml`).
2. `absPath = path.resolve(rawPath)`; must be an existing dir; `adoptedPath = fs.realpathSync(absPath)`.
3. refuse a vault inside the canonical core (`~/.wienerdog`).
4. refuse re-adoption (existing `vault_layout:`).
5. TCC / local-disk check (`tccguard.guard([adoptedPath], fs.realpathSync(paths.home))`).
6. **git prerequisite + snapshot** — `git init` (with consent), starter
   `.gitignore`, stale-lock recovery, then `git add -A` and the initial commit.
   This is the destructive step the guard must precede.
7. and onward: infer layout, write config, scaffold, schedule.

`--yes` currently bypasses each interactive `confirm(...)`. `adopt` already
computes `fs.realpathSync(paths.home)`.

`src/core/adopt-git.js` holds adopt's git helpers (`runGitStep`,
`planGitignore`, `inspectIndexLock`, …) — pure-ish, fs-based, unit-tested in
`tests/unit/adopt-git.test.js`. This is the natural home for a bounded
tree-inspection helper.

`confirm(prompt)` in adopt.js accepts `y`/`yes`. `WienerdogError` is thrown for
refusals.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/adopt-git.js | Add pure `inspectAdoptTree(dir, home, opts)` returning the guard findings; export it + the threshold constants. |
| modify | src/cli/adopt.js | Call the guard AFTER step 3a's core check and BEFORE step 6's git init/add; refuse home, and gate secret/huge trees behind a high-friction typed confirmation that `--yes`/headless does NOT bypass. |
| modify | tests/unit/adopt-git.test.js | Cover `inspectAdoptTree`: home match, secret hit, huge-tree, and a clean tree. |

### Exact contracts

**`inspectAdoptTree(dir, home, opts)` → findings** (in `adopt-git.js`; bounded,
never throws, injectable for tests):
```js
/**
 * @param {string} dir   realpath'd adopted dir
 * @param {string} home  realpath'd home dir
 * @param {{maxEntries?:number, maxBytes?:number, walk?:Function}} [opts]
 * @returns {{isHome:boolean, sensitive:string[], entryCount:number,
 *            bytes:number, tooLarge:boolean, truncated:boolean}}
 */
```
- `isHome`: `dir === home` (both already realpath'd by the caller).
- `sensitive`: relative paths (deduped, capped at ~20 reported) of matched secret
  markers found within a BOUNDED walk of `dir`:
  - directory basenames: `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`
  - file basenames: `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `.env`,
    `.netrc`, `.git-credentials`, `.npmrc`, `credentials` (matches
    `~/.aws/credentials`), or a `*.pem` / `*.key` file.
  Matching is by basename only (case-sensitive on the literal names above; `.pem`/
  `.key` by extension). The walk SKIPS descending into a `.git` directory (a
  re-adopt of an existing repo must not scan its object store).
- `entryCount` / `bytes`: totals accumulated during the walk (files + dirs).
- The walk is hard-bounded: stop after `maxEntries` (default `50_000`) entries OR
  when `bytes` exceeds `maxBytes` (default `1_000_000_000` = ~1 GB); set
  `truncated:true` if the cap was hit. `tooLarge = truncated || entryCount > BIG_ENTRY_COUNT (default 20_000) || bytes > BIG_BYTES (default 500_000_000)`.
- Any fs error on an entry is skipped (best-effort); the function never throws.
- Export `inspectAdoptTree`, `BIG_ENTRY_COUNT`, `BIG_BYTES` (and the walk caps).

**Gating in `adopt.js`** — insert immediately AFTER step 3a (core containment)
and BEFORE step 5/6. Using `adoptedPath` and `fs.realpathSync(paths.home)`:
```js
const guard = adoptGit.inspectAdoptTree(adoptedPath, fs.realpathSync(paths.home));

// 1) Home directory → hard refuse (never adopt $HOME as a vault).
if (guard.isHome) {
  throw new WienerdogError(
    "refusing to adopt your home directory as a vault — 'git add -A' here would try to " +
    'snapshot everything under ~. Point adopt at a dedicated notes folder (e.g. ~/wienerdog).'
  );
}

// 2) Secret material or an unexpectedly large tree → HIGH-FRICTION confirmation.
//    --yes / headless must NOT auto-accept this: fail closed there.
if (guard.sensitive.length > 0 || guard.tooLarge) {
  const reasons = [];
  if (guard.sensitive.length > 0) reasons.push(`sensitive files (${guard.sensitive.slice(0, 8).join(', ')}${guard.sensitive.length > 8 ? ', …' : ''})`);
  if (guard.tooLarge) reasons.push(`a very large tree (${guard.entryCount}${guard.truncated ? '+' : ''} entries, ~${Math.round(guard.bytes / 1e6)} MB)`);
  console.log(`\nThis folder contains ${reasons.join(' and ')}.`);
  console.log("Committing it to git would snapshot that content. If this is not what you want, stop now.");
  if (dryRun) {
    console.log('(--dry-run: would require you to retype the folder name to proceed.)');
  } else if (yes) {
    // Headless adoption of a hazardous tree is refused — the confirmation is
    // deliberately un-bypassable (audit A13 "high-friction").
    throw new WienerdogError(
      'refusing to adopt a folder with sensitive files or a very large tree under --yes; ' +
      're-run interactively to confirm, or point adopt at a clean notes folder.'
    );
  } else {
    const typed = await confirmTyped(`To proceed, retype the folder path exactly (${adoptedPath}): `);
    if (typed.trim() !== adoptedPath) throw new WienerdogError('confirmation did not match; adoption aborted.');
  }
}
```
Add a small `confirmTyped(prompt)` helper in adopt.js (mirror the existing
`confirm`, but resolve the RAW typed line instead of a yes/no test). The
comparison is exact-string against `adoptedPath`.

- Placement is load-bearing: the guard must run before the TCC check's git work
  and definitely before `git init` / `git add -A`. Putting it right after 3a is
  simplest and safe.
- The `.gitignore` starter offered later (step 6b) can reduce what gets staged,
  but it is NOT a substitute for this guard — a user may decline it, and it does
  not cover `.ssh`/`.aws` by default. The guard is the gate.

**Owner walkthrough (2026-07-18): Ready.** Two owner decisions:
1. **Headless fail-closed, no escape hatch.** `--yes`/headless does NOT bypass the
   secret/large-tree confirmation — it refuses. A hazardous tree can only be
   adopted interactively by retyping the exact folder path. There is deliberately
   no `--adopt-anyway` flag (safety over scriptability for this rare, deliberate
   action).
2. **Secret-marker set extended.** Added the token-bearing file basenames
   `.netrc`, `.git-credentials`, `.npmrc` to the detection list (they gate the
   high-friction confirm, not a hard refuse — a clean notes folder is unaffected).
Home is a hard refuse either way. Independent WP (touches only adopt.js /
adopt-git.js) — no A8/A13 dependency.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Bound the walk hard — never read file CONTENTS, only names/sizes via
  `readdirSync(withFileTypes)` + `statSync`/`dirent`. A symlinked entry is counted
  by `lstat` semantics and NOT followed (never traverse a symlink out of the
  tree). Skipping `.git` keeps a re-adopt fast and avoids object-store noise.
- Keep the guard's messages plain-language (knowledge-worker audience, CLAUDE.md).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Adopting `$HOME` is refused outright (no git init/add).
- [ ] A tree containing `.ssh` / `.aws` / private keys / `.env` cannot be adopted
      headlessly (`--yes`); interactively it requires retyping the exact path.
- [ ] An unexpectedly large tree triggers the same high-friction gate.
- [ ] The tree walk is hard-bounded (entry + byte caps, never follows symlinks,
      skips `.git`) so the guard itself cannot hang or OOM on a huge target.
- [ ] The guard runs BEFORE any `git init` / `git add -A`.

## Acceptance criteria

- [ ] `inspectAdoptTree(home, home)` → `isHome:true`; adopt refuses with the
      home-directory message and never calls git.
- [ ] A fixture dir containing `.ssh/id_rsa` yields `sensitive` including that
      path; adopt under `--yes` throws the refusal; interactively it demands the
      retyped path.
- [ ] A fixture dir exceeding `BIG_ENTRY_COUNT` (with a lowered cap via opts in
      the test) yields `tooLarge:true`.
- [ ] A clean small notes folder yields `isHome:false`, `sensitive:[]`,
      `tooLarge:false`, and adopt proceeds exactly as today.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "adopt"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Rewriting the `.gitignore` starter logic (`planGitignore`) — unchanged.
- Scanning file CONTENTS for secrets (that is the `secret-scan` pipeline's job on
  transcripts, not adopt's tree gate).
- Any change to the TCC guard or the layout inference.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/149-adopt-sensitive-tree-guard`; conventional commits;
   PR titled `feat(adopt): refuse home/secret/huge trees before git init+add (WP-149)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
