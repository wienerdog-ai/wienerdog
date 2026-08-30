---
id: WP-managed-block-by-reference
title: Make the Claude Code managed block a reference to the digest instead of a copy, and de-register the now-redundant SessionStart hook
status: Draft
model: opus
size: M
depends_on: [WP-memory-import-hermetic-canary]
adrs: [ADR-0004, ADR-0021, ADR-0024, ADR-0031, ADR-0032, ADR-0035, ADR-0038, ADR-0039]
epic: digest-delivery
---

# WP-managed-block-by-reference: the block points at the digest, it does not contain it

## Context (read this, nothing else)

Wienerdog writes configuration files into a user's Claude Code setup. Two of them
carry the user's **digest** — the pre-rendered session context at
`~/.wienerdog/state/digest.md` (identity notes, active projects, latest daily log, and
warning banners), rendered by `renderDigest` in `src/core/digest.js`:

- the **managed block**, the sentinel-delimited region
  `<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->` that `wienerdog sync` owns
  inside the user's `~/.claude/CLAUDE.md`; and
- the **SessionStart hook**, `<core>/bin/session-start.sh`, which injects the same
  file at the start of every session.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP changes what bytes go into
one file and removes one hook registration. It adds no process.

**The four defects (ADR-0039 Context, all verified in code).**

1. **Both channels carry identical bytes.** Measured on the maintainer's machine:
   `digest.md` is 8,764 B, the managed block is 8,812 B of a 12,975 B `CLAUDE.md` —
   **68 %** of the user's entire user-level memory file — and the hook adds a second
   copy. Roughly **17.5 KB of duplicated digest per session**.
2. **The guaranteed channel is the stale one.** Only `sync` applies the block. The
   nightly `dream` regenerates `digest.md` but never re-applies the block, so the
   channel the adapter's header comment calls guaranteed carries last-sync bytes while
   the "enrichment only" hook carries fresh ones — the inverse of the stated design.
3. **When both fire and disagree, nothing orders them.** The model sees two
   `## Latest daily log` sections and two banner sets with no freshness cue.
4. **The copy downgrades confidentiality.** `digest.md` is written by
   `writeFilePrivate` at **0600** and is a member of `A5_PRIVATE_FILE_BASENAMES`;
   `applyManagedBlock` writes with plain `fs.writeFileSync` and `~/.claude/CLAUDE.md`
   is **0644**, outside `scanPrivateModes`' in-core scope. The copy republishes at
   0644 exactly the bytes A5 hardened. ADR-0024 separately names the managed block as
   one of four durable **secret sinks**.

**The fix (ADR-0039 §1, §2).** The ratified rule is:

> No unattended job performs a read-modify-write on a file Wienerdog does not own.
> Freshness is delivered by rewriting a Wienerdog-owned file that the user-owned file
> points at.

So the block stops containing the digest and starts **importing** it. `CLAUDE.md`'s
bytes then change only at an attended `wienerdog sync`, while the content a session
sees follows `digest.md`, which the dream already rewrites atomically at 0600. The
Claude Code SessionStart digest injection becomes redundant and is **de-registered**.

**Verified import mechanics** (`https://code.claude.com/docs/en/memory`, fetched
2026-08-30, and re-measured against the installed Claude by
`WP-memory-import-hermetic-canary`): `@path` imports work in user-level `CLAUDE.md`;
relative, absolute and `~`-prefixed paths are all accepted; **user-scope imports load
without the external-import approval dialog** (that dialog is project-scope only);
imports resolve **at session launch**, not per turn, with the root `CLAUDE.md` re-read
on `/compact`; the limit is **4 hops**; imports inside code spans or fences are
**ignored**; a `CLAUDE.md` over **4 MiB** is skipped entirely.

**The one dangerous property.** A **missing import target is skipped silently** — no
error, no warning (community-corroborated: `anthropics/claude-code#56927`, `#1041`).
Correctness for Claude Code therefore now depends on the target existing, where it
previously depended only on `sync` having run. Two guards answer that, both required
here: `sync` writes the import line **only** when `digest.md` exists (the existing
gate, preserved), and `wienerdog doctor` **checks that the target resolves**.

**Codex is not touched by this WP.** Codex has no include or import syntax in
`AGENTS.md` (official docs checked 2026-08-30; `openai/codex#17401` is an open feature
request), so its block keeps the full copy for now. `WP-digest-stable-volatile-split`
and `WP-codex-block-pointer-line` give Codex its final shape. The resulting
Claude/Codex asymmetry is accepted and documented (ADR-0039 §3, owner rulings D2/D3).

