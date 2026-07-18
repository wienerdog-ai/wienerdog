'use strict';

const { WienerdogError } = require('../core/errors');

/**
 * Calendar verb functions. Each takes `(services, opts)` and returns plain
 * data; they perform no console I/O (that is index.js's job). `services` is
 * the object from getServices; tests pass a stub with just the methods used.
 * All calendar access is against the user's own `primary` calendar.
 */

/**
 * cal list — upcoming events in a window.
 * @param {{calendar:object}} services
 * @param {{from?:string, to?:string, max?:number}} opts (ISO timestamps)
 * @returns {Promise<Array<{id:string, summary:string, start:string, end:string,
 *   attendees:string[]}>>}
 */
async function list(services, opts) {
  const res = await services.calendar.events.list({
    calendarId: 'primary',
    timeMin: opts.from || new Date().toISOString(),
    timeMax: opts.to,
    maxResults: opts.max || 20,
    singleEvents: true,
    orderBy: 'startTime',
  });
  const items = (res.data && res.data.items) || [];
  return items.map((item) => ({
    id: item.id,
    summary: item.summary,
    start: item.start.dateTime || item.start.date,
    end: item.end.dateTime || item.end.date,
    attendees: (item.attendees || []).map((a) => a.email),
  }));
}

/**
 * cal show — one event's detail.
 * @param {{calendar:object}} services
 * @param {{id:string}} opts
 * @returns {Promise<{id:string, summary:string, description:string, start:string,
 *   end:string, location:string, attendees:string[]}>}
 */
async function show(services, opts) {
  const res = await services.calendar.events.get({
    calendarId: 'primary',
    eventId: opts.id,
  });
  const item = res.data || {};
  return {
    id: item.id,
    summary: item.summary,
    description: item.description,
    start: item.start.dateTime || item.start.date,
    end: item.end.dateTime || item.end.date,
    location: item.location,
    attendees: (item.attendees || []).map((a) => a.email),
  };
}

/**
 * cal add-event — create a LIVE event on the PRIMARY calendar WITHOUT
 * notifying anyone (renamed from the old misnomer: an insert is a live
 * mutation, not a draft — audit A2 F3). `sendUpdates:'none'` is MANDATORY:
 * this verb must never email attendees (that would be an outbound,
 * grant-gated action). There is deliberately NO delete/update counterpart —
 * delete-prevention is the verb allowlist, not the scope (ADR-0026 §3).
 * @param {{calendar:object}} services
 * @param {{title:string, start:string, end:string, attendees?:string[]}} opts
 * @returns {Promise<{id:string, htmlLink:string}>}
 */
async function addEvent(services, opts) {
  const res = await services.calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'none',
    requestBody: {
      summary: opts.title,
      start: { dateTime: opts.start },
      end: { dateTime: opts.end },
      attendees: (opts.attendees || []).map((email) => ({ email })),
    },
  });
  const data = res.data || {};
  return { id: data.id, htmlLink: data.htmlLink };
}

/**
 * Require a flag to be present, else throw a WienerdogError naming it.
 * @param {*} value
 * @param {string} name
 * @returns {*}
 */
function require_(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new WienerdogError(`missing required flag ${name}`);
  }
  return value;
}

/**
 * Parse the raw tokens following the verb in `flags.positionals`. index.js's
 * generic flag parser only recognizes `--json`/`--max`/`--to`/etc, so `cal`'s
 * own flags (`--title`, `--start`, `--end`, `--from`, `--id`, repeatable
 * `--attendee`) arrive here as plain unconsumed tokens.
 * @param {string[]} tokens
 * @returns {{title?:string, start?:string, end?:string, from?:string,
 *   id?:string, attendees:string[]}}
 */
function parseVerbFlags(tokens) {
  const out = { attendees: [] };
  for (let i = 0; i < tokens.length; i++) {
    switch (tokens[i]) {
      case '--title':
        out.title = tokens[++i];
        break;
      case '--start':
        out.start = tokens[++i];
        break;
      case '--end':
        out.end = tokens[++i];
        break;
      case '--from':
        out.from = tokens[++i];
        break;
      case '--id':
        out.id = tokens[++i];
        break;
      case '--attendee':
        out.attendees.push(tokens[++i]);
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * `cal <verb>` entry point — index.js's dispatch table routes the whole `cal`
 * group here (`DISPATCH['cal']`). Since WP-140 the bridge selects a
 * least-scope credential PER VERB (no full-scope services object exists for
 * `cal`): `list`/`show` run on the READ credential (calendar.events.readonly —
 * physically cannot mutate), `add-event` runs on the CALENDAR_WRITE credential
 * and ONLY under a TTY-minted `calendar_write` grant (WP-139). A missing grant
 * degrades to a fail-visible notice with ZERO insert calls
 * (D-ADDEVENT-DEGRADE, mirroring the send-grant posture).
 * @param {{paths: import('../core/paths').WienerdogPaths,
 *          routine: string|null,
 *          servicesFor: (capabilityClass:string)=>{calendar:object}}} deps
 * @param {{positionals:string[], to?:string, max?:number}} flags
 * @returns {Promise<*>}
 */
async function run(deps, flags) {
  const { CAPABILITY_CLASS } = require('./broker/constants');
  const [verb, ...rest] = flags.positionals;
  const sub = parseVerbFlags(rest);
  switch (verb) {
    case 'list':
      return list(deps.servicesFor(CAPABILITY_CLASS.READ), { from: sub.from, to: flags.to, max: flags.max });
    case 'show':
      return show(deps.servicesFor(CAPABILITY_CLASS.READ), { id: require_(sub.id, '--id') });
    case 'add-event': {
      const opts = {
        title: require_(sub.title, '--title'),
        start: require_(sub.start, '--start'),
        end: require_(sub.end, '--end'),
        attendees: sub.attendees,
      };
      const { grantCheck } = require('./broker/grant-store');
      const routine = deps.routine || null;
      const decision = grantCheck(deps.paths, routine, 'calendar_write');
      if (!decision.allowed) {
        // Fail-visible, zero mutation (ADR-0007 posture; alert carries the
        // fixed integrity message when the store failed its check).
        return {
          created: false,
          notice:
            `no calendar-write grant for ${routine || '<none>'}; not created. ` +
            'Run: wienerdog grant calendar-write --routine <name>' +
            (decision.alert ? ` (${decision.alert})` : ''),
        };
      }
      return addEvent(deps.servicesFor(CAPABILITY_CLASS.CALENDAR_WRITE), opts);
    }
    default:
      throw new WienerdogError(`unknown cal verb: ${verb || '<none>'}`);
  }
}

module.exports = { list, show, addEvent, run };
