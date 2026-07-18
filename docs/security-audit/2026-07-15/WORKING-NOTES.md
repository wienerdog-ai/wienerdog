# Security-audit working notes (fork context for future sessions)

**Last updated:** 2026-07-18

## Status: A0, A4, A3, A6, and A5 are COMPLETE (2026-07-18)

> **A1 SPEC PHASE COMPLETE — implementation NOT started (2026-07-18).** Audit action
> **A1 (hermetic runtime profiles)** has been fully specced and walked through with the
> owner, but **no code is written yet**. **ADR-0025** is Accepted (+2 amendments), and
> **WP-128..WP-135** are all `status: Ready` (specs in `docs/specs/`, NOT `done/`):
> 128 profile registry + argv composer · 129 hook-free settings + vendored-skill
> integrity · 130 hermetic dream (staging cwd + absolute tier paths) · 131 hermetic
> routine (contained-inert until A2) · 132 managed-policy WARNING + run evidence · 133
> dev-time live negative harness · 135 pre-dream runtime self-check · 134 docs. The
> ROADMAP has the rows + A1 chain note + graph. **Resume point for a fresh session:**
> begin implementation at **WP-128** (TDD, tests first), then sequentially per the WP
> lifecycle below; the dependency chain is 128 → 129 → {130,131} → 132 → {133,135},
> 134 → all. Load-bearing runtime facts already measured (see the A1 lessons in
> `memory/lessons/inbox.md`): empty `--tools` exposes ALL built-ins (use an explicit
> allowlist); `--setting-sources ""` excludes the user source; `--append-system-prompt`
> delivers the vendored skill; the containment probe judges by the structured
> `permission_denials` field + canary ground truth, NEVER an output magic-string. A1
> opens NO gate — `wienerdog safety` must stay all-BLOCKED. This Status header flips to
> "A1 COMPLETE" only when all eight WPs are Done (implemented + reviewed), per the A5
> precedent.

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

Audit action **A6** landed as WP-118..WP-121, all reviewer-approved (specs in
`docs/specs/done/`, boundary in **ADR-0023**, Accepted): transcript intake is
bounded and streaming (`src/core/transcripts/stream.js` — 50 MB pre-read
ceiling, 1 MB line cap, 500k lines, fixed 200 MB run budget, depth 64; zero
`readFileSync` in transcripts/), the scalar watermark is replaced by the
per-file quarantine ledger (`state/transcript-ledger.json`, 0600, fail-safe
skip semantics, no-negative-record capacity deferral — the WP-048/069
starvation-class fix; `watermarks.json` migrated once, retired but not
deleted), the digest is capped for real (120 lines / 32 KB / 8 KB per note /
50 projects, control-plane banner prefix never truncated), and all three
session hooks are code-enforced fail-open (22-case subprocess harness, 1 MB
stdin bound). Review rounds fixed, test-first: an exact-EOF budget boundary
bug, a hostile-basename markdown injection into the digest banner (shared
`displayName` whitelist sanitizer), and two dry-run persistence leaks
(quarantine record + one-time migration — owner ruling: a preview run must
not permanently mutate state). No capability gate opened — `wienerdog
safety` still shows all five BLOCKED. Full suite green (1002 tests, 0 fail).

Audit action **A5** landed as WP-122..127, all reviewer-approved (specs in
`docs/specs/done/`, boundary in **ADR-0024**, Accepted): the ONE shared
detector (`src/core/secret-scan.js` — `scanAndRedact` → sanitized text +
metadata-only findings, total/fail-closed, byte-bounded linear-time patterns,
byte-compatible with the old REDACTIONS list); EP1 pre-brain redaction now
delegates to it and `source_path`/`cwd` are home-pseudonymized + capped; EP2
scans each staged file's added lines pre-commit and — per TWO in-flight
spec-gap rulings (`fa243a1` any-finding, `610a3bd` binary fail-closed) —
quarantine-preserves into `state/quarantine/` (0700/0600) then reverts on ANY
finding, never rewriting; EP3 chunk-redacts brain/run-job output into the
durable log + stderrTail, scrubs alert fields, and the fail-loud email body
is code-owned (no raw log tail); EP4 omits any digest section with a finding
into the one identityWarn banner (mirror ruling `b0d978c`) plus the
state-driven pending-review and insecure-modes banners; WP-126's
`private-fs.js` makes the A5 artifact set 0700/0600 independent of umask
(sync repairs, doctor reports, nightly path read-only, symlink-safe sweep,
secrets/ untouched — A5/A9 boundary held); WP-127 shipped the honest docs
(T4 rewrite, residual bullet, vault-local/no-auto-push posture,
`docs/runbooks/secret-incident.md`, glossary terms). `hasHardFinding` is
exported but no shipped gate branches on it (persistence gates key on
`findings.length > 0`; EP1/EP3 use `redactOnly`). No capability gate opened
— `wienerdog safety` shows all five BLOCKED. Full suite green (1077 tests,
0 fail). Known residuals, all owner-accepted and documented: chunk-boundary
split secrets (EP3), per-run log FILE creation mode under umask until the
next sync repair (A9 follow-up), win32 POSIX-modes posture, and the
pre-existing project-dir-name markdown injection into the digest body
(future WP, noted in the WP-125 close commit).

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

### WP lifecycle in this fork (proven on WP-114..117, 2026-07-17)

The A4+A3 run established this flow; follow it for the remaining actions
(A6, A5, A1, A2, A7–A10) unless the owner says otherwise.

1. **Spec phase (wd-architect).** The architect turns the next audit action into
   WP specs (+ ADR when a durable boundary is being decided), following the
   format of `docs/specs/done/WP-114..117`. Then a **per-ticket owner
   walkthrough**: for each WP, the session gives the owner a self-contained
   explanation (no pointer-chasing), surfaces every decision point, and the
   owner's calls are recorded IN the spec/ADR as dated `OWNER-APPROVED`
   decisions — never left only in chat. One ticket open at a time; ADRs are
   discussed as their own item.
2. **Implementation phase (per WP, sequentially).**
   `chore(specs): mark WP-XXX Ready` commit → TDD (tests first, red, then
   implement) → full `npm test` + `npm run lint` + `node bin/wienerdog.js
   safety` green → one `feat`/`refactor` commit containing the implementation
   AND the spec's `In-Review` flip, with "Decisions made" and `Generated-by:`
   in the commit body.
3. **Review phase (wd-reviewer).** Review the implementation commit strictly
   against the spec's Deliverables table / contracts / acceptance criteria,
   re-running all verification commands and probing adversarially. Findings are
   fixed test-first in follow-up commits and re-verified by the SAME reviewer
   before closing.
4. **Close.** `status: Done` flip + `git mv` of the spec to `docs/specs/done/`
   (run an explicit `git add` on the moved file after the edit — `git mv` stages
   the pre-edit index blob) + ROADMAP row → Done, in one `chore(specs)` commit.
   When an audit ACTION completes (all its WPs done), update this file's Status
   section in a `docs(security)` commit.
5. **Spec-gap protocol.** If implementation surfaces a spec error (grep gate
   catching unknown files, a missing deliverable, a self-contradictory
   instruction), the implementer does NOT cross the deliverables boundary —
   the gap goes back to wd-architect for a dated amendment (owner in the loop),
   and only then does implementation continue. This fired three times in the
   A4+A3 run and worked each time.
6. **Lessons.** At session end the owner-side session appends the run's lessons
   to `memory/lessons/inbox.md` on main (one bullet per lesson, WP-prefixed)
   and pushes.

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
