'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WienerdogError } = require('./errors');
const { isCapabilityAllowed, CAPABILITY } = require('./safety-profile');

// The identity trust registry (audit A3, ADR-0021): a code-owned 0600 JSON file
// recording, per injected identity file, the sha256 of the EXACT bytes a human
// ratified. The digest injects an identity file only when its current bytes
// match its record — no record or any mismatch fails closed. Path identity is
// case-folded (Profile.md == profile.md on a case-insensitive FS share one
// slot); content identity is byte-exact (NO normalization before hashing —
// normalizing would collide distinct byte sequences and destroy tamper
// detection).

const REGISTRY_BASENAME = 'identity-approvals.json';
const INJECTED_IDENTITY_FILES = ['profile.md', 'preferences.md', 'goals.md', 'instructions.md'];

/**
 * Case-folded vault-relative key (ADR-0021: path identity folded; content exact).
 * @param {string} rel
 * @returns {string}
 */
function foldKey(rel) {
  return String(rel).toLowerCase();
}

/**
 * sha256 hex of EXACT bytes — no normalization/case-fold/newline munging.
 * @param {Buffer} buf
 * @returns {string}
 */
function hashBytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** @param {string} stateDir @returns {string} */
function registryPath(stateDir) {
  return path.join(stateDir, REGISTRY_BASENAME);
}

/**
 * The four injected identity files as vault-relative POSIX paths for a layout.
 * @param {import('./layout').VaultLayout} layout
 * @returns {string[]}
 */
function injectedIdentityRels(layout) {
  return INJECTED_IDENTITY_FILES.map((f) => `${layout.identity_dir}/${f}`);
}

/**
 * Exact-byte sha256 of an on-disk file, or null when unreadable/absent.
 * @param {string} vaultDir @param {string} rel
 * @returns {string|null}
 */
function fileHash(vaultDir, rel) {
  try {
    return hashBytes(fs.readFileSync(path.join(vaultDir, rel)));
  } catch {
    return null;
  }
}

/**
 * Read the registry. Missing/corrupt/malformed → {version:1, approvals:{}} (fail
 * closed: nothing approved). `approvals` is a plain object keyed by folded rel.
 * @param {string} stateDir
 * @returns {{version: 1, approvals: Record<string, {approved_blob_hash: string, approved_at: string, source: string}>}}
 */
function readRegistry(stateDir) {
  try {
    const obj = JSON.parse(fs.readFileSync(registryPath(stateDir), 'utf8'));
    if (
      obj && typeof obj === 'object' && !Array.isArray(obj) &&
      obj.approvals && typeof obj.approvals === 'object' && !Array.isArray(obj.approvals)
    ) {
      return { version: 1, approvals: obj.approvals };
    }
  } catch {
    /* fall through */
  }
  return { version: 1, approvals: {} };
}

/**
 * Atomically persist the registry at 0600 (state dir 0700). temp+rename+chmod,
 * mirroring src/gws/client.js token writes.
 * @param {string} stateDir
 * @param {{approvals: Record<string, object>}} registry
 */
function writeRegistry(stateDir, registry) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const dest = registryPath(stateDir);
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, approvals: registry.approvals }, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, dest);
  fs.chmodSync(dest, 0o600);
}

/**
 * The map the digest consumes: {foldedRel: approved_blob_hash}.
 * @param {{approvals?: Record<string, {approved_blob_hash?: unknown}|null>}} registry
 * @returns {Record<string, string>}
 */
function approvalsMap(registry) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(registry.approvals || {})) {
    if (v && typeof v.approved_blob_hash === 'string') out[k] = v.approved_blob_hash;
  }
  return out;
}

/**
 * TEST/seed helper: the approvals map computed from CURRENT on-disk identity
 * bytes (trust-what-is-here). Absent files are skipped.
 * @param {string} vaultDir
 * @param {import('./layout').VaultLayout} layout
 * @returns {Record<string, string>}
 */
function approvalsFromVault(vaultDir, layout) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rel of injectedIdentityRels(layout)) {
    const h = fileHash(vaultDir, rel);
    if (h) out[foldKey(rel)] = h;
  }
  return out;
}

