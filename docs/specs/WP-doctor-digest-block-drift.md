---
id: WP-doctor-digest-block-drift
title: Report managed-block drift against the current digest in wienerdog doctor
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: digest-delivery
---

# WP-doctor-digest-block-drift: Report managed-block drift against the current digest in `wienerdog doctor`

## Context (read this, nothing else)

Wienerdog gives a user's AI a memory made of files. The **digest** is the
pre-rendered session-context file `~/.wienerdog/state/digest.md` (identity notes
plus active context), rendered deterministically by `renderDigest`
(`src/core/digest.js`). The **managed block** is the sentinel-delimited region
(`<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->`) that Wienerdog owns inside
the user's `~/.claude/CLAUDE.md` and `$CODEX_HOME/AGENTS.md`; Wienerdog never
edits outside it. **Wienerdog is just files** — this WP adds no process, no
daemon, no telemetry (ADR-0004).

**The block and the digest can be out of step, and today nothing says so.** The
digest file is rewritten by every nightly dream run *and* by `wienerdog sync`; the
managed block is written **only** by an attended `wienerdog sync`
(`src/cli/sync.js` → `shared.applyManagedBlock`). So whenever a render changes the
bytes — identity re-approved, project list changed, an alert / quarantine /
update banner toggling on or off — the block goes stale and **stays** stale until
the user next runs `sync`, which can be days. `wienerdog doctor` performs **zero**
comparison between the two: it checks the core dir, the manifest, `config.yaml`,
the vault, file permissions, harness detection, scheduler load, skill links, stale
hooks and Google readiness — and never once looks at whether the block matches the
digest. The drift is invisible on every surface.

**`doctor` never mutates.** That is a standing invariant (WP-070): `doctor`
reports, `sync` fixes. Every check here is read-only, and every finding carries the
`run 'wienerdog sync'` remediation.

**Why this matters more now.** `WP-session-start-digest-dedup` makes the
SessionStart hook stay silent when the block already carries the digest. That
turns "the block is fresh" into a decision a user cannot see. This check is the
independent surface where the same fact is observable on demand — which is why
that WP depends on this one.

## Current state

All citations in this section were re-measured against `main` = **`0410e3a`**
(2026-08-30), after the `quarantine-surface` epic landed and moved everything in
this file.

`src/cli/doctor.js` is **586 lines**. Its shape: a set of module-level check
functions that each return `{status, msg}[]` and never throw — `skillLinkChecks`
(line 67), `staleHookChecks` (line 185), `googleReadinessChecks` (line 237),
`quarantineReport` (line 371) — plus an `async run(_argv)` (line 451) that prints
one `[status] msg` line per finding through a local `check(status, msg)` helper
and sets `process.exitCode = 1` only on `fail`. `module.exports = { run };` is
line 586.

The relevant tail of `run()` (verbatim, lines 559–578):

```js
  if (harnesses.codex.present) {
    for (const c of skillLinkChecks(paths, path.join(paths.codexDir, 'skills'), 'Codex')) check(c.status, c.msg);
  }

  // Stale/foreign Wienerdog session hooks: a wienerdog-shaped hook whose target script no
  // longer exists (e.g. a since-purged temp core merged into the real settings). Read-only;
  // warn with a manual-removal hint — we never edit a settings file we did not record.
  for (const c of staleHookChecks(paths, harnesses)) check(c.status, c.msg);

  // Google client-library readiness for a connected account (WP-103).
  // Read-only; silent when Google is not connected; a missing library is a warn.
  for (const c of googleReadinessChecks(paths)) check(c.status, c.msg);

  // Quarantine counts, by reason, from the ledger — and a pointer at the one
  // vault file that names the sessions. Never an enumeration on this surface
  // (ADR-0023 Amendment 2).
  for (const c of quarantineReport(paths.state, vaultPath)) {
    if (c.status === 'info') console.log(`[info] ${c.msg}`);
    else check(c.status, c.msg);
  }

  // Cache-only update notice (no network; does not affect pass/fail). ADR-0015.
  const upd = getUpdateNotice(paths);
```

