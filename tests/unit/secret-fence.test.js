'use strict';

/**
 * The secret fence — WP-secret-fence-two-tier-detector.
 *
 * Every number asserted below is decided in Table C3 of that spec and is
 * transcribed here as a named constant; nothing is regenerated and nothing is
 * restated from anywhere else. The `today` column of the FN matrix is Table C3
 * row C3-7's transcribed baseline, observed through the fixture module's
 * shipped-detector reference rather than through a checked-in oracle corpus.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  scanAndRedact,
  redactOnly,
  hasHardFinding,
  SEVERITY,
} = require('../../src/core/secret-scan');
const {
  makeRng,
  SEED,
  CREDENTIALS,
  CONTEXTS,
  PROSE,
  caughtByShippedDetector,
} = require('../fixtures/secret-corpus');

const SOURCE_PATH = require.resolve('../../src/core/secret-scan');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

// --- Table C3, transcribed --------------------------------------------------

/** C3-0 — corpus sizes. */
const C3_0 = { fixtures: 39, proseRows: 44, contexts: 4, cells: 156 };

/** C3-1 — tier membership over the 95 printable-ASCII characters (32–126),
 *  ABSOLUTE. Both literals are hand-written here and are NOT derived from
 *  `src/`, nor either one from the other. */
const C3_1_PRINTABLE_FROM = 32;
const C3_1_PRINTABLE_TO = 126;
const C3_1_TIER1 = '+0123456789=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const C3_1_TIER2 = '+/0123456789=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** C3-2 — the FN matrix draw count. */
const C3_2_DRAWS = 2000;
const C3_2_NON_REGRESSING_CELLS = 138;

/** C3-3 — the permitted regressions, complete: 6 fixtures × 3 contexts.
 *  `today` is C3-7's transcribed constant; `floor` is the CI gate on the
 *  proposed rate and sits ~5 points below the 2026-07-26 measurement. */
const C3_3_CONTEXTS = ['bare', 'prose', 'table'];
const C3_3 = [
  { id: 'aws-secret-access-key', today: 100, floor: 80 },
  { id: 'aws-secret-access-key-64', today: 100, floor: 95 },
  { id: 'authress-client-key', today: 38.1, floor: 18 },
  { id: 'grafana-cloud-token', today: 100, floor: 72 },
  { id: 'kraken-access-token', today: 91.3, floor: 68 },
  { id: 'jwt-standard-base64', today: 100, floor: 92 },
];

/** C3-4 — the fixtures a LABELLED rule covers at 100% `quarantine` in all four
 *  contexts. An equality on the id set. */
const C3_4 = [
  'anthropic-api-key',
  'openai-legacy',
  'github-pat',
  'github-oauth',
  'slack-bot-token',
  'aws-access-key-id',
  'google-api-key',
  'google-oauth-ya29',
  'google-client-secret',
  'google-refresh-token',
  'stripe-secret',
  'jwt',
  'private-key-block',
  'authorization-basic',
];

/** C3-5 — the C2 rows that reach `quarantine`. An equality, not a ceiling. */
const C3_5 = [29, 30, 31, 32, 42, 43];

/** C3-6 — the C2 rows that land at `redact`. An equality, not an upper bound. */
const C3_6 = [14, 15, 20, 24, 25, 27, 33, 34, 35, 37, 39, 40, 41, 44];

/** C3-8 — `SEVERITY.REDACT` producers in the module, counted as OCCURRENCES. */
const C3_8_REDACT_PRODUCERS = 1;

// --- helpers ----------------------------------------------------------------

/** @param {string} text @returns {'clean'|'redact'|'quarantine'} */
function disposition(text) {
  const { findings } = scanAndRedact(text);
  if (findings.some((f) => f.severity === SEVERITY.QUARANTINE)) return 'quarantine';
  return findings.length ? 'redact' : 'clean';
}

/** The C2 corpus partitioned by outcome, so a failure prints WHICH rows moved
 *  rather than only that some did. @returns {{quarantine:number[], redact:number[], clean:number[]}} */
