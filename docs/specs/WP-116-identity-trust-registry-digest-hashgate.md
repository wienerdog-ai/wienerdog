---
id: WP-116
title: Exact-byte identity trust registry + fail-closed digest hash-gate (audit A3)
status: Draft
model: opus
size: M
depends_on: [WP-112, WP-114]
adrs: [ADR-0004, ADR-0021]
branch: wp/116-identity-trust-registry-digest-hashgate
---

# WP-116: Exact-byte identity trust registry + fail-closed digest hash-gate (audit A3)

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): a memory **vault**, skills, hooks, scheduled
jobs. No daemons, no telemetry.

Every new AI session is bootstrapped with an injected **digest**
(`~/.wienerdog/state/digest.md`, rendered by `src/core/digest.js`
`renderDigest`), built from the four injected **identity** files —
`{identity_dir}/{profile,preferences,goals,instructions}.md` (default dir
`06-Identity/`). Their bytes become standing, instruction-adjacent context.

The 2026-07-15 security audit (action **A3** / risk R4) required that
brain-authored identity bytes cannot authorize content into future sessions.
WP-112 already **froze** the nightly **dream** from writing those four files
(`validateAndCommit` reverts any dream add/modify/delete; the
`identity-auto-activation` capability gate is BLOCKED). This WP adds the missing
**read-side** enforcement per **ADR-0021** (Human-ratified identity memory with an
exact-byte trust registry):

- A code-owned **identity trust registry** — a 0600 JSON file
  `state/identity-approvals.json` in the core (outside the brain's vault write
  surface) — records, per injected identity file, the `sha256` of the **exact
  bytes** a human ratified.
- `renderDigest` injects an injected-identity file **only when** its current
  exact-byte hash matches the registry. No record or any mismatch → the file is
  **omitted** and a fixed banner is shown in the digest (fail-loud). A one-byte
  later change stops injection.
- **First-time seed at attended `sync`:** for an injected identity file with no
  record yet, `sync` records its current bytes (`source: 'setup'`) — bootstrapping
  M2 (the human setup interview authored those bytes; the dream can never have).
  `sync` **never re-seeds** a file that already has a record: a later change fails
  closed until a human ratifies it with `wienerdog memory approve` (**WP-117**, the
  next WP).
- **The dream never seeds** — its nightly render only reads the registry and
  enforces, so a nightly corruption fails closed against the last attended baseline.
- **Case-fold hardening (WP-112 reviewer finding):** on a case-insensitive
  filesystem, `06-Identity/Profile.md` and `06-Identity/profile.md` are the same
  inode. The registry keys on the **case-folded** path so both share one approval
  slot; and `isInjectedIdentity` (the WP-112 freeze predicate) is made
  case-insensitive so a dream add of `Profile.md` also hits the freeze branch.

**Hashing is byte-exact with NO normalization** — no case-folding of *content*, no
newline munging, no trimming, no Unicode normalization before hashing (recorded
lesson: normalizing before hashing collides distinct byte sequences and destroys
tamper detection). **Path identity is case-folded; content identity is byte-exact.**

This WP does NOT add the approval CLI (that is WP-117) and does NOT make the dream
emit proposals. It works today for the human-edit path: after this WP, editing an
identity file makes the digest fail closed + warn until WP-117's `memory approve`
lands to ratify the new bytes.

## Current state

**`src/core/digest.js`** — `renderDigest(vaultDir, layout = defaultLayout(), opts
= {})`. Its identity loop (post WP-114) already uses the structured `readNote`
(`{note, exclusion}`) and collects anomalous exclusions into `identityExclusions`
(`{file, reason}`) for a single `> [!warning] Wienerdog: some identity notes were
left out …` banner placed FIRST in the prefix:

