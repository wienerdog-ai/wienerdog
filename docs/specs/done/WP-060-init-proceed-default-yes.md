---
id: WP-060
title: init "Proceed?" defaults to yes (per-call defaultYes in shared confirm)
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0011]
branch: wp/060-init-proceed-default-yes
---

# WP-060: init "Proceed?" defaults to yes (per-call defaultYes in shared confirm)

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack": a one-line install that writes
config files into a user's Claude Code / Codex setup. It is **just files** — no
daemons, no telemetry (ADR-0004). This WP is a small CLI UX fix, nothing more.

`wienerdog init` creates the canonical core (`~/.wienerdog`). It first prints a
plan (which directories/files it will create, which AI tools it detected), then
asks the user to confirm before writing anything. Today that confirmation prints
`Proceed? [y/N]` and defaults to **No**: pressing Enter on an empty line aborts.
The owner ran the real install and reports that users expect **Enter = yes** for
a plan they just asked for; default-No generates needless "nothing happened, let
me re-run" churn. We are flipping **only init's Proceed prompt** to default-yes
(`[Y/n]`, Enter proceeds).

This aligns init with the trust posture already in force elsewhere: ADR-0011
(the curl-installer consent engine) made every dependency-install hop prompt
`[Y/n]` with **default yes** on the controlling terminal — Enter proceeds. That
default-yes is the established Wienerdog norm for "you asked to install; confirm
you still want to." init's own plan-confirmation is the same shape, so aligning
it is consistent, not a new policy (no new ADR needed).

**The shared-function trap (read carefully).** init calls a shared helper
`confirm(question)` in `src/core/prompt.js`. That **same** helper is also called
by `wienerdog uninstall` for its **destructive** `Proceed with removal? [y/N]`
prompt. Making the helper default-yes for everyone would mean an accidental Enter
**deletes a user's install** — unacceptable. Therefore the change is strictly
**per-call**: `confirm` grows an options argument whose `defaultYes` is **false
by default** (every existing caller is byte-for-byte unchanged), and **only**
init's Proceed prompt opts in. `uninstall` stays default-no, untouched.

(For the record: `wienerdog adopt` has four confirmations, but it uses its **own
local** `confirm` defined inside `src/cli/adopt.js` — it does **not** import
`src/core/prompt`. So adopt is unaffected by this change and is out of scope.
Do not touch adopt.js.)

**Safety invariants that must survive.** `confirm` has three input modes
(mirroring install.sh, per ADR-0011/WP-034): (1) stdin is a TTY → read stdin;
(2) stdin is not a TTY but `/dev/tty` (or the `WIENERDOG_PROMPT_TTY` test seam) is
openable → read that, prompt on stderr; (3) neither → **abort loudly** on stderr
(`can't ask for confirmation here (no terminal)`) and resolve false. `defaultYes`
changes **only** the interactive case where the user submitted an **empty line
(bare Enter)**. It must **never** make a no-terminal (mode 3) or a stream-closed /
EOF context proceed — those still abort and resolve false regardless of
`defaultYes`. And `--yes` still bypasses `confirm` entirely (unchanged).

## Current state

`src/core/prompt.js` (full current shape of the two functions you edit):

```js
/** @param {string} answer @returns {boolean} */
function isYes(answer) {
  return /^y(es)?$/i.test(answer.trim());
}

function ask(input, output, question, closeInput, onEof) {
  const rl = readline.createInterface({ input, output });
  rl.on('error', () => {});
  let answered = false;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      closeInput();
      resolve(isYes(answer));
    });
    rl.on('close', () => {
      if (!answered) {
        closeInput();
        if (onEof) onEof();
      }
    });
  });
}

function confirm(question) {
  if (process.stdin.isTTY) {
    return new Promise((resolve) => {
      ask(process.stdin, process.stdout, question, () => {}, () => resolve(false)).then(resolve);
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
    ask(input, process.stderr, question, () => input.destroy(), abort).then((answer) => {
      if (settled) return;
      settled = true;
      resolve(answer);
    });
  });
}

module.exports = { confirm };
```

