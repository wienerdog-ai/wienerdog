'use strict';

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { CAPABILITY_CLASS } = require('./broker/constants');
const { ensureGoogleReady } = require('./deps');
const { requireCapability, CAPABILITY } = require('../core/safety-profile');

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
 * Resolve the routine for a grant lookup (currently `cal add-event`'s
 * calendar_write grant): `--routine` flag, else `WIENERDOG_JOB` env, else
 * null. Never invents a routine — absent everywhere means null, which the
 * grant check treats as ungranted (the verb is not run).
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
 * @type {Record<string, (ctx:{paths:object, flags:object})=>Promise<*>>}
 */
const DISPATCH = {
  'auth': ({ paths, flags }) =>
    require('./auth').run(paths, { clientPath: require_(flags.client, '--client') }),
  // Since WP-140 `cal` gets NO generic full-scope services: the calendar
  // bridge selects a least-scope credential per verb (READ for list/show,
  // CALENDAR_WRITE + a calendar_write grant for add-event).
  'cal': ({ paths, flags }) =>
    require('./calendar').run(
      {
        paths,
        routine: resolveRoutine(flags),
        servicesFor: (cls) => require('./client').getServicesForClass(paths, cls),
      },
      flags
    ),
  // The fail-loud watchdog email resolves its credential via the least-scope
  // SEND class (never the retired combined-token getServices).
  '_alert': ({ paths, flags }) => {
    // getProfile needs a read scope (gmail.send cannot getProfile — Google API):
    // resolve the self-address under READ, send under SEND. The composite keeps
    // alert.run's services.gmail.users.{getProfile,messages.send} shape unchanged
    // and keeps SEND send-only (WP-gws-getprofile-via-read).
    const client = require('./client');
    const read = client.getServicesForClass(paths, CAPABILITY_CLASS.READ);
    const send = client.getServicesForClass(paths, CAPABILITY_CLASS.SEND);
    const services = {
      gmail: {
        users: {
          getProfile: (p) => read.gmail.users.getProfile(p),
          messages: { send: (p) => send.gmail.users.messages.send(p) },
        },
      },
    };
    return require('./alert').run(services, { subject: flags.subject, body: flags.body });
  },
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
  if (key === 'auth') {
    const who = result.email ? ` as ${result.email}` : '';
    process.stdout.write(`Connected to Google${who}. Token saved to ${result.tokenPath}.\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

/**
 * `wienerdog gws <group> <verb> [flags]`.
 * @param {string[]} argv
 * @param {{profile?: Record<string,string>}} [opts] `opts.profile` is a code
 *   seam for tests only (never derived from env/argv); production callers
 *   (`bin/wienerdog.js`) pass nothing, so the frozen A0 profile applies.
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
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

  // A0 pre-use freeze (WP-109): connecting Google and using Google credentials are
  // disabled until the P0 security gates close. Fail closed HERE — before any token
  // load, googleapis install, or OAuth browser socket. opts.profile is a code seam
  // for tests only (never env/argv).
  requireCapability(key === 'auth' ? CAPABILITY.GOOGLE_SETUP : CAPABILITY.GWS_USE, opts.profile);

  const flags = parseFlags(rest);
  const paths = getPaths();
  // Self-heal the on-demand googleapis install (BUG-gws-deps-missing): a user who
  // connected Google before WP-047's deps-dir scheme has a valid token but no
  // app/deps, so every read dead-ends. Install it once, with consent, on first
  // read — never for `auth` (it installs deps itself), and a no-op for unauthed
  // users (getServices then surfaces the connect-Google flow). WP-102.
  if (key !== 'auth') await ensureGoogleReady(paths);

  const result = await handler({ paths, flags });
  render(key, result, flags.json);
}

module.exports = { run, resolveRoutine };
