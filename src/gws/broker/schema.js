'use strict';

// Tiny hand-rolled JSON-shape validator for broker verb arguments (WP-137).
// Zero-dep by design (no ajv): it supports ONLY what the frozen verb schemas
// use and throws on anything else — an unknown schema keyword is a programmer
// error, never something to silently skip (fail closed).
//
// Error strings name the offending FIELD and rule, never the offending VALUE:
// argument values are model-supplied and must not round-trip through errors.

const KEY_SPEC_KEYWORDS = new Set(['type', 'maxLength', 'minLength', 'min', 'max', 'pattern']);

/** @param {string} name @returns {string} field name capped for error strings */
function safeName(name) {
  return String(name).slice(0, 64);
}

/**
 * Validate `value` against a verb input schema:
 * `{type:'object', additionalProperties:false, required:[...], properties:{...}}`
 * where each property spec is `{type:'string'|'integer'|'boolean', maxLength?,
 * minLength?, min?, max?, pattern?}` and every `pattern` is anchored (`^...$`).
 *
 * @param {object} schema
 * @param {*} value
 * @returns {{ok: boolean, error?: string}}
 */
function validate(schema, value) {
  if (
    !schema ||
    schema.type !== 'object' ||
    schema.additionalProperties !== false ||
    !Array.isArray(schema.required) ||
    schema.properties === null ||
    typeof schema.properties !== 'object'
  ) {
    throw new Error('broker schema must be an exact object schema (additionalProperties:false)');
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'arguments must be an object' };
  }

  for (const key of Object.keys(value)) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
      return { ok: false, error: `unexpected field "${safeName(key)}"` };
    }
  }
  for (const key of schema.required) {
    if (value[key] === undefined) return { ok: false, error: `missing required field "${safeName(key)}"` };
  }

  for (const [key, spec] of Object.entries(schema.properties)) {
    for (const kw of Object.keys(spec)) {
      if (!KEY_SPEC_KEYWORDS.has(kw)) {
        throw new Error(`unsupported schema keyword "${kw}" on field "${safeName(key)}"`);
      }
    }
    const v = value[key];
    if (v === undefined) continue;

    if (spec.type === 'string') {
      if (typeof v !== 'string') return { ok: false, error: `field "${safeName(key)}" must be a string` };
      if (spec.maxLength !== undefined && Buffer.byteLength(v, 'utf8') > spec.maxLength) {
        return { ok: false, error: `field "${safeName(key)}" exceeds ${spec.maxLength} bytes` };
      }
      if (spec.minLength !== undefined && v.length < spec.minLength) {
        return { ok: false, error: `field "${safeName(key)}" is too short` };
      }
      if (spec.pattern !== undefined) {
        if (!spec.pattern.startsWith('^') || !spec.pattern.endsWith('$')) {
          throw new Error(`schema pattern for "${safeName(key)}" must be anchored`);
        }
        if (!new RegExp(spec.pattern).test(v)) {
          return { ok: false, error: `field "${safeName(key)}" has an invalid format` };
        }
      }
    } else if (spec.type === 'integer') {
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        return { ok: false, error: `field "${safeName(key)}" must be an integer` };
      }
      if (spec.min !== undefined && v < spec.min) return { ok: false, error: `field "${safeName(key)}" is below ${spec.min}` };
      if (spec.max !== undefined && v > spec.max) return { ok: false, error: `field "${safeName(key)}" is above ${spec.max}` };
    } else if (spec.type === 'boolean') {
      if (typeof v !== 'boolean') return { ok: false, error: `field "${safeName(key)}" must be a boolean` };
    } else {
      throw new Error(`unsupported schema type "${spec.type}" on field "${safeName(key)}"`);
    }
  }

  return { ok: true };
}

module.exports = { validate };
