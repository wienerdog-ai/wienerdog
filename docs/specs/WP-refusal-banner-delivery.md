---
id: WP-refusal-banner-delivery
title: Display the refusal banner — SessionStart hook prepend plus a renderDigest prefix fold
status: Draft
model: sonnet
size: S
depends_on: [WP-launcher-refusal-banner]
adrs: [ADR-0004, ADR-0032, ADR-0039]
epic: digest-delivery
---

# WP-refusal-banner-delivery: make the refusal banner visible

## Context (read this, nothing else)

Wienerdog injects a pre-rendered **digest** (`~/.wienerdog/state/digest.md`) into
every new AI session. It reaches a session two ways: copied into the **managed block**
of `~/.claude/CLAUDE.md` by `wienerdog sync`, and injected by the SessionStart hook
`templates/hooks/session-start.sh` (installed to `<core>/bin/session-start.sh`).

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP reads two files instead of
one. It adds no process.

**What the predecessor built.** `WP-launcher-refusal-banner` made the **independent
launcher** (`<core>/launcher/launch.js`) write a **refusal banner** whenever it refuses
to run a scheduled job. Banner state is **per job** — one entry per job under
`<core>/state/refusal-banner/`, each exactly one line, `> [!warning]` plus one space,
followed by the folded refusal sentence, `0600`, atomically replaced — and the launcher
rebuilds a single concatenated `<core>/state/refusal-banner.md` from those entries, in
sorted filename order, after every write and every clear. **The readers in this WP use
the concatenated file only** (`Table B`, B1a/B15); they never enumerate the directory.
With no entries the concatenated file is **removed**, so "absent" is the healthy
state. It exists because a launcher-stage refusal has **no other delivery
channel**: the launcher must not require code from the app tree it is verifying, so it
cannot call `renderDigest`; and the fail-loud email leg spawns the CLI shim, which is
unusable when `app/current` is precisely what failed. On the maintainer's machine that
gap hid an hourly refusal for four weeks (see
`docs/specs/logbook/2026-08-30-the-banner-channel-inverted-and-nobody-noticed.md`).

**Nothing reads that file yet. This WP adds two of its three readers** — the third,
the Claude Code managed-block import line, belongs to
`WP-managed-block-by-reference`.

The two readers here are deliberately different in kind:

- The **SessionStart hook** is the channel that works when the app tree is broken —
  the case the banner exists for. It must therefore stay exactly what its header
  comment says it is: *"Fast, no computation — just read one file and JSON-encode it.
  GENUINELY fail-open — always exit 0 (audit A6/F4)."* It gains **one more file read**
  and a string concatenation. Nothing else.

  **The hook prepend is permanent, not transitional (round-2 finding F1).**
  `WP-managed-block-by-reference` de-registers this hook for **Claude Code** only. It
  stays registered for **Codex**, which has no import mechanism at all, and it is the
  only banner channel for every Claude Code install during the interval between this WP
  landing and the block-as-reference work landing. Do not treat it as scaffolding.
- `renderDigest` folds the banner into its existing banner **prefix**, so the banner
  also appears in a normally-rendered digest and in the managed block. This path only
  ever runs when the app tree is healthy, so it is the redundant one — but it costs
  one option field and keeps the two channels consistent.

**Prefix ordering matters and is decided here.** `renderDigest` already assembles a
fixed prefix in urgency order: identity-exclusion warning, alerts, quarantine line,
secret-quarantine warning, insecure-modes warning, scheduler line, update line. The
refusal banner goes **first**, ahead of the identity warning. Its meaning is "a
scheduled job refused to run and the app files could not be confirmed" — which
subsumes every other banner, because when it is present the machinery that produces
the others may not have run at all.

## Current state

`templates/hooks/session-start.sh` in full (31 lines):

