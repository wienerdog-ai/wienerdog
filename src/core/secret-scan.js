'use strict';

/**
 * The ONE shared secret detector (audit A5, ADR-0024). Pure: no fs, no env,
 * no argv, no network. Total and fail-closed: every degraded path returns a
 * fixed withheld marker plus a quarantine finding — never the raw text, never
 * a throw. Findings are metadata-only ({label, severity, count}); the matched
 * bytes are never stored on a finding.
 *
 * Rule ordering is load-bearing: the legacy transcript REDACTIONS pipeline
 * (WP-008) runs first, verbatim, so `redactOnly` stays byte-compatible for
 * every input the old list already covered; the A5 additive coverage (JSON
 * values, extended assignment keys, new provider prefixes, high-entropy)
 * runs after it and only ever touches what the legacy pass left behind.
 */

/**
 * Bounded-scan limits (audit A5, ADR-0024). Values OWNER-APPROVED — see the
 * WP-122 spec's OWNER-APPROVED block. Named so the tests import ONE definition.
 */
const ScanLimits = {
  SCAN_MAX_BYTES: 256 * 1024, // a text longer than this is NOT regex-scanned
  ENTROPY_MIN_LEN: 24, // a contextual high-entropy candidate must be at least this long
  ENTROPY_MIN_BITS_PER_CHAR: 3.5, // Shannon bits/char over the candidate to count as high-entropy
};

/** @typedef {'redact'|'quarantine'} Severity
 *  redact     — the match is replaced inline by [REDACTED:<label>]; surrounding text kept.
 *  quarantine — a HARD finding (private key, credential-grade match, high-entropy blob):
 *               a persistence gate withholds/reverts the WHOLE artifact, never commits the
 *               [REDACTED]-mutated prose. */
const SEVERITY = { REDACT: 'redact', QUARANTINE: 'quarantine' };

/** @typedef {{label:string, severity:Severity, count:number}} Finding
 *  Metadata ONLY — the raw matched secret is NEVER stored on a finding. */

const OVERSIZED_MARKER = '[wienerdog: oversized content withheld from secret scan]';
const SCAN_ERROR_MARKER = '[wienerdog: secret scan failed — content withheld]';

// Sensitive assignment/JSON keys, longest-first so the alternation always
// prefers the most specific key (client_secret over secret, etc.).
const SENSITIVE_KEYS =
  'aws_secret_access_key|aws_session_token|client_secret|refresh_token|access_token|api[_-]?key|credentials?|password|passwd|secret|token|bearer';

// Keys whose value is credential-grade on its own → the finding keeps the key
// name as its label; everything else folds into the legacy 'generic-secret'.
const SPECIFIC_KEY_LABELS = new Set([
  'aws_secret_access_key',
  'aws_session_token',
  'client_secret',
  'refresh_token',
  'access_token',
]);

// AWS *secret* material has no safe partial redaction context → hard finding.
const QUARANTINE_KEYS = new Set(['aws_secret_access_key', 'aws_session_token']);

/** @param {string} key matched sensitive key @returns {string} finding label */
function labelForKey(key) {
  const normalized = key.toLowerCase().replace(/-/g, '_');
  return SPECIFIC_KEY_LABELS.has(normalized) ? normalized : 'generic-secret';
}

/** @param {string} key matched sensitive key @returns {Severity} */
function severityForKey(key) {
  const normalized = key.toLowerCase().replace(/-/g, '_');
  return QUARANTINE_KEYS.has(normalized) ? SEVERITY.QUARANTINE : SEVERITY.REDACT;
}

/**
 * @param {RegExp} pattern
 * @param {string} label
 * @param {Severity} severity
 * @returns {(text:string, add:(label:string, severity:Severity)=>void)=>string}
 */
function simpleRule(pattern, label, severity) {
  return (text, add) =>
    text.replace(pattern, () => {
      add(label, severity);
      return `[REDACTED:${label}]`;
    });
}

