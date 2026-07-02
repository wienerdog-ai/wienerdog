'use strict';

const readline = require('node:readline');
const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const grantLib = require('../gws/grant');

/**
 * `wienerdog grant send` — the ONLY way a send grant is created (ADR-0007).
 * The typed-word confirmation is the security boundary: it is driven by real
 * stdin and `--yes` does NOT bypass it, so no skill, hook, dream, or headless
 * job (nothing scriptable via `--yes`) can mint or widen a grant.
 */

/**
 * Default prompt: read one line from stdin. Injectable so the CLI is unit
 * testable without a real TTY.
 * @param {string} question
 * @returns {Promise<string>}
 */
function defaultPrompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Parse `--routine <name>` and `--to <csv>` out of an argv tail. Unknown flags
 * (including `--yes`) are ignored — `--yes` must never bypass the confirmation.
 * @param {string[]} argv
 * @returns {{routine:string|null, to:string|null}}
 */
function parseArgs(argv) {
  const out = { routine: null, to: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--routine') out.routine = argv[++i];
    else if (argv[i] === '--to') out.to = argv[++i];
  }
  return out;
}

/**
 * Basic address sanity: exactly one `@` and a dot after it (not last char).
 * @param {string} addr
 * @returns {boolean}
 */
function looksLikeAddress(addr) {
  const at = addr.indexOf('@');
  if (at <= 0 || addr.indexOf('@', at + 1) !== -1) return false;
  const dot = addr.indexOf('.', at);
  return dot > at + 1 && dot < addr.length - 1;
}

/**
 * Best-effort lookup of the authenticated Google address, to decide whether a
 * recipient is the user's own account. Never throws and never fails the grant:
 * if no token/profile is available, returns null and all recipients are treated
 * as third-party (and warned about).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {Promise<string|null>}
 */
async function authenticatedAddress(paths) {
  try {
    const client = require('../gws/client');
    client.loadToken(paths); // throws if no token — keeps us fully offline then
    const services = client.getServices(paths);
    const res = await services.gmail.users.getProfile({ userId: 'me' });
    return (res && res.data && res.data.emailAddress) || null;
  } catch {
    return null;
  }
}

/**
 * `wienerdog grant send --routine <name> --to <a@b>[,<c@d>...]`.
 * @param {string[]} argv
 * @param {{promptFn?:(q:string)=>Promise<string>,
 *          paths?:import('../core/paths').WienerdogPaths}} [opts] injection seam
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const promptFn = opts.promptFn || defaultPrompt;
  const paths = opts.paths || getPaths();

  const verb = argv[0];
  if (verb !== 'send') {
    throw new WienerdogError(`unknown grant command '${verb || ''}' — only 'send' is supported`);
  }

  const parsed = parseArgs(argv.slice(1));
  if (!parsed.routine) throw new WienerdogError('missing required flag --routine');
  if (!parsed.to) throw new WienerdogError('missing required flag --to');
  const recipients = parsed.to.split(',').map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) throw new WienerdogError('missing required flag --to');
  for (const r of recipients) {
    if (!looksLikeAddress(r)) throw new WienerdogError(`not a valid email address: ${r}`);
  }

  const self = await authenticatedAddress(paths);
  const thirdParty = recipients.filter(
    (r) => !self || r.toLowerCase() !== self.toLowerCase()
  );

  const out = process.stdout;
  out.write(`You are about to let the "${parsed.routine}" routine SEND email to:\n`);
  for (const r of recipients) out.write(`  - ${r}\n`);
  out.write('Anything this routine emails will go to those addresses without further prompting.\n');
  if (thirdParty.length > 0) {
    out.write('These are third-party addresses; email sent here leaves your control.\n');
  }

  const answer = await promptFn('Type the word "grant" to confirm (anything else cancels): ');
  if (String(answer).trim() !== 'grant') {
    out.write('Cancelled.\n');
    return;
  }

  grantLib.saveGrant(paths, { routine: parsed.routine, to: recipients });
  out.write(`wienerdog: granted "${parsed.routine}" → ${recipients.join(', ')}.\n`);
}

module.exports = { run };