```js
  const idDir = path.join(vaultDir, layout.identity_dir);
  const identity = [
    ['profile.md', "# Who you're working with"],
    ['preferences.md', '## Preferences'],
    ['goals.md', '## Goals'],
    ['instructions.md', '## Standing instructions'],
  ];
  const identityExclusions = [];               // {file, reason} — WP-114
  for (const [file, header] of identity) {
    const r = readNote(path.join(idDir, file)); // WP-114 structured trust gate
    if (!r.note) {
      if (r.exclusion === 'malformed') identityExclusions.push({ file, reason: 'malformed frontmatter' });
      else if (r.exclusion === 'untrusted-invalid') identityExclusions.push({ file, reason: 'unclear derived_from_untrusted value' });
      continue;
    }
    const content = compact(r.note.body);
    if (!content) continue;
    parts.push(`${header}\n${content}`);
  }
```

This WP inserts the exact-byte hash gate BEFORE that `readNote` call and feeds its
own reason into the SAME `identityExclusions` list. The prefix mechanism prepends
fixed control-plane lines
(`formatAlerts(opts.alerts)`, `opts.schedulerLine`, `opts.updateLine`) before the
body; empty ones leave the body byte-identical (golden-frozen). `renderDigest` is
**pure and total** (never throws). `fs` and `path` are already required.

**`src/cli/sync.js`** (line ~210) and **`src/cli/dream.js`** (step 15, line ~281)
are the two production callers; both call `renderDigest(vault, layout, { alerts,
schedulerLine?, updateLine })` and write `state/digest.md` atomically. `paths.state`
is the core `state/` dir.

**`src/core/dream/validate.js`** exports `INJECTED_IDENTITY_FILES =
['profile.md','preferences.md','goals.md','instructions.md']` and:

```js
function isInjectedIdentity(rel, layout) {
  const prefix = layout.identity_dir + '/';
  if (!rel.startsWith(prefix)) return false;               // ← case-sensitive
  return INJECTED_IDENTITY_FILES.includes(rel.slice(prefix.length));
}
```

**0600-write precedent:** `src/gws/client.js` writes tokens atomically —
`mkdirSync(dir, {mode:0o700})`, write temp `{mode:0o600}`, `chmodSync` temp, rename,
`chmodSync` dest. Reuse that shape for the registry.

**Tests calling `renderDigest`:** `tests/unit/digest.test.js`,
`tests/unit/layout.test.js`, `tests/unit/alerts.test.js`,
`tests/integration/adopt-e2e.test.js`. The identity fixtures are
`tests/fixtures/identity-filled/06-Identity/*.md`; the golden is
`tests/golden/digest-default.md`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/identity-approvals.js | registry read/write (0600), exact-byte hashing, seed, status, `approvalsMap`, `approvalsFromVault` |
| modify | src/core/digest.js | gate identity injection on `opts.identityApprovals` exact-byte match; fixed banner for a present-but-unapproved file |
| modify | src/cli/sync.js | seed (first-time) + read registry + pass `identityApprovals` to `renderDigest` |
| modify | src/cli/dream.js | read registry (NO seed) + pass `identityApprovals` to the step-15 `renderDigest` |
| modify | src/core/dream/validate.js | make `isInjectedIdentity` case-insensitive (defense in depth) |
| create | tests/unit/identity-approvals.test.js | unit-test the module (hash, seed-once, status, case-fold, 0600) |
| modify | tests/unit/digest.test.js | thread `approvalsFromVault`; add fail-closed / tamper / case-fold cases |
| modify | tests/unit/layout.test.js | thread `approvalsFromVault` where identity presence is asserted |
| modify | tests/unit/alerts.test.js | thread `approvalsFromVault` only where identity presence is asserted (baseline-relative tests need no change — verify) |
| modify | tests/integration/adopt-e2e.test.js | thread `approvalsFromVault` where the adopt digest asserts identity presence |
| modify | tests/unit/dream-validate.test.js | add a case-variant (`06-Identity/Profile.md`) frozen-revert case |

### Exact contracts

**1. `src/core/identity-approvals.js`.**

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REGISTRY_BASENAME = 'identity-approvals.json';
const INJECTED_IDENTITY_FILES = ['profile.md', 'preferences.md', 'goals.md', 'instructions.md'];

