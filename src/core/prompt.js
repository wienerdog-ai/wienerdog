'use strict';

const fs = require('node:fs');
const readline = require('node:readline');

const NO_TTY_MESSAGE =
  "wienerdog: can't ask for confirmation here (no terminal). Re-run with --yes to proceed non-interactively.";

/** @param {string} answer @returns {boolean} */
function isYes(answer) {
  return /^y(es)?$/i.test(answer.trim());
}

/** @param {string} answer @param {boolean} defaultYes @returns {boolean} */
function interpret(answer, defaultYes) {
  return answer.trim() === '' ? defaultYes === true : isYes(answer);
}

/**
 * Ask one yes/no question over a given input/output pair.
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @param {string} question
 * @param {() => void} closeInput Releases the input stream once done (fd cleanup).
 * @param {(() => void)|undefined} onEof Called if input closes with no answer given.
 * @param {boolean} [defaultYes] When true, an *answered* empty line (bare Enter)
 *   resolves true instead of false. Never affects the onEof path.
 * @returns {Promise<boolean>}
 */
function ask(input, output, question, closeInput, onEof, defaultYes) {
  const rl = readline.createInterface({ input, output });
  // readline re-emits input stream errors on the Interface itself; without a
  // listener here that would crash the process. The input's own 'error'
  // listener (attached by the caller) is what actually drives the abort.
  rl.on('error', () => {});
  let answered = false;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      closeInput();
      resolve(interpret(answer, defaultYes));
    });
    rl.on('close', () => {
      if (!answered) {
        closeInput();
        if (onEof) onEof();
      }
    });
  });
}

/**
 * Ask a yes/no confirmation question, choosing the right input source so the
 * prompt still works when stdin is not a terminal (e.g. curl | bash | npx
 * wienerdog init leaves stdin at EOF). Mirrors install.sh's
 * tty_reachable/consent_run rule:
 *   1. stdin is a TTY            -> read from stdin, prompt on stdout (as before).
 *   2. else /dev/tty is openable -> read from /dev/tty, prompt on stderr so
 *                                    stdout stays clean for piped consumers.
 *   3. neither                   -> abort loudly on stderr; never proceed, never
 *                                    exit silently.
 * WIENERDOG_PROMPT_TTY overrides the '/dev/tty' path for tests (mirrors
 * install.sh's WIENERDOG_TTY test seam).
 * @param {string} question
 * @param {{defaultYes?: boolean}} [opts] When opts.defaultYes is true, an
 *   *answered* empty line (bare Enter) resolves true. Default (omitted/false)
 *   keeps the historical default-no for every existing caller. defaultYes NEVER
 *   changes an abort path: EOF / stream-close with no answer (mode 1 & 2) and the
 *   no-terminal case (mode 3) still resolve false regardless of defaultYes.
 * @returns {Promise<boolean>}
 */
function confirm(question, opts) {
  const defaultYes = !!(opts && opts.defaultYes);

  if (process.stdin.isTTY) {
    // EOF (Ctrl-D) at an interactive prompt resolves false — never hangs.
    return new Promise((resolve) => {
      ask(process.stdin, process.stdout, question, () => {}, () => resolve(false), defaultYes).then(resolve);
    });
  }

  return new Promise((resolve) => {
    const ttyPath = process.env.WIENERDOG_PROMPT_TTY || '/dev/tty';
    const input = fs.createReadStream(ttyPath);
    let settled = false;

    const abort = () => {
      if (settled) return;
      settled = true;
      input.destroy();
      console.error(NO_TTY_MESSAGE);
      resolve(false);
    };

    input.once('error', abort);

    ask(input, process.stderr, question, () => input.destroy(), abort, defaultYes).then((answer) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    });
  });
}

module.exports = { confirm };
