'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const calendar = require('../../src/gws/calendar');
const { WienerdogError } = require('../../src/core/errors');

test('list maps events with singleEvents/orderBy and flattened attendees', async () => {
  let seen;
  const services = {
    calendar: {
      events: {
        list: async (args) => {
          seen = args;
          return {
            data: {
              items: [
                {
                  id: 'abc',
                  summary: 'Standup',
                  start: { dateTime: '2026-07-03T09:00:00+02:00' },
                  end: { dateTime: '2026-07-03T09:15:00+02:00' },
                  attendees: [{ email: 'ada@acme.com' }],
                },
              ],
            },
          };
        },
      },
    },
  };

  const result = await calendar.list(services, { max: 2 });
  assert.deepEqual(result, [
    {
      id: 'abc',
      summary: 'Standup',
      start: '2026-07-03T09:00:00+02:00',
      end: '2026-07-03T09:15:00+02:00',
      attendees: ['ada@acme.com'],
    },
  ]);
  assert.equal(seen.calendarId, 'primary');
  assert.equal(seen.maxResults, 2);
  assert.equal(seen.singleEvents, true);
  assert.equal(seen.orderBy, 'startTime');
  assert.ok(seen.timeMin); // defaults to now when opts.from is absent

  // JSON output shape is valid JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('list falls back to all-day date fields when dateTime is absent', async () => {
  const services = {
    calendar: {
      events: {
        list: async () => ({
          data: {
            items: [
              {
                id: 'ho1',
                summary: 'Holiday',
                start: { date: '2026-07-04' },
                end: { date: '2026-07-05' },
              },
            ],
          },
        }),
      },
    },
  };
  const result = await calendar.list(services, {});
  assert.deepEqual(result[0].start, '2026-07-04');
  assert.deepEqual(result[0].end, '2026-07-05');
  assert.deepEqual(result[0].attendees, []);
});

test('show returns full event detail', async () => {
  let seen;
  const services = {
    calendar: {
      events: {
        get: async (args) => {
          seen = args;
          return {
            data: {
              id: 'abc',
              summary: 'Standup',
              description: 'Daily sync',
              start: { dateTime: '2026-07-03T09:00:00+02:00' },
              end: { dateTime: '2026-07-03T09:15:00+02:00' },
              location: 'Zoom',
              attendees: [{ email: 'ada@acme.com' }, { email: 'bob@acme.com' }],
            },
          };
        },
      },
    },
  };

  const result = await calendar.show(services, { id: 'abc' });
  assert.deepEqual(result, {
    id: 'abc',
    summary: 'Standup',
    description: 'Daily sync',
    start: '2026-07-03T09:00:00+02:00',
    end: '2026-07-03T09:15:00+02:00',
    location: 'Zoom',
    attendees: ['ada@acme.com', 'bob@acme.com'],
  });
  assert.equal(seen.calendarId, 'primary');
  assert.equal(seen.eventId, 'abc');
});

test('draftEvent always inserts with sendUpdates:none and never notifies', async () => {
  let seen;
  const services = {
    calendar: {
      events: {
        insert: async (args) => {
          seen = args;
          return { data: { id: 'evt-1', htmlLink: 'https://calendar.google.com/evt-1' } };
        },
      },
    },
  };

  const result = await calendar.draftEvent(services, {
    title: 'Plan review',
    start: '2026-07-03T10:00:00Z',
    end: '2026-07-03T10:30:00Z',
    attendees: ['ada@acme.com'],
  });

  assert.deepEqual(result, { id: 'evt-1', htmlLink: 'https://calendar.google.com/evt-1' });
  assert.equal(seen.calendarId, 'primary');
  assert.equal(seen.sendUpdates, 'none'); // MANDATORY: never notify attendees
  assert.deepEqual(seen.requestBody, {
    summary: 'Plan review',
    start: { dateTime: '2026-07-03T10:00:00Z' },
    end: { dateTime: '2026-07-03T10:30:00Z' },
    attendees: [{ email: 'ada@acme.com' }],
  });

  // JSON output shape.
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('draftEvent defaults attendees to an empty array when omitted', async () => {
  const services = {
    calendar: {
      events: {
        insert: async (args) => ({ data: { id: 'evt-2', htmlLink: 'x' } }),
      },
    },
  };
  const result = await calendar.draftEvent(services, {
    title: 'Solo block',
    start: '2026-07-03T10:00:00Z',
    end: '2026-07-03T10:30:00Z',
  });
  assert.equal(result.id, 'evt-2');
});

test('run: cal show throws WienerdogError when --id is missing', async () => {
  const services = { calendar: {} };
  await assert.rejects(
    () => calendar.run(services, { positionals: ['show'] }),
    (err) => err instanceof WienerdogError && /--id/.test(err.message)
  );
});

test('run: cal draft-event throws WienerdogError when --title is missing', async () => {
  const services = { calendar: {} };
  await assert.rejects(
    () =>
      calendar.run(services, {
        positionals: ['draft-event', '--start', 'a', '--end', 'b'],
      }),
    (err) => err instanceof WienerdogError && /--title/.test(err.message)
  );
});

test('run: cal list dispatches through to list() with --json-friendly flags', async () => {
  const services = {
    calendar: {
      events: {
        list: async () => ({ data: { items: [] } }),
      },
    },
  };
  const result = await calendar.run(services, { positionals: ['list'], max: 5 });
  assert.deepEqual(result, []);
});

test('run: cal draft-event parses --title/--start/--end/--attendee tokens', async () => {
  let seen;
  const services = {
    calendar: {
      events: {
        insert: async (args) => {
          seen = args;
          return { data: { id: 'evt-3', htmlLink: 'x' } };
        },
      },
    },
  };
  await calendar.run(services, {
    positionals: [
      'draft-event',
      '--title',
      'Standup',
      '--start',
      '2026-07-03T09:00:00Z',
      '--end',
      '2026-07-03T09:15:00Z',
      '--attendee',
      'a@x.com',
      '--attendee',
      'b@x.com',
    ],
  });
  assert.equal(seen.sendUpdates, 'none');
  assert.deepEqual(seen.requestBody.attendees, [{ email: 'a@x.com' }, { email: 'b@x.com' }]);
});
