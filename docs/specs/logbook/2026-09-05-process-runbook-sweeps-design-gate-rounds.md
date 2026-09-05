---
date: 2026-09-05
title: "Design-gate rounds: WP-process-runbook-sweeps"
related_wps: [WP-process-runbook-sweeps]
---

# Design-gate rounds — WP-process-runbook-sweeps

Round zero is the architect's own measurement, internal coherence pass and
both-directions sentinel proof (`docs/runbooks/codex-review.md`, "Internal
coherence pass"). The orchestrator's clean-context executors (template
conformance, internal coherence) and the external double-channel rounds are
appended below it.

## Round zero — architect, 2026-09-05, tree at `98a8b49a`

`98a8b49a` is `origin/main`. The worktree
`/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/runbook-sweeps-design`
(branch `docs/wp-process-runbook-sweeps`) was created from it and holds **docs
only** — the matured spec and this record, plus the `node_modules` symlink lint
needs. Every measurement below is against `98a8b49a`.

**No measurement mutated the worktree.** The compliant, violating and
deliverable-absent states are scratch copies of the five target files under the
session scratchpad (`state-green/`, `state-violating/`, `state-absent/`); the
untouched-tree run is read-only.

**Pasted tool output in this record is normalized in one respect only:**
trailing whitespace was stripped from 35 lines so `git diff --check` exits 0
(round-1 finding R1-G). The stripped characters were line-end spaces inside
quoted excerpts and blank neighbour lines in range dumps; no visible character
of any pasted output was changed.

**Every measurement was run FROM A FILE**, never through a shell one-liner with
nested quotes (`codex-review.md:350-357`). The drivers are `measure-bound.js`,
`find-provenance.js`, `find-missing.js`, `check-ranges.js`,
`prove-sentinels.sh`, `run-rest.sh` and `coherence.js`.

### 0.1 STOP CRITERION — pinned BEFORE round 1 (SUPERSEDED after round 1)

> **Round 1 ran under the text below, and it is kept verbatim for that
> reason.** Finding R1-D then measured it as neither exhaustive nor
> exclusive, so it is superseded by the ordered decision list under
> "Round 2 — criterion pinned in advance". The criterion has ONE canonical
> text at a time; this block is the historical record of what round 1 was
> judged against, not a second live authority.

Pinned here per `codex-review.md:72-81`, before any adversarial round runs.
Materiality bands are HANDOVER's: **A** = silent wrong behavior with a data-loss
or security consequence; **B** = caught downstream; **C** = hygiene.

- **CLOSES the loop.** A round whose findings are all LIGHT — about this spec's
  own verification machinery (a sentinel literal, a table's formatting, a
  citation range) — and none of which changes (a) a rule's disposition in Table
  A, (b) a rule's landing file in Table B, or (c) the operative content a landed
  rule must carry. Those are fixed in place, verified by re-running the sentinel
  gate and `coherence.js`, and the loop closes with no further external round
  (`codex-review.md:140-152`, weighted closure).
- **ESCALATES to a DESIGN QUESTION.** Any finding that changes a Table A
  disposition — a rule measured ALREADY BOUND turns out unbound, or the reverse.
  That falsifies the measurement the whole WP rests on, so the answer is to
  re-derive the set mechanically, not to patch the row.
- **ESCALATES to an OWNER RULING.** Any finding arguing that a rule should not
  land at all, or should land in a file outside the Deliverables table. That is a
  scope change and the owner's act (`codex-review.md:44-45`, "a hardening
  proposal becomes text only on an explicit owner yes"; `:50-57`, diff size does
  not measure contract impact). Owner items O1–O4 in the spec are the standing
  form of this.
- **FALLBACK.** If the sentinel design itself draws findings in two consecutive
  rounds, drop the per-rule sentinel gate and verify Table B by `npm run lint`
  plus the reviewer's read. Verification machinery may grow only to guard a
  product behavior, in the smallest form that guards it
  (`codex-review.md:154-164`).
- **The same-family repeat that fires ADR-0031** (`codex-review.md:376-383`):
  two consecutive rounds landing a finding on the **rule-disposition contract** —
  any row of Table A or Table B, in any of their registered mirrors. The response
  is a fresh mechanical re-measurement rewritten into one Table A, with every
  registered mirror updated in the same commit; not a third row patch.

### 0.2 Surfaces swept (18), and the sweep demonstrably read them

A zero-hit sweep is evidence only if it read its targets (`codex-review.md:391-399`).
`measure-bound.js` reads each surface by absolute path, fails loudly on a
missing one, and prints the byte count it flattened:

```text
SURFACES READ: 18 of 18
  docs/runbooks/codex-review.md  (407 lines, 23799 flat chars)
  docs/runbooks/spec-authoring.md  (76 lines, 4699 flat chars)
  docs/runbooks/incident.md  (882 lines, 58217 flat chars)
  docs/runbooks/triage.md  (11 lines, 792 flat chars)
  docs/runbooks/release.md  (15 lines, 2293 flat chars)
  docs/runbooks/codex-pin-bump.md  (46 lines, 1982 flat chars)
  docs/runbooks/gws-broker.md  (126 lines, 6345 flat chars)
  docs/runbooks/secret-incident.md  (101 lines, 5722 flat chars)
  docs/runbooks/scheduler-and-executable-integrity.md  (164 lines, 9172 flat chars)
  docs/runbooks/review-prompts/adversarial.md  (95 lines, 4024 flat chars)
  docs/runbooks/review-prompts/pr-rubric.md  (106 lines, 8184 flat chars)
  .claude/agents/wd-architect.md  (28 lines, 3424 flat chars)
  .claude/agents/wd-reviewer.md  (22 lines, 2679 flat chars)
  .claude/agents/wd-docs.md  (18 lines, 1396 flat chars)
  .claude/agents/wd-researcher.md  (27 lines, 1577 flat chars)
  docs/specs/_TEMPLATE.md  (147 lines, 6394 flat chars)
  docs/specs/README.md  (21 lines, 2327 flat chars)
  CLAUDE.md  (74 lines, 4132 flat chars)
```

### 0.3 The disposition measurement (Table A's evidence)

Whitespace-flattened, claim-shaped probes over all 18 surfaces. `ZERO HITS`
under a rule is what Table A records as UNBOUND; a hit is the text Table A cites
in "Already binds at". Probe ids R1–R13 here are the **stub's thirteen bullets**;
Table A's R01–R19 are the atomic rules they expand into.

