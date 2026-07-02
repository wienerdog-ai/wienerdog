'use strict';

const { spawn } = require('node:child_process');

/**
 * The prompt that triggers the dream skill and hands it the paths. Bash is off
 * in the sandbox, so the skill cannot read env vars — the paths MUST travel in
 * the prompt text.
 * @param {string} scratchDir
 * @param {string} vaultDir
 * @param {string} date
 * @returns {string}
 */
function DREAM_PROMPT(scratchDir, vaultDir, date) {
  return [
    '/wienerdog-dream',
    '',
    `Scratch extracts directory (read-only inputs): ${scratchDir}`,
    `Vault directory (your only write target): ${vaultDir}`,
    `Today's date: ${date}`,
  ].join('\n');
}

/**
 * Build the argv for the headless brain (Claude), AFTER the "claude" name.
 * Pure — this is the unit-tested security surface. Every flag is load-bearing:
 * the invocation gives the brain no Bash, no network, and write access to the
 * vault only (plus read of the scratch dir). These CLI flags are best-effort
 * prevention; the guarantee is WP-017's code validation.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null}} o
 * @returns {string[]}
 */
function buildClaudeArgs({ vaultDir, scratchDir, date, model }) {
  return [
    '-p',
    DREAM_PROMPT(scratchDir, vaultDir, date), // headless, non-interactive
    // AUTHORITATIVE built-in tool allowlist. Excludes Bash (no shell),
    // WebFetch/WebSearch (no network), and everything else:
    '--tools',
    'Read,Write,Edit,Glob,Grep',
    '--permission-mode',
    'acceptEdits', // auto-approve edits so -p runs unattended
    '--add-dir',
    vaultDir, // tool access: the writable vault
    // --add-dir scratchDir grants read AND write to scratch; the brain must not
    // write there. WP-017's scratch-integrity check reverts any brain write to
    // scratch (exactly the out-of-vault case WP-017's fixture exercises).
    '--add-dir',
    scratchDir, // tool access: read the extracts
    '--strict-mcp-config', // with NO --mcp-config → zero MCP servers (no MCP tools/network)
    '--setting-sources',
    'user', // ignore project/local settings under cwd (a repo can't widen tools)
    // Deliberately NOT used: --dangerously-skip-permissions (re-enables
    // everything), --bare (forces API-key auth, breaking the subscription
    // ADR-0004 relies on), --safe-mode (disables skills, so the dream skill
    // wouldn't load).
    ...(model ? ['--model', model] : []), // omit → user's default model (subscription auth preserved)
  ];
}

/**
 * Spawn the brain and return a handle + completion promise. NO watchdog here —
 * WP-017 wraps this with the timeout kill. detached:true is REQUIRED so WP-017
 * can kill the whole process group. Must never run in production without that
 * watchdog.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          env?:NodeJS.ProcessEnv, logStream?:NodeJS.WritableStream}} o
 * @returns {{ child: import('child_process').ChildProcess,
 *             done: Promise<{code:number|null, durationMs:number}> }}
 */
function spawnBrain(o) {
  const { vaultDir, scratchDir, date, model, env, logStream } = o;
  const baseEnv = env || process.env;
  const childEnv = {
    ...baseEnv,
    WIENERDOG_DREAM_VAULT: vaultDir,
    WIENERDOG_DREAM_SCRATCH: scratchDir,
    // WIENERDOG_FAKE_TODAY passes through from baseEnv unchanged.
  };

  // WIENERDOG_DREAM_CMD is the test seam: run that executable instead of claude.
  const fakeCmd = baseEnv.WIENERDOG_DREAM_CMD;
  const command = fakeCmd || 'claude';
  const args = fakeCmd ? [] : buildClaudeArgs({ vaultDir, scratchDir, date, model });

  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd: vaultDir,
    detached: true, // own process group so WP-017 can group-kill the whole tree
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });

  // Tee child output to the caller's log stream (do not close it — the caller owns it).
  if (logStream) {
    if (child.stdout) child.stdout.pipe(logStream, { end: false });
    if (child.stderr) child.stderr.pipe(logStream, { end: false });
  }

  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, durationMs: Date.now() - startedAt }));
  });

  return { child, done };
}

module.exports = { buildClaudeArgs, spawnBrain, DREAM_PROMPT };
