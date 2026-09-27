'use strict';

// WP-dream-projection-notification-taint — Table N.
//
// EVERY FIXTURE HERE IS SYNTHETIC. No transcript content, path or session id
// from any real machine appears in this file or its fixture.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parsePrimaryWithOutcome, newRunBudget } = require('../../src/core/transcripts');
const { makeGates } = require('../../src/core/dream/validate');
const { defaultLayout } = require('../../src/core/layout');

const fixturePath = path.join(__dirname, '..', 'fixtures', 'primary-dialogue', 'claude-task-notification.jsonl');
const fixtureLines = fs.readFileSync(fixturePath, 'utf8').split('\n').filter((l) => l !== '');
const LABELLED = 2; // the fixture's labelled record, 0-based

/** The gate worked example's five records (spec, "the gate and the ledger"). */
const gateLines = [
  '{"type":"user","sessionId":"nt-gate","cwd":"/w","timestamp":"2026-09-27T10:00:00.000Z","promptSource":"typed","origin":{"kind":"human"},"message":{"role":"user","content":"Run the packing-list skill."}}',
  '{"type":"assistant","timestamp":"2026-09-27T10:00:05.000Z","message":{"role":"assistant","stop_reason":"tool_use","content":[{"type":"text","text":"Running it."},{"type":"tool_use","id":"tu1","name":"Skill","input":{"skill":"packing-list"}}]}}',
  '{"type":"user","timestamp":"2026-09-27T10:00:09.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","is_error":false,"content":"ok"}]}}',
  '{"type":"user","timestamp":"2026-09-27T10:01:00.000Z","promptSource":"system","origin":{"kind":"task-notification"},"message":{"role":"user","content":"<task-notification>SYNTHETIC SUBAGENT RESULT</task-notification>"}}',
  '{"type":"assistant","timestamp":"2026-09-27T10:01:05.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"Done."}]}}',
];
const GATE_LABELLED = 3;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-nt-'));
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));

/**
 * Project `lines` through parsePrimaryWithOutcome. Every call writes the SAME
 * scratch path, so `source_path` is identical across compared projections.
 * @param {'claude'|'codex'} harness @param {string[]} lines
 */
function project(harness, lines) {
  const filePath = path.join(scratch, `${harness}.jsonl`);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
  return parsePrimaryWithOutcome({ harness, path: filePath, size: fs.statSync(filePath).size }, newRunBudget());
}

/** @param {string[]} lines @returns {string[]} the same lines with top-level `origin` removed */
function stripOrigin(lines) {
  return lines.map((line) => {
    const obj = JSON.parse(line);
    delete obj.origin;
    return JSON.stringify(obj);
  });
}

/** @param {string[]} lines @param {number} i @param {(obj:Object)=>void} edit */
function editLine(lines, i, edit) {
  const out = lines.slice();
  const obj = JSON.parse(out[i]);
  edit(obj);
  out[i] = JSON.stringify(obj);
  return out;
}

const textsOf = (extract) => extract.messages.map((m) => m.text);
const flagsOf = (extract) => extract.messages.map((m) => m.derived_from_untrusted);

// ── AC1 — the class is flagged and taints (rows N1-N3) ──────────────────────

test('primary-dialogue: [NT-AC1] a record Claude Code labels as a task notification is flagged, and taints what follows', () => {
  const result = project('claude', fixtureLines);
  assert.deepEqual(
    textsOf(result.extract),
    [
      'Start the background check.',
      'Started it in the background.',
      '<task-notification>The background check finished: SYNTHETIC SUBAGENT RESULT</task-notification>',
      'The check finished.',
      'Thanks. Summarize it.',
      'Summary.',
    ],
    'nt-ac1 :: texts',
  );
  assert.deepEqual(flagsOf(result.extract), [false, false, true, true, false, true], 'nt-ac1 :: flags');

  // Content-free: the same record with array-valued content is flagged the same.
  const arrayLines = editLine(fixtureLines, LABELLED, (obj) => {
    obj.message.content = [{ type: 'text', text: 'SYNTHETIC SUBAGENT RESULT' }];
  });
  assert.deepEqual(flagsOf(project('claude', arrayLines).extract), [false, false, true, true, false, true], 'nt-ac1 :: array flags');
});

