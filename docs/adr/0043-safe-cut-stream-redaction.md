# ADR-0043: EP3's durable-log transform cuts the stream only where no detector rule can match across, not at every chunk boundary

Status: **ACCEPTED under standing authorization 2026-09-18 — owner-signed 2026-09-18.**
Date: 2026-09-18

> Recorded under the standing process in
> `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`, carried
> forward by `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`:
> the architect records a recommendation with the cost of overruling it, the
> session may dispatch under it, and the owner reverses it by dated amendment.
> **Nothing in this repo records the owner approving, accepting or ratifying this
> ADR**, and this ADR asserts no such acceptance. Narrows the *mechanism* of
> ADR-0024's enforcement point EP3; ADR-0024's own text ("a bounded sanitizing
> transform") is unchanged and is not amended here. Constrained by ADR-0004
> (Wienerdog is just files).

## Context

ADR-0024 enforcement point EP3 requires the dream brain's and a routine child's
stdout/stderr to pass through **a bounded sanitizing transform** before they are
teed to `~/.wienerdog/logs/dream/<date>.log` or `~/.wienerdog/logs/<job>/<date>.log`.
The shipped mechanism is one `redactOnly(chunk.toString('utf8'))` call **per
stream chunk**, at four call sites (`src/core/dream/brain.js:517` stderr, `:545`
stdout; `src/cli/run-job.js:1055` stdout, `:1060` stderr).

**The decision this ADR supersedes has no ADR of its own.** Its only record is the
comment at `src/core/dream/brain.js:504-508` — *"Known limitation (OWNER-APPROVED
2026-07-17): a secret split across a chunk boundary may be only partially
redacted — deliberately NOT buffered across chunks, because unbounded reassembly
would reopen the WP-118 OOM/DoS surface"* — echoed by reference at
`src/cli/run-job.js:1048-1052`. What it approves is **not buffering across
chunks**. What it describes as the consequence is wrong: `WP-secret-sink-wiring-probes`
measured, and design review reproduced through real subprocess pipes, that when a
credential's two halves land in separate chunks **neither call redacts anything
and the two writes land contiguously**, so the complete credential is in the
durable log byte-for-byte. Exposure is same-user (0600 files under 0700 dirs).
That measured behaviour is pinned by four green `(KNOWN DEFECT …)` tests today.

The 2026-07-17 rationale is sound about *unbounded* reassembly and wrong about the
alternative: buffering does not have to be unbounded, and the leak it accepts is
not a fragment. What the residual should have said is now decidable, so this ADR
decides it rather than re-wording the same mechanism.

## Decision

1. **Per-chunk redaction is withdrawn as EP3's mechanism for the two stream
   sinks.** The transform accumulates stream bytes and emits them as **regions**:
   each region is scanned by one `redactOnly` call and written whole, regions
   partition the stream in order, and their concatenation is what reaches the log.
   Nothing is dropped and nothing is reordered.

2. **A region ends only at an accepted cut point; the accepted set is enumerated
   positively, and every condition is about an INCOMPLETE MATCH over the whole
   buffered prefix `P`, never about `P`'s last line.** A cut is safe exactly when
   no rule that could still complete on bytes yet to arrive has already begun in
   `P`. A cut is accepted when **all four** hold — this is the whole set; there is
   no forbidden-set to keep closed:
   - **C1 — `P` ends with a line terminator** (`\n`).
   - **C2 — no open key binder at the end of `P`**: `P` does not end with a
     detector sensitive keyword (or `authorization`) followed only by — each
     optional, in order — one quote, whitespace, **one** separator token,
     whitespace, one quote. **That whitespace spans line breaks, CR and LF
     included**, so the keyword may sit any number of blank lines back. Four rule
     families complete this way because their separator group is `\s*` or `\s+`:
     legacy `key=value`, the JSON `"key": "value"` key half, extended assignment
     and `Bearer <token>`.
   - **C3 — no open sensitive quoted value in `P`**: no `"<sensitive key>"`
     followed by `\s*:\s*` and an opening `"` that `P` never closes. The JSON
     rule's value class is `[^"\\]`, which **includes `\n`**, so a quoted value
     stays open across arbitrarily many lines.
   - **C4 — no open private-key block in `P`**: no `-----BEGIN … PRIVATE
     KEY-----` without its matching `-----END … PRIVATE KEY-----`. That is the one
     rule whose body spans arbitrarily many lines.

   **A last-line predicate is not sufficient, and that was round 1's finding.**
   Seven shapes — among them `password:`⏎⏎`value`, `password`⏎`:`⏎`value` and a
   JSON value left open two lines back — are redacted when scanned whole and leak
   across a cut such a predicate permits, all far below the bound of decision 4
   (measured 2026-09-18).

