---
id: WP-contract-reference-tables
title: Integrate ADR-0031 contract reference tables into the spec template and the two agent duties
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0031, ADR-0029, ADR-0005]
epic: spec-system
---

# WP-contract-reference-tables: ADR-0031 process integration (template + two agent duties)

## Context (read this, nothing else)

ADR-0031 (Accepted) fixes a review-loop failure seen during the A9/A10
security-audit spec work: when a **contract** (a set of facts an implementer
must satisfy — e.g. a path-resolution rule, or which reap primitive runs on
which exit path) is scattered across a spec's prose, adversarial review keeps
landing findings on the *same* contract round after round, because each finding
fixes one scattered copy and leaves another wrong or contradictory. The remedy
is a **presentation discipline**, not a new gate:

- **One canonical reference table per dense contract.** Give each such contract
  **one reference table** that is the single place its facts are *decided* — its
  single source of truth. Every *other* place the contract appears (Deliverables
  cells, acceptance criteria, verification greps, Current-state text, operative
  prose) is a **mirrored surface**: it may restate the contract, but only as a
  copy that **defers to** the table for its facts. The one forbidden thing is a
  *second, independently authored* statement that re-decides the facts and can
  silently **drift** from the table. Textual repetition is fine; a second
  authority is the violation.
- **Mirrored Surface Checklist.** A triggered spec lists, for each canonical
  table, **every surface in that spec that mirrors it**, so two obligations hold:
  **(a) update-all-mirrors** — a review finding that changes a table row updates
  every listed mirror in the same pass; **(b) register-new-mirrors** — a new
  mirror found during review is added to the checklist then and there.
- **Activation trigger (the 2-of-7 test).** Turn the discipline on when **two or
  more** of these are true: (i) an API/interface/result **shape** changes; (ii) a
  **status/result taxonomy** changes or is introduced; (iii) structured
  **input/output parsing, payload validation, or schema acceptance** changes;
  (iv) **error/fallback/timeout/cancellation/precedence/reason-code** behavior
  changes; (v) the task **crosses an authority boundary** (one component emits or
  records data, another owns its interpretation or lifecycle); (vi) **multiple
  downstream consumers or successor specs** inherit the contract; (vii) the
  **same contract must appear in multiple mirrored surfaces**.
- **The single exception** is contract-level, never spec-level: a *specific
  contract* skips its table **only when a runnable gate enforces every one of its
  facts exhaustively and directly** (the gate is then that contract's canonical
  source). A general acceptance test or live harness does **not** exempt a spec's
  other contracts.

ADR-0031 names a **four-point process integration**: (1) the spec template, (2)
wd-architect as owner of the pattern, (3) wd-reviewer as detector, and (4) the
codex-review runbook's loop circuit-breaker. Point 4 lands separately as a
direct edit to `docs/runbooks/codex-review.md` (that runbook is maintained
directly, not WP-gated). **This WP lands points 1–3** — the three load-bearing
process artifacts that deserve the spec gate and a reviewable diff.

Product invariant that bounds this WP: Wienerdog is just files (ADR-0004) — this
change adds documentation/prose scaffolding only; no daemon, server, telemetry,
or new tooling. And ADR-0031 is explicit that this discipline does **not** change
the One-Document Rule (ADR-0005), the Deliverables-table permission boundary, or
acceptance-criteria-as-verification-commands.

**This spec is the first to author ADR-0031's Mirrored Surface Checklist.** The
`WP-a9-incident-runbook` extraction predates the ADR and demonstrates the
*extraction* half only — its Deliverables cells and acceptance criteria restate
its Tables A–E without being registered as mirrors — so it is an extraction
**precedent**, not a checklist-compliant exemplar. See the dogfood note under
"Contract reference" below for how this WP itself applies the 2-of-7 test.

## Current state

Three files exist and are edited in place. Exact current content:

**`docs/specs/_TEMPLATE.md`** — the WP template. Section order today: `## Context`,
`## Current state`, `## Deliverables (permission boundary — touch ONLY these)`,
`### Exact contracts`, `## Implementation notes & constraints`, `## Security
checklist …`, `## Acceptance criteria`, `## Verification steps …`, `## Out of
scope …`, `## Definition of done`. The `### Exact contracts` block ends with a
fenced ```js code block (the `doThing` JSDoc example) immediately before the
`## Implementation notes & constraints` heading. There is **no** "Contract
reference" section today.

**`.claude/agents/wd-architect.md`** — the architect agent. Its body has a
`Rules:` list. The final two bullets read:

```
- Record incident/chain retros as dated `docs/specs/logbook/` entries (`YYYY-MM-DD-<slug>.md`, `related_wps:` frontmatter). Never hand-maintain an aggregate status table or dependency graph — views are generated from frontmatter on demand (ADR-0029).
- Use GLOSSARY.md terms exactly.
```

