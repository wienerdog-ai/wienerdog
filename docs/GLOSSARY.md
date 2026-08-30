# Glossary

Canonical names. Use these exact terms in code, docs, specs, and prompts — never synonyms.

- **harness** — the AI CLI tool Wienerdog installs into: Claude Code or Codex CLI.
- **canonical core** — `~/.wienerdog/`: config, skills, prompts, scripts, state, secrets, logs, manifest. Vendor-neutral source of truth for *mechanics* (not user knowledge).
- **vault** — the user's markdown memory at `~/wienerdog/` (or an adopted existing vault). PARA-structured, git-backed. The only long-term memory store. (Not: "memory store", "journal", "second brain dir".)
- **adapter** — per-harness compile target logic (`src/adapters/claude.js`, `codex.js`) run by `wienerdog sync`.
- **managed block** — the sentinel-delimited region (`<!-- wienerdog:begin/end -->`) Wienerdog owns inside the user's CLAUDE.md/AGENTS.md. Wienerdog never edits outside it.
- **digest** — the pre-rendered session context file `~/.wienerdog/state/digest.md` (identity + active context + latest daily log). It reaches a session **by reference where the harness supports one** and by copy otherwise (ADR-0039): Claude Code's managed block carries a memory import of the digest's absolute path, so the content follows the file and `CLAUDE.md`'s own bytes change only at an attended `wienerdog sync`; Codex, which has no include syntax, gets the **stable digest** copied into its block and no volatile digest at all unless its hooks are trusted. (Not: "summary", "briefing".)
- **stable digest** — the half of the digest that is safe to copy into a file the user owns: the injected identity notes, which have already passed ADR-0021's exact-byte human-ratification gate. It cannot go stale, because ADR-0021 already freezes it to the last attended `sync` or `wienerdog memory approve`. (Not: "static digest", "identity block".)
- **volatile digest** — the half of the digest that changes between attended syncs and is therefore never copied into a user-owned file: the latest daily log (ADR-0032, untrusted-fenced), `## Active projects`, and the alert / quarantine / scheduler / update / insecure-mode banners. Delivered by reference on Claude Code; **absent**, not stale, on a hook-less Codex or Cowork session (ADR-0039, documented asymmetry). (Not: "dynamic digest", "live digest".)
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
- **fail-loud** — no silent failures: alert email (`gws _alert`) or a banner line in the digest. **Which legs are actually available depends on the stage that failed** (ADR-0039). A `run-job`-stage failure has both. A **launcher**-stage refusal has neither by construction: the launcher requires no code from the app tree it is verifying, so it cannot call `renderDigest`, and the email leg spawns the CLI shim, which is itself unusable when `app/current` is what failed. That stage fails loud through the **refusal banner** instead.
- **refusal banner** — the code-owned, fixed-text file `~/.wienerdog/state/refusal-banner.md` that the **independent launcher** writes when it refuses to run a job, so a launcher-stage refusal has a delivery channel that does not depend on the app tree, the CLI shim, or the job that failed (ADR-0039). The SessionStart hook prepends it and `renderDigest` folds it into the banner prefix. It clears on job success **and** on a successful attended `wienerdog sync` — both are required, because `clearAlerts` fires only for real job names and `--catch-up` is a pseudo-job that never reports success. (Not: "refusal alert" — that is the `alerts.jsonl` record; the banner is how it gets seen.)
- **acknowledged alert** — a durable alert (one record in `~/.wienerdog/state/alerts.jsonl`) that the user has silenced **in the session digest only**, by running `wienerdog alerts ack` at a real terminal with a typed confirmation. It is keyed on the exact `(job, reason)` pair, so a change in the failure wording surfaces it again (the wording it compares is the one Wienerdog stored — already shortened to 2,000 characters, with secret-looking text blanked out — so two failures that differ only past that length, or only in the blanked-out parts, count as the same wording). It changes nothing else: the job still refuses, still exits non-zero, still spawns nothing, and still writes its record; `wienerdog alerts` always lists acknowledged alerts. Acknowledgements for a job are dropped when that job next succeeds. (Not: "dismissed", "muted", "snoozed" — say acknowledged alert.)
- **catch-up** — running jobs missed while the machine was off (login-triggered check on macOS; native on systemd/Task Scheduler).
- **job descriptor** — the code-owned, deterministic record of exactly what a scheduled job is authorized to run. Digest-covered field set (the authoritative WP-156 schema): `run` action, capability profile (`profileId`), prompt/skill content hash (`promptHash`), configured `model`, the inner dream/lock timeout (`timeoutMs`), the outer run-job watchdog timeout (`outerTimeoutMs`), the corpus size cap (`maxInputBytes`), the effective vault layout (`vaultLayout`), the vault root (`vaultRoot`), the bound authorized home directory (`home`), the job's `schedule` (`at` + `timezone`), the running `node` path, the executable identities (`exec`: claude + git required, codex optional — the executable pins), and the app release digest (`appRelease`: `version`, `treeDigest`, `stance`). Written at schedule/sync and re-derivable from live inputs to detect drift (A7, WP-156). **Dev reduction:** on a **dev**-stance install the digest reduces `appRelease` to `{stance, root}` — excluding only `treeDigest` and `version` (a tracked-source edit is expected there) — every other field, including `schedule`/`home`/`node`, is still digest-covered, so a `config.yaml`, schedule, or home edit still drifts and refuses on a dev machine too. (Not: "job spec", "job config".)
- **descriptor digest** — the `sha256` of the canonicalized job descriptor, bound into the OS scheduler entry as the independent anchor a scoped `config.yaml`/app rewrite cannot change; the launcher re-derives it at fire time and refuses on any mismatch (A7, WP-156/157).
- **app release digest** — the content address (`sha256` over the sorted per-file hashes) of the vendored `app/current` tree, recorded in the job descriptor and re-verified at fire time so any byte change under `app/current` is detected. (Not: "app hash", "tree checksum" — say app release digest.)
- **independent launcher** — the minimal Node launcher at `<core>/launcher/launch.js`, **outside** the mutable `app/current` tree, that the OS scheduler invokes; it verifies `current` containment + ownership, the app release digest, the descriptor digest against the entry-bound value, and the production/dev stance before spawning `run-job`. Not a daemon (ADR-0004) — it runs and exits with each fire (A7, WP-157). (Not a "sandbox" — that word means the `WIENERDOG_HOME` redirect guard.)
- **executable pin** — the recorded structural identity (stable command path + install dir; `version` is informational only, no content hash) of `claude`/`git`/`codex`, captured at install/sync. The nightly job spawns the live verified absolute path and fails safe on command-path/install-dir drift; a same-dir auto-update passes silently, an install-method change fails safe until re-pinned (A7, WP-154).
- **production/dev stance** — whether an install runs the vendored `app/<version>` (**prod**, integrity-enforced) or a dev checkout (**dev**, mutable-by-design). The stance is decided by **containment**: an install is **dev** only when `<core>/app/current` resolves *outside* `<core>/app`; every other case — including a `.git` planted inside the app tree, an environment variable, or an unresolvable path — is **prod**. **Data written into the app tree cannot move an install between the two stances.** When the installer is the very tree it is re-vendoring, nothing inside that tree chooses where `current` ends up: an attended `wienerdog sync` either leaves `current` exactly where it already pointed, **or** — if that tree's `package.json` carries something that is not a plain version number — **stops with a tamper message and changes nothing at all**. (Nothing the installer reads out of that tree feeds that decision. It does still read the tree's `package.json` version — that is the version number it reports back to you — and that value is checked, so a tampered one stops the sync rather than steering it.) **Code written into the app tree is a different matter and is not covered**: the installer runs out of that tree, so a replaced source file executes at the next attended `wienerdog sync` and *can* move the stance. What covers that is the **app release digest**, and only **until** that sync — every scheduled run *before* it refuses, because the tree no longer matches the descriptor; a run *after* it need not. The launcher re-observes containment at fire time and refuses whenever it disagrees with the stance bound into the job descriptor, in either direction. Converting a dev install back to prod is an attended act, and what makes it work is a property rather than one particular command: you must run the installer **from a non-dev source root** — a copy of Wienerdog that is **not** a git checkout and is **not** the tree this install already runs from. On POSIX systems (executed on macOS), two commands are known to satisfy that: `npx wienerdog@latest sync`, and a `wienerdog update` that installs a newer version. A plain `git clone` is **not** one of them: the installer links a checkout in place, so the install stays dev. (On Windows the same property applies; the exact commands are not documented yet.) (A7, WP-157, WP-stance-authority-containment).
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
  capabilities are cleared for use (`src/core/safety-profile.js`). A capability
  stays blocked until a reviewed release opens its gate; there is no
  runtime/env/flag override. All five gates were opened in 0.10.0. Inspect it
  with `wienerdog safety`. (Not a "sandbox" — that word means the unrelated
  `WIENERDOG_HOME` redirect guard.)
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
- **workspace** — the directory one dream run writes into: built fresh under
  `~/.wienerdog/state/`, filled with a copy of the vault's readable content, and
  removed when the run ends. It is meant to be the brain's only write root, so
  the vault is never what it edits — the pipeline is switched over to it in a
  follow-on work package, and until then the dream still writes the vault
  directly. Copying the content in is also what makes the run's *baseline* — the
  exact bytes present before the brain started — something Wienerdog knows
  because it wrote them, rather than something it has to observe afterwards.
  (Not: "sandbox" — that word means the `WIENERDOG_HOME`-redirect guard; not
  "staging directory" — that is the empty working directory a job RUNS from; not
  "scratch", "shadow vault", "mirror".)
