'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { WienerdogError } = require('../errors');
const { defaultLayout } = require('../layout');
const { recordSkills, readRegistry } = require('./skill-registry');

// Tier-3 code floor. FIXED — never tuned by memory_mode (see WP-017 spec). A
// change under one of the Tier-3 directories (the layout's mapped identity_dir +
// skills_dir; defaults '06-Identity/' + '05-Skills/') survives only if its
// frontmatter satisfies ALL of: derived_from_untrusted === false,
// confidence >= 0.85, recurrence >= 3. Layout changes WHICH directories are
// Tier 3; it never relaxes these thresholds.
const MIN_CONFIDENCE = 0.85;
const MIN_RECURRENCE = 3;

/**
 * Run git inside the vault. Args are passed as an array (never a shell string —
 * paths may contain spaces). Non-zero exit throws WienerdogError unless
 * allowFail is set (then the raw result is returned for inspection).
 * @param {string} vaultDir
 * @param {string[]} args
 * @param {{allowFail?:boolean}} [opts]
 * @returns {import('child_process').SpawnSyncReturns<string>}
 */
function git(vaultDir, args, opts = {}) {
  const res = spawnSync('git', ['-C', vaultDir, ...args], { encoding: 'utf8' });
  if (res.error) {
    const hint =
      res.error.code === 'ENOENT'
        ? ' — git was not found on the job PATH. Install git (https://git-scm.com/downloads)' +
          ' or make sure it is on your PATH, then re-run the dream.'
        : '';
    throw new WienerdogError(`git could not run (${args[0]}): ${res.error.message}${hint}`);
  }
  if (!opts.allowFail && res.status !== 0) {
    throw new WienerdogError(`git ${args[0]} failed: ${(res.stderr || '').trim()}`);
  }
  return res;
}

/**
 * Assert vaultDir is a git repository.
 * @param {string} vaultDir
 * @throws {WienerdogError}
 */
function assertGitRepo(vaultDir) {
  const res = git(vaultDir, ['rev-parse', '--git-dir'], { allowFail: true });
  if (res.status !== 0) {
    throw new WienerdogError(`vault is not a git repository at ${vaultDir} — run \`npx wienerdog init\` first.`);
  }
}

/**
 * Assert the vault working tree is clean (no staged, unstaged or untracked
 * changes). The dream pipeline requires a clean baseline so the post-run diff is
 * exactly the brain's writes.
 * @param {string} vaultDir
 * @throws {WienerdogError}
 */
function assertCleanTree(vaultDir) {
  const res = git(vaultDir, ['status', '--porcelain', '-uall']);
  if (res.stdout.trim() !== '') {
    throw new WienerdogError('vault has uncommitted changes; dream skipped — commit or discard them first.');
  }
}

/**
 * If the vault working tree is dirty, commit ALL uncommitted changes (the user's
 * own session edits) as a single commit so the subsequent dream diff is exactly
 * the brain's writes. No-op on a clean tree (never make an empty commit — keeps a
 * no-edit night idempotent). The message is frozen — do not vary it. Uses the
 * `wienerdog` committer identity (matching the dream commit) so it works even
 * when the vault has no configured git identity.
 * @param {string} vaultDir
 * @returns {{committed:boolean, sha:string|null}}
 */
function precommitSessionEdits(vaultDir) {
  const status = git(vaultDir, ['status', '--porcelain', '-uall']);
  if (status.stdout.trim() === '') return { committed: false, sha: null };
  git(vaultDir, ['add', '-A']);
  git(vaultDir, [
    '-c',
    'user.name=wienerdog',
    '-c',
    'user.email=wienerdog@localhost',
    'commit',
    '-m',
    'vault: session edits before dream',
  ]);
  const sha = git(vaultDir, ['rev-parse', 'HEAD']).stdout.trim();
  return { committed: true, sha };
}

/**
 * Restore the vault working tree to HEAD: drop tracked modifications and remove
 * untracked non-ignored files (the brain's unvalidated writes). Uses `git clean
 * -fd` (NOT -x) so .gitignore'd files — e.g. the adopt starter-ignore's plugin
 * binaries — are preserved. Vault-scoped by construction (the vault IS the repo).
 * @param {string} vaultDir
 */
function restoreVaultToHead(vaultDir) {
  git(vaultDir, ['reset', '--hard', 'HEAD']);
  git(vaultDir, ['clean', '-fd']);
}

/**
 * Minimal frontmatter reader: a leading `--- ... ---` block of flat `key: value`
 * scalars. Unquoted `true`/`false` become booleans; quoted values stay strings;
 * everything else is a trimmed string. Missing/mangled block → {}. Same
 * line-based approach as the digest renderer (future extraction into a shared
 * module is fine when a third consumer appears — noted in the PR).
 * @param {string} fileText
 * @returns {Record<string, string|boolean>}
 */
