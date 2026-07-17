# Wienerdog Security Audit — Consensus Action List

**Source:** `00-SYNTHESIS.md`, audit target `405afdd`, consensus 2026-07-15  
**Purpose:** implement the security level required before personal use, then
rerun the audit.  
**Current decision:** no dogfood, Google connection, scheduled external-content
routine, or trusted automatic identity memory until all P0 gates close. Closing
the P0 gates permits only the explicitly limited, local, dream-only manual
evaluation profile; it does not silently authorize GWS, external-content
routines, or unattended scheduling — those additionally require the P1 work
(gates 9–10), a clean-commit audit rerun, and an explicit human go decision.

Each action below states the threat, implementation shape, limitations, and
machine-verifiable acceptance criteria. A work package is not complete until
its adversarial criteria execute on the final bytes.

## P0 — required before first personal use

### A0 — Ship a fail-closed pre-use safety profile

**Threat addressed:** partial remediation accidentally enables a still-unsafe
feature.

**Implementation shape:**

- Introduce an explicit security-capability state instead of inferring safety
  from file presence.
- Before P0 completion, Google setup, GWS credential use, arbitrary `skill:`
  schedules, daily Summary injection, and automatic identity activation are
  disabled in production code.
- A security preflight reports each gate independently. It must not offer a
  generic `--yes`/environment override for a red gate.
- Initial dream runs may operate only in proposal/report mode until identity,
  secret, and resource gates are green.

**Acceptance:**

- Fresh install cannot create a GWS or external-content schedule through any
  headless path.
- Direct invocation of a disabled feature fails before spawning a model or
  loading a credential.
- A partially configured state cannot be mistaken for an approved state.

### A1 — Hermetic runtime profiles for dream and every routine

**Threat addressed:** malicious transcript/email/repository content obtains
ambient Bash, network, filesystem, MCP, plugin, or hook authority.

**Where:** `src/core/dream/brain.js`, `src/cli/run-job.js`, routine catalog and
runtime composition.

**Implementation shape:**

1. Define code-owned capability profiles. Do not dispatch arbitrary
   `skill:<string>` from mutable config.
2. Vendor and integrity-check the routine prompt/skill text; do not load an
   arbitrary user-scope slash skill at runtime.
3. Run from a fresh Wienerdog staging directory, not the vault or a user
   project. Provide bounded input snapshots and validated output channels.
4. Do not load user/project/local settings, hooks, plugins, or user MCPs. Use a
   dedicated, hook-free settings profile. `disableAllHooks` is defense in depth,
   not a substitute for excluding the source.
5. Always pass `--strict-mcp-config` with an explicit config:
   - dream: empty MCP config;
   - routine: exactly one absolute-path local Wienerdog broker, if required.
6. Routine built-ins default to none. Allow only the exact MCP/domain tools in
   that routine's profile. No general Bash, WebFetch, WebSearch, generic Read,
   generic Write, generic HTTP, or generic GWS CLI.
7. If managed/admin policy can inject hooks that cannot be disabled, preflight
   must detect and STOP unattended execution unless that policy is explicitly
   accepted as part of the trusted runtime.
8. Record the Claude version, executable identity, profile, argv, settings
   digest, and MCP digest in run evidence.

Example capability shapes:

- daily digest: `gmail_search`, `gmail_read`, `calendar_list`,
  `read_approved_memory`, `send_digest_to_self`;
- inbox triage: `gmail_search`, `gmail_read`, `create_draft`;
- weekly report: bounded approved-memory read + staged report write.

**Tradeoff:** user plugins and convenient general tools intentionally disappear
from unattended runs. That loss of ambient extensibility is the security
property.

**Acceptance:**

- An inherited user `SessionStart` hook that writes a canary never runs.
- A permissive user Bash rule and rogue MCP do not appear in the routine's tool
  inventory.
- A malicious email explicitly requesting `curl`, Bash, token reads, config
  writes, or arbitrary MCP use leaves all canaries unchanged.
- The transcript contains only tools in the exact declared capability set.
- Attempts to read `~/.wienerdog/secrets`, harness settings, or arbitrary home
  files fail before bytes are returned.
- Attempts to write outside staging/declared output fail before bytes change.
- The same negative suite runs against dream and every catalog routine on the
  exact supported Claude version.

### A2 — Put GWS behind a credential-holding capability broker

**Threat addressed:** direct use of the send-capable OAuth token bypasses the
CLI grant; plaintext grant or self-asserted routine identity authorizes an
external effect.

