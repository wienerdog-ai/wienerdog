# ADR-0024: Layered secret lifecycle — one shared scanner, four fail-closed persistence gates

Status: Accepted
Date: 2026-07-17

> **OWNER-APPROVED (2026-07-17).** The owner ratified this ADR in the A5
> walkthrough: one shared detector + four independent fail-closed persistence
> gates; hard findings revert/withhold the whole artifact (never a silent
> `[REDACTED]` commit); the residual stays stated (a scanner is never the
> external-effect boundary — A1/A2 contain a miss); and the A5-vs-A9
> private-mode scope boundary stands as written. Per-WP `DECISION NEEDED`
> points (e.g. known-credential exact-value matching, entropy thresholds) are
> resolved in the WP-122..WP-127 walkthroughs and recorded as dated
> `OWNER-APPROVED` blocks in those specs; if a WP ruling changes a detail
> here (such as the coverage list), it lands as a dated amendment to this ADR.

## Context

The nightly **dreaming** job (ADR-0012) reads the user's AI-session **transcripts**
(Claude Code JSONL / Codex rollout files) and consolidates them into the **vault**.
Transcript content is **fully attacker-influenceable and routinely contains real
secrets**: a developer pastes an API key into a chat, a `tool_result` echoes a
`.env` file, an OAuth `refresh_token` appears in a debug log the session captured.

Today a **single** redaction pass exists — `redact(text)` in
`src/core/transcripts/index.js`, a fixed list of `String.replace` regexes applied
once, inside `capMessage`, to each message before it is written to a scratch
extract. It returns **only sanitized text** — no signal of what (or whether
anything) matched. From there, the pipeline persists derived artifacts in many
places, **none of which re-checks for a secret**:

- the brain reads the scratch extract and writes **notes** committed to the vault;
- the brain's **stdout/stderr** is teed verbatim into a durable per-run **log**
  under `~/.wienerdog/logs/`;
- a failing dream's **stderr tail** flows into `state/alerts.jsonl` and from there
  into the injected **digest** (and into the **fail-loud email body**);
- the **digest** injects identity-note bodies into every session and into the
  `CLAUDE.md`/`AGENTS.md` **managed block**.

The 2026-07-15 security audit (action **A5**, deep-dive `05-secret-lifecycle.md`)
found the structural problem: **one best-effort scrubber at ingest is treated as
if it were airtight**, so any secret it misses (a novel provider prefix, an
uppercase assignment key, a token glued to a preceding word character that the
`\b` anchors skip, a value the pattern under-matched) becomes a **committed note,
a durable log line, a digest banner, a managed block, or an email** — durable,
git-tracked, and injected into future sessions. The redaction pass also has **no
failure mode**: a scanner error, or an oversized record, silently degrades to
"emit the raw text."

**IRON RULE (ADR-0004): Wienerdog is just files.** This fix adds no process, no
daemon, no telemetry — a pure detector module and scan calls at existing write
points.

## Decision

Secret handling becomes a **layered lifecycle**: one shared detector, invoked
independently at **four persistence boundaries**, each **failing closed**.

### 1. One shared detector — `scanAndRedact` (WP-122)

A single pure module `src/core/secret-scan.js` exports the detector every gate
calls. Its contract:

- `scanAndRedact(text)` → `{ text, findings }`. `text` is the sanitized copy
  (secret substrings replaced by fixed `[REDACTED:<label>]` tokens); `findings`
  is **metadata-only** — `{label, severity, count}` per matched class. **A finding
  NEVER stores the raw matched secret** (that would re-introduce the leak into
  whatever inspects a finding).
