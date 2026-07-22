'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const memory = require('../../src/cli/memory');
const { readRegistry, fileHash, seedApprovals } = require('../../src/core/identity-approvals');
const { defaultLayout } = require('../../src/core/layout');
const { WienerdogError } = require('../../src/core/errors');

// A fully-blocked profile (the pre-0.10.0 frozen shape). seedApprovals only seeds
// when identity-auto-activation is BLOCKED; the released profile now defaults to
// all-allowed, so pre-seed the "already approved" fixtures via the blocked seam.
const BLOCKED = Object.freeze(Object.fromEntries(
  ['google-setup', 'gws-use', 'external-content-routine', 'daily-summary-injection', 'identity-auto-activation']
    .map((g) => [g, 'blocked'])
));

/** Temp core (config.yaml + state) + vault with the four identity files. */
function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-memcli-'));
  const core = path.join(tmp, 'core');
  const vault = path.join(tmp, 'vault');
  fs.mkdirSync(core, { recursive: true });
  fs.mkdirSync(path.join(vault, '06-Identity'), { recursive: true });
  fs.writeFileSync(path.join(core, 'config.yaml'), `vault: ${vault}\n`);
  for (const f of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    fs.writeFileSync(
      path.join(vault, '06-Identity', f),
      `---\nderived_from_untrusted: false\nconfidence: 0.9\n---\n\n# ${f}\ncontent of ${f}\n`
    );
  }
  /** Minimal paths object (the seams memory.js reads). */
  const paths = { core, config: path.join(core, 'config.yaml'), state: path.join(core, 'state') };
  return { core, vault, paths };
}

/** Capture stdout writes during fn. */
async function withStdout(fn) {
  const chunks = [];
  const orig = process.stdout.write;
  process.stdout.write = (c) => {
    chunks.push(String(c));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join('');
}

test('memory approve records the exact-byte hash on "approve" and shows the bytes as evidence', async () => {
  const { vault, paths } = setup();
  fs.appendFileSync(path.join(vault, '06-Identity', 'profile.md'), 'a human edit\n');

  const out = await withStdout(() =>
    memory.run(['approve', 'profile'], { paths, promptFn: async () => 'approve' })
  );
  const reg = readRegistry(paths.state);
  const rec = reg.approvals['06-identity/profile.md'];
  assert.ok(rec, 'record written');
  assert.equal(rec.approved_blob_hash, fileHash(vault, '06-Identity/profile.md'));
  assert.equal(rec.source, 'approved');
  // The exact bytes were displayed, provenance labeled as evidence only.
  assert.ok(out.includes('a human edit'), 'full file text shown');
  assert.ok(out.includes('evidence only — not proof'), 'provenance labeled as evidence');
  assert.ok(out.includes('approved "profile.md"'), 'success message printed');
});

test('memory approve accepts the basename form (profile.md) too', async () => {
  const { vault, paths } = setup();
  await withStdout(() =>
    memory.run(['approve', 'profile.md'], { paths, promptFn: async () => 'approve' })
  );
  assert.equal(
    readRegistry(paths.state).approvals['06-identity/profile.md'].approved_blob_hash,
    fileHash(vault, '06-Identity/profile.md')
  );
});

test('any answer other than "approve" cancels and records nothing', async () => {
  const { paths } = setup();
  for (const answer of ['no', '', 'APPROVE ', 'yes']) {
    const out = await withStdout(() =>
      memory.run(['approve', 'profile'], { paths, promptFn: async () => answer })
    );
    assert.deepEqual(readRegistry(paths.state).approvals, {}, `nothing recorded for ${JSON.stringify(answer)}`);
    assert.ok(out.includes('Cancelled.'), 'cancellation printed');
  }
});

test('--yes does NOT bypass the confirmation', async () => {
  const { paths } = setup();
  await withStdout(() =>
    memory.run(['approve', 'profile', '--yes'], { paths, promptFn: async () => 'no' })
  );
  assert.deepEqual(readRegistry(paths.state).approvals, {}, 'argv --yes ignored');
});

test('re-approving an unchanged file is idempotent and never prompts', async () => {
  const { vault, paths } = setup();
  // Seed (the attended-sync path) so the current bytes are already approved.
  seedApprovals(paths.state, vault, defaultLayout(), BLOCKED);
  const out = await withStdout(() =>
    memory.run(['approve', 'profile'], {
      paths,
      promptFn: async () => {
        throw new Error('prompt must not be called for an already-approved file');
      },
    })
  );
  assert.ok(out.includes('already approved'), 'idempotent message printed');
});

test('replacing a previously approved version says so before prompting', async () => {
  const { vault, paths } = setup();
  seedApprovals(paths.state, vault, defaultLayout(), BLOCKED);
  fs.appendFileSync(path.join(vault, '06-Identity', 'profile.md'), 'later edit\n');
  const out = await withStdout(() =>
    memory.run(['approve', 'profile'], { paths, promptFn: async () => 'approve' })
  );
  assert.ok(out.includes('REPLACES'), 'replacement of the prior approval is called out');
  assert.equal(
    readRegistry(paths.state).approvals['06-identity/profile.md'].approved_blob_hash,
    fileHash(vault, '06-Identity/profile.md')
  );
});

test('prototype-key names (toString, constructor, …) are rejected by the allowlist before any read', async () => {
  const { paths } = setup();
  for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
    await assert.rejects(
      () => memory.run(['approve', name], { paths, promptFn: async () => 'approve' }),
      /approve which identity note/,
      `inherited key ${JSON.stringify(name)} must be rejected as unknown`
    );
  }
  assert.deepEqual(readRegistry(paths.state).approvals, {}, 'nothing recorded');
});