```bash
#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment, not capture): injects the
# pre-rendered digest into a new Claude Code session. Fast, no computation —
# just read one file and JSON-encode it. GENUINELY fail-open — always exit 0
# (audit A6/F4): no `set -e`, every fallible step is best-effort.

# Skip during Wienerdog's own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0

# No usable core path or no node → nothing to inject; fail-open.
[ -n "${WIENERDOG_HOME:-}" ] || [ -n "${HOME:-}" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0

# Emit the Claude Code SessionStart envelope. node (>=18, always present since
# Wienerdog is a Node CLI) does the JSON-safe encoding — no jq dependency.
# The full envelope is built first and written in ONE call; on any read failure
# (TOCTOU-deleted/unreadable digest) it emits NOTHING — empty stdout means "no
# additional context", never a partial envelope.
node -e '
try {
  const fs = require("fs");
  const t = fs.readFileSync(process.argv[1], "utf8");
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: t } }));
} catch (e) { /* fail-open: no output */ }
' "$DIGEST" || true
exit 0
```

Note line 17: `[ -f "$DIGEST" ] || exit 0` — today a missing digest means the hook
emits nothing at all. After this WP a missing digest but a **present banner** must
still emit the banner; that is the whole point (the banner's own failure case is an
app tree so broken that no digest was ever rendered).

`src/core/digest.js` — the prefix assembly at the end of `renderDigest`:

```js
const prefix = [identityWarn, formatAlerts(opts.alerts || []), opts.quarantineLine || '',
  secretQuarantineWarn, insecureModesWarn, opts.schedulerLine || '', opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
const assembled = prefix ? `${prefix}\n\n${body}` : body;
return capDigest(assembled, prefix);
```

`capDigest(assembled, prefix)` reserves the prefix's own lines and bytes before
capping the body, so the prefix can never be squeezed out — a longer prefix simply
leaves less room for the body. Callers: `src/cli/sync.js` and the `regenerateDigest`
closure in `src/cli/dream.js`, each passing an options object.

`src/core/refusal-banner.js` (from the predecessor) exports `REFUSAL_BANNER_FILE`,
`refusalBannerPath(paths)`, `readRefusalBanner(paths)` → `string` (`''` when absent,
never throws) and `clearRefusalBanner(paths)`.

Golden fixture `tests/golden/digest-default.md` is byte-frozen; when every banner
input is empty the digest output must be unchanged.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | templates/hooks/session-start.sh | read the banner; prepend to the digest; emit when either exists |
| modify | src/core/digest.js | accept `opts.refusalBanner`; place it FIRST in the prefix |
| modify | src/cli/sync.js | pass `refusalBanner: readRefusalBanner(paths)` — read AFTER the clear |
| modify | src/cli/dream.js | pass `refusalBanner: readRefusalBanner(paths)` in `regenerateDigest` |
| modify | tests/unit/digest.test.js | prefix order + empty-input byte stability |
| create | tests/unit/session-start-hook.test.js | hook emits banner+digest, banner-only, digest-only, neither |
| create | tests/unit/refusal-banner-delivery.test.js | the end-state chain assertion (AC-12) |

**Golden files:** `tests/golden/digest-default.md` must NOT change — the frozen
default has no refusal banner, so its bytes are unchanged. If your run reports a diff
there, you have a bug, not a golden to update. **You do not have permission to update
any golden fixture in this WP.**

### Exact contracts

```js
/** renderDigest gains ONE option. Everything else is unchanged.
 *  @param {{refusalBanner?: string, ...}} opts
 *  refusalBanner — the launcher's banner text, or '' / undefined when absent.
 *  Placed FIRST in the prefix array, ahead of identityWarn. Empty string is
 *  filtered out by the existing `.filter((s) => s !== '')`, so an absent banner
 *  changes no bytes. */
```

The prefix line becomes:

```js
const prefix = [opts.refusalBanner || '', identityWarn, formatAlerts(opts.alerts || []),
  opts.quarantineLine || '', secretQuarantineWarn, insecureModesWarn,
  opts.schedulerLine || '', opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
```

**Hook behaviour matrix** — the injected `additionalContext` for each of the four
states:

| Banner file | Digest file | Emitted `additionalContext` |
|-------------|-------------|-----------------------------|
| present | present | `<banner>` + `"\n\n"` + `<digest>` |
| present | absent | `<banner>` |
| absent | present | `<digest>` (byte-identical to today) |
| absent | absent | nothing at all — no envelope, empty stdout (as today) |

Worked example. Banner file contains one line:

```text
> [!warning] wienerdog: refusing to run "--catch-up" — cannot resolve app/current (integrity mismatch); no job was run. This alert will appear in your next digest. Do not run `wienerdog sync` — this check could not confirm the app files are the ones you installed, so syncing is not the safe next step. Reinstall Wienerdog from a trusted source, then investigate.
```

Digest file starts `# Who you're working with\nAda Kovács — product lead.\n`. The
emitted `additionalContext` is the banner line, then a blank line, then the digest
text verbatim.

## Contract reference

N/A — the banner contract is decided in `WP-launcher-refusal-banner` Table B; this WP
adds row B14's two readers and mirrors nothing else. The prefix ordering is a single
local fact stated once, in Exact contracts.

## Implementation notes & constraints

- **Keep the hook dumb.** The whole value of the hook path is that it works when the
  app tree does not. Do not parse the banner, do not read `alerts.jsonl`, do not
  branch on content. Read a second file, concatenate, encode. ADR-0039 §6 records
  hook-side rendering from `alerts.jsonl` as a deliberately **unbuilt** fallback — do
  not build it here.
- **The gating line must change carefully.** Today `[ -f "$DIGEST" ] || exit 0` guards
  everything. Replace it with a guard that exits 0 only when **neither** file exists;
  otherwise fall through to the `node -e` call, which must handle either path being
  missing. Simplest correct shape: pass both paths to `node -e` and let it read each
  inside its own `try`, treating an unreadable file as `''`; emit nothing only when
  both come back empty. That keeps the single-write, all-or-nothing envelope property
  the current comment promises.
- **Preserve fail-open exactly.** No `set -e`. Every added step best-effort. The script
  still always `exit 0`. It must pass `shellcheck --severity=warning` and be formatted
  with `shfmt -i 2`.
- `templates/hooks/session-start.sh` is copied to `<core>/bin/session-start.sh` by
  `shared.copyHookScript`, which compares bytes and rewrites on any difference — so
  the updated hook lands on an existing install at the next `wienerdog sync`, with no
  migration step.
- **The same script serves Codex.** Both `src/adapters/claude.js` and
  `src/adapters/codex.js` copy this one file. Do not add anything Claude-specific to
  it; the `hookSpecificOutput` envelope is already shared and stays as it is.
- **Read the banner AFTER clearing it in `sync`.** The predecessor's Table B row B10
  makes a successful `sync` clear the banner. `sync` must clear first, then
  `readRefusalBanner`, so a successful sync's digest carries no banner. Getting this
  backwards produces a digest that permanently shows a refusal the sync just resolved.
- `capDigest` already reserves prefix lines and bytes, so a long banner correctly
  shrinks the body rather than being dropped. Do not touch `DigestCaps`.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] The banner is code-owned control-plane text written by the launcher and already
      folded to a single line and capped at 2000 characters (Table B, B4). Do not
      re-sanitize and do not relax: the hook must not emit it un-encoded — it goes
      through the same `JSON.stringify` envelope as the digest.
- [ ] The hook resolves the banner path from `WIENERDOG_HOME` or `HOME` exactly as it
      already resolves the digest path. Do not add a new environment variable and do
      not accept a path from argv.
- [ ] A banner file that is unreadable, empty, or a directory must degrade to "no
      banner" and never to a partial envelope or a non-zero exit.
- [ ] The banner is prepended, never interpolated into the digest body, so it cannot
      land inside the ADR-0032 untrusted fence or be mistaken for daily-log content.

## Acceptance criteria

- [ ] AC-1 — With both files present the hook emits one JSON envelope whose
      `additionalContext` is banner + `\n\n` + digest.
- [ ] AC-2 — With only the banner present the hook emits an envelope containing just
      the banner. (This is the case the WP exists for: no digest was ever rendered.)
- [ ] AC-3 — With only the digest present the hook's output is **byte-identical** to
      the pre-change hook's output.
- [ ] AC-4 — With neither present the hook emits nothing and exits 0.
- [ ] AC-5 — The hook exits 0 in every case above, and when `state/` is unreadable.
- [ ] AC-6 — `WIENERDOG_JOB` set still short-circuits before any read.
- [ ] AC-7 — `renderDigest` with `refusalBanner` set puts it as the first prefix
      element, before the identity-exclusion warning.