function parseFrontmatter(fileText) {
  if (typeof fileText !== 'string') return {};
  const lines = fileText.split('\n');
  if (lines[0] !== '---') return {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return {};
  /** @type {Record<string, string|boolean>} */
  const data = {};
  for (const raw of lines.slice(1, end)) {
    if (/^\s/.test(raw)) continue; // top-level scalars only (ignore nested)
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const quoted =
      value.length >= 2 &&
      ((value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === "'" && value[value.length - 1] === "'"));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      // Drop an inline comment on unquoted values, then coerce booleans.
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
      if (value === 'true') {
        data[m[1]] = true;
        continue;
      }
      if (value === 'false') {
        data[m[1]] = false;
        continue;
      }
    }
    data[m[1]] = value;
  }
  return data;
}

/**
 * Decide whether a Tier-3 write satisfies the fixed code floor.
 * @param {string} vaultDir
 * @param {string} rel  vault-relative path
 * @returns {{ok:boolean, reason:string}}
 */
function tier3Decision(vaultDir, rel) {
  let text;
  try {
    text = fs.readFileSync(path.join(vaultDir, rel), 'utf8');
  } catch {
    // Missing (e.g. the brain deleted an identity file) → not satisfied; restore.
    return { ok: false, reason: 'Tier-3 path removed or unreadable; restored to HEAD' };
  }
  const fm = parseFrontmatter(text);
  const hasAll = 'confidence' in fm && 'recurrence' in fm && 'derived_from_untrusted' in fm;
  if (!hasAll) {
    return {
      ok: false,
      reason: 'Tier-3 path missing provenance frontmatter (needs confidence, recurrence, derived_from_untrusted)',
    };
  }
  const confidence = Number(fm.confidence);
  const recurrence = Number(fm.recurrence);
  const untrustedFalse = fm.derived_from_untrusted === false;
  const ok = untrustedFalse && confidence >= MIN_CONFIDENCE && recurrence >= MIN_RECURRENCE;
  if (ok) return { ok: true, reason: '' };
  return {
    ok: false,
    reason:
      `Tier-3 floor not met (derived_from_untrusted=${String(fm.derived_from_untrusted)}, ` +
      `confidence=${fm.confidence}, recurrence=${fm.recurrence}; requires false, >=${MIN_CONFIDENCE}, >=${MIN_RECURRENCE})`,
  };
}

/** Return the text AFTER the leading `--- … ---` frontmatter block (the body).
 *  No/mangled frontmatter → the whole text. @param {string} text @returns {string} */
function skillBody(text) {
  const lines = String(text).split('\n');
  if (lines[0] !== '---') return String(text);
  for (let i = 1; i < lines.length; i++) if (lines[i] === '---') return lines.slice(i + 1).join('\n');
  return String(text);
}

/**
 * Parse the INLINE-ARRAY frontmatter form `["claude:a","claude:b"]` (the form the
 * dream writes) into session ids. Rejects a non-array container or any element that
 * is not a complete, anchored `<harness>:<session_id>` — so `garbage claude:a` or a
 * bare scalar fails (finding: no unanchored substring matching).
 * @param {string} raw @returns {{ok:boolean, ids:string[]}}
 */
