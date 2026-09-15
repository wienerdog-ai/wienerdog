---
date: 2026-09-15
related_wps: [WP-dream-filtered-input-budget]
---

# Dream input allocation: investigation and draft record

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
