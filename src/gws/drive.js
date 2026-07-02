'use strict';

const { WienerdogError } = require('../core/errors');

/**
 * Drive verb functions. Each takes `(services, opts)` and returns plain data;
 * they perform no console I/O (that is index.js's job). `services` is the
 * object from getServices; tests pass a stub with just the methods used.
 * Drive access is read-only (OAuth scope `drive.readonly`): no write/upload.
 */

const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.';
const GOOGLE_DOC_MIME_TYPE = `${GOOGLE_APPS_PREFIX}document`;

/**
 * Decode file body data (Buffer or string, as returned by googleapis or a
 * test stub) to a UTF-8 string.
 * @param {Buffer|string} data
 * @returns {string}
 */
function toText(data) {
  return Buffer.isBuffer(data) ? data.toString('utf8') : String(data || '');
}

/**
 * drive search — files matching a query.
 * @param {{drive:object}} services
 * @param {{query:string, max?:number}} opts
 * @returns {Promise<Array<{id:string, name:string, mimeType:string, modifiedTime:string}>>}
 */
async function search(services, opts) {
  const res = await services.drive.files.list({
    q: opts.query,
    pageSize: opts.max || 20,
    fields: 'files(id,name,mimeType,modifiedTime)',
  });
  return (res.data && res.data.files) || [];
}

/**
 * drive read — text content of one file. Native Google Docs are exported as
 * `text/plain`; every other Google Workspace type (Sheets, Slides, ...) is
 * unsupported here. Everything else is downloaded as raw bytes and decoded.
 * @param {{drive:object}} services
 * @param {{id:string}} opts
 * @returns {Promise<{id:string, name:string, mimeType:string, text:string}>}
 */
async function read(services, opts) {
  const metaRes = await services.drive.files.get({
    fileId: opts.id,
    fields: 'id,name,mimeType',
  });
  const meta = metaRes.data || {};

  let text;
  if (meta.mimeType && meta.mimeType.startsWith(GOOGLE_APPS_PREFIX)) {
    if (meta.mimeType !== GOOGLE_DOC_MIME_TYPE) {
      throw new WienerdogError(`drive read: unsupported Google type ${meta.mimeType}`);
    }
    const exportRes = await services.drive.files.export({
      fileId: opts.id,
      mimeType: 'text/plain',
    });
    text = toText(exportRes.data);
  } else {
    const mediaRes = await services.drive.files.get({ fileId: opts.id, alt: 'media' });
    text = toText(mediaRes.data);
  }

  return { id: meta.id, name: meta.name, mimeType: meta.mimeType, text };
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
 * generic flag parser does not know `drive`'s own `--id` flag, so it arrives
 * here as a plain unconsumed token.
 * @param {string[]} tokens
 * @returns {{id?:string}}
 */
function parseVerbFlags(tokens) {
  const out = {};
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '--id') out.id = tokens[++i];
  }
  return out;
}

/**
 * `drive <verb>` entry point — index.js's dispatch table routes the whole
 * `drive` group here (`DISPATCH['drive']`), passing the parsed CLI flags with
 * the verb as `flags.positionals[0]`.
 * @param {{drive:object}} services
 * @param {{positionals:string[], max?:number}} flags
 * @returns {Promise<*>}
 */
async function run(services, flags) {
  const [verb, ...rest] = flags.positionals;
  switch (verb) {
    case 'search':
      return search(services, { query: require_(rest[0], '<query>'), max: flags.max });
    case 'read': {
      const sub = parseVerbFlags(rest);
      return read(services, { id: require_(sub.id, '--id') });
    }
    default:
      throw new WienerdogError(`unknown drive verb: ${verb || '<none>'}`);
  }
}

module.exports = { search, read, run };
