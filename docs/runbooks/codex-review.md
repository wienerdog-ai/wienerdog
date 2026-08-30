# Runbook: Codex adversarial review loop

A second, independent AI reviewer (a non-Claude model; backends in
"How to run it") is a standard gate in the pipeline, alongside wd-reviewer.
Adopted 2026-07-12 after its first outing found eight real, zero hallucinated
findings across two rounds on the ADR-0020 / WP-080…083 spec chain.

## When it runs

1. **Design review (mandatory): every new or revised spec/ADR set.** After
   wd-architect drafts, the orchestrator session runs the loop below. A spec
   does not move to `Ready` until Codex returns no findings the owner hasn't
   explicitly accepted as residual.
2. **PR review (additional gate): alongside wd-reviewer.** wd-reviewer remains
   the merge gate (spec-fidelity review); Codex is an independent second
   opinion on the same diff. Both run; Gyula merges only when both are clean
   or every finding is dispositioned.
3. **Dispatch-time re-verification (mandatory): every WP, at the moment it is
   handed to an implementer.** The **orchestrator session** re-runs the spec's
   executable Current-state claims against current `main` before it writes the
   dispatch message. See "Dispatch-time re-verification" below. Listed here
   because this is the section a dispatcher reads, and the gate is worthless if
   it is only findable next to the design-review loop that precedes it.

## The loop (design review)

```text
wd-architect drafts → adversarial design review (focus text scoped to the
drafted docs) → orchestrator verifies citations against the files → owner
accepts/rejects findings → wd-architect revision pass → adversarial review
round 2 (ask it to verify its own prior findings are fixed AND attack the new
mechanisms) → repeat until clean → owner sign-off → specs move to Ready.
```

### Finding disposition

- Every finding gets exactly one disposition: **fix** (a genuine defect),
  **residual** (accepted, one-line reason — the rule above), or **drop**
  (style/preference; noted in the round record, never in the artifact).
- The relay PROPOSES a disposition for every finding; the owner may accept
  the proposals as a batch or override any single one. Deciding stays with
  the owner; drafting the decisions does not.
- A hardening proposal becomes text only on an explicit owner yes — never
  folded in silently.
- **Altitude guard (a drop sub-case):** a finding that lives one level
  below its target document — an implementation detail raised against an
  ADR, a code-level nit raised against a spec contract — is dropped, or
  routed to the artifact that owns that level. It is never folded into the
  higher document.
- **Diff size does not measure contract impact (a park sub-case).** A finding
  whose only honest fix re-imports a property the package was deliberately
  re-cut to exclude is not a routine fix, however small the patch looks — it is
  a contract change, and a contract change is the owner's act. Park it rather
  than folding it. (Measured: on a package re-cut to make no freshness claim,
  every honest fix for a baseline defect — two-pass stability check, lock,
  re-read-and-compare — was a freshness mechanism, each a few lines, each
  quietly rebuilding the absence that was the point.)
- Every solution starts with the value question: what does fixing this
  protect or earn in the product, and is that worth the fix plus the
  maintenance it creates? "Not worth solving" is a legitimate
  disposition — a named residual — and reaching it before the first
  patch is cheaper than after the third round. The repeat-kind rule
  below decides HOW to solve what recurs; this question decides
  WHETHER.
- The same test gates every addition to the system itself: a new rule,
  a document, a gate, a process step earns its place by the value it
  protects, named at the moment of adding — or it is not added. Both
  runaway loops this repo has survived were additions that each looked
  defensible alone and never faced the aggregate question.
- When two consecutive rounds land findings of the same kind, the next
  step is a design question, never another textual patch.
- A design loop states its STOP CRITERION in the round record BEFORE
  the first adversarial round, and re-states it whenever a HEAVY fix
  triggers a fresh round: which outcome closes the loop, and which
  outcome escalates — to a design question, a fallback, or an owner
  ruling. Measured across two packages: every phase that ran under a
  pre-pinned criterion closed within one or two rounds; every phase
  without one drifted — the treadmill's fuel is an undefined finish
  line. A round record with no stated criterion is a loop where this
  rule did not run. No tooling, no hook — one more line in a record
  that is already being written.
