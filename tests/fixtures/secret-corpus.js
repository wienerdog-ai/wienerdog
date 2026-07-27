'use strict';

/**
 * Corpora for the secret-fence tests (WP-secret-fence-two-tier-detector).
 *
 * DATA AND PURE FUNCTIONS ONLY — no assertions live here. Every count is
 * asserted against Table C3 row C3-0 by `tests/unit/secret-fence.test.js`, not
 * hard-coded in this file.
 *
 *  - `CREDENTIALS` — Table C1: one generator per row of that table and no
 *    others. Each is `(rng) => string` drawing from an EXPLICIT alphabet; there
 *    are no literal sample tokens, because a single hand-written sample passes
 *    while the rule behind it leaks double digits of real keys.
 *  - `PROSE` — Table C2: one entry per row, in order, ids matching. Sanitized
 *    reproductions of measured classes plus the separator and A8-clause
 *    controls. No real credential and no verbatim sentence from any vault.
 *  - `CONTEXTS` — the four wrappers Table C1 names.
 *  - `caughtByShippedDetector` — the `today` column of the FN matrix.
 */

// --- the PRNG (Table C1, copy verbatim) -------------------------------------

/** @param {number} seed @returns {() => number} */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

/** Table C1's seed. One fresh RNG instance per matrix cell. */
const SEED = 0xc0ffee;

// --- explicit alphabets -----------------------------------------------------

const DIGIT = '0123456789';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = UPPER + LOWER + DIGIT; // [A-Za-z0-9]
const B64URL = ALNUM + '_-'; // [A-Za-z0-9_-]
const B64STD = UPPER + LOWER + DIGIT + '+/'; // the 64-char standard-base64 alphabet
const HEX = DIGIT + 'abcdef';
const BASE32 = UPPER + '234567'; // [A-Z2-7]
const UPPERNUM = UPPER + DIGIT; // [A-Z0-9]

/** @param {() => number} rng @param {string} alphabet @param {number} n @returns {string} */
function draw(rng, alphabet, n) {
  let out = '';
  for (let i = 0; i < n; i += 1) out += alphabet[Math.floor(rng() * alphabet.length)];
  return out;
}

// --- Table C1 — the credential fixtures -------------------------------------

/**
 * @typedef {{id:string, slash:boolean, gen:(rng:()=>number)=>string}} Credential
 * `slash` is Table C1's `/`? column: does the fixture's entropy-visible tail
 * draw from an alphabet containing `/`? Only a `slash` fixture can regress.
 */