**The insertion point for this WP is between line 563 and line 565** — after the
`staleHookChecks` loop, before the Google-readiness comment. `harnesses` is in
scope from line 534 (`const harnesses = detectHarnesses();`); `detectHarnesses` (`src/core/detect.js`) reports a harness present iff
its config directory exists, honouring `$WIENERDOG_CLAUDE_DIR` / `$CLAUDE_CONFIG_DIR`
and `$CODEX_HOME` via `getPaths`.

`src/adapters/shared.js` already owns both halves of the comparison, but exports
only one of them. `buildBlock(digest)` (lines 146–157) is exported;
`locateManagedBlock(content, what)` (line 20, JSDoc from line 11) is **not**. Its contract,
verbatim from its JSDoc:

> Locate the SINGLE managed block by FULL-LINE sentinel match (a line whose
> trimmed content equals the sentinel). Returns `{begin, end}` character offsets
> where `begin` = start of the BEGIN line and `end` = position just past the END
> sentinel text on its line (matching the historical slice offsets), OR null when
> no sentinel line exists. Throws WienerdogError when the markers are AMBIGUOUS:
> more than one BEGIN or END line, or an END line before the BEGIN line, or
> exactly one of the two present — refuse to edit rather than guess and swallow
> user text.

Its current export line (line 526, verbatim):

```js
module.exports = { recordOnce, recordSettingsEntry, buildBlock, applyManagedBlock, copyHookScript, toPosixCommand, applySettings, applySkillLinks };
```

The thrown message is exactly:

```text
ambiguous wienerdog managed-block markers in ${what} — refusing to edit (resolve by hand)
```

`applyManagedBlock` writes exactly `buildBlock(digest)` between the sentinels on
every branch, so `content.slice(span.begin, span.end) === buildBlock(digest)` is
the precise freshness predicate.

**Fixture facts, measured 2026-08-30 against `bin/wienerdog.js`:**

- `init --yes` (no vault) writes **no** `state/digest.md` and **no** `CLAUDE.md` —
  so this check must emit nothing in that state, and every existing `doctor` test
  (which uses plain `init --yes`) is unaffected.
- `init --yes --fresh-vault` writes `state/digest.md` (481 bytes) and a
  `CLAUDE.md` whose block satisfies `content.includes(buildBlock(digest)) === true`
  — the `[ok]` fixture.

### The neighbouring quarantine work has LANDED — no sequencing left to manage

An earlier draft of this spec carried a dispatch precondition against the
then-in-flight `WP-doctor-quarantine-counts`. **That is discharged.** As of
`main` = `0410e3a` the whole `quarantine-surface` epic is merged and its specs
are in `docs/specs/done/` — `WP-doctor-quarantine-counts.md`,
`WP-quarantine-warnings-file.md`, `WP-quarantine-banner-decay.md`. A `Done`
spec's line citations are historical record, not a dispatch gate, so nothing this
WP does to `doctor.js` can block anyone. What remains is stated here as fact:

**1. The positional plan survived the landing, and the landed code confirms it.**
That epic pinned `quarantineReport` to run *after* the Google-readiness loop and
*before* the `[info]` update notice, and it landed exactly there (line 572). This
WP inserts *before* the Google loop (line 565). The resulting order — measured by
running a real `doctor` against a fixture install with the insertion applied,
2026-08-30 — is:

```text
[ok] core directory exists (…)
[ok] install manifest parses
[ok] config.yaml exists and is non-empty
[ok] vault ready (…)
[ok] secrets directory present (…)
[ok] AI tools — Claude Code: found, Codex CLI: not found
[ok] Claude Code skills registered (7) under …/skills
[warn] the Wienerdog block in …/CLAUDE.md is out of date — run 'wienerdog sync'   ← this WP
[ok] no session transcripts are being skipped                                     ← the landed epic
```

No existing group is moved, reworded or re-statused; the diff is a pure addition.

