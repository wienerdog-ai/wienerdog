'use strict';

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { readAlerts } = require('../core/alerts');
const { addAcks, ackKey, readAcks } = require('../core/alert-ack');
const { defaultPrompt } = require('./grant');

/**
 * `wienerdog alerts` (list) and `wienerdog alerts ack` — the attended
 * acknowledgement of an already-seen alert in the session digest (Table C).
 * Reuses grant.js's terminal-only typed-word prompt; there is no environment
 * override and `--yes` is never honored.
 */

/** Group `alerts` by distinct (job, reason) pair, preserving first-seen order.
 *  @param {Array<{job:string, at:string, reason:string, log_hint:string}>} alerts
 *  @returns {Array<{job:string, reason:string, key:string, count:number, first:string, last:string}>} */
function groupAlerts(alerts) {
  const map = new Map();
  for (const a of alerts) {
    const key = ackKey(a.job, a.reason);
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.last = a.at;
    } else {
      map.set(key, { job: a.job, reason: a.reason, key, count: 1, first: a.at, last: a.at });
    }
  }
  return [...map.values()];
}

/** @param {{job:string, count:number, first:string, last:string}} g @param {boolean} acked @returns {string} */
function groupLine(g, acked) {
  const tag = acked ? '[acknowledged]' : '[shown in your digest]';
  const times = g.count === 1 ? `1 time, ${g.first}` : `${g.count} times, ${g.first} to ${g.last}`;
  return `${tag}  job "${g.job}" — ${times}`;
}

/**
 * `wienerdog alerts` / `wienerdog alerts ack` (Table C).
 * @param {string[]} argv  the tail after the command word
 * @param {{promptFn?:(q:string)=>Promise<string>,
 *          paths?:import('../core/paths').WienerdogPaths}} [opts]
 *   code-level test seams only (the grant.js/memory.js model); production
 *   passes none, and `--yes` is never honored.
 * @returns {Promise<void>}
 */
async function run(argv, opts = {}) {
  const promptFn = opts.promptFn || defaultPrompt;
  const paths = opts.paths || getPaths();
  const out = process.stdout;

  const sub = argv[0];
  if (sub !== undefined && sub !== 'list' && sub !== 'ack') {
    throw new WienerdogError(
      `unknown alerts subcommand "${sub}" — use \`wienerdog alerts\` or \`wienerdog alerts ack\`.`
    );
  }

  const alerts = readAlerts(paths);
  const groups = groupAlerts(alerts);
  const ackedKeys = new Set(readAcks(paths).map((r) => r.key));

  if (sub === 'ack') {
    const unacked = groups.filter((g) => !ackedKeys.has(g.key));
    if (unacked.length === 0) {
      out.write('wienerdog: nothing new to acknowledge.\n');
      return;
    }
    for (const g of unacked) {
      out.write(`${groupLine(g, false)}\n`);
      out.write(`  ${g.reason}\n`);
      out.write('\n');
    }
    const answer = await promptFn(
      'Type the word "ack" to stop showing the alert(s) above in your session digest (anything else cancels): '
    );
    if (String(answer).trim() !== 'ack') {
      out.write('wienerdog: nothing was acknowledged.\n');
      return;
    }
    const { added } = addAcks(
      paths,
      unacked.map((g) => ({ job: g.job, reason: g.reason }))
    );
    out.write(
      `wienerdog: acknowledged ${added} alert(s). They will not appear in your session digest again unless the wording of the failure changes.\n`
    );
    out.write(
      'wienerdog: the jobs keep refusing and the records stay on file — run `wienerdog alerts` to see them at any time.\n'
    );
    out.write('wienerdog: run `wienerdog sync` to re-render your session digest now.\n');
    return;
  }

  // list (sub === undefined || sub === 'list')
  if (groups.length === 0) {
    out.write('wienerdog: no alerts on record.\n');
    return;
  }
  out.write(`wienerdog: ${groups.length} distinct alert(s) on record.\n`);
  out.write('\n');
  for (const g of groups) {
    out.write(`${groupLine(g, ackedKeys.has(g.key))}\n`);
    out.write(`  ${g.reason}\n`);
    out.write('\n');
  }
  out.write(
    'Run `wienerdog alerts ack` to stop showing the ones you have already seen in your session digest.\n'
  );
  out.write('The jobs keep refusing and the records stay on file either way.\n');
}

module.exports = { run };
