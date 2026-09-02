---
id: WP-audit-c-close-disposition
title: Measure C2 (git seam) and C3 (layout) against the landed promote-in architecture and disposition group C
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: audit-close
---

# WP-audit-c-close-disposition: measure the group C findings and record their disposition

## Dispatch precondition

**ONE OWNER RULING, and it blocks dispatch — and it is no longer the ratification
this spec carried before round 1.** The gate reproduced two live mechanisms, so
"group C closes" is withdrawn: recording a disposition of **open** is a finding
of fact and needs nobody's signature (Table D), and there is no closure left to
sign. What remains the owner's is a **severity call**, and it changes what
happens next rather than what the logbook says.

**The call: is D1's open half a queued work package, or an incident?** Measured
(V1 (b)): the promotion allowlist enumerates two dot directories, so beneath an
admitted tier the real `writeIntoVault` accepted and wrote
`01-Projects/example/.github/copilot-instructions.md` — a live AI-instruction
file in any project checkout, which is the class group C exists to deny.

- **(i) QUEUED — the recommendation.** `WP-dot-segment-denial` joins the queue in
  the normal order. Grounds: the brain must choose that path itself, the
  instruction-**basename** denial still holds at every depth (V1 (a)), and the
  vault is the user's own repository.
- **(ii) INCIDENT.** `WP-dot-segment-denial` jumps the queue as a hotfix, and an
  incident entry is filed against *that* dispatch. Grounds: it is a shipped
  product writing a machinery-controlling file the audit ruled KEEP.

**Either way this WP's own deliverables are identical** — it records, it does not
fix, and it files no incident entry of its own. The ruling changes only the
successor's priority; **the dispatch message records it**, and neither branch
touches Table D or Table E.

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
  parent's privileges **and unfiltered env**, no `--no-verify`, no neutral hooks
  path.
- **M10 — the gitignored/invisible region.** Classification ran `git status
  --porcelain -z -uall` with no `--ignored`, cleanup ran `git clean -fd` (not
  `-x`), and `.gitignore` itself fell through the keep branch.

The ruling's fix was **structural, not enumerated** — the era had already
measured twice that *"a wider enumeration is still an enumeration"*. Its item 1
was **"no write to any path with a dot-prefixed segment"**, stated as a class so
future control directories need no maintenance. **That framing is what this
disposition must measure against, and it is where two verdicts turned.**

The group was split C1 (the fence) → C2 (the git seam) → C3 (layout).
**C1's fix was superseded before it shipped.** What landed instead is the
promote-in inversion, five WPs now in `docs/specs/done/`: the brain writes a
**workspace**, never the vault; only promoted content enters the vault through
one identity-anchored chokepoint; and the run's own git calls are default-deny
shape-pinned. **C2 and C3 were never dispositioned.**

This work package dispositions them. **It is a measurement and recording pass: it
changes no behaviour and touches nothing in `src/` or `tests/`.** The measurements
were taken on `49d3d467` and re-taken at the round-1 gate; the implementer re-runs
them and records the result. Where a measurement disagrees with Table D, that is
a spec bug — say so in the PR and stop; do not adjust the table to match.

**One honesty rule, inherited from the ruling and binding here.** The archive's
harness-refusal measurement for `.git` writes was explicitly ruled
**non-load-bearing** — it rests on unverified third-party behaviour this project
neither owns nor tests. **No disposition rests on it**: every Table D cell rests
on a command in Verification steps. **Naming it as excluded is required, not
forbidden**, and only in that form — see AC5 for the literal property that is
actually checked, and for what that check does not reach.

## Current state

What an implementer needs to locate; the *verdicts* are Table D's and are not
repeated here.

- `src/core/dream/promote.js` — `makeAdmit` (exported) is row C9, the promotion
  allowlist, handed to `writeIntoVault` as its `admit` callback. Clause (c) is
  three enumerations: `INSTRUCTION_BASENAMES` (`:96`, four names),
  `DENIED_SEGMENTS` (`:99`, exactly `.claude` and `.codex`) and `DENIED_BASENAME`
  (`:102`, `.mcp.json`). Clause (a) is the writable tier directories, clause (b)
  is an `.md` extension.
