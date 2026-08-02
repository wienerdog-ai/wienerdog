---
id: WP-symlink-lexical-fallback-removal
title: Remove the dead lexical fallback from the manifest symlink reverser
status: Draft
model: sonnet
size: S
depends_on: [WP-153]
adrs: [ADR-0004, ADR-0019, ADR-0031]
---

# WP-symlink-lexical-fallback-removal: delete a branch no production call path can reach

## Context (read this, nothing else)

Wienerdog installs files. When it installs, it appends every artifact it creates
to an **install manifest** (`<core>/manifest.json`) — one entry per artifact,
each with a `kind` (`file`, `dir`, `symlink`, `managed-block`, `settings-entry`,
`vendored-tree`, `copied-skill`, `scheduler-entry`, …). `wienerdog uninstall`
replays that ledger backwards through `reverse()` in `src/core/manifest.js`,
which dispatches each entry to a per-kind **reverser**. This is the whole of
Wienerdog's reversibility guarantee (**IRON RULE, ADR-0004: Wienerdog is just
files** — nothing here starts a process; ADR-0019 owns the uninstall/disposal
order). **The manifest is untrusted input**: a hand-edited or hostile manifest
must never turn a reverser into a delete primitive, so every reverser carries its
own structural ownership proof and every error path resolves to *preserve*, never
*delete*.

The `symlink` reverser is `reverseSymlink()`. Wienerdog links its skills into a
harness skills directory (`~/.claude/skills/wienerdog-<name>` and the Codex
equivalent) as symlinks pointing at the copies inside its own core. `WP-153`
made that reverser **target-aware**: it unlinks a recorded link only when the
link still provably resolves to the source recorded in the entry, so a link the
user replaced with their own survives uninstall. WP-153's decision table (its
**Table A**, five ordered rows) is the canonical contract for that function and
it lives in `docs/specs/done/WP-153-target-aware-symlink-reverser.md`.

