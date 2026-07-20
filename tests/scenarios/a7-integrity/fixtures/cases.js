'use strict';

// THE single authoritative A7 tamper matrix (WP-158 F23/A6). Both the
// deterministic negatives (tests/unit/a7-integrity-negatives.test.js, `npm test`)
// and the gated end-to-end runner (../run-a7-integrity.js) import THIS module, so
// there is exactly one list — the runner and the unit suite can never drift.
//
// NON-VACUITY is the whole point (WP-082 canary class). Every launcher case names
// the ONE guard it isolates and asserts the DISTINCT reason only that guard emits.
// Deleting the targeted guard changes the reason (or reaches a spawn), so the
// case goes red — a case that stays green when its guard is deleted is a vacuum.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const descriptorMod = require(path.join(REPO_ROOT, 'src/scheduler/descriptor'));
const jobsLib = require(path.join(REPO_ROOT, 'src/scheduler/jobs'));
const gen = require(path.join(REPO_ROOT, 'src/scheduler/generators'));
const { poisonConfig, setConfigScalar, setJobFields } = require('./build');

// ── Distinct guard-reason fragments (verified against the live launcher) ─────
// Each corresponds to exactly ONE launcher guard; asserting it makes a case fail
// if that guard is deleted (the reason changes to a downstream guard's).
const REASON = {
  descriptorDigest: /the job descriptor changed since it was scheduled/,
  treeDigest: /the live app tree does not match the descriptor/,
  stance: /looks like a dev checkout \(\.git present\)/,
  containment: /app\/current does not resolve inside/,
  devContainment: /does not resolve to the authorized checkout root/,
  devDigest: /the job descriptor changed since it was scheduled/,
};

/**
 * Launcher tamper cases. Each drives launcher.main for the dream job with the
 * entry-bound `--expect-digest`; the consumer asserts:
 *   refuse case  → exit 1, ZERO recorded spawns, reasonRe matches the durable alert
 *   positive     → exit 0, EXACTLY ONE spawn (+ any extra check the case declares)
 * `guard` documents which guard the case isolates (F19 meta-assertion).
 * `mutate(fx)` may return `{ env }` to override the launcher env for that run.
 * @returns {Array<{id:string, title:string, guard:string, stance?:'prod'|'dev',
 *   mutate:(fx:object)=>({env?:NodeJS.ProcessEnv}|void), refuse:boolean,
 *   reasonRe?:RegExp, boundHome?:boolean, skipWin32?:boolean}>}
 */