- The reviewer's raw output is committed BEFORE anyone reads or judges
  it — adjudication happens on evidence the adjudicator cannot have
  shaped. This is what makes an after-the-fact ruling possible when a
  gate was skipped: the record is intact. The round record cites, per
  round, the raw file's path AND the SHA of the commit that introduced
  it: a SHA cannot be cited before the commit exists, so a skipped
  raw-commit is visible at the moment of adjudication — not at a later
  audit, when the property is no longer recoverable. A round row
  without that SHA is a round where this rule did not run. No tooling,
  no hook — one more line in a record that is already being written.
- `failed to load configuration: No such file or directory` means a
  stale plugin broker, not a bad checkout. The plugin keeps one broker
  process per workspace PATH; if that directory was deleted and
  recreated (a worktree removed and re-added), the old broker still
  runs in the deleted directory and every call through it fails.
  Confirm by comparing `lsof -a -p <broker pid> -d cwd` with
  `stat -f '%i' <path>`; fix by killing that pid and deleting its
  `broker.json` under the plugin's state directory. The next call
  starts a fresh broker. Worktrees themselves are fine.

### Template conformance (round zero, before any review)

- Before the first adversarial round, the relay diffs the spec against
  `docs/specs/_TEMPLATE.md`'s section list and reports it in the round
  header: every template section is either present or explicitly marked
  `N/A — <one-line reason>`. A silently absent section blocks the round.
- The check runs in a clean context: an executor that took no part in
  drafting, relaying or reviewing this spec, given exactly two inputs —
  the spec and the template. A context that helped produce the artifact
  reads what it meant, not what is written. No external reviewer is used
  either — this is a conformance read, not a design critique.

### Internal coherence pass (round zero's peer)

- Before the first external round, one internal pass reads the spec end
  to end for contradictions: a claim made in one place and unmade in
  another, a count that no longer matches its list, an assertion citing
  an input that is not there. Findings get dispositions like any round's.
  (Measured twice: 9 and 19 substantive finds that prior external rounds
  had not caught.)
- The same pass RUNS every acceptance criterion and verification step
  that has a runnable form: commands executed on the tree the claim
  names, fixtures parsed, per-criterion exit status in the round-zero
  record. A criterion that cannot discriminate — or cannot be
  satisfied at all — is a round-zero finding. Reading is not
  evidence: measured in one package, a non-discriminating fixture
  survived four read-only rounds, a template-inherited criterion was
  unsatisfiable from the first draft, and one command was run on the
  WRONG tree — a number from the wrong base looks like evidence and
  is not. Runnable means runnable now, on the pinned base, with what
  the spec itself provides.
