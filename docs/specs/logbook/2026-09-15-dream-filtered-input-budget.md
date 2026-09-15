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

## Lessons

- WP-dream-filtered-input-budget: allocating model-input capacity from raw file
  sizes can discard retained content even when the complete filtered input fits;
  availability limits and content-allocation demands need distinct measures.
- WP-dream-filtered-input-budget: check architectural decisions before writing
  the fix contract; the faulty allocation order was explicitly prescribed by
  ADR-0023, not just an incidental implementation choice.