Key detail: the **empty answered line** goes through `rl.question`'s callback
(`answered = true`); the **EOF / stream-close with no answer** goes through
`rl.on('close')` → `onEof` (mode 1 resolves false; modes 2/3 `abort` → false).
These are two distinct paths — the whole design rests on keeping them distinct.

`src/cli/init.js:117` is the only caller you change:

```js
  if (!yes) {
    const ok = await confirm('\nProceed? [y/N] ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }
```

`src/cli/uninstall.js:53` calls `confirm('\nProceed with removal? [y/N] ')` — **do
not touch it**; verify it still compiles against the new signature (it passes no
opts, so it keeps default-no).

Existing tests: `tests/unit/prompt.test.js` drives `confirm` across all three
modes via `withFakeTTYStdin`, `withStdinTTY`, `withPromptTty`, `captureStderr`
helpers (already in the file — reuse them). `tests/unit/init.test.js` runs the
CLI in an isolated temp `HOME` via a `run(args, env)` helper and `tempEnv()`; all
existing init tests pass `--yes`, so none exercises the interactive prompt.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/prompt.js | `confirm(question, opts)` gains per-call `opts.defaultYes` (default false); thread it through `ask`; empty **answered** line → `defaultYes` |
| modify | src/cli/init.js | line 117 only: `confirm('\nProceed? [Y/n] ', { defaultYes: true })` |
| modify | tests/unit/prompt.test.js | add the defaultYes cases below (append; reuse existing helpers) |
| modify | tests/unit/init.test.js | add the two integration cases below (add `spawnSync` to the child_process require) |

Do NOT touch `src/cli/uninstall.js` or `src/cli/adopt.js`. Do NOT change the
`module.exports` surface (still `{ confirm }`).

### Exact contracts

New `confirm` signature (JSDoc must say the invariant):

```js
/**
 * @param {string} question
 * @param {{defaultYes?: boolean}} [opts] When opts.defaultYes is true, an
 *   *answered* empty line (bare Enter) resolves true. Default (omitted/false)
 *   keeps the historical default-no for every existing caller. defaultYes NEVER
 *   changes an abort path: EOF / stream-close with no answer (mode 1 & 2) and the
 *   no-terminal case (mode 3) still resolve false regardless of defaultYes.
 * @returns {Promise<boolean>}
 */
function confirm(question, opts)
```

Interpretation helper (reuse `isYes` for the non-empty case):

```js
/** @param {string} answer @param {boolean} defaultYes @returns {boolean} */
function interpret(answer, defaultYes) {
  return answer.trim() === '' ? defaultYes === true : isYes(answer);
}
```

Thread `defaultYes` through `ask` (new trailing param, default false) and call
`resolve(interpret(answer, defaultYes))` in the `rl.question` callback. Do **not**
change the `rl.on('close')` / `onEof` path — that is the EOF/abort path and must
stay `defaultYes`-independent. In `confirm`, compute
`const defaultYes = !!(opts && opts.defaultYes);` and pass it to both `ask` calls
(mode 1 and mode 2). The mode-3 `abort` and the mode-1 `onEof` still resolve
false.

Behaviour table (this is the contract — the tests below assert every row):

| Mode | Input event | defaultYes=false (default) | defaultYes=true |
|------|-------------|----------------------------|-----------------|
| 1 TTY | user types `y`/`yes` + Enter | true | true |
| 1 TTY | user types `n` + Enter | false | **false** (explicit n overrides) |
| 1 TTY | bare Enter (empty answered line) | false | **true** |
| 1 TTY | Ctrl-D / EOF, no answer | false | **false** |
| 2 tty-file | line is `n` | false | false |
| 2 tty-file | line is empty (`"\n"`) | false | **true** |
| 2 tty-file | stream at EOF, no line (`""`) | false + loud abort | **false + loud abort** |
| 3 no tty | device unopenable | false + loud abort | **false + loud abort** |