- A cited RANGE is checked at BOTH ends, mechanically — `file:START-END` must
  begin and end where its construct does. Reading verifies that the named line
  resolves; it never notices a range that ends inside the next declaration's
  JSDoc, so this one is a check, not an attention problem. (Measured: the same
  drift returned in three consecutive drafts of one package; applied to its
  successor's first draft it caught three more, one wrong at both ends.)

### Weighted closure

- A finding is HEAVY when fixing it changes what the implementer builds
  in the product: `src/` behavior, the ADR contract, anything a user or
  a consuming model observes. A finding about the spec's own
  verification machinery — tests, gates, mutation rows, wording — is
  LIGHT. When in doubt, HEAVY.
- HEAVY: fixes land, then a full fresh external round.
- LIGHT: fixes land and are verified mechanically (mirror walk,
  re-measurement); the loop closes without another external round.
- The loop is DONE when a round finds nothing about the product.
  Machinery findings at that point are fixed or accepted as named
  residuals; they do not extend the loop.

### The loop converges by freezing surface, not by patience

- Verification machinery may GROW only to guard a product behavior, and
  always in the smallest form that guards it. A finding about the
  machinery itself never justifies more machinery: it is fixed within
  the existing surface, or accepted as a named residual.
- Why this is the convergence condition, measured: each fix injects
  0.5-0.9 new defects. Below 1, a frozen surface makes the defect
  supply a shrinking series — the loop ends by itself. Every round the
  surface grows, the supply is refilled. The treadmill is the growth,
  not the error rate.

## Dispatch-time re-verification (the last gate before an implementer starts)

**`Ready` is not the same as "still true".** **The orchestrator session runs
this**, in the same session that writes the dispatch message and immediately
before it — the same actor that runs the design-review loop above, at the next
step of the same pipeline. **Before it hands a WP to an implementer it re-runs
that spec's executable Current-state claims against current `main`. A stale
claim blocks the dispatch and routes the spec back to wd-architect** — the
orchestrator does not repair it, and the implementer is never dispatched to work
around it.

**Dispatch here is a conversation, not a command**, which is exactly why the rule
has to name its actor and its artifact rather than a hook: there is no dispatch
command, agent invocation or workflow to wire this into, and inventing an entry
point to hold the gate would be more machinery than the gate. What makes it
auditable instead is the **dispatch message**: it names each claim re-run and the
result, so a reader can tell a gate that ran from a gate that was skipped. That
is the whole record — no new file, no tooling, no schedule.

**Which claims. The boundary is RUNNABILITY — not file ownership, and not a
heading.** Re-run **every executable claim the spec makes about the tree the
implementer will find**: line-number citations, `grep` sentinels, digests, quoted
code shapes, "today's behaviour" descriptions, and permitted-removal bounds. If it
has a runnable form, it is in scope. If it has none, it was never an executable
claim and this gate does not cover it.

**Two boundaries this rule previously drew and both were wrong.** *Not the
heading:* a spec may carry copied, un-re-measured facts anywhere —
`WP-secret-fence-ep2-redact-arm` puts rows **D1/D2** under
`## Derived measurements — copied, not re-measured`, and a check bounded to
`## Current state` walks straight past them. *Not file ownership:* a `Ready` spec
routinely snapshots exact code from files **inside its own Deliverables** —
`WP-147` quotes `shared.js` / `manifest.js` code shapes it will then edit, `WP-151`
the same — and those drift in exactly the `Ready`→dispatch window this gate exists
for. A spec's own future edits do not protect its record of what that file says
*today*. **Owning the file makes a stale snapshot worse, not exempt**, because the
implementer will edit from it.

Keep the owned/external distinction only where it aids reporting — it is useful to
say which stale claims the implementer could have fixed and which route back — but
it decides nothing about what gets re-run.

The spec is the inventory: it is required to inline everything the implementer
needs (ADR-0005), so an executable claim that appears nowhere enumerable is a spec
bug and is reported as one rather than silently re-verified. **If a spec's
executable claims cannot be enumerated from it, the spec is not dispatchable and
goes back to wd-architect** — the same routing as a stale claim, for the same
reason.

**Why it exists.** A spec's Current-state section is verified once, at design
time. Every dependency that merges between then and dispatch can falsify it,
silently, without anyone editing the spec. Measured on the `secret-fence` epic:
the specs count **seven** capture-drift instances in the epic
(`docs/specs/done/WP-secret-fence-two-tier-detector.md:320`,
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:618`), and the `0.11.0` batch
merging on 2026-07-26–27 moved `main` underneath **both** legs at once — round 1
of the design gate then found **seven stale citations across the two legs**, all
from that single event and none of them a design error
(`docs/specs/done/WP-secret-fence-two-tier-detector.md:326`).

**And one of them was not cosmetic.** `WP-stance-authority-containment` rewrote
`docs/THREAT-MODEL.md`'s stance clause, so the ep2 spec's V-27 sentinel grepped
for a sentence that no longer existed. V-27 exited 1 **before an implementer
could write a line**, while that spec's own Deliverables row and V-27's own
failure text both forbade touching the region that would fix it — a hard
deadlock, dispatched (`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:629`).
Re-running the claims at dispatch turns that into a five-minute architect edit
instead of a blocked session.

**Three rules follow.**

- **Re-run, do not re-read.** A claim is stale or it is not; reading the spec
  again cannot tell you which. If a claim has no runnable form, it was not an
  executable Current-state claim and this gate does not cover it.
- **A stale claim goes back to wd-architect, never to the implementer.** The
  spec's Deliverables table is a permission boundary, so the file that would fix
  a rotted citation is usually outside the implementer's reach — which is what
  made the case above a deadlock rather than an inconvenience.
- **The dispatch message records the run, AND THE REVISION IT RAN AGAINST.** Which
  claims were re-run, their results, and **the commit SHA the claims were re-run
  against**. A dispatch that does not say is a dispatch where this gate did not run,
  and it is the orchestrator's to redo.
- **The implementer's worktree starts from that SHA** — or, equivalently and often
  simpler, the verification runs *against the already-created worktree* and the
  record carries that worktree's `HEAD`. Either order is fine; what is not fine is a
  green record with no revision attached, because a merge landing between the
  verification and the worktree creation recreates the exact stale-spec condition
  this gate exists for, and leaves a record saying everything passed. **This is what
  the record must CONTAIN — no tooling, no hook, one more line in a message that is
  already being written.**

## How to run it

The gate is a contract, not a tool. Two backends can execute it; both
receive the same inputs and owe the same report. Improvements to the
gate are written into this contract (or the Rules below) — never into
a backend bullet and never into the vendored prompts, so they hold for
every backend.

### The contract (backend-agnostic)

- Reviewer instructions are the two vendored prompts in
  `docs/runbooks/review-prompts/` — `adversarial.md` for design
  review, `pr-rubric.md` for PR review. They are verbatim upstream
  copies with a provenance header, and they are frozen: never edited,
  only re-vendored wholesale when upstream moves, followed by a fresh
  both-directions validation. Anything of ours rides in the focus text
  or in this contract.
- Design review input: the drafted docs, plus focus text naming the
  exact files to review and the specific decisions to challenge;
  explicitly exclude unrelated working-tree files (`docs/marketing/`,
  `memory/research/`, `userreports/`). On round ≥ 2, list the prior
  findings and ask the reviewer to verify each is genuinely fixed, not
  re-worded.
- Where a ruling makes a whole class of finding inapplicable — a package that by
  ruling has no consumer, so it owes no locking, re-validation or generation
  invariant — the focus text states that boundary in the reviewer's own terms
  BEFORE the vendored prompt, and instructs the reviewer to file disagreement as
  a scope objection in the routed section instead of counting it toward the
  verdict. Pre-empting a category error costs nothing; routing it afterwards
  costs the round it already consumed. (Measured: stated up front, the routed
  section came back empty and the reviewer confirmed it had counted no such
  finding toward the verdict.)
- PR review input: the PR branch's diff against its merge base with
  `main`; no focus text.
- The report states what was EXECUTED, not only what was read: did the
  test suite actually run, and with what exit status. A verdict whose
  tests did not run is a reading, and must say so. (Measured
  2026-08-11: two PR-gate runs exited 1 on an unwritable TMPDIR; both
  verdicts were readings and neither disclosed it.)
- Review is read-only, checked mechanically: `git status --porcelain`
  in the reviewed checkout is byte-identical before and after the run,
  or the run is invalid.
- Output is relayed verbatim (see Rules).

### Backend selection

If the `gptsol` agent is available in the current session, use it;
otherwise use the Codex plugin. A backend counts as validated only
after its own both-directions run (green on a compliant diff, red on
a deliberately broken one) — one backend's green never validates the
other.

### Backend: gptsol agent (preferred where available)

- One agent per gate run. Dispatch = the gate's vendored prompt
  (placeholders filled where the prompt has them), the contract inputs
  above, and the instruction to report what it executed and return the
  findings verbatim as its final message.

### Backend: Codex plugin (works anywhere)

- Design review: `/codex:adversarial-review` with the focus text.
- PR review: `/codex:review` (native, no focus text) against the PR
  branch.
- Prefer `--background`; results via `/codex:status`.
- This backend injects its own prompt copies (the plugin's adversarial
  prompt; the Codex CLI's built-in rubric). The vendored files pin the
  exact versions this pipeline validated; if upstream moves, re-vendor
  and re-validate rather than letting the gate's semantics drift
  silently.

## Rules

- Codex output is relayed **verbatim** to the owner — never paraphrased,
  softened, or filtered.
- The orchestrator spot-checks citations against the actual files before
  anyone acts on a finding (both rounds so far were accurate, but the
  competitor-research lesson stands: verify, don't trust).
- Findings are fixed by **wd-architect** (specs/ADRs) or the **implementer**
  (PR diffs) — never by the orchestrator inline, and never by Codex itself.
- A finding the owner rejects is recorded in the spec/PR as an accepted
  residual with a one-line reason.
- **Keep the PR body small enough for CI to read it.** `.github/workflows/ci.yml`
  passes `github.event.pull_request.body` to `bash` as an environment variable in
  the `pr-title` and `boundary` jobs, so a body that grows past the runner's
  argument limit fails both with
  `An error occurred trying to start process '/usr/bin/bash' … Argument list too long`
  — a red X that says nothing about the diff. Measured on PR #124: **~144 KB was
  over the line; ~30 KB is comfortably under it.** A long review loop should put
  each round's dispositions in a **PR comment** (comments are never passed to a
  job) and keep the body to the template plus the current round. **And note where
  the durable record belongs**: not the PR at all, but the spec, ADR or runbook the
  round changed, where the next reader can re-run it.
- **Run a gate from a script, not from an inline shell one-liner.** A pattern
  passed through nested quotes — `echo "… $(grep -E "$PAT" … ) …"` — silently
  changes what the gate matched, and the result looks like the gate moved.
  Measured on PR #124 round 14: that shape reported the pinned owner-signature
  digest as MOVED when it was byte-identical, and that digest is one nobody may
  ever recompute. **A false red on a never-recompute pin is one keystroke from
  destroying it.** Put the gate in a file, quote once, and compare against the
  literal there.
- **A claim about how a tool behaves is a claim to be RUN, not read.** Four
  instances on PR #124 alone: a spec citing a shell fence's options that the fence
  did not declare; a review harness whose prepended setup changed what it measured;
  "the worktree variant could not be executed here" when what had failed was one
  command's *shape*; and an audit asserting that `grep … && { … }` aborts under
  `set -e` — it does not, because the left operand of `&&` is errexit-exempt
  (measured, bash 3.2.57). Three of the four *over*-claimed a hazard and one
  under-claimed a capability, so the bias is not in one direction: the defect is
  the missing run. **Paste the reproduction or do not state the behaviour** — and
  when someone else's claim cannot be reproduced, the burden is on the run.
- **Prove a new gate in BOTH directions.** Red-before-work shows a check is not
  vacuous; it does **not** show the check is not *over-strict*, because a check
  that rejects the correct answer is also red before the work and looks identical
  from that side. So run a new verification step twice: on the untouched tree
  (expect red) **and** on a hand-constructed version of the expected finished
  state, including the awkward-but-legal cases (expect green). Cheap — the second
  run is a heredoc — and it is the only thing that catches a gate which will
  punish the implementer for doing the work correctly.
- **Loop circuit-breaker (ADR-0031).** If two consecutive review rounds land a
  finding on the *same* contract family, stop fixing finding-by-finding and do a
  contract-**extraction** pass instead: pull that contract into one canonical
  reference table and register its mirrored surfaces per ADR-0031's Mirrored
  Surface Checklist, then resume the loop. The Mirrored Surface Checklist is the
  stronger day-to-day mechanism (it keeps mirrors in lockstep up front); this
  breaker is the backstop for when scattered contract prose slipped through
  unregistered.
- **Capture an exit code as its own statement, immediately.** `rc=$?` on the
  line after the command — never after an intervening command substitution or
  echo, which overwrite `$?` with their own status. The failure shape is a
  gate measured as exit 0 that actually exited 1, pasted as green evidence;
  it appeared twice in one day on the same check (PR #22's boundary run)
  before the pattern was named. The general form: read the VALUE the tool
  produced, not the value the pipeline last touched.
- **A zero-hit sweep is evidence only if the sweep demonstrably read its
  targets.** A grep that failed to open a file also reports zero matches —
  an unquoted variable holding several paths, a shim that does not
  word-split, a binary-skip default — and the output is indistinguishable
  from a clean sweep. For an absence claim ("this phrase appears nowhere"),
  pass every path literally, use the system grep with `-a`, and treat any
  `No such file` on stderr as the sweep not having run. Measured on PR #22:
  a full round of "ZERO HITS — clean" verdicts were false for exactly this
  reason.

## Requirements

Machine-local: the `codex@openai-codex` plugin installed in Claude Code and
Codex CLI authenticated (currently Gyula's machine, ChatGPT auth). If the
plugin is unavailable, the loop is skipped and the skip is noted in the PR /
spec Done record — wd-reviewer alone is then the gate, as before 2026-07-12.
