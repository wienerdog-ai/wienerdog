---
id: WP-095
title: Resolve the vault path's symlinks component-wise before the TCC guard so a symlinked vault can't reintroduce the unattended hang
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: []
branch: wp/095-tccguard-realpath-resolution
---

# WP-095: TCC-guard component-wise symlink resolution

## Context (read this, nothing else)

On macOS, TCC (Transparency, Consent & Control) protects a few home-relative
folders (`Desktop`, `Documents`, `Downloads`, iCloud Drive) behind an interactive
permission prompt. An unattended scheduled job that reads one of them **blocks
forever** on a prompt no one can answer — the "4-hour hang" incident (THREAT-MODEL
T6). Wienerdog's defense: `run-job` calls `tccguard.guard(paths, home)` up front
and **refuses** (fail-loud) any job whose vault path is under a protected folder.

The **verified defect (scheduler #3):** `tccguard.checkPath`'s own contract says
the path must be *"realpath-resolved by caller if a symlink"* — but `run-job`
passes the **raw configured vault path** straight from `config.yaml`, unresolved.
A vault configured as `~/vault` that is a **symlink** to `~/Documents/vault`
passes the guard (its literal path isn't under a protected prefix) yet the job
then reads through the symlink into `Documents/` — reproducing exactly the
unattended hang the guard exists to prevent.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
`run-job` is a bounded wrapper. Fail-loud beats an invisible hang (T6).

## Current state

`src/cli/run-job.js` `runJob` (lines ~335–347):

```js
const vaultDir = readDreamConfig(paths.config).vault; // throws if no vault configured
const cwd = vaultDir;

// 1. TCC-guard: refuse (fail-loud) rather than hang on a protected folder.
const g = tccguard.guard([vaultDir, cwd], paths.home, opts.platform);
if (!g.ok) {
  const reason = `refused: ${g.offending} is under a macOS protected folder (${g.prefix}) — move the vault to ~/wienerdog`;
  jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
  await failLoud(paths, name, reason, '', opts);
  throw new WienerdogError(`job "${name}" ${reason}`);
}
```

`src/scheduler/tccguard.js` `checkPath(p, home, platform)` documents `p` as *"an
absolute path (realpath-resolved by caller if a symlink)"* and compares
`path.relative(home, p)` segment-wise against the protected prefixes. It is NOT
changed by this WP — the caller must supply a resolved path.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | LITERAL guard first (pure string, no FS); only if it passes, resolve the vault with a component-wise, check-BEFORE-access walk (`safeResolvePath`) that guards each component before any `lstat`, refusing if any lexical expansion enters a protected prefix; compare in both the literal- and resolved-home domains. NO `fs.realpathSync` / whole-path `lstat` |
| modify | tests/unit/scheduler-runjob.test.js | tests: final-component symlink, symlinked ANCESTOR (asserting NO stat inside the protected dir), trailing-slash final symlink, chained symlinks, symlinked-home-component, LOWERCASE-cased target, HOME-component-casing target, APFS Data-volume FIRMLINK-spelled target — all refused; and a legitimately non-protected symlinked vault still runs (win32-skipped — POSIX symlink semantics) |
| modify | src/scheduler/tccguard.js | Collateral (FS-canonicalization-safe TCC compare, round-3/4/5/6 review 2026-07-13): `checkPath` normalizes BOTH `home` and `p` at one choke point (`normalizeForCompare`, canonical order: Unicode NFC → case-fold → strip APFS `/System/Volumes/Data` firmlink prefix matched case-insensitively) for the home-containment (`path.relative`) AND protected-prefix DECISION, so a firmlink/NFC/case variant spelling of a home component or the prefix — including a case-variant firmlink prefix — all the SAME on-disk dir on macOS — is still refused |
| modify | tests/unit/scheduler-tccguard.test.js | Collateral (FS-canonicalization-safe TCC compare, round-3/4/5/6 review 2026-07-13): unit tests that protected prefixes, a home-component casing variance, the APFS firmlink spelling, a case-variant firmlink prefix, a combined case+firmlink+NFD spelling, and a Unicode NFC-vs-NFD variance all match and return the canonical prefix |

### Exact contracts

**TCC-safety governs the ORDER and the resolver.** `tccguard.checkPath` is pure string
arithmetic (`path.relative`) with ZERO filesystem access, so run the **literal guard
FIRST**: a directly-configured protected vault (`~/Documents/vault`) is refused without
ever touching the disk. Only if the literal path is clean do we resolve symlinks — and
we must **NOT** use `fs.realpathSync` NOR a single whole-path `fs.lstatSync`. Both make
the OS traverse the *entire* path in one call, so a symlinked **ancestor**
(`~/alias/vault` where `alias -> ~/Documents`) or a **trailing-slash final symlink**
(`~/vault/`) is followed INTO the protected folder before any guard runs — triggering
the exact TCC permission prompt this guard exists to prevent (scheduler #3, the "4-hour
hang"). A guard that hangs while resolving is self-defeating.

The definitive fix is a **component-wise, check-BEFORE-access walk**: resolve one
component at a time from the root, keeping `resolved` = the fully-real, already-guarded
prefix built so far (invariant: never an unresolved symlink, never protected). Guard
each next candidate **lexically before any `lstat`**; because all its ancestors are
already real, `lstat` can never traverse an unresolved symlink into a protected dir, and
a candidate that lexically lands in one is refused before it is stat-ed. Symlinks
(ancestor, final, chained, absolute or relative target) are expanded by pushing the
target's components back onto the work queue; a hop cap fails **closed** on a cycle.

```js
function splitAbsolute(p) {
  const root = path.parse(p).root || path.sep;
  const comps = p.slice(root.length).split(path.sep).filter((s) => s.length > 0);
  return { root, comps };
}

// Fully resolve `input`'s symlinks WITHOUT ever stat-ing a path that lexically resolves
// into a protected dir. `guard(candidate)` (pure path.relative) returns a hit to refuse.
function safeResolvePath(input, guard, hopCap = 40) {
  let { root: resolved, comps } = splitAbsolute(input);
  const queue = comps;
  let hops = 0;
  while (queue.length > 0) {
    const component = queue.shift();
    if (component === '.') continue;
    if (component === '..') { resolved = path.dirname(resolved); continue; }
    const candidate = path.join(resolved, component);
    const hit = guard(candidate);            // GUARD BEFORE ANY FS ACCESS
    if (hit) return { ok: false, offending: hit.offending, prefix: hit.prefix };
    let st;
    try { st = fs.lstatSync(candidate); }    // safe: ancestors real, candidate not protected
    catch { resolved = candidate; continue; } // absent/odd → plain component (best-effort)
    if (!st.isSymbolicLink()) { resolved = candidate; continue; }
    if (++hops > hopCap) return { ok: false, offending: input, prefix: 'unresolved symlink chain' };
    let target;
    try { target = fs.readlinkSync(candidate); } catch { resolved = candidate; continue; }
    if (path.isAbsolute(target)) {
      const t = splitAbsolute(target);
      resolved = t.root; queue.unshift(...t.comps);     // re-walk target from its root
    } else {
      queue.unshift(...target.split(path.sep).filter((s) => s.length > 0)); // relative to link dir
    }
  }
  return { ok: true, resolved };
}

// ... in runJob, replacing the single guard call:
const gLiteral = tccguard.guard([vaultDir, cwd], paths.home, platform);
let g = gLiteral;
if (g.ok) {
  // Canonicalize home the same safe way (home is never protected → its walk never refuses)
  // so a symlinked home component (a real /var/home -> /home) is followed too.
  const homeRes = safeResolvePath(paths.home, () => null);
  const resolvedHome = homeRes.ok ? homeRes.resolved : paths.home;
  const vaultGuard = (candidate) => {
    for (const h of [paths.home, resolvedHome]) {
      const c = tccguard.checkPath(candidate, h, platform);
      if (c.protected) return { offending: candidate, prefix: c.prefix };
    }
    return null;
  };
  const r = safeResolvePath(vaultDir, vaultGuard);
  if (!r.ok) g = { ok: false, offending: r.offending, prefix: r.prefix };
  else {
    g = tccguard.guard([r.resolved], paths.home, platform);      // redundant final check
    if (g.ok) g = tccguard.guard([r.resolved], resolvedHome, platform);
  }
}
```

`fs` and `path` are already imported by `run-job.js`. The rest of the refusal block is
unchanged; `g.offending` names whichever candidate is under a protected prefix, still an
accurate, actionable message.

Why guard in BOTH home domains: the walk canonicalizes the vault, and on macOS the temp
root itself resolves through a symlink (`/var → /private/var`), so the resolved vault
and the literal home can land in different domains. Guarding each candidate against both
the literal home and the canonicalized home covers a symlink target spelled through
either, closing the round-2 P2 mixed-domain `..`-prefix miss without any `realpath`.

Behavior:
- Non-symlinked vault under `~/wienerdog`: literal guard passes; the walk `lstat`s each
  (non-protected) component and resolves to itself; final checks pass (unchanged).
- Direct configured `~/Documents/vault`: literal guard refuses immediately — **no FS
  access at all** (unchanged behavior, now provably hang-free).
- Final symlink `~/vault → ~/Documents/vault` (incl. trailing-slash `~/vault/`): the
  walk reads the target, guards `~/Documents` BEFORE stat-ing it → refused.
- Symlinked ANCESTOR `~/alias/vault`, `alias -> ~/Documents`: the walk resolves `alias`
  (a safe `lstat`/`readlink` on the link node in home), then guards `~/Documents` before
  stat-ing it → refused, and Documents is never stat-ed (the 2nd defect closed).
- Chained `a -> b -> ~/Documents/vault`: each hop is re-walked; the protected candidate
  is guarded before stat → refused. A cycle hits the hop cap → fail closed (refused).
- Symlinked home component (`/var/home -> /home`): both vault and home canonicalize into
  the same domain; the resolved-home check refuses `Documents/vault`.
- Missing vault/home path: `lstat`/`readlink` throw → the component is treated as plain
  (best-effort); a missing vault never crashes the guard.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- `tccguard.checkPath` is changed ONLY to normalize BOTH `home` and `p` at one choke
  point (`normalizeForCompare`, canonical order: Unicode NFC → case-fold → strip the
  APFS `/System/Volumes/Data` firmlink prefix matched case-insensitively) so the entire
  comparison — home-containment AND protected-prefix match — is invariant to the three
  ways macOS/APFS spells the same on-disk dir (round-3/4/5/6 collateral, 2026-07-13). The
  `TCC_PREFIXES` list, the segment-boundary logic, and the `guard`/module API are
  otherwise untouched.
- Keep the change surgical: add the `splitAbsolute` + `safeResolvePath` helpers and the
  literal-first / component-wise-resolve guard sequence. Do not change `failLoud`, the
  state write, or the refusal message text.
- Do NOT use `fs.realpathSync`, nor a single whole-path `fs.lstatSync`, on the vault or
  home: both traverse the whole path in one syscall and can stat (and hang on) a
  TCC-protected folder reached via a symlinked ancestor — the very failure this guard
  prevents. Resolve component-by-component, guarding before each `lstat`.
- The test must not touch a real protected folder — construct a temp `home`, a temp
  target dir named to look protected relative to that home (e.g.
  `<home>/Documents/vault`), and the relevant symlink, then assert `runJob` refuses
  (mirror the existing tccguard/run-job test seams; pass `opts.platform: 'darwin'`). For
  the ancestor case, spy on `fs.lstatSync` and assert no call targets a path inside the
  protected dir. Symlink creation throws EPERM on stock Windows, so gate the symlink
  tests to skip on win32 (the darwin guard logic runs on every host via the non-symlink
  protected-folder test).

## Security checklist

- [ ] The literal guard (pure string, no FS) runs FIRST, so a directly-configured
      protected vault is refused without any filesystem access.
- [ ] Symlink resolution is a component-wise walk that guards each component BEFORE any
      `lstat`, never `fs.realpathSync` and never a whole-path `lstat` — so no path that
      lexically resolves into a protected dir is ever stat-ed, even via a symlinked
      ancestor or a trailing-slash final symlink. A vault symlinked into a TCC-protected
      folder cannot itself trigger the TCC prompt (T6) and is refused (fail-loud) EVEN
      WHEN home has a symlinked component, because each candidate is checked in both the
      literal- and resolved-home domains.
- [ ] The symlink-hop cap fails CLOSED (refuse) on a cycle; a missing/odd vault or home
      path is best-effort (plain component on `lstat`/`readlink` throw) and never crashes
      the guard.
- [ ] The ENTIRE `checkPath` comparison is normalized at one choke point
      (`normalizeForCompare`, canonical order: NFC → case-fold → firmlink-strip matched
      case-insensitively) for BOTH home-containment
      (`path.relative`) and the protected-prefix match, so a symlink target that spells a
      home component or the prefix via ANY macOS/APFS canonicalization — the
      `/System/Volumes/Data` firmlink, an NFC/NFD Unicode form, or a case variant — is
      still refused before any `lstat`; it cannot evade the guard while the OS accesses
      the real protected dir (T6).

## Acceptance criteria

- [ ] A vault whose FINAL component symlinks under a (test-relative) protected prefix is
      refused by `runJob` on `darwin` (writes error state, fail-loud, throws).
- [ ] A vault reached via a symlinked ANCESTOR into a protected prefix is refused, and
      `fs.lstatSync` is never called on a path inside the protected dir (asserted).
- [ ] A trailing-slash final symlink and a chained symlink into a protected prefix are
      both refused.
- [ ] A LOWERCASE-cased symlink target of a protected dir (`~/documents/vault`) is
      refused, and `fs.lstatSync` is never called inside the protected dir (any casing).
- [ ] A symlink target that varies a HOME component's casing (`/users/ada/Documents`
      vs home `/Users/ada`) is refused, and `fs.lstatSync` is never called inside the
      protected dir — closing the home-containment case-sensitivity gap.
- [ ] A symlink target using the APFS Data-volume FIRMLINK spelling
      (`/System/Volumes/Data/...<home>/Documents`) is refused, and `fs.lstatSync` is
      never called inside the protected dir (any spelling). A Unicode NFC-vs-NFD
      home-component variance is matched (checkPath unit test).
- [ ] The same is refused when the test `home` itself is reached through a symlinked
      component (each candidate is checked in both home domains) — the domain-matching
      case a single-domain check would miss.
- [ ] A vault at a non-protected location (incl. a legitimately non-protected symlinked
      vault) still runs.
- [ ] A directly-configured protected path is still refused by the literal guard,
      before any filesystem access (unchanged).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "runjob|tccguard|run-job"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Guarding "indirect paths used later by the dream" beyond the vault/cwd — the
  vault is the job's root; that broader sweep is not in scope.
- Any change to the `TCC_PREFIXES` list. (The ONLY authorized `tccguard.js` change is
  the round-3/4/5/6 comparison normalization — NFC → case-fold → firmlink-strip — see
  Deliverables + Round-2 dispositions.)
- run-job watchdog-kill / clean-PATH robustness (scheduler #4/#11) — separate.

### Accepted residual (owner decision 2026-07-13)

- **Exotic-script case-folding is NOT handled — accepted, not fixed.** The
  case-insensitive comparison in `checkPath` uses `.normalize('NFC').toLowerCase()`,
  which correctly folds case, Unicode normal form (NFC/NFD), and the APFS firmlink
  prefix — but `toLowerCase()` is NOT full Unicode **case-folding**. On macOS's
  case-insensitive APFS a handful of script-specific folds make distinct code points
  address the SAME on-disk directory — Greek final sigma (`ς` ≡ `σ`), German eszett
  (`ß` ≡ `ss`), Turkish dotless-ı, and similar — and `toLowerCase()` leaves those code
  points distinct. So a home directory whose NAME contains such a character, targeted by
  a symlink that uses the alternate spelling, could evade the home-containment check.
  Correct/complete folding requires the Unicode **CaseFolding** data table (a bundled
  data dependency) or a runtime library — both disallowed by the zero-runtime-deps rule
  (ADR-0004) — and a hand-rolled per-character fold is unbounded whack-a-mole. Exposure
  is extremely narrow (a non-ASCII home-dir name AND a crafted symlink on the same
  case-insensitive volume) and the guard is fail-safe in the common ASCII/NFC cases.
  **Accepted; revisit only if a zero-dep Unicode case-folding primitive becomes
  available.**

## Round-2 dispositions

- **Codex round-2 P2 (resolved vault vs unresolved home compared in different
  symlink domains):** RESOLVED. The resolved vault is checked in BOTH the literal-home
  and lexically-resolved-home domains, so a symlink target spelled through either home
  is caught. `tccguard.js` is unchanged.
- **Codex PR-review P1 (realpath resolution can itself hang on the TCC prompt):**
  RESOLVED. The first fix called `fs.realpathSync(vaultDir)` up front; realpath stats the
  fully-resolved target, so for a vault symlinked into a protected folder the resolution
  itself reads the protected path and could trigger the very TCC prompt the guard
  prevents — self-defeating for a TCC-guard WP. First reworked to run the literal guard
  first, then resolve the FINAL component lexically via `lstat`+`readlink`.
- **Codex PR-review 2nd P1 (readlink+lexical still followed symlinked ANCESTORS):**
  RESOLVED. `fs.lstatSync(vaultDir)` on the whole path still lets the OS traverse a
  symlinked ancestor — `~/alias/vault` where `alias -> ~/Documents` (and equally a
  trailing-slash final symlink `~/vault/`) — INTO the protected folder before the guard
  runs. The lexical-final-component check only inspected the last component. Replaced
  with a component-wise, check-BEFORE-access walk (`safeResolvePath`): resolve one
  component at a time from the root, guard each candidate (pure `path.relative`) BEFORE
  any `lstat`, and expand symlinks by re-walking their targets. Since every ancestor of
  a candidate is already fully real, no `lstat` ever traverses an unresolved symlink into
  a protected dir, and a candidate that lexically lands in one is refused before it is
  stat-ed (asserted by an `fs.lstatSync` spy in the ancestor test). Ancestor, final,
  chained, trailing-slash, and absolute/relative link targets are all handled; a
  symlink-hop cap fails closed on a cycle. No `fs.realpathSync` and no whole-path
  `lstat`. `tccguard.js` is unchanged.
- **Codex PR-review P2 (new symlink tests EPERM on stock Windows):** RESOLVED. All
  symlink tests are gated to skip on win32 (Windows lacks unprivileged symlink
  creation); the darwin guard logic is still exercised on every host by the non-symlink
  protected-folder test, which forces `platform: 'darwin'`.
- **Codex PR-review 3rd P1 (case-insensitive FS lets a differently-cased spelling evade
  the guard):** RESOLVED (boundary expansion, orchestrator-authorized 2026-07-13). On
  macOS's default case-insensitive APFS/HFS+ volume, a symlink target spelled
  `~/documents/vault` resolves on-disk to the protected `~/Documents/vault`, but the
  component-wise walker preserves the target's lowercase spelling and `tccguard.checkPath`
  compared path segments CASE-SENSITIVELY, so the candidate passed the pre-`lstat` guard
  and was then `lstat`-ed — hitting the real protected dir (the OS resolves case-
  insensitively) and reopening the exact TCC hang. Fixed at the correct home:
  `tccguard.checkPath` now matches protected prefixes case-insensitively (lowercased
  segment compare, still segment-wise so `DocumentsArchive` stays unprotected). Because
  the run-job walker guards every candidate via `checkPath` BEFORE any `lstat`, the now-
  case-insensitive check catches `~/documents` before it is stat-ed — no change to
  run-job.js was needed. Over-refusing on a rare case-SENSITIVE macOS volume is fail-safe
  (refusing a job beats a TCC hang). Boundary expanded to `src/scheduler/tccguard.js` and
  `tests/unit/scheduler-tccguard.test.js` (see Deliverables collateral rows).
- **Codex PR-review 4th P1 (case-insensitivity was incomplete — home-containment still
  case-sensitive):** RESOLVED (2026-07-13). The round-3 fix folded only the protected-
  PREFIX comparison, but `path.relative(home, p)` — which runs FIRST to decide home-
  containment — was still case-sensitive. A symlink target that varies the casing of a
  HOME component (`/users/ada/Documents/vault` vs home `/Users/ada`) made `path.relative`
  return a `..`-prefixed relative, so `checkPath` classified `p` as OUTSIDE home and
  returned "not protected" BEFORE the prefix check ran → passed → the walker then
  `lstat`ed the real protected `Documents` on the case-insensitive FS → TCC hang. Fixed
  by case-folding BOTH `home` and `p` ONCE at the top of `checkPath`
  (`path.relative(home.toLowerCase(), p.toLowerCase())`), so containment AND the prefix
  match are uniformly case-insensitive; the segment-wise boundary is kept
  (`documentsarchive` stays unprotected) and the real lstat/access elsewhere still uses
  the original-case path. Subsumes the round-3 prefix fix. Still no change to run-job.js.
- **Codex PR-review 5th P1 (APFS Data-volume firmlink spelling evades the guard) +
  proactive Unicode-NFC vector:** RESOLVED (2026-07-13). On macOS the user-data top-level
  dirs (`/Users`, `/private`, …) are FIRMLINKS onto the Data volume, so `lstat`/`realpath`
  surface `/System/Volumes/Data/Users/<user>/Documents/vault` as a distinct path that is
  outside BOTH `paths.home` and `resolvedHome` → the guard permitted it and `safeResolvePath`
  then stat-ed the real protected `Documents` → TCC hang. Same normalization class: APFS
  can spell one on-disk dir three ways — firmlink prefix, Unicode normal form (NFC vs NFD,
  reachable via a non-ASCII username in the home path), and case. Fixed at the single
  `checkPath` choke point via `normalizeForCompare`, applied to BOTH operands before the
  `path.relative` containment test and the prefix match. The proactive NFC fold (flagged
  by the round-4 lesson) is closed in the same pass. Protected prefixes are ASCII so the
  prefix list is unaffected; the segment boundary is kept. The real lstat/access still
  uses the original path — only the DECISION is normalized. Because the run-job walker
  guards every candidate via `checkPath` before any `lstat`, both the firmlink and NFC
  spellings are refused before the protected dir is stat-ed — no change to run-job.js was
  needed. Over-refusing where a variant is genuinely distinct is fail-safe.
- **Codex PR-review 6th P1 (normalization ORDER bug — firmlink strip ran before
  case-fold):** RESOLVED (2026-07-13). The round-6 `normalizeForCompare` stripped the
  exact-case `/System/Volumes/Data` prefix BEFORE `.toLowerCase()`, so a case-variant
  firmlink spelling (`/system/volumes/data/Users/<user>/Documents`) did not match the
  constant, was not stripped, then landed outside the lowercased home → passed → the
  walker `lstat`ed the real protected dir → TCC hang. Reordered `normalizeForCompare` so
  each step sees a fully-normalized input: (1) `.normalize('NFC')` → (2) `.toLowerCase()`
  → (3) strip the firmlink prefix matched against the LOWERCASED constant
  (`/system/volumes/data`). Reasoned through the whole pipeline: `checkPath` is the sole
  protected-ness decision; it applies `normalizeForCompare` identically to both operands
  before `path.relative` and the (lowercased-ASCII) prefix match, so every combination of
  case × Unicode × firmlink (in any spelling) collapses to one canonical form for both
  sides. No other site in the guard/resolver path does a raw comparison — the run-job
  walker delegates all protected-ness checks to `checkPath` and only does
  case/Unicode-agnostic structural path ops (join/dirname/parse) itself. No run-job.js
  change needed.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/095-tccguard-realpath-resolution`; conventional commits; PR titled
   `fix(run-job): resolve the vault's symlinks component-wise before the TCC guard (WP-095)` (the design deliberately AVOIDS `fs.realpathSync` — see the Exact contracts).
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
