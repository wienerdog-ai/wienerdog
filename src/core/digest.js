'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { defaultLayout } = require('./layout');
const { isCapabilityAllowed, CAPABILITY } = require('./safety-profile');
const { parse, readBool, INVALID } = require('./frontmatter');
const { hashBytes, foldKey } = require('./identity-approvals');
// Module-object require (not destructured): EP4's test seam stubs
// secretScan.scanAndRedact to prove a failing scanner omits, never throws.
const secretScan = require('./secret-scan');

/**
 * @typedef {{data: Record<string,string>, body: string}} Note
 * @typedef {{note: Note|null,
 *            exclusion: null|'absent'|'untrusted-exact'|'untrusted-invalid'|'malformed'}} ReadNoteResult
 */

/** Digest size caps (audit A6, F3/F5). Values OWNER-APPROVED 2026-07-17 — see the spec. */
const DigestCaps = {
  MAX_LINES: 120, // the historically-claimed line cap, now enforced
  MAX_BYTES: 32 * 1024, // hard byte ceiling on the injected digest
  MAX_NOTE_BYTES: 8 * 1024, // per identity note: cap the compacted body before it joins parts[]
  MAX_PROJECTS: 50, // cap the number of `- name` project lines
  TRUNCATION_MARKER: '> [wienerdog: digest truncated to fit the session-context cap]',
};

/**
 * Read a note, honouring the trust gate (audit A4, ADR-0022), and report WHY it
 * was excluded so the caller can decide whether the exclusion is anomalous
 * (warn) or normal (silent).
 *
 * Exclusion classes:
 *  - 'absent'           — file missing/unreadable (silent).
 *  - 'malformed'        — the frontmatter block is malformed (indented line,
 *                         duplicate key, junk line). Excluded UNCONDITIONALLY —
 *                         regardless of whether it carries derived_from_untrusted
 *                         (owner decision 2026-07-17: fail-closed uniformity; a
 *                         malformed block on a human-authored identity file is a
 *                         typo, surfaced by the banner, not tolerated). WARN.
 *  - 'untrusted-invalid'— derived_from_untrusted present but NOT provably `false`
 *                         (`True`, `TRUE`, `"true"`, commented, junk → INVALID).
 *                         WARN.
 *  - 'untrusted-exact'  — derived_from_untrusted is exactly `true`. Normal
 *                         policy; SILENT.
 *  - null               — trusted (flag absent, or exactly `false`) → note
 *                         returned.
 *
 * Trusted-by-default: a well-formed note that OMITS the flag (the human identity
 * notes) still renders.
 * @param {string} filePath
 * @returns {ReadNoteResult}
 */
function readNote(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { note: null, exclusion: 'absent' };
  }
  const fm = parse(text);
  // Malformed block → exclude unconditionally (fail-closed uniformity), warn.
  if (fm.malformed) return { note: null, exclusion: 'malformed' };
  const t = readBool(fm.fields, 'derived_from_untrusted');
  if (t === true) return { note: null, exclusion: 'untrusted-exact' }; // normal → silent
  if (t === INVALID) return { note: null, exclusion: 'untrusted-invalid' }; // anomalous → warn
  // undefined (absent) or exactly false → trusted → render.
  const data = Object.fromEntries(fm.fields); // shape stability for the return type
  return { note: { data, body: fm.body }, exclusion: null };
}

/** @param {string} line @returns {boolean} */
function isHeading(line) {
  return /^#{1,6}\s/.test(line);
}

/**
 * Compact a note body: drop the frontmatter (already removed by caller), drop
 * a single leading level-1 heading (the note's own `# Title`), drop headings
 * whose section has no non-blank content, collapse runs of blank lines to
 * one, and trim leading/trailing blank lines.
 * @param {string} body
 * @returns {string}
 */