/** Case-folded vault-relative key (ADR-0021: path identity folded; content exact). */
function foldKey(rel) { return String(rel).toLowerCase(); }

/** sha256 hex of EXACT bytes — no normalization/case-fold/newline munging. */
function hashBytes(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/** @param {string} stateDir @returns {string} */
function registryPath(stateDir) { return path.join(stateDir, REGISTRY_BASENAME); }

/** The four injected identity files as vault-relative POSIX paths for a layout. */
function injectedIdentityRels(layout) {
  return INJECTED_IDENTITY_FILES.map((f) => `${layout.identity_dir}/${f}`);
}

/** Exact-byte sha256 of an on-disk file, or null when unreadable/absent. */
function fileHash(vaultDir, rel) {
  try { return hashBytes(fs.readFileSync(path.join(vaultDir, rel))); } catch { return null; }
}

/** Read the registry. Missing/corrupt/malformed → {version:1, approvals:{}} (fail
 *  closed: nothing approved). `approvals` is a plain object keyed by folded rel. */
function readRegistry(stateDir) {
  try {
    const obj = JSON.parse(fs.readFileSync(registryPath(stateDir), 'utf8'));
    if (obj && typeof obj === 'object' && !Array.isArray(obj) &&
        obj.approvals && typeof obj.approvals === 'object' && !Array.isArray(obj.approvals)) {
      return { version: 1, approvals: obj.approvals };
    }
  } catch { /* fall through */ }
  return { version: 1, approvals: {} };
}

/** Atomically persist the registry at 0600 (state dir 0700). temp+rename+chmod,
 *  mirroring src/gws/client.js token writes. */
function writeRegistry(stateDir, registry) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const dest = registryPath(stateDir);
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, approvals: registry.approvals }, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, dest);
  fs.chmodSync(dest, 0o600);
}

/** The map the digest consumes: {foldedRel: approved_blob_hash}. */
function approvalsMap(registry) {
  const out = {};
  for (const [k, v] of Object.entries(registry.approvals || {})) {
    if (v && typeof v.approved_blob_hash === 'string') out[k] = v.approved_blob_hash;
  }
  return out;
}

/** TEST/seed helper: the approvals map computed from CURRENT on-disk identity
 *  bytes (trust-what-is-here). Absent files are skipped. */
function approvalsFromVault(vaultDir, layout) {
  const out = {};
  for (const rel of injectedIdentityRels(layout)) {
    const h = fileHash(vaultDir, rel);
    if (h) out[foldKey(rel)] = h;
  }
  return out;
}

/** FIRST-TIME seed only: record the current exact-byte hash of each present
 *  injected identity file that has NO record yet (source 'setup'). NEVER re-seeds
 *  an existing record (a change requires `wienerdog memory approve`, WP-117).
 *  Persists iff something was added. @returns {{seeded:string[]}} folded keys added. */
function seedApprovals(stateDir, vaultDir, layout) {
  const registry = readRegistry(stateDir);
  const seeded = [];
  for (const rel of injectedIdentityRels(layout)) {
    const key = foldKey(rel);
    if (registry.approvals[key]) continue;          // already has a record → never re-seed
    const h = fileHash(vaultDir, rel);
    if (!h) continue;                                // absent on disk → nothing to seed
    registry.approvals[key] = { approved_blob_hash: h, approved_at: new Date().toISOString(), source: 'setup' };
    seeded.push(key);
  }
  if (seeded.length > 0) writeRegistry(stateDir, registry);
  return { seeded };
}

/** Classify each present injected identity file for a caller. status ∈
 *  'ok' (approved & matches) | 'mismatch' (record exists, bytes differ) |
 *  'unapproved' (present, no record) | 'absent' (not on disk). */