function parseSessionArray(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s.startsWith('[') || !s.endsWith(']')) return { ok: false, ids: [] };
  const inner = s.slice(1, -1).trim();
  if (inner === '') return { ok: true, ids: [] };
  const ids = [];
  for (const part of inner.split(',')) {
    const t = part.trim().replace(/^["']|["']$/g, ''); // strip one optional quote pair
    if (!/^[a-z0-9]+:[A-Za-z0-9_-]+$/.test(t)) return { ok: false, ids: [] };
    ids.push(t);
  }
  return { ok: true, ids };
}

/**
 * Value-check an allowlisted bare-promotion field change (ADR-0020): `status` must
 * advance incubating→active; `updated` must be stamped to the run date (WP-040);
 * `source_sessions` must stay an append-only superset of HEAD's ids (well-formed,
 * unique). Any other field, or a value failing these, is NOT a bare promotion.
 * @param {string} k @param {Record<string,any>} head @param {Record<string,any>} cur
 * @param {string} date  the dream run date
 * @returns {boolean}
 */
function promotionFieldOk(k, head, cur, date) {
  if (k === 'status') return head.status === 'incubating' && cur.status === 'active';
  if (k === 'updated') return cur.updated === date; // WP-040: bump `updated` to today
  if (k === 'source_sessions') {
    const cu = parseSessionArray(cur.source_sessions);
    const hd = parseSessionArray(head.source_sessions);
    if (!cu.ok || !hd.ok) return false; // malformed container/element
    const cset = new Set(cu.ids);
    if (cset.size !== cu.ids.length) return false; // unique
    return hd.ids.every((t) => cset.has(t)); // append-only superset
  }
  return false;
}

/**
 * A NEW skill draft eligible for the ownership registry: an untracked SKILL.md
 * under the skills dir whose folder is NOT a shipped `wienerdog-*` skill.
 * @param {string} rel  vault-relative path
 * @param {import('../layout').VaultLayout} layout
 * @returns {boolean}
 */
function isNewSkillDraft(rel, layout) {
  const skillsPrefix = layout.skills_dir + '/';
  if (!rel.startsWith(skillsPrefix) || path.basename(rel) !== 'SKILL.md') return false;
  const folder = rel.slice(skillsPrefix.length).split('/')[0] || '';
  return !/^wienerdog-/.test(folder);
}

/**
 * Skill-body revision guard (ADR-0020). Returns a revert-reason string if `rel`
 * is a SKILL.md modification outside the dream's revision scope, that altered
 * protected provenance, or whose BODY changed without a qualifying committed
 * learning authorizing it. Returns null otherwise — identity notes, other
 * skills-dir files, new-skill ADDs, promotions (body unchanged, provenance kept),
 * and compliant authorized revisions all return null and fall through to the
 * Tier-3 numeric floor.
 * @param {string} vaultDir @param {string} rel @param {{untracked:boolean}} change
 * @param {import('../layout').VaultLayout} layout @param {{skills:Object}} registry
 * @param {string} date  the dream run date (for the bare-promotion `updated` check)
 * @returns {string|null}
 */
function skillBodyViolation(vaultDir, rel, change, layout, registry, date) {
  const skillsPrefix = layout.skills_dir + '/';
  if (!rel.startsWith(skillsPrefix) || path.basename(rel) !== 'SKILL.md') return null;

  // Shipped wienerdog-* skills are permanently out of scope (defense in depth;
  // they are never registered either).
  const folder = rel.slice(skillsPrefix.length).split('/')[0] || '';
  if (/^wienerdog-/.test(folder)) {
    return 'skill-body change on a shipped wienerdog-* skill (out of revision scope)';
  }

  // A newly-added SKILL.md is skill synthesis, not a revision — the Tier-3 floor
  // governs it, and WP-083 registers it after the commit.
  if (change.untracked) return null;

  // ELIGIBILITY: a modification is allowed only on a skill in the ownership
  // registry (tamper-proof write-origin marker; HEAD frontmatter is forgeable).
  const entry = registry.skills[rel];
  if (!entry) return 'skill-body change on a skill not in the ownership registry (fail closed)';

  const headRes = git(vaultDir, ['show', `HEAD:${rel}`], { allowFail: true });
  if (headRes.status !== 0) return 'skill body modified but its committed version is unreadable';
  const head = parseFrontmatter(headRes.stdout);

  let curText;
  try {
    curText = fs.readFileSync(path.join(vaultDir, rel), 'utf8');
  } catch {
    return 'skill body unreadable after revision';
  }
  const cur = parseFrontmatter(curText);

  // PRESERVATION: registry id match (catch path reuse) + WP-040 immutables.
  if (cur.id !== entry.id) return 'skill id does not match the ownership registry (path reuse)';
  if (cur.origin !== head.origin) return 'skill revision changed origin (must be preserved)';
  if (cur.created !== head.created) return 'skill revision changed created (must be preserved)';
  if (cur.id !== head.id) return 'skill revision changed id (must be preserved)';
  if (head.derived_from_untrusted === true && cur.derived_from_untrusted !== true) {
    return 'skill revision lowered derived_from_untrusted (raise-only)';
  }

  // AUTHORIZATION. A body change ALWAYS needs a qualifying committed learning. A
  // frontmatter-only change is a bare PROMOTION needing no learning ONLY if its
  // sole differences are on the enumerated allowlist (status incubating→active, the
  // updated bump, a source_sessions append). ANY other frontmatter change
  // (confidence, recurrence, description, tags, revision_pattern_key, a status
  // regression, …) requires learning authorization too — closing the
  // "promotion exemption is too broad" gap.
  let needsAuth = skillBody(curText) !== skillBody(headRes.stdout);
  if (!needsAuth) {
    // The ONLY unauthorized-exempt frontmatter change is a REAL promotion: `status`
    // must actually advance incubating→active. Without that exact transition — an
    // updated-only or source_sessions-only edit, etc. — a qualifying learning is
    // required. (The exemption is the promotion, not "any unchanged-body change.")
    const promoting = head.status === 'incubating' && cur.status === 'active';
    if (!promoting) {
      needsAuth = true;
    } else {
      const PROMOTION_ALLOW = new Set(['status', 'updated', 'source_sessions']);
      for (const k of new Set([...Object.keys(head), ...Object.keys(cur)])) {
        if (head[k] === cur[k]) continue;
        // An allowlisted field must ALSO pass its value check (status direction,
        // updated stamped to today, source_sessions append-only superset).
        if (!PROMOTION_ALLOW.has(k) || !promotionFieldOk(k, head, cur, date)) { needsAuth = true; break; }
      }
    }
  }
  if (needsAuth) {
    const key = cur.revision_pattern_key;
    if (typeof key !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(key)) {
      return 'skill change needs a qualifying learning but has no valid revision_pattern_key';
    }
    const ledgerRel = path.join(path.dirname(rel), 'LEARNINGS.md');
    const ledRes = git(vaultDir, ['show', `HEAD:${ledgerRel}`], { allowFail: true });
    if (ledRes.status !== 0) return 'skill change needs a qualifying learning but no committed ledger authorizes it';
    const learning = parseLedgerEntries(ledRes.stdout)[key];
    if (!learning) return `revision_pattern_key ${key} not found in the committed learnings ledger`;
    if (learning.untrusted !== false) return `authorizing learning ${key} is untrusted-derived (never promotable)`;
    // Only CLAUDE sessions authorize: WP-084 invocation-binds + window-verifies them.
    // Codex sessions have no structured invocation signal, so they accumulate but
    // never count toward authorization (ADR-0020 v1 scope limit).
    const distinct = new Set(learning.sessionIds.filter((s) => s.startsWith('claude:'))).size;
    if (distinct < 3) {
      return `authorizing learning ${key} has ${distinct} distinct Claude-invoked sessions ` +
        `(needs >= 3 distinct sessions; Codex sessions do not authorize in v1)`;
    }
  }
  return null;
}

/**
 * Parse a LEARNINGS.md ledger into { <patternKey>: entry }. Line-based, mirroring
 * parseFrontmatter's approach. Backticks around the Pattern-Key value are stripped.
 * @param {string} text
 * @returns {Record<string, {key:string, patternKey:string|null, status:string|null,
 *   recurrence:string|null, sessionIds:string[], firstSeen:string|null,
 *   lastSeen:string|null, untrusted:boolean|null, observation:string|null}>}
 */
function parseLedgerEntries(text) {
  /** @type {Record<string, any>} */ const entries = {};
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const h = raw.match(/^##\s+(.+?)\s*$/);
    if (h) {
      cur = { key: h[1], patternKey: null, status: null, recurrence: null,
        sessionIds: [], firstSeen: null, lastSeen: null, untrusted: null, observation: null };
      entries[h[1]] = cur;
      continue;
    }
    if (!cur) continue;
    const b = raw.match(/^-\s*([A-Za-z_-]+):\s*(.*)$/);
    if (!b) continue;
    const field = b[1].toLowerCase();
    const val = b[2].trim();
    if (field === 'pattern-key') cur.patternKey = val.replace(/^`|`$/g, '');
    else if (field === 'status') cur.status = val;
    else if (field === 'recurrence') cur.recurrence = val;
    else if (field === 'session-ids') cur.sessionIds = val.split(',').map((s) => s.trim()).filter(Boolean);
    else if (field === 'first-seen') cur.firstSeen = val;
    else if (field === 'last-seen') cur.lastSeen = val;
    else if (field === 'derived_from_untrusted') cur.untrusted = val === 'true';
    else if (field === 'observation') cur.observation = val;
  }
  return entries;
}

const SID_RE = /^[a-z0-9]+:[A-Za-z0-9_-]+$/;
const PATTERN_KEY_RE = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/** @returns {string|null} a reason if entry `e` (heading `key`) is malformed, else null. */
function ledgerEntrySchemaViolation(key, e) {
  if (!PATTERN_KEY_RE.test(key)) return 'Pattern-Key heading is not a valid area.symptom slug';
  if (e.patternKey !== key) return 'Pattern-Key bullet does not match the heading';
  if (!e.status) return 'missing Status';
  if (e.status !== 'open' && !/^resolved\b/.test(e.status)) return 'Status must be open or resolved';
  if (!e.observation) return 'missing Observation';
  if (!e.firstSeen || !e.lastSeen) return 'missing First-Seen/Last-Seen';
  if (typeof e.untrusted !== 'boolean') return 'missing/invalid derived_from_untrusted';
  if (e.sessionIds.length === 0) return 'no Session-IDs';
  const seen = new Set();
  for (const id of e.sessionIds) {
    if (!SID_RE.test(id)) return `malformed Session-ID (${id})`;
    if (seen.has(id)) return `duplicate Session-ID (${id})`;
    seen.add(id);
  }
  if (Number(e.recurrence) !== seen.size) return 'Recurrence != distinct Session-ID count';
  return null;
}

/**
 * Is any of `parentSkill`'s invocation windows in this extract tainted by an
 * EXTERNAL tool_result? Window = [inv.index, next-invocation-index or
 * messages.length). The invocation's OWN paired result is the message at
 * `inv.resultIndex` (WP-080's id-pairing, NOT positional) and is EXCLUDED — it is
 * the registered skill's own Tier-3-gated body output. Every OTHER tool_result in
 * the window (Bash output, web content, file reads) taints. FAILS CLOSED (returns
 * true = tainted) on any malformed geometry: index out of range, or resultIndex
 * null / non-integer / outside the window.
 * @param {{messages?:Array, skill_invocations?:Array}} extract
 * @param {string} parentSkill
 * @returns {boolean}
 */
function invocationWindowTainted(extract, parentSkill) {
  const msgs = Array.isArray(extract.messages) ? extract.messages : [];
  const invs = Array.isArray(extract.skill_invocations) ? extract.skill_invocations : [];
  const starts = invs.map((si) => si.index).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  for (const inv of invs) {
    if (inv.skill !== parentSkill) continue;
    if (!Number.isInteger(inv.index) || inv.index < 0 || inv.index >= msgs.length) return true; // fail closed
    const next = starts.find((n) => n > inv.index);
    const end = next === undefined ? msgs.length : next;
    const ri = inv.resultIndex;
    if (!Number.isInteger(ri) || ri < inv.index || ri >= end) return true; // null/out-of-window own result → fail closed
    for (let i = inv.index; i < end; i++) {
      if (i === ri) continue;                                    // the invocation's own paired result — excluded
      if (msgs[i] && msgs[i].role === 'tool_result') return true; // any OTHER tool_result → taint
    }
  }
  return false;
}

/**
 * Ledger validator (ADR-0020). Returns a revert-reason string if `rel` is a
 * LEARNINGS.md whose write is invalid, else null. `registry` is readRegistry()'s
 * result (or {skills:{}} when no stateDir → every ledger fails the registered
 * check, fail closed).
 * @param {string} vaultDir @param {string} rel @param {{untracked:boolean}} change
 * @param {import('../layout').VaultLayout} layout @param {{skills:Object}} registry
 * @param {Map<string,object>} extractsBySession  this run's extracts keyed by `<harness>:<session_id>` (WP-084)
 * @returns {string|null}
 */
function ledgerViolation(vaultDir, rel, change, layout, registry, extractsBySession) {
  // (a) parent dir must hold a REGISTERED skill whose CURRENT SKILL.md still
  //     matches the registry entry — guard against a stale registry path (a
  //     deleted skill, or a different skill hand-authored at the same path). This
  //     is the same trust input WP-082 cross-checks; apply it to the ledger too.
  const skillRel = path.join(path.dirname(rel), 'SKILL.md');
  const regEntry = registry.skills[skillRel];
  if (!regEntry) return 'learnings ledger beside a skill not in the ownership registry (fail closed)';
  let skillText;
  try {
    skillText = fs.readFileSync(path.join(vaultDir, skillRel), 'utf8');
  } catch {
    return 'learnings ledger beside a registered skill whose SKILL.md is missing (fail closed)';
  }
  const skillFm = parseFrontmatter(skillText);
  if (skillFm.id !== regEntry.id) return 'learnings ledger parent skill id does not match the registry (path reuse)';
  if (skillFm.created !== regEntry.created) return 'learnings ledger parent skill created does not match the registry (path reuse)';

  let curText;
  try {
    curText = fs.readFileSync(path.join(vaultDir, rel), 'utf8');
  } catch {
    return 'learnings ledger unreadable';
  }
  const cur = parseLedgerEntries(curText);
  if (Object.keys(cur).length === 0) return 'learnings ledger has no valid entries';
  // (b) every entry validates against the schema.
  for (const [key, e] of Object.entries(cur)) {
    const reason = ledgerEntrySchemaViolation(key, e);
    if (reason) return `learnings ledger entry ${key}: ${reason}`;
  }
  // (c) append-only + raise-only vs HEAD (tracked modifications only). A tracked
  //     ledger whose committed version is unreadable FAILS CLOSED — never skip the
  //     history comparison (skipping it was a fail-open gap).
  let headEntries = {};
  if (!change.untracked) {
    const headRes = git(vaultDir, ['show', `HEAD:${rel}`], { allowFail: true });
    if (headRes.status !== 0) {
      return 'learnings ledger is tracked but its committed version is unreadable (cannot verify append-only)';
    }
    headEntries = parseLedgerEntries(headRes.stdout);
    for (const [key, he] of Object.entries(headEntries)) {
      const ce = cur[key];
      if (!ce) return `learnings ledger deleted an existing entry (${key}); ledger is append-only`;
      if (ce.firstSeen !== he.firstSeen) return `learnings ledger changed First-Seen of ${key} (immutable)`;
      if (ce.observation !== he.observation) return `learnings ledger rewrote the Observation of ${key} (immutable)`;
      if (he.untrusted === true && ce.untrusted !== true) {
        return `learnings ledger lowered derived_from_untrusted of ${key} (raise-only)`;
      }
      // (d) Session-IDs are append-only: every committed id must remain present, so
      //     a brain cannot REPLACE ids with invented ones to mint recurrence.
      const curIds = new Set(ce.sessionIds);
      for (const id of he.sessionIds) {
        if (!curIds.has(id)) return `learnings ledger dropped a committed Session-ID (${id}) of ${key} (append-only)`;
      }
      // (e) Recurrence must not regress (schema already ties it to the distinct-id
      //     count, so with (d) it can only grow via genuinely-new ids).
      if (Number(ce.recurrence) < Number(he.recurrence)) {
        return `learnings ledger decreased Recurrence of ${key} (must not regress)`;
      }
      // (f) Last-Seen must not move backward (ISO YYYY-MM-DD compares lexically).
      if (ce.lastSeen < he.lastSeen) return `learnings ledger moved Last-Seen of ${key} backward`;
      // (g) Status may only advance open → resolved (the WP-082 resolution path);
      //     never resolved → open, and never any other transition.
      if (ce.status !== he.status && !(he.status === 'open' && /^resolved\b/.test(ce.status))) {
        return `learnings ledger made an unauthorized Status change on ${key} (only open → resolved is allowed)`;
      }
    }
  }

  // (h) Bind newly-counted Claude sessions to real invocations of THIS skill, and
  //     derive trust from the invocation window (WP-084). Codex sessions are not
  //     verified here and never authorize (WP-082 counts Claude sessions only).
  const parentSkill = path.basename(path.dirname(rel)); // dream-created folder == skill name
  for (const [key, ce] of Object.entries(cur)) {
    const he = headEntries[key];
    const headSessions = new Set(he ? he.sessionIds : []);
    let derivedUntrusted = false;
    for (const sid of ce.sessionIds) {
      if (headSessions.has(sid)) continue;      // preserved — verified when it was added
      if (!sid.startsWith('claude:')) continue; // Codex: loose accumulation, never authorizes (v1)
      const extract = extractsBySession.get(sid);
      if (!extract) return `learnings ledger entry ${key}: new session ${sid} is not among this run's processed extracts`;
      const invs = Array.isArray(extract.skill_invocations) ? extract.skill_invocations : [];
      if (!invs.some((si) => si.skill === parentSkill)) {
        return `learnings ledger entry ${key}: session ${sid} did not invoke skill ${parentSkill}`;
      }
      if (invocationWindowTainted(extract, parentSkill)) derivedUntrusted = true;
    }
    if (derivedUntrusted && ce.untrusted !== true) {
      return `learnings ledger entry ${key}: derived_from_untrusted asserted lower than derived (an invocation window contains a tool_result)`;
    }
  }
  return null;
}

/**
 * Resolve a vault-relative changed path and test containment (catches symlink
 * and `..` escapes). Works for files that no longer exist (deleted) by resolving
 * the deepest existing ancestor.
 * @param {string} vaultReal  realpath of the vault
 * @param {string} vaultDir
 * @param {string} rel
 * @returns {{abs:string, inside:boolean}}
 */
function resolveContainment(vaultReal, vaultDir, rel) {
  const abs = path.resolve(vaultDir, rel);
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    let dir = path.dirname(abs);
    // Walk up to the deepest existing ancestor, then re-attach the tail.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const realDir = fs.realpathSync(dir);
        real = path.join(realDir, path.relative(dir, abs));
        break;
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) {
          real = abs;
          break;
        }
        dir = parent;
      }
    }
  }
  const relToVault = path.relative(vaultReal, real);
  const inside = relToVault !== '' && !relToVault.startsWith('..') && !path.isAbsolute(relToVault);
  return { abs, inside };
}

