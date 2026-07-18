'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');

const grant = require('../../src/gws/grant');
const grantStore = require('../../src/gws/broker/grant-store');
const grantCli = require('../../src/cli/grant');
const { getPaths } = require('../../src/core/paths');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

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

/** Hand-render the LEGACY YAML block (the product can no longer write it — WP-139). */
function legacyBlock(grants) {
  const lines = ['# --- wienerdog:grants (managed by `wienerdog grant`; do not edit by hand) ---', 'grants:'];
  for (const g of grants) {
    lines.push(`  - routine: ${g.routine}`);
    lines.push('    to:');
    for (const addr of g.to) lines.push(`      - ${addr}`);
  }
  lines.push('# --- end wienerdog:grants ---');
  return `${lines.join('\n')}\n`;
}

// --- legacy parse (read-only path kept for the frozen gmail.send) ------------

test('parseGrants still reads a legacy YAML block (read-only); absent section → []', () => {
  const grants = [
    { routine: 'daily-digest', to: ['gyula@example.com'] },
    { routine: 'weekly-review', to: ['gyula@example.com', 'ada@example.com'] },
  ];
  const cfg = `${BASE_CONFIG}\n${legacyBlock(grants)}`;
  assert.deepEqual(grant.parseGrants(cfg), grants);
  assert.deepEqual(grant.parseGrants(BASE_CONFIG), []);
  assert.equal(grant.hasLegacyYamlGrants(cfg), true);
  assert.equal(grant.hasLegacyYamlGrants(BASE_CONFIG), false);
});

test('the F2 write path is GONE: grant.js no longer exports saveGrant or renderConfigWithGrants', () => {
  assert.equal(grant.saveGrant, undefined);
  assert.equal(grant.renderConfigWithGrants, undefined);
});

test('findGrant reads the legacy block; null routine → null', () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  const cfg = fs.readFileSync(paths.config, 'utf8');
  fs.writeFileSync(paths.config, `${cfg}\n${legacyBlock([{ routine: 'daily-digest', to: ['me@example.com'] }])}`);
  assert.equal(grant.findGrant(paths, null), null);
  assert.deepEqual(grant.findGrant(paths, 'daily-digest'), {
    routine: 'daily-digest',
    to: ['me@example.com'],
  });
  assert.equal(grant.findGrant(paths, 'no-such-routine'), null);
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

// --- CLI confirmation gating (store-backed since WP-139) ---------------------

test('grant CLI mints a send_self STORE grant only after the typed word "grant"; config.yaml untouched', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  const configBefore = fs.readFileSync(paths.config, 'utf8');
  await grantCli.run(['send', '--routine', 'daily-digest', '--to', 'me@example.com'], {
    paths,
    promptFn: async () => 'grant',
  });
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'send_self').allowed, true);
  assert.equal(fs.readFileSync(paths.config, 'utf8'), configBefore, 'no YAML block is ever written');
});

test('grant CLI cancels with no write when confirmation is not exactly "grant"', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  await grantCli.run(['send', '--routine', 'daily-digest', '--to', 'me@example.com'], {
    paths,
    promptFn: async () => 'yes',
  });
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'send_self').allowed, false);
  assert.equal(fs.existsSync(grantStore.storePath(paths)), false);
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
  assert.equal(grantStore.grantCheck(paths, 'r', 'send_self').allowed, false);
});

test('grant CLI: calendar-write mints a calendar_write grant behind the same confirmation', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  await grantCli.run(['calendar-write', '--routine', 'daily-digest'], {
    paths,
    promptFn: async () => 'grant',
  });
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'calendar_write').allowed, true);
  // The kinds never imply each other.
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'send_self').allowed, false);
});

test('grant CLI: calendar-write cancels without the typed word', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  await grantCli.run(['calendar-write', '--routine', 'daily-digest'], {
    paths,
    promptFn: async () => 'ok',
  });
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'calendar_write').allowed, false);
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

test('grant CLI prints the one-time model-changed notice when a legacy YAML block exists', async () => {
  const { env } = tempEnv();
  const paths = initPaths(env);
  const cfg = fs.readFileSync(paths.config, 'utf8');
  fs.writeFileSync(paths.config, `${cfg}\n${legacyBlock([{ routine: 'old', to: ['a@b.com'] }])}`);
  const lines = [];
  const orig = process.stdout.write;
  process.stdout.write = (s) => {
    lines.push(String(s));
    return true;
  };
  try {
    await grantCli.run(['send', '--routine', 'r', '--to', 'a@b.com'], {
      paths,
      promptFn: async () => 'nope',
    });
  } finally {
    process.stdout.write = orig;
  }
  assert.match(lines.join(''), /grant model changed/);
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
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'send_self').allowed, false);
  assert.equal(fs.existsSync(grantStore.storePath(paths)), false);
});

test('grant CLI rejects a bad address, a missing flag, and an unknown verb', async () => {
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
    () => grantCli.run(['calendar-write'], { paths, promptFn: async () => 'grant' }),
    /--routine/
  );
  await assert.rejects(
    () => grantCli.run(['revoke', '--routine', 'r', '--to', 'a@b.com'], { paths, promptFn: async () => 'grant' }),
    /only 'send' and 'calendar-write'/
  );
});
