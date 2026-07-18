'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const store = require('../../src/gws/broker/grant-store');

/** Fresh temp core. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-grantstore-'));
  const core = path.join(root, 'wd');
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

const TTY = { confirmedAtTty: true };

test('grant-store: put/read round-trip — grantCheck allows the exact stored grant', () => {
  const paths = tempPaths();
  store.putGrant(paths, { routineId: 'daily-digest', kind: 'send_self', to: ['me@example.com'] }, TTY);

  const decision = store.grantCheck(paths, 'daily-digest', 'send_self');
  assert.equal(decision.allowed, true);

  // The store file is 0600 JSON under state/.
  const file = store.storePath(paths);
  assert.equal(file, path.join(paths.state, 'broker-grants.json'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('grant-store: routineId key identity is case-folded; content bytes are exact (ADR-0021 discipline)', () => {
  const paths = tempPaths();
  store.putGrant(paths, { routineId: 'Daily-Digest', kind: 'send_self', to: [] }, TTY);
  assert.equal(store.grantCheck(paths, 'daily-digest', 'send_self').allowed, true);
  assert.equal(store.grantCheck(paths, 'DAILY-DIGEST', 'send_self').allowed, true);
});

test('grant-store: a one-byte tamper of the stored grant denies with the fixed alert', () => {
  const paths = tempPaths();
  store.putGrant(paths, { routineId: 'daily-digest', kind: 'send_self', to: ['me@example.com'] }, TTY);

  const file = store.storePath(paths);
  const tampered = fs.readFileSync(file, 'utf8').replace('me@example.com', 'mE@example.com');
  fs.writeFileSync(file, tampered, { mode: 0o600 });

  const decision = store.grantCheck(paths, 'daily-digest', 'send_self');
  assert.equal(decision.allowed, false);
  assert.ok(decision.alert, 'integrity mismatch carries the fixed alert');
  assert.match(decision.alert, /integrity/i);
  assert.match(decision.alert, /re-grant/i);
  // Honest framing: never implies cryptographic unforgeability.
  assert.doesNotMatch(decision.alert, /unforgeable|cryptographic|tamper-proof/i);
});

test('grant-store: absent store and absent grant deny (fail closed), never throw', () => {
  const paths = tempPaths();
  const noStore = store.grantCheck(paths, 'daily-digest', 'send_self');
  assert.equal(noStore.allowed, false);

  store.putGrant(paths, { routineId: 'other-routine', kind: 'send_self', to: [] }, TTY);
  const noGrant = store.grantCheck(paths, 'daily-digest', 'send_self');
  assert.equal(noGrant.allowed, false);
});

test('grant-store: a malformed store denies with the fixed alert, never throws', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.state, { recursive: true, mode: 0o700 });
  fs.writeFileSync(store.storePath(paths), '{ not json', { mode: 0o600 });
  const decision = store.grantCheck(paths, 'daily-digest', 'send_self');
  assert.equal(decision.allowed, false);
  assert.ok(decision.alert);
});

test('grant-store: putGrant is TTY-only — refuses without confirmedAtTty; no env/--yes path exists', () => {
  const paths = tempPaths();
  for (const opts of [undefined, {}, { confirmedAtTty: false }, { confirmedAtTty: 'true' }, { yes: true }]) {
    assert.throws(
      () => store.putGrant(paths, { routineId: 'r', kind: 'send_self', to: [] }, opts),
      WienerdogError
    );
  }
  assert.equal(fs.existsSync(store.storePath(paths)), false, 'refused mint writes nothing');
});

test('grant-store: kinds are independent — send_self never implies calendar_write', () => {
  const paths = tempPaths();
  store.putGrant(paths, { routineId: 'daily-digest', kind: 'send_self', to: [] }, TTY);
  assert.equal(store.grantCheck(paths, 'daily-digest', 'send_self').allowed, true);
  assert.equal(store.grantCheck(paths, 'daily-digest', 'calendar_write').allowed, false);

  store.putGrant(paths, { routineId: 'daily-digest', kind: 'calendar_write', to: [] }, TTY);
  assert.equal(store.grantCheck(paths, 'daily-digest', 'calendar_write').allowed, true);
});

test('grant-store: unknown kind is refused on put and denied on check', () => {
  const paths = tempPaths();
  assert.throws(() => store.putGrant(paths, { routineId: 'r', kind: 'send_anywhere', to: [] }, TTY), WienerdogError);
  assert.equal(store.grantCheck(paths, 'r', 'send_anywhere').allowed, false);
});

test('grant-store: putGrant upserts — re-granting a (routine, kind) replaces the record', () => {
  const paths = tempPaths();
  store.putGrant(paths, { routineId: 'r', kind: 'send_self', to: ['a@x.com'] }, TTY);
  store.putGrant(paths, { routineId: 'r', kind: 'send_self', to: ['b@x.com'] }, TTY);
  const raw = JSON.parse(fs.readFileSync(store.storePath(paths), 'utf8'));
  const entries = Object.values(raw.grants).filter((g) => g.routineId.toLowerCase() === 'r');
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].to, ['b@x.com']);
  assert.equal(store.grantCheck(paths, 'r', 'send_self').allowed, true);
});