/** @type {Credential[]} */
const CREDENTIALS = [
  { id: 'anthropic-api-key', slash: false, gen: (r) => `sk-ant-api03-${draw(r, B64URL, 93)}AA` },
  {
    id: 'openai-legacy',
    slash: false,
    gen: (r) => `sk-${draw(r, ALNUM, 20)}T3BlbkFJ${draw(r, ALNUM, 20)}`,
  },
  {
    id: 'openai-proj',
    slash: false,
    gen: (r) => `sk-proj-${draw(r, B64URL, 74)}T3BlbkFJ${draw(r, B64URL, 74)}`,
  },
  { id: 'github-pat', slash: false, gen: (r) => `ghp_${draw(r, ALNUM, 36)}` },
  { id: 'github-oauth', slash: false, gen: (r) => `gho_${draw(r, ALNUM, 36)}` },
  { id: 'github-fine-grained', slash: false, gen: (r) => `github_pat_${draw(r, B64URL, 82)}` },
  { id: 'gitlab-pat', slash: false, gen: (r) => `glpat-${draw(r, B64URL, 20)}` },
  { id: 'gitlab-oauth-secret', slash: false, gen: (r) => `gloas-${draw(r, B64URL, 64)}` },
  {
    id: 'slack-bot-token',
    slash: false,
    gen: (r) => `xoxb-${draw(r, DIGIT, 12)}-${draw(r, DIGIT, 12)}-${draw(r, ALNUM, 24)}`,
  },
  { id: 'aws-access-key-id', slash: false, gen: (r) => `AKIA${draw(r, BASE32, 16)}` },
  { id: 'google-api-key', slash: false, gen: (r) => `AIza${draw(r, B64URL, 35)}` },
  { id: 'google-oauth-ya29', slash: false, gen: (r) => `ya29.${draw(r, B64URL, 60)}` },
  { id: 'google-client-secret', slash: false, gen: (r) => `GOCSPX-${draw(r, B64URL, 28)}` },
  { id: 'google-refresh-token', slash: false, gen: (r) => `1//0${draw(r, B64URL, 60)}` },
  { id: 'stripe-secret', slash: false, gen: (r) => `sk_live_${draw(r, ALNUM, 24)}` },
  { id: 'sendgrid', slash: false, gen: (r) => `SG.${draw(r, B64URL, 66)}` },
  { id: 'twilio-key-sid', slash: false, gen: (r) => `SK${draw(r, HEX, 32)}` },
  { id: 'mailgun-private', slash: false, gen: (r) => `key-${draw(r, HEX, 32)}` },
  { id: 'npm-token', slash: false, gen: (r) => `npm_${draw(r, ALNUM, 36)}` },
  { id: 'pypi-token', slash: false, gen: (r) => `pypi-AgEIcHlwaS5vcmc${draw(r, B64URL, 60)}` },
  { id: 'vault-service', slash: false, gen: (r) => `hvs.${draw(r, B64URL, 90)}` },
  { id: 'atlassian', slash: false, gen: (r) => `ATATT3${draw(r, `${ALNUM}_=-`, 186)}` },
  { id: 'databricks', slash: false, gen: (r) => `dapi${draw(r, HEX, 32)}` },
  { id: 'doppler', slash: false, gen: (r) => `dp.pt.${draw(r, ALNUM, 43)}` },
  { id: 'linear', slash: false, gen: (r) => `lin_api_${draw(r, ALNUM, 40)}` },
  { id: 'postman', slash: false, gen: (r) => `PMAK-${draw(r, HEX, 24)}-${draw(r, HEX, 34)}` },
  { id: 'shopify', slash: false, gen: (r) => `shpat_${draw(r, HEX, 32)}` },
  { id: 'square', slash: false, gen: (r) => `EAAA${draw(r, B64URL, 56)}` },
  {
    id: 'telegram-bot',
    slash: false,
    gen: (r) => `${draw(r, DIGIT, 10)}:A${draw(r, B64URL, 34)}`,
  },
  {
    id: 'jwt',
    slash: false,
    gen: (r) => `eyJ${draw(r, B64URL, 20)}.eyJ${draw(r, B64URL, 30)}.${draw(r, B64URL, 40)}`,
  },
  {
    id: 'private-key-block',
    slash: false,
    gen: (r) =>
      `-----BEGIN RSA PRIVATE KEY-----\n${draw(r, ALNUM, 60)}\n-----END RSA PRIVATE KEY-----`,
  },
  // The bold rows: an entropy-visible tail drawn from an alphabet with `/`.
  { id: 'aws-secret-access-key', slash: true, gen: (r) => draw(r, B64STD, 40) },
  { id: 'aws-secret-access-key-64', slash: true, gen: (r) => draw(r, B64STD, 64) },
  {
    id: 'authress-client-key',
    slash: true,
    gen: (r) =>
      `sc_${draw(r, `${LOWER}${DIGIT}`, 12)}.${draw(r, `${LOWER}${DIGIT}`, 5)}` +
      `.acc_${draw(r, `${LOWER}${DIGIT}-`, 16)}.${draw(r, `${LOWER}${DIGIT}+/_=-`, 30)}`,
  },
  { id: 'grafana-cloud-token', slash: true, gen: (r) => `glc_${draw(r, B64STD, 32)}` },
  { id: 'kraken-access-token', slash: true, gen: (r) => draw(r, `${LOWER}${DIGIT}/=_+-`, 88) },
  {
    id: 'jwt-standard-base64',
    slash: true,
    gen: (r) => `eyJ${draw(r, B64STD, 20)}.eyJ${draw(r, B64STD, 30)}.${draw(r, B64STD, 40)}`,
  },
  {
    id: 'slack-webhook-url',
    slash: true,
    gen: (r) =>
      `https://hooks.slack.com/services/T${draw(r, UPPERNUM, 8)}` +
      `/B${draw(r, UPPERNUM, 8)}/${draw(r, ALNUM, 24)}`,
  },
  {
    id: 'authorization-basic',
    slash: true,
    gen: (r) => `Authorization: Basic ${draw(r, B64STD, 40)}`,
  },
];