WP-153's Table A row 3 shipped with **two** sub-tests: a semantic realpath test
(`sameResolvedDir(L, T)`) and a **lexical fallback** (`fs.readlinkSync(L) === T`).
The fallback existed for exactly one scenario — the user deletes Wienerdog's core
by hand, so the link dangles, `realpath(T)` throws, and the semantic test can no
longer succeed even for our own link. **During the WP-153 review that scenario
was proven unreachable through `reverse()`, the only production caller**, and the
finding was recorded in that spec's "Post-merge note — 2026-08-02" rather than
acted on, because a `Done` spec must keep describing the code that actually
ships. The spec-side mandate that kept the fallback alive was already removed in
PR #139; **this WP removes the code, and moves every surface of WP-153 that
describes the fallback in the same commit** (that one-commit requirement is
written into WP-153's own Mirrored Surface Checklist — see Table R below).

This is a **cleanup**, justified by CLAUDE.md's *"No error handling for impossible
scenarios"*. It is **behavior-preserving**: no reachable input to `reverse()`
changes outcome. It has no user-visible effect and carries no release-gate
urgency.

## Current state

Every claim below was verified first-hand against the worktree at commit
**`0f9ee08`** (`git rev-parse HEAD` → `0f9ee088117671d9ce0b6f013329f8673ef5c131`)
on 2026-08-02. Line numbers are that commit's.

### 1. The dead branch — `src/core/manifest.js:185-200`

Byte-exact (`awk 'NR>=185 && NR<=200' src/core/manifest.js`):

```js
  // Row 3: the link no longer resolves to the source we recorded. Realpath first
  // (semantic, follows the link); lexical fallback for the one reachable case
  // where the core was deleted by hand so realpath(T) throws. Both fail-closed.
  let lexicalMatch = false;
  try {
    lexicalMatch = fs.readlinkSync(L) === T;
  } catch {
    lexicalMatch = false;
  }
  if (!sameResolvedDir(L, T) && !lexicalMatch) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
```

Inside `reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots)`,
which begins at `:168`. `L` is `entry.path` (the link), `T` is `entry.target`
(the recorded source). Rows 1, 2, 4 and 5 sit above and below this block and are
**not** touched by this WP.

### 2. `sameResolvedDir` — `src/core/manifest.js:449-458`

```js
/** True iff `a` and `b` resolve (via realpath) to the SAME directory. Fail-closed
 *  … */
function sameResolvedDir(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}
```

It is itself fail-closed: an unresolvable side returns `false`, which lands in
row 3, i.e. in *preserve*. Removing the fallback therefore removes no error
handling — it removes a **second** attempt at a proof whose failure is already
safe.

### 3. Why the fallback is unreachable — `src/core/manifest.js:818-828`

`reverseSymlink` has exactly **one** production caller: `reverse()`'s symlink arm.
Verified: `grep -rn "reverseSymlink" src/ bin/` returns `manifest.js:168` (the
definition), `:818` (a comment), `:828` (the call), `:1062` (the `module.exports`
line), and `src/adapters/shared.js:441` — which is a **comment mentioning the
name**, not a call. Byte-exact at `:818-828`:

```js
      } else if (entry.kind === 'symlink') {
        // F30: validate the canonical PARENT is in-bounds, then reverseSymlink
        // lstat+unlinks the LINK ITSELF (it must NOT resolve through the link).
        const target = path.join(fs.realpathSync(path.dirname(entry.path)), path.basename(entry.path));
        if (!withinAllowedRoot(target, allowedRoots, localBin)) {
          process.stderr.write(
            `wienerdog: preserving ${entry.path} — outside every Wienerdog-owned root (not deleting)\n`
          );
          skipped.push(entry.path);
          continue;
        }
        reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);
      }
```

`withinAllowedRoot` (`:969`) filters `allowedRoots` through `contains(root,
targetPath)` (`:987`), and `contains` calls `fs.realpathSync(inner)` on its inner
argument — **which is the link path itself, so it follows the link**. On a
dangling link that throws `ENOENT`, the `catch` returns `false`, no root matches,
and the entry is preserved at `:822-827` **before** `reverseSymlink` runs. The
one scenario the fallback was written for therefore never reaches it.

**Verified empirically at `0f9ee08`**, not only by reading: a scratch script
built a real install in a temp `HOME`, created `~/.claude/skills/wienerdog-foo →
~/.claude/core-skills/wienerdog-foo`, deleted the destination so the link
dangles, recorded `{kind:'symlink', path: <link>, target: <destination>}`, and
called `reverse()`. Result:

```text
link still on disk (lstat): true
in removed: false
in skipped: true
stderr: "wienerdog: preserving …/.claude/skills/wienerdog-foo — outside every Wienerdog-owned root (not deleting)\n"
```

The same fixture passed **directly** to `reverseSymlink` (bypassing `reverse()`)
is unlinked via the fallback — `removed: true, skipped: false`. That direct call
is the *only* way to reach the branch, and the only thing in the repo that does
it is the test below.

### 4. The one test that pins the fallback — `tests/unit/manifest.test.js:1564-1595`

`grep -rn "reverseSymlink" tests/` returns matches in **`tests/unit/manifest.test.js`
only** — lines 1484, 1493, 1515, 1537, 1564, 1566, 1570, 1584, 1597. No other
test file, scenario harness or script references the function. The tests are
T1 (`:1493`), T2 (`:1515`), T3 (`:1537`), **T4 (`:1564`)** and T7 (`:1597`);
T1, T2, T3 and T7 all drive `reverse()` and are unaffected by this WP.

T4 is the obsolete one, byte-exact at `:1564-1595`:

```js
test('reverseSymlink: a dangling own link is still removed via the lexical fallback — Table A row 3→5 (T4)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // T4 exercises reverseSymlink DIRECTLY, not via reverse(). The lexical fallback
  // (readlinkSync(L) === T) only ever fires when T is unresolvable — i.e. the core
  // was deleted by hand so the link dangles. But reverse()'s withinAllowedRoot gate
  // realpaths the link (following it), which THROWS on a dangling link and preserves
  // the entry BEFORE reverseSymlink runs. That gate is pre-existing (WP-144/F30) and
  // out of scope here, so the fallback contract (Table A row 3 → row 5) is proven at
  // the unit boundary. See the PR "Discovered issues" note.
  const paths = tempPaths();
  const skillsRoot = path.join(paths.claudeDir, 'skills'); // OWNED location — required
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  fs.rmSync(source, { recursive: true, force: true }); // core deleted by hand → link dangles
  const removed = [];
  const skipped = [];
  const removedSet = new Set();
  manifestLib.reverseSymlink(
    { kind: 'symlink', path: link, target: source },
    false,
    removed,
    skipped,
    removedSet,
    [skillsRoot]
  );
  assert.equal(fs.existsSync(link), false, 'the dangling own link is unlinked via the lexical fallback');
  assert.ok(removed.includes(link));
  assert.ok(!skipped.includes(link));
});
```

**Trap in that last block, and you must not copy it forward:** `fs.existsSync`
**follows** the link, so it returns `false` for a link that is still on disk but
dangling. The `assert.equal(fs.existsSync(link), false, …)` at `:1592` therefore
passes whether the link was unlinked or preserved — it is vacuous for this
fixture. Use `fs.lstatSync(link).isSymbolicLink()` in the replacement.

### 5. Measured blast radius of the removal

The removal was applied to a scratch copy of the tree at `0f9ee08` and the **full**
`npm test` was run. Exactly **one** test failed:

```text
✖ reverseSymlink: a dangling own link is still removed via the lexical fallback — Table A row 3→5 (T4)
  AssertionError: assert.ok(removed.includes(link))
  at tests/unit/manifest.test.js:1593
```

`ℹ pass 77 / fail 1 / skipped 1` on `tests/unit/manifest.test.js`, and no other
file in the suite regressed. (The failure lands on `:1593`, not `:1592` — the
vacuous `existsSync` assertion above passed.) The scratch edit was reverted;
`git status` is clean. **This is the evidence for the behavior-preservation
criterion:** the only red is a direct unit call on the dead branch.

### 6. The helper idioms your new test needs

Already present in `tests/unit/manifest.test.js`, use them, do not invent new ones:

- `tempPaths()` (`:14-18`) — fresh temp `HOME` + core, returns `WienerdogPaths`.
- `makeInstall(paths)` (`:25-46`) — realistic on-disk install + saved manifest.
- `isPosix` (`:55`) — `process.platform !== 'win32'`; every symlink test guards on it.
- The stderr capture idiom, used verbatim at `:690-699` and four other places:

```js
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let result;
  try {
    result = manifestLib.reverse(paths, manifest, {});
  } finally {
    process.stderr.write = origWrite;
  }
```

### 7. What is NOT in scope and must not be confused with the target

`src/adapters/shared.js` contains its **own, unrelated** `fs.readlinkSync(linkPath)
=== target` comparison — the install-side `applySkillLinks` adoption/preserve arm
(WP-146). It is a different mechanism at a different call site, it is live, and
this WP does not touch it. WP-153's spec discusses it at its lines 162-172, 767
and 975, which are likewise **not** the surfaces this WP amends. Grep by
`reverseSymlink`, never by the bare word "lexical".

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip)
     and package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | **R1** only — the row-3 block at `:185-200` (Current state §1). No other function, no other row, no other kind, no change to `module.exports`. |