function compact(body) {
  let lines = body.split('\n');
  // Drop a single leading level-1 heading — the note's own `# Title`. renderDigest
  // already prepends the section header (## Preferences, …); without this the note's
  // own H1 stacks under it as a duplicate. Only the FIRST non-blank line, and only
  // if it is exactly a one-hash heading (`# `). H2+ are section structure — preserved.
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first !== -1 && /^#\s/.test(lines[first])) {
    lines = [...lines.slice(0, first), ...lines.slice(first + 1)];
  }
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (isHeading(lines[i])) {
      const heading = lines[i];
      let j = i + 1;
      /** @type {string[]} */
      const section = [];
      while (j < lines.length && !isHeading(lines[j])) {
        section.push(lines[j]);
        j++;
      }
      if (section.some((l) => l.trim() !== '')) out.push(heading, ...section);
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

/**
 * Return the trimmed content of a `## <name>` section, or null if absent/empty.
 * @param {string} body
 * @param {string} name
 * @returns {string|null}
 */
function extractSection(body, name) {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.*)$/);
    if (!m || m[1].trim() !== name) continue;
    let j = i + 1;
    /** @type {string[]} */
    const section = [];
    while (j < lines.length && !isHeading(lines[j])) {
      section.push(lines[j]);
      j++;
    }
    const text = section
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
    return text || null;
  }
  return null;
}

/** @param {string} dir @returns {string[]} names of immediate subdirectories, sorted. */
function listProjectDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Find the newest daily note by walking `dir` recursively and collecting files
 * whose basename matches YYYY-MM-DD.md (which sort chronologically). Handles both
 * flat (07-Daily/2026-07-03.md) and nested (05-Daily/2026/07/2026-07-03.md)
 * layouts with the same code. A missing `dir` returns null.
 * @param {string} dir
 * @returns {{path: string, date: string}|null}
 */
function newestDaily(dir) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} d */
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name)) {
        found.push(full);
      }
    }
  }
  walk(dir);
  if (found.length === 0) return null;
  // Newest by basename (lexical sort == chronological for YYYY-MM-DD).
  found.sort((a, b) => (path.basename(a) < path.basename(b) ? -1 : 1));
  const newest = found[found.length - 1];
  return { path: newest, date: path.basename(newest).replace(/\.md$/, '') };
}

/**
 * Format unresolved failure alerts (state/alerts.jsonl records) into a plain-text
 * callout block prepended to the digest. Groups by job: one line per failing job
 * with the count, earliest timestamp, latest reason, and log hint. Declarative
 * status text only — never an instruction to the model (ADR-0012: it lands in the
 * injected digest, so it must add no injection surface). Empty list → ''.
 * @param {Array<{job:string, at:string, reason:string, log_hint:string}>} alerts
 * @returns {string}
 */
function formatAlerts(alerts) {
  if (!alerts || alerts.length === 0) return '';
  /** @type {Map<string, {count:number, first:string, lastReason:string, hint:string}>} */
  const byJob = new Map();
  for (const a of alerts) {
    const cur = byJob.get(a.job) || { count: 0, first: a.at, lastReason: a.reason, hint: a.log_hint };
    cur.count += 1;
    if (a.at < cur.first) cur.first = a.at;
    cur.lastReason = a.reason; // alerts are oldest-first → last wins
    cur.hint = a.log_hint;
    byJob.set(a.job, cur);
  }
  const lines = [];
  for (const [job, s] of byJob) {
    const times = s.count === 1 ? 'has failed' : `has failed ${s.count} times since ${s.first}`;
    lines.push(
      `> [!warning] Wienerdog: the "${job}" job ${times}. Latest error: ${s.lastReason}. ` +
        `Details in ${s.hint}. This note clears automatically when the job next succeeds.`
    );
  }
  return lines.join('\n');
}

/**
 * Hard-cut `str` at the largest UTF-8 byte boundary that fits within `maxBytes`,
 * never splitting a multi-byte codepoint. `Buffer#toString('utf8')` replaces a
 * truncated trailing multi-byte sequence with U+FFFD — trim that off so the
 * result never carries a dangling replacement character (audit A6, F3/F5).
 * @param {string} str @param {number} maxBytes @returns {string}
 */