- [ ] AC-8 — `renderDigest` with `refusalBanner` absent, `''`, or `undefined` produces
      byte-identical output to before the change; `tests/golden/digest-default.md`
      still matches with no golden update.
- [ ] AC-9 — A **fully clean** `wienerdog sync` (no descriptor-write failures, no
      scheduler reload failures) clears the banner and its rendered digest contains no
      banner line. A sync that reported either failure clears nothing and renders the
      digest **with** the banner — `WP-launcher-refusal-banner` Table B row B17 owns
      that rule; this WP only has to pass whatever `readRefusalBanner` returns.
- [ ] AC-10 — `shellcheck --severity=warning templates/hooks/session-start.sh` passes
      and `shfmt -i 2 -d templates/hooks/session-start.sh` reports no diff.
- [ ] AC-11 — Running `wienerdog sync` twice is idempotent (second run: zero changes).
- [ ] AC-12 — **End-state chain assertion (round-2 finding F1).** With `app/current`
      unresolvable, the launcher refusing, and the **full** chain applied — that is,
      with the Claude Code SessionStart hook **de-registered** as
      `WP-managed-block-by-reference` leaves it — the banner still reaches a Claude Code
      session, via the managed block's refusal-banner import line. Assert on the
      artifacts the harness would read (the block's import line resolves to a
      concatenated banner file whose content is the refusal), not on a live session.
      **If `WP-managed-block-by-reference` has not landed when you implement this WP,
      write the test `skip`ped with a comment naming that WP**, so the gap is recorded
      rather than forgotten — it is the exact contradiction F1 caught.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern digest
npm test -- --test-name-pattern session-start
npm test
npm run lint
shellcheck --severity=warning templates/hooks/session-start.sh
shfmt -i 2 -d templates/hooks/session-start.sh
# AC-8 — the frozen golden is untouched (expect NO output):
git diff --stat -- tests/golden/digest-default.md
# both renderDigest callers pass the new option:
grep -n "refusalBanner" src/core/digest.js src/cli/sync.js src/cli/dream.js
# F5 — the readers use the CONCATENATED file, never the directory (expect NO output):
grep -n "readdir\|refusal-banner/" templates/hooks/session-start.sh
```

## Out of scope (do NOT do these)

- Writing or clearing the banner — that is `WP-launcher-refusal-banner`.
- Hook-side rendering from `alerts.jsonl` (option E1) — ADR-0039 §6 keeps it unbuilt.
- Bounding `appendRefuseAlert` — that is `WP-launcher-alert-bound`.
- Any change to the managed block, the adapters, or the digest's body sections — those
  are `WP-managed-block-by-reference` and `WP-digest-stable-volatile-split`.
- Changing `DigestCaps`, `capDigest`, or the order of the seven existing prefix
  elements relative to each other.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(digest): display the refusal banner (WP-refusal-banner-delivery)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 findings F1 and F5 (owner: ACCEPTED).**
  - **F1.** ADR-0039 §2 de-registered the Claude Code SessionStart hook while §5
    delivered the refusal banner *through that hook* — so the finished chain would have
    left a Claude Code user with no banner channel, reintroducing the four-week silent
    failure in a new form. Resolved at the ADR level by giving the Claude block a
    **second import line** for the banner. In this spec: the hook prepend is now stated
    as **permanent** (Codex has no imports, and Claude Code needs it until the block
    work lands), and a new **AC-12** asserts the end state — unresolvable
    `app/current`, hook de-registered, banner still delivered — with an explicit
    instruction to land it `skip`ped if `WP-managed-block-by-reference` has not merged
    yet, so the contradiction cannot silently reappear.
  - **F5.** The predecessor's banner became per-job entries plus a rebuilt concatenated
    file. The readers here bind to the **concatenated file only** and never enumerate
    the directory — which keeps the hook's "read one file, no computation" property
    intact and gives the Claude import a single path to point at. Current state updated;
    a verification grep now asserts the hook does no directory reads.
- **2026-08-30 — round-3 consistency pass.** AC-9 still asserted that *any* successful
  `sync` clears the banner, which round-3 finding R4 had just narrowed to a **fully
  clean** reconciliation. Reworded, with the rule itself left where it belongs — Table B
  row B17 in `WP-launcher-refusal-banner` — so this spec mirrors rather than restates it.
