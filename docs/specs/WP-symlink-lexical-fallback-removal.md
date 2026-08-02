---
id: WP-symlink-lexical-fallback-removal
title: Narrow the symlink reverser's row 3 to the semantic proof — drop the link-text fallback
status: Draft
model: sonnet
size: S
depends_on: [WP-153]
adrs: [ADR-0004, ADR-0019, ADR-0031]
---

# WP-symlink-lexical-fallback-removal: drop the weaker of row 3's two ownership proofs

> **Read this first — the id is historical, the framing is not.** The slug says
> "removal" because `WP-153` routed this work under that name in six places and a
> slug is never renamed (ADR-0029). **This is NOT dead-code removal.** The
> Codex design gate (round 1, 2026-08-02) proved the branch reachable through
> `reverse()`, and the reachable case is verified below. This WP is an
> **intentional, strictly-narrowing behavior change**: after it, `uninstall`
> deletes a strict subset of what it deletes today. Nothing it stops deleting
> was ever proven to be Wienerdog's.

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

WP-153's Table A row 3 shipped with **two** sub-tests, either of which lets the
entry proceed toward deletion:

1. the **semantic** proof — `sameResolvedDir(L, T)`, i.e. `realpath(L) === realpath(T)`;
2. a **link-text** fallback — `fs.readlinkSync(L) === T`, raw string equality
   between the recorded target and the link's own text.

This WP deletes (2). The two are not equivalent, and (2) is the weaker: it
compares a value **read out of the untrusted manifest** with a value **read off
the link**, so a `(path, target)` pair forged by copying the link's text
satisfies it by construction. That is exactly the shape WP-153's own T7 test
calls "the forgery", held back today only by row 4's structural ownership gate.
The semantic proof cannot be satisfied that way — it requires the link to
actually resolve to the recorded source.

### Why this is a behavior change, and why the change is the right direction

The fallback was written for one scenario — the user deletes Wienerdog's core by
hand, the link dangles, `realpath(T)` throws — and WP-153's post-merge note
proved **that scenario** unreachable through `reverse()`. **That proof was too
narrow.** Current state §4 documents a *different*, fully reachable input where
the fallback decides the outcome today: an OWNED, **non-dangling** link whose
text is **relative**, with the recorded `target` equal to that text.
`realpath()` resolves a relative `T` against the **process cwd**, not against the
link's directory, so the semantic proof fails while the raw-text test succeeds —
and `reverse()` unlinks the entry. After this WP it is preserved. **Measured
both ways at HEAD** (§4).

**Preserving it is the intended outcome.** Recorded here so it is not
re-litigated:

- **The manifest is untrusted.** A recorded field may *narrow* a deletion; it
  must never *authorize* one the ownership proof refuses. Raw-text equality is
  authorization-by-assertion.
- **Wienerdog never writes a relative target.** The forward writer builds it as
  `path.join(skillsDir, name)` off an absolute core path (Current state §5), so a
  relative-target entry cannot have come from Wienerdog. It is hand-edited or
  forged input, and the fail-safe answer to unprovable ownership is *preserve*.
- **It matches row 2's owner ruling** (2026-08-01): a legacy target-less entry is
  preserved unconditionally because ownership is unprovable. Same direction.
- **The cost is bounded and benign.** `uninstall` leaves a symlink on disk and
  prints `keeping <path> — not the Wienerdog skill link we recorded`. Nothing is
  destroyed; the worst case is a stale link the user can delete.

**The change is strictly negative on delete authority.** Removing a disjunct from
a preserve-guard `!A && !B` leaves `!A`, which holds strictly more often — more
inputs preserved, never fewer. There is no input this WP causes to be deleted
that is not deleted today.

The spec-side mandate that kept the fallback alive was removed in PR #139; **this
WP changes the code and moves every surface of WP-153 that describes row 3 in the
same commit** (that one-commit requirement is written into WP-153's own Mirrored
Surface Checklist — see Table R).

## Current state

Every claim below was verified first-hand against the worktree at commit
**`0f9ee08`** (`git rev-parse HEAD` → `0f9ee088117671d9ce0b6f013329f8673ef5c131`)
on 2026-08-02. Line numbers are that commit's.

### 1. The branch being dropped — `src/core/manifest.js:185-200`

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

### 3. The one call path, and where the DANGLING case dies — `src/core/manifest.js:818-828`

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
**dangling** link that throws `ENOENT`, the `catch` returns `false`, no root
matches, and the entry is preserved at `:822-827` **before** `reverseSymlink`
runs.

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
is unlinked via the fallback — `removed: true, skipped: false`.

**This proves only that the DANGLING case is unreachable.** It is the claim
WP-153's post-merge note made, and it is correct as far as it goes — but it is
not a claim about the branch as a whole. §4 is the counterexample.

### 4. The branch IS reachable — the relative-target case (measured, both directions)

The upstream gate follows the link and passes whenever the link **resolves**. It
says nothing about whether `sameResolvedDir(L, T)` will then succeed. So any
input where the link resolves (gate passes) but the semantic proof fails while
the raw-text test succeeds reaches the fallback and is decided by it.

Such an input exists and is trivial to construct: **a relative link text, with
`entry.target` set to that same text.**

- `readlinkSync(L)` returns the raw text, e.g. `../core-skills/wienerdog-rel`,
  so `readlinkSync(L) === T` is **true**.
- `sameResolvedDir(L, T)` is `realpath(L) === realpath(T)` (§2). `realpath(L)`
  resolves the link normally, but `realpath(T)` resolves a **relative** `T`
  against `process.cwd()` — the directory `wienerdog uninstall` was launched
  from, not the link's directory — so it points elsewhere or throws, and
  `sameResolvedDir` returns **false**.
- Row 4's structural gate then passes (the link is `wienerdog-*` directly under a
  harness skills root), and row 5 unlinks.

**Measured at `0f9ee08`** with a scratch script: a real install in a temp `HOME`,
`~/.claude/skills/wienerdog-rel` created with the *relative* text
`../core-skills/wienerdog-rel` pointing at an existing directory (**not**
dangling), and the entry `{kind:'symlink', path: <link>, target: '../core-skills/wienerdog-rel'}`.

Today (fallback present), through `reverse()`:

```text
readlink(L)  = ../core-skills/wienerdog-rel
realpath(L)  = /private/var/folders/…/wd-probe2-…/.claude/core-skills/wienerdog-rel
cwd          = <the repo checkout>
--- through reverse() ---
link still on disk: false
in removed: true
in skipped: false
stderr: ""
```

With the fallback dropped, same fixture:

```text
--- through reverse() ---
link still on disk: true
in removed: false
in skipped: true
stderr: "wienerdog: keeping …/.claude/skills/wienerdog-rel — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n"
```

**So the WP changes reachable production behavior**, in the preserve direction.
T4c (Exact contracts) is this case as a red-before/green-after `reverse()` test.

Two further divergences, same direction, not separately tested:

- **A race.** The upstream gate realpaths the link, then `reverseSymlink`
  re-walks the path. If the destination disappears in between, today's fallback
  can still match the raw text and unlink; after this WP the entry is preserved.
  This is the pre-existing TOCTOU residual ADR-0028 / WP-159 declare (Node has no
  `openat`/`unlinkat`, and a native addon would violate ADR-0004) — this WP does
  not close it, and moves its outcome from *delete* to *preserve*.
- **Direct callers.** `reverseSymlink` is in `module.exports` (`:1062`). Any
  direct caller passing a dangling `OWNED` entry gets *preserve* instead of
  *unlink*. In this repo the only direct caller is a test (§6); the export is
  documented as a blessed deviation in WP-153's Implementation notes (`:775-778`).

### 5. The forward writer only ever records an ABSOLUTE target

`src/adapters/shared.js:416`, inside `applySkillLinks`:

```js
    const target = path.join(skillsDir, name);
```

`skillsDir` is `path.join(paths.core, 'skills')` at both call sites
(`src/adapters/claude.js:38`, `src/adapters/codex.js:49`), and `paths.core` is
absolute — `getPaths` (`src/core/paths.js:53-55`) takes it from
`assertSafeOverride('WIENERDOG_HOME', …)`, which **throws** on anything that is
not `path.isAbsolute` and free of `.`/`..` segments (`:21-31`), or defaults to
`path.join(home, '.wienerdog')`. All three `recordOnce` sites use that same
`target` (`:434`, and the two creation branches), and `fs.symlinkSync(target,
linkPath)` writes it as the link text too.

**Consequence, and it is the load-bearing justification for §4's decision:** a
manifest entry carrying a *relative* `target` cannot have been produced by
Wienerdog. It is hand-edited or forged input, so preserving it is the correct
fail-safe answer, not a regression. (The one degenerate exception: a `HOME`
environment variable that is itself relative — `env.HOME` is not validated. That
is an unsupported environment, and the outcome there is still *preserve*, which
is safe.)

### 6. The one test that pins the fallback — `tests/unit/manifest.test.js:1564-1595`

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

### 7. Measured blast radius on the existing suite

The R1 edit was applied to a scratch copy of the tree at `0f9ee08`, with the test
file **untouched**, and the **full** `npm test` was run. Exactly **one** existing
test failed:

```text
✖ reverseSymlink: a dangling own link is still removed via the lexical fallback — Table A row 3→5 (T4)
  AssertionError: assert.ok(removed.includes(link))
  at tests/unit/manifest.test.js:1593
```

`ℹ pass 77 / fail 1 / skipped 1` on `tests/unit/manifest.test.js`, and no other
file in the suite regressed. (The failure lands on `:1593`, not `:1592` — the
vacuous `existsSync` assertion above passed.) The scratch edit was reverted;
`git status` is clean.

**Read this correctly.** It bounds the *suite* impact — no other existing test
encodes the dropped behavior. It is **not** evidence of behavior preservation:
the shipped suite simply had no coverage of §4's relative-target case, which is
why T4c exists. Every measured count in this spec's acceptance criteria was taken
with the R2 tests in place.

### 8. The helper idioms your new test needs

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

### 9. What is NOT in scope and must not be confused with the target

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
| modify | tests/unit/manifest.test.js | **R2** only — replace T4 (`:1564-1595`) with the three preserve tests T4a, T4b and T4c. T1, T2, T3, T7 and every other test in the file stay byte-identical. |
| modify | docs/specs/done/WP-153-target-aware-symlink-reverser.md | **R3–R14** — the twelve registered mirrors of the row-3 contract, per Table R. WP-153's own Mirrored Surface Checklist (`:637-643`) requires they move in the **same commit** as R1. Do not touch anything in that file outside the twelve anchors named in Table R. |

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
  // Row 3: the link must PROVE it still resolves to the source we recorded.
  // sameResolvedDir is realpath-based (semantic, follows the link) and is itself
  // fail-closed — an unresolvable side returns false, which lands HERE, in preserve.
  // There is deliberately NO second, link-text comparison: WP-153 shipped one, and
  // WP-symlink-lexical-fallback-removal dropped it because raw-text equality is the
  // weaker proof and the manifest is UNTRUSTED — a recorded target may narrow this
  // delete, never authorize one the semantic proof refuses (e.g. a relative recorded
  // target, which Wienerdog never writes, matched the link text while realpath did
  // not). Strictly narrowing: every input this now preserves was previously deleted.
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

**The V4 gate (R8) makes this text load-bearing to the byte — including the
comment.** V4 diffs the **entire** `reverseSymlink` function against an expected
copy embedded in the gate, so anything you change here — reflowing the notice,
rewording a comment line, altering whitespace, renaming `L` — turns V4 red. Copy
the block above exactly, comment and all.

That coupling is deliberate and it is the point of the round-3 extraction pass
(see the note under R8): three successive grep-shaped gates were each beaten by a
lexical trick, so the gate stopped reasoning about tokens and started comparing
the artifact. The cost is that comment wording is no longer free. Pay it.

**R2 — the test edit.** Replace `tests/unit/manifest.test.js:1564-1595` (the whole
T4 `test(...)` call, quoted byte-exact in Current state §6) with exactly these
**three** tests. They are separate `test()` calls on purpose: T4a and T4c are red
before R1 and green after, T4b is green in both directions, and a single test
could not show those baselines independently.

```js
test('reverseSymlink: a dangling own link is PRESERVED — direct call (T4a)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // Row 3 is one test, sameResolvedDir, and it is fail-closed: a dangling link cannot
  // prove it resolves to the recorded source, so it is preserved. WP-153 shipped a
  // second, link-text sub-test that unlinked exactly this case;
  // WP-symlink-lexical-fallback-removal dropped it, narrowing delete authority.
  // This case is UNREACHABLE through reverse() (see T4b), so the narrowing is only
  // observable here, at the exported-helper boundary.
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

test('reverseSymlink: a DANGLING own link never reaches the reverser through reverse() (T4b)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // Scoped claim: the DANGLING case, and only that case, is unreachable through
  // reverse(). Its symlink arm passes the link path to withinAllowedRoot, whose
  // contains() realpaths it — which FOLLOWS the link and throws on a dangling one —
  // so the entry is preserved at that upstream gate and reverseSymlink never runs.
  // CHARACTERIZATION test: green both before and after
  // WP-symlink-lexical-fallback-removal. The asserted notice is the upstream gate's,
  // not row 3's, which is what proves reverseSymlink was never entered.
  // This does NOT say the dropped sub-test was unreachable in general — T4c is a
  // reachable case that DID change behavior.
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

test('reverseSymlink: a relative-target entry is PRESERVED through reverse(), not unlinked (T4c)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // THE BEHAVIOR CHANGE, red-first, through reverse(). `L` is OWNED and NOT dangling:
  // its link text is RELATIVE and resolves fine, and the entry's `target` is that same
  // relative text. withinAllowedRoot follows L to an in-bounds destination and passes,
  // so reverseSymlink DOES run. Before WP-symlink-lexical-fallback-removal the
  // link-text sub-test matched the raw string and row 5 UNLINKED it. sameResolvedDir
  // alone refuses, because realpath() resolves a relative T against process.cwd(),
  // not against the link's directory.
  // Preserving it is INTENDED: Wienerdog never records a relative target (shared.js
  // joins an absolute core path), so such an entry is hand-edited or forged input,
  // and the manifest is untrusted — a recorded field may narrow deletion, never
  // authorize one the semantic proof refuses.
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills'); // OWNED location — required
  fs.mkdirSync(skillsRoot, { recursive: true });
  const dest = path.join(paths.claudeDir, 'core-skills', 'wienerdog-rel');
  fs.mkdirSync(dest, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-rel');
  const relText = path.join('..', 'core-skills', 'wienerdog-rel');
  fs.symlinkSync(relText, link); // RELATIVE link text that resolves — not the dangling case
  // Fixture preconditions, asserted so a later edit cannot make this test vacuous.
  assert.equal(fs.readlinkSync(link), relText, 'the link text is the relative form');
  assert.equal(fs.existsSync(link), true, 'the link RESOLVES — this is not the dangling case');
  assert.equal(fs.existsSync(relText), false, 'the relative target must not resolve from the test cwd');
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: relText });
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
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the relative-target link is preserved');
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(err, /not the Wienerdog skill link we recorded/);
});
```

