---
date: 2026-07-17
title: Audit A4 + A3 — the real fixes behind the A0 freezes
related_wps: [WP-048, WP-109, WP-112, WP-114, WP-115, WP-116, WP-117, WP-118, WP-119, WP-120, WP-121, WP-122, WP-123, WP-124, WP-125, WP-126, WP-127]
---

# Audit A4 + A3 — the real fixes behind the A0 freezes (2026-07-17)

**Audit A4 + A3 — the real fixes behind the A0 freezes (2026-07-17).** With A0
shipped (WP-109..113), the next audit actions replace two blunt freezes with their
real mechanisms. Each action is split into a dependency chain rather than one large
WP, so every step has literal verification commands and a tight, adversarially-
reviewable Deliverables table. **A4 (shared strict frontmatter parser).** The daily-
Summary removal already shipped in WP-112, so A4's remaining scope is the shared
parser. Wienerdog reads `key: value` frontmatter with three ad-hoc parsers that
disagree on the security field `derived_from_untrusted` — a concrete fail-open lives
in the digest, which excludes a note only on the literal string `true` (so `True`,
`"true"`, `'true'` are injected). **WP-114** ships the one strict parser
(`src/core/frontmatter.js`, typed fail-closed accessors; the convention is recorded
in **ADR-0022** — one strict, not-a-YAML, fail-closed parser for security-bearing
notes) and migrates the digest's trust gate onto it, closing the fail-open, with a
**differential test** proving the
digest and the dream validator now interpret identical bytes identically (the
audit's "no byte accepted as trusted at commit, interpreted differently by the
digest" gate). **WP-115** (depends WP-114) is the structural de-duplication: the
validator's `parseFrontmatter` and `config.js`'s `readScalar` route through the one
lexer/coercer with no behavior change. **A3 (human-ratified identity memory).**
WP-112 froze the dream from writing the four injected identity files; A3 adds the
read-side enforcement + the positive evolution path, per the new **ADR-0021**.
**WP-116** (depends WP-112, WP-114 — both touch `digest.js`) ships the exact-byte
**identity trust registry** (`state/identity-approvals.json`, 0600), gates the
digest's identity injection on an exact-byte hash match (fail closed + banner on
mismatch), seeds first-time at attended `sync` (the dream never seeds), and hardens
`isInjectedIdentity` case-insensitively (closing the APFS `Profile.md` == `profile.md`
same-inode bypass from the WP-112 review). Hashing is byte-exact — **no
normalization/case-folding of content before hashing** (recorded lesson); only the
path key is folded. **WP-117** (depends WP-116) adds `wienerdog memory approve` — the
TTY-only, no-`--yes`-bypass ratification verb (the `wienerdog grant` / ADR-0007
model) that records a human-approved exact-byte hash, the only way to change an
already-seeded identity file. Neither A3 WP opens a capability gate: the WP-112
identity-write freeze stays blocked; this is the independent read/approve path.

**Follow-up (tracked, unscheduled) — unify vault-path reading (from WP-117 review,
2026-07-17).** `sync.js` still has a private `readVaultPath` using a `.split('#')`
read, while `memory approve` (WP-117), the digest gate, and `readDreamConfig` use the
shared `config.js` `readScalar`. For an exotic config (`vault: /home/u/my#vault`, a
quoted value) the two readers can resolve different paths. This is **fail-closed
today** (a different resolved vault ⇒ different identity bytes ⇒ hash mismatch ⇒
nothing unapproved injected), so it is a consistency cleanup, not a security fix:
migrate `sync.js`'s `readVaultPath` onto the shared `readScalar` in a small future WP.

**Audit A6 — bounded transcript intake, quarantine ledger, digest/hook bounds
(2026-07-17, ADR-0023).** With A4/A3 shipped, A6 closes the parsing/DoS surface
(deep-dive `07-parsing-dos.md`). It splits into a 2-WP ledger chain plus two hardening
WPs, so every step has literal verification commands and a tight, adversarially-reviewable
Deliverables table. **The intake/ledger design is ADR-0023** (Accepted 2026-07-17 — the owner
walkthrough ratified the design and resolved every seeded limit into dated OWNER-APPROVED numbers).
**WP-118** makes transcript *parsing* streaming and bounded: a shared synchronous
fixed-chunk line reader (`transcripts/stream.js`) with a per-line byte cap, line-count cap,
per-run aggregate cap and a nesting-depth guard replaces `fs.readFileSync` + `split('\n')`
(finding F1/F6); a single oversized record becomes a fixed marker (the session is still
parsed), a file over a hard pre-read ceiling is quarantined without being opened, and
discovery now records `size`/`dev`/`ino`. It keeps `transcripts.parse(entry)` back-compat
(adds `parseWithOutcome`) so `scratch.js` is untouched and the suite stays green when it
lands. **WP-119** (depends WP-118) is the architectural swap and MUST land atomically (it
spans `scratch.js` + `dream.js`): the **per-file quarantine ledger**
(`state/transcript-ledger.json`) replaces the scalar `watermarks.json` — a
content-independent fingerprint + `processed`/`quarantined` outcome + a per-harness
baseline migrated once from the old watermark; `collectExtracts` selects from the ledger
and materializes **one file at a time** (removing the parse-all-at-once OOM path); `dream.js`
records per-file `processed` outcomes instead of advancing a scalar and surfaces
newly-quarantined files through a **durable, secret-free digest banner** (basenames +
reason enum only), consolidating valid files beside a quarantine. It distinguishes
permanent quarantine (not retried unless the file changes) from capacity-deferred work
(no negative record → always retried) — the structural fix for the WP-048/069
silent-starvation class. The ledger swap is one WP, not two, because splitting the
`collectExtracts` producer from its `dream.js` consumer would leave the suite red at the
seam. **WP-120** (depends WP-119 only to serialize a disjoint `digest.js` edit) makes the
long-claimed "digest ≤ 120 lines" cap real — a line AND a byte cap with bounded per-note
reads, a bounded project count, deterministic section priority and boundary-safe
truncation, always preserving the control-plane banner prefix (finding F3/F5). **WP-121**
(independent) makes the three shipped session hooks **genuinely fail-open** (finding F4,
extended to all hooks): drop the `set -e` that defeated the `exit 0` guarantee, guard
HOME/node/state, bound stdin, keep the injection-safe `JSON.stringify` encoders, and add a
subprocess harness proving exit 0 under missing-HOME/node, TOCTOU/unreadable digest,
unwritable state, and malformed/oversized stdin. **A6 opens NO capability gate** —
`wienerdog safety` shows all five gates BLOCKED after every WP. The chain 118→119→120 is
serial because each builds the prior's contract (120 behind 119 only to keep the two
`digest.js` edits in disjoint regions on `main`); WP-121 shares no files and lands in
parallel. **Finding F2 (the digest trust-gate fail-open) is already closed** by the A4/A3
work (WP-114/WP-116), so A6's digest WP is scoped to size caps only, not the trust gate.