function proseDispositions() {
  const out = { quarantine: [], redact: [], clean: [] };
  for (const row of PROSE) out[disposition(row.text)].push(row.id);
  return out;
}

/** One FN-matrix cell. @param {object} fixture @param {object} context
 *  @returns {{today:number, proposed:number, labelled:number}} percentages */
function cell(fixture, context) {
  const rng = makeRng(SEED);
  let today = 0;
  let proposed = 0;
  let labelled = 0;
  for (let i = 0; i < C3_2_DRAWS; i += 1) {
    const text = context.wrap(fixture.gen(rng));
    const { findings } = scanAndRedact(text);
    if (findings.length) proposed += 1;
    if (caughtByShippedDetector(findings, text)) today += 1;
    if (findings.some((f) => f.label !== 'high-entropy' && f.severity === SEVERITY.QUARANTINE)) {
      labelled += 1;
    }
  }
  const pct = (n) => (100 * n) / C3_2_DRAWS;
  return { today: pct(today), proposed: pct(proposed), labelled: pct(labelled) };
}

/** The whole matrix, computed once and shared by the C3-2/C3-3/C3-4 tests. */
let MATRIX = null;
/** @returns {Map<string, {today:number, proposed:number, labelled:number}>} */
function matrix() {
  if (MATRIX) return MATRIX;
  MATRIX = new Map();
  for (const fixture of CREDENTIALS) {
    for (const context of CONTEXTS) {
      MATRIX.set(`${fixture.id}/${context.id}`, cell(fixture, context));
    }
  }
  return MATRIX;
}

// --- C3-0: the corpora are the size Table C decides -------------------------

test('C3-0: corpus sizes, cell count and id shapes (AC-11)', () => {
  assert.equal(CREDENTIALS.length, C3_0.fixtures);
  assert.equal(PROSE.length, C3_0.proseRows);
  assert.equal(CONTEXTS.length, C3_0.contexts);
  assert.equal(CREDENTIALS.length * CONTEXTS.length, C3_0.cells);
  // ids are unique, and C2's rows are in order, numbered 1..44
  assert.equal(new Set(CREDENTIALS.map((f) => f.id)).size, C3_0.fixtures);
  assert.deepEqual(
    PROSE.map((r) => r.id),
    Array.from({ length: C3_0.proseRows }, (_, i) => i + 1),
  );
});

// --- A1/A2/A3 + C3-1: the two alphabets -------------------------------------

test('AC-1: the entropy pass carries exactly two character-class literals (A1)', () => {
  assert.equal(
    (SOURCE.match(/^const ENTROPY_CORE_CLASS = 'A-Za-z0-9\+=';$/gm) || []).length,
    1,
  );
  assert.equal((SOURCE.match(/^const ENTROPY_WIDE_EXTRA = '\/';$/gm) || []).length, 1);
  assert.ok(
    !SOURCE.includes('[A-Za-z0-9+/=]'),
    "today's hand-written entropy alphabet literal is still in the module",
  );
});

test('AC-2 / C3-1: tier membership is ABSOLUTE over printable ASCII, observed through scanAndRedact', () => {
  // C3-1's probe. `authorization` carries the tier-2 half because it is the one
  // A7 keyword that is NOT in SENSITIVE_KEYS, so no labelled rule consumes it.
  const tier1 = [];
  const tier2 = [];
  for (let code = C3_1_PRINTABLE_FROM; code <= C3_1_PRINTABLE_TO; code += 1) {
    const c = String.fromCharCode(code);
    const run = `ABCDEFGHIJKL${c}MNOPQRSTUVWX`;
    assert.equal(run.length, 25);

    const wide = scanAndRedact(`authorization: ${run}`).findings;
    const wideHit = wide.find((f) => f.label === 'high-entropy');
    if (wideHit && wideHit.severity === SEVERITY.QUARANTINE) tier2.push(c);

    const narrow = scanAndRedact(`blob ${run} end`).findings;
    const narrowHit = narrow.find((f) => f.label === 'high-entropy');
    if (narrowHit && narrowHit.severity === SEVERITY.REDACT) tier1.push(c);
  }
  // ABSOLUTE — against the hand-written literals, never against each other.
  assert.equal(tier1.join(''), C3_1_TIER1);
  assert.equal(tier2.join(''), C3_1_TIER2);
  assert.equal(tier1.length, 64);
  assert.equal(tier2.length, 65);
  // The derived facts are asserted IN ADDITION, never instead.
  const extra = tier2.filter((c) => !tier1.includes(c));
  assert.deepEqual(extra, ['/']);
  assert.deepEqual(
    tier1.filter((c) => !tier2.includes(c)),
    [],
  );
});

