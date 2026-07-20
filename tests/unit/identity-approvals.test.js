'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  foldKey, hashBytes, registryPath, injectedIdentityRels, fileHash,
  readRegistry, writeRegistry, approvalsMap, approvalsFromVault,
  seedApprovals, identityStatus,
} = require('../../src/core/identity-approvals');
const { defaultLayout } = require('../../src/core/layout');
const { allowAll } = require('../../src/core/safety-profile');

/** Fresh temp state dir + vault with the four identity files. */
function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-idappr-'));
  const stateDir = path.join(tmp, 'state');
  const vaultDir = path.join(tmp, 'vault');
  const idDir = path.join(vaultDir, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  for (const f of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    fs.writeFileSync(path.join(idDir, f), `# ${f}\ncontent of ${f}\n`);
  }
  return { stateDir, vaultDir };
}

test('hashBytes is byte-exact: no case-folding, no newline normalization', () => {
  assert.notEqual(hashBytes(Buffer.from('Profile')), hashBytes(Buffer.from('profile')));
  assert.notEqual(hashBytes(Buffer.from('a\r\n')), hashBytes(Buffer.from('a\n')));
  // Deterministic for identical bytes.
  assert.equal(hashBytes(Buffer.from('x')), hashBytes(Buffer.from('x')));
});

test('foldKey folds the PATH only (content identity stays byte-exact elsewhere)', () => {
  assert.equal(foldKey('06-Identity/Profile.md'), '06-identity/profile.md');
  assert.equal(foldKey('06-Identity/profile.md'), foldKey('06-identity/PROFILE.MD'));
});

test('readRegistry: missing or corrupt file fails closed to an empty approvals map', () => {
  const { stateDir } = setup();
  assert.deepEqual(readRegistry(stateDir), { version: 1, approvals: {} });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(registryPath(stateDir), 'not json at all');
  assert.deepEqual(readRegistry(stateDir), { version: 1, approvals: {} });
  fs.writeFileSync(registryPath(stateDir), JSON.stringify({ approvals: [] }));
  assert.deepEqual(readRegistry(stateDir), { version: 1, approvals: {} });
});

test('writeRegistry persists atomically at mode 0600 and round-trips', () => {
  const { stateDir } = setup();
  const registry = {
    version: 1,
    approvals: { '06-identity/profile.md': { approved_blob_hash: 'abc', approved_at: 't', source: 'setup' } },
  };
  writeRegistry(stateDir, registry);
  const mode = fs.statSync(registryPath(stateDir)).mode & 0o777;
  assert.equal(mode, 0o600, 'registry file is 0600');
  assert.deepEqual(readRegistry(stateDir), registry);
  // No stray temp file left behind.
  const stray = fs.readdirSync(stateDir).filter((f) => f.includes('.tmp'));
  assert.deepEqual(stray, []);
});

test('seedApprovals records present files once (source setup) and NEVER re-seeds', () => {
  const { stateDir, vaultDir } = setup();
  const layout = defaultLayout();
  const first = seedApprovals(stateDir, vaultDir, layout);
  assert.equal(first.seeded.length, 4, 'all four present files seeded');
  const reg1 = readRegistry(stateDir);
  const key = '06-identity/profile.md';
  assert.equal(reg1.approvals[key].source, 'setup');
  const originalHash = reg1.approvals[key].approved_blob_hash;
  assert.equal(originalHash, fileHash(vaultDir, '06-Identity/profile.md'));

  // Second call: nothing new to seed.
  assert.deepEqual(seedApprovals(stateDir, vaultDir, layout).seeded, []);

  // Change the file → seed must NOT update the recorded hash (fail closed until
  // a human ratifies via `wienerdog memory approve`, WP-117).
  fs.appendFileSync(path.join(vaultDir, '06-Identity', 'profile.md'), 'tampered\n');
  assert.deepEqual(seedApprovals(stateDir, vaultDir, layout).seeded, []);
  assert.equal(readRegistry(stateDir).approvals[key].approved_blob_hash, originalHash, 'stale hash kept');
});