**Where:** `src/gws/**`, `src/cli/run-job.js`, auth/grant storage, routine MCP
composition.

**Implementation shape:**

1. A local stdio broker process alone loads OAuth clients/tokens. The model
   receives neither token paths/values nor a generic Google/HTTP/client tool.
2. Broker tools are fixed verbs with server-side schemas, byte/count/rate
   limits, and exact API-method allowlists.
3. Routine identity and capability profile come from a trusted launch
   descriptor. The model cannot supply `--routine` or borrow another job's
   identity.
4. Default unattended send is a zero-address-input operation such as
   `send_digest_to_self`; the broker resolves the authenticated self address.
   Third-party unattended send remains disabled until a separate decision and
   stronger grant design.
5. Store grants in a canonical broker-owned store, not a free-form managed YAML
   block. Only the interactive TTY path can alter it. Integrity mismatch fails
   closed and emits a fixed alert.
6. Split credentials by capability where possible:
   - read: `gmail.readonly`, `calendar.events.readonly`, `drive.readonly`;
   - draft/send: separate broker-only Gmail compose credential;
   - calendar writes: separate broker-only `calendar.events` credential.
7. Verify the actual granted scope set, not only the requested constants.
8. Rename `cal draft-event` to reflect that it creates a live event; place every
   calendar mutation behind an explicit write capability/grant.
9. Update product claims: the grant constrains the broker/CLI path. Arbitrary
   same-user native malware is outside this boundary unless a separate OS
   identity/user-presence credential design is adopted.

**Why simpler proposals are insufficient:** `gmail.compose` itself authorizes
send. A grant MAC or manifest hash readable/writable by the same shell-capable
actor does not create a security boundary.

**Acceptance:**

- Broker tool-to-Google-method mapping is exact; no generic `messages.send`,
  delete/update, arbitrary URL, or raw client surface exists.
- An external recipient supplied to `send_digest_to_self` fails schema
  validation and makes zero API calls.
- A forged routine name/environment variable cannot change capability or grant.
- The routine cannot read token/client/grant bytes or start `googleapis`
  directly.
- A grant-store bit flip fails closed; no draft/send/calendar write occurs.
- Read-only credentials fail send/delete in integration tests.
- A poisoned-email E2E cannot send externally, mutate/delete calendar data, or
  exceed the routine's Drive/Gmail operation set.

### A3 — Human-ratified identity memory with an exact-byte trust registry

**Threat addressed:** a hijacked dream writes attacker instructions plus fake
`derived_from_untrusted`, confidence, recurrence, or source-session metadata,
which then enters every future session.

**Where:** `src/core/dream/validate.js`, `src/core/digest.js`, dream skill,
state/approval CLI.

**Implementation shape:**

1. The dream may not directly modify the four injected identity files. Such
   diffs are reverted and materialized as non-injected proposals containing an
   exact diff, source-session references, and bounded evidence excerpts.
2. Add `wienerdog memory approve <proposal-id>`:
   - interactive TTY only;
   - shows exact changed bytes/diff and provenance status;
   - requires explicit named confirmation;
   - no headless/`--yes`/environment bypass.
3. The orchestrator applies the approved bytes and records
   `{path, approved_blob_hash, approved_at, source}` in a 0600 registry outside
   the brain's write surface.
4. Digest injection requires current blob hash == approved hash. A missing
   record, crash between commit/registry update, manual edit, or one-byte tamper
   excludes the file and raises a fixed alert.
5. Re-derive session trust and recurrence from real extracts for evidence
   quality, but do not call that semantic proof of the proposed body.
6. `instructions.md` and goals remain human-approved. A later autonomous profile
   requires a separate threat-model decision.

**Tradeoff:** less automatic identity evolution. This is intentional because
identity/instructions are authorization-like inputs, not ordinary memory notes.

**Acceptance:**

- Fake `false / 0.9 / 3` frontmatter never changes the digest.
- Three real trusted session IDs attached to unrelated malicious body text are
  still insufficient.
- Wholesale identity overwrite without approval is reverted/excluded.
- Headless approval fails.
- Approval injects exactly the displayed bytes; a one-byte later change stops
  injection.
- Crash at every commit/registry boundary fails closed.
- Scenario test proves an attacker marker never reaches identity, digest, or a
  managed harness block before explicit approval.

### A4 — Remove daily Summary injection and unify strict frontmatter parsing