/**
 * FIRST-TIME seed only, and ONLY while identity-auto-activation is BLOCKED
 * (ADR-0021 amendment 1): record the current exact-byte hash of each present
 * injected identity file that has NO record yet (source 'setup'). When the gate is
 * ALLOWED the dream may author these files, so a no-TTY "trust current bytes" seed
 * would auto-trust dream output — refused (returns {seeded:[]}, writes nothing);
 * ratification then goes through `wienerdog memory approve` (recordApproval, TTY).
 * NEVER re-seeds an existing record (a change requires `memory approve`, WP-117 —
 * re-seeding on change would let a post-setup tamper become approved by running
 * `sync`, forbidden by ADR-0021). Persists iff something was added. `profile`
 * defaults to the production profile (a code seam for tests only).
 * @param {string} stateDir @param {string} vaultDir
 * @param {import('./layout').VaultLayout} layout
 * @param {Record<string,string>} [profile]
 * @returns {{seeded: string[]}} folded keys added
 */
function seedApprovals(stateDir, vaultDir, layout, profile) {
  if (isCapabilityAllowed(CAPABILITY.IDENTITY_AUTO_ACTIVATION, profile)) return { seeded: [] };
  const registry = readRegistry(stateDir);
  /** @type {string[]} */
  const seeded = [];
  for (const rel of injectedIdentityRels(layout)) {
    const key = foldKey(rel);
    if (registry.approvals[key]) continue; // already has a record → never re-seed
    const h = fileHash(vaultDir, rel);
    if (!h) continue; // absent on disk → nothing to seed
    registry.approvals[key] = { approved_blob_hash: h, approved_at: new Date().toISOString(), source: 'setup' };
    seeded.push(key);
  }
  if (seeded.length > 0) writeRegistry(stateDir, registry);
  return { seeded };
}

/**
 * Record (or overwrite) the approval for one injected identity file, hashing its
 * CURRENT exact bytes. Unlike seedApprovals, this DOES overwrite an existing
 * record — it is the human ratification path (`wienerdog memory approve`,
 * WP-117, only reachable behind the TTY-confirmation boundary). Persists at 0600.
 * @param {string} stateDir @param {string} vaultDir
 * @param {string} rel  vault-relative POSIX path of the identity file
 * @param {'setup'|'approved'} source
 * @returns {{foldedRel: string, hash: string}}
 * @throws {WienerdogError} when the file is unreadable/absent.
 */
function recordApproval(stateDir, vaultDir, rel, source) {
  const hash = fileHash(vaultDir, rel);
  if (!hash) throw new WienerdogError(`cannot read identity file to approve: ${rel}`);
  const registry = readRegistry(stateDir);
  const foldedRel = foldKey(rel);
  registry.approvals[foldedRel] = { approved_blob_hash: hash, approved_at: new Date().toISOString(), source };
  writeRegistry(stateDir, registry);
  return { foldedRel, hash };
}

/**
 * Classify each injected identity file for a caller. status ∈
 * 'ok' (approved & matches) | 'mismatch' (record exists, bytes differ) |
 * 'unapproved' (present, no record) | 'absent' (not on disk).
 * @param {string} vaultDir
 * @param {import('./layout').VaultLayout} layout
 * @param {{approvals: Record<string, object>}} registry
 * @returns {Array<{rel: string, foldedRel: string, status: 'ok'|'mismatch'|'unapproved'|'absent'}>}
 */
function identityStatus(vaultDir, layout, registry) {
  const map = approvalsMap(registry);
  return injectedIdentityRels(layout).map((rel) => {
    const key = foldKey(rel);
    const h = fileHash(vaultDir, rel);
    let status;
    if (h === null) status = 'absent';
    else if (!map[key]) status = 'unapproved';
    else status = map[key] === h ? 'ok' : 'mismatch';
    return { rel, foldedRel: key, status };
  });
}

module.exports = {
  REGISTRY_BASENAME, INJECTED_IDENTITY_FILES, foldKey, hashBytes, registryPath,
  injectedIdentityRels, fileHash, readRegistry, writeRegistry, approvalsMap,
  approvalsFromVault, seedApprovals, recordApproval, identityStatus,
};