| modify | tests/unit/manifest.test.js | **R2** only — replace T4 (`:1564-1595`) with the two preserve tests T4a and T4b. T1, T2, T3, T7 and every other test in the file stay byte-identical. |
| modify | docs/specs/done/WP-153-target-aware-symlink-reverser.md | **R3–R10** — the eight registered mirrors of the row-3 contract, per Table R. WP-153's own Mirrored Surface Checklist (`:637-643`) requires they move in the **same commit** as R1. Do not touch anything in that file outside the eight anchors named in Table R. |

Not deliverables under any reading: `src/adapters/shared.js`, any other file under
`src/`, `bin/`, `tests/` (including any scenario harness), `docs/adr/`,
`docs/GLOSSARY.md`, `docs/THREAT-MODEL.md`, and every other spec in
`docs/specs/` or `docs/specs/done/`.

### Exact contracts

**The function signature does not change.** `reverseSymlink(entry, dryRun,
removed, skipped, removedSet, skillsRoots)` keeps its six parameters and its
place in `module.exports`.

**R1 — the code edit.** Replace `src/core/manifest.js:185-200` (quoted byte-exact
in Current state §1) with exactly this:

```js
  // Row 3: the link no longer resolves to the source we recorded. sameResolvedDir
  // is realpath-based (semantic, follows the link) and is itself fail-closed — an
  // unresolvable side returns false, which lands HERE, in preserve. There is NO
  // second, link-text comparison: WP-153 shipped one as a fallback for a
  // hand-deleted core, it was dead through production (reverse()'s withinAllowedRoot
  // gate follows the link and preserves a dangling entry before this function runs),
  // and WP-symlink-lexical-fallback-removal removed it.
  if (!sameResolvedDir(L, T)) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
```

The notice string, the `skipped.push(L)` and the `return` are **byte-identical**
to what is there now. Only the comment header and the condition change, and the
`lexicalMatch` `let`/`try`/`catch` disappear. No new `require`, no new variable,
no reordering of rows.

**The comment wording is load-bearing — use it verbatim.** V4 (R8) extracts the
**whole** `reverseSymlink` body with `sed`, comments included, and fails if the
string `readlinkSync` appears anywhere in it. A comment that names the removed
call — e.g. *"There is NO lexical `readlinkSync` fallback"* — therefore turns V4
red even though the code is correct. This was hit while drafting: the first
version of this replacement said exactly that and V4 printed
`REGRESSED: the removed lexical fallback is back in reverseSymlink`. The text
above says "second, link-text comparison" for that reason. If you reword it, keep
the token `readlinkSync` out of the function body.

**R2 — the test edit.** Replace `tests/unit/manifest.test.js:1564-1595` (the whole
T4 `test(...)` call, quoted byte-exact in Current state §4) with exactly these
**two** tests. They are separate `test()` calls on purpose: T4a is red before R1
and green after, T4b is green in both directions, and a single test containing
both could not show those two baselines independently.

```js
test('reverseSymlink: a dangling own link is PRESERVED — direct call (T4a)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // Table A row 3 has ONE test, sameResolvedDir, and it is fail-closed: a dangling
  // link cannot prove it resolves to the recorded source, so it is preserved. The
  // lexical readlinkSync fallback WP-153 shipped (which unlinked exactly this case)
  // was dead through production and was removed by WP-symlink-lexical-fallback-removal.
  // This is the ONLY boundary from which that fallback was ever reachable, so this
  // is where its removal is observable — see T4b for why it was unreachable.
  const paths = tempPaths();
  const skillsRoot = path.join(paths.claudeDir, 'skills'); // OWNED location — required
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  fs.rmSync(source, { recursive: true, force: true }); // core deleted by hand → link dangles
  const removed = [];
  const skipped = [];
  const removedSet = new Set();
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  try {
    manifestLib.reverseSymlink(
      { kind: 'symlink', path: link, target: source },
      false,
      removed,
      skipped,
      removedSet,
      [skillsRoot]
    );
  } finally {
    process.stderr.write = origWrite;
  }
  // lstat, NOT existsSync: existsSync FOLLOWS the link and is false for a link that
  // is still on disk but dangling, so an existsSync assertion here is vacuous.
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the dangling own link is preserved');
  assert.ok(!removed.includes(link));
  assert.ok(skipped.includes(link));
  assert.match(err, /not the Wienerdog skill link we recorded/);
});

test('reverseSymlink: a dangling own link never reaches the reverser through reverse() (T4b)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // Why the lexical fallback was dead: reverse()'s symlink arm passes the link path
  // to withinAllowedRoot, whose contains() realpaths it — which FOLLOWS the link and
  // throws on a dangling one — so the entry is preserved at that upstream gate and
  // reverseSymlink never runs. CHARACTERIZATION test: green both before and after
  // WP-symlink-lexical-fallback-removal. That is the point — no reachable production
  // input changed outcome. The asserted notice is the upstream gate's, not row 3's,
  // which is what proves reverseSymlink was never entered.
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-bar');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-bar');
  fs.symlinkSync(source, link);
  fs.rmSync(source, { recursive: true, force: true });
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: source });
  manifestLib.save(paths, manifest);
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifestLib.load(paths), {});
  } finally {
    process.stderr.write = origWrite;
  }
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'reverse() preserves the dangling own link');
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(
    err,
    /outside every Wienerdog-owned root/,
    'preserved by the upstream withinAllowedRoot gate — reverseSymlink never ran'
  );
});
```