```text
==== R1  proof of a fix = the re-run ====
  [docs/runbooks/codex-review.md:~L366] /paste[^.]{0,60}(output|reproduction)/
      …aimed a capability, so the bias is not in one direction: the defect is the missing run. **Paste the reproduction or do not state the behaviour** — and when someone else's claim cannot be reproduced, the…
  [docs/runbooks/codex-review.md:~L126] /reading is not evidence/
      …erion that cannot discriminate — or cannot be satisfied at all — is a round-zero finding. Reading is not evidence: measured in one package, a non-discriminating fixture survived four read-only rounds, a …
  [docs/runbooks/codex-review.md:~L358] /claim to be RUN, not read/
      …te once, and compare against the literal there. - **A claim about how a tool behaves is a claim to be RUN, not read.** Four instances on PR #124 alone: a spec citing a shell fence's options that the fence …
  [docs/runbooks/spec-authoring.md:~L31] /paste[^.]{0,60}(output|reproduction)/
      …rately broken state — so a check that can never fail is caught before anyone believes it. Paste both outputs. - That deliberately-broken state includes the DELIVERABLE-ABSENT case, not only the vio…
  [.claude/agents/wd-reviewer.md:~L12] /paste[^.]{0,60}(output|reproduction)/
      …. **Acceptance criteria**: re-run the spec's verification commands yourself. Do not trust pasted output. 3. **Contract fidelity**: signatures, CLI flags, file formats, and literal outputs must …
  [docs/specs/_TEMPLATE.md:~L126] /paste[^.]{0,60}(output|reproduction)/
      …h surface marks it `N/A — <what the WP ships instead>`. ## Verification steps (run these; paste output in the PR) ```bash npm test -- --test-name-pattern thing npm run lint ``` ## Out of scope…
  [CLAUDE.md:~L56] /paste[^.]{0,60}(output|reproduction)/
      …1). - Every spec has literal verification commands. All must pass before you open the PR; paste their output into the PR body. ## Git discipline - Branch: `wp/<slug>`. Never commit to main. The one …

==== R2  certify from the tool own summary ====
  [docs/runbooks/codex-review.md:~L291] /what was EXECUTED/
      …e PR branch's diff against its merge base with `main`; no focus text. - The report states what was EXECUTED, not only what was read: did the test suite actually run, and with what exit status. A ve…

==== R3  +0 delta on an early-dying test ====
  ZERO HITS across all 18 surfaces

==== R4  +0/-0 beside a claimed content change ====
  ZERO HITS across all 18 surfaces

==== R5  mutation applied; guard death; canary arity ====
  ZERO HITS across all 18 surfaces

==== R6  claim-level sweeps ====
  [docs/runbooks/codex-review.md:~L391] /zero-hit sweep/
      …al form: read the VALUE the tool produced, not the value the pipeline last touched. - **A zero-hit sweep is evidence only if the sweep demonstrably read its targets.** A grep that failed to open…
  [docs/runbooks/spec-authoring.md:~L61] /whitespace-?flatten/
      …g wherever any sentence states it. Sweep the concept (one pattern over the claim's shape, whitespace-flattened so a hard wrap cannot hide a hit), then verify each hit is corrected text or a named wi…
  [docs/runbooks/spec-authoring.md:~L56] /sweep[^.]{0,80}claim/
      …and no mirror checklist can see inside one cell. The re-read is the only tool that can. - Sweep for the CLAIM, not for any wording of it — and across every spec in the family, not only the one being …
  [docs/runbooks/spec-authoring.md:~L60] /sweep[^.]{0,80}claim/
      …uthor remembers writing, and a count that moved is wrong wherever any sentence states it. Sweep the concept (one pattern over the claim's shape, whitespace-flattened so a hard wrap cannot hide a hit), then verify each hit is …

==== R7  registered mirrors move together ====
  [docs/runbooks/codex-review.md:~L380] /mirror[^.]{0,80}(move|lockstep|same commit|one pass)/
      …ts mirrored surfaces per ADR-0031's Mirrored Surface Checklist, then resume the loop. The Mirrored Surface Checklist is the stronger day-to-day mechanism (it keeps mirrors in lockstep up front); this breaker is the backstop for when scattered contract prose slipped through…
  [docs/runbooks/codex-review.md:~L379] /Mirrored Surface Checklist/
      …ract into one canonical reference table and register its mirrored surfaces per ADR-0031's Mirrored Surface Checklist, then resume the loop. The Mirrored Surface Checklist is the stronger day-to-day mechanis…
  [docs/runbooks/codex-review.md:~L380] /Mirrored Surface Checklist/
      …ts mirrored surfaces per ADR-0031's Mirrored Surface Checklist, then resume the loop. The Mirrored Surface Checklist is the stronger day-to-day mechanism (it keeps mirrors in lockstep up front); this breake…
  [.claude/agents/wd-architect.md:~L22] /Mirrored Surface Checklist/
      …uthor its one canonical reference table — the single place its facts are decided — plus a Mirrored Surface Checklist that registers every mirror (Deliverables cells, acceptance criteria, verification greps,…
  [docs/specs/_TEMPLATE.md:~L88] /mirror[^.]{0,80}(move|lockstep|same commit|one pass)/
      … Surface Checklist For each canonical table above, name **every surface in this spec that mirrors it**, so a review finding updates the table and all its mirrors in one pass (update-all-mirrors) and any new mirror found in review is added here on the spot (regist…
  [docs/specs/_TEMPLATE.md:~L90] /update-all-mirrors|register-new-mirrors/
      …that mirrors it**, so a review finding updates the table and all its mirrors in one pass (update-all-mirrors) and any new mirror found in review is added here on the spot (register-new-mirrors): - […
  [docs/specs/_TEMPLATE.md:~L91] /update-all-mirrors|register-new-mirrors/
      …e pass (update-all-mirrors) and any new mirror found in review is added here on the spot (register-new-mirrors): - [ ] Deliverables-table cells that restate a path or rule - [ ] Acceptance criteria th…
  [docs/specs/_TEMPLATE.md:~L86] /Mirrored Surface Checklist/
      …pe: --> | Contract | Fact / rule | Value | |----------|-------------|-------| | | | | ### Mirrored Surface Checklist For each canonical table above, name **every surface in this spec that mirrors it**, so a…

==== R8  ADR-0031 circuit breaker ====
  [docs/runbooks/codex-review.md:~L376] /circuit.?break/
      …t catches a gate which will punish the implementer for doing the work correctly. - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a finding on the *same* contract fa…
  [docs/runbooks/codex-review.md:~L70] /two consecutive[^.]{0,100}(round|contract|kind)/
      …dditions that each looked defensible alone and never faced the aggregate question. - When two consecutive rounds land findings of the same kind, the next step is a design question, never another textual patch. - A design loop states …
  [docs/runbooks/codex-review.md:~L376] /two consecutive[^.]{0,100}(round|contract|kind)/
      …h the implementer for doing the work correctly. - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a finding on the *same* contract family, stop fixing finding-by-finding and do a contract-**extraction** pass instead: pul…
  [.claude/agents/wd-reviewer.md:~L21] /extraction pass/
      …ndings that keep landing on the same contract family across rounds (recommend a canonical-extraction pass), and mirror drift — a Deliverables cell, acceptance criterion, verification grep, or pro…

==== R9  materiality bands A/B/C ====
  ZERO HITS across all 18 surfaces

==== R10 form insufficiency vs predicate defect ====
  ZERO HITS across all 18 surfaces

==== R11 enumerate-your-own-good ====
  [docs/runbooks/codex-review.md:~L211] /enumerat/
      …ported as one rather than silently re-verified. **If a spec's executable claims cannot be enumerated from it, the spec is not dispatchable and goes back to wd-architect** — the same routin…
  [docs/runbooks/incident.md:~L132] /enumerat/
      …ce — a surviving job re-arms itself and catch-up on the next `sync`) AND an **independent enumeration of Wienerdog OS registrations returns nothing** — the per-job OS unregister is best-ef…
  [docs/runbooks/incident.md:~L148] /enumerat/
      …rm's own command (the Table B "Stop-the-catch-up" column shows the shapes) and re-run the enumeration until it is empty. **Table C — Restore rules (step 7).** Restore **source** = the `con…
  [docs/runbooks/incident.md:~L241] /enumerat/
      …y AND `config.yaml` lists zero `jobs:` entries AND the Table B **independent per-platform enumeration** of Wienerdog OS registrations (launchd labels / systemd units / `\Wienerdog\` tasks)…
  [docs/runbooks/incident.md:~L366] /enumerat/
      …fy (all five checks, including the zero-`jobs:` check and the independent OS-registration enumeration) passed. - Run `wienerdog sync` — it re-renders a clean `$CORE/state/digest.md` and re…
  [docs/runbooks/incident.md:~L185] /allowlist|denylist|deny list/
      …note>` is one of these **fixed short names** only (verified against `memory.js`'s `KNOWN` allowlist); it accepts **no** arbitrary file path (no `06-Identity/…`, no `..`, no `/`) and has no …
  [docs/runbooks/codex-pin-bump.md:~L5] /allowlist|denylist|deny list/
      …P-100) fences tool/external output as untrusted and trusts `message` roles by an explicit allowlist. That verification is tied to a specific codex-cli version, recorded in `src/core/support…

==== R12 whole cells; cite names not positions ====
  [docs/runbooks/spec-authoring.md:~L51] /whole cell|cell WHOLE|cell\s+whole/
      …s — what has no content cannot go stale. - After rewriting a canonical cell, re-read that cell WHOLE for a sentence the rewrite just falsified. The edit habit that survives every cross-surfa…
  [docs/runbooks/spec-authoring.md:~L51] /re-?read that cell/
      …ing and points — what has no content cannot go stale. - After rewriting a canonical cell, re-read that cell WHOLE for a sentence the rewrite just falsified. The edit habit that survives every cross…

==== R13 frozen tip; same tip; pinned reading; declined grants ====
  [docs/runbooks/codex-review.md:~L296] /porcelain/
      …ngs and neither disclosed it.) - Review is read-only, checked mechanically: `git status --porcelain` in the reviewed checkout is byte-identical before and after the run, or the run is inval…
  [docs/runbooks/codex-review.md:~L72] /stop criterion/
      …e next step is a design question, never another textual patch. - A design loop states its STOP CRITERION in the round record BEFORE the first adversarial round, and re-states it whenever a HEAVY…
  [docs/runbooks/codex-review.md:~L16] /Both run/
      …rge gate (spec-fidelity review); Codex is an independent second opinion on the same diff. Both run; Gyula merges only when both are clean or every finding is dispositioned. 3. **Dispatch-t…
  [docs/runbooks/codex-review.md:~L67] /Both run/
      …s its place by the value it protects, named at the moment of adding — or it is not added. Both runaway loops this repo has survived were additions that each looked defensible alone and nev…
```

### 0.4 The provenance measurement (Table A's "Paid for by")

```text
##### memory/lessons/inbox.md (1421 lines)
  --- R1 proof-of-a-fix: 0 hit(s)
  --- R2 tool own summary: 1 hit(s)
    memory/lessons/inbox.md:1247  /tool'?s own summary/
      - WP-dream-promote-in-workspace: **Read the tool's own summary, not your regex's match count.** `mirror-walk` reports `UNRESOLVED — 12`; a hand-rolled line counter said 13, and 13 was reported repeatedly. The load-bearing claim (delta +0) survived, the figure did not.
  --- R3 +0 delta early death: 2 hit(s)
    memory/lessons/inbox.md:1245  /\+0[^.]{0,80}delta/
      - WP-dream-promote-in-workspace: **A canary that differs from the exploit by ARITY proves nothing.** The three-token `--index-output` canary went green against a set that accepted the two-token form; argument count is the first thing shape-equality decides, so such a canary dies before reaching the slot under test. The `+0`-delta lesson, one level in.
    memory/lessons/inbox.md:1247  /delta[^.]{0,80}\+0/
      - WP-dream-promote-in-workspace: **Read the tool's own summary, not your regex's match count.** `mirror-walk` reports `UNRESOLVED — 12`; a hand-rolled line counter said 13, and 13 was reported repeatedly. The load-bearing claim (delta +0) survived, the figure did not.
  --- R4 +0/-0 signature: 2 hit(s)
    memory/lessons/inbox.md:345  /git show HEAD:/
      - WP-launcher-no-self-resync-republish (spec loop): a verification step that reads the **working tree** cannot prove anything about what gets pushed. When a gate's claim is about the committed state, read the blob (`git show HEAD:<path>`) *and* refuse to run against a dirty tree; either guard alone leaves the other half of the hole open.
    memory/lessons/inbox.md:1252  /\+0\s*\/\s*[−–-]\s*0/
      - WP-dream-promote-in-workspace: **`+0/−0` with a claimed content change is a FAILURE SIGNATURE, not a clean rename.** `git mv` stages the rename; an edit made afterwards is unstaged, and a bare `git commit` ships the rename alone — so the spec landed still reading `status: In-Review`. Third occurrence of this signature (#19, #24, #61). The deeper error was in the reporting: the diffstat printed `
  --- R5 mutation applied / arity: 6 hit(s)
    memory/lessons/inbox.md:167  /canar/
      - WP-082 (canary runner spec bug): the spec's EXPENSIVE canary used `init --yes` (vault never registered in config → dream aborts at the git-repo gate → VACUOUS PASS, the injection test never ran) and planted the poison transcript in the REAL ~/.claude/projects (tonight's real dream would consume it). Correct wiring is the scenario harness's: `init --fresh-vault --yes` + WIENERDOG_CLAUDE_DIR overr
    memory/lessons/inbox.md:251  /canar/
      - A1 spec phase (maintainer): a tool-execution check must key on ground-truth side effects (canary token absent from output, out-of-staging file absent) + `permission_denials`, NEVER a magic string in the model's output — the model echoes instruction strings (e.g. "BASH-OK") in its report though the tool never ran.
    memory/lessons/inbox.md:1243  /mutation was APPLIED/
      - WP-dream-promote-in-workspace: **Prove a mutation was APPLIED before believing its result.** Shell escaping silently mangled injected code and three "greens" were unapplied mutations. Every cell now greps its own marker and prints the injected line before the test runs.
    memory/lessons/inbox.md:1245  /\barity\b/
      - WP-dream-promote-in-workspace: **A canary that differs from the exploit by ARITY proves nothing.** The three-token `--index-output` canary went green against a set that accepted the two-token form; argument count is the first thing shape-equality decides, so such a canary dies before reaching the slot under test. The `+0`-delta lesson, one level in.
    memory/lessons/inbox.md:1263  /canar/
      - WP-scheduler-mutation-home-authority: a canary argv proves "nothing was spawned" better than a status code — a refusal and a spawn that exits 1 are indistinguishable by status.
    memory/lessons/inbox.md:1273  /\barity\b/
      - WP-show-slot-own-value-kind: a canary that differs from its exploit in ARITY proves nothing about the exploit — it dies on length equality before reaching the slot under test. The show vector is two tokens BECAUSE the pinned shape is two tokens; a three-token probe would have certified a rejection the set never made. Same lesson the read-tree gap cost, one shape over.
  --- R6 claim sweeps: 1 hit(s)
    memory/lessons/inbox.md:1246  /whitespace-?flatten/
      - WP-dream-promote-in-workspace: **A line-oriented grep certifies a false all-clear on exactly the surfaces that matter.** A claim sweep found 12 occurrences and reported all swept; whitespace-flattened it found 15, two unswept. Then a noun-only pattern returned ZERO for the product's own statement, which is pronominal — so that file was swept by hand but was never inside its own proof. Flattened
  --- R7 mirrors same commit: 4 hit(s)
    memory/lessons/inbox.md:313  /same commit/
      - WP-dream-plaintext-trigger (process): the maintainer-amendment loop (implementer flags a Deliverables gap under Discovered issues → maintainer amends the table with a provenance note → implementer applies in the same commit) is now the standard remedy for the recurring "shared constant literal-matched in an unlisted test file" spec under-scope.
    memory/lessons/inbox.md:445  /registered mirror/
      enforcement, no registered mirror may live there; move the prose out rather
    memory/lessons/inbox.md:521  /same commit/
      drifts in the same commit that changes them — B3b did, in the very round it was
    memory/lessons/inbox.md:1250  /same commit/
      - WP-dream-promote-in-workspace: **A registered mirror pair can break in the very pass that registers it.** The canonical row was corrected while its executable copy kept the rejected claim; separately, a docs commit landed *after* the fix it describes and recorded the pre-fix state as current. Whichever copy moves, move the other in the same commit.
  --- R8 circuit breaker: 2 hit(s)
    memory/lessons/inbox.md:743  /circuit.?break/
      circuit-breaker never fired.
    memory/lessons/inbox.md:1373  /circuit.?break/
      - WP-quarantine-preserve-durability: NAME THE ADVERSARY BEFORE PINNING OBJECTS. Two consecutive review rounds each found another unpinned object (the artifact's inode, then the destination's ownership, the directory inodes, the symlink form of the check) because the protocol had never said who it defends against. A protocol with no named adversary has no fixed point: every round finds one more win
  --- R9 materiality bands: 0 hit(s)
  --- R10 form vs predicate: 1 hit(s)
    memory/lessons/inbox.md:1242  /FORM insufficiency/
      - WP-dream-promote-in-workspace: **Separate FORM insufficiency from a PREDICATE defect before deciding whether a loop reopens.** Form insufficiency means the deciding facts never reach the observation point (a git hook — it never exists in argv). A predicate defect means the facts are at the seam and the question is wrong. Only the first is a design question; conflating them either stops a fixable
  --- R11 enumerate own good: 3 hit(s)
    memory/lessons/inbox.md:1241  /enumerat[^.]{0,60}(BAD|GOOD)/
      - WP-dream-promote-in-workspace: **Enumerating the BAD is unclosable when the grammar isn't ours; enumerating our OWN GOOD is closable.** Two guard directions died by measurement — classifying git's verb (defeated by `--attr-source`, a value-consuming global option added in 2.40) and identifying the target index (defeated by `read-tree --index-output`, a *subcommand* flag no global-option replay r
    memory/lessons/inbox.md:1264  /enumerat[^.]{0,60}(BAD|GOOD)/
      - WP-scheduler-mutation-home-authority: an "enumerate your own good" probe is only as good as its inventory of its own names — Wienerdog uses three structurally different identifier shapes; derive each from the generator that writes it and pin with parser tests over real client output; and match at the identifier BOUNDARY, never by substring.
    memory/lessons/inbox.md:1403  /enumerat[^.]{0,60}(BAD|GOOD)/
      - WP-audit-d-code-derived-recipients: a verification that ENUMERATES THE FORBIDDEN is unclosable; one that enumerates YOUR OWN INTENDED OBJECT is closable. V5 was wrong four times — over-strict, a denylist, names-only, gmail-only without a key/name tie — and every fix moved it further toward comparing the complete intended record. Enumerate the good.
  --- R12 whole cells / cite names: 1 hit(s)
    memory/lessons/inbox.md:1230  /whole cell/
      - quarantine-surface: grep-based mirror walks are blind to intra-cell falsification and vocabulary-shifted restatement — the PR-gate reviewer must read whole cells (wd-reviewer's class diagnosis on PR #33).
  --- R13 frozen tip / pinned reading / grants: 6 hit(s)
    memory/lessons/inbox.md:33  /porcelain/
      - WP-017: use git status --porcelain -z -uall so files in brand-new dirs are listed individually for frontmatter gating (default -u collapses to the dir).
    memory/lessons/inbox.md:196  /freeze/
      - WP-110: gating a dispatch chokepoint with a single `requireCapability` immediately after handler resolution (before parseFlags/getPaths/ensureGoogleReady/getServices) is a clean blunt-freeze pattern — no per-verb branching, no missable path, and the `opts.profile` seam composes without touching env/argv.
    memory/lessons/inbox.md:198  /freeze/
      - WP-112: a golden-file-based behavior freeze can miss non-golden tests asserting the same behavior through different fixtures (here `layout.test.js` power-user + `adopt-e2e.test.js`); grep the whole tree for the frozen behavior before scoping a Deliverables table. The implementer correctly stopped at the boundary and reported it; the owner amended the spec mid-flight and the same agent finished —
    memory/lessons/inbox.md:347  /porcelain/
      - WP-launcher-no-self-resync-republish (spec loop): `git status` is not a truth oracle about the worktree: `assume-unchanged` and `skip-worktree` make it lie by design. Any gate that treats an empty `git status --porcelain` as proof must first assert `git ls-files -v` shows no lowercase tag and no `S`.
    memory/lessons/inbox.md:1253  /freeze/
      - WP-dream-promote-in-workspace: **Relaunch a dead gate fresh, never resumed, and re-verify the freeze first.** Agents died mid-run five times; each time the tip and porcelain hash were checked before anything else. A shortened brief did not help, which refuted the context-length hypothesis and identified the lane itself as down.
    memory/lessons/inbox.md:1366  /porcelain/
      - WP-quarantine-banner-location: never write into a worktree while a review gate is reading it. One untracked file the orchestrator added mid-run voided the round-4 Codex-plugin verdict on its own read-only porcelain check, and the channel had to be re-run on a later tip. Adjudicate the findings anyway (the runbook requires it), but the verdict does not count.

##### docs/HANDOVER.md (382 lines)
  --- R1 proof-of-a-fix: 2 hit(s)
    docs/HANDOVER.md:342  /proof of (a |the )?fix/
      - **The proof of a fix is the re-grep/re-run, never the edit.** Report what
    docs/HANDOVER.md:343  /not what you intended/
      the tool printed, not what you intended.
  --- R2 tool own summary: 1 hit(s)
    docs/HANDOVER.md:344  /tool'?s own summary/
      - **Read the tool's own summary, not your regex's match count.**
  --- R3 +0 delta early death: 2 hit(s)
    docs/HANDOVER.md:345  /\+0[^.]{0,80}delta/
      - **A +0 test delta on a test that dies before your change proves nothing**
    docs/HANDOVER.md:379  /\+0[^.]{0,80}delta/
      failure is environmental; see the +0-delta rule above before trusting it.
  --- R4 +0/-0 signature: 2 hit(s)
    docs/HANDOVER.md:347  /\+0\s*\/\s*[−–-]\s*0/
      - **`+0/−0` beside a claimed content change is a failure signature** (a
    docs/HANDOVER.md:348  /git show HEAD:/
      `git mv` + unstaged edit). Prove the commit (`git show HEAD:<path>`), not
  --- R5 mutation applied / arity: 2 hit(s)
    docs/HANDOVER.md:350  /mutation was APPLIED/
      - **Prove a mutation was applied before believing its matrix** (grep the
    docs/HANDOVER.md:351  /injected marker/
      injected marker); a guard must notice its own death.
  --- R6 claim sweeps: 2 hit(s)
    docs/HANDOVER.md:362  /whitespace-?flatten/
      - **Sweep claims, not sentences**: whitespace-flattened, pronoun-aware,
    docs/HANDOVER.md:363  /family-wide/
      family-wide; a file swept by hand is not inside its own proof.
  --- R7 mirrors same commit: 2 hit(s)
    docs/HANDOVER.md:199  /registered mirror/
      > — with V2 and the test file as registered mirrors); the adopt-e2e Deliverables
    docs/HANDOVER.md:221  /registered mirror/
      > `reports_dir` join — with V2 and the test file as registered mirrors); the
  --- R8 circuit breaker: 6 hit(s)
    docs/HANDOVER.md:151  /circuit.?break/
      > | 3b successor | `WP-quarantine-preserve-durability` | **Done** | design loop #220 (`bb58e398`), implementation #221 (`c891e0b6`), filed in this pass | **Design loop: round zero plus ELEVEN double-channel rounds** (plugin gate + hermetic shadow on every one, twenty-two raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-quarantine-preserve-durability-design-gate-rounds.md`). *
    docs/HANDOVER.md:190  /circuit.?break/
      > | 3b | `WP-quarantine-banner-location` | **Done** | design loop #217 (round zero + 5 double-channel rounds; **circuit breaker at round 2** — two consecutive A findings on "is the pointer's destination real?" were settled by DELETING the defect: row L7 reorders the undelivered-record print to step 17b, ahead of every durable write, which removes the crash window instead of narrowing the sentence
    docs/HANDOVER.md:215  /circuit.?break/
      > | 4→ | `WP-dot-segment-denial` | **Done** | design loop #214 (round zero + 3 double-channel rounds; circuit breaker at round 2 — two hand-shaped sample families replaced by EQUALITY with a one-line reference predicate over a seeded full-alphabet generator; round 3 hardened the grading's inputs), implementation #215 (three-round triple-channel PR gate: PATH stub for the adopt round-trip test, `re
    docs/HANDOVER.md:236  /circuit.?break/
      > | 4→ | `WP-instruction-basename-currency` | **Done** | design loop #210 (round zero + 3 double-channel rounds, circuit breaker at round 2 — the loop closed by DELETING machinery: whole-artifact byte compares + one hand-written literal set), implementation #211 (two-round triple-channel PR gate), filed #212 | `INSTRUCTION_BASENAMES` is nine names; `docs/instruction-file-inventory.md` is GENERATED
    docs/HANDOVER.md:359  /two consecutive review rounds/
      - **Two consecutive review rounds on one contract family → extract the
    docs/HANDOVER.md:360  /never a third patch/
      contract (ADR-0031), never a third patch.** Measured: two rounds of
  --- R9 materiality bands: 3 hit(s)
    docs/HANDOVER.md:364  /materiality/
      - **Materiality bands on every review round** (A: silent wrong behavior with
    docs/HANDOVER.md:366  /decision-grade/
      without bands are not decision-grade.
    docs/HANDOVER.md:372  /\bbanded\b/
      C-only → proceed; anything above C returns banded"), and a stop criterion
  --- R10 form vs predicate: 2 hit(s)
    docs/HANDOVER.md:355  /FORM insufficiency/
      - **Distinguish FORM insufficiency from a PREDICATE defect** before reopening
    docs/HANDOVER.md:356  /observation point/
      a review loop: form = the deciding facts never reach the observation point;
  --- R11 enumerate own good: 2 hit(s)
    docs/HANDOVER.md:352  /enumerat[^.]{0,60}(BAD|GOOD)/
      - **Enumerating the BAD is unclosable when the grammar isn't yours;
    docs/HANDOVER.md:353  /enumerat[^.]{0,60}(BAD|GOOD)/
      enumerating your OWN GOOD is closable** — the promote-in guard's central
  --- R12 whole cells / cite names: 0 hit(s)
  --- R13 frozen tip / pinned reading / grants: 2 hit(s)
    docs/HANDOVER.md:370  /same tip/
      - The review-gate flow that converged: two independent gates on the SAME tip,
    docs/HANDOVER.md:371  /pinned reading/
      both verdicts on that tip, a pinned reading before each round ("clean or
```

Targeted follow-up for the three claims the first pass could not place:

```text
##### memory/lessons/inbox.md
  --- cite names not positions: 27
    memory/lessons/inbox.md:37 /positional/
      - WP-011: two-word dispatch keys (gmail search) vs group-word keys (auth/cal/drive) — router branches on group to avoid eating a positional as the verb.
    memory/lessons/inbox.md:48 /positional/
      - WP-021: dual-write (structured flags + duplicated positionals) is the resolution when a dispatch layer must serve both structured rows and positional-re-parsing bridges — but downstream rows must then prefer the structured flag (the gmail read --id bug).
    memory/lessons/inbox.md:97 /anchor/
      - WP-045/046: registry responses are untrusted input — strict semver shape-gate before storage (ASCII \d, non-m $ anchor, bounded length) is what keeps instruction-shaped text out of the injected digest; prove module hermeticity by re-running tests with https/net/dns monkey-patched to throw. Injectable seams that aren't self-bounding (opts.fetchLat
    memory/lessons/inbox.md:113 /anchor/
      - WP-055 (security, 4th spec-prescribed defect caught pre-merge): a version/name string flowing into a filesystem path must be validated with a FULLY-ANCHORED (^...$) regex that rejects / and .. — start-anchored-only (`^[0-9]+\.[0-9]+\.[0-9]+`) accepts `1.2.3/../../x` and turns a verified download into arbitrary-write. Twin of the WP-022 traversal,
    memory/lessons/inbox.md:115 /anchor/
      - WP-055: end-anchoring a SHELL regex (`…$`) is necessary but not sufficient — grep -qE is line-oriented, so a multiline value with one good line still matches; the real question is whether the EXTRACTION step can inject a newline. Trace validator AND parser together.
    memory/lessons/inbox.md:119 /anchor/
      - PowerShell engine facts now institutional: .NET regex `$` matches before a trailing newline — use \A...\z for untrusted-identifier anchors (^...$ is NOT a full anchor there); `exit` anywhere in an irm|iex-evaluated script kills the USER'S host window — return an [int] from Main and centralize exit at one dot-source disposition point keyed on $MyI
    memory/lessons/inbox.md:270 /anchor/
      - A7 spec phase (Felho side): before designing ANY content-hash gate over a third-party binary, observe its real update mechanism live — claude's native installer shipped four version files in three days (new version-named file + symlink repoint), so a sha256/size/exact-realpath pin would alarm on every legitimate auto-update and train the user to
    memory/lessons/inbox.md:272 /anchor/
      - A7 spec phase (Felho side, owner-caught): state trust anchors precisely — the out-of-tree launcher lives on the SAME write surface (~/.wienerdog) as the app tree it guards, so "needs OS entry AND launcher to defeat" was false (launcher alone suffices). Walk the actual who-interprets-what chain before writing any boundary sentence; the honest fix
    memory/lessons/inbox.md:308 /anchor/
      - WP-dream-plaintext-trigger: the whole-output discriminator ("the diagnostic IS the entire output", ANSI-stripped + trimmed) beats any substring/anchored marker for CLI-diagnostic detection — it kills the false-positive and false-negative classes simultaneously.
    memory/lessons/inbox.md:315 /anchor/
      - WP-cleanenv-keychain-auth: os.homedir() on POSIX reads $HOME LIVE (libuv checks the env var before the passwd DB), so it can NEVER be the "real login home" side of a redirection discriminator — the redirect mechanism itself moves it. os.userInfo().homedir (getpwuid, env-independent) is the correct anchor. wd-reviewer approved the os.homedir() ver
    memory/lessons/inbox.md:344 /anchor/
      - WP-launcher-no-self-resync-republish (spec loop): a verification step that guards *properties of a diff* (no deletions, no `assert` lines) is a proxy, and proxies admit counterexamples. When the invariant is "this file is exactly that file plus this known edit", **compute the expected content and compare it** — and make the reconstruction fail lo
    memory/lessons/inbox.md:352 /anchor/
      - WP-launcher-no-self-resync-republish (spec loop): a source-scanning gate must anchor on a token that cannot be a *prefix of something else* (`function writeLauncher(` not `function writeLauncher`) and must count only *executable* text, or ordinary refactors — a helper with a longer name, a literal quoted in a comment — silently satisfy it. And wh
    memory/lessons/inbox.md:364 /anchor/
      - WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): "keep these two copies identical" is not a contract until something asserts it — three careful rounds still forked four of seven canonical rows because each round only checked the row it touched. If a spec claims a cross-file invariant, ship the check tha
    memory/lessons/inbox.md:372 /anchor/
      GNU's `\<`/`\>` word anchors — an extraction range built on them produces an
    memory/lessons/inbox.md:595 /anchor/
      - **WP-secret-fence-ep2-redact-arm:** Read-counting seams must be anchored to a
    memory/lessons/inbox.md:598 /anchor/
      counting. Anchoring on "the first read after this other thing failed" is immune
    memory/lessons/inbox.md:729 /anchor/
      Anchor on a structural event — *"the first read after X failed"* — which survives reordering and
    memory/lessons/inbox.md:755 /anchor/
      I could have banked the directive exclusion as a fix; measuring first showed the anchor already
    memory/lessons/inbox.md:779 /anchor/
      - WP-adr-0028: line numbers inside an appendable region are structurally unstable (they drifted within a single commit); identify content-anchored criteria by content, and let a classified worked example BE the roster instead of asserting exhaustiveness that was never checked against real output.
    memory/lessons/inbox.md:809 /anchor/
      anchor after ~:205 by ~53 lines; implementing by CONTENT (not the spec's stale
    memory/lessons/inbox.md:1284 /positional/
      - WP-index-guard-residuals: **a comment-only edit is not a no-op if the file is cited by line.** Rewriting two comments in `src/cli/dream.js` added seven lines and would have rotted ~15 `cli/dream.js:NNN` citations inside row W1(c) — the nine pinned-set call sites among them, i.e. the entries this WP was editing. The check is cheap: `git show origi
    memory/lessons/inbox.md:1377 /anchor/
      - WP-quarantine-preserve-durability: prefer a FIXED CHAIN derived from two known anchors over a set derived from what the call happened to create. A derived set is a list somebody maintains — it grows a member the day the code creates one more directory, and no reviewer can tell a missing member from an intentional one. A closed list computed from
    memory/lessons/inbox.md:1391 /anchor/
      - WP-audit-d-code-derived-recipients: editing a vendored operating skill BREAKS THE CHECKED-IN DIGEST ANCHOR. `src/core/runtime-skill-digests.json` records the sha256 of each `skills/*/SKILL.md`, so a spec that edits one and does not list the anchor as a Deliverables row cannot be implemented green — 13 tests red, and a merge leaves the routine ref
    memory/lessons/inbox.md:1401 /anchor/
      - WP-audit-d-code-derived-recipients: SELECTING AN EDIT TARGET BY A SUBSTRING THAT ALSO APPEARS IN PROSE is how a table row lands in the middle of a paragraph. An identifier-shaped match is not unique to the structure you meant; anchor on the whole block and assert the match is unique.
    memory/lessons/inbox.md:1404 /anchor/
      - WP-audit-d-code-derived-recipients: THE PERMISSION BOUNDARY IS WORTH ITS FRICTION. Hitting an unlisted file, the implementer stopped and reported instead of regenerating it — turning a silently broken integrity anchor into one red PR and a five-minute architect edit.
    memory/lessons/inbox.md:1408 /anchor/
      - WP-audit-e-ledger-parser-corpus: `--test-name-pattern` is an UNANCHORED SUBSTRING match, so a bare row id like `C4` also selects `C40`. Bracket-delimited tags (`\[C4\]`) are collision-safe, and a corpus that wants per-row RED proofs needs them from the first test written.
    memory/lessons/inbox.md:1412 /anchor/
      - WP-audit-e-ledger-parser-corpus: a PRESENT BUT UNPARSEABLE VALUE MUST BE INVALID, NEVER ABSENT. JS `.` matches neither CR nor U+2028/U+2029, so an anchored `(.*)$` made a bullet that NAMES a security field read as missing — and "missing" was the state the raise-only rule exempted. Match the key prefix and take the remainder of the line as the raw
  --- declined owner grant: 6
    memory/lessons/inbox.md:173 /declin/
      - WP-102: a prompt advertising `[Y/n]` must actually pass `{defaultYes: true}` — prompt.js defaults empty-answer to false; the WP-047 install consent had silently declined on Enter since it shipped.
    memory/lessons/inbox.md:344 /fail loud/
      - WP-launcher-no-self-resync-republish (spec loop): a verification step that guards *properties of a diff* (no deletions, no `assert` lines) is a proxy, and proxies admit counterexamples. When the invariant is "this file is exactly that file plus this known edit", **compute the expected content and compare it** — and make the reconstruction fail lo
    memory/lessons/inbox.md:364 /fail loud/
      - WP-scheduler-loaded-record-tripwire / WP-scheduler-entry-identity (spec gate loop, PR #115): "keep these two copies identical" is not a contract until something asserts it — three careful rounds still forked four of seven canonical rows because each round only checked the row it touched. If a spec claims a cross-file invariant, ship the check tha
    memory/lessons/inbox.md:378 /declin/
      declining it — the metadata-suffix narrowing looked right and was leaky, and
    memory/lessons/inbox.md:1374 /declin/
      - WP-quarantine-preserve-durability: SYMMETRY OF CAPABILITY is the argument that decides whether a hardening is worth taking. A process that can swap a directory aside during your flush can also delete the preserved copy one instruction after you return — so the descriptor pinning both review channels recommended buys nothing against the actor it t
    memory/lessons/inbox.md:1383 /declin/
      - WP-quarantine-preserve-durability: DO NOT TEST A DISCLOSED RESIDUAL. A test that exercises the case your contract says it does not cover will one day fail, and its failure means nothing — it asserts a guarantee you deliberately declined. Disclosed residuals belong in the contract row and in the "what these proofs do not establish" paragraph, neve
  --- whole cell / grep window: 3
    memory/lessons/inbox.md:1230 /intra-cell/
      - quarantine-surface: grep-based mirror walks are blind to intra-cell falsification and vocabulary-shifted restatement — the PR-gate reviewer must read whole cells (wd-reviewer's class diagnosis on PR #33).
    memory/lessons/inbox.md:1247 /mirror-walk/
      - WP-dream-promote-in-workspace: **Read the tool's own summary, not your regex's match count.** `mirror-walk` reports `UNRESOLVED — 12`; a hand-rolled line counter said 13, and 13 was reported repeatedly. The load-bearing claim (delta +0) survived, the figure did not.
    memory/lessons/inbox.md:1402 /intra-cell/
      - WP-audit-d-code-derived-recipients: AFTER REPLACING A SECTION, RE-READ THE SECTION IT REPLACED. A wholesale rewrite silently dropped a deliberate non-claim, and no mirror checklist can catch it because the mirror WAS the section. The same rule as the intra-cell re-read, one level up.
  --- both gates same tip: 1
    memory/lessons/inbox.md:1417 /double-channel/
      - WP-audit-e-ledger-parser-corpus: the archive predecessor's twelve-round lesson HELD when tested. Across round zero and two double-channel rounds every finding was a corpus row or a proof set, and no round added a gate, script or grep — the loop closed at round 2. Behavioural gates converge; source-shape gates breed rounds.

##### docs/HANDOVER.md
  --- cite names not positions: 2
    docs/HANDOVER.md:103 /anchor/
      > | D | `WP-audit-d-code-derived-recipients` | **Done** | design loop #223, implementation #224 (`ee11229f`), filed in this pass | **Design loop: round zero, two clean-context executors, and SIX double-channel rounds** (plugin + hermetic shadow; twelve raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds
    docs/HANDOVER.md:298 /positional/
      > #203 (positional citations in `docs/specs/done/WP-show-slot-own-value-kind.md`
  --- declined owner grant: 1
    docs/HANDOVER.md:151 /declin/
      > | 3b successor | `WP-quarantine-preserve-durability` | **Done** | design loop #220 (`bb58e398`), implementation #221 (`c891e0b6`), filed in this pass | **Design loop: round zero plus ELEVEN double-channel rounds** (plugin gate + hermetic shadow on every one, twenty-two raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-quarant
  --- whole cell / grep window: 0
  --- both gates same tip: 10
    docs/HANDOVER.md:50 /double-channel/
      > | E | `WP-audit-e-ledger-parser-corpus` | **Done** | design loop #225, implementation #226 (`54960a9d`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-e-design-gate-rounds.md`)
    docs/HANDOVER.md:103 /both channels/
      > | D | `WP-audit-d-code-derived-recipients` | **Done** | design loop #223, implementation #224 (`ee11229f`), filed in this pass | **Design loop: round zero, two clean-context executors, and SIX double-channel rounds** (plugin + hermetic shadow; twelve raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds
    docs/HANDOVER.md:104 /double-channel/
      > | E | `WP-audit-e-ledger-parser-corpus` | **Ready → implementation PR #226 open, gate round 1 in progress** at the time of writing | design loop #225 | Round zero, two clean-context executors and **two double-channel rounds**; **two ADR-0031 extractions**; a **43-row hostile corpus** and **44 declared proofs** |
    docs/HANDOVER.md:151 /double-channel/
      > | 3b successor | `WP-quarantine-preserve-durability` | **Done** | design loop #220 (`bb58e398`), implementation #221 (`c891e0b6`), filed in this pass | **Design loop: round zero plus ELEVEN double-channel rounds** (plugin gate + hermetic shadow on every one, twenty-two raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-quarant
    docs/HANDOVER.md:190 /both channels/
      > | 3b | `WP-quarantine-banner-location` | **Done** | design loop #217 (round zero + 5 double-channel rounds; **circuit breaker at round 2** — two consecutive A findings on "is the pointer's destination real?" were settled by DELETING the defect: row L7 reorders the undelivered-record print to step 17b, ahead of every durable write, which removes t
    docs/HANDOVER.md:191 /double-channel/
      > | 3c | `WP-quarantine-preserve-durability` | Draft → in design | — | wd-architect matured it to **1043 lines** at `284144db` on `docs/wp-quarantine-preserve-durability`. **SPLIT**: `WP-quarantine-disposal-durability` filed as a Draft stub on that branch. Four owner items, each carrying a recommendation. Round zero is done; the external double-cha
    docs/HANDOVER.md:215 /double-channel/
      > | 4→ | `WP-dot-segment-denial` | **Done** | design loop #214 (round zero + 3 double-channel rounds; circuit breaker at round 2 — two hand-shaped sample families replaced by EQUALITY with a one-line reference predicate over a seeded full-alphabet generator; round 3 hardened the grading's inputs), implementation #215 (three-round triple-channel PR
    docs/HANDOVER.md:236 /double-channel/
      > | 4→ | `WP-instruction-basename-currency` | **Done** | design loop #210 (round zero + 3 double-channel rounds, circuit breaker at round 2 — the loop closed by DELETING machinery: whole-artifact byte compares + one hand-written literal set), implementation #211 (two-round triple-channel PR gate), filed #212 | `INSTRUCTION_BASENAMES` is nine names;
    docs/HANDOVER.md:370 /same tip/
      - The review-gate flow that converged: two independent gates on the SAME tip,
    docs/HANDOVER.md:371 /on that tip/
      both verdicts on that tip, a pinned reading before each round ("clean or
```

**Result that changed the design:** `inbox:1365`
("WP-quarantine-banner-location: line-number citations in `done/` specs are
trustworthy for EXISTENCE, not for POSITION … Grep for the cited text; use the
line number only to disambiguate") is the operative form of the stub's "comments
cite names, never relative positions". It is unbound, so Table A's R16 is PARTIAL
and lands, rather than being written off as covered by the dispatch gate.

**Result that removed a rule:** the stub's "declined owner grants surface loudly"
returns **zero hits** in both source documents under six probes. It has no
paid-for-by provenance and is not landed (Table A R19, owner item O4).

### 0.5 Every cited range checked at BOTH ends

`codex-review.md:133-138`. Each range's first and last line are printed with
their neighbours, so a range ending inside the next construct is visible.

```text
docs/runbooks/codex-review.md:14-17  (both gates run)
   before:    explicitly accepted as residual.
   FIRST : 2. **PR review (additional gate): alongside wd-reviewer.** wd-reviewer remains
   LAST  :    or every finding is dispositioned.
   after : 3. **Dispatch-time re-verification (mandatory): every WP, at the moment it is

docs/runbooks/codex-review.md:35-36  (Finding disposition heading + first bullet)
   before:
   FIRST : ### Finding disposition
   LAST  :
   after : - Every finding gets exactly one disposition: **fix** (a genuine defect),

docs/runbooks/codex-review.md:58-69  (value question + aggregate question)
   before:   quietly rebuilding the absence that was the point.)
   FIRST : - Every solution starts with the value question: what does fixing this
   LAST  :   defensible alone and never faced the aggregate question.
   after : - When two consecutive rounds land findings of the same kind, the next

docs/runbooks/codex-review.md:70-71  (two consecutive rounds -> design question)
   before:   defensible alone and never faced the aggregate question.
   FIRST : - When two consecutive rounds land findings of the same kind, the next
   LAST  :   step is a design question, never another textual patch.
   after : - A design loop states its STOP CRITERION in the round record BEFORE

docs/runbooks/codex-review.md:72-81  (STOP CRITERION)
   before:   step is a design question, never another textual patch.
   FIRST : - A design loop states its STOP CRITERION in the round record BEFORE
   LAST  :   that is already being written.
   after : - The reviewer's raw output is committed BEFORE anyone reads or judges

docs/runbooks/codex-review.md:82-91  (raws committed before adjudication)
   before:   that is already being written.
   FIRST : - The reviewer's raw output is committed BEFORE anyone reads or judges
   LAST  :   no hook — one more line in a record that is already being written.
   after : - `failed to load configuration: No such file or directory` means a

docs/runbooks/codex-review.md:123-132  (Reading is not evidence)
   before: - The same pass RUNS every acceptance criterion and verification step
   FIRST :   that has a runnable form: commands executed on the tree the claim
   LAST  :   the spec itself provides.
   after : - A cited RANGE is checked at BOTH ends, mechanically — `file:START-END` must

docs/runbooks/codex-review.md:133-138  (cited RANGE both ends)
   before:   the spec itself provides.
   FIRST : - A cited RANGE is checked at BOTH ends, mechanically — `file:START-END` must
   LAST  :   successor's first draft it caught three more, one wrong at both ends.)
   after :

docs/runbooks/codex-review.md:154-164  (freezing surface)
   before:
   FIRST : ### The loop converges by freezing surface, not by patience
   LAST  :   not the error rate.
   after :

docs/runbooks/codex-review.md:186-190  (dispatch gate: which claims)
   before: **Which claims. The boundary is RUNNABILITY — not file ownership, and not a
   FIRST : heading.** Re-run **every executable claim the spec makes about the tree the
   LAST  : claim and this gate does not cover it.
   after :

docs/runbooks/codex-review.md:290-295  (report states what was EXECUTED)
   before: - PR review input: the PR branch's diff against its merge base with
   FIRST :   `main`; no focus text.
   LAST  :   verdicts were readings and neither disclosed it.)
   after : - Review is read-only, checked mechanically: `git status --porcelain`

docs/runbooks/codex-review.md:296-298  (read-only porcelain)
   before:   verdicts were readings and neither disclosed it.)
   FIRST : - Review is read-only, checked mechanically: `git status --porcelain`
   LAST  :   or the run is invalid.
   after : - Output is relayed verbatim (see Rules).

docs/runbooks/codex-review.md:368-375  (prove a new gate in BOTH directions)
   before:   when someone else's claim cannot be reproduced, the burden is on the run.
   FIRST : - **Prove a new gate in BOTH directions.** Red-before-work shows a check is not
   LAST  :   punish the implementer for doing the work correctly.
   after : - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a

docs/runbooks/codex-review.md:376-383  (Loop circuit-breaker ADR-0031)
   before:   punish the implementer for doing the work correctly.
   FIRST : - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a
   LAST  :   unregistered.
   after : - **Capture an exit code as its own statement, immediately.** `rc=$?` on the

docs/runbooks/codex-review.md:384-390  (capture an exit code)
   before:   unregistered.
   FIRST : - **Capture an exit code as its own statement, immediately.** `rc=$?` on the
   LAST  :   produced, not the value the pipeline last touched.
   after : - **A zero-hit sweep is evidence only if the sweep demonstrably read its

docs/runbooks/codex-review.md:391-399  (zero-hit sweep)
   before:   produced, not the value the pipeline last touched.
   FIRST : - **A zero-hit sweep is evidence only if the sweep demonstrably read its
   LAST  :   reason.
   after :

docs/runbooks/codex-review.md:358-367  (claim to be RUN not read)
   before:   literal there.
   FIRST : - **A claim about how a tool behaves is a claim to be RUN, not read.** Four
   LAST  :   when someone else's claim cannot be reproduced, the burden is on the run.
   after : - **Prove a new gate in BOTH directions.** Red-before-work shows a check is not

docs/runbooks/spec-authoring.md:15-19  (every detail earns its place)
   before:   the surface that can rot.
   FIRST : - Every detail earns its place by a named consumer: the decision or
   LAST  :   spec bloats, and pruning it is why reviews converge.
   after : - A universal statement ("all", "none", "nowhere", "every") either

docs/runbooks/spec-authoring.md:28-31  (both directions)
   before:   `N/A — <one-line reason>` — so absence is always visible and checkable.
   FIRST : - A NEW verification step is trusted only after it has been observed on
   LAST  :   caught before anyone believes it. Paste both outputs.
   after : - That deliberately-broken state includes the DELIVERABLE-ABSENT case, not only

docs/runbooks/spec-authoring.md:32-37  (deliverable-absent case)
   before:   caught before anyone believes it. Paste both outputs.
   FIRST : - That deliberately-broken state includes the DELIVERABLE-ABSENT case, not only
   LAST  :   absent → red, compliant → green, violating → red.
   after : - Evidence establishes a claim only as far as it actually reaches, and the

docs/runbooks/spec-authoring.md:47-50  (a fact is stated once)
   before:   question one level up.
   FIRST : - A fact is stated once, in the surface that owns it; every other
   LAST  :   and points — what has no content cannot go stale.
   after : - After rewriting a canonical cell, re-read that cell WHOLE for a

docs/runbooks/spec-authoring.md:51-55  (intra-cell re-read)
   before:   and points — what has no content cannot go stale.
   FIRST : - After rewriting a canonical cell, re-read that cell WHOLE for a
   LAST  :   re-read is the only tool that can.
   after : - Sweep for the CLAIM, not for any wording of it — and across every spec

docs/runbooks/spec-authoring.md:56-63  (sweep for the CLAIM)
   before:   re-read is the only tool that can.
   FIRST : - Sweep for the CLAIM, not for any wording of it — and across every spec
   LAST  :   or a named withdrawal.
   after : - CLAUDE.md's `feat|fix|docs|test|chore(scope): message (WP-<slug>)` governs

docs/specs/_TEMPLATE.md:86-97  (Mirrored Surface Checklist)
   before:
   FIRST : ### Mirrored Surface Checklist
   LAST  : - [ ] Operative prose steps that apply it
   after :

docs/specs/_TEMPLATE.md:88-91  (one pass / register-new-mirrors sentence)
   before:
   FIRST : For each canonical table above, name **every surface in this spec that mirrors
   LAST  : spot (register-new-mirrors):
   after :

.claude/agents/wd-reviewer.md:21-21  (contract-density detector paragraph)
   before:
   FIRST : **Contract-density detector (ADR-0031).** Also flag contract-dense inline prose that should be one canonical reference table, find
   LAST  : **Contract-density detector (ADR-0031).** Also flag contract-dense inline prose that should be one canonical reference table, find
   after :

.claude/agents/wd-architect.md:16-23  (Rules list)
   before:
   FIRST : Rules:
   LAST  : - Use GLOSSARY.md terms exactly.
   after :

docs/HANDOVER.md:336-366  (What to watch for)
   before:
   FIRST : ## What to watch for (the compressed discipline)
   LAST  :   without bands are not decision-grade.
   after :

docs/HANDOVER.md:342-343  (proof of a fix)
   before:
   FIRST : - **The proof of a fix is the re-grep/re-run, never the edit.** Report what
   LAST  :   the tool printed, not what you intended.
   after : - **Read the tool's own summary, not your regex's match count.**

docs/HANDOVER.md:344-344  (tool own summary)
   before:   the tool printed, not what you intended.
   FIRST : - **Read the tool's own summary, not your regex's match count.**
   LAST  : - **Read the tool's own summary, not your regex's match count.**
   after : - **A +0 test delta on a test that dies before your change proves nothing**

docs/HANDOVER.md:345-346  (+0 delta)
   before: - **Read the tool's own summary, not your regex's match count.**
   FIRST : - **A +0 test delta on a test that dies before your change proves nothing**
   LAST  :   — check *where* it dies relative to what you touched.
   after : - **`+0/−0` beside a claimed content change is a failure signature** (a

docs/HANDOVER.md:347-349  (+0/-0)
   before:   — check *where* it dies relative to what you touched.
   FIRST : - **`+0/−0` beside a claimed content change is a failure signature** (a
   LAST  :   the working tree.
   after : - **Prove a mutation was applied before believing its matrix** (grep the

docs/HANDOVER.md:350-351  (mutation applied)
   before:   the working tree.
   FIRST : - **Prove a mutation was applied before believing its matrix** (grep the
   LAST  :   injected marker); a guard must notice its own death.
   after : - **Enumerating the BAD is unclosable when the grammar isn't yours;

docs/HANDOVER.md:352-354  (enumerate own good)
   before:   injected marker); a guard must notice its own death.
   FIRST : - **Enumerating the BAD is unclosable when the grammar isn't yours;
   LAST  :   result; respect it in any allowlist/denylist design.
   after : - **Distinguish FORM insufficiency from a PREDICATE defect** before reopening

docs/HANDOVER.md:355-358  (form vs predicate)
   before:   result; respect it in any allowlist/denylist design.
   FIRST : - **Distinguish FORM insufficiency from a PREDICATE defect** before reopening
   LAST  :   design question.
   after : - **Two consecutive review rounds on one contract family → extract the

docs/HANDOVER.md:359-361  (circuit breaker)
   before:   design question.
   FIRST : - **Two consecutive review rounds on one contract family → extract the
   LAST  :   patching injected four defects; one contract round injected zero.
   after : - **Sweep claims, not sentences**: whitespace-flattened, pronoun-aware,

docs/HANDOVER.md:362-363  (sweep claims)
   before:   patching injected four defects; one contract round injected zero.
   FIRST : - **Sweep claims, not sentences**: whitespace-flattened, pronoun-aware,
   LAST  :   family-wide; a file swept by hand is not inside its own proof.
   after : - **Materiality bands on every review round** (A: silent wrong behavior with

docs/HANDOVER.md:364-366  (materiality bands)
   before:   family-wide; a file swept by hand is not inside its own proof.
   FIRST : - **Materiality bands on every review round** (A: silent wrong behavior with
   LAST  :   without bands are not decision-grade.
   after :

docs/HANDOVER.md:368-373  (Process notes / review-gate flow)
   before:
   FIRST : ## Process notes
   LAST  :   pinned in advance for repeated same-family findings.
   after : - CI runs are billing-blocked on this fork at handover time; the local gate

memory/lessons/inbox.md:1241-1253  (the 13 promote-in-workspace bullets)
   before:
   FIRST : - WP-dream-promote-in-workspace: **Enumerating the BAD is unclosable when the grammar isn't ours; enumerating our OWN GOOD is clos
   LAST  : - WP-dream-promote-in-workspace: **Relaunch a dead gate fresh, never resumed, and re-verify the freeze first.** Agents died mid-ru
   after : - WP-smoke-live-scheduler-preflight: verifying an outcome×override matrix's "must proceed" cells aga

memory/lessons/inbox.md:1230-1230  (quarantine-surface whole cells)
   before: - quarantine-surface: the same-kind escalation rule paid off twice — the design answer (commit-time
   FIRST : - quarantine-surface: grep-based mirror walks are blind to intra-cell falsification and vocabulary-shifted restatement — the PR-ga
   LAST  : - quarantine-surface: grep-based mirror walks are blind to intra-cell falsification and vocabulary-shifted restatement — the PR-ga
   after :

memory/lessons/inbox.md:1284-1284  (index-guard positional citations)
   before: - WP-audit-c-close-disposition: **the two-round rule matters as a routing signal, not just a courtes
   FIRST : - WP-index-guard-residuals: **a comment-only edit is not a no-op if the file is cited by line.** Rewriting two comments in `src/cl
   LAST  : - WP-index-guard-residuals: **a comment-only edit is not a no-op if the file is cited by line.** Rewriting two comments in `src/cl
   after : - WP-index-guard-residuals: **"derive both sides independently" is about where the data comes from,

memory/lessons/inbox.md:1366-1366  (banner-location: never write into a worktree mid-gate)
   before: - WP-quarantine-banner-location: line-number citations in `done/` specs are trustworthy for EXISTENC
   FIRST : - WP-quarantine-banner-location: never write into a worktree while a review gate is reading it. One untracked file the orchestrato
   LAST  : - WP-quarantine-banner-location: never write into a worktree while a review gate is reading it. One untracked file the orchestrato
   after : - WP-quarantine-banner-location: a subagent "died with the session" is an assumption, not an observa

memory/lessons/inbox.md:1273-1273  (show-slot canary arity)
   before: - WP-show-slot-own-value-kind: when a checker must FIND its subject inside a large file, it is enume
   FIRST : - WP-show-slot-own-value-kind: a canary that differs from its exploit in ARITY proves nothing about the exploit — it dies on lengt
   LAST  : - WP-show-slot-own-value-kind: a canary that differs from its exploit in ARITY proves nothing about the exploit — it dies on lengt
   after : - WP-show-slot-own-value-kind: a stated invariant that one of its own members falsifies cannot decid

memory/lessons/inbox.md:1403-1403  (audit-d enumerate the good)
   before: - WP-audit-d-code-derived-recipients: AFTER REPLACING A SECTION, RE-READ THE SECTION IT REPLACED. A
   FIRST : - WP-audit-d-code-derived-recipients: a verification that ENUMERATES THE FORBIDDEN is unclosable; one that enumerates YOUR OWN INT
   LAST  : - WP-audit-d-code-derived-recipients: a verification that ENUMERATES THE FORBIDDEN is unclosable; one that enumerates YOUR OWN INT
   after : - WP-audit-d-code-derived-recipients: THE PERMISSION BOUNDARY IS WORTH ITS FRICTION. Hitting an unli
```

Three ranges were **wrong at their start end** in the first draft and were
corrected before the spec was written: `codex-review.md:123-132` →
`:122-132`, `:290-295` → `:291-295`, `:186-190` → `:185-190`. One further
citation was corrected after this run: the vendored-prompt bullet, cited as
`:264-273`, actually begins at `:267`.

### 0.6 The sentinel gate, proven on four states

The gate is a NEW verification step, so it is trusted only after both directions
plus the deliverable-absent state (`spec-authoring.md:28-37`;
`codex-review.md:368-375`). The compliant state is hand-built and deliberately
includes the awkward-but-legal cases: anchors split by a hard wrap, one anchor
whose word "grep" is wrapped in backticks, and one whose word "form" is wrapped
in double asterisks.

```text
================ STATE 1 — UNTOUCHED TREE (expect red) ================
FAIL  docs/runbooks/codex-review.md :: the proof of a fix is the re-run
FAIL  docs/runbooks/codex-review.md :: not your own recount
FAIL  docs/runbooks/codex-review.md :: dies relative to what you touched
FAIL  docs/runbooks/codex-review.md :: prove the commit, not the working tree
FAIL  docs/runbooks/codex-review.md :: grep the injected marker
FAIL  docs/runbooks/codex-review.md :: notice its own death
FAIL  docs/runbooks/codex-review.md :: arity proves nothing
FAIL  docs/runbooks/spec-authoring.md :: pronoun-aware
FAIL  docs/runbooks/spec-authoring.md :: adjacent to the claim
FAIL  docs/specs/_TEMPLATE.md :: in the same commit
FAIL  docs/runbooks/codex-review.md :: materiality band
FAIL  docs/runbooks/codex-review.md :: C: hygiene
FAIL  docs/runbooks/codex-review.md :: pinned before the round
FAIL  docs/runbooks/codex-review.md :: form insufficiency
FAIL  docs/runbooks/codex-review.md :: predicate defect
FAIL  .claude/agents/wd-architect.md :: enumerate your own good
FAIL  .claude/agents/wd-reviewer.md :: the whole cell, never the grep window
FAIL  docs/runbooks/codex-review.md :: grep for the cited text
FAIL  docs/runbooks/codex-review.md :: nothing writes into a worktree a gate is reading
FAIL  docs/runbooks/codex-review.md :: on the same tip
sentinels exit=1
STATE1 rc=1

================ STATE 2 — COMPLIANT COPY (expect green) ===============
PASS  docs/runbooks/codex-review.md :: the proof of a fix is the re-run
PASS  docs/runbooks/codex-review.md :: not your own recount
PASS  docs/runbooks/codex-review.md :: dies relative to what you touched
PASS  docs/runbooks/codex-review.md :: prove the commit, not the working tree
PASS  docs/runbooks/codex-review.md :: grep the injected marker
PASS  docs/runbooks/codex-review.md :: notice its own death
PASS  docs/runbooks/codex-review.md :: arity proves nothing
PASS  docs/runbooks/spec-authoring.md :: pronoun-aware
PASS  docs/runbooks/spec-authoring.md :: adjacent to the claim
PASS  docs/specs/_TEMPLATE.md :: in the same commit
PASS  docs/runbooks/codex-review.md :: materiality band
PASS  docs/runbooks/codex-review.md :: C: hygiene
PASS  docs/runbooks/codex-review.md :: pinned before the round
PASS  docs/runbooks/codex-review.md :: form insufficiency
PASS  docs/runbooks/codex-review.md :: predicate defect
PASS  .claude/agents/wd-architect.md :: enumerate your own good
PASS  .claude/agents/wd-reviewer.md :: the whole cell, never the grep window
PASS  docs/runbooks/codex-review.md :: grep for the cited text
PASS  docs/runbooks/codex-review.md :: nothing writes into a worktree a gate is reading
PASS  docs/runbooks/codex-review.md :: on the same tip
sentinels exit=0
STATE2 rc=0

================ STATE 3 — VIOLATING COPY (expect red, 1 FAIL) =========
FAIL  docs/runbooks/codex-review.md :: arity proves nothing
sentinels exit=1
STATE3 rc=1

================ STATE 4 — DELIVERABLE ABSENT (expect red, 1 FAIL) =====
FAIL(absent)  .claude/agents/wd-architect.md :: enumerate your own good
sentinels exit=1
STATE4 rc=1
```

**The first run of this proof was a real find, and it was an OVER-STRICTNESS
find — band B.** The gate as first written used a plain `grep -qF` per file.
`grep` is line-oriented, so the anchor `prove the commit, not the working tree`
failed against a *correct* compliant state that had merely wrapped the sentence
at 80 columns — the gate would have punished the implementer for writing the rule
properly. That is exactly the failure red-before-work cannot see and the
compliant-state run exists to catch (`codex-review.md:368-375`). The fix is the
discipline this WP itself lands (R08): the gate now flattens whitespace and
strips the asterisk, underscore and backtick before matching. Re-run: 20 PASS,
exit 0.

Per-state summary:

| State | Expected | Observed | exit |
|-------|----------|----------|------|
| untouched tree (`98a8b49a`) | red, all 20 fail | 20 FAIL | 1 |
| hand-built compliant copy | green | 20 PASS | 0 |
| violating copy (one anchor reworded) | red, exactly 1 fail | 1 FAIL (`arity proves nothing`) | 1 |
| deliverable absent (`wd-architect.md` removed) | red, exactly 1 fail | 1 FAIL(absent) | 1 |

### 0.7 The remaining verification steps, and `npm run lint`

```text
--- already-bound text, untouched tree (each must be present now and after) ---
circuit-breaker rc=0   cited-RANGE rc=0   density-detector rc=0

--- inbox untouched on this branch (empty = pass) ---
inbox diff rc=0

--- numstat over the five deliverable files vs main ---
numstat rc=0 (no rows = no deliverable touched yet, as expected in a design-only branch)

--- npm run lint ---

> wienerdog@0.13.0 lint
> node scripts/lint.js

--- markdownlint ---
markdownlint-cli2 v0.23.0 (markdownlint v0.41.0)
Finding: docs/**/*.md skills/**/*.md templates/**/*.md tests/**/*.md *.md
Linting: 646 file(s)
Summary: 0 error(s)
--- shellcheck ---
--- PSScriptAnalyzer ---
--- frontmatter check ---
frontmatter check passed: 268 spec(s), 4 agent(s)

lint passed
lint rc=0
```

The three already-bound greps pass **on the untouched tree**, which is the point:
they are non-regression sentinels, not work sentinels, and they must stay green
across the whole WP.

### 0.8 Internal coherence pass

Counts re-derived from the spec's own tables and from `codex-review.md`, rather
than read (`codex-review.md:122-132`, "Reading is not evidence"):

```text
codex-review "Finding disposition" bullets (:36-:100)  = 11
codex-review "Rules" bullets (:329-:399)               = 11
spec line count                                        = 434
Table A + Table B rows matching /^\| R\d\d \|/        = 36
Table A rows = 19  ids: R01,R02,R03,R04,R05,R06,R07,R08,R09,R10,R11,R12,R13,R14,R15,R16,R17,R18,R19
Table B rows = 17  ids: R01,R02,R03,R04,R05,R06,R07,R08,R09,R11,R12,R13,R14,R15,R16,R17,R18
rows with EXTEND = 8 R01,R02,R08,R09,R15,R16,R17,R18
rows with NEW    = 9 R03,R04,R05,R06,R07,R11,R12,R13,R14
  of which "the same NEW bullet as" (not their own edit point) = 4 R04,R06,R07,R12
DISTINCT EDIT POINTS = EXTEND(8) + NEW(5) = 13
Table B rows landing in codex-review.md = 13 R01,R02,R03,R04,R05,R06,R07,R11,R12,R13,R16,R17,R18
  new bullets added to codex-review.md  = 4 R03,R05,R11,R13
sentinel DATA lines = 20
anchor literals declared in Table B = 20
declared-but-not-in-DATA : []
in-DATA-but-not-declared : []
```

Findings, all fixed in this pass:

| # | Band | Finding | Fix |
|---|------|---------|-----|
| Z1 | B | Implementation notes claimed "nine of which EXTEND"; the measured split is 8 EXTEND + 5 NEW = 13 edit points | corrected to "eight EXTEND … and five add one" |
| Z2 | C | Implementation notes claimed `codex-review.md` carries "eleven and ten" bullets in Rules / Finding disposition; both measure **11** | corrected to "the 11 and 11 it already carries" |
| Z3 | C | Table B's R11 insertion point cited `:36`, which is the blank line after the heading; the bullet list starts at `:37` | corrected to `:37` |
| Z4 | C | Out of scope cited the vendored-prompt bullet as `:264-273`; it begins at `:267` | corrected to `:267-273` |
| Z5 | B | An acceptance criterion pinned "268 spec(s)", a count that moves whenever any spec is added, so it would go stale between `Ready` and dispatch | narrowed to "the frontmatter check passes, still reporting 4 agent(s)" — the assertion that actually protects the two agent-file edits |
| Z6 | B | The sentinel gate was over-strict against a hard wrap (see 0.6) | gate flattens whitespace and strips emphasis marks before matching |

Bidirectional table/mirror checks, all clean: Table A has 19 rows (R01–R19);
Table B has 17 (every row except the ALREADY BOUND R10 and the UNPAID R19);
Table B declares 20 anchor literals and the sentinel DATA block has 20 lines,
with set equality in both directions (no declared anchor missing from the gate,
no gate line not declared); the Deliverables note "R01–R07, R11–R13, R16–R18"
matches the 13 Table B rows whose File is `codex-review.md`; and the "four new
bullets" claim matches the 4 rows that open one there.

### 0.9 Size

The spec is **431 lines**, above the ~400-line sizing heuristic in
`docs/specs/README.md`. The overage is two canonical tables (19 + 17 rows), a
20-line sentinel data block and four owner items; every line has a named
consumer, and the implementation itself is 13 small documentation edits plus one
script run, which is an S. Recorded rather than trimmed, because the only
remaining cuts would remove content a consumer uses.

## Executor pass — template conformance

Clean-context executor, spec + template only (`codex-review.md:102-112`).
**Verdict: CONFORMANT** — every template section is present or carries an
explicit `N/A — <one-line reason>` line.

One observation, **dropped (T1)**: the executor noted that the Security checklist
is kept as a heading with an `N/A —` line rather than deleted, where the
template's own heading reads "delete only if the WP touches no untrusted input".
Dropped because `spec-authoring.md:25-27` requires exactly that N/A line in place
— "a template section is never deleted silently … so absence is always visible
and checkable" — and the runbook governs the template heading's older phrasing.
The disagreement between the two is a **real residual, routed not fixed**: it
belongs to whoever next edits `_TEMPLATE.md`'s section headings, and is out of
scope for a WP whose only template edit is R09. Recorded here so the next editor
finds it.

## Executor pass — internal coherence

Clean-context executor; **seven findings, all LIGHT** — none changes a Table A
disposition or a Table B landing file, so under the §0.1 stop criterion none
escalates. Every finding was re-verified against the files here before being
applied (`codex-review.md:332-334`, the orchestrator spot-checks citations before
anyone acts on a finding); the re-verification run is pasted below. An eighth
finding (Z7) was **self-found** during the whole-cell re-read that X3's rewrite
triggered.

| # | Band | Finding | Disposition | What changed |
|---|------|---------|-------------|--------------|
| X1 | C | Spec cites `codex-review.md:58-69` for "every addition to the system itself earns its place"; that construct is `:65-69` — `:58-64` is the separate value-question bullet | fix | **Three** citations corrected, not the one reported. The executor named `:47`; a claim-shaped sweep of the spec (`spec-authoring.md:56-63`) found `:214` and `:254` citing the same construct with the same wrong range. All three now read `:65-69`; `:216` was already correct |
| X2 | C | Table A R05 provenance `docs/HANDOVER.md:350` — the phrase "(grep the / injected marker)" spans the wrap onto `:351` | fix | → `:350-351` |
| X3 | C | Table A R06 provenance claims an inbox bullet for "a guard must notice its own death"; no such bullet exists | fix | Independently re-measured: a claim-shaped probe over all 1421 inbox lines returns two hits, neither of which states the rule (`:146` is an unrelated `SCHED_SUPPORTED` guard; `:1241` is about guard *designs* defeated by measurement). `:1243` is R05 and `:1244` is the faithful-before-state rule, as the executor said. The inbox half is dropped: R06's provenance is now `docs/HANDOVER.md:351` **only**, and the cell says so explicitly so a later reader does not re-add it |
| X4 | C | Table A R12 provenance `docs/HANDOVER.md:370-372`; `:370` is R18's clause ("two independent gates on the SAME tip") | fix | → `:371-372`. R18's own `:370-371` was already correct |
| X5 | C | Mirrored Surface Checklist says the untouched-text criterion mirrors Table A's ALREADY BOUND rows; it also covers the pre-existing bound anchors of two PARTIAL rows | fix | Checklist entry now names both categories and both anchors, and notes they are also Table B insertion points (R16, R15) |
| X6 | C | The checklist omits O3, which restates Table A's whole PARTIAL/ALREADY-BOUND list | fix | O3 registered as a mirror, with the restated list quoted so the dependency is visible |
| X7 | B | The criterion "R19 does not appear as a landed rule in any of the five files" has no runnable form (`codex-review.md:122-132`) | fix, by **deletion** | See below |
| Z7 | C | **Self-found.** Implementation notes claimed "for four rules a repeat one"; re-derived from Table A's own cells, five rules name more than one source | fix | → "for five rules a repeat one" |

**X7 — the choice, and why deletion is the smaller surface.** The alternative was
a guarded, whitespace-flattened absence grep over the five files. It was rejected
and the criterion deleted. R19 has **no landed text**, so any pattern for it
would be phrase-shaped by construction — a sweep for `declined owner grant` finds
only the wording its author imagined and returns a clean all-clear for every
other one. That is precisely the failure `codex-review.md:391-399` names and that
this WP's own R08 lands, and a check that cannot discriminate is machinery
guarding nothing (`codex-review.md:154-164`). The prohibition stays where a
prohibition belongs — Out of scope and owner item O4 — and the reviewer's read
carries it. The choice is recorded in the spec's Implementation notes, so the
next reader sees the reasoning and not just the absence.

**Z7 is the intra-cell rule paying for itself.** X3 rewrote one Table A cell;
`spec-authoring.md:51-55` requires re-reading that cell WHOLE for a sentence the
rewrite just falsified. The re-read went one step further and re-derived every
Paid-for-by cell's source count, which is what surfaced the stale "four".

### Re-verification of the seven findings, run before applying any of them

```text
===== X1: codex-review :58-69 is TWO bullets? =====
codex-review 57-70
  57:   quietly rebuilding the absence that was the point.)
  58: - Every solution starts with the value question: what does fixing this
  59:   protect or earn in the product, and is that worth the fix plus the
  60:   maintenance it creates? "Not worth solving" is a legitimate
  61:   disposition — a named residual — and reaching it before the first
  62:   patch is cheaper than after the third round. The repeat-kind rule
  63:   below decides HOW to solve what recurs; this question decides
  64:   WHETHER.
  65: - The same test gates every addition to the system itself: a new rule,
  66:   a document, a gate, a process step earns its place by the value it
  67:   protects, named at the moment of adding — or it is not added. Both
  68:   runaway loops this repo has survived were additions that each looked
  69:   defensible alone and never faced the aggregate question.
  70: - When two consecutive rounds land findings of the same kind, the next

===== X1 sweep: every citation of 58-69 / 65-69 in the spec =====
  spec:47: restating it. `codex-review.md:58-69` states that every addition to the system
  spec:214: addition that must name the value it protects (`codex-review.md:58-69`), and
  spec:216: - **The aggregate question, faced.** `codex-review.md:65-69` requires the
  spec:254: `codex-review.md:58-69` forbids without a named protected value). *Cost of