- Two severities: **`redact`** (sanitize inline, keep the surrounding text) and
  **`quarantine`** (a hard finding — a private-key block, a known-credential exact
  match, a high-entropy contextual hit — that a persistence gate treats as
  "withhold/revert the whole artifact," never as "commit the `[REDACTED]`-mutated
  prose").
- **Coverage** (superseding the ad-hoc list): full sensitive assignment keys
  (`client_secret`, `refresh_token`, `access_token`, `password`, `credentials`,
  AWS variants) case-insensitively; structured JSON/env values including
  quoted/base64/URL value characters (`/ + =`); current provider prefixes without
  brittle exact lengths; private-key blocks; contextual high entropy at
  `quarantine` severity; and the exact values of Wienerdog-known OAuth/client
  credentials.
- **Bounded and fail-closed.** Input is size-bounded before any regex runs
  (oversized records are omitted, not scanned — no ReDoS surface); the patterns
  are linear-time (no catastrophic backtracking); and the module is **total** —
  an internal error returns a fail-closed result (content withheld + a
  `scan-error` quarantine finding), never a throw and never the raw text.

The existing `redact(text)` becomes `scanAndRedact(text).text` (byte-compatible
back-compat), so the pre-brain redaction automatically inherits the upgraded
coverage.

### 2. Four independent enforcement points

Each is an **independent** gate — a miss at one does not disarm the next. The
scanner is applied:

1. **Pre-brain input (WP-122).** Every message is `scanAndRedact`-sanitized before
   it is written to a scratch extract (this is the upgraded existing pass). Raw
   source paths, cwd, and session identifiers are additionally bounded/pseudonymized
   before brain exposure.
2. **Staged brain output / pre-commit (WP-123).** Before the dream's single commit,
   the staged **added** content of every kept vault change is scanned. A hard
   finding **reverts/quarantines that file** (per-item, never aborting the run) and
   records a fixed, metadata-only reason. **The `[REDACTED]`-mutated prose is never
   silently committed** — a false positive is a visible revert, not a silent
   rewrite.
3. **Durable stdout/stderr/log/alert path (WP-124).** The brain's stdout/stderr is
   passed through a **bounded sanitizing transform** before it is teed to the log or
   captured as a stderr tail; the fail-loud **email carries no raw log tail**; and
   alert records are scanned before they are persisted to `alerts.jsonl` (and thus
   before they reach the digest).
4. **Each digest section before rendering (WP-125).** Every assembled digest
   **section** is scanned before it joins the output. A section with a hard finding
   is **omitted** (fail closed) and surfaced by a fixed control-plane banner; the
   rest of the digest still renders, so the last known-good context remains.

### 3. Private-by-default artifact modes (WP-126)

The dirs and files this lifecycle writes are created **explicitly private,
independent of umask, with a final `chmod`**: `core/`, `state/`, `logs/`, and the
dream **scratch** dir at `0700`; the sensitive files (`digest.md`, `alerts.jsonl`,
`transcript-ledger.json`, the scratch extract files) at `0600`. `sync` and
`doctor` **repair** pre-existing `0755`/`0644` artifacts. Atomic temp+rename+chmod
is the write shape (mirroring `identity-approvals.js`).

### 4. Documentation (WP-127)

The product claims are corrected to state the detector's limits and the
quarantine/incident flow: secret detection is best-effort, never the external-effect
boundary; the vault stays local and is not auto-pushed; and an incident runbook
covers token revoke/rotate plus git-history cleanup after a leaked secret is found
committed.

## Boundary statement (the A5 residual)

**A scanner is never the external-effect boundary.** Encoded, split, novel, and
unknown secrets make perfect detection impossible: a base64-chunked key, a token
split across two `tool_result` lines, or a brand-new provider format will pass.
The four gates make a leak **progressively less likely to become durable**, and
private modes limit who can read a leaked artifact — but the actual containment of
a missed secret is **A1** (hermetic runtime profiles: the dream brain has no
network/Bash to exfiltrate with) and **A2** (the GWS broker: the model cannot
self-authorize an external send). A5 hardens the *persistence and injection*
surface; it does not claim to stop exfiltration. Same-user native code reading the
`0600` files remains an OS-boundary residual (ACTION-LIST A12), unchanged here.

## Scope boundary vs A9 (private artifact & logging policy)

A5's private-mode item (item 8) and A9 overlap. **A5 scopes only the
secret-lifecycle dirs/files above** — the create-time `0700`/`0600` + the
`sync`/`doctor` repair for `core`/`state`/`logs`/`scratch` and the four sensitive
files. **A9 owns the rest**: the full mechanics-root policy, `secrets/`
tokens/grants/client-JSON hardening, log **rotation/bounding**, and the
comprehensive doctor policy sweep. WP-126 explicitly does not touch `secrets/`
(already `0700` since WP-092/init), the GWS grant/token files, or log rotation —
those are A9. This keeps A5 landable now without waiting on A9.

## Consequences

- Every durable/injected artifact derived from transcript content passes a secret
  gate before it is written; a single missed pattern at ingest no longer implies a
  committed/injected leak.
- A false positive is always a **visible quarantine/omission with a metadata-only
  reason**, never a silent `[REDACTED]` rewrite of the user's own prose.
- The detector is the ONE place secret patterns live; adding a `String.replace`
  regex on transcript text anywhere else is a defect.
- Any future write of transcript-derived content MUST route through `scanAndRedact`
  at its persistence boundary and through the private-fs writers.

## Alternatives considered

- **Keep the single ingest scrubber, just add patterns.** Rejected: it repeats the
  audit's core error — treating one best-effort pass as airtight. A missed pattern
  still becomes durable. Independent gates at each persistence boundary are the
  structural ask.
- **Scan once, centrally, and trust the result downstream.** Rejected: the four
  points read *different* representations (a scratch message, a staged git diff,
  a brain stderr chunk, an assembled digest section); a single upstream scan cannot
  see the bytes a downstream stage actually persists.
- **Silently commit the `[REDACTED]`-rewritten note on a staged finding.** Rejected
  explicitly by the audit: a false positive would silently mutate the user's own
  writing, and a true positive would commit a note whose meaning was altered without
  the human knowing. A visible revert is the correct fail-closed outcome.
- **Fold the private-mode work into A9.** Rejected for sequencing: the secret
  lifecycle's own artifacts must be private the moment they can hold a leaked secret;
  waiting for the full A9 policy would leave `digest.md`/`alerts.jsonl` world-readable
  under a permissive umask in the interim.
- **Treat high-entropy hits as `redact` (inline) rather than `quarantine`.**
  Rejected: an unstructured high-entropy blob has no safe partial form — redacting
  "the secret part" is undefined, so the whole artifact must be withheld/reverted.