function identityStatus(vaultDir, layout, registry) {
  const map = approvalsMap(registry);
  return injectedIdentityRels(layout).map((rel) => {
    const key = foldKey(rel);
    const h = fileHash(vaultDir, rel);
    let status;
    if (h === null) status = 'absent';
    else if (!map[key]) status = 'unapproved';
    else status = map[key] === h ? 'ok' : 'mismatch';
    return { rel, foldedRel: key, status };
  });
}

module.exports = {
  REGISTRY_BASENAME, INJECTED_IDENTITY_FILES, foldKey, hashBytes, registryPath,
  injectedIdentityRels, fileHash, readRegistry, writeRegistry, approvalsMap,
  approvalsFromVault, seedApprovals, identityStatus,
};
```

**2. `src/core/digest.js` — the identity hash-gate, layered ON TOP of WP-114.**
WP-114 already turned the identity loop into a structured-`readNote` loop that
collects anomalous exclusions into `identityExclusions` (`{file, reason}`) and
prepends one `> [!warning] Wienerdog: some identity notes were left out …` banner.
This WP adds the exact-byte hash gate BEFORE the WP-114 provenance gate and feeds
its own reason into the **same** `identityExclusions` list (one banner, one
placement — the owner's consistency requirement). Absent `opts.identityApprovals`
→ nothing approved → no identity (fail closed); a mismatch warns only when the map
was actually supplied (production), never on a bare test render.

```js
const { hashBytes, foldKey } = require('./identity-approvals');
// … inside renderDigest, extending the WP-114 identity loop …
  const idDir = path.join(vaultDir, layout.identity_dir);
  const approvals = opts.identityApprovals || {};
  /** @type {Array<{file:string, reason:string}>} */ const identityExclusions = [];
  for (const [file, header] of identity) {
    const abs = path.join(idDir, file);
    let bytes;
    try { bytes = fs.readFileSync(abs); } catch { continue; } // absent → silent
    // A3 hash gate (WP-116, ADR-0021): inject ONLY when the exact bytes match a
    // human-approved hash. Case-folded key so Profile.md == profile.md. A mismatch
    // is anomalous → warn, but ONLY when approvals were supplied (production); a
    // bare test render with no map omits identity SILENTLY (fail closed).
    const foldedRel = foldKey(`${layout.identity_dir}/${file}`);
    if (approvals[foldedRel] !== hashBytes(bytes)) {
      if (opts.identityApprovals !== undefined) identityExclusions.push({ file, reason: 'changed since you last approved it' });
      continue;
    }
    // WP-114 provenance gate on top (structured result → SAME exclusion list).
    const r = readNote(abs);
    if (!r.note) {
      if (r.exclusion === 'malformed') identityExclusions.push({ file, reason: 'malformed frontmatter' });
      else if (r.exclusion === 'untrusted-invalid') identityExclusions.push({ file, reason: 'unclear derived_from_untrusted value' });
      // 'untrusted-exact' and 'absent' → silent (normal), as in WP-114.
      continue;
    }
    const content = compact(r.note.body);
    if (!content) continue;
    parts.push(`${header}\n${content}`);
  }
```

Broaden the WP-114 banner remedy so it covers both a frontmatter fix and an
intentional-edit re-approval (one banner, first in the prefix):

```js
  const identityWarn = identityExclusions.length > 0
    ? `> [!warning] Wienerdog: some identity notes were left out of your session context — ${identityExclusions.map((e) => `${e.file} (${e.reason})`).join(', ')}. Fix their frontmatter and run \`wienerdog sync\`, or re-approve an intentional edit with \`wienerdog memory approve <note>\`.`
    : '';
  const prefix = [identityWarn, formatAlerts(opts.alerts || []), opts.schedulerLine || '', opts.updateLine || '']
    .filter((s) => s !== '')
    .join('\n\n');
