'use strict';

const { spawnSync } = require('node:child_process');

// Cheap second-model grader: does a synthesized note reference only events
// present in the transcripts, or did the dream brain hallucinate memory?
// Spawns the Claude Code CLI (`claude -p --model haiku`) — this is a CLI
// invocation, not SDK code (ADR-0004: no new runtime dependency, no daemon).

const RUBRIC_PROMPT = [
  'You are grading whether a synthesized memory note is grounded in a set of transcripts.',
  '',
  'Does this note reference ONLY events, facts, or preferences that are present in the',
  'provided transcripts? Answer YES or NO on the first line, then one sentence of',
  'justification.',
].join('\n');

/**
 * Ask a cheap model whether a synthesized note is grounded in the transcripts.
 * @param {string} noteText          the note's body (frontmatter may be stripped)
 * @param {string} transcriptsText   the concatenated plain text of all fixtures
 * @returns {Promise<{pass:boolean, explanation:string}>}
 */
async function gradeNote(noteText, transcriptsText) {
  const prompt = [RUBRIC_PROMPT, '', '## Transcripts', transcriptsText, '', '## Note', noteText].join('\n');

  const graderEnv = { ...process.env };
  delete graderEnv.ANTHROPIC_API_KEY; // ADR-0009: subscription only, never a key

  let res;
  try {
    res = spawnSync('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json'], {
      encoding: 'utf8',
      timeout: 120000,
      env: graderEnv,
    });
  } catch (err) {
    return { pass: false, explanation: `grader error: failed to spawn claude CLI: ${err.message}` };
  }

  if (res.error) {
    return { pass: false, explanation: `grader error: ${res.error.message}` };
  }
  if (res.status !== 0) {
    return { pass: false, explanation: `grader error: claude -p exited ${res.status}: ${(res.stderr || '').trim()}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch (err) {
    return { pass: false, explanation: `grader error: unparseable JSON output: ${err.message}` };
  }

  if (parsed.is_error) {
    return { pass: false, explanation: `grader error: claude reported is_error: ${JSON.stringify(parsed.result)}` };
  }

  const answer = String(parsed.result || '').trim();
  const firstLine = (answer.split('\n')[0] || '').trim().toUpperCase();
  if (firstLine.startsWith('YES')) {
    return { pass: true, explanation: answer };
  }
  if (firstLine.startsWith('NO')) {
    return { pass: false, explanation: answer };
  }
  return { pass: false, explanation: `grader error: unparseable verdict (expected leading YES/NO): ${JSON.stringify(answer)}` };
}

module.exports = { gradeNote };