===== X2: HANDOVER 349-352 =====

  349:   the working tree.
  350: - **Prove a mutation was applied before believing its matrix** (grep the
  351:   injected marker); a guard must notice its own death.
  352: - **Enumerating the BAD is unclosable when the grammar isn't yours;

===== X3: inbox, claim-shaped sweep for R06 (guard notices its own death) =====
  inbox:146: - WP-075: `schedule add` registers via real `process.platform` (no injected platform seam), so its failure-path test needs the `SCHED_SUPPORTED` guard — verified NOT dead in CI (true on darwin and systemd ubuntu runners). Functions that take an explicit `platf
  inbox:1241: - WP-dream-promote-in-workspace: **Enumerating the BAD is unclosable when the grammar isn't ours; enumerating our OWN GOOD is closable.** Two guard directions died by measurement — classifying git's verb (defeated by `--attr-source`, a value-consuming global o
  inbox hits = 2 (whole file, 1421 lines)
  --- and the three bullets around 1243 ---

  1243: - WP-dream-promote-in-workspace: **Prove a mutation was APPLIED before believing its result.** Shell escaping silently mangled injected code and three "greens" were unapplied mutations. Every cell now greps its own marker and prints the injected line before the test runs.
  1244: - WP-dream-promote-in-workspace: **A "before" state must be FAITHFUL or its red is fake.** Reverting a predicate without also restoring the exemption arm it shipped with produced a RED from the package's own legitimate calls, not from the mutation. Read *which* assertion fired, not just the exit code.
  1245: - WP-dream-promote-in-workspace: **A canary that differs from the exploit by ARITY proves nothing.** The three-token `--index-output` canary went green against a set that accepted the two-token form; argument count is the first thing shape-equality decides, so such a canary dies before reaching the slot under test. The `+0`-delta lesson, one level in.

===== X4: HANDOVER 368-373 =====

  368: ## Process notes
  369:
  370: - The review-gate flow that converged: two independent gates on the SAME tip,
  371:   both verdicts on that tip, a pinned reading before each round ("clean or
  372:   C-only → proceed; anything above C returns banded"), and a stop criterion
  373:   pinned in advance for repeated same-family findings.

===== X5/X6: spec lines 195-210 (checklist) and 298-308 (acceptance) =====
checklist
  193: spot (register-new-mirrors).
  194:
  195: - [ ] Deliverables-table cells — each `modify` row's Notes names the rule ids
  196:       landing in that file; Table B's File column decides which
  197: - [ ] Acceptance criteria — the anchor-literal criterion quantifies over Table B;
  198:       the untouched-text criterion over Table A's ALREADY BOUND rows
  199: - [ ] Verification steps — the sentinel data block is one line per Table B anchor
  200:       literal, in Table B's order
  201: - [ ] Current-state description — the passages Table B's Insertion-point column
  202:       names, and their line ranges
  203: - [ ] Out of scope — Table A's ALREADY BOUND (R10) and UNPAID (R19) rows
  204: - [ ] Implementation notes and owner items O1–O4 — they mirror Table B's File
  205:       column for R14 and R15, and Table A's disposition for R19
  206:
  207: ## Implementation notes & constraints
  208:

acceptance
  296: - [ ] Every `EXTEND` row leaves its insertion point's existing claim intact: the
  297:       construct still says what it said, and the change at that point is
  298:       additive. Across the whole PR, the only deleted lines are lines an EXTEND
  299:       rewrote in place — no bullet, sentence or rule is removed.
  300: - [ ] The text behind Table A's ALREADY BOUND row and the bound halves this WP
  301:       must not disturb is still present: `codex-review.md` still contains
  302:       `Loop circuit-breaker (ADR-0031)` and `A cited RANGE is checked at BOTH
  303:       ends`, and `.claude/agents/wd-reviewer.md` still contains
  304:       `Contract-density detector (ADR-0031)`.
  305: - [ ] R19 does not appear as a landed rule in any of the five files.
  306: - [ ] `memory/lessons/inbox.md` is not modified by this PR.
  307: - [ ] `npm run lint` passes: markdownlint reports 0 errors, and the frontmatter
  308:       check passes, still reporting 4 agent(s) — the two agent-file edits are
  309:       body-only and must not disturb their frontmatter.
  310: - [ ] **Idempotence: N/A — docs-only, ships no command and writes nothing outside
```

