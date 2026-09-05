'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { WienerdogError } = require('../errors');
const { getPaths } = require('../paths');
const { spawnPinnedSync } = require('../exec-identity');
const { isCapabilityAllowed, CAPABILITY } = require('../safety-profile');
const { parse, coerceScalar, boolFromRaw, INVALID } = require('../frontmatter');
const { scanAndRedact, hasHardFinding } = require('../secret-scan');
const { displayName } = require('./ledger');

// The four identity files the digest injects (direct children of identity_dir).
// A0 pre-use freeze (WP-109): the dream may not auto-change these until a
// human-ratified exact-byte registry exists (audit A3) — see the Tier-3 gate
// below, which holds the freeze.
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
  if (typeof fileText !== 'string') return Object.create(null);
  const fm = parse(fileText); // shared lexer: delimiters + key-line rules
  /** @type {Record<string, string|boolean>} */
  const data = Object.create(null);
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
 * Decide whether a Tier-3 candidate satisfies the fixed code floor.
 *
 * TAKES BYTES, NEVER A PATH TO READ (Table D's rule (b)): the judgment is made
 * on the MERGED candidate — exactly what would be promoted — and a re-read of
 * the vault would judge something else and re-open the window the publish
 * closes (Table S, row S4).
 * @param {string} rel  vault-relative path
 * @param {Buffer|string} candidateBytes  the merged candidate's bytes
 * @returns {{ok:boolean, reason:string}}
 */
function tier3Decision(rel, candidateBytes) {
  const text = Buffer.isBuffer(candidateBytes) ? candidateBytes.toString('utf8') : String(candidateBytes);
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
 * Is `rel` a skill's learnings ledger — a `LEARNINGS.md` under the skills dir?
 * Hoisted out of the retired validator, where it was a closure over `layout`,
 * because the ledger gate now decides its own applicability (`promote()` hands
 * every admitted path to every gate, and a gate that does not apply returns
 * null).
 * @param {string} rel @param {import('../layout').VaultLayout} layout
 * @returns {boolean}
 */
function isLearningsLedgerRel(rel, layout) {
  return rel.startsWith(layout.skills_dir + '/') && path.basename(rel) === 'LEARNINGS.md';
}

/**
 * Skill-body revision guard (ADR-0020). Returns a refusal-reason string if `rel`
 * is a SKILL.md modification outside the dream's revision scope, that altered
 * protected provenance, or whose BODY changed without a qualifying learning
 * authorizing it. Returns null otherwise — identity notes, other
 * skills-dir files, new-skill ADDs, promotions (body unchanged, provenance kept),
 * and compliant authorized revisions all return null and fall through to the
 * Tier-3 numeric floor.
 *
 * EVERY INPUT ARRIVES AS A VALUE (Table D, rule (b)). The two `HEAD:` reads this
 * guard used to make — its own committed body and the committed LEARNINGS.md
 * that authorizes a revision — become the run's BASELINE bytes, and the vault
 * read of the revised file becomes the merged candidate. **The authorizing
 * ledger is the BASELINE one, never the post-brain one**, or the brain
 * authorizes its own skill rewrite within a single run.
 *
 * `baselineBytes === null` means the path is NEW in this run — skill synthesis,
 * not a revision — which is the same verdict the git form reached through
 * `change.untracked`.
 * @param {{rel:string, candidateBytes:Buffer, baselineBytes:Buffer|null,
 *          baselineLedgerBytes:Buffer|null, registry:{skills:Object},
 *          layout:import('../layout').VaultLayout, date:string}} o
 * @returns {string|null}
 */
function skillBodyViolation(o) {
  const { rel, candidateBytes, baselineBytes, baselineLedgerBytes, registry, layout, date } = o;
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
  if (baselineBytes === null || baselineBytes === undefined) return null;

  // ELIGIBILITY: a modification is allowed only on a skill in the ownership
  // registry (tamper-proof write-origin marker; baseline frontmatter is forgeable).
  const entry = (registry && registry.skills && registry.skills[rel]) || null;
  if (!entry) return 'skill-body change on a skill not in the ownership registry (fail closed)';

  const headText = baselineBytes.toString('utf8');
  // A malformed side is not evidence of agreement. Refuse before the immutable
  // field comparisons AND before the raise-only flag read below — a malformed
  // baseline must never read as "not true".
  if (blockMalformed(headText)) return MALFORMED_REASON;
  const head = parseFrontmatter(headText);

  const curText = candidateBytes.toString('utf8');
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
  let needsAuth = skillBody(curText) !== skillBody(headText);
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
    if (typeof key !== 'string' || !PATTERN_KEY_RE.test(key)) {
      return 'skill change needs a qualifying learning but has no valid revision_pattern_key';
    }
    if (baselineLedgerBytes === null || baselineLedgerBytes === undefined) {
      return 'skill change needs a qualifying learning but no committed ledger authorizes it';
    }
    const { entries: committedLedger, duplicateKeys: headDuplicateKeys } =
      parseLedgerEntries(baselineLedgerBytes.toString('utf8'));
    if (headDuplicateKeys.length > 0) {
      return 'skill change needs a qualifying learning but the committed ledger has a repeated entry heading (fail closed)';
    }
    const learning = committedLedger[key];
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
 *
 * The collector is NULL-PROTOTYPE (A2): a heading literally spelled `__proto__`
 * becomes an own key instead of silently setting the record's prototype.
 *
 * `duplicateKeys` (A3) names every heading text seen more than once, in
 * first-repeat order, decided on the NORMALISED key this function CAPTURED —
 * never on the raw `##` line. A repeated heading is refused by every caller at
 * every read; this function only reports it.
 *
 * The bullet key match (A7) does not let `.` decide where a value ends: it
 * matches only the field name up to its colon, and the raw value is the
 * REMAINDER of the LF-delimited line, trimmed — so a value containing CR,
 * U+2028 or U+2029 still reaches the field (and, for booleans, A1's
 * `boolFromRaw`) instead of making the bullet read as absent.
 * @param {string} text
 * @returns {{entries: Record<string, {key:string, patternKey:string|null, status:string|null,
 *   recurrence:string|null, sessionIds:string[], firstSeen:string|null, lastSeen:string|null,
 *   untrusted:boolean|null|typeof INVALID, observation:string|null}>, duplicateKeys:string[]}}
 */
function parseLedgerEntries(text) {
  /** @type {Record<string, any>} */ const entries = Object.create(null);
  const seenKeys = new Set();
  /** @type {string[]} */ const duplicateKeys = [];
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const h = raw.match(/^##\s+(.+?)\s*$/);
    if (h) {
      const key = h[1];
      if (seenKeys.has(key)) {
        if (!duplicateKeys.includes(key)) duplicateKeys.push(key);
      } else {
        seenKeys.add(key);
      }
      cur = { key, patternKey: null, status: null, recurrence: null,
        sessionIds: [], firstSeen: null, lastSeen: null, untrusted: null, observation: null };
      entries[key] = cur;
      continue;
    }
    if (!cur) continue;
    const b = raw.match(/^-\s*([A-Za-z_-]+):/);
    if (!b) continue;
    const field = b[1].toLowerCase();
    const val = raw.slice(b[0].length).trim();
    if (field === 'pattern-key') cur.patternKey = val.replace(/^`|`$/g, '');
    else if (field === 'status') cur.status = val;
    else if (field === 'recurrence') cur.recurrence = val;
    else if (field === 'session-ids') cur.sessionIds = val.split(',').map((s) => s.trim()).filter(Boolean);
    else if (field === 'first-seen') cur.firstSeen = val;
    else if (field === 'last-seen') cur.lastSeen = val;
    else if (field === 'derived_from_untrusted') cur.untrusted = boolFromRaw(val);
    else if (field === 'observation') cur.observation = val;
  }
  return { entries, duplicateKeys };
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
 * LEARNINGS.md whose write is invalid, else null. `registry` is the ownership registry's
 * result (or {skills:{}} when no stateDir → every ledger fails the registered
 * check, fail closed).
 * EVERY INPUT ARRIVES AS A VALUE (Table D, rule (b)). The sibling SKILL.md is
 * no longer read out of the vault: the PAIRED bytes are selected by the pair
 * decision — this run's candidate when the skill changed too, otherwise the
 * baseline — so the ledger is validated against the skill that would actually be
 * promoted beside it. The `HEAD:<rel>` read becomes the baseline ledger bytes,
 * whose ABSENCE means the ledger is new in this run (no history to compare),
 * which is the verdict `change.untracked` reached in the git form.
 * @param {{rel:string, candidateBytes:Buffer, baselineLedgerBytes:Buffer|null,
 *          pairedSkillBytes:Buffer|null, registry:{skills:Object},
 *          extractsBySession:Map<string,object>,
 *          layout:import('../layout').VaultLayout}} o
 *   extractsBySession  this run's extracts keyed by `<harness>:<session_id>` (WP-084)
 * @returns {string|null}
 */
function ledgerViolation(o) {
  const { rel, candidateBytes, baselineLedgerBytes, pairedSkillBytes, registry, extractsBySession, layout } = o;
  if (!isLearningsLedgerRel(rel, layout)) return null;
  // (a) parent dir must hold a REGISTERED skill whose PROMOTED SKILL.md still
  //     matches the registry entry — guard against a stale registry path (a
  //     deleted skill, or a different skill hand-authored at the same path). This
  //     is the same trust input WP-082 cross-checks; apply it to the ledger too.
  const skillRel = path.join(path.dirname(rel), 'SKILL.md');
  const regEntry = (registry && registry.skills && registry.skills[skillRel]) || null;
  if (!regEntry) return 'learnings ledger beside a skill not in the ownership registry (fail closed)';
  if (pairedSkillBytes === null || pairedSkillBytes === undefined) {
    return 'learnings ledger beside a registered skill whose SKILL.md is missing (fail closed)';
  }
  const skillText = pairedSkillBytes.toString('utf8');
  // The malformed bytes here are the sibling SKILL.md's, but the path this site
  // reverts is LEARNINGS.md — so the reason names the parent skill.
  if (blockMalformed(skillText)) return MALFORMED_PARENT_SKILL_REASON;
  const skillFm = parseFrontmatter(skillText);
  if (skillFm.id !== regEntry.id) return 'learnings ledger parent skill id does not match the registry (path reuse)';
  if (skillFm.created !== regEntry.created) return 'learnings ledger parent skill created does not match the registry (path reuse)';

  const curText = candidateBytes.toString('utf8');
  const { entries: cur, duplicateKeys: curDuplicateKeys } = parseLedgerEntries(curText);
  // (a2) a repeated `##` heading refuses at the candidate read too (A3): last-wins
  //      on a collector nothing validated is exactly the hole this closes.
  if (curDuplicateKeys.length > 0) {
    return `learnings ledger has a repeated entry heading (${curDuplicateKeys[0]}); each ## heading must appear once`;
  }
  if (Object.keys(cur).length === 0) return 'learnings ledger has no valid entries';
  // (b) every entry validates against the schema.
  for (const [key, e] of Object.entries(cur)) {
    const reason = ledgerEntrySchemaViolation(key, e);
    if (reason) return `learnings ledger entry ${key}: ${reason}`;
  }
  // (c) append-only + raise-only vs HEAD (tracked modifications only). A tracked
  //     ledger whose committed version is unreadable FAILS CLOSED — never skip the
  //     history comparison (skipping it was a fail-open gap).
  let headEntries = Object.create(null);
  if (baselineLedgerBytes !== null && baselineLedgerBytes !== undefined) {
    const { entries: parsedHeadEntries, duplicateKeys: headDuplicateKeys } =
      parseLedgerEntries(baselineLedgerBytes.toString('utf8'));
    // A repeated heading on the COMMITTED baseline makes the append-only history
    // uncomparable — fail closed rather than compare against a last-wins collapse.
    if (headDuplicateKeys.length > 0) {
      return `learnings ledger's committed version has a repeated entry heading (${headDuplicateKeys[0]}); the append-only history cannot be compared (fail closed)`;
    }
    headEntries = parsedHeadEntries;
    for (const [key, he] of Object.entries(headEntries)) {
      const ce = cur[key];
      if (!ce) return `learnings ledger deleted an existing entry (${key}); ledger is append-only`;
      if (ce.firstSeen !== he.firstSeen) return `learnings ledger changed First-Seen of ${key} (immutable)`;
      if (ce.observation !== he.observation) return `learnings ledger rewrote the Observation of ${key} (immutable)`;
      // A4: raise-only fails closed on an INVALID committed value too — INVALID is
      // "present but unreadable" and may not be lowered; only an ABSENT (null)
      // baseline value stays exempt (owner item 2).
      if ((he.untrusted === true || he.untrusted === INVALID) && ce.untrusted !== true) {
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



/** The pre-scrub originals the redact arm writes live one level down, so the
 *  withhold banner (which lists direct FILE entries only) never mentions them. */
const REDACTED_SUBDIR = 'redacted';

/** How many pre-scrub originals `state/quarantine/redacted/` keeps
 *  (OWNER-APPROVED). The copies a run creates are never evicted by that run,
 *  so a run that redacts more notes than this ends above the cap and the next
 *  redacting run prunes it back. `state/quarantine/` itself stays unbounded. */
const REDACTED_RETENTION_CAP = 50;

/**
 * Table D's disposal primitive (`WP-preservation-abort-widening`): remove the
 * ONE path this invocation owns and confirm it is gone. A removal that cannot
 * be completed is Table D row D3 — it fails loud rather than let
 * secret-bearing bytes sit on disk under a name no preservation record, no
 * cleanup pass and no abort message can reach.
 * @param {string} p
 * @throws {WienerdogError} D3 — the path could not be removed
 */
function removeOwnedQuarantinePath(p) {
  try {
    fs.rmSync(p, { force: true });
  } catch (err) {
    throw new WienerdogError(
      `quarantinePreserve: could not remove ${JSON.stringify(p)} after a preservation failure: ${err.message}`
    );
  }
  if (fs.existsSync(p)) {
    throw new WienerdogError(
      `quarantinePreserve: ${JSON.stringify(p)} still exists after its removal was attempted`
    );
  }
}

// ── Durability protocol (`WP-quarantine-preserve-durability`, Table F) ──────
//
// POSIX-only (row F5, Dispatch precondition item 1): a NAMED CONSTANT, not a
// caught error — a caught error cannot tell "this platform has no such call"
// from "this flush really failed", and row F4 must keep the second one loud.
// On win32 the protocol issues no flush and claims none, which is today's
// behaviour there, unchanged.
const DURABILITY_AVAILABLE = process.platform !== 'win32';

/**
 * Flags for the artifact's ONE create-open (row F8's provenance). `O_CREAT`
 * with `O_EXCL` is what makes the create ATOMIC — provenance is the create
 * itself, not a fully successful write. `O_RDWR`, not `O_WRONLY`: this
 * function writes the artifact through this descriptor AND reads it back
 * through the same one (row F5) — not because a platform requires a
 * write-open descriptor for `fsync` (an earlier draft said Linux does; that
 * is false and belongs to System V-derived systems instead). `O_NOFOLLOW` is
 * added where the platform has it — win32 has none — and the fallback is an
 * explicit branch that names what is lost, deliberately not the
 * `fs.constants.X || 0` idiom, which makes a missing flag look like a present
 * one (matching `src/core/dream/vault-write.js` and
 * `src/core/dream/workspace.js`).
 */
const TEMP_CREATE_FLAGS =
  fs.constants.O_RDWR |
  fs.constants.O_CREAT |
  fs.constants.O_EXCL |
  (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0);

/** Flags for a directory's flush-open (row F3): read-only, never a write
 *  path, plus `O_DIRECTORY` and — same idiom as `TEMP_CREATE_FLAGS` —
 *  `O_NOFOLLOW` where the platform has it. */
const DIR_OPEN_FLAGS =
  fs.constants.O_RDONLY |
  fs.constants.O_DIRECTORY |
  (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0);

/** Close `fd` and swallow any error — a `close` that fails after a flush that
 *  COMPLETED cannot turn a successful preservation into a failed one, because
 *  `close` is not a flush (row F4). A no-op when `fd < 0` (nothing was ever
 *  opened). @param {number} fd */
function closeQuietly(fd) {
  if (fd < 0) return;
  try {
    fs.closeSync(fd);
  } catch { /* best-effort: F4's subject is the flush, not the close */ }
}

/** Write `content` through `fd` at an EXPLICIT position, never the
 *  descriptor's own offset — measured: `readFileSync(fd)` right after
 *  `writeFileSync(fd)` returns EMPTY because the position sits at EOF
 *  (Implementation notes). @param {number} fd @param {Buffer} content */
function writeAllAt(fd, content) {
  let written = 0;
  while (written < content.length) {
    written += fs.writeSync(fd, content, written, content.length - written, written);
  }
}

/** Read from `fd` at explicit position 0, asking for ONE BYTE MORE than
 *  `length` so an artifact LONGER than the judged bytes fails the comparison
 *  that follows rather than passing on a prefix (Implementation notes).
 *  @param {number} fd @param {number} length @returns {Buffer} */
function readAllAt(fd, length) {
  const buf = Buffer.alloc(length + 1);
  let got = 0;
  for (;;) {
    const n = fs.readSync(fd, buf, got, buf.length - got, got);
    if (n === 0 || (got += n) >= buf.length) break;
  }
  return buf.subarray(0, got);
}

/**
 * ACT ONLY ON THE INODE YOU CREATED (row F8). Does `p`, looked up BY NAME,
 * name the SAME inode `fd` already holds? THREE-VALUED, not two: a stat that
 * cannot COMPLETE is not evidence of absence.
 * @param {string} p @param {number} fd
 * @returns {boolean} OWNED (`true`) or ABSENT-OR-FOREIGN (`false`, the
 *   fail-closed outcome: `ENOENT`, or a completed stat that did not match)
 * @throws {WienerdogError} INDETERMINATE — any stat failure but `ENOENT`,
 *   because *I could not look* is not *it is not there*
 */
function ownsName(p, fd) {
  try {
    const open = fs.fstatSync(fd, { bigint: true });
    const named = fs.lstatSync(p, { bigint: true });
    return named.isFile() && named.dev === open.dev && named.ino === open.ino;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw new WienerdogError(
      `quarantinePreserve: could not determine whether ${JSON.stringify(p)} is this invocation's own artifact: ${err && err.message}`
    );
  }
}

/** Flush the artifact's bytes through the descriptor this invocation already
 *  holds (row F1). No open, no close — the descriptor's lifetime is the
 *  caller's. @param {number} fd @returns {boolean} */
function flushFd(fd) {
  try {
    fs.fsyncSync(fd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Flush ONE directory entry (row F2/F3): open it, `fsync` it, close it.
 * Round 10's finding is why the whole body is a byte-exact source form — the
 * boolean this returns is all the rest of the protocol sees, so a form that
 * opens, flushes, returns `true` and never closes satisfies every other row
 * while leaking one descriptor per chain member on every successful
 * preservation.
 * @param {string} dir @returns {boolean}
 */
function flushDir(dir) {
  let fd = -1;
  try {
    fd = fs.openSync(dir, DIR_OPEN_FLAGS);
    fs.fsyncSync(fd);
    return true;
  } catch {
    return false;
  } finally {
    if (fd >= 0) closeQuietly(fd);
  }
}

/**
 * The FIXED directory chain a preservation depends on, bottom-up, ending at
 * the ANCHOR (row F3): `qdir`, the shelf above it when `qdir` is the
 * `redacted/` one, `stateDir`, and the core directory —
 * `path.dirname(stateDir)`. A closed list, flushed on every successful
 * preservation whether or not this call created any of it: `acquireLock`
 * creates `stateDir` earlier in the SAME run (`src/core/dream/lock.js`), so a
 * created-set derivation would leave the core unflushed (measured, Current
 * state).
 * @param {string} stateDir @param {string} qdir
 * @returns {string[]}
 */
function quarantineDirChain(stateDir, qdir) {
  const shelf = path.join(stateDir, 'quarantine');
  const anchor = path.dirname(stateDir);
  const chain = [qdir];
  if (qdir !== shelf) chain.push(shelf);
  chain.push(stateDir);
  if (anchor !== stateDir) chain.push(anchor);
  return chain;
}

/**
 * Flush the artifact's bytes (row F1), then the directory chain that names
 * it, bottom-up (rows F2/F3) — the WHOLE set, before the read-back that
 * follows (row F6). Returns `true` only once every flush in that closed list
 * has completed; a flush that does not complete at any target returns
 * `false` without throwing, which the caller treats as an ordinary
 * preservation FAILURE (row F4).
 *
 * Durability here is what the platform's flush provides and no more: Node documents no device-level guarantee for `fs.fsync` and exposes no way to request or observe one, so nothing in this file may state that a preserved copy is on the medium.
 *
 * POSIX-only (row F5): on win32 this issues no flush and claims none.
 * @param {number} fd  the descriptor this invocation created, wrote through
 *   and will read back through
 * @param {string} stateDir @param {string} qdir
 * @returns {boolean}
 */
function flushPreservation(fd, stateDir, qdir) {
  if (!DURABILITY_AVAILABLE) return true;
  if (!flushFd(fd)) return false;
  for (const dir of quarantineDirChain(stateDir, qdir)) {
    if (!flushDir(dir)) return false;
  }
  return true;
}

/**
 * Preserve the working-tree bytes of a flagged vault file into the private
 * quarantine tree (audit A5, WP-123 OWNER-APPROVED): dir 0700, file 0600,
 * name `<date>-<sanitized-basename>` with a numeric suffix before the
 * extension on collision. The write is an exclusive create followed by a
 * no-clobber commit (`WP-quarantine-preserve-durability`, Table F row F9) —
 * never a plain rename over `dest`.
 *
 * `tmp` IS CREATED EXCLUSIVELY (`WP-preservation-abort-widening`, Table D
 * row D1; row F8): a crash can leave a `.tmp-<pid>-<stem>` file behind, and
 * pids are reused, so a later invocation naming the same path must never
 * open it for writing — that would silently overwrite a foreign file, and
 * treating the reused pathname as this invocation's own would then delete it
 * on any later failure. `O_CREAT|O_EXCL` makes that collision an ordinary
 * preservation FAILURE instead, and OWNERSHIP BEGINS AT THE SUCCESSFUL
 * EXCLUSIVE CREATE: the create is atomic, so a throw from it allocates
 * nothing, and the descriptor it returns IS the ownership record for every
 * pathname act that follows (row F8's `ownsName`). The pre-existing foreign
 * file itself is never opened, written or removed.
 *
 * Best-effort in ONE direction only: any failure up to and including a failed
 * commit (including a missing stateDir) returns `null`, and `null` is falsy
 * exactly where the previous `false` was, so the withhold call site keeps its
 * `if (!preserved)` shape. It is NOT best-effort about what a non-`null`
 * return means (`WP-preservation-abort-widening` Table P row P0b;
 * `WP-quarantine-preserve-durability` Table F): after the commit, the
 * artifact's bytes and the directory chain that names it are flushed, and
 * only then is the artifact read back through the held descriptor and
 * byte-compared against `content` before success is reported. A failed
 * cleanup after a create/write/commit failure (Table D row D1), a failed
 * verification (row D2), or a stat that could not determine ownership (row
 * F8's INDETERMINATE outcome) is a `WienerdogError`, not a swallowed failure
 * (row D3).
 *
 * TAKES THE BYTES, NEVER A PATH TO READ. Under promotion the flagged content is
 * the brain's workspace bytes, which the gate already holds — the delta carried
 * them — and a second read would preserve something other than what is being
 * judged. The TOCTOU the old vault read closed is closed here by construction.
 * The read-back P0b adds is a DIFFERENT read: it re-reads the ARTIFACT this
 * call itself just wrote, THROUGH THE DESCRIPTOR IT HOLDS, never the TARGET by
 * name, so it does not conflict with the "one captured buffer" contract above.
 * @param {string|undefined} stateDir
 * @param {Buffer} content  the EXACT bytes to preserve
 * @param {string} rel  vault-relative path of the flagged file (names the copy)
 * @param {string} date  the dream run date (YYYY-MM-DD)
 * @param {'withheld'|'redacted'} [kind='withheld']  selects the destination:
 *   'withheld' -> <stateDir>/quarantine/           (nothing was promoted)
 *   'redacted' -> <stateDir>/quarantine/redacted/  (the sanitized form was promoted)
 * @returns {{name:string, bytes:Buffer}|null} the destination BASENAME this
 *  invocation committed, TOGETHER WITH THE BYTES IT CREATED, FLUSHED, AND THEN READ
 *  BACK AND COMPARED THROUGH ITS OWN DESCRIPTOR — or `null` when the create, the
 *  write, the commit, the flush, the verification or the identity check failed.
 *
 *  THE TWO FIELDS CARRY DIFFERENT STRENGTHS, and row F10 is where that is decided.
 *  `bytes` is what this call verified: on a POSIX platform it was read from the
 *  created inode AFTER a flush of that inode had COMPLETED (row F6). That is not a
 *  claim that a flush completed over these particular bytes — absent a concurrent
 *  writer of that inode the two coincide, and row F10's instance (v) is the case
 *  where they need not, because fsync and read are separable operations on a
 *  mutable inode. On win32 no flush is issued and none is claimed (row F5). `name` was
 *  bound to that inode AT THE LAST GATE; a same-UID hand can rebind it afterwards —
 *  and a caller publishing the name is publishing a binding that was true at that
 *  instant.
 * @throws {WienerdogError} Table D row D3 — the path this invocation owns
 *   (`tmp` before the commit, `dest` after it) could not be removed following
 *   a failure — OR row F8's INDETERMINATE outcome: a stat that could not
 *   determine ownership (any code but `ENOENT`) at one of the four gates that
 *   consult it. The same class, disposition and route, with one added reason
 *   and no new shape
 */
function quarantinePreserve(stateDir, content, rel, date, kind = 'withheld') {
  // Code-supplied, never user input: a typo must fail loudly rather than write
  // to a third directory. Deliberately OUTSIDE the try below, which is total.
  if (kind !== 'withheld' && kind !== 'redacted') {
    throw new WienerdogError(`quarantinePreserve: unknown kind ${JSON.stringify(kind)}`);
  }
  let tmp = null;
  let dest = null;
  let name = null;
  let qdir = null;
  let fd = -1;
  try {
    if (!stateDir) return null;
    if (!Buffer.isBuffer(content)) return null;
    qdir = kind === 'redacted'
      ? path.join(stateDir, 'quarantine', REDACTED_SUBDIR)
      : path.join(stateDir, 'quarantine');
    fs.mkdirSync(qdir, { recursive: true, mode: 0o700 });
    fs.chmodSync(qdir, 0o700);
    const base = displayName(rel); // shared attacker-safe basename sanitizer (WP-119/120)
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    name = `${date}-${stem}${ext}`;
    dest = path.join(qdir, name);
    for (let n = 1; fs.existsSync(dest); n += 1) {
      name = `${date}-${stem}-${n}${ext}`;
      dest = path.join(qdir, name);
    }
    tmp = path.join(qdir, `.tmp-${process.pid}-${stem}${ext}`);
    fd = fs.openSync(tmp, TEMP_CREATE_FLAGS, 0o600);
    writeAllAt(fd, content);
    fs.fchmodSync(fd, 0o600);
    fs.linkSync(tmp, dest);
  } catch {
    // Table D rows D0/D1, gated on row F8's identity rather than on a flag
    // the shipped write's own catch used to set: `O_CREAT|O_EXCL` is atomic,
    // so `fd < 0` means this invocation created nothing and removes nothing;
    // with a descriptor, the write or the commit is what threw and `tmp` is
    // removed only while it still names the inode this call created. The
    // close sits in a `finally` because the gate itself can throw (row F8's
    // INDETERMINATE outcome).
    let ownedTmp = false;
    try {
      ownedTmp = fd >= 0 && ownsName(tmp, fd);
    } finally {
      closeQuietly(fd);
      fd = -1;
    }
    if (ownedTmp) removeOwnedQuarantinePath(tmp);
    return null;
  }

  // Table D row D2 / row F9: the commit COMPLETED — `dest` names the inode
  // this invocation created. Everything from here on is gated on that same
  // descriptor's identity, and the descriptor is closed in ONE finalizer
  // covering the whole post-create lifetime (row F8: closed in every case).
  let ownedDest = false;
  let verified = null;
  try {
    if (ownsName(tmp, fd)) removeOwnedQuarantinePath(tmp);
    // The flush-then-verify block (row F6): the WHOLE flush set runs before
    // the read-back, so the read occurs after a completed flush OF THAT
    // INODE — not a claim that the flush covered the returned bytes, which
    // coincides only absent a concurrent writer of that inode (row F10 (v)).
    // `verified = readBack` is NOT a re-read — row F0's linearization claim
    // rests on that — and a `WienerdogError` here (row F8's INDETERMINATE
    // outcome) is RE-THROWN rather than turned into a preservation failure,
    // because it is the one signal that says this call could not tell
    // whether its own artifact is still at that name.
    try {
      const readBack = flushPreservation(fd, stateDir, qdir) ? readAllAt(fd, content.length) : null;
      if (readBack !== null && Buffer.compare(readBack, content) === 0 && ownsName(dest, fd)) {
        verified = readBack;
      }
    } catch (err) {
      if (err instanceof WienerdogError) throw err;
      verified = null;
    }
    if (verified === null) ownedDest = ownsName(dest, fd);
  } finally {
    closeQuietly(fd);
    fd = -1;
  }
  if (verified !== null) return { name, bytes: verified };
  if (ownedDest) removeOwnedQuarantinePath(dest);
  return null;
}


/**
 * RETAINED DELIBERATELY, WITH NO PRODUCTION CALLER, AND THE REASON IS A
 * DIFFERENTIAL GUARANTEE.
 *
 * Under promotion the run's added-line numbers come from the git-free delta
 * primitive, so no gate parses a diff any more and this parser has no caller in
 * `src/`. What it still has is a JOB: `tests/unit/dream-delta.test.js` uses it
 * as the REFERENCE against which `computeDelta`'s `addedLineNumbers` are proved
 * equivalent to git's own answer, loading it out of this file precisely so the
 * comparison is against the real thing rather than a copy that can drift.
 * Deleting it would not remove a git dependency from any gate — the gates
 * consult none — it would only delete the cross-check that the replacement
 * agrees with what it replaced.
 *
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
 * form, and RETURN the sanitized bytes. Never touches a line the run did not add
 * — a secret already present in the baseline is not rewritten (ADR-0024's "the
 * gate scans the added bytes").
 *
 * SANITIZATION UNIT: one line at a time. Each added line number L is replaced
 * by `scanAndRedact(lines[L-1]).text`, not the joined blob the gate scanned —
 * per-line keeps the line count fixed and keeps the rewrite local. It is
 * equivalent to the blob scan because the only `redact`-severity producer is
 * the context-free entropy tier, whose alphabet contains no whitespace.
 *
 * PURE: COMPUTE AND VERIFY, NEVER WRITE. Under promotion nothing is written to
 * the vault by any gate — `promote()` hands the returned bytes to the vault-write
 * primitive, which is the only writer. The index-first temp-and-stage ordering
 * this helper used to perform therefore has no subject: there is no index to
 * race a working tree against, and no target to rename over. What survives is
 * the half that decided the verdict — the bounds check, the no-op check and the
 * verified-scrub postcondition — because a silent failure there would promote
 * the raw secret while the report announced a successful redaction.
 *
 * NEVER THROWS: the whole body sits in one try and every exception returns null,
 * so no failure of this helper can escape the caller's fall-through.
 *
 * @param {number[]} addedLineNumbers  1-based line numbers in the NEW file
 * @param {Buffer} captured  the EXACT bytes the gate is judging — the workspace
 *   after-bytes, which are also the bytes `quarantinePreserve` preserved for
 *   this path. The scrub's only input.
 * @returns {Buffer|null} the sanitized bytes, or null iff the scrub is not
 *   verified complete (the caller then withholds)
 */
function scrubAddedLines(addedLineNumbers, captured) {
  try {
    if (!Buffer.isBuffer(captured)) return null;
    // Fail closed on a note whose bytes are not losslessly representable as
    // UTF-8: decoding it would substitute U+FFFD for every invalid byte and the
    // re-encode would then corrupt lines this run never added. The caller
    // withholds instead. Held here rather than only at the call site so the
    // exported helper is safe for every caller.
    if (!isLosslessUtf8(captured)) return null;
    const raw = captured.toString('utf8');
    const trailingNewline = raw.endsWith('\n');
    const lines = (trailingNewline ? raw.slice(0, -1) : raw).split('\n');
    // Bounds FIRST, before any indexing.
    for (const l of addedLineNumbers) {
      if (!Number.isInteger(l) || l < 1 || l > lines.length) return null;
    }
    for (const l of addedLineNumbers) {
      lines[l - 1] = scanAndRedact(lines[l - 1]).text;
    }
    const out = Buffer.from(lines.join('\n') + (trailingNewline ? '\n' : ''), 'utf8');
    // A no-op means the rewrite and the gate's own scan disagree — a defect,
    // and a defect in a secret gate withholds.
    if (Buffer.compare(out, captured) === 0) return null;
    // The verified-scrub postcondition: without it this helper can only report
    // what it TRIED to do, and a silent failure promotes the raw secret while
    // the report announces a successful redaction.
    for (const l of addedLineNumbers) {
      if (scanAndRedact(lines[l - 1]).findings.length > 0) return null;
    }
    return out;
  } catch {
    return null;
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
 * `WP-preservation-abort-widening`, Table P widened the trigger from the
 * redact fall-through alone to the class of "no verified preservation
 * survives" (row P0), and gave the "which preserves failed" field a fourth
 * input — `which`, a closed enum the call site supplies — because P1/P2 and
 * P3 reach this function with otherwise-identical inputs (same `rel`, no
 * surviving `redacted/` basename, the same identity disposition) yet Table P
 * gives them different values; selecting on whether a basename exists cannot
 * tell them apart. THE PAIR RULE: under every arm this WP makes reachable, a
 * surviving `redacted/` copy always recovers (Table P row P3), so no
 * reachable abort ever carries a non-null `redactedName` — a call pairing one
 * with the other is a contract violation, not a message to render, and it
 * fails loud rather than compose a description of a copy that cannot exist.
 * @param {string} rel  vault-relative path
 * @param {null} redactedName  ALWAYS null on a reachable abort; kept as a
 *   parameter because Q18, not this WP, owns the field — see THE PAIR RULE
 * @param {string} identity  what the on-disk check could establish
 * @param {'both-failed'|'no-redaction-attempted'} which  selects Table P's
 *   "which preserves failed" value: `'both-failed'` is row P3's (the redact
 *   arm was attempted and fell through, and the withheld preserve also
 *   failed); `'no-redaction-attempted'` is P1/P2's (a hard secret or
 *   unscannable content never entered the redact arm at all)
 * @returns {string}
 * @throws {WienerdogError} the pair rule — `redactedName` was non-null, or
 *   `which` was not one of the two active enum members
 */
function secretGateAbortMessage(rel, redactedName, identity, which) {
  if (redactedName !== null) {
    throw new WienerdogError(
      `secretGateAbortMessage: contract violation — ${JSON.stringify(which)} paired with a ` +
        `non-null redactedName ${JSON.stringify(redactedName)}`
    );
  }
  // A CLOSED two-member enum, looked up with `Object.hasOwn` rather than a
  // bare `messages[which]` (round-3 review, codex plugin P3): a plain object
  // literal inherits `Object.prototype`, so an out-of-enum `which` such as
  // `'toString'` or `'__proto__'` would otherwise resolve to an inherited
  // function/object instead of `undefined`, rendering a malformed message
  // instead of failing loud.
  const messages = {
    'no-redaction-attempted': 'the withheld copy could not be saved; no redaction copy was attempted',
    'both-failed': 'neither the redaction copy nor the withheld copy could be saved',
  };
  if (!Object.hasOwn(messages, which)) {
    throw new WienerdogError(`secretGateAbortMessage: unknown which ${JSON.stringify(which)}`);
  }
  const whichText = messages[which];
  return (
    `the secret check stopped before changing ${JSON.stringify(rel)}: ${whichText}, and the check ` +
    `that the file on disk still matches a saved copy was ${identity}. Nothing was reverted, ` +
    `removed or committed, so the note is exactly where it was.`
  );
}

// ── The four gates, in the input shape Table D assigns them ──────────────────
//
// `promote()` INJECTS these (`WP-dream-promote-module`'s `### Exact contracts`),
// which is why they are built here and handed over rather than imported there:
// the promotion module carries no dependency on this file.
//
// WHAT THE EXTRACTION CHANGED, AND WHAT IT DID NOT. Every gate's DECISION is the
// one it made before — same verdict for the same content. What moved is where
// each gate's evidence comes from: NONE of them consults git, and none re-reads
// the vault (Table D, rule (b); Table S, row S4). The EP2 gate additionally lost
// its ENFORCEMENT half — the revert, re-stage and index-drop core, the
// refusal-reason suffixes it composed and the `reverted[]` accounting they fed —
// because under promotion nothing this gate judges was ever written to the
// vault, so there is nothing to revert. `promote()`'s own refusal accounting,
// and the PRESERVATION RECORD every preserving arm carries, replace all three.
//
// WHAT SURVIVES THE CUT, and it is the hard part (Table V, row V3): the EP2
// gate's DURABLE quarantine lifecycle is decided in the shipped
// `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` and is not this package's
// to change — the preservation-failure abort, the identity-gated deletion of a
// redundant `redacted/` copy, and the once-per-run retention prune are all still
// here and still decide what they decided. The ONE authorized change is the
// CARRIER of the kept copy's announcement: it used to ride a refusal reason this
// package deletes, so it rides the preservation record instead (owner ruling,
// 2026-08-29; `WP-dream-promote-module`, Table Q rows Q1, Q8 and Q9).

/**
 * Build the run's four gates.
 *
 * They are built together because the EP2 gate is the only one with RUN state —
 * the basenames it wrote into `redacted/` and whether any redaction completed —
 * and that state is what the once-per-run retention prune is a function of.
 *
 * @param {{stateDir?:string, profile?:Record<string,string>}} [o]
 *   stateDir  the core `state/` dir. The EP2 gate preserves into
 *     `<stateDir>/quarantine/`; absent, every preservation fails and the gate
 *     withholds without a copy, exactly as the shipped gate does.
 *   profile   A0 pre-use freeze (WP-109) code-level test seam ONLY (never
 *     env/argv). Omitted → the frozen profile, so a dream write to an injected
 *     identity file is refused even when it clears the Tier-3 numeric floor.
 * @returns {{secret:Function, skillBody:Function, tier3:Function, ledger:Function,
 *            pruneRedacted:() => void}}
 */
function makeGates(o = {}) {
  const stateDir = o.stateDir;
  const profile = o.profile;
  /** @type {Set<string>} every basename this run wrote into `redacted/` */
  const redactedCreated = new Set();
  /** how many redactions COMPLETED — the prune's precondition */
  let completedRedactions = 0;

  /**
   * The EP2 staged-output secret gate (audit A5, ADR-0024, ADR-0034), returning
   * the ADR-0034 taxonomy rather than performing enforcement.
   *
   * It scans the lines THIS RUN ADDED — exactly the bytes the run is responsible
   * for, which is the same property the staged-diff form had, established now
   * from the delta's `addedLineNumbers` over the workspace's after-bytes instead
   * of from `git diff --cached`.
   *
   * UNSCANNABLE CONTENT IS THIS GATE'S CLASSIFICATION, and it lands in the
   * WITHHOLD ARM — preserved to `state/quarantine/`, then refused, exactly as a
   * hard-secret finding is (`WP-ep2-unscannable-preserve`, Table U). Two
   * consequences a reader needs: the redact arm below may assume decodable text
   * because unscannable content never reaches it, and `record.binary` is a
   * REQUIRED input — a caller that omits `record` gets only the round-trip half
   * of the check.
   * @param {{rel:string, record:{binary?:boolean}, baselineBytes:Buffer|null,
   *          afterBytes:Buffer, addedLineNumbers:number[],
   *          layout:import('../layout').VaultLayout, date:string}} g
   * @returns {{ok:true}
   *          |{refuse:true, reason:string, preserved:Array<{artifact:string, location:string}>}
   *          |{redact:true, sanitizedBytes:Buffer,
   *            redaction:{lines:number, labels:string},
   *            preserved:Array<{artifact:string, location:string}>}}
   * @throws {WienerdogError} TWO structurally different throws.
   *   (1) Table P row P0 (`WP-preservation-abort-widening`): no VERIFIED
   *   artifact holds the judged bytes — the trigger is a CLASS (Table P rows
   *   P0-P3), not a single named case; byte-identity (P0b) and the durable
   *   conjunct (`WP-quarantine-preserve-durability`, Table F) are both
   *   established before a preservation may report success.
   *   (2) Table D row D3, including `WP-quarantine-preserve-durability`
   *   Table F row F8's INDETERMINATE outcome: a preservation failure's
   *   cleanup (removing `tmp` or `dest`) could not be completed, or a stat
   *   could not determine ownership of a path this call may own — this
   *   propagates out of `quarantinePreserve` and straight out of this
   *   function unchanged.
   */
  const secret = (g) => {
    const { rel, afterBytes, date } = g;
    const nums = Array.isArray(g.addedLineNumbers) ? g.addedLineNumbers : [];
    /** @type {string|null} the refusal reason, once some branch has one */
    let reason = null;
    /** @type {{name:string, bytes:Buffer}|null} the `redacted/` copy the arm wrote */
    let redactCopy = null;
    /** true once the redact arm was entered and did not complete */
    let redactFellThrough = false;

    // ── UNSCANNABLE CONTENT: classified HERE, and it FALLS THROUGH to the
    //    withhold arm rather than returning (`WP-ep2-unscannable-preserve`,
    //    Table U). This gate is the party that holds the bytes and the party
    //    that preserves, so this is where "cannot be scanned" has to be decided
    //    — deciding it in the caller put the refusal AHEAD of the preservation
    //    and the class lost its durable artifact and its digest banner, while
    //    the hard-secret class beside it kept both. Same origin, same fate.
    //
    //    The check runs BEFORE the decode below, because that decode is exactly
    //    what is unsafe on these bytes: `toString('utf8')` substitutes U+FFFD
    //    and never fails, so a scan over the decoded text is a scan over bytes
    //    that are not in the file. The delta primitive's own `binary` flag is
    //    the first half of the question and this file's round-trip check is the
    //    second; neither is a finding, so neither can reach the redact arm.
    const deltaRecord = g.record && typeof g.record === 'object' ? g.record : {};
    if (deltaRecord.binary === true) {
      reason = 'content is binary and cannot be secret-scanned; not promoted';
    } else if (!isLosslessUtf8(afterBytes)) {
      reason = 'content is not lossless UTF-8 and cannot be secret-scanned; not promoted';
    } else {
      // The scanned blob is the added LINES, joined — the same text the staged
      // `+` lines produced, minus git's leading `+`.
      const raw = afterBytes.toString('utf8');
      const body = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
      const lines = body.split('\n');
      const addedText = nums
        .filter((l) => Number.isInteger(l) && l >= 1 && l <= lines.length)
        .map((l) => lines[l - 1])
        .join('\n');
      if (addedText === '') return { ok: true }; // added no bytes this run
      const { findings } = scanAndRedact(addedText);
      if (findings.length === 0) return { ok: true };

      // Metadata-only reason: distinct code-owned labels, never the matched bytes.
      const labels = findings.map((f) => f.label).join(', ');
      reason = `content matched a secret pattern (${labels}); not promoted`;

      if (!hasHardFinding(findings)) {
        // ── The redact arm. Preserve the unredacted original FIRST, then scrub
        //    only the lines this run added, against the very bytes that were
        //    preserved. Never redact a note whose original could not be preserved:
        //    that is the permanent-corruption outcome this design exists to avoid.
        //    Anything short of a verified scrub falls through to the withhold.
        redactCopy = quarantinePreserve(stateDir, afterBytes, rel, date, 'redacted');
        if (redactCopy) redactedCreated.add(redactCopy.name);
        const sanitized = redactCopy ? scrubAddedLines(nums, redactCopy.bytes) : null;
        if (sanitized) {
          completedRedactions += 1; // increments LAST, only after a verified scrub
          return {
            redact: true,
            sanitizedBytes: sanitized,
            // `lines` is the SHIPPED count — every added line the scrub ran over.
            // Row G7 carries a PENDING named narrowing of it, blocked on an owner
            // decision against the pin in
            // `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`. Until that
            // decision this is the value, and no surface may call it a count of
            // CHANGED lines.
            redaction: { lines: nums.length, labels },
            preserved: [{ artifact: redactCopy.name, location: `quarantine/${REDACTED_SUBDIR}` }],
          };
        }
        redactFellThrough = true;
      }
    }

    // ── The withhold arm.
    const preserved = quarantinePreserve(stateDir, afterBytes, rel, date, 'withheld');

    // ── The abort (`WP-preservation-abort-widening`, Table P row P0). THE
    //    RULE: this gate never returns a `{refuse:true}` verdict whose
    //    `preserved` record would be empty — raise the Q18 abort instead.
    //    `!preserved && !redactCopy` is exactly that condition: a truthy
    //    `redactCopy` means the record below will carry it (or, on the
    //    identity-gated dedup path, that it was a duplicate of a preserved
    //    withheld copy — either way the record is non-empty), and a truthy
    //    `preserved` is pushed onto the record directly. P0b already verified
    //    both by reading the artifact back before returning non-`null`, so a
    //    surviving `redactCopy` here holds the judged bytes by construction
    //    (row P3's escape) and needs no second comparison against them.
    if (!preserved && !redactCopy) {
      // Never let the only copy of the note go unheld: refuse the whole run
      // unless some durable artefact holds THE BYTES BEING JUDGED. Row G5's
      // teardown exception is what makes this refusal safe: the workspace
      // holding the note is NOT destroyed (`WP-dream-promote-module`, Table Q
      // row Q4). `redactFellThrough` selects the message: it is true only
      // when the redact arm was entered and did not complete, which is P3;
      // false means the redact arm was never entered at all (a hard secret or
      // unscannable content), which is P1/P2.
      throw new WienerdogError(
        secretGateAbortMessage(
          rel,
          null,
          'not performed, because there was no saved copy to compare against',
          redactFellThrough ? 'both-failed' : 'no-redaction-attempted'
        )
      );
    }

    /** @type {Array<{artifact:string, location:string}>} the preservation record */
    const record = [];
    if (preserved) record.push({ artifact: preserved.name, location: 'quarantine' });

    if (redactCopy) {
      // ── The identity-gated deletion (shipped decision, preserved). Dispose of
      //    the redact arm's copy only when a byte-identical withheld copy
      //    demonstrably exists; anything else — the withheld preserve failed,
      //    either read threw, or the buffers differ — KEEPS it, because it is
      //    then the only copy of a version of the user's note that exists
      //    anywhere.
      //
      //    THE ONE CARRIER CHANGE (owner ruling, 2026-08-29). The keep branch
      //    used to announce the copy by appending to a refusal reason whose only
      //    consumer this package deletes; it announces it on the PRESERVATION
      //    RECORD instead, which is what Table Q row Q8 requires of every fact
      //    about a preserved copy. WHICH copy is deleted and which is kept is
      //    unchanged.
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
        record.push({ artifact: redactCopy.name, location: `quarantine/${REDACTED_SUBDIR}` });
      }
    }

    return { refuse: true, reason, preserved: record };
  };

  /**
   * Tier-3: the A0 identity freeze, then the fixed numeric floor.
   *
   * The freeze is folded in here because Table D gives the Tier-3 gate the
   * `{rel, candidateBytes, layout}` triple and the frozen profile is PROCESS
   * state, not run evidence — unchanged by the extraction. Its position relative
   * to the skill-body guard is unchanged in effect: an injected identity file is
   * never a SKILL.md, so the skill guard passes it through untouched.
   *
   * The learnings ledger is exempt from the numeric floor, exactly as it was:
   * the retired validator tested `isLearningsLedger` BEFORE the Tier-3 block, so
   * a ledger was validated rather than floored.
   * @param {{rel:string, candidateBytes:Buffer,
   *          layout:import('../layout').VaultLayout}} g
   * @returns {string|null}
   */
  const tier3 = (g) => {
    const { rel, candidateBytes, layout } = g;
    if (isLearningsLedgerRel(rel, layout)) return null;
    const idPrefix = (layout.identity_dir + '/').toLowerCase();
    // The identity-dir prefix matches case-insensitively (mirror
    // isInjectedIdentity, WP-116/ADR-0021): a case-variant identity dir is the
    // same inode on a case-insensitive FS, so its write must still be governed.
    // The skills-dir prefix stays case-sensitive.
    const isTier3 =
      String(rel).toLowerCase().startsWith(idPrefix) || rel.startsWith(layout.skills_dir + '/');
    if (!isTier3) return null;
    if (isInjectedIdentity(rel, layout) && !isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, profile)) {
      return (
        'automatic identity activation is frozen (safety profile); the dream may not change the ' +
        'injected identity files — run `wienerdog safety`'
      );
    }
    const decision = tier3Decision(rel, candidateBytes);
    return decision.ok ? null : decision.reason;
  };

  return {
    secret,
    skillBody: skillBodyViolation,
    tier3,
    ledger: ledgerViolation,
    /**
     * Retention, once per run and only after a COMPLETED redaction — a run that
     * redacted nothing never runs a delete path over the recovery directory.
     * Called by the pipeline after `promote()` returns, which is the point the
     * per-path loop it used to follow has finished.
     */
    pruneRedacted: () => {
      if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
    },
  };
}

module.exports = {
  // The four gates, built for injection into `promote()` (Table D).
  makeGates,
  parseFrontmatter,
  assertGitRepo,
  // NO consumer in `src/` any more, and that is the contract rather than an
  // oversight (rows G3 and G6, owner ruling of 2026-08-30). The unknown-command
  // non-vacuity guard was its last caller; re-basing that guard onto the
  // workspace delta IS the replacement of this call, because the premise it
  // rested on — a tree asserted clean immediately before the spawn — is what
  // removing the pre-commit destroys. Exported still: it is a sound, general
  // clean-tree assertion and the tests use it to build fixtures.
  assertCleanTree,
  // Left in place and exported (row G9): this package changes only which
  // function the two abort sites call, not the crash-replay / journal /
  // uninstall-restore subject the residue-lifecycle successor owns.
  restoreVaultToHead,
  scrubAddedLines,
  // Row G10: the pipeline's ownership-registry call site decides newness from
  // the run's delta, and still needs the draft predicate.
  isNewSkillDraft,
  // Exported for direct unit coverage of Table D (`WP-preservation-abort-widening`):
  // its disposal states (D0-D4) and P0b's read-back verification are precise,
  // ownership-scoped filesystem behaviour that is far more directly tested
  // against this primitive than indirectly through a gate fixture.
  quarantinePreserve,
  // Exported for direct unit coverage of THE PAIR RULE (`WP-preservation-abort-widening`,
  // "Exact contracts"): no reachable abort in the gate ever pairs an active
  // enum member with a non-null `redactedName`, so the contract-violation
  // path can only be exercised by calling this function directly.
  secretGateAbortMessage,
};