```

`renderDigest` stays pure and total. Extend the `opts` JSDoc with
`identityApprovals?: Record<string,string>` — `{caseFoldedVaultRel: approvedHash}`;
absent → no identity injected (fail closed).

> **Note (record under "Decisions made").** The banner remedy names `wienerdog
> memory approve`, which ships in the immediately-following **WP-117** (the A3 chain
> lands together). A hash-mismatch banner is only reachable in production once the
> registry is seeded (post-setup), by which point WP-117 is in the same release. If
> WP-117 is not co-shipped, keep the remedy generic (`Review them and run \`wienerdog
> sync\``) and let WP-117 add the approve pointer.

**3. `src/cli/sync.js`.** Before rendering (inside the `if (vaultPath) { … }` block,
after `const layout = readVaultLayout(paths.config);`), seed first-time then build
the map:

```js
const identityApprovals = require('../core/identity-approvals');
// … in the vaultPath block:
      const layout = readVaultLayout(paths.config);
      if (!dryRun) identityApprovals.seedApprovals(paths.state, vaultPath, layout);
      const idReg = identityApprovals.readRegistry(paths.state);
      const digest = renderDigest(vaultPath, layout, {
        alerts: readAlerts(paths),
        schedulerLine: require('../scheduler/status').renderSchedulerStatusLine(paths),
        updateLine: renderUpdateLine(paths),
        identityApprovals: identityApprovals.approvalsMap(idReg),
      });
```

Seed only on a real (non-dry-run) sync. A dry-run reads the registry (may be empty)
and reports the digest it *would* write. No other sync behavior changes.

**4. `src/cli/dream.js`** (step 15). The dream **NEVER seeds** — it reads the
existing registry (established at the last attended sync) and enforces:

```js
const identityApprovals = require('../core/identity-approvals');
// … step 15:
    const idReg = identityApprovals.readRegistry(paths.state);
    const digest = renderDigest(vaultDir, layout, {
      alerts: readAlerts(paths),
      updateLine: renderUpdateLine(paths),
      identityApprovals: identityApprovals.approvalsMap(idReg),
    });
```

**5. `src/core/dream/validate.js` — case-insensitive `isInjectedIdentity`:**

```js
function isInjectedIdentity(rel, layout) {
  const prefix = (layout.identity_dir + '/').toLowerCase();
  const low = String(rel).toLowerCase();
  if (!low.startsWith(prefix)) return false;
  return INJECTED_IDENTITY_FILES.includes(low.slice(prefix.length)); // direct child, any case
}
```

Nothing else in `validate.js` changes.

**6. Tests.** Use `approvalsFromVault(vaultDir, layout)` to make identity render:

- `digest.test.js`: the golden test becomes
  `renderDigest(FIXTURE, undefined, { identityApprovals: approvalsFromVault(FIXTURE, defaultLayout()) })`
  → still byte-identical to the unchanged golden. Add: (a) **fail-closed** —
  `renderDigest(FIXTURE)` (no approvals) injects no identity header; (b) **tamper** —
  approve, then append a byte to `profile.md`, pass the stale map → profile omitted
  AND the digest contains the `changed since you last approved` banner; (c)
  **case-fold** — a vault with `06-Identity/Profile.md` (capital P) is injected when
  the approvals map holds the folded key (proving `Profile.md` and `profile.md` share
  one slot). Keep the existing `derived_from_untrusted`/`missing`/`compaction` cases,
  threading approvals so their identity renders.
- `layout.test.js`, `alerts.test.js`, `adopt-e2e.test.js`: thread
  `approvalsFromVault` into every `renderDigest` call that asserts identity CONTENT.
  Calls that only assert *absence* (the traversal-safety test) or compare against a
  same-shape no-approval baseline need no change — verify per call, change the
  minimum.
- `dream-validate.test.js`: add a case where the brain adds
  `06-Identity/Profile.md` (capital P) with a floor-passing Tier-3 frontmatter and
  `validateAndCommit` runs under the frozen profile → the file is REVERTED with the
  identity-frozen reason (case-variant now hits the freeze branch). Existing cases
  unchanged.

## Implementation notes & constraints