function launcherCases() {
  return [
    // ── Digest-covered config knobs (F18 + R15): each reaches the DESCRIPTOR-
    //    DIGEST guard (NOT findJob) and drifts it. One case per digest field. ──
    {
      id: '1-run', title: 'config `run` rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => poisonConfig(fx.paths, 'run', 'skill:wienerdog-weekly-review'),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-model', title: 'config `dream_model` rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => poisonConfig(fx.paths, 'dream_model', 'opus'),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-timeout', title: 'config `dream_timeout_minutes` rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => poisonConfig(fx.paths, 'dream_timeout_minutes', '5'),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-maxinput', title: 'config `dream_max_input_bytes` rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => poisonConfig(fx.paths, 'dream_max_input_bytes', '123'),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-outertimeout', title: 'job outer `timeout_minutes` rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => poisonConfig(fx.paths, 'timeout_minutes', '99'),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-vaultroot', title: 'config `vault` (vaultRoot) rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => setConfigScalar(fx.paths, 'vault', path.join(fx.root, 'other-vault')),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-vaultlayout', title: 'config `vault_layout` rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => poisonConfig(fx.paths, 'vault_layout', '99-Evil'),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },
    {
      id: '1-at', title: 'job `at` schedule rewrite ⇒ descriptor-digest drift',
      guard: 'descriptor-digest', mutate: (fx) => setJobFields(fx.paths, { at: '09:15' }),
      refuse: true, reasonRe: REASON.descriptorDigest,
    },

    // ── Dedicated launcher guards (F19): each isolates a DISTINCT reason that
    //    runs BEFORE the descriptor-digest re-derivation. Deleting the guard
    //    changes the reason to a downstream guard's ⇒ the case fails. ──
    {
      id: '2a-tree', title: 'app byte mutation ⇒ app-tree-digest guard',
      guard: 'app-tree-digest',
      mutate: (fx) => {
        const target = fs.realpathSync(fx.corePaths.appCurrent);
        const f = path.join(target, 'package.json');
        try { fs.chmodSync(f, 0o644); } catch { /* already writable */ }
        fs.appendFileSync(f, '\n// tampered\n');
      },
      refuse: true, reasonRe: REASON.treeDigest,
    },
    {
      id: '2b-repoint', title: 'current repointed to a sibling in-app dir ⇒ app-tree-digest guard',
      guard: 'app-tree-digest',
      mutate: (fx) => {
        const sibling = path.join(fx.corePaths.appDir, 'sibling');
        fs.mkdirSync(path.join(sibling, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(sibling, 'bin', 'wienerdog.js'), '// other\n');
        fs.writeFileSync(path.join(sibling, 'package.json'), '{"version":"9.9.9"}\n');
        fs.rmSync(fx.corePaths.appCurrent, { force: true });
        fs.symlinkSync(sibling, fx.corePaths.appCurrent);
      },
      refuse: true, reasonRe: REASON.treeDigest,
    },
    {
      id: '2c-escape', title: 'current symlinked OUTSIDE <core>/app ⇒ containment guard',
      guard: 'containment', skipWin32: true,
      mutate: (fx) => {
        const outside = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wd-a7-evil-'));
        fs.mkdirSync(path.join(outside, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(outside, 'bin', 'wienerdog.js'), '// evil\n');
        fs.writeFileSync(path.join(outside, 'package.json'), '{"version":"9.9.9"}\n');
        fs.rmSync(fx.corePaths.appCurrent, { force: true });
        fs.symlinkSync(outside, fx.corePaths.appCurrent);
      },
      refuse: true, reasonRe: REASON.containment,
    },
    {
      id: '3-stance', title: 'planted `.git` prod→dev downgrade ⇒ stance guard',
      guard: 'stance',
      mutate: (fx) => {
        fs.mkdirSync(path.join(fs.realpathSync(fx.corePaths.appCurrent), '.git'));
      },
      refuse: true, reasonRe: REASON.stance,
    },

    // ── Hostile-HOME (R4:#2): a hostile ambient HOME does NOT move the child's
    //    credential/config root — the launcher re-asserts the digest-bound home.
    //    Positive path: the clean install still runs, child env HOME = bound home. ──
    {
      id: '9-hostile-home', title: 'hostile ambient HOME ⇒ bound home re-asserted, still runs',
      guard: 'bound-home', refuse: false, boundHome: true,
      mutate: (fx) => ({ env: { ...fx.env, HOME: '/tmp/hostile-home-does-not-exist' } }),
    },

    // ── Dev-stance (git-worktree) matrix (R2:F10): a tracked-source edit stays
    //    runnable (treeDigest excluded from the dev digest); a config/schedule
    //    edit still drifts + refuses (every other field retained). ──
    {
      id: '10a-dev-source-edit', title: 'dev worktree: tracked-source edit still RUNS',
      guard: 'dev-reduction', stance: 'dev', refuse: false,
      mutate: (fx) => {
        const target = fs.realpathSync(fx.corePaths.appCurrent);
        fs.appendFileSync(path.join(target, 'src', 'core', 'errors.js'), '\n// dev edit\n');
      },
    },
    {
      id: '10b-dev-at-edit', title: 'dev worktree: `at` schedule edit still REFUSES',
      guard: 'dev-descriptor-digest', stance: 'dev', refuse: true, reasonRe: REASON.devDigest,
      mutate: (fx) => setJobFields(fx.paths, { at: '09:15' }),
    },
  ];
}

/**
 * Catch-up authorization cases (WP-catchup-per-job-authorization + R4:#1/R4:#3/R5). Each drives the
 * REAL `catchUp` with recorder seams (runJob + sendAlert) and a bound base64url
 * `--job-digests` token; the consumer asserts the recorded RUN names and durable
 * ALERT names. Authorization runs over the UNION of bound ∪ configured names and
 * PRECEDES due-filtering — an addition / removal / at-rewrite / drift ALERTS with
 * zero run, never a silent suppression.
 * @returns {Array<{id:string, title:string, build:(fx:object)=>{
 *   jobDigests:string, expectRuns:string[], expectAlerts:string[]}}>}
 */
function catchupCases() {
  const derive = (paths, name) =>
    descriptorMod.deriveDescriptorDigest(paths, jobsLib.findJob(paths, name), { platform: 'darwin' });
  return [
    {
      id: 'cu-match', title: 'token PRESENT + bound map matches ⇒ authorized job RUNS (enforced path works)',
      build: (fx) => ({
        jobDigests: gen.encodeJobDigests({ dream: derive(fx.paths, 'dream') }),
        expectRuns: ['dream'], expectAlerts: [],
      }),
    },
    {
      id: 'cu-mismatch', title: 'token PRESENT + bound digest MISMATCH ⇒ refuse + alert, zero run',
      build: (fx) => ({
        jobDigests: gen.encodeJobDigests({ dream: `sha256:${'0'.repeat(64)}` }),
        expectRuns: [], expectAlerts: ['dream'],
      }),
    },
    {
      id: 'cu-added', title: 'job ADDED to config but not in map ⇒ refuse the addition (union-authorize)',
      build: (fx) => {
        const bound = gen.encodeJobDigests({ dream: derive(fx.paths, 'dream') });
        jobsLib.saveJob(fx.paths, { name: 'evil', at: '03:30', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 20 });
        return { jobDigests: bound, expectRuns: ['dream'], expectAlerts: ['evil'] };
      },
    },
    {
      id: 'cu-removed', title: 'job REMOVED from config but still in map ⇒ alert (not silent suppression)',
      build: (fx) => ({
        jobDigests: gen.encodeJobDigests({ dream: derive(fx.paths, 'dream'), ghost: `sha256:${'a'.repeat(64)}` }),
        expectRuns: ['dream'], expectAlerts: ['ghost'],
      }),
    },
    {
      id: 'cu-at-future', title: '`at` rewritten to a future time ⇒ digest drift ALERTS before due-filtering',
      build: (fx) => {
        const bound = gen.encodeJobDigests({ dream: derive(fx.paths, 'dream') }); // OLD digest
        setJobFields(fx.paths, { at: '23:59' }); // future + drifts schedule.at
        return { jobDigests: bound, expectRuns: [], expectAlerts: ['dream'] };
      },
    },
    {
      id: 'cu-malformed', title: 'malformed base64url token ⇒ durable alert + zero run (no crash)',
      build: () => ({ jobDigests: '!!!not-base64url!!!', expectRuns: [], expectAlerts: ['catchup'] }),
    },
    {
      id: 'cu-oversized', title: 'oversized token ⇒ durable alert + zero run (bounded decoder)',
      build: () => ({ jobDigests: 'A'.repeat(70 * 1024), expectRuns: [], expectAlerts: ['catchup'] }),
    },
  ];
}

module.exports = { REASON, launcherCases, catchupCases };