// ── AC2 — fail-open in the projection (row N4) ──────────────────────────────

test('primary-dialogue: [NT-AC2] an absent, malformed or renamed label projects exactly as the Done contract does', () => {
  const unlabelled = project('claude', stripOrigin(fixtureLines));
  assert.deepEqual(flagsOf(unlabelled.extract), [false, false, false, false, false, false], 'nt-ac2 no label :: the Done contract flags');

  /** @type {Array<[string, (obj:Object)=>void]>} */
  const variants = [
    ['origin absent', (obj) => { delete obj.origin; }],
    ['origin null', (obj) => { obj.origin = null; }],
    ['origin string', (obj) => { obj.origin = 'task-notification'; }],
    ['origin array', (obj) => { obj.origin = [{ kind: 'task-notification' }]; }],
    ['origin empty object', (obj) => { obj.origin = {}; }],
    ['kind Task-Notification', (obj) => { obj.origin = { kind: 'Task-Notification' }; }],
    ['kind task_notification', (obj) => { obj.origin = { kind: 'task_notification' }; }],
    ['kind human', (obj) => { obj.origin = { kind: 'human' }; }],
    ['labelled but isMeta', (obj) => { obj.isMeta = true; }],
    ['labelled but isSidechain', (obj) => { obj.isSidechain = true; }],
    ['labelled but role assistant', (obj) => { obj.message.role = 'assistant'; }],
  ];
  for (const [label, edit] of variants) {
    const lines = editLine(fixtureLines, LABELLED, edit);
    const got = project('claude', lines).extract;
    const want = project('claude', stripOrigin(lines)).extract;
    assert.deepEqual({ ...got, source_path: null }, { ...want, source_path: null }, `nt-ac2 ${label} :: equals the unlabelled projection`);
  }

  // Claude only: a Codex rollout never carries the label (the `!codex` guard).
  const codexLines = [
    '{"type":"session_meta","payload":{"id":"nt-cx","timestamp":"2026-09-27T09:00:00.000Z","cwd":"/w","thread_source":"user"}}',
    '{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"the request"}],"internal_chat_message_metadata_passthrough":{"content_item_kinds":["user.text"]}}}',
    '{"type":"user","origin":{"kind":"task-notification"},"message":{"role":"user","content":"<task-notification>SYNTHETIC</task-notification>"}}',
    '{"type":"response_item","payload":{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"the answer"}]}}',
  ];
  let codex;
  assert.doesNotThrow(() => { codex = project('codex', codexLines); }, 'nt-ac2 codex :: projects without throwing');
  assert.deepEqual(flagsOf(codex.extract), [false, false], 'nt-ac2 codex :: flags');
});

// ── AC3 — raise-only (row N5) ───────────────────────────────────────────────

test('primary-dialogue: [NT-AC3] the rule only raises flags and adds one gate key', () => {
  const labelled = project('claude', fixtureLines);
  const unlabelled = project('claude', stripOrigin(fixtureLines));
  const shape = (extract) => extract.messages.map((m) => [m.role, m.text, m.ts]);
  assert.deepEqual(shape(labelled.extract), shape(unlabelled.extract), 'nt-ac3 :: roles, texts and timestamps');
  const meta = (extract) => ({ ...extract, messages: null });
  assert.deepEqual(meta(labelled.extract), meta(unlabelled.extract), 'nt-ac3 :: extract metadata');
  assert.deepEqual(labelled.parse, unlabelled.parse, 'nt-ac3 :: parse');
  assert.equal(labelled.intakeBytes, unlabelled.intakeBytes, 'nt-ac3 :: intakeBytes');
  const { task_notification: _key, ...labelledGate } = labelled.gateExtract;
  assert.deepEqual(labelledGate, unlabelled.gateExtract, 'nt-ac3 :: gate extract, apart from row N6');
  const lowered = flagsOf(labelled.extract).some((flag, i) => flag === false && flagsOf(unlabelled.extract)[i] === true);
  assert.equal(lowered, false, 'nt-ac3 :: no flag lowered');
});

