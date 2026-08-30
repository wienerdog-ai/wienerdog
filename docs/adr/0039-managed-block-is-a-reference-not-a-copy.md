# ADR-0039: The managed block is a reference, not a copy

Status: Accepted — OWNER-SIGNED 2026-08-30
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
is a **soft** boundary" — currently sits in **both**.

*Narrowed by Amendment 1 (round-2 finding F2).* An `@import` does **not** move
content out of the instruction channel: an imported file is inlined into Claude Code
**user memory**, which is the same channel `CLAUDE.md` itself occupies. The
instruction-versus-context distinction below is therefore claimed **only** for the
hook channel. What the reference form actually buys is the removal of durable
**copied bytes** from a user-owned 0644 file — which is a real and sufficient
result, and is the one this ADR relies on.

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

*Amended by Amendment 1 (round-2 finding F1).* De-registering the hook removes the
channel §5 relies on to deliver the refusal banner, which was a contradiction between
these two sections. Resolved by giving the Claude Code block a **second import line**
pointing at the refusal banner. A missing target is skipped silently, which is exactly
the semantics wanted: no refusal, no banner, no noise. So the block carries **two**
import lines — the digest and the refusal banner — and the hook is still de-registered
for Claude Code.

### 3. Codex keeps a copy — of what, settled by Amendment 1 — and the asymmetry is documented

Codex has **no** include or import syntax in `AGENTS.md` (official docs checked
2026-08-30; `openai/codex#17401` is an open feature request), its
`project_doc_max_bytes` default is 32 KiB combined, `AGENTS.override.md` **replaces**
rather than merges, and its hooks engine — merged in `codex-rs` with TOML config and
per-hook `trusted_hash` — has no documentation page and is not a stable surface.

Therefore a hook-less Codex session gets copied content plus a constant pointer line
naming the live digest path, rather than a live reference. This asymmetry between Claude
Code and Codex is **accepted and documented**, not engineered around (owner rulings D2,
D3). *What exactly is copied was settled by Amendment 1 (F7) below — the round-1 answer,
"the stable half only, everything volatile ABSENT", is superseded.*

*Amended by Amendment 1 (round-2 finding F7, D3 amended 2026-08-30).* Making
**all** volatile content absent on Codex silently removed that platform's proactive
warnings — alerts, refusals, quarantines — which is a fail-loud regression, not a
fail-safe one. The Codex block's copied content is therefore: the **stable identity**
plus the **code-owned state-derived banners** (alerts, refusal, transcript quarantine,
secret quarantine, scheduler, update, insecure modes) as of the last sync. Only
**untrusted-derived** content (the ADR-0032 daily log) and the **enumerated projects
list** are absent. This preserves fail-loud on Codex at exactly **today's** level —
last-sync banners, no better — while still keeping every untrusted-derived byte out of
the copied block. The constant pointer line stays.

### 4. The stable / volatile split follows the trust classes that already exist

The digest is rendered in two parts. The **stable** part is content that has passed
ADR-0021's exact-byte human-ratification gate — the injected identity notes — and is
by construction incapable of going stale, because ADR-0021 already freezes it to the
last attended sync or `wienerdog memory approve`. The **volatile** part is everything
untrusted-derived (the ADR-0032 daily summary), state-derived (alert, quarantine,
scheduler, update and insecure-mode banners) and enumerated (`## Active projects`).

Only the stable part is ever copied into a user-owned file. The volatile part is
delivered by reference (Claude Code) or is absent (hook-less Codex).

*Narrowed by Amendment 1 (round-2 finding F2).* What this buys, stated exactly: it
removes untrusted-derived bytes from the **durable 0644 user-owned file** and shrinks
the ADR-0024 sink to human-ratified bytes only. It does **not** remove them from the
instruction channel — an imported file is inlined into Claude Code user memory, the
same channel. The instruction-versus-context improvement is real only where content
moves to the **hook** channel, and this ADR does not claim it anywhere else.
Amendment 1 (finding F7) further exempts the code-owned state-derived banners from
"volatile" for the Codex copy specifically; untrusted-derived content is exempted
nowhere.

### 5. A launcher-stage refusal gets its own delivery channel

The launcher writes a **refusal banner** — code-owned, fixed text under
`<core>/state/` — using the same self-contained, no-app-tree-require discipline
`appendRefuseAlert` already uses. It reaches a session three ways: the SessionStart
hook prepends it (one extra file read, no computation — the hook's fail-open design is
preserved), `renderDigest` folds it into the banner prefix, and — per Amendment 1
(F1) — the Claude Code managed block imports it directly, which is what keeps §2's
hook de-registration compatible with this section.

*Superseded by Amendment 1 (round-2 finding F5).* This section originally said the
banner clears on **any** job success and on a successful attended `sync`, on the
premise that the banner exists only when the app tree is broken, so nothing could
succeed while a banner stood. **That premise is false.** `verifyAndResolve(p, name, …)`
refuses on a **per-job** verdict — a descriptor drift for job A refuses A while job B
verifies and runs perfectly — so an unconditional clear lets a healthy job erase a
still-broken job's warning. The corrected design:

