---
title: Audit group C ruling — verbatim harvest from the war-room record
date: 2026-08-31
related_wps: [WP-audit-c-close-disposition]
---

<!-- markdownlint-disable -->

# 2026-08-31 — audit group C ruling, harvested verbatim

**Why this entry exists:** the audit-remediation program's working record
(the "war-room" branch) is retired at handover; its durable rulings live on
main in canonical tables, ADRs and specs. This is the ONE section a pending
WP still needs as source material: `WP-audit-c-close-disposition` must
measure the original group C findings (M7 harness-instruction persistence,
M9 git control state inside the write fence, M10 gitignored/invisible paths)
against the landed promote-in architecture. The text below is the group C
ruling of 2026-08-05, copied byte-for-byte from the war-room record — a
historical document: its file:line citations were measured on the 2026-08-05
tree and MUST be re-measured before use. Note that the fix it prescribes
(the structural-denial fence) was later SUPERSEDED by the promote-in
inversion; the FINDINGS and their measured bases are what this harvest
preserves, not the fix design.

---

### Group C — RULED 2026-08-05: KEEP, one work package, structural denial

Build list item 3 of 4–6. One root cause for all three findings: the
dream's write fence has no notion of *files that control the machinery*,
so `isTier3` (`validate.js:1056-1057`, identity- and skills-prefix only)
misses them and they fall through the keep-everything branch at `:1175`.

**Verified on today's tree.** Instruction files: a vault-root
`CLAUDE.md`/`AGENTS.md` is kept and committed; the *automated* consumer
is unreachable — the only `harness: 'codex'` call sites are in
`src/core/transcripts/codex.js` (Codex as a transcript *source*), no
caller passes it to the brain, the Claude path uses a neutral staging
dir, and `routine-runtime.js` has zero `vaultDir` references. Git
control state: zero `.git` carve-out anywhere; the validator runs
`git add`/`git commit` in the vault repo with the parent process's
privileges and unfiltered env, no `--no-verify`, no neutral hooks path.
Invisible region: `git status --porcelain -z -uall` at `:988` has no
`--ignored`, `git clean -fd` at `:148` is deliberately not `-x` (comment
at `:141-143`), and `.gitignore` itself falls through case (c).

**Not verifiable today, and the WP must not rest on it:** the archive's
harness-refusal measurement for `.git` writes needs a live dream run
with a real third-party CLI. The WP either re-measures it or does not
depend on it — a borrowed defense from software this project neither
owns nor tests cannot carry the finding on an unverified measurement.

The fix, structural rather than enumerated (the era measured twice that
"a wider enumeration is still an enumeration"):

1. **No write to any path with a dot-prefixed segment.** One rule
   covering `.git/`, `.gitignore`, `.claude/`, `.obsidian/`,
   `.smart-env/` — a class, not a list, so future control directories
   are covered without maintenance. Verified safe: all seven default
   layout targets are dot-free (`06-Identity`, `07-Daily`,
   `01-Projects`, `05-Skills`, `reports/dreams`, `00-Inbox`).
2. **No write to an AI-instruction filename at any depth** (`CLAUDE.md`,
   `AGENTS.md` and the like). Accepted as a name list with a **named
   residual**: an unknown tool's instruction file passes. Deliberate —
   no structural marker like the dot prefix exists here, and hunting a
   harder solution is not worth lengthening the WP.
3. **Config-side: reject dot-prefixed layout values**, so the write rule
   is unconditional. Concrete site named so no new validator gets
   written: `isSafeRelativePath` (`src/core/layout.js:65-71`) already
   rejects empty, absolute, backslash and `..` values, and `:115-118`
   falls back per key to the built-in default. The dot condition is one
   more line there. Note in the spec: the fallback is **silent** by the
   existing contract — inherited behaviour, not new, and not to be
   changed here.
4. **Own, third-party-independent defense at the git seam:** commit with
   `--no-verify` and a neutralized hooks path. Precisely because the
   present defense is borrowed and currently unverifiable.
5. **Close the generator, not the symptom, at the invisible region.**
   `-x` is rejected: the default ignore set covers real user data
   (`src/core/adopt-git.js:16-20` — Obsidian plugin binaries,
   `workspace*`, `.DS_Store`, `.trash/`), and deleting it would cause
   harm. Rule 1 prevents the dream from creating the ignored region at
   all. `--ignored` on the status call may be added as optional
   *detection*, explicitly not load-bearing.

**Coverage-rule gap, handled in-spec rather than as its own item:** the
instruction-file denial protects a path whose caller is the user's own
tooling, structurally outside this repository, so the template's
`file:line` caller-chain form cannot express it. The C spec's Coverage
cell states the form: name the protected path, and state that the caller
is structurally out-of-repo so no `file:line` is available. If the case
recurs in the remaining triage, it is raised to rule level; one
occurrence is not a rule.

Budget: A = 1, B = 1, C = 1.

