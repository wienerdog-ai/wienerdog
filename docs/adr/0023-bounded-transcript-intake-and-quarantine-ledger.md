# ADR-0023: Bounded streaming transcript intake and a per-file quarantine ledger

Status: Accepted
Date: 2026-07-17

> **OWNER-APPROVED (2026-07-17).** The owner walkthrough ratified all three
> pillars as written — bounded streaming intake, the per-file quarantine ledger
> replacing the scalar watermark (fail-safe skip semantics, no-negative-record
> capacity deferral), and the secret-free digest banner as the quarantine
> surface — and then resolved every anchoring value: the WP-118 intake limits
> (50 MB pre-read ceiling, 1 MB line cap, 500 000 lines, fixed 200 MB run
> budget, JSON depth 64) and the WP-119 ledger calls (`size:mtimeMs:dev:ino`
> fingerprint, 0600 ledger file, digest banner as the quarantine channel,
> `since:null` discovery). The dated `OWNER-APPROVED` blocks in the WP-118 and
> WP-119 specs are the per-decision record.

## Context

The nightly **dreaming** job (ADR-0012) consolidates the user's AI-session history
into the **vault**. Its input is the set of on-disk **transcripts** — Claude Code
JSONL files under `~/.claude/projects/**/*.jsonl` and Codex CLI rollout files under
`~/.codex/sessions/**/rollout-*.jsonl`. Transcript content is **fully
attacker-influenceable**: a single oversized `tool_result` (a malicious MCP server, a
`WebFetch` of a huge page) is written verbatim into the JSONL as one line.

The 2026-07-15 security audit (action **A6**, deep-dive `07-parsing-dos.md`) found two
structural problems in this intake path, both still present on `main`:

1. **Whole-file read + parse-all-into-memory before any size cap (finding F1, HIGH —
   availability).** `src/core/transcripts/claude.js` and `codex.js` do
   `fs.readFileSync(filePath, 'utf8')` (whole file into one string), then
   `raw.split('\n')` (a second full copy), then `JSON.parse` each line into live
   objects. `src/core/dream/scratch.js` `collectExtracts` calls
   `transcripts.parse(entry)` for **every** discovered fresh file up front
   (`fresh.map(...)`), holding **all** parsed extracts resident at once — *before* the
   `dream_max_input_bytes` budget is applied. The byte/message caps
   (`MAX_MSG_CHARS`, `MAX_MESSAGES`, the water-fill budget) all run *downstream* of the
   OOM-capable work. Several near-limit files, or one large file beside a normal
   backlog, drive resident memory past Node's heap and OOM-kill the job. Because the
   scalar watermark advances only after a successful commit, the same poisoned file is
   re-selected every night — a **permanent nightly wedge**. (A file above Node's
   ~512 MB max string length instead throws `ERR_STRING_TOO_LONG`, is caught as
   `raw = ''`, and is **silently dropped** — finding F6, a robustness gap.)

2. **A scalar per-harness watermark loses or starves valid sessions.** State is one
   `mtimeMs` per harness in `state/watermarks.json`: "everything with `mtime <= wm` is
   done." This coarse marker cannot distinguish *processed* from *deferred-for-capacity*
   from *permanently-unprocessable*. Real incidents (WP-048, WP-069) showed the
   watermark advancing past sessions no dream ever consolidated — silent permanent
   data loss. And a single permanently-unprocessable file (over any read ceiling)
   either wedges the run forever (if it blocks the watermark) or is silently skipped
   forever (if the watermark jumps it) — there is no "quarantine this one file, keep
   dreaming over the rest, tell the human, and retry only if it changes."

**IRON RULE (ADR-0004): Wienerdog is just files.** The fix adds no process, no daemon,
no telemetry — only bounded reads and a JSON state file.

## Decision

Transcript intake becomes **bounded and streaming**, and the scalar watermark is
replaced by a **per-file quarantine ledger**.

### 1. Bounded, streaming intake (WP-118)

- **Discovery records more than mtime.** For every discovered transcript, record
  `{ path, mtimeMs, size, dev, ino }` (`size` from `fs.Stats.size`; `dev`/`ino` for a
  content-independent identity that survives rename/rotation checks).
