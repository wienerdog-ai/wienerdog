# ADR-0039: The managed block is a reference, not a copy

Status: Proposed
Date: 2026-08-30

## Context

Every new AI session is bootstrapped with the **digest**
(`~/.wienerdog/state/digest.md`, rendered by `src/core/digest.js`). It reaches a
session through **two** channels that were designed as guarantee plus enrichment.
`src/adapters/claude.js` states the intent in its header comment: the **managed
block** holds the whole digest "so a Claude Code session has its context even with
zero hooks; the SessionStart hook is enrichment only (fresher digest between
syncs). Correctness never depends on a hook firing." `src/adapters/codex.js`
carries the same comment for `~/.codex/AGENTS.md`.

The design does not hold up in practice, and a user report ("Felho", 2026-08-30)
plus a code audit the same day established four defects:

1. **Both channels carry the same bytes.** `wienerdog sync` copies the whole of
   `state/digest.md` into the managed block, and `templates/hooks/session-start.sh`
   injects the *same file* again. Measured on the maintainer's machine: `digest.md`
   is 8,764 B, the managed block is 8,812 B of a 12,975 B `~/.claude/CLAUDE.md`
   (**68 %** of the user's entire user-level memory file), and the hook adds a
   second copy — roughly **17.5 KB of duplicated digest per session**.
2. **The guaranteed channel is the stale one.** Only `sync` calls
   `applyClaudeAdapter`/`applyCodexAdapter`. The nightly `dream` regenerates
   `state/digest.md` (`regenerateDigest` in `src/cli/dream.js`) but never re-applies
   the block. So the *guaranteed* channel carries the digest as of the last attended
   sync while the *optional* channel carries the fresh one — the inverse of the
   stated design. The volatile sections are exactly the ones that matter daily:
   `## Latest daily log` (ADR-0032), `## Active projects`, and the alert /
   quarantine / update / scheduler / insecure-mode banners.
3. **When both fire and disagree, nothing orders them.** The model sees two
   `## Latest daily log` sections and two alert banners with no freshness cue.
4. **Codex has no fresh channel at all.** Its hooks run only after the user trusts
   them interactively, so a Codex user who never trusts hooks sees a digest frozen
   at the last sync, forever.

**The incident that made this urgent.** On the maintainer's machine `app/current`
pointed at a purged worktree from 2026-08-02. Every hourly `--catch-up` and nightly
`dream` refused with an integrity mismatch whose text promises *"This alert will
appear in your next digest."* It never did, for four weeks. The reason is
structural, not a bug in one function:

- The refusal lives in `src/scheduler/launcher.js` (`refuse()`), which runs
  **before** `run-job` is ever spawned. It appends to `alerts.jsonl`, writes stderr,
  and exits non-zero. It never calls `renderDigest`.
- It **cannot** call `renderDigest`. The launcher deliberately requires no code from
  the tree it is verifying — that is why `appendRefuseAlert` is a self-contained
  duplicate of the app-side alert writer. `renderDigest` lives in the app tree.
- The **email leg of fail-loud is also dead** in this mode. `defaultSendAlert`
  (`src/cli/run-job.js`) spawns `gen.wienerdogBin(paths)` — the shim at
  `~/.local/bin/wienerdog`, which is `exec node "$HOME/.wienerdog/app/current/bin/wienerdog.js"`.
  With `app/current` dangling that fails; and the launcher never reaches `run-job.js`
  anyway, so a launcher-stage refusal has **no** email path by construction.
- Consequently **the whole CLI was wedged**: `sync`, `alerts`, `doctor` and `dream`
  all route through that shim and died with a raw `MODULE_NOT_FOUND`. The user could
  not even list the alerts that were being recorded hourly.

So the two legs GLOSSARY's **fail-loud** promises ("alert email … **or** a banner
line in the digest") were *both* unavailable at exactly the stage that was refusing.
`docs/specs/logbook/2026-08-01-a-correct-refusal-that-repeats-is-a-different-defect.md`
designed the `wienerdog alerts ack` mechanism against the opposite failure —
**over**-rendering, 119 identical banners in six days. The state has since inverted
to **zero** rendering. Both failures have one cause: the digest is the only banner
channel, and only two attended-ish writers can produce it.

**The folklore this ADR replaces.** "The dream must not write CLAUDE.md" is widely
believed in this codebase and **is written in no ADR**. ADR-0025's containment
constrains the *brain* (the spawned `claude -p`: staging `cwd`, `--add-dir` write
roots); `dream.js` the orchestrator is not the brain and already writes
`state/digest.md`, `transcript-ledger.json` and the quarantine tree unattended.
ADR-0038 is the only ADR with managed-block semantics and it governs **deletion at
uninstall**, classing the block as an `EMBEDDED` artifact — "bytes Wienerdog wrote
inside a file the user owns and keeps editing." The belief is real and worth keeping;
it has simply never been stated, so it has never been stated *correctly*.

**Two facts nobody had named, both decisive.**

- **Confidentiality downgrade.** `state/digest.md` is written by `writeFilePrivate`
  at **0600** and `digest.md` is in `A5_PRIVATE_FILE_BASENAMES`
  (`src/core/private-fs.js`). `applyManagedBlock` writes with plain
  `fs.writeFileSync` (no mode, no atomic rename), and `~/.claude/CLAUDE.md` is
  **0644** and sits **outside** `scanPrivateModes`' in-core scope. The copy step
  republishes at 0644 exactly the bytes A5 hardened to 0600.
- **ADR-0024 names the managed block as a durable secret sink** — a missed secret
  becomes "a committed note, a durable log line, a digest banner, **a managed
  block**, or an email … durable, git-tracked, and injected into future sessions."
  Not copying digest bytes into `CLAUDE.md` removes one of those four sinks outright.

**Trust-channel asymmetry.** The harness presents `CLAUDE.md` to the model as
instructions ("these instructions OVERRIDE any default behavior"); SessionStart
`additionalContext` is presented as context. ADR-0032's untrusted-fenced daily
summary — mixed-provenance by construction, with the accepted residual that "a fence
is a **soft** boundary" — currently sits in **both**. The instruction channel is the
worse of the two homes for it.

**IRON RULE (ADR-0004): Wienerdog is just files.** Nothing here adds a process,
watcher or poller. Every mechanism below is a file written by a job that exits.

## Decision

### 1. The write rule (the durable one)

> **No unattended job performs a read-modify-write on a file Wienerdog does not
> own. Freshness is delivered by rewriting a Wienerdog-owned file that the
> user-owned file points at.**

Attended `wienerdog sync` remains the only writer of `~/.claude/CLAUDE.md` and
`~/.codex/AGENTS.md`. Unattended jobs (`dream`, routines, `run-job`, the launcher)
write only inside `~/.wienerdog/`.

### 2. The managed block becomes a reference wherever the harness supports one

For Claude Code, the block holds a short fixed preamble plus a memory **import** of
the absolute path to the digest, instead of a copy of its bytes. Verified against
`https://code.claude.com/docs/en/memory` (fetched 2026-08-30): `@path` imports are
supported in user-level `~/.claude/CLAUDE.md`; relative, absolute and `~`-prefixed
paths are all allowed; **user-scope imports load without the external-import
approval dialog** (that dialog is project-scope only); imports resolve **at session
launch**, not per turn, with the root `CLAUDE.md` re-read on `/compact`; the limit is
**4 hops**; imports inside code spans or fences are ignored; a `CLAUDE.md` over
**4 MiB** is skipped entirely.

Consequences that follow directly: `CLAUDE.md`'s bytes stop changing between
attended syncs; the digest stops existing as a 0644 copy; the ADR-0024 managed-block
sink disappears; and the Claude Code SessionStart digest injection becomes redundant
and is **de-registered** (the script itself stays — Codex still uses it).

### 3. Codex keeps a copy of the stable half only, and the asymmetry is documented

Codex has **no** include or import syntax in `AGENTS.md` (official docs checked
2026-08-30; `openai/codex#17401` is an open feature request), its
`project_doc_max_bytes` default is 32 KiB combined, `AGENTS.override.md` **replaces**
rather than merges, and its hooks engine — merged in `codex-rs` with TOML config and
per-hook `trusted_hash` — has no documentation page and is not a stable surface.

Therefore a hook-less Codex session gets the **stable** content plus a constant
pointer line naming the live digest path, and the **volatile** content is
**ABSENT** rather than stale. This asymmetry between Claude Code and Codex is
**accepted and documented**, not engineered around (owner rulings D2, D3).

### 4. The stable / volatile split follows the trust classes that already exist

The digest is rendered in two parts. The **stable** part is content that has passed
ADR-0021's exact-byte human-ratification gate — the injected identity notes — and is
by construction incapable of going stale, because ADR-0021 already freezes it to the
last attended sync or `wienerdog memory approve`. The **volatile** part is everything
untrusted-derived (the ADR-0032 daily summary), state-derived (alert, quarantine,
scheduler, update and insecure-mode banners) and enumerated (`## Active projects`).

Only the stable part is ever copied into a user-owned file. The volatile part is
delivered by reference (Claude Code) or is absent (hook-less Codex). This removes
untrusted-derived bytes from the harness's instruction channel *and* from the durable
0644 user-owned file, and shrinks the ADR-0024 sink to human-ratified bytes only.

### 5. A launcher-stage refusal gets its own delivery channel

The launcher writes a **refusal banner** — a code-owned, fixed-text file at
`<core>/state/refusal-banner.md` — using the same self-contained, no-app-tree-require
discipline `appendRefuseAlert` already uses. The SessionStart hook prepends it
(one extra file read, no computation — the hook's fail-open design is preserved) and
`renderDigest` folds it into the banner prefix.

The banner clears on **job success and on a successful attended `wienerdog sync`**
(owner ruling D4). Both are required: `clearAlerts(paths, job)` fires only for real
job names, and `--catch-up` is a pseudo-job that never reports success, so a
catch-up refusal banner would otherwise never self-clear — the exact arithmetic trap
recorded in the 2026-08-01 logbook entry.

### 6. E1 is retained as a documented fallback, not built

Rendering the alert banner live inside the hook, by parsing `state/alerts.jsonl` and
`alerts-ack.json`, would also work and would survive a stale banner file. It is
**not built now** (owner ruling D5) because it breaks the hook's "read one file, no
computation, genuinely fail-open" design (audit A6/F4), adds a JSON parse of an
attacker-writable file to a fail-open path, and creates a **second implementation**
of `formatAlerts` + `unacknowledgedAlerts` living outside the app tree — an ADR-0031
mirror with no canonical table. It is recorded here so the option is not
re-discovered from scratch if the banner file proves racy.

## The threat, named precisely

The write rule in §1 is **not** a defense against an adversary, and must not be
described as one. Anyone who can influence what the dream puts into `digest.md` can
write `CLAUDE.md` directly — same UID, same process, and `docs/THREAT-MODEL.md` T0
already places arbitrary same-UID native code out of scope. Restricting the block
write buys **latency, not authority**: attacker-influenced digest bytes reach
`CLAUDE.md` one attended sync later, and since `sync` copies those bytes without
displaying them, the human review that latency is supposed to enable does not
actually happen. As an integrity control against an attacker it is close to
worthless, and ADR-0035 cuts the same way — an attended CLI run is *already*
arbitrary code execution, so an attended write to `CLAUDE.md` grants nothing new.

What the rule genuinely defends is narrower and real:

1. **Destruction of user-authored bytes under a race.** `applyManagedBlock` is an
   unlocked read-modify-write of an entire user-owned file, using plain
   `fs.writeFileSync` in all three of its write paths — **not** the atomic
   temp-plus-rename `writeFilePrivate` used everywhere else in the core. A nightly
   job racing the user's open editor can silently lose hand-written text.
   `locateManagedBlock` throws on ambiguous sentinels precisely so a **human** can
   resolve them; an unattended job has no human to hand that to.
2. **The size of the set of user-owned files an unattended job mutates.** This is
   ADR-0004's "just files" posture and ADR-0038's `EMBEDDED` class expressed on the
   write side rather than the delete side. Every file in that set is one more place a
   bug or a scoped write becomes durable in territory Wienerdog does not own.

Stating it this way is what makes §2 permissible: an import line makes `CLAUDE.md`'s
bytes **constant** between attended syncs, which is strictly stronger than the
status quo on both counts.

## Alternatives considered

- **The dream re-applies the managed block** (under a byte-equality precondition
  against a hash recorded in the manifest). **Rejected.** It violates §1 head-on; it
  requires an unattended atomic-safe read-modify-write that `applyManagedBlock` is
  not; it requires an unattended manifest write; it needs a new manifest evidence
  field on exactly the `EMBEDDED` class ADR-0038 governs, dragging in that ADR's
  N/R/D discipline; and its ambiguity fallback is circular (set a banner in the
  digest it just wrote). Above all it **fixes staleness by making the duplication
  fresh** — defects 1 and 3 above survive permanently. Highest cost, lowest
  structural payoff.
- **A `rendered: <ISO>` freshness stamp inside the block.** **Rejected as
  specified**: it breaks the idempotence invariant (`CLAUDE.md`, "running twice =
  zero changes"), because every `sync` would then produce different block bytes and
  `applyManagedBlock` would report `changed` on every run. Day granularity only
  defers the flip. What survives is a **constant** pointer line naming the live
  digest path — no timestamp — which is what §3 adopts for Codex.
- **The refusal path regenerates `digest.md`.** **Architecturally impossible**, not
  merely unbuilt: the launcher must not require code from the tree it is verifying,
  and `renderDigest` lives in that tree. §5 is the reachable form of the same intent.
- **Keep both channels and add an ordering cue.** Fixes only defect 3, leaves the
  duplication, the staleness, the 0644 copy and the ADR-0024 sink in place.

## Consequences

- Session-start context for Claude Code roughly halves (measured 17.5 KB → 8.8 KB on
  the maintainer's machine), and the digest stops occupying 68 % of the user's
  `CLAUDE.md`.
- `~/.claude/CLAUDE.md` stops being a durable secret sink (ADR-0024 amended below)
  and stops holding a 0644 copy of 0600 identity content.
- Untrusted-derived content (ADR-0032) leaves the harness's instruction channel.
- Correctness for Claude Code now **does** depend on the import resolving, where it
  previously depended only on `sync` having run. A **missing import target is skipped
  silently** (community-corroborated: `anthropics/claude-code#56927`, `#1041`), so
  `sync` must verify `digest.md` exists before writing the import line and `doctor`
  must check the target resolves. Both are specified as implementation requirements.
- **Known limitation (Cowork desktop):** Cowork sessions skip user-scope imports that
  resolve outside the session `cwd`, and skip a symlinked `~/.claude/CLAUDE.md`
  entirely. A Cowork user therefore gets the stable block content only — the same
  degraded tier as hook-less Codex. Documented, not worked around.
- **Open measurement, gating the Claude Code work:** whether `--setting-sources ''`
  (emitted by `composeClaudeArgs` in `src/core/runtime-profile.js` for every hermetic
  run) also suppresses user-level `CLAUDE.md` is **not documented**. `claude -p` is
  documented to load `CLAUDE.md` unless `--bare` is passed. If `CLAUDE.md` *is*
  loaded in hermetic runs, the managed block already carries the digest into the
  dream's own brain today and this ADR changes only *which* digest — not a
  regression either way, but ADR-0025's "no ambient authority inheritance" claim
  depends on the answer, so it is measured by canary before the block shape changes.
- A hook-less Codex user, and a Cowork user, lose alert banners entirely rather than
  seeing stale ones. Accepted (D2/D3); the tradeoff is that "absent" is a fail-safe
  direction and "stale" is not.
- ADR-0031's density trigger fires for this work: the channel/content-class/harness/
  freshness contract is mirrored across `src/adapters/claude.js`,
  `src/adapters/codex.js`, `src/core/digest.js`,
  `templates/hooks/session-start.sh`, the golden fixtures and the uninstall reverser.
  The lead spec carries the canonical table and its Mirrored Surface Checklist.

## Amendments this ADR makes elsewhere

Applied in place, in the same change:

- **ADR-0024** — the four-sink list in its Context is amended: the managed block
  ceases to be a secret sink once it carries a path rather than digest bytes.
- **ADR-0032** — its Consequences line naming "SessionStart injection and any
  managed-block compile" as inheriting the fence is amended: under §4 the managed
  block no longer carries the daily summary at all, which is strictly stronger than
  inheriting the fence.
- **`docs/GLOSSARY.md`** — `fail-loud` (the email leg is unavailable at launcher
  stage), `digest` (delivered by reference where the harness supports it), and two
  new canonical terms: **volatile digest** and **refusal banner**.

ADR-0021, ADR-0028 and ADR-0035 need no amendment. ADR-0035 is cited for why an
*attended* `CLAUDE.md` write requires no new trust; ADR-0028's launcher discipline
(no app-tree require) is the constraint that shapes §5.
