'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { confirm } = require('../../src/core/prompt');

/**
 * Runs fn with process.stdin replaced by a fake TTY PassThrough stream that
 * `fn` can write answers to. Restores the real process.stdin after. Needed
 * because the real process.stdin in this test environment is backed by
 * /dev/null (already at EOF), so it can't be used to simulate a live TTY.
 */
async function withFakeTTYStdin(fn) {
  const original = Object.getOwnPropertyDescriptor(process, 'stdin');
  const fake = new PassThrough();
  fake.isTTY = true;
  Object.defineProperty(process, 'stdin', { value: fake, configurable: true, writable: true });
  try {
    await fn(fake);
  } finally {
    Object.defineProperty(process, 'stdin', original);
  }
}

/** Runs fn with process.stdin.isTTY forced to `value`, restoring it after. */
async function withStdinTTY(value, fn) {
  const original = process.stdin.isTTY;
  process.stdin.isTTY = value;
  try {
    await fn();
  } finally {
    process.stdin.isTTY = original;
  }
}

/** Runs fn with WIENERDOG_PROMPT_TTY set to `value`, restoring it after. */
async function withPromptTty(value, fn) {
  const original = process.env.WIENERDOG_PROMPT_TTY;
  process.env.WIENERDOG_PROMPT_TTY = value;
  try {
    await fn();
  } finally {
    if (original === undefined) delete process.env.WIENERDOG_PROMPT_TTY;
    else process.env.WIENERDOG_PROMPT_TTY = original;
  }
}

/** Captures stderr writes made during fn(), returning them joined. */
async function captureStderr(fn) {
  const original = process.stderr.write.bind(process.stderr);
  let out = '';
  process.stderr.write = (chunk, ...rest) => {
    out += chunk.toString();
    return original(chunk, ...rest);
  };
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return out;
}

test('mode 1: stdin is a TTY -> reads from stdin', async () => {
  await withFakeTTYStdin(async (fake) => {
    const p = confirm('Proceed? ');
    fake.write('y\n');
    assert.equal(await p, true);
  });
});

test('mode 1: stdin is a TTY, non-yes answer -> false', async () => {
  await withFakeTTYStdin(async (fake) => {
    const p = confirm('Proceed? ');
    fake.write('n\n');
    assert.equal(await p, false);
  });
});

test('mode 2: not a TTY, fixture tty answers "y" -> true', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, 'y\n');
    await withPromptTty(tty, async () => {
      assert.equal(await confirm('Proceed? '), true);
    });
  });
});

test('mode 2: not a TTY, fixture tty answers "" -> false', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, '\n');
    await withPromptTty(tty, async () => {
      assert.equal(await confirm('Proceed? '), false);
    });
  });
});

test('mode 2: not a TTY, fixture tty answers "n" -> false', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, 'n\n');
    await withPromptTty(tty, async () => {
      assert.equal(await confirm('Proceed? '), false);
    });
  });
});

test('mode 2: fixture tty at EOF with no answer -> false, never hangs', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, ''); // zero bytes: stream ends before any line
    await withPromptTty(tty, async () => {
      const stderr = await captureStderr(async () => {
        assert.equal(await confirm('Proceed? '), false);
      });
      assert.match(stderr, /can't ask for confirmation here/);
    });
  });
});

test('mode 3: not a TTY, no tty reachable -> abort loudly, false', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const missing = path.join(dir, 'does-not-exist');
    await withPromptTty(missing, async () => {
      const stderr = await captureStderr(async () => {
        assert.equal(await confirm('Proceed? '), false);
      });
      assert.match(
        stderr,
        /wienerdog: can't ask for confirmation here \(no terminal\)\. Re-run with --yes to proceed non-interactively\./
      );
    });
  });
});

test('defaultYes mode 1: bare Enter -> true', async () => {
  await withFakeTTYStdin(async (fake) => {
    const p = confirm('Proceed? ', { defaultYes: true });
    fake.write('\n');
    assert.equal(await p, true);
  });
});

test('defaultYes mode 1: explicit n overrides -> false', async () => {
  await withFakeTTYStdin(async (fake) => {
    const p = confirm('Proceed? ', { defaultYes: true });
    fake.write('n\n');
    assert.equal(await p, false);
  });
});

test('defaultYes mode 2: fixture empty line -> true', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, '\n');
    await withPromptTty(tty, async () => {
      assert.equal(await confirm('Proceed? ', { defaultYes: true }), true);
    });
  });
});

test('defaultYes mode 2: fixture "n" -> false', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, 'n\n');
    await withPromptTty(tty, async () => {
      assert.equal(await confirm('Proceed? ', { defaultYes: true }), false);
    });
  });
});

test('defaultYes does NOT rescue mode 2 EOF (zero bytes) -> false + loud abort', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, ''); // stream ends before any line: EOF, not a bare Enter
    await withPromptTty(tty, async () => {
      const stderr = await captureStderr(async () => {
        assert.equal(await confirm('Proceed? ', { defaultYes: true }), false);
      });
      assert.match(stderr, /can't ask for confirmation here/);
    });
  });
});

test('defaultYes does NOT rescue mode 3 (no tty) -> false + loud abort', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const missing = path.join(dir, 'does-not-exist');
    await withPromptTty(missing, async () => {
      const stderr = await captureStderr(async () => {
        assert.equal(await confirm('Proceed? ', { defaultYes: true }), false);
      });
      assert.match(stderr, /can't ask for confirmation here \(no terminal\)/);
    });
  });
});

test('regression: no opts still defaults to no on an empty line', async () => {
  await withStdinTTY(false, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-prompt-'));
    const tty = path.join(dir, 'tty');
    fs.writeFileSync(tty, '\n');
    await withPromptTty(tty, async () => {
      assert.equal(await confirm('Proceed? '), false);
    });
  });
});