- Banner state is **per job**: one entry per job under a launcher-owned directory,
  with a single concatenated file rebuilt from it as the import/read target.
- The **launcher** clears a job's own entry **only after `spawnSync` returns a numeric
  status** — any number, since a non-zero child exit is `run-job`'s fail-loud to report.
  If the spawn **throws** or returns `status === null` (signal-killed, or never started),
  the launcher instead **writes a spawn-failure entry** with a code-owned reason and
  exits 1 (B15/B16). *An earlier draft of this section said "after verification and
  before spawn"; that is ⚠ superseded — clearing before the spawn deleted the banner in
  exactly the cases worth banner-ing (S/R3).* This is launcher-owned state needing no
  app-tree code, and it makes `--catch-up` **self-clearing** — dissolving the 2026-08-01
  arithmetic trap
  (`clearAlerts` fires only for real job names and `--catch-up` never reports success)
  at its source rather than working around it.
- An attended `sync` clears the whole directory, **after** the manifest save, so an
  interrupted sync never strands state ahead of its manifest.
- `run-job` clears **nothing**. Its unconditional clear was the defect.

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
- Untrusted-derived content (ADR-0032) stops being **copied** into a durable,
  user-owned 0644 file. *Narrowed by Amendment 1 (F2): it does not leave the
  instruction channel — an import is inlined into user memory, the same channel.*
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
- A hook-less Codex user, and a Cowork user, see the **untrusted-derived** daily log and
  the enumerated projects list not at all, rather than stale. *Amended by Amendment 1
  (F7): they do **not** lose alert banners — the code-owned state-derived banners are
  copied into the Codex block as of the last sync, because an absent warning is a
  fail-loud regression, not a fail-safe outcome. "Absent beats stale" governs
  untrusted-derived content only.*
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

## Amendments

### Amendment 1 (2026-08-30) — round-2 and round-3 Codex findings

**Status: Proposed — awaiting owner signature.** (The ADR's own `Status` line is
unchanged: the decision of 2026-08-30 stands as signed. This amendment records the
round-2 **and round-3** corrections to it and is not itself in force until signed.)

Six adversarial Codex design reviews of this ADR and its spec chain found forty-three
issues in total — seven in round 1 (**F1–F7**, below), nine in round 2 (**R1–R9**),
seven in round 3 (**S1–S7**), seven in round 4 (**T1–T7**), eight in round 5
(**U1–U8**), and five in round 6 (**V1–V5**, at the end of this amendment). The owner accepted all thirty-eight, and
**reversed two** of his own earlier rulings — compare-and-retry in round 2, and the
versioned lock directory in round 5. The dispositions follow. Four are corrections
to this ADR — two of them to claims that were simply **wrong** — and they are marked in
place in the sections they affect, so no reader of §2–§5 can act on a superseded
statement without seeing the correction beside it.

**F1 — §2 and §5 contradicted each other.** §2 de-registers the Claude Code
SessionStart hook; §5 delivered the refusal banner *through that hook*. As written,
a Claude Code user with the full chain applied would have had no refusal-banner
channel at all — reintroducing, in a new form, the exact four-week silent failure this
ADR exists to fix. **Resolution:** the Claude Code managed block carries a **second
import line** pointing at the refusal banner. A missing import target is skipped
silently, which is precisely the desired semantics — no refusal, no banner, no noise —
so the failure mode of the fix is benign. The hook prepend is **retained** for Codex
and for the interval before the block-as-reference work lands. `doctor` must **not**
report a missing refusal-banner target as a fault: absence is the healthy state.

**F2 — an `@import` does not leave the instruction channel.** Round 1 claimed the
split "removes untrusted-derived bytes from the harness's instruction channel". That is
false: an imported file is **inlined into Claude Code user memory**, the same channel
`CLAUDE.md` occupies. The owner chose to **narrow the claim, not change the
mechanism** — the mechanism's real benefits (no durable copied bytes, no 0644 sink,
ADR-0024 sink removed) stand on their own and are sufficient justification. The
instruction-versus-context distinction is now claimed **only** for the hook channel,
here, in the ADR-0032 amendment, and in the split spec's motivation.

**F3 — the split's composition order was wrong.** `WP-digest-stable-volatile-split`
Table E11 specified volatile-then-stable, which contradicts today's actual render order
(prefix → identity → projects → daily) and would therefore have broken its own E3/AC-1
byte-identity guarantee — a spec whose safety rail contradicted its own contract.
**Resolution:** a **three-component** render — `prefix`, `stable` body (identity), and
`volatile` body (projects + daily). Legacy `digest.md` = prefix + stable + volatile,
byte-identical to today; `digest-volatile.md` = prefix + volatile body;
`digest-stable.md` = stable body.