Every stderr string asserted above was captured from a live run at `0f9ee08`
(Current state §3 and §4) — they are what the code prints, not a guess. **All
three tests were executed against the real tree while this spec was drafted**,
before and after R1; the measured counts are in the acceptance criteria.

**R3–R14 — the WP-153 amendments.** Each is a byte-exact replacement or insertion
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
| R2 | `tests/unit/manifest.test.js` — T4 | `:1564-1595`, `test('reverseSymlink: a dangling own link is still removed…` | Replaced by the **three** preserve tests in "Exact contracts". **T4a** (direct, dangling) and **T4c** (through `reverse()`, relative target) are red before R1, green after. **T4b** (through `reverse()`, dangling) is green before **and** after. | V1, V2 |
| R3 | WP-153 **Table A row 3** | `:429`, the only line in the file containing `readlinkSync(L) !== T` | Condition cell loses the lexical conjunct; "Why" cell drops "Both sub-tests". Exact text below. | V3a |
| R4 | WP-153 row-3 prose block | `:433-457`, `**Row 3 has two sub-tests on purpose…` through `…only ever *narrows* row 5.)` | Replaced by the one-test block below. | V3a |
| R5 | WP-153 Implementation-notes guard bullet | `:779-785`, `- **Guard the lexical fallback**:` | Replaced by the "no fallback to guard" bullet below. | V3a |
| R6 | WP-153 security-checklist error-path bullet | `:869-875`, `- [ ] Every error path in Table A lands in *preserve*…` | Replaced by the bullet below. | V3a |
| R7 | WP-153 Test-index row T4 | `:806`, the only line in the file containing `DIRECT unit test of` | Replaced by **three** rows, T4a, T4b and T4c, below. The index is one row per `test()` call and R2 produces three. | V3a |
| R8 | WP-153 verification command **V4** | `:936-946`, `# V4 — the reverser consults the recorded target…` through `echo "V4 ok — both row 3 sub-tests present"` | Replaced by the inverted V4 below: `sameResolvedDir` **present**, `readlinkSync` **absent**. | V3b |
| R9 | WP-153 Mirrored Surface Checklist entry | `:637-643`, `- [ ] **(+post-merge) §"Post-merge note — 2026-08-02"**` | Reworded from pending to landed. Exact text below. | V3a |
| R10 | WP-153 post-merge note | insertion **immediately after** the heading line `:1001` | One new blockquote paragraph superseding the note, written **commit-relative and undated** — it may not name a date or claim the change is on `main`, because it is authored inside the pre-merge commit (Codex round 2). **Nothing in the note is deleted or reworded, and the heading line is not touched** — see the anchor warning below. | V3a |
| R11 | WP-153 Deliverables cell for `tests/unit/manifest.test.js` | `:340`, the only line containing `**T1–T4 and T6**` | `T1–T4` becomes `T1–T3, T4a–T4c` (T6 unchanged). A live cell naming a test id that no longer exists. | V3a |
| R12 | WP-153 Mirrored Surface Checklist — test-deliverable entry | `:612`, the only line containing `it mirrors the **Test index** rows T1–T4 and T6` | Same rename. | V3a |
| R13 | WP-153 **AC2** | `:881`, the only line containing `- [ ] **AC2** — T2, T3, T4, T5, T6 and T7 all pass` | `T4` becomes `T4a, T4b, T4c`. A live acceptance criterion naming a test id that no longer exists. | V3a |
| R14 | WP-153 Implementation-notes export bullet | `:775-778`, the only block containing `lets T1/T2/T4/T7 unit-test the` | `T1/T2/T4/T7` becomes `T1/T2/T4a/T7` — T4a is the direct unit call; T4b and T4c go through `reverse()`. | V3a |

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
  the user deleted the core by hand so `realpath(T)` throws.
  `WP-symlink-lexical-fallback-removal` dropped it — **not as dead code, but as
  the weaker of two proofs**: it compared an untrusted recorded value with the
  link's own text, so `target: readlink(L)` satisfied it by construction. The
  reachable case it decided was a **relative** recorded target (`realpath`
  resolves a relative `T` against the process cwd), which `reverse()` used to
  unlink and now preserves — pinned by **T4c**. Wienerdog never records a
  relative target, so such an entry is hand-edited or forged, and *preserve* is
  the fail-safe answer. See
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
  `fs.readlinkSync(L) === T` fallback wrapped in a `try`/`catch`;
  `WP-symlink-lexical-fallback-removal` dropped it as the weaker, forgeable proof
  (`target: readlink(L)` satisfied it by construction), narrowing delete
  authority. Row 3 is `sameResolvedDir(L, T) === false` alone, and
  `sameResolvedDir` is itself fail-closed, so no error path escapes *preserve* —
  see the
  [2026-08-02 post-merge note](#post-merge-note--2026-08-02-the-lexical-fallback-is-dead-through-production-removal-routed).
```

#### R6 — the security-checklist bullet, byte-exact replacement

Remove `:869-875` (begins `- [ ] Every error path in Table A lands in *preserve*`).
Insert in its place:

```text
- [ ] Every error path in Table A lands in *preserve*, never in *delete*:
      `sameResolvedDir` catches and returns `false`, so an unresolvable `L` or `T`
      — including an `OWNED` link left dangling by a hand-deleted core, and a
      recorded target that cannot be resolved because it is relative — falls to
      row 3 and is preserved. **Row 3 is pinned by T4a (direct) and T4c (through
      `reverse()`); T4b pins the separate fact that the DANGLING case is stopped
      upstream and never reaches row 3 at all.** **No row deletes on an error
      path.** The link-text sub-test that once made a dangling or relative-target
      `OWNED` link the exception was dropped by
      `WP-symlink-lexical-fallback-removal` — see the
      [2026-08-02 post-merge note](#post-merge-note--2026-08-02-the-lexical-fallback-is-dead-through-production-removal-routed).
```

#### R7 — the Test-index T4 row, byte-exact replacement

Remove the whole T4 row at `:806` — it is one long line, the only line in the
file containing the string `DIRECT unit test of`. Insert in its place **three**
lines:

```text
| T4a | `tests/unit/manifest.test.js` — **DIRECT unit call of `reverseSymlink`** | **OWNED — required; `T` deleted, so `L` dangles** | **Dangling core → PRESERVE.** The entry carries `target: T` and `L` is still our link, but `T` has been removed from disk, so `sameResolvedDir` cannot succeed. Called **directly**, `reverseSymlink` preserves `L`: still a symlink on disk, reported in `skipped`, row-2 notice printed. **Assert with `lstat`, never `existsSync`** — `existsSync` follows the link and returns `false` for a live dangling link, so an `existsSync` assertion is vacuous here. **Why direct:** the dangling case cannot reach `reverseSymlink` through `reverse()` (T4b), so the exported-helper boundary is the only place this row is observable for it. **Same location precondition as T2** — an unOWNED fixture is preserved by row 4 and proves nothing about row 3. **Red before `WP-symlink-lexical-fallback-removal`, green after.** | Table A row 3 |
| T4b | `tests/unit/manifest.test.js` — through `reverse()` | **OWNED; `T` deleted, so `L` dangles** | **A scoped unreachability fact: the DANGLING case only.** The same fixture, recorded in the manifest and driven through `reverse()`, is preserved — and the notice is `outside every Wienerdog-owned root`, the UPSTREAM `withinAllowedRoot` gate's, not row 3's. That notice is the proof `reverseSymlink` was never entered: `contains()` realpaths the link, which follows it and throws on a dangling one. **CHARACTERIZATION test — green both before and after `WP-symlink-lexical-fallback-removal`.** It does **not** claim the dropped sub-test was unreachable in general; T4c is a reachable case that did change. | upstream `withinAllowedRoot` gate — row 3 never reached |
| T4c | `tests/unit/manifest.test.js` — through `reverse()` | **OWNED; `L` RESOLVES (not dangling); link text and recorded `target` are the same RELATIVE string** | **The behavior change, red-first, on a reachable production path.** `L` resolves, so the upstream gate passes and `reverseSymlink` does run. `realpath()` resolves a relative `T` against `process.cwd()`, not the link's directory, so `sameResolvedDir` returns `false` while raw-text equality would have matched — before `WP-symlink-lexical-fallback-removal`, `reverse()` **unlinked** this entry; after it, row 3 **preserves** it with the row-2 notice. **Preserving is intended:** Wienerdog never records a relative target (`shared.js` joins an absolute core path), so such an entry is hand-edited or forged, and an untrusted recorded field may narrow a delete, never authorize one the semantic proof refuses. Assert the fixture preconditions (link text is relative; the link resolves; the relative target does **not** resolve from the test cwd) so the test cannot go vacuous. | Table A row 3 |
```

#### R8 — V4, byte-exact replacement

Remove `:936-946` (from `# V4 — the reverser consults the recorded target (Table A rows 3+5). Expect BOTH`
through `echo "V4 ok — both row 3 sub-tests present"`). Insert in its place:

```bash
# V4 — reverseSymlink is byte-identical to the expected post-change function.
# ONE diff, no greps. Read the note below before "simplifying" this back.
if ! diff <(sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js) - <<'FN'
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots) {
  const L = entry.path;
  const T = entry.target;
  // Row 1: not a symlink (real file/dir, or already gone) — never ours to delete.
  if (!isSymlink(L)) {
    skipped.push(L);
    return;
  }
  // Row 2: LEGACY (target-less) entry — ownership is unprovable, preserve
  // unconditionally (owner ruling 2026-08-01). No backfill exists or ever will.
  if (typeof T !== 'string' || T === '') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 3: the link must PROVE it still resolves to the source we recorded.
  // sameResolvedDir is realpath-based (semantic, follows the link) and is itself
  // fail-closed — an unresolvable side returns false, which lands HERE, in preserve.
  // There is deliberately NO second, link-text comparison: WP-153 shipped one, and
  // WP-symlink-lexical-fallback-removal dropped it because raw-text equality is the
  // weaker proof and the manifest is UNTRUSTED — a recorded target may narrow this
  // delete, never authorize one the semantic proof refuses (e.g. a relative recorded
  // target, which Wienerdog never writes, matched the link text while realpath did
  // not). Strictly narrowing: every input this now preserves was previously deleted.
  if (!sameResolvedDir(L, T)) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4: a target match is NOT delete authority — the manifest is untrusted, so
  // an attacker can forge a (path, target) pair. Require the STRUCTURAL ownership
  // proof reverseCopiedSkill uses: wienerdog-* basename AND parent realpath-equal
  // to a harness skills root.
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root));
  if (!path.basename(L).startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 5: OWNED, in-namespace, and provably resolves to our recorded source.
  if (!dryRun) fs.unlinkSync(L);
  removedSet.add(L);
  removed.push(L);
}
FN
then
  echo "REGRESSED: reverseSymlink is not byte-identical to the expected function"; exit 1
fi
echo "V4 ok — reverseSymlink is byte-identical to the expected function"
```

**Why one whole-function diff and not greps — do NOT "simplify" this back.** This
gate drew a review finding in **three consecutive rounds**, each time because a
*lexical* check was asked to prove a *semantic* property. The history, all
reproduced against the exact pipeline of the round in question:

| Round | Gate shape | The evasion that beat it |
|---|---|---|
| 1 | grep the raw function body | a comment naming `sameResolvedDir` satisfied the presence check while the real guard was deleted |
| 2 | strip `//` comments, then grep | `/* if (!sameResolvedDir(L, T)) { */` above `if (false) {` passed; and a block comment merely *mentioning* the dropped call falsely failed correct code |
| 3 | ban `/*`, byte-exact **row-3 block**, strip-and-grep | `if ('//' && fs.readlinkSync(L) === T) { … }` — a `//` inside a **string literal** made `sed` strip the rest of the line, hiding the reintroduced call; and the mandated block nested under `if (false) { … }` still matched the range diff |

Three rounds is the ADR-0031 loop circuit-breaker. The fix is not a fourth grep,
it is **extraction**: the expected post-change function is fully determined (the
base function minus one deletion), so the gate compares the whole function
byte-for-byte and the entire lexical class dies at once — comment evasion, string
literals, control-flow nesting, duplicate-function shadowing (a second
`function reverseSymlink` later in the file lands inside the `sed` range and
changes the diff), whitespace, everything. The mutation matrix collapses to a
single rule: **any byte differs → red.**

**Consequences you must accept, not work around:**

- **The comment text inside `reverseSymlink` is now part of the contract.** It is
  in the heredoc, so rewording it fails V4. That is the price of a sound gate;
  reword it only in a WP that updates the heredoc in the same commit.
- **This subsumes the old V4b** (row 4's ownership grep, WP-153 `:948-956`). V4b
  is left in place — it is not in this WP's anchor set — but it can no longer
  fail while V4 passes.
- **A legitimate future edit to this function fails V4 until the heredoc moves
  with it.** That is the intended coupling, and it is what "Table A decides row 3"
  has meant since WP-153.

#### R9 — the Mirrored Surface Checklist entry, byte-exact replacement

Remove `:637-643` (begins `- [ ] **(+post-merge) §"Post-merge note — 2026-08-02"**`).
Insert in its place:

```text
- [ ] **(+post-merge) §"Post-merge note — 2026-08-02"** — it records the lexical
      sub-test that **used to** live in **Table A row 3** and names the WP that
      removed it. It is a **record of a divergence that has since been closed**,
      not a second source of truth: Table A still decides row 3.
      `WP-symlink-lexical-fallback-removal` satisfied it: that WP's single
      implementation commit moved this note, Table A row 3, the
      Implementation-notes guard bullet, the security-checklist error-path bullet,
      T4 (now T4a/T4b/T4c) and V4 together with the code, which is exactly what
      this entry required.
```

#### R10 — the post-merge note resolution, insertion only

Insert the following as a new paragraph **immediately after** the heading line at
`:1001` and the blank line that follows it, i.e. **above** the existing
`> **This section is a RECORD, not a contract change.**` blockquote. Delete
nothing; reword nothing; leave the heading byte-identical.

```text
> **SUPERSEDED by `WP-symlink-lexical-fallback-removal`, whose implementation
> commit this paragraph is part of. That WP also CORRECTED this note's central
> claim.** Everything below is the original record, kept verbatim. Two things
> carry forward instead of it:
>
> 1. **The unreachability proof below is SOUND BUT TOO NARROW.** It proves the
>    DANGLING case cannot reach `reverseSymlink` through `reverse()`, and that is
>    true. It does **not** prove the branch as a whole was dead. The Codex design
>    gate on that WP found a reachable counterexample: an `OWNED`,
>    **non-dangling** link whose text is relative, with `target` set to that same
>    text. `realpath()` resolves a relative `T` against the process cwd, so
>    `sameResolvedDir` fails while the raw-text test matched — and `reverse()`
>    unlinked it. Measured both ways. So the removal was a real, reachable
>    behavior change, in the **preserve** direction (an untrusted recorded target
>    may narrow a delete, never authorize one the semantic proof refuses), pinned
>    by the new **T4c**.
> 2. **What that commit changes, alongside this paragraph:** the link-text
>    sub-test leaves `src/core/manifest.js`; Table A row 3 becomes
>    `sameResolvedDir(L, T) === false` alone; the Implementation-notes bullet and
>    the security-checklist bullet are rewritten; T4 becomes **T4a/T4b/T4c**, all
>    asserting *preserve*; and V4 becomes a three-check gate that fails on the
>    sub-test's **presence**. The sentences below reading *"it is nonetheless what
>    ships"*, *"the fallback is dead through production"* and the standing
>    instruction's *"the fallback stays in the code and in the contract"* describe
>    the state before that commit. The standing instruction was satisfied, not
>    broken — its condition ("until that WP lands") is met by this very commit.
```

#### R11–R14 — the four live `T4` references, surgical substring replacements

R2 renames one test into three, so every **live** place in WP-153 that names `T4`
as an existing test becomes wrong. These four are surgical: change **only** the
quoted substring on the named line, leave the rest of the line byte-identical.
(Every other `T4` in that file — `:643`, `:1005`, `:1034`, `:1044`, `:1056`,
`:1059`, `:1220`, `:1250`, `:1253`, `:1262` — is inside the post-merge note or a
dated review-gate record and is **out of scope**; see Out of scope.)

| # | Line | Replace this substring | With this |
|---|------|------------------------|-----------|
| R11 | `:340` (Deliverables cell) | `**T1–T4 and T6**` | `**T1–T3, T4a–T4c and T6**` |
| R12 | `:612` (Mirrored Surface Checklist) | `rows T1–T4 and T6` | `rows T1–T3, T4a–T4c and T6` |
| R13 | `:881` (AC2) | `T2, T3, T4, T5, T6 and T7 all pass` | `T2, T3, T4a, T4b, T4c, T5, T6 and T7 all pass` |
| R14 | `:777` (Implementation-notes export bullet) | `lets T1/T2/T4/T7 unit-test the` | `lets T1/T2/T4a/T7 unit-test the` |

Each substring was confirmed to appear **exactly once** in the file at `0f9ee08`
(`grep -cF` → `1` for all four). R14 names only `T4a` because T4b and T4c drive
`reverse()` and do not depend on the export; T4a is the direct unit call.

### Mirrored Surface Checklist

Every surface in **this** spec that restates a fact decided by Table R, so a
review finding updates the table and all its mirrors in one pass:

- [ ] Deliverables-table cells — all three rows name their R-numbers (R1; R2;
      R3–R14). **Register-new-mirrors note:** that third cell states the range
      "R3–R14" and the count "twelve"; if Table R gains or loses a row in that
      file, both must move with it. (It already moved once: Codex round 1 found
      four unregistered live `T4` mirrors, now R11–R14.)
- [ ] Acceptance criteria AC1–AC7 — each names the R-number it gates.
- [ ] Verification commands B1, V1–V8 — V3a is a sentinel grep set derived from
      R3–R14, V3b the code gate for R1, V3c/V3d the byte-exactness and lockstep
      gates for AC6.
- [ ] Current state §1, §3, §4, §5 and §6 — they quote the *pre*-change text of R1
      and R2 and the measured evidence for both reachability claims.
- [ ] "Exact contracts" — the full replacement text for R1 and R2, plus the
      executable-guard constraint V4 imposes on R1.
- [ ] The R3–R14 sub-sections under Table R — the full replacement text for the
      WP-153 mirrors.
- [ ] The **Context** section's "Why this is a behavior change" subsection and the
      **top-of-file blockquote** — both restate Table R's R1 characterization
      (narrowing, not dead-code removal). **Registered by Codex round 1**: if the
      characterization ever changes, these two move with R1.

Registered **outside** this spec so a later change knows this table is its source
— **none is a deliverable and none may be edited by the implementer**:

- [ ] `docs/specs/done/WP-153-…:1250-1264` — the dated **review-gate log** bullet
      *"T4 / row-3-fallback — the fallback is DEAD THROUGH PRODUCTION…"*, which
      says V4 *"keeps its ratified expectation — both sub-tests"*. That is a
      record of what a review round decided on 2026-08-02, not a live contract
      claim, and this repo does not rewrite dated review records. **Its
      "dead through production" premise is now known too narrow** (Current state
      §4) — the correction is carried by R10's insertion, which the reader meets
      first. Left alone deliberately; registered here so a future editor knows
      Table R (and then Table A) is its source.
- [ ] `src/adapters/shared.js:400-412` and `:441` — the WP-146 install-side
      preserve arm, its own `readlinkSync` comparison and its comment naming
      `reverseSymlink`. A **different mechanism** (Current state §9). Already
      registered in WP-153's own out-of-spec list; unchanged by this WP.
- [ ] `docs/specs/done/WP-153-…:429`'s row-4 residual and
      `WP-forward-time-ownership-provenance` — the general rule this WP applies
      ("an untrusted manifest field may only narrow deletion") is **not** written
      down as an ADR anywhere. This WP applies it to row 3 and records the
      reasoning in Context; it does not elevate it. If the owner wants the rule
      general, that is its own ADR — named here, deliberately not done.

## Implementation notes & constraints

- **This is a one-branch deletion, not a redesign.** If your diff to
  `src/core/manifest.js` is more than the block in R1, you have gone too far.
- No new npm dependency, no new `require`, no change to `module.exports`
  (ADR-0004: nothing here starts anything).
- **Do not "fix" the vacuous `existsSync` assertion anywhere else in the file.**
  It is a trap only in the T4 fixture, which you are replacing wholesale.
- **Do not grep for the word "lexical"** to find your edit sites — it also hits
  `src/adapters/shared.js`, `docs/adr/0028-*`, three other done specs and the
  security-audit archive, none of which are yours. Use the R-anchors in Table R.
- **Reproduce the `reverseSymlink` function exactly as R1 gives it — every byte,
  comments included.** V4 diffs the whole function against an embedded expected
  copy. There is no longer any part of this function you may reword "harmlessly":
  if V4 is red, either your code differs from R1 or you changed R1 without
  changing V4's heredoc, and both are failures.
- **T4b must be green against the untouched tree** (AC4, run B1). If it is red
  before R1, your fixture is wrong, not the code — most likely the link is not
  directly under `<claudeDir>/skills`, or its destination is outside
  `claudeDir` so the upstream gate preserves it for the wrong reason.
- **T4c must be RED against the untouched tree** (AC2, run B1). If it is green
  before R1, the fixture is not exercising the dropped sub-test — check the three
  precondition assertions: relative link text, link resolves, relative target does
  **not** resolve from the test cwd.
- **Do not "fix" the relative-target case by making `sameResolvedDir` resolve `T`
  against the link's directory.** That would re-widen delete authority on an
  untrusted field and is a different, unspecified change. If you think it is
  right, say so under "Discovered issues"; do not do it.
- Commit R1, R2 and R3–R14 **together, in one commit** (V3d proves it). Splitting
  them leaves `main` in a state where WP-153's own V4 fails against the repo it
  ships in.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] **The change only ever narrows delete authority — this is the load-bearing
      security property.** Removing a disjunct from a `!A && !B` preserve-guard
      leaves `!A`, which holds strictly more often: more inputs preserved, never
      fewer. Confirm by inspection that no row gained a delete path, and that the
      only edit is the removal of the disjunct and its computation.
- [ ] **The stronger of two ownership proofs is the one that survives.** The
      dropped sub-test compared an untrusted manifest value to a value read off
      the link — satisfiable by forging `target: readlink(L)`, which is precisely
      T7's forgery shape. The surviving `sameResolvedDir` requires the link to
      actually resolve to the recorded source. **After this WP a recorded
      `target` can only ever narrow a delete, never authorize one.**
- [ ] **Every error path still lands in preserve.** `sameResolvedDir` catches and
      returns `false` (Current state §2), and `false` lands in row 3 → `skipped`.
      There is no code path in the amended `reverseSymlink` where an exception or
      an unresolvable path reaches row 5.
- [ ] **The reachable behavior change is bounded and in the safe direction.** The
      relative-target case (§4) and the upstream-realpath race (§4) both move from
      *delete* to *preserve*. The user-visible cost is a stale symlink plus the
      `keeping <path> — not the Wienerdog skill link we recorded` notice. Nothing
      that was deleted before is deleted differently; nothing new is deleted.
- [ ] **Row 4's structural ownership proof is untouched** — `wienerdog-` basename
      **and** parent realpath-equal to a harness skills root. V4b (WP-153's, which
      this WP does not change) still passes.
- [ ] No untrusted identifier newly flows into a filesystem path or a shell
      command: this WP adds no path construction at all.

## Acceptance criteria

- [ ] **AC1 (R1)** — V3b passes: the whole `reverseSymlink` function, comments
      included, is **byte-identical** to the expected post-change function embedded
      in that gate. One diff, no greps — see the note under R8 for why. (V3b.)
- [ ] **AC2 (R2, red → green — the behavior change)** — **T4a** and **T4c** both
      fail against the untouched `src/core/manifest.js` and both pass after R1.
      Both runs pasted into the PR. Expected counts on
      `tests/unit/manifest.test.js`: **`pass 78 / fail 2 / skipped 1`** before R1
      (the two failures being T4a and T4c), **`pass 80 / fail 0 / skipped 1`**
      after. Measured while drafting, on the exact code in "Exact contracts".
- [ ] **AC3 (bounded blast radius)** — `npm test` is fully green after R1+R2, and
      the **only** tests whose source changed are T4a/T4b/T4c. Every other test in
      `tests/unit/manifest.test.js` — T1, T2, T3, T7 and the 70-odd others —
      passes unmodified. Expected full-suite counts: **`pass 1894 / fail 0 /
      skipped 9`** (measured while drafting; the number moves only if another WP
      lands first — what must hold is `fail 0` and the same skip count as the
      pre-change run). **This bounds the change; it does not by itself prove
      behavior preservation, which this WP does not claim** (see AC7). (V1, V2.)
- [ ] **AC4 (the scoped unreachability fact)** — **T4b** passes against the
      untouched tree as well as after R1, and asserts the
      `outside every Wienerdog-owned root` notice. Both runs pasted into the PR.
- [ ] **AC5 (mutation checks — FIVE, all required)** — V4's rule is now *any byte
      differs → red*, so the matrix is a list of things that must all be caught,
      not a list of grep shapes. Apply each to `src/core/manifest.js`, run V3b,
      then `git checkout -- src/core/manifest.js`. Paste every output; each must
      print `REGRESSED: reverseSymlink is not byte-identical to the expected
      function` **and** a legible `diff` hunk.
      **(a) Fallback restored** — paste the Current-state §1 block back. Also run
      the tests: **T4a and T4c go red**, T4b stays green.
      **(b) String-literal evasion** — insert
      `if ('//' && fs.readlinkSync(L) === T) { fs.unlinkSync(L); return; }` above
      row 3. *This beat the round-2 gate* (the `//` inside the string made `sed`
      strip the rest of the line, hiding the call from the token grep).
      **(c) Control-flow nesting** — wrap the unmodified row-3 block in
      `if (false) { … }`. *This also beat the round-2 gate*: the block was still
      byte-exact, it just never ran.
      **(d) Block comment** — add `/* anything */` inside the function.
      **(e) Arbitrary byte flip** — change one `skipped.push(L)` to
      `skipped.push(l)`.
      All five were measured red, and the unmutated function measured green,
      while this spec was drafted.
- [ ] **AC6 (mirrors moved, R3–R14)** — the twelve WP-153 anchors carry their
      replacement text byte-exactly (V3c: the full diff is pasted and compared
      hunk-by-hunk against the R-blocks), the post-merge-note **heading line is
      unchanged**, all five in-document links to that anchor still resolve, and
      **no live `T4` reference remains** in that file outside the post-merge note
      and the dated review-gate log. R1, R2 and R3–R14 are in **one** commit
      (V3d).
- [ ] **AC7 (the characterization is stated, not implied)** — the PR body says in
      its own words that this is a **narrowing behavior change**, names the
      relative-target case as the reachable input that changes, and states that
      preserving it is intended. A PR that describes this as dead-code removal
      fails this criterion.
- [ ] `npm run lint` is green.

## Verification steps (run these; paste output in the PR)

```bash
# ── BEFORE the code change (baseline; run this first, paste it) ───────────────
# B1 (AC2 red, AC4 before) — apply R2 (the TEST edit) FIRST and leave
# src/core/manifest.js untouched, then run:
node tests/run.js tests/unit/manifest.test.js
# Expect exactly: `pass 78 / fail 2 / skipped 1`, the two failures being
#   ✖ reverseSymlink: a dangling own link is PRESERVED — direct call (T4a)
#   ✖ reverseSymlink: a relative-target entry is PRESERVED through reverse(), not unlinked (T4c)
# T4b is IN that pass count — the AC4 "green before" evidence. T4c's red run IS
# the proof that this WP changes reachable production behavior: today reverse()
# unlinks that entry. All three counts were measured at 0f9ee08 while drafting.

# ── AFTER R1 + R2 + R3-R14 ────────────────────────────────────────────────────
# V1 — the manifest suite. shared-skill-links is included because it shares the
# scheduler guard the suite depends on (WP-153's V1, unchanged).
# Expect `pass 80 / fail 0 / skipped 1` on manifest.test.js.
node tests/run.js tests/unit/manifest.test.js tests/unit/shared-skill-links.test.js

# V2 — full suite. AC3: expect `pass 1894 / fail 0 / skipped 9` (measured while
# drafting at 0f9ee08 with R1+R2 applied), and manifest.test.js as the only
# changed test file.
npm test

# V3a — sentinel greps over the WP-153 mirrors. NECESSARY, NOT SUFFICIENT: these
# prove each anchor moved, not that it moved to the byte-exact text. V3c is the
# byte-exactness gate. Every sentinel was confirmed to appear EXACTLY ONCE in
# that file at 0f9ee08, so the before/after counts are unambiguous. `grep -c`
# exits 1 on a zero count; that exit code is the expected result for the
# "expect 0" lines, not a failure.
SPEC=docs/specs/done/WP-153-target-aware-symlink-reverser.md
grep -cF 'readlinkSync(L) !== T' "$SPEC"                    # was 1, expect 0 (R3)
grep -cF '**Guard the lexical fallback**' "$SPEC"           # was 1, expect 0 (R5)
grep -cF '**Row 3 has two sub-tests on purpose' "$SPEC"     # was 1, expect 0 (R4)
grep -cF 'DIRECT unit test of' "$SPEC"                      # was 1, expect 0 (R7)
grep -cF '**T1–T4 and T6**' "$SPEC"                         # was 1, expect 0 (R11)
grep -cF 'rows T1–T4 and T6' "$SPEC"                        # was 1, expect 0 (R12)
grep -cF 'T2, T3, T4, T5, T6 and T7 all pass' "$SPEC"       # was 1, expect 0 (R13)
grep -cF 'lets T1/T2/T4/T7 unit-test the' "$SPEC"           # was 1, expect 0 (R14)
grep -cF '**Row 3 has exactly one test' "$SPEC"             # expect 1 (R4)
grep -cF 'SUPERSEDED by `WP-symlink-lexical-fallback-removal`' "$SPEC"  # expect 1 (R10)
grep -cF 'V4 ok — reverseSymlink is byte-identical' "$SPEC" # expect 1 (R8)
grep -cF '`WP-symlink-lexical-fallback-removal` satisfied it' "$SPEC" # expect 1 (R9)
grep -cF '| T4b |' "$SPEC"                                  # expect 1 (R7)
grep -cF '| T4c |' "$SPEC"                                  # expect 1 (R7)
grep -cF 'No row deletes on an error' "$SPEC"               # expect 1 (R6)
grep -cF '## Post-merge note — 2026-08-02: the lexical fallback is dead through production, removal routed' "$SPEC"  # expect 1 — the heading is UNCHANGED (R10 anchor warning)

# V3a2 (AC6) — no LIVE `T4` reference survives. Every remaining hit must be in
# the post-merge note (>= line 1001 pre-edit) or the dated review-gate log.
# Inspect each hit by eye and say so in the PR; there is no automatic test for
# "is this line a dated record".
grep -n '\bT4\b' "$SPEC"

# V3b — R1 (AC1). This is R8's V4 verbatim; run it here too, so the gate this WP
# installs and the gate this WP is judged by are provably the same text. ONE diff:
# reverseSymlink must be byte-identical to the expected post-change function.
# Greps were tried in three review rounds and beaten three times — see the note
# under R8 before changing this.
# V4 — reverseSymlink is byte-identical to the expected post-change function.
# ONE diff, no greps. Read the note below before "simplifying" this back.
if ! diff <(sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js) - <<'FN'
function reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots) {
  const L = entry.path;
  const T = entry.target;
  // Row 1: not a symlink (real file/dir, or already gone) — never ours to delete.
  if (!isSymlink(L)) {
    skipped.push(L);
    return;
  }
  // Row 2: LEGACY (target-less) entry — ownership is unprovable, preserve
  // unconditionally (owner ruling 2026-08-01). No backfill exists or ever will.
  if (typeof T !== 'string' || T === '') {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 3: the link must PROVE it still resolves to the source we recorded.
  // sameResolvedDir is realpath-based (semantic, follows the link) and is itself
  // fail-closed — an unresolvable side returns false, which lands HERE, in preserve.
  // There is deliberately NO second, link-text comparison: WP-153 shipped one, and
  // WP-symlink-lexical-fallback-removal dropped it because raw-text equality is the
  // weaker proof and the manifest is UNTRUSTED — a recorded target may narrow this
  // delete, never authorize one the semantic proof refuses (e.g. a relative recorded
  // target, which Wienerdog never writes, matched the link text while realpath did
  // not). Strictly narrowing: every input this now preserves was previously deleted.
  if (!sameResolvedDir(L, T)) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 4: a target match is NOT delete authority — the manifest is untrusted, so
  // an attacker can forge a (path, target) pair. Require the STRUCTURAL ownership
  // proof reverseCopiedSkill uses: wienerdog-* basename AND parent realpath-equal
  // to a harness skills root.
  const parentIsRoot = skillsRoots.some((root) => sameResolvedDir(path.dirname(L), root));
  if (!path.basename(L).startsWith('wienerdog-') || !parentIsRoot) {
    process.stderr.write(
      `wienerdog: keeping ${L} — not the Wienerdog skill link we recorded (replaced, or unverifiable)\n`
    );
    skipped.push(L);
    return;
  }
  // Row 5: OWNED, in-namespace, and provably resolves to our recorded source.
  if (!dryRun) fs.unlinkSync(L);
  removedSet.add(L);
  removed.push(L);
}
FN
then
  echo "REGRESSED: reverseSymlink is not byte-identical to the expected function"; exit 1
fi
echo "V4 ok — reverseSymlink is byte-identical to the expected function"

# V3c (AC6, byte-exactness) — bound the WP-153 diff, then paste it IN FULL and
# compare each hunk against the R3-R14 blocks in this spec. The comparison is the
# gate; the numstat is the bound that makes an unnoticed extra hunk impossible.
git diff --numstat main -- "$SPEC"
git diff main -- "$SPEC"

# V3d (AC6, one-commit lockstep) — R1, R2 and R3-R14 in ONE commit. Note what this
# must prove: NOT "HEAD touches four paths" (a trivial HEAD touching all four would
# satisfy that while R1 landed in an earlier commit), but "exactly one commit on
# this branch touches any of them". Measured: the weaker form passes on a branch
# whose deliverables are split; this form reports the split and names both commits.
BASE=$(git merge-base main HEAD)
COMMITS=$(git log --format=%H "$BASE"..HEAD -- \
  src/core/manifest.js tests/unit/manifest.test.js \
  docs/specs/done/WP-153-target-aware-symlink-reverser.md \
  docs/specs/WP-symlink-lexical-fallback-removal.md | sort -u)
N=$(printf '%s\n' "$COMMITS" | grep -c .)
if [ "$N" -ne 1 ]; then
  echo "FAIL (AC6): the deliverables are split across $N commits (must be 1):"
  printf '%s\n' "$COMMITS"; exit 1
fi
echo "lockstep ok — single commit $(git rev-parse --short "$COMMITS")"

# …and that commit's path set is EXACTLY the four (LC_ALL=C sort order). Must
# print nothing and exit 0.
diff <(git show --name-only --format= "$COMMITS" | sed '/^$/d' | LC_ALL=C sort -u) - <<'EOF'
docs/specs/WP-symlink-lexical-fallback-removal.md
docs/specs/done/WP-153-target-aware-symlink-reverser.md
src/core/manifest.js
tests/unit/manifest.test.js
EOF
echo "path set ok"

# …and its full patch must actually contain R1, R2 and R3-R14. Paste it and say
# so explicitly in the PR; there is no automatic test for "this hunk is R11".
git show "$COMMITS"

# V4b (WP-153's, unchanged) — row 4's structural ownership gate survived.
BODY=$(sed -n '/^function reverseSymlink/,/^}/p' src/core/manifest.js)
for L in "startsWith('wienerdog-')" "skillsRoots"; do
  printf '%s\n' "$BODY" | grep -qF "$L" || {
    echo "REGRESSED: row 4 ownership gate missing: $L"; exit 1; }
done
echo "V4b ok — structural ownership gate present"

# V5 — the five AC5 mutations. For each: edit src/core/manifest.js, re-run the
# V3b block above, then `git checkout -- src/core/manifest.js`. Every one must
# print `REGRESSED: reverseSymlink is not byte-identical to the expected function`
# plus a legible diff hunk. Mutation (a) additionally changes test outcomes, so
# run the suite for that one too.
#   (a) restore the Current-state §1 `lexicalMatch` block   → also: T4a, T4c red
#   (b) insert  if ('//' && fs.readlinkSync(L) === T) { fs.unlinkSync(L); return; }
#   (c) wrap the unmodified row-3 block in  if (false) { … }
#   (d) add  /* anything */  inside the function
#   (e) change one  skipped.push(L)  to  skipped.push(l)
# (b) and (c) are the two that beat the round-2 gate; they are in this list so a
# future editor cannot re-weaken V4 without noticing.
node tests/run.js tests/unit/manifest.test.js   # for mutation (a) only

# V7 — lint.
npm run lint

# V8 — the permission boundary (CI runs this too).
node scripts/boundary-check.js docs/specs/WP-symlink-lexical-fallback-removal.md \
  src/core/manifest.js tests/unit/manifest.test.js \
  docs/specs/done/WP-153-target-aware-symlink-reverser.md
```

## Out of scope (do NOT do these)

- **`src/adapters/shared.js`** — its `applySkillLinks` preserve arm, its own
  `readlinkSync` comparison, and the `:441` comment that names `reverseSymlink`'s
  historical target-blindness. A different mechanism (Current state §9). WP-153
  already registered `:400-412` for a later documentation pass; that pass is not
  this WP.
- **Any other reverser** — `reverseCopiedSkill`, `reverseVendoredTree`,
  `reverseManagedBlock`, `reverseSettingsEntry`, `reverseSchedulerEntry`.
- **The upstream `withinAllowedRoot` gate at `manifest.js:818-828`.** Its
  link-following `realpathSync` is what stops the dangling case reaching row 3.
  Do not "improve" it to stop following the link — that would make the dangling
  case reachable and is a behavior change nobody has specified.
- **Making `sameResolvedDir` resolve a relative `T` against the link's own
  directory.** That is the "fix" the relative-target case invites, and it would
  re-widen delete authority on an untrusted field — the opposite of this WP.
  If you think it is right, say so under "Discovered issues".
- **An ADR for the general rule** *"an untrusted manifest field may only narrow
  deletion"*. This WP applies that rule to row 3 and records the reasoning in
  Context; no ADR states it generally today. Elevating it is its own work — named
  in the Mirrored Surface Checklist, deliberately not done here.
- **Rewriting WP-153's dated review-gate log** (`:1250-1264`) or its
  security-audit references, even though the log's "dead through production"
  premise is now known too narrow. Records stay as recorded; R10's insertion is
  where the correction lives, and the reader meets it first.
- **The forward-time ownership-provenance residual** — a `wienerdog-*` link the
  user made that happens to resolve to the recorded source is still deletable.
  That is WP-153's declared residual, routed to
  `WP-forward-time-ownership-provenance`, and this WP neither widens nor closes it.
- **The upstream-realpath TOCTOU race** (Current state §4). Pre-existing, declared
  in ADR-0028 / WP-159, unclosable without `openat`/`unlinkat`. This WP moves its
  outcome from *delete* to *preserve* as a side effect and does nothing else about
  it. Do not add a test for it.
- **`docs/GLOSSARY.md`, `docs/THREAT-MODEL.md`, or a `CHANGELOG.md` entry.** The
  behavior change is reachable only by a hand-edited or forged manifest entry, so
  there is nothing to tell a user; if a reviewer disagrees, that is a separate
  docs WP.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   **both** directions of AC2 and AC4, and all four AC5 mutation outputs.
2. Branch `wp/symlink-lexical-fallback-removal`; conventional commits; PR titled
   `fix(manifest): narrow reverseSymlink row 3 to the semantic proof (WP-symlink-lexical-fallback-removal)`.
   **`fix`, not `chore`** — this changes reachable behavior (AC7).
3. R1, R2 and R3–R14 land in **one** commit (V3d proves it).
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
   The body must satisfy **AC7**: state that this is a narrowing behavior change,
   name the relative-target case, and say that preserving it is intended.
5. This spec's `status:` flipped to `In-Review` in the same PR.