**2. Both discipline gates were run against the real landed code, in both
directions.** `WP-doctor-quarantine-counts` ships a `DOCTOR DISCIPLINE` gate
asserting over the whole text of `doctor.js`: no
`writeLedger|migrateFromWatermarks`, no `displayName`, no retyped
`'reports/warnings.md'` literal, `lstatSync` occurring **at least 3** times, and
`openSync` present. Measured on `0410e3a`:

| gate | on landed `main` alone | on landed `main` + this WP's insertion |
|---|---|---|
| their `DOCTOR DISCIPLINE` | `DOCTOR DISCIPLINE OK` (`lstatSync` = 3, `openSync` = 1) | **OK, unchanged** — this WP adds 0 `lstatSync`, 0 `openSync`, no `displayName`, no ledger call, no path literal |
| this WP's no-mutation grep (`writeFileSync\|mkdirSync\|chmodSync\|rmSync\|unlinkSync`) | no output (pass) | **no output (pass)** — their `quarantineReport` reads with `lstatSync`/`openSync`/`readFileSync` and writes nothing |
| this WP's `grep -c "ambiguous wienerdog managed-block markers"` | 0 | 0 (the message is reused from `shared.js`, never retyped) |
| `git diff -U0 -- src/cli/doctor.js \| grep "^-[^-]"` | — | empty: pure addition |
| `node --test tests/unit/doctor.test.js tests/unit/claude-adapter.test.js tests/unit/codex-adapter.test.js` | 99/99 | **99/99, zero failures** with the insertion applied |

These were produced by applying this spec's `digestBlockChecks` body and export
change to a scratch tree and running the commands; AC10 and verification step 6
re-prove them on the finished tree rather than inheriting this table.

**3. `tests/unit/doctor.test.js` is now 342 lines longer** than when this spec was
first drafted. Both WPs append cases; append only here, and never rewrite one of
theirs.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself (you flip its `status:` — Definition of done item 4), package-lock.json,
     memory/lessons/inbox.md, and docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | add `locateManagedBlock` to `module.exports`; no behaviour change |
| modify | src/cli/doctor.js | add `digestBlockChecks(paths, harnesses)` and one call in `run()` |
| modify | tests/unit/doctor.test.js | one test per Table D row (append only — never rewrite an existing case) |

`src/cli/doctor.js` and `tests/unit/doctor.test.js` also carry the landed
`WP-doctor-quarantine-counts` work — read "The neighbouring quarantine work has
LANDED" above before touching either. Append to the test file; never rewrite one
of its cases.

### Exact contracts

**1. `src/adapters/shared.js` — export addition only.** Replace the single export
line with:

```js
module.exports = { recordOnce, recordSettingsEntry, buildBlock, locateManagedBlock, applyManagedBlock, copyHookScript, toPosixCommand, applySettings, applySkillLinks };
```

Change nothing else in that file — not the function, not its JSDoc, not a caller.

**2. `src/cli/doctor.js` — the new check.** Add this `require` at the top,
alongside the existing ones (after `const manifestLib = …` on line 8):

```js
const { buildBlock, locateManagedBlock } = require('../adapters/shared');
```

Add this function immediately after `staleHookChecks` (i.e. after line 228, before
`googleReadinessChecks`):