// --- the four contexts (Table C1) -------------------------------------------

/** @type {{id:string, wrap:(t:string)=>string}[]} */
const CONTEXTS = [
  { id: 'bare', wrap: (t) => `blob ${t} end` },
  { id: 'assign', wrap: (t) => `secret=${t}` },
  { id: 'prose', wrap: (t) => `the key is ${t} ok` },
  { id: 'table', wrap: (t) => `| token | ${t} | ok |` },
];

// --- Table C2 — the prose corpus --------------------------------------------

// Rows 26, 27, 28 and 34 are markdown table rows ABOUT markdown table rows: the
// vertical bars below are single unescaped characters, and row 34 carries two
// adjacent ones. Rows 36, 41 and 44 carry real backtick/quote bytes — the quote
// characters the rows exist to count. Row 38 carries one real newline.

/** @typedef {{id:number, text:string}} ProseRow */

/** @type {ProseRow[]} */
const PROSE = [
  { id: 1, text: 'see [[01-Projects/wienerdog/current-state]] for detail' },
  { id: 2, text: 'the note lives at 02-Areas/second-brain/tooling-notes now' },
  { id: 3, text: 'path /Users/example/Documents/Claude_Projects/thing here' },
  { id: 4, text: 'binary /opt/homebrew/bin/example-cli --profile default' },
  { id: 5, text: 'agent /Library/LaunchAgents/com.example.job.plist loaded' },
  { id: 6, text: 'script koltsegvetes/analysis/scripts/fetch_sheet ran' },
  { id: 7, text: 'config deployment/daemon/trading_daemon_configuration' },
  { id: 8, text: 'release github.com/example/project/releases/tag/v0.9.1' },
  { id: 9, text: 'docs docs/marketing/articles/hackernews-launch.md edited' },
  { id: 10, text: 'ID-token signature verification (aud/iss/exp/verified/exact-domain) ok' },
  { id: 11, text: 'the refresh_token path self-heals (damaged/missing/broken/ok)' },
  {
    id: 12,
    text:
      'the wienerdog Google-token (drive.readonly) is primary — ' +
      'koltsegvetes/analysis/scripts/x',
  },
  { id: 13, text: 'a credential bug: PATH omits ~/.local/bin, not /opt/homebrew/bin/claude' },
  { id: 14, text: 'Train 5 independent GradientBoostingClassifier models per horizon' },
  { id: 15, text: 'call generateCodeVerifierAsync before the redirect' },
  { id: 16, text: 'session 019f819d-6aea-7950-b28e-9f26b7718c08 resumed' },
  { id: 17, text: 'json {"uuid":"b593bdb9-a85e-431b-b9fe-8f564994c09b","tokens":20685}' },
  { id: 18, text: 'daily note 05-Daily/2026/07/2026-07-24-morning-review saved' },
  { id: 19, text: 'env order is WIENERDOG_HOME+HOME+CLAUDE_CONFIG_DIR+CODEX_HOME' },
  { id: 20, text: 'see Documentation=RepositoryConfiguration end' },
  { id: 21, text: 'the constant ABCDEFGHABCDEFGHABCDEFGHABCDEFGH appears in prose' },
  { id: 22, text: 'padding deadbeefdeadbeefdeadbeefdeadbeefdeadbeef end' },
  { id: 23, text: '[REDACTED:aws_secret_access_key] [REDACTED:high-entropy]' },
  { id: 24, text: 'source https://www.example.gov/releases/consumerpriceinflationukjuly2025' },
  { id: 25, text: 'run id 7KpQm2XvR9tWcZbN4dYfGh3L logged' },
  { id: 26, text: '| secret | Projects/example/wienerdog/current-state |' },
  {
    id: 27,
    text:
      '| `shasum -a 256 src/core/secret-scan.js` | ' +
      '`be54813a2602a78822e939663ab31c3eff164261` |',
  },
  { id: 28, text: '| modify | src/core/secret-scan.js | one canonical alphabet declaration |' },
  { id: 29, text: 'apiKey := "q7PmXz4KvR9tWc2LbN8dYfGhJ3xA5uEw"' },
  { id: 30, text: "'secret_key' => 'Kf3nQ8xW2mZr7Ld5Vp1Ty9Bc4Hs6Jg0A'" },
  { id: 31, text: 'API_TOKEN ?= Zx4Qm8LpR2vT7yNb5Wc1KdJ9Hs3Ag6Ue' },
  {
    id: 32,
    text:
      "const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
      "abcdefghijklmnopqrstuvwxyz0123456789+/='",
  },
  { id: 33, text: 'the session token, q7PmXz4KvR9tWc2LbN8dYfGh, expires on Friday' },
  { id: 34, text: '| secret || be54813a2602a78822e939663ab31c3eff164261 |' },
  { id: 35, text: 'the token rotation runbook lives here: Rt6Yh2Nk9Pw4Jm7Vx3Bq5Zd8' },
  { id: 36, text: 'credential ("legacy"): `Projects/example/wienerdog/current-state`' },
  {
    id: 37,
    text:
      'the authorization runbook and its rotation checklist here: ' +
      'Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6',
  },
  {
    id: 38,
    text:
      'rotate the authorization token before Friday:\n' +
      'Projects/example/wienerdog/current-state is unaffected',
  },
  { id: 39, text: 'the authorization checklist: see Jd4Vn8Sc2Mq6Bx1Zt5Wf9Hk3 for detail' },
  { id: 40, text: 'the authorization digest of the file == Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6' },
  { id: 41, text: 'the authorization value: `"Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6"` documented' },
  { id: 42, text: 'credential_path: Projects/example/wienerdog/current-state' },
  { id: 43, text: 'token_id: 019f819d6aea7950b28e9f26b7718c08' },
  { id: 44, text: 'the authorization quoted JSON sample `": Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6' },
];

