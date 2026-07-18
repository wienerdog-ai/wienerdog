'use strict';

// Least-scope OAuth scope sets per broker capability class (WP-138,
// ADR-0026). Frozen: the ONE place scopes are declared for the split
// credentials. Notes pinned by the 2026-07-18 research:
// - SEND is `gmail.send` (D-SEND-SCOPE): send-only, cannot create drafts or
//   read — narrower than `gmail.compose`.
// - READ calendar is `calendar.events.readonly`: cannot mutate at all.
// - CALENDAR_WRITE is `calendar.events`, which Google-side still allows
//   delete — delete-prevention comes from the broker verb allowlist (WP-137),
//   not the scope (no insert-only Calendar scope exists).
// - Drive READ needs `drive.readonly` (not metadata.readonly) to download
//   content.

const { CAPABILITY_CLASS } = require('./broker/constants');
const { WienerdogError } = require('../core/errors');

const SCOPE_SETS = Object.freeze({
  [CAPABILITY_CLASS.READ]: Object.freeze([
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ]),
  [CAPABILITY_CLASS.DRAFT]: Object.freeze(['https://www.googleapis.com/auth/gmail.compose']),
  [CAPABILITY_CLASS.SEND]: Object.freeze(['https://www.googleapis.com/auth/gmail.send']),
  [CAPABILITY_CLASS.CALENDAR_WRITE]: Object.freeze(['https://www.googleapis.com/auth/calendar.events']),
});

/**
 * The exact least-scope set for a capability class, or throw on an unknown
 * class (fail closed — an unmapped class must never yield an empty set).
 * @param {string} capabilityClass
 * @returns {string[]}
 */
function requiredScopesFor(capabilityClass) {
  const set = SCOPE_SETS[capabilityClass];
  if (!set) throw new WienerdogError(`unknown capability class: ${String(capabilityClass).slice(0, 32)}`);
  return set;
}

module.exports = { SCOPE_SETS, requiredScopesFor };
