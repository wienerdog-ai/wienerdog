---
date: 2026-08-20
title: "WP-validator-decided-bytes PR #13 — both review gates, raw output"
related_wps: [WP-validator-decided-bytes]
---

# PR #13 — the two review gates (raw)

Per `docs/runbooks/codex-review.md`, "When it runs" (2): wd-reviewer is the
spec-fidelity merge gate and the Codex gate is an independent second opinion on
the same diff. Both ran on **PR #13**, head `837d67d`, base `main` at
`be3db29`.

**CI, all seven jobs green** before either gate reported: `boundary`,
`pr-title`, `lint`, `test` (ubuntu + macos), `smoke` (ubuntu + macos). Note the
CI `lint` is the stronger run — `shellcheck` and PSScriptAnalyzer execute there
and are skipped locally for want of binaries.

**Read-only, both gates:** each captured `git status --porcelain` at both ends
and reports them byte-identical. The relay held the tree still for the whole
window and committed nothing between launching them and their return — the
predecessor's round 7 was invalidated by exactly that mistake.

**Both gates ran the suite.** Neither verdict is a reading.

---

<!-- markdownlint-disable -->

## Gate 1 — Codex PR gate (gptsol, vendored `pr-rubric.md`, no focus text)

Verbatim:

```json
{
  "verdict": "approve",
  "summary": "Ship: the malformed-block guards cover the specified decision sites, both reason strings are accurate, and AC2 demonstrably distinguishes the shipped decision-site guard from the forbidden view-level design. Executed with exit 0: `git branch --show-current`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git status --porcelain=v1`, `tee`, `shasum -a 256`, `git diff --name-status`, `git diff --stat`, focused `git diff` commands for the spec, validator, and both test files, `git diff --check`, all inspection `grep`, `sed -n`, and `tail` commands, the exact-literal pipeline (`grep -Fof | sort -u | wc -l | tr -d`), `test`, and `cmp -s`. `node -e` fixture guard exited 0 with `parse.malformed=true, fieldsExposed=3`. `npm test -- --test-name-pattern \"dream-validate|frontmatter\"` exited 0: 186 passed, 0 failed. `npm test` exited 0: 2028 passed, 9 skipped, 0 failed; grep confirmed AC1, AC2, AC3, AC5, AC6, and both AC4 differential tests executed and passed. `npm run lint` exited 0: markdownlint and frontmatter checks passed; shellcheck and PSScriptAnalyzer were explicitly skipped because their local binaries are unavailable. Initial and final `git status --porcelain=v1` were byte-identical and empty, both SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.",
  "findings": []
}
```

## Gate 2 — wd-reviewer (spec-fidelity merge gate)

Verdict: **APPROVE**. Seven acceptance criteria verified, six of them by
running something rather than reading. Three findings, **none blocking**.

What it executed, in its own table: boundary-check (exit 0); `npm test` (2037
tests, 0 fail); `npm run lint`; `node --test` on both changed test files from a
`git archive HEAD` extraction in `/tmp` (145/145); the spec's fixture guard and
its quoted-heredoc literal step; `git diff --numstat` showing **zero deleted
lines** across all three implementation files; write-call parity base vs head
(`writeFileSync 3/3, appendFileSync 2/2, rmSync 9/9, mkdirSync 2/2,
renameSync 2/2, git(vaultDir 27/27`) with zero I/O or subprocess lines added.

**A four-mutant kill-set built from the HEAD tree** — M1 (tier-3 guard
deleted) → 2 fail; M2 (R1L→R1 at the ledger site) → 1 fail; M3 (one character
in R1) → 3 fail; **M4 (the forbidden view-level design actually shipped) →
4 fail**.

**On AC2, the criterion that was vacuous for four design rounds:** the test
compiles the forbidden design *from the shipped source* via two substitutions
each asserted unique, asserts the mutant's view empties, then asserts arm (a)
the mutant **admits and commits** and arm (b) the shipped guard **reverts with
R1**. Opposite outcomes on identical bytes — a discrimination, not the
prohibited weakened form.

**Prohibitions, all clean.** `parseFrontmatter` byte-identical to base, the
guard block sitting after its closing brace. Guard calls at head `:219`,
`:345`, `:354`, `:532` — four calls covering Table A's five rows. Placement
verified against base line numbers, so base `:332`'s raise-only read and base
`:353`'s promotion loop are unreachable with a malformed side. All 12
`readFileSync` sites preserved 1:1, shifted +33; base `:1170` → head `:1203`,
unmodified, its ENOENT fail-stop intact. Table A's "no other site" claim
verified: only four `parse(` call sites exist in the file, and `ledgerViolation`
routes the ledger's own bytes through `parseLedgerEntries`, never the
frontmatter parser.

It also probed a path the tests do not cover — a malformed **untracked new
skill draft** — end to end: reverted with R1, file gone, `registry skills: []`.

### The three findings

1. **[contract] `:1388` is a HEAD line number where the spec's convention is
   base-tree.** The enforcement append is base `:1355`. Three surfaces carry
   the wrong number consistently — AC7, the Out-of-scope bullet and the PR
   body — so it is mirror drift from one source. Non-blocking.
2. **[process] AC7 was rewritten after the flip to In-Review.** The reviewer
   notes an AC rewrite is a spec change. It *was* routed to wd-architect by the
   relay rather than repaired by the implementer, so the rule held; the reviewer
   could not see that from the diff. Its upstream point stands and is the
   valuable half: the "second run: zero changes" line is unconditional
   boilerplate in `_TEMPLATE.md`, apt in the three install-side done specs that
   carry it, and will keep landing unsatisfiable on non-install components.
3. **[quality] The AC2 mutant drives undocumented Node internals**
   (`Module._nodeModulePaths`, `m._compile`). The reviewer explicitly would not
   change it: the substitution anchors are asserted unique, so a refactor breaks
   the test loudly rather than silently restoring the vacuity. Plus a coverage
   nit — the untracked-draft path is verified by hand, not by a test.

### Closed-Contract Drift Check (ADR-0031)

No settled contract silently reinterpreted, no mirror promoted to primary.
Tables A and C remain the canonical sources and every registered mirror still
agrees with them. Finding 1 is a line-number mirror, not a contract fact. No
finding family repeated across rounds, so no canonical-extraction pass is
warranted.