There is **no** mention of ADR-0031, contract density, canonical tables, or the
Mirrored Surface Checklist today.

**`.claude/agents/wd-reviewer.md`** — the reviewer agent. Its body has a numbered
"Review procedure, strictly in this order:" list (steps 1–5), then an `Output
format:` paragraph, then a final paragraph beginning "If the *spec* is at
fault …" that ends:

```
Two failed review rounds on the same WP means the spec is the bug: escalate to wd-architect.
```

There is **no** mention of ADR-0031, contract-density detection, or a
Closed-Contract Drift Check today.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/specs/_TEMPLATE.md | add optional `## Contract reference` section: 2-of-7 trigger note + canonical-table scaffold + Mirrored Surface Checklist scaffold |
| modify | .claude/agents/wd-architect.md | add "owner of the contract-density pattern" duty bullet |
| modify | .claude/agents/wd-reviewer.md | add "detector" duty paragraph incl. light Closed-Contract Drift Check |

### Exact contracts

The three edits are literal. Apply them exactly; do not paraphrase ADR-0031.

**Edit 1 — `docs/specs/_TEMPLATE.md`.** Insert a new `## Contract reference`
section **between** the end of the `### Exact contracts` block (right after its
closing ```js fence) and the `## Implementation notes & constraints` heading.
The inserted section is exactly:

```md
## Contract reference (optional — mark N/A if this WP is not contract-dense)

Fill this in only when the **activation trigger** fires: turn the discipline on
when **two or more** of these are true (ADR-0031's 2-of-7 test):

(i) an API / interface / result **shape** changes;
(ii) a **status or result taxonomy** changes or is introduced;
(iii) structured **input/output parsing, payload validation, or schema acceptance** changes;
(iv) **error / fallback / timeout / cancellation / precedence / reason-code** behavior changes;
(v) the task **crosses an authority boundary** — one component emits or records data but another owns its interpretation or lifecycle;
(vi) **multiple downstream consumers or successor specs** inherit the contract;
(vii) the **same contract must appear in multiple mirrored surfaces**.

If fewer than two are true, replace this whole section with `N/A — <one-line
reason>` and delete the scaffolds below. (The single exception is
contract-level: a specific contract skips its table only when a runnable gate
enforces every one of its facts exhaustively — the gate is then its canonical
source. A general test or harness does not exempt a spec's other contracts.)

When it fires, give each dense contract **one canonical reference table** — the
single place its facts are decided — and have the operative prose cite it
("resolve the core (Table A)") rather than restate it.

### Contract table(s)

<!-- One canonical table per dense contract. Example shape: -->

| Contract | Fact / rule | Value |
|----------|-------------|-------|
|          |             |       |

### Mirrored Surface Checklist

For each canonical table above, name **every surface in this spec that mirrors
it**, so a review finding updates the table and all its mirrors in one pass
(update-all-mirrors) and any new mirror found in review is added here on the
spot (register-new-mirrors):

- [ ] Deliverables-table cells that restate a path or rule
- [ ] Acceptance criteria that assert its facts
- [ ] Verification commands / greps
- [ ] Current-state description
- [ ] Operative prose steps that apply it
```

**Edit 2 — `.claude/agents/wd-architect.md`.** Add this bullet to the `Rules:`
list, immediately **after** the `docs/specs/logbook/` retros bullet and
**before** the `Use GLOSSARY.md terms exactly.` bullet:

```
- Own the contract-density pattern (ADR-0031): recognize when the 2-of-7 activation trigger fires, and for each dense contract author its one canonical reference table — the single place its facts are decided — plus a Mirrored Surface Checklist that registers every mirror (Deliverables cells, acceptance criteria, verification greps, Current-state, operative prose) so each defers to the table. When scattered contract prose slips through, apply the remedial extraction move: pull the contract into one table, update all registered mirrors, and register any new mirror in the same pass.
```

**Edit 3 — `.claude/agents/wd-reviewer.md`.** Add this paragraph immediately
**after** the final "If the *spec* is at fault …" paragraph (i.e. as the last
paragraph of the body, after the "escalate to wd-architect" sentence):

```
**Contract-density detector (ADR-0031).** Also flag contract-dense inline prose that should be one canonical reference table, findings that keep landing on the same contract family across rounds (recommend a canonical-extraction pass), and mirror drift — a Deliverables cell, acceptance criterion, verification grep, or prose step that has fallen out of agreement with its canonical table. Fold in a light **Closed-Contract Drift Check**: confirm a refinement does not silently reinterpret an already-settled canonical contract or promote a mirror to primary — a settled contract's facts change only by editing its table and every registered mirror together. This is a one-paragraph check, not a second gate; route to wd-architect when a canonical table is missing or its mirrors have drifted.
```

## Contract reference

**N/A — this is a 3-file documentation/process-scaffolding change; the 2-of-7
activation trigger does not fire.** Applied honestly: (i)–(iv) concern runtime
API shapes, taxonomies, schema/parsing, and error/precedence behavior — this WP
changes none; there is no data contract here at all. (v) no authority boundary
is crossed (prose scaffolding, not one component recording data another
interprets at runtime). (vi)/(vii) the three edits are complementary role
statements — the template *defines* the section, the architect *authors* it, the
reviewer *detects* its absence — not the *same* contract mirrored across
surfaces that could drift; each edit is verified by its own independent grep.
Zero of the seven are clearly true, so the discipline stays off. Marking this
N/A with its reason is itself the honest demonstration of the gate ADR-0031 asks
for: the architect applied the trigger rather than over-tabularizing a tooling
change (ADR-0031 explicitly warns that over-tabularizing a change that does not
trigger is waste).

## Implementation notes & constraints

- English only in all file content.
- No new npm deps; no code changes; docs/prose only (ADR-0004 holds).
- Insert the template section by **position**, not by replacing existing prose:
  the `### Exact contracts` content and the `## Implementation notes &
  constraints` heading must remain unchanged; the new `## Contract reference`
  section goes strictly between them.
- Copy the three literal blocks in "Exact contracts" verbatim, including the
  Markdown (the `(i)`–`(vii)` list, the checklist checkboxes, the bold spans).
  Do not reword ADR-0031's terms — "canonical reference table", "single source
  of truth", "mirrored surface", "Mirrored Surface Checklist", "2-of-7",
  "Closed-Contract Drift Check" are used exactly.
- The template's new section is **optional**: a spec that is not contract-dense
  marks it `N/A — <reason>`. Preserve that optionality in the wording; do not
  turn it into a required section (that would change the gate — ADR-0031 says
  this is a presentation discipline, not a new gate).
- When uncertain, choose the simpler option and note it under "Decisions made"
  in the PR. Do NOT expand scope to resolve ambiguity.

## Acceptance criteria

Each criterion maps to a verification command below. The three `node -e` checks
prove **completeness, single-occurrence, and correct position/ordering** at once,
so a partial, misplaced, duplicated, or scaffold-truncated edit fails them — a
plain grep for one key phrase would not. Each `node -e` script prints a single
`… OK` line and exits `0` on success, or lists every defect and exits `1`.

- [ ] **Template (`docs/specs/_TEMPLATE.md`).** The `## Contract reference`
      section exists **exactly once** and is complete: the 2-of-7 activation-trigger
      note carrying the phrase `two or more` **and all seven conditions
      `(i)`–`(vii)`**; the `### Contract table(s)` canonical-table scaffold
      including its header row `| Contract | Fact / rule | Value |`; and the
      `### Mirrored Surface Checklist` scaffold with **all five** checklist items.
      It sits **strictly after** the `### Exact contracts` block (proven via its
      pre-existing `function doThing(dir, opts)` line) and **before** the
      `## Implementation notes & constraints` heading — both of which remain
      present and unmodified. Proven by the first `node -e` check.
- [ ] **Architect (`.claude/agents/wd-architect.md`).** The
      `Own the contract-density pattern (ADR-0031)` duty is present **in full and
      exactly once** — 2-of-7 trigger recognition, authoring one canonical
      reference table, the `Mirrored Surface Checklist` registration, and the
      remedial extraction move (update-all-mirrors + register-new-mirrors) —
      inserted **between** the existing `Record incident/chain retros` bullet and
      the `Use GLOSSARY.md terms exactly.` bullet, both of which remain present.
      Proven by the second `node -e` check.
- [ ] **Reviewer (`.claude/agents/wd-reviewer.md`).** The
      `Contract-density detector (ADR-0031)` duty is present **in full and exactly
      once** — flagging dense inline prose, repeated same-contract-family findings,
      and mirror drift, plus the light `Closed-Contract Drift Check` — appended
      **after** the existing `escalate to wd-architect` sentence, with the
      `Review procedure, strictly in this order:` list preserved. Proven by the
      third `node -e` check.
- [ ] `node scripts/check-frontmatter.js` passes (agent files still validate
      against the agent schema; specs still validate).
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

Run every command from the repo root. Each of the three `node -e` checks must
print its `… OK` line (exit `0`); any other output means the edit is partial,
misplaced, duplicated, or truncated — fix it, do not proceed. These are
shell-free literal checks (they run identically under zsh, bash, and CI) that
read the target file and assert the section/duty is present **in full, exactly
once, and in the correct position**.

```bash
# Edit 1 — docs/specs/_TEMPLATE.md: section complete, single, correctly ordered, adjacent content intact
node -e "const t=require('fs').readFileSync('docs/specs/_TEMPLATE.md','utf8');const need=['## Contract reference','two or more','one canonical reference table','(i) an API','(ii) a **status','(iii) structured','(iv) **error','(v) the task','(vi) **multiple','(vii) the **same contract','### Contract table(s)','| Contract | Fact / rule | Value |','### Mirrored Surface Checklist','Deliverables-table cells that restate a path or rule','Acceptance criteria that assert its facts','Verification commands / greps','Current-state description','Operative prose steps that apply it'];const at=s=>t.indexOf(s);const count=s=>t.split(s).length-1;const bad=[];for(const s of need)if(at(s)===-1)bad.push('MISSING: '+s);for(const s of ['## Contract reference','### Contract table(s)','### Mirrored Surface Checklist']){const c=count(s);if(c>1||c<1)bad.push('NOT-EXACTLY-ONCE('+c+'): '+s);}const order=['### Exact contracts','function doThing(dir, opts)','## Contract reference','### Contract table(s)','### Mirrored Surface Checklist','## Implementation notes & constraints'];for(let i=1;i<order.length;i++){if(at(order[i-1])===-1)bad.push('MISSING-ANCHOR: '+order[i-1]);if(at(order[i])===-1)bad.push('MISSING-ANCHOR: '+order[i]);if(at(order[i-1])>=at(order[i]))bad.push('OUT-OF-ORDER: '+order[i-1]+' before '+order[i]);}if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('TEMPLATE OK');"

# Edit 2 — .claude/agents/wd-architect.md: owner-of-pattern duty in full, exactly once, correctly placed
node -e "const t=require('fs').readFileSync('.claude/agents/wd-architect.md','utf8');const need=['Own the contract-density pattern (ADR-0031)','2-of-7 activation trigger fires','one canonical reference table','single place its facts are decided','Mirrored Surface Checklist that registers every mirror','remedial extraction move','update all registered mirrors','register any new mirror in the same pass'];const at=s=>t.indexOf(s);const bad=[];for(const s of need)if(at(s)===-1)bad.push('MISSING: '+s);const c=t.split('Own the contract-density pattern (ADR-0031)').length-1;if(c>1||c<1)bad.push('NOT-EXACTLY-ONCE('+c+'): duty bullet');const order=['Record incident/chain retros as dated','Own the contract-density pattern (ADR-0031)','Use GLOSSARY.md terms exactly.'];for(let i=1;i<order.length;i++){if(at(order[i-1])===-1)bad.push('MISSING-ANCHOR: '+order[i-1]);if(at(order[i])===-1)bad.push('MISSING-ANCHOR: '+order[i]);if(at(order[i-1])>=at(order[i]))bad.push('OUT-OF-ORDER: '+order[i-1]+' before '+order[i]);}if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('ARCHITECT OK');"

# Edit 3 — .claude/agents/wd-reviewer.md: detector duty + Closed-Contract Drift Check in full, exactly once, appended after the escalate sentence
node -e "const t=require('fs').readFileSync('.claude/agents/wd-reviewer.md','utf8');const need=['Contract-density detector (ADR-0031)','one canonical reference table','same contract family across rounds','canonical-extraction pass','mirror drift','Closed-Contract Drift Check','does not silently reinterpret an already-settled canonical contract','route to wd-architect when a canonical table is missing'];const at=s=>t.indexOf(s);const count=s=>t.split(s).length-1;const bad=[];for(const s of need)if(at(s)===-1)bad.push('MISSING: '+s);for(const s of ['Contract-density detector (ADR-0031)','Closed-Contract Drift Check']){const c=count(s);if(c>1||c<1)bad.push('NOT-EXACTLY-ONCE('+c+'): '+s);}if(at('Review procedure, strictly in this order:')===-1)bad.push('MISSING-ANCHOR: Review procedure');const a=at('Two failed review rounds on the same WP means the spec is the bug');const b=at('Contract-density detector (ADR-0031)');if(a===-1)bad.push('MISSING-ANCHOR: escalate sentence');if(a>=b)bad.push('OUT-OF-ORDER: detector must follow escalate sentence');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('REVIEWER OK');"

node scripts/check-frontmatter.js
npm run lint
```

## Out of scope (do NOT do these)

- The codex-review runbook loop circuit-breaker (ADR-0031 point 4) — landed
  separately as a direct edit to `docs/runbooks/codex-review.md`, not WP-gated;
  do not touch that file here.
- Retrofitting `WP-a9-incident-runbook` or `WP-a10-reap-mechanism` with a
  Mirrored Surface Checklist — ADR-0031 records them as extraction precedent /
  cautionary case, not as work this WP performs.
- Any change to `docs/adr/0031-*.md`, `docs/GLOSSARY.md`, `CLAUDE.md`, or
  `AGENTS.md` — none is in this WP's boundary.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled `docs(specs): ADR-0031 template + agent duties (WP-contract-reference-tables)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
