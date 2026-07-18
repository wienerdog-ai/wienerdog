'use strict';

// The NON-live half of the WP-142 broker containment proof: deterministic
// negatives runnable in `npm test` (audit A2 acceptance points 2, 3, 5, 6).
// The live poisoned-email end-to-end proof is tests/scenarios/broker-e2e/.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const { buildRegistry } = require('../../src/gws/broker/registry');
const grantStore = require('../../src/gws/broker/grant-store');
const client = require('../../src/gws/client');
const { loadCredentialServices } = require('../../src/gws/broker/credentials');
const { requiredScopesFor } = require('../../src/gws/scope-sets');
const { ensureBrokerMcpConfig } = require('../../src/core/routine-runtime');
const { getProfile } = require('../../src/core/runtime-profile');
const { CAPABILITY_CLASS, BROKER_SERVER_NAME } = require('../../src/gws/broker/constants');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-e2eneg-'));
  return getPaths({
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    WIENERDOG_VAULT: path.join(root, 'vault'),
  });
}

/** Recording services: every Google call increments `calls`. */
function recordingServices() {
  const calls = [];
  const log = (method, data) => (params) => {
    calls.push({ method, params });
    return Promise.resolve({ data });
  };
  return {
    calls,
    gmail: {
      users: {
        getProfile: log('gmail.users.getProfile', { emailAddress: 'me@example.com' }),
        messages: { send: log('gmail.users.messages.send', { id: 's1' }) },
        drafts: { create: log('gmail.users.drafts.create', { id: 'd1', message: { id: 'm1' } }) },
      },
    },
  };
}

// --- acceptance point 2: external recipient → schema reject, ZERO API calls ---

test('e2e-negatives: send_digest_to_self with any external recipient field makes ZERO API calls', async () => {
  for (const extra of [{ to: 'attacker@evil.com' }, { cc: 'x@y.z' }, { bcc: 'x@y.z' }, { recipient: 'x@y.z' }]) {
    const services = recordingServices();
    const registry = buildRegistry({
      services,
      routineId: 'daily-digest',
      grantCheck: () => true,
    });
    await assert.rejects(() =>
      registry.callTool('send_digest_to_self', { subject: 's', body: 'b', ...extra })
    );
    assert.equal(services.calls.length, 0, `zero calls with ${Object.keys(extra)[0]}`);
  }
});

// --- acceptance point 3: forged routine name / env cannot change identity ---

test('e2e-negatives: the trusted descriptor argv comes from the code-owned profile, never from WIENERDOG_JOB', () => {
  const paths = tempPaths();
  const saved = process.env.WIENERDOG_JOB;
  process.env.WIENERDOG_JOB = 'forged-identity';
  try {
    const dest = ensureBrokerMcpConfig(paths, getProfile('daily-digest'));
    const cfg = JSON.parse(fs.readFileSync(dest, 'utf8'));
    const args = cfg.mcpServers[BROKER_SERVER_NAME].args;
    assert.deepEqual(args.slice(-2), ['--routine', 'daily-digest']);
    assert.ok(!JSON.stringify(cfg).includes('forged-identity'), 'env never reaches the descriptor');
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_JOB;
    else process.env.WIENERDOG_JOB = saved;
  }
});