### Z7 re-derived from the spec's own table

```text
  R04 -> 2 sources: ['WP-dream-promote-in-workspace', 'WP-launcher-no-self-resync-republish']
  R07 -> 2 sources: ['WP-dream-promote-in-workspace', 'WP-show-slot-own-value-kind']
  R14 -> 3 sources: ['WP-audit-d-code-derived-recipients', 'WP-dream-promote-in-workspace', 'WP-scheduler-mutation-home-authority']
  R16 -> 2 sources: ['WP-index-guard-residuals', 'WP-quarantine-banner-location']
  R17 -> 2 sources: ['WP-dream-promote-in-workspace', 'WP-quarantine-banner-location']
  rules whose Paid-for-by names more than one source = 5
  spec:230: for five rules a repeat one.
```

## Orchestrator re-run of the sentinel gate — untouched tree at `0ac75957`

`bash sentinels.sh` extracted verbatim from the spec's Verification steps, run
from the worktree with the revision stashed so the tree is exactly `0ac75957`.
This is the independent re-run of §0.6's STATE 1 by a second actor.

```text
tree                : 0ac75957 (git rev-parse --short HEAD)
porcelain BEFORE    : 0 lines
sentinel gate       : 20 FAIL, 0 PASS
sentinels exit      : 1
porcelain AFTER     : identical to BEFORE (diff exit 0)
```