- `src/core/dream/vault-write.js` — `writeIntoVault` owns **no policy**: it
  throws without an `admit` (`:210-211`) and applies it to the **resolved** path
  (`:333`).
- `src/core/dream/warnings.js` — a **second** vault-writing authority:
  `refreshWarnings` (`:224`) calls `writeIntoVault` with its own
  `admitWarningsPath` (`:192`), fixed to `WARNINGS_REL = 'reports/warnings.md'`
  (`:72`). `src/cli/dream.js:1009` pushes that same constant straight into the
  commit member list.
- `src/cli/dream.js` — `commitNamedSet` builds the run's commit in a **private
  index** (`GIT_INDEX_FILE`) and publishes with `commit-tree` + `update-ref`;
  it never invokes `git commit`. Every call's env is `process.env`, spread
  (`indexEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex }`).
- `src/core/dream/validate.js` — no `git add`, no `git commit`. `assertCleanTree`
  and `restoreVaultToHead` have no `src/` consumer (`:1166-1177` states that as
  the contract); `assertGitRepo` is called once, at `src/cli/dream.js:587`.
- `tests/unit/dream-pipeline.known-calls.js` — nine pinned shapes, default-deny.
- `src/core/dream/delta.js` — the classifier; requires only `node:fs`,
  `node:path`, `../errors`.
- `src/core/layout.js` — `isSafeRelativePath` (`:65-71`) rejects empty, absolute,
  backslashed and `..`. **`src/core/layout-infer.js:40-46` holds a COPIED
  validator** whose own comment says *"Copied from layout.js's private
  `isSafeRelativePath`"*; `inferLayout` (`:104`) applies it at `:131`.
  `src/cli/adopt.js:347` infers the layout, `:381` writes it into `config.yaml`
  via `renderLayoutBlock`, and `--yes` skips the confirmation (`:348`).
- `docs/HANDOVER.md` carries the audit status table; its group C row today reads
  *"Structurally closed by the promote-in family … Remaining: formal C2/C3
  disposition"*.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | docs/specs/logbook/2026-09-02-audit-group-c-disposition.md | the disposition record. If the implementation day differs, use that day's date — `docs/specs/logbook/` is boundary-free either way, and V6 resolves the file by glob |