function hardCutUtf8(str, maxBytes) {
  if (maxBytes <= 0) return '';
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  let cut = buf.subarray(0, maxBytes).toString('utf8');
  if (cut.charCodeAt(cut.length - 1) === 0xfffd) cut = cut.slice(0, -1);
  return cut;
}

/**
 * Keep whole lines of `text` whose cumulative UTF-8 byte length fits within
 * `maxBytes`, dropping any trailing lines that would not fit. No marker is
 * appended — a per-note truncation is silently bounded (the caller's own
 * marker, if any, covers it). Returns '' when even the first line does not fit.
 * @param {string} text @param {number} maxBytes @returns {string}
 */
function capBytesAtLineBoundary(text, maxBytes) {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text;
  const lines = text.split('\n');
  const kept = [];
  let used = 0;
  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, 'utf8') + (kept.length > 0 ? 1 : 0); // +1 for the '\n' joiner
    if (used + lineBytes > maxBytes) break;
    used += lineBytes;
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Fit `bodyText` within `byteBudget` bytes: first try dropping trailing lines
 * (line-boundary safe); if even the first line alone exceeds the budget, hard-cut
 * that single line at a UTF-8-safe boundary (never split a codepoint).
 * @param {string} bodyText @param {number} byteBudget @returns {string}
 */
function capBodyToBytes(bodyText, byteBudget) {
  if (byteBudget <= 0) return '';
  if (Buffer.byteLength(bodyText, 'utf8') <= byteBudget) return bodyText;
  const kept = capBytesAtLineBoundary(bodyText, byteBudget);
  if (kept !== '') return kept;
  const firstLine = bodyText.split('\n')[0];
  return hardCutUtf8(firstLine, byteBudget);
}

/**
 * Enforce DigestCaps.MAX_LINES and MAX_BYTES on `assembled`, ALWAYS preserving `prefix`
 * (the control-plane banners) verbatim. Truncation is at a LINE boundary; a single
 * TRUNCATION_MARKER line is appended when anything was dropped. If even prefix+marker
 * exceeds a cap (pathological), keep the prefix + marker (prefix is never dropped). Applies
 * the LINE cap first, then the BYTE cap on the line-capped result (a million-char single
 * line is one line, under MAX_LINES, but blows MAX_BYTES → the byte pass hard-caps it at a
 * UTF-8-safe boundary and appends the marker).
 * @param {string} assembled @param {string} prefix @returns {string}
 */
function capDigest(assembled, prefix) {
  const prefixPart = prefix ? `${prefix}\n\n` : '';
  const bodyPart = prefix ? assembled.slice(prefixPart.length) : assembled;

  // ---- Line cap: reserve the prefix's own lines (+1 for the blank separator)
  // so the prefix can never be squeezed out by the body's line budget. ----
  const prefixLineCount = prefix ? prefix.split('\n').length + 1 : 0;
  const lineBudget = Math.max(0, DigestCaps.MAX_LINES - prefixLineCount);
  let bodyLines = bodyPart.split('\n');
  let truncated = false;
  if (bodyLines.length > lineBudget) {
    bodyLines = bodyLines.slice(0, lineBudget);
    truncated = true;
  }
  let cappedBody = bodyLines.join('\n');

  // ---- Byte cap on the line-capped result. The prefix's bytes (and, once we
  // know a marker is needed, the marker's bytes) are reserved first. ----
  const prefixBytes = Buffer.byteLength(prefixPart, 'utf8');
  const fitsWithoutMarker = Buffer.byteLength(prefixPart + cappedBody, 'utf8') <= DigestCaps.MAX_BYTES;
  if (!truncated && fitsWithoutMarker) return prefixPart + cappedBody;

  const markerBytes = Buffer.byteLength(`\n${DigestCaps.TRUNCATION_MARKER}`, 'utf8');
  const bodyByteBudget = Math.max(0, DigestCaps.MAX_BYTES - prefixBytes - markerBytes);
  cappedBody = capBodyToBytes(cappedBody, bodyByteBudget);
  return `${prefixPart}${cappedBody}\n${DigestCaps.TRUNCATION_MARKER}`;
}