test('seedApprovals no-ops under an allowed gate (allowAll) even for first-appearance files', () => {
  const { stateDir, vaultDir } = setup();
  const layout = defaultLayout();
  // Gate open (dream may author these) → the no-TTY auto-seed refuses: writes
  // nothing, records nothing. Ratification is TTY `memory approve` only.
  assert.deepEqual(seedApprovals(stateDir, vaultDir, layout, allowAll()).seeded, []);
  assert.equal(fs.existsSync(registryPath(stateDir)), false, 'no registry written');
  assert.deepEqual(readRegistry(stateDir).approvals, {});
});

test('seedApprovals under allowAll re-seeds nothing on registry loss (fail closed, not fail open)', () => {
  const { stateDir, vaultDir } = setup();
  const layout = defaultLayout();
  // Simulate registry loss: readRegistry → {approvals:{}}. With the gate open the
  // "re-seed all four from current (possibly dream-modified) bytes" path is refused.
  assert.deepEqual(seedApprovals(stateDir, vaultDir, layout, allowAll()).seeded, []);
  assert.deepEqual(readRegistry(stateDir).approvals, {});
});

test('seedApprovals still seeds under a blocked profile (frozen-era behavior unchanged)', () => {
  const { stateDir, vaultDir } = setup();
  const layout = defaultLayout();
  // The default profile is the production (frozen → blocked) profile: seeds as today.
  assert.equal(seedApprovals(stateDir, vaultDir, layout).seeded.length, 4);
});

test('seedApprovals skips absent files and seeds them on a later sync when they appear', () => {
  const { stateDir, vaultDir } = setup();
  const layout = defaultLayout();
  fs.rmSync(path.join(vaultDir, '06-Identity', 'goals.md'));
  assert.equal(seedApprovals(stateDir, vaultDir, layout).seeded.length, 3);
  // goals.md appears later (human writes it) → next sync seeds just that one.
  fs.writeFileSync(path.join(vaultDir, '06-Identity', 'goals.md'), 'goals\n');
  assert.deepEqual(seedApprovals(stateDir, vaultDir, layout).seeded, ['06-identity/goals.md']);
});

test('approvalsMap keeps only string hashes; approvalsFromVault mirrors current bytes', () => {
  const { vaultDir } = setup();
  const layout = defaultLayout();
  const map = approvalsFromVault(vaultDir, layout);
  assert.equal(Object.keys(map).length, 4);
  assert.equal(map['06-identity/profile.md'], fileHash(vaultDir, '06-Identity/profile.md'));
  // Malformed entries are dropped by approvalsMap.
  const reg = { version: 1, approvals: { a: { approved_blob_hash: 'h' }, b: {}, c: null, d: { approved_blob_hash: 7 } } };
  assert.deepEqual(approvalsMap(reg), { a: 'h' });
});

test('identityStatus classifies ok / mismatch / unapproved / absent', () => {
  const { stateDir, vaultDir } = setup();
  const layout = defaultLayout();
  fs.rmSync(path.join(vaultDir, '06-Identity', 'instructions.md'));
  seedApprovals(stateDir, vaultDir, layout); // seeds the three present files
  fs.appendFileSync(path.join(vaultDir, '06-Identity', 'profile.md'), 'edit\n'); // → mismatch
  fs.writeFileSync(path.join(vaultDir, '06-Identity', 'instructions.md'), 'late\n'); // present, unseeded here
  const status = identityStatus(vaultDir, layout, readRegistry(stateDir));
  const byRel = Object.fromEntries(status.map((s) => [s.rel, s.status]));
  assert.equal(byRel['06-Identity/profile.md'], 'mismatch');
  assert.equal(byRel['06-Identity/preferences.md'], 'ok');
  assert.equal(byRel['06-Identity/goals.md'], 'ok');
  assert.equal(byRel['06-Identity/instructions.md'], 'unapproved');
});

test('injectedIdentityRels builds vault-relative POSIX paths from the layout', () => {
  const rels = injectedIdentityRels({ ...defaultLayout(), identity_dir: '09-Me' });
  assert.deepEqual(rels, ['09-Me/profile.md', '09-Me/preferences.md', '09-Me/goals.md', '09-Me/instructions.md']);
});