// --- A5/A6: what each tier does ---------------------------------------------

test('AC-3: a tier-2 candidate at the floor WITH bound context quarantines (A5)', () => {
  // `authorization` is the carrier for the same reason C3-1's probe uses it:
  // it is the one A7 keyword that is not in SENSITIVE_KEYS, so no labelled rule
  // consumes the assignment before the entropy pass sees it.
  const { text, findings } = scanAndRedact('authorization: Projects/example/wienerdog/current');
  assert.ok(text.includes('[REDACTED:high-entropy]'), text);
  const hit = findings.find((f) => f.label === 'high-entropy');
  assert.ok(hit, JSON.stringify(findings));
  assert.equal(hit.severity, SEVERITY.QUARANTINE);
  assert.equal(hasHardFinding(findings), true);
});

test('AC-4: the same candidate WITHOUT bound context redacts its tier-1 sub-runs only (A6)', () => {
  const bound = 'Projects/example/wienerdog/current';
  const { findings } = scanAndRedact(`see ${bound} for detail`);
  // path-shaped: no tier-1 sub-run reaches the floor, so nothing at all
  assert.deepEqual(findings, []);

  // a bare pasted key: no keyword anywhere, still scrubbed, at redact
  const bare = scanAndRedact('blob q7PmXz4KvR9tWc2LbN8dYfGh end');
  assert.ok(bare.text.includes('[REDACTED:high-entropy]'), bare.text);
  const hit = bare.findings.find((f) => f.label === 'high-entropy');
  assert.equal(hit.severity, SEVERITY.REDACT);
  assert.equal(hasHardFinding(bare.findings), false);

  // entropy is not monotone: a LOW-entropy wide run containing a high-entropy
  // narrow sub-run still yields the redact finding.
  const wide = `q7PmXz4KvR9tWc2LbN8dYfGh${'/'.repeat(120)}`;
  const low = scanAndRedact(`blob ${wide} end`);
  const lowHit = low.findings.find((f) => f.label === 'high-entropy');
  assert.ok(lowHit, JSON.stringify(low.findings));
  assert.equal(lowHit.severity, SEVERITY.REDACT);
});

// --- A10/A11/A13: severity of the labelled rules ----------------------------