| create | docs/specs/WP-dot-segment-denial.md | the Draft stub for the dot-segment class (Table D rows D1's open half and D5) |
| modify | docs/HANDOVER.md | **the group C row's Status cell only** — Table E's text for the recorded ruling. No other cell, no other line |

### Exact contracts

**The logbook entry** carries: (1) one paragraph naming the tree measured and the
honesty rule; (2) **Table D reproduced in full**; (3) the command output pasted
for each of V1–V5; (4) the Dispatch precondition's severity ruling, quoted, with
its date. Reproducing Table D is a **transfer of ownership, not a duplicate**:
this spec is Table D's authority while it is worked, and on the flip to Done the
logbook becomes it — which is why Table E's cell cites the logbook, not this file.

**The C3/dot-segment stub** is a Draft stub in the sense `docs/HANDOVER.md`
defines — context, intent, known traps and a done-definition, **not** a reviewed
spec. Frontmatter, verbatim:

```yaml
---
id: WP-dot-segment-denial
title: Deny dot-prefixed path segments at the promotion allowlist and at every layout validator
status: Draft
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004]
epic: audit-close
---
```

**It is filed as ONE work package covering two enforcement points, and that is a
decision with a stated cause:** the 2026-08-05 ruling's item 3 (config-side)
existed *to make item 1 (path-side) unconditional*. Landing either alone leaves
the class open — which is the exact shape of the defect the round-1 gate found.
It may be split at maturation; it may not be half-landed. Its body states:

1. **The rule, as ruled: no write to any path with a dot-prefixed SEGMENT** — a
   class, not a list. Today's `DENIED_SEGMENTS` (`promote.js:99`) enumerates two
   names, so `.github`, `.husky`, `.git`, `.obsidian` and `.cursor` are admitted
   beneath an admitted tier. Reproduce with V1 (b), not from this sentence.
2. **Two enforcement points, both required.** (a) `makeAdmit`'s clause (c) —
   segment-level, applied to the resolved path. (b) The layout validators — a
   dot-prefixed layout value makes a dot directory a *tier*, which is the other
   way the class opens.
3. **The layout side is TWO validators, not one, and one of them is a producer.**
   `layout.js:65-71` (reader) and the copied `layout-infer.js:40-46` (producer);
   `adopt --yes` infers, writes the block into `config.yaml` and scaffolds the
   directories with no confirmation. **So the value is not solely the user's —
   Wienerdog can generate it.** Decide explicitly: one validation authority
   (export and reuse the predicate) or reject at both. A **round-trip acceptance
   case is required**: `adopt --yes` on a vault containing a dot-prefixed
   directory must not persist a mapping a later run silently discards.
4. **The inherited notice, not to be changed there.** The reader's per-key
   fallback to the built-in default is **silent** by the existing contract; a dot
   rejection inherits that silence. Whether to notify is that WP's decision to
   take deliberately, not to absorb by accident.
5. **The residual this rule does NOT close, named rather than implied.** The
   instruction-basename list (`promote.js:96`) stays a list; an unknown tool's
   dot-free instruction file inside a tier still passes. That was accepted at
   ruling time and is not reopened here.
6. **ADR-0004 bounds the fix.** Nothing resident re-reads `config.yaml`: a bad
   value is read by one CLI run that then exits. The fix is a validation
   condition — never anything that watches.
7. **The pointer that must move with it.** `promote.js`'s *"Deliberately NOT a
   dot-rule: audit finding C3 owns the layout dot-rule and its notice"* is a live
   deferral to this WP; landing it means updating that comment in the same pass.

## Contract reference

Activation (ADR-0031's 2-of-7 test) — **four** of seven fire: (ii) a result
taxonomy is introduced (mooted / open, each with a required cause); (v) the task
crosses an authority boundary; (vi) downstream consumers inherit the dispositions;
(vii) the same facts appear in multiple mirrored surfaces.

### Table D — the disposition of audit group C

The single place every disposition fact is decided. A **mooted** row names what
retired the mechanism; an **open** row names the WP that owns it. Every measured
cell is the output of the step in its last column, and of nothing else.
**Rows D1 and D2 were MOOTED before the round-1 gate; both were reproduced live
and split. The retired verdicts are recorded here, with their cause, rather than
quietly replaced.**

| # | Finding | Mechanism, as ruled 2026-08-05 | Measured | Verdict | Cause / owner | Step |
|---|---------|--------------------------------|----------|---------|---------------|------|
| D1 | **M7** — harness-instruction persistence | the brain writes an instruction file; the fence misses it; it is kept and committed. Item 1 of the fix denied **any dot-prefixed segment**, as a class | (a) all four instruction basenames are refused at every depth (16/16). (b) `.github`, `.husky`, `.git`, `.obsidian`, `.cursor` are **admitted beneath an admitted tier** (5/5), and the real `writeIntoVault` with the production `admit` **wrote** `01-Projects/example/.github/copilot-instructions.md` | **SPLIT — (a) MOOTED, (b) OPEN** | (a) retired by the promote-in inversion: row C9's clause (a)+(b) put a vault-**root** instruction file outside the allowlist without enumeration, and `INSTRUCTION_BASENAMES` covers the four current names at any depth. (b) **`DENIED_SEGMENTS` (`promote.js:99`) is an ENUMERATION of two names where the ruling required a class**, so the ruling's item 1 is unmet beneath tiers. Owner: **`WP-dot-segment-denial`**. **RETIRED VERDICT:** this row read MOOTED until the round-1 gate; the prior evidence tested dot paths only at the vault ROOT, where clause (a) rejects them for being out-of-tier — the probe moved two variables and attributed the refusal to the wrong one | V1 |
| D2 | **M9** — git control state inside the write fence | the validator runs `git add`/`git commit` in the vault repo, parent privileges, **unfiltered env**, no `--no-verify`, no neutral hooks path | (a) `validate.js` has no `add`/`commit`; the run never invokes `git commit`; nine pinned shapes carry none of `add commit clean reset status stash`. (b) with an inherited `GIT_DIR`, the pinned `hash-object -w --stdin` wrote its object into the **redirected** repository and not the vault; `commit-tree` + `update-ref` under the same env **advanced the other repository's HEAD** | **SPLIT — (a) MOOTED, (b) OPEN** | (a) retired by `commitNamedSet`: private index + `commit-tree` + `update-ref`, so `--no-verify` has nothing to suppress — the pre-commit/commit-msg path is **structurally absent**, not disabled. (b) the ruled mechanism **names the unfiltered env**, and `commitNamedSet` spreads `process.env` into every call; a scheduled run gets run-job's clean env, a manual `wienerdog dream` inherits the shell. Owner: **`WP-dream-git-env-pinning`** — Draft, **needs an owner product decision and has not landed**. **RETIRED VERDICT:** this row read MOOTED until the round-1 gate, on the reasoning that the env half was "already owned"; **a registered future decision is not a retiring cause**, and that is the general rule this row now carries. **NOT reopened:** the `reference-transaction` hook residual, ruled out of scope by the owner on 2026-08-31 (`WP-dream-promote-in-workspace` Table W row W1, which also rejects `core.hooksPath` suppression by name). **Not a residual:** `assertGitRepo` is a read-only `rev-parse --git-dir` and writes no control state | V2 |
| D3 | **M10** — the gitignored/invisible region | `git status … -uall` without `--ignored` classifies; `git clean -fd` (not `-x`) cleans; a dream-written `.gitignore` blinds both | `delta.js` requires only `node:fs`, `node:path`, `../errors` — no route to a process spawner. `assertCleanTree` and `restoreVaultToHead` have no `src/` consumer | **MOOTED** | Retired by the **git-free classifier**: `computeDelta` is a filesystem walk that never consults git, so an ignore file has nothing to blind — **absent, not defeated**, and unaffected by D1's open half (a dot-segment write does not restore a git dependency the classifier no longer has). **Standing-discipline note:** `restoreVaultToHead`'s `clean -fd` still exists, exported for fixtures and unreachable from `src/`; a future WP that re-wires it re-opens M10's `-fd`-not-`-x` question and must re-run V3 and V4 | V3, V4 |
| D4 | **C2** — the git seam | ruling item 4: give the seam its own third-party-independent defense — `--no-verify` and a neutralized hooks path | follows D2 exactly | **SPLIT — own-defense half VOID, env half OPEN** | The `--no-verify`/hooks-path half is void by construction: there is no `git commit` to harden. The environment half is D2 (b), OPEN, owned by `WP-dream-git-env-pinning`. **RETIRED VERDICT:** this row read MOOTED with *"nothing new is owed"*; that sentence is **withdrawn** — the seam still owes an independent, constructed environment | V2 |
| D5 | **C3** — layout | ruling item 3: reject dot-prefixed layout values in `isSafeRelativePath`, so the item-1 write rule is unconditional | `readVaultLayout` returns `projects_dir: .git` unchanged and `makeAdmit` on that layout admits `.git/hooks/note.md`; the **copied** `layout-infer.js` validator has the same gap, and `inferLayout` on a vault holding `.projects/` produced `projects_dir: ".projects"` | **OPEN** | Owner: **`WP-dot-segment-denial`** — the same WP as D1 (b), because item 3 exists to make item 1 unconditional and half-landing either leaves the class open. **Widened at round 1:** the finding is not one condition at one site — it is two validators, one of which (`layout-infer.js`, reached by `adopt --yes`) is a **producer**, so the dot value is not solely the user's | V5 |

### Table E — the group C row in `docs/HANDOVER.md`

The group C row has three cells. **Only the third — Status — changes**, replaced
verbatim with the text below; the `C` and
`Dream write fence (machinery-controlling files)` cells stay byte-identical.
Neither text re-lists the five Done promote-in slugs the current row names: their
status lives in spec frontmatter and would go stale here, so both cite the
logbook, which owns the disposition facts. `<LOGBOOK>` is the created entry's
repo-relative path.

**E1 is the recommendation** — with D1 (b), D2 (b) and D5 open, "group C closes"
is not an honest cell. **E2 is pre-written for the day the residuals land**, and
its trigger is mechanical rather than a judgment: V1 (b), V2 (b) and V5 are
**green only while their mechanism is live**, so all three going red is exactly
the condition for E2.

| # | State | The Status cell, verbatim |
|---|-------|---------------------------|
| E1 | **open** — recommended today | **Open — three residuals** — the promote-in family retired M10 and the instruction-basename and git-commit halves of M7/M9; three mechanisms remain live, measured. Basis per finding in `<LOGBOOK>`. Owners: `WP-dot-segment-denial`, `WP-dream-git-env-pinning` |
| E2 | **closed** — not yet | **Closed** — every group C mechanism retired; basis per finding in `<LOGBOOK>`. Apply only once `WP-dot-segment-denial` and `WP-dream-git-env-pinning` have landed and V1 (b), V2 (b) and V5 have gone red |

### Mirrored Surface Checklist

Every surface that mirrors Table D or Table E. A finding updates the table **and**
every mirror below in one pass; a new mirror found in review is registered here
on the spot.

- [ ] **Deliverables-table cells** — the logbook row (mirrors D1–D5 as its content
      contract), the stub row (mirrors D1 (b) and D5 sharing one owner), the
      HANDOVER row (mirrors Table E's Status-cell-only rule).
- [ ] **Acceptance criteria** — AC1 (D1–D4's split verdicts), AC2 (D1 (b) + D5's
      shared successor), AC3 (Table E), AC4 (D2's residual owners and the
      not-reopened hook ruling), AC5 (the honesty rule's literal property).
- [ ] **Verification commands** — V1 mirrors D1's two halves, V2 mirrors D2/D4's
      two halves, V3 and V4 mirror D3, V5 mirrors D5. **V6 mirrors the most and is
      checked first on any finding**: the Deliverables, Table E's two Status cells
      (via `RULING`), and AC2–AC6.
- [ ] **Current state** — locations only; it states no verdict, so a verdict
      change must NOT edit it. What it does mirror is the *citation* set — if a
      Table D cell's file or symbol moves, both move.
- [ ] **Operative prose** — the Dispatch precondition (mirrors D1 (b)'s measured
      cell and its severity), the Context's dot-segment-class paragraph (mirrors
      what D1 and D5 measure against), and stub body items 1–3 and 5 (mirror
      D1 (b), D5 and D1 (a)'s named residual).

## Implementation notes & constraints

- **Docs-only. Nothing in `src/` or `tests/` may change**, and no fix for any open
  row may be attempted here. Found something else broken? "Discovered issues".
- **This WP edits one cell of an existing hand-maintained table; it does not
  create one.** Whether `docs/HANDOVER.md`'s audit table should exist at all
  under ADR-0029 is **parked, not answered here** — an owner-visible question,
  raised in the PR body and left open. Nothing in this spec rests on a reading of
  ADR-0029, and an earlier draft's gloss on it ("ADR-0029 forbids only
  frontmatter-derived status tables") is **withdrawn**: it is not what the ADR
  says. The reason Table E's cells drop the five WP slugs is the ordinary
  state-a-fact-once rule, not ADR-0029.
- **Do not trust the 2026-08-05 line citations** in the harvest logbook. This
  spec's own citations were measured at `49d3d467`; V1–V6 depend on none of them.
- **Re-measure; do not transcribe.** If any of V1–V5 disagrees with its Table D
  cell, that is a spec bug: report it and stop.
- **The three open rows are evidence-bearing.** V1 (b), V2 (b) and V5 pass *while
  the defect exists*. A red there is good news and means Table E row E2's trigger
  may have been reached — never "fix the check".

## Security checklist

- [ ] N/A — this WP writes three documentation files and consumes no untrusted
      input. The untrusted-path reasoning it *records* belongs to
      `WP-dot-segment-denial`, which owns the fix.

## Acceptance criteria

- [ ] **AC1** — V1–V4 pass and the logbook records Table D's verdicts as split:
      **M7 (a) mooted / (b) open**, **M9 (a) mooted / (b) open**, **M10 mooted**,
      **C2 own-defense void / env open** — each with the cause Table D names, and
      each retired verdict recorded with its cause rather than replaced.
- [ ] **AC2** — V5 passes, the logbook records **C3 OPEN**, and
      `docs/specs/WP-dot-segment-denial.md` exists with `status: Draft` and the
      seven body items the Exact contracts require, naming **both** enforcement
      points and **both** layout validators.
- [ ] **AC3** — `docs/HANDOVER.md`'s group C row is Table E's cell for the
      recorded state, `<LOGBOOK>` resolved, the other two cells byte-identical,
      and **that file changed by exactly one line**. Checked by V6 (d).
- [ ] **AC4** — the logbook names `WP-dream-git-env-pinning` as D2 (b)'s owner
      **and** states that the 2026-08-31 hook ruling
      (`WP-dream-promote-in-workspace` Table W row W1) is *not* reopened.
      Checked by V6 (a).
- [ ] **AC5** — **the literal property V6 (b) checks**, stated as exactly that:
      every line of the logbook containing `harness-refusal` also contains
      `non-load-bearing`, at least one such line exists, and neither the stub nor
      `docs/HANDOVER.md` contains the phrase. **Named limit:** this is a
      lexical check — reliance expressed by a pronoun or a synonym passes it, and
      closing that gap is a reviewer's job, not a grep's.
- [ ] **AC6** — V6 passes end to end, including `node scripts/check-frontmatter.js`,
      `node scripts/boundary-check.js` and `npm run lint`, with the new stub present.
- [ ] Idempotence — `N/A`: this WP ships no command and writes only inside the repo.

## Verification steps (run these; paste output in the PR)

Run from the repo root; each step exit-codes. **Every step must be observed in
all the states its band requires — for V6, the deliverable-ABSENT state as well
as compliant and violating.** How to produce the violating state is the
implementer's to choose; what must be reported is the state exercised, the
command, and its output.

```bash
# V1 — D1, both halves. (a) is the mooted claim; (b) passes WHILE THE DEFECT LIVES.
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const {makeAdmit}=require("./src/core/dream/promote.js");
const {defaultLayout}=require("./src/core/layout.js");
const {writeIntoVault}=require("./src/core/dream/vault-write.js");
const admit=makeAdmit(defaultLayout());
const base=["CLAUDE.md","AGENTS.md","CLAUDE.local.md","AGENTS.override.md"];
const depths=["","06-Identity/","01-Projects/example/","02-Areas/x/y/"];
const leaked=[];
for(const d of depths) for(const b of base) if(admit(d+b)===null) leaked.push(d+b);
if(leaked.length){console.error("(a) BROKEN, admitted: "+leaked.join(", "));process.exit(1);}
console.log("(a) mooted half: "+(depths.length*base.length)+" instruction-basename paths refused at every depth");
const dotted=["01-Projects/example/.github/copilot-instructions.md","01-Projects/example/.husky/pre-commit.md",
  "01-Projects/example/.git/hooks/note.md","06-Identity/.obsidian/x.md","01-Projects/example/.cursor/rules.md"];
const open=dotted.filter(p=>admit(p)===null);
const v=fs.mkdtempSync(path.join(os.tmpdir(),"v1-"));
const res=writeIntoVault({vaultDir:v,rel:"01-Projects/example/.github/copilot-instructions.md",
  bytes:Buffer.from("x\n"),admit});
console.log("(b) OPEN half: "+open.length+"/"+dotted.length+" dot-segment paths admitted beneath a tier; writeIntoVault written="+res.written);
process.exit(open.length===dotted.length&&res.written===true?0:1);'

# V2 (a) — D2's mooted half: no `git add`/`git commit` on the dream path, and none pinned.
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
console.log("(a) pinned set = "+KNOWN_CALLS.length+" shapes, none of: "+[...forbidden].join(" "));'

# V2 (b) — D2's OPEN half. Passes WHILE THE DEFECT LIVES: an inherited GIT_DIR
# redirects the run's own pinned write shape away from the vault.
V=$(mktemp -d); O=$(mktemp -d)
git init -q "$V" && git -C "$V" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init
git init -q "$O" && git -C "$O" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init
SHA=$(printf payload | GIT_DIR="$O/.git" git -C "$V" hash-object -w --stdin)
git -C "$V" cat-file -e "$SHA" 2>/dev/null && { echo "object landed in the vault — the env residual may have CLOSED; re-measure D2 (b)"; exit 1; }
GIT_DIR="$O/.git" git cat-file -e "$SHA" || { echo "FAIL: object landed nowhere expected"; exit 1; }
echo "(b) OPEN: pinned hash-object wrote into the redirected repo, not the vault ($SHA)"

# V3 — D3: the classifier has no route to a process spawner. A bare child_process
# grep is NOT sufficient (validate.js spawns git via ../exec-identity and reads green).
node -e '
const f=process.argv[1];const s=require("fs").readFileSync(f,"utf8");
const reqs=[...s.matchAll(/require\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g)].map(m=>m[1]);
const bad=reqs.filter(r=>/child_process|exec-identity/.test(r));
if(bad.length){console.error(f+" reaches a process spawner via: "+bad.join(", "));process.exit(1);}
console.log(f+": requires "+reqs.join(", ")+" — no route to a spawner");
' src/core/dream/delta.js

# V4 — D3: the git status/clean path has no consumer in src/.
if grep -rn 'assertCleanTree\|restoreVaultToHead' src --include='*.js' \
   | grep -v '^src/core/dream/validate.js:'; then
  echo "FAIL: a src/ consumer of the retired git path reappeared"; exit 1
fi
echo "OK: no src/ consumer outside validate.js"

# V5 — D5's OPEN half, BOTH validators. Passes WHILE THE DEFECT LIVES.
node -e '
const fs=require("fs"),os=require("os"),p=require("path");
const {readVaultLayout}=require("./src/core/layout.js");
const {inferLayout}=require("./src/core/layout-infer.js");
const {makeAdmit}=require("./src/core/dream/promote.js");
const d=fs.mkdtempSync(p.join(os.tmpdir(),"c3-"));
const c=p.join(d,"config.yaml"); fs.writeFileSync(c,"vault_layout:\n  projects_dir: .git\n");
const read=readVaultLayout(c);
const vault=fs.mkdtempSync(p.join(os.tmpdir(),"c3v-"));
fs.mkdirSync(p.join(vault,".projects"),{recursive:true});
const inferred=inferLayout(vault);
const admitted=makeAdmit(read)(".git/hooks/note.md")===null;
console.log("reader   readVaultLayout -> projects_dir="+JSON.stringify(read.projects_dir)+"; .git/hooks/note.md admitted="+admitted);
console.log("producer inferLayout     -> projects_dir="+JSON.stringify(inferred.projects_dir));
process.exit(read.projects_dir===".git"&&admitted&&String(inferred.projects_dir).startsWith(".")?0:1);'

# V6 — the deliverables exist, agree with Table D/E, and pass the repo gates.
RULING=E1   # or E2, per Table E — E1 while the three residuals are open

n=$(ls docs/specs/logbook/*-audit-group-c-disposition.md 2>/dev/null | wc -l | tr -d ' ')
[ "$n" = 1 ] || { echo "FAIL: expected exactly 1 disposition logbook entry, found $n"; exit 1; }
LOG=$(ls docs/specs/logbook/*-audit-group-c-disposition.md)

# (a) AC1 and AC4 — the logbook carries every required fact.
for pat in 'M7' 'M9' 'M10' 'MOOTED' 'OPEN' 'WP-dot-segment-denial' \
           'WP-dream-git-env-pinning' 'WP-dream-promote-in-workspace' \
           'Table W row W1' 'not reopened' '2026-08-31'; do
  grep -q "$pat" "$LOG" || { echo "FAIL: logbook entry is missing $pat"; exit 1; }
done

# (b) AC5 — the literal property, and nothing wider than it.
grep -qiE 'harness[- ]refusal' "$LOG" || { echo "FAIL: $LOG never states the honesty rule"; exit 1; }
grep -niE 'harness[- ]refusal' "$LOG" | grep -viq 'non-load-bearing' \
  && { echo "FAIL: $LOG has a harness-refusal line not marked non-load-bearing"; exit 1; }
for f in docs/specs/WP-dot-segment-denial.md docs/HANDOVER.md; do
  test -f "$f" || { echo "FAIL: missing deliverable $f"; exit 1; }
  grep -niE 'harness[- ]refusal' "$f" && { echo "FAIL: $f mentions it"; exit 1; }
done

# (c) AC2 — the stub exists and is Draft.
grep -q '^status: Draft' docs/specs/WP-dot-segment-denial.md \
  || { echo "FAIL: the stub is absent or not Draft"; exit 1; }

# (d) AC3 — the EXACT, fully substituted row occurs exactly once, and HANDOVER
#     changed by exactly one line with no other hunk.
case "$RULING" in
  E1) CELL='**Open — three residuals** — the promote-in family retired M10 and the instruction-basename and git-commit halves of M7/M9; three mechanisms remain live, measured. Basis per finding in `'"$LOG"'`. Owners: `WP-dot-segment-denial`, `WP-dream-git-env-pinning`' ;;
  E2) CELL='**Closed** — every group C mechanism retired; basis per finding in `'"$LOG"'`. Apply only once `WP-dot-segment-denial` and `WP-dream-git-env-pinning` have landed and V1 (b), V2 (b) and V5 have gone red' ;;
  *)  echo "FAIL: set RULING to E1 or E2"; exit 1 ;;
esac
ROW="| C | Dream write fence (machinery-controlling files) | $CELL |"
CNT=$(grep -cFx "$ROW" docs/HANDOVER.md)
[ "$CNT" = 1 ] || { echo "FAIL: Table E row $RULING occurs $CNT times in HANDOVER, want exactly 1"; exit 1; }
NS=$(git diff --numstat main -- docs/HANDOVER.md)
[ "$NS" = "$(printf '1\t1\tdocs/HANDOVER.md')" ] \
  || { echo "FAIL: HANDOVER numstat is [$NS], want [1<TAB>1<TAB>docs/HANDOVER.md]"; exit 1; }

node scripts/check-frontmatter.js
node scripts/boundary-check.js
npm run lint
echo "V6 OK (ruling $RULING)"
```

## Out of scope (do NOT do these)

- **Fixing anything.** `WP-dot-segment-denial` owns D1 (b) and D5;
  `WP-dream-git-env-pinning` owns D2 (b). This WP creates the first stub and stops.
- **Reopening the `reference-transaction` hook ruling** of 2026-08-31, or touching
  `WP-dream-promote-in-workspace` Table W or its Mirrored Surface Checklist.
- **Re-wiring `restoreVaultToHead` or `assertCleanTree`**, or removing either.
- **Answering the parked ADR-0029 question** about `docs/HANDOVER.md`'s table.
- **Dispositioning audit groups D or E** — `WP-audit-d-code-derived-recipients`
  and `WP-audit-e-ledger-parser-corpus`.
- **Rewriting any other row of `docs/HANDOVER.md`**, including its numbered queue.

## Definition of done

0. **DISPATCH PRECONDITION.** Not dispatched until the owner has ruled D1 (b)'s
   severity — queued (recommended) or incident. The dispatch message records it.
   Neither branch changes this WP's deliverables.
1. All verification steps pass locally; output pasted into the PR body, with the
   states each step required.
2. Conventional commits; PR titled
   `docs(specs): disposition audit group C, three residuals open (WP-audit-c-close-disposition)`.
3. PR template filled, including "Decisions made" (or "none"), `Generated-by:`,
   and "Discovered issues" carrying the parked ADR-0029 question.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`, not restated here.
   `In-Review` marks the START of review: this list is complete only when review is.
