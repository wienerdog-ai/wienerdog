'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scanAndRedact,
  redactOnly,
  hasHardFinding,
  ScanLimits,
  SEVERITY,
} = require('../../src/core/secret-scan');

/** Find the first finding with the given label, or undefined. */
function findingByLabel(findings, label) {
  return findings.find((f) => f.label === label);
}

/** Assert `secret` is gone from the sanitized text and a metadata finding with
 *  `label` (and, when given, `severity`) is present. */
function assertRedacted(input, secret, label, severity) {
  const { text, findings } = scanAndRedact(input);
  assert.ok(!text.includes(secret), `secret still present in: ${text}`);
  const finding = findingByLabel(findings, label);
  assert.ok(finding, `no '${label}' finding in ${JSON.stringify(findings)}`);
  if (severity) assert.equal(finding.severity, severity);
  return { text, findings };
}

// --- worked examples from the spec ---

test('scanAndRedact: uppercase CLIENT_SECRET assignment (worked example)', () => {
  const { text, findings } = scanAndRedact('export CLIENT_SECRET=GOCSPX-abcd1234efgh5678ijkl');
  assert.ok(text.includes('CLIENT_SECRET='), text);
  assert.ok(text.includes('[REDACTED:'), text);
  assert.ok(!text.includes('GOCSPX-abcd1234'), text);
  const finding = findingByLabel(findings, 'client_secret') || findingByLabel(findings, 'generic-secret');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.severity, SEVERITY.REDACT);
  assert.equal(finding.count, 1);
});

test('scanAndRedact: token glued to a preceding word character (worked example)', () => {
  const { text } = scanAndRedact('noise xsk-ant-0123456789abcdef0123 tail');
  assert.ok(!text.includes('sk-ant-0123456789abcdef0123'), text);
  assert.ok(text.includes('[REDACTED:anthropic-key]'), text);
});

test('scanAndRedact: JSON refresh_token value (worked example)', () => {
  const { text, findings } = scanAndRedact('{"refresh_token":"1//0abcDEF-_ghiJKL=="}');
  assert.ok(!text.includes('1//0abcDEF-_ghiJKL=='), text);
  assert.ok(text.includes('refresh_token'), text);
  const finding = findingByLabel(findings, 'refresh_token');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.severity, SEVERITY.REDACT);
});

test('scanAndRedact: PEM private key is redacted AND quarantine-flagged (worked example)', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nAAAA1234\n-----END RSA PRIVATE KEY-----';
  const { text, findings } = scanAndRedact(pem);
  assert.ok(text.includes('[REDACTED:private-key]'), text);
  assert.ok(!text.includes('AAAA1234'), text);
  const finding = findingByLabel(findings, 'private-key');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.severity, SEVERITY.QUARANTINE);
  assert.equal(hasHardFinding(findings), true);
});

test('scanAndRedact: ordinary prose is unchanged with zero findings (worked example)', () => {
  const prose = 'the weather is nice today, nothing secret here';
  assert.deepEqual(scanAndRedact(prose), { text: prose, findings: [] });
});

test('scanAndRedact: oversized input is withheld, not scanned (worked example)', () => {
  const result = scanAndRedact('x'.repeat(300 * 1024));
  assert.deepEqual(result, {
    text: '[wienerdog: oversized content withheld from secret scan]',
    findings: [{ label: 'oversized', severity: SEVERITY.QUARANTINE, count: 1 }],
  });
});

// --- regression corpus (acceptance criteria) ---

test('corpus: uppercase REFRESH_TOKEN assignment', () => {
  const { text } = assertRedacted(
    'REFRESH_TOKEN=1//0abcDEFghiJKLmno-_pqr', '1//0abcDEFghiJKLmno-_pqr',
    'refresh_token', SEVERITY.REDACT,
  );
  assert.ok(text.includes('REFRESH_TOKEN='), text);
});

test('corpus: Google refresh-token variant standalone (1//0…)', () => {
  assertRedacted(
    'saved 1//0gAbCdEfGhIjKlMnOpQrStUv to disk', '1//0gAbCdEfGhIjKlMnOpQrStUv',
    'google-refresh-token', SEVERITY.REDACT,
  );
});

test('corpus: OpenAI keys, plain and project-scoped', () => {
  assertRedacted('key sk-abcdefghijklmnopqrstuvwxyz123456 end', 'sk-abcdefghijklmnopqrstuvwxyz123456', 'openai-key');
  assertRedacted('key sk-proj-abcdefghijklmnop123456 end', 'sk-proj-abcdefghijklmnop123456', 'openai-key');
});

test('corpus: GitHub token', () => {
  assertRedacted(`tok ghp_${'a1B2'.repeat(10)} end`, `ghp_${'a1B2'.repeat(10)}`, 'github-token');
});

