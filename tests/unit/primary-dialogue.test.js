'use strict';

// WP-dream-primary-dialogue-projection — Tables A and B.
//
// EVERY FIXTURE HERE IS SYNTHETIC. The record shapes come from the spec's
// format-evidence table; no transcript content, path or session id from any
// real machine appears in this directory.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parse,
  parseWithOutcome,
  parsePrimaryWithOutcome,
  MAX_MSG_CHARS,
  MAX_MESSAGES,
  newRunBudget,
} = require('../../src/core/transcripts');
const { createPrimaryProjection } = require('../../src/core/transcripts/primary-dialogue');
const { Limits } = require('../../src/core/transcripts/stream');

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'primary-dialogue');

/** @param {string} tag @returns {string} a scratch directory for a generated fixture */
function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wd-pd-${tag}-`));
}

/** @param {string} dir @param {string} name @param {string[]} lines @returns {string} */
function writeLines(dir, name, lines) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
  return filePath;
}

/** @param {'claude'|'codex'} harness @param {string} filePath */
function entryFor(harness, filePath) {
  return { harness, path: filePath, size: fs.statSync(filePath).size };
}

/** @param {'claude'|'codex'} harness @param {string} filePath @param {{remaining:number}} [budget] */
function primary(harness, filePath, budget) {
  return parsePrimaryWithOutcome(entryFor(harness, filePath), budget || newRunBudget());
}

const textsOf = (extract) => extract.messages.map((m) => m.text);
const rolesOf = (extract) => extract.messages.map((m) => m.role);
const flagsOf = (extract) => extract.messages.map((m) => m.derived_from_untrusted);

/** Every committed .jsonl fixture in this directory, with its harness. */
const committedFixtures = fs
  .readdirSync(fixturesDir)
  .filter((n) => n.endsWith('.jsonl') && !n.includes('oversized'))
  .sort()
  .map((n) => ({ name: n, harness: n.startsWith('codex-') ? 'codex' : 'claude', path: path.join(fixturesDir, n) }));

/** The per-case fixture corpus for rows A5a/A5c/A5c-blocks/A5d. */
const taintCases = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'taint-cases.json'), 'utf8'));

// ── the literal worked example (Exact contracts) ─────────────────────────────

test('primary-dialogue: [WE] the worked example returns exactly the three documented values', () => {
  const fixture = path.join(fixturesDir, 'claude-demo.jsonl');
  const entry = entryFor('claude', fixture);
  const result = parsePrimaryWithOutcome(entry, newRunBudget());
  const raw = parseWithOutcome(entry, newRunBudget()).extract;

  // The spec's literal is written against `/samples/claude-demo.jsonl`; this
  // fixture lives wherever the checkout does, so the one path-shaped value is
  // substituted before the comparison. Nothing else is touched.
  const atSamples = (extract) => ({ ...extract, source_path: '/samples/claude-demo.jsonl' });

  assert.deepEqual(atSamples(result.extract), {
    harness: 'claude',
    session_id: 'demo',
    started: '2026-09-17T09:00:00.000Z',
    cwd: '/w',
    source_path: '/samples/claude-demo.jsonl',
    truncated: false,
    messages: [
      { role: 'user', text: 'Use the packing-list skill.', ts: '2026-09-17T09:00:00.000Z', derived_from_untrusted: false },
      { role: 'user', text: 'No, sort them alphabetically.', ts: '2026-09-17T09:00:09.000Z', derived_from_untrusted: false },
      { role: 'assistant', text: 'Sorted alphabetically.', ts: '2026-09-17T09:00:20.000Z', derived_from_untrusted: true },
    ],
  }, 'pd-worked :: extract');

  assert.deepEqual(result.gateExtract, {
    harness: 'claude',
    session_id: 'demo',
    messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'tool_result' }, { role: 'assistant' }],
    skill_invocations: [{ skill: 'packing-list', index: 2, resultIndex: 2, errored: false }],
  }, 'pd-worked :: gateExtract');

  // The documented byte counts, measured at the documented path.
  assert.equal(Buffer.byteLength(JSON.stringify(atSamples(raw))), 566, 'pd-worked :: intake byte count');
  assert.equal(Buffer.byteLength(JSON.stringify(atSamples(result.extract))), 511, 'pd-worked :: projected byte count');
  // And the number this entry point actually returns is the raw one.
  assert.equal(result.intakeBytes, Buffer.byteLength(JSON.stringify(raw)), 'pd-worked :: intakeBytes is the raw extract');
});

// ── AC1 — Claude acceptance (rows A2, A4) ────────────────────────────────────

test('primary-dialogue: [AC1] Claude acceptance: string content, array text, stop_reason and block types', () => {
  const { extract } = primary('claude', path.join(fixturesDir, 'claude-acceptance.jsonl'));
  assert.deepEqual(textsOf(extract), [
    'plain string request',
    'concluding reply one',
    'array correction',
    'concluding reply two',
  ], 'pd-ac1 :: texts');
  assert.deepEqual(rolesOf(extract), ['user', 'assistant', 'user', 'assistant'], 'pd-ac1 :: roles');
  assert.deepEqual(flagsOf(extract), [false, false, false, true], 'pd-ac1 :: flags');
});

test('primary-dialogue: [AC1] Claude acceptance: isMeta and isSidechain records contribute nothing', () => {
  const { extract } = primary('claude', path.join(fixturesDir, 'claude-acceptance.jsonl'));
  const joined = textsOf(extract).join('\n');
  assert.ok(!joined.includes('harness meta note'), 'pd-ac1-meta :: isMeta text is absent');
  assert.ok(!joined.includes('subagent copy'), 'pd-ac1-meta :: isSidechain text is absent');
  // The declined records are real records, not a typo: the raw parser kept one
  // of them (the sidechain one) and dropped the other.
  const raw = parseWithOutcome(entryFor('claude', path.join(fixturesDir, 'claude-acceptance.jsonl')), newRunBudget()).extract;
  assert.ok(raw.messages.some((m) => m.text === 'subagent copy of the instruction'), 'pd-ac1-meta :: the sidechain record exists in the raw extract');
});

// ── AC2 — Codex acceptance (row A3) ──────────────────────────────────────────

test('primary-dialogue: [AC2] Codex acceptance: role, content kind, phase and payload type', () => {
  const { extract } = primary('codex', path.join(fixturesDir, 'codex-acceptance.jsonl'));
  assert.deepEqual(textsOf(extract), ['the real request', 'the final answer'], 'pd-ac2 :: texts');
  assert.deepEqual(rolesOf(extract), ['user', 'assistant'], 'pd-ac2 :: roles');
  assert.deepEqual(flagsOf(extract), [false, true], 'pd-ac2 :: flags');
  assert.deepEqual(extract.messages.map((m) => m.ts), [null, null], 'pd-ac2 :: Codex messages keep ts null');
});

test('primary-dialogue: [AC2] Codex thread_source decides whether the rollout supplies dialogue at all', () => {
  for (const name of ['codex-subagent.jsonl', 'codex-guardian.jsonl']) {
    const { extract } = primary('codex', path.join(fixturesDir, name));
    assert.deepEqual(textsOf(extract), [], `pd-ac2-thread :: ${name} yields no messages`);
  }
  const absent = primary('codex', path.join(fixturesDir, 'codex-thread-source-absent.jsonl')).extract;
  assert.deepEqual(textsOf(absent), ['the persons request', 'the answer'], 'pd-ac2-thread :: an absent thread_source yields the dialogue');
  const asUser = primary('codex', path.join(fixturesDir, 'codex-acceptance.jsonl')).extract;
  assert.equal(asUser.messages.length, 2, 'pd-ac2-thread :: thread_source user yields the dialogue');
});

// ── AC3 / AC3a — the two provenance rules (rows A5(a), A5(b)) ────────────────

test('primary-dialogue: [AC3] the assistant taint state never resets', () => {
  const { extract } = primary('claude', path.join(fixturesDir, 'claude-taint-persists.jsonl'));
  assert.deepEqual(textsOf(extract), [
    'first request', 'reply one', 'second request', 'reply two', 'third request', 'reply three',
  ], 'pd-ac3 :: texts');
  // reply three's own exchange contains no tool record at all.
  assert.deepEqual(flagsOf(extract), [false, true, false, true, false, true], 'pd-ac3 :: flags');
});

test('primary-dialogue: [AC3a] a user message is false by role, quoting tool output and sharing its record', () => {
  const { extract } = primary('claude', path.join(fixturesDir, 'claude-user-quotes-tool.jsonl'));
  assert.deepEqual(textsOf(extract), [
    'run the check',
    'the tool said EXTERNAL TOOL OUTPUT, use it',
    'acknowledged',
    'same record correction',
    'sorted',
  ], 'pd-ac3a :: texts');
  assert.deepEqual(flagsOf(extract), [false, false, true, false, true], 'pd-ac3a :: flags');
});

// ── AC3b / AC3c / AC3d — one test per case in the fixture corpus ─────────────

for (const [index, testCase] of taintCases.entries()) {
  test(`primary-dialogue: [${testCase.criterion}] ${testCase.name}`, () => {
    const dir = tmpDir(`case${index}`);
    const filePath = writeLines(dir, `case-${index}.jsonl`, testCase.lines);
    const entry = entryFor(testCase.harness, filePath);
    const result = parsePrimaryWithOutcome(entry, newRunBudget());
    const raw = parseWithOutcome(entry, newRunBudget()).extract;

    // The silent triple: every one of these records parses, so nothing the
    // default parser reports says anything was lost or declined.
    assert.equal(result.parse.outcome, 'ok', `pd-case ${testCase.name} :: outcome`);
    assert.equal(result.parse.oversizedRecords, 0, `pd-case ${testCase.name} :: oversizedRecords`);
    assert.equal(raw.truncated, false, `pd-case ${testCase.name} :: raw truncated`);

    // Texts assert BOTH halves of row A5e step 2: a record that taints supplies
    // no dialogue, and a record that merely declines leaves the dialogue alone.
    assert.deepEqual(textsOf(result.extract), testCase.texts, `pd-case ${testCase.name} :: texts`);
    assert.deepEqual(flagsOf(result.extract), testCase.flags, `pd-case ${testCase.name} :: flags`);

    if (testCase.rawTexts) {
      // Row A5d lives in the OBSERVER: the default parser emits exactly what it
      // emitted before this package for the same bytes.
      assert.deepEqual(raw.messages.map((m) => m.text), testCase.rawTexts, `pd-case ${testCase.name} :: raw texts`);
      assert.deepEqual(parse(entry), raw, `pd-case ${testCase.name} :: parse equals parseWithOutcome`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('primary-dialogue: [AC3b] G1 an over-long line the reader replaces with the marker taints', () => {
  const template = fs.readFileSync(path.join(fixturesDir, 'claude-oversized-line.jsonl'), 'utf8');
  const dir = tmpDir('g1');
  const filePath = path.join(dir, 'oversize.jsonl');
  fs.writeFileSync(filePath, template.replace('@@PAD@@', 'x'.repeat(Limits.MAX_LINE_BYTES)));

  const result = primary('claude', filePath);
  assert.equal(result.parse.oversizedRecords, 1, 'pd-g1 :: the reader reports the oversized record');
  assert.deepEqual(textsOf(result.extract), ['before the loss', 'after the loss'], 'pd-g1 :: texts');
  assert.deepEqual(flagsOf(result.extract), [false, true], 'pd-g1 :: flags');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('primary-dialogue: [AC3b] G4 a budget exhausted mid-file is a loss the projection records', () => {
  const dir = tmpDir('g4');
  const lines = [];
  for (let i = 0; i < 40; i += 1) {
    lines.push(JSON.stringify({ type: 'user', timestamp: '2026-09-17T09:00:00.000Z', message: { role: 'user', content: `request ${i}` } }));
  }
  const filePath = writeLines(dir, 'g4.jsonl', lines);
  const size = fs.statSync(filePath).size;
  const budget = { remaining: Math.floor(size / 2) };
  const result = parsePrimaryWithOutcome({ harness: 'claude', path: filePath, size }, budget);

  assert.equal(result.parse.runExhausted, true, 'pd-g4 :: the read was cut short');
  assert.equal(result.extract.truncated, true, 'pd-g4 :: the cut is reported as truncation');
  assert.ok(result.extract.messages.length < 40, 'pd-g4 :: the tail of the file is gone');

  // Budget exhaustion is TERMINAL for the file (stream.js:129-138 returns as
  // soon as it fires), so no message can follow it in an end-to-end fixture.
  // The rule itself is asserted directly, which is also how the preserved
  // reference model exercises G4.
  const projection = createPrimaryProjection('claude');
  projection.lost();
  projection.record({ type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'after the cut' }] } });
  assert.equal(projection.tainted(), true, 'pd-g4 :: the loss sets the state');
  assert.deepEqual(projection.messages.map((m) => m.derived_from_untrusted), [true], 'pd-g4 :: a later assistant reply carries true');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── AC4 — return-value invariants (Table B) ──────────────────────────────────

test('primary-dialogue: [AC4] return-value invariants hold for every fixture', () => {
  const dir = tmpDir('ac4');
  const subjects = committedFixtures.map((f) => ({ label: f.name, harness: f.harness, path: f.path }));
  for (const [index, testCase] of taintCases.entries()) {
    subjects.push({
      label: `case-${index}`,
      harness: testCase.harness,
      path: writeLines(dir, `case-${index}.jsonl`, testCase.lines),
    });
  }

  for (const subject of subjects) {
    const entry = entryFor(subject.harness, subject.path);
    const result = parsePrimaryWithOutcome(entry, newRunBudget());
    const raw = parseWithOutcome(entry, newRunBudget()).extract;

    assert.equal(
      result.intakeBytes,
      Buffer.byteLength(JSON.stringify(raw)),
      `pd-ac4 ${subject.label} :: intakeBytes is the raw capped extract`,
    );
    assert.equal(result.gateExtract.messages.length, raw.messages.length, `pd-ac4 ${subject.label} :: gate timeline length`);
    assert.deepEqual(
      result.gateExtract.messages.map((m) => m.role),
      raw.messages.map((m) => m.role),
      `pd-ac4 ${subject.label} :: gate roles match positionally`,
    );
    assert.deepEqual(
      result.gateExtract.messages.map((m) => Object.keys(m)),
      raw.messages.map(() => ['role']),
      `pd-ac4 ${subject.label} :: a gate message carries role and nothing else`,
    );
    assert.deepEqual(result.gateExtract.skill_invocations, raw.skill_invocations, `pd-ac4 ${subject.label} :: skill_invocations verbatim`);
    assert.equal(
      'skill_invocations' in result.gateExtract,
      'skill_invocations' in raw,
      `pd-ac4 ${subject.label} :: skill_invocations present on the same harnesses as today`,
    );
    assert.ok(!JSON.stringify(result.gateExtract).includes('"text"'), `pd-ac4 ${subject.label} :: no text key anywhere in the gate value`);
    assert.ok(!('skill_invocations' in result.extract), `pd-ac4 ${subject.label} :: the extract carries no invocation metadata`);
    assert.deepEqual(
      Object.keys(result.extract),
      ['harness', 'session_id', 'started', 'cwd', 'source_path', 'truncated', 'messages'],
      `pd-ac4 ${subject.label} :: extract shape`,
    );
    for (const key of ['harness', 'session_id', 'started', 'cwd', 'source_path']) {
      assert.deepEqual(result.extract[key], raw[key], `pd-ac4 ${subject.label} :: ${key} copied unchanged`);
    }
    assert.deepEqual(Object.keys(result).sort(), ['extract', 'gateExtract', 'intakeBytes', 'parse'], `pd-ac4 ${subject.label} :: returned keys`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── AC4a — caps, redaction and the single bounded read (rows A6, B1) ─────────

test('primary-dialogue: [AC4a] the message cap, the redact-before-cap order and the message-count cap', () => {
  const dir = tmpDir('caps');

  // 1. the per-message character cap, with the existing suffix.
  const long = 'a'.repeat(MAX_MSG_CHARS + 1000);
  const longPath = writeLines(dir, 'long.jsonl', [
    JSON.stringify({ type: 'user', timestamp: '2026-09-17T09:00:00.000Z', message: { role: 'user', content: long } }),
  ]);
  const longResult = primary('claude', longPath);
  assert.equal(longResult.extract.messages[0].text, `${'a'.repeat(MAX_MSG_CHARS)}\n…[truncated 1000 chars]`, 'pd-caps :: the existing cap text');
  assert.equal(longResult.extract.truncated, true, 'pd-caps :: the cap sets truncated');

  // 2. redaction runs BEFORE the cap. The secret straddles character 4,000:
  // capping first would cut it into a prefix no pattern matches and leak it.
  const secret = `sk-ant-${'b'.repeat(24)}`;
  const straddling = `${'a'.repeat(MAX_MSG_CHARS - 10)}${secret}${'c'.repeat(2000)}`;
  assert.ok(straddling.indexOf(secret) < MAX_MSG_CHARS && straddling.indexOf(secret) + secret.length > MAX_MSG_CHARS, 'pd-caps :: the secret really straddles the cap');
  const secretPath = writeLines(dir, 'secret.jsonl', [
    JSON.stringify({ type: 'user', timestamp: '2026-09-17T09:00:00.000Z', message: { role: 'user', content: straddling } }),
  ]);
  const secretText = primary('claude', secretPath).extract.messages[0].text;
  assert.ok(!secretText.includes('sk-ant-'), 'pd-caps :: the straddling secret never reaches a caller');
  assert.ok(secretText.includes('[REDACTED:'), 'pd-caps :: the redaction placeholder is there instead');

  // 3. the message-count cap retains the NEWEST MAX_MESSAGES.
  const manyLines = [];
  for (let i = 0; i < MAX_MESSAGES + 100; i += 1) {
    manyLines.push(JSON.stringify({ type: 'user', timestamp: '2026-09-17T09:00:00.000Z', message: { role: 'user', content: `request ${i}` } }));
  }
  const manyPath = writeLines(dir, 'many.jsonl', manyLines);
  const many = primary('claude', manyPath).extract;
  assert.equal(many.messages.length, MAX_MESSAGES, 'pd-caps :: the count cap retains exactly MAX_MESSAGES');
  assert.equal(many.messages[many.messages.length - 1].text, `request ${MAX_MESSAGES + 99}`, 'pd-caps :: the newest messages are the retained ones');
  assert.equal(many.truncated, true, 'pd-caps :: the count cap sets truncated');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('primary-dialogue: [AC4a] one bounded read: the same budget debit as parseWithOutcome, and streamLines exactly once', () => {
  const fixture = path.join(fixturesDir, 'claude-acceptance.jsonl');
  const entry = entryFor('claude', fixture);

  const plainBudget = newRunBudget();
  parseWithOutcome(entry, plainBudget);
  const plainDebit = newRunBudget().remaining - plainBudget.remaining;

  const primaryBudget = newRunBudget();
  parsePrimaryWithOutcome(entry, primaryBudget);
  const primaryDebit = newRunBudget().remaining - primaryBudget.remaining;
  assert.equal(primaryDebit, plainDebit, 'pd-read :: the budget debit equals one parseWithOutcome');

  // Debit equality alone is vacuous — a double-read implementation debits the
  // caller identically while opening the transcript twice — so the invocation
  // itself is counted, through a private copy of the module graph.
  const calls = [];
  const streamPath = require.resolve('../../src/core/transcripts/stream');
  const graph = [
    streamPath,
    require.resolve('../../src/core/transcripts/claude'),
    require.resolve('../../src/core/transcripts/codex'),
    require.resolve('../../src/core/transcripts/primary-dialogue'),
    require.resolve('../../src/core/transcripts'),
  ];
  for (const modulePath of graph) delete require.cache[modulePath];
  const stream = require(streamPath);
  const realStreamLines = stream.streamLines;
  stream.streamLines = (filePath, sizeBytes, budget, onLine) => {
    const before = budget.remaining;
    const streamed = realStreamLines(filePath, sizeBytes, budget, onLine);
    calls.push({ filePath, debited: before - budget.remaining });
    return streamed;
  };
  try {
    const spied = require(require.resolve('../../src/core/transcripts'));
    spied.parsePrimaryWithOutcome(entry, spied.newRunBudget());
  } finally {
    stream.streamLines = realStreamLines;
    for (const modulePath of graph) delete require.cache[modulePath];
  }
  assert.equal(calls.length, 1, 'pd-read :: streamLines is invoked exactly once');
  assert.equal(calls[0].filePath, entry.path, 'pd-read :: on the transcript itself');
  assert.equal(calls[0].debited, plainDebit, 'pd-read :: and that one read carries the whole debit');
});

// ── AC5 — the default parse is unchanged ─────────────────────────────────────

test('primary-dialogue: [AC5] the default parse is untouched by the new entry point', () => {
  for (const fixture of committedFixtures) {
    const entry = entryFor(fixture.harness, fixture.path);
    const before = parseWithOutcome(entry, newRunBudget());
    parsePrimaryWithOutcome(entry, newRunBudget());
    const after = parseWithOutcome(entry, newRunBudget());
    assert.deepEqual(after, before, `pd-ac5 ${fixture.name} :: parseWithOutcome is unchanged`);
    assert.deepEqual(parse(entry), before.extract, `pd-ac5 ${fixture.name} :: parse is unchanged`);
    assert.ok(
      !JSON.stringify(after.extract).includes('derived_from_untrusted'),
      `pd-ac5 ${fixture.name} :: the default extract carries no provenance flag`,
    );
  }
});
