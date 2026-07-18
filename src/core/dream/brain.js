'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { defaultLayout, layoutPromptLines, resolveDailyPath } = require('../layout');
const { redactOnly } = require('../secret-scan');
const { getProfile, composeClaudeArgs } = require('../runtime-profile');
const { ensureSettingsProfile, loadVendoredSkill, settingsDigest } = require('../runtime-settings');
const { getPaths } = require('../paths');
const { resolvePinnedSpawn } = require('../exec-identity');
const { mkdirPrivate } = require('../private-fs');
const { detectPolicyHooks } = require('../policy-hooks');
const { recordRunEvidence } = require('../run-evidence');

/** Cap on the brain-stderr tail attached to spawnBrain's `done` result (bytes). */
const STDERR_TAIL_MAX = 4096;

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
    // vaultDir passed → ABSOLUTE, vault-prefixed tier paths. Load-bearing since
    // WP-130: the brain's cwd is a neutral staging dir, so a bare relative tier
    // name would resolve under <staging>/ (outside the --add-dir roots) and the
    // write would be silently lost.
    ...layoutPromptLines(lay, date, vaultDir).map((l) => `- ${l}`),
  ].join('\n');
}

/**
 * Build the argv for the headless brain (Claude), AFTER the "claude" name —
 * composed from the code-owned 'dream' hermetic runtime profile (WP-128,
 * ADR-0025), never hand-assembled. The invocation gives the brain no Bash, no
 * network, no ambient setting source, no hooks, zero MCP servers, and tool
 * access to the vault + scratch only. The vendored dream skill is
 * integrity-checked (WP-129) and delivered via --append-system-prompt
 * (D-SKILL-LOAD); a tampered/missing skill THROWS here, aborting the run
 * before any spawn (fail closed). These CLI flags are best-effort prevention;
 * the guarantee is WP-017's code validation.
 * Deliberately NOT used: --dangerously-skip-permissions (re-enables
 * everything), --bare (forces API-key auth, breaking the subscription
 * ADR-0004 relies on), --safe-mode.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout, settingsPath:string,
 *          skillSeam?:{skillsRoot?:string, digests?:Record<string,string>}}} o
 *   settingsPath  the WP-129 hook-free settings profile (absolute)
 *   skillSeam     TEST SEAM ONLY — forwarded to loadVendoredSkill to force an
 *                 integrity mismatch in unit tests; production callers omit it
 * @returns {string[]}
 */