test('corpus: Google OAuth access token and API key', () => {
  assertRedacted('t ya29.a0AbCdEfGhIjKl end', 'ya29.a0AbCdEfGhIjKl', 'google-oauth');
  assertRedacted(
    'k AIzaSyA1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tUvW end', 'AIzaSyA1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tUvW',
    'google-api-key', SEVERITY.REDACT,
  );
});

test('corpus: Stripe live keys — secret forms quarantine, publishable redacts', () => {
  assertRedacted('s sk_live_a1b2c3d4e5f6g7h8 end', 'sk_live_a1b2c3d4e5f6g7h8', 'stripe-secret-key', SEVERITY.QUARANTINE);
  assertRedacted('r rk_live_a1b2c3d4e5f6g7h8 end', 'rk_live_a1b2c3d4e5f6g7h8', 'stripe-secret-key', SEVERITY.QUARANTINE);
  assertRedacted('p pk_live_a1b2c3d4e5f6g7h8 end', 'pk_live_a1b2c3d4e5f6g7h8', 'stripe-key', SEVERITY.REDACT);
});

test('corpus: AWS key id redacts, AWS secret assignment quarantines', () => {
  assertRedacted('id AKIAIOSFODNN7EXAMPLE end', 'AKIAIOSFODNN7EXAMPLE', 'aws-key', SEVERITY.REDACT);
  const { text } = assertRedacted(
    'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'aws_secret_access_key', SEVERITY.QUARANTINE,
  );
  assert.ok(text.includes('aws_secret_access_key='), text);
  assertRedacted(
    'AWS_SESSION_TOKEN=FwoGZXIvYXdzEBYaDHf3+aBcD/eF9gH0iJ==',
    'FwoGZXIvYXdzEBYaDHf3+aBcD/eF9gH0iJ==',
    'aws_session_token', SEVERITY.QUARANTINE,
  );
});

test('corpus: JSON string value under a sensitive key', () => {
  const { text } = assertRedacted(
    '{"token": "abcd efgh ijkl mnop qrst"}', 'abcd efgh ijkl mnop qrst',
    'generic-secret', SEVERITY.REDACT,
  );
  assert.ok(text.includes('"token"'), text);
});

test('corpus: quoted assignment values', () => {
  assertRedacted("password='hunter2secret1234567'", 'hunter2secret1234567', 'generic-secret');
  assertRedacted('ACCESS_TOKEN="ya27notaprefixbutlong12345"', 'ya27notaprefixbutlong12345', 'access_token');
});

test('corpus: values containing / + =', () => {
  assertRedacted(
    'client_secret=abc/def+ghi=jkl.mno~pqr', 'abc/def+ghi=jkl.mno~pqr',
    'client_secret', SEVERITY.REDACT,
  );
});

test('corpus: assignment value glued directly after a word character still matches', () => {
  // audit bypass case: no leading \b may be required by the value match
  const { text } = scanAndRedact('dumpPASSWORD=abcdefgh12345678 tail');
  assert.ok(!text.includes('abcdefgh12345678'), text);
});

test('corpus: two matches of the same label aggregate count', () => {
  const tok1 = `ghp_${'x9Yz'.repeat(10)}`;
  const tok2 = `ghp_${'k3Lm'.repeat(10)}`;
  const { findings } = scanAndRedact(`a ${tok1} b ${tok2}`);
  const finding = findingByLabel(findings, 'github-token');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.count, 2);
});

// --- high-entropy contextual detection ---

test('entropy: an unlabelled high-entropy base64 run is quarantined', () => {
  const blob = 'q7PmXz4KvR9tWc2LbN8dYfGh'; // 24 chars, all distinct → ~4.58 bits/char
  assert.equal(blob.length, ScanLimits.ENTROPY_MIN_LEN);
  const { text, findings } = scanAndRedact(`blob ${blob} end`);
  assert.ok(!text.includes(blob), text);
  assert.ok(text.includes('[REDACTED:high-entropy]'), text);
  const finding = findingByLabel(findings, 'high-entropy');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.severity, SEVERITY.QUARANTINE);
  assert.equal(hasHardFinding(findings), true);
});

test('entropy: long low-entropy runs are NOT flagged', () => {
  const input = `padding ${'a'.repeat(40)} and ${'abc'.repeat(20)} end`;
  assert.deepEqual(scanAndRedact(input), { text: input, findings: [] });
});

test('entropy: an already-labelled match is not double-counted as high-entropy', () => {
  const { findings } = scanAndRedact('key sk-abcdefghijklmnopqrstuvwxyz123456 end');
  assert.equal(findingByLabel(findings, 'high-entropy'), undefined, JSON.stringify(findings));
});

// --- total / fail-closed behavior ---

