---
id: WP-117
title: "`wienerdog memory approve` — TTY-only exact-byte identity ratification (audit A3)"
status: Done
model: opus
size: M
depends_on: [WP-116]
adrs: [ADR-0004, ADR-0007, ADR-0021]
branch: wp/117-memory-approve-cli
---

# WP-117: `wienerdog memory approve` — TTY-only exact-byte identity ratification (audit A3)

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): a memory **vault**, skills, hooks, scheduled
jobs. No daemons, no telemetry.

The injected **digest** bootstraps every AI session from the four injected
**identity** files (`{identity_dir}/{profile,preferences,goals,instructions}.md`,
default `06-Identity/`). Per the 2026-07-15 audit (action **A3**) and **ADR-0021**,
WP-116 shipped a code-owned **identity trust registry**
(`state/identity-approvals.json`, 0600): the digest injects an identity file **only
when** its current exact bytes match a human-approved `sha256` recorded there.
WP-116's `sync` seeds the registry **first-time only** — so once an identity file is
seeded, any later change fails closed (digest omits it + shows a banner) until a
human **ratifies the new bytes**. This WP ships that ratification path.

`wienerdog memory approve <file>` is the **only** way to change an already-seeded
identity file's approved hash. It is the identity analog of `wienerdog grant`
(ADR-0007): the security boundary is a typed-word confirmation read from a **real
controlling terminal**, with **no** headless / `--yes` / environment bypass — so no
skill, hook, dream, or scheduled job can ratify identity bytes. It shows the exact
bytes it is about to approve and any provenance frontmatter (as *evidence*, never as
authorization — ADR-0021), then records `{approved_blob_hash, approved_at, source:
'approved'}` for that file. The next `sync`/dream digest render then injects the
newly-approved bytes.

This WP covers the **human-edit path**: a user edits their identity file (or applies
a dream proposal into it) and runs `memory approve` to make it take effect. The
dream **emitting** non-injected proposal notes is a separate future dream-skill WP;
`memory approve` ratifies whatever exact bytes are currently on disk regardless of
who wrote them (and the dream cannot write these files — WP-112 freeze).

## Current state

**`src/core/identity-approvals.js`** (WP-116) exports `readRegistry(stateDir)`,
`writeRegistry(stateDir, registry)`, `fileHash(vaultDir, rel)`, `foldKey(rel)`,
`hashBytes(buf)`, `injectedIdentityRels(layout)`,
`INJECTED_IDENTITY_FILES = ['profile.md','preferences.md','goals.md','instructions.md']`,
`approvalsMap`, `approvalsFromVault`, `seedApprovals`, `identityStatus`. The registry
shape is `{version:1, approvals:{ <foldedRel>: {approved_blob_hash, approved_at,
source} }}`. It has **no** single-file "record one approval" helper yet.

**`src/cli/grant.js`** is the exact precedent for a TTY-only confirmation CLI:
`defaultPrompt(question, {openTty?})` reads from `process.stdin` when it is a TTY,
else from `/dev/tty`; on no reachable terminal it prints a refusal and resolves `''`
(which can never equal the confirmation word). `--yes` is ignored. `run(argv,
{promptFn?, paths?})` injects the prompt + paths for tests.

