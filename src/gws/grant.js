'use strict';

const fs = require('node:fs');

/**
 * LEGACY send-grant reading + the pure enforcement decision (ADR-0007).
 *
 * WP-139 RETIRED the config.yaml managed-YAML grant block as a WRITE target:
 * the audit (A2, F2) showed the old write path was an unauthenticated
 * plaintext fact any same-user writer could forge — and it even re-synced the
 * recorded install hash. Grants now live ONLY in the broker-owned store
 * (src/gws/broker/grant-store.js), minted ONLY by the TTY-confirmed
 * `wienerdog grant` CLI. This module keeps:
 *  - `parseGrants`/`findGrant`: READ-ONLY legacy-block parsing, retained solely
 *    because the frozen `gmail.js send` path still consults it (reconciled to
 *    the store by WP-141); it can no longer be written by any product path.
 *  - `isSendAllowed`: the pure fail-closed exact-address enforcement decision,
 *    reused by the store for any future third-party allowlist.
 *
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 * @typedef {{routine:string, to:string[]}} Grant
 */

/** The exact begin/end sentinels of the LEGACY block (full lines, with `#`). */
const BEGIN = '# --- wienerdog:grants (managed by `wienerdog grant`; do not edit by hand) ---';
const END = '# --- end wienerdog:grants ---';

/**
 * Parse the legacy grants managed-section out of config.yaml content. Reads
 * only between the two sentinels. Absent section → [].
 * @param {string} configText
 * @returns {Grant[]}
 */
function parseGrants(configText) {
  const beginIdx = configText.indexOf(BEGIN);
  const endIdx = configText.indexOf(END);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) return [];
  const inner = configText.slice(beginIdx + BEGIN.length, endIdx);
  /** @type {Grant[]} */
  const grants = [];
  let current = null;
  for (const line of inner.split('\n')) {
    const routineMatch = line.match(/^\s*-\s*routine:\s*(.+?)\s*$/);
    if (routineMatch) {
      current = { routine: routineMatch[1], to: [] };
      grants.push(current);
      continue;
    }
    const toItem = line.match(/^\s*-\s*(\S+)\s*$/);
    if (toItem && current) current.to.push(toItem[1]);
    // `grants:`, `to:`, blank, and comment lines are ignored.
  }
  return grants;
}

/**
 * Is a legacy YAML grant block present in this config text? Used for the
 * one-time "grant model changed" notice (D-GRANT-MIGRATION).
 * @param {string} configText
 * @returns {boolean}
 */
function hasLegacyYamlGrants(configText) {
  return configText.includes(BEGIN);
}

/**
 * Look up the LEGACY grant for a routine (read-only; see module comment).
 * @param {WienerdogPaths} paths
 * @param {string|null} routine
 * @returns {Grant|null} null if routine is null/absent
 */
function findGrant(paths, routine) {
  if (!routine) return null;
  let configText;
  try {
    configText = fs.readFileSync(paths.config, 'utf8');
  } catch {
    return null;
  }
  return parseGrants(configText).find((g) => g.routine === routine) || null;
}

/**
 * THE ENFORCEMENT DECISION (pure; unit-tested). Allowed IFF grant is non-null
 * AND every recipient is in grant.to (case-insensitive, trimmed exact-address
 * match — no wildcards, no domain grants). Otherwise allowed=false with a
 * plain-language reason naming what was missing.
 * @param {Grant|null} grant
 * @param {string[]} recipients
 * @returns {{allowed:boolean, reason:string}}
 */
function isSendAllowed(grant, recipients) {
  if (!grant) {
    return { allowed: false, reason: 'no send grant for this routine' };
  }
  const list = (recipients || []).map((r) => String(r).trim()).filter(Boolean);
  if (list.length === 0) {
    return { allowed: false, reason: 'no recipient to check (empty list)' };
  }
  const allow = new Set((grant.to || []).map((a) => String(a).trim().toLowerCase()));
  for (const r of list) {
    if (!allow.has(r.toLowerCase())) {
      return { allowed: false, reason: `recipient ${r} not in allowlist` };
    }
  }
  return { allowed: true, reason: 'all recipients granted' };
}

module.exports = { parseGrants, hasLegacyYamlGrants, findGrant, isSendAllowed };