Both stderr strings in the assertions were captured from a live run at `0f9ee08`
(Current state §3) — they are what the code prints, not a guess.

**R3–R10 — the WP-153 amendments.** Each is a byte-exact replacement or insertion
at one anchor. They are specified in full under "Contract reference" below,
because they are the mirrors of this WP's one canonical table.

## Contract reference

The ADR-0031 activation trigger fires on **three** of the seven: (iv)
fallback/precedence behavior changes; (vi) a successor spec inherits the contract
(WP-153's Table A keeps deciding `reverseSymlink` after this WP); (vii) the same
contract appears in multiple mirrored surfaces — eight of them inside WP-153 alone.

**WP-153's Table A remains the single canonical decision table for
`reverseSymlink`.** This WP does not create a rival. What *this* spec decides,
and what Table R below is canonical for, is the **amendment set**: which surfaces
move, to what text, and which gate pins each one. After the commit lands, Table A
(as amended by R3) is again the only place `reverseSymlink`'s rows are decided.

### Table R — the amendment set (canonical)

`WP-153` = `docs/specs/done/WP-153-target-aware-symlink-reverser.md`. Line
numbers are that file at `0f9ee08`. Anchors are stated as line ranges **and** as
their opening words, so a shifted line number is recoverable.

| # | Surface | Anchor | Required post-state | Gate |
|---|---------|--------|---------------------|------|
| R1 | `src/core/manifest.js` — row 3 implementation | `:185-200`, `// Row 3: the link no longer resolves…` | Row 3 is `if (!sameResolvedDir(L, T)) {` alone; the `lexicalMatch` `let`/`try`/`catch` is gone; the notice, `skipped.push(L)` and `return` are byte-identical to today. Exact text in "Exact contracts". | V1, V4 |
| R2 | `tests/unit/manifest.test.js` — T4 | `:1564-1595`, `test('reverseSymlink: a dangling own link is still removed…` | Replaced by the **two** preserve tests in "Exact contracts", T4a and T4b. T4a is red before R1, green after. T4b is green before **and** after. | V1, V2 |
| R3 | WP-153 **Table A row 3** | `:429`, the only line in the file containing `readlinkSync(L) !== T` | Condition cell loses the lexical conjunct; "Why" cell drops "Both sub-tests". Exact text below. | V3a |
| R4 | WP-153 row-3 prose block | `:433-457`, `**Row 3 has two sub-tests on purpose…` through `…only ever *narrows* row 5.)` | Replaced by the one-test block below. | V3a |
| R5 | WP-153 Implementation-notes guard bullet | `:779-785`, `- **Guard the lexical fallback**:` | Replaced by the "no fallback to guard" bullet below. | V3a |
| R6 | WP-153 security-checklist error-path bullet | `:869-875`, `- [ ] Every error path in Table A lands in *preserve*…` | Replaced by the bullet below. | V3a |
| R7 | WP-153 Test-index row T4 | `:806`, the only line in the file containing `DIRECT unit test of` | Replaced by **two** rows, T4a and T4b, below. The index is one row per `test()` call and R2 produces two. | V3a |
| R8 | WP-153 verification command **V4** | `:936-946`, `# V4 — the reverser consults the recorded target…` through `echo "V4 ok — both row 3 sub-tests present"` | Replaced by the inverted V4 below: `sameResolvedDir` **present**, `readlinkSync` **absent**. | V3b |
| R9 | WP-153 Mirrored Surface Checklist entry | `:637-643`, `- [ ] **(+post-merge) §"Post-merge note — 2026-08-02"**` | Reworded from pending to landed. Exact text below. | V3a |
| R10 | WP-153 post-merge note | insertion **immediately after** the heading line `:1001` | One new blockquote paragraph marking the note resolved. **Nothing in the note is deleted or reworded, and the heading line is not touched** — see the anchor warning below. | V3a |

**Anchor warning for R10, and it is not optional.** The post-merge note's heading
is linked from **five** places inside WP-153 (`:445`, `:641`, `:785`, `:875`,
`:1259`) by the GitHub-generated anchor
`#post-merge-note--2026-08-02-the-lexical-fallback-is-dead-through-production-removal-routed`.
Changing one character of that heading breaks all five links. **Leave line 1001
byte-identical.** R4, R5, R6 and R9 all re-emit that same link — copy it from the
text below, do not retype it.

#### R3 — Table A row 3, byte-exact replacement

Remove (one line, `:429`):

```text
| 3 | `sameResolvedDir(L, T) === false` **and** `readlinkSync(L) !== T` | none | `skipped` | same line as row 2 | The link at `L` points somewhere else — a user's replacement, or a stale link from another install root. Both sub-tests are fail-closed (`sameResolvedDir` catches and returns `false`; the lexical test runs inside a `try` whose `catch` yields no match), so **every** error path lands in this row, i.e. in *preserve*. |
```

Insert in its place (one line):

```text
| 3 | `sameResolvedDir(L, T) === false` | none | `skipped` | same line as row 2 | The link at `L` does not provably resolve to the source we recorded — a user's replacement, a stale link from another install root, or a link left dangling by a hand-deleted core. `sameResolvedDir` is fail-closed (it catches and returns `false`), so **every** error path lands in this row, i.e. in *preserve*. |
```

#### R4 — the row-3 prose block, byte-exact replacement

Remove `:433-457` in full (it begins `**Row 3 has two sub-tests on purpose,` and
ends `where it points, and it only ever *narrows* row 5.)`). Insert in its place:

```text
**Row 3 has exactly one test: `sameResolvedDir(L, T)`.**

- `sameResolvedDir(L, T)` is `realpath(L) === realpath(T)` (Current state §7).
  On a symlink, `realpath` follows the link — so this is the *semantic* proof and
  it matches what every other reverser in this file uses. It is fail-closed: an
  unresolvable side returns `false`, which lands in this row, i.e. in *preserve*.
- **There is no lexical `readlinkSync(L) === T` fallback, and re-adding one is a
  regression** (V4 fails on its presence). This WP shipped one, for the case where
  the user deleted the core by hand so `realpath(T)` throws; it was then proven
  **unreachable through `reverse()`, the only production caller**, and removed by
  `WP-symlink-lexical-fallback-removal`. The proof and the removal are recorded in
  [the 2026-08-02 post-merge note](#post-merge-note--2026-08-02-the-lexical-fallback-is-dead-through-production-removal-routed).
- The test is **string/inode equality only**. Do **not** add a prefix, `startsWith`,
  `path.relative`, or "is under the core" test **on the TARGET side** — an
  ancestor-scoped target test would authorize deleting any link pointing anywhere
  inside the core, which is a larger permission than "the link we recorded".
  (Row 4's `OWNED(L)` gate is a constraint on the **link's own location**, not on
  where it points, and it only ever *narrows* row 5.)
```

#### R5 — the Implementation-notes bullet, byte-exact replacement

Remove `:779-785` (begins `- **Guard the lexical fallback**: \`fs.readlinkSync\``).
Insert in its place:

```text
- **There is no lexical fallback to guard.** This WP shipped a
  `fs.readlinkSync(L) === T` fallback wrapped in a `try`/`catch`; it was dead
  through production and `WP-symlink-lexical-fallback-removal` removed it. Row 3
  is `sameResolvedDir(L, T) === false` alone, and `sameResolvedDir` is itself
  fail-closed, so no error path escapes *preserve* — see the
  [2026-08-02 post-merge note](#post-merge-note--2026-08-02-the-lexical-fallback-is-dead-through-production-removal-routed).
```

#### R6 — the security-checklist bullet, byte-exact replacement

Remove `:869-875` (begins `- [ ] Every error path in Table A lands in *preserve*`).
Insert in its place:

```text
- [ ] Every error path in Table A lands in *preserve*, never in *delete*:
      `sameResolvedDir` catches and returns `false`, so an unresolvable `L` or `T`
      — including an `OWNED` link left dangling by a hand-deleted core — falls to
      row 3 and is preserved (pinned by T4a and T4b). **No row deletes on
      an error path.** The dead lexical fallback that once made a dangling `OWNED`
      link the one exception was removed by
      `WP-symlink-lexical-fallback-removal` — see the
      [2026-08-02 post-merge note](#post-merge-note--2026-08-02-the-lexical-fallback-is-dead-through-production-removal-routed).
```

#### R7 — the Test-index T4 row, byte-exact replacement

Remove the whole T4 row at `:806` — it is one long line, the only line in the
file containing the string `DIRECT unit test of`. Insert in its place **two**
lines:

```text
| T4a | `tests/unit/manifest.test.js` — **DIRECT unit call of `reverseSymlink`** | **OWNED — required; `T` deleted, so `L` dangles** | **Dangling core → PRESERVE.** The entry carries `target: T` and `L` is still our link, but `T` has been removed from disk, so `sameResolvedDir` cannot succeed. Called **directly**, `reverseSymlink` preserves `L`: still a symlink on disk, reported in `skipped`, row-2 notice printed. **Assert with `lstat`, never `existsSync`** — `existsSync` follows the link and returns `false` for a live dangling link, so an `existsSync` assertion is vacuous here. **Why direct:** this is the only boundary from which the removed lexical fallback was ever reachable, so it is the only place its removal is observable (T4b pins why). **Same location precondition as T2** — an unOWNED fixture is preserved by row 4 and proves nothing about row 3. **Red before `WP-symlink-lexical-fallback-removal`, green after.** | Table A row 3 |
| T4b | `tests/unit/manifest.test.js` — through `reverse()` | **OWNED; `T` deleted, so `L` dangles** | **The unreachability fact.** The same fixture, recorded in the manifest and driven through `reverse()`, is preserved — and the notice is `outside every Wienerdog-owned root`, the UPSTREAM `withinAllowedRoot` gate's, not row 3's. That notice is the proof `reverseSymlink` was never entered: `contains()` realpaths the link, which follows it and throws on a dangling one. **CHARACTERIZATION test — green both before and after `WP-symlink-lexical-fallback-removal`**, which is exactly the claim that the removal changed no reachable production behavior. | Table A row 3 (never reached) |
```

#### R8 — V4, byte-exact replacement

Remove `:936-946` (from `# V4 — the reverser consults the recorded target (Table A rows 3+5). Expect BOTH`
through `echo "V4 ok — both row 3 sub-tests present"`). Insert in its place:

```bash
# V4 — row 3 is the semantic test and ONLY the semantic test. Expect
# `sameResolvedDir` PRESENT and `readlinkSync` ABSENT inside the reverseSymlink
# body. The lexical fallback was dead through production and was removed by
# WP-symlink-lexical-fallback-removal (2026-08-02 post-merge note), so from that
# WP onward its PRESENCE is the regression, not its absence.
BODY0=$(sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js)
if ! printf '%s\n' "$BODY0" | grep -qF "sameResolvedDir"; then
  echo "REGRESSED: row 3 test missing from reverseSymlink: sameResolvedDir"; exit 1
fi
if printf '%s\n' "$BODY0" | grep -qF "readlinkSync"; then
  echo "REGRESSED: the removed lexical fallback is back in reverseSymlink"; exit 1
fi
echo "V4 ok — row 3 is sameResolvedDir alone"
```

#### R9 — the Mirrored Surface Checklist entry, byte-exact replacement

Remove `:637-643` (begins `- [ ] **(+post-merge) §"Post-merge note — 2026-08-02"**`).
Insert in its place:

```text
- [ ] **(+post-merge) §"Post-merge note — 2026-08-02"** — it records the lexical
      sub-test that **used to** live in **Table A row 3** and names the WP that
      removed it. It is a **record of a divergence that has since been closed**,
      not a second source of truth: Table A still decides row 3.
      `WP-symlink-lexical-fallback-removal` landed on 2026-08-02 and moved this
      note, Table A row 3, the Implementation-notes guard bullet, the
      security-checklist error-path bullet, T4 and V4 in **one** commit together
      with the code — which is exactly what this entry required.
```

#### R10 — the post-merge note resolution, insertion only

Insert the following as a new paragraph **immediately after** the heading line at
`:1001` and the blank line that follows it, i.e. **above** the existing
`> **This section is a RECORD, not a contract change.**` blockquote. Delete
nothing; reword nothing; leave the heading byte-identical.

```text
> **RESOLVED 2026-08-02 — the removal landed
> (`WP-symlink-lexical-fallback-removal`).** Everything below this paragraph is a
> dated record of the finding, kept verbatim. What changed since: the fallback is
> gone from `src/core/manifest.js`, Table A row 3 is now
> `sameResolvedDir(L, T) === false` alone, the Implementation-notes bullet and the
> security-checklist bullet were rewritten, T4 became T4a/T4b and both assert
> *preserve*, and V4 now fails on the fallback's **presence**. Two claims below
> are therefore historical
> and no longer describe `main`: *"it is nonetheless what ships"*, and the standing
> instruction's *"the fallback stays in the code and in the contract"*. That
> instruction was satisfied, not broken — its condition ("until that WP lands")
> was met.
```

### Mirrored Surface Checklist

Every surface in **this** spec that restates a fact decided by Table R, so a
review finding updates the table and all its mirrors in one pass:

- [ ] Deliverables-table cells — all three rows name their R-numbers (R1; R2;
      R3–R10). **Register-new-mirrors note:** that third cell states the range
      "R3–R10" and the count "eight"; if Table R gains or loses a row in that
      file, both must move with it.
- [ ] Acceptance criteria AC1–AC6 — each names the R-number it gates.
- [ ] Verification commands B1, V1–V7 — V3a/V3b are literal greps derived from
      R1 and R3–R10.
- [ ] Current state §1, §3, §4 and §5 — they quote the *pre*-change text of R1 and
      R2 and the empirical evidence for R1's safety.
- [ ] "Exact contracts" — the full replacement text for R1 and R2, plus the
      comment-wording constraint V4 imposes on R1.
- [ ] The R3–R10 sub-sections under Table R — the full replacement text for the
      WP-153 mirrors.

Registered **outside** this spec so a later change knows this table is its source
— **none is a deliverable and none may be edited by the implementer**:

- [ ] `docs/specs/done/WP-153-…:1250-1264` — the dated **review-gate log** bullet
      *"T4 / row-3-fallback — the fallback is DEAD THROUGH PRODUCTION…"*, which
      says V4 *"keeps its ratified expectation — both sub-tests"*. That is a
      record of what a review round decided on 2026-08-02, not a live contract
      claim, and this repo does not rewrite dated review records. Left alone
      deliberately; registered here so a future editor knows Table R (and then
      Table A) is its source.
- [ ] `src/adapters/shared.js:400-412` and `:441` — the WP-146 install-side
      preserve arm, its own `readlinkSync` comparison and its comment naming
      `reverseSymlink`. A **different mechanism** (Current state §7). Already
      registered in WP-153's own out-of-spec list; unchanged by this WP.

## Implementation notes & constraints

- **This is a deletion, not a redesign.** If your diff to `src/core/manifest.js`
  is more than the block in R1, you have gone too far.
- No new npm dependency, no new `require`, no change to `module.exports`
  (ADR-0004: nothing here starts anything).
- **Do not "fix" the vacuous `existsSync` assertion anywhere else in the file.**
  It is a trap only in the T4 fixture, which you are replacing wholesale.
- **Do not grep for the word "lexical"** to find your edit sites — it also hits
  `src/adapters/shared.js`, `docs/adr/0028-*`, three other done specs and the
  security-audit archive, none of which are yours. Use the R-anchors in Table R.
- **The token `readlinkSync` must not appear anywhere inside the `reverseSymlink`
  function after R1 — not in code, not in a comment.** V4 greps the whole body.
  See the constraint note under R1 in "Exact contracts".
- **T4b must be green against the untouched tree** (AC4, run B1). If it is red
  before R1, your fixture is wrong, not the code — most likely the link is not
  directly under `<claudeDir>/skills`, or its destination is outside
  `claudeDir` so the upstream gate preserves it for the wrong reason.
- Commit R1, R2 and R3–R10 **together, in one commit**. Splitting them leaves
  `main` in a state where WP-153's own V4 fails against the repo it ships in.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] **The change only ever narrows delete authority.** Removing a disjunct from
      a `!A && !B` preserve-guard turns it into `!A`, which is *true more often* —
      i.e. more inputs are preserved, never fewer. Confirm by inspection that no
      row gained a delete path.
- [ ] **Every error path still lands in preserve.** `sameResolvedDir` catches and
      returns `false` (Current state §2), and `false` lands in row 3 → `skipped`.
      There is no code path in the amended `reverseSymlink` where an exception or
      an unresolvable path reaches row 5.
- [ ] **Row 4's structural ownership proof is untouched** — `wienerdog-` basename
      **and** parent realpath-equal to a harness skills root. V4b (WP-153's, which
      this WP does not change) still passes.
- [ ] No untrusted identifier newly flows into a filesystem path or a shell
      command: this WP adds no path construction at all.

## Acceptance criteria

- [ ] **AC1 (R1)** — `reverseSymlink`'s body contains `sameResolvedDir` and does
      **not** contain `readlinkSync` (code or comment). Row 3's notice string,
      `skipped.push(L)` and `return` are byte-identical to `0f9ee08`. (V3b, V4.)
- [ ] **AC2 (R2, red → green)** — **T4a** fails against the untouched
      `src/core/manifest.js` and passes after R1. Both runs pasted into the PR.
      Expected counts on `tests/unit/manifest.test.js`: **`pass 78 / fail 1 /
      skipped 1`** before R1, **`pass 79 / fail 0 / skipped 1`** after. (Measured
      while drafting, on the exact code in "Exact contracts".)
- [ ] **AC3 (behavior preservation)** — `npm test` is fully green after R1+R2, and
      the **only** tests whose source changed are T4a/T4b. Every other test in
      `tests/unit/manifest.test.js` — T1, T2, T3, T7 and the 70-odd others — passes
      unmodified, which is the evidence that no reachable `reverse()` input changed
      outcome. Expected full-suite counts: **`pass 1893 / fail 0 / skipped 9`**
      (measured while drafting; the number moves only if another WP lands first —
      what must hold is `fail 0` and the same skip count as the pre-change run).
      (V1, V2.)
- [ ] **AC4 (unreachability pinned)** — **T4b** passes **against the untouched
      tree** as well as after R1, and asserts the
      `outside every Wienerdog-owned root` notice. Both runs pasted into the PR.
- [ ] **AC5 (mutation check)** — re-adding the fallback (restore the exact
      `lexicalMatch` block from Current state §1) turns **T4a** red and makes V4
      print `REGRESSED: the removed lexical fallback is back in reverseSymlink`
      and exit 1, while **T4b stays green** (it never depended on the branch).
      Revert the mutation; paste all three outputs.
- [ ] **AC6 (mirrors moved, R3–R10)** — the eight WP-153 anchors carry their
      replacement text byte-exactly, the post-merge-note **heading line is
      unchanged**, and all five in-document links to that anchor still resolve.
      (V3a.)
- [ ] `npm run lint` is green.

## Verification steps (run these; paste output in the PR)

```bash
# ── BEFORE the code change (baseline; run this first, paste it) ───────────────
# B1 (AC2 red, AC4 before) — apply R2 (the TEST edit) FIRST and leave
# src/core/manifest.js untouched, then run:
node tests/run.js tests/unit/manifest.test.js
# Expect exactly: `pass 78 / fail 1 / skipped 1`, the single failure being
# `✖ reverseSymlink: a dangling own link is PRESERVED — direct call (T4a)` on
# `assert.equal(fs.lstatSync(link).isSymbolicLink(), true, …)`. T4b is IN that
# pass count — that is the AC4 "green before" evidence, and why T4a and T4b are
# two separate tests rather than one with two sub-cases.

# ── AFTER R1 + R2 + R3-R10 ────────────────────────────────────────────────────
# V1 — the manifest suite. shared-skill-links is included because it shares the
# scheduler guard the suite depends on (WP-153's V1, unchanged).
node tests/run.js tests/unit/manifest.test.js tests/unit/shared-skill-links.test.js

# V2 — full suite. AC3: expect `pass 1893 / fail 0 / skipped 9` (measured while
# drafting at 0f9ee08 with R1+R2 applied), and manifest.test.js as the only
# changed test file.
npm test

# V3a — the WP-153 mirrors moved. Each sentinel was confirmed to appear EXACTLY
# ONCE in that file at 0f9ee08, so the before/after counts below are unambiguous.
# `grep -c` exits 1 on a zero count; that exit code is the expected result for the
# four "expect 0" lines, not a failure.
SPEC=docs/specs/done/WP-153-target-aware-symlink-reverser.md
grep -cF 'readlinkSync(L) !== T' "$SPEC"                    # was 1, expect 0 (R3)
grep -cF '**Guard the lexical fallback**' "$SPEC"           # was 1, expect 0 (R5)
grep -cF '**Row 3 has two sub-tests on purpose' "$SPEC"     # was 1, expect 0 (R4)
grep -cF 'DIRECT unit test of' "$SPEC"                      # was 1, expect 0 (R7)
grep -cF '**Row 3 has exactly one test' "$SPEC"             # expect 1 (R4)
grep -cF 'RESOLVED 2026-08-02 — the removal landed' "$SPEC"  # expect 1 (R10)
grep -cF 'V4 ok — row 3 is sameResolvedDir alone' "$SPEC"   # expect 1 (R8)
grep -cF '`WP-symlink-lexical-fallback-removal` landed on 2026-08-02' "$SPEC" # expect 1 (R9)
grep -cF '| T4b |' "$SPEC"                                  # expect 1 (R7, the new row)
grep -cF 'No row deletes on' "$SPEC"                        # expect 1 (R6)
grep -cF '## Post-merge note — 2026-08-02: the lexical fallback is dead through production, removal routed' "$SPEC"  # expect 1 — the heading is UNCHANGED (R10 anchor warning)

# V3b — the row-3 implementation, and WP-153's own amended V4 run verbatim.
BODY0=$(sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js)
if ! printf '%s\n' "$BODY0" | grep -qF "sameResolvedDir"; then
  echo "REGRESSED: row 3 test missing from reverseSymlink: sameResolvedDir"; exit 1
fi
if printf '%s\n' "$BODY0" | grep -qF "readlinkSync"; then
  echo "REGRESSED: the removed lexical fallback is back in reverseSymlink"; exit 1
fi
echo "V4 ok — row 3 is sameResolvedDir alone"

# V4b (WP-153's, unchanged) — row 4's structural ownership gate survived.
BODY=$(sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js)
for L in "startsWith('wienerdog-')" "skillsRoots"; do
  printf '%s\n' "$BODY" | grep -qF "$L" || {
    echo "REGRESSED: row 4 ownership gate missing: $L"; exit 1; }
done
echo "V4b ok — structural ownership gate present"

# V5 — mutation check (AC5). Re-add the fallback by hand (paste the Current-state
# §1 block back), run the two commands below, then `git checkout --
# src/core/manifest.js` to revert. Expect: T4a FAILS, T4b still passes, and V3b
# prints `REGRESSED: the removed lexical fallback is back in reverseSymlink`.
node tests/run.js tests/unit/manifest.test.js
# …then re-run the V3b block above.

# V6 — lint.
npm run lint

# V7 — the permission boundary (CI runs this too).
node scripts/boundary-check.js docs/specs/WP-symlink-lexical-fallback-removal.md \
  src/core/manifest.js tests/unit/manifest.test.js \
  docs/specs/done/WP-153-target-aware-symlink-reverser.md
```

## Out of scope (do NOT do these)

- **`src/adapters/shared.js`** — its `applySkillLinks` preserve arm, its own
  `readlinkSync` comparison, and the `:441` comment that names `reverseSymlink`'s
  historical target-blindness. A different mechanism (Current state §7). WP-153
  already registered `:400-412` for a later documentation pass; that pass is not
  this WP.
- **Any other reverser** — `reverseCopiedSkill`, `reverseVendoredTree`,
  `reverseManagedBlock`, `reverseSettingsEntry`, `reverseSchedulerEntry`.
- **The upstream `withinAllowedRoot` gate at `manifest.js:818-828`.** Its
  link-following `realpathSync` is the reason the fallback is dead. Do not
  "improve" it to stop following the link — that would resurrect the dead case
  and is a behavior change nobody has specified.
- **Rewriting WP-153's dated review-gate log** (`:1250-1264`) or its
  security-audit references. Records stay as recorded.
- **The forward-time ownership-provenance residual** — a `wienerdog-*` link the
  user made that happens to resolve to the recorded source is still deletable.
  That is WP-153's declared residual, routed to
  `WP-forward-time-ownership-provenance`, and this WP neither widens nor closes it.
- **Any ADR, `docs/GLOSSARY.md`, `docs/THREAT-MODEL.md`, or `CHANGELOG.md` entry.**
  This change has no user-visible effect.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of AC2 and AC4 and the AC5 mutation output.
2. Branch `wp/symlink-lexical-fallback-removal`; conventional commits; PR titled
   `chore(manifest): remove the dead lexical fallback from reverseSymlink (WP-symlink-lexical-fallback-removal)`.
3. R1, R2 and R3–R10 land in **one** commit.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
