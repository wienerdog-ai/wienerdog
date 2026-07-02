'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { WienerdogError } = require('../errors');

// Tier-3 code floor. FIXED — never tuned by memory_mode (see WP-017 spec). A
// change under one of these prefixes survives only if its frontmatter satisfies
// ALL of: derived_from_untrusted === false, confidence >= 0.85, recurrence >= 3.
const TIER3_PREFIXES = ['06-Identity/', '05-Skills/'];
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

/** @param {string} rel @returns {boolean} true if rel is under a Tier-3 prefix. */
function isTier3(rel) {
  return TIER3_PREFIXES.some((prefix) => rel.startsWith(prefix));
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
 *           scratchBaseline?:Record<string,string> }} o
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
  const { vaultDir, scratchDir, date, expectedScratch, scratchBaseline } = o;

  // Preconditions (the caller checks these before the brain runs; re-assert).
  assertGitRepo(vaultDir);
  const vaultReal = fs.realpathSync(vaultDir);

  /** @type {Array<{path:string, reason:string}>} */
  const reverted = [];
  /** @type {Array<{path:string, reason:string}>} */
  const outOfVaultDetailed = [];

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
    if (isTier3(rel)) {
      // b. Tier-3 gate.
      const decision = tier3Decision(vaultDir, rel);
      if (!decision.ok) {
        revertPath(vaultDir, rel, change.untracked);
        reverted.push({ path: rel, reason: decision.reason });
      }
      continue;
    }
    // c. Tier-1/2 note, daily log, or report → keep.
  }

  // ── Step 4: append the enforcement section to the dream report ───────────
  // (Step 3, the revert mechanic, is applied inline above via revertPath.)
  const reportRel = path.join('reports', 'dreams', `${date}.md`);
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
    if (rel.startsWith('05-Skills/')) skills++;
    else if (rel.startsWith('reports/')) continue;
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

  return {
    committed,
    reverted,
    outOfVault: outOfVaultDetailed.map((r) => r.path),
    sha,
    counts: { notes, skills },
  };
}

module.exports = { validateAndCommit, parseFrontmatter, assertGitRepo, assertCleanTree };
