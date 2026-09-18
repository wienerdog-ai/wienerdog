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

test('stream-redactor: adversarial chunk shapes cost a bounded time PER BYTE', () => {
  // Table B prices the adversarial shapes as bounded work. The RATE is what has
  // to be asserted, not a total: the way row S2 goes super-linear here is
  // walking back to the keyword through the whitespace run at every newline in
  // it instead of indexing past the run, which is quadratic IN THE RUN — so a
  // one-region bait against a combined budget cannot see it. Each bait is
  // therefore at least 256 KiB and is timed on its own. Confirmed non-vacuous:
  // this test goes red against the walking row S2 this package first shipped.
  const KIB = 1024;
  const baits = {
    // The shape that actually stalled: a keyword, then one enormous whitespace
    // run. Row S2 must look back across all of it, at every newline in it.
    'keyword + 256 KiB whitespace run': `password:${'\n'.repeat(256 * KIB)}`,
    // Plain blank lines, as `yes ''` emits them.
    "plain blank lines, 256 KiB (`yes ''`)": '\n'.repeat(256 * KIB),
    'CRLF blank lines, 256 KiB': '\r\n'.repeat(128 * KIB),
    'every line ends in an open binder, 256 KiB': 'token:\n'.repeat(Math.ceil((256 * KIB) / 7)),
    'one unbroken line, 256 KiB': 'a'.repeat(256 * KIB),
    'never-closed private key, 256 KiB': `-----BEGIN RSA PRIVATE KEY-----\n${'MIIBOgIBAAJBAKj\n'.repeat(17000)}`,
    'never-closed quoted value, 256 KiB': `"token":${'"x'.repeat(128 * KIB)}`,
  };
  // Generous by ~20x against the slowest bait measured on this tree, so the
  // assertion catches a return to quadratic rather than ordinary CI jitter.
  const maxMicrosPerChar = 1;
  for (const [name, bait] of Object.entries(baits)) {
    assert.ok(bait.length >= 256 * KIB, `${name}: bait must be at least 256 KiB`);
    const started = process.hrtime.bigint();
    const redactor = createStreamRedactor();
    let out = '';
    for (let i = 0; i < bait.length; i += 4096) out += redactor.push(bait.slice(i, i + 4096));
    out += redactor.end();
    const microsPerChar = Number(process.hrtime.bigint() - started) / 1e3 / bait.length;
    assert.equal(out.length, bait.length, `${name}: every byte must come back`);
    assert.ok(
      microsPerChar < maxMicrosPerChar,
      `${name}: ${microsPerChar.toFixed(3)} us/char exceeds ${maxMicrosPerChar} us/char`,
    );
  }
});

// --- round-1 review reproductions (both were real leaks) ---

test('stream-redactor: a closing quote that also opens the next sensitive key keeps the cut blocked', () => {
  // Review finding [P1]. Resuming one character PAST the closing quote skipped
  // an opener that begins AT that quote, so row S3 reported "nothing open", the
  // cut landed inside `client_secret`'s value, and the value reached the log raw
  // even though scanning the same bytes whole redacts it.
  const parts = ['"token":"x"client_secret": "abc\n', 'defghijkl"\n'];
  const whole = redactOnly(parts.join(''));
  assert.ok(whole.includes('[REDACTED:client_secret]'), 'fixture must redact when scanned whole');
  assert.ok(!whole.includes('abc\ndefghijkl'), 'fixture must not leave the value in the whole scan');
  assert.equal(streamThrough(parts), whole, 'S3-no-open-quoted-value-at-a-cut');
});

test('stream-redactor: a completed sensitive value before the bound still offers its safe cut', () => {
  // Review finding [P2], and the reason row S2 carries NO look-back bound.
  // Refusing a cut is NOT fail-closed: the fallback to a refused cut is the
  // FORCED cut, which can land inside a secret that the refused cut would have
  // kept whole. Here the JSON value closes at offset 32749 — a safe cut — and a
  // bounded S2 refused it, so the forced cut at STREAM_REGION_MAX split the key
  // on the following line and returned it raw.
  const key = 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFF';
  const text = `"client_secret":"${'\n'.repeat(32730)}"\n${key}\n`;
  const whole = redactOnly(text);
  assert.ok(!whole.includes(key), 'fixture must redact the key when scanned whole');
  const redactor = createStreamRedactor();
  const out = redactor.push(text) + redactor.end();
  assert.ok(!out.includes(key), 'the key must not reach the log in one piece');
  assert.equal(out, whole, 'S2-no-open-key-binder-at-a-cut');
});

/** Row S2's binder applied NAIVELY — to the whole prefix, with no window and no
 *  collapsing. Built from the detector's OWN source text so the two alternations
 *  cannot drift apart: a rename or respelling makes the extraction fail loudly
 *  instead of quietly narrowing the oracle. */
