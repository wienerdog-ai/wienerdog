---
id: WP-a9-private-modes-repair
title: Extend the private-modes predicate to the whole mechanics root — secrets/, grants, tokens, client JSON, exec pins — so a permissive-umask install and a legacy 0755/0644 upgrade both end private
status: Draft
model: opus
size: M
depends_on: [WP-154]
adrs: [ADR-0004, ADR-0024]
epic: audit-a9
---

# WP-a9-private-modes-repair: Full-root private modes + upgrade repair (audit A9, code part)

## Context (read this, nothing else)

Wienerdog's **canonical core** is `~/.wienerdog/` — config, state, secrets,
logs, and the install manifest. **IRON RULE (ADR-0004): Wienerdog is just
files.** Everything it writes to a user's machine must be private to the owner:
directories `0700`, sensitive files `0600`, **independent of the user's umask**
(a permissive `umask 022` or `000` must not leak a token as world-readable), and
**repairable** — a machine that predates a hardening must be fixed on the next
`sync`/`doctor`, not left insecure.

The 2026-07-15 audit action **A5** (ADR-0024) shipped the private-modes
machinery in `src/core/private-fs.js`: `0700` dirs / `0600` files via an explicit
`chmod` that defeats a permissive umask, plus a single read-only predicate
(`insecureEntries`) that three surfaces share so they can never disagree —
`doctor` WARNs, `sync --dry-run`'s would-repair count, and the digest's
insecure-modes banner. But A5 was **deliberately scoped narrow**: its own module
header records that it covers **only** an explicit set (core, state, logs, dream
scratch, quarantine; and the files `digest.md`, `alerts.jsonl`,
`transcript-ledger.json`, `identity-approvals.json`) and **"never walks into
`secrets/`, GWS token/grant/client files, config.yaml, the manifest, or scheduler
state — those are audit action A9's scope."**

This WP closes that A9 scope. Audit action **A9** (P1) requires:

> - "Make the whole Wienerdog mechanics root private by default where compatible;
>   explicitly protect state, logs, digest, alerts, scratch, **grants, tokens,
>   and client JSON**."
> - "Repair existing modes on doctor/sync rather than relying on `mkdir(mode)`
>   for pre-existing directories."
>
> A9 acceptance (this WP's half): "Fresh install under permissive umask **and**
> an upgrade from 0755/0644 state both end with the declared private modes."

**Gap analysis (verified against the live code — do this, don't rediscover it).**
The **write** paths for the sensitive artifacts are already umask-independent
`0600`: GWS tokens/client JSON via `src/gws/client.js`'s temp+rename+chmod-`0600`
writer; the broker grant store, the executable pins (WP-154), and run evidence
via `private-fs.writeFilePrivate` (`0600`). So the **fresh-install-under-
permissive-umask** half is already satisfied *for these files at write time*.
What is **missing** is that the shared **predicate/repair** set
(`insecureEntries` / `repairPrivateModes` / `scanPrivateModes`) does **not**
enumerate any of them — so a machine that was installed **before** those writers
were `0600` (a legacy `0644` token, a `0755` `secrets/`, a legacy grant store)
is **never detected by doctor, never repaired by sync, never bannered in the
digest**. The **upgrade-repair** half of the acceptance is therefore unmet for
the entire `secrets/` + grants/pins set. This WP extends the shared predicate to
cover them, so the same three surfaces that already handle the A5 set now handle
the A9 set too — repair, warn, and banner for free.

**Iron-rule/no-scope-creep note.** The core directory is *already* `0700` (it is
in the A5 dir set), so every file under it is protected from **other users** by
directory traversal today; this WP adds the explicit per-file `0600` guarantee
and its **repair** for the credential-bearing files, which is defense-in-depth
and the literal A9 requirement, not the whole-disk privacy claim.

## Current state

**`src/core/private-fs.js`** (the A5 module). Key shapes to extend:

```js
const A5_PRIVATE_DIRS = (paths) => [
  paths.core, paths.state, paths.logs,
  path.join(paths.state, 'dream-scratch'),
  path.join(paths.state, 'quarantine'),
];
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md', 'alerts.jsonl', 'transcript-ledger.json', 'identity-approvals.json',
];

// internal, NOT exported — the single enumerator behind all three surfaces:
function listA5Entries(paths) { /* returns {dirs, files}; walks logs/<job>/*.log,
  dream-scratch/*.json, quarantine/*; NEVER walks secrets/ */ }

function repairPrivateModes(paths) { /* dirs→0700, files→0600 for the enumerated
  set; returns {changed} */ }
function insecureEntries(paths) { /* READ-ONLY list of enumerated entries with
  (mode & 0o077) !== 0; win32→[]; the shared predicate */ }
function scanPrivateModes(paths) { /* {insecure: insecureEntries().length} */ }

module.exports = { mkdirPrivate, writeFilePrivate, repairPrivateModes,
  scanPrivateModes, insecureEntries, A5_PRIVATE_DIRS, A5_PRIVATE_FILE_BASENAMES };
```
`chmodIfNeeded(p, mode)` (best-effort, win32 no-op, returns true iff changed),
`listFiles(dir, keep)`, and the `WIN32` const already exist in the module.

**Where the A9-scoped artifacts live** (verified):
- `paths.secrets` = `<core>/secrets/` — created `0700` by `src/cli/init.js`
  (mkdir+chmod) and by `src/gws/client.js` `ensureSecretsDir` (`mkdir …mode
  0o700`). Files inside (all written `0600` at write time):
  - `google-token-read.json`, `google-token-draft.json`, `google-token-send.json`,
    `google-token-calendar.json`, `google-token.json` (**tokens**),
  - `google-client.json` (**client JSON**).
- `paths.state` = `<core>/state/`. Sensitive files there **not** in the A5 set:
  - `broker-grants.json` (**grants**; written `0600` via `writeFilePrivate` —
    `src/gws/broker/grant-store.js`),
  - `exec-pins.json` (**executable pins**; written `0600` via `writeFilePrivate`
    — `src/core/exec-identity.js`, **introduced by WP-154**),
  - `run-evidence.jsonl` (written `0600` via `writeFilePrivate`).
- `config.yaml`, `install-manifest.json`, `state/schedule.json`,
  `state/watermarks.json` are **not** credential-bearing (vault path / model /
  file list / processing markers) and are protected by the `0700` core+state
  dirs; see Implementation notes for the explicit in/out-of-scope decision.

**`src/cli/sync.js`** already calls `scanPrivateModes(paths)` and
`repairPrivateModes(paths)` on a real (non-dry-run) sync, and reports
`insecureModes: scanPrivateModes(paths).insecure` — extending the predicate flows
through this **unchanged**.

**`src/cli/dream.js`** already reports `insecureModes: scanPrivateModes(paths)
.insecure` in the digest render — the banner extends **unchanged**.

**`src/cli/doctor.js`** has TWO relevant blocks:
1. A **dedicated `secrets/` directory check** (POSIX): warns if
   `fs.statSync(paths.secrets).mode & 0o777 !== 0o700`, and a hard `fail` if the
   dir is missing. It does **not** check the token/client **files** inside.
2. The **shared A5 predicate loop**: `for (const p of insecureEntries(paths))
   check('warn', \`${p} is readable by other users — run 'wienerdog sync' …\`)`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/private-fs.js | Extend the single internal enumerator to the union of the A5 set **and** the A9 set: `secrets/` dir (`0700`), every regular file directly under `secrets/` (`0600`), and the sensitive `state/` files `broker-grants.json`, `exec-pins.json`, `run-evidence.jsonl` (`0600`). Add `A9_PRIVATE_DIRS`/`A9_PRIVATE_FILE_BASENAMES` and export them alongside the A5 ones. `repairPrivateModes`/`insecureEntries`/`scanPrivateModes` keep their names/signatures and now cover the union. |
| modify | src/cli/doctor.js | Fold the dedicated `secrets/`-dir `0700` check into the shared predicate: the `insecureEntries` loop now covers the `secrets/` dir **and** its files, so remove the redundant mode-comparison warn (keep the **"secrets directory missing"** hard `fail`). Single predicate, three surfaces — the module's stated invariant. |
| modify | tests/unit/private-fs.test.js | Add the A9 cases below (secrets dir+files, grants/pins repair, permissive-umask, upgrade from 0755/0644, win32 no-op). |
| modify | tests/unit/doctor.test.js | Assert a group/other-readable `secrets/` dir or token file is WARNed via the unified predicate; assert the missing-secrets `fail` still fires. |

### Exact contracts

**`src/core/private-fs.js` — the extension.** Keep the A5 exports and the
single-predicate architecture; add the A9 set and union it into the one internal
enumerator (rename it if you like — it is not exported — but keep it the sole
source for all three surfaces so they can never disagree):

```js
/** A9-scoped private DIRECTORIES (0700): the credential store. `secrets/` is
 *  where GWS OAuth tokens + client JSON live (A9). Repaired, never created here.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_DIRS = (paths) => [paths.secrets];

/** A9-scoped private FILES directly under state/ (0600): grants, exec pins, run
 *  evidence. (Tokens/client JSON are matched by walking secrets/ for every
 *  regular file — no fixed basename list, so a new google-token-*.json is
 *  covered automatically.) */
const A9_PRIVATE_FILE_BASENAMES = [
  'broker-grants.json',
  'exec-pins.json',
  'run-evidence.jsonl',
];
```

The enumerator, extended, returns `{dirs, files}` = **union of**:
- dirs: the A5 dirs **plus** every existing `A9_PRIVATE_DIRS` entry (`secrets/`);
- files: the A5 files **plus** every existing `A9_PRIVATE_FILE_BASENAMES` file
  under `state/` **plus every regular file directly under `secrets/`** (one
  level, matched by `listFiles(paths.secrets, () => true)` — this is how the
  tokens + client JSON are covered without hard-coding their names).

Every entry is best-effort and existence-guarded exactly like the A5 set (a
missing `secrets/` or a missing pin file is simply skipped — this WP **repairs**,
it never **creates**; `init.js`/`gws/client.js` own creation). `win32` stays a
no-op (POSIX-only guarantee, owner-approved). Deduplicate if a path could appear
in both sets (it cannot today, but the union must not double-report).

Resulting behavior (all three surfaces, for free):
- `repairPrivateModes(paths)` → chmods a legacy `0755` `secrets/`→`0700` and a
  legacy `0644` token/grant/pin→`0600`, counting each change.
- `insecureEntries(paths)` / `scanPrivateModes(paths)` → now report a
  group/other-accessible `secrets/` dir or token/grant/pin file.

**`src/cli/doctor.js` — fold the secrets check.** After the extension,
`insecureEntries` already covers `secrets/` and its files, so the dedicated
`mode === 0o700 ? ok : warn` comparison is redundant with (and would
double-report against) the shared loop. Remove that comparison; **keep** the
`dirExists(paths.secrets)` → `fail` "secrets directory missing" check and the
win32 skip. The shared `insecureEntries` loop remains the single warn source.

### Example (POSIX)

```
# legacy machine, permissive umask, pre-hardening modes:
secrets/                       0755   secrets/google-token-read.json   0644
state/broker-grants.json       0644   state/exec-pins.json             0644

wienerdog doctor      # WARNs each of the four as "readable by other users"
wienerdog sync        # repairPrivateModes → secrets/ 0700, the three files 0600
wienerdog doctor      # clean; scanPrivateModes → {insecure: 0}
```

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step.
- **`config.yaml`, `install-manifest.json`, `state/schedule.json`,
  `state/watermarks.json` are OUT of the `0600` set — deliberate, recorded here.**
  They carry no credential (vault path / model / file list / processing markers),
  and the already-`0700` `core`/`state` dirs protect them from other users by
  traversal. A9's explicit list is "state, logs, digest, alerts, scratch, grants,
  tokens, client JSON" — none of these four. Adding them would broaden the
  deliverables (their writers) for no credential-exposure gain. If a reviewer
  wants them included for uniformity, that is a **separate** decision — do not
  expand scope here; note it in the PR under "Discovered issues".
- **This WP does NOT modify `src/cli/sync.js`.** Verified: sync already calls
  `repairPrivateModes`/`scanPrivateModes` by their unchanged names, so the
  extension flows through with no sync edit. The `depends_on: [WP-154]` is
  because the A9 set includes `exec-pins.json`, which **WP-154 introduces** —
  enumerating a not-yet-existing artifact before WP-154 lands would be premature
  — and because WP-154 concurrently edits the private-modes/sync surface (do not
  race it). (The 2026-07-19 migration logbook anticipated a shared `sync.js`
  edit; gap analysis shows the shared predicate makes it unnecessary — verify the
  live `sync.js` before assuming otherwise.)
- **Repair, never create.** `repairPrivateModes` must not `mkdir` `secrets/` or
  `touch` a token — a machine with no Google setup has no `secrets/` and that is
  correct (existence-guarded skip). Creation stays with `init.js` /
  `gws/client.js`.
- **Keep the single-predicate invariant.** All three surfaces (doctor warn, sync
  repair/scan, digest banner) must read the **same** enumerator — do not add a
  parallel secrets scan anywhere. The whole point of the A5 design is that the
  three surfaces cannot disagree; the A9 extension must preserve that.
- `never mock process.platform` — inject `platform` where a test needs a specific
  OS (the module already gates on the module-level `WIN32`; for tests that must
  assert win32 behavior, follow the module's existing pattern).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] After the extension, a group- or other-accessible `secrets/` directory, a
      `google-token-*.json`, `google-client.json`, `broker-grants.json`, or
      `exec-pins.json` is (a) reported by `insecureEntries`/`scanPrivateModes`,
      (b) WARNed by `doctor`, (c) counted by the digest banner, and (d) repaired
      to `0700`/`0600` by `repairPrivateModes` — all from the one shared
      enumerator.
- [ ] `repairPrivateModes` never creates `secrets/` or any file; a machine with
      no Google setup produces zero changes and zero warnings for the A9 set.
- [ ] The private-modes guarantee stays `0700`/`0600` under a permissive umask
      (fresh write) and is repaired from legacy `0755`/`0644` (upgrade).
- [ ] `win32` remains a no-op for the A9 set (POSIX-only, owner-approved posture).

## Acceptance criteria (mapped to the A9 acceptance bullet)

- [ ] **[A9 — "Fresh install under permissive umask … ends with the declared
      private modes."]** Under a permissive umask, a freshly-written token
      (`gws/client.js`) and grant/pin (`writeFilePrivate`) are `0600` and
      `secrets/` is `0700` — asserted by a test that sets a permissive umask and
      inspects the resulting modes (the writers are unchanged; the test proves
      the guarantee holds and is now *covered by the predicate*).
- [ ] **[A9 — "… an upgrade from 0755/0644 state ends with the declared private
      modes."]** Given a pre-seeded `secrets/` at `0755` with a `0644` token, a
      `0644` `broker-grants.json`, and a `0644` `exec-pins.json`,
      `repairPrivateModes` changes each to `0700`/`0600` and returns the correct
      `{changed}` count; a second call returns `{changed: 0}` (idempotent).
- [ ] `insecureEntries`/`scanPrivateModes` report exactly those insecure A9
      entries before repair and none after; `doctor` WARNs them via the unified
      loop (no duplicate secrets warn), and still `fail`s when `secrets/` is
      missing.
- [ ] The A5 set's behavior is unchanged (existing `private-fs`/`doctor` tests
      still pass).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "private-fs|doctor"
npm test
npm run lint
# the predicate now names the A9 artifacts:
grep -nE "secrets|broker-grants|exec-pins|A9_PRIVATE" src/core/private-fs.js
```

## Out of scope (do NOT do these)

- The **incident-drill runbook** — **WP-a9-incident-runbook** (docs).
- The **alert-body raw-tail exclusion** (A9 logging item) — belongs to WP-151,
  not here (per the A9 gap analysis).
- **Log bounding/rotation** — already shipped (`rotateLogs`, WP-038) and the
  self-email tail exclusion (WP-124/EP3); do not re-implement.
- Forcing `0600` on `config.yaml`/`install-manifest.json`/`schedule.json`/
  `watermarks.json` (decision above: out of scope, non-credential, dir-protected).
- Changing any **writer** (`gws/client.js`, `grant-store.js`, `exec-identity.js`,
  `watermarks.js`, `jobs.js`) — they already write correctly; this WP only
  extends the **predicate/repair** set.
- Creating `secrets/` or seeding tokens — creation stays with `init`/`gws`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(security): extend private-modes repair to secrets/grants/tokens/pins (WP-a9-private-modes-repair)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
