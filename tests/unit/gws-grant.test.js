'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PassThrough } = require('node:stream');

const grant = require('../../src/gws/grant');
const grantCli = require('../../src/cli/grant');
const manifestLib = require('../../src/core/manifest');
const { getPaths } = require('../../src/core/paths');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** @param {string} s @returns {string} */
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Isolated temp core that never touches the real ~/.wienerdog. */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-grant-'));
  const core = path.join(root, 'wd');
  return {
    root,
    core,
    env: {
      ...process.env,
      // Isolate HOME: init runs sync, which writes the PATH shim to ~/.local/bin (WP-042).
      HOME: root,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: path.join(root, 'vault'),
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
      CODEX_HOME: path.join(root, 'absent-codex'),
    },
  };
}

/** Run `init --yes` for a temp env and return its computed paths. */
function initPaths(env) {
  execFileSync('node', [bin, 'init', '--yes'], { env, stdio: 'ignore' });
  return getPaths(env);
}

/** Runs fn with process.stdin.isTTY forced to `value`, restoring it after. */
async function withStdinTTY(value, fn) {
  const original = process.stdin.isTTY;
  process.stdin.isTTY = value;
  try {
    await fn();
  } finally {
    process.stdin.isTTY = original;
  }
}

const BASE_CONFIG =
  '# Wienerdog configuration\nversion: 1\nvault: /home/x/wienerdog\nmemory_mode: standard\n';

// --- parse / render round-trip ------------------------------------------------

test('renderConfigWithGrants round-trips and preserves content outside sentinels', () => {
  const grants = [
    { routine: 'daily-digest', to: ['gyula@example.com'] },
    { routine: 'weekly-review', to: ['gyula@example.com', 'ada@example.com'] },
  ];
  const withGrants = grant.renderConfigWithGrants(BASE_CONFIG, grants);

  assert.match(withGrants, /# --- wienerdog:grants/);
  assert.deepEqual(grant.parseGrants(withGrants), grants);
  // Exactly one blank line separates prior content from the begin sentinel.
  assert.match(withGrants, /memory_mode: standard\n\n# --- wienerdog:grants/);
  // Re-rendering from the parsed grants is byte-identical.
  assert.equal(grant.renderConfigWithGrants(BASE_CONFIG, grant.parseGrants(withGrants)), withGrants);
  // Removing all grants restores the original byte-for-byte.
  assert.equal(grant.renderConfigWithGrants(withGrants, []), BASE_CONFIG);
});

test('parseGrants returns [] when the section is absent', () => {
  assert.deepEqual(grant.parseGrants(BASE_CONFIG), []);
});

// --- isSendAllowed truth table ------------------------------------------------

test('isSendAllowed allows only when every recipient is granted (case-insensitive, exact)', () => {
  const g = { routine: 'r', to: ['A@x.com', 'b@x.com'] };
  assert.equal(grant.isSendAllowed(g, ['a@x.com']).allowed, true);
  assert.equal(grant.isSendAllowed(g, ['A@X.COM', ' b@x.com ']).allowed, true);

  const partial = grant.isSendAllowed(g, ['a@x.com', 'c@x.com']);
  assert.equal(partial.allowed, false);
  assert.match(partial.reason, /c@x\.com not in allowlist/);

  const nullGrant = grant.isSendAllowed(null, ['a@x.com']);
  assert.equal(nullGrant.allowed, false);
  assert.match(nullGrant.reason, /no send grant/);

  // No wildcards / no domain grants.
  assert.equal(grant.isSendAllowed({ routine: 'r', to: ['*@x.com'] }, ['z@x.com']).allowed, false);
  assert.equal(grant.isSendAllowed({ routine: 'r', to: ['x.com'] }, ['z@x.com']).allowed, false);
});

test('isSendAllowed FAILS CLOSED on an empty or whitespace-only recipient list (WP-086)', () => {
  const g = { routine: 'r', to: ['a@x.com'] };
  const empty = grant.isSendAllowed(g, []);
  assert.equal(empty.allowed, false);
  assert.match(empty.reason, /empty list/);

  const blank = grant.isSendAllowed(g, ['   ']);
  assert.equal(blank.allowed, false);
  assert.match(blank.reason, /empty list/);

  // A valid non-empty allowlisted list is unaffected.
  assert.equal(grant.isSendAllowed(g, ['a@x.com']).allowed, true);
});

test('findGrant returns null for a null routine', () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['me@example.com'] });
  assert.equal(grant.findGrant(paths, null), null);
  assert.deepEqual(grant.findGrant(paths, 'daily-digest'), {
    routine: 'daily-digest',
    to: ['me@example.com'],
  });
  assert.equal(grant.findGrant(paths, 'no-such-routine'), null);
});