// Every pattern is linear-time: single character-class quantifiers only, no
// nested unbounded quantifiers, and the input is byte-bounded before any rule
// runs (property-tested with backtracking bait).
const RULES = [
  // --- legacy pipeline (WP-008), byte-compatible, order preserved ---
  simpleRule(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    'private-key',
    SEVERITY.QUARANTINE,
  ),
  // No leading \b anywhere below: a token glued to a preceding word character
  // must still match (the audit's explicit bypass case).
  simpleRule(/sk-ant-[A-Za-z0-9\-_]{20,}/g, 'anthropic-key', SEVERITY.REDACT),
  simpleRule(/sk-proj-[A-Za-z0-9_]{16,}/g, 'openai-key', SEVERITY.REDACT),
  simpleRule(/sk-[A-Za-z0-9_]{20,}/g, 'openai-key', SEVERITY.REDACT),
  simpleRule(/AKIA[0-9A-Z]{12,}/g, 'aws-key', SEVERITY.REDACT),
  simpleRule(/gh[pousr]_[A-Za-z0-9]{36,}/g, 'github-token', SEVERITY.REDACT),
  simpleRule(/xox[baprs]-[A-Za-z0-9-]{10,}/g, 'slack-token', SEVERITY.REDACT),
  simpleRule(/ya29\.[A-Za-z0-9\-_]+/g, 'google-oauth', SEVERITY.REDACT),
  simpleRule(
    /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    'jwt',
    SEVERITY.REDACT,
  ),
  // HTTP auth headers: "Authorization: Bearer <token>" (space-separated form)
  (text, add) =>
    text.replace(/\b(bearer)\s+[A-Za-z0-9_\-.~+/]{12,}=*/gi, (_m, kw) => {
      add('bearer-token', SEVERITY.REDACT);
      return `${kw} [REDACTED:bearer-token]`;
    }),
  // Legacy sensitive key=value / key: value assignments (keeps key, redacts value)
  (text, add) =>
    text.replace(
      /\b(api[_-]?key|secret|token|password|passwd|bearer)(["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-]{12,}/gi,
      (_m, key, sep) => {
        add('generic-secret', SEVERITY.REDACT);
        return `${key}${sep}[REDACTED:generic-secret]`;
      },
    ),
  // --- A5 additive coverage (runs only on what the legacy pass left) ---
  // Structured JSON string values under a sensitive key: "client_secret":"…"
  (text, add) =>
    text.replace(
      new RegExp(`"(${SENSITIVE_KEYS})"(\\s*:\\s*)"([^"\\\\]{8,})"`, 'gi'),
      (match, key, sep, value) => {
        if (value.includes('[REDACTED:')) return match; // already handled upstream
        const label = labelForKey(key);
        add(label, severityForKey(key));
        return `"${key}"${sep}"[REDACTED:${label}]"`;
      },
    ),
  // Extended assignments: uppercase/specific keys the legacy list missed, values
  // that may be quoted / base64 / URL-charactered, keys glued to a word char.
  (text, add) =>
    text.replace(
      new RegExp(`(${SENSITIVE_KEYS})(["']?\\s*[:=]\\s*["']?)[A-Za-z0-9_\\-./+=~]{12,}`, 'gi'),
      (_m, key, sep) => {
        const label = labelForKey(key);
        add(label, severityForKey(key));
        return `${key}${sep}[REDACTED:${label}]`;
      },
    ),
  // New provider prefixes (after the key-context rules so a key-labelled
  // finding wins when both would match).
  simpleRule(/GOCSPX-[A-Za-z0-9\-_]{16,}/g, 'google-client-secret', SEVERITY.REDACT),
  simpleRule(/1\/\/0[A-Za-z0-9\-_=]{8,}/g, 'google-refresh-token', SEVERITY.REDACT),
  simpleRule(/AIza[A-Za-z0-9\-_]{30,}/g, 'google-api-key', SEVERITY.REDACT),
  simpleRule(/(?:sk|rk)_live_[A-Za-z0-9]{10,}/g, 'stripe-secret-key', SEVERITY.QUARANTINE),
  simpleRule(/pk_live_[A-Za-z0-9]{10,}/g, 'stripe-key', SEVERITY.REDACT),
];

const ENTROPY_CANDIDATE = new RegExp(`[A-Za-z0-9+/=]{${ScanLimits.ENTROPY_MIN_LEN},}`, 'g');

/** Shannon entropy in bits per character over the run. @param {string} run */
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

/**
 * Contextual high-entropy pass: a base64/hex run of >= ENTROPY_MIN_LEN chars
 * with >= ENTROPY_MIN_BITS_PER_CHAR that no labelled rule already replaced is
 * an unstructured secret candidate — no safe partial redaction, so QUARANTINE.
 * @param {string} text
 * @param {(label:string, severity:Severity)=>void} add
 * @returns {string}
 */
function entropyPass(text, add) {
  return text.replace(ENTROPY_CANDIDATE, (run) => {
    if (bitsPerChar(run) < ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return run;
    add('high-entropy', SEVERITY.QUARANTINE);
    return '[REDACTED:high-entropy]';
  });
}

/**
 * Scan `text` for secret-looking substrings, returning a sanitized copy plus
 * metadata-only findings. TOTAL and FAIL-CLOSED:
 *  - Non-string input → treated as '' → { text:'', findings:[] }.
 *  - text over SCAN_MAX_BYTES → NOT scanned; returns the fixed oversized
 *    withheld marker and one {label:'oversized', severity:'quarantine'} finding.
 *  - Any internal error → the fixed scan-failed withheld marker and one
 *    {label:'scan-error', severity:'quarantine'} finding. Never the raw text,
 *    never a throw.
 * @param {string} text
 * @returns {{text:string, findings:Finding[]}}
 */
function scanAndRedact(text) {
  try {
    if (typeof text !== 'string' || text.length === 0) return { text: '', findings: [] };
    if (Buffer.byteLength(text, 'utf8') > ScanLimits.SCAN_MAX_BYTES) {
      return {
        text: OVERSIZED_MARKER,
        findings: [{ label: 'oversized', severity: SEVERITY.QUARANTINE, count: 1 }],
      };
    }
    /** @type {Map<string, Finding>} */
    const findings = new Map();
    const add = (label, severity) => {
      const existing = findings.get(label);
      if (existing) existing.count += 1;
      else findings.set(label, { label, severity, count: 1 });
    };
    let out = text;
    for (const rule of RULES) out = rule(out, add);
    out = entropyPass(out, add);
    return { text: out, findings: [...findings.values()] };
  } catch {
    return {
      text: SCAN_ERROR_MARKER,
      findings: [{ label: 'scan-error', severity: SEVERITY.QUARANTINE, count: 1 }],
    };
  }
}

/** Sanitized text only (back-compat for callers that don't consume findings).
 *  redactOnly(text) === scanAndRedact(text).text
 *  @param {string} text @returns {string} */
function redactOnly(text) {
  return scanAndRedact(text).text;
}

/** True iff any finding is QUARANTINE severity — the signal a persistence gate
 *  uses to withhold/revert the whole artifact.
 *  @param {Finding[]} findings @returns {boolean} */
function hasHardFinding(findings) {
  return (findings || []).some((f) => f.severity === SEVERITY.QUARANTINE);
}

module.exports = { scanAndRedact, redactOnly, hasHardFinding, ScanLimits, SEVERITY };
