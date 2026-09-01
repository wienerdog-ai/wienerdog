---
id: WP-audit-c-close-disposition
title: Measure C2 (git seam) and C3 (layout) against the landed promote-in architecture and close group C
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0029, ADR-0031]
epic: audit-close
---

# WP-audit-c-close-disposition: measure the group C findings and record their disposition

## Dispatch precondition

**ONE OWNER RATIFICATION, and it blocks dispatch.** Recording a disposition is a
finding of fact and needs nobody's signature; **formally closing an audit group is
the owner's act.** The owner ratifies one thing: **that group C closes on the
measured basis of Table D, with C3's residual carried out as its own Draft WP
rather than holding the group open.**

The recommendation, with its basis: M7, M9 and M10 all measure **mooted** on
`49d3d467` — every mechanism the 2026-08-05 ruling named is gone, retired by the
promote-in inversion (Table D). What survives is one narrower residual, C3, whose
exploit needs a value only the user's own `config.yaml` can supply, and which
`src/core/dream/promote.js` already defers to this disposition by name.

**Declining is a flag flip, not a redesign — and only because Table E pre-writes
both cell texts.** It changes one deliverable cell (`docs/HANDOVER.md`'s group C
row: E2 instead of E1) and the one variable that checks it — V6's `RULING`,
which selects E1's or E2's fixed string and fails on the other. Table D is
unaffected: the three findings are mooted either way, and only the closure waits
on `WP-layout-dot-prefix-rejection`. **The dispatch message records the ruling,
and V6's `RULING` must be set to it.**

## Context (read this, nothing else)

Wienerdog is an installer that writes files: a CLAUDE.md/AGENTS.md managed block,
a markdown **vault**, skills, hooks and OS-native schedules. **Wienerdog is just
files (ADR-0004)** — nothing here starts a process that outlives its job. The
nightly **dream** run is a CLI process that consolidates recent sessions into the
vault and exits.

A security audit ruled five remediation groups, A–E. **Group C** was "the dream
write fence": the dream could write files that control the machinery. Its three
findings, whose measured bases are preserved verbatim in
`docs/specs/logbook/2026-08-31-audit-group-c-ruling-harvest.md`:

- **M7 — harness-instruction persistence.** A brain-written vault-root
  `CLAUDE.md`/`AGENTS.md` was kept and committed; the fence's `isTier3` predicate
  was identity- and skills-prefix only, so instruction files fell through its
  keep-everything branch.
- **M9 — git control state inside the write fence.** No `.git` carve-out
  anywhere; the validator ran `git add`/`git commit` in the vault repo with the
  parent's privileges and unfiltered env, no `--no-verify`, no neutral hooks path.
- **M10 — the gitignored/invisible region.** Classification ran `git status
  --porcelain -z -uall` with no `--ignored`, cleanup ran `git clean -fd` (not
  `-x`), and `.gitignore` itself fell through the keep branch — so a dream that
  wrote `.gitignore` could blind every gate.

The group was split C1 (the fence) → C2 (the git seam) → C3 (layout), serialized.
**C1's fix was superseded before it shipped.** What landed instead is the
promote-in inversion, five WPs now in `docs/specs/done/`: the brain writes a
**workspace**, never the vault; only promoted content enters the vault, through
one identity-anchored chokepoint; and the run's own git calls are default-deny
shape-pinned. **C2 and C3 were never dispositioned.**

This work package dispositions them. **It is a measurement and recording pass: it
changes no behaviour and touches nothing in `src/` or `tests/`.** The measurements
below were taken by the architect on `49d3d467`; the implementer re-runs them and
records the result. Where a measurement disagrees with Table D, that is a spec
bug — say so in the PR and stop; do not adjust the table to match.

**One honesty rule, inherited from the ruling and binding here.** The archive's
harness-refusal measurement for `.git` writes was explicitly ruled
**non-load-bearing** — it rests on unverified third-party behaviour this project
neither owns nor tests. **No disposition rests on it, and none may** — every
Table D cell rests on a command in Verification steps, run on this tree.
**Naming it as excluded is required, not forbidden**, and only in that form: the
logbook must state this rule (V6 (b) fails if it does not), on lines that also
carry the words `non-load-bearing`; the stub and `docs/HANDOVER.md` must not
mention it at all.

