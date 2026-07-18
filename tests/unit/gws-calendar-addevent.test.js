'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const calendar = require('../../src/gws/calendar');
const grantStore = require('../../src/gws/broker/grant-store');
const { CAPABILITY_CLASS } = require('../../src/gws/broker/constants');
const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');

/** Fresh temp core. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-caladd-'));
  const core = path.join(root, 'wd');
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/** Recording per-class services seam for calendar.run's new deps shape. */
function calDeps(paths, routine) {
  const record = { classes: [], insert: [], list: [], get: [] };
  const services = {
    calendar: {
      events: {
        insert: async (args) => {
          record.insert.push(args);
          return { data: { id: 'evt-1', htmlLink: 'link' } };
        },
        list: async (args) => {
          record.list.push(args);
          return { data: { items: [] } };
        },
        get: async (args) => {
          record.get.push(args);
          return { data: { id: 'e', start: {}, end: {} } };
        },
      },
    },
  };
  return {
    record,
    deps: {
      paths,
      routine,
      servicesFor: (cls) => {
        record.classes.push(cls);
        return services;
      },
    },
  };
}

const ADD_EVENT_ARGS = [
  'add-event',
  '--title', 'Plan review',
  '--start', '2026-07-20T10:00:00Z',
  '--end', '2026-07-20T10:30:00Z',
];

test('cal-addevent: draft-event is GONE — the verb and the function are renamed', async () => {
  assert.equal(calendar.draftEvent, undefined);
  assert.equal(typeof calendar.addEvent, 'function');
  const { deps } = calDeps(tempPaths(), 'r');
  await assert.rejects(
    () => calendar.run(deps, { positionals: ['draft-event', '--title', 't'] }),
    (err) => err instanceof WienerdogError && /unknown cal verb/.test(err.message)
  );
});

test('cal-addevent: without a calendar_write grant → fail-visible notice, ZERO insert calls', async () => {
  const paths = tempPaths();
  const { record, deps } = calDeps(paths, 'daily-digest');
  const result = await calendar.run(deps, { positionals: ADD_EVENT_ARGS });
  assert.equal(record.insert.length, 0, 'no events.insert without a grant');
  assert.equal(result.created, false);
  assert.match(result.notice, /no calendar-write grant for daily-digest; not created/);
  assert.match(result.notice, /wienerdog grant calendar-write --routine/);
});

test('cal-addevent: with a TTY-minted grant → inserts via the CALENDAR_WRITE credential, sendUpdates none', async () => {
  const paths = tempPaths();
  grantStore.putGrant(paths, { routineId: 'daily-digest', kind: 'calendar_write', to: [] }, { confirmedAtTty: true });
  const { record, deps } = calDeps(paths, 'daily-digest');
  const result = await calendar.run(deps, {
    positionals: [...ADD_EVENT_ARGS, '--attendee', 'a@x.com'],
  });
  assert.deepEqual(record.classes, [CAPABILITY_CLASS.CALENDAR_WRITE]);
  assert.equal(record.insert.length, 1);
  const seen = record.insert[0];
  assert.equal(seen.calendarId, 'primary');
  assert.equal(seen.sendUpdates, 'none', 'MANDATORY: never notify attendees');
  assert.deepEqual(seen.requestBody.attendees, [{ email: 'a@x.com' }]);
  assert.equal(result.id, 'evt-1');
});

test('cal-addevent: a send_self grant does NOT satisfy add-event (kinds never imply each other)', async () => {
  const paths = tempPaths();
  grantStore.putGrant(paths, { routineId: 'daily-digest', kind: 'send_self', to: [] }, { confirmedAtTty: true });
  const { record, deps } = calDeps(paths, 'daily-digest');
  const result = await calendar.run(deps, { positionals: ADD_EVENT_ARGS });
  assert.equal(record.insert.length, 0);
  assert.equal(result.created, false);
});

test('cal-addevent: list and show use the READ credential; add-event never runs on it', async () => {
  const paths = tempPaths();
  const { record, deps } = calDeps(paths, null);
  await calendar.run(deps, { positionals: ['list'], max: 3 });
  await calendar.run(deps, { positionals: ['show', '--id', 'e'] });
  assert.deepEqual(record.classes, [CAPABILITY_CLASS.READ, CAPABILITY_CLASS.READ]);
  assert.equal(record.list.length, 1);
  assert.equal(record.get.length, 1);
});

test('cal-addevent: no delete/update verb exists — neither in the dispatch nor in the source', async () => {
  const { deps } = calDeps(tempPaths(), 'r');
  for (const verb of ['delete', 'delete-event', 'update', 'update-event']) {
    await assert.rejects(
      () => calendar.run(deps, { positionals: [verb, '--id', 'x'] }),
      /unknown cal verb/
    );
  }
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'gws', 'calendar.js'), 'utf8');
  assert.doesNotMatch(src, /events\.(delete|update|patch)/);
  assert.doesNotMatch(src, /draftEvent|draft-event/);
});

test('cal-addevent: a tampered grant store denies add-event (integrity fail-closed end to end)', async () => {
  const paths = tempPaths();
  grantStore.putGrant(paths, { routineId: 'daily-digest', kind: 'calendar_write', to: [] }, { confirmedAtTty: true });
  const file = grantStore.storePath(paths);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('daily-digest', 'daily-digesX'), { mode: 0o600 });
  const { record, deps } = calDeps(paths, 'daily-digest');
  const result = await calendar.run(deps, { positionals: ADD_EVENT_ARGS });
  assert.equal(record.insert.length, 0);
  assert.equal(result.created, false);
});