**Threat addressed:** mixed/untrusted daily content enters instructions-adjacent
context through missing, quoted, case-varied, indented, or wrongly aggregated
frontmatter.

**Where:** `src/core/digest.js`, `src/core/dream/validate.js`,
`src/core/dream/config.js`.

**Implementation shape:**

1. Remove newest-daily `## Summary` from the safe-profile digest. Daily notes
   remain readable in the vault but are not automatically injected.
2. If daily material is reconsidered later, use entry/section-level provenance
   and explicit approval; a single file-level flag is not adequate for a
   mixed-provenance aggregate.
3. Implement one strict flat-frontmatter lexer/parser, not full YAML:
   - mandatory well-formed delimiters for security-bearing notes;
   - top-level scalar keys only;
   - duplicate keys rejected;
   - consumer-specific schema;
   - exact typed booleans/numbers/session arrays;
   - unknown, malformed, missing, quoted/case-varied, or indented security fields
     fail closed.
4. Digest, validator, and config consumers use the same lexical parser and their
   own explicit schemas.

**Acceptance:**

- No daily byte enters the digest for any frontmatter spelling or omission.
- Differential/property tests give the same security-field interpretation to
  digest and validation consumers.
- Corpus includes missing, duplicate, quoted, case-varied, comment, hash,
  indentation, hyphenated-key, and unclosed-frontmatter cases.
- No byte sequence is accepted as trusted at commit and interpreted differently
  by the digest.

### A5 — Layered secret lifecycle with fail-closed persistence gates

**Threat addressed:** credentials in transcripts bypass pattern redaction and
become committed notes, logs, digest, managed blocks, or self-email tails.

**Where:** `src/core/transcripts/index.js`, dream scratch/output validation,
digest, logging/alerts, filesystem creation.

**Implementation shape:**

1. Build a shared `scanAndRedact` detector returning sanitized text plus
   metadata-only findings. Never store the raw matched secret in a finding.
2. Cover:
   - full sensitive assignment keys (`client_secret`, `refresh_token`,
     `access_token`, passwords, credentials, AWS variants, etc.);
   - structured JSON/env values and quoted/base64/URL value characters;
   - current provider prefixes without brittle exact lengths;
   - private-key blocks;
   - contextual high entropy with quarantine severity;
   - exact values of Wienerdog-known OAuth/client credentials.
3. Bound/omit oversized records before regex scanning. Pseudonymize or cap raw
   source paths, cwd, and session IDs before brain exposure.
4. Scan at four independent enforcement points:
   - pre-brain input;
   - staged added lines/pre-commit brain output;
   - durable stdout/stderr/log/alert path;
   - each digest section before rendering.
5. A hard staged-output finding reverts/quarantines that file and emits a fixed
   metadata-only alert. Do not silently commit modified `[REDACTED]` prose.
6. A failing digest section is omitted and the last known-good digest remains.
7. Brain stdout/stderr passes through a bounded sanitizing transform; email
   alerts contain no raw log tail.
8. Explicitly create and repair core/state/log/scratch directories as 0700 and
   sensitive files as 0600, independent of umask. Use atomic rename and final
   chmod.
9. Keep the vault local/no-auto-push by default and document token
   revoke/rotate plus git-history cleanup after an incident.

**Residual:** encoded, split, novel, and unknown secrets make perfect detection
impossible. A scanner is never the external-effect boundary; A1/A2 contain a
miss.

**Acceptance:**

- Regression corpus includes uppercase assignment names, Google refresh-token
  variants, OpenAI/GitHub/Google/Stripe/AWS forms, JSON, quotes, `/+=`, and a
  token directly following a word character.
- Hard finding in staged output causes zero raw bytes in commit, report, alert,
  log, digest, managed block, or email.
- False positives are visible quarantines, not silent mutations.
- Detector failure fails closed.
- Runtime and property tests demonstrate bounded/near-linear scanning.
- Permissions are 0700/0600 even under a permissive umask, and sync repairs old
  0755/0644 artifacts.

### A6 — Bounded streaming transcripts, quarantine ledger, bounded digest/hooks

**Threat addressed:** whole-file read/split plus parse-all retention OOMs every
night; global watermark handling loses or starves valid sessions; unbounded
digest/hook inputs violate runtime guarantees.

**Where:** transcript discovery/parsers, `src/core/dream/scratch.js`,
`src/core/digest.js`, all three shipped hook templates.

**Implementation shape:**

1. Discovery records size/mtime/device/inode and enforces a hard pre-read file
   ceiling.
