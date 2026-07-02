'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { validateAndCommit, parseFrontmatter } = require('../../src/core/dream/validate');

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

/** A fresh temp vault git repo (one initial commit) + an empty scratch dir. */
function tempVault(seed = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-validate-'));
  const vault = path.join(root, 'vault');
  const scratch = path.join(root, 'scratch');
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(scratch, { recursive: true });
  git(vault, ['init', '-q']);
  git(vault, ['config', 'user.name', 'test']);
  git(vault, ['config', 'user.email', 'test@test']);
  for (const [rel, content] of Object.entries(seed)) {
    const full = path.join(vault, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  git(vault, ['add', '-A']);
  git(vault, ['commit', '-q', '--allow-empty', '-m', 'init']);
  return { root, vault, scratch };
}

/** @param {string} vault @param {string} rel @param {string} content */
function writeVault(vault, rel, content) {
  const full = path.join(vault, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const FM = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\nbody\n`;

// ── parseFrontmatter ─────────────────────────────────────────────────────────

test('dream-validate: parseFrontmatter coerces unquoted booleans, keeps quoted strings', () => {
  const fm = parseFrontmatter('---\nconfidence: 0.9\nderived_from_untrusted: false\nname: "false"\n---\nbody');
  assert.equal(fm.confidence, '0.9');
  assert.equal(fm.derived_from_untrusted, false);
  assert.equal(fm.name, 'false'); // quoted → literal string, not boolean
});

test('dream-validate: parseFrontmatter returns {} without a leading block', () => {
  assert.deepEqual(parseFrontmatter('no frontmatter here'), {});
  assert.deepEqual(parseFrontmatter('---\nunterminated: x\nbody'), {});
});

// ── the gate ─────────────────────────────────────────────────────────────────

test('dream-validate: keeps valid tiers, reverts injection + weak skill, deletes out-of-vault, one commit', () => {
  const { vault, scratch } = tempVault();
  const before = git(vault, ['rev-list', '--count', 'HEAD']).trim();

  writeVault(vault, '03-Resources/valid-note.md', FM({ type: 'note', derived_from_untrusted: 'false' }));
  writeVault(vault, '06-Identity/valid-identity.md', FM({ confidence: '0.9', recurrence: '3', derived_from_untrusted: 'false' }));
  writeVault(vault, '06-Identity/injected.md', FM({ confidence: '0.95', recurrence: '5', derived_from_untrusted: 'true' }));
  writeVault(vault, '05-Skills/weak-skill/SKILL.md', FM({ confidence: '0.4', recurrence: '1', derived_from_untrusted: 'false' }));
  fs.writeFileSync(path.join(scratch, 'EVIL.json'), '{"exfil":true}');

  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-02', expectedScratch: [] });

  // Kept.
  assert.ok(fs.existsSync(path.join(vault, '03-Resources/valid-note.md')));
  assert.ok(fs.existsSync(path.join(vault, '06-Identity/valid-identity.md')));
  // Reverted.
  assert.equal(fs.existsSync(path.join(vault, '06-Identity/injected.md')), false);
  assert.equal(fs.existsSync(path.join(vault, '05-Skills/weak-skill/SKILL.md')), false);
  // Out-of-vault deleted.
  assert.equal(fs.existsSync(path.join(scratch, 'EVIL.json')), false);

  assert.equal(res.reverted.length, 2);
  assert.equal(res.outOfVault.length, 1);
  assert.equal(res.counts.notes, 2); // valid-note + valid-identity
  assert.equal(res.counts.skills, 0);

  // Exactly one new commit, message shape correct.
  const after = git(vault, ['rev-list', '--count', 'HEAD']).trim();
  assert.equal(Number(after), Number(before) + 1);
  const msg = git(vault, ['log', '-1', '--pretty=%s']).trim();
  assert.match(msg, /^dream: \d{4}-\d{2}-\d{2} — \d+ notes, \d+ skills$/);
  assert.equal(msg, 'dream: 2026-07-02 — 2 notes, 0 skills');

  // Injected string never lands under 06-Identity in the committed tree.
  const tracked = git(vault, ['ls-files', '06-Identity']);
  assert.ok(!tracked.includes('injected.md'));
  // `git grep` exits 1 when nothing matches — the success case here.
  let matches = '';
  try {
    matches = execFileSync('git', ['-C', vault, 'grep', '-rl', 'attacker@evil.com'], { encoding: 'utf8' });
  } catch (e) {
    if (e.status !== 1) throw e; // exit 1 = no match; anything else is a real error
  }
  assert.equal(matches.trim(), '');

  // Report enforcement section lists the reverts + out-of-vault path.
  const report = fs.readFileSync(path.join(vault, 'reports/dreams/2026-07-02.md'), 'utf8');
  assert.ok(report.includes('## Reverted by orchestrator (policy enforcement)'));
  assert.ok(report.includes('06-Identity/injected.md'));
  assert.ok(report.includes('05-Skills/weak-skill/SKILL.md'));
  assert.ok(report.includes('EVIL.json'));
});

test('dream-validate: git revert cleanly undoes the whole run', () => {
  const { vault, scratch } = tempVault();
  writeVault(vault, '06-Identity/valid-identity.md', FM({ confidence: '0.9', recurrence: '3', derived_from_untrusted: 'false' }));
  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-02', expectedScratch: [] });
  git(vault, ['revert', '--no-edit', res.sha]);
  assert.equal(fs.existsSync(path.join(vault, '06-Identity/valid-identity.md')), false);
  assert.equal(git(vault, ['status', '--porcelain']).trim(), '');
});

test('dream-validate: reverts a modified tracked identity file back to HEAD', () => {
  const original = FM({ confidence: '0.9', recurrence: '3', derived_from_untrusted: 'false' });
  const { vault, scratch } = tempVault({ '06-Identity/existing.md': original });
  // Brain downgrades it below the floor.
  writeVault(vault, '06-Identity/existing.md', FM({ confidence: '0.1', recurrence: '1', derived_from_untrusted: 'false' }));

  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-02', expectedScratch: [] });
  assert.equal(fs.readFileSync(path.join(vault, '06-Identity/existing.md'), 'utf8'), original);
  assert.equal(res.reverted.length, 1);
  assert.equal(res.reverted[0].path, '06-Identity/existing.md');
});

test('dream-validate: missing provenance frontmatter on a Tier-3 path is reverted', () => {
  const { vault, scratch } = tempVault();
  writeVault(vault, '06-Identity/nofm.md', '# no frontmatter at all\n');
  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-02', expectedScratch: [] });
  assert.equal(fs.existsSync(path.join(vault, '06-Identity/nofm.md')), false);
  assert.equal(res.reverted.length, 1);
  assert.match(res.reverted[0].reason, /missing provenance frontmatter/);
});

test('dream-validate: detects content mutation of an expected scratch file when a baseline is given', () => {
  const { vault, scratch } = tempVault();
  const extract = path.join(scratch, 'claude-c1.json');
  fs.writeFileSync(extract, '{"session_id":"c1"}');
  const baseline = { [path.resolve(extract)]: crypto.createHash('sha256').update(fs.readFileSync(extract)).digest('hex') };
  // Brain tampers with the read-only extract.
  fs.writeFileSync(extract, '{"session_id":"c1","tampered":true}');

  const res = validateAndCommit({
    vaultDir: vault,
    scratchDir: scratch,
    date: '2026-07-02',
    expectedScratch: [extract],
    scratchBaseline: baseline,
  });
  assert.equal(fs.existsSync(extract), false);
  assert.equal(res.outOfVault.length, 1);
});

test('dream-validate: a symlink escaping the vault is reverted and recorded out-of-vault', () => {
  const { root, vault, scratch } = tempVault();
  const outside = path.join(root, 'outside-secret.txt');
  fs.writeFileSync(outside, 'secret');
  // Brain plants a symlink under a Tier-3 dir pointing outside the vault.
  fs.mkdirSync(path.join(vault, '06-Identity'), { recursive: true });
  fs.symlinkSync(outside, path.join(vault, '06-Identity', 'escape'));

  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-02', expectedScratch: [] });
  assert.equal(fs.existsSync(path.join(vault, '06-Identity', 'escape')), false);
  assert.ok(res.outOfVault.includes('06-Identity/escape'));
  // The outside file itself is untouched.
  assert.equal(fs.readFileSync(outside, 'utf8'), 'secret');
});

test('dream-validate: always commits (report append) even with only reverts', () => {
  const { vault, scratch } = tempVault();
  const before = git(vault, ['rev-list', '--count', 'HEAD']).trim();
  writeVault(vault, '06-Identity/injected.md', FM({ confidence: '0.95', recurrence: '5', derived_from_untrusted: 'true' }));
  const res = validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-02', expectedScratch: [] });
  const after = git(vault, ['rev-list', '--count', 'HEAD']).trim();
  assert.equal(Number(after), Number(before) + 1);
  assert.equal(res.counts.notes, 0);
  assert.equal(res.counts.skills, 0);
  assert.ok(res.sha);
});
