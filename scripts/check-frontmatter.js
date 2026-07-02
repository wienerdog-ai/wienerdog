#!/usr/bin/env node
/**
 * Validates YAML frontmatter of every docs/specs/WP-*.md against
 * tests/schemas/spec.schema.json, and every .claude/agents/*.md against
 * tests/schemas/agent.schema.json.
 *
 * Hand-rolled frontmatter parser (no runtime YAML dependency). Supports only
 * the subset of YAML this repo actually uses: a block delimited by `---`
 * lines, containing flat `key: value` pairs and `key: [item, item]` inline
 * lists. No nesting, no multi-line scalars, no string quoting rules beyond
 * trimming whitespace. A trailing `# comment` after a value is stripped.
 *
 * Also hand-rolls a minimal JSON-schema subset validator: `required`,
 * and per-property `type` ("string" | "array"), `enum`, `pattern`.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** @param {string} text @returns {Record<string, string|string[]>|null} */
function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  /** @type {Record<string, string|string[]>} */
  const data = {};
  for (const raw of lines.slice(1, end)) {
    if (!raw.trim()) continue;
    const m = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    const hashIdx = value.indexOf('#');
    if (hashIdx !== -1) value = value.slice(0, hashIdx);
    value = value.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner === '' ? [] : inner.split(',').map((s) => s.trim());
    } else {
      data[key] = value;
    }
  }
  return data;
}

/**
 * @param {Record<string, unknown>} data
 * @param {{required?: string[], properties?: Record<string, {type?: string, enum?: string[], pattern?: string}>}} schema
 * @param {string} label
 * @returns {string[]}
 */
function validate(data, schema, label) {
  const errors = [];
  for (const req of schema.required || []) {
    if (!(req in data)) errors.push(`${label}: missing required field "${req}"`);
  }
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    if (!(key in data)) continue;
    const value = data[key];
    if (rule.type === 'array') {
      if (!Array.isArray(value)) errors.push(`${label}: field "${key}" must be an array`);
      continue;
    }
    if (rule.type === 'string' && typeof value !== 'string') {
      errors.push(`${label}: field "${key}" must be a string`);
      continue;
    }
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(`${label}: field "${key}" value "${value}" not in enum [${rule.enum.join(', ')}]`);
    }
    if (rule.pattern && typeof value === 'string' && !new RegExp(rule.pattern).test(value)) {
      errors.push(`${label}: field "${key}" value "${value}" does not match pattern ${rule.pattern}`);
    }
  }
  return errors;
}

/** @param {string} p */
function loadSchema(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** @param {string} dir @param {string} prefix @returns {string[]} */
function globFiles(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .map((f) => path.join(dir, f))
    .sort();
}

function main() {
  const root = process.cwd();
  const specSchema = loadSchema(path.join(root, 'tests/schemas/spec.schema.json'));
  const agentSchema = loadSchema(path.join(root, 'tests/schemas/agent.schema.json'));

  const specFiles = globFiles(path.join(root, 'docs/specs'), 'WP-');
  const agentFiles = globFiles(path.join(root, '.claude/agents'), '');

  /** @type {string[]} */
  const allErrors = [];

  for (const file of specFiles) {
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!fm) {
      allErrors.push(`${file}: no frontmatter found`);
      continue;
    }
    allErrors.push(...validate(fm, specSchema, file));
  }

  for (const file of agentFiles) {
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!fm) {
      allErrors.push(`${file}: no frontmatter found`);
      continue;
    }
    allErrors.push(...validate(fm, agentSchema, file));
  }

  if (allErrors.length > 0) {
    for (const e of allErrors) console.error(e);
    console.error(
      `\nfrontmatter check failed: ${allErrors.length} error(s) across ${specFiles.length} spec(s), ${agentFiles.length} agent(s)`
    );
    process.exit(1);
  }

  console.log(`frontmatter check passed: ${specFiles.length} spec(s), ${agentFiles.length} agent(s)`);
}

main();