## Current state

Measured by the architect on `49d3d467` with the Verification-steps commands.
Table D is the canonical record; this section reports only what the commands
printed, and defers every judgment to that table.

- `src/core/dream/promote.js` exports `makeAdmit`, the **positive allowlist**
  (row C9) handed to `writeIntoVault` as its `admit` callback. Probed: it refuses
  `CLAUDE.md`, `AGENTS.md`, `06-Identity/CLAUDE.md`,
  `06-Identity/agents.override.md`, `.claude/settings.json`, `.codex/x.md`,
  `.mcp.json`, `.gitignore`, `.git/config`, `.git/hooks/note.md`, and admits
  `06-Identity/notes.md` and `reports/dreams/2026-09-02.md`.
  `src/core/dream/vault-write.js` owns **no policy**: it throws when `admit` is
  absent (`:210-211`) and calls it on the **resolved** path (`:333`).
- `src/core/dream/validate.js` has **no `git add` and no `git commit`**; its
  remaining `git(vaultDir, …)` sites are `rev-parse --git-dir`, `status
  --porcelain -uall`, `reset --hard HEAD` and `clean -fd`. Of those,
  `assertCleanTree` and `restoreVaultToHead` have **no consumer in `src/`** — the
  module's export comments state that as the contract (`:1166-1177`);
  `assertGitRepo` is still called once, at `src/cli/dream.js:587`.
- The run's commit is `commitNamedSet` (`src/cli/dream.js`), which never invokes
  `git commit`: it hashes each approved buffer with `hash-object -w --stdin`,
  builds a tree in a **private index** outside the vault's `.git`
  (`GIT_INDEX_FILE`), and publishes with `commit-tree` + `update-ref`.
  `tests/unit/dream-pipeline.known-calls.js` pins the run's git surface to **nine
  shapes**, default-deny; none is `add`, `commit`, `clean`, `reset`, `status` or
  `stash`.
- `src/core/dream/delta.js` — the classifier — requires only `node:fs`,
  `node:path` and `../errors`. **No route to a process spawner**, so
  classification never consults git.
- `src/core/layout.js`'s `isSafeRelativePath` (`:65-71`) rejects empty, absolute,
  backslashed and `..` values. **It does not reject a dot-prefixed value.**
  Probed: a `config.yaml` carrying `projects_dir: .git` is returned unchanged by
  `readVaultLayout`, and `makeAdmit` on that layout **admits
  `.git/hooks/note.md`**. `promote.js` states the deferral in place:
  *"Deliberately NOT a dot-rule: audit finding C3 owns the layout dot-rule and
  its notice."*
- `grep -rl '^| C | Dream write fence' docs --include='*.md'` returns **exactly
  one** file, `docs/HANDOVER.md` — the check V6 re-runs, and the only sense in
  which "no successor tracking doc exists" is asserted anywhere here. Its group C
  row today reads *"Structurally closed by the promote-in family … Remaining:
  formal C2/C3 disposition — see `WP-audit-c-close-disposition`"*.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | docs/specs/logbook/2026-09-02-audit-group-c-disposition.md | the disposition record; frontmatter `date:`, `title:`, `related_wps: [WP-audit-c-close-disposition, WP-layout-dot-prefix-rejection]`. If the implementation day differs, use that day's date in the filename — `docs/specs/logbook/` is boundary-free either way, and the verification resolves the file by glob |
| create | docs/specs/WP-layout-dot-prefix-rejection.md | the Draft stub for C3, the one **open** finding (Table D row D5) |
| modify | docs/HANDOVER.md | **the group C row's Status cell only** — Table E's text for the ruling the dispatch recorded (E1 ratified, E2 declined). No other cell, no other line |

### Exact contracts

**The logbook entry** carries, and nothing more: (1) one paragraph naming the
tree measured (`49d3d467`) and the honesty rule above; (2) **Table D reproduced
in full**; (3) the command output pasted for each of V1–V5; (4) the owner's
ratification of the Dispatch precondition, quoted, with its date.