test('unknown file and unknown subcommand throw WienerdogError', async () => {
  const { paths } = setup();
  await assert.rejects(
    () => memory.run(['approve', '../../etc/passwd'], { paths, promptFn: async () => 'approve' }),
    WienerdogError
  );
  await assert.rejects(
    () => memory.run(['approve', 'notes'], { paths, promptFn: async () => 'approve' }),
    WienerdogError
  );
  await assert.rejects(
    () => memory.run(['revoke', 'profile'], { paths, promptFn: async () => 'approve' }),
    WienerdogError
  );
  await assert.rejects(() => memory.run([], { paths, promptFn: async () => 'approve' }), WienerdogError);
});

test('a missing identity file and a missing vault config throw WienerdogError', async () => {
  const { vault, paths } = setup();
  fs.rmSync(path.join(vault, '06-Identity', 'goals.md'));
  await assert.rejects(
    () => memory.run(['approve', 'goals'], { paths, promptFn: async () => 'approve' }),
    /identity file not found/
  );
  fs.writeFileSync(paths.config, 'vault: null\n');
  await assert.rejects(
    () => memory.run(['approve', 'profile'], { paths, promptFn: async () => 'approve' }),
    /no vault configured/
  );
});

test('memory approve --all ratifies every pending identity note with ONE confirmation', async () => {
  const { vault, paths } = setup();
  let prompts = 0;
  const out = await withStdout(() =>
    memory.run(['approve', '--all'], { paths, promptFn: async () => { prompts += 1; return 'approve'; } })
  );
  assert.equal(prompts, 1, 'a single typed-word confirmation for the batch');
  const reg = readRegistry(paths.state);
  for (const f of ['profile.md', 'preferences.md', 'goals.md', 'instructions.md']) {
    const rec = reg.approvals[`06-identity/${f}`];
    assert.ok(rec && rec.source === 'approved', `${f} approved`);
    assert.equal(rec.approved_blob_hash, fileHash(vault, `06-Identity/${f}`));
    assert.ok(out.includes(`content of ${f}`), `${f} bytes shown before approval`);
  }
});

test('memory approve --all only ratifies the PENDING notes (skips already-approved)', async () => {
  const { vault, paths } = setup();
  seedApprovals(paths.state, vault, defaultLayout(), BLOCKED); // all four recorded at current bytes
  fs.appendFileSync(path.join(vault, '06-Identity', 'goals.md'), 'a human edit\n'); // only goals now pending
  const out = await withStdout(() =>
    memory.run(['approve', '--all'], { paths, promptFn: async () => 'approve' })
  );
  assert.ok(out.includes('a human edit'), 'the pending note is shown');
  assert.ok(!out.includes('content of profile.md'), 'an already-approved note is NOT re-shown');
  assert.ok(out.includes('approved "goals.md"') && !out.includes('"profile.md"'), 'only goals approved');
  const reg = readRegistry(paths.state);
  assert.equal(reg.approvals['06-identity/goals.md'].approved_blob_hash, fileHash(vault, '06-Identity/goals.md'));
});

test('memory approve --all is a no-op when everything is already approved', async () => {
  const { vault, paths } = setup();
  seedApprovals(paths.state, vault, defaultLayout(), BLOCKED);
  const out = await withStdout(() =>
    memory.run(['approve', '--all'], { paths, promptFn: async () => assert.fail('must not prompt when nothing pending') })
  );
  assert.ok(out.includes('all identity notes are already approved'), 'no-op message');
});

test('memory approve --all cancels on anything but "approve" and records nothing', async () => {
  const { paths } = setup();
  const out = await withStdout(() =>
    memory.run(['approve', '--all'], { paths, promptFn: async () => 'yes' })
  );
  assert.ok(out.includes('Cancelled.'), 'cancelled');
  const reg = readRegistry(paths.state);
  assert.equal(Object.keys(reg.approvals || {}).length, 0, 'nothing recorded on cancel');
});