- **A hard pre-read file ceiling.** A file whose `size` exceeds a fixed byte ceiling is
  **never read** — it is **quarantined** (see §2), not opened. This replaces the
  accidental, silent ~512 MB `ERR_STRING_TOO_LONG` drop (F6) with an explicit,
  surfaced outcome.
- **Streaming, line-bounded parse.** Under the ceiling, a file is read through a
  synchronous fixed-chunk line reader (never `readFileSync` the whole file, never a
  second `split('\n')` copy). Enforced *during* the read: a **per-line byte cap**, a
  **per-file line-count cap**, and a **per-run aggregate byte cap** across all files.
  `JSON.parse` runs only on a line within the per-line cap, guarded by a cheap
  **nesting-depth** pre-check; a `SyntaxError`/`RangeError` skips that one line.
- **Oversized records become fixed markers; oversized *files* are quarantined.** A
  single line over the per-line cap is replaced by a fixed, code-owned untrusted marker
  (e.g. `[oversized record omitted]`) and the **session is still parsed** — one hostile
  tool_result does not cost the whole session. A **file** over the pre-read ceiling, or
  one that hits the line-count / aggregate caps, is **quarantined** (the file is
  skipped). **Raw oversized bytes never enter scratch, the log, or the brain.**

### 2. Per-file quarantine ledger replaces the scalar watermark (WP-119)

- **`state/transcript-ledger.json`** records, per transcript file (keyed by a
  case-folded absolute path — case-folded for APFS/Windows path identity, exactly like
  the identity trust registry ADR-0021), a content-independent **fingerprint**
  (`size:mtimeMs:dev:ino`) and an **outcome**: `processed` (fully consumed into a dream
  commit) or `quarantined` (permanently unprocessable *as-is*, with a code-owned reason
  class and the fingerprint at quarantine time). It also keeps a per-harness
  `baseline_mtime`, migrated **once** from the retired `watermarks.json`, as the floor
  for files that predate the ledger.
- **Selection rule.** A file is dreamed over iff it is **not** quarantined with a
  matching fingerprint, **and** either (a) its `mtimeMs` is above its harness
  `baseline_mtime` with no `processed` record, or (b) it has a `processed`/`quarantined`
  record whose fingerprint **differs** from the file's current fingerprint (the file
  changed — reprocess).
- **Three outcomes, distinctly:**
  - *processed* → recorded, not reprocessed unless the fingerprint changes.
  - *quarantined* → **not retried while the fingerprint is unchanged**; **retried when
    it changes** (a rotated/replaced file gets a fresh chance).
  - *capacity-deferred* → **no negative record at all.** A valid file that did not fit
    this run's byte budget simply has no `processed` entry, so it is naturally retried
    next run. This is the structural fix for the WP-048/WP-069 starvation class: only a
    file actually consumed is marked `processed`.
- **Continue beside a quarantine + durable, secret-free alert.** A quarantine never
  aborts the run; valid files are processed alongside it. Active quarantines are
  surfaced to the human through a **fixed, code-owned, secret-free digest banner**
  derived from the ledger (file basenames + reason class only — never transcript
  content), re-rendered every digest as long as the quarantine is active. (Channel
  choice is an `OWNER-DECISION` in WP-119.)

### 3. One file at a time, metadata-resident (WP-119)

`collectExtracts` allocates the byte budget from discovery `size` (available without
parsing), then **parses and materializes one file at a time** to its grant, keeping
per-file **metadata** (not every parsed extract) resident. The whole-corpus
`fresh.map(parse)` that held all extracts at once (F1) is removed.

## Boundary statement

The ledger is an **availability / robustness** mechanism, not a trust anchor. A
quarantine is a **fail-safe skip**, never a deletion — the transcript file on disk is
untouched; only Wienerdog's decision to read it changes. The intake caps bound
*memory and time*, not *trust*: a within-cap line is still redacted (A5) and
provenance-gated (A3/A4) downstream. Same-user fabrication of transcript bytes remains
an OS-boundary residual (ACTION-LIST A13), out of scope here.

## Consequences

- The nightly job cannot be OOM-wedged by a crafted transcript: memory is bounded by
  the per-line cap and the per-run aggregate cap regardless of any single file's size.
- No valid session is silently lost to a watermark jump; no permanently-unprocessable
  file wedges the run or is silently dropped; capacity-deferred work is always retried.
- One new durable state file (`transcript-ledger.json`) and one retired one
  (`watermarks.json`, migrated once then ignored). The migration is idempotent.