// --- saveGrant upsert + manifest-hash resync ---------------------------------

test('saveGrant upserts by routine and re-syncs the manifest hash (uninstall stays clean)', () => {
  const { env } = tempEnv();
  const paths = initPaths(env);

  grant.saveGrant(paths, { routine: 'daily-digest', to: ['gyula@example.com'] });
  let cfg = fs.readFileSync(paths.config, 'utf8');
  assert.match(cfg, /wienerdog:grants/);
  assert.deepEqual(grant.parseGrants(cfg), [
    { routine: 'daily-digest', to: ['gyula@example.com'] },
  ]);

  // Same routine replaces (dedup case-insensitively, preserve order).
  grant.saveGrant(paths, {
    routine: 'daily-digest',
    to: ['gyula@example.com', 'ADA@example.com', 'ada@example.com'],
  });
  cfg = fs.readFileSync(paths.config, 'utf8');
  assert.deepEqual(grant.parseGrants(cfg), [
    { routine: 'daily-digest', to: ['gyula@example.com', 'ADA@example.com'] },
  ]);

  // A different routine appends a second grant.
  grant.saveGrant(paths, { routine: 'weekly-review', to: ['gyula@example.com'] });
  cfg = fs.readFileSync(paths.config, 'utf8');
  assert.equal(grant.parseGrants(cfg).length, 2);

  // The manifest hash was re-synced, so uninstall removes config.yaml cleanly.
  // WP-088: config.yaml is now a deferred-deletion-set member — reverse() defers
  // it (returns it in deferredConfig) rather than deleting it inline; uninstall.js
  // deletes it LAST. A re-synced hash means it is recognized as our own unmodified
  // file (deferred), NOT kept as a customized edit.
  const manifest = manifestLib.load(paths);
  const entry = manifest.entries.find((e) => e.kind === 'file' && e.path === paths.config);
  assert.equal(entry.hash, sha256(cfg));
  const { deferredConfig } = manifestLib.reverse(paths, manifest);
  assert.equal(deferredConfig, paths.config, 'unmodified config is deferred for clean removal, not kept as a user edit');
  assert.ok(fs.existsSync(paths.config), 'reverse() defers config.yaml; uninstall.js removes it last');
});

// --- CLI confirmation gating -------------------------------------------------

test('grant CLI writes a grant only after the typed word "grant"', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  await grantCli.run(['send', '--routine', 'daily-digest', '--to', 'me@example.com'], {
    paths,
    promptFn: async () => 'grant',
  });
  assert.deepEqual(grant.findGrant(paths, 'daily-digest'), {
    routine: 'daily-digest',
    to: ['me@example.com'],
  });
});

test('grant CLI cancels with no write when confirmation is not exactly "grant"', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  await grantCli.run(['send', '--routine', 'daily-digest', '--to', 'me@example.com'], {
    paths,
    promptFn: async () => 'yes',
  });
  assert.equal(grant.findGrant(paths, 'daily-digest'), null);
  assert.doesNotMatch(fs.readFileSync(paths.config, 'utf8'), /wienerdog:grants/);
});