## Current state

`src/adapters/claude.js` — Step 1 reads the digest and hands its bytes to the shared
block writer; Step 2 registers **two** hook events:

```js
if (!skipManagedBlock) {
  let digest = null;
  try {
    digest = fs.readFileSync(digestPath, 'utf8');
  } catch {
    digest = null;
  }
  if (digest !== null) {
    try {
      shared.applyManagedBlock(claudeMd, digest, dryRun, manifest, out);
    } catch (err) {
      if (err instanceof WienerdogError) {
        out.notices.push(
          `managed block not updated in ${claudeMd} — ${err.message}; hooks + skills still installed. Resolve the markers by hand, then re-run 'wienerdog sync'.`
        );
      } else {
        throw err;
      }
    }
  } else {
    out.notices.push(
      `digest not found at ${digestPath}; managed block skipped (hooks + skills still installed)`
    );
  }
}
// Step 2
shared.copyHookScript(startSrc, startAbs, dryRun, manifest, out);
shared.copyHookScript(endSrc, endAbs, dryRun, manifest, out);
shared.applySettings(settingsPath, [['SessionStart', startAbs], ['SessionEnd', endAbs]], dryRun, manifest, out);
```

Its file header still states the old intent — "The managed block holds the whole digest
so a Claude Code session has its context even with zero hooks; the SessionStart hook is
enrichment only (fresher digest between syncs)" — and must be rewritten to match
ADR-0039.

`src/adapters/shared.js`:

```js
const BEGIN = '<!-- wienerdog:begin -->';
const END = '<!-- wienerdog:end -->';

function buildBlock(digest) {
  const safeDigest = digest.split('\n').map((line) => {
    const t = line.trim();
    if (t === BEGIN) return line.replace(BEGIN, '<!-- wienerdog begin -->');
    if (t === END) return line.replace(END, '<!-- wienerdog end -->');
    return line;
  }).join('\n');
  return `${BEGIN}\n${safeDigest.trimEnd()}\n${END}`;
}
```

`applyManagedBlock(mdPath, digest, dryRun, manifest, out)` has three write paths —
create the file, replace between existing sentinels, or append with one blank-line
separator — each using plain `fs.writeFileSync`, and each recording a `managed-block`
manifest entry. `locateManagedBlock` throws a `WienerdogError` on ambiguous markers
(more than one BEGIN or END, an END before a BEGIN, or exactly one of the two).

`applySettings(settingsPath, events, dryRun, manifest, out)` merges hook commands into
`settings.hooks[event]`, prunes stale quoting variants of **our** command, and ends
with:

```js
recordSettingsEntry(manifest, settingsPath, createdFile, events.map(([, c]) => shellQuoteCommand(c)));
```

`recordSettingsEntry` **upserts** `entry.commands = commands`, and the uninstall
reverser `reverseSettingsEntry` in `src/core/manifest.js` removes only commands present
in `entry.commands`:

```js
const commands = new Set(entry.commands || []);
...
group.hooks = group.hooks.filter((h) => !(h && commands.has(h.command)));
```

**This is the hazard this WP must handle.** If the Claude adapter simply stops passing
`['SessionStart', startAbs]`, the next `sync` upserts `commands` to the SessionEnd
command alone, and `wienerdog uninstall` then leaves the previously-registered
SessionStart hook **orphaned in the user's `settings.json` forever**. De-registration
must be an **explicit removal step**, never an omission.

`tests/golden/claude-adapter/CLAUDE.md` — the frozen expected block:

```markdown
<!-- wienerdog:begin -->
# Who you're working with
Ada Kovács — product lead.

## Standing instructions
Be concise.
<!-- wienerdog:end -->
```

`src/cli/doctor.js` — `run(_argv)` emits lines through a local
`check(status, msg)` helper taking `'ok' | 'warn' | 'fail'`; a `'fail'` sets the exit
status. It already has `staleHookChecks(paths, harnesses)` and `skillLinkChecks(...)`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/claude.js | reference block (Table D); explicit SessionStart de-registration; rewrite the stale header comment |
| modify | src/adapters/shared.js | `buildReferenceBody`; `applySettings` gains a `removeEvents` parameter |
| modify | src/cli/doctor.js | check the **digest** import target resolves (D12); never fault a missing **banner** target (D12a) |
| modify | tests/golden/claude-adapter/CLAUDE.md | the new reference block |
| modify | tests/unit/claude-adapter.test.js | block shape, de-registration, manifest `commands` |
| modify | tests/unit/doctor.test.js | the import-target check, all three verdicts |