init caller (exact new line 117):

```js
    const ok = await confirm('\nProceed? [Y/n] ', { defaultYes: true });
```

Note the label flips `[y/N]` → `[Y/n]` to reflect the new default. In modes 2/3
this prompt is written to **stderr** (not stdout) — the tests assert accordingly.

### prompt.test.js — cases to append (reuse existing helpers)

```js
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
```

### init.test.js — integration cases to add

Change the require to `const { execFileSync, spawnSync } = require('node:child_process');`
and add these two tests. They use `spawnSync` (not the shared `run`) so stdin is
`ignore` — a deterministic non-TTY at EOF — and set the `WIENERDOG_PROMPT_TTY`
seam to a fixture, so `confirm` takes mode 2 (prompt on stderr) regardless of how
`npm test` was launched:

```js
test('init without --yes proceeds on bare Enter (defaultYes wired)', () => {
  const { root, core, env } = tempEnv();
  const tty = path.join(root, 'answer');
  fs.writeFileSync(tty, '\n'); // empty answered line
  const r = spawnSync('node', [bin, 'init'], {
    env: { ...env, WIENERDOG_PROMPT_TTY: tty },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Proceed\? \[Y\/n\]/); // label shown, on stderr in mode 2
  assert.doesNotMatch(r.stdout, /Aborted\./);
  assert.match(r.stdout, /core installed/); // it actually installed
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')));
});

test('init without --yes aborts on explicit n', () => {
  const { root, core, env } = tempEnv();
  const tty = path.join(root, 'answer');
  fs.writeFileSync(tty, 'n\n');
  const r = spawnSync('node', [bin, 'init'], {
    env: { ...env, WIENERDOG_PROMPT_TTY: tty },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(r.stdout, /Aborted\./);
  assert.ok(!fs.existsSync(path.join(core, 'config.yaml')));
});
```

(If `config.yaml` turns out to live at a different basename under `WIENERDOG_HOME`,
the `stdout` markers `core installed` / `Aborted.` are the binding assertions;
keep the file-existence check aligned with `getPaths().config`'s basename — do not
invent a new path.)

## Implementation notes & constraints

- Zero new deps; plain Node ≥ 18; JSDoc types only (CLAUDE.md).
- The **only** behavioural change is init's Proceed prompt. `uninstall`'s prompt
  and adopt's local prompt keep default-no. If you find yourself editing
  uninstall.js or adopt.js, stop — that is out of scope and the boundary CI will
  reject it.
- Keep `isYes` as-is and reuse it; `interpret` only adds the empty→defaultYes
  branch. Do not broaden the yes-regex.
- When uncertain, choose the simpler option and record it under "Decisions made"
  in the PR. Do NOT expand scope.

## Acceptance criteria

- [ ] `confirm(q)` (no opts) behaves exactly as before for every mode (regression
      test green).
- [ ] `confirm(q, { defaultYes: true })`: bare Enter (mode 1 and mode 2) → true;
      explicit `n` → false; explicit `y` → true.
- [ ] `defaultYes` does **not** make mode-2 EOF or mode-3 no-tty proceed — both
      still resolve false and print the loud abort message.
- [ ] `wienerdog init` (no `--yes`) proceeds on bare Enter and shows `[Y/n]`;
      aborts on explicit `n`.
- [ ] `uninstall` still compiles and prompts `[y/N]` / default-no (unchanged).
- [ ] Running init twice is still idempotent (unchanged path).

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Changing `uninstall`'s prompt or default (stays destructive-safe, default-no).
- Touching `adopt.js`'s local `confirm` or any of its four prompts (WP-026/029).
- Any README/docs edits describing the prompt (a wd-docs follow-up if wanted).
- Adding a global config toggle for the default (not requested).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/060-init-proceed-default-yes`; conventional commits; PR titled
   `feat(cli): init Proceed defaults to yes (WP-060)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
