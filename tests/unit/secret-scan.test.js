'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scanAndRedact,
  redactOnly,
  hasHardFinding,
  createStreamRedactor,
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
  assert.equal(finding.severity, SEVERITY.QUARANTINE);
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
  assert.equal(finding.severity, SEVERITY.QUARANTINE);
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
    'refresh_token', SEVERITY.QUARANTINE,
  );
  assert.ok(text.includes('REFRESH_TOKEN='), text);
});

test('corpus: Google refresh-token variant standalone (1//0…)', () => {
  assertRedacted(
    'saved 1//0gAbCdEfGhIjKlMnOpQrStUv to disk', '1//0gAbCdEfGhIjKlMnOpQrStUv',
    'google-refresh-token', SEVERITY.QUARANTINE,
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
    'google-api-key', SEVERITY.QUARANTINE,
  );
});

test('corpus: Stripe live keys — secret forms quarantine, publishable redacts', () => {
  assertRedacted('s sk_live_a1b2c3d4e5f6g7h8 end', 'sk_live_a1b2c3d4e5f6g7h8', 'stripe-secret-key', SEVERITY.QUARANTINE);
  assertRedacted('r rk_live_a1b2c3d4e5f6g7h8 end', 'rk_live_a1b2c3d4e5f6g7h8', 'stripe-secret-key', SEVERITY.QUARANTINE);
  assertRedacted('p pk_live_a1b2c3d4e5f6g7h8 end', 'pk_live_a1b2c3d4e5f6g7h8', 'stripe-key', SEVERITY.QUARANTINE);
});

