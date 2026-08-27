'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { defaultLayout, layoutPromptLines, resolveDailyPath } = require('../layout');
const { redactOnly } = require('../secret-scan');
const { getProfile, composeClaudeArgs } = require('../runtime-profile');
const { ensureSettingsProfile, loadVendoredSkill, settingsDigest } = require('../runtime-settings');
const { getPaths } = require('../paths');
const { spawnPinned, spawnPinnedSync, loadPins } = require('../exec-identity');
const { mkdirPrivate } = require('../private-fs');
const { detectPolicyHooks } = require('../policy-hooks');
const { recordRunEvidence } = require('../run-evidence');

/** Cap on the brain-stderr tail attached to spawnBrain's `done` result (bytes). */
const STDERR_TAIL_MAX = 4096;

/** Cap on the brain-stdout HEAD retained to detect the non-vacuity marker. */
const STDOUT_HEAD_MAX = 4096;

/** ANSI CSI escape sequences — stripped before the bare-diagnostic test. */
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * True when `text` — after ANSI-stripping and trimming — is EXACTLY one CLI
 * `Unknown command: /<name>` diagnostic line and nothing else. The whole-output
 * requirement is load-bearing: a real dream emits substantial output, so a
 * marker-shaped line amid real content (e.g. attacker-influenced transcript
 * text echoed by the brain) can never match — only the genuine CLI rejection,
 * whose single diagnostic line IS the run's entire output, does.
 * @param {string} text
 * @returns {boolean}
 */
function isBareUnknownCommand(text) {
  return /^Unknown command: \/\S+$/.test(text.replace(ANSI_RE, '').trim());
}

/**
 * The prompt that triggers the dream skill and hands it the paths. Bash is off
 * in the sandbox, so the skill cannot read env vars — the paths (and the layout)
 * MUST travel in the prompt text. The layout tells the brain the MAPPED write
 * locations; it defaults to defaultLayout() (== today's folder names) when the
 * caller omits it, so existing callers/tests keep producing a valid prompt.
 *
 * SITES 1 AND 2 OF THE RE-TARGET (Table B). The write root handed in here is the
 * run's WORKSPACE, never the vault. The LABEL deliberately still says "Vault
 * directory": the vendored dream skill refers to its write target by that name
 * ("Write only inside the vault directory named in your prompt",
 * `skills/wienerdog-dream/SKILL.md:429`) and that file is out of scope here, so
 * re-wording the label would leave the skill pointing at nothing. What changes
 * is the VALUE — which is the whole of what the brain can act on.
 * @param {string} scratchDir
 * @param {string} workspaceDir  the run's write root (Table B sites 1-2)
 * @param {string} date
 * @param {import('../layout').VaultLayout} [layout]
 * @returns {string}
 */