```js
/** Report whether each present harness's managed block still carries the CURRENT
 *  digest. The digest file is rewritten by every dream run; the block is written
 *  only by an attended `wienerdog sync`, so the two drift apart between syncs and
 *  nothing else surfaces it. Read-only — doctor never mutates (WP-070); the
 *  remediation is always `wienerdog sync`. Emits NOTHING when there is no digest
 *  to compare against (a no-vault install: normal, and the vault check above
 *  already covers it) — same convention as googleReadinessChecks, which is silent
 *  when Google is not connected. The freshness predicate is exact: applyManagedBlock
 *  writes buildBlock(digest) between the sentinels on every branch, so the block
 *  text sliced at locateManagedBlock's offsets must equal buildBlock(digest).
 *  Never throws.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{claude:{present:boolean}, codex:{present:boolean}}} harnesses
 *  @returns {{status:'ok'|'warn', msg:string}[]} */
function digestBlockChecks(paths, harnesses) {
  let digest;
  try {
    digest = fs.readFileSync(path.join(paths.state, 'digest.md'), 'utf8');
  } catch {
    return []; // no digest → nothing to compare (no-vault install, or an
              // unreadable file the private-modes check above already owns)
  }
  const want = buildBlock(digest);
  const targets = [];
  if (harnesses.claude.present) targets.push(path.join(paths.claudeDir, 'CLAUDE.md'));
  if (harnesses.codex.present) targets.push(path.join(paths.codexDir, 'AGENTS.md'));

  const out = [];
  for (const file of targets) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      out.push({ status: 'warn', msg: `no Wienerdog block in ${file} — run 'wienerdog sync'` });
      continue;
    }
    let span;
    try {
      span = locateManagedBlock(content, file);
    } catch (err) {
      // Reuse the WienerdogError text verbatim — one wording for this condition
      // across sync and doctor, so the two surfaces can never disagree (ADR-0031).
      out.push({ status: 'warn', msg: err.message });
      continue;
    }
    if (span === null) {
      out.push({ status: 'warn', msg: `no Wienerdog block in ${file} — run 'wienerdog sync'` });
    } else if (content.slice(span.begin, span.end) === want) {
      out.push({ status: 'ok', msg: `the Wienerdog block in ${file} matches the current digest` });
    } else {
      out.push({ status: 'warn', msg: `the Wienerdog block in ${file} is out of date — run 'wienerdog sync'` });
    }
  }
  return out;
}
```

Add this call in `run()` **between line 563 and line 565** — immediately after
the `staleHookChecks` loop and before
the `googleReadinessChecks` loop:

```js
  // Managed-block freshness: does each present harness's block still carry the
  // CURRENT digest? The digest is rewritten by every dream run; the block only by
  // an attended sync, so they drift between syncs and nothing else reports it.
  // Read-only; silent on a no-vault install; every problem is a warn.
  for (const c of digestBlockChecks(paths, harnesses)) check(c.status, c.msg);
```

No status returned by this check is `fail`, so `process.exitCode` is never
affected.

## Contract reference

The ADR-0031 activation trigger fires on **three** of the seven: **(ii)** a status
taxonomy is introduced (ok / stale / absent / ambiguous, per harness); **(iv)**
fallback and precedence behaviour is the substance of the check; **(vii)** the same
facts are mirrored across the code comment, the acceptance criteria, the
verification greps and the test list.

Table D is a declarative fact table — observed state → emitted line. It carries no
`mechanism`, `seam` or `how to produce it` column, so ADR-0036's cell schema does
not apply; how each state is produced in a test lives in the test list under
"Acceptance criteria", a registered mirror.

### Table D — canonical: what `doctor` prints, for every observable state

(Lettered **D** deliberately: `WP-doctor-quarantine-counts` already owns a
`Table C` about `doctor.js` placement. That spec is now `Done`, but a `Done`
spec is permanent record, so two different Table Cs governing the same file stay
a mis-citation hazard forever. The letter does not go back.)

`want` = `buildBlock(<state>/digest.md)`. `file` = `<claudeDir>/CLAUDE.md` for
Claude, `<codexDir>/AGENTS.md` for Codex. A harness is present per
`detectHarnesses` (its config directory exists).