// ── AC4 — the gate key (row N6) ─────────────────────────────────────────────

test('primary-dialogue: [NT-AC4] the gate extract says the session held a labelled task notification', () => {
  assert.deepEqual(
    project('claude', gateLines).gateExtract,
    {
      harness: 'claude',
      session_id: 'nt-gate',
      messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'tool_result' }, { role: 'user' }, { role: 'assistant' }],
      skill_invocations: [{ skill: 'packing-list', index: 2, resultIndex: 2, errored: false }],
      task_notification: true,
    },
    'nt-ac4 :: gate example',
  );
  assert.ok(!('task_notification' in project('claude', stripOrigin(gateLines)).gateExtract), 'nt-ac4 no label :: key absent');

  const schemaReject = editLine(gateLines, GATE_LABELLED, (obj) => { obj.message.content = 7; });
  assert.equal(project('claude', schemaReject).gateExtract.task_notification, true, 'nt-ac4 step-2 reject (schema) :: key still true');
  const blockReject = editLine(gateLines, GATE_LABELLED, (obj) => { obj.message.content = [{ type: 'mystery' }]; });
  assert.equal(project('claude', blockReject).gateExtract.task_notification, true, 'nt-ac4 step-2 reject (block type) :: key still true');
});

// ── AC5 — the ledger (row N7) ───────────────────────────────────────────────

/** @param {boolean} declared @returns {Buffer} one LEARNINGS.md entry */
function ledgerEntry(declared) {
  return Buffer.from([
    '## sort.order',
    '',
    '- Pattern-Key: `sort.order`',
    '- Status: open',
    '- Recurrence: 1',
    '- Session-IDs: claude:nt-gate',
    '- First-Seen: 2026-09-27',
    '- Last-Seen: 2026-09-27',
    `- derived_from_untrusted: ${declared}`,
    '- Observation: a recurring pattern.',
    '',
  ].join('\n'), 'utf8');
}

const pairedSkill = Buffer.from([
  '---',
  'id: packing-list',
  'type: skill',
  'created: 2026-08-01',
  'updated: 2026-08-01',
  'origin: dream',
  'confidence: 0.9',
  'recurrence: 3',
  'derived_from_untrusted: false',
  '---',
  'Pack the list in order.',
  '',
].join('\n'), 'utf8');

/** @param {Object} gateExtract @param {boolean} declared @returns {string|null} */
function ledger(gateExtract, declared) {
  return makeGates().ledger({
    rel: '05-Skills/packing-list/LEARNINGS.md',
    candidateBytes: ledgerEntry(declared),
    baselineLedgerBytes: null,
    pairedSkillBytes: pairedSkill,
    registry: { skills: { '05-Skills/packing-list/SKILL.md': { id: 'packing-list', created: '2026-08-01' } } },
    extractsBySession: new Map([['claude:nt-gate', gateExtract]]),
    layout: defaultLayout(),
  });
}

const REFUSED = /asserted lower than derived/;

test('primary-dialogue: [NT-AC5] a session holding a labelled task notification cannot confirm a skill learning as trusted', () => {
  const labelledGate = project('claude', gateLines).gateExtract;
  const unlabelledGate = project('claude', stripOrigin(gateLines)).gateExtract;

  assert.match(String(ledger(labelledGate, false)), REFUSED, 'nt-ac5 labelled false :: refused');
  assert.equal(ledger(labelledGate, true), null, 'nt-ac5 labelled true :: kept');
  assert.equal(ledger(unlabelledGate, false), null, 'nt-ac5 no label :: false kept');

  for (const [label, value] of [['undefined', undefined], ['false', false], ['"yes"', 'yes'], ['0', 0], ['null', null]]) {
    assert.match(
      String(ledger({ ...unlabelledGate, task_notification: value }, false)),
      REFUSED,
      `nt-ac5 malformed ${label} :: refused`,
    );
  }

  const inherited = Object.assign(Object.create({ task_notification: true }), unlabelledGate);
  assert.match(String(ledger(inherited, false)), REFUSED, 'nt-ac5 inherited :: refused');
});