/**
 * Restore a changed path to its HEAD state, per item. Untracked additions are
 * removed; tracked modifications/deletions are checked out from HEAD.
 * @param {string} vaultDir
 * @param {string} rel
 * @param {boolean} untracked
 */
function revertPath(vaultDir, rel, untracked) {
  if (untracked) {
    fs.rmSync(path.join(vaultDir, rel), { force: true, recursive: true });
  } else {
    // Restore both index and working tree to HEAD for this path.
    git(vaultDir, ['checkout', 'HEAD', '--', rel]);
  }
}

/** @param {string} dir @returns {string[]} absolute file paths under dir, recursively. */
function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

/** @param {string} file @returns {string|null} sha256 hex, or null if unreadable. */
function hashFile(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Parse `git status --porcelain -z -uall` into {code, path, untracked} records.
 * Rename/copy entries (which carry a trailing source token) are not produced by
 * the brain, but are handled defensively by consuming the extra token.
 * @param {string} vaultDir
 * @returns {Array<{code:string, path:string, untracked:boolean}>}
 */
function changedPaths(vaultDir) {
  const res = git(vaultDir, ['status', '--porcelain', '-z', '-uall']);
  const tokens = res.stdout.split('\0');
  /** @type {Array<{code:string, path:string, untracked:boolean}>} */
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === '') continue;
    const code = tok.slice(0, 2);
    const rel = tok.slice(3);
    if (code[0] === 'R' || code[0] === 'C') i++; // consume the rename/copy source token
    out.push({ code, path: rel, untracked: code === '??' });
  }
  return out;
}

