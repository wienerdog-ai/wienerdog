'use strict';

// Broker registry assembly (WP-137): pure wiring over injected deps. It
// validates arguments against each verb's exact schema, enforces per-run
// limits, gates the SEND class on the injected grant check, and dispatches to
// the verb handler with the injected `services`. It NEVER loads a credential
// (WP-138 supplies `services`) and NEVER reads config (WP-139/141 supply
// `grantCheck`). Every error it raises is fixed and secret-free — a raw
// googleapis error can echo a token or a full request URL and must never
// reach the model.

const { VERBS } = require('./verbs');
const { validate } = require('./schema');
const { createLimitsState, checkAndCount } = require('./limits');
const { CAPABILITY_CLASS } = require('./constants');
const { WienerdogError } = require('../../core/errors');

const NO_GRANT_NOTICE =
  'No send grant for this routine; the digest was NOT sent. ' +
  'The owner can grant it with: wienerdog grant';

/**
 * Build the BrokerRegistry the WP-136 server consumes.
 * @param {{ services: {gmail?:object, calendar?:object, drive?:object},
 *           routineId: string,
 *           grantCheck: (routineId: string, kind: string) => boolean,
 *           limitsState?: {counts: Map<string, number>} }} deps
 * @returns {import('./server').BrokerRegistry}
 */
function buildRegistry(deps) {
  const { services, routineId, grantCheck } = deps;
  const limitsState = deps.limitsState || createLimitsState();

  return {
    listTools() {
      return Object.values(VERBS).map((v) => ({
        name: v.name,
        description: v.description,
        inputSchema: v.inputSchema,
      }));
    },

    async callTool(name, args) {
      const verb = VERBS[name];
      if (!verb) throw new WienerdogError('unknown broker verb');

      // A verb whose backing service was not provided is unreachable by
      // construction (WP-138 supplies per-capability credentials; a missing
      // one must fail before any dispatch).
      if (!services || !services[verb.service]) {
        throw new WienerdogError(`the ${verb.service} capability is not available in this run`);
      }

      const checked = validate(verb.inputSchema, args);
      if (!checked.ok) {
        throw new WienerdogError(`invalid arguments for ${verb.name}: ${checked.error}`);
      }

      checkAndCount(limitsState, verb.name, verb.limits);

      if (verb.capabilityClass === CAPABILITY_CLASS.SEND && !grantCheck(routineId, 'send_self')) {
        // Fixed notice, zero send calls: absence of a grant is a normal,
        // visible outcome — not an error the model can retry around.
        return { content: [{ type: 'text', text: NO_GRANT_NOTICE }] };
      }

      let result;
      try {
        result = await verb.handler(services, args, { routineId });
      } catch (err) {
        // WienerdogErrors are our own fixed messages (header-injection refusal,
        // self-resolve failure); anything else may carry Google bytes — mask it.
        if (err instanceof WienerdogError) throw err;
        throw new WienerdogError(`broker verb ${verb.name} failed`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  };
}

module.exports = { buildRegistry, NO_GRANT_NOTICE };