function naiveRowS2Reference() {
  const fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../../src/core/secret-scan'), 'utf8');
  const keys = /^const SENSITIVE_KEYS =\s*\n\s*'([^']+)';$/m.exec(src);
  const sep = /^const SEP = \/(.*)\/\.source;$/m.exec(src);
  assert.ok(keys, 'could not read SENSITIVE_KEYS out of the detector source');
  assert.ok(sep, 'could not read SEP out of the detector source');
  return {
    binder: new RegExp(
      `(?:${keys[1]}|authorization)["'\`]?(?:\\s*(?:${sep[1]})\\s*|\\s*)["'\`]?$`,
      'i',
    ),
    jsonOpen: new RegExp(`"(?:${keys[1]})"\\s*:\\s*"`),
  };
}

test('stream-redactor: row S2 agrees with the naive whole-prefix binder at every candidate', () => {
  // The collapsed window and the `CUT_BINDER_LOOKBACK` truncation are claimed to
  // be EXACT, not conservative. This is that claim under fuzz: for every
  // candidate cut in every generated prefix, "the redactor accepted here" must
  // equal "the naive binder finds nothing open here". Whitespace runs longer
  // than the look-back — and longer than the 1024-character bound this package
  // used to carry — are generated on purpose, because that is precisely where a
  // windowed or bounded row S2 diverges from the naive one.
  const ref = naiveRowS2Reference();
  const PEM_OPEN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  let seed = 0x5eed1;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const pick = (a) => a[rand(a.length)];
  const keywords = [
    'password', 'passwd', 'token', 'secret', 'client_secret', 'refresh_token',
    'access_token', 'api_key', 'api-key', 'apikey', 'credentials', 'credential',
    'bearer', 'authorization', 'aws_secret_access_key', 'TOKEN', 'Password',
  ];
  const seps = [':', '=', '>', '=>', '?=', ':=', '::=', ':::='];
  const quotes = ['"', "'", '`'];
  const fillers = ['ab', 'xyz', 'log', '7', 'q9', 'msg', 'id', 'ok'];
  // Weighted toward line breaks: every `\n` in a text is another candidate cut,
  // and a long run of them is the case the window has to get right.
  const wsUnits = [' ', '\t', '\n', '\n', '\n', '\r\n', '\r\n'];
  const whitespaceRun = () => {
    const roll = rand(100);
    // 1100 clears the retired 1024-character bound; 200 clears the look-back.
    const n = roll < 4 ? 1100 + rand(200) : roll < 12 ? 200 + rand(60) : 1 + rand(4);
    return pick(wsUnits).repeat(n);
  };
  const token = () => {
    switch (rand(5)) {
      case 0: return pick(keywords);
      case 1: return pick(seps);
      case 2: return pick(quotes);
      case 3: return pick(fillers);
      default: return whitespaceRun();
    }
  };

  // Fed one character at a time, the redactor tests exactly one new candidate
  // per `push` (everything below is already on the rejected watermark) and so
  // closes at most one region per `push`. That makes the cut offsets directly
  // observable, and each one is a separate verdict to check — comparing only
  // the total consumed would miss a wrong verdict that another cut compensates
  // for, which is how a bounded row S2 hides.
  const naiveCuts = (text) => {
    const cuts = [];
    let base = 0;
    for (let i = 1; i <= text.length; i += 1) {
      if (text.charCodeAt(i - 1) !== 10 || i <= base) continue;
      // Row S2 is a statement about the BUFFERED prefix, so that is what the
      // naive binder is applied to — whole, with no window and no collapsing.
      if (!ref.binder.test(text.slice(base, i))) {
        cuts.push(i);
        base = i;
      }
    }
    return cuts;
  };

  let prefixes = 0;
  let texts = 0;
  let longRuns = 0;
  for (let attempt = 0; attempt < 4000 && prefixes < 6000; attempt += 1) {
    let text = '';
    for (let n = 6 + rand(14); n > 0; n -= 1) text += token();
    text += '\n';
    // Rows S1 and S2 alone must decide the cut, and a region's emitted length
    // must equal its input length: so no open quoted value, no private key, and
    // nothing the detector redacts.
    if (ref.jsonOpen.test(text) || PEM_OPEN.test(text)) continue;
    if (redactOnly(text) !== text) continue;
    texts += 1;
    if (/\s{1025,}/.test(text)) longRuns += 1;
    const redactor = createStreamRedactor();
    const observed = [];
    let consumed = 0;
    for (let i = 0; i < text.length; i += 1) {
      const out = redactor.push(text[i]);
      if (out.length > 0) {
        consumed += out.length;
        observed.push(consumed);
      }
      if (text.charCodeAt(i) === 10) prefixes += 1;
    }
    assert.deepEqual(
      observed,
      naiveCuts(text),
      `row S2 disagreed with the naive binder somewhere in ${JSON.stringify(text)}`,
    );
  }
  assert.ok(prefixes >= 5000, `fuzz corpus too small: ${prefixes} prefixes over ${texts} texts`);
  assert.ok(longRuns > 0, 'corpus must contain whitespace runs past the retired 1024 bound');
});