- Any future transcript source MUST go through the bounded reader and be recorded in
  the ledger; adding a `readFileSync` on a transcript path is a defect.

## Alternatives considered

- **Just add a `stat.size` skip in discovery.** Rejected as insufficient: it fixes the
  single-giant-file case (F6) but not N near-limit files held at once (the real F1 OOM),
  and it does nothing for the watermark starvation/wedge class. Streaming + the ledger
  are the structural fixes the audit asked for.
- **Keep the scalar watermark, add a side-list of quarantined files.** Rejected: two
  overlapping state models (a scalar floor plus a file list) re-create the
  processed-vs-deferred ambiguity that caused WP-048/069. One per-file ledger with a
  migrated baseline is the single source of truth.
- **Quarantine the whole file on any oversized record.** Rejected: a single hostile
  tool_result would cost the entire session's legitimate content. An oversized *record*
  is marked; only an oversized *file* (or cap-exhausting file) is quarantined.
- **Surface quarantines only via `wienerdog doctor`.** Rejected as the sole channel: a
  quarantine must be visible in the injected session digest (where the user actually
  looks), like the identity (ADR-0021) and scheduler (ADR-0018) banners. `doctor` may
  additionally surface it (a deferred follow-up).
- **An async streaming reader (`readline`).** Rejected for now: `collectExtracts` is
  synchronous and single-writer under the dream lock; a synchronous fixed-chunk
  `readSync` loop keeps the call path and tests simple with zero new dependencies.

## Amendments

### Amendment 1 (2026-07-25) — a secret-reverted run defers its inputs, with a bounded, fingerprint-independent retry

Decision §2's "Three outcomes, distinctly" did not anticipate a run in which the
brain exited 0, the inputs were intact and the commit succeeded, but ADR-0024's
EP2 staged-output secret gate **reverted** the derived note. Such a run consumed
nothing — the reverted note is not committed and will not regenerate — yet the
implementation recorded every transcript it read as `processed`. Observed twice
on the maintainer's machine (2026-07-24 and 2026-07-25, three notes reverted each
night): a detector false positive became **permanent memory loss**, precisely the
WP-048/WP-069 starvation class this ADR exists to make impossible.

**Resolution, in four parts.**

