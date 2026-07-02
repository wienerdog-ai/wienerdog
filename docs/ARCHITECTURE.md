# Wienerdog — Architecture

Status: v1 baseline (2026-07-02). Facts verified July 2026; wd-researcher re-verifies platform claims before each milestone that depends on them.

**Wienerdog is a compiler plus a set of prompts, not an application.** The only executables are a thin CLI (`wienerdog`), short-lived hook scripts, and scheduled jobs whose "brain" is `claude -p` / `codex exec`. Target: < ~4k LOC of plain Node (≥18), zero runtime dependencies except `googleapis`, JSDoc types, no build step.

## System map

```
                    ┌──────────────────────────────────────────────┐
                    │  npx wienerdog  (installer / thin CLI)       │
                    │  install · sync · doctor · dream · schedule  │
                    │  run-job · gws · uninstall                   │
                    └──────────────┬───────────────────────────────┘
                                   │ writes (manifest-tracked)
   ┌───────────────────────────────▼───────────────────────────────┐
   │            CANONICAL CORE   ~/.wienerdog/                     │
   │  config.yaml        vault path, harnesses, jobs, gates        │
   │  skills/            vendor-neutral SKILL.md folders           │
   │  prompts/           interview, dreaming, digest prompts       │
   │  bin/               self-contained hook & job scripts         │
   │  state/             watermarks, capture queue, locks, digest  │
   │  secrets/           Google OAuth tokens (0600, never in git)  │
   │  logs/                                                        │
   │  install-manifest.json  every file/entry Wienerdog touched    │
   └───────┬───────────────────────────────────┬───────────────────┘
           │  `wienerdog sync` compiles         │
┌──────────▼──────────┐              ┌──────────▼──────────┐
│  CLAUDE ADAPTER     │              │  CODEX ADAPTER      │
│  ~/.claude/         │              │  ~/.codex/          │
│  CLAUDE.md managed  │              │  AGENTS.md managed  │
│    block            │              │    block            │
│  settings.json      │              │  config.toml        │
│    hooks (enrich)   │              │    [skills]         │
│  skills/wienerdog-* │              │  hooks.json (enrich)│
└──────────┬──────────┘              └──────────┬──────────┘
           │ sessions produce                    │
~/.claude/projects/**/*.jsonl     ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
           └────────────────┬────────────────────┘
                            │ scanned since watermark (hooks only enqueue hints)
             ┌──────────────▼──────────────┐
             │  DREAMING JOB (nightly)     │
             │  orchestrator: code         │
             │  brain: claude -p /         │
             │  codex exec + dream skill,  │
             │  tool-restricted            │
             └──────────────┬──────────────┘
                            │ gated writes, ONE git commit per run
             ┌──────────────▼──────────────┐
             │  MEMORY VAULT  ~/wienerdog/ │
             │  PARA · atomic notes ·      │
             │  wikilinks · git            │
             └──────────────┬──────────────┘
                            │ pre-rendered digest injected at SessionStart
                            ▼
              next Claude Code / Codex session

  OS SCHEDULER (launchd / systemd user timer / Task Scheduler)
    └─> wienerdog run-job <name>   (clean env, TCC-guard, watchdog,
        logs, catch-up, fail-loud) ──> claude -p / codex exec + skill
        └─> wienerdog gws  (Gmail/Calendar/Drive, read-first/draft-only)
```

## Module responsibilities

| Module | Responsibility | Executable? |
|---|---|---|
| Installer (`npx wienerdog`) | Bootstrap: detect harnesses, create core + vault, run `sync`, print next step | Once |
| Canonical core | Single source of truth for config, skills, prompts, machine state | No (files) |
| Adapters (`sync`) | Idempotent compile of core → per-harness files via managed sentinel blocks | On change |
| Interview | `/wienerdog-setup` skill — the user's own model conducts it | No (prompt) |
| Memory vault | PARA markdown + git; the only long-term memory store | No (files) |
| Capture | SessionStart digest injection + SessionEnd enqueue (enrichment); transcript scanner is ground truth | Tiny scripts |
| Dreaming | Orchestrator (lock/scan/redact/validate/commit) + dream skill (the intelligence) | Short-lived job |
| Google (`gws`) | Thin CLI over googleapis; skills teach the model the commands | On demand |
| Scheduler | Generates OS-native schedule entries; `run-job` adds watchdog/logs/alerts/catch-up | Short-lived job |