Read-only confirmed mechanically: `git status --porcelain` is byte-identical
before and after the run (`codex-review.md:296-298`). Result agrees with §0.6's
STATE 1 row.

## Round 1 — external, double channel, tip `d2cb7aca`

Both channels ran on `d2cb7aca`, both verdicts name that tip, and both reported
`porcelain before/after: identical`. Raws were committed **before** adjudication,
each cited with the SHA of the commit that introduced it
(`codex-review.md:82-91`):

| Channel | Raw | Introduced by |
|---------|-----|---------------|
| Codex plugin adversarial review | `docs/specs/logbook/2026-09-05-runbook-sweeps-gate-raw-round1-codex-plugin.txt` | `5d131c7e` |
| Hermetic Codex shadow (`codex exec`, read-only sandbox) | `docs/specs/logbook/2026-09-05-runbook-sweeps-gate-raw-round1-herdr-shadow.txt` | `c1b8b377` |

Both verdicts: **needs-attention**. Four findings converged across the channels;
two were shadow-only. Every citation was re-verified against the files here
before anything was applied.

### Findings, bands, and the branch each hit

Bands are A/B/C as `docs/HANDOVER.md:364-366` defines them; LIGHT/HEAVY is
`codex-review.md:140-152`. The §0.1 branch column applies the criterion that was
pinned before this round.

