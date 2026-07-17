'use strict';
const { WienerdogError } = require('./errors');

/** Canonical capability-gate names (GLOSSARY: capability gate). */
const CAPABILITY = {
  GOOGLE_SETUP: 'google-setup',
  GWS_USE: 'gws-use',
  EXTERNAL_CONTENT_ROUTINE: 'external-content-routine',
  DAILY_SUMMARY_INJECTION: 'daily-summary-injection',
  IDENTITY_AUTO_ACTIVATION: 'identity-auto-activation',
};

/** Fixed, plain-language description per gate (control-plane text; used by the
 *  preflight and the fail-closed message). */
const DESCRIPTION = {
  'google-setup': 'connecting a Google account is disabled',
  'gws-use': 'reading or sending Gmail, Calendar, and Drive is disabled',
  'external-content-routine': 'scheduling skill-based routines that read external content is disabled',
  'daily-summary-injection': 'injecting the daily note summary into the session digest is disabled',
  'identity-auto-activation': 'automatic dream edits to your identity files are disabled',
};

/** Deterministic gate order for the preflight + JSON. */
const ORDER = [
  'google-setup', 'gws-use', 'external-content-routine',
  'daily-summary-injection', 'identity-auto-activation',
];

/** THE FROZEN PROFILE (A0). Every gate BLOCKED. Opening a gate is a REVIEWED
 *  CODE CHANGE to this constant in a future release — never a runtime toggle,
 *  env var, or CLI flag. Object.freeze prevents same-process mutation. */
const FROZEN_PROFILE = Object.freeze({
  'google-setup': 'blocked',
  'gws-use': 'blocked',
  'external-content-routine': 'blocked',
  'daily-summary-injection': 'blocked',
  'identity-auto-activation': 'blocked',
});

/** @param {string} name @param {Record<string,string>} [profile]
 *  @returns {'blocked'|'allowed'} — throws on an unknown gate name (fail closed). */
function statusOf(name, profile = FROZEN_PROFILE) {
  const s = profile[name];
  if (s !== 'blocked' && s !== 'allowed') {
    throw new WienerdogError(`unknown or malformed capability gate: ${String(name)}`);
  }
  return s;
}

/** Non-throwing query. `profile` is a CODE-LEVEL test seam ONLY (see notes); a
 *  production caller passes nothing → the FROZEN_PROFILE.
 *  @param {string} name @param {Record<string,string>} [profile] @returns {boolean} */
function isCapabilityAllowed(name, profile = FROZEN_PROFILE) {
  return statusOf(name, profile) === 'allowed';
}

/** Throwing gate: no-op when allowed, else throws WienerdogError with a fixed
 *  fail-closed message that names the gate and the `wienerdog safety` command and
 *  states there is NO override.
 *  @param {string} name @param {Record<string,string>} [profile] */
function requireCapability(name, profile = FROZEN_PROFILE) {
  if (isCapabilityAllowed(name, profile)) return;
  throw new WienerdogError(
    `"${name}" is disabled in this release — ${DESCRIPTION[name] || 'this capability is not available'}. ` +
    'It stays off until Wienerdog’s pre-use security gates are cleared; ' +
    'run `wienerdog safety` to see the status. There is no flag or environment override.'
  );
}

/** @param {Record<string,string>} [profile]
 *  @returns {Array<{name:string, status:string, description:string}>} fixed order. */
function capabilityStatus(profile = FROZEN_PROFILE) {
  return ORDER.map((name) => ({ name, status: statusOf(name, profile), description: DESCRIPTION[name] }));
}

/** CODE SEAM for tests (and a future all-clear release): a frozen profile with
 *  every gate 'allowed'. Reachable only by a JS caller that imports and passes it;
 *  it is NEVER derived from env or argv, so it cannot open a gate in production. */
function allowAll() {
  const p = {};
  for (const name of ORDER) p[name] = 'allowed';
  return Object.freeze(p);
}

module.exports = {
  CAPABILITY, requireCapability, isCapabilityAllowed, capabilityStatus, allowAll,
};