- **vault write** — the one call this family's code goes through to put a
  content file into the vault. Three writers use it and no others: each promoted
  note; the dream report (whose body the brain authors and to which code appends
  its accounting section, so that one is two calls); and the vault warnings file
  (`reports/warnings.md`), which code writes whole from the transcript
  quarantine ledger. Git's writes to the
  vault's own `.git` directory are not content files and are not vault writes.
  It decides on the object the write would actually LAND on rather than on the
  path it was handed: the destination is resolved first — a directory that is
  really a symlink elsewhere resolves to where it points — and THAT is what the
  caller's policy judges. It refuses to write onto or through a symlink it can
  see, publishes so that a reader of the target never catches a half-written
  file, abandons the write when the target no longer holds the bytes the
  decision was made against, and returns the exact bytes it published so nothing
  downstream re-reads the path to learn what landed. It carries no rules of its
  own — which destinations are allowed belongs to the caller. Staying inside the
  vault is required of every write and admits none of them by itself. (Not:
  "publish", "atomic write", "safe write".)
- **promotion** — the decision that takes a note the dream wrote in the
  *workspace* and puts it into the vault, and the act of putting it there. One
  outcome per changed path: the note is promoted as the dream wrote it; a
  merged version of it is promoted (when you edited the same note during the
  run and the two edits combine cleanly); a scrubbed version is promoted, with
  the unredacted original kept aside for you (when the secret scan found
  something it can remove line by line); or it is refused and the reason is
  reported. Promotion never deletes a note and never overwrites a version you
  wrote — where the two disagree and cannot be combined, your copy stays and
  the dream's is refused. A note reaches the vault only by being *admitted*:
  promotion allows content files in the vault's writable folders rather than
  blocking a list of known-bad names, which is why the dream cannot leave a
  file behind that steers a later session. Every promoted byte goes through a
  *vault write*. The skill-body, Tier-3 and ledger gates judge the bytes that
  would actually land, not an earlier draft of them; the secret scan judges
  what the dream itself wrote, before your edits are merged in. (Not: "gating
  in", "write-back", "publishing a note", "sync" — say promotion.)
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
  severity, count}`) — a finding never stores the matched secret bytes. The
  labelled format rules all emit `quarantine` severity. Behind them sits a
  two-tier entropy pass: a long enough run drawn from the narrow alphabet, at
  or above the entropy floor, is `redact` and needs no context at all; the same
  run widened to include `/` is `quarantine` only when a sensitive keyword
  binds to it through a separator on the same line. Both tiers write the same
  `[REDACTED:high-entropy]` token. The two *persistence* gates read severity
  differently. The staged-output gate (EP2) branches on it through
  `hasHardFinding`: any `quarantine` finding still withholds and reverts the
  whole note, while a findings set with no `quarantine` finding is redacted in
  place — the unredacted original is preserved first, then only the lines that
  run added are replaced with their sanitized form, and the note is committed.
  The digest-section gate (EP4) is unchanged and still omits a section on any
  finding of either severity. The input and log/alert paths still use
  `redactOnly` (inline redaction of every match).
  (Not: "filter", "scrubber", "DLP".)
- **secret quarantine** — where the staged-output gate puts the user's own
  bytes, in two places. `state/quarantine/` holds a **withheld** note — one the
  gate would not commit at all — kept for as long as the owner leaves it there,
  and announced by a digest banner. `state/quarantine/redacted/` holds the
  pre-scrub original of a note **whose added lines the gate rewrote**: no
  banner, a bounded number of the most recent copies, and disposable —
  `wienerdog uninstall` removes it with everything else Wienerdog keeps. Both
  are 0700 dirs holding 0600 files with the raw bytes intact, outside the vault
  and never committed. A digest section with a finding is omitted rather than
  injected redacted. See `docs/runbooks/secret-incident.md` for recovery.
- **routine catalog** — the opt-in post-setup menu of ready-made routines (`/wienerdog-routines`); nothing is scheduled by default (ADR-0008).
- **interview** — the `/wienerdog-setup` conversation that produces `06-Identity/` notes, from which CLAUDE.md/AGENTS.md managed blocks are rendered.
- **memory_mode** — user preset for gate strictness: conservative | standard | eager.
- **work package (WP)** — one self-contained implementation spec in `docs/specs/`, sized for one implementer session, one PR.
- **slug** — the kebab-case identity of a work package (`WP-<slug>`), chosen at draft time, globally unique across `docs/specs/` and `done/` (lint-enforced), never renumbered (ADR-0029). Legacy numeric ids (`WP-042`) are valid slugs.
- **epic** — optional kebab-case frontmatter label grouping related WPs into a stream (e.g. `audit-a7`). The only grouping field on a spec; WPs carry no milestone.
- **logbook** — dated narrative entries in `docs/specs/logbook/` (`YYYY-MM-DD-<slug>.md`, `related_wps:` frontmatter): incident retros and chain rationale. One file per entry so parallel writers never conflict.
- **One-Document Rule** — a mid-tier model must be able to ship a WP reading only that spec + CLAUDE.md.
- **implementer** — a fresh harness session pointed at one Ready WP spec. Not a named agent (ADR-0005).