/**
 * Validate the brain's writes against the vault git repo, revert violations PER
 * ITEM (never abort the whole run), append the enforcement record to the dream
 * report, and make exactly ONE commit.
 *
 * @param {{ vaultDir:string, scratchDir:string, date:string, expectedScratch:string[],
 *           scratchBaseline?:Record<string,string>, stateDir?:string,
 *           layout?:import('../layout').VaultLayout }} o
 *   stateDir = the core `state/` dir; when provided, newly-accepted dream-created
 *     skills are recorded in `state/skill-registry.json` after the commit (ADR-0020).
 *     Omitted → no registry write (older direct callers / integration tests).
 *   layout = the vault layout (WP-022). Defaults to defaultLayout() when absent, so
 *     direct-call/integration tests that omit it keep the current behavior. Only the
 *     Tier-3 directories and the report location follow the layout; the floor does not.
 *   expectedScratch = the exact scratch files WP-008's collectExtracts wrote
 *     (its `wrote` array) — the baseline for the scratch-integrity check.
 *   scratchBaseline = OPTIONAL map of {absolutePath: sha256} captured by the
 *     pipeline BEFORE the brain ran. Without it, only the presence check (a NEW
 *     file in scratch) runs; with it, content mutation of an expected extract is
 *     also detected. The exact contract's four fields are always honored; this
 *     is additive because content-change cannot be detected from paths alone
 *     (see the PR "Decisions made").
 * @returns {{ committed:string[], reverted:Array<{path:string,reason:string}>,
 *             outOfVault:string[], sha:string|null, counts:{notes:number,skills:number} }}
 */