// --- the `today` column of the FN matrix (Table C3 row C3-7) -----------------

// The shipped detector at `efd1489` = the same eighteen labelled rules this WP
// keeps (it changes their SEVERITY only, which a catch RATE cannot see) plus a
// CONTEXT-FREE entropy pass over `[A-Za-z0-9+/=]{24,}` at the same floor. The
// labelled half is therefore observed through the shared module, minus the one
// label this WP ADDS (`basic-auth`, Table A row A16); the entropy half is the
// four lines below. Nothing here regenerates a baseline from a fixture corpus —
// the numbers this reference reproduces are Table C3 row C3-3's transcribed
// constants, which the test checks it against.

const SHIPPED_ENTROPY_MIN_LEN = 24;
const SHIPPED_ENTROPY_MIN_BITS_PER_CHAR = 3.5;
const SHIPPED_CANDIDATE = new RegExp(
  `[A-Za-z0-9+/=]{${SHIPPED_ENTROPY_MIN_LEN},}`,
  'g',
);

/** Shannon entropy in bits per character over the run. @param {string} run @returns {number} */
function bitsPerChar(run) {
  const freq = new Map();
  for (let i = 0; i < run.length; i += 1) {
    const ch = run[i];
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  let bits = 0;
  for (const n of freq.values()) {
    const p = n / run.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** True iff the SHIPPED context-free entropy pass fires on `text`.
 *  @param {string} text @returns {boolean} */
function shippedEntropyFires(text) {
  const matches = String(text).match(SHIPPED_CANDIDATE) || [];
  return matches.some((run) => bitsPerChar(run) >= SHIPPED_ENTROPY_MIN_BITS_PER_CHAR);
}

/** True iff the shipped detector produced ANY finding for `text`.
 *  @param {import('../../src/core/secret-scan').Finding[]} proposedFindings
 *         `scanAndRedact(text).findings` under THIS WP
 *  @param {string} text
 *  @returns {boolean} */
function caughtByShippedDetector(proposedFindings, text) {
  const labelled = proposedFindings.some(
    (f) => f.label !== 'high-entropy' && f.label !== 'basic-auth',
  );
  return labelled || shippedEntropyFires(text);
}

module.exports = {
  makeRng,
  SEED,
  CREDENTIALS,
  CONTEXTS,
  PROSE,
  bitsPerChar,
  shippedEntropyFires,
  caughtByShippedDetector,
};