| id | observed state | doctor emits |
|----|----------------|--------------|
| D1 | `<state>/digest.md` absent or unreadable | **nothing at all** (no line for either harness) |
| D2 | a harness is not present | **nothing** for that harness |
| D3 | `file` is absent or unreadable | `[warn] no Wienerdog block in <file> — run 'wienerdog sync'` |
| D4 | `file` has no sentinel line at all | `[warn] no Wienerdog block in <file> — run 'wienerdog sync'` |
| D5 | `file` has ambiguous sentinels (>1 BEGIN, >1 END, exactly one of the two, or END before BEGIN) | `[warn] ambiguous wienerdog managed-block markers in <file> — refusing to edit (resolve by hand)` — the `WienerdogError` message, verbatim |
| D6 | the block text differs from `want` | `[warn] the Wienerdog block in <file> is out of date — run 'wienerdog sync'` |
| D7 | the block text equals `want` | `[ok] the Wienerdog block in <file> matches the current digest` |
| D8 | both harnesses present | one line per harness, Claude first, each independently resolved by D3–D7 |
| D9 | any of D3–D7 | `process.exitCode` is **not** set — no state here is a `fail` |

**D1's rationale, so it is not re-litigated:** without a digest there is nothing to
compare against. A no-vault install is a normal, already-reported state (the vault
check emits its own `warn`), and an unreadable `digest.md` is owned by the
private-modes check that runs earlier in `run()`. Silence here matches
`googleReadinessChecks`, which returns `[]` when Google is not connected.

### Mirrored Surface Checklist

Every surface below restates a fact decided in Table D. A finding that changes a
row changes all of these in the same pass; a new mirror found in review is added
here on the spot.