function DREAM_PROMPT(scratchDir, workspaceDir, date, layout) {
  const lay = layout || defaultLayout();
  return [
    'Run the wienerdog-dream memory-consolidation routine now. Follow the instructions in your system prompt and use only your available tools.',
    '',
    `Scratch extracts directory (read-only inputs): ${scratchDir}`,
    `Vault directory (your only write target): ${workspaceDir}`,
    `Today's date: ${date}`,
    '',
    'Vault layout — write to these mapped locations, NOT the default folder names:',
    // The write root is passed → ABSOLUTE, workspace-prefixed tier paths.
    // Load-bearing since WP-130: the brain's cwd is a neutral staging dir, so a
    // bare relative tier name would resolve under <staging>/ (outside the
    // --add-dir roots) and the write would be silently lost. It is load-bearing
    // AGAIN here: an absolute path bypasses the write root entirely, so a stale
    // vault prefix on these lines would be a write outside the fence no matter
    // what `addDirs` says.
    ...layoutPromptLines(lay, date, workspaceDir).map((l) => `- ${l}`),
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
 * @param {{workspaceDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout, settingsPath:string,
 *          skillSeam?:{skillsRoot?:string, digests?:Record<string,string>}}} o
 *   workspaceDir  the run's write root (Table B site 3) — the WORKSPACE, never
 *                 the vault
 *   settingsPath  the WP-129 hook-free settings profile (absolute)
 *   skillSeam     TEST SEAM ONLY — forwarded to loadVendoredSkill to force an
 *                 integrity mismatch in unit tests; production callers omit it
 * @returns {string[]}
 */
function buildClaudeArgs({ workspaceDir, scratchDir, date, model, layout, settingsPath, skillSeam }) {
  const profile = getProfile('dream');
  return composeClaudeArgs(profile, {
    prompt: DREAM_PROMPT(scratchDir, workspaceDir, date, layout), // headless, non-interactive
    // SITE 3. The ONLY tool roots: the writable workspace + the readable
    // scratch. `--add-dir` grants read AND write on both harnesses and neither
    // offers a directory-level read-only option, so under this design the brain
    // simply LOSES vault access rather than depending on a permission layer.
    // --add-dir scratchDir grants read AND write to scratch; the brain must not
    // write there. WP-017's scratch-integrity check reverts any brain write to
    // scratch (exactly the out-of-vault case WP-017's fixture exercises).
    addDirs: [workspaceDir, scratchDir],
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
 * @param {{workspaceDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout}} o
 * @returns {string[]}
 */
function buildCodexArgs({ workspaceDir, scratchDir, date, model, layout }) {
  return [
    'exec',
    '--sandbox',
    'workspace-write',
    '--cd',
    // SITE 4 — THE Codex write fence: `--add-dir` does NOT fence apply_patch
    // (openai/codex#24214), so this operand, not addDirs, is what decides where
    // the Codex brain can write. Leaving it at the vault would leave the Codex
    // arm writing the vault however the Claude arm is fenced.
    workspaceDir,
    '--add-dir',
    scratchDir, // best-effort read access to the extracts (see note)
    '-c',
    'approval_policy=never', // NOT `--ask-for-approval never` after exec (#26602)
    '-c',
    'sandbox_workspace_write.network_access=false', // no network
    '--skip-git-repo-check', // the vault/scratch may not be a git repo
    ...(model ? ['--model', model] : []),
    DREAM_PROMPT(scratchDir, workspaceDir, date, layout), // positional prompt (last)
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
 * SITE 7 OF THE RE-TARGET (Table B) — the NAMES the brain's environment may
 * carry. Everything else is dropped, because the child env is CONSTRUCTED, not
 * inherited-then-overwritten.
 *
 * WHY CONSTRUCTION AND NOT ASSIGNMENT. Measured: with an ambient
 * `WIENERDOG_VAULT` set, the vault path reaches the child regardless of what the
 * six named argv/cwd sites do — `spawnBrain` used to spread the ambient env and
 * the production caller hands it `process.env` (`cli/dream.js:144-146`) — and
 * the Codex arm's shell CAN read its own environment. Re-pointing one assigned
 * value cannot establish "no env value carries the vault path"; only building
 * the env from a fixed list can.
 *
 * THE LIST IS run-job's OWN CLEAN ENV, MINUS THE VAULT. In production the dream
 * already runs under `buildCleanEnv` (`src/cli/run-job.js:150-263`), which
 * constructs the job env from scratch and passes through exactly
 * `WIENERDOG_HOME` and `WIENERDOG_VAULT`. This list is that env's key set minus
 * `WIENERDOG_VAULT` — that subtraction is the whole of site 7 — plus the win32
 * essentials a Task-Scheduler child needs. A harness that will not start under
 * it is a FINDING, not a licence to widen it back to ambient.
 */
const BRAIN_ENV_ALLOWLIST = [
  // Both harnesses resolve config, credentials and cache from the home dir.
  'HOME',
  'USERPROFILE', // win32's home; run-job binds it to the same value as HOME
  // claude's macOS Keychain lookup fails ("Not logged in") without USER — the
  // reason run-job resolves and sets it explicitly (`run-job.js:129-139`).
  'USER',
  'LOGNAME',
  // The harnesses' own config roots (run-job derives these from the bound home).
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  // WP-141: run-job is the single timeout authority for a job.
  'CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS',
  // Temp space. The Codex sandbox grants $TMPDIR explicitly, so a child without
  // it writes scratch files nowhere it is allowed to.
  'TMPDIR',
  'TMP',
  'TEMP',
  // win32 essentials: a Task-Scheduler child inherits almost nothing, and
  // PATHEXT is additionally read by the pinned-executable resolver
  // (`exec-identity.js:100`) — without it the pin cannot be verified there.
  'PATHEXT',
  'SystemRoot',
  'windir',
  'ComSpec',
  'SystemDrive',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'PUBLIC',
  'USERNAME',
  'USERDOMAIN',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
  // The wienerdog-owned core override — run-job's ENV_PASSTHROUGH, MINUS
  // WIENERDOG_VAULT.
  'WIENERDOG_HOME',
  // NOTHING TEST-ONLY IS ON THIS LIST, and that is deliberate: WP-155/audit A7
  // deleted the test-exec/date env seams from production, and
  // `tests/unit/a7-integrity-negatives.test.js:375` greps `src/` to keep them
  // deleted. A fixture channel that needs to reach the brain must therefore be
  // re-plumbed test-side, onto the WIENERDOG_DREAM_* vars this function already
  // constructs — it may not be smuggled back in here.
];

/**
 * True when `candidate` names the vault root itself or something beneath it.
 *
 * Compared NFC-normalised and case-folded, the same order as
 * `src/scheduler/tccguard.js:48`: the primary filesystem is case-insensitive, so
 * a case- or composition-variant of the vault path is the same directory. On a
 * case-sensitive filesystem this can only over-match — dropping a PATH entry
 * that differs from the vault by case alone — which is the fail-safe direction.
 * @param {string} candidate @param {string} root @returns {boolean}
 */
function isAtOrBeneath(candidate, root) {
  const norm = (p) => path.resolve(p).normalize('NFC').toLowerCase();
  let c;
  let r;
  try {
    c = norm(candidate);
    r = norm(root);
  } catch {
    return false; // unresolvable component — keep it; PATH resolution ignores it
  }
  return c === r || c.startsWith(r + path.sep);
}

/**
 * Build the child's `PATH`: the job's own PATH with every component AT OR
 * BENEATH the vault removed.
 *
 * PATH IS SANITISED, NOT OMITTED, and both halves of that are measured.
 * `spawnPinned` re-resolves the logical harness name through the env it is
 * handed (`exec-identity.js:451-472`, `:621-627`), so DROPPING `PATH` breaks pin
 * verification before the child ever starts; copying it VERBATIM can carry a
 * vault-rooted component and violate the claim. In production the incoming PATH
 * is already run-job's from-scratch system-defaults PATH, so what is left after
 * this filter is exactly "the system defaults with the vault removed".
 * @param {string|undefined} rawPath @param {string} vaultDir
 * @param {NodeJS.Platform} platform @returns {string}
 */
function sanitizeBrainPath(rawPath, vaultDir, platform) {
  const delim = platform === 'win32' ? ';' : ':';
  return String(rawPath || '')
    .split(delim)
    .filter((c) => c !== '' && !isAtOrBeneath(c, vaultDir))
    .join(delim);
}

/**
 * Compose the brain's child environment from the allowlist (site 7).
 *
 * Exported so the claim can be asserted over the COMPOSED VALUES rather than
 * over the source: a grep would pass a rename, and the property being claimed is
 * about what the child actually receives.
 * @param {{baseEnv:NodeJS.ProcessEnv, vaultDir:string, workspaceDir:string,
 *          scratchDir:string, date:string,
 *          layout:import('../layout').VaultLayout,
 *          platform?:NodeJS.Platform}} o
 *   vaultDir  the vault this run must NOT hand the brain — used only to strip it
 * @returns {NodeJS.ProcessEnv}
 */
function buildBrainEnv({ baseEnv, vaultDir, workspaceDir, scratchDir, date, layout, platform }) {
  /** @type {NodeJS.ProcessEnv} */
  const env = {};
  for (const k of BRAIN_ENV_ALLOWLIST) {
    const v = baseEnv[k];
    if (typeof v === 'string' && v !== '') env[k] = v;
  }
  env.PATH = sanitizeBrainPath(baseEnv.PATH, vaultDir, platform || process.platform);
  // SITE 5. The env var NAME stays: renaming it would churn the WP-026 mapped
  // fake-brain fixtures for no guarantee. The VALUE is the workspace. On the
  // Claude arm the real brain has no Bash and cannot read env at all; on the
  // Codex arm it CAN run shell and so CAN read it — which is exactly why the var
  // is re-pointed for consistency of the fence, and why no arm may treat it as a
  // control.
  env.WIENERDOG_DREAM_VAULT = workspaceDir;
  env.WIENERDOG_DREAM_SCRATCH = scratchDir;
  // The real brain ignores this (no Bash to read env); only the WP-026 mapped
  // fake brain reads it. The default fake brain ignores it too and writes the
  // default paths, which under the default layout are the mapped paths.
  env.WIENERDOG_DREAM_LAYOUT = JSON.stringify({ ...layout, daily_today: resolveDailyPath(layout, date) });
  return env;
}

/**
 * Spawn the brain and return a handle + completion promise. NO watchdog here —
 * WP-017 wraps this with the timeout kill. detached:true is REQUIRED so WP-017
 * can kill the whole process group. Must never run in production without that
 * watchdog.
 * THE WRITE TARGET IS A WORKSPACE, NOT THE VAULT (Table B). The option is
 * `workspaceDir`, and the vault path reaches the child through NONE of the seven
 * sites it used to: the prompt text, the absolute tier lines, the Claude tool
 * roots, the Codex `--cd` fence, the Codex cwd, `WIENERDOG_DREAM_VAULT`, and the
 * inherited environment. The vault is still known here — `paths.vault` — for
 * exactly one purpose: stripping it out of the child's PATH.
 * @param {{workspaceDir:string, scratchDir:string, date:string, model:string|null,
 *          layout?:import('../layout').VaultLayout,
 *          harness?:'claude'|'codex', env?:NodeJS.ProcessEnv,
 *          platform?:NodeJS.Platform,
 *          logStream?:NodeJS.WritableStream}} o
 *   workspaceDir  the run's write root, built by `dream/workspace.js`
 *   platform  the run's platform (never mock process.platform — inject it)
 * @returns {{ child: import('child_process').ChildProcess,
 *             done: Promise<{code:number|null, durationMs:number, stderrTail:string,
 *                            sawUnknownCommand:boolean}> }}
 */
function spawnBrain(o) {
  const { workspaceDir, scratchDir, date, model, harness, env, logStream, containmentProbe } = o;
  const platform = o.platform || process.platform;
  const layout = o.layout || defaultLayout();
  const baseEnv = env || process.env;

  // The brain command is resolved ONLY via WP-154's pinned front door — no env
  // seam (audit A7/F5, WP-155 deleted the fake-command env branch); tests
  // substitute a brain by pinning their fake in a temp WIENERDOG_HOME.
  const paths = getPaths(baseEnv);
  // SITE 7: CONSTRUCTED, never inherited. Resolved before the argv so the same
  // vault value strips PATH and is absent from everything else.
  const childEnv = buildBrainEnv({
    baseEnv,
    vaultDir: paths.vault,
    workspaceDir,
    scratchDir,
    date,
    layout,
    platform,
  });
  const harnessName = harness === 'codex' ? 'codex' : 'claude';
  let args;
  let cwd;
  if (harness === 'codex') {
    args = buildCodexArgs({ workspaceDir, scratchDir, date, model, layout });
    // SITE 6. Instruction discovery happens at cwd, and on the Codex arm the
    // write root IS the cwd — this is M7's step 3.
    cwd = workspaceDir;
  } else {
    // WP-129 assets: the hook-free settings profile (idempotent write) + the
    // integrity-checked skill body inside buildClaudeArgs. A tampered skill
    // throws here — before the spawn (fail closed).
    const settingsPath = ensureSettingsProfile(paths);
    args = buildClaudeArgs({ workspaceDir, scratchDir, date, model, layout, settingsPath });
    // D-DREAM-CWD: fresh staging cwd, NOT the write root; the workspace + scratch
    // are reachable only via --add-dir.
    cwd = ensureBrainStaging(paths);
  }

  const startedAt = Date.now();
  // A7 (WP-154, R13/R15): spawn via the encapsulated pinned exec API — the
  // verified pinned ABSOLUTE realpath (a node-shebang claude/codex runs as
  // `process.execPath <script>`), never a bare name and never a raw path handed
  // to the caller. A fake planted earlier on the job PATH must never win. A
  // drifted/tampered/unsupported pin THROWS here (fail safe, before any spawn);
  // the run-job watchdog/fail-loud surfaces it and points at `wienerdog sync`.
  const child = spawnPinned(harnessName, paths, {
    args,
    cwd,
    detached: true, // own process group so WP-017 can group-kill the whole tree
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
    platform,
  });

  // Run evidence (WP-132, audit A1 point 8): record the dream's actual runtime
  // posture (version + exec path + argv + digests + managed-policy state) for
  // the claude path — best-effort, never affects the run. The prompt and
  // skill body are reduced to sha256 inside recordRunEvidence (secret-free).
  // The codex path is A11/P2 (not hermetic under A1) and records nothing here.
  if (harness !== 'codex') {
    try {
      let claudeVersion = 'unknown';
      // The pinned claude is version-probed via the encapsulated exec API (a
      // node-shebang runs `process.execPath <script> --version`) for the
      // evidence record (D-EVIDENCE: version + path, no hash).
      try {
        const r = spawnPinnedSync('claude', paths, {
          args: ['--version'],
          env: childEnv,
          platform,
          timeout: 10_000,
          encoding: 'utf8',
        });
        const out = (r.stdout || '').trim().slice(0, 200);
        if (r.status === 0 && out) claudeVersion = out;
      } catch {
        /* best-effort */
      }
      // Pin state as DATA (R15: never spawned) — the pinned command path is
      // recorded for the evidence trail; falls back to the logical name.
      let execPath = 'claude';
      try {
        const pin = loadPins(paths).claude;
        if (pin && pin.commandPath) execPath = pin.commandPath;
      } catch {
        /* best-effort */
      }
      const settingsIdx = args.indexOf('--settings');
      recordRunEvidence(paths, {
        at: new Date().toISOString(),
        job: 'dream',
        profileId: 'dream',
        claudeVersion,
        execPath,
        argv: args,
        settingsDigest: settingsIdx === -1 ? 'missing' : settingsDigest(args[settingsIdx + 1]),
        mcpDigest: 'none', // dream: --strict-mcp-config with no --mcp-config
        policyHooks: detectPolicyHooks(paths, baseEnv),
        // WP-135: the pre-dream self-check result (present when dream.js ran the
        // probe; absent when a test skipped it via dream.run's opts seam).
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
  // Bounded rolling HEAD of the brain's stdout + a cheap total-length counter
  // (WP-dream-plaintext-trigger, 2026-07-24 incident): a hermetic `claude -p`
  // that rejects the trigger as an unknown slash command emits ONLY the
  // "Unknown command: ..." diagnostic (usually stdout, possibly ANSI-colored
  // or on stderr) and still exits 0, so the non-vacuity signal cannot come
  // from the exit code. Attached unconditionally (not only when logStream is
  // set). The whole-output discriminator below fires only when that diagnostic
  // is the run's ENTIRE output; the stderr branch fires when the entire stdout
  // was captured AND (ANSI-stripped) trims to empty — so whitespace-only
  // stdout plus a stderr diagnostic still signals (maintainer amendment,
  // Codex round 2). NOTE: this boolean is TEXT evidence only — the ABORT
  // decision in dream.js is compound: it additionally requires the vault to be
  // untouched since run start, because a genuine CLI rejection performs no
  // work (see runBrainWithWatchdog). ACCEPTED RESIDUAL (maintainer decision,
  // 2026-07-24 Codex review): a hypothetical >STDOUT_HEAD_MAX startup banner
  // preceding the rejection is NOT detected — the PRIMARY defense is the
  // plain-text trigger itself; this guard is defense-in-depth for a
  // reintroduced-slash regression, and the residual failure mode is the
  // pre-fix status quo (a vacuous run), not a new risk.
  let stdoutHead = '';
  let stdoutTotalLen = 0;
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      const redacted = redactOnly(chunk.toString('utf8'));
      stdoutTotalLen += redacted.length;
      stdoutHead = (stdoutHead + redacted).slice(0, STDOUT_HEAD_MAX);
      if (logStream) logStream.write(redacted);
    });
  }

  // The facade re-emits only constructed events: `error` (a sanitized Error) and
  // `exit` ({code, signal}) — fired off the child's `close` so the stderr tail
  // is complete. No raw child/native emitter/event reaches this promise (R16).
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', ({ code }) =>
      resolve({
        code,
        durationMs: Date.now() - startedAt,
        stderrTail,
        sawUnknownCommand:
          stdoutTotalLen <= STDOUT_HEAD_MAX &&
          (isBareUnknownCommand(stdoutHead) ||
            (stdoutHead.replace(ANSI_RE, '').trim() === '' && isBareUnknownCommand(stderrTail))),
      })
    );
  });

  return { child, done };
}

module.exports = {
  buildClaudeArgs,
  buildCodexArgs,
  buildBrainEnv,
  spawnBrain,
  DREAM_PROMPT,
  ensureBrainStaging,
  BRAIN_ENV_ALLOWLIST,
};