- **Fail closed on absence.** Absent `opts.identityApprovals` = nothing approved =
  no identity (never fail open). The two production callers always pass the map; a
  bare `renderDigest(vault)` (tests) renders no identity — this is deliberate
  (ADR-0021; mirrors WP-109's fail-closed-on-absence).
- **Byte-exact hashing, folded paths.** Hash `fs.readFileSync(abs)` as a Buffer (no
  encoding, no normalization). Fold ONLY the path key, never the content.
- **`sync` seeds first-time only; the dream never seeds.** Re-seeding on change
  would let a post-setup tamper become approved by running `sync` — forbidden
  (ADR-0021). Changing an already-seeded file requires WP-117's `memory approve`.
  **The seed-on-first-attended-sync design is OWNER-APPROVED (2026-07-17)** — a
  settled decision, not an open question: setup is attended and trusted, the dream
  can never author these files (WP-112 freeze), and requiring a manual approve before
  first use would degrade onboarding with no real security gain.
- **Banner is declarative + code-owned.** It names code-constant filenames only —
  never note content — so no untrusted bytes enter the digest (same rule as the
  alerts banner, WP-041).
- **`renderDigest` stays pure and total** — no throw, no alerts.jsonl write; the
  fail-loud surface is the in-digest banner (GLOSSARY: fail-loud = alert OR digest
  banner).
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step; the registry file is
  machine-generated state (not manifest-tracked; WP-068's core disposal removes
  `state/` on uninstall).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] Untrusted-derived or tampered identity bytes cannot reach the injected digest
      without an exact-byte human-approved hash match: absent/mismatched approval →
      omitted + banner; a one-byte change after approval stops injection (asserted).
      Hashing is byte-exact (Buffer, no normalization); the registry key is
      case-folded so `Profile.md`/`profile.md` cannot occupy two slots, and
      `isInjectedIdentity` is case-insensitive so a case-variant dream write still
      hits the WP-112 freeze. The registry file is 0600, atomically written, in the
      core (outside the brain's vault write surface). `sync` seeds first-time only;
      the dream never seeds. No untrusted identifier flows into a path/shell (the
      folded key is compared, never used to build a write path).

## Acceptance criteria

- [ ] `renderDigest(FIXTURE, undefined, { identityApprovals: approvalsFromVault(FIXTURE, defaultLayout()) })`
      is byte-identical to the unchanged golden.
- [ ] `renderDigest(FIXTURE)` (no approvals) injects NO identity header (fail closed).
- [ ] After approving then changing one byte of `profile.md`, the digest omits
      `profile.md` and the shared identity-exclusion banner ("some identity notes
      were left out …") names `profile.md (changed since you last approved it)`. With
      NO approvals map supplied, the same mismatch omits silently (no banner).
- [ ] `Profile.md` (capital P) is injected iff the approvals map holds the folded
      `06-identity/profile.md` key (one slot for both spellings).
- [ ] `seedApprovals` records a present, unrecorded file once and NEVER re-seeds an
      existing record; the registry file is mode 0600.
- [ ] A dream add of `06-Identity/Profile.md` with a floor-passing frontmatter is
      reverted under the frozen profile (case-insensitive `isInjectedIdentity`).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "identity-approvals"
npm test -- --test-name-pattern "digest"
npm test -- --test-name-pattern "dream-validate"
node bin/wienerdog.js safety   # unchanged: gates still all blocked
npm test
npm run lint
```

## Out of scope (do NOT do these)

- `wienerdog memory approve` — the TTY-only ratification CLI is **WP-117**.
- Making the dream emit non-injected identity **proposals** (a later dream-skill
  WP); this WP works for the human-edit path.
- Opening or changing any capability gate in `safety-profile.js` (the WP-112
  identity-freeze stays blocked; this is the independent read-side gate).
- Manifest-tracking the registry file (it is disposable machine state).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/116-identity-trust-registry-digest-hashgate`; conventional commits;
   PR titled `feat(digest,identity): exact-byte identity trust registry + fail-closed hash-gate (WP-116)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
