'use strict';

const fs = require('node:fs');

const { WienerdogError } = require('../errors');

/**
 * Read one top-level scalar from a config.yaml body. Minimal line-based reader
 * (no YAML dependency — same approach the digest renderer used in WP-005): only
 * matches un-indented `key: value` lines, ignores comments and blanks, strips a
 * single layer of surrounding quotes. Returns null when the key is absent.
 * @param {string} body
 * @param {string} key
 * @returns {string|null}
 */
function readScalar(body, key) {
  const lines = body.split('\n');
  for (const line of lines) {
    // Top-level only: no leading whitespace (nested keys are ignored).
    if (/^\s/.test(line)) continue;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match || match[1] !== key) continue;
    let value = match[2].trim();
    // Drop an inline comment on unquoted values.
    if (value !== '' && value[0] !== '"' && value[0] !== "'") {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (
      value.length >= 2 &&
      ((value[0] === '"' && value[value.length - 1] === '"') ||
        (value[0] === "'" && value[value.length - 1] === "'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

/**
 * Read the vault path and optional dream knobs from config.yaml.
 * The three `dream_*` keys are OPTIONAL top-level scalars; absent → default.
 * Defaults: `dream_timeout_minutes` 20, `dream_max_input_bytes` 8_000_000
 * (raised from 400_000 per ADR-0012 amendment — provisional, revisitable),
 * `dream_model` null.
 * @param {string} configFile  paths.config
 * @returns {{vault:string, timeoutMs:number, maxInputBytes:number, model:string|null}}
 */
function readDreamConfig(configFile) {
  let body = '';
  try {
    body = fs.readFileSync(configFile, 'utf8');
  } catch {
    body = '';
  }

  const vault = readScalar(body, 'vault');
  if (vault === null || vault === '') {
    throw new WienerdogError('no vault configured — run: npx wienerdog init');
  }

  const timeoutMinutes = Number(readScalar(body, 'dream_timeout_minutes'));
  const maxInput = Number(readScalar(body, 'dream_max_input_bytes'));
  const model = readScalar(body, 'dream_model');

  return {
    vault,
    timeoutMs: (Number.isFinite(timeoutMinutes) && timeoutMinutes > 0 ? timeoutMinutes : 20) * 60_000,
    maxInputBytes: Number.isFinite(maxInput) && maxInput > 0 ? maxInput : 8_000_000,
    model: model && model !== '' ? model : null,
  };
}

module.exports = { readDreamConfig };