- [ ] **Deliverables cell** for `src/cli/doctor.js` — Table D as a whole.
- [ ] **The `digestBlockChecks` JSDoc and inline comments** (the "emits NOTHING
      when there is no digest" sentence, the verbatim-message comment) — rows D1
      and D5.
- [ ] **The `run()` call-site comment** ("silent on a no-vault install; every
      problem is a warn") — rows D1 and D9.
- [ ] **Acceptance criteria** AC1–AC8 — one per row D1, D3, D4, D5, D6, D7, D8, D9.
- [ ] **Verification commands / greps** in "Verification steps" — the exact message
      strings of rows D3, D5, D6, D7.
- [ ] **Current-state description** (the `locateManagedBlock` JSDoc quote, the
      thrown-message code block, the fixture facts) — rows D5 and D7.
- [ ] **`tests/unit/doctor.test.js`** case list — every row D1, D3–D9.
- [ ] **`WP-session-start-digest-dedup`'s Out-of-scope bullet** stating that
      `doctor` reports byte match while the hook decides delivery (so `doctor` does
      not check `AGENTS.override.md`) — row D7's scope.
- [ ] **The "neighbouring quarantine work has LANDED" subsection's position
      paragraph, sample output and gate table** —
      the insertion point (before the Google-readiness loop) and the
      no-mutation/no-enumeration facts of rows D1 and D9. If the insertion point
      moves, that section moves with it in the same pass.

## Implementation notes & constraints

- **`doctor` never mutates (WP-070).** `digestBlockChecks` opens files read-only
  and writes nothing, creates nothing, and repairs nothing. If you find yourself
  wanting to re-render or re-write the block, stop — that is `sync`'s job.
- **Reuse `locateManagedBlock`; do not re-parse sentinels ad hoc.** A second
  independent parser is exactly the drift ADR-0031 exists to prevent. The only
  source change outside `doctor.js` is adding it to `shared.js`'s exports.
- **Reuse the `WienerdogError` message verbatim for D5.** Do not prefix or suffix
  it with doctor-specific framing; one wording, one source. ("refusing to edit"
  correctly describes what the next `sync` will do.)
- **Do not check `$CODEX_HOME/AGENTS.override.md` here.** The Codex adapter
  already emits an override notice on every sync (`src/adapters/codex.js` lines
  74–78); a second, independently-worded copy in `doctor` would be an unregistered
  mirror. `doctor` reports byte match; the SessionStart hook is the surface that
  must reason about *delivery*, and it handles the override there
  (`WP-session-start-digest-dedup`). Record this asymmetry in the PR under
  "Decisions made" if you are asked about it; do not close it.
- **No new dependency, no new file, no CLI flag.** Plain Node ≥ 18, JSDoc types,
  no TypeScript.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR description. Do NOT expand scope to resolve ambiguity.

## Acceptance criteria

Tests go in `tests/unit/doctor.test.js`, using its existing `tempEnv()` / `run()`
helpers. `init --yes --fresh-vault` is the fixture that produces a digest plus a
matching block; mutate from there.

- [ ] **AC1 (D1):** after a plain `init --yes` (no vault, no `digest.md`),
      `doctor` prints **no** line containing `Wienerdog block in`, and exits 0.
      This is the state every pre-existing `doctor` test runs in.
- [ ] **AC2 (D7):** after `init --yes --fresh-vault` with `CLAUDE_CONFIG_DIR`
      pointing at an existing directory, `doctor` prints
      `[ok] the Wienerdog block in <claudeDir>/CLAUDE.md matches the current digest`
      and exits 0.
- [ ] **AC3 (D6):** same, then append a line to `<state>/digest.md` (leaving the
      block untouched) → `[warn] the Wienerdog block in <file> is out of date — run 'wienerdog sync'`,
      exit 0.
- [ ] **AC4 (D4):** same, then overwrite `CLAUDE.md` with sentinel-free content →
      `[warn] no Wienerdog block in <file> — run 'wienerdog sync'`, exit 0.
- [ ] **AC5 (D3):** same, then delete `CLAUDE.md` → the same `no Wienerdog block`
      warn, exit 0.
- [ ] **AC6 (D5):** same, then write `CLAUDE.md` as two concatenated copies of the
      correct block → `[warn] ambiguous wienerdog managed-block markers in <file> — refusing to edit (resolve by hand)`,
      exit 0.
- [ ] **AC7 (D8):** with both `CLAUDE_CONFIG_DIR` and `CODEX_HOME` pointing at
      existing directories, `init --yes --fresh-vault`, then make the Codex block
      stale (rewrite `AGENTS.md` from a different digest) → **two** lines: `[ok]`
      for `CLAUDE.md` and `[warn] … is out of date` for `AGENTS.md`, exit 0.
- [ ] **AC8 (D9):** none of AC3–AC7 makes `doctor` exit non-zero.
- [ ] **AC9 (no mutation):** in the AC3 case, record the mtime and bytes of
      `CLAUDE.md` and `<state>/digest.md` before running `doctor` and assert both
      are unchanged after.
- [ ] **AC10 (the landed neighbour's gate, unbroken):** on the finished tree,
      `docs/specs/done/WP-doctor-quarantine-counts.md`'s `DOCTOR DISCIPLINE` gate
      — copied verbatim from that spec's Verification steps — still prints
      `DOCTOR DISCIPLINE OK` and exits 0 against `src/cli/doctor.js`. All five of
      its assertions apply now that the WP has landed; none of them is this WP's
      to *satisfy*, all of them are this WP's to *not break*. Paste the output.
- [ ] **AC11 (pure addition):** `git diff -U0 -- src/cli/doctor.js` contains no
      removed source line — `src/cli/doctor.js` gains **exactly one** new
      function, **one** `require`, and **exactly one** new loop in `run()`; no
      existing group is moved, reworded, or re-statused.
- [ ] **AC12 (output order):** in a real `doctor` run against an
      `init --yes --fresh-vault` fixture with a stale block, the block line is
      printed **after** the skill-link lines and **before** the quarantine line.
- [ ] The whole pre-existing `tests/unit/doctor.test.js` suite still passes.

## Verification steps (run these; paste output in the PR)

```bash
# 1. The export addition is real and does not change behaviour.
node -e 'const s=require("./src/adapters/shared");
if (typeof s.locateManagedBlock !== "function") { console.error("not exported"); process.exit(1); }
const {buildBlock,locateManagedBlock}=s;
const b=buildBlock("# d\n\nhello\n");
const span=locateManagedBlock("top\n\n"+b+"\n","x.md");
console.log("slice equals buildBlock:", ("top\n\n"+b+"\n").slice(span.begin,span.end)===b);
console.log("no sentinels -> null:", locateManagedBlock("nothing here\n","x.md")===null);
try { locateManagedBlock(b+"\n"+b+"\n","x.md"); console.error("expected a throw"); process.exit(1); }
catch (e) { console.log("ambiguous message:", e.message); }'

# 2. The doctor tests, plus the two adapter suites that own buildBlock/the block
#    writer (baseline on 0410e3a with the insertion applied: 99/99).
node --test tests/unit/doctor.test.js tests/unit/claude-adapter.test.js tests/unit/codex-adapter.test.js

# 3. The four exact message strings live in exactly one place each.
grep -n "matches the current digest" src/cli/doctor.js
grep -n "is out of date — run" src/cli/doctor.js
grep -n "no Wienerdog block in" src/cli/doctor.js
grep -c "ambiguous wienerdog managed-block markers" src/cli/doctor.js   # expect 0 (reused from shared.js)

# 4. doctor still never mutates: no write call in the new function.
grep -n "writeFileSync\|mkdirSync\|chmodSync\|rmSync\|unlinkSync" src/cli/doctor.js   # expect: no output

# 5. No existing doctor group moved or reworded (the landed quarantine WP's
#    Table C requires this of everyone touching run()).
git diff -U0 -- src/cli/doctor.js | grep -E "^-[^-]" | grep -v "^--- "   # expect: no output (pure addition)

# 6. AC10 — the landed neighbour's gate, VERBATIM from
#    docs/specs/done/WP-doctor-quarantine-counts.md, unbroken by this WP.
#    All five assertions apply (that WP has shipped): it must print
#    DOCTOR DISCIPLINE OK. Measured on 0410e3a with this WP's insertion applied:
#    OK, lstatSync = 3, openSync = 1 — this WP adds neither.
node -e "const t=require('fs').readFileSync('src/cli/doctor.js','utf8');const bad=[];if(/writeLedger|migrateFromWatermarks/.test(t))bad.push('doctor mutates or migrates the ledger');if(t.includes('displayName'))bad.push('doctor names a transcript — the enumeration has one home');if(/(['\"\x60])reports\/warnings\.md\1/.test(t))bad.push('the warnings path is retyped instead of imported');const ls=(t.match(/lstatSync/g)||[]).length;if(ls<3)bad.push('the pointer probe is not lstat-pinned: doctor.js carries only the '+ls+' pre-existing lstatSync use(s)');if(!/openSync/.test(t))bad.push('the pointer probe does not prove the file opens for reading (Table B step 5)');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('DOCTOR DISCIPLINE OK');"

# 6b. AC12 — output order, from a real run. Build the fixture, make the block
#     stale, and confirm the block line precedes the quarantine line.
#     Expected on 0410e3a: the [warn] block line, then [ok] no session
#     transcripts are being skipped.

# 7. Full suite and lint.
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to the SessionStart hook — that is `WP-session-start-digest-dedup`.
- Any change to `DigestCaps` — that is `WP-digest-line-cap-raise`.
- Making `doctor` re-render, re-write or repair the block, or auto-run `sync`.
- Adding an `AGENTS.override.md` check to `doctor` (see Implementation notes).
- Changing `locateManagedBlock`, `buildBlock`, `applyManagedBlock`, or any adapter
  behaviour. The only edit in `src/adapters/shared.js` is the export list.
- Adding a `--json` or machine-readable mode to `doctor`.
- Anything owned by the `quarantine-surface` epic: `quarantineReport`, the
  quarantine count lines, `reports/warnings.md`, `src/core/dream/ledger.js`, or
  any reordering of the existing `doctor` groups. If a quarantine line looks
  missing, that is `WP-doctor-quarantine-counts`, not this WP.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(doctor): report managed-block drift against the digest (WP-doctor-digest-block-drift)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR. **This is not a
   Deliverables-boundary violation and needs no table row** — `scripts/boundary-check.js`
   allows the spec file by path, with or without one (proven: it exits 0 on a diff
   containing only the spec plus a listed file). If a boundary rule anywhere seems to
   forbid it, that rule is the stale one.