**F4 — the hermetic canary was non-blocking.** A canary whose adverse verdict has no
consequence is a measurement, not a gate. **Resolution:** "user `CLAUDE.md` **is**
loaded under the production hermetic argv" is now a **blocking** verdict. It spawns
`WP-hermetic-user-memory-suppression`. *⚠ The Done rule stated here — "the canary's own
Done criteria are disjunctive: either not loaded, recorded, or loaded and the suppression
WP merged" — is **superseded by R6**, which found it created a dependency cycle (the
canary would have waited on its own descendant).* **The rule in force:** the canary is
Done once the measurement is recorded, under either verdict; the conditional lives on the
**consumer**, so `WP-managed-block-by-reference` proceeds when the canary is Done **and**
(the verdict is *not loaded* **or** `WP-hermetic-user-memory-suppression` is Done). Same
gate strength, no cycle — the block shape still cannot ship over an unresolved adverse
finding.

**F5 — the banner's clearing rule let one job erase another's warning.** §5's
unconditional clear rested on the premise that nothing can succeed while a banner
stands, because the banner only exists when the app tree is broken. `launcher.js`
refuses on **per-job** verdicts (`verifyAndResolve(p, name, …)`), so the premise is
false and a healthy job could silently erase a broken job's warning. **Resolution:**
per-job banner entries; the launcher clears a job's **own** entry when that job
verifies **and its spawn returns a numeric status**; `sync` clears the whole directory after the manifest save, and only on a fully clean reconciliation;
`run-job` clears nothing. See §5's superseding note. This also makes `--catch-up`
self-clearing, which dissolves the 2026-08-01 logbook's arithmetic trap at its source.

**F6 — the alert-bound rewrite had a lost-update race.** `WP-launcher-alert-bound`'s
C8 appended atomically and then rewrote the compacted file, so a concurrent launcher's
append landing between the read and the rename was discarded. The round-1 resolution was
**compare-and-retry** (capture size and `mtimeMs` at read, re-`stat` before rename,
discard and retry once, then leave uncompacted). **⚠ SUPERSEDED in round 2 — see R2/R5
below: the owner reversed this ruling in favour of a single launcher-owned lock.**

**F7 — D3 amended: Codex was losing proactive warnings.** Ruling D3 made *all*
volatile content absent on a hook-less Codex install, on the reasoning that absent is
fail-safe where stale is not. That reasoning holds for the untrusted-derived daily log
and does **not** hold for alert and refusal banners, where absence is a **fail-loud
regression**. **Resolution (D3 amended 2026-08-30):** the Codex block copies the stable
identity **plus the code-owned state-derived banners** as of the last sync. Only
untrusted-derived content and the enumerated projects list are absent. Codex keeps
fail-loud at exactly today's level — last-sync banners, no better — and still receives
no untrusted-derived bytes.

**Also folded in from the wd-reviewer pass on PR #174:** any spec that adds a basename
to `A5_PRIVATE_FILE_BASENAMES` (or the A9 sets) **must** list
`tests/unit/private-fs.test.js` in its Deliverables — that test pins the membership by
value, so the boundary check rejects the PR otherwise (precedent:
`docs/specs/done/WP-attended-alert-acknowledgement.md`). Applied to
`WP-digest-stable-volatile-split`, whose Deliverables also had a mirror drift against
Table E5 (E5 names two new basenames; the Deliverables row named one). A **canonical
A5/A9 membership table** under ADR-0031 (triggers v/vi/vii) is the right structural fix
and is deliberately **not** done in this round — it is logged as a follow-up.

**Atomic-write hardening (Codex P2):** every temp-plus-rename in this chain adds
`fs.rmSync(tmp, {force:true})` on a rename failure, so a failed atomic write leaves no
orphan temp file beside the artifact it was replacing.

#### Round 2 of review — findings R1–R9 (2026-08-30)

The round-1 corrections above were themselves reviewed. Nine further issues, all
accepted; several are defects **introduced by** the round-1 fixes, which is the useful
signal in this round — a correction is as capable of shipping a bug as the thing it
corrects.

**R1 — the per-job filename was safe but not injective.** F5's sanitizer mapped both
`--catch-up` and a real job named `catch-up` to `catch-up.md`, and collided any two
names sharing its 64-character prefix. One job's refusal then overwrote another's entry
and one job's clear erased another's warning — the exact cross-contamination F5 had just
been written to prevent. **Resolution:** the entry filename becomes
`<readable>-<first 8 lowercase hex of sha256(raw job name)>.md`, with `<readable>` the
sanitized form cut to 48 characters and pseudo-jobs (`--…`) namespaced by a leading `_`,
so `--catch-up` → `_catch-up-<hash>.md` and `catch-up` → `catch-up-<hash>.md`.