## Canonical core and adapters

User knowledge lives **in the vault** (vendor-neutral markdown by nature); `~/.wienerdog/` holds only mechanics. Identity/preferences are vault notes (`06-Identity/profile.md`, `preferences.md`, `goals.md`, `instructions.md` — the interview's main output). **CLAUDE.md / AGENTS.md content is a build artifact** rendered from these sources.

`wienerdog sync` compiles, idempotently (second run = zero diff), manifest-tracked:

| Canonical | → Claude Code | → Codex CLI |
|---|---|---|
| Identity digest | Managed block in `~/.claude/CLAUDE.md` between `<!-- wienerdog:begin -->` / `<!-- wienerdog:end -->` | Same block in `~/.codex/AGENTS.md` |
| Skills (SKILL.md folders — both harnesses natively support this format) | Symlink into `~/.claude/skills/wienerdog-*` (copy on Windows) | `[skills]` entries in `config.toml` |
| Capture hooks (optional enrichment) | `settings.json`: SessionStart → inject digest; SessionEnd → enqueue | `hooks.json`: SessionStart / Stop command hooks; AGENTS.md-block digest as fallback (≤24h stale) |
| Session digest | Pre-rendered `~/.wienerdog/state/digest.md` — refreshed by every dream run and by `sync`; the SessionStart hook only cats it (<200ms, no computation) | Same file |

Wienerdog never owns the user's CLAUDE.md/AGENTS.md — it owns one clearly marked region. `uninstall` removes exactly that region. Edits inside sentinels are overwritten by `sync` (documented); edits outside are never touched.

**GUI-readiness (v2):** everything a GUI needs is already on disk in parseable form — `config.yaml`, vault markdown with frontmatter, `state/*.json`, git history, dream reports. A v2 GUI is a local on-demand reader/editor of these files. There is no in-memory state anywhere, so no v1 decision blocks it.

## Memory vault

**Default location `~/wienerdog/`** — visible (Obsidian's "Open folder as vault" works; it's the user's second brain, not internal state) and TCC-safe (macOS TCC protects Desktop/Documents/Downloads/iCloud; `$HOME` root is not protected, so unattended launchd jobs can read/write it — the claude-os 4-hour-hang lesson).

```
~/wienerdog/
├── CLAUDE.md / AGENTS.md      # vault-local conventions: how to write memory here
├── 00-Inbox/                  # capture staging, pre-dream
├── 01-Projects/<name>/_MOC.md
├── 02-Areas/
├── 03-Resources/
├── 04-Archive/
├── 05-Skills/                 # dream-synthesized SKILL.md folders (git-versioned)
├── 06-Identity/               # profile, preferences, goals, instructions (interview output)
├── 07-Daily/YYYY-MM-DD.md
├── reports/dreams/YYYY-MM-DD.md
└── .git/                      # local repo; remote optional; secrets never here
```

Note frontmatter schema (provenance fields **mandatory on every auto-write**):

```yaml
---
id: 2026-07-02-example-slug
type: note | daily | moc | skill | identity
created: 2026-07-02
updated: 2026-07-02
tags: []
status: active | incubating | archived
origin: interview | capture | dream | manual
source_sessions: ["claude:<uuid>", "codex:rollout-<ts>"]
confidence: 0.86
recurrence: 3
derived_from_untrusted: false   # true if content originated in tool results (email/web)
---
```

**Existing-vault adoption:** the interview asks; if yes, Wienerdog uses it in place (structure mapping confirmed during interview). If that vault is in a TCC/iCloud path, `doctor` warns and recommends moving to `~/wienerdog` (Obsidian re-pointed at the new path); users who decline get degraded mode — dream writes land in `~/wienerdog-staging/` and the dream report tells them to run `wienerdog sync --merge-staging` from an interactive terminal. Assisted migration command: v1.1.

## Capture and dreaming

**Ground truth is transcripts, not hooks.** The dream orchestrator scans `~/.claude/projects/**/*.jsonl` and `~/.codex/sessions/**/rollout-*.jsonl` for files modified since the per-harness watermark (`state/watermarks.json`). A Codex-only user with zero hooks gets full capture. Hooks enrich: SessionStart injects the pre-rendered digest; SessionEnd/Stop appends `{harness, session_path, cwd, ts}` to `state/queue.jsonl`. Explicit "remember this" → the memory skill writes straight to `00-Inbox/` (user-initiated, provenance frontmatter, no gate).

**Dreaming** (default 03:30 local, via `wienerdog run-job dream`):

1. **Orchestrator, code**: acquire `state/dream.lock`; collect transcripts since watermark; redact secret-looking strings (regex pass); write normalized per-session extracts to scratch, capped in size (chunk-and-summarize for huge sessions).
2. **Brain, prompt**: run the `wienerdog-dream` skill headlessly on the user's harness (config picks if both; default Claude), **tool-restricted: read scratch+vault, write vault only, no Bash, no network** (Claude: allowed-tools/permission settings; Codex: `codex exec` sandbox `workspace-write` rooted at the vault).
3. **Three phases in the skill**: *ingest* (extract candidates per session, dedupe against vault) → *rank* (importance, cross-session recurrence, novelty, stability, actionability, explicit user signal) → *consolidate* (apply gates, write).
4. **Tiered gates** (config-tunable; preset dial `memory_mode: conservative|standard|eager` chosen in interview, default standard):
   - **Tier 1 — daily log** (`07-Daily/`): score ≥ 0.5, single session OK.
   - **Tier 2 — atomic notes / project MOCs**: score ≥ 0.75.
   - **Tier 3 — identity, preferences, skills, anything feeding the injected digest**: score ≥ 0.85 **AND** recurrence ≥ 3 distinct sessions **AND** `derived_from_untrusted: false`. Candidates supported only by tool-result content (email bodies, web pages) can never reach Tier 3 — the core anti-persistent-injection gate.
5. **Skill synthesis** (procedural memory): a multi-step procedure repeated successfully in ≥3 sessions → draft `SKILL.md` in `05-Skills/` with `status: incubating`; promoted to `active` by a later dream that observes successful use. Shipped Wienerdog skills are never edited in place — improvement proposals go in the dream report.
6. **Validate & commit, code**: the orchestrator diffs the vault; any change outside it, or to `06-Identity/`/`05-Skills/` lacking Tier-3-satisfying frontmatter, is reverted and flagged in the report. Then: write `reports/dreams/YYYY-MM-DD.md` (what was learned, what was gated out and why, skill changes), **exactly one git commit**, regenerate `state/digest.md`, advance watermarks, release lock.
7. **Watchdog**: hard timeout (default 20 min) kills the run, logs, fail-loud alerts.

Machine state (watermarks, queue, score cache) lives in `~/.wienerdog/state/`, never in the vault.

## Google Workspace (`wienerdog gws`)

Own thin CLI over `googleapis` (~600 LOC). Alternatives rejected: no maintained end-user Gmail+Calendar+Drive CLI exists (GAM is admin-oriented, gcalcli calendar-only, gmailctl filters-only); MCP costs permanent per-session context and has weak headless ergonomics.

Command surface, **governance enforced in the CLI, not in prompts**: `gmail search|read|draft` (no send verb exists), `cal list|show|draft-event` (private visibility, "DRAFT:" prefix, or ICS output — no invites sent), `drive search|read`. Sole exception: `gws _alert` — fixed-template mail to the user's own address, for watchdog fail-loud.

**OAuth**: guided per-user OAuth client (a shared client with Gmail scopes requires Google's restricted-scope security assessment — not viable for a young OSS project; test-mode sharing caps at 100 users with 7-day token expiry). The `/wienerdog-google-setup` skill walks the user through Cloud Console (project → APIs → consent → Desktop client → paste JSON), then `wienerdog gws auth` runs the localhost loopback flow (temporary port during auth only). Scopes: `gmail.readonly`, `gmail.compose`, `calendar`, `drive.readonly`. Tokens: `~/.wienerdog/secrets/google-token.json`, `chmod 600`, outside vault/git — deliberately file-based, not OS keyring (keyring env-var footgun + launchd/Keychain pain; documented trade-off in the threat model).

## Scheduler (no daemon, ever)

`wienerdog schedule add <name> --at 07:00 --skill <skill>` generates OS-native entries that all invoke `wienerdog run-job <name>` — a short-lived process.

- **macOS**: `~/Library/LaunchAgents/ai.wienerdog.<name>.plist`, `StartCalendarInterval` (missed-while-asleep runs on wake natively). Missed-while-powered-off: one `RunAtLoad` plist (`ai.wienerdog.catchup`) runs `wienerdog run-job --catch-up` at login, comparing each job's `last_success` to its schedule — anacron behavior as a login-triggered check, not polling.
- **Linux**: systemd user units, `.timer` with `Persistent=true` (native catch-up) + oneshot `.service`; installer sets `loginctl enable-linger` with consent. Non-systemd fallback: crontab + `@reboot` catch-up.
- **Windows**: `schtasks` XML with `StartWhenAvailable=true` (native catch-up).

`run-job` responsibilities (claude-os L5/L6 lessons codified): build a clean env explicitly (launchd inherits almost nothing — PATH to node/claude/codex, HOME); **TCC-guard** — refuse to start if the job references TCC-protected paths; watchdog hard timeout (kill after limit); tee output to `~/.wienerdog/logs/<name>/` with rotation; on failure/timeout **fail loud** — `gws _alert` email if configured, else OS notification + red banner line in `state/digest.md` so the next session surfaces it; record `last_success`.

## Repo layout

```
wienerdog/
├── CLAUDE.md · AGENTS.md (generated) · README · LICENSE(MIT) · CONTRIBUTING · SECURITY
├── package.json · bin/wienerdog.js
├── src/        # cli/ adapters/(claude,codex) core/(config,vault,git,manifest,transcripts) gws/ scheduler/
├── skills/     # vendor-neutral SKILL.md folders: setup, memory, dream, google-setup, daily-digest
├── templates/  # vault skeleton, managed-block templates, hook scripts, scheduling templates
├── docs/       # this file + VISION, PRD, THREAT-MODEL, GLOSSARY, adr/, specs/, runbooks/, marketing/
├── memory/     # dogfood vault (transcripts gitignored)
├── tests/      # unit + golden/ + bats + scenarios/ + schemas/
├── .claude/    # agents/(wd-*) skills/(spec-new, wp-verify, dream) settings.json
└── .github/    # ci, scenarios(nightly), release, smoke(weekly), issue/PR templates
```

## Platform facts this design rests on (verified 2026-07)

1. Claude Code transcripts: JSONL per session at `~/.claude/projects/<sanitized-cwd>/<session-uuid>.jsonl`; hooks incl. SessionStart/SessionEnd/UserPromptSubmit/Stop registered in settings.json.
2. Codex CLI: rollout JSONL at `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` (`$CODEX_HOME`-relative); supports AGENTS.md, SKILL.md skills via `[skills]` in config.toml, command hooks in hooks.json, `codex exec` headless.
3. launchd `StartCalendarInterval` fires missed jobs on wake but NOT after power-off (hence the login catch-up); systemd `Persistent=true` and Task Scheduler `StartWhenAvailable` catch up natively.
4. npm `wienerdog` free; GitHub user `wienerdog` taken → org `wienerdog-ai`.
