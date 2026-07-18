'use strict';

// Shared broker constants (WP-136, ADR-0026). Code-owned: nothing here is
// derived from env, config, or model input.

/**
 * The four capability classes a broker verb can belong to (ADR-0026). Verbs
 * and their class assignments arrive with the registry (WP-137); the classes
 * themselves are fixed here so every later WP names the same set.
 */
const CAPABILITY_CLASS = Object.freeze({
  READ: 'READ',
  DRAFT: 'DRAFT',
  SEND: 'SEND',
  CALENDAR_WRITE: 'CALENDAR_WRITE',
});

/** MCP server name — the `mcp__<server>__<verb>` allowlist prefix (WP-141). */
const BROKER_SERVER_NAME = 'wienerdog-broker';

/**
 * MCP protocol versions this broker accepts. Measured (2026-07-18): Claude
 * Code 2.1.214 requests `2025-11-25` and accepts it echoed back. A client
 * requesting anything outside this set fails closed with the version-mismatch
 * drift error — the in-band signal that MCP changed under us (D-SDK-EXCEPTION).
 */
const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(['2025-11-25']);

module.exports = { CAPABILITY_CLASS, BROKER_SERVER_NAME, SUPPORTED_PROTOCOL_VERSIONS };
