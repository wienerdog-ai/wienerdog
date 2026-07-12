---
id: WP-095
title: Realpath-resolve the vault path before the TCC guard so a symlinked vault can't reintroduce the unattended hang
status: Draft
model: sonnet
size: S
depends_on: []
adrs: []
branch: wp/095-tccguard-realpath-resolution
---

# WP-095: TCC-guard realpath resolution

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
| modify | src/cli/run-job.js | realpath-resolve BOTH the vault path and home (best-effort) and guard in matching domains — (literal vault, literal home) AND (resolved vault, resolved home) |
| modify | tests/unit/scheduler-runjob.test.js | tests: a symlinked vault pointing under a protected folder is refused; and refused too when home is reached via a symlinked component |

### Exact contracts

Resolve BOTH the vault path and home before guarding, and guard in **matching
symlink domains**: (literal vault, literal home) AND (resolved vault, resolved
home). Comparing a resolved vault against an UNresolved home is unsound — if
`paths.home` itself contains a symlinked component, `realpathSync(vaultDir)` may no
longer sit beneath the literal home, so `checkPath` computes a `..`-prefixed
relative, classifies the vault as "outside home", and misses the protected prefix
(the exact hole this WP closes):

```js
const vaultDir = readDreamConfig(paths.config).vault; // throws if no vault configured
const cwd = vaultDir;

// Resolve symlinks before the TCC check: a vault symlinked INTO a protected folder
// (e.g. ~/vault -> ~/Documents/vault) would otherwise pass the literal-path guard
// and then hang unattended exactly as the guard exists to prevent (scheduler #3).
// Best-effort: realpathSync throws if a path is absent — fall back to the literal
// (a nonexistent vault fails later for other reasons; do not crash the guard).
// Resolve home into the SAME canonical domain as the resolved vault so the two are
// comparable even when home itself has a symlinked component.
let resolvedVault = vaultDir;
try { resolvedVault = fs.realpathSync(vaultDir); } catch { /* keep literal */ }
let resolvedHome = paths.home;
try { resolvedHome = fs.realpathSync(paths.home); } catch { /* keep literal */ }

// Two domain-matched checks; refuse if EITHER trips. Literal-vs-literal catches a
// directly-configured protected path; resolved-vs-resolved catches a symlinked vault
// (and holds even when home has a symlinked ancestor).
const gLiteral = tccguard.guard([vaultDir, cwd], paths.home, opts.platform);
const gResolved = tccguard.guard([resolvedVault], resolvedHome, opts.platform);
const g = gLiteral.ok ? gResolved : gLiteral;
```

`fs` is already imported by `run-job.js`. The rest of the refusal block is
unchanged; `g.offending` names whichever path (literal or resolved) is under a
protected prefix, which is still an accurate, actionable message.

Behavior:
- Non-symlinked vault under `~/wienerdog`: both checks pass (unchanged).
- `~/vault` → `~/Documents/vault` (home not symlinked): `gResolved` trips on the
  resolved vault under `Documents` → refused, fail-loud, exit 1 (the fix).
- `~/vault` → `~/Documents/vault` where `~` itself resolves through a symlink
  (e.g. `/var/home` → `/home`): resolved vault AND resolved home share the real
  `/home/...` domain, so `gResolved` still sees `Documents/vault` → refused (the
  domain-matching fix; a resolved-vault-vs-literal-home check would have MISSED it).
- Direct configured `~/Documents/vault`: `gLiteral` refuses (unchanged).
- Missing vault/home path: realpath falls back to the literal; behavior unchanged.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Do NOT change `tccguard.js` — the guard already documents that the caller
  resolves symlinks; this WP fulfills that contract at the one relevant call site.
- Keep the change surgical: only add the realpath resolution and include the
  resolved path in the guarded list. Do not change `failLoud`, the state write, or
  the refusal message text.
- The test must not touch a real protected folder — construct a temp `home`, a temp
  target dir named to look protected relative to that home (e.g.
  `<home>/Documents/vault`), and a symlink `<home>/vault → <home>/Documents/vault`,
  then assert `runJob` refuses (mirror the existing tccguard/run-job test seams;
  pass `opts.platform: 'darwin'`).

## Security checklist

- [ ] The vault path AND home are realpath-resolved before the TCC guard, and the
      checks run in matching domains — (literal vault, literal home) AND (resolved
      vault, resolved home) — so a vault symlinked into a TCC-protected folder is
      refused (fail-loud) EVEN WHEN home has a symlinked component; not silently run
      into an unattended prompt hang (T6).
- [ ] Resolution is best-effort (falls back to the literal on `realpathSync` throw)
      so a missing/odd vault or home path never crashes the guard.

## Acceptance criteria

- [ ] A vault symlink whose target is under a (test-relative) protected prefix is
      refused by `runJob` on `darwin` (writes error state, fail-loud, throws).
- [ ] The same is refused when the test `home` itself is reached through a symlinked
      component (resolved vault + resolved home share the real domain) — the
      domain-matching case that a resolved-vault-vs-literal-home check would miss.
- [ ] A vault under a non-protected location still runs (both checks pass).
- [ ] A directly-configured protected path is still refused (unchanged).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "runjob|tccguard|run-job"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Guarding "indirect paths used later by the dream" beyond the vault/cwd — the
  vault is the job's root; that broader sweep is not in scope.
- Any change to `tccguard.js` or the protected-prefix list.
- run-job watchdog-kill / clean-PATH robustness (scheduler #4/#11) — separate.

## Round-2 dispositions

- **Codex round-2 P2 (resolved vault vs unresolved home compared in different
  symlink domains):** RESOLVED. Home is now realpath-resolved into the same
  canonical domain as the resolved vault, and the guard runs two domain-matched
  checks — (literal vault, literal home) and (resolved vault, resolved home),
  refusing if either trips — instead of a single mixed-domain
  `guard([vault, cwd, resolvedVault], paths.home)` call. `tccguard.js` is unchanged.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/095-tccguard-realpath-resolution`; conventional commits; PR titled
   `fix(run-job): realpath-resolve the vault before the TCC guard (WP-095)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