Reproducing Table D is a **transfer of ownership, not a duplicate**: this spec is
Table D's authority while it is being worked, and on the flip to Done the logbook
entry becomes it — which is why Table E's HANDOVER cell cites the logbook and not
this file. Anything that later changes a disposition changes the logbook entry.

**The C3 stub** is a Draft stub in the sense `docs/HANDOVER.md` defines — context,
intent, known traps and a done-definition, **not** a reviewed spec. It uses
`docs/specs/_TEMPLATE.md`'s frontmatter verbatim as:

```yaml
---
id: WP-layout-dot-prefix-rejection
title: Reject dot-prefixed vault_layout values so a dot directory can never become a promotion target
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: audit-close
---
```

Its body states, each with the fact inlined rather than referenced:

1. **The mechanism, measured.** `isSafeRelativePath` (`src/core/layout.js:65-71`)
   rejects empty, absolute, backslashed and `..` values but not a dot-prefixed
   one; `readVaultLayout` therefore returns `projects_dir: .git` unchanged, and
   `makeAdmit` on that layout admits `.git/hooks/note.md`. Reproduce with V5, not
   from this sentence.
2. **The fix is one condition** at that single site — the 2026-08-05 ruling named
   the site so that nobody writes a second validator.
3. **The inherited notice, not to be changed there.** The per-key fallback to the
   built-in default is **silent** by the existing contract; a dot rejection
   inherits that silence. Whether to notify is that WP's decision to take
   deliberately, not to absorb by accident.
4. **The threat model, at its real size — and ADR-0004 is what bounds it, which
   is why the stub carries that tag.** `config.yaml` lives in the Wienerdog core
   directory (`src/core/paths.js:67`), outside the vault, and is not promotable
   (no `.md`, no tier directory). The value is the user's own. **Wienerdog is
   just files**: nothing resident re-reads that config, so a bad value is read
   by one CLI run that then exits — the exposure is a run, not a residency, and
   the fix is a validation condition rather than anything that watches. So this
   is defence in depth against a misconfigured or tampered config, not a live
   brain-reachable path. **Sizing it honestly is why C3 did not hold group C
   open.**
5. **The pointer that must move with it.** `promote.js`'s *"audit finding C3 owns
   the layout dot-rule and its notice"* is a live deferral to this WP; landing
   the fix means updating it in the same pass.

## Contract reference