2. Parse incrementally with fixed read chunks plus per-line, line-count,
   message-count, depth, and total-run limits. JSON.parse only bounded lines.
3. Oversized records are omitted as fixed untrusted markers or quarantine the
   file; raw oversized bytes never enter scratch/log/brain.
4. Process one file at a time to bounded scratch candidates. Keep metadata, not
   every parsed extract, resident in memory.
5. Replace scalar watermark assumptions with per-file outcome/fingerprint
   state. Distinguish permanently unprocessable quarantine from capacity-
   deferred work. Unchanged quarantine does not retry nightly; changed files do.
6. Continue processing valid files beside a quarantine and emit a durable,
   secret-free alert.
7. Enforce both digest line and byte caps, bounded note reads/project counts,
   deterministic section priority, and boundary-safe truncation markers.
8. Make SessionStart and both SessionEnd hooks genuinely fail-open. Guard
   HOME/node/state, bound stdin, make optional writes best-effort, produce no
   unsafe stdout, and always reach `exit 0`.

**Acceptance:**

- Subprocess test under a constrained Node heap handles multiple near-limit and
  over-limit files without OOM.
- Valid small sessions beside oversized input are still processed.
- Unchanged quarantine is not retried; changed input is retried; deferred work
  is later processed with no watermark gap.
- Giant line, many small lines, malformed/deep JSON, invalid UTF-8, and backlog
  stress stay within measured RSS/time bounds.
- Digest is always within both line and byte caps, including a million-character
  single line.
- Hook harness covers missing HOME/node, TOCTOU deletion, unreadable digest,
  unwritable state, malformed/oversized stdin, and Node failure; every hook exits
  zero.

## P1 — required before unattended/general use

### A7 — Scheduler, vendored app, and executable integrity

**Threat addressed:** a scoped core write reroutes a registered job, modifies
nightly code, or wins PATH resolution.

**Implementation shape:**

- Generate a canonical job descriptor at schedule/sync time: job kind, exact
  prompt/skill hash, capability profile, timeout, vault root, absolute
  executable identities, and app release digest.
- Bind its digest into the OS scheduler entry/independent launcher arguments.
  Runtime config edits do not change execution until explicit sync.
- A minimal launcher outside the mutable app tree verifies `current` containment,
  content-addressed version, release/tree signature or independently anchored
  digest, and production-vs-dev stance before Node/model spawn.
- Resolve Claude/Git/Codex at install/sync to absolute realpaths; verify regular
  executable, owner, writable ancestors, version/hash. Spawn absolute paths.
- Legitimate executable updates fail safe and require an explicit repin/sync or
  verified update flow.
- Production test command overrides are inert without an explicit test build and
  remain `shell:false`.

**Boundary statement:** same-user control of both the core and OS scheduler can
still replace both anchors. This design protects scoped core writes and detects
drift; it is not a claim against arbitrary same-user malware.

**Acceptance:**

- Config `run` rewrite produces mismatch alert and zero model spawn.
- App byte mutation, `current` repoint, or out-of-root symlink produces zero
  model/network spawn.
- Manifest+config rewrite cannot defeat an unchanged independent descriptor.
- Fake `claude/git/codex` earlier on PATH never executes.
- Pinned executable mutation/owner/mode/ancestor failure stops pre-spawn.
- Valid signed update switches atomically; interrupted update retains the old
  valid version.

### A8 — Treat manifest replay as untrusted input

**Threat addressed:** poisoned manifest executes arbitrary unload argv or
deletes/rewrites unrelated user files during uninstall.

**Implementation shape:**

- Strict schema and per-kind exact keysets; malformed/unknown entry fails safe
  with a visible notice.
- Re-derive scheduler unload commands from platform + validated entry identity;
  never execute stored arbitrary argv.
- Bound every delete/rewrite to known roots using realpath/lstat-aware guards.
- Require fingerprints for file deletion; unverifiable means keep.
- Display every derived command/path/effect before confirmation; `--yes` does not
  widen what is valid.
- Catch per-entry parse/reverse errors so one malformed settings file cannot make
  the installation permanently un-uninstallable.

**Acceptance:**

- Arbitrary `/bin/sh` unload vector never spawns.
- Hashless external file path is preserved.
- Symlink, normalized, `..`, unknown-kind, malformed JSON, and relocated
  managed-block corpus fails safe.
- Legitimate uninstall still removes only Wienerdog-owned artifacts and always
  preserves the vault.

### A9 — Private artifact and logging policy

