'use strict';

/**
 * Error class for expected, user-facing failures. The CLI entry point prints
 * these as `wienerdog: <message>` and exits 1, without a stack trace.
 * Anything that is NOT a WienerdogError is treated as an unexpected bug and
 * surfaced with its full stack.
 */
class WienerdogError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'WienerdogError';
  }
}

module.exports = { WienerdogError };
