'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WienerdogError } = require('../errors');
const { getPaths } = require('../paths');
const { spawnPinnedSync } = require('../exec-identity');
const { defaultLayout } = require('../layout');
const { recordSkills, readRegistry } = require('./skill-registry');
const { isCapabilityAllowed, CAPABILITY } = require('../safety-profile');
const { parse, coerceScalar } = require('../frontmatter');
const { scanAndRedact, hasHardFinding } = require('../secret-scan');
const { displayName } = require('./ledger');

// The four identity files the digest injects (direct children of identity_dir).
// A0 pre-use freeze (WP-109): the dream may not auto-change these until a
// human-ratified exact-byte registry exists (audit A3) — see the Tier-3 branch
// of validateAndCommit below.
const INJECTED_IDENTITY_FILES = ['profile.md', 'preferences.md', 'goals.md', 'instructions.md'];

/**
 * Is `rel` one of the four injected identity files (direct child of
 * layout.identity_dir)? Other Tier-3 identity notes (e.g. a hand-authored
 * `06-Identity/valid-identity.md`) are NOT injected identity, so they return false
 * and remain governed by the ordinary Tier-3 numeric floor.
 * @param {string} rel  vault-relative path
 * @param {import('../layout').VaultLayout} layout
 * @returns {boolean}
 */
function isInjectedIdentity(rel, layout) {
  // Case-insensitive (WP-116, ADR-0021): on a case-insensitive filesystem
  // `06-Identity/Profile.md` and `06-Identity/profile.md` are the same inode, so
  // a case-variant dream write must hit the freeze branch too (defense in depth
  // alongside the registry's folded path keys).
  const prefix = (layout.identity_dir + '/').toLowerCase();
  const low = String(rel).toLowerCase();
  if (!low.startsWith(prefix)) return false;
  return INJECTED_IDENTITY_FILES.includes(low.slice(prefix.length)); // direct child only
}

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
 * A7 (WP-154, R13/R15): git is spawned through the encapsulated pinned exec
 * API — its verified pinned ABSOLUTE realpath, never the bare name and never a
 * raw path — so a fake `git` planted earlier on the job PATH can never win. A
 * drifted/tampered/unsupported pin makes `spawnPinnedSync` THROW a
 * WienerdogError (fail safe; the message points at `wienerdog sync`), the same
 * surface the caller already handles.
 * @param {string} vaultDir
 * @param {string[]} args
 * @param {{allowFail?:boolean}} [opts]
 * @returns {{status:number|null, signal:string|null, stdout:string, stderr:string}}
 */