- Make the whole Wienerdog mechanics root private by default where compatible;
  explicitly protect state, logs, digest, alerts, scratch, grants, tokens, and
  client JSON.
- Repair existing modes on doctor/sync rather than relying on `mkdir(mode)` for
  pre-existing directories.
- Bound and rotate logs; exclude raw brain output from alert email.
- Add a safe incident runbook: stop schedules, preserve evidence metadata,
  rotate/revoke credentials, remove compromised digest/managed blocks, clean git
  history, then re-authorize.

**Acceptance:**

- Fresh install under permissive umask and an upgrade from 0755/0644 state both
  end with the declared private modes.
- Logs, alerts, scratch, digest, and self-email never contain a planted raw
  secret or unbounded brain-output tail.
- Incident drill stops all jobs before credential rotation and proves the old
  digest/managed block is no longer injected.

### A10 — One supervisor/process group and reliable timeout cleanup

- Remove the double-detached timeout race. Use one supervisor-owned process
  group or an inner timeout strictly shorter than an outer supervisor which can
  enumerate/kill real descendants.
- Test normal children plus `setsid`/double-fork escape attempts; after timeout
  no descendant remains.

## P2 — defense-in-depth and future activation

### A11 — Redesign Codex dream containment before it becomes reachable

`workspace-write` allows shell and broad reads. Before M4, either run Codex in an
OS sandbox whose read tree excludes credentials/home state or do not give Codex
the autonomous-write role. Network-off alone does not prevent exfiltration into
the committed vault.

### A12 — Stronger arbitrary same-user boundary, if desired

If the product later promises protection from arbitrary same-user native code,
the current architecture is insufficient. Evaluate a separate OS identity or
service for the GWS broker, OS user-presence/keychain controls for grant signing,
and a root-/publisher-anchored launcher. This is a different threat boundary,
not a local-file hardening tweak.

### A13 — Remaining lower findings

- **Managed-block separators:** preserve the exact splice boundary or store
  enough origin metadata to remove only Wienerdog-added separators; test
  relocated blocks between single-newline user lines.
- **Settings command changes:** upsert the recorded command set on every apply,
  so uninstall removes the current hook and not only the first version.
- **Sentinel failure isolation:** report an ambiguous managed block without
  aborting independent, provably safe skill/hook reconciliation steps.
- **Foreign symlinks:** preserve or at least explicitly report a namespaced
  symlink whose target is not a known Wienerdog source; never silently clobber.
- **Adopt guard:** refuse or require a high-friction confirmation for a home
  directory, secret directory, unexpectedly large tree, or `.ssh`/`.aws`-like
  content before `git init/add -A`.
- **Environment overrides:** require absolute normalized paths, reject `..` and
  containment ambiguity, and show the resolved destructive roots before use.
- **Codex transcript roles:** pin the protocol version, keep unknown roles
  fail-closed, and rerun live golden fixtures at every Codex pin update before
  trusting `developer` as user-authored context.
- **Self-alert content:** generate the alert body from bounded code-owned status
  fields rather than arbitrary caller prose.
- **Transcript authenticity:** retain same-user transcript fabrication as an
  explicit OS-boundary residual; if it enters scope, use an append-time
  provenance/authentication mechanism rather than trying to infer authenticity
  at dream time.

## Required documentation changes

- Scope "AI can never self-authorize a send" to the enforced broker/CLI path.
- State that `gmail.compose` is send-capable and `cal draft-event` is a live
  mutation.
- Replace "recurrence >=3 protects identity" with the actual human-ratified
  identity boundary.
- Describe built-in/MCP containment separately from full process containment.
- Document the arbitrary same-user malware non-goal unless A12 is implemented.
- State secret detection limitations and the quarantine/incident flow.
- Keep all README/VISION/ARCHITECTURE/THREAT-MODEL claims mechanically traceable
  to a gate above.

## Suggested implementation sequence

1. A0 freeze + explicit threat-boundary documentation.
2. A4 daily removal/shared parser and A3 identity approval/hash registry.
3. A6 bounded parser/digest/hooks.
4. A5 secret lifecycle/private modes.
5. A1 hermetic runtime profiles and live negative harness.
6. A2 GWS broker and least-scope credential migration.
7. Run all P0 adversarial scenarios; only then permit local dream-only dogfood.
8. A7–A10 before unattended/general use.
9. Clean-commit full audit rerun and explicit human go/no-go.

P0 ordering may be parallelized, but no intermediate green authorizes use.