test('fail-closed: non-string inputs are treated as empty', () => {
  assert.deepEqual(scanAndRedact(null), { text: '', findings: [] });
  assert.deepEqual(scanAndRedact(undefined), { text: '', findings: [] });
  assert.deepEqual(scanAndRedact(42), { text: '', findings: [] });
  assert.deepEqual(scanAndRedact({}), { text: '', findings: [] });
  assert.deepEqual(scanAndRedact(''), { text: '', findings: [] });
});

test('fail-closed: oversized threshold is byte-based at SCAN_MAX_BYTES', () => {
  const under = scanAndRedact('a'.repeat(ScanLimits.SCAN_MAX_BYTES));
  assert.equal(under.text, 'a'.repeat(ScanLimits.SCAN_MAX_BYTES));
  const over = scanAndRedact('a'.repeat(ScanLimits.SCAN_MAX_BYTES + 1));
  assert.equal(over.text, '[wienerdog: oversized content withheld from secret scan]');
  assert.deepEqual(over.findings, [{ label: 'oversized', severity: SEVERITY.QUARANTINE, count: 1 }]);
});

test('fail-closed: an internal error withholds content instead of throwing or leaking', () => {
  const original = RegExp.prototype[Symbol.replace];
  // eslint-disable-next-line no-extend-native
  RegExp.prototype[Symbol.replace] = () => { throw new Error('boom'); };
  try {
    const result = scanAndRedact('password=hunter2secret1234567');
    assert.deepEqual(result, {
      text: '[wienerdog: secret scan failed — content withheld]',
      findings: [{ label: 'scan-error', severity: SEVERITY.QUARANTINE, count: 1 }],
    });
  } finally {
    // eslint-disable-next-line no-extend-native
    RegExp.prototype[Symbol.replace] = original;
  }
});

// --- findings are metadata-only ---

test('findings carry only {label, severity, count} — never the matched bytes', () => {
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456';
  const { findings } = scanAndRedact(`key ${secret} and password=hunter2secret1234567`);
  assert.ok(findings.length >= 2);
  for (const finding of findings) {
    assert.deepEqual(Object.keys(finding).sort(), ['count', 'label', 'severity']);
    assert.equal(typeof finding.label, 'string');
    assert.ok(finding.severity === SEVERITY.REDACT || finding.severity === SEVERITY.QUARANTINE);
    assert.ok(Number.isInteger(finding.count) && finding.count >= 1);
  }
  const serialized = JSON.stringify(findings);
  assert.ok(!serialized.includes(secret), serialized);
  assert.ok(!serialized.includes('hunter2'), serialized);
});

// --- helpers ---

test('redactOnly returns exactly scanAndRedact().text', () => {
  const inputs = [
    'password=hunter2secret1234567',
    'noise xsk-ant-0123456789abcdef0123 tail',
    'the weather is nice today',
    '',
  ];
  for (const input of inputs) {
    assert.equal(redactOnly(input), scanAndRedact(input).text);
  }
});

test('hasHardFinding: quarantine detection over findings lists', () => {
  assert.equal(hasHardFinding([]), false);
  assert.equal(hasHardFinding(null), false);
  assert.equal(hasHardFinding(undefined), false);
  assert.equal(hasHardFinding([{ label: 'jwt', severity: 'redact', count: 1 }]), false);
  assert.equal(
    hasHardFinding([
      { label: 'jwt', severity: 'redact', count: 1 },
      { label: 'private-key', severity: 'quarantine', count: 1 },
    ]),
    true,
  );
});

// --- bounded / near-linear scanning (property + perf) ---

test('perf: catastrophic-backtracking bait completes within a fixed bound', () => {
  const baits = [
    '='.repeat(200 * 1000),                    // long separator run
    'a='.repeat(100 * 1000),                   // alternating key/sep bait
    `sk-${'ab'.repeat(9)}`.repeat(9 * 1000),   // near-miss provider prefixes
    `bearer ${'aaaaaaaaaa.'.repeat(20 * 1000)}`, // long dotted bearer-value bait
    'aA0+/'.repeat(50 * 1000),                 // one huge low-entropy base64 run
    `"token":${'"x'.repeat(50 * 1000)}`,       // unterminated JSON value bait
  ];
  const started = Date.now();
  for (const bait of baits) {
    assert.ok(Buffer.byteLength(bait, 'utf8') <= ScanLimits.SCAN_MAX_BYTES, 'bait must be scannable');
    scanAndRedact(bait); // must not hang or throw
  }
  const elapsedMs = Date.now() - started;
  assert.ok(elapsedMs < 5000, `scan too slow: ${elapsedMs}ms`);
});

test('ScanLimits carries the OWNER-APPROVED bounds', () => {
  assert.equal(ScanLimits.SCAN_MAX_BYTES, 256 * 1024);
  assert.equal(ScanLimits.ENTROPY_MIN_LEN, 24);
  assert.equal(ScanLimits.ENTROPY_MIN_BITS_PER_CHAR, 3.5);
});
