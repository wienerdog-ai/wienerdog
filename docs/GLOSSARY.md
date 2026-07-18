# Glossary

Canonical names. Use these exact terms in code, docs, specs, and prompts — never synonyms.

- **harness** — the AI CLI tool Wienerdog installs into: Claude Code or Codex CLI.
- **canonical core** — `~/.wienerdog/`: config, skills, prompts, scripts, state, secrets, logs, manifest. Vendor-neutral source of truth for *mechanics* (not user knowledge).
- **vault** — the user's markdown memory at `~/wienerdog/` (or an adopted existing vault). PARA-structured, git-backed. The only long-term memory store. (Not: "memory store", "journal", "second brain dir".)
- **adapter** — per-harness compile target logic (`src/adapters/claude.js`, `codex.js`) run by `wienerdog sync`.
- **managed block** — the sentinel-delimited region (`<!-- wienerdog:begin/end -->`) Wienerdog owns inside the user's CLAUDE.md/AGENTS.md. Wienerdog never edits outside it.
- **digest** — the pre-rendered session context file `~/.wienerdog/state/digest.md` (identity + active context + latest daily log), injected at SessionStart. (Not: "summary", "briefing".)
- **capture** — getting session content into the pipeline: transcript scanning (ground truth) + hook enqueueing (enrichment) + explicit "remember this" writes to `00-Inbox/`.
- **transcript** — a harness's on-disk session log (Claude JSONL / Codex rollout file).
- **watermark** — per-harness marker in `state/watermarks.json` recording what dreaming has already processed.
- **dreaming / dream run** — the nightly consolidation job: orchestrator (code) + dream skill (prompt). One dream run = one git commit in the vault.
- **dream report** — human-readable `reports/dreams/YYYY-MM-DD.md`: what was written, what was gated out and why. (User-facing skill prose may call it the "memory report" — a deliberate softening; code and specs always say dream report.)
- **tier / gates** — write-destination classes with quality thresholds. Tier 1 daily log, Tier 2 atomic notes/MOCs, Tier 3 identity/skills/digest-feeding (strictest; closed to untrusted-derived content).
- **provenance** — mandatory frontmatter on auto-written notes: origin, source_sessions, confidence, recurrence, derived_from_untrusted.
- **untrusted-derived** — content whose support originates in tool results (email bodies, web pages, fetched files) rather than user-authored text.
- **skill** — a SKILL.md folder (format both harnesses understand). *Shipped* skills come with the package; *synthesized* skills are dream-created in `05-Skills/` (`incubating` → `active`).
- **routine** — a scheduled job (e.g. daily digest) run via `wienerdog run-job <name>` by the OS scheduler. (Not: "cron task", "daemon job".)
- **run-job** — the short-lived job wrapper: clean env, TCC-guard, watchdog, logs, fail-loud, catch-up.
- **TCC-guard** — refusal to run unattended jobs that reference macOS TCC-protected paths (Desktop/Documents/Downloads/iCloud).
- **fail-loud** — no silent failures: alert email (`gws _alert`) or a banner line in the digest.
- **catch-up** — running jobs missed while the machine was off (login-triggered check on macOS; native on systemd/Task Scheduler).
- **manifest** — `install-manifest.json`: every file/entry the installer touched; uninstall replays it in reverse.
- **gws** — the `wienerdog gws` Google Workspace CLI (gmail/cal/drive). Read-first, draft-first; outbound verbs execute only under a send grant.
- **send grant** — a `(routine, recipient allowlist)` permission allowing outbound sending; created only by the interactive CLI with typed confirmation, never by any model-driven process (ADR-0007). Stored in the broker grant store (A2, ADR-0026) — no longer in config.yaml.
- **capability broker** — the local, per-job stdio process (ADR-0026) that alone holds the Google OAuth credentials and exposes only fixed verbs to a routine's model over MCP. It is a child of the routine's `claude -p`, dies with it, and is never a daemon (ADR-0004). (Not a "sandbox" — that word means the `WIENERDOG_HOME` redirect guard.)
- **broker verb** — one fixed, schema-validated, least-scope, rate-limited operation the capability broker exposes (e.g. `gmail_search`, `create_draft`, `send_digest_to_self`), each mapped to exactly one Google API method. There is no generic send, no arbitrary URL, no raw client.
- **capability class** — the least-scope credential group a broker verb belongs to (`READ`, `DRAFT`, `SEND`, `CALENDAR_WRITE`); the broker loads only the class a verb needs.
- **broker grant store** — the canonical 0600 record (`state/broker-grants.json`) of the send-self and calendar-write grants, mutated only by the interactive TTY `wienerdog grant` path, with an exact-byte integrity marker the broker checks fail-closed (ADR-0026). Replaces the former config.yaml YAML grant block. Tamper-evidence between attended human actions, not an OS boundary.
- **trusted launch descriptor** — the routine identity the broker takes from `run-job`'s Wienerdog-written argv (`--routine <id>`), never from model-suppliable input or an env var; this is why a forged routine name cannot borrow another routine's capability or grant.
- **least-scope credential** — a per-capability OAuth token carrying only the scopes one capability class needs (e.g. READ = `gmail.readonly` + `calendar.events.readonly` + `drive.readonly`), verified against its actual granted scopes at load, replacing the single combined send-and-write-capable token.
- **identity trust registry** — the code-owned, 0600 record (`~/.wienerdog/state/identity-approvals.json`) of the exact-byte `sha256` a human ratified for each injected identity file. The digest injects an identity file only when its current bytes match its record; a mismatch fails closed (ADR-0021). Path identity is case-folded; content identity is byte-exact.
- **memory approve** — the interactive, terminal-only command (`wienerdog memory approve <file>`) that ratifies the current exact bytes of an injected identity note into the identity trust registry. The only way to change an approved identity note; no model-driven or headless process can run it (ADR-0021).
- **safety profile** — the code-owned, fail-closed record of which powerful
  capabilities are cleared for use (`src/core/safety-profile.js`). Every
  capability is BLOCKED until its security gate is opened by a reviewed release;
  there is no runtime/env/flag override. Inspect it with `wienerdog safety`. (Not
  a "sandbox" — that word means the unrelated `WIENERDOG_HOME` redirect guard.)