1. **A transcript whose derived output was secret-reverted is not `processed`.**
   This is a restatement of the principle already in §2 ("only a file actually
   consumed is marked `processed`"), not a new one.
2. **A fourth record kind, `deferred`, carries a bounded deferral counter.**
   Capacity deferral keeps its "no negative record at all" semantics, unchanged.
   A secret-revert deferral instead writes a record `{outcome:'deferred',
   reason:'secret-revert', deferrals:n}`. It is **not** a negative record: the
   selection rule returns *select* for it, exactly as if no record existed. Its
   only purpose is to bound the retry.
3. **The counter ignores the fingerprint, and an exhausted quarantine is
   sticky.** §2's general rule — a record whose fingerprint differs is retried —
   resets on any `size:mtimeMs:dev:ino` change. A transcript that is still being
   appended to changes every night, so a fingerprint-keyed counter would reset
   every night and bound nothing; and because the byte budget is water-filled
   newest-mtime-first, that same file would win the budget every night and
   starve genuinely new sessions — the WP-048 class in a new dress. Therefore
   the deferral counter is computed **independently of the fingerprint**, and a
   `quarantined` record whose reason is `secret-revert-exhausted` is skipped
   **regardless of** the fingerprint. This is a narrow, reason-scoped exception:
   the intake reasons (`over-ceiling`, `too-many-lines`, `read-error`) keep §2's
   retry-on-change behaviour unchanged.
4. **Exactly one thing resets the bound, and it is evidence that the world
   changed.** A run that commits with **zero** secret reverts records the files
   it consumed as `processed`, which erases their counters — the system heals
   itself the moment the cause is gone. Nothing else resets it: no timer, no
   automatic clear on a later run, no daemon (ADR-0004), and deliberately **no
   side effect of any other command** — a reset an unattended `wienerdog update`
   or a scripted `wienerdog sync` can trigger is not a human decision. Clearing
   an *exhausted* transcript is a separate, explicitly authorized recovery action
   specified in `WP-quarantine-review-cli`; until that ships an exhausted
   transcript stays skipped, which is not data loss — the transcript file is
   untouched and the withheld note is byte-identical in `state/quarantine/`, so
   only its consolidation waits.

**The bound.** A file may accumulate **three** deferrals; the **fourth**
consecutive secret-reverted run that consumes it quarantines it instead, with the
code-owned reason `secret-revert-exhausted`. The human is warned on the first
night and every night after, so the quarantine lands roughly 72 hours after the
first warning.

**Consequences.** Deferral is run-scoped: there is no trustworthy mapping from a
reverted vault note back to the transcripts it derived from, so a run with any
secret revert defers **all** of that run's consumed transcripts. Reprocessing
them re-commits content that run already committed, which the dream's note-update
path tolerates. A transcript merely co-consumed with the offender across three
consecutive reverted runs is quarantined alongside it — accepted, because
attribution is impossible and the alternative is an unbounded nightly retry.
Unlike the pre-amendment behaviour this is loud (a durable digest banner names
the files and says where the withheld copies are), non-destructive (the
transcript file is untouched and the withheld note's bytes are byte-identical in
`state/quarantine/`) and self-healing while the deferrals last (part 4). Records
stay keyed by case-folded absolute path (§2, unchanged), so a rename or rotation
hands the file a fresh budget and a file appearing at a reused path inherits the
record left there; neither harness renames or rotates a transcript, so both are
named residuals in the work package rather than claims of impossibility.

**What is unchanged.** The WP-069 state-advance safety gate — brain exited 0 AND
inputs intact AND commit succeeded — is untouched; this amendment only adds a
fourth condition before recording `processed`, never a weaker one. Capacity
deferral still records nothing at all.

### Amendment 2 (2026-08-29) — the quarantine surface splits: a durable vault record, plus a digest banner that is an exact count on a bounded window

Status: **ACCEPTED — OWNER-SIGNED 2026-08-29.**

**What went wrong.** Decision §2's last bullet fixed the *channel* — "a fixed,
code-owned, secret-free digest banner derived from the ledger … re-rendered every
digest as long as the quarantine is active" — and never bounded its *volume* or
its *lifetime*. Both assumptions failed on the first adopt-with-history install
that met a real session history (maintainer's machine, 0.13.0, 2026-08-29):

- **Volume.** `~/.codex/sessions` held 8,858 rollout files; **191** were
  legitimately over `PRE_READ_CEILING_BYTES`. The banner enumerates every one
  inline, so it rendered as a **single line of 16,805 bytes — 73% of a
  22,986-byte digest**. `DigestCaps` cannot help: the byte cap is spent on the
  banner while the 120-line cap never touches a one-line banner, so the payload
  the digest exists to carry is what gets truncated, in every session, in both
  harnesses.
- **Lifetime.** The ADR was written for the hostile-input case, where a
  quarantine is rare and transient. `over-ceiling` on a **closed historical
  session** is neither: Codex never prunes session files, and a closed >50 MB
  rollout never changes its fingerprint, so §2's "retried when it changes" is
  moot and the banner is **permanent by construction**. Even a collapsed
  count-banner would then sit in every digest forever — which trains
  banner-blindness and damages the banners that *are* actionable.

**The reframe that resolves it.** A quarantine is two different things to a
reader. That **something entered quarantine** is an EVENT — news, and news
belongs in the push channel for a bounded window. That **things are in
quarantine** is STANDING STATE — a durable coverage fact about what the dream
could not see, and standing state belongs in pull-based durable surfaces. §2
routed both down the push channel.

**And one principle governs every surface below: the full enumeration has exactly
ONE home — the vault warnings file. Every other surface (the digest banner,
`wienerdog doctor`, the dream report) carries exact counts plus a pointer to it,
and never a list.** **The pointer promises only what that file can deliver:** it
accompanies counts of QUARANTINED sessions, which the file names. The dream
report additionally counts capacity-deferred transcripts, for which §2 keeps no
record at all, so the file cannot name them and that count travels without a
pointer (`WP-dream-report-run-skips`). A second enumeration is not a second
safety net: it is a
second thing to keep in sync, offered in a surface with no durability advantage
over the first. Counts are always read from the **ledger**, which is ground truth;
the warnings file is derived from it and may legitimately lag by one dream run, so
a surface taking its numbers from the file would report that lag as fact.

Amended as follows.

1. **A durable, code-owned warnings file in the vault, `reports/warnings.md`.**
   Generated from the ledger alone, with the **same trust construction as the
   banner** — `displayName`-sanitized basenames plus code-owned reason labels,
   never transcript content, never a full path, and never brain-authored,
   because **the dream's model is never told this file exists**. That last one is
   a rule about what the brain is TOLD, not a filesystem permission: in the
   current pipeline a model that can write the vault can write any path in it.
   **This file is the enumeration's one home.** It is a **pure, stateless render of the
   ledger**: one section, *Current conditions* (what is in quarantine now,
   grouped by reason), containing nothing time-varying **anywhere in the file**,
   so the file changes **exactly** when its rendered content changes and a
   git-backed vault shows a meaningful diff at that moment and no other.
   **Nothing on disk is ever carried into a write** — every byte Wienerdog writes
   for this path is composed from the ledger alone, because the composer is never
   shown the file — so nothing a user or another process leaves in it can be
   laundered into Wienerdog's own **render**. The same holds of the dream COMMIT
   **once `WP-dream-promote-in-workspace`'s row G8 is the commit path**; until
   then the current wholesale-staging pipeline still commits what is on disk, and
   that window — its exposure and its discharge — is the accepted transitional
   residual recorded under `WP-quarantine-warnings-file`'s Implementation notes. **The DATED history is the vault's git log** (dropped
   the file's own run log, owner-ruled 2026-08-30, after an external review found
   the on-disk carry to be user-controlled commit input): the vault is
   git-versioned by design, so every rewrite commit **is** the dated delta, and
   the dream report's per-run counts carry the per-run story. **One
   reconciliation trigger, write-if-absent
   (owner-ruled 2026-08-29):** a dream run that ends with at least one active
   quarantine and **no** warnings file on disk writes the file, even when that run
   consumed nothing and the quarantine set did not change — so a missing file is
   healed by the next run rather than by the next set *change*, which is what makes
   `doctor`'s "the next dream run writes it" literal and what gives an install
   holding only pre-existing quarantines the file at all. An *existing* file is
   still rewritten only when its rendered content changes — the set gaining or
   losing a member, **or a member's reason or size changing under the same key**,
   which a membership-only test misses and which would otherwise leave the file
   stale indefinitely (no churn either way: the file renders nothing
   time-varying). The vault is
   the system's own durable record and is git-versioned by design; the managed
   block is re-rendered by every sync and, for most users, is not under version
   control, so it can never carry this.

2. **The digest banner for the intake reasons becomes an exact count plus a
   pointer, on a bounded window.** No enumeration reaches the digest. The
   anti-silent-drop invariant survives by different means: the **count is
   exact**, and the enumeration has moved to a surface where it is *more*
   durable than the banner ever was, not less.

3. **Reason classes are split, because they are not the same kind of fact.**
   - The **intake** reasons — `over-ceiling`, `too-many-lines`, `read-error` —
     are **informational**: the user cannot act on them and Wienerdog has already
     done the right thing. Their banner renders **only if at least one active
     intake-reason quarantine was recorded within the last 7 days**. When the
     set has been stable for 7 days the banner retires itself; a new quarantine
     re-raises it. `read-error` is deliberately in this group: the owner
     considered the argument that it may indicate a fixable local problem and
     chose the informational classification (a genuinely actionable read failure
     surfaces through `doctor` and the warnings file, which do not decay).
   - `secret-revert-exhausted` is **actionable** — the user must triage
     `state/quarantine/` — so its banner stays **permanent and verbatim**,
     entirely unchanged by this amendment. A decaying banner is only ever
     correct for a condition the user cannot act on.
   - A reason this version does not recognize is counted with the informational
     group but **never decays**, so a future reason class cannot be retired by
     old code that assumed it was informational.

4. **Seven days, and no new state whatsoever.** The window is 7 days, chosen
   over 14 by the owner. Freshness is computed **at render time from the
   ledger's existing `updated_at` field** — no acknowledgement record, no new
   state file, no new CLI, no timer, no daemon (**ADR-0004**). A record whose
   `updated_at` is missing or unparseable counts as **fresh**, which is the
   fail-loud direction: an unreadable timestamp keeps the warning up rather than
   silently retiring it.

5. **`doctor` reports quarantine counts — the deferred follow-up in "Alternatives
   considered" is now landed.** That entry rejected `doctor` as the *sole*
   channel and left "`doctor` may additionally surface it" undone. It ships as
   **counts, not a list**: `wienerdog doctor` prints one line per non-empty reason
   class carrying the exact ledger count, plus one line naming
   `reports/warnings.md` as where those sessions are named. No transcript name and
   no size reaches `doctor` at all. `doctor` is pull-based, so nothing there
   decays — and because it points at a file, it says so when that file is not
   there yet.

6. **The dream report accounts for its own run's skips.** A run that skipped N
   sessions produces a report that says so.

**The invariant, restated.** §2's "re-rendered every digest as long as the
quarantine is active" is **withdrawn** and replaced by: *a quarantine is durably
NAMED in the vault warnings file and durably COUNTED by `wienerdog doctor` for as
long as it is active; the digest carries an **exact count** for a bounded window
that runs from each record's own `updated_at` — the window opens when a quarantine
record is written or refreshed, so a set change that only **removes** records
re-renders the count without opening one; and an actionable reason class stays
bannered permanently.* Every count is exact and read from the ledger, so no
quarantine can be silently dropped from any surface — and exactly one surface has
to be kept in agreement with the ledger's names.

**Alternatives considered, and rejected.**

- **Acknowledgement-based clearing** (a `wienerdog quarantine ack` that silences
  the banner). Rejected here: it costs a new CLI verb plus new durable state for
  a condition the user cannot act on, and in practice nobody acks — so the
  banner becomes de facto permanent again, which is the defect. Nothing in this
  amendment precludes a future attended review command layering an ack on top;
  the decay is computed at render time and reads no acknowledgement state, so
  adding one later changes nothing here.
- **Raise the pre-read ceiling, or read oversized files partially.** Rejected:
  the ceiling is a memory bound (§1) and never-reading is deliberate. A
  partially consumed session recorded as `processed` would be a lie of exactly
  the WP-048/WP-069 class this ADR exists to prevent.
- **Jump the baseline at install time so pre-existing history is excluded.**
  Rejected: adopt-with-history is a feature, not an accident. The user's
  existing sessions are the point.
- **Let `doctor` print the full list too.** Rejected by the owner on 2026-08-29,
  against a drafted work package that did exactly that: *"I don't see 191 lines
  being useful to the user; they can open the file the pointer names anytime."*
  `doctor` is a scan-in-one-screen command, and a second enumeration buries its
  other checks while offering nothing the warnings file does not already offer
  more durably. This is what generalized into the one-home principle above, and
  it is why the dream report and the digest banner also count rather than list.
- **Keep the enumeration and rely on `DigestCaps`.** Rejected on measurement:
  the banner is one line, so the line cap never reaches it, and the byte cap
  then truncates the payload instead. Bounding the producer is the only fix.

**One stale cross-reference, corrected.** Amendment 1's part 4 says "Clearing an
*exhausted* transcript is a separate, explicitly authorized recovery action
specified in `WP-quarantine-review-cli`; until that ships …". That work package
was **superseded on 2026-07-25 and will never be implemented**
(`docs/specs/done/WP-quarantine-review-cli.md`), and its slug is permanently
taken (ADR-0029: slugs are never renumbered or reused). Read Amendment 1's
sentence as naming an **unbuilt future recovery command**, not that package.
Everything else it states is unaffected: an exhausted transcript stays skipped,
which is not data loss — the transcript file is untouched and the withheld note
is byte-identical in `state/quarantine/`.

**What is unchanged.** §1's intake caps, §2's fingerprint, selection rule and
three-outcome semantics, §3's one-file-at-a-time materialization, the boundary
statement, and every part of Amendment 1 — including the sticky
`secret-revert-exhausted` skip and its permanent banner.

Implemented by **WP-quarantine-warnings-file** (the enumeration's one home, and
the family's root), then **WP-doctor-quarantine-counts**,
**WP-quarantine-banner-decay** and **WP-dream-report-run-skips**, each of which
counts and — for the counts that file can name — points at it. `doctor` and the
banner count quarantines only, every one of which the file names, so they always
point. The dream report is the one package that also counts capacity-deferred
transcripts, for which §2 keeps no record: a section whose only non-zero count is
that one carries no pointer. The exact condition is owned by
`WP-dream-report-run-skips`'s Table A pointer row, cited here and not restated.