| # | Channel(s) | Band | Weight | §0.1 branch | Disposition | What changed |
|---|-----------|------|--------|-------------|-------------|--------------|
| R1-A | plugin + shadow (converged) | A | LIGHT | machinery | fix, as a **re-cut** | The screen now reads the **committed blob** (`git show HEAD:<path>`; a missing blob is `FAIL(absent)`) and **refuses a dirty tree**. The spec labels it honestly as an anchor-presence screen that is blind to meaning, placement and polarity, in all five places it is described. No polarity or insertion-point parsing was added (`codex-review.md:154-164`) |
| R1-B | plugin + shadow (converged) | A | LIGHT | machinery | fix | The DATA heredoc now fails closed (`done <<'DATA' \|\| exit 1`) and the run is rejected unless `anchors processed` equals the declared count, which closes both the transport failure and the zero-anchors shape in one guard |
| R1-C | plugin + shadow (converged) | A/B | **HEAVY** | Table B operative content | fix | R13's landed text contradicted the unconditional `codex-review.md:70-71` and the ADR-0031 breaker. Its Table B row now requires the bullet to **open by naming the precedence** — see below |
| R1-D | plugin + shadow (converged) | B | LIGHT | record | fix | §0.1 replaced by an ordered, first-match-wins decision list; see "Round 2 — criterion pinned in advance" |
| R1-E | shadow only | B | LIGHT to fix, but **DESIGN** to answer | **Table A disposition** | fix + full re-derivation | R12 was mis-measured as UNBOUND. Per §0.1's DESIGN branch the whole set was re-derived mechanically rather than the row patched — see below |
| R1-F | shadow only | B | LIGHT | mirror vs canonical | fix | O1, O2 and O3 now enumerate every canonical and mirrored edit an overrule implies |
| R1-G | shadow only | C | LIGHT | record | fix | Trailing whitespace stripped. **Larger than reported:** the shadow named 3 lines; `git diff --check` found **35**. Normalization disclosed above |