- **capability gate** — one named on/off switch in the safety profile
  (e.g. `gws-use`, `external-content-routine`). A blocked gate makes its feature
  fail closed before any side effect (no model spawn, no credential load).
- **hermetic runtime profile** — the code-owned set of capabilities a headless
  model job runs under: built-in tool allowlist, deny list, MCP posture,
  hook-free settings, staging cwd, and filesystem roots. Composed by Wienerdog
  (`src/core/runtime-profile.js`) and never inherited from ambient config
  (ADR-0025). (Not a "sandbox" — that word means the `WIENERDOG_HOME`-redirect
  guard, `sandbox-guard.js`.)
- **capability profile** — a synonym for one specific hermetic runtime profile
  (`dream`, `daily-digest`, `inbox-triage`, `weekly-review`) as defined in
  `src/core/runtime-profile.js`.
- **staging directory** — the fresh, empty, Wienerdog-owned working directory a
  hermetic job runs in (and, for a routine, its only writable output), so no
  project or local settings can be discovered under the job's working directory.
- **run evidence** — the bounded, secret-free per-run record (Claude version,
  executable, profile, argv, settings/MCP digests, managed-policy state,
  containment self-check result) written to `state/run-evidence.jsonl`
  (ADR-0025). Free-text fields (prompt, skill body) are reduced to a `sha256`,
  never stored raw.
- **containment self-check** — the bounded live canary probe of the real
  hermetic composition that runs before each dream and fails closed (halts the
  dream + raises a durable alert) if the installed Claude no longer honors the
  containment flags (WP-135, ADR-0025). Verifies the actual local runtime, not a
  repo-pinned version.
- **secret scan / `scanAndRedact`** — the single shared secret detector
  (`src/core/secret-scan.js`), called independently at four fail-closed
  persistence points in the dream lifecycle: transcript input, the brain's
  staged output, the durable log/alert/email path, and each digest section
  (ADR-0024). Returns sanitized text plus metadata-only findings (`{label,
  severity, count}`) — a finding never stores the matched secret bytes. Two
  severities, `redact` and `quarantine`, but the *persistence* gates (staged
  output, digest section) withhold on **any** finding of either severity; the
  input and log/alert paths use `redactOnly` (inline redaction of every
  match). `hasHardFinding` (quarantine-severity only) is an exported helper
  for future gates; no shipped gate branches on it today.
  (Not: "filter", "scrubber", "DLP".)
- **secret quarantine** — the fail-closed outcome when a persistence gate that
  cannot safely rewrite an artifact gets any `scanAndRedact` finding: the
  brain's staged output is preserved into `state/quarantine/` (0700 dir, 0600
  file, raw bytes intact, for the owner to review or restore) and reverted
  rather than committed; a digest section with a finding is omitted rather
  than injected redacted. Never a silent `[REDACTED]` rewrite of the user's
  own text. See `docs/runbooks/secret-incident.md` for recovery.
- **routine catalog** — the opt-in post-setup menu of ready-made routines (`/wienerdog-routines`); nothing is scheduled by default (ADR-0008).
- **interview** — the `/wienerdog-setup` conversation that produces `06-Identity/` notes, from which CLAUDE.md/AGENTS.md managed blocks are rendered.
- **memory_mode** — user preset for gate strictness: conservative | standard | eager.
- **work package (WP)** — one self-contained implementation spec in `docs/specs/`, sized for one implementer session, one branch, one PR.
- **One-Document Rule** — a mid-tier model must be able to ship a WP reading only that spec + CLAUDE.md.
- **implementer** — a fresh harness session pointed at one Ready WP spec. Not a named agent (ADR-0005).