**Golden files:** you **DO** have permission to update
`tests/golden/claude-adapter/CLAUDE.md` in this WP, and **only** that one. Its new
expected content is given literally under Exact contracts.
`tests/golden/codex-adapter/**` and `tests/golden/digest-default.md` must **not**
change — Codex is untouched here and `renderDigest` is not modified.

### Exact contracts

```js
/** Build the managed-block BODY for a harness that supports memory imports
 *  (Table D). Pure — no fs. The returned string is passed to applyManagedBlock in
 *  place of the digest bytes.
 *  @param {string} digestAbsPath absolute path to <core>/state/digest.md
 *  @param {string} bannerAbsPath absolute path to <core>/state/refusal-banner.md.
 *    This target is normally ABSENT and that is the healthy state (D2b) — the
 *    function does NOT check for it, and sync does NOT gate on it.
 *  @returns {string} */
function buildReferenceBody(digestAbsPath, bannerAbsPath)
```

```js
/** @param {string} settingsPath
 *  @param {[string, string][]} events   hook events to ENSURE are registered
 *  @param {boolean} dryRun
 *  @param {object} [manifest]
 *  @param {{changed:string[], unchanged:string[], notices:string[]}} out
 *  @param {[string, string][]} [removeEvents]  hook events to REMOVE if present.
 *    Removal runs BEFORE the ensure pass. Matching is the same
 *    shellQuoteCommand-normalized comparison the stale-variant pruner already uses,
 *    so a user's unrelated hook is never touched. */
function applySettings(settingsPath, events, dryRun, manifest, out, removeEvents = [])
```

