---
date: 2026-09-15
related_wps: [WP-dream-filtered-input-budget]
---

# Dream input allocation: investigation and approval record

Current checkpoint: owner-ratified and Ready; the lock prerequisite is merged.
The dated investigation/review narrative below preserves its original state;
the final ratification section supersedes earlier pending-approval notices.

## Scope and base

The owner requested verification of raw-size input allocation, synchronization
of the fork with upstream, then a work-package draft for the fix. The local
`main`, fetched fork `main`, and upstream `main` all resolved to
`91668da62822c73be6115a3e6d06c6ec51462509`; no merge or push was needed.
Drafting takes place on `wp/dream-filtered-input-budget`.

Only the spec and this evidence record are authored here. No product change,
personal transcript read, installed dream run, ledger reset, or vault mutation
is part of this investigation.

## Reproduction

The following standalone Node program runs from the repository root. It creates
synthetic Codex transcripts in a fresh temporary directory and deletes that
directory in `finally`. Nine sessions contain mostly parser-omitted reasoning
records; one contains 200 retained user messages. This is investigation
evidence, not a prescribed implementation-test design.

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { getPaths } = require('./src/core/paths');
const transcripts = require('./src/core/transcripts');
const { collectExtracts } = require('./src/core/dream/scratch');
const ledgerLib = require('./src/core/dream/ledger');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-budget-proof-'));
try {
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'), CODEX_HOME: path.join(root, 'codex') });
  const dir = path.join(paths.codexDir, 'sessions', '2026', '09', '15');
  fs.mkdirSync(dir, { recursive: true });
  const message = (text) => ({ type: 'response_item', payload: {
    type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
  for (let i = 0; i < 10; i++) {
    const id = i === 9 ? 'useful' : `noisy-${i}`;
    const records = [{ type: 'session_meta', payload: { id, cwd: '/example' } }];
    if (i === 9) {
      for (let j = 0; j < 200; j++) records.push(message(`Message ${j}: ` + 'x'.repeat(1000)));
    } else {
      for (let j = 0; j < 100; j++) records.push({ type: 'response_item',
        payload: { type: 'reasoning', encrypted_content: 'x'.repeat(10000) } });
      records.push(message('A short useful user message.'));
    }
    fs.writeFileSync(path.join(dir, `rollout-${id}.jsonl`), records.map(JSON.stringify).join('\n') + '\n');
  }
  const discovered = transcripts.discover(paths, { since: null });
  const size = (e) => Buffer.byteLength(JSON.stringify(e));
  const fullBytes = discovered.map(d => transcripts.parse(d)).reduce((n, e) => n + size(e), 0);
  const ledger = { version: 1, baseline_mtime: { claude: null, codex: null }, files: {} };
  const selected = collectExtracts(paths, ledger, 400000);
  const kept = selected.entries.map(e => JSON.parse(fs.readFileSync(e.scratchFile, 'utf8')));
  const keptBytes = kept.reduce((n, e) => n + size(e), 0);
  const useful = kept.find(e => e.session_id === 'useful');
  const d = selected.processed.find(d => path.basename(d.path) === 'rollout-useful.jsonl');
  assert(fullBytes < 400000);
  assert(useful.messages.length < 200);
  assert.equal(ledgerLib.selectState(ledgerLib.recordProcessed(ledger, d), d), 'skip-processed');
  console.log(JSON.stringify({ budgetBytes: 400000,
    rawBytes: discovered.reduce((n,d) => n + d.size, 0),
    filteredBytesBeforeBudgetTruncation: fullBytes, keptBytes,
    scratchFileBytes: selected.entries.reduce((n,e) => n + fs.statSync(e.scratchFile).size, 0),
    keptPercentOfFiltered: +(100 * keptBytes / fullBytes).toFixed(1),
    usefulMessagesBefore: 200, usefulMessagesKept: useful.messages.length,
    truncatedSessions: selected.truncated,
    nextSelectionAfterSuccessfulProcessing: 'skip-processed' }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
```

Observed output on the inspected base, exit 0:

```json
{
  "budgetBytes": 400000,
  "rawBytes": 9297929,
  "filteredBytesBeforeBudgetTruncation": 212674,
  "keptBytes": 41796,
  "scratchFileBytes": 43680,
  "keptPercentOfFiltered": 19.7,
  "usefulMessagesBefore": 200,
  "usefulMessagesKept": 37,
  "truncatedSessions": [
    {
      "harness": "codex",
      "session_id": "useful",
      "originalBytes": 209929,
      "keptBytes": 39051
    }
  ],
  "nextSelectionAfterSuccessfulProcessing": "skip-processed"
}
```

Absolute temporary-path lengths can change serialized byte counts across
machines. The discriminating facts are that complete filtered input fits while
messages are truncated, and an unchanged file recorded processed is skipped.
The example does not measure personal historical loss or invoke the brain.
Its assertions demonstrate the defect; they are expected to fail after a fix.

## Design boundary

The draft changes content allocation, preserving the raw intake and memory
bounds. ADR-0023 Decision §3 currently requires allocation from discovery size,
so the draft includes an owner-approved amendment as an implementation
deliverable. No historical owner approval is treated as approval of this change.

Compact JSON remains the allocation metric; pretty-printed scratch byte counts
are a separate existing diagnostic. Genuine content truncation still has the
existing processed semantics. Historical recovery and partial-session progress
are deliberately outside this work package.

## Design review status

The draft is not `Ready`. No external design-review verdict is claimed. The
session's tool inventory exposes neither the runbook's `gptsol` agent nor its
Codex plugin backend. The runbook permits a recorded backend-unavailable skip;
the independent review and owner sign-off remain pending for this draft.

Before an external round, complete the runbook's clean-context template pass
and internal coherence pass. Pin the loop criterion now: a material A/B product
finding blocks readiness; propose a disposition to the owner. A HEAVY accepted
fix requires a fresh external round. LIGHT machinery findings are verified
within the existing surface and do not alone extend the loop; C findings are
fixed or dispositioned. Two consecutive rounds on the same contract family
trigger the runbook's extraction/circuit-breaker step. No residual is accepted
on the owner's behalf.

## Author verification

The author re-ran the reproduction above: exit 0, with the recorded output
reproduced exactly on this machine. Mechanical source assertions confirmed the
allocation and truncation conditions, scratch encoding, processed membership,
parser limits, and ADR allocation wording against the inspected base.

| Check | Result |
|---|---|
| Required template headings | 10/10 present; author check, not the independent round-zero gate. |
| `npm test -- tests/unit/dream-collect.test.js tests/unit/transcript-stream.test.js tests/unit/transcripts.test.js` | Exit 0; 77 passed, 0 failed, 0 skipped. This includes the existing constrained-heap regression. |
| `npm run lint` | Exit 0; 660 Markdown files, 0 errors; frontmatter passed for 273 specs and 4 agents. PowerShell analysis was skipped because `pwsh` is unavailable. |
| Boundary checker | Exit 0 for both the actual documentation paths and the proposed implementation deliverables. |
| `npm test` | Exit 1; 2,699 tests, 2,686 passed, 1 failed, 12 skipped; 103,036.627708 ms. Failure detailed below. |

Full-suite failure: `tests/integration/adopt-e2e.test.js:73`, test
`adopt-e2e: init → adopt → sync → dream through mapped tiers, one revertable commit`.
`resolvePinnedSpawn` rejects the test's temporary
`home/.local/bin/claude` because its recorded command path is
`/Users/felho/.local/share/fnm/node-versions/v24.18.0/installation/bin/claude`.
The error reaches the test through `spawnPinned`, `spawnBrain`, and
`runBrainWithWatchdog`. This run used unchanged product and test code at the
inspected base; only the two documentation files were new. The failure was not
repaired or waived. It is separate from the allocation defect and does not
justify modifying the installed app or running `wienerdog sync`.

These are baseline and documentation checks, not evidence of an implemented
fix or a substitute for independent design review. AC1–AC7 in the spec describe
the future implementation and its review; the new regression assertions do
not exist yet.

## Review continuation

The owner authorized proceeding with the review. The earlier backend-availability
claim was too narrow: checking only the session's directly exposed tools missed
`~/.claude/agents/gptsol.md`. It specifies `codex/gpt-5.6-sol` through the local
Claude/llmp route. Running that agent succeeded; no plugin installation or
machine configuration change was needed.

The owner then clarified the backend intent: `gptsol` is the Claude Code
development environment's route to an independent Codex adversarial agent.
In a native Codex session, use a fresh native Codex subagent directly. This
session applies that explicit instruction rather than requiring the historical
Claude/llmp transport. The review contract, independence and evidence rules
remain applicable; no repo-wide process document is silently rewritten.

### Initial bridge calibration

Two independent calls used `claude --agent gptsol`, no tools, hooks disabled,
no MCP servers and no session persistence. Each received the frozen vendored
adversarial prompt and one complete synthetic module/contract. The compliant
module returned filtered bytes; the deliberately broken module returned raw
bytes. Both exited 0; both response envelopes identify `codex/gpt-5.6-sol`.
The correct case returned `approve`, the broken case `needs-attention` with
the exact wrong byte-accounting behavior identified. Neither claimed tests ran.

The complete inputs and raw envelopes were committed at `3ac51b66` before
reading the envelopes:

- `2026-09-15-dream-filtered-input-budget-calibration-green-input.txt`
- `2026-09-15-dream-filtered-input-budget-calibration-green-raw.txt`
- `2026-09-15-dream-filtered-input-budget-calibration-red-input.txt`
- `2026-09-15-dream-filtered-input-budget-calibration-red-raw.txt`

These files live in this logbook directory. This validates the backend's
ability to distinguish those two cases, not the correctness of the WP.

### Round zero

Fresh conformance executors each received only the spec and its template.
The first identified missing inlined result shapes and a literal output example
(`2026-09-15-dream-filtered-input-budget-template-r0-raw.txt`, commit
`618df176`). The architect filled that authoring gap and compared the complete
example byte-for-byte with actual collector output in isolated temporary
storage, also checking accounting, private permissions and cleanup.

The second confirmed the schema/example and section coverage, and asked for
the template's explicit second-run idempotency wording
(`2026-09-15-dream-filtered-input-budget-template-r0b-raw.txt`, commit
`8813efec`). Classification: first B/LIGHT, second C/LIGHT; authoring fixes,
not product-contract changes or accepted residuals. These are separate template
obligations, not two rounds on the same product contract family.

The internal pass re-ran the committed reproduction and current-state source
sentinels, then the 77 targeted tests: exit 0, all passed, none skipped. The
source and tests remain byte-identical to the inspected base. The prior full
suite's executable-pin failure remains the documented baseline; it was not
silently waived or repaired. The current draft and logbook pass targeted
Markdown lint; the proposed deliverables pass the boundary checker and
`git diff --check` is clean.

AC1–AC4 and AC7's new regression requirements remain future implementation
assertions, not false claims that the old collector passes them. AC5 requires
owner approval and the later ADR amendment. AC6's runnable repeatability
obligation is checked by the architect alongside the literal output example.
No new executable verification gate is introduced by these authoring changes.

### External round 1 scope

Review the draft contract, not an implementation diff. Challenge whether
filtered-size allocation can preserve the stated raw read budget, one-session
memory bound, scratch exposure/cleanup, accurate result membership, truncation
floor, and ledger behavior within the listed deliverables. The proposed ADR
amendment and its approval ordering are in scope. Deferred historical recovery,
partial-session checkpoints, token sizing, report changes, and unrelated
existing defects are not implementation requirements of this WP; disagreement
with those boundaries belongs in scope objections, not an invented requirement.

The fresh native Codex reviewer receives the exact target spec, relevant
current-code/ADR/test source paths and the pinned vendored prompt. It may read
and run isolated verification, and must distinguish its own execution from
the orchestrator's earlier evidence. The review checkout must have byte-identical
`git status --porcelain` before and after; no repository edits are made while
it runs. Its output goes outside the checkout and its final chat message names
only that file, so raw output can be committed before inspection. The
previously recorded stop criterion remains in force.

### Native calibration and round 1 result

The native backend also passed its own two-direction calibration using the same
complete synthetic contracts as the bridge cases. Raw results were committed
at `c4b960b4` before inspection:
`2026-09-15-dream-filtered-input-budget-native-calibration-green-raw.txt`
returned `approve`; the corresponding `native-calibration-red-raw.txt` returned
`needs-attention` and identified the deliberate raw-byte charge. These were
fresh native agents; bridge validation was not substituted for native evidence.

| Round | Reviewed tip | Verdict | Findings / scope objections | Raw evidence and introduction commit |
|---|---|---|---|---|
| Native Codex adversarial design 1 | `c4b960b4bc505e07e3e9a01f7d5a9dc10e9dca4a` | `approve` | 0 / 0 | `2026-09-15-dream-filtered-input-budget-design-r1-raw.txt` at `217dfbc2` |

The native reviewer took no part in drafting or calibration. It independently
ran the 77 targeted tests (all passed, none skipped), checked `git diff --check`,
and confirmed empty, byte-identical working-tree status and the same HEAD at
both ends. Its raw test output is retained as
`2026-09-15-dream-filtered-input-budget-design-r1-tests.txt` in this directory.
It did not run lint or the full suite and explicitly identified those earlier
results as the orchestrator's evidence, not its own.

The raw report was copied and committed before the relay inspected it. The
relay then verified the verdict fields, unchanged-tree evidence and the key
claims against the source: complete-filtered-demand allocation is required in
Table A, raw limits remain independently owned by the streaming reader, and
the unchanged brain/CLI consume the selected scratch directory and the existing
ledger result shapes. No finding needs a fix, residual or drop disposition.

The reviewed spec is byte-identical after review:
SHA-256 `43ca2b40902d9878bdacd8d09d12ac20bd465cb6def47aba25340d913a6f2453`.
Only evidence records are added after the reviewed tip. The design-review loop
is closed under the pinned criterion. Owner sign-off on the reviewed spec and
its proposed ADR amendment remains the next step before `Ready` and dispatch;
the authorization to run this review is not recorded as that later sign-off.
The existing full-suite executable-pin failure remains unwaived.

## Subsequent owner decisions: revised draft

After the round 1 review above, the owner accepted a different selection policy:
newest-first whole filtered extracts, stopping at X or at the first session
that fits X but exceeds the remaining space. That omitted session remains
unprocessed for a later run. A session whose extract exceeds X itself is
reported and skipped, allowing older candidates to proceed. No budget-induced
truncation or partial-session continuation is introduced.

The owner also accepted a soft preprocessing admission deadline: finish the
current session, including redaction, but start no new one after expiry.
The [current design package](2026-09-15-dream-preprocessing-design-package.md)
and revised WP now carry these rules and consistent examples/acceptance
criteria. Equal-share allocation and corpus-wide staging are superseded.
Oversized retry triggers, timing defaults/interfaces and the final permission
boundary remain open; no product implementation was performed.

The round 1 verdict and spec hash above are historical evidence, not approval
of this revised draft. Finalize the remaining contracts, obtain a fresh design
review and owner sign-off, then move to Ready. The baseline full-suite failure
remains unwaived. For this docs revision, targeted Markdown lint, the boundary
check and `git diff --check` passed; product tests were not rerun.

## Architect revision and new design gate

The owner authorized a `wd-architect` refinement followed by a fresh independent
review. The architect runs as a native Codex subagent with the repo role
instructions; it owns spec/design-package edits. The orchestrator checks
consumer compatibility and records evidence. No product changes or Ready
transition are authorized by this drafting step.

The renewed loop uses the existing stop criterion: material A/B product
findings block readiness and receive proposed owner dispositions. Accepted
HEAVY fixes require a fresh review; LIGHT findings are mechanically verified
without growing the loop. C findings are fixed or dispositioned. Repeated
contract-family findings trigger the existing extraction/circuit-breaker rule.
An approval closes the review loop, not owner sign-off on proposed defaults
or ADR changes. No residual is accepted on the owner's behalf.

Before the adversarial round, a fresh executor receives only the final draft
and template for conformance. The orchestrator performs internal coherence and
runnable baseline verification. During each gate the checkout remains unchanged;
raw reviewer output is written outside it and committed before inspection.
Record the reviewed SHA and raw-introduction SHA with each result. Historical
native backend calibration remains applicable; no reviewer is reused as author.

### Revision baseline verification

Before reviewing the revised documents, the orchestrator reran `npm test`
against unchanged product/test files from `77dd800b`: exit 1, 2,699 tests,
2,686 passed, one failed, 12 skipped. The failure is the same
`tests/integration/adopt-e2e.test.js:73` Claude executable-pin mismatch recorded
above; no identity setting was changed and no installed-app sync was run.
The process completed, including the repository's temporary-root wrapper.
This establishes the baseline only; it does not exercise the proposed behavior.

### Architect handoff and internal coherence

The architect produced a complete proposed contract in the WP and summarized
it in the design package. P1–P4 remain explicit owner decisions: the configurable
60-second policy default, per-session finite read-work budget, optional
oversized measurement metadata, and classified CLI/zero-input behavior plus ADR
amendments. No runtime code changed.

The orchestrator read the proposed contract end to end and checked its config,
ledger, stream and CLI consumers. Before handoff, the architect corrected two
section-reference typos, a moved-summary reference and millisecond-conversion
validation in the new proposed configuration. The final internal pass found no
remaining contradiction; this is not the independent verdict. The three literal
JSON/JSONL examples parse; the memo example describes the proposed schema, not
an assertion that the current ledger already preserves it.

| Runnable verification on unchanged product/test base | Result |
|---|---|
| WP's expanded targeted `npm test -- ...` command (collector, ledger, pipeline, stream, parser) | Exit 0; 173 passed, none failed/skipped. |
| `npm test` | Exit 1; baseline executable-pin failure above. |
| `npm run lint` | Exit 0; 662 Markdown files, 273 specs, four agents; PowerShell analyzer skipped because `pwsh` is unavailable. |
| WP's literal Deliverables boundary-check command | Exit 0. |
| `git diff --check` | Exit 0. |

The new behavior acceptance criteria and old-red/new-green regression evidence
are implementation obligations, not runnable assertions already satisfied by
this docs-only change. No new gate or fixture machinery was introduced.

### Revised template gate

The fresh conformance executor read only the WP and template at
`70f9af86df41b61d0ae3de4594d6cb71a747be47`; checkout status was empty and HEAD
unchanged before/after. Raw output was committed before inspection as
`2026-09-15-dream-filtered-input-budget-template-r2-raw.txt` at `548ab513`.
All template sections, exact contracts, examples and idempotency coverage were
present. TC-1 identified one C/LIGHT conformance correction: register the
Security checklist mirror and state the template's same-commit update rule.
The architect applies this within the existing documentation surface, followed
by mechanical verification; it changes no proposed product behavior or owner
choice and introduces no residual or new review machinery.

### Independent design round 2

TC-1 was mechanically verified against the architect's exact diff and corrected
at `21363f5a`. That clean tip was frozen for the independent native review.

| Round | Reviewed tip | Verdict | Findings / scope objections | Raw evidence and introduction commit |
|---|---|---|---|---|
| Native Codex adversarial design 2 | `21363f5adb5d8ee9d8f62ea801f4f7cc12c184f2` | `needs-attention` | 1 B/HEAVY / 0 | `2026-09-15-dream-filtered-input-budget-design-r2-raw.txt` at `637925aa` |

The same commit preserves the full review input. The raw report was committed
before inspection. Review checkout status was empty and HEAD identical at both
ends. The reviewer executed a two-process helper reproduction plus existing
lock tests, not the unimplemented proposed collector. Its first harness run
failed by calling a nonexistent export; the corrected run passed 12/12,
asserting that the unsafe behavior exists. Source and both logs are preserved
at `888623e9` as the `lock-repro-source`, `lock-repro-first` and
`lock-repro-rerun` text artifacts for this WP.

**R2-1 — proposed disposition: fix; owner decision pending.** The independent
preprocessing allowance and permitted overrun outlive the model-only lock
lease. `src/cli/dream.js` passes only `cfg.timeoutMs` to `acquireLock` before
collection; `src/core/dream/lock.js` permits stealing an expired lock without
checking its live owner; the second collector resets shared scratch. ADR-0012
part 6 assumes expiry implies the prior brain is dead. A longer legitimate
preprocessing run invalidates that assumption before its brain even starts.

The orchestrator verified these source/ADR citations and independently reran
`npm test -- /tmp/wd-dream-design-r2.zy7J7H/lock-lifetime-review.test.js tests/unit/dream-lock.test.js`:
exit 0, 12/12 passed, including the unsafe-behavior assertion. Output is retained
as `2026-09-15-dream-filtered-input-budget-lock-repro-relay.txt`. Simulated elapsed
time was 1,200,001 ms with a permitted 3,600,000 ms preprocessing allowance and
1,200,000 ms model timeout; the other process acquired/stole the lock while its
owner lived and removed the scratch sentinel. This confirms the integration
risk, not an implementation of or test of the future collector.

The architect is asked for a narrow lock-lifetime recommendation. No lock
contract change is silently incorporated. The new design gate remains open:
owner disposition, architect revision and a fresh HEAVY-change review are
required before Ready; P1–P4 also remain proposed. The existing full-suite
baseline failure remains unwaived.

### Architect response to R2-1 — owner decision pending

The architect recommends separating lock-lifetime/recovery work into a small
prerequisite WP, because it introduces its own recovery policy and the content
WP already spans collector/config/ledger/CLI. No new WP or dependency has been
created; this is a proposal, not approved scope. Adding nominal preprocessing
and model durations cannot cover the permitted soft-deadline overrun.

Proposed liveness contract: deadline expiry alone does not authorize takeover
from a live local owner. On the same host with a valid positive PID, a successful
`process.kill(pid, 0)` or `EPERM` means live; `ESRCH` means gone. A different host,
invalid lock/PID or other probe failure is unknown and cannot authorize automatic
takeover. PID reuse can therefore require manual recovery. A hung but still-live
owner must be stopped before the next dream can proceed; the normal brain
watchdog remains responsible for its own phase.

Two recovery choices remain for the owner:

1. Disable automatic stale-lock takeover and use explicit recovery after a dead
   or unknown owner. Ordinary atomic `wx` acquisition remains. This costs manual
   intervention after crashes but avoids adding automatic reclaim machinery.
2. Apply only the liveness correction, retaining automatic takeover for expired
   locks whose local owner is proven gone. This addresses the reproduced R2-1
   path; it retains the existing simultaneous-stale-claimant race as a named
   residual requiring an owner decision.

The second race is an inference from the existing `read → overwrite` takeover:
two contenders can both observe the prior dead owner and overwrite each other's
replacement. The architect did not reproduce that separate case; neither this
note nor the review's 12/12 run claims to have done so. Do not promise general
mutual exclusion from a PID check alone.

The relay recommends option 2 for the narrow change, with the inherited race
explicitly presented to the owner rather than silently accepted. If the owner
requires closing that race too, refine a separate lock contract before choosing
its mechanism. No heartbeat, new lock framework or forced termination policy is
approved here. Expected lock-WP owners: `src/core/dream/lock.js`, CLI wiring,
`tests/unit/dream-lock.test.js`, relevant pipeline tests and ADR-0012 part 6.
P1–P4 of the content WP remain proposed independently of this new decision.

### Owner disposition and prerequisite authoring

The owner accepted the relay's concrete proposal with “mehet”: implement the
narrow liveness correction as a separate prerequisite work package, retaining
automatic takeover of expired, proven-dead local owners. R2-1 disposition is
**fix (B/HEAVY)**. The existing simultaneous stale-claimant race is an explicitly
accepted residual of that narrow scope; it was presented before approval and
is not silently waived. The normal live-owner path must no longer be stolen
solely because the model-only deadline elapsed. A hung live owner requires
intervention; no automatic kill or heartbeat was approved.

The architect is authoring `WP-dream-live-owner-lock` and updating the content
WP's dependency, inherited lock contract and ADR boundary. This approval does
not accept P1–P4 of the content WP. Those remain separately proposed.

**Renewed review stop criterion:** fresh conformance and internal coherence
precede a joint independent design review of the lock prerequisite and revised
content dependency. Verify R2-1 is resolved by the specified prerequisite, then
attack new mechanisms. Do not count disagreement with the owner-accepted
simultaneous stale-claimant residual as a finding; route it as a scope objection.
Material A/B product findings block and receive proposed owner dispositions;
accepted HEAVY fixes require a fresh round. LIGHT conformance/machinery fixes
are mechanically checked; C items are fixed or dispositioned. The existing
repeat-kind/contract-family circuit breaker still applies. No new residual is
accepted by the relay.

### Lock prerequisite author handoff and internal pass

The architect created the compact lock prerequisite and inlined its inherited
contract in the content WP's A11, including the accepted residual and the
requirement that the prerequisite land first. The successor's ADR-0012 changes
remain capacity-only; they must preserve the prerequisite's part-6 amendment.
The source-consumer sweep found `tests/integration/dream.test.js` assumes both
expiry-only takeover and the old content floor, so each WP now explicitly owns
its relevant integration-test changes. No product or test source changed.

Internal coherence checked the complete new lock contract and the successor
changes. The architect qualified the context guarantee by L5/L7, made retained
lock repeatability explicit and kept A11 inside its canonical Markdown table.
These were authoring corrections before the independent round, not new policy.
The lock example's timestamp was verified and JSON examples in both specs parse.

The orchestrator ran the existing `npm test -- tests/unit/dream-lock.test.js tests/unit/dream-pipeline.test.js`
(exit 0, 62 passed) and `npm test -- tests/integration/dream.test.js` (exit 0,
47 passed). They establish unchanged-code baseline behavior, not implementation
of the new decision. The previously recorded full-suite executable-pin failure
remains unwaived; unchanged product tests were not fully rerun merely for this
documentation split. New behavior criteria and regression red/green evidence
remain implementation obligations. The architect's targeted Markdown lint,
both literal boundary checks and diff check passed.

### Lock template round zero

The fresh executor read exactly the new lock WP and template at
`190eec5e0d63b371c1909a66f5fac9a1b819bec2`. Major sections, exact contracts,
literal payload and second-run coverage passed. Raw output was committed before
inspection as `2026-09-15-dream-live-owner-lock-template-r0-raw.txt` at `5a962662`;
checkout status stayed empty and HEAD identical.

TC-01 is C/LIGHT: the mirror checklist omitted opening scope, Context and Out
of scope that repeat canonical facts. Because this repeats the preceding
content-template mirror-completeness kind, the next architect pass addresses
the ownership structure across both specs: enumerate their existing operative
sections and map their facts to the existing canonical tables, rather than
patch one omitted name at a time. No product choice, new gate, or new tool is
introduced. Mechanical closure will check the full registered surfaces against
the final author diff before the adversarial round.

The structural pass now registers each existing spec section from frontmatter
and scope notice through Definition of done, distinguishing canonical behavior,
historical evidence and repo-process metadata. The relay checked the complete
author diff and section lists; TC-01 is mechanically closed as C/LIGHT without
a new product contract or another external conformance round. The full lint
passed with 274 specs and four agents; PowerShell analysis remains unavailable
locally. No remaining internal coherence finding blocks the independent round.

### Joint design round 3 — closed

The joint prerequisite/successor review at
`350050cfb71a25f1fb6b25980f561688c96c9f82` returned **approve**, zero findings,
zero scope objections; R2-1 is resolved in design, implementation pending.
Raw report and input were committed at `cfb15861` before inspection as
`2026-09-15-dream-preprocessing-design-r3-raw.txt` and the matching input file.
The independent reviewer ran boundary/JSON/diff checks, no tests, and confirmed
identical clean checkout status and HEAD. The relay verified the cited contract
rows and dependency/ADR integration. The design loop is closed under its pinned
criterion; no residual beyond the already approved scope was accepted.

The architect marked the lock prerequisite Ready under the existing explicit
owner approval. The content WP stays Draft with P1–P4 pending and prerequisite
landing required. The separate [lock execution record](2026-09-15-dream-live-owner-lock.md)
carries approval, review and test-environment evidence for its isolated branch.
A byte-identical Node placed in a runtime-only test PATH made the six adopt-e2e
tests pass; this diagnoses the prior Node/Claude co-location conflict without
weakening identity checks. The original full-suite failure is historical, not
a waiver or evidence of a product change.

## Lock prerequisite implementation handoff

The approved prerequisite is implemented in
[PR #66](https://github.com/felho/wienerdog/pull/66), on the separate
`wp/dream-live-owner-lock` branch/worktree. This original content branch contains
no implementation of either WP. The lock spec copy here records its design-ready
state; the implementation branch has the authoritative In-Review copy and
[execution record](https://github.com/felho/wienerdog/blob/wp/dream-live-owner-lock/docs/specs/logbook/2026-09-15-dream-live-owner-lock.md).

Both PR gates reviewed `2b98bb17ca1c4270316bbc81ae5c3c4c0558c660` with
identical clean checkout state: wd-reviewer APPROVE, independent Codex
patch is correct, no findings. Both independently ran the full suite (2,722
passed, 12 skipped, zero failed). Raw reports were committed before inspection
at `644b9a2084b0b7034ca4d4e233d21cf643a9a40b` on that branch. GitHub CI
passed all seven checks on the implementation tip. Later commits contain only
evidence and handoff text; source, tests, ADR and spec remain identical.

The owner-approved live-owner protection and automatic expired-dead-local
recovery are implemented with the accepted stale-claimant race unchanged.
PR #66 remains unmerged; merge belongs to the maintainer. The successor stays
Draft: P1–P4 remain pending, and this prerequisite must land before its dispatch.

## Lessons

- WP-dream-filtered-input-budget: a single-run lock must cover the actual
  authorized work lifetime, including preprocessing and permitted overruns;
  the later model timeout alone does not establish that another run may safely
  replace shared scratch.

- WP-dream-filtered-input-budget: allocating model-input capacity from raw file
  sizes can discard retained content even when the complete filtered input fits;
  availability limits and content-allocation demands need distinct measures.
- WP-dream-filtered-input-budget: check architectural decisions before writing
  the fix contract; the faulty allocation order was explicitly prescribed by
  ADR-0023, not just an incidental implementation choice.
- WP-dream-filtered-input-budget: in native Codex sessions, use a fresh native
  Codex subagent for independent adversarial review; the owner clarified that
  `gptsol` names the historical Claude Code transport, not an exclusive reviewer
  requirement. Preserve the review and evidence contract across transports.

## Owner ratification and prerequisite landing

On 2026-09-15 the owner explicitly accepted every P1–P4 choice and continuation
with implementation after the proposed lock merge. This ratifies Table A's A10
amendments as well as the duration, per-session work policy, oversized memo and
CLI outcome choices. No semantic change was requested to the contract approved
by joint design R3 at `350050cfb71a25f1fb6b25980f561688c96c9f82`; its raw report
remains the committed `cfb15861` evidence.

[PR #66](https://github.com/felho/wienerdog/pull/66) merged into fork main at
`81e09414`. The content branch merged that main at
`cb4ab182f19b5894f0e6135444b37a672a4e0a22`, with a clean checkout before the
Ready metadata pass. The architect re-read current collector, parser, lock and
CLI behavior and compared the relevant source/test/ADR changes to the original
base. C1–C5 remain valid; A11 is now inherited from the landed prerequisite.
The original synthetic reproduction retains its original-base provenance.

The architect moved the content WP to Ready and updated every approval-status
mirror in the spec and design package. Only approval, landing and baseline
metadata changed; Table A's choices, interfaces, outcomes, limits, retry rules,
accepted lock residual and Deliverables boundary are unchanged. Actual product
implementation and acceptance evidence remain outstanding. The orchestrator
records the exact dispatch SHA and its executable re-verification separately.

The earlier full-suite failure is historical. As recorded in the
[lock execution logbook](2026-09-15-dream-live-owner-lock.md), a byte-identical
Node in a private runtime-only PATH removes the local Node/Claude co-location
conflict, and the unchanged baseline plus lock implementation and review suites
passed in that environment. This is not a waiver, identity-check change or
claim that the original command environment was repaired.

## Implementation dispatch after owner ratification

Dispatch revision: `122771e12f94e8ad01c098034b06480321f680b1`. The
orchestrator personally re-executed the current-state checks at that commit
immediately before delegation: C1–C5 code/contract claims, all twelve runtime,
test and ADR Deliverables equal to merged main, inherited A11 live/unknown/dead
lock behavior, and the original allocation defect. Six checks passed through
the repository npm test wrapper. Source/output are retained as
`2026-09-15-dream-filtered-input-budget-dispatch-{source,output}.txt`.

The synthetic case contains 290 messages whose complete filtered extracts
occupy 306,242 compact JSON bytes, below X=400,000. The old collector retained
199 messages. This is an executable defect demonstration, not owner-corpus
measurement or implemented-green evidence. A preliminary harness-only trial
used an unexported emptyLedger helper; the corrected harness uses readLedger
on fresh temporary state. The final committed-SHA execution above passed.

Two native implementers received disjoint files in this one WP: collector,
configuration, parser comments, collector tests and ADR amendments in one;
ledger and CLI plus their tests in the other. The orchestrator owns the logbook
and integrated verification. Neither changes the other's files. All tests use
the existing npm wrapper and the documented byte-identical runtime-only Node
PATH to avoid this machine's historical Node/Claude pinning collision.

**PR gate stop criterion:** both fresh gates review the same fixed commit with
identical clean status before/after. Commit their raw reports before reading.
Fix genuine implementation defects within Table A; changed product behavior
requires both gates on the new tip. A new policy or residual returns to the
owner. Two consecutive failed rounds follow the existing architect escalation
rule. Machinery-only corrections close mechanically under the repo runbook.

## Integrated implementation verification

The twelve Deliverables implement Table A; the parser/reader executable code
and constants are unchanged. Both authors completed disjoint edits before
integrated verification. The orchestrator reran the full literal targeted
command: 243/243 passed, exit 0. Full npm test: 2,754 total, 2,742 passed,
12 skipped, zero failed, exit 0. Full lint passed; local PowerShell analysis
was skipped because pwsh is unavailable. Actual output excerpts are retained
in `2026-09-15-dream-filtered-input-budget-verification.txt`. Boundary checks
cover the actual changed-file set and all twelve literal Deliverables;
whitespace checks pass. The spec moves to In-Review; PR gates remain pending.

The orchestrator also reran the FINAL collector regression test file in a
separate detached checkout at dispatch SHA `122771e1`, retaining old
collector/config code and supplying the new shared ledger memo helper. Its
38 tests produced 20 passes and 18 failures, exit 1. This replaces author-time
red evidence that also contained four subsequently corrected test assumptions.
The final failures include real filtered-content, whole-admission, deadline,
independent-read-budget and memo regressions. Output is retained in the
`regression-red` artifact. The independent ledger red (two failures against
the original ledger) is retained in `ledger-red`. Readable test logs normalize
trailing whitespace and name original byte hashes. These are test evidence,
not external review verdicts.

The dispatch incident fixture now retains all 290 messages instead of 199,
with the same 400,000-byte limit and 306,242-byte complete filtered demand.
The green reproduction is retained as `incident-green-source.txt`; its npm test
execution passed 1/1, exit 0. Neither run uses personal session data.

Implementation choices: share memo validation in the ledger module; omit empty
optional maps; compare maps independent of insertion order; combine memo and
quarantine writes when both change. Exact capacity fill takes precedence over
a subsequent elapsed deadline. The stop classifier uses ordinary loop pushes
so large candidate arrays do not become JavaScript argument lists. The relay
reproduced the discarded spread version's 200,000-item RangeError before the
author corrected it. No new contract or accepted residual was introduced.

- WP-dream-filtered-input-budget: test the actual private scratch writer path
  (`writeSync`) when measuring post-parse time or write failures; a
  `writeFileSync` mock does not observe it.
- WP-dream-filtered-input-budget: optional memo maps need semantic equality;
  key order and absent-versus-empty state must not cause durable write churn.

## PR review round 1 — closed

Implementation: [PR #67](https://github.com/felho/wienerdog/pull/67), branch
`wp/dream-filtered-input-budget`. Both fresh native gates reviewed
`216ce0d93b5fc1af22ea785a3beb25cf9d4d9b9b` against merge base
`81e09414726b81b5f79a98835a48872d1b6a0f6a`. Both recorded unchanged empty
status bytes and identical HEAD throughout their review, including reruns.

The four raw verdict/execution reports named
`2026-09-15-dream-filtered-input-budget-pr-{spec,independent}-r1-*` were committed
at `5ad34c657486147e8574bbc35e214e0198605d9c` BEFORE inspection.
The wd-reviewer verdict is **APPROVE**, no findings. The independent frozen JSON
verdict is **patch is correct**, findings empty. The relay read both execution
records and confirmed the common reviewed commit and canonical Table A fidelity.
There is no product finding requiring disposition or a further implementation
round. Verdict files remain verbatim. Readable execution copies normalize only
trailing whitespace; exact original bytes remain in the raw-evidence commit.

### Actual test evidence and limits

Both reviewers executed the full suite. Their initial concurrent executions
had intermittent failures in unchanged timing-sensitive fixtures: the independent
run failed one reap-escape precondition (2,741 pass, 1 fail, 12 skip); the spec
gate failed that precondition and gws-auth's 50 ms timeout case (2,740 pass,
2 fail, 12 skip). The independent reviewer reran reap-escape: 18/18 passed.
The spec reviewer reran both files: 26/26 passed. Once the other reviewer had
finished all tests, the spec reviewer ran the full literal suite once more:
2,754 total, 2,742 passed, 12 skipped, zero failed, exit 0. All runs used the
same code. These observations do not prove why the initial failures occurred,
and the independent report explicitly does not claim its full run was green.
No unrelated tests or timing limits were changed.

The orchestrator's earlier full run and the serialized spec-gate run both
passed. GitHub checks on the reviewed implementation tip also all passed:
Linux/macOS full tests and install smoke, lint including PowerShell checks,
boundary and PR title. The original failed outputs remain evidence rather than
being replaced by the passing retry. This is not a newly accepted product
residual or a waiver of a failing final spec verification.

### Handoff

Subsequent commits contain evidence and handoff text only; code, tests, both
ADRs and the WP remain byte-identical to the reviewed implementation commit.
P1–P4 are owner-ratified and implemented; the prerequisite PR #66 is merged.
PR #67 remains unmerged for maintainer review. The temporary old-code regression
checkout was removed after its evidence was committed. The implementation
branch contains the approval, design, dispatch, red/green tests and PR reviews.

Next step is maintainer review/merge of PR #67. Report extensions remain in
their own WP. No installed-app repair, sync, personal-vault change, or replay
of previously processed sessions is included in this work.
