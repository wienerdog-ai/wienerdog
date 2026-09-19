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
 * Bounded-scan limits (audit A5, ADR-0024). Named so the tests import ONE
 * definition. The four SCAN values are OWNER-APPROVED — see the WP-122 spec's
 * OWNER-APPROVED block. `STREAM_REGION_MAX` is NOT one of them: its value comes
 * from `WP-secret-stream-safe-cut-redactor` Table B (ADR-0043 decides the
 * mechanism but never names a number), adopted under standing authorization,
 * and nothing records the owner approving this value.
 */
const ScanLimits = {
  SCAN_MAX_BYTES: 256 * 1024, // a text longer than this is NOT regex-scanned
  ENTROPY_MIN_LEN: 24, // a contextual high-entropy candidate must be at least this long
  ENTROPY_MIN_BITS_PER_CHAR: 3.5, // Shannon bits/char over the candidate to count as high-entropy
  ENTROPY_CTX_FILLER_MAX: 20, // chars a sensitive keyword may sit before the separator it binds through
  // Table B: the most characters `createStreamRedactor` holds BETWEEN calls, and
  // so the longest region it hands to ONE `redactOnly` call. UTF-8 is at most 4
  // bytes per character, so 32768 * 4 = 131072 < SCAN_MAX_BYTES keeps every
  // region scannable and a region can never trip the oversized path. A `push`
  // appends before it cuts, so during a call the buffer transiently holds the
  // appended chunk on top of this.
  STREAM_REGION_MAX: 32 * 1024,
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

/** @param {string} key matched sensitive key @returns {string} finding label */
function labelForKey(key) {
  const normalized = key.toLowerCase().replace(/-/g, '_');
  return SPECIFIC_KEY_LABELS.has(normalized) ? normalized : 'generic-secret';
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
  simpleRule(/sk-ant-[A-Za-z0-9\-_]{20,}/g, 'anthropic-key', SEVERITY.QUARANTINE),
  simpleRule(/sk-proj-[A-Za-z0-9_]{16,}/g, 'openai-key', SEVERITY.QUARANTINE),
  simpleRule(/sk-[A-Za-z0-9_]{20,}/g, 'openai-key', SEVERITY.QUARANTINE),
  simpleRule(/AKIA[0-9A-Z]{12,}/g, 'aws-key', SEVERITY.QUARANTINE),
  simpleRule(/gh[pousr]_[A-Za-z0-9]{36,}/g, 'github-token', SEVERITY.QUARANTINE),
  simpleRule(/xox[baprs]-[A-Za-z0-9-]{10,}/g, 'slack-token', SEVERITY.QUARANTINE),
  simpleRule(/ya29\.[A-Za-z0-9\-_]+/g, 'google-oauth', SEVERITY.QUARANTINE),
  simpleRule(
    /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    'jwt',
    SEVERITY.QUARANTINE,
  ),
  // HTTP auth headers: "Authorization: Bearer <token>" (space-separated form)
  (text, add) =>
    text.replace(/\b(bearer)\s+[A-Za-z0-9_\-.~+/]{12,}=*/gi, (_m, kw) => {
      add('bearer-token', SEVERITY.QUARANTINE);
      return `${kw} [REDACTED:bearer-token]`;
    }),
  // Legacy sensitive key=value / key: value assignments (keeps key, redacts value)
  (text, add) =>
    text.replace(
      /\b(api[_-]?key|secret|token|password|passwd|bearer)(["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-]{12,}/gi,
      (_m, key, sep) => {
        add('generic-secret', SEVERITY.QUARANTINE);
        return `${key}${sep}[REDACTED:generic-secret]`;
      },
    ),
  // --- A5 additive coverage (runs only on what the legacy pass left) ---
  // Table A row A16: "Authorization: Basic <base64>" — the one published
  // credential class the two-tier entropy pass would otherwise stop catching at
  // all (the word `Basic` sits between the separator and the candidate, so no
  // context binds, and a standard-base64 body fragments on its slashes). FIRST
  // rule of the A5 additive block, so the legacy pipeline above stays
  // byte-compatible for every input it already covered.
  (text, add) =>
    text.replace(/\b(authorization:[ \t]*basic)[ \t]+[A-Za-z0-9+/]{8,}={0,2}/gi, (_m, kw) => {
      add('basic-auth', SEVERITY.QUARANTINE);
      return `${kw} [REDACTED:basic-auth]`;
    }),
  // Structured JSON string values under a sensitive key: "client_secret":"…"
  (text, add) =>
    text.replace(
      new RegExp(`"(${SENSITIVE_KEYS})"(\\s*:\\s*)"([^"\\\\]{8,})"`, 'gi'),
      (match, key, sep, value) => {
        if (value.includes('[REDACTED:')) return match; // already handled upstream
        const label = labelForKey(key);
        add(label, SEVERITY.QUARANTINE);
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
        add(label, SEVERITY.QUARANTINE);
        return `${key}${sep}[REDACTED:${label}]`;
      },
    ),
  // New provider prefixes (after the key-context rules so a key-labelled
  // finding wins when both would match).
  simpleRule(/GOCSPX-[A-Za-z0-9\-_]{16,}/g, 'google-client-secret', SEVERITY.QUARANTINE),
  simpleRule(/1\/\/0[A-Za-z0-9\-_=]{8,}/g, 'google-refresh-token', SEVERITY.QUARANTINE),
  simpleRule(/AIza[A-Za-z0-9\-_]{30,}/g, 'google-api-key', SEVERITY.QUARANTINE),
  simpleRule(/(?:sk|rk)_live_[A-Za-z0-9]{10,}/g, 'stripe-secret-key', SEVERITY.QUARANTINE),
  simpleRule(/pk_live_[A-Za-z0-9]{10,}/g, 'stripe-key', SEVERITY.QUARANTINE),
];

/** The ONE declaration of the entropy candidate alphabet. Tier 2 is Tier 1 plus
 *  `/`; both regexes are DERIVED from these two constants and are never written
 *  out by hand. `-` and `_` are absent from both, deliberately and as today. */
const ENTROPY_CORE_CLASS = 'A-Za-z0-9+=';
const ENTROPY_WIDE_EXTRA = '/';

// Tier 1 (A2): a delimiter-free run. Tier 2 (A3): the same run allowed to span
// `/`, i.e. exactly today's candidate. Both built from the two constants above.
const TIER1_CANDIDATE = new RegExp(
  `[${ENTROPY_CORE_CLASS}]{${ScanLimits.ENTROPY_MIN_LEN},}`,
  'g',
);
const TIER2_CANDIDATE = new RegExp(
  `[${ENTROPY_CORE_CLASS}${ENTROPY_WIDE_EXTRA}]{${ScanLimits.ENTROPY_MIN_LEN},}`,
  'g',
);

/** The ONE declaration of the separator TOKEN set — Table A row A8a decides its
 *  members; this line only spells them. Ordered LONGEST-FIRST as a DEFENSIVE
 *  convention, not because the current predicate needs it: `hasBoundContext`'s
 *  regex is END-ANCHORED, so when the one-character alternative matches the
 *  first character of a two-character token the trailing `$` fails and the
 *  engine backtracks into the longer form. The order becomes load-bearing the
 *  moment the alternation is used anywhere the anchor does not force that
 *  backtrack — a forward scan, a `g`/`y` match, or a `SEP` reused outside this
 *  one predicate — so keep it. Do NOT reorder, and do NOT claim in review that
 *  reordering is a fail-open bug; it is not. The vertical bar is deliberately
 *  absent, and so are gitleaks' comma and logical-or members.
 *  Written as a regex literal + `.source` rather than a quoted string so the
 *  parser checks it and so it carries ONE backslash, not two.
 *  Interpolated into `hasBoundContext`'s regex inside `(?: … )`, exactly once. */
const SEP = /:{1,3}=|=>|\?=|[:=>]/.source;

// A8: how far back the binder may look — the longest keyword (21 characters,
// `aws_secret_access_key`), the filler bound, and 12 characters of slack for the
// separator token, the two optional quote/backtick slots and the optional
// whitespace on each side. DERIVED from ScanLimits and never a literal.
const CTX_LOOKBACK_MAX = 21 + ScanLimits.ENTROPY_CTX_FILLER_MAX + 12;

// A7/A8/A8a, spelled once: a sensitive keyword (the shipped SENSITIVE_KEYS
// constant plus `authorization`, matched case-insensitively), then bounded
// filler from gitleaks' own class, then at most one quote or backtick, optional
// whitespace, exactly one separator token, optional whitespace, at most one
// quote or backtick — and then the candidate, which the `$` anchor forces to
// follow directly.
const CTX_BINDER = new RegExp(
  `(?:${SENSITIVE_KEYS}|authorization)` +
    `[ \\t\\w.-]{0,${ScanLimits.ENTROPY_CTX_FILLER_MAX}}` +
    `["'\`]?\\s*(?:${SEP})\\s*["'\`]?$`,
  'i',
);

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

/** True iff a sensitive keyword BINDS to the candidate starting at `idx`.
 *  Implements Table A rows A7, A8 and A8a EXACTLY — that table decides the
 *  keyword list, the filler bound and the separator set; this function does not
 *  get to differ from it. Same line only: the search never crosses a `\n`.
 *  @param {string} text @param {number} idx @returns {boolean} */
function hasBoundContext(text, idx) {
  const back = text.slice(Math.max(0, idx - CTX_LOOKBACK_MAX), idx);
  const line = back.slice(back.lastIndexOf('\n') + 1);
  return CTX_BINDER.test(line);
}

/**
 * Two-tier high-entropy pass (Table A rows A5, A6, A9).
 *  - Tier 2 — a run over the wide alphabet, at or above the entropy floor, with
 *    a sensitive keyword bound to it through a separator on the same line: no
 *    safe partial redaction, so QUARANTINE, whole candidate replaced.
 *  - Tier 1 — any sub-run of a non-quarantined tier-2 candidate that is long
 *    enough and at or above the floor, over the NARROW alphabet: a bare pasted
 *    key with no keyword near it, so the accidental case, replaced at REDACT.
 * The tier-1 scan runs unconditionally on every non-quarantined candidate and
 * is never gated on the tier-2 bits check: entropy is not monotone, so a
 * low-entropy wide run can contain a high-entropy narrow sub-run.
 * @param {string} text
 * @param {(label:string, severity:Severity)=>void} add
 * @returns {string}
 */
function entropyPass(text, add) {
  return text.replace(TIER2_CANDIDATE, (cand, offset) => {
    if (
      bitsPerChar(cand) >= ScanLimits.ENTROPY_MIN_BITS_PER_CHAR &&
      hasBoundContext(text, offset)
    ) {
      add('high-entropy', SEVERITY.QUARANTINE);
      return '[REDACTED:high-entropy]';
    }
    return cand.replace(TIER1_CANDIDATE, (sub) => {
      if (bitsPerChar(sub) < ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return sub;
      add('high-entropy', SEVERITY.REDACT);
      return '[REDACTED:high-entropy]';
    });
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
      if (existing) {
        existing.count += 1;
        // A15: severity is the MAXIMUM over a label's occurrences, never the first.
        if (severity === SEVERITY.QUARANTINE) existing.severity = SEVERITY.QUARANTINE;
      } else findings.set(label, { label, severity, count: 1 });
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

// ---------------------------------------------------------------------------
// THE BOUNDED STREAM REDACTOR (ADR-0043).
//
// Per-chunk redaction is withdrawn: a credential whose two halves land in
// separate stream chunks is redacted by neither call, and the two writes land
// contiguous in the durable log. This transform instead accumulates stream text
// and emits it as REGIONS, each scanned by exactly one `redactOnly` call, and a
// region may end only at an ACCEPTED CUT POINT — a place where no rule in
// `RULES` above can match across.
//
// The predicate lives in this file, with the rules it is derived from, on
// purpose (ADR-0043 decision 3). Nothing below is exported but
// `createStreamRedactor`.
// ---------------------------------------------------------------------------

/** How many NON-whitespace characters of the buffered prefix row S2's binder can
 *  possibly reach across. DERIVED from the two alternations the binder is built
 *  out of and never a literal: a written alternation is always at least as long
 *  as any string it matches, so `SENSITIVE_KEYS.length` bounds the longest
 *  keyword and `SEP.length` the longest separator token; the 2 is the binder's
 *  two optional quote slots. Every other character the binder can match is
 *  whitespace, of which it accepts ANY amount (Table S row S2: the keyword may
 *  sit any number of blank lines back) — which is why the window below carries
 *  whitespace as presence, not as length. Over-estimating only widens the
 *  window, which can never change an answer. */
const CUT_BINDER_LOOKBACK = SENSITIVE_KEYS.length + SEP.length + 2;

/** Table S row S2 — an OPEN key binder at the end of the buffered text, spelled
 *  by interpolating the detector's own `SENSITIVE_KEYS` and `SEP`, exactly as
 *  `CTX_BINDER` above is; a second hand-written copy of either alternation is
 *  the drift ADR-0031 exists to prevent. It is NOT a reuse of `CTX_BINDER` and
 *  differs from it in the two ways that matter here: the separator is OPTIONAL
 *  (so `Bearer `, which has none, still blocks a cut, and so does a line ending
 *  in the bare word `token`), and the whitespace class is `\s`, which spans CR
 *  and LF (so `password:\n\n` and `password\n:\n` both still block).
 *
 *  THE TWO FACTS `cutS2Window` BELOW RESTS ON, both readable off this pattern:
 *  (1) its only whitespace consumers are the `\s*` tokens — the keyword
 *  alternation, `SEP` and the two quote slots contain no whitespace, and `$`
 *  consumes nothing; (2) no two `\s*` are ever adjacent — inside the first
 *  branch they are separated by a non-empty `SEP`, and the second branch has
 *  only one. Fact (2) is why the middle is spelled as the ALTERNATION
 *  `(?:\s*SEP\s*|\s*)` rather than the shorter `\s*(?:SEP)?\s*`: the two accept
 *  exactly the same language, but only this spelling makes "each whitespace run
 *  is consumed whole by exactly one `\s*`" true by inspection. It is not a
 *  performance choice — the window keeps the subject short enough that both
 *  spellings measure the same. */
const CUT_OPEN_BINDER = new RegExp(
  `(?:${SENSITIVE_KEYS}|authorization)["'\`]?(?:\\s*(?:${SEP})\\s*|\\s*)["'\`]?$`,
  'i',
);

/** Table S row S3 — a sensitive JSON key plus the opening quote of its value.
 *  The key set is `SENSITIVE_KEYS`; the quote and separator shapes are the JSON
 *  value rule's own (`"(SENSITIVE_KEYS)"(\s*:\s*)"([^"\\]{8,})"`, above), whose
 *  value body includes `\n` and so stays open across arbitrarily many lines. */
const CUT_JSON_VALUE_OPEN = new RegExp(`"(?:${SENSITIVE_KEYS})"\\s*:\\s*"`, 'i');

/** Table S row S4 — the `private-key` rule's opener and closer, spelled from
 *  that rule's own pattern above, whose body is `[\s\S]*?`. */
const CUT_PEM_OPEN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const CUT_PEM_CLOSE = /-----END [A-Z ]*PRIVATE KEY-----/;

// NONE of the three regexes above is ever executed. They are the ONE spelling
// of their shapes, and the constants below are taken apart from their `.source`
// so there is no second copy to drift. Rows S3 and S4 are decided from the
// pieces instead of by running the patterns, because running them means handing
// the engine a subject that grows with the stream, which is how a single large
// push went quadratic (Table B's cost row).

/** Row S3's opener MINUS its final quote, end-anchored. Every opener ends at a
 *  `"`, so testing this AT every quote finds every opener — overlapping ones
 *  included — without ever searching for the opener itself. It carries the same
 *  two facts `CUT_OPEN_BINDER` does (only `\s*` consumes whitespace, and the
 *  `:` keeps the two `\s*` apart), so it is closed under collapsing and can be
 *  decided on the bounded window `cutS2Window` builds. */
const CUT_JSON_KEY_SEP = new RegExp(`${CUT_JSON_VALUE_OPEN.source.slice(0, -1)}$`, 'i');

/** The private-key opener and closer split at the fixed tail they share. Both
 *  patterns are `<head>[A-Z ]*PRIVATE KEY-----`, so a block can only open or
 *  close where that tail ends — which makes both detectable at a position
 *  rather than by a search. */
const PEM_FILLER = '[A-Z ]*';

/** Split a private-key pattern at its filler class, or REFUSE TO LOAD. The
 *  split is the one assumption the cut layer makes about these two rules, and a
 *  change to the filler class would otherwise leave `PEM_TAIL` `undefined` and
 *  throw out of `push`, which must never throw. Failing here names the rule and
 *  fails at the right place. @param {RegExp} rule @param {string} name */
function pemParts(rule, name) {
  const parts = rule.source.split(PEM_FILLER);
  if (parts.length !== 2) {
    throw new Error(
      `secret-scan: the ${name} rule no longer reads as <head>${PEM_FILLER}<tail> `
        + `(source: ${rule.source}). Table S row S4's cut predicate is derived from that `
        + 'shape — update it in the same change.',
    );
  }
  return parts;
}

const PEM_TAIL = pemParts(CUT_PEM_OPEN, 'private-key opener')[1];
const PEM_OPEN_HEAD = pemParts(CUT_PEM_OPEN, 'private-key opener')[0];
const PEM_CLOSE_HEAD = pemParts(CUT_PEM_CLOSE, 'private-key closer')[0];

/** `[A-Z ]` — the only thing either private-key pattern allows between its head
 *  and `PEM_TAIL`. @param {number} code @returns {boolean} */
function isPemFiller(code) {
  return code === 32 || (code >= 65 && code <= 90);
}

/** How much of `head` sits BEFORE the `[A-Z ]` run it runs into — `-----BEGIN `
 *  ends with `BEGIN `, which the run swallows, so only its dashes precede it.
 *  @param {string} head @returns {number} */
function pemHeadOffset(head) {
  let k = head.length;
  while (k > 0 && isPemFiller(head.charCodeAt(k - 1))) k -= 1;
  return k;
}

const PEM_OPEN_OFFSET = pemHeadOffset(PEM_OPEN_HEAD);
const PEM_CLOSE_OFFSET = pemHeadOffset(PEM_CLOSE_HEAD);

/** Table S row S1: the cut falls immediately after a `\n`. Taken on the buffer
 *  and an index rather than on a slice, so the descending scan in
 *  `nextRegionEnd` rejects a non-boundary in constant time and never copies.
 *  @param {string} buffer @param {number} i @returns {boolean} */
function cutS1EndsWithNewline(buffer, i) {
  return i > 0 && buffer.charCodeAt(i - 1) === 10;
}

/** True iff `code` is a character JS `\s` matches. The ASCII cases are spelled
 *  out because `nextRegionEnd` classifies every character of the buffer one at
 *  a time, and `/\s/.test(s[k])` allocates a single-character string on every
 *  one of them. Anything outside ASCII falls back to the regex, so the fast
 *  path and `\s` agree by construction rather than by a second hand-written
 *  list. @param {number} code @returns {boolean} */
function isCutWhitespace(code) {
  if (code === 32 || (code >= 9 && code <= 13)) return true;
  return code > 127 && /\s/.test(String.fromCharCode(code));
}

/**
 * The COLLAPSED WINDOW for row S2 at a cut before `buffer[i]`: the tail of
 * `P = buffer.slice(0, i)` that `CUT_OPEN_BINDER` can see, with every
 * whitespace run reduced to a single space.
 *
 * WHY COLLAPSING IS EXACT, not an approximation. `CUT_OPEN_BINDER`'s only
 * whitespace consumers are its `\s*` tokens, and no two of them are adjacent
 * (see that constant's JSDoc). So in any match, each maximal whitespace run of
 * the subject is consumed WHOLE by exactly one `\s*`. `\s*` accepts a run of any
 * length ≥ 0, so replacing a run by one space maps matches to matches; and every
 * whitespace character of the collapsed subject is one of those inserted spaces,
 * so expanding maps them back. Hence **R matches a suffix W iff R matches
 * collapse(W)** — the binder's language is closed under collapsing.
 *
 * WHY TRUNCATING TO `CUT_BINDER_LOOKBACK` NON-WHITESPACE CHARACTERS IS EXACT.
 * A match must end at `$`, and its non-whitespace content is at most one
 * keyword, one separator token and two quotes — fewer than
 * `CUT_BINDER_LOOKBACK` characters — so a match that exists at all lies inside
 * the window. Dropping what precedes the window cannot invent one either: the
 * pattern has no `^`, no `\b` and no look-behind, so it never asks anything of
 * the text to its left.
 *
 * This is what makes row S2 exact AND linear with NO bound on how far back the
 * keyword may sit: the whitespace is carried as presence, never as length.
 *
 * `solid` is the ascending list of non-whitespace indices of `buffer` and
 * `solidCount` how many of them are `< i`; `nextRegionEnd` supplies both so the
 * window costs `O(CUT_BINDER_LOOKBACK)` instead of a walk back over the run.
 *
 * @param {string} buffer @param {number} i
 * @param {number[]} solid @param {number} solidCount @returns {string}
 */
function cutS2Window(buffer, i, solid, solidCount) {
  const from = Math.max(0, solidCount - CUT_BINDER_LOOKBACK);
  let window = '';
  for (let k = from; k < solidCount; k += 1) {
    // A gap between two kept characters was a whitespace run: one space stands
    // in for it, whatever its length.
    if (k > from && solid[k] !== solid[k - 1] + 1) window += ' ';
    window += buffer[solid[k]];
  }
  // `P` itself ending in whitespace is the run the binder most often needs.
  if (i > 0 && (solidCount === 0 || solid[solidCount - 1] !== i - 1)) window += ' ';
  return window;
}

/** Table S row S2: no open key binder at the end of `P = buffer.slice(0, i)`.
 *  Exact — this is `CUT_OPEN_BINDER.test(P)`, evaluated on the collapsed window
 *  rather than on `P`, which `cutS2Window` proves is the same answer.
 *  @param {string} buffer @param {number} i
 *  @param {number[]} solid @param {number} solidCount @returns {boolean} */
function cutS2NoOpenKeyBinder(buffer, i, solid, solidCount) {
  return !CUT_OPEN_BINDER.test(cutS2Window(buffer, i, solid, solidCount));
}

/**
 * THE PREFIX STATE rows S3 and S4 are read from, carried ACROSS pushes for the
 * life of a region and extended only over text that has just arrived.
 *
 * Both rows reduce to four running maxima, because for both of them the LAST
 * opener decides. Row S3: if the newest opener's value has seen no `"` since,
 * every older opener is equally unclosed, and if it has, so has every older one
 * — so `jsonOpenEnd > lastQuote` is the whole row. Row S4: a closer that closes
 * the newest opener closes every older one too, so `pemOpenEnd > pemCloseStart`
 * is the whole row. Running maxima never decrease, which is exactly what makes
 * them extensible: what an earlier push computed stays true.
 *
 * `s3` and `s4` keep the per-position answers the descending candidate scan
 * reads back, and are sized once per redactor rather than per call.
 * @returns {{scanned:number, solid:number[], lastQuote:number, jsonOpenEnd:number,
 *   pemOpenEnd:number, pemCloseStart:number, s3:Uint8Array, s4:Uint8Array}}
 */
function createCutState() {
  return {
    scanned: 0,
    solid: [],
    lastQuote: -1,
    jsonOpenEnd: -1,
    pemOpenEnd: -1,
    pemCloseStart: -1,
    s3: new Uint8Array(ScanLimits.STREAM_REGION_MAX + 1),
    s4: new Uint8Array(ScanLimits.STREAM_REGION_MAX + 1),
  };
}

/** Start a fresh region: everything above is relative to the buffer's start,
 *  and re-basing the buffer moves it. */
function resetCutState(state) {
  state.scanned = 0;
  state.solid.length = 0;
  state.lastQuote = -1;
  state.jsonOpenEnd = -1;
  state.pemOpenEnd = -1;
  state.pemCloseStart = -1;
}

/**
 * Fold `buffer[state.scanned .. limit)` into the state. Work is linear in the
 * text that has ARRIVED, never in the buffer: each character is looked at once
 * per region, and the two bounded tests below fire only where a row can change
 * — at a `"` for row S3, at the last dash of `PEM_TAIL` for row S4.
 * @param {{scanned:number}} state @param {string} buffer @param {number} limit
 */
function extendCutState(state, buffer, limit) {
  for (let i = state.scanned + 1; i <= limit; i += 1) {
    const at = i - 1;
    const code = buffer.charCodeAt(at);
    if (code === 34) {
      // A row S3 opener can only end HERE. Its last non-whitespace character is
      // the `:`, which is an O(1) filter on the walk that would otherwise build
      // a window at every quote in the stream.
      const seen = state.solid.length;
      if (
        seen > 0
        && buffer.charCodeAt(state.solid[seen - 1]) === 58
        && CUT_JSON_KEY_SEP.test(cutS2Window(buffer, at, state.solid, seen))
      ) {
        state.jsonOpenEnd = i;
      }
      state.lastQuote = at;
    }
    if (code === 45 && i >= PEM_TAIL.length && buffer.startsWith(PEM_TAIL, i - PEM_TAIL.length)) {
      // Walk back over the `[A-Z ]*` run to whatever head precedes it. The runs
      // of two tails cannot overlap — a tail ends in dashes, which stop the
      // walk — so this stays linear over the region.
      let run = i - PEM_TAIL.length;
      while (run > 0 && isPemFiller(buffer.charCodeAt(run - 1))) run -= 1;
      if (buffer.startsWith(PEM_OPEN_HEAD, run - PEM_OPEN_OFFSET)) {
        state.pemOpenEnd = i;
      } else if (buffer.startsWith(PEM_CLOSE_HEAD, run - PEM_CLOSE_OFFSET)) {
        const start = run - PEM_CLOSE_OFFSET;
        if (start > state.pemCloseStart) state.pemCloseStart = start;
      }
    }
    if (!isCutWhitespace(code)) state.solid.push(at);
    state.s3[i] = state.jsonOpenEnd > state.lastQuote ? 1 : 0;
    state.s4[i] = state.pemOpenEnd > state.pemCloseStart ? 1 : 0;
  }
  state.scanned = limit;
}

/** Table S row S3: no sensitive quoted value left open in `buffer[0 .. i)`.
 *  @param {{s3: Uint8Array}} state @param {number} i @returns {boolean} */
function cutS3NoOpenQuotedValue(state, i) {
  return state.s3[i] === 0;
}

/** Table S row S4: no private-key block left open in `buffer[0 .. i)`.
 *  @param {{s4: Uint8Array}} state @param {number} i @returns {boolean} */
function cutS4NoOpenPrivateKey(state, i) {
  return state.s4[i] === 0;
}

/**
 * Table S: a cut between `buffer[i-1]` and `buffer[i]` is ACCEPTED when all four
 * rows hold on `P = buffer.slice(0, i)`. This is the whole accepted set; there
 * is no forbidden set, and anything not accepted here is not a cut.
 *
 * EVERY ROW IS A STATEMENT ABOUT AN INCOMPLETE MATCH OVER THE WHOLE OF `P`,
 * never about `P`'s last line. A last-line predicate is blind to `password:\n\n`,
 * to `password\n:\n` and to a quoted JSON value left open several lines back,
 * and all three were measured to leak across a cut such a predicate permits.
 *
 * A RULE ADDED TO OR MODIFIED IN `RULES` ABOVE THAT CAN MATCH ACROSS A LINE
 * BREAK MUST EXTEND THIS PREDICATE AND TABLE S IN THE SAME CHANGE (ADR-0043
 * decision 3). A rule whose alphabet excludes `\n` is kept whole by S1 and
 * needs nothing. The cut constants restate the rule shapes AS THEY STAND, so a
 * rule MODIFIED without this layer fails open — Accepted residual 3, and the
 * suite's exactness fuzz derives its oracles from `RULES` to catch it.
 *
 * Every row is answered from prefix state the redactor carries across pushes,
 * so a candidate costs O(CUT_BINDER_LOOKBACK) and never a prefix copy.
 *
 * @param {string} buffer @param {number} i
 * @param {number[]} solid @param {number} solidCount
 * @param {{s3: Uint8Array, s4: Uint8Array}} state @returns {boolean}
 */
function isAcceptedCut(buffer, i, solid, solidCount, state) {
  // Ordered by cost, not by row number: S1, S3 and S4 are O(1) lookups, so a
  // candidate a private key or an open value already blocks is rejected without
  // building row S2's window. The rows are a conjunction, so the order is free.
  if (!cutS1EndsWithNewline(buffer, i)) return false;
  if (!cutS3NoOpenQuotedValue(state, i)) return false;
  if (!cutS4NoOpenPrivateKey(state, i)) return false;
  if (!cutS2NoOpenKeyBinder(buffer, i, solid, solidCount)) return false;
  return true;
}

/** The end offset of the next region `buffer` completes, or 0 when none can be
 *  closed yet. The LAST accepted cut at or before `STREAM_REGION_MAX`; failing
 *  that, and only once the buffer holds at least `STREAM_REGION_MAX`
 *  characters, the FORCED CUT at exactly `STREAM_REGION_MAX` (Table B) — the
 *  one unaccepted cut, and ADR-0043 decision 5's stated residual.
 *
 *  `rejected` is how far the caller has already searched without finding a cut.
 *  Skipping that prefix is sound because `isAcceptedCut(buffer, i)` reads only
 *  `buffer[0 .. i)`, which APPENDING NEVER CHANGES: a position once rejected
 *  stays rejected for the life of the region. Without it, a long unbroken line
 *  delivered a character at a time rescans its whole prefix on every `push`.
 *  @param {string} buffer @param {number} rejected
 *  @param {object} state @returns {number} */
function nextRegionEnd(buffer, rejected, state) {
  const limit = Math.min(buffer.length, ScanLimits.STREAM_REGION_MAX);
  // Only the bounded prefix is ever looked at. A cut at or below `limit` is
  // decided by `buffer[0 .. limit)` alone, so the rest of a large push — which
  // may be megabytes — is not state this region can need, and not touching it
  // is what keeps one huge push the same price as the same bytes in chunks.
  extendCutState(state, buffer, limit);
  let solidCount = state.solid.length;
  for (let i = limit; i > rejected; i -= 1) {
    while (solidCount > 0 && state.solid[solidCount - 1] >= i) solidCount -= 1;
    if (isAcceptedCut(buffer, i, state.solid, solidCount, state)) return i;
  }
  return buffer.length >= ScanLimits.STREAM_REGION_MAX ? ScanLimits.STREAM_REGION_MAX : 0;
}

/**
 * A copy of `s` that shares nothing with the string it came from.
 *
 * `String.prototype.slice` does not copy in V8: it returns a view that keeps the
 * WHOLE original alive. The buffer is re-based with `slice` after every cut, so
 * without this a redactor idling on a 100-character remainder went on pinning
 * the 32 MiB push it was cut out of — MEASURED at 32.1 MiB retained after
 * `global.gc()`, which is the bounded-memory guarantee in Table B failing. The
 * concatenation forces a flat result when it is sliced, so what comes back
 * holds only its own characters.
 *
 * Only ever called on something already bounded by `STREAM_REGION_MAX`, so the
 * copy is cheap; a test under `--expose-gc` is what holds the detachment.
 * @param {string} s @returns {string}
 */
function detached(s) {
  return s.length === 0 ? '' : ` ${s}`.slice(1);
}

/**
 * A bounded, stateful redactor for a text stream that arrives in arbitrary
 * chunks (ADR-0043). NOT a Node stream: plain synchronous calls, no events, no
 * file descriptor, no timer, no process (ADR-0004). Its state dies with the call
 * that created it, and two instances share nothing.
 *
 * Let `T` be the concatenation of every `text` passed to `push`, in call order.
 * `T` is partitioned into contiguous, ordered regions `R1 … Rn` with
 * `R1 + … + Rn === T`, and the concatenation of every `push` return followed by
 * the `end` return is exactly `redactOnly(R1) + … + redactOnly(Rn)`.
 *
 * `push` and `end` never throw; a non-string `text` is treated as `''`. A `push`
 * after `end()` is a programming error, and is served as if the redactor were
 * fresh. `end()` on an empty buffer returns `''`.
 *
 * @returns {{push(text: string): string, end(): string}}
 */
function createStreamRedactor() {
  let buffer = '';
  /** How far into the CURRENT region a cut has already been searched for in
   *  vain; reset to 0 whenever the buffer is re-based. See `nextRegionEnd`. */
  let rejected = 0;
  /** Rows S2, S3 and S4 over the current region, extended as text arrives and
   *  reset when the buffer is re-based. One allocation per redactor. */
  const state = createCutState();
  return {
    push(text) {
      const added = typeof text === 'string' ? text : '';
      buffer += added;
      // FAST PATH. A candidate cut only ever sits where row S1 puts one, and
      // acceptance of a candidate reads only the buffer below it — the same
      // fact the `rejected` watermark rests on. So an append that carries no
      // candidate cannot have created an accepted cut, and while the buffer is
      // still under the ceiling no forced cut is due either: there is nothing
      // to scan for. Without this, a long line arriving in small chunks
      // rebuilds the whole prefix state on every call — measured at 3.35 s for
      // one 32 KiB line delivered one character at a time.
      //
      // Row S1 is asked THROUGH `cutS1EndsWithNewline`, never re-spelled here,
      // so this shortcut cannot drift from the predicate it is derived from.
      let addsCandidate = false;
      for (let k = added.length; k > 0; k -= 1) {
        if (cutS1EndsWithNewline(added, k)) {
          addsCandidate = true;
          break;
        }
      }
      if (!addsCandidate && buffer.length < ScanLimits.STREAM_REGION_MAX) {
        rejected = buffer.length;
        return '';
      }
      let out = '';
      let cutHere = false;
      for (;;) {
        const cut = nextRegionEnd(buffer, rejected, state);
        if (cut === 0) {
          rejected = Math.min(buffer.length, ScanLimits.STREAM_REGION_MAX);
          break;
        }
        // The region is detached too, so what this call HANDS BACK does not pin
        // the push it was cut from either. One copy per region is linear.
        out += redactOnly(detached(buffer.slice(0, cut)));
        buffer = buffer.slice(cut);
        rejected = 0;
        cutHere = true;
        resetCutState(state);
      }
      // Once, after the loop — where the remainder is below the ceiling, so the
      // copy is bounded — and only when a cut actually re-based the buffer.
      if (cutHere && buffer.length > 0) buffer = detached(buffer);
      return out;
    },
    end() {
      const rest = detached(buffer);
      buffer = '';
      rejected = 0;
      resetCutState(state);
      return rest === '' ? '' : redactOnly(rest);
    },
  };
}

module.exports = {
  scanAndRedact,
  redactOnly,
  hasHardFinding,
  createStreamRedactor,
  ScanLimits,
  SEVERITY,
};