/**
 * Render the SessionStart digest from a vault. Deterministic; no model calls.
 * Reads {identity_dir}/{profile,preferences,goals,instructions}.md, the newest
 * daily note under {daily_dir} (found recursively), and {projects_dir}/* directory
 * names — all resolved from `layout` (defaults == today's hardcoded paths). Notes
 * flagged `derived_from_untrusted: true` and blocks whose source is missing/empty
 * are omitted. An ANOMALOUS identity exclusion (malformed frontmatter block, or a
 * derived_from_untrusted value that is not an exact boolean) is omitted fail-closed
 * AND surfaced via a fixed warning banner placed first in the prefix (audit A4,
 * ADR-0022); an exact `true` is normal policy and stays silent.
 * Output is capped to `DigestCaps.MAX_LINES` lines AND `DigestCaps.MAX_BYTES` bytes,
 * with the control-plane banner prefix always preserved; over-cap content is
 * truncated at a line boundary with a fixed marker (audit A6, F3/F5). When
 * `opts.alerts` holds unresolved failure
 * alerts, a plain-text block is prepended (empty/absent → output unchanged).
 * When `opts.updateLine` is a non-empty fixed-template "update available" line, it
 * is prepended after any alert block (empty/absent → output unchanged).
 * When `opts.schedulerLine` is a non-empty fixed-template "configured but not
 * loaded" line, it is prepended between the alert block and the update line
 * (empty/absent → output unchanged).
 * A0 pre-use freeze (WP-109): the daily note's `## Summary` block is injected
 * only when the `daily-summary-injection` capability gate is allowed. Production
 * callers pass no `opts.profile`, so the frozen profile blocks it and the block is
 * silently omitted (never thrown) — `renderDigest` stays pure and total.
 * @param {string} vaultDir
 * @param {import('./layout').VaultLayout} [layout]  defaults to defaultLayout()
 * @param {{alerts?: Array<{job:string, at:string, reason:string, log_hint:string}>,
 *          quarantineLine?: string,
 *          secretQuarantine?: string[],
 *          insecureModes?: number,
 *          schedulerLine?: string, updateLine?: string,
 *          profile?: Record<string,string>,
 *          identityApprovals?: Record<string,string>}} [opts]
 *   quarantineLine = fixed-template secret-free "transcripts skipped" banner from
 *     the A6 quarantine ledger (WP-119, ADR-0023); empty/absent → output unchanged.
 *   profile = a code-level test seam only (never env/argv); passing `allowAll()`
 *     re-enables the daily block.
 *   identityApprovals = the A3 hash-gate map {caseFoldedVaultRel: approvedHash}
 *     (WP-116, ADR-0021); absent → NO identity injected (fail closed).
 * @returns {string}
 */