**The literal new golden**, `tests/golden/claude-adapter/CLAUDE.md` (with
`<DIGEST_ABS_PATH>` substituted by the test's absolute digest path):

```markdown
<!-- wienerdog:begin -->
# Wienerdog memory

Your working memory for this user — who they are, what they are working on, the
latest daily log, and any Wienerdog warnings — is imported from the line below.
Wienerdog keeps that file current; this block does not change between runs of
`wienerdog sync`.

@<DIGEST_ABS_PATH>
@<REFUSAL_BANNER_ABS_PATH>
<!-- wienerdog:end -->
```

That is `BEGIN`, the four-line preamble, a blank line, the **two** import lines, `END` —
exactly what `buildBlock(buildReferenceBody(digestAbsPath, bannerAbsPath))` produces.
The second target is normally **absent** on disk, and is skipped silently when it is
(Table D, D2a/D2b).

### Blocked-by (research gates)

| Gate | Blocked until | Why |
|------|---------------|-----|
| R2 — does a hermetic run load user-level `CLAUDE.md`? | `WP-memory-import-hermetic-canary` is **Done** **AND** ( its verdict is **not loaded** **OR** `WP-hermetic-user-memory-suppression` is **Done** ) | Round-2 finding F4: a canary whose adverse verdict has no consequence is a measurement, not a gate. If user memory **is** loaded hermetically, the managed block already carries the digest into the dream's own brain, and this WP would change *which* digest reaches it — that must be resolved, not noted, before the block shape changes. Round-3 finding R6 moved the conditional **here**, onto the consumer: round 2 had put it in the canary's own Done criteria, which made the canary wait on its own descendant (a cycle). The gate is unchanged in strength; only its location moved |

### Table D — the Claude Code managed-block delivery contract

The single place these facts are decided. Operative prose, code, tests and successor
specs cite this table rather than restating it.

| Row | Fact | Value | Revised by |
|-----|------|-------|-----------|
| D1 | Block body | Fixed code-owned preamble + one blank line + **two** import lines: the digest, then the refusal banner. No digest bytes, no banner bytes | `WP-digest-stable-volatile-split` adds the stable half above the imports |
| D2 | Digest import | `@` immediately followed by the **absolute** path to `<core>/state/digest.md`, alone on its line, never inside a code span or fence | — |
| D2a | Banner import | A second import line, `@` + the **absolute** path to `<core>/state/refusal-banner.md`, on its own line directly after D2. Added in round 2 (finding F1): §2 de-registers the SessionStart hook, which was §5's only banner channel for Claude Code, so the block must carry the banner itself | — |
| D2b | Banner absence | The refusal-banner file is **absent** whenever no job has refused — that is the healthy state. A missing import target is skipped **silently**, which is exactly the wanted semantics: no refusal, no banner, no noise. D5's existence precondition applies to the **digest** import only, never to this one | — |
| D3 | Path form | Absolute, from `path.join(paths.state, 'digest.md')`. **Not** `~`-prefixed and not relative, so it is independent of how the harness resolves `~` | — |
| D4 | Path separators | Forward slashes on every platform, via the existing `toPosixCommand` normalizer in `shared.js` | — |
| D5 | Precondition | The block is written **only** when `digest.md` exists. Absent → skip the block with the existing notice (a missing import target is skipped **silently** by the harness) | — |
| D6 | Idempotence | The block's bytes depend only on the digest's **path**, so a re-sync with unchanged paths reports `unchanged`. No timestamp, ever | — |
| D7 | Ambiguous markers | Unchanged: `applyManagedBlock` throws, the adapter catches `WienerdogError`, pushes the existing notice, and continues with hooks + skills | — |
| D8 | SessionStart registration | **Removed** for Claude Code, by explicit `removeEvents`, never by omission | — |
| D9 | SessionEnd registration | Unchanged — still registered | — |
| D10 | Hook script copy | `session-start.sh` is still copied to `<core>/bin/` and still manifest-recorded: it is shared with the Codex adapter and must stay present and reversible | — |
| D11 | Manifest `commands` | After the removal pass, `recordSettingsEntry` records only the commands still registered. The orphan hazard is closed by removing at sync time, not by widening the record | — |
| D12 | Doctor — digest import | Reads the block, extracts the **digest** import target, and reports `ok` when it resolves to an existing file, `fail` when it does not, and nothing when there is no block or no import line | — |
| D12a | Doctor — banner import | **Never reports a fault for a missing refusal-banner target.** Absence is healthy (D2b). Doctor may report `ok` when the banner exists, or stay silent; it must not emit `warn` or `fail` for absence. Getting this wrong turns a clean install into a permanent `doctor` failure | — |
| D13 | Codex | Untouched by this WP — `AGENTS.md` keeps the full copy | `WP-digest-stable-volatile-split`, `WP-codex-block-pointer-line` |
| D14 | Cowork limitation | Cowork sessions skip user-scope imports resolving outside the session `cwd` and skip a symlinked `~/.claude/CLAUDE.md`. Such a user gets the preamble only. Documented, not worked around | — |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Table D — a review finding updates the table and
every box below in one pass, and any new mirror found in review is registered here on
the spot:

- [ ] Deliverables-table cells for `claude.js`, `shared.js`, `doctor.js` and the golden
      (mirror D1, D8, D12)
- [ ] The literal golden block under Exact contracts (mirrors D1, D2, D3)
- [ ] `buildReferenceBody` and `applySettings` JSDoc (mirror D1, D2, D8)
- [ ] Acceptance criteria AC-1 … AC-16 (mirror D1 … D14)
- [ ] Verification greps for the import line, the absent SessionStart registration, and
      the manifest `commands` content (mirror D2, D8, D11)
- [ ] Current-state quotation of `recordSettingsEntry` / `reverseSettingsEntry` and the
      orphan hazard (mirrors D8, D11)
- [ ] The Context paragraph on silent missing-target skipping (mirrors D5, D12)
- [ ] Out-of-scope statement that Codex is unchanged (mirrors D13)

## Implementation notes & constraints

- **D8 is the trap.** Read the `recordSettingsEntry` / `reverseSettingsEntry` pair in
  Current state before writing any code. Removing a hook by *not passing it* is
  silently wrong: it leaves a live hook in the user's `settings.json` that
  `wienerdog uninstall` will never remove, because the manifest no longer lists it.
  The removal must happen in `applySettings` at sync time.
- **Reuse the existing normalized comparison for removal.** `applySettings` already
  prunes stale quoting variants of our own command using
  `shellQuoteCommand(h.command) === command`. Removal must use the same comparison, so
  a bare / backslash / forward-slash variant written by an older version is also
  removed, and a user's unrelated hook never is.
- **Drop emptied groups and emptied events** on removal, exactly as the existing pruner
  does, so `settings.json` does not accumulate `{"hooks":{"SessionStart":[]}}`.
- **D6 — no timestamp in the block, ever.** A `rendered:` line was considered and
  rejected in ADR-0039's Alternatives: it would make every `sync` produce different
  block bytes, breaking the repo's idempotence invariant ("running twice = zero
  changes"). The block must be a pure function of the digest's path.
- **D2 — the import line must survive markdown.** Emit it as a bare line. Do not indent
  it (four spaces makes it a code block), do not wrap it in backticks, and do not put
  it inside the preamble paragraph. Imports inside code spans and fences are ignored by
  the harness, silently.
- **D4 — Windows.** `shared.js` already exports `toPosixCommand`, written for exactly
  this class of problem in hook commands. Reuse it for the import path; it is a no-op
  on POSIX.
- **`buildBlock`'s sentinel neutralization stays.** It becomes vestigial for Claude
  Code (no digest bytes flow through it any more) but is still load-bearing for the
  Codex adapter, which still copies. Do not remove or weaken it.
- **The header comment in `claude.js` is a deliverable, not decoration.** It currently
  asserts the opposite of what the code will do ("the managed block holds the whole
  digest… the SessionStart hook is enrichment only"). An implementer reading only that
  file must not be misled. Rewrite it to state Table D's D1/D5/D8.
- **Existing installs migrate at the next `sync`**: the block is replaced between the
  existing sentinels and the SessionStart registration is removed. No migration code,
  no version check. Verify this by running the adapter twice against a fixture that
  starts with an old-style full-copy block.
- Do not touch `applyManagedBlock`'s three write paths, its separator accounting, or
  the `managed-block` manifest entry shape — ADR-0038 governs that record and this WP
  changes only the bytes passed in.
- When uncertain: choose the simpler option and record it under "Decisions made" in the
  PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The import path is built from `paths.state`, which is derived from the resolved
      core, never from an environment variable read at block-build time and never from
      user input. A user-influenced import path in `CLAUDE.md` would be an arbitrary
      file-read primitive into every session's context.
- [ ] `buildReferenceBody` receives an absolute path and must not accept a relative
      one. Assert `path.isAbsolute` and fail loudly rather than emitting a relative
      import whose resolution depends on the harness's cwd (D3).
- [ ] The preamble is fixed, code-owned text with no interpolation other than the path
      (D1). No vault content, no digest content, no user string enters the block —
      the same rule the alert and identity-exclusion banners already follow.
- [ ] This WP **removes** a durable secret sink (ADR-0024 Amendment 1): digest bytes,
      which may contain a secret the EP4 detector missed, stop being copied into a 0644
      user-owned file. Do not reintroduce any digest content into the block.
- [ ] The removal pass in `applySettings` must only ever match commands that re-quote
      to **our** absolute hook path. Verify with a fixture containing a third-party
      SessionStart hook and assert it survives untouched.
- [ ] `doctor`'s new check reads the block and reports a **path**, never the file's
      contents (D12).

## Acceptance criteria

- [ ] AC-1 — With a digest present, the block equals
      `buildBlock(buildReferenceBody(digestAbsPath, bannerAbsPath))` byte-for-byte —
      **both** arguments, **both** import lines — and the updated golden matches
      (D1, D2, D2a).
- [ ] AC-2 — The block contains exactly **two** lines beginning with `@`: the absolute
      digest path, then the absolute refusal-banner path, in that order, neither
      indented nor fenced (D2, D2a, D3).
- [ ] AC-3 — The block contains **no** digest content: grep the produced `CLAUDE.md`
      for a string present in the fixture digest body and find nothing (D1).
- [ ] AC-4 — On Windows-style paths the import line uses forward slashes (D4).
- [ ] AC-5 — With `digest.md` absent, no block is written and the existing
      "digest not found … managed block skipped" notice is pushed; hooks and skills
      still install (D5).
- [ ] AC-6 — Two consecutive adapter runs report the second as `unchanged`; the block's
      bytes are identical (D6).
- [ ] AC-7 — A `CLAUDE.md` with ambiguous sentinels still produces the existing notice
      and does not abort hooks or skills (D7).
- [ ] AC-8 — After the adapter runs, `settings.json` has **no** SessionStart entry
      pointing at our hook, and **does** have the SessionEnd entry (D8, D9).
- [ ] AC-9 — Starting from a `settings.json` that already has our SessionStart hook
      registered (the upgrade path), one adapter run removes it (D8).
- [ ] AC-10 — A third-party SessionStart hook in the same `settings.json` survives the
      removal untouched.
- [ ] AC-11 — Removal leaves no empty `hooks.SessionStart` array and no empty group.
- [ ] AC-12 — The `settings-entry` manifest record's `commands` after the run lists the
      SessionEnd command and not the SessionStart one (D11).
- [ ] AC-13 — `<core>/bin/session-start.sh` is still copied and still has its `file`
      manifest entry (D10).
- [ ] AC-14 — `doctor` reports `ok` when the **digest** import target exists, `fail`
      when the block has a digest import line whose target is missing, and emits no such
      line when `CLAUDE.md` has no managed block (D12).
- [ ] AC-14a — `doctor` emits **no `warn` and no `fail`** when the **refusal-banner**
      import target is missing, on an otherwise-healthy install. Assert the whole
      `doctor` run is clean with the banner absent (D12a) — this is the normal state of
      every working machine, so a fault here would make `doctor` permanently red.
- [ ] AC-15 — `tests/golden/codex-adapter/**` and `tests/golden/digest-default.md` are
      unchanged (D13).
- [ ] AC-16 — Running the full `wienerdog sync` twice is idempotent: the second run
      reports zero changes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern claude-adapter
npm test -- --test-name-pattern doctor
npm test
npm run lint
# D13/AC-15 — Codex and the digest golden are untouched (expect NO output):
git diff --stat -- tests/golden/codex-adapter tests/golden/digest-default.md
# D1/D2/D2a — the golden is a reference block, not a copy, with BOTH imports:
grep -c "^@" tests/golden/claude-adapter/CLAUDE.md   # expect 2
grep -n "refusal-banner.md" tests/golden/claude-adapter/CLAUDE.md
grep -n "Ada Kovács" tests/golden/claude-adapter/CLAUDE.md  # expect NO output
# D8 — the Claude adapter no longer ENSURES SessionStart, and explicitly removes it:
grep -n "SessionStart" src/adapters/claude.js
# D10 — the shared hook script is still copied:
grep -n "copyHookScript(startSrc" src/adapters/claude.js
```

## Out of scope (do NOT do these)

- **Codex.** `src/adapters/codex.js`, `tests/golden/codex-adapter/**` and
  `AGENTS.md`'s block are untouched here (D13). Their final shape is
  `WP-digest-stable-volatile-split` and `WP-codex-block-pointer-line`.
- **Splitting the digest** into stable and volatile parts — `WP-digest-stable-volatile-split`.
  This WP imports the whole digest.
- Changing `renderDigest`, `DigestCaps`, `capDigest`, or any digest section.
- Changing `applyManagedBlock`'s write paths, its separator accounting, or the
  `managed-block` manifest entry (ADR-0038's territory).
- Removing or weakening `buildBlock`'s sentinel neutralization — Codex still needs it.
- Amending ADR-0025 on the strength of the canary finding — propose it in the PR body.
- User-facing documentation (README, `docs/ARCHITECTURE.md`). Note what needs updating
  under "Discovered issues" in the PR body; `wd-docs` owns those files.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(adapters): managed block by reference (WP-managed-block-by-reference)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 findings F1, F2 and F4 (owner: ACCEPTED).**
  - **F1 (the blocking one).** ADR-0039 §2 de-registers the Claude Code SessionStart
    hook, and §5 delivered the refusal banner *through that hook*. Applied together, the
    round-1 chain would have left a Claude Code user with **no** refusal-banner channel
    — reintroducing the four-week silent failure this chain exists to fix. Resolution:
    the block carries a **second import line** for `state/refusal-banner.md`. New Table D
    rows **D2a** (the line) and **D2b** (absence is healthy, and D5's existence
    precondition applies to the digest import only), plus **D12a**: `doctor` must never
    fault a missing banner target. That last one matters more than it looks — the banner
    is absent on every healthy machine, so a naive "import target must resolve" check
    would make `doctor` permanently red for everyone. New AC-14a asserts it.
  - **F2.** The instruction-channel claim was narrowed at the ADR level; this spec never
    asserted it, so nothing here changed beyond inheriting the corrected motivation.
  - **F4.** The canary gate became **blocking**. Added an explicit **Blocked-by** table
    rather than leaving the gate as prose: this WP proceeds only once
    `WP-memory-import-hermetic-canary` is Done under its disjunctive criteria — *not
    loaded, recorded*, or *loaded, and `WP-hermetic-user-memory-suppression` merged*.
  - Golden, `buildReferenceBody`'s signature, AC-2 and the verification greps updated
    for the two-import block shape.
