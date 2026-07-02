'use strict';

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { getServices } = require('./client');

/**
 * Parse `gws` flags out of an argv tail, returning flags plus leftover
 * positionals. Supported: --json (bool), --max <n>, --to <s>, --subject <s>,
 * --body <s>, --client <path>, --routine <name>, --title <s>, --start <iso>,
 * --end <iso>, --attendee <email> (repeatable), --from <iso>, --id <s>.
 *
 * `--title`/`--start`/`--end`/`--attendee`/`--from`/`--id` are cal/drive verb
 * flags: they are captured here AND also left in `positionals` (their raw
 * tokens) so the unmodified `calendar.js`/`drive.js` `run()` bridges — which
 * independently re-parse those verb flags out of `positionals` — keep working.
 * @param {string[]} argv
 * @returns {{json:boolean, max?:number, to?:string, subject?:string,
 *   body?:string, client?:string, routine?:string, title?:string,
 *   start?:string, end?:string, attendee:string[], from?:string, id?:string,
 *   positionals:string[]}}
 */
function parseFlags(argv) {
  const flags = { json: false, positionals: [], attendee: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--json':
        flags.json = true;
        break;
      case '--max':
        flags.max = Number(argv[++i]);
        break;
      case '--to':
        flags.to = argv[++i];
        break;
      case '--subject':
        flags.subject = argv[++i];
        break;
      case '--body':
        flags.body = argv[++i];
        break;
      case '--client':
        flags.client = argv[++i];
        break;
      case '--routine':
        flags.routine = argv[++i];
        break;
      case '--title':
        flags.title = argv[++i];
        flags.positionals.push(a, flags.title);
        break;
      case '--start':
        flags.start = argv[++i];
        flags.positionals.push(a, flags.start);
        break;
      case '--end':
        flags.end = argv[++i];
        flags.positionals.push(a, flags.end);
        break;
      case '--from':
        flags.from = argv[++i];
        flags.positionals.push(a, flags.from);
        break;
      case '--id':
        flags.id = argv[++i];
        flags.positionals.push(a, flags.id);
        break;
      case '--attendee': {
        const v = argv[++i];
        flags.attendee.push(v);
        flags.positionals.push(a, v);
        break;
      }
      default:
        flags.positionals.push(a);
    }
  }
  return flags;
}

/**
 * Resolve the routine for a `gmail send` grant lookup: `--routine` flag, else
 * `WIENERDOG_JOB` env, else null. Never invents a routine — absent everywhere
 * means null, which `gmail.send` treats as ungranted (degrade to draft).
 * @param {{routine?:string}} flags
 * @returns {string|null}
 */
function resolveRoutine(flags) {
  return flags.routine ?? process.env.WIENERDOG_JOB ?? null;
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
 * The `<group> <verb>` dispatch table. Each handler lazily requires its
 * module so a group whose module is not shipped yet fails only when invoked,
 * without touching this file.
 * @type {Record<string, (ctx:{paths:object, flags:object, services:()=>object})=>Promise<*>>}
 */
const DISPATCH = {
  'auth': ({ paths, flags }) =>
    require('./auth').run(paths, { clientPath: require_(flags.client, '--client') }),
  'gmail search': ({ flags, services }) =>
    require('./gmail').search(services(), {
      query: require_(flags.positionals[0], '<query>'),
      max: flags.max,
    }),
  'gmail read': ({ flags, services }) =>
    require('./gmail').read(services(), {
      // --id is captured as a structured flag; bare positional kept as fallback
      id: require_(flags.id ?? flags.positionals[0], '<id>'),
    }),
  'gmail draft': ({ flags, services }) =>
    require('./gmail').draft(services(), {
      to: require_(flags.to, '--to'),
      subject: require_(flags.subject, '--subject'),
      body: require_(flags.body, '--body'),
    }),
  'gmail send': ({ paths, flags, services }) =>
    require('./gmail').send(services(), {
      to: flags.to,
      subject: flags.subject,
      body: flags.body,
      routine: resolveRoutine(flags),
      paths,
    }),
  'cal': ({ flags, services }) => require('./calendar').run(services(), flags),
  'drive': ({ flags, services }) => require('./drive').run(services(), flags),
  '_alert': ({ flags, services }) =>
    require('./alert').run(services(), { subject: flags.subject, body: flags.body }),
};

/**
 * Render a verb result to stdout — JSON when --json, else a short summary.
 * @param {string} key
 * @param {*} result
 * @param {boolean} json
 */
function render(key, result, json) {
  if (result === undefined) return;
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (key === 'gmail search' && Array.isArray(result)) {
    for (const m of result) {
      process.stdout.write(`${m.date}  ${m.from}  ${m.subject}\n`);
    }
  } else if (key === 'gmail read') {
    process.stdout.write(
      `From: ${result.from}\nTo: ${result.to}\nDate: ${result.date}\n` +
        `Subject: ${result.subject}\n\n${result.body}\n`
    );
  } else if (key === 'gmail draft') {
    process.stdout.write(`Draft created (draftId ${result.draftId}).\n`);
  } else if (key === 'auth') {
    const who = result.email ? ` as ${result.email}` : '';
    process.stdout.write(`Connected to Google${who}. Token saved to ${result.tokenPath}.\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

/**
 * `wienerdog gws <group> <verb> [flags]`.
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function run(argv) {
  const group = argv[0];
  // `auth` and the single-word groups (cal/drive/_alert) key on group alone;
  // gmail keys on "<group> <verb>".
  let key;
  let rest;
  if (group === 'gmail') {
    key = `gmail ${argv[1]}`;
    rest = argv.slice(2);
  } else {
    key = group;
    rest = argv.slice(1);
  }

  const handler = DISPATCH[key];
  if (!handler) {
    throw new WienerdogError(`unknown gws command: ${argv.slice(0, 2).join(' ').trim()}`);
  }

  const flags = parseFlags(rest);
  const paths = getPaths();
  // Build services lazily so `auth` (which needs no token) never loads one.
  let cached;
  const services = () => (cached || (cached = getServices(paths)));

  const result = await handler({ paths, flags, services });
  render(key, result, flags.json);
}

module.exports = { run, resolveRoutine };
