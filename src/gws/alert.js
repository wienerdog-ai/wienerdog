'use strict';

const { WienerdogError } = require('../core/errors');
const { buildMime } = require('./gmail');

/**
 * gws _alert — fixed-template mail to the user's OWN address, used by the
 * run-job watchdog for fail-loud notification (WP-013). This is a built-in
 * self-grant: it needs no configured grant BECAUSE the recipient is always the
 * authenticated account itself, so it can never become an exfiltration path.
 * It accepts no recipient argument.
 */

/** Fixed preamble/footer identifying the mail as an automated Wienerdog alert. */
const PREAMBLE = 'This is an automated alert from Wienerdog, running on your own machine.';
const FOOTER =
  '— You are receiving this because Wienerdog sent it to your own account. ' +
  'No one else received it.';

/**
 * @param {{gmail:object}} services
 * @param {{subject:string, body:string}} opts
 * @returns {Promise<{sent:boolean, to:string, messageId:string}>}
 */
async function run(services, opts) {
  let self;
  try {
    const res = await services.gmail.users.getProfile({ userId: 'me' });
    self = res && res.data && res.data.emailAddress;
  } catch {
    self = null;
  }
  if (!self || !String(self).includes('@')) {
    // No fallback recipient — refusing to send is the safe outcome.
    throw new WienerdogError(
      'could not determine your Google account address — alert not sent'
    );
  }

  // The recipient is fixed to the authenticated account and never taken from
  // opts; asserting it makes the self-only invariant explicit.
  const to = self;
  if (to !== self) throw new WienerdogError('alert recipient must be the authenticated account');

  const raw = buildMime({
    to,
    subject: `[wienerdog alert] ${opts.subject}`,
    body: `${PREAMBLE}\n\n${opts.body}\n\n${FOOTER}`,
  });
  const sendRes = await services.gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  return { sent: true, to, messageId: (sendRes.data && sendRes.data.id) || '' };
}

module.exports = { run };
