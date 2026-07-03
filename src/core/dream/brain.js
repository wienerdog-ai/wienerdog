'use strict';

const { spawn } = require('node:child_process');

const { defaultLayout, layoutPromptLines, resolveDailyPath } = require('../layout');

/**
 * The prompt that triggers the dream skill and hands it the paths. Bash is off
 * in the sandbox, so the skill cannot read env vars — the paths (and the layout)
 * MUST travel in the prompt text. The layout tells the brain the MAPPED write
 * locations; it defaults to defaultLayout() (== today's folder names) when the
 * caller omits it, so existing callers/tests keep producing a valid prompt.
 * @param {string} scratchDir
 * @param {string} vaultDir
 * @param {string} date
 * @param {import('../layout').VaultLayout} [layout]
 * @returns {string}
 */
function DREAM_PROMPT(scratchDir, vaultDir, date, layout) {
  const lay = layout || defaultLayout();
  return [
    '/wienerdog-dream',
    '',
    `Scratch extracts directory (read-only inputs): ${scratchDir}`,
    `Vault directory (your only write target): ${vaultDir}`,
    `Today's date: ${date}`,
    '',
    'Vault layout — write to these mapped locations, NOT the default folder names:',
    ...layoutPromptLines(lay, date).map((l) => `- ${l}`),
  ].join('\n');
}

/**
 * Build the argv for the headless brain (Claude), AFTER the "claude" name.
 * Pure — this is the unit-tested security surface. Every flag is load-bearing:
 * the invocation gives the brain no Bash, no network, and write access to the
 * vault only (plus read of the scratch dir). These CLI flags are best-effort
 * prevention; the guarantee is WP-017's code validation.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout}} o
 * @returns {string[]}
 */
function buildClaudeArgs({ vaultDir, scratchDir, date, model, layout }) {
  return [
    '-p',
    DREAM_PROMPT(scratchDir, vaultDir, date, layout), // headless, non-interactive
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
 * Build the argv for the headless Codex brain, AFTER the "codex" name.
 * UNVERIFIED-until-live-M4-test: two open upstream bugs shape this (see comments);
 * wd-researcher must re-verify against the shipping `codex --version` before M4.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout}} o
 * @returns {string[]}
 */
function buildCodexArgs({ vaultDir, scratchDir, date, model, layout }) {
  return [
    'exec',
    '--sandbox',
    'workspace-write',
    '--cd',
    vaultDir, // THE write fence: --add-dir does NOT fence apply_patch (openai/codex#24214)
    '--add-dir',
    scratchDir, // best-effort read access to the extracts (see note)
    '-c',
    'approval_policy=never', // NOT `--ask-for-approval never` after exec (#26602)
    '-c',
    'sandbox_workspace_write.network_access=false', // no network
    '--skip-git-repo-check', // the vault/scratch may not be a git repo
    ...(model ? ['--model', model] : []),
    DREAM_PROMPT(scratchDir, vaultDir, date, layout), // positional prompt (last)
  ];
}

/**
 * Spawn the brain and return a handle + completion promise. NO watchdog here —
 * WP-017 wraps this with the timeout kill. detached:true is REQUIRED so WP-017
 * can kill the whole process group. Must never run in production without that
 * watchdog.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout,
 *          harness?:'claude'|'codex', env?:NodeJS.ProcessEnv,
 *          logStream?:NodeJS.WritableStream}} o
 * @returns {{ child: import('child_process').ChildProcess,
 *             done: Promise<{code:number|null, durationMs:number}> }}
 */
function spawnBrain(o) {
  const { vaultDir, scratchDir, date, model, harness, env, logStream } = o;
  const layout = o.layout || defaultLayout();
  const baseEnv = env || process.env;
  const childEnv = {
    ...baseEnv,
    WIENERDOG_DREAM_VAULT: vaultDir,
    WIENERDOG_DREAM_SCRATCH: scratchDir,
    // The real brain ignores this (no Bash to read env); only the WP-026 mapped
    // fake brain reads it. The default fake brain ignores it too and writes the
    // default paths, which under the default layout are the mapped paths.
    WIENERDOG_DREAM_LAYOUT: JSON.stringify({ ...layout, daily_today: resolveDailyPath(layout, date) }),
    // WIENERDOG_FAKE_TODAY passes through from baseEnv unchanged.
  };

  // WIENERDOG_DREAM_CMD is the test seam: run that executable instead of claude/codex.
  const fakeCmd = baseEnv.WIENERDOG_DREAM_CMD;
  let command;
  let args;
  if (fakeCmd) {
    command = fakeCmd;
    args = [];
  } else if (harness === 'codex') {
    command = 'codex';
    args = buildCodexArgs({ vaultDir, scratchDir, date, model, layout });
  } else {
    command = 'claude';
    args = buildClaudeArgs({ vaultDir, scratchDir, date, model, layout });
  }

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

module.exports = { buildClaudeArgs, buildCodexArgs, spawnBrain, DREAM_PROMPT };
