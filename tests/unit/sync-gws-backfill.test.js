'use strict';

// WP-105: `sync` ends with a consented, interactive-only backfill of the
// on-demand googleapis install (BUG-gws-deps-missing) — the deps dir a
// headless-only user's routines consume but can never populate themselves.
// Fully hermetic: temp HOME + WIENERDOG_HOME, WIENERDOG_LOADER_NOOP=1 so the
// default loaders never spawn launchctl/systemctl, harnesses pointed at absent
// dirs, no vault (skips digest), no network. The backfill itself is injected
// via the opts.ensureGoogleReady seam — no prompt, no npm.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const manifestLib = require('../../src/core/manifest');
const sync = require('../../src/cli/sync');

// Hermeticity: CI sets XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so systemd units resolve under the temp HOME, never a
// real dir — and so parallel test files never collide on a shared unit path.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

// Vault UNSET → sync skips the digest + managed block but still vendors and
// reaches the final backfill. Harness dirs are set to absent paths in the env.
const BASE_CONFIG = `# Wienerdog configuration
version: 1
vault:
harnesses:
  claude: true
  codex: false
memory_mode: standard
`;

/** Isolated temp core with config + matching manifest + absent harness dirs. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gws-backfill-'));
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(paths.config, BASE_CONFIG);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [
      { kind: 'dir', path: paths.core },
      { kind: 'file', path: paths.config, hash: sha256(BASE_CONFIG) },
    ],
  };
  manifestLib.save(paths, manifest);
  return { root, env, paths };
}

/**
 * Run sync.run with process.env pointed at the temp core and the loader no-op
 * set, forwarding `opts` (the interactive + ensureGoogleReady seams) through.
 * @param {Record<string,string>} env
 * @param {string[]} argv
 * @param {object} opts
 */
async function runSync(env, argv = [], opts = {}) {
  const savedKeys = ['HOME', 'WIENERDOG_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'WIENERDOG_LOADER_NOOP'];
  const saved = Object.fromEntries(savedKeys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, env, { WIENERDOG_LOADER_NOOP: '1' });
  // Silence sync's chatty stdout.
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  console.log = () => {};
  process.stdout.write = () => true;
  try {
    await sync.run(argv, opts);
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
    for (const k of savedKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('sync-gws-backfill: non-TTY sync never calls the backfill', async () => {
  const { env } = setup();
  let called = false;
  await runSync(env, [], {
    interactive: false,
    ensureGoogleReady: async () => {
      called = true;
    },
  });
  assert.equal(called, false, 'non-TTY sync must not prompt or install');
});

test('sync-gws-backfill: interactive sync calls the backfill once with paths', async () => {
  const { env, paths } = setup();
  let calls = 0;
  let seen;
  await runSync(env, [], {
    interactive: true,
    ensureGoogleReady: async (p) => {
      calls += 1;
      seen = p;
    },
  });
  assert.equal(calls, 1, 'backfill called exactly once');
  assert.equal(seen.core, paths.core, 'backfill receives the resolved paths');
});

test('sync-gws-backfill: a throwing backfill never fails sync, and the manifest was already persisted', async () => {
  const { env, paths } = setup();
  await assert.doesNotReject(() =>
    runSync(env, [], {
      interactive: true,
      ensureGoogleReady: async () => {
        throw new WienerdogError('declined — run this yourself');
      },
    })
  );
  // Crash-safety (Codex round-2 Finding 1): manifestMod.save ran BEFORE the
  // backfill, so every manifest-tracked mutation is persisted even when the
  // backfill throws (or is interrupted). The vendor step records a
  // vendored-tree entry — its presence proves the save happened.
  assert.ok(fs.existsSync(paths.manifest), 'manifest file persisted');
  const m = manifestLib.load(paths);
  assert.ok(
    m.entries.some((e) => e.kind === 'vendored-tree'),
    'manifest holds the vendored-tree entry recorded by this sync'
  );
});

test('sync-gws-backfill: --dry-run never calls the backfill, even interactive', async () => {
  const { env } = setup();
  let called = false;
  await runSync(env, ['--dry-run'], {
    interactive: true,
    ensureGoogleReady: async () => {
      called = true;
    },
  });
  assert.equal(called, false, 'dry-run must stay mutation-free');
});