function validateAndCommit(o) {
  const { vaultDir, scratchDir, date, expectedScratch, scratchBaseline, stateDir } = o;
  const layout = o.layout || defaultLayout();

  // Tier-3 directories resolve from the layout (mapped identity + skills dirs);
  // the floor thresholds above are layout-independent.
  const tier3Prefixes = [layout.identity_dir + '/', layout.skills_dir + '/'];
  const isTier3 = (rel) => tier3Prefixes.some((p) => rel.startsWith(p));

  // Preconditions (the caller checks these before the brain runs; re-assert).
  assertGitRepo(vaultDir);
  const vaultReal = fs.realpathSync(vaultDir);
  const registry = stateDir ? readRegistry(stateDir) : { version: 1, skills: {} };

  const isLearningsLedger = (rel) =>
    rel.startsWith(layout.skills_dir + '/') && path.basename(rel) === 'LEARNINGS.md';

  /** @type {Array<{path:string, reason:string}>} */
  const reverted = [];
  /** @type {Array<{path:string, reason:string}>} */
  const outOfVaultDetailed = [];
  /** @type {Array<{rel:string, created:string, id:string}>} */
  const newSkills = [];

  // ── Step 1: OUT-OF-VAULT (scratch integrity) ─────────────────────────────
  // The brain is granted read+write to scratchDir by --add-dir (WP-008) but must
  // not write there. Any file that is not one of collectExtracts' expected
  // outputs — or an expected output whose content changed — is a brain write
  // outside the vault: delete it, record it. NOTE: this is the ONE adjacent
  // readable dir; the --add-dir sandbox prevents writes elsewhere in core/home,
  // and the git-diff scan below covers escapes back into the vault.
  const expectedSet = new Set((expectedScratch || []).map((p) => path.resolve(p)));
  const baseline = scratchBaseline || null;
  for (const file of listFilesRecursive(scratchDir)) {
    const abs = path.resolve(file);
    if (!expectedSet.has(abs)) {
      fs.rmSync(abs, { force: true });
      outOfVaultDetailed.push({ path: abs, reason: 'brain wrote into the read-only scratch dir; deleted' });
      continue;
    }
    if (baseline) {
      const before = baseline[abs];
      if (before && hashFile(abs) !== before) {
        fs.rmSync(abs, { force: true });
        outOfVaultDetailed.push({ path: abs, reason: 'brain modified a read-only scratch extract; deleted' });
      }
    }
  }

  // WP-084: index this run's processed extracts so the ledger validator can bind
  // counted sessions to real invocations and derive trust from the invocation
  // window. expectedScratch are collectExtracts' outputs (WP-008); Step-1's
  // scratch-integrity check guarantees they are byte-unmodified.
  const extractsBySession = new Map();
  for (const p of (expectedScratch || [])) {
    try {
      const ex = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (ex && ex.harness && ex.session_id) extractsBySession.set(`${ex.harness}:${ex.session_id}`, ex);
    } catch { /* unreadable extract → its sessions won't verify → fail closed in (h) */ }
  }

  // ── Step 2: classify each vault change ───────────────────────────────────
  for (const change of changedPaths(vaultDir)) {
    const rel = change.path;
    const { inside } = resolveContainment(vaultReal, vaultDir, rel);
    if (!inside) {
      // a. symlink / `..` escape out of the vault → restore + record.
      revertPath(vaultDir, rel, change.untracked);
      outOfVaultDetailed.push({ path: rel, reason: 'change resolved outside the vault (symlink or `..` escape); reverted' });
      continue;
    }
    if (isLearningsLedger(rel)) {
      // Quarantined ledger: validated (not numeric-floored). Keep iff it passes.
      const reason = ledgerViolation(vaultDir, rel, change, layout, registry, extractsBySession);
      if (reason) {
        // Revert safely even when HEAD has no version of this path (untracked add, or
        // a staged/never-committed file whose `git checkout HEAD -- rel` would fail):
        // remove it; restore from HEAD only when a committed version exists.
        if (git(vaultDir, ['cat-file', '-e', `HEAD:${rel}`], { allowFail: true }).status === 0) {
          revertPath(vaultDir, rel, false);
        } else {
          fs.rmSync(path.join(vaultDir, rel), { force: true, recursive: true });
        }
        reverted.push({ path: rel, reason });
      }
      continue;
    }
    if (isTier3(rel)) {
      // b0. Skill-body revision guard (ADR-0020) runs BEFORE the numeric floor so a
      //     scope/preservation/authorization violation reports a precise reason.
      const skillReason = skillBodyViolation(vaultDir, rel, change, layout, registry, date);
      if (skillReason) {
        revertPath(vaultDir, rel, change.untracked);
        reverted.push({ path: rel, reason: skillReason });
        continue;
      }
      // b. Tier-3 gate.
      const decision = tier3Decision(vaultDir, rel);
      if (!decision.ok) {
        revertPath(vaultDir, rel, change.untracked);
        reverted.push({ path: rel, reason: decision.reason });
        continue;
      }
      // Accepted. If it is a NEW (untracked) dream-created skill draft, remember it
      // for the ownership registry (written after the commit — Step 6).
      if (change.untracked && isNewSkillDraft(rel, layout)) {
        const fm = parseFrontmatter(fs.readFileSync(path.join(vaultDir, rel), 'utf8'));
        newSkills.push({ rel, id: String(fm.id || ''), created: String(fm.created || date) });
      }
      continue;
    }
    // c. Tier-1/2 note, daily log, or report → keep.
  }

  // ── Step 4: append the enforcement section to the dream report ───────────
  // (Step 3, the revert mechanic, is applied inline above via revertPath.)
  const reportRel = path.join(layout.reports_dir, `${date}.md`);
  const reportAbs = path.join(vaultDir, reportRel);
  if (!fs.existsSync(reportAbs)) {
    fs.mkdirSync(path.dirname(reportAbs), { recursive: true });
    fs.writeFileSync(reportAbs, `# Dream report — ${date}\n`);
  }
  const enforcementLines = [];
  for (const r of reverted) enforcementLines.push(`- \`${r.path}\` — ${r.reason}`);
  for (const r of outOfVaultDetailed) enforcementLines.push(`- \`${r.path}\` — ${r.reason}`);
  if (enforcementLines.length === 0) enforcementLines.push('- none');
  fs.appendFileSync(
    reportAbs,
    `\n## Reverted by orchestrator (policy enforcement)\n${enforcementLines.join('\n')}\n`
  );

  // ── Step 5: stage everything and make exactly ONE commit ─────────────────
  git(vaultDir, ['add', '-A']);
  const staged = git(vaultDir, ['diff', '--cached', '--name-status', '-z']);
  const stagedTokens = staged.stdout.split('\0');
  /** @type {string[]} */
  const committed = [];
  let notes = 0;
  let skills = 0;
  for (let i = 0; i < stagedTokens.length; i++) {
    const status = stagedTokens[i];
    if (status === '') continue;
    // name-status -z: <STATUS>\0<PATH>\0 (renames add a second path token).
    let rel = stagedTokens[++i];
    if (status[0] === 'R' || status[0] === 'C') rel = stagedTokens[++i];
    committed.push(rel);
    if (status[0] !== 'A' && status[0] !== 'M') continue; // count added/modified only
    if (rel.startsWith(layout.skills_dir + '/')) skills++;
    else if (rel.startsWith(layout.reports_dir + '/')) continue;
    else notes++;
  }

  git(vaultDir, [
    '-c',
    'user.name=wienerdog',
    '-c',
    'user.email=wienerdog@localhost',
    'commit',
    '-m',
    `dream: ${date} — ${notes} notes, ${skills} skills`,
  ]);
  const sha = git(vaultDir, ['rev-parse', 'HEAD']).stdout.trim();

  // ── Step 6: record newly-accepted dream-created skills in the ownership registry
  //     (ADR-0020). AFTER the commit so the registry only ever references committed
  //     skills. A crash between the commit and here leaves a committed-but-
  //     unregistered (never-revisable) skill — fail closed, no backfill. Skipped
  //     when no stateDir is provided (older direct callers / integration tests).
  if (stateDir && newSkills.length > 0) recordSkills(stateDir, newSkills);

  return {
    committed,
    reverted,
    outOfVault: outOfVaultDetailed.map((r) => r.path),
    sha,
    counts: { notes, skills },
  };
}

module.exports = {
  validateAndCommit,
  parseFrontmatter,
  assertGitRepo,
  assertCleanTree,
  precommitSessionEdits,
  restoreVaultToHead,
};