3. **The predicate is the detector's, derived from the detector's own
   constants.** C2, C3 and C4 live in the module that owns the rules
   (`src/core/secret-scan.js`'s constants), and C2's keyword and separator sets
   are **derived from the same `SENSITIVE_KEYS` and `SEP` constants the rules are
   built from** — never written out a second time. A rule added later that can
   match across a line break must extend this predicate in the same change.

4. **Memory stays bounded by a fixed maximum region length**, and that bound is
   the only thing that can force an unaccepted cut. The bound must stay **below
   the detector's `SCAN_MAX_BYTES`**, because a region at or above it is not
   scanned at all — `scanAndRedact` returns its fixed oversized marker, and a
   region that large would replace real log output with a marker. WP-118's
   concern is answered by the bound, not by refusing to buffer.

5. **The residual is what the bound forces, and it is stated in those terms.** A
   secret can still be split only by a forced cut — a single logical line longer
   than the bound with no accepted cut inside it. No chunk boundary splits a
   secret any more. The two comments that describe the old residual are corrected
   by the package that lands the fix; until they are, they misdescribe shipped
   behaviour.

6. **The transform starts nothing** (ADR-0004): it is a plain synchronous
   function over strings, holds no file descriptor, no timer and no process, and
   its state dies with the call that created it. The flush is ordinary buffered
   text, scanned the same way.

7. **Buffering creates a shutdown obligation, and the sink owns it.** Holding
   bytes means there is now a state in which output exists but has not been
   written, so **every path that closes the log must flush first**. A sink that
   buffers therefore exposes an explicit, idempotent shutdown step: flush every
   redactor it owns, then latch closed so that any later handler call — from a
   child that outlived the run and still holds the pipe — writes nothing. A pipe
   `'end'` event is **not** a sufficient trigger on its own: a watchdog timeout
   can close the log while the child survives, and without the explicit step the
   buffered text is either lost or written into an already-ended stream (round 1,
   HEAVY 2). This is a cost the per-chunk design did not have, and it is the price
   of decision 1.

## Consequences

- **Log bytes are written a little later**: at line granularity rather than chunk
  granularity, and the last partial line waits for the stream's end. A consumer
  that reads the log after the run sees exactly the same bytes; a consumer
  watching it live sees complete lines instead of partial ones.
- A test that asserts log content **per chunk** rather than after the stream ends
  must move its assertion to after the end. That is a real migration cost and it
  is paid once.
- The four `(KNOWN DEFECT WD-SINK-CHUNK-…)` probes turn red when this lands, by
  design; the package that lands it converts them rather than deleting them.
- **Giving up**: the simplicity of a stateless per-chunk call, and the claim that
  Wienerdog never holds unscanned child output in memory. It now holds at most
  one bounded region per stream.
- A new detector rule that can span a line break now has a second obligation
  (decision 3). The cost of missing it is a cut that splits that rule's matches —
  the pre-fix behaviour for that rule, not a new class of leak.
- EP3's other property is unchanged: the scan is still bounded, still fail-closed,
  still the one shared detector. EP1, EP2 and EP4 are untouched, and so is
  ADR-0025 — no runtime profile, environment or spawned process changes.

## Alternatives rejected

- **Keep per-chunk redaction and fix only the wording.** That is what the
  2026-07-17 record effectively did. It leaves a whole plaintext credential in a
  durable file, which four committed tests now assert is present.
- **Cut at every newline, unconditionally.** Simpler, and measurably a
  *regression*: six rule families match across a line break today
  (`private-key`, `Bearer`, legacy assignment, JSON value, extended assignment,
  and the keyword-bound entropy tier through those separators), and an
  unconditional newline cut would stop catching them everywhere instead of only
  at chunk boundaries. C2, C3 and C4 exist exactly to keep those cases, and each
  is stated over the whole buffered prefix rather than its last line.
- **Buffer the whole stream and scan once at exit.** Unbounded memory, no live
  log, and it reopens precisely the WP-118 surface the 2026-07-17 record named.
- **Scan a sliding window with an overlap and write the overlap's output once.**
  Redaction changes lengths, so writing a prefix of the scanned output requires
  mapping output offsets back to input offsets; and bytes already written cannot
  be un-written when a later scan finds a match reaching back into them. The
  accepted-cut design has no such mapping and never writes a byte it might want
  back.
- **Put the cut predicate in the sinks.** Two copies of a rule-derived predicate
  in two modules that do not own the rules — the drift ADR-0031 exists to
  prevent.