**R2 + R5 — two unclosed lost-update windows, and the reversal of F6.** The banner
rebuild (B1a) and the alerts compaction (F6's compare-and-retry) each had a window
between the final `readdir`/`stat` and the rename. Compare-and-retry **narrows** its
window rather than closing it, and would have left the codebase carrying two
differently-shaped half-guards for one problem. **The owner reversed the F6 ruling** in
favour of a **single launcher-owned lock**, in the shape of the dream lock in
`src/core/dream/lock.js` (**WP-008**), which likewise treats an expired holder as dead
rather than blocking forever. It guards two regions and no more: the alerts
append-plus-compaction, and every banner-directory mutation plus its rebuild.

*⚠ The round-2 algorithm — `launcher.lock/`, `rmdirSync` release, 10 s staleness,
5 × 200 ms wait — is **superseded**, twice: by S1/S2 below (token ownership,
rename-based stale break, 30 s staleness, 35 s wait) and by T1/U1/U2 (commit-time fence,
an unversioned directory with a FROZEN core protocol, an opaque lock handle). The canonical algorithm lives in exactly one place,
`WP-launcher-refusal-banner` Table L; this paragraph records the decision, not the
mechanism.*

The rule that keeps the lock from becoming its own failure mode: **fail-loud is never
sacrificed to the lock.** A writer that cannot acquire still appends its alert record
atomically and still writes its own banner entry — it skips only the *derived* work.
**Accepted residual:** after such a fallback `alerts.jsonl` may exceed its bound until
the next lock-holding mutation; self-correcting, and no record is lost.

*⚠ Two clauses here are **superseded**: the fallback no longer skips the banner rebuild
(S2b — it rebuilds unlocked), and the app-side `appendAlert` **does** now take the lock
(S3 — round 2's "boundary, not coverage" was simply the wrong boundary).* A lock
directory created and removed inside one synchronous call starts no process, so
**ADR-0004 is preserved**.

**R3 — clearing before the spawn lost the banner in exactly the cases worth
banner-ing.** F5 cleared a job's entry immediately before spawning it, but the spawn site
collapses a thrown `spawnSync` and a `status === null` (signal-killed, or never started)
into a bare `exit(1)` with no refusal path — so the banner was deleted and nothing
replaced it. **Resolution:** clear **only after** the spawn returns a **numeric** status
(any number — a non-zero child exit is `run-job`'s fail-loud to report, not the
launcher's). On a throw or a null status the launcher **writes** a banner entry with a
code-owned reason (`spawn failed` / `terminated by signal <sig>`), appends a
refuse-class alert, and exits 1. The reason text is deliberately **not** `refusalText`,
whose "integrity mismatch" framing and remedy tails would all be false when verification
has already passed.

**R4 — `sync` cleared even after reporting its own failures.** `src/cli/sync.js` warns
and **continues** when `descriptorFailures > 0` or `heal.failed` is non-empty, then
reached F5's unconditional clear — so a sync that had just told the user a job descriptor
could not be written would silence the banner saying the same thing. **Resolution:**
`sync` clears **only** on a fully clean reconciliation (`descriptorFailures === 0` **and**
`heal.failed` empty), after the manifest save; otherwise it clears nothing and renders its
digest **with** the banner.

**R6 — F4 created a dependency cycle.** F4 made the canary's Done criteria require
`WP-hermetic-user-memory-suppression` to be merged, while that WP `depends_on` the
canary: neither could start. **Resolution:** the canary is Done once the measurement is
recorded, under either verdict; the conditional moves onto the **consumer**, so
`WP-managed-block-by-reference` proceeds when the canary is Done **and** (the verdict is
*not loaded* **or** the suppression WP is Done). Same gate strength, no cycle.

**R7 — F1's second import line was contradicted by its own mirrors.** An AC in
`WP-digest-stable-volatile-split` still described one import line, and an AC in
`WP-managed-block-by-reference` still called `buildReferenceBody` with a single
argument. **Resolution:** every example, signature and criterion in all three specs now
requires **both** imports, in order (volatile digest, then refusal banner). The **last**
WP in the chain owns a **non-skipped** end-to-end test — unresolvable `app/current` plus
a de-registered hook, and the banner still reaches the session through the second import.

**R8 — F7's fix contradicted its own mirrors too.** After F7, `E7`/`AC-9` said the Codex
block carries stable identity **plus** banners while the Deliverables and implementation
notes still said `codex.js` copies `digest-stable.md` **only**, and the GLOSSARY and this
ADR still said volatile content is absent on Codex. **Resolution:** an explicit
compositor, `buildCodexBlock({prefix, stable, pointerLine})` in `src/adapters/codex.js`,
reading `digest-stable.md` and a **new** `digest-prefix.md`. The third rendered file is
what makes the compositor honest: it needs the banners without the projects list and the
daily log, and parsing them back out of `digest-volatile.md` would re-implement the
prefix/body boundary in a second place. Every superseded "absent" statement in the
GLOSSARY and in §3 / Consequences above was purged in the same pass.

**R9 — the Codex block could exceed Codex's own limit.** Each rendered component carries
its own 32 KiB budget, so concatenating three of them can pass Codex's 32 KiB *combined*
`project_doc_max_bytes` before the user's own `AGENTS.md` content is counted at all.
**Resolution:** cap the **composed** block at **24 KiB**, leaving roughly 8 KiB for the
user — *⚠ superseded in round 3 of review by S5, which makes the budget adaptive to the
user's measured `AGENTS.md` bytes rather than assuming they fit in 8 KiB* — in an
explicit priority order — preamble, banners, pointer line, then the stable
identity truncated into the remainder with the standard truncation marker. Only identity
truncates; a warning the user must see outranks identity they mostly already know, and a
pointer line that truncates away is worse than no pointer at all.

**The pattern worth recording.** Six of these nine (R1, R2/R5, R3, R4, R7, R8) are
defects in round-1's *corrections*, not in the original design, and two of them (R7, R8)
are the same shape: a canonical table was updated and its registered mirrors were not.
ADR-0031's Mirrored Surface Checklist exists precisely to prevent that, and it did not,
because a checklist tracks mirrors **outward** from a table and nothing verifies a
table's rows against **each other** or against the Deliverables that must satisfy them.
The remedy adopted for round 3 is procedural rather than structural: every canonical
table is re-read row-against-row after any edit, and every acceptance criterion is
matched to the Deliverables row that satisfies it before the spec is handed on.

#### Round 3 of review — findings S1–S7 (2026-08-30)

Round 2's corrections were themselves reviewed. Seven further issues, all accepted, no
ruling changes — **the lock stays**. Two of the seven (S1, S2) are defects in the lock
that round 2 introduced, which is the third consecutive round in which a fix shipped its
own bug. That pattern, not any individual finding, is the reason this round added a
written **state-machine argument** to the lock's spec and an **AC-to-Deliverables
satisfiability map** to the review ritual.

**S1 — the lock could admit two owners, and could free a lock it did not hold.** Round
2's stale takeover was `rmdirSync` followed by `mkdirSync`, which has no funnel: two
contenders observing the same stale lock could both remove it (the second failing
harmlessly) and both then create it in an interleaving where each believed it had won.
Separately, release was a bare `rmdirSync` with **no ownership check**, so a holder that
had been broken mid-work would delete its *successor's* lock and admit a third owner.
**Resolution:** the acquirer stamps `<lock>/owner` with a 16-hex **token** immediately
after `mkdirSync`; release reads that file and acts **only on a token match**, no-oping on
mismatch, unreadable, or absent. The stale break becomes an atomic
`renameSync(lock, lock.stale-<pid>-<rand>)` — one source directory, so exactly one
contender wins and every loser gets `ENOENT` and simply retries `mkdirSync`. Staleness is
judged by the **lock directory's mtime**, never the owner file, because a lock is
legitimately owner-less for the microseconds between the `mkdir` and the stamp; a protocol
reading "no owner file" as "stale" would break infant locks and produce the very condition
it was meant to prevent. The threshold rises from 10 s to **30 s** against a stated
**millisecond** expected hold — four orders of magnitude of headroom, so a break implies a
genuinely dead or pathologically stalled holder. **Accepted residual:** a legitimately slow
holder that gets broken loses only its *derived* rebuild; its banner entry and alert record
are durable before the rebuild begins.

**S2 — the contended fallback could hide a banner indefinitely.** Three sub-problems.
(a) The bounded wait (10 s) was **shorter** than the staleness threshold, so a crashed
holder could push a writer onto the fallback path before anyone broke the lock — the
fallback was reachable in exactly the case the staleness rule existed to handle. The wait
becomes **35 s (140 × 250 ms)**, deliberately **exceeding** the 30 s threshold, so a dead
holder is always broken first, with margin. The launcher is synchronous and fires hourly,
so a 35 s worst case is acceptable. (b) The fallback skipped the rebuild, leaving the
derived file **guaranteed** stale; it now rebuilds **without** the lock, because the
rebuild is idempotent and lands by atomic rename — unlocked it can lose a race but never
corrupt, and a possibly-stale file is strictly better than a guaranteed-stale one. (c)
Readers now **self-heal**: `renderDigest`'s app-side callers read the banner **directory**
and rebuild the concatenated file under the lock whenever it disagrees, so every `dream`
and every `sync` repairs the artifact. Only the SessionStart hook and the Claude Code
import stay bound to the concatenated file — the hook because it must remain a single-file
read with no computation, the import because `@import` cannot glob a directory.

**S3 — the lock covered only half the writers of the file it guarded.** Round 2 scoped it
to the launcher and *explicitly recorded* the app-side `appendAlert` as out of scope. Both
sides write the same `alerts.jsonl`, so that closed the launcher-vs-launcher race and left
the launcher-vs-app race — the more likely one, a nightly fire during an attended `sync` —
wide open. **Resolution:** every writer takes the same lock. `src/core/alerts.js` requires
`acquireLauncherLock` from `src/scheduler/launcher.js`, which is safe
because `launcher.js` is require-safe (its `module.exports` precedes the
`if (require.main === module)` guard) and the dependency runs **app → launcher** only,
never the reverse. The vendored `<core>/launcher/launch.js` is a byte copy of that same
file, so the two processes cannot run different protocols: **one implementation, no twin
literals** (ADR-0031). `alert-ack.js` is deliberately excluded — it writes a different
file and is called from inside `clearAlerts`, which already holds the lock, so locking
there would self-deadlock.

**S4 — `sync` still cleared after a catch-up reconciliation failure.** R4 gated clearing on
`descriptorFailures` and `heal.failed`, but `repairCatchup` reports every failure as
`{notice?: string}` and `repointSchedules` folds it into `notices` — a console line no code
tests — so a failed catch-up repair never reached the gate. The catch-up entry is the only
mechanism that delivers a missed nightly dream, so this was precisely the failure that must
not silence the banner. **Resolution:** `repairCatchup` returns a structured
`{ok, reason?}`, including a caught throw as `{ok:false, reason:'threw: …'}`;
`repointSchedules` propagates it as `catchup`; `sync` folds it into `reconciliationClean`.

**S5 — the Codex block's fixed cap ignored the user's own bytes.** R9's flat 24 KiB
silently assumed the user's own `AGENTS.md` content fits in the remaining 8 KiB. A user
with 20 KiB of their own instructions would have been pushed past Codex's 32 KiB combined
`project_doc_max_bytes` and had content dropped **by Codex, without warning** — the same
class of silent undelivered failure this ADR exists to fix, one layer down.
**Resolution:** the allowance becomes adaptive — `32 KiB − the user's own AGENTS.md bytes
− 2 KiB reserve`, measured on every compose, floored at a minimal critical block
(preamble + banners + pointer). When even that floor does not fit, write the critical block
anyway — never drop the banners — and push a `sync` notice naming the three byte counts,
because a user can act on numbers and cannot act on a silent overflow.

**S6 — a missing dependency.** `WP-codex-block-pointer-line` un-skips the end-to-end test
that `WP-refusal-banner-delivery` creates, without declaring a dependency on it. Added.

**S7 — a pre-R6 sentence survived the R6 fix.** The canary's implementation notes still
said "This WP is not Done until that successor is merged", contradicting the Context table
R6 had already corrected to break the dependency cycle. Purged; a repo-wide grep found no
other occurrences.

**What round 3 changed about the process, not the design.** Three consecutive rounds
shipped fix-induced defects, and rounds 2 and 3 concentrated them in whichever mechanism
had just been introduced. Two habits are now required of this chain and are worth carrying
beyond it: a **written state-machine argument** for any concurrency primitive, walking the
contended, crashed-holder, slow-holder and exhausted-wait cases explicitly (it is in
`WP-launcher-refusal-banner` under Table L); and an **AC-to-Deliverables satisfiability
map** produced before hand-off, which in round 3 caught three unsatisfiable criteria that
no reviewer had flagged.

#### Round 4 of review — findings T1–T7 (2026-08-30)

Seven findings, all accepted, no ruling changes. **Five of the seven (T2, T3, T4, T6,
T7) are mirror drift or dependency errors introduced by the previous rounds' own
corrections** — not new design faults, but places where a canonical table moved and one
of its mirrors did not. Only T1 is a genuine mechanism defect, and T5 is a residual the
owner accepts rather than engineers away.

**T1 — the lock protected the window but not the commit.** Round 3 added token
ownership at *release*; nothing checked ownership at the moment that matters, the
**destructive rename**. A holder evicted mid-work still held a fully prepared temp file,
and its `renameSync` would land a **pre-successor snapshot** on top of `alerts.jsonl` —
deleting every record the successor had appended in the meantime. The same applies to a
stalled `clearAlerts` rewrite and to the banner rebuild. **Resolution:** a **commit-time
fence** — immediately before any destructive rename of a guarded file, re-read
`<lock>/owner`, re-compare the token, and on mismatch or `ENOENT` remove the temp and
**abort the rewrite**. Aborting costs nothing: the append already landed before
compaction began, and the banner rebuild is self-healing. **Accepted residual:** a holder
that passes the fence and is evicted in the microseconds before its rename can still
clobber — the same class as the residual `src/core/alerts.js` documents at lines 87–88,
and reaching it requires a >30 s stall mid-compaction plus a microsecond-wide window.

**T2 — the Exact contracts section contradicted its own table.** `writeRefusalBanner`'s
JSDoc still said the acquisition-failure path "skips ONLY the rebuild", which S2b had
already reversed to *rebuild unlocked*. This is the most dangerous shape of drift in the
whole chain: an implementer reads the **signature**, not the table three sections above
it, so the superseded behaviour is what would have been built.

**T3 — a superseded algorithm survived two rewrites by being a copy.**
`WP-launcher-alert-bound`'s C8d restated the lock's mechanism inline (bare `rmdirSync`,
10 s, 5 × 200 ms). S1/S2 rewrote the protocol and T1/T5 amended it again; the copy was
updated by neither. It is now a **pointer row** that names Table L and the exported
primitives and restates no mechanism at all, and its acceptance criteria read the
constants **from the launcher's exports** rather than from literals. That this happened
*inside a chain that cites ADR-0031 in six specs* is the finding worth keeping: a
canonical table only prevents drift for facts that are actually referenced rather than
copied, and "a table plus a checklist" does not detect a copy nobody registered.

**T4 — three acceptance criteria asserted behaviour outside their spec's Deliverables.**
Each of AC-26/26a/27 in the launcher WP bundled a source-state fact (`sync.js`, owned
there) with a digest-content fact (`renderDigest` wiring, owned by the delivery WP). The
AC-to-Deliverables map introduced in round 3 passed them because it matched at *spec*
granularity while the defect was inside a single criterion. Split; the map is now run at
clause granularity.

**T5 — an interrupted update can put two protocol versions on one lock.** The vendored
`<core>/launcher/launch.js` is a byte copy of `src/scheduler/launcher.js`, but during an
interrupted update the two sides can differ. The round-4 resolution was to put the protocol version in the
directory name (`launcher.lock.v1/`) so mismatched sides use different directories.
*⚠ **Superseded by U1.** That is exactly backwards: two versions holding two different
directories do not exclude each other at all, so both can compact `alerts.jsonl` over the
other's appended record — **irreversible record loss**, categorically worse than the
derived-file drift it was avoiding. The lock directory is unversioned and permanent; the
core protocol is FROZEN (see U1 below).* The rejected alternative is
worth recording: making the app side **load the out-of-tree launcher** would guarantee
one protocol, and would invert the trust direction — the app tree would execute the very
file whose purpose is to be verified *before* the app tree runs, outside the app release
digest's coverage of `src/`. A divergence residual is cheaper than an inverted trust
boundary.

**T6 — the Codex pointer contract predated its own reordering.** R9/E7a moved the
pointer line **before** the stable identity, precisely so it can never be the component
that truncates; the Deliverables row and `buildPointerLines`' contract still described
it as **appended** after the stable digest. Rewritten so `buildPointerLines` returns the
paragraph and knows nothing about block shape, and `buildCodexBlock` places it.

**T7 — a missing dependency would have reopened F1 as a scheduling bug.**
`WP-managed-block-by-reference` de-registers the Claude Code SessionStart hook but
declared no dependency on the WP that creates the import target, nor on the WP that wires
the hook channel it replaces. Shipped early, its second import line would point at a file
that never exists — and a missing import target is skipped **silently**. Both added, with
an explicit rollout order: the hook channel lands first, the import lines take over, the
hook is de-registered last.

**The process change this round forces.** Rounds 2, 3 and 4 each shipped fix-induced
defects, and round 4's were almost entirely **drift between a table and its mirrors**
rather than bad decisions. The AC-to-Deliverables map (round 3) and the state-machine
argument (round 4) both worked and neither could catch this class. So round 5 adds a
**mechanical reconciliation**: every constant and verb of a multi-spec contract is
grepped across every file in the chain and listed against its canonical row before
hand-off. It found six live sites still naming the unversioned lock directory minutes
after T5 was applied — drift introduced *by the fix for the drift finding*, which is
exactly the point.

#### Round 5 of review — findings U1–U8 (2026-08-30)

Eight findings, all accepted. Three are lock-protocol defects — including one where
round 4's *fix* was strictly worse than the problem it addressed — and five are
superseded prose that survived in the ADR and the GLOSSARY after the specs had moved on.

**HARD CONSTRAINT introduced by this round — the frozen lock core.** The launcher
lock's core protocol is **FROZEN**: `mkdirSync` acquire, an `owner` file, token-checked
release, mtime-based staleness, a rename-based stale break, and a commit-time fence. Any
future change to the lock **must remain compatible with this core**, so that two builds
of Wienerdog running side by side — the ordinary state during an interrupted update —
**always mutually exclude**. The `owner` file carries `"protocol": 1` for diagnostics and
forward reading only; a reader that finds an unfamiliar value treats the lock as **live**
and waits. Exclusion and staleness are never derived from it. This constraint binds
future ADRs and specs, not just this chain.

**U1 — round 4's version-skew guard was worse than the problem.** T5 put the protocol
version in the lock *directory name* so that mismatched builds could not corrupt each
other's lock state. That reasoning inverted the actual risk: two builds holding **two
different directories** do not exclude each other at all, so both can compact
`alerts.jsonl` — and each can land a snapshot over the other's appended record.
**Irreversible loss of a fail-loud record**, traded for avoidance of *recoverable*
derived-file drift. Withdrawn. One unversioned directory, the frozen core above, and
`protocol` as a non-exclusionary field. **This also removes the owner-acceptance question
round 4 raised:** with one directory and a frozen core, an interrupted update costs
nothing beyond the pre-existing >30 s-stall residual. There is no version-skew residual
left to accept.

**U2 — the commit-time fence was not implementable as specified.** T1 required every
destructive rename to re-compare the lock token, while `acquireLauncherLock` returned
only a release closure — so no caller could obtain the token the fence needs. Resolved
by returning an **opaque handle** `{ release(), stillHeld() }` with the token captured in
the closure and never exposed: the fence becomes `handle.stillHeld()`, and no exported
function takes a token parameter that could be passed, logged, or forged.

**U3 — the fence covered renames only, and destruction is not only renaming.** An
evicted *clearer* could still `unlink` a per-job entry that its successor had freshly
written for the same job, and an evicted `sync` could still wipe the whole banner
directory under a successor that had repopulated it. Both destroy state without renaming
anything. The fence now guards **every** destructive operation — rename, unlink,
directory clear, and `clearAlerts`' remove-when-empty — each calling `stillHeld()`
immediately before acting and aborting on false.

**U4 — the GLOSSARY and §5 still described the superseded clear timing.** Both said a
job's entry clears "after verification and before spawn", which R3 replaced three rounds
earlier: clearing before the spawn deletes the banner in precisely the cases worth
banner-ing. Restated in both places — clear **only after `spawnSync` returns a numeric
status**; on a throw or a null status, **write** a spawn-failure entry instead.

**U5 — one spec both mandated and forbade the same change.** `WP-launcher-alert-bound`
required `clearAlerts` to take the shared lock (S3) while its Out-of-scope section still
forbade changing `clearAlerts` at all. The prohibition is removed and replaced with an
exact authorization: the shared lock, the fallback, and the commit-time fence — and
nothing else. Its filtering semantics, its `pruneAcksForJob` call, and its
remove-when-empty behaviour are unchanged.

**U6 — the F4 disposition still stated the pre-R6 canary Done rule.** R6 broke that
dependency cycle by moving the conditional onto the consumer; the F4 paragraph above was
never updated. Marked superseded in place, with the rule in force restated beside it.

**U7 — an acceptance criterion contradicted its own contract table.** The split spec's
AC-3 placed an identity-exclusion banner in the `volatile` body, while E2/E11 place every
banner in the `prefix`. Restated: the banner appears in `prefix`, and therefore in
`digest-prefix.md` and in `digest-volatile.md` after composition.

**U8 — the GLOSSARY and ADR-0032 still described the pre-split topology.** Both said
Claude Code imports `digest.md` and Codex receives the stable half only — two topologies
superseded by the split (E4/E6/E7) and by F7's banner carve-out. Restated to the final
topology in both places, with pointers to the canonical rows rather than fresh prose.

**What round 6 changes about the sweep.** Rounds 4 and 5 both leaked through **GLOSSARY
and ADR prose**, which the constant-level reconciliation introduced in round 5 does not
read — it greps numbers and identifiers, and these were sentences. The sweep is therefore
extended: **every sentence in the chain that states a topology or lifecycle fact** — what
Claude imports, what Codex copies, when a banner entry clears, when the canary is Done,
what the lock protects — must either **point at a canonical row** or carry a **⚠
superseded** marker. Narrative prose is where superseded designs survive longest, because
it reads as explanation rather than as specification.

#### Round 6 of review — findings V1–V5 (2026-08-30)

Five findings, **all mirror or contract drift — no new protocol defect**, and U1, U2, U4,
U6 and U7 confirmed fixed. A pure reconciliation round, and the first in which the
mechanism itself was not implicated.

**V1 — a spec forbade a change it simultaneously demanded.** `WP-launcher-alert-bound`
authorized exactly three `clearAlerts` changes while C8h1/AC-13c5 already required a
fourth: fencing the `rmSync` that removes the whole file when no records remain. This is
**U5 recurring one round later in the same section** — the round-5 fix enumerated the
authorized changes as a closed list, and the very next round's U3 added one without
reopening it. A closed enumeration is a mirror like any other. Now four changes,
each citing its row; the prohibition narrowed to **semantic** change only.

**V2 — a table row overclaimed against its own sibling.** B1a called the concatenated
banner file "the single path every reader points at", which B18a contradicts by having
`renderDigest`'s app-side callers read the directory and self-heal. B1a now names only
the two readers that cannot enumerate a directory.

**V3 — an implementation note carried a superseded sequence.** The delivery spec still
said "clear first, then read", from before B17 moved clearing after the manifest save and
gated it on a clean reconciliation. Replaced with the real sequence.

**V4 — the amended topology was still imprecise in this ADR.** Amendment 1's consumer
list blurred three genuinely different cases. Restated per harness: **Claude Code** copies
no daily-summary bytes but *references* `digest-volatile.md`, which contains the summary;
**hook-less Codex** copies the stable identity plus last-sync code-owned banners;
**Cowork** skips *both* user-scope imports and therefore receives **only the inline stable
identity — no summary and no banners**, which is named for the first time as an
**accepted fail-loud degradation** rather than left implicit.

**V5 — a Deliverables cell three rounds stale.** The Codex golden was still described as
"stable-only content", predating F7's banner carve-out. Restated to the E7 composition.

**The check this round adds.** Every finding here is a **mirror that no existing gate
reads**: the constant sweep reads identifiers, the sentence sweep reads topology and
lifecycle claims, the AC map reads criteria against Deliverables — and none of them reads
an **Out-of-scope section against its own tables and criteria**. V1 is exactly that pair.
So the ritual gains one more pass: for every spec, read Out-of-scope against every table
row and every acceptance criterion, and list any pair that conflict. Run on this round it
found two further conflicts beyond V1 — a Deliverables cell promising a `renderDigest`
change the spec cannot make, and an acceptance criterion asserting content its own
Out-of-scope assigns to a successor WP.
