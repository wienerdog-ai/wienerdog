'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  recordApproval, readRegistry, registryPath, fileHash, seedApprovals,
} = require('../../src/core/identity-approvals');
const { defaultLayout } = require('../../src/core/layout');
const { WienerdogError } = require('../../src/core/errors');

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-record-'));
  const stateDir = path.join(tmp, 'state');
  const vaultDir = path.join(tmp, 'vault');
  fs.mkdirSync(path.join(vaultDir, '06-Identity'), { recursive: true });
  fs.writeFileSync(path.join(vaultDir, '06-Identity', 'profile.md'), 'original bytes\n');
  return { stateDir, vaultDir };
}

test('recordApproval hashes the CURRENT exact bytes and persists at 0600', () => {
  const { stateDir, vaultDir } = setup();
  const rel = '06-Identity/profile.md';
  const { foldedRel, hash } = recordApproval(stateDir, vaultDir, rel, 'approved');
  assert.equal(foldedRel, '06-identity/profile.md');
  assert.equal(hash, fileHash(vaultDir, rel));
  const reg = readRegistry(stateDir);
  assert.equal(reg.approvals[foldedRel].approved_blob_hash, hash);
  assert.equal(reg.approvals[foldedRel].source, 'approved');
  assert.equal(fs.statSync(registryPath(stateDir)).mode & 0o777, 0o600);
});

test('recordApproval OVERWRITES an existing setup record (unlike seedApprovals)', () => {
  const { stateDir, vaultDir } = setup();
  const rel = '06-Identity/profile.md';
  seedApprovals(stateDir, vaultDir, defaultLayout());
  const seededHash = readRegistry(stateDir).approvals['06-identity/profile.md'].approved_blob_hash;

  fs.appendFileSync(path.join(vaultDir, rel), 'human edit\n');
  // seedApprovals must NOT update it…
  seedApprovals(stateDir, vaultDir, defaultLayout());
  assert.equal(readRegistry(stateDir).approvals['06-identity/profile.md'].approved_blob_hash, seededHash);
  // …but recordApproval (the human ratification path) does.
  const { hash } = recordApproval(stateDir, vaultDir, rel, 'approved');
  assert.notEqual(hash, seededHash);
  const rec = readRegistry(stateDir).approvals['06-identity/profile.md'];
  assert.equal(rec.approved_blob_hash, hash);
  assert.equal(rec.source, 'approved');
});

test('recordApproval throws WienerdogError on an absent/unreadable file', () => {
  const { stateDir, vaultDir } = setup();
  assert.throws(
    () => recordApproval(stateDir, vaultDir, '06-Identity/goals.md', 'approved'),
    WienerdogError
  );
  // Nothing persisted on failure.
  assert.deepEqual(readRegistry(stateDir).approvals, {});
});