**Audit A5 — layered secret lifecycle with fail-closed persistence gates
(2026-07-17, ADR-0024).** With A6 shipped, A5 closes the secret-lifecycle surface
(deep-dive `05-secret-lifecycle.md`): today a SINGLE best-effort `redact()` pass at
transcript ingest is treated as if it were airtight, so any pattern it misses becomes a
committed note, a durable log line, a digest banner, a managed block, or a fail-loud email.
**The design is ADR-0024** (Accepted 2026-07-17; the per-ticket owner walkthrough ratified
every seeded value and `DECISION NEEDED` marker — the rulings are recorded as dated
`OWNER-APPROVED` blocks in the specs, including the WP-123 quarantine-preserve amendment,
the WP-125 state-driven pending-review banner, and the WP-126 insecure-modes banner). A5 splits into a detector foundation, four independent enforcement-point
WPs, a private-modes WP, and a docs WP, so every step has literal verification commands and a
tight, adversarially-reviewable Deliverables table. **WP-122** builds the ONE shared detector
`src/core/secret-scan.js` — `scanAndRedact(text) → {text, findings}`, metadata-only findings
(never the raw secret), bounded/linear-time, **total and fail-closed** (an oversized/failed
scan withholds content, never emits raw text) — with the regression corpus (uppercase keys,
Google refresh-token/OpenAI/GitHub/Google/Stripe/AWS forms, JSON, quotes, `/+=`, a token glued
to a word char) and migrates the pre-brain `redact` onto it (EP1), also bounding the extract's
`source_path`/`cwd`. The four enforcement points are independent WPs on disjoint files, each
depending only on WP-122: **WP-123** scans the dream's **staged brain output** before the
commit and, on a hard finding, **preserves the file into `state/quarantine/` then reverts
it** (recoverable by the owner; never silently commits `[REDACTED]` prose) in `validate.js`;
**WP-124** puts the brain's **stdout/stderr** through a bounded sanitizing
transform before it reaches the durable log / stderr-tail / `alerts.jsonl` / digest and drops
the **raw log tail from the fail-loud email** (brain.js + alerts.js + run-job.js); **WP-125**
scans **each digest section** before injection and **omits** a section with a hard finding,
bannering the exclusion via the existing `identityWarn` list, plus renders the state-driven
**pending-review banner** while `state/quarantine/` is non-empty (digest.js, golden
byte-unchanged). **WP-126** (depends WP-124 + WP-125 to serialize the shared `alerts.js` /
`digest.js` edits) makes the secret-lifecycle artifacts **private by
default** — `core`/`state`/`logs`/scratch/quarantine at `0700`, `digest.md`/`alerts.jsonl`/
ledger/approvals/logs/scratch-extracts at `0600`, independent of umask, repaired on attended
`sync` only (doctor reports; the nightly path never chmods) with a state-driven
**insecure-modes digest banner** for awareness,
via a new `src/core/private-fs.js` helper; it explicitly does NOT touch `secrets/`, tokens,
grants, or log rotation (the **A5/A9 boundary** — those are A9). **WP-127** (depends all)
writes the docs: THREAT-MODEL T4 corrected to the four-gate mechanism + the residual, a
**secret-incident runbook** (stop schedules → revoke/rotate → purge digest/managed block →
clean git history → re-authorize), and the vault-local/no-auto-push posture. **A5 opens NO
capability gate** — `wienerdog safety` shows all five gates BLOCKED after every WP. **The A5
residual is load-bearing and stays visible (ADR-0024): a scanner is never the external-effect
boundary; A1/A2 contain a miss.** Chain: 122 → {123, 124, 125}; 126 → {124, 125}; 127 → all.
The three enforcement WPs after WP-122 share no files with each other, so they can land in
any order (serialized on `main` per the fork flow); WP-126 lands after WP-124 and WP-125.
