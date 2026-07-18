'use strict';

// The canonical broker-owned grant store (WP-139, ADR-0026): a 0600 JSON file
// at state/broker-grants.json, outside the model's write surface, mutated ONLY
// by the interactive TTY path (`wienerdog grant`). Grants are keyed by
// (routineId, kind); each carries an exact-byte sha256 integrity marker over
// its canonical serialization, mirroring the identity trust registry
// (ADR-0021).
//
// HONEST BOUNDARY (D-STORE-INTEGRITY, F2/A12): a self-recorded hash in a
// same-user-writable directory is tamper-EVIDENCE between attended human
// actions, NOT an OS boundary — a same-user native actor can rewrite hash and
// store alike. The real defense that a hijacked MODEL cannot forge a grant is
// A1 (no Bash, staging-only writes) + A2 (no raw credential). No keyed MAC: a
// same-user-readable key is not a boundary and would only imply a false
// guarantee.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { WienerdogError } = require('../../core/errors');
const { writeFilePrivate } = require('../../core/private-fs');

const STORE_BASENAME = 'broker-grants.json';
const KINDS = Object.freeze(['send_self', 'calendar_write']);

/** The fixed, secret-free alert surfaced when the store fails its check. */
const INTEGRITY_ALERT =
  'grant store integrity check failed — not sending; ' +
  're-grant at the keyboard with `wienerdog grant`';

/**
 * @typedef {Object} StoredGrant
 * @property {string} routineId
 * @property {'send_self'|'calendar_write'} kind
 * @property {string[]} to          [] for send_self (recipient is server-resolved self)
 * @property {string} approved_at
 * @property {string} integrity     sha256 over the grant's canonical bytes
 */

/** @param {import('../../core/paths').WienerdogPaths} paths @returns {string} */
function storePath(paths) {
  return path.join(paths.state, STORE_BASENAME);
}

/** Key identity is case-folded; content bytes stay exact (ADR-0021). */
function grantKey(routineId, kind) {
  return `${String(routineId).toLowerCase()}:${kind}`;
}

/**
 * Canonical serialization of a grant's CONTENT (stable key order, no
 * whitespace variance, integrity field excluded) — the bytes the marker
 * covers. A one-byte change to any stored field changes this.
 * @param {StoredGrant} g
 * @returns {string}
 */
function canonicalBytes(g) {
  return JSON.stringify({
    routineId: g.routineId,
    kind: g.kind,
    to: g.to,
    approved_at: g.approved_at,
  });
}

/** @param {StoredGrant} g @returns {string} sha256 hex over canonical bytes */
function integrityOf(g) {
  return crypto.createHash('sha256').update(canonicalBytes(g)).digest('hex');
}

/**
 * Read + parse the store. Returns null when absent, or the parsed object when
 * shaped {version, grants:object}; anything else returns 'malformed'.
 * @param {import('../../core/paths').WienerdogPaths} paths
 * @returns {{version:number, grants:Record<string, StoredGrant>}|null|'malformed'}
 */
function readStore(paths) {
  let raw;
  try {
    raw = fs.readFileSync(storePath(paths), 'utf8');
  } catch {
    return null;
  }
  try {
    const obj = JSON.parse(raw);
    if (
      obj && typeof obj === 'object' && !Array.isArray(obj) &&
      obj.grants && typeof obj.grants === 'object' && !Array.isArray(obj.grants)
    ) {
      return obj;
    }
  } catch {
    /* fall through */
  }
  return 'malformed';
}

/**
 * Read a grant and VERIFY its integrity marker. Fail closed, NEVER throws:
 * a missing grant/store denies quietly (the normal ungranted state); a
 * malformed store or an integrity mismatch denies with the fixed alert.
 * @param {import('../../core/paths').WienerdogPaths} paths
 * @param {string} routineId
 * @param {'send_self'|'calendar_write'} kind
 * @returns {{allowed:boolean, reason:string, alert?:string}}
 */
function grantCheck(paths, routineId, kind) {
  if (!routineId || !KINDS.includes(kind)) {
    return { allowed: false, reason: 'unknown grant kind or missing routine' };
  }
  const store = readStore(paths);
  if (store === null) return { allowed: false, reason: 'no grant store' };
  if (store === 'malformed') {
    return { allowed: false, reason: 'grant store unreadable', alert: INTEGRITY_ALERT };
  }
  const entry = store.grants[grantKey(routineId, kind)];
  if (!entry) return { allowed: false, reason: 'no grant for this routine' };
  if (
    typeof entry !== 'object' ||
    entry.kind !== kind ||
    String(entry.routineId).toLowerCase() !== String(routineId).toLowerCase() ||
    typeof entry.integrity !== 'string' ||
    entry.integrity !== integrityOf(entry)
  ) {
    return { allowed: false, reason: 'grant integrity mismatch', alert: INTEGRITY_ALERT };
  }
  return { allowed: true, reason: 'grant present and intact' };
}

/**
 * Mint/replace a grant. TTY-ONLY: throws unless `opts.confirmedAtTty === true`
 * (the CLI passes it only after the typed-word confirmation read from
 * /dev/tty). There is deliberately NO --yes/env/headless path. Writes the
 * store atomically at 0600 with a fresh integrity marker.
 * @param {import('../../core/paths').WienerdogPaths} paths
 * @param {{routineId:string, kind:'send_self'|'calendar_write', to?:string[], approved_at?:string}} grant
 * @param {{confirmedAtTty:boolean}} opts
 */
function putGrant(paths, grant, opts) {
  if (!opts || opts.confirmedAtTty !== true) {
    throw new WienerdogError(
      'a grant can only be minted after the typed confirmation at a real terminal'
    );
  }
  if (!grant || !grant.routineId || typeof grant.routineId !== 'string') {
    throw new WienerdogError('a grant needs a routine id');
  }
  if (!KINDS.includes(grant.kind)) {
    throw new WienerdogError(`unknown grant kind: ${String(grant.kind).slice(0, 32)}`);
  }

  /** @type {StoredGrant} */
  const entry = {
    routineId: grant.routineId,
    kind: grant.kind,
    to: Array.isArray(grant.to) ? grant.to.map(String) : [],
    approved_at: grant.approved_at || new Date().toISOString(),
    integrity: '',
  };
  entry.integrity = integrityOf(entry);

  const existing = readStore(paths);
  const store = existing && existing !== 'malformed' ? existing : { version: 1, grants: {} };
  store.version = 1;
  store.grants[grantKey(entry.routineId, entry.kind)] = entry;
  writeFilePrivate(storePath(paths), `${JSON.stringify(store, null, 2)}\n`);
}

module.exports = { storePath, grantCheck, putGrant, INTEGRITY_ALERT };
