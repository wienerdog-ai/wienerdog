# Security-audit working notes (fork context for future sessions)

**Last updated:** 2026-07-17

## Status: A0, A4, and A3 are COMPLETE (2026-07-17)

Audit action A0 landed as five reviewed work packages, WP-109..WP-113 (specs in
`docs/specs/done/`): the code-owned safety profile (`src/core/safety-profile.js`,
five capability gates, all BLOCKED, no runtime/env/flag override), the
`wienerdog safety` preflight, the GWS / `skill:`-routine / daily-Summary /
identity-auto-activation freezes, and the THREAT-MODEL **T0** section scoping the
product claims to the enforced gates.

Audit action **A4** landed as WP-114 + WP-115 (with the daily-Summary removal
already done by WP-112), both reviewer-approved (specs in `docs/specs/done/`,
convention in **ADR-0022**): `src/core/frontmatter.js` is the ONE strict
fail-closed parser (typed accessors, malformed→exclude + digest warning banner,
the digest's `=== 'true'` fail-open closed with a digest/validator differential
test), and all four former parser copies (digest, validator `parseFrontmatter` +
`skillBody`, config `readScalar`, layout `cleanValue`) delegate to it — the grep
gate (`!== '---'` / `indexOf(' #')`) returns only `frontmatter.js`. Full suite
green (891 tests, 0 fail).

Audit action **A3** landed as WP-116 + WP-117, both reviewer-approved (specs in
`docs/specs/done/`, boundaries in **ADR-0021**): the exact-byte identity trust
registry (`state/identity-approvals.json`, 0600, folded path keys / byte-exact
content hashes), the fail-closed digest hash-gate feeding the shared exclusion
banner, first-time-only seeding at attended `sync` (the dream never seeds), the
case-insensitive `isInjectedIdentity` freeze predicate (closing the WP-112
case-folding lesson), and the TTY-only `wienerdog memory approve` ratification
CLI (grant-model: no `--yes`/env/headless bypass). No capability gate opened —
`wienerdog safety` still shows all five BLOCKED. Full suite green (918 tests,
0 fail). Tracked follow-up from review: unify `sync.js`'s private
`readVaultPath` onto the shared `readScalar` (see ROADMAP note).

Next per the sequence below: **A6** (bounded streaming parser / digest / hooks).

This file is the durable, cross-session context for the security remediation
work. A session that starts here with no chat history should read this first,
then `00-SYNTHESIS.md` and `ACTION-LIST.md`.

## What this repository is

This is a **private fork** of the public upstream, used to version-control the
security audit and develop fixes before handing them back.

- `origin`  → `git@github.com:felho/wienerdog.git` (this **private** fork)
- `upstream` → `https://github.com/wienerdog-ai/wienerdog` (public original)

The upstream author is a personal collaborator who is **invited to this private
repo**. He works with agents too and reviews progress by checking out this repo
and analyzing its commits — he decides how/when to port fixes upstream. There is
therefore **no separate formal vulnerability report**; this private repo is the
coordination channel.

### Why not a public fork + public PR

The audit contains unfixed, exploit-level detail about a live tool. Publishing it
(public fork history or a public PR) before fixes land would disclose a working
attack recipe and violates upstream's `SECURITY.md` (which requires *private*
vulnerability reporting). Hence: private repo only.

## Working conventions (decided in-session)

- **Work directly on `main`.** No branch/PR ceremony inside this private fork —
  the collaborator reviews commits directly. Use clear, conventional commit
  messages so each change is legible as a standalone unit.
- Keep `main` rebased on top of `upstream/main` with our commits on top, so the
  diff we hand back stays clean and linear. (Baseline is currently upstream
  `v0.9.0`; our audit import sits on top.)
- Repo content is English; chat may be Hungarian.

## Baseline & upstream delta (as of 2026-07-17)

- Audit was performed against upstream commit `405afdd`.
- Our `main` is now rebased onto upstream **`v0.9.0` (`eccfa52`)**.
- Upstream changes between `405afdd..eccfa52` touched only:
  `src/cli/doctor.js`, `src/cli/init.js`, `src/cli/sync.js`, and a **new**
  `src/core/sandbox-guard.js` (WP-106/107/108 + the 2026-07-12 incident).

**None of the audit's P0 target files changed** (`brain.js`, `run-job.js`,
`validate.js`, `digest.js`, `transcripts/*`, `gws/*`). So the P0 program
(A0–A6) stands in full; v0.9.0 did **not** pre-empt any P0 finding. WP-106/107/108
are detection/hygiene diagnostics, not containment enforcement, and close no
audit gate.

## `src/core/sandbox-guard.js` — do not confuse with A1 containment

This module is **advisory only** ("never writes, never spawns, never prompts").
It prints an install-time warning when `WIENERDOG_HOME` redirects the core to a
non-default/temp location but the harness config dirs (`~/.claude`, `~/.codex`)
are not co-redirected (the 2026-07-12 "half-sandbox" reliability incident). It is
an **availability/operational** guard, **not** the security containment that
audit action **A1 (hermetic runtime profiles)** requires.

Implications for the fix work:

1. **Naming collision — must be managed.** In this codebase "sandbox" now means
   the `WIENERDOG_HOME` redirect check, while `docs/THREAT-MODEL.md` uses
   "sandbox" for dream execution containment. When implementing A1, use distinct
   terminology (e.g. "hermetic runtime profile" / "capability profile"); do **not**
   call the A1 security boundary a "sandbox." Update `docs/GLOSSARY.md` to
   disambiguate.
2. **Reuse, don't reinvent.** `physicalPath()` / `sameDir()` in `sandbox-guard.js`
   are a solid path-identity primitive (realpath the longest existing ancestor,
   re-append the absent suffix; handles symlink/case aliases on APFS). A1's
   staging-directory containment needs exactly this (keep writes inside staging,
   detect symlink/`..` escapes) — reuse it.
3. **Keep these guards.** `sandbox-guard.js` and the new `doctor.js` checks are
   complementary to the audit program; the fixes should not remove them.

## Suggested implementation sequence (from ACTION-LIST.md)

1. A0 freeze + explicit threat-boundary documentation (lowest-risk entry point).
2. A4 (daily-Summary removal + shared strict frontmatter parser) and A3 (identity
   approval + exact-byte hash registry).
3. A6 (bounded streaming parser / digest / hooks).
4. A5 (secret lifecycle + private modes).
5. A1 (hermetic runtime profiles + live negative harness).
6. A2 (GWS broker + least-scope credential migration).
7. Run all P0 adversarial scenarios → only then local dream-only dogfood.
8. A7–A10 before unattended/general use.
9. Clean-commit full audit rerun + explicit human go/no-go.

No intermediate green authorizes use; P0 completion permits only the limited,
local, dream-only manual evaluation profile (see the `ACTION-LIST.md` header).
