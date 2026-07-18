'use strict';

/**
 * Code-owned hermetic runtime profile registry + pure `claude` argv composer
 * (ADR-0025, audit A1). THE one place a headless model job's capabilities are
 * defined; WP-130 (dream) and WP-131 (routines) compose their argv here and
 * never hand-assemble containment flags.
 *
 * Pure module: no fs, no child_process, no env, no network. It defines data
 * and builds argv arrays; it does not spawn or read disk.
 *
 * Terminology (ADR-0025): this boundary is a "hermetic runtime profile" /
 * "capability profile" — never a "sandbox" (reserved for sandbox-guard.js).
 */

const path = require('node:path');
const { WienerdogError } = require('./errors');

/**
 * A code-owned capability profile. FROZEN — a profile is edited only as a
 * reviewed code change, never at runtime. `id` is also the routine name /
 * dream id.
 * @typedef {Object} RuntimeProfile
 * @property {string} id                 'dream' | 'daily-digest' | 'inbox-triage' | 'weekly-review'
 * @property {'dream'|'routine'} kind
 * @property {string[]} tools            authoritative available built-in allowlist. ALWAYS NON-EMPTY
 *                                       and EXPLICIT — the 2026-07-18 live spike (Claude Code 2.1.212)
 *                                       measured that an empty `--tools` exposes ALL built-ins.
 * @property {string[]} disallowedTools  explicit deny (redundant defense-in-depth behind the allowlist)
 * @property {'empty'|'broker'} mcp      'empty' → zero MCP servers; 'broker' → exactly one A2 broker MCP
 * @property {string} permissionMode     'acceptEdits' for dream; routines per their profile
 * @property {string} skillId            the vendored skill this profile runs
 */

/**
 * Thrown on an unknown profile id or a malformed compose context. Extends
 * WienerdogError so callers' existing catch(→exit 1) handling applies.
 */
class RuntimeProfileError extends WienerdogError {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RuntimeProfileError';
  }
}

/**
 * The shared deny list — redundant defense-in-depth behind each profile's
 * explicit allowlist. Names every known escalation surface the 2026-07-18
 * spike found available (Skill, Agent/Task, Workflow) plus
 * Bash/WebFetch/WebSearch/NotebookEdit.
 */
const DENY = Object.freeze([
  'Bash',
  'WebFetch',
  'WebSearch',
  'Task',
  'Agent',
  'Skill',
  'Workflow',
  'NotebookEdit',
]);

/**
 * THE registry. The ONLY place a capability profile is defined (ADR-0025).
 * Frozen at every level so no caller can mutate a profile in-process.
 * Routines carry an EXPLICIT MINIMAL allowlist (never [] — empty `--tools`
 * means ALL built-ins, measured); the exact per-routine allowlist is
 * finalized when A2 makes routines functional, with WP-133's harness
 * asserting the live inventory.
 * @type {Readonly<Record<string, RuntimeProfile>>}
 */
const PROFILES = Object.freeze({
  dream: Object.freeze({
    id: 'dream',
    kind: 'dream',
    tools: Object.freeze(['Read', 'Write', 'Edit', 'Glob', 'Grep']),
    disallowedTools: DENY,
    mcp: 'empty',
    permissionMode: 'acceptEdits',
    skillId: 'wienerdog-dream',
  }),
  'daily-digest': Object.freeze({
    id: 'daily-digest',
    kind: 'routine',
    tools: Object.freeze(['Read']),
    disallowedTools: DENY,
    mcp: 'broker',
    permissionMode: 'default',
    skillId: 'wienerdog-daily-digest',
  }),
  'inbox-triage': Object.freeze({
    id: 'inbox-triage',
    kind: 'routine',
    tools: Object.freeze(['Read']),
    disallowedTools: DENY,
    mcp: 'broker',
    permissionMode: 'default',
    skillId: 'wienerdog-inbox-triage',
  }),
  'weekly-review': Object.freeze({
    id: 'weekly-review',
    kind: 'routine',
    tools: Object.freeze(['Read']),
    disallowedTools: DENY,
    // A2-RESTORE: mcp is 'empty' ONLY because A1 wires no broker (D-BROKER-SEAM,
    // WP-128). weekly-review's shipped skill drafts email via gws, so re-evaluate
    // (likely flip to 'broker') when A2 wires the credential broker. This is a
    // deliberate temporary downgrade, NOT a reviewed "needs no Google" decision.
    mcp: 'empty',
    permissionMode: 'default',
    skillId: 'wienerdog-weekly-review',
  }),
});