test('grant CLI: --yes does NOT bypass the typed confirmation', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  let asked = false;
  await grantCli.run(['send', '--routine', 'r', '--to', 'me@example.com', '--yes'], {
    paths,
    promptFn: async () => {
      asked = true;
      return 'nope';
    },
  });
  assert.equal(asked, true); // the prompt still ran
  assert.equal(grant.findGrant(paths, 'r'), null);
});

test('grant CLI warns about third-party recipients before prompting', async () => {
  const { env } = tempEnv();
  const paths = getPaths(env); // no token → all recipients treated as third-party
  const lines = [];
  const orig = process.stdout.write;
  process.stdout.write = (s) => {
    lines.push(String(s));
    return true;
  };
  try {
    await grantCli.run(['send', '--routine', 'r', '--to', 'stranger@evil.com'], {
      paths,
      promptFn: async () => 'nope',
    });
  } finally {
    process.stdout.write = orig;
  }
  assert.match(lines.join(''), /third-party addresses/);
});

// --- defaultPrompt controlling-terminal boundary (WP-086) --------------------

test('defaultPrompt: no controlling terminal reachable (openTty errors) refuses and resolves "" — never "grant"', async () => {
  await withStdinTTY(false, async () => {
    const openTty = () => {
      const s = new PassThrough();
      process.nextTick(() => s.emit('error', new Error("ENXIO: no such device or address, open '/dev/tty'")));
      return s;
    };
    const stderrOrig = process.stderr.write;
    let stderr = '';
    process.stderr.write = (chunk, ...rest) => { stderr += chunk.toString(); return stderrOrig.call(process.stderr, chunk, ...rest); };
    let answer;
    try {
      answer = await grantCli.defaultPrompt('Type the word "grant" to confirm: ', { openTty });
    } finally {
      process.stderr.write = stderrOrig;
    }
    assert.equal(answer, '');
    assert.match(stderr, /a send grant can only be created at a real terminal/);
  });
});

test('defaultPrompt: a real controlling terminal (injected via openTty) can supply "grant"', async () => {
  await withStdinTTY(false, async () => {
    const openTty = () => {
      const s = new PassThrough();
      s.end('grant\n');
      return s;
    };
    const answer = await grantCli.defaultPrompt('Type the word "grant" to confirm: ', { openTty });
    assert.equal(answer, 'grant');
  });
});

test('grant CLI: a piped/redirected/closed stdin cannot mint a grant (no controlling terminal reachable)', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  await withStdinTTY(false, async () => {
    const openTty = () => {
      const s = new PassThrough();
      process.nextTick(() => s.emit('error', new Error('ENXIO')));
      return s;
    };
    // promptFn wired to the real defaultPrompt (with the injected openTty seam),
    // simulating `printf 'grant\n' | wienerdog grant send …` from a headless shell:
    // the piped stdin is never read by the non-TTY branch, so it cannot supply
    // the confirmation word regardless of its contents.
    await grantCli.run(['send', '--routine', 'daily-digest', '--to', 'attacker@evil.com'], {
      paths,
      promptFn: (q) => grantCli.defaultPrompt(q, { openTty }),
    });
  });
  assert.equal(grant.findGrant(paths, 'daily-digest'), null);
  assert.doesNotMatch(fs.readFileSync(paths.config, 'utf8'), /wienerdog:grants/);
});

test('grant CLI rejects a bad address and a missing flag', async () => {
  const { env } = tempEnv();
  const paths = getPaths(env);
  await assert.rejects(
    () => grantCli.run(['send', '--routine', 'r', '--to', 'not-an-email'], { paths, promptFn: async () => 'grant' }),
    /valid email/
  );
  await assert.rejects(
    () => grantCli.run(['send', '--to', 'a@b.com'], { paths, promptFn: async () => 'grant' }),
    /--routine/
  );
  await assert.rejects(
    () => grantCli.run(['revoke', '--routine', 'r', '--to', 'a@b.com'], { paths, promptFn: async () => 'grant' }),
    /only 'send'/
  );
});
