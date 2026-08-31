# ADR-0039: The SessionStart hook injects the digest only when the managed block does not already carry it

Status: Accepted — OWNER-SIGNED 2026-08-30
Date: 2026-08-30

> **Ratified by the owner on 2026-08-30.** The owner ratified this ADR in the
> working session of 2026-08-30 and explicitly instructed the agent, in that
> session, to write the signature line above on his behalf — recorded here so
> the provenance of the line is exact, per the ADR-0035 discipline that an
> agent never writes one silently.

## Context

The [digest](../GLOSSARY.md) (`~/.wienerdog/state/digest.md`) reaches a session
through **two channels**, and the redundancy is deliberate:

1. **The [managed block](../GLOSSARY.md)** in `~/.claude/CLAUDE.md` (and
   `$CODEX_HOME/AGENTS.md`), written only by an attended `wienerdog sync`
   (`src/cli/sync.js` → `shared.applyManagedBlock`). This is the **no-hooks
   baseline**: a user who trusts no hooks, or a Codex user who has not run
   `/hooks`, still gets their context.
2. **The SessionStart hook** (`templates/hooks/session-start.sh`), which reads
   the digest file and emits it as `additionalContext` on every session. This is
   the **fresh-between-syncs enrichment**: the nightly dream job rewrites
   `digest.md` without touching the block, so between syncs the hook is the only
   channel carrying the newer bytes.

`WP-006-claude-adapter` states the rule as *"Redundant on purpose — do not
'optimize' one away"* (`docs/specs/done/WP-006-claude-adapter.md:381`,
Implementation notes). That sentence is right about the **channels** and was read, until now, as
also being about the **bytes**.

**The bytes are a different question, and they were measured.** `renderDigest`
is deterministic: same vault + same banner state → identical output. The nightly
dream rewrite therefore usually reproduces the block's bytes exactly. In that
steady state — the common healthy case — every session carries two byte-identical
copies of the same 6–23 KB of context, one in the block and one from the hook.
The copies diverge only on a discrete event (identity re-approved, project list
changed, an alert / quarantine / update banner toggled), and a divergence then
persists until the user's next manual `sync`, which can be days.

So the cost is paid every session, and the benefit is collected only on the
sessions after such an event.

## Decision

**Keep both channels. Stop sending the second identical copy.**

The SessionStart hook compares the digest against the managed block of every
present harness and emits **nothing** when they already carry the same bytes. On
any difference, any missing or ambiguous block, any read error, any doubt at all,
it emits the full digest exactly as it does today.

The invariant that survives is the one that mattered: **at least one channel
always carries the digest, and correctness never depends on a hook firing.**
Nothing is removed — the hook still runs on every session, still reads the
digest, and still injects it whenever the block is not already carrying it.

**Fail-open is the tie-breaker, always.** A wrong silence loses the user's
context for a whole session; a wrong injection costs tokens. Every ambiguous
state resolves toward injecting.

## Consequences

- The steady-state session saves one full copy of the digest (6,243–23,040 bytes,
  measured on the maintainer's install 2026-08-30). The saving is largest exactly
  where the context budget is tightest.
- **The upper figure is transitional, and that does not weaken the case.** Most of
  today's 23,040 bytes is a single 16,805-byte quarantine-banner line, which
  `WP-quarantine-banner-decay` (Ready, owner-signed) collapses to a fixed-size
  count-plus-pointer. After it lands the duplicated payload is the body — the
  6,243-byte figure, rising toward 10,675 once `WP-digest-line-cap-raise` stops
  the line cap from truncating it. **As of 2026-08-30 that decay has shipped**
  (`docs/specs/done/WP-quarantine-banner-decay.md`, PR #41), so the live figure is
  already the lower one. The redundancy this ADR removes is paid every session in
  either world.
- **The hook stops being a pure `cat`.** `docs/ARCHITECTURE.md` describes it as
  "only cats it (<200ms, no computation)"; the `<200ms` budget stays (ADR-0004),
  the "no computation" clause does not. A few small reads and one string compare
  replace it.
- **The hook must reproduce `buildBlock`'s transformation** (sentinel
  neutralization + `trimEnd`) without being able to `require` it — a shipped hook
  runs from `<core>/bin` and cannot rely on resolving the Wienerdog package. The
  duplication is bounded in the safe direction: any divergence produces a
  mismatch, and a mismatch injects. A parity test against the real `buildBlock`
  pins it.
- **Silence becomes a state a user cannot see.** That is the argument for pairing
  this with a `doctor` check that reports block↔digest drift
  (`WP-doctor-digest-block-drift`) — an independent surface where the same fact is
  observable on demand.
- The hook is **harness-blind**: both adapters copy the same
  `templates/hooks/session-start.sh` (`src/adapters/claude.js:75-87`,
  `src/adapters/codex.js:55-105`) to `<core>/bin/session-start.sh`, so at
  runtime it cannot tell a Claude session from a Codex one. It therefore requires
  **every present harness's** block to match before it goes silent. A
  single-harness user gets full dedup; a dual-harness user dedups only when both
  blocks are fresh. Splitting the script per harness was rejected: it would change
  the command strings that `doctor`'s stale-hook detector and `applySettings`'
  own-variant pruning key on, and would strand the previously-registered
  `session-start.sh` entry in an existing user's `hooks.json` — an entry whose
  script still exists, so neither the pruner nor the stale-hook detector would
  ever remove it.
- **Two residuals the owner accepted on 2026-08-30**, recorded here rather than
  left in a PR comment. Both were Codex design-gate findings against
  `WP-session-start-digest-dedup`; the full record is that PR's closing comment,
  and the reasoning is in that spec's "Residuals" section. **(i) TOCTOU** — a
  dream run that rewrites `digest.md` mid-hook can make the comparison one
  against superseded bytes. **Parked**, under the runbook's park sub-case: every
  honest fix is a freshness mechanism, and this decision deliberately makes no
  freshness claim. Digest writes are atomic, so the worst case is the
  one-session staleness window that already existed and that `sync` closes.
  **(ii) Invalid-UTF-8 folding** — both sides decode through
  `readFileSync(…, "utf8")`, so byte-different invalid sequences compare equal.
  **Residual**: injecting would have delivered the identical decoded string the
  block already carries, so the silence loses nothing.
  *Added 2026-08-30 after this ADR's signature — a record of the owner's own
  dispositions on PR #50, not a new decision; the Decision above is unchanged.*
- ADR-0004's Decision line still reads "no computation at SessionStart", which
  this decision makes literally false. **Amendment 1 is drafted in ADR-0004 and
  is pending the owner's signature**; until then that clause stands as ratified.
- ADR-0004's invariant itself is untouched: this adds no process, no daemon, no
  telemetry. The hook still runs and exits.