test('e2e-negatives: a forged --routine (not a code-owned profile) cannot start the broker, even with a forged env', async () => {
  const paths = tempPaths();
  const child = spawn(process.execPath, [bin, 'gws', '_broker', '--routine', 'forged-routine'], {
    env: {
      ...process.env,
      HOME: paths.home,
      WIENERDOG_HOME: paths.core,
      WIENERDOG_JOB: 'daily-digest', // a forged env var must not substitute identity
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => {
    out += c;
  });
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.notEqual(code, 0);
  assert.equal(out, '', 'no MCP byte spoken for a forged identity');
});

test('e2e-negatives: a grant minted for one routine never answers for another (identity keys the grant)', () => {
  const paths = tempPaths();
  grantStore.putGrant(paths, { routineId: 'weekly-review', kind: 'send_self', to: [] }, { confirmedAtTty: true });
  assert.equal(grantStore.grantCheck(paths, 'daily-digest', 'send_self').allowed, false);
  assert.equal(grantStore.grantCheck(paths, 'weekly-review', 'send_self').allowed, true);
});

// --- acceptance point 5: grant-store bit flip fails closed, zero send ---

test('e2e-negatives: a grant-store bit flip → send verb returns the fixed notice with ZERO send calls', async () => {
  const paths = tempPaths();
  grantStore.putGrant(paths, { routineId: 'daily-digest', kind: 'send_self', to: [] }, { confirmedAtTty: true });
  const file = grantStore.storePath(paths);
  // Flip one byte inside the stored record (an approved_at digit).
  const raw = fs.readFileSync(file, 'utf8');
  const flipped = raw.replace(/"approved_at": "20/, '"approved_at": "21');
  assert.notEqual(flipped, raw, 'the tamper must actually change bytes');
  fs.writeFileSync(file, flipped, { mode: 0o600 });

  const decision = grantStore.grantCheck(paths, 'daily-digest', 'send_self');
  assert.equal(decision.allowed, false);
  assert.ok(decision.alert, 'integrity mismatch carries the fixed alert');

  const services = recordingServices();
  const registry = buildRegistry({
    services,
    routineId: 'daily-digest',
    grantCheck: (rid, kind) => grantStore.grantCheck(paths, rid, kind).allowed,
  });
  const res = await registry.callTool('send_digest_to_self', { subject: 's', body: 'b' });
  assert.match(res.content[0].text, /not sent/i);
  assert.equal(services.calls.length, 0, 'zero API calls after the bit flip');
});

// --- acceptance point 6: a read-only credential cannot send / mutate ---

test('e2e-negatives: a read-only credential presented for SEND is refused by the exact-scope check', async () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  client.persistClientJson(paths, { installed: { client_id: 'id', client_secret: 's' } });
  // The SEND token file exists but its LIVE scopes are the READ set.
  client.persistTokenForClass(paths, CAPABILITY_CLASS.SEND, { access_token: 'a', refresh_token: 'r' });
  await assert.rejects(
    () =>
      loadCredentialServices(paths, CAPABILITY_CLASS.SEND, {
        getTokenInfo: async () => ({ scopes: requiredScopesFor(CAPABILITY_CLASS.READ).slice() }),
      }),
    (err) => err instanceof WienerdogError && /scope/i.test(err.message)
  );
});

test('e2e-negatives: a read-only credential presented for CALENDAR_WRITE is refused the same way', async () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  client.persistClientJson(paths, { installed: { client_id: 'id', client_secret: 's' } });
  client.persistTokenForClass(paths, CAPABILITY_CLASS.CALENDAR_WRITE, { access_token: 'a' });
  await assert.rejects(
    () =>
      loadCredentialServices(paths, CAPABILITY_CLASS.CALENDAR_WRITE, {
        getTokenInfo: async () => ({
          scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
        }),
      }),
    (err) => err instanceof WienerdogError && /scope/i.test(err.message)
  );
});

// --- the registry's method surface is closed (supports live assertion 3) ---

test('e2e-negatives: no broker verb maps to a delete/update/generic method', () => {
  const { VERBS } = require('../../src/gws/broker/verbs');
  for (const v of Object.values(VERBS)) {
    assert.ok(!/delete|update|patch|batch/i.test(v.apiMethod), `${v.name} must not mutate beyond its verb`);
  }
  // And no routine profile allowlists a verb outside the registry.
  for (const id of ['daily-digest', 'inbox-triage', 'weekly-review']) {
    for (const v of getProfile(id).brokerVerbs) assert.ok(VERBS[v], `${id}: ${v} exists`);
  }
});