test('corpus: AWS key id redacts, AWS secret assignment quarantines', () => {
  assertRedacted('id AKIAIOSFODNN7EXAMPLE end', 'AKIAIOSFODNN7EXAMPLE', 'aws-key', SEVERITY.QUARANTINE);
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
    'generic-secret', SEVERITY.QUARANTINE,
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
    'client_secret', SEVERITY.QUARANTINE,
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

test('entropy: an unlabelled high-entropy base64 run is redacted', () => {
  const blob = 'q7PmXz4KvR9tWc2LbN8dYfGh'; // 24 chars, all distinct → ~4.58 bits/char
  assert.equal(blob.length, ScanLimits.ENTROPY_MIN_LEN);
  const { text, findings } = scanAndRedact(`blob ${blob} end`);
  assert.ok(!text.includes(blob), text);
  assert.ok(text.includes('[REDACTED:high-entropy]'), text);
  const finding = findingByLabel(findings, 'high-entropy');
  assert.ok(finding, JSON.stringify(findings));
  assert.equal(finding.severity, SEVERITY.REDACT);
  assert.equal(hasHardFinding(findings), false);
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

// --- the bounded stream redactor (ADR-0043, WP-secret-stream-safe-cut-redactor) ---

/** Feed `parts` to a fresh redactor in order; return every `push` return
 *  concatenated with the `end` return — the whole of what a sink would write. */
function streamThrough(parts) {
  const redactor = createStreamRedactor();
  let out = '';
  for (const part of parts) out += redactor.push(part);
  return out + redactor.end();
}

/** Split after every `\n`, which is how a line-buffered child delivers these
 *  shapes and where a last-line-only predicate would happily cut. */
function splitAfterNewlines(text) {
  return text.split(/(?<=\n)/);
}

/** The seven cross-line leak shapes measured on 2026-09-18 (AC3a). Every one is
 *  redacted when `redactOnly` scans it whole and every one leaks across a cut a
 *  last-line-only predicate permits. `V` is a synthetic 21-character value. */
const CROSS_LINE_LEAK_SHAPES = (() => {
  const V = 'hunter2hunter2hunter2';
  return {
    L1: `password:\n  ${V}`,
    L2: `password:\n\n${V}`,
    L3: `password\n:\n${V}`,
    L4: `password\n: ${V}`,
    L5: '"client_secret":\n  "abc\ndefghijkl"',
    L6: '"client_secret"\n: "abcdefghijkl"',
    L7: `password:\r\n\r\n${V}`,
  };
})();

test('stream-redactor: the returned surface is exactly push and end (AC1)', () => {
  assert.equal(typeof createStreamRedactor, 'function');
  const redactor = createStreamRedactor();
  assert.deepEqual(Object.keys(redactor).sort(), ['end', 'push']);
  assert.equal(typeof redactor.push, 'function');
  assert.equal(typeof redactor.end, 'function');
});

test('stream-redactor: a labelled secret split across two pushes is redacted whole', () => {
  // Neither half matches `sk-ant-[A-Za-z0-9\-_]{20,}` on its own, so a cut
  // between them is the whole of the leak.
  const head = 'sk-ant-api03-AAAABBBB';
  const tail = 'CCCCDDDDEEEEFFFF';
  const whole = redactOnly(`${head}${tail}\n`);
  assert.ok(whole.includes('[REDACTED:anthropic-key]'), 'fixture must redact when scanned whole');
  assert.equal(redactOnly(head), head, 'fixture head must be inert on its own');
  assert.equal(
    streamThrough([head, `${tail}\n`]),
    whole,
    'S1-cut-only-after-a-newline',
  );
});

test('stream-redactor: a sensitive key whose value arrives on a later line is redacted whole', () => {
  const { L1, L2, L3, L7 } = CROSS_LINE_LEAK_SHAPES;
  for (const text of [L1, L2, L3, L7]) {
    const whole = redactOnly(text);
    assert.notEqual(whole, text, 'fixture must redact when scanned whole');
    const parts = splitAfterNewlines(text);
    assert.ok(parts.length >= 2, 'fixture must arrive as two or more pushes');
    assert.equal(streamThrough(parts), whole, 'S2-no-open-key-binder-at-a-cut');
  }
});

test('stream-redactor: a quoted sensitive JSON value left open across a line break is redacted whole', () => {
  const parts = ['"client_secret":\n  "abc\n', 'defghijkl"\n'];
  const whole = redactOnly(parts.join(''));
  assert.ok(whole.includes('[REDACTED:client_secret]'), 'fixture must redact when scanned whole');
  assert.equal(streamThrough(parts), whole, 'S3-no-open-quoted-value-at-a-cut');
});

test('stream-redactor: a private-key block split across two pushes is redacted whole', () => {
  const parts = [
    '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD\n',
    '-----END RSA PRIVATE KEY-----\n',
  ];
  const whole = redactOnly(parts.join(''));
  assert.ok(whole.includes('[REDACTED:private-key]'), 'fixture must redact when scanned whole');
  assert.equal(streamThrough(parts), whole, 'S4-no-open-private-key-block-at-a-cut');
});

test('stream-redactor: every one of the seven measured cross-line shapes survives newline delivery (AC3a)', () => {
  for (const [id, text] of Object.entries(CROSS_LINE_LEAK_SHAPES)) {
    const whole = redactOnly(text);
    assert.notEqual(whole, text, `${id}: fixture must redact when scanned whole`);
    const parts = splitAfterNewlines(text);
    assert.ok(parts.length >= 2, `${id}: fixture must arrive as two or more pushes`);
    assert.equal(streamThrough(parts), whole, `${id}: a cross-line shape leaked across a cut`);
  }
});

test('stream-redactor: a secret cut at every single offset is still redacted whole (AC3)', () => {
  const text = 'export ANTHROPIC_API_KEY=sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF\n';
  const whole = redactOnly(text);
  assert.ok(whole.includes('[REDACTED:'), 'fixture must redact when scanned whole');
  for (let i = 0; i <= text.length; i += 1) {
    assert.equal(
      streamThrough([text.slice(0, i), text.slice(i)]),
      whole,
      `a cut at offset ${i} changed the output`,
    );
  }
});

test('stream-redactor: the region contract holds over many random split points (AC2)', () => {
  const withSecrets = [
    '2026-09-18T07:00:00Z job start',
    'export ANTHROPIC_API_KEY=sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF',
    'password:',
    '  hunter2hunter2hunter2',
    '{"client_secret": "abcdefghijklmnop"}',
    'Authorization: Bearer abcdefghijklmnopqrstuvwx',
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIBOgIBAAJBAKj34GkxFhD',
    '-----END RSA PRIVATE KEY-----',
    'job done',
    '',
  ].join('\n');
  const inert = ['line one', 'line two', '', 'line four ends here', ''].join('\n');
  const expected = redactOnly(withSecrets);
  assert.notEqual(expected, withSecrets, 'the property input must actually contain secrets');
  assert.equal(redactOnly(inert), inert, 'the reconstruction input must be inert');

  // A deterministic PRNG, so a failing split point is reproducible from the
  // test alone and CI never flakes.
  let seed = 0x2f6e2b1;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let run = 0; run < 200; run += 1) {
    /** @type {number[]} */
    const cuts = [];
    for (let k = 0; k < 1 + rand(5); k += 1) cuts.push(rand(withSecrets.length + 1));
    cuts.sort((a, b) => a - b);
    const chop = (text) => {
      const parts = [];
      let at = 0;
      for (const cut of cuts) {
        const bounded = Math.min(cut, text.length);
        parts.push(text.slice(at, bounded));
        at = bounded;
      }
      parts.push(text.slice(at));
      return parts;
    };
    const chunked = chop(withSecrets);
    assert.equal(chunked.join(''), withSecrets, `run ${run}: the split itself lost input`);
    assert.equal(
      streamThrough(chunked),
      expected,
      `run ${run}: region-wise scanning disagreed with scanning the whole text`,
    );
    assert.equal(
      streamThrough(chop(inert)),
      inert,
      `run ${run}: inert input was not reconstructed exactly`,
    );
  }
});

test('stream-redactor: STREAM_REGION_MAX bounds the buffer and forces a cut (AC4)', () => {
  const max = ScanLimits.STREAM_REGION_MAX;
  assert.equal(max, 32 * 1024);
  assert.ok(
    max * 4 < ScanLimits.SCAN_MAX_BYTES,
    'a region must never reach the detector oversized path and blank real log output',
  );
  // One unbroken line: no accepted cut point exists anywhere in it.
  const line = 'a'.repeat(max * 2 + 7);
  const redactor = createStreamRedactor();
  const emitted = redactor.push(line);
  assert.equal(emitted.length, max * 2, 'forced cuts must land at exactly STREAM_REGION_MAX');
  const rest = redactor.end();
  assert.equal(rest.length, 7, 'the buffer never held more than STREAM_REGION_MAX characters');
  assert.equal(emitted + rest, line, 'the input is reconstructed exactly through forced cuts');
});

test('stream-redactor: push and end are total for every degenerate input (AC5)', () => {
  const redactor = createStreamRedactor();
  for (const bad of [undefined, null, 42, {}, [], true, Symbol.iterator]) {
    assert.equal(redactor.push(bad), '', 'a non-string push contributes nothing');
  }
  assert.equal(redactor.push(''), '');
  assert.equal(redactor.end(), '', 'end() on an untouched redactor returns the empty string');
  assert.equal(redactor.end(), '', 'a second end() returns the empty string');
  // A push after end() is a programming error: served as if the redactor were
  // fresh, never a throw.
  assert.equal(redactor.push('plain line\n'), 'plain line\n');
  assert.equal(redactor.end(), '');
});

test('stream-redactor: two instances share no state (AC5)', () => {
  const a = createStreamRedactor();
  const b = createStreamRedactor();
  assert.equal(a.push('password:'), '', 'a blocked cut holds the text in its own buffer');
  assert.equal(b.push('an unrelated line\n'), 'an unrelated line\n');
  assert.equal(b.end(), '');
  assert.equal(a.push('\n  hunter2hunter2hunter2\n'), redactOnly('password:\n  hunter2hunter2hunter2\n'));
  assert.equal(a.end(), '');
});