**Round outcome.** The most escalating branch any finding hit is **DESIGN**
(R1-E), and R1-C is **HEAVY**. Both mean the loop does not close: the set was
re-derived, and a full fresh external round 2 is owed on the revision.

**Not findings.** The shadow's `npm run lint` exited 1 because its sandbox
blocked a registry fetch (its own note says frontmatter passed); the host run on
`d2cb7aca` is rc=0, 0 errors, 268 spec(s) / 4 agent(s). The plugin recorded "No
product-scope objections."

**One consequence for the owner, surfaced not fixed.** The owner items O1-O4 were
adopted on 2026-09-05 (`2026-09-05-owner-rulings-runbook-sweeps-queue.md`), and
that record quotes the overrule costs as the spec then stated them — the costs
R1-F measured as understated. The **recommendations** are unchanged and the
adoption stands on them; but the corrected costs are materially larger (O3 alone
moves from "roughly six lines in `codex-review.md`" to order 20-30 lines across
four files, one of them `_TEMPLATE.md`, inherited by every future spec). That
dated ruling record is not rewritten — rulings records are append-only here — so
this note is where a reader learns the figures it quotes are superseded by the
spec's owner items.

### R1-E — the re-derivation (DESIGN branch), and why it was needed

Round zero's §0.3 sweep used **the stub's thirteen bullet ids**, while Table A
uses nineteen atomic ids. §0.3 disclosed the mismatch, but disclosure is not
alignment: a Table A row whose id shifted was never swept as its own claim. The
evidence was in fact present in §0.3's output — its "R13" probe set hit
`codex-review.md:72` on `/stop criterion/` — and was read as "the stop criterion
is bound" without being connected to Table A's R12.

The re-derivation runs **one probe set per Table A row, ids aligned R01..R19**,
claim-shaped and whitespace-flattened, over the same 18 surfaces
(`rederive-dispositions.js`):

```text
SURFACES READ: 18 of 18  (total flattened chars: 147158)
SWEEP IDS ARE TABLE A IDS — one probe set per Table A row, R01..R19

==== R01  proof of a fix is the re-grep/re-run, never the edit  — 3 hit(s)
    [docs/runbooks/codex-review.md] /claim to be RUN, not read/
        …nd compare against the literal there. - **A claim about how a tool behaves is a claim to be RUN, not read.** Four instances on PR #124 alone: a spec citing a shell fence's options that …
    [docs/runbooks/codex-review.md] /Reading is not evidence/
        … cannot discriminate — or cannot be satisfied at all — is a round-zero finding. Reading is not evidence: measured in one package, a non-discriminating fixture survived four read-only …
    [docs/runbooks/codex-review.md] /the missing run/
        … under-claimed a capability, so the bias is not in one direction: the defect is the missing run. **Paste the reproduction or do not state the behaviour** — and when someone el…

==== R02  read the tool's own summary, never your own recount  — 1 hit(s)
    [docs/runbooks/codex-review.md] /read the VALUE the tool produced/
        …e check (PR #22's boundary run) before the pattern was named. The general form: read the VALUE the tool produced, not the value the pipeline last touched. - **A zero-hit sweep is evidence only…

==== R03  +0 test delta on a test that dies before your change  — ZERO HITS across all 18 surfaces

==== R04  +0/-0 is a failure signature; prove the commit not the worktree  — ZERO HITS across all 18 surfaces

==== R05  prove a mutation was applied before believing its matrix  — ZERO HITS across all 18 surfaces

==== R06  a guard must notice its own death  — ZERO HITS across all 18 surfaces

==== R07  a canary differing by arity proves nothing  — ZERO HITS across all 18 surfaces

==== R08  claim sweeps are pronoun-aware; scope citation adjacent to the claim  — ZERO HITS across all 18 surfaces

==== R09  registered mirrors move in the SAME COMMIT  — 2 hit(s)
    [docs/runbooks/codex-review.md] /lockstep/
        …red Surface Checklist is the stronger day-to-day mechanism (it keeps mirrors in lockstep up front); this breaker is the backstop for when scattered contract prose slipp…
    [docs/specs/_TEMPLATE.md] /in one pass/
        …ec that mirrors it**, so a review finding updates the table and all its mirrors in one pass (update-all-mirrors) and any new mirror found in review is added here on the sp…

==== R10  two consecutive rounds on one contract family -> extraction  — 5 hit(s)
    [docs/runbooks/codex-review.md] /circuit.?break/
        …a gate which will punish the implementer for doing the work correctly. - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a finding on the *same* c…
    [docs/runbooks/codex-review.md] /two consecutive[^.]{0,110}(round|contract|family|kind)/
        …hat each looked defensible alone and never faced the aggregate question. - When two consecutive rounds land findings of the same kind, the next step is a design question, never another textual patch. - A design lo…
    [docs/runbooks/codex-review.md] /two consecutive[^.]{0,110}(round|contract|family|kind)/
        …ementer for doing the work correctly. - **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a finding on the *same* contract family, stop fixing finding-by-finding and do a contract-**extraction** pass instead: pull that contract into one canonical reference ta…
    [docs/runbooks/codex-review.md] /contract-\*\*extraction\*\*/
        … finding on the *same* contract family, stop fixing finding-by-finding and do a contract-**extraction** pass instead: pull that contract into one canonical reference table and registe…
    [.claude/agents/wd-reviewer.md] /extraction pass/
        …t keep landing on the same contract family across rounds (recommend a canonical-extraction pass), and mirror drift — a Deliverables cell, acceptance criterion, verification gr…

==== R11  every review round carries materiality bands A/B/C  — ZERO HITS across all 18 surfaces

==== R12  the reading the bands trigger is pinned BEFORE the round  — 5 hit(s)
    [docs/runbooks/codex-review.md] /STOP CRITERION/
        …p is a design question, never another textual patch. - A design loop states its STOP CRITERION in the round record BEFORE the first adversarial round, and re-states it whenev…
    [docs/runbooks/codex-review.md] /stop criterion/
        …p is a design question, never another textual patch. - A design loop states its STOP CRITERION in the round record BEFORE the first adversarial round, and re-states it whenev…
    [docs/runbooks/codex-review.md] /before the first adversarial round/
        …er textual patch. - A design loop states its STOP CRITERION in the round record BEFORE the first adversarial round, and re-states it whenever a HEAVY fix triggers a fresh round: which outcome cl…
    [docs/runbooks/codex-review.md] /before the first adversarial round/
        …themselves are fine. ### Template conformance (round zero, before any review) - Before the first adversarial round, the relay diffs the spec against `docs/specs/_TEMPLATE.md`'s section list and …
    [docs/runbooks/codex-review.md] /which outcome closes/
        …dversarial round, and re-states it whenever a HEAVY fix triggers a fresh round: which outcome closes the loop, and which outcome escalates — to a design question, a fallback, or an…

==== R13  form insufficiency vs predicate defect  — ZERO HITS across all 18 surfaces

==== R14  enumerate your own good, not the bad  — ZERO HITS across all 18 surfaces

==== R15  a reviewer judges the WHOLE CELL, not the grep window  — 3 hit(s)
    [docs/runbooks/spec-authoring.md] /cell WHOLE/
        …as no content cannot go stale. - After rewriting a canonical cell, re-read that cell WHOLE for a sentence the rewrite just falsified. The edit habit that survives every c…
    [docs/runbooks/spec-authoring.md] /intra-cell/
        … just falsified. The edit habit that survives every cross-surface discipline is intra-cell: the new sentence goes in, the old one stays, and no mirror checklist can see i…
    [docs/runbooks/spec-authoring.md] /re-?read that cell/
        …ints — what has no content cannot go stale. - After rewriting a canonical cell, re-read that cell WHOLE for a sentence the rewrite just falsified. The edit habit that survives e…

==== R16  follow a citation by GREPPING the cited text; line number disambiguates  — 3 hit(s)
    [docs/runbooks/codex-review.md] /cited RANGE/
        …means runnable now, on the pinned base, with what the spec itself provides. - A cited RANGE is checked at BOTH ends, mechanically — `file:START-END` must begin and end whe…
    [docs/runbooks/codex-review.md] /line-number citation/
        …ery executable claim the spec makes about the tree the implementer will find**: line-number citations, `grep` sentinels, digests, quoted code shapes, "today's behaviour" descriptio…
    [docs/runbooks/codex-review.md] /checked at BOTH ends/
        …now, on the pinned base, with what the spec itself provides. - A cited RANGE is checked at BOTH ends, mechanically — `file:START-END` must begin and end where its construct does. R…

==== R17  the tip is frozen: nothing writes into a worktree a gate is reading  — 3 hit(s)
    [docs/runbooks/codex-review.md] /porcelain/
        …ither disclosed it.) - Review is read-only, checked mechanically: `git status --porcelain` in the reviewed checkout is byte-identical before and after the run, or the ru…
    [docs/runbooks/codex-review.md] /byte-identical before and after/
        …nly, checked mechanically: `git status --porcelain` in the reviewed checkout is byte-identical before and after the run, or the run is invalid. - Output is relayed verbatim (see Rules). ### B…
    [docs/runbooks/codex-review.md] /read-only, checked mechanically/
        …able TMPDIR; both verdicts were readings and neither disclosed it.) - Review is read-only, checked mechanically: `git status --porcelain` in the reviewed checkout is byte-identical before and…

==== R18  both gates run on the SAME TIP and each verdict names it  — 3 hit(s)
    [docs/runbooks/codex-review.md] /independent second opinion on the same diff/
        …iewer.** wd-reviewer remains the merge gate (spec-fidelity review); Codex is an independent second opinion on the same diff. Both run; Gyula merges only when both are clean or every finding is dispositio…
    [docs/runbooks/codex-review.md] /Both run/
        …spec-fidelity review); Codex is an independent second opinion on the same diff. Both run; Gyula merges only when both are clean or every finding is dispositioned. 3. **…
    [docs/runbooks/codex-review.md] /Both run/
        …e by the value it protects, named at the moment of adding — or it is not added. Both runaway loops this repo has survived were additions that each looked defensible alo…

==== R19  declined owner grants surface loudly  — 1 hit(s)
    [docs/runbooks/gws-broker.md] /refus[^.]{0,50}grant/
        …ker checks for tampering before every send; if that file is altered, the broker refuses to send and tells you to re-grant at the keyboard. ## Turning access off / revoking - **Remove a grant locally:**…
```