function buildClaudeArgs({ vaultDir, scratchDir, date, model, layout, settingsPath, skillSeam }) {
  const profile = getProfile('dream');
  return composeClaudeArgs(profile, {
    prompt: DREAM_PROMPT(scratchDir, vaultDir, date, layout), // headless, non-interactive
    // The ONLY tool roots: the writable vault + the readable scratch.
    // --add-dir scratchDir grants read AND write to scratch; the brain must not
    // write there. WP-017's scratch-integrity check reverts any brain write to
    // scratch (exactly the out-of-vault case WP-017's fixture exercises).
    addDirs: [vaultDir, scratchDir],
    settingsPath,
    mcpConfigPath: null, // dream → empty MCP (--strict-mcp-config, no --mcp-config)
    model: model || null, // omit → user's default model (subscription auth preserved)
    appendSystemPrompt: loadVendoredSkill('wienerdog-dream', skillSeam), // verified body or throw
  });
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
 * Wipe+recreate the fresh, empty, Wienerdog-owned staging dir the brain runs
 * from (D-DREAM-CWD, WP-130). 0700, no `.claude`, no CLAUDE.md, no git — a
 * neutral cwd Claude Code can never mistake for a project, so it can never
 * discover project/local settings under it (the vault is a git repo the dream
 * itself writes to; a hijacked dream could otherwise plant <vault>/CLAUDE.md
 * for a later run). Recreated empty on every run — no cross-run leakage.
 * @param {import('../paths').WienerdogPaths} paths
 * @returns {string} absolute staging dir
 */
function ensureBrainStaging(paths) {
  const dir = path.join(paths.state, 'dream-run');
  fs.rmSync(dir, { recursive: true, force: true });
  mkdirPrivate(dir);
  return dir;
}

/**
 * Spawn the brain and return a handle + completion promise. NO watchdog here —
 * WP-017 wraps this with the timeout kill. detached:true is REQUIRED so WP-017
 * can kill the whole process group. Must never run in production without that
 * watchdog.
 * @param {{vaultDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout,
 *          harness?:'claude'|'codex', env?:NodeJS.ProcessEnv,
 *          platform?:NodeJS.Platform,
 *          logStream?:NodeJS.WritableStream}} o
 *   platform  the run's platform (never mock process.platform — inject it)
 * @returns {{ child: import('child_process').ChildProcess,
 *             done: Promise<{code:number|null, durationMs:number, stderrTail:string}> }}
 */
function spawnBrain(o) {
  const { vaultDir, scratchDir, date, model, harness, env, logStream, containmentProbe } = o;
  const platform = o.platform || process.platform;
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
  const paths = getPaths(baseEnv);
  let command;
  let args;
  let cwd;
  if (fakeCmd) {
    command = fakeCmd;
    args = [];
    cwd = ensureBrainStaging(paths); // fake brain runs from staging too (it writes via the env vars)
  } else if (harness === 'codex') {
    // A7 (WP-154): the verified pinned ABSOLUTE realpath, never the bare name —
    // a fake planted earlier on the job PATH must never win. A drifted pin
    // THROWS here (fail safe, before any spawn); the run-job watchdog/fail-loud
    // surfaces it and the message points at `wienerdog sync` to re-pin.
    command = resolvePinnedSpawn('codex', paths, baseEnv, platform);
    args = buildCodexArgs({ vaultDir, scratchDir, date, model, layout });
    cwd = vaultDir; // Codex path byte-unchanged (A11/P2 — its --cd vaultDir is the write fence)
  } else {
    command = resolvePinnedSpawn('claude', paths, baseEnv, platform); // A7: pinned absolute, see above
    // WP-129 assets: the hook-free settings profile (idempotent write) + the
    // integrity-checked skill body inside buildClaudeArgs. A tampered skill
    // throws here — before the spawn (fail closed).
    const settingsPath = ensureSettingsProfile(paths);
    args = buildClaudeArgs({ vaultDir, scratchDir, date, model, layout, settingsPath });
    // D-DREAM-CWD: fresh staging cwd, NOT the vault; the vault + scratch are
    // reachable only via --add-dir.
    cwd = ensureBrainStaging(paths);
  }

  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd,
    detached: true, // own process group so WP-017 can group-kill the whole tree
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });

  // Run evidence (WP-132, audit A1 point 8): record the dream's actual runtime
  // posture (version + exec path + argv + digests + managed-policy state) for
  // the claude/fake paths — best-effort, never affects the run. The prompt and
  // skill body are reduced to sha256 inside recordRunEvidence (secret-free).
  // The codex path is A11/P2 (not hermetic under A1) and records nothing here.
  if (harness !== 'codex') {
    try {
      let claudeVersion = 'unknown';
      if (!fakeCmd) {
        // ONLY the real (pinned absolute) claude is version-probed — re-invoking
        // a test fake could repeat its side effects (D-EVIDENCE: version + path, no hash).
        try {
          const r = spawnSync(command, ['--version'], { env: childEnv, timeout: 10_000, encoding: 'utf8' });
          const out = (r.stdout || '').trim().slice(0, 200);
          if (r.status === 0 && out) claudeVersion = out;
        } catch {
          /* best-effort */
        }
      }
      const settingsIdx = args.indexOf('--settings');
      recordRunEvidence(paths, {
        at: new Date().toISOString(),
        job: 'dream',
        profileId: 'dream',
        claudeVersion,
        execPath: command,
        argv: args,
        settingsDigest: settingsIdx === -1 ? 'missing' : settingsDigest(args[settingsIdx + 1]),
        mcpDigest: 'none', // dream: --strict-mcp-config with no --mcp-config
        policyHooks: detectPolicyHooks(paths, baseEnv),
        // WP-135: the pre-dream self-check result (present when dream.js ran the
        // probe; absent under the fake-brain/skip seams).
        ...(containmentProbe ? { containmentProbe } : {}),
      });
    } catch {
      /* evidence is best-effort — never affects the run */
    }
  }

  // EP3 (audit A5, ADR-0024, WP-124): the brain's stdout/stderr is fully
  // attacker-influenceable, so every chunk is redacted BEFORE it reaches the
  // durable log or the stderr tail. Per-chunk scanning is bounded (a chunk is
  // at most the OS pipe buffer; scanAndRedact self-bounds at SCAN_MAX_BYTES).
  // Known limitation (OWNER-APPROVED 2026-07-17): a secret split across a
  // chunk boundary may be only partially redacted — deliberately NOT buffered
  // across chunks, because unbounded reassembly would reopen the WP-118
  // OOM/DoS surface. The other A5 layers (EP2 whole-file scan, EP4 digest
  // scan, WP-126 0600 log modes, no log content in email) cover the residual.
  //
  // Bounded rolling buffer of the brain's stderr so a failure is diagnosable
  // without opening the separate daily log (WP-039 surfaces this into the
  // "dream brain exited N" message). The tee does not close the caller's
  // stream — the caller owns it (the old pipe's { end:false } semantics).
  let stderrTail = '';
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      const redacted = redactOnly(chunk.toString('utf8'));
      stderrTail = (stderrTail + redacted).slice(-STDERR_TAIL_MAX);
      if (logStream) logStream.write(redacted);
    });
  }
  if (logStream && child.stdout) {
    child.stdout.on('data', (chunk) => {
      logStream.write(redactOnly(chunk.toString('utf8')));
    });
  }

  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, durationMs: Date.now() - startedAt, stderrTail }));
  });

  return { child, done };
}

module.exports = { buildClaudeArgs, buildCodexArgs, spawnBrain, DREAM_PROMPT, ensureBrainStaging };