**`bin/wienerdog.js`** dispatches subcommands via a `commands` map (each module
exports `run(rest)`) and prints a `USAGE` block. `src/core/paths.js` `getPaths()`
gives `{state, vault, config, …}`. The vault path is read from `config.yaml` via the
shared `src/core/dream/config.js` `readScalar(body, 'vault')` (the WP-115 one-coercer
convention — `''`/`null`/absent ⇒ not configured), and the layout via
`readVaultLayout(paths.config)` (`src/core/layout.js`). (`sync.js` has its own private
`readVaultPath`, NOT exported and NOT in this WP's scope — do not use it.)

**`src/core/frontmatter.js`** (WP-114) exports `parse(text) →
{delimited, malformed, fields:Map, body}` for reading a note's provenance fields.

`docs/GLOSSARY.md` lists canonical terms; it has **no** entry for the identity trust
registry or `memory approve` yet.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/cli/memory.js | `wienerdog memory approve <file>` — TTY-only ratification |
| modify | src/core/identity-approvals.js | add `recordApproval(stateDir, vaultDir, rel, source)` |
| modify | bin/wienerdog.js | register the `memory` command + one USAGE line |
| modify | docs/GLOSSARY.md | add **identity trust registry** and **memory approve** canonical entries |
| create | tests/unit/memory-cli.test.js | unit-test approve (record on "approve", cancel otherwise, no-tty refusal, idempotent, unknown file) |
| create | tests/unit/identity-approvals-record.test.js | unit-test `recordApproval` (writes 0600, overwrites an existing record, source label) |

### Exact contracts

**1. `src/core/identity-approvals.js` — add `recordApproval`.** Records/overwrites
the approval for ONE injected identity file from its current on-disk bytes:

```js
/**
 * Record (or overwrite) the approval for one injected identity file, hashing its
 * CURRENT exact bytes. Unlike seedApprovals, this DOES overwrite an existing record
 * — it is the human ratification path (WP-117). Persists at 0600.
 * @param {string} stateDir @param {string} vaultDir
 * @param {string} rel  vault-relative POSIX path of the identity file
 * @param {'setup'|'approved'} source
 * @returns {{foldedRel:string, hash:string}}
 * @throws {WienerdogError} when the file is unreadable/absent.
 */
function recordApproval(stateDir, vaultDir, rel, source) {
  const hash = fileHash(vaultDir, rel);
  if (!hash) throw new WienerdogError(`cannot read identity file to approve: ${rel}`);
  const registry = readRegistry(stateDir);
  const foldedRel = foldKey(rel);
  registry.approvals[foldedRel] = { approved_blob_hash: hash, approved_at: new Date().toISOString(), source };
  writeRegistry(stateDir, registry);
  return { foldedRel, hash };
}
```

Add `const { WienerdogError } = require('./errors');` if not already imported, and
export `recordApproval`.

**2. `src/cli/memory.js` — `wienerdog memory approve <file>`.**

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { readVaultLayout } = require('../core/layout');
const idApprovals = require('../core/identity-approvals');
const { parse } = require('../core/frontmatter');
const { defaultPrompt } = require('./grant');           // reuse the TTY-only prompt

const KNOWN = { profile: 'profile.md', preferences: 'preferences.md', goals: 'goals.md', instructions: 'instructions.md' };
```

`run(argv, opts = {})`:

- `opts` seams: `{ promptFn?: (q:string)=>Promise<string>, paths? }` (tests inject a
  fake prompt + paths, exactly like `grant.js`). `promptFn` defaults to
  `defaultPrompt` (TTY-only, no `--yes`).
- `argv[0]` must be `approve` (only subcommand); else
  `throw new WienerdogError("unknown memory command '<x>' — only 'approve' is supported")`.
- `argv[1]` is the file: accept a short name (`profile`) or a basename
  (`profile.md`); map through `KNOWN`; reject anything not one of the four with
  `throw new WienerdogError('approve which identity note? one of: profile, preferences, goals, instructions')`.
- Resolve the vault + layout. Read the vault path via the **shared** config reader
  `config.js` `readScalar(fs.readFileSync(paths.config,'utf8'), 'vault')` (the WP-115
  one-coercer convention) — `''` / `null` / absent ⇒ not configured ⇒
  `throw new WienerdogError('no vault configured — run /wienerdog-setup first')`. Read
  the layout via `readVaultLayout(paths.config)`. Build
  `rel = \`${layout.identity_dir}/${basename}\``.

  > **Resolution of a spec contradiction (2026-07-17, canonical).** The original
  > wording said "reuse the same read `sync.js` uses", but `sync.js`'s `readVaultPath`
  > is NOT exported and `sync.js` is NOT in this WP's Deliverables — self-contradictory.
  > The canonical instruction is the shared `readScalar` read above. It is safe (and
  > arguably more correct than sync's `.split('#')`): any divergence between the two
  > readers on an exotic config (`vault: /home/u/my#vault`, a quoted value) fails
  > **closed** — a different resolved vault ⇒ different identity bytes ⇒ hash mismatch
  > ⇒ nothing unapproved is injected. Making both readers identical is a tracked
  > follow-up (see Out of scope), explicitly outside this WP's boundary.
- Read the file's current bytes; if absent →
  `throw new WienerdogError(\`identity file not found: ${rel}\`)`.
- **Idempotent:** if the current hash already equals the registry's approved hash for
  this folded rel, print `wienerdog: "<basename>" is already approved (no change).`
  and return (no prompt).
- **Display exactly what will be approved** (to stdout): a header, the FULL exact
  file text, and a provenance summary parsed with `frontmatter.parse` — show
  `derived_from_untrusted`, `source_sessions`, `confidence`, `recurrence` if present,
  each labeled **"evidence only — not proof"** (ADR-0021: provenance is evidence, not
  authorization). If the file is currently seeded/approved with a different hash,
  note that this REPLACES the previously approved version.
- **Confirm at a real terminal:**
  `const answer = await promptFn('Type the word "approve" to confirm these exact bytes (anything else cancels): ');`
  If `String(answer).trim() !== 'approve'` → print `Cancelled.` and return (record
  nothing).
- On confirm: `idApprovals.recordApproval(paths.state, vaultDir, rel, 'approved')`,
  then print `wienerdog: approved "<basename>" — it will be injected into your session
  digest on the next \`wienerdog sync\`.`

`module.exports = { run }`.

**No `--yes` bypass, no environment override** — `promptFn` is a code-level test
seam only (same rule as `grant.js`'s `openTty`); a headless caller gets the
`defaultPrompt` refusal (`''` ≠ `approve`) and records nothing.

**3. `bin/wienerdog.js`.** Add `memory: () => require('../src/cli/memory'),` to the
`commands` map and a USAGE line under the command list, two-space indented and
column-aligned with the other entries, reading:
`memory      Approve identity-note changes so they inject into your session (typed confirmation)`.

**4. `docs/GLOSSARY.md`.** Add two canonical entries near the other mechanics terms:

- **identity trust registry** — the code-owned, 0600 record
  (`~/.wienerdog/state/identity-approvals.json`) of the exact-byte `sha256` a human
  ratified for each injected identity file. The digest injects an identity file only
  when its current bytes match its record; a mismatch fails closed (ADR-0021). Path
  identity is case-folded; content identity is byte-exact.
- **memory approve** — the interactive, terminal-only command
  (`wienerdog memory approve <file>`) that ratifies the current exact bytes of an
  injected identity note into the identity trust registry. The only way to change an
  approved identity note; no model-driven or headless process can run it (ADR-0021).

**5. Tests.** `tests/unit/memory-cli.test.js` (model on the `grant.js` test shape —
inject `promptFn` + `paths` pointing at a temp core+vault; seed the vault with the
four identity files):

- **records on "approve":** edit `profile.md`, run with `promptFn → 'approve'`;
  assert the registry's `profile` hash now equals the edited file's exact-byte hash
  and `source: 'approved'`.
- **cancels otherwise:** `promptFn → 'no'` (and `→ ''`); assert the registry is
  unchanged and `Cancelled.` printed.
- **no `--yes` bypass:** pass `--yes` in argv with `promptFn → 'no'`; assert nothing
  recorded (argv flag is ignored).
- **idempotent:** approve, then approve again with the file unchanged and NO prompt
  injected; assert it prints "already approved" and does not call the prompt.
- **unknown file / unknown subcommand:** assert `WienerdogError`.
- (Optional, if a `/dev/tty`-free assertion is feasible) the real `defaultPrompt`
  path refuses without a terminal — covered by `grant.js`'s existing tests; a
  reference is enough.

`tests/unit/identity-approvals-record.test.js`: `recordApproval` writes a 0600 file,
overwrites an existing `setup` record with an `approved` one, and throws on an absent
file.

## Implementation notes & constraints

- **TTY-only is the security boundary** (ADR-0007 precedent). Reuse `grant.js`'s
  `defaultPrompt` verbatim (export it — it is already exported). Do NOT add any
  `--yes`/env path; `promptFn` is a test seam only.
- **Provenance is evidence, not proof** (ADR-0021). Show the numbers but label them;
  approval is byte-exact human ratification, never a provenance check. Fake
  `false/0.9/3` frontmatter changes nothing about whether the bytes get approved —
  the human decides by reading the actual bytes.
- **Ratify current on-disk bytes.** `memory approve` does not fetch a "proposal
  file"; it approves the exact bytes currently in the identity file (the human put
  them there, or applied a dream proposal into it). The dream cannot write these
  files (WP-112 freeze), so this cannot ratify dream-authored bytes silently.
- **Approval writes only the registry**, never the identity file — the bytes are
  already on disk. So a crash after display/before record leaves the old approval
  intact (fail closed: the changed file stays gated out). `writeRegistry` is atomic
  (temp+rename+chmod 0600).
- **All chatter to stdout is fine** (this is an interactive human command, not a
  `--json` path); the confirmation prompt uses `promptFn`.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Identity ratification requires a typed word read from a REAL controlling
      terminal; `--yes`, a pipe, an env var, or any headless caller cannot ratify
      (the `promptFn` default refuses with `''`, which never equals `approve`) —
      asserted. `recordApproval` hashes the EXACT current bytes (Buffer, no
      normalization) and writes the 0600 registry atomically; the folded path key is
      compared/stored, never used to build a write path. The `<file>` argument is
      mapped through a fixed four-entry allowlist (`KNOWN`), so no arbitrary path,
      `..`, or `/` reaches the filesystem — an unknown value is rejected before any
      read.

## Acceptance criteria

- [ ] `memory approve profile` with the injected prompt answering `approve` records
      the file's exact-byte hash with `source: 'approved'`; a subsequent `sync`/dream
      digest render then injects the file (via WP-116's gate).
- [ ] Any answer other than `approve` (incl. empty / `--yes` present) records nothing
      and prints `Cancelled.` / the already-approved line.
- [ ] Re-approving an unchanged file is idempotent and prompts nothing.
- [ ] An unknown `<file>` or a subcommand other than `approve` throws `WienerdogError`
      (no filesystem read for a non-allowlisted name).
- [ ] `recordApproval` writes a mode-0600 registry file and overwrites a prior record.
- [ ] `npm test` and `npm run lint` pass; `node bin/wienerdog.js help` lists `memory`.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "memory-cli"
npm test -- --test-name-pattern "identity-approvals-record"
node bin/wienerdog.js help          # lists `memory`
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The digest hash-gate, the registry module, and `sync` seeding — shipped by
  **WP-116** (this WP only adds the ratification verb + `recordApproval`).
- Making the dream emit non-injected identity **proposals** (a later dream-skill WP).
- A `memory` verb other than `approve` (e.g. `revoke`, `list`) — not in this WP.
- Any `--yes`/env path to approve — forbidden by ADR-0007/ADR-0021.
- **Follow-up (tracked, NOT this WP — reviewer recommendation 2026-07-17):** migrate
  `sync.js`'s private `readVaultPath` (which uses a `.split('#')` read) onto the shared
  `config.js` `readScalar`, so the ratifier (`memory approve`), the digest gate
  (`sync`), and `readDreamConfig` resolve the vault identically for exotic configs (a
  `#` in the path, quoted values). Divergence is fail-closed today (mismatched vault ⇒
  hash mismatch ⇒ nothing injected), so this is a consistency cleanup, not a security
  fix. A small future WP; see the ROADMAP follow-up note.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/117-memory-approve-cli`; conventional commits; PR titled
   `feat(memory): wienerdog memory approve — TTY-only identity ratification (WP-117)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