**Rows whose disposition moved: exactly one.**

| Row | Was | Now | Bound half |
|-----|-----|-----|------------|
| R12 | UNBOUND | **PARTIAL** | `codex-review.md:72-81` binds the pinning half — a STOP CRITERION in the round record BEFORE the first adversarial round, stating which outcome closes and which escalates. The missing delta is the band→outcome mapping |

Two further corrections the re-derivation forced, neither a disposition change:

- **R18's bound half was cited too weakly.** `codex-review.md:14-17` does not
  merely say both gates run; it calls Codex "an independent second opinion on the
  **same diff**". The cell now says so. The delta R18 lands is still one *tip* and
  a verdict that names it — a diff is not a tip, and nothing there requires the
  verdict to name anything.
- **R19's sweep is no longer zero-hit.** The tightened probe returns one hit, in
  `gws-broker.md`: the capability broker refusing to send and telling you to
  re-grant. That is a **product** behaviour, not a review-round rule, so it binds
  nothing here and R19 stays UNPAID. Recorded because a sweep that now returns a
  hit must say why the hit is not a binding.

Everything else held, including two that the looser round-zero probes had made
noisy: **R14** returns ZERO under a probe requiring `enumerat…` together with
own/good/bad/forbidden (round zero's bare `/enumerat/` had produced unrelated
hits, correctly read as noise), and **R09**, **R15**, **R16**, **R17** confirm the
exact bound halves Table A already cited.

**R12's landing changed with its disposition.** It no longer shares R11's new
bullet — which would have split ownership of the stop criterion across two
constructs — and instead **EXTENDs `codex-review.md:72-81`**. Its anchor moves
from `pinned before the round` to `maps each band to an outcome`, since the
pinning half is already bound and only the mapping is the delta.

**The two taxonomies, reconciled in place** (R1-E's second half). A/B/C bands
grade a finding's **consequence**; LIGHT/HEAVY grades whether its **fix** changes
the product, and therefore whether a fresh round is owed. They are orthogonal —
this round is the worked example: R1-A is band A and LIGHT (an A-grade defect in
machinery, whose fix changes nothing an implementer builds), while R1-C is HEAVY
at a lower band. Both R11's and R12's Table B content now say this.

### R1-C — the R13 wording and insertion choice

**Choice: the insertion point stays `after :71`, mode NEW, and the bullet must
open by naming the precedence.** The alternative — EXTENDing `:70-71` itself —
was rejected on the acceptance criterion this WP already carries: an EXTEND must
leave the existing claim intact, and `:70-71` is the very rule R13 was found to
weaken. Folding a single-finding routing rule into the unconditional repeat rule
puts a qualifier inside the sentence being protected, and costs more words than
placing it after. Keeping it a NEW bullet leaves `:70-71` byte-identical.

Table B's R13 operative content now requires the bullet to state, before the
distinction: this routes a SINGLE finding and never suspends the repeat rules —
two consecutive rounds on the same kind still escalate under `:70-71`, and two on
the same contract family still fire the ADR-0031 breaker at `:376-383`, however
each finding was classified. A third anchor, `never suspends the repeat rules`,
was added so the screen can see the precedence clause; without it an implementer
could land the distinction and drop the precedence and still read green. The DATA
block and `DECLARED` move from 20 to 21.

### The re-cut screen, proved on six states plus one disclosed limit

The gate text below was **extracted from the spec**, not retyped, so the proof
runs exactly what the spec ships.

```text
#!/usr/bin/env bash
# ANCHOR-PRESENCE SCREEN over the COMMITTED tree. Proves each Table B anchor
# literal is present in the committed file. Proves NOTHING about meaning,
# placement or polarity — an inverted sentence containing an anchor PASSES.
DECLARED=21
if [ -n "$(git status --porcelain)" ]; then
  echo 'REFUSED: the working tree is dirty. This screen reads the COMMITTED blob,'
  echo 'so a result now would describe files nobody will merge. Commit, then re-run.'
  git status --porcelain
  exit 1
fi
rc=0
n=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  n=$((n + 1))
  f=${line%% :: *}
  lit=${line#* :: }
  if ! blob=$(git show "HEAD:$f" 2>/dev/null); then
    printf 'FAIL(absent)  %s :: %s\n' "$f" "$lit"
    rc=1
    continue
  fi
  # Flatten: drop * _ ` , join every line, squeeze runs of spaces.
  if printf '%s' "$blob" | tr -d '*_`' | tr '\n' ' ' | tr -s ' ' | grep -qF -- "$lit"; then
    printf 'PASS  %s :: %s\n' "$f" "$lit"
  else
    printf 'FAIL  %s :: %s\n' "$f" "$lit"
    rc=1
  fi
done <<'DATA' || exit 1
docs/runbooks/codex-review.md :: the proof of a fix is the re-run
docs/runbooks/codex-review.md :: not your own recount
docs/runbooks/codex-review.md :: dies relative to what you touched
docs/runbooks/codex-review.md :: prove the commit, not the working tree
docs/runbooks/codex-review.md :: grep the injected marker
docs/runbooks/codex-review.md :: notice its own death
docs/runbooks/codex-review.md :: arity proves nothing
docs/runbooks/spec-authoring.md :: pronoun-aware
docs/runbooks/spec-authoring.md :: adjacent to the claim
docs/specs/_TEMPLATE.md :: in the same commit
docs/runbooks/codex-review.md :: materiality band
docs/runbooks/codex-review.md :: C: hygiene
docs/runbooks/codex-review.md :: maps each band to an outcome
docs/runbooks/codex-review.md :: never suspends the repeat rules
docs/runbooks/codex-review.md :: form insufficiency
docs/runbooks/codex-review.md :: predicate defect
.claude/agents/wd-architect.md :: enumerate your own good
.claude/agents/wd-reviewer.md :: the whole cell, never the grep window
docs/runbooks/codex-review.md :: grep for the cited text
docs/runbooks/codex-review.md :: nothing writes into a worktree a gate is reading
docs/runbooks/codex-review.md :: on the same tip
DATA
printf 'anchors processed=%s declared=%s\n' "$n" "$DECLARED"
if [ "$n" -ne "$DECLARED" ]; then
  printf 'FAIL: processed %s of %s declared anchors — the input transport failed\n' "$n" "$DECLARED"
  exit 1
fi
printf 'sentinels exit=%s\n' "$rc"
exit "$rc"
```

| State | Expected | Observed | exit |
|-------|----------|----------|------|
| compliant commit | green | 21 PASS, `anchors processed=21 declared=21` | 0 |
| violating commit (one anchor reworded) | red, exactly 1 | 1 FAIL (`arity proves nothing`) | 1 |
| deliverable absent from the commit | red | `FAIL(absent)` on `wd-architect.md` | 1 |
| anchor added but NOT committed | red | `REFUSED` — and the OLD worktree-reading matcher returned **PASS** on the identical state | 1 |
| dirty tree | refuse | `REFUSED`, no verdict issued | 1 |
| untouched tree, committed | red, 21 FAIL | run post-commit, below | 1 |
| **anchor-preserving inversion** | — | **21 PASS** — a committed sentence reading "It is NOT required that both gates run on the same tip" passes | 0 |

The last row is **a disclosed limit, not a proof**. It is what an
anchor-presence screen is, and it is why the spec now says in five places that
PASS means an anchor landed and nothing more.

**R1-B's failure mode, recorded honestly.** Both review channels reproduced it in
their sandboxes — the plugin raw records `cannot create temp file for here
document` followed by `sentinels exit=0`, and the shadow raw records the same
with zero anchors processed. **Neither the orchestrator nor this author could
reproduce it on the host** (bash 3.2.57, `TMPDIR` set to a nonexistent directory
and to `/var/empty`: 20 FAIL, rc=1 both times; a direct heredoc probe under the
same `TMPDIR` succeeded). So the fix is not validated by a local red — it is
validated by the two sandbox reproductions in the committed raws, plus the
processed-count assertion, which fails closed on the shape regardless of cause.
Stating this rather than implying a local reproduction is the point.

```text
===== bash version =====
GNU bash, version 3.2.57(1)-release (arm64-apple-darwin25)

===== R1-A(i): the matcher against an INVERTED sentence =====
  PASS (matcher accepts the INVERTED form) :: nothing writes into a worktree a gate is reading
  PASS (matcher accepts the INVERTED form) :: the proof of a fix is the re-run

===== R1-A(ii): an UNSTAGED anchor passes a working-tree read, fails a HEAD read =====
  git status (file is now dirty/unstaged):
     M docs/runbooks/spec-authoring.md
    WORKING-TREE read : PASS  :: pronoun-aware   <-- false green
    COMMITTED  read   : FAIL  :: pronoun-aware   <-- the commit read catches it
  restored; porcelain now:
  (empty above = restored)

===== R1-B: attempt to reproduce the heredoc transport failure on this host =====
  --- TMPDIR=/nonexistent-dir-xyz ---
    rc=1 ; PASS=0 FAIL=20
    sentinels exit=1
  --- TMPDIR=/var/empty ---
    rc=1 ; PASS=0 FAIL=20
    sentinels exit=1

  --- direct probe: does 'done <<HEREDOC' fail on this host with an unwritable TMPDIR? ---
    read:one
    inner rc=0
```

## Round 2 — criterion pinned in advance

Re-stated before round 2 because R1-C is HEAVY (`codex-review.md:72-81` requires
the criterion to be re-stated whenever a HEAVY fix triggers a fresh round). This
list supersedes §0.1 and is the criterion's single canonical text.

**Applied PER FINDING, first match wins:**

1. **Scope** — the finding argues a rule should not land at all, or should land
   outside the Deliverables table → **OWNER item**, carrying a recommendation and
   the enumerated overrule cost. The loop continues on the remaining findings.
2. **Disposition** — it changes a Table A disposition → **DESIGN**: re-derive the
   whole set mechanically with the sweep's ids aligned to Table A's, and update
   every registered mirror in the same commit. Never a row patch.
3. **Same-family repeat** — it is the second consecutive round landing a finding
   on a Table A or Table B row, in any registered mirror → **ADR-0031
   extraction** (`codex-review.md:376-383`), never a third row patch.
4. **Operative content** — it changes Table B's operative content, insertion
   point, mode, or anchor literals → **HEAVY fix**, then a full fresh external
   round.
5. **Mirror drift** — a registered mirror disagrees with a canonical table that
   is itself right → **LIGHT fix**: correct every mirror the checklist names, in
   the same commit, and re-run the mirror walk. No new round.
6. **Machinery or record only** — it is about the anchor-presence screen or this
   round record and nothing else → **LIGHT fix**, mechanically re-verified, no new
   round. If this is the **second consecutive** round of screen-only findings →
   **FALLBACK**: drop the per-rule screen; `npm run lint` plus the reviewer's read
   against Table B carry it (`codex-review.md:154-164`).
7. **Nothing about the product** → **CLOSE**.

**Round rule.** A round's outcome is the **most escalating** outcome any single
finding produced, on the ladder `CLOSE < LIGHT < HEAVY < EXTRACTION < DESIGN`.
OWNER items are raised alongside and do not by themselves hold the loop open.

**Why this replaces the round-1 bullets.** Both channels built the same three
counter-cases against them, and each is now decided by exactly one branch: a
finding changing Table B's operative content but not its disposition or file was
barred from CLOSE and matched nothing — it is now #4; a "drop this rule" finding
matched DESIGN and OWNER at once — first-match-wins sends it to #1; a second
screen-only round matched CLOSE and FALLBACK with no precedence — #6 is reached
before #7 and carries the fallback itself.

## External rounds (round 2 onward)

<!-- orchestrator: Codex plugin adversarial review + hermetic shadow; raws
     committed BEFORE adjudication, each round citing the raw file's path AND
     the SHA of the commit that introduced it (codex-review.md:82-91) -->