Activation (ADR-0031's 2-of-7 test) — **four** of seven fire, so the discipline is
on: (ii) a result taxonomy is **introduced** (mooted / open, each with a required
retiring cause); (v) the task **crosses an authority boundary** — the implementer
records a finding of fact, the owner rules the closure; (vi) **downstream
consumers inherit** the dispositions (the C3 stub, `WP-dream-git-env-pinning`,
the HANDOVER row); (vii) the **same facts appear in multiple mirrored surfaces**
(logbook, HANDOVER, stub, acceptance criteria, verification).

### Table D — the disposition of audit group C

The single place every disposition fact is decided. A **mooted** row names what
retired the mechanism and where protection lives now; an **open** row names its
successor WP. Every "measured" cell is the output of the verification step named
in its last column, and of nothing else.

| # | Finding | Mechanism, as ruled 2026-08-05 | Measured on `49d3d467` | Disposition | Where protection lives now / who owns the residual | Step |
|---|---------|--------------------------------|------------------------|-------------|---------------------------------------------------|------|
| D1 | **M7** — harness-instruction persistence | the brain writes a vault-root `CLAUDE.md`/`AGENTS.md`; `isTier3` misses it; it is kept and committed | the brain never writes the vault. `makeAdmit` refuses `CLAUDE.md`, `AGENTS.md`, `06-Identity/CLAUDE.md`, `06-Identity/agents.override.md`, `.claude/settings.json`, `.codex/x.md` and `.mcp.json`; `vault-write.js` throws without an `admit` and applies it to the **resolved** path | **MOOTED** | **Retired by the promote-in inversion.** Protection is `src/core/dream/promote.js`'s row C9 positive allowlist (`makeAdmit`): admission needs a writable tier directory **and** an `.md` extension, so a vault-root instruction file is outside it without anyone enumerating it. **`admit` is the only gate on what reaches the vault** — the primitive owns no policy of its own (measured cell), so nothing bypasses row C9. **Named residual, accepted at ruling time and carried in the code** — the `promote.js` comment beginning *"This is a deny-list, and it is stated as one that will NOT cover the next convention"*, cited by literal because line ranges rot: the instruction-basename deny-list will not cover a future tool's convention *inside* a tier directory | V1 |
| D2 | **M9** — git control state inside the write fence | the validator runs `git add`/`git commit` in the vault repo, parent privileges, unfiltered env, no `--no-verify`, no neutral hooks path | `validate.js` has no `add` and no `commit`; the run never invokes `git commit` at all. The pinned set is nine shapes, default-deny, carrying none of `add commit clean reset status stash` | **MOOTED** | **Retired by `commitNamedSet`** (`src/cli/dream.js`): private index + `commit-tree` + `update-ref`. `--no-verify` has nothing to suppress — with no `git commit`, the pre-commit and commit-msg hook path is **structurally absent**, not disabled. **Two residuals, both already owned, neither reopened here:** (a) **hooks** — exactly one pinned shape (`update-ref`) can fire one (`reference-transaction`); ruled **out of scope by the owner, 2026-08-31**, recorded in `WP-dream-promote-in-workspace` Table W row W1, which also rejects `core.hooksPath` suppression by name on ADR-0004 grounds; (b) **env** — the run spawns git with `{...process.env, GIT_INDEX_FILE}`, so an exported `GIT_DIR`/`GIT_WORK_TREE` still propagates. Owned by **`WP-dream-git-env-pinning`** (Draft, a registered product-hardening candidate awaiting an owner product decision). **Not a residual:** `assertGitRepo` (`cli/dream.js:587`) is a live `rev-parse --git-dir` into the user's vault, off the pinned seam and named as such in row W1(c)(i) — it is read-only and writes no control state, so M9's mechanism does not reach it | V2 |
| D3 | **M10** — the gitignored/invisible region | `git status … -uall` without `--ignored` classifies; `git clean -fd` (not `-x`) cleans; a dream-written `.gitignore` blinds both | `delta.js` requires only `node:fs`, `node:path`, `../errors` — no route to a process spawner. `assertCleanTree` and `restoreVaultToHead` have no `src/` consumer. `makeAdmit` refuses `.gitignore` and `.git/config` | **MOOTED** | **Retired by the git-free classifier.** Classification is `computeDelta`, a filesystem walk that never consults git, so an ignore file has nothing to blind — the mechanism is **absent, not defeated**. `.gitignore` is additionally unpromotable (no `.md`). **Standing-discipline note:** `restoreVaultToHead`'s `clean -fd` still exists and is exported for fixtures; it is unreachable from `src/`. **A future WP that re-wires it re-opens M10's `-fd`-not-`-x` question** and must re-run V3 and V4 | V3, V4 |
| D4 | **C2** — the git seam | ruling item 4: give the seam its own third-party-independent defense — commit with `--no-verify` and a neutralized hooks path | subsumed by D2: there is no `git commit` to harden, and the two remaining halves are the hook residual (owner-ruled) and the env residual (`WP-dream-git-env-pinning`) | **MOOTED** | Nothing new is owed. C2's own-defense half is void by construction; its two residuals are D2's, with their owners named there. **This row states no fact of its own — it exists so C2 is not silently absent from the disposition** | V2 |
| D5 | **C3** — layout | ruling item 3: reject dot-prefixed layout values in `isSafeRelativePath`, so the fence's dot rule is unconditional | `isSafeRelativePath` has no dot condition; `readVaultLayout` returns `projects_dir: .git` unchanged; `makeAdmit` on that layout **admits `.git/hooks/note.md`** | **OPEN** | Carried out as its own Draft WP, **`WP-layout-dot-prefix-rejection`** — created by this WP, not fixed inside it. The ruling's *purpose* for item 3 (making a dot **write** rule unconditional) died with the superseded fence, but the mechanism outlived it: `admittedDirs` reads the six layout directory keys straight from config and row C9 clause (a) admits under them. `promote.js` defers to this finding **by name**, so declaring it mooted would leave a dangling pointer in shipped code | V5 |

### Table E — the group C row in `docs/HANDOVER.md`

The group C row has three cells. **Only the third — Status — changes**, replaced
verbatim with the text this table gives for the owner's ruling; the `C` and
`Dream write fence (machinery-controlling files)` cells stay byte-identical, and
no other line of `docs/HANDOVER.md` is touched. Neither text re-lists the five
Done promote-in slugs the current row names — see the ADR-0029 note under
Implementation notes — so both point at the logbook entry instead. `<LOGBOOK>` is
the created entry's repo-relative path.

| # | Ruling | The Status cell, verbatim |
|---|--------|---------------------------|
| E1 | **ratified** — group C closes | **Closed** — dispositioned against the landed promote-in architecture; measured basis per finding in `<LOGBOOK>`. One residual carried out as its own Draft WP: `WP-layout-dot-prefix-rejection` |
| E2 | **declined** — the residual holds the group open | **Open — one residual** — M7, M9 and M10 measure mooted; basis per finding in `<LOGBOOK>`. The group stays open until `WP-layout-dot-prefix-rejection` lands |

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table D or Table E. A finding updates the
table **and** every mirror below in one pass; a new mirror found in review is
registered here on the spot.

- [ ] **Deliverables-table cells** — the logbook row (mirrors D1–D5 as its
      content contract), the stub row (mirrors D5's "open" verdict and successor
      id), the HANDOVER row (mirrors Table E's Status-cell-only rule).
- [ ] **Acceptance criteria** — AC1 (mirrors D1–D3's verdicts), AC2 (mirrors D5),
      AC3 (mirrors Table E's Status cells), AC4 (mirrors D2's two residual
      owners), AC5 (mirrors the Context's honesty rule).
- [ ] **Verification commands** — V1 mirrors D1's measured cell, V2 mirrors D2/D4,
      V3 and V4 mirror D3, V5 mirrors D5. **V6 mirrors the most and is checked
      first on any finding**: the Deliverables, Table E's two Status cells (via
      its `RULING` switch), AC3–AC6, and the Implementation notes'
      tracking-doc-uniqueness grep.
- [ ] **Current state** — mirrors every "Measured on `49d3d467`" cell; it reports
      what the commands printed and states no verdict of its own. Its
      tracking-doc bullet also mirrors V6 (e) and the Implementation notes'
      ADR-0029 bullet — the three state one grep and must move together
      (registered round zero).
- [ ] **Operative prose** — the Dispatch precondition (mirrors D1–D3's verdicts,
      D5's carry-out, Table E's two branches and V6's `RULING`), and the
      Exact-contracts stub body items 1 and 5 (mirror D5's measured cell and its
      `promote.js` pointer).

## Implementation notes & constraints

- **Docs-only. Nothing in `src/` or `tests/` may change**, and no fix for D5 may
  be attempted here. Found something else broken? "Discovered issues" in the PR.
- **`docs/HANDOVER.md` is the right tracking doc, and this was measured, not
  assumed**: `grep -rl '^| C | Dream write fence' docs --include='*.md'` returns
  exactly one file (V6 re-runs it), so no successor tracking doc carries the
  table. That grep is the whole basis of the claim — it establishes uniqueness of
  *this table*, not that no other tracking document could ever exist.
  **It is not an ADR-0029 derived view.** ADR-0029
  forbids committed status tables *whose facts live in spec frontmatter*; an
  audit group has no frontmatter field, so its status is derivable from nothing
  and generable by no view. The row is hand-written narrative, the same category
  ADR-0029 grants `MILESTONES.md`. What ADR-0029 **does** reach is the list of WP
  slugs in the current cell — which is why Table E drops it.
- **Do not trust the 2026-08-05 line citations** in the harvest logbook: they are
  a month of merges old. The citations in *this* spec were measured at
  `49d3d467`, and V1–V6 depend on none of them — every command greps by content
  or loads the module.
- **Re-measure; do not transcribe.** If any of V1–V5 disagrees with its Table D
  cell, that is a spec bug: report it and stop.

## Security checklist

- [ ] N/A — this WP writes three documentation files and consumes no untrusted
      input.

## Acceptance criteria

- [ ] **AC1** — V1, V2, V3 and V4 pass, and the logbook entry records **M7, M9
      and M10 as MOOTED**, each with the retiring cause Table D names for it.
- [ ] **AC2** — V5 passes, the logbook entry records **C3 as OPEN**, and
      `docs/specs/WP-layout-dot-prefix-rejection.md` exists with `status: Draft`
      and the five body items the Exact contracts require.
- [ ] **AC3** — `docs/HANDOVER.md`'s group C row carries Table E's ratified
      Status cell (E1) — or E2 if the owner declined — with `<LOGBOOK>` resolved
      to the created entry's path, its other two cells byte-identical, and **no
      other line of that file differs**. Checked by V6 (d) with `RULING` set to
      the dispatch's ruling, and by the `git diff --stat` it prints.
- [ ] **AC4** — the logbook entry names both of D2's residual owners: the owner
      ruling of 2026-08-31 in `WP-dream-promote-in-workspace` Table W row W1
      (hooks), and `WP-dream-git-env-pinning` (env). Neither is reopened.
      Checked by V6 (a).
- [ ] **AC5** — **no disposition rests on the archive's harness-refusal
      measurement.** The logbook names it only on lines that also mark it
      non-load-bearing; the stub and `docs/HANDOVER.md` never mention it.
      Checked by V6 (b).
- [ ] **AC6** — V6 passes end to end, including `node scripts/check-frontmatter.js`,
      `node scripts/boundary-check.js` and `npm run lint`, with the new stub
      present.
- [ ] Idempotence — `N/A`: this WP ships no command and writes only inside the
      repo.

## Verification steps (run these; paste output in the PR)

Run from the repo root. Each step exit-codes; V1–V5 were observed green on
`49d3d467` and red against a deliberately broken state (the red variant is given
where it is not obvious).

```bash
# V1 — D1: row C9 refuses every instruction/control shape and admits tier .md.
node -e '
const a=require("./src/core/dream/promote.js").makeAdmit(require("./src/core/layout.js").defaultLayout());
const refuse=["CLAUDE.md","AGENTS.md","06-Identity/CLAUDE.md","06-Identity/agents.override.md",
  ".claude/settings.json",".codex/x.md",".mcp.json",".gitignore",".git/config",".git/hooks/note.md"];
const admit=["06-Identity/notes.md","reports/dreams/2026-09-02.md"];
const bad=[...refuse.filter(r=>a(r)===null).map(r=>"ADMITTED but must refuse: "+r),
           ...admit.filter(r=>a(r)!==null).map(r=>"REFUSED but must admit: "+r)];
if(bad.length){console.error(bad.join("\n"));process.exit(1);}
console.log("row C9: "+refuse.length+" refused, "+admit.length+" admitted, as contracted");'
# RED: move "06-Identity/notes.md" into `refuse` -> exit 1, "ADMITTED but must refuse".

# V2 — D2/D4: no `git add`/`git commit` on the dream path; the pinned set carries none.
for f in src/cli/dream.js src/core/dream/validate.js src/core/dream/promote.js \
         tests/unit/dream-pipeline.known-calls.js; do
  test -f "$f" || { echo "MISSING FILE THIS STEP RESTS ON: $f"; exit 1; }
done
if grep -nE "'(add|commit)'[,)]" src/cli/dream.js src/core/dream/validate.js src/core/dream/promote.js; then
  echo "FAIL: a raw git add/commit survives on the dream path"; exit 1
fi
node -e '
const {KNOWN_CALLS}=require("./tests/unit/dream-pipeline.known-calls.js");
const forbidden=new Set(["add","commit","clean","reset","status","stash"]);
const hit=KNOWN_CALLS.flatMap(k=>k.args).filter(x=>typeof x==="string"&&forbidden.has(x));
if(hit.length){console.error("pinned set carries: "+hit.join(","));process.exit(1);}
console.log("pinned set = "+KNOWN_CALLS.length+" shapes, none of: "+[...forbidden].join(" "));'
# RED: run the same grep over src/core/vault.js (wienerdog init) -> two hits, exit 0 from grep,
#      so the `if` fires. Deliverable-absent: the `test -f` loop exits 1 before the grep.

# V3 — D3: the classifier has no route to a process spawner.
node -e '
const f=process.argv[1];const s=require("fs").readFileSync(f,"utf8");
const reqs=[...s.matchAll(/require\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g)].map(m=>m[1]);
const bad=reqs.filter(r=>/child_process|exec-identity/.test(r));
if(bad.length){console.error(f+" reaches a process spawner via: "+bad.join(", "));process.exit(1);}
console.log(f+": requires "+reqs.join(", ")+" — no route to a spawner, so classification never consults git");
' src/core/dream/delta.js
# RED: same command with src/core/dream/validate.js -> "reaches a process spawner via: ../exec-identity".
# ABSENT: a missing path throws ENOENT, exit 1. (A bare child_process grep is NOT enough:
# validate.js spawns git through ../exec-identity and would read green.)

# V4 — D3: the git status/clean path has no consumer in src/.
if grep -rn 'assertCleanTree\|restoreVaultToHead' src --include='*.js' \
   | grep -v '^src/core/dream/validate.js:'; then
  echo "FAIL: a src/ consumer of the retired git path reappeared"; exit 1
fi
echo "OK: no src/ consumer outside validate.js"
# RED: substitute assertGitRepo (which does have one) -> two hits in src/cli/dream.js, FAIL.

# V5 — D5: a dot-prefixed layout value is still accepted and opens .git/.
node -e '
const fs=require("fs"),os=require("os"),p=require("path");
const {readVaultLayout}=require("./src/core/layout.js");
const {makeAdmit}=require("./src/core/dream/promote.js");
const d=fs.mkdtempSync(p.join(os.tmpdir(),"c3-"));const c=p.join(d,"config.yaml");
fs.writeFileSync(c,"vault_layout:\n  projects_dir: .git\n");
const l=readVaultLayout(c);
const admitted=makeAdmit(l)(".git/hooks/note.md")===null;
console.log("projects_dir kept as "+JSON.stringify(l.projects_dir)+"; .git/hooks/note.md admitted="+admitted);
process.exit(admitted&&l.projects_dir===".git"?0:1);'
# RED: pass defaultLayout() instead of the config-read layout -> projects_dir="01-Projects",
#      admitted=false, exit 1. This step is green only while C3 is genuinely open.

# V6 — the deliverables exist, agree with Table D/E, and pass the repo gates.
# Set RULING to what the dispatch message recorded. There is no default: unset fails.
RULING=E1   # or E2, if the owner declined the Dispatch precondition

n=$(ls docs/specs/logbook/*-audit-group-c-disposition.md 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = 1 ] || { echo "FAIL: expected exactly 1 disposition logbook entry, found $n"; exit 1; }
LOG=$(ls docs/specs/logbook/*-audit-group-c-disposition.md)

# (a) The logbook carries every fact AC1 and AC4 require.
for pat in 'M7' 'M9' 'M10' 'MOOTED' 'OPEN' 'WP-layout-dot-prefix-rejection' \
           'WP-dream-git-env-pinning' 'WP-dream-promote-in-workspace' \
           'Table W row W1' '2026-08-31'; do
  grep -q "$pat" "$LOG" || { echo "FAIL: logbook entry is missing $pat"; exit 1; }
done

# (b) AC5 — the archive's harness-refusal measurement is EXCLUDED, never relied on:
#     the logbook names it, and only on lines that also mark it non-load-bearing;
#     the other two deliverables never mention it at all.
grep -qiE 'harness[- ]refusal' "$LOG" || { echo "FAIL: $LOG never states the honesty rule"; exit 1; }
grep -niE 'harness[- ]refusal' "$LOG" | grep -viq 'non-load-bearing' \
  && { echo "FAIL: $LOG leans on the harness-refusal measurement"; exit 1; }
for f in docs/specs/WP-layout-dot-prefix-rejection.md docs/HANDOVER.md; do
  test -f "$f" || { echo "FAIL: missing deliverable $f"; exit 1; }
  grep -niE 'harness[- ]refusal' "$f" && { echo "FAIL: $f cites it"; exit 1; }
done

# (c) The C3 stub exists and is Draft.
test -f docs/specs/WP-layout-dot-prefix-rejection.md \
  && grep -q '^status: Draft' docs/specs/WP-layout-dot-prefix-rejection.md \
  || { echo "FAIL: the C3 stub is absent or not Draft"; exit 1; }

# (d) AC3 — the group C row carries the RULING's Status cell, first two cells intact,
#     and cites the logbook. The fixed string is Table E's, byte for byte.
case "$RULING" in
  E1) WANT='| C | Dream write fence (machinery-controlling files) | **Closed** —' ;;
  E2) WANT='| C | Dream write fence (machinery-controlling files) | **Open — one residual** —' ;;
  *)  echo "FAIL: set RULING to E1 or E2, the ruling the dispatch recorded"; exit 1 ;;
esac
grep -qF "$WANT" docs/HANDOVER.md \
  || { echo "FAIL: the group C Status cell is not Table E row $RULING"; exit 1; }
grep -q "$LOG" docs/HANDOVER.md || { echo "FAIL: the group C row does not cite $LOG"; exit 1; }

# (e) The tracking-doc uniqueness the Implementation notes rest on.
m=$(grep -rl '^| C | Dream write fence' docs --include='*.md' | wc -l | tr -d ' ')
[ "$m" = 1 ] || { echo "FAIL: expected 1 file carrying the audit status table, found $m"; exit 1; }

git diff --stat main -- docs/HANDOVER.md   # must be 1 file, 1 insertion, 1 deletion
node scripts/check-frontmatter.js
node scripts/boundary-check.js
npm run lint
# ABSENT (run it before the deliverables exist): the `[ "$n" = 1 ]` guard fires with
# found 0, exit 1 — so this step cannot read green on undone work.
# RED (violating but present), each observed on a compliant fixture then broken:
#   drop the logbook citation from the HANDOVER row -> (d)'s second grep, "does not cite";
#   leave RULING=E1 with E2's cell in place    -> (d)'s first grep, "not Table E row E1";
#   drop `Table W row W1` from the logbook     -> (a), "missing Table W row W1";
#   cite the harness-refusal measurement in the stub -> (b), "$f cites it";
#   flip the stub to `status: Ready`           -> (c), "absent or not Draft".
```

## Out of scope (do NOT do these)

- **Fixing C3.** `WP-layout-dot-prefix-rejection` — this WP creates the stub and
  stops.
- **Deciding the git-environment question.** `WP-dream-git-env-pinning` owns it
  and needs an owner product decision first.
- **Reopening the hook ruling** of 2026-08-31, or touching
  `WP-dream-promote-in-workspace` Table W or its Mirrored Surface Checklist.
- **Re-wiring `restoreVaultToHead` or `assertCleanTree`**, or removing either.
- **Dispositioning audit groups D or E** — `WP-audit-d-code-derived-recipients`
  and `WP-audit-e-ledger-parser-corpus`.
- **Rewriting any other row of `docs/HANDOVER.md`**, including its numbered queue.

## Definition of done

0. **DISPATCH PRECONDITION.** Not dispatched until the owner has ratified that
   group C closes on Table D's basis, with C3 carried out as its own Draft WP.
   Declining substitutes Table E row E2 for E1 in AC3 and changes nothing else.
   The dispatch message records the ruling.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `docs(specs): disposition audit group C and close it (WP-audit-c-close-disposition)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`, not restated here.
   `In-Review` marks the START of review: this list is complete only when review
   is.