function git(vaultDir, args, opts = {}) {
  const res = spawnPinnedSync('git', getPaths(), {
    args: ['-C', vaultDir, ...args],
    env: process.env,
    platform: process.platform,
    encoding: 'utf8',
  });
  if (res.error) {
    // A post-verify spawn error is essentially unreachable (the realpath was
    // just verified), but stay defensive; the error is already sanitized to the
    // logical name + an approved code (no path leaks).
    throw new WienerdogError(`git could not run (${args[0]}): ${res.error.message}`);
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
 * Frontmatter reader for the validator: a leading `--- ... ---` block of flat
 * `key: value` scalars, lexed by the ONE shared strict parser
 * (`src/core/frontmatter.js`, audit A4 / ADR-0022 / WP-115) and coerced by the
 * one shared scalar coercer. Unquoted `true`/`false` become booleans; quoted
 * values stay strings; everything else is a trimmed string. Missing/mangled
 * block → {}.
 * @param {string} fileText
 * @returns {Record<string, string|boolean>}
 */
function parseFrontmatter(fileText) {
  if (typeof fileText !== 'string') return {};
  const fm = parse(fileText); // shared lexer: delimiters + key-line rules
  /** @type {Record<string, string|boolean>} */
  const data = {};
  for (const [k, raw] of fm.fields) {
    const { value, quoted } = coerceScalar(raw);
    if (!quoted && value === 'true') {
      data[k] = true;
      continue;
    }
    if (!quoted && value === 'false') {
      data[k] = false;
      continue;
    }
    data[k] = value;
  }
  return data;
}

// ── malformed-block refusal (ADR-0022 Decision 4) ───────────────────────────
// A block the ONE shared strict parser reports as `malformed` (a duplicate
// top-level key, an indented line, or a line that is not `key: value`) excludes
// the note UNCONDITIONALLY — whether or not it also carries floor-passing
// values. The refusal lives at the SECURITY DECISIONS below, never in the view
// above: emptying parseFrontmatter's record on `malformed` would erase the
// difference between a field being ABSENT and one being HIDDEN, and every
// preservation check reads absence as agreement.
const MALFORMED_REASON = 'malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)';
const MALFORMED_PARENT_SKILL_REASON = 'malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)';

/**
 * Does `text` carry a frontmatter block the shared strict parser rejects? Called
 * on exactly the bytes the calling decision is about to compare fields from.
 * @param {string} text
 * @returns {boolean}
 */
function blockMalformed(text) {
  return parse(text).malformed;
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
  // Refuse a malformed block BEFORE the floor: its junk can sit beside three
  // present, floor-passing provenance values, and the missing-frontmatter reason
  // would then state a falsehood.
  if (blockMalformed(text)) return { ok: false, reason: MALFORMED_REASON };
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
 *  No/mangled frontmatter → the whole text. Delegated to the ONE shared parser's
 *  body rule (`frontmatter.parse`, audit A4 / WP-115 — byte-identical semantics).
 *  @param {string} text @returns {string} */
function skillBody(text) {
  return parse(String(text)).body;
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
  // A malformed side is not evidence of agreement. Refuse before the immutable
  // field comparisons AND before the raise-only flag read below — a malformed
  // HEAD must never read as "not true".
  if (blockMalformed(headRes.stdout)) return MALFORMED_REASON;
  const head = parseFrontmatter(headRes.stdout);

  let curText;
  try {
    curText = fs.readFileSync(path.join(vaultDir, rel), 'utf8');
  } catch {
    return 'skill body unreadable after revision';
  }
  if (blockMalformed(curText)) return MALFORMED_REASON;
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
  // The malformed bytes here are the sibling SKILL.md's, but the path this site
  // reverts is LEARNINGS.md — so the reason names the parent skill.
  if (blockMalformed(skillText)) return MALFORMED_PARENT_SKILL_REASON;
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

/** The pre-scrub originals the redact arm writes live one level down, so the
 *  withhold banner (which lists direct FILE entries only) never mentions them. */
const REDACTED_SUBDIR = 'redacted';

/** How many pre-scrub originals `state/quarantine/redacted/` keeps
 *  (OWNER-APPROVED). The copies a run creates are never evicted by that run,
 *  so a run that redacts more notes than this ends above the cap and the next
 *  redacting run prunes it back. `state/quarantine/` itself stays unbounded. */
const REDACTED_RETENTION_CAP = 50;

/**
 * Preserve the working-tree bytes of a flagged vault file into the private
 * quarantine tree (audit A5, WP-123 OWNER-APPROVED): dir 0700, file 0600,
 * atomic write (tmp + rename), name `<date>-<sanitized-basename>` with a
 * numeric suffix before the extension on collision.
 *
 * Best-effort: any failure (including a missing stateDir) returns `null`.
 * `null` is falsy exactly where the previous `false` was, so the withhold call
 * site keeps its `if (!preserved)` shape.
 *
 * @param {string|undefined} stateDir
 * @param {string} vaultDir
 * @param {string} rel  vault-relative path of the flagged file
 * @param {string} date  the dream run date (YYYY-MM-DD)
 * @param {'withheld'|'redacted'} [kind='withheld']  selects the destination:
 *   'withheld' -> <stateDir>/quarantine/           (the note is NOT in the vault)
 *   'redacted' -> <stateDir>/quarantine/redacted/  (the note IS in the vault, scrubbed)
 * @returns {{name:string, bytes:Buffer}|null} the destination BASENAME actually
 *   written TOGETHER WITH THE EXACT BYTES IT PRESERVED, or `null` on any
 *   failure. The caller cannot reconstruct the name — `displayName` throws the
 *   directories away and the collision loop appends `-1`, `-2`, … — and the
 *   bytes are the redact arm's single source of truth (reading the file a
 *   second time to obtain them is the TOCTOU this return closes).
 */
function quarantinePreserve(stateDir, vaultDir, rel, date, kind = 'withheld') {
  // Code-supplied, never user input: a typo must fail loudly rather than write
  // to a third directory. Deliberately OUTSIDE the try below, which is total.
  if (kind !== 'withheld' && kind !== 'redacted') {
    throw new WienerdogError(`quarantinePreserve: unknown kind ${JSON.stringify(kind)}`);
  }
  let tmp = null;
  try {
    if (!stateDir) return null;
    const content = fs.readFileSync(path.join(vaultDir, rel)); // Buffer → byte-identical copy
    const qdir = kind === 'redacted'
      ? path.join(stateDir, 'quarantine', REDACTED_SUBDIR)
      : path.join(stateDir, 'quarantine');
    fs.mkdirSync(qdir, { recursive: true, mode: 0o700 });
    fs.chmodSync(qdir, 0o700);
    const base = displayName(rel); // shared attacker-safe basename sanitizer (WP-119/120)
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    let name = `${date}-${stem}${ext}`;
    let dest = path.join(qdir, name);
    for (let n = 1; fs.existsSync(dest); n += 1) {
      name = `${date}-${stem}-${n}${ext}`;
      dest = path.join(qdir, name);
    }
    tmp = path.join(qdir, `.tmp-${process.pid}-${stem}${ext}`);
    fs.writeFileSync(tmp, content, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, dest);
    return { name, bytes: content };
  } catch {
    try {
      if (tmp) fs.rmSync(tmp, { force: true });
    } catch { /* best-effort tmp cleanup; the caller reverts regardless */ }
    return null;
  }
}

/**
 * The 1-based line numbers THIS run added, read out of a `git diff -U0` hunk
 * header. The header shape is not the obvious one: git omits `,<count>` on
 * either side whenever that side's count is 1, and it omits them
 * independently, so a pattern requiring `,b` never matches a single-line
 * replacement (`@@ -2 +2 @@`) at all and one that reads a missing `,d` as 0
 * never matches a single-line insertion (`@@ -2,0 +3 @@`). Both omissions fail
 * closed — the scrub becomes a no-op and the note is withheld — which is why
 * both are parsed here rather than discovered later.
 * @param {string} diff  the raw `git diff --cached -U0 -- <rel>` output
 * @returns {number[]} 1-based line numbers in the NEW file
 */
function addedLineNumbersFromDiff(diff) {
  /** @type {number[]} */
  const out = [];
  for (const line of String(diff).split('\n')) {
    // Anchored at ^ and indifferent to the trailing function-context string.
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    const start = Number(m[3]);
    const count = m[4] === undefined ? 1 : Number(m[4]); // absent → 1; 0 → pure deletion
    for (let i = 0; i < count; i += 1) out.push(start + i);
  }
  return out;
}

/**
 * Can these bytes be decoded as UTF-8 and re-encoded to exactly themselves?
 *
 * THE PER-LINE SCRUB HAS TO DECODE THE WHOLE NOTE, AND A DECODE IS ONLY SAFE IF
 * IT ROUND-TRIPS. `Buffer.toString('utf8')` never fails: it replaces every
 * invalid byte with U+FFFD. Re-encoding that string then writes three different
 * bytes back — so on a Latin-1 (or otherwise not-quite-UTF-8) note the gate
 * would rewrite lines it never touched, all over the file, while reporting that
 * it replaced only the added ones. Git classifies such a file as TEXT whenever
 * it holds no NUL byte, so the binary fail-closed branch does not catch it.
 *
 * A note that fails this check is withheld instead of scrubbed — the behaviour
 * this gate had before the redact arm existed, which is the right default for a
 * file that cannot be processed without risking its bytes.
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isLosslessUtf8(buf) {
  return Buffer.compare(Buffer.from(buf.toString('utf8'), 'utf8'), buf) === 0;
}

/**
 * Rewrite exactly the lines THIS run added, replacing each with its sanitized
 * form. Never touches a line the run did not add — a secret already committed
 * in HEAD is not rewritten (ADR-0024's "the gate scans the added bytes").
 *
 * SANITIZATION UNIT: one line at a time. Each added line number L is replaced
 * by `scanAndRedact(lines[L-1]).text`, not the joined blob the gate scanned —
 * per-line keeps the line count fixed and keeps the rewrite local. It is
 * equivalent to the blob scan because the only `redact`-severity producer is
 * the context-free entropy tier, whose alphabet contains no whitespace.
 *
 * ORDER (INDEX-FIRST): compute → verify → write the sanitized bytes to a
 * same-directory temp → STAGE the temp's blob in the git index at `rel` →
 * only then rename the temp over the target. The git index is written STRICTLY
 * BEFORE the working tree, so a kill inside the arm can only leave the index
 * sanitized over a working tree holding the user's own unmodified text — never
 * the other way round, which is the state a user reads as "the secret is gone"
 * while a later `git commit` still ships it.
 *
 * NEVER THROWS: like `quarantinePreserve`, the whole body sits in one try and
 * every exception returns false, so no failure of this helper can escape the
 * caller's fall-through.
 *
 * @param {string} vaultDir
 * @param {string} rel
 * @param {number[]} addedLineNumbers  1-based line numbers in the NEW file
 * @param {Buffer} captured  the EXACT bytes `quarantinePreserve` preserved for
 *   this path — the scrub's only input. This helper NEVER reads the target to
 *   obtain its content; it reads it once more immediately before the rename,
 *   ONLY to compare against this buffer. A mismatch means the note's owner
 *   changed it under the arm, so the scrub is abandoned without renaming and
 *   the user's own save survives untouched.
 * @returns {boolean} true iff the scrub is verified complete and staged
 */
function scrubAddedLines(vaultDir, rel, addedLineNumbers, captured) {
  const target = path.join(vaultDir, rel);
  let tmp = null;
  try {
    // Fail closed on a note whose bytes are not losslessly representable as
    // UTF-8: decoding it would substitute U+FFFD for every invalid byte and the
    // re-encode would then corrupt lines this run never added. The caller
    // withholds instead. Held here rather than only at the call site so the
    // exported helper is safe for every caller.
    if (!isLosslessUtf8(captured)) return false;
    const raw = captured.toString('utf8');
    const trailingNewline = raw.endsWith('\n');
    const lines = (trailingNewline ? raw.slice(0, -1) : raw).split('\n');
    // Bounds FIRST, before any indexing and before any write.
    for (const l of addedLineNumbers) {
      if (!Number.isInteger(l) || l < 1 || l > lines.length) return false;
    }
    for (const l of addedLineNumbers) {
      lines[l - 1] = scanAndRedact(lines[l - 1]).text;
    }
    const out = Buffer.from(lines.join('\n') + (trailingNewline ? '\n' : ''), 'utf8');
    // A no-op means the rewrite and the gate's own scan disagree — a defect,
    // and a defect in a secret gate withholds.
    if (Buffer.compare(out, captured) === 0) return false;
    // The verified-scrub postcondition: without it this helper can only report
    // what it TRIED to do, and a silent failure commits the raw secret while
    // the report announces a successful redaction.
    for (const l of addedLineNumbers) {
      if (scanAndRedact(lines[l - 1]).findings.length > 0) return false;
    }
    // Same-directory temp + rename. A truncating whole-file write would leave a
    // half-scrubbed note on disk on ENOSPC/EIO, and the withhold fall-through
    // would then preserve THAT as "the true original".
    const mode = fs.statSync(target).mode & 0o777;
    tmp = path.join(
      path.dirname(target),
      `.${path.basename(target)}.wienerdog-scrub.${process.pid}.tmp`
    );
    // `mode` is a CREATION mode and is filtered by the umask, so the explicit
    // chmod is required — without it a 0644 note silently becomes 0600 on a
    // machine with a tight umask, i.e. this gate re-permissions the user's file.
    fs.writeFileSync(tmp, out, { mode });
    fs.chmodSync(tmp, mode);
    // ── Index-first stage. Every call allowFail + status-checked: the plain
    //    helper throws on a non-zero exit, and a throw here would abort the run
    //    instead of falling through to the withhold.
    const staged = git(vaultDir, ['ls-files', '--stage', '--', rel], { allowFail: true });
    if (staged.status !== 0) return false;
    const gitMode = String(staged.stdout).trim().split(/\s+/)[0];
    if (!gitMode) return false; // empty stdout — nothing staged at this path
    // `--path rel` makes git apply the same .gitattributes clean filters and
    // core.autocrlf conversion it would apply to the real path, so the blob is
    // byte-identical to what `git add rel` produces after the rename.
    const blob = git(vaultDir, ['hash-object', '-w', '--path', rel, '--', tmp], { allowFail: true });
    if (blob.status !== 0) return false;
    const sha = String(blob.stdout).trim();
    if (!sha) return false;
    const updated = git(
      vaultDir,
      ['update-index', '--add', '--cacheinfo', gitMode, sha, rel],
      { allowFail: true }
    );
    if (updated.status !== 0) return false;
    // The last act before the rename: re-read the target and compare it against
    // the captured bytes. A mid-dream editor save lands here, and overwriting it
    // would destroy the only copy of what the user actually wrote — the copy in
    // `redacted/` holds the PRE-save bytes. The staged blob is the sanitized
    // form, so abandoning here leaves nothing raw in the index.
    if (Buffer.compare(fs.readFileSync(target), captured) !== 0) return false;
    fs.renameSync(tmp, target);
    tmp = null; // the rename IS the removal on this path
    return true;
  } catch {
    return false;
  } finally {
    if (tmp) {
      // The temp lives inside the vault, which Step 5's `git add -A` stages
      // wholesale, so it must never survive the call.
      try {
        fs.rmSync(tmp, { force: true });
      } catch { /* best-effort */ }
    }
  }
}

/**
 * Keep `state/quarantine/redacted/` bounded. Runs ONCE per gate run, after the
 * loop over changed paths, and only when at least one redaction completed — a
 * run that failed never runs a delete path over the recovery directory.
 *
 * Never deletes a copy THIS run created: `(mtimeMs, name)` ordering falls back
 * to the basename on a tie or a skewed clock, which sorts by note name within a
 * date, so a copy the dream report is about to name could otherwise be evicted
 * by the run that wrote it. The cap therefore yields — a run creating more
 * copies than the cap ends above it, holding exactly its own.
 *
 * Best-effort: a failed prune is ignored and the arm still completes.
 * @param {string|undefined} stateDir
 * @param {Set<string>} created  every basename this run wrote into `redacted/`
 */
function pruneRedactedOriginals(stateDir, created) {
  if (!stateDir) return;
  try {
    const dir = path.join(stateDir, 'quarantine', REDACTED_SUBDIR);
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
    let total = entries.length;
    if (total <= REDACTED_RETENTION_CAP) return;
    const candidates = entries
      .filter((e) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}-/.test(e.name) && !created.has(e.name))
      .map((e) => {
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(path.join(dir, e.name)).mtimeMs;
        } catch { /* unreadable → oldest */ }
        return { name: e.name, mtimeMs };
      })
      .sort((a, b) => (a.mtimeMs - b.mtimeMs) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const c of candidates) {
      if (total <= REDACTED_RETENTION_CAP) break;
      try {
        fs.rmSync(path.join(dir, c.name), { force: true });
        total -= 1;
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort: a failed prune never fails the arm */ }
}

/**
 * The `WienerdogError` the gate raises when it would otherwise destroy a
 * working-tree file that no durable artefact holds the current bytes of.
 *
 * It is the ONLY surface that reaches the user on an abort — the dream report
 * is never appended, the reverted list is never rendered, and no banner fires —
 * so it carries all four facts: which note, which copies could not be saved,
 * whether the file on disk could be checked against a copy, and where a
 * surviving copy is. Metadata only: the path, the already-sanitized basename
 * and the outcome words, never a matched byte and never a line of the note.
 *
 * The path is rendered with `JSON.stringify` — a vault file name is chosen by
 * whatever wrote the note, and a raw newline would forge a second line of
 * output while a raw ANSI escape would reposition or hide what follows, in the
 * terminal the user is reading to decide what happened to their note. The JSON
 * string form is deterministic and reversible: it escapes every control
 * character and `JSON.parse` returns the original path exactly, so two names
 * that a lossy sanitizer would collapse together stay distinguishable.
 *
 * @param {string} rel  vault-relative path
 * @param {string|null} redactedName  the surviving `redacted/` basename, if any
 * @param {string} identity  what the on-disk check could establish
 * @returns {string}
 */
function secretGateAbortMessage(rel, redactedName, identity) {
  const which = redactedName === null
    ? 'neither the redaction copy nor the withheld copy could be saved'
    : 'the withheld copy could not be saved; the redaction copy was saved';
  const where = redactedName === null
    ? ''
    : ` The unredacted original is state/quarantine/redacted/${redactedName}.`;
  return (
    `the secret check stopped before changing ${JSON.stringify(rel)}: ${which}, and the check ` +
    `that the file on disk still matches a saved copy was ${identity}. Nothing was reverted, ` +
    `removed or committed, so the note is exactly where it was.${where}`
  );
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
 *           layout?:import('../layout').VaultLayout, profile?:Record<string,string> }} o
 *   stateDir = the core `state/` dir; when provided, newly-accepted dream-created
 *     skills are recorded in `state/skill-registry.json` after the commit (ADR-0020).
 *     Omitted → no registry write (older direct callers / integration tests).
 *   profile = A0 pre-use freeze (WP-109) code-level test seam ONLY (never env/argv).
 *     Omitted → the frozen profile, so a dream write to an injected identity file
 *     (profile/preferences/goals/instructions.md) is reverted even when it clears
 *     the Tier-3 numeric floor; pass `allowAll()` to make it Tier-3-governed again.
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
 *             outOfVault:string[], sha:string|null, counts:{notes:number,skills:number},
 *             secretReverts:number, secretRedactions:number }}
 *   secretReverts = files WITHHELD by the EP2 staged-output secret gate
 *   (WP-123) — a quarantine-severity finding, or unscannable binary content.
 *   Unchanged meaning: content this run produced was NOT committed; the dream
 *   CLI keys transcript deferral on it. Additive — these entries also appear in
 *   `reverted[]`.
 *   secretRedactions = files COMMITTED with this run's added lines scrubbed.
 *   These consumed their transcripts normally and MUST NOT defer, which is why
 *   they are counted separately and never enter `reverted[]`.
 */
function validateAndCommit(o) {
  const { vaultDir, scratchDir, date, expectedScratch, scratchBaseline, stateDir } = o;
  const layout = o.layout || defaultLayout();
  // A0 pre-use freeze (WP-109): a code-level test seam only. Production callers
  // (dream.js) pass no profile → frozen → identity-auto-activation stays blocked.
  const profile = o.profile;

  // Tier-3 directories resolve from the layout (mapped identity + skills dirs);
  // the floor thresholds above are layout-independent.
  // The identity-dir prefix matches case-insensitively (mirror isInjectedIdentity,
  // WP-116/ADR-0021): a case-variant identity dir (e.g. 06-identity/) is the same
  // inode on a case-insensitive FS, so its write must still enter the Tier-3 block
  // and hit the freeze revert. The skills-dir prefix stays case-sensitive.
  const idPrefix = (layout.identity_dir + '/').toLowerCase();
  const skillsPrefix = layout.skills_dir + '/';
  const isTier3 = (rel) =>
    String(rel).toLowerCase().startsWith(idPrefix) || rel.startsWith(skillsPrefix);

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
      // A0 pre-use freeze (WP-109): the dream may not auto-change the injected
      // identity files until a human-ratified exact-byte registry exists (audit A3).
      // Revert any add/modify/delete of profile/preferences/goals/instructions.md.
      // The human setup interview writes these OUTSIDE this path, so it is unaffected.
      if (isInjectedIdentity(rel, layout) && !isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, profile)) {
        revertPath(vaultDir, rel, change.untracked);
        reverted.push({
          path: rel,
          reason:
            'automatic identity activation is frozen (safety profile); the dream may not change the ' +
            'injected identity files — run `wienerdog safety`',
        });
        continue;
      }
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
    // c. Tier-1/2 note, daily log, or report → keep (EP2 below still scans it).
  }

  // ── Step 3: EP2 staged-output secret gate (audit A5, ADR-0024, WP-123) ───
  // Stage the surviving changes and scan the git-computed staged ADDED lines of
  // every file — exactly the bytes THIS run is responsible for (a secret the
  // human already committed in HEAD is not re-flagged). A quarantine-severity
  // finding (and unscannable binary content) preserves the working-tree file
  // into `state/quarantine/` and reverts it, uncommitted. A findings set with
  // NO quarantine-severity finding is redacted in place instead: the
  // unredacted original is preserved into `state/quarantine/redacted/` first,
  // then only the lines this run added are replaced with their sanitized form
  // and the note is committed, announced in the dream report. ADR-0034
  // supersedes ADR-0024's WP-123 "reverts on every finding" amendment for this
  // gate only; EP4's digest gate is unchanged.
  git(vaultDir, ['add', '-A']);
  let secretReverts = 0;
  let secretRedactions = 0;
  /** @type {Set<string>} rels reverted by this gate (excluded from registration) */
  const secretReverted = new Set();
  /** @type {Array<{path:string, lines:number, labels:string, name:string}>} */
  const secretRedacted = [];
  /** @type {Set<string>} every basename this run wrote into quarantine/redacted/ */
  const redactedCreated = new Set();
  const scanTokens = git(vaultDir, ['diff', '--cached', '--name-status', '-z']).stdout.split('\0');
  for (let i = 0; i < scanTokens.length; i++) {
    const status = scanTokens[i];
    if (status === '') continue;
    let rel = scanTokens[++i];
    if (status[0] === 'R' || status[0] === 'C') rel = scanTokens[++i];
    if (status[0] === 'D') continue; // a deletion has no added content
    // Binary staged content is unscannable → fail closed (spec-gap amendment,
    // 2026-07-17 review round 1): git's own binary signal is numstat reporting
    // `-` for both counts. A NUL in the first ~8 KB is attacker-influenceable,
    // so an unscannable file is withheld exactly like a finding — never
    // committed raw. Text changes with no `+` lines (pure deletions,
    // mode-only) added no bytes this run and stay skipped.
    const numstat = git(vaultDir, ['diff', '--cached', '--numstat', '-z', '--', rel]).stdout;
    const isBinary = /^-\t-\t/.test(numstat);
    let reason;
    /** @type {{name:string, bytes:Buffer}|null} the redacted/ copy the arm wrote */
    let redactCopy = null;
    /** true once the redact arm was entered and did not complete */
    let redactFellThrough = false;
    /** true when the arm declined because the note is not lossless UTF-8 */
    let notLosslessUtf8 = false;
    if (isBinary) {
      reason = 'reverted: staged content is binary and cannot be secret-scanned; not committed';
    } else {
      const diff = git(vaultDir, ['diff', '--cached', '-U0', '--', rel]).stdout;
      const added = diff
        .split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .map((l) => l.slice(1))
        .join('\n');
      if (added === '') continue;
      const { findings } = scanAndRedact(added);
      if (findings.length === 0) continue;
      // Metadata-only reason: distinct code-owned labels, never the matched bytes.
      const labels = findings.map((f) => f.label);
      reason = `reverted: staged content matched a secret pattern (${labels.join(', ')}); not committed`;
      if (!hasHardFinding(findings)) {
        // ── The redact arm. Preserve the unredacted original FIRST, then scrub
        //    only the lines this run added, against the very bytes that were
        //    preserved. Never scrub a file whose original could not be
        //    preserved: that is the permanent-corruption outcome this design
        //    exists to avoid. Anything short of a verified, staged scrub falls
        //    through to the withhold below, before Step 5 stages anything.
        redactCopy = quarantinePreserve(stateDir, vaultDir, rel, date, 'redacted');
        if (redactCopy) redactedCreated.add(redactCopy.name);
        const addedLineNumbers = addedLineNumbersFromDiff(diff);
        // A note whose bytes do not survive a UTF-8 round trip cannot be
        // rewritten per line without changing bytes the run never added, so the
        // arm declines it outright and the withhold below runs instead.
        if (redactCopy && !isLosslessUtf8(redactCopy.bytes)) notLosslessUtf8 = true;
        else if (redactCopy && scrubAddedLines(vaultDir, rel, addedLineNumbers, redactCopy.bytes)) {
          secretRedacted.push({
            path: rel,
            lines: addedLineNumbers.length,
            labels: labels.join(', '),
            name: redactCopy.name,
          });
          secretRedactions += 1; // increments LAST, only after the scrub is staged
          continue;
        }
        redactFellThrough = true;
      }
    }
    const tracked = git(vaultDir, ['cat-file', '-e', `HEAD:${rel}`], { allowFail: true }).status === 0;
    const preserved = quarantinePreserve(stateDir, vaultDir, rel, date);
    if (redactFellThrough && !preserved) {
      // ── The abort. Never destroy the working-tree file unless some durable
      //    artefact holds THE BYTES THAT ARE THERE NOW. A copy of some earlier
      //    version is not that: the note's owner can have saved it mid-dream,
      //    and reverting then destroys the only copy of what they wrote.
      let identity = 'not performed, because there was no saved copy to compare against';
      let recoverable = false;
      if (redactCopy) {
        try {
          if (Buffer.compare(fs.readFileSync(path.join(vaultDir, rel)), redactCopy.bytes) === 0) {
            recoverable = true;
            identity = 'performed, and the file on disk matches the saved copy';
          } else {
            identity = 'performed, and the file on disk does NOT match the saved copy';
          }
        } catch {
          // A read that cannot be performed cannot show the file is recoverable.
          identity = 'attempted, but the file on disk could not be read at all';
        }
      }
      if (!recoverable) {
        throw new WienerdogError(
          secretGateAbortMessage(rel, redactCopy ? redactCopy.name : null, identity)
        );
      }
    }
    if (tracked) {
      revertPath(vaultDir, rel, false); // tracked → restore HEAD (index + worktree)
    } else {
      fs.rmSync(path.join(vaultDir, rel), { force: true, recursive: true }); // untracked add → remove
      // Drop the index entry Step 3's opening `git add -A` created NOW rather
      // than at Step 5, so no window exists in which the report is written over
      // an index still holding this run's raw added bytes.
      git(vaultDir, ['add', '-A', '--', rel]);
    }
    if (!preserved) reason += ' (quarantine copy failed)';
    if (notLosslessUtf8) {
      reason += ' (not rewritten: this note is not valid UTF-8 text, so the secret could not be '
        + 'replaced without changing the rest of it)';
    }
    if (redactCopy) {
      // Dispose of the redact arm's copy, LAST, after the revert succeeded.
      // Delete it only when a byte-identical withheld copy demonstrably exists;
      // anything else — the withheld preserve failed, either read threw, or the
      // buffers differ — keeps it, because it is then the only copy of a version
      // of the user's note that exists anywhere, and says so in the reason.
      let identical = false;
      if (preserved) {
        try {
          identical = Buffer.compare(
            fs.readFileSync(path.join(stateDir, 'quarantine', REDACTED_SUBDIR, redactCopy.name)),
            fs.readFileSync(path.join(stateDir, 'quarantine', preserved.name))
          ) === 0;
        } catch { identical = false; }
      }
      if (identical) {
        try {
          fs.rmSync(path.join(stateDir, 'quarantine', REDACTED_SUBDIR, redactCopy.name), { force: true });
        } catch { /* best-effort: a stale duplicate, not a hazard */ }
      } else {
        reason += ` (the unredacted original is state/quarantine/${REDACTED_SUBDIR}/${redactCopy.name})`;
      }
    }
    reverted.push({ path: rel, reason });
    secretReverted.add(rel);
    secretReverts += 1;
  }
  // Retention, once per run and only after a completed redaction.
  if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
  // A gate-reverted new skill must not reach the ownership registry (Step 6).
  if (secretReverted.size > 0) {
    for (let i = newSkills.length - 1; i >= 0; i -= 1) {
      if (secretReverted.has(newSkills[i].rel)) newSkills.splice(i, 1);
    }
  }

  // ── Step 4: append the enforcement section to the dream report ───────────
  // (Runs AFTER the EP2 gate so a secret-revert reason lands in the report; a
  //  gate-reverted report file is recreated header-only by the existsSync
  //  branch below, so only code-owned metadata reaches the committed report.)
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
  // The redaction section is written only when there is something in it (an
  // empty section is noise on the common path) and is appended AFTER the
  // enforcement section, so that section's byte output is identical whether or
  // not a redaction happened. Metadata only: the vault-relative path, a line
  // count, the labels and the sanitized destination basename — never the
  // matched bytes and never the scrubbed line's text.
  if (secretRedacted.length > 0) {
    const redactionLines = secretRedacted.map(
      (r) =>
        `- \`${r.path}\` — ${r.lines} line(s) scrubbed (${r.labels}); unredacted copy at ` +
        `state/quarantine/${REDACTED_SUBDIR}/${r.name}. If the redaction was wrong, restore from ` +
        'that copy while it is there; otherwise delete it.'
    );
    fs.appendFileSync(
      reportAbs,
      `\n## Redacted in place (secret scan)\n${redactionLines.join('\n')}\n`
    );
  }

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
    secretReverts,
    secretRedactions,
  };
}

module.exports = {
  validateAndCommit,
  parseFrontmatter,
  assertGitRepo,
  assertCleanTree,
  precommitSessionEdits,
  restoreVaultToHead,
  scrubAddedLines,
};