/**
 * Look up a profile by exact id against the frozen code-owned registry.
 * Fails closed: an unknown id throws — there is NO default profile, so an
 * arbitrary `skill:<string>` can never compose an argv (audit A1 point 1).
 * @param {string} id
 * @returns {RuntimeProfile}
 * @throws {RuntimeProfileError} on an unknown id
 */
function getProfile(id) {
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, id)) {
    return PROFILES[id];
  }
  throw new RuntimeProfileError(
    `unknown runtime profile "${String(id)}" — no hermetic profile is defined for it, refusing to run`
  );
}

/**
 * The routine profile ids, sorted (for the harness + catalog).
 * @returns {string[]}
 */
function listRoutineProfileIds() {
  return Object.keys(PROFILES)
    .filter((id) => PROFILES[id].kind === 'routine')
    .sort();
}

/**
 * Build the exact `claude` argv (AFTER the "claude" name) for a hermetic run.
 * PURE — every flag is derived from the profile + ctx, nothing from ambient
 * config. `--strict-mcp-config` is ALWAYS emitted (audit A1 point 5) and
 * `--tools` is ALWAYS an explicit non-empty allowlist (empty = ALL built-ins,
 * measured 2026-07-18 on Claude Code 2.1.212).
 * @param {RuntimeProfile} profile
 * @param {{ prompt:string, addDirs:string[], settingsPath:string,
 *           mcpConfigPath:string|null, model:string|null,
 *           appendSystemPrompt:string|null }} ctx
 *   settingsPath   the WP-129 hook-free settings file (absolute)
 *   mcpConfigPath  absolute broker MCP config (required iff profile.mcp==='broker'); else null
 *   appendSystemPrompt  the vendored skill body iff D-SKILL-LOAD resolves to append-system-prompt (else null)
 * @returns {string[]}
 * @throws {RuntimeProfileError} on a broker profile without an absolute
 *   mcpConfigPath, or an 'empty' profile with one (fail closed both ways)
 */
function composeClaudeArgs(profile, ctx) {
  const { prompt, addDirs, settingsPath, mcpConfigPath, model, appendSystemPrompt } = ctx;
  if (!Array.isArray(profile.tools) || profile.tools.length === 0) {
    throw new RuntimeProfileError(
      `profile "${profile.id}" has an empty tools allowlist — empty --tools exposes ALL built-ins, refusing to compose`
    );
  }
  if (profile.mcp === 'broker') {
    if (typeof mcpConfigPath !== 'string' || !path.isAbsolute(mcpConfigPath)) {
      throw new RuntimeProfileError(
        `profile "${profile.id}" requires the broker MCP config (an absolute mcpConfigPath) — refusing to run without it`
      );
    }
  } else if (mcpConfigPath != null) {
    throw new RuntimeProfileError(
      `profile "${profile.id}" is mcp:'empty' but an mcpConfigPath was supplied — refusing to widen the MCP surface`
    );
  }
  return [
    '-p', prompt,
    '--tools', profile.tools.join(','),
    '--disallowedTools', profile.disallowedTools.join(','),
    '--permission-mode', profile.permissionMode,
    ...addDirs.flatMap((d) => ['--add-dir', d]),
    '--strict-mcp-config',
    ...(mcpConfigPath ? ['--mcp-config', mcpConfigPath] : []),
    // Empty value — loads NOTHING ambient (measured-accepted and
    // source-excluding on 2.1.212; D-SETTING-SOURCES, OWNER-APPROVED 2026-07-18).
    '--setting-sources', '',
    '--settings', settingsPath,
    ...(appendSystemPrompt ? ['--append-system-prompt', appendSystemPrompt] : []),
    ...(model ? ['--model', model] : []),
  ];
}

module.exports = { PROFILES, getProfile, listRoutineProfileIds, composeClaudeArgs, RuntimeProfileError };