test('AC-5: every labelled rule emits quarantine; severityForKey and QUARANTINE_KEYS are gone (A10, A11)', () => {
  assert.ok(!SOURCE.includes('severityForKey'), 'severityForKey still exists');
  assert.ok(!SOURCE.includes('QUARANTINE_KEYS'), 'QUARANTINE_KEYS still exists');
  const samples = [
    ['-----BEGIN RSA PRIVATE KEY-----\nAAAA1234\n-----END RSA PRIVATE KEY-----', 'private-key'],
    ['noise xsk-ant-0123456789abcdef0123 tail', 'anthropic-key'],
    ['key sk-abcdefghijklmnopqrstuvwxyz123456 end', 'openai-key'],
    ['id AKIAIOSFODNN7EXAMPLE end', 'aws-key'],
    [`tok ghp_${'a1B2'.repeat(10)} end`, 'github-token'],
    ['slack=xoxb-1234567890-abcdefghij end', 'slack-token'],
    ['t ya29.a0AbCdEfGhIjKl end', 'google-oauth'],
    ['jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4 end', 'jwt'],
    ['Authorization: Bearer abcdefghijklmnop', 'bearer-token'],
    ['password=hunter2secret1234567', 'generic-secret'],
    ['{"client_secret":"abcdefghijklmnop"}', 'client_secret'],
    ['REFRESH_TOKEN=1//0abcDEFghiJKLmno-_pqr', 'refresh_token'],
    ['export CLIENT_SECRET=GOCSPX-abcd1234efgh5678ijkl', 'client_secret'],
    ['saved 1//0gAbCdEfGhIjKlMnOpQrStUv to disk', 'google-refresh-token'],
    ['k AIzaSyA1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tUvW end', 'google-api-key'],
    ['s sk_live_a1b2c3d4e5f6g7h8 end', 'stripe-secret-key'],
    ['p pk_live_a1b2c3d4e5f6g7h8 end', 'stripe-key'],
    ['Authorization: Basic YWxhZGRpbjpvcGVuc2VzYW1l', 'basic-auth'],
  ];
  for (const [input, label] of samples) {
    const { findings } = scanAndRedact(input);
    const hit = findings.find((f) => f.label === label);
    assert.ok(hit, `no '${label}' finding for ${JSON.stringify(input)}: ${JSON.stringify(findings)}`);
    assert.equal(hit.severity, SEVERITY.QUARANTINE, `${label} is not quarantine`);
  }
});

test('AC-6 / C3-8: exactly one SEVERITY.REDACT producer in the module (A13)', () => {
  const occurrences = SOURCE.split('SEVERITY.REDACT').length - 1;
  assert.equal(occurrences, C3_8_REDACT_PRODUCERS);
});

// --- A16: the nineteenth labelled rule --------------------------------------

test('AC-21: the basic-auth rule (A16) behaves exactly as Table A says', () => {
  const body = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  for (const id of ['bare', 'prose', 'table']) {
    const context = CONTEXTS.find((c) => c.id === id);
    const input = context.wrap(`Authorization: Basic ${body}`);
    const { text, findings } = scanAndRedact(input);
    assert.deepEqual(
      findings.map((f) => [f.label, f.severity]),
      [['basic-auth', SEVERITY.QUARANTINE]],
      `${id}: ${JSON.stringify(findings)}`,
    );
    assert.ok(text.includes('Authorization: Basic [REDACTED:basic-auth]'), text);
    assert.ok(!text.includes(body), text);
  }

  // assign: the shipped legacy assignment rule runs FIRST and consumes
  // `secret=Authorization`, so basic-auth never sees the input. Assert the
  // quarantine finding's LABEL and severity, never the array length — a tier-1
  // redact on the residual body MAY accompany it, depending on the body.
  const assign = scanAndRedact(`secret=Authorization: Basic ${body}`);
  const hard = assign.findings.filter((f) => f.severity === SEVERITY.QUARANTINE);
  assert.deepEqual(hard.map((f) => f.label), ['generic-secret'], JSON.stringify(assign.findings));

  // Bearer is unaffected and never becomes basic-auth.
  const bearer = scanAndRedact(`Authorization: Bearer ${body}`);
  assert.ok(bearer.findings.some((f) => f.label === 'bearer-token'), JSON.stringify(bearer.findings));
  assert.ok(!bearer.findings.some((f) => f.label === 'basic-auth'), JSON.stringify(bearer.findings));

  assert.ok(C3_4.includes('authorization-basic'));
});

// --- C3-2 / C3-3: the FN regression matrix ----------------------------------