function renderDigest(vaultDir, layout = defaultLayout(), opts = {}) {
  const idDir = path.join(vaultDir, layout.identity_dir);
  /** @type {[string, string][]} */
  const identity = [
    ['profile.md', "# Who you're working with"],
    ['preferences.md', '## Preferences'],
    ['goals.md', '## Goals'],
    ['instructions.md', '## Standing instructions'],
  ];

  /** @type {string[]} */
  const parts = [];

  const approvals = opts.identityApprovals || {};
  /** @type {Array<{file:string, reason:string}>} anomalous exclusions to warn about */
  const identityExclusions = [];
  for (const [file, header] of identity) {
    const abs = path.join(idDir, file);
    let bytes;
    try {
      bytes = fs.readFileSync(abs);
    } catch {
      continue; // absent → silent (normal)
    }
    // A3 hash gate (WP-116, ADR-0021): inject ONLY when the exact bytes match a
    // human-approved hash. Case-folded key so Profile.md == profile.md. A mismatch
    // is anomalous → warn, but ONLY when approvals were supplied (production); a
    // bare test render with no map omits identity SILENTLY (fail closed).
    const foldedRel = foldKey(`${layout.identity_dir}/${file}`);
    if (approvals[foldedRel] !== hashBytes(bytes)) {
      if (opts.identityApprovals !== undefined) identityExclusions.push({ file, reason: 'changed since you last approved it' });
      continue;
    }
    // WP-114 provenance gate on top (structured result → SAME exclusion list).
    const r = readNote(abs);
    if (!r.note) {
      if (r.exclusion === 'malformed') identityExclusions.push({ file, reason: 'malformed frontmatter' });
      else if (r.exclusion === 'untrusted-invalid') identityExclusions.push({ file, reason: 'unclear derived_from_untrusted value' });
      // 'untrusted-exact' and 'absent' are NORMAL → silent (no banner).
      continue;
    }
    // Bound a single oversized identity note (audit A6, F3/F5) independently of
    // the overall cap, at a line boundary — no per-note marker (the overall
    // marker, appended below if anything is dropped anywhere, covers it).
    const content = capBytesAtLineBoundary(compact(r.note.body), DigestCaps.MAX_NOTE_BYTES);
    if (!content) continue;
    // EP4 secret gate (audit A5, ADR-0024, WP-125): the LAST filter before a
    // section joins the digest — runs after the A3 hash gate and A4 provenance
    // gate, so only an approved+trusted note reaches it. ANY detector finding
    // (`findings.length > 0`, either severity — OWNER-APPROVED 2026-07-17)
    // omits the WHOLE section; the redacted `.text` is discarded, never
    // injected. A false positive is a visible banner entry, not a mutated
    // identity. scanAndRedact is total (WP-122), so a scan error yields a
    // scan-error finding → omission (fail closed), never a throw.
    const section = `${header}\n${content}`;
    if (secretScan.scanAndRedact(section).findings.length > 0) {
      identityExclusions.push({ file, reason: 'appears to contain a secret' });
      continue;
    }
    parts.push(section);
  }

  const allProjects = listProjectDirs(path.join(vaultDir, layout.projects_dir));
  if (allProjects.length > 0) {
    const projects = allProjects.slice(0, DigestCaps.MAX_PROJECTS);
    const overflow = allProjects.length - projects.length;
    const projectLines = projects.map((n) => `- ${n}`);
    if (overflow > 0) projectLines.push(`- …and ${overflow} more`);
    // EP4: same one-banner exclusion list, fixed code-owned label (owner ruling).
    const projectsSection = `## Active projects\n${projectLines.join('\n')}`;
    if (secretScan.scanAndRedact(projectsSection).findings.length > 0) {
      identityExclusions.push({ file: 'active-projects', reason: 'appears to contain a secret' });
    } else {
      parts.push(projectsSection);
    }
  }

  const daily = newestDaily(path.join(vaultDir, layout.daily_dir));
  // A0 pre-use freeze (WP-109): the daily-note Summary is NOT injected until
  // entry-level provenance exists (audit A4). opts.profile is a code seam for tests
  // only (never env/argv); production callers pass none → blocked → omitted.
  if (daily && isCapabilityAllowed(CAPABILITY.DAILY_SUMMARY_INJECTION, opts.profile)) {
    const r = readNote(daily.path);
    const summary = r.note && extractSection(r.note.body, 'Summary');
    if (summary) {
      // EP4: same one-banner exclusion list, fixed code-owned label (owner ruling).
      const dailySection = `## Latest daily log (${daily.date})\n${summary}`;
      if (secretScan.scanAndRedact(dailySection).findings.length > 0) {
        identityExclusions.push({ file: 'daily-summary', reason: 'appears to contain a secret' });
      } else {
        parts.push(dailySection);
      }
    }
  }

  const body = `${parts.join('\n\n')}\n`;
  // Identity-exclusion banner (audit A4): an identity note silently missing from
  // the session is the most urgent thing to surface, so it goes FIRST in the
  // prefix. Fixed, declarative, code-owned filenames only — never note content —
  // so no untrusted bytes enter the digest (same rule as formatAlerts).
  const identityWarn = identityExclusions.length > 0
    ? `> [!warning] Wienerdog: some identity notes were left out of your session context — ${identityExclusions.map((e) => `${e.file} (${e.reason})`).join(', ')}. Fix their frontmatter and run \`wienerdog sync\`, or re-approve an intentional edit with \`wienerdog memory approve <note>\`.`
    : '';
  // Prefix order = identity banner, then alerts, then quarantineLine, then
  // schedulerLine, then updateLine (an active failure is more urgent than a
  // transcript that could not be read, which is more urgent than a
  // configured-but-not-loaded job, which is more urgent than an available
  // update). All fixed-template control-plane text; when all are empty the byte
  // output is unchanged (golden-frozen).
  // Staged-output quarantine pending-review banner (EP4 companion, WP-125
  // contract 5, OWNER-APPROVED in the WP-124 walkthrough): STATE-DRIVEN — it
  // renders while state/quarantine/ is non-empty and clears itself once the
  // owner empties the directory. Sanitized basenames only (the caller applies
  // displayName; re-whitelisted here as defense in depth) — the quarantined
  // files hold raw secrets and their CONTENT is never read or rendered.
  const quarantined = (Array.isArray(opts.secretQuarantine) ? opts.secretQuarantine : [])
    .map((n) => String(n).replace(/[^A-Za-z0-9._-]/g, '_'));
  const secretQuarantineWarn = quarantined.length > 0
    ? `> [!warning] Wienerdog: ${quarantined.length} dream note(s) were withheld from your vault because they ` +
      `appear to contain a secret — ${quarantined.join(', ')}. Review the copies in state/quarantine/: restore ` +
      'what you meant to keep, delete the rest; this notice clears when the folder is empty.'
    : '';
  // Insecure-modes awareness banner (WP-126, OWNER-APPROVED 2026-07-17):
  // state-driven like the quarantine banner above — renders while the
  // read-only mode scan finds group/world-accessible A5 artifacts, clears
  // after the fixing `wienerdog sync`. Count + remediation only: no paths, no
  // content (details live in `wienerdog doctor`).
  const insecureCount = Number(opts.insecureModes) > 0 ? Number(opts.insecureModes) : 0;
  const insecureModesWarn = insecureCount > 0
    ? `> [!warning] Wienerdog: ${insecureCount} private Wienerdog file(s) or folder(s) are readable by other ` +
      'users on this machine — run `wienerdog sync` to fix the permissions (`wienerdog doctor` lists them).'
    : '';
  const prefix = [identityWarn, formatAlerts(opts.alerts || []), opts.quarantineLine || '',
    secretQuarantineWarn, insecureModesWarn, opts.schedulerLine || '', opts.updateLine || '']
    .filter((s) => s !== '')
    .join('\n\n');
  const assembled = prefix ? `${prefix}\n\n${body}` : body;
  return capDigest(assembled, prefix);
}

/**
 * Sanitized basenames of the files currently in `<stateDir>/quarantine/`
 * (WP-123's staged-output quarantine), for `opts.secretQuarantine`. Reads the
 * DIRECTORY LISTING only — never file contents (they hold raw secrets).
 * Dot-prefixed entries (atomic-write temp files) are excluded. Missing or
 * unreadable dir → []. Sorted for a deterministic banner.
 * @param {string} stateDir
 * @returns {string[]}
 */
function listSecretQuarantine(stateDir) {
  try {
    return fs
      .readdirSync(path.join(stateDir, 'quarantine'))
      .filter((n) => !n.startsWith('.'))
      .map((n) => n.replace(/[^A-Za-z0-9._-]/g, '_'))
      .sort();
  } catch {
    return [];
  }
}

module.exports = { renderDigest, listSecretQuarantine, DigestCaps };
