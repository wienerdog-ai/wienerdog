---
id: WP-030
title: Drop a note's leading H1 in digest compaction; show both adopt invocation forms in setup
status: Ready
model: sonnet
size: S
depends_on: [WP-022]
adrs: [ADR-0010]
branch: wp/030-digest-h1-and-adopt-invocation
---

# WP-030: Digest H1 compaction + setup-skill adopt invocation wording

## Context (read this, nothing else)

The **digest** is the pre-rendered SessionStart context file
(`~/.wienerdog/state/digest.md`): identity notes + active projects + the newest
daily-log summary, injected at the start of every session so the AI knows the
user. It is built deterministically (no model calls) by `renderDigest()` in
`src/core/digest.js`. For each identity note it emits its **own** section header
(`## Preferences`, `## Goals`, …) and then appends the note body run through a
`compact()` pass that strips frontmatter, drops empty-section headings, and
collapses blank runs.

**Bug.** A user's identity note is itself a normal markdown file that opens with
its own H1 title, e.g. `# Preferences`. When that H1 has content **directly under
it** (no intervening H2), `compact()` keeps the H1 — so the digest renders the
title twice, once as the injected section header and once as the note's own H1:

```
## Preferences
# Preferences
Direct and concise. Lead with the recommendation…
```

Today's fixtures happen to hide this: every fixture identity note puts an H2
(`## Role`, `## Communication`, …) immediately under its H1, so the H1's section
is empty and the existing "drop empty-section heading" rule removes it. A real
vault whose notes carry prose directly under the H1 shows the double heading.
The fix: `compact()` drops a **single leading H1** from the body up front,
regardless of whether that H1 has direct content.

**Second, unrelated wording fix (same setup surface).** The `/wienerdog-setup`
skill tells power users adopting an existing vault to run `wienerdog adopt
<path>`. But `wienerdog` is only on `PATH` **after** an npm install; before the
npm release the maintainer runs Wienerdog from a cloned repo, where the real
invocation is `node <repo>/bin/wienerdog.js adopt <path>`. The skill should
present **both** forms so a from-repo user is not stuck.

**Product invariant (ADR-0004): Wienerdog is just files.** This WP only changes a
pure string transform and skill prose — no process, no daemon, no telemetry.

## Current state

`src/core/digest.js`, `compact()` (lines ~66–101), verbatim:

```js
/** @param {string} line @returns {boolean} */
function isHeading(line) {
  return /^#{1,6}\s/.test(line);
}

/**
 * Compact a note body: drop the frontmatter (already removed by caller), drop
 * headings whose section has no non-blank content (this also removes the
 * document's `# Title`, which has no direct content), collapse runs of blank
 * lines to one, and trim leading/trailing blank lines.
 * @param {string} body @returns {string}
 */
function compact(body) {
  const lines = body.split('\n');
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (isHeading(lines[i])) {
      const heading = lines[i];
      let j = i + 1;
      /** @type {string[]} */
      const section = [];
      while (j < lines.length && !isHeading(lines[j])) {
        section.push(lines[j]);
        j++;
      }
      if (section.some((l) => l.trim() !== '')) out.push(heading, ...section);
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}
```

`renderDigest()` calls `compact(note.body)` after the caller has already stripped
frontmatter, and prepends a fixed header per identity file
(`## Preferences`, etc.).

`skills/wienerdog-setup/SKILL.md`, Step 3, option 3 (lines ~88–94) currently:

> **Adopt it in place** (power users) — … tell them to finish or exit this setup
> and run `wienerdog adopt <path-to-their-vault>` from the terminal. That command
> checks the prerequisites …

The structural test `tests/unit/setup-skill-structure.test.js` asserts (line 35)
`text.includes('wienerdog adopt')` and (line 34) `lower.includes('adopt it in
place')` — both survive the new wording (the npm form still contains
`wienerdog adopt`, the option title is unchanged).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | in `compact()`, drop a single leading H1 up front, before the empty-section loop. |
| modify | skills/wienerdog-setup/SKILL.md | Step 3 option 3: present both adopt invocation forms (npm + from-repo). |
| modify | tests/unit/digest.test.js | add a regression test: an identity note whose H1 has direct content renders no duplicate H1. |
| modify | tests/unit/setup-skill-structure.test.js | add one assertion that the from-repo invocation form is present. |

Do **not** touch any golden. In particular
`tests/golden/digest-default.md` **must stay byte-for-byte identical** (see
"Golden impact" below); if your change alters it, your implementation is wrong.

### Exact contract — the `compact()` change

Add this as the FIRST operation in `compact()`, before `out`/loop:

```js
function compact(body) {
  let lines = body.split('\n');
  // Drop a single leading level-1 heading — the note's own `# Title`. renderDigest
  // already prepends the section header (## Preferences, …); without this the note's
  // own H1 stacks under it as a duplicate. Only the FIRST non-blank line, and only
  // if it is exactly a one-hash heading (`# `). H2+ are section structure — preserved.
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first !== -1 && /^#\s/.test(lines[first])) {
    lines = [...lines.slice(0, first), ...lines.slice(first + 1)];
  }
  const out = [];
  let i = 0;
  // …existing empty-section loop, unchanged, iterating over `lines`…
}
```

Notes on the regex: `/^#\s/` matches a single-hash heading (`# X`) and NOT `##…`
(the second char of `##` is `#`, not whitespace), so H2–H6 are never stripped.
Change `const lines` to `let lines` so the leading line can be spliced out. Only
the loop's `lines` reference changes; leave the join/replace tail untouched.
Update the `compact` JSDoc's parenthetical to describe the leading-H1 drop instead
of "the document's `# Title`, which has no direct content".