test('AC-11 / C3-2 / C3-3: the FN matrix regresses on exactly C3-3\'s cells, each above its floor', () => {
  const m = matrix();
  assert.equal(m.size, C3_0.cells);

  const regressing = [];
  for (const [key, rates] of m) {
    if (rates.proposed < rates.today) regressing.push(key);
  }
  const expected = [];
  for (const row of C3_3) for (const ctx of C3_3_CONTEXTS) expected.push(`${row.id}/${ctx}`);
  assert.deepEqual(regressing.slice().sort(), expected.slice().sort());
  assert.equal(m.size - regressing.length, C3_2_NON_REGRESSING_CELLS);

  // never `assign`, and only fixtures whose entropy-visible tail carries `/`
  for (const key of regressing) {
    const [id, ctx] = key.split('/');
    assert.notEqual(ctx, 'assign');
    assert.equal(CREDENTIALS.find((f) => f.id === id).slash, true);
  }

  // C3-3's set is derived from exactly the C1 intersection its cell names
  const derived = CREDENTIALS.filter(
    (f) => f.slash && f.id !== 'slack-webhook-url' && f.id !== 'authorization-basic',
  ).map((f) => f.id);
  assert.deepEqual(derived.slice().sort(), C3_3.map((r) => r.id).slice().sort());

  // the transcribed `today` column reproduces, and every proposed rate clears
  // its C3-3 floor
  for (const row of C3_3) {
    for (const ctx of C3_3_CONTEXTS) {
      const rates = m.get(`${row.id}/${ctx}`);
      // C3-3 states `today` to one decimal place, so the transcribed constant
      // is compared at that resolution rather than bit-for-bit.
      assert.ok(
        Math.abs(rates.today - row.today) < 0.1,
        `${row.id}/${ctx}: today measures ${rates.today}%, C3-3 transcribes ${row.today}%`,
      );
      assert.ok(
        rates.proposed >= row.floor,
        `${row.id}/${ctx}: proposed ${rates.proposed}% is below the C3-3 floor ${row.floor}%`,
      );
    }
  }
});

test('AC-12 / C3-4: the labelled-rule fixture set is exactly C3-4\'s id set', () => {
  const m = matrix();
  const covered = CREDENTIALS.filter((f) =>
    CONTEXTS.every((c) => m.get(`${f.id}/${c.id}`).labelled === 100),
  ).map((f) => f.id);
  assert.deepEqual(covered.slice().sort(), C3_4.slice().sort());
});

// --- C3-5 / C3-6: the false-positive corpus ---------------------------------

test('AC-13 / C3-5 / C3-6: the C2 corpus lands on exactly the id sets Table C3 decides', () => {
  const got = proseDispositions();
  const shown = JSON.stringify(got);
  assert.deepEqual(got.quarantine, C3_5, `quarantine set moved — ${shown}`);
  assert.deepEqual(got.redact, C3_6, `redact set moved — ${shown}`);
  // rows 1–28 are the destructive-outcome promise: none of them may withhold
  for (const id of got.quarantine) assert.ok(id > 28, `C2 row ${id} withholds — ${shown}`);
  // the partition is total
  assert.equal(
    got.quarantine.length + got.redact.length + got.clean.length,
    C3_0.proseRows,
  );
});

// --- A15 / C3-9: severity escalation ----------------------------------------

test('AC-18 / C3-9: severity is the MAXIMUM over a label\'s occurrences, in BOTH line orders', () => {
  const bound = 'authorization: wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY9c';
  const bare = 'call generateCodeVerifierAsync before the redirect';
  for (const input of [`${bound}\n${bare}\n`, `${bare}\n${bound}\n`]) {
    const { findings } = scanAndRedact(input);
    const hits = findings.filter((f) => f.label === 'high-entropy');
    assert.equal(hits.length, 1, JSON.stringify(findings));
    assert.equal(hits[0].severity, SEVERITY.QUARANTINE, JSON.stringify(findings));
    assert.equal(hits[0].count, 2, JSON.stringify(findings));
    assert.equal(hasHardFinding(findings), true);
  }
});

// --- A14 / AC-17: the EP1/EP3/EP4 loosening is asserted, not assumed --------

test('AC-17: redactOnly leaves a path-shaped run byte-unchanged and reports no finding (A14)', () => {
  const prose = 'see Projects/wienerdog/current for detail';
  assert.equal(redactOnly(prose), prose);
  assert.equal(scanAndRedact(prose).findings.length, 0);
  // and the contract between the two helpers is unchanged
  for (const input of [prose, 'password=hunter2secret1234567', '']) {
    assert.equal(redactOnly(input), scanAndRedact(input).text);
  }
});