Worked behavior (the two shapes that matter):

- **H1 with direct content** (real vault; the bug): body
  `\n# Preferences\n\nDirect and concise…\n\n## Tools\n…` → strip `# Preferences`
  → `\n\nDirect and concise…\n\n## Tools\n…` → loop keeps the prose and `## Tools`
  → digest renders `## Preferences` then `Direct and concise…` then `## Tools`.
  **No duplicate.**
- **H1 immediately followed by H2** (every current fixture): body
  `\n# Profile\n\n## Role\n…` → strip `# Profile` → `\n\n## Role\n…` → loop keeps
  `## Role`. Output **byte-identical** to today (the old empty-section rule
  removed `# Profile`; now the leading-H1 rule does). This is why no golden moves.

### Exact contract — the setup-skill wording

In Step 3 option 3, replace the single `run `wienerdog adopt <path-to-their-vault>``
instruction with both forms. Suggested prose (adapt to fit the paragraph, but
keep both literal command strings):

> …tell them to finish or exit this setup and run the adopt command from the
> terminal. The exact form depends on how Wienerdog was installed:
> - **Installed from npm** (the usual case): `wienerdog adopt <path-to-their-vault>`
> - **Running from a cloned repo** (before the npm release): `node
>   <path-to-the-wienerdog-repo>/bin/wienerdog.js adopt <path-to-their-vault>`
>
> Both do exactly the same thing. That command checks the prerequisites (a normal
> local folder, not iCloud or Documents; a git repository — it will offer to set
> one up if it is not) and confirms the folder layout before it changes anything.

Keep the substrings `wienerdog adopt` and `Adopt it in place` intact (existing
tests depend on them). Do NOT change the `wienerdog init --fresh-vault` or
`wienerdog sync` references elsewhere in the skill — those are out of scope for
this WP (see "Out of scope").

## Golden impact (read before you touch anything)

**No golden changes.** The only byte-comparison consumer of `renderDigest()` is
`tests/unit/digest.test.js` against `tests/golden/digest-default.md`, built from
`tests/fixtures/identity-filled/` — whose four identity notes each place an H2
directly under their H1, so the old and new code drop that H1 identically. The
adapter goldens (`tests/golden/claude-adapter/CLAUDE.md`,
`…/codex-adapter/AGENTS.md`) do NOT call `renderDigest`; they embed a hardcoded
`FIXED_DIGEST` test string, so they are untouched. Every other `renderDigest`
consumer asserts with `.includes()`/regex on injected section headers or specific
content (all robust to this change): `tests/unit/layout.test.js`,
`tests/integration/adopt-e2e.test.js`, `tests/integration/dream.test.js`,
`tests/integration/bootstrap-seam.test.js`, `tests/unit/scheduler-runjob.test.js`.
Run the full suite (`npm test`) to confirm; then confirm the golden is unchanged
with `git status --porcelain tests/golden` (must be empty).

## Implementation notes & constraints

- This is a pure-string transform on the body; do not read files, add options, or
  change `renderDigest`'s per-file headers or ordering.
- Only ONE leading H1 is dropped, and only if it is the first non-blank line. A
  later `# X` deeper in a body (unusual) is left alone.
- When uncertain: choose the simpler option and note it under "Decisions made".
  Do NOT expand scope.

## Acceptance criteria

- [ ] An identity note whose H1 carries content directly under it renders in the
      digest with the injected section header only — the note's own `# Title` line
      is absent, its content present.
- [ ] `tests/golden/digest-default.md` is byte-for-byte unchanged.
- [ ] The setup skill presents both adopt invocation forms; `wienerdog adopt` and
      `node …/bin/wienerdog.js adopt` both appear.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
node --test tests/unit/digest.test.js
node --test tests/unit/setup-skill-structure.test.js
npm test
npm run lint
git status --porcelain tests/golden        # MUST be empty — no golden changed
```

Regression test to add to `tests/unit/digest.test.js` (build a note with an
H1-with-direct-content shape the fixtures lack):

```js
test("compaction drops a note's own leading H1 (no duplicate under the section header)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-digest-h1-'));
  const idDir = path.join(tmp, '06-Identity');
  fs.mkdirSync(idDir, { recursive: true });
  fs.writeFileSync(
    path.join(idDir, 'preferences.md'),
    '---\nid: p\ntype: identity\norigin: interview\nstatus: active\n---\n\n' +
      '# Preferences\n\nDirect and concise. Lead with the recommendation.\n'
  );
  const digest = renderDigest(tmp);
  assert.ok(digest.includes('## Preferences'), 'injected section header present');
  assert.ok(!/^# Preferences$/m.test(digest), "note's own leading H1 dropped");
  assert.ok(digest.includes('Direct and concise'), 'content under the H1 preserved');
});
```

Setup-skill assertion to add to `tests/unit/setup-skill-structure.test.js`:

```js
test('setup-skill: Step 3 shows the from-repo adopt invocation too', () => {
  assert.ok(text.includes('bin/wienerdog.js adopt'), 'from-repo adopt invocation form missing');
});
```

## Out of scope (do NOT do these)

- The adopt git/stale-lock/.gitignore hardening — that is WP-029.
- Regenerating any golden (none should change).
- Generalizing both-invocation-forms wording to the `wienerdog init
  --fresh-vault` / `wienerdog sync` mentions — item 5 named only adopt; keep the
  change surgical. A follow-up may generalize.
- Any change to `renderDigest`'s section headers, ordering, or line budget.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/030-digest-h1-and-adopt-invocation`; conventional commits; PR titled
   `fix(digest): drop note's leading H1; show both adopt invocation forms (WP-030)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
